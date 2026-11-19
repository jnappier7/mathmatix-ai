/**
 * Algebra 2 · Unit 4 Review (utils/liveDrill/review/alg2Unit4.js) — Transformations of Quadratics.
 *
 * Every play well formed, the drill registered with a playbook per lesson (4.1 … 4.8), and every
 * computed answer re-solved from what is printed or drawn. A printed quadratic is read
 * numerically (its a, its turning point, its intercepts), so "which is the vertex form" means the
 * key is the same function and no wrong choice is; a list of transformations is rebuilt here from
 * that a, h and k in the packet's words and order (reflection, stretch or compression, left/right,
 * up/down), typed by hand; "words to equation" parses the words on the card; and an equation for a
 * graph has to pass through the points actually drawn while no wrong choice does.
 */
const K = require('../helpers/alg2UnitKit');
const bank = require('../../utils/liveDrill/review/alg2Unit4');
const { DRILLS, listPlaybooks, listSections } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');

const { calc, close, keyOf, wrongsOf, typedOf, promptOf, askOf, points, figs } = K;
function only(p, good) {
  const ok = (s) => { try { return !!good(s); } catch { return false; } };
  expect([keyOf(p), ok(keyOf(p))]).toEqual([keyOf(p), true]);
  for (const w of wrongsOf(p)) expect([w, ok(w)]).toEqual([w, false]);
}
const rhs = (s) => s.slice(s.indexOf(' = ') + 3);
const pt = (a) => `(${a.map((v) => (v === 0 ? 0 : v)).join(', ')})`;
/** The quadratic printed on the card: a, b, c and its turning point (h, k), read numerically. */
const Q = (p) => { const f = K.fnOf(rhs(promptOf(p))); const q = K.quadOf(f); const tidy = (v) => Math.round(v * 1e6) / 1e6 + 0; return { f, ...q, h: tidy(q.h), k: tidy(q.k) }; }; // (+ 0: never −0)
const sameFn = (a, b) => K.same(rhs(a), rhs(b));
const H = (h) => (h > 0 ? `right ${h}` : `left ${-h}`);
const V = (k) => (k > 0 ? `up ${k}` : `down ${-k}`);
/** The packet's list for y = a(x − h)² + k, in its order: reflection, stretch/compression, left/right, up/down. */
function listOf(a, h, k) {
  const out = [];
  if (a < 0) out.push('reflect over the x-axis');
  if (Math.abs(a) !== 1) out.push(`vertical ${Math.abs(a) > 1 ? 'stretch' : 'compression'} by ${K.fracText(Math.abs(a))}`);
  if (h) out.push(H(h));
  if (k) out.push(V(k));
  return out.join(', ');
}
/** "shifted 4 right", "shifted left 3", "translated 5 units up", "up 2", "3 to the left" → { h, k } */
function shiftsIn(words) {
  let h = 0; let k = 0;
  for (const m of words.matchAll(/(\d+)(?: units?)?(?: to the)? (right|left|up|down)|(right|left|up|down) (\d+)/g)) {
    const n = Number(m[1] || m[4]); const d = m[2] || m[3];
    if (d === 'right') h = n; else if (d === 'left') h = -n; else if (d === 'up') k = n; else k = -n;
  }
  return { h, k };
}
/** y = [−]([−]c·x)² ± k as printed: the sign outside, the sign inside, the coefficient c inside, and k. */
function horizontalOf(text) {
  const m = rhs(text).match(/^(-?)\((-?)(?:\(\((\d+)\)\/\((\d+)\)\)|(\d*))x\)\^\(2\)(?: ([+-]) (\d+))?$/);
  if (!m) throw new Error(`not a horizontal form: ${text}`);
  return { outside: m[1] === '-', inside: m[2] === '-', c: m[3] ? Number(m[3]) / Number(m[4]) : Number(m[5] || 1), k: m[6] ? (m[6] === '-' ? -1 : 1) * Number(m[7]) : 0 };
}
/** Take the reciprocal of the coefficient of x, THEN decide (the packet's note). */
const horizontalWords = (c) => `horizontal ${1 / c > 1 ? 'stretch' : 'compression'} by ${K.fracText(1 / c)}`;
/** The blue parabola: the function through its drawn points, and its turning point from the dots. */
const drawn = (p) => { const svg = figs(p)[0]; return { svg, on: (s) => K.onCurve(svg, K.fnOf(rhs(s))) }; };
const parentDrawn = (svg) => K.onCurve(svg, (x) => x * x, K.RED);

describe('alg2 unit 4: registered', () => {
  test('a drill on the Algebra 2 hub with a playbook per lesson', () => {
    expect(DRILLS.alg2u4.title).toBe('Algebra 2 · Unit 4 Review');
    expect(listPlaybooks('alg2u4').map((b) => b.key)).toEqual(['all', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8']);
    expect(listSections('alg2u4').map((s) => s.key)).toEqual(['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8']);
    expect(solo.HUBS.algebra2.games.map((g) => g.drill)).toContain('alg2u4');
    for (const b of Object.keys(bank.BOOKS).filter((k) => k !== 'all')) expect(Object.values(bank.TEMPLATES).filter((t) => t.book === b).length).toBeGreaterThanOrEqual(4);
  });
});

describe('alg2 unit 4: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => K.wellFormed(bank, id));
  test('no choice ever says "0" of a shift, and nothing is shifted by nothing', () => {
    for (const id of Object.keys(bank.TEMPLATES)) for (const p of K.deal(bank, id, 300)) expect(`${p.head} ${p.choices ? p.choices.map((c) => c.html).join(' | ') : ''}`).not.toMatch(/\b(up|down|left|right|shifted) 0\b/);
  });
});

const CHECK = {
  // ---- 4.1
  turningPoint(p) { const q = Q(p); expect(keyOf(p)).toBe(pt([q.h, q.k])); },
  maxOrMin(p) { expect(keyOf(p)).toBe(Q(p).a > 0 ? 'Min — the graph opens up' : 'Max — the graph opens down'); },
  axisOfSymmetry(p) { expect(keyOf(p)).toBe(`x = ${Q(p).h}`); },
  domainOrRange(p) { const q = Q(p); expect(keyOf(p)).toBe(/domain/.test(askOf(p)) ? 'All real numbers' : `y ${q.a > 0 ? '≥' : '≤'} ${q.k}`); },
  yInterceptOfVertexForm(p) { expect(keyOf(p)).toBe(pt([0, Q(p).f(0)])); },
  whichHasThisTurningPoint(p) { const [[h, k]] = points(askOf(p)); only(p, (s) => { const q = K.quadOf(K.fnOf(rhs(s))); return close(q.h, h) && close(q.k, k); }); },
  rootsFromVertexForm(p) {
    const { f } = Q(p);
    only(p, (s) => { const m = s.match(/^x = (-?\d+), (-?\d+)$/); return !!m && m[1] !== m[2] && close(f(Number(m[1])), 0) && close(f(Number(m[2])), 0); });
  },
  vertexToStandardForm(p) { only(p, (s) => sameFn(s, promptOf(p))); expect(keyOf(p)).toMatch(/^y = -?\d*x\^\(2\)( [+-] \d*x)?( [+-] \d+)?$/); },
  namesOfTheForms(p) {
    if (/written this way/.test(askOf(p))) { expect(promptOf(p)).toBe('f(x) = a(x - h)^(2) + k'); expect(keyOf(p)).toBe('vertex form'); } else expect(keyOf(p)).toBe('ax^(2) + bx + c');
  },
  // ---- 4.2
  addToEachSide(p) {
    // n + y = x² + bx: the right side becomes a perfect square when (b/2)² is added
    const b = K.quadOf(K.fnOf(rhs(promptOf(p)))).b; expect(typedOf(p)).toBe((b / 2) ** 2);
    expect(K.same(`${rhs(promptOf(p))} + ${typedOf(p)}`, `(x + ${b / 2})^(2)`)).toBe(true);
  },
  completeTheSquare(p) { only(p, (s) => sameFn(s, promptOf(p))); expect(keyOf(p)).toMatch(/^y = \(x [+-] \d+\)\^\(2\)( [+-] \d+)?$/); },
  completeTheSquareLeading(p) { only(p, (s) => sameFn(s, promptOf(p))); expect(keyOf(p)).toMatch(/^y = -?\d+\(x [+-] \d+\)\^\(2\)( [+-] \d+)?$/); },
  vertexFormulaX(p) { const q = Q(p); expect(typedOf(p)).toBe(-q.b / (2 * q.a)); },
  turningPointOfStandardForm(p) { const q = Q(p); const x = -q.b / (2 * q.a); expect(keyOf(p)).toBe(pt([x, q.f(x)])); },
  yInterceptOfStandardForm(p) { expect(keyOf(p)).toBe(pt([0, Q(p).f(0)])); },
  completingTheSquareSteps(p) {
    const ask = askOf(p);
    expect(keyOf(p)).toBe(/leading coefficient has to be/.test(ask) ? '1' : /adding/.test(ask) ? 'EACH side of the equation' : 'y');
  },
  // ---- 4.3
  solveForA(p) {
    const [[h, k], [x, y]] = points(askOf(p)); const a = typedOf(p);
    expect(a * (x - h) ** 2 + k).toBe(y); expect(x).not.toBe(h);
    expect(close(K.gap(promptOf(p))({ a }), 0)).toBe(true); // the equation on the card says the same
  },
  substituteTheVertex(p) {
    const [[h, k], [x, y]] = points(askOf(p)); const a = (y - k) / (x - h) ** 2;
    // the right substitution is the one the true a satisfies — and it must be y = a(x − h)² + k with these four numbers
    only(p, (s) => close(K.gap(s)({ a }), 0) && close(K.gap(s)({ a: a + 1 }), -((x - h) ** 2)));
    expect(K.ints(keyOf(p).replace(/\^\(2\)/, '')).map(Math.abs)).toEqual([y, x, h, k].map(Math.abs));
  },
  equationFromVertexAndPoint(p) {
    const [[h, k], [x, y]] = points(askOf(p));
    only(p, (s) => { const f = K.fnOf(rhs(s)); const q = K.quadOf(f); return close(q.h, h) && close(q.k, k) && close(f(x), y); });
  },
  fractionA(p) {
    const [[h, k], [x, y]] = points(askOf(p));
    only(p, (s) => close(K.fracValue(s) * (x - h) ** 2 + k, y)); expect(K.reduced(keyOf(p))).toBe(true); expect(keyOf(p)).toMatch(/\//);
  },
  // ---- 4.4
  shiftRule(p) {
    const q = promptOf(p); let m;
    if ((m = q.match(/^g\(x\) = f\(x\) ([+-]) (\d+)$/))) expect(keyOf(p)).toBe(`${m[1] === '+' ? 'up' : 'down'} ${m[2]}`);
    else { m = q.match(/^g\(x\) = f\(x ([+-]) (\d+)\)$/); expect(keyOf(p)).toBe(`${m[1] === '-' ? 'right' : 'left'} ${m[2]}`); }
  },
  shiftsFromVertexForm(p) { const q = Q(p); expect(q.a).toBe(1); expect(keyOf(p)).toBe(`${H(q.h)}, ${V(q.k)}`); },
  shiftWordsToEquation(p) { const { h, k } = shiftsIn(askOf(p)); expect(h * k).not.toBe(0); only(p, (s) => K.same(rhs(s), `(x - (${h}))^(2) + (${k})`)); },
  pointAfterShift(p) {
    const [[x0, y0]] = points(askOf(p)); expect(y0).toBe(x0 * x0);
    const [, n, dir] = askOf(p).match(/translated (\d+) units (up|down|left|right)/); const c = Number(n);
    expect(keyOf(p)).toBe(pt({ up: [x0, y0 + c], down: [x0, y0 - c], left: [x0 - c, y0], right: [x0 + c, y0] }[dir]));
  },
  vertexAfterShifts(p) { const { h, k } = shiftsIn(askOf(p)); expect(h * k).not.toBe(0); expect(keyOf(p)).toBe(pt([h, k])); },
  shiftedGraphToEquation(p) { const g = drawn(p); only(p, g.on); expect(K.quadOf(K.fnOf(rhs(keyOf(p)))).a).toBe(1); },
  standardFormToShifts(p) { const q = Q(p); expect(q.a).toBe(1); expect(keyOf(p)).toBe(`${H(q.h)}, ${V(q.k)}`); },
  // ---- 4.5
  reflectionRule(p) { expect(keyOf(p)).toBe(promptOf(p) === 'y = -f(x)' ? 'reflect over the x-axis' : 'reflect over the y-axis'); expect(promptOf(p)).toMatch(/^y = (-f\(x\)|f\(-x\))$/); },
  reflectOverTheXAxis(p) { only(p, (s) => K.same(rhs(s), `-(${rhs(promptOf(p))})`)); },
  reflectOverTheYAxis(p) {
    const f = rhs(promptOf(p));
    // f(−x), written with the −x still visible (the packet keeps (−x)²)
    expect(keyOf(p)).toBe(`g(x) = ${f.replace(/x/g, '(-x)')}`);
    for (const w of wrongsOf(p)) expect(K.same(rhs(w), f)).toBe(false); // no wrong choice is the same graph
  },
  pointAfterReflection(p) {
    const [[a, b]] = points(askOf(p)); const overX = /of -h\(x\)\?$/.test(askOf(p));
    expect(askOf(p)).toMatch(/of (-h\(x\)|h\(-x\))\?$/); expect(keyOf(p)).toBe(overX ? pt([a, -b]) : pt([-a, b]));
  },
  vertexAfterReflection(p) {
    const q = Q(p); const [[h, k]] = points(askOf(p)); expect([q.h, q.k]).toEqual([h, k]);
    const overX = /of -f\(x\)\?$/.test(askOf(p)); expect(askOf(p)).toMatch(/of (-f\(x\)|f\(-x\))\?$/);
    // the vertex of the reflected function, found from the function itself
    const g = overX ? (x) => -q.f(x) : (x) => q.f(-x); const v = K.quadOf(g);
    expect(keyOf(p)).toBe(pt([Math.round(v.h), Math.round(v.k)]));
  },
  listWithAReflection(p) {
    const text = promptOf(p);
    if (/\(-x\)/.test(text)) { const h = horizontalOf(text); expect([h.outside, h.inside, h.c]).toEqual([false, true, 1]); expect(keyOf(p)).toBe(`reflect over the y-axis, ${V(h.k)}`); } else { const q = Q(p); expect(keyOf(p)).toBe(listOf(q.a, q.h, q.k)); expect(q.a).toBe(-1); }
  },
  reflectionWordsToEquation(p) {
    const ask = askOf(p); const { h, k } = shiftsIn(ask);
    if (/y-axis/.test(ask)) { expect(h).toBe(0); expect(keyOf(p)).toBe(`y = (-x)^(2) ${k > 0 ? '+' : '-'} ${Math.abs(k)}`); for (const w of wrongsOf(p)) expect(K.same(rhs(w), rhs(keyOf(p)))).toBe(false); } else { expect(ask).toMatch(/x-axis/); only(p, (s) => K.same(rhs(s), `-(x - (${h}))^(2) + (${k})`)); }
  },
  reflectedGraphToEquation(p) { const g = drawn(p); only(p, g.on); expect(K.quadOf(K.fnOf(rhs(keyOf(p)))).a).toBe(-1); },
  // ---- 4.6
  stretchOrCompression(p) { const q = Q(p); expect([q.h, q.k]).toEqual([0, 0]); expect(q.a).toBeGreaterThan(0); expect(keyOf(p)).toBe(listOf(q.a, 0, 0)); },
  pointOnCf(p) {
    const [[x0, y0]] = points(askOf(p)); const c = calc(askOf(p).match(/.*graph of (.+)f\(x\)\?$/)[1]);
    expect(keyOf(p)).toBe(pt([x0, c * y0])); expect(Number.isInteger(c * y0)).toBe(true);
  },
  whichCoordinates(p) { const c = calc(askOf(p).match(/g\(x\) = (.+)f\(x\),/)[1]); expect(keyOf(p)).toBe(`y-coordinates by ${K.fracText(c)}`); expect(promptOf(p)).toBe(c > 1 ? 'a vertical stretch' : 'a vertical compression'); },
  readA(p) { const [[h, k], [x, y]] = points(askOf(p)); expect(x).toBe(h + 1); expect(typedOf(p)).toBe(y - k); },
  namethreeTransformations(p) { const q = Q(p); expect(keyOf(p)).toBe(listOf(q.a, q.h, q.k)); expect(keyOf(p).split(', ')).toHaveLength(3); },
  stretchWordsToEquation(p) {
    const ask = askOf(p); let m;
    if ((m = ask.match(/vertical stretch by (\d+) followed by a reflection in the x-axis/))) only(p, (s) => K.same(rhs(s), `-${m[1]}x^(2)`));
    else { m = ask.match(/compressed by a factor of (\d+) in the vertical direction and then shifted (\d+) units down/); only(p, (s) => K.same(rhs(s), `x^(2)/${m[1]} - ${m[2]}`)); }
  },
  shiftComesLast(p) { const q = Q(p); expect(q.h).toBe(0); expect(keyOf(p)).toBe(V(q.k)); expect([keyOf(p), ...wrongsOf(p)].sort()).toEqual(listOf(q.a, 0, q.k).split(', ').sort()); },
  pointsThatStay(p) { expect(keyOf(p)).toBe('the x-intercepts'); },
  narrowerOrWider(p) {
    const size = (s) => Math.abs(K.quadOf(K.fnOf(rhs(s))).a); const all = [keyOf(p), ...wrongsOf(p)].map(size);
    expect(new Set(all.map((v) => v.toFixed(6))).size).toBe(all.length); // no ties
    expect(size(keyOf(p))).toBe(/narrowest/.test(askOf(p)) ? Math.max(...all) : Math.min(...all));
  },
  // ---- 4.7
  listAllTransformations(p) { const q = Q(p); expect(keyOf(p)).toBe(listOf(q.a, q.h, q.k)); expect(keyOf(p).split(', ').length).toBeGreaterThanOrEqual(3); },
  multiWordsToEquation(p) {
    const words = askOf(p).split('transformations: ')[1]; const { h, k } = shiftsIn(words);
    const m = words.match(/vertical (stretch|compression) by (\d+(?:\/\d+)?)/); const size = m ? K.fracValue(m[2]) : 1;
    if (m) expect(size > 1).toBe(m[1] === 'stretch');
    const a = (/reflect over the x-axis/.test(words) ? -1 : 1) * size;
    only(p, (s) => K.same(rhs(s), `(${a})(x - (${h}))^(2) + (${k})`));
  },
  patternFromTheVertex(p) {
    const q = Q(p);
    expect(keyOf(p)).toBe(pt([q.h + 1, q.f(q.h + 1)]));
    // no other choice is a point of the graph at all
    for (const w of wrongsOf(p)) { const [[x, y]] = points(w); expect([w, close(q.f(x), y)]).toEqual([w, false]); }
  },
  graphToEquationMulti(p) { const g = drawn(p); expect(parentDrawn(g.svg)).toBe(true); only(p, g.on); },
  yInterceptValue(p) { expect(typedOf(p)).toBe(Q(p).f(0)); },
  // ---- 4.8
  horizontalRule(p) {
    const ask = askOf(p);
    expect(keyOf(p)).toBe(/c > 1/.test(ask) ? 'a horizontal compression' : /0 < c < 1/.test(ask) ? 'a horizontal stretch' : /take the ___/.test(ask) ? 'reciprocal' : 'x-coordinate of each point');
  },
  nameTheHorizontal(p) { const h = horizontalOf(promptOf(p)); expect([h.outside, h.inside, h.k]).toEqual([false, false, 0]); expect(keyOf(p)).toBe(horizontalWords(h.c)); },
  horizontalWordsToEquation(p) {
    const ask = askOf(p); const { k } = shiftsIn(ask); const m = ask.match(/horizontal (?:stretch by a factor of (\d+)|compression by 1\/(\d+))/);
    const factor = m[1] ? Number(m[1]) : 1 / Number(m[2]); const h = horizontalOf(keyOf(p)); // the coefficient stays INSIDE the square
    expect([h.outside, h.inside, close(h.c, 1 / factor), h.k]).toEqual([false, false, true, k]);
    for (const w of wrongsOf(p)) expect(K.same(rhs(w), rhs(keyOf(p)))).toBe(false);
  },
  pointAfterHorizontal(p) {
    const ask = askOf(p); const [[x0, y0]] = points(ask); expect(y0).toBe(x0 * x0);
    const f = K.fnOf(ask.match(/on y = (\(.+\)\^\(2\))\?$/)[1]);
    only(p, (s) => { const [[x, y]] = points(s); return y === y0 && close(f(x), y); }); // same height, on the new graph
    expect(wrongsOf(p).length).toBeGreaterThanOrEqual(2);
  },
  listWithAHorizontal(p) {
    const h = horizontalOf(promptOf(p));
    expect(h.outside && h.inside).toBe(false);
    expect(keyOf(p)).toBe([h.outside ? 'reflect over the x-axis' : null, h.inside ? 'reflect over the y-axis' : null, horizontalWords(h.c), V(h.k)].filter(Boolean).join(', '));
  },
  horizontalGraphToEquation(p) {
    const g = drawn(p); expect(parentDrawn(g.svg)).toBe(true); only(p, g.on);
    const h = horizontalOf(keyOf(p)); expect(h.c).not.toBe(1); // written with the coefficient inside the square
  },
};

describe('alg2 unit 4: every answer re-solved from the printed question', () => {
  test('every template has a check', () => { expect(Object.keys(CHECK).sort()).toEqual(Object.keys(bank.TEMPLATES).sort()); });
  test.each(Object.keys(CHECK))('%s', (id) => { for (const p of K.deal(bank, id)) CHECK[id](p); });
  test('the checks read the packet\'s own examples the way its key does', () => {
    // Lesson 2: y = x² − 6x + 2 is y = (x − 3)² − 7; y = 2x² + 12x + 13 is y = 2(x + 3)² − 5
    expect(K.same('x^(2) - 6x + 2', '(x - 3)^(2) - 7')).toBe(true);
    expect(K.same('2x^(2) + 12x + 13', '2(x + 3)^(2) - 5')).toBe(true);
    // Lesson 7: y = −2(x + 3)² + 4 → reflect over the x-axis, vertical stretch by 2, left 3, up 4
    const q = K.quadOf(K.fnOf('-2(x + 3)^(2) + 4')); expect(listOf(q.a, q.h, q.k)).toBe('reflect over the x-axis, vertical stretch by 2, left 3, up 4');
    expect(listOf(1 / 4, 5, -1)).toBe('vertical compression by 1/4, right 5, down 1');
    // Lesson 8 note: (2x)² is a horizontal compression by 1/2; ((1/3)x)² is a horizontal stretch by 3; ((3/4)x)² a stretch by 4/3
    expect([horizontalWords(2), horizontalWords(1 / 3), horizontalWords(3 / 4)]).toEqual(['horizontal compression by 1/2', 'horizontal stretch by 3', 'horizontal stretch by 4/3']);
    // "compressed by a factor of 3" is a = 1/3 (the packet's key)
    expect(K.same('((1)/(3))x^(2) - 2', 'x^(2)/3 - 2')).toBe(true);
  });
});
