# `POST /api/student-moves` — integration plan (P1)

How the new student-move route reuses the EXISTING tutoring brain — no
duplicated logic, one lock, anti-leak gate intact. Companion to
`BOARD_LIVING_WORKSPACE_SPEC.md` §3.4.

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

## Why the seam was deferred
This worktree has no `node_modules`; the server can't boot and the chat integration
tests can't run here. `routes/chat.js` is the app's most load-bearing file and main
auto-deploys — extracting `runStudentTurn` must be verified live, not merged blind.
The `?tutor=true` param currently returns **501** (loud, not a silent no-op) until this lands.
