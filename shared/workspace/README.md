# `shared/workspace` — Living Math Workspace contracts (P0)

Frozen schemas that define how the workspace, gestures, tutor, and saved state
communicate — written **before** any UI (spec §4, Milestone A). Design intent:
[`docs/BOARD_LIVING_WORKSPACE_SPEC.md`](../../docs/BOARD_LIVING_WORKSPACE_SPEC.md).

## Why here / why plain CommonJS
The server is CommonJS (`require`) and the client is Vite-bundled vanilla JS.
A dependency-free CommonJS module imports cleanly in **both** — matching
`utils/boardResponseSchema.js`. One definition, validated on both sides
(resolves spec open-Q6).

## The one rule that matters: client proposes, server disposes
A `StudentMove` is an **untrusted proposal**. The client can never declare its
move mathematically correct:
- `StudentMove` has **no validity field**; `clientInterpretation` is advisory.
- `validateInbound()` runs `context:'ingest'` → **rejects unknown fields and
  any server-authoritative field**, so a smuggled `mathematicallyValid` is refused.
- All verdict fields live on `VerifiedMove`, marked `serverOnly`, constructed
  only by trusted server code (`context:'server'`).

This is the existing "advisory in, authoritative out" gauntlet extended to the browser.

## Files
| File | Contract |
|------|----------|
| `schemas/_validator.js` | tiny dep-free validator; `context: ingest \| server` |
| `schemas/studentMove.schema.js` | `StudentMove` (in) + `VerifiedMove` (out) + `validateInbound` |
| `schemas/workspaceElement.schema.js` | base element envelope (each type owns its `semantic`) |
| `schemas/workspaceSnapshot.schema.js` | semantic persistence (never pixels) + corrupt-snapshot guard |
| `schemas/engagementEvent.schema.js` | neutral `LearningEvent` → central EngagementEngine |
| `schemas/presenceCommand.schema.js` | tutor "body" commands (skippable, reduced-motion) |
| `constants/*` | element types, move vocabulary, command/event types |

## Usage
```js
const { validateInbound, VerifiedMove, ELEMENT_TYPES } = require('../shared/workspace');

// at POST /api/student-moves:
const { valid, errors, value } = validateInbound(req.body);
if (!valid) return res.status(400).json({ errors });
// value is safe; the server now VERIFIES it and builds a VerifiedMove.
```

## Migration
Every top-level object carries `schemaVersion` and a `migrate*()` hook so a future
bump has one obvious home. v1 is the baseline.

## Self-test
`node shared/workspace/__selftest__.js` — asserts the client-can't-forge-validity
guarantee and the round-trips. (Promoted to a jest suite in P1.)
