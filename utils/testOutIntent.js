// Detect a student asking to TEST OUT of / prove a skill from chat, so the
// pipeline can launch an in-chat challenge run (5 problems, no hints, proves the
// skill via the challenge rung — utils/skillRung).
//
// Deliberately SPECIFIC. A loose /test/ match would fire on "this is a test",
// "let me test my answer", or "i know this is hard". We require an explicit
// test-out / challenge / skip-the-lesson phrasing so the card only appears when
// the student actually asked to prove out.
const TEST_OUT = new RegExp(
  [
    'test(?:ing)?\\s*out',          // "test out", "testing out" ("test my answer" won't match)
    'test me\\b',
    'quiz me\\b',
    'challenge me\\b',
    'let me prove\\b',
    'ready to test\\b',
    'can i test out\\b',
    'skip (?:the )?lesson\\b',
    'prove (?:that )?i know\\b',
    'i can pass (?:the )?(?:test|challenge)\\b',
  ].join('|'),
  'i'
);

function detectTestOutIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return TEST_OUT.test(text);
}

/**
 * Match a skill the student NAMED in their message against the plan's focus
 * queue ("can I test out of absolute value?"). Any focus status counts — the
 * student may name a skill whose entry was already resolved. Prefers the
 * longest matching name so "absolute value equations" beats "absolute value".
 */
function matchFocusSkillByName(message, plan) {
  if (!message || !Array.isArray(plan?.skillFocus) || plan.skillFocus.length === 0) return null;
  const lower = String(message).toLowerCase();
  let best = null;
  for (const sf of plan.skillFocus) {
    if (!sf?.skillId) continue;
    const name = (sf.displayName || '').toLowerCase().trim();
    if (name.length >= 4 && lower.includes(name)) {
      if (!best || name.length > best.name.length) best = { name, skillId: sf.skillId };
    }
  }
  return best ? best.skillId : null;
}

/**
 * Resolve WHICH skill a test-out request is about.
 *
 * This used to be a three-step chain that could silently produce null (free
 * chat has no activeSkill; a fresh plan may have no in-progress focus entry) —
 * and on null the pipeline pushed NO directive, so the LLM accepted the
 * request and improvised an ungraded 5-question quiz in prose, then broke its
 * own no-hints rule turn after turn (production, 2026-07-26). The chain now
 * also tries a skill named in the message and the last session's skill, and
 * callers must handle null explicitly (see the pipeline's no-improv directive).
 *
 * @param {Object} params
 * @param {string} params.message - The student's message
 * @param {string|null} params.activeSkillId - ctx.activeSkill?.skillId (mastery mode)
 * @param {Object|null} params.tutorPlan - The TutorPlan document
 * @param {Function} params.recentPracticeSkillId - injected from tutorPlanManager
 *   (parameter injection, not a require, to keep this module dependency-free)
 * @returns {string|null}
 */
function resolveTestOutSkillId({ message, activeSkillId, tutorPlan, recentPracticeSkillId }) {
  return activeSkillId
    || matchFocusSkillByName(message, tutorPlan)
    || tutorPlan?.currentTarget?.skillId
    || (typeof recentPracticeSkillId === 'function' ? recentPracticeSkillId(tutorPlan) : null)
    || tutorPlan?.lastSession?.skillId
    || null;
}

module.exports = { detectTestOutIntent, matchFocusSkillByName, resolveTestOutSkillId };
