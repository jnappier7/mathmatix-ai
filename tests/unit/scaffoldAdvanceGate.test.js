/**
 * Evidence gate on <SCAFFOLD_ADVANCE> (owner: make progress trackable AND
 * trustworthy, 2026-08-01).
 *
 * Progression now works end to end (#1378), which makes the model's advance
 * judgment load-bearing. On a "you-do" step that judgment must be backed by
 * evidence: advancing a student who has solved nothing turns the progress bar
 * into a participation trophy. On an explanation step there is nothing
 * countable to require, and blocking would strand them mid-lesson — so those
 * pass through.
 */
const { gateAdvance } = require('../../utils/pipeline/stepEvaluator');

const conv = (results = []) => ({
  messages: results.map((r) => (r === 'ADV'
    ? { role: 'user', content: 'x', scaffoldAdvanced: true }
    : { role: 'assistant', content: 'x', problemResult: r })),
});

describe('practice steps must be earned', () => {
  const step = { type: 'independent_practice', title: 'You do' };

  test('no demonstrated work → advance is blocked', () => {
    const g = gateAdvance(step, conv([]), { wasCorrect: false });
    expect(g.allow).toBe(false);
    expect(g.reason).toBe('insufficient_evidence');
  });

  test('one correct is not enough (default bar is 2)', () => {
    expect(gateAdvance(step, conv([]), { wasCorrect: true }).allow).toBe(false);
  });

  test('two verified-correct → advance allowed', () => {
    expect(gateAdvance(step, conv(['correct']), { wasCorrect: true }).allow).toBe(true);
  });

  test('evidence resets at the previous advance — old wins do not carry over', () => {
    // two correct, then an advance, then nothing: the window is empty again.
    expect(gateAdvance(step, conv(['correct', 'correct', 'ADV']), { wasCorrect: false }).allow).toBe(false);
  });

  test('wrong answers do not count as evidence', () => {
    expect(gateAdvance(step, conv(['incorrect', 'incorrect']), { wasCorrect: false }).allow).toBe(false);
  });

  test('a step can raise its own bar via completion.min_correct', () => {
    const strict = { type: 'guided_practice', completion: { mode: 'deterministic', min_correct: 3 } };
    expect(gateAdvance(strict, conv(['correct']), { wasCorrect: true }).allow).toBe(false);
    expect(gateAdvance(strict, conv(['correct', 'correct']), { wasCorrect: true }).allow).toBe(true);
  });

  test('parent courses keep their lower bar', () => {
    expect(gateAdvance(step, conv([]), { wasCorrect: false, isParentCourse: true }).allow).toBe(true);
  });
});

describe('non-practice steps pass through — the gate never strands a student', () => {
  test.each([
    ['explanation', { type: 'explanation' }],
    ['concept-intro', { type: 'concept-intro' }],
    ['model / i-do', { type: 'model' }],
    ['check-in', { type: 'check-in' }],
  ])('%s advances on the model\'s judgment', (_label, step) => {
    expect(gateAdvance(step, conv([]), { wasCorrect: false }).allow).toBe(true);
  });

  test('missing or malformed step data never blocks', () => {
    expect(gateAdvance(null, conv([]), {}).allow).toBe(true);
    expect(gateAdvance({}, null, {}).allow).toBe(true);
  });
});

describe('the gate runs BEFORE persist stamps the advance boundary', () => {
  const fs = require('fs');
  const path = require('path');
  test('pipeline gates, then merges signals, then persists', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
    const gateAt = src.indexOf('gateAdvance(ctx.courseStep');
    const mergeAt = src.indexOf('mergeLlmSignals(sidecar');
    const persistAt = src.indexOf('Stage 6: PERSIST');
    expect(gateAt).toBeGreaterThan(0);
    expect(gateAt).toBeLessThan(mergeAt);
    expect(mergeAt).toBeLessThan(persistAt);
  });
  test('the route hands the pipeline the current step', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
    expect(src).toContain('courseStep: courseScaffoldCtx?.step || null');
  });
});
