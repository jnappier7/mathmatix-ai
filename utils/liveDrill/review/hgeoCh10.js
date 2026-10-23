/**
 * Chapter Review: Honors Geometry — Chapter 10 (Circles, 10.1–10.7), built from Mr. Nappier's
 * study sheet, the Circle Theorems Reference Card and the Chapter 10 Review. Quick-fire: one move
 * per play — is it a tangent, find r from a tangent, congruent tangent segments, arcs (diameter,
 * major, circle graph), chords and the master right triangle, inscribed angles and polygons,
 * "where is the vertex?" angle rules, the three segment products, equations of circles.
 *
 * Wrong choices are the reference card's "two mistakes": the near arc alone for an outside angle,
 * (external)(far part) instead of (whole)(external) for secants — plus the sign flip in (x − h)².
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 10', blurb: 'Tangents, arcs, chords, inscribed angles, angle and segment rules, equations of circles — mixed.' },
  tangents: { name: 'Lines & Tangents', ch: '10.1', blurb: 'Name the line, is it tangent, find r from a tangent, congruent tangent segments.' },
  arcs: { name: 'Arcs & Chords', ch: '10.2–10.3', blurb: 'Minor and major arcs, circle graphs, congruent chords, the diameter ⊥ chord right triangle.' },
  inscribed: { name: 'Inscribed Angles', ch: '10.4', blurb: 'Half the arc, the semicircle\'s right angle, the inscribed quadrilateral.' },
  angles: { name: 'Where Is the Vertex?', ch: '10.5', blurb: 'Center, on, inside (sum), outside (difference), circumscribed.' },
  segments: { name: 'Segment Products', ch: '10.6', blurb: 'Chords, secants, tangent–secant — whole times external.' },
  coord: { name: 'Coordinate Plane', ch: '10.7', blurb: 'Write the equation, read the center and radius, point tests, the diameter\'s midpoint.' },
};

const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const sup = (e) => `<sup>${e}</sup>`;
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const sq = (v, h) => (h === 0 ? `${v}${sup(2)}` : `(${v} ${h < 0 ? '+' : M} ${Math.abs(h)})${sup(2)}`); // (x − h)²
const circleEq = (h, k, r2) => `${sq('x', h)} + ${sq('y', k)} = ${r2}`;
const expr = (a, b) => `${a === 1 ? '' : a}x ${b < 0 ? M : '+'} ${Math.abs(b)}`;
function simplify(n) { let k = 1; for (let f = 2; f * f <= n; f++) while (n % (f * f) === 0) { n /= f * f; k *= f; } return [k, n]; }
const rad = (n) => { const [k, m] = simplify(n); return m === 1 ? String(k) : k === 1 ? `√${m}` : `${k}√${m}`; };

const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
/** A center whose coordinates can't collide in the wrong choices (sign flips and swaps all distinct). */
const center = (rand) => { const h = nz(rand, -8, 8); const k = nz(rand, -8, 8); return Math.abs(h) === Math.abs(k) ? center(rand) : [h, k]; };

const T = {};

// ------------------------------------------------------------------ 10.1
T.nameLine = { book: 'tangents', make(rand) {
  const V = [
    ['a LINE that meets the circle at exactly two points', 'secant'], ['a segment whose endpoints are both on the circle', 'chord'],
    ['a chord that passes through the center', 'diameter'], ['a line that touches the circle at exactly one point', 'tangent'],
    ['a segment from the center to a point on the circle', 'radius'], ['the point where a tangent touches the circle', 'point of tangency'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

T.isTangent = { book: 'tangents', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 3); const yes = rand() < 0.5; const r = a * k; const t = b * k; const d = yes ? c * k : c * k + pick(rand, [1, -1, 2]);
  return { ask: 'Is the segment tangent to the circle?', prompt: `Radius ${r} meets a ${t}-unit segment at the circle; the segment's far end is ${d} from the center.`,
    ...mc(rand, yes ? `Yes — ${r}² + ${t}² = ${d}²` : `No — ${r}² + ${t}² ≠ ${d}²`, [yes ? `No — ${r}² + ${t}² ≠ ${d}²` : `Yes — ${r}² + ${t}² = ${d}²`, `Yes — ${r} + ${t} > ${d}`, 'No — a tangent must equal the radius']),
    tell: `a tangent is ⊥ the radius, so check the right triangle: ${r}² + ${t}² = ${r * r + t * t} and ${d}² = ${d * d}${yes ? ' — equal, so yes.' : ' — not equal, so no right angle, so not tangent.'}` };
} };

T.findR = { book: 'tangents', make(rand) {
  const r = int(rand, 3, 20); const e = int(rand, 2, 12); const t2 = 2 * r * e + e * e; const t = Math.round(Math.sqrt(t2)); if (t * t !== t2) return T.findR.make(rand);
  return { ask: 'Find r', prompt: `A tangent segment is ${t}; the secant through the center has external piece ${e}.`, typed: r,
    tell: `${t}² + r² = (r + ${e})² → ${t2} + r² = r² + ${2 * e}r + ${e * e} → ${2 * e}r = ${t2 - e * e} → r = ${r}. The r² terms cancel.` };
} };

T.tangentSegs = { book: 'tangents', make(rand) {
  const x = int(rand, 2, 9); const a = int(rand, 3, 8); const c = int(rand, 1, a - 1); const b = int(rand, -9, 9); const d = (a - c) * x + b; const len = a * x + b;
  if (len <= 0 || d === b) return T.tangentSegs.make(rand);
  const whole = rand() < 0.5;
  return { ask: whole ? 'Find each tangent segment' : 'Find x', prompt: `Two tangent segments from one point measure ${expr(a, b)} and ${expr(c, d)}.`, typed: whole ? len : x,
    tell: `tangent segments from one outside point are congruent: ${expr(a, b)} = ${expr(c, d)} → ${a - c}x = ${d - b} → x = ${x}; each segment is ${len}.` };
} };

// ------------------------------------------------------------------ 10.2–10.3
T.diameterArc = { book: 'arcs', make(rand) {
  const a = int(rand, 20, 160);
  return { ask: 'Find m⌒CB', prompt: `AB is a diameter and m⌒AC = ${a}°.`, typed: 180 - a, tell: `a diameter cuts a semicircle, 180°: 180 − ${a} = ${180 - a}.` };
} };

T.majorArc = { book: 'arcs', make(rand) {
  const a = int(rand, 20, 179); const back = rand() < 0.3;
  if (back) return { ask: 'Find the minor arc', prompt: `A major arc measures ${360 - a}°.`, typed: a, tell: `360 − ${360 - a} = ${a}.` };
  return { ask: 'Find the major arc', prompt: `A minor arc measures ${a}°.`, typed: 360 - a, tell: `major = 360 − minor = ${360 - a}°.` };
} };

T.circleGraph = { book: 'arcs', make(rand) {
  const pct = pick(rand, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75]);
  return { ask: 'Find the central angle', prompt: `A category is ${pct}% of a circle graph.`, typed: pct * 3.6, tell: `${pct}% × 360° = ${pct * 3.6}°.` };
} };

T.congruentChords = { book: 'arcs', make(rand) {
  const a = int(rand, 30, 170);
  if (rand() < 0.5) return { ask: 'Find m⌒RS', prompt: `Chords PQ ≅ RS in one circle, and m⌒PQ = ${a}°.`, typed: a, tell: `congruent chords cut congruent arcs: ${a}°.` };
  const d = int(rand, 2, 12);
  return { ask: 'What else is true?', prompt: `Chords PQ ≅ RS in one circle; PQ is ${d} from the center.`,
    ...mc(rand, `RS is also ${d} from the center`, [`RS is ${2 * d} from the center`, 'RS is a diameter', `m⌒RS = ${d}°`]),
    tell: 'congruent chords ↔ congruent arcs ↔ equidistant from the center.' };
} };

T.diamPerpChord = { book: 'arcs', make(rand) {
  const half = int(rand, 5, 30); const arc = 2 * int(rand, 20, 80);
  if (rand() < 0.5) return { ask: 'Find each piece of the chord', prompt: `A diameter is perpendicular to a ${2 * half}-unit chord.`, typed: half, tell: `a diameter ⊥ a chord bisects it: ${2 * half} ÷ 2 = ${half}.` };
  return { ask: 'Find each piece of the arc', prompt: `A diameter is perpendicular to a chord whose arc measures ${arc}°.`, typed: arc / 2, tell: `a diameter ⊥ a chord bisects the chord AND its arc: ${arc} ÷ 2 = ${arc / 2}°.` };
} };

T.chordTriangle = { book: 'arcs', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 3); const [half, d, r] = rand() < 0.5 ? [a * k, b * k, c * k] : [b * k, a * k, c * k];
  const kind = pick(rand, ['chord', 'radius', 'distance']);
  if (kind === 'chord') return { ask: 'Find the chord', prompt: `Radius ${r}; a chord is ${d} from the center.`, typed: 2 * half, tell: `half-chord² = ${r}² − ${d}² = ${half * half} → half = ${half}, chord = ${2 * half}. Draw the radius to the endpoint.` };
  if (kind === 'radius') return { ask: 'Find the radius', prompt: `A chord of ${2 * half} sits ${d} from the center.`, typed: r, tell: `r² = ${half}² + ${d}² = ${r * r} → r = ${r}. Half the chord and the distance are the legs.` };
  return { ask: 'How far is the chord from the center?', prompt: `Radius ${r}; the chord is ${2 * half}.`, typed: d, tell: `d² = ${r}² − ${half}² = ${d * d} → d = ${d}.` };
} };

// ------------------------------------------------------------------ 10.4
T.inscribedAngle = { book: 'inscribed', make(rand) {
  const arc = 2 * int(rand, 15, 170);
  if (rand() < 0.5) return { ask: 'Find the inscribed angle', prompt: `It intercepts a ${arc}° arc.`, typed: arc / 2, tell: `inscribed angle = ½ · arc = ${arc / 2}°.` };
  return { ask: 'Find the intercepted arc', prompt: `An inscribed angle measures ${arc / 2}°.`, typed: arc, tell: `arc = 2 · inscribed angle = ${arc}°.` };
} };

T.sameArc = { book: 'inscribed', make(rand) {
  const a = int(rand, 15, 80);
  if (rand() < 0.5) return { ask: 'Find the central angle on the same arc', prompt: `An inscribed angle is ${a}°.`, typed: 2 * a, tell: `the central angle equals the arc, and the inscribed angle is half of it: ${2 * a}°.` };
  return { ask: 'Find the other inscribed angle', prompt: `Two inscribed angles intercept the same arc; one is ${a}°.`, typed: a, tell: `same arc → same inscribed angle: ${a}°, wherever the vertex sits.` };
} };

T.semicircle = { book: 'inscribed', make(rand) {
  if (rand() < 0.4) { const a = int(rand, 15, 75); return { ask: 'Find the other acute angle', prompt: `A triangle is inscribed with one side a diameter; one acute angle is ${a}°.`, typed: 90 - a, tell: `the angle opposite the diameter is 90°, so the acute angles add to 90: ${90 - a}°.` }; }
  const x = int(rand, 3, 15); const a = int(rand, 2, 6); const c = int(rand, 1, 5); const b = int(rand, -5, 9); const d = 90 - (a + c) * x - b; if (d < -9 || d > 20) return T.semicircle.make(rand);
  const whole = rand() < 0.5;
  return { ask: whole ? 'Find the larger acute angle' : 'Find x', prompt: `A triangle in a semicircle has acute angles (${expr(a, b)})° and (${expr(c, d)})°.`, typed: whole ? Math.max(a * x + b, c * x + d) : x,
    tell: `the acute angles add to 90: ${a + c}x ${b + d < 0 ? M : '+'} ${Math.abs(b + d)} = 90 → x = ${x}; the angles are ${a * x + b}° and ${c * x + d}°.` };
} };

T.inscribedQuad = { book: 'inscribed', make(rand) {
  if (rand() < 0.4) { const a = int(rand, 40, 140); return { ask: 'Find the opposite angle', prompt: `A quadrilateral is inscribed in a circle; one angle is ${a}°.`, typed: 180 - a, tell: `opposite angles of an inscribed quadrilateral are supplementary: 180 − ${a} = ${180 - a}.` }; }
  const y = int(rand, 5, 30); const a = int(rand, 2, 5); const c = 1; const b = int(rand, 5, 40); const d = 180 - (a + c) * y - b; if (d < 5 || d > 90) return T.inscribedQuad.make(rand);
  return { ask: 'Find y', prompt: `An inscribed quadrilateral has opposite angles (${expr(a, b).replace(/x/, 'y')})° and (${expr(c, d).replace(/x/, 'y')})°.`, typed: y,
    tell: `opposite angles add to 180: ${a + c}y + ${b + d} = 180 → y = ${y}; the angles are ${a * y + b}° and ${c * y + d}°.` };
} };

// ------------------------------------------------------------------ 10.5
T.tangentChord = { book: 'angles', make(rand) {
  const a = int(rand, 20, 85);
  if (rand() < 0.5) return { ask: 'Find the intercepted arc', prompt: `A tangent–chord angle is ${a}°.`, typed: 2 * a, tell: `vertex ON the circle: angle = ½ · arc, so the arc is ${2 * a}°.` };
  return { ask: 'Find the tangent–chord angle', prompt: `The chord cuts off a ${2 * a}° arc on that side.`, typed: a, tell: `half the arc: ${a}°.` };
} };

T.insideAngle = { book: 'angles', make(rand) {
  const a = int(rand, 30, 150); const b = int(rand, 30, 150); if ((a + b) % 2) return T.insideAngle.make(rand);
  return { ask: 'Find the angle', prompt: `Two chords cross inside the circle; the vertical arcs are ${a}° and ${b}°.`, typed: (a + b) / 2, tell: `vertex INSIDE: ½(${a} + ${b}) = ${(a + b) / 2}°.` };
} };

T.outsideAngle = { book: 'angles', make(rand) {
  const kind = pick(rand, ['secants', 'tangents', 'mixed']);
  if (kind === 'tangents') { const far = int(rand, 182, 300); if (far % 2) return T.outsideAngle.make(rand); const near = 360 - far;
    return { ask: 'Find the angle between the tangents', prompt: `Two tangents from a point cut arcs of ${far}° and ${near}°.`, typed: (far - near) / 2, tell: `vertex OUTSIDE: ½(far − near) = ½(${far} − ${near}) = ${(far - near) / 2}°. (Or 180° − the ${near}° central angle.)` }; }
  const far = int(rand, 60, 200); const near = int(rand, 20, far - 20); if ((far - near) % 2) return T.outsideAngle.make(rand);
  return { ask: 'Find the angle', prompt: `${kind === 'secants' ? 'Two secants' : 'A tangent and a secant'} from an outside point: far arc ${far}°, near arc ${near}°.`, typed: (far - near) / 2,
    tell: `vertex OUTSIDE: ½(far − near) = ½(${far} − ${near}) = ${(far - near) / 2}°. The near arc alone is the classic mistake.` };
} };

T.circumscribed = { book: 'angles', make(rand) {
  const c = int(rand, 40, 150);
  return { ask: 'Find the circumscribed angle', prompt: `Two tangents meet at a point; the central angle to the two tangent points is ${c}°.`, typed: 180 - c, tell: `circumscribed angle = 180° − central = ${180 - c}° (the quadrilateral has two right angles at the tangent points).` };
} };

T.whichRule = { book: 'angles', make(rand) {
  const Q = [
    ['the vertex is at the CENTER', 'angle = the arc'], ['the vertex is ON the circle (two chords)', 'angle = ½ · arc'], ['the vertex is ON the circle (tangent and chord)', 'angle = ½ · arc'],
    ['the vertex is INSIDE the circle (two chords cross)', 'angle = ½ (arc + arc)'], ['the vertex is OUTSIDE the circle (two secants, two tangents, or one of each)', 'angle = ½ (far − near)'],
    ['a circumscribed angle (two tangents)', 'angle = 180° − central'],
  ];
  const [d, w] = pick(rand, Q);
  return { ask: 'Which rule?', prompt: d, ...mc(rand, w, uniq(Q.map((q) => q[1]))), tell: `where is the vertex? ${w}.` };
} };

// ------------------------------------------------------------------ 10.6
T.chordsProduct = { book: 'segments', make(rand) {
  const a = int(rand, 2, 12); const b = int(rand, 2, 12); const c = pick(rand, [1, 2, 3, 4, 6, 8, 12].filter((d) => (a * b) % d === 0 && d !== a && d !== b)); const x = (a * b) / c;
  return { ask: 'Find x', prompt: `Two chords cross: pieces ${a} and ${b} on one chord, pieces ${c} and x on the other.`, typed: x, tell: `(piece)(piece) = (piece)(piece): ${a} · ${b} = ${c} · x → x = ${a * b} ÷ ${c} = ${x}.` };
} };

T.secantsProduct = { book: 'segments', make(rand) {
  const e1 = int(rand, 2, 9); const f1 = int(rand, 3, 15); const e2 = int(rand, 2, 12); const prod = e1 * (e1 + f1); if (prod % e2 || prod / e2 <= e2) return T.secantsProduct.make(rand); const x = prod / e2 - e2;
  return { ask: 'Find x', prompt: `Two secants from a point: external ${e1}, far part ${f1}; external ${e2}, far part x.`, typed: x,
    tell: `(whole)(external) = (whole)(external): ${e1 + f1} · ${e1} = (x + ${e2}) · ${e2} → ${prod} = ${e2}x + ${e2 * e2} → x = ${x}. The whole secant is external + far part.` };
} };

T.tangentSecant = { book: 'segments', make(rand) {
  const e = int(rand, 2, 9); const f = int(rand, 3, 20); const t2 = e * (e + f); const t = Math.round(Math.sqrt(t2));
  if (t * t === t2) return { ask: 'Find the tangent t', prompt: `A tangent t meets a secant with external ${e} and far part ${f}.`, typed: t, tell: `t² = (whole)(external) = ${e + f} · ${e} = ${t2} → t = ${t}.` };
  return { ask: 'Find the tangent t (exact)', prompt: `A tangent t meets a secant with external ${e} and far part ${f}.`, ...mc(rand, rad(t2), [rad(e * f), `√${t2 + e * e}`, String(e + f), rad(2 * t2)]),
    tell: `t² = (whole)(external) = ${e + f} · ${e} = ${t2} → t = √${t2} = ${rad(t2)}.` };
} };

T.productMistake = { book: 'segments', make(rand) {
  const Q = [
    { q: 'For two secants from an outside point, each product is…', ans: '(whole secant)(external part)', wrongs: ['(external part)(far part)', '(far part)(far part)', '(whole)(whole)'] },
    { q: 'For a tangent and a secant from an outside point…', ans: 'tangent² = (whole secant)(external part)', wrongs: ['tangent = (whole secant)(external part)', 'tangent² = (external)(far part)', 'tangent² = whole + external'] },
    { q: 'For two chords that cross inside the circle…', ans: '(piece)(piece) = (piece)(piece), one chord on each side', wrongs: ['piece + piece = piece + piece', '(whole)(external) = (whole)(external)', 'the four pieces are all equal'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Complete the rule', prompt: q.q, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

// ------------------------------------------------------------------ 10.7
T.writeEquation = { book: 'coord', make(rand) {
  const [h, k] = center(rand); const r = int(rand, 2, 12);
  return { ask: 'Write the equation of the circle', prompt: `Center ${pt(h, k)}, radius ${r}.`,
    ...mc(rand, circleEq(h, k, r * r), [circleEq(-h, -k, r * r), circleEq(h, k, r), circleEq(k, h, r * r), circleEq(-h, k, r * r)]),
    tell: `(x − h)² + (y − k)² = r²: subtract the center's coordinates and square the radius — ${circleEq(h, k, r * r).replace(/<\/?sup>/g, '')}.` };
} };

T.readEquation = { book: 'coord', make(rand) {
  const [h, k] = center(rand); const r = int(rand, 1, 12); const want = rand() < 0.5 ? 'center' : 'radius';
  if (want === 'radius') return { ask: 'Find the radius', prompt: circleEq(h, k, r * r), typed: r, tell: `r² = ${r * r}, so r = ${r} — take the square root.` };
  return { ask: 'Find the center', prompt: circleEq(h, k, r * r), ...mc(rand, pt(h, k), [pt(-h, -k), pt(k, h), pt(-h, k), pt(h, -k)]),
    tell: `(x − h)² + (y − k)²: the signs flip — (x ${h < 0 ? '+' : M} ${Math.abs(h)})² means h = ${num(h)}. Center ${pt(h, k)}.` };
} };

T.pointTest = { book: 'coord', make(rand) {
  const r2 = pick(rand, [25, 100, 169, 50, 65, 85]); const x = int(rand, -10, 10); const y = int(rand, -10, 10); const d2 = x * x + y * y; if (d2 > 2 * r2) return T.pointTest.make(rand);
  const ans = d2 === r2 ? 'ON the circle' : d2 < r2 ? 'INSIDE the circle' : 'OUTSIDE the circle';
  return { ask: `Where is ${pt(x, y)}?`, prompt: `x${sup(2)} + y${sup(2)} = ${r2}`, ...mc(rand, ans, ['ON the circle', 'INSIDE the circle', 'OUTSIDE the circle']),
    tell: `plug in: ${x * x} + ${y * y} = ${d2}, ${d2 === r2 ? `equal to ${r2} → on` : d2 < r2 ? `less than ${r2} → inside` : `more than ${r2} → outside`}.` };
} };

T.radiusFromPoint = { book: 'coord', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES.slice(0, 4)); const h = int(rand, -6, 6); const k = int(rand, -6, 6); const sx = pick(rand, [1, -1]); const sy = pick(rand, [1, -1]);
  const [dx, dy] = rand() < 0.5 ? [a, b] : [b, a];
  return { ask: 'Find the radius', prompt: `Center ${pt(h, k)}; the circle passes through ${pt(h + sx * dx, k + sy * dy)}.`, typed: c,
    tell: `distance formula from the center: √(${dx}² + ${dy}²) = √${c * c} = ${c}.` };
} };

T.centerFromDiameter = { book: 'coord', make(rand) {
  const [h, k] = center(rand); const dx = int(rand, 1, 6); const dy = int(rand, 1, 6); if ((dx === h && dy === k) || (h - dx === h && k + dy === k)) return T.centerFromDiameter.make(rand);
  return { ask: 'Find the center', prompt: `A diameter has endpoints ${pt(h - dx, k - dy)} and ${pt(h + dx, k + dy)}.`, ...mc(rand, pt(h, k), [pt(2 * h, 2 * k), pt(dx, dy), pt(h - dx, k + dy), pt(k, h)]),
    tell: `the center is the MIDPOINT of a diameter: average the coordinates → ${pt(h, k)}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['an arc smaller than a semicircle, named with two letters', 'minor arc'], ['an arc larger than a semicircle, named with three letters', 'major arc'],
    ['an angle whose vertex is the center of the circle', 'central angle'], ['an angle whose vertex is on the circle and whose sides are chords', 'inscribed angle'],
    ['the arc that lies in the interior of an inscribed angle', 'intercepted arc'], ['a polygon whose vertices all lie on a circle', 'inscribed polygon'],
    ['the circle that passes through every vertex of a polygon', 'circumscribed circle'], ['the perpendicular from the center to a chord', 'distance from the center'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
