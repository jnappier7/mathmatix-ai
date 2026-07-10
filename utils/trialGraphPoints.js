/**
 * trialGraphPoints — server-side plot-point generation for the trial living board.
 *
 * The lightweight trial notebook can't run the workspace/JSXGraph stack, and we
 * must NEVER draw wrong math. So instead of parsing/evaluating functions on the
 * client, we evaluate f(x) here with the VETTED exact-rational engine
 * (rationalEvaluator — the single numeric core the grader trusts) and ship the
 * client a list of [x, y] points to draw. The client just connects dots.
 *
 * Supported: polynomials / rationals over + - * / ^ (), unary minus, implicit
 * multiplication ("2x", "3(x+1)"). Anything with other functions/constants
 * (sqrt, sin, e, pi, …) fails SAFE — samplePoints returns null and the caller
 * drops the graph rather than render a guess.
 */

const { evaluate } = require('./rationalEvaluator');

// Insert explicit `*` for the implicit-multiplication forms tutors write, so the
// (multiplication-explicit) rational evaluator sees a well-formed expression.
function normalizeImplicitMult(fn) {
  return String(fn).toLowerCase().replace(/\s+/g, '')
    .replace(/(\d)x/g, '$1*x')   // 2x   → 2*x
    .replace(/x(\d)/g, 'x*$1')   // x2   → x*2 (rare)
    .replace(/\)\(/g, ')*(')     // )(   → )*(
    .replace(/(\d)\(/g, '$1*(')  // 2(   → 2*(
    .replace(/\)(\d)/g, ')*$1')  // )2   → )*2
    .replace(/x\(/g, 'x*(')      // x(   → x*(
    .replace(/\)x/g, ')*x')      // )x   → )*x
    .replace(/xx/g, 'x*x');      // xx   → x*x
}

function evalAt(normFn, xVal) {
  // Substitute the concrete value (parenthesized so unary signs are safe).
  const r = evaluate(normFn.replace(/x/g, '(' + xVal + ')'));
  if (!r) return null;
  const y = Number(r.n) / Number(r.d);
  return Number.isFinite(y) ? y : null;
}

function samplePoints(fn, opts = {}) {
  if (!fn || typeof fn !== 'string') return null;
  const xMin = opts.xMin != null ? opts.xMin : -10;
  const xMax = opts.xMax != null ? opts.xMax : 10;
  const steps = opts.steps || 100;
  const clampY = opts.clampY != null ? opts.clampY : 1000; // drop blow-ups (asymptotes)
  if (!(xMax > xMin)) return null;

  // Tolerate "y = ...", "f(x) = ..." forms; we only need the right-hand side.
  const rhs = String(fn).replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
  const norm = normalizeImplicitMult(rhs);
  // Fail safe: any letter other than x means an unsupported function/constant.
  if (/[a-wy-z]/.test(norm.replace(/x/g, ''))) return null;

  const points = [];
  let plotted = 0;
  for (let i = 0; i <= steps; i++) {
    const x = parseFloat((xMin + (i * (xMax - xMin)) / steps).toFixed(3));
    const y = evalAt(norm, x);
    if (y === null || Math.abs(y) > clampY) { points.push(null); continue; } // gap
    points.push([x, parseFloat(y.toFixed(3))]);
    plotted++;
  }
  if (plotted < 2) return null; // not plottable

  const ys = points.filter(Boolean).map(p => p[1]);
  return { points, xMin, xMax, yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

module.exports = { samplePoints, normalizeImplicitMult };
