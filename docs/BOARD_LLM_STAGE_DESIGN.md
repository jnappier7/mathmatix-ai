# Board LLM Stage — Design

**Status:** Proposed · **Branch:** `feat/board-llm-stage` · **Flag:** `BOARD_LLM_MODE` (default `off`)

## Context

Today the Work Board is driven by the *tutor* model: it emits `board_commands`
(structured output) or inline `<BOARD>` tags in the same call that writes the
chat message. That makes one model do two jobs — teach *and* transcribe its own
teaching into board cards — and the second job degrades as the prompt grows. The
schema file says so directly ([utils/boardResponseSchema.js](../utils/boardResponseSchema.js)):

> "Compliance is unreliable: the geometry-review session that triggered this work
> showed Maya posing ~10 problems without emitting a single tag. Even with
> 'MANDATORY' in caps, side-channel prompt rules degrade as the prompt gets long."

The deterministic synthesizer and the four backfill stages in
[utils/pipeline/index.js](../utils/pipeline/index.js) exist to paper over that
unreliability. They help, but they're pattern-matchers guessing at intent.

**Proposal:** let the tutor *teach*, then have a second, focused LLM call
translate the final tutor message into board cards. Separate the two jobs.

## Thesis

**The safety architecture is generator-agnostic.** Every board source already
flows through the same deterministic gauntlet — `boardCommandGuard` (the #1
anti-cheat rule) → the `revealsPinnedProblem` backstop → the visual gate. None
of that trusts the generator. So a board LLM is *not* a trusted component; it is
just another noisy generator whose output is filtered exactly like the tutor's
tags are today.

Two rules govern the whole design:

1. **Compliance improves because the prompt is short and single-purpose.** (Not
   "near-perfect" — a short, focused prompt raises compliance; it does not
   guarantee it. The guard exists precisely because no generator is perfect.)
2. **Board LLM output is advisory only. The deterministic guard owns final
   authority.** The board LLM proposes; the guard disposes. A proposed card that
   reveals the student's pinned problem/answer, names a disallowed action for
   the move, or fails a required-field check is dropped — no exceptions, no
   "the model was confident."

## Architecture

```
decide → generate(chat) → boardLlm(chat, context) → guard → merge → gate
```

The board LLM is a new stage between `generate` and the existing board-assembly
guard. It produces `board_commands` in the **same compact shape the guard already
consumes** (`{action, tex?, op?, fn?, query?, caption?}`, via
`normalizeBoardCommand`), so it plugs into the current machinery as a new source
of `rawLlmBoardCommands` — nothing downstream changes.

### Inputs (this is the architectural caution)

The board LLM must **not** read `chatText` alone. Pretty board content that is
misaligned with the move or the safety state is a failure, not a near-miss. It
receives:

| Input | Why it's needed |
|---|---|
| `chatText` | the final tutor message — the thing to mirror, verbatim |
| `moveType` | the `decide` action/turn (e.g. `worked_example`, `verification`) — what *kind* of cards belong here |
| `pinnedProblem` | the student's active problem — so it knows what it must **never** reproduce |
| `teachingMode` | whether worked-example steps are permitted this turn (the `workedExampleBoard` signal) |
| `allowedBoardActions` | the whitelist of actions valid for this move — see below |
| `currentSkill` / context | the active skill + recent board state, so cards align with the lesson, not just the sentence |

`allowedBoardActions` is the alignment lever: the orchestrator tells the board
LLM which actions are legal for *this* move (e.g. `worked_example` → `{example,
pose, clear}`; `verification` → `{verify}`; `small_talk` → `{}`). It constrains
output to move-appropriate cards before the guard even runs — defense in depth,
and it keeps the board from contradicting the chat.

### Output authority — defense in depth

```
boardLlm  →  (advisory board_commands)
              │
   guard ─────┤  drop anything that reveals the pinned problem/answer,
              │  uses a disallowed action, or is malformed
   merge ─────┤  reconcile with the deterministic synthesizer (LLM wins on overlap)
   gate  ─────┘  visual gate blocks graph/image that leak geometrically
              │
              ▼
        final board_commands  ← the ONLY thing the client renders
```

The board LLM never writes to the board directly. Its proposal is one input to a
pipeline whose final authority is deterministic code.

## Relationship to existing work

This **replaces the tutor's board job, not the safety net.** The current
mechanisms demote to fallback:

- **Structured-output path** (`STRUCTURED_TUTOR_RESPONSE`): the tutor stops being
  asked to emit `board_commands`; that responsibility moves to the board LLM.
  (The chat-message + turn_type halves of the structured response may stay or
  fold into the board call — open question below.)
- **Deterministic synthesizer + worked-example extractor**
  (`synthesizeBoardCommands`, `synthesizeWorkedExampleSteps`): become the
  **fallback** when the board call times out, errors, or returns junk. They add
  zero latency and never fail — a good floor under the LLM.
- **`boardCommandGuard` / `revealsPinnedProblem` / visual gate:** unchanged. A
  board LLM stares straight at the pinned problem, so the backstop matters *more*,
  not less.

The worked-example mirror already shipped on `feat/workboard-worked-example-mirror`
fits this cleanly: the board LLM becomes the **primary** source of `example`
cards (faithfully mirroring a derivation it reads in the chat, no regex), and
`synthesizeWorkedExampleSteps` becomes its fallback. The `example` action, the
guard's teaching-mode + backstop logic, and the `worked` card all stay as-is.

## Faithfulness / grounding rules (prompt)

- Mirror **only** what the tutor actually wrote in `chatText`. Do not invent,
  extend, or complete a derivation the tutor didn't state.
- **Never** emit a card that solves, or reveals the answer to, `pinnedProblem`.
- Use only `allowedBoardActions` for this move.
- Prefer the tutor's exact LaTeX; label steps, don't rewrite them.

(The guard enforces the safety subset of these deterministically; the prompt is
for quality/alignment, not safety.)

## Cost & latency

- **Latency:** one extra sequential call per board-relevant turn. Mitigations:
  (a) a fast model — Haiku is plenty for "turn this prose into cards";
  (b) **gate on `moveType`** — skip `small_talk` / `redirect` / `feedback`
  (`decide` already classifies this), so non-board turns pay nothing;
  (c) stream the chat first, fill the board a beat later — the reply never blocks
  on the board call.
- **Cost:** another call per board turn, Haiku-cheap and skippable. Net may even
  drop if it lets us trim board protocol out of the (expensive, Opus) tutor
  prompt.

## Rollout

Mirror the visual gate's discipline — `BOARD_LLM_MODE`:

- `off` (default) — stage skipped entirely; pipeline behaves exactly as today.
- `shadow` — board LLM runs, output is logged + compared against what the current
  path would have produced, but the **current path still renders**. Collect a
  corpus before trusting it (same posture that made the visual gate safe to ship).
- `live` — board LLM is the primary source; deterministic synthesizer is the
  fallback. Guard/gate unchanged in every mode.

## Open questions

1. **Does the chat call keep `turn_type`?** The board LLM could re-derive it, or
   we keep the tutor's self-declared turn_type as another input. Leaning: keep it
   as an input (cheap signal), let the board LLM treat it as advisory too.
2. **One board call or move-specialized prompts?** A single general prompt vs.
   slightly different instructions per move. Start with one; specialize only if
   shadow data shows a weak move.
3. **Where does `allowedBoardActions` come from?** Derived from `moveType` in a
   small deterministic map (preferred — auditable), or part of the `decide`
   output.
4. **Streaming interaction.** With chat streamed, the board call needs the
   *complete* chat text — it runs at end-of-stream. Confirm that's acceptable UX
   (board lands ~1 Haiku-latency after the message finishes).

## Verification plan

- **Shadow corpus:** run `BOARD_LLM_MODE=shadow` over real/replayed sessions;
  measure (a) compliance vs. the current path (does it emit the right cards when
  the current path misses?), (b) guard-drop rate (how often does it propose a
  leak — must be caught 100%), (c) alignment with `moveType`.
- **Safety regression:** the existing guard/gate suites must stay green; add
  tests that feed the board LLM stage adversarial proposals (a card that *is* the
  pinned problem) and assert the guard drops them — proving advisory-only.
- **Worked-example end-to-end:** the circle-derivation turn → board LLM emits
  ordered `example` cards; kill the board call mid-test → `synthesizeWorkedExampleSteps`
  fallback still produces them. Both paths converge on the same `worked` cards.

## Summary

The structured-response path tried to make one model do two jobs. This separates
them: the tutor teaches; a short, single-purpose board LLM translates the final
message into cards; and the deterministic guard — which never trusted any
generator — has the final say. **Advisory in, authoritative out.**
