/**
 * Chapter Review: Honors Geometry — Chapter 6 (Relationships Within Triangles, 6.1–6.5), built from
 * Mr. Nappier's guided notes, study sheet, Points of Concurrency Reference Guide and Chapter 6
 * Review. Quick-fire: one move per play — x from an equidistance, which center, where it lands,
 * the centroid's 2 : 1, a midsegment's half, order the angles, can these be sides, the range.
 *
 * Wrong choices are the guide's traps: a median for an altitude, an equidistance theorem for the
 * orthocenter (it has none), the circumcenter always inside, the sum instead of the difference
 * for the third side's low end.
 */
const { M, num, int, pick, sample, shuffle, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 6', blurb: 'Bisectors, the four centers, midsegments, inequalities and indirect proof — mixed.' },
  bis: { name: 'Perpendicular & Angle Bisectors', ch: '6.1', blurb: 'Equidistant from the endpoints; equidistant from the sides; write the bisector.' },
  centers: { name: 'Points of Concurrency', ch: '6.2–6.3', blurb: 'Circumcenter, incenter, centroid, orthocenter — which, where, and the 2 : 1.' },
  mid: { name: 'Midsegments', ch: '6.4', blurb: 'Parallel to the third side and half as long; half the perimeter.' },
  ineq: { name: 'Inequalities & Indirect Proof', ch: '6.5', blurb: 'Bigger side, bigger angle; can these be sides; the third-side range; the assumption.' },
};

const sexpr = (a, b) => `${a === 1 ? '' : a}x${b === 0 ? '' : b < 0 ? ` − ${-b}` : ` + ${b}`}`;
const seg = (s) => `<span style="text-decoration:overline">${s}</span>`;
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20], [9, 40, 41], [10, 24, 26]];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const names = (rand, n) => sample(rand, [...LETTERS], n);
/** Two linear expressions in x that are equal at x0, both positive there. */
function equalPair(rand, x0, lo = 5, hi = 60) {
  for (;;) {
    const a = int(rand, 2, 9); let c = int(rand, 2, 9); while (c === a) c = int(rand, 2, 9);
    const b = int(rand, -15, 25); const v = a * x0 + b; const d = v - c * x0;
    if (v >= lo && v <= hi) return { a, b, c, d, v };
  }
}

const CENTERS = [
  { name: 'circumcenter', made: 'the three perpendicular bisectors of the sides', gives: 'equidistant from the three VERTICES — the center of the circle through all three', lands: { acute: 'inside', right: 'ON the triangle — the midpoint of the hypotenuse', obtuse: 'outside' } },
  { name: 'incenter', made: 'the three angle bisectors', gives: 'equidistant from the three SIDES — the center of the largest circle that fits inside', lands: { acute: 'inside', right: 'inside', obtuse: 'inside' } },
  { name: 'centroid', made: 'the three medians (vertex to the opposite midpoint)', gives: 'the balance point; it cuts every median in a 2 : 1 ratio from the vertex', lands: { acute: 'inside', right: 'inside', obtuse: 'inside' } },
  { name: 'orthocenter', made: 'the three altitudes (vertex perpendicular to the opposite side)', gives: 'no distance property — it is simply where the three altitudes meet', lands: { acute: 'inside', right: 'AT the right-angle vertex', obtuse: 'outside' } },
];
const THEOREMS = {
  PB: 'Perpendicular Bisector Theorem', PBC: 'Converse of the Perpendicular Bisector Theorem', AB: 'Angle Bisector Theorem', ABC: 'Converse of the Angle Bisector Theorem',
  CIRC: 'Circumcenter Theorem', INC: 'Incenter Theorem', CEN: 'Centroid Theorem', MID: 'Triangle Midsegment Theorem', TRI: 'Triangle Inequality Theorem',
};
const VOCAB = [
  { term: 'equidistant', def: 'the same distance from two or more objects' },
  { term: 'perpendicular bisector', def: 'a line that is perpendicular to a segment at its midpoint' },
  { term: 'distance from a point to a line', def: 'the length of the PERPENDICULAR segment from the point to the line' },
  { term: 'concurrent', def: 'three or more lines, rays or segments that pass through one common point' },
  { term: 'point of concurrency', def: 'the one point that concurrent lines share' },
  { term: 'median of a triangle', def: 'a segment from a vertex to the midpoint of the opposite side' },
  { term: 'altitude of a triangle', def: 'the perpendicular segment from a vertex to the line containing the opposite side' },
  { term: 'midsegment of a triangle', def: 'a segment joining the midpoints of two sides' },
  { term: 'indirect proof', def: 'assume the opposite of what you want to prove, reason to a contradiction, conclude the original statement is true' },
  { term: 'circumcenter', def: 'where the three perpendicular bisectors meet — equidistant from the vertices' },
  { term: 'incenter', def: 'where the three angle bisectors meet — equidistant from the sides' },
  { term: 'centroid', def: 'where the three medians meet — two thirds of the way from each vertex' },
  { term: 'orthocenter', def: 'where the three altitudes meet' },
];

const T = {};

T.pbEquidistant = { book: 'bis', make(rand) {
  const [P, A, B] = names(rand, 3); const x = int(rand, 3, 14); const e = equalPair(rand, x);
  return { ask: 'Find x', prompt: `${P} lies on the perpendicular bisector of ${seg(A + B)}. ${P}${A} = ${sexpr(e.a, e.b)} and ${P}${B} = ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `Perpendicular Bisector Theorem: a point on the perpendicular bisector is equidistant from the endpoints, so ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x} (${P}${A} = ${P}${B} = ${e.v}).` };
} };

T.pbLength = { book: 'bis', make(rand) {
  const [C, M, A, B] = names(rand, 4); const [leg1, leg2, hyp] = pick(rand, TRIPLES); const flip = rand() < 0.5;
  const half = flip ? leg2 : leg1; const height = flip ? leg1 : leg2;
  return { ask: `Find ${C}${M}`, prompt: `${seg(C + M)} is the perpendicular bisector of ${seg(A + B)}, ${C}${A} = ${hyp}, and ${A}${M} = ${half}.`, typed: height,
    tell: `${seg(C + M)} ⊥ ${seg(A + B)} at ${M}, so △${C}${M}${A} is a right triangle: ${C}${M} = √(${hyp}² − ${half}²) = ${height}.` };
} };

T.abAngle = { book: 'bis', make(rand) {
  const [B, D, A, C] = names(rand, 4);
  if (rand() < 0.5) { const x = int(rand, 3, 12); const e = equalPair(rand, x, 10, 80);
    return { ask: 'Find x', prompt: `${seg(B + D)} bisects ∠${A}${B}${C}, m∠${A}${B}${D} = (${sexpr(e.a, e.b)})°, and m∠${D}${B}${C} = (${sexpr(e.c, e.d)})°.`, typed: x,
      tell: `a bisector makes two congruent angles: ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}; each half is ${e.v}°, so m∠${A}${B}${C} = ${2 * e.v}°.` }; }
  const whole = 2 * int(rand, 12, 80);
  return { ask: `Find m∠${A}${B}${D}`, prompt: `${seg(B + D)} bisects ∠${A}${B}${C} and m∠${A}${B}${C} = ${whole}°.`, typed: whole / 2, tell: `half of ${whole}° is ${whole / 2}°.` };
} };

T.abDistance = { book: 'bis', make(rand) {
  const [P, Q, R, S] = names(rand, 4); const x = int(rand, 2, 12); const e = equalPair(rand, x, 3, 40);
  return { ask: 'Find x', prompt: `${P} lies on the bisector of ∠${Q}${R}${S}. The distance from ${P} to ${seg(R + Q)} is ${sexpr(e.a, e.b)} and the distance from ${P} to ${seg(R + S)} is ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `Angle Bisector Theorem: a point on the bisector is equidistant from the two sides, so ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}.` };
} };

T.pbEquation = { book: 'bis', make(rand) {
  const m = pick(rand, [1, -1, 2, -2, 3, -3]); // slope of the perpendicular bisector; AB has slope −1/m
  const [mx, my] = [int(rand, -4, 4), int(rand, -4, 4)]; const k = pick(rand, [1, 2, 3]);
  const A = [mx - m * k, my + k]; const B = [mx + m * k, my - k]; // AB direction (m, −1)·k → slope −1/m
  const b0 = my - m * mx;
  const line = (slope, icpt) => `y = ${slope === 1 ? '' : slope === -1 ? M : num(slope)}x${icpt === 0 ? '' : icpt < 0 ? ` ${M} ${-icpt}` : ` + ${icpt}`}`;
  const ans = line(m, b0);
  const wrong = [line(-m, my + m * mx), line(m, A[1] - m * A[0]), line(m, b0 + pick(rand, [2, -2, 3, -3]))];
  return { ask: 'Write an equation of the perpendicular bisector', prompt: `of the segment with endpoints ${pt(...A)} and ${pt(...B)}`,
    choices: [ans, ...[...new Set(wrong)].filter((w) => w !== ans).slice(0, 3)], answer: 0,
    tell: `midpoint ${pt(mx, my)}; slope of ${seg('AB')} is ${num(-1)}/${num(m)}, so the perpendicular slope is ${num(m)}; through the midpoint: ${ans}.` };
} };

T.converse = { book: 'bis', make(rand) {
  const [T1, U, V, Y, X, Z] = names(rand, 6); const d = int(rand, 4, 20);
  if (rand() < 0.5) return { ask: 'What can you conclude, and by which theorem?', prompt: `Point ${T1} is ${d} in. from ${U} and ${d} in. from ${V}.`,
    choices: [`${T1} lies on the perpendicular bisector of ${seg(U + V)} — ${THEOREMS.PBC}`, `${T1} is the midpoint of ${seg(U + V)} — ${THEOREMS.PB}`, `${T1} lies on the bisector of ∠${U}${T1}${V} — ${THEOREMS.ABC}`, `${T1} is the circumcenter of a triangle — ${THEOREMS.CIRC}`], answer: 0,
    tell: `equidistant from the ENDPOINTS of a segment → on its perpendicular bisector (the converse).` };
  return { ask: 'What can you conclude, and by which theorem?', prompt: `Point ${T1} is in the interior of ∠${X}${Y}${Z}, ${d} cm from ${seg(Y + X)} and ${d} cm from ${seg(Y + Z)}.`,
    choices: [`${T1} lies on the bisector of ∠${X}${Y}${Z} — ${THEOREMS.ABC}`, `${T1} lies on the perpendicular bisector of ${seg(X + Z)} — ${THEOREMS.PBC}`, `${T1} is the incenter of △${X}${Y}${Z} — ${THEOREMS.INC}`, `${Y}${T1} = ${d} — ${THEOREMS.AB}`], answer: 0,
    tell: `equidistant from the two SIDES of an angle → on its bisector (the converse).` };
} };

T.whichCenter = { book: 'centers', make(rand) {
  const c = pick(rand, CENTERS); const byMade = rand() < 0.5;
  const EXTRA = [
    ['the same distance from the three straight walls of a triangular room', 'incenter'], ['the same distance from three towns, for a cell tower', 'circumcenter'],
    ['the balance point of a triangular tabletop', 'centroid'], ['the center of the circle that passes through all three vertices', 'circumcenter'], ['the center of the largest circle that fits inside', 'incenter'],
  ];
  const extra = rand() < 0.3 ? pick(rand, EXTRA) : null;
  const prompt = extra ? `Which center is ${extra[0]}?` : byMade ? `Made from ${c.made}.` : `${c.gives.charAt(0).toUpperCase()}${c.gives.slice(1)}.`;
  const ans = extra ? extra[1] : c.name;
  return { ask: 'Name the point of concurrency', prompt, choices: [ans, ...shuffle(rand, CENTERS.map((z) => z.name).filter((n) => n !== ans))], answer: 0,
    tell: `${ans}: made from ${CENTERS.find((z) => z.name === ans).made} — ${CENTERS.find((z) => z.name === ans).gives}.` };
} };

T.centerLands = { book: 'centers', make(rand) {
  const c = pick(rand, CENTERS.filter((z) => z.name === 'circumcenter' || z.name === 'orthocenter')); const kind = pick(rand, ['acute', 'right', 'obtuse']);
  const ans = c.lands[kind]; const all = ['inside', 'outside', 'ON the triangle — the midpoint of the hypotenuse', 'AT the right-angle vertex'];
  return { ask: `Where is the ${c.name}?`, prompt: `of ${kind === 'acute' ? 'an' : 'a'} ${kind} triangle`, choices: [ans, ...all.filter((s) => s !== ans)], answer: 0,
    tell: kind === 'right' ? (c.name === 'circumcenter' ? 'in a right triangle the midpoint of the hypotenuse is the same distance from all three vertices.' : 'the two legs are themselves altitudes, so they meet at the right angle.') : `${c.name}: inside for acute, outside for obtuse. (The centroid and incenter are ALWAYS inside.)` };
} };

T.centerEquidistant = { book: 'centers', make(rand) {
  const [Q, R, S, T1] = names(rand, 4); const x = int(rand, 3, 14); const e = equalPair(rand, x, 5, 60);
  if (rand() < 0.5) return { ask: `Find ${Q}${T1}`, prompt: `${Q} is the circumcenter of △${R}${S}${T1}, ${Q}${R} = ${sexpr(e.a, e.b)}, and ${Q}${S} = ${sexpr(e.c, e.d)}.`, typed: e.v,
    tell: `Circumcenter Theorem: equidistant from the three VERTICES, so ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}, and ${Q}${T1} = ${Q}${R} = ${e.v}.` };
  return { ask: 'Find the common distance', prompt: `${Q} is the incenter of △${R}${S}${T1}. Its distance to ${seg(R + S)} is ${sexpr(e.a, e.b)} and its distance to ${seg(S + T1)} is ${sexpr(e.c, e.d)}.`, typed: e.v,
    tell: `Incenter Theorem: equidistant from the three SIDES, so ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}; the distance to every side is ${e.v}.` };
} };

T.centroidRatio = { book: 'centers', make(rand) {
  const [P, A, X] = names(rand, 3); const kind = pick(rand, ['fromVertex', 'fromMid', 'whole', 'algebra']);
  if (kind === 'fromVertex') { const px = int(rand, 3, 20); return { ask: `Find ${A}${X}`, prompt: `${P} is the centroid of a triangle and ${seg(A + X)} is a median with ${A}${P} = ${2 * px}.`, typed: 3 * px,
    tell: `Centroid Theorem: vertex-to-centroid is 2/3 of the median, so ${A}${X} = ${2 * px} · 3/2 = ${3 * px} (and ${P}${X} = ${px}).` }; }
  if (kind === 'fromMid') { const px = int(rand, 3, 20); return { ask: `Find ${A}${P}`, prompt: `${P} is the centroid and ${seg(A + X)} is a median with ${P}${X} = ${px}.`, typed: 2 * px,
    tell: `the long piece touches the vertex and is twice the short piece: ${A}${P} = 2 · ${px} = ${2 * px}.` }; }
  if (kind === 'whole') { const px = int(rand, 3, 20); return { ask: `Find ${P}${X}`, prompt: `${P} is the centroid and ${seg(A + X)} is a median with ${A}${X} = ${3 * px}.`, typed: px,
    tell: `the centroid sits 2/3 of the way down the median: ${P}${X} = ${3 * px} ÷ 3 = ${px}.` }; }
  // AP = 2a·x and PX = c·x + d, with PX = a·x at the answer, so AP = 2·PX there.
  const x = int(rand, 2, 12); const a = int(rand, 2, 6); let c = int(rand, 1, 4); while (c === a) c = int(rand, 1, 4);
  const d = (a - c) * x;
  return { ask: 'Find x', prompt: `${P} is the centroid, ${seg(A + X)} is a median, ${A}${P} = ${sexpr(2 * a, 0)}, and ${P}${X} = ${sexpr(c, d)}.`, typed: x,
    tell: `vertex-to-centroid = 2 × centroid-to-midpoint: ${2 * a}x = 2(${sexpr(c, d)}) → x = ${x}; ${P}${X} = ${a * x}, ${A}${P} = ${2 * a * x}, ${A}${X} = ${3 * a * x}.` };
} };

T.centroidCoords = { book: 'centers', make(rand) {
  let xs; let ys;
  do { xs = [int(rand, -8, 8), int(rand, -8, 8), int(rand, -8, 8)]; ys = [int(rand, -8, 8), int(rand, -8, 8), int(rand, -8, 8)]; }
  while ((xs[0] + xs[1] + xs[2]) % 3 || (ys[0] + ys[1] + ys[2]) % 3 || (xs[1] - xs[0]) * (ys[2] - ys[0]) === (xs[2] - xs[0]) * (ys[1] - ys[0])); // a real triangle
  const cx = (xs[0] + xs[1] + xs[2]) / 3; const cy = (ys[0] + ys[1] + ys[2]) / 3; const [D, E, F] = names(rand, 3);
  const wrong = [[cx * 3 / 2, cy * 3 / 2], [(xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2], [cy, cx], [cx + 1, cy - 1]].map(([x, y]) => [Math.round(x), Math.round(y)]).filter(([x, y]) => x !== cx || y !== cy);
  return { ask: 'Find the centroid', prompt: `of △${D}${E}${F} with ${D}${pt(xs[0], ys[0])}, ${E}${pt(xs[1], ys[1])}, and ${F}${pt(xs[2], ys[2])}`,
    choices: [pt(cx, cy), ...[...new Set(wrong.map(([x, y]) => pt(x, y)))].slice(0, 3)], answer: 0,
    tell: `average the x's and average the y's: (${xs.map(num).join(' + ')})/3 = ${num(cx)}, (${ys.map(num).join(' + ')})/3 = ${num(cy)}.` };
} };

T.rightCircumcenter = { book: 'centers', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES.filter((t) => t[0] % 2 === 0 && t[1] % 2 === 0)); const [A, B, C] = names(rand, 3);
  if (rand() < 0.5) return { ask: 'Find the circumcenter', prompt: `of △${A}${B}${C} with ${A}(0, 0), ${B}(0, ${b}), and ${C}(${a}, 0)`,
    choices: [pt(a / 2, b / 2), pt(a / 2, 0), pt(0, b / 2), pt(b / 2, a / 2)].filter((s, i, arr) => arr.indexOf(s) === i), answer: 0,
    tell: `a vertical and a horizontal side: their perpendicular bisectors are x = ${a / 2} and y = ${b / 2} — the midpoint of the hypotenuse.` };
  return { ask: 'How far is the circumcenter from each vertex?', prompt: `△${A}${B}${C} has ${A}(0, 0), ${B}(0, ${b}), and ${C}(${a}, 0).`, typed: c / 2,
    tell: `the hypotenuse is √(${a}² + ${b}²) = ${c}, and the circumcenter is its midpoint, ${c / 2} from every vertex.` };
} };

T.medianOrAltitude = { book: 'centers', make(rand) {
  const Q = [
    { prompt: 'A segment from a vertex to the midpoint of the opposite side.', ans: 'median' },
    { prompt: 'A segment from a vertex perpendicular to the line containing the opposite side.', ans: 'altitude' },
    { prompt: 'In an isosceles triangle, the segment from the vertex angle to the midpoint of the base.', ans: 'both — a median and an altitude' },
    { prompt: 'In a scalene triangle, a segment from a vertex to the midpoint of the opposite side.', ans: 'median' },
    { prompt: 'A line that is perpendicular to a side at its midpoint (it need not pass through a vertex).', ans: 'neither — a perpendicular bisector' },
  ];
  const q = pick(rand, Q); const all = ['median', 'altitude', 'both — a median and an altitude', 'neither — a perpendicular bisector'];
  return { ask: 'Median, altitude, both, or neither?', prompt: q.prompt, choices: [q.ans, ...all.filter((s) => s !== q.ans)], answer: 0,
    tell: `a MEDIAN goes to the midpoint; an ALTITUDE goes in perpendicular. They coincide only from the vertex angle of an isosceles triangle.` };
} };

T.midsegment = { book: 'mid', make(rand) {
  const [D, E, A, B, C] = names(rand, 5);
  if (rand() < 0.5) { const ab = 2 * int(rand, 6, 45); return { ask: `Find ${D}${E}`, prompt: `${seg(D + E)} is a midsegment of △${A}${B}${C} parallel to ${seg(A + B)}, and ${A}${B} = ${ab}.`, typed: ab / 2,
    tell: `Triangle Midsegment Theorem: a midsegment is half the third side: ${ab} ÷ 2 = ${ab / 2}.` }; }
  const x = int(rand, 2, 12); const a = int(rand, 2, 7); const b = int(rand, -8, 10); const de = a * x + b; if (de < 3) return T.midsegment.make(rand);
  const c = int(rand, 2, 7); const d = 2 * de - c * x; // AB = 2·DE
  return { ask: 'Find x', prompt: `${seg(D + E)} is a midsegment of △${A}${B}${C} parallel to ${seg(A + B)}. ${D}${E} = ${sexpr(a, b)} and ${A}${B} = ${sexpr(c, d)}.`, typed: x,
    tell: `${A}${B} = 2 · ${D}${E}: ${sexpr(c, d)} = 2(${sexpr(a, b)}) → x = ${x} (${D}${E} = ${de}, ${A}${B} = ${2 * de}).` };
} };

T.midPerimeter = { book: 'mid', make(rand) {
  const p = 2 * int(rand, 10, 60);
  return rand() < 0.5
    ? { ask: 'Find the perimeter of its midsegment triangle', prompt: `The perimeter of △ABC is ${p}.`, typed: p / 2, tell: `each midsegment is half a side, so the midsegment triangle has half the perimeter: ${p / 2}.` }
    : { ask: 'Find the perimeter of △ABC', prompt: `The midsegment triangle of △ABC has perimeter ${p / 2}.`, typed: p, tell: `the midsegment triangle has HALF the perimeter, so △ABC has ${p}.` };
} };

T.midFacts = { book: 'mid', make(rand) {
  const Q = [
    { prompt: 'How is a midsegment related to the third side of the triangle?', ans: 'parallel to it and half its length', wrong: ['perpendicular to it and half its length', 'parallel to it and the same length', 'parallel to it and twice its length'] },
    { prompt: 'How many midsegments does a triangle have?', ans: '3', wrong: ['1', '2', '6'] },
    { prompt: 'On coordinates, how do you show a segment is a midsegment parallel to a side?', ans: 'find the two midpoints, then compare slopes (equal) and lengths (half)', wrong: ['find the two midpoints, then check the slopes are opposite reciprocals', 'show the segment passes through the centroid', 'show the segment is perpendicular to the side'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Midsegments', prompt: q.prompt, choices: [q.ans, ...q.wrong], answer: 0, tell: `${q.ans}.` };
} };

T.orderAngles = { book: 'ineq', make(rand) {
  const [A, B, C] = names(rand, 3);
  let s; do { s = [int(rand, 5, 30), int(rand, 5, 30), int(rand, 5, 30)]; } while (new Set(s).size < 3 || s[0] + s[1] <= s[2] || s[0] + s[2] <= s[1] || s[1] + s[2] <= s[0]);
  // AB = s[0] (opposite C), BC = s[1] (opposite A), CA = s[2] (opposite B)
  const opp = { [C]: s[0], [A]: s[1], [B]: s[2] };
  const order = Object.keys(opp).sort((p, q) => opp[p] - opp[q]);
  const text = (o) => o.map((v) => `∠${v}`).join(', ');
  const perms = [[A, B, C], [A, C, B], [B, A, C], [B, C, A], [C, A, B], [C, B, A]].map(text).filter((t) => t !== text(order));
  return { ask: 'Order the angles from smallest to largest', prompt: `In △${A}${B}${C}, ${A}${B} = ${s[0]}, ${B}${C} = ${s[1]}, and ${C}${A} = ${s[2]}.`,
    choices: [text(order), ...sample(rand, perms, 3)], answer: 0,
    tell: `bigger side ↔ bigger angle. ${order.map((v) => `∠${v} is opposite ${opp[v]}`).join('; ')}.` };
} };

T.orderSides = { book: 'ineq', make(rand) {
  const [P, Q, R] = names(rand, 3);
  let a; do { a = [int(rand, 20, 100), int(rand, 20, 100)]; a.push(180 - a[0] - a[1]); } while (a[2] < 20 || new Set(a).size < 3);
  // side opposite P is QR, opposite Q is PR, opposite R is PQ
  const opp = { [`${Q}${R}`]: a[0], [`${P}${R}`]: a[1], [`${P}${Q}`]: a[2] };
  const order = Object.keys(opp).sort((p, q) => opp[p] - opp[q]);
  const text = (o) => o.map(seg).join(', ');
  const keys = Object.keys(opp); const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((ix) => text(ix.map((i) => keys[i]))).filter((t) => t !== text(order));
  return { ask: 'Order the sides from shortest to longest', prompt: `In △${P}${Q}${R}, m∠${P} = ${a[0]}°, m∠${Q} = ${a[1]}°, and m∠${R} = ${a[2]}°.`,
    choices: [text(order), ...sample(rand, perms, 3)], answer: 0,
    tell: `bigger angle ↔ bigger side. ${order.map((k) => `${k} is opposite ${opp[k]}°`).join('; ')}.` };
} };

T.canTriangle = { book: 'ineq', make(rand) {
  const a = int(rand, 3, 15); const b = int(rand, a, 20); const ok = rand() < 0.5;
  const c = ok ? int(rand, b, a + b - 1) : int(rand, a + b, a + b + 6);
  return { ask: 'Can these be the sides of a triangle?', prompt: `${a}, ${b}, ${c}`,
    choices: [ok ? `Yes — ${a} + ${b} = ${a + b} > ${c}` : `No — ${a} + ${b} = ${a + b} is not greater than ${c}`, ok ? `No — ${a} + ${b} = ${a + b} is not greater than ${c}` : `Yes — ${a} + ${b} = ${a + b} > ${c}`, `Yes — ${b} + ${c} > ${a}, and one sum is enough`, 'No — the three sides must be equal'], answer: 0,
    tell: `Triangle Inequality Theorem: every two sides must sum to MORE than the third; checking the two smallest is enough. ${a} + ${b} = ${a + b} ${ok ? '>' : (a + b === c ? '=' : '<')} ${c}${ok ? '' : a + b === c ? ' — equal means collinear, no triangle' : ''}.` };
} };

T.thirdRange = { book: 'ineq', make(rand) {
  const a = int(rand, 3, 20); const b = int(rand, a + 1, 40);
  const r = (lo, hi) => `${lo} < x < ${hi}`;
  return { ask: 'Find the range for the third side x', prompt: `Two sides of a triangle measure ${a} and ${b}.`,
    choices: [r(b - a, a + b), r(a, b), r(b - a, b), `x < ${a + b}`], answer: 0,
    tell: `|${b} − ${a}| < x < ${b} + ${a}: the third side is more than the difference and less than the sum.` };
} };

T.indirectFirst = { book: 'ineq', make(rand) {
  const Q = [
    { claim: 'A triangle cannot have two right angles.', ans: 'Assume temporarily that a triangle CAN have two right angles.', wrong: ['Assume a triangle has exactly one right angle.', 'The angles add to 180°, so two right angles leave 0° for the third.', 'Assume a triangle cannot have two right angles.'] },
    { claim: 'A triangle cannot have two obtuse angles.', ans: 'Assume temporarily that a triangle HAS two obtuse angles.', wrong: ['Assume a triangle has no obtuse angles.', 'Two obtuse angles add to more than 180°.', 'Assume a triangle cannot have two obtuse angles.'] },
    { claim: 'In △ABC, if AB ≠ AC, then ∠C ≇ ∠B.', ans: 'Assume temporarily that ∠C ≅ ∠B.', wrong: ['Assume temporarily that AB ≠ AC.', 'Assume temporarily that AB = AC.', 'By the Converse of the Base Angles Theorem, AB = AC.'] },
    { claim: 'If x² is odd, then x is odd.', ans: 'Assume temporarily that x is even.', wrong: ['Assume temporarily that x² is even.', 'Assume temporarily that x is odd.', 'Then x² = (2k)² = 4k², which is even.'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Write the FIRST step of an indirect proof', prompt: `Prove: ${q.claim}`, choices: [q.ans, ...q.wrong], answer: 0,
    tell: `step 1 assumes the OPPOSITE of what you want to prove; then reason to a contradiction; then conclude the original statement is true.` };
} };

T.vocab = { book: 'ineq', make(rand) {
  const v = pick(rand, VOCAB); const others = sample(rand, VOCAB.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
