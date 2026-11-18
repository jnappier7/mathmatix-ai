/**
 * Algebra 2 · Unit 0 Review (utils/liveDrill/review/alg2Unit0.js) — Basic Algebra Skills.
 *
 * Same contract as the other native suites: every play well formed, the drill registered on its
 * hub with a playbook per lesson (0.1 … 0.5), and EVERY computed answer re-solved from the printed
 * question — each equation solved again from its own text, each inequality's choices tested in the
 * inequality itself, each slope taken from the two printed points, each monomial and product
 * re-evaluated numerically against the printed expression, each graph question answered from the
 * points actually drawn. The rules are typed here by hand; nothing is read from the bank.
 */
const K = require('../helpers/alg2UnitKit');
const bank = require('../../utils/liveDrill/review/alg2Unit0');
const { DRILLS, listPlaybooks, listSections } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');

const { calc, close, keyOf, wrongsOf, typedOf, promptOf, askOf, linesOf, points, figs } = K;
/** The key passes the test and every wrong choice fails it (a choice the test cannot read fails). */
function only(p, good) {
  const ok = (s) => { try { return !!good(s); } catch { return false; } };
  expect([keyOf(p), ok(keyOf(p))]).toEqual([keyOf(p), true]);
  for (const w of wrongsOf(p)) expect([w, ok(w)]).toEqual([w, false]);
}
const holds = (a, sym, b) => ({ '<': a < b, '>': a > b, '≤': a <= b, '≥': a >= b }[sym]);
const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
const rhs = (s) => s.split(' = ')[1];
/** The graph of three straight pieces as the points drawn. */
const zigOf = (p) => K.corners(figs(p)[0]);
const at = (pts, x) => { for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1]; if (x >= x1 && x <= x2) return y1 + ((y2 - y1) / (x2 - x1)) * (x - x1); } return NaN; };
const pt = (a) => `(${a.join(', ')})`;

describe('alg2 unit 0: registered', () => {
  test('a drill on the Algebra 2 hub with a playbook per lesson', () => {
    expect(DRILLS.alg2u0.title).toBe('Algebra 2 · Unit 0 Review');
    expect(listPlaybooks('alg2u0').map((b) => b.key)).toEqual(['all', 'l1', 'l2', 'l3', 'l4', 'l5']);
    expect(listSections('alg2u0').map((s) => s.key)).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5']);
    expect(solo.HUBS.algebra2.games.map((g) => g.drill)).toContain('alg2u0');
    for (const b of Object.keys(bank.BOOKS).filter((k) => k !== 'all')) expect(Object.values(bank.TEMPLATES).filter((t) => t.book === b).length).toBeGreaterThanOrEqual(5);
  });
});

describe('alg2 unit 0: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => K.wellFormed(bank, id));
});

const CHECK = {
  // ---- 0.1
  inverseOps(p) { expect(keyOf(p)).toBe({ addition: 'subtraction', subtraction: 'addition', multiplication: 'division', division: 'multiplication' }[promptOf(p)]); },
  flipRule(p) { expect(keyOf(p)).toBe('multiply or divide by a negative value'); },
  flipSolve(p) {
    const m = promptOf(p).match(/^(-?\d*)([a-z]) (<|>|≤|≥) (-?\d+)$/); const a = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
    expect(keyOf(p)).toBe(`${m[2]} ${a < 0 ? FLIP[m[3]] : m[3]} ${Number(m[4]) / a}`);
  },
  twoStep(p) { const v = askOf(p).slice(-1); expect(typedOf(p)).toBe(K.solveLinear(promptOf(p), v)); },
  bigFraction(p) { const v = askOf(p).slice(-1); expect(close(typedOf(p), K.solveLinear(promptOf(p), v))).toBe(true); },
  bothSides(p) { expect(close(typedOf(p), K.solveLinear(promptOf(p)))).toBe(true); },
  distributeSolve(p) { expect(close(typedOf(p), K.solveLinear(promptOf(p)))).toBe(true); },
  crossMultiply(p) {
    const v = K.lettersIn(promptOf(p))[0]; const root = K.solveLinear(promptOf(p), v);
    only(p, (s) => close(K.solveLinear(s, v), root));
    expect(keyOf(p)).toMatch(/^\d+\([a-z] [+-] \d+\) = \d+$/); // the whole numerator stays in parentheses
  },
  howManySolutions(p) {
    const v = K.lettersIn(promptOf(p))[0]; const g = K.gap(promptOf(p)); const g0 = g({ [v]: 0 }); const slope = g({ [v]: 1 }) - g0;
    expect(keyOf(p)).toBe(Math.abs(slope) > 1e-9 ? 'one solution' : Math.abs(g0) < 1e-9 ? 'infinitely many solutions' : 'no solution');
  },
  solutionSet(p) { const m = promptOf(p).match(/^x (<|>|≤|≥) (-?\d+)$/); only(p, (s) => holds(Number(s), m[1], Number(m[2]))); },
  simplestFraction(p) {
    const v = K.lettersIn(promptOf(p))[0]; const root = K.solveLinear(promptOf(p), v);
    only(p, (s) => close(K.fracValue(s), root)); expect(K.reduced(keyOf(p))).toBe(true);
  },
  // ---- 0.2
  slopeOrIntercept(p) {
    const f = K.fnOf(rhs(promptOf(p))); const b = f(0); const m = f(1) - f(0);
    if (p.input === 'number') expect(typedOf(p)).toBe(b); else { only(p, (s) => close(K.fracValue(s), m)); expect(K.reduced(keyOf(p))).toBe(true); }
  },
  solveForYFirst(p) { const [cx, cy] = K.linear(promptOf(p), ['x', 'y']); expect(close(typedOf(p), -cx / cy)).toBe(true); },
  specialLines(p) {
    const q = promptOf(p); const ask = askOf(p);
    if (/slope/.test(ask)) { expect(keyOf(p)).toBe(/^x = /.test(q) ? 'Undefined' : '0'); return; }
    const [[px, py]] = points(ask);
    expect(keyOf(p)).toBe(/vertical/.test(ask) ? `x = ${px}` : `y = ${py}`);
  },
  dottedOrSolid(p) {
    const sym = promptOf(p).match(/^y (<|>|≤|≥) /)[1];
    expect(keyOf(p)).toBe(`${sym === '<' || sym === '>' ? 'dotted' : 'solid'} line, shade ${sym === '<' || sym === '≤' ? 'down' : 'up'}`);
  },
  inSolutionSet(p) {
    const [[px, py]] = points(askOf(p)); const m = promptOf(p).match(/^y (<|>|≤|≥) (.+)$/);
    expect(keyOf(p)).toBe(holds(py, m[1], calc(m[2], { x: px })) ? 'Yes' : 'No');
  },
  formName(p) { const q = promptOf(p); expect(keyOf(p)).toBe(/^y [+-] \d+ = /.test(q) ? 'Point-Slope Form' : /^y = /.test(q) ? 'Slope-Intercept Form' : 'Standard form'); },
  slopeTwoPoints(p) {
    const [[x1, y1], [x2, y2]] = points(promptOf(p));
    if (x1 === x2) expect(keyOf(p)).toBe('Undefined'); else if (y1 === y2) expect(keyOf(p)).toBe('0');
    else { only(p, (s) => close(K.fracValue(s), (y2 - y1) / (x2 - x1))); expect(K.reduced(keyOf(p))).toBe(true); }
  },
  interceptPair(p) {
    const [a, b, c] = K.linear(promptOf(p), ['x', 'y']);
    expect(keyOf(p)).toBe(/x-intercept/.test(askOf(p)) ? pt([c / a, 0]) : pt([0, c / b]));
  },
  interceptIdea(p) { expect(keyOf(p)).toBe(/x-intercept/.test(askOf(p)) ? 'y = 0' : 'x = 0'); },
  readLine(p) {
    const [[x1, y1], [x2, y2]] = K.dots(figs(p)[0]).map(([x, y]) => [Math.round(x), Math.round(y)]);
    expect(x1).toBe(0); const m = (y2 - y1) / (x2 - x1);
    only(p, (s) => { const f = K.fnOf(rhs(s)); return close(f(0), y1) && close(f(1) - f(0), m); });
    expect(K.onCurve(figs(p)[0], K.fnOf(rhs(keyOf(p))))).toBe(true);
  },
  pointSlope(p) {
    const [[x1, y1]] = points(askOf(p)); const m = Number(askOf(p).match(/slope (-?\d+)/)[1]);
    only(p, (s) => { const g = K.gap(s); return /^y [+-] \d+ = /.test(s) && close(g({ x: x1, y: y1 }), 0) && close(g({ x: x1 + 1, y: y1 + m }), 0); });
  },
  // ---- 0.3: the printed expression and the key agree at every value tried; no wrong choice does
  exponentRule(p) { const left = promptOf(p).replace(' = ?', ''); only(p, (s) => K.same(left, s, ['a', 'b', 'm', 'n'])); },
  exponentProduct(p) { const v = K.lettersIn(promptOf(p)); only(p, (s) => K.same(promptOf(p), s, v)); },
  exponentPower(p) { const v = K.lettersIn(promptOf(p)); only(p, (s) => K.same(promptOf(p), s, v)); },
  exponentQuotient(p) { only(p, (s) => K.same(promptOf(p), s, ['x', 'y'])); expect(keyOf(p)).not.toMatch(/\^\(-/); },
  zeroExponent(p) { only(p, (s) => K.same(promptOf(p), s, ['x', 'y'])); },
  negativeExponent(p) { only(p, (s) => K.same(promptOf(p), s, ['x', 'y'])); expect(keyOf(p)).not.toMatch(/\^\(-/); },
  monomialProduct(p) { only(p, (s) => K.same(promptOf(p), s, ['a', 'b'])); expect(keyOf(p)).not.toMatch(/\^\(-/); },
  standardForm(p) {
    const degrees = (s) => s.split(/ [+-] /).map((t) => (/x\^\((\d)\)/.test(t) ? Number(t.match(/x\^\((\d)\)/)[1]) : /x/.test(t) ? 1 : 0));
    only(p, (s) => degrees(s).every((d, i, a) => i === 0 || d < a[i - 1]));
  },
  conjugates(p) { only(p, (s) => K.same(promptOf(p), s)); },
  binomialSquared(p) { only(p, (s) => K.same(promptOf(p), s)); },
  binomialProduct(p) { only(p, (s) => K.same(promptOf(p), s)); },
  cancelFirstStep(p) {
    for (const x of [2, 3.5, 7]) expect(close(calc(promptOf(p), { x }), x)).toBe(true); // "they all simplify to x"
    const q = promptOf(p); const k = keyOf(p);
    // the first step is the innermost pair: what sits directly on x
    if (/^\(\(\(\d+x \+ \d+\) - \d+\)\/\(\d+\)\)$/.test(q)) expect(k).toMatch(/^the \+ \d+ and the - \d+ undo each other$/);
    else if (/^\d+\(\(\(x - \d+\)\/\(\d+\)\)\) \+ \d+$/.test(q)) expect(k).toMatch(/^the ×\d+ and the ÷\d+ undo each other$/);
    else if (/√/.test(q)) expect(k).toBe('the square undoes the square root');
    else { expect(q).toMatch(/^∛/); expect(k).toBe('the cube root undoes the cube'); }
  },
  // ---- 0.4
  functionVocab(p) {
    const q = promptOf(p);
    expect(keyOf(p)).toBe(/^any set of ordered pairs$/.test(q) ? 'a relation' : /no y-value repeats/.test(q) ? 'a one-to-one function' : 'a function');
  },
  lineTests(p) { expect(keyOf(p)).toBe(/ONE-TO-ONE/.test(askOf(p)) ? 'Horizontal Line Test' : 'Vertical Line Test'); },
  pointsFunction(p) {
    const { xs, ys } = K.tableOf(figs(p)[0]);
    const fn = xs.every((x, i) => xs.every((x2, j) => x !== x2 || ys[i] === ys[j]));
    const one = fn && new Set(ys).size === ys.length;
    expect(keyOf(p)).toBe(!fn ? 'Not a function' : one ? 'A function, and one-to-one' : 'A function, but not one-to-one');
  },
  equationOneToOne(p) {
    const f = K.fnOf(rhs(promptOf(p))); const seen = new Map(); let one = true;
    for (let x = -6; x <= 8; x += 0.5) { const y = f(x); if (!Number.isFinite(y)) continue; const key = Math.round(y * 1e6); if (seen.has(key)) one = false; seen.set(key, x); }
    expect(keyOf(p)).toBe(one ? 'Yes — it passes the Horizontal Line Test' : 'No — it fails the Horizontal Line Test');
  },
  inputOrOutput(p) {
    const ask = askOf(p); const [, inp, out] = promptOf(p).match(/^[a-z]\((-?\d+|x)\) = (-?\d+)$/);
    if (/Find x, given/.test(ask)) { expect(keyOf(p)).toBe('an output (y-value)'); return; }
    const named = ask.match(/, the (-?\d+) is…$/)[1];
    // the same number can be both (f(3) = 3): the question then names the first one printed, the input
    expect(keyOf(p)).toBe(named === inp && !(inp === out && /output/.test(keyOf(p))) ? 'an input (x-value)' : 'an output (y-value)');
  },
  evaluate(p) { const fns = K.defs(linesOf(p)); expect(typedOf(p)).toBe(calc(askOf(p).replace('Evaluate ', ''), { fns })); },
  evaluateRoot(p) { const fns = K.defs(linesOf(p)); expect(close(typedOf(p), calc(askOf(p).replace('Evaluate ', ''), { fns }))).toBe(true); },
  findInput(p) { const fns = K.defs(linesOf(p)); const [, f, c] = askOf(p).match(/that ([a-z])\(x\) = (-?\d+)$/); expect(fns[f](typedOf(p))).toBe(Number(c)); },
  tableEvaluate(p) {
    const { xs, ys } = K.tableOf(figs(p)[0]); const ask = askOf(p);
    expect(new Set(xs).size).toBe(xs.length); expect(new Set(ys).size).toBe(ys.length); // one answer either way
    if (/Find x/.test(ask)) expect(typedOf(p)).toBe(xs[ys.indexOf(Number(ask.match(/= (-?\d+)$/)[1]))]);
    else expect(typedOf(p)).toBe(ys[xs.indexOf(Number(ask.match(/n\((-?\d+)\)$/)[1]))]);
  },
  maxMinPointOrValue(p) {
    const pts = zigOf(p); const ask = askOf(p); const max = /maximum/.test(ask);
    const best = pts.reduce((a, b) => ((max ? b[1] > a[1] : b[1] < a[1]) ? b : a));
    expect(pts.filter((q) => q[1] === best[1]).length).toBe(1);
    expect(keyOf(p)).toBe(/POINT/.test(ask) ? pt(best) : String(best[1]));
  },
  increasingInterval(p) {
    const pts = zigOf(p); const inc = /increasing/.test(askOf(p));
    const good = (s) => { const m = s.match(/^(-?\d+) < x < (-?\d+)$/); if (!m) return false; const i = pts.findIndex((q) => q[0] === Number(m[1])); return i >= 0 && i < pts.length - 1 && pts[i + 1][0] === Number(m[2]) && (pts[i + 1][1] > pts[i][1]) === inc; };
    only(p, good);
  },
  graphEvaluate(p) { const a = Number(askOf(p).match(/f\((-?\d+)\)$/)[1]); expect(typedOf(p)).toBe(at(zigOf(p), a)); },
  yInterceptPair(p) { const b = at(zigOf(p), 0); expect(Number.isInteger(b)).toBe(true); expect(keyOf(p)).toBe(pt([0, b])); },
  turningPoints(p) { const pts = zigOf(p); expect(pts).toHaveLength(4); expect(keyOf(p)).toBe(`${pt(pts[1])} and ${pt(pts[2])}`); },
  // ---- 0.5
  standardWindow(p) { expect(keyOf(p)).toBe('-10 to 10 for both the x- and y-values'); },
  ti84Keys(p) {
    const ask = askOf(p);
    expect(keyOf(p)).toBe(/type in the equation/.test(ask) ? 'Y=' : /see the graph/.test(ask) ? 'GRAPH' : /standard viewing window/.test(ask) ? 'ZOOM 6' : /table of values/.test(ask) ? '2ND GRAPH' : '^');
  },
  tableValue(p) { const x = Number(askOf(p).match(/x = (-?\d+)\?$/)[1]); expect(typedOf(p)).toBe(calc(rhs(promptOf(p)), { x })); },
  tableTurn(p) {
    const { xs, ys } = K.tableOf(figs(p)[0]); const max = /maximum/.test(askOf(p));
    const best = max ? Math.max(...ys) : Math.min(...ys);
    expect(ys.filter((y) => y === best).length).toBe(1);
    const i = ys.indexOf(best); expect(i).toBeGreaterThan(0); expect(i).toBeLessThan(ys.length - 1); // the turn is inside the table
    expect(typedOf(p)).toBe(xs[i]);
  },
  windowSetting(p) { const [[x, y]] = points(askOf(p)); expect(keyOf(p)).toBe(y > 10 ? 'Ymax' : y < -10 ? 'Ymin' : x > 10 ? 'Xmax' : 'Xmin'); },
  roundTenth(p) {
    const v = Number(promptOf(p)); const want = Math.sign(v) * Math.round(Math.abs(v) * 10 + 1e-9) / 10;
    only(p, (s) => /^-?\d+\.\d$/.test(s) && close(Number(s), want));
  },
  intersectionPoint(p) {
    const [a, b] = linesOf(p).map((l) => K.fnOf(rhs(l)));
    only(p, (s) => { const [[x, y]] = points(s); return close(a(x), y) && close(b(x), y); });
  },
};

describe('alg2 unit 0: every answer re-solved from the printed question', () => {
  test('every template has a check', () => { expect(Object.keys(CHECK).sort()).toEqual(Object.keys(bank.TEMPLATES).sort()); });
  test.each(Object.keys(CHECK))('%s', (id) => { for (const p of K.deal(bank, id)) CHECK[id](p); });
});
