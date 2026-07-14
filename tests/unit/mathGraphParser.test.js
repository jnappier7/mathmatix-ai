/**
 * mathGraph parser — operator precedence for the function grapher.
 *
 * The bug this guards against: `4x^2-7x` was parsed as pow(4*x, 2) =
 * (4x)^2 = 16x^2, because implicit multiplication bound TIGHTER than
 * exponentiation. Every graphed quadratic with a leading coefficient
 * (curve, key points, and hover slope) was drawn for the wrong function
 * — e.g. the slope at x=3 read ~90 (deriv of 16x^2-7x) instead of 17.
 *
 * Standard convention: `^` binds tighter than implied multiplication, so
 * `4x^2` = 4*(x^2). Parentheses still override: `(4x)^2` = 16x^2.
 *
 * mathGraph.js is a browser IIFE that attaches MathEval to `window`, so we
 * load it into a vm sandbox with a window shim and exercise MathEval.parse,
 * which compiles an expression string into an (x) => number evaluator.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(
  path.resolve(__dirname, '../../public/js/mathGraph.js'),
  'utf8'
);
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const MathEval = sandbox.window.MathEval;

// Compile via MathEval so `this.tokenize` resolves.
const compile = (expr) => MathEval.parse(expr);

const XS = [-3, -2, -0.5, 0, 0.5, 1, 2, 3, 4];
function agreesWith(expr, truth) {
  const f = compile(expr);
  for (const x of XS) {
    expect(f(x)).toBeCloseTo(truth(x), 9);
  }
}

describe('mathGraph parser — exponent binds tighter than implicit multiplication', () => {
  test('4x^2-7x === 4*(x^2) - 7x  (the reported bug)', () => {
    agreesWith('4x^2-7x', (x) => 4 * x * x - 7 * x);
  });

  test('coefficient stays outside the exponent for various powers', () => {
    agreesWith('3x^2', (x) => 3 * x * x);
    agreesWith('2x^3', (x) => 2 * x * x * x);
    agreesWith('3x^2+2x-1', (x) => 3 * x * x + 2 * x - 1);
  });

  test('4x^2-7x has a root at 1.75, NOT the buggy 0.4375', () => {
    const f = compile('4x^2-7x');
    expect(f(1.75)).toBeCloseTo(0, 9); // true non-zero root
    expect(f(0)).toBeCloseTo(0, 9); // true root at origin
    expect(Math.abs(f(0.4375))).toBeGreaterThan(1); // the old (16x^2) root
  });

  test('slope at x=3 corresponds to 8x-7 (=17), not 32x-7 (=89)', () => {
    const f = compile('4x^2-7x');
    const h = 1e-6;
    const slope = (f(3 + h) - f(3 - h)) / (2 * h);
    expect(slope).toBeCloseTo(17, 4);
  });
});

describe('mathGraph parser — precedence edge cases still correct', () => {
  test('parentheses override: (4x)^2 === 16x^2', () => {
    agreesWith('(4x)^2', (x) => 16 * x * x);
  });

  test('unary minus outside power: -x^2 === -(x^2)', () => {
    agreesWith('-x^2', (x) => -(x * x));
  });

  test('negative exponent: x^-1 === 1/x', () => {
    const f = compile('x^-1');
    for (const x of XS.filter((v) => v !== 0)) {
      expect(f(x)).toBeCloseTo(1 / x, 9);
    }
  });

  test('right-associative exponent: 2^3^2 === 2^(3^2) === 512', () => {
    expect(compile('2^3^2')(0)).toBeCloseTo(512, 9);
  });

  test('plain x^2 unaffected', () => {
    agreesWith('x^2', (x) => x * x);
  });
});
