# Algebra 1 Assessment Authoring Spec (v1)

Course: Algebra 1, Modules 1–7, 10, 11. Each module gets ONE QUIZ and ONE TEST.
Style must match the teacher's existing assessments: free-response, "show all your work,"
real-world contexts, error-analysis items, occasional multiple choice (≤2 per assessment).

## Versions
Every item is written in THREE parallel versions (v1, v2, v3): identical structure and wording,
different numbers/names/contexts-details. Versions are NOT labeled on the student form.
Difficulty must be equivalent across versions (e.g., if v1 factors cleanly, v2 and v3 must too).

## Assessment shape
QUIZ: 8 core items (~20 pts) + SPIRAL REVIEW: 3 items (6 pts).
TEST: 12–14 core items (~40 pts, sub-parts allowed like 4a/4b) + SPIRAL REVIEW: 5 items (10 pts).
Every item gets an explicit point value (1–4 pts).

## This year's emphases (KEY)
1. FLUENCY: each assessment opens with 2–3 quick procedural items (1–2 pts each) a fluent
   student finishes in under a minute each.
2. RIGOR: each TEST includes ≥1 error-analysis item ("X solved it this way… identify the mistake,
   then show the correct solution"), ≥1 multi-step application, and ≥1 justify/explain prompt
   ("Explain how you know…"). Each QUIZ includes ≥1 of these three.
3. RETENTION: the SPIRAL REVIEW section at the end is graded separately. Quick, procedural,
   drawn from EARLIER modules (see per-module spiral sources below). Label each spiral item
   with its source module in the JSON (not on the student page).

## Notation
Plain text + Unicode only: x², √, π, ≤, ≥, ≠, −, °, |x|, fractions as a/b or stacked "3/4".
Variables italicized by the renderer — just write plain letters. NO LaTeX, NO markdown.

## Figures — fixed library only
Items needing visuals use a `figure` object with `kind` + per-version `params` (list of 3).
Allowed kinds (renderer implements these; do NOT invent kinds or write drawing code):
- "grid":       blank coordinate grid for graphing. params: {"xmin":-10,"xmax":10,"ymin":-10,"ymax":10}
- "numberline": params: {"min":-10,"max":10}
- "line_graph": a drawn line to read slope/intercept from. params: {"slope":2,"yint":-3,"xmin":-8,"xmax":8}
- "abs_graph":  absolute value graph. params: {"h":2,"k":-1,"a":1}  (y = a|x−h|+k)
- "parabola":   params: {"a":1,"h":2,"k":-9,"xmin":-8,"xmax":8}
- "mapping":    mapping diagram. params: {"x":[1,2,3],"y":[4,5],"arrows":[[0,0],[1,1],[2,1]]}
- "points":     scatter of ordered pairs on grid. params: {"pts":[[1,2],[3,4]],"xmin":...}
- "story":      qualitative distance–time curve. params: {"segments":[[3,4],[2,0],[3,-4]]} (dx,dy runs)
- "table":      rendered as a real table, params: {"headers":["x","y"],"rows":[[1,3],[2,5]]}
KEY-ONLY overlays (for worked keys): "numberline_answer": {"min":..,"max":..,"point":3,"closed":true,"direction":"left"};
"grid_answer": {"lines":[{"slope":2,"yint":-3}],"points":[[1,2]],"xmin":...} ; "parabola" as above.
Use figures where the original assessments would (M3 function ID, M4/M5/M7 graphing, M6 number
lines, M11 parabolas). Keep ≤5 figure items per assessment.

## Module coverage (match, then slightly exceed, the originals' rigor)

M1 (Sections 1.1–1.2) — Expressions.
Quiz+Test: verbal→numerical & algebraic expressions (and reverse), order of operations incl.
exponents & grouping, evaluating expressions with substitution (incl. negatives, fractions),
error analysis of an order-of-operations mistake, two-variable expression word problem
(write, then evaluate). Spiral sources: pre-algebra — integer operations, fraction add/multiply,
decimal operations, one-step equations.

M2 — Solving Linear Equations.
Multi-step equations (variables both sides, distribution both sides, fraction coefficients like
(3/4)h + 3 = 15), rational proportion equations (e.g., (y+5)/(20y) = 1/12), literal equations
(solve y = mx + b for m; solve a formula for a variable), write-and-solve from a verbal statement,
equal-cost/equal-amount application (set two expressions equal), similar-figures shadow proportion.
Spiral: M1.

M3 (3.1–3.2+) — Functions & Relations.
Function vs not (ordered pairs, tables, mapping diagrams, graphs w/ vertical line test), which
added pair breaks a function (MC), function notation evaluation (f(x) = 3x−2 find f(−4); combined
f(a)+g(b) with absolute value/quadratic pieces), continuous vs discrete vs neither (contexts),
story-graph matching (MC), domain/range from a discrete set. Spiral: M1, M2.

M4 — Slope & Graphing Linear/Abs-Value Functions.
Convert standard→slope-intercept, slope from two points (incl. undefined/zero cases), slope &
y-intercept from equation, graph a line from slope-intercept form (grid figure), read slope from
a graphed line (line_graph figure), absolute value functions: vertex, transformations of
f(x)=|x−h|+k, graph one (abs_graph in key). Spiral: M2, M3.

M5 — Writing Linear Equations.
Three forms quick-reference (fluency opener: write generic slope-intercept, point-slope, standard),
write equation given slope+y-int; given point+slope (point-slope form); given two points; rewrite
between forms; parallel line through a point; perpendicular slope from standard form; standard-form
equation through point perpendicular to given line; linear model word problem (write & interpret).
Spiral: M2, M3, M4.

M6 — Linear Inequalities.
Solve & graph one-variable inequalities (flip on negative multiply/divide), match solution graph
(MC with numberline options — use 4 numberline_answer figures), compound inequalities (and/or),
write & solve inequality from context (perimeter/budget), interpret "at least/at most".
Spiral: M2, M4, M5.

M7 — Systems of Linear Equations.
Solve by graphing (grid figure), substitution, elimination (incl. multiply-first), classify number
of solutions (one/none/infinitely many), choose-your-method item, word problem (two-variable setup:
tickets/coins/mixture). Spiral: M4, M5, M6.

M10 — Polynomials & Factoring.
Add/subtract polynomials (standard form), multiply monomial×poly, binomial×binomial,
binomial×trinomial, special products (a+b)(a−b) and (a+b)², factor GCF, factor by grouping,
factor trinomials (a=1 and a>1), identify PRIME, factoring application (area/context).
Spiral: M2, M5, M7.

M11 — Quadratic Equations.
QUIZ mirrors the teacher's "choose your method" format: 5 equations, solve one by factoring, one
by square roots ("inserting a radical"), one by completing the square, one by quadratic formula,
one by student's choice — each version gets 5 fresh equations where each method has a clearly
best-fit equation. TEST: solve by each method individually, discriminant/number of solutions,
graph a parabola (vertex, axis of symmetry, parabola figure in key), projectile/area application.
Spiral: M6, M7, M10.

## Output JSON schema
One file per module: `alg1_m{N}.json`
{
 "module": 4,
 "topics": "Slope & Graphing",
 "quiz": {"items": [...], "spiral": [...]},
 "test": {"items": [...], "spiral": [...]}
}
Item object:
{
 "n": 1, "points": 2,
 "type": "work",                 // "work" | "mc" | "fill"
 "prompt": ["v1", "v2", "v3"],   // full student-facing text, parallel wording
 "choices": null,                // for "mc": [[4 strings v1],[v2],[v3]]
 "answer": ["v1", "v2", "v3"],   // final answer(s), concise
 "solution": ["v1", "v2", "v3"], // worked steps, one string, steps separated by " → " or "; "
 "verify": ["py or null", ...],  // per-version python/sympy snippet recomputing the answer, where possible
 "figure": null,                 // or {"kind": "...", "params": [{v1},{v2},{v3}]}
 "key_figure": null,             // optional key-only overlay figure, same 3-version structure
 "workspace": 2,                 // blank work area: 1 small, 2 medium, 3 large
 "spiral_source": null           // spiral items only: "M2" etc.
}
Spiral arrays use the same item schema (points 2 each, workspace 1, quick fluency style).

## Hard quality constraints
1. Every answer must be exact and verified. Clean numbers where the originals had clean numbers
   (factoring items must factor; completing-the-square quiz items should stay integer-friendly).
2. Versions must not share numbers on the SAME item (all three parameter sets distinct).
3. No item may duplicate another item's numbers within the same assessment.
4. Names/contexts: vary names (diverse, short) and contexts across items; do not reuse the
   teacher's exact contexts (Antoine bowling, Lena bookstore, Gus, Patrick's shadow, Oscar museum,
   Cade) — write new ones in the same spirit.
5. Instruction lines, e.g. "Try your best. Show all your work. Circle your final answer." are
   added by the renderer — do NOT include them in items.
