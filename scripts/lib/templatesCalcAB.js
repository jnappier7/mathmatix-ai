'use strict';
/**
 * AP Calculus AB: top-ups for the THIN bank families plus the handful of
 * course skills no bank family covers at all.
 *
 * The calc bank is real but shallow — seeds/calc-items.generated.json and
 * calc-topup-items.generated.json are both seeded, yet most families hold
 * 1-8 items (chain-rule 2, optimization 1, average-value 1). Top-up items
 * here are keyed to the EXISTING bank ids so they extend those families —
 * the course reaches them through crosswalk rows — while the six skills
 * with no family anywhere (reference angles, differentiability vs
 * continuity, derivatives from tables, inverse-trig derivatives,
 * higher-order derivatives, antiderivatives, error analysis) get new
 * families under their course ids.
 *
 * Number design: polynomials keep integer coefficients and are evaluated
 * at small integers; linearization sits next to perfect squares; related
 * rates use 3-4-5 ladders; u-substitution draws powers whose antiderivative
 * divides cleanly; average values integrate to whole numbers. Answers are
 * computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

// Render a leading coefficient: 1x² prints as x².
const co = (n) => (n === 1 ? '' : String(n));

const GB = '11-12';

const TEMPLATES = [
  // ── Top-ups of thin bank families (keyed to the BANK id) ────────────────
  {
    skillId: 'limits-at-infinity',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        if (made % 2 === 0) {
          return { prompt: `Evaluate: the limit as x → ∞ of (${a}x² + ${int(r, 1, 9)}x)/(${b}x² + ${int(r, 1, 9)}).`,
            value: K.frac(a, b),
            explanation: `Same degree top and bottom, so the limit is the ratio of leading coefficients: ${a}/${b}${a % b === 0 ? ` = ${a / b}` : ''} = ${K.frac(a, b)}. The lower-order terms vanish relative to x².` };
        }
        return { prompt: `Evaluate: the limit as x → ∞ of (${a}x + ${int(r, 1, 9)})/(${b}x² + ${int(r, 1, 9)}x).`,
          value: 0,
          explanation: `The denominator's degree (2) beats the numerator's (1), so the fraction is squeezed to 0: dividing top and bottom by x² leaves ${a}/x → 0 over ${b}.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const a = int(r, 2, 7), b = int(r, 2, 7);
        if (made % 2 === 0) {
          return { prompt: `The function f(x) = (${a}x² + 1)/(${b}x + ${int(r, 1, 5)}) — as x → ∞, does f(x) approach a finite limit?`,
            value: 'No',
            options: ['No', 'Yes', 'Only from the left', 'Only for x < 0'],
            correctOption: 'A',
            explanation: `The numerator's degree (2) beats the denominator's (1), so f grows without bound — the limit is ∞, not a finite number. Degree comparison decides every rational limit at infinity.` };
        }
        return { prompt: `What is the horizontal asymptote of y = (${a}x² − ${int(r, 1, 9)})/(${b}x² + ${int(r, 1, 9)}x)?`,
          value: `y = ${K.frac(a, b)}`,
          explanation: `Equal degrees give a horizontal asymptote at the ratio of leading coefficients: y = ${a}/${b} = ${K.frac(a, b)}. The limit at ∞ and the horizontal asymptote are the same fact.` };
      } },
    ],
  },

  {
    skillId: 'ivt-squeeze',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const a = int(r, 1, 4), b = a + int(r, 2, 4);
        const fa = -int(r, 2, 9), fb = int(r, 2, 9);
        if (made % 2 === 0) {
          return { prompt: `f is continuous on [${a}, ${b}] with f(${a}) = ${fa} and f(${b}) = ${fb}. Must f have a zero in (${a}, ${b})?`,
            value: 'Yes',
            options: ['Yes', 'No', 'Only if f is increasing', 'Only if f is a polynomial'],
            correctOption: 'A',
            explanation: `The Intermediate Value Theorem: a continuous function that goes from ${fa} (negative) to ${fb} (positive) must pass through every value between — including 0. Continuity is the only hypothesis needed.` };
        }
        return { prompt: `f is continuous on [${a}, ${b}] with f(${a}) = ${-fa} and f(${b}) = ${fb}. Does the IVT guarantee a zero of f in (${a}, ${b})?`,
          value: 'No',
          options: ['No', 'Yes', 'Only at the midpoint', 'The IVT never applies on closed intervals'],
          correctOption: 'A',
          explanation: `Both endpoint values (${-fa} and ${fb}) are positive, so 0 is not BETWEEN them — the IVT guarantees only the values between f(${a}) and f(${b}). A zero may still exist, but nothing forces one.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const L = int(r, 1, 6);
        if (made % 2 === 0) {
          return { prompt: `For x near 0, g satisfies ${L} − x² ≤ g(x) ≤ ${L} + x². What is the limit of g(x) as x → 0?`,
            value: L,
            explanation: `Both bounds approach ${L} as x → 0, and g is trapped between them — the Squeeze Theorem forces g to the same limit: ${L}.` };
        }
        const c = int(r, 2, 5);
        return { prompt: `Evaluate the limit as x → 0 of x² · sin(${c}/x).`,
          value: 0,
          explanation: `sin(${c}/x) oscillates but stays in [−1, 1], so −x² ≤ x²sin(${c}/x) ≤ x². Both bounds go to 0, and the Squeeze Theorem drags the product to 0 with them — even though sin(${c}/x) itself has no limit.` };
      } },
    ],
  },

  {
    skillId: 'derivative-definition',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 6);
        return { prompt: `Using the limit definition, the difference quotient for f(x) = x² at x = ${a} simplifies to ${2 * a} + h. What is f′(${a})?`,
          value: 2 * a,
          explanation: `f′(${a}) is the limit of the difference quotient as h → 0: (${2 * a} + h) → ${2 * a}. The definition and the power rule agree: f′(x) = 2x gives 2 · ${a} = ${2 * a}.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const a = int(r, 2, 7), c = int(r, 1, 9);
        if (made % 2 === 0) {
          return { prompt: `Simplify the difference quotient [f(x + h) − f(x)]/h for f(x) = ${a}x + ${c}.`,
            value: a,
            explanation: `f(x + h) − f(x) = ${a}(x + h) + ${c} − (${a}x + ${c}) = ${a}h. Dividing by h leaves ${a} — constant, because a line's slope is the same everywhere. No limit is even needed.` };
        }
        const n = int(r, 2, 5);
        return { prompt: `The limit as h → 0 of [(${n} + h)² − ${n * n}]/h is the derivative of which function, at which point?`,
          value: `x² at x = ${n}`,
          options: [`x² at x = ${n}`, `x² at x = ${n * n}`, `2x at x = ${n}`, `x² at x = h`],
          correctOption: 'A',
          explanation: `Match the pattern [f(a + h) − f(a)]/h: here f(x) = x² and a = ${n}, so this limit IS f′(${n}) = ${2 * n}. Recognizing the definition in disguise is a standard AP move.` };
      } },
    ],
  },

  {
    skillId: 'chain-rule',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 1, 7), n = pick(r, [3, 4, 5]);
        return { prompt: `Differentiate: y = (${a}x + ${b})${n === 3 ? '³' : n === 4 ? '⁴' : '⁵'}.`,
          value: `${n * a}(${a}x + ${b})${n === 3 ? '²' : n === 4 ? '³' : '⁴'}`,
          explanation: `Chain rule: bring down the exponent, lower it by one, then multiply by the INNER derivative ${a}: ${n}(${a}x + ${b})^${n - 1} · ${a} = ${n * a}(${a}x + ${b})^${n - 1}. Forgetting the inner ${a} is the classic error.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const k = int(r, 2, 6);
          return { prompt: `Differentiate: y = sin(${k}x).`,
            value: `${k}cos(${k}x)`,
            explanation: `The outer function sin becomes cos, and the chain rule multiplies by the inner derivative ${k}: y′ = cos(${k}x) · ${k} = ${k}cos(${k}x).` };
        }
        const a = int(r, 2, 5), n = int(r, 2, 4);
        const f1 = int(r, 1, 5);
        return { prompt: `g(x) = f(${a}x) where f′(${a * n}) = ${f1}. Using the chain rule, what is g′(${n})?`,
          value: f1 * a,
          explanation: `g′(x) = f′(${a}x) · ${a}. At x = ${n}: g′(${n}) = f′(${a * n}) · ${a} = ${f1} · ${a} = ${f1 * a}. The chain rule evaluates the outer derivative at the INNER value ${a}·${n} = ${a * n}, then multiplies by the inner rate ${a}.` };
      } },
    ],
  },

  {
    skillId: 'related-rates',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const s = int(r, 3, 9), rate = int(r, 2, 6);
        return { prompt: `Each side of a square is growing at ${rate} cm/s. How fast is the AREA growing when the side is ${s} cm? (cm²/s)`,
          value: 2 * s * rate,
          explanation: `A = s², so dA/dt = 2s · ds/dt. At s = ${s} with ds/dt = ${rate}: dA/dt = 2 · ${s} · ${rate} = ${2 * s * rate} cm²/s. Differentiate the RELATION first, then substitute the moment's values.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
          const rate = int(r, 1, 3);
          return { prompt: `A ${c} m ladder leans against a wall. Its base, ${a} m from the wall, slides away at ${rate} m/s. How fast is the top sliding DOWN the wall at that moment? (m/s)`,
            value: K.frac(a * rate, b),
            explanation: `x² + y² = ${c}², so 2x·dx/dt + 2y·dy/dt = 0, giving dy/dt = −(x/y)·dx/dt. With x = ${a}, y = √(${c}² − ${a}²) = ${b} (the ${a}-${b}-${c} triple): dy/dt = −(${a}/${b}) · ${rate} → sliding down at ${K.frac(a * rate, b)} m/s.` };
        }
        const rate = pick(r, [8, 12, 16, 20]), x = pick(r, [2, 4]);
        return { prompt: `A cube's volume grows at ${rate} cm³/s. How fast is its side length growing when the side is ${x} cm? (cm/s)`,
          value: K.frac(rate, 3 * x * x),
          explanation: `V = s³, so dV/dt = 3s² · ds/dt. Solve for ds/dt = ${rate}/(3 · ${x}²) = ${rate}/${3 * x * x} = ${K.frac(rate, 3 * x * x)} cm/s. The same relation-first, substitute-second discipline as every related-rates problem.` };
      } },
    ],
  },

  {
    skillId: 'motion',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 4), b = int(r, 2, 9), t = int(r, 1, 4);
        return { prompt: `A particle's position is s(t) = ${co(a)}t² + ${b}t (meters, seconds). What is its velocity at t = ${t}?`,
          value: 2 * a * t + b,
          explanation: `Velocity is the derivative of position: v(t) = ${2 * a}t + ${b}. At t = ${t}: v = ${2 * a} · ${t} + ${b} = ${2 * a * t + b} m/s.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const b = pick(r, [6, 12, 18, 24]), t0 = int(r, 1, 4);
          const a3 = b / 6; // s = a3 t³ − ... choose s(t)= a3 t³ − b t so v = 3a3 t² − b = 0 at t² = b/(3a3)=2... keep simpler
          const c = 3 * a3 * t0 * t0; // v(t) = 3a3 t² − c zeroes at t0
          return { prompt: `A particle moves with velocity v(t) = ${3 * a3}t² − ${c}. At what positive time t is the particle AT REST?`,
            value: t0,
            explanation: `At rest means v = 0: ${3 * a3}t² = ${c}, so t² = ${c / (3 * a3)} and t = ${t0} (taking the positive root). Setting velocity to zero is the first step of nearly every AP motion part.` };
        }
        const a = int(r, 1, 3), t = int(r, 1, 5);
        return { prompt: `A particle's velocity is v(t) = ${co(a)}t² (m/s). What is its ACCELERATION at t = ${t}?`,
          value: 2 * a * t,
          explanation: `Acceleration is the derivative of velocity: a(t) = ${2 * a}t, so at t = ${t} it is ${2 * a} · ${t} = ${2 * a * t} m/s². Position → velocity → acceleration is one derivative each.` };
      } },
    ],
  },

  {
    skillId: 'linearization',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const k = pick(r, [4, 9, 16, 25, 36, 49, 64, 81, 100]);
        const root = Math.sqrt(k);
        const dx = pick(r, [1, 2]);
        const bump = K.frac(dx, 2 * root); // always in lowest terms — "8 + 2/16" is not an answer to ship
        return { prompt: `Use the linearization of f(x) = √x at x = ${k} to estimate √${k + dx}. Give your answer as a whole number plus a fraction.`,
          value: `${root} + ${bump}`,
          explanation: `L(x) = f(${k}) + f′(${k})(x − ${k}) = ${root} + (x − ${k})/(2·${root}). At x = ${k + dx}: ${root} + ${dx}/${2 * root} = ${root} + ${bump}. The tangent line stands in for the curve close to the point of tangency.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 4), b = int(r, 1, 6), x0 = int(r, 1, 4);
        const f0 = a * x0 * x0 + b, s = 2 * a * x0;
        return { prompt: `Find the equation of the tangent line to y = ${co(a)}x² + ${b} at x = ${x0}.`,
          value: `y = ${s}x ${f0 - s * x0 >= 0 ? '+' : '−'} ${Math.abs(f0 - s * x0)}`,
          explanation: `Point: (${x0}, ${f0}). Slope: y′ = ${2 * a}x gives ${s} at x = ${x0}. Point-slope: y − ${f0} = ${s}(x − ${x0}), which simplifies to y = ${s}x ${f0 - s * x0 >= 0 ? '+' : '−'} ${Math.abs(f0 - s * x0)}. The tangent line IS the linearization.` };
      } },
    ],
  },

  {
    skillId: 'mvt-evt',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = 0, b = int(r, 2, 6);
        const fb = b * b;
        return { prompt: `f(x) = x² on [${a}, ${b}]. The Mean Value Theorem guarantees a c where f′(c) equals the average rate of change. Find c.`,
          value: K.frac(b, 2),
          explanation: `Average rate: (f(${b}) − f(0))/(${b} − 0) = ${fb}/${b} = ${b}. Set f′(c) = 2c = ${b}: c = ${K.frac(b, 2)}. For a parabola the MVT point always lands at the interval's midpoint.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'The Extreme Value Theorem guarantees a continuous function on a CLOSED interval [a, b] attains what?',
            value: 'Both an absolute maximum and an absolute minimum',
            options: ['Both an absolute maximum and an absolute minimum', 'Only an absolute maximum', 'A zero somewhere in (a, b)', 'A horizontal tangent somewhere in (a, b)'],
            correctOption: 'A',
            explanation: 'Continuity on a closed, bounded interval forces both extremes to be attained — the function cannot run off to infinity or leave a gap. Open intervals lose the guarantee: y = 1/x on (0, 1) has neither.' };
        }
        return { prompt: 'Which hypothesis of the Mean Value Theorem does f(x) = |x| fail on [−1, 1]?',
          value: 'Differentiability on the open interval',
          options: ['Differentiability on the open interval', 'Continuity on the closed interval', 'f(−1) = f(1)', 'Boundedness'],
          correctOption: 'A',
          explanation: '|x| is continuous everywhere but has a corner at x = 0 — no derivative there. And indeed no c satisfies f′(c) = (f(1) − f(−1))/2 = 0, since the slope is ±1 everywhere else. The hypotheses are not decorative.' };
      } },
    ],
  },

  {
    skillId: 'concavity-inflection',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 3), b = int(r, 1, 5);
        const x0 = b; // f = a x³ − 3ab x² → f'' = 6a x − 6ab zero at x = b
        return { prompt: `f(x) = ${co(a)}x³ − ${3 * a * b}x² + ${int(r, 1, 9)}x. At what x-value does f have an inflection point?`,
          value: x0,
          explanation: `f″(x) = ${6 * a}x − ${6 * a * b}, which is zero at x = ${b} and CHANGES SIGN there (negative before, positive after) — so concavity flips from down to up at x = ${b}. A zero of f″ alone is not enough; the sign change is what makes it an inflection point.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const c = int(r, 2, 8);
        if (made % 2 === 0) {
          return { prompt: `f″(x) = ${c} for all x (a positive constant). What is the concavity of f?`,
            value: 'Concave up everywhere',
            options: ['Concave up everywhere', 'Concave down everywhere', 'Concave up only for x > 0', 'f has an inflection point at 0'],
            correctOption: 'A',
            explanation: `f″ > 0 everywhere means the slope f′ is always increasing — the graph bends upward everywhere, like a cup. No sign change in f″ means no inflection point anywhere.` };
        }
        return { prompt: `f″(x) = −${c} for all x. What is the concavity of f?`,
          value: 'Concave down everywhere',
          options: ['Concave down everywhere', 'Concave up everywhere', 'Concave down only for x > 0', 'f has an inflection point at 0'],
          correctOption: 'A',
          explanation: `f″ < 0 everywhere means the slope is always decreasing — the graph bends downward everywhere, like a dome. Constant-sign f″ rules out inflection points entirely.` };
      } },
    ],
  },

  {
    skillId: 'optimization',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const S = 2 * int(r, 5, 15);
        const half = S / 2;
        return { prompt: `Two positive numbers add to ${S}. What is the LARGEST their product can be?`,
          value: half * half,
          explanation: `Maximize P = x(${S} − x) = ${S}x − x². P′ = ${S} − 2x = 0 at x = ${half}, and P″ = −2 < 0 confirms a maximum: P = ${half} · ${half} = ${half * half}. Splitting evenly always maximizes a fixed-sum product.` };
      } },
      { difficulty: 4, gen: (r) => {
        const P = 8 * int(r, 2, 6); // side = P/4 even, so the half-side distractor stays whole
        const side = P / 4;
        return { prompt: `A rectangle has perimeter ${P}. What dimensions maximize its area, and what is that area?`,
          value: `${side} by ${side}, area ${side * side}`,
          options: [`${side} by ${side}, area ${side * side}`, `${side + 1} by ${side - 1}, area ${(side + 1) * (side - 1)}`, `${2 * side} by ${side}, area ${2 * side * side}`, `${side / 2} by ${side}, area ${(side / 2) * side}`],
          correctOption: 'A',
          explanation: `With w + l = ${P / 2}, area A = w(${P / 2} − w). A′ = ${P / 2} − 2w = 0 at w = ${side}, so l = ${side} too — the square wins, with area ${side * side}. (Note ${side + 1} × ${side - 1} = ${(side + 1) * (side - 1)}, strictly less — nudging away from square always loses area.)` };
      } },
    ],
  },

  {
    skillId: 'u-substitution',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), n = pick(r, [2, 3]);
        // ∫ (ax+b)^n · a dx = (ax+b)^{n+1}/(n+1); present with the a already inside
        const b = int(r, 1, 7);
        return { prompt: `Evaluate the indefinite integral: ∫ ${a}(${a}x + ${b})${n === 2 ? '²' : '³'} dx (in terms of u = ${a}x + ${b}).`,
          value: `(${a}x + ${b})${n === 2 ? '³' : '⁴'}/${n + 1} + C`,
          explanation: `Let u = ${a}x + ${b}, so du = ${a} dx — the ${a} in front is exactly du's factor. The integral becomes ∫ u^${n} du = u^${n + 1}/${n + 1} + C = (${a}x + ${b})^${n + 1}/${n + 1} + C.` };
      } },
      { difficulty: 4, gen: (r) => {
        const k = int(r, 2, 6);
        return { prompt: `Evaluate: ∫ 2x·cos(x² + ${k}) dx.`,
          value: `sin(x² + ${k}) + C`,
          explanation: `Let u = x² + ${k}: du = 2x dx, and the 2x is sitting right there. The integral becomes ∫ cos(u) du = sin(u) + C = sin(x² + ${k}) + C. Spotting the inner function's derivative as a factor is the whole art of u-substitution.` };
      } },
    ],
  },

  {
    skillId: 'slope-fields',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const x0 = int(r, 1, 4), y0 = int(r, 1, 4);
        return { prompt: `A slope field is drawn for dy/dx = x + y. What slope does the segment at the point (${x0}, ${y0}) have?`,
          value: x0 + y0,
          explanation: `A slope field just evaluates the differential equation at each point: at (${x0}, ${y0}), dy/dx = ${x0} + ${y0} = ${x0 + y0}. Every little segment is the tangent slope a solution curve would have passing through that point.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'In a slope field for dy/dx = y, every segment along the x-axis (where y = 0) is ___.',
            value: 'Horizontal',
            options: ['Horizontal', 'Vertical', 'Slope 1', 'Undefined'],
            correctOption: 'A',
            explanation: 'On the x-axis, y = 0, so dy/dx = 0 — flat segments all along it. In fact y = 0 is itself an equilibrium solution: a curve starting there never leaves.' };
        }
        const k = int(r, 2, 5);
        return { prompt: `In a slope field for dy/dx = ${k}x, where are the segments HORIZONTAL?`,
          value: 'Along the y-axis (x = 0)',
          options: ['Along the y-axis (x = 0)', 'Along the x-axis (y = 0)', 'Along the line y = x', 'Nowhere'],
          correctOption: 'A',
          explanation: `Horizontal means dy/dx = 0: here ${k}x = 0 exactly when x = 0, the y-axis. The slope depends only on x, so segments are identical up and down every vertical line.` };
      } },
    ],
  },

  {
    skillId: 'separable-des',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const k = int(r, 2, 6), y0 = int(r, 2, 8);
        return { prompt: `Solve the initial value problem: dy/dx = ${k}y, y(0) = ${y0}.`,
          value: `y = ${y0}e^(${k}x)`,
          explanation: `Separate: dy/y = ${k} dx. Integrate: ln|y| = ${k}x + C, so y = Ae^(${k}x). The initial condition y(0) = ${y0} pins A = ${y0}: y = ${y0}e^(${k}x). Proportional growth is always an exponential.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = pick(r, [2, 4, 6, 8]), y0 = int(r, 1, 5);
        const c = y0 * y0;
        return { prompt: `Solve: dy/dx = ${a}x/y with y(0) = ${y0} (take y > 0).`,
          value: `y = √(${a}x² + ${c})`,
          explanation: `Separate: y dy = ${a}x dx. Integrate both sides: y²/2 = ${a / 2}x² + C₁, so y² = ${a}x² + C. From y(0) = ${y0}: C = ${c}. Then y = √(${a}x² + ${c}), keeping the positive root to match the initial condition.` };
      } },
    ],
  },

  {
    skillId: 'average-value',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const m = 2 * int(r, 1, 4), b0 = int(r, 1, 8), L = int(r, 2, 6);
        const avg = (m * L) / 2 + b0;
        return { prompt: `Find the average value of f(x) = ${m}x + ${b0} on [0, ${L}].`,
          value: avg,
          explanation: `Average value = (1/${L}) ∫₀^${L} (${m}x + ${b0}) dx = (1/${L})(${(m / 2)}·${L}² + ${b0}·${L}) = ${avg}. For a LINE this is just the average of the endpoint values: (f(0) + f(${L}))/2 = (${b0} + ${m * L + b0})/2 = ${avg}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const L = pick(r, [3, 6, 9, 12]); // ∫ x² on [0, L] = L³/3, so the average L²/3 is whole
        const avg = (L * L) / 3;
        return { prompt: `Find the average value of f(x) = x² on [0, ${L}].`,
          value: avg,
          explanation: `Average value = (1/${L}) ∫₀^${L} x² dx = (1/${L}) · ${L}³/3 = ${L}²/3 = ${avg}. Note it is NOT f at the midpoint (${(L / 2) * (L / 2)}) — a curve's average weights its values differently than a line's.` };
      } },
    ],
  },

  {
    skillId: 'motion-integrals',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = 2 * int(r, 1, 4), T = int(r, 2, 5);
        const disp = (a / 2) * T * T;
        return { prompt: `A particle's velocity is v(t) = ${a}t (m/s). What is its DISPLACEMENT from t = 0 to t = ${T}?`,
          value: disp,
          explanation: `Displacement is the integral of velocity: ∫₀^${T} ${a}t dt = ${a / 2}t² │₀^${T} = ${disp} m. Geometrically it is the area of the triangle under v(t).` };
      } },
      { difficulty: 4, gen: (r) => {
        const t0 = int(r, 1, 3); const T = 2 * t0;
        const k = int(r, 1, 3);
        // v = k(t − t0): negative before t0, positive after; over [0, 2t0] displacement 0, distance 2·(k t0²/2)
        const dist = k * t0 * t0;
        return { prompt: `v(t) = ${co(k)}(t − ${t0}) on [0, ${T}]. The particle's displacement over the interval is 0. What TOTAL DISTANCE does it travel?`,
          value: dist,
          explanation: `Distance integrates |v|: the particle moves backward on [0, ${t0}] and forward on [${t0}, ${T}], each leg covering ${k}·${t0}²/2 = ${(k * t0 * t0) / 2}. Total distance = ${dist}, even though the trips cancel to displacement 0. Distance uses |v|; displacement uses v.` };
      } },
    ],
  },

  // ── New families for course skills with no bank family anywhere ──────────
  {
    skillId: 'reference-angles-quadrants',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { th: 150, ref: 30, q: 'II' }, { th: 210, ref: 30, q: 'III' },
          { th: 330, ref: 30, q: 'IV' }, { th: 135, ref: 45, q: 'II' },
          { th: 225, ref: 45, q: 'III' }, { th: 315, ref: 45, q: 'IV' },
          { th: 120, ref: 60, q: 'II' }, { th: 240, ref: 60, q: 'III' },
        ];
        const c = CASES[made % CASES.length];
        if (made % 2 === 0) {
          return { prompt: `What is the reference angle of ${c.th}°?`,
            value: c.ref,
            explanation: `${c.th}° lands in Quadrant ${c.q}. The reference angle is the acute angle to the x-axis: ${c.q === 'II' ? `180 − ${c.th} = ${c.ref}` : c.q === 'III' ? `${c.th} − 180 = ${c.ref}` : `360 − ${c.th} = ${c.ref}`}°. Every trig value of ${c.th}° is ±(the same value at ${c.ref}°).` };
        }
        return { prompt: `In which quadrant does an angle of ${c.th}° (standard position) terminate?`,
          value: c.q,
          options: ['I', 'II', 'III', 'IV'],
          correctOption: 'ABCD'['I II III IV'.split(' ').indexOf(c.q)],
          explanation: `Quadrant I is 0–90°, II is 90–180°, III is 180–270°, IV is 270–360°. ${c.th}° falls in Quadrant ${c.q}.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { fn: 'sin', q: 'II', sign: 'Positive' }, { fn: 'cos', q: 'II', sign: 'Negative' },
          { fn: 'tan', q: 'III', sign: 'Positive' }, { fn: 'sin', q: 'III', sign: 'Negative' },
          { fn: 'cos', q: 'IV', sign: 'Positive' }, { fn: 'sin', q: 'IV', sign: 'Negative' },
          { fn: 'tan', q: 'II', sign: 'Negative' }, { fn: 'cos', q: 'III', sign: 'Negative' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: `Is ${c.fn} θ positive or negative for an angle θ in Quadrant ${c.q}?`,
          value: c.sign,
          options: ['Positive', 'Negative', 'Zero', 'It depends on the reference angle'],
          correctOption: c.sign === 'Positive' ? 'A' : 'B',
          explanation: `ASTC ("All Students Take Calculus"): Quadrant I — all positive; II — sin only; III — tan only; IV — cos only. In Quadrant ${c.q}, ${c.fn} is ${c.sign.toLowerCase()}. The reference angle sets the VALUE; the quadrant sets the SIGN.` };
      } },
    ],
  },

  {
    skillId: 'differentiability-vs-continuity',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'f(x) = |x| at x = 0 is ___.', a: 'Continuous but not differentiable',
            e: 'The graph connects (continuous) but has a CORNER at 0 — the slope jumps from −1 to +1, so no single tangent slope exists. Corners break differentiability, not continuity.' },
          { q: 'If f is differentiable at x = a, then f must be ___ at a.', a: 'Continuous',
            e: 'Differentiability is the stronger condition: a function with a derivative at a point cannot jump there. The converse fails — |x| is continuous at 0 without being differentiable.' },
          { q: 'f(x) = x^(1/3) (cube root) at x = 0 is ___.', a: 'Continuous but not differentiable',
            e: 'The cube-root curve passes smoothly THROUGH 0 (continuous), but its tangent there is VERTICAL — the slope grows without bound, so f′(0) does not exist. Vertical tangents break differentiability too.' },
          { q: 'A function with a jump discontinuity at x = a is ___ at a.', a: 'Neither continuous nor differentiable',
            e: 'A jump breaks continuity outright, and differentiability requires continuity — so both fail. Every differentiable point is continuous; every discontinuous point is non-differentiable.' },
        ];
        const c = CASES[made % CASES.length];
        const opts = ['Continuous but not differentiable', 'Differentiable but not continuous', 'Continuous', 'Neither continuous nor differentiable'];
        const useOpts = c.a === 'Continuous' ? ['Continuous', 'Discontinuous', 'Non-differentiable somewhere else', 'Constant'] : opts;
        return { prompt: c.q, value: c.a, options: useOpts,
          correctOption: 'ABCD'[useOpts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'True or false: there exists a function that is differentiable at a point but not continuous there.',
            value: 'False',
            options: ['False', 'True'],
            correctOption: 'A',
            explanation: 'Impossible: the limit defining f′(a) forces f(x) → f(a). Differentiable ⟹ continuous, always. The one-way arrow (and |x| as the counterexample to the converse) is a favorite AP conceptual question.' };
        }
        return { prompt: 'A graph has a sharp corner at x = 2 but no break. At x = 2 the function is:',
          value: 'Continuous but not differentiable',
          options: ['Continuous but not differentiable', 'Differentiable but not continuous', 'Neither', 'Both'],
          correctOption: 'A',
          explanation: 'No break means continuous. A corner means the left and right slopes disagree, so the two-sided derivative limit does not exist. Corner, cusp, vertical tangent, discontinuity — the four ways differentiability dies.' };
      } },
    ],
  },

  {
    skillId: 'derivatives-from-graphs-tables',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const x1 = int(r, 1, 4), dx = pick(r, [1, 2]);
        const f1 = int(r, 2, 10);
        const slope = int(r, 2, 6);
        const f2 = f1 + slope * dx;
        return { prompt: `A table gives f(${x1}) = ${f1} and f(${x1 + dx}) = ${f2}. Use the values to estimate f′(${x1}) with a difference quotient.`,
          value: slope,
          explanation: `f′(${x1}) ≈ [f(${x1 + dx}) − f(${x1})]/(${x1 + dx} − ${x1}) = (${f2} − ${f1})/${dx} = ${slope}. With only a table, the difference quotient over the smallest available interval is the estimate.` };
      } },
      { difficulty: 4, gen: (r) => {
        const x0 = int(r, 2, 5);
        const fm = int(r, 3, 9), slope = int(r, 1, 5);
        const fp = fm + 2 * slope;
        return { prompt: `A table gives f(${x0 - 1}) = ${fm}, and f(${x0 + 1}) = ${fp}. Estimate f′(${x0}) using the symmetric (centered) difference quotient.`,
          value: slope,
          explanation: `Centered estimate: [f(${x0 + 1}) − f(${x0 - 1})]/[(${x0 + 1}) − (${x0 - 1})] = (${fp} − ${fm})/2 = ${slope}. Straddling the point usually beats a one-sided quotient — the AP exam expects the centered form when both neighbors are given.` };
      } },
    ],
  },

  {
    skillId: 'inverse-trig-derivatives',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'What is the derivative of arcsin(x)?', a: '1/√(1 − x²)',
            opts: ['1/√(1 − x²)', '−1/√(1 − x²)', '1/(1 + x²)', '1/√(x² − 1)'],
            e: 'd/dx arcsin(x) = 1/√(1 − x²). Its graph has vertical tangents at x = ±1, which is exactly where the formula blows up.' },
          { q: 'What is the derivative of arctan(x)?', a: '1/(1 + x²)',
            opts: ['1/(1 + x²)', '1/√(1 − x²)', '−1/(1 + x²)', 'sec²(x)'],
            e: 'd/dx arctan(x) = 1/(1 + x²) — always positive (arctan always increases) and approaching 0 as x → ±∞ (the curve flattens toward its horizontal asymptotes).' },
          { q: 'What is the derivative of arccos(x)?', a: '−1/√(1 − x²)',
            opts: ['−1/√(1 − x²)', '1/√(1 − x²)', '−1/(1 + x²)', '−sin(x)'],
            e: 'd/dx arccos(x) = −1/√(1 − x²) — the negative of arcsin′, because arccos(x) = π/2 − arcsin(x). Arccos always decreases, hence the sign.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const denom = pick(r, [2, 5, 10, 17]); // 1 + x² at x = 1, 2, 3, 4
          const x0 = Math.round(Math.sqrt(denom - 1));
          return { prompt: `Evaluate the derivative of arctan(x) at x = ${x0}.`,
            value: `1/${denom}`,
            explanation: `d/dx arctan(x) = 1/(1 + x²). At x = ${x0}: 1/(1 + ${x0 * x0}) = 1/${denom}.` };
        }
        const k = pick(r, [2, 3, 5]);
        return { prompt: `Differentiate y = arctan(${k}x).`,
          value: `${k}/(1 + ${k * k}x²)`,
          explanation: `Chain rule on arctan: y′ = 1/(1 + (${k}x)²) · ${k} = ${k}/(1 + ${k * k}x²). The inner derivative ${k} multiplies, and the inner function gets squared inside the denominator.` };
      } },
    ],
  },

  {
    skillId: 'higher-order-derivatives',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 4), b = int(r, 1, 6), c = int(r, 1, 9);
        return { prompt: `f(x) = ${co(a)}x³ + ${co(b)}x² + ${c}x. Find f″(x).`,
          value: `${6 * a}x + ${2 * b}`,
          explanation: `Differentiate twice: f′(x) = ${3 * a}x² + ${2 * b}x + ${c}, then f″(x) = ${6 * a}x + ${2 * b}. Each pass drops the degree by one; the linear term's constant ${c} dies on the second pass.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 1, 3), x0 = int(r, 1, 4);
          return { prompt: `f(x) = ${co(a)}x⁴. Evaluate f‴(${x0}) (the third derivative at x = ${x0}).`,
            value: 24 * a * x0,
            explanation: `Differentiate three times: f′ = ${4 * a}x³, f″ = ${12 * a}x², f‴ = ${24 * a}x. At x = ${x0}: ${24 * a} · ${x0} = ${24 * a * x0}.` };
        }
        const n = pick(r, [3, 4, 5]);
        const fact = [1, 1, 2, 6, 24, 120][n];
        return { prompt: `What is the ${n === 3 ? 'third' : n === 4 ? 'fourth' : 'fifth'} derivative of f(x) = x${n === 3 ? '³' : n === 4 ? '⁴' : '⁵'}?`,
          value: fact,
          explanation: `Each differentiation multiplies by the current exponent and lowers it: x^${n} → ${n}x^${n - 1} → … → ${n}! = ${fact}. Differentiating x^n exactly n times leaves the constant n-factorial; one more pass would give 0.` };
      } },
    ],
  },

  {
    skillId: 'antiderivatives',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const n = pick(r, [2, 3, 4]);
        const a = (n + 1) * int(r, 1, 3);
        return { prompt: `Find the general antiderivative: ∫ ${a}x${n === 2 ? '²' : n === 3 ? '³' : '⁴'} dx.`,
          value: `${co(a / (n + 1))}x${n === 2 ? '³' : n === 3 ? '⁴' : '⁵'} + C`,
          explanation: `Power rule in reverse: raise the exponent to ${n + 1}, divide by it: ${a}x^${n} → ${a}/${n + 1} · x^${n + 1} = ${a / (n + 1)}x^${n + 1}, plus C — every antiderivative family differs by a constant. Check by differentiating: d/dx[${a / (n + 1)}x^${n + 1}] = ${a}x^${n} ✓.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 2, 6), b = int(r, 1, 8);
          return { prompt: `∫ (${2 * a}x + ${b}) dx = ?`,
            value: `${a}x² + ${b}x + C`,
            explanation: `Integrate term by term: ${2 * a}x → ${a}x², and ${b} → ${b}x, giving ${a}x² + ${b}x + C. Differentiating the answer recovers the integrand exactly — the fundamental self-check.` };
        }
        const k = int(r, 2, 5), y0 = int(r, 1, 6);
        return { prompt: `f′(x) = ${2 * k}x and f(0) = ${y0}. Find f(x).`,
          value: `f(x) = ${k}x² + ${y0}`,
          explanation: `Antidifferentiate: f(x) = ${k}x² + C. The initial condition picks the one member of the family: f(0) = C = ${y0}, so f(x) = ${k}x² + ${y0}. An initial condition is exactly what turns +C into a single curve.` };
      } },
    ],
  },

  {
    skillId: 'error-analysis-correction',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'A student writes: d/dx (x³ · x²) = 3x² · 2x = 6x³. What went wrong?',
            a: 'They differentiated each factor and multiplied — that is not the product rule',
            opts: ['They differentiated each factor and multiplied — that is not the product rule', 'They should have added the exponents first: the answer 5x⁴ needs no product rule', 'Nothing — the work is correct', 'The power rule does not apply to products'],
            e: 'The derivative of a product is NOT the product of derivatives. Either simplify first (x⁵ → 5x⁴) or apply the product rule: 3x²·x² + x³·2x = 5x⁴. Note choice B diagnoses a fix but not the ERROR — the question asks what went wrong.' },
          { q: 'A student writes: d/dx sin(3x) = cos(3x). What is missing?',
            a: 'The chain rule factor 3',
            opts: ['The chain rule factor 3', 'A negative sign', 'Nothing — the work is correct', 'The answer should be −3sin(3x)'],
            e: 'sin(3x) is a composite: the outer derivative cos(3x) must be multiplied by the inner derivative 3, giving 3cos(3x). Dropping the inner factor is the single most common chain-rule error.' },
          { q: 'A student writes: ∫ x³ dx = 3x². What did they do?',
            a: 'They differentiated instead of integrating',
            opts: ['They differentiated instead of integrating', 'They forgot only the + C', 'They used the wrong exponent but right coefficient', 'Nothing — the work is correct'],
            e: '3x² is the DERIVATIVE of x³. Integration goes the other way: raise the exponent, divide by it — x⁴/4 + C. (The missing + C is a second error, but the direction is the fatal one.)' },
          { q: 'A student claims: since f′(c) = 0 at c = 2, f has a local extremum at 2. What is the flaw?',
            a: 'A critical point need not be an extremum — f′ must change sign',
            opts: ['A critical point need not be an extremum — f′ must change sign', 'f′(c) = 0 never happens at extrema', 'Extrema require f″(c) = 0', 'There is no flaw'],
            e: 'f(x) = x³ at 0 has f′ = 0 but no extremum — the slope touches zero and keeps the same sign. A zero derivative locates CANDIDATES; the first-derivative test (sign change) or second-derivative test must confirm.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 1, 4), b = int(r, 1, 4);
          const wrong = a * a + b * b, right = (a + b) * (a + b);
          return { prompt: `A student evaluates the limit of (x² − ${a * a})/(x − ${a}) as x → ${a} by plugging in and gets 0/0, then concludes the limit does not exist. What should they have done, and what is the limit?`,
            value: `Factor and cancel; the limit is ${2 * a}`,
            options: [`Factor and cancel; the limit is ${2 * a}`, 'Nothing — 0/0 means the limit does not exist', `L'Hôpital is required; the limit is ${wrong}`, `The limit is ${right}`],
            correctOption: 'A',
            explanation: `0/0 is INDETERMINATE, not nonexistent: (x² − ${a * a})/(x − ${a}) = (x − ${a})(x + ${a})/(x − ${a}) = x + ${a} away from ${a}, so the limit is ${a} + ${a} = ${2 * a}. Concluding "DNE" from 0/0 is the classic limit error.` };
        }
        return { prompt: 'A student "verifies" that F(x) = x·ln(x) is an antiderivative of ln(x) by noting both involve ln. What is the correct check, and does F pass?',
          value: 'Differentiate F; it fails — F′(x) = ln(x) + 1, not ln(x)',
          options: ['Differentiate F; it fails — F′(x) = ln(x) + 1, not ln(x)', 'Differentiate F; it passes', 'Integrate ln(x) numerically', 'Compare graphs of F and ln'],
          correctOption: 'A',
          explanation: 'The only test of an antiderivative is differentiation: (x·ln x)′ = ln x + x·(1/x) = ln x + 1 by the product rule — off by 1. (The true antiderivative is x·ln x − x + C.) "Looks related" is never verification.' };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
