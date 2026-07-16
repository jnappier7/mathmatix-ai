# AP Calculus AB Bootcamp — Assessment Bank (Fable-authored)

Source content for the AP Calculus AB bootcamp: **5 weekly diagnostics**, each
**15 MC + one 9-point FRQ**, AP-style and 2026 CED-aligned. Weeks 1–4 sweep the
course in blueprint order; Week 5 is a mini-AP exit exam at real-exam weights.
Every item is tagged by CED **unit (U1–U8)**, fine **skill** label, **Mathematical
Practice (MP1–4)**, and **calculator status**. All items are original.

See `../../docs/APCALCAB_BOOTCAMP_DESIGN.md` for the product design (weekly loop,
priority scoring, AP-band projection, path to a full course).

## Files

- `CALC_SPEC.md` — the authoring spec (item schema, figure library, weekly blueprint).
- `calc_w{N}.json` — one week: `{ week, title, mc:[15], frq:{context, parts:[{prompt, points, rubric, ...}]} }`.

## Pipeline

```
python3 scripts/ingestCalcItems.py   # calc:ingest — MC -> Problem docs + weekly map (needs matplotlib, numpy)
python3 scripts/auditCalcItems.py    # calc:audit  — run every sympy verify snippet
node   scripts/seedCalcItems.js --fresh   # calc:seed — upsert MC items into MongoDB (source: calc-fable)
```

Ingestion emits (in `seeds/`):

- `calc-items.generated.json` — 75 MC Problem docs (figures baked to `svg`).
- `calc-assessment-map.json` — week → `{ title, mc:[refs], frq:{context, parts, rubric, svg} }`,
  the input for the weekly bootcamp rail (auto-score MC + tutor-score FRQ).
- `calc-skill-coverage.json` — catalog skill → item count, unit → skills.

## Skills (no new catalog docs needed)

Each item's fine Fable `skill` label maps to an **existing** catalog skillId
(`scripts/calcSkillMap.py` → `seeds/skills-ap-calculus-ab.json`, already seeded via
`seed-curriculum.js`). All 67 labels map (0 unmapped), collapsing to the 30 catalog
skills the 5-week bank exercises. So BKT / mastery / `skillFocus` recognize these
items with **no new Skill docs** — the fine label is kept in a `subskill:` tag for
precise diagnostic feedback.

## Correctness

All **94 `verify` snippets pass** (sympy), 0 nulls — every computational MC answer
and FRQ rubric solution is machine-checked. `calc:audit` exits non-zero on any
failure.

## Figures (rendered)

`scripts/calcFigureRenderer.py` renders the fixed library — `fgraph` (function
plots, asymptotes broken), `pwlinear` (f′ graphs), `slopefield`, `region` (shaded
area between curves), `table` — to SVG (matplotlib for graphs, crisp SVG for
tables). Ingestion bakes each into `Problem.svg` / the FRQ's `svg`. Run
`python3 scripts/calcFigureRenderer.py` for a preview of every figure in the bank.

## Deferred (follow-up PR)

The **weekly bootcamp rail**: weekly diagnostic delivery, auto-scored MC +
tutor-scored FRQ against the rubric, priority-scored ≤3-topic weekly plan, and an
AP 1–5 band projection with a week-over-week trajectory. The assessment map is the
rail's input contract.
