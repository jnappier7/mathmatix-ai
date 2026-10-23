# CLAUDE.md — MATHMATIX.AI Engineering Guide

> Onboarding map for anyone (human or AI) working in this repo. Read this first.
> It's an **index + mental model**, not a spec — when in doubt, read the file it points to.
> The `docs/` folder holds deep design docs; this file tells you which one to open.

---

## 1. What this is

**MATHMATIX.AI** — an AI-powered, personalized K-12 math tutor. Tagline: *"See the Patterns,
Solve with Ease."* Mission: *"An Affordable Math Tutor for Every Child."*

Four roles, each with its own dashboard and permission set:

| Role | Primary page | What they do |
|------|-------------|--------------|
| **Student** | `chat.html` | 1:1 AI tutoring, practice, assessments, gamification |
| **Teacher** | `teacher-dashboard.html` | Rosters, live monitoring, IEPs, class AI settings, resources |
| **Parent** | `parent-dashboard.html` | Child progress, reports, teacher messaging |
| **Admin** | `admin-dashboard.html` | User mgmt, bulk email, school licenses, system health |

Live at https://www.mathmatix.ai (Render, Oregon). ~70 shipped features (see
`docs/SITE_OVERVIEW.md` for the full catalog).

---

## 2. Stack at a glance

| Layer | Tech |
|-------|------|
| Backend | Node.js ≥20.14 (pinned 20.11.1) / Express 4 |
| DB | MongoDB + Mongoose 8 (`connect-mongo` session store) |
| **LLM (runtime)** | **Dual-provider, split by role.** OpenAI for the tutor's generate stage (`TUTOR_MODEL`, **`gpt-4o-mini` as of 2026-08-18**), vision grading (`gpt-4o`), and embeddings; **Anthropic for the answer verifier** (`claude-haiku-4-5`) so the model checking the tutor's answer isn't the model that wrote it. Both keys are required in prod. See §7. |
| Voice STT | Deepgram (`nova-2`/`nova-3`), Whisper-1 fallback |
| Voice TTS | Cartesia (`sonic-3.5`), streaming over WebSocket |
| Math OCR | Mathpix (`/v3/text`, `/v3/pdf`) |
| Math render | KaTeX + MathLive (client); JSXGraph for interactive diagrams |
| Auth | Passport (local, Google, Microsoft, Clever SSO) |
| Billing | Stripe (subscriptions + school licenses) |
| Storage | AWS S3 (or R2/Spaces/MinIO via `S3_ENDPOINT`) |
| Email | Nodemailer (SendGrid/SES/Postmark) |
| Observability | Sentry + Winston + Better Stack (Logtail) |
| Frontend | **Vanilla JS + Vite** (multi-page, no SPA framework) |
| Hosting | Render (Docker); Puppeteer headless-shell + Python3/matplotlib in image |

> **`TUTOR_MODEL` is `gpt-4o-mini` (the default), and the Claude path is live anyway — via the
> verifier.** The tutor generates on OpenAI; `utils/pipeline/llmVerifier.js` grades on
> `claude-haiku-4-5`. So **`ANTHROPIC_API_KEY` is a production dependency even though `TUTOR_MODEL`
> names an OpenAI model** — an unfunded balance degrades grading rather than tutoring, which is quieter
> and easier to miss (see §7 diagnose). (This note has been wrong in *both* directions historically;
> check the Render env before trusting any statement about which model runs where.)
>
> `utils/pipeline/generate.js` reads `PRIMARY_CHAT_MODEL = process.env.TUTOR_MODEL || 'gpt-4o-mini'`,
> and `utils/openaiClient.js` dispatches to `utils/anthropicClient.js` whenever the model id starts with
> `claude`. That adapter is a full drop-in for `callLLM` / `callLLMStream` / `callLLMStructured` and
> normalizes Claude's request/response/stream shapes into the OpenAI ones the rest of the app consumes,
> so the pipeline stays provider-agnostic and the switch is a one-env-var flip in either direction. It
> also prepends a **child-safety system prompt** on every Claude call (Anthropic requires it for
> products serving minors) — provider-scoped, the OpenAI path is unchanged. Still dormant while
> `TUTOR_MODEL` is OpenAI: the Claude prompt-cache breakpoint in `promptCompact.js` (verifier prompts are
> far below `anthropicClient`'s 4096-token cache floor, so nothing caches on the Claude path today) and
> `TUTOR_FALLBACK_MODEL` (the *generate* stage has no Claude call to fail over from — the verifier's own
> fallback is separate, in `llmVerifier.verifierCall`).
>
> OpenAI regardless of `TUTOR_MODEL`: **vision grading** (deliberately — `llmGateway` calls the
> OpenAI SDK directly for it), **embeddings**, `llmGateway`'s `DEFAULT_MODELS` for any caller that
> doesn't pass a model explicitly, and every hard-coded `PRIMARY_CHAT_MODEL = 'gpt-4o-mini'` outside
> generate.js (`pipeline/verify.js`, `routes/chat.js`, `routes/courseChat.js`). The one hard-coded
> **Claude** constant is `llmVerifier`'s `VERIFIER_MODEL` — it does not read `TUTOR_MODEL` and is not
> affected by changing it.
>
> ⚠️ **`TUTOR_MODEL` cannot take an o-series id as-is.** `utils/openaiClient.js` maps to
> `max_completion_tokens` only when the id contains `gpt-4o`/`gpt-5`, and drops `temperature` only when
> it contains `nano`. So `o4-mini` (or any `o1`/`o3`/`o4` reasoning model) is sent `max_tokens` +
> `temperature` and 400s — and 4xx is **terminal by design** in `isTransientError`, so there is no
> fallback and every tutor turn fails. Widen the param logic before pointing `TUTOR_MODEL` at a
> reasoning model.

---

## 3. Boot sequence & request lifecycle

`server.js` → validates required env → `initSentry` → `configureMiddleware` →
`connectDatabase` → `registerRoutes` → `initSentryErrorHandler` → `listen` →
attach voice WebSockets (`routes/voiceTutor.js`, `routes/voice.js`).

Middleware order (`config/middleware.js`) is load-bearing — **don't reorder casually**:
trust-proxy → HTTPS/www redirect (prod) → CORS → **Stripe webhook raw-body** (before JSON parse) →
compression → static assets → request-id → body parse (1MB) → **session (MongoStore)** →
passport → impersonation swap → CSP nonce → helmet → rate limit → **CSRF (double-submit)** → request logging.

Required env to boot (`server.js` exits if missing): `MONGO_URI`, `SESSION_SECRET`,
`GOOGLE_*`, `MICROSOFT_*`, `MATHPIX_*`, `OPENAI_API_KEY`.

---

## 4. Directory map

```
server.js              Entry point (bootstrap + graceful shutdown + WS attach)
instrument.js          Sentry pre-require hook (loaded via `node --require`)
config/                database.js · middleware.js · routes.js · sentry.js
auth/                  passport-config.js (Google/Microsoft/Clever/local strategies)
middleware/  (12)      auth · csrf · impersonation · usageGate · consentGate ·
                       promptInjection · uploadSecurity · ferpaAccessLog · errorTracking · …
models/      (41)      Mongoose schemas — see §6
routes/      (85)      HTTP surface, grouped by domain — see §5
services/    (7)       chatService · sessionService · assessmentService · userService ·
                       aiService(legacy) · cleverApi · cleverSync
utils/       (240)     The brains: pipeline/, prompts, learning engines, voice, OCR — see §7
public/      (~1220)   Vanilla-JS + Vite frontend — see §8
scripts/     (118)     Seeding, data migration, problem/skill gen & QA, crons — see §10
seeds/                 Skill/problem/curriculum seed JSON (incl. pattern skills)
docs/        (51)      Design docs + data dumps (skills.json, problems.json)
tests/                 unit/ · integration/ (supertest) · load/ (k6)
Dockerfile render.yaml .puppeteerrc.cjs   Deploy
```

---

## 5. HTTP API surface (`routes/`, registered in `config/routes.js`)

85 files, ~270 endpoints. Guards: `isAuthenticated`, `isAdmin/isTeacher/isParent/isStudent`,
`aiEndpointLimiter`, `usageGate`, `premiumFeatureGate`. Roles checked via `user.roles[]` (array,
preferred) with fallback to legacy `user.role` (string).

| Domain | Key files |
|--------|-----------|
| **Chat/tutor core** ⭐ | `chat.js` (the main endpoint), `conversations.js`, `courseChat.js`, `trialChat.js`, `voiceTutor.js`, `voice.js` |
| Assessment | `screener.js` (IRT placement **and** growth checks — `{isGrowthCheck:true}` → `sessionType:'growth-check'`), `assessment.js`, `checkpoint.js`, `mastery.js` (badges), `review.js` |
| Student | `student.js`, `learningCurve.js`, `notifications.js`, `session.js`, `user.js` |
| Teacher | `teacher.js`, `teacherResources.js`, `iepTemplates.js`, `announcements.js`, `curriculum.js`, `course.js`, `courseSession.js` |
| Parent | `parent.js`, `analytics.js` |
| Admin | `admin.js`, `adminEmail.js`, `adminImport.js`, `schoolLicense.js`, `cleverSync.js`, `dataPrivacy.js`, `consent.js`, `onboarding.js` |
| Gamification | `dailyQuests.js`, `weeklyChallenges.js`, `challenges.js`, `leaderboard.js`, `nudges.js`, `rapportBuilding.js` |
| Billing | `billing.js` (Stripe), `affiliate.js`, `waitlist.js` |
| Specialized | `guidedLesson.js`, `gradeWork.js` (Show Your Work), `speak.js` (TTS), `avatar.js`, `practicePack.js`, `imageSearch.js`, `browserLock.js` |

`/api/billing/webhook` is **CSRF-exempt and raw-body** (Stripe signature). Trial/demo/waitlist
endpoints are unauthenticated but IP-rate-limited.

---

## 6. Data model (`models/`)

**`user.js` is the spine (~1,332 lines).** Embeds a lot — read it before touching anything user-facing:
- Identity/roles/OAuth ids; parent↔child↔teacher links; `subscriptionTier`, `schoolLicenseId`
- `skillMastery: Map<skillId, {...}>` — per-skill state machine with **4 pillars**
  (accuracy/independence/transfer/retention), SM-2/FSRS `reviewSchedule`, and `fluencyTracking`
- `learningProfile` — interests, learning style, math-anxiety, rapport answers, fluency baseline
- `badges` / `strategyBadges` / `habitBadges` / `metaBadges`; `courseEnrollments`; `consentRecords`

| Model | Role |
|-------|------|
| `conversation.js` | Chat history (decoupled from user); `messages[]`, board state, `phaseTracker`, `sessionScorecard`, `sessionMood`, alerts. Fields like `summary`/`strugglingWith` are field-level encrypted. |
| `tutorPlan.js` | **The tutor's persistent "mental model"** of a student — skill focuses, notes, current instructional mode. Updated every turn by the pipeline. |
| `skill.js` | Master catalog (K→Calc 3). Prereqs/enables graph, `irtDifficulty`, `fluencyMetadata`, `teachingGuidance`. |
| `problem.js` | Practice items. `answer.equivalents[]`, `answerType`, MC `options`/`correctOption`, `difficulty` 1-5. |
| `iepPlan.js` | IEP in its **own collection** for privacy/audit; user doc keeps a lightweight cache. |
| `screenerSession.js` | IRT CAT state (theta, SE, responses, frontier). |
| `course.js` / `courseSession.js` | Structured courses; lessons use **Gradual Release** (I-do / we-do / you-do) phases. |
| Others | `gradingResult`, `message` (teacher↔parent), `section` (Clever roster), `schoolLicense`, `enrollmentCode`, `webhookEvent` (Stripe idempotency), `impersonationLog`, `deleteAudit`, `supportTicket`, `notification`, `challenge`, `announcement`, `browserLockSession`, `studentUpload`, `transcriptFlag`, `curriculum`. |

---

## 7. The tutoring engine (`utils/`, esp. `utils/pipeline/`) ⭐ the heart

Every student turn runs through a multi-stage pipeline (`utils/pipeline/index.js`).
Conceptually: **observe → diagnose → decide → generate → verify → persist**, plus supporting
stages in the same dir (`xpEngine`, `sessionMood`, `boardLlm`, `boardSynthesizer`, `stepEvaluator`,
`evidenceAccumulator`, `sidecar`, `suggestions`, course adapters).

1. **observe** — classify the message (answer attempt / question / confusion / off-topic / …).
2. **diagnose** — verify the student's answer two ways in parallel: deterministic `utils/mathSolver.js`
   (~30% of topics, fast/exact) **and** an LLM verifier (`pipeline/llmVerifier.js`). The verifier is
   **tiered and cross-provider**: `claude-haiku-4-5` first, escalating to `gpt-4o` when it can't resolve
   (low confidence / parse fail) instead of silently giving up. The provider split is the point — the
   verifier checks the tutor's *own* answer, so tier 1 must not be the model that produced it
   (`TUTOR_MODEL`, currently `gpt-4o-mini`); one model grading itself is not a cross-check. Two things
   that crossing depends on, both of which fail *silently* (every verdict → `unverifiable`, grading
   quietly degrades to mathSolver's ~30% coverage, nothing throws): (a) these calls use bare
   `response_format: {type:'json_object'}`, which has no Claude analogue — `anthropicClient` translates
   it to a system-prompt instruction and `parseVerdict` tolerates a stray fence; (b) an unfunded
   Anthropic balance or bad key is a **terminal 4xx**, which `openaiClient` deliberately won't fail over,
   so `verifierCall` covers that gap (and only that gap — a 429 re-throws). Pinned by
   `tests/unit/verifierCrossProvider.test.js`. Outcomes (incl. the `unverifiableRate`) are tracked in
   `utils/verifyMetrics.js`, surfaced on `GET /api/admin/structured-tutor-metrics` — watch it after any
   provider change; a spike there is the symptom this whole seam produces.
   A **conceptual** question ("what distinguishes an asymptote from a hole?") answered in words has no
   value to compare, so it routes to `llmVerifyConceptual` instead — the math verifier can only report
   NO MATCH on prose, which is how correct ideas got rejected. Verdicts are asymmetric throughout: a
   rejection needs higher confidence than an affirmation, and anything undecided stays `unverifiable`,
   which never stamps a `problemResult`.
3. **decide** — pick an instructional action (scaffold, direct-instruction, worked-example,
   prerequisite-bridge, guided/independent practice, verify, redirect, …) using BKT state, lesson phase, mood.
4. **generate** — build the system prompt + history, call the LLM (streamed via SSE), emit board/visual commands.
5. **verify** — schema-check board commands, enforce visual-teaching & **anti-cheat** rules, simplify to reading level.
6. **persist** — save messages, update `skillMastery` (BKT + FSRS), award XP/badges, update `tutorPlan`, mood.

### LLM access — always go through the gateway
- **The outbound-PII chokepoint is `utils/openaiClient.js`** (`callLLM` / `callLLMStructured` /
  `callLLMStream` / `generateEmbedding`), **on by default** (`PII_STRIP_OUTBOUND=false` is the emergency
  bypass). It strips pattern PII (email/phone/SSN/ObjectId/address/IEP specifics) on every call, and the
  acting user's name via the **request scope** that `middleware/outboundPii.js` opens from `req.user`
  after impersonation (AsyncLocalStorage; voice sessions open their own in `voiceSession._startTurn`). It
  **rehydrates at the same layer** — completions, structured JSON and streamed chunks come back with the
  real name — so a call site never has to know. A call that talks about someone *other than* `req.user`
  (parent chat → the child; teacher summaries → the student) must pass its own `options.anonContext`.
  **No file outside `openaiClient.js`/`anthropicClient.js` may hold a provider SDK handle** —
  `tests/unit/outboundPiiScope.test.js` scans for it. `utils/llmGateway.js` is the convenience layer over
  it. What cannot be filtered: image pixels and voice audio. Audit record: `docs/OUTBOUND_PII_AUDIT.md`.
- **Prompts that describe many students** (the teacher lesson planner, `routes/teacher.js`
  `/lesson-planner`) use `createRosterAnonymizationContext` from `piiAnonymizer.js`: each student is
  `[Student N]` in the outbound prompt, IEP goals go out as counts + progress bands (accommodation
  *types* still go), the reply is rehydrated per label, and the read is logged once per student via
  `logRecordAccess(..., { getStudentIds })`. This is unconditional, not gated on `PII_STRIP_OUTBOUND`.
  Pinned by `tests/unit/lessonPlannerPii.test.js`.
- **`utils/openaiClient.js`** wraps the OpenAI SDK (retry/backoff, 90s timeout, structured outputs,
  `max_completion_tokens` vs `max_tokens` per model). 35 files import one of these two. It is also the
  **provider router**: a model id starting with `claude` is dispatched to `anthropicClient`, with a
  transient-error fallback back to `TUTOR_FALLBACK_MODEL` (default `gpt-4o-mini`).
- **`utils/anthropicClient.js`** is the Claude adapter — message translation (system messages hoisted
  to Claude's top-level `system`; consecutive same-role turns merged; **OpenAI `image_url` blocks
  converted to Claude `image` sources**), schema sanitizing for structured output, stop-reason
  mapping, and **full tool-call translation** (OpenAI `tools`/`tool_choice` → Claude tools;
  `tool_use` blocks → `message.tool_calls`; streaming `input_json_delta` → `delta.tool_calls`, so
  generate.js's accumulator works identically on both providers). The image conversion is
  load-bearing: without it every turn after a photo upload 400s and silently falls back to
  non-streaming.
- **Board tool mode** (`BOARD_TOOL_CALLS=true`, default off): the WorkBoard is driven by an
  `update_board` tool call (`utils/boardTools.js`) instead of inline `<BOARD/>` tags. Server-side
  translation only — tool calls map into `structuredBoardCommands`, which Stage 5b feeds through the
  same pedagogy guard/synthesizer/visual gate; the client contract is unchanged. Supersedes
  `STRUCTURED_TUTOR_RESPONSE` when both are set (tools and response_format can't combine). The flag
  also switches the Stage 5b.0 Board-LLM translator (`pipeline/boardLlm.js`) to a forced
  `update_board` call, so every text-path board surface shares one protocol. Voice board actions
  (`[WRITE:]`/`<math>` tags in `voiceSession.js`) are deliberately NOT migrated — different
  realtime protocol, coupled to TTS timing.

### Prompts (token-sensitive)
- `utils/prompt.js` delegates to **`utils/promptCompact.js`** (the live, ~3-4K-token builder). The
  giant legacy `prompt.js` body is kept for rollback — **use compact**.
- `coursePrompt.js` (course mode / Gradual Release), `masteryPrompt.js` (badge sessions),
  `promptPlanLayer.js` (injects `tutorPlan`). `tutorConfig.js` = the personas (Bob, Maya, Ms. Maria,
  Mr. Nappier + unlockables), each with personality, catchphrase, OpenAI + Cartesia voice ids.

### Learning engines
`knowledgeTracer.js` (Bayesian Knowledge Tracing, per-category params), `fsrsScheduler.js` (spaced
repetition), `masteryEngine.js` (4-pillar score + tiers), `irt.js`/`adaptiveScreener.js`/`catConfig.js`/
`skillSelector.js`/`catConvergence.js` (IRT CAT screener), `misconceptionDetector.js`,
`interleavingEngine.js`, `antiCheatSafeguards.js`/`antiGaming.js`/`worksheetGuard.js`.

### Voice (WebSocket, attached in `server.js`)
`sttStream.js` (Deepgram) → LLM → `ttsStream.js`/`ttsProvider.js` (Cartesia). `voiceSession.js`
orchestrates one socket; modes: `math-steps`, `board-actions`, `orchestrated`. Idle Deepgram sessions
close after 30s (cost) and lazily reopen.

### OCR
`utils/ocr.js` (image) + `utils/pdfOcr.js` (PDF, poll w/ backoff). Uploads flow into `routes/chat.js`
(multer → Sharp EXIF-strip → Mathpix → injected into prompt as context). Every Mathpix request carries
`metadata.improve_mathpix=false` (`MATHPIX_PRIVACY_METADATA`) so the upload is not retained, and each
PDF is `DELETE`d from Mathpix in a `finally` once the text is back — pinned by
`tests/unit/mathpixPrivacy.test.js` and disclosed on `public/subprocessors.html`. Both modules also
export path-based helpers (`performOCR`, `extractTextFromPDF`) for `routes/teacherResources.js` and
`utils/resourceDetector.js`.

---

## 8. Frontend (`public/`)

Multi-page, **vanilla JS + Vite** (no React/Vue). 55 HTML pages; Vite (`vite.config.js`) bundles JS/CSS
only — HTML is served as-is, so i18n/feature-flags/user-data are injected client-side.

- **`public/js/script.js`** is the chat engine (~2000 lines): `appendMessage()`, speech recognition,
  markdown+KaTeX rendering, visual `[VISUAL_TYPE:params]` blocks.
- ES modules in `public/js/modules/`: `gamification.js`, `billing.js`, `audio.js` (TTS queue),
  `iep.js`, `assessment.js`, `session.js`, `age-tier.js`, `whiteboard.js` (shelved).
- Heavy reliance on globals (`window.currentUser`, `window.TUTOR_CONFIG`, `window.MM_FEATURES`).
- CSS is **dual-system**: legacy sheets hardcode colors; newer ones use `--cr-*` design tokens
  (`design-system.css`, `chat-redesign.css`). 70 CSS files, no CSS-modules.
- **The Work Board is OFF by default (2026-10) — the math goes in the tutor's message.** One env var,
  `WORK_BOARD` (`on` restores it), is the whole switch: `utils/featureFlags.js` `isWorkBoardEnabled()`
  is read by the server for the prompt and emitted to the client as `MM_FEATURES.workBoard` via
  `/api/features.js`, so the two cannot disagree. Board off: the board and workspace-tab protocols
  leave the prompt (~2.5K tokens/turn) for a short "WHERE THE WORK GOES: IN YOUR MESSAGE" section;
  `STRUCTURED_TUTOR_RESPONSE` and `BOARD_TOOL_CALLS` stand down; the per-turn board block shrinks to
  "PROBLEM IN FOCUS"; `chat-workspace.js` skips the dock and derivation view but still mounts the
  Notebook and Source Dock (`isOn()` stays true — `script.js` falls back to the legacy board
  otherwise). The server **still runs the board pipeline silently**: the synthesizer pins the problem
  from chat text, so `conversation.boardProblem` (the verifier's grading anchor) and the
  `boardLedger` (teacher live view) keep working without a single model tag. Voice board actions
  (shelved in chat) render nowhere with it off. The board's own suites opt in with `WORK_BOARD=on`;
  board-off is pinned by `tests/unit/workBoardOff.test.js`. The notes below describe the board ON.
- **The tutor's work is INLINE IN THE CHAT COLUMN** (2026-09), not a right rail. Two surfaces, both
  inside `#chat-container`: the **work dock** (`#cr-work-dock`, between the transcript and the
  composer) holds the problem in focus and collapses to nothing when idle; a finished problem is
  **sealed** into the transcript as a card (`DerivationView.buildSealedCard` ← `chat-workspace.js`
  `onSeal`), so scrollback is the archive and there is no thumbnail rail. `html.mm-work-inline`
  (stamped synchronously in `chat.html` for `livingWorkspace` dev/beta/live) is what drops
  `.cr-workspace` from the stage grid; `livingWorkspace=off` restores the legacy tabbed rail intact.
  The Living Workspace spec's "always two columns" decision is superseded — see the amendment atop
  `docs/BOARD_LIVING_WORKSPACE_SPEC.md`. Pinned by `tests/unit/workspace/inlineWorkDock.test.js`.
- **Feature flags / shelved**: legacy tabbed board (`MM_FEATURES.livingWorkspace='off'`),
  voice-mode-in-chat, course catalog UI. (`MM_FEATURES.boardPanel` now only gates the legacy rail.)

---

## 9. Cross-cutting concerns

- **Security**: helmet/CSP+nonce, custom **double-submit CSRF** (`middleware/csrf.js`, constant-time),
  rate limiters (`authLimiter` 5/15m, `signupLimiter`, `apiLimiter` 300/15m, `aiEndpointLimiter`,
  trial 30/hr), prompt-injection middleware, upload validation + 30-day auto-delete, optional
  AES-256-GCM field encryption (`FIELD_ENCRYPTION_KEY`).
- **Compliance (FERPA/COPPA)**: `consentGate`/`consent.js`/`consentManager.js`, `ferpaAccessLog`,
  `dataPrivacy.js` (export/delete/amend), `dataRetention.js`, the outbound-PII chokepoint in `openaiClient` (on by default),
  `impersonation.js` (read-only, 20-min timeout, fully audited).
- **Billing/gating**: `routes/billing.js` + `middleware/usageGate.js`. Free = 30 AI-min per rolling 30 days (students — the `weekly*` field names are back-compat, the quota is monthly);
  teachers/parents/admins/licensed students unlimited. Voice/upload/AI-grading are premium-gated.
- **Observability**: `/api/health` (DB + keys + memory), Sentry (5xx only, 10% trace sample in prod),
  Winston with secret redaction → Logtail + rotating files.

---

## 10. Dev & ops workflow

```bash
npm run dev            # nodemon + instrument.js
npm start              # node --require ./instrument.js server.js
npm run build          # Vite → ../dist
npm test               # jest --coverage  (unit + integration)
npm run test:unit | test:integration
npm run lint           # eslint
npm run loadtest:chat  # k6 (also :screener :auth :stress :chat:peak)
npm run seed:playground / seed:test / seed:skills   # seed accounts / test data
npm run seed:all       # ⭐ every skill catalog + item bank, in dependency order
npm run seed:all:dry   # preflight + plan, no writes
```

- **Seeding skills and items → `npm run seed:all`** (`scripts/seedAll.js`). It runs the nine
  seeders in the one order that works and then the `answer.equivalents` backfill, verifies row
  counts against the payloads, and exits non-zero if the DB came up short. Idempotent — every step
  is a source-scoped upsert, so re-running is safe. `--fresh` makes each bank clear **its own**
  prior rows first; `--only=`/`--skip=` narrow the run; `--list` names the steps.
  Two orderings are load-bearing, not stylistic: **skills before items** (`seedBankTopupItems`
  aborts on a `skillId` that isn't in the Skill collection) and **the backfill last** (each Fable
  bank re-upserts `answer.value` from JSON, dropping the typography equivalents — backfill before
  them and students get marked wrong for correct answers again). Both are pinned by
  `tests/unit/seedAllPlan.test.js`.
  **`scripts/seed-skills.js` is NOT in the plan and must never be** — it runs `Skill.deleteMany({})`,
  wiping the whole catalog down to ~40 Ready-for-Algebra skills. Empty-DB bootstrap only.
  The pathway crosswalk (`seeds/unified-taxonomy/pathway-crosswalk*.json`) needs no seeding —
  `utils/skillCanonicalizer.js` reads it from disk at runtime, so it ships with the code.

- **CI** (`.github/workflows/ci.yml`): test + lint + build on PRs to `main`. Coverage thresholds are
  low (~25%) — raise for new critical code (auth, IRT, mastery, billing).
- **Deploy**: Render builds the `Dockerfile` (Node-slim + Puppeteer headless-shell + Python3/matplotlib;
  build-time Puppeteer smoke test). `render.yaml` is **reference/doc only** — the live service and the
  two cron jobs (`weeklyDigest`, `archiveOldConversations`) are configured manually in the Render dashboard.
- **Local setup**: see `docs/LOCAL_SETUP.md`. Needs Mongo + the boot env vars; use Stripe CLI for webhooks.
- **scripts/** (85): seeding, problem/skill **generation + QA** (huge `generate*.js`), distractor fixes,
  dedup/cleanup, migrations, IRT calibration, crons. Many are wired as `npm run …` aliases — check
  `package.json` scripts before writing a new one-off.

---

## 11. "I need to change X → start here"

| Task | Start in |
|------|----------|
| Tutor reply behavior / teaching logic | `utils/pipeline/{decide,generate,verify}.js`, then `promptCompact.js` |
| Add/adjust a tutor persona | `utils/tutorConfig.js` (+ voice ids) |
| Answer grading / correctness | `utils/mathSolver.js` (deterministic) + `pipeline/diagnose.js` / `llmVerifier.js` |
| Placement screener / IRT | `routes/screener.js`, `utils/{adaptiveScreener,irt,catConfig,skillSelector}.js`; docs: `PLACEMENT_TEST_SYSTEM.md`, `SCREENER_STATE_ANALYSIS.md` |
| Growth check (quarterly progress check) | Same stack — it's the screener with `sessionType:'growth-check'`. Entry: `/screener.html?mode=growth-check` or the in-chat FloatingScreener; bookkeeping + debrief in `routes/screener.js` `/complete`; `utils/growthSummary.js` (closure moment), `utils/growthGuard.js` (one bad check can't cost a level) |
| Mastery / badges | `routes/mastery.js`, `utils/{masteryEngine,badgeAwarder,patternBadges}.js`; docs: `MASTER_MODE_BADGE_SYSTEM.md`, `PATTERN_BADGE_GUIDE.md` |
| Skills/problems data | `models/{skill,problem}.js`, `seeds/`, `scripts/generate*.js` + QA scripts |
| IEP / accommodations | `models/iepPlan.js`, `routes/iepTemplates.js`, `utils/iepTemplates.js`; docs: `IEP_*` |
| Voice | `routes/voiceTutor.js`, `utils/{voiceSession,sttStream,ttsStream}.js` |
| Whiteboard / board commands | `utils/{boardCommandGuard,boardResponseSchema}.js`, `pipeline/board*.js`; docs: `WHITEBOARD_*`, `BOARD_LLM_STAGE_DESIGN.md` |
| Where the tutor's work RENDERS (dock / sealed cards) | `public/js/living-workspace/chat-workspace.js` (mount + seal + hydrate) and `dom/derivationView.js` (the card itself); CSS in `public/css/living-workspace.css` (`.cr-work-dock`, `.lws-sealed`) + the `html.mm-work-inline` block in `chat-redesign.css`. Placement only — the generation funnel and anti-cheat gauntlet upstream are untouched |
| Auth / roles / SSO | `auth/passport-config.js`, `middleware/auth.js`, `services/cleverSync.js` |
| Billing / plans | `routes/billing.js`, `middleware/usageGate.js` |
| Teacher/parent/admin dashboards | `routes/{teacher,parent,admin}.js` + matching `public/*-dashboard.html`/`.js`. The teacher dashboard's tab bar and **Today** are built by `public/js/teacher-home.js` (`PRIMARY` = the tabs in the bar, the rest fold under More; **Classes** is primary — owner wants classes and join codes one glance away). Today opens with a **My classes** strip (`renderClasses`): every active class, its join code and `/join/CODE` link copyable, Host a game (`/live-drill?class=<id>`, preselected in `host.js`), Assign, Manage; drawn from `TeacherDashboard.classes()` on `mm:classes-loaded`. Bundled — `npm run build:bundles` after editing. Pinned by `tests/unit/teacherClassesStrip.test.js` |
| Course site branding (`/courses`) | `public/courses/assets/brand.css` (hand-owned) + `scripts/applyCourseBrand.js` (`npm run courses:brand`). Everything else under `public/courses/` is generator output — see §12 |
| Chat UI / rendering | `public/js/script.js`, `public/js/inlineChatVisuals.js`, `public/css/chat*.css` |
| "Check my work" grading accuracy | `tests/eval/checkWork/` — hand-labeled corpus + real-sheet drop-in (`sheets/README.md`, consent/anonymization rules); hermetic tier in `npm run test:eval`, live tier `npm run test:eval:checkwork`. Headline metric is the false-accusation rate (correct work called wrong), which gates |
| Tutor teaching-quality regression / evals | `tests/eval/` — replayed-bug scenarios + behavioral personas through real observe→diagnose→decide; heuristic + LLM judges; live tier via `RUN_LLM_EVAL=1 npm run test:eval:live`. The judges themselves live in `utils/replyJudges.js` / `utils/replyLlmJudges.js` (shared with prod; tests/eval keeps shims) |
| Transcript mining (nightly prod tutor-quality sweep) | `utils/transcriptMiner.js`, `scripts/mineTranscripts.js` (`npm run cron:mine-transcripts`), `GET /api/admin/tutor-quality-report`; doc: `TRANSCRIPT_MINING.md`. Findings are candidates for human review, never auto-actioned |
| ACT visual items (graphs, charts, tables) / visuals per form | `scripts/generateActVisualItems.js` → `seeds/act-visual/` (figures from `utils/actCharts.js`; label-only figures for the enhanced bank from `utils/actFigures.js` + `scripts/addActEnhancedFigures.js`). Pacing to 8–12 per form is `blueprint.visualTarget` in `utils/actTestAssembler.js`. Every item is re-solved from its own alt text in `tests/unit/actVisualItems.test.js` — regenerate, never hand-edit the seed file |
| Growth / pricing / go-to-market | `docs/GROWTH_STRATEGY.md` — the $1M-ARR plan, market-grounded. Its two shipped pieces: `utils/impactReport.js` (`GET /api/admin/impact-report`, cohort efficacy evidence for a school) and `utils/schoolSignal.js` (`GET /api/admin/school-signals`, teacher density per inferred school = the sales pipeline). Both deliberately report their own limits in a `caveats` array — they are sales artifacts, so every bug in them points toward a flattering number |
| Student usage & conversion numbers | `GET /api/admin/reports/student-conversion` → `utils/studentUsageReport.js`. Reads the `ConversionEvent` log (`models/conversionEvent.js`) joined to User. A card trial is never "paid" — paid = `subscribed` with `startedInTrial:false`, or `trial_converted`, or a current paid tier; school/founding/demo accounts are out of the cohort; parent-paid is reported beside the rate, not in it. Supersedes `/api/admin/funnel` for students (that one counts card trials as paid). Caveats ship in the payload |
| Consumer plans / prices | `routes/billing.js` `PACKS` — monthly `unlimited` ($9.95) and annual `unlimited_annual` ($99, 2 months free). The interval comes from the plan, never a literal; trials are monthly-only by design. UI is the toggle in `public/pricing.html` (not bundled — edit directly), which drives the CTA's `data-pack` |
| **My Class** (the student's classroom, on `chat.html`) | There is no classroom PAGE; the class is a panel — ☰ → **My Class** (and the sidebar Tools list), `public/js/my-class.js` + `css/my-class.css`, standalone deferred scripts like `join-class.js` (no bundle rebuild). Per class: teacher/period, **Live now** (a Join button from `GET /api/live-drill/mine`), **Assignments** (activities + practice tests from `GET /api/activities/mine`, matched to the class by `className`) and **Practice** (the course's solo drills). The class list itself is `GET /api/student/my-classes` (`routes/student.js`): active enrollments only, teacher name, and the drill hub from `liveDrill/solo.hubFor(mathCourse, className)` ("geom" → geometry, else "alg" → algebra, else `/drill`). A student in no class gets the Join-a-class dialog. Announcements are NOT shown — the student inbox (`student-announcements.js`) is deliberately switched off until it's production-ready. Pinned by `tests/integration/myClasses.test.js` (real Mongo, CI) and the `hubFor` cases in `tests/unit/liveDrillSolo.test.js` |
| Class Activities (teacher-assigned interactive pages, per-student results) | `activities/` (the pages + `manifest.json`, published only by PR — no upload path), `routes/activities.js`, `models/activity{Assignment,Attempt}.js`, host page `public/activities.html`, teacher **Activities** tab (`public/js/teacher-activities.js`). The frame is served into a CSP `sandbox allow-scripts` + `connect-src 'none'` and reports by postMessage; manifest `items[].key`/`levels[].n` are the results contract. Doc: `CLASS_ACTIVITIES.md` |
| Live Two-Minute Drill (whole-class game with a join code; `/play`, host at `/live-drill`) | `utils/liveDrill/engine.js` runs the item bank straight out of the PUBLISHED drill pages (`public/courses/*/two-minute-drill.html`, everything above `// ===== app =====`) in a vm with a seeded `Math.random`, so play n is a pure function of (game seed, n) and a Course Planner publish is live in class games with no edit here — `tests/unit/liveDrillEngine.test.js` is the tripwire if a publish moves the bank. `utils/liveDrill/games.js` is the game: two modes (Team Drive = shared clock, own pace; Huddle = one play on the projector, everyone answers, reveal), Red vs. Blue, server deals/clocks/grades every play and never sends an open play's answer. **State is in memory with a Mongo shadow** (`utils/liveDrill/store.js` → `models/liveDrillGame.js`): every change is snapshotted within a second (`games.snapshot`, Maps folded, deck left out — it re-deals from the seed), a code this process doesn't hold is revived from the shadow on the first request (`store.load` before every lookup in `routes/liveDrill.js`; `hydrate` re-arms the clock from the absolute times), and SIGTERM hands off (`store.handoff`: flush, `freezeAll`, then 503 `{retry:true}` on every game call, which `play.js`/`host.js` `api` retry quietly for ~8 s). This is what keeps a deploy from ending a class game — two died mid-play on 2026-10-22 before it existed. Still single-instance for play (the live state is the process's; the shadow is for succession), so scaling out needs the game itself on a shared store. `routes/liveDrill.js`: host is teacher-only; the player router is PUBLIC (bearer token, CSRF-exempt, off the global apiLimiter because a class shares one IP) and must stay mounted above the `/api` isAuthenticated catch-alls — pinned by `tests/integration/liveDrillRoute.test.js`. Pages `public/live-drill-host.html` / `public/play.html` + `public/js/live-drill/*` (not bundled). **Class games**: a host may tie a game to one of their classes (`EnrollmentCode`); enrolled students see a Join banner on `chat.html` (`public/js/live-drill/chat-banner.js`, standalone — not in the chat bundles) polling `GET /api/live-drill/mine`, and join with their ACCOUNT name via `POST /api/live-drill/mine/join` (session + CSRF; a second device reseats the same player). `play.js` calls those with plain `fetch` + `addCsrfToken`, never `csrfFetch`, whose 401 handler would send a guest to the login page. Huddle rounds wait only for players with an open stream (`expectedAnswerers`); "Run it back" (`rematch`) keeps the code, seats and teams. The host's final screen adds a **play-by-play** (`games.playStats` → `hostView.final.plays`; each row is the engine's one-line `summary`, which drops figures/tables). It also lists **every player** (`hostView.final.players`: score, right/attempted, accuracy, best streak, average answer time from `player.msTotal`, signed-in ✓; students who never answered sort last, never above someone who played and went backwards) with a CSV — `host.js` `renderFinalPlayers`; King of the Hill shows its standings instead. **Sound** is projector-only, synthesized with Web Audio (`public/js/live-drill/sound.js`: whistle at kickoff, a tick on each of a clock's last five seconds, chime on a Huddle reveal, horn on a touchdown, buzzer at the final) — phones stay silent on purpose. Three switches, each remembered per device: **Sound** (master; `M`), **Music** (an original drumline + bass loop, OFF by default) and **Crowd** (murmur that builds as a ball nears the goal, cheers on a touchdown, cheer/groan on a Huddle reveal). The page only says where the game is (`setScene`: setup/lobby/live/reveal/final) and `setHype`; sound.js owns the mix. Pinned by `tests/unit/liveDrillSound.test.js` (fake Web Audio graph). **The lobby's "How scoring works"** (both screens, `LiveDrill.rulesHTML`) renders `state.rules` from `games.rulesFor` — never hardcode a number there; the "lobby states the rules the server plays" tests answer at each stated edge. **Math Facts** (fluency mode) is the third drill and the one NOT read from a course page: `utils/liveDrill/facts.js` owns the bank (`DRILLS.facts.native`; +, −, ×, ÷, Mixed, Integers, Squares & roots), plays carry `input: 'number'` and no choices — answers are TYPED on a number pad (`play.js` `openPad`) and graded by `facts.normalizeTyped` (junk is a 400, never a sack). A teacher's **focus** (`game.focus`, e.g. `[2, 5, 10]`) puts one of those numbers in every +/−/×/÷ fact. Its own scoring (`SCORING.facts`: +6/+4/+2 at 3 s/6 s, sack −2) and Huddle clocks (`FACT_SETTINGS`) come from the drill, never a literal. Every answer is tracked per student per fact (`player.facts`, `factLog`): the host's final screen gets a **Fact tracker** (fluent = always right in ≤ `FLUENT_MS`; missed; slow), a class grid per fact family (56 ÷ 7 lands in the 7 × 8 cell) and a client-side CSV; the phone gets "Your facts". The game itself is in memory, but each **signed-in** student's answers are SAVED when a Math Facts game ends: `games.onGameOver` → `utils/liveDrill/fluency.js` `saveGame` → `models/factFluency.js` (one doc per student, `facts` keyed by exact fact id with its family cell; one dotted `$inc`/`$push`+`$slice` upsert per student, so games ending together can't clobber each other). Status is computed on read, never stored: missed (any of last 3 wrong) / fluent (2+ right, typical ≤ 3 s) / slow / new ("right once"). Guests who joined with only a code are not saved — the host's final screen marks saved students ✓ and says so. Teachers read it at **`/fact-fluency`** (teacher-only page; `GET /api/live-drill/host/fluency/classes/:classId[/students/:id]`, own classes only, FERPA-logged as `skill_mastery`); a student's phone shows their lifetime line via `/api/live-drill/mine/fluency` (self-access logged). It is an education record: in the FERPA export and the delete sweep (`routes/dataPrivacy.js`). Pinned by `tests/unit/liveDrillFacts.test.js`, `tests/unit/liveDrillFluency.test.js` and (real Mongo, CI) `tests/integration/factFluencyRoute.test.js`. **King of the Hill** (`mode: 'hill'`, any drill) is the third game type: solo climbers, own pace on one clock (it shares Team Drive's `currentPlay`/`answer` path via `ownPace`), no teams or ball. Its rules live in `utils/liveDrill/hill.js`: right answers climb by the drill's speed tiers, wrong ones slip, summit 100; every 3rd in a row rolls a boulder onto the climber DIRECTLY ABOVE (strictly higher — a tie, e.g. two students at the base, is not "above") — never a chosen target, never downhill (owner's call: a struggling student can't be ganged up on); a just-knocked climber is steady for 4 s (the boulder skips to the next one up). Balance lives in `hill.TUNE`, set by playtest + a 200-game simulator (a flat −15 knock and a shield on every king 3-streak let the fastest student hold the crown ~104 of 120 s): the crown is heavy (the king climbs at half speed), a boulder takes 10 + 15% of the target's height, and a king's shield takes 9 in a row. Phones: the typed-answer pad must fit with the browser's bars showing (iPhone SE ≈ 375×548) — Go lives in the 4×3 key grid, Integers get a ± beside the answer, and `#live.typing` compacts everything above it; a student who scrolls per fact isn't drilling facts. Crown = highest climber (tie: first there); final = standings + longest reign + most boulders. Projector draws the hill (`host.js` `renderHill`, keyed SVG so climbers glide); phones get rank / who's just above / boulder meter / "knocked you down". Pinned by `tests/unit/liveDrillHill.test.js`. **Test Prep drills** (`DRILLS.alg1m3`, `DRILLS.hgeo3`): native banks in `utils/liveDrill/prep/` built from the teacher's unit practice tests — one template per question type, fresh numbers every play, wrong choices = the common mistakes, generated SVG figures (graphs; the box from 3-D coordinates; the transversal whose angle classes come from position). Shared helpers in `prep/kit.js` (`makeBank`, multiple choice or a typed integer; a play that can be negative sets `neg`, which is what gives the phone pad its ± — never key it on a playbook name). Prep plays are whole test questions, so they score on `SCORING.prep` (20 s / 40 s tiers) with `PREP_SETTINGS` clocks. Per-drill flags, not "is it native": `typed` (rules say "type"), `trackFacts` (fact tracker AND the FactFluency save — prep banks are native but must never write fact records), `focus` (number picker). Every computed key is re-solved from the question's own text in `tests/unit/liveDrillPrep.test.js` — a new template needs a re-solve there. For the next unit test, add a bank beside these two and a `DRILLS` entry (and put it on a hub, below). **Chapter Reviews** (`DRILLS.alg1m7`, `DRILLS.hgeo4`, …): one quick-fire bank per chapter in `utils/liveDrill/review/`, built from the teacher's guided notes, study sheet and chapter review PDFs under `public/courses/*/pdfs/` (same `prep/kit.js` contract, standard scoring — every play is ONE move: apply a rule, name the rule, count the lines of symmetry, say what substituting gives; the two "solve it" templates keep small numbers). Playbooks are the chapter's sections plus Whole Chapter. The owner wants one for EVERY chapter, filled in teaching order (Alg 7→13, Geo 1 and 4→11); each new one is a file beside these, a `DRILLS` entry, a hub entry, and a re-solve block in `tests/unit/liveDrillReview.test.js` (the transformation rules there are typed from the study sheet, never from the bank). **Solo practice** (`/drill/<hub>`, `public/drill.html` + `public/js/live-drill/solo.js`): a course's games on one page, played alone — no host, no account, nothing saved but a personal best in the browser. `utils/liveDrill/solo.js` `HUBS` says which drills each course page offers (algebra: the course drill, Module 3 prep, Math Facts; geometry: proof reasons, Ch. 3 prep). `GET /api/live-drill/solo/plays` deals WHOLE plays, answer included, in batches of 40 — deliberately, since nothing is graded or stored server-side (the course site's own drill page is all client-side too); each batch re-deals from play 1 so page two continues page one. Public and GET-only, so it is mounted above the `/api` catch-alls and off the global apiLimiter like `/play`. Math Facts takes the same **focus** as a class game (`&focus=2,5,10` → `facts.normalizeFocus`, only on `FOCUSABLE` playbooks; the picker is the host's presets + number grid). A long `posed()` label (> 48 chars, e.g. a word problem's story) renders in sentence case (`.posed-ask.story`), never a paragraph of small caps. The page grades typed answers with a copy of `facts.normalizeTyped`, pinned to the original by `tests/unit/liveDrillSolo.test.js`. `/courses/` is generated, so the course site links here only through the Course Planner |
| Public ACT practice test (no sign-up; `/act-practice-test`) | `public/act-practice-test.html` + guest mode in `public/js/act-test.js`; `routes/actTest.js` `guestRouter` (mounted PUBLIC at `/api/act-practice`, bearer-token owned, only a hash stored, 14-day TTL) and `/claim` (attaches a finished guest test to the signed-in student on their next `chat.html` load). The hook is server-side: `buildGuestReport` sends score + categories + a miss COUNT, never which questions — don't add per-item data to it. A fresh ACT-prep enrollment seeds the boot camp review from an existing test via `utils/actBootcampSeed.js`. Funnel events `act_guest_started/completed/claimed`. Pinned by `tests/integration/actGuestPractice.test.js`. Item content: the form builder skips items `utils/distractorQuality` flags (equal-valued choices, duplicates, odd-type key); `npm run act:audit` lists those plus out-of-order numeric choices, and `tests/unit/actItemAudit.test.js` lets each bank's blocking count only go down. Numeric choices are kept in ascending order (`scripts/sortActNumericChoices.js` edits the seed files, source `seeds/fable-act/*.json` included; `tests/unit/actChoiceOrder.test.js` keeps them sorted). A test freezes its choices, so grading and the review queue carry a pick to the bank by choice TEXT (`relabelByText` in `utils/mcOptions.js`) — never compare a frozen letter to the bank's letter directly. Item difficulty is MEASURED from completed tests by `npm run calibrate:items` (dry run; `cron:calibrate-items` applies): three tiers in `utils/itemCalibration.js` `calibratePooled` — each bank's authored level, then each template, then each item — all equated to the Fable bank's authored scale, so an unanswered item takes its band's measured value. The ACT seeders write through `utils/seedProblemUpsert.js`, which keeps a measured difficulty measured across `seed:all` |
| Timed practice tests (ACT, SAT) | One runner: `routes/actTest.js`, mounted at `/api/act-test` and again at `/api/sat-test` behind `useTest('sat-math')`. Everything exam-specific (blueprint, 200–800 vs 1–36 scale, skill names, prep course) is a definition in `utils/practiceTests.js`; sessions are scoped by `testId`. A blueprint whose skills are unified-taxonomy ids MUST set `sources`, or forms draw tutoring-bank items (`actTestAssembler.bankFilter`). Pinned by `tests/integration/satPracticeTest.test.js`. Client: ONE runner, `public/js/act-test.js`, with an `EXAMS` config (`window.openSatTest()`, `?sattest=1`); SAT mode adds the grid-in box (`sanitizeGridIn` must never accept a form the grader rejects — `tests/unit/satGridIn.test.js` checks every bank key through the real `checkAnswer`) and the reference sheet. Each question's change counter (`seq`) must survive a revisit and a reload, or a changed answer is refused as stale and the old pick is graded. Public SAT test: `/sat` → `public/sat-practice-test.html` (`window.MM_SAT_GUEST`), guest rail `/api/sat-practice` (the same `guestRouter` behind `useTest('sat-math')`); guest sessions, cookies (path = mount) and `/claim` are scoped by testId, browser records are per exam (`EXAMS[*].guestKey`), and `act-handoff.js` reads `?from=act|sat`. Pinned by `tests/integration/satGuestPractice.test.js`. The SAT's calculator is **Desmos** (`EXAMS.sat.calculator`), loaded lazily via `/vendor/desmos-calculator.js` → `utils/desmos.js`, which attaches `DESMOS_API_KEY` (env only, never committed; unset = 404 = fallback to the scientific mmCalculator, visible as `desmos: off` on `/api/health`). The ACT keeps mmCalculator. Pinned by `tests/unit/desmosCalculator.test.js`. **The SAT is adaptive**: its blueprint declares `modules` (2 × 22 items, 35 min), `routing.harderIfTheta` and `irtScale`. `/start` serves Module 1 only; `POST /next-module` grades it privately, routes on its MAP ability (`utils/testModules.js` — its own uncapped `mapAbility`, never `irt.estimateAbilityMAP`, whose ±0.8 per-step cap pins every score near 510), assembles the harder/easier Module 2, and resets `startedAt`/`timeLimitMinutes` so every clock rule applies per module. A closed module's positions 409 on `/problem` and `/save-answer` and are ignored in answer sheets. Scores are IRT over all 44 (route priced in); reports use the SECTION clock (`sectionStart`/`sectionMinutes`). Everything is gated on `blueprint.modules` — the ACT never reaches it. Pinned by `tests/integration/satAdaptiveModules.test.js`. **SAT prep course** (`sat-prep`, `public/resources/sat-prep-pathway.json` + `public/modules/sat-prep/`) runs the ACT's bootcamp loop: the loop machinery is shared and keyed by the course's exam (`practiceTests.getTestDefByCourse` / `isPrepCourse`), never by a literal `'act-prep'`. Every ActTestSession lookup in seeding and baselines is `testScope`d (an SAT never seeds ACT prep or satisfies its baseline). Review items carry `testId` + `qLabel` ("Module 2, question 3" — SAT positions 23–44 mean nothing to the student); letters alias F–J only when the exam's `letterAlias`; the retest tag is still `<LAUNCH_PRACTICE_ACT>` and responses add `launchPracticeTest: 'act'|'sat'`. Client: `PREP_EXAMS` in `lessonTracker.js` (chat-js3 bundle — rebuild). Pinned by `tests/integration/satPrepCourse.test.js` |
| "What brings you to Mathmatix?" (onboarding intent) | `utils/onboardingIntent.js` — the ONE classifier (server-side; `routes/onboarding.js` ignores any category the client sends) and the prompt line. `buildIntentContext` is what `promptCompact` calls: observed behaviour first, stated intent second, silence once the stated intent goes stale (5 sessions / 30 days). Health on `GET /api/admin/structured-tutor-metrics` → `onboardingIntent` (`utils/intentMetrics.js`) |

---

## 12. Gotchas & sharp edges

- **`role` vs `roles`** — `role` is the **active** role (which dashboard the user is currently in;
  multi-role users flip it via `/api/role-switch`), `roles[]` is every role they **hold**. Authorization
  reads `roles[]` via `hasRole()` in `middleware/auth.js` — but that is only the gate. **Every DB query
  and every role assertion on some *other* user must also match on roles held**, via
  `utils/roleQuery.js` (`anyRole()` / `withRole()` / `withoutRoles()` / `userHasRole()` / `rolesOf()`).
  A bare `{ role: 'parent' }` filter matches only whoever is *viewing* the parent dashboard right now,
  so a multi-role account (admin who is also a parent) silently vanishes from parent directories and
  every link lookup returns null — no error, just "not found". This ate ~65 sites before it was fixed;
  `withoutRoles()` also closed an impersonation escalation where `role: { $ne: 'admin' }` offered up an
  admin-holding account the moment it switched views. Keep `role` **only** for acting-user dashboard
  routing (`onboarding.js`, `login.js`, `roleSwitch.js`) and audit-trail role labels. Pinned by
  `tests/unit/roleQuery.test.js` and `tests/integration/multiRoleVisibility.test.js`.
- **Use `promptCompact`, not the legacy `prompt.js` body** — the latter is rollback-only and huge.
- **The tutor's language is ALWAYS stated in the prompt — English included.** `preferredLanguage`
  (a NAME from the User enum, `'English'`…, never a code) reaches both builders (`promptCompact`
  `--- LANGUAGE ---`, `coursePrompt` `Language:`). It used to say nothing when English, so after a
  Spanish demo was switched back the model kept following the Spanish history and the switch never
  took. The English line says so explicitly ("even if earlier messages were in another language").
  Pinned by `tests/unit/tutorLanguageSetting.test.js`. The parent guide has its own
  `parentLanguage` (`parentCourseLanguage.test.js`) — never the child's setting.
- **A typed turn is a COURSE turn only when it lands in the course's own conversation.**
  `user.activeCourseSessionId` is durable intent (it survives logout) and the greeting deliberately
  lands a new login in general chat — entering the course is a click. `routes/chat.js` used to flip
  every turn into course mode off the id alone, so the general-chat opener was followed by a second
  hello that ignored "hey whats up?" and launched module 1 (the course lead guard reads a greeting
  as "start the lesson"). One test now decides, shared with the client's course progress bar:
  `utils/courseConversation.js` `isCourseConversation(courseSession, conversation)`. It gates the
  baseline gate and the course context (hence the course prompt and `isCourseMode`); a general-chat
  turn by an enrolled student gets `conversationContext.enrolledCourse` (promptCompact names the
  course, says not to start it there). Pinned by `tests/unit/courseTurnLanding.test.js`.
- **Never hold a provider SDK handle outside `utils/openaiClient.js`** — every call goes through
  `callLLM*`/`generateEmbedding`, the outbound-PII chokepoint (strip + rehydrate, on by default).
  `tests/unit/outboundPiiScope.test.js` fails the build on a direct `chat.completions.create` anywhere else.
- **`config/middleware.js` order matters** — Stripe raw-body must precede `express.json`; CSP nonce
  must precede helmet; CSRF after session.
- **Per-user chat lock** in `routes/chat.js` serializes a user's concurrent messages — don't remove it.
- **Math-answer injection gate**: the verified answer is injected into context **only** on an
  `ANSWER_ATTEMPT`, never when the student is *asking* — preserve this or you'll leak answers.
- **The giveaway guard checks VALUE, not just form.** A student-posed problem never gets a
  `correctAnswer`, so `verify.js` 2a-bis used to judge replies by wording alone — "x is seven",
  "plug in x = 7: 5(7)+10 = 45 ✓" and base64 all shipped. `pipeline/valueLeak.js` solves the
  student's own equation (current + last 3 turns) with `mathSolver` and looks for that value bound
  to the variable, an "answer is", a substitution, or a coefficient. It is deliberately narrow
  (single-variable equations; a bare number is never enough) because a false alarm rewrites good
  tutoring. The gate is the labelled corpus `tests/eval/valueLeak/corpus.json` — add every
  production false alarm or miss there. In I-DO the rewrite is *asked* for a worked parallel
  example, so only the value check applies to it, never the form check.
- **`learningProfile.rapportAnswers` has ONE vocabulary: `utils/rapportNotes.js`.** The schema's
  fields (`currentTopic`, `learningGoal`, `interests`, `favoriteSubject`, `conversationStyle`) — the
  rapport route used to write `mood`/`currentFocus`, strict mode dropped them, and `promptCompact`
  read names that never existed, so no intro answer ever reached a prompt. The values are
  model-extracted from free student text and land in every future system prompt, so every writer
  and reader goes through `sanitizeRapportAnswers`/`buildRapportNotes` (length cap, no
  instruction-like text, framed as information). Pinned by `tests/unit/rapportNotes.test.js`.
- **"Check my work" on an uploaded sheet checks the WHOLE sheet — checking work is not giving answers.**
  `pipeline/checkWorkVerifier.js` returns a per-problem `problems[]` (blanks included, never solved);
  `routes/chat.js` turns it into a per-problem breakdown (`buildSheetCheckSuffix`) and passes it to the
  pipeline as `ctx.checkWork`. That is what lets `verify.js` skip the upload answer-key filter for a
  worked sheet — that filter rewrites any reply walking 2+ numbered problems into "pick one problem",
  which is how a finished sheet used to come back as feedback on one problem. What stays enforced: a
  wrong problem's corrected value is never handed over (`findRevealedCorrections` → in-voice rewrite →
  deterministic fallback), and a mostly-blank sheet (answer-key fishing) keeps the strict filter. Four
  layers each narrowed it to one problem (verifier, suffix, decide directive, upload guard); don't
  reintroduce "one problem at a time" in any of them. Pinned by `tests/unit/checkWorkSheetCoverage.test.js`.
  **The grading itself is read-then-grade** (`pipeline/checkWorkGrader.js`): a vision call only
  TRANSCRIBES (problem, the student's lines, final answer, legibility) while Mathpix reads the same
  photos to confirm the answers; then `mathSolver` checks the answer, `pipeline/checkWorkSteps.js`
  (mathjs) finds the first line that doesn't follow or a false arithmetic line, and two blind judges on
  different providers grade the text. A solver match calls a problem right; calling it WRONG takes two
  independent witnesses, and an error on an unconfirmed reading becomes "could not verify — I read it
  as …". A failed read falls back to the single-pass vision grader; `CHECK_WORK_PIPELINE=legacy` forces
  it. The step checker is one-sided by design (anything it can't prove is `unknown`, never `broken`) —
  keep it that way. Pinned by `tests/unit/checkWorkGrader.test.js`.
- **One problem, one card — the board's tail lives in `pipeline/boardSettle.js`.** A `pose` of
  different tex SEALS the card in focus, and a `verify` closes it and drops the pin — so on
  2026-10-05 a model `verify` of `2x + 10 = 26` (not an answer) closed the card, and every
  restated line after it (`2x = 16`, `5x + 10 - 3x = 26`) was posed as a new problem: one solve,
  five cards. `settleBoardTurn` now demotes a non-answer verify to a resolve, and folds a pose
  whose equation is a line of the problem in focus (`pipeline/boardContinuity.js`: proportional
  residual while open; identical residual or a line on the card once solved) back into that card,
  re-pinning it. The guard also drops a scaffold blank whose only value is a given, and `example`
  cards deriving the problem posed that turn. Change any of it through the replay:
  `tests/helpers/fiveCardSolve.fixture.json` → `inlineWorkDock.test.js` "one problem stays one card".
- **Conversations >100 msgs are summarized** before hitting the LLM — mind token budgets.
- **IEP is split** (collection + cached copy on user) — update both / sync on read.
- **`learningProfile.growthCheckHistory` has exactly ONE writer** — the `isGrowth` block in
  `routes/screener.js` `/complete`. Nine places read it (parent ×3, teacher ×3, admin ×2,
  `scripts/weeklyDigest.js`). It's a write-once/read-many seam with no schema-level enforcement, so
  breaking the writer empties every growth panel *silently* — no error, just blank cards. Pinned by
  `tests/integration/growthCheckClosure.test.js`. A growth check must also **not** touch
  `initialPlacement` / `assessmentDate` / `assessmentExpiresAt`: those describe the Starting Point run
  and are the baseline growth is measured against. Note the history records the **raw** theta
  alongside the guarded one — `growthGuard` damps what we *act on*, never what we *record*.
- **Grade answers with `problem.checkAnswer()` (the schema method), never a hand-rolled compare.**
  The comparison engine itself lives in `utils/answerComparison.js` — `problem.checkAnswer()` and
  `assessmentService.checkAnswer()` are thin wrappers over it. Extend the engine, don't fork it.
  `models/problem.js` has no `correctAnswer` field — the real ones are `answer.value`,
  `answer.equivalents[]`, `answerType`, `options[]`, `correctOption`. The retired `routes/growthCheck.js`
  compared against `problem.correctAnswer`, i.e. `undefined`, and scored every student 0%.
  MC answers travel as the **letter label** (`'C'`), not the option index.
- **Skill inference**: mastery can be *inferred* from prerequisites with no cascade-invalidation if a
  prereq later fails — be careful trusting `masteryType: inferred`.
- **Clever sync is non-blocking** — roster failures are swallowed; surface them when debugging "missing students."
- **`render.yaml` ≠ prod config** — it's documentation; real config/crons live in the Render dashboard.
- **Known doc↔code drift** (see `docs/SCREENER_STATE_ANALYSIS.md`): screener grade-based start / theta-reset,
  IEP UI vs schema mismatch, pattern-skill coverage incomplete (~59 of ~204).
- **A NEW WORKTREE FOR EVERY SESSION, ALWAYS — no exceptions (owner's standing rule).** Never run two
  sessions in one checkout, ever, even for a "quick" change. A branch name is NOT isolation: branches
  share the tree, the index, and HEAD, so two concurrent sessions in one directory overwrite each
  other's files with no conflict and no merge to adjudicate it — and the branch gets switched under a
  running session without warning. This has already bitten repeatedly: a session's commit landing on
  another session's branch, uncommitted work from a third session sitting in the tree mid-edit, the
  checked-out branch changing three times inside a single turn. Cloud sessions get isolation for free
  (own container, own clone, land via PR); a local session's FIRST action is to create its own tree,
  rooted at freshly-fetched main, and run everything from there:

  ```bash
  git fetch origin
  git worktree add -b claude/<task> ../mm-<task> origin/main   # then run the session with that cwd
  git worktree remove ../mm-<task>                             # after it lands
  ```

  **Pass `origin/main` explicitly.** Omit it and git roots the new branch at whatever HEAD currently is —
  you inherit another session's in-flight branch instead of starting clean.

  **If you find yourself in a shared checkout with someone else's uncommitted changes in the tree, STOP.**
  Do not stash, commit, or branch — you would carry or clobber their work. Make your own worktree off
  origin/main and move there before touching anything.
- **Never `git add -A` / `git add .` here.** The fallback for when you're sharing a tree anyway. A blanket
  stage sweeps up someone else's in-flight work and commits it under your message. This has already
  happened: a 14-file TTS refactor was swept into an unrelated UI commit, then split back out — and the
  split left the branch broken mid-refactor for two commits. **Stage explicit paths**
  (`git add path/a path/b`) and check `git status` before committing: files you don't recognise are
  probably not yours.
- **A green suite can hide a half-applied refactor.** Jest reads the working tree, so a change that is
  uncommitted still passes locally while the committed branch is broken. When a test fails and then
  "goes away", don't call it flaky — `git stash -u` and run against the branch as committed before
  concluding anything.
- **The chat page and the Living Workspace theme themselves DIFFERENTLY.** `design-system.css`
  (`--cr-*`) is **dark by default** and goes light only on `[data-theme="light"]`;
  `living-workspace.css` (`--lws-*`) is dark by default but *also* answers
  `@media (prefers-color-scheme: light)`. So on a light-OS machine, before the deferred
  `theme-toggle.js` stamps `data-theme`, the chat panel is dark while the board palette is light — at
  the same time. This was invisible while the board lived in the rail, because `.lws-root` painted
  `--lws-grid-bg` beneath its own ink. Now that the work is inline, **any inline workspace surface
  must paint its own opaque ground** — a transparent one puts light ink straight onto the dark chat
  panel. It shipped exactly once that way: the sealed card's "N steps" rendered near-black on
  near-black, readable in neither theme and erroring in none. Pinned by the "paint their own ground"
  block in `tests/unit/workspace/inlineWorkDock.test.js`.
- **Editing a bundled `public/js` or `public/css` file changes NOTHING until you run
  `npm run build:bundles`.** `chat.html`, both dashboards and `admin-dashboard.html` do not load their
  own sources — `scripts/buildPageBundles.js` concatenates them into content-hashed bundles under
  `public/dist`, and the page links only the bundle. `npm run build` does **not** cover this: vite's
  only entry points are `js/script.js` and `css/main.css`, so it never touches the dashboards.
  The failure is silent in every check you'd normally trust — the diff looks right, jest passes
  (it `require`s the source directly), the vite build is clean — and the browser still serves the
  pre-edit bundle. A course-unenroll fix merged green this way and did nothing in production:
  `chat.html` was still pointing at a `chat-js3` built before the fix existed. Check
  `dist/page-bundles.manifest.json` for whether the file you touched is bundled, then rebuild and
  commit the regenerated `public/dist/*` alongside the source edit. Pinned by
  `tests/unit/pageBundlesFresh.test.js`, which re-derives each bundle's hash from its sources.
- **Everything under `public/courses/` is GENERATED — except `public/courses/assets/`.** The course
  site is published from the Course Planner on Mr. Nappier's Mac
  (`~/mathmatix-course-tools/`, `sync_to_repo.sh`), straight to `main`, roughly every two or three
  days as `courses: update schedule and pages`. Each publish rewrites `courses/index.html`, both
  courses' `*.html`, and their `assets/site.{css,js}` from the generator's own templates, so a hand
  edit to any of those is gone at the next Publish — no conflict, no review, no error. `b1ce44b`
  reverted the entire St. Charles rebrand (`de24d06`) that way and the school's students got
  MATHMATIX.AI purple until someone noticed on a phone. The generator has no template for
  `courses/assets/`, which is why the crest PNGs there survived untouched — so the school's brand
  lives in `public/courses/assets/brand.css`, hand-owned, linked last on every page so it
  out-cascades whatever `site.css` the generator shipped. The HTML that links it is still
  generated: `npm run courses:brand` re-applies those few facts idempotently (head links, the mark,
  the title and footer lines), and `tests/unit/courseBrandIntact.test.js` fails CI within minutes
  of a publish that drops them. Do not "fix" the brand by editing `site.css` or a page — it will be
  reverted; change `brand.css` or `scripts/applyCourseBrand.js`.

---

## 13. Where the design intent lives (`docs/`)

Start with `SITE_OVERVIEW.md` (feature catalog) and `STUDENT_UX_FLOW.md`. Then by area:
pedagogy → `PEDAGOGY_ANALYSIS_AND_RECOMMENDATIONS.md`, `MATH_SKILLS_VERTICAL_ALIGNMENT.md`,
`DUAL_MODE_SYSTEM_DESIGN.md`; assessment → `PLACEMENT_TEST_SYSTEM.md`; gamification →
`BADGE_SYSTEM_DESIGN.md`, `MASTER_MODE_BADGE_SYSTEM.md`, `PATTERN_BADGE_GUIDE.md`; whiteboard →
`WHITEBOARD_AI_INTEGRATION.md`, `BOARD_LLM_STAGE_DESIGN.md`, `CHAT_BOARD_AI_INTEGRATION.md`;
security/compliance → `INCIDENT_RESPONSE.md` (the runbook), `STUDENT_DATA_SECURITY_AUDIT.md`, `CSRF_PROTECTION.md`; the public disclosures are `public/subprocessors.html` (bound to live env reads by `tests/unit/subprocessorsListed.test.js`) and `public/accessibility.html`;
cost → `AI_COST_PROJECTIONS.md`; **growth/pricing/GTM → `GROWTH_STRATEGY.md`**. **Docs describe intent and may lag code — verify against the source.**
