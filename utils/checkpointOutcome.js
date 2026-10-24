/**
 * CHECKPOINT OUTCOME — what a missed checkpoint does.
 *
 * Owner decision, 2026-10-24 (course audit C01/C06): a failed checkpoint does
 * NOT complete its module or unlock the next one. The student sees the score,
 * reviews the skills they missed with the tutor, and retakes. Before this a
 * checkpoint completed and moved on regardless of score, so "checkpoint
 * complete" said nothing about what the student knew.
 *
 * Both checkpoint flows settle through here:
 *   - the in-chat checkpoint (pipeline/courseAdapter, answers tallied by
 *     pipeline/checkpointEvidence), and
 *   - the server-graded panel (routes/checkpoint.js /complete).
 *
 * State lives on the module's progress entry (models/courseSession.js):
 *   checkpointScore / checkpointPassed — the latest attempt
 *   checkpointAttempts                 — how many attempts were scored
 *   checkpointReview.active            — between a miss and the retake; the
 *                                        tutor reteaches, nothing is tallied
 *   checkpointAttemptStartedAt         — the retake's start: answers before
 *                                        it (review practice) do not count
 *
 * @module checkpointOutcome
 */

function currentModuleEntry(courseSession) {
  return (courseSession?.modules || []).find(m => m.moduleId === courseSession.currentModuleId) || null;
}

/** Skills with any missed item, weakest first. */
function missedSkillsFrom(skillBreakdown) {
  return (skillBreakdown || [])
    .filter(s => s && s.skill && s.total > 0 && s.correct < s.total)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
    .map(s => s.skill);
}

/**
 * Record a missed checkpoint: score it, keep the module where it is, and open
 * review. Mutates `courseSession`; the caller saves.
 *
 * @returns {object} the student-facing `checkpoint_failed` progress event
 */
function recordCheckpointMiss(courseSession, { score, passThreshold, skillBreakdown, correct, attempted } = {}) {
  const mod = currentModuleEntry(courseSession);
  const missedSkills = missedSkillsFrom(skillBreakdown);
  if (mod) {
    mod.checkpointScore = score;
    mod.checkpointPassed = false;
    mod.checkpointAttempts = (mod.checkpointAttempts || 0) + 1;
    if (mod.status !== 'completed') mod.status = 'in_progress';
    mod.checkpointReview = {
      active: true,
      score,
      passThreshold,
      missedSkills,
      at: new Date(),
    };
  }
  if (typeof courseSession.markModified === 'function') courseSession.markModified('modules');

  return {
    event: 'checkpoint_failed',
    moduleId: courseSession.currentModuleId,
    title: mod?.title || null,
    score,
    passThreshold,
    correct: correct ?? null,
    attempted: attempted ?? null,
    attempts: mod?.checkpointAttempts || 1,
    skillBreakdown: skillBreakdown || [],
    missedSkills,
    courseSessionId: courseSession._id ? String(courseSession._id) : null,
  };
}

/**
 * Note a passing score on the module before it completes. Clears review.
 */
function recordCheckpointPass(courseSession, { score } = {}) {
  const mod = currentModuleEntry(courseSession);
  if (!mod) return;
  mod.checkpointScore = score;
  mod.checkpointPassed = true;
  mod.checkpointAttempts = (mod.checkpointAttempts || 0) + 1;
  mod.checkpointReview = undefined;
  if (courseSession.checkpointState && courseSession.checkpointState.moduleId === courseSession.currentModuleId) {
    courseSession.checkpointState = null;
    if (typeof courseSession.markModified === 'function') courseSession.markModified('checkpointState');
  }
  if (typeof courseSession.markModified === 'function') courseSession.markModified('modules');
}

/**
 * Start a retake: close review and start a fresh evidence window, so review
 * practice never counts toward the retake. Mutates `courseSession`.
 *
 * @returns {boolean} false when the current module is not in review
 */
function beginCheckpointRetake(courseSession) {
  const mod = currentModuleEntry(courseSession);
  if (!mod) return false;
  const wasReviewing = !!(mod.checkpointReview && mod.checkpointReview.active);
  mod.checkpointReview = undefined;
  mod.checkpointAttemptStartedAt = new Date();
  if (typeof courseSession.markModified === 'function') courseSession.markModified('modules');
  return wasReviewing;
}

/** The current checkpoint's open review, or null. */
function activeCheckpointReview(courseSession) {
  const review = currentModuleEntry(courseSession)?.checkpointReview;
  return review && review.active ? review : null;
}

// "retake", "try the checkpoint again", "ready to retake", "take it again"…
const RETAKE = /\b(?:re-?take|re-?do\s+(?:the|my|this)\s+(?:checkpoint|test|quiz|assessment)|(?:take|try|do)\s+(?:it|the\s+(?:checkpoint|test|quiz|assessment))\s+again|try\s+again\s+on\s+the\s+(?:checkpoint|test))\b/i;

function isRetakeRequest(text) {
  return RETAKE.test(String(text || ''));
}

module.exports = {
  missedSkillsFrom,
  recordCheckpointMiss,
  recordCheckpointPass,
  beginCheckpointRetake,
  activeCheckpointReview,
  isRetakeRequest,
};
