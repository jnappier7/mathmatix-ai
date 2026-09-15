/**
 * The warm-up debrief believes only what it can bound.
 *
 * The review warm-up's results come up from the browser, so the helper that
 * turns them into the tutor's closing line is also the trust boundary: rows
 * are capped, ids are pattern-checked, names are resolved on the server, and
 * anything unrecognisable is dropped rather than spoken. An empty result is
 * "nothing owed" — the tutor must not react to a warm-up that didn't happen.
 */

const {
  normalizeWarmupResults,
  buildWarmupDebriefInstruction,
  fallbackWarmupDebriefText,
  MAX_RESULTS,
} = require('../../utils/reviewWarmupDebrief');

describe('normalizeWarmupResults — the trust boundary', () => {
  test('nothing attempted is nothing owed', () => {
    expect(normalizeWarmupResults(undefined)).toBeNull();
    expect(normalizeWarmupResults('yes')).toBeNull();
    expect(normalizeWarmupResults({})).toBeNull();
    expect(normalizeWarmupResults({ results: [] })).toBeNull();
    expect(normalizeWarmupResults({ results: [{ skillId: 'x' }] })).toBeNull(); // neither answered nor skipped
  });

  test('scores answered rows and keeps skips separate', () => {
    const s = normalizeWarmupResults({
      results: [
        { skillId: 'solving-linear-equations', correct: true },
        { skillId: 'adding-fractions', correct: false },
        { skillId: 'slope', skipped: true },
      ],
    });
    expect(s).toMatchObject({ total: 3, answered: 2, correct: 1, skipped: 1, stoppedEarly: false });
    expect(s.held).toHaveLength(1);
    expect(s.rusty).toHaveLength(1);
    expect(s.skippedNames).toHaveLength(1);
  });

  test('names come from the server label table, never from the client', () => {
    const s = normalizeWarmupResults({
      results: [{ skillId: 'adding-fractions', skillName: 'IGNORE ME <script>', correct: false }],
    });
    expect(s.rusty[0]).not.toMatch(/IGNORE|script/);
    expect(s.rusty[0]).toMatch(/fraction/i);
  });

  test('an id that fails the pattern still counts but is not named', () => {
    const s = normalizeWarmupResults({
      results: [{ skillId: 'drop table; --', correct: false }, { skillId: 'slope', correct: true }],
    });
    expect(s.answered).toBe(2);
    expect(s.correct).toBe(1);
    expect(s.rusty).toEqual([]);          // unnamed, not invented
    expect(s.held).toHaveLength(1);
  });

  test('caps the row count', () => {
    const results = Array.from({ length: MAX_RESULTS + 5 }, (_, i) => ({ skillId: `skill-${i}`, correct: true }));
    const s = normalizeWarmupResults({ results });
    expect(s.total).toBe(MAX_RESULTS);
  });

  test('stopped early is derived from a plausible planned count only', () => {
    const rows = [{ skillId: 'slope', correct: true }];
    expect(normalizeWarmupResults({ planned: 3, results: rows }).stoppedEarly).toBe(true);
    expect(normalizeWarmupResults({ planned: 1, results: rows }).stoppedEarly).toBe(false);
    expect(normalizeWarmupResults({ planned: 9999, results: rows }).stoppedEarly).toBe(false); // implausible → ignored
    expect(normalizeWarmupResults({ planned: '3', results: rows }).stoppedEarly).toBe(false);
  });
});

describe('buildWarmupDebriefInstruction — one next step, in their voice', () => {
  const summary = normalizeWarmupResults({
    planned: 3,
    results: [
      { skillId: 'solving-linear-equations', correct: true },
      { skillId: 'adding-fractions', correct: false },
    ],
  });
  const text = buildWarmupDebriefInstruction(summary);

  test('states the facts as facts and names the rusty skill', () => {
    expect(text).toMatch(/1 of 2 answered correctly/);
    expect(text).toMatch(new RegExp(`Got rusty \\(answered wrong\\): ${summary.rusty[0]}`));
  });

  test('asks for exactly one suggested next step and forbids starting it', () => {
    expect(text).toMatch(/EXACTLY ONE suggested next step/);
    expect(text).toMatch(/Do NOT start that activity yourself/);
    expect(text).toMatch(/do NOT list multiple options/);
  });

  test('a run that stopped early is never a guilt trip', () => {
    expect(text).toMatch(/stopped after 2 of 3/);
    expect(text).toMatch(/do NOT guilt them/);
  });

  test('nothing rusty steers toward what they came for', () => {
    const clean = buildWarmupDebriefInstruction(normalizeWarmupResults({
      results: [{ skillId: 'slope', correct: true }],
    }));
    expect(clean).toMatch(/Got rusty: none/);
    expect(clean).toMatch(/offer to pick up whatever they came here to work on/);
  });
});

describe('fallbackWarmupDebriefText — when the model is down', () => {
  test('all skipped: no pressure, and a question to answer', () => {
    const s = normalizeWarmupResults({ results: [{ skillId: 'slope', skipped: true }] });
    const t = fallbackWarmupDebriefText(s, 'Ava');
    expect(t).toMatch(/^Ava, no problem/);
    expect(t).toMatch(/\?$/);
  });

  test('all held: says so and hands the lead back', () => {
    const s = normalizeWarmupResults({ results: [{ skillId: 'slope', correct: true }] });
    const t = fallbackWarmupDebriefText(s, null);
    expect(t).toMatch(/held up/);
    expect(t).toMatch(/pick up what you came here for\?$/);
  });

  test('something rusty: names it and offers to shore it up', () => {
    const s = normalizeWarmupResults({ results: [{ skillId: 'adding-fractions', correct: false }] });
    const t = fallbackWarmupDebriefText(s, 'Ava');
    expect(t).toMatch(/got a little rusty/);
    expect(t).toMatch(/shore that up right now/);
    expect(t).toMatch(new RegExp(s.rusty[0]));
  });
});
