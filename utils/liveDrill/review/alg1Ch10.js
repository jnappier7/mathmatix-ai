/**
 * Chapter Review: Algebra 1 — Module 10 (Polynomials and Factoring, 10.1–10.7), built from Mr.
 * Nappier's guided notes, quiz, practice test and exam review. Quick-fire: one move per play — add,
 * subtract, a monomial times a polynomial, FOIL, a square, the GCF, factor a trinomial, a
 * difference of squares, prime or not.
 *
 * Wrong choices are the keys' slips: subtracting only the first term, (a − b)² as a² − b², the
 * wrong sign pair, a GCF that misses the variable, a prime trinomial "factored".
 */
const { num, int, pick, sample, makeBank, mc } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 10', blurb: 'Polynomial operations and every kind of factoring — mixed.' },
  addsub: { name: 'Add & Subtract', ch: '10.1', blurb: 'Combine like terms; distribute the minus; name the polynomial.' },
  mult: { name: 'Multiply', ch: '10.2–10.3', blurb: 'A monomial times a polynomial, FOIL, a binomial times a trinomial, a square.' },
  gcf: { name: 'GCF & Grouping', ch: '10.4–10.5', blurb: 'Factor out the greatest common factor; the first step every time.' },
  trinom: { name: 'Factor Trinomials', ch: '10.6', blurb: 'x² + bx + c and ax² + bx + c; prime or not; the factor pair.' },
  special: { name: 'Special Products', ch: '10.7', blurb: 'Difference of squares, perfect-square trinomials, GCF first.' },
};

const sup = (e) => `<sup>${e}</sup>`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
/** Coefficients highest degree first → "7x³ − 3x² + 2x − 7" (zero terms dropped). */
function poly(coefs, v = 'x') {
  const deg = coefs.length - 1; const parts = [];
  coefs.forEach((c, i) => {
    if (c === 0) return; const e = deg - i;
    const mag = Math.abs(c); const body = e === 0 ? String(mag) : `${mag === 1 ? '' : mag}${v}${e === 1 ? '' : sup(e)}`;
    parts.push(parts.length === 0 ? (c < 0 ? `−${body}` : body) : `${c < 0 ? ' − ' : ' + '}${body}`);
  });
  return parts.length ? parts.join('') : '0';
}
const add = (a, b) => { const n = Math.max(a.length, b.length); const A = Array(n - a.length).fill(0).concat(a); const B = Array(n - b.length).fill(0).concat(b); return A.map((x, i) => x + B[i]); };
const neg = (a) => a.map((x) => -x);
const mul = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
const binom = (a, b, v = 'x') => `(${poly([a, b], v)})`;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

const T = {};

T.addPoly = { book: 'addsub', make(rand) {
  const a = [nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9)]; const b = [nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9)];
  const sum = add(a, b); if (sum.includes(0)) return T.addPoly.make(rand);
  return { ask: 'Find the sum, in standard form', prompt: `(${poly(a)}) + (${poly(b)})`,
    ...mc(rand, poly(sum), [poly(add(a, neg(b))), poly(mul([1, 0], add(a, b)).slice(0, 4)), poly(sum.map((c, i) => (i === 3 ? a[3] - b[3] : c))), poly(sum.map((c, i) => (i === 1 ? a[1] * b[1] : c)))]),
    tell: `combine like terms, degree by degree: ${a.map((c, i) => `${num(c)} + ${num(b[i])} = ${num(sum[i])}`).join(', ')}.` };
} };

T.subPoly = { book: 'addsub', make(rand) {
  const a = [nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9)]; const b = [nz(rand, -9, 9), nz(rand, -9, 9), nz(rand, -9, 9)];
  const diff = add(a, neg(b)); if (diff.includes(0)) return T.subPoly.make(rand);
  const forgot = [a[0] - b[0], a[1] + b[1], a[2] + b[2]]; // distributed the minus to the first term only
  return { ask: 'Find the difference, in standard form', prompt: `(${poly(a)}) − (${poly(b)})`,
    ...mc(rand, poly(diff), [poly(forgot), poly(add(a, b)), poly(add(b, neg(a))), poly([a[0] - b[0], a[1] - b[1], a[2] + b[2]])]),
    tell: `distribute the minus to EVERY term of the second polynomial: (${poly(a)}) + (${poly(neg(b))}) = ${poly(diff)}.` };
} };

T.namePoly = { book: 'addsub', make(rand) {
  const deg = pick(rand, [0, 1, 2, 3]); const terms = pick(rand, [1, 2, 3].filter((t) => t <= deg + 1));
  const coefs = Array(deg + 1).fill(0); const spots = [0, ...sample(rand, [...Array(deg).keys()].map((i) => i + 1), terms - 1)]; // the leading term always present
  spots.forEach((i) => { coefs[i] = nz(rand, -9, 9); });
  const DEG = ['constant', 'linear', 'quadratic', 'cubic']; const TERMS = ['monomial', 'binomial', 'trinomial'];
  const ans = `${DEG[deg]} ${TERMS[terms - 1]}`;
  const wrong = [`${DEG[(deg + 1) % 4]} ${TERMS[terms - 1]}`, `${DEG[deg]} ${TERMS[terms % 3]}`, `${DEG[(deg + 2) % 4]} ${TERMS[(terms + 1) % 3]}`];
  return { ask: 'Name the polynomial by degree and number of terms', prompt: poly(coefs), ...mc(rand, ans, wrong),
    tell: `degree = the highest exponent (${deg} → ${DEG[deg]}); ${terms} term${terms > 1 ? 's' : ''} → ${TERMS[terms - 1]}.` };
} };

T.monoTimes = { book: 'mult', make(rand) {
  const c = nz(rand, -7, 7); const e = int(rand, 1, 3); const p = [nz(rand, -6, 6), nz(rand, -6, 6), nz(rand, -9, 9)];
  const prod = mul([c, ...Array(e).fill(0)], p);
  return { ask: 'Find the product, in standard form', prompt: `${poly([c, ...Array(e).fill(0)])}(${poly(p)})`,
    ...mc(rand, poly(prod), [poly(mul([c, ...Array(e).fill(0)], [p[0], p[1], p[2] / c].map(Math.round))), poly([c * p[0], ...Array(e).fill(0), p[1], p[2]].slice(0, prod.length)), poly(prod.map((x, i) => (i === 0 ? x : -x))), poly(mul([c, ...Array(e + 1).fill(0)], p))]),
    tell: `distribute ${poly([c, ...Array(e).fill(0)])} to each term and ADD exponents: ${poly(prod)}.` };
} };

T.foil = { book: 'mult', make(rand) {
  const a = int(rand, 1, 5); const b = nz(rand, -7, 7); const c = int(rand, 1, 5); const d = nz(rand, -7, 7);
  const prod = mul([a, b], [c, d]); if (prod[1] === 0) return T.foil.make(rand);
  return { ask: 'Find the product, in standard form', prompt: `${binom(a, b)}${binom(c, d)}`,
    ...mc(rand, poly(prod), [poly([a * c, 0, b * d]), poly([a * c, a * d - b * c, b * d]), poly([a * c, prod[1], -b * d]), poly([a + c, prod[1], b + d])]),
    tell: `FOIL: First ${poly([a * c, 0, 0])}, Outer ${poly([a * d, 0])}, Inner ${poly([b * c, 0])}, Last ${num(b * d)}; combine the middle: ${poly(prod)}.` };
} };

T.binomTrinom = { book: 'mult', make(rand) {
  const a = nz(rand, -6, 6); const t = [1, nz(rand, -6, 6), nz(rand, -8, 8)];
  const prod = mul([1, a], t);
  return { ask: 'Find the product, in standard form', prompt: `${binom(1, a)}(${poly(t)})`,
    ...mc(rand, poly(prod), [poly([1, t[1], t[2] * a].concat([0]).slice(0, 4)), poly([1, a + t[1], t[2], 0]), poly(prod.map((x, i) => (i === 2 ? -x : x))), poly([1, t[1] + a, a * t[1], a * t[2]])]),
    tell: `distribute x, then ${num(a)}: ${poly(mul([1, 0], t))} and ${poly(mul([a], t))}; add like terms: ${poly(prod)}.` };
} };

T.square = { book: 'mult', make(rand) {
  const a = int(rand, 1, 6); const b = nz(rand, -7, 7);
  const prod = mul([a, b], [a, b]);
  return { ask: 'Find the product, in standard form', prompt: `${binom(a, b)}${sup(2)}`,
    ...mc(rand, poly(prod), [poly([a * a, 0, b * b]), poly([a * a, a * b, b * b]), poly([a * a, 0, -b * b]), poly([a * a, 2 * a * b, -b * b])]),
    tell: `(${binom(a, b)})² = (${binom(a, b)})(${binom(a, b)}): the middle term is 2 · ${num(a)}x · ${num(b)} = ${poly([2 * a * b, 0])} — it does not disappear.` };
} };

T.gcf = { book: 'gcf', make(rand) {
  const g = pick(rand, [2, 3, 4, 5, 6, 7]); const e = int(rand, 1, 2);
  const inner = [nz(rand, -6, 6), nz(rand, -6, 6), nz(rand, 1, 9)]; if (gcd(gcd(inner[0], inner[1]), inner[2]) !== 1 || inner[0] < 0) return T.gcf.make(rand);
  const full = mul([g, ...Array(e).fill(0)], inner);
  const mono = `${g}x${e === 1 ? '' : sup(e)}`;
  return { ask: 'Factor out the GCF', prompt: poly(full),
    ...mc(rand, `${mono}(${poly(inner)})`, [`${g}(${poly(mul([1, ...Array(e).fill(0)], inner))})`, `x${e === 1 ? '' : sup(e)}(${poly(mul([g], inner))})`, `${mono}(${poly([inner[0], inner[1], inner[2] * g])})`, `${g}x${sup(e + 1)}(${poly(inner)})`]),
    tell: `the GCF of the coefficients is ${g} and every term has at least x${e === 1 ? '' : sup(e)}: ${mono}(${poly(inner)}). Check by distributing.` };
} };

T.factorPair = { book: 'trinom', make(rand) {
  const p = int(rand, 2, 9); let q = int(rand, 2, 12); while (q === p) q = int(rand, 2, 12);
  const c = p * q; const b = p + q;
  const pairs = []; for (let i = 1; i * i <= c; i++) if (c % i === 0) pairs.push([i, c / i]);
  const wrong = pairs.filter(([u, v]) => !(u === Math.min(p, q) && v === Math.max(p, q))).map(([u, v]) => `${u} and ${v}`);
  return { ask: `Which factor pair of ${c} adds to ${b}?`, prompt: `x${sup(2)} + ${b}x + ${c}`, ...mc(rand, `${Math.min(p, q)} and ${Math.max(p, q)}`, wrong.concat([`${b} and ${c - b}`, `${p} and ${b - p + 1}`])),
    tell: `${Math.min(p, q)} · ${Math.max(p, q)} = ${c} and ${Math.min(p, q)} + ${Math.max(p, q)} = ${b}, so the factors are ${binom(1, p)}${binom(1, q)}.` };
} };

T.factorTrinomial = { book: 'trinom', make(rand) {
  const p = nz(rand, -9, 9); let q = nz(rand, -9, 9); while (q === p || p + q === 0) q = nz(rand, -9, 9);
  const t = mul([1, p], [1, q]);
  return { ask: 'Factor', prompt: poly(t),
    ...mc(rand, `${binom(1, Math.min(p, q))}${binom(1, Math.max(p, q))}`, [`${binom(1, -Math.min(p, q))}${binom(1, -Math.max(p, q))}`, `${binom(1, Math.min(p, q))}${binom(1, -Math.max(p, q))}`, `${binom(1, -Math.min(p, q))}${binom(1, Math.max(p, q))}`, `${binom(1, p + q)}${binom(1, 1)}`]),
    tell: `find two numbers that MULTIPLY to ${num(p * q)} and ADD to ${num(p + q)}: ${num(p)} and ${num(q)}.` };
} };

T.factorTrinomialA = { book: 'trinom', make(rand) {
  const a = pick(rand, [2, 3, 5]); const b = nz(rand, -5, 5); const c = pick(rand, [1, 2, 3, 4]); const d = nz(rand, -6, 6);
  if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || (a === c && b === d)) return T.factorTrinomialA.make(rand);
  const t = mul([a, b], [c, d]); if (t[1] === 0) return T.factorTrinomialA.make(rand);
  const ans = `${binom(a, b)}${binom(c, d)}`;
  return { ask: 'Factor', prompt: poly(t),
    ...mc(rand, ans, [`${binom(a, d)}${binom(c, b)}`, `${binom(a, -b)}${binom(c, -d)}`, `${binom(a * c, b)}${binom(1, d)}`, `${binom(a, b)}${binom(c, -d)}`]),
    tell: `${num(a * c)} · ${num(b * d)} = ${num(a * c * b * d)}; the pair that adds to ${num(t[1])} splits the middle term, and grouping gives ${ans}. Check with FOIL.` };
} };

T.prime = { book: 'trinom', make(rand) {
  const b = int(rand, 2, 12); const c = pick(rand, [7, 11, 13, 17, 19, 23, 5, 29]); // c prime: only 1 · c, so factorable only if b = c + 1
  if (b === c + 1) return T.prime.make(rand);
  const factorable = rand() < 0.4;
  if (factorable) { const p = int(rand, 1, 8); const q = int(rand, p + 1, 12); const t = mul([1, p], [1, q]);
    return { ask: 'Factor, if possible', prompt: poly(t), ...mc(rand, `${binom(1, p)}${binom(1, q)}`, ['PRIME', `${binom(1, p + 1)}${binom(1, q - 1)}`, `${binom(1, -p)}${binom(1, -q)}`]),
      tell: `${p} · ${q} = ${p * q} and ${p} + ${q} = ${p + q}, so it factors.` }; }
  return { ask: 'Factor, if possible', prompt: `x${sup(2)} + ${b}x + ${c}`, ...mc(rand, 'PRIME', [`${binom(1, 1)}${binom(1, c)}`, `${binom(1, b)}${binom(1, 1)}`, `${binom(1, b - 1)}${binom(1, c - b + 1)}`]),
    tell: `${c} has only the factor pair 1 · ${c}, which adds to ${c + 1}, not ${b} — PRIME.` };
} };

T.diffSquares = { book: 'special', make(rand) {
  const a = pick(rand, [1, 2, 3, 4, 5, 6, 7, 9, 10]); const b = pick(rand, [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
  if (gcd(a, b) !== 1) return T.diffSquares.make(rand); // else the GCF comes out first and (ax + b)(ax − b) isn't complete
  const prompt = `${a === 1 ? '' : a * a}x${sup(2)} − ${b * b}`;
  return { ask: 'Factor', prompt, ...mc(rand, `${binom(a, b)}${binom(a, -b)}`, [`${binom(a, -b)}${binom(a, -b)}`, `${binom(a, b)}${binom(a, b)}`, `${binom(a * a, b * b)}${binom(1, -1)}`, 'PRIME']),
    tell: `difference of squares: ${a === 1 ? '' : a * a}x² is (${a === 1 ? '' : a}x)² and ${b * b} is ${b}², so (${a === 1 ? '' : a}x + ${b})(${a === 1 ? '' : a}x − ${b}).` };
} };

T.perfectSquare = { book: 'special', make(rand) {
  const a = pick(rand, [1, 1, 2, 3]); const b = nz(rand, -8, 8); const t = mul([a, b], [a, b]);
  return { ask: 'Factor', prompt: poly(t), ...mc(rand, `${binom(a, b)}${sup(2)}`, [`${binom(a, -b)}${sup(2)}`, `${binom(a, b)}${binom(a, -b)}`, `${binom(a, 2 * b)}${binom(a, b)}`]),
    tell: `perfect-square trinomial: first and last are squares and the middle is 2 · ${num(a)}x · ${num(b)} = ${poly([2 * a * b, 0])}, so (${poly([a, b])})².` };
} };

T.gcfThenFactor = { book: 'special', make(rand) {
  const g = pick(rand, [2, 3, 4, 5]); const p = int(rand, 1, 6); const q = int(rand, p + 1, 8); const inner = mul([1, p], [1, q]); const full = inner.map((c) => c * g);
  return { ask: 'Factor completely', prompt: poly(full),
    ...mc(rand, `${g}${binom(1, p)}${binom(1, q)}`, [`${g}(${poly(inner)})`, `${binom(g, g * p)}${binom(1, q)}`, `${binom(1, p)}${binom(1, q)}`, `${g}${binom(1, -p)}${binom(1, -q)}`]),
    tell: `check the GCF first: ${g}(${poly(inner)}); then factor the trinomial: ${g}${binom(1, p)}${binom(1, q)}.` };
} };

T.vocab = { book: 'addsub', make(rand) {
  const V = [
    { term: 'polynomial', def: 'a monomial or a sum of monomials' },
    { term: 'degree of a polynomial', def: 'the greatest exponent of its terms' },
    { term: 'standard form', def: 'the terms written in order from the highest degree to the lowest' },
    { term: 'leading coefficient', def: 'the coefficient of the first term when the polynomial is in standard form' },
    { term: 'FOIL', def: 'First, Outer, Inner, Last — the four products when multiplying two binomials' },
    { term: 'greatest common factor (GCF)', def: 'the largest monomial that divides every term' },
    { term: 'prime polynomial', def: 'a polynomial that cannot be factored into polynomials with integer coefficients' },
    { term: 'difference of two squares', def: 'a² − b² = (a + b)(a − b)' },
    { term: 'perfect-square trinomial', def: 'a² + 2ab + b² = (a + b)² or a² − 2ab + b² = (a − b)²' },
  ];
  const v = pick(rand, V); const others = sample(rand, V.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
