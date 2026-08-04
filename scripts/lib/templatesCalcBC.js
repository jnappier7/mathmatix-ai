'use strict';
/**
 * Calculus BC: the sixteen BC-only skills — series, parametric, polar,
 * advanced integration, Euler's method, logistic growth. Everything BC
 * shares with AB (limits, derivatives, FTC, ...) is already covered by the
 * AB round's crosswalk rows and top-ups; this file is strictly the block no
 * other course touches.
 *
 * Number design: parametric speeds and vector magnitudes come from
 * Pythagorean pairs, geometric series draw ratios whose closed forms are
 * whole numbers, partial fractions pick numerators equal to the root gap so
 * coefficients land on ±1, and error bounds stay at factorial reciprocals a
 * student can type. Answers are computed from the drawn numbers — see
 * templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '11-12';

const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]];

// Render "x + c" with proper signs: c = −1 → "x − 1", c = 0 → "x".
const xPlus = (c) => (c === 0 ? 'x' : c > 0 ? `x + ${c}` : `x − ${-c}`);
// Render a leading coefficient: 1t² prints as t².
const co = (n) => (n === 1 ? '' : String(n));

const TEMPLATES = [
  {
    skillId: 'integration-by-parts',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: '∫ x·eˣ dx = ?', a: '(x − 1)eˣ + C',
            opts: ['(x − 1)eˣ + C', 'x·eˣ + C', '(x + 1)eˣ + C', 'x²eˣ/2 + C'],
            e: 'Parts with u = x, dv = eˣ dx: uv − ∫v du = x·eˣ − ∫eˣ dx = x·eˣ − eˣ + C = (x − 1)eˣ + C. Check by differentiating: eˣ + (x − 1)eˣ = x·eˣ ✓.' },
          { q: '∫ x·cos(x) dx = ?', a: 'x·sin(x) + cos(x) + C',
            opts: ['x·sin(x) + cos(x) + C', 'x·sin(x) − cos(x) + C', '−x·sin(x) + cos(x) + C', 'x²sin(x)/2 + C'],
            e: 'Parts with u = x, dv = cos(x) dx: x·sin(x) − ∫sin(x) dx = x·sin(x) + cos(x) + C. The polynomial factor is u so that differentiating it SIMPLIFIES the next integral.' },
          { q: '∫ x·sin(x) dx = ?', a: '−x·cos(x) + sin(x) + C',
            opts: ['−x·cos(x) + sin(x) + C', 'x·cos(x) − sin(x) + C', '−x·cos(x) − sin(x) + C', 'x²cos(x)/2 + C'],
            e: 'Parts with u = x, dv = sin(x) dx: −x·cos(x) + ∫cos(x) dx = −x·cos(x) + sin(x) + C. Differentiate to check: −cos x + x·sin x + cos x = x·sin x ✓.' },
          { q: '∫ ln(x) dx = ?', a: 'x·ln(x) − x + C',
            opts: ['x·ln(x) − x + C', 'x·ln(x) + C', '1/x + C', 'ln(x)²/2 + C'],
            e: 'The classic trick: u = ln(x), dv = dx. Then x·ln(x) − ∫x·(1/x) dx = x·ln(x) − x + C. Integration by parts handles ln even with no visible product.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'For ∫ x²·ln(x) dx by parts, which choice of u follows LIATE (and why)?',
            value: 'u = ln(x) — logs come first in LIATE',
            options: ['u = ln(x) — logs come first in LIATE', 'u = x² — pick the polynomial', 'u = x²·ln(x) — the whole integrand', 'dv = ln(x) dx — logs are easy to integrate'],
            correctOption: 'A',
            explanation: 'LIATE (Log, Inverse trig, Algebraic, Trig, Exponential) ranks u candidates: ln(x) differentiates into the simpler 1/x, while its antiderivative is the harder x·ln(x) − x. u = ln(x), dv = x² dx makes ∫v du a plain power integral.' };
        }
        return { prompt: '∫ x·eˣ dx evaluated from 0 to 1 equals:',
          value: '1',
          options: ['1', 'e − 1', 'e', 'e + 1'],
          correctOption: 'A',
          explanation: 'The antiderivative is (x − 1)eˣ. At 1: (0)e = 0. At 0: (−1)e⁰ = −1. So the integral is 0 − (−1) = 1. Neat cancellations like this are why the AP exam loves this integrand.' };
      } },
    ],
  },

  {
    skillId: 'partial-fractions',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 6);
        return { prompt: `Decompose into partial fractions: ${a}/(x(x + ${a})).`,
          value: `1/x − 1/(x + ${a})`,
          explanation: `Write ${a}/(x(x + ${a})) = A/x + B/(x + ${a}). Multiply out: ${a} = A(x + ${a}) + Bx. At x = 0: A = 1. At x = −${a}: B·(−${a}) = ${a}, so B = −1. The numerator matching the root gap is what makes both coefficients ±1.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const p0 = int(r, 1, 5), gap = pick(r, [1, 2]);
        const q0 = p0 + gap;
        const c = gap === 1 ? int(r, 1, 5) : p0 % 2 === 0 ? int(r, 1, 3) * 2 - p0 : 2 - p0;
        // ensure A = (p0 + c)/gap is a whole number
        const cAdj = gap === 1 ? c : (p0 + c) % 2 === 0 ? c : c + 1;
        const A = (p0 + cAdj) / gap;
        if (made % 2 === 0) {
          return { prompt: `In the decomposition (${xPlus(cAdj)})/((x − ${p0})(x − ${q0})) = A/(x − ${p0}) + B/(x − ${q0}), find A.`,
            value: -A,
            explanation: `Cover-up method: A = (value of (${xPlus(cAdj)})/(x − ${q0}) at x = ${p0}) = ${p0 + cAdj}/(${p0} − ${q0}) = ${p0 + cAdj}/(−${gap}) = ${-A}. Evaluate the rest of the fraction at the root the factor hides.` };
        }
        return { prompt: `In the decomposition (${xPlus(cAdj)})/((x − ${p0})(x − ${q0})) = A/(x − ${p0}) + B/(x − ${q0}), find B.`,
          value: (q0 + cAdj) / gap,
          explanation: `Cover-up method: B = (value of (${xPlus(cAdj)})/(x − ${p0}) at x = ${q0}) = ${q0 + cAdj}/(${q0} − ${p0}) = ${q0 + cAdj}/${gap} = ${(q0 + cAdj) / gap}. The two residues always differ because the numerator is evaluated at different roots.` };
      } },
    ],
  },

  {
    skillId: 'improper-integrals',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const p0 = pick(r, [2, 3, 4]);
          return { prompt: `Does ∫₁^∞ 1/x${p0 === 2 ? '²' : p0 === 3 ? '³' : '⁴'} dx converge or diverge?`,
            value: 'Converges',
            options: ['Converges', 'Diverges', 'Converges only on [1, 2]', 'Cannot be determined'],
            correctOption: 'A',
            explanation: `A p-integral ∫₁^∞ 1/xᵖ dx converges exactly when p > 1. Here p = ${p0} > 1 — the tail shrinks fast enough for the area to stay finite (its value is 1/(${p0} − 1) = ${K.frac(1, p0 - 1)}).` };
        }
        return { prompt: 'Does ∫₁^∞ 1/x dx converge or diverge?',
          value: 'Diverges',
          options: ['Diverges', 'Converges to 1', 'Converges to 0', 'Converges to e'],
          correctOption: 'A',
          explanation: 'p = 1 is the boundary case and it FAILS: ∫₁^b dx/x = ln(b) → ∞. The area under 1/x thins out, but not fast enough — the p > 1 threshold is strict.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const p0 = pick(r, [2, 3, 5]);
          return { prompt: `Evaluate: ∫₁^∞ 1/x${p0 === 2 ? '²' : p0 === 3 ? '³' : '⁵'} dx.`,
            value: K.frac(1, p0 - 1),
            explanation: `∫₁^b x^(−${p0}) dx = [x^(−${p0 - 1})/(−${p0 - 1})]₁^b = (1 − b^(−${p0 - 1}))/${p0 - 1} → 1/${p0 - 1} as b → ∞. Improper integrals are limits of proper ones — compute, then let the bound run off.` };
        }
        return { prompt: 'Evaluate: ∫₀¹ 1/√x dx (improper at 0).',
          value: 2,
          explanation: '∫ x^(−1/2) dx = 2√x. As the lower limit a → 0⁺: 2√1 − 2√a → 2. The integrand blows up at 0, but like a p-integral with p = 1/2 < 1 at a finite endpoint, the area is finite.' };
      } },
    ],
  },

  {
    skillId: 'euler-method',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const x0 = 0, y0 = int(r, 1, 5), h = 1;
        const slope = x0 + y0;
        return { prompt: `dy/dx = x + y with y(0) = ${y0}. Using Euler's method with step size h = ${h}, estimate y(1).`,
          value: y0 + h * slope,
          explanation: `One Euler step: y(1) ≈ y(0) + h·(slope at (0, ${y0})) = ${y0} + 1·(0 + ${y0}) = ${y0 + slope}. Euler's method walks along the tangent line the slope field gives at the current point.` };
      } },
      { difficulty: 4, gen: (r) => {
        const y0 = int(r, 1, 4);
        // two steps of h = 1 on dy/dx = x + y
        const y1 = y0 + (0 + y0);
        const y2 = y1 + (1 + y1);
        return { prompt: `dy/dx = x + y with y(0) = ${y0}. Using Euler's method with TWO steps of h = 1, estimate y(2).`,
          value: y2,
          explanation: `Step 1: y(1) ≈ ${y0} + 1·(0 + ${y0}) = ${y1}. Step 2: y(2) ≈ ${y1} + 1·(1 + ${y1}) = ${y2}. Each step re-reads the slope at the NEW point — using the old slope twice is the classic Euler error.` };
      } },
    ],
  },

  {
    skillId: 'logistic-growth',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const L = pick(r, [100, 200, 400, 500, 800, 1000]);
        if (made % 2 === 0) {
          return { prompt: `A population follows dP/dt = kP(1 − P/${L}) with 0 < P(0) < ${L}. What is the limit of P as t → ∞?`,
            value: L,
            explanation: `${L} is the carrying capacity: growth is positive below it, zero at it. Every logistic solution starting between 0 and ${L} rises toward the horizontal asymptote P = ${L} without crossing it.` };
        }
        return { prompt: `A population follows the logistic equation dP/dt = kP(1 − P/${L}). At what population is it growing FASTEST?`,
          value: L / 2,
          explanation: `dP/dt = kP(1 − P/${L}) is a downward parabola in P, maximized halfway between its zeros 0 and ${L}: at P = ${L / 2}. On the S-curve this is the inflection point — steepest climb at half capacity.` };
      } },
      { difficulty: 4, gen: (r) => {
        const L = pick(r, [100, 200, 400]);
        const k = pick(r, [2, 4]);
        const P = L / 2;
        const rate = k * P * (1 - P / L);
        return { prompt: `dP/dt = ${k}P(1 − P/${L}). Compute dP/dt when P = ${P}.`,
          value: rate,
          explanation: `Substitute: dP/dt = ${k} · ${P} · (1 − ${P}/${L}) = ${k} · ${P} · ${1 - P / L} = ${rate}. (P = ${P} is half of the carrying capacity ${L}, so this is also the maximum possible growth rate.)` };
      } },
    ],
  },

  {
    skillId: 'parametric-derivatives',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 1, 4), t0 = int(r, 1, 4);
        return { prompt: `x = ${a}t, y = ${co(b)}t². Find dy/dx at t = ${t0}.`,
          value: K.frac(2 * b * t0, a),
          explanation: `For parametric curves, dy/dx = (dy/dt)/(dx/dt) = ${2 * b}t/${a}. At t = ${t0}: ${2 * b * t0}/${a} = ${K.frac(2 * b * t0, a)}. Divide the rates — never differentiate y with respect to x directly.` };
      } },
      { difficulty: 4, gen: (r) => {
        const t0 = int(r, 1, 4);
        return { prompt: `x = t², y = t³. Find the slope of the tangent line at t = ${t0}.`,
          value: K.frac(3 * t0, 2),
          explanation: `dy/dx = (dy/dt)/(dx/dt) = 3t²/(2t) = 3t/2 for t ≠ 0. At t = ${t0}: ${3 * t0}/2 = ${K.frac(3 * t0, 2)}. The t cancels only away from t = 0 — at the origin this curve has a cusp.` };
      } },
    ],
  },

  {
    skillId: 'parametric-arc-length',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'Which integral gives the arc length of the parametric curve x = f(t), y = g(t) for a ≤ t ≤ b?',
            value: '∫ₐᵇ √((dx/dt)² + (dy/dt)²) dt',
            options: ['∫ₐᵇ √((dx/dt)² + (dy/dt)²) dt', '∫ₐᵇ ((dx/dt)² + (dy/dt)²) dt', '∫ₐᵇ √(1 + (dy/dx)²) dx', '∫ₐᵇ (dy/dt)/(dx/dt) dt'],
            correctOption: 'A',
            explanation: 'Arc length integrates SPEED: √((dx/dt)² + (dy/dt)²) is the speed along the curve, and distance is speed integrated over time. (Choice C is the arc-length form for y = f(x), a different setup.)' };
        }
        const [a, b, c] = pick(r, TRIPLES);
        const T = int(r, 1, 4);
        return { prompt: `x = ${a}t, y = ${b}t for 0 ≤ t ≤ ${T}. Find the length of the curve.`,
          value: c * T,
          explanation: `Speed = √(${a}² + ${b}²) = ${c} (the ${a}-${b}-${c} triple), constant. Length = ∫₀^${T} ${c} dt = ${c * T}. A straight line traced at constant speed — the integral is just speed × time.` };
      } },
      { difficulty: 4, gen: (r) => {
        const [a, b, c] = pick(r, TRIPLES);
        const t0 = int(r, 1, 3);
        return { prompt: `A particle moves along x = ${a}t, y = ${b}t + ${int(r, 1, 9)}. What is its SPEED at t = ${t0}?`,
          value: c,
          explanation: `Speed = √((dx/dt)² + (dy/dt)²) = √(${a}² + ${b}²) = ${c} — the ${a}-${b}-${c} triple, and constant in t because both rates are constant. The +constant in y shifts the path, not the speed.` };
      } },
    ],
  },

  {
    skillId: 'polar-graphing-area',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 2, 6);
          return { prompt: `Using the polar area formula A = (1/2)∫r² dθ over [0, 2π], find the area enclosed by the circle r = ${a}.`,
            value: `${a * a}π`,
            explanation: `A = (1/2)∫₀^{2π} ${a}² dθ = (1/2)(${a * a})(2π) = ${a * a}π — matching πr² for a circle of radius ${a}, as it must. The polar formula sweeps out triangular slivers (1/2)r²dθ.` };
        }
        return { prompt: 'Which integral gives the area enclosed by the polar curve r = f(θ) for α ≤ θ ≤ β?',
          value: '(1/2)∫ᵅᵝ r² dθ',
          options: ['(1/2)∫ᵅᵝ r² dθ', '∫ᵅᵝ r dθ', '(1/2)∫ᵅᵝ r dθ', '∫ᵅᵝ r² dθ'],
          correctOption: 'A',
          explanation: 'Each sliver of angle dθ is approximately a thin triangle with area (1/2)r·(r dθ) = (1/2)r² dθ. Summing gives A = (1/2)∫r² dθ. Forgetting the 1/2 or the square are the two standard errors.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        const a = pick(r, [2, 4, 6]);
        if (made % 2 === 0) {
          return { prompt: `Find the area enclosed by the cardioid r = ${a}(1 + cos θ).`,
            value: `${(3 * a * a) / 2}π`,
            explanation: `A = (1/2)∫₀^{2π} ${a}²(1 + cos θ)² dθ. Expanding, (1 + cos θ)² averages to 3/2 over a full period (1 + 2·0 + 1/2), so A = (1/2)(${a * a})(3/2)(2π) = ${(3 * a * a) / 2}π. The cardioid's area is always (3/2)π·a².` };
        }
        return { prompt: `Over which θ-interval is ONE petal of the rose r = ${a}cos(2θ) traced (starting from its tip at θ = 0)?`,
          value: '[−π/4, π/4]',
          options: ['[−π/4, π/4]', '[0, 2π]', '[0, π]', '[−π/2, π/2]'],
          correctOption: 'A',
          explanation: `A petal lives where r ≥ 0: cos(2θ) ≥ 0 for −π/4 ≤ θ ≤ π/4. Integrating the area formula outside the petal's own interval double-counts other petals — finding the right bounds IS the problem on the AP exam.` };
      } },
    ],
  },

  {
    skillId: 'vector-valued-functions',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 7), b = int(r, 1, 4), t0 = int(r, 1, 4);
        return { prompt: `r(t) = ⟨${a}t, ${co(b)}t²⟩. Find the velocity vector r′(${t0}).`,
          value: `⟨${a}, ${2 * b * t0}⟩`,
          explanation: `Differentiate each component: r′(t) = ⟨${a}, ${2 * b}t⟩. At t = ${t0}: ⟨${a}, ${2 * b * t0}⟩. Vector-valued calculus is component-wise calculus.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const [a, b, c] = pick(r, TRIPLES);
        if (made % 2 === 0) {
          const t0 = int(r, 1, 3);
          return { prompt: `r(t) = ⟨${a}t, ${b}t⟩ + ⟨${int(r, 1, 5)}, ${int(r, 1, 5)}⟩ (a constant shift). What is the particle's SPEED at t = ${t0}?`,
            value: c,
            explanation: `r′(t) = ⟨${a}, ${b}⟩ — the constant shift differentiates away. Speed = |r′| = √(${a}² + ${b}²) = ${c}, the ${a}-${b}-${c} triple. Speed is the magnitude of velocity, never a component.` };
        }
        const k = int(r, 1, 3);
        return { prompt: `A particle has velocity r′(t) = ⟨${2 * k}t, ${b}⟩. Find its acceleration vector.`,
          value: `⟨${2 * k}, 0⟩`,
          explanation: `Differentiate the velocity component-wise: a(t) = ⟨${2 * k}, 0⟩ — constant. The ${b} in the y-velocity is constant, so no y-acceleration; only the x-motion accelerates.` };
      } },
    ],
  },

  {
    skillId: 'sequences-convergence',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const a = int(r, 2, 9), b = int(r, 1, 9), c = int(r, 2, 9), d = int(r, 1, 9);
        if (made % 2 === 0) {
          return { prompt: `Find the limit of the sequence aₙ = (${a}n + ${b})/(${c}n + ${d}).`,
            value: K.frac(a, c),
            explanation: `Divide top and bottom by n: (${a} + ${b}/n)/(${c} + ${d}/n) → ${a}/${c} = ${K.frac(a, c)}. Sequence limits at ∞ follow the same leading-term logic as function limits.` };
        }
        const p0 = pick(r, [1, 2, 3]);
        return { prompt: `Find the limit of the sequence aₙ = ${a}/n${p0 === 1 ? '' : p0 === 2 ? '²' : '³'}.`,
          value: 0,
          explanation: `A constant over a growing power of n shrinks to 0: ${a}/n^${p0} → 0. Any sequence c/nᵖ with p > 0 converges to 0 — the constant only scales the approach, never the destination.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const CASES = [
          { rr: '1/2', conv: 'Converges to 0', e: '|1/2| < 1, so (1/2)ⁿ halves forever toward 0. Geometric sequences rⁿ converge exactly when −1 < r ≤ 1.' },
          { rr: '3/2', conv: 'Diverges', e: '|3/2| > 1, so each term is 1.5× the last — the sequence grows without bound. Geometric growth beyond ratio 1 never settles.' },
          { rr: '1', conv: 'Converges to 1', e: '1ⁿ = 1 for every n — constant, hence convergent to 1. r = 1 is the one boundary ratio that converges (to 1); r = −1 oscillates and does not.' },
          { rr: '−1', conv: 'Diverges', e: '(−1)ⁿ alternates 1, −1, 1, −1, … forever — it never settles on a single value, so it diverges (by oscillation, not by growing).' },
        ];
        const c = CASES[made % CASES.length];
        const opts = ['Converges to 0', 'Converges to 1', 'Diverges', 'Converges to the ratio'];
        return { prompt: `Does the sequence aₙ = (${c.rr})ⁿ converge or diverge (and to what)?`,
          value: c.conv, options: opts,
          correctOption: 'ABCD'[opts.indexOf(c.conv)], explanation: c.e };
      } },
    ],
  },

  {
    skillId: 'convergence-tests',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const p0 = pick(r, [2, 3, 4]);
          return { prompt: `Does the p-series Σ 1/n${p0 === 2 ? '²' : p0 === 3 ? '³' : '⁴'} converge or diverge?`,
            value: 'Converges',
            options: ['Converges', 'Diverges', 'Converges only for even n', 'Cannot be determined'],
            correctOption: 'A',
            explanation: `A p-series Σ 1/nᵖ converges exactly when p > 1. Here p = ${p0} > 1 ✓. (Compare: p = 1 is the harmonic series, which diverges — the threshold is strict.)` };
        }
        return { prompt: 'Does the harmonic series Σ 1/n converge or diverge?',
          value: 'Diverges',
          options: ['Diverges', 'Converges to 1', 'Converges to e', 'Converges to 0'],
          correctOption: 'A',
          explanation: 'The terms shrink to 0, yet the SUM still grows without bound (group terms: 1/3 + 1/4 > 1/2, 1/5 + … + 1/8 > 1/2, forever). Terms → 0 is necessary but never sufficient — the harmonic series is the canonical counterexample.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const denom = pick(r, [2, 3, 4]);
          const a0 = denom - 1; // sum a0/(1 − 1/denom) = a0·denom/(denom−1) = denom
          return { prompt: `Evaluate the geometric series: Σₙ₌₀^∞ ${a0 === 1 ? '' : `${a0}·`}(1/${denom})ⁿ.`,
            value: denom,
            explanation: `|r| = 1/${denom} < 1, so the series converges to a/(1 − r) = ${a0}/(1 − 1/${denom}) = ${a0}/(${a0}/${denom}) = ${denom}. First term over one-minus-ratio — but only when |r| < 1.` };
        }
        const num = int(r, 2, 5);
        return { prompt: `For which values of r does Σₙ₌₀^∞ ${num}·rⁿ converge?`,
          value: '|r| < 1',
          options: ['|r| < 1', 'All r', 'r < 1', '|r| ≤ 1'],
          correctOption: 'A',
          explanation: `A geometric series converges exactly when |r| < 1 — strictly. At r = 1 the terms are all ${num}; at r = −1 they alternate ±${num}; both diverge. The constant ${num} scales the sum but never changes convergence.` };
      } },
    ],
  },

  {
    skillId: 'alternating-series-error',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const N = pick(r, [3, 4, 5, 9]);
        return { prompt: `The alternating series Σ (−1)ⁿ⁺¹/n is approximated by its first ${N} terms. What is the alternating series error bound?`,
          value: `1/${N + 1}`,
          explanation: `For a convergent alternating series with decreasing terms, the error is at most the FIRST OMITTED TERM: |error| ≤ a_{${N + 1}} = 1/${N + 1}. The partial sums straddle the true value, so the next term brackets the miss.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const k = pick(r, [50, 100, 200]);
          return { prompt: `How many terms of Σ (−1)ⁿ⁺¹/n guarantee (by the alternating series bound) an error less than 1/${k}?`,
            value: k,
            explanation: `Need the first omitted term below 1/${k}: a_{N+1} = 1/(N + 1) < 1/${k} requires N + 1 > ${k}, i.e. N = ${k} terms. The bound is about the NEXT term, hence the off-by-one that catches so many students.` };
        }
        const N = pick(r, [2, 3, 4]);
        const fact = [1, 1, 2, 6, 24, 120][N + 1];
        return { prompt: `Σ (−1)ⁿ/n! (n from 0) is approximated by its terms through n = ${N}. What is the alternating series error bound?`,
          value: `1/${fact}`,
          explanation: `The first omitted term is 1/(${N + 1})! = 1/${fact}, and for a decreasing alternating series that term bounds the error. Factorial denominators shrink fast — this series (which sums to 1/e) needs very few terms.` };
      } },
    ],
  },

  {
    skillId: 'taylor-maclaurin-polynomials',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'What is the 2nd-degree Maclaurin polynomial of eˣ?', a: '1 + x + x²/2',
            opts: ['1 + x + x²/2', '1 + x + x²', 'x + x²/2', '1 + x²/2'],
            e: 'Every derivative of eˣ is eˣ, so f⁽ⁿ⁾(0) = 1 and each coefficient is 1/n!: P₂(x) = 1 + x + x²/2. The n! in the denominator is the whole story of Taylor coefficients.' },
          { q: 'What is the 3rd-degree Maclaurin polynomial of sin(x)?', a: 'x − x³/6',
            opts: ['x − x³/6', 'x + x³/6', 'x − x³/3', '1 − x²/2'],
            e: 'sin has derivatives cycling sin, cos, −sin, −cos, giving f(0) = 0, f′(0) = 1, f″(0) = 0, f‴(0) = −1: P₃(x) = x − x³/3! = x − x³/6. Only odd powers survive — sin is odd.' },
          { q: 'What is the 2nd-degree Maclaurin polynomial of cos(x)?', a: '1 − x²/2',
            opts: ['1 − x²/2', '1 + x²/2', 'x − x²/2', '1 − x²'],
            e: 'cos(0) = 1, cos′(0) = −sin(0) = 0, cos″(0) = −cos(0) = −1: P₂(x) = 1 − x²/2!. Only even powers survive — cos is even. This is the small-angle approximation behind physics pendulums.' },
          { q: 'What is the 2nd-degree Maclaurin polynomial of 1/(1 − x)?', a: '1 + x + x²',
            opts: ['1 + x + x²', '1 − x + x²', '1 + x + x²/2', 'x + x² + x³'],
            e: '1/(1 − x) is the geometric series 1 + x + x² + … for |x| < 1, so the Taylor coefficients are all EXACTLY 1 (no n! here — the derivatives grow like n! and cancel it). P₂(x) = 1 + x + x².' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const k = pick(r, [4, 6, 8, 10]);
          return { prompt: `f(0) = 2, f′(0) = 3, f″(0) = ${k}. What is the coefficient of x² in f's Maclaurin polynomial?`,
            value: k / 2,
            explanation: `The x² coefficient is f″(0)/2! = ${k}/2 = ${k / 2}. Taylor coefficients are cₙ = f⁽ⁿ⁾(0)/n! — dividing by n! is the step the AP exam checks; the f(0) and f′(0) values are bait for the wrong slot.` };
        }
        const k = pick(r, [6, 12, 18, 24]);
        return { prompt: `A Maclaurin polynomial has x³ coefficient equal to ${k / 6}. What is f‴(0)?`,
          value: k,
          explanation: `c₃ = f‴(0)/3! = f‴(0)/6, so f‴(0) = 6 · ${k / 6} = ${k}. Reading derivative values OFF a given polynomial reverses the coefficient formula — multiply back by n!.` };
      } },
    ],
  },

  {
    skillId: 'taylor-series-known',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'The series Σₙ₌₀^∞ xⁿ/n! is the Maclaurin series of which function?', a: 'eˣ',
            opts: ['eˣ', 'sin(x)', 'cos(x)', '1/(1 − x)'],
            e: 'All derivatives of eˣ equal 1 at 0, giving coefficients 1/n!: eˣ = 1 + x + x²/2! + x³/3! + … for all x. The factorial denominators with EVERY power of x present is the eˣ signature.' },
          { q: 'The series Σₙ₌₀^∞ (−1)ⁿ x²ⁿ⁺¹/(2n+1)! is the Maclaurin series of which function?', a: 'sin(x)',
            opts: ['sin(x)', 'cos(x)', 'eˣ', 'arctan(x)'],
            e: 'Odd powers only, alternating signs, factorial denominators: x − x³/3! + x⁵/5! − … = sin(x). Odd powers ↔ odd function; the (2n+1)! factorials distinguish it from arctan (which has plain 2n+1 denominators).' },
          { q: 'The series Σₙ₌₀^∞ (−1)ⁿ x²ⁿ/(2n)! is the Maclaurin series of which function?', a: 'cos(x)',
            opts: ['cos(x)', 'sin(x)', 'e⁻ˣ', '1/(1 + x²)'],
            e: 'Even powers only, alternating signs, factorial denominators: 1 − x²/2! + x⁴/4! − … = cos(x). Even powers ↔ even function.' },
          { q: 'The series Σₙ₌₀^∞ xⁿ (for |x| < 1) sums to which function?', a: '1/(1 − x)',
            opts: ['1/(1 − x)', '1/(1 + x)', 'ln(1 + x)', 'eˣ'],
            e: 'The geometric series: 1 + x + x² + … = 1/(1 − x) for |x| < 1. No factorials — a giveaway that this is geometric, not exponential. Substituting into it generates many other series (e.g. −x² gives 1/(1 + x²)).' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r) => {
        const k = pick(r, [2, 4, 6]);
        return { prompt: `Using the series for eˣ, what is the coefficient of x² in the Maclaurin series of e^(${k}x)?`,
          value: (k * k) / 2,
          explanation: `Substitute ${k}x into eˣ = Σ xⁿ/n!: the x² term is (${k}x)²/2! = ${k * k}x²/2, so the coefficient is ${(k * k) / 2}. Substitution into a known series beats differentiating from scratch every time.` };
      } },
    ],
  },

  {
    skillId: 'power-series-interval',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const k = int(r, 2, 6);
        return { prompt: `What is the radius of convergence of Σₙ₌₀^∞ xⁿ/${k}ⁿ?`,
          value: k,
          explanation: `This is geometric with ratio x/${k}: it converges when |x/${k}| < 1, i.e. |x| < ${k}. Radius R = ${k}. (The ratio test gives the same: |x|/${k} < 1.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 5), k = int(r, 2, 5);
        return { prompt: `The series Σₙ₌₀^∞ (x − ${a})ⁿ/${k}ⁿ converges on which interval?`,
          value: `(${a - k}, ${a + k})`,
          explanation: `Geometric with ratio (x − ${a})/${k}: need |x − ${a}| < ${k}, giving ${a} − ${k} < x < ${a} + ${k}, i.e. (${a - k}, ${a + k}). Both endpoints FAIL here (the terms become ±1, not shrinking), so the interval stays open — endpoint checks are always a separate step.` };
      } },
    ],
  },

  {
    skillId: 'lagrange-error-bound',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const n = pick(r, [2, 3, 4]);
        const fact = [1, 1, 2, 6, 24, 120][n + 1];
        return { prompt: `sin(1) is approximated by its degree-${n} Maclaurin polynomial. Every derivative of sin is bounded by 1. What is the Lagrange error bound?`,
          value: `1/${fact}`,
          explanation: `|Rₙ| ≤ M·|x − a|ⁿ⁺¹/(n+1)! with M = 1 (sine's derivatives never exceed 1) and |x| = 1: bound = 1/(${n + 1})! = 1/${fact}. The factorial denominator is why low-degree polynomials already nail sine so accurately.` };
      } },
      { difficulty: 4, gen: (r) => {
        const M = pick(r, [2, 4, 6, 12]);
        const n = pick(r, [2, 3]);
        const fact = [1, 1, 2, 6, 24][n + 1];
        return { prompt: `|f⁽${n + 1}⁾(x)| ≤ ${M} on the interval, and f is approximated at x with |x − a| = 1 by its degree-${n} Taylor polynomial. State the Lagrange error bound.`,
          value: K.frac(M, fact),
          explanation: `|Rₙ| ≤ M·|x − a|ⁿ⁺¹/(n+1)! = ${M} · 1/${fact} = ${K.frac(M, fact)}. Three ingredients — a derivative bound M, the distance |x − a|, and the factorial — and the bound assembles itself.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
