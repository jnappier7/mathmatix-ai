// utils/actBootcampPlan.js
//
// Turns a completed practice-ACT result into a priority-ranked study plan — the
// "great tutor" triage:
//   1. SKIP what they've already mastered (don't re-teach a domain they aced).
//   2. PRIORITIZE by leverage = weakness x exam-weight (a small gap in a heavily
//      tested domain beats a big gap in a lightly tested one).
//   3. RESPECT FOUNDATIONS — pick the entry point so we don't start a dependent
//      domain (e.g. Functions) while its prerequisite (Algebra) is also weak.
//
// Reuses the AP Calc bootcamp's proven priorityScore((1-accuracy) * examWeight),
// so the two bootcamps share one brain. Pure/deterministic — no DB, no LLM.

const { priorityScore } = require('./calcBootcamp');
const DEFAULT_BLUEPRINT = require('../seeds/act-math-blueprint.json');

// ACT reporting category -> act-prep pathway moduleId (public/resources/act-prep-pathway.json).
const CATEGORY_MODULE = {
  'number-quantity': 'number_quantity',
  'algebra': 'algebra',
  'functions': 'functions',
  'geometry': 'geometry',
  'statistics-probability': 'statistics_probability',
  'integrating-essential-skills': 'integrating_essential_skills',
};

// Prerequisite depth among ACT Higher-Math domains (lower = more foundational).
// Used only as a tie-break for the STARTING module, so foundations are shored up
// before the domains built on them — a dependent weak domain never jumps ahead
// of a weak prerequisite as the entry point.
const FOUNDATION_ORDER = {
  'number-quantity': 0,
  'algebra': 1,
  'integrating-essential-skills': 1,
  'functions': 2,
  'geometry': 2,
  'statistics-probability': 3,
};

// Human-readable domain labels for the greeting recap.
const CATEGORY_LABEL = {
  'number-quantity': 'Number & Quantity',
  'algebra': 'Algebra',
  'functions': 'Functions',
  'geometry': 'Geometry',
  'statistics-probability': 'Statistics & Probability',
  'integrating-essential-skills': 'Essential Skills',
};

const MASTERED_ACCURACY = 0.85; // aced this domain on the practice test -> skip/fast-pass
const MAX_TARGETS = 3;           // a focused plan, not a laundry list

/**
 * @param {Object} byCategory { category: { correct, total } } from the practice ACT
 * @param {Object} [opts] { blueprint?, masteredAccuracy?, maxTargets? }
 * @returns {{
 *   targets: Array,      // weak domains to focus on, highest-leverage first
 *   mastered: Array,     // domains to fast-pass (already aced)
 *   startModuleId: ?string,  // where a great tutor would begin
 *   all: Array,          // every scored domain, annotated
 *   summary: { focusCategories: string[], masteredCategories: string[] }
 * }}
 */
function buildActPlan(byCategory, opts = {}) {
  const weights = (opts.blueprint || DEFAULT_BLUEPRINT).categoryWeights || {};
  const masteredAt = opts.masteredAccuracy != null ? opts.masteredAccuracy : MASTERED_ACCURACY;
  const maxTargets = opts.maxTargets != null ? opts.maxTargets : MAX_TARGETS;

  const rows = Object.entries(byCategory || {})
    .filter(([category]) => category && category !== 'unknown')
    .map(([category, v]) => {
      const total = v.total || 0;
      const correct = v.correct || 0;
      const accuracy = total > 0 ? correct / total : 0;
      const examWeight = weights[category] || 0;
      return {
        category,
        moduleId: CATEGORY_MODULE[category] || null,
        correct,
        total,
        accuracy,
        examWeight,
        mastered: total > 0 && accuracy >= masteredAt,
        foundation: FOUNDATION_ORDER[category] != null ? FOUNDATION_ORDER[category] : 9,
        // leverage: how weak x how much the test rewards it
        priority: priorityScore(accuracy, examWeight || 1),
      };
    });

  const weak = rows
    .filter(r => !r.mastered && r.total > 0)
    .sort((a, b) => b.priority - a.priority || a.foundation - b.foundation);

  const targets = weak.slice(0, maxTargets).map(r => ({ ...r, kind: 'target' }));
  const mastered = rows.filter(r => r.mastered).sort((a, b) => b.examWeight - a.examWeight);

  // Entry point: the most FOUNDATIONAL domain among the top targets, so a weak
  // prerequisite is fixed before a weak domain that depends on it. Falls back to
  // the single highest-priority target, then to any target with a module.
  let startModuleId = null;
  if (targets.length) {
    const byFoundation = [...targets].sort(
      (a, b) => a.foundation - b.foundation || b.priority - a.priority,
    );
    const start = byFoundation.find(t => t.moduleId) || targets.find(t => t.moduleId);
    startModuleId = start ? start.moduleId : null;
  }

  return {
    targets,
    mastered,
    startModuleId,
    all: rows.sort((a, b) => b.priority - a.priority),
    summary: {
      focusCategories: targets.map(t => t.category),
      masteredCategories: mastered.map(m => m.category),
    },
  };
}

/**
 * Should a course session be retargeted to open on the plan's starting module?
 * Only at the very START of the course — never yank a student who has begun a
 * module. Returns the moduleId to jump to, or null (no change).
 *
 * @param {Object} courseSession Mongoose CourseSession (modules[], currentModuleId, overallProgress)
 * @param {Object} plan buildActPlan() output
 */
function planStartModule(courseSession, plan) {
  if (!courseSession || !plan || !plan.startModuleId) return null;
  const mods = courseSession.modules || [];
  const untouched = (courseSession.overallProgress || 0) === 0
    && mods.every(m => m.status !== 'in_progress' && m.status !== 'completed');
  if (!untouched) return null;
  if (!mods.some(m => m.moduleId === plan.startModuleId)) return null; // must be a real module
  if (plan.startModuleId === courseSession.currentModuleId) return null; // already there
  return plan.startModuleId;
}

/** Compact plan summary to stash on the course session for the greeting recap. */
function planSummary(plan, takenAt) {
  return {
    focusCategories: (plan.summary?.focusCategories || []),
    masteredCategories: (plan.summary?.masteredCategories || []),
    startModuleId: plan.startModuleId || null,
    takenAt: takenAt || null,
  };
}

module.exports = {
  buildActPlan,
  planStartModule,
  planSummary,
  CATEGORY_MODULE,
  CATEGORY_LABEL,
  FOUNDATION_ORDER,
  MASTERED_ACCURACY,
};
