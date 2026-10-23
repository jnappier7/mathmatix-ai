/**
 * Chapter Review: Honors Geometry — Chapter 5 (Congruent Triangles, 5.1–5.5), built from Mr.
 * Nappier's guided notes, study sheet, Congruence Criteria Decision Guide and Chapter 5 Review.
 * Quick-fire: one move per play — the third angle, x from the angle expressions, the criterion
 * for a marked set of parts, which part corresponds, the reason for one proof step.
 *
 * The proofs are the notes' own (SAS with parallel sides, AAS with an angle bisector, a CPCTC
 * proof); each play blanks one reason. Wrong choices are the study sheet's traps: SSA and AAA,
 * CPCTC used before the triangles are congruent, the exterior angle as a difference.
 */
const { num, int, pick, sample, shuffle, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 5', blurb: 'Angles of triangles, congruent polygons, the criteria, isosceles triangles, CPCTC — mixed.' },
  angles: { name: 'Angles of Triangles', ch: '5.1', blurb: 'Triangle Sum, Exterior Angle, the right-triangle corollary, Third Angles, classifying.' },
  congr: { name: 'Congruent Polygons', ch: '5.2', blurb: 'Corresponding parts from the statement, solve for x, the three properties.' },
  crit: { name: 'SSS · SAS · ASA · AAS · HL', ch: '5.3', blurb: 'Name the criterion — or NONE. The free parts. The two impostors.' },
  iso: { name: 'Isosceles & Equilateral', ch: '5.4', blurb: 'Base angles, vertex angle, legs, the 60° corollary.' },
  cpctc: { name: 'Proofs & CPCTC', ch: '5.3–5.5', blurb: 'The reason for a proof step; what CPCTC gives you and when.' },
};

const deg = (n) => `${num(n)}°`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const expr = (a, b) => `(${a === 1 ? '' : a}x${b === 0 ? '' : b < 0 ? ` − ${-b}` : ` + ${b}`})°`;
const sexpr = (a, b) => `${a === 1 ? '' : a}x${b === 0 ? '' : b < 0 ? ` − ${-b}` : ` + ${b}`}`;
const tri = (s) => `△${s}`;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Two disjoint triples of vertex names, e.g. ABC and DEF. */
function names(rand) {
  const six = sample(rand, [...LETTERS], 6);
  return [six.slice(0, 3).join(''), six.slice(3).join('')];
}
const sideOf = (t, i) => t[i] + t[(i + 1) % 3]; // side i joins vertex i and the next
const angleOf = (t, i) => `∠${t[i]}`;
const seg = (s) => `<span style="text-decoration:overline">${s}</span>`;

// ---------------------------------------------------------------- reasons for proofs

const R = {
  GIVEN: 'Given',
  REFL: 'Reflexive Property of Congruence',
  AIA: 'Alternate Interior Angles Theorem',
  VAT: 'Vertical Angles Theorem',
  BIS: 'Definition of angle bisector',
  MID: 'Definition of midpoint',
  SEGBIS: 'Definition of segment bisector',
  SSS: 'SSS Congruence Theorem', SAS: 'SAS Congruence Theorem', ASA: 'ASA Congruence Theorem', AAS: 'AAS Congruence Theorem', HL: 'HL Congruence Theorem',
  CPCTC: 'CPCTC',
  BASE: 'Base Angles Theorem',
  CONV: 'Converse of the Base Angles Theorem',
  TSUM: 'Triangle Sum Theorem',
  EXT: 'Exterior Angle Theorem',
  THIRD: 'Third Angles Theorem',
};
const ALL_R = Object.values(R);
const PROOFS = [
  { ask: 'Justify the step', given: `Given: ${seg('BC')} ∥ ${seg('AD')}, ${seg('BC')} ≅ ${seg('AD')}.&nbsp; Prove: △ABD ≅ △CDB`,
    rows: [[`${seg('BC')} ∥ ${seg('AD')}`, R.GIVEN], [`${seg('BC')} ≅ ${seg('AD')}`, R.GIVEN], ['∠CBD ≅ ∠ADB', R.AIA], [`${seg('BD')} ≅ ${seg('BD')}`, R.REFL], ['△ABD ≅ △CDB', R.SAS]] },
  { ask: 'Justify the step', given: `Given: ${seg('JL')} bisects ∠KLM; ∠K ≅ ∠M.&nbsp; Prove: △JKL ≅ △JML`,
    rows: [[`${seg('JL')} bisects ∠KLM`, R.GIVEN], ['∠KLJ ≅ ∠MLJ', R.BIS], ['∠K ≅ ∠M', R.GIVEN], [`${seg('JL')} ≅ ${seg('JL')}`, R.REFL], ['△JKL ≅ △JML', R.AAS]] },
  { ask: 'Justify the step', given: `Given: ${seg('QP')} bisects ∠RQS; ${seg('QR')} ≅ ${seg('QS')}.&nbsp; Prove: △RQP ≅ △SQP`,
    rows: [[`${seg('QP')} bisects ∠RQS`, R.GIVEN], ['∠RQP ≅ ∠SQP', R.BIS], [`${seg('QR')} ≅ ${seg('QS')}`, R.GIVEN], [`${seg('QP')} ≅ ${seg('QP')}`, R.REFL], ['△RQP ≅ △SQP', R.SAS]] },
  { ask: 'Justify the step', given: `Given: ${seg('YW')} bisects ${seg('XZ')}; ${seg('XY')} ≅ ${seg('YZ')}.&nbsp; Prove: ∠X ≅ ∠Z`,
    rows: [[`${seg('YW')} bisects ${seg('XZ')}`, R.GIVEN], [`${seg('XW')} ≅ ${seg('WZ')}`, R.SEGBIS], [`${seg('XY')} ≅ ${seg('YZ')}`, R.GIVEN], [`${seg('YW')} ≅ ${seg('YW')}`, R.REFL], ['△XYW ≅ △ZYW', R.SSS], ['∠X ≅ ∠Z', R.CPCTC]] },
  { ask: 'Justify the step', given: `Given: ${seg('AC')} ≅ ${seg('CD')}, ${seg('BC')} ≅ ${seg('CE')} (the segments cross at C).&nbsp; Prove: ${seg('AB')} ≅ ${seg('DE')}`,
    rows: [[`${seg('AC')} ≅ ${seg('CD')}`, R.GIVEN], [`${seg('BC')} ≅ ${seg('CE')}`, R.GIVEN], ['∠ACB ≅ ∠DCE', R.VAT], ['△ACB ≅ △DCE', R.SAS], [`${seg('AB')} ≅ ${seg('DE')}`, R.CPCTC]] },
];

// ---------------------------------------------------------------- the decision guide

const SORT = [
  { text: 'Three pairs of congruent sides.', ans: 'SSS' },
  { text: 'Two pairs of congruent sides and the pair of congruent angles between them.', ans: 'SAS' },
  { text: 'Two pairs of congruent angles and the pair of congruent sides between them.', ans: 'ASA' },
  { text: 'Two pairs of congruent angles and a pair of congruent sides not between them.', ans: 'AAS' },
  { text: 'Two pairs of congruent sides and a pair of congruent angles not between them.', ans: 'NONE', why: 'that is SSA — the second side can swing to two positions' },
  { text: 'All three pairs of congruent angles.', ans: 'NONE', why: 'that is AAA — same shape, possibly a different size' },
  { text: 'Two right triangles with congruent hypotenuses and one pair of congruent legs.', ans: 'HL' },
  { text: 'Two right triangles with one pair of congruent legs and one pair of congruent acute angles.', ans: 'ASA or AAS', why: 'the right angles are a free congruent pair, so you have two angles and a side' },
  { text: 'Two triangles share a side; one other pair of sides and the pair of angles between them are congruent.', ans: 'SAS', why: 'the shared side is congruent to itself (Reflexive)' },
  { text: 'Two segments bisect each other, forming two triangles.', ans: 'SAS', why: 'the bisected segments give two pairs of sides and the vertical angles are the included pair' },
  { text: 'A triangle is isosceles and an angle bisector is drawn from the vertex angle.', ans: 'SAS', why: 'congruent legs, the bisected angle, and the shared bisector' },
  { text: 'Two pairs of congruent angles only.', ans: 'NONE', why: 'you need three pairs, and a side among them' },
];
const CRIT = ['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'NONE'];

const FREE = [
  { have: 'two triangles share a side', get: 'that side is congruent to itself', reason: R.REFL },
  { have: 'two segments cross, forming two triangles', get: 'the angles at the crossing are congruent', reason: R.VAT },
  { have: 'a ray bisects an angle', get: 'the two halves are congruent angles', reason: R.BIS },
  { have: 'a point is the midpoint of a segment', get: 'the two halves are congruent segments', reason: R.MID },
  { have: 'two sides of the triangles are parallel, cut by a shared transversal', get: 'the alternate interior angles are congruent', reason: R.AIA },
  { have: 'a triangle is isosceles', get: 'its base angles are congruent', reason: R.BASE },
];

const VOCAB = [
  { term: 'exterior angle', def: 'an angle that forms a linear pair with an interior angle of the triangle' },
  { term: 'remote interior angles', def: 'the two interior angles that are not adjacent to a given exterior angle' },
  { term: 'corollary', def: 'a theorem that follows directly from another theorem' },
  { term: 'equiangular triangle', def: 'a triangle whose three angles are all congruent — each measures 60°' },
  { term: 'corresponding parts', def: 'the sides and angles that match up in two congruent figures' },
  { term: 'congruence statement', def: 'a statement like △ABC ≅ △DEF whose letter ORDER tells which parts correspond' },
  { term: 'included angle', def: 'the angle between two given sides of a triangle' },
  { term: 'included side', def: 'the side between two given angles of a triangle' },
  { term: 'hypotenuse', def: 'the side of a right triangle opposite the right angle' },
  { term: 'legs (of an isosceles triangle)', def: 'the two congruent sides' },
  { term: 'vertex angle', def: 'the angle between the two legs of an isosceles triangle' },
  { term: 'base angles', def: 'the two angles opposite the legs of an isosceles triangle — always congruent' },
  { term: 'CPCTC', def: 'Corresponding Parts of Congruent Triangles are Congruent' },
];

const PROPS = [
  { name: 'Reflexive Property of Triangle Congruence', ex: (a) => `${tri(a)} ≅ ${tri(a)}` },
  { name: 'Symmetric Property of Triangle Congruence', ex: (a, b) => `If ${tri(a)} ≅ ${tri(b)}, then ${tri(b)} ≅ ${tri(a)}` },
  { name: 'Transitive Property of Triangle Congruence', ex: (a, b, c) => `If ${tri(a)} ≅ ${tri(b)} and ${tri(b)} ≅ ${tri(c)}, then ${tri(a)} ≅ ${tri(c)}` },
];

// ---------------------------------------------------------------- templates

const T = {};

T.thirdAngle = { book: 'angles', make(rand) {
  const a = int(rand, 20, 100); const b = int(rand, 20, 160 - a); const c = 180 - a - b;
  return { ask: 'Find the third angle', prompt: `Two angles of a triangle measure ${deg(a)} and ${deg(b)}.`, typed: c,
    tell: `Triangle Sum Theorem: 180 − ${a} − ${b} = ${c}.` };
} };

T.triSumAlg = { book: 'angles', make(rand) {
  const x = int(rand, 8, 30); const a = int(rand, 2, 5); const b = int(rand, 1, 4); const c = int(rand, 1, 4);
  const s = a + b + c; const base = s * x; if (base >= 180) return T.triSumAlg.make(rand);
  const r = 180 - base; // split the leftover into two constants, one may be negative
  const k1 = int(rand, -12, r + 12); const k2 = r - k1;
  const angles = [a * x, b * x + k1, c * x + k2]; if (angles.some((v) => v < 10)) return T.triSumAlg.make(rand);
  return { ask: 'Find x', prompt: `The angles of a triangle measure (${a}x)°, ${expr(b, k1)} and ${expr(c, k2)}.`, typed: x,
    tell: `add them: ${s}x${r === 0 ? '' : r < 0 ? ` − ${-r}` : ` + ${r}`} = 180 → ${s}x = ${180 - r} → x = ${x}. The angles are ${angles.map(deg).join(', ')}.` };
} };

T.exterior = { book: 'angles', make(rand) {
  const r1 = int(rand, 25, 95); const r2 = int(rand, 25, 170 - r1); const ext = r1 + r2;
  if (rand() < 0.5) return { ask: 'Find the other remote interior angle', prompt: `An exterior angle of a triangle measures ${deg(ext)} and one remote interior angle measures ${deg(r1)}.`, typed: r2,
    tell: `Exterior Angle Theorem: the exterior angle is the SUM of the two remote interior angles, so ${ext} − ${r1} = ${r2}.` };
  return { ask: 'Find the exterior angle', prompt: `The two remote interior angles of an exterior angle measure ${deg(r1)} and ${deg(r2)}.`, typed: ext,
    tell: `Exterior Angle Theorem: ${r1} + ${r2} = ${ext}. (Not 180 minus either one.)` };
} };

T.rightAcute = { book: 'angles', make(rand) {
  const x = int(rand, 5, 20); const a = int(rand, 2, 6); const b = int(rand, 1, 4); const base = (a + b) * x;
  if (base >= 90) return T.rightAcute.make(rand);
  const r = 90 - base; const k1 = int(rand, -8, r + 8); const k2 = r - k1;
  if (a * x + k1 < 5 || b * x + k2 < 5) return T.rightAcute.make(rand);
  return { ask: 'Find x', prompt: `The acute angles of a right triangle measure ${expr(a, k1)} and ${expr(b, k2)}.`, typed: x,
    tell: `the acute angles of a right triangle are complementary: ${a + b}x${r === 0 ? '' : r < 0 ? ` − ${-r}` : ` + ${r}`} = 90 → x = ${x}. They measure ${deg(a * x + k1)} and ${deg(b * x + k2)}.` };
} };

T.classify = { book: 'angles', make(rand) {
  const KINDS = [
    { sides: [8, 8, 8], angles: [60, 60, 60], ans: 'equilateral and equiangular' },
    { sides: [5, 5, 7], angles: [70, 70, 40], ans: 'isosceles and acute' },
    { sides: [6, 6, 10], angles: [34, 34, 112], ans: 'isosceles and obtuse' },
    { sides: [3, 4, 5], angles: [37, 53, 90], ans: 'scalene and right' },
    { sides: [4, 6, 9], angles: [26, 40, 114], ans: 'scalene and obtuse' },
    { sides: [6, 7, 8], angles: [47, 58, 75], ans: 'scalene and acute' },
    { sides: [5, 5, 7], angles: [45, 45, 90], ans: 'isosceles and right', sidesTxt: '5, 5, 5√2' },
  ];
  const k = pick(rand, KINDS);
  const others = [...new Set(KINDS.map((q) => q.ans))].filter((s) => s !== k.ans);
  return { ask: 'Classify the triangle by its sides and its angles', prompt: `sides ${k.sidesTxt || k.sides.join(', ')}; angles ${k.angles.map(deg).join(', ')}`,
    choices: [k.ans, ...sample(rand, others, 3)], answer: 0,
    tell: `by sides: all three equal → equilateral, two equal → isosceles, none → scalene. By angles: a 90° → right, one over 90° → obtuse, all under 90° → acute, all 60° → equiangular.` };
} };

T.thirdAngles = { book: 'angles', make(rand) {
  const [t1, t2] = names(rand); const a = int(rand, 25, 90); const b = int(rand, 25, 150 - a);
  return { ask: `Find m${angleOf(t2, 2)}`, prompt: `${angleOf(t1, 0)} ≅ ${angleOf(t2, 0)} and ${angleOf(t1, 1)} ≅ ${angleOf(t2, 1)}. m${angleOf(t1, 0)} = ${deg(a)} and m${angleOf(t1, 1)} = ${deg(b)}.`, typed: 180 - a - b,
    tell: `Third Angles Theorem: two congruent pairs force the third pair congruent, so m${angleOf(t2, 2)} = m${angleOf(t1, 2)} = 180 − ${a} − ${b} = ${180 - a - b}.` };
} };

T.corresponds = { book: 'congr', make(rand) {
  const [t1, t2] = names(rand); const i = int(rand, 0, 2); const side = rand() < 0.5;
  if (side) {
    const ans = seg(sideOf(t2, i));
    const wrong = [0, 1, 2].filter((j) => j !== i).map((j) => seg(sideOf(t2, j))).concat([seg(t2[(i + 1) % 3] + t2[(i + 2) % 3])]);
    return { ask: `Which side corresponds to ${seg(sideOf(t1, i))}?`, prompt: `${tri(t1)} ≅ ${tri(t2)}`, choices: [ans, ...[...new Set(wrong)].slice(0, 3)], answer: 0,
      tell: `read the ORDER: ${t1[0]} ↔ ${t2[0]}, ${t1[1]} ↔ ${t2[1]}, ${t1[2]} ↔ ${t2[2]}. So ${sideOf(t1, i)} ↔ ${sideOf(t2, i)}.` };
  }
  return { ask: `Which angle corresponds to ${angleOf(t1, i)}?`, prompt: `${tri(t1)} ≅ ${tri(t2)}`, choices: [angleOf(t2, i), ...[0, 1, 2].filter((j) => j !== i).map((j) => angleOf(t2, j)), angleOf(t1, (i + 1) % 3)], answer: 0,
    tell: `read the ORDER: ${t1[i]} is the ${['first', 'second', 'third'][i]} letter, so it matches ${t2[i]}.` };
} };

T.congrSolve = { book: 'congr', make(rand) {
  const [t1, t2] = names(rand); const i = int(rand, 0, 2); const x = int(rand, 3, 12); const a = int(rand, 2, 7); const b = nz(rand, -9, 9);
  const v = a * x + b; if (v <= 0) return T.congrSolve.make(rand);
  if (rand() < 0.5) return { ask: 'Find x', prompt: `${tri(t1)} ≅ ${tri(t2)}, ${sideOf(t1, i)} = ${sexpr(a, b)}, and ${sideOf(t2, i)} = ${v}.`, typed: x,
    tell: `${seg(sideOf(t1, i))} ↔ ${seg(sideOf(t2, i))} (same positions in the statement), so ${sexpr(a, b)} = ${v} → x = ${x}.` };
  if (v >= 180) return T.congrSolve.make(rand);
  return { ask: 'Find x', prompt: `${tri(t1)} ≅ ${tri(t2)}, m${angleOf(t1, i)} = ${expr(a, b)}, and m${angleOf(t2, i)} = ${deg(v)}.`, typed: x,
    tell: `${angleOf(t1, i)} ↔ ${angleOf(t2, i)}, so ${sexpr(a, b)} = ${v} → x = ${x}.` };
} };

T.property = { book: 'congr', make(rand) {
  const [t1, t2] = names(rand); const t3 = sample(rand, [...LETTERS].filter((c) => !t1.includes(c) && !t2.includes(c)), 3).join('');
  const p = pick(rand, PROPS);
  return { ask: 'Name the property', prompt: p.ex(t1, t2, t3), choices: [p.name, ...PROPS.filter((q) => q !== p).map((q) => q.name), 'Definition of congruent triangles'], answer: 0,
    tell: `${p.name}: ${p === PROPS[0] ? 'a figure is congruent to itself' : p === PROPS[1] ? 'the two sides of a congruence can be swapped' : 'congruence passes through a middle triangle'}.` };
} };

T.restate = { book: 'congr', make(rand) {
  const [t1, t2] = names(rand);
  const rot = (t, k) => t.slice(k) + t.slice(0, k);
  const k = int(rand, 1, 2); const ans = `${tri(rot(t1, k))} ≅ ${tri(rot(t2, k))}`;
  const wrong = [`${tri(rot(t1, k))} ≅ ${tri(t2)}`, `${tri(t1)} ≅ ${tri(t2[0] + t2[2] + t2[1])}`, `${tri(rot(t1, k))} ≅ ${tri(rot(t2, 3 - k))}`];
  return { ask: 'Which statement says the same thing?', prompt: `${tri(t1)} ≅ ${tri(t2)}`, choices: [ans, ...wrong], answer: 0,
    tell: `the letter ORDER is the information. Move both sides the same way and the pairs stay ${t1[0]}↔${t2[0]}, ${t1[1]}↔${t2[1]}, ${t1[2]}↔${t2[2]}; the others change which parts correspond.` };
} };

T.criterion = { book: 'crit', make(rand) {
  const s = pick(rand, SORT);
  const ans = s.ans; const others = CRIT.filter((c) => c !== ans && !(ans === 'ASA or AAS' && (c === 'ASA' || c === 'AAS')));
  return { ask: 'SSS, SAS, ASA, AAS, HL — or NONE?', prompt: s.text, choices: [ans, ...sample(rand, others, 3)], answer: 0,
    tell: s.why ? `${s.why}: ${ans}.` : `${ans}: ${{ SSS: 'three sides', SAS: 'two sides and the INCLUDED angle', ASA: 'two angles and the INCLUDED side', AAS: 'two angles and a non-included side', HL: 'right triangles — hypotenuse and a leg' }[ans]}.` };
} };

T.impostor = { book: 'crit', make(rand) {
  const which = pick(rand, ['SSA', 'AAA']);
  const ans = which === 'SSA' ? 'The second side can swing to either of two positions, so the parts do not pin the triangle down' : 'Angles control shape, not size — the other triangle can be a scaled copy';
  const wrong = [which === 'SSA' ? 'Angles control shape, not size — the other triangle can be a scaled copy' : 'The second side can swing to either of two positions, so the parts do not pin the triangle down',
    'Three pairs of parts are never enough — you need all six', 'It only works for right triangles'];
  return { ask: `Why is ${which} not a congruence criterion?`, prompt: which === 'SSA' ? 'two sides and a NON-included angle' : 'all three angles',
    choices: [ans, ...wrong], answer: 0, tell: `${ans}. ${which === 'SSA' ? 'HL is the one exception: with a RIGHT angle the Pythagorean Theorem fixes the third side.' : 'Later that pair is called SIMILAR — a real relationship, just not congruence.'}` };
} };

T.freePart = { book: 'crit', make(rand) {
  const f = pick(rand, FREE);
  return { ask: 'Which reason gives you the free pair?', prompt: `${f.have.charAt(0).toUpperCase()}${f.have.slice(1)}, so ${f.get}.`,
    choices: [f.reason, ...sample(rand, FREE.filter((g) => g !== f).map((g) => g.reason), 3)], answer: 0,
    tell: `${f.get} — ${f.reason}. Mark it on the picture before you count your three pairs.` };
} };

T.baseAngles = { book: 'iso', make(rand) {
  if (rand() < 0.5) { const v = int(rand, 20, 150); if (v % 2) return T.baseAngles.make(rand);
    return { ask: 'Find each base angle', prompt: `The vertex angle of an isosceles triangle measures ${deg(v)}.`, typed: (180 - v) / 2,
      tell: `the base angles are congruent (Base Angles Theorem): (180 − ${v}) ÷ 2 = ${(180 - v) / 2}.` }; }
  const b = int(rand, 20, 85);
  return { ask: 'Find the vertex angle', prompt: `Each base angle of an isosceles triangle measures ${deg(b)}.`, typed: 180 - 2 * b,
    tell: `180 − 2(${b}) = ${180 - 2 * b}.` };
} };

T.baseAlg = { book: 'iso', make(rand) {
  const x = int(rand, 4, 15); const a = int(rand, 2, 6); let c = int(rand, 2, 7); while (c === a) c = int(rand, 2, 7);
  const b = int(rand, -12, 25); const d = a * x + b - c * x; const v = a * x + b;
  if (v < 15 || v > 85) return T.baseAlg.make(rand);
  if (rand() < 0.5) return { ask: 'Find x', prompt: `The base angles of a triangle measure ${expr(a, b)} and ${expr(c, d)}.`, typed: x,
    tell: `base angles are congruent: ${sexpr(a, b)} = ${sexpr(c, d)} → x = ${x}; each base angle is ${deg(v)}, so the vertex angle is ${deg(180 - 2 * v)}.` };
  return { ask: 'Find x', prompt: `The legs of an isosceles triangle measure ${sexpr(a, b)} and ${sexpr(c, d)}.`, typed: x,
    tell: `the legs are the congruent sides: ${sexpr(a, b)} = ${sexpr(c, d)} → x = ${x}; each leg is ${v}.` };
} };

T.equilateral = { book: 'iso', make(rand) {
  const x = int(rand, 3, 15); const a = int(rand, 2, 6); const b = 60 - a * x; if (b < -40) return T.equilateral.make(rand);
  return { ask: 'Find x', prompt: `An angle of an equilateral triangle measures ${expr(a, b)}.`, typed: x,
    tell: `equilateral ⟺ equiangular, and every angle is 60°: ${sexpr(a, b)} = 60 → x = ${x}.` };
} };

T.isoTheorem = { book: 'iso', make(rand) {
  const Q = [
    { prompt: 'If two SIDES of a triangle are congruent, then the angles opposite them are congruent.', ans: R.BASE },
    { prompt: 'If two ANGLES of a triangle are congruent, then the sides opposite them are congruent.', ans: R.CONV },
    { prompt: 'The three interior angles of a triangle add to 180°.', ans: R.TSUM },
    { prompt: 'An exterior angle equals the sum of the two remote interior angles.', ans: R.EXT },
    { prompt: 'If two angles of one triangle are congruent to two angles of another, the third angles are congruent.', ans: R.THIRD },
  ];
  const q = pick(rand, Q);
  return { ask: 'Name the theorem', prompt: q.prompt, choices: [q.ans, ...sample(rand, Q.filter((z) => z !== q).map((z) => z.ans), 3)], answer: 0, tell: `${q.ans}.` };
} };

T.proofStep = { book: 'cpctc', make(rand) {
  const p = pick(rand, PROOFS);
  const steps = p.rows.map((r, i) => i).filter((i) => p.rows[i][1] !== R.GIVEN); // a "Given" is never the question
  const at = pick(rand, steps);
  const ans = p.rows[at][1];
  const pool = shuffle(rand, ALL_R.filter((r) => r !== ans && r !== R.GIVEN));
  const wrong = [...new Set([...p.rows.map((r) => r[1]).filter((r) => r !== ans && r !== R.GIVEN), ...pool])].slice(0, 3);
  return { ask: p.ask, prompt: p.given, proof: { rows: p.rows, at }, choices: [ans, ...wrong], answer: 0,
    tell: ans === R.CPCTC ? 'the triangles were proved congruent on the line before — only now may CPCTC hand you the part you want.' : ans === R.REFL ? 'a shared side is congruent to itself — the free pair.' : `${ans}.` };
} };

T.cpctcWhen = { book: 'cpctc', make(rand) {
  const Q = [
    { ask: 'What does CPCTC stand for?', ans: 'Corresponding Parts of Congruent Triangles are Congruent', wrong: ['Congruent Parts of Corresponding Triangles are Congruent', 'Corresponding Polygons of Congruent Triangles are Congruent', 'Congruent Pairs Can Transfer Congruence'] },
    { ask: 'When may you use CPCTC in a proof?', ans: 'Only AFTER the two triangles are proved congruent by SSS, SAS, ASA, AAS or HL', wrong: ['As the reason that makes the two triangles congruent', 'Any time two sides look the same length in the diagram', 'Only in proofs about isosceles triangles'] },
    { ask: 'A surveyor marks C so that AC ≅ CD and BC ≅ CE, then measures ED = 68 m. Why does AB = 68 m?', ans: '△ACB ≅ △DCE by SAS (vertical angles at C), so AB ≅ DE by CPCTC', wrong: ['△ACB ≅ △DCE by SSA, so AB ≅ DE by CPCTC', 'AB ≅ DE by CPCTC, which then proves the triangles congruent', 'The triangles are similar, so AB is proportional to DE'] },
    { ask: 'The two-step plan for a CPCTC proof is', ans: '(1) prove two triangles congruent with a criterion; (2) use CPCTC on the part you want', wrong: ['(1) use CPCTC on the part you want; (2) prove the triangles congruent', '(1) measure the parts; (2) compare them', '(1) show all six pairs congruent; (2) write CPCTC'] },
  ];
  const q = pick(rand, Q);
  return { ask: q.ask, prompt: '', choices: [q.ans, ...q.wrong], answer: 0, tell: `${q.ans}.` };
} };

T.vocab = { book: 'cpctc', make(rand) {
  const v = pick(rand, VOCAB); const others = sample(rand, VOCAB.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
