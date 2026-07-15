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

- `alg1-items.generated.json` — 798 Problem docs (266 items × 3 versions).
- `alg1-skill-names.json` — `{ alg1-m{N}: "Module topic" }`.
- `alg1-assessment-map.json` — module → quiz/test → core/spiral → [problemId] (+ points),
  the structural map for the future assessment/checkpoint delivery rail.
- `alg1-catalog-crosswalk.json` — module → existing `skills-algebra-1.json` skillIds it covers.

## Correctness

762 per-version `verify` snippets run; 756 pass. The 6 that "fail" are
snippet-level false positives (Python float-vs-int and sympy structural `==`);
the answers are hand-verified correct and allowlisted in `auditAlg1Items.py`, so
`alg1:audit` exits non-zero only on a **new** regression.

## Skill tagging (status)

Items are tagged at **module level** (`alg1-m{N}`) for now — the Fable items
carry no per-item skill tag and modules don't map 1:1 to `skills-algebra-1.json`.
`alg1-catalog-crosswalk.json` scaffolds the follow-up **fine-grained per-item**
mapping (mirroring how the ACT bank went category → sub-skill).

## Deferred (follow-up PR)

- **Figure renderer** for the fixed declarative library (grid, numberline,
  line_graph, abs_graph, parabola, mapping, points, story, table + key overlays).
  Figures are preserved on each Problem (`figure` field) but not yet drawn.
- **Delivery rail**: wire module skills to BKT / `tutorPlan.skillFocus` so these
  become first-class Algebra 1 course checkpoints/practice, not just a poolable bank.
