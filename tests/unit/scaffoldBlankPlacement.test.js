/**
 * Scaffold blank placement — the 2026-07-29 production board showed
 * "nonsensical fill-ins": blanks over already-known givens with the asked-for
 * result displayed, and the true unknown written as a bare "?". Two guard
 * rules now drop those shapes, and the observe fix stops a word-initial
 * letter being extracted as an algebraic answer.
 */

const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');
const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');

function guardScaffold(tex, opts = {}) {
  return enforcePedagogyRule({
    commands: [{ action: 'scaffold', tex }],
    userMessage: opts.userMessage || 'im stuck',
    recentUserMessages: [],
    tutorReplyText: opts.tutorReplyText || null,
  });
}

describe('guard: scaffold with "?" as the unknown is dropped', () => {
  test('the production card "0 + \\boxed{} + \\boxed{} = ?" is dropped', () => {
    const { allowed, dropped } = guardScaffold('0 + \\boxed{} + \\boxed{} = ?');
    expect(allowed).toHaveLength(0);
    expect(dropped[0].reason).toBe('scaffold_question_mark_unknown');
  });

  test('a well-formed sum scaffold passes', () => {
    const { allowed } = guardScaffold('0 + 50 + 300 = \\boxed{}');
    expect(allowed).toHaveLength(1);
  });
});

describe('guard: backwards evaluation scaffold (shown result never stated) is dropped', () => {
  test('the production card "0.3 \\times \\boxed{} = 300" is dropped when 300 is unstated', () => {
    const { allowed, dropped } = guardScaffold('0.3 \\times \\boxed{} = 300', {
      tutorReplyText: "You've got 0.15 × 2 = 0.3. Now what's 0.3 × 1000?",
    });
    expect(allowed).toHaveLength(0);
    expect(dropped[0].reason).toBe('scaffold_reveals_unstated_result');
  });

  test('a legit missing-factor scaffold passes when the result IS stated', () => {
    const { allowed } = guardScaffold('0.3 \\times \\boxed{} = 300', {
      tutorReplyText: 'What times 0.3 gives 300? Fill the box.',
    });
    expect(allowed).toHaveLength(1);
  });

  test('a result the STUDENT stated also legitimizes the card', () => {
    const { allowed } = guardScaffold('0.3 \\times \\boxed{} = 300', {
      userMessage: 'i know it ends up as 300 but not how',
    });
    expect(allowed).toHaveLength(1);
  });

  test('a digit-run inside a longer number does not count as stated', () => {
    const { allowed, dropped } = guardScaffold('0.3 \\times \\boxed{} = 300', {
      tutorReplyText: 'Think about 3000 divided by 10.',
    });
    expect(allowed).toHaveLength(0);
    expect(dropped[0].reason).toBe('scaffold_reveals_unstated_result');
  });

  test('the forward form (result blanked) always passes', () => {
    const { allowed } = guardScaffold('0.3 \\times 1000 = \\boxed{}', {
      tutorReplyText: "Now what's 0.3 × 1000?",
    });
    expect(allowed).toHaveLength(1);
  });

  test('algebra scaffolds with blanks on both sides are untouched', () => {
    const { allowed } = guardScaffold('x^2 + 4x + \\boxed{} = 12 + \\boxed{}');
    expect(allowed).toHaveLength(1);
  });

  test('a non-numeric far side is untouched (not this shape)', () => {
    const { allowed } = guardScaffold('2x = \\boxed{}');
    expect(allowed).toHaveLength(1);
  });
});

describe('observe: conclusive answer pattern stops eating word-initial letters', () => {
  test('"so its just the sum of each percent(value)" is not an answer attempt', () => {
    const obs = observe('so its just the sum of each percent(value)');
    expect(obs.answer).toBeNull();
    expect(obs.messageType).not.toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
  });

  test('"the answer is definitely q" does not extract "d"', () => {
    const obs = observe('the answer is definitely q');
    expect(obs.answer && obs.answer.value).not.toBe('d');
  });

  test('"so it is x+2" extracts x+2', () => {
    const obs = observe('so it is x+2, since the (x-2) cancels');
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('x+2');
  });

  test('legitimate conclusive answers still extract', () => {
    expect(observe('after factoring, the limit is 4').answer.value).toBe('4');
    expect(observe('the answer is 3x^2-3').answer.value).toBe('3x^2-3');
    expect(observe('so its 34').answer.value).toBe('34');
  });
});
