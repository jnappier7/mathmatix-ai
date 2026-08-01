/**
 * Build seeds/calc-topup-items.generated.json — hand-authored AP Calculus AB
 * items topping up the ten skills the coverage audit showed as THIN.
 *
 * Why hand-authored: these teach real students. Every stem, answer, distractor
 * and explanation below was worked by hand and checked; a generator's output
 * would need the same review anyway, and the existing calc-fable items set a
 * quality bar (explanations that name what each distractor's mistake WAS).
 *
 * The audit found all ten skills sitting at difficulty 3 only, so these spread
 * across 2–4 to give the ZPD selector something to choose from.
 *
 *   node scripts/buildCalcTopupItems.js     # writes the seed file
 *   node scripts/seedCalcTopupItems.js      # upserts it (source: calc-topup)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, '..', 'seeds', 'calc-topup-items.generated.json');

// [skillId, difficulty, prompt, [A,B,C,D], correctLetter, answerValue, explanation, unit]
const ROWS = [
  // ── one-sided & infinite limits ──
  ['one-sided-infinite-limits', 2, 'lim(x→3⁺) 1/(x − 3) is',
    ['−∞', '0', '+∞', '1'], 'C', '+∞',
    'As x approaches 3 from the RIGHT, x − 3 is a small POSITIVE number, so 1/(x − 3) grows without bound: the limit is +∞. Choice A is the left-hand limit — approaching from below makes x − 3 negative.', 'U1'],
  ['one-sided-infinite-limits', 3, 'lim(x→2⁻) (x + 1)/(x − 2) is',
    ['+∞', '−∞', '0', '3'], 'B', '−∞',
    'Approaching 2 from the LEFT makes x − 2 a small NEGATIVE number while the numerator approaches 3, a positive value. Positive over a small negative is a large negative, so the limit is −∞. Choice D substitutes into the numerator only.', 'U1'],
  ['one-sided-infinite-limits', 3, 'For f(x) = (x + 4)/(x² − 16), lim(x→4⁺) f(x) is',
    ['+∞', '−∞', '1/8', '0'], 'A', '+∞',
    'Factor the denominator: x² − 16 = (x − 4)(x + 4), so for x ≠ −4 the function is 1/(x − 4). Approaching 4 from the right makes x − 4 a small positive number, so the limit is +∞. Choice C is the value at the HOLE (x = −4), a different feature of this same function.', 'U1'],
  ['one-sided-infinite-limits', 4, 'lim(x→0⁻) (1/x − 1/x²) is',
    ['+∞', '−∞', '0', '1'], 'B', '−∞',
    'Combine over a common denominator first: 1/x − 1/x² = (x − 1)/x². As x→0⁻ the numerator approaches −1 and x² approaches 0 through POSITIVE values (a square is never negative), so the quotient is a large negative: −∞. Choice C comes from treating the two terms separately, hitting the indeterminate ∞ − ∞ and guessing 0.', 'U1'],

  // ── continuity ──
  ['continuity-types', 2, 'The function f(x) = (x² − 9)/(x − 3) has what kind of discontinuity at x = 3?',
    ['Removable (a hole)', 'Jump', 'Infinite (vertical asymptote)', 'None — it is continuous'], 'A', 'Removable (a hole)',
    'Factoring gives (x − 3)(x + 3)/(x − 3) = x + 3 for x ≠ 3, so the limit exists and equals 6 — the graph has a single missing point. A discontinuity whose two-sided limit EXISTS is removable. Choice C is tempting because the denominator hits zero, but nothing blows up here: the (x − 3) cancels.', 'U1'],
  ['continuity-types', 3, 'Let f(x) = x + 1 for x < 2 and f(x) = 5 for x ≥ 2. At x = 2, f has',
    ['a removable discontinuity', 'a jump discontinuity', 'an infinite discontinuity', 'no discontinuity'], 'B', 'a jump discontinuity',
    'The left-hand limit is 2 + 1 = 3 and the right-hand value is 5. Both one-sided limits exist but DISAGREE, which is exactly a jump. Choice A would require the two one-sided limits to MATCH, which they do not.', 'U1'],
  ['continuity-types', 3, 'The function f(x) = 1/(x − 5)² has what kind of discontinuity at x = 5?',
    ['Removable', 'Jump', 'Infinite', 'None'], 'C', 'Infinite',
    'Nothing cancels, and as x→5 from either side the denominator approaches 0 through positive values, so f grows without bound: an infinite discontinuity (vertical asymptote at x = 5). Choice A is wrong because a removable discontinuity needs a finite limit, and this one has none.', 'U1'],
  ['continuity-types', 4, 'Let f(x) = (x² − 4)/(x − 2) for x ≠ 2 and f(2) = k. What value of k makes f continuous at x = 2?',
    ['0', '2', '4', 'No value of k works'], 'C', '4',
    'Continuity at 2 requires f(2) to equal lim(x→2) f(x). Factoring gives (x − 2)(x + 2)/(x − 2) = x + 2, whose limit at 2 is 4, so k = 4. Choice D is the trap of assuming the original 0/0 form makes the discontinuity permanent — it is removable precisely because the limit exists.', 'U1'],

  // ── common derivatives ──
  ['common-derivatives', 2, 'If f(x) = cos x, then f′(x) =',
    ['sin x', '−sin x', '−cos x', 'sec² x'], 'B', '−sin x',
    'The derivative of cos x is −sin x. Choice A drops the negative sign, which is the single most common slip in this pair (sin differentiates to +cos, cos to −sin).', 'U2'],
  ['common-derivatives', 2, 'd/dx [e^x + ln x] =',
    ['e^x + 1/x', 'e^x + ln x', 'x·e^(x−1) + 1/x', 'e^x − 1/x²'], 'A', 'e^x + 1/x',
    'e^x is its own derivative and the derivative of ln x is 1/x. Choice C applies the power rule to e^x, but the exponent is the variable there, not the base. Choice D differentiates 1/x instead of ln x.', 'U2'],
  ['common-derivatives', 3, 'd/dx [tan x] =',
    ['sec x tan x', 'sec² x', '−csc² x', 'cot x'], 'B', 'sec² x',
    'The derivative of tan x is sec² x. Choice A is the derivative of sec x and choice C is the derivative of cot x — the three are easy to swap under time pressure.', 'U2'],
  ['common-derivatives', 3, 'If f(x) = √x, then f′(4) =',
    ['1/4', '1/2', '2', '4'], 'A', '1/4',
    'Write √x as x^(1/2); the power rule gives f′(x) = (1/2)x^(−1/2) = 1/(2√x). At x = 4 that is 1/(2·2) = 1/4. Choice C is √4 itself — the FUNCTION value, not the derivative.', 'U2'],

  // ── L\'Hospital ──
  ['lhopitals-rule', 2, 'lim(x→1) (x² − 1)/(x − 1) is',
    ['0', '1', '2', 'undefined'], 'C', '2',
    'Direct substitution gives 0/0, so L\'Hospital\'s Rule applies: the limit equals lim(x→1) 2x/1 = 2. (Factoring to x + 1 gives the same answer.) Choice D mistakes an indeterminate FORM for a nonexistent limit.', 'U4'],
  ['lhopitals-rule', 3, 'lim(x→0) (1 − cos x)/x² is',
    ['0', '1/2', '1', '∞'], 'B', '1/2',
    'Substitution gives 0/0. One application of L\'Hospital gives sin x/(2x), still 0/0; a second gives cos x/2 → 1/2. Stopping after ONE application and substituting yields 0, which is choice A.', 'U4'],
  ['lhopitals-rule', 4, 'lim(x→∞) (ln x)/x is',
    ['0', '1', '∞', 'e'], 'A', '0',
    'This is the ∞/∞ indeterminate form, so L\'Hospital applies: the limit equals lim(x→∞) (1/x)/1 = 0. The point is that x grows far faster than ln x. Choice C assumes the numerator wins because it also grows without bound.', 'U4'],

  // ── area between curves ──
  ['area-between-curves', 2, 'The area of the region bounded by y = x and y = x² from x = 0 to x = 1 is',
    ['1/6', '1/3', '1/2', '5/6'], 'A', '1/6',
    'On (0, 1) the line is above the parabola, so the area is ∫₀¹ (x − x²) dx = 1/2 − 1/3 = 1/6. Subtracting in the wrong order gives −1/6; choices B and C are the two individual integrals, not their difference.', 'U6'],
  ['area-between-curves', 3, 'The area of the region enclosed by y = x² and y = 4 is',
    ['32/3', '16/3', '8', '64/3'], 'A', '32/3',
    'The curves meet where x² = 4, at x = ±2, and the horizontal line is on top: ∫₋₂² (4 − x²) dx = [4x − x³/3]₋₂² = 16/3 + 16/3 = 32/3. Choice B integrates over only half the region (0 to 2) and forgets to double it.', 'U6'],
  ['area-between-curves', 4, 'The area of the region bounded by y = √x and y = x² is',
    ['1/3', '1/6', '2/3', '1/2'], 'A', '1/3',
    'The curves intersect at x = 0 and x = 1, with √x above x² between them: ∫₀¹ (√x − x²) dx = 2/3 − 1/3 = 1/3. Choice C is just the first integral, ∫√x, without subtracting the region under the parabola.', 'U6'],

  // ── volume: disk & washer ──
  ['volume-disk-washer', 2, 'The region under y = √x from x = 0 to x = 4 is revolved about the x-axis. The volume of the solid is',
    ['8π', '16π', '4π', '32π/3'], 'A', '8π',
    'Disks perpendicular to the axis have radius √x, so V = π∫₀⁴ (√x)² dx = π∫₀⁴ x dx = π·8 = 8π. Choice D comes from forgetting to square the radius and integrating √x itself.', 'U8'],
  ['volume-disk-washer', 3, 'The region bounded by y = x², y = 0 and x = 2 is revolved about the x-axis. The volume is',
    ['32π/5', '8π/3', '32π/3', '16π/5'], 'A', '32π/5',
    'V = π∫₀² (x²)² dx = π∫₀² x⁴ dx = π·(32/5) = 32π/5. Choice C squares only after integrating; choice B is the AREA-style integral ∫x² dx scaled by π, which skips the squaring entirely.', 'U8'],
  ['volume-disk-washer', 4, 'The region between y = x and y = x² is revolved about the x-axis. The volume of the resulting solid is',
    ['2π/15', 'π/15', '8π/15', 'π/6'], 'A', '2π/15',
    'This needs WASHERS: the outer radius is the line x and the inner radius is the parabola x², so V = π∫₀¹ (x² − x⁴) dx = π(1/3 − 1/5) = 2π/15. Squaring the DIFFERENCE (x − x²)² instead of taking the difference of squares gives π/30 — the classic washer error, and the reason choice B looks plausible.', 'U8'],

  // ── volume by cross-sections ──
  ['volume-cross-sections', 3, 'The base of a solid is the region bounded by y = √x, y = 0 and x = 4. Cross-sections perpendicular to the x-axis are squares. The volume is',
    ['4', '8', '16', '32/3'], 'B', '8',
    'Each square has side √x, so its area is (√x)² = x, and V = ∫₀⁴ x dx = 8. No π appears — the solid is built from squares, not circles, which is what choice D\'s disk-style value assumes.', 'U8'],
  ['volume-cross-sections', 3, 'The base of a solid is the region bounded by y = 1 − x² and the x-axis. Cross-sections perpendicular to the x-axis are squares. The volume is',
    ['16/15', '8/15', '4/3', '2'], 'A', '16/15',
    'The side length is 1 − x², so V = ∫₋₁¹ (1 − x²)² dx = ∫₋₁¹ (1 − 2x² + x⁴) dx = 16/15. Choice B integrates over only 0 to 1 and forgets that the base is symmetric about the y-axis.', 'U8'],
  ['volume-cross-sections', 4, 'The base of a solid is the region bounded by y = x and y = x². Cross-sections perpendicular to the x-axis are squares. The volume is',
    ['1/30', '1/6', '1/12', '1/5'], 'A', '1/30',
    'The side of each square is the vertical gap x − x², so V = ∫₀¹ (x − x²)² dx = ∫₀¹ (x² − 2x³ + x⁴) dx = 1/3 − 1/2 + 1/5 = 1/30. Choice B is the AREA of the base region, not the volume — a sign the squaring step was skipped.', 'U8'],
  ['volume-cross-sections', 4, 'The base of a solid is the region bounded by y = 2 − x, x = 0 and y = 0. Cross-sections perpendicular to the x-axis are equilateral triangles. The volume is',
    ['2√3/3', '8/3', '√3/3', '4√3/3'], 'A', '2√3/3',
    'An equilateral triangle of side s has area (√3/4)s², and here s = 2 − x, so V = (√3/4)∫₀² (2 − x)² dx = (√3/4)(8/3) = 2√3/3. Choice B drops the (√3/4) factor and treats the cross-sections as squares.', 'U8'],

  // ── implicit differentiation ──
  ['implicit-differentiation', 3, 'If x² + y² = 25, then dy/dx =',
    ['−x/y', 'x/y', '−y/x', '−2x'], 'A', '−x/y',
    'Differentiating both sides with respect to x gives 2x + 2y·(dy/dx) = 0, so dy/dx = −x/y. Choice B loses the sign when isolating; choice D forgets that y is a function of x and so never produces the dy/dx term at all.', 'U3'],
  ['implicit-differentiation', 4, 'If x² + xy + y² = 7, then dy/dx at the point (1, 2) is',
    ['−4/5', '−5/4', '4/5', '−1/2'], 'A', '−4/5',
    'The middle term needs the PRODUCT rule: 2x + (y + x·y′) + 2y·y′ = 0, so y′(x + 2y) = −(2x + y) and y′ = −(2x + y)/(x + 2y). At (1, 2) that is −(2 + 2)/(1 + 4) = −4/5. Choice B inverts the fraction — a sign the two grouped factors were swapped.', 'U3'],

  // ── derivatives of inverse functions ──
  ['inverse-function-derivatives', 3, 'd/dx [arctan x] =',
    ['1/(1 + x²)', '1/√(1 − x²)', '−1/(1 + x²)', 'sec² x'], 'A', '1/(1 + x²)',
    'The derivative of arctan x is 1/(1 + x²). Choice B is the derivative of arcsin x and choice C is the derivative of arccot x — the inverse trig derivatives differ only by which sign and which radical, so they are easy to confuse.', 'U3'],
  ['inverse-function-derivatives', 4, 'Let f(x) = x³ + x + 1 and let g be the inverse of f. Then g′(3) =',
    ['1/4', '4', '1/3', '1/13'], 'A', '1/4',
    'Use g′(a) = 1/f′(g(a)). Since f(1) = 3, g(3) = 1. With f′(x) = 3x² + 1, f′(1) = 4, so g′(3) = 1/4. Choice B forgets to take the reciprocal; choice D evaluates f′ at 3 instead of at g(3) = 1.', 'U3'],

  // ── basic differentiation rules ──
  ['basic-differentiation-rules', 2, 'd/dx [3x⁴ − 5x + 7] =',
    ['12x³ − 5', '12x³ − 5x', '3x³ − 5', '12x³ + 7'], 'A', '12x³ − 5',
    'Apply the power rule term by term: 3x⁴ → 12x³, −5x → −5, and the constant 7 → 0. Choice D keeps the constant, which always differentiates to zero; choice B fails to reduce the exponent on the linear term.', 'U2'],
];

const items = ROWS.map((r, i) => {
  const [skillId, difficulty, prompt, opts, correct, value, explanation, unit] = r;
  const options = ['A', 'B', 'C', 'D'].map((label, k) => ({ label, text: opts[k] }));
  const problemId = `calc-ab-top-${String(i + 1).padStart(3, '0')}`;
  return {
    problemId,
    skillId,
    prompt,
    svg: null,
    // ASCII/plain surface forms so exact-match grading accepts what a student
    // actually types (see scripts/backfillAnswerEquivalents.js).
    answer: {
      type: 'exact',
      value,
      equivalents: [...new Set([
        value.replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/'),
        value.replace(/\s+/g, ''),
      ])].filter((v) => v && v !== value),
    },
    answerType: 'multiple-choice',
    options,
    correctOption: correct,
    difficulty,
    gradeBand: 'Calculus',
    explanation,
    tags: ['calc-ab', 'ap-calc-ab', unit, 'topup', 'no-calc', `subskill:${skillId}`],
    source: 'calc-topup',
    contentHash: crypto.createHash('sha256').update(`${skillId}|${prompt}|${value}`).digest('hex'),
    isActive: true,
  };
});

// Every correctOption must actually name the option holding the stated answer.
for (const it of items) {
  const chosen = it.options.find((o) => o.label === it.correctOption);
  if (!chosen) throw new Error(`${it.problemId}: correctOption ${it.correctOption} not among options`);
  if (chosen.text !== it.answer.value) {
    throw new Error(`${it.problemId}: correctOption text ${JSON.stringify(chosen.text)} !== answer.value ${JSON.stringify(it.answer.value)}`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(items, null, 1));
const bySkill = items.reduce((m, i) => ({ ...m, [i.skillId]: (m[i.skillId] || 0) + 1 }), {});
console.log(`Wrote ${items.length} items to ${path.relative(process.cwd(), OUT)}`);
console.log(Object.entries(bySkill).map(([k, v]) => `  ${String(v).padStart(2)}  ${k}`).join('\n'));
