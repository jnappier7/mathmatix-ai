/**
 * Chapter Review: Algebra 1 — Module 11 (Quadratic Functions, 11.1–11.6), built from Mr. Nappier's
 * guided notes, quizzes and the Module 11 practice test. Quick-fire: one move per play — the axis
 * and vertex, which way it opens, solve by factoring, square roots (both of them), the number that
 * completes the square, the quadratic formula, the discriminant, the zeros from factored form,
 * the rocket's peak, the garden.
 *
 * Wrong choices are the keys' slips: one square root instead of two (Gus), the axis at −b/a, the
 * vertex's y read from the y-intercept, a discriminant's sign misread.
 */
const { M, num, int, pick, sample, frac, makeBank, mc } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 11', blurb: 'Graphing, factoring, square roots, completing the square, the formula, applications — mixed.' },
  graph: { name: 'Graphing Quadratics', ch: '11.1', blurb: 'Axis of symmetry, vertex, y-intercept, opens up or down, zeros from factored form.' },
  factor: { name: 'Solve by Factoring', ch: '11.2–11.4', blurb: 'Set it to zero, factor, Zero Product Property.' },
  roots: { name: 'Square Roots & Completing', ch: '11.4–11.5', blurb: 'x² = k has TWO roots; the number that completes the square.' },
  formula: { name: 'Formula & Discriminant', ch: '11.6', blurb: 'b² − 4ac and what it says; the formula\'s two answers.' },
  apps: { name: 'Applications', ch: 'Mixed', blurb: 'The rocket\'s peak, the garden\'s dimensions.' },
};

const sup = (e) => `<sup>${e}</sup>`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
/** y = ax² + bx + c in standard form text. */
function quad(a, b, c, v = 'x') {
  const parts = [];
  parts.push(`${a === 1 ? '' : a === -1 ? M : num(a)}${v}${sup(2)}`);
  if (b) parts.push(`${b < 0 ? ' − ' : ' + '}${Math.abs(b) === 1 ? '' : Math.abs(b)}${v}`);
  if (c) parts.push(`${c < 0 ? ' − ' : ' + '}${Math.abs(c)}`);
  return parts.join('');
}
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const roots = (r1, r2) => { const [a, b] = [r1, r2].sort((x, y) => x - y); return a === b ? `x = ${num(a)}` : `x = ${num(a)} or x = ${num(b)}`; };
const sgn = (x) => (x < 0 ? '−' : '+');

const T = {};

T.axisVertex = { book: 'graph', make(rand) {
  const a = pick(rand, [1, 1, -1, 2]); const h = nz(rand, -5, 5); const k = nz(rand, -9, 9); // vertex (h, k)
  const b = -2 * a * h; const c = a * h * h + k; const kind = pick(rand, ['axis', 'vertex', 'yint']);
  const prompt = `y = ${quad(a, b, c)}`;
  if (kind === 'axis') return { ask: 'Find the axis of symmetry', prompt, ...mc(rand, `x = ${num(h)}`, [`x = ${num(-h)}`, `x = ${num(b)}`, `x = ${num(-b)}`, `y = ${num(k)}`]), tell: `x = −b/(2a) = ${num(-b)}/${num(2 * a)} = ${num(h)}.` };
  if (kind === 'vertex') return { ask: 'Find the vertex', prompt, ...mc(rand, pt(h, k), [pt(-h, k), pt(h, c), pt(h, -k), pt(b, c)]), tell: `x = −b/(2a) = ${num(h)}; then y = ${num(a)}(${num(h)})² ${sgn(b)} ${Math.abs(b)}(${num(h)}) ${sgn(c)} ${Math.abs(c)} = ${num(k)}.` };
  return { ask: 'Find the y-intercept', prompt, ...mc(rand, pt(0, c), [pt(0, k), pt(c, 0), pt(0, b), pt(h, k)]), tell: `set x = 0: y = ${num(c)}, the constant term.` };
} };

T.opens = { book: 'graph', make(rand) {
  const a = pick(rand, [1, 2, 3, -1, -2, -4]); const b = nz(rand, -8, 8); const c = nz(rand, -9, 9);
  return { ask: 'Opens up or down? Maximum or minimum?', prompt: `y = ${quad(a, b, c)}`,
    ...mc(rand, a > 0 ? 'opens UP — the vertex is a minimum' : 'opens DOWN — the vertex is a maximum', [a > 0 ? 'opens DOWN — the vertex is a maximum' : 'opens UP — the vertex is a minimum', 'opens UP — the vertex is a maximum', 'opens DOWN — the vertex is a minimum']),
    tell: `the sign of a decides: a = ${num(a)} is ${a > 0 ? 'positive' : 'negative'}, so it opens ${a > 0 ? 'up and the vertex is the lowest point' : 'down and the vertex is the highest point'}.` };
} };

T.zerosForm = { book: 'graph', make(rand) {
  const r1 = nz(rand, -9, 9); let r2 = nz(rand, -9, 9); while (r2 === r1 || (r1 + r2) % 2) r2 = nz(rand, -9, 9);
  const kind = rand() < 0.5 ? 'zeros' : 'axis';
  const prompt = `y = (x ${sgn(-r1)} ${Math.abs(r1)})(x ${sgn(-r2)} ${Math.abs(r2)})`;
  if (kind === 'zeros') return { ask: 'Find the zeros', prompt, ...mc(rand, roots(r1, r2), [roots(-r1, -r2), roots(r1, -r2), `x = ${num(r1 * r2)}`, roots(-r1, r2)]), tell: `each factor is zero at its own value: x = ${num(r1)} and x = ${num(r2)} (flip the signs inside the parentheses).` };
  return { ask: 'Find the axis of symmetry', prompt, typed: (r1 + r2) / 2, neg: (r1 + r2) / 2 < 0, tell: `the axis is halfway between the zeros ${num(r1)} and ${num(r2)}: x = ${num((r1 + r2) / 2)}.` };
} };

T.solveFactor = { book: 'factor', make(rand) {
  const r1 = nz(rand, -9, 9); let r2 = nz(rand, -9, 9); while (r2 === r1) r2 = nz(rand, -9, 9);
  return { ask: 'Solve by factoring', prompt: `${quad(1, -(r1 + r2), r1 * r2)} = 0`,
    ...mc(rand, roots(r1, r2), [roots(-r1, -r2), roots(r1, -r2), roots(-r1, r2), `x = ${num(r1 * r2)}`]),
    tell: `(x ${sgn(-r1)} ${Math.abs(r1)})(x ${sgn(-r2)} ${Math.abs(r2)}) = 0; Zero Product Property: ${roots(r1, r2)}.` };
} };

T.solveFactorA = { book: 'factor', make(rand) {
  const a = pick(rand, [2, 3, 5]); const p = nz(rand, -5, 5); const q = nz(rand, -6, 6); // (ax + p)(x + q) = 0 → x = −p/a, x = −q
  if (p % a === 0) return T.solveFactorA.make(rand);
  const A = a; const B = a * q + p; const C = p * q; if (B === 0) return T.solveFactorA.make(rand);
  const r1 = frac(-p, a); const r2 = num(-q);
  const show = (x, y) => `x = ${x} or x = ${y}`;
  return { ask: 'Solve by factoring', prompt: `${quad(A, B, C)} = 0`,
    ...mc(rand, show(r1, r2), [show(frac(p, a), num(q)), show(frac(-a, p), r2), show(num(-p), r2), show(r1, num(q))]),
    tell: `(${a}x ${sgn(p)} ${Math.abs(p)})(x ${sgn(q)} ${Math.abs(q)}) = 0 → ${a}x = ${num(-p)} → x = ${r1}, or x = ${r2}.` };
} };

T.squareRoots = { book: 'roots', make(rand) {
  const k = pick(rand, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); const c = pick(rand, [1, 2, 3, 5]);
  return { ask: 'Solve using square roots', prompt: `${c === 1 ? '' : c}x${sup(2)} − ${c * k * k} = 0`,
    ...mc(rand, `x = ±${k}`, [`x = ${k}`, `x = ±${c * k * k}`, `x = ±${k * k}`, `x = ${M}${k}`]),
    tell: `x² = ${k * k}, and a square root gives TWO answers: x = ${k} or x = ${M}${k}.` };
} };

T.gusError = { book: 'roots', make(rand) {
  const k = pick(rand, [5, 6, 7, 8, 9, 10, 11, 12, 13, 15]);
  return { ask: 'Error analysis', prompt: `Gus solved x${sup(2)} = ${k * k} and wrote x = ${k}. What did he miss?`,
    ...mc(rand, `the negative root — x = ±${k}`, [`nothing — x = ${k} is the full solution`, `he should have divided by 2: x = ${(k * k) / 2}`, `the answer is x = ${k * k}`]),
    tell: `square roots give two answers: (${M}${k})² = ${k * k} too. x = ±${k}.` };
} };

T.completeSquare = { book: 'roots', make(rand) {
  const h = nz(rand, -8, 8); const b = -2 * h; const kind = rand() < 0.5 ? 'number' : 'solve';
  if (kind === 'number') return { ask: 'What number completes the square?', prompt: `x${sup(2)} ${sgn(b)} ${Math.abs(b)}x + ____`, typed: h * h,
    tell: `take half of ${num(b)} and square it: (${num(b / 2)})² = ${h * h}. Then x² ${sgn(b)} ${Math.abs(b)}x + ${h * h} = (x ${sgn(-h)} ${Math.abs(h)})².` };
  const d = pick(rand, [1, 2, 3, 4, 5, 6]); const c = d * d - h * h; // x² + bx = c, add h²: (x − h)² = d² → x = h ± d
  return { ask: 'Solve by completing the square', prompt: `${quad(1, b, -c)} = 0`,
    ...mc(rand, roots(h + d, h - d), [roots(-h + d, -h - d), roots(h + d * d, h - d * d), `x = ${num(h)}`, roots(d, -d)]),
    tell: `x² ${sgn(b)} ${Math.abs(b)}x = ${num(c)}; add ${h * h} to both sides: (x ${sgn(-h)} ${Math.abs(h)})² = ${d * d} → x ${sgn(-h)} ${Math.abs(h)} = ±${d} → ${roots(h + d, h - d)}.` };
} };

T.quadFormula = { book: 'formula', make(rand) {
  const a = pick(rand, [1, 2, 3]); const p = nz(rand, -6, 6); const q = nz(rand, -6, 6); // a x² + bx + c = (ax − p)(x − q)... use roots p/a and q
  const B = -(p + a * q); const C = p * q; if (B === 0 || (a > 1 && p % a === 0)) return T.quadFormula.make(rand);
  const r1 = frac(p, a); const r2 = num(q); const disc = B * B - 4 * a * C;
  const show = (x, y) => `x = ${x} or x = ${y}`;
  return { ask: 'Solve using the quadratic formula', prompt: `${quad(a, B, C)} = 0`,
    ...mc(rand, show(r1, r2), [show(frac(-p, a), num(-q)), show(frac(p, a), num(-q)), show(num(p), r2), `x = ${frac(-B, 2 * a)}`]),
    tell: `x = (${num(-B)} ± √${disc})/${2 * a} = (${num(-B)} ± ${Math.sqrt(disc)})/${2 * a} → ${show(r1, r2)}.` };
} };

T.discriminant = { book: 'formula', make(rand) {
  const a = pick(rand, [1, 2, 3]); const b = nz(rand, -9, 9); const c = nz(rand, -9, 9); const d = b * b - 4 * a * c;
  if (rand() < 0.5) return { ask: 'Find the discriminant', prompt: `${quad(a, b, c)} = 0`, typed: d, neg: d < 0, tell: `b² − 4ac = (${num(b)})² − 4(${num(a)})(${num(c)}) = ${num(d)}.` };
  const ans = d < 0 ? 'no real solutions (discriminant negative)' : d === 0 ? 'exactly one real solution (discriminant zero)' : 'two real solutions (discriminant positive)';
  return { ask: 'How many real solutions?', prompt: `${quad(a, b, c)} = 0`, ...mc(rand, ans, ['no real solutions (discriminant negative)', 'exactly one real solution (discriminant zero)', 'two real solutions (discriminant positive)']),
    tell: `b² − 4ac = ${num(d)}, which is ${d < 0 ? 'negative' : d === 0 ? 'zero' : 'positive'} — ${ans.split(' (')[0]}.` };
} };

T.rocket = { book: 'apps', make(rand) {
  const v = pick(rand, [32, 64, 96, 128, 160]); const h0 = pick(rand, [0, 3, 5, 6, 10]); const t = v / 32; const peak = -16 * t * t + v * t + h0;
  return rand() < 0.5
    ? { ask: 'When does it reach its maximum height, in seconds?', prompt: `A rocket's height in feet after t seconds is h = −16t${sup(2)} + ${v}t${h0 ? ` + ${h0}` : ''}.`, typed: t, tell: `the peak is at the vertex: t = −b/(2a) = −${v}/(−32) = ${t} s.` }
    : { ask: 'Find the maximum height, in feet', prompt: `A rocket's height in feet after t seconds is h = −16t${sup(2)} + ${v}t${h0 ? ` + ${h0}` : ''}.`, typed: peak, tell: `t = ${t} at the vertex; h = −16(${t})² + ${v}(${t})${h0 ? ` + ${h0}` : ''} = ${peak} ft.` };
} };

T.garden = { book: 'apps', make(rand) {
  const w = int(rand, 3, 9); const d = int(rand, 2, 9); const area = w * (w + d);
  return rand() < 0.5
    ? { ask: 'Find the width, in feet', prompt: `A rectangular garden is ${d} feet longer than it is wide. Its area is ${area} square feet.`, typed: w, tell: `w(w + ${d}) = ${area} → w² + ${d}w − ${area} = 0 → (w + ${w + d})(w − ${w}) = 0 → w = ${w} (reject −${w + d}).` }
    : { ask: 'Which equation finds the width w?', prompt: `A rectangular garden is ${d} feet longer than it is wide. Its area is ${area} square feet.`,
      ...mc(rand, `w${sup(2)} + ${d}w − ${area} = 0`, [`w${sup(2)} − ${d}w − ${area} = 0`, `2w + ${d} = ${area}`, `w${sup(2)} + ${d} = ${area}`, `${d}w${sup(2)} = ${area}`]),
      tell: `length = w + ${d}, and area = w(w + ${d}) = ${area} → w² + ${d}w − ${area} = 0.` };
} };

T.vocab = { book: 'graph', make(rand) {
  const V = [
    { term: 'parabola', def: 'the U-shaped graph of a quadratic function' },
    { term: 'vertex', def: 'the highest or lowest point of a parabola, on the axis of symmetry' },
    { term: 'axis of symmetry', def: 'the vertical line x = −b/(2a) through the vertex that splits the parabola into mirror images' },
    { term: 'zeros (roots)', def: 'the x-values where the function equals 0 — the x-intercepts' },
    { term: 'Zero Product Property', def: 'if a · b = 0, then a = 0 or b = 0' },
    { term: 'discriminant', def: 'b² − 4ac — its sign tells how many real solutions there are' },
    { term: 'completing the square', def: 'adding (b/2)² to make x² + bx a perfect-square trinomial' },
    { term: 'quadratic formula', def: 'x = (−b ± √(b² − 4ac)) / (2a)' },
  ];
  const v = pick(rand, V); const others = sample(rand, V.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
