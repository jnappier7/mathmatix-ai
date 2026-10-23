/**
 * Chapter Review: Honors Geometry — Chapter 4 (Transformations, 4.1–4.3), built from Mr. Nappier's
 * guided notes, study sheet and Chapter 4 Review. Quick-fire: every play is one move — apply a
 * rule, name the rule, count the lines of symmetry — on the course drill's own speed tiers.
 *
 * Every rule here is the study sheet's: translation ⟨a, b⟩, reflections in the axes, y = x,
 * y = −x, x = k and y = k, rotations of 90°, 180° and 270° about the origin (counterclockwise).
 * Wrong choices are the sign and order slips students actually make.
 */
const { M, num, par, int, pick, sample, shuffle, signed, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 4', blurb: 'Translations, reflections, rotations, compositions and symmetry, mixed.' },
  trans: { name: 'Translations', ch: '4.1', blurb: 'Vectors, rules, images, preimages, and two slides as one rule.' },
  refl: { name: 'Reflections', ch: '4.2', blurb: 'In the axes, in y = x and y = −x, in x = k and y = k.' },
  rot: { name: 'Rotations', ch: '4.3', blurb: '90°, 180° and 270° about the origin.' },
  comp: { name: 'Compositions & Rules', ch: 'Mixed', blurb: 'Two moves in a row, and which transformation did that?' },
  sym: { name: 'Symmetry & Vocab', ch: '4.2–4.3', blurb: 'Lines of symmetry, rotational symmetry, and the words.' },
};

// ---------------------------------------------------------------- points and rules

const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const vec = (a, b) => `⟨${num(a)}, ${num(b)}⟩`;
const ruleText = (a, b) => `(x, y) → (x${signed(a)}, y${signed(b)})`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
/** A point with a ≠ 0, b ≠ 0 and |a| ≠ |b| — so every rule below sends it somewhere different. */
function distinctPoint(rand, lo = -8, hi = 8) {
  for (;;) { const a = nz(rand, lo, hi); const b = nz(rand, lo, hi); if (Math.abs(a) !== Math.abs(b)) return [a, b]; }
}

const RULES = {
  rx: { name: 'a reflection in the x-axis', f: ([a, b]) => [a, -b] },
  ry: { name: 'a reflection in the y-axis', f: ([a, b]) => [-a, b] },
  ryx: { name: 'a reflection in the line y = x', f: ([a, b]) => [b, a] },
  rynx: { name: `a reflection in the line y = ${M}x`, f: ([a, b]) => [-b, -a] },
  r90: { name: 'a 90° rotation about the origin', f: ([a, b]) => [-b, a] },
  r180: { name: 'a 180° rotation about the origin', f: ([a, b]) => [-a, -b] },
  r270: { name: 'a 270° rotation about the origin', f: ([a, b]) => [b, -a] },
};
const same = (p, q) => p[0] === q[0] && p[1] === q[1];

/** Multiple choice over points: the answer first, then up to three distinct wrong points. */
function pointChoices(rand, answer, wrongs) {
  const out = [answer];
  for (const w of shuffle(rand, wrongs)) { if (out.length === 4) break; if (!out.some((p) => same(p, w))) out.push(w); }
  let guard = 0;
  while (out.length < 4 && guard++ < 50) { const w = [answer[0] + int(rand, -3, 3), answer[1] + int(rand, -3, 3)]; if (!out.some((p) => same(p, w))) out.push(w); }
  return { choices: out.map(([x, y]) => pt(x, y)), answer: 0 };
}

// ---------------------------------------------------------------- symmetry facts

const FIGURES = [
  { name: 'a square', lines: 4, rots: [90, 180] },
  { name: 'a rectangle (not a square)', lines: 2, rots: [180] },
  { name: 'a rhombus (not a square)', lines: 2, rots: [180] },
  { name: 'a parallelogram (not a rectangle or rhombus)', lines: 0, rots: [180] },
  { name: 'an isosceles trapezoid', lines: 1, rots: [] },
  { name: 'a kite (not a rhombus)', lines: 1, rots: [] },
  { name: 'a scalene triangle', lines: 0, rots: [] },
  { name: 'an isosceles triangle (not equilateral)', lines: 1, rots: [] },
  { name: 'an equilateral triangle', lines: 3, rots: [120] },
  { name: 'a regular pentagon', lines: 5, rots: [72, 144] },
  { name: 'a regular hexagon', lines: 6, rots: [60, 120, 180] },
  { name: 'a regular octagon', lines: 8, rots: [45, 90, 135, 180] },
];
const degs = (xs) => xs.map((d) => `${d}°`).join(', ');

const VOCAB = [
  { term: 'vector', def: 'a quantity that has both direction and magnitude, drawn as an arrow from an initial point to a terminal point' },
  { term: 'component form', def: 'the notation ⟨a, b⟩ that records a vector\'s horizontal change and vertical change' },
  { term: 'transformation', def: 'a function that moves or changes a figure in some way to produce a new figure' },
  { term: 'preimage', def: 'the original figure, before a transformation' },
  { term: 'image', def: 'the new figure a transformation produces, named with primes (A′, B′, C′)' },
  { term: 'rigid motion', def: 'a transformation that preserves length and angle measure, so the image is congruent to the preimage' },
  { term: 'translation', def: 'a transformation that slides every point the same distance in the same direction' },
  { term: 'reflection', def: 'a transformation that flips a figure over a line' },
  { term: 'line of reflection', def: 'the line a figure is flipped over; it is the perpendicular bisector of every segment joining a point to its image' },
  { term: 'glide reflection', def: 'a translation followed by a reflection in a line parallel to the translation vector' },
  { term: 'line symmetry', def: 'a figure has it when a reflection in some line maps the figure onto itself' },
  { term: 'rotation', def: 'a transformation that turns a figure about a fixed point' },
  { term: 'center of rotation', def: 'the fixed point a figure is turned about' },
  { term: 'angle of rotation', def: 'how far a figure is turned, measured counterclockwise unless stated otherwise' },
  { term: 'rotational symmetry', def: 'a figure has it when a rotation of 180° or less about its center maps the figure onto itself' },
];

// ---------------------------------------------------------------- templates

const T = {};

T.translate = { book: 'trans', make(rand) {
  const [x, y] = [int(rand, -9, 9), int(rand, -9, 9)]; const [a, b] = [nz(rand, -8, 8), nz(rand, -8, 8)];
  const ans = [x + a, y + b];
  return { ask: 'Find the image', prompt: `${pt(x, y)} after a translation along ${vec(a, b)}`,
    ...pointChoices(rand, ans, [[x - a, y - b], [x + b, y + a], [x + a, y - b], [x - a, y + b]]),
    tell: `add the components: (${num(x)} + ${num(a)}, ${num(y)} + ${num(b)}) = ${pt(...ans)}.` };
} };

T.vector = { book: 'trans', make(rand) {
  const [x, y] = [int(rand, -8, 8), int(rand, -8, 8)]; const [a, b] = [nz(rand, -9, 9), nz(rand, -9, 9)];
  const [x2, y2] = [x + a, y + b];
  const alt = [[-a, -b], [b, a], [a, -b], [x2, y2]];
  const choices = [vec(a, b), ...shuffle(rand, alt).map(([p, q]) => vec(p, q)).filter((s) => s !== vec(a, b)).slice(0, 3)];
  return { ask: 'Find the component form of the vector', prompt: `that translates ${pt(x, y)} to ${pt(x2, y2)}`,
    choices, answer: 0, tell: `image minus preimage: ⟨${num(x2)} ${M} ${num(x)}, ${num(y2)} ${M} ${num(y)}⟩ = ${vec(a, b)}.` };
} };

T.ruleImage = { book: 'trans', make(rand) {
  const [a, b] = [nz(rand, -9, 9), nz(rand, -9, 9)]; const [x, y] = [int(rand, -8, 8), int(rand, -8, 8)];
  const ans = [x + a, y + b];
  return { ask: 'Find the image', prompt: `of ${pt(x, y)} under the rule ${ruleText(a, b)}`,
    ...pointChoices(rand, ans, [[x - a, y - b], [x + b, y + a], [a, b], [x + a, y - b]]),
    tell: `apply the rule: x becomes ${num(x)}${signed(a)} = ${num(x + a)}, y becomes ${num(y)}${signed(b)} = ${num(y + b)}.` };
} };

T.preimage = { book: 'trans', make(rand) {
  const [a, b] = [nz(rand, -9, 9), nz(rand, -9, 9)]; const [x, y] = [int(rand, -8, 8), int(rand, -8, 8)];
  const [x2, y2] = [x + a, y + b];
  return { ask: 'Find the preimage', prompt: `Under ${ruleText(a, b)}, the image is ${pt(x2, y2)}. What was the preimage?`,
    ...pointChoices(rand, [x, y], [[x2 + a, y2 + b], [x2 - b, y2 - a], [x2 - a, y2 + b], [x2 + a, y2 - b]]),
    tell: `work backward — undo the rule: (${num(x2)} ${M} ${par(a)}, ${num(y2)} ${M} ${par(b)}) = ${pt(x, y)}.` };
} };

T.compose = { book: 'trans', make(rand) {
  const [a, b, c, d] = [nz(rand, -7, 7), nz(rand, -7, 7), nz(rand, -7, 7), nz(rand, -7, 7)];
  if (a + c === 0 && b + d === 0) return T.compose.make(rand);
  const ans = ruleText(a + c, b + d);
  const alt = [ruleText(a - c, b - d), ruleText(a + d, b + c), ruleText(a * c, b * d), ruleText(c - a, d - b)].filter((s) => s !== ans);
  return { ask: 'Write ONE rule', prompt: `for a translation along ${vec(a, b)} followed by a translation along ${vec(c, d)}`,
    choices: [ans, ...sample(rand, [...new Set(alt)], 3)], answer: 0,
    tell: `two translations in a row: add the vectors. ⟨${num(a)} + ${num(c)}, ${num(b)} + ${num(d)}⟩ = ${vec(a + c, b + d)}.` };
} };

T.distance = { book: 'trans', make(rand) {
  const trip = pick(rand, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20]]);
  const a = trip[0] * pick(rand, [1, -1]); const b = trip[1] * pick(rand, [1, -1]);
  const [x, y] = [int(rand, -6, 6), int(rand, -6, 6)];
  return { ask: 'How far does the point move?', prompt: `${pt(x, y)} is translated along ${vec(a, b)}. Give the distance.`,
    typed: trip[2], tell: `every point moves the length of the vector: √(${Math.abs(a)}² + ${Math.abs(b)}²) = √${a * a + b * b} = ${trip[2]}. Where the point starts doesn't matter.` };
} };

T.reflect = { book: 'refl', make(rand) {
  const key = pick(rand, ['rx', 'ry', 'ryx', 'rynx']); const P = distinctPoint(rand);
  const ans = RULES[key].f(P);
  const wrongs = ['rx', 'ry', 'ryx', 'rynx'].filter((k) => k !== key).map((k) => RULES[k].f(P)).concat([[-P[0], -P[1]]]);
  const how = { rx: 'in the x-axis, keep x and flip the sign of y: (a, b) → (a, −b)', ry: 'in the y-axis, keep y and flip the sign of x: (a, b) → (−a, b)',
    ryx: 'in y = x, swap the coordinates: (a, b) → (b, a)', rynx: 'in y = −x, swap AND flip both signs: (a, b) → (−b, −a)' }[key];
  return { ask: 'Find the image', prompt: `of ${pt(...P)} after ${RULES[key].name}`, ...pointChoices(rand, ans, wrongs), tell: `${how}. Image: ${pt(...ans)}.` };
} };

T.reflectLine = { book: 'refl', make(rand) {
  const vertical = rand() < 0.5; const k = nz(rand, -5, 5); const P = distinctPoint(rand, -7, 7);
  const ans = vertical ? [2 * k - P[0], P[1]] : [P[0], 2 * k - P[1]];
  const wrongs = vertical ? [[-P[0], P[1]], [P[0], 2 * k - P[1]], [2 * k + P[0], P[1]], [k, P[1]]] : [[P[0], -P[1]], [2 * k - P[0], P[1]], [P[0], 2 * k + P[1]], [P[0], k]];
  const line = vertical ? `x = ${num(k)}` : `y = ${num(k)}`;
  const d = vertical ? P[0] - k : P[1] - k;
  return { ask: 'Find the image', prompt: `of ${pt(...P)} after a reflection in the line ${line}`, ...pointChoices(rand, ans, wrongs),
    tell: `the point is ${Math.abs(d)} ${vertical ? 'unit' : 'unit'}${Math.abs(d) === 1 ? '' : 's'} ${vertical ? (d > 0 ? 'right of' : 'left of') : (d > 0 ? 'above' : 'below')} ${line}, so its image is ${Math.abs(d)} on the other side: rule (a, b) → ${vertical ? `(2k ${M} a, b)` : `(a, 2k ${M} b)`} with k = ${num(k)}. Image: ${pt(...ans)}.` };
} };

T.rotate = { book: 'rot', make(rand) {
  const key = pick(rand, ['r90', 'r180', 'r270']); const P = distinctPoint(rand);
  const ans = RULES[key].f(P);
  const wrongs = ['r90', 'r180', 'r270', 'ryx', 'rynx'].filter((k) => k !== key).map((k) => RULES[k].f(P));
  const how = { r90: '90°: (a, b) → (−b, a)', r180: '180°: (a, b) → (−a, −b)', r270: '270°: (a, b) → (b, −a)' }[key];
  return { ask: 'Find the image', prompt: `of ${pt(...P)} after ${RULES[key].name}`, ...pointChoices(rand, ans, wrongs),
    tell: `counterclockwise about the origin, ${how}. Image: ${pt(...ans)}.` };
} };

T.whichRule = { book: 'comp', make(rand) {
  const keys = Object.keys(RULES); const key = pick(rand, keys); const P = distinctPoint(rand);
  const img = RULES[key].f(P);
  const others = keys.filter((k) => k !== key && !same(RULES[k].f(P), img));
  return { ask: 'Which transformation maps', prompt: `${pt(...P)} to ${pt(...img)}?`,
    choices: [RULES[key].name, ...sample(rand, others, 3).map((k) => RULES[k].name)], answer: 0,
    tell: `${pt(...P)} → ${pt(...img)} is the rule for ${RULES[key].name}.` };
} };

T.composition = { book: 'comp', make(rand) {
  const first = pick(rand, ['rx', 'ry', 'ryx']); const second = pick(rand, ['r90', 'r180', 'r270']);
  const P = distinctPoint(rand, -7, 7);
  const mid = RULES[first].f(P); const ans = RULES[second].f(mid);
  const reversed = RULES[first].f(RULES[second].f(P));
  return { ask: 'Find the final image', prompt: `of ${pt(...P)} after ${RULES[first].name}, then ${RULES[second].name}`,
    ...pointChoices(rand, ans, [mid, reversed, RULES[second].f(P), [-ans[0], -ans[1]]]),
    tell: `do the steps in order. First ${pt(...P)} → ${pt(...mid)}, then ${pt(...mid)} → ${pt(...ans)}.${same(ans, reversed) ? '' : ` Reversing the order would give ${pt(...reversed)} — order matters.`}` };
} };

T.glide = { book: 'comp', make(rand) {
  const a = nz(rand, -7, 7); const P = distinctPoint(rand, -7, 7);
  const horizontal = rand() < 0.5; // slide along the x-axis then reflect in it (or the y-axis version)
  const mid = horizontal ? [P[0] + a, P[1]] : [P[0], P[1] + a];
  const ans = horizontal ? [mid[0], -mid[1]] : [-mid[0], mid[1]];
  const v = horizontal ? vec(a, 0) : vec(0, a); const line = horizontal ? 'x-axis' : 'y-axis';
  return { ask: 'Find the image', prompt: `of ${pt(...P)} after the glide reflection: translate along ${v}, then reflect in the ${line}`,
    ...pointChoices(rand, ans, [mid, horizontal ? [P[0] - a, -P[1]] : [-P[0], P[1] - a], horizontal ? [-mid[0], mid[1]] : [mid[0], -mid[1]], P]),
    tell: `slide first: ${pt(...P)} → ${pt(...mid)}; then flip over the ${line}: ${pt(...ans)}. A glide reflection's line is parallel to its vector, so here the order doesn't change the result.` };
} };

T.congruent = { book: 'comp', make(rand) {
  const which = pick(rand, ['a translation', 'a reflection', 'a rotation', 'a glide reflection']);
  return { ask: 'True or false', prompt: `The image of a figure after ${which} is always congruent to the preimage.`,
    choices: ['True — it is a rigid motion, so lengths and angle measures are preserved', 'False — only translations keep the figure congruent', 'False — the image is similar but larger', 'True — but only when the figure is a triangle'], answer: 0,
    tell: `translations, reflections and rotations (and their compositions) are rigid motions: they preserve length and angle measure.` };
} };

T.linesSym = { book: 'sym', make(rand) {
  const f = pick(rand, FIGURES);
  const wrong = [...new Set([f.lines + 1, f.lines + 2, Math.max(0, f.lines - 1), f.lines * 2, 0, 1, 2, 4].filter((n) => n !== f.lines))];
  return { ask: 'How many lines of symmetry?', prompt: f.name, choices: [String(f.lines), ...sample(rand, wrong, 3).map(String)], answer: 0,
    tell: f.lines === 0 ? `${f.name} cannot be folded onto itself along any line.` : f.name.includes('regular') ? `a regular n-gon has n lines of symmetry.` : f.name.includes('rectangle') ? `the two midlines only — a rectangle's diagonals are NOT lines of symmetry.` : `${f.name} has ${f.lines}.` };
} };

T.rotSym = { book: 'sym', make(rand) {
  const f = pick(rand, FIGURES);
  const ans = f.rots.length ? degs(f.rots) : 'none — no rotational symmetry';
  const pool = [...new Set([degs([180]), degs([90, 180]), degs([120]), degs([60, 120, 180]), degs([72, 144]), degs([45, 90, 135, 180]), 'none — no rotational symmetry'])].filter((s) => s !== ans);
  return { ask: 'Rotational symmetry', prompt: `Which rotations of 180° or less about its center map ${f.name} onto itself?`,
    choices: [ans, ...sample(rand, pool, 3)], answer: 0,
    tell: f.name.includes('regular') ? `a regular n-gon turns onto itself every 360°/n — list the multiples up to 180°.` : f.rots.length ? `a half-turn maps ${f.name} onto itself; no smaller turn does.` : `no turn of 180° or less maps ${f.name} onto itself.` };
} };

T.vocab = { book: 'sym', make(rand) {
  const v = pick(rand, VOCAB);
  const others = sample(rand, VOCAB.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
