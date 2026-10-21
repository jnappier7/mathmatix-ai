/**
 * Test Prep: Honors Geometry — Chapter 3 (Parallel and Perpendicular Lines, 3.1–3.5), built from
 * Mr. Nappier's Ch. 3 Test PRACTICE. Every question type is a template with new numbers each play.
 *
 * The figures are computed, not drawn by hand, and the answers come from the same geometry:
 *   - the box is eight 3-D points; parallel / skew / intersecting edges and parallel faces are
 *     worked out from their direction vectors and shared vertices;
 *   - the transversal diagram is two lines cut by a third; each numbered angle knows its
 *     intersection, its side of the transversal and whether it is interior, so "corresponding",
 *     "alternate interior" … and "congruent or supplementary" follow from position.
 * Theorem names match the course's own Two-Minute Drill (public/courses/geometry).
 */
const { M, num, int, pick, sample, shuffle, frac, slopeIntercept, makeBank } = require('./kit');

const BOOKS = {
  all: { name: 'Full Test', ch: 'Ch. 3', blurb: 'Every question type on the Chapter 3 test, mixed.' },
  space: { name: 'Lines & Planes', ch: 'Q1–3', blurb: 'Parallel, skew and parallel planes in a box.' },
  pairs: { name: 'Angle Pairs', ch: 'Q4–9', blurb: 'Classify the pair; find the angle when c ∥ d.' },
  alg: { name: 'Angle Algebra', ch: 'Q10–14, 17', blurb: 'Solve for x with parallel and perpendicular lines.' },
  thm: { name: 'Theorems & Proof', ch: 'Q12, 15–16, 22', blurb: 'Name the converse, the perpendicular theorems, proof reasons.' },
  coord: { name: 'Slopes & Equations', ch: 'Q18–21', blurb: 'Slope, parallel or perpendicular, write the line.' },
};

const R = {
  CAP: 'Corresponding Angles Postulate', AIA: 'Alternate Interior Angles Theorem', AEA: 'Alternate Exterior Angles Theorem',
  CIA: 'Consecutive Interior Angles Theorem', CAC: 'Corresponding Angles Converse', AIAC: 'Alternate Interior Angles Converse',
  AEAC: 'Alternate Exterior Angles Converse', CIAC: 'Consecutive Interior Angles Converse', VAT: 'Vertical Angles Theorem',
  TRANSC: 'Transitive Property of Congruence', LPP: 'Linear Pair Postulate', PTT: 'Perpendicular Transversal Theorem',
  LPTT: 'Lines Perpendicular to a Transversal Theorem', TPL: 'Transitive Property of Parallel Lines', SUBST: 'Substitution Property of Equality',
};

// ---------------------------------------------------------------- the box

const V = { A: [0, 1, 0], B: [1, 1, 0], C: [1, 1, 1], D: [0, 1, 1], E: [0, 0, 0], F: [1, 0, 0], G: [1, 0, 1], H: [0, 0, 1] };
const EDGES = ['AB', 'BC', 'CD', 'DA', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG', 'DH'];
const FACES = ['ABFE', 'DCGH', 'ADHE', 'BCGF', 'ABCD', 'EFGH'];
const sub = (p, q) => p.map((v, i) => v - q[i]);
const dir = (e) => sub(V[e[1]], V[e[0]]).map(Math.abs).join();
/** How two edges of the box relate. */
function relate(e1, e2) {
  if (e1 === e2) return 'same';
  if ([...e1].some((v) => e2.includes(v))) return 'intersect';
  if (dir(e1) === dir(e2)) return 'parallel';
  return 'skew'; // two box edges that neither meet nor run the same way
}
const opposite = (f) => FACES.find((g) => g !== f && [...g].every((v) => !f.includes(v)));
const lineName = (rand, e) => `line ${rand() < 0.5 ? e : e[1] + e[0]}`;
const planeName = (rand, f) => `plane ${sample(rand, [...f], 3).join('')}`;
function boxSVG() {
  const P = (k) => { const [x, y, z] = V[k]; return [40 + x * 170 + z * 75, 200 - y * 130 - z * 60]; };
  const hidden = (e) => e.includes('H');
  const edges = EDGES.map((e) => { const [a, b] = [P(e[0]), P(e[1])]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#14212a" stroke-width="2"${hidden(e) ? ' stroke-dasharray="6 5" opacity=".6"' : ''}/>`; }).join('');
  const off = { A: [-14, -6], B: [6, -6], C: [6, -6], D: [-14, -8], E: [-14, 14], F: [6, 14], G: [6, 14], H: [-16, 12] };
  const labels = Object.keys(V).map((k) => { const [x, y] = P(k); return `<text x="${x + off[k][0]}" y="${y + off[k][1]}" font-size="15" font-weight="700" fill="#14212a">${k}</text>`; }).join('');
  return `<svg viewBox="0 -16 320 248" width="290" role="img" aria-label="a box with vertices A through H">${edges}${labels}</svg>`;
}

// ---------------------------------------------------------------- the transversal

// Angle n → { at: 0 top / 1 bottom line, q: quadrant }. 1 2 / 3 4 at the top, 5 6 / 7 8 below.
const QS = ['TL', 'TR', 'BL', 'BR'];
const ANG = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, { at: n <= 4 ? 0 : 1, q: QS[(n - 1) % 4] }]));
const left = (a) => a.q[1] === 'L';
const interior = (a) => (a.at === 0 ? a.q[0] === 'B' : a.q[0] === 'T');
/** TL/BR angles are one measure, TR/BL the other (supplementary) — when the lines are parallel. */
const group = (a) => (a.q === 'TL' || a.q === 'BR' ? 0 : 1);
function classify(n1, n2) {
  const a = ANG[n1]; const b = ANG[n2];
  if (a.at === b.at) return a.q[0] !== b.q[0] && a.q[1] !== b.q[1] ? 'vertical' : 'linear pair';
  if (a.q === b.q) return 'corresponding';
  if (interior(a) && interior(b)) return left(a) !== left(b) ? 'alternate interior' : 'consecutive interior';
  if (!interior(a) && !interior(b)) return left(a) !== left(b) ? 'alternate exterior' : 'consecutive exterior';
  return 'none';
}
const FOUR = ['corresponding', 'alternate interior', 'alternate exterior', 'consecutive interior'];
const PAIRS = [];
for (let i = 1; i <= 8; i++) for (let j = i + 1; j <= 8; j++) PAIRS.push([i, j, classify(i, j)]);

function transversalSVG(names = ['c', 'd', 't']) {
  const Y0 = 75; const Y1 = 175;
  const X0 = 190; const X1 = 150; // where t crosses each line (t leans right going up)
  const u = [X0 - X1, Y0 - Y1]; const ul = Math.hypot(...u); const up = [u[0] / ul, u[1] / ul];
  const pos = (n) => {
    const a = ANG[n]; const cx = a.at === 0 ? X0 : X1; const cy = a.at === 0 ? Y0 : Y1;
    const h = [a.q[1] === 'L' ? -1 : 1, 0];
    const v = a.q[0] === 'T' ? up : [-up[0], -up[1]];
    const b = [h[0] + v[0], h[1] + v[1]]; const bl = Math.hypot(...b);
    return [cx + (b[0] / bl) * 24, cy + (b[1] / bl) * 24 + 5];
  };
  const nums = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => { const [x, y] = pos(n); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="14" font-weight="700" text-anchor="middle" fill="#14212a">${n}</text>`; }).join('');
  const ext = 1.15;
  const tx0 = X1 - up[0] * 110 * ext; const ty0 = Y1 - up[1] * 110 * ext; const tx1 = X0 + up[0] * 75; const ty1 = Y0 + up[1] * 75;
  return `<svg viewBox="0 0 330 250" width="290" role="img" aria-label="lines ${names[0]} and ${names[1]} cut by transversal ${names[2]}, angles 1 to 8">
    <defs><marker id="ta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#14212a"/></marker></defs>
    <line x1="20" y1="${Y0}" x2="310" y2="${Y0}" stroke="#14212a" stroke-width="2" marker-start="url(#ta)" marker-end="url(#ta)"/>
    <line x1="20" y1="${Y1}" x2="310" y2="${Y1}" stroke="#14212a" stroke-width="2" marker-start="url(#ta)" marker-end="url(#ta)"/>
    <line x1="${tx0.toFixed(1)}" y1="${ty0.toFixed(1)}" x2="${tx1.toFixed(1)}" y2="${ty1.toFixed(1)}" stroke="#2e6fd8" stroke-width="2" marker-start="url(#ta)" marker-end="url(#ta)"/>
    <text x="312" y="${Y0 - 8}" font-size="15" font-style="italic" text-anchor="end">${names[0]}</text><text x="312" y="${Y1 - 8}" font-size="15" font-style="italic" text-anchor="end">${names[1]}</text>
    <text x="${(tx1 + 8).toFixed(1)}" y="${(ty1 + 4).toFixed(1)}" font-size="15" font-style="italic" fill="#2e6fd8">${names[2]}</text>${nums}</svg>`;
}
const ang = (n) => `∠${n}`;

// ---------------------------------------------------------------- templates

const T = {};

T.boxPar = { book: 'space', make(rand) {
  const e = pick(rand, EDGES);
  const par = EDGES.filter((x) => relate(e, x) === 'parallel');
  const others = shuffle(rand, EDGES.filter((x) => ['intersect', 'skew'].includes(relate(e, x))));
  return { ask: `Name a line parallel to ${lineName(rand, e)}`, prompt: 'Use the box.', fig: boxSVG(),
    choices: [pick(rand, par), ...others.slice(0, 3)].map((x) => lineName(rand, x)), answer: 0,
    tell: `parallel lines run the same direction and never meet. ${e} is parallel to ${par.join(', ')}.` };
} };
T.boxSkew = { book: 'space', make(rand) {
  const e = pick(rand, EDGES);
  const skew = EDGES.filter((x) => relate(e, x) === 'skew');
  const par = EDGES.filter((x) => relate(e, x) === 'parallel');
  const meet = EDGES.filter((x) => relate(e, x) === 'intersect');
  return { ask: `Name a line skew to ${lineName(rand, e)}`, prompt: 'Use the box.', fig: boxSVG(),
    choices: [pick(rand, skew), pick(rand, par), ...sample(rand, meet, 2)].map((x) => lineName(rand, x)), answer: 0,
    tell: `skew lines are not in the same plane: they never meet AND are not parallel. Skew to ${e}: ${skew.join(', ')}.` };
} };
T.boxPlane = { book: 'space', make(rand) {
  const f = pick(rand, FACES);
  const opp = opposite(f);
  const adj = FACES.filter((g) => g !== f && g !== opp);
  return { ask: `Name a plane parallel to ${planeName(rand, f)}`, prompt: 'Use the box.', fig: boxSVG(),
    choices: [opp, ...sample(rand, adj, 3)].map((g) => planeName(rand, g)), answer: 0,
    tell: `parallel planes never meet — the opposite face of the box: ${opp}.` };
} };

T.classify = { book: 'pairs', make(rand) {
  const [a, b, kind] = pick(rand, PAIRS.filter(([, , k]) => FOUR.includes(k)));
  const [x, y] = rand() < 0.5 ? [a, b] : [b, a];
  return { ask: `Classify the angle pair: ${ang(x)} and ${ang(y)}`, prompt: 'Use the diagram.', fig: transversalSVG(),
    choices: [kind, ...FOUR.filter((k) => k !== kind)].map((k) => `${k[0].toUpperCase()}${k.slice(1)} angles`), answer: 0,
    tell: {
      corresponding: 'same position at each intersection (same corner).',
      'alternate interior': 'between the lines, on opposite sides of the transversal.',
      'alternate exterior': 'outside the lines, on opposite sides of the transversal.',
      'consecutive interior': 'between the lines, on the SAME side of the transversal.',
    }[kind] };
} };
T.findAngle = { book: 'pairs', make(rand) {
  const [a, b] = sample(rand, [1, 2, 3, 4, 5, 6, 7, 8], 2);
  const obtuse = int(rand, 101, 138);
  const m = (n) => (group(ANG[n]) === 0 ? obtuse : 180 - obtuse); // TL/BR obtuse in this drawing
  const same = group(ANG[a]) === group(ANG[b]);
  const kind = classify(a, b);
  return { ask: `c ∥ d and m${ang(a)} = ${m(a)}°. Find m${ang(b)}.`, prompt: 'Use the diagram.', fig: transversalSVG(), typed: m(b),
    tell: `${ang(a)} and ${ang(b)} are ${kind === 'none' ? 'related through a vertical or corresponding angle' : kind} — ${same ? 'congruent, so the same measure' : `supplementary, so 180 − ${m(a)}`} = ${m(b)}°.` };
} };

T.solveCong = { book: 'alg', make(rand) {
  const kind = pick(rand, ['corresponding', 'alternate interior', 'alternate exterior']);
  const x = int(rand, 6, 25);
  if (rand() < 0.5) {
    const a = int(rand, 3, 7); const b = int(rand, -12, 12);
    const v = a * x + b;
    if (v < 20 || v > 160) return T.solveCong.make(rand);
    return { ask: 'Find x', prompt: `Two parallel lines are cut by a transversal. A pair of ${kind} angles measure (${a}x ${b < 0 ? M : '+'} ${Math.abs(b)})° and ${v}°.`, typed: x,
      tell: `${kind} angles are congruent: ${a}x ${b < 0 ? M : '+'} ${Math.abs(b)} = ${v}, so ${a}x = ${v - b} and x = ${x}.` };
  }
  const a = int(rand, 5, 9); const c = int(rand, 2, a - 1);
  const d = int(rand, 5, 30); const b = (c - a) * x + d;
  const v = a * x + b;
  if (v < 20 || v > 160) return T.solveCong.make(rand);
  const show = (k, s) => `(${k}x ${s < 0 ? M : '+'} ${Math.abs(s)})°`;
  return { ask: 'Find the value of x that makes the lines parallel', prompt: `Two lines are cut by a transversal. A pair of ${kind} angles measure ${show(a, b)} and ${show(c, d)}.`, typed: x,
    tell: `the lines are parallel when the ${kind} angles are congruent: ${a}x ${b < 0 ? M : '+'} ${Math.abs(b)} = ${c}x + ${d}, so ${a - c}x = ${d - b} and x = ${x}.` };
} };
T.solveSupp = { book: 'alg', make(rand) {
  for (;;) {
    const x = int(rand, 10, 30); const a = int(rand, 2, 5); const c = int(rand, 2, 5);
    const b = int(rand, -10, 20); const d = 180 - (a + c) * x - b;
    const p = a * x + b; const q = c * x + d;
    if (p < 25 || q < 25 || d < -20 || d > 60 || p === q) continue;
    const askBig = rand() < 0.4;
    const show = (k, s) => `(${k}x ${s < 0 ? M : '+'} ${Math.abs(s)})°`;
    return { ask: askBig ? 'Find the LARGER angle measure' : 'Find x', prompt: `Two parallel lines are cut by a transversal. A pair of consecutive interior angles measure ${show(a, b)} and ${show(c, d)}.`,
      typed: askBig ? Math.max(p, q) : x,
      tell: `consecutive interior angles are supplementary: ${show(a, b).replace('°', '')} + ${show(c, d).replace('°', '')} = 180, so ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = 180 and x = ${x}. The angles are ${p}° and ${q}°.` };
  }
} };
T.perpSplit = { book: 'alg', make(rand) {
  for (;;) {
    const x = int(rand, 5, 20); const a = int(rand, 2, 4); const c = int(rand, 2, 5);
    const b = int(rand, -12, 20); const d = 90 - (a + c) * x - b;
    const j = a * x + b; const k = c * x + d;
    if (j < 15 || k < 15 || Math.abs(d) > 30) continue;
    const show = (p, s) => `(${p}x ${s < 0 ? M : '+'} ${Math.abs(s)})°`;
    const fig = `<svg viewBox="0 0 220 190" width="200" role="img" aria-label="right angle at H split into angles j and k">
      <line x1="40" y1="160" x2="40" y2="15" stroke="#14212a" stroke-width="2"/><line x1="40" y1="160" x2="205" y2="160" stroke="#14212a" stroke-width="2"/>
      <line x1="40" y1="160" x2="${40 + 150 * Math.cos(0.75)}" y2="${160 - 150 * Math.sin(0.75)}" stroke="#2e6fd8" stroke-width="2"/>
      <rect x="40" y="146" width="14" height="14" fill="none" stroke="#14212a"/>
      <text x="30" y="15" font-size="14" font-weight="700">G</text><text x="26" y="176" font-size="14" font-weight="700">H</text><text x="200" y="178" font-size="14" font-weight="700">J</text>
      <text x="62" y="110" font-size="15" font-style="italic" fill="#2e6fd8">j</text><text x="100" y="150" font-size="15" font-style="italic" fill="#2e6fd8">k</text></svg>`;
    return { ask: 'Find x', prompt: `GH ⊥ HJ. j = ${show(a, b)} and k = ${show(c, d)}.`, fig, typed: x,
      tell: `perpendicular lines make a right angle, so j + k = 90: ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = 90 and x = ${x}.` };
  }
} };
T.perpBis = { book: 'alg', make(rand) {
  for (;;) {
    const x = int(rand, 2, 9); const a = int(rand, 2, 5); const c = a + int(rand, 1, 4);
    const b = int(rand, -5, 12); const d = (a - c) * x + b;
    const pa = a * x + b;
    if (pa <= 0) continue;
    return { ask: 'Find PA', prompt: `Point P lies on the perpendicular bisector of AB. PA = ${a}x ${b < 0 ? M : '+'} ${Math.abs(b)} and PB = ${c}x ${d < 0 ? M : '+'} ${Math.abs(d)}.`,
      typed: pa, tell: `a point on the perpendicular bisector is equidistant from A and B, so PA = PB: x = ${x}, then PA = ${a}(${x}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${pa}. (The question asks for PA, not x.)` };
  }
} };

const CONV = { corresponding: 'CAC', 'alternate interior': 'AIAC', 'alternate exterior': 'AEAC', 'consecutive interior': 'CIAC' };
T.converse = { book: 'thm', make(rand) {
  const [a, b, kind] = pick(rand, PAIRS.filter(([, , k]) => FOUR.includes(k)));
  const rel = kind === 'consecutive interior' ? 'supplementary' : 'congruent';
  return { ask: 'Name the theorem that proves c ∥ d', prompt: `You do NOT know that c ∥ d. If ${ang(a)} and ${ang(b)} are ${rel}, then c ∥ d.`, fig: transversalSVG(),
    choices: [R[CONV[kind]], ...Object.values(CONV).filter((k) => k !== CONV[kind]).map((k) => R[k])], answer: 0,
    tell: `${ang(a)} and ${ang(b)} are ${kind} angles. To PROVE lines parallel, use the CONVERSE: ${R[CONV[kind]]}.` };
} };
T.perpThm = { book: 'thm', make(rand) {
  const [s, t, u] = sample(rand, ['a', 'b', 'c', 'd', 'm', 'n', 'r', 's', 't'], 3);
  if (rand() < 0.5) {
    return { ask: `What can you conclude about lines ${s} and ${t}?`, prompt: `In a plane, line ${s} ⊥ line ${u} and line ${t} ⊥ line ${u}.`,
      choices: [`${s} ∥ ${t} — ${R.LPTT}`, `${s} ⊥ ${t} — ${R.PTT}`, `${s} ∥ ${t} — ${R.PTT}`, `${s} ⊥ ${t} — ${R.LPTT}`], answer: 0,
      tell: `two lines perpendicular to the same line (in a plane) are parallel to each other: ${R.LPTT}.` };
  }
  return { ask: `What can you conclude about lines ${u} and ${t}?`, prompt: `In a plane, line ${s} ∥ line ${t} and line ${u} ⊥ line ${s}.`,
    choices: [`${u} ⊥ ${t} — ${R.PTT}`, `${u} ∥ ${t} — ${R.LPTT}`, `${u} ⊥ ${t} — ${R.LPTT}`, `${u} ∥ ${t} — ${R.TPL}`], answer: 0,
    tell: `a transversal perpendicular to one of two parallel lines is perpendicular to the other: ${R.PTT}.` };
} };
T.proof = { book: 'thm', make(rand) {
  // Prove two alternate angles congruent without the Alternate Angles Theorems:
  // a → (corresponding) c → (vertical) b, or a → (vertical) v → (corresponding) b.
  const [a, b, kind] = pick(rand, PAIRS.filter(([, , k]) => k === 'alternate interior' || k === 'alternate exterior'));
  const corrOf = (n) => (n <= 4 ? n + 4 : n - 4);
  const vertOf = (n) => ({ 1: 4, 4: 1, 2: 3, 3: 2, 5: 8, 8: 5, 6: 7, 7: 6 })[n];
  const viaCorr = rand() < 0.5;
  const mid = viaCorr ? corrOf(a) : vertOf(a);
  const rows = [['p ∥ q', 'Given'],
    [`${ang(a)} ≅ ${ang(mid)}`, viaCorr ? R.CAP : R.VAT],
    [`${ang(mid)} ≅ ${ang(b)}`, viaCorr ? R.VAT : R.CAP],
    [`${ang(a)} ≅ ${ang(b)}`, R.TRANSC]];
  const at = int(rand, 1, 3);
  const right = rows[at][1];
  const pool = [R.CAP, R.VAT, R.TRANSC, R.LPP, R.SUBST, R.CAC];
  return { ask: `Which reason justifies step ${at + 1}?`, prompt: `Given: p ∥ q. Prove: ${ang(a)} ≅ ${ang(b)}. (No ${kind === 'alternate interior' ? R.AIA : R.AEA}.)`,
    fig: transversalSVG(['p', 'q', 't']), proof: { rows, at },
    choices: [right, ...sample(rand, pool.filter((r) => r !== right), 3)], answer: 0,
    tell: at === 3 ? 'two congruences that share an angle chain together: Transitive Property of Congruence.'
      : rows[at][1] === R.CAP ? `${ang(viaCorr ? a : mid)} and ${ang(viaCorr ? mid : b)} are in the same corner at each intersection — corresponding, and the lines are parallel.`
        : 'those two angles are across from each other at the same intersection — vertical angles.' };
} };

T.slope = { book: 'coord', make(rand) {
  for (;;) {
    const q = int(rand, 1, 8); const p = int(rand, -8, 8);
    if (!p || q === Math.abs(p)) continue;
    const x1 = int(rand, -6, 4); const y1 = int(rand, -5, 8);
    const k = pick(rand, [1, 2]);
    const x2 = x1 + q * k; const y2 = y1 + p * k;
    const right = frac(p, q);
    const choices = [right, frac(-p, q), frac(q, p), frac(-q, p)];
    if (new Set(choices).size < 4) continue;
    return { ask: 'Find the slope', prompt: `the line through (${num(x1)}, ${num(y1)}) and (${num(x2)}, ${num(y2)})`, choices, answer: 0,
      tell: `slope = (y₂ − y₁) ÷ (x₂ − x₁) = (${num(y2)} − ${y1 < 0 ? `(${num(y1)})` : num(y1)}) ÷ (${num(x2)} − ${x1 < 0 ? `(${num(x1)})` : num(x1)}) = ${num(y2 - y1)}/${num(x2 - x1)}${`${num(y2 - y1)}/${num(x2 - x1)}` === right ? '' : ` = ${right}`}. Rise over run — y on top.` };
  }
} };
/** Standard form of y = (p/q)x + b, cleared of fractions: −p·x + q·y = q·b, leading term positive. */
function standard(p, q, b) {
  let [A, B, C] = [-p, q, q * b];
  if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
  const xs = A === 0 ? '' : A === 1 ? 'x' : `${A}x`;
  const ys = B === 0 ? '' : `${xs ? (B < 0 ? ` ${M} ` : ' + ') : (B < 0 ? M : '')}${Math.abs(B) === 1 ? '' : Math.abs(B)}y`;
  return `${xs}${ys} = ${num(C)}`;
}
T.relation = { book: 'coord', make(rand) {
  const q = pick(rand, [1, 2, 3, 4]); const p = pick(rand, [-3, -2, -1, 1, 2, 3].filter((v) => Math.abs(v) !== q || q === 1));
  const b1 = int(rand, -6, 6);
  const kind = pick(rand, ['parallel', 'perpendicular', 'coinciding', 'neither']);
  let second;
  if (kind === 'parallel') second = standard(p, q, b1 + pick(rand, [-4, -3, -2, 2, 3, 5]));
  else if (kind === 'coinciding') second = standard(p, q, b1);
  else if (kind === 'perpendicular') { const pp = -q; const qq = p; second = standard(qq < 0 ? -pp : pp, Math.abs(qq), int(rand, -5, 5)); }
  else {
    let p2 = p + pick(rand, [1, 2]);
    if (p2 * p === -q * q || p2 * q === p * q) p2 += 1; // not secretly perpendicular (or parallel)
    second = standard(p2, q, int(rand, -5, 5));
  }
  const first = slopeIntercept(p, q, b1);
  const label = { parallel: 'Parallel', perpendicular: 'Perpendicular', coinciding: 'Coinciding', neither: 'Neither' };
  return { ask: 'Parallel, perpendicular, coinciding, or neither?', prompt: `${first} and ${second}`,
    choices: [label[kind], ...Object.values(label).filter((l) => l !== label[kind])], answer: 0,
    tell: `solve the second for y and compare. Same slope + same intercept = coinciding; same slope only = parallel; slopes multiply to −1 = perpendicular; otherwise neither. Here: ${kind}.` };
} };
T.parallelLine = { book: 'coord', make(rand) {
  const m = pick(rand, [-5, -4, -3, -2, 2, 3, 4, 5]);
  const b0 = int(rand, -8, 8); const x0 = int(rand, -4, 5); const y0 = int(rand, -6, 8);
  const b = y0 - m * x0;
  const choices = [slopeIntercept(m, 1, b), slopeIntercept(m, 1, y0 + m * x0), slopeIntercept(-1, m, b), slopeIntercept(m, 1, b0)];
  if (new Set(choices).size < 4) choices[3] = slopeIntercept(m, 1, b + 1);
  return { ask: 'Write the PARALLEL line', prompt: `through (${num(x0)}, ${num(y0)}), parallel to ${slopeIntercept(m, 1, b0)}`, choices, answer: 0,
    tell: `parallel = same slope, ${num(m)}. Then ${num(y0)} = ${num(m)}(${num(x0)}) + b, so b = ${num(b)}.` };
} };
T.perpLine = { book: 'coord', make(rand) {
  const k = pick(rand, [2, 3, 4, 5]);
  // given x − k·y = C (slope 1/k) → perpendicular slope −k
  const C = pick(rand, [-12, -8, -6, 4, 6, 8, 10, 12]);
  const x0 = int(rand, -4, 5); const y0 = int(rand, -6, 9);
  const m = -k; const b = y0 - m * x0;
  const choices = [slopeIntercept(m, 1, b), slopeIntercept(1, k, b), slopeIntercept(k, 1, y0 - k * x0), slopeIntercept(m, 1, y0 + m * x0)];
  if (new Set(choices).size < 4) choices[3] = slopeIntercept(m, 1, b + 2);
  return { ask: 'Write the PERPENDICULAR line', prompt: `through (${num(x0)}, ${num(y0)}), perpendicular to x ${M} ${k}y = ${num(C)}`, choices, answer: 0,
    tell: `solve x ${M} ${k}y = ${num(C)} for y: the slope is 1/${k}. Perpendicular slope = negative reciprocal = ${num(m)}. Then b = ${num(y0)} − (${num(m)})(${num(x0)}) = ${num(b)}.` };
} };

module.exports = makeBank(BOOKS, T);
module.exports._geo = { relate, opposite, classify, group, ANG, EDGES, FACES, V };
