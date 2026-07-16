# Mathmatix AP Calculus AB Bootcamp — Assessment Authoring Spec (v1)

5 weekly diagnostics driving a tutor-planned bootcamp (same loop as the Mathmatix ACT Bootcamp).
Each assessment: 15 MC + 1 FRQ, ~60 minutes, AP Calculus AB style (2026 CED-aligned).
All questions ORIGINAL — never reproduce released AP items.

## Weekly focus (coverage targets per assessment)
W1 "Foundations": U1 Limits & Continuity (6 MC), U2 Differentiation: Definition & Basic Rules (6 MC), U3 Composite/Implicit/Inverse (3 MC). FRQ: limits/derivative definition + tangent line.
W2 "Derivative Applications": U3 (3 MC), U4 Contextual Applications incl. related rates & L'Hospital (6 MC), U5 Analytical Applications incl. MVT, extrema, concavity, optimization (6 MC). FRQ: curve analysis from f′ graph.
W3 "Integration & FTC": U6 Integration & Accumulation (9 MC: Riemann sums, FTC, u-sub, accumulation), U7 Differential Equations incl. slope fields & separation (6 MC). FRQ: accumulation/FTC in context (rate in/rate out).
W4 "Applications of Integration": U8 (7 MC: avg value, motion, area, volumes by cross-section/disks/washers), mixed U4-U6 retention (8 MC). FRQ: area/volume.
W5 "Exit Exam (mini-AP)": all units weighted like the real exam — U1 2, U2 2, U3 2, U4 2, U5 3, U6 3, U7 1, U8 2 MC (=17? no — exactly 15: U1 1, U2 2, U3 2, U4 2, U5 3, U6 3, U7 1, U8 1). FRQ: particle motion (classic multi-unit synthesis).

## Structure per assessment
- MC Part A: Q1–Q10, NO CALCULATOR.
- MC Part B: Q11–Q15, CALCULATOR ALLOWED (write items where technology genuinely helps: numeric derivative/integral evaluation, root finding, but still solvable exactly).
- 4 answer choices (A–D odd, F–J even lettering? NO — AP uses A–D for all; use A, B, C, D on every item).
- FRQ: one question, parts (a)–(c) or (a)–(d), 9 points total, with an AP-style scoring rubric
  (point-by-point: what earns each point, e.g., "1 pt: sets f′(x) = 0", "1 pt: answer with justification").
- Difficulty: mix of AP levels — roughly 5 easy, 7 medium, 3 hard MC per assessment.

## Tagging (powers Mathmatix diagnostics)
Every item: "unit": "U1".."U8", "skill": short subskill label (e.g., "Chain rule", "Related rates",
"U-substitution", "Slope fields"), "practice": one of MP1 (Procedures), MP2 (Representations),
MP3 (Justification), MP4 (Communication), "calc": true/false.

## Notation (plain text + Unicode; NO LaTeX)
f′(x), g″(x), dy/dx, d/dx[...], ∫ f(x) dx, ∫₀⁴ (definite: subscript/superscript unicode or write
"∫ from 0 to 4 of f(x) dx" when bounds are complex), lim(x→2) f(x), e^x, ln x, sin x, cos x, tan x,
π, ∞, −, ≤, ≥, ≠, x², x³, √. Fractions a/b with parentheses as needed.

## Figures — fixed library only (params per the single version; no multi-version here)
- "fgraph": graph of a function. params: {"expr":"0.5*x**3 - 3*x", "xmin":-4,"xmax":4,"ymin":-6,"ymax":6}
  (expr is a python/numpy expression in x; may include np. functions as "np.sin(x)")
- "pwlinear": piecewise-linear graph (classic f′ graph items). params: {"pts":[[-4,0],[-1,3],[2,0],[4,-2]], ...ranges}
- "slopefield": params: {"expr":"x - y", "xmin":-3,"xmax":3,"ymin":-3,"ymax":3, "step":1}
- "region": shaded region between curves. params: {"expr1":"...","expr2":"...","a":0,"b":2, ...ranges}
- "table": data table. params: {"headers":["t","v(t)"],"rows":[[0,5],[2,8],[4,3]]}
≤4 figure items per assessment. Table-based items (Riemann sums from tables, average rate) encouraged — AP staple.

## Output JSON — one file per week: calc_w{N}.json
{
 "week": 1, "title": "Foundations: Limits and Basic Differentiation",
 "mc": [ 15 items: {"n":1,"unit":"U1","skill":"...","practice":"MP1","calc":false,
         "stem":"...","choices":["A text","B","C","D"],"answer":0,
         "explanation":"2–4 sentence worked solution.",
         "verify":"sympy snippet or null","figure":null or {"kind":"...","params":{...}} } ],
 "frq": {"unit":"U6","skill":"...","calc":false,
   "context":"shared setup paragraph",
   "parts":[{"label":"a","prompt":"...","points":3,"solution":"worked solution",
             "rubric":["1 pt: ...","1 pt: ...","1 pt: ..."],"verify":"sympy or null"}, ...],
   "figure": null or {...}}
}

## Hard rules
1. Every answer verified by sympy where possible (limits, derivatives, integrals, solves — sympy does all of this; verify snippets are MANDATORY for computational items).
2. Distractors = classic AP errors (dropped chain rule factor, sign error on decreasing interval,
   forgot +C context, reversed bounds, power rule off-by-one, product rule as product of derivatives).
3. Justification language matters (this is AP): explanations model correct justifications
   ("f is increasing because f′ > 0 on ...").
4. Answer letter positions roughly balanced across each assessment.
5. Calculator items (Q11–15): answers to 3 decimal places where appropriate (AP convention).
6. No item may duplicate a skill+structure combo within the same assessment; vary contexts
   (each week uses fresh scenarios; no reuse of contexts across weeks — W1: cooling coffee/drone/
   oil slick; W2: ladder/balloon/box design; W3: water tank/traffic flow/bacteria; W4: ski ramp/
   lake depth/rotated bowl; W5: particle on a line/highway traffic/melting ice).
