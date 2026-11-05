/**
 * Algebra 2 — the course drill, native (no Course Planner site for this course yet). One playbook
 * per unit of the standard Algebra 2 sequence, built to the common core of the course rather than
 * one teacher's packets: quadratics with complex numbers, polynomials, radicals and rational
 * exponents, exponentials and logarithms, rational expressions, function operations, sequences
 * and series. Quick-fire, one move per play, standard scoring. When a teacher's own unit packets
 * arrive, a chapter bank goes beside this one (utils/liveDrill/review/) and onto the algebra2 hub.
 *
 * Wrong choices are the classic slips: i² treated as +1, a remainder with the wrong sign, the
 * exponent multiplied instead of added, log(a + b) split, the vertical asymptote at −c, an
 * arithmetic sum with n instead of n/2.
 */
const { M, num, int, pick, sample, frac, makeBank, mc } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Course', ch: 'Alg 2', blurb: 'Every unit, mixed — quadratics and complex numbers through sequences and series.' },
  quad: { name: 'Quadratics & Complex Numbers', ch: 'Unit 1', blurb: 'Powers of i, complex arithmetic, complex roots, the discriminant, vertex form.' },
  poly: { name: 'Polynomials', ch: 'Unit 2', blurb: 'Multiply, the Remainder and Factor Theorems, sum and difference of cubes, end behavior, zeros and multiplicity.' },
  rad: { name: 'Radicals & Rational Exponents', ch: 'Unit 3', blurb: 'nth roots, 8^(2/3), radical ↔ exponent form, simplify, solve a radical equation.' },
  exp: { name: 'Exponentials & Logarithms', ch: 'Unit 4', blurb: 'Log ↔ exponential form, evaluate, expand and condense, solve with a common base, growth and decay.' },
  rational: { name: 'Rational Expressions', ch: 'Unit 5', blurb: 'Simplify, add, solve a proportion, asymptotes, excluded values.' },
  func: { name: 'Functions', ch: 'Unit 6', blurb: 'Evaluate, compose, invert a linear function, read a transformation.' },
  seq: { name: 'Sequences & Series', ch: 'Unit 7', blurb: 'Arithmetic and geometric nth terms and sums, sigma notation, the infinite geometric sum.' },
};

const sup = (e) => `<sup>${e}</sup>`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const sgn = (x) => (x < 0 ? M : '+');
/** "+ 3", "− 3" (with spaces), "" for zero */
const term = (n) => (n === 0 ? '' : ` ${sgn(n)} ${Math.abs(n)}`);
/** ax² + bx + c (a ≠ 0) */
function quad(a, b, c, v = 'x') {
  let s = `${a === 1 ? '' : a === -1 ? M : num(a)}${v}${sup(2)}`;
  if (b) s += ` ${sgn(b)} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${v}`;
  if (c) s += term(c);
  return s;
}
/** x³ + ax² + bx + c */
function cubic(a, b, c, v = 'x') {
  let s = `${v}${sup(3)}`;
  if (a) s += ` ${sgn(a)} ${Math.abs(a) === 1 ? '' : Math.abs(a)}${v}${sup(2)}`;
  if (b) s += ` ${sgn(b)} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${v}`;
  if (c) s += term(c);
  return s;
}
/** a + bi */
function cx(a, b) {
  if (b === 0) return num(a);
  const im = `${Math.abs(b) === 1 ? '' : Math.abs(b)}i`;
  if (a === 0) return `${b < 0 ? M : ''}${im}`;
  return `${num(a)} ${sgn(b)} ${im}`;
}
/** (x − r) */
const bin = (r, v = 'x') => `(${v}${term(-r)})`;
const roots = (r1, r2) => { const [a, b] = [r1, r2].sort((x, y) => x - y); return `x = ${num(a)} or x = ${num(b)}`; };

const T = {};

// ---------------------------------------------------------------- quadratics & complex numbers

T.iPowers = { book: 'quad', make(rand) {
  const n = int(rand, 2, 40); const cyc = ['1', 'i', `${M}1`, `${M}i`]; const ans = cyc[n % 4];
  return { ask: 'Simplify', prompt: `i${sup(n)}`, ...mc(rand, ans, cyc.filter((c) => c !== ans)),
    tell: `powers of i repeat every 4: i, −1, −i, 1. ${n} = 4·${Math.floor(n / 4)} + ${n % 4}, so i${sup(n)} = i${sup(n % 4)} = ${ans}.` };
} };

T.complexAdd = { book: 'quad', make(rand) {
  const a = nz(rand, -9, 9); const b = nz(rand, -9, 9); const c = nz(rand, -9, 9); const d = nz(rand, -9, 9);
  const sub = rand() < 0.5;
  const re = sub ? a - c : a + c; const im = sub ? b - d : b + d;
  return { ask: sub ? 'Subtract' : 'Add', prompt: `(${cx(a, b)}) ${sub ? M : '+'} (${cx(c, d)})`,
    ...mc(rand, cx(re, im), [cx(sub ? a + c : a - c, sub ? b + d : b - d), cx(re, sub ? b + d : b - d), cx(im, re), cx(re, -im)]),
    tell: `${sub ? 'subtract' : 'add'} the real parts and the imaginary parts separately: (${num(a)} ${sub ? M : '+'} ${num(c) < 0 ? `(${num(c)})` : num(c)}) + (${num(b)} ${sub ? M : '+'} ${num(d) < 0 ? `(${num(d)})` : num(d)})i = ${cx(re, im)}.` };
} };

T.complexMul = { book: 'quad', make(rand) {
  const a = nz(rand, -5, 5); const b = nz(rand, -5, 5); const c = nz(rand, -5, 5); const d = nz(rand, -5, 5);
  const re = a * c - b * d; const im = a * d + b * c;
  return { ask: 'Multiply', prompt: `(${cx(a, b)})(${cx(c, d)})`,
    ...mc(rand, cx(re, im), [cx(a * c + b * d, im), cx(re, a * d - b * c), cx(a * c, b * d), cx(im, re)]),
    tell: `FOIL, then i² = −1: ${a * c} + ${num(a * d)}i + ${num(b * c)}i + ${num(b * d)}i² = ${a * c} ${sgn(-b * d)} ${Math.abs(b * d)} + ${num(im)}i = ${cx(re, im)}.` };
} };

T.complexRoots = { book: 'quad', make(rand) {
  const k = pick(rand, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  if (rand() < 0.5) {
    return { ask: 'Solve', prompt: `x${sup(2)} + ${k * k} = 0`,
      ...mc(rand, `x = ±${k}i`, [`x = ±${k}`, `x = ${k}i`, `x = ±${k * k}i`, `no solution`]),
      tell: `x² = −${k * k}, so x = ±√(−${k * k}) = ±${k}i.` };
  }
  const h = nz(rand, -6, 6);
  return { ask: 'Solve', prompt: `(x${term(-h)})${sup(2)} = ${M}${k * k}`,
    ...mc(rand, `x = ${num(h)} ± ${k}i`, [`x = ${num(-h)} ± ${k}i`, `x = ${num(h)} ± ${k}`, `x = ±${k}i`, `x = ${num(h)} ± ${k * k}i`]),
    tell: `take the root of both sides: x${term(-h)} = ±${k}i, so x = ${num(h)} ± ${k}i.` };
} };

T.discriminantType = { book: 'quad', make(rand) {
  const a = pick(rand, [1, 1, 2, 3]); const b = nz(rand, -9, 9); const c = nz(rand, -9, 9); const d = b * b - 4 * a * c;
  if (rand() < 0.4) return { ask: 'Find the discriminant', prompt: `${quad(a, b, c)} = 0`, typed: d, neg: d < 0, tell: `b² − 4ac = (${num(b)})² − 4(${num(a)})(${num(c)}) = ${num(d)}.` };
  const kinds = ['two real solutions', 'one real solution (a double root)', 'two complex (non-real) solutions'];
  const ans = d > 0 ? kinds[0] : d === 0 ? kinds[1] : kinds[2];
  return { ask: 'What kind of solutions?', prompt: `${quad(a, b, c)} = 0`, ...mc(rand, ans, kinds.filter((k) => k !== ans)),
    tell: `b² − 4ac = ${num(d)}, which is ${d > 0 ? 'positive' : d === 0 ? 'zero' : 'negative'}: ${ans}.` };
} };

T.vertexForm = { book: 'quad', make(rand) {
  const a = pick(rand, [1, 1, -1, 2, -2, 3]); const h = nz(rand, -6, 6); const k = nz(rand, -9, 9);
  const pt = (x, y) => `(${num(x)}, ${num(y)})`;
  if (rand() < 0.5) {
    return { ask: 'Find the vertex', prompt: `y = ${a === 1 ? '' : a === -1 ? M : num(a)}(x${term(-h)})${sup(2)}${term(k)}`,
      ...mc(rand, pt(h, k), [pt(-h, k), pt(h, -k), pt(-h, -k), pt(k, h)]), tell: `vertex form y = a(x − h)² + k has its vertex at (h, k): the sign inside flips, so (${num(h)}, ${num(k)}).` };
  }
  // standard form with a = 1 and an even b, so the vertex is integer: y = x² + bx + c, h = −b/2, k = c − h²
  const b = -2 * h; const c = k + h * h;
  return { ask: 'Find the vertex', prompt: `y = ${quad(1, b, c)}`,
    ...mc(rand, pt(h, k), [pt(-h, k), pt(h, c), pt(b, c), pt(h, -k)]),
    tell: `x = −b/(2a) = ${num(-b)}/2 = ${num(h)}; y = (${num(h)})² ${sgn(b)} ${Math.abs(b)}(${num(h)})${term(c)} = ${num(k)}. Vertex (${num(h)}, ${num(k)}).` };
} };

T.completeSquare = { book: 'quad', make(rand) {
  const h = nz(rand, -7, 7); const b = -2 * h; const d = pick(rand, [1, 2, 3, 4, 5]);
  if (Math.abs(h) === d) return T.completeSquare.make(rand); // c would be 0: "x² − 2x = 0" isn't a completing-the-square prompt
  if (rand() < 0.5) {
    const c = h * h - d * d; // (x − h)² = d² → x = h ± d
    return { ask: 'Solve by completing the square', prompt: `${quad(1, b, c)} = 0`,
      ...mc(rand, roots(h + d, h - d), [roots(-h + d, -h - d), roots(h + d * d, h - d * d), `x = ${num(h)}`, roots(d, -d)]),
      tell: `x² ${sgn(b)} ${Math.abs(b)}x = ${num(-c)}; add (${num(b / 2)})² = ${h * h}: (x${term(-h)})² = ${d * d}, so x = ${num(h)} ± ${d}: ${roots(h + d, h - d)}.` };
  }
  const c = h * h + d * d; // (x − h)² = −d² → x = h ± di
  return { ask: 'Solve by completing the square', prompt: `${quad(1, b, c)} = 0`,
    ...mc(rand, `x = ${num(h)} ± ${d === 1 ? '' : d}i`, [`x = ${num(-h)} ± ${d === 1 ? '' : d}i`, `x = ${num(h)} ± ${d}`, roots(h + d, h - d), `x = ±${d === 1 ? '' : d}i`]),
    tell: `x² ${sgn(b)} ${Math.abs(b)}x = ${M}${c}; add ${h * h}: (x${term(-h)})² = ${M}${d * d}, so x${term(-h)} = ±${d === 1 ? '' : d}i and x = ${num(h)} ± ${d === 1 ? '' : d}i.` };
} };

// ---------------------------------------------------------------- polynomials

T.multiplyPoly = { book: 'poly', make(rand) {
  const a = nz(rand, -5, 5); const b = nz(rand, -5, 5); const c = nz(rand, -6, 6); // (x + a)(x² + bx + c)
  const A = a + b; const B = a * b + c; const C = a * c;
  return { ask: 'Multiply', prompt: `(x${term(a)})(${quad(1, b, c)})`,
    ...mc(rand, cubic(A, B, C), [cubic(A, a * b - c, C), cubic(a * b, B, C), cubic(A, B, -C), cubic(A, c, C)]),
    tell: `distribute x then ${num(a)}: x³ ${sgn(b)} ${Math.abs(b)}x² ${sgn(c)} ${Math.abs(c)}x, plus ${num(a)}x² ${sgn(a * b)} ${Math.abs(a * b)}x ${sgn(a * c)} ${Math.abs(a * c)}; combine: ${cubic(A, B, C)}.` };
} };

T.remainder = { book: 'poly', make(rand) {
  const a = nz(rand, -5, 5); const b = nz(rand, -7, 7); const c = nz(rand, -9, 9); const r = nz(rand, -3, 3);
  const rem = r * r * r + a * r * r + b * r + c;
  return { ask: 'Find the remainder', prompt: `(${cubic(a, b, c)}) ÷ ${bin(r)}`, typed: rem, neg: rem < 0,
    tell: `Remainder Theorem: the remainder is p(${num(r)}) = (${num(r)})³ ${sgn(a)} ${Math.abs(a)}(${num(r)})² ${sgn(b)} ${Math.abs(b)}(${num(r)})${term(c)} = ${num(rem)}.` };
} };

T.factorTheorem = { book: 'poly', make(rand) {
  const rs = sample(rand, [-4, -3, -2, -1, 1, 2, 3, 4], 3); const [r1, r2, r3] = rs;
  const a = -(r1 + r2 + r3); const b = r1 * r2 + r1 * r3 + r2 * r3; const c = -r1 * r2 * r3;
  const wrong = [-r1, -r2, -r3, 5, -5, 6, -6].filter((w) => !rs.includes(w));
  return { ask: 'Which is a factor?', prompt: `p(x) = ${cubic(a, b, c)}`,
    ...mc(rand, bin(r1), sample(rand, wrong, 3).map((w) => bin(w))),
    tell: `Factor Theorem: (x − k) is a factor exactly when p(k) = 0. p(${num(r1)}) = 0, so ${bin(r1)} is a factor — in fact p(x) = ${bin(r1)}${bin(r2)}${bin(r3)}.` };
} };

T.cubes = { book: 'poly', make(rand) {
  const a = pick(rand, [1, 2, 3, 4, 5]); const plus = rand() < 0.5; // x³ ± a³
  const ans = `(x ${plus ? '+' : M} ${a})(x${sup(2)} ${plus ? M : '+'} ${a === 1 ? '' : a}x + ${a * a})`;
  return { ask: 'Factor', prompt: `x${sup(3)} ${plus ? '+' : M} ${a * a * a}`,
    ...mc(rand, ans, [`(x ${plus ? '+' : M} ${a})(x${sup(2)} ${plus ? '+' : M} ${a === 1 ? '' : a}x + ${a * a})`, `(x ${plus ? '+' : M} ${a})(x${sup(2)} ${plus ? M : '+'} ${a === 1 ? '' : a}x ${plus ? M : '+'} ${a * a})`, `(x ${plus ? '+' : M} ${a})${sup(3)}`, `(x ${plus ? '+' : M} ${a})(x${sup(2)} + ${a * a})`]),
    tell: `${plus ? 'sum' : 'difference'} of cubes: a³ ${plus ? '+' : M} b³ = (a ${plus ? '+' : M} b)(a² ${plus ? M : '+'} ab + b²), with b = ${a}. The middle sign flips; the last term is always +.` };
} };

T.endBehavior = { book: 'poly', make(rand) {
  const n = pick(rand, [2, 3, 4, 5, 6]); const a = pick(rand, [1, 2, 3, -1, -2, -3]);
  const b = nz(rand, -9, 9); const c = nz(rand, -9, 9);
  const up = a > 0; const even = n % 2 === 0;
  const left = even ? (up ? '+∞' : '−∞') : (up ? '−∞' : '+∞'); const right = up ? '+∞' : '−∞';
  const say = (l, r) => `as x → −∞, f(x) → ${l}; as x → +∞, f(x) → ${r}`;
  const all = [say('+∞', '+∞'), say('−∞', '−∞'), say('−∞', '+∞'), say('+∞', '−∞')];
  const ans = say(left, right);
  return { ask: 'End behavior?', prompt: `f(x) = ${a === 1 ? '' : a === -1 ? M : num(a)}x${sup(n)} ${sgn(b)} ${Math.abs(b)}x${term(c)}`,
    ...mc(rand, ans, all.filter((s) => s !== ans)),
    tell: `only the leading term matters: degree ${n} is ${even ? 'even, so both ends go the same way' : 'odd, so the ends go opposite ways'}; the leading coefficient ${num(a)} is ${up ? 'positive, so the right end rises' : 'negative, so the right end falls'}.` };
} };

T.multiplicity = { book: 'poly', make(rand) {
  const a = nz(rand, -6, 6); let b = nz(rand, -6, 6); while (b === a) b = nz(rand, -6, 6);
  const say = (t, c) => `x = ${num(t)} (touches, multiplicity 2) and x = ${num(c)} (crosses)`;
  return { ask: 'Zeros, and how the graph meets the x-axis there', prompt: `p(x) = ${bin(a)}${sup(2)}${bin(b)}`,
    ...mc(rand, say(a, b), [say(b, a), say(-a, -b), `x = ${num(a)} and x = ${num(b)}, both cross`, `x = ${num(-a)} (touches) and x = ${num(-b)} (crosses)`]),
    tell: `a squared factor gives a zero of multiplicity 2, where the graph touches and turns; a single factor crosses. Zeros flip the sign inside: ${num(a)} and ${num(b)}.` };
} };

T.divide = { book: 'poly', make(rand) {
  const a = nz(rand, -7, 7); let b = nz(rand, -7, 7); while (b === a) b = nz(rand, -7, 7); // (x + a)(x + b) ÷ (x + a) = x + b
  return { ask: 'Divide', prompt: `(${quad(1, a + b, a * b)}) ÷ (x${term(a)})`,
    ...mc(rand, `x${term(b)}`, [`x${term(-b)}`, `x${term(a)}`, `x${term(a + b)}`, `x${term(-a)}`]),
    tell: `${quad(1, a + b, a * b)} = (x${term(a)})(x${term(b)}), so dividing by (x${term(a)}) leaves x${term(b)}.` };
} };

// ---------------------------------------------------------------- radicals & rational exponents

T.nthRoot = { book: 'rad', make(rand) {
  const n = pick(rand, [3, 3, 4, 5]); const k = pick(rand, n === 5 ? [2, 3] : n === 4 ? [2, 3, 4] : [2, 3, 4, 5, 6]);
  const r = { 3: '∛', 4: '∜', 5: `${sup(5)}√` }[n];
  if (rand() < 0.5) return { ask: 'Evaluate', prompt: `${r}${k ** n}`, typed: k, tell: `${k}${sup(n)} = ${k ** n}, so the ${n === 3 ? 'cube' : `${n}th`} root of ${k ** n} is ${k}.` };
  const m = pick(rand, n === 3 ? [2, 3, 5, 6, 7, 10] : [2, 3, 5, 6, 7]);
  return { ask: 'Simplify', prompt: `${r}${k ** n * m}`, ...mc(rand, `${k}${r}${m}`, [`${k ** n}${r}${m}`, `${k}${r}${k * m}`, `${r}${k * m}`, `${k * m}`]),
    tell: `${k ** n * m} = ${k}${sup(n)} · ${m}; the perfect ${n === 3 ? 'cube' : `${n}th power`} comes out: ${k}${r}${m}.` };
} };

T.rationalExp = { book: 'rad', make(rand) {
  const cases = [[8, 2, 3], [8, 4, 3], [16, 3, 4], [16, 3, 2], [27, 2, 3], [27, 4, 3], [32, 3, 5], [32, 2, 5], [81, 3, 4], [4, 3, 2], [4, 5, 2], [25, 3, 2], [9, 3, 2], [64, 2, 3], [64, 5, 6], [125, 2, 3], [100, 3, 2]];
  const [b, p, q] = pick(rand, cases); const root = Math.round(b ** (1 / q)); const v = root ** p;
  return { ask: 'Evaluate', prompt: `${b}${sup(`${p}/${q}`)}`, typed: v, tell: `the denominator is the root, the numerator the power: (${q === 2 ? '√' : q === 3 ? '∛' : `${sup(q)}√`}${b})${sup(p)} = ${root}${sup(p)} = ${v}.` };
} };

T.radicalForm = { book: 'rad', make(rand) {
  const p = pick(rand, [2, 3, 4, 5]); const q = pick(rand, [2, 3, 4, 5]); if (p === q) return T.radicalForm.make(rand);
  const r = q === 2 ? '√' : q === 3 ? '∛' : q === 4 ? '∜' : `${sup(5)}√`;
  const radical = `(${r}x)${sup(p)}`; const expo = `x${sup(`${p}/${q}`)}`;
  const rq = p === 2 ? '√' : p === 3 ? '∛' : p === 4 ? '∜' : `${sup(5)}√`;
  return rand() < 0.5
    ? { ask: 'Write with a rational exponent', prompt: radical, ...mc(rand, expo, [`x${sup(`${q}/${p}`)}`, `x${sup(p * q)}`, `x${sup(`${p}${q}`)}`, `x${sup(`1/${p * q}`)}`]), tell: `the index of the root goes in the denominator, the power in the numerator: ${expo}.` }
    : { ask: 'Write in radical form', prompt: expo, ...mc(rand, radical, [`(${rq}x)${sup(q)}`, `${r}(${p}x)`, `${p}${r}x`, `(${r}x)${sup(p * q)}`]), tell: `x${sup(`${p}/${q}`)} means the ${q}th root, raised to the ${p}: ${radical}.` };
} };

T.radicalEq = { book: 'rad', make(rand) {
  const b = int(rand, 2, 9); const a = nz(rand, -9, 9); const x = b * b - a;
  if (rand() < 0.5) return { ask: 'Solve', prompt: `√(x${term(a)}) = ${b}`, typed: x, neg: x < 0, tell: `square both sides: x${term(a)} = ${b * b}, so x = ${num(x)}. Check: √(${num(x)}${term(a)}) = √${b * b} = ${b} ✓.` };
  const d = int(rand, 1, 6); // √(x + a) + d = b + d: isolate the root before squaring
  return { ask: 'Solve', prompt: `√(x${term(a)}) + ${d} = ${b + d}`, typed: x, neg: x < 0, tell: `isolate the root first: √(x${term(a)}) = ${b}; square: x${term(a)} = ${b * b}; x = ${num(x)}.` };
} };

T.simplifyRad = { book: 'rad', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 6, 7]); const b = pick(rand, [2, 3, 5, 6, 7, 10, 11]);
  const r = `√${a * a * b}`;
  return { ask: 'Simplify', prompt: r, ...mc(rand, `${a}√${b}`, [`${b}√${a}`, `${a * a}√${b}`, `${a}√${a * b}`, `${a * b}`]),
    tell: `${a * a * b} = ${a * a} · ${b}, and √${a * a} = ${a}: ${a}√${b}.` };
} };

// ---------------------------------------------------------------- exponentials & logarithms

T.logConvert = { book: 'exp', make(rand) {
  const b = pick(rand, [2, 3, 4, 5, 10]); const y = int(rand, 1, 4); const x = b ** y;
  const logf = `log<sub>${b}</sub> ${x} = ${y}`; const expf = `${b}${sup(y)} = ${x}`;
  return rand() < 0.5
    ? { ask: 'Write in exponential form', prompt: logf, ...mc(rand, expf, [`${b}${sup(x)} = ${y}`, `${y}${sup(b)} = ${x}`, `${x}${sup(y)} = ${b}`, `${b}${sup(y)} = ${y}`]), tell: `log<sub>b</sub> x = y means b${sup('y')} = x: ${expf}.` }
    : { ask: 'Write in logarithmic form', prompt: expf, ...mc(rand, logf, [`log<sub>${b}</sub> ${y} = ${x}`, `log<sub>${x}</sub> ${b} = ${y}`, `log<sub>${y}</sub> ${x} = ${b}`, `log<sub>${b}</sub> ${x} = ${b}`]), tell: `b${sup('y')} = x means log<sub>b</sub> x = y: the base stays the base, the exponent is the answer.` };
} };

T.logEval = { book: 'exp', make(rand) {
  const b = pick(rand, [2, 2, 3, 4, 5, 10]); const k = int(rand, 1, b === 2 ? 6 : b === 3 ? 4 : 3);
  const kind = pick(rand, ['pos', 'pos', 'neg', 'one']);
  if (kind === 'one') return { ask: 'Evaluate', prompt: `log<sub>${b}</sub> 1`, typed: 0, tell: `${b}${sup(0)} = 1, so log<sub>${b}</sub> 1 = 0 — any base.` };
  if (kind === 'neg') return { ask: 'Evaluate', prompt: `log<sub>${b}</sub> (1/${b ** k})`, typed: -k, neg: true, tell: `1/${b ** k} = ${b}${sup(`−${k}`)}, so the log is ${M}${k}.` };
  return { ask: 'Evaluate', prompt: `log<sub>${b}</sub> ${b ** k}`, typed: k, tell: `${b}${sup(k)} = ${b ** k}, so log<sub>${b}</sub> ${b ** k} = ${k}.` };
} };

T.logProps = { book: 'exp', make(rand) {
  const k = pick(rand, [2, 3, 4, 5]);
  if (rand() < 0.5) {
    const ans = `log x + ${k} log y`;
    return { ask: 'Expand', prompt: `log(xy${sup(k)})`, ...mc(rand, ans, [`${k} log x + ${k} log y`, `log x · ${k} log y`, `(log x)(log y)${sup(k)}`, `log x + log y${sup(k)} + ${k}`]),
      tell: `a product becomes a sum, and a power becomes a coefficient: log x + log y${sup(k)} = ${ans}.` };
  }
  const ans = `log(x${sup(k)}/y)`;
  return { ask: 'Condense', prompt: `${k} log x − log y`, ...mc(rand, ans, [`log(${k}x/y)`, `log(x${sup(k)} − y)`, `log(${k}x − y)`, `log(x${sup(k)}y)`]),
    tell: `the coefficient becomes a power and a difference becomes a quotient: log x${sup(k)} − log y = ${ans}.` };
} };

T.expEq = { book: 'exp', make(rand) {
  const b = pick(rand, [2, 3, 5]); const a = nz(rand, -4, 4); const c = int(rand, 1, b === 2 ? 7 : 4); const x = c - a;
  return { ask: 'Solve', prompt: `${b}${sup(`x${term(a)}`)} = ${b ** c}`, typed: x, neg: x < 0,
    tell: `write ${b ** c} as ${b}${sup(c)}; same base, so the exponents are equal: x${term(a)} = ${c}, x = ${num(x)}.` };
} };

T.logEq = { book: 'exp', make(rand) {
  const b = pick(rand, [2, 3, 4, 5]); const k = int(rand, 1, b === 2 ? 5 : 3); const a = nz(rand, -9, 9); const x = b ** k + a;
  if (rand() < 0.4) return { ask: 'Solve', prompt: `log<sub>${b}</sub> x = ${k}`, typed: b ** k, tell: `rewrite: x = ${b}${sup(k)} = ${b ** k}.` };
  return { ask: 'Solve', prompt: `log<sub>${b}</sub> (x${term(-a)}) = ${k}`, typed: x, neg: x < 0,
    tell: `rewrite: x${term(-a)} = ${b}${sup(k)} = ${b ** k}, so x = ${num(x)}. Check the argument: ${num(x)}${term(-a)} = ${b ** k} > 0 ✓.` };
} };

T.growthDecay = { book: 'exp', make(rand) {
  const P = pick(rand, [100, 200, 500, 1000, 2500]); const r = pick(rand, [2, 3, 5, 8, 10, 12, 15, 20, 25]); const grow = rand() < 0.5;
  const factor = grow ? 1 + r / 100 : 1 - r / 100;
  const show = (f) => (Math.round(f * 100) / 100).toString();
  const ans = `${grow ? 'growth' : 'decay'} at ${r}% per year`;
  return { ask: 'Growth or decay, and the rate?', prompt: `A = ${P}(${show(factor)})${sup('t')}`,
    ...mc(rand, ans, [`${grow ? 'decay' : 'growth'} at ${r}% per year`, `${grow ? 'growth' : 'decay'} at ${show(factor)}% per year`, `${grow ? 'growth' : 'decay'} at ${100 - r}% per year`, `${grow ? 'decay' : 'growth'} at ${100 - r}% per year`]),
    tell: `the base is 1 ${grow ? '+' : M} r: ${show(factor)} = 1 ${grow ? '+' : M} ${show(r / 100)}, so r = ${r}% and it is ${grow ? 'growth (base above 1)' : 'decay (base below 1)'}.` };
} };

// ---------------------------------------------------------------- rational expressions

T.simplifyRational = { book: 'rational', make(rand) {
  const a = nz(rand, -7, 7); let b = nz(rand, -7, 7); while (b === a) b = nz(rand, -7, 7);
  const kind = rand() < 0.5 ? 'diff' : 'tri';
  if (kind === 'diff') {
    const k = Math.abs(a);
    return { ask: 'Simplify', prompt: `(x${sup(2)} − ${k * k}) / (x${term(-k)})`, ...mc(rand, `x + ${k}`, [`x − ${k}`, `x${sup(2)} + ${k}`, `x − ${k * k}`, `${k}`]),
      tell: `x² − ${k * k} = (x − ${k})(x + ${k}); cancel (x − ${k}): x + ${k} (for x ≠ ${k}).` };
  }
  return { ask: 'Simplify', prompt: `(${quad(1, a + b, a * b)}) / (x${term(a)})`, ...mc(rand, `x${term(b)}`, [`x${term(-b)}`, `x${term(a)}`, `x${term(a + b)}`, `${num(b)}`]),
    tell: `factor the top: (x${term(a)})(x${term(b)}); cancel (x${term(a)}): x${term(b)}.` };
} };

T.rationalAdd = { book: 'rational', make(rand) {
  const a = int(rand, 1, 6); const b = int(rand, 1, 6); const c = int(rand, 1, 6); // a/x + b/(x + c) = ((a + b)x + ac) / (x(x + c))
  const top = `${a + b}x + ${a * c}`;
  return { ask: 'Add', prompt: `${a}/x + ${b}/(x + ${c})`, ...mc(rand, `(${top}) / (x(x + ${c}))`, [`${a + b}/(x + ${c})`, `(${a + b}x + ${b * c}) / (x(x + ${c}))`, `${a + b}/(2x + ${c})`, `(${a * b}x + ${a * c}) / (x(x + ${c}))`]),
    tell: `common denominator x(x + ${c}): ${a}(x + ${c}) + ${b}x = ${a}x + ${a * c} + ${b}x = ${top}.` };
} };

T.proportion = { book: 'rational', make(rand) {
  const b = int(rand, 2, 9); const x = nz(rand, -12, 12); const k = int(rand, 2, 6); const a = k * x; const c = k * b; // a/x = c/b, both sides equal k
  if (a === 0) return T.proportion.make(rand);
  return { ask: 'Solve', prompt: `${num(a)}/x = ${c}/${b}`, typed: x, neg: x < 0,
    tell: `cross-multiply: ${num(a)} · ${b} = ${c}x, so x = ${num(a * b)}/${c} = ${num(x)}.` };
} };

T.asymptotes = { book: 'rational', make(rand) {
  const a = pick(rand, [1, 2, 3, -1, -2, 4]); const b = nz(rand, -9, 9); const c = nz(rand, -8, 8);
  const say = (v, h) => `vertical x = ${num(v)}, horizontal y = ${num(h)}`;
  return { ask: 'Asymptotes?', prompt: `f(x) = (${a === 1 ? '' : a === -1 ? M : num(a)}x${term(b)}) / (x${term(-c)})`,
    ...mc(rand, say(c, a), [say(-c, a), say(c, b), say(c, -a), say(b, c)]),
    tell: `vertical where the denominator is 0: x = ${num(c)}; same degree top and bottom, so the horizontal asymptote is the ratio of leading coefficients: y = ${num(a)}/1 = ${num(a)}.` };
} };

T.excluded = { book: 'rational', make(rand) {
  const a = nz(rand, -8, 8); let b = nz(rand, -8, 8); while (b === a) b = nz(rand, -8, 8);
  const say = (p, q) => { const [m, n] = [p, q].sort((s, t) => s - t); return `x ≠ ${num(m)}, x ≠ ${num(n)}`; };
  return { ask: 'Excluded values (domain restrictions)?', prompt: `f(x) = (x + 1) / (${quad(1, -(a + b), a * b)})`,
    ...mc(rand, say(a, b), [say(-a, -b), `x ≠ ${M}1`, say(a, -b), `x ≠ ${num(a * b)}`]),
    tell: `the denominator factors as ${bin(a)}${bin(b)} and can't be 0: x ≠ ${num(a)} and x ≠ ${num(b)}.` };
} };

// ---------------------------------------------------------------- functions

T.evalFunction = { book: 'func', make(rand) {
  const a = nz(rand, -6, 6); const b = nz(rand, -9, 9); const k = nz(rand, -5, 5); const v = k * k + a * k + b;
  return { ask: 'Evaluate', prompt: `f(x) = ${quad(1, a, b)}. Find f(${num(k)}).`, typed: v, neg: v < 0,
    tell: `f(${num(k)}) = (${num(k)})² ${sgn(a)} ${Math.abs(a)}(${num(k)})${term(b)} = ${k * k} ${sgn(a * k)} ${Math.abs(a * k)}${term(b)} = ${num(v)}.` };
} };

T.compose = { book: 'func', make(rand) {
  const a = nz(rand, -4, 4); const b = nz(rand, -6, 6); const c = nz(rand, -5, 5); const k = nz(rand, -4, 4);
  const g = (x) => x * x + c; const f = (x) => a * x + b;
  const fg = rand() < 0.5;
  const v = fg ? f(g(k)) : g(f(k));
  return { ask: 'Evaluate the composition', prompt: `f(x) = ${a === 1 ? '' : a === -1 ? M : num(a)}x${term(b)}, g(x) = x${sup(2)}${term(c)}. Find ${fg ? 'f(g(' : 'g(f('}${num(k)})).`, typed: v, neg: v < 0,
    tell: fg ? `inside first: g(${num(k)}) = ${k * k}${term(c)} = ${num(g(k))}; then f(${num(g(k))}) = ${num(a)}(${num(g(k))})${term(b)} = ${num(v)}.`
      : `inside first: f(${num(k)}) = ${num(a)}(${num(k)})${term(b)} = ${num(f(k))}; then g(${num(f(k))}) = (${num(f(k))})²${term(c)} = ${num(v)}.` };
} };

T.inverse = { book: 'func', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, -2, -3]); const b = nz(rand, -9, 9);
  const ans = `f${sup('−1')}(x) = (x${term(-b)}) / ${num(a)}`;
  return { ask: 'Find the inverse', prompt: `f(x) = ${num(a)}x${term(b)}`,
    ...mc(rand, ans, [`f${sup('−1')}(x) = (x${term(b)}) / ${num(a)}`, `f${sup('−1')}(x) = ${num(a)}x${term(-b)}`, `f${sup('−1')}(x) = 1 / (${num(a)}x${term(b)})`, `f${sup('−1')}(x) = x/${num(a)}${term(b)}`]),
    tell: `swap x and y, then solve: x = ${num(a)}y${term(b)} → ${num(a)}y = x${term(-b)} → y = (x${term(-b)}) / ${num(a)}.` };
} };

T.transform = { book: 'func', make(rand) {
  const h = nz(rand, -6, 6); const k = nz(rand, -6, 6);
  const say = (dx, dy) => `${dx > 0 ? 'right' : 'left'} ${Math.abs(dx)}, ${dy > 0 ? 'up' : 'down'} ${Math.abs(dy)}`;
  return { ask: 'How is g shifted from f?', prompt: `g(x) = f(x${term(-h)})${term(k)}`,
    ...mc(rand, say(h, k), [say(-h, k), say(h, -k), say(-h, -k), say(k, h)]),
    tell: `inside the parentheses moves it sideways and backwards (x − ${num(h)} is ${h > 0 ? 'right' : 'left'} ${Math.abs(h)}); outside moves it ${k > 0 ? 'up' : 'down'} ${Math.abs(k)}.` };
} };

// ---------------------------------------------------------------- sequences & series

T.arithNth = { book: 'seq', make(rand) {
  const a1 = nz(rand, -10, 10); const d = nz(rand, -6, 6); const n = int(rand, 5, 30); const an = a1 + (n - 1) * d;
  const first = [0, 1, 2, 3].map((i) => num(a1 + i * d)).join(', ');
  return { ask: `Find the ${n}th term`, prompt: `${first}, …`, typed: an, neg: an < 0,
    tell: `arithmetic, d = ${num(d)}: a<sub>n</sub> = a<sub>1</sub> + (n − 1)d = ${num(a1)} + ${n - 1}(${num(d)}) = ${num(an)}.` };
} };

T.arithSum = { book: 'seq', make(rand) {
  const a1 = nz(rand, -8, 8); const d = nz(rand, -5, 5); const n = pick(rand, [10, 12, 20, 24, 30, 40]); const an = a1 + (n - 1) * d; const S = (n * (a1 + an)) / 2;
  const first = [0, 1, 2].map((i) => num(a1 + i * d)).join(', ');
  return { ask: `Sum of the first ${n} terms`, prompt: `${first}, …`, typed: S, neg: S < 0,
    tell: `a<sub>${n}</sub> = ${num(a1)} + ${n - 1}(${num(d)}) = ${num(an)}; S<sub>n</sub> = n(a<sub>1</sub> + a<sub>n</sub>)/2 = ${n}(${num(a1)} ${sgn(an)} ${Math.abs(an)})/2 = ${num(S)}.` };
} };

T.geoNth = { book: 'seq', make(rand) {
  const a1 = pick(rand, [1, 2, 3, 4, 5, -2, -3]); const r = pick(rand, [2, 3, -2]); const n = int(rand, 4, 7); const an = a1 * r ** (n - 1);
  const first = [0, 1, 2].map((i) => num(a1 * r ** i)).join(', ');
  return { ask: `Find the ${n}th term`, prompt: `${first}, …`, typed: an, neg: an < 0,
    tell: `geometric, r = ${num(r)}: a<sub>n</sub> = a<sub>1</sub>·r${sup('n−1')} = ${num(a1)}(${num(r)})${sup(n - 1)} = ${num(an)}.` };
} };

T.geoSum = { book: 'seq', make(rand) {
  const a1 = pick(rand, [1, 2, 3, 4, 5]); const r = pick(rand, [2, 3]); const n = int(rand, 4, 7); const S = (a1 * (r ** n - 1)) / (r - 1);
  const first = [0, 1, 2].map((i) => num(a1 * r ** i)).join(', ');
  return { ask: `Sum of the first ${n} terms`, prompt: `${first}, …`, typed: S,
    tell: `S<sub>n</sub> = a<sub>1</sub>(r${sup('n')} − 1)/(r − 1) = ${a1}(${r}${sup(n)} − 1)/${r - 1} = ${a1}(${r ** n - 1})/${r - 1} = ${S}.` };
} };

T.infGeoSum = { book: 'seq', make(rand) {
  const R = [[1, 2, 2], [1, 3, 3], [1, 4, 4], [2, 3, 3], [-1, 2, 2]]; // r = p/q, 1 − r = (q − p)/q, S = a1·q/(q − p)
  const [p, q] = pick(rand, R); const a1 = pick(rand, [3, 6, 9, 12, 18, 24]);
  const S = (a1 * q) / (q - p);
  if (!Number.isInteger(S)) return T.infGeoSum.make(rand);
  const second = frac(a1 * p, q);
  return { ask: 'Sum of the infinite series', prompt: `${a1} + ${second} + ${frac(a1 * p * p, q * q)} + …`, typed: S,
    tell: `r = ${frac(p, q)} (|r| < 1, so it converges): S = a<sub>1</sub>/(1 − r) = ${a1}/(${frac(q - p, q)}) = ${S}.` };
} };

T.sigma = { book: 'seq', make(rand) {
  const a = nz(rand, -4, 4); const b = nz(rand, -6, 6); const n = int(rand, 3, 8); let S = 0; for (let k = 1; k <= n; k++) S += a * k + b;
  return { ask: 'Evaluate', prompt: `Σ<sub>k=1</sub><sup>${n}</sup> (${a === 1 ? '' : a === -1 ? M : num(a)}k${term(b)})`, typed: S, neg: S < 0,
    tell: `add the terms for k = 1 to ${n}: ${Array.from({ length: n }, (_, i) => num(a * (i + 1) + b)).join(' + ').replace(/\+ −/g, '− ')} = ${num(S)}.` };
} };

T.arithOrGeo = { book: 'seq', make(rand) {
  const geo = rand() < 0.5;
  const a1 = geo ? pick(rand, [1, 2, 3, 5, -2]) : nz(rand, -9, 9); const k = geo ? pick(rand, [2, 3, -2, 4]) : nz(rand, -7, 7);
  const terms = [0, 1, 2, 3].map((i) => num(geo ? a1 * k ** i : a1 + i * k)).join(', ');
  const ans = geo ? `geometric, common ratio ${num(k)}` : `arithmetic, common difference ${num(k)}`;
  return { ask: 'Arithmetic or geometric? Name the common difference or ratio', prompt: `${terms}, …`,
    ...mc(rand, ans, [geo ? `arithmetic, common difference ${num(k)}` : `geometric, common ratio ${num(k)}`, geo ? `geometric, common ratio ${num(a1 * k - a1)}` : `arithmetic, common difference ${num(-k)}`, geo ? `geometric, common ratio ${num(-k)}` : `geometric, common ratio ${num(k)}`, 'neither']),
    tell: geo ? `each term is the one before times ${num(k)}: geometric, r = ${num(k)}.` : `each term is the one before plus ${num(k)}: arithmetic, d = ${num(k)}.` };
} };

module.exports = makeBank(BOOKS, T);
