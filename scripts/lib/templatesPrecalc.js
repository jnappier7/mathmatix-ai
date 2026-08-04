'use strict';
/**
 * The Precalculus skills with NO bank content anywhere.
 *
 * 15 rows were crosswalked first — the course's *-review skills to existing
 * banks, and its polynomial/rational/sinusoid analysis skills to the items
 * authored for algebra-2 (cross-course reuse). What remains is the block the
 * bank has never touched: conics, polar, parametric, vectors, the sum/
 * difference and double/half-angle identities, synthetic division, sign-chart
 * inequalities, and inverse functions.
 *
 * Number design keeps every answer typeable: vector magnitudes and complex
 * moduli come from Pythagorean pairs (3-4-5, 6-8-10, 5-12-13, 8-15-17),
 * identity evaluations use 3-4-5 / 5-12-13 sines and cosines so results are
 * clean fractions, and polar work stays on axis angles where coordinates are
 * integers. Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick, frac } = K;

const GB = '9-12';

// Pythagorean pairs: [a, b, c] with a² + b² = c².
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]];

const TEMPLATES = [
  {
    skillId: 'inverse-functions',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const a = int(r, 2, 6), b = int(r, 1, 9);
        if (idx % 2 === 0) {
          return { prompt: `f(x) = x + ${b}. What is f⁻¹(x)?`, value: `x − ${b}`,
            explanation: `The inverse UNDOES the function. f adds ${b}, so f⁻¹ subtracts it: f⁻¹(x) = x − ${b}.` };
        }
        return { prompt: `f(x) = ${a}x. What is f⁻¹(x)?`, value: `x/${a}`,
          explanation: `f multiplies by ${a}, so the inverse divides by ${a}: f⁻¹(x) = x/${a}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 1, 9);
        return { prompt: `f(x) = ${a}x + ${b}. What is f⁻¹(x)?`, value: `(x − ${b})/${a}`,
          explanation: `Swap x and y, then solve: x = ${a}y + ${b} → y = (x − ${b})/${a}. Undo the LAST operation first — f adds ${b} last, so f⁻¹ subtracts it first.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const a = int(r, 1, 8), b = int(r, 2, 9);
        if (idx % 2 === 0) {
          return { prompt: `The point (${a}, ${b}) lies on the graph of f. What point must lie on the graph of f⁻¹?`,
            value: `(${b}, ${a})`,
            explanation: `The inverse swaps inputs and outputs, so (${a}, ${b}) on f becomes (${b}, ${a}) on f⁻¹ — the graphs reflect across y = x.` };
        }
        const OPTS = ['It passes the horizontal line test', 'It passes the vertical line test', 'It is always increasing', 'It has a y-intercept'];
        return { prompt: `What must be true of a function's graph for the function to HAVE an inverse function?`,
          value: OPTS[0], options: OPTS, correctOption: 'A',
          explanation: `An inverse function exists only when each output comes from ONE input — no horizontal line may hit the graph twice. The vertical line test only checks that it is a function at all.` };
      } },
    ],
  },

  {
    skillId: 'synthetic-division-remainder',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const b = int(r, 2, 8), c = int(r, 1, 9), k = int(r, 1, 4);
        const rem = k * k + b * k + c;
        return { prompt: `Use synthetic division to find the remainder when x² + ${b}x + ${c} is divided by (x − ${k}).`,
          value: rem,
          explanation: `Synthetic division with ${k}: bring down 1; ${k}·1 = ${k}, add to ${b} → ${b + k}; ${k}·${b + k} = ${k * (b + k)}, add to ${c} → ${rem}. The last number is the remainder — and it equals P(${k}), as the Remainder Theorem promises.` };
      } },
      { difficulty: 3, gen: (r) => {
        const b = int(r, 2, 7), c = int(r, 1, 9), k = int(r, 1, 4);
        return { prompt: `When x² + ${b}x + ${c} is divided synthetically by (x − ${k}), the quotient is x + q. What is q?`,
          value: b + k,
          explanation: `The synthetic row starts: bring down 1, then ${k}·1 + ${b} = ${b + k}. The quotient's coefficients are those first numbers, so the quotient is x + ${b + k} and q = ${b + k}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const root = int(r, 1, 4), other = int(r, 1, 5);
        const b = -(root + other), c = root * other;
        const bStr = b < 0 ? `− ${Math.abs(b)}x` : `+ ${b}x`;
        return { prompt: `Synthetic division of x² ${bStr} + ${c} by (x − ${root}) leaves remainder 0. What is the OTHER root of the polynomial?`,
          value: other,
          explanation: `Remainder 0 means (x − ${root}) is a factor, and the quotient row gives the other factor: x − ${other}. So the other root is ${other}. (Check: ${root} + ${other} = ${root + other} matches the middle coefficient, ${root}·${other} = ${c} matches the constant.)` };
      } },
    ],
  },

  {
    skillId: 'polynomial-rational-inequalities',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const a = int(r, 1, 4); const b = a + int(r, 1, 4);
        const greater = idx % 2 === 0;
        const OPTS = [`x < ${a} or x > ${b}`, `${a} < x < ${b}`, `x > ${b} only`, `All real numbers`];
        return { prompt: `Solve: (x − ${a})(x − ${b}) ${greater ? '>' : '<'} 0`,
          value: greater ? OPTS[0] : OPTS[1], options: OPTS, correctOption: greater ? 'A' : 'B',
          explanation: `The roots ${a} and ${b} split the number line into three intervals. The parabola opens upward, so it is ${greater ? 'POSITIVE outside the roots: x < ' + a + ' or x > ' + b : 'NEGATIVE between the roots: ' + a + ' < x < ' + b}. A sign chart or a test point in each interval confirms it.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        // Alternate a point OUTSIDE the roots (quotient positive) with one
        // BETWEEN them (negative) so the answer moves. t > a always gave Yes.
        const a = int(r, 1, 5);
        const inside = idx % 2 === 1;
        const t = inside ? 0 : a + int(r, 1, 3);
        const num = t - a, den = t + a;
        const val = num / den > 0;
        return { prompt: `Is x = ${t} in the solution set of (x − ${a})/(x + ${a}) > 0?`,
          value: val ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only if x is an integer', 'Cannot be determined'],
          correctOption: val ? 'A' : 'B',
          explanation: `Test it: (${t} − ${a})/(${t} + ${a}) = ${num}/${den}, which is ${val ? 'positive — so yes' : 'negative — so no. Between the critical points −' + a + ' and ' + a + ', the numerator and denominator disagree in sign'}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        // Alternate the boundary-point question: the denominator zero is
        // EXCLUDED, the numerator zero is INCLUDED under "\u2265". Asking only
        // the excluded case made every item the same concept with a different
        // number — string-varied, but pattern-matchable.
        const a = int(r, 1, 5);
        const OPTS = ['Yes — it makes the numerator zero, and equality is allowed',
          'No — it makes the denominator zero, so the expression has no value there',
          'No — boundary points are never included', 'Yes — every real number is included'];
        const askDenom = idx % 2 === 0;
        const point = askDenom ? -a : 2;
        return { prompt: `For (x − 2)/(x + ${a}) ≥ 0, is x = ${point} in the solution set?`,
          value: askDenom ? OPTS[1] : OPTS[0], options: OPTS, correctOption: askDenom ? 'B' : 'A',
          explanation: askDenom
            ? `x = ${-a} zeroes the DENOMINATOR, so the expression is undefined there — excluded no matter what the inequality sign allows.`
            : `x = 2 zeroes the NUMERATOR, making the expression equal 0, and "\u2265" allows equality — so it IS included. Only denominator zeros are barred.` };
      } },
    ],
  },

  {
    skillId: 'sum-difference-identities',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const forms = [
          ['sin(A + B)', 'sin A cos B + cos A sin B'],
          ['cos(A + B)', 'cos A cos B − sin A sin B'],
          ['sin(A − B)', 'sin A cos B − cos A sin B'],
          ['cos(A − B)', 'cos A cos B + sin A sin B'],
        ];
        const [lhs, rhs] = forms[idx % forms.length];
        const opts = [...new Set(forms.map((f) => f[1]))];
        return { prompt: `Which expression equals ${lhs}?`, value: rhs,
          options: opts, correctOption: 'ABCD'[opts.indexOf(rhs)],
          explanation: `${lhs} = ${rhs}. Watch the sign pattern: SINE keeps the sign between the terms matching the angle sign; COSINE flips it.` };
      } },
      { difficulty: 3, gen: (r) => {
        const [sa, ca] = pick(r, [[3, 4], [4, 3]]);           // sinA=sa/5, cosA=ca/5
        const [sb, cb] = pick(r, [[5, 12], [12, 5]]);         // sinB=sb/13, cosB=cb/13
        const num = ca * cb + sa * sb;
        return { prompt: `Given sin A = ${sa}/5, cos A = ${ca}/5, sin B = ${sb}/13, cos B = ${cb}/13 (all angles acute), find cos(A − B).`,
          value: frac(num, 65),
          explanation: `cos(A − B) = cos A cos B + sin A sin B = (${ca}/5)(${cb}/13) + (${sa}/5)(${sb}/13) = ${ca * cb}/65 + ${sa * sb}/65 = ${frac(num, 65)}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const [sa, ca] = pick(r, [[3, 4], [4, 3]]);
        const [sb, cb] = pick(r, [[5, 12], [12, 5]]);
        const num = sa * cb + ca * sb;
        return { prompt: `Given sin A = ${sa}/5, cos A = ${ca}/5, sin B = ${sb}/13, cos B = ${cb}/13 (all angles acute), find sin(A + B).`,
          value: frac(num, 65),
          explanation: `sin(A + B) = sin A cos B + cos A sin B = (${sa}/5)(${cb}/13) + (${ca}/5)(${sb}/13) = ${sa * cb}/65 + ${ca * sb}/65 = ${frac(num, 65)}.` };
      } },
    ],
  },

  {
    skillId: 'double-half-angle-formulas',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const forms = [
          ['sin 2θ', '2 sin θ cos θ'],
          ['cos 2θ', 'cos²θ − sin²θ'],
          ['cos 2θ (in sines only)', '1 − 2sin²θ'],
          ['cos 2θ (in cosines only)', '2cos²θ − 1'],
        ];
        const [lhs, rhs] = forms[idx % forms.length];
        const opts = [...new Set(forms.map((f) => f[1]))];
        return { prompt: `Which expression equals ${lhs}?`, value: rhs,
          options: opts, correctOption: 'ABCD'[opts.indexOf(rhs)],
          explanation: `${lhs} = ${rhs}. The three cosine forms are interchangeable via sin²θ + cos²θ = 1 — pick whichever fits the information you have.` };
      } },
      { difficulty: 3, gen: (r) => {
        const [s, c] = pick(r, [[3, 4], [4, 3], [5, 12], [12, 5]]);
        const h = s < 10 && c < 10 ? 5 : 13;
        const num = 2 * s * c;
        return { prompt: `Given sin θ = ${s}/${h} and cos θ = ${c}/${h}, find sin 2θ.`,
          value: frac(num, h * h),
          explanation: `sin 2θ = 2 sin θ cos θ = 2 · (${s}/${h}) · (${c}/${h}) = ${num}/${h * h} = ${frac(num, h * h)}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const [s, c] = pick(r, [[3, 4], [4, 3], [5, 12], [12, 5]]);
        const h = s < 10 && c < 10 ? 5 : 13;
        const num = c * c - s * s;
        return { prompt: `Given sin θ = ${s}/${h} and cos θ = ${c}/${h}, find cos 2θ.`,
          value: frac(num, h * h),
          explanation: `cos 2θ = cos²θ − sin²θ = (${c}/${h})² − (${s}/${h})² = ${c * c}/${h * h} − ${s * s}/${h * h} = ${frac(num, h * h)}. A negative result just means 2θ has passed 90°.` };
      } },
    ],
  },

  {
    skillId: 'ellipse-analysis',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const [b, , a] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
        return { prompt: `For the ellipse x²/${a * a} + y²/${b * b} = 1, what is the length of the MAJOR axis?`,
          value: 2 * a,
          explanation: `The larger denominator is ${a * a} = ${a}², under x², so the major axis is horizontal with a = ${a}. Its full length is 2a = ${2 * a}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const [b, c, a] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
        return { prompt: `For the ellipse x²/${a * a} + y²/${b * b} = 1, find c, the distance from the centre to each focus.`,
          value: c,
          explanation: `For an ellipse, c² = a² − b² = ${a * a} − ${b * b} = ${c * c}, so c = ${c}. The foci sit at (±${c}, 0), on the major axis. (For ellipses you SUBTRACT; hyperbolas add.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const [b, , a] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
        return { prompt: `The ellipse x²/${b * b} + y²/${a * a} = 1 has its larger denominator under y². Where are its VERTICES?`,
          value: `(0, ±${a})`,
          options: [`(0, ±${a})`, `(±${a}, 0)`, `(0, ±${b})`, `(±${b}, ±${a})`],
          correctOption: 'A',
          explanation: `The major axis follows the larger denominator — here vertical, with a = ${a}. The vertices are its endpoints: (0, ±${a}). The points (±${b}, 0) are the co-vertices on the minor axis.` };
      } },
    ],
  },

  {
    skillId: 'hyperbola-analysis',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = pick(r, [2, 3, 4, 5]);
        const b = pick(r, [2, 3, 4, 6]);
        return { prompt: `For the hyperbola x²/${a * a} − y²/${b * b} = 1, where are the VERTICES?`,
          value: `(±${a}, 0)`,
          options: [`(±${a}, 0)`, `(0, ±${a})`, `(±${b}, 0)`, `(0, ±${b})`],
          correctOption: 'A',
          explanation: `The positive term is the x-term, so the hyperbola opens left–right and the vertices sit at (±a, 0) = (±${a}, 0).` };
      } },
      { difficulty: 3, gen: (r) => {
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
        return { prompt: `For the hyperbola x²/${a * a} − y²/${b * b} = 1, find c, the distance from the centre to each focus.`,
          value: c,
          explanation: `For a hyperbola, c² = a² + b² = ${a * a} + ${b * b} = ${c * c}, so c = ${c}. Hyperbolas ADD (the foci lie beyond the vertices); ellipses subtract.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = pick(r, [2, 3, 4]), b = a * int(r, 2, 3);
        return { prompt: `What are the slopes of the asymptotes of x²/${a * a} − y²/${b * b} = 1?`,
          value: `±${b / a}`,
          explanation: `The asymptotes of this hyperbola are y = ±(b/a)x = ±(${b}/${a})x, so the slopes are ±${b / a}. The branches hug these lines as x grows.` };
      } },
    ],
  },

  {
    skillId: 'parametric-equations',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 6), b = int(r, 2, 5), t = int(r, 1, 5);
        return { prompt: `A curve is given by x = t + ${a}, y = ${b}t. What point corresponds to t = ${t}?`,
          value: `(${t + a}, ${b * t})`,
          explanation: `Substitute t = ${t} into each equation: x = ${t} + ${a} = ${t + a} and y = ${b}(${t}) = ${b * t}. The point is (${t + a}, ${b * t}).` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 6), b = int(r, 2, 5);
        return { prompt: `Eliminate the parameter: x = t + ${a}, y = ${b}t. Write y as a function of x.`,
          value: `y = ${b}(x − ${a})`,
          explanation: `Solve the x-equation for t: t = x − ${a}. Substitute into y: y = ${b}(x − ${a}). The parametric curve is this line, traced as t runs.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const k = int(r, 2, 6);
        if (idx % 2 === 0) {
          const OPTS = ['A circle', 'A line', 'A parabola', 'An ellipse'];
          return { prompt: `What curve do x = ${k}cos t, y = ${k}sin t trace as t runs from 0 to 2π?`,
            value: OPTS[0], options: OPTS, correctOption: 'A',
            explanation: `x² + y² = ${k}²cos²t + ${k}²sin²t = ${k}²(cos²t + sin²t) = ${k * k} — a circle of radius ${k} centred at the origin.` };
        }
        return { prompt: `The curve x = t², y = t traces a parabola. Eliminate the parameter and express x in terms of y.`,
          value: 'x = y²',
          explanation: `Since y = t, substitute t = y into x = t²: x = y². This parabola opens to the RIGHT — the roles of x and y are swapped from the familiar y = x².` };
      } },
    ],
  },

  {
    skillId: 'polar-coordinates',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const k = int(r, 2, 8);
        const cases = [
          [`(${k}, 0)`, `(${k}, 0)`, `θ = 0 points along the positive x-axis, so the point sits ${k} units right: (${k}, 0).`],
          [`(${k}, π/2)`, `(0, ${k})`, `θ = π/2 points straight up, so the point is ${k} units up the y-axis: (0, ${k}).`],
          [`(${k}, π)`, `(${-k}, 0)`, `θ = π points along the negative x-axis: (−${k}, 0).`],
          [`(${k}, 3π/2)`, `(0, ${-k})`, `θ = 3π/2 points straight down: (0, −${k}).`],
        ];
        const [pol, rect, why] = cases[idx % cases.length];
        return { prompt: `Convert the polar point ${pol} to rectangular coordinates.`, value: rect,
          explanation: `x = r cos θ and y = r sin θ. ${why}` };
      } },
      { difficulty: 3, gen: (r) => {
        const [x, y, c] = pick(r, TRIPLES);
        return { prompt: `Find r for the rectangular point (${x}, ${y}) in polar form.`,
          value: c,
          explanation: `r = √(x² + y²) = √(${x}² + ${y}²) = √(${x * x + y * y}) = ${c}. The ${x}-${y}-${c} right triangle makes it exact.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const k = int(r, 2, 7);
        if (idx % 2 === 0) {
          return { prompt: `Convert the polar equation r = ${k} to rectangular form.`,
            value: `x² + y² = ${k * k}`,
            explanation: `r = ${k} means every point is ${k} from the origin. Since r² = x² + y², squaring gives x² + y² = ${k * k} — a circle of radius ${k}.` };
        }
        const OPTS = ['A vertical line', 'A horizontal line', 'A circle', 'A ray from the origin'];
        return { prompt: `What is the graph of the polar equation θ = π/4?`,
          value: OPTS[3], options: OPTS, correctOption: 'D',
          explanation: `Fixing θ and letting r vary traces every point at angle π/4 — a ray from the origin at 45°. (With r allowed negative it extends to the full line.)` };
      } },
    ],
  },

  {
    skillId: 'polar-curves',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const k = int(r, 2, 6);
        const OPTS = ['A circle', 'A rose', 'A cardioid', 'A spiral'];
        const cases = [
          [`r = ${k}cos θ`, 'A circle', `r = a cos θ is a circle of diameter ${k} through the origin, centred at (${k}/2, 0). Multiply by r and convert: x² + y² = ${k}x.`],
          [`r = ${k}(1 + sin θ)`, 'A cardioid', `Equal coefficients on the constant and the sine are the cardioid signature — heart-shaped, cusp at the origin.`],
          [`r = ${k}cos(3θ)`, 'A rose', `A multiple of θ inside the cosine makes petals: with n = 3 (odd), the rose has 3 petals.`],
          [`r = ${k}θ`, 'A spiral', `r growing steadily with θ winds outward for ever — the spiral of Archimedes.`],
        ];
        const [eq, ans, why] = cases[idx % cases.length];
        return { prompt: `What kind of curve is ${eq}?`,
          value: ans, options: OPTS, correctOption: 'ABCD'[OPTS.indexOf(ans)], explanation: why };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const a = int(r, 2, 5);
        const n = [3, 5, 2, 4][idx % 4];
        const petals = n % 2 === 1 ? n : 2 * n;
        return { prompt: `How many petals does the rose r = ${a}cos(${n}θ) have?`,
          value: petals,
          explanation: `For r = a cos(nθ): an ODD n gives n petals, an EVEN n gives 2n. Here n = ${n} is ${n % 2 === 1 ? `odd, so ${petals} petals` : `even, so 2·${n} = ${petals} petals`}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const a = int(r, 2, 5);
        const OPTS = ['A cardioid', 'A circle', 'A rose with 4 petals', 'A lemniscate'];
        const cases = [
          [`r = ${a}(1 + cos θ)`, 'A cardioid', `Equal coefficients on the constant and cosine make the cardioid — heart-shaped, cusp at the origin.`],
          [`r² = ${a * a}cos(2θ)`, 'A lemniscate', `An r² equation with cos(2θ) traces the figure-eight lemniscate through the origin.`],
          [`r = ${a}sin θ`, 'A circle', `r = a sin θ is a circle of diameter ${a}, sitting on the origin, centred at (0, ${a}/2).`],
          [`r = ${a}cos(2θ)`, 'A rose with 4 petals', `cos(nθ) with EVEN n = 2 gives 2n = 4 petals.`],
        ];
        const [eq, ans, why] = cases[idx % cases.length];
        return { prompt: `What kind of curve is ${eq}?`,
          value: ans, options: OPTS, correctOption: 'ABCD'[OPTS.indexOf(ans)], explanation: why };
      } },
    ],
  },

  {
    skillId: 'complex-polar-form',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const [x, y, c] = pick(r, TRIPLES);
        return { prompt: `Find the modulus of the complex number ${x} + ${y}i.`,
          value: c,
          explanation: `|z| = √(a² + b²) = √(${x}² + ${y}²) = √(${x * x + y * y}) = ${c} — the distance from the origin in the complex plane.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const k = int(r, 2, 8);
        const cases = [
          [`${k}i`, 'π/2', `${k}i sits on the positive imaginary axis, straight up: argument π/2.`],
          [`−${k}`, 'π', `−${k} sits on the negative real axis: argument π.`],
          [`${k} + ${k}i`, 'π/4', `Equal real and imaginary parts put the point on the 45° line: argument π/4.`],
          [`${k}`, '0', `A positive real number lies on the positive real axis: argument 0.`],
        ];
        const [z, arg, why] = cases[idx % cases.length];
        const opts = ['0', 'π/4', 'π/2', 'π'];
        return { prompt: `What is the argument of ${z}?`, value: arg,
          options: opts, correctOption: 'ABCD'[opts.indexOf(arg)], explanation: why };
      } },
      { difficulty: 4, gen: (r) => {
        const m = int(r, 2, 6);
        return { prompt: `Write the complex number with modulus ${m} and argument π in rectangular form a + bi.`,
          value: `−${m}`,
          explanation: `z = r(cos θ + i sin θ) = ${m}(cos π + i sin π) = ${m}(−1 + 0i) = −${m}. Argument π points along the negative real axis.` };
      } },
    ],
  },

  {
    skillId: 'vector-representation',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const x1 = int(r, 1, 6), y1 = int(r, 1, 6), dx = int(r, 1, 6), dy = int(r, 1, 6);
        return { prompt: `Find the component form of the vector from P(${x1}, ${y1}) to Q(${x1 + dx}, ${y1 + dy}).`,
          value: `⟨${dx}, ${dy}⟩`,
          explanation: `Components are terminal minus initial: ⟨${x1 + dx} − ${x1}, ${y1 + dy} − ${y1}⟩ = ⟨${dx}, ${dy}⟩. Subtracting in the other order gives the OPPOSITE vector.` };
      } },
      { difficulty: 3, gen: (r) => {
        const [a, b, c] = pick(r, TRIPLES);
        return { prompt: `Find the magnitude of the vector ⟨${a}, ${b}⟩.`,
          value: c,
          explanation: `|v| = √(${a}² + ${b}²) = √(${a * a + b * b}) = ${c}.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
        if (idx % 2 === 0) {
          return { prompt: `Find a UNIT vector in the direction of ⟨${a}, ${b}⟩.`,
            value: `⟨${frac(a, c)}, ${frac(b, c)}⟩`,
            explanation: `Divide the vector by its magnitude ${c}: ⟨${a}/${c}, ${b}/${c}⟩ = ⟨${frac(a, c)}, ${frac(b, c)}⟩. Its length is exactly 1, direction unchanged.` };
        }
        return { prompt: `The vector ⟨${a}, ${b}⟩ is multiplied by −1. What is its new magnitude?`,
          value: c,
          explanation: `Negating a vector reverses its direction but keeps its length: the magnitude is still √(${a}² + ${b}²) = ${c}.` };
      } },
    ],
  },

  {
    skillId: 'vector-operations',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 6), b = int(r, 1, 6), c2 = int(r, 1, 6), d = int(r, 1, 6);
        return { prompt: `Compute ⟨${a}, ${b}⟩ + ⟨${c2}, ${d}⟩.`,
          value: `⟨${a + c2}, ${b + d}⟩`,
          explanation: `Add component-wise: ⟨${a} + ${c2}, ${b} + ${d}⟩ = ⟨${a + c2}, ${b + d}⟩. Tip-to-tail on a diagram gives the same result.` };
      } },
      { difficulty: 3, gen: (r) => {
        const k = int(r, 2, 5), a = int(r, 1, 6), b = int(r, 1, 6);
        return { prompt: `Compute ${k}⟨${a}, ${b}⟩.`,
          value: `⟨${k * a}, ${k * b}⟩`,
          explanation: `A scalar multiplies EACH component: ⟨${k}·${a}, ${k}·${b}⟩ = ⟨${k * a}, ${k * b}⟩ — same direction, ${k} times the length.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 7), b = int(r, 2, 7), c2 = int(r, 1, 5), d = int(r, 1, 5), k = int(r, 2, 4);
        return { prompt: `Compute ⟨${a}, ${b}⟩ − ${k}⟨${c2}, ${d}⟩.`,
          value: `⟨${a - k * c2}, ${b - k * d}⟩`,
          explanation: `Scale first: ${k}⟨${c2}, ${d}⟩ = ⟨${k * c2}, ${k * d}⟩. Then subtract component-wise: ⟨${a} − ${k * c2}, ${b} − ${k * d}⟩ = ⟨${a - k * c2}, ${b - k * d}⟩.` };
      } },
    ],
  },

  {
    skillId: 'dot-product',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 6), b = int(r, 1, 6), c2 = int(r, 1, 6), d = int(r, 1, 6);
        return { prompt: `Compute the dot product ⟨${a}, ${b}⟩ · ⟨${c2}, ${d}⟩.`,
          value: a * c2 + b * d,
          explanation: `Multiply matching components and add: ${a}·${c2} + ${b}·${d} = ${a * c2} + ${b * d} = ${a * c2 + b * d}. The result is a SCALAR, not a vector.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        const orth = idx % 2 === 0;
        const v2 = orth ? [`⟨${-b}, ${a}⟩`, -b * a + a * b] : [`⟨${b}, ${a}⟩`, 2 * a * b];
        return { prompt: `Are ⟨${a}, ${b}⟩ and ${v2[0]} orthogonal (perpendicular)?`,
          value: orth ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only in 3D', 'Cannot be determined'],
          correctOption: orth ? 'A' : 'B',
          explanation: `Vectors are orthogonal exactly when their dot product is 0. Here it is ${v2[1]}${orth ? ' = 0, so yes — perpendicular' : ', which is not 0, so no'}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 5);
        return { prompt: `Find k so that ⟨${a}, 2⟩ and ⟨2, k⟩ are orthogonal.`,
          value: -a,
          explanation: `Set the dot product to zero: ${a}·2 + 2k = 0, so 2k = −${2 * a} and k = −${a}.` };
      } },
    ],
  },

  {
    skillId: 'vector-projections',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 1, 6);
        return { prompt: `Find the scalar projection of ⟨${a}, ${b}⟩ onto the x-axis direction ⟨1, 0⟩.`,
          value: a,
          explanation: `Projection onto ⟨1, 0⟩ = (v · ⟨1,0⟩)/|⟨1,0⟩| = ${a}/1 = ${a} — simply the x-component. Projection extracts "how much of v points that way".` };
      } },
      { difficulty: 4, gen: (r) => {
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
        const u = int(r, 2, 5);
        const dot = a * u;
        // "Give your answer as a fraction" is only honest when the answer IS a
        // fraction — 15/5 = 3 asked "in lowest terms" invites a student to type
        // "3/1" and be marked wrong. Say it only when the division doesn't clear.
        const isWhole = dot % c === 0;
        return { prompt: `Find the scalar projection of ⟨${u}, 0⟩ onto ⟨${a}, ${b}⟩.${isWhole ? '' : ' Give your answer as a fraction in lowest terms.'}`,
          value: frac(dot, c),
          explanation: `comp = (u · v)/|v| = (${u}·${a} + 0·${b})/${c} = ${dot}/${c} = ${frac(dot, c)}. The magnitude ${c} comes from the ${a}-${b}-${c} triple.` };
      } },
    ],
  },

  {
    skillId: 'vector-applications',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const e = int(r, 2, 9) * 10, n2 = int(r, 2, 9) * 10;
        return { prompt: `A hiker walks ${e} m east, then ${n2} m north. What is the component form of the resultant displacement (east, north)?`,
          value: `⟨${e}, ${n2}⟩`,
          explanation: `East is the x-component and north the y-component, so the displacement is ⟨${e}, ${n2}⟩. Successive displacements ADD as vectors.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [9, 12, 15]]);
        if (idx % 2 === 0) {
          return { prompt: `A boat travels ${a * 10} m east and ${b * 10} m north. How far is it from its starting point?`,
            value: c * 10,
            explanation: `The straight-line distance is the magnitude: √(${a * 10}² + ${b * 10}²) = ${c * 10} m — the ${a}-${b}-${c} triple scaled by 10.` };
        }
        const f1 = int(r, 2, 8) * 10, f2 = int(r, 2, 8) * 10;
        return { prompt: `Two forces act on an object along the same line: ${f1} N east and ${f2} N west. What is the magnitude of the net force?`,
          value: Math.abs(f1 - f2),
          explanation: `Opposite directions subtract: |${f1} − ${f2}| = ${Math.abs(f1 - f2)} N, pointing ${f1 > f2 ? 'east' : f1 < f2 ? 'west' : 'nowhere — they balance'}.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
