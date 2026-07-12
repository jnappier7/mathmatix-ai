# Scene-authoring prompt (FIRST DRAFT)

The instruction block the tutor model would receive to emit a geometry **scene**
(see `DIAGRAM_SCENE_SPIKE.md`). Not wired yet — needs the structured-output schema
+ a flag. Verify emission against a live model before enabling.

---

When you want to DRAW a geometry figure, emit a `scene`: a JSON object of
`objects` (the geometry) and `marks` (the annotations). **You declare
RELATIONSHIPS; the engine computes the coordinates** — so never try to place a
point that is defined by others (a midpoint, an intersection). Just say what it
is.

## objects (each needs a unique `id`)

- `{ id, type:"point", at:[x,y] }` — a free point you position.
- `{ id, type:"midpoint", of:["A","B"] }` — computed midpoint.
- `{ id, type:"intersection", of:["l1","l2"] }` — where two lines meet (computed).
- `{ id, type:"glider", on:"circleId", at:[x,y] }` — a point constrained to a curve.
- `{ id, type:"segment"|"line"|"ray", from:"A", to:"B" }`
- `{ id, type:"circle", center:"O", through:"A" }`  (or `radius:5`)
- `{ id, type:"polygon", points:["A","B","C"] }`
- `{ id, type:"parallel", through:"P", to:"l1" }` — line through P parallel to l1 (computed).
- `{ id, type:"perpendicular", through:"P", to:"l1" }`

## marks (annotations; reference point ids)

- `{ kind:"tick", on:["A","B"], count:1 }` — congruence ticks on segment AB.
- `{ kind:"angle", at:"B", from:"A", to:"C", arcs:1 }` — angle arc at B.
- `{ kind:"right", at:"B", from:"A", to:"C" }` — right-angle square.
- `{ kind:"parallel", on:["D","E","B","C"] }` — parallel chevrons on DE and BC.
- `{ kind:"label", on:"A", text:"A" }`
- `{ kind:"measure", on:["A","B"], symbol:"AB", value:6, unit:"cm", solve:false }` —
  a stated length/angle. **Mark the value the student must FIND with
  `solve:true`** — it will be shown as `?`. Never state a value the student is
  supposed to compute.

## Rules

1. Declare relations; don't place computed points.
2. Every marked congruence must be TRUE in the figure (the engine won't fake it).
3. `measure` a quantity only if it's given; the unknown gets `solve:true`.
4. Keep it to the figure being taught — no decorative objects.

## Example — triangle midsegment

```json
{ "objects":[
  {"id":"A","type":"point","at":[1,5]},
  {"id":"B","type":"point","at":[0,0]},
  {"id":"C","type":"point","at":[8,0]},
  {"id":"tri","type":"polygon","points":["A","B","C"]},
  {"id":"D","type":"midpoint","of":["A","B"]},
  {"id":"E","type":"midpoint","of":["A","C"]},
  {"id":"DE","type":"segment","from":"D","to":"E"}
 ],
 "marks":[
  {"kind":"tick","on":["A","D"],"count":1},{"kind":"tick","on":["D","B"],"count":1},
  {"kind":"tick","on":["A","E"],"count":2},{"kind":"tick","on":["E","C"],"count":2},
  {"kind":"parallel","on":["D","E","B","C"]}
 ] }
```

## Example — find the hypotenuse (student's own problem)

```json
{ "objects":[
  {"id":"A","type":"point","at":[0,6]},{"id":"B","type":"point","at":[0,0]},
  {"id":"C","type":"point","at":[8,0]},{"id":"tri","type":"polygon","points":["A","B","C"]}
 ],
 "marks":[
  {"kind":"right","at":"B","from":"A","to":"C"},
  {"kind":"measure","on":["A","B"],"symbol":"AB","value":6},
  {"kind":"measure","on":["B","C"],"symbol":"BC","value":8},
  {"kind":"measure","on":["A","C"],"symbol":"x","value":10,"solve":true}
 ] }
```

The gate renders `x` as `?` (student must find it); the givens 6 and 8 stay.
