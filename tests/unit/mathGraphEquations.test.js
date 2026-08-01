/**
 * Equation parsing for SYSTEM_GRAPH, and the normalizer bug it sits next to.
 *
 * Two things are pinned here:
 *
 * 1. parseEquation — a system arrives in whatever notation the student's
 *    problem uses ("2x + 3y = 12", "x = 4", "x² + y² = 25"), not pre-solved
 *    for y. Each form has to become something drawable or be rejected
 *    outright; quietly turning one into the wrong curve is the failure mode
 *    that matters, because a wrong line still looks like a graph.
 *
 * 2. normalizeFunctionString — the prose fallbacks used to match on
 *    SUBSTRINGS, so "sin(2x)" (contains "sin") was rewritten to a bare
 *    "sin(x)" and the student was shown the wrong curve with the right title.
 *    Every named function was affected. Real expressions must now survive
 *    verbatim while genuine prose still maps.
 *
 * Both files are browser IIFEs, so they're loaded into a vm sandbox with
 * window/document shims — same approach as mathGraphParser.test.js.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSandbox() {
  const stubEl = () => ({
    style: {},
    dataset: {},
    innerHTML: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, setAttribute() {}, addEventListener() {}, remove() {},
    insertAdjacentHTML() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const document = {
    createElement: stubEl,
    head: stubEl(),
    body: stubEl(),
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const sandbox = {
    window: {},
    document,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    requestAnimationFrame: () => 0,
  };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  const load = (rel) => vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '../../public/js/', rel), 'utf8'),
    sandbox
  );
  load('mathGraph.js');
  load('inlineChatVisuals.js');
  return sandbox;
}

const sandbox = loadSandbox();
const { parseEquation } = sandbox.window.MathEquation;
const MathEval = sandbox.window.MathEval;
const normalize = (s) => sandbox.window.inlineChatVisuals.normalizeFunctionString(s);

describe('parseEquation — the forms a system is actually written in', () => {
  test('slope-intercept: y = 2x + 1', () => {
    const eq = parseEquation('y = 2x + 1');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(0)).toBeCloseTo(1, 9);
    expect(eq.evaluator(3)).toBeCloseTo(7, 9);
  });

  test('standard form is solved for y: 2x + 3y = 12', () => {
    const eq = parseEquation('2x + 3y = 12');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(0)).toBeCloseTo(4, 9);
    expect(eq.evaluator(3)).toBeCloseTo(2, 9);
  });

  test('y on the right: 3x - 5 = y', () => {
    const eq = parseEquation('3x - 5 = y');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(2)).toBeCloseTo(1, 9);
  });

  test('negative y coefficient: 3x - y = 5', () => {
    const eq = parseEquation('3x - y = 5');
    expect(eq.evaluator(2)).toBeCloseTo(1, 9);
    expect(eq.evaluator(0)).toBeCloseTo(-5, 9);
  });

  test('function notation is just y: f(x) = x^2 - 3', () => {
    const eq = parseEquation('f(x) = x^2 - 3');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(2)).toBeCloseTo(1, 9);
  });

  test('a bare expression is treated as y = that expression', () => {
    const eq = parseEquation('-x + 4');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(1)).toBeCloseTo(3, 9);
  });

  test('vertical line: x = 4 is NOT a function and is flagged as such', () => {
    const eq = parseEquation('x = 4');
    expect(eq.kind).toBe('vertical');
    expect(eq.x).toBeCloseTo(4, 9);
  });

  test('vertical line is solved, not pattern-matched: 2x = 7', () => {
    const eq = parseEquation('2x = 7');
    expect(eq.kind).toBe('vertical');
    expect(eq.x).toBeCloseTo(3.5, 9);
  });

  test('horizontal line: y = 3', () => {
    const eq = parseEquation('y = 3');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(-8)).toBeCloseTo(3, 9);
  });

  test('curved in y → implicit, since no y = f(x) form exists: x^2 + y^2 = 25', () => {
    const eq = parseEquation('x^2 + y^2 = 25');
    expect(eq.kind).toBe('implicit');
    expect(eq.F(3, 4)).toBeCloseTo(0, 9);   // on the circle
    expect(eq.F(0, 0)).toBeCloseTo(-25, 9); // inside it
  });

  test('coefficient of y may itself depend on x: xy = 6', () => {
    // Solved pointwise rather than algebraically, so y = 6/x falls out.
    const eq = parseEquation('xy = 6');
    expect(eq.kind).toBe('explicit');
    expect(eq.evaluator(2)).toBeCloseTo(3, 9);
    expect(eq.evaluator(-3)).toBeCloseTo(-2, 9);
  });

  test('trig survives intact: y = sin(2x)', () => {
    const eq = parseEquation('y = sin(2x)');
    expect(eq.evaluator(Math.PI / 4)).toBeCloseTo(1, 9);
  });

  test('prose is rejected rather than guessed at', () => {
    expect(parseEquation('the sine function')).toBeNull();
    expect(parseEquation('')).toBeNull();
    expect(parseEquation(null)).toBeNull();
  });

  test('an unsatisfiable equation is rejected, not drawn at x=0', () => {
    expect(parseEquation('4 = 5')).toBeNull();
  });
});

describe('normalizeFunctionString — real expressions must not collapse', () => {
  // The regression: each of these contains a function name as a substring and
  // was being replaced by that bare parent function.
  test.each([
    ['sin(2x)', 'sin(2x)'],
    ['3*cos(x)+1', '3*cos(x)+1'],
    ['tan(x/2)', 'tan(x/2)'],
    ['sqrt(x+3)', 'sqrt(x+3)'],
    ['log(x)+2', 'log(x)+2'],
    ['sin(x)+cos(x)', 'sin(x)+cos(x)'],
    ['(x^2-4)/(x-2)', '(x^2-4)/(x-2)'],
    ['2^x', '2^x'],
    ['x^2+3*x-4', 'x^2+3*x-4'],
  ])('%s is plotted as written', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  test('a leading y= is stripped, not treated as an unknown variable', () => {
    expect(normalize('y = 2x+1')).toBe('2x+1');
  });

  test('genuine prose still maps to a function', () => {
    expect(normalize('sine')).toBe('sin(x)');
    expect(normalize('the sine function')).toBe('sin(x)');
    expect(normalize('tangent')).toBe('tan(x)');
    expect(normalize('parabola')).toBe('x^2');
  });

  test('a number scraped off a worksheet is still rejected', () => {
    // "1783" compiles fine as a constant — it must be rejected for having no
    // variable, or it plots as a meaningless flat line.
    expect(normalize('1783')).toBe('x^2');
  });

  test('half-math prose does not sneak through as a prefix', () => {
    expect(normalize('x^2 is the answer')).toBe('x^2');
  });
});

describe('MathEval — multi-variable and trig support', () => {
  test('extra variables resolve from the scope, others still throw', () => {
    const f = MathEval.parse('2x + 3y', { vars: ['y'] });
    expect(f(1, { y: 2 })).toBeCloseTo(8, 9);
    expect(() => MathEval.parse('2x + 3z', { vars: ['y'] })).toThrow();
  });

  test('the primary variable can be renamed for parametric curves', () => {
    const f = MathEval.parse('cos(t)', { varName: 't' });
    expect(f(0)).toBeCloseTo(1, 9);
    expect(f(Math.PI)).toBeCloseTo(-1, 9);
  });

  test('single-argument callers are unaffected by the scope parameter', () => {
    const f = MathEval.parse('x^2 + 1');
    expect(f(3)).toBeCloseTo(10, 9);
  });

  test('adjacent variables multiply, but function names are never split', () => {
    expect(MathEval.parse('xy', { vars: ['y'] })(3, { y: 4 })).toBeCloseTo(12, 9);
    expect(MathEval.parse('sin(x)')(Math.PI / 2)).toBeCloseTo(1, 9);
    expect(MathEval.parse('tan(x)')(0)).toBeCloseTo(0, 9);
  });

  test('hasTrig drives the π-axis decision', () => {
    expect(MathEval.hasTrig('3*sin(2*x)')).toBe(true);
    expect(MathEval.hasTrig('cot(x)')).toBe(true);
    expect(MathEval.hasTrig('x^2 + 1')).toBe(false);
    // "tan" inside a longer word is not a trig call.
    expect(MathEval.hasTrig('instant')).toBe(false);
  });

  test('isPlottable separates expressions from prose', () => {
    expect(MathEval.isPlottable('sin(2x)')).toBe(true);
    expect(MathEval.isPlottable('the sine function')).toBe(false);
    expect(MathEval.isPlottable('x^2 is the answer')).toBe(false);
  });
});
