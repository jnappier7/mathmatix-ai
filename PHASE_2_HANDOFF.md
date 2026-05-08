# Phase 2: Migrate `[CIRCLE_DIAGRAM]` to JSXGraph + tool-call validation

## Context (read this first, do not skip)

The Mathmatix tutor (Maya) renders math diagrams inline in chat by emitting bracket commands like `[CIRCLE_DIAGRAM:type=two_secants,nearArc=80,farArc=120]`. These are parsed client-side in `public/js/inlineChatVisuals.js` and replaced with hand-rolled SVG.

**What's already shipped on the current branch (`claude/fix-circle-diagrams-o71me`):**

- Commit `d17571b` — `[POINTS:...]` with no `(x,y)` coords now returns empty string instead of rendering a ghost default-axis grid.
- Commit `1a933af` — `createCircleDiagram` auto-fits its viewBox to the bounding box of drawn elements. Fixes a real bug where `two_secants` placed point P at x=567 in a fixed 340x320 viewBox, clipping P off-screen.

**What was previously merged on main:**
- `5c4881d` — added `[CIRCLE_DIAGRAM:type=...]` with 9 hand-rolled SVG types (basic, chord, two_secants, tangent_secant, two_chords, inscribed_angle, central_angle, tangent_chord, tangent_from_external).
- `c4ca927` — replaced dead Python `[DIAGRAM:...]` route with inline SVG for parabola/triangle/number_line/coordinate_plane/angle.
- `b69f42a` — `utils/visualTeachingParser.js` strips hallucinated `![alt](url)` markdown image syntax and converts to `[SEARCH_IMAGE:query=...]`.

**Why we're doing Phase 2:**
Hand-rolled SVG with regex-parsed string parameters has two structural problems:
1. Every diagram type re-implements geometry (tangent point, intersection, label collision). Bugs are per-type.
2. The LLM emits arbitrary strings; we have no schema validation, so a malformed `[CIRCLE_DIAGRAM]` falls through to a default that may be visually broken.

The fix is two-part: (a) use JSXGraph as the geometry kernel — declarative `intersection(circle, line)` instead of hand-rolled trig, plus drag-to-explore interactivity, and (b) move the input boundary from regex-parsed prose to a JSON-validated tool call.

There's a working architectural seam already: `renderFromToolCall(name, input)` at `inlineChatVisuals.js:204`. The backend can emit `tool_use` SSE events with `{name, input}` payloads that bypass regex parsing.

Comparison demo (open in a browser to ground the discussion): `/tmp/circle-comparison.html`. Shows current `two_secants` SVG (with the now-fixed clipping bug) vs. JSXGraph rendering of the same problem. Drag-to-explore is the killer feature.

## Decisions to make BEFORE writing code

Investigate and pick a side for each of these. Don't skip.

### D1. How does this repo load front-end JS?
Check `views/chat.html` (or wherever the chat page lives), `package.json`, and any build config (`webpack.config.js`, `rollup.config.js`, `vite.config.js`). Pick one of:
- **Bundler exists** → add `npm install jsxgraph`, `import JXG from 'jsxgraph'` in `inlineChatVisuals.js`.
- **Plain script tags** (likely, based on file conventions) → either CDN script tag in chat.html with `defer`, or copy `jsxgraphcore.js` to `public/vendor/` and serve from same origin.

Lazy-load is preferred — don't ship 250 KB to users who never see a circle diagram. Pattern: dynamic script injection on first `[CIRCLE_DIAGRAM]` encountered.

### D2. CSP audit
Check the response headers from the running server (or middleware in `app.js` / `server.js`). Look for `Content-Security-Policy` with `script-src`. If it lists specific origins, CDN-loading JSXGraph is blocked unless we add `cdn.jsdelivr.net` to the allowlist. Self-hosting from `public/vendor/` avoids the issue entirely.

Recommendation: self-host. One less external dependency at request time.

### D3. Schema validation library
The `renderFromToolCall` path needs a validator. Options:
- **Zod** — beautiful, but adds another dep + bundle size.
- **AJV / JSON Schema** — heavier, more enterprise-y.
- **Hand-rolled validator** — for this single tool, ~30 lines. Probably the right choice.

Recommendation: hand-rolled. The schema is small (9 types, each with ~3-5 numeric params). Don't pull in a library for one validator.

### D4. Migration strategy: replace vs. fall-through
- **Replace**: `type=two_secants` always uses JSXGraph; old code is deleted.
- **Fall-through with feature flag**: read `?diagrams=jsx` URL param or `localStorage.diagramEngine === 'jsx'` to toggle.

Recommendation: fall-through with flag for the first 1-2 weeks of evaluation, then replace once the team confirms quality. Lets the user A/B in production without risk.

### D5. Mobile drag UX
JSXGraph supports touch by default but the experience needs verification. On a 375px-wide phone, dragging P inside a chat bubble can fight with chat scroll. Test on a real phone (or Chrome DevTools touch emulator). May need `touchAction: 'none'` on the JXG board container.

## Minimal first commit (Phase 2 PR #1)

Scope this PR to ONE diagram type as proof. Don't migrate all 9 in one go.

**Files to touch:**
1. `public/vendor/jsxgraphcore.js` + `public/vendor/jsxgraph.css` — vendored copies (download from npm or jsDelivr).
2. `public/js/inlineChatVisuals.js`:
   - Add `loadJSXGraph()` helper that lazy-injects script + stylesheet on first call. Cache the promise.
   - Add `_renderTwoSecantsViaJSX(input, container)` method.
   - In `createCircleDiagram`, when `type === 'two_secants'` AND the feature flag is on, return a placeholder div + schedule the JSXGraph render after DOM insertion (because JXG needs a real DOM element).
3. Feature flag: read `localStorage.getItem('mathmatixDiagramEngine') === 'jsx'` at module load.
4. Smoke test: a Node test that exercises the schema validator only (the rendering itself can't be smoke-tested in Node without jsdom).

**What the JSXGraph code should look like** (already prototyped in `/tmp/circle-comparison.html` — copy/adapt):

```js
const board = JXG.JSXGraph.initBoard(containerId, {
  boundingbox: [-9, 7, 16, -7],
  axis: false, showCopyright: false, showNavigation: false,
  pan: { enabled: false }, zoom: { enabled: false },
  keepAspectRatio: true,
});
const O = board.create('point', [0, 0], { name: 'O', fixed: true, size: 1 });
const circle = board.create('circle', [O, 4], { strokeColor: '#667eea', strokeWidth: 2 });
const P = board.create('point', [11, 0], { name: 'P', size: 4, color: '#2c3e50' });
const halfAng = ((farArc - nearArc) / 2 / 2) * Math.PI / 180;  // half of ∠P, in radians
const dir1 = board.create('point', [
  () => P.X() - 8 * Math.cos(halfAng),
  () => P.Y() + 8 * Math.sin(halfAng)
], { visible: false });
const dir2 = board.create('point', [
  () => P.X() - 8 * Math.cos(halfAng),
  () => P.Y() - 8 * Math.sin(halfAng)
], { visible: false });
const sec1 = board.create('line', [P, dir1]);
const sec2 = board.create('line', [P, dir2]);
const C = board.create('intersection', [circle, sec1, 0], { name: 'C' });
const A = board.create('intersection', [circle, sec1, 1], { name: 'A' });
const D = board.create('intersection', [circle, sec2, 0], { name: 'D' });
const B = board.create('intersection', [circle, sec2, 1], { name: 'B' });
board.create('arc', [O, C, D], { strokeColor: '#3498db', strokeWidth: 4 });
board.create('arc', [O, B, A], { strokeColor: '#e74c3c', strokeWidth: 4 });
board.create('angle', [C, P, D], { name: '∠P', radius: 1.5 });
```

**Schema for two_secants input** (hand-rolled):
```js
function validateTwoSecants(input) {
  const errors = [];
  const farArc = +input.farArc;
  const nearArc = +input.nearArc;
  if (!Number.isFinite(farArc) || farArc <= 0 || farArc >= 360) errors.push('farArc must be in (0, 360)');
  if (!Number.isFinite(nearArc) || nearArc <= 0 || nearArc >= 360) errors.push('nearArc must be in (0, 360)');
  if (farArc <= nearArc) errors.push('farArc must be greater than nearArc');
  if (farArc + nearArc >= 360) errors.push('farArc + nearArc must be < 360');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { farArc, nearArc } };
}
```

## Visual QA checklist (mandatory before merge)

Cannot be skipped — this is the entire point of the migration.

- [ ] Open the chat in Chrome desktop, ask Maya: "two secants intersect outside a circle, arcs are 120 and 80, find ∠P." Verify the JSXGraph diagram appears and is interactive.
- [ ] Drag P. Confirm ∠P stays = ½(arc<sub>far</sub> − arc<sub>near</sub>) for at least 3 different P positions.
- [ ] Same on Safari desktop.
- [ ] Same on iOS Safari (real device, not just DevTools emulator). Confirm:
  - [ ] P drags smoothly with finger
  - [ ] Page doesn't scroll while dragging the diagram
  - [ ] Diagram fits within chat bubble width
- [ ] Toggle feature flag off (`localStorage.removeItem('mathmatixDiagramEngine')`) — confirm the hand-rolled fallback still works.
- [ ] Test with weird inputs (`farArc=380` should reject, `nearArc=0` should reject, both equal should reject).
- [ ] Lighthouse: confirm bundle size impact is exactly +0 KB on initial load (JSXGraph should only fetch when first circle diagram appears).

## What this PR is NOT
- NOT migrating the other 8 circle types. They stay on the hand-rolled path.
- NOT migrating `[DIAGRAM:parabola/triangle/...]`. Those are non-circle and out of scope.
- NOT migrating `[FUNCTION_GRAPH]`, `[RATIONAL_GRAPH]`, etc. Those don't have the trig-correctness pain — JSXGraph offers no clear win.
- NOT changing the system prompt. Maya keeps emitting the same `[CIRCLE_DIAGRAM:type=two_secants,...]`. The only difference is what the client does with it.

## Follow-up PRs after this lands
- PR #2: migrate `tangent_secant` to JSXGraph (uses identical infrastructure).
- PR #3: migrate the remaining 6 types (basic, chord, two_chords, inscribed_angle, central_angle, tangent_chord, tangent_from_external).
- PR #4: server emits structured `tool_use` SSE events for `[CIRCLE_DIAGRAM]` instead of bracket strings, cutting out regex parsing entirely. (See `inlineChatVisuals.js:204` `renderFromToolCall` for the existing seam.)
- PR #5: delete the hand-rolled circle code and the feature flag once all types are migrated and stable.

## Useful files to read before starting
- `public/js/inlineChatVisuals.js:204` (`renderFromToolCall`) — the validated JSON path to use.
- `public/js/inlineChatVisuals.js:4554` (`createCircleDiagram`) — the current 9-type renderer.
- `utils/visualCapabilities.js` — Maya's system prompt for visual commands.
- `utils/visualTeachingParser.js` — the message-text guard that runs before client-side parsing.
- `views/chat.html` (or equivalent) — to understand script loading.
- The recent comparison HTML at `/tmp/circle-comparison.html` for a working JSXGraph snippet.

## Definition of done
- One commit on `claude/fix-circle-diagrams-o71me` (or a fresh branch off main if too much time has passed).
- `[CIRCLE_DIAGRAM:type=two_secants,nearArc=N,farArc=M]` renders via JSXGraph when feature flag is on, hand-rolled SVG when off.
- Schema validates input; invalid inputs render an error placeholder, not a broken diagram.
- All visual QA checklist items checked off in the PR description.
- Bundle size on initial chat load is unchanged (JSXGraph lazy-loaded).
- PR description includes a screen recording of dragging P on iOS Safari.
