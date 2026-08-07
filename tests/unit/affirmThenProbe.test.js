/**
 * AFFIRM THEN PROBE — the decide-stage action for "right answer, suspect rule".
 *
 * The butterfly failure (eval matrix, 2026-08-07): a student adds 1/4 + 1/6,
 * announces the verified-correct 10/24, and explains a rule that isn't
 * generally valid ("add the denominators for the numerator, multiply them for
 * the denominator"). Left to improvise the affirm-vs-probe tension, the model
 * kept leading with doubt about a verified answer. These tests pin the decided
 * policy: a suspect method routes to AFFIRM_THEN_PROBE, whose directives order
 * the reply (affirmation first, ONE counterexample probe second) — and a
 * correct answer WITHOUT a suspect method keeps the plain CONFIRM_CORRECT
 * behavior untouched.
 */
const { observe } = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

function decideWith(diagnosis, message = 'I got 10/24. You add the denominators for the numerator and multiply them for the denominator.') {
  const obs = observe(message, { recentUserMessages: [], recentAssistantMessages: [] });
  return decide(obs, diagnosis, { phaseState: null, activeSkill: null });
}

const correctDiagnosis = (extra = {}) => ({
  type: 'correct',
  isCorrect: true,
  answer: '10/24',
  correctAnswer: '5/12',
  ...extra,
});

const suspectAudit = (extra = {}) => ({
  suspect: true,
  source: 'llm',
  flaw: 'adding denominators for the numerator is not fraction addition',
  counterexample: '1/2 + 1/2',
  ...extra,
});

describe('AFFIRM_THEN_PROBE routing', () => {
  test('correct answer + suspect method → affirm_then_probe, not confirm_correct', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: suspectAudit() }));
    expect(d.action).toBe(ACTIONS.AFFIRM_THEN_PROBE);
  });

  test('directives order the reply: affirmation first, doubt-toned openers banned', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: suspectAudit() }));
    const all = d.directives.join('\n');
    expect(all).toMatch(/FIRST sentence must plainly affirm/);
    expect(all).toMatch(/BANNED before the affirmation/i);
    expect(all).toMatch(/hold on/i);
  });

  test('the counterexample reaches the directives when the audit found one', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: suspectAudit() }));
    expect(d.directives.join('\n')).toContain('1/2 + 1/2');
  });

  test('no counterexample → generic curiosity probe, still one probe only', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: suspectAudit({ counterexample: null }) }));
    const all = d.directives.join('\n');
    expect(d.action).toBe(ACTIONS.AFFIRM_THEN_PROBE);
    expect(all).toMatch(/ONE curiosity-framed probe/);
    expect(all).not.toContain('1/2 + 1/2');
  });

  test('the audit flaw is surfaced to the generate stage', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: suspectAudit() }));
    expect(d.directives.join('\n')).toMatch(/not fraction addition/);
  });

  test('correct answer with NO method audit keeps plain CONFIRM_CORRECT', () => {
    const d = decideWith(correctDiagnosis(), '10/24');
    expect(d.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('a non-suspect audit (method checked out) does not trigger the probe', () => {
    const d = decideWith(correctDiagnosis({ methodAudit: null }), '10/24');
    expect(d.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('a WRONG answer never routes here, audit or not', () => {
    const d = decideWith({
      type: 'incorrect', isCorrect: false, answer: '2/10', correctAnswer: '5/12',
      methodAudit: suspectAudit(),
    });
    expect(d.action).not.toBe(ACTIONS.AFFIRM_THEN_PROBE);
    expect(d.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
  });
});
