/**
 * CHECKPOINT EVIDENCE — what counts toward a checkpoint, and toward a step.
 *
 * Course audit, 2026-10-23: every checkpoint tested (Number Sense diagnostic,
 * Quarters 1-3, Algebra 1 Unit 1) was marked complete on launch or after one
 * or two answers. The checkpoint branch counted `problemResult` across the
 * WHOLE conversation, so a student with 30 graded answers from earlier
 * modules had "attempted 14 of 14" before seeing question 1. The rest of the
 * checkpoint's answers then advanced the NEXT module's steps — Division
 * Mastery went 1/16 → 16/16 on Quarter 1 arithmetic.
 *
 * Two rules live here so both entry points (/api/chat and /api/course-chat)
 * read evidence the same way:
 *
 *   1. A module's evidence starts when the module did — at the last advance
 *      marker, or at the module's startedAt for conversations from before
 *      the marker was persisted (#1791). Whichever is nearer wins.
 *   2. This turn's result is counted ONCE. The pipeline's persist stage
 *      stamps `problemResult` on this turn's assistant message before
 *      progression runs, so adding `wasCorrect` on top of it counted one
 *      correct answer as two and cleared a "2 correct" practice step alone.
 *
 * A numbered set answered in one message carries `problemItems` (persist,
 * from diagnoseBatch) and counts per item, not as one answer.
 *
 * @module pipeline/checkpointEvidence
 */

/**
 * Messages belonging to the current step/module, oldest first.
 *
 * @param {Array} messages - conversation.messages
 * @param {Date|string|null} [since] - the module's startedAt, if known
 */
function messagesSinceAdvance(messages, since = null) {
  const list = messages || [];
  const floor = since ? new Date(since).getTime() : null;
  let start = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    const msg = list[i];
    if (msg.scaffoldAdvanced) break;
    if (floor != null && msg.timestamp && new Date(msg.timestamp).getTime() < floor) break;
    start = i;
  }
  return list.slice(start);
}

/**
 * True when this turn's verdict is already stamped on the conversation —
 * i.e. the last message is the assistant reply persist just graded.
 */
function currentTurnRecorded(messages) {
  const last = (messages || [])[(messages || []).length - 1];
  return !!(last && last.role === 'assistant' && last.problemResult);
}

/**
 * Correct answers since the last advance, counting this turn exactly once.
 */
function countCorrectSinceAdvance(messages, wasCorrect, since = null) {
  let correct = 0;
  for (const msg of messagesSinceAdvance(messages, since)) {
    if (msg.problemItems && msg.problemItems.total > 0) correct += msg.problemItems.correct || 0;
    else if (msg.problemResult === 'correct') correct++;
  }
  if (wasCorrect === true && !currentTurnRecorded(messages)) correct++;
  return correct;
}

/**
 * When the current checkpoint began: the later of the module's startedAt and
 * a test-out's checkpointState.startedAt. A test-out jumps to the checkpoint
 * without completing a module — no advance marker, and the checkpoint
 * module's own startedAt may be unset or from an earlier visit — so without
 * this the current lesson's practice answers would count toward it.
 */
function checkpointStartedAt(courseSession) {
  const moduleId = courseSession?.currentModuleId;
  const mod = (courseSession?.modules || []).find(m => m.moduleId === moduleId);
  const ck = courseSession?.checkpointState;
  const times = [
    mod?.startedAt,
    mod?.checkpointAttemptStartedAt, // a retake (checkpointOutcome.beginCheckpointRetake)
    ck && ck.moduleId === moduleId ? ck.startedAt : null,
  ]
    .filter(Boolean)
    .map(t => new Date(t).getTime())
    .filter(t => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Tally a checkpoint from the answers given since it started.
 *
 * Returns a flat per-item list (true = correct, false = incorrect/skipped,
 * null = graded set item nobody could verify) so points can be applied by
 * position, plus the totals the completion rule needs.
 *
 * @param {Object} conversation
 * @param {Object} courseSession - for the checkpoint's start (checkpointStartedAt)
 * @param {Array} assessmentProblems
 */
function tallyCheckpoint(conversation, courseSession, assessmentProblems) {
  const problems = assessmentProblems || [];
  const items = [];
  for (const msg of messagesSinceAdvance(conversation?.messages, checkpointStartedAt(courseSession))) {
    if (msg.role !== 'assistant') continue;
    const set = msg.problemItems;
    if (set && set.total > 0) {
      const correct = set.correct || 0;
      const wrong = set.wrong || 0;
      for (let k = 0; k < correct; k++) items.push(true);
      for (let k = 0; k < wrong; k++) items.push(false);
      for (let k = 0; k < Math.max(0, set.total - correct - wrong); k++) items.push(null);
    } else if (msg.problemResult) {
      items.push(msg.problemResult === 'correct');
    }
  }

  const scored = items.slice(0, problems.length);
  const attempted = scored.length;
  const correct = scored.filter(r => r === true).length;
  const undecided = scored.filter(r => r === null).length;

  // Score over the items that were actually decided: an unverifiable item is
  // not evidence either way, and scoring it as a miss is the false-negative
  // the same audit reported everywhere else.
  let earned = 0;
  let possible = 0;
  scored.forEach((r, i) => {
    if (r === null) return;
    const pts = problems[i]?.points || 1;
    possible += pts;
    if (r) earned += pts;
  });
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  // Per-skill result, same shape the checkpoint panel reports
  // (routes/checkpoint.js buildSummary), mapped by item position.
  const bySkill = {};
  scored.forEach((r, i) => {
    const skill = problems[i]?.skill;
    if (!skill || r === null) return;
    bySkill[skill] = bySkill[skill] || { skill, correct: 0, total: 0 };
    bySkill[skill].total++;
    if (r) bySkill[skill].correct++;
  });

  return {
    total: problems.length,
    attempted,
    correct,
    undecided,
    score,
    skillBreakdown: Object.values(bySkill),
    complete: problems.length > 0 && attempted >= problems.length,
  };
}

module.exports = {
  messagesSinceAdvance,
  currentTurnRecorded,
  countCorrectSinceAdvance,
  checkpointStartedAt,
  tallyCheckpoint,
};
