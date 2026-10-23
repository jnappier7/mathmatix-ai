/**
 * Chapter Review: Honors Geometry — Chapter 9 (Right Triangles and Trigonometry, 9.1–9.7), built
 * from Mr. Nappier's guided notes: the Pythagorean Theorem and its inequalities, special right
 * triangles, the geometric-mean rules of the altitude to the hypotenuse, SOH-CAH-TOA and the
 * inverse ratios, angles of elevation and depression, and the Laws of Sines and Cosines.
 *
 * Quick-fire: one move per play. Exact answers stay exact (simplest radical form, a typed integer
 * from a Pythagorean triple); the calculator questions are multiple choice to the nearest tenth,
 * with the wrong choices being the wrong ratio, the inverted ratio, or the dropped term.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 9', blurb: 'Pythagorean Theorem, special right triangles, geometric means, trig ratios, Laws of Sines and Cosines — mixed.' },
  pyth: { name: 'Pythagorean Theorem', ch: '9.1', blurb: 'Find the side, simplest radical form, triples, classify by c² vs. a² + b².' },
  special: { name: 'Special Right Triangles', ch: '9.2', blurb: '45°-45°-90° and 30°-60°-90°, rationalizing, the square\'s diagonal and the equilateral\'s altitude.' },
  simRight: { name: 'Similar Right Triangles', ch: '9.3', blurb: 'Geometric mean; the altitude rule and the leg rule.' },
  trig: { name: 'Trig Ratios', ch: '9.4–9.6', blurb: 'SOH-CAH-TOA, which ratio, the missing side, inverse trig, elevation and depression, solving a right triangle.' },
  laws: { name: 'Laws of Sines & Cosines', ch: '9.7', blurb: 'Which law, the third angle, a side by each law, area without an altitude.' },
};

const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const deg = (d) => `${d}°`;
const rad = (n, k) => (k === 1 ? String(n) : n === 1 ? `√${k}` : `${n}√${k}`); // n√k
const tenth = (x) => (Math.round(x * 10) / 10).toFixed(1);
const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD); const cos = (d) => Math.cos(d * RAD); const tan = (d) => Math.tan(d * RAD);
const atan = (r) => Math.atan(r) / RAD; const acos = (r) => Math.acos(r) / RAD;
/** Pythagorean triples (a, b, c), the primitive ones the notes use. */
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];
/** √n in simplest radical form, as [outside, inside]. */
function simplify(n) {
  let k = 1;
  for (let f = 2; f * f <= n; f++) while (n % (f * f) === 0) { n /= f * f; k *= f; }
  return [k, n];
}
const radical = (n) => { const [k, m] = simplify(n); return rad(k, m); };
/** Decimal multiple-choice: the key plus wrongs, all distinct to the tenth. */
function dec(rand, right, wrongs, unit = '') {
  const seen = new Set([tenth(right)]); const w = [];
  for (const x of wrongs) { const s = tenth(x); if (!seen.has(s) && Number.isFinite(x) && x > 0) { seen.add(s); w.push(s); } }
  while (w.length < 3) { const s = tenth(right * (1 + (w.length + 1) * 0.15)); if (!seen.has(s)) { seen.add(s); w.push(s); } }
  return { choices: [tenth(right) + unit, ...w.map((s) => s + unit)], answer: 0 };
}

const T = {};

// ------------------------------------------------------------------ 9.1
T.tripleSide = { book: 'pyth', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 4); const legs = [a * k, b * k];
  if (rand() < 0.5) return { ask: 'Find the hypotenuse', prompt: `A right triangle has legs ${legs[0]} and ${legs[1]}.`, typed: c * k,
    tell: `${legs[0]}² + ${legs[1]}² = ${legs[0] ** 2} + ${legs[1] ** 2} = ${(c * k) ** 2} = ${c * k}². (The ${a}-${b}-${c} triple, times ${k}.)` };
  const [known, want] = rand() < 0.5 ? [legs[0], legs[1]] : [legs[1], legs[0]];
  return { ask: 'Find the missing leg', prompt: `A right triangle has hypotenuse ${c * k} and a leg of ${known}.`, typed: want,
    tell: `leg² = ${c * k}² − ${known}² = ${(c * k) ** 2} − ${known ** 2} = ${want ** 2}, so the leg is ${want}. (The ${a}-${b}-${c} triple, times ${k}.)` };
} };

T.simplifyRadical = { book: 'pyth', make(rand) {
  const k = pick(rand, [2, 3, 4, 5, 6]); const m = pick(rand, SQUAREFREE); const n = k * k * m;
  return { ask: 'Simplest radical form', prompt: `√${n}`,
    ...mc(rand, rad(k, m), [rad(m, k), rad(k * k, m), rad(k, m * k), `√${n}`]),
    tell: `√${n} = √(${k * k} · ${m}) = ${k}√${m} — pull out the largest perfect-square factor.` };
} };

T.radicalSide = { book: 'pyth', make(rand) {
  const [k, m] = [pick(rand, [2, 3, 4, 5]), pick(rand, [2, 3, 5])]; const target = k * k * m; // c² or the missing leg²
  if (rand() < 0.5) { // legs a, b with a² + b² = target
    let a = 0; let b = 0;
    for (let tries = 0; tries < 50; tries++) { a = int(rand, 1, 12); const b2 = target - a * a; b = Math.round(Math.sqrt(b2)); if (b2 > 0 && b * b === b2 && a <= b) break; a = 0; }
    if (!a) return T.radicalSide.make(rand);
    return { ask: 'Find x in simplest radical form', prompt: `Legs ${a} and ${b}; hypotenuse x.`,
      ...mc(rand, rad(k, m), [`√${target}`, rad(m, k), String(a + b), rad(k, m + 1)]),
      tell: `x² = ${a}² + ${b}² = ${target}, so x = √${target} = ${rad(k, m)}.` };
  }
  let c = 0; let a = 0;
  for (let tries = 0; tries < 50; tries++) { a = int(rand, 1, 12); const c2 = target + a * a; c = Math.round(Math.sqrt(c2)); if (c * c === c2) break; c = 0; }
  if (!c) return T.radicalSide.make(rand);
  return { ask: 'Find x in simplest radical form', prompt: `Hypotenuse ${c}, leg ${a}; the other leg is x.`,
    ...mc(rand, rad(k, m), [`√${target}`, radical(c * c + a * a), rad(m, k), String(c - a)]),
    tell: `x² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${target}, so x = ${rad(k, m)}. Subtract — the hypotenuse is the longest side.` };
} };

T.isTriple = { book: 'pyth', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 3); const yes = rand() < 0.5;
  const sides = yes ? [a * k, b * k, c * k] : [a * k, b * k, c * k + pick(rand, [1, -1, 2])];
  const [x, y, z] = sides; const ok = x * x + y * y === z * z;
  return { ask: 'Is it a Pythagorean triple?', prompt: `${x}, ${y}, ${z}`,
    ...mc(rand, ok ? `Yes — ${x}² + ${y}² = ${z}²` : `No — ${x}² + ${y}² ≠ ${z}²`, [ok ? `No — ${x}² + ${y}² ≠ ${z}²` : `Yes — ${x}² + ${y}² = ${z}²`, `Yes — ${x} + ${y} > ${z}`, 'No — a triple must have an odd number']),
    tell: `${x}² + ${y}² = ${x * x + y * y} and ${z}² = ${z * z}${ok ? ` — equal, a triple${k > 1 ? ` (${a}-${b}-${c} times ${k})` : ''}.` : ' — not equal. A triple needs whole numbers that make the theorem true.'}` };
} };

T.classify = { book: 'pyth', make(rand) {
  const a = int(rand, 3, 12); const b = int(rand, a, 15); const kind = pick(rand, ['right', 'acute', 'obtuse', 'none']);
  const c2 = a * a + b * b; const exact = Math.round(Math.sqrt(c2)); let c;
  if (kind === 'right') { if (exact * exact !== c2) return T.classify.make(rand); c = exact; }
  else if (kind === 'acute') { c = Math.floor(Math.sqrt(c2 - 1)); if (c < b) return T.classify.make(rand); }
  else if (kind === 'obtuse') { c = Math.ceil(Math.sqrt(c2 + 1)); if (c >= a + b) return T.classify.make(rand); }
  else c = a + b + int(rand, 0, 3);
  const ans = { right: 'Right — c² = a² + b²', acute: 'Acute — c² < a² + b²', obtuse: 'Obtuse — c² > a² + b²', none: 'Not a triangle — the two shorter sides don\'t add to more than the longest' }[kind];
  return { ask: 'Classify the triangle', prompt: `Sides ${a}, ${b}, ${c}`,
    ...mc(rand, ans, ['Right — c² = a² + b²', 'Acute — c² < a² + b²', 'Obtuse — c² > a² + b²', 'Not a triangle — the two shorter sides don\'t add to more than the longest']),
    tell: kind === 'none' ? `${a} + ${b} = ${a + b} ${a + b > c ? '>' : '≤'} ${c}: the Triangle Inequality fails, so there is no triangle to classify.` : `${a} + ${b} > ${c} ✓. Then c² = ${c * c} and a² + b² = ${c2}: ${c * c === c2 ? 'equal → right' : c * c < c2 ? 'less → acute' : 'greater → obtuse'}.` };
} };

T.roundTenth = { book: 'pyth', make(rand) {
  const a = int(rand, 30, 120) / 10; const b = int(rand, 30, 120) / 10; const c = Math.sqrt(a * a + b * b);
  if (rand() < 0.5) return { ask: 'Hypotenuse, nearest tenth', prompt: `Legs ${a} and ${b}.`, ...dec(rand, c, [a + b, Math.sqrt(Math.abs(a * a - b * b)), a * a + b * b]),
    tell: `√(${a}² + ${b}²) = √${(a * a + b * b).toFixed(2)} ≈ ${tenth(c)}.` };
  const hyp = Math.round(c * 10) / 10 + int(rand, 1, 3); const leg = Math.sqrt(hyp * hyp - a * a);
  return { ask: 'Missing leg, nearest tenth', prompt: `Hypotenuse ${hyp}, leg ${a}.`, ...dec(rand, leg, [Math.sqrt(hyp * hyp + a * a), hyp - a, hyp * hyp - a * a]),
    tell: `√(${hyp}² − ${a}²) = √${(hyp * hyp - a * a).toFixed(2)} ≈ ${tenth(leg)}. Subtract: the hypotenuse is the longest side.` };
} };

// ------------------------------------------------------------------ 9.2
T.iso45 = { book: 'special', make(rand) {
  const n = int(rand, 2, 12); const kind = pick(rand, ['hyp', 'legFromRad', 'legFromInt']);
  if (kind === 'hyp') return { ask: '45°-45°-90°: find the hypotenuse', prompt: `Each leg is ${n}.`, ...mc(rand, rad(n, 2), [rad(2 * n, 1), rad(n, 3), rad(2 * n, 2), String(n)]),
    tell: `hypotenuse = leg · √2 = ${rad(n, 2)}.` };
  if (kind === 'legFromRad') return { ask: '45°-45°-90°: find each leg', prompt: `The hypotenuse is ${rad(n, 2)}.`, ...mc(rand, String(n), [rad(n, 2), rad(2 * n, 2), String(2 * n), rad(n, 3)]),
    tell: `leg = hypotenuse ÷ √2 = ${rad(n, 2)} ÷ √2 = ${n}.` };
  const h = 2 * n; // hypotenuse an integer: leg = h/√2 = h√2/2 = n√2
  return { ask: '45°-45°-90°: find each leg', prompt: `The hypotenuse is ${h}.`, ...mc(rand, rad(n, 2), [rad(h, 2), String(n), rad(n, 3), String(h - 2)]),
    tell: `leg = ${h} ÷ √2 = ${h}√2 ⁄ 2 = ${rad(n, 2)} — rationalize the denominator.` };
} };

T.tri30 = { book: 'special', make(rand) {
  const s = int(rand, 2, 9); const kind = pick(rand, ['short', 'long', 'hyp']);
  if (kind === 'short') { const want = rand() < 0.5 ? 'hyp' : 'long';
    return { ask: `30°-60°-90°: find the ${want === 'hyp' ? 'hypotenuse' : 'longer leg'}`, prompt: `The shorter leg is ${s}.`,
      ...mc(rand, want === 'hyp' ? String(2 * s) : rad(s, 3), [want === 'hyp' ? rad(s, 3) : String(2 * s), rad(s, 2), rad(2 * s, 3), String(3 * s)]),
      tell: `hypotenuse = 2 · short = ${2 * s}; longer leg = short · √3 = ${rad(s, 3)}.` }; }
  if (kind === 'long') { const want = rand() < 0.5 ? 'short' : 'hyp';
    return { ask: `30°-60°-90°: find the ${want === 'short' ? 'shorter leg' : 'hypotenuse'}`, prompt: `The longer leg is ${rad(s, 3)}.`,
      ...mc(rand, want === 'short' ? String(s) : String(2 * s), [want === 'short' ? String(2 * s) : String(s), rad(s, 3), rad(2 * s, 3), rad(s, 2)]),
      tell: `shorter leg = longer ÷ √3 = ${s}; hypotenuse = 2 · ${s} = ${2 * s}.` }; }
  const want = rand() < 0.5 ? 'short' : 'long';
  return { ask: `30°-60°-90°: find the ${want === 'short' ? 'shorter leg' : 'longer leg'}`, prompt: `The hypotenuse is ${2 * s}.`,
    ...mc(rand, want === 'short' ? String(s) : rad(s, 3), [want === 'short' ? rad(s, 3) : String(s), rad(2 * s, 3), rad(s, 2), String(2 * s - 1)]),
    tell: `shorter leg = hypotenuse ÷ 2 = ${s}; longer leg = ${s}√3. The shorter leg is opposite the 30° angle.` };
} };

T.longLegInt = { book: 'special', make(rand) {
  const n = int(rand, 2, 8); const L = 3 * n; // longer leg 3n → short = n√3, hyp = 2n√3
  return { ask: '30°-60°-90°: find the shorter leg', prompt: `The longer leg is ${L}.`, ...mc(rand, rad(n, 3), [rad(L, 3), String(L / 3), rad(2 * n, 3), String(2 * L)]),
    tell: `short = ${L} ÷ √3 = ${L}√3 ⁄ 3 = ${rad(n, 3)}; then the hypotenuse is ${rad(2 * n, 3)}.` };
} };

T.rationalize = { book: 'special', make(rand) {
  const p = int(rand, 2, 9); const q = pick(rand, [2, 3, 5, 6, 7]);
  const g = (a, b) => (b ? g(b, a % b) : a); const d = g(p, q); const top = p / d; const bot = q / d;
  const ans = bot === 1 ? rad(top, q) : `${top === 1 ? '' : top}√${q}/${bot}`;
  return { ask: 'Rationalize the denominator', prompt: `${p}/√${q}`,
    ...mc(rand, ans, [`${p}√${q}`, `${p}/${q}`, `√${q}/${p}`, `${p}√${q}/${q * q}`]),
    tell: `multiply top and bottom by √${q}: ${p}√${q} ⁄ ${q}${bot === 1 || top !== p ? ` = ${ans}` : ''}.` };
} };

T.hiding = { book: 'special', make(rand) {
  if (rand() < 0.5) { const n = int(rand, 3, 12); const d = 2 * n;
    return { ask: 'A square has diagonal ' + d + '. Find its side.', prompt: 'Exact answer.', ...mc(rand, rad(n, 2), [rad(d, 2), String(n), rad(n, 3), String(d / 4)]),
      tell: `the diagonal splits the square into two 45°-45°-90° triangles: side = ${d} ÷ √2 = ${rad(n, 2)}.` }; }
  const s = 2 * int(rand, 2, 9);
  return { ask: 'An equilateral triangle has side ' + s + '. Find its altitude.', prompt: 'Exact answer.', ...mc(rand, rad(s / 2, 3), [rad(s, 3), String(s / 2), rad(s / 2, 2), rad(s / 2, 1)]),
    tell: `the altitude makes a 30°-60°-90° triangle with shorter leg ${s / 2}: altitude = ${s / 2}√3.` };
} };

// ------------------------------------------------------------------ 9.3
T.geoMean = { book: 'simRight', make(rand) {
  const g = int(rand, 4, 12); const a = pick(rand, [1, 2, 3, 4].filter((d) => (g * g) % d === 0 && d < g)); const b = (g * g) / a;
  return { ask: 'Find the geometric mean', prompt: `of ${a} and ${b}`, typed: g, tell: `√(${a} · ${b}) = √${g * g} = ${g}. Geometric mean = the square root of the product, not the average.` };
} };

T.altitudeRule = { book: 'simRight', make(rand) {
  const h = int(rand, 4, 12); const p = pick(rand, [1, 2, 3, 4].filter((d) => (h * h) % d === 0 && d < h)); const q = (h * h) / p;
  return { ask: 'Find the altitude to the hypotenuse', prompt: `The altitude splits the hypotenuse into segments ${p} and ${q}.`, typed: h,
    tell: `altitude² = ${p} · ${q} = ${h * h}, so the altitude is ${h}. The altitude is the geometric mean of the two pieces.` };
} };

T.legRule = { book: 'simRight', make(rand) {
  const k = int(rand, 1, 4); const [a, b, c] = pick(rand, TRIPLES.slice(0, 3)); // scaled so the segments are a²k, b²k
  const hyp = c * c * k; const seg = (rand() < 0.5 ? a : b); const leg = seg * c * k; const piece = seg * seg * k;
  return { ask: 'Find the leg', prompt: `Hypotenuse ${hyp}; the hypotenuse segment touching leg x measures ${piece}.`, typed: leg,
    tell: `leg² = (whole hypotenuse)(adjacent segment) = ${hyp} · ${piece} = ${leg * leg}, so x = ${leg}.` };
} };

T.solveSegment = { book: 'simRight', make(rand) {
  const h = int(rand, 4, 12); const p = pick(rand, [1, 2, 3, 4].filter((d) => (h * h) % d === 0 && d < h)); const q = (h * h) / p; const whole = rand() < 0.5;
  return { ask: whole ? 'Find the whole hypotenuse' : 'Find the other segment', prompt: `The altitude to the hypotenuse is ${h}; one hypotenuse segment is ${p}.`, typed: whole ? p + q : q,
    tell: `${h}² = ${p} · x → x = ${h * h} ÷ ${p} = ${q}; whole hypotenuse = ${p} + ${q} = ${p + q}.` };
} };

T.simStatement = { book: 'simRight', make(rand) {
  if (rand() < 0.5) return { ask: 'The altitude CD is drawn to the hypotenuse of right △ABC. Which similarity statement is right?', prompt: 'Three triangles.',
    ...mc(rand, '△ABC ~ △ACD ~ △CBD', ['△ABC ~ △ADC ~ △BDC', '△ABC ~ △CDA ~ △CDB', 'only △ACD ~ △CBD — the big one is not similar']),
    tell: 'each small triangle shares an acute angle with the big one and has a right angle, so all three are similar — match vertices in order.' };
  return { ask: 'Why are the three triangles similar?', prompt: 'The altitude to the hypotenuse of a right triangle.',
    ...mc(rand, 'AA Similarity — each has a right angle and shares an acute angle with the original', ['SSS Similarity — the sides are proportional', 'SAS Similarity — the altitude is a shared side', 'HL — they are right triangles']),
    tell: 'two angles is all it takes: the right angle and the shared acute angle.' };
} };

// ------------------------------------------------------------------ 9.4–9.6
T.ratioOf = { book: 'trig', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 3); const [A, B, C] = [a * k, b * k, c * k]; // right angle at C: BC = A (opp A), AC = B (opp B), AB = C
  const which = pick(rand, ['sin A', 'cos A', 'tan A', 'sin B', 'cos B', 'tan B']);
  const F = (p, q) => `${p}/${q}`;
  const table = { 'sin A': F(A, C), 'cos A': F(B, C), 'tan A': F(A, B), 'sin B': F(B, C), 'cos B': F(A, C), 'tan B': F(B, A) };
  return { ask: `Find ${which}`, prompt: `Right angle at C. BC = ${A}, AC = ${B}, AB = ${C}.`,
    ...mc(rand, table[which], Object.values(table)),
    tell: `from ∠${which.slice(-1)}: opposite ${which.endsWith('A') ? `BC = ${A}` : `AC = ${B}`}, adjacent ${which.endsWith('A') ? `AC = ${B}` : `BC = ${A}`}, hypotenuse AB = ${C}. ${which} = ${table[which]}.` };
} };

T.whichRatio = { book: 'trig', make(rand) {
  const Q = [
    { have: 'the hypotenuse', want: 'the side opposite the angle', ans: 'sine' },
    { have: 'the hypotenuse', want: 'the side adjacent to the angle', ans: 'cosine' },
    { have: 'the side adjacent to the angle', want: 'the side opposite the angle', ans: 'tangent' },
    { have: 'the side opposite the angle', want: 'the hypotenuse', ans: 'sine' },
    { have: 'the side adjacent to the angle', want: 'the hypotenuse', ans: 'cosine' },
    { have: 'the side opposite the angle', want: 'the side adjacent to the angle', ans: 'tangent' },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which ratio?', prompt: `You know an acute angle and ${q.have}; you want ${q.want}.`, ...mc(rand, q.ans, ['sine', 'cosine', 'tangent', 'Pythagorean Theorem']),
    tell: `SOH-CAH-TOA: pick the ratio that uses the side you HAVE and the side you WANT — ${q.ans}.` };
} };

T.missingSide = { book: 'trig', make(rand) {
  const th = int(rand, 20, 70); const known = int(rand, 8, 40); const kind = pick(rand, ['oppHyp', 'adjHyp', 'oppAdj', 'hypOpp']);
  const setups = {
    oppHyp: { prompt: `${deg(th)} angle, hypotenuse ${known}, opposite side x.`, right: known * sin(th), wrongs: [known * cos(th), known * tan(th), known / sin(th)], work: `sin ${th}° = x/${known} → x = ${known} · sin ${th}°` },
    adjHyp: { prompt: `${deg(th)} angle, hypotenuse ${known}, adjacent side x.`, right: known * cos(th), wrongs: [known * sin(th), known * tan(th), known / cos(th)], work: `cos ${th}° = x/${known} → x = ${known} · cos ${th}°` },
    oppAdj: { prompt: `${deg(th)} angle, adjacent side ${known}, opposite side x.`, right: known * tan(th), wrongs: [known / tan(th), known * sin(th), known * cos(th)], work: `tan ${th}° = x/${known} → x = ${known} · tan ${th}°` },
    hypOpp: { prompt: `${deg(th)} angle, opposite side ${known}, hypotenuse x.`, right: known / sin(th), wrongs: [known * sin(th), known / cos(th), known / tan(th)], work: `sin ${th}° = ${known}/x → x = ${known} ÷ sin ${th}°` },
  };
  const s = setups[kind];
  return { ask: 'Find x, nearest tenth', prompt: s.prompt, ...dec(rand, s.right, s.wrongs), tell: `${s.work} ≈ ${tenth(s.right)}.` };
} };

T.inverseTrig = { book: 'trig', make(rand) {
  const h = int(rand, 20, 90) * 10; const d = int(rand, 15, 60) * 10; const x = atan(h / d);
  return { ask: 'Angle of elevation, nearest tenth', prompt: `You stand ${d} ft from a ${h}-ft building and look at the top.`,
    ...dec(rand, x, [atan(d / h), 90 - x + 10, x + 90 - 2 * x - 5], '°'),
    tell: `tan x = ${h}/${d}, so x = tan⁻¹(${h}/${d}) ≈ ${tenth(x)}°. Opposite over adjacent, then the tan⁻¹ key.` };
} };

T.elevation = { book: 'trig', make(rand) {
  const th = int(rand, 20, 70); const kind = pick(rand, ['ranger', 'shadow', 'plane', 'gorge']);
  const setups = {
    ranger: () => { const up = int(rand, 60, 200); const r = up / tan(th); return { prompt: `A ranger ${up} ft up a tower sees a fire at an angle of depression of ${th}°. How far is the fire from the tower's base?`, right: r, wrongs: [up * tan(th), up / sin(th), up * sin(th)], work: `tan ${th}° = ${up}/d → d = ${up} ÷ tan ${th}°` }; },
    shadow: () => { const s = int(rand, 20, 90); const r = s * tan(th); return { prompt: `A tower casts a ${s}-m shadow when the angle of elevation from the shadow's tip to the top is ${th}°. How tall is the tower?`, right: r, wrongs: [s / tan(th), s * sin(th), s / cos(th)], work: `tan ${th}° = h/${s} → h = ${s} · tan ${th}°` }; },
    plane: () => { const alt = int(rand, 20, 60) * 100; const r = alt / tan(th); return { prompt: `A plane flies at ${alt} ft. The angle of elevation from the airport to the plane is ${th}°. Find the horizontal distance.`, right: r, wrongs: [alt * tan(th), alt / sin(th), alt * cos(th)], work: `tan ${th}° = ${alt}/d → d = ${alt} ÷ tan ${th}°` }; },
    gorge: () => { const w = int(rand, 40, 150); const r = w * tan(th); return { prompt: `From the edge of a ${w}-ft-wide gorge, the angle of depression to the base of the far wall is ${th}°. How deep is the gorge?`, right: r, wrongs: [w / tan(th), w * sin(th), w / cos(th)], work: `tan ${th}° = depth/${w} → depth = ${w} · tan ${th}°` }; },
  };
  const s = setups[kind](); const r = Math.round(s.right); const seen = new Set([r]); const w = [];
  for (const x of s.wrongs) { const v = Math.round(x); if (!seen.has(v)) { seen.add(v); w.push(v); } }
  while (w.length < 3) { const v = Math.round(r * (1 + (w.length + 1) * 0.2)); if (!seen.has(v)) { seen.add(v); w.push(v); } }
  return { ask: 'Nearest whole unit', prompt: s.prompt, choices: [String(r), ...w.map(String)], answer: 0, tell: `${s.work} ≈ ${r}. The angle goes at the observer, measured from the horizontal; height and horizontal distance are opposite and adjacent.` };
} };

T.solveTriangle = { book: 'trig', make(rand) {
  const [a, b, c] = pick(rand, TRIPLES); const k = int(rand, 1, 3); const [A, B, C] = [a * k, b * k, c * k]; // right angle at R: PR = B (adjacent to P), QR = A (opposite P)
  const kind = pick(rand, ['hyp', 'angleP', 'angleQ', 'other']);
  if (kind === 'hyp') return { ask: 'Find PQ', prompt: `Right angle at R, PR = ${B}, QR = ${A}.`, typed: C, tell: `PQ² = ${B}² + ${A}² = ${C * C}, so PQ = ${C}.` };
  if (kind === 'other') { const th = int(rand, 20, 70); return { ask: 'Find the other acute angle', prompt: `A right triangle has a ${th}° angle.`, typed: 90 - th, tell: `the acute angles of a right triangle add to 90°: 90 − ${th} = ${90 - th}.` }; }
  const P = atan(A / B); const want = kind === 'angleP' ? P : 90 - P; const name = kind === 'angleP' ? 'P' : 'Q';
  return { ask: `Find m∠${name}, nearest tenth`, prompt: `Right angle at R, PR = ${B}, QR = ${A}.`, ...dec(rand, want, [90 - want, 180 - want, 45], '°'),
    tell: kind === 'angleP' ? `tan P = QR/PR = ${A}/${B}, so P = tan⁻¹(${A}/${B}) ≈ ${tenth(P)}°.` : `tan Q = PR/QR = ${B}/${A}, so Q = tan⁻¹(${B}/${A}) ≈ ${tenth(90 - P)}° (or 90° − m∠P).` };
} };

T.inverseWhich = { book: 'trig', make(rand) {
  const Q = [
    { have: 'the side opposite the angle and the hypotenuse', ans: 'sin⁻¹' },
    { have: 'the side adjacent to the angle and the hypotenuse', ans: 'cos⁻¹' },
    { have: 'the sides opposite and adjacent to the angle', ans: 'tan⁻¹' },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which inverse ratio finds the angle?', prompt: `You know ${q.have}.`, ...mc(rand, q.ans, ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'the Pythagorean Theorem']),
    tell: `the inverse ratio takes the RATIO in and gives the ANGLE out: θ = ${q.ans}(ratio).` };
} };

// ------------------------------------------------------------------ 9.7
T.chooseLaw = { book: 'laws', make(rand) {
  const Q = [
    { given: 'two angles and any side (AAS or ASA)', ans: 'Law of Sines' },
    { given: 'two sides and the INCLUDED angle (SAS)', ans: 'Law of Cosines' },
    { given: 'all three sides (SSS)', ans: 'Law of Cosines' },
    { given: 'a right triangle with one acute angle and one side', ans: 'Neither — SOH-CAH-TOA' },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which law?', prompt: `Given ${q.given}.`, ...mc(rand, q.ans, ['Law of Sines', 'Law of Cosines', 'Neither — SOH-CAH-TOA', 'The Pythagorean Theorem']),
    tell: q.ans === 'Law of Sines' ? 'an angle with its opposite side gives a full ratio — Law of Sines.' : q.ans === 'Law of Cosines' ? 'no angle is paired with its opposite side yet, so start with the Law of Cosines.' : 'a right triangle needs neither law — the basic ratios do it.' };
} };

T.thirdAngle = { book: 'laws', make(rand) {
  const A = int(rand, 25, 80); const B = int(rand, 25, 80); if (A + B >= 160) return T.thirdAngle.make(rand);
  return { ask: 'Find m∠C', prompt: `m∠A = ${A}°, m∠B = ${B}°.`, typed: 180 - A - B, tell: `180 − ${A} − ${B} = ${180 - A - B}.` };
} };

T.lawSines = { book: 'laws', make(rand) {
  const A = int(rand, 30, 75); const B = int(rand, 30, 75); if (A + B >= 150 || A === B) return T.lawSines.make(rand);
  const a = int(rand, 8, 30); const b = a * sin(B) / sin(A);
  return { ask: 'Find b, nearest tenth', prompt: `m∠A = ${A}°, m∠B = ${B}°, a = ${a}.`, ...dec(rand, b, [a * sin(A) / sin(B), a * sin(B), a / sin(B)]),
    tell: `b/sin ${B}° = ${a}/sin ${A}° → b = ${a} · sin ${B}° ÷ sin ${A}° ≈ ${tenth(b)}.` };
} };

T.lawCosines = { book: 'laws', make(rand) {
  const b = int(rand, 6, 20); const c = int(rand, 6, 20); const A = int(rand, 30, 120); const a = Math.sqrt(b * b + c * c - 2 * b * c * cos(A));
  return { ask: 'Find a, nearest tenth', prompt: `b = ${b}, c = ${c}, included angle A = ${A}°.`, ...dec(rand, a, [Math.sqrt(b * b + c * c), Math.sqrt(Math.abs(b * b + c * c + 2 * b * c * cos(A))), b * b + c * c - 2 * b * c * cos(A)]),
    tell: `a² = ${b}² + ${c}² − 2(${b})(${c}) cos ${A}° ≈ ${(a * a).toFixed(1)}, so a ≈ ${tenth(a)}. The Law of Sines can't start here — no angle is paired with its opposite side.` };
} };

T.areaSine = { book: 'laws', make(rand) {
  const a = int(rand, 5, 20); const b = int(rand, 5, 20); const C = int(rand, 25, 140); const area = 0.5 * a * b * sin(C);
  return { ask: 'Area, nearest tenth', prompt: `Sides ${a} and ${b} with a ${C}° included angle.`, ...dec(rand, area, [a * b * sin(C), 0.5 * a * b, 0.5 * a * b * Math.abs(cos(C))]),
    tell: `Area = ½ · ${a} · ${b} · sin ${C}° ≈ ${tenth(area)}. The included angle is what makes ½ab·sin C the height times the base.` };
} };

T.largestAngle = { book: 'laws', make(rand) {
  const s = sample(rand, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 3).sort((x, y) => x - y); const [p, q, r] = s; if (p + q <= r) return T.largestAngle.make(rand);
  if (rand() < 0.5) return { ask: 'Which angle is largest?', prompt: `Sides ${p}, ${q}, ${r}.`, ...mc(rand, `the angle opposite the ${r}`, [`the angle opposite the ${p}`, `the angle opposite the ${q}`, 'can\'t tell without the Law of Sines']),
    tell: 'the largest angle is across from the longest side. Find it FIRST with the Law of Cosines — it is the only one that could be obtuse.' };
  const R = acos((p * p + q * q - r * r) / (2 * p * q));
  return { ask: 'Largest angle, nearest tenth', prompt: `Sides ${p}, ${q}, ${r}.`, ...dec(rand, R, [180 - R, acos((q * q + r * r - p * p) / (2 * q * r)), acos((p * p + r * r - q * q) / (2 * p * r))], '°'),
    tell: `cos R = (${p}² + ${q}² − ${r}²) ÷ (2 · ${p} · ${q}) = ${((p * p + q * q - r * r) / (2 * p * q)).toFixed(4)} → R ≈ ${tenth(R)}°.${R > 90 ? ' A negative cosine warned you it would be obtuse.' : ''}` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['the side across from the right angle, always the longest', 'hypotenuse'],
    ['three whole numbers a, b, c with a² + b² = c²', 'Pythagorean triple'],
    ['the square root of the product of two numbers', 'geometric mean'],
    ['the angle from the horizontal UP to the line of sight', 'angle of elevation'],
    ['the angle from the horizontal DOWN to the line of sight', 'angle of depression'],
    ['a triangle with no right angle', 'oblique triangle'],
    ['a radical with no perfect-square factor left inside and no radical in a denominator', 'simplest radical form'],
    ['the ratio opposite ÷ hypotenuse', 'sine'],
    ['the ratio adjacent ÷ hypotenuse', 'cosine'],
    ['the ratio opposite ÷ adjacent', 'tangent'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
