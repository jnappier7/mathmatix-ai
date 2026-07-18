# Digital SAT Math — Assessment Bank (Fable-authored)

Source content for the SAT bootcamp: **5 weekly diagnostics**, each a
full-length **Digital SAT Math module** (~22 items), authored to the **current
Digital SAT** format (adaptive, calculator throughout, two item types). Weeks 1–4
sweep the four domains in blueprint order; Week 5 is a mixed exit module at
real-exam domain weights. Every item is tagged by **domain**, fine **skill**
label, and **difficulty** band (E/M/H). All items are original.

Two auto-scored item types — there is **no free-response/rubric step** (the whole
SAT Math section is machine-scored):

- **mc** — 4-option (A–D) multiple choice.
- **spr** — student-produced response (grid-in): a numeric/fraction value,
  auto-scored against a canonical value plus accepted equivalents.

## Domains (College Board blueprint weights)

| Domain | Code | ~Weight |
|--------|------|---------|
| Algebra | `ALG` | ~35% |
| Advanced Math | `ADV` | ~35% |
| Problem-Solving & Data Analysis | `PSDA` | ~15% |
| Geometry & Trigonometry | `GEO` | ~15% |

## Files

- `SAT_SPEC.md` — the authoring spec (verified against the current College Board format).
- `SAT_SPEC.fable.md` — Fable's returned authoring spec.
- `sat_w{N}.json` — one week: `{ week, title, items:[{ n, domain, skill, difficulty,
  type, stem, choices?, answer?, spr_answer?, equivalents, answer_any, explanation,
  verify, figure }] }`.

## Pipeline

```
python3 scripts/ingestSatItems.py    # sat:ingest — items -> Problem docs + weekly map (needs matplotlib)
python3 scripts/auditSatItems.py     # sat:audit  — run every sympy verify snippet + structural checks
node   scripts/seedSatItems.js --fresh   # sat:seed — upsert items into MongoDB (source: sat-fable)
```

Ingestion emits (in `seeds/`):

- `sat-items.generated.json` — 132 Problem docs (101 MC + 31 grid-in; figures baked to `svg`).
- `sat-assessment-map.json` — week → `{ title, items:[refs] }`, the input for the
  weekly SAT bootcamp rail (all auto-scored — MC by option letter, grid-in by value).
- `sat-skill-coverage.json` — unified skillId → item count, domain → skills.

## Skills (unified taxonomy)

Unlike the calc/ACT/Alg1 banks (which map to their per-course catalogs), the SAT
bank is ingested **under the unified "Map of Mathmatix" taxonomy**
(`seeds/unified-taxonomy/math_taxonomy.json`). Each item's fine Fable `skill`
label maps to a unified `skill_id` via `scripts/satSkillMap.py` — SAT Math lives
at the ALG1 / ALG2 / GEO levels (plus MS for proportional-reasoning / percent).
All 79 labels map (0 unmapped), collapsing to the 30 unified skills the 5-week
bank exercises. BKT / mastery / `skillFocus` recognize these ids because the
unified skills are seeded as catalog `Skill` docs (`npm run tax:seed`). The fine
label is kept in a `subskill:` tag for precise diagnostic feedback.

## Correctness

All **125 `verify` snippets pass** (sympy), plus structural checks (MC answer
index in range; grid-in value present). `sat:audit` exits non-zero on any failure.

## Figures (rendered)

`scripts/satFigureRenderer.py` renders the SAT figure library — `scatter` (with
optional line of best fit), `bar`, `geometry` (schematic labeled right triangles /
parallel-lines-with-transversal), plus `fgraph` and `table` reused from the calc
renderer — to SVG. Ingestion bakes each into `Problem.svg`. Run
`python3 scripts/satFigureRenderer.py` for a preview of every figure in the bank.

## Weekly bootcamp rail

`sat-assessment-map.json` is the input contract for the SAT bootcamp rail
(auto-scored throughout — no FRQ/LLM step), the SAT analogue of the calc rail in
`routes/calcBootcamp.js`. That rail + the day-one diagnostic card are the
follow-up to this ingest.
