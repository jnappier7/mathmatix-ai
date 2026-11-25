'use strict';
/**
 * At-level check items for thirteen Algebra 2 course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   compound-interest-modeling · logarithm-evaluation-conversion ·
 *   logarithm-properties · exponential-logarithmic-equations ·
 *   domain-analysis-logarithms · rational-exponents ·
 *   simplifying-radicals-variables · radical-applications ·
 *   arithmetic-sequences-series · geometric-sequences-series ·
 *   sigma-notation · infinite-geometric-series · financial-applications
 *
 * Text only. A typed answer is one integer, terminating decimal or fraction;
 * anything with a variable, a radical, ln, an inequality or words is multiple
 * choice, and each wrong choice is the result of a named slip. Within a tier
 * the four items are four different FORMS of question (`forms`).
 *
 * Notation the prompts use: log₂(8) (subscript base; log( ) alone is base 10),
 * x^(2/3), √(…), ∛(…), "·" for a product, "Σ … where k runs from k = a to k = b".
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelAlgebra2B.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'algebra-2';
const GB = '9-12';

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

/** Four question forms in one tier: item idx gets form idx. */
const forms = (...fs) => g((r, idx) => fs[idx % fs.length](r));

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

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isWhole = (x) => Math.abs(x - Math.round(x)) < 1e-9;
const whole = (x) => { if (!isWhole(x)) again(); return Math.round(x); };
const money = (n) => `$${n.toLocaleString('en-US')}`;
/** A number in a prompt: Unicode minus. */
const U = (n) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
/** A rational in a prompt: "3", "3/4", "−3/4". */
const UF = (n, d) => K.frac(n, d).replace('-', '−');

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((ch) => SUB[Number(ch)]).join('');
/** log₂(arg); base 10 prints as log(arg). */
const lg = (b, arg) => (b === 10 ? `log(${arg})` : `log${sub(b)}(${arg})`);

/** x^(n/d) in lowest terms: "x", "x^3", "x^(5/6)", "x^(−1/6)". */
function xp(n, d = 1) {
  const [a, b] = K.reduce(n, d);
  if (a === 0) again();
  if (b === 1) return a === 1 ? 'x' : (a < 0 ? `x^(−${-a})` : `x^${a}`);
  return a < 0 ? `x^(−${-a}/${b})` : `x^(${a}/${b})`;
}
const vpow = (v, e) => (e === 0 ? '' : (e === 1 ? v : `${v}^${e}`));
const ROOT = { 2: '√', 3: '∛', 4: '∜' };
/** A radical: √7, √x, √(2x), ∛(x^2). */
function root(n, inside) {
  return /^(\d+|[a-z])$/.test(inside) ? `${ROOT[n]}${inside}` : `${ROOT[n]}(${inside})`;
}
/** coef · vars · root(inCoef · inVars): "6x^2y√(2x)", "3x^2", "√15". */
function radTerm(n, coef, vars, inCoef = 1, inVars = '') {
  const inside = `${inCoef > 1 ? inCoef : ''}${inVars}`;
  const radical = inside ? root(n, inside) : '';
  const lead = (coef !== 1 || (!vars && !radical)) ? String(coef) : '';
  return `${lead}${vars}${radical}`;
}

const ASSUME = 'Assume all variables are nonnegative.';

// ── compound interest ──────────────────────────────────────────────────────

const PERIODS = [['semiannually', 2], ['quarterly', 4], ['monthly', 12], ['daily', 365]];
// [rate %, principals that keep two years of annual compounding in whole dollars]
const ANNUAL_2 = [[5, [400, 800, 1200, 2000, 4000]], [10, [500, 800, 1200, 1500, 3000]], [20, [250, 500, 750, 1500, 2500]]];
const SEMI_1 = [[10, [2000, 4000, 6000, 8000]], [20, [500, 1500, 2500, 3000]], [8, [2500, 5000, 10000]]];
const ANNUAL_3 = [[10, [1000, 2000, 3000, 5000]], [20, [250, 500, 1000, 2000]]];

function annualBalance(table, years) {
  return (r) => {
    const [rate, ps] = pick(r, table);
    const P = pick(r, ps);
    const A = whole(P * Math.pow(1 + rate / 100, years));
    return {
      prompt: `${money(P)} is deposited in an account that pays ${rate}% annual interest, compounded annually. With no other deposits or withdrawals, what is the balance, in dollars, after ${years} years?`,
      value: A,
      explanation: `A = P(1 + r)^t = ${P}(${1 + rate / 100})^${years} = ${A}. Slip to avoid: simple interest, ${P} + ${years}·${P * rate / 100} = ${P + years * P * rate / 100}, leaves out the interest earned on interest.`,
    };
  };
}

const compoundInterest = {
  courseSkill: 'compound-interest-modeling',
  skillId: 'a2-compound-interest-modeling',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        annualBalance(ANNUAL_2, 2),
        (r) => {
          const [word, n] = pick(r, PERIODS);
          const rate = int(r, 2, 9);
          const dr = `0.0${rate}`;
          const t = int(r, 3, 10);
          const P = pick(r, [500, 1200, 2000, 2500, 4000]);
          return {
            prompt: `${money(P)} is invested at ${rate}% annual interest, compounded ${word}. Which expression gives the balance after ${t} years?`,
            ...mc(r, `${P}(1 + ${dr}/${n})^(${n}·${t})`, [
              `${P}(1 + ${dr})^(${n}·${t})`,
              `${P}(1 + ${dr}/${n})^${t}`,
              `${P}(1 + ${rate}/${n})^(${n}·${t})`,
            ]),
            explanation: `A = P(1 + r/n)^(nt) with r = ${dr} and n = ${n} periods a year: the rate is divided by ${n} and the exponent is ${n}·${t}. Slips: not dividing the rate, using ${t} periods, or leaving ${rate}% as ${rate}.`,
          };
        },
        (r) => {
          const [word, n] = pick(r, PERIODS.slice(0, 3));
          const rate = int(r, 2, 9);
          const t = int(r, 2, 9);
          return {
            prompt: `In the compound interest formula A = P(1 + r/n)^(nt), an account earns ${rate}% annual interest compounded ${word} for ${t} years. What is the value of the exponent nt?`,
            value: n * t,
            explanation: `Compounded ${word} means n = ${n} periods a year, so nt = ${n}·${t} = ${n * t} compounding periods in all.`,
          };
        },
        (r) => {
          const rate = int(r, 2, 9);
          const P = pick(r, [800, 1500, 2500, 3200, 6000]);
          return {
            prompt: `The balance of an account after t years is modeled by A = ${P}(1.0${rate})^t. What is the annual interest rate, as a percent?`,
            value: rate,
            explanation: `The model is A = P(1 + r)^t, so 1 + r = 1.0${rate} and r = 0.0${rate} = ${rate}%. (${P} is the starting balance, not the rate.)`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const [rate, ps] = pick(r, SEMI_1);
          const P = pick(r, ps);
          const A = whole(P * Math.pow(1 + rate / 200, 2));
          return {
            prompt: `${money(P)} is deposited in an account that pays ${rate}% annual interest, compounded semiannually (twice a year). What is the balance, in dollars, after 1 year?`,
            value: A,
            explanation: `Each half-year earns ${rate}%/2 = ${rate / 2}%, and there are 2 periods: ${P}(${1 + rate / 200})^2 = ${A}. Slip: one period at ${rate}% gives ${P * (1 + rate / 100)}.`,
          };
        },
        (r) => {
          const rate = int(r, 2, 9);
          const dr = `0.0${rate}`;
          const t = int(r, 3, 12);
          const P = pick(r, [500, 1200, 2000, 2500, 4000]);
          return {
            prompt: `${money(P)} is invested at ${rate}% annual interest, compounded continuously. Which expression gives the balance after ${t} years?`,
            ...mc(r, `${P}e^(${dr}·${t})`, [
              `${P}(1 + ${dr})^${t}`,
              `${P}e^(${rate}·${t})`,
              `${P}(1 + ${dr}·${t})`,
            ]),
            explanation: `Continuous compounding uses A = Pe^(rt) with r as a decimal: ${P}e^(${dr}·${t}). (1 + r)^t is annual compounding, 1 + rt is simple interest, and ${rate} in place of ${dr} forgets to convert the percent.`,
          };
        },
        (r) => {
          const all = ['annually', 'semiannually', 'quarterly', 'monthly', 'daily', 'continuously'];
          const drop = shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 2);
          const four = all.filter((_, i) => !drop.includes(i));
          const most = int(r, 0, 1) === 1;
          const P = pick(r, [1000, 2500, 5000]);
          const rate = int(r, 3, 8);
          const t = int(r, 5, 20);
          const key = `The account compounded ${most ? four[3] : four[0]}`;
          const options = shuffle(r, four.map((w) => `The account compounded ${w}`));
          return {
            prompt: `Four accounts each start with ${money(P)} and pay ${rate}% annual interest for ${t} years. They differ only in how often interest is compounded: ${shuffle(r, four).join(', ')}. Which account has the ${most ? 'largest' : 'smallest'} balance after ${t} years?`,
            value: key,
            options,
            correctOption: 'ABCD'[options.indexOf(key)],
            explanation: `At the same rate, compounding more often earns interest on interest sooner, so the balance grows with the number of periods (continuous is the limit). The ${most ? 'largest' : 'smallest'} balance is ${key.toLowerCase()}.`,
          };
        },
        (r) => {
          const [rate, ps] = pick(r, ANNUAL_2);
          const P = pick(r, ps);
          const A = whole(P * Math.pow(1 + rate / 100, 2));
          return {
            prompt: `${money(P)} is deposited in an account that pays ${rate}% annual interest, compounded annually. With no other deposits or withdrawals, how much interest, in dollars, does the account earn in the first 2 years?`,
            value: A - P,
            explanation: `Balance: ${P}(${1 + rate / 100})^2 = ${A}. Interest = ${A} − ${P} = ${A - P}. Slips: giving the balance ${A}, or simple interest ${2 * P * rate / 100}.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const d = int(r, 6, 12);
          const k = int(r, 2, 4);
          const P = pick(r, [500, 750, 1200, 1500, 2500]);
          return {
            prompt: `An investment earns compound interest at a fixed rate, and its value doubles every ${d} years. If ${money(P)} is invested, what is its value, in dollars, after ${k * d} years?`,
            value: P * 2 ** k,
            explanation: `${k * d} years is ${k} doubling periods, so the value is ${P}·2^${k} = ${P * 2 ** k}. ${k > 2 ? `Slip: multiplying by 2·${k} = ${2 * k} gives ${P * 2 * k} — doubling compounds, it does not add.` : `Slip: counting ${k * d} years as ${k * d} doublings instead of ${k}.`}`,
          };
        },
        annualBalance(ANNUAL_3, 3),
        (r) => {
          const rate = int(r, 2, 9);
          const dr = `0.0${rate}`;
          const m = int(r, 2, 5);
          const P = pick(r, [500, 1000, 2000, 4000]);
          return {
            prompt: `${money(P)} is invested at ${rate}% annual interest, compounded continuously. Which expression gives the number of years it takes for the balance to reach ${money(m * P)}?`,
            ...mc(r, `ln(${m}) / ${dr}`, [
              `${m} / ${dr}`,
              `ln(${m}) / ${rate}`,
              `ln(${dr}) / ${m}`,
            ]),
            explanation: `${m * P} = ${P}e^(${dr}t) → e^(${dr}t) = ${m} → ${dr}t = ln(${m}) → t = ln(${m}) / ${dr}. Slips: dividing without taking ln, or using ${rate} for ${dr}.`,
          };
        },
        (r) => {
          const [rate, ps] = pick(r, ANNUAL_2);
          const P = pick(r, ps);
          const A = whole(P * Math.pow(1 + rate / 100, 2));
          return {
            prompt: `An account pays ${rate}% annual interest, compounded annually. After 2 years the balance is ${money(A)}, with no other deposits or withdrawals. How many dollars were originally deposited?`,
            value: P,
            explanation: `${A} = P(${1 + rate / 100})^2 = ${(Math.round((1 + rate / 100) ** 2 * 10000) / 10000)}P, so P = ${P}. Slip: subtracting ${2 * rate}% of ${A} — the growth factor must be divided out, not subtracted.`,
          };
        },
      ),
    },
  ],
};

// ── logarithms: evaluate and convert ───────────────────────────────────────

/** A base and exponent with base^k ≤ max. */
function power(r, bases, kLo, kHi, max = 1300) {
  const b = pick(r, bases);
  const k = int(r, kLo, kHi);
  if (b ** k > max) again();
  return [b, k, b ** k];
}

const logEvaluation = {
  courseSkill: 'logarithm-evaluation-conversion',
  skillId: 'a2-logarithm-evaluation-conversion',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6], 2, 6);
          return {
            prompt: `Evaluate ${lg(b, v)}.`,
            value: k,
            explanation: `${lg(b, v)} asks "${b} to what power is ${v}?" Since ${b}^${k} = ${v}, the answer is ${k}. Slip: ${v} ÷ ${b} = ${v / b} is division, not a logarithm.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6, 7], 2, 5);
          if (k ** b === v) again();
          return {
            prompt: `Which equation is ${b}^${k} = ${v} written in logarithmic form?`,
            ...mc(r, `${lg(b, v)} = ${k}`, [
              `${lg(k, v)} = ${b}`,
              `${lg(b, k)} = ${v}`,
              `${lg(v, b)} = ${k}`,
            ]),
            explanation: `b^k = v means log_b(v) = k: the base stays the base and the logarithm IS the exponent. So ${b}^${k} = ${v} becomes ${lg(b, v)} = ${k}.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6, 7], 2, 5);
          if (k ** b === v) again();
          return {
            prompt: `Which equation is ${lg(b, v)} = ${k} written in exponential form?`,
            ...mc(r, `${b}^${k} = ${v}`, [
              `${k}^${b} = ${v}`,
              `${b}^${v} = ${k}`,
              `${v}^${k} = ${b}`,
            ]),
            explanation: `log_b(v) = k means b^k = v: the base of the log is the base of the power, and the log's value is the exponent. So ${b}^${k} = ${v}.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6], 2, 5, 700);
          return {
            prompt: `Solve for x: ${lg(b, 'x')} = ${k}.`,
            value: v,
            explanation: `Rewrite in exponential form: x = ${b}^${k} = ${v}. Slip: ${b}·${k} = ${b * k} multiplies instead of raising to the power.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6], 2, 5, 700);
          return {
            prompt: `Evaluate ${lg(b, `1/${v}`)}.`,
            value: -k,
            explanation: `1/${v} = ${b}^(−${k}), so ${lg(b, `1/${v}`)} = −${k}. Slip: answering ${k} forgets that a reciprocal is a negative exponent.`,
          };
        },
        (r) => {
          const k = int(r, 2, 9);
          const neg = int(r, 0, 1) === 1;
          return {
            prompt: `Evaluate ${neg ? `ln(1/e^${k})` : `ln(e^${k})`}.`,
            value: neg ? -k : k,
            explanation: neg
              ? `1/e^${k} = e^(−${k}), and ln is the logarithm with base e, so ln(e^(−${k})) = −${k}.`
              : `ln is the logarithm with base e, so ln(e^${k}) asks "e to what power is e^${k}?" The answer is ${k}.`,
          };
        },
        (r) => {
          const [b, m] = pick(r, [[2, 2], [3, 2], [5, 2], [6, 2], [7, 2], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [2, 5]]);
          return {
            prompt: `Evaluate ${lg(b ** m, b)}.`,
            value: `1/${m}`,
            explanation: `${b ** m}^(1/${m}) is the ${['', '', 'square', 'cube', 'fourth', 'fifth'][m]} root of ${b ** m}, which is ${b}. So ${lg(b ** m, b)} = 1/${m}. Slip: ${m} is ${lg(b, b ** m)}, the other way round.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5, 6, 7, 8, 9], 2, 3);
          return {
            prompt: `The base x in logₓ(${v}) = ${k} is a positive number. What is x?`,
            value: b,
            explanation: `In exponential form x^${k} = ${v}, so x is the positive ${k === 2 ? 'square' : 'cube'} root of ${v}: x = ${b}. Slip: ${v} ÷ ${k} is not a root.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const m = int(r, 2, 5);
          const n = int(r, 2, 5);
          if (n % m === 0 || K.gcd(m, n) !== 1 && n / K.gcd(m, n) === 1) again();
          if (b ** m > 1100 || b ** n > 1100) again();
          return {
            prompt: `Evaluate ${lg(b ** m, b ** n)}.`,
            value: K.frac(n, m),
            explanation: `Write both as powers of ${b}: ${b ** m} = ${b}^${m} and ${b ** n} = ${b}^${n}. (${b}^${m})^x = ${b}^${n} gives ${m}x = ${n}, so x = ${K.frac(n, m)}. Slip: ${K.frac(m, n)} is upside down.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const m = int(r, 2, 4);
          const n = int(r, 1, 5);
          if (n % m === 0) again();
          if (b ** m > 700 || b ** n > 700) again();
          return {
            prompt: `Evaluate ${lg(b ** m, `1/${b ** n}`)}.`,
            value: K.frac(-n, m),
            explanation: `${b ** m} = ${b}^${m} and 1/${b ** n} = ${b}^(−${n}). (${b}^${m})^x = ${b}^(−${n}) gives ${m}x = −${n}, so x = ${K.frac(-n, m)}. Slip: dropping the negative from the reciprocal.`,
          };
        },
        (r) => {
          if (int(r, 0, 1) === 1) {
            const [b, k, v] = power(r, [2, 3, 4, 5], 2, 4, 300);
            return {
              prompt: `Solve for x: ${lg(b, 'x')} = −${k}.`,
              value: `1/${v}`,
              explanation: `x = ${b}^(−${k}) = 1/${b}^${k} = 1/${v}. Slip: −${v} — a negative exponent gives a reciprocal, not a negative number.`,
            };
          }
          const b = pick(r, [2, 3, 5]);
          const m = int(r, 2, 4);
          const n = int(r, 2, 5);
          if (K.gcd(m, n) !== 1) again();
          if (b ** m > 700 || b ** n > 700) again();
          return {
            prompt: `Solve for x: ${lg(b ** m, 'x')} = ${n}/${m}.`,
            value: b ** n,
            explanation: `x = ${b ** m}^(${n}/${m}): take the ${['', '', 'square', 'cube', 'fourth'][m]} root of ${b ** m} to get ${b}, then raise to the power ${n}: ${b}^${n} = ${b ** n}.`,
          };
        },
        (r) => {
          const k = int(r, 1, 5);
          const dec = `0.${'0'.repeat(k - 1)}1`;
          return {
            prompt: `Evaluate log(${dec}), where log is the common (base-10) logarithm.`,
            value: -k,
            explanation: `${dec} = 1/10^${k} = 10^(−${k}), so log(${dec}) = −${k}. Count the decimal places: ${k}. Slip: counting only the zeros after the point gives −${k - 1}.`,
          };
        },
      ),
    },
  ],
};

// ── properties of logarithms ───────────────────────────────────────────────

/** A, B with A·B = b^k and neither a power of b. */
function splitPower(r) {
  const b = pick(r, [6, 10, 12, 15]);
  const k = int(r, 1, 3);
  const V = b ** k;
  if (V > 3500) again();
  const isPow = (n) => { let p = 1; while (p < n) p *= b; return p === n; };
  const divs = [];
  for (let d = 2; d < V; d++) if (V % d === 0 && !isPow(d) && !isPow(V / d)) divs.push(d);
  if (!divs.length) again();
  const A = pick(r, divs);
  return [b, k, A, V / A];
}

const logProperties = {
  courseSkill: 'logarithm-properties',
  skillId: 'a2-logarithm-properties',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const b = pick(r, [2, 3, 5, 7]);
          const c = pick(r, [2, 3, 5, 6, 7, 9].filter((n) => n !== b));
          const L = (a) => lg(b, a);
          return {
            prompt: `Which expression is equivalent to ${L(`${c}x`)}?`,
            ...mc(r, `${L(c)} + ${L('x')}`, [`${L(c)}·${L('x')}`, `${c}·${L('x')}`, `${L(c)} − ${L('x')}`]),
            explanation: `Product rule: the log of a product is the SUM of the logs, so ${L(`${c}x`)} = ${L(c)} + ${L('x')}. Slips: multiplying the logs, or pulling ${c} out front as if it were an exponent.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7]);
          const c = pick(r, [2, 3, 5, 6, 7, 9].filter((n) => n !== b));
          const L = (a) => lg(b, a);
          return {
            prompt: `Which expression is equivalent to ${L(`x/${c}`)}?`,
            ...mc(r, `${L('x')} − ${L(c)}`, [`${L('x')} / ${L(c)}`, `${L('x')} + ${L(c)}`, `${L('x')} − ${c}`]),
            explanation: `Quotient rule: the log of a quotient is the DIFFERENCE of the logs, so ${L(`x/${c}`)} = ${L('x')} − ${L(c)}. Slip: dividing the two logs.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7, 10]);
          const k = int(r, 2, 6);
          const L = (a) => lg(b, a);
          return {
            prompt: `Which expression is equivalent to ${L(`x^${k}`)}?`,
            ...mc(r, `${k}·${L('x')}`, [L(`${k}x`), `(${L('x')})^${k}`, `${k} + ${L('x')}`]),
            explanation: `Power rule: an exponent inside a log comes out as a factor, so ${L(`x^${k}`)} = ${k}·${L('x')}. Slip: (${L('x')})^${k} raises the whole log to the power, which is a different thing.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const k = int(r, 1, 4);
          const B = pick(r, [3, 5, 6, 7].filter((n) => n !== b));
          const A = B * b ** k;
          if (A > 400) again();
          return {
            prompt: `Use the properties of logarithms to evaluate ${lg(b, A)} − ${lg(b, B)}.`,
            value: k,
            explanation: `Quotient rule: ${lg(b, A)} − ${lg(b, B)} = ${lg(b, `${A}/${B}`)} = ${lg(b, b ** k)} = ${k}. Slip: subtracting the numbers, ${lg(b, A - B)}, is not a log rule.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const b = pick(r, [2, 3, 5, 7, 10]);
          const m = int(r, 2, 5);
          const plus = int(r, 0, 1) === 1;
          const L = (a) => lg(b, a);
          return {
            prompt: `Which single logarithm is equivalent to ${m}·${L('x')} ${plus ? '+' : '−'} ${L('y')}?`,
            ...mc(r, plus ? L(`x^${m}·y`) : L(`x^${m}/y`), plus
              ? [L(`${m}x + y`), L(`${m}xy`), L(`x^${m} + y`)]
              : [L(`${m}x − y`), L(`${m}x/y`), L(`x^${m} − y`)]),
            explanation: `Power rule first: ${m}·${L('x')} = ${L(`x^${m}`)}. Then ${plus ? 'a sum of logs is the log of the product' : 'a difference of logs is the log of the quotient'}: ${plus ? L(`x^${m}·y`) : L(`x^${m}/y`)}. Slip: leaving ${m} as a coefficient inside the log.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7, 10]);
          const m = int(r, 2, 5);
          const L = (a) => lg(b, a);
          return {
            prompt: `Which expression is equivalent to ${L(`x^${m}/y`)}?`,
            ...mc(r, `${m}·${L('x')} − ${L('y')}`, [
              `${m}·${L('x')} + ${L('y')}`,
              `${m}·(${L('x')} − ${L('y')})`,
              `${L(`${m}x`)} − ${L('y')}`,
            ]),
            explanation: `Quotient rule: ${L(`x^${m}`)} − ${L('y')}; then the power rule on the first term only: ${m}·${L('x')} − ${L('y')}. Slip: the ${m} belongs to x alone, so it does not multiply ${L('y')}.`,
          };
        },
        (r) => {
          const [b, k, A, B] = splitPower(r);
          return {
            prompt: `Use the properties of logarithms to evaluate ${lg(b, A)} + ${lg(b, B)}.`,
            value: k,
            explanation: `Product rule: ${lg(b, A)} + ${lg(b, B)} = ${lg(b, `${A}·${B}`)} = ${lg(b, A * B)} = ${k}, because ${b}^${k} = ${A * B}. Slip: adding the numbers, ${lg(b, A + B)}.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7]);
          const N = pick(r, [6, 10, 11, 12, 13, 14, 15, 20, 30].filter((n) => n % b !== 0 || n === 6 || n === 10 || n === 12 || n === 14 || n === 15 || n === 20 || n === 30));
          if (N === b) again();
          return {
            prompt: `Which expression is equivalent to ${lg(b, N)}?`,
            ...mc(r, `ln(${N}) / ln(${b})`, [`ln(${b}) / ln(${N})`, `ln(${N}) − ln(${b})`, `ln(${N}) / ${b}`]),
            explanation: `Change of base: log_b(N) = ln(N) / ln(b), the log of the number over the log of the base: ln(${N}) / ln(${b}). Slips: the ratio upside down, or subtracting (that is ln(${N}/${b})).`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const [N, p, q] = pick(r, [[12, 2, 1], [18, 1, 2], [24, 3, 1], [54, 1, 3], [72, 3, 2], [48, 4, 1], [108, 2, 3], [162, 1, 4]]);
          const t = (c, v) => (c === 1 ? v : `${c}${v}`);
          const pw = (v, c) => (c === 1 ? v : `${v}^${c}`);
          return {
            prompt: `If log(2) = a and log(3) = b, which expression is equivalent to log(${N})?`,
            ...mc(r, `${t(p, 'a')} + ${t(q, 'b')}`, [
              `${pw('a', p)}·${pw('b', q)}`,
              `${t(q, 'a')} + ${t(p, 'b')}`,
              `${t(p * q, 'ab')}`,
            ]),
            explanation: `${N} = 2^${p}·3^${q}, so log(${N}) = ${p}·log(2) + ${q}·log(3) = ${t(p, 'a')} + ${t(q, 'b')}. Slip: keeping the powers and the product (${pw('a', p)}·${pw('b', q)}) forgets that logs turn powers into factors and products into sums.`,
          };
        },
        (r) => {
          const m = int(r, 2, 4);
          const n = pick(r, [2, 3].filter((v) => v !== m));
          const c = pick(r, [2, 3, 5, 7]);
          return {
            prompt: `Which single logarithm is equivalent to ${m}·ln(x) − ${n}·ln(y) + ln(${c})?`,
            ...mc(r, `ln(${c}x^${m}/y^${n})`, [
              `ln(${c}x^${m}·y^${n})`,
              `ln(${m}x − ${n}y + ${c})`,
              `ln(${c * m}x/(${n}y))`,
            ]),
            explanation: `Power rule: ln(x^${m}) − ln(y^${n}) + ln(${c}). A subtracted log divides and an added log multiplies: ln(${c}x^${m}/y^${n}). Slip: treating the coefficients ${m} and ${n} as factors inside the log.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5], 2, 4, 300);
          const L = (a) => lg(b, a);
          if (int(r, 0, 1) === 1) {
            return {
              prompt: `Which expression is equivalent to ${L(`${v}x`)}?`,
              ...mc(r, `${k} + ${L('x')}`, [`${k}·${L('x')}`, `${v} + ${L('x')}`, `${v}·${L('x')}`]),
              explanation: `Product rule: ${L(v)} + ${L('x')}, and ${L(v)} = ${k} because ${b}^${k} = ${v}. So the expression is ${k} + ${L('x')}. Slip: ${v}·${L('x')} treats the factor as an exponent.`,
            };
          }
          return {
            prompt: `Which expression is equivalent to ${L(`x/${v}`)}?`,
            ...mc(r, `${L('x')} − ${k}`, [`${L('x')} / ${k}`, `${L('x')} − ${v}`, `${L('x')} / ${v}`]),
            explanation: `Quotient rule: ${L('x')} − ${L(v)}, and ${L(v)} = ${k} because ${b}^${k} = ${v}. So the expression is ${L('x')} − ${k}. Slip: dividing the log by ${v}.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const [p, q] = pick(r, [[3, 5], [3, 7], [5, 7], [5, 3], [7, 3]].filter(([u, v]) => u !== b && v !== b));
          const i = int(r, 1, 3);
          const j = int(r, 0, 2);
          const l = int(r, 0, 1);
          const k = i + j - l;
          if (k < 1) again();
          const A = p * b ** i, B = q * b ** j, C = p * q * b ** l;
          if (A > 250 || B > 250 || C > 250) again();
          return {
            prompt: `Use the properties of logarithms to evaluate ${lg(b, A)} + ${lg(b, B)} − ${lg(b, C)}.`,
            value: k,
            explanation: `Combine into one log: ${lg(b, `${A}·${B}/${C}`)} = ${lg(b, A * B / C)} = ${k}, because ${b}^${k} = ${b ** k}. Added logs multiply, the subtracted log divides.`,
          };
        },
      ),
    },
  ],
};

// ── exponential and logarithmic equations ──────────────────────────────────

const expLogEquations = {
  courseSkill: 'exponential-logarithmic-equations',
  skillId: 'a2-exponential-logarithmic-equations',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5], 3, 6, 1100);
          const c = K.nonZero(r, -4, 5);
          return {
            prompt: `Solve for x: ${b}^(x ${K.signed(c)}) = ${v}.`,
            value: k - c,
            explanation: `${v} = ${b}^${k}, so the exponents are equal: x ${K.signed(c)} = ${k}, and x = ${k - c}. Slip: stopping at ${k}, the exponent, without solving for x.`,
          };
        },
        (r) => {
          const a = int(r, 2, 4);
          const x = int(r, 1, 3);
          const b = pick(r, [2, 3, 5]);
          const k = a * x;
          if (b ** k > 5000) again();
          return {
            prompt: `Solve for x: ${b}^(${a}x) = ${b ** k}.`,
            value: x,
            explanation: `${b ** k} = ${b}^${k}, so ${a}x = ${k} and x = ${x}. Slip: answering ${k} forgets to divide by ${a}.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5], 2, 4, 300);
          const c = K.nonZero(r, -6, 6);
          return {
            prompt: `Solve for x: ${lg(b, `x ${K.signed(c)}`)} = ${k}.`,
            value: v - c,
            explanation: `Exponential form: x ${K.signed(c)} = ${b}^${k} = ${v}, so x = ${v - c}. Slip: ${b}·${k} = ${b * k} in place of ${b}^${k}.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7]);
          const N = pick(r, [5, 6, 7, 10, 11, 12, 13, 20].filter((n) => n !== b));
          return {
            prompt: `Which is the exact solution of ${b}^x = ${N}?`,
            ...mc(r, `ln(${N}) / ln(${b})`, [`ln(${b}) / ln(${N})`, K.frac(N, b), `ln(${N}) − ln(${b})`]),
            explanation: `Take ln of both sides: x·ln(${b}) = ln(${N}), so x = ln(${N}) / ln(${b}). Slips: the ratio upside down, dividing ${N} by ${b}, or subtracting the logs (that is ln(${N}/${b})).`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const p = int(r, 1, 3);
          const q = int(r, 2, 4);
          if (p === q || b ** q > 130) again();
          const c = K.nonZero(r, -4, 5);
          return {
            prompt: `Solve for x: ${b ** p}^(x ${K.signed(c)}) = ${b ** q}^x.`,
            value: K.frac(p * c, q - p),
            explanation: `Write both sides with base ${b}: ${b}^(${p}(x ${K.signed(c)})) = ${b}^(${q}x). Then ${p}x ${K.signed(p * c)} = ${q}x, so x = ${K.frac(p * c, q - p)}. Slip: setting x ${K.signed(c)} = x without matching the bases first.`,
          };
        },
        (r) => {
          const a = int(r, 2, 6);
          const k = int(r, 2, 5);
          const m = pick(r, [3, 5, 6, 7, 8, 10]);
          return {
            prompt: `Which is the exact solution of ${a}e^(${k}x) = ${a * m}?`,
            ...mc(r, `ln(${m}) / ${k}`, [`ln(${a * m}) / ${a * k}`, `${k}·ln(${m})`, `ln(${m}) − ${k}`]),
            explanation: `Divide by ${a} first: e^(${k}x) = ${m}. Take ln: ${k}x = ln(${m}), so x = ln(${m}) / ${k}. Slip: taking ln before isolating the exponential, ln(${a * m}) / ${a * k}.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 4, 5], 2, 4, 300);
          const a = int(r, 2, 5);
          const x = int(r, 1, 30);
          const c = v - a * x;
          if (c === 0 || Math.abs(c) > 20) again();
          return {
            prompt: `Solve for x: ${lg(b, `${a}x ${K.signed(c)}`)} = ${k}.`,
            value: x,
            explanation: `Exponential form: ${a}x ${K.signed(c)} = ${b}^${k} = ${v}. Then ${a}x = ${v - c} and x = ${x}. Check: the argument ${v} is positive, so the solution is valid.`,
          };
        },
        (r) => {
          const [b, k, v] = power(r, [2, 3, 6, 10], 2, 5, 1100);
          const ms = [];
          for (let d = 2; d < v; d++) if (v % d === 0 && d <= 50) ms.push(d);
          const m = pick(r, ms);
          return {
            prompt: `Solve for x: ${lg(b, 'x')} + ${lg(b, m)} = ${k}.`,
            value: v / m,
            explanation: `Product rule: ${lg(b, `${m}x`)} = ${k}, so ${m}x = ${b}^${k} = ${v} and x = ${v / m}. Slip: x + ${m} = ${v} gives ${v - m} — a sum of logs is the log of a PRODUCT.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const [b, k, v] = power(r, [2, 3, 6, 10], 1, 4, 110);
          const pairs = [];
          for (let q = 1; q * q < v; q++) if (v % q === 0) pairs.push([v / q, q]);
          if (!pairs.length) again();
          const [p, q] = pick(r, pairs);
          const d = p - q;
          return {
            prompt: `Solve for x: ${lg(b, 'x')} + ${lg(b, `x − ${d}`)} = ${k}.`,
            value: p,
            explanation: `Product rule: ${lg(b, `x(x − ${d})`)} = ${k}, so x^2 − ${d}x = ${v}, which factors as (x − ${p})(x + ${q}) = 0. x = −${q} is extraneous (the log of a negative number is undefined), so x = ${p}.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const p = int(r, 1, 4);
          const q = int(r, 1, 4);
          if (p === q || b ** p > 130 || b ** q > 130) again();
          const c = K.nonZero(r, -4, 4);
          const d = K.nonZero(r, -4, 4);
          if (q * d - p * c === 0) again();
          return {
            prompt: `Solve for x: ${b ** p}^(x ${K.signed(c)}) = ${b ** q}^(x ${K.signed(d)}).`,
            value: K.frac(q * d - p * c, p - q),
            explanation: `Base ${b} on both sides: ${p}(x ${K.signed(c)}) = ${q}(x ${K.signed(d)}), so ${p}x ${K.signed(p * c)} = ${q}x ${K.signed(q * d)} and x = ${K.frac(q * d - p * c, p - q)}. Slip: forgetting to distribute the exponents ${p} and ${q}.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5]);
          const N = pick(r, [7, 10, 11, 13, 20].filter((n) => n % b !== 0));
          const c = int(r, 1, 5);
          const plus = int(r, 0, 1) === 1;
          const base = `ln(${N}) / ln(${b})`;
          return {
            prompt: `Which is the exact solution of ${b}^(x ${plus ? '+' : '−'} ${c}) = ${N}?`,
            ...mc(r, `${base} ${plus ? '−' : '+'} ${c}`, [
              `${base} ${plus ? '+' : '−'} ${c}`,
              `(ln(${N}) ${plus ? '−' : '+'} ${c}) / ln(${b})`,
              `ln(${N}/${b}) ${plus ? '−' : '+'} ${c}`,
            ]),
            explanation: `Take ln: (x ${plus ? '+' : '−'} ${c})·ln(${b}) = ln(${N}), so x ${plus ? '+' : '−'} ${c} = ln(${N}) / ln(${b}) and x = ${base} ${plus ? '−' : '+'} ${c}. Slip: moving ${c} before dividing by ln(${b}).`,
          };
        },
        (r) => {
          const p = int(r, 2, 7);
          const c = p * (p - 1);
          return {
            prompt: `Solve for x: ln(x + ${c}) = 2·ln(x).`,
            value: p,
            explanation: `2·ln(x) = ln(x^2), so x + ${c} = x^2, i.e. x^2 − x − ${c} = (x − ${p})(x + ${p - 1}) = 0. x = −${p - 1} is extraneous because ln(x) needs x > 0, so x = ${p}.`,
          };
        },
      ),
    },
  ],
};

// ── domain of logarithmic functions ────────────────────────────────────────

const lnOrLog = (r) => pick(r, [(a) => `ln(${a})`, (a) => `log(${a})`, (a) => lg(2, a), (a) => lg(3, a), (a) => lg(5, a)]);

const logDomain = {
  courseSkill: 'domain-analysis-logarithms',
  skillId: 'a2-domain-analysis-logarithms',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const f = lnOrLog(r);
          const h = K.nonZero(r, -9, 9);
          return {
            prompt: `What is the domain of f(x) = ${f(`x ${K.signed(-h)}`)}?`,
            ...mc(r, `x > ${U(h)}`, [`x ≥ ${U(h)}`, `x > ${U(-h)}`, `x < ${U(h)}`]),
            explanation: `The argument of a logarithm must be positive: x ${K.signed(-h)} > 0, so x > ${U(h)}. Slips: allowing x = ${U(h)} (log of 0 is undefined) or taking the sign from the expression, x > ${U(-h)}.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const h = K.nonZero(r, -9, 9);
          const k = K.nonZero(r, -6, 6);
          if (k === h || k === -h) again();
          return {
            prompt: `The graph of y = ${f(`x ${K.signed(-h)}`)} ${K.signed(k)} has a vertical asymptote at x = k. What is the value of k?`,
            value: h,
            explanation: `The asymptote is where the argument is 0: x ${K.signed(-h)} = 0, so x = ${h}. The ${K.signed(k)} outside shifts the graph up or down and does not move the asymptote.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const h = K.nonZero(r, -8, 8);
          const key = h + int(r, 1, 4);
          const b1 = h - int(r, 1, 3);
          const b2 = b1 - int(r, 1, 4);
          return {
            prompt: `Which of these x-values is in the domain of f(x) = ${f(`x ${K.signed(-h)}`)}?`,
            ...mc(r, U(key), [U(h), U(b1), U(b2)]),
            explanation: `The domain is x ${K.signed(-h)} > 0, i.e. x > ${U(h)}. Only ${U(key)} is greater than ${U(h)}; x = ${U(h)} itself makes the argument 0, which is not allowed.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const h = K.nonZero(r, -9, 9);
          return {
            prompt: `What is the domain of f(x) = ${f(`x ${K.signed(-h)}`)}, in interval notation?`,
            ...mc(r, `(${U(h)}, ∞)`, [`[${U(h)}, ∞)`, `(${U(-h)}, ∞)`, `(−∞, ${U(h)})`]),
            explanation: `x ${K.signed(-h)} > 0 gives x > ${U(h)}, written (${U(h)}, ∞). The parenthesis matters: ${U(h)} is NOT included, because the log of 0 is undefined.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 6);
          const h = K.nonZero(r, -6, 8);
          const c = a * h;
          return {
            prompt: `What is the domain of f(x) = ${f(`${a}x ${K.signed(-c)}`)}?`,
            ...mc(r, `x > ${U(h)}`, [`x > ${U(c)}`, `x ≥ ${U(h)}`, `x > ${U(-h)}`]),
            explanation: `${a}x ${K.signed(-c)} > 0 → ${a}x > ${U(c)} → x > ${U(h)}. Slip: x > ${U(c)} stops before dividing by ${a}.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 6);
          const h = int(r, 2, 9);
          return {
            prompt: `What is the domain of f(x) = ${f(`${a * h} − ${a}x`)}?`,
            ...mc(r, `x < ${h}`, [`x > ${h}`, `x < −${h}`, `x ≤ ${h}`]),
            explanation: `${a * h} − ${a}x > 0 → ${a * h} > ${a}x → x < ${h}. Slip: x > ${h} forgets that dividing by −${a} reverses the inequality.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 6);
          const h = K.nonZero(r, -7, 9);
          const k = K.nonZero(r, -5, 5);
          if (k === h || a * h === k || -a * h === k) again();
          return {
            prompt: `The graph of y = ${f(`${a}x ${K.signed(-a * h)}`)} ${K.signed(k)} has a vertical asymptote at x = k. What is the value of k?`,
            value: h,
            explanation: `Set the argument equal to 0: ${a}x ${K.signed(-a * h)} = 0 → x = ${h}. Slip: ${a * h} forgets to divide by ${a}; the ${K.signed(k)} outside does not move the asymptote.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 5);
          const c = int(r, 3, 30);
          const ans = Math.floor(c / a) + 1;
          return {
            prompt: `What is the smallest integer in the domain of f(x) = ${f(`${a}x − ${c}`)}?`,
            value: ans,
            explanation: `${a}x − ${c} > 0 → x > ${K.frac(c, a)}. The smallest integer greater than ${K.frac(c, a)} is ${ans}.${c % a === 0 ? ` (x = ${c / a} itself makes the argument 0, which is not allowed.)` : ''}`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 9);
          return {
            prompt: `What is the domain of f(x) = ${f(`x^2 − ${a * a}`)}?`,
            ...mc(r, `x < −${a} or x > ${a}`, [`−${a} < x < ${a}`, `x > ${a}`, `x > ${a * a}`]),
            explanation: `x^2 − ${a * a} > 0 → x^2 > ${a * a} → x < −${a} or x > ${a}. Slip: x > ${a} alone misses the negative side, where x^2 is also larger than ${a * a}.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 2, 9);
          return {
            prompt: `What is the domain of f(x) = ${f(`${a * a} − x^2`)}?`,
            ...mc(r, `−${a} < x < ${a}`, [`x < −${a} or x > ${a}`, `x < ${a}`, `−${a * a} < x < ${a * a}`]),
            explanation: `${a * a} − x^2 > 0 → x^2 < ${a * a} → −${a} < x < ${a}. Slip: x < ${a} alone lets in x = −${a + 1}, where ${a * a} − x^2 is negative.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const p = int(r, 1, 5);
          const q = p + int(r, 1, 5);
          return {
            prompt: `What is the domain of f(x) = ${f(`x^2 − ${p + q}x + ${p * q}`)}?`,
            ...mc(r, `x < ${p} or x > ${q}`, [`${p} < x < ${q}`, `x > ${q}`, `x < −${q} or x > −${p}`]),
            explanation: `x^2 − ${p + q}x + ${p * q} = (x − ${p})(x − ${q}) must be positive. An upward parabola is positive OUTSIDE its roots: x < ${p} or x > ${q}. Between the roots the argument is negative.`,
          };
        },
        (r) => {
          const f = lnOrLog(r);
          const a = int(r, 1, 6);
          const b = a + int(r, 2, 7);
          return {
            prompt: `What is the domain of f(x) = ${f(`x − ${a}`)} + ${f(`${b} − x`)}?`,
            ...mc(r, `${a} < x < ${b}`, [`x > ${a}`, `x < ${b}`, `x < ${a} or x > ${b}`]),
            explanation: `BOTH arguments must be positive: x − ${a} > 0 gives x > ${a}, and ${b} − x > 0 gives x < ${b}. Together: ${a} < x < ${b}. Slip: checking only one of the two logs.`,
          };
        },
      ),
    },
  ],
};

// ── rational exponents ─────────────────────────────────────────────────────

// [value, base, root index]
const PERFECT = [[4, 2, 2], [9, 3, 2], [16, 4, 2], [25, 5, 2], [36, 6, 2], [49, 7, 2], [8, 2, 3], [27, 3, 3], [64, 4, 3], [125, 5, 3], [16, 2, 4], [81, 3, 4], [32, 2, 5]];
const NTH = ['', '', 'square', 'cube', 'fourth', 'fifth'];

const rationalExponents = {
  courseSkill: 'rational-exponents',
  skillId: 'a2-rational-exponents',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const [m, n] = pick(r, [[2, 3], [3, 2], [3, 4], [4, 3]]);
          return {
            prompt: `Which is x^(${m}/${n}) written in radical form (x > 0)?`,
            ...mc(r, root(n, `x^${m}`), [root(m, `x^${n}`), root(n, `${m}x`), `${m}x/${n}`]),
            explanation: `In x^(m/n) the denominator is the root and the numerator is the power: x^(${m}/${n}) = ${root(n, `x^${m}`)}. Slip: ${root(m, `x^${n}`)} swaps the two.`,
          };
        },
        (r) => {
          const [v, b, n] = pick(r, PERFECT.filter((p) => p[2] >= 3 || p[0] >= 25));
          return {
            prompt: `Evaluate ${v}^(1/${n}).`,
            value: b,
            explanation: `The exponent 1/${n} means the ${NTH[n]} root: ${b}^${n} = ${v}, so ${v}^(1/${n}) = ${b}. Slip: ${v} ÷ ${n} divides instead of taking a root.`,
          };
        },
        (r) => {
          const [v, b, n] = pick(r, PERFECT);
          const m = int(r, 2, 4);
          if (m === n || K.gcd(m, n) !== 1 || b ** m > 300) again();
          return {
            prompt: `Evaluate ${v}^(${m}/${n}).`,
            value: b ** m,
            explanation: `Root first, then power: the ${NTH[n]} root of ${v} is ${b}, and ${b}^${m} = ${b ** m}. Slip: ${v}·${m}/${n} multiplies by the fraction instead of using it as an exponent.`,
          };
        },
        (r) => {
          const n = int(r, 2, 4);
          const m = int(r, 2, 7);
          if (K.gcd(m, n) !== 1) again();
          return {
            prompt: `Which is ${root(n, `x^${m}`)} written with a rational exponent (x > 0)?`,
            ...mc(r, `x^(${m}/${n})`, [`x^(${n}/${m})`, `x^${m * n}`, `x^${m + n}`]),
            explanation: `The index of the root goes in the denominator: ${root(n, `x^${m}`)} = x^(${m}/${n}). Slip: x^(${n}/${m}) puts the root on top.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const [v, b, n] = pick(r, PERFECT);
          const m = int(r, 1, 3);
          if (K.gcd(m, n) !== 1 || b ** m > 130) again();
          return {
            prompt: `Evaluate ${v}^(−${m}/${n}).`,
            value: `1/${b ** m}`,
            explanation: `The negative exponent means a reciprocal: 1/${v}^(${m}/${n}). The ${NTH[n]} root of ${v} is ${b}${m > 1 ? `, and ${b}^${m} = ${b ** m}` : ''}, so the value is 1/${b ** m}. Slip: −${b ** m} — a negative exponent does not make the number negative.`,
          };
        },
        (r) => {
          const b = int(r, 2, 5), d = int(r, 2, 5);
          const a = int(r, 1, b - 1), c = int(r, 1, d - 1);
          if (b === d || K.gcd(a, b) !== 1 || K.gcd(c, d) !== 1) again();
          return {
            prompt: `Simplify x^(${a}/${b})·x^(${c}/${d}), where x > 0.`,
            ...mc(r, xp(a * d + c * b, b * d), [xp(a * c, b * d), xp(a + c, b + d), xp(Math.abs(a * d - c * b), b * d)]),
            explanation: `Same base, so ADD the exponents with a common denominator: ${a}/${b} + ${c}/${d} = ${K.frac(a * d + c * b, b * d)}. Slips: multiplying the exponents (${K.frac(a * c, b * d)}), or adding tops and bottoms (${K.frac(a + c, b + d)}).`,
          };
        },
        (r) => {
          const b = int(r, 2, 5);
          const a = int(r, 1, 5);
          const c = int(r, 2, 6);
          if (a === b || K.gcd(a, b) !== 1 || K.gcd(c, b) === 1) again();
          return {
            prompt: `Simplify (x^(${a}/${b}))^${c}, where x > 0.`,
            ...mc(r, xp(a * c, b), [xp(a + b * c, b), xp(a, b * c), xp(a + c, b)]),
            explanation: `A power of a power MULTIPLIES the exponents: (${a}/${b})·${c} = ${K.frac(a * c, b)}. Slip: adding them, ${a}/${b} + ${c} = ${K.frac(a + b * c, b)}.`,
          };
        },
        (r) => {
          const b = int(r, 2, 5), d = int(r, 2, 5);
          const a = int(r, 1, 2 * b - 1), c = int(r, 1, d - 1);
          if (b === d || K.gcd(a, b) !== 1 || K.gcd(c, d) !== 1 || a * d - c * b <= 0) again();
          return {
            prompt: `Simplify x^(${a}/${b}) / x^(${c}/${d}), where x > 0.`,
            ...mc(r, xp(a * d - c * b, b * d), [xp(a * d + c * b, b * d), xp(a * d, b * c), xp(a * c, b * d)]),
            explanation: `Same base, so SUBTRACT the exponents: ${a}/${b} − ${c}/${d} = ${K.frac(a * d - c * b, b * d)}. Slips: adding them, or dividing one exponent by the other (${K.frac(a * d, b * c)}).`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const n = int(r, 2, 3);
          const m = pick(r, [1, 2, 3].filter((v) => v !== n));
          const [a, b] = pick(r, [[2, 3], [3, 2], [2, 5], [5, 2], [3, 4], [4, 3], [3, 5], [5, 3]]);
          if (n === 2 && m === 2) again();
          return {
            prompt: `Evaluate (${a ** n}/${b ** n})^(−${m}/${n}).`,
            value: K.frac(b ** m, a ** m),
            explanation: `The negative exponent flips the fraction: (${b ** n}/${a ** n})^(${m}/${n}). The ${NTH[n]} root gives ${b}/${a}${m > 1 ? `, and raising to the power ${m} gives ${b ** m}/${a ** m}` : ''}. Slip: ${K.frac(a ** m, b ** m)} forgets to flip.`,
          };
        },
        (r) => {
          const c = int(r, 2, 3);
          const n = int(r, 2, 3);
          const m = pick(r, [2, 3, 4].filter((v) => K.gcd(v, n) === 1));
          const p = n * int(r, 1, 3);
          const e = p * m / n;
          return {
            prompt: `Simplify (${c ** n}x^${p})^(${m}/${n}), where x > 0.`,
            ...mc(r, `${c ** m}x^${e}`, [`${c ** n}x^${e}`, `${c ** m}x^${p * m}`, `${c ** n * m}x^${e}`]),
            explanation: `The exponent applies to BOTH factors: ${c ** n}^(${m}/${n}) = ${c}^${m} = ${c ** m}, and (x^${p})^(${m}/${n}) = x^${e}. Slip: leaving the coefficient ${c ** n} unchanged.`,
          };
        },
        (r) => {
          const b = int(r, 2, 4), d = int(r, 2, 4), f = int(r, 2, 6);
          const a = int(r, 1, b + 1), c = int(r, 1, d - 1), e = int(r, 1, f - 1);
          if (b === d || K.gcd(a, b) !== 1 || K.gcd(c, d) !== 1 || K.gcd(e, f) !== 1) again();
          const D = b * d * f;
          const A = a * d * f, C = c * b * f, E = e * b * d;
          if (A + C - E <= 0) again();
          return {
            prompt: `Simplify (x^(${a}/${b})·x^(${c}/${d})) / x^(${e}/${f}), where x > 0.`,
            ...mc(r, xp(A + C - E, D), [xp(A + C + E, D), xp((A + C) * f, D * e), xp(A - C - E, D)]),
            explanation: `Multiplying adds exponents and dividing subtracts: ${a}/${b} + ${c}/${d} − ${e}/${f} = ${K.frac(A + C - E, D)}. Slips: adding all three, or dividing the exponents.`,
          };
        },
        (r) => {
          const n1 = int(r, 2, 4), n2 = int(r, 2, 4);
          const m1 = int(r, 1, 3), m2 = int(r, 1, 3);
          if (n1 === n2 || K.gcd(m1, n1) !== 1 || K.gcd(m2, n2) !== 1) again();
          const t = (n, m) => root(n, m === 1 ? 'x' : `x^${m}`);
          return {
            prompt: `Which is ${t(n1, m1)}·${t(n2, m2)} written as a single power of x (x > 0)?`,
            ...mc(r, xp(m1 * n2 + m2 * n1, n1 * n2), [xp(m1 * m2, n1 * n2), xp(m1 + m2, n1 + n2), xp(m1 + m2, n1 * n2)]),
            explanation: `${t(n1, m1)} = x^(${m1}/${n1}) and ${t(n2, m2)} = x^(${m2}/${n2}). Add the exponents: ${m1}/${n1} + ${m2}/${n2} = ${K.frac(m1 * n2 + m2 * n1, n1 * n2)}. Slip: multiplying the exponents gives ${K.frac(m1 * m2, n1 * n2)}.`,
          };
        },
      ),
    },
  ],
};

// ── simplifying radicals with variables ────────────────────────────────────

const SQFREE = [2, 3, 5, 6, 7];
const xy = (xe, ye = 0) => `${vpow('x', xe)}${vpow('y', ye)}`;

const simplifyingRadicals = {
  courseSkill: 'simplifying-radicals-variables',
  skillId: 'a2-simplifying-radicals-variables',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const s = int(r, 2, 6);
          const m = pick(r, SQFREE.filter((v) => v !== s));
          const p = pick(r, [2, 4, 6]);
          return {
            prompt: `Simplify ${root(2, `${s * s * m}x^${p}`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, s, xy(p / 2), m), [radTerm(2, s * s, xy(p / 2), m), radTerm(2, s, xy(p), m), radTerm(2, m, xy(p / 2), s)]),
            explanation: `${s * s * m} = ${s * s}·${m} and x^${p} = (${vpow('x', p / 2)})^2, so ${s}${vpow('x', p / 2)} comes out and ${m} stays inside. Slips: bringing out ${s * s} without taking its root, or not halving the exponent.`,
          };
        },
        (r) => {
          const s = int(r, 2, 5);
          const m = pick(r, [2, 3, 5]);
          const p = pick(r, [3, 5, 7]);
          const h = (p - 1) / 2;
          return {
            prompt: `Simplify ${root(2, `${s * s * m}x^${p}`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, s, xy(h), m, 'x'), [radTerm(2, s * s, xy(h), m, 'x'), radTerm(2, s, xy(h + 1), m, 'x'), radTerm(2, s, xy(h), m)]),
            explanation: `x^${p} = x^${p - 1}·x, so ${vpow('x', h)} comes out and one x stays inside; ${s * s * m} = ${s * s}·${m} gives ${s} outside. Slip: dropping the leftover x from under the radical.`,
          };
        },
        (r) => {
          const s = int(r, 3, 12);
          const a = int(r, 1, 4), b = int(r, 2, 5);
          if (a === b) again();
          return {
            prompt: `Simplify ${root(2, `${s * s}x^${2 * a}y^${2 * b}`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, s, xy(a, b)), [radTerm(2, s * s, xy(a, b)), radTerm(2, s, xy(2 * a, 2 * b)), radTerm(2, s, xy(a, 2 * b))]),
            explanation: `Every factor is a perfect square: √${s * s} = ${s}, and a square root halves each exponent: x^${2 * a} → ${vpow('x', a)}, y^${2 * b} → ${vpow('y', b)}. Slip: leaving the exponents unchanged.`,
          };
        },
        (r) => {
          const c = int(r, 2, 5);
          const a = int(r, 2, 4);
          return {
            prompt: `Simplify ${root(3, `${c ** 3}x^${3 * a}`)}.`,
            ...mc(r, radTerm(3, c, xy(a)), [radTerm(3, c * c, xy(a)), radTerm(3, c, xy(3 * a)), radTerm(3, c, xy(3 * a - 3))]),
            explanation: `${c ** 3} = ${c}^3 and x^${3 * a} = (${vpow('x', a)})^3, so the cube root is ${c}${vpow('x', a)}: a cube root divides each exponent by 3. Slip: subtracting 3 from the exponent instead of dividing.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const s = int(r, 2, 6);
          const m = pick(r, [2, 3, 5]);
          const p = pick(r, [3, 5, 7]);
          const q = pick(r, [2, 4, 6]);
          const h = (p - 1) / 2;
          return {
            prompt: `Simplify ${root(2, `${s * s * m}x^${p}y^${q}`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, s, xy(h, q / 2), m, 'x'), [radTerm(2, s * s, xy(h, q / 2), m, 'x'), radTerm(2, s, xy(h, q / 2), m), radTerm(2, s, xy(h, q), m, 'x')]),
            explanation: `${s * s * m} = ${s * s}·${m}; x^${p} = x^${p - 1}·x; y^${q} is a perfect square. Out come ${s}, ${vpow('x', h)} and ${vpow('y', q / 2)}; ${m}x stays inside. Slip: losing the leftover x.`,
          };
        },
        (r) => {
          const c = int(r, 2, 3);
          const m = pick(r, [2, 3, 5]);
          const p = pick(r, [4, 5, 7, 8]);
          const key = radTerm(3, c, xy(Math.floor(p / 3)), m, vpow('x', p % 3));
          return {
            prompt: `Simplify ${root(3, `${c ** 3 * m}x^${p}`)}.`,
            ...mc(r, key, [
              radTerm(3, c ** 3, xy(Math.floor(p / 3)), m, vpow('x', p % 3)),
              radTerm(3, c, xy(Math.floor(p / 3)), m),
              radTerm(3, c, xy(Math.floor(p / 2)), m, vpow('x', p % 2)),
            ]),
            explanation: `${c ** 3 * m} = ${c}^3·${m} and x^${p} = x^${p - (p % 3)}·${vpow('x', p % 3)}. The cube root takes out ${c}${vpow('x', Math.floor(p / 3))} and leaves ${m}${vpow('x', p % 3)} inside. Slip: grouping the x's in pairs, as for a square root.`,
          };
        },
        (r) => {
          const b = pick(r, [2, 3, 5, 7]);
          const a = int(r, 2, 15);
          if (a === b * b || (a % b !== 0 && K.gcd(a, b) !== 1)) again();
          const key = a % b === 0 ? radTerm(2, a / b, '', b) : `${a}√${b}/${b}`;
          return {
            prompt: `Rationalize the denominator and simplify: ${a}/√${b}.`,
            ...mc(r, key, [`${a}√${b}`, K.frac(a, b), `√${a * b}`]),
            explanation: `Multiply top and bottom by √${b}: ${a}√${b}/(√${b}·√${b}) = ${a}√${b}/${b}${a % b === 0 ? ` = ${key}` : ''}. Slip: ${a}√${b} multiplies the top only and forgets the ${b} in the denominator.`,
          };
        },
        (r) => {
          const [a, b] = pick(r, [[6, 10], [2, 6], [3, 6], [5, 10], [2, 10], [3, 15], [6, 15], [2, 14], [3, 21]]);
          const p = int(r, 1, 5), q = int(r, 1, 5);
          if ((p + q) % 2 !== 0) again();
          const sq = K.largestSquareFactor(a * b);
          const s = Math.sqrt(sq), m = a * b / sq;
          const h = (p + q) / 2;
          return {
            prompt: `Simplify ${root(2, `${a}${vpow('x', p)}`)}·${root(2, `${b}${vpow('x', q)}`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, s, xy(h), m), [radTerm(2, sq, xy(h), m), radTerm(2, s, xy(p + q), m), radTerm(2, s, xy(h), a + b)]),
            explanation: `Multiply under one radical: √(${a * b}x^${p + q}). ${a * b} = ${sq}·${m} and x^${p + q} is a perfect square, so the result is ${radTerm(2, s, xy(h), m)}. Slip: adding the radicands (${a} + ${b}) instead of multiplying.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const b = int(r, 2, 6);
          const c = pick(r, [2, 3, 5, 6, 7, 10, 11, 13].filter((v) => v < b * b - 1));
          const D = b * b - c;
          const k = int(r, 1, 4);
          const a = k * D;
          const minus = int(r, 0, 1) === 1;
          const kc = k === 1 ? '' : k;
          const t = (sign) => `${k * b} ${sign} ${kc}√${c}`;
          return {
            prompt: `Rationalize the denominator and simplify: ${a}/(${b} ${minus ? '−' : '+'} √${c}).`,
            ...mc(r, t(minus ? '+' : '−'), [t(minus ? '−' : '+'), `${a * b} ${minus ? '+' : '−'} ${a}√${c}`, String(k * b)]),
            explanation: `Multiply top and bottom by the conjugate ${b} ${minus ? '+' : '−'} √${c}. The denominator becomes ${b}^2 − ${c} = ${D}, and ${a}/${D} = ${k}, so the result is ${t(minus ? '+' : '−')}. Slip: multiplying by the denominator itself instead of its conjugate.`,
          };
        },
        (r) => {
          const m = pick(r, SQFREE);
          const k = int(r, 1, 5);
          return {
            prompt: `Rationalize the denominator and simplify: ${k * m}x/${root(2, `${m}x`)}. Assume x > 0.`,
            ...mc(r, radTerm(2, k, '', m, 'x'), [radTerm(2, k * m, 'x', m, 'x'), radTerm(2, k, 'x', m, 'x'), radTerm(2, k, '', m)]),
            explanation: `Multiply top and bottom by √(${m}x): ${k * m}x·√(${m}x)/(${m}x). The ${m}x cancels into ${k * m}x, leaving ${radTerm(2, k, '', m, 'x')}. Slip: forgetting to divide by the ${m}x the denominator became.`,
          };
        },
        (r) => {
          const c = int(r, 2, 3);
          const m = pick(r, [2, 3, 5]);
          const p = pick(r, [4, 5, 7, 8]);
          const q = pick(r, [3, 6, 9]);
          const key = radTerm(3, c, xy(Math.floor(p / 3), q / 3), m, vpow('x', p % 3));
          return {
            prompt: `Simplify ${root(3, `${c ** 3 * m}x^${p}y^${q}`)}.`,
            ...mc(r, key, [
              radTerm(3, c ** 3, xy(Math.floor(p / 3), q / 3), m, vpow('x', p % 3)),
              radTerm(3, c, xy(Math.floor(p / 3), q), m, vpow('x', p % 3)),
              radTerm(3, c, xy(Math.floor(p / 3), q / 3), m),
            ]),
            explanation: `${c ** 3 * m} = ${c}^3·${m}; x^${p} = x^${p - (p % 3)}·${vpow('x', p % 3)}; y^${q} = (${vpow('y', q / 3)})^3. Out come ${c}, ${vpow('x', Math.floor(p / 3))} and ${vpow('y', q / 3)}; ${m}${vpow('x', p % 3)} stays under the cube root.`,
          };
        },
        (r) => {
          const m = pick(r, [2, 3, 5]);
          const a = int(r, 2, 5), b = int(r, 2, 6);
          if (a === b) again();
          return {
            prompt: `Simplify ${root(2, `${a * a * m}x`)} + ${root(2, `${b * b * m}x`)}. ${ASSUME}`,
            ...mc(r, radTerm(2, a + b, '', m, 'x'), [root(2, `${(a * a + b * b) * m}x`), radTerm(2, a * a + b * b, '', m, 'x'), radTerm(2, a + b, '', 2 * m, 'x')]),
            explanation: `Simplify each first: ${radTerm(2, a, '', m, 'x')} + ${radTerm(2, b, '', m, 'x')}. They are like radicals, so add the coefficients: ${radTerm(2, a + b, '', m, 'x')}. Slip: adding the radicands — √a + √b is not √(a + b).`,
          };
        },
      ),
    },
  ],
};

// ── radical applications ───────────────────────────────────────────────────

const FALL = 'The time t, in seconds, that an object takes to fall d feet is given by t = √d / 4.';
const SKID = 'On a dry road, the speed s, in miles per hour, of a car that skids d feet before stopping is estimated by s = √(24d).';
const HORIZON = 'The distance d, in miles, that a person can see to the horizon from a height of h feet is estimated by d = √(1.5h).';
const PEND = 'The period T, in seconds, of a pendulum that is L meters long is approximately T = 2√L.';
const VEL = 'The speed v, in feet per second, of an object that has fallen h feet is v = √(64h).';
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [9, 12, 15], [7, 24, 25], [12, 16, 20]];

const radicalApplications = {
  courseSkill: 'radical-applications',
  skillId: 'a2-radical-applications',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const k = int(r, 2, 9);
          return {
            prompt: `${FALL} How many seconds does an object take to fall ${16 * k * k} feet?`,
            value: k,
            explanation: `t = √${16 * k * k} / 4 = ${4 * k} / 4 = ${k}. Slip: dividing ${16 * k * k} by 4 before (or instead of) taking the square root.`,
          };
        },
        (r) => {
          const [a, b, c] = pick(r, TRIPLES);
          const x1 = int(r, -5, 5), y1 = int(r, -5, 5);
          const [dx, dy] = int(r, 0, 1) ? [a, b] : [b, a];
          return {
            prompt: `A drone flies in a straight line from the point (${U(x1)}, ${U(y1)}) to the point (${U(x1 + dx)}, ${U(y1 + dy)}) on a map whose units are kilometers. Using the distance formula, how many kilometers does it fly?`,
            value: c,
            explanation: `d = √((${dx})^2 + (${dy})^2) = √(${dx * dx} + ${dy * dy}) = √${c * c} = ${c}. Slip: adding the differences, ${dx} + ${dy} = ${dx + dy}, skips the squares and the root.`,
          };
        },
        (r) => {
          const k = int(r, 1, 5);
          return {
            prompt: `${SKID} How fast, in miles per hour, was a car going if it skidded ${6 * k * k} feet?`,
            value: 12 * k,
            explanation: `s = √(24·${6 * k * k}) = √${144 * k * k} = ${12 * k}. Slip: 24·${6 * k * k} = ${144 * k * k} without taking the square root.`,
          };
        },
        (r) => {
          const k = int(r, 1, 6);
          return {
            prompt: `${HORIZON} How many miles can a person see from a height of ${6 * k * k} feet?`,
            value: 3 * k,
            explanation: `d = √(1.5·${6 * k * k}) = √${9 * k * k} = ${3 * k}. Multiply inside the radical first, then take the root.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const t = int(r, 2, 9);
          return {
            prompt: `${FALL} An object takes ${t} seconds to reach the ground. From how many feet was it dropped?`,
            value: 16 * t * t,
            explanation: `${t} = √d / 4 → √d = ${4 * t} → d = ${4 * t}^2 = ${16 * t * t}. Slip: squaring ${t} before multiplying by 4 gives ${4 * t * t}.`,
          };
        },
        (r) => {
          const n = pick(r, [5, 7, 8, 9, 11, 12, 13, 15]);
          const L = n * n / 100;
          return {
            prompt: `${PEND} What is the period, in seconds, of a pendulum that is ${L} meters long?`,
            value: 2 * n / 10,
            explanation: `√${L} = ${n / 10}, so T = 2·${n / 10} = ${2 * n / 10}. Slip: 2·${L} = ${Number((2 * L).toFixed(4))} skips the square root.`,
          };
        },
        (r) => {
          const k = int(r, 1, 5);
          return {
            prompt: `${SKID} A car was traveling ${12 * k} miles per hour when it began to skid. How many feet did it skid?`,
            value: 6 * k * k,
            explanation: `${12 * k} = √(24d) → square both sides: ${144 * k * k} = 24d → d = ${6 * k * k}. Slip: dividing ${12 * k} by 24 without squaring first.`,
          };
        },
        (r) => {
          const k = int(r, 2, 9);
          return {
            prompt: `${VEL} How many feet has an object fallen when its speed is ${8 * k} feet per second?`,
            value: k * k,
            explanation: `${8 * k} = √(64h) → ${64 * k * k} = 64h → h = ${k * k}. (Equivalently √(64h) = 8√h, so √h = ${k}.) Slip: ${8 * k} ÷ 64 forgets to square.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const T = pick(r, [1.2, 1.4, 1.6, 1.8, 2.4, 2.6, 3, 5]);
          const L = Number(((T / 2) ** 2).toFixed(4));
          return {
            prompt: `${PEND} How many meters long is a pendulum whose period is ${T} seconds?`,
            value: L,
            explanation: `${T} = 2√L → √L = ${T / 2} → L = ${T / 2}^2 = ${L}. Slip: squaring ${T} first and then halving gives ${Number((T * T / 2).toFixed(4))}; isolate the radical before squaring.`,
          };
        },
        (r) => {
          const a = int(r, 2, 5);
          const c = int(r, 2, 9);
          const b = int(r, 3, 12);
          const k = int(r, 3, 7);
          const t = k * k - c;
          if (t <= 0) again();
          return {
            prompt: `The height h, in centimeters, of a seedling t days after it sprouts is modeled by h = ${a}√(t + ${c}) + ${b}. After how many days is the seedling ${a * k + b} centimeters tall?`,
            value: t,
            explanation: `${a * k + b} = ${a}√(t + ${c}) + ${b} → ${a}√(t + ${c}) = ${a * k} → √(t + ${c}) = ${k} → t + ${c} = ${k * k} → t = ${t}. Isolate the radical before squaring.`,
          };
        },
        (r) => {
          const [a, b, c] = pick(r, TRIPLES);
          const x1 = int(r, -4, 4), y1 = int(r, -4, 4);
          return {
            prompt: `The distance between the points (${U(x1)}, ${U(y1)}) and (${U(x1 + a)}, y) is ${c} units, and y > ${U(y1)}. What is the value of y?`,
            value: y1 + b,
            explanation: `√(${a}^2 + (y ${K.signed(-y1)})^2) = ${c} → ${a * a} + (y ${K.signed(-y1)})^2 = ${c * c} → (y ${K.signed(-y1)})^2 = ${b * b} → y ${K.signed(-y1)} = ${b} (since y > ${U(y1)}) → y = ${y1 + b}.`,
          };
        },
        (r) => {
          const k1 = int(r, 2, 6);
          const k2 = k1 + int(r, 1, 4);
          return {
            prompt: `${FALL} How many seconds longer does an object take to fall ${16 * k2 * k2} feet than to fall ${16 * k1 * k1} feet?`,
            value: k2 - k1,
            explanation: `√${16 * k2 * k2} / 4 = ${k2} and √${16 * k1 * k1} / 4 = ${k1}; the difference is ${k2 - k1}. Slip: subtracting the distances first — √(a − b) is not √a − √b.`,
          };
        },
      ),
    },
  ],
};

// ── arithmetic sequences and series ────────────────────────────────────────

const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')}`;
const listTerms = (a, d, count = 4) => Array.from({ length: count }, (_, i) => U(a + i * d)).join(', ');
const arithSum = (a, d, n) => n * (2 * a + (n - 1) * d) / 2;

const arithmetic = {
  courseSkill: 'arithmetic-sequences-series',
  skillId: 'a2-arithmetic-sequences-series',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const a = int(r, -9, 15), d = K.nonZero(r, -6, 9), n = int(r, 12, 40);
          return {
            prompt: `What is the ${ORD(n)} term of the arithmetic sequence ${listTerms(a, d)}, …?`,
            value: a + (n - 1) * d,
            explanation: `a_n = a_1 + (n − 1)d with a_1 = ${a} and d = ${d}: ${a} + ${n - 1}·(${d}) = ${a + (n - 1) * d}. Slip: using n·d gives ${a + n * d} — the first term has no d added yet.`,
          };
        },
        (r) => {
          const a = int(r, 2, 15), d = int(r, 2, 8), n = pick(r, [8, 10, 12, 15, 20]);
          const last = a + (n - 1) * d;
          return {
            prompt: `An arithmetic series has first term ${a} and ${ORD(n)} term ${last}. What is the sum of its first ${n} terms?`,
            value: n * (a + last) / 2,
            explanation: `S_n = n(a_1 + a_n)/2 = ${n}(${a} + ${last})/2 = ${n * (a + last) / 2}. Slip: forgetting to divide by 2 gives ${n * (a + last)}.`,
          };
        },
        (r) => {
          const d = K.nonZero(r, -7, 9);
          const i = int(r, 2, 5), gap = int(r, 3, 6);
          const ai = int(r, -10, 30);
          return {
            prompt: `In an arithmetic sequence, the ${ORD(i)} term is ${U(ai)} and the ${ORD(i + gap)} term is ${U(ai + gap * d)}. What is the common difference?`,
            value: d,
            explanation: `From term ${i} to term ${i + gap} is ${gap} steps: d = (${ai + gap * d} − (${ai}))/${gap} = ${d}. Slip: dividing by ${i + gap}, the term number, instead of by the number of steps.`,
          };
        },
        (r) => {
          const a = int(r, 1, 12), d = int(r, 2, 7), n = pick(r, [10, 12, 15, 20]);
          return {
            prompt: `Find the sum of the first ${n} terms of the arithmetic series ${a} + ${a + d} + ${a + 2 * d} + ….`,
            value: arithSum(a, d, n),
            explanation: `The ${ORD(n)} term is ${a} + ${n - 1}·${d} = ${a + (n - 1) * d}. S = ${n}(${a} + ${a + (n - 1) * d})/2 = ${arithSum(a, d, n)}.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const a = int(r, -8, 20), d = K.nonZero(r, -6, 9), n = int(r, 15, 45);
          return {
            prompt: `The number ${U(a + (n - 1) * d)} is a term of the arithmetic sequence ${listTerms(a, d, 3)}, …. Which term is it? Give the term number.`,
            value: n,
            explanation: `${a} + (n − 1)(${d}) = ${a + (n - 1) * d} → (n − 1)(${d}) = ${(n - 1) * d} → n − 1 = ${n - 1} → n = ${n}. Slip: answering ${n - 1} forgets to add 1 for the first term.`,
          };
        },
        (r) => {
          const a = int(r, 2, 12), d = int(r, 2, 7), n = int(r, 12, 30);
          const last = a + (n - 1) * d;
          return {
            prompt: `Find the sum of the arithmetic series ${a} + ${a + d} + ${a + 2 * d} + … + ${last}.`,
            value: n * (a + last) / 2,
            explanation: `Number of terms: (${last} − ${a})/${d} + 1 = ${n}. S = ${n}(${a} + ${last})/2 = ${n * (a + last) / 2}. Slip: using ${n - 1} terms (forgetting the + 1).`,
          };
        },
        (r) => {
          const d = K.nonZero(r, -6, 8);
          const i = int(r, 3, 6), gap = int(r, 3, 6), n = int(r, 15, 30);
          const a = int(r, -10, 20);
          const T = (k) => a + (k - 1) * d;
          return {
            prompt: `In an arithmetic sequence, the ${ORD(i)} term is ${U(T(i))} and the ${ORD(i + gap)} term is ${U(T(i + gap))}. What is the ${ORD(n)} term?`,
            value: T(n),
            explanation: `d = (${T(i + gap)} − (${T(i)}))/${gap} = ${d}. From term ${i + gap} to term ${n} is ${n - i - gap} more steps: ${T(i + gap)} + ${n - i - gap}·(${d}) = ${T(n)}.`,
          };
        },
        (r) => {
          const a = int(r, 10, 25), d = int(r, 2, 4), n = int(r, 12, 30);
          return {
            prompt: `A theater has ${a} seats in the first row, and each row has ${d} more seats than the row in front of it. There are ${n} rows. How many seats does the theater have in all?`,
            value: arithSum(a, d, n),
            explanation: `The last row has ${a} + ${n - 1}·${d} = ${a + (n - 1) * d} seats. Total = ${n}(${a} + ${a + (n - 1) * d})/2 = ${arithSum(a, d, n)}. Slip: giving only the last row.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const d = K.nonZero(r, -5, 7);
          const i = int(r, 3, 5), gap = int(r, 3, 6), n = pick(r, [10, 12, 15, 20]);
          const a = int(r, -10, 20);
          const T = (k) => a + (k - 1) * d;
          return {
            prompt: `In an arithmetic sequence, the ${ORD(i)} term is ${U(T(i))} and the ${ORD(i + gap)} term is ${U(T(i + gap))}. What is the sum of the first ${n} terms?`,
            value: arithSum(a, d, n),
            explanation: `d = (${T(i + gap)} − (${T(i)}))/${gap} = ${d}, so a_1 = ${T(i)} − ${i - 1}·(${d}) = ${a} and a_${n} = ${T(n)}. S = ${n}(${a} + (${T(n)}))/2 = ${arithSum(a, d, n)}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 12), d = int(r, 2, 6), n = int(r, 8, 20);
          const S = arithSum(a, d, n);
          return {
            prompt: `An arithmetic series has first term ${a} and common difference ${d}. How many terms must be added, starting from the first, for the sum to equal ${S}?`,
            value: n,
            explanation: `n(2·${a} + (n − 1)·${d})/2 = ${S}. Solving the quadratic (or checking) gives n = ${n}: the ${ORD(n)} term is ${a + (n - 1) * d} and ${n}(${a} + ${a + (n - 1) * d})/2 = ${S}. The negative root is rejected.`,
          };
        },
        (r) => {
          const d = int(r, 3, 9), a = int(r, 40, 120);
          const n = Math.floor(a / d) + 2;
          return {
            prompt: `In the arithmetic sequence ${listTerms(a, -d, 3)}, …, which term is the first negative term? Give the term number.`,
            value: n,
            explanation: `a_n = ${a} − ${d}(n − 1) < 0 → n − 1 > ${K.frac(a, d)} → n = ${n}. Check: term ${n - 1} is ${a - d * (n - 2)} and term ${n} is ${a - d * (n - 1)}.`,
          };
        },
        (r) => {
          const m = int(r, 3, 9);
          const N = pick(r, [100, 150, 200, 250, 300]);
          const n = Math.floor((N - 1) / m);
          return {
            prompt: `Find the sum of all positive multiples of ${m} that are less than ${N}.`,
            value: m * n * (n + 1) / 2,
            explanation: `The multiples ${m}, ${2 * m}, …, ${m * n} form an arithmetic series with ${n} terms. S = ${n}(${m} + ${m * n})/2 = ${m * n * (n + 1) / 2}.`,
          };
        },
      ),
    },
  ],
};

// ── geometric sequences and series ─────────────────────────────────────────

const geoSum = (a, rr, n) => a * (rr ** n - 1) / (rr - 1);

const geometric = {
  courseSkill: 'geometric-sequences-series',
  skillId: 'a2-geometric-sequences-series',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const a = int(r, 1, 6), rr = int(r, 2, 3), n = int(r, 6, 9);
          if (a * rr ** (n - 1) > 20000) again();
          return {
            prompt: `What is the ${ORD(n)} term of the geometric sequence ${a}, ${a * rr}, ${a * rr * rr}, ${a * rr ** 3}, …?`,
            value: a * rr ** (n - 1),
            explanation: `a_n = a_1·r^(n − 1) with a_1 = ${a} and r = ${rr}: ${a}·${rr}^${n - 1} = ${a * rr ** (n - 1)}. Slip: ${a}·${rr}^${n} uses one factor of r too many.`,
          };
        },
        (r) => {
          const q = int(r, 2, 4), c = int(r, 1, 3);
          if (int(r, 0, 1) === 1) {
            const a = c * q ** 3;
            return {
              prompt: `What is the common ratio of the geometric sequence ${a}, ${a / q}, ${a / q / q}, ${c}, …?`,
              value: `1/${q}`,
              explanation: `Divide any term by the one before it: ${a / q}/${a} = 1/${q}. Slip: ${q} is the ratio read backwards (earlier ÷ later).`,
            };
          }
          return {
            prompt: `What is the common ratio of the geometric sequence ${c}, −${c * q}, ${c * q * q}, −${c * q ** 3}, …?`,
            value: -q,
            explanation: `Divide any term by the one before it: −${c * q}/${c} = −${q}. The signs alternate, so the ratio is negative. Slip: ${q} ignores the sign change.`,
          };
        },
        (r) => {
          const a = int(r, 1, 5), rr = int(r, 2, 4), n = int(r, 4, 6);
          if (geoSum(a, rr, n) > 3000) again();
          return {
            prompt: `Find the sum of the first ${n} terms of the geometric series ${a} + ${a * rr} + ${a * rr * rr} + ….`,
            value: geoSum(a, rr, n),
            explanation: `S_n = a_1(r^n − 1)/(r − 1) = ${a}(${rr}^${n} − 1)/(${rr} − 1) = ${geoSum(a, rr, n)}. Slip: ${a * rr ** (n - 1)} is only the ${ORD(n)} term, not the sum.`,
          };
        },
        (r) => {
          const a = int(r, 2, 7), rr = pick(r, [2, 3, 4, 5].filter((v) => v !== a));
          return {
            prompt: `Which formula gives the nth term of the geometric sequence ${a}, ${a * rr}, ${a * rr * rr}, ${a * rr ** 3}, …?`,
            ...mc(r, `a_n = ${a}·${rr}^(n − 1)`, [`a_n = ${a}·${rr}^n`, `a_n = ${rr}·${a}^(n − 1)`, `a_n = ${a} + ${rr}(n − 1)`]),
            explanation: `First term ${a}, common ratio ${a * rr}/${a} = ${rr}: a_n = ${a}·${rr}^(n − 1). Check n = 1: ${a}·${rr}^0 = ${a}. Slip: ${a}·${rr}^n gives ${a * rr} for the first term.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const rr = pick(r, [2, 3, -2, -3, 4]);
          const i = int(r, 2, 4);
          const a = int(r, 1, 5);
          const T = (k) => a * rr ** (k - 1);
          if (Math.abs(T(i + 3)) > 20000) again();
          return {
            prompt: `In a geometric sequence, the ${ORD(i)} term is ${U(T(i))} and the ${ORD(i + 3)} term is ${U(T(i + 3))}. What is the common ratio?`,
            value: rr,
            explanation: `Three steps apart: r^3 = ${T(i + 3)}/(${T(i)}) = ${rr ** 3}, so r = ${rr}. Slip: dividing ${rr ** 3} by 3 — the ratio is a cube ROOT, not a third.`,
          };
        },
        (r) => {
          const q = 2, n = int(r, 5, 8), c = int(r, 1, 5);
          const a = c * q ** (n - 1);
          const S = c * (q ** n - 1);
          return {
            prompt: `Find the sum of the first ${n} terms of the geometric series ${a} + ${a / 2} + ${a / 4} + ….`,
            value: S,
            explanation: `a_1 = ${a}, r = 1/2: S = ${a}(1 − (1/2)^${n})/(1 − 1/2) = ${S}. The terms run down to ${c}. Slip: 2·${a} = ${2 * a} is the sum of the INFINITE series.`,
          };
        },
        (r) => {
          const q = int(r, 2, 3), j = int(r, 2, 3), c = pick(r, [1, 2, 3, 5].filter((v) => v % q !== 0));
          const a = c * q ** j;
          const n = j + int(r, 2, 4);
          return {
            prompt: `What is the ${ORD(n)} term of the geometric sequence ${a}, ${a / q}, ${a / q / q}, …? Give the answer as a fraction.`,
            value: K.frac(a, q ** (n - 1)),
            explanation: `r = 1/${q}, so a_${n} = ${a}·(1/${q})^${n - 1} = ${a}/${q ** (n - 1)} = ${K.frac(a, q ** (n - 1))}. Slip: using the exponent ${n} gives ${K.frac(a, q ** n)}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 6), rr = int(r, 2, 4), n = int(r, 4, 6);
          if (geoSum(a, rr, n) > 6000) again();
          return {
            prompt: `A message is sent to ${a} people in round 1. In each later round, ${rr} times as many people receive it as in the round before. How many people in total have received the message after ${n} rounds?`,
            value: geoSum(a, rr, n),
            explanation: `The rounds form a geometric series: ${a} + ${a * rr} + ${a * rr * rr} + … (${n} terms). S = ${a}(${rr}^${n} − 1)/(${rr} − 1) = ${geoSum(a, rr, n)}. Slip: ${a * rr ** (n - 1)} counts round ${n} only.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const rr = pick(r, [2, 3, -2]);
          const a = int(r, 1, 4), i = int(r, 2, 3), n = i + 3 + int(r, 1, 3);
          const T = (k) => a * rr ** (k - 1);
          if (Math.abs(T(n)) > 30000) again();
          return {
            prompt: `In a geometric sequence, the ${ORD(i)} term is ${U(T(i))} and the ${ORD(i + 3)} term is ${U(T(i + 3))}. What is the ${ORD(n)} term?`,
            value: T(n),
            explanation: `r^3 = ${T(i + 3)}/(${T(i)}) = ${rr ** 3}, so r = ${rr}. From term ${i + 3} to term ${n} is ${n - i - 3} more steps: ${T(i + 3)}·(${rr})^${n - i - 3} = ${T(n)}.`,
          };
        },
        (r) => {
          const a = int(r, 1, 5), q = int(r, 2, 3), n = int(r, 5, 8);
          const S = a * (1 - (-q) ** n) / (1 + q);
          return {
            prompt: `Find the sum of the first ${n} terms of the geometric series ${a} − ${a * q} + ${a * q * q} − ${a * q ** 3} + ….`,
            value: S,
            explanation: `r = −${q}: S = ${a}(1 − (−${q})^${n})/(1 − (−${q})) = ${a}(${1 - (-q) ** n})/${1 + q} = ${S}. Slip: using r = ${q} ignores the alternating signs and gives ${geoSum(a, q, n)}.`,
          };
        },
        (r) => {
          const a = int(r, 1, 3), q = int(r, 2, 3), n = int(r, 4, 5);
          const num = a * (q ** n - 1), den = q ** (n - 1) * (q - 1);
          if (num % den === 0) again();
          return {
            prompt: `Find the sum of the first ${n} terms of the geometric series ${a} + ${K.frac(a, q)} + ${K.frac(a, q * q)} + …. Give the answer as a fraction.`,
            value: K.frac(num, den),
            explanation: `r = 1/${q}: S = ${a}(1 − (1/${q})^${n})/(1 − 1/${q}) = ${K.frac(num, den)}. Slip: ${K.frac(a * q, q - 1)} is the sum of the infinite series, not of ${n} terms.`,
          };
        },
        (r) => {
          const a = int(r, 1, 5), rr = int(r, 2, 3), n = int(r, 5, 8);
          const S = geoSum(a, rr, n);
          if (S > 20000) again();
          return {
            prompt: `How many terms of the geometric series ${a} + ${a * rr} + ${a * rr * rr} + … must be added, starting from the first, for the sum to equal ${S}?`,
            value: n,
            explanation: `${a}(${rr}^n − 1)/(${rr} − 1) = ${S} → ${rr}^n − 1 = ${S * (rr - 1) / a} → ${rr}^n = ${rr ** n} → n = ${n}.`,
          };
        },
      ),
    },
  ],
};

// ── sigma notation ─────────────────────────────────────────────────────────

/** "(3k + 2)", "(k − 4)", "3k" */
const lin = (a, c) => (c === 0 ? `${a === 1 ? '' : a}k` : `(${a === 1 ? '' : a}k ${K.signed(c)})`);
const runs = (lo, hi) => `where k runs from k = ${lo} to k = ${hi}`;
const sumOver = (lo, hi, f) => { let s = 0; for (let k = lo; k <= hi; k++) s += f(k); return s; };
const opt = (term, lo, hi) => `Σ ${term}, from k = ${lo} to k = ${hi}`;

const sigma = {
  courseSkill: 'sigma-notation',
  skillId: 'a2-sigma-notation',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const a = int(r, 2, 5), c = K.nonZero(r, -3, 6), n = int(r, 4, 6);
          const terms = Array.from({ length: n }, (_, i) => a * (i + 1) + c);
          return {
            prompt: `Evaluate the sum Σ ${lin(a, c)}, ${runs(1, n)}.`,
            value: sumOver(1, n, (k) => a * k + c),
            explanation: `Substitute k = 1, 2, …, ${n} and add: ${terms.map((t) => (t < 0 ? `(${t})` : t)).join(' + ')} = ${sumOver(1, n, (k) => a * k + c)}. Slip: evaluating only the last term, ${terms[n - 1]}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 6), c = K.nonZero(r, -5, 5), lo = int(r, 2, 6), hi = lo + int(r, 6, 14);
          return {
            prompt: `How many terms are in the sum Σ ${lin(a, c)}, ${runs(lo, hi)}?`,
            value: hi - lo + 1,
            explanation: `k takes every integer from ${lo} to ${hi}: ${hi} − ${lo} + 1 = ${hi - lo + 1} terms. Slip: ${hi - lo} forgets to count the first term.`,
          };
        },
        (r) => {
          const n = int(r, 3, 6), c = int(r, 0, 4);
          const term = c === 0 ? 'k^2' : `(k^2 + ${c})`;
          return {
            prompt: `Evaluate the sum Σ ${term}, ${runs(1, n)}.`,
            value: sumOver(1, n, (k) => k * k + c),
            explanation: `Substitute k = 1 to ${n}: ${Array.from({ length: n }, (_, i) => (i + 1) ** 2 + c).join(' + ')} = ${sumOver(1, n, (k) => k * k + c)}. Slip: squaring the total of the k's instead of each k.`,
          };
        },
        (r) => {
          const a = int(r, 2, 7), n = int(r, 4, 6);
          const terms = Array.from({ length: n }, (_, i) => a * (i + 1));
          return {
            prompt: `Which of these is the series ${terms.join(' + ')} written in sigma notation?`,
            ...mc(r, opt(`${a}k`, 1, n), [opt(`${a}k`, 1, a * n), opt(`(k + ${a})`, 1, n), opt(`${a}^k`, 1, n)]),
            explanation: `The terms are ${a}·1, ${a}·2, …, ${a}·${n}, so the kth term is ${a}k and k runs from 1 to ${n}. Slip: using the last TERM ${a * n} as the upper limit — the limit counts terms.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const a = int(r, 2, 6), c = K.nonZero(r, -9, 9), lo = int(r, 2, 5), hi = lo + int(r, 5, 9);
          const n = hi - lo + 1;
          const S = sumOver(lo, hi, (k) => a * k + c);
          return {
            prompt: `Evaluate the sum Σ ${lin(a, c)}, ${runs(lo, hi)}.`,
            value: S,
            explanation: `An arithmetic series with ${n} terms, first ${a * lo + c} (k = ${lo}) and last ${a * hi + c} (k = ${hi}): ${n}(${a * lo + c} + ${a * hi + c})/2 = ${S}. Slip: starting at k = 1 instead of k = ${lo}.`,
          };
        },
        (r) => {
          const n = int(r, 4, 6);
          const two = int(r, 0, 1) === 1;
          const c = int(r, 1, 3);
          const f = two ? (k) => k * (k + c) : (k) => k * k - c;
          const term = two ? `k(k + ${c})` : `(k^2 − ${c})`;
          return {
            prompt: `Evaluate the sum Σ ${term}, ${runs(1, n)}.`,
            value: sumOver(1, n, f),
            explanation: `Substitute k = 1 to ${n}: ${Array.from({ length: n }, (_, i) => { const t = f(i + 1); return t < 0 ? `(${t})` : t; }).join(' + ')} = ${sumOver(1, n, f)}.`,
          };
        },
        (r) => {
          const d = int(r, 2, 6), c = int(r, 1, 7), n = int(r, 5, 7);
          if (c === d) again();
          const terms = Array.from({ length: n }, (_, i) => d * (i + 1) + c);
          return {
            prompt: `Which of these is the series ${terms.join(' + ')} written in sigma notation?`,
            ...mc(r, opt(lin(d, c), 1, n), [opt(lin(d, terms[0]), 1, n), opt(lin(c, d), 1, n), opt(lin(d, c), 1, terms[n - 1])]),
            explanation: `The terms go up by ${d}, so the kth term is ${d}k + c; k = 1 must give ${terms[0]}, so c = ${c}: Σ ${lin(d, c)} for k = 1 to ${n}. Slip: using the first term ${terms[0]} as the constant.`,
          };
        },
        (r) => {
          const b = int(r, 2, 3), n = int(r, 4, 7);
          if (b === 3 && n > 5) again();
          return {
            prompt: `Evaluate the sum Σ ${b}^k, ${runs(1, n)}.`,
            value: sumOver(1, n, (k) => b ** k),
            explanation: `The terms are ${Array.from({ length: n }, (_, i) => b ** (i + 1)).join(' + ')} — a geometric series with first term ${b} and ratio ${b}: ${b}(${b}^${n} − 1)/(${b} − 1) = ${sumOver(1, n, (k) => b ** k)}. Slip: ${b}^${n} alone is only the last term.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const a = int(r, 2, 7), c = K.nonZero(r, -9, 9), n = pick(r, [20, 25, 30, 40, 50]);
          const S = sumOver(1, n, (k) => a * k + c);
          return {
            prompt: `Evaluate the sum Σ ${lin(a, c)}, ${runs(1, n)}.`,
            value: S,
            explanation: `Arithmetic series: first term ${a + c}, last term ${a * n + c}, ${n} terms. S = ${n}(${a + c} + ${a * n + c})/2 = ${S}. (Adding ${n} terms one by one is not needed.)`,
          };
        },
        (r) => {
          const a = int(r, 2, 5), b = int(r, 2, 3), n = b === 2 ? int(r, 6, 9) : int(r, 4, 6);
          const S = sumOver(1, n, (k) => a * b ** (k - 1));
          return {
            prompt: `Evaluate the sum Σ ${a}·${b}^(k − 1), ${runs(1, n)}.`,
            value: S,
            explanation: `Geometric series: first term ${a} (k = 1), ratio ${b}, ${n} terms. S = ${a}(${b}^${n} − 1)/(${b} − 1) = ${S}. Slip: taking the first term as ${a * b} misreads the exponent k − 1.`,
          };
        },
        (r) => {
          const a = int(r, 2, 5), b = pick(r, [2, 3, 4].filter((v) => v !== a)), n = int(r, 4, 5);
          const terms = Array.from({ length: n }, (_, i) => a * b ** i);
          return {
            prompt: `Which of these is the series ${terms.join(' + ')} written in sigma notation?`,
            ...mc(r, opt(`${a}·${b}^(k − 1)`, 1, n), [opt(`${a}·${b}^k`, 1, n), opt(`${b}·${a}^(k − 1)`, 1, n), opt(lin(a * b - a, 2 * a - a * b), 1, n)]),
            explanation: `Each term is ${b} times the one before, starting at ${a}: the kth term is ${a}·${b}^(k − 1). Check k = 1: ${a}·${b}^0 = ${a}. Slip: ${a}·${b}^k starts at ${a * b}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 4), c = int(r, 1, 6), n = int(r, 6, 12);
          const S = sumOver(1, n, (k) => a * k + c);
          return {
            prompt: `The sum Σ ${lin(a, c)}, where k runs from k = 1 to k = n, equals ${S}. What is n?`,
            value: n,
            explanation: `Arithmetic series: n(${a + c} + ${a}n + ${c})/2 = ${S}. Solving the quadratic gives n = ${n} (check: first term ${a + c}, last term ${a * n + c}, ${n}(${a + c} + ${a * n + c})/2 = ${S}); the negative root is rejected.`,
          };
        },
      ),
    },
  ],
};

// ── infinite geometric series ──────────────────────────────────────────────

/** "9 − 3 + 1 − …": the first `count` terms of a·(rn/rd)^i. */
function seriesStr(a, rn, rd, count = 3) {
  let s = '';
  for (let i = 0; i <= count; i++) {
    const n = a * rn ** i, d = rd ** i;
    const sign = n * d < 0 ? '−' : '+';
    const body = i === count ? '…' : K.frac(Math.abs(n), Math.abs(d));
    s += i === 0 ? body : ` ${sign} ${body}`;
  }
  return s;
}

const CONV = [[1, 2], [1, 3], [2, 3], [-1, 2], [3, 4], [-2, 3], [1, 4]];
const DIV = [[2, 1], [3, 2], [-1, 1], [1, 1], [-2, 1], [4, 3], [3, 1], [-3, 2]];

const infiniteGeometric = {
  courseSkill: 'infinite-geometric-series',
  skillId: 'a2-infinite-geometric-series',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const conv = pick(r, CONV);
          const divs = shuffle(r, DIV).slice(0, 3);
          const s = ([rn, rd]) => seriesStr(int(r, 1, 3) * rd * rd, rn, rd);
          const key = s(conv);
          const options = shuffle(r, [key, ...divs.map(s)]);
          if (new Set(options).size < 4) again();
          return {
            prompt: 'Which of these infinite geometric series converges (has a finite sum)?',
            value: key,
            options,
            correctOption: 'ABCD'[options.indexOf(key)],
            explanation: `An infinite geometric series converges only when |r| < 1. ${key} has r = ${UF(conv[0], conv[1])}; the others have ratios ${divs.map(([n, d]) => UF(n, d)).join(', ')}, each with |r| ≥ 1, so their terms never shrink toward 0.`,
          };
        },
        (r) => {
          const q = int(r, 2, 5);
          const a = (q - 1) * int(r, 1, 4) * q * q;
          return {
            prompt: `Find the sum of the infinite geometric series ${seriesStr(a, 1, q)}.`,
            value: a * q / (q - 1),
            explanation: `a = ${a} and r = 1/${q}, so S = a/(1 − r) = ${a}/(${K.frac(q - 1, q)}) = ${a * q / (q - 1)}. Slip: a/(1 + r), or adding only the terms listed.`,
          };
        },
        (r) => {
          const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [1, 5], [4, 5]]);
          const a = (q - p) * int(r, 1, 6);
          return {
            prompt: `An infinite geometric series has first term ${a} and common ratio ${p}/${q}. What is its sum?`,
            value: a * q / (q - p),
            explanation: `|r| < 1, so S = a/(1 − r) = ${a}/(1 − ${p}/${q}) = ${a}/(${q - p}/${q}) = ${a * q / (q - p)}. Slip: multiplying ${a} by ${q - p}/${q} instead of dividing.`,
          };
        },
        (r) => {
          const q = int(r, 2, 4);
          const a = int(r, 1, 3) * q * q;
          return {
            prompt: `What is the common ratio of the infinite geometric series ${seriesStr(a, -1, q)}?`,
            value: `-1/${q}`,
            explanation: `Divide the second term by the first: −${a / q}/${a} = −1/${q}. The signs alternate, so r is negative; |r| < 1, so the series converges.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]);
          const a = int(r, 1, 4) * q * q;
          if ((a * q) % (q + p) === 0) again();
          return {
            prompt: `Find the sum of the infinite geometric series ${seriesStr(a, -p, q)}. Give the answer as a fraction.`,
            value: K.frac(a * q, q + p),
            explanation: `r = −${p}/${q}, so 1 − r = 1 + ${p}/${q} = ${q + p}/${q}. S = ${a}/(${q + p}/${q}) = ${K.frac(a * q, q + p)}. Slip: using r = +${p}/${q} gives ${K.frac(a * q, q - p)}.`,
          };
        },
        (r) => {
          const two = int(r, 0, 1) === 1;
          if (!two) {
            const d = pick(r, [1, 2, 4, 5, 7, 8]);
            return {
              prompt: `The repeating decimal 0.${d}${d}${d}… can be written as the infinite geometric series ${d}/10 + ${d}/100 + ${d}/1000 + …. Write 0.${d}${d}${d}… as a fraction in lowest terms.`,
              value: K.frac(d, 9),
              explanation: `a = ${d}/10 and r = 1/10: S = (${d}/10)/(1 − 1/10) = (${d}/10)/(9/10) = ${K.frac(d, 9)}. Slip: ${K.frac(d, 10)} is only the first term.`,
            };
          }
          const n = pick(r, [12, 15, 18, 24, 27, 36, 45, 54, 63, 72, 81]);
          return {
            prompt: `The repeating decimal 0.${n}${n}${n}… can be written as the infinite geometric series ${n}/100 + ${n}/10000 + ${n}/1000000 + …. Write 0.${n}${n}${n}… as a fraction in lowest terms.`,
            value: K.frac(n, 99),
            explanation: `a = ${n}/100 and r = 1/100: S = (${n}/100)/(99/100) = ${n}/99 = ${K.frac(n, 99)}. Slip: r = 1/10 — the block that repeats has two digits.`,
          };
        },
        (r) => {
          const key = UF(...pick(r, [[-3, 4], [2, 5], [-1, 3], [5, 6], [-4, 5], [7, 8]]));
          const wrongs = shuffle(r, [[-1, 1], [1, 1], [4, 3], [-5, 4], [3, 2], [-2, 1], [5, 3]]).slice(0, 3).map(([n, d]) => UF(n, d));
          const a = int(r, 2, 12);
          return {
            prompt: `An infinite geometric series has first term ${a} and common ratio r. For which of these values of r does the series have a finite sum?`,
            ...mc(r, key, wrongs),
            explanation: `The sum exists only when |r| < 1. |${key}| is less than 1; each other choice has |r| ≥ 1 (r = 1 or −1 does not converge either: the terms never approach 0).`,
          };
        },
        (r) => {
          const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]]);
          const S = q * int(r, 1, 8);
          return {
            prompt: `An infinite geometric series has common ratio ${p}/${q} and sum ${S}. What is its first term?`,
            value: S * (q - p) / q,
            explanation: `S = a/(1 − r) → a = S(1 − r) = ${S}·(${q - p}/${q}) = ${S * (q - p) / q}. Slip: ${S}·${p}/${q} multiplies by r instead of by 1 − r.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [3, 4], [3, 5], [2, 5], [4, 5]]);
          const h = (q - p) * int(r, 2, 9);
          const total = h * (q + p) / (q - p);
          return {
            prompt: `A ball is dropped from a height of ${h} feet. Each time it hits the ground, it bounces up to ${p}/${q} of the height it just fell from. If it kept bouncing forever, what total vertical distance, in feet, would it travel (counting every fall and every rise)?`,
            value: total,
            explanation: `Falls: ${h} + ${h}(${p}/${q}) + … = ${h}/(1 − ${p}/${q}) = ${h * q / (q - p)}. Rises: the same series without the first ${h}: ${h * q / (q - p) - h}. Total = ${total}. Slip: ${h * q / (q - p)} counts the falls only.`,
          };
        },
        (r) => {
          const S = int(r, 4, 20);
          const a = int(r, 2, 2 * S - 1);
          if (a === S) again();
          return {
            prompt: `An infinite geometric series has first term ${a} and sum ${S}. What is its common ratio?`,
            value: K.frac(S - a, S),
            explanation: `${S} = ${a}/(1 − r) → 1 − r = ${K.frac(a, S)} → r = 1 − ${K.frac(a, S)} = ${K.frac(S - a, S)}. Slip: ${K.frac(a, S)} is 1 − r, not r.`,
          };
        },
        (r) => {
          const d1 = int(r, 1, 8);
          const d2 = pick(r, [1, 2, 3, 4, 5, 6, 7, 8].filter((v) => v !== d1));
          return {
            prompt: `The repeating decimal 0.${d1}${d2}${d2}${d2}… equals ${d1}/10 + (${d2}/100 + ${d2}/1000 + ${d2}/10000 + …). Write 0.${d1}${d2}${d2}${d2}… as a fraction in lowest terms.`,
            value: K.frac(9 * d1 + d2, 90),
            explanation: `The series in parentheses has a = ${d2}/100 and r = 1/10: (${d2}/100)/(9/10) = ${d2}/90. Add ${d1}/10 = ${9 * d1}/90: ${9 * d1 + d2}/90 = ${K.frac(9 * d1 + d2, 90)}. Slip: using a = ${d2}/10 for the repeating part.`,
          };
        },
        (r) => {
          const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]]);
          const c = (q - p) * int(r, 1, 5);
          return {
            prompt: `Evaluate the infinite sum Σ ${c}·(${p}/${q})^k, where k runs from k = 1 to infinity.`,
            value: K.frac(c * p, q - p),
            explanation: `The FIRST term is at k = 1: ${c}·${p}/${q} = ${K.frac(c * p, q)}, and r = ${p}/${q}. S = (${K.frac(c * p, q)})/(1 − ${p}/${q}) = ${K.frac(c * p, q - p)}. Slip: using ${c} as the first term gives ${K.frac(c * q, q - p)}.`,
          };
        },
      ),
    },
  ],
};

// ── financial applications of sequences and series ─────────────────────────

const NAMES = ['Maya', 'Jordan', 'Priya', 'Luis', 'Dana', 'Sam', 'Aisha', 'Noah'];
// [percent lost each year, starting values that stay whole for 2 years / 3 years]
const DEP_2 = [[10, [5000, 12000, 20000]], [20, [2500, 15000, 20000]], [25, [1600, 8000, 32000]], [50, [1800, 2400, 30000]]];
const DEP_3 = [[10, [1000, 4000, 20000]], [20, [1000, 5000, 25000]], [25, [6400, 12800, 32000]], [50, [2400, 8000, 40000]]];

const financial = {
  courseSkill: 'financial-applications',
  skillId: 'a2-financial-applications',
  tiers: [
    {
      difficulty: 2,
      gen: forms(
        (r) => {
          const who = pick(r, NAMES);
          const a = pick(r, [10, 15, 20, 25, 40]), d = pick(r, [2, 3, 5, 10]), n = pick(r, [8, 10, 12, 20, 26]);
          return {
            prompt: `${who} deposits ${money(a)} into savings in week 1, and each week deposits ${money(d)} more than the week before. How many dollars does ${who} deposit in total over the first ${n} weeks?`,
            value: arithSum(a, d, n),
            explanation: `The deposits form an arithmetic series: a_1 = ${a}, d = ${d}, a_${n} = ${a + (n - 1) * d}. S = ${n}(${a} + ${a + (n - 1) * d})/2 = ${arithSum(a, d, n)}. Slip: ${a + (n - 1) * d} is only the last week's deposit.`,
          };
        },
        (r) => {
          const [pct, ps] = pick(r, DEP_2);
          const P = pick(r, ps);
          const V = whole(P * (1 - pct / 100) ** 2);
          return {
            prompt: `A car bought for ${money(P)} loses ${pct}% of its value each year. What is its value, in dollars, after 2 years?`,
            value: V,
            explanation: `Each year it keeps ${100 - pct}% of its value — a geometric sequence with ratio ${(100 - pct) / 100}: ${P}·${(100 - pct) / 100}^2 = ${V}. Slip: taking ${2 * pct}% off the original price gives ${P - 2 * P * pct / 100}.`,
          };
        },
        (r) => {
          const S = pick(r, [32000, 38000, 42000, 45000, 51000]);
          const R = pick(r, [1200, 1500, 1800, 2000, 2500]);
          const n = int(r, 6, 12);
          return {
            prompt: `A job pays ${money(S)} in the first year, with a raise of ${money(R)} each year after that. What is the salary, in dollars, in year ${n}?`,
            value: S + (n - 1) * R,
            explanation: `The salaries form an arithmetic sequence: a_${n} = ${S} + ${n - 1}·${R} = ${S + (n - 1) * R}. Slip: ${n} raises gives ${S + n * R} — year 1 has no raise yet.`,
          };
        },
        (r) => {
          const pct = int(r, 2, 9);
          const S = pick(r, [40000, 50000, 60000]);
          const dep = int(r, 0, 1) === 1;
          if (dep) {
            const p2 = pick(r, [10, 15, 20, 30]);
            return {
              prompt: `A machine worth ${money(S)} loses ${p2}% of its value each year. The machine's values at the end of each year form which kind of sequence?`,
              ...mc(r, `A geometric sequence with common ratio ${(100 - p2) / 100}`, [
                `A geometric sequence with common ratio ${p2 / 100}`,
                `A geometric sequence with common ratio ${(100 + p2) / 100}`,
                `An arithmetic sequence with common difference −${S * p2 / 100}`,
              ]),
              explanation: `Losing ${p2}% means keeping ${100 - p2}% each year: every value is ${(100 - p2) / 100} times the one before, a geometric sequence. It is not arithmetic, because ${p2}% of a shrinking value is a different dollar amount each year.`,
            };
          }
          return {
            prompt: `A job pays ${money(S)} in the first year, with a ${pct}% raise each year. The yearly salaries form which kind of sequence?`,
            ...mc(r, `A geometric sequence with common ratio 1.0${pct}`, [
              `A geometric sequence with common ratio 0.0${pct}`,
              `A geometric sequence with common ratio ${pct}`,
              `An arithmetic sequence with common difference ${S * pct / 100}`,
            ]),
            explanation: `A ${pct}% raise multiplies the salary by 1.0${pct} each year, so the salaries are geometric with r = 1.0${pct}. It is not arithmetic: ${pct}% of a growing salary is a larger dollar raise every year.`,
          };
        },
      ),
    },
    {
      difficulty: 3,
      gen: forms(
        (r) => {
          const S = pick(r, [32000, 38000, 42000, 45000, 51000]);
          const R = pick(r, [1000, 1500, 2000, 2500]);
          const n = pick(r, [5, 6, 8, 10]);
          return {
            prompt: `A job pays ${money(S)} in the first year, with a raise of ${money(R)} each year after that. What is the total pay, in dollars, over the first ${n} years?`,
            value: arithSum(S, R, n),
            explanation: `Arithmetic series: year ${n} pays ${S} + ${n - 1}·${R} = ${S + (n - 1) * R}. Total = ${n}(${S} + ${S + (n - 1) * R})/2 = ${arithSum(S, R, n)}. Slip: ${n}·${S} ignores the raises.`,
          };
        },
        (r) => {
          const who = pick(r, NAMES);
          const a = int(r, 1, 5), rr = int(r, 2, 3), n = rr === 2 ? int(r, 6, 10) : int(r, 4, 6);
          return {
            prompt: `In a savings challenge, ${who} saves ${money(a)} in week 1 and then saves ${rr === 2 ? 'twice' : 'three times'} as much each week as the week before. How many dollars has ${who} saved in total after ${n} weeks?`,
            value: geoSum(a, rr, n),
            explanation: `Geometric series: a_1 = ${a}, r = ${rr}, n = ${n}. S = ${a}(${rr}^${n} − 1)/(${rr} − 1) = ${geoSum(a, rr, n)}. Slip: ${a * rr ** (n - 1)} is only week ${n}'s amount.`,
          };
        },
        (r) => {
          const [pct, Ds] = pick(r, [[10, [100, 500, 1000, 2000]], [20, [500, 1000, 2500]], [5, [400, 2000, 4000]]]);
          const D = pick(r, Ds);
          const gf = 1 + pct / 100;
          const V = whole(D * (1 + gf + gf * gf));
          return {
            prompt: `At the end of each year, ${money(D)} is deposited into an account that pays ${pct}% annual interest, compounded annually. What is the balance, in dollars, just after the 3rd deposit?`,
            value: V,
            explanation: `The 1st deposit has grown for 2 years, the 2nd for 1 year, the 3rd not at all: ${D}(${gf}^2 + ${gf} + 1) = ${V} — a geometric series with ratio ${gf}. Slip: 3·${D} = ${3 * D} ignores the interest.`,
          };
        },
        (r) => {
          const [pct, ps] = pick(r, DEP_3);
          const P = pick(r, ps);
          const V = whole(P * (1 - pct / 100) ** 3);
          return {
            prompt: `A machine bought for ${money(P)} loses ${pct}% of its value each year. What is its value, in dollars, after 3 years?`,
            value: V,
            explanation: `Geometric sequence with ratio ${(100 - pct) / 100}: ${P}·${(100 - pct) / 100}^3 = ${V}. Slip: subtracting ${pct}% of the ORIGINAL price three times gives ${P - 3 * P * pct / 100}.`,
          };
        },
      ),
    },
    {
      difficulty: 4,
      gen: forms(
        (r) => {
          const S = pick(r, [30000, 40000, 50000, 60000]);
          const R = pick(r, [2000, 2500, 3500, 4500, 5500, 6500]);
          const pct = pick(r, [10, 20]);
          const gf = 1 + pct / 100;
          const A = 3 * S + 3 * R;
          const B = whole(S * (1 + gf + gf * gf));
          if (A === B) again();
          return {
            prompt: `Job A pays ${money(S)} in the first year with a raise of ${money(R)} each year. Job B pays ${money(S)} in the first year with a ${pct}% raise each year. Over the first 3 years combined, how many more dollars does the higher-paying job pay than the other?`,
            value: Math.abs(A - B),
            explanation: `Job A (arithmetic): ${S} + ${S + R} + ${S + 2 * R} = ${A}. Job B (geometric, r = ${gf}): ${S}(1 + ${gf} + ${gf}^2) = ${B}. Difference: ${Math.abs(A - B)} (Job ${A > B ? 'A' : 'B'} pays more).`,
          };
        },
        (r) => {
          const L = pick(r, [1000, 2000, 5000]);
          const pct = pick(r, [10, 20]);
          const pay = L * pick(r, [2, 3, 4]) / 10;
          const gf = 1 + pct / 100;
          const b1 = whole(L * gf - pay);
          const b2 = whole(b1 * gf - pay);
          if (b2 <= 0) again();
          return {
            prompt: `A ${money(L)} loan charges ${pct}% interest per year on the balance owed. At the end of each year the interest is added, and then a payment of ${money(pay)} is made. What is the balance owed, in dollars, right after the 2nd payment?`,
            value: b2,
            explanation: `Year 1: ${L}·${gf} − ${pay} = ${b1}. Year 2: ${b1}·${gf} − ${pay} = ${b2}. Each balance is ${gf} times the last, minus the payment. Slip: charging interest on ${L} both years.`,
          };
        },
        (r) => {
          const pct = int(r, 3, 8);
          const D = pick(r, [500, 1000, 2000, 2500]);
          const n = pick(r, [10, 15, 20, 25, 30]);
          const gf = `1.0${pct}`, dr = `0.0${pct}`;
          return {
            prompt: `At the end of each year, ${money(D)} is deposited into an account that pays ${pct}% annual interest, compounded annually. Which expression gives the balance just after the ${n}th deposit?`,
            ...mc(r, `${D}(${gf}^${n} − 1)/${dr}`, [`${D}·${gf}^${n}`, `${D}·${n}·${gf}`, `${D}(${gf}^${n} − 1)/${gf}`]),
            explanation: `The deposits have grown for ${n - 1}, ${n - 2}, …, 0 years: a geometric series with a_1 = ${D}, r = ${gf} and ${n} terms. S = ${D}(${gf}^${n} − 1)/(${gf} − 1) = ${D}(${gf}^${n} − 1)/${dr}. Slip: dividing by r instead of r − 1.`,
          };
        },
        (r) => {
          const who = pick(r, NAMES);
          const a = pick(r, [10, 15, 20, 30]), d = pick(r, [5, 10]), n = int(r, 8, 20);
          const S = arithSum(a, d, n);
          return {
            prompt: `${who} saves ${money(a)} in week 1 and each week saves ${money(d)} more than the week before. After how many weeks will the total saved be exactly ${money(S)}?`,
            value: n,
            explanation: `n(2·${a} + (n − 1)·${d})/2 = ${S}. Solving the quadratic gives n = ${n} (check: week ${n} saves ${a + (n - 1) * d}, and ${n}(${a} + ${a + (n - 1) * d})/2 = ${S}); the negative root is rejected.`,
          };
        },
      ),
    },
  ],
};

const TEMPLATES = [
  compoundInterest, logEvaluation, logProperties, expLogEquations, logDomain,
  rationalExponents, simplifyingRadicals, radicalApplications,
  arithmetic, geometric, sigma, infiniteGeometric, financial,
];

module.exports = { COURSE_ID, GB, TEMPLATES };
