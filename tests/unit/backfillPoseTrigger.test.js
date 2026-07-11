// tests/unit/backfillPoseTrigger.test.js
// Stage 5c.1 pose-backfill trigger — decides when the pipeline backfills a
// PROBLEM pose so the board doesn't lag behind the chat (problem appearing only
// after the student already solved it).

const { shouldBackfillProblemPose } = require('../../utils/pipeline');

describe('shouldBackfillProblemPose', () => {
  test('fires on the model self-declared problem_introduction turn_type', () => {
    expect(shouldBackfillProblemPose({
      structuredTurnType: 'problem_introduction',
      decisionAction: 'direct_instruction',
      pinnedTex: null,
    })).toBe(true);
  });

  test('problem_introduction still fires even if a problem is pinned (unchanged legacy path)', () => {
    expect(shouldBackfillProblemPose({
      structuredTurnType: 'problem_introduction',
      decisionAction: null,
      pinnedTex: '2x + 4 = 20',
    })).toBe(true);
  });

  test('fires on decide.action=present_problem onto an EMPTY board (turn_type under-declared)', () => {
    // The model mis-tagged a conversational problem intro as continue_conversation;
    // the decide stage's ground-truth action still catches it.
    expect(shouldBackfillProblemPose({
      structuredTurnType: 'continue_conversation',
      decisionAction: 'present_problem',
      pinnedTex: null,
    })).toBe(true);
  });

  test('does NOT re-pose via present_problem when a problem is already pinned', () => {
    expect(shouldBackfillProblemPose({
      structuredTurnType: null,
      decisionAction: 'present_problem',
      pinnedTex: '\\text{A baker has 24 cookies...}',
    })).toBe(false);
  });

  test('does not fire on non-problem-presenting actions', () => {
    for (const action of ['guided_practice', 'independent_practice', 'worked_example', 'prerequisite_bridge', 'direct_instruction']) {
      expect(shouldBackfillProblemPose({
        structuredTurnType: null,
        decisionAction: action,
        pinnedTex: null,
      })).toBe(false);
    }
  });

  test('does not fire when there is no signal at all', () => {
    expect(shouldBackfillProblemPose({})).toBe(false);
    expect(shouldBackfillProblemPose({ structuredTurnType: null, decisionAction: null, pinnedTex: null })).toBe(false);
  });
});
