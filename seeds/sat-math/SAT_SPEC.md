# Mathmatix Digital SAT Math Bootcamp — Assessment Authoring Spec (v1)

> Authoring contract for the SAT Math item bank. Same pipeline as the ACT and AP
> Calc bootcamps: Fable authors machine-verifiable JSON to this spec → we ingest
> → sympy-audit → wire the delivery rail + day-one card.
>
> Format below reflects the **current Digital SAT** (2024+ digital, adaptive).
> **All questions ORIGINAL** — never reproduce released College Board items.

---

## 1. The real test (align to this)

The Digital SAT **Math section**: **70 minutes, 44 questions**, split into **two
22-question modules (35 minutes each)**. The section is **multistage adaptive** —
performance on Module 1 sets the difficulty of Module 2. Questions are
**~75% multiple-choice (4 choices, A–D)** and **~25% student-produced response
(SPR / "grid-in")** where the student types the answer. A **calculator is allowed
on every question** (a graphing calculator is built in). Scored **200–800**.

Four content **domains** (official weights, approximate):

| Domain | Weight | ≈ items / 44 |
|--------|--------|--------------|
| Algebra | ~35% | 13–15 |
| Advanced Math | ~35% | 13–15 |
| Problem-Solving and Data Analysis | ~15% | 5–7 |
| Geometry and Trigonometry | ~15% | 5–7 |

Questions from all four domains appear in **both** modules; within a module they
run roughly easiest → hardest.

---

## 2. Bootcamp structure (what to author)

**5 weekly diagnostics** driving a tutor-planned bootcamp (same loop as the ACT /
AP Calc bootcamps): weekly diagnostic → auto-scored → tutor-committed weekly plan
→ targeted teaching → re-assess. **Every item auto-scores** (MC by key, SPR by
exact/equivalent match) — no human/AI FRQ grading needed.

| Week | Focus (emphasis; all domains still appear) | Size |
|------|--------------------------------------------|------|
| W1 "Heart of Algebra" | Algebra-heavy | 22 (one module) |
| W2 "Advanced Math" | Advanced Math-heavy | 22 |
| W3 "Data & Problem-Solving" | Problem-Solving and Data Analysis-heavy | 22 |
| W4 "Geometry & Trig + retention" | Geometry/Trig-heavy, Algebra/Advanced retention | 22 |
| W5 "Exit (full section)" | All domains at real weights | 44 (full section) |

Per **22-item** diagnostic: **~17 MC + ~5 SPR**. The **W5 exit** is a full
44-item section at real domain weights (≈15 Algebra, 15 Advanced Math, 7 PSDA,
7 Geometry/Trig; ≈33 MC + 11 SPR). Difficulty mix per diagnostic: roughly
**7 easy, 10 medium, 5 hard** (scale for W5).

Total bank ≈ **132 items** across 5 weeks.

---

## 3. Domains → skills (tag every item)

Use the official SAT skill labels. `"domain"` is one of `ALG`, `ADV`, `PSDA`,
`GEO`; `"skill"` is a short label from its domain.

- **ALG — Algebra:** linear equations in one variable · linear equations in two
  variables · linear functions · systems of two linear equations · linear
  inequalities (one/two variables).
- **ADV — Advanced Math:** equivalent expressions · nonlinear equations & systems
  · nonlinear functions (quadratic, exponential, polynomial, rational, radical).
- **PSDA — Problem-Solving and Data Analysis:** ratios/rates/proportional
  relationships & units · percentages · one-variable data (center & spread) ·
  two-variable data (scatterplots & models) · probability & conditional
  probability · inference & margin of error · evaluating statistical claims.
- **GEO — Geometry and Trigonometry:** area & volume · lines, angles & triangles ·
  right triangles & trigonometry · circles.

---

## 4. Question types

### Multiple choice (`"type":"mc"`)
Exactly **4 choices**, lettered **A–D** on every item. `"answer"` is the 0-based
index of the correct choice.

### Student-produced response / grid-in (`"type":"spr"`)
No choices. The student types the answer. Encode the canonical answer plus **all
acceptable equivalent forms** the on-screen grid accepts, because the platform
matches leniently against them.

Digital SAT grid-in entry rules (author answers to these):
- Answers are **numeric only** — no symbols (`%`, `$`, commas), no units, no `π`.
- **Fractions and decimals are both accepted**; author both when either is clean
  (e.g. `"answer":"7/2"`, `"equivalents":["3.5"]`).
- **No mixed numbers** — express as an improper fraction or a decimal
  (`5/2`, not `2 1/2`).
- Entry field fits **up to 5 characters** for a positive answer (**6** with a
  negative sign). If a fraction doesn't fit, give the **truncated or rounded
  decimal** that fills the field, and list every accepted rounding as an
  equivalent (e.g. `2/3` → `"answer":"2/3"`, `"equivalents":[".6666",".6667",".667"]`).
- Negative values are allowed; author them with a leading `-`.
- If an item has **more than one correct value**, list them all in `answer_any`.

---

## 5. Notation (plain text + Unicode; NO LaTeX)
`x²`, `x³`, `√`, `≤`, `≥`, `≠`, `−`, `°`, `π`, `≈`, fractions as `a/b` (parenthesize
as needed), `f(x)`, exponents like `2^x`, `|x|`. Currency/units belong in the stem
prose, never in an SPR answer.

---

## 6. Figures — fixed library only (params per item; no multi-version)
Reuse the AP-Calc renderer family plus SAT staples. Allowed `kind`s:
- `"fgraph"`: `{"expr":"2*x-3","xmin":-10,"xmax":10,"ymin":-10,"ymax":10}` (numpy expr in x).
- `"scatter"`: `{"pts":[[1,2],[3,5],...],"xlabel":"...","ylabel":"...","line":{"slope":..,"yint":..}}` (line optional line-of-best-fit).
- `"bar"`: `{"labels":["A","B",...],"values":[...],"xlabel":"...","ylabel":"..."}`.
- `"table"`: `{"headers":[...],"rows":[[...]]}`.
- `"geometry"`: labeled figure — `{"shape":"triangle"|"rectangle"|"circle"|"lines","labels":{...},"marks":{...}}` (describe vertices/side/angle labels; renderer draws to scale where possible, schematic otherwise).
- `"numberline"`: `{"min":..,"max":..}` (+ key-only `numberline_answer` for inequalities).

≤5 figure items per diagnostic. Data-analysis items (scatterplots, two-way tables,
bar/box plots) are an SAT staple — use them in PSDA.

---

## 7. Output JSON — one file per week: `sat_w{N}.json`

```json
{
  "week": 1,
  "title": "Heart of Algebra",
  "items": [
    {
      "n": 1,
      "domain": "ALG",
      "skill": "Linear equations in two variables",
      "difficulty": "E",                        // "E" | "M" | "H"
      "type": "mc",                             // "mc" | "spr"
      "stem": "...",
      "choices": ["A text","B","C","D"],        // mc only; null for spr
      "answer": 2,                              // mc: 0-based index
      "spr_answer": null,                       // spr: canonical string, e.g. "7/2"
      "equivalents": [],                        // spr: accepted alternate forms, e.g. ["3.5"]
      "answer_any": null,                       // spr: array if multiple values are correct
      "explanation": "2–4 sentence worked solution.",
      "verify": "sympy snippet or null",
      "figure": null                            // or { "kind": "...", "params": {...} }
    }
  ]
}
```

For W5 the exit is the same schema with 44 items (add `"module": 1|2` per item so
the section can render as two modules).

---

## 8. Hard rules

1. **Every answer verified** by a `verify` sympy snippet wherever computable
   (solve/limit/simplify/roots/stats). SPR answers: the snippet must reproduce the
   canonical value AND confirm each listed equivalent is numerically equal.
2. **Distractors model real SAT errors** — sign slips, using slope for intercept,
   part-vs-whole percent errors, dividing instead of multiplying a rate, reversing
   a ratio, forgetting to distribute, misreading a scatterplot trend.
3. **Difficulty honesty** — label E/M/H truthfully; within a diagnostic order
   items roughly easy→hard (mirrors a real module).
4. **No duplicate skill+structure** within a diagnostic; vary contexts and numbers.
   No context reused across weeks (bank a fresh set of scenarios per week).
5. **Calculator-fair** — items should be solvable exactly; calculator may help
   (numeric roots, stats) but shouldn't be required to trivialize the concept.
6. **SPR realism** — grid-in answers must obey §4 entry rules (numeric only,
   fits the field, both fraction and decimal forms where clean).
7. **Answer-letter balance** across each MC set (roughly even A/B/C/D).

---

## 9. What the platform does with it (context)

Ingest tags each item with a catalog skillId (SAT domain/skill), bakes figures to
SVG, and auto-scores every item (MC by key, SPR by canonical/equivalent match).
The weekly rail projects an **approximate 200–800 Math band** from the composite,
ranks weak skills by `(1 − accuracy) × domain weight × recency`, commits a
≤3-topic weekly plan, and seeds the tutor plan — identical to the ACT/Calc loop,
minus any FRQ step.
