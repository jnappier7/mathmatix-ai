/**
 * Algebra 2 · Unit 3 Review (utils/liveDrill/review/alg2Unit3.js) — Function Graphs.
 *
 * Every play well formed, the drill registered with a playbook per lesson (3.1 … 3.5), and every
 * computed answer re-solved from what is printed or drawn: a parent function is recognised from
 * the points of its curve, even / odd / neither is decided by evaluating f(−x) numerically, an
 * inverse is accepted only if composing it with the printed function gives x back (and every
 * wrong choice fails that), "are they inverses" is recomputed by composing the two printed
 * functions, and domain, range, extrema and intervals are read off the corners actually drawn.
 * The parent functions and the notation rules are typed here by hand, from the packet.
 */
const K = require('../helpers/alg2UnitKit');
const bank = require('../../utils/liveDrill/review/alg2Unit3');
const { DRILLS, listPlaybooks, listSections } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');

const { calc, close, keyOf, wrongsOf, typedOf, promptOf, askOf, linesOf, points, figs } = K;
function only(p, good) {
  const ok = (s) => { try { return !!good(s); } catch { return false; } };
  expect([keyOf(p), ok(keyOf(p))]).toEqual([keyOf(p), true]);
  for (const w of wrongsOf(p)) expect([w, ok(w)]).toEqual([w, false]);
}
const rhs = (s) => s.slice(s.indexOf(' = ') + 3);
const pt = (a) => `(${a.join(', ')})`;
/** The packet's parent functions, by the names it uses (the constant is any flat line). */
const PARENT = {
  'Identity Function': (x) => x, 'Square Function': (x) => x * x, 'Square Root Function': (x) => Math.sqrt(x), 'Cubic Function': (x) => x ** 3,
  'Cube Root Function': (x) => Math.cbrt(x), 'Absolute Value Function': (x) => Math.abs(x), 'Exponential Function': (x) => 2 ** x, 'Reciprocal Function': (x) => 1 / x,
};
const EQUATION = { 'Identity Function': 'x', 'Square Function': 'x^(2)', 'Square Root Function': '√x', 'Cubic Function': 'x^(3)', 'Cube Root Function': '∛x', 'Absolute Value Function': '|x|', 'Exponential Function': '2^(x)', 'Reciprocal Function': '((1)/(x))' };
/** Even, Odd or Neither by evaluating f(−x): the same, the exact opposite, or neither (or not even defined). */
function parity(f) {
  let even = true; let odd = true;
  for (const x of [0.5, 1, 1.7, 2.3, 3]) {
    const a = f(x); const b = f(-x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Neither';
    if (!close(b, a)) even = false; if (!close(b, -a)) odd = false;
  }
  return even ? 'Even' : odd ? 'Odd' : 'Neither';
}
/** One-to-one on a sample of its domain: no output twice. */
function oneToOne(f) {
  const seen = new Set();
  for (let x = -6; x <= 9; x += 0.25) { const y = f(x); if (!Number.isFinite(y)) continue; const k = Math.round(y * 1e6); if (seen.has(k)) return false; seen.add(k); }
  return true;
}
/** The whole drawn graph as points; is it symmetric about the y-axis / the origin? */
function symmetry(svg) {
  const pts = K.curves(svg).flat(); const has = (x, y) => pts.some(([a, b]) => Math.abs(a - x) < 0.02 && Math.abs(b - y) < 0.12);
  const inside = pts.filter(([x, y]) => Math.abs(x) < 4.6 && Math.abs(y) < 4.6);
  if (inside.every(([x, y]) => has(-x, y))) return 'Even';
  if (inside.every(([x, y]) => has(-x, -y))) return 'Odd';
  return 'Neither';
}
/** Rising or falling the whole way (so no height is reached twice). */
function monotone(svg) {
  const all = K.curves(svg); if (all.length !== 1) return false;
  const ys = all[0].map((q) => q[1]); const dir = Math.sign(ys[ys.length - 1] - ys[0]);
  return dir !== 0 && ys.every((y, i) => i === 0 || (y - ys[i - 1]) * dir > -1e-3);
}
const zigOf = (p) => K.corners(figs(p)[0]);
const INF = '∞';

describe('alg2 unit 3: registered', () => {
  test('a drill on the Algebra 2 hub with a playbook per lesson', () => {
    expect(DRILLS.alg2u3.title).toBe('Algebra 2 · Unit 3 Review');
    expect(listPlaybooks('alg2u3').map((b) => b.key)).toEqual(['all', 'l1', 'l2', 'l3', 'l4', 'l5']);
    expect(listSections('alg2u3').map((s) => s.key)).toEqual(['3.1', '3.2', '3.3', '3.4', '3.5']);
    expect(solo.HUBS.algebra2.games.map((g) => g.drill)).toContain('alg2u3');
    for (const b of Object.keys(bank.BOOKS).filter((k) => k !== 'all')) expect(Object.values(bank.TEMPLATES).filter((t) => t.book === b).length).toBeGreaterThanOrEqual(5);
  });
});

describe('alg2 unit 3: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => K.wellFormed(bank, id));
});

const CHECK = {
  // ---- 3.1
  nameTheParent(p) {
    const svg = figs(p)[0]; const ys = K.curves(svg).flat().map((q) => q[1]);
    const flat = Math.max(...ys) - Math.min(...ys) < 0.01;
    only(p, (s) => (s === 'Constant Function' ? flat : !flat && K.onCurve(svg, PARENT[s])));
  },
  equationOfTheParent(p) { const svg = figs(p)[0]; only(p, (s) => K.onCurve(svg, K.fnOf(s))); expect(Object.values(EQUATION)).toContain(keyOf(p)); },
  nameToEquation(p) {
    if (/^Which equation/.test(askOf(p))) expect(keyOf(p)).toBe(EQUATION[askOf(p).match(/is the (.+)\?$/)[1]]);
    else expect(EQUATION[keyOf(p)]).toBe(rhs(promptOf(p)));
  },
  parentKeyPoint(p) {
    const [, name, x] = askOf(p).match(/of the (.+): what is f\((-?\d+)\)\?$/);
    expect(rhs(promptOf(p))).toBe(EQUATION[name]);
    expect(close(typedOf(p), PARENT[name](Number(x)))).toBe(true); expect(close(typedOf(p), calc(rhs(promptOf(p)), { x: Number(x) }))).toBe(true);
  },
  evenOddRule(p) {
    const q = promptOf(p);
    expect(keyOf(p)).toBe(/^f\(-x\) = f\(x\)$|y-axis|exactly the same/.test(q) ? 'Even' : 'Odd');
    expect(q).toMatch(/^f\(-x\) = -?f\(x\)$|y-axis|origin|exactly the same|ALL the signs/);
  },
  evenOddEquation(p) { expect(keyOf(p)).toBe(parity(K.fnOf(rhs(promptOf(p))))); },
  plugInNegativeX(p) { const f = K.fnOf(rhs(promptOf(p))); only(p, (s) => [0.7, 1.3, 2.9].every((x) => close(calc(s, { x }), f(-x)))); },
  evenOddAlgebra(p) {
    const [first, second] = linesOf(p); const f = K.fnOf(rhs(first)); const shown = K.fnOf(rhs(second));
    for (const x of [0.7, 1.3, 2.9]) expect(close(shown(x), f(-x))).toBe(true); // the f(−x) on the card is right
    expect(keyOf(p)).toBe(parity(f));
  },
  evenOddParent(p) { const name = askOf(p).match(/^Is the (.+) even/)[1]; expect(rhs(promptOf(p))).toBe(EQUATION[name]); expect(keyOf(p)).toBe(parity(PARENT[name])); },
  oneToOneParent(p) {
    const name = askOf(p).match(/^Is the (.+) one-to-one/)[1];
    expect(keyOf(p)).toBe(name === 'Constant Function' ? 'No' : oneToOne(PARENT[name]) ? 'Yes' : 'No');
  },
  evenOddGraph(p) { expect(keyOf(p)).toBe(symmetry(figs(p)[0])); },
  // ---- 3.2
  reflectionLine(p) { expect(keyOf(p)).toBe('y = x'); },
  inverseHallmark(p) {
    const ask = askOf(p);
    if (/hallmark/.test(ask)) expect(keyOf(p)).toBe('x and y');
    else if (/written/.test(ask)) expect(keyOf(p)).toBe(`${ask.match(/inverse of ([a-z])\(x\)/)[1]}^(-1)(x)`);
    else expect(keyOf(p)).toBe('one-to-one');
  },
  correspondingPoint(p) { const [[a, b]] = points(askOf(p)); expect(keyOf(p)).toBe(pt([b, a])); },
  inverseOfPoints(p) { expect(keyOf(p)).toBe(`{${points(promptOf(p)).map(([a, b]) => pt([b, a])).join(', ')}}`); },
  inverseAFunctionEquation(p) { expect(keyOf(p)).toBe(oneToOne(K.fnOf(rhs(promptOf(p)))) ? 'Yes — the function is one-to-one' : 'No — the function is not one-to-one'); },
  inverseAFunctionGraph(p) { expect(keyOf(p)).toBe(monotone(figs(p)[0]) ? 'Yes — the function is one-to-one' : 'No — the function is not one-to-one'); },
  areTheyInverses(p) {
    const svg = figs(p)[0]; const line = (c) => { const [[x1, y1], [x2, y2]] = K.curves(svg, c)[0]; const m = (y2 - y1) / (x2 - x1); return [m, y1 - m * x1]; };
    const [m, b] = line(K.BLUE); const [m2, b2] = line(K.RED);
    const want = close(m2, 1 / m, 1e-3) && close(b2, -b / m, 1e-3) ? 'Yes — they reflect over the line y = x' : close(m2, -m, 1e-3) && close(b2, -b, 1e-3) ? 'No — they reflect over the x-axis' : close(m2, -m, 1e-3) && close(b2, b, 1e-3) ? 'No — they reflect over the y-axis' : 'unreadable';
    expect(keyOf(p)).toBe(want);
  },
  // ---- 3.3
  linearInverse(p) { const f = K.fnOf(rhs(promptOf(p))); only(p, (s) => [-3, 0.5, 7].every((x) => close(f(calc(s, { x })), x))); },
  inverseSteps(p) { expect(keyOf(p)).toBe('solve the equation for y'); },
  inverseSlope(p) {
    if (/fill in the blank/.test(promptOf(p))) { expect(keyOf(p)).toBe('reciprocals'); return; }
    const f = K.fnOf(rhs(promptOf(p))); const m = f(1) - f(0);
    only(p, (s) => close(K.fracValue(s), 1 / m)); expect(K.reduced(keyOf(p))).toBe(true);
  },
  inverseIntercepts(p) {
    const ask = askOf(p); const [[, yi], [xi]] = points(ask);
    expect(keyOf(p)).toBe(/What is the y-intercept/.test(ask) ? pt([0, xi]) : pt([yi, 0]));
  },
  inverseFromTable(p) {
    const { xs, ys } = K.tableOf(figs(p)[0]); const v = Number(askOf(p).match(/\((-?\d+)\)$/)[1]);
    expect(ys.filter((y) => y === v)).toHaveLength(1); expect(typedOf(p)).toBe(xs[ys.indexOf(v)]);
  },
  inverseDefinition(p) { expect(keyOf(p)).toBe('x'); },
  compositionVerdict(p) { expect(keyOf(p)).toBe(linesOf(p).every((l) => rhs(l) === 'x') ? 'YES' : 'NO'); },
  composeLinearPair(p) { composed(p, [-3, 0.5, 7]); },
  // ---- 3.4
  inverseOperation(p) {
    const q = promptOf(p); const n = (q.match(/\d+/) || [])[0];
    const want = q === 'cubing' ? 'taking the cube root' : q === 'taking the cube root' ? 'cubing' : q === 'squaring' ? 'taking the square root' : /^adding/.test(q) ? `subtracting ${n}` : `dividing by ${n}`;
    expect(keyOf(p)).toBe(want);
  },
  nonLinearInverse(p) { const f = K.fnOf(rhs(promptOf(p))); only(p, (s) => [10, 14.5, 21].every((x) => close(f(calc(s, { x })), x))); },
  twoCompositions(p) { expect(keyOf(p)).toBe('TWO — f(g(x)) and g(f(x))'); },
  composeNonLinearPair(p) { composed(p, [10, 14.5, 21]); },
  stepsToSimplify(p) {
    const q = promptOf(p); for (const x of [2, 3.5, 7]) expect(close(calc(q, { x }), x)).toBe(true);
    // first: whatever sits directly on x (the innermost pair)
    if (/^\d+\(∛/.test(q)) expect(keyOf(p)).toBe('the cube undoes the cube root');
    else expect(keyOf(p)).toMatch(/^the [+-] \d+ and the [+-] \d+ undo each other$/);
  },
  whichInverseIsAFunction(p) { only(p, (s) => oneToOne(K.fnOf(rhs(s)))); },
  keyPointsSwap(p) { const [[a, b]] = points(askOf(p)); expect(keyOf(p)).toBe(pt([b, a])); },
  // ---- 3.5
  domainRangeWords(p) { expect(keyOf(p)).toBe(/inputs|x-axis/.test(promptOf(p)) ? 'domain' : 'range'); },
  domainOfGraph(p) {
    const svg = figs(p)[0]; const pts = zigOf(p); const ends = K.dots(svg); expect(ends).toHaveLength(2);
    const open = (x) => ends.find((d) => Math.round(d[0]) === x)[2];
    const [a, b] = [pts[0][0], pts[pts.length - 1][0]];
    expect(keyOf(p)).toBe(`${open(a) ? '(' : '['}${a}, ${b}${open(b) ? ')' : ']'}`);
  },
  rangeOfGraph(p) {
    const svg = figs(p)[0]; const pts = zigOf(p); const ys = pts.map((q) => q[1]); const lo = Math.min(...ys); const hi = Math.max(...ys);
    // the lowest and highest points are really on the graph (never an open circle)
    for (const d of K.dots(svg)) if (d[2]) expect([lo, hi]).not.toContain(Math.round(d[1]));
    expect(keyOf(p)).toBe(`[${lo}, ${hi}]`);
  },
  rangeOfParabola(p) {
    const { k, down } = parabolaOf(p);
    if (/domain/.test(askOf(p))) expect(keyOf(p)).toBe(`(-${INF}, ${INF})`);
    else expect(keyOf(p)).toBe(down ? `(-${INF}, ${k}]` : `[${k}, ${INF})`);
  },
  rangeSetBuilder(p) { const { k, down } = parabolaOf(p); expect(keyOf(p)).toBe(`{y | y ${down ? '≤' : '≥'} ${k}}`); },
  inequalityToInterval(p) {
    const q = promptOf(p); let want; let m;
    if ((m = q.match(/^(-?\d+) ≤ x < (-?\d+)$/))) want = `[${m[1]}, ${m[2]})`;
    else { m = q.match(/^x (<|>|≤|≥) (-?\d+)$/); want = { '≥': `[${m[2]}, ${INF})`, '>': `(${m[2]}, ${INF})`, '≤': `(-${INF}, ${m[2]}]`, '<': `(-${INF}, ${m[2]})` }[m[1]]; }
    expect(keyOf(p)).toBe(want);
  },
  featureWords(p) {
    const q = promptOf(p);
    expect(keyOf(p)).toBe(/very highest/.test(q) ? 'Absolute Maximum' : /very lowest/.test(q) ? 'Absolute Minimum' : /peak/.test(q) ? 'Relative Maximum' : /valley/.test(q) ? 'Relative Minimum' : /goes up/.test(q) ? 'Interval of Increase' : 'Interval of Decrease');
  },
  endPointRules(p) {
    const ask = askOf(p);
    expect(keyOf(p)).toBe(/RELATIVE/.test(ask) ? 'No — it CANNOT be an end point' : /ABSOLUTE/.test(ask) ? 'Yes — it CAN be an end point' : 'There is none');
  },
  extremaOnAGraph(p) {
    const pts = zigOf(p); const ask = askOf(p); expect(pts).toHaveLength(4);
    const hi = pts.reduce((a, b) => (b[1] > a[1] ? b : a)); const lo = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const inner = [pts[1], pts[2]]; const peak = inner.reduce((a, b) => (b[1] > a[1] ? b : a)); const valley = inner.reduce((a, b) => (b[1] < a[1] ? b : a));
    // an interior corner is a peak when both neighbours are lower
    expect(pts[pts.indexOf(peak) - 1][1]).toBeLessThan(peak[1]); expect(pts[pts.indexOf(peak) + 1][1]).toBeLessThan(peak[1]);
    expect(pts[pts.indexOf(valley) - 1][1]).toBeGreaterThan(valley[1]); expect(pts[pts.indexOf(valley) + 1][1]).toBeGreaterThan(valley[1]);
    if (/VALUE/.test(ask)) expect(keyOf(p)).toBe(String(/maximum/.test(ask) ? hi[1] : lo[1]));
    else expect(keyOf(p)).toBe(pt(/absolute maximum/.test(ask) ? hi : /absolute minimum/.test(ask) ? lo : /relative maximum/.test(ask) ? peak : valley));
  },
  intervalOfIncrease(p) {
    const pts = zigOf(p); const inc = /increase/.test(askOf(p));
    only(p, (s) => { const m = s.match(/^\((-?\d+), (-?\d+)\)$/); const i = pts.findIndex((q) => q[0] === Number(m[1])); return i >= 0 && i < pts.length - 1 && pts[i + 1][0] === Number(m[2]) && (pts[i + 1][1] > pts[i][1]) === inc; });
  },
  positiveOrNegative(p) {
    const svg = figs(p)[0]; const roots = K.dots(svg).filter((d) => Math.abs(d[1]) < 1e-6).map((d) => Math.round(d[0])).sort((a, b) => a - b);
    expect(roots).toHaveLength(2); const mid = (roots[0] + roots[1]) / 2;
    const yMid = K.curves(svg).flat().reduce((a, b) => (Math.abs(b[0] - mid) < Math.abs(a[0] - mid) ? b : a))[1];
    expect(askOf(p)).toMatch(yMid < 0 ? /f\(x\) < 0/ : /f\(x\) > 0/); // between the roots the graph is on the side the question asks about
    expect(keyOf(p)).toBe(`${roots[0]} < x < ${roots[1]}`);
  },
  domainRangeOfInverse(p) {
    const [, D, R, which] = askOf(p).match(/domain (\[[^\]]+\]) and range (\[[^\]]+\])\. What is the (domain|range)/);
    expect(keyOf(p)).toBe(which === 'domain' ? R : D); expect(D).not.toBe(R);
  },
};
/** "Use composition": f(g(x)) is recomputed from the two printed functions; the key states it, and YES only when it is x. */
function composed(p, xs) {
  const fns = K.defs(linesOf(p)); const h = (x) => fns.f(fns.g(x));
  const isX = xs.every((x) => close(h(x), x));
  only(p, (s) => { const m = s.match(/^(YES|NO) — f\(g\(x\)\) = (.+)$/); return (m[1] === 'YES') === isX && xs.every((x) => close(calc(m[2], { x }), h(x))); });
}
/** The drawn parabola's turning point (its dot) and whether it opens down. */
function parabolaOf(p) {
  const svg = figs(p)[0]; const [[h, k]] = K.dots(svg).map(([x, y]) => [Math.round(x), Math.round(y)]);
  const ys = K.curves(svg).flat().map((q) => q[1]);
  return { h, k, down: Math.min(...ys) < k - 0.5 };
}

describe('alg2 unit 3: every answer re-solved from the printed question', () => {
  test('every template has a check', () => { expect(Object.keys(CHECK).sort()).toEqual(Object.keys(bank.TEMPLATES).sort()); });
  test.each(Object.keys(CHECK))('%s', (id) => { for (const p of K.deal(bank, id)) CHECK[id](p); });
  test('the checks agree with the packet\'s own printed keys', () => {
    // Lesson 4 practice key: the inverse of p(x) = √(9x + 1)/5 is (25x² − 1)/9; of h(x) = (x³ + 6)/11 is ∛(11x − 6); of g(x) = (x − 5)² is √x + 5
    const inv = (f, g) => [10, 14.5, 21].every((x) => close(calc(f, { x: calc(g, { x }) }), x));
    expect(inv('((√(9x + 1))/(5))', '((25x^(2) - 1)/(9))')).toBe(true);
    expect(inv('((x^(3) + 6)/(11))', '∛(11x - 6)')).toBe(true);
    expect(inv('(x - 5)^(2)', '√x + 5')).toBe(true);
    // Lesson 3 practice #4, keyed NO: f(x) = 4 − (3/2)x and g(x) = (2/3)x + 4 give f(g(x)) = −x − 2
    expect(K.same('4 - ((3)/(2))(((2)/(3))x + 4)', '-x - 2')).toBe(true);
    // Lesson 1 notes: −3x² + 4 is even, 2x³ − 4x is odd, 2x³ − 3x² − 4x + 4 is neither
    expect([parity(K.fnOf('-3x^(2) + 4')), parity(K.fnOf('2x^(3) - 4x')), parity(K.fnOf('2x^(3) - 3x^(2) - 4x + 4'))]).toEqual(['Even', 'Odd', 'Neither']);
    // Mixed practice #14, keyed "a and e (the rest are not one-to-one)": y = 2, y = 3x², y = −6x³ + 1
    expect([oneToOne(K.fnOf('2 + 0x')), oneToOne(K.fnOf('3x^(2)')), oneToOne(K.fnOf('-6x^(3) + 1'))]).toEqual([false, false, true]);
  });
});
