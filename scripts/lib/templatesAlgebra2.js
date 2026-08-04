'use strict';
/**
 * The Algebra 2 skills with NO bank content to point at.
 *
 * 17 rows were crosswalked first (the pathway carries several alternate names
 * for the same skill — `solving-quadratics-all-methods` alongside
 * `quadratic-solving-all-methods`, `matrix-operations` alongside
 * `matrices-operations`), which took the course 61% -> 82%. These fifteen are
 * what remained:
 *
 *   polynomial division & theorems   remainder/factor theorem, graphing by end
 *                                    behaviour and zeros
 *   rational functions               holes, vertical/horizontal asymptotes,
 *                                    graphing, complex fractions — the bank
 *                                    simplifies rational expressions but never
 *                                    ANALYSES the function
 *   trigonometry                     inverse trig values, sinusoidal amplitude
 *                                    and period
 *   statistics                       binomial probability, the normal /
 *                                    empirical rule
 *   synthesis                        the course's own mixed-review skills
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick, frac } = K;

const GB = '9-12';

// Sinusoids: y = a·sin(bx) has amplitude |a| and period 2π/b.
const periodStr = (b) => (b === 1 ? '2π' : (2 % b === 0 ? `${2 / b}π` : `2π/${b}`));

const TEMPLATES = [
  {
    skillId: 'remainder-factor-theorems',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 1, 9), c = int(r, 2, 5);
        const val = a * c * c + b;
        return { prompt: `Use the Remainder Theorem: what is the remainder when ${a}x² + ${b} is divided by (x − ${c})?`,
          value: val,
          explanation: `The Remainder Theorem says the remainder equals P(${c}). P(${c}) = ${a}(${c})² + ${b} = ${a * c * c} + ${b} = ${val}. No long division needed — substitution is the whole method.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        // Alternate factor / NOT a factor. Every item answering "Yes" taught
        // students to answer Yes — and the variety gate missed it, because a
        // second generator shares this difficulty tier and supplied the other
        // distinct answers.
        const root = int(r, 1, 5), other = int(r, 2, 6);
        const isFactor = idx % 2 === 0;
        // For the NO case, build the polynomial from two DIFFERENT roots so the
        // tested binomial genuinely is not a factor.
        const p = isFactor ? root : root + 1 + int(r, 0, 2);
        // BOTH roots must avoid `root` in the NO case, or the polynomial really
        // does have (x − root) as a factor and the stated answer is wrong:
        // x² − 11x + 30 = (x−5)(x−6) was being labelled "not a factor" of (x−5).
        let q = other;
        while (!isFactor && q === root) q = int(r, 2, 6);
        const b = -(p + q), c = p * q;
        const bStr = b < 0 ? `− ${Math.abs(b)}x` : `+ ${b}x`;
        const cStr = c < 0 ? `− ${Math.abs(c)}` : `+ ${c}`;
        const val = (root - p) * (root - q);
        return { prompt: `Is (x − ${root}) a factor of x² ${bStr} ${cStr}?`,
          value: isFactor ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only if x is positive', 'Cannot be determined'],
          correctOption: isFactor ? 'A' : 'B',
          explanation: isFactor
            ? `By the Factor Theorem, (x − ${root}) is a factor exactly when P(${root}) = 0. Here P(${root}) = 0, so yes — the polynomial factors as (x − ${p})(x − ${q}).`
            : `By the Factor Theorem, check P(${root}): (${root} − ${p})(${root} − ${q}) = ${val}. That is not 0, so (x − ${root}) is NOT a factor. It factors as (x − ${p})(x − ${q}) instead.` };
      } },
      { difficulty: 3, gen: (r) => {
        // r1 and r2 must BOTH differ from the point being evaluated, or P(x)
        // comes out 0 while the explanation claims "this is not 0".
        const notRoot = int(r, 2, 6);
        const r1 = notRoot + int(r, 1, 3);
        let r2 = int(r, 1, 4);
        while (r2 === notRoot) r2 = int(r, 1, 4);
        const val = (notRoot - r1) * (notRoot - r2);
        return { prompt: `P(x) = (x − ${r1})(x − ${r2}). What is P(${notRoot})?`,
          value: val,
          explanation: `Substitute directly: (${notRoot} − ${r1})(${notRoot} − ${r2}) = (${notRoot - r1})(${notRoot - r2}) = ${val}. Because this is not 0, (x − ${notRoot}) is NOT a factor.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 4), b = int(r, 2, 8), c = int(r, 1, 9), k = int(r, 2, 4);
        const val = a * k * k * k + b * k + c;
        return { prompt: `What is the remainder when ${a === 1 ? '' : a}x³ + ${b}x + ${c} is divided by (x − ${k})?`,
          value: val,
          explanation: `Remainder = P(${k}) = ${a}(${k})³ + ${b}(${k}) + ${c} = ${a * k * k * k} + ${b * k} + ${c} = ${val}. Cubing before multiplying is where this usually goes wrong.` };
      } },
    ],
  },

  {
    skillId: 'polynomial-graphing',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const deg = idx % 2 === 0 ? 3 : 4;
        const lead = idx % 2 === 0 ? int(r, 2, 5) : -int(r, 2, 5);
        const up = lead > 0;
        const ans = deg % 2 === 1
          ? (up ? 'Down on the left, up on the right' : 'Up on the left, down on the right')
          : (up ? 'Up on both ends' : 'Down on both ends');
        const OPTS = ['Up on both ends', 'Down on both ends', 'Down on the left, up on the right', 'Up on the left, down on the right'];
        return { prompt: `Describe the END BEHAVIOUR of the polynomial ${lead}x${deg === 3 ? '³' : '⁴'} + …`,
          value: ans, options: OPTS, correctOption: 'ABCD'[OPTS.indexOf(ans)],
          explanation: `Degree ${deg} is ${deg % 2 === 1 ? 'ODD' : 'EVEN'} and the leading coefficient is ${up ? 'positive' : 'negative'}. ${deg % 2 === 1 ? 'Odd degree sends the ends in OPPOSITE directions' : 'Even degree sends both ends the SAME way'}, and the sign decides which: ${ans.toLowerCase()}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        // Vary how many DISTINCT factors there are; two factors every time made
        // the answer always 2.
        const r1 = int(r, 1, 5); let r2 = int(r, 1, 6);
        while (r2 === r1) r2 = int(r, 1, 6);
        const r3 = r2 + int(r, 1, 3);
        const shapes = [
          [`(x − ${r1})(x + ${r2})`, 2, `x = ${r1} and x = −${r2}`],
          [`(x − ${r1})(x + ${r2})(x + ${r3})`, 3, `x = ${r1}, x = −${r2} and x = −${r3}`],
          [`(x − ${r1})²`, 1, `x = ${r1} only — the repeated factor still meets the axis once`],
          [`(x − ${r1})(x + ${r2})²`, 2, `x = ${r1} and x = −${r2}`],
        ];
        const [expr, n, where] = shapes[idx % shapes.length];
        return { prompt: `How many DISTINCT x-intercepts does y = ${expr} have?`, value: n,
          explanation: `Set each factor to zero: ${where}. That is ${n} distinct intercept${n === 1 ? '' : 's'} — a repeated factor does not add a new one.` };
      } },
      { difficulty: 4, gen: (r) => {
        const r1 = int(r, 1, 5), m = pick(r, [2, 3]);
        return { prompt: `The factor (x − ${r1})${m === 2 ? '²' : '³'} appears in a polynomial. Does the graph CROSS or TOUCH the x-axis at x = ${r1}?`,
          value: m === 2 ? 'Touches (bounces off)' : 'Crosses',
          options: ['Crosses', 'Touches (bounces off)', 'Neither', 'Both'],
          correctOption: m === 2 ? 'B' : 'A',
          explanation: `Multiplicity ${m} is ${m % 2 === 0 ? 'EVEN, so the graph touches the axis and turns back' : 'ODD, so the graph passes through'}. Even multiplicity bounces; odd multiplicity crosses.` };
      } },
    ],
  },

  {
    skillId: 'graphing-polynomials',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const deg = pick(r, [2, 3, 4, 5]);
        return { prompt: `What is the MAXIMUM number of x-intercepts a polynomial of degree ${deg} can have?`,
          value: deg,
          explanation: `A degree-${deg} polynomial has at most ${deg} real roots, so at most ${deg} x-intercepts. It may have fewer if some roots are repeated or complex.` };
      } },
      { difficulty: 3, gen: (r) => {
        const deg = pick(r, [3, 4, 5, 6]);
        return { prompt: `What is the maximum number of TURNING POINTS on the graph of a degree-${deg} polynomial?`,
          value: deg - 1,
          explanation: `A polynomial of degree ${deg} turns at most ${deg} − 1 = ${deg - 1} times. Answering ${deg} confuses turning points with the maximum number of roots.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 4), b = int(r, 1, 6);
        return { prompt: `What is the y-intercept of y = (x − ${a})(x + ${b})?`,
          value: -a * b,
          explanation: `The y-intercept is the value at x = 0: (0 − ${a})(0 + ${b}) = (−${a})(${b}) = ${-a * b}. Set x to 0 — the y-intercept is never found by setting y to 0.` };
      } },
    ],
  },

  {
    skillId: 'vertical-horizontal-asymptotes',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 8);
        return { prompt: `What is the vertical asymptote of f(x) = 1/(x − ${a})?`,
          value: `x = ${a}`,
          explanation: `A vertical asymptote occurs where the denominator is zero and the numerator is not: x − ${a} = 0 gives x = ${a}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        if (idx % 2 === 0) {
          return { prompt: `What is the horizontal asymptote of f(x) = (${a}x + 1)/(${b}x − 3)?`,
            value: `y = ${frac(a, b)}`,
            explanation: `Numerator and denominator have the SAME degree, so the horizontal asymptote is the ratio of leading coefficients: y = ${a}/${b} = ${frac(a, b)}.` };
        }
        return { prompt: `What is the horizontal asymptote of f(x) = ${a}/(x² + ${b})?`,
          value: 'y = 0',
          explanation: `The denominator has the HIGHER degree, so the fraction shrinks toward 0 as x grows: the horizontal asymptote is y = 0.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        // Cycle the three degree cases; asking only the top-heavy one made every
        // item answer "No — the numerator has the higher degree".
        const a = int(r, 2, 5), b = int(r, 1, 6);
        const kind = idx % 3;
        const OPTS = ['Yes, y = 0', `Yes, y = ${a}`, 'No — the numerator has the higher degree', 'Yes, y = 1'];
        if (kind === 0) {
          return { prompt: `Does f(x) = (${a}x² + 1)/(x + ${b}) have a horizontal asymptote?`,
            value: OPTS[2], options: OPTS, correctOption: 'C',
            explanation: `The numerator's degree (2) beats the denominator's (1), so values grow without bound instead of levelling off — no horizontal asymptote. (There is a slant one instead.)` };
        }
        if (kind === 1) {
          return { prompt: `Does f(x) = (${a}x + 1)/(x + ${b}) have a horizontal asymptote?`,
            value: OPTS[1], options: OPTS, correctOption: 'B',
            explanation: `Equal degrees (both 1), so the asymptote is the ratio of leading coefficients: y = ${a}/1 = ${a}.` };
        }
        return { prompt: `Does f(x) = (${a}x + 1)/(x² + ${b}) have a horizontal asymptote?`,
          value: OPTS[0], options: OPTS, correctOption: 'A',
          explanation: `The denominator's degree (2) beats the numerator's (1), so the fraction shrinks toward zero: y = 0.` };
      } },
    ],
  },

  {
    skillId: 'holes-in-rational-functions',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 7);
        return { prompt: `f(x) = ((x − ${a})(x + 2))/(x − ${a}). At what x-value is there a HOLE?`,
          value: `x = ${a}`,
          explanation: `The factor (x − ${a}) cancels from top and bottom, so the function is undefined at x = ${a} but does not blow up there — that is a hole, not an asymptote.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 6), b = int(r, 1, 6);
        return { prompt: `f(x) = ((x − ${a})(x + ${b}))/(x − ${a}). What is the y-value of the hole?`,
          value: a + b,
          explanation: `After cancelling, f(x) = x + ${b} for x ≠ ${a}. The hole sits at the value that expression would take: ${a} + ${b} = ${a + b}. So the hole is at (${a}, ${a + b}).` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const a = int(r, 1, 6);
        const isHole = idx % 2 === 0;
        const OPTS = ['A hole', 'A vertical asymptote', 'An x-intercept', 'Nothing unusual'];
        return { prompt: isHole
          ? `In f(x) = ((x − ${a})(x + 1))/(x − ${a}), what happens at x = ${a}?`
          : `In f(x) = (x + 1)/(x − ${a}), what happens at x = ${a}?`,
        value: isHole ? OPTS[0] : OPTS[1], options: OPTS, correctOption: isHole ? 'A' : 'B',
        explanation: isHole
          ? `The (x − ${a}) cancels, so the function is merely undefined at that single point — a hole.`
          : `Nothing cancels, so the denominator goes to zero while the numerator does not: the values blow up. That is a vertical asymptote.` };
      } },
    ],
  },

  {
    skillId: 'rational-function-graphing',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 8);
        return { prompt: `What is the DOMAIN restriction of f(x) = 1/(x + ${a})?`,
          value: `x ≠ ${-a}`,
          explanation: `The denominator cannot be zero: x + ${a} ≠ 0, so x ≠ ${-a}. Everything else is allowed.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 6);
        return { prompt: `What is the x-intercept of f(x) = (x − ${a})/(x + 2)?`,
          value: `x = ${a}`,
          explanation: `A fraction is zero exactly when its NUMERATOR is zero: x − ${a} = 0 gives x = ${a}. (The denominator controls asymptotes, never intercepts.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 5), b = int(r, 1, 5);
        return { prompt: `What is the y-intercept of f(x) = (x + ${a})/(x + ${b})?`,
          value: frac(a, b),
          explanation: `Substitute x = 0: (0 + ${a})/(0 + ${b}) = ${a}/${b} = ${frac(a, b)}.` };
      } },
    ],
  },

  {
    skillId: 'rational-graphing-asymptotes',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 7);
        return { prompt: `f(x) = 1/(x + ${a}) has a vertical asymptote at which x-value?`,
          value: `x = ${-a}`,
          explanation: `Set the denominator to zero: x + ${a} = 0, so x = ${-a}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const a = int(r, 2, 5), b = int(r, 2, 5), c = b + int(r, 1, 3);
        const shapes = [
          [`1/((x − ${a})(x + ${b}))`, 2, `x = ${a} and x = ${-b}`],
          [`1/(x − ${a})`, 1, `x = ${a}`],
          [`1/((x − ${a})(x + ${b})(x + ${c}))`, 3, `x = ${a}, x = ${-b} and x = ${-c}`],
          [`1/(x² + ${b})`, 0, 'nowhere — x² + ' + b + ' is never zero for real x'],
        ];
        const [expr, n, where] = shapes[idx % shapes.length];
        return { prompt: `How many VERTICAL asymptotes does f(x) = ${expr} have?`, value: n,
          explanation: `Vertical asymptotes sit where the denominator is zero and nothing cancels: ${where}. That is ${n}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        return { prompt: `State the horizontal asymptote of f(x) = (${a}x² + 1)/(${b}x² − 4).`,
          value: `y = ${frac(a, b)}`,
          explanation: `Equal degrees (both 2), so the horizontal asymptote is the ratio of the leading coefficients: y = ${a}/${b} = ${frac(a, b)}. The constants never affect it.` };
      } },
    ],
  },

  {
    skillId: 'complex-fractions',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        return { prompt: `Simplify the complex fraction:  (1/${a}) ÷ (1/${b})`,
          value: frac(b, a),
          explanation: `Dividing by a fraction means multiplying by its reciprocal: (1/${a}) × (${b}/1) = ${b}/${a} = ${frac(b, a)}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 8);
        return { prompt: `Simplify:  (${a}/x) ÷ (${b}/x)`,
          value: frac(a, b),
          explanation: `Multiply by the reciprocal: (${a}/x) × (x/${b}) = ${a}x/(${b}x) = ${frac(a, b)}. The x cancels because it appears in both a numerator and a denominator.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 2, 5);
        return { prompt: `Simplify:  (1/${a} + 1/${b}) ÷ (1/(${a * b}))`,
          value: a + b,
          explanation: `Combine the top over ${a * b}: 1/${a} + 1/${b} = ${b}/${a * b} + ${a}/${a * b} = ${a + b}/${a * b}. Dividing by 1/${a * b} multiplies by ${a * b}, leaving ${a + b}.` };
      } },
    ],
  },

  {
    skillId: 'inverse-trig-functions',
    tiers: (() => {
      const CASES = [
        ['sin⁻¹(0)', '0', 'sin 0 = 0, and 0 lies in the range of inverse sine.'],
        ['sin⁻¹(1)', 'π/2', 'sin(π/2) = 1, and π/2 is within [−π/2, π/2].'],
        ['cos⁻¹(1)', '0', 'cos 0 = 1, and 0 lies in the range [0, π] of inverse cosine.'],
        ['cos⁻¹(0)', 'π/2', 'cos(π/2) = 0, and π/2 lies in [0, π].'],
        ['tan⁻¹(0)', '0', 'tan 0 = 0, and 0 is within the range of inverse tangent.'],
        ['tan⁻¹(1)', 'π/4', 'tan(π/4) = 1, and π/4 lies in (−π/2, π/2).'],
        ['sin⁻¹(−1)', '−π/2', 'sin(−π/2) = −1, the lower end of the inverse-sine range.'],
        ['cos⁻¹(−1)', 'π', 'cos π = −1, the upper end of the inverse-cosine range.'],
        ['sin⁻¹(1/2)', 'π/6', 'sin(π/6) = 1/2, and π/6 lies in [−π/2, π/2].'],
        ['cos⁻¹(1/2)', 'π/3', 'cos(π/3) = 1/2, and π/3 lies in [0, π].'],
        ['tan⁻¹(−1)', '−π/4', 'tan(−π/4) = −1, within the inverse-tangent range.'],
        ['cos⁻¹(√3/2)', 'π/6', 'cos(π/6) = √3/2, and π/6 lies in [0, π].'],
      ];
      const OPTS = ['0', 'π/2', 'π/4', 'π'];
      const build = (offset) => (r, idx) => {
        const c = CASES[(offset + idx) % CASES.length];
        const opts = OPTS.includes(c[1]) ? OPTS : [c[1], '0', 'π/2', 'π'];
        return { prompt: `Evaluate ${c[0]} in radians.`, value: c[1],
          options: opts, correctOption: 'ABCD'[opts.indexOf(c[1])], explanation: c[2] };
      };
      return [
        { difficulty: 2, gen: build(0) },
        { difficulty: 3, gen: build(4) },
        { difficulty: 4, gen: build(8) },
      ];
    })(),
  },

  {
    skillId: 'graphing-sinusoidal',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 9);
        return { prompt: `What is the AMPLITUDE of y = ${a}sin(x)?`,
          value: a,
          explanation: `Amplitude is the absolute value of the coefficient in front of the sine: |${a}| = ${a}. It is the height from the midline to a peak.` };
      } },
      { difficulty: 3, gen: (r) => {
        const b = pick(r, [1, 2, 3, 4]);
        return { prompt: `What is the PERIOD of y = sin(${b === 1 ? '' : b}x)?`,
          value: periodStr(b),
          explanation: `Period = 2π ÷ |b| = 2π/${b} = ${periodStr(b)}. A larger b squeezes the wave into a shorter period.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const a = int(r, 2, 6), d = int(r, 1, 5);
        if (idx % 2 === 0) {
          return { prompt: `What is the MIDLINE of y = ${a}sin(x) + ${d}?`,
            value: `y = ${d}`,
            explanation: `The vertical shift moves the midline from y = 0 to y = ${d}. The ${a} sets the amplitude and does not move the midline.` };
        }
        return { prompt: `What is the MAXIMUM value of y = ${a}sin(x) + ${d}?`,
          value: a + d,
          explanation: `Sine peaks at 1, so the maximum is ${a}(1) + ${d} = ${a + d}. The minimum would be −${a} + ${d} = ${d - a}.` };
      } },
    ],
  },

  {
    skillId: 'binomial-probability',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const n = int(r, 3, 6);
        return { prompt: `A fair coin is flipped ${n} times. How many possible outcome sequences are there?`,
          value: Math.pow(2, n),
          explanation: `Each flip has 2 outcomes and the flips are independent, so there are 2^${n} = ${Math.pow(2, n)} sequences in total.` };
      } },
      { difficulty: 3, gen: (r) => {
        const n = pick(r, [4, 5, 6]), k = int(r, 1, 3);
        const C = (a, b) => { let v = 1; for (let i = 0; i < b; i++) v = (v * (a - i)) / (i + 1); return Math.round(v); };
        return { prompt: `In how many ways can exactly ${k} heads occur in ${n} coin flips?`,
          value: C(n, k),
          explanation: `This is the binomial coefficient C(${n}, ${k}) = ${C(n, k)} — the number of ways to choose which ${k} of the ${n} flips are heads.` };
      } },
      { difficulty: 4, gen: (r) => {
        const n = pick(r, [3, 4]), k = int(r, 1, 2);
        const C = (a, b) => { let v = 1; for (let i = 0; i < b; i++) v = (v * (a - i)) / (i + 1); return Math.round(v); };
        const ways = C(n, k), total = Math.pow(2, n);
        return { prompt: `A fair coin is flipped ${n} times. What is the probability of exactly ${k} heads? Give your answer as a fraction in lowest terms.`,
          value: frac(ways, total),
          explanation: `Favourable outcomes: C(${n}, ${k}) = ${ways}. Total outcomes: 2^${n} = ${total}. Probability = ${ways}/${total} = ${frac(ways, total)}.` };
      } },
    ],
  },

  {
    skillId: 'data-analysis-normal-distribution',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const mean = int(r, 5, 9) * 10, sd = int(r, 2, 8);
        const k = [1, 2, 3, 1][idx % 4];
        const pct = k === 1 ? 68 : (k === 2 ? 95 : 99.7);
        return { prompt: `A normal distribution has mean ${mean} and standard deviation ${sd}. About what percent of data lies within ${k} standard deviation${k === 1 ? '' : 's'} of the mean?`,
          value: pct,
          explanation: `The empirical rule gives 68% within 1 SD, 95% within 2 and 99.7% within 3. For ${k} that is ${pct}% — between ${mean - k * sd} and ${mean + k * sd}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const mean = int(r, 5, 9) * 10, sd = int(r, 2, 8);
        const k = idx % 2 === 0 ? 2 : 3;
        const pct = k === 2 ? 95 : 99.7;
        return { prompt: `For a normal distribution with mean ${mean} and standard deviation ${sd}, about what percent of data lies within ${k} standard deviations of the mean?`,
          value: pct,
          explanation: `The empirical rule gives 68% within 1 SD, 95% within 2, and 99.7% within 3. For ${k} SD that is ${pct}% — between ${mean - k * sd} and ${mean + k * sd}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const mean = int(r, 5, 9) * 10, sd = int(r, 2, 8);
        const z = [1, -1, 2, -2][idx % 4];   // cycle, including below the mean
        const x = mean + z * sd;
        return { prompt: `A normal distribution has mean ${mean} and standard deviation ${sd}. What is the z-score of the value ${x}?`,
          value: z,
          explanation: `z = (x − mean)/SD = (${x} − ${mean})/${sd} = ${z * sd}/${sd} = ${z}. A z-score counts how many standard deviations a value sits from the mean.` };
      } },
    ],
  },

  // ── The course's own synthesis skills: mixed BY DESIGN ──────────────────
  {
    skillId: 'multi-domain-modeling',
    tiers: [
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const p0 = int(r, 100, 900), rate = pick(r, [2, 3, 4]), t = int(r, 2, 4);
          return { prompt: `A population of ${p0} multiplies by ${rate} each year. What is the population after ${t} years?`,
            value: p0 * Math.pow(rate, t),
            explanation: `Exponential growth: ${p0} × ${rate}^${t} = ${p0} × ${Math.pow(rate, t)} = ${p0 * Math.pow(rate, t)}.` };
        }
        const start = int(r, 20, 60), m = int(r, 3, 9), t = int(r, 2, 8);
        return { prompt: `A tank starts with ${start} litres and gains ${m} litres per minute. How much is in it after ${t} minutes?`,
          value: start + m * t,
          explanation: `Linear growth: ${start} + ${m}(${t}) = ${start} + ${m * t} = ${start + m * t} litres. A constant rate per minute makes this linear, not exponential.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 2, 6), x = int(r, 2, 5);
        return { prompt: `f(x) = ${a}x² and g(x) = x + ${b}. What is f(g(${x}))?`,
          value: a * Math.pow(x + b, 2),
          explanation: `Work inside out: g(${x}) = ${x} + ${b} = ${x + b}. Then f(${x + b}) = ${a}(${x + b})² = ${a} × ${Math.pow(x + b, 2)} = ${a * Math.pow(x + b, 2)}.` };
      } },
    ],
  },

  {
    skillId: 'real-world-problem-solving',
    tiers: [
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const fixed = int(r, 20, 80), per = int(r, 2, 9), n = int(r, 3, 9);
          return { prompt: `A plan costs $${fixed} plus $${per} per unit. What is the total cost for ${n} units, in dollars?`,
            value: fixed + per * n,
            explanation: `Total = fixed + variable: ${fixed} + ${per}(${n}) = ${fixed} + ${per * n} = ${fixed + per * n} dollars.` };
        }
        const price = int(r, 20, 90), pct = pick(r, [10, 15, 20, 25]);
        const tip = (price * pct) / 100;
        return { prompt: `A bill of $${price} gets a ${pct}% tip. What is the total, in dollars?`,
          value: price + tip,
          explanation: `Tip: ${pct}% of ${price} = ${tip}. Total: ${price} + ${tip} = ${price + tip} dollars.` };
      } },
      { difficulty: 4, gen: (r) => {
        const d = int(r, 60, 300), s = pick(r, [20, 30, 40, 60]);
        return { prompt: `A car travels ${d} miles at ${s} miles per hour. How many hours does the trip take?`,
          value: frac(d, s),
          explanation: `Time = distance ÷ speed = ${d} ÷ ${s} = ${frac(d, s)} hours.` };
      } },
    ],
  },

  {
    skillId: 'course-synthesis',
    tiers: [
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const a = int(r, 2, 6), b = int(r, 2, 9), x = int(r, 2, 7);
          return { prompt: `Evaluate ${a}x² − ${b} when x = ${x}.`,
            value: a * x * x - b,
            explanation: `Exponent first: ${x}² = ${x * x}. Then ${a}(${x * x}) = ${a * x * x}, and ${a * x * x} − ${b} = ${a * x * x - b}.` };
        }
        const r1 = int(r, 1, 6), r2 = int(r, 1, 6);
        return { prompt: `What are the solutions of (x − ${r1})(x + ${r2}) = 0? Give the positive solution.`,
          value: r1,
          explanation: `The zero-product property: either x − ${r1} = 0 giving x = ${r1}, or x + ${r2} = 0 giving x = ${-r2}. The positive solution is ${r1}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const a = int(r, 2, 5), b = int(r, 2, 8);
          return { prompt: `Solve for x:  ${a}x² = ${a * b * b}`,
            value: b,
            explanation: `Divide both sides by ${a}: x² = ${b * b}. Take the positive square root: x = ${b}. (Formally x = ±${b}; the positive root is asked for here.)` };
        }
        const n = int(r, 2, 5), base = int(r, 2, 4);
        return { prompt: `Simplify: ${base}^${n} × ${base}^2`,
          value: `${base}^${n + 2}`,
          explanation: `Multiplying powers with the same base ADDS the exponents: ${base}^(${n}+2) = ${base}^${n + 2}. Multiplying the exponents is the usual error.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
