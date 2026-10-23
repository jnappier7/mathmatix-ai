/**
 * Chapter Review: Honors Geometry — Chapter 7 (Quadrilaterals and Other Polygons, 7.1–7.5), built
 * from Mr. Nappier's guided notes, study sheet and Chapter 7 Review. Quick-fire: one move per
 * play — an angle sum, x from a parallelogram's parts, which condition proves it, the rhombus's
 * diagonals, a trapezoid's midsegment, a kite's missing angles.
 *
 * Wrong choices are the study sheet's traps: "one pair parallel and the OTHER pair congruent" as a
 * parallelogram condition, a rectangle's diagonals as perpendicular, consecutive angles as congruent.
 */
const { num, int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 7', blurb: 'Polygon angles, parallelograms and their conditions, the special ones, trapezoids and kites — mixed.' },
  poly: { name: 'Angles of Polygons', ch: '7.1', blurb: 'Interior sums, regular polygons, exterior angles, the missing angle.' },
  para: { name: 'Parallelograms', ch: '7.2–7.3', blurb: 'Opposite sides and angles, the diagonals, the fourth vertex, which condition proves it.' },
  special: { name: 'Rectangle · Rhombus · Square', ch: '7.4', blurb: 'Which diagonals are congruent, perpendicular, bisect the angles; always / sometimes / never.' },
  trap: { name: 'Trapezoids & Kites', ch: '7.5', blurb: 'Base angles, legs, the midsegment, a kite\'s angles.' },
};

const sexpr = (a, b) => `${a === 1 ? '' : a}x${b === 0 ? '' : b < 0 ? ` − ${-b}` : ` + ${b}`}`;
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const names = (rand, n) => sample(rand, [...LETTERS], n);
const seg = (s) => `<span style="text-decoration:overline">${s}</span>`;
const POLY = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
const polyName = (n) => POLY[n] || `${n}-gon`;
/** Two linear expressions in x equal at x0 with a value in [lo, hi]. */
function equalPair(rand, x0, lo, hi) {
  for (;;) {
    const a = int(rand, 2, 9); let c = int(rand, 2, 9); while (c === a) c = int(rand, 2, 9);
    const b = int(rand, -20, 25); const v = a * x0 + b; const d = v - c * x0;
    if (v >= lo && v <= hi) return { a, b, c, d, v };
  }
}

const PROPS = [
  { q: 'Which quadrilaterals ALWAYS have congruent diagonals?', ans: 'rectangle, square, isosceles trapezoid', wrong: ['rhombus, square', 'every parallelogram', 'kite, rhombus'] },
  { q: 'Which quadrilaterals ALWAYS have perpendicular diagonals?', ans: 'rhombus, square, kite', wrong: ['rectangle, square', 'every parallelogram', 'isosceles trapezoid, kite'] },
  { q: 'In which quadrilaterals do the diagonals ALWAYS bisect each other?', ans: 'every parallelogram (including rectangle, rhombus, square)', wrong: ['rectangle and square only', 'kite and rhombus', 'every trapezoid'] },
  { q: 'Which quadrilaterals\' diagonals bisect the corner angles?', ans: 'rhombus, square', wrong: ['rectangle, square', 'every parallelogram', 'isosceles trapezoid'] },
  { q: 'Which figure has exactly ONE pair of parallel sides?', ans: 'trapezoid', wrong: ['parallelogram', 'kite', 'rhombus'] },
  { q: 'Which figure has exactly one pair of congruent OPPOSITE angles (between its non-congruent sides)?', ans: 'kite', wrong: ['rhombus', 'isosceles trapezoid', 'rectangle'] },
];
const ASN = [
  { s: 'A rectangle is a rhombus.', ans: 'sometimes', why: 'only when it is a square' },
  { s: 'A square is a rectangle.', ans: 'always', why: 'a square has four right angles' },
  { s: 'A square is a rhombus.', ans: 'always', why: 'a square has four congruent sides' },
  { s: 'A rhombus is a square.', ans: 'sometimes', why: 'only when its angles are right angles' },
  { s: 'A parallelogram is a trapezoid.', ans: 'never', why: 'a trapezoid has exactly ONE pair of parallel sides' },
  { s: 'A rectangle is a parallelogram.', ans: 'always', why: 'two pairs of parallel sides' },
  { s: 'The diagonals of a parallelogram are congruent.', ans: 'sometimes', why: 'only when it is a rectangle (or square)' },
  { s: 'The diagonals of a rhombus are perpendicular.', ans: 'always', why: 'that is a rhombus property' },
  { s: 'A kite is a parallelogram.', ans: 'never', why: 'a kite\'s congruent sides are adjacent, not opposite' },
  { s: 'The diagonals of a kite bisect each other.', ans: 'never', why: 'only one diagonal is bisected' },
];
const CONDITIONS = [
  { have: 'both pairs of opposite sides are congruent', ok: true, name: 'Opposite Sides Converse' },
  { have: 'both pairs of opposite angles are congruent', ok: true, name: 'Opposite Angles Converse' },
  { have: 'one pair of opposite sides is both parallel AND congruent', ok: true, name: 'Opposite Sides Parallel and Congruent Theorem' },
  { have: 'the diagonals bisect each other', ok: true, name: 'Diagonals Converse' },
  { have: 'both pairs of opposite sides are parallel', ok: true, name: 'the definition of a parallelogram' },
  { have: 'one pair of opposite sides is parallel and the OTHER pair is congruent', ok: false, why: 'an isosceles trapezoid has exactly that' },
  { have: 'the diagonals are congruent', ok: false, why: 'an isosceles trapezoid has congruent diagonals too' },
  { have: 'one pair of opposite angles is congruent', ok: false, why: 'a kite has one congruent pair of opposite angles' },
  { have: 'the diagonals are perpendicular', ok: false, why: 'a kite has perpendicular diagonals' },
];
const VOCAB = [
  { term: 'regular polygon', def: 'a polygon that is both equilateral and equiangular' },
  { term: 'convex polygon', def: 'a polygon in which no diagonal lies outside it — every interior angle is less than 180°' },
  { term: 'parallelogram', def: 'a quadrilateral with both pairs of opposite sides parallel' },
  { term: 'rectangle', def: 'a parallelogram with four right angles' },
  { term: 'rhombus', def: 'a parallelogram with four congruent sides' },
  { term: 'square', def: 'a parallelogram with four right angles and four congruent sides' },
  { term: 'trapezoid', def: 'a quadrilateral with exactly one pair of parallel sides' },
  { term: 'isosceles trapezoid', def: 'a trapezoid whose legs are congruent — base angles and diagonals congruent too' },
  { term: 'midsegment of a trapezoid', def: 'the segment joining the midpoints of the legs — parallel to the bases and half their sum' },
  { term: 'kite', def: 'a quadrilateral with two pairs of congruent consecutive sides and no opposite sides congruent' },
];

const T = {};

T.interiorSum = { book: 'poly', make(rand) {
  const n = pick(rand, [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17, 20]);
  return { ask: 'Find the sum of the interior angle measures', prompt: `of a convex ${polyName(n)}`, typed: (n - 2) * 180,
    tell: `(n − 2) · 180° with n = ${n}: ${n - 2} · 180 = ${(n - 2) * 180}°.` };
} };

T.regularAngle = { book: 'poly', make(rand) {
  const n = pick(rand, [3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20]); const ext = rand() < 0.5;
  if (ext) return { ask: 'Find each exterior angle', prompt: `of a regular ${polyName(n)}`, typed: 360 / n, tell: `exterior angles always total 360°, so each is 360 ÷ ${n} = ${360 / n}°.` };
  return { ask: 'Find each interior angle', prompt: `of a regular ${polyName(n)}`, typed: ((n - 2) * 180) / n, tell: `(n − 2) · 180 ÷ n = ${(n - 2) * 180} ÷ ${n} = ${((n - 2) * 180) / n}° (or 180 − ${360 / n}).` };
} };

T.sidesFrom = { book: 'poly', make(rand) {
  if (rand() < 0.5) { const e = pick(rand, [10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60, 72, 90, 120]);
    return { ask: 'How many sides?', prompt: `Each exterior angle of a regular polygon measures ${e}°.`, typed: 360 / e, tell: `360 ÷ ${e} = ${360 / e} sides.` }; }
  const n = int(rand, 5, 20);
  return { ask: 'How many sides?', prompt: `The interior angles of a convex polygon total ${(n - 2) * 180}°.`, typed: n, tell: `(n − 2) · 180 = ${(n - 2) * 180} → n − 2 = ${n - 2} → n = ${n}.` };
} };

T.missingAngle = { book: 'poly', make(rand) {
  const n = pick(rand, [4, 5, 6, 7]); const total = (n - 2) * 180; const avg = total / n;
  const known = []; let left = total;
  for (let i = 0; i < n - 1; i++) { const v = Math.round(avg + int(rand, -25, 25)); known.push(v); left -= v; }
  if (left < 40 || left > 175) return T.missingAngle.make(rand);
  return { ask: `Find the ${['', '', '', '', 'fourth', 'fifth', 'sixth', 'seventh'][n]} angle`, prompt: `${n - 1 === 3 ? 'Three' : n - 1 === 4 ? 'Four' : n - 1 === 5 ? 'Five' : 'Six'} angles of a convex ${polyName(n)} measure ${known.map((v) => `${v}°`).join(', ')}.`, typed: left,
    tell: `the ${polyName(n)}'s angles total (${n} − 2) · 180 = ${total}°; ${total} − (${known.join(' + ')}) = ${left}°.` };
} };

T.paraSides = { book: 'para', make(rand) {
  const [A, B, C, D] = names(rand, 4); const x = int(rand, 3, 15); const e = equalPair(rand, x, 5, 80);
  return { ask: 'Find x', prompt: `In ▱${A}${B}${C}${D}, ${A}${B} = ${sexpr(e.a, e.b)} and ${C}${D} = ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `opposite sides of a parallelogram are congruent: ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x} (each is ${e.v}).` };
} };

T.paraAngles = { book: 'para', make(rand) {
  const [A, B, C, D] = names(rand, 4); const a = int(rand, 35, 145); const opp = rand() < 0.5;
  if (opp) return { ask: `Find m∠${C}`, prompt: `In ▱${A}${B}${C}${D}, m∠${A} = ${a}°.`, typed: a, tell: `opposite angles of a parallelogram are congruent: m∠${C} = m∠${A} = ${a}°.` };
  return { ask: `Find m∠${B}`, prompt: `In ▱${A}${B}${C}${D}, m∠${A} = ${a}°.`, typed: 180 - a, tell: `consecutive angles are supplementary: 180 − ${a} = ${180 - a}°.` };
} };

T.paraDiagonals = { book: 'para', make(rand) {
  const [J, K, L, M, N] = names(rand, 5); const x = int(rand, 3, 15); const e = equalPair(rand, x, 5, 60);
  if (rand() < 0.5) return { ask: 'Find x', prompt: `The diagonals of ▱${J}${K}${L}${M} meet at ${N}. ${J}${N} = ${sexpr(e.a, e.b)} and ${N}${L} = ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `the diagonals of a parallelogram bisect each other, so ${J}${N} = ${N}${L}: ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}.` };
  return { ask: `Find ${J}${L}`, prompt: `The diagonals of ▱${J}${K}${L}${M} meet at ${N}, and ${J}${N} = ${e.v}.`, typed: 2 * e.v, tell: `${N} is the midpoint of ${seg(J + L)}, so ${J}${L} = 2 · ${e.v} = ${2 * e.v}.` };
} };

T.fourthVertex = { book: 'para', make(rand) {
  const [W, X, Y, Z] = names(rand, 4);
  const Wp = [int(rand, -6, 6), int(rand, -6, 6)]; const Xp = [Wp[0] + int(rand, 1, 6), Wp[1] + int(rand, -5, 6)]; const Zp = [Wp[0] + int(rand, 1, 7), Wp[1] + int(rand, -6, -1)];
  const Yp = [Xp[0] + Zp[0] - Wp[0], Xp[1] + Zp[1] - Wp[1]];
  const wrong = [[Xp[0] + Zp[0], Xp[1] + Zp[1]], [Zp[0] + Wp[0] - Xp[0], Zp[1] + Wp[1] - Xp[1]], [Xp[0] + Wp[0] - Zp[0], Xp[1] + Wp[1] - Zp[1]]].map(([x, y]) => pt(x, y)).filter((s) => s !== pt(...Yp));
  return { ask: `Find ${Y}`, prompt: `Three vertices of ▱${W}${X}${Y}${Z} are ${W}${pt(...Wp)}, ${X}${pt(...Xp)}, and ${Z}${pt(...Zp)}.`,
    choices: [pt(...Yp), ...[...new Set(wrong)].slice(0, 3)], answer: 0,
    tell: `the fourth vertex is ${Y} = ${X} + (${Z} − ${W}) = ${pt(...Yp)} — check: both diagonals ${seg(W + Y)} and ${seg(X + Z)} have the same midpoint.` };
} };

T.condition = { book: 'para', make(rand) {
  const c = pick(rand, CONDITIONS);
  if (c.ok) return { ask: 'Is this enough to prove a parallelogram? Name the condition', prompt: `In a quadrilateral, ${c.have}.`,
    choices: [`Yes — ${c.name}`, 'No — an isosceles trapezoid has that too', 'No — you also need the diagonals congruent', `No — ${c.have.includes('diagonals') ? 'the diagonals must also be congruent' : 'you need all four sides congruent'}`], answer: 0,
    tell: `${c.name}: ${c.have} ⟹ parallelogram.` };
  return { ask: 'Is this enough to prove a parallelogram?', prompt: `In a quadrilateral, ${c.have}.`,
    choices: [`No — ${c.why}`, 'Yes — Opposite Sides Parallel and Congruent Theorem', 'Yes — Diagonals Converse', 'Yes — by the definition of a parallelogram'], answer: 0,
    tell: `not enough: ${c.why}. The five conditions are both pairs of opposite sides parallel, both pairs ≅, both pairs of opposite angles ≅, ONE pair parallel AND ≅, or diagonals that bisect each other.` };
} };

T.conditionSolve = { book: 'para', make(rand) {
  const t = int(rand, 3, 15); const e = equalPair(rand, t, 5, 90);
  return { ask: 'Find t so the figure must be a parallelogram', prompt: `One pair of opposite sides of a quadrilateral measures ${sexpr(e.a, e.b).replace(/x/g, 't')} and ${sexpr(e.c, e.d).replace(/x/g, 't')}, and those sides are parallel.`, typed: t,
    tell: `one pair parallel AND congruent is enough: ${sexpr(e.a, e.b).replace(/x/g, 't')} = ${sexpr(e.c, e.d).replace(/x/g, 't')} → t = ${t}.` };
} };

T.rhombusAngles = { book: 'special', make(rand) {
  const [P, Q, R, S, Tt] = names(rand, 5); const a = int(rand, 20, 70); const kind = pick(rand, ['whole', 'meet', 'next']);
  const prompt = `In rhombus ${P}${Q}${R}${S} the diagonals meet at ${Tt} and m∠${Q}${P}${R} = ${a}°.`;
  if (kind === 'whole') return { ask: `Find m∠${Q}${P}${S}`, prompt, typed: 2 * a, tell: `a rhombus's diagonal bisects the corner angle, so m∠${Q}${P}${S} = 2 · ${a} = ${2 * a}°.` };
  if (kind === 'meet') return { ask: `Find m∠${P}${Tt}${Q}`, prompt, typed: 90, tell: `the diagonals of a rhombus are perpendicular: 90°.` };
  return { ask: `Find m∠${P}${Q}${R}`, prompt, typed: 180 - 2 * a, tell: `m∠${Q}${P}${S} = ${2 * a}° and consecutive angles are supplementary: 180 − ${2 * a} = ${180 - 2 * a}°.` };
} };

T.rectDiagonals = { book: 'special', make(rand) {
  const [A, B, C, D, E] = names(rand, 5); const x = int(rand, 3, 15); const e = equalPair(rand, x, 10, 90);
  if (rand() < 0.5) return { ask: 'Find x', prompt: `In rectangle ${A}${B}${C}${D} the diagonals meet at ${E}. ${A}${C} = ${sexpr(e.a, e.b)} and ${B}${D} = ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `a rectangle's diagonals are CONGRUENT: ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x}.` };
  const ac = 2 * int(rand, 5, 45);
  return { ask: `Find ${A}${E}`, prompt: `In rectangle ${A}${B}${C}${D} the diagonals meet at ${E}, and ${A}${C} = ${ac}.`, typed: ac / 2, tell: `the diagonals bisect each other (it is a parallelogram), so ${A}${E} = ${ac} ÷ 2 = ${ac / 2}.` };
} };

T.squareDiagonals = { book: 'special', make(rand) {
  const [J, K, L, M, X] = names(rand, 5); const jx = int(rand, 3, 12); const kind = pick(rand, ['diag', 'meet', 'half', 'side']);
  const prompt = `In square ${J}${K}${L}${M} the diagonals meet at ${X} and ${J}${X} = ${jx}.`;
  if (kind === 'diag') return { ask: `Find ${J}${L}`, prompt, typed: 2 * jx, tell: `the diagonals bisect each other: ${J}${L} = 2 · ${jx} = ${2 * jx}.` };
  if (kind === 'meet') return { ask: `Find m∠${J}${X}${K}`, prompt, typed: 90, tell: `a square is a rhombus, so its diagonals are perpendicular: 90°.` };
  if (kind === 'half') return { ask: `Find m∠${K}${J}${L}`, prompt, typed: 45, tell: `the diagonal bisects the 90° corner: 45°.` };
  return { ask: `Find ${J}${K} (exact)`, prompt, choices: [`${jx}√2`, `${2 * jx}√2`, `${jx}`, `${2 * jx}`], answer: 0,
    tell: `△${J}${X}${K} is a 45-45-90 triangle with legs ${jx}, so the hypotenuse ${J}${K} = ${jx}√2 (diagonal = side · √2 ⟹ side = ${2 * jx}/√2 = ${jx}√2).` };
} };

T.alwaysSometimesNever = { book: 'special', make(rand) {
  const q = pick(rand, ASN);
  return { ask: 'Always, sometimes, or never?', prompt: q.s, choices: [q.ans, ...['always', 'sometimes', 'never'].filter((s) => s !== q.ans)], answer: 0, tell: `${q.ans} — ${q.why}.` };
} };

T.diagonalProps = { book: 'special', make(rand) {
  const q = pick(rand, PROPS);
  return { ask: 'Properties', prompt: q.q, choices: [q.ans, ...q.wrong], answer: 0, tell: `${q.ans}.` };
} };

T.kiteAngles = { book: 'trap', make(rand) {
  const [A, B, C, D] = names(rand, 4); const a = int(rand, 30, 110); let c = int(rand, 30, 150); while (a + c >= 300 || a === c) c = int(rand, 30, 150);
  const b = (360 - a - c) / 2; if (!Number.isInteger(b)) return T.kiteAngles.make(rand);
  return { ask: `Find m∠${B}`, prompt: `In kite ${A}${B}${C}${D}, ${seg(A + B)} ≅ ${seg(A + D)} and ${seg(C + B)} ≅ ${seg(C + D)}, m∠${A} = ${a}°, and m∠${C} = ${c}°.`, typed: b,
    tell: `the angles between the NON-congruent sides (∠${B} and ∠${D}) are the congruent pair: (360 − ${a} − ${c}) ÷ 2 = ${b}°.` };
} };

T.isoTrapLegs = { book: 'trap', make(rand) {
  const x = int(rand, 3, 15); const e = equalPair(rand, x, 5, 90);
  return { ask: 'Find x', prompt: `The legs of an isosceles trapezoid measure ${sexpr(e.a, e.b)} and ${sexpr(e.c, e.d)}.`, typed: x,
    tell: `an isosceles trapezoid's legs are congruent: ${sexpr(e.a, e.b)} = ${sexpr(e.c, e.d)} → x = ${x} (each leg is ${e.v}).` };
} };

T.trapMidsegment = { book: 'trap', make(rand) {
  const kind = pick(rand, ['mid', 'base', 'alg']);
  if (kind === 'mid') { const b1 = int(rand, 10, 60); let b2 = int(rand, 10, 60); while ((b1 + b2) % 2 || b2 === b1) b2 = int(rand, 10, 60);
    return { ask: 'Find the midsegment', prompt: `A trapezoid has bases ${b1} and ${b2}.`, typed: (b1 + b2) / 2, tell: `the midsegment is half the sum of the bases: (${b1} + ${b2}) ÷ 2 = ${(b1 + b2) / 2}.` }; }
  if (kind === 'base') { const m = int(rand, 15, 50); const b1 = int(rand, 5, 2 * m - 5);
    return { ask: 'Find the other base', prompt: `A trapezoid's midsegment is ${m} and one base is ${b1}.`, typed: 2 * m - b1, tell: `midsegment = ½(b₁ + b₂): ${b1} + b₂ = 2 · ${m} = ${2 * m} → b₂ = ${2 * m - b1}.` }; }
  const x = int(rand, 3, 12); const a = int(rand, 5, 14); const b = int(rand, -12, 12); const c = int(rand, 3, 12); const d = int(rand, -9, 15);
  const sum = (a + c) * x + b + d; if (sum % 2 || a * x + b < 5 || c * x + d < 5) return T.trapMidsegment.make(rand);
  return { ask: 'Find x', prompt: `The bases of a trapezoid measure ${sexpr(a, b)} and ${sexpr(c, d)}, and the midsegment measures ${sum / 2}.`, typed: x,
    tell: `½(b₁ + b₂) = ${sum / 2} → (${sexpr(a, b)}) + (${sexpr(c, d)}) = ${sum} → ${a + c}x${b + d === 0 ? '' : b + d < 0 ? ` − ${-(b + d)}` : ` + ${b + d}`} = ${sum} → x = ${x}.` };
} };

T.isoTrapAngles = { book: 'trap', make(rand) {
  const [P, Q, R, S] = names(rand, 4); const a = int(rand, 40, 85); const which = pick(rand, ['Q', 'S', 'R']);
  const prompt = `In isosceles trapezoid ${P}${Q}${R}${S}, ${seg(P + Q)} ∥ ${seg(S + R)} and m∠${P} = ${a}°.`;
  if (which === 'Q') return { ask: `Find m∠${Q}`, prompt, typed: a, tell: `base angles of an isosceles trapezoid are congruent: m∠${Q} = ${a}°.` };
  return { ask: `Find m∠${which === 'S' ? S : R}`, prompt, typed: 180 - a, tell: `leg angles are co-interior (the bases are parallel), so they add to 180°: 180 − ${a} = ${180 - a}°; and the other pair of base angles is congruent.` };
} };

T.vocab = { book: 'trap', make(rand) {
  const v = pick(rand, VOCAB); const others = sample(rand, VOCAB.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
