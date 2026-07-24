/**
 * Basic facts known cold.
 *
 * The tutor interrogated "how did you get 9+3?" because the pipeline left it
 * uncertain about trivial arithmetic. A tutor that knows basic facts with
 * certainty has nothing to be uncertain about and no reason to ask. This lives
 * in the live-path answer-verification rules (buildSlimRules includes them for
 * every answer-handling action).
 */

const { ANSWER_VERIFICATION_RULES, buildSlimRules } = require('../../utils/pipeline/promptSlim');
const { ACTIONS } = require('../../utils/pipeline/decide');

describe('basic facts known cold', () => {
  test('answer-verification rules assert basic facts are known cold', () => {
    expect(ANSWER_VERIFICATION_RULES).toMatch(/basic facts are known cold/i);
    expect(ANSWER_VERIFICATION_RULES).toMatch(/never ask a student to justify or re-compute trivial arithmetic/i);
  });

  test('the rule reaches the live prompt on a correct-answer turn', () => {
    const rules = buildSlimRules(ACTIONS.CONFIRM_CORRECT);
    expect(rules).toMatch(/basic facts are known cold/i);
  });

  test('the rule reaches the live prompt on a wrong-answer turn', () => {
    const rules = buildSlimRules(ACTIONS.GUIDE_INCORRECT);
    expect(rules).toMatch(/basic facts are known cold/i);
  });
});
