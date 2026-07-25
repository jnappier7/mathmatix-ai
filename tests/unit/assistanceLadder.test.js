/**
 * The 11-level assistance ladder (utils/pipeline/assistanceLadder.js, spec §12).
 *
 * The contract that matters: a turn's level reflects the tutor's heaviest
 * action, the ladder never reaches 10–11 from pipeline signals (anti-cheat
 * forbids working the student's own problem), and levels 1–4 count as
 * independent for the mastery engine.
 */
const {
  LADDER,
  INDEPENDENT_MAX,
  assistanceLevelForTurn,
  assistanceLabel,
  isIndependent,
  maxAssistance,
} = require('../../utils/pipeline/assistanceLadder');

describe('assistanceLevelForTurn', () => {
  test('no signals → independent', () => {
    expect(assistanceLevelForTurn({})).toBe(1);
    expect(assistanceLevelForTurn(null)).toBe(1);
    expect(assistanceLevelForTurn({ decisionAction: 'present_problem' })).toBe(1);
  });

  test('the action family maps onto the spec rungs', () => {
    expect(assistanceLevelForTurn({ decisionAction: 'confirm_correct' })).toBe(2);
    expect(assistanceLevelForTurn({ decisionAction: 'check_understanding' })).toBe(3);
    expect(assistanceLevelForTurn({ decisionAction: 'redirect_to_math' })).toBe(4);
    expect(assistanceLevelForTurn({ decisionAction: 'hint' })).toBe(5);
    expect(assistanceLevelForTurn({ decisionAction: 'switch_representation' })).toBe(6);
    expect(assistanceLevelForTurn({ decisionAction: 'guided_practice' })).toBe(7);
    expect(assistanceLevelForTurn({ decisionAction: 'worked_example' })).toBe(8);
    expect(assistanceLevelForTurn({ decisionAction: 'direct_instruction' })).toBe(9);
  });

  test('an unknown action contributes nothing (level 1, never a throw)', () => {
    expect(assistanceLevelForTurn({ decisionAction: 'some_future_action' })).toBe(1);
  });

  test('board cards floor the level: scaffold=7, example=8, visuals=6', () => {
    expect(assistanceLevelForTurn({
      decisionAction: 'confirm_correct',
      boardCommands: [{ action: 'scaffold', tex: 'x=\\boxed{}' }],
    })).toBe(7);
    expect(assistanceLevelForTurn({ boardCommands: [{ action: 'example', tex: 'y=3x' }] })).toBe(8);
    expect(assistanceLevelForTurn({ boardCommands: [{ action: 'graph' }] })).toBe(6);
    // The solve-cycle cards mirror the student's own verified moves — no help implied.
    expect(assistanceLevelForTurn({ boardCommands: [{ action: 'pose' }, { action: 'resolve' }, { action: 'verify' }] })).toBe(1);
  });

  test('the turn level is the MAX of its signals, not the last one', () => {
    expect(assistanceLevelForTurn({
      decisionAction: 'direct_instruction',                 // 9
      boardCommands: [{ action: 'graph' }],                 // 6
    })).toBe(9);
  });

  test('heavy scaffold intensity floors a mild action', () => {
    expect(assistanceLevelForTurn({ decisionAction: 'hint', scaffoldLevel: 5 })).toBe(6);
    expect(assistanceLevelForTurn({ decisionAction: 'confirm_correct', scaffoldLevel: 4 })).toBe(5);
    // ...but never lowers a heavier one.
    expect(assistanceLevelForTurn({ decisionAction: 'direct_instruction', scaffoldLevel: 1 })).toBe(9);
  });

  test('no pipeline signal can reach tutor-modeled/tutor-completed (10–11)', () => {
    // Exhaustive sweep of every action and board card at max intensity: the
    // anti-cheat ceiling. If this test ever fails, containment broke upstream.
    const actions = [
      'elicit_first', 'present_problem', 'independent_practice', 'strengthen_challenge',
      'continue_conversation', 'confirm_correct', 'acknowledge_progress', 'acknowledge_frustration',
      'check_understanding', 'redirect_to_math', 'hint', 'probing_question', 'guide_incorrect',
      'leverage_bridge', 'switch_representation', 'guided_practice', 'scaffold_down',
      'worked_example', 'direct_instruction', 'phase_instruction', 'reteach_misconception',
      'review_prerequisite', 'prerequisite_bridge', 'exit_ramp',
    ];
    const cards = ['pose', 'apply', 'resolve', 'verify', 'clear', 'scaffold', 'example', 'graph', 'image', 'diagram', 'model'];
    for (const a of actions) {
      const level = assistanceLevelForTurn({
        decisionAction: a,
        scaffoldLevel: 5,
        boardCommands: cards.map(c => ({ action: c })),
      });
      expect(level).toBeLessThanOrEqual(9);
    }
  });
});

describe('independence + helpers', () => {
  test('levels 1–4 are independent; 5+ is not', () => {
    for (let l = 1; l <= INDEPENDENT_MAX; l++) expect(isIndependent(l)).toBe(true);
    for (let l = INDEPENDENT_MAX + 1; l <= 11; l++) expect(isIndependent(l)).toBe(false);
    expect(isIndependent(null)).toBe(true);   // no evidence of help ≠ evidence of help
  });

  test('every ladder rung has a label', () => {
    for (let l = 1; l <= 11; l++) expect(typeof assistanceLabel(l)).toBe('string');
    expect(assistanceLabel(0)).toBeNull();
    expect(assistanceLabel(12)).toBeNull();
  });

  test('maxAssistance folds with nulls', () => {
    expect(maxAssistance(null, 5)).toBe(5);
    expect(maxAssistance(7, 3)).toBe(7);
    expect(maxAssistance(null, null)).toBeNull();
  });
});
