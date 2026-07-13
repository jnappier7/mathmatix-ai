# `POST /api/student-moves` — integration (P1) — ✅ LANDED 2026-07-12

How the new student-move route reuses the EXISTING tutoring brain — no
duplicated logic, one lock, anti-leak gate intact. Companion to
`BOARD_LIVING_WORKSPACE_SPEC.md` §3.4.

> **Status:** the seam is wired and tested on the live stack (branch
> `feat/living-workspace-seam`). `runStudentTurn` is extracted from
> `routes/chat.js`; `?tutor=true` delegates through it; the route is
> registered in `config/routes.js`. The "recommended change" and "why it was
> deferred" sections below are kept as the design record.

## What already ships on this branch (verified)
- `shared/workspace/**` — the contracts (P0).
- `utils/workspace/algebraTileVerifier.js` — authoritative tile verdict (12/12 self-test).
- `services/workspace/moveNormalizer.js` — verified move → canonical stated-step string.
- `services/workspace/studentMoveService.js` — `processStudentMove(payload)`: validate → verify → build `VerifiedMove` → normalize.
- `routes/studentMoves.js` — the route; returns the server-authoritative `VerifiedMove`.

The deterministic loop — *untrusted move in → authoritative verdict out* — is complete and tested.

## The one seam left: the tutor reaction (needs the live stack)
The tutor's spoken/board reaction must run through the **existing** pipeline so it
shares the per-user lock and the anti-leak gate. Those are **private and inline**
in `routes/chat.js` today:
- `acquireUserLock(userId)` (chat.js:133) — module-private FIFO mutex per `userId`.
  A second lock Map in another file is a *different* mutex → a student-move-vs-typed-
  message race would survive. **Must reuse this instance.**
- `runPipeline(message, ctx)` (utils/pipeline/index.js:95) needs a *fully-built* `ctx`
  (`systemPrompt`, `formattedMessages`, loaded `conversation`, `activeSkill`, `tutorPlan`)
  that is assembled inline in the chat `POST /` handler — not extracted anywhere.
- Anti-leak gate is structural: `diagnose` returns `no_answer` unless `observation.answer`
  is set (diagnose.js:60), and generate's injectors bail on `no_answer`
  (generate.js:254/272). So a move must simply CLASSIFY as `ANSWER_ATTEMPT` — never
  hand-inject `correctAnswer`.

### Recommended change (do on the real checkout, boot + integration test)
1. In `routes/chat.js`, extract the `POST /` handler body into an exported
   `async function runStudentTurn(req, res)` and mount it for the chat router.
2. Have `studentMoves.js` set `req.body.message = result.normalized.pipelineMessage`
   (the canonical stated step, e.g. `"2x + 3x = 5x"`) and delegate to `runStudentTurn`.
   It then acquires the SAME `acquireUserLock`, builds the SAME `ctx`, runs the SAME
   `runPipeline`, and returns the SAME `complete`/JSON shape — zero duplication.
3. Register the route (mirror chat, add `isStudent`):
   ```js
   const studentMovesRoutes = require('../routes/studentMoves');
   app.use('/api/student-moves', isAuthenticated, isStudent,
           aiEndpointLimiter, usageGate, studentMovesRoutes);
   ```
4. **Validate on the stack** (this is why it wasn't done blind): confirm the normalized
   string classifies as `ANSWER_ATTEMPT` in `observe` (extractAnswer, observe.js:106),
   that diagnose verifies it, that the board mirrors it, and that the answer-injection
   gate stays closed on `exploration` moves. Add integration tests alongside
   `tests/integration`.

## Live-stack findings (what the boot revealed)
- **The bare equation does NOT classify as an answer.** Probing the real
  `observe()`, `"2x + 3x = 5x"` → `GENERAL_MATH` **and** `isBareProblemDrop`,
  i.e. it reads as a *fresh unsolved problem* and would trigger the anti-leak
  ELICIT_FIRST path — the exact wrong reaction. `observe.extractAnswer` never
  captures an algebraic result across an `=`.
- **Fix:** `moveNormalizer` now emits TWO strings. `statedStep` stays the clean
  equation (`"2x + 3x = 5x"`, the board-mirror/display form); `pipelineMessage`
  is a first-person completed action — `"I combined 2x + 3x to get 5x"` — which
  `observe` classifies `ANSWER_ATTEMPT` with the full algebraic result preserved
  (`5x`, not truncated to `5`) and `isBareProblemDrop = false`. Verified for
  valid, misconception, negative-coefficient, and other-variable moves.
- **Delegation only for `attempt` moves.** `reposition`/`exploration` yield
  `normalized: null`, so the route returns the verdict alone and never invokes
  the pipeline — the anti-leak gate stays structurally closed on exploration
  (the answer-injection site simply never runs).
- **One round-trip.** `studentMoves` stashes the authoritative `VerifiedMove`
  on `req.studentMove`; `runStudentTurn` merges it into the response so the
  client gets both the tile verdict and the tutor reaction together.

## Why the seam was deferred (historical)
The prior worktree had no `node_modules`; the server couldn't boot and the chat
integration tests couldn't run there. `routes/chat.js` is the app's most
load-bearing file and main auto-deploys — extracting `runStudentTurn` had to be
verified live, not merged blind. (Done now on an isolated worktree WITH
`node_modules`.) Until it landed, `?tutor=true` returned **501** (loud, not a
silent no-op).
