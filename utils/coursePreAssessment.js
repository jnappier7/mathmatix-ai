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
  scoreBySkill,
  recommendedStart
};
