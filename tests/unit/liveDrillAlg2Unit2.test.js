/**
 * Algebra 2 · Unit 2 Review (utils/liveDrill/review/alg2Unit2.js) — Function Algebra.
 *
 * Every play well formed, the drill registered with a playbook per lesson (2.1 … 2.3), and every
 * computed answer re-solved from the printed question: each function is rebuilt from its printed
 * definition (or its table, or the dots on its graph) and the expression asked for is evaluated
 * again — a number for a number in, and for an answer "in terms of x" the key has to agree with
 * the asked expression at every value tried while no wrong choice does. Average rates of change
 * are recomputed from the two endpoints. Nothing is read from the bank.
 */
const K = require('../helpers/alg2UnitKit');
const bank = require('../../utils/liveDrill/review/alg2Unit2');
const { DRILLS, listPlaybooks, listSections } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');

const { calc, close, keyOf, wrongsOf, typedOf, promptOf, askOf, linesOf, figs } = K;
function only(p, good) {
  const ok = (s) => { try { return !!good(s); } catch { return false; } };
  expect([keyOf(p), ok(keyOf(p))]).toEqual([keyOf(p), true]);
  for (const w of wrongsOf(p)) expect([w, ok(w)]).toEqual([w, false]);
}
/** A function given by a table: only the listed inputs have a value. */
const lookup = (xs, ys) => (x) => { const i = xs.findIndex((v) => Math.abs(v - x) < 1e-9); if (i < 0) throw new Error(`no table value at ${x}`); return ys[i]; };
const tableFn = (svg) => { const t = K.tableOf(svg); return { name: t.bottom[0], f: lookup(t.xs, t.ys), ...t }; };
/** What is asked: the expression after "Evaluate" / "Simplify" / "Find" (or after "Use the … to evaluate"). */
const asked = (p) => K.unfold(askOf(p).replace(/^.*\bevaluate /i, '').replace(/^\w+ /, (w) => (/^(Simplify|Find|Evaluate) $/.test(w) ? '' : w)));
/** The key equals the asked expression for every value of its variable(s); no wrong choice does. */
function equivalent(p, fns, expr = asked(p)) {
  const vars = K.lettersIn(expr, Object.keys(fns));
  expect(vars.length).toBeGreaterThan(0);
  only(p, (s) => K.same(expr, s, vars, { fns }));
}
const aroc = (f, a, b) => (f(b) - f(a)) / (b - a);
const interval = (s) => { const m = s.match(/(-?\d+) ≤ x ≤ (-?\d+)/); return [Number(m[1]), Number(m[2])]; };

describe('alg2 unit 2: registered', () => {
  test('a drill on the Algebra 2 hub with a playbook per lesson', () => {
    expect(DRILLS.alg2u2.title).toBe('Algebra 2 · Unit 2 Review');
    expect(listPlaybooks('alg2u2').map((b) => b.key)).toEqual(['all', 'l1', 'l2', 'l3']);
    expect(listSections('alg2u2').map((s) => s.key)).toEqual(['2.1', '2.2', '2.3']);
    expect(solo.HUBS.algebra2.games.map((g) => g.drill)).toContain('alg2u2');
    for (const b of Object.keys(bank.BOOKS).filter((k) => k !== 'all')) expect(Object.values(bank.TEMPLATES).filter((t) => t.book === b).length).toBeGreaterThanOrEqual(5);
  });
});

describe('alg2 unit 2: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => K.wellFormed(bank, id));
});

const CHECK = {
  // ---- 2.1
  evaluateNumber(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  findTheInput(p) { const fns = K.defs(linesOf(p)); const [, f, c] = askOf(p).match(/when ([a-z])\(x\) = (-?\d+)$/); expect(fns[f](typedOf(p))).toBe(Number(c)); },
  coefficientTimesValue(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  combineValues(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  quotientOfValues(p) { const lines = linesOf(p); expect(lines).toHaveLength(3); expect(close(typedOf(p), calc(lines[2], { fns: K.defs(lines) }))).toBe(true); },
  zeroPower(p) {
    const lines = linesOf(p); const fns = K.defs(lines);
    expect(fns.p(0)).toBe(0); // the exponent really is 0
    only(p, (s) => close(Number(s), calc(lines[2], { fns })));
  },
  tableAndEquation(p) { const fns = K.defs(linesOf(p)); const t = tableFn(figs(p)[0]); fns[t.name] = t.f; expect(close(typedOf(p), calc(asked(p), { fns }))).toBe(true); },
  simplifyOrEvaluate(p) { only(p, (s) => /[a-z]\(x\)/.test(s)); },
  scaleAndAdd(p) { equivalent(p, K.defs(linesOf(p))); },
  subtractFunctions(p) { equivalent(p, K.defs(linesOf(p))); },
  multiplyFunctions(p) { equivalent(p, K.defs(linesOf(p))); },
  squareAFunction(p) { equivalent(p, K.defs(linesOf(p))); },
  monomialInput(p) { equivalent(p, K.defs(linesOf(p))); },
  binomialInput(p) { equivalent(p, K.defs(linesOf(p))); },
  solveAtAnExpression(p) {
    const fns = K.defs(linesOf(p)); const [, lhs, rhs] = askOf(p).match(/^Find x if (.+) = (-?\d+)$/);
    expect(calc(lhs, { x: typedOf(p), fns })).toBe(Number(rhs));
  },
  numberPlusFunction(p) { const fns = K.defs(linesOf(p)); const t = tableFn(figs(p)[0]); fns[t.name] = t.f; equivalent(p, fns); },
  // ---- 2.2
  compositionMeans(p) {
    const ask = askOf(p); const q = promptOf(p);
    const m = q.match(/^\(([a-z])∘([a-z])\)\(x\)$/) || q.match(/^([a-z])\(([a-z])\(x\)\)$/);
    if (/means…$/.test(ask)) expect(keyOf(p)).toBe(`${m[1]}(${m[2]}(x))`);
    else if (/FIRST/.test(ask)) expect(keyOf(p)).toBe(`${m[2]} — work from the inside out`);
    else expect(keyOf(p)).toBe('the symbol for composition');
  },
  compositionAtANumber(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  composeWithItself(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  rootComposition(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  tripleComposition(p) { expect(close(typedOf(p), calc(asked(p), { fns: K.defs(linesOf(p)) }))).toBe(true); },
  compositionFormula(p) { equivalent(p, K.defs(linesOf(p))); },
  compositionWithASquare(p) { equivalent(p, K.defs(linesOf(p)), 'f(g(x))'); expect(askOf(p)).toMatch(/\(f∘g\)\(x\)/); },
  undoingPair(p) { equivalent(p, K.defs(linesOf(p))); expect(keyOf(p)).toBe('x'); },
  compositionFromTables(p) {
    const [a, b] = figs(p).map(tableFn); const fns = { [a.name]: a.f, [b.name]: b.f };
    expect([a.name, b.name]).toEqual(['f', 'g']);
    for (const t of [a, b]) expect(new Set(t.xs).size).toBe(t.xs.length); // each table is a function
    expect(close(typedOf(p), calc(asked(p), { fns }))).toBe(true);
  },
  compositionFromGraphs(p) {
    const svg = figs(p)[0]; const read = (color) => { const d = K.dots(svg, color).map(([x, y]) => [Math.round(x), Math.round(y)]); return lookup(d.map((q) => q[0]), d.map((q) => q[1])); };
    const fns = { f: read(K.BLUE), g: read(K.RED) }; // f is the line (blue), g the parabola (red), as the card says
    expect(K.curves(svg, K.BLUE)[0].every(([x, y], i, a) => i < 2 || close((y - a[0][1]) * (a[1][0] - a[0][0]), (a[1][1] - a[0][1]) * (x - a[0][0]), 1e-3))).toBe(true); // blue is straight
    expect(close(typedOf(p), calc(asked(p), { fns }))).toBe(true);
  },
  // ---- 2.3
  arocFormula(p) {
    if (/Graphically/.test(askOf(p))) expect(keyOf(p)).toBe('slope');
    else expect(keyOf(p)).toBe('((f(x_2) - f(x_1))/(x_2 - x_1))');
  },
  differenceQuotient(p) {
    const ask = askOf(p); const f = ask.match(/change of ([a-z]) over/)[1]; const [a, b] = interval(ask);
    expect(a).toBeLessThan(0); // the case that matters: subtracting a negative
    expect(keyOf(p)).toBe(`((${f}(${b}) - ${f}(${a}))/(${b} - (${a})))`);
  },
  arocFromEquation(p) { const lines = linesOf(p); const f = Object.values(K.defs(lines))[0]; const [a, b] = interval(lines[1]); expect(close(typedOf(p), aroc(f, a, b))).toBe(true); },
  arocFromTable(p) { const t = tableFn(figs(p)[0]); const [a, b] = interval(askOf(p)); expect(close(typedOf(p), aroc(t.f, a, b))).toBe(true); },
  arocFromGraph(p) {
    const d = K.dots(figs(p)[0]).map(([x, y]) => [Math.round(x), Math.round(y)]); const f = lookup(d.map((q) => q[0]), d.map((q) => q[1]));
    const [a, b] = interval(askOf(p)); expect(close(typedOf(p), aroc(f, a, b))).toBe(true);
  },
  smallestAroc(p) {
    const { xs, ys } = K.tableOf(figs(p)[0]); const rates = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
    const least = Math.min(...rates); expect(rates.filter((r) => r === least)).toHaveLength(1);
    const i = rates.indexOf(least);
    expect(keyOf(p)).toBe(`x = ${xs[i]} to x = ${xs[i + 1]}`);
    // the trap is on the card: the interval with the smallest CHANGE in p is a different one
    const changes = xs.slice(1).map((x, j) => ys[j + 1] - ys[j]);
    expect(changes.indexOf(Math.min(...changes))).not.toBe(i);
  },
};

describe('alg2 unit 2: every answer re-solved from the printed question', () => {
  test('every template has a check', () => { expect(Object.keys(CHECK).sort()).toEqual(Object.keys(bank.TEMPLATES).sort()); });
  test.each(Object.keys(CHECK))('%s', (id) => { for (const p of K.deal(bank, id)) CHECK[id](p); });
  test('the evaluator reads the packet\'s own examples the way its key does', () => {
    // Evaluating Functions Practice #1 (printed Homework Solutions): p(x) = x² + 2x, m(x) = 8x + 3
    const fns = K.defs(['p(x) = x^(2) + 2x', 'm(x) = 8x + 3']);
    expect(calc('4p(2) + 7', { fns })).toBe(39); // 1b
    expect(calc('[m(5)]^(p(0))', { fns })).toBe(1); // 1f
    expect(K.same('[m(x)]^(2)', '64x^(2) + 48x + 9', ['x'], { fns })).toBe(true); // 1e
    expect(K.same('p(x)·m(x)', '8x^(3) + 19x^(2) + 6x', ['x'], { fns })).toBe(true); // 1h
    expect(K.same('m(5b)', '40b + 3', ['b'], { fns })).toBe(true); // 4a
    expect(calc(K.unfold('(f∘g∘h)(2)'), { fns: K.defs(['f(x) = x^(2) + 5', 'g(x) = 9x - 1', 'h(x) = -2x']) })).toBe(1374); // Composition notes, Example 2d
  });
});
