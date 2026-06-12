# Concept Models — interactive teaching visuals for the math workspace

Status: **design / roadmap** (2026-06-08). Renderer not yet built — see "Build order".

A **concept model** is a *manipulable* model of a math idea on the WorkBoard — the
student drags something and the relationship holds, correct by construction. This
is capability **#3 (use visuals to teach a concept)** of the workspace, and it
absorbs **#4 (interactives)**: every concept visual is interactive from the start.

> One line: turn the board into a set of **manipulable models the student
> discovers relationships in** — correct by construction, built live, coupled to
> the conversation.

---

## Why this shape (vs. the alternatives)

- **Web image search** → adjacent/approximate ("Parts of a Circle" for inscribed
  angle). Good fallback, never precise.
- **Generative raster / "draw me a diagram"** (DALL·E / Imagen) → *confidently
  wrong* math (mislabeled angles, garbled equations). Rejected.
- **Google Gemini "Guided Learning"** → *generates* interactive sims per prompt
  (orbit sliders, fractals, pendulum, molecule). Broad, **science-skewed,
  correctness-loose**. Validates the generative endgame — and exposes our gap to
  fill: **math correctness**. Google generates; we generate **and guarantee it's
  right**.
- **This: deterministic vocabulary + a measuring engine (JSXGraph).** The spec
  never *asserts* "60°" — it says *measure this angle and show it*. So a curated
  spec is correct by construction, and an **LLM-authored spec can pick a weird
  layout but cannot display wrong math.** That's the decision-first guarantee at
  the visual layer.

The proven, math-correct catalogs to mine are **PhET, GeoGebra, Desmos** — not
Google's generated science demos. The first model below (`slope_intercept_line`)
is literally PhET "Graphing Lines."

---

## Summoned with intent, not tabs (the workspace UX)

Tools are **not a tab bar** the student navigates (Board | Graph | Tiles | Calc =
a passive, decontextualized tool drawer). The board is the canvas, and a
manipulative **appears on it the moment it teaches something, framed by intent.**

Two trigger paths, one mechanism — both resolve to the same board command
(`{action:'model', model:'…', prompt:'…'}`):
- **Tutor summons it** → arrives *with intent* (a framing prompt: "let's use
  counters — type −7+10, then make zero pairs"). Driven by the `decide` move.
- **Student asks** → "can I use the counters?" / "show me a graph" → pops up
  on demand (an NL request recognized as a tool-summon). Honored directly; the
  tutor may add a light frame.

**Discoverability** (since there's no tab bar): the tutor offers tools at natural
moments + a single minimal affordance (a ⊕ / suggestion chip, not a drawer) +
NL requests are recognized. Same answer as the voice-first "where does it live"
question — surface it through the conversation, not a persistent drawer.

This is the difference between *"here are some math tools"* (a calculator app)
and *"a tutor who reaches for the right manipulative at the right moment"* (a
real teacher at a whiteboard). It also fixes two observed bugs by construction:
"graph went to chat, not the board" and "Tiles is a launcher tab" — everything
is summoned **onto the board, with a reason attached.**

The spec already carries this: `trigger` = *when it pops up*, `prompt` = *the
teaching intention*.

---

## The architecture

**Two rendering engines, one spec.** Concept models span two substrates — and we
own both. The declarative spec is unified; it dispatches by family/`engine`:
- **Continuous** — graphs, geometry, functions → **JSXGraph** (plane, point,
  circle, angle, function; drag-with-dependency). *New; building via the
  slope-intercept model.*
- **Discrete manipulatives** — counters, algebra tiles, base-ten, fraction
  pieces → the **token engine = `public/js/algebra-tiles.js`** (drag,
  auto-cancellation/zero-pairs, expression parsing). ***Already built.***

**Two-way param binding (the keystone).** A named `param` is the single source of
truth; sliders, draggable points, the function, and readouts all read/write it.
Drag the point → param changes → slider moves, line slides, equation updates —
automatically (JSXGraph's dependency graph does this with **zero update code**).

**Correctness.** Any measured quantity (`angle`, length, area, slope, ratio) is
*computed live by the engine*, never asserted by the spec or the LLM.

**Curate vs generate.**
- **Curate** the high-frequency families by hand (polished, pedagogically tuned).
- **Generate** the long tail: the LLM authors a spec in the fixed vocabulary; a
  validator checks every id/ref/param resolves; the engine renders + measures.
  Infinite breadth, still can't be math-wrong.

---

## The primitive vocabulary

Build once; every concept composes from these.

| Primitive | Key fields | Notes |
|---|---|---|
| `plane` | `x:[lo,hi]`, `y:[lo,hi]`, `grid`, `axisLabels` | coordinate system; optional for pure geometry |
| `slider` | `param`, `label`, `range`, `step`, `ticks` | a control bound to a param |
| `point` | `at:[x,y]` or `on:<element>`, `draggable`, `binds:<param>` | `on:` = constrained (glider); `binds:` = two-way |
| `segment` / `line` / `ray` | `from`,`to` / `through` | |
| `circle` / `arc` | `center`, `radius`/`through` | |
| `polygon` | `vertices:[ids]`, `fill` | |
| `angle` | `at`, `rays:[id,id]`, `measure` | `measure:true` → live value |
| `function` | `fn:"m*x+b"` (params), `domain` | bridges MathGraph |
| `transform` | `apply:reflect\|rotate\|translate\|dilate`, `of:[ids]`, `over/about/by` | produces an image set |
| `region` / `bar` | for fraction/area/number-line models | |
| `readout` | `bind` or `text:"…{param}…"`, `format` | live text; `format:"smartFraction"` |
| `token` *(token engine)* | `value`, `color`, `label` | discrete draggable chip (counter / tile) |
| `input` *(token engine)* | `expression`, `placeholder` | parse a typed expression → spawn tokens |
| `rule` *(token engine)* | `when:'overlap-opposite'`, `do:'annihilate'` | interaction rule (zero-pair cancel, group, snap) |

Behavior layer: `params` · `reveal:[ids]` (animation order) · `drag:[ids]` ·
`highlight` (chat-driven pulse) · `prompt` · `trigger` · `engine` (which renderer).

---

## Flagship spec — `slope_intercept_line`

*Designed end-to-end with Jason (2026-06-08), one decision at a time. PhET
"Graphing Lines" class. This is the model that forges the core vocabulary.*

```jsonc
{
  "model": "slope_intercept_line",
  "title": "y = mx + b",
  "params":   { "m": 1, "b": 0 },                 // single source of truth
  "controls": [
    { "type": "slider", "param": "m", "label": "m", "range": [-5,5], "step": 0.25, "ticks": false }, // glides, fractional
    { "type": "slider", "param": "b", "label": "b", "range": [-5,5], "step": 0.5,  "ticks": true }    // snaps to ticks
  ],
  "elements": [
    { "id": "plane", "type": "plane",    "x": [-10,10], "y": [-10,10], "grid": true, "axisLabels": true },
    { "id": "line",  "type": "function", "fn": "m*x + b" },
    { "id": "bDot",  "type": "point",    "at": [0,"b"], "on": "yAxis", "draggable": true, "binds": "b" },
    { "id": "eq",    "type": "readout",  "text": "y = {m}x + {b}", "format": "smartFraction", "at": "top" }
  ],
  "reveal":  ["plane", "line", "bDot", "eq"],
  "drag":    ["bDot"],
  "prompt":  "Slide m up — what happens? Then try both, and grab the dot where it crosses.",
  "trigger": ["tutor:teaching_lines", "student:asks_to_see"]
}
```

Design decisions baked in: fixed clean ±10 grid · m glides through fractional
slopes · b snaps to ticks · smart-fraction equation (so `3/2` reads as rise/run) ·
draggable y-intercept synced to the b slider · focused "slide m" challenge that
opens into free play · summonable by tutor or student.

**Sibling (asked for, design it next): `two_point_line`** — two draggable points
define the line; slope = rise/run readout *derived from the points*. Teaches slope
as "rise/run between two points" (the geometric origin) vs the slider's algebraic
"m is a knob." Same primitives.

### `integer_counters` (token engine — *configure, don't build*)

*Two-color chips for integer arithmetic (zero pairs). **Already shipped** as the
unit-tile subset of `algebra-tiles.js` (drag + auto-cancellation + expression
parsing + ±1 tiles). The "zero pairs / opposites" pedagogy is already first-class
in the board guard (Mr. Nappier methodology). Remaining work is an "integers-only"
config (±1, red/yellow) + summon wiring — not a build.*

```jsonc
{
  "model": "integer_counters",
  "engine": "tokens",                       // → algebra-tiles.js, not JSXGraph
  "input": { "expression": true, "placeholder": "-7 + 10" },
  "tokens": [
    { "value":  1, "color": "yellow", "label": "+" },
    { "value": -1, "color": "red",    "label": "-" }
  ],
  "rules":   [ { "when": "overlap-opposite", "do": "annihilate" } ],   // zero pair
  "readout": { "text": "Sum: {net}", "format": "signedInt" },
  "prompt":  "Type an expression -> drag a red onto a yellow to cancel -> what's left?"
}
```
Flow: `-7 + 10` → 7 red + 10 yellow → cancel 7 zero pairs → 3 yellow → **+3**.

### `function_transformations` (the universal-parent model — highest leverage)

*One model covers the **whole transformations unit**. `a·f(x−h)+k` is
parent-agnostic — `a` stretches/flips, `h` shifts left/right, `k` shifts up/down,
for **any** parent `f`. Swap the parent (x², |x|, x³, √x, …) and the SAME rules
hold — which is exactly the concept. Subsumes the standalone quadratic.*

```jsonc
{
  "model": "function_transformations",
  "title": "a · f(x − h) + k",
  "params": { "parent": "quadratic", "a": 1, "h": 0, "k": 0 },
  "parents": {                                          // swappable library, extensible
    "quadratic":   { "fn": "x^2",     "anchor": "vertex",     "label": "x²"  },
    "absolute":    { "fn": "abs(x)",  "anchor": "vertex",     "label": "|x|" },
    "cubic":       { "fn": "x^3",     "anchor": "inflection", "label": "x³"  },
    "square_root": { "fn": "sqrt(x)", "anchor": "endpoint",   "label": "√x", "domain": [0, null] }
    // later: reciprocal 1/x, exponential bˣ, sine — same model, more entries
  },
  "controls": [
    { "type": "choice", "param": "parent", "label": "parent" },                       // pick f
    { "type": "slider", "param": "a", "range": [-3,3], "step": 0.25, "ticks": false },
    { "type": "slider", "param": "h", "range": [-6,6], "step": 0.5,  "ticks": true },
    { "type": "slider", "param": "k", "range": [-6,6], "step": 0.5,  "ticks": true }
  ],
  "elements": [
    { "id": "plane",  "type": "plane",    "x": [-10,10], "y": [-10,10], "grid": true, "axisLabels": true },
    { "id": "parent", "type": "function", "fn": "{parent.fn}", "role": "reference", "always": true }, // ALWAYS faint; switches with parent
    { "id": "curve",  "type": "function", "fn": "a*{parent.fn @ (x-h)} + k" },
    { "id": "anchor", "type": "point",    "at": ["h","k"], "draggable": true, "binds": ["h","k"] },   // the parent's key point
    { "id": "eq",     "type": "readout",  "text": "{parent.equation}", "format": "smartFraction", "at": "top" }
  ],
  "reveal":  ["plane", "parent", "curve", "anchor", "eq"],
  "drag":    ["anchor"],
  "prompt":  "Drag the key point and slide a/h/k. Now switch the parent — do the SAME rules still work?"
}
```

Invariant: `(h,k)` is *always* the parent's key point (vertex / inflection /
endpoint), so the same draggable anchor + sliders + faint parent work for every
function — **zero per-parent custom work.** The faint parent is **always shown**
(not a toggle) and switches with the selection, so the transform always reads as a
change *from the current original.*

**Vocabulary additions (still no new primitives — just attributes):**
`choice` control (pick from a set) · `parents` library (named `fn`+`anchor`+`domain`) ·
`role:"reference"` + `always:true` (faint, fixed comparison element) ·
`point.binds:[p,p]` (a draggable point binding a *pair* of params).

### `equation_tiles` (token engine — solving equations)

*The tile sibling of the balance. Renders the **Mr. Nappier methodology** the
prompts already describe: "adds opposite tiles to both sides, cancels zero pairs,
then divides." Mostly a configure of `algebra-tiles.js` + a two-zone `=` layout +
the cross-the-`=` sign-flip.*

```jsonc
{
  "model": "equation_tiles", "engine": "tokens",
  "input": { "expression": true, "placeholder": "2x + 3 = 7" },
  "zones": ["left", "right"], "separator": "=",
  "tokens": [
    { "label": "x", "kind": "var", "sign": 1 }, { "label": "−x", "kind": "var", "sign": -1 },
    { "label": "+1", "kind": "unit", "sign": 1 }, { "label": "−1", "kind": "unit", "sign": -1 }
  ],
  "rules": [
    { "id": "stay-equal",  "invariant": "left == right" },                          // 1
    { "id": "zero-pair",   "when": "overlap-opposite",       "do": "annihilate" },  // 2 + 5
    { "id": "cross-the-=", "when": "drag-across-separator",  "do": "flip-sign" },   // 3
    { "id": "both-sides",  "when": "add-tile",               "require": "mirror-other-side" } // 4
  ],
  "goal": "isolate-x",
  "readout": { "text": "{equation}", "format": "smartFraction" },
  "prompt": "Get x by itself. Move a tile across the = (sign flips!) or add the same to both sides. Cancel zero pairs."
}
```
Jason's rules: (1) stay equal · (2/5) opposites make zero (same side) · (3) cross
the `=` → sign flips · (4) same on both sides.

### `area_model_factor` (token engine — multiply & factor)

*Algebra tiles laid out as an area rectangle. Forward = the box method (the four
regions ARE the expansion); backward = factoring as a packing puzzle — arrange the
pieces into a complete rectangle and its sides are the factors. `algebra-tiles.js`
already factors.*

```jsonc
{
  "model": "area_model_factor", "engine": "tokens", "modes": ["multiply", "factor"],
  "input": { "expression": true, "placeholder": "(x+3)(x+2)   or   x^2 + 5x + 6" },
  "rectangle": { "width": "x + p", "height": "x + q", "cells": ["x·x", "q·x", "p·x", "p·q"] },
  "controls": [
    { "type": "slider", "param": "p", "label": "width (x+?)",  "range": [-5,5], "step": 1 },
    { "type": "slider", "param": "q", "label": "height (x+?)", "range": [-5,5], "step": 1 }
  ],
  "rules":   [ { "mode": "factor", "goal": "complete-rectangle", "win": "sides == factors" } ],
  "readout": { "text": "(x + {p})(x + {q}) = x² + {p+q}x + {p·q}", "format": "smartFraction" },
  "prompt":  "Multiply: set the two factors → the four areas add to the answer. Factor: pack the pieces into a rectangle → its sides are the factors."
}
```

### `triangle_inequality` (JSXGraph — the first GEOMETRY model)

*"If the two short sides can't reach across the base, no triangle." The apex is the
**intersection of two reach-circles** (radius a at P, radius b at Q) — it exists
exactly when `a+b>c` and `|a−b|<c`, so the geometry decides; the model can't lie.
Shrink a/b and watch the arcs pull apart → the sides dangle without meeting.*

```jsonc
{
  "model": "triangle_inequality",
  "params": { "a": 4, "b": 3, "c": 6 },
  "controls": [
    { "type": "slider", "param": "a", "label": "side a", "range": [1,10], "step": 0.5 },
    { "type": "slider", "param": "b", "label": "side b", "range": [1,10], "step": 0.5 },
    { "type": "slider", "param": "c", "label": "base c", "range": [1,10], "step": 0.5 }
  ],
  "elements": [
    { "id": "P", "type": "point", "at": [0,0] }, { "id": "Q", "type": "point", "at": ["c",0] },
    { "id": "base",   "type": "segment", "from": "P", "to": "Q" },
    { "id": "reachA", "type": "circle", "center": "P", "radius": "a", "role": "reference" },
    { "id": "reachB", "type": "circle", "center": "Q", "radius": "b", "role": "reference" },
    { "id": "apex",   "type": "intersection", "of": ["reachA","reachB"] },   // exists iff sides reach
    { "id": "sideA",  "type": "segment", "from": "P", "to": "apex" },
    { "id": "sideB",  "type": "segment", "from": "Q", "to": "apex" },
    { "id": "check",  "type": "readout", "text": "a + b = {a+b}  vs  c = {c}  →  {reaches? '✓ triangle' : '✗ too short'}" }
  ],
  "prompt": "Shrink a and b — when do they get too short to reach across c? That gap is the triangle inequality."
}
```
Forges the geometry primitives: `point`, `segment`, `circle`, and **`intersection`**
(the meet point of two elements; it simply doesn't exist when they don't cross → the gap).

### `volume` (stub — to design; first 3-D substrate)

*Named, not yet designed. Likely the 3-D analog of the area model — a rectangular
prism (l×w×h) tiled with unit cubes → `V = lwh` (parallel to rectangle = L×W).
JSXGraph is 2-D, so this is the first model that wants a **third rendering engine**
(true 3-D, or an isometric 2½-D view). Design next.*

### The token half is mostly *configure, not build*

`integer_counters` + `equation_tiles` + `area_model_factor` are all configurations
of `algebra-tiles.js` — which already does drag, zero-pairs, expression-parsing,
AND factoring. So the **discrete half is largely shipped.** The real new
construction is the **JSXGraph continuous/geometry engine** (graphing models +
`triangle_inequality`), plus a future **3-D substrate** for `volume`.

---

## Build catalog — prioritized, deduped, mapped to the vocabulary

Sourced from PhET + GeoGebra + Desmos. **C** = curate (hand-build), **G** = good
long-tail / generate candidate.

### Tier 1 — curate first (forges the core vocabulary, highest frequency)
| Model | Source | What the student does | Primitives | |
|---|---|---|---|---|
| **Slope-intercept line** | PhET Graphing Lines | slide m/b, drag intercept | plane, slider, function, point, readout | **C** ✓ designed |
| Two-point line | PhET / GeoGebra | drag 2 points, slope readout updates | plane, point, line, readout | **C** |
| **Function transformations** (`function_transformations`, universal parent) | GeoGebra | choose parent (x²/\|x\|/x³/√x…), slide a/h/k, drag the key point; faint parent always shown | plane, choice, slider, function(reference), point(pair-bind), readout | **C** — *one model = the whole unit* |
| Number line | PhET Number Line | drag/place points, integers & operations | plane(1-D), point, region, readout | **C** |
| Fraction / area model | PhET Fractions, Area Model | partition bars/areas, build fractions | region/bar, readout | **C** |
| **Integer counters** (zero pairs) | PhET / algebra tiles | type `-7+10`, drag red onto yellow to cancel | token, input, rule(annihilate), readout | **C** *(already built — configure `algebra-tiles.js`)* |
| **Equation tiles** (`equation_tiles`) | algebra tiles / scale | solve `2x+3=7`: zero-pairs, cross-the-`=` flips sign, both sides | token, zones/`=`, rule(flip-sign, mirror), readout | **C** *(configure `algebra-tiles.js`)* |
| **Area model — multiply/factor** (`area_model_factor`) | PhET Area Model Algebra | box-method expand `(x+3)(x+2)`; pack pieces to factor | token, rectangle/cells, modes, readout | **C** *(configure `algebra-tiles.js`)* |

### Tier 2 — curate (adds the geometry primitives)
| Model | Source | What the student does | Primitives | |
|---|---|---|---|---|
| Inscribed angle theorem | GeoGebra | drag B; inscribed stays half central | circle, point(glider), angle(measure), readout | **C** (scaffold exists in `diagramSpec.js`) |
| Triangle similarity / congruence | GeoGebra | resize one triangle; angles equal, sides proportional | polygon, transform(dilate), angle, readout | **C** |
| Transformations (translate/rotate/reflect/dilate) | GeoGebra | transform a shape, watch image | polygon, transform, line/point | **C** |
| Pythagorean theorem | GeoGebra | resize right triangle; a²+b²=c² holds | polygon, region(squares), readout | **C** |
| **Triangle inequality** (`triangle_inequality`) | GeoGebra | shrink a/b; reach-circles pull apart → "too short, no triangle" | point, segment, circle, **intersection**, readout | **C** *(first geometry model)* |
| **Volume — rectangular prism** (`volume`, stub) | PhET / GeoGebra | drag l/w/h; unit cubes fill → V = lwh | (needs 3-D / isometric substrate) | **C** *(to design — first 3-D)* |
| Angle relationships (vertical/linear/parallel-cut) | GeoGebra | drag a transversal; angle pairs update | line, angle(measure), readout | **C** |
| Graphing quadratics | PhET Graphing Quadratics | sliders a/b/c, vertex/roots readout | plane, slider, function, readout | **C** |

### Tier 3 — curate or generate (valuable, lower frequency)
| Model | Source | Primitives | |
|---|---|---|---|
| Equation as a balance (Equality Explorer) | PhET | bars/regions, readout | **C/G** |
| Area-model algebra (factoring / distribution) | PhET Area Model Algebra | region grid, readout | **C/G** |
| Ratio & proportion / unit rates | PhET Proportion Playground, Unit Rates | bar/region, slider, readout | **G** |
| Unit circle / Trig Tour | PhET Trig Tour | circle, point(glider), angle, readout, function | **C** |
| Vector addition | PhET Vector Addition | vector, point, readout | **G** |

### Tier 4 — long tail (generate; engine-verified)
Curve fitting, least-squares, plinko/probability, systems of equations, conics,
sequences, transformations of any function, etc. — **LLM authors the spec in the
vocabulary; validator + measuring engine guarantee correctness.**

---

## Build order

1. **Renderer + vocabulary engine (JSXGraph)** — build via `slope_intercept_line`
   end-to-end (it's Tier-1 #1 and forges plane/slider/function/point/readout +
   the binding model). **Browser-verified** (the lesson: don't ship visuals blind).
2. **Spec validator** (pure, unit-tested) — so generated specs can't render broken.
3. **Tier 1** (configs on the same engine) → **Tier 2** (adds geometry primitives;
   fold in the existing `diagramSpec.js` inscribed-angle work as the first geometry
   model).
4. **Generative long-tail path** (LLM → spec → validate → render → measure).

Gate the whole capability behind a flag until browser-verified (cf. `DIAGRAM_BOARD`).

---

## References
- Gemini Guided Learning — https://blog.google/products-and-platforms/products/gemini/guided-learning-google-gemini/
- Gemini interactive sims/models — https://blog.google/innovation-and-ai/products/gemini-app/3d-models-charts/
- PhET (math) — https://phet.colorado.edu/en/simulations/filter?subjects=math&type=html
- GeoGebra (math resources) — https://www.geogebra.org/math
- Related in-repo: `public/js/diagramSpec.js` (geometry scaffold), `CHAT_BOARD_AI_INTEGRATION.md`, `ANTI_CHEAT_SAFEGUARDS.md`
