// tests/unit/inlineGraphGate.test.js
// Visual-gate coverage for legacy inline [FUNCTION_GRAPH:...] tags. Uses the
// REAL applyVisualGate for the deterministic leak path (no network), and an
// injected value judge for the relevance path.

const {
  gateInlineGraphTags,
  containsInlineGraphTag,
  parseTagParams,
  splitParams,
} = require('../../utils/pipeline/inlineGraphGate');

const UNSOLVED = (correctAnswer, extra = {}) => ({
  problemText: null,
  normalizedExpression: null,
  correctAnswer,
  problemType: null,
  status: 'unsolved',
  ...extra,
});

describe('parsing helpers', () => {
  test('containsInlineGraphTag detects the graph family, ignores prose', () => {
    expect(containsInlineGraphTag('here [FUNCTION_GRAPH:fn=x^2]')).toBe(true);
    expect(containsInlineGraphTag('use [SLIDER_GRAPH:fn=m*x+b]')).toBe(true);
    expect(containsInlineGraphTag('no visuals here')).toBe(false);
    expect(containsInlineGraphTag('[FRACTION:3/4]')).toBe(false); // not a plot
    expect(containsInlineGraphTag(null)).toBe(false);
  });

  test('splitParams respects quoted commas', () => {
    expect(splitParams('fn=sin(x)/x,xMin=-10,title="Graph of sin(x)/x"'))
      .toEqual(['fn=sin(x)/x', 'xMin=-10', 'title="Graph of sin(x)/x"']);
    expect(splitParams('fn=a*x^2+b,params="a:1:-3:3,b:0:-5:5",title="T"'))
      .toEqual(['fn=a*x^2+b', 'params="a:1:-3:3,b:0:-5:5"', 'title="T"']);
  });

  test('parseTagParams extracts fn and unquotes title', () => {
    expect(parseTagParams('fn=x^2-5x+6,xMin=-10,xMax=10,title="Graph of sin(x)/x"'))
      .toEqual({ fn: 'x^2-5x+6', title: 'Graph of sin(x)/x' });
    expect(parseTagParams('xMin=-5').fn).toBeNull();
  });
});

describe('gateInlineGraphTags — leak protection (deterministic, live_control)', () => {
  test('strips a graph of the student\'s own unsolved function (root leak)', async () => {
    const text = 'Let me show you. [FUNCTION_GRAPH:fn=x-2,xMin=-5,xMax=5,title="plot"] See?';
    const { text: out, records } = await gateInlineGraphTags({
      text, activeProblem: UNSOLVED('x = 2'), mode: 'live_control',
    });
    expect(out).not.toContain('FUNCTION_GRAPH');
    expect(out).toContain('Let me show you.');
    expect(out).toContain('See?');
    expect(records[0].decision).toBe('block');
  });

  test('strips a quadratic whose roots equal the known answer', async () => {
    const text = '[FUNCTION_GRAPH:fn=x^2-5x+6,xMin=-2,xMax=6]';
    const { text: out } = await gateInlineGraphTags({
      text, activeProblem: UNSOLVED('x = 2 or x = 3'), mode: 'live_control',
    });
    expect(out).toBe('');
  });

  test('ALLOWS the graph when graphing IS the assignment', async () => {
    const text = 'Sure! [FUNCTION_GRAPH:fn=x-2,xMin=-5,xMax=5]';
    const { text: out } = await gateInlineGraphTags({
      text,
      activeProblem: UNSOLVED('x = 2', { problemText: 'graph the line y = x - 2' }),
      mode: 'live_control',
    });
    expect(out).toContain('FUNCTION_GRAPH');
  });

  test('shadow mode observes but never edits the text', async () => {
    const text = '[FUNCTION_GRAPH:fn=x-2]';
    const { text: out, records } = await gateInlineGraphTags({
      text, activeProblem: UNSOLVED('x = 2'), mode: 'shadow',
    });
    expect(out).toBe(text); // unchanged
    expect(records[0].decision).toBe('block'); // but the intent is recorded
  });

  test('leaves an unrelated graph alone by default (no active problem, value judge off)', async () => {
    const text = 'Cool fact! [FUNCTION_GRAPH:fn=sin(x)/x,xMin=-10,xMax=10,title="Graph of sin(x)/x"]';
    const { text: out } = await gateInlineGraphTags({
      text,
      activeProblem: { problemText: null, normalizedExpression: null, correctAnswer: null, status: 'unknown' },
      mode: 'live_control',
    });
    expect(out).toContain('sin(x)/x'); // leak-only default does not touch decorative
  });
});

describe('gateInlineGraphTags — relevance (value judge on)', () => {
  test('strips a decorative graph when the injected judge says it does not earn its place', async () => {
    const text = 'Neat! [FUNCTION_GRAPH:fn=sin(x)/x,xMin=-10,xMax=10]';
    const rejectingJudge = async () => ({ earns_place: false, visual_purpose: 'none', audit_reason: 'decorative' });
    const { text: out, records } = await gateInlineGraphTags({
      text,
      activeProblem: { problemText: null, normalizedExpression: null, correctAnswer: null, status: 'unsolved' },
      mode: 'live_control',
      enableValueJudge: true,
      valueJudge: rejectingJudge,
    });
    expect(out).not.toContain('FUNCTION_GRAPH');
    expect(records[0].decision).toBe('block');
  });

  test('keeps a graph the judge approves', async () => {
    const text = 'Look: [FUNCTION_GRAPH:fn=x^3,xMin=-3,xMax=3]';
    const approvingJudge = async () => ({ earns_place: true, visual_purpose: 'expose_structure', audit_reason: 'ok' });
    const { text: out } = await gateInlineGraphTags({
      text,
      activeProblem: { problemText: null, normalizedExpression: null, correctAnswer: null, status: 'unsolved' },
      mode: 'live_control',
      enableValueJudge: true,
      valueJudge: approvingJudge,
    });
    expect(out).toContain('x^3');
  });
});

describe('gateInlineGraphTags — robustness', () => {
  test('no tags → text returned untouched, no records', async () => {
    const text = 'Just a normal tutoring reply with no visuals.';
    const { text: out, records } = await gateInlineGraphTags({ text, activeProblem: UNSOLVED('x=2'), mode: 'live_control' });
    expect(out).toBe(text);
    expect(records).toHaveLength(0);
  });

  test('handles multiple identical tags with one decision', async () => {
    const text = '[FUNCTION_GRAPH:fn=x-2] and again [FUNCTION_GRAPH:fn=x-2]';
    const { text: out } = await gateInlineGraphTags({ text, activeProblem: UNSOLVED('x = 2'), mode: 'live_control' });
    expect(out).not.toContain('FUNCTION_GRAPH');
  });
});
