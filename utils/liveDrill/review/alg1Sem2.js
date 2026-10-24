/**
 * Chapter Review: Algebra 1 — Semester 2 Exam Review (Module 13), built from Mr. Nappier's
 * Semester 2 Exam Practice packets: Systems of Equations and Inequalities (MC 1–8, 26), Exponents
 * and Exponential Functions (9–14), Polynomials and Factoring (15–19), Quadratics (20–25), Radicals
 * and Statistics (27–30), and their constructed-response samples. Quick-fire: one move per play.
 *
 * Wrong choices are the packets' own: 144 as a product-rule base, (external) the coefficient not
 * raised, the shifted-the-wrong-way translation, the minus not distributed, Juan's sign-flipped
 * equation, the max offered as the "typical" measure.
 */
const { int, pick, makeBank, mc } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Exam', ch: 'Sem 2', blurb: 'Systems, exponents, polynomials, quadratics, radicals and stats — the whole second semester, mixed.' },
  systems: { name: 'Systems', ch: 'MC 1–8', blurb: 'Solve by substitution and elimination, how many solutions, the coaster cars, the candle inequalities.' },
  exponents: { name: 'Exponents & Exponentials', ch: 'MC 9–14', blurb: 'Product, power and quotient rules, the decay model, compound interest, growth or decay by the factor.' },
  polys: { name: 'Polynomials & Factoring', ch: 'MC 15–19', blurb: 'Add and subtract, FOIL, factor x² + bx + c and ax² + bx + c, GCF first.' },
  quads: { name: 'Quadratics', ch: 'MC 20–25', blurb: 'Zero product, which equation Juan solved, the translation, zeros, the vertex, when the arrow lands.' },
  radstats: { name: 'Radicals & Stats', ch: 'MC 27–30', blurb: 'Simplify and rationalize, add and multiply radicals, which measure best represents the data.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const sup = (e) => `<sup>${e}</sup>`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
function poly(coefs, v = 'x') {
  const deg = coefs.length - 1; const parts = [];
  coefs.forEach((c, i) => {
    if (c === 0) return; const e = deg - i;
    const mag = Math.abs(c); const body = e === 0 ? String(mag) : `${mag === 1 ? '' : mag}${v}${e === 1 ? '' : sup(e)}`;
    parts.push(parts.length === 0 ? (c < 0 ? `${M}${body}` : body) : `${c < 0 ? ' − ' : ' + '}${body}`);
  });
  return parts.length ? parts.join('') : '0';
}
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
const binom = (a, b) => `(${poly([a, b])})`;
/** Standard form ax + by = c with signs. */
const lin = (a, b, c) => `${a === 1 ? '' : a === -1 ? M : num(a)}x ${b < 0 ? M : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${num(c)}`;
const roots = (r1, r2) => { const [a, b] = [r1, r2].sort((x, y) => x - y); return `x = ${num(a)} and x = ${num(b)}`; };
function simplify(n) { let k = 1; for (let f = 2; f * f <= n; f++) while (n % (f * f) === 0) { n /= f * f; k *= f; } return [k, n]; }
const rad = (k, m) => (m === 1 ? String(k) : k === 1 ? `√${m}` : `${k}√${m}`);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

const T = {};

// ------------------------------------------------------------------ systems
T.substitution = { book: 'systems', make(rand) {
  const x = nz(rand, -4, 4); const y = nz(rand, -5, 5); const m = nz(rand, -4, 6); const b = y - m * x; const c = nz(rand, -4, 4); const d = nz(rand, -4, 4); const e = c * x + d * y;
  if (b === 0) return T.substitution.make(rand);
  return { ask: 'Solve the system', prompt: `y = ${m === 1 ? '' : m === -1 ? M : num(m)}x ${b < 0 ? M : '+'} ${Math.abs(b)} and ${lin(c, d, e)}`,
    ...mc(rand, `x = ${num(x)} and y = ${num(y)}`, [`x = ${num(y)} and y = ${num(x)}`, `x = ${num(-x)} and y = ${num(-y)}`, `x = ${num(x)} and y = ${num(-y)}`, `x = ${num(-x)} and y = ${num(y)}`]),
    tell: `substitute: ${num(c)}x + ${num(d)}(${num(m)}x ${b < 0 ? M : '+'} ${Math.abs(b)}) = ${num(e)} → x = ${num(x)}; then y = ${num(y)}.` };
} };

T.elimination = { book: 'systems', make(rand) {
  const x = nz(rand, -4, 4); const y = nz(rand, -4, 4); const a = nz(rand, -6, 8); const b = nz(rand, -6, 8); const c = nz(rand, -6, 8); const d = -b; // y cancels on adding
  if (a === -c) return T.elimination.make(rand);
  return { ask: 'Solve the system', prompt: `${lin(a, b, a * x + b * y)} and ${lin(c, d, c * x + d * y)}`,
    ...mc(rand, `x = ${num(x)} and y = ${num(y)}`, [`x = ${num(y)} and y = ${num(x)}`, `x = ${num(-x)} and y = ${num(-y)}`, `x = ${num(x)} and y = ${num(-y)}`, `x = ${num(-x)} and y = ${num(y)}`]),
    tell: `add the equations — the y terms cancel: ${num(a + c)}x = ${num((a + c) * x)} → x = ${num(x)}; then y = ${num(y)}.` };
} };

T.howMany = { book: 'systems', make(rand) {
  const a = nz(rand, -5, 5); const b = nz(rand, -5, 5); const c = int(rand, -9, 9); const k = pick(rand, [2, 3, -2]); const kind = pick(rand, ['one', 'none', 'infinite']);
  const second = kind === 'infinite' ? lin(k * a, k * b, k * c) : kind === 'none' ? lin(k * a, k * b, k * c + nz(rand, -5, 5)) : lin(k * a, k * b + nz(rand, -4, 4), c);
  const ans = { one: 'one solution', none: 'no solution', infinite: 'infinitely many solutions' }[kind];
  return { ask: 'How many solutions?', prompt: `${lin(a, b, c)} and ${second}`, ...mc(rand, ans, ['one solution', 'no solution', 'infinitely many solutions']),
    tell: kind === 'infinite' ? `the second equation is ${k} times the first — the same line, so infinitely many.` : kind === 'none' ? `the left sides are ${k} times each other but the right sides aren't — parallel lines, no solution.` : 'the slopes differ, so the lines cross once.' };
} };

T.coaster = { book: 'systems', make(rand) {
  const small = int(rand, 3, 12); const big = int(rand, 3, 12); if (Math.abs(small - big) <= 1) return T.coaster.make(rand); const cars = small + big; const people = 4 * small + 6 * big;
  return { ask: 'How many of each?', prompt: `A coaster has ${cars} cars; some hold 4 people and some hold 6. There is room for ${people} people altogether.`,
    ...mc(rand, `4-passenger cars = ${small}, 6-passenger cars = ${big}`, [`4-passenger cars = ${big}, 6-passenger cars = ${small}`, `4-passenger cars = ${people}, 6-passenger cars = ${cars}`, `4-passenger cars = ${small + 1}, 6-passenger cars = ${big - 1}`]),
    tell: `s + b = ${cars} and 4s + 6b = ${people}: substitute s = ${cars} − b → 4(${cars} − b) + 6b = ${people} → 2b = ${people - 4 * cars} → b = ${big}, s = ${small}.` };
} };

T.twoNumbers = { book: 'systems', make(rand) {
  const k = pick(rand, [2, 3, 4, 5]); const small = int(rand, 3, 12); const big = k * small; const s = small + big;
  const frac = { 2: '1/2', 3: '1/3', 4: '1/4', 5: '1/5' }[k];
  return { ask: 'What are the numbers?', prompt: `The sum of two numbers is ${s}, and the smaller number is ${frac} of the larger.`,
    ...mc(rand, `${small} and ${big}`, [`${big - small} and ${s - (big - small)}`, `${s / 2 - 1} and ${s / 2 + 1}`, `${small} and ${s}`, `${k} and ${s - k}`]),
    tell: `x + y = ${s} and x = (${frac})y → (${frac})y + y = ${s} → y = ${big}, x = ${small}.` };
} };

T.candles = { book: 'systems', make(rand) {
  const n = int(rand, 10, 30); const budget = int(rand, 5, 12) * 10; const small = pick(rand, [2.5, 3, 3.5, 4]); const big = pick(rand, [5, 6, 7.5]);
  const sys = (op1, op2) => `s + l ${op1} ${n} and ${small}s + ${big}l ${op2} ${budget}`;
  return { ask: 'Write the system', prompt: `Small candles cost $${small.toFixed(2)} and large ones $${big.toFixed(2)}. Jonah needs AT LEAST ${n} candles and cannot spend MORE than $${budget}.`,
    ...mc(rand, sys('≥', '≤'), [sys('≤', '≤'), sys('≤', '≥'), sys('=', '=')]),
    tell: '"at least" is ≥; "cannot spend more than" is ≤.' };
} };

T.shirts = { book: 'systems', make(rand) {
  const f = int(rand, 1, 6); const p = int(rand, 1, 7); const cf = pick(rand, [22, 25, 28, 30]); const cp = pick(rand, [12, 15, 18]);
  const total = cf * f + cp * p;
  return { ask: 'How many fancy shirts?', prompt: `Kristin bought ${f + p} shirts for $${total}. Fancy shirts cost $${cf} and plain shirts $${cp}.`, typed: f,
    tell: `f + p = ${f + p} and ${cf}f + ${cp}p = ${total}: p = ${f + p} − f → ${cf}f + ${cp}(${f + p} − f) = ${total} → ${cf - cp}f = ${total - cp * (f + p)} → f = ${f}.` };
} };

// ------------------------------------------------------------------ exponents
T.productRule = { book: 'exponents', make(rand) {
  const b = pick(rand, [2, 3, 5, 7, 12]); const m = int(rand, 2, 9); const n = int(rand, 2, 9); if (m * n === m + n) return T.productRule.make(rand);
  return { ask: 'Simplify (exponential form)', prompt: `${b}${sup(m)} · ${b}${sup(n)}`, ...mc(rand, `${b}${sup(m + n)}`, [`${b * b}${sup(m + n)}`, `${b}${sup(m * n)}`, `${b * b}${sup(m * n)}`]),
    tell: `same base: ADD the exponents, keep the base — ${b}^${m + n}. Never multiply the bases.` };
} };

T.powerRule = { book: 'exponents', make(rand) {
  const c = pick(rand, [2, 3, 5]); const m = int(rand, 2, 5); const n = pick(rand, [2, 3]); const v = pick(rand, ['h', 'x', 'k']); if (c * n === c ** n || m * n === m + n) return T.powerRule.make(rand);
  return { ask: 'Simplify', prompt: `(${c}${v}${sup(m)})${sup(n)}`, ...mc(rand, `${c ** n}${v}${sup(m * n)}`, [`${c * n}${v}${sup(m * n)}`, `${c}${v}${sup(m * n)}`, `${c ** n}${v}${sup(m + n)}`, `${c * n}${v}${sup(m + n)}`]),
    tell: `raise EVERY factor: ${c}^${n} = ${c ** n} and (${v}^${m})^${n} = ${v}^${m * n}.` };
} };

T.quotientRule = { book: 'exponents', make(rand) {
  const a = int(rand, 3, 9); const b = int(rand, 3, 9); const c = int(rand, 3, 9); const d = int(rand, 1, a - 1); const e = int(rand, 1, b - 1); const f = int(rand, 1, c - 1);
  const show = (p, q, r) => `x${p === 1 ? '' : sup(p)}y${q === 1 ? '' : sup(q)}z${r === 1 ? '' : sup(r)}`;
  return { ask: 'Simplify', prompt: `(x${sup(a)}y${sup(b)}z${sup(c)}) ÷ (x${sup(d)}y${sup(e)}z${sup(f)})`,
    ...mc(rand, show(a - d, b - e, c - f), [show(a + d, b + e, c + f), show(Math.round(a / d), Math.round(b / e), Math.round(c / f)), show(a * d, b * e, c * f), show(a - d, b - e, c + f)]),
    tell: `same base: SUBTRACT the exponents — x^${a - d} y^${b - e} z^${c - f}.` };
} };

T.negativeExp = { book: 'exponents', make(rand) {
  const c = pick(rand, [2, 3, 4, 5]); const n = int(rand, 2, 5); const v = pick(rand, ['w', 'x', 'm']);
  return { ask: 'Simplify (positive exponents)', prompt: `${c}${v}${sup(`${M}${n}`)}`, ...mc(rand, `${c}/${v}${sup(n)}`, [`1/(${c}${v}${sup(n)})`, `${M}${c}${v}${sup(n)}`, `${c}${v}${sup(n)}`]),
    tell: `only the base with the negative exponent moves: ${c} stays on top, ${v}^${n} goes to the bottom.` };
} };

T.decayModel = { book: 'exponents', make(rand) {
  const p0 = pick(rand, [50, 80, 120, 200, 500]); const rate = pick(rand, [2, 2.5, 3.5, 4, 5, 8]); const grow = rand() < 0.4;
  const f = (grow ? 100 + rate : 100 - rate) / 100; const wrongF = (grow ? 100 - rate : 100 + rate) / 100;
  return { ask: 'Which function models the population?', prompt: `A population ${grow ? 'increases' : 'decreases'} at ${rate}% per year, starting from ${p0}.`,
    ...mc(rand, `P = ${p0}(${f})${sup('n')}`, [`P = ${p0}(${wrongF})${sup('n')}`, `P = ${p0}(${rate})${sup('n')}`, `P = ${p0}(${(1 + rate / 10).toFixed(2).replace(/0$/, '')})${sup('n')}`]),
    tell: `the factor is 1 ${grow ? '+' : M} ${rate}% = ${f}. Growth is above 1, decay is below 1.` };
} };

T.compound = { book: 'exponents', make(rand) {
  const P = pick(rand, [1000, 1500, 2000, 2500, 5000]); const r = pick(rand, [3, 4, 5, 6, 8]); const n = int(rand, 3, 15); const A = P * (1 + r / 100) ** n;
  return { ask: 'Nearest whole dollar', prompt: `A = P(1 + r)${sup('n')}: $${P.toLocaleString('en-US')} invested at ${r}% compounded annually for ${n} years.`,
    ...mc(rand, money(A), [money(P * (1 + r) ** n), money(P * (1 + (r / 100) * n)), money(P * (r / 100) ** n + P), money(P * r * n)]),
    tell: `${P}(1.${r.toString().padStart(2, '0')})^${n} ≈ ${money(A)}. r is a decimal: 1 + 0.0${r}.` };
} };

T.growthOrDecay = { book: 'exponents', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 6]); const grow = rand() < 0.5; const b = grow ? pick(rand, [2, 3, 4, 5]) : pick(rand, ['1/2', '1/3', '1/4', '2/3']); if (String(a) === String(b)) return T.growthOrDecay.make(rand);
  return { ask: 'Growth or decay? By what factor?', prompt: `y = ${a}(${b})${sup('x')}`,
    ...mc(rand, `${grow ? 'growth' : 'decay'}, factor ${b}`, [`${grow ? 'decay' : 'growth'}, factor ${b}`, `${grow ? 'growth' : 'decay'}, factor ${a}`, `${grow ? 'decay' : 'growth'}, factor ${a}`]),
    tell: `the base ${b} is the factor; ${grow ? 'above 1 → growth' : 'between 0 and 1 → decay'}. ${a} is the starting value.` };
} };

T.tableValue = { book: 'exponents', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 6]); const b = pick(rand, [2, 3, 4]); const x = int(rand, 0, 4);
  return { ask: `Find y when x = ${x}`, prompt: `y = ${a}(${b})${sup('x')}`, typed: a * b ** x, tell: `${a} · ${b}^${x} = ${a} · ${b ** x} = ${a * b ** x}. Exponent first, then multiply by ${a}.` };
} };

T.asymptote = { book: 'exponents', make(rand) {
  const a = pick(rand, [2, 3, 4, 5]); const b = pick(rand, [2, 3, '1/2', '1/3']);
  return { ask: 'Which asymptote does it have?', prompt: `y = ${a}(${b})${sup('x')}`, ...mc(rand, 'a horizontal asymptote at y = 0', ['a vertical asymptote at x = 0', `a horizontal asymptote at y = ${a}`, 'no asymptote']),
    tell: 'an exponential function never reaches 0 — the x-axis is its horizontal asymptote.' };
} };

// ------------------------------------------------------------------ polynomials
T.addSub = { book: 'polys', make(rand) {
  const A = [nz(rand, -9, 9), nz(rand, -12, 12), nz(rand, -9, 9)]; const B = [nz(rand, -9, 9), nz(rand, -12, 12), nz(rand, -9, 9)]; const sub = rand() < 0.5;
  const v = pick(rand, ['x', 'm']); const ans = sub ? add(A, B.map((c) => -c)) : add(A, B);
  if (ans.some((c) => c === 0)) return T.addSub.make(rand);
  const wrong1 = sub ? add(A, [-B[0], B[1], B[2]]) : add(A, [B[0], -B[1], -B[2]]); // the minus not distributed
  return { ask: 'Simplify', prompt: `(${poly(A, v)}) ${sub ? M : '+'} (${poly(B, v)})`,
    ...mc(rand, poly(ans, v), [poly(wrong1, v), poly(sub ? add(A, B) : add(A, B.map((c) => -c)), v), poly(ans.map((c, i) => (i === 1 ? -c : c)), v), poly(mul([A[0], A[1]], [1, 0]).slice(0, 3), v)]),
    tell: sub ? `distribute the minus to EVERY term of the second polynomial, then combine like terms: ${poly(ans, v).replace(/<\/?sup>/g, '')}.` : `combine like terms: ${poly(ans, v).replace(/<\/?sup>/g, '')}.` };
} };

T.foil = { book: 'polys', make(rand) {
  const a = int(rand, 2, 5); const p = nz(rand, -6, 6); const q = nz(rand, -6, 6); const v = pick(rand, ['g', 'x']); const ans = mul([a, p], [1, q]);
  if (ans[1] === 0) return T.foil.make(rand);
  return { ask: 'Simplify', prompt: `(${poly([a, p], v)})(${poly([1, q], v)})`,
    ...mc(rand, poly(ans, v), [poly([a, 0, p * q], v), poly([a, p + q, p * q], v), poly([a + 1, p + q], v), poly([a, a * q - p, p * q], v)]),
    tell: `FOIL: ${a}${v}² ${a * q < 0 ? M : '+'} ${Math.abs(a * q)}${v} ${p < 0 ? M : '+'} ${Math.abs(p)}${v} ${p * q < 0 ? M : '+'} ${Math.abs(p * q)} = ${poly(ans, v).replace(/<\/?sup>/g, '')}.` };
} };

T.factorTrinomial = { book: 'polys', make(rand) {
  const r = nz(rand, -9, 9); const s = nz(rand, -9, 9); if (r === s || r + s === 0) return T.factorTrinomial.make(rand);
  const v = pick(rand, ['x', 'm', 'r']); const b = r + s; const c = r * s;
  return { ask: 'Factor the trinomial', prompt: poly([1, b, c], v),
    ...mc(rand, `(${poly([1, r], v)})(${poly([1, s], v)})`, [`(${poly([1, -r], v)})(${poly([1, -s], v)})`, `(${poly([1, r], v)})(${poly([1, -s], v)})`, `(${poly([1, c], v)})(${poly([1, 1], v)})`, `(${poly([1, -r], v)})(${poly([1, s], v)})`]),
    tell: `two numbers that multiply to ${num(c)} and add to ${num(b)}: ${num(r)} and ${num(s)}.` };
} };

T.factorA = { book: 'polys', make(rand) {
  const a = pick(rand, [2, 3, 5, 6, 8]); const p = nz(rand, -6, 6); const q = nz(rand, -6, 6); // (ax + p)(x + q)
  if (p % a === 0 && a > 1) return T.factorA.make(rand);
  const B = a * q + p; const C = p * q; if (B === 0) return T.factorA.make(rand);
  const ans = `${binom(a, p)}${binom(1, q)}`;
  return { ask: 'Factor the trinomial', prompt: poly([a, B, C]), ...mc(rand, ans, [`${binom(a, q)}${binom(1, p)}`, `${binom(a, -p)}${binom(1, -q)}`, `${binom(1, a * q)}${binom(1, p)}`, `${binom(a, -p)}${binom(1, q)}`]),
    tell: `check by FOIL: ${a}x² + ${num(a * q)}x + ${num(p)}x + ${num(C)} = ${poly([a, B, C]).replace(/<\/?sup>/g, '')}. ✓` };
} };

T.gcfFirst = { book: 'polys', make(rand) {
  const g = pick(rand, [2, 3, 5]); const r = nz(rand, -5, 5); const s = nz(rand, -5, 5); if (r === s || r + s === 0) return T.gcfFirst.make(rand);
  const v = pick(rand, ['y', 'm', 'x']); const inner = [1, r + s, r * s]; const outer = inner.map((c) => g * c);
  return { ask: 'Factor completely', prompt: poly(outer, v),
    ...mc(rand, `${g}(${poly([1, r], v)})(${poly([1, s], v)})`, [`(${poly([g, g * r], v)})(${poly([1, s], v)})`, `${g}(${poly([1, -r], v)})(${poly([1, -s], v)})`, `(${poly([1, r], v)})(${poly([1, s], v)})`, `${g}(${poly(inner, v)})`]),
    tell: `pull out the GCF ${g} first: ${g}(${poly(inner, v).replace(/<\/?sup>/g, '')}) = ${g}(${v} ${r < 0 ? M : '+'} ${Math.abs(r)})(${v} ${s < 0 ? M : '+'} ${Math.abs(s)}). "Completely" means the GCF AND the trinomial.` };
} };

T.diffSquares = { book: 'polys', make(rand) {
  const k = int(rand, 2, 12); const v = pick(rand, ['x', 'n']);
  return { ask: 'Factor', prompt: `${v}${sup(2)} − ${k * k}`, ...mc(rand, `(${v} + ${k})(${v} − ${k})`, [`(${v} − ${k})${sup(2)}`, `(${v} + ${k})${sup(2)}`, `(${v} − ${k * k})(${v} + 1)`, `${v}(${v} − ${k * k})`]),
    tell: `difference of squares: a² − b² = (a + b)(a − b), with b = ${k}.` };
} };

// ------------------------------------------------------------------ quadratics
T.zeroProduct = { book: 'quads', make(rand) {
  const r1 = nz(rand, -12, 12); let r2 = nz(rand, -12, 12); while (r2 === r1 || r2 === -r1) r2 = nz(rand, -12, 12);
  return { ask: 'What are the solutions?', prompt: `${binom(1, -r1)}${binom(1, -r2)} = 0`, ...mc(rand, roots(r1, r2), [roots(-r1, -r2), roots(r1, -r2), roots(-r1, r2), roots(r1 * r2, -r1 * r2)]),
    tell: `Zero Product Property: each factor = 0 → ${roots(r1, r2)}. The signs flip.` };
} };

T.juan = { book: 'quads', make(rand) {
  const r1 = nz(rand, -5, 5); let r2 = nz(rand, -5, 5); while (r2 === r1 || r2 === -r1) r2 = nz(rand, -5, 5); const k = pick(rand, [2, 3, 5, 6]);
  const B = -k * (r1 + r2); const C = k * r1 * r2; // k x² + Bx + C = 0 → k x² + Bx = −C
  const eq = (b, c) => `${k}x${sup(2)} ${b < 0 ? M : '+'} ${Math.abs(b)}x = ${num(c)}`;
  if (B === 0) return T.juan.make(rand);
  return { ask: `Juan's solutions are ${roots(r1, r2)}. Which equation did he solve?`, prompt: 'Only one works.',
    ...mc(rand, eq(B, -C), [eq(-B, -C), eq(B, C), eq(-B, C)]),
    tell: `${k}(x ${r1 < 0 ? '+' : M} ${Math.abs(r1)})(x ${r2 < 0 ? '+' : M} ${Math.abs(r2)}) = ${k}x² ${B < 0 ? M : '+'} ${Math.abs(B)}x ${C < 0 ? M : '+'} ${Math.abs(C)}, so moving the constant: ${eq(B, -C).replace(/<\/?sup>/g, '')}. Or just plug a solution in.` };
} };

T.translation = { book: 'quads', make(rand) {
  const h = nz(rand, -8, 8); const k = nz(rand, -8, 8);
  const say = (hh, kk) => `${Math.abs(hh)} units ${hh > 0 ? 'right' : 'left'} and ${Math.abs(kk)} units ${kk > 0 ? 'up' : 'down'}`;
  return { ask: 'How is the parent function f(x) = x² transformed?', prompt: `f(x) = (x ${h < 0 ? '+' : M} ${Math.abs(h)})${sup(2)} ${k < 0 ? M : '+'} ${Math.abs(k)}`,
    ...mc(rand, say(h, k), [say(-h, k), say(h, -k), say(-h, -k)]),
    tell: `(x − h)² + k: the inside sign is backwards (${h < 0 ? '+' : M} ${Math.abs(h)} means ${Math.abs(h)} ${h > 0 ? 'right' : 'left'}); the outside is honest (${Math.abs(k)} ${k > 0 ? 'up' : 'down'}).` };
} };

T.zerosOf = { book: 'quads', make(rand) {
  const r1 = nz(rand, -9, 9); let r2 = nz(rand, -9, 9); while (r2 === r1 || r2 === -r1) r2 = nz(rand, -9, 9);
  return { ask: 'What are the zeros of the function?', prompt: `g(x) = ${poly([1, -(r1 + r2), r1 * r2])}`, ...mc(rand, roots(r1, r2), [roots(-r1, -r2), roots(r1, -r2), roots(-r1, r2)]),
    tell: `factor: (x ${r1 < 0 ? '+' : M} ${Math.abs(r1)})(x ${r2 < 0 ? '+' : M} ${Math.abs(r2)}) → ${roots(r1, r2)}.` };
} };

T.vertexForm = { book: 'quads', make(rand) {
  const a = pick(rand, [2, 3, -2, 5]); const h = nz(rand, -8, 8); const k = nz(rand, -8, 8);
  return { ask: 'What are the coordinates of the vertex?', prompt: `h(x) = ${num(a)}(x ${h < 0 ? '+' : M} ${Math.abs(h)})${sup(2)} ${k < 0 ? M : '+'} ${Math.abs(k)}`,
    ...mc(rand, pt(h, k), [pt(-h, k), pt(h, -k), pt(-h, -k), pt(a, k), pt(k, h)]),
    tell: `vertex form a(x − h)² + k: the vertex is (h, k) = ${pt(h, k)} — flip the inside sign.` };
} };

T.vertexMeaning = { book: 'quads', make(rand) {
  const v = pick(rand, [48, 64, 74, 80, 96]);
  const Q = [
    { q: 'What does the y-value of the vertex represent?', ans: 'the maximum height reached' },
    { q: 'What does the x-value of the vertex represent?', ans: 'the time it takes to reach the maximum height' },
    { q: 'What does the positive x-intercept represent?', ans: 'the time when the ball hits the ground' },
    { q: 'What does h(0) represent?', ans: 'the initial height when it is kicked' },
  ];
  const q = pick(rand, Q);
  return { ask: q.q, prompt: `A football kicked from the ground: h(t) = −16t${sup(2)} + ${v}t.`, ...mc(rand, q.ans, Q.map((x) => x.ans)), tell: `${q.ans}.` };
} };

T.arrowGround = { book: 'quads', make(rand) {
  const p = int(rand, 3, 8); const q = int(rand, 1, p - 1); // −16(t − p)(t + q) = −16t² + 16(p − q)t + 16pq
  const v = 16 * (p - q); const h0 = 16 * p * q;
  return { ask: 'When does the arrow hit the ground?', prompt: `An arrow is shot from a ${h0}-ft platform at ${v} ft/s: h(t) = −16t${sup(2)} + ${v}t + ${h0}. Seconds:`, typed: p,
    tell: `set h = 0: −16(t² − ${p - q}t − ${p * q}) = −16(t − ${p})(t + ${q}) = 0 → t = ${p} (the negative time is not a time).` };
} };

T.solveQuad = { book: 'quads', make(rand) {
  const r1 = nz(rand, -7, 7); let r2 = nz(rand, -7, 7); while (r2 === r1 || r2 === -r1) r2 = nz(rand, -7, 7); const b = -(r1 + r2); const c = r1 * r2; const moved = rand() < 0.5;
  const prompt = moved ? `x${sup(2)} ${b < 0 ? M : '+'} ${Math.abs(b)}x = ${num(-c)}` : `${poly([1, b, c])} = 0`;
  return { ask: 'Solve', prompt, ...mc(rand, roots(r1, r2), [roots(-r1, -r2), roots(r1, -r2), roots(-r1, r2), `x = ${num(-c)}`]),
    tell: `${moved ? 'get zero on one side first, then ' : ''}factor: (x ${r1 < 0 ? '+' : M} ${Math.abs(r1)})(x ${r2 < 0 ? '+' : M} ${Math.abs(r2)}) = 0 → ${roots(r1, r2)}.` };
} };

// ------------------------------------------------------------------ radicals & stats
T.simplifyRadical = { book: 'radstats', make(rand) {
  const k = pick(rand, [2, 3, 4, 5, 6]); const m = pick(rand, [2, 3, 5, 6, 7, 10]); const n = k * k * m;
  return { ask: 'Simplify the radical expression', prompt: `√${n}`, ...mc(rand, rad(k, m), [rad(m, k), rad(k * k, m), `√${n}`, rad(k, m * k)]),
    tell: `√${n} = √(${k * k} · ${m}) = ${k}√${m}.` };
} };

T.rationalize = { book: 'radstats', make(rand) {
  const p = int(rand, 2, 9); const q = pick(rand, [2, 3, 5, 6, 7]); const g = (a, b) => (b ? g(b, a % b) : a); const d = g(p, q); const top = p / d; const bot = q / d;
  const ans = bot === 1 ? rad(top, q) : `${top === 1 ? '' : top}√${q}/${bot}`;
  return { ask: 'Simplify by rationalizing the denominator', prompt: `${p}/√${q}`, ...mc(rand, ans, [`${p}√${q}`, `${p}/${q}`, `√${q}/${p}`, `${p}√${q}/${q * q}`]),
    tell: `multiply top and bottom by √${q}: ${p}√${q}/${q}${ans !== `${p}√${q}/${q}` ? ` = ${ans}` : ''}.` };
} };

T.addRadicals = { book: 'radstats', make(rand) {
  const m = pick(rand, [2, 3, 5, 6, 7]); const a = int(rand, 2, 9); const b = nz(rand, -8, 9); if (a + b < 2 || a + b === a * b || Math.abs(a - b) === a + b) return T.addRadicals.make(rand);
  return { ask: 'Simplify', prompt: `${a}√${m} ${b < 0 ? M : '+'} ${Math.abs(b)}√${m}`, ...mc(rand, rad(a + b, m), [rad(a + b, 2 * m), rad(a * b, m), `${a + b}√${m * m}`, rad(Math.abs(a - b) || 1, m)]),
    tell: `like radicals add like like terms: (${a} ${b < 0 ? M : '+'} ${Math.abs(b)})√${m} = ${rad(a + b, m)}.` };
} };

T.multiplyRadicals = { book: 'radstats', make(rand) {
  const a = pick(rand, [2, 3, 5, 6, 10]); const b = pick(rand, [2, 3, 5, 6, 10]); const [k, m] = simplify(a * b);
  return { ask: 'Simplify', prompt: `√${a} · √${b}`, ...mc(rand, rad(k, m), [`√${a * b}`, rad(1, a + b), rad(a, b), String(a * b)]),
    tell: `√${a} · √${b} = √${a * b}${k > 1 ? ` = ${rad(k, m)}` : ''}.` };
} };

T.bestMeasure = { book: 'radstats', make(rand) {
  const base = Array.from({ length: 5 }, () => int(rand, 70, 95)).sort((x, y) => x - y); const o = int(rand, 20, 45);
  return { ask: 'Which measure of central tendency best represents the data?', prompt: `${o}, ${base.join(', ')}`, ...mc(rand, 'median', ['mean', 'mode', 'range']),
    tell: `${o} is an outlier that drags the mean down; the median stays with the typical values. (Range is not a measure of center at all.)` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['a system whose graphs are the same line', 'infinitely many solutions'], ['a system whose graphs are parallel lines', 'no solution'],
    ['the number multiplied by itself each period in y = a·bˣ', 'the growth or decay factor'], ['the line an exponential graph approaches but never touches', 'the asymptote'],
    ['a polynomial with exactly three terms', 'trinomial'], ['the point where a parabola turns', 'the vertex'], ['the x-values where a parabola crosses the x-axis', 'the zeros'],
    ['the middle value of a sorted data set', 'the median'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
