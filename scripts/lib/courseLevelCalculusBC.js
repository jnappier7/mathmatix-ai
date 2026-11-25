'use strict';
/**
 * At-level check items for four AP Calculus BC course skills whose old pool
 * did not test them (see scripts/buildCourseLevelItems.js for why these exist).
 *
 *   series-geometric-p             was finite sums ("2 + 4 + 8 + 16")
 *   convergence-tests              was p-series and geometric series only
 *   definite-integral-properties   was plain evaluation ("∫₀² 2x dx")
 *   limits-algebraic               was direct substitution into a line
 *
 * The BC skills that are the same skill as an AB one (Riemann sums, FTC part 2,
 * exponential models …) are served by the AB bank, scripts/lib/courseLevelCalculusAB.js.
 *
 * A series is written "Σ from n = 1 to ∞ of …", a definite integral
 * "∫ from a to b of f(x) dx". A typed answer is one number or fraction;
 * verdicts, intervals and reasons are multiple choice, and each wrong choice is
 * the answer a named slip produces.
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelCalculusBC.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'calculus-bc';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 400; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 400 tries');
  };
}

function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((x) => x !== c);
  if (w.length < 3) again();
  const options = w.slice(0, 3);
  const pos = int(r, 0, 3);
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

function mcFixed(r, opts, correct) {
  if (new Set(opts).size !== 4 || !opts.includes(correct)) again();
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

const m = (n) => (n < 0 ? `−${String(-n)}` : String(n));
/** A fraction for display inside a sentence or a choice, with the Unicode minus. */
const fr = (n, d = 1) => K.frac(n, d).replace('-', '−');
const INT = (a, b, body) => `∫ from ${m(a)} to ${m(b)} of ${body}`;
const SUM = (from, term) => `Σ from n = ${from} to ∞ of ${term}`;
/** "x − 3" / "x + 3". */
const lin = (a) => `x ${a < 0 ? '+' : '−'} ${Math.abs(a)}`;
/** "x² − 5x + 6" for x² + bx + c. */
function quad(b, c) {
  let s = 'x²';
  if (b !== 0) s += ` ${b < 0 ? '−' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
  if (c !== 0) s += ` ${K.signed(c)}`;
  return s;
}
/** "12 + 6 + 3 + 3/2 + …" from a first term and a ratio n/d. */
function terms(a, n, d, count = 4) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const [p, q] = K.reduce(a * n ** i, d ** i);
    const mag = q === 1 ? String(Math.abs(p)) : `${Math.abs(p)}/${q}`;
    out += i === 0 ? (p < 0 ? `−${mag}` : mag) : ` ${p < 0 ? '−' : '+'} ${mag}`;
  }
  return `${out} + …`;
}

// p-series as printed, with the exponent: [term, p as n/d].
const P_CONV = [['1/n²', 2, 1], ['1/n³', 3, 1], ['1/n^(3/2)', 3, 2], ['1/n^(4/3)', 4, 3], ['1/n⁴', 4, 1]];
const P_DIV = [['1/n', 1, 1], ['1/√n', 1, 2], ['1/∛n', 1, 3], ['1/n^(2/3)', 2, 3], ['1/n^(3/4)', 3, 4]];
// p-series in disguise: [term, p, the p a slip gives (on the other side of 1)].
const P_DISGUISED = [
  ['1/(n√n)', '3/2', '1/2'], ['√n/n²', '3/2', '1/2'], ['√n/n', '1/2', '3/2'], ['n/n³', '2', '1/3'],
  ['n²/n³', '1', '3/2'], ['1/(n²√n)', '5/2', '1'], ['∛n/n', '2/3', '4/3'],
];
// Geometric ratios [n, d].
const R_CONV = [[1, 2], [2, 3], [-3, 4], [3, 5], [-1, 3], [9, 10], [-2, 5]];
const R_DIV = [[3, 2], [-5, 4], [2, 1], [-2, 1], [4, 3], [1, 1], [-1, 1], [5, 3]];
const geo = ([n, d]) => `Σ (${fr(n, d)})^n`;

const VERDICTS = ['The series converges absolutely', 'The series diverges', 'The test is inconclusive', 'The series converges conditionally'];

// ── templates ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'series-geometric-p',
    skillId: 'calcbc-series-geometric-p',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0) {
          const [n, d] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]);
          const a = d * d * int(r, 1, 4);
          return {
            prompt: `Find the sum of the infinite geometric series ${terms(a, n, d)}`,
            value: K.frac(a * d, d - n),
            explanation: `The common ratio is r = ${fr(n, d)} (each term divided by the one before). Since |r| < 1 the series converges to a/(1 − r) = ${a}/(1 − ${fr(n, d)}) = ${fr(a * d, d - n)}. Adding only the terms printed stops short of the infinite sum.`,
          };
        }
        if (idx === 1) {
          const wantConv = int(r, 0, 1) === 1;
          const key = pick(r, wantConv ? P_CONV : P_DIV);
          const others = shuffle(r, wantConv ? P_DIV : P_CONV).slice(0, 3);
          return {
            prompt: `Each of these series is summed from n = 1 to ∞. Which one ${wantConv ? 'converges' : 'diverges'}?`,
            ...mc(r, `Σ ${key[0]}`, others.map((o) => `Σ ${o[0]}`)),
            explanation: `A p-series Σ 1/n^p converges exactly when p > 1. Here Σ ${key[0]} has p = ${fr(key[1], key[2])}, so it ${wantConv ? 'converges' : 'diverges'}; the other three have p ${wantConv ? '≤ 1 and diverge' : '> 1 and converge'}. Terms going to 0 is not enough — Σ 1/n diverges.`,
          };
        }
        if (idx === 2) {
          const wantConv = int(r, 0, 1) === 1;
          const key = pick(r, wantConv ? R_CONV : R_DIV);
          const others = shuffle(r, wantConv ? R_DIV : R_CONV).slice(0, 3);
          return {
            prompt: `Each of these geometric series is summed from n = 0 to ∞. Which one ${wantConv ? 'converges' : 'diverges'}?`,
            ...mc(r, geo(key), others.map(geo)),
            explanation: `A geometric series Σ r^n converges exactly when |r| < 1. Only ${geo(key)} has |r| ${wantConv ? '< 1' : '≥ 1'}: |r| = ${fr(Math.abs(key[0]), key[1])}. The sign of r does not matter, and r = 1 or r = −1 still diverges.`,
          };
        }
        const q = int(r, 2, 5), a = int(r, 2, 9);
        return {
          prompt: `Find the sum of the series ${SUM(0, `${a}(1/${q})^n`)}.`,
          value: K.frac(a * q, q - 1),
          explanation: `This is geometric with first term ${a} (at n = 0) and ratio 1/${q}. Sum = a/(1 − r) = ${a}/(1 − 1/${q}) = ${a}/(${q - 1}/${q}) = ${fr(a * q, q - 1)}. Using 1 + r in the denominator gives ${fr(a * q, q + 1)}.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const [n, d] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5]]);
          const a = int(r, 2, 9);
          return {
            prompt: `Find the sum of the series ${SUM(1, `${a}(${n}/${d})^n`)}.`,
            value: K.frac(a * n, d - n),
            explanation: `The series starts at n = 1, so its FIRST TERM is ${a}(${n}/${d}) = ${fr(a * n, d)}, not ${a}. Sum = first term/(1 − r) = (${fr(a * n, d)})/(1 − ${n}/${d}) = ${fr(a * n, d - n)}. Using ${a} as the first term gives ${fr(a * d, d - n)}, the sum from n = 0.`,
          };
        }
        if (idx === 1) {
          const q = int(r, 2, 4), a = q * q * q * int(r, 1, 3);
          return {
            prompt: `Find the sum of the infinite geometric series ${terms(a, -1, q)}`,
            value: K.frac(a * q, q + 1),
            explanation: `The signs alternate, so the ratio is negative: r = −1/${q}. Sum = a/(1 − r) = ${a}/(1 + 1/${q}) = ${fr(a * q, q + 1)}. Using r = +1/${q} gives ${fr(a * q, q - 1)}.`,
          };
        }
        if (idx === 2) {
          const [term, p, pw] = pick(r, P_DISGUISED);
          const val = (s) => { const [x, y] = s.split('/').map(Number); return x / (y || 1); };
          const say = (pp, conv) => `${conv ? 'Converges' : 'Diverges'}: it is a p-series with p = ${pp}`;
          return {
            prompt: `The series ${SUM(1, term)} can be rewritten as a p-series. Which statement is correct?`,
            ...mcFixed(r, [say(p, true), say(p, false), say(pw, true), say(pw, false)], say(p, val(p) > 1)),
            explanation: `Combine the powers of n (√n = n^(1/2), ∛n = n^(1/3)): ${term} = 1/n^(${p}), so p = ${p}. A p-series converges only when p > 1, so this one ${val(p) > 1 ? 'converges' : 'diverges'}. Getting p = ${pw} comes from combining the exponents the wrong way.`,
          };
        }
        const [n, d] = pick(r, [[1, 2], [2, 3], [3, 2], [4, 3], [3, 4], [5, 4], [1, 3], [5, 2]]);
        const a = int(r, 2, 9);
        const conv = n < d;
        return {
          prompt: `Consider the series ${SUM(0, `${a}(${n}/${d})^n`)}. Which statement is correct?`,
          ...mcFixed(r, [`It converges to ${fr(a * d, d - n)}`, `It converges to ${fr(a * n, d - n)}`, 'It diverges', `It converges to ${fr(a * d, d + n)}`], conv ? `It converges to ${fr(a * d, d - n)}` : 'It diverges'),
          explanation: conv
            ? `The ratio is r = ${n}/${d}, and |r| < 1, so the series converges to a/(1 − r) = ${a}/(1 − ${n}/${d}) = ${fr(a * d, d - n)}. The first term is ${a} (n starts at 0).`
            : `The ratio is r = ${n}/${d}, and |r| ≥ 1, so the terms do not shrink and the series diverges. The formula a/(1 − r) = ${fr(a * d, d - n)} only applies when |r| < 1 — a negative "sum" of positive terms is the warning sign.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const two = int(r, 0, 1) === 1;
          const block = two ? pick(r, [12, 15, 18, 27, 36, 45, 54, 63, 72, 81]) : pick(r, [1, 2, 3, 4, 5, 6, 7, 8]);
          const base = two ? 100 : 10;
          const digits = String(block);
          return {
            prompt: `Written as an infinite geometric series, the repeating decimal 0.${digits}${digits}${digits}… is ${block}/${base} + ${block}/${base ** 2} + ${block}/${base ** 3} + … What fraction, in lowest terms, is the sum of this series?`,
            value: K.frac(block, base - 1),
            explanation: `First term a = ${block}/${base} and ratio r = 1/${base}. Sum = a/(1 − r) = (${block}/${base})/(${base - 1}/${base}) = ${block}/${base - 1} = ${fr(block, base - 1)}. Dividing by ${base} instead of ${base - 1} gives the first term only.`,
          };
        }
        if (idx === 1) {
          const [n, d] = pick(r, [[1, 2], [1, 3], [2, 3], [-1, 2], [-1, 3], [3, 4], [-2, 3], [1, 4]]);
          const a = (d - n) * int(r, 1, 5);
          const S = a * d / (d - n);
          return {
            prompt: `An infinite geometric series has first term ${a} and sum ${S}. What is its common ratio?`,
            value: K.frac(n, d),
            explanation: `S = a/(1 − r) gives ${S} = ${a}/(1 − r), so 1 − r = ${fr(a, S)} and r = ${fr(n, d)}. Stopping at 1 − r = ${fr(a, S)}, or computing a/S alone, is the usual slip.`,
          };
        }
        if (idx === 2) {
          const j = int(r, 1, 2), c = j === 1 ? int(r, 1, 6) : 2 * int(r, 1, 4) + 1;
          const edge = (c + 1) / j;
          return {
            prompt: `For which values of k does the series ${SUM(1, `1/n^(${j === 1 ? '' : j}k − ${c})`)} converge?`,
            ...mc(r, `k > ${edge}`, [`k > ${fr(c, j)}`, `k ≥ ${edge}`, `k < ${edge}`]),
            explanation: `This is a p-series with p = ${j === 1 ? '' : j}k − ${c}. It converges exactly when p > 1: ${j === 1 ? '' : j}k − ${c} > 1, so k > ${edge}. At k = ${edge} the series is Σ 1/n, which diverges, so the inequality is strict; p > 0 (k > ${fr(c, j)}) is not enough.`,
          };
        }
        const h = int(r, -4, 5), c = int(r, 2, 6);
        const inner = h === 0 ? `(x/${c})^n` : `((${lin(h)})/${c})^n`;
        return {
          prompt: `For which values of x does the geometric series ${SUM(0, inner)} converge?`,
          ...mc(r, `${m(h - c)} < x < ${m(h + c)}`, [`${m(h - c)} ≤ x ≤ ${m(h + c)}`, `x < ${m(h + c)}`, `${m(h - 1)} < x < ${m(h + 1)}`]),
          explanation: `The ratio is r = ${h === 0 ? 'x' : `(${lin(h)})`}/${c}. A geometric series converges exactly when |r| < 1: |${h === 0 ? 'x' : lin(h)}| < ${c}, so ${m(h - c)} < x < ${m(h + c)}. At either endpoint |r| = 1 and the series diverges, so the endpoints are not included.`,
        };
      }) },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'convergence-tests',
    skillId: 'calcbc-convergence-tests',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 1, 7), c = int(r, 2, 7), b = int(r, 1, 9), d = int(r, 1, 9);
          if (a * d === b * c) again();
          const L = fr(a, c);
          return {
            prompt: `Consider the series ${SUM(1, `(${a === 1 ? '' : a}n + ${b})/(${c}n + ${d})`)}. Which statement is correct?`,
            ...mc(r, `It diverges by the nth-term test, because its terms approach ${L}, not 0`, [
              `It converges, and its sum is ${L}`,
              'It converges by the nth-term test, because its terms approach 0',
              'The nth-term test is inconclusive, and the series converges by comparison with Σ 1/n',
            ]),
            explanation: `As n → ∞ the terms approach ${a}/${c} = ${L}, which is not 0, so the series diverges (nth-term test). ${L} is the limit of the TERMS, not the sum — adding infinitely many numbers near ${L} cannot settle.`,
          };
        }
        if (idx === 1) {
          const [L, k] = pick(r, [['1/2', 0], ['2/3', 0], ['0', 0], ['3', 1], ['5/4', 1], ['1', 2], ['1', 2]]);
          return {
            prompt: `For a series Σ aₙ, the ratio test gives a limit of |aₙ₊₁/aₙ| equal to ${L}. What does the ratio test conclude?`,
            ...mcFixed(r, VERDICTS, VERDICTS[k]),
            explanation: `Ratio test: L < 1 converges absolutely, L > 1 diverges, L = 1 tells nothing. Here L = ${L}, so: ${VERDICTS[k].toLowerCase()}. Treating L = 1 as convergence is the usual slip.`,
          };
        }
        if (idx === 2) {
          const L = pick(r, ['0', '0', '1', '1/2', '3']);
          const opts = ['The series converges', 'The series diverges', 'Nothing: the series may converge or diverge', `The series converges, and its sum is ${L}`];
          return {
            prompt: `The terms of a series Σ aₙ have a limit of ${L} as n → ∞. Using only this fact, what does the nth-term test conclude?`,
            ...mcFixed(r, opts, L === '0' ? opts[2] : opts[1]),
            explanation: L === '0'
              ? 'The nth-term test can only show DIVERGENCE (when the terms do not approach 0). Terms approaching 0 prove nothing: Σ 1/n² converges and Σ 1/n diverges, and both have terms going to 0.'
              : `The terms approach ${L}, not 0, so the series diverges by the nth-term test. The limit of the terms is never the sum of the series.`,
          };
        }
        const c = int(r, 2, 7), k = int(r, 0, 2);
        const term = [`n/${c}^n`, `${c}^n/n`, `n²/${c}^n`][k];
        return {
          prompt: `The ratio test is applied to the series ${SUM(1, term)}. What is the limit of |aₙ₊₁/aₙ| as n → ∞?`,
          value: k === 1 ? c : K.frac(1, c),
          explanation: k === 1
            ? `aₙ₊₁/aₙ = (${c}^(n+1)/(n + 1))·(n/${c}^n) = ${c}·n/(n + 1), which approaches ${c}. The powers of ${c} leave a factor of ${c}; n/(n + 1) approaches 1.`
            : `aₙ₊₁/aₙ = (${k === 0 ? '(n + 1)' : '(n + 1)²'}/${c}^(n+1))·(${c}^n/${k === 0 ? 'n' : 'n²'}) = (1/${c})·${k === 0 ? '(n + 1)/n' : '((n + 1)/n)²'}, which approaches 1/${c}. Inverting the powers of ${c} gives ${c}.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const k = int(r, 1, 9), c = int(r, 2, 5), form = int(r, 0, 3);
          if (form <= 1) {
            const pw = form === 0 ? '²' : '³';
            return {
              prompt: `Consider the series ${SUM(1, `1/(n${pw} + ${k})`)}. Which statement is correct?`,
              ...mc(r, `It converges, by comparison with the convergent series Σ 1/n${pw}`, [
                'It diverges, by comparison with the divergent series Σ 1/n',
                'It diverges, by the nth-term test',
                'It diverges, by the ratio test',
              ]),
              explanation: `Since n${pw} + ${k} > n${pw}, each term is smaller than 1/n${pw}, and Σ 1/n${pw} is a convergent p-series. Smaller than a convergent series means convergent. Its terms go to 0, so the nth-term test shows nothing, and the ratio test gives L = 1.`,
            };
          }
          if (form === 2) {
            return {
              prompt: `Consider the series ${SUM(1, `(n + ${k})/n²`)}. Which statement is correct?`,
              ...mc(r, 'It diverges, by comparison with the divergent series Σ 1/n', [
                'It converges, by comparison with the convergent series Σ 1/n²',
                'It converges by the nth-term test, because its terms approach 0',
                'It converges, by the ratio test',
              ]),
              explanation: `(n + ${k})/n² > n/n² = 1/n, and Σ 1/n (the harmonic series) diverges. Larger than a divergent series means divergent. The n² in the denominator does not make it a p-series with p = 2 — the numerator grows too.`,
            };
          }
          return {
            prompt: `Consider the series ${SUM(1, `1/(${c}^n + n)`)}. Which statement is correct?`,
            ...mc(r, `It converges, by comparison with the convergent geometric series Σ (1/${c})^n`, [
              'It diverges, by comparison with the divergent series Σ 1/n',
              'It diverges, by the nth-term test',
              `It diverges, because the geometric series Σ ${c}^n diverges`,
            ]),
            explanation: `${c}^n + n > ${c}^n, so each term is smaller than (1/${c})^n, and Σ (1/${c})^n is geometric with |r| < 1. Smaller than a convergent series means convergent.`,
          };
        }
        if (idx === 1) {
          const c = int(r, 2, 6);
          const [term, L, Lalt, conv] = pick(r, [
            [`${c}^n/n!`, '0', '∞', true], [`n!/${c}^n`, '∞', '0', false],
            [`n/${c}^n`, `1/${c}`, String(c), true], [`${c}^n/n²`, String(c), `1/${c}`, false],
          ]);
          const v = (b) => (b ? 'converges' : 'diverges');
          return {
            prompt: `The ratio test is applied to the series ${SUM(1, term)}, where L is the limit of |aₙ₊₁/aₙ| as n → ∞. Which conclusion is correct?`,
            ...mc(r, `L = ${L}, so the series ${v(conv)}`, [`L = ${L}, so the series ${v(!conv)}`, 'L = 1, so the test is inconclusive', `L = ${Lalt}, so the series ${v(!conv)}`]),
            explanation: `Dividing aₙ₊₁ by aₙ and letting n → ∞ gives L = ${L}. ${conv ? 'L < 1, so the series converges absolutely' : 'L > 1, so the series diverges'}. Forming aₙ/aₙ₊₁ by mistake gives the reciprocal, ${Lalt}, and the opposite verdict.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 2, 7), b = int(r, 1, 9), c = int(r, 1, 9), k = int(r, 0, 2);
          const [term, like, conv] = [
            [`(${a}n + ${b})/(n³ + ${c})`, '1/n²', true],
            [`(${a}n + ${b})/(n² + ${c})`, '1/n', false],
            [`(${a}n² + ${b})/(n⁴ + ${c})`, '1/n²', true],
          ][k];
          return {
            prompt: `Consider the series ${SUM(1, term)}. Which statement is correct?`,
            ...mc(r, conv ? 'It converges, by limit comparison with Σ 1/n²' : 'It diverges, by limit comparison with Σ 1/n', conv
              ? ['It diverges, by limit comparison with Σ 1/n', 'It diverges, by the nth-term test', 'It diverges, by the integral test']
              : ['It converges, by limit comparison with Σ 1/n²', 'It converges by the nth-term test, because its terms approach 0', 'It converges, by comparison with the geometric series Σ (1/2)^n']),
            explanation: `For large n only the leading powers matter: the term behaves like ${a}·${like}. The limit of (term)/(${like}) is ${a}, finite and positive, so the series does what Σ ${like} does: it ${conv ? 'converges (p = 2)' : 'diverges (harmonic)'}.`,
          };
        }
        const div = int(r, 0, 2) === 0, V = int(r, 2, 9);
        const opts = [
          'It converges, and its sum equals the value of the integral',
          'It converges, but its sum need not equal the value of the integral',
          'It diverges',
          'Nothing: the integral test is inconclusive here',
        ];
        return {
          prompt: `A function f is positive, continuous and decreasing for x ≥ 1, and aₙ = f(n). The improper integral ${`∫ from 1 to ∞ of f(x) dx`} ${div ? 'diverges' : `converges to ${V}`}. What does the integral test conclude about ${SUM(1, 'aₙ')}?`,
          ...mcFixed(r, opts, div ? opts[2] : opts[1]),
          explanation: div
            ? 'Under these hypotheses the series and the improper integral do the same thing. The integral diverges, so the series diverges.'
            : `The series and the integral converge or diverge together, so the series converges. The integral test says nothing about the SUM: the series is a set of rectangles, not the area ${V} under the curve.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const [c, d] = pick(r, [[2, 3], [3, 5], [3, 2], [5, 4], [2, 5], [4, 3], [3, 4], [5, 2]]);
          const k = int(r, 0, 2);
          const term = [`(n · ${c}^n)/${d}^n`, `(n² · ${c}^n)/${d}^n`, `${c}^n/(n · ${d}^n)`][k];
          return {
            prompt: `The ratio test is applied to the series ${SUM(1, term)}. What is the limit of |aₙ₊₁/aₙ| as n → ∞?`,
            value: K.frac(c, d),
            explanation: `In aₙ₊₁/aₙ the powers leave ${c}^(n+1)/${c}^n = ${c} on top and ${d}^(n+1)/${d}^n = ${d} underneath; the factor built from n and n + 1 approaches 1. So L = ${c}/${d}${c < d ? ' (< 1, the series converges)' : ' (> 1, the series diverges)'}.`,
          };
        }
        if (idx === 1) {
          const [term, k, why] = pick(r, [
            ['(−1)^n/n²', 0, 'Σ 1/n² converges (p = 2), so the series of absolute values converges: absolute convergence'],
            ['(−1)^n/n³', 0, 'Σ 1/n³ converges (p = 3), so the series of absolute values converges: absolute convergence'],
            ['(−1)^n/√n', 1, 'the terms 1/√n decrease to 0, so it converges by the alternating series test, but Σ 1/√n diverges (p = 1/2): conditional convergence'],
            ['(−1)^n/n', 1, 'the terms 1/n decrease to 0, so it converges by the alternating series test, but Σ 1/n diverges: conditional convergence'],
            ['(−1)^n · n/(2n + 1)', 2, 'the terms do not approach 0 (their sizes approach 1/2), so the series diverges by the nth-term test'],
            ['(−1)^n · n/(n + 3)', 2, 'the terms do not approach 0 (their sizes approach 1), so the series diverges by the nth-term test'],
          ]);
          const opts = ['It converges absolutely', 'It converges conditionally', 'It diverges', 'It converges, and its sum is 0 because the terms cancel in pairs'];
          return {
            prompt: `Consider the alternating series ${SUM(1, term)}. Which statement is correct?`,
            ...mcFixed(r, opts, opts[k]),
            explanation: `Here ${why}. Check the series of absolute values first; "alternating" alone never guarantees convergence.`,
          };
        }
        if (idx === 2) {
          const c = int(r, 2, 6);
          const key = pick(r, ['Σ 1/n²', 'Σ 1/n', 'Σ 1/√n', 'Σ 1/n³']);
          const others = shuffle(r, [`Σ ${c}^n/n!`, `Σ n/${c}^n`, `Σ n!/${c}^n`, `Σ ${c}^n/n²`, `Σ (2/${c + 1})^n`]).slice(0, 3);
          return {
            prompt: 'Each of these series is summed from n = 1 to ∞. For which one is the ratio test inconclusive?',
            ...mc(r, key, others),
            explanation: `For a p-series such as ${key}, aₙ₊₁/aₙ is a power of n/(n + 1), which approaches 1 — and L = 1 tells nothing. The other three involve ${c}^n or n!, so their ratios approach a number other than 1 (or 0, or ∞).`,
          };
        }
        const k = int(r, 0, 3);
        const [given, about, ans] = [
          ['Σ bₙ converges', 'Σ aₙ', 0], ['Σ aₙ diverges', 'Σ bₙ', 1],
          ['Σ aₙ converges', 'Σ bₙ', 2], ['Σ bₙ diverges', 'Σ aₙ', 2],
        ][k];
        const opts = ['It converges', 'It diverges', 'Nothing: it may converge or diverge', 'It converges to the same sum as the other series'];
        return {
          prompt: `Two series have terms with 0 ≤ aₙ ≤ bₙ for every n. If ${given}, what can be concluded about ${about}?`,
          ...mcFixed(r, opts, opts[ans]),
          explanation: `Direct comparison works in two directions only: a series BELOW a convergent one converges, and a series ABOVE a divergent one diverges. ${ans === 2 ? 'Here the known series is on the wrong side, so nothing follows.' : 'Here the known series is on the useful side.'}`,
        };
      }) },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'definite-integral-properties',
    skillId: 'calcbc-definite-integral-properties',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const a = int(r, -2, 3), b = a + int(r, 2, 5), p = K.nonZero(r, -9, 12);
        const F = (x, y) => INT(x, y, 'f(x) dx');
        if (idx === 0) {
          return {
            prompt: `If ${F(a, b)} = ${m(p)}, what is ${F(b, a)}?`,
            value: -p,
            explanation: `Reversing the limits of integration changes the sign: ${F(b, a)} = −(${m(p)}) = ${m(-p)}. The size stays the same; only the sign flips.`,
          };
        }
        if (idx === 1) {
          const c = b + int(r, 2, 5), q = K.nonZero(r, -9, 12);
          return {
            prompt: `If ${F(a, b)} = ${m(p)} and ${F(b, c)} = ${m(q)}, what is ${F(a, c)}?`,
            value: p + q,
            explanation: `Integrals over adjacent intervals add: ${m(p)} + (${m(q)}) = ${m(p + q)}. Subtracting the second from the first would be the answer to a different question.`,
          };
        }
        if (idx === 2) {
          const k = pick(r, [2, 3, 4, 5, -2, -3]);
          return {
            prompt: `If ${F(a, b)} = ${m(p)}, what is ${INT(a, b, `${m(k)}f(x) dx`)}?`,
            value: k * p,
            explanation: `A constant factor comes out of the integral: ${m(k)}·(${m(p)}) = ${m(k * p)}. The constant multiplies the integral once; the width of the interval does not come into it.`,
          };
        }
        const q = K.nonZero(r, -9, 12), minus = int(r, 0, 1) === 1;
        return {
          prompt: `If ${F(a, b)} = ${m(p)} and ${INT(a, b, 'g(x) dx')} = ${m(q)}, what is ${INT(a, b, `(f(x) ${minus ? '−' : '+'} g(x)) dx`)}?`,
          value: minus ? p - q : p + q,
          explanation: `The integral of a ${minus ? 'difference is the difference' : 'sum is the sum'} of the integrals: ${m(p)} ${minus ? '−' : '+'} (${m(q)}) = ${m(minus ? p - q : p + q)}. Watch the sign when the second integral is negative.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const a = int(r, -2, 3), b = a + int(r, 2, 4), c = b + int(r, 2, 4);
        const p = K.nonZero(r, -9, 12), q = K.nonZero(r, -9, 12);
        const F = (x, y) => INT(x, y, 'f(x) dx');
        if (idx === 0) {
          return {
            prompt: `If ${F(a, c)} = ${m(p)} and ${F(b, c)} = ${m(q)}, what is ${F(a, b)}?`,
            value: p - q,
            explanation: `${F(a, c)} = ${F(a, b)} + ${F(b, c)}, so ${F(a, b)} = ${m(p)} − (${m(q)}) = ${m(p - q)}. Adding the two given integrals counts [${m(b)}, ${m(c)}] twice.`,
          };
        }
        if (idx === 1) {
          const k = int(r, 2, 5), j = int(r, 2, 5);
          return {
            prompt: `If ${F(a, b)} = ${m(p)} and ${INT(a, b, 'g(x) dx')} = ${m(q)}, what is ${INT(a, b, `(${k}f(x) − ${j}g(x)) dx`)}?`,
            value: k * p - j * q,
            explanation: `Linearity: ${k}(${m(p)}) − ${j}(${m(q)}) = ${m(k * p)} − (${m(j * q)}) = ${m(k * p - j * q)}. Each constant multiplies its own integral.`,
          };
        }
        if (idx === 2) {
          const k = K.nonZero(r, -5, 6);
          return {
            prompt: `If ${F(a, b)} = ${m(p)}, what is ${INT(a, b, `(f(x) ${K.signed(k)}) dx`)}?`,
            value: p + k * (b - a),
            explanation: `Split it: ${F(a, b)} + ${INT(a, b, `${m(k)} dx`)}. The constant integrates to ${m(k)} times the width ${b - a}: ${m(p)} ${K.signed(k * (b - a))} = ${m(p + k * (b - a))}. Adding just ${m(k)} forgets the width.`,
          };
        }
        return {
          prompt: `If ${F(a, b)} = ${m(p)} and ${F(c, b)} = ${m(q)}, what is ${F(a, c)}?`,
          value: p - q,
          explanation: `The second integral runs backwards: ${F(b, c)} = −(${m(q)}) = ${m(-q)}. Then ${F(a, c)} = ${m(p)} + (${m(-q)}) = ${m(p - q)}. Adding ${m(q)} as it stands ignores the reversed limits.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const F = (x, y) => INT(x, y, 'f(x) dx');
        if (idx === 0) {
          const a = int(r, 2, 6), p = K.nonZero(r, -9, 12), k = int(r, 0, 2), c = int(r, 2, 6);
          if (k === 0) {
            return {
              prompt: `A function f is even, so f(−x) = f(x) for all x, and ${F(0, a)} = ${m(p)}. What is ${F(-a, a)}?`,
              value: 2 * p,
              explanation: `The graph of an even function is symmetric about the y-axis, so the left half contributes the same as the right half: 2(${m(p)}) = ${m(2 * p)}. Zero would be the answer for an ODD function.`,
            };
          }
          if (k === 1) {
            return {
              prompt: `A function f is odd, so f(−x) = −f(x) for all x, and ${F(0, a)} = ${m(p)}. What is ${INT(-a, a, `(f(x) + ${c}) dx`)}?`,
              value: 2 * a * c,
              explanation: `For an odd function the two halves cancel: ${F(-a, a)} = 0. The constant ${c} integrates to ${c} times the width ${2 * a}: ${2 * a * c}. Doubling ${m(p)} treats f as even.`,
            };
          }
          return {
            prompt: `A function f is odd, so f(−x) = −f(x) for all x, and ${F(0, a)} = ${m(p)}. What is ${F(-a, 0)}?`,
            value: -p,
            explanation: `For an odd function the area on the left is the negative of the area on the right, so ${F(-a, 0)} = −(${m(p)}) = ${m(-p)}, and the two together give 0.`,
          };
        }
        if (idx === 1) {
          const a = int(r, -2, 3), b = a + int(r, 2, 5), p = K.nonZero(r, -9, 12), k = int(r, 2, 4), c = K.nonZero(r, -4, 5);
          return {
            prompt: `If ${F(a, b)} = ${m(p)}, what is ${INT(b, a, `(${k}f(x) ${K.signed(c)}) dx`)}?`,
            value: -(k * p + c * (b - a)),
            explanation: `From ${m(a)} to ${m(b)} the integral is ${k}(${m(p)}) + (${m(c)})(${b - a}) = ${m(k * p + c * (b - a))}. The limits here are reversed (${m(b)} to ${m(a)}), so the answer is the opposite: ${m(-(k * p + c * (b - a)))}.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 0, 2), b = a + int(r, 2, 3), c = b + int(r, 2, 4), d = c + int(r, 2, 3);
          const p = K.nonZero(r, -9, 15), q = K.nonZero(r, -9, 9), s = K.nonZero(r, -9, 9);
          return {
            prompt: `If ${F(a, d)} = ${m(p)}, ${F(a, b)} = ${m(q)} and ${F(c, d)} = ${m(s)}, what is ${F(b, c)}?`,
            value: p - q - s,
            explanation: `The whole interval splits into three pieces: ${m(p)} = ${m(q)} + ${F(b, c)} + (${m(s)}). So the middle piece is ${m(p)} − (${m(q)}) − (${m(s)}) = ${m(p - q - s)}.`,
          };
        }
        const w = int(r, 2, 4), a = w + int(r, 1, 3), b = a + w, lo = int(r, 1, 5), hi = lo + int(r, 2, 5);
        const bt = (x, y) => `It is between ${x} and ${y}`;
        return {
          prompt: `A continuous function f satisfies ${lo} ≤ f(x) ≤ ${hi} for every x in the interval [${a}, ${b}]. Which statement about ${F(a, b)} must be true?`,
          ...mc(r, bt(lo * w, hi * w), [bt(lo, hi), bt(lo * a, hi * b), `It equals ${(lo + hi) * w / 2}`]),
          explanation: `The integral is at least the smallest height times the width and at most the largest height times the width: ${lo}(${w}) = ${lo * w} and ${hi}(${w}) = ${hi * w}. The width is ${b} − ${a} = ${w}; the bounds on f alone (${lo} and ${hi}) are heights, not areas.`,
        };
      }) },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'limits-algebraic',
    skillId: 'calcbc-limits-algebraic',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const a = K.nonZero(r, -7, 8);
        const lim = (at, body) => `Evaluate the limit as x approaches ${m(at)} of ${body}.`;
        if (idx === 0) {
          return {
            prompt: lim(a, `(x² − ${a * a})/(${lin(a)})`),
            value: 2 * a,
            explanation: `Substituting gives 0/0, so factor: x² − ${a * a} = (${lin(a)})(${lin(-a)}). Cancel (${lin(a)}) and substitute into ${lin(-a)}: ${m(a)} ${K.signed(a)} = ${m(2 * a)}. 0/0 does not mean the limit is 0 or does not exist.`,
          };
        }
        if (idx === 1) {
          const b = K.nonZero(r, -7, 8);
          if (b === a || b === -a) again();
          return {
            prompt: lim(a, `(${quad(-(a + b), a * b)})/(${lin(a)})`),
            value: a - b,
            explanation: `The numerator factors as (${lin(a)})(${lin(b)}). Cancel (${lin(a)}), leaving ${lin(b)}, and substitute x = ${m(a)}: ${m(a - b)}. Direct substitution first gives 0/0, the signal to factor.`,
          };
        }
        if (idx === 2) {
          const c = int(r, 1, 9), d = int(r, 1, 9), at = int(r, 1, 6);
          return {
            prompt: lim(at, `(x² + ${c})/(x + ${d})`),
            value: K.frac(at * at + c, at + d),
            explanation: `The denominator is not 0 at x = ${at}, so substitute directly: (${at * at} + ${c})/(${at} + ${d}) = ${at * at + c}/${at + d} = ${fr(at * at + c, at + d)}. No factoring is needed when substitution gives a real number.`,
          };
        }
        return {
          prompt: lim(a, `(${lin(a)})/(x² − ${a * a})`),
          value: K.frac(1, 2 * a),
          explanation: `Factor the denominator: x² − ${a * a} = (${lin(a)})(${lin(-a)}). Cancelling leaves 1/(${lin(-a)}), and at x = ${m(a)} that is 1/(${m(2 * a)}) = ${fr(1, 2 * a)}. The reciprocal, ${m(2 * a)}, is the limit of the upside-down fraction.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const a = int(r, 2, 7);
        if (idx === 0) {
          return {
            prompt: `Evaluate the limit as x approaches 0 of (√(x + ${a * a}) − ${a})/x.`,
            value: K.frac(1, 2 * a),
            explanation: `Multiply top and bottom by the conjugate √(x + ${a * a}) + ${a}: the numerator becomes (x + ${a * a}) − ${a * a} = x, which cancels. What is left is 1/(√(x + ${a * a}) + ${a}), and at x = 0 that is 1/(${a} + ${a}) = 1/${2 * a}.`,
          };
        }
        if (idx === 1) {
          return {
            prompt: `Evaluate the limit as x approaches ${a * a} of (√x − ${a})/(x − ${a * a}).`,
            value: K.frac(1, 2 * a),
            explanation: `Write x − ${a * a} = (√x − ${a})(√x + ${a}) and cancel √x − ${a}. The limit of 1/(√x + ${a}) at x = ${a * a} is 1/(${a} + ${a}) = 1/${2 * a}.`,
          };
        }
        if (idx === 2) {
          const A = K.nonZero(r, -5, 6), b = K.nonZero(r, -6, 7), c = K.nonZero(r, -6, 7);
          if (b === A || c === A || b === c) again();
          return {
            prompt: `Evaluate the limit as x approaches ${m(A)} of (${quad(-(A + b), A * b)})/(${quad(-(A + c), A * c)}).`,
            value: K.frac(A - b, A - c),
            explanation: `Both parts are 0 at x = ${m(A)}, so both contain the factor (${lin(A)}): the fraction is (${lin(A)})(${lin(b)}) over (${lin(A)})(${lin(c)}). Cancel and substitute: (${m(A - b)})/(${m(A - c)}) = ${fr(A - b, A - c)}.`,
          };
        }
        return {
          prompt: `Evaluate the limit as h approaches 0 of ((${a} + h)² − ${a * a})/h.`,
          value: 2 * a,
          explanation: `Expand: (${a} + h)² − ${a * a} = ${2 * a}h + h². Divide by h to get ${2 * a} + h, which approaches ${2 * a}. (This is the derivative of x² at x = ${a}.)`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 6);
          return {
            prompt: `Evaluate the limit as x approaches ${a} of (1/x − 1/${a})/(x − ${a}).`,
            value: K.frac(-1, a * a),
            explanation: `Combine the small fractions: 1/x − 1/${a} = (${a} − x)/(${a}x). Since ${a} − x = −(x − ${a}), the factor x − ${a} cancels and leaves −1/(${a}x), which is −1/${a * a} at x = ${a}. Losing the minus sign from ${a} − x is the usual slip.`,
          };
        }
        if (idx === 1) {
          const a = pick(r, [2, 3, 4, 5, -2, -3]);
          return {
            prompt: `Evaluate the limit as x approaches ${m(a)} of (x³ ${K.signed(-(a ** 3))})/(${lin(a)}).`,
            value: 3 * a * a,
            explanation: `Factor the ${a > 0 ? 'difference' : 'sum'} of cubes: (${lin(a)})(x² ${K.signed(a)}x + ${a * a}). Cancel (${lin(a)}) and substitute x = ${m(a)}: ${a * a} + ${a * a} + ${a * a} = ${3 * a * a}.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 2, 4);
          return {
            prompt: `Evaluate the limit as x approaches ${a * a} of (x² − ${a ** 4})/(√x − ${a}).`,
            value: 4 * a ** 3,
            explanation: `x² − ${a ** 4} = (x − ${a * a})(x + ${a * a}) and x − ${a * a} = (√x − ${a})(√x + ${a}). Cancel √x − ${a}: the limit of (√x + ${a})(x + ${a * a}) at x = ${a * a} is (${2 * a})(${2 * a * a}) = ${4 * a ** 3}.`,
          };
        }
        const [k, j] = pick(r, [[3, 5], [2, 7], [5, 2], [4, 3], [7, 4], [6, 4], [2, 6], [9, 2]]);
        return {
          prompt: `Evaluate the limit as x approaches 0 of sin(${k}x)/(${j}x).`,
          value: K.frac(k, j),
          explanation: `Use the limit of sin(u)/u = 1 as u → 0. Write sin(${k}x)/(${j}x) = (${k}/${j})·sin(${k}x)/(${k}x), which approaches (${k}/${j})(1) = ${fr(k, j)}. Substituting x = 0 gives 0/0, not 0.`,
        };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
