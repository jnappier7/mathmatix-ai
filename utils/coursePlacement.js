/**
 * COURSE PLACEMENT — what a student already owns closes modules and moves the bar.
 *
 * Every course opens with a placement (a practice test, the Starting Point, or
 * the course's own quick check). Until 2026-11 only the SKILLS came out of it:
 * a credited skill was marked mastered on the student, and the tutor was told
 * to spot-check it — but no module was ever closed. A student who cleared
 * half a course still saw "0 of 15 modules · 0%" and was walked through every
 * unit in order. The check promised "this course can skip what you already
 * know"; nothing skipped.
 *
 * This is the missing half. Given a course session and the set of course
 * skills the student owns, it closes the modules they have no reason to sit:
 *
 *   • a module with skills is closed when the student owns EVERY one of them;
 *   • a checkpoint is closed only when every module before it is done (and the
 *     student owns any skills it lists) — it tests those modules, so it goes
 *     when they go;
 *   • the LAST module is never closed by placement. A course never completes
 *     itself on a pre-test; the final assessment is always sat.
 *
 * It only ever closes modules the student has not started (never touches one
 * in progress or already completed), and it only ever moves the course
 * FORWARD. Run it as often as you like — after the quick check, after a
 * Starting Point, at enrollment for a student who already owns skills — it is
 * idempotent.
 *
 * Pure: a session, a pathway and a set of owned skill ids in; the same session
 * mutated and a summary out. No DB, no HTTP.
 */

const { canonicalSkillId, skillLookupCandidates } = require('./skillCanonicalizer');
const { getSkillMasteryEntry } = require('./masteryGuard');
const { clearsPrerequisites } = require('./skillRung');

/**
 * Does the student own this skill? The ladder's own definition — the same one
 * the Starting Point and the challenge path use to clear prerequisites
 * (skillRung.clearsPrerequisites: proved or taught, however it was proved).
 * One rule for "owned", so a placement and a course can never disagree.
 */
function isOwnedEntry(entry) {
  return !!entry && clearsPrerequisites(entry);
}

/**
 * The course skills (canonical ids) this student owns, read from skillMastery.
 * The mastery map predates the unified taxonomy, so each course skill is looked
 * up under every id it might be stored as.
 */
function ownedCourseSkills(user, pathway) {
  const owned = new Set();
  if (!user) return owned;
  for (const m of (pathway && pathway.modules) || []) {
    for (const raw of m.skills || []) {
      if (!raw) continue;
      const canon = canonicalSkillId(raw);
      if (owned.has(canon)) continue;
      const ids = skillLookupCandidates(raw);
      if (ids.some((id) => isOwnedEntry(getSkillMasteryEntry(user, id)))) owned.add(canon);
    }
  }
  return owned;
}

/**
 * Close what the student owns and aim the course at what is left.
 *
 * @param {object} session  CourseSession (document or plain object) — MUTATED
 * @param {object} pathway  the course's pathway JSON
 * @param {Iterable<string>} ownedSkillIds  canonical course skill ids
 * @returns {{ closed: Array<{moduleId:string,title:string}>, start: object|null,
 *             moved: boolean, modulesLeft: number }}
 */
function applyPlacement(session, pathway, ownedSkillIds) {
  const owned = new Set(Array.from(ownedSkillIds || [], canonicalSkillId));
  const pathwayModules = (pathway && pathway.modules) || [];
  const byId = new Map(pathwayModules.map((m) => [m.moduleId, m]));
  const modules = (session && session.modules) || [];
  const closed = [];
  const last = modules.length - 1;

  // A session with no module list (very old, or hand-made) has nothing to
  // close — but the course can still be aimed at the first module with a gap.
  if (!modules.length) {
    const { recommendedStart } = require('./coursePreAssessment');
    const start = recommendedStart(pathway, Array.from(owned));
    const moved = !!(start && start.moduleId && session && session.currentModuleId !== start.moduleId);
    if (moved) session.currentModuleId = start.moduleId;
    return { closed, start, moved, modulesLeft: pathwayModules.length };
  }

  let allBeforeDone = true;
  modules.forEach((mod, i) => {
    if (mod.status === 'completed') return;
    const untouched = mod.status !== 'in_progress' && !(mod.scaffoldProgress > 0);
    const skills = ((byId.get(mod.moduleId) || {}).skills || []).filter(Boolean).map(canonicalSkillId);
    // A checkpoint tests the modules before it, so it only goes when they have
    // all gone — whether or not it lists skills of its own. (One that does list
    // them shares them with its unit: without this rule it closed while the
    // unit it tests was still in progress.)
    const pm = byId.get(mod.moduleId) || {};
    const isCheckpoint = !!pm.isCheckpoint || (!skills.length && i > 0);
    const ownsSkills = skills.every((id) => owned.has(id));   // vacuously true with none
    const ownsIt = isCheckpoint ? (allBeforeDone && ownsSkills) : (skills.length > 0 && ownsSkills);
    if (untouched && ownsIt && i !== last) {
      mod.status = 'completed';
      mod.scaffoldProgress = 100;
      mod.placedOut = true;
      mod.completedAt = new Date();
      closed.push({ moduleId: mod.moduleId, title: mod.title || (byId.get(mod.moduleId) || {}).title || mod.moduleId });
      return;
    }
    allBeforeDone = false;
  });

  // Aim the course at the first module still open. Only ever forward: if the
  // student is mid-module somewhere, that is where they stay.
  const first = modules.find((m) => m.status !== 'completed') || null;
  const current = modules.find((m) => m.moduleId === session.currentModuleId) || null;
  let moved = false;
  if (first && (!current || current.status === 'completed')) {
    if (first.status === 'locked') first.status = 'available';
    if (session.currentModuleId !== first.moduleId) {
      session.currentModuleId = first.moduleId;
      session.currentScaffoldIndex = 0;
      const lesson = (first.lessons || [])[0];
      session.currentLessonId = lesson ? lesson.lessonId : null;
      if (lesson && lesson.status === 'locked') lesson.status = 'available';
      moved = true;
    }
  }

  if (closed.length) {
    // Lazy: coursePrompt is heavy and this file is otherwise dependency-light.
    const { calculateOverallProgress } = require('./coursePrompt');
    session.overallProgress = calculateOverallProgress(modules);
    if (!(session.progressFloorPct >= session.overallProgress)) {
      session.progressFloorPct = session.overallProgress;
    }
    if (typeof session.markModified === 'function') session.markModified('modules');
  }

  const start = first
    ? { moduleId: first.moduleId, title: first.title || (byId.get(first.moduleId) || {}).title || first.moduleId,
        index: modules.indexOf(first) }
    : null;
  return {
    closed,
    start,
    moved,
    modulesLeft: modules.filter((m) => m.status !== 'completed').length,
  };
}

/** One sentence for the student about what placement just did. */
function placementMessage(result, creditedCount) {
  const n = result.closed.length;
  const left = result.modulesLeft;
  const where = result.start ? ` You start at ${result.start.title}.` : '';
  if (n > 0) {
    return `You already own ${n} module${n === 1 ? '' : 's'} of this course, so ${n === 1 ? 'it is' : 'they are'} `
      + `marked done — ${left} left.${where}`;
  }
  if (creditedCount > 0) {
    return `You showed ${creditedCount} skill${creditedCount === 1 ? '' : 's'} you already own. Your tutor will `
      + `spot-check ${creditedCount === 1 ? 'it' : 'those'} instead of re-teaching, and the course moves faster there.${where}`;
  }
  return `Nothing cleared this time, so the course starts from the beginning.${where}`;
}

module.exports = { isOwnedEntry, ownedCourseSkills, applyPlacement, placementMessage };
