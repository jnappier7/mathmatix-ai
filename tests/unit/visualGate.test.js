const {
  applyVisualGate,
  assessLeak,
  buildParallelReplacement,
  normalizeExpr,
  extractNumbers,
  graphRevealedValues,
  visualIsTheTask,
  MODES,
} = require('../../utils/visualGate');

// A value judge stub so the safe-path tests never touch the network.
const allowJudge = async () => ({ earns_place: true, visual_purpose: 'expose_structure', audit_reason: 'stub' });
const rejectJudge = async () => ({ earns_place: false, visual_purpose: 'none', audit_reason: 'stub decorative' });

const quadratic = {
  problemText: 'Find the roots of x^2 - 5x + 6',
  normalizedExpression: 'x^2 - 5x + 6',
  correctAnswer: 'x = 2 or x = 3',
  problemType: 'quadratic',
  status: 'unsolved',
};

describe('visualGate — helpers', () => {
  it('normalizeExpr strips y=, whitespace, unicode powers, ** ', () => {
    expect(normalizeExpr('y = x² - 5x + 6')).toBe('x^2-5x+6');
    expect(normalizeExpr('f(x) = x**2 - 5x + 6')).toBe('x^2-5x+6');
  });

  it('extractNumbers pulls the solution set and skips qualitative answers', () => {
    expect(extractNumbers('x = 2 or x = 3')).toEqual([2, 3]);
    expect(extractNumbers('x = -4')).toEqual([-4]);
    expect(extractNumbers('No real solutions')).toEqual([]);
  });

  it('graphRevealedValues computes the roots a graph would expose', () => {
    expect(graphRevealedValues('x^2 - 5x + 6').sort()).toEqual([2, 3]);
  });

  it('visualIsTheTask detects a graphing assignment', () => {
    expect(visualIsTheTask({ problemText: 'Graph y = x^2 - 5x + 6' })).toBe(true);
    expect(visualIsTheTask({ problemText: 'Find the roots of x^2 - 5x + 6' })).toBe(false);
  });
});

describe('visualGate — assessLeak (deterministic safety)', () => {
  it('Test 1: exact quadratic graph leak is fatal', () => {
    const r = assessLeak({ action: 'graph', fn: 'x^2 - 5x + 6' }, quadratic);
    expect(r.leak).toBe(true);
    expect(r.reasonCode).toBe('ACTIVE_PROBLEM_EXACT_LEAK');
    expect(r.riskLevel).toBe('fatal');
  });

  it('catches a rearranged/disguised graph via solution intersection', () => {
    // Different-looking expression, same roots {2,3}.
    const r = assessLeak({ action: 'graph', fn: '2x^2 - 10x + 12' }, quadratic);
    expect(r.leak).toBe(true);
    expect(r.reasonCode).toBe('SOLUTION_SET_LEAK');
  });

  it('Test 2: a parallel quadratic with fully disjoint roots is allowed', () => {
    // roots {7,8}, disjoint from the active answer {2,3}
    const r = assessLeak({ action: 'graph', fn: 'x^2 - 15x + 56' }, quadratic);
    expect(r.leak).toBe(false);
  });

  it('blocks a "parallel" that shares even one root with the answer', () => {
    // roots {1,3} — shares 3 with the active answer {2,3}
    const r = assessLeak({ action: 'graph', fn: 'x^2 - 4x + 3' }, quadratic);
    expect(r.leak).toBe(true);
    expect(r.reasonCode).toBe('SOLUTION_SET_LEAK');
  });

  it('allows graphing the function when graphing IS the task', () => {
    const task = { ...quadratic, problemText: 'Graph y = x^2 - 5x + 6', requestedTask: 'graph' };
    const r = assessLeak({ action: 'graph', fn: 'x^2 - 5x + 6' }, task);
    expect(r.leak).toBe(false);
    expect(r.reasonCode).toBe('VISUAL_IS_THE_TASK');
  });

  it('Test 4: missing image query is a fatal malformed command', () => {
    const r = assessLeak({ action: 'image', q: 'balance scale equation' }, quadratic);
    expect(r.leak).toBe(true);
    expect(r.reasonCode).toBe('MISSING_REQUIRED_FIELD');
  });

  it('blocks an image query that embeds the active expression', () => {
    const r = assessLeak({ action: 'image', query: 'x^2 - 5x + 6 roots graph' }, quadratic);
    expect(r.leak).toBe(true);
  });

  it('blocks an image query naming the literal answer value', () => {
    const r = assessLeak({ action: 'image', query: 'number line showing x = 3' }, quadratic);
    expect(r.leak).toBe(true);
    expect(r.reasonCode).toBe('SOLUTION_SET_LEAK');
  });

  it('Test 5: a generic concept image is safe', () => {
    const r = assessLeak(
      { action: 'image', query: 'balance scale equal weight concept' },
      { problemText: 'solve 2x + 5 = 13', normalizedExpression: '2x+5=13', correctAnswer: 'x = 4', status: 'unsolved' },
    );
    expect(r.leak).toBe(false);
  });

  it('a solved problem cannot leak', () => {
    const r = assessLeak({ action: 'graph', fn: 'x^2 - 5x + 6' }, { ...quadratic, status: 'solved' });
    expect(r.leak).toBe(false);
  });
});

describe('visualGate — transform', () => {
  it('builds a parallel quadratic with different roots', () => {
    const rep = buildParallelReplacement({ action: 'graph', fn: 'x^2 - 5x + 6' }, quadratic, null);
    expect(rep).not.toBeNull();
    expect(rep.action).toBe('graph');
    // The replacement must NOT share the original roots {2,3}.
    expect(graphRevealedValues(rep.fn).sort()).not.toEqual([2, 3]);
  });
});

describe('visualGate — orchestrator + modes', () => {
  it('shadow mode logs a block intent but still renders the original', async () => {
    const { command, record } = await applyVisualGate({
      command: { action: 'graph', fn: 'x^2 - 5x + 6' },
      activeProblem: quadratic,
      mode: MODES.SHADOW,
      valueJudge: allowJudge,
    });
    expect(record.decision).toBe('block');
    expect(command).toEqual({ action: 'graph', fn: 'x^2 - 5x + 6' }); // unchanged in shadow
  });

  it('live_control blocks a leaking graph (drops it)', async () => {
    const { command, record } = await applyVisualGate({
      command: { action: 'graph', fn: 'x^2 - 5x + 6' },
      activeProblem: quadratic,
      mode: MODES.LIVE_CONTROL,
      valueJudge: allowJudge,
    });
    expect(record.decision).toBe('block');
    expect(command).toBeNull();
  });

  it('live_experimental transforms a leaking graph into a parallel', async () => {
    const { command, record } = await applyVisualGate({
      command: { action: 'graph', fn: 'x^2 - 5x + 6' },
      activeProblem: quadratic,
      mode: MODES.LIVE_EXPERIMENTAL,
      valueJudge: allowJudge,
    });
    expect(record.decision).toBe('transform');
    expect(command.action).toBe('graph');
    expect(graphRevealedValues(command.fn).sort()).not.toEqual([2, 3]);
  });

  it('live_control blocks a safe-but-decorative visual when the value judge is enabled', async () => {
    const { command, record } = await applyVisualGate({
      command: { action: 'image', query: 'cool math background' },
      activeProblem: quadratic,
      mode: MODES.LIVE_CONTROL,
      enableValueJudge: true,
      valueJudge: rejectJudge,
    });
    expect(record.decision).toBe('block');
    expect(record.reasonCode).toBe('DECORATIVE_OR_LOW_VALUE');
    expect(command).toBeNull();
  });

  it('value judge is OFF by default: a safe-but-decorative visual is allowed (no LLM in the loop)', async () => {
    let judgeCalled = false;
    const spyJudge = async () => { judgeCalled = true; return rejectJudge(); };
    const { command, record } = await applyVisualGate({
      command: { action: 'image', query: 'cool math background' },
      activeProblem: quadratic,
      mode: MODES.LIVE_CONTROL, // enforcement on, but enableValueJudge omitted
      valueJudge: spyJudge,
    });
    expect(judgeCalled).toBe(false);
    expect(record.decision).toBe('allow');
    expect(command).not.toBeNull();
  });

  it('leak enforcement still fires in live_control even with the value judge off', async () => {
    const { command, record } = await applyVisualGate({
      command: { action: 'graph', fn: 'x^2 - 5x + 6' }, // exact leak
      activeProblem: quadratic,
      mode: MODES.LIVE_CONTROL,
      valueJudge: rejectJudge,
    });
    expect(record.decision).toBe('block');
    expect(command).toBeNull();
  });

  it('passes through non-visual commands untouched', async () => {
    const { command } = await applyVisualGate({
      command: { action: 'resolve', tex: '2x = 6' },
      activeProblem: quadratic,
      mode: MODES.LIVE_EXPERIMENTAL,
    });
    expect(command).toEqual({ action: 'resolve', tex: '2x = 6' });
  });
});
