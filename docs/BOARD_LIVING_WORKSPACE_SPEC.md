# Living Math Workspace — Design Spec & Build Plan

**Status:** Proposed · **Owner:** Jason · **Date:** 2026-07-12
**Supersedes the intent of:** the tabbed workspace (System C) and the shelved Fabric whiteboard (System B) — this unifies them.
**Read alongside:** `WHITEBOARD_AI_INTEGRATION.md`, `BOARD_LLM_STAGE_DESIGN.md`, `CHAT_BOARD_AI_INTEGRATION.md` (design intent), and the current architecture map in the engineering memory.

---

## 0. North star

> **The board should feel like a real live tutor is sitting next to the student, working problems on shared paper.**

Every decision below serves that sentence. The board is not a display; it is a **shared, living work surface** the student and tutor act on together — the tutor writes, points, pauses, and reacts in real time; the student writes, drags, and manipulates math with their own hands. Not polish — **presence**.

---

## 1. Design decisions (the spine)

These are settled. Each is expanded in §3.

| # | Decision | One-line |
|---|----------|----------|
| 1 | **Unified surface, NO tabs** | One workspace renders equation cards, graphs, tiles, geometry together as the lesson requires. Kill the Board/Graph/Tiles/Calc tabs. |
| 2 | **Free 2D canvas** | Elements are placed in real 2D space, not a scrolling column. Fabric used as the render/hit-test library on a **freshly-built** component (see §2.1), fold the card-stack in as one element type. |
| 3 | **Student drag & control — both kinds** | (a) reposition to organize; (b) **semantic manipulation** — the drag *does* math and becomes a student move in the pipeline. |
| 4 | **Smart board + allow-and-teach** | Manipulatives carry real math rules; a gesture is deterministically interpreted into a canonical student move. Wrong moves LAND (teach into them); only physics-invalid drops snap back. Never hard-block a math mistake. |
| 5 | **Mirror + worked-examples pedagogy** | Board mirrors the student's own problem + stated steps (the #1 anti-cheat rule). Full worked steps only on a *parallel* teaching problem, never the graded one. |
| 6 | **Mode-dependent layout (always two columns)** | The board is **always one column of a two-column layout — never full-bleed**; modes only flip which column is dominant. Chat mode → board is the sidebar column, chat primary. Voice mode → board is the wide column, transcript demotes to the rail. Same board, emphasis swaps. |
| 7 | **Voice = shared central stage, synced to speech** | Board illustrates in time with narration; the student's hands stay live (drag while talking). |
| 8 | **Uploads → the board** | An uploaded image becomes a pinned, positionable board element the tutor annotates in place; chat keeps a tap-to-locate breadcrumb. Files stay chat attachments with per-page "send to board." |
| 9 | **Persistence = semantic snapshot + adaptive resume** | Persist elements/positions/progress (not pixels), keyed to the conversation. On return the tutor re-hydrates AND re-frames. |
| 10 | **Animation = "real live tutor"** | Crisp typeset math revealed under a moving pen; true-stroke annotations (circle/arrow/underline); pace to voice; *Partial > Complete: write half, pause, invite*. |
| 11 | **Substrate = warm faint graph paper** | Cream tone + low-contrast grid = math-native alignment system + notebook warmth. Graph elements draw their own axes on top. Adaptive grid by grade. |

**Everything above is adaptive.** The tutor's `decide` stage composes the canvas for the exact moment — element choice, animation lushness, grid size, resume warmth all tune to skill, grade, mood, and the student's last move.

---

## 2. What exists today (foundation audit)

The good news: most primitives already exist, shelved or tab-siloed.

- **Live surface (System C):** `public/js/workspace.js` + `public/js/boardCommandHandler.js` — DOM card-stack, KaTeX rendering, `MathGraph` (2D-canvas graphs), scaffold fill-in-blank cards, inline-mirror mode. **Tabs live in `chat.html:1102-1117` — to be removed.**
- **Free-2D canvas + drag (System B, shelved):** `public/js/whiteboard.js` — Fabric.js canvas, draggable semantic objects, `setBoardMode(teacher/student/collaborative)`, in-memory history/timeline. **This is the foundation for the unified surface.**
- **Presence engines (shelved):** `whiteboard-handwriting.js` (`HandwritingEngine` — live writing, jitter, `animatePathDrawing`), `whiteboard-phase2.js` (`WhiteboardPhase2Enhancements` — ghost cursor, pointer lines, region overlays), `whiteboard-math-procedures.js` (long-division/fraction routines), `whiteboard-chat-layout.js` (split/pip/ticker modes).
- **Generation + safety (live, keep intact):** the 4-source funnel and deterministic gauntlet in `utils/pipeline/index.js` — `boardResponseSchema.js`, `boardTagParser.js`, `boardSynthesizer.js`, `boardLlm.js`, `boardCommandGuard.js`, `visualGate.js`. **None of this changes conceptually — we add a new input source (gestures) and new element types, all flowing through the same guard.**
- **Input:** `mathmatixKeyboard.js` (on-screen math keyboard), Mathpix OCR (`utils/ocr.js`), upload pipeline (`routes/chat.js` multer→Sharp→Mathpix, `message.attachments`).
- **Voice:** `voiceSession.js`, `sttStream.js`, `ttsStream.js` (WebSocket).

**Feature-flag discipline:** master flag `LIVING_WORKSPACE` (default off), ladder `off → dev → beta → live`. (NOT the backend `shadow` mode of `VISUAL_GATE_MODE`/`BOARD_LLM_MODE` — you can't meaningfully "shadow" a UI; a hidden surface renders nothing to compare. Use dev-only preview + staged % rollout instead.)

### 2.1 Foundation decision (from the 2026-07-12 salvage audit)
**Build the canvas FRESH; cherry-pick only the presence engines. Do NOT build up from `whiteboard.js` as-is.** The audit found System B is a 2,607-line *floating-panel* class whose container model (draggable window, three-mode canvas-lock, `regions` model, pixel `toJSON()` persistence, `BOARD_REF` anchoring) is the wrong shape for an embedded/central canvas — only ~10-15% is salvageable. Use Fabric purely as the render/hit-test library (`new fabric.Canvas`, object model, drag/selection). **Port in, as a standalone decoupled `presence/` layer:** `HandwritingEngine`'s true-stroke annotation primitives (`drawHandDrawnCircle/Arrow/Underline`, `pointsToSmoothPath`, `animatePathDrawing`, personality presets — `whiteboard-handwriting.js:210-496`) and Phase2's ghost cursor + pointer trail (`whiteboard-phase2.js:37-149`). **Explicitly leave behind:** the floating panel + all chrome, `boardMode` teacher/student/collab, the `regions` model, `saveState`/`timeline` pixel serialization, `whiteboard-math-procedures.js` (brittle + its `solveEquation` renders a full worked solution = a mirror-rule landmine), `whiteboard-chat-layout.js` (split/pip/ticker), `BOARD_REF` spatial anchoring, and `HandwritingEngine.writeText` cursive math (contradicts crisp-typeset-under-pen). Discard the global-singleton + `prototype`-monkeypatch + `setInterval` auto-init pattern every module uses — it isn't portable to a clean component.

> **One-liner:** the value of System B is two ~300-line presence engines and a validated Fabric config — not the 2,600-line panel class that hosts them.

---

## 3. Target architecture

### 3.1 The unified canvas
A Fabric-based 2D surface (`MathWorkspace` v2) that hosts **elements**, replacing both the tabbed panel and the card-stack. It is **always one column of a two-column layout, never a full-screen takeover** — the conversation is always present. Chat mode: board is the narrower sidebar column, chat primary. Voice mode: the emphasis flips — board becomes the wide column, transcript demotes to the rail. On mobile it's a full-screen drawer (voice) or a FAB-summoned sheet (chat), with inline chat mirrors as the low-bandwidth fallback (keep `appendBoardMirror`).

**"One surface" ≠ "one class."** To avoid recreating the 2,607-line monolith we're escaping, the workspace is an orchestration shell over independent systems: **Shell · Viewport · ElementRegistry · InteractionController · GestureInterpreter · StudentMoveClient · PresenceLayer · SnapshotManager · AccessibilityController · LayoutController** (introduced as phases need them, not all on day one). Each *element* owns its own semantic state, render adapter, interaction rules, serialization, a11y representation, and gesture interpretation.

**Bounded & guided, not infinite** (Jason confirmed). "Free 2D" means the student places and drags freely — not an unbounded pannable plane (a UX trap for kids: lost elements, zoom confusion, mobile-nav pain). The space stays free-*feeling* via soft working regions, automatic initial placement, magnetic alignment, a "bring everything into view" control, sane max bounds, and tutor-controlled reframing. Enough structure that it never becomes a design tool.

### 3.2 Element types (each a real, interactive component)
Every element is a first-class object with a **semantic model** (its math meaning) and a **render** (its pixels). Priority/build order in parens.

- **Equation / step card** (1) — editable typeset math (KaTeX display + MathLive edit). The spine; today's cards, freed from the stack.
- **Algebra tiles** (2) — draggable unit/x/x² tiles; the tile engine knows like-terms, zero-pairs, area models. *Semantic drag lives here.*
- **Number line** (2) — draggable points/intervals; knows ordering, distance, sign.
- **Function graph** (3) — `MathGraph` upgraded with **draggable points/handles** (drag the slope, move an intercept); knows its function.
- **Geometry figure / interactive concept model** (4) — the flag-off `diagram`/`model` actions (JSXGraph); highest effort, last.
- **Image / upload element** (with Phase for uploads) — a pinned photo the tutor annotates in place.
- **Annotation layer** — tutor circles, arrows, underlines, checkmarks, cross-outs (true-stroke `HandwritingEngine`), plus the ghost-cursor/pointer presence (`phase2`).

### 3.3 The substrate
Warm cream canvas + faint low-contrast grid = alignment system (snap tiles/points to lattice) **and** notebook warmth. Graph elements render their own darker axes on top. Grid size + warmth adapt to grade (bigger/warmer for elementary).

### 3.4 The gesture → pipeline contract  ⭐ (the crux)
This is what makes the board a real input device instead of a toy. **A semantic gesture is interpreted client-side into a *proposed* move, rendered instantly as provisional, and sent to the server — which is the sole authority on whether it's mathematically valid.**

**Two-layer response (the key to responsive juice).** The client engine is deterministic, so it renders the move within one animation frame; the server re-verifies authoritatively a beat later. A tile drag must NEVER wait on an LLM round-trip to feel like it landed.
- **Immediate (≤1 frame, local):** tile follows pointer → target highlights → snap preview → provisional result renders (with a visible `?` marker) → local sound/motion.
- **Authoritative (after server):** checkmark or `?` resolves → tutor speaks/annotates → misconception diagnosed → effort event awarded → state committed.

**Client proposes, server disposes** — the browser's `valid` is a *suggestion*, never trusted. This is our "advisory in, authoritative out" principle extended to the client. The `StudentMove` (vanilla-JS object, runtime-validated by a shared schema):

```
StudentMove {                          VerifiedMove (server-owned) {
  schemaVersion, moveId,                 accepted,
  conversationId, workspaceId,           interactionValid,
  elementId, elementType,                mathematicallyValid,   // client can't set this
  source: gesture|keyboard|voice|upload, canonicalMove,
  intent, previousState, proposedState,  misconceptionCode?,
  operation:{type,operands?},            resultingState?
  interaction:{gestureType,pointerType,  }
    startedAt,completedAt},
  mode: attempt|exploration|reposition|undo,
  clientSequence, idempotencyKey         // dup/replay protection
}
```

**Transport = a dedicated route, one shared brain.** `POST /api/student-moves` (a gesture is not disguised text — different validation, latency, frequency). It normalizes into a learner event and feeds the **existing** `observe → diagnose → decide → generate` pipeline + `boardCommandGuard`/`visualGate` — no duplicated tutoring logic, and voice will later call the same server service over WS. **Gotcha:** it MUST share `routes/chat.js`'s per-user lock / pipeline serialization, or a gesture racing a typed message corrupts conversation state.

Rules:
- **Deterministic interpretation for well-defined manipulatives** (tiles, number line, graph handles) — the board can *prove* what the student stated, so it drops cleanly into the mirror guard. Only ambiguous gestures fall back to the LLM.
- **Wrong moves land as a CLAIM, not as fact (allow-and-teach + transaction model).** An invalid move (combine unlike terms) renders provisionally with a visible `?` — *the student's claim*, never system-endorsed math (this protects the mirror posture). The server classifies it `combine_unlike_terms` with a `misconceptionCode`; the tutor coaches; the student revises/undoes. Only physics-invalid drops (tile into empty space) snap back.
- **`exploration` mode ≠ `attempt`.** Dragging to explore doesn't count as an answer attempt — and the verified answer is still injected ONLY on an attempt, never on exploration. Preserve the existing anti-leak gate.
- **Every semantic gesture has a command equivalent** ("Select 2x → Combine with → 3x") — one mechanism that serves keyboard/screen-reader users, the tutor's own board-driving, and the test harness (see §3.11 accessibility).

### 3.5 Adaptive composition (the `decide` stage picks the canvas)
The tutor's `decide` stage already chooses an instructional action. Extend it to also choose **which element(s) belong on the canvas for this move**, via a deterministic `moveType → allowedElements` map (mirroring `allowedBoardActionsFor` in `boardLlm.js`). Tiles for a 6th-grader on like-terms; a bare equation card for symbolic algebra; a graph for slope. The board reconfigures as the lesson moves.

### 3.6 Anti-cheat integration (unchanged authority)
Gestures and new element types are **just new generators** feeding the existing deterministic gauntlet: `boardCommandGuard` (mirror rule) → `revealsPinnedProblem` backstop → `visualGate` (graph/image leak math). **No generator is trusted.** A dragged graph handle that would reveal a root is caught by the same `visualGate` root-intersection math. *Advisory in, authoritative out.*

### 3.7 Uploads
Image upload → new **image element** pinned on the canvas (tutor annotates in place) + a tap-to-locate breadcrumb chip in chat (reuse `boardHighlight`). OCR still feeds the prompt unchanged. "Check my work" → verifier annotates on the image; "Help me" → OCR'd problem becomes a `pose`/equation element. Files stay chat attachments with per-page "send to board." `worksheetGuard` / check-work verifier still catch answer-key uploads.

### 3.8 Persistence & resume
Persist a **semantic snapshot** (elements + positions + per-element progress) keyed to the conversation, extending `boardProblem`/`lastProblemState`. On return the tutor re-hydrates *and* re-frames ("Yesterday you had 2x+4=20 half-solved — pick it up?"); lighter/silent for advanced students. Never persist pixel/canvas-JSON geometry (stale on render changes).

### 3.9 Animation / presence layer
Revive and combine the three shelved engines:
- **HandwritingEngine** — true-stroke annotation (circle/arrow/underline/cross-out), tile motion, graph draw-on.
- **Phase2** — ghost cursor + pointer lines + region overlays = "the tutor points while explaining."
- **Voice sync** — board commands land on the beat of TTS (`ttsStream`/`voiceSession`). **Start at segment level** (`segment_started`/`segment_completed` cues), NOT word-boundary timing (fragile across providers/network/retries); add word-boundary later behind graceful degradation (word → segment → sequential).
- **Pacing rule** — *Partial > Complete: write half, pause, invite.* The pauses are the teaching.
- Math stays **crisp typeset revealed under a moving pen** (legible + "written"), not handwritten-math strokes.
- **Adaptive + accessible** — lush for younger/struggling; brisk + skip control + `prefers-reduced-motion` for advanced.

### 3.10 Juice / game-feel
The layer that makes a math *tool* a math *toy* — the Duolingo×Pokémon half of the vision.

**The rule: juice rewards THINKING and EFFORT, never just correctness.** Juicing "you got it right" trains answer-seeking and punishes the productive mistake; it also breaks the "real live tutor" feel (a good tutor's warmth rewards effort, not a slot-machine ding). Juice the *act of reasoning* — a satisfying combine, a brave attempt, grinding a hard step, a self-correction. This is `XP for thinking, not correctness` (project_board_vision) made physical.

Five layers:
1. **Manipulation juice (the star).** Tiles have weight — lift with scale-up + shadow, snap to grid magnetically with a soft click, squash/settle on landing. Zero-pairs annihilate with a poof (+x meets −x). A term dragged across `=` leaves an ink trail. Hands-doing-math must feel *physical*.
2. **Writing juice (presence).** Pen has ink-flow + faint scratch sound; strokes ease in with anticipation. The ghost cursor (`phase2`) arrives before writing and lingers to point — anticipation is the juice.
3. **Micro-feedback (per move, not per problem).** Every student move gets a small warm ack AS it lands — a combine "settles" with a pulse, a valid step gets a self-drawing checkmark, a self-correction gets a spark. The moment-to-moment "yes, keep going," distinct from end-of-problem celebration.
4. **Celebration (earned, calibrated, tiered).** Reuse confetti (`celebrateLatestVerifyCard`, boardCommandHandler.js:149) + celebration videos, but reserve the BIG celebration for effort milestones (hard problem finished, persistence streak, comeback after struggle). Escalating tiers: micro-spark → warm pulse → confetti → full celebration, so it never numbs.
5. **Sound + motion discipline.** Warm, soft, optional sound (tile clicks, ink, gentle chime). Everything EASES — anticipation + follow-through, never instant/linear. **Adaptive:** lush/bouncy for younger, subtle/quick for older; full `prefers-reduced-motion` + skip support.

**Ownership (protect the rule in code):** elements do NOT independently award XP, fire celebrations, or infer persistence — they emit *neutral* learning events (`student_self_corrected`, `student_persisted`, `student_completed_hard_step`, …). A central **`EngagementEngine`** decides tier/sound/tutor-reaction/XP — the single place the "reward effort, not correctness" rule lives, so it's auditable, rate-limited, and farm-proof (random tile-jitter and undo/redo farming earn nothing). This stops every element becoming its own slot machine.

Through-line: **juice as encouragement, not reward** — a tutor leaning in with "ooh, nice move" in the instant the student does the thinking. Manipulation juice ships WITH the tile loop; the feel IS the feature.

---

## 3bis. Before we build (resolve before Phase 1 code)

**Blockers — Phase 1 can't be written well until these are pinned:**
- **B1. The `StudentMove` contract.** Exact schema + transport for a gesture→pipeline input (open Q1). Decide: reuse the `/api/chat` POST with a structured `move` payload (simplest — one lock, one pipeline), or a lightweight board channel. Must enter `observe` as a first-class move without faking a text message.
- **B2. Tile semantic-engine mini-spec.** Phase 1 hinges on a deterministic engine that knows like-terms, zero-pairs, area models — what operations it supports and what canonical moves it emits. This is real math-modeling; spec it before coding.
- **B3. Fabric salvage audit (spike).** Read `whiteboard.js` end-to-end and decide reuse-vs-rewrite (open Q3). Cheap, decisive, unblocks Phase 0.
- **B4. Performance target + spike.** Name the worst target device (low-end school Chromebook / budget phone), set a frame + bundle budget, and spike Fabric+KaTeX+animation on it. The inline-mirror fallback is the safety valve if it fails.
- **B4a. KaTeX-in-Fabric render path (the single biggest unknown, per the audit).** Fabric doesn't render LaTeX. Decide the approach — KaTeX→HTML overlay tracked to Fabric object coords, or KaTeX→image rasterized into a Fabric image — before Phase 0. Half-day spike; it gates the equation-card element (the spine).
- **B5. Accessibility model.** The keyboard/`mathmatixKeyboard` non-drag path and screen-reader semantics must be designed INTO Phase 1, not bolted on — never gate correctness behind a gesture a student can't perform.
- **B6. Test harness for gestures.** How to simulate a gesture → assert the emitted `StudentMove` → assert the pipeline move. Extend the existing puppeteer QA harness.
- **B7. Visual mockup to build against.** A static mock of the canvas (warm graph paper, a tile, an equation card, the pen) so Phase 1 isn't built blind.

**Design-in-parallel (not blockers, but decide the shape now so later phases are cheap):**
- Element **semantic-model shape** must be snapshot-serializable from day one (enables Phase 6 persistence for free).
- **Flag/rollout story** — reconcile `LIVING_WORKSPACE` with the `boardPanel` drift; define what "shadow" means for a UI (can't shadow pixels — likely dev-only preview + staged % rollout).

**Later-phase gates (block a specific phase, not Phase 1):**
- **Visual-gate vertex/y-intercept/intersection leak math** MUST land before Phase 2 draggable graphs.
- COPPA image-whitelist review before uploads (Phase 3) promote arbitrary photos to a shared surface.

---

## 4. Phased build plan (re-sequenced: contracts first, tabs last)

Each phase: behind a flag, independently demoable, tests + QA before merge (main auto-deploys — never push a broken branch). Feature branches off the board line; Jason merges. **Guiding rule (GPT-informed): prove the one loop — student manipulates → server understands → tutor reacts — before rebuilding the board. The old surface stays live until the new one is proven beside it.**

**M-A · Contracts & the invisible spine (no UI).**
- **P0 — Freeze the contracts.** Shared runtime-validated schemas: `StudentMove`, `VerifiedMove`, `WorkspaceElement`, `WorkspaceSnapshot`, `BoardCommand`, `PresenceCommand`, `LearningEvent`. Decide IDs/versioning, server-authoritative vs client fields, idempotency, undo, provisional-vs-committed, exploration-vs-attempt. *Done: same schema validates client & server; the client can't declare its own move correct; a snapshot round-trips.*
- **P1 — Pipeline adapter.** `POST /api/student-moves` → normalize → existing `observe/diagnose/guard/decide/generate` (shares the chat lock; no duplicated logic). *Done: a `2x+3x→5x` payload verifies + produces a tutor reaction respecting the mirror rule; a `2x+3→5x` payload comes back invalid with a misconception code + coaching, not a hard reject.*
- **P2 — Headless algebra-tile engine** (no Fabric, no browser). Ops: combine_like_terms, create/remove_zero_pair, move/split/select_group, undo. *Done: unit tests for like/unlike terms, zero pairs, empty-space drops, undo, dup submissions, malformed state.*

**M-B · Visual foundation (beside the old board).**
- **P3 — Workspace shell** behind `LIVING_WORKSPACE=off` (modes `off/dev/beta/live` — no "shadow" for a UI). Decomposed: Shell · Viewport · ElementRegistry · InteractionController · OverlayManager · SnapshotManager · AccessibilityController · LayoutController. First render: graph-paper substrate + one static equation card. *Done: mounts/unmounts with no listener leaks, resizes, holds frame rate on the target Chromebook, doesn't touch current board/chat.*
- **P4 — The equation element (the spine).** Resolves B4a: **DOM (KaTeX/MathLive) overlay synced to Fabric coords via `OverlayManager`**; rasterize only as a perf fallback for static cards. Move-by-frame, edit, scale, focus, serialize, restore, screen-reader text. *Done: no drift on pan/resize; crisp at zoom; editing doesn't drag the canvas; reload restores it. **Don't proceed until stable — it's the spine.***
- **P5 — Read-only legacy adapter.** `LegacyBoardCommand → WorkspaceCommandAdapter → elements`, so today's pipeline renders on the new surface. *Done: old board & new workspace convey equivalent content; guards/visual-gate/mirrors unchanged.*

**M-C · Product proof (the milestone that proves the vision).**
- **P6 — Tile rendering + local interaction.** Reads the headless engine; lift/snap-preview/target-highlight/zero-pair-preview/cancel; explicit interaction zones (drag the card header = reposition; drag the math object = math). *Done: mouse/touch/pen/keyboard produce the same operation object; a canceled gesture changes nothing.*
- **P7 — Close the loop (tiles → `StudentMove` → tutor).** Two-layer response; provisional `?` state; correct + incorrect + zero-pair + undo + offline + dup + rapid moves. *Done: **this is the actual proof of the product concept.***

**M-D · Presence.** **P8 —** ghost cursor, pointing, circles/underlines (harvested primitives), partial-step pacing, reduced-motion static equivalents; presence as a separate command layer that never blocks student input.

**M-E · Juice & interface migration.**
- **P9 — Controlled juice.** Central `EngagementEngine` (elements emit neutral events; it owns tier/sound/XP, rate-limited, farm-proof). Ship tile-settle, soft click, pulse, self-drawing check, self-correction spark — no big celebrations yet.
- **P10 — Layout modes.** Chat (board sidebar ~30–35%) / voice (board ~70–75%, transcript rail); mobile sheets; **switching modes never remounts or loses state.**
- **P11 — Remove tabs & retire the card stack.** Only now. Dev-mode dual-run + compare, then staged rollout (dev → internal → pilot class → % → default), kill switch retained through a stability window.

**M-F · Expansion (same element framework each time).**
- **P12 — Semantic snapshots** (§3.8) — resume + re-frame; corrupt-snapshot graceful fallback.
- **P13 — Number line.**
- **P14 — Graph handles — ONLY after the visual-gate leak math is extended** (vertex/y-intercept/intersection; see Risks). Start narrow (slope handle, y-intercept, point-on-known-function), not a Desmos clone.
- **P15 — Uploads to board** — image element with **image-relative** annotation anchors (not global coords), COPPA review first.
- **P16 — Voice↔board sync** — segment-level cues first (`segment_started/completed`), word-boundary later with graceful degradation; interruption ducks TTS + captures the student move + resumes with new context.
- **P17 — Narrow geometry models only** (draggable triangle vertices, angle measure, slope triangle) — NOT a general geometry engine.

---

## 5. Risks & watch-items

- **Visual-gate coverage gap:** the leak math currently checks roots/x-intercepts only — **vertex / y-intercept / intersection leaks are NOT caught.** Draggable graph handles make this more exploitable; extend `graphRevealedValues` before shipping Phase 2 draggable graphs.
- **Handwriting legibility** is why we chose typeset-under-pen; don't regress into messy true-stroke math.
- **Performance:** Fabric + animation + KaTeX on low-end school Chromebooks/phones. Budget it; the inline-mirror fallback is the safety valve.
- **Mobile touch vs. drag vs. scroll** conflicts on the free canvas — needs careful gesture arbitration.
- **Accessibility:** a drag-first math surface must have a full keyboard/`mathmatixKeyboard` path and screen-reader semantics; never gate correctness behind a gesture a student can't perform.
- **Latency of gesture→pipeline:** keep interpretation deterministic/client-side; don't LLM-round-trip every drag.
- **`boardPanel` default drift:** `chat.html:30` currently forces the panel on for `fix/board-full-working-order`; reconcile the flag story under `LIVING_WORKSPACE`.

---

## 5.5 Definition of Done — every element (governance)

No new workspace element ships without ALL of: versioned semantic state · deterministic serializer · renderer · gesture interpreter · **keyboard/command-equivalent path** · screen-reader semantics · `StudentMove` mapping · **server verification** · undo · snapshot restore · mobile behavior · reduced-motion behavior · unit tests · end-to-end pipeline tests · **anti-cheat / visual-gate review** · performance check · feature-flag protection. The "fully functional" bar made concrete — it stops the project shipping pretty-but-half-wired manipulatives.

---

## 6. Open questions

1. ~~`StudentMove` schema & transport~~ — resolved §3.4: dedicated `POST /api/student-moves`, server-authoritative, sharing the chat lock.
2. `moveType → allowedElements` map — derived deterministically (preferred, auditable) or part of `decide` output?
3. ~~How much of System B is salvageable~~ — resolved §2.1.
4. Snapshot storage location/size — on `conversation`, or a dedicated collection with a cache on the conversation (like the IEP split)?
5. ~~Voice↔board sync~~ — resolved §3.9: segment-level cues first, word-boundary later with degradation.
6. Shared client/server schema plumbing — one validator usable in both the Vite-bundled client and the CommonJS server (the shape already exists in `boardResponseSchema.js`; needs a shared home).

---

*This spec captures decisions 1–11 from the 2026-07-12 design session, revised the same day with an external technical critique (adopted: contracts-first re-sequencing, server-authoritative `StudentMove`, two-layer response, provisional-state transaction model, component decomposition, `EngagementEngine`, per-element DoD, dev/beta/live flags, bounded canvas). It is intent; verify against source as it's built. The safety gauntlet is non-negotiable and unchanged: every new generator (gestures, new elements) is untrusted and flows through the same guard.*
