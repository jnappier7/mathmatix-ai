/**
 * Chapter Review: Algebra 1 — Module 8 (Exponents and Radicals, 8.1–8.7), built from Mr. Nappier's
 * guided notes, quiz, Module 8 practice test and the exam review. Quick-fire: one rule per play —
 * product, power of a power, quotient, zero and negative exponents, rational exponents, simplify a
 * root, add like radicals, multiply, rationalize, solve a one-step exponential or radical equation.
 *
 * Wrong choices are the slips the keys call out: multiplying exponents on a product, adding them
 * on a power, a negative exponent making the number negative, √(a + b) as √a + √b.
 */
const { num, int, pick, sample, gcd, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 8', blurb: 'Exponent rules, rational exponents, radicals and the equations — mixed.' },
  mult: { name: 'Multiplying Powers', ch: '8.1', blurb: 'Product rule, power of a power, power of a product.' },
  div: { name: 'Dividing, Zero & Negative', ch: '8.2–8.3', blurb: 'Quotient rule, power of a quotient, x⁰, and negative exponents.' },
  rational: { name: 'Rational Exponents', ch: '8.4', blurb: 'Between radical form and exponent form; evaluate 81^(1/2), 216^(1/3).' },
  rad: { name: 'Simplifying Radicals', ch: '8.5', blurb: 'Pull out the perfect square; multiply roots; roots with variables.' },
  ops: { name: 'Operations with Radicals', ch: '8.6', blurb: 'Add like radicals, multiply, rationalize the denominator.' },
  eqn: { name: 'Exponential & Radical Equations', ch: '8.7', blurb: 'Solve 5ˣ = 625, 27ˣ = 3, √(x − 7) = 8.' },
};

const sup = (e) => `<sup>${e}</sup>`;
const pow = (base, e) => (e === 1 ? base : `${base}${sup(e)}`);
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const VARS = ['x', 'n', 'm', 'b', 'k', 'p', 'w', 'y'];
const mono = (c, v, e) => `${c === 1 ? '' : c === -1 ? '−' : num(c)}${pow(v, e)}`;
const sqrt = (s) => `√${s}`;
const root = (n, s) => (n === 2 ? sqrt(s) : `${{ 3: '∛', 4: '∜', 5: '<sup>5</sup>√' }[n]}${s}`);
/** a√b, a√b/c as text. */
const rad = (a, b, c = 1) => `${a === 1 ? '' : a}${b === 1 ? (a === 1 ? '1' : '') : sqrt(b)}${c === 1 ? '' : `/${c}`}`;
/** Pull the largest perfect square out of n: n = s² · r. */
function pullSquare(n) { let s = 1; for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) s = k; return [s, n / (s * s)]; }
const SQUARE_FREE_RADS = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });

const T = {};

T.product = { book: 'mult', make(rand) {
  const v = pick(rand, VARS); const a = nz(rand, -7, 9); let b = nz(rand, -7, 9); while (b === -a) b = nz(rand, -7, 9); const p = int(rand, 2, 7); const q = int(rand, 2, 7);
  const ans = mono(a * b, v, p + q);
  return { ask: 'Simplify', prompt: `(${mono(a, v, p)})(${mono(b, v, q)})`, ...mc(rand, ans, [mono(a * b, v, p * q), mono(a + b, v, p + q), mono(a + b, v, p * q), mono(a * b, v, Math.abs(p - q) || 1)]),
    tell: `product rule: same base, ADD the exponents (${p} + ${q} = ${p + q}); multiply the coefficients (${num(a)} · ${num(b)} = ${num(a * b)}).` };
} };

T.powerPower = { book: 'mult', make(rand) {
  const v = pick(rand, VARS); const p = int(rand, 2, 9); const q = int(rand, 2, 6);
  return { ask: 'Simplify', prompt: `(${pow(v, p)})${sup(q)}`, ...mc(rand, pow(v, p * q), [pow(v, p + q), pow(v, Math.abs(p - q) || 2), pow(v, p ** q > 200 ? p * q + 1 : p ** q)]),
    tell: `power of a power: MULTIPLY the exponents (${p} · ${q} = ${p * q}).` };
} };

T.powerProduct = { book: 'mult', make(rand) {
  const c = pick(rand, [2, 3, 4, 5, -2, -3]); const r = int(rand, 2, 3); const [x, y] = sample(rand, VARS, 2); const p = int(rand, 2, 6); const q = int(rand, 1, 5);
  const cr = c ** r;
  const term = (coef, pe, qe) => `${num(coef)}${pow(x, pe)}${pow(y, qe)}`;
  return { ask: 'Simplify', prompt: `(${mono(c, x, p)}${pow(y, q)})${sup(r)}`, ...mc(rand, term(cr, p * r, q * r), [term(c, p * r, q * r), term(cr, p + r, q + r), term(c * r, p * r, q * r), term(-cr, p * r, q * r)]),
    tell: `power of a product: EVERY factor gets the exponent — ${num(c)}${sup(r)} = ${num(cr)}, ${pow(x, p)} → ${pow(x, p * r)}, ${pow(y, q)} → ${pow(y, q * r)}.` };
} };

T.quotient = { book: 'div', make(rand) {
  const v = pick(rand, VARS); const k = int(rand, 2, 6); const b = int(rand, 2, 5); const a = b * k; const q = int(rand, 2, 6); const p = q + int(rand, 1, 7);
  return { ask: 'Simplify', prompt: `${mono(a, v, p)} / ${mono(b, v, q)}`, ...mc(rand, mono(k, v, p - q), [mono(k, v, Math.round(p / q) || 1), mono(a - b, v, p - q), mono(k, v, p + q), mono(k, v, p)]),
    tell: `quotient rule: same base, SUBTRACT the exponents (${p} − ${q} = ${p - q}); divide the coefficients (${a} ÷ ${b} = ${k}).` };
} };

T.powerQuotient = { book: 'div', make(rand) {
  const [x, y] = sample(rand, VARS, 2); const c = pick(rand, [2, 3, 5]); const r = int(rand, 2, 3); const p = int(rand, 1, 4); const q = int(rand, 1, 4);
  const f = (coef, pe, qe) => `${coef === 1 ? '' : coef}${pow(x, pe)}/${pow(y, qe)}`;
  return { ask: 'Simplify', prompt: `(${mono(c, x, p)}/${pow(y, q)})${sup(r)}`, ...mc(rand, f(c ** r, p * r, q * r), [f(c, p * r, q * r), f(c ** r, p * r, q), f(c ** r, p + r, q + r), f(c * r, p * r, q * r)]),
    tell: `power of a quotient: the top AND the bottom get the exponent — ${c}${sup(r)} = ${c ** r}, ${pow(x, p)} → ${pow(x, p * r)}, ${pow(y, q)} → ${pow(y, q * r)}.` };
} };

T.zero = { book: 'div', make(rand) {
  const v = pick(rand, VARS); const c = int(rand, 2, 9); const kind = pick(rand, ['bare', 'coef', 'neg']);
  if (kind === 'bare') return { ask: 'Simplify', prompt: `(${num(-int(rand, 11, 999))})${sup(0)}`, ...mc(rand, '1', ['0', '−1', 'undefined']), tell: 'anything (except 0) to the zero power is 1.' };
  if (kind === 'coef') return { ask: 'Simplify', prompt: `${c}${pow(v, 0)}`, ...mc(rand, String(c), ['1', '0', `${c}${v}`]), tell: `only ${v} is raised to the 0 — ${v}${sup(0)} = 1, so ${c} · 1 = ${c}.` };
  return { ask: 'Simplify', prompt: `(${c}${pow(v, int(rand, 2, 6))})${sup(0)}`, ...mc(rand, '1', [String(c), '0', `${c}${v}`]), tell: 'the whole product is raised to the 0, so it is 1.' };
} };

T.negative = { book: 'div', make(rand) {
  const v = pick(rand, VARS); const p = int(rand, 2, 7); const c = int(rand, 2, 9); const kind = pick(rand, ['bare', 'coef', 'denom']);
  if (kind === 'bare') return { ask: 'Write with a positive exponent', prompt: `${pow(v, `−${p}`)}`, ...mc(rand, `1/${pow(v, p)}`, [`−${pow(v, p)}`, `−1/${pow(v, p)}`, `${pow(v, p)}`]), tell: `a negative exponent means FLIP to the reciprocal: 1/${pow(v, p)}. It does not make the value negative.` };
  if (kind === 'coef') return { ask: 'Write with a positive exponent', prompt: `${c}${pow(v, `−${p}`)}`, ...mc(rand, `${c}/${pow(v, p)}`, [`1/(${c}${pow(v, p)})`, `−${c}${pow(v, p)}`, `${pow(v, p)}/${c}`]), tell: `only ${v} has the negative exponent, so only ${v}${sup(p)} flips: ${c}/${pow(v, p)}.` };
  return { ask: 'Write with a positive exponent', prompt: `1/${pow(v, `−${p}`)}`, ...mc(rand, `${pow(v, p)}`, [`1/${pow(v, p)}`, `−${pow(v, p)}`, `−1/${pow(v, p)}`]), tell: `a negative exponent in the denominator flips UP: ${pow(v, p)}.` };
} };

T.rationalForm = { book: 'rational', make(rand) {
  const b = pick(rand, [2, 5, 7, 10, 'x', '6v', '5x']); const n = pick(rand, [2, 3, 4, 5]); const m = pick(rand, [1, 2, 3].filter((k) => k < n));
  const base = typeof b === 'number' ? String(b) : b;
  const inner = (m === 1 ? base : (base.length > 1 ? `(${base})${sup(m)}` : pow(base, m)));
  const radical = root(n, m === 1 ? base : `(${inner})`);
  const exponent = `${base.length > 1 ? `(${base})` : base}${sup(m === 1 ? `1/${n}` : `${m}/${n}`)}`;
  if (rand() < 0.5) return { ask: 'Write in radical form', prompt: exponent, ...mc(rand, radical, [root(m === 1 ? n + 1 : m, m === 1 ? base : `(${base.length > 1 ? `(${base})` : base}${sup(n)})`), `${root(n, base)}${sup(n)}`, root(n === 2 ? 3 : 2, base)]),
    tell: `the DENOMINATOR is the root (${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} root) and the numerator is the power (${m}).` };
  return { ask: 'Write in exponential form', prompt: radical, ...mc(rand, exponent, [`${base.length > 1 ? `(${base})` : base}${sup(`${n}/${m}`)}`, `${base.length > 1 ? `(${base})` : base}${sup(n * m)}`, `${base.length > 1 ? `(${base})` : base}${sup(`1/${n + m}`)}`]),
    tell: `root index goes DOWN (denominator ${n}), the power goes UP (numerator ${m}).` };
} };

T.evalRational = { book: 'rational', make(rand) {
  const Q = [[81, '1/2', 9], [49, '1/2', 7], [121, '1/2', 11], [144, '1/2', 12], [216, '1/3', 6], [8, '1/3', 2], [27, '1/3', 3], [1000, '1/3', 10], [16, '1/4', 2], [81, '1/4', 3], [32, '1/5', 2], [8, '2/3', 4], [27, '2/3', 9], [16, '3/4', 8], [4, '3/2', 8], [9, '3/2', 27], [1000000, '1/6', 10]];
  const [b, e, ans] = pick(rand, Q);
  return { ask: 'Evaluate', prompt: `${b}${sup(e)}`, typed: ans, tell: `${b}${sup(e)} = ${e.startsWith('1/') ? `${root(+e.slice(2), b)} = ${ans}` : `(${root(+e.slice(2), b)})${sup(e[0])} = ${Math.round(ans ** (1 / +e[0]))}${sup(e[0])} = ${ans}`}.` };
} };

T.simplifyRoot = { book: 'rad', make(rand) {
  const s = pick(rand, [2, 3, 4, 5, 6, 7]); const r = pick(rand, SQUARE_FREE_RADS); const n = s * s * r;
  return { ask: 'Simplify', prompt: sqrt(n), ...mc(rand, rad(s, r), [rad(s * s, r), rad(r, s), rad(s, s * r), rad(1, n)]),
    tell: `${n} = ${s * s} · ${r}, and ${s * s} is a perfect square: ${sqrt(n)} = ${sqrt(`${s * s} · ${r}`)} = ${rad(s, r)}.` };
} };

T.rootVar = { book: 'rad', make(rand) {
  const v = pick(rand, VARS); const c = pick(rand, [4, 9, 16, 25, 36, 49, 64, 81]); const e = pick(rand, [2, 4, 6, 8]); const sc = Math.sqrt(c);
  return { ask: 'Simplify', prompt: sqrt(`${c}${pow(v, e)}`), ...mc(rand, mono(sc, v, e / 2), [mono(sc, v, e), mono(c, v, e / 2), mono(sc, v, Math.sqrt(e) % 1 ? e / 2 + 1 : Math.sqrt(e))]),
    tell: `√${c} = ${sc}, and √(${pow(v, e)}) = ${pow(v, e / 2)} — halve the exponent.` };
} };

T.multiplyRoots = { book: 'rad', make(rand) {
  const a = pick(rand, [2, 3, 5, 6, 7, 10]); const b = pick(rand, [2, 3, 5, 6, 8, 12, 15, 18]); const n = a * b; const [s, r] = pullSquare(n);
  if (s === 1) return T.multiplyRoots.make(rand);
  return { ask: 'Simplify', prompt: `${sqrt(a)} · ${sqrt(b)}`, ...mc(rand, rad(s, r), [rad(1, n), rad(1, a + b), rad(s * s, r), rad(s, n)]),
    tell: `multiply under one root: ${sqrt(n)} = ${sqrt(`${s * s} · ${r}`)} = ${rad(s, r)}.` };
} };

T.addLike = { book: 'ops', make(rand) {
  const r = pick(rand, SQUARE_FREE_RADS); const a = int(rand, 2, 9); const b = int(rand, 1, 9); const c = int(rand, 1, 9);
  const ans = a + b - c; if (ans <= 0) return T.addLike.make(rand);
  return { ask: 'Simplify', prompt: `${rad(a, r)} + ${rad(b, r)} − ${rad(c, r)}`, ...mc(rand, rad(ans, r), [rad(ans, r * r * r), rad(a + b + c, r), `${ans}`, rad(a * b - c, r)]),
    tell: `like radicals add like like terms: (${a} + ${b} − ${c})${sqrt(r)} = ${rad(ans, r)}. The radicand stays ${r}.` };
} };

T.addUnlike = { book: 'ops', make(rand) {
  const r = pick(rand, [2, 3, 5, 6, 7]); const s = pick(rand, [2, 3, 4, 5]); const n = s * s * r; const b = int(rand, 1, 9);
  return { ask: 'Simplify', prompt: `${sqrt(n)} + ${rad(b, r)}`, ...mc(rand, rad(s + b, r), [rad(b, r) + ` + ${sqrt(n)}`, rad(1, n + b * b * r), rad(s * s + b, r), rad(n + b, r)]),
    tell: `simplify first: ${sqrt(n)} = ${rad(s, r)}; then ${s}${sqrt(r)} + ${b}${sqrt(r)} = ${rad(s + b, r)}.` };
} };

T.multiplyCoef = { book: 'ops', make(rand) {
  const a = int(rand, 2, 7); const b = int(rand, 2, 7); const x = pick(rand, [2, 3, 5, 6]); const y = pick(rand, [2, 3, 6, 8, 10, 12]);
  const n = x * y; const [s, r] = pullSquare(n); const coef = a * b * s;
  if (s === 1) return T.multiplyCoef.make(rand); // the point is the simplifying step after multiplying
  return { ask: 'Simplify', prompt: `${rad(a, x)} · ${rad(b, y)}`, ...mc(rand, rad(coef, r), [rad(a * b, n), rad(a + b, n), rad(coef, n), rad(a * b, r), rad(coef * s, r)]),
    tell: `multiply coefficients and radicands separately: ${a * b}${sqrt(n)}${s > 1 ? ` = ${a * b} · ${s}${sqrt(r)} = ${rad(coef, r)}` : ''}.` };
} };

T.rationalize = { book: 'ops', make(rand) {
  const r = pick(rand, [2, 3, 5, 6, 7]); const k = int(rand, 1, 4); const a = k * r; // a/√r = k√r
  if (rand() < 0.6) return { ask: 'Rationalize the denominator', prompt: `${a}/${sqrt(r)}`, ...mc(rand, rad(k, r), [rad(a, r), rad(k, r, r), rad(1, a * r, r), rad(a, r, r)]),
    tell: `multiply by ${sqrt(r)}/${sqrt(r)}: ${a}${sqrt(r)}/${r} = ${rad(k, r)}.` };
  const c = int(rand, 1, 9); // c/√r with r not dividing c: c√r / r, reduced
  if (c % r === 0) return T.rationalize.make(rand);
  const g = gcd(c, r);
  return { ask: 'Rationalize the denominator', prompt: `${c}/${sqrt(r)}`, ...mc(rand, rad(c / g, r, r / g), [rad(c, r), rad(c * r, r), `${c}/${r}`, rad(c, r, r)]),
    tell: `multiply by ${sqrt(r)}/${sqrt(r)}: ${c}${sqrt(r)}/${r}${g > 1 ? ` = ${rad(c / g, r, r / g)}` : ''}.` };
} };

T.rootSum = { book: 'ops', make(rand) {
  const trip = pick(rand, [[9, 16, 5], [36, 64, 10], [64, 225, 17], [25, 144, 13], [81, 144, 15], [49, 576, 25], [100, 576, 26], [144, 256, 20]]);
  return { ask: 'Error analysis', prompt: `Rex evaluated √(${trip[0]} + ${trip[1]}) as ${Math.sqrt(trip[0])} + ${Math.sqrt(trip[1])} = ${Math.sqrt(trip[0]) + Math.sqrt(trip[1])}. Evaluate it correctly.`, typed: trip[2],
    tell: `the root of a SUM is not the sum of the roots — add first: √${trip[0] + trip[1]} = ${trip[2]}.` };
} };

T.expEq = { book: 'eqn', make(rand) {
  const b = pick(rand, [2, 3, 4, 5, 6, 10]); const x = int(rand, 2, b <= 3 ? 7 : 4);
  return { ask: 'Solve for x', prompt: `${b}${sup('x')} = ${b ** x}`, typed: x, tell: `write ${b ** x} as a power of ${b}: ${b}${sup(x)} = ${b ** x}, so x = ${x}.` };
} };

T.expEqFrac = { book: 'eqn', make(rand) {
  const Q = [[27, 3, '1/3'], [256, 4, '1/4'], [121, 11, '1/2'], [625, 5, '1/4'], [32, 2, '1/5'], [64, 4, '1/3'], [81, 9, '1/2'], [1000, 10, '1/3']];
  const [b, r, ans] = pick(rand, Q);
  return { ask: 'Solve for x', prompt: `${b}${sup('x')} = ${r}`, ...mc(rand, ans, [`${+ans.slice(2)}`, `1/${+ans.slice(2) + 1}`, `${r}/${b}`, `1/${r}`]),
    tell: `${r} = ${b}${sup(ans)} (the ${+ans.slice(2)}${+ans.slice(2) === 2 ? 'nd' : +ans.slice(2) === 3 ? 'rd' : 'th'} root of ${b}), so x = ${ans}.` };
} };

T.radicalEq = { book: 'eqn', make(rand) {
  const k = int(rand, 2, 12); const c = nz(rand, -9, 9); const x = k * k - c; // √(x + c) = k → x = k² − c
  return { ask: 'Solve for x', prompt: `√(x ${c < 0 ? '−' : '+'} ${Math.abs(c)}) = ${k}`, typed: x, neg: x < 0,
    tell: `square both sides: x ${c < 0 ? '−' : '+'} ${Math.abs(c)} = ${k * k} → x = ${num(x)}.` };
} };

T.vocab = { book: 'eqn', make(rand) {
  const V = [
    { term: 'exponential equation', def: 'an equation in which the variable is an exponent' },
    { term: 'radical expression', def: 'an expression containing a root, such as √50' },
    { term: 'rationalizing the denominator', def: 'rewriting a fraction so no radical is left in the denominator' },
    { term: 'like radicals', def: 'radicals with the same radicand and index, which can be added or subtracted' },
    { term: 'perfect square', def: 'a number that is the square of an integer, such as 49 or 144' },
    { term: 'rational exponent', def: 'an exponent written as a fraction — the denominator is the root, the numerator the power' },
  ];
  const v = pick(rand, V); const others = sample(rand, V.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
