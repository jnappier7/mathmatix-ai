/**
 * SKILL FOCUS BUILDER — makes structured teaching run in free chat.
 *
 * The tutor plan already has a full structured-teaching machine
 * (skillFocus queue → currentTarget → instructional mode → gradual release),
 * but in free chat the queue was never populated, so `decide` always fell
 * through to the reactive Socratic default. This module feeds that queue from
 * the student's OWN mastery signals so the tutor knows what to work on next —
 * "structure everywhere" — without requiring a course enrolment.
 *
 * Safety posture (v1, "guided" — steer, don't cage):
 *   - Seeds ONLY skills the student has already TOUCHED (review-due +
 *     in-progress). These map to guide/strengthen/leverage modes, which stay
 *     Socratic-compatible. It never seeds `never-seen` frontier skills, so it
 *     can't trigger the answer-dumping INSTRUCT mode against an off-plan
 *     question. (NOTE: this invariant used to be broken — `introduced` was
 *     seeded here but mapped to INSTRUCT in familiarityToMode, which restarted
 *     full ground-up teaching for returning students. familiarityToMode now
 *     maps `introduced` → guide, making the claim above true.) Proactive
 *     brand-new-skill introduction stays reactive / course-driven until the
 *     on-plan detector is proven (see docs/COURSES_IN_FLOW_DESIGN.md, open
 *     question #2).
 *   - Only runs when the active queue is EMPTY, so it never thrashes an
 *     in-flight plan or overrides course / teacher / student-set focus.
 *   - Skips course sessions entirely (the course drives its own queue).
 *   - Non-fatal by contract: the caller wraps it in try/catch; on any bad
 *     input it returns the plan untouched.
 *
 * Kill switch: set env STRUCTURED_FREE_CHAT=false to disable seeding globally.
 *
 * @module utils/skillFocusBuilder
 */

const TutorPlan = require('../models/tutorPlan');
const { decodedMasteryMap } = require('./masteryGuard');
const { addSkillToFocus } = require('./tutorPlanManager');

// Priority by familiarity for in-progress (not-yet-due) skills. Review-due
// work outranks all of these so retention gets served first.
const PRIORITY = { review_due: 8, developing: 6, introduced: 5, proficient: 4 };
const MAX_SEED = 6;

/**
 * Whether structured free-chat seeding is enabled. Default ON; the env var is
 * an explicit kill switch so a canary can turn it off without a code change.
 * @returns {boolean}
 */
function isStructuredFreeChatEnabled() {
  return process.env.STRUCTURED_FREE_CHAT !== 'false';
}

/**
 * Populate `plan.skillFocus` from the student's mastery signals when the queue
 * is empty and the student is in free chat. Mutates and returns the plan (does
 * not save — the pipeline's persist stage saves it).
 *
 * @param {Object} plan - TutorPlan document
 * @param {Object} user - User document (needs skillMastery)
 * @param {Object} [opts]
 * @param {boolean} [opts.inCourse] - True when the student is in a course session
 * @param {Date}    [opts.now] - Injectable clock for tests
 * @returns {Object} the same plan
 */
function refreshSkillFocus(plan, user, opts = {}) {
  if (!isStructuredFreeChatEnabled()) return plan;
  if (!plan || !user) return plan;
  if (opts.inCourse) return plan; // course drives its own queue

  // Don't touch a queue that already has active work.
  const hasActive = (plan.skillFocus || []).some(
    sf => sf.status === 'active' || sf.status === 'in-progress'
  );
  if (hasActive) return plan;

  // Iterate by LOGICAL (dotted) skill id, not by storage key. skillMastery is
  // keyed by the encoded form ("MS_QNT_8" for "MS.QNT.8" — Mongoose Maps reject
  // dots), so a raw forEach seeds the focus queue with encoded keys. The next
  // encodeMasteryKey() on one of those throws ('contains "_"'), the whole
  // TutorPlan load is swallowed by its non-fatal catch, and the tutor loses its
  // persistent model of the student on EVERY turn. decodedMasteryMap is the
  // shared helper for exactly this.
  const mastery = decodedMasteryMap(user);
  if (!mastery.size) return plan;

  const now = opts.now || new Date();
  const candidates = [];

  mastery.forEach((entry, skillId) => {
    if (!entry || !skillId) return;

    const familiarity = TutorPlan.inferFamiliarity(entry);

    // Skip never-seen (seeding it would trigger the answer-dumping INSTRUCT
    // mode) and mastered. Mastered skills are auto-retired by
    // resolveCurrentTarget, and mastered review-due is already surfaced by the
    // prompt layer (buildSkillMasteryContext) — seeding them here is churn.
    if (familiarity === 'never-seen' || familiarity === 'mastered') return;

    const nextReview = entry.reviewSchedule && entry.reviewSchedule.nextReviewDate
      ? new Date(entry.reviewSchedule.nextReviewDate)
      : null;
    const reviewDue = !!(nextReview && nextReview <= now);

    // In-progress (developing / introduced / proficient). If a review is due,
    // it jumps the queue; otherwise it's ordered by familiarity.
    candidates.push({
      skillId,
      familiarity,
      reason: reviewDue ? 'review-due' : 'assessment-identified',
      priority: reviewDue ? PRIORITY.review_due : (PRIORITY[familiarity] || 5),
    });
  });

  if (candidates.length === 0) return plan;

  candidates.sort((a, b) => b.priority - a.priority);
  for (const c of candidates.slice(0, MAX_SEED)) {
    addSkillToFocus(plan, {
      skillId: c.skillId,
      reason: c.reason,
      familiarity: c.familiarity,
      priority: c.priority,
    });
  }

  return plan;
}

module.exports = { refreshSkillFocus, isStructuredFreeChatEnabled };
