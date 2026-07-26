/**
 * Deterministic AHA + Reminder capture (utils/pipeline/learningCards.js, spec §7).
 *
 * The contract: an AHA card requires ALL THREE signals at once — verified
 * correct, prior struggle on the problem, realization language in the
 * student's own message. Anything less saves nothing (skipping beats false
 * epiphanies). Reminders dedupe by misconception and stay supportive.
 */
const {
  detectAha,
  reminderKey,
  shapeReminder,
  shapeAha,
  toClientCard,
  REMINDER_ACTIVATION_COUNT,
} = require('../../utils/pipeline/learningCards');

const STRUGGLE = { attemptCount: 2, misconception: null };

describe('detectAha', () => {
  test('correct + prior struggle + realization language → AHA with the student quote', () => {
    const r = detectAha({
      message: "ohhh I get it, the 5 doesn't jump across — you subtract it from both sides. x=4",
      wasCorrect: true,
      priorProblemState: STRUGGLE,
    });
    expect(r.isAha).toBe(true);
    expect(r.quote).toContain("the 5 doesn't jump across");
  });

  test('a prior misconception counts as struggle even with zero failed attempts', () => {
    expect(detectAha({
      message: 'wait, so that makes sense now — x=4',
      wasCorrect: true,
      priorProblemState: { attemptCount: 0, misconception: 'one-sided-operation' },
    }).isAha).toBe(true);
  });

  test('any missing leg kills the card', () => {
    // No struggle (first try) — being right immediately is not an epiphany.
    expect(detectAha({ message: 'oh I get it! x=4', wasCorrect: true, priorProblemState: null }).isAha).toBe(false);
    // Not correct — saying "I get it" without the answer proving it.
    expect(detectAha({ message: 'oh I get it now', wasCorrect: false, priorProblemState: STRUGGLE }).isAha).toBe(false);
    // No realization language — a bare correct retry is progress, not an AHA.
    expect(detectAha({ message: 'x=4', wasCorrect: true, priorProblemState: STRUGGLE }).isAha).toBe(false);
  });

  test('weak acknowledgements do not mint cards', () => {
    for (const msg of ['ok', 'yes', 'sure x=4', 'oh', 'I see the problem says 12']) {
      expect(detectAha({ message: msg, wasCorrect: true, priorProblemState: STRUGGLE }).isAha).toBe(false);
    }
  });

  test('realization phrase variants that must hit', () => {
    for (const msg of [
      'that makes sense! so x=4',
      'now I see why we flip it, x=4',
      "wait, so it's the slope? then y=2",
      'i understand now, x=4',
    ]) {
      expect(detectAha({ message: msg, wasCorrect: true, priorProblemState: STRUGGLE }).isAha).toBe(true);
    }
  });

  test('quote caps at 400 chars and junk input never throws', () => {
    const long = 'oh i get it ' + 'x'.repeat(600);
    expect(detectAha({ message: long, wasCorrect: true, priorProblemState: STRUGGLE }).quote.length).toBe(400);
    expect(detectAha(null).isAha).toBe(false);
    expect(detectAha({}).isAha).toBe(false);
  });
});

describe('reminder shaping', () => {
  test('reminderKey slugs stably and rejects empties', () => {
    expect(reminderKey('Losing a Negative Sign')).toBe('losing-a-negative-sign');
    expect(reminderKey('  Partial Distribution!! ')).toBe('partial-distribution');
    expect(reminderKey('')).toBeNull();
    expect(reminderKey(null)).toBeNull();
  });

  test('shapeReminder is supportive and carries the fix', () => {
    const s = shapeReminder({ name: 'losing a negative sign', description: 'The minus sign got dropped.', fix: 'Circle every negative before you move terms.' });
    expect(s.title).toBe('Watch for This: losing a negative sign');
    expect(s.body).toContain('Next time: Circle every negative');
  });

  test('shapeAha leads with the student quote', () => {
    const s = shapeAha('the 5 does not jump across', 'two-step-equations');
    expect(s.title).toContain('Two Step Equations');
    expect(s.body).toBe('“the 5 does not jump across”');
  });

  test('activation threshold: a reminder is a RECURRING mistake', () => {
    expect(REMINDER_ACTIVATION_COUNT).toBeGreaterThanOrEqual(2);
    expect(toClientCard({ type: 'reminder', title: 'T', seenCount: 3 })).toEqual({ type: 'reminder', title: 'T', seenCount: 3 });
  });
});
