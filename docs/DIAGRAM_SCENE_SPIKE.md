# Diagram Scene Engine — Spike Findings (2026-07-11)

**Question:** can the board draw *any* K‑12 geometry figure without a hand‑authored
type per figure, while keeping the two non‑negotiables — **correct‑by‑construction**
math and **anti‑cheat safety**?

**Answer from this spike: yes, via a declarative scene the engine *solves*.** Proven
with two composed figures no hardcoded type covers, browser‑verified and numerically
checked to 1e‑6.

## The idea

Don't let the model place coordinates (it gets the math wrong). Let it **declare a
construction** — objects + relations + marks — and let a deterministic engine
**solve** for coordinates. Correctness lives in the engine, not the model.

- **Objects** carry relations: `point{at}`, `midpoint{of:[A,B]}`,
  `intersection{of:[l1,l2]}`, `glider{on:circle}`, `segment/line/ray`, `circle`,
  `polygon`, `parallel{through,to}`, `perpendicular{through,to}`.
- **Marks** attach to solved points: `tick`, `angle`, `right`, `parallel` (chevrons),
  `label`.

Two layers:
- `public/js/sceneSpec.js` — **pure, Node‑testable**: validates references, rejects
  cycles, returns a topological build order. (6 unit tests.)
- `public/js/sceneRenderer.js` — draws with JSXGraph, using its **constructive
  primitives** (`midpoint`, `intersection`, `parallel`, `perpendicular`, `glider`)
  as the solver. That delegation is the whole trick.

## What the spike proved

| Figure | Declared relations | Numeric check (browser) |
|---|---|---|
| Triangle **midsegment** | D,E = midpoints of AB,AC; DE = segment | `DE ∥ BC` (slopes equal), `AD=DB`, `AE=EC` — all ✓ |
| **Transversal** of two parallels | l2 = parallel to l1 through Q; X1,X2 = intersections | corresponding angles **60.26° = 60.26°** ✓ |

Both figures were composed, not authored. The theorems (midsegment ∥, equal
corresponding angles) hold **exactly** because JSXGraph computed the points.

## Render gotchas (same as the congruent_triangles primitive)

- JSXGraph `angle([A,B,C])` sweeps CCW and will draw the **reflex** angle as a filled
  disk — order the rays so the interior (<180°) angle is drawn. (Handled in the
  renderer.)
- Angle mark radius must be small relative to the figure or it reads as a disk.

## Recommended next steps (to productionize)

1. **Safety gate on the SOLVED figure — ✅ BUILT (2026-07-11).** `utils/sceneGate.js`
   (mirrors `visualGate`: deterministic, transform-or-block, mode ladder) +
   `sceneSpec.redactScene`/`extractSceneValues`. Scenes carry `measure` marks
   (the value a figure displays = the leak vector). The gate: (a) `redactAll` for
   the student's own problem hides `solve:true` unknowns → `x = ?`, **givens
   stay**; (b) any displayed value equal to the known answer is redacted, or the
   scene is blocked if it can't be. 19 unit tests + browser-verified redaction
   (right-triangle "find x": AB=6/BC=8 kept, x → ?). A structured scene can redact
   selectively; a raster can't — the reason to stay structured.
2. **Model emission.** Strict JSON schema for scenes + prompt guidance, behind a flag
   (mirror `DIAGRAM_BOARD` / the `conceptModelCommand.js` generated‑spec pattern).
3. **Grow the relation vocabulary as needed:** `reflect/rotate/translate`,
   `angle_bisector`, `tangent`, `point_at_distance`, `arc`. Most K‑12 cases are
   covered by JSXGraph natives; only genuinely under/over‑constrained scenes need a
   small numeric solver.
4. **Auto‑layout:** auto‑fit `extent` and auto‑label so the model needn't supply them.
5. **Catalog types become macros** that expand into scenes — one renderer, no forked
   paths. (`congruent_triangles`, `inscribed_angle` → scene macros.)

## Scope note

The goal is "any **K‑12 geometry/graph** figure, correct and safe" — not literally any
image. That boundary is what keeps it deterministic instead of sliding back to
gen‑AI raster (which renders math wrong and can leak answers).

## Spike artifacts

`public/js/sceneSpec.js`, `public/js/sceneRenderer.js`, `tests/unit/sceneSpec.test.js`.
The throwaway browser harness (`public/_scene_harness.html`) was used to verify and
then removed. Branch: `spike/diagram-scene-schema`.
