/**
 * Chapter Review: Honors Geometry — Chapter 1 (Basics of Geometry, 1.1–1.6), built from Mr.
 * Nappier's guided notes, the study sheet and the Chapter 1 Review. Quick-fire: one move per play —
 * the undefined terms and the four postulates, segment addition (numbers, algebra, the Gulf Coast
 * cities), midpoints and bisectors, the midpoint and distance formulas, perimeter and area on the
 * coordinate plane, polygon names, classifying angles, angle addition, bisector algebra,
 * complementary / supplementary / vertical / linear pairs.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 1', blurb: 'Points and lines, segments and midpoints, the coordinate plane, angles and angle pairs — mixed.' },
  basics: { name: 'Points, Lines & Planes', ch: '1.1', blurb: 'The undefined terms, collinear and coplanar, rays and opposite rays, the four postulates.' },
  segments: { name: 'Segments & Midpoints', ch: '1.2–1.3', blurb: 'Segment addition with numbers and algebra, midpoints and bisectors, the whole length.' },
  coord: { name: 'Coordinate Plane', ch: '1.3–1.4', blurb: 'Midpoint and distance formulas, the missing endpoint, perimeter and area, polygon names.' },
  angles: { name: 'Angles & Angle Pairs', ch: '1.5–1.6', blurb: 'Classify, angle addition, bisectors, complementary and supplementary, vertical angles and linear pairs.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const expr = (a, b, v = 'x') => (b === 0 ? `${a === 1 ? '' : a}${v}` : `${a === 1 ? '' : a}${v} ${b < 0 ? M : '+'} ${Math.abs(b)}`);
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [9, 12, 15], [7, 24, 25]];
const POLY = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const names = (rand, n) => sample(rand, [...LETTERS], n);

const T = {};

// ------------------------------------------------------------------ 1.1
T.terms = { book: 'basics', make(rand) {
  const V = [
    ['the three undefined terms of geometry', 'point, line, and plane'], ['points that lie on the same line', 'collinear points'], ['points that lie in the same plane', 'coplanar points'],
    ['part of a line with two endpoints', 'a line segment'], ['part of a line with one endpoint, extending forever one way', 'a ray'], ['two rays with a common endpoint that form a line', 'opposite rays'],
    ['a rule accepted without proof', 'a postulate (axiom)'], ['the tool used to draw a circle or copy a length', 'a compass'], ['the tool used to draw a straight line', 'a straightedge'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

T.postulate = { book: 'basics', make(rand) {
  const Q = [
    ['every point on a line can be paired with a real number, and distance is the absolute value of the difference', 'Ruler Postulate'],
    ['if B is between A and C, then AB + BC = AC', 'Segment Addition Postulate'],
    ['rays from a point on a line can be paired with the numbers from 0 to 180', 'Protractor Postulate'],
    ['if M is in the interior of ∠JKL, then m∠JKM + m∠MKL = m∠JKL', 'Angle Addition Postulate'],
  ];
  const [d, w] = pick(rand, Q);
  return { ask: 'Which postulate?', prompt: d, ...mc(rand, w, Q.map((q) => q[1])), tell: `${w}.` };
} };

T.naming = { book: 'basics', make(rand) {
  const [A, B, C] = names(rand, 3);
  const Q = [
    { q: `How many points name a line?`, ans: 'any two points on it', wrongs: ['exactly one point', 'three collinear points', 'all of its points'] },
    { q: `How many non-collinear points name a plane?`, ans: 'three', wrongs: ['two', 'one', 'four'] },
    { q: `Ray ${A}${B} and ray ${B}${A} — the same ray?`, ans: `No — a ray is named endpoint first, so they start at different points`, wrongs: ['Yes — the same two points', 'Yes — order never matters', 'No — they are opposite rays'] },
    { q: `Two distinct lines intersect in…`, ans: 'exactly one point', wrongs: ['a line', 'two points', 'a plane'] },
    { q: `Two distinct planes intersect in…`, ans: 'a line', wrongs: ['a point', 'a plane', 'a ray'] },
    { q: `Segment ${A}${B} and segment ${B}${A} — the same segment?`, ans: 'Yes — a segment is named by its two endpoints in either order', wrongs: ['No — the order matters', 'No — they are opposite rays', `Only if ${C} is the midpoint`] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Basics', prompt: q.q, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

// ------------------------------------------------------------------ 1.2–1.3
T.segAdd = { book: 'segments', make(rand) {
  const [P, Q, R] = names(rand, 3); const a = int(rand, 3, 40); const b = int(rand, 3, 40);
  if (rand() < 0.5) return { ask: `Find ${P}${R}`, prompt: `${Q} is between ${P} and ${R}. ${P}${Q} = ${a} and ${Q}${R} = ${b}.`, typed: a + b, tell: `Segment Addition: ${P}${Q} + ${Q}${R} = ${P}${R} → ${a} + ${b} = ${a + b}.` };
  return { ask: `Find ${Q}${R}`, prompt: `${Q} is between ${P} and ${R}. ${P}${R} = ${a + b} and ${P}${Q} = ${a}.`, typed: b, tell: `${P}${Q} + ${Q}${R} = ${P}${R} → ${a} + ${Q}${R} = ${a + b} → ${Q}${R} = ${b}.` };
} };

T.segAlgebra = { book: 'segments', make(rand) {
  const [R, S, T2] = names(rand, 3); const x = int(rand, 2, 12); const a = int(rand, 2, 6); const b = int(rand, -9, 9); const c = int(rand, 1, 5); const d = int(rand, -9, 9);
  const rs = a * x + b; const st = c * x + d; if (rs <= 0 || st <= 0) return T.segAlgebra.make(rand); const rt = rs + st; const want = pick(rand, ['x', 'RS', 'RT']);
  return { ask: want === 'x' ? 'Find x' : `Find ${want === 'RS' ? `${R}${S}` : `${R}${T2}`}`, prompt: `${S} is between ${R} and ${T2}. ${R}${S} = ${expr(a, b)}, ${S}${T2} = ${expr(c, d)}, ${R}${T2} = ${rt}.`, typed: want === 'x' ? x : want === 'RS' ? rs : rt,
    tell: `${expr(a, b)} + ${expr(c, d)} = ${rt} → ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = ${rt} → x = ${x}; ${R}${S} = ${rs}, ${S}${T2} = ${st}.` };
} };

T.cities = { book: 'segments', make(rand) {
  const routes = [['Tampa', 'Sarasota', 'Fort Myers'], ['Atlanta', 'Macon', 'Valdosta'], ['Dallas', 'Waco', 'Austin'], ['Charlotte', 'Columbia', 'Charleston']];
  const [A, B, C] = pick(rand, routes); const ab = int(rand, 40, 120); const bc = int(rand, 40, 120);
  if (rand() < 0.5) return { ask: `Find the distance from ${A} to ${B}`, prompt: `${A}, ${B}, and ${C} lie on a straight line, in that order. ${A} to ${C} is ${ab + bc} miles; ${B} to ${C} is ${bc} miles.`, typed: ab, tell: `${ab + bc} − ${bc} = ${ab} miles.` };
  return { ask: `Find the distance from ${A} to ${C}`, prompt: `${A}, ${B}, and ${C} lie on a straight line, in that order. ${A} to ${B} is ${ab} miles; ${B} to ${C} is ${bc} miles.`, typed: ab + bc, tell: `${ab} + ${bc} = ${ab + bc} miles.` };
} };

T.midpointFacts = { book: 'segments', make(rand) {
  const [S, C, A] = names(rand, 3); const half = int(rand, 4, 30);
  if (rand() < 0.5) return { ask: `Find ${C}${A}`, prompt: `${C} is the midpoint of ${S}${A}. ${S}${C} = ${half}.`, typed: half, tell: `a midpoint makes two congruent halves: ${C}${A} = ${S}${C} = ${half}.` };
  return { ask: `Find ${S}${C}`, prompt: `${C} is the midpoint of ${S}${A}. ${S}${A} = ${2 * half}.`, typed: half, tell: `half of ${2 * half} = ${half}.` };
} };

T.midpointAlgebra = { book: 'segments', make(rand) {
  const [D, C, E] = names(rand, 3); const x = int(rand, 2, 12); const a = int(rand, 2, 9); const c = int(rand, 1, a - 1); const b = int(rand, -9, 9); const d = (a - c) * x + b; const half = a * x + b;
  if (half <= 0 || b === d) return T.midpointAlgebra.make(rand); const want = pick(rand, ['x', 'whole']);
  const who = rand() < 0.5 ? `${C} is the midpoint of ${D}${E}.` : `Line m bisects ${D}${E} at ${C}.`;
  return { ask: want === 'x' ? 'Find x' : `Find ${D}${E}`, prompt: `${who} ${D}${C} = ${expr(a, b)} and ${C}${E} = ${expr(c, d)}.`, typed: want === 'x' ? x : 2 * half,
    tell: `the halves are equal: ${expr(a, b)} = ${expr(c, d)} → ${a - c}x = ${d - b} → x = ${x}; each half is ${half}, so ${D}${E} = ${2 * half}.` };
} };

// ------------------------------------------------------------------ 1.3–1.4 coordinate plane
T.midpointCoords = { book: 'coord', make(rand) {
  const mx = int(rand, -6, 6); const my = int(rand, -6, 6); const dx = int(rand, 1, 6); const dy = int(rand, 1, 6);
  const [P, Q] = names(rand, 2);
  return { ask: `Find the midpoint of ${P}${Q}`, prompt: `${P}${pt(mx - dx, my - dy)} and ${Q}${pt(mx + dx, my + dy)}`, ...mc(rand, pt(mx, my), [pt(dx, dy), pt(2 * mx, 2 * my), pt(my, mx), pt(mx - dx, my + dy), pt(mx + dx, my - dy)]),
    tell: `average the coordinates: ((${num(mx - dx)} + ${num(mx + dx)})/2, (${num(my - dy)} + ${num(my + dy)})/2) = ${pt(mx, my)}.` };
} };

T.endpoint = { book: 'coord', make(rand) {
  const jx = int(rand, -8, 8); const jy = int(rand, -8, 8); const mx = int(rand, -6, 6); const my = int(rand, -6, 6); if (jx === mx || jy === my) return T.endpoint.make(rand);
  const kx = 2 * mx - jx; const ky = 2 * my - jy; const [J, K, Mm] = names(rand, 3);
  return { ask: `Find ${K}`, prompt: `${Mm}${pt(mx, my)} is the midpoint of ${J}${K}, and ${J} is ${pt(jx, jy)}.`, ...mc(rand, pt(kx, ky), [pt((jx + mx) / 2, (jy + my) / 2), pt(mx - jx, my - jy), pt(2 * jx - mx, 2 * jy - my), pt(ky, kx)]),
    tell: `the midpoint is halfway: go from ${J} to ${Mm} and the same again — (2 · ${num(mx)} − ${num(jx)}, 2 · ${num(my)} − ${num(jy)}) = ${pt(kx, ky)}.` };
} };

T.distance = { book: 'coord', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const x1 = int(rand, -6, 6); const y1 = int(rand, -6, 6); const sx = pick(rand, [1, -1]); const sy = pick(rand, [1, -1]); const [dx, dy] = rand() < 0.5 ? [a, b] : [b, a];
  const [G, H] = names(rand, 2);
  return { ask: `Find ${G}${H}`, prompt: `${G}${pt(x1, y1)} and ${H}${pt(x1 + sx * dx, y1 + sy * dy)}`, typed: c, tell: `√((${dx})² + (${dy})²) = √(${dx * dx} + ${dy * dy}) = √${c * c} = ${c}.` };
} };

T.congruentSegs = { book: 'coord', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES.slice(0, 3)); const same = rand() < 0.5; const [d, e, f] = same ? [b, a, c] : pick(rand, TRIPLES.filter((t) => t[2] !== c));
  const x1 = int(rand, -5, 5); const y1 = int(rand, -5, 5); const x2 = int(rand, -5, 5); const y2 = int(rand, -5, 5);
  return { ask: 'Are AB and CD congruent?', prompt: `A${pt(x1, y1)}, B${pt(x1 + a, y1 + b)}; C${pt(x2, y2)}, D${pt(x2 - d, y2 + e)}`,
    ...mc(rand, same ? `Yes — AB = CD = ${c}` : `No — AB = ${c}, CD = ${f}`, [same ? `No — AB = ${c}, CD = ${c + 1}` : `Yes — AB = CD = ${c}`, 'Yes — they have the same slope', 'No — they point different directions']),
    tell: `AB = √(${a}² + ${b}²) = ${c}; CD = √(${d}² + ${e}²) = ${f}. ${same ? 'Equal lengths → congruent.' : 'Different lengths → not congruent.'}` };
} };

T.rectangle = { book: 'coord', make(rand) {
  const x1 = int(rand, -8, 2); const y1 = int(rand, -8, 2); const w = int(rand, 2, 10); const h = int(rand, 2, 10); const want = rand() < 0.5 ? 'perimeter' : 'area';
  return { ask: `Find the ${want}`, prompt: `A rectangle has vertices ${pt(x1, y1 + h)}, ${pt(x1 + w, y1 + h)}, ${pt(x1 + w, y1)}, and ${pt(x1, y1)}.`, typed: want === 'area' ? w * h : 2 * (w + h),
    tell: `width ${w} (from ${num(x1)} to ${num(x1 + w)}), height ${h} (from ${num(y1)} to ${num(y1 + h)}): P = 2(${w}) + 2(${h}) = ${2 * (w + h)}, A = ${w} · ${h} = ${w * h}.` };
} };

T.triangleArea = { book: 'coord', make(rand) {
  const x1 = int(rand, -6, 3); const y1 = int(rand, -6, 3); const [a, b, c] = pick(rand, TRIPLES); const want = rand() < 0.5 ? 'area' : 'perimeter';
  return { ask: `Find the ${want}`, prompt: `A right triangle has vertices ${pt(x1, y1)}, ${pt(x1 + a, y1)}, and ${pt(x1, y1 + b)}.`, typed: want === 'area' ? (a * b) / 2 : a + b + c,
    tell: `legs ${a} and ${b} along the grid, hypotenuse √(${a}² + ${b}²) = ${c}: A = ½ · ${a} · ${b} = ${(a * b) / 2}, P = ${a} + ${b} + ${c} = ${a + b + c}.` };
} };

T.polygonName = { book: 'coord', make(rand) {
  const n = pick(rand, Object.keys(POLY).map(Number));
  if (rand() < 0.25) return { ask: 'Convex or concave?', prompt: 'A polygon with a "dent" — one vertex pokes inward.', ...mc(rand, 'concave', ['convex', 'regular', 'not a polygon']), tell: 'a dent means concave; convex has no dents (every diagonal stays inside).' };
  return { ask: 'Name the polygon', prompt: `${n} sides`, ...mc(rand, POLY[n], Object.values(POLY)), tell: `${n} sides: ${POLY[n]}.` };
} };

// ------------------------------------------------------------------ 1.5–1.6
T.classify = { book: 'angles', make(rand) {
  const m = pick(rand, [int(rand, 1, 89), 90, int(rand, 91, 179), 180]);
  const ans = m < 90 ? 'acute' : m === 90 ? 'right' : m < 180 ? 'obtuse' : 'straight';
  return { ask: 'Classify the angle', prompt: `${m}°`, ...mc(rand, ans, ['acute', 'right', 'obtuse', 'straight']), tell: `${m}° is ${ans}: acute < 90°, right = 90°, obtuse between 90° and 180°, straight = 180°.` };
} };

T.angleAdd = { book: 'angles', make(rand) {
  const [A, B, C, D] = names(rand, 4); const a = int(rand, 10, 80); const b = int(rand, 10, 80);
  if (rand() < 0.5) return { ask: `Find m∠${A}${B}${C}`, prompt: `${D} is in the interior of ∠${A}${B}${C}. m∠${A}${B}${D} = ${a}° and m∠${D}${B}${C} = ${b}°.`, typed: a + b, tell: `Angle Addition: ${a} + ${b} = ${a + b}°.` };
  return { ask: `Find m∠${D}${B}${C}`, prompt: `${D} is in the interior of ∠${A}${B}${C}. m∠${A}${B}${C} = ${a + b}° and m∠${A}${B}${D} = ${a}°.`, typed: b, tell: `${a + b} − ${a} = ${b}°.` };
} };

T.splitAngle = { book: 'angles', make(rand) {
  const straight = rand() < 0.5; const total = straight ? 180 : 90; const x = int(rand, 2, 15); const a = int(rand, 2, 9); const c = int(rand, 1, 6); const b = int(rand, -9, 15); const d = total - (a + c) * x - b;
  const m1 = a * x + b; const m2 = c * x + d; if (m1 <= 0 || m2 <= 0 || d < -15 || d > 60) return T.splitAngle.make(rand);
  const [D, E, F, G] = names(rand, 4); const want = pick(rand, ['x', 'first', 'second']);
  return { ask: want === 'x' ? 'Find x' : `Find m∠${want === 'first' ? `${D}${E}${G}` : `${G}${E}${F}`}`, prompt: `∠${D}${E}${F} is a ${straight ? 'straight' : 'right'} angle. m∠${D}${E}${G} = (${expr(a, b)})° and m∠${G}${E}${F} = (${expr(c, d)})°.`, typed: want === 'x' ? x : want === 'first' ? m1 : m2,
    tell: `the parts add to ${total}: ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = ${total} → x = ${x}; the angles are ${m1}° and ${m2}°.` };
} };

T.bisector = { book: 'angles', make(rand) {
  const [X, W, Y, Z] = names(rand, 4); const kind = pick(rand, ['halves', 'whole']);
  if (kind === 'halves') { const x = int(rand, 2, 12); const a = int(rand, 2, 9); const c = int(rand, 1, a - 1); const b = int(rand, -12, 12); const d = (a - c) * x + b; const half = a * x + b; if (half <= 0 || half >= 90 || b === d) return T.bisector.make(rand);
    const want = rand() < 0.5 ? 'x' : 'whole';
    return { ask: want === 'x' ? 'Find x' : `Find m∠${X}${W}${Z}`, prompt: `Ray ${W}${Y} bisects ∠${X}${W}${Z}. m∠${X}${W}${Y} = (${expr(a, b)})° and m∠${Y}${W}${Z} = (${expr(c, d)})°.`, typed: want === 'x' ? x : 2 * half,
      tell: `a bisector makes two congruent angles: ${expr(a, b)} = ${expr(c, d)} → x = ${x}; each half is ${half}°, the whole is ${2 * half}°.` }; }
  const y = int(rand, 2, 12); const a = int(rand, 3, 8); const b = int(rand, -9, 9); const half = a * y + b; const c = 2 * a - int(rand, 1, a - 1); const d = 2 * half - c * y; if (half <= 0 || half >= 90) return T.bisector.make(rand);
  return { ask: `Find m∠${X}${W}${Y}`, prompt: `Ray ${W}${Y} bisects ∠${X}${W}${Z}. m∠${X}${W}${Y} = (${expr(a, b, 'y')})° and m∠${X}${W}${Z} = (${expr(c, d, 'y')})°.`, typed: half,
    tell: `the half is half the whole: 2(${expr(a, b, 'y')}) = ${expr(c, d, 'y')} → ${2 * a}y ${2 * b < 0 ? M : '+'} ${Math.abs(2 * b)} = ${expr(c, d, 'y')} → y = ${y}; m∠${X}${W}${Y} = ${half}°.` };
} };

T.compSupp = { book: 'angles', make(rand) {
  const comp = rand() < 0.5; const total = comp ? 90 : 180; const x = int(rand, 2, 20); const a = int(rand, 2, 9); const c = int(rand, 1, 8); const b = int(rand, -10, 30); const d = total - (a + c) * x - b;
  const m1 = a * x + b; const m2 = c * x + d; if (m1 <= 0 || m2 <= 0 || d < -30 || d > 60) return T.compSupp.make(rand);
  const want = pick(rand, ['x', 'first', 'second']); const [A, B, C, D, E, F] = names(rand, 6);
  return { ask: want === 'x' ? 'Find x' : `Find m∠${want === 'first' ? `${A}${B}${C}` : `${D}${E}${F}`}`, prompt: `∠${A}${B}${C} and ∠${D}${E}${F} are ${comp ? 'complementary' : 'supplementary'}. m∠${A}${B}${C} = (${expr(a, b)})° and m∠${D}${E}${F} = (${expr(c, d)})°.`, typed: want === 'x' ? x : want === 'first' ? m1 : m2,
    tell: `${comp ? 'complementary' : 'supplementary'} → add to ${total}: ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = ${total} → x = ${x}; the angles are ${m1}° and ${m2}°.` };
} };

T.complementOf = { book: 'angles', make(rand) {
  const m = int(rand, 5, 85); const want = rand() < 0.5 ? 'complement' : 'supplement';
  return { ask: `Find the ${want} of a ${m}° angle`, prompt: `${want === 'complement' ? 'Complementary angles add to 90°.' : 'Supplementary angles add to 180°.'}`, typed: (want === 'complement' ? 90 : 180) - m, tell: `${want === 'complement' ? 90 : 180} − ${m} = ${(want === 'complement' ? 90 : 180) - m}°.` };
} };

T.verticalLinear = { book: 'angles', make(rand) {
  const vertical = rand() < 0.5; const x = int(rand, 3, 20); const a = int(rand, 2, 8);
  if (vertical) { const c = int(rand, 1, a - 1); const b = int(rand, -15, 20); const d = (a - c) * x + b; const m = a * x + b; if (m <= 0 || m >= 180 || b === d) return T.verticalLinear.make(rand);
    return { ask: rand() < 0.5 ? 'Find x' : 'Find m∠1', prompt: `∠1 and ∠3 are vertical angles. m∠1 = (${expr(a, b)})° and m∠3 = (${expr(c, d)})°.`, typed: 0, tell: `vertical angles are congruent: ${expr(a, b)} = ${expr(c, d)} → x = ${x}; m∠1 = ${m}°.` }; }
  const c = int(rand, 1, 8); const b = int(rand, -10, 30); const d = 180 - (a + c) * x - b; const m1 = a * x + b; const m2 = c * x + d; if (m1 <= 0 || m2 <= 0 || d < -30 || d > 60) return T.verticalLinear.make(rand);
  return { ask: rand() < 0.5 ? 'Find x' : 'Find the larger angle', prompt: `Two angles form a linear pair: (${expr(a, b)})° and (${expr(c, d)})°.`, typed: 0, tell: `a linear pair is supplementary: ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = 180 → x = ${x}; the angles are ${m1}° and ${m2}°.` };
} };
{ const base = T.verticalLinear.make; T.verticalLinear.make = (rand) => { const t = base(rand); const m = t.tell.match(/x = (\d+); (?:m∠1 = (\d+)°|the angles are (\d+)° and (\d+)°)/); t.typed = /Find x/.test(t.ask) ? +m[1] : m[2] ? +m[2] : Math.max(+m[3], +m[4]); return t; }; }

T.pairType = { book: 'angles', make(rand) {
  const Q = [
    ['two angles whose measures add to 90°', 'complementary angles'], ['two angles whose measures add to 180°', 'supplementary angles'],
    ['two angles that share a vertex and a side but no interior points', 'adjacent angles'], ['two adjacent angles whose non-common sides are opposite rays', 'a linear pair'],
    ['two non-adjacent angles formed by two intersecting lines — across the X', 'vertical angles'],
    ['the relationship between the two angles of a linear pair', 'supplementary angles'], ['the relationship between two vertical angles', 'congruent angles'],
  ];
  const [d, w] = pick(rand, Q);
  return { ask: 'Name the pair', prompt: d, ...mc(rand, w, uniq(Q.map((q) => q[1]))), tell: `${w}.` };
} };

T.diagram = { book: 'angles', make(rand) {
  const m = int(rand, 20, 160); const kind = pick(rand, ['vertical', 'linear', 'both']);
  if (kind === 'vertical') return { ask: 'Find m∠3', prompt: `Two lines cross. ∠1 and ∠3 are vertical angles; m∠1 = ${m}°.`, typed: m, tell: `vertical angles are congruent: ${m}°.` };
  if (kind === 'linear') return { ask: 'Find m∠2', prompt: `Two lines cross. ∠1 and ∠2 form a linear pair; m∠1 = ${m}°.`, typed: 180 - m, tell: `a linear pair adds to 180: 180 − ${m} = ${180 - m}°.` };
  return { ask: 'Find m∠4', prompt: `Two lines cross, making ∠1, ∠2, ∠3, ∠4 in order around the point. m∠1 = ${m}°.`, typed: 180 - m, tell: `∠4 is next to ∠1 (a linear pair): 180 − ${m} = ${180 - m}°. (∠3, across from ∠1, is also ${m}°.)` };
} };

module.exports = makeBank(BOOKS, T);
