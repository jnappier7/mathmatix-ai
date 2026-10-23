/**
 * Chapter Review: Honors Geometry — Chapter 8 (Similarity, 8.1–8.4), built from Mr. Nappier's
 * guided notes, study sheet, Similarity Toolkit and Chapter 8 Review. Quick-fire: one move per play
 * — the scale factor (with its direction), are these similar, x across a similarity, the third
 * angle, which criterion, a parallel line's proportion, the angle bisector's ratio.
 *
 * Wrong choices are the study sheet's traps: the reciprocal scale factor, "pieces with wholes",
 * the SSA trap for similarity, AAA offered as congruence.
 */
const { int, pick, sample, frac, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 8', blurb: 'Similar polygons, the three triangle criteria, proportionality — mixed.' },
  sim: { name: 'Similar Polygons', ch: '8.1', blurb: 'Scale factor and its direction, are they similar, x across a similarity, perimeters.' },
  tri: { name: 'Triangle Similarity', ch: '8.2–8.3', blurb: 'AA, SSS~ and SAS~, the SSA trap, shadows.' },
  prop: { name: 'Proportionality', ch: '8.4', blurb: 'A parallel line divides proportionally; three parallels; the angle bisector.' },
};

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const names = (rand, n) => sample(rand, [...LETTERS], n);
const tri = (s) => `△${s}`;
const seg = (s) => `<span style="text-decoration:overline">${s}</span>`;
const ratio = (p, q) => frac(p, q);
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const PAIRS = [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6], [5, 8], [3, 8], [4, 7], [2, 7], [5, 7], [3, 7]];

const T = {};

T.scaleFactor = { book: 'sim', make(rand) {
  const [t1, t2] = [names(rand, 3).join(''), names(rand, 3).join('')]; if (t1[0] === t2[0]) return T.scaleFactor.make(rand);
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 2, 8); const ab = p * k; const de = q * k; const toSecond = rand() < 0.5;
  const ans = toSecond ? ratio(q, p) : ratio(p, q);
  return { ask: `Find the scale factor of ${tri(toSecond ? t1 : t2)} to ${tri(toSecond ? t2 : t1)}`, prompt: `${tri(t1)} ~ ${tri(t2)}, ${t1.slice(0, 2)} = ${ab}, ${t2.slice(0, 2)} = ${de}.`,
    ...mc(rand, ans, [toSecond ? ratio(p, q) : ratio(q, p), ratio(ab - de, k), String(Math.abs(ab - de)), ratio(ab, de + k)]),
    tell: `scale factor = image side ÷ original side, in THAT direction: ${toSecond ? `${de}/${ab}` : `${ab}/${de}`} = ${ans}. The other direction is the reciprocal.` };
} };

T.similarCheck = { book: 'sim', make(rand) {
  const [p, q] = pick(rand, PAIRS); const base = [int(rand, 2, 5), int(rand, 3, 7), int(rand, 4, 9), int(rand, 5, 10)].sort((a, b) => a - b);
  const A = base.map((s) => s * p); const B = base.map((s) => s * q); const similar = rand() < 0.5;
  if (!similar) B[int(rand, 0, 3)] += q; // one side off
  const prompt = `Two quadrilaterals have congruent corresponding angles. Their sides are ${A.join(', ')} and ${B.join(', ')}.`;
  const ans = similar ? `Yes — every ratio is ${ratio(p, q)}` : 'No — the side ratios are not all equal';
  return { ask: 'Similar?', prompt, ...mc(rand, ans, [similar ? 'No — the side ratios are not all equal' : `Yes — every ratio is ${ratio(p, q)}`, 'Yes — congruent angles are enough for any polygon', 'No — the perimeters differ']),
    tell: similar ? `check EVERY ratio: ${A.map((a, i) => `${a}/${B[i]}`).join(' = ')} = ${ratio(p, q)}. Angles ≅ and sides proportional → similar.` : `one ratio breaks: ${A.map((a, i) => `${a}/${B[i]}`).join(', ')} are not all equal. Angles alone are not enough for a quadrilateral.` };
} };

T.rectSimilar = { book: 'sim', make(rand) {
  const w = int(rand, 3, 12); const h = int(rand, 3, 12); const k = pick(rand, [2, 3]); const similar = rand() < 0.5;
  const W = w * k; const H = similar ? h * k : h * k + pick(rand, [1, 2, -1]);
  if (!similar && W * h === H * w) return T.rectSimilar.make(rand);
  return { ask: 'Are the rectangles similar?', prompt: `${w} × ${h} and ${W} × ${H}`,
    ...mc(rand, similar ? `Yes — ${w}/${W} = ${h}/${H}` : `No — ${w}/${W} ≠ ${h}/${H}`, [similar ? `No — ${w}/${W} ≠ ${h}/${H}` : `Yes — ${w}/${W} = ${h}/${H}`, 'Yes — all rectangles are similar', 'No — rectangles are never similar']),
    tell: `all angles are right angles, so only the side ratios decide: ${w}/${W} = ${ratio(w, W)} and ${h}/${H} = ${ratio(h, H)}. Rectangles are only SOMETIMES similar.` };
} };

T.solveSimilar = { book: 'sim', make(rand) {
  const [t1, t2] = [names(rand, 3).join(''), names(rand, 3).join('')]; if (t1[0] === t2[0]) return T.solveSimilar.make(rand);
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 2, 6); const kl = p * k; const qr = q * k; const x = int(rand, 2, 9); const c = pick(rand, [2, 3, 4, 5, 6]);
  const jk = c * x; if ((jk * q) % p) return T.solveSimilar.make(rand); const pq = (jk * q) / p;
  return { ask: 'Find x', prompt: `${tri(t1)} ~ ${tri(t2)}, ${t1.slice(0, 2)} = ${c}x, ${t2.slice(0, 2)} = ${pq}, ${t1.slice(1, 3)} = ${kl}, ${t2.slice(1, 3)} = ${qr}.`, typed: x,
    tell: `corresponding sides are proportional: ${c}x/${pq} = ${kl}/${qr} = ${ratio(p, q)} → ${c}x = ${jk} → x = ${x}.` };
} };

T.perimeter = { book: 'sim', make(rand) {
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 4, 12); const big = q * k; const small = p * k;
  if (rand() < 0.5) return { ask: 'Find the smaller perimeter', prompt: `Two similar pentagons have scale factor ${ratio(p, q)} (small to large) and the larger has perimeter ${big}.`, typed: small,
    tell: `perimeters share the scale factor: ${big} · ${ratio(p, q)} = ${small}.` };
  const [t1, t2] = [names(rand, 3).join(''), names(rand, 3).join('')]; if (t1[0] === t2[0]) return T.perimeter.make(rand);
  const s = [int(rand, 3, 6) * q, int(rand, 4, 7) * q, int(rand, 5, 8) * q]; const uv = (s[0] * p) / q;
  return { ask: `Find the perimeter of ${tri(t2)}`, prompt: `${tri(t1)} ~ ${tri(t2)}, ${t1.slice(0, 2)} = ${s[0]}, ${t1.slice(1, 3)} = ${s[1]}, ${t1[2]}${t1[0]} = ${s[2]}, ${t2.slice(0, 2)} = ${uv}.`, typed: ((s[0] + s[1] + s[2]) * p) / q,
    tell: `scale factor ${uv}/${s[0]} = ${ratio(p, q)}; the perimeter scales the same way: ${s[0] + s[1] + s[2]} · ${ratio(p, q)} = ${((s[0] + s[1] + s[2]) * p) / q}.` };
} };

T.aa = { book: 'tri', make(rand) {
  const a = int(rand, 25, 80); const b = int(rand, 25, 150 - a);
  return rand() < 0.5
    ? { ask: 'Similar? Name the criterion', prompt: `Two triangles each contain angles of ${a}° and ${b}°.`, ...mc(rand, 'Yes — AA Similarity', ['No — you need all three angles', 'No — the sides could be different lengths', 'Yes — SAS Similarity']),
      tell: `two pairs of congruent angles are enough (AA); the third pair is free by the Triangle Sum Theorem (${180 - a - b}°).` }
    : { ask: 'Find the third angle', prompt: `Two triangles each contain angles of ${a}° and ${b}°.`, typed: 180 - a - b, tell: `180 − ${a} − ${b} = ${180 - a - b}°, in both triangles — that is why AA is enough.` };
} };

T.sssSim = { book: 'tri', make(rand) {
  const [p, q] = pick(rand, PAIRS); const base = [int(rand, 2, 4), int(rand, 4, 6), int(rand, 6, 8)]; if (base[0] + base[1] <= base[2]) return T.sssSim.make(rand);
  const A = base.map((s) => s * p); const B = base.map((s) => s * q); const similar = rand() < 0.6; if (!similar) B[2] += q;
  return { ask: 'Similar? Show the ratios', prompt: `Sides ${A.join(', ')} and ${B.join(', ')}.`,
    ...mc(rand, similar ? `Yes — SSS Similarity: ${A.map((a, i) => `${a}/${B[i]}`).join(' = ')} = ${ratio(p, q)}` : `No — ${A[2]}/${B[2]} ≠ ${A[0]}/${B[0]}`, [similar ? `No — ${A[2]}/${B[2]} ≠ ${A[0]}/${B[0]}` : `Yes — SSS Similarity: all three ratios equal ${ratio(p, q)}`, 'Yes — SSS Congruence', 'No — the triangles have different perimeters']),
    tell: similar ? `all THREE side ratios are equal, so SSS Similarity.` : `two ratios match but the third does not — not similar.` };
} };

T.sasSim = { book: 'tri', make(rand) {
  const [p, q] = pick(rand, PAIRS); const a = int(rand, 2, 6); const b = int(rand, 7, 12); const ang = int(rand, 25, 110); const included = rand() < 0.6;
  const prompt = `Sides ${a * p} and ${b * p} with a ${ang}° ${included ? 'included' : 'NON-included'} angle; sides ${a * q} and ${b * q} with a ${ang}° ${included ? 'included' : 'non-included'} angle.`;
  return { ask: 'Similar? Why?', prompt,
    ...mc(rand, included ? `Yes — SAS Similarity: ${a * p}/${a * q} = ${b * p}/${b * q} = ${ratio(p, q)} and the included angles are congruent` : 'Not necessarily — proportional sides with a NON-included angle prove nothing (the SSA trap)',
      [included ? 'Not necessarily — proportional sides with a NON-included angle prove nothing (the SSA trap)' : `Yes — SAS Similarity: ${a * p}/${a * q} = ${b * p}/${b * q} = ${ratio(p, q)} and the angles are congruent`, 'Yes — SAS Congruence', 'No — the sides are different lengths']),
    tell: included ? `two proportional side pairs and the INCLUDED angle → SAS Similarity.` : `SAS Similarity needs the angle BETWEEN the two sides; a non-included angle is the SSA trap, similarity edition.` };
} };

T.parallelProp = { book: 'prop', make(rand) {
  const [A, B, C, D, E] = names(rand, 5); const [p, q] = pick(rand, PAIRS); const k = int(rand, 2, 6); const ad = p * k; const db = q * k; const m = int(rand, 2, 6); const ae = p * m; const ec = q * m;
  return { ask: `Find ${E}${C}`, prompt: `In ${tri(A + B + C)}, ${seg(D + E)} ∥ ${seg(B + C)}, ${A}${D} = ${ad}, ${D}${B} = ${db}, ${A}${E} = ${ae}.`, typed: ec,
    tell: `Triangle Proportionality Theorem, pieces with pieces: ${A}${D}/${D}${B} = ${A}${E}/${E}${C} → ${ad}/${db} = ${ae}/${E}${C} → ${E}${C} = ${ec}.` };
} };

T.shadow = { book: 'tri', make(rand) {
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 1, 3); const post = p * k; const shadow = q * k; const m = int(rand, 6, 15); const bshadow = q * m; const height = p * m;
  return { ask: "Find the building's height", prompt: `A ${post}-ft post casts a ${shadow}-ft shadow while a building casts a ${bshadow}-ft shadow at the same moment.`, typed: height,
    tell: `the sun makes the triangles similar (AA): height/height = shadow/shadow → h/${post} = ${bshadow}/${shadow} → h = ${height} ft.` };
} };

T.propConverse = { book: 'prop', make(rand) {
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 2, 5); const m = int(rand, 2, 5); const parallel = rand() < 0.5;
  const a = [p * k, q * k]; const b = parallel ? [p * m, q * m] : [p * m, q * m + m];
  return { ask: 'Is the segment parallel to the third side?', prompt: `A segment cuts two sides of a triangle into pieces ${a[0]}, ${a[1]} on one side and ${b[0]}, ${b[1]} on the other.`,
    ...mc(rand, parallel ? `Yes — ${a[0]}/${a[1]} = ${b[0]}/${b[1]}` : `No — ${a[0]}/${a[1]} ≠ ${b[0]}/${b[1]}`, [parallel ? `No — ${a[0]}/${a[1]} ≠ ${b[0]}/${b[1]}` : `Yes — ${a[0]}/${a[1]} = ${b[0]}/${b[1]}`, `Yes — ${a[0]} + ${a[1]} = ${b[0]} + ${b[1]}`, 'No — only a midsegment is parallel']),
    tell: `Converse of the Triangle Proportionality Theorem: parallel exactly when the pieces are proportional. ${a[0]}/${a[1]} = ${ratio(a[0], a[1])}, ${b[0]}/${b[1]} = ${ratio(b[0], b[1])}.` };
} };

T.threeParallel = { book: 'prop', make(rand) {
  const [p, q] = pick(rand, PAIRS); const k = int(rand, 2, 8); const m = int(rand, 2, 8); const L = [p * k, q * k]; const R = [p * m, q * m]; const hide = int(rand, 0, 1);
  return { ask: 'Find x', prompt: `Three parallel lines cut one transversal into ${L[0]} and ${L[1]}, and another into ${hide === 0 ? 'x' : R[0]} and ${hide === 1 ? 'x' : R[1]}.`, typed: R[hide],
    tell: `three parallel lines divide any two transversals proportionally: ${L[0]}/${L[1]} = ${hide === 0 ? 'x' : R[0]}/${hide === 1 ? 'x' : R[1]} → x = ${R[hide]}.` };
} };

T.angleBisector = { book: 'prop', make(rand) {
  const [A, B, C, D] = names(rand, 4); const [p, q] = pick(rand, PAIRS); const k = int(rand, 3, 11); const ab = p * k; const bc = q * k; const m = int(rand, 2, 6); const ad = p * m; const dc = q * m;
  return { ask: `Find ${A}${D}`, prompt: `In ${tri(A + B + C)}, ${seg(B + D)} bisects ∠${B}, ${A}${B} = ${ab}, ${B}${C} = ${bc}, and ${A}${C} = ${ad + dc}.`, typed: ad,
    tell: `an angle bisector splits the opposite side in the ratio of the adjacent sides, ${ab} : ${bc} = ${p} : ${q}. Pieces ${p}k and ${q}k with ${p + q}k = ${ad + dc} → k = ${m}: ${A}${D} = ${ad}, ${D}${C} = ${dc}.` };
} };

T.drawingScale = { book: 'sim', make(rand) {
  const s = pick(rand, [20, 30, 40, 48, 60, 72, 96, 120]); const inches = int(rand, 4, 15); const feet = (inches * s) / 12; if (!Number.isInteger(feet)) return T.drawingScale.make(rand);
  return { ask: 'How long is the drawing, in inches?', prompt: `A drawing of a ${feet}-ft sailboat uses scale factor 1/${s}.`, typed: inches,
    tell: `${feet} ft = ${feet * 12} in., and ${feet * 12} ÷ ${s} = ${inches} in.` };
} };

T.criterion = { book: 'tri', make(rand) {
  const Q = [
    { have: 'two pairs of congruent angles', ans: 'AA Similarity' },
    { have: 'all three pairs of sides in the same ratio', ans: 'SSS Similarity' },
    { have: 'two pairs of sides in the same ratio and the INCLUDED angles congruent', ans: 'SAS Similarity' },
    { have: 'two pairs of sides in the same ratio and a NON-included pair of congruent angles', ans: 'NONE — the SSA trap' },
    { have: 'one pair of congruent angles only', ans: 'NONE — one angle is not enough' },
    { have: 'two sides of one triangle parallel to two sides of another (a transversal between)', ans: 'AA Similarity' },
  ];
  const q = pick(rand, Q); const all = ['AA Similarity', 'SSS Similarity', 'SAS Similarity', 'NONE — the SSA trap', 'NONE — one angle is not enough'];
  return { ask: 'Which similarity criterion?', prompt: `Two triangles have ${q.have}.`, ...mc(rand, q.ans, all), tell: `${q.ans}.` };
} };

T.facts = { book: 'sim', make(rand) {
  const Q = [
    { q: 'Why is there an AA similarity but no AAA congruence?', ans: 'Angles fix the SHAPE but not the SIZE — similar triangles can be scaled copies', wrong: ['Three angles always force the side lengths too', 'AAA congruence exists; it is just rarely used', 'Because similar triangles have congruent sides'] },
    { q: 'Which figures are ALWAYS similar?', ans: 'any two squares; any two equilateral triangles', wrong: ['any two rectangles', 'any two isosceles triangles', 'any two right triangles'] },
    { q: 'What two "free ratio" facts come with every pair of similar polygons?', ans: 'corresponding sides share the scale factor, and so do the perimeters', wrong: ['the areas and the angles share the scale factor', 'the perimeters are equal and the sides proportional', 'the angles are proportional and the sides congruent'] },
    { q: 'In the Triangle Proportionality Theorem, which ratios may you set equal?', ans: 'pieces with pieces, or wholes with wholes — never one of each', wrong: ['a piece with the whole on the same side', 'any two segments in the figure', 'only the two whole sides'] },
    { q: 'The scale factor of A to B is 3/5. What is the scale factor of B to A?', ans: '5/3 — the reciprocal', wrong: ['3/5 — it is the same both ways', '2/5', '−3/5'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Similarity facts', prompt: q.q, choices: [q.ans, ...q.wrong], answer: 0, tell: `${q.ans}.` };
} };

module.exports = makeBank(BOOKS, T);
