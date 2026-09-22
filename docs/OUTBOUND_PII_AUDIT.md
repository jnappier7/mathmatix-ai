# Outbound PII audit — what leaves for OpenAI and Anthropic

**Date:** 2026-09-22 · **Scope:** every code path that sends anything to an LLM
provider (OpenAI, Anthropic), including embeddings, moderation, vision and
speech. 52 server files, ~70 call sites, plus the four prompt builders.

## Why

OpenAI's privacy team answered our inquiry (Sept 2026) with three things that
matter for a K-12 product using their API:

1. Under the Business Terms the **platform** is responsible for compliance,
   including *"ensuring that no personal data of children under 13 is sent to
   OpenAI"* and obtaining any consent local law requires. That is stricter
   than "get consent first": their stated expectation is that it is not sent.
2. **Zero Data Retention is not available** to us (enterprise sales only, no
   timeline). API requests are retained up to 30 days for abuse monitoring.
3. The DPA question was forwarded; a self-serve DPA exists on their policies
   page and should simply be executed.

So the question this audit answers is: *does the code actually keep a child's
identity out of the request?* The answer was no, and this PR makes it yes for
everything that text filtering can reach.

## What was found

### The architecture was right and switched off

`utils/openaiClient.js` already had a chokepoint (`stripOutboundPII`) at the
top of `callLLM` / `callLLMStructured` / `callLLMStream`, ahead of both
providers' dispatch. Two things made it insufficient:

- It ran only when `PII_STRIP_OUTBOUND=true`. The flag was documented as
  "set this in production"; production ran without it. The chokepoint test
  literally pinned OFF as "what production runs today". **Default: nothing
  stripped, anywhere.**
- Even ON, name stripping required each call site to pass
  `options.anonContext`. Of ~60 call sites, **one** did (the teacher lesson
  planner). The main tutoring pipeline attached one; every other student-facing
  path (voice, guided lesson, welcome greeting, rapport intake, grade-work
  greeting, the verify stage's 12 regenerations, the board translator, the
  step evaluator, the visual gate, the reading-level simplifier) did not.

### Three paths bypassed the chokepoint entirely

| Path | What went out | Status |
|---|---|---|
| `services/aiService.js` — own `new OpenAI()` handle | every placement-assessment turn | Also **broken**: exported `callYourLLMService`, route called `.chat()` → TypeError, 500 on every message. Rewritten through the gateway with the export the route uses. |
| `llmGateway.gradeWithVision` — SDK call inside the gateway | photo + grading prompt | Now `callLLM`. The pixels still go out (see "cannot be filtered"). |
| `generateEmbedding` — `openai.embeddings.create` | the student's **raw chat message** on every turn where `resourceDetector`/`ragRetrieval` runs; teacher uploads' OCR text | Now stripped like a prompt. |

`routes/voice-test.js` also held the SDK handle (literal payload, no PII);
rerouted so the source scan stays at zero.

### Prompts that wrote identity straight into the text

| Site | What | Fix |
|---|---|---|
| `utils/promptCompact.js:756`, `utils/prompt.js:630` | `**Name:** First Last` on **every tutoring turn** | first name only (the surname had no pedagogical use) |
| `utils/summaryService.js:28-35` | first + last name, **username**, and **verbatim IEP goal text with progress %** in one block, plus the whole transcript twice | `[Student]`, no username, IEP as a count; explicit child context |
| `utils/activitySummarizer.js:240` | `Student: First Last` + 15 transcript turns (teacher live feed / session end) | `[Student]`; explicit child context |
| `routes/chat.js:2302-2470` (parent chat) | child's first name ~25×, parent's name, grade, course, IEP accommodations and goal text | explicit context hiding child → `[Student]` and parent → `[Parent]`, both restored |
| `routes/courseChat.js:532-592` | ghost turn `"Hi, I'm ${firstName}. I'm in ${gradeLevel}…"` | covered by the request scope |
| `routes/welcome.js`, `routes/rapportBuilding.js`, `routes/guidedLesson.js`, `routes/gradeWork.js:90`, `routes/voice.js`, `utils/voiceSession.js` (×3), `utils/pipeline/verify.js:1164` (`"${firstName}'s reading level (IEP target: Grade N)"`) | first name and/or the full legacy profile block (name, grade, interests, IEP accommodations, reading level, goals) | covered by the request scope / voice-turn scope |

### Ordering hazard closed

`generate.js` rehydrated the name back into the tutor's reply, then
`boardLlm.js`, `visualGate.js` and `verify.js` forwarded that reply to the
provider again with no context — so the name left on the *second* call even
on a turn where the first was stripped. With the scope, every one of those
follow-on calls strips it again.

## What changed

1. **On by default.** `PII_STRIP_OUTBOUND` is now an opt-out: only the literal
   `false` disables it (`outboundPiiStripEnabled()` in `utils/piiAnonymizer.js`,
   the single source of truth used by `openaiClient`, `generate.js`, `chat.js`).
2. **Request scope.** `middleware/outboundPii.js` opens an `AsyncLocalStorage`
   context from `req.user` after passport and impersonation. The chokepoint
   falls back on it when a call has no `options.anonContext`. Students map to
   `[Student]`; teachers/parents to `[Teacher]`/`[Parent]` (an adult is not a
   student — see `createActorAnonymizationContext`). Voice sessions have no
   request, so `voiceSession._startTurn` opens the same scope per turn.
3. **Rehydration at the chokepoint.** `callLLM` restores names in the
   completion, `callLLMStructured` parses restored JSON, `callLLMStream` wraps
   the chunk stream (a placeholder split across chunks is reassembled first;
   tool-call chunks pass through). Existing site-level rehydration is now an
   idempotent no-op rather than a requirement.
4. **Bypasses closed** (table above) and a **source scan test** that fails CI
   on any `chat.completions.create` / `embeddings.create` / `new OpenAI(` /
   `new Anthropic(` / SDK `require` outside the two provider clients.
5. **Prompt minimization** at the sites in the table above.
6. **Disclosures corrected**: `public/subprocessors.html` and
   `public/safety.html` no longer say "when enabled"; they state what is
   filtered, what cannot be, and OpenAI's 30-day retention.

Pinned by `tests/unit/outboundPiiScope.test.js` and
`tests/unit/outboundPiiChokepoint.test.js`.

## What still goes out — by design, and what to decide

**Cannot be filtered by text processing:**
- **Photo pixels** (grade-work vision, upload classifier, check-work
  verifier, moderation). A name written at the top of a worksheet is in the
  image. Mitigations available: crop the header client-side before upload;
  run Mathpix OCR first and send text only (loses the "read my handwriting"
  grading). Both are product decisions.
- **Voice audio** to Whisper on the fallback STT path (`routes/voice.js:188`).
  Deepgram is primary; the fallback is rare but real.

**Sent, de-identified by name, because the tutor needs it** (all disclosed in
the Privacy Policy): grade, course, interests, learning style, preferred
language, IEP accommodation *types* and reading level, active IEP goal
descriptions (`promptHelpers.js:101`; target date and measurement method are
abstracted by the sanitizer), math-anxiety level, family/student support
notes (free text — a parent can type a name into it), tutor-plan notes,
skill-mastery history, the active worksheet's OCR text, and the current date.
Whether goal *text* should be reduced to skill ids is a pedagogy-vs-privacy
call for the owner; the code makes either easy (`promptHelpers.buildIepAccommodationsPrompt`).

**Free text the student types** is stripped of their own name and pattern
PII only. "My teacher Ms. Okafor at Lincoln Middle said…" goes out. A
NER-based pass would catch more and cost latency on every turn; not done here.

## Policy items (not code)

1. Execute OpenAI's self-serve DPA from their policies page; keep the
   countersigned copy with the Anthropic terms.
2. Keep parental-consent records (`consentRecords`, `consentGate`) as the
   evidence OpenAI's letter says they expect the platform to hold.
3. ZDR from OpenAI is not coming at our scale. If 30-day retention is
   unacceptable for a district contract, **Azure OpenAI** serves the same
   models and lets a small customer apply to disable abuse-monitoring
   storage; `utils/openaiClient.js` is the only file that would change.

## Verify / roll back

- `npm run test:unit` — the two pinned suites above.
- Admin: `GET /api/admin/structured-tutor-metrics` → `unverifiableRate`. The
  verifier now sees `[Student]` in the student's message; a spike there after
  deploy means a prompt is confusing the grader and needs a look.
- A child seeing the literal `[Student]` in a reply means a call site
  bypassed the chokepoint; the scan test should have caught it — check for a
  new SDK handle first.
- Rollback: `PII_STRIP_OUTBOUND=false` in Render. Full bypass, no deploy.
