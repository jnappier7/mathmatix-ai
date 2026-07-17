# Mathmatix Digital SAT Math Bootcamp — Assessment Authoring Spec (v1, author-provided)

## 1. The real test (align to this)
Digital SAT Math: 70 min, 44 questions, two 22-question adaptive modules (35 min each).
~75% MC (4 choices A–D) + ~25% student-produced response (SPR/grid-in, typed answer).
Calculator allowed on every question. Scored 200–800.
Domain weights: Algebra ~35% (13–15/44) · Advanced Math ~35% (13–15) ·
Problem-Solving & Data Analysis ~15% (5–7) · Geometry & Trigonometry ~15% (5–7).
All domains appear in every module; items run roughly easiest → hardest within a module.

## 2. Bootcamp structure
5 weekly diagnostics, auto-scored (MC by key, SPR by exact/equivalent match). No FRQ grading.
W1 "Heart of Algebra" — Algebra-heavy — 22 items
W2 "Advanced Math" — Advanced-Math-heavy — 22
W3 "Data & Problem-Solving" — PSDA-heavy — 22
W4 "Geometry & Trig + retention" — Geo/Trig-heavy, ALG/ADV retention — 22
W5 "Exit (full section)" — all domains at real weights — 44 (≈15 ALG, 15 ADV, 7 PSDA, 7 GEO; ≈33 MC + 11 SPR; add "module":1|2 per item)
Per 22-item diagnostic: ~17 MC + ~5 SPR. Difficulty ≈ 7 E / 10 M / 5 H (scale for W5).

## 3. Domains → skills (tag every item; domain ∈ ALG, ADV, PSDA, GEO)
ALG: linear equations in one variable · linear equations in two variables · linear functions ·
systems of two linear equations · linear inequalities (one/two variables).
ADV: equivalent expressions · nonlinear equations & systems · nonlinear functions
(quadratic, exponential, polynomial, rational, radical).
PSDA: ratios/rates/proportional relationships & units · percentages · one-variable data
(center & spread) · two-variable data (scatterplots & models) · probability & conditional
probability · inference & margin of error · evaluating statistical claims.
GEO: area & volume · lines, angles & triangles · right triangles & trigonometry · circles.

## 4. Question types
"mc": exactly 4 choices A–D; "answer" = 0-based index.
"spr": no choices; encode canonical "spr_answer" + "equivalents" (all accepted forms) +
"answer_any" (array) when multiple values are correct.
Grid-in entry rules (author answers to these):
- numeric only — no %, $, commas, units, π
- fractions AND decimals accepted; author both when either is clean ("7/2" + ["3.5"])
- no mixed numbers (5/2 not 2 1/2)
- field fits 5 chars positive / 6 with leading '-'; if a fraction doesn't fit give the
  truncated/rounded decimal that fills the field and list every accepted rounding
  (2/3 → "2/3", equivalents [".6666",".6667",".667"])
- negatives allowed with leading '-'

## 5. Notation: plain text + Unicode (x², √, ≤, ≥, ≠, −, °, π, ≈, a/b, f(x), 2^x, |x|). NO LaTeX.
Currency/units in stem prose only, never in an SPR answer.

## 6. Figures — fixed library only, ≤5 figure items per diagnostic
"fgraph": {"expr":"2*x-3","xmin":-10,"xmax":10,"ymin":-10,"ymax":10}  (numpy expr in x)
"scatter": {"pts":[[x,y],...],"xlabel":"...","ylabel":"...","line":{"slope":..,"yint":..}}  (line optional)
"bar": {"labels":[...],"values":[...],"xlabel":"...","ylabel":"..."}
"table": {"headers":[...],"rows":[[...]]}
"geometry": {"shape":"triangle"|"rectangle"|"circle"|"lines","labels":{...},"marks":{...}}
"numberline": {"min":..,"max":..}
PSDA staples (scatterplots, two-way tables, bar plots) encouraged.

## 7. Output JSON — one file per week: sat_w{N}.json
{"week":1,"title":"Heart of Algebra","items":[{"n":1,"domain":"ALG",
 "skill":"Linear equations in two variables","difficulty":"E","type":"mc",
 "stem":"...","choices":["...","...","...","..."],"answer":2,
 "spr_answer":null,"equivalents":[],"answer_any":null,
 "explanation":"2–4 sentence worked solution.","verify":"sympy snippet or null","figure":null}]}
W5: same schema, 44 items, plus "module":1|2 per item.

## 8. Hard rules
- verify sympy snippet wherever computable; for SPR the snippet must reproduce the canonical
  value AND confirm each listed equivalent is numerically equal.
- Distractors model real SAT errors (sign slips, slope-for-intercept, part-vs-whole percent,
  divide-instead-of-multiply rate, reversed ratio, forgot to distribute, misread trend).
- Difficulty honesty (E/M/H); order items roughly easy→hard within a diagnostic.
- No duplicate skill+structure within a diagnostic; fresh contexts per week, none reused across weeks.
- Calculator-fair: solvable exactly; calculator helps but doesn't trivialize.
- SPR realism per §4. Answer-letter balance ≈ even A/B/C/D per MC set.
