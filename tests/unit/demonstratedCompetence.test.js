/**
 * Session-level trust (owner: "the system doesn't need students to walk
 * through EVERY problem — especially once it is clear that this kid knows
 * what he is talking about").
 *
 * Three verified-correct in the recent window, zero misses → trust becomes
 * the DEFAULT on every branch: no explanation requests, scaffold capped so
 * the assistance ladder records the work as independent. One wrong answer
 * resets the default back to normal support.
 */
const { observe } = require('../../utils/pipeline/observe');
const { decide } = require('../../utils/pipeline/decide');

const correctMsg = { content: 'Right!', problemResult: 'correct' };
const wrongMsg = { content: 'Not quite.', problemResult: 'incorrect' };
const plainMsg = { content: 'What next?' };

function decideWith(assistantHistory, message = 'x = 4', diagnosis = { type: 'answer', isCorrect: true, answer: '4', correctAnswer: '4' }) {
  const obs = observe(message, { recentUserMessages: [], recentAssistantMessages: assistantHistory });
  return decide(obs, diagnosis, { phaseState: null, activeSkill: null });
}

const hasTrust = d => d.directives.some(x => x.startsWith('DEMONSTRATED COMPETENCE'));

describe('demonstrated competence', () => {
  test('3 correct, 0 wrong → trust mode on, scaffold capped at 2', () => {
    const d = decideWith([plainMsg, correctMsg, correctMsg, correctMsg]);
    expect(hasTrust(d)).toBe(true);
    expect(d.scaffoldLevel).toBeLessThanOrEqual(2);
  });

  test('applies on unverifiable turns too — trust is not gated on auto-checking', () => {
    const d = decideWith(
      [correctMsg, correctMsg, correctMsg],
      'the sevens cross cancel so 20',
      { type: 'unverifiable', isCorrect: null, answer: null, correctAnswer: null }
    );
    expect(hasTrust(d)).toBe(true);
  });

  test('a single wrong answer in the window resets the default', () => {
    const d = decideWith([correctMsg, correctMsg, correctMsg, wrongMsg]);
    expect(hasTrust(d)).toBe(false);
  });

  test('two correct is not yet a pattern', () => {
    const d = decideWith([plainMsg, correctMsg, correctMsg]);
    expect(hasTrust(d)).toBe(false);
  });

  test('empty history never trusts by accident', () => {
    expect(hasTrust(decideWith([]))).toBe(false);
  });
});
