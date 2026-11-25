'use strict';
/**
 * At-level check items for ten Pre-Calculus course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   algebraic-fluency-review · combining-functions · domain-range-analysis ·
 *   polynomial-end-behavior · polynomial-zeros-multiplicity ·
 *   exponential-functions-properties · logarithmic-functions-properties ·
 *   logarithm-rules-expansion · solving-exponential-equations ·
 *   solving-logarithmic-equations
 *
 * No picture exists, so every function is given by its rule. A typed answer is
 * one integer or one fraction; an expression, an interval, an exact logarithm
 * or a statement is multiple choice, and each wrong choice is the answer a
 * named slip produces (sign of a zero, a bracket for a parenthesis, the log of
 * a sum, a rejected root kept …).
 *
 * How things are printed: polynomial powers as x², x³; other powers with a
 * caret, 2^(x − 3); logarithms as log₂(x), log(x) for base 10 and ln(x).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelPrecalcA.test.js.
 */

const K = require('./templateKit');
const { int, pick, nonZero } = K;

const COURSE_ID = 'precalculus';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item. */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 600; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 600 tries');
  };
}

/** Multiple choice: the right answer at a drawn position among three distinct wrong ones. */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((x) => x !== c);
  if (w.length < 3) again();
  const options = w.slice(0, 3);
  const pos = int(r, 0, 3);
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

/** A fixed set of four choices, rotated so the key moves. */
function mcFixed(r, opts, correct) {
  if (new Set(opts).size !== 4) again();
  const k = int(r, 0, 3);
  const options = opts.slice(k).concat(opts.slice(0, k));
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : SUP[Number(c)])).join('');
const sub = (n) => String(n).split('').map((c) => SUB[Number(c)]).join('');
const pw = (base, n) => (n === 1 ? base : `${base}${sup(n)}`);
const sg = K.signed;
/** A number with a real minus sign. */
const mn = (n) => (n < 0 ? `−${-n}` : `${n}`);
/** "x − 3", "x + 3", "x". */
const xb = (h) => (h === 0 ? 'x' : `x ${sg(-h)}`);
/** "(x − 3)²", "x²". */
const fx = (h, m = 1) => (h === 0 ? pw('x', m) : `(${xb(h)})${m > 1 ? sup(m) : ''}`);

/** Terms [coefficient, degree] printed in the order given. */
function terms(list) {
  const parts = [];
  for (const [c, d] of list) {
    if (c === 0) continue;
    const a = Math.abs(c);
    const body = d === 0 ? `${a}` : `${a === 1 ? '' : a}${pw('x', d)}`;
    parts.push(parts.length ? ` ${c < 0 ? '−' : '+'} ${body}` : `${c < 0 ? '−' : ''}${body}`);
  }
  return parts.length ? parts.join('') : '0';
}
/** Coefficients, highest power first → "2x³ − x + 4". */
const poly = (cs) => terms(cs.map((c, i) => [c, cs.length - 1 - i]));
/** The same polynomial with the constant first. */
const polyAsc = (cs) => terms(cs.map((c, i) => [c, cs.length - 1 - i]).reverse());

/** a(x − z₁)ᵐ(x − z₂)ⁿ… */
function factored(a, zs) {
  const lead = a === 1 ? '' : a === -1 ? '−' : mn(a);
  return lead + zs.map(([z, m]) => fx(z, m)).join('');
}

/** log₂, log, ln. */
const lg = (b) => (b === 'e' ? 'ln' : b === 10 ? 'log' : `log${sub(b)}`);
const L = (b, arg) => `${lg(b)}(${arg})`;
const anyBase = (r) => pick(r, ['e', 10, 2, 3, 5]);

/** a·b^(x − h) + k. */
function expS(a, b, h, k) {
  const lead = a === 1 ? '' : a === -1 ? '−' : `${mn(a)}·`;
  const e = h === 0 ? 'x' : `(${xb(h)})`;
  return `${lead}${b}^${e}${k === 0 ? '' : ` ${sg(k)}`}`;
}
/** a·log_b(x − h) + k. */
function logS(a, b, h, k) {
  const lead = a === 1 ? '' : a === -1 ? '−' : `${mn(a)}·`;
  return `${lead}${L(b, xb(h))}${k === 0 ? '' : ` ${sg(k)}`}`;
}

const INF = '∞';
const NINF = '−∞';

/** A polynomial of degree n with leading coefficient a and two or three smaller terms. */
function randPoly(r, n, a) {
  const cs = new Array(n + 1).fill(0);
  cs[0] = a;
  const count = int(r, 2, 3);
  const spots = new Set([n]);                       // always a constant
  while (spots.size < Math.min(count, n)) spots.add(int(r, 1, n));
  for (const s of spots) cs[s] = nonZero(r, -9, 9);
  return cs;
}

const distinct = (...xs) => new Set(xs).size === xs.length;

// ── 1. algebraic fluency review ────────────────────────────────────────────

const bin = (a, p) => `(${a === 1 ? '' : a}x ${sg(p)})`;
const ROOT_POWERS = [[4, 2], [9, 2], [25, 2], [8, 3], [27, 3], [64, 3], [125, 3], [16, 4], [81, 4], [32, 5]];

const fluency = {
  courseSkill: 'algebraic-fluency-review',
  skillId: 'pc-algebraic-fluency-review',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const p = nonZero(r, -9, 9), q = nonZero(r, -9, 9);
        if (Math.abs(p) === Math.abs(q)) again();
        return {
          prompt: `Factor completely: ${poly([1, p + q, p * q])}`,
          ...mc(r, `${bin(1, p)}${bin(1, q)}`, [`${bin(1, -p)}${bin(1, -q)}`, `${bin(1, p)}${bin(1, -q)}`, `${bin(1, -p)}${bin(1, q)}`]),
          explanation: `Two numbers that multiply to ${mn(p * q)} and add to ${mn(p + q)} are ${mn(p)} and ${mn(q)}, so the factors are ${bin(1, p)}${bin(1, q)}. Check the signs by multiplying back.`,
        };
      }
      if (idx === 1) {
        const a = int(r, 2, 5), b = int(r, 1, 9);
        if (K.gcd(a, b) !== 1) again();
        return {
          prompt: `Factor completely: ${a * a}x² − ${b * b}`,
          ...mc(r, `(${a}x − ${b})(${a}x + ${b})`, [`(${a}x − ${b})²`, `(${a * a}x − ${b})(x + ${b})`, `(${a}x − ${b * b})(${a}x + 1)`]),
          explanation: `A difference of squares: ${a * a}x² = (${a}x)² and ${b * b} = ${b}², so it factors as (${a}x − ${b})(${a}x + ${b}). (${a}x − ${b})² would leave a middle term.`,
        };
      }
      if (idx === 2) {
        const r1 = nonZero(r, -9, 8), r2 = int(r, r1 + 1, 9);
        if (r2 === 0 || r1 + r2 === 0) again();
        return {
          prompt: `Solve ${poly([1, -(r1 + r2), r1 * r2])} = 0. Enter the larger solution.`,
          value: String(r2),
          explanation: `Factor: ${fx(r1)}${fx(r2)} = 0, so x = ${mn(r1)} or x = ${mn(r2)}. The larger is ${mn(r2)}. A common slip is reading the solutions with the factors' signs.`,
        };
      }
      const [base, root] = pick(r, ROOT_POWERS);
      const p = int(r, 2, 4);
      const rt = Math.round(base ** (1 / root));
      if (K.gcd(p, root) !== 1 || rt ** p > 700) again();
      return {
        prompt: `Evaluate ${base}^(${p}/${root}).`,
        value: String(rt ** p),
        explanation: `The denominator is the root and the numerator is the power: the ${root === 2 ? 'square' : root === 3 ? 'cube' : `${root}th`} root of ${base} is ${rt}, and ${rt}${sup(p)} = ${rt ** p}.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const a = pick(r, [2, 3, 5]), p = nonZero(r, -7, 7), q = nonZero(r, -7, 7);
        if (K.gcd(a, p) !== 1 || p === q || a * q + p === 0 || p === -q) again();
        return {
          prompt: `Factor completely: ${poly([a, a * q + p, p * q])}`,
          ...mc(r, `${bin(a, p)}${bin(1, q)}`, [`${bin(a, q)}${bin(1, p)}`, `${bin(a, -p)}${bin(1, -q)}`, `${bin(a, p)}${bin(1, -q)}`]),
          explanation: `Multiply back to check: ${bin(a, p)}${bin(1, q)} = ${a}x² ${sg(a * q)}x ${sg(p)}x ${sg(p * q)} = ${poly([a, a * q + p, p * q])}. Swapping the two constants changes the middle term.`,
        };
      }
      if (idx === 1) {
        const p = int(r, 2, 7), q = nonZero(r, -8, 8);
        if (Math.abs(q) === p) again();
        return {
          prompt: `Simplify: (${poly([1, p + q, p * q])})/(${poly([1, 0, -p * p])})`,
          ...mc(r, `(${xb(-q)})/(${xb(p)})`, [`(${xb(-q)})/(${xb(-p)})`, `(${xb(q)})/(${xb(p)})`, `(${xb(-p)})/(${xb(p)})`]),
          explanation: `Factor both: ${fx(-p)}${fx(-q)} over ${fx(p)}${fx(-p)}. The common factor ${fx(-p)} cancels, leaving (${xb(-q)})/(${xb(p)}). Only factors cancel, never terms.`,
        };
      }
      if (idx === 2) {
        const a = int(r, 2, 7), b = int(r, 1, 6), p = nonZero(r, -6, 6), q = nonZero(r, -6, 6);
        if (a === b || p === q || (a * q - b * p) % (a - b) !== 0) again();
        const x0 = (a * q - b * p) / (a - b);
        if (x0 === p || x0 === q || Math.abs(x0) > 15) again();
        return {
          prompt: `Solve: ${a}/(${xb(p)}) = ${b}/(${xb(q)})`,
          value: String(x0),
          explanation: `Cross-multiply: ${a}(${xb(q)}) = ${b}(${xb(p)}), so ${a}x ${sg(-a * q)} = ${b}x ${sg(-b * p)} and ${a - b === 1 ? '' : a - b === -1 ? '−' : mn(a - b)}x = ${mn(a * q - b * p)}, x = ${mn(x0)}. It makes neither denominator zero, so it stands.`,
        };
      }
      const k = int(r, 2, 6), m = pick(r, [2, 3, 5, 6, 7, 10]);
      if (k === m) again();
      return {
        prompt: `Simplify: √${k * k * m}`,
        ...mc(r, `${k}√${m}`, [`${m}√${k}`, `${k * k}√${m}`, `${k}√${k * m}`]),
        explanation: `${k * k * m} = ${k * k} · ${m} and √${k * k} = ${k}, so √${k * k * m} = ${k}√${m}. The square ROOT of the perfect square comes out, not the square itself.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, 1, 3), b = int(r, 1, 5), s = pick(r, [1, -1]);
        if (K.gcd(a, b) !== 1 || (a === 1 && b === 1)) again();
        const head = `(${a === 1 ? '' : a}x ${sg(s * b)})`;
        return {
          prompt: `Factor completely: ${poly([a ** 3, 0, 0, s * b ** 3])}`,
          ...mc(r, `${head}(${poly([a * a, -s * a * b, b * b])})`, [
            `${head}(${poly([a * a, s * a * b, b * b])})`,
            `${head}³`,
            `${head}(${poly([a * a, -s * 2 * a * b, b * b])})`,
          ]),
          explanation: `A ${s > 0 ? 'sum' : 'difference'} of cubes: ${a === 1 ? 'x³' : `(${a}x)³`} ${s > 0 ? '+' : '−'} ${b}³ = ${head}(${poly([a * a, -s * a * b, b * b])}). The middle term of the trinomial takes the OPPOSITE sign and is not doubled.`,
        };
      }
      if (idx === 1) {
        const a = int(r, 2, 6), x0 = nonZero(r, -9, 9);
        if (Math.abs(x0) === a) again();
        return {
          prompt: `Solve: 1/(${xb(a)}) + 1/(${xb(-a)}) = ${mn(2 * x0)}/(x² − ${a * a})`,
          value: String(x0),
          explanation: `Multiply every term by (${xb(a)})(${xb(-a)}) = x² − ${a * a}: (${xb(-a)}) + (${xb(a)}) = ${mn(2 * x0)}, so 2x = ${mn(2 * x0)} and x = ${mn(x0)}. It is not ${a} or −${a}, so no denominator is zero.`,
        };
      }
      if (idx === 2) {
        const p = nonZero(r, -6, 6), q = pick(r, [2, 3, 5, 6, 7]);
        return {
          prompt: `Solve using the quadratic formula: ${poly([1, -2 * p, p * p - q])} = 0`,
          ...mc(r, `x = ${mn(p)} ± √${q}`, [`x = ${mn(-p)} ± √${q}`, `x = ${mn(2 * p)} ± 2√${q}`, `x = ${mn(p)} ± 2√${q}`]),
          explanation: `x = (${mn(2 * p)} ± √(${4 * p * p} − ${mn(4 * (p * p - q))}))/2 = (${mn(2 * p)} ± √${4 * q})/2 = (${mn(2 * p)} ± 2√${q})/2 = ${mn(p)} ± √${q}. Both terms of the numerator are divided by 2.`,
        };
      }
      const a = pick(r, [2, 3]), p = pick(r, [2, 3]), m = int(r, 2, 4), n = int(r, 1, 2), rr = int(r, 1, 3);
      const b = pick(r, [a, a ** p]);
      const c = a ** p / b;
      const q = int(r, 1, m * p - 1);
      const X = m * p - q, Y = n * p + rr, Xa = m + p - q;
      if (Xa < 1 || Xa === X) again();
      const co = (v) => (v === 1 ? '' : v);
      return {
        prompt: `Simplify, writing the answer with positive exponents: (${a}${pw('x', m)}y${sup(-n)})${sup(p)}/(${b}${pw('x', q)}${pw('y', rr)})`,
        ...mc(r, `${co(c)}${pw('x', X)}/${pw('y', Y)}`, [
          `${co(c)}${pw('x', Xa)}/${pw('y', n + p + rr)}`,
          `${co(c)}${pw('x', X)}${pw('y', Y)}`,
          `${co(c)}${pw('x', m * p + q)}/${pw('y', Y)}`,
        ]),
        explanation: `Power first: (${a}${pw('x', m)}y${sup(-n)})${sup(p)} = ${a ** p}${pw('x', m * p)}y${sup(-n * p)}. Divide: ${a ** p}/${b} = ${c}, x${sup(m * p)}/${pw('x', q)} = ${pw('x', X)}, and y${sup(-n * p)}/${pw('y', rr)} = y${sup(-Y)} = 1/${pw('y', Y)}. A power of a power MULTIPLIES the exponents.`,
      };
    }) },
  ],
};

// ── 2. combining functions ─────────────────────────────────────────────────

const combining = {
  courseSkill: 'combining-functions',
  skillId: 'pc-combining-functions',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const a = int(r, 2, 5), b = nonZero(r, -9, 9), c = nonZero(r, -6, 6), d = nonZero(r, -9, 9);
      const n = idx === 1 ? int(r, -5, -1) : idx === 2 ? nonZero(r, -3, 3) : int(r, 1, 5);
      const f = a * n + b, gg = n * n + c * n + d;
      const intro = `Let f(x) = ${poly([a, b])} and g(x) = ${poly([1, c, d])}.`;
      const work = `f(${mn(n)}) = ${mn(f)} and g(${mn(n)}) = ${mn(gg)}`;
      if (idx === 0) return { prompt: `${intro} Find (f + g)(${n}).`, value: String(f + gg), explanation: `(f + g)(x) means f(x) + g(x). Here ${work}, so the sum is ${mn(f + gg)}.` };
      if (idx === 1) return { prompt: `${intro} Find (f − g)(${mn(n)}).`, value: String(f - gg), explanation: `(f − g)(x) means f(x) − g(x). Here ${work}, so ${mn(f)} − (${mn(gg)}) = ${mn(f - gg)}. Square the negative input before anything else.` };
      if (idx === 2) return { prompt: `${intro} Find (f · g)(${mn(n)}).`, value: String(f * gg), explanation: `(f · g)(x) means f(x) times g(x) — not f of g. Here ${work}, so the product is ${mn(f * gg)}.` };
      if (gg === 0 || f % gg === 0) again();
      return { prompt: `${intro} Find (f/g)(${n}). Enter a fraction in lowest terms.`, value: K.frac(f, gg), explanation: `(f/g)(x) means f(x) divided by g(x). Here ${work}, so the quotient is ${mn(f)}/${gg < 0 ? `(${mn(gg)})` : gg} = ${K.frac(f, gg).replace('-', '−')}.` };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, 2, 6), b = nonZero(r, -9, 9), c = nonZero(r, -9, 9);
        const d = int(r, 1, 5), e = nonZero(r, -9, 9), h = nonZero(r, -9, 9);
        if (a === d || b === e || c === h || b === -e || c === -h) again();
        return {
          prompt: `Let f(x) = ${poly([a, b, c])} and g(x) = ${poly([d, e, h])}. Which is (f − g)(x)?`,
          ...mc(r, poly([a - d, b - e, c - h]), [poly([a - d, b + e, c + h]), poly([a + d, b + e, c + h]), poly([d - a, e - b, h - c])]),
          explanation: `Subtract every term of g: (${poly([a, b, c])}) − (${poly([d, e, h])}) = ${poly([a - d, b - e, c - h])}. The minus sign reaches all three terms of g, not just the first.`,
        };
      }
      if (idx === 1) {
        const a = int(r, 2, 5), b = nonZero(r, -7, 7), c = int(r, 1, 4), d = nonZero(r, -7, 7);
        if (a * d + b * c === 0 || a * d - b * c === a * d + b * c) again();
        return {
          prompt: `Let f(x) = ${poly([a, b])} and g(x) = ${poly([c, d])}. Which is (f · g)(x)?`,
          ...mc(r, poly([a * c, a * d + b * c, b * d]), [poly([a * c, 0, b * d]), poly([a * c, a * d - b * c, b * d]), poly([a + c, b + d])]),
          explanation: `Multiply each term of f by each term of g: ${a * c}x² ${sg(a * d)}x ${sg(b * c)}x ${sg(b * d)} = ${poly([a * c, a * d + b * c, b * d])}. Multiplying only first by first and last by last drops the middle term.`,
        };
      }
      if (idx === 2) {
        const a = nonZero(r, -9, 9), b = nonZero(r, -8, 8), c = pick(r, [2, 3]);
        if (!distinct(b, c * b, -b, -a)) again();
        const ex = (v) => `All real numbers except x = ${mn(v)}`;
        return {
          prompt: `Let f(x) = ${poly([1, a])} and g(x) = ${poly([c, -c * b])}. What is the domain of (f/g)(x)?`,
          ...mc(r, ex(b), [ex(c * b), ex(-b), ex(-a)]),
          explanation: `A quotient is undefined where its denominator is zero: g(x) = 0 when ${c}x = ${mn(c * b)}, x = ${mn(b)}. The zero of f (x = ${mn(-a)}) is allowed — there the quotient is just 0.`,
        };
      }
      const a = int(r, 2, 9), s = pick(r, [1, -1]);
      const opt = (num, bad) => `${xb(num)}, for x ≠ ${mn(bad)}`;
      const opts = [opt(-a, a), opt(a, -a), opt(-a, -a), opt(a, a)];
      const right = s > 0 ? opt(-a, a) : opt(a, -a);
      return {
        prompt: `Let f(x) = x² − ${a * a} and g(x) = ${xb(s * a)}. Which is (f/g)(x), with its domain restriction?`,
        ...mcFixed(r, opts, right),
        explanation: `f(x) = ${fx(a)}${fx(-a)}, so dividing by ${xb(s * a)} leaves ${xb(-s * a)}. The quotient is still undefined where g(x) = 0, at x = ${mn(s * a)} — the restriction comes from g, not from the simplified form.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, -6, 5), b = int(r, a + 1, a + 7);
        return {
          prompt: `Let f(x) = √(${xb(a)}) and g(x) = ${xb(b)}. What is the domain of (f/g)(x)?`,
          ...mc(r, `[${mn(a)}, ${mn(b)}) ∪ (${mn(b)}, ${INF})`, [`[${mn(a)}, ${INF})`, `(${NINF}, ${mn(b)}) ∪ (${mn(b)}, ${INF})`, `(${mn(a)}, ${mn(b)}) ∪ (${mn(b)}, ${INF})`]),
          explanation: `Both conditions hold at once: the radicand needs x ≥ ${mn(a)}, and g(x) ≠ 0 needs x ≠ ${mn(b)}. So the domain is [${mn(a)}, ${mn(b)}) ∪ (${mn(b)}, ∞). x = ${mn(a)} itself is allowed, since √0 = 0.`,
        };
      }
      if (idx === 1) {
        const c = int(r, 2, 9), a = nonZero(r, -9, 9);
        if (Math.abs(a) === c || -a === c * c) again();
        const ex = (s) => `All real numbers except ${s}`;
        return {
          prompt: `Let f(x) = ${poly([1, a])} and g(x) = x² − ${c * c}. What is the domain of (f/g)(x)?`,
          ...mc(r, ex(`x = −${c} and x = ${c}`), [ex(`x = ${c}`), ex(`x = ${c * c}`), ex(`x = ${mn(-a)}`)]),
          explanation: `g(x) = x² − ${c * c} = (x − ${c})(x + ${c}) is zero at x = ${c} and at x = −${c}, and the quotient is undefined at both. x² = ${c * c} has two solutions, not one.`,
        };
      }
      if (idx === 2) {
        const a = int(r, 2, 4), b = nonZero(r, -5, 5), c = nonZero(r, -5, 5), d = nonZero(r, -6, 6);
        return {
          prompt: `Let f(x) = ${poly([a, b])} and g(x) = ${poly([1, c, d])}. Which is (f · g)(x)?`,
          ...mc(r, poly([a, a * c + b, a * d + b * c, b * d]), [poly([a, a * c, a * d, b * d]), poly([a, a * c - b, a * d - b * c, b * d]), poly([1, c + a, d + b])]),
          explanation: `Distribute both terms of f: ${a}x(${poly([1, c, d])}) = ${poly([a, a * c, a * d, 0])}, and ${mn(b)}(${poly([1, c, d])}) = ${poly([b, b * c, b * d])}. Adding gives ${poly([a, a * c + b, a * d + b * c, b * d])}.`,
        };
      }
      const a = nonZero(r, -9, 9), c = nonZero(r, -8, 8);
      return {
        prompt: `Let f(x) = ${poly([1, a])} and g(x) = √(${xb(c)}). What is the domain of (f/g)(x)?`,
        ...mc(r, `(${mn(c)}, ${INF})`, [`[${mn(c)}, ${INF})`, `(${NINF}, ${mn(c)}) ∪ (${mn(c)}, ${INF})`, `(${mn(-c)}, ${INF})`]),
        explanation: `g needs x ≥ ${mn(c)}, and as a denominator it cannot be 0, which rules out x = ${mn(c)} as well. So x > ${mn(c)}: the interval (${mn(c)}, ∞), open at ${mn(c)}.`,
      };
    }) },
  ],
};

// ── 3. domain and range analysis ───────────────────────────────────────────

const domainRange = {
  courseSkill: 'domain-range-analysis',
  skillId: 'pc-domain-range-analysis',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const c = int(r, 1, 3), rt = nonZero(r, -8, 8), a = nonZero(r, -9, 9);
        if (a === -rt) again();
        return {
          prompt: `What value of x is excluded from the domain of f(x) = (${poly([1, a])})/(${poly([c, -c * rt])})?`,
          value: String(rt),
          explanation: `A rational function is undefined where its denominator is zero: ${poly([c, -c * rt])} = 0 gives x = ${mn(rt)}. The numerator's zero (x = ${mn(-a)}) is in the domain.`,
        };
      }
      if (idx === 1) {
        const a = nonZero(r, -9, 9);
        return {
          prompt: `What is the domain of f(x) = √(${xb(a)})?`,
          ...mc(r, `[${mn(a)}, ${INF})`, [`(${mn(a)}, ${INF})`, `(${NINF}, ${mn(a)}]`, `[${mn(-a)}, ${INF})`]),
          explanation: `The radicand must be at least 0: ${xb(a)} ≥ 0, so x ≥ ${mn(a)}. The endpoint is included because √0 is defined, so the bracket is square.`,
        };
      }
      if (idx === 2) {
        const h = nonZero(r, -8, 8), k = nonZero(r, -9, 9);
        if (h === k) again();
        return {
          prompt: `What is the range of f(x) = ${fx(h, 2)} ${sg(k)}?`,
          ...mc(r, `[${mn(k)}, ${INF})`, [`(${NINF}, ${mn(k)}]`, `[${mn(h)}, ${INF})`, `(${mn(k)}, ${INF})`]),
          explanation: `A square is never negative, so ${fx(h, 2)} ≥ 0 and f(x) ≥ ${mn(k)}, with equality at the vertex x = ${mn(h)}. The range is [${mn(k)}, ∞) — the vertex's y-value, not its x-value.`,
        };
      }
      const a = nonZero(r, -9, 9), b = anyBase(r);
      return {
        prompt: `What is the domain of f(x) = ${L(b, xb(a))}?`,
        ...mc(r, `(${mn(a)}, ${INF})`, [`[${mn(a)}, ${INF})`, `(${mn(-a)}, ${INF})`, `(${NINF}, ${mn(a)})`]),
        explanation: `A logarithm needs a positive argument: ${xb(a)} > 0, so x > ${mn(a)}. The endpoint is NOT included (the log of 0 is undefined), so the parenthesis is round.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const p = nonZero(r, -8, 6), q = int(r, p + 1, 9), n = nonZero(r, -9, 9);
        if (q === 0 || p === -q || -n === p || -n === q) again();
        const three = (u, v) => `(${NINF}, ${mn(u)}) ∪ (${mn(u)}, ${mn(v)}) ∪ (${mn(v)}, ${INF})`;
        return {
          prompt: `What is the domain of f(x) = (${poly([1, n])})/(${poly([1, -(p + q), p * q])})?`,
          ...mc(r, three(p, q), [three(-q, -p), `(${NINF}, ${mn(q)}) ∪ (${mn(q)}, ${INF})`, `(${mn(p)}, ${mn(q)})`]),
          explanation: `Factor the denominator: ${fx(p)}${fx(q)} = 0 at x = ${mn(p)} and x = ${mn(q)}. Both are excluded, everything else is allowed. Reading the zeros with the factors' signs gives the wrong pair.`,
        };
      }
      if (idx === 1) {
        const a = int(r, 1, 4), h = nonZero(r, -8, 8), k = nonZero(r, -9, 9);
        if (h === k) again();
        return {
          prompt: `What is the range of f(x) = −${a === 1 ? '' : a}${fx(h, 2)} ${sg(k)}?`,
          ...mc(r, `(${NINF}, ${mn(k)}]`, [`[${mn(k)}, ${INF})`, `(${NINF}, ${mn(h)}]`, `(${NINF}, ${mn(k)})`]),
          explanation: `The negative coefficient opens the parabola downward, so the vertex (${mn(h)}, ${mn(k)}) is the highest point: f(x) ≤ ${mn(k)}, and ${mn(k)} is reached. The range is (−∞, ${mn(k)}].`,
        };
      }
      if (idx === 2) {
        const a = nonZero(r, -4, 4), h = nonZero(r, -8, 8), k = nonZero(r, -9, 9);
        if (h === k) again();
        const lead = a === 1 ? '' : a === -1 ? '−' : mn(a);
        const up = a > 0;
        return {
          prompt: `What is the range of f(x) = ${lead}|${xb(h)}| ${sg(k)}?`,
          ...(up
            ? mc(r, `[${mn(k)}, ${INF})`, [`(${NINF}, ${mn(k)}]`, `[${mn(h)}, ${INF})`, `[0, ${INF})`])
            : mc(r, `(${NINF}, ${mn(k)}]`, [`[${mn(k)}, ${INF})`, `(${NINF}, ${mn(h)}]`, `(${NINF}, 0]`])),
          explanation: `|${xb(h)}| ≥ 0, and it is multiplied by a ${up ? 'positive' : 'negative'} number, so the V opens ${up ? 'upward' : 'downward'} from its vertex (${mn(h)}, ${mn(k)}). The outputs are ${up ? `${mn(k)} and above` : `${mn(k)} and below`}.`,
        };
      }
      const a = int(r, 1, 4), rt = nonZero(r, -7, 7);
      return {
        prompt: `What is the domain of f(x) = √(${mn(a * rt)} − ${a === 1 ? '' : a}x)?`,
        ...mc(r, `(${NINF}, ${mn(rt)}]`, [`[${mn(rt)}, ${INF})`, `(${NINF}, ${mn(rt)})`, `(${NINF}, ${mn(-rt)}]`]),
        explanation: `${mn(a * rt)} − ${a === 1 ? '' : a}x ≥ 0 means ${a === 1 ? '' : a}x ≤ ${mn(a * rt)}, so x ≤ ${mn(rt)}. Because x is subtracted, the domain runs to the LEFT of ${mn(rt)}, endpoint included.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, -7, 4), b = int(r, a + 2, a + 9);
        return {
          prompt: `What is the domain of f(x) = ln(${xb(a)}) + √(${mn(b)} − x)?`,
          ...mc(r, `(${mn(a)}, ${mn(b)}]`, [`[${mn(a)}, ${mn(b)}]`, `(${mn(a)}, ${mn(b)})`, `(${mn(a)}, ${INF})`]),
          explanation: `Both parts must be defined: the logarithm needs x > ${mn(a)} (strict), the root needs x ≤ ${mn(b)} (endpoint allowed). Together: (${mn(a)}, ${mn(b)}].`,
        };
      }
      if (idx === 1) {
        const a = nonZero(r, -4, 4), h = nonZero(r, -8, 8), k = nonZero(r, -9, 9);
        if (h === k) again();
        const lead = a === 1 ? '' : a === -1 ? '−' : mn(a);
        const up = a > 0;
        return {
          prompt: `What is the range of f(x) = ${lead}√(${xb(h)}) ${sg(k)}?`,
          ...(up
            ? mc(r, `[${mn(k)}, ${INF})`, [`(${NINF}, ${mn(k)}]`, `[${mn(h)}, ${INF})`, `(${mn(k)}, ${INF})`])
            : mc(r, `(${NINF}, ${mn(k)}]`, [`[${mn(k)}, ${INF})`, `(${NINF}, ${mn(h)}]`, `(${NINF}, ${mn(k)})`])),
          explanation: `√(${xb(h)}) takes every value from 0 upward. Multiplying by ${mn(a)} ${up ? 'keeps' : 'reverses'} that, and adding ${mn(k)} shifts it: the outputs run from ${mn(k)} ${up ? 'upward' : 'downward'}, and ${mn(k)} is reached at x = ${mn(h)}. (${mn(h)} is where the DOMAIN starts.)`,
        };
      }
      if (idx === 2) {
        const a = int(r, 2, 9);
        return {
          prompt: `What is the domain of f(x) = √(x² − ${a * a})?`,
          ...mc(r, `(${NINF}, −${a}] ∪ [${a}, ${INF})`, [`[−${a}, ${a}]`, `[${a}, ${INF})`, `(${NINF}, −${a}) ∪ (${a}, ${INF})`]),
          explanation: `x² − ${a * a} ≥ 0 means x² ≥ ${a * a}, which holds when x ≤ −${a} or x ≥ ${a}. Between −${a} and ${a} the radicand is negative. The endpoints give √0 and are included.`,
        };
      }
      const p = nonZero(r, -9, 7), q = int(r, p + 1, 9), n = nonZero(r, -9, 9);
      if (-n === p || -n === q) again();
      return {
        prompt: `f(x) = (${poly([1, n])})/(${poly([1, -(p + q), p * q])}) has two values of x that are not in its domain. Enter the larger one.`,
        value: String(q),
        explanation: `The denominator factors as ${fx(p)}${fx(q)}, which is zero at x = ${mn(p)} and x = ${mn(q)}. The larger of the two is ${mn(q)}.`,
      };
    }) },
  ],
};

// ── 4. polynomial end behavior ─────────────────────────────────────────────

const endStr = (l, rt) => `As x → −∞, f(x) → ${l}; as x → ∞, f(x) → ${rt}`;
const END_ALL = [endStr(NINF, INF), endStr(INF, NINF), endStr(INF, INF), endStr(NINF, NINF)];
/** [left, right] from degree and the sign of the leading coefficient. */
function ends(deg, sign) {
  const right = sign > 0 ? INF : NINF;
  const left = deg % 2 === 0 ? right : (sign > 0 ? NINF : INF);
  return [left, right];
}
const why = (deg, sign) => `${deg % 2 === 0 ? 'Even' : 'Odd'} degree (${deg}) with a ${sign > 0 ? 'positive' : 'negative'} leading coefficient: ${deg % 2 === 0 ? `both ends go ${sign > 0 ? 'up' : 'down'}` : (sign > 0 ? 'down on the left, up on the right' : 'up on the left, down on the right')}.`;
const words = ([l, rt]) => `${l === INF ? 'rises' : 'falls'} to the left and ${rt === INF ? 'rises' : 'falls'} to the right`;

/** "Which function …" — four polynomials, one for each end behavior. */
function whichFunction(r, asc, describe) {
  const n = pick(r, [3, 5]), a = int(r, 2, 6);
  const cands = [[n, a], [n, -a], [n + 1, a], [n + 1, -a]];
  const target = int(r, 0, 3);
  const [td, ta] = cands[target];
  const e = ends(td, ta);
  const texts = cands.map(([d, c]) => `f(x) = ${(asc ? polyAsc : poly)(randPoly(r, d, c))}`);
  return {
    prompt: describe(e),
    ...mcFixed(r, texts, texts[target]),
    explanation: `Only the leading term matters: ${mn(ta)}${pw('x', td)}. ${why(td, ta)} The other choices change the sign of the leading coefficient, the parity of the degree, or both.`,
  };
}

const endBehavior = {
  courseSkill: 'polynomial-end-behavior',
  skillId: 'pc-polynomial-end-behavior',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 3) return whichFunction(r, false, (e) => `The graph of which polynomial function ${words(e)}?`);
      const n = idx === 0 ? pick(r, [3, 5, 7]) : idx === 1 ? pick(r, [4, 6]) : int(r, 3, 8);
      const a = (idx === 1 ? -1 : pick(r, [1, -1])) * int(r, 1, 7);
      const [l, rt] = ends(n, a);
      if (idx === 2) {
        return {
          prompt: `A polynomial function f has degree ${n} and leading coefficient ${mn(a)}. Which describes its end behavior?`,
          ...mcFixed(r, END_ALL, endStr(l, rt)),
          explanation: `${why(n, a)} So ${endStr(l, rt).replace('As', 'as')}.`,
        };
      }
      return {
        prompt: `Which describes the end behavior of f(x) = ${poly(randPoly(r, n, a))}?`,
        ...mcFixed(r, END_ALL, endStr(l, rt)),
        explanation: `The leading term ${terms([[a, n]])} decides it. ${why(n, a)}`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 3) return whichFunction(r, true, ([l, rt]) => `For which polynomial function does f(x) → ${l} as x → −∞ and f(x) → ${rt} as x → ∞?`);
      if (idx === 1) {
        const a = pick(r, [1, -1]) * int(r, 1, 5);
        const zs = [[nonZero(r, -6, 6), 1], [nonZero(r, -6, 6), 2], [nonZero(r, -6, 6), pick(r, [1, 2, 3])]];
        if (!distinct(...zs.map((z) => z[0]))) again();
        const n = zs.reduce((s, z) => s + z[1], 0);
        const [l, rt] = ends(n, a);
        return {
          prompt: `Which describes the end behavior of f(x) = ${factored(a, zs)}?`,
          ...mcFixed(r, END_ALL, endStr(l, rt)),
          explanation: `Add the exponents of the factors for the degree: ${zs.map((z) => z[1]).join(' + ')} = ${n}. Multiplied out, the leading term is ${terms([[a, n]])}. ${why(n, a)}`,
        };
      }
      const n = idx === 0 ? pick(r, [3, 5, 7]) : pick(r, [4, 6]);
      const a = pick(r, [1, -1]) * int(r, 2, 7);
      const [l, rt] = ends(n, a);
      return {
        prompt: `Which describes the end behavior of f(x) = ${polyAsc(randPoly(r, n, a))}?`,
        ...mcFixed(r, END_ALL, endStr(l, rt)),
        explanation: `The terms are not in order: the highest power is ${pw('x', n)}, so the leading term is ${terms([[a, n]])}, not the first term written. ${why(n, a)}`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      let text, n, sign, note;
      if (idx === 0) {
        const a = int(r, 1, 7), b = int(r, 1, 6), c = int(r, 1, 6), m = pick(r, [1, 2]), k = pick(r, [1, 2, 3]);
        const lead = pick(r, [1, -2, -3, 2]);
        text = `${lead === 1 ? '' : mn(lead)}(${a} − x)${fx(-b, m)}${fx(c, k)}`;
        n = 1 + m + k; sign = -lead;
        note = `The factor (${a} − x) contributes −x, so the leading term is ${lead === 1 ? '' : `${mn(lead)} · `}(−x) · ${pw('x', m + k)} = ${terms([[sign, n]])}.`;
      } else if (idx === 1) {
        const c = int(r, 2, 5), p = pick(r, [1, 2, 3]), a = int(r, 1, 6), k = pick(r, [2, 3]), b = int(r, 1, 7);
        text = `−${c}${pw('x', p)}${fx(a, k)}(${b} − x)`;
        n = p + k + 1; sign = c;
        note = `Leading term: −${c}${pw('x', p)} · ${pw('x', k)} · (−x) = ${terms([[sign, n]])} — the two negatives cancel.`;
      } else if (idx === 2) {
        const a = int(r, 2, 5), p = pick(r, [2, 3]), b = int(r, 1, 9), c = int(r, 1, 9), d = pick(r, [1, 2, 3]), q = pick(r, [2, 3, 4]);
        if (p === q) again();
        text = `(${terms([[a, p], [-b, 0]])})(${terms([[c, 0], [-d, q]])})`;
        n = p + q; sign = -a * d;
        note = `Multiply the highest-power terms of each factor: ${terms([[a, p]])} · (${terms([[-d, q]])}) = ${terms([[sign, n]])}.`;
      } else {
        const a = int(r, 1, 7), m = pick(r, [2, 3]), b = int(r, 1, 7), k = pick(r, [1, 2, 3]);
        text = `(${a} − x)${sup(m)}${fx(-b, k)}`;
        n = m + k; sign = m % 2 === 0 ? 1 : -1;
        note = `(${a} − x)${sup(m)} has leading term (−x)${sup(m)} = ${terms([[sign, m]])}, so the whole leading term is ${terms([[sign, n]])}.`;
      }
      const [l, rt] = ends(n, sign);
      return {
        prompt: `Which describes the end behavior of f(x) = ${text}?`,
        ...mcFixed(r, END_ALL, endStr(l, rt)),
        explanation: `${note} ${why(n, sign)}`,
      };
    }) },
  ],
};

// ── 5. zeros and multiplicity ──────────────────────────────────────────────

function zeroSet(r, mults, lo = -7, hi = 7) {
  const zs = mults.map((m) => [nonZero(r, lo, hi), m]);
  if (!distinct(...zs.map((z) => Math.abs(z[0])))) again();
  return zs;
}
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = int(r, 0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const listZ = (zs) => `x = ${zs.slice().sort((p, q) => p - q).map(mn).join(', ')}`;

const zeros = {
  courseSkill: 'polynomial-zeros-multiplicity',
  skillId: 'pc-polynomial-zeros-multiplicity',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const zs = zeroSet(r, shuffle(r, [1, pick(r, [2, 4]), 3]));
        const a = pick(r, [1, 2, -1, 3]);
        const [z, m] = pick(r, zs);
        return {
          prompt: `For f(x) = ${factored(a, zs)}, what is the multiplicity of the zero x = ${mn(z)}?`,
          value: String(m),
          explanation: `x = ${mn(z)} comes from the factor ${fx(z)}, which appears to the power ${m}. The multiplicity is that exponent: ${m}.`,
        };
      }
      if (idx === 1) {
        const zs = zeroSet(r, shuffle(r, [1, pick(r, [2, 4]), 3]));
        const even = zs.find((z) => z[1] % 2 === 0);
        return {
          prompt: `At which zero does the graph of f(x) = ${factored(1, zs)} touch the x-axis and turn back without crossing it? Enter the x-value.`,
          value: String(even[0]),
          explanation: `A graph touches and turns at a zero of EVEN multiplicity. Only ${fx(even[0], even[1])} has an even exponent, and it is zero at x = ${mn(even[0])}. At the other zeros (odd multiplicity) the graph crosses.`,
        };
      }
      if (idx === 2) {
        const zs = zeroSet(r, [1, 1, 1]).map((z) => z[0]);
        const a = pick(r, [2, 3, 4, 5, -2, -3]);
        if (!zs.some((z) => z < 0) || !zs.some((z) => z > 0) || zs.includes(a)) again();
        return {
          prompt: `What are the zeros of f(x) = ${factored(a, zs.map((z) => [z, 1]))}?`,
          ...mc(r, listZ(zs), [listZ(zs.map((z) => -z)), listZ([...zs, a]), listZ(zs.map((z) => Math.abs(z)))]),
          explanation: `Set each factor to zero: ${zs.map((z) => `${xb(z)} = 0 gives x = ${mn(z)}`).join('; ')}. A factor (x + c) gives the zero −c. The constant ${mn(a)} in front is never zero, so it adds no zero.`,
        };
      }
      const n = int(r, 3, 7);
      return {
        prompt: `What is the greatest number of turning points the graph of f(x) = ${poly(randPoly(r, n, nonZero(r, -5, 5)))} can have?`,
        value: String(n - 1),
        explanation: `A polynomial of degree n has at most n − 1 turning points. The degree here is ${n}, so the most is ${n - 1}. (${n} is the most ZEROS it can have.)`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const [[z1], [z2]] = zeroSet(r, [2, 1]);
        return {
          prompt: `Which polynomial function of least degree, with leading coefficient 1, has a zero at x = ${mn(z1)} with multiplicity 2 and a zero at x = ${mn(z2)} with multiplicity 1?`,
          ...mc(r, `f(x) = ${fx(z1, 2)}${fx(z2)}`, [`f(x) = ${fx(-z1, 2)}${fx(-z2)}`, `f(x) = ${fx(z1)}${fx(z2, 2)}`, `f(x) = 2${fx(z1)}${fx(z2)}`]),
          explanation: `A zero at x = c gives the factor (x − c), and its multiplicity is the exponent: ${fx(z1, 2)}${fx(z2)}. The zero ${mn(z1)} needs ${fx(z1)}, with the opposite sign inside.`,
        };
      }
      if (idx === 1) {
        const zs = zeroSet(r, [pick(r, [1, 2, 3]), pick(r, [1, 2])]);
        const m0 = pick(r, [1, 2, 3]), a = pick(r, [1, 2, -3, 4]);
        const all = [[0, m0], ...zs];
        const sum = zs[0][0] + zs[1][0];
        return {
          prompt: `What is the sum of the distinct zeros of f(x) = ${factored(a, all)}?`,
          value: String(sum),
          explanation: `The distinct zeros are x = 0 (from the factor ${pw('x', m0)}), x = ${mn(zs[0][0])} and x = ${mn(zs[1][0])}. Each counts once whatever its exponent: 0 + (${mn(zs[0][0])}) + (${mn(zs[1][0])}) = ${mn(sum)}.`,
        };
      }
      if (idx === 2) {
        const [[z1, m1], [z2, m2]] = zeroSet(r, [pick(r, [2, 4]), pick(r, [1, 3])]);
        const a = pick(r, [1, -1, 2, -2]);
        const zs = shuffle(r, [[z1, m1], [z2, m2]]);
        const T = (u, v) => `Touches the x-axis at x = ${mn(u)} and crosses it at x = ${mn(v)}`;
        return {
          prompt: `Which describes the graph of f(x) = ${factored(a, zs)} at its x-intercepts?`,
          ...mcFixed(r, [T(z1, z2), T(z2, z1), T(-z1, -z2), T(-z2, -z1)], T(z1, z2)),
          explanation: `x = ${mn(z1)} has even multiplicity (${m1}), so the graph touches and turns there; x = ${mn(z2)} has odd multiplicity (${m2}), so it crosses. The zero of ${fx(z1)} is ${mn(z1)}, not ${mn(-z1)}.`,
        };
      }
      const m0 = int(r, 1, 3), zs = zeroSet(r, [int(r, 1, 3), int(r, 1, 2)]);
      const n = m0 + zs[0][1] + zs[1][1];
      return {
        prompt: `What is the greatest number of turning points the graph of f(x) = ${factored(1, [[0, m0], ...zs])} can have?`,
        value: String(n - 1),
        explanation: `Add the exponents for the degree: ${m0} + ${zs[0][1]} + ${zs[1][1]} = ${n}. A degree-${n} polynomial has at most ${n} − 1 = ${n - 1} turning points.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const z1 = nonZero(r, -4, 4), z2 = nonZero(r, -5, 5), k = nonZero(r, -4, 4);
        if (Math.abs(z1) === Math.abs(z2) || k === 1) again();
        const c = k * z1 * z1 * -z2;
        return {
          prompt: `A polynomial function f of degree 3 has a zero of multiplicity 2 at x = ${mn(z1)} and a zero at x = ${mn(z2)}, and f(0) = ${mn(c)}. What is its leading coefficient?`,
          value: String(k),
          explanation: `f(x) = a${fx(z1, 2)}${fx(z2)}. Then f(0) = a · (${mn(-z1)})² · (${mn(-z2)}) = ${mn(z1 * z1 * -z2)}a. Setting ${mn(z1 * z1 * -z2)}a = ${mn(c)} gives a = ${mn(k)}.`,
        };
      }
      if (idx === 1) {
        const a = nonZero(r, -6, 6);
        const Z = (s) => `x = 0 (multiplicity 2) and x = ${mn(s)} (multiplicity 2)`;
        return {
          prompt: `Find the zeros of f(x) = ${poly([1, -2 * a, a * a, 0, 0])} and their multiplicities.`,
          ...mc(r, Z(a), [Z(-a), `x = 0 (multiplicity 1) and x = ${mn(a)} (multiplicity 3)`, `x = 0 (multiplicity 2), x = ${mn(a)} (multiplicity 1) and x = ${mn(-a)} (multiplicity 1)`]),
          explanation: `Factor out x²: x²(${poly([1, -2 * a, a * a])}) = x²${fx(a, 2)}, a perfect-square trinomial. So x = 0 and x = ${mn(a)} are each zeros of multiplicity 2 (total 4, the degree).`,
        };
      }
      if (idx === 2) {
        const m1 = int(r, 1, 3), m2 = int(r, 1, 3), m3 = int(r, 1, 4);
        const [[a], [b], [c]] = zeroSet(r, [1, 1, 1]);
        const n = m1 + m2 + m3;
        return {
          prompt: `A polynomial function of degree ${n} has only real zeros, and exactly three of them are distinct: x = ${mn(a)} with multiplicity ${m1}, x = ${mn(b)} with multiplicity ${m2}, and x = ${mn(c)}. What is the multiplicity of x = ${mn(c)}?`,
          value: String(m3),
          explanation: `Counted with multiplicity, a polynomial of degree ${n} has exactly ${n} zeros. So ${m1} + ${m2} + m = ${n}, and m = ${m3}.`,
        };
      }
      const zs = zeroSet(r, [int(r, 1, 4), int(r, 1, 4), int(r, 1, 4)]);
      const q = int(r, 1, 9), a = pick(r, [1, -1, 2, -2]);
      const odd = zs.filter((z) => z[1] % 2 === 1).length;
      if (odd === 3) again();
      return {
        prompt: `At how many of its x-intercepts does the graph of f(x) = ${factored(a, zs)}(x² + ${q}) cross the x-axis?`,
        value: String(odd),
        explanation: `The graph crosses at zeros of odd multiplicity and only touches at zeros of even multiplicity. The exponents are ${zs.map((z) => z[1]).join(', ')}, so ${odd} of the zeros ${odd === 1 ? 'is a crossing' : 'are crossings'}. x² + ${q} is never zero, so it adds no intercept.`,
      };
    }) },
  ],
};

// ── 6. exponential functions ───────────────────────────────────────────────

const dirH = (h) => `${h > 0 ? 'right' : 'left'} ${Math.abs(h)} unit${Math.abs(h) === 1 ? '' : 's'}`;
const dirV = (k) => `${k > 0 ? 'up' : 'down'} ${Math.abs(k)} unit${Math.abs(k) === 1 ? '' : 's'}`;

const exponential = {
  courseSkill: 'exponential-functions-properties',
  skillId: 'pc-exponential-functions-properties',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, 2, 5), b = int(r, 2, 5), h = nonZero(r, -5, 5), k = nonZero(r, -9, 9);
        if (Math.abs(h) === Math.abs(k)) again();
        return {
          prompt: `What is the horizontal asymptote of f(x) = ${expS(a, b, h, k)}?`,
          ...mc(r, `y = ${mn(k)}`, ['y = 0', `x = ${mn(k)}`, `y = ${mn(h)}`]),
          explanation: `As x → −∞, ${b}^(${xb(h)}) → 0, so f(x) → ${mn(k)}. The vertical shift moves the asymptote from y = 0 to y = ${mn(k)}; the horizontal shift does not affect it.`,
        };
      }
      if (idx === 1) {
        const b = pick(r, [0.5, 0.25, 0.8, 0.6, 0.9]), A = int(r, 2, 9);
        return {
          prompt: 'Which function models exponential decay?',
          ...mc(r, `y = ${A}·(${b})^x`, [`y = ${b}·${A}^x`, `y = ${A}·(${Number((1 + b).toFixed(2))})^x`, `y = ${b}·(${Number((1 + b).toFixed(2))})^x`]),
          explanation: `In y = a·b^x the BASE decides: decay when 0 < b < 1. Only ${A}·(${b})^x has a base below 1. A small starting value a (like ${b}) does not make a function decay.`,
        };
      }
      if (idx === 2) {
        const a = nonZero(r, -6, 6), b = int(r, 2, 6), k = nonZero(r, -9, 9);
        if (a === 1 || a === -1) again();
        return {
          prompt: `What is the y-coordinate of the y-intercept of f(x) = ${expS(a, b, 0, k)}?`,
          value: String(a + k),
          explanation: `Set x = 0: ${b}^0 = 1, so f(0) = ${mn(a)} · 1 ${sg(k)} = ${mn(a + k)}. Any base to the power 0 is 1, not 0.`,
        };
      }
      const b = int(r, 2, 6), k = nonZero(r, -9, 9);
      return {
        prompt: `What is the range of f(x) = ${expS(1, b, 0, k)}?`,
        ...mc(r, `(${mn(k)}, ${INF})`, [`[${mn(k)}, ${INF})`, `(0, ${INF})`, `(${NINF}, ${INF})`]),
        explanation: `${b}^x is always positive but never 0, so f(x) is always greater than ${mn(k)} and never equal to it: (${mn(k)}, ∞), with a round parenthesis. (All real numbers is the DOMAIN.)`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const a = int(r, 1, 5), b = int(r, 2, 5), h = nonZero(r, -5, 5), k = nonZero(r, -9, 9);
        return {
          prompt: `What is the range of f(x) = ${expS(-a, b, h, k)}?`,
          ...mc(r, `(${NINF}, ${mn(k)})`, [`(${mn(k)}, ${INF})`, `(${NINF}, ${mn(k)}]`, `(${NINF}, 0)`]),
          explanation: `${b}^(${xb(h)}) > 0, and the negative coefficient flips it below zero; adding ${mn(k)} gives values below ${mn(k)}. The asymptote y = ${mn(k)} is never reached, so the range is (−∞, ${mn(k)}).`,
        };
      }
      if (idx === 1) {
        const b = int(r, 2, 6);
        const inc = int(r, 0, 1) === 1;
        const F = (s) => `f(x) = ${s}`;
        return inc ? {
          prompt: 'Which function is increasing on its entire domain?',
          ...mcFixed(r, [F(`(1/${b})^(−x)`), F(`(1/${b})^x`), F(`${b}^(−x)`), F(`−${b}^x`)], F(`(1/${b})^(−x)`)),
          explanation: `(1/${b})^(−x) = (${b}^(−1))^(−x) = ${b}^x, which is growth. (1/${b})^x and ${b}^(−x) are both decay, and −${b}^x is ${b}^x reflected downward, so it falls.`,
        } : {
          prompt: 'Which function is decreasing on its entire domain?',
          ...mcFixed(r, [F(`${b}^(−x)`), F(`(1/${b})^(−x)`), F(`${b}^x`), F(`−(1/${b})^x`)], F(`${b}^(−x)`)),
          explanation: `${b}^(−x) = (1/${b})^x, a base below 1, so it decays. (1/${b})^(−x) equals ${b}^x (growth), and −(1/${b})^x is a decaying curve reflected over the x-axis, so it rises toward 0.`,
        };
      }
      if (idx === 2) {
        const b = int(r, 2, 4), h = int(r, 1, 2), a = nonZero(r, -7, 7), k = nonZero(r, -6, 6);
        if (a % b === 0) again();
        const v = K.frac(a + k * b ** h, b ** h);
        return {
          prompt: `What is the y-coordinate of the y-intercept of f(x) = ${expS(a, b, h, k)}? Enter a fraction in lowest terms.`,
          value: v,
          explanation: `f(0) = ${mn(a)} · ${b}^(−${h}) ${sg(k)} = ${mn(a)}/${b ** h} ${sg(k)} = ${v.replace('-', '−')}. A negative exponent means a reciprocal: ${b}^(−${h}) = 1/${b ** h}.`,
        };
      }
      const b = int(r, 2, 5), h = nonZero(r, -6, 6), k = nonZero(r, -6, 6);
      if (Math.abs(h) === Math.abs(k)) again();
      const S = (hh, kk) => `Shifted ${dirH(hh)} and ${dirV(kk)}`;
      return {
        prompt: `How is the graph of g(x) = ${expS(1, b, h, k)} obtained from the graph of f(x) = ${b}^x?`,
        ...mcFixed(r, [S(h, k), S(-h, k), S(Math.sign(h) * Math.abs(k), Math.sign(k) * Math.abs(h)), S(-h, -k)], S(h, k)),
        explanation: `x is replaced by ${xb(h)}, which moves the graph ${dirH(h)} (the opposite of the sign you see), and ${sg(k)} outside moves it ${dirV(k)}.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const a = nonZero(r, -5, 5), h = nonZero(r, -5, 5), k = nonZero(r, -9, 9);
        if (a === k || h === k) again();
        return {
          prompt: `Let f(x) = ${expS(a, 'e', h, k)}. What value does f(x) approach as x → −∞?`,
          value: String(k),
          explanation: `As x → −∞, e^(${xb(h)}) → 0, so ${mn(a)} · e^(${xb(h)}) → 0 and f(x) → ${mn(k)}. That is the horizontal asymptote y = ${mn(k)}.`,
        };
      }
      if (idx === 1) {
        const b = int(r, 2, 5), n = int(r, 2, 3), a = int(r, 2, 9);
        return {
          prompt: `An exponential function f(x) = a·b^x with b > 0 passes through (0, ${a}) and (${n}, ${a * b ** n}). What is b?`,
          value: String(b),
          explanation: `f(0) = a = ${a}. Then ${a}·b${sup(n)} = ${a * b ** n}, so b${sup(n)} = ${b ** n} and b = ${b}. Divide by a first — do not take the root of ${a * b ** n}.`,
        };
      }
      if (idx === 2) {
        const b = pick(r, [2, 3, 5]), n = pick(r, [2, 3]);
        if (b === 2 && n === 2) again();
        const F = (s) => `g(x) = ${s}`;
        return {
          prompt: `Which function is equivalent to f(x) = ${b}^(x + ${n})?`,
          ...mc(r, F(`${b ** n}·${b}^x`), [F(`${b}^x + ${b ** n}`), F(`${b * n}·${b}^x`), F(`${b}^(${n}x)`)]),
          explanation: `${b}^(x + ${n}) = ${b}^x · ${b}${sup(n)} = ${b ** n}·${b}^x: adding in the exponent is MULTIPLYING by ${b}${sup(n)} = ${b ** n}. So a shift left ${n} is the same as a vertical stretch by ${b ** n}.`,
        };
      }
      const b = pick(r, [2, 3, 4, 'e']), k = int(r, 1, 9);
      const F = (s) => `f(x) = ${s}`;
      return {
        prompt: `Which function has horizontal asymptote y = ${k} and range (−∞, ${k})?`,
        ...mcFixed(r, [F(`−${b}^x + ${k}`), F(`${b}^x + ${k}`), F(`${b}^(−x) + ${k}`), F(`−${b}^(x − ${k})`)], F(`−${b}^x + ${k}`)),
        explanation: `The + ${k} outside sets the asymptote y = ${k}; the leading minus reflects ${b}^x so the values lie BELOW it. ${b}^(−x) + ${k} is reflected the other way (over the y-axis) and still lies above ${k}.`,
      };
    }) },
  ],
};

// ── 7. logarithmic functions ───────────────────────────────────────────────

const LOG_POW = { 2: [2, 6], 3: [2, 4], 4: [2, 3], 5: [2, 3], 10: [2, 4] };
const ROOT_BASES = [[4, 2, 2], [8, 2, 3], [16, 2, 4], [9, 3, 2], [27, 3, 3], [25, 5, 2]];   // [base, prime, power]

const logarithmic = {
  courseSkill: 'logarithmic-functions-properties',
  skillId: 'pc-logarithmic-functions-properties',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const b = pick(r, [2, 3, 4, 5, 10]);
      const n = int(r, ...LOG_POW[b]);
      if (idx === 0) {
        return {
          prompt: `Evaluate ${L(b, b ** n)}.`,
          value: String(n),
          explanation: `${L(b, b ** n)} asks: ${b} to what power is ${b ** n}? ${b}^${n} = ${b ** n}, so the value is ${n}.`,
        };
      }
      if (idx === 1) {
        if ((b === 2 && n === 4) || (b === 4 && n === 2) || b === n) again();
        const N = b ** n;
        return {
          prompt: `Which exponential equation is equivalent to ${L(b, N)} = ${n}?`,
          ...mc(r, `${b}^${n} = ${N}`, [`${n}^${b} = ${N}`, `${b}^${N} = ${n}`, `${N}^${n} = ${b}`]),
          explanation: `log_b(x) = y means b^y = x: the base stays the base, and the logarithm IS the exponent. So ${b}^${n} = ${N}.`,
        };
      }
      if (idx === 2) {
        const h = nonZero(r, -8, 8), k = nonZero(r, -8, 8);
        if (Math.abs(h) === Math.abs(k)) again();
        return {
          prompt: `What is the vertical asymptote of f(x) = ${logS(1, b, h, k)}?`,
          ...mc(r, `x = ${mn(h)}`, [`x = ${mn(-h)}`, `y = ${mn(h)}`, `y = ${mn(k)}`]),
          explanation: `The asymptote is where the argument is zero: ${xb(h)} = 0 at x = ${mn(h)}. It is a vertical line (x = …); the ${sg(k)} only moves the graph up or down.`,
        };
      }
      const bb = pick(r, [2, 3, 4, 5]);
      const nn = int(r, ...LOG_POW[bb]);
      return {
        prompt: `Evaluate ${L(bb, `1/${bb ** nn}`)}.`,
        value: String(-nn),
        explanation: `1/${bb ** nn} = ${bb}^(−${nn}), so the logarithm is −${nn}. A logarithm of a number between 0 and 1 is negative — it is the argument that can never be negative, not the answer.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const b = pick(r, [2, 3, 5, 'e', 10]), h = nonZero(r, -7, 7);
        const base = b === 'e' ? 'e' : b;
        const F = (s) => `f⁻¹(x) = ${s}`;
        return {
          prompt: `What is the inverse of f(x) = ${L(b, xb(h))}?`,
          ...mc(r, F(`${base}^x ${sg(h)}`), [F(`${base}^x ${sg(-h)}`), F(`${base}^(${xb(h)})`), F(`${base}^(${xb(-h)})`)]),
          explanation: `Swap and solve: x = ${L(b, `y ${sg(-h)}`)} means y ${sg(-h)} = ${base}^x, so y = ${base}^x ${sg(h)}. The shift is undone OUTSIDE the exponential, not inside the exponent.`,
        };
      }
      if (idx === 1) {
        const b = pick(r, [2, 3, 4, 5]), n = int(r, 1, b > 3 ? 2 : 3), h = nonZero(r, -9, 9);
        return {
          prompt: `What is the x-intercept of f(x) = ${logS(1, b, h, -n)}? Enter the x-value.`,
          value: String(h + b ** n),
          explanation: `Set f(x) = 0: ${L(b, xb(h))} = ${n}, so ${xb(h)} = ${b}^${n} = ${b ** n} and x = ${mn(h + b ** n)}.`,
        };
      }
      if (idx === 2) {
        const [base, p, m] = pick(r, ROOT_BASES);
        const n = int(r, 1, p === 2 ? 7 : 5);
        if (n % m === 0) again();
        return {
          prompt: `Evaluate ${L(base, p ** n)}. Enter a fraction in lowest terms.`,
          value: K.frac(n, m),
          explanation: `Write both as powers of ${p}: ${base} = ${p}${sup(m)} and ${p ** n} = ${pw(String(p), n)}. Then (${p}${sup(m)})^y = ${pw(String(p), n)} gives ${m}y = ${n}, y = ${K.frac(n, m)}.`,
        };
      }
      const b = pick(r, [2, 3, 5, 10, 'e']), a = int(r, 1, 4), rt = nonZero(r, -7, 7);
      return {
        prompt: `What is the domain of f(x) = ${L(b, `${mn(a * rt)} − ${a === 1 ? '' : a}x`)}?`,
        ...mc(r, `(${NINF}, ${mn(rt)})`, [`(${mn(rt)}, ${INF})`, `(${NINF}, ${mn(rt)}]`, `(${NINF}, ${mn(-rt)})`]),
        explanation: `The argument must be positive: ${mn(a * rt)} − ${a === 1 ? '' : a}x > 0, so ${a === 1 ? '' : a}x < ${mn(a * rt)} and x < ${mn(rt)}. Strict inequality, so ${mn(rt)} is not included.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const b = pick(r, [2, 3, 5, 10, 'e']), h = nonZero(r, -6, 6), k = nonZero(r, -6, 6);
        const T = (ax, hh) => `Reflected across the ${ax}-axis, then shifted ${dirH(hh)} and ${dirV(k)}`;
        return {
          prompt: `How is the graph of g(x) = ${logS(-1, b, h, k)} obtained from the graph of f(x) = ${L(b, 'x')}?`,
          ...mcFixed(r, [T('x', h), T('y', h), T('x', -h), T('y', -h)], T('x', h)),
          explanation: `The minus sign multiplies the OUTPUT, which reflects across the x-axis. ${xb(h)} inside moves the graph ${dirH(h)}, and ${sg(k)} moves it ${dirV(k)}.`,
        };
      }
      if (idx === 1) {
        const b = pick(r, [2, 3, 5, 'e']), n = int(r, 2, 12), m = int(r, 2, 6), s = pick(r, [1, -1]);
        if (n === m || n === b) again();
        return {
          prompt: `Evaluate: ${b}^(${L(b, n)}) ${s > 0 ? '+' : '−'} ${L(b, `${b}^${m}`)}`,
          value: String(n + s * m),
          explanation: `Exponentials and logarithms of the same base undo each other: ${b}^(${L(b, n)}) = ${n} and ${L(b, `${b}^${m}`)} = ${m}. So the value is ${n} ${s > 0 ? '+' : '−'} ${m} = ${mn(n + s * m)}.`,
        };
      }
      if (idx === 2) {
        const b = pick(r, [2, 3, 5]), n = int(r, 2, b === 2 ? 5 : 3), a = nonZero(r, -4, 4), k = nonZero(r, -9, 9);
        if (a === 1) again();
        return {
          prompt: `What is the y-coordinate of the y-intercept of f(x) = ${logS(a, b, -(b ** n), k)}?`,
          value: String(a * n + k),
          explanation: `f(0) = ${mn(a)} · ${L(b, b ** n)} ${sg(k)} = ${mn(a)} · ${n} ${sg(k)} = ${mn(a * n + k)}, since ${b}^${n} = ${b ** n}.`,
        };
      }
      const b = pick(r, [2, 3, 5, 10, 'e']), h = nonZero(r, -8, 8), k = nonZero(r, -8, 8);
      if (Math.abs(h) === Math.abs(k)) again();
      const all = `(${NINF}, ${INF})`;
      const right = `Domain (${mn(h)}, ${INF}); range ${all}; vertical asymptote x = ${mn(h)}`;
      return {
        prompt: `Which line correctly describes f(x) = ${logS(1, b, h, k)}?`,
        ...mcFixed(r, [
          right,
          `Domain (${mn(h)}, ${INF}); range (${mn(k)}, ${INF}); vertical asymptote x = ${mn(h)}`,
          `Domain ${all}; range (${mn(k)}, ${INF}); horizontal asymptote y = ${mn(k)}`,
          `Domain (${mn(-h)}, ${INF}); range ${all}; vertical asymptote x = ${mn(-h)}`,
        ], right),
        explanation: `The argument ${xb(h)} must be positive, so the domain is (${mn(h)}, ∞) with the asymptote x = ${mn(h)}. A logarithm takes every real value, so the range is all real numbers whatever the vertical shift. A restricted range and a horizontal asymptote belong to the exponential.`,
      };
    }) },
  ],
};

// ── 8. logarithm rules ─────────────────────────────────────────────────────

const LOG_SUMS = [[6, 4, 9, 2], [6, 8, 27, 3], [6, 12, 3, 2], [10, 4, 25, 2], [10, 8, 125, 3], [10, 20, 5, 2], [10, 40, 25, 3], [12, 9, 16, 2], [12, 48, 3, 2], [15, 9, 25, 2], [14, 4, 49, 2]];
const kT = (c, t) => (c === 1 ? t : `${c}·${t}`);

const logRules = {
  courseSkill: 'logarithm-rules-expansion',
  skillId: 'pc-logarithm-rules-expansion',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const b = anyBase(r), n = int(r, 2, 5);
      const X = L(b, 'x'), Y = L(b, 'y');
      if (idx === 0) {
        return {
          prompt: `Expand: ${L(b, `${pw('x', n)}y`)}`,
          ...mc(r, `${n}·${X} + ${Y}`, [`${n}·${X}·${Y}`, `${n}·${X} − ${Y}`, `${L(b, `${n}x`)} + ${Y}`]),
          explanation: `Product rule, then power rule: ${L(b, pw('x', n))} + ${Y} = ${n}·${X} + ${Y}. A product inside becomes a SUM of logs, and the exponent comes out in front as a factor.`,
        };
      }
      if (idx === 1) {
        return {
          prompt: `Expand: ${L(b, `x/${pw('y', n)}`)}`,
          ...mc(r, `${X} − ${n}·${Y}`, [`${X}/(${n}·${Y})`, `${X} + ${n}·${Y}`, `${n}·${X} − ${n}·${Y}`]),
          explanation: `Quotient rule, then power rule: ${X} − ${L(b, pw('y', n))} = ${X} − ${n}·${Y}. The log of a quotient is a DIFFERENCE of logs, not a quotient of logs, and the exponent belongs to y only.`,
        };
      }
      if (idx === 2) {
        return {
          prompt: `Write as a single logarithm: ${X} + ${n}·${Y}`,
          ...mc(r, L(b, `x${pw('y', n)}`), [L(b, `x + ${pw('y', n)}`), L(b, `${n}xy`), L(b, `(xy)${sup(n)}`)]),
          explanation: `Power rule first: ${n}·${Y} = ${L(b, pw('y', n))}. Then a sum of logs is the log of the PRODUCT: ${L(b, `x${pw('y', n)}`)}. The coefficient becomes an exponent on y alone.`,
        };
      }
      const [B, p, q, v] = pick(r, LOG_SUMS);
      return {
        prompt: `Evaluate: ${L(B, p)} + ${L(B, q)}`,
        value: String(v),
        explanation: `Product rule: ${L(B, p)} + ${L(B, q)} = ${L(B, p * q)}, and ${B}^${v} = ${p * q}, so the value is ${v}. (It is not the log of ${p + q}.)`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const b = pick(r, [2, 3, 5]), c = b === 5 ? 2 : int(r, 2, 3), m = int(r, 2, 4);
        const X = L(b, 'x'), Y = L(b, 'y'), N = b ** c;
        return {
          prompt: `Expand and simplify: ${L(b, `${N}${pw('x', m)}/y`)}`,
          ...mc(r, `${c} + ${m}·${X} − ${Y}`, [`${N} + ${m}·${X} − ${Y}`, `${c} + ${m}·${X} + ${Y}`, `${c * m}·${X} − ${Y}`]),
          explanation: `${L(b, N)} + ${L(b, pw('x', m))} − ${Y} = ${c} + ${m}·${X} − ${Y}, because ${b}^${c} = ${N}. The constant becomes ${L(b, N)} = ${c} (not ${N}), and it is added, not multiplied in.`,
        };
      }
      if (idx === 1) {
        const p = int(r, 2, 4), q = int(r, 2, 4);
        return {
          prompt: `Write as a single logarithm: ${p}·ln(x) − ${q}·ln(y) + ln(z)`,
          ...mc(r, `ln(${pw('x', p)}z/${pw('y', q)})`, [`ln(${pw('x', p)}/(${pw('y', q)}z))`, `ln(${p}xz/(${q}y))`, `ln(${pw('x', p)} − ${pw('y', q)} + z)`]),
          explanation: `Coefficients become exponents: ln(${pw('x', p)}) − ln(${pw('y', q)}) + ln(z). Added logs multiply (top), the subtracted log divides (bottom): ln(${pw('x', p)}z/${pw('y', q)}). Only y is subtracted, so only y goes underneath.`,
        };
      }
      if (idx === 2) {
        const b = anyBase(r), n = int(r, 2, 5);
        const X = L(b, 'x'), Y = L(b, 'y');
        return {
          prompt: `Expand: ${L(b, `√x/${pw('y', n)}`)}`,
          ...mc(r, `(1/2)·${X} − ${n}·${Y}`, [`2·${X} − ${n}·${Y}`, `(1/2)·${X} + ${n}·${Y}`, `(1/2)·(${X} − ${n}·${Y})`]),
          explanation: `√x = x^(1/2), so its log is (1/2)·${X}; the denominator gives −${n}·${Y}. A square root is the power 1/2, not 2, and the 1/2 applies to x only.`,
        };
      }
      const b = pick(r, [2, 3]), n = int(r, 2, 4), m = pick(r, [5, 7, 10, 11]);
      return {
        prompt: `Evaluate: ${L(b, b ** n * m)} − ${L(b, m)}`,
        value: String(n),
        explanation: `Quotient rule: ${L(b, b ** n * m)} − ${L(b, m)} = ${L(b, `${b ** n * m}/${m}`)} = ${L(b, b ** n)} = ${n}.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const b = anyBase(r), p = int(r, 2, 5), q = int(r, 2, 5), cube = int(r, 0, 1) === 1;
        const X = L(b, 'x'), Y = L(b, 'y'), Z = L(b, 'z');
        const f = cube ? '(1/3)' : '(1/2)', bad = cube ? '3' : '2';
        return {
          prompt: `Expand: ${L(b, `${pw('x', p)}·${cube ? '∛' : '√'}y/${pw('z', q)}`)}`,
          ...mc(r, `${p}·${X} + ${f}·${Y} − ${q}·${Z}`, [`${p}·${X} + ${bad}·${Y} − ${q}·${Z}`, `${p}·${X} + ${f}·${Y} + ${q}·${Z}`, `${p}·${X} − ${f}·${Y} − ${q}·${Z}`]),
          explanation: `Numerator factors add, the denominator subtracts, and each exponent comes out in front. The ${cube ? 'cube' : 'square'} root of y is y^${f}, so it contributes ${f}·${Y}; only z is in the denominator, so only its term is subtracted.`,
        };
      }
      if (idx === 1) {
        const q = int(r, 2, 4);
        return {
          prompt: `Write as a single logarithm: (1/2)·ln(x) − ${q}·ln(y) − ln(z)`,
          ...mc(r, `ln(√x/(${pw('y', q)}z))`, [`ln(√x·z/${pw('y', q)})`, `ln(x/(2${pw('y', q)}z))`, `ln(√x/(${q}yz))`]),
          explanation: `(1/2)·ln(x) = ln(√x) and ${q}·ln(y) = ln(${pw('y', q)}). Both subtracted logs go in the denominator: ln(√x/(${pw('y', q)}z)). Subtracting ln(z) after another subtraction still divides by z.`,
        };
      }
      if (idx === 2) {
        const a = pick(r, [3, 5, 6, 7]), N = pick(r, [11, 13, 17, 19, 20, 23, 40]);
        const fn = pick(r, ['ln', 'log']);
        return {
          prompt: `By the change-of-base formula, which expression equals ${L(a, N)}?`,
          ...mc(r, `${fn}(${N})/${fn}(${a})`, [`${fn}(${a})/${fn}(${N})`, `${fn}(${N}) − ${fn}(${a})`, `${fn}(${N})·${fn}(${a})`]),
          explanation: `log_b(x) = ${fn}(x)/${fn}(b): the argument goes on top and the old base underneath, so ${L(a, N)} = ${fn}(${N})/${fn}(${a}). A quotient OF logs is not the log of a quotient (that would be a difference).`,
        };
      }
      const b = pick(r, [2, 3, 5, 10, 'e']), m = int(r, 2, 4), n = int(r, 2, 3);
      const p = nonZero(r, -4, 5), form = int(r, 0, 2);
      const q = form === 2 ? 2 * nonZero(r, -3, 3) : nonZero(r, -4, 5);
      const arg = form === 0 ? `${pw('x', m)}${pw('y', n)}` : form === 1 ? `${pw('x', m)}/${pw('y', n)}` : `${pw('x', m)}·√y`;
      const v = form === 0 ? m * p + n * q : form === 1 ? m * p - n * q : m * p + q / 2;
      const work = form === 0 ? `${m}(${mn(p)}) + ${n}(${mn(q)})` : form === 1 ? `${m}(${mn(p)}) − ${n}(${mn(q)})` : `${m}(${mn(p)}) + (1/2)(${mn(q)})`;
      return {
        prompt: `If ${L(b, 'x')} = ${mn(p)} and ${L(b, 'y')} = ${mn(q)}, what is ${L(b, arg)}?`,
        value: String(v),
        explanation: `Expand first, then substitute: ${work} = ${mn(v)}. Exponents multiply the logs; a product adds them and a quotient subtracts.`,
      };
    }) },
  ],
};

// ── 9. solving exponential equations ───────────────────────────────────────

const SAME_BASE = [[4, 8, 3, 2], [4, 32, 5, 2], [8, 4, 2, 3], [8, 16, 4, 3], [8, 32, 5, 3], [9, 27, 3, 2], [27, 9, 2, 3], [9, 243, 5, 2], [27, 81, 4, 3], [16, 8, 3, 4], [16, 32, 5, 4], [25, 125, 3, 2]];   // [B, N, n, m]: B^x = N → x = n/m
const BASE_PAIRS = [[4, 8, 2, 2, 3], [9, 27, 3, 2, 3], [2, 8, 2, 1, 3], [4, 16, 2, 2, 4], [8, 16, 2, 3, 4], [3, 9, 3, 1, 2], [25, 125, 5, 2, 3], [8, 4, 2, 3, 2], [27, 9, 3, 3, 2]];   // [B1, B2, prime, m, n]
const eTerm = (c) => `${c < 0 ? '−' : '+'} ${Math.abs(c) === 1 ? '' : Math.abs(c)}e^x`;

const solveExp = {
  courseSkill: 'solving-exponential-equations',
  skillId: 'pc-solving-exponential-equations',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const b = pick(r, [2, 3, 5]), n = int(r, 2, b === 2 ? 6 : b === 3 ? 4 : 3), c = nonZero(r, -6, 6);
        return {
          prompt: `Solve: ${b}^(${xb(c)}) = ${b ** n}`,
          value: String(n + c),
          explanation: `${b ** n} = ${b}^${n}, so the exponents are equal: ${xb(c)} = ${n}, x = ${mn(n + c)}.`,
        };
      }
      if (idx === 1) {
        const [B, N, n, m] = pick(r, SAME_BASE);
        const p = Math.round(B ** (1 / m));
        return {
          prompt: `Solve: ${B}^x = ${N}. Enter a fraction in lowest terms.`,
          value: `${n}/${m}`,
          explanation: `Write both sides as powers of ${p}: (${p}${sup(m)})^x = ${p}${sup(n)}, so ${m}x = ${n} and x = ${n}/${m}. (It is not ${N}/${B}.)`,
        };
      }
      if (idx === 2) {
        const b = pick(r, [2, 3, 5, 7]), c = pick(r, [10, 11, 12, 13, 15, 17, 20, 22]);
        if (K.gcd(b, c) !== 1) again();
        return {
          prompt: `Solve: ${b}^x = ${c}`,
          ...mc(r, `x = ln(${c})/ln(${b})`, [`x = ln(${b})/ln(${c})`, `x = ln(${c}) − ln(${b})`, `x = ${c}/${b}`]),
          explanation: `Take the natural log of both sides: x·ln(${b}) = ln(${c}), so x = ln(${c})/ln(${b}). The log of the number goes on top; and a quotient of logs is not ln(${c}) − ln(${b}).`,
        };
      }
      const a = int(r, 2, 6), b = pick(r, [2, 3, 5]), n = int(r, 2, b === 2 ? 5 : 3), k = nonZero(r, -9, 9);
      return {
        prompt: `Solve: ${a}·${b}^x ${sg(k)} = ${a * b ** n + k}`,
        value: String(n),
        explanation: `Isolate the power first: ${a}·${b}^x = ${a * b ** n}, then ${b}^x = ${b ** n} = ${b}^${n}, so x = ${n}. Do not multiply ${a} by ${b} — the exponent applies to ${b} only.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const [B1, B2, pr, m, n] = pick(r, BASE_PAIRS);
        const p = int(r, 1, 3), q = int(r, -4, 4), s = nonZero(r, -4, 4);
        const den = m * p - n;
        if (den === 0) again();
        const num = n * s - m * q;
        const [rn, rd] = K.reduce(num, den);
        if (rd > 7 || Math.abs(rn) > 20) again();
        return {
          prompt: `Solve: ${B1}^(${poly([p, q])}) = ${B2}^(${poly([1, s])})${rd === 1 ? '' : ' (Enter a fraction in lowest terms.)'}`,
          value: K.frac(num, den),
          explanation: `Use base ${pr}: ${B1} = ${pr}${m === 1 ? '' : sup(m)} and ${B2} = ${pr}${sup(n)}. Equal exponents: ${m}(${poly([p, q])}) = ${n}(${poly([1, s])}), so ${m * p}x ${sg(m * q)} = ${n}x ${sg(n * s)} and x = ${K.frac(num, den).replace('-', '−')}. Distribute the exponent over BOTH terms.`,
        };
      }
      if (idx === 1) {
        const a = int(r, 2, 6), m = pick(r, [2, 3, 5, 7]), k = int(r, 2, 4);
        if (K.gcd(m, k) !== 1) again();
        return {
          prompt: `Solve: ${a}e^(${k}x) = ${a * m}`,
          ...mc(r, `x = ln(${m})/${k}`, [`x = ln(${a * m})/${a * k}`, `x = ${k}·ln(${m})`, `x = ln(${m}/${k})`]),
          explanation: `Divide by ${a} first: e^(${k}x) = ${m}. Take ln: ${k}x = ln(${m}), so x = ln(${m})/${k}. Dividing ln(${a * m}) by ${a} is not the same as dividing ${a * m} by ${a} before taking the log.`,
        };
      }
      if (idx === 2) {
        const b = pick(r, [2, 3, 5]), h = nonZero(r, -5, 5), c = pick(r, [7, 11, 13, 14, 17, 19]);
        if (c + h < 2) again();
        const q = `ln(${c})/ln(${b})`;
        return {
          prompt: `Solve: ${b}^(${xb(h)}) = ${c}`,
          ...mc(r, `x = ${q} ${sg(h)}`, [`x = ${q} ${sg(-h)}`, `x = ln(${c + h})/ln(${b})`, `x = ${q}`]),
          explanation: `Take logs: (${xb(h)})·ln(${b}) = ln(${c}), so ${xb(h)} = ${q} and x = ${q} ${sg(h)}. Undo the shift AFTER dividing by ln(${b}), with the opposite sign.`,
        };
      }
      const triple = int(r, 0, 1) === 1;
      const b = triple ? 3 : 2, d = int(r, 2, 9), n = int(r, 2, triple ? 4 : 6), P0 = pick(r, [50, 100, 200, 250, 400, 500]);
      return {
        prompt: `A bacteria culture starts with ${P0} cells and ${triple ? 'triples' : 'doubles'} every ${d} hours, so P(t) = ${P0}·${b}^(t/${d}). After how many hours will there be ${P0 * b ** n} cells?`,
        value: String(n * d),
        explanation: `${P0}·${b}^(t/${d}) = ${P0 * b ** n} gives ${b}^(t/${d}) = ${b ** n} = ${b}^${n}, so t/${d} = ${n} and t = ${n * d} hours — ${n} ${triple ? 'triplings' : 'doublings'} of ${d} hours each.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const p = int(r, 2, 6), q = int(r, p + 1, 8);
        return {
          prompt: `Solve: e^(2x) ${eTerm(-(p + q))} + ${p * q} = 0`,
          ...mc(r, `x = ln(${p}) or x = ln(${q})`, [`x = ${p} or x = ${q}`, `x = ln(${p + q})`, `x = ln(${p * q})`]),
          explanation: `Let u = e^x: u² − ${p + q}u + ${p * q} = (u − ${p})(u − ${q}) = 0, so e^x = ${p} or e^x = ${q}. Both are positive, so x = ln(${p}) or x = ln(${q}). ${p} and ${q} are values of e^x, not of x.`,
        };
      }
      if (idx === 1) {
        const p = int(r, 2, 8), q = int(r, 2, 8);
        if (p === q) again();
        return {
          prompt: `Solve: e^(2x) ${eTerm(q - p)} − ${p * q} = 0`,
          ...mc(r, `x = ln(${p})`, [`x = ln(${p}) or x = ln(${q})`, `x = ln(${q})`, `x = ln(${p}) or x = −ln(${q})`]),
          explanation: `Let u = e^x: u² ${sg(q - p)}u − ${p * q} = (u − ${p})(u + ${q}) = 0, so u = ${p} or u = −${q}. e^x is never negative, so u = −${q} is rejected and the only solution is x = ln(${p}).`,
        };
      }
      if (idx === 2) {
        const h = pick(r, [3, 4, 5, 6, 8, 12, 25, 30]), n = int(r, 2, 5), m = pick(r, [1, 3, 5, 10]);
        return {
          prompt: `A substance has a half-life of ${h} years, so a sample of ${m * 2 ** n} grams has A(t) = ${m * 2 ** n}·(1/2)^(t/${h}) grams left after t years. After how many years are ${m} grams left?`,
          value: String(n * h),
          explanation: `${m * 2 ** n}·(1/2)^(t/${h}) = ${m} gives (1/2)^(t/${h}) = 1/${2 ** n} = (1/2)^${n}, so t/${h} = ${n} and t = ${n * h} years: ${n} half-lives.`,
        };
      }
      const [b, d] = pick(r, [[2, 3], [2, 5], [3, 5], [2, 7], [3, 7], [5, 7]]);
      const c = int(r, 1, 3);
      const top = kT(c, `ln(${b})`);
      return {
        prompt: `Solve: ${b}^(x + ${c}) = ${d}^x`,
        ...mc(r, `x = ${top}/(ln(${d}) − ln(${b}))`, [`x = ${top}/(ln(${d}) + ln(${b}))`, `x = (ln(${d}) − ln(${b}))/${c === 1 ? top : `(${top})`}`, `x = ${top}/ln(${d})`]),
        explanation: `Take ln of both sides: (x + ${c})·ln(${b}) = x·ln(${d}). Distribute and collect x: ${top} = x·ln(${d}) − x·ln(${b}) = x(ln(${d}) − ln(${b})), so x = ${top}/(ln(${d}) − ln(${b})).`,
      };
    }) },
  ],
};

// ── 10. solving logarithmic equations ──────────────────────────────────────

const FACTOR_PAIRS = [[2, 3, 4, 2], [2, 4, 8, 2], [2, 5, 8, 4], [2, 5, 16, 2], [3, 2, 9, 1], [3, 3, 9, 3], [3, 3, 27, 1], [10, 2, 20, 5], [10, 2, 25, 4], [10, 2, 50, 2], [2, 6, 16, 4], [5, 2, 25, 1], [6, 2, 9, 4], [6, 2, 12, 3]];   // [b, n, u, v]: u·v = b^n, u > v
const logTerm = (b, h) => L(b, xb(h));

const solveLog = {
  courseSkill: 'solving-logarithmic-equations',
  skillId: 'pc-solving-logarithmic-equations',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      if (idx === 0) {
        const b = pick(r, [2, 3, 5, 10]), n = int(r, 2, b === 2 ? 5 : 3), h = nonZero(r, -9, 9);
        return {
          prompt: `Solve: ${logTerm(b, h)} = ${n}`,
          value: String(h + b ** n),
          explanation: `Rewrite in exponential form: ${xb(h)} = ${b}^${n} = ${b ** n}, so x = ${mn(h + b ** n)}. (${b}^${n}, not ${n}^${b} and not ${b}·${n}.)`,
        };
      }
      if (idx === 1) {
        const b = anyBase(r), p = int(r, 2, 4), x0 = int(r, 1, 9), q = nonZero(r, -6, 9);
        const s = p * x0 + q - x0;
        if (s === 0 || p * x0 + q <= 0) again();
        return {
          prompt: `Solve: ${L(b, poly([p, q]))} = ${L(b, poly([1, s]))}`,
          value: String(x0),
          explanation: `Logs with the same base are equal only when their arguments are equal: ${poly([p, q])} = ${poly([1, s])}, so ${p - 1}x = ${mn(s - q)} and x = ${x0}. Check: both arguments are ${p * x0 + q}, which is positive.`,
        };
      }
      if (idx === 2) {
        const n = int(r, 2, 7), m = int(r, 2, 5);
        return {
          prompt: `Solve: ${m}·ln(x) = ${m * n}`,
          ...mc(r, `x = e^${n}`, [`x = ${n}e`, `x = ln(${n})`, `x = 10^${n}`]),
          explanation: `Divide by ${m}: ln(x) = ${n}. The natural log has base e, so x = e^${n} — e raised to the ${n}, not ${n} times e, and not base 10.`,
        };
      }
      const b = pick(r, [2, 3, 5, 10]), n = int(r, 2, b === 2 ? 5 : 3), a = int(r, 2, 6), x0 = nonZero(r, -6, 9);
      const c = b ** n - a * x0;
      if (c === 0) again();
      return {
        prompt: `Solve: ${L(b, poly([a, c]))} = ${n}`,
        value: String(x0),
        explanation: `Exponential form: ${poly([a, c])} = ${b}^${n} = ${b ** n}, so ${a}x = ${mn(b ** n - c)} and x = ${mn(x0)}. The argument is then ${b ** n}, positive, so the solution is valid.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      if (idx === 0) {
        const [b, n, u, v] = pick(r, FACTOR_PAIRS);
        const plus = int(r, 0, 1) === 1;
        const k = u - v, x0 = plus ? v : u;
        return {
          prompt: `Solve: ${L(b, 'x')} + ${L(b, plus ? `x + ${k}` : `x − ${k}`)} = ${n}`,
          value: String(x0),
          explanation: `Condense: ${L(b, `x(x ${plus ? '+' : '−'} ${k})`)} = ${n}, so x(x ${plus ? '+' : '−'} ${k}) = ${b}^${n} = ${u * v}. Then x² ${plus ? '+' : '−'} ${k}x − ${u * v} = 0 factors with roots ${plus ? `${v} and −${u}` : `${u} and −${v}`}. The negative root makes ${L(b, 'x')} undefined, so x = ${x0}.`,
        };
      }
      if (idx === 1) {
        const b = pick(r, [2, 3]), n = int(r, 1, 2), B = b ** n;
        const p = int(r, 1, 3), q = nonZero(r, -5, 5), s = int(r, 1, 5);
        if (B === p) again();
        const num = B * s + q, den = B - p;
        const x = num / den;
        if (x <= s || p * x + q <= 0) again();
        const [, rd] = K.reduce(num, den);
        if (rd > 9) again();
        return {
          prompt: `Solve: ${L(b, poly([p, q]))} − ${L(b, `x − ${s}`)} = ${n}${rd === 1 ? '' : ' (Enter a fraction in lowest terms.)'}`,
          value: K.frac(num, den),
          explanation: `Condense: ${L(b, `(${poly([p, q])})/(x − ${s})`)} = ${n}, so (${poly([p, q])})/(x − ${s}) = ${b}^${n} = ${B}. Then ${poly([p, q])} = ${B}x − ${B * s}, and x = ${K.frac(num, den)}. It is greater than ${s}, so both arguments are positive.`,
        };
      }
      if (idx === 2) {
        const b = anyBase(r), a = int(r, 2, 7), c = int(r, 2, 40);
        if (c % a === 0 && int(r, 0, 2) > 0) again();
        if (c === a || K.reduce(c, a)[1] > 9) again();
        const frac = c % a !== 0;
        return {
          prompt: `Solve: ${L(b, 'x')} + ${L(b, a)} = ${L(b, c)}${frac ? ' (Enter a fraction in lowest terms.)' : ''}`,
          value: K.frac(c, a),
          explanation: `Product rule on the left: ${L(b, `${a}x`)} = ${L(b, c)}, so ${a}x = ${c} and x = ${K.frac(c, a)}. Adding logs MULTIPLIES the arguments — it is not x + ${a} = ${c}.`,
        };
      }
      const b = anyBase(r), c = int(r, 3, 12);
      return {
        prompt: `Solve: 2·${L(b, 'x')} = ${L(b, c * c)}`,
        value: String(c),
        explanation: `Power rule: ${L(b, 'x²')} = ${L(b, c * c)}, so x² = ${c * c} and x = ±${c}. But ${L(b, 'x')} needs x > 0, so x = −${c} is rejected and x = ${c}.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      if (idx === 0) {
        const [b, n, u, v] = pick(r, FACTOR_PAIRS);
        const r1 = int(r, -3, 9);
        const p = u - r1, q = r1 - v;
        if (p === 0 || q === 0 || p === -q) again();
        const r2 = r1 - u - v;
        return {
          prompt: `Solving ${L(b, xb(-p))} + ${L(b, xb(q))} = ${n} by condensing leads to a quadratic equation with two roots. Enter the root that must be rejected as extraneous.`,
          value: String(r2),
          explanation: `(${xb(-p)})(${xb(q)}) = ${b}^${n} = ${u * v} gives ${poly([1, p - q, -p * q - u * v])} = 0, with roots ${mn(r1)} and ${mn(r2)}. At x = ${mn(r2)} the arguments are ${mn(r2 + p)} and ${mn(r2 - q)} — negative, so the logs are undefined and ${mn(r2)} is rejected.`,
        };
      }
      if (idx === 1) {
        const v = int(r, 1, 6), k = int(r, 1, 7), u = v + k, c = u * v;
        const slip = K.frac(c - k, 2);
        return {
          prompt: `Solve: ln(x) + ln(x + ${k}) = ln(${c})`,
          ...mc(r, `x = ${v}`, [`x = −${u} or x = ${v}`, `x = −${u}`, `x = ${slip.replace('-', '−')}`]),
          explanation: `Condense: ln(x(x + ${k})) = ln(${c}), so ${poly([1, k, -c])} = 0 = (x + ${u})(x − ${v}). x = −${u} makes ln(x) undefined, so only x = ${v} is a solution. (Adding the arguments, x + x + ${k} = ${c}, is the log-of-a-sum slip.)`,
        };
      }
      if (idx === 2) {
        const b = anyBase(r), r2 = int(r, 1, 6), r1 = int(r, r2 + 1, 12);
        const d = r1 - r2, c = r1 * r2;
        return {
          prompt: `Solve: ${L(b, `x² − ${c}`)} = ${L(b, `${d === 1 ? '' : d}x`)}`,
          value: String(r1),
          explanation: `Equal arguments: x² − ${c} = ${d === 1 ? '' : d}x, so ${poly([1, -d, -c])} = 0 = (x − ${r1})(x + ${r2}). x = −${r2} makes ${L(b, `${d === 1 ? '' : d}x`)} the log of a negative number, so it is rejected: x = ${r1}.`,
        };
      }
      const b = pick(r, [2, 3, 5]), n = int(r, 1, b === 2 ? 3 : 2), a = int(r, 1, 12);
      const B = b ** n;
      if (K.reduce(a, B - 1)[1] === 1 && int(r, 0, 1) === 1) again();
      const frac = K.reduce(a, B - 1)[1] !== 1;
      return {
        prompt: `Solve: ${L(b, `x + ${a}`)} − ${L(b, 'x')} = ${n}${frac ? ' (Enter a fraction in lowest terms.)' : ''}`,
        value: K.frac(a, B - 1),
        explanation: `Condense: ${L(b, `(x + ${a})/x`)} = ${n}, so (x + ${a})/x = ${b}^${n} = ${B}. Then x + ${a} = ${B}x, ${a} = ${B - 1}x, and x = ${K.frac(a, B - 1)}. It is positive, so both logs are defined.`,
      };
    }) },
  ],
};

const TEMPLATES = [
  fluency, combining, domainRange, endBehavior, zeros,
  exponential, logarithmic, logRules, solveExp, solveLog,
];

module.exports = { COURSE_ID, GB, TEMPLATES };
