/**
 * Algebra 2 · Unit 1 Review (utils/liveDrill/review/alg2Unit1.js) — Systems of Equations.
 *
 * Every play well formed, the drill registered with a playbook per lesson (1.1 … 1.5), and every
 * computed answer re-solved from the printed question: each system solved again by elimination
 * from its own printed equations, each "no solution / infinitely many" decided from the printed
 * coefficients, each word problem solved from the numbers in its own sentence, each matrix entry
 * read from the printed system. The rules are typed here by hand; nothing is read from the bank.
 */
const K = require('../helpers/alg2UnitKit');
const bank = require('../../utils/liveDrill/review/alg2Unit1');
const { DRILLS, listPlaybooks, listSections } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');

const { calc, close, keyOf, wrongsOf, typedOf, promptOf, askOf, linesOf, points, figs } = K;
function only(p, good) {
  const ok = (s) => { try { return !!good(s); } catch { return false; } };
  expect([keyOf(p), ok(keyOf(p))]).toEqual([keyOf(p), true]);
  for (const w of wrongsOf(p)) expect([w, ok(w)]).toEqual([w, false]);
}
const XY = ['x', 'y']; const XYZ = ['x', 'y', 'z'];
const sys2 = (p) => linesOf(p).map((l) => K.linear(l, XY));
const sys3 = (p) => linesOf(p).map((l) => K.linear(l, XYZ));
const pt = (a) => `(${a.join(', ')})`;
const ORD = ['first', 'second', 'third'];
const money = (s) => [...s.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
const noCommas = (s) => s.replace(/(\d),(?=\d{3})/g, '$1');
/** Are two rows of coefficients the same equation (one a nonzero multiple of the other)? */
function proportional(a, b) {
  const i = a.findIndex((v) => Math.abs(v) > 1e-9); if (i < 0 || Math.abs(b[i]) < 1e-9) return false;
  const k = b[i] / a[i]; return a.every((v, j) => close(v * k, b[j]));
}
/** Ordered Pair / Infinitely Many / No Solution from two rows [a, b, c]. */
function kindOf([a1, b1, c1], [a2, b2, c2]) {
  if (Math.abs(a1 * b2 - a2 * b1) > 1e-9) return 'Ordered Pair';
  return proportional([a1, b1, c1], [a2, b2, c2]) ? 'Infinitely Many' : 'No Solution';
}

describe('alg2 unit 1: registered', () => {
  test('a drill on the Algebra 2 hub with a playbook per lesson', () => {
    expect(DRILLS.alg2u1.title).toBe('Algebra 2 · Unit 1 Review');
    expect(listPlaybooks('alg2u1').map((b) => b.key)).toEqual(['all', 'l1', 'l2', 'l3', 'l4', 'l5']);
    expect(listSections('alg2u1').map((s) => s.key)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5']);
    expect(solo.HUBS.algebra2.games.map((g) => g.drill)).toContain('alg2u1');
    for (const b of Object.keys(bank.BOOKS).filter((k) => k !== 'all')) expect(Object.values(bank.TEMPLATES).filter((t) => t.book === b).length).toBeGreaterThanOrEqual(5);
  });
});

describe('alg2 unit 1: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => K.wellFormed(bank, id));
});

const CHECK = {
  // ---- 1.1
  solutionIs(p) { expect(keyOf(p)).toBe('point(s) of intersection'); },
  methodName(p) { const q = promptOf(p); expect(keyOf(p)).toBe(/^Solve one equation/.test(q) ? 'Substitution' : /^Add the equations/.test(q) ? 'Elimination' : 'Graphing'); },
  graphSolve(p) {
    const line = (c) => { const [[x1, y1], [x2, y2]] = K.curves(figs(p)[0], c)[0]; const m = (y2 - y1) / (x2 - x1); return [m, y1 - m * x1]; };
    const [m1, b1] = line(K.BLUE); const [m2, b2] = line(K.RED); const x = (b2 - b1) / (m1 - m2);
    expect(keyOf(p)).toBe(pt([Math.round(x), Math.round(m1 * x + b1)]));
    expect(close(x, Math.round(x), 1e-3)).toBe(true); expect(Math.abs(x)).toBeLessThanOrEqual(10);
  },
  isSolution(p) {
    const [[x, y]] = points(askOf(p)); const [f, g] = linesOf(p).map((l) => K.fnOf(l.split(' = ')[1]));
    const a = f(x) === y; const b = g(x) === y;
    expect(keyOf(p)).toBe(a && b ? 'Yes — it makes both equations true' : a ? 'No — it makes only the first equation true' : b ? 'No — it makes only the second equation true' : 'No — it makes neither equation true');
  },
  subFirstStep(p) {
    const [first, second] = linesOf(p); const y = K.fnOf(first.split(' = ')[1]); const g = K.gap(second);
    // the key is the second equation with y replaced by the first equation's expression, for every x
    only(p, (s) => { const h = K.gap(s); return [-2, 0.5, 3, 7].every((x) => close(h({ x, y: y(x) }), g({ x, y: y(x) })) && close(h({ x, y: 99 }), g({ x, y: y(x) }))); });
  },
  subSolve(p) {
    const [x, y] = K.solve(linesOf(p).map((l) => K.linear(l, XY)));
    only(p, (s) => { const [[a, b]] = points(s); return close(a, x) && close(b, y); });
  },
  elimAdd(p) { const [r1, r2] = sys2(p); expect(r1[1] + r2[1]).toBe(0); expect(close(typedOf(p), K.solve([r1, r2])[0])).toBe(true); },
  elimMultiplier(p) {
    const i = /eliminates x/.test(askOf(p)) ? 0 : 1; const [r1, r2] = sys2(p);
    expect(typedOf(p) * r1[i] + r2[i]).toBe(0);
    expect(K.solve([r1, r2])).not.toBeNull(); // really two different lines
  },
  elimStrategy(p) {
    const [r1, r2] = sys2(p);
    only(p, (s) => { const m = s.match(/^multiply the first by (-?\d+) and the second by (-?\d+)$/); return Number(m[1]) * r1[0] + Number(m[2]) * r2[0] === 0; });
  },
  // ---- 1.2
  resultMeans(p) {
    const [l, r] = promptOf(p).split(' = ');
    expect(keyOf(p)).toBe(l === 'x' && r !== 'x' ? 'Ordered Pair' : l === r ? 'Infinitely Many' : 'No Solution');
  },
  graphMeans(p) {
    const q = promptOf(p);
    expect(keyOf(p)).toBe(/parallel|different y-intercepts/.test(q) ? 'No Solution' : /same line|the same y-intercept/.test(q) ? 'Infinitely Many' : 'Ordered Pair');
  },
  classifySystem(p) { const [r1, r2] = sys2(p); expect(keyOf(p)).toBe(kindOf(r1, r2)); },
  noSolutionA(p) {
    const [first, second] = linesOf(p); const [p1, q1, c1] = K.linear(first, XY); const g = K.gap(second);
    const z = { x: 0, y: 0, a: 0 }; const q2 = g({ ...z, y: 1 }) - g(z); const c2 = -g(z);
    const a = typedOf(p);
    expect(kindOf([p1, q1, c1], [a, q2, c2])).toBe('No Solution');
    expect(close(g({ x: 1, y: 0, a }) - g({ x: 0, y: 0, a }), a)).toBe(true); // a really is the x-coefficient
  },
  sameLineC(p) {
    const [first, second] = linesOf(p); const r1 = K.linear(first, XY); const g = K.gap(second); const z = { x: 0, y: 0, c: 0 };
    const r2 = [g({ ...z, x: 1 }) - g(z), g({ ...z, y: 1 }) - g(z), typedOf(p)];
    expect(kindOf(r1, r2)).toBe('Infinitely Many');
  },
  // ---- 1.3
  tripleLooks(p) { expect(keyOf(p)).toBe('(x, y, z)'); },
  triangleName(p) {
    const [, r2, r3] = sys3(p);
    expect(r2[0]).toBe(0); expect(r3.slice(0, 2)).toEqual([0, 0]); // the staircase
    expect(keyOf(p)).toBe('triangle form');
  },
  triangleY(p) { expect(close(typedOf(p), K.solve(sys3(p))[1])).toBe(true); },
  triangleSolve(p) {
    const sol = K.solve(sys3(p));
    only(p, (s) => { const [t] = points(s); return t.length === 3 && t.every((v, i) => close(v, sol[i])); });
  },
  whichPair(p) {
    const rows = sys3(p); const cancels = (i, j) => [0, 1, 2].filter((v) => rows[i][v] + rows[j][v] === 0).length;
    const two = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => cancels(i, j) === 2);
    expect(two).toHaveLength(1);
    expect(keyOf(p)).toBe(`the ${ORD[two[0][0]]} and ${ORD[two[0][1]]}`);
  },
  addPair(p) {
    const rows = sys3(p); const [, a, b, v] = askOf(p).match(/^Add the (\w+) and (\w+) equations\. What is ([xyz])\?$/);
    const i = ORD.indexOf(a); const j = ORD.indexOf(b); const sum = rows[i].map((c, n) => c + rows[j][n]); const at = 'xyz'.indexOf(v);
    expect(sum.slice(0, 3).filter((c) => c !== 0)).toHaveLength(1); expect(sum[at]).not.toBe(0);
    expect(close(typedOf(p), sum[3] / sum[at])).toBe(true);
    expect(close(typedOf(p), K.solve(rows)[at])).toBe(true);
  },
  // ---- 1.4
  phraseSymbol(p) { expect(keyOf(p)).toBe({ '"no more than"': '≤', '"at most"': '≤', '"at least"': '≥', '"no fewer than"': '≥', '"fewer than"': '<', '"more than"': '>' }[promptOf(p)]); },
  setupEquations(p) {
    const ask = askOf(p); const [a, b, t] = money(ask);
    const n = Number(ask.match(/([\d,]+) (?:tickets were sold|boxes for|of these)/)[1].replace(/,/g, ''));
    const [, u, v] = ask.match(/, ([A-Za-z]), and [^,]+, ([A-Za-z])\?$/);
    only(p, (s) => {
      const [value, count] = noCommas(s).split(' ; ').map((l) => K.linear(l, [u, v]));
      return value[0] === a && value[1] === b && value[2] === t && count[0] === 1 && count[1] === 1 && count[2] === n;
    });
  },
  setupInequalities(p) {
    const ask = askOf(p); const [pr, q, earn] = money(ask); const h = Number(ask.match(/no more than (\d+) hours/)[1]);
    expect(keyOf(p)).toBe(`${pr}x + ${q}y ≥ ${earn} ; x + y ≤ ${h}`);
  },
  timesAsMany(p) {
    const ask = askOf(p); const k = { twice: 2, 'three times': 3, 'four times': 4 }[ask.match(/at least (twice|three times|four times) as many/)[1]];
    const [, big, small] = ask.match(/\(([a-z])\) as [^(]+\(([a-z])\)/);
    expect(keyOf(p)).toBe(`${big} ≥ ${k}${small}`);
  },
  countAndValue(p) {
    const ask = askOf(p); let want;
    if (/animals/.test(ask)) { const [, n, legs] = ask.match(/has (\d+) animals.*There are (\d+) legs/); want = K.solve([[1, 1, Number(n)], [4, 2, Number(legs)]])[0]; }
    else if (/Front-row/.test(ask)) { const n = Number(ask.match(/sold (\d+) tickets/)[1]); const t = money(ask)[2]; expect(money(ask).slice(0, 2)).toEqual([5, 2]); want = K.solve([[1, 1, n], [5, 2, t]])[0]; }
    else { const n = Number(ask.match(/bought (\d+) novels/)[1]); const t = money(ask)[2]; expect(money(ask).slice(0, 2)).toEqual([4, 1]); want = K.solve([[1, 1, n], [4, 1, t]])[0]; }
    expect(close(typedOf(p), want)).toBe(true);
  },
  sameCost(p) {
    const [f1, r1, f2, r2] = money(askOf(p)); const h = typedOf(p);
    expect(f1 + r1 * h).toBe(f2 + r2 * h); expect(r1).not.toBe(r2);
    expect(close(K.solveLinear(promptOf(p)), h)).toBe(true); // the printed equation says the same thing
  },
  olderThan(p) {
    const ask = askOf(p); const d = Number(ask.match(/is (\d+) years older/)[1]); const total = Number(ask.match(/age is (\d+)\./)[1]);
    const times = (who) => { const m = ask.match(new RegExp(`(two times |three times )?${who}'s age`)); return m[1] === 'three times ' ? 3 : m[1] === 'two times ' ? 2 : 1; };
    const [c, w] = K.solve([[-1, 1, d], [times('Charlie'), times('William'), total]]);
    expect(close(typedOf(p), c)).toBe(true); expect(close(w, c + d)).toBe(true);
  },
  timesAsMuch(p) { const ask = askOf(p); const k = Number(ask.match(/costs (\d+) times as much/)[1]); const [t] = money(ask); expect(typedOf(p) * (k + 1)).toBe(t); },
  sumOfTwo(p) {
    const ask = askOf(p); const sum = Number(ask.match(/is (\d+)\. The larger/)[1]); const d = Number(ask.match(/is (\d+) less than twice/)[1]);
    const [s, L] = K.solve([[1, 1, sum], [-2, 1, -d]]);
    expect(close(typedOf(p), s)).toBe(true); expect(L).toBeGreaterThan(s);
  },
  valueOfExpression(p) {
    const [, diff, k, m] = promptOf(p).match(/^a - b = (\d+) and b ÷ (\d+) = (\d+)$/); const b = Number(k) * Number(m); const a = Number(diff) + b;
    expect(typedOf(p)).toBe(a + b);
  },
  sameSolution(p) {
    const V = ['x', 'y', 'K', 'L']; const row = (l) => { const g = K.gap(l); const z = Object.fromEntries(V.map((v) => [v, 0])); return V.map((v) => g({ ...z, [v]: 1 }) - g(z)); };
    const [a, b] = linesOf(p).map(row);
    // the same solution for every K and L only when each equation is a multiple of the original — both sides
    only(p, (s) => { const [c, d] = s.split(' ; ').map(row); return proportional(a, c) && proportional(b, d); });
  },
  // ---- 1.5
  matrixNames(p) { expect(keyOf(p)).toBe({ 'A is…': 'the coefficient matrix', 'X is…': 'the variable matrix', 'B is…': 'the constant matrix' }[promptOf(p)]); },
  matrixVocab(p) { expect(keyOf(p)).toBe(/called its/.test(promptOf(p)) ? 'elements (entries)' : 'rows and columns'); },
  matrixEntry(p) { const [, r, c] = askOf(p).match(/row (\d), column (\d)/); expect(typedOf(p)).toBe(sys3(p)[r - 1][c - 1]); },
  constantEntry(p) { const r = Number(askOf(p).match(/row (\d)/)[1]); expect(typedOf(p)).toBe(sys3(p)[r - 1][3]); },
  matrixSize(p) { expect(keyOf(p)).toBe(/constant matrix B/.test(askOf(p)) ? '3 rows and 1 column' : '3 rows and 3 columns'); },
  methodOrder(p) { expect(keyOf(p)).toBe('A^(-1) · B'); },
  inverseNotation(p) { expect(keyOf(p)).toBe('A^(-1)'); },
  readResult(p) {
    const col = K.matrixOf(figs(p)[0]); expect(col).toHaveLength(3); const ask = askOf(p);
    if (p.input === 'number') expect(typedOf(p)).toBe(col['xyz'.indexOf(ask.match(/What is ([xyz])\?$/)[1])]);
    else { expect(keyOf(p)).toBe(pt(col)); expect(new Set(col).size).toBe(3); }
  },
};

describe('alg2 unit 1: every answer re-solved from the printed question', () => {
  test('every template has a check', () => { expect(Object.keys(CHECK).sort()).toEqual(Object.keys(bank.TEMPLATES).sort()); });
  test.each(Object.keys(CHECK))('%s', (id) => { for (const p of K.deal(bank, id)) CHECK[id](p); });
  test('a system solves the same by the helper and by hand (the helper is not the bank)', () => {
    expect(K.solve([[2, -3, -4], [3, -2, -6]]).map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([-2, 0]); // the packet's Level 2 example
    expect(K.solve([[4, 4, 1, 24], [2, -4, 1, 0], [5, -4, -5, 12]]).map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([4, 2, 0]); // its printed key
    expect(calc('2x + 3y - 2z', { x: 5, y: 0, z: 1 })).toBe(8); // its matrix example, (5, 0, 1)
  });
});
