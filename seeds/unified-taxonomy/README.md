# Map of Mathmatix — Unified Skill Taxonomy

The single skill taxonomy we're adopting platform-wide (Fable-authored). **315
skills** across **7 course levels** (ELEM → MS → ALG1 → GEO → ALG2 → PREC → CALC),
each belonging to exactly one of **6 cross-cutting strands** — the through-lines
that trace one big idea from elementary school to calculus:

| Strand | Name |
|--------|------|
| `QNT` | Quantity & Operations |
| `PRP` | Proportional Reasoning |
| `EQV` | Equivalence & Structure |
| `FNC` | Functional Dependence |
| `SPC` | Space & Measure |
| `DTA` | Data & Chance |

Skill ids are `COURSE.STRAND.n` (e.g. `MS.PRP.3`). Each skill carries same-course
`prereq_ids` and resolved cross-course `cross_prereq_ids` — a fully-connected
prerequisite graph (0 unresolved).

## Files

- `math_taxonomy.json` — source of record: `{ strands, courses, skills[] }`.
- `UNIFIED_SPEC.md` — Fable's authoring spec (skill schema, strand definitions, item schema).
- `../../docs/Map_of_Mathmatix.html` — the visual map.

## Pipeline

```
python3 scripts/genUnifiedSkills.py   # tax:skills — taxonomy -> Skill catalog docs
node   scripts/seedUnifiedSkills.js   # tax:seed   — upsert into MongoDB (non-destructive)
```

`genUnifiedSkills.py` maps each taxonomy skill to a `Skill` doc: the dotted id is
the `skillId`; `strand`/`courseLevel` are stored on the doc; the strand maps to a
representative `category` (BKT parameter lookup); `prereq_ids + cross_prereq_ids`
become `prerequisites`; grade → `gradeBand` by course. Guarded by
`tests/unit/unifiedTaxonomy.test.js` (coverage, schema, strands, prereq resolution).

## Adoption status

- **This pass:** the taxonomy is landed and seedable as catalog skills. It
  **coexists** with the existing per-course catalog (kebab ids like
  `solving-one-step-equations`).
- **Next:** ingest new content (SAT) under unified ids; then migrate the existing
  ACT / Algebra 1 / Calc banks to unified skill ids — with a **human review pass**
  on the auto-mapped items (Fable's migration self-flags many as weak-match).
