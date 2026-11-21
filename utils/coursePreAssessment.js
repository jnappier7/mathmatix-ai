/**
 * COURSE PRE-ASSESSMENT — every course opens by finding out what you already know.
 *
 * A course is prep and readiness, not the whole curriculum. So the first thing it
 * should do is establish which of its skills the student already owns, clear
 * those, and aim the course at what is actually left. Without this a course
 * teaches its syllabus at everyone identically — which is how a student ends up
 * being walked through absolute value they demonstrably knew.
 *
 * The output is not just a placement number. Each skill the student demonstrates
 * is proved at rung 2 (provenBy 'placement'), which cascades to clear its
 * prerequisites — so one good pre-assessment can retire a large part of a course
 * before the student sits a single lesson.
 *
 * Pure: a pathway document and graded results in, a blueprint and verdicts out.
 * No DB, no HTTP.
 */

const { canonicalSkillId } = require('./skillCanonicalizer');

// Enough items per skill to mean something, few enough that a pre-assessment
// stays a warm-up rather than an exam. A student who blanks the whole thing has
// lost minutes, not a session.
const ITEMS_PER_SKILL = 2;
const MAX_ITEMS = 20;

// A skill is only credited when the student gets essentially all of its items
// right. A pre-assessment SKIPS content — crediting it on a coin flip teaches
// nothing and removes the lesson that would have caught it.
const CREDIT_ACCURACY = 1.0;

/**
 * Every skill a course covers, canonicalized and de-duplicated, in module order.
 * Module order matters: it is the course's own sequence, so an early miss tells
 * you where the course should actually start.
 */
function courseSkills(pathway) {
  const out = [];
  const seen = new Set();
  const modules = (pathway && pathway.modules) || [];
  modules.forEach(function (m) {
    (m.skills || []).forEach(function (raw) {
      if (!raw) return;
      const id = canonicalSkillId(raw);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ skillId: id, rawId: raw, moduleId: m.moduleId, moduleTitle: m.title });
    });
  });
  return out;
}

/**
 * Choose which skills to test.
 *
 * Only skills with enough items in the bank are testable, and a pre-assessment
 * that silently omits half a course would misreport readiness — so the caller is
 * told exactly what was covered and what was not. `available` maps skillId to a
 * problem count.
 */
function buildBlueprint(pathway, available, options) {
  const opts = options || {};
  const perSkill = opts.itemsPerSkill || ITEMS_PER_SKILL;
  const maxItems = opts.maxItems || MAX_ITEMS;

  const all = courseSkills(pathway);
  const testable = [];
  const untestable = [];

  all.forEach(function (s) {
    const count = (available && available[s.skillId]) || 0;
    if (count >= perSkill) testable.push(s);
    else untestable.push(Object.assign({}, s, { availableItems: count }));
  });

  // Spread across the course rather than exhausting module 1. A pre-assessment
  // that only samples the beginning cannot tell you a student is ready to skip
  // to the end.
  const capacity = Math.max(1, Math.floor(maxItems / perSkill));
  const chosen = spread(testable, capacity);

  return {
    itemsPerSkill: perSkill,
    skills: chosen,
    totalItems: chosen.length * perSkill,
    skippedForNoItems: untestable,
    // Honest coverage, so the UI never implies the whole course was assessed.
    coverage: all.length ? chosen.length / all.length : 0,
    totalCourseSkills: all.length
  };
}

/**
 * The NEXT STAGE of a course's quick check: every skill the student does not
 * yet own in the next open module(s), tested together.
 *
 * WHY STAGES. A module closes only when the student owns every skill in it
 * (utils/coursePlacement.js). The original check sampled ~10 skills spread
 * across the whole course, so even a perfect run owned one or two skills in
 * each module and closed none — "0 of 15 modules" after ten right answers. A
 * stage instead takes whole modules, in course order, from the first one still
 * open: get it all right and those modules are done, and the student is offered
 * the next stage. The first miss is where the course starts. Short for a
 * student who is new to the material, as long as it needs to be for one who is
 * not — and it never implies more than it tested.
 *
 * Skills the student already owns are not asked again (a checkpoint shares its
 * unit's skills; a review module shares everyone's). A module with a skill the
 * bank cannot test ends the stage: it cannot be closed by a check, so there is
 * nothing to gain by testing past it.
 *
 * @param {object} pathway
 * @param {object} state
 * @param {Iterable<string>} [state.completed]  moduleIds already done in the session
 * @param {Iterable<string>} [state.owned]      canonical course skill ids the student owns
 * @param {Object<string,number>} state.available  skillId → usable item count
 */
function buildStageBlueprint(pathway, state, options) {
  const opts = options || {};
  const perSkill = opts.itemsPerSkill || ITEMS_PER_SKILL;
  const maxItems = opts.maxItems || MAX_ITEMS;
  const capacity = Math.max(1, Math.floor(maxItems / perSkill));
  const st = state || {};
  const completed = new Set(st.completed || []);
  const owned = new Set(Array.from(st.owned || [], canonicalSkillId));
  const available = st.available || {};

  const modules = (pathway && pathway.modules) || [];
  const chosen = [];
  const taken = new Set();
  const covered = [];
  let blockedBy = null;

  // The last module is never closed by placement, so it is never tested.
  for (let i = 0; i < modules.length - 1; i += 1) {
    const m = modules[i];
    if (completed.has(m.moduleId)) continue;
    const open = [];
    (m.skills || []).forEach(function (raw) {
      if (!raw) return;
      const id = canonicalSkillId(raw);
      if (owned.has(id) || taken.has(id) || open.some(function (o) { return o.skillId === id; })) return;
      open.push({ skillId: id, rawId: raw, moduleId: m.moduleId, moduleTitle: m.title });
    });
    if (!open.length) {                      // nothing new to ask: it rides along
      if ((m.skills || []).length && !m.isCheckpoint) covered.push({ moduleId: m.moduleId, title: m.title });
      continue;
    }
    const untestable = open.filter(function (o) { return (available[o.skillId] || 0) < perSkill; });
    if (untestable.length) {
      blockedBy = { moduleId: m.moduleId, title: m.title, skills: untestable.map(function (o) { return o.skillId; }) };
      break;
    }
    const room = capacity - chosen.length;
    if (chosen.length && open.length > room) break;      // whole modules only, after the first
    open.slice(0, chosen.length ? room : capacity).forEach(function (o) {
      taken.add(o.skillId);
      chosen.push(o);
    });
    if (!m.isCheckpoint) covered.push({ moduleId: m.moduleId, title: m.title });
    if (open.length > capacity) break;                   // a module bigger than one stage: finish it next time
    if (chosen.length >= capacity) break;
  }

  const total = courseSkills(pathway).length;
  return {
    itemsPerSkill: perSkill,
    skills: chosen,
    totalItems: chosen.length * perSkill,
    modules: chosen.length ? covered : [],
    blockedBy: chosen.length ? null : blockedBy,
    coverage: total ? chosen.length / total : 0,
    totalCourseSkills: total
  };
}

/** Evenly sample `n` items across a list, always keeping the first and last. */
function spread(list, n) {
  if (list.length <= n) return list.slice();
  if (n <= 1) return list.slice(0, 1);
  const out = [];
  const step = (list.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(list[Math.round(i * step)]);
  return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

/**
 * Turn per-item results into per-skill verdicts.
 *
 * @param {Array} results [{ skillId, correct }]
 * @returns {{ credited: string[], notCredited: string[], bySkill: object }}
 */
function scoreBySkill(results, options) {
  const threshold = (options && options.creditAccuracy) || CREDIT_ACCURACY;
  const bySkill = {};

  (results || []).forEach(function (r) {
    if (!r || !r.skillId) return;
    const id = canonicalSkillId(r.skillId);
    if (!bySkill[id]) bySkill[id] = { correct: 0, total: 0 };
    bySkill[id].total += 1;
    if (r.correct) bySkill[id].correct += 1;
  });

  const credited = [];
  const notCredited = [];
  Object.keys(bySkill).forEach(function (id) {
    const s = bySkill[id];
    s.accuracy = s.total ? s.correct / s.total : 0;
    if (s.total > 0 && s.accuracy >= threshold) credited.push(id);
    else notCredited.push(id);
  });

  return { credited: credited, notCredited: notCredited, bySkill: bySkill };
}

/**
 * Where should the course actually start?
 *
 * The first module containing a skill the student did NOT demonstrate. Modules
 * before it are already owned and should not be re-taught. Returns null when the
 * student cleared everything tested — the caller decides what to say about a
 * course they may not need.
 */
/**
 * Credit skills from already-tallied results — { skillId: { correct, total } }.
 *
 * Same threshold as scoreBySkill, deliberately sharing this module so there is
 * ONE definition of "the student demonstrated this". A baseline ACT and a course
 * pre-assessment must not be able to disagree about what counts as owned.
 */
function creditFromTallies(bySkill, options) {
  const threshold = (options && options.creditAccuracy) || CREDIT_ACCURACY;
  const credited = [];
  const notCredited = [];
  Object.keys(bySkill || {}).forEach(function (rawId) {
    const t = bySkill[rawId] || {};
    const total = t.total || 0;
    const correct = t.correct || 0;
    if (total <= 0) return;
    const id = canonicalSkillId(rawId);
    if (correct / total >= threshold) credited.push(id);
    else notCredited.push(id);
  });
  return { credited: credited, notCredited: notCredited };
}

function recommendedStart(pathway, credited) {
  const creditedSet = new Set(credited || []);
  const modules = (pathway && pathway.modules) || [];
  for (let i = 0; i < modules.length; i += 1) {
    const skills = (modules[i].skills || []).map(canonicalSkillId);
    const hasGap = skills.some(function (id) { return !creditedSet.has(id); });
    if (hasGap) {
      return { moduleId: modules[i].moduleId, title: modules[i].title, index: i };
    }
  }
  return null;
}

module.exports = {
  ITEMS_PER_SKILL,
  MAX_ITEMS,
  CREDIT_ACCURACY,
  courseSkills,
  buildBlueprint,
  buildStageBlueprint,
  scoreBySkill,
  creditFromTallies,
  recommendedStart
};
