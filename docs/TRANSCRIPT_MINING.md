# Transcript Mining — the eval-as-feedback-loop

> Owner-approved direction: *"use the eval as a feedback tool and learn from its own weaknesses."*
> A nightly job runs the tutor-reply judges from the eval harness over recent **production**
> conversations and surfaces violations as a ranked admin report. Every hit is a **candidate for
> human review and a candidate eval scenario** — judges are a regression net, not ground truth
> (PR #1443's calibration), so nothing here auto-actions anything.

## The loop

```
production transcripts ──▶ nightly sweep ──▶ ranked admin report ──▶ human review
        ▲                                                                │
        └────────── tutor fixes ◀── eval scenarios ◀── promoted stubs ◀──┘
```

## Pieces

| Piece | File |
|-------|------|
| Deterministic judges (shared with eval + live pipeline) | `utils/replyJudges.js` (shim at `tests/eval/judges.js`) |
| LLM judges (shared with live eval tier) | `utils/replyLlmJudges.js` (moved from `tests/eval/llmJudges.js`; a re-export shim remains) |
| The miner | `utils/transcriptMiner.js` |
| Persisted runs (90-day TTL) | `models/tutorQualityReport.js` |
| Cron entry | `scripts/mineTranscripts.js` → `npm run cron:mine-transcripts` |
| Admin surface | `GET /api/admin/tutor-quality-report` (`?list=1`, `?runId=`), `POST /api/admin/tutor-quality-report/run` |

## How judge ctx is derived (no re-grading)

The miner reconstructs each judge's context from stamps the pipeline already wrote:

- **`studentWasCorrect`** — the assistant reply's `problemResult` stamp. `utils/pipeline/persist.js`
  stamps `'correct' | 'incorrect' | 'skipped'` on the reply to an answer attempt, so a reply stamped
  `correct` that *reads* like a rejection ("not quite…") is exactly the `rejectedCorrectAnswer` failure.
- **`hasFocus` / `answer`** — an active-problem state machine over `messages[].problemInfo`
  (set on AI messages that pose a problem, with `correctAnswer`) closed out by a later
  `correct`/`skipped` stamp. The closing reply is judged against the still-active problem.
- **`mustNotReveal`** — mirrors the answer-injection gate: problem active, not yet solved or skipped.
  Answers shorter than 2 chars never arm the reveal judges (a bare "5" substring-matches everything).
- **`shouldElicit`** — `observe()`'s `isBareProblemDrop` re-run on the student turn with the same
  rolling windows the live pipeline builds. `observe` is pure (no LLM, no DB), so this is free.

## Tiers & budget

1. **Deterministic sweep** — every assistant turn of every conversation with `lastActivity` in the
   window (default 24h, capped at `TRANSCRIPT_MINER_MAX_CONVERSATIONS` = 500 conversations, last 200
   messages each). Pure regex judges, zero API cost.
2. **LLM tier** — `answerLeak` / `scaffoldVsTell` / `toneSupport` on a sample: deterministically
   flagged turns first, then a random fill for base rates, hard-capped at
   `TRANSCRIPT_MINER_LLM_BUDGET` (default 40 calls, `gpt-4o-mini` via `EVAL_JUDGE_MODEL`).
   Judge routing: frustration/give-up turns → tone; live-problem turns → leak; incorrect-attempt
   turns → scaffold-vs-tell. Disable with `TRANSCRIPT_MINER_DISABLE_LLM=true` or `--no-llm`.

## FERPA / PII

- **Everything stored in the report and everything sent to the LLM judges is anonymized first**
  (`utils/piiAnonymizer` — student names → `[Student]`). `callLLMStructured` is the gateway's
  low-level entry and does **not** anonymize by itself; the miner does it before building payloads.
- The admin GET logs access per student surfaced in the served findings via
  `middleware/ferpaAccessLog.logAccess` (34 CFR § 99.32) — excerpts are anonymized but still tied to
  identifiable `conversationId`s.
- Encrypted conversation fields (`summary`, `strugglingWith`) are never selected — the miner reads
  only `messages`, whose stamps and content are the judged material.

## Scheduling (Render)

Render crons are configured **manually in the dashboard** (this repo's `render.yaml` is reference
only — CLAUDE.md §10). Add a cron job on the production service's image:

- **Schedule:** `0 7 * * *` (07:00 UTC, after US evening usage)
- **Command:** `npm run cron:mine-transcripts`

Needs `MONGO_URI` (+ `OPENAI_API_KEY` for the LLM tier). Run it from the Render Web Shell for a
one-off (`node scripts/mineTranscripts.js --hours=48 --no-llm`); local runs need your IP on the
Atlas allowlist. An admin can also trigger a run from the API without any cron.

## Reading the report

`stats.rankedJudges` is the headline — violations per judge **ranked by absolute count** (the same
work-list rationale as `verifyMetrics.unresolvedByMathType`: absolute count is where a fix buys the
most turns). Each violation-rate denominator is the judge's *eligible* turns (e.g.
`rejectedCorrectAnswer` can only fire on correct-answer turns), not all turns.

`findings[]` are the specific moments: `conversationId`, `turnIndex`, judge, evidence quote,
anonymized reply/student excerpts, and the derived ctx. `scenarioStubs[]` are the top findings
re-shaped to `tests/eval/scenarios.json` format — copy one in, replace the auto-generated `name`,
sanity-check the ctx flags against the transcript, and it becomes a permanent regression case.

**Expect false positives.** The deterministic judges are calibrated on curated eval scenarios;
production language is messier. Promote a stub only after reading the actual moment — and when a
finding is a *judge* bug rather than a tutor bug, that's the "learn from its own weaknesses" half:
fix the marker in `utils/replyJudges.js` (which tightens CI too, since the eval shares it).

## Relationship to the live judge telemetry (Stage 5g)

`utils/pipeline/index.js` Stage 5g already runs the ctx-free judge subset (`PROD_JUDGES` in
`utils/replyJudges.js`) on **every live tutor turn**, feeding the in-memory ring in
`utils/judgeMetrics.js` (surfaced under `replyJudges` on `GET /api/admin/structured-tutor-metrics`).
The two surfaces are complementary, not redundant:

- **Live telemetry** — trend lines. Per-turn, in-process, ctx-free judges only, ring resets on
  restart. Answers *"is the rejected-correct-answer rate moving?"*
- **Transcript mining** — evidence. Nightly, all seven judges with **derived ctx**
  (`hasFocus`/`mustNotReveal`/`shouldElicit` reconstructed from stamps), plus the LLM tier, plus the
  specific transcript moments and eval-scenario stubs, persisted across restarts. Answers *"show me
  the actual failures, and give me the regression case."*
