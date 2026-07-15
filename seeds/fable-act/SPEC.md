# Enhanced ACT Math Practice Test — Authoring Spec (v1)

## Format (matches the real enhanced ACT, 2025+)
- 45 questions, 50 minutes, calculator permitted throughout.
- 4 answer choices. Odd-numbered questions use letters A, B, C, D. Even-numbered use F, G, H, J.
- Difficulty ramps: Q1–15 easy, Q16–30 medium, Q31–45 hard. Topics interleaved (never 3 questions in a row from the same subcategory).
- Reduced word-problem load vs. legacy ACT: at least half the questions should be direct computation/manipulation with minimal reading. Word problems must be short (≤3 sentences of setup).

## Blueprint (per official ACT reporting categories, scaled to 45 questions)
Categories:
- NQ  = Number & Quantity (real/complex numbers, exponents, radicals, vectors/matrices basics)
- ALG = Algebra (linear/quadratic/polynomial/radical/exponential expressions & equations, systems, inequalities, absolute value)
- FUN = Functions (notation, composition, transformations, linear/quadratic/exponential/piecewise models, graphs, sequences, logarithms as functions, trig functions)
- GEO = Geometry (angles, triangles, circles, area/volume/surface area, similarity/congruence, coordinate geometry of shapes, right-triangle trig, unit circle, equations of circles)
- SP  = Statistics & Probability (center/spread, data interpretation, probability incl. conditional, counting, expected value, sampling)
- IES = Integrating Essential Skills (pre-algebra foundations: rates, percentages, proportions, unit conversion, basic average, simple area/perimeter/volume, number sense — often multi-step, synthesizing skills)
- MOD = Modeling: cross-cutting flag (not a separate count). Flag ≥ 10 questions per test `"modeling": true` (questions that produce/interpret/evaluate a mathematical model of a real situation).

Per-test counts (each column sums to 45):
| Category | T1 | T2 | T3 | T4 | T5 |
|----------|----|----|----|----|----|
| NQ       | 5  | 5  | 5  | 5  | 6  |
| ALG      | 8  | 8  | 9  | 8  | 8  |
| FUN      | 8  | 8  | 8  | 9  | 8  |
| GEO      | 8  | 9  | 8  | 8  | 8  |
| SP       | 7  | 6  | 6  | 6  | 6  |
| IES      | 9  | 9  | 9  | 9  | 9  |

## Content rules
1. **All questions must be novel.** Do not reproduce or closely paraphrase items from real ACTs, released practice tests, or any prep book. Invent fresh numbers, contexts, and wordings.
2. Every question must have exactly one correct choice. Distractors must reflect plausible errors (sign slip, wrong operation, off-by-one, using radius vs diameter, etc.) — never random numbers.
3. Notation: plain text + Unicode only. Use ², ³, √, π, ≤, ≥, ≠, °, ±, ∠, △, ⊥, ∥, |x|, f(x), and fractions written as a/b or (a+b)/c. NO LaTeX, NO markdown styling inside stems/choices.
4. Answers among choices: roughly balance correct-letter positions (each position ≈ 25% over the test).
5. Trig: include 2–3 trig questions per test (SOH-CAH-TOA, unit circle, law of sines/cosines, or graph of sin/cos).
6. Matrices/vectors/complex numbers: ~1–2 per test under NQ.
7. Logs: ~1 per test.
8. Include exactly 5 figure-based questions per test (geometry diagrams, a data table, or a simple graph). Data tables: put the table in the stem using plain-text rows with | separators. For drawn figures, provide `figure_code`.

## Figures
For questions needing a drawn figure, include `"figure_code"`: a self-contained Python matplotlib snippet defining `def draw(ax):` that draws the figure on the given axes (no plt.show, no savefig, no text outside the axes). Keep figures simple, unlabeled-axis-clean, ACT-style (black/white, labeled points/lengths/angles). If a note is needed, the stem should say "Note: Figure not drawn to scale."

## Output format
Write a single JSON file: an object
{
  "test": <1-5>,
  "questions": [ ... 45 objects, in order ... ]
}
Each question object:
{
  "n": 1,
  "category": "ALG",
  "modeling": false,
  "difficulty": 1,          // 1=easy … 5=hard, ramping with position
  "stem": "...",
  "choices": ["...", "...", "...", "..."],   // exactly 4, in display order; do NOT include letter prefixes
  "answer": 0,              // 0-based index of correct choice
  "explanation": "2–4 sentence worked solution, referencing the correct letter.",
  "verify": "python expression or short snippet ending in a bare expression/print that recomputes the correct value, or null if not machine-checkable",
  "figure_code": null       // or the matplotlib snippet (exactly 5 questions per test have one)
}

## Voice/style
- Stems phrased like real ACT items: direct, unambiguous, present tense. "What is the value of x?", "Which of the following expressions is equivalent to …?"
- Use varied realistic contexts for word problems (given per test to avoid overlap between tests).
- Explanations: efficient and instructive, show the key steps, name the concept.
