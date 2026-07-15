# Algebra 1 Assessment Bank (Fable-authored)

Source content for the Algebra 1 course item bank: 9 modules (M1–7, M10, M11),
each with one **Quiz** (8 core + 3 spiral) and one **Test** (12–14 core + 5
spiral). Every item is written in **3 parallel versions** (identical structure,
different numbers/contexts) for assessment integrity and retakes.

Authored by Fable 5 to `ALG1_SPEC.md` (the authoring spec, kept here as the
contract). Teacher-style, free-response ("show all your work"), with
error-analysis, justify/explain, and multi-step application items, plus a
separately-graded spiral-review section drawn from earlier modules.

## Files

- `ALG1_SPEC.md` — the authoring spec (item schema, figure library, module coverage).
- `alg1_m{N}.json` — one module: `{ module, topics, quiz:{items,spiral}, test:{items,spiral} }`.

## Pipeline

```
python3 scripts/ingestAlg1Items.py   # alg1:ingest — expand 3 versions -> Problem docs + maps
python3 scripts/auditAlg1Items.py    # alg1:audit  — run every verify snippet (needs sympy)
node   scripts/seedAlg1Items.js --fresh   # alg1:seed — upsert into MongoDB (source: alg1-fable)
```

Ingestion emits (in `seeds/`):

- `alg1-items.generated.json` — 798 Problem docs (266 items × 3 versions), fine skillId each.
- `alg1-skill-names.json` — `{ fineSkillId: "Readable name" }`.
- `alg1-assessment-map.json` — module → quiz/test → core/spiral → [{problemId, skillId}] (+ points),
  the structural map for the future assessment/checkpoint delivery rail.
- `alg1-skills-by-module.json` — module → `[{skillId, name, inCatalog}]`, the worklist for BKT wiring.

## Correctness

762 per-version `verify` snippets run; 756 pass. The 6 that "fail" are
snippet-level false positives (Python float-vs-int and sympy structural `==`);
the answers are hand-verified correct and allowlisted in `auditAlg1Items.py`, so
`alg1:audit` exits non-zero only on a **new** regression.

## Skill tagging (fine-grained)

Each item is tagged with an **exact sub-skill** by `scripts/alg1SkillClassifier.py`
— a deterministic, per-module keyword classifier (e.g. `completing-the-square`,
`factoring-trinomials`, `parallel-perpendicular-lines`). It reuses existing
catalog skillIds (`skills-algebra-1.json`) where they exist and adds fine ids for
the gaps; spiral-review items are tagged by their **source** module. Every one of
the 266 items maps to a fine skill (0 coarse fallbacks) across **63 distinct
skills** (16 already in the catalog, 47 new). `alg1-skills-by-module.json` lists
them per module with an `inCatalog` flag — the worklist for wiring them to BKT.

**Forward-compatible with Fable tags:** if a per-item `skill` field is added to
the source JSONs (as the ACT bank now carries), the ingester prefers it over the
classifier, so gold-standard author tags can be swapped in with no rework.

## Figures (rendered)

`scripts/alg1FigureRenderer.py` renders the fixed declarative library (grid,
numberline, line_graph, abs_graph, parabola, mapping, points, story, table, plus
the key-only overlays numberline_answer / grid_answer) to clean self-contained
**SVG**. The ingester bakes each item's student figure into `Problem.svg` and the
answer overlay into `figure.keyFigure.svg`, so the existing inline-visual display
shows them with no frontend changes. Run `python3 scripts/alg1FigureRenderer.py`
for a preview of every kind.

## Deferred (follow-up PR)

- **Delivery rail**: wire the fine skills to BKT / `tutorPlan.skillFocus` (the 47
  new ones need Skill catalog docs) so these become first-class Algebra 1 course
  checkpoints/practice, not just a poolable bank — `alg1-skills-by-module.json` is
  the worklist.
