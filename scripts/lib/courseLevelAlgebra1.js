'use strict';
/**
 * At-level check items for twelve Algebra 1 course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   variable-expressions · algebraic-properties · solving-inequalities ·
 *   graphing-linear-equations-slope-intercept · systems-of-equations-graphing ·
 *   exponent-rules-multiplication · exponent-rules-division · quadratic-formula ·
 *   measures-of-central-tendency · data-displays · exponential-functions-basics ·
 *   comparing-linear-exponential
 *
 * No picture exists: a graph is described in words, a table is written inline
 * ("x: 0, 1, 2, 3 and y: 5, 10, 20, 40"). A typed answer is one number (an
 * integer, a terminating decimal or a fraction); an expression, an inequality,
 * a point, a property name or a statement is multiple choice, and each wrong
 * choice is the answer a named slip produces (did not flip the inequality,
 * multiplied the exponents, swapped rise and run, used the first y-value as
 * the initial value …). Exponents are written with a caret: x^5, x^(−2).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelAlgebra1.test.js.
 */

const K = require('./templateKit');
const { int, pick, nonZero } = K;

const COURSE_ID = 'algebra-1';
const GB = '8-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item. */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 400; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 400 tries');
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
  const k = int(r, 0, 3);
  const options = opts.slice(k).concat(opts.slice(0, k));
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A number as printed: −5, 12. */
const neg = (n) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
/** A coefficient on a variable as printed: x, −x, 3x, −3x. */
const cf = (c, v) => (c === 1 ? v : c === -1 ? `−${v}` : `${neg(c)}${v}`);
/** mx + b as printed. */
function lin(m, b, v = 'x') {
  if (m === 0) return neg(b);
  return b === 0 ? cf(m, v) : `${cf(m, v)} ${K.signed(b)}`;
}
/** ax + by as printed. */
const lin2 = (a, b) => `${cf(a, 'x')} ${b < 0 ? '−' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y`;
/** ax² + bx + c as printed. */
function quad(a, b, c) {
  let s = cf(a, 'x²');
  if (b !== 0) s += ` ${b < 0 ? '−' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
  if (c !== 0) s += ` ${K.signed(c)}`;
  return s;
}
const pt = (x, y) => `(${neg(x)}, ${neg(y)})`;
/** A rational as printed, with the proper minus sign. */
const fr = (n, d) => K.frac(n, d).replace('-', '−');
const list = (a) => a.map(neg).join(', ');
const tbl = (xs, ys) => `x: ${list(xs)} and y: ${list(ys)}`;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const sorted = (a) => a.slice().sort((p, q) => p - q);
const num = (x) => String(Number(x.toFixed(4)));

/** x^5, x, x^(−2); nothing for a zero power. */
const pw = (v, e) => (e === 0 ? '' : e === 1 ? v : e < 0 ? `${v}^(−${-e})` : `${v}^${e}`);
/** A monomial: 12x^5y^6, −x^2, 9. */
function mono(c, vars) {
  const body = vars.map(([v, e]) => pw(v, e)).join('');
  if (!body) return neg(c);
  return c === 1 ? body : c === -1 ? `−${body}` : `${neg(c)}${body}`;
}
/** A quotient of two monomials, the denominator bracketed when it has more than one factor. */
const ratio = (top, bottom) => `${top}/${/^(?:[a-z](?:\^\d+)?|\d+)$/.test(bottom) ? bottom : `(${bottom})`}`;

const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
const sym = (r) => pick(r, ['<', '>', '≤', '≥']);
const iq = (s, v, x = 'x') => `${x} ${s} ${neg(v)}`;

const P = {
  CA: 'Commutative Property of Addition',
  CM: 'Commutative Property of Multiplication',
  AA: 'Associative Property of Addition',
  AM: 'Associative Property of Multiplication',
  D: 'Distributive Property',
  IA: 'Additive Identity Property',
  IM: 'Multiplicative Identity Property',
  VA: 'Additive Inverse Property',
  VM: 'Multiplicative Inverse Property',
  Z: 'Zero Product Property',
};

// ── 1. variable expressions ────────────────────────────────────────────────

const variableExpressions = {
  courseSkill: 'variable-expressions',
  skillId: 'a1-variable-expressions',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const m = int(r, 2, 6), k = int(r, 2, 9);
          if (m === k) again();
          if (int(r, 0, 1)) {
            return { prompt: `Which expression means "${k} less than ${m} times a number n"?`,
              ...mc(r, `${m}n − ${k}`, [`${k} − ${m}n`, `${m}(n − ${k})`, `${k}n − ${m}`]),
              explanation: `"${m} times a number" is ${m}n, and "${k} less than" that takes ${k} away from it: ${m}n − ${k}. Writing ${k} − ${m}n keeps the order of the words, which is the usual slip.` };
          }
          return { prompt: `Which expression means "${k} more than the product of ${m} and a number n"?`,
            ...mc(r, `${m}n + ${k}`, [`${m}(n + ${k})`, `${k}n + ${m}`, `${m} + n + ${k}`]),
            explanation: `The product of ${m} and n is ${m}n; "${k} more than" adds ${k} to it: ${m}n + ${k}. ${m}(n + ${k}) would be ${m} times a sum, which the phrase does not say.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 6), b = int(r, 2, 9), x = -int(r, 2, 6);
          return { prompt: `Evaluate ${lin(a, -b)} when x = ${neg(x)}.`, value: a * x - b,
            explanation: `${a}(${neg(x)}) − ${b} = ${neg(a * x)} − ${b} = ${neg(a * x - b)}. Treating ${a}(${neg(x)}) as positive is the usual slip.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 6), b = -int(r, 2, 9), c = int(r, 2, 9);
          if (a === c) again();
          return { prompt: `In the expression ${quad(a, b, c)}, what is the coefficient of x?`, value: b,
            explanation: `The coefficient is the number multiplying x, with its sign: the term is ${neg(b)}x, so the coefficient is ${neg(b)}. ${a} is the coefficient of x² and ${c} is the constant.` };
        }
        const a = int(r, 2, 5), b = int(r, 2, 5), p = int(r, 2, 7), q = -int(r, 2, 5);
        return { prompt: `Evaluate ${a}a − ${b}b when a = ${p} and b = ${neg(q)}.`, value: a * p - b * q,
          explanation: `${a}(${p}) − ${b}(${neg(q)}) = ${a * p} − (${neg(b * q)}) = ${a * p} + ${-b * q} = ${a * p - b * q}. Subtracting a negative adds; getting ${a * p + b * q} means that sign was lost.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const m = int(r, 2, 6), k = int(r, 2, 9);
          if (m === k) again();
          if (int(r, 0, 1)) {
            return { prompt: `Which expression means "the product of ${m} and the sum of a number n and ${k}"?`,
              ...mc(r, `${m}(n + ${k})`, [`${m}n + ${k}`, `${k}(n + ${m})`, `${m} + (n + ${k})`]),
              explanation: `The sum of n and ${k} is one quantity, (n + ${k}), and the whole of it is multiplied by ${m}: ${m}(n + ${k}). ${m}n + ${k} multiplies only the n.` };
          }
          return { prompt: `Which expression means "the quotient of a number n and ${m}, decreased by ${k}"?`,
            ...mc(r, `n/${m} − ${k}`, [`n/(${m} − ${k})`, `${m}/n − ${k}`, `${k} − n/${m}`]),
            explanation: `The quotient of n and ${m} is n/${m} (n is divided BY ${m}); "decreased by ${k}" subtracts ${k} from it: n/${m} − ${k}.` };
        }
        if (idx === 1) {
          const a = int(r, 1, 3), b = int(r, 2, 6), x = -int(r, 2, 5);
          return { prompt: `Evaluate ${cf(a, 'x²')} − ${b}x when x = ${neg(x)}.`, value: a * x * x - b * x,
            explanation: `(${neg(x)})² = ${x * x}, so ${a === 1 ? '' : `${a}(${x * x}) = `}${a * x * x}; and −${b}(${neg(x)}) = +${-b * x}. Total: ${a * x * x} + ${-b * x} = ${a * x * x - b * x}. Squaring a negative gives a positive.` };
        }
        if (idx === 2) {
          const n = int(r, 3, 5);
          const pool = [`${int(r, 2, 9)}x²`, `${int(r, 2, 9)}xy`, `${int(r, 2, 9)}y`, `${int(r, 2, 9)}x`, `${int(r, 2, 9)}`];
          const terms = pool.slice(0, n - 1).concat(pool[4]);
          const text = terms.map((t, i) => (i === 0 ? t : `${int(r, 0, 1) ? '+' : '−'} ${t}`)).join(' ');
          return { prompt: `How many terms are in the expression ${text}?`, value: n,
            explanation: `Terms are the parts separated by + and − signs: ${terms.join(', ')} (each with its sign). That is ${n} terms. A product such as ${terms[1]} is ONE term, not two.` };
        }
        const m = int(r, 2, 6), k = int(r, 2, 9);
        if (m === k) again();
        return { prompt: `Which phrase describes the expression ${m}(n − ${k})?`,
          ...mc(r, `${m} times the difference of a number and ${k}`, [
            `${k} less than ${m} times a number`,
            `${m} times the difference of ${k} and a number`,
            `the sum of ${m} and the difference of a number and ${k}`,
          ]),
          explanation: `The parentheses make (n − ${k}), "the difference of a number and ${k}", one quantity, and ${m} multiplies all of it. "${k} less than ${m} times a number" is ${m}n − ${k}, which is not the same.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = int(r, 2, 6), c = int(r, 1, 9), x = -int(r, 2, 5);
          const v = -(x * x) + b * x + c;
          return { prompt: `Evaluate −x² + ${b}x + ${c} when x = ${neg(x)}.`, value: v,
            explanation: `−x² means −(x²): −(${neg(x)})² = −${x * x}. Then ${b}(${neg(x)}) = ${neg(b * x)}. So −${x * x} − ${-b * x} + ${c} = ${neg(v)}. Using +${x * x} for −x² is the usual slip.` };
        }
        if (idx === 1) {
          const ctx = pick(r, [
            ['A gym charges a one-time fee of $F plus $R per month', 'months', 'm'],
            ['A plumber charges $F to come to the house plus $R per hour', 'hours', 'h'],
            ['A streaming service costs $F to set up plus $R per week', 'weeks', 'w'],
          ]);
          const F = int(r, 4, 9) * 5, R = int(r, 6, 19);
          if (F === R) again();
          const v = ctx[2];
          return { prompt: `${ctx[0].replace('F', F).replace('R', R)}. Which expression gives the total cost, in dollars, for ${v} ${ctx[1]}?`,
            ...mc(r, `${R}${v} + ${F}`, [`${F}${v} + ${R}`, `${F + R}${v}`, `${R}(${v} + ${F})`]),
            explanation: `The $${R} is paid once for every one of the ${v} ${ctx[1]}: ${R}${v}. The $${F} is paid once: ${R}${v} + ${F}. ${F + R}${v} would charge the one-time fee every time.` };
        }
        if (idx === 2) {
          const a = -int(r, 2, 4), b = int(r, 2, 5);
          const v = a * a - 2 * a * b;
          return { prompt: `Evaluate a² − 2ab when a = ${neg(a)} and b = ${b}.`, value: v,
            explanation: `a² = (${neg(a)})² = ${a * a}. 2ab = 2(${neg(a)})(${b}) = ${neg(2 * a * b)}. So ${a * a} − (${neg(2 * a * b)}) = ${a * a} + ${-2 * a * b} = ${v}.` };
        }
        const m = int(r, 2, 5), k = int(r, 2, 8), t = int(r, 20, 40);
        return { prompt: `Which expression means "${m} times the sum of a number n and ${k}, subtracted from ${t}"?`,
          ...mc(r, `${t} − ${m}(n + ${k})`, [`${m}(n + ${k}) − ${t}`, `${t} − ${m}n + ${k}`, `${m}n + ${k} − ${t}`]),
          explanation: `"${m} times the sum of n and ${k}" is ${m}(n + ${k}). "Subtracted FROM ${t}" means ${t} comes first: ${t} − ${m}(n + ${k}). Keeping the order of the words gives ${m}(n + ${k}) − ${t}.` };
      }) },
  ],
};

// ── 2. algebraic properties ────────────────────────────────────────────────

const algebraicProperties = {
  courseSkill: 'algebraic-properties',
  skillId: 'a1-algebraic-properties',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        if (a === b) again();
        if (idx === 0) {
          return { prompt: `Which property is illustrated by ${a} + x = x + ${a}?`,
            ...mcFixed(r, [P.CA, P.AA, P.D, P.IA], P.CA),
            explanation: `Only the ORDER of the two addends changed, and the sum is the same: that is the Commutative Property of Addition. The Associative Property changes the grouping (the parentheses), not the order.` };
        }
        if (idx === 1) {
          return { prompt: `Which property is illustrated by (${a} · x) · ${b} = ${a} · (x · ${b})?`,
            ...mcFixed(r, [P.CM, P.AM, P.D, P.IM], P.AM),
            explanation: `The factors stay in the same order; only the GROUPING (which pair is multiplied first) changed. That is the Associative Property of Multiplication. Commutative would change the order.` };
        }
        if (idx === 2) {
          const c = int(r, 2, 7);
          return { prompt: `Use the Distributive Property to rewrite ${a}(${c}x − ${b}).`,
            ...mc(r, `${a * c}x − ${a * b}`, [`${a * c}x − ${b}`, `${a + c}x − ${a * b}`, `${a * c}x + ${a * b}`]),
            explanation: `Multiply ${a} by EACH term inside: ${a} · ${c}x = ${a * c}x and ${a} · ${b} = ${a * b}, keeping the subtraction: ${a * c}x − ${a * b}. Multiplying only the first term gives ${a * c}x − ${b}.` };
        }
        const which = pick(r, [
          ['n + 0 = n', P.IA, 'Adding 0 leaves a number unchanged — 0 is the additive identity'],
          ['1 · n = n', P.IM, 'Multiplying by 1 leaves a number unchanged — 1 is the multiplicative identity'],
          ['n + (−n) = 0', P.VA, 'A number plus its opposite is 0 — opposites are additive inverses'],
        ]);
        return { prompt: `Which property is illustrated by ${which[0].replace(/n/g, String(a))}?`,
          ...mcFixed(r, [P.IA, P.IM, P.VA, P.VM], which[1]),
          explanation: `${which[2]}. Identity properties give back the same number; inverse properties give back the identity (0 for addition, 1 for multiplication).` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        if (a === b) again();
        if (idx === 0) {
          const eqs = {
            [P.AA]: `(x + ${a}) + ${b} = x + (${a} + ${b})`,
            [P.CA]: `x + ${a} = ${a} + x`,
            [P.D]: `${b}(x + ${a}) = ${b}x + ${a * b}`,
            [P.IA]: `x + 0 = x`,
          };
          const ask = pick(r, [P.AA, P.CA, P.D]);
          return { prompt: `Which equation illustrates the ${ask}?`,
            ...mcFixed(r, Object.values(eqs), eqs[ask]),
            explanation: `${eqs[ask]} shows the ${ask}: ${ask === P.AA ? 'the order is the same and only the grouping changes' : ask === P.CA ? 'the two addends trade places' : 'the multiplier is applied to each term of the sum'}. The other equations show the commutative, associative, distributive and identity properties in turn.` };
        }
        if (idx === 1) {
          const step = int(r, 1, 2);
          return { prompt: `A student simplifies ${a} + (x + ${b}). Step 1: ${a} + (${b} + x). Step 2: (${a} + ${b}) + x. Step 3: ${a + b} + x. Which property justifies Step ${step}?`,
            ...mcFixed(r, [P.CA, P.AA, P.D, P.IA], step === 1 ? P.CA : P.AA),
            explanation: step === 1
              ? `From the original to Step 1, x + ${b} became ${b} + x: the order of two addends changed, which is the Commutative Property of Addition. The regrouping does not happen until Step 2.`
              : `From Step 1 to Step 2 the order ${a}, ${b}, x is the same; only the parentheses moved. Regrouping is the Associative Property of Addition. The order changed back in Step 1 (commutative).` };
        }
        if (idx === 2) {
          const trues = ['a + b = b + a', 'a · b = b · a', '(a + b) + c = a + (b + c)', '(a · b) · c = a · (b · c)'];
          const falses = shuffle(r, ['a − b = b − a', 'a ÷ b = b ÷ a', '(a − b) − c = a − (b − c)', '(a ÷ b) ÷ c = a ÷ (b ÷ c)']);
          const t = pick(r, trues);
          return { prompt: 'Subtraction and division do not have every property that addition and multiplication have. Which equation is true for all nonzero real numbers a, b and c?',
            ...mc(r, t, falses),
            explanation: `${t} is a commutative or associative property, and those hold only for addition and multiplication. Test the others with numbers: 5 − 2 ≠ 2 − 5, 6 ÷ 2 ≠ 2 ÷ 6, (9 − 4) − 1 ≠ 9 − (4 − 1), (8 ÷ 4) ÷ 2 ≠ 8 ÷ (4 ÷ 2).` };
        }
        const p = int(r, 2, 7), q = int(r, 3, 9);
        if (K.gcd(p, q) !== 1 || p === q) again();
        return { prompt: `By the Multiplicative Inverse Property, ${p}/${q} · n = 1 for exactly one number n. What is n?`, value: `${q}/${p}`,
          explanation: `The multiplicative inverse of a fraction is its reciprocal: ${p}/${q} · ${q}/${p} = ${p * q}/${p * q} = 1. −${p}/${q} is the ADDITIVE inverse (it gives a sum of 0, not a product of 1).` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        const a = int(r, 2, 6), b = int(r, 2, 6), c = int(r, 2, 6);
        if (idx === 0) {
          const step = int(r, 1, 3);
          const why = [P.D, P.CA, P.D][step - 1];
          return { prompt: `A student simplifies ${a}(x + ${b}) + ${c}x. Step 1: ${a}x + ${a * b} + ${c}x. Step 2: ${a}x + ${c}x + ${a * b}. Step 3: (${a} + ${c})x + ${a * b}. Step 4: ${a + c}x + ${a * b}. Which property justifies Step ${step}?`,
            ...mcFixed(r, [P.CA, P.AA, P.D, P.CM], why),
            explanation: step === 2
              ? `In Step 2 the terms ${a * b} and ${c}x trade places so the like terms sit together. Changing the order of addends is the Commutative Property of Addition.`
              : step === 1
                ? `In Step 1, ${a} is multiplied by each term of (x + ${b}): that is the Distributive Property.`
                : `In Step 3, ${a}x + ${c}x is written as (${a} + ${c})x. That is the Distributive Property used in reverse (factoring out the x) — it is what "combining like terms" really is.` };
        }
        if (idx === 1) {
          const p = int(r, 1, 9), q = int(r, 1, 9);
          return { prompt: `From (x − ${p})(x + ${q}) = 0 a student concludes that x − ${p} = 0 or x + ${q} = 0. Which property justifies that conclusion?`,
            ...mcFixed(r, [P.Z, P.IM, P.VM, P.D], P.Z),
            explanation: `If a product is 0, at least one of its factors must be 0 — the Zero Product Property. It works only when the product equals 0, which is why a quadratic is set equal to 0 before factoring.` };
        }
        if (idx === 2) {
          const k = int(r, 3, 9), d = int(r, 1, 4), up = int(r, 0, 1);
          const n = up ? 100 + d : 100 - d;
          const op = up ? '+' : '−';
          return { prompt: `Which expression uses the Distributive Property to rewrite ${k} · ${n} for mental math?`,
            ...mc(r, `${k} · 100 ${op} ${k} · ${d}`, [`${k} · 100 ${op} ${d}`, `(${k} · 100) · (${k} · ${d})`, `${k} + 100 ${op} ${d}`]),
            explanation: `${n} = 100 ${op} ${d}, so ${k} · ${n} = ${k}(100 ${op} ${d}) = ${k} · 100 ${op} ${k} · ${d} = ${k * n}. The ${k} must multiply BOTH parts; ${k} · 100 ${op} ${d} multiplies only the 100.` };
        }
        if (a === b) again();
        return { prompt: `Which expression is the result of applying ONLY the Commutative Property of Multiplication to ${a} · (x + ${b})?`,
          ...mc(r, `(x + ${b}) · ${a}`, [`${a} · (${b} + x)`, `${a}x + ${a * b}`, `(${a} · x) + ${b}`]),
          explanation: `The two FACTORS are ${a} and (x + ${b}); swapping them gives (x + ${b}) · ${a}. ${a} · (${b} + x) swaps addends (commutative property of addition), and ${a}x + ${a * b} is the Distributive Property.` };
      }) },
  ],
};

// ── 3. solving inequalities ────────────────────────────────────────────────

const solvingInequalities = {
  courseSkill: 'solving-inequalities',
  skillId: 'a1-solving-inequalities',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const s = sym(r), a = int(r, 2, 6), x0 = nonZero(r, -6, 8);
        if (idx === 0) {
          const b = nonZero(r, -9, 9), c = a * x0 + b;
          return { prompt: `Solve the inequality: ${lin(a, b)} ${s} ${neg(c)}`,
            ...mc(r, iq(s, x0), [iq(FLIP[s], x0), iq(s, a * x0), iq(s, -x0)]),
            explanation: `${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${a}x ${s} ${neg(c - b)}. Divide by ${a} (positive, so the symbol stays): ${iq(s, x0)}. The symbol flips only when multiplying or dividing by a NEGATIVE number.` };
        }
        if (idx === 1) {
          const c = -a * x0;
          return { prompt: `Solve the inequality: ${cf(-a, 'x')} ${s} ${neg(c)}`,
            ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], -x0), iq(s, -x0)]),
            explanation: `Divide both sides by −${a}. Dividing by a negative number REVERSES the inequality: ${iq(FLIP[s], x0)}. Keeping the symbol as ${s} is the usual slip.` };
        }
        if (idx === 2) {
          const x1 = int(r, 2, 7), b = int(r, 1, 9), c = a * x1 - b, gt = int(r, 0, 1);
          const good = gt ? x1 + 1 : x1 - 1;
          return { prompt: `Which value of x is a solution of ${lin(a, -b)} ${gt ? '>' : '<'} ${c}?`,
            ...mc(r, neg(good), [x1, gt ? x1 - 2 : x1 + 2, gt ? x1 - 5 : x1 + 5].map(neg)),
            explanation: `Solving gives x ${gt ? '>' : '<'} ${x1}. ${good} is ${gt ? 'greater' : 'less'} than ${x1}, so it works: ${a}(${good}) − ${b} = ${a * good - b}. x = ${x1} gives exactly ${c}, which is not ${gt ? 'greater' : 'less'} than ${c}.` };
        }
        const b = int(r, 1, 9), c = -a * x0 + b;
        return { prompt: `Solve the inequality: ${lin(-a, b)} ${s} ${neg(c)}`,
          ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], -x0), iq(s, -x0)]),
          explanation: `Subtract ${b}: −${a}x ${s} ${neg(c - b)}. Divide by −${a} and reverse the symbol: ${iq(FLIP[s], x0)}. Forgetting to reverse gives ${iq(s, x0)}.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        const s = sym(r), x0 = nonZero(r, -6, 8);
        if (idx === 0) {
          const c = int(r, 1, 4), a = c + int(r, 2, 4), b = nonZero(r, -9, 9), d = (a - c) * x0 + b;
          if (d === 0) again();
          return { prompt: `Solve the inequality: ${lin(a, b)} ${s} ${lin(c, d)}`,
            ...mc(r, iq(s, x0), [iq(FLIP[s], x0), iq(s, (a - c) * x0), iq(s, -x0)]),
            explanation: `Subtract ${c}x from both sides: ${lin(a - c, b)} ${s} ${neg(d)}. ${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${a - c}x ${s} ${neg(d - b)}. Divide by ${a - c} (positive — no flip): ${iq(s, x0)}.` };
        }
        if (idx === 1) {
          const m = int(r, 2, 5), p = int(r, 1, 6);
          if (x0 === p) again();
          const q = -m * (x0 - p);
          return { prompt: `Solve the inequality: −${m}(x − ${p}) ${s} ${neg(q)}`,
            ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], x0 - 2 * p), iq(s, x0 - 2 * p)]),
            explanation: `Distribute: −${m}x + ${m * p} ${s} ${neg(q)} (−${m} times −${p} is +${m * p}). Subtract ${m * p}: −${m}x ${s} ${neg(q - m * p)}. Divide by −${m} and reverse the symbol: ${iq(FLIP[s], x0)}.` };
        }
        if (idx === 2) {
          const rate = pick(r, [5, 10, 15, 20, 25]), sN = int(r, 1, 5), mN = sN + int(r, 4, 12);
          const who = pick(r, ['Maya', 'Andre', 'Priya', 'Luis']);
          return { prompt: `${who} has $${rate * sN} saved and saves $${rate} more each week. ${who} wants to have at least $${rate * mN}. Which inequality describes the number of weeks w that will do it?`,
            ...mc(r, `w ≥ ${mN - sN}`, [`w ≤ ${mN - sN}`, `w > ${mN - sN}`, `w ≥ ${mN}`]),
            explanation: `${rate * sN} + ${rate}w ≥ ${rate * mN} ("at least" means ≥). Subtract ${rate * sN}: ${rate}w ≥ ${rate * (mN - sN)}. Divide by ${rate}: w ≥ ${mN - sN}. Dividing ${rate * mN} by ${rate} without subtracting the savings first gives w ≥ ${mN}.` };
        }
        const a = int(r, 1, 4), c = a + int(r, 2, 4), b = int(r, 1, 9), d = (c - a) * x0 - b;
        if (d === 0) again();
        return { prompt: `Solve the inequality: ${lin(a, b)} ${s} ${lin(c, -d)}`,
          ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], -x0), iq(s, -x0)]),
          explanation: `Subtract ${c}x: ${lin(a - c, b)} ${s} ${neg(-d)}. Subtract ${b}: ${cf(a - c, 'x')} ${s} ${neg(-d - b)}. Divide by ${neg(a - c)} and reverse the symbol: ${iq(FLIP[s], x0)}. (Collecting x on the right instead avoids the negative and gives the same answer.)` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        const s = sym(r), x0 = nonZero(r, -7, 7);
        if (idx === 0) {
          const a = int(r, 2, 5), p = int(r, 1, 4), d = -2 * x0 - a * p;
          if (d === 0) again();
          return { prompt: `Solve the inequality: ${a}(x − ${p}) ${s} ${lin(a + 2, d)}`,
            ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], x0 + a * p), iq(s, x0 + a * p)]),
            explanation: `Distribute: ${a}x − ${a * p} ${s} ${lin(a + 2, d)}. Subtract ${a + 2}x: −2x − ${a * p} ${s} ${neg(d)}. Add ${a * p}: −2x ${s} ${neg(d + a * p)}. Divide by −2 and reverse the symbol: ${iq(FLIP[s], x0)}.` };
        }
        if (idx === 1) {
          const w = pick(r, [15, 20, 25, 30, 35, 40]), d = int(r, 60, 95), cap = int(r, 8, 16) * 50;
          if ((cap - d) % w === 0) again();
          const n = Math.floor((cap - d) / w);
          return { prompt: `An elevator can carry at most ${cap} kg. A worker who weighs ${d} kg rides with boxes that weigh ${w} kg each. What is the greatest number of boxes the worker can take in one trip?`, value: n,
            explanation: `${d} + ${w}b ≤ ${cap}, so ${w}b ≤ ${cap - d} and b ≤ ${num((cap - d) / w)}. Boxes are whole, and rounding UP would break the limit, so the greatest number is ${n}. Forgetting the worker's ${d} kg gives ${Math.floor(cap / w)}.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 5), b = int(r, 1, 9), small = int(r, 0, 1);
          const c = -a * x0 + b;
          return small
            ? { prompt: `What is the smallest integer that satisfies ${lin(-a, b)} < ${neg(c)}?`, value: x0 + 1,
              explanation: `Subtract ${b}: −${a}x < ${neg(c - b)}. Divide by −${a} and reverse the symbol: x > ${neg(x0)}. ${neg(x0)} itself is not included, so the smallest integer is ${neg(x0 + 1)}. Not reversing gives x < ${neg(x0)}, which has no smallest integer.` }
            : { prompt: `What is the greatest integer that satisfies ${lin(-a, b)} > ${neg(c)}?`, value: x0 - 1,
              explanation: `Subtract ${b}: −${a}x > ${neg(c - b)}. Divide by −${a} and reverse the symbol: x < ${neg(x0)}. ${neg(x0)} itself is not included, so the greatest integer is ${neg(x0 - 1)}. Not reversing gives x > ${neg(x0)}, which has no greatest integer.` };
        }
        const k = int(r, 5, 12), m = int(r, 2, 4), n = int(r, 1, 3), c = int(r, 1, 4);
        const d = (c + m) * x0 - k + m * n;
        if (d <= 0) again();
        return { prompt: `Solve the inequality: ${k} − ${m}(x + ${n}) ${s} ${lin(c, -d)}`,
          ...mc(r, iq(FLIP[s], x0), [iq(s, x0), iq(FLIP[s], -x0), iq(s, -x0)]),
          explanation: `Distribute the −${m}: ${k} − ${m}x − ${m * n} ${s} ${lin(c, -d)}, so ${lin(-m, k - m * n)} ${s} ${lin(c, -d)}. Subtract ${c}x and ${k - m * n}: ${cf(-m - c, 'x')} ${s} ${neg(-d - k + m * n)}. Divide by ${neg(-m - c)} and reverse the symbol: ${iq(FLIP[s], x0)}.` };
      }) },
  ],
};

// ── 4. graphing linear equations (slope-intercept) ─────────────────────────

const dir = (m) => (m > 0 ? 'rises' : 'falls');
const describe = (m, b) => `A line that ${dir(m)} from left to right and crosses the y-axis at ${neg(b)}`;

const graphingLines = {
  courseSkill: 'graphing-linear-equations-slope-intercept',
  skillId: 'a1-graphing-linear-equations-slope-intercept',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const m = nonZero(r, -5, 5), b = nonZero(r, -8, 8);
        if (Math.abs(m) === 1 || m === b) again();
        if (idx === 0) {
          return { prompt: `What is the slope of the line y = ${neg(b)} ${m < 0 ? '−' : '+'} ${Math.abs(m)}x?`, value: m,
            explanation: `Rewrite in the form y = mx + b: y = ${lin(m, b)}. The slope is the coefficient of x, ${neg(m)}. ${neg(b)} comes first in the equation but it is the y-intercept, not the slope.` };
        }
        if (idx === 1) {
          return { prompt: `The line y = ${lin(m, b)} crosses the y-axis at the point (0, k). What is k?`, value: b,
            explanation: `In y = mx + b the y-intercept is b. Check by putting x = 0: y = ${neg(m)}(0) ${K.signed(b)} = ${neg(b)}. ${neg(m)} is the slope.` };
        }
        if (idx === 2) {
          const x1 = nonZero(r, -3, 4), y1 = m * x1 + b;
          const on = (x, y) => y === m * x + b;
          const wrongs = [[y1, x1], [x1, m * x1], [x1, m * x1 - b]];
          if (wrongs.some(([x, y]) => on(x, y))) again();
          return { prompt: `Which point lies on the line y = ${lin(m, b)}?`,
            ...mc(r, pt(x1, y1), wrongs.map(([x, y]) => pt(x, y))),
            explanation: `Substitute x = ${neg(x1)}: y = ${neg(m)}(${neg(x1)}) ${K.signed(b)} = ${neg(m * x1)} ${K.signed(b)} = ${neg(y1)}, so ${pt(x1, y1)} is on the line. ${pt(y1, x1)} has the coordinates in the wrong order, and ${pt(x1, m * x1)} leaves out the ${K.signed(b)}.` };
        }
        return { prompt: `Which describes the graph of y = ${lin(m, b)}?`,
          ...mc(r, describe(m, b), [describe(-m, b), describe(b, m), describe(-b, m)]),
          explanation: `The slope is ${neg(m)} (${m > 0 ? 'positive, so the line rises' : 'negative, so the line falls'} from left to right) and the y-intercept is ${neg(b)}, where it crosses the y-axis. Reading ${neg(b)} as the slope and ${neg(m)} as the intercept swaps the two.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 7), b = nonZero(r, -7, 7);
          if (Math.abs(b) === 1 || a % Math.abs(b) === 0 || K.gcd(a, b) !== 1) again();
          const c = b * nonZero(r, -4, 4);
          return { prompt: `What is the slope of the line ${lin2(a, b)} = ${neg(c)}?`,
            ...mc(r, fr(-a, b), [fr(a, b), fr(-b, a), neg(a)]),
            explanation: `Solve for y: ${cf(b, 'y')} = ${lin(-a, c)}, so y = (${fr(-a, b)})x ${K.signed(c / b)}. The slope is ${fr(-a, b)}. ${a} is the coefficient of x only while the equation is still in standard form.` };
        }
        if (idx === 1) {
          const m = nonZero(r, -5, 5), x0 = nonZero(r, -6, 6), b = -m * x0;
          if (Math.abs(m) === 1 || b === x0) again();
          return { prompt: `What is the x-intercept of the line y = ${lin(m, b)}? Give the x-value where the line crosses the x-axis.`, value: x0,
            explanation: `On the x-axis y = 0: 0 = ${lin(m, b)}, so ${cf(m, 'x')} = ${neg(-b)} and x = ${neg(x0)}. ${neg(b)} is the y-intercept (where x = 0), which is the usual mix-up.` };
        }
        if (idx === 2) {
          const b = nonZero(r, -6, 6), rise = int(r, 1, 5), run = int(r, 2, 5), sg = int(r, 0, 1) ? 1 : -1;
          if (rise === run || K.gcd(rise, run) !== 1) again();
          const good = [run, b + sg * rise];
          return { prompt: `A line has y-intercept ${neg(b)} and slope ${sg < 0 ? '−' : ''}${rise}/${run}. Start at the y-intercept and use the slope once, moving to the right. Which point do you reach?`,
            ...mc(r, pt(...good), [pt(run, b - sg * rise), pt(rise, b + sg * run), pt(run, sg * rise)]),
            explanation: `Start at (0, ${neg(b)}). Slope ${sg < 0 ? '−' : ''}${rise}/${run} means ${sg < 0 ? 'down' : 'up'} ${rise} for every ${run} to the right: (0 + ${run}, ${neg(b)} ${sg < 0 ? '−' : '+'} ${rise}) = ${pt(...good)}. Moving ${run} vertically and ${rise} across swaps rise and run.` };
        }
        const a = int(r, 2, 6), b = nonZero(r, -5, 5), k = nonZero(r, -6, 6);
        if (Math.abs(b) === 1 || (b * k) % a !== 0 || a === Math.abs(b)) again();
        return { prompt: `The line ${lin2(a, b)} = ${neg(b * k)} crosses the y-axis at (0, k). What is k?`, value: k,
          explanation: `On the y-axis x = 0: ${cf(b, 'y')} = ${neg(b * k)}, so y = ${neg(k)}. ${neg(b * k)} is the constant in standard form, not the intercept, and ${neg((b * k) / a)} is the x-intercept.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = int(r, 2, 4), m = int(r, 1, 4), k = nonZero(r, -6, 6);
          const a = b * m, c = b * k;
          return { prompt: `Which equation is ${a}x − ${b}y = ${neg(c)} written in slope-intercept form?`,
            ...mc(r, `y = ${lin(m, -k)}`, [`y = ${lin(-m, k)}`, `y = ${lin(m, k)}`, `y = ${lin(-a, c)}`]),
            explanation: `Subtract ${a}x: −${b}y = −${a}x ${K.signed(c)}. Divide EVERY term by −${b}: y = ${lin(m, -k)}. Dividing by +${b} instead gives y = ${lin(-m, k)}, with both signs wrong.` };
        }
        if (idx === 1) {
          const b = int(r, 2, 4), mm = nonZero(r, -3, 3), k = nonZero(r, -5, 5);
          const a = b * mm, c = b * k;
          return { prompt: `Which describes the graph of ${lin2(a, b)} = ${neg(c)}?`,
            ...mc(r, describe(-mm, k), [describe(mm, k), describe(a, c), describe(-a, c)]),
            explanation: `Solve for y: ${b}y = ${lin(-a, c)}, so y = ${lin(-mm, k)}. Slope ${neg(-mm)}: the line ${dir(-mm)}. y-intercept ${neg(k)}. Reading ${neg(a)} and ${neg(c)} straight from standard form as slope and intercept is the usual slip.` };
        }
        if (idx === 2) {
          const m = nonZero(r, -4, 4), x1 = nonZero(r, -4, 5), b = nonZero(r, -7, 7);
          if (Math.abs(m) === 1) again();
          const y1 = m * x1 + b;
          return { prompt: `A line has slope ${neg(m)} and passes through the point ${pt(x1, y1)}. What is its y-intercept?`, value: b,
            explanation: `Put the point into y = mx + b: ${neg(y1)} = ${neg(m)}(${neg(x1)}) + b = ${neg(m * x1)} + b, so b = ${neg(y1)} − (${neg(m * x1)}) = ${neg(b)}. ${neg(y1)} is the y-coordinate of the given point, not the intercept.` };
        }
        const b = nonZero(r, -6, 6), rise = int(r, 1, 5), run = int(r, 2, 4), j = int(r, 2, 3), sg = int(r, 0, 1) ? 1 : -1;
        if (K.gcd(rise, run) !== 1) again();
        const y = b + sg * j * rise;
        return { prompt: `A line has y-intercept ${neg(b)} and slope ${sg < 0 ? '−' : ''}${rise}/${run}. What is the y-coordinate of the point on the line where x = ${j * run}?`, value: y,
          explanation: `x = ${j * run} is ${j} runs of ${run} to the right of the y-intercept, so y changes by ${j} × ${rise} = ${j * rise} ${sg < 0 ? 'down' : 'up'}: ${neg(b)} ${sg < 0 ? '−' : '+'} ${j * rise} = ${neg(y)}. Or y = (${sg < 0 ? '−' : ''}${rise}/${run})(${j * run}) ${K.signed(b)}.` };
      }) },
  ],
};

// ── 5. systems of equations by graphing ────────────────────────────────────

const COUNTS = ['No solution', 'Exactly one solution', 'Exactly two solutions', 'Infinitely many solutions'];

/** Two lines through (x0, y0) with different slopes. */
function crossing(r, big) {
  const m1 = nonZero(r, big ? -5 : -3, big ? 5 : 3);
  const m2 = nonZero(r, big ? -5 : -3, big ? 5 : 3);
  const x0 = nonZero(r, -4, 5), y0 = nonZero(r, -6, 8);
  if (m1 === m2 || x0 === y0) again();
  const b1 = y0 - m1 * x0, b2 = y0 - m2 * x0;
  if (b1 === 0 || b2 === 0) again();
  return { m1, m2, x0, y0, b1, b2, e1: `y = ${lin(m1, b1)}`, e2: `y = ${lin(m2, b2)}` };
}

const systemsGraphing = {
  courseSkill: 'systems-of-equations-graphing',
  skillId: 'a1-systems-of-equations-graphing',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const L = crossing(r, false);
        if (idx === 0) {
          return { prompt: `The lines ${L.e1} and ${L.e2} are drawn on the same coordinate plane and cross at the point ${pt(L.x0, L.y0)}. What does that tell you about the system made of the two equations?`,
            ...mc(r, `x = ${neg(L.x0)} and y = ${neg(L.y0)} make both equations true`, [
              `x = ${neg(L.y0)} and y = ${neg(L.x0)} make both equations true`,
              'The system has no solution',
              'The system has infinitely many solutions',
            ]),
            explanation: `A point on both lines satisfies both equations, so the crossing point is the solution: x = ${neg(L.x0)}, y = ${neg(L.y0)}. A point is written (x, y), so the first number is x.` };
        }
        if (idx === 1) {
          const wrongs = [[0, L.b1], [0, L.b2], [L.y0, L.x0]];
          if (wrongs.some(([x, y]) => y === L.m1 * x + L.b1 && y === L.m2 * x + L.b2)) again();
          return { prompt: `Which point is the solution of the system ${L.e1} and ${L.e2}?`,
            ...mc(r, pt(L.x0, L.y0), wrongs.map(([x, y]) => pt(x, y))),
            explanation: `The solution must be on BOTH lines. ${pt(L.x0, L.y0)}: ${neg(L.m1)}(${neg(L.x0)}) ${K.signed(L.b1)} = ${neg(L.y0)} and ${neg(L.m2)}(${neg(L.x0)}) ${K.signed(L.b2)} = ${neg(L.y0)}. ${pt(0, L.b1)} and ${pt(0, L.b2)} are the y-intercepts — each is on only one line.` };
        }
        if (idx === 2) {
          const par = int(r, 0, 1);
          const m = L.m1, b2 = par ? L.b1 + nonZero(r, -5, 5) : L.b2;
          if (b2 === 0) again();
          const e2 = par ? `y = ${lin(m, b2)}` : L.e2;
          return { prompt: `How many solutions does the system ${L.e1} and ${e2} have?`,
            ...mcFixed(r, COUNTS, par ? COUNTS[0] : COUNTS[1]),
            explanation: par
              ? `Both lines have slope ${neg(m)} but different y-intercepts (${neg(L.b1)} and ${neg(b2)}), so they are parallel and never meet: no solution.`
              : `The slopes are different (${neg(L.m1)} and ${neg(L.m2)}), so the lines cross at exactly one point: one solution. Two straight lines can never cross twice.` };
        }
        return { prompt: `The lines ${L.e1} and ${L.e2} intersect at one point. What is the x-coordinate of that point?`, value: L.x0,
          explanation: `At the intersection the y-values are equal: ${lin(L.m1, L.b1)} = ${lin(L.m2, L.b2)}. So ${cf(L.m1 - L.m2, 'x')} = ${neg(L.b2 - L.b1)} and x = ${neg(L.x0)}. (The y-coordinate there is ${neg(L.y0)}.)` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        const L = crossing(r, true);
        if (idx === 0) {
          return { prompt: `The lines ${L.e1} and ${L.e2} intersect at one point. What is the y-coordinate of that point?`, value: L.y0,
            explanation: `Set the right sides equal: ${lin(L.m1, L.b1)} = ${lin(L.m2, L.b2)}, so x = ${neg(L.x0)}. Put that back into either equation: y = ${neg(L.m1)}(${neg(L.x0)}) ${K.signed(L.b1)} = ${neg(L.y0)}. Stopping at x = ${neg(L.x0)} answers a different question.` };
        }
        if (idx === 1) {
          const kind = int(r, 0, 2), B = int(r, 2, 4);
          const m2 = kind === 2 ? L.m2 : L.m1;
          const b2 = kind === 0 ? L.b1 : kind === 1 ? L.b1 + nonZero(r, -4, 4) : L.b2;
          // y = m2·x + b2  ⇔  (B·m2)x − B·y = −B·b2
          const e2 = `${lin2(B * m2, -B)} = ${neg(-B * b2)}`;
          return { prompt: `How many solutions does the system ${L.e1} and ${e2} have?`,
            ...mcFixed(r, COUNTS, [COUNTS[3], COUNTS[0], COUNTS[1]][kind]),
            explanation: `Solve the second equation for y: −${B}y = ${lin(-B * m2, -B * b2)}, so y = ${lin(m2, b2)}. ${kind === 0 ? 'That is the SAME line as the first equation, so every point on it is a solution: infinitely many.' : kind === 1 ? `Same slope (${neg(m2)}) but a different y-intercept: the lines are parallel, so there is no solution.` : `Its slope ${neg(m2)} differs from ${neg(L.m1)}, so the lines cross once: exactly one solution.`}` };
        }
        if (idx === 2) {
          const kind = int(r, 0, 2);
          const [px, py] = kind === 0 ? [L.x0, L.y0] : kind === 1 ? [L.x0 + 1, L.y0 + L.m1] : [L.x0 + 1, L.y0 + L.m2];
          const opts = ['Yes, it makes both equations true', 'No, it makes only the first equation true', 'No, it makes only the second equation true', 'No, it makes neither equation true'];
          return { prompt: `Is ${pt(px, py)} the solution of the system? First equation: ${L.e1}. Second equation: ${L.e2}.`,
            ...mcFixed(r, opts, opts[kind]),
            explanation: `Substitute x = ${neg(px)}. First: ${neg(L.m1)}(${neg(px)}) ${K.signed(L.b1)} = ${neg(L.m1 * px + L.b1)}. Second: ${neg(L.m2)}(${neg(px)}) ${K.signed(L.b2)} = ${neg(L.m2 * px + L.b2)}. The point's y is ${neg(py)}, so ${opts[kind].toLowerCase()}. A solution must be on both lines.` };
        }
        const e2 = `${lin2(-L.m2, 1)} = ${neg(L.b2)}`;
        const wrongs = [[L.y0, L.x0], [L.x0 + 1, L.y0 + L.m1], [L.x0 + 1, L.y0 + L.m2]];
        if (wrongs.some(([x, y]) => y === L.m1 * x + L.b1 && y === L.m2 * x + L.b2)) again();
        return { prompt: `At which point do the lines ${L.e1} and ${e2} intersect?`,
          ...mc(r, pt(L.x0, L.y0), wrongs.map(([x, y]) => pt(x, y))),
          explanation: `The second line is y = ${lin(L.m2, L.b2)}. Setting ${lin(L.m1, L.b1)} = ${lin(L.m2, L.b2)} gives x = ${neg(L.x0)}, then y = ${neg(L.y0)}. Check a choice in BOTH equations — ${pt(L.x0 + 1, L.y0 + L.m1)} is on the first line only.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const B = int(r, 2, 4), m = nonZero(r, -4, 5), k = nonZero(r, -6, 6), b2 = nonZero(r, -6, 6);
          if (b2 === -k) again();
          // (B·m)x − B·y = B·k  ⇔  y = m·x − k
          return { prompt: `For what value of k does the system ${lin2(B * m, -B)} = ${neg(B * k)} and y = kx ${K.signed(b2)} have no solution?`, value: m,
            explanation: `Solve the first equation for y: y = ${lin(m, -k)}. The system has no solution when the lines are parallel — same slope, different y-intercepts — so k = ${neg(m)}. ${neg(B * m)} is the x-coefficient before dividing by −${B}.` };
        }
        if (idx === 1) {
          const r1 = int(r, 3, 9), r2 = r1 + int(r, 2, 6), n = int(r, 4, 12);
          const F = (r2 - r1) * n;
          return { prompt: `Plan A costs $${F} to join plus $${r1} per visit, so its cost is y = ${r1}x + ${F}. Plan B has no joining fee and costs $${r2} per visit, so its cost is y = ${r2}x. When the two lines are graphed, what is the x-coordinate of the point where they cross (the number of visits at which the plans cost the same)?`, value: n,
            explanation: `The lines cross where the costs are equal: ${r1}x + ${F} = ${r2}x, so ${F} = ${r2 - r1}x and x = ${n}. Both plans then cost $${r2 * n}; that is the y-coordinate, not the number of visits.` };
        }
        if (idx === 2) {
          const A = int(r, 1, 4), B = int(r, 2, 5), C = nonZero(r, -6, 9), k = int(r, 2, 3), kind = int(r, 0, 2);
          if (A === B) again();
          const second = kind === 0 ? [k * A, k * B, k * C] : kind === 1 ? [k * A, k * B, k * C + nonZero(r, -5, 5)] : [k * B, k * A, k * C];
          return { prompt: `How many solutions does the system ${lin2(A, B)} = ${neg(C)} and ${lin2(second[0], second[1])} = ${neg(second[2])} have?`,
            ...mcFixed(r, COUNTS, [COUNTS[3], COUNTS[0], COUNTS[1]][kind]),
            explanation: kind === 0
              ? `Multiply the first equation by ${k}: ${lin2(k * A, k * B)} = ${neg(k * C)} — exactly the second equation. They are the same line, so there are infinitely many solutions.`
              : kind === 1
                ? `Multiply the first equation by ${k}: ${lin2(k * A, k * B)} = ${neg(k * C)}. The second has the same left side but a different right side, so the lines are parallel (same slope ${fr(-A, B)}, different intercepts): no solution.`
                : `The slopes are ${fr(-A, B)} and ${fr(-B, A)}. Different slopes mean the lines cross at exactly one point.` };
        }
        const m = nonZero(r, -4, 4), a = int(r, 1, 3), B = int(r, 1, 2), x0 = nonZero(r, -4, 5), y0 = nonZero(r, -6, 8);
        if (a + B * m === 0 || x0 === y0) again();
        const b = y0 - m * x0, c = a * x0 + B * y0;
        if (b === 0) again();
        return { prompt: `The lines y = ${lin(m, b)} and ${lin2(a, B)} = ${neg(c)} intersect at one point. What is the y-coordinate of that point?`, value: y0,
          explanation: `Replace y in the second equation: ${a === 1 ? '' : a}x + ${B === 1 ? '' : B}(${lin(m, b)}) = ${neg(c)}, so ${cf(a + B * m, 'x')} = ${neg(c - B * b)} and x = ${neg(x0)}. Then y = ${neg(m)}(${neg(x0)}) ${K.signed(b)} = ${neg(y0)}. The question asks for y, not x.` };
      }) },
  ],
};

// ── 6. exponent rules: multiplication ──────────────────────────────────────

const exponentMultiplication = {
  courseSkill: 'exponent-rules-multiplication',
  skillId: 'a1-exponent-rules-multiplication',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const m = int(r, 2, 7), n = int(r, 2, 6);
        if (m === n || m * n === m + n) again();
        if (idx === 0) {
          return { prompt: `Simplify: x^${m} · x^${n}`,
            ...mc(r, `x^${m + n}`, [`x^${m * n}`, `2x^${m + n}`, `x^${Math.abs(m - n)}`]),
            explanation: `Same base, multiplying: ADD the exponents. x^${m} · x^${n} = x^(${m} + ${n}) = x^${m + n}. Multiplying the exponents (x^${m * n}) is the rule for a power of a power.` };
        }
        if (idx === 1) {
          return { prompt: `Simplify: (x^${m})^${n}`,
            ...mc(r, `x^${m * n}`, [`x^${m + n}`, `${n}x^${m}`, `x^${m ** n}`]),
            explanation: `A power raised to a power: MULTIPLY the exponents. (x^${m})^${n} = x^(${m} · ${n}) = x^${m * n}. Adding them (x^${m + n}) is the rule for x^${m} · x^${n}.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 6), b = int(r, 2, 6);
          if (a * b === a + b) again();
          return { prompt: `Simplify: ${a}x^${m} · ${b}x^${n}`,
            ...mc(r, `${a * b}x^${m + n}`, [`${a + b}x^${m + n}`, `${a * b}x^${m * n}`, `${a + b}x^${m * n}`]),
            explanation: `Multiply the coefficients and add the exponents: ${a} · ${b} = ${a * b} and x^${m} · x^${n} = x^${m + n}, giving ${a * b}x^${m + n}. The coefficients are multiplied, not added.` };
        }
        const base = pick(r, [2, 3, 5, 7]);
        return { prompt: `${base}^${m} · ${base}^${n} = ${base}^k. What is k?`, value: m + n,
          explanation: `Same base, so add the exponents: ${base}^${m} · ${base}^${n} = ${base}^(${m} + ${n}) = ${base}^${m + n}, so k = ${m + n}. k = ${m * n} would be (${base}^${m})^${n}.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 3), m = int(r, 2, 5), k = int(r, 2, 4);
          if (a ** k === a * k) again();
          return { prompt: `Simplify: (${a}x^${m})^${k}`,
            ...mc(r, `${a ** k}x^${m * k}`, [`${a * k}x^${m * k}`, `${a ** k}x^${m + k}`, `${a}x^${m * k}`]),
            explanation: `Raise EACH factor to the power ${k}: ${a}^${k} = ${a ** k} and (x^${m})^${k} = x^${m * k}. Result ${a ** k}x^${m * k}. ${a * k} comes from multiplying ${a} by ${k} instead of raising it to the power.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 6), b = int(r, 2, 6), m = int(r, 2, 5), n = int(r, 2, 5), q = int(r, 2, 6);
          if (a * b === a + b || m * n === m + n) again();
          return { prompt: `Simplify: (${a}x^${m}y)(${b}x^${n}y^${q})`,
            ...mc(r, mono(a * b, [['x', m + n], ['y', q + 1]]), [
              mono(a + b, [['x', m + n], ['y', q + 1]]),
              mono(a * b, [['x', m * n], ['y', q]]),
              mono(a * b, [['x', m + n], ['y', q]]),
            ]),
            explanation: `Coefficients: ${a} · ${b} = ${a * b}. x: ${m} + ${n} = ${m + n}. y: y is y^1, so 1 + ${q} = ${q + 1}. Result ${mono(a * b, [['x', m + n], ['y', q + 1]])}. Treating y as y^0 leaves y^${q}.` };
        }
        if (idx === 2) {
          const m = int(r, 2, 5), n = int(r, 2, 5), k = int(r, 2, 4);
          if (m === n) again();
          return { prompt: `Simplify: (x^${m}y^${n})^${k}`,
            ...mc(r, `x^${m * k}y^${n * k}`, [`x^${m + k}y^${n + k}`, `x^${m * k}y^${n}`, `x^${m}y^${n * k}`]),
            explanation: `The outside power applies to every factor inside, and a power of a power multiplies: x^(${m}·${k})y^(${n}·${k}) = x^${m * k}y^${n * k}. Adding ${k} to each exponent is the usual slip.` };
        }
        const a = int(r, 2, 5), b = int(r, 2, 4), c = int(r, 2, 7);
        return { prompt: `(x^${a})^${b} · x^${c} = x^k. What is k?`, value: a * b + c,
          explanation: `First the power of a power: (x^${a})^${b} = x^${a * b}. Then the product rule: x^${a * b} · x^${c} = x^(${a * b} + ${c}) = x^${a * b + c}. So k = ${a * b + c}; ${a + b + c} adds everything.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const c = int(r, 2, 4), m = int(r, 2, 5), k = int(r, 2, 3);
          const v = (-c) ** k;
          if (m * k === m + k) again();
          return { prompt: `Simplify: (−${c}x^${m})^${k}`,
            ...mc(r, `${neg(v)}x^${m * k}`, [`${neg(-v)}x^${m * k}`, `${neg(-c * k)}x^${m * k}`, `${neg(v)}x^${m + k}`]),
            explanation: `(−${c})^${k} = ${neg(v)} (a negative base to an ${k % 2 ? 'odd' : 'even'} power is ${k % 2 ? 'negative' : 'positive'}), and (x^${m})^${k} = x^${m * k}. Result ${neg(v)}x^${m * k}.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 3), m = int(r, 2, 4), n = int(r, 1, 3), k = int(r, 2, 3), p = int(r, 1, 4), q = int(r, 2, 5);
          if (a ** k === a * k) again();
          const good = mono(a ** k, [['x', m * k + p], ['y', n * k + q]]);
          return { prompt: `Simplify: (${mono(a, [['x', m], ['y', n]])})^${k} · ${mono(1, [['x', p], ['y', q]])}`,
            ...mc(r, good, [
              mono(a * k, [['x', m * k + p], ['y', n * k + q]]),
              mono(a ** k, [['x', m + k + p], ['y', n + k + q]]),
              mono(a, [['x', m * k + p], ['y', n * k + q]]),
            ]),
            explanation: `Power first: (${mono(a, [['x', m], ['y', n]])})^${k} = ${mono(a ** k, [['x', m * k], ['y', n * k]])}. Then multiply by ${mono(1, [['x', p], ['y', q]])}, adding exponents: x^(${m * k} + ${p}), y^(${n * k} + ${q}). Result ${good}.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 5), b = int(r, 2, 5), c = int(r, 2, 7);
          if (a * b - c < 1 || a * b - c === a + b - c) again();
          return { prompt: `For what value of n is x^n · x^${c} = (x^${a})^${b}?`, value: a * b - c,
            explanation: `Left side: x^(n + ${c}). Right side: x^(${a} · ${b}) = x^${a * b}. The exponents must match: n + ${c} = ${a * b}, so n = ${a * b - c}.` };
        }
        const a = int(r, 2, 4), b = int(r, 2, 4), m = int(r, 2, 5);
        if (a * b === 4) again();
        return { prompt: `Simplify: (${a}x^${m})^2 · (${b}x)^2`,
          ...mc(r, `${a * a * b * b}x^${2 * m + 2}`, [`${a * b}x^${2 * m + 2}`, `${a * a * b * b}x^${4 * m}`, `${4 * a * b}x^${2 * m + 2}`]),
          explanation: `(${a}x^${m})^2 = ${a * a}x^${2 * m} and (${b}x)^2 = ${b * b}x^2. Multiply: ${a * a} · ${b * b} = ${a * a * b * b}, and x^${2 * m} · x^2 = x^${2 * m + 2}. Squaring a coefficient is not doubling it (${a}^2 = ${a * a}, not ${2 * a}).` };
      }) },
  ],
};

// ── 7. exponent rules: division ────────────────────────────────────────────

const exponentDivision = {
  courseSkill: 'exponent-rules-division',
  skillId: 'a1-exponent-rules-division',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = int(r, 2, 4), q = int(r, 2, 4), a = b * q;
          if (a - b === q) again();
          return { prompt: `Simplify: x^${a} / x^${b}`,
            ...mc(r, `x^${a - b}`, [`x^${q}`, `x^${a + b}`, `1/x^${a - b}`]),
            explanation: `Same base, dividing: SUBTRACT the exponents. x^${a} / x^${b} = x^(${a} − ${b}) = x^${a - b}. Dividing the exponents (x^${q}) is the usual slip.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 9), b = int(r, 2, 9), c = int(r, 1, 9);
          return { prompt: `What is the value of ${a} · ${b}^0 + ${c}?`, value: a + c,
            explanation: `Any nonzero number to the power 0 is 1, so ${b}^0 = 1. Then ${a} · 1 + ${c} = ${a + c}. Treating ${b}^0 as 0 gives ${c}; treating it as ${b} gives ${a * b + c}.` };
        }
        if (idx === 2) {
          const k = int(r, 2, 5), d = int(r, 2, 4), n = int(r, 2, 4), m = n + int(r, 2, 5);
          if (k * d - d === k) again();
          return { prompt: `Simplify: (${k * d}x^${m}) / (${d}x^${n})`,
            ...mc(r, `${k}x^${m - n}`, [`${k * d - d}x^${m - n}`, `${k}x^${m + n}`, `${k * d - d}x^${m + n}`]),
            explanation: `Divide the coefficients: ${k * d} ÷ ${d} = ${k}. Subtract the exponents: x^(${m} − ${n}) = x^${m - n}. Result ${k}x^${m - n}. The coefficients are divided, not subtracted.` };
        }
        const base = pick(r, [2, 3, 4, 5]), e = base === 2 ? int(r, 2, 5) : int(r, 2, 3);
        return { prompt: `Write ${base}^(−${e}) as a fraction with no exponents.`, value: `1/${base ** e}`,
          explanation: `A negative exponent means the reciprocal: ${base}^(−${e}) = 1/${base}^${e} = 1/${base ** e}. It does not make the number negative (−${base ** e}) and it is not ${base} × (−${e}).` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 5), b = a + int(r, 2, 6);
          return { prompt: `Simplify, using positive exponents only: x^${a} / x^${b}`,
            ...mc(r, `1/x^${b - a}`, [`x^${b - a}`, `1/x^${a + b}`, `−x^${b - a}`]),
            explanation: `Subtract the exponents: x^(${a} − ${b}) = x^(−${b - a}), and a negative exponent means the reciprocal: 1/x^${b - a}. The larger power was in the denominator, so that is where the x's are left.` };
        }
        if (idx === 1) {
          const m = int(r, 2, 5), n = int(r, 2, 5), k = int(r, 2, 4);
          if (m === n) again();
          return { prompt: `Simplify: (x^${m} / y^${n})^${k}`,
            ...mc(r, `x^${m * k}/y^${n * k}`, [`x^${m + k}/y^${n + k}`, `x^${m * k}/y^${n}`, `x^${m}/y^${n * k}`]),
            explanation: `A power of a quotient goes to BOTH the numerator and the denominator, and a power of a power multiplies: x^(${m}·${k}) / y^(${n}·${k}) = x^${m * k}/y^${n * k}.` };
        }
        if (idx === 2) {
          const k = int(r, 2, 5), d = int(r, 2, 4), n = int(r, 2, 4), m = n + int(r, 2, 4), p = int(r, 1, 3), q = p + int(r, 2, 4);
          if (k * d - d === k) again();
          return { prompt: `Simplify, using positive exponents only: (${mono(k * d, [['x', m], ['y', p]])}) / (${mono(d, [['x', n], ['y', q]])})`,
            ...mc(r, ratio(mono(k, [['x', m - n]]), pw('y', q - p)), [
              mono(k, [['x', m - n], ['y', q - p]]),
              ratio(mono(k * d - d, [['x', m - n]]), pw('y', q - p)),
              mono(k, [['x', m + n], ['y', p + q]]),
            ]),
            explanation: `${k * d} ÷ ${d} = ${k}. x: ${m} − ${n} = ${m - n}, so x^${m - n} stays on top. y: ${p} − ${q} = −${q - p}, so y^${q - p} goes in the denominator. Result ${ratio(mono(k, [['x', m - n]]), pw('y', q - p))}.` };
        }
        const a = int(r, 2, 5), n = int(r, 2, 5);
        return { prompt: `Which expression is equivalent to ${a}x^(−${n})?`,
          ...mc(r, `${a}/x^${n}`, [`1/(${a}x^${n})`, `−${a}x^${n}`, `1/(${a ** n}x^${n})`]),
          explanation: `The exponent −${n} belongs only to x, so only x moves to the denominator: ${a} · (1/x^${n}) = ${a}/x^${n}. 1/(${a}x^${n}) moves the ${a} as well, which would be right for (${a}x)^(−1)-style expressions, not this one.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 3), m = int(r, 2, 4), n = int(r, 1, 3), k = int(r, 2, 3);
          const top = pw('y', n * k), xs = pw('x', m * k);
          return { prompt: `Simplify, using positive exponents only: (${ratio(mono(a, [['x', m]]), pw('y', n))})^(−${k})`,
            ...mc(r, `${top}/(${a ** k}${xs})`, [`${a ** k}${xs}/${top}`, `${top}/(${a}${xs})`, `−${a ** k}${xs}/${top}`]),
            explanation: `A negative power flips the fraction: (${pw('y', n)}/(${a}x^${m}))^${k}. Then raise every factor to the power ${k}: ${top} on top, ${a}^${k} · x^${m * k} = ${a ** k}${xs} below. A negative exponent never makes the result negative.` };
        }
        if (idx === 1) {
          const k = int(r, 2, 5), d = int(r, 2, 4), n = int(r, 2, 4), m = n + int(r, 2, 4);
          return { prompt: `Simplify: (${k * d}x^${m}y^0) / (${d}x^${n})`,
            ...mc(r, `${k}x^${m - n}`, [`${k}x^${m - n}y`, '0', `${k}x^${m + n}`]),
            explanation: `y^0 = 1 (for y ≠ 0), so it simply drops out — it is not 0 and not y. Then ${k * d} ÷ ${d} = ${k} and x^(${m} − ${n}) = x^${m - n}: ${k}x^${m - n}.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 6), b = int(r, 1, 4), c = int(r, 2, 8), e = a - b - c;
          if (e === 0 || Math.abs(e) > 4) again();
          return { prompt: `Evaluate: (2^${a} · 2^(−${b})) / 2^${c}. Give a whole number or a fraction.`, value: e > 0 ? String(2 ** e) : `1/${2 ** -e}`,
            explanation: `Add exponents for the product and subtract for the quotient: ${a} + (−${b}) − ${c} = ${neg(e)}. So the value is 2^${e < 0 ? `(${neg(e)})` : e} = ${e > 0 ? 2 ** e : `1/${2 ** -e}`}.` };
        }
        const a = int(r, 1, 3), c = a + int(r, 1, 4), d = int(r, 1, 3), b = d + int(r, 1, 4);
        return { prompt: `Simplify, using positive exponents only: (x^(−${a})y^${b}) / (${pw('x', c)}y^(−${d}))`,
          ...mc(r, `${pw('y', b + d)}/${pw('x', a + c)}`, [
            `${pw('y', b - d)}/${pw('x', c - a)}`,
            `${pw('y', b - d)}/${pw('x', a + c)}`,
            `${pw('x', a + c)}${pw('y', b + d)}`,
          ]),
          explanation: `x: −${a} − ${c} = −${a + c}, so x^${a + c} belongs in the denominator. y: ${b} − (−${d}) = ${b + d}, so y^${b + d} is on top. Result ${pw('y', b + d)}/${pw('x', a + c)}. Ignoring the negative signs gives ${pw('y', b - d)}/${pw('x', c - a)}.` };
      }) },
  ],
};

// ── 8. quadratic formula ───────────────────────────────────────────────────

const SQFREE = [2, 3, 5, 6, 7, 10, 11, 13];
const isSquare = (n) => n >= 0 && Number.isInteger(Math.sqrt(n));
const squareFree = (n) => K.largestSquareFactor(n) === 1;

const quadraticFormula = {
  courseSkill: 'quadratic-formula',
  skillId: 'a1-quadratic-formula',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 6), b = -int(r, 2, 9), c = nonZero(r, -9, 9), ask = pick(r, ['b', 'c']);
          if (a === Math.abs(b) || b === c) again();
          return { prompt: `To use the quadratic formula on ${quad(a, b, c)} = 0, what is the value of ${ask}?`, value: ask === 'b' ? b : c,
            explanation: `Match ax² + bx + c = 0 term by term, keeping each sign: a = ${a}, b = ${neg(b)}, c = ${neg(c)}. Dropping the minus sign on b is the most common slip in the whole formula.` };
        }
        if (idx === 1) {
          const a = int(r, 1, 3), b = int(r, 3, 9), c = int(r, 1, 5);
          if (b * b - 4 * a * c <= 0) again();
          return { prompt: `What is the value of the discriminant b² − 4ac for ${quad(a, b, c)} = 0?`, value: b * b - 4 * a * c,
            explanation: `a = ${a}, b = ${b}, c = ${c}: b² − 4ac = ${b * b} − 4(${a})(${c}) = ${b * b} − ${4 * a * c} = ${b * b - 4 * a * c}. Using 2b for b² (${2 * b}) is the usual slip.` };
        }
        if (idx === 2) {
          const p = nonZero(r, -6, 7), q = nonZero(r, -6, 7), big = int(r, 0, 1);
          if (p === q || p === -q) again();
          const b = -(p + q), c = p * q;
          return { prompt: `Use the quadratic formula to solve ${quad(1, b, c)} = 0. What is the ${big ? 'larger' : 'smaller'} solution?`, value: big ? Math.max(p, q) : Math.min(p, q),
            explanation: `a = 1, b = ${neg(b)}, c = ${neg(c)}. Discriminant: ${b * b} − 4(1)(${neg(c)}) = ${b * b - 4 * c}, and √${b * b - 4 * c} = ${Math.abs(p - q)}. x = (${neg(-b)} ± ${Math.abs(p - q)})/2, so x = ${neg(Math.max(p, q))} or x = ${neg(Math.min(p, q))}.` };
        }
        const a = int(r, 2, 5), b = int(r, 2, 9), c = -int(r, 1, 7);
        const d = (sign) => `${b}² ${sign} 4(${a})(${neg(c)})`;
        return { prompt: `Which expression gives the solutions of ${quad(a, b, c)} = 0?`,
          ...mc(r, `x = (−${b} ± √(${d('−')})) / (2(${a}))`, [
            `x = (${b} ± √(${d('−')})) / (2(${a}))`,
            `x = (−${b} ± √(${d('−')})) / 2`,
            `x = (−${b} ± √(${d('+')})) / (2(${a}))`,
          ]),
          explanation: `x = (−b ± √(b² − 4ac)) / (2a) with a = ${a}, b = ${b}, c = ${neg(c)}. The formula starts with the OPPOSITE of b, subtracts 4ac under the root, and divides everything by 2a (${2 * a}), not by 2.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 6), p = int(r, 2, 9), q = nonZero(r, -9, 9), ask = pick(r, ['b', 'c']);
          if (p === Math.abs(q)) again();
          return { prompt: `The equation ${a}x² = ${lin(p, q)} is rewritten as ${a}x² + bx + c = 0 so the quadratic formula can be used. What is the value of ${ask}?`, value: ask === 'b' ? -p : -q,
            explanation: `Subtract ${p}x and ${q < 0 ? 'add' : 'subtract'} ${Math.abs(q)} so one side is 0: ${quad(a, -p, -q)} = 0. So b = ${neg(-p)} and c = ${neg(-q)}. Reading b and c from the right side without moving them gives the wrong signs.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 4), q = nonZero(r, -5, 5), rt = nonZero(r, -5, 6), big = int(r, 0, 1);
          if (K.gcd(a, q) !== 1 || q === a * rt) again();
          // (ax − q)(x − rt)
          const b = -(a * rt + q), c = q * rt;
          const roots = [[q, a], [rt, 1]].sort((u, v) => u[0] / u[1] - v[0] / v[1]);
          const want = big ? roots[1] : roots[0];
          const D = b * b - 4 * a * c;
          return { prompt: `Use the quadratic formula to solve ${quad(a, b, c)} = 0. What is the ${big ? 'larger' : 'smaller'} solution? Give a whole number or a fraction.`, value: K.frac(want[0], want[1]),
            explanation: `a = ${a}, b = ${neg(b)}, c = ${neg(c)}. Discriminant: ${b * b} − 4(${a})(${neg(c)}) = ${D}, √${D} = ${Math.sqrt(D)}. x = (${neg(-b)} ± ${Math.sqrt(D)})/${2 * a}: x = ${fr(roots[1][0], roots[1][1])} or x = ${fr(roots[0][0], roots[0][1])}. Dividing by 2 instead of 2a = ${2 * a} is the usual slip.` };
        }
        if (idx === 2) {
          const p = nonZero(r, -5, 5), n = pick(r, SQFREE);
          const b = 2 * p, c = p * p - n;
          if (c === 0) again();
          return { prompt: `What are the exact solutions of ${quad(1, b, c)} = 0?`,
            ...mc(r, `x = ${neg(-p)} ± √${n}`, [`x = ${neg(p)} ± √${n}`, `x = ${neg(-2 * p)} ± √${n}`, `x = ${neg(-p)} ± 2√${n}`]),
            explanation: `Discriminant: ${b * b} − 4(1)(${neg(c)}) = ${4 * n}, and √${4 * n} = 2√${n}. x = (${neg(-b)} ± 2√${n})/2 = ${neg(-p)} ± √${n}. BOTH terms on top are divided by 2; dividing only one gives ${neg(-2 * p)} ± √${n} or ${neg(-p)} ± 2√${n}.` };
        }
        const a = int(r, 2, 4), b = -int(r, 2, 7), c = -int(r, 1, 5);
        return { prompt: `What is the value of the discriminant b² − 4ac for ${quad(a, b, c)} = 0?`, value: b * b - 4 * a * c,
          explanation: `a = ${a}, b = ${neg(b)}, c = ${neg(c)}. b² = (${neg(b)})² = ${b * b} (positive). −4ac = −4(${a})(${neg(c)}) = +${-4 * a * c}. Discriminant = ${b * b} + ${-4 * a * c} = ${b * b - 4 * a * c}. Subtracting ${-4 * a * c} instead forgets that c is negative.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 3), b = pick(r, [-7, -5, -3, -1, 1, 3, 5, 7]), c = nonZero(r, -4, 4);
          const D = b * b - 4 * a * c, D2 = b * b + 4 * a * c;
          if (D <= 1 || !squareFree(D) || D2 <= 1 || D2 === D) again();
          const f = (lead, disc, den) => `x = (${neg(lead)} ± √${disc})/${den}`;
          return { prompt: `What are the exact solutions of ${quad(a, b, c)} = 0?`,
            ...mc(r, f(-b, D, 2 * a), [f(b, D, 2 * a), f(-b, D, 2), f(-b, D2, 2 * a)]),
            explanation: `a = ${a}, b = ${neg(b)}, c = ${neg(c)}. Discriminant: ${b * b} − 4(${a})(${neg(c)}) = ${D}. x = (−(${neg(b)}) ± √${D})/(2 · ${a}) = (${neg(-b)} ± √${D})/${2 * a}. √${D} uses the wrong sign on 4ac if it comes out as √${D2}.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 4), q = nonZero(r, -5, 5), rt = nonZero(r, -5, 6), big = int(r, 0, 1);
          if (K.gcd(a, q) !== 1 || q === a * rt) again();
          const b = -(a * rt + q), c = q * rt;
          if (b === 0) again();
          const roots = [[q, a], [rt, 1]].sort((u, v) => u[0] / u[1] - v[0] / v[1]);
          const want = big ? roots[1] : roots[0];
          const D = b * b - 4 * a * c;
          return { prompt: `Use the quadratic formula to solve ${quad(a, b, 0)} = ${neg(-c)}. What is the ${big ? 'larger' : 'smaller'} solution? Give a whole number or a fraction.`, value: K.frac(want[0], want[1]),
            explanation: `First make one side 0: ${quad(a, b, c)} = 0, so c = ${neg(c)} (not ${neg(-c)}). Discriminant: ${b * b} − 4(${a})(${neg(c)}) = ${D}, √${D} = ${Math.sqrt(D)}. x = (${neg(-b)} ± ${Math.sqrt(D)})/${2 * a}: x = ${fr(roots[1][0], roots[1][1])} or x = ${fr(roots[0][0], roots[0][1])}.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 5), p = int(r, 2, 9), q = int(r, 1, 6);
          const D = p * p + 4 * a * q;
          if (isSquare(D)) again();
          return { prompt: `When ${a}x² = ${lin(p, q)} is solved with the quadratic formula, what number is under the square root sign?`, value: D,
            explanation: `Standard form: ${quad(a, -p, -q)} = 0, so a = ${a}, b = ${neg(-p)}, c = ${neg(-q)}. Under the root is b² − 4ac = ${p * p} − 4(${a})(${neg(-q)}) = ${p * p} + ${4 * a * q} = ${D}. Using c = ${q} without moving it gives ${p * p - 4 * a * q}.` };
        }
        const p = nonZero(r, -7, 8), q = nonZero(r, -7, 8);
        if (p + q === 0 || p === q) again();
        const b = -(p + q), c = p * q;
        return { prompt: `Use the quadratic formula to solve ${quad(1, b, 0)} = ${neg(-c)}. What is the sum of the two solutions?`, value: p + q,
          explanation: `Standard form: ${quad(1, b, c)} = 0. Discriminant: ${b * b} − 4(${neg(c)}) = ${b * b - 4 * c}, √ = ${Math.abs(p - q)}. x = (${neg(-b)} ± ${Math.abs(p - q)})/2 gives ${neg(Math.max(p, q))} and ${neg(Math.min(p, q))}; their sum is ${neg(p + q)}. (The ± parts cancel, so the sum is always −b/a.)` };
      }) },
  ],
};

// ── 9. measures of central tendency ────────────────────────────────────────

const median = (a) => { const s = sorted(a); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const draws = (r, n, lo, hi) => Array.from({ length: n }, () => int(r, lo, hi));

const centralTendency = {
  courseSkill: 'measures-of-central-tendency',
  skillId: 'a1-measures-of-central-tendency',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const n = int(r, 5, 6), a = draws(r, n, 8, 40);
          if (sum(a) % n !== 0 || new Set(a).size < n - 1) again();
          return { prompt: `Find the mean of the data set: ${list(a)}`, value: sum(a) / n,
            explanation: `Add the values: ${a.join(' + ')} = ${sum(a)}. Divide by how many there are (${n}): ${sum(a)} ÷ ${n} = ${sum(a) / n}. Dividing by the wrong count, or giving the middle value (the median), are the usual slips.` };
        }
        if (idx === 1) {
          const a = draws(r, 7, 10, 60);
          if (new Set(a).size < 7 || a[3] === median(a)) again();
          return { prompt: `Find the median of the data set: ${list(a)}`, value: median(a),
            explanation: `Put the values in order first: ${list(sorted(a))}. The middle (4th of 7) value is ${median(a)}. Taking the middle of the list as written (${a[3]}) skips the ordering.` };
        }
        if (idx === 2) {
          const v = int(r, 3, 15), w = int(r, 3, 15), s = draws(r, 2, 3, 15);
          if (new Set([v, w, ...s]).size < 4) again();
          const a = shuffle(r, [v, v, v, w, w, ...s]);
          return { prompt: `Find the mode of the data set: ${list(a)}`, value: v,
            explanation: `The mode is the value that appears most often. ${v} appears 3 times, ${w} appears twice and the rest once, so the mode is ${v}. (3 is how often it appears, not the mode.)` };
        }
        const a = draws(r, 6, 12, 75);
        const hi = Math.max(...a), lo = Math.min(...a);
        if (new Set(a).size < 6 || a[0] === lo || a[5] === hi || a[0] === hi) again();
        return { prompt: `Find the range of the data set: ${list(a)}`, value: hi - lo,
          explanation: `Range = maximum − minimum = ${hi} − ${lo} = ${hi - lo}. Subtracting the first value from the last (${a[5]} − ${a[0]}) is the usual slip — the list is not in order.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const n = pick(r, [6, 8]), a = draws(r, n, 10, 60);
          const s = sorted(a);
          if (new Set(a).size < n || s[n / 2 - 1] === s[n / 2] || (a[n / 2 - 1] + a[n / 2]) / 2 === median(a)) again();
          return { prompt: `Find the median of the data set: ${list(a)}`, value: median(a),
            explanation: `In order: ${list(s)}. With ${n} values there are two middle values, ${s[n / 2 - 1]} and ${s[n / 2]}; the median is their mean: (${s[n / 2 - 1]} + ${s[n / 2]}) ÷ 2 = ${median(a)}.` };
        }
        if (idx === 1) {
          const M = int(r, 72, 90), four = draws(r, 4, 65, 98), fifth = 5 * M - sum(four);
          if (fifth < 55 || fifth > 100 || fifth === M || four.includes(fifth)) again();
          return { prompt: `The mean of five test scores is ${M}. Four of the scores are ${list(four)}. What is the fifth score?`, value: fifth,
            explanation: `A mean of ${M} for five scores means they total 5 × ${M} = ${5 * M}. The four known scores total ${sum(four)}, so the fifth is ${5 * M} − ${sum(four)} = ${fifth}.` };
        }
        if (idx === 2) {
          const m = int(r, 10, 20), k = int(r, 4, 8), four = draws(r, 4, m - 4, m + 4), fifth = 5 * m - sum(four);
          if (Math.abs(fifth - m) > 5 || new Set([...four, fifth]).size < 4) again();
          const base = [...four, fifth], o = m + 6 * k;
          return { prompt: `The data set ${list(base)} has a mean of ${m}. By how much does the mean increase when a sixth value, ${o}, is added?`, value: k,
            explanation: `The five values total 5 × ${m} = ${5 * m}. With ${o} the total is ${5 * m + o}, and the new mean is ${5 * m + o} ÷ 6 = ${m + k}. The mean rises by ${m + k} − ${m} = ${k}: one outlier pulls the mean toward it.` };
        }
        const base = sorted(draws(r, 5, 150, 260)), o = int(r, 80, 99) * 10;
        if (new Set(base).size < 5) again();
        const a = [...base, o];
        return { prompt: `Six homes on a street sold for these prices, in thousands of dollars: ${list(a)}. Which measure best describes a typical price on the street?`,
          ...mcFixed(r, [
            `The median, because the outlier ${o} pulls the mean far above most of the prices`,
            `The mean, because it must be used whenever a data set has an outlier such as ${o}`,
            'The mode, because it is always the middle value of a data set',
            'The range, because it measures the centre of a data set',
          ], `The median, because the outlier ${o} pulls the mean far above most of the prices`),
          explanation: `The mean is ${num(sum(a) / 6)}, higher than five of the six prices, because ${o} drags it up. The median, ${median(a)}, is resistant to the outlier and sits among the typical prices. Use the median for skewed data.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const v0 = pick(r, [60, 65, 70, 75]), step = pick(r, [5, 10]);
          const vals = [v0, v0 + step, v0 + 2 * step];
          const c1 = int(r, 1, 6), c2 = int(r, 1, 6), c3 = 10 - c1 - c2;
          if (c3 < 1 || c1 === c3) again();
          const total = vals[0] * c1 + vals[1] * c2 + vals[2] * c3;
          return { prompt: `Ten students took a quiz. ${c1} scored ${vals[0]}, ${c2} scored ${vals[1]} and ${c3} scored ${vals[2]}. What is the mean score?`, value: num(total / 10),
            explanation: `Each score counts once per student: ${vals[0]}(${c1}) + ${vals[1]}(${c2}) + ${vals[2]}(${c3}) = ${total}. Divide by the 10 students: ${num(total / 10)}. Averaging just the three different scores (${vals[1]}) ignores how many students got each.` };
        }
        if (idx === 1) {
          const n = int(r, 4, 6), M = int(r, 74, 86), T = M + int(r, 1, 2), need = (n + 1) * T - n * M;
          if (need > 100) again();
          return { prompt: `After ${n} quizzes, a student's mean score is ${M}. What score on the next quiz will raise the mean to exactly ${T}?`, value: need,
            explanation: `${n} quizzes at a mean of ${M} total ${n * M}. For ${n + 1} quizzes to have a mean of ${T} they must total ${(n + 1) * T}. The next score must be ${(n + 1) * T} − ${n * M} = ${need}. Scoring ${T} would not be enough.` };
        }
        if (idx === 2) {
          const a = draws(r, 6, 5, 50), extra = int(r, 51, 80);
          const s = sorted(a);
          if (new Set(a).size < 6 || s[2] === s[3]) again();
          return { prompt: `The data set ${list(a)} has a median of ${median(a)}. A seventh value, ${extra}, is added. What is the new median?`, value: s[3],
            explanation: `In order with the new value: ${list([...s, extra])}. Seven values have one middle value, the 4th: ${s[3]}. Before, the median was the mean of ${s[2]} and ${s[3]}.` };
        }
        const high = int(r, 0, 1);
        const base = draws(r, 5, 20, 30);
        const o = high ? int(r, 60, 95) : int(r, 1, 6);
        const a = high ? [...sorted(base), o] : [o, ...sorted(base)];
        const mean = sum(a) / 6;
        if (!Number.isInteger(mean) || a.includes(mean) || mean === median(a) || new Set(base).size < 4) again();
        const T = ['The mean is greater than the median', 'The mean is less than the median', 'The mean is equal to the median', 'The mean is equal to the mode'];
        return { prompt: `For the data set ${list(a)}, which statement is true?`,
          ...mcFixed(r, T, mean > median(a) ? T[0] : T[1]),
          explanation: `Mean: ${sum(a)} ÷ 6 = ${mean}. Median: the mean of the 3rd and 4th values, ${median(a)}. The ${high ? 'high' : 'low'} outlier ${o} pulls the mean ${high ? 'above' : 'below'} the median, which barely moves.` };
      }) },
  ],
};

// ── 10. data displays ──────────────────────────────────────────────────────

/** Five bars of a histogram: [label, count]. */
function bars(r, total) {
  const start = pick(r, [40, 50]);
  const c = draws(r, 4, 2, Math.floor(total / 3));
  const last = total - sum(c);
  if (last < 1 || last > total / 2) again();
  c.push(last);
  return c.map((n, i) => [`${start + 10 * i}–${start + 10 * i + 9}`, n, start + 10 * i]);
}
const barText = (b) => b.map(([label, n]) => `${label}: ${n}`).join('; ');
/** A five-number summary [min, Q1, median, Q3, max]. */
function fiveNum(r) {
  const min = int(r, 5, 55), q1 = min + int(r, 4, 12), med = q1 + int(r, 3, 10), q3 = med + int(r, 4, 12), max = q3 + int(r, 5, 14);
  return [min, q1, med, q3, max];
}
const fiveText = ([a, b, c, d, e]) => `minimum ${a}, first quartile ${b}, median ${c}, third quartile ${d} and maximum ${e}`;
const dotText = (counts) => counts.map((n, v) => `${n} ${n === 1 ? 'dot' : 'dots'} above ${v}`).join(', ');

const dataDisplays = {
  courseSkill: 'data-displays',
  skillId: 'a1-data-displays',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const s0 = int(r, 4, 6), c = draws(r, 5, 1, 9), cut = s0 + int(r, 2, 3), up = int(r, 0, 1);
          const rows = c.map((n, i) => [s0 + i, n]);
          const v = sum(rows.filter(([s]) => (up ? s >= cut : s < cut)).map(([, n]) => n));
          return { prompt: `A frequency table of quiz scores reads: ${rows.map(([s, n]) => `score ${s}: ${n} ${n === 1 ? 'student' : 'students'}`).join('; ')}. How many students scored ${up ? `${cut} or higher` : `lower than ${cut}`}?`, value: v,
            explanation: `Add the frequencies of the scores ${up ? `from ${cut} up` : `below ${cut}`}: ${rows.filter(([s]) => (up ? s >= cut : s < cut)).map(([, n]) => n).join(' + ')} = ${v}. The frequency is the number of students, not the score itself.` };
        }
        if (idx === 1) {
          const f = fiveNum(r), iqr = int(r, 0, 1);
          return { prompt: `A box plot of a data set has ${fiveText(f)}. What is the ${iqr ? 'interquartile range' : 'range'} of the data?`, value: iqr ? f[3] - f[1] : f[4] - f[0],
            explanation: iqr
              ? `IQR = Q3 − Q1 = ${f[3]} − ${f[1]} = ${f[3] - f[1]} — the length of the box. The range (${f[4] - f[0]}) is the distance between the ends of the whiskers.`
              : `Range = maximum − minimum = ${f[4]} − ${f[0]} = ${f[4] - f[0]} — whisker end to whisker end. The interquartile range (${f[3] - f[1]}) is only the length of the box.` };
        }
        if (idx === 2) {
          const c = draws(r, 5, 1, 7);
          const top = Math.max(...c), mode = c.indexOf(top);
          if (c.filter((n) => n === top).length > 1 || mode === top || mode === 0) again();
          return { prompt: `A dot plot of the number of books each student read last month has ${dotText(c)}. What is the mode of the data?`, value: mode,
            explanation: `Each dot is one student, so the tallest stack marks the most common value: ${top} dots above ${mode}. The mode is ${mode} books. ${top} is how many students read that many, not the mode.` };
        }
        const S = [
          ['compare the medians and spreads of the test scores of two classes side by side', 'Box plot', 'A box plot shows the five-number summary, so two of them make centre and spread easy to compare'],
          ['show every individual value in a small data set of 12 quiz scores', 'Dot plot', 'A dot plot keeps every value visible, which works for a small data set'],
          ['show the overall shape of 500 heights grouped into intervals', 'Histogram', 'A histogram groups a large data set into intervals and shows the shape of the distribution'],
          ['see whether hours studied and test score are related', 'Scatter plot', 'A scatter plot shows the relationship between two quantitative variables'],
        ];
        const s = pick(r, S);
        return { prompt: `A teacher wants to ${s[0]}. Which display is the best choice?`,
          ...mcFixed(r, ['Box plot', 'Dot plot', 'Histogram', 'Scatter plot'], s[1]),
          explanation: `${s[2]}. Match the display to the job: individual values (dot plot), shape of a big data set (histogram), summary and spread (box plot), two variables (scatter plot).` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = bars(r, int(r, 24, 40)), k = int(r, 2, 3);
          const v = sum(b.slice(k).map((x) => x[1]));
          return { prompt: `A histogram of test scores has these bars (interval: number of students): ${barText(b)}. How many students scored at least ${b[k][2]}?`, value: v,
            explanation: `"At least ${b[k][2]}" takes in every bar from ${b[k][0]} up: ${b.slice(k).map((x) => x[1]).join(' + ')} = ${v}. Counting only the ${b[k][0]} bar (${b[k][1]}) leaves out the higher intervals.` };
        }
        if (idx === 1) {
          const [gy, gn, by, bn] = draws(r, 4, 6, 24), col = int(r, 0, 1);
          if (new Set([gy, gn, by, bn]).size < 4) again();
          return { prompt: `A two-way frequency table of a survey shows: girls: ${gy} play a sport and ${gn} do not; boys: ${by} play a sport and ${bn} do not. How many ${col ? 'of the students surveyed play a sport' : 'girls were surveyed'}?`, value: col ? gy + by : gy + gn,
            explanation: col
              ? `This is a marginal total: add the "play a sport" cells for both groups, ${gy} + ${by} = ${gy + by}. ${gy + gn} would be the total number of girls instead.`
              : `This is a marginal total: add both cells in the girls' row, ${gy} + ${gn} = ${gy + gn}. ${gy + by} would be everyone who plays a sport instead.` };
        }
        if (idx === 2) {
          const f = fiveNum(r);
          const q = pick(r, [
            [`greater than ${f[1]}`, 75, 'Three of the four quarters lie above Q1'],
            [`less than ${f[1]}`, 25, 'One quarter of the data lies below Q1'],
            [`greater than ${f[3]}`, 25, 'One quarter of the data lies above Q3'],
            [`less than ${f[3]}`, 75, 'Three of the four quarters lie below Q3'],
            [`between ${f[1]} and ${f[3]}`, 50, 'The box, from Q1 to Q3, holds the middle half'],
            [`between ${f[1]} and ${f[4]}`, 75, 'From Q1 to the maximum is three of the four quarters'],
          ]);
          return { prompt: `A box plot of a large data set has ${fiveText(f)}. About what percent of the data values are ${q[0]}?`, value: q[1],
            explanation: `The five numbers cut the data into four parts with about 25% of the values in each, however wide each part looks. ${q[2]}: about ${q[1]}%.` };
        }
        const c = draws(r, 5, 1, 6);
        const all = c.flatMap((n, v) => Array(n).fill(v));
        const med = median(all);
        if (!Number.isInteger(med) || med === 2 || c[med] === Math.max(...c)) again();
        return { prompt: `A dot plot of the number of pets in each student's home has ${dotText(c)}. What is the median number of pets?`, value: med,
          explanation: `There are ${all.length} dots. In order, the middle ${all.length % 2 ? `one is number ${(all.length + 1) / 2}` : `two are numbers ${all.length / 2} and ${all.length / 2 + 1}`}; counting up the stacks (${c.join(', ')}) lands on ${med}. The median is not the middle of the number line (2) or the tallest stack.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const T = pick(r, [20, 25, 40, 50]), gy = int(r, T / 5, (4 * T) / 5), by = T - gy;
          const gn = int(r, 4, 30), bn = int(r, 4, 30);
          const v = (100 * gy) / T;
          if (!Number.isInteger(v) || gy === by || (100 * gy) % (gy + gn) === 0 || new Set([gy, by, gn, bn]).size < 4) again();
          return { prompt: `A two-way frequency table of a survey shows: girls: ${gy} play a sport and ${gn} do not; boys: ${by} play a sport and ${bn} do not. What percent of the students who play a sport are girls?`, value: v,
            explanation: `The group is the students who play a sport: ${gy} + ${by} = ${T}. Of those, ${gy} are girls: ${gy}/${T} = ${v}%. Dividing by all ${gy + gn + by + bn} students, or by the ${gy + gn} girls, answers a different question.` };
        }
        if (idx === 1) {
          const A = fiveNum(r), B = fiveNum(r);
          const cmp = [A[2] - B[2], (A[4] - A[0]) - (B[4] - B[0]), (A[3] - A[1]) - (B[3] - B[1])];
          if (cmp.some((d) => d === 0) || cmp.filter((d) => d > 0).length !== 1) again();
          const opts = ['Class A has the greater median', 'Class A has the greater range', 'Class A has the greater interquartile range', 'The two classes have the same interquartile range'];
          return { prompt: `Box plots summarise the test scores of two classes. Class A: ${fiveText(A)}. Class B: ${fiveText(B)}. Which statement is true?`,
            ...mcFixed(r, opts, opts[cmp.findIndex((d) => d > 0)]),
            explanation: `Medians: ${A[2]} and ${B[2]}. Ranges: ${A[4]} − ${A[0]} = ${A[4] - A[0]} and ${B[4]} − ${B[0]} = ${B[4] - B[0]}. IQRs: ${A[3]} − ${A[1]} = ${A[3] - A[1]} and ${B[3]} − ${B[1]} = ${B[3] - B[1]}. Only one of the comparisons favours Class A.` };
        }
        if (idx === 2) {
          const total = int(r, 12, 20) * 2 + 1;
          const b = bars(r, total);
          let run = 0;
          const at = b.findIndex(([, n]) => (run += n) >= (total + 1) / 2);
          const tall = b.reduce((best, x, i) => (x[1] > b[best][1] ? i : best), 0);
          if (at === tall || at === 2) again();
          const others = shuffle(r, [0, 1, 2, 3, 4].filter((i) => i !== at && i !== tall && i !== 2));
          return { prompt: `A histogram of ${total} test scores has these bars (interval: number of students): ${barText(b)}. In which interval is the median score?`,
            ...mc(r, b[at][0], [b[tall][0], b[2][0], b[others[0]][0]]),
            explanation: `With ${total} scores the median is the ${(total + 1) / 2}th in order. Add the bars from the left (${b.map((x) => x[1]).join(', ')}) until the running total reaches ${(total + 1) / 2}: that happens in ${b[at][0]}. The tallest bar (${b[tall][0]}) holds the most scores, not necessarily the middle one.` };
        }
        const total = pick(r, [20, 25, 50]);
        const b = bars(r, total), k = int(r, 2, 3);
        const below = sum(b.slice(0, k).map((x) => x[1]));
        return { prompt: `A histogram of ${total} test scores has these bars (interval: number of students): ${barText(b)}. What percent of the students scored below ${b[k][2]}?`, value: (100 * below) / total,
          explanation: `Below ${b[k][2]}: ${b.slice(0, k).map((x) => x[1]).join(' + ')} = ${below} students. As a percent of ${total}: ${below}/${total} = ${(100 * below) / total}%. ${below} is a count, not a percent.` };
      }) },
  ],
};

// ── 11. exponential functions: basics ──────────────────────────────────────

const expTable = (a, b, from = 0) => { const xs = [from, from + 1, from + 2, from + 3]; return tbl(xs, xs.map((x) => a * b ** x)); };

const exponentialBasics = {
  courseSkill: 'exponential-functions-basics',
  skillId: 'a1-exponential-functions-basics',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        const a = int(r, 2, 9), b = int(r, 2, 4);
        if (a === b) again();
        if (idx === 0) {
          const x = b === 2 ? int(r, 3, 5) : int(r, 2, 3);
          return { prompt: `For f(x) = ${a} · ${b}^x, what is f(${x})?`, value: a * b ** x,
            explanation: `The exponent comes before the multiplication: ${b}^${x} = ${b ** x}, then ${a} · ${b ** x} = ${a * b ** x}. Multiplying first, (${a} · ${b})^${x}, or using ${b} · ${x} for ${b}^${x}, are the usual slips.` };
        }
        if (idx === 1) {
          return { prompt: `For f(x) = ${a} · ${b}^x, what is f(0)?`, value: a,
            explanation: `${b}^0 = 1, so f(0) = ${a} · 1 = ${a}. That is why the number in front is called the initial value. ${b}^0 is not 0 and not ${b}.` };
        }
        if (idx === 2) {
          const A = a * 10;
          return { prompt: `Which statement about y = ${A} · ${b}^x is correct?`,
            ...mc(r, `The initial value is ${A} and the growth factor is ${b}`, [
              `The initial value is ${b} and the growth factor is ${A}`,
              `The initial value is ${A * b} and the growth factor is ${b}`,
              `The initial value is ${A} and y increases by ${b} each time x increases by 1`,
            ]),
            explanation: `In y = a · b^x, a is the value when x = 0 (${A}) and b is the factor y is MULTIPLIED by each time x goes up 1 (${b}). ${A * b} is the value at x = 1. Adding ${b} each step would be linear.` };
        }
        const decay = int(r, 0, 1), base = decay ? pick(r, ['0.5', '0.8', '0.25', '0.9']) : pick(r, ['1.5', '2', '1.2', '3']);
        const A = decay ? int(r, 4, 9) * 10 : pick(r, ['0.5', '0.2', '0.4']);
        const opts = decay
          ? [`Exponential decay, because the base ${base} is between 0 and 1`,
            `Exponential growth, because the initial value ${A} is greater than 1`,
            `Linear decrease, because y drops by ${base} each time x increases by 1`,
            'Exponential growth, because the exponent x is increasing']
          : [`Exponential growth, because the base ${base} is greater than 1`,
            `Exponential decay, because the initial value ${A} is between 0 and 1`,
            `Linear increase, because y rises by ${base} each time x increases by 1`,
            'Exponential decay, because the exponent x is not negative'];
        return { prompt: `Which describes the function y = ${A} · (${base})^x?`,
          ...mcFixed(r, opts, opts[0]),
          explanation: `Growth or decay is decided by the BASE: greater than 1 means each step multiplies y by more than 1 (growth); between 0 and 1 means each step shrinks it (decay). Here the base is ${base}. The initial value ${A} only sets where the curve starts.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = int(r, 2, 4), x = int(r, 1, 3), k = int(r, 1, 6);
          if (b ** x > 30) again();
          const a = k * b ** x;
          return { prompt: `For f(x) = ${a} · ${b}^x, what is f(−${x})?`, value: k,
            explanation: `${b}^(−${x}) = 1/${b}^${x} = 1/${b ** x}. So f(−${x}) = ${a} · 1/${b ** x} = ${a} ÷ ${b ** x} = ${k}. A negative exponent divides; it does not make the answer negative.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 7), b = int(r, 2, 4);
          if (a === b) again();
          return { prompt: `A table of an exponential function has ${expTable(a, b)}. Which equation matches the table?`,
            ...mc(r, `y = ${a} · ${b}^x`, [`y = ${b} · ${a}^x`, `y = ${a * b - a}x + ${a}`, `y = ${a * b} · ${b}^x`]),
            explanation: `The initial value is y at x = 0: ${a}. Each y is ${b} times the one before (${a * b} ÷ ${a} = ${b}), so the factor is ${b}: y = ${a} · ${b}^x. A linear rule with slope ${a * b - a} fits only the first two rows.` };
        }
        if (idx === 2) {
          const A = int(r, 2, 9) * 100, kind = pick(r, [['doubles', '2'], ['triples', '3'], ['is cut in half', '(1/2)']]);
          const subject = kind[1] === '(1/2)'
            ? pick(r, [`The mass of a ${A}-gram sample of a substance`, `The amount of water in a tank that holds ${A} litres`])
            : pick(r, [`A population of ${A} bacteria`, `The number of views of a video that has ${A} views`]);
          const wrongB = kind[1] === '(1/2)' ? '2' : `(1/${kind[1]})`;
          return { prompt: `${subject} ${kind[0]} every hour. Which function gives the amount y after x hours?`,
            ...mc(r, `y = ${A} · ${kind[1]}^x`, [`y = ${A} · ${wrongB}^x`, `y = ${A} + ${kind[1]}x`, `y = ${kind[1]} · ${A}^x`]),
            explanation: `Start at ${A} (the initial value) and multiply by ${kind[1]} once for every hour: y = ${A} · ${kind[1]}^x. Adding ${kind[1]} each hour would be linear, and the starting amount is never the base.` };
        }
        const b = pick(r, [2, 4]), x = b === 2 ? int(r, 2, 4) : 2, k = int(r, 1, 7);
        const a = k * b ** x;
        return { prompt: `For f(x) = ${a} · (1/${b})^x, what is f(${x})?`, value: k,
          explanation: `(1/${b})^${x} = 1/${b ** x}. So f(${x}) = ${a} · 1/${b ** x} = ${a} ÷ ${b ** x} = ${k}. Each step multiplies by 1/${b}: ${Array.from({ length: x + 1 }, (_, i) => a / b ** i).join(', ')}.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const p = pick(r, [2, 4, 5, 8, 12, 15, 20, 25]), up = int(r, 0, 1), A = int(r, 2, 9) * 500;
          const b = num(up ? 1 + p / 100 : 1 - p / 100);
          return { prompt: up
            ? `An investment of $${A} grows by ${p}% each year, so its value after x years is y = ${A} · b^x. What is the value of b?`
            : `A car worth $${A} loses ${p}% of its value each year, so its value after x years is y = ${A} · b^x. What is the value of b?`,
          value: b,
          explanation: up
            ? `Each year the value keeps its 100% and gains ${p}%: it is multiplied by 1 + ${num(p / 100)} = ${b}. ${num(p / 100)} alone is the rate, not the factor.`
            : `Each year the value keeps 100% − ${p}% = ${100 - p}% of itself: it is multiplied by 1 − ${num(p / 100)} = ${b}. ${num(p / 100)} is the part that is lost, not the factor.` };
        }
        if (idx === 1) {
          const a = int(r, 2, 7), b = int(r, 2, 3);
          if (a === b || a * b === b) again();
          return { prompt: `A table of an exponential function has ${expTable(a, b, 1)}. Which equation matches the table?`,
            ...mc(r, `y = ${a} · ${b}^x`, [`y = ${a * b} · ${b}^x`, `y = ${b} · ${a}^x`, `y = ${a * b}x`]),
            explanation: `The ratio of consecutive y-values is ${b}, so the base is ${b}. The table starts at x = 1, so go back one step for the initial value: ${a * b} ÷ ${b} = ${a} at x = 0. y = ${a} · ${b}^x. Using ${a * b} as the initial value is the usual slip.` };
        }
        if (idx === 2) {
          const a = int(r, 2, 5), b = int(r, 2, 3), d = int(r, 3, 9), s = int(r, 1, 6);
          const xs = [0, 1, 2, 3];
          const expo = tbl(xs, xs.map((x) => a * b ** x));
          const lines = tbl(xs, xs.map((x) => a + d * x));
          const squares = tbl(xs, xs.map((x) => s + x * x));
          const jumps = tbl(xs, [a, a + d, a + 3 * d, a + 6 * d]);
          if (new Set([expo, lines, squares, jumps]).size < 4 || (a + 3 * d) * a === (a + d) ** 2) again();
          return { prompt: 'Which table shows an exponential function?',
            ...mcFixed(r, [expo, lines, squares, jumps], expo),
            explanation: `An exponential function multiplies y by the same factor for each step of 1 in x. In "${expo}" every y is ${b} times the one before. "${lines}" adds ${d} each time (linear); the other two have neither a constant difference nor a constant ratio.` };
        }
        const b = pick(r, [2, 3]), x = b === 2 ? int(r, 2, 4) : int(r, 2, 3), a = int(r, 2, 6);
        return { prompt: `For f(x) = ${a} · (1/${b})^x, what is f(−${x})?`, value: a * b ** x,
          explanation: `A negative exponent flips the base: (1/${b})^(−${x}) = ${b}^${x} = ${b ** x}. So f(−${x}) = ${a} · ${b ** x} = ${a * b ** x}. Going backwards in a decay function makes the values larger.` };
      }) },
  ],
};

// ── 12. comparing linear and exponential ───────────────────────────────────

const WHY = ['Linear, because the differences between y-values are constant', 'Exponential, because the ratios between y-values are constant',
  'Neither, because neither the differences nor the ratios are constant', 'Both, because the differences and the ratios are constant'];
const firstAbove = (expo, line) => { for (let x = 0; x <= 40; x++) if (expo(x) > line(x)) return x; return again(); };

const comparingModels = {
  courseSkill: 'comparing-linear-exponential',
  skillId: 'a1-comparing-linear-exponential',
  tiers: [
    { difficulty: 2,
      gen: g((r, idx) => {
        if (idx === 0) {
          const isLin = int(r, 0, 1), a = int(r, 2, 6), k = int(r, 2, 4);
          const xs = [0, 1, 2, 3];
          const ys = isLin ? xs.map((x) => a + k * x) : xs.map((x) => a * k ** x);
          const o = (kind, what) => `${kind}, because the y-values have a constant ${what} of ${k}`;
          return { prompt: `A table of values has ${tbl(xs, ys)}. Is the function linear or exponential, and why?`,
            ...mc(r, isLin ? o('Linear', 'difference') : o('Exponential', 'ratio'),
              [o('Linear', 'ratio'), o('Exponential', 'difference'), isLin ? o('Exponential', 'ratio') : o('Linear', 'difference')]),
            explanation: isLin
              ? `Differences: ${ys[1]} − ${ys[0]} = ${k}, ${ys[2]} − ${ys[1]} = ${k}, ${ys[3]} − ${ys[2]} = ${k}. Adding the same amount each step is linear. The ratios (${num(ys[1] / ys[0])}, ${num(ys[2] / ys[1])}…) are not constant.`
              : `Ratios: ${ys[1]} ÷ ${ys[0]} = ${k}, ${ys[2]} ÷ ${ys[1]} = ${k}, ${ys[3]} ÷ ${ys[2]} = ${k}. Multiplying by the same factor each step is exponential. The differences (${ys[1] - ys[0]}, ${ys[2] - ys[1]}, ${ys[3] - ys[2]}) are not constant.` };
        }
        if (idx === 1) {
          const n = int(r, 2, 9), S = pick(r, [
            [`A worker's salary rises by $${n * 500} each year`, 'Linear growth', 'the same AMOUNT is added each year'],
            [`A worker's salary rises by ${n}% each year`, 'Exponential growth', 'a percent increase multiplies by the same factor each year'],
            [`A tank loses ${n} litres of water each minute`, 'Linear decay', 'the same AMOUNT is taken away each minute'],
            [`A tank loses ${n}% of its water each minute`, 'Exponential decay', 'a percent decrease multiplies by the same factor (less than 1) each minute'],
          ]);
          return { prompt: `${S[0]}. Which kind of model fits?`,
            ...mcFixed(r, ['Linear growth', 'Exponential growth', 'Linear decay', 'Exponential decay'], S[1]),
            explanation: `${S[1]}: ${S[2]}. A constant amount per step is linear; a constant percent (a constant factor) per step is exponential.` };
        }
        if (idx === 2) {
          const m = int(r, 2, 9), c = int(r, 1, 9), b = pick(r, [2, 3]), x = b === 2 ? int(r, 5, 7) : int(r, 3, 5);
          const v = b ** x - (m * x + c);
          if (v <= 0) again();
          return { prompt: `Let f(x) = ${m}x + ${c} and g(x) = ${b}^x. What is g(${x}) − f(${x})?`, value: v,
            explanation: `g(${x}) = ${b}^${x} = ${b ** x}. f(${x}) = ${m}(${x}) + ${c} = ${m * x + c}. Difference: ${b ** x} − ${m * x + c} = ${v}. ${b}^${x} is ${x} factors of ${b}, not ${b} × ${x}.` };
        }
        const a = int(r, 2, 6), b = int(r, 2, 3), at = int(r, 5, 6);
        return { prompt: `A table has ${expTable(a, b)}. The pattern in the y-values continues. What is y when x = ${at}?`, value: a * b ** at,
          explanation: `Each y is ${b} times the one before (constant ratio), so keep multiplying: ${Array.from({ length: at + 1 }, (_, i) => a * b ** i).join(', ')}. At x = ${at}, y = ${a * b ** at}. Adding the last difference each time treats it as linear.` };
      }) },
    { difficulty: 3,
      gen: g((r, idx) => {
        if (idx === 0) {
          const b = pick(r, [2, 3]), m = int(r, 2, 9) * 10, c = int(r, 1, 9) * 10;
          const x = firstAbove((t) => b ** t, (t) => m * t + c);
          if (x < 4) again();
          return { prompt: `Let f(x) = ${m}x + ${c} and g(x) = ${b}^x. What is the smallest whole number x for which g(x) is greater than f(x)?`, value: x,
            explanation: `Compare values: at x = ${x - 1}, g = ${b ** (x - 1)} and f = ${m * (x - 1) + c}; at x = ${x}, g = ${b ** x} and f = ${m * x + c}. So g first passes f at x = ${x}, and it stays ahead from then on.` };
        }
        if (idx === 1) {
          const s = int(r, 2, 8) * 50, d = int(r, 2, 9) * 10, a = pick(r, [5, 10, 20]), n = int(r, 5, 7);
          const A = s + d * n, B = a * 2 ** n;
          if (B - A <= 0 || a * 2 ** (n - 2) > s + d * (n - 2)) again();
          return { prompt: `Plan A starts with $${s} and adds $${d} each week. Plan B starts with $${a} and doubles each week. After ${n} weeks, how many dollars more does Plan B have than Plan A?`, value: B - A,
            explanation: `Plan A is linear: ${s} + ${d}(${n}) = ${A}. Plan B is exponential: ${a} · 2^${n} = ${a} · ${2 ** n} = ${B}. Difference: ${B} − ${A} = ${B - A}. Doubling ${n} times is × ${2 ** n}, not × ${2 * n}.` };
        }
        if (idx === 2) {
          const kind = int(r, 0, 2), xs = [0, 1, 2, 3];
          const d = int(r, 3, 9), top = int(r, 5, 9) * 8, s = int(r, 1, 9);
          const ys = kind === 0 ? xs.map((x) => top - d * x) : kind === 1 ? xs.map((x) => top / 2 ** x) : xs.map((x) => s + x * x);
          return { prompt: `A table of values has ${tbl(xs, ys)}. Which describes the function?`,
            ...mcFixed(r, WHY, WHY[kind]),
            explanation: `Differences: ${ys[1] - ys[0]}, ${ys[2] - ys[1]}, ${ys[3] - ys[2]}. Ratios: ${num(ys[1] / ys[0])}, ${num(ys[2] / ys[1])}, ${num(ys[3] / ys[2])}. ${kind === 0 ? 'The differences are constant, so it is linear (decreasing).' : kind === 1 ? 'The ratios are constant (each y is half the one before), so it is exponential decay.' : 'Neither is constant, so the function is neither linear nor exponential.'}` };
        }
        const a = int(r, 2, 5), b = int(r, 2, 3), x = int(r, 3, 5);
        return { prompt: `A linear function grows by the same amount on every step; an exponential one does not. For g(x) = ${a} · ${b}^x, by how much does g(x) increase from x = ${x} to x = ${x + 1}?`, value: a * b ** (x + 1) - a * b ** x,
          explanation: `g(${x}) = ${a} · ${b ** x} = ${a * b ** x} and g(${x + 1}) = ${a} · ${b ** (x + 1)} = ${a * b ** (x + 1)}. Increase: ${a * b ** (x + 1)} − ${a * b ** x} = ${a * b ** (x + 1) - a * b ** x}. The factor ${b} is constant; the amount added keeps growing.` };
      }) },
    { difficulty: 4,
      gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 5), b = pick(r, [2, 3]), m = int(r, 3, 9) * 20, c = int(r, 2, 9) * 50;
          const x = firstAbove((t) => a * b ** t, (t) => m * t + c);
          if (x < 4) again();
          return { prompt: `Let f(x) = ${m}x + ${c} and g(x) = ${a} · ${b}^x. What is the smallest whole number x for which g(x) is greater than f(x)?`, value: x,
            explanation: `At x = ${x - 1}: g = ${a} · ${b ** (x - 1)} = ${a * b ** (x - 1)}, f = ${m * (x - 1) + c}. At x = ${x}: g = ${a} · ${b ** x} = ${a * b ** x}, f = ${m * x + c}. g first passes f at x = ${x}. Remember ${b}^x is found before multiplying by ${a}.` };
        }
        if (idx === 1) {
          const p0 = int(r, 2, 9), d = int(r, 3, 9), a = int(r, 2, 4), b = int(r, 2, 3), at = int(r, 5, 6);
          const xs = [0, 1, 2, 3];
          const v = a * b ** at - (p0 + d * at);
          return { prompt: `Table P has ${tbl(xs, xs.map((x) => p0 + d * x))}. Table Q has ${tbl(xs, xs.map((x) => a * b ** x))}. Both patterns continue. At x = ${at}, how much greater is the y-value of Table Q than the y-value of Table P?`, value: v,
            explanation: `P adds ${d} each step (linear): at x = ${at}, y = ${p0} + ${d}(${at}) = ${p0 + d * at}. Q multiplies by ${b} each step (exponential): y = ${a} · ${b}^${at} = ${a * b ** at}. Difference: ${a * b ** at} − ${p0 + d * at} = ${v}.` };
        }
        if (idx === 2) {
          const base = pick(r, ['1.1', '1.2', '1.5', '2']), m = int(r, 2, 9) * 100, c = int(r, 2, 9) * 1000;
          const A = int(r, 2, 9) * 1000, dec = pick(r, ['0.9', '0.5', '0.8']), k = int(r, 20, 90);
          return { prompt: 'As x becomes very large, which function eventually has the greatest values?',
            ...mc(r, `y = ${base}^x`, [`y = ${m}x + ${c}`, `y = ${A} · (${dec})^x`, `y = ${k}x²`]),
            explanation: `y = ${base}^x is exponential growth (base greater than 1), and exponential growth eventually overtakes every linear function and every quadratic, however large their coefficients. y = ${A} · (${dec})^x is exponential DECAY: it starts high and shrinks toward 0.` };
        }
        const half = int(r, 0, 1), start = half ? int(r, 1, 5) * 8 : int(r, 1, 3) * 64;
        const f = half ? 1.5 : 1.25, pct = half ? 50 : 25;
        const xs = [0, 1, 2, 3], ys = xs.map((x) => start * f ** x);
        return { prompt: `A table of values has ${tbl(xs, ys)}. Which describes the pattern?`,
          ...mc(r, `Exponential, with a growth factor of ${f}`, [
            `Linear, with a constant difference of ${ys[1] - ys[0]}`,
            `Exponential, with a growth factor of ${num(f - 1)}`,
            `Exponential, with a growth factor of ${ys[1] - ys[0]}`,
          ]),
          explanation: `Ratios: ${ys[1]} ÷ ${ys[0]} = ${f}, ${ys[2]} ÷ ${ys[1]} = ${f}, ${ys[3]} ÷ ${ys[2]} = ${f} — constant, so it is exponential with factor ${f} (a ${pct}% increase each step). The differences (${ys[1] - ys[0]}, ${ys[2] - ys[1]}, ${ys[3] - ys[2]}) are not constant, and ${num(f - 1)} is the percent rate, not the factor.` };
      }) },
  ],
};

const TEMPLATES = [
  variableExpressions, algebraicProperties, solvingInequalities, graphingLines, systemsGraphing,
  exponentMultiplication, exponentDivision, quadraticFormula, centralTendency, dataDisplays,
  exponentialBasics, comparingModels,
];

module.exports = { COURSE_ID, GB, TEMPLATES };
