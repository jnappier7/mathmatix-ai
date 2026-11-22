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
  (shelved in chat) render nowhere with it off. The landing-page preview follows the same switch:
  `routes/trialChat.js` forwards `board` only when `isWorkBoardEnabled()`, so its "Our work" dock
  (`#lp-work-dock`) never opens with the board off. The board's own suites opt in with `WORK_BOARD=on`;
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

- **Seeding skills and items → `npm run seed:all`** (`scripts/seedAll.js`). It runs its
  seeders in the one order that works and then the `answer.equivalents` backfill, verifies row
  counts against the payloads, and exits non-zero if the DB came up short. Idempotent — every step
  is a source-scoped upsert, so re-running is safe. `--fresh` makes each bank clear **its own**
  prior rows first; `--only=`/`--skip=` narrow the run; `--list` names the steps.
  Two orderings are load-bearing, not stylistic: **skills before items** (`seedBankTopupItems`
  aborts on a `skillId` that isn't in the Skill collection) and **the backfill last** (each Fable
  bank re-upserts `answer.value` from JSON, dropping the typography equivalents — backfill before
  them and students get marked wrong for correct answers again). Both are pinned by
  `tests/unit/seedAllPlan.test.js`.
  The plan seeds THREE skill catalogs: unified, pattern, and `catalog-skills`
  (`scripts/seedCatalogSkills.js`: the per-course `seeds/skills-*.json` files plus
  `seeds/skills-legacy-catalog.json`). The third was missing until 2026-11-22 — production had those
  268 skills from older hand-run scripts, so `seed:all` passed there and failed on any empty
  database at the bank top-up. It is INSERT-ONLY (`$setOnInsert`): a no-op where the skill exists,
  so it can never overwrite a prerequisite graph or guidance tuned in production
  (`seed-curriculum.js` writes the same files with `$set` and does overwrite — not in the plan).
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
| Archive / delete a class (teacher or admin) | A class is an `EnrollmentCode`. **Archive** = `isActive:false` + `archivedAt` — the join code closes and the class leaves every live surface (Today strip, class chips and drop targets, the live-drill host's class picker, the student's My Class panel all filter `isActive: { $ne: false }`), but NOTHING is deleted: students keep their enrollment and history, and Restore (`archived:false`) brings it all back. Teacher: `PATCH /api/teacher/classes/:codeId` `{ archived, className, period }` and `DELETE /api/teacher/classes/:codeId`, owner-only; **a class with students is never deleted by a teacher** (409 "archive it instead") — its enrollments are the students' record — and the dashboard only offers Delete on an empty class (`teacher-dashboard.js` `classCard` / `classAction`; archived classes fold under "Archived classes" on the Classes tab; `fetchClassesForGrouping` keeps live classes only). Admin: `PATCH /api/admin/enrollment-codes/:id` takes `archived` too; `DELETE` refuses a class with students unless `?force=1` (`admin-manage-classes.js` asks). Distinct from the SCHOOL-YEAR rollover, which archives STUDENTS (`teacher-school-year.js`); an archived class's students stay on the roster. Both dashboards are bundled — `npm run build:bundles`. Pinned by `tests/integration/teacherClassArchive.test.js` (real Mongo, CI) |
| Course site branding (`/courses`) | `public/courses/assets/brand.css` (hand-owned) + `scripts/applyCourseBrand.js` (`npm run courses:brand`). Everything else under `public/courses/` is generator output — see §12 |
| Chat UI / rendering | `public/js/script.js`, `public/js/inlineChatVisuals.js`, `public/css/chat*.css` |
| Motion: worked steps in chat, the football field, the Heist vault | **Chat:** `public/js/math-morph.js` (standalone on `chat.html`, not bundled) — when a streamed reply finishes, `finalizeStreamingMessage` calls `MathMorph.play(bubble)`: each display equation is built from the one above (glyphs that carried over travel down, a term that changed sides arcs across in the accent colour, new glyphs land tinted). Presentation only — it reads the rendered KaTeX and never writes content; lines sharing < `MIN_SCORE` of their glyphs are left alone; history is never animated; a tap finishes it; "Replay the steps" replays. Matching is pinned by `tests/unit/mathMorph.test.js`. **Field:** `common.js` `setField(el, teams, { pickSix })` is told only where each ball IS and derives the motion from where it WAS (gain = spiral + streak + "+8"; loss = tumble; touchdown = run in, spike, re-spot — never a slide back down the field); `fieldBolt` is the blitz. **Heist projector:** `host.js` `renderHeist` is KEYED rows (FLIP on rank change, cash counts up, a grab flies from victim to thief) beside the vault SVG (`vaultScene`: wheel per crack, coins per safe, door open on a jackpot, red lamp while any alarm rings). Phone: safe doors and the alarm drain bar are CSS. **Every WAAPI effect must check `calm()` itself** — the stylesheet's `prefers-reduced-motion` rule stops CSS animations only. The lane's scoring class is `scored`, never `td` (`liveDrillOverlayClass.test.js`). Checked by eye in headless Chromium, like the hill. **Pictures in chat are DRAWN, not shown** (`public/js/visual-motion.js`, standalone on `chat.html`): `inlineChatVisuals.js` (chat-js4 bundle — `npm run build:bundles`) renders NUMBER_LINE / INEQUALITY / SLOPE in their final state and tags the parts `data-m="role"`; the runtime plays them in the order the picture is told — a hop is start → arc with a dot riding it → landing → label, one hop after another; an inequality's endpoint drops and the shading sweeps out from it; a slope is first point → line → RISE → RUN → second point (lines grow by moving their far end, never by scaling, which thins the stroke). Every animation is held back with `fill:'backwards'`, so a picture that is never staged is simply complete. `script.js` calls `VisualMotion.play` once, right after `initializeVisuals` on a fresh reply (and re-plays `MathMorph` there, because that re-render replaces the equations) — never on history. The order is pinned by `tests/unit/visualMotion.test.js`. **Canvas graphs** are `mathGraph.js`'s own: several curves draw one after another (`_animT` shared out per curve), then a ring opens on each intersection, or on the key points when there is none (`_startPing`); `_startAnimation` itself stands down for reduced motion. **None of this decides WHETHER a visual appears** — the tutor writes the tag and the pipeline's verify stage may strip it; this only decides how it arrives. **What makes the tutor reach for a picture on its own** is `utils/pipeline/visualDirective.js` (the "DRAW IT" directive `decide.js` adds on teaching turns and visual topics). Its topic map names the form the client draws in order: signed-number arithmetic → `[NUMBER_LINE:…jumps=…]` (hops), inequalities → `[NUMBER_LINE:…inequality=…]`, what slope IS → `[SLOPE:rise=,run=]`; `visualCapabilities.js` documents them and `promptCompact`'s "WHERE THE WORK GOES" asks for one equation per display line in a worked example (that is what math-morph animates). With the board off, pictures live in the message, so `hasInlineVisual` over the tutor's last two replies (`recentInlineVisual`) is what stops the ask repeating every turn — a recent picture is pointed at, unless the student asks or it plainly did not land (`REDRAW_MOMENTS`, 2+ wrong). **A number line can hand over an answer**, so `pipeline/numberLineGate.js` runs in verify beside the graph gate, deterministic and independent of `VISUAL_GATE_MODE`: a hop that LANDS on the value of arithmetic the student posed (or the pinned problem / graded answer) is cut and the earlier hops stay (a one-hop line keeps its start point); a shaded inequality whose boundary solves an inequality the student brought UNSOLVED is stripped; the tutor's own example, a stated `x > 2`, and a student who already has it right are left alone. It also checks CORRECTNESS on every number line, leaks or not: hops whose signed label and landing disagree, or that do not start where the last one ended, remove the picture (a wrong picture is worse than none), and a hop that runs past `min`/`max` stretches the line. Pinned by `tests/unit/visualDirective.test.js` and `tests/unit/numberLineGate.test.js` |
| "Check my work" grading accuracy | `tests/eval/checkWork/` — hand-labeled corpus + real-sheet drop-in (`sheets/README.md`, consent/anonymization rules); hermetic tier in `npm run test:eval`, live tier `npm run test:eval:checkwork`. Headline metric is the false-accusation rate (correct work called wrong), which gates |
| Tutor teaching-quality regression / evals | `tests/eval/` — replayed-bug scenarios + behavioral personas through real observe→diagnose→decide; heuristic + LLM judges; live tier via `RUN_LLM_EVAL=1 npm run test:eval:live`. The judges themselves live in `utils/replyJudges.js` / `utils/replyLlmJudges.js` (shared with prod; tests/eval keeps shims) |
| Transcript mining (nightly prod tutor-quality sweep) | `utils/transcriptMiner.js`, `scripts/mineTranscripts.js` (`npm run cron:mine-transcripts`), `GET /api/admin/tutor-quality-report`; doc: `TRANSCRIPT_MINING.md`. Findings are candidates for human review, never auto-actioned |
| ACT visual items (graphs, charts, tables) / visuals per form | `scripts/generateActVisualItems.js` → `seeds/act-visual/` (figures from `utils/actCharts.js`; label-only figures for the enhanced bank from `utils/actFigures.js` + `scripts/addActEnhancedFigures.js`). Pacing to 8–12 per form is `blueprint.visualTarget` in `utils/actTestAssembler.js`. Every item is re-solved from its own alt text in `tests/unit/actVisualItems.test.js` — regenerate, never hand-edit the seed file |
| Growth / pricing / go-to-market | `docs/GROWTH_STRATEGY.md` — the $1M-ARR plan, market-grounded. Its two shipped pieces: `utils/impactReport.js` (`GET /api/admin/impact-report`, cohort efficacy evidence for a school) and `utils/schoolSignal.js` (`GET /api/admin/school-signals`, teacher density per inferred school = the sales pipeline). Both deliberately report their own limits in a `caveats` array — they are sales artifacts, so every bug in them points toward a flattering number |
| Student usage & conversion numbers | `GET /api/admin/reports/student-conversion` → `utils/studentUsageReport.js`. Reads the `ConversionEvent` log (`models/conversionEvent.js`) joined to User. A card trial is never "paid" — paid = `subscribed` with `startedInTrial:false`, or `trial_converted`, or a current paid tier; school/founding/demo accounts are out of the cohort; parent-paid is reported beside the rate, not in it. Supersedes `/api/admin/funnel` for students (that one counts card trials as paid). Caveats ship in the payload |
| Marketing email / unsubscribe (admin broadcasts, reactivation, anything not transactional) | `utils/emailUnsubscribe.js` is the whole mechanism: a signed per-recipient token (`user:<id>` / `waitlist:<id>`, HMAC with `EMAIL_UNSUBSCRIBE_SECRET` → `SESSION_SECRET`, never expires), the public `/unsubscribe` page + POST (`routes/unsubscribe.js`; CSRF-exempt, own limiter; the GET only shows a button — link scanners prefetch GETs), RFC 8058 one-click headers (`marketingHeaders`), the footer, the audience clause (`marketingOptOutFilter()`) and the ONE writer of `emailPreferences.marketingOptOut` (`setMarketingOptOut`). Every marketing sender uses all of it: `routes/adminEmail.js` `sendBulkEmailCampaign` (+ `{{UNSUBSCRIBE_URL}}` template var; the resolver in `models/adminEmail.js` filters opt-outs and matches roles HELD), `scripts/reactivationCampaign.js`, the reactivation emails in `emailService.js`. Students opt in/out in the chat Settings modal ("Email me about new features", `settings.js` → `PATCH /api/user/settings`). Transactional mail (consent, password reset, receipts, safety) ignores the flag on purpose. Pinned by `tests/unit/emailUnsubscribe.test.js` and (real Mongo, CI) `tests/integration/unsubscribeRoute.test.js` |
| Consumer plans / prices | `routes/billing.js` `PACKS` — monthly `unlimited` ($9.95) and annual `unlimited_annual` ($99, 2 months free). The interval comes from the plan, never a literal; trials are monthly-only by design. UI is the toggle in `public/pricing.html` (not bundled — edit directly), which drives the CTA's `data-pack` |
| **My Class** (the student's classroom, on `chat.html`) | There is no classroom PAGE; the class is a panel — ☰ → **My Class** (and the sidebar Tools list), `public/js/my-class.js` + `css/my-class.css`, standalone deferred scripts like `join-class.js` (no bundle rebuild). Per class: teacher/period, **Live now** (a Join button from `GET /api/live-drill/mine`), **Assignments** (activities + practice tests from `GET /api/activities/mine`, matched to the class by `className`) and **Practice** (the course's solo drills). The class list itself is `GET /api/student/my-classes` (`routes/student.js`): active enrollments only, teacher name, and the drill hub from `liveDrill/solo.hubFor(mathCourse, className)` ("geom" → geometry, else "alg" → algebra, else `/drill`). A student in no class gets the Join-a-class dialog. Announcements are NOT shown — the student inbox (`student-announcements.js`) is deliberately switched off until it's production-ready. Pinned by `tests/integration/myClasses.test.js` (real Mongo, CI) and the `hubFor` cases in `tests/unit/liveDrillSolo.test.js` |
| Teacher documents for students (Resources tab → upload; "push to the tutor") | `routes/teacherResources.js` + `models/teacherResource.js`: PDF/Word/PPT/images ≤ 50 MB, class-targeted (`sharedWithClassIds`; EMPTY = every student linked to the teacher), published by default, text extracted at upload (PDF text / OCR) for the tutor. **Production refuses uploads with a 503 unless `S3_BUCKET` + `S3_REGION` are set** (`requireDurableStorage`: Render's disk is wiped on deploy). Students browse them in the chat's Resources modal (☰ → Resources; `public/js/student-resources.js`, chat-js8 bundle — `npm run build:bundles`) under **From your teacher** (`GET /my-teacher-resources`: published files shared with a class they are in, teacher name on each card; was deliberately left out 2026-10-24, restored 2026-11-06 at the owner's request) — Download, drag-to-chat, or ONE tap **Work on it with Tutor** / **Practice with Tutor** (test/quiz), which closes the modal, loads a PDF/image through `window.fetchAndUploadTeacherResource` (Word/PowerPoint are named in the message instead) and sends the framing via `window.mmSendChatMessage`. They also meet them through the tutor: name-triggered (`utils/resourceDetector.js`, ≤ 3000 chars of extracted text) or PUSHED (`PATCH /:id/assign`, `tutorAssignment`; `utils/teacherAssignments.js` renders the prompt block, tests/quizzes get parallel practice only). **A pushed resource ALERTS the student** (2026-11): `public/js/teacher-assignment-banner.js` (standalone on `chat.html`, not bundled) polls `GET /api/teacher-resources/mine/assignments` (student-only; pushed, in-window, visible, NOT yet started; no content) and shows one banner; ONE tap records `POST /:id/start`, loads the file through the student's own upload path (`window.fetchAndUploadTeacherResource` → `handleFileUpload`, same worksheet guard) and sends a framing message via `window.mmSendChatMessage`, so the tutor opens on the first problem. The greeting's own "Open X" button (`start-teacher-resource` CTA, throttled ~20 h) still exists; either path marks it started and the banner stands down. Pinned by `tests/integration/teacherPushToTutor.test.js` (real Mongo, CI) |
| Class Activities (teacher-assigned interactive pages, per-student results) | `activities/` (the pages + `manifest.json`, published only by PR — no upload path), `routes/activities.js`, `models/activity{Assignment,Attempt}.js`, host page `public/activities.html`, teacher **Activities** tab (`public/js/teacher-activities.js`). The frame is served into a CSP `sandbox allow-scripts` + `connect-src 'none'` and reports by postMessage; manifest `items[].key`/`levels[].n` are the results contract. Doc: `CLASS_ACTIVITIES.md` |
| Live Two-Minute Drill (whole-class game with a join code; `/play`, host at `/live-drill`) | `utils/liveDrill/engine.js` runs the item bank straight out of the PUBLISHED drill pages (`public/courses/*/two-minute-drill.html`, everything above `// ===== app =====`) in a vm with a seeded `Math.random`, so play n is a pure function of (game seed, n) and a Course Planner publish is live in class games with no edit here — `tests/unit/liveDrillEngine.test.js` is the tripwire if a publish moves the bank. `utils/liveDrill/games.js` is the game: two modes (Team Drive = shared clock, own pace; Huddle = one play on the projector, everyone answers, reveal), Red vs. Blue, server deals/clocks/grades every play and never sends an open play's answer. **State is in memory with a Mongo shadow** (`utils/liveDrill/store.js` → `models/liveDrillGame.js`): every change is snapshotted within a second (`games.snapshot`, Maps folded, deck left out — it re-deals from the seed), a code this process doesn't hold is revived from the shadow on the first request (`store.load` before every lookup in `routes/liveDrill.js`; `hydrate` re-arms the clock from the absolute times), and SIGTERM hands off (`store.handoff`: flush, `freezeAll`, then 503 `{retry:true}` on every game call, which `play.js`/`host.js` `api` retry quietly for ~8 s). This is what keeps a deploy from ending a class game — two died mid-play on 2026-10-22 before it existed. Still single-instance for play (the live state is the process's; the shadow is for succession), so scaling out needs the game itself on a shared store. `routes/liveDrill.js`: host is teacher-only; the player router is PUBLIC (bearer token, CSRF-exempt, off the global apiLimiter because a class shares one IP) and must stay mounted above the `/api` isAuthenticated catch-alls — pinned by `tests/integration/liveDrillRoute.test.js`. Pages `public/live-drill-host.html` / `public/play.html` + `public/js/live-drill/*` (not bundled). **Getting back into a game** (owner 2026-11-19: "I accidentally exited out of the projector screen and there was no obvious way to get back in"): `GET /api/live-drill/host/games` (`games.gamesForHost`, after `store.loadForHost` revives any from the shadow) lists the teacher's own lobby and live games, then any that finished in the last `RECENT_OVER_MS` (30 min — the final screen has the results and CSVs), never another teacher's; the host page shows them on its setup screen (`#resume`, "Return to game" / "See the results" → `rejoin(code)` = the same stream + state as hosting), `/live-drill?code=ABC123` goes straight back, a live or lobby game with players asks before the projector is closed (`beforeunload`), and the teacher dashboard's Today page opens with a **Game in progress** card (`teacher-home.js` `renderGames`/`loadGames`, every 30 s and on focus; bundled). Pinned by the route test and `tests/unit/liveDrillRejoin.test.js`. **Class games**: a host may tie a game to one of their classes (`EnrollmentCode`); enrolled students see a Join banner on `chat.html` (`public/js/live-drill/chat-banner.js`, standalone — not in the chat bundles) polling `GET /api/live-drill/mine`, and join with their ACCOUNT name via `POST /api/live-drill/mine/join` (session + CSRF; a second device reseats the same player). `play.js` calls those with plain `fetch` + `addCsrfToken`, never `csrfFetch`, whose 401 handler would send a guest to the login page. Huddle rounds wait only for players with an open stream (`expectedAnswerers`); "Run it back" (`rematch`) keeps the code, seats and teams. **A Huddle answer can be CHANGED until the reveal** (students asked, 2026-11): the LAST pick is graded, timed from when it landed (a fast guess then a slow fix scores slow), the same pick again is a no-op, `rules.canChange` drives the lobby line and the phone keeps every choice tappable (`choicesHTML` `keepOthers`; typed plays get a Change button). **No answer costs MORE than a wrong one** (Huddle only, owner's rule 2026-11 — students had learned that sitting out a hard play was free): `SCORING.*.noAnswer` is twice the sack (−10 standard/prep, −4 facts); `closeRound` charges it to every player the round was WAITING ON (`expectedAnswerers` — an open screen; a phone asleep in a backpack is not penalized) who never answered, as one player's push through `moveTeam` (team-share scaled, never behind the 1), resets their streak, and does NOT count an attempt (accuracy is answers only). `round.noAnswer` (per team), `round.penalty` on the silent student's own view, `player.noAnswers` on the final table and CSV, `rules.noAnswer` in the lobby line. Drive has no such thing — its next play waits for you. **Pick six** (Huddle only — the one mode where a whole team answers the same play): every teammate who is in the game (open screen, or answered) right on one play, on a team of `PICK_SIX.minTeam` (5) or more, scores `+7` and turns the other team over — their ball goes back to the 20 if they were past it; both teams can earn it on one play; judged in `closeRound` after the yards move (`pickSixTeams`), surfaced as `round.pickSix`, `teams[].picks`, a `pick6` feed item, the play-by-play and the TD splash ("Pick six"). Never add a chosen target to it — same rule as the blitz. **Blitz** (Team Drive only): every 3rd right answer in a row by any player (`BLITZ.every`) knocks the OTHER team's ball back `BLITZ.yards` (10) scaled by the blitzer's team share (`teamShare`, the same K-scaling as a gain — so by construction a blitz costs the other side ~16% of its progress at every class size: ~3 blitzes of 10 for a solo player, ~44 of 1.7 for a team of 15); the ball never goes behind the 1; `res.blitz` on the answer, a `blitz` feed item (`victim`, `yards`), `player.blitzes`/`teams[].blitzes`, a column on the final table and the CSV, `SND.blitz()` on the projector. Automatic, no target (owner's rule). Not in Huddle (a dozen streaks would land on one reveal; the pick six is its team-vs-team) or on the hill (boulders, which ARE a pick — see below). The host's final screen adds a **play-by-play** (`games.playStats` → `hostView.final.plays`; each row is the engine's one-line `summary`, which drops figures/tables). It also lists **every player** (`hostView.final.players`: score, right/attempted, accuracy, best streak, average answer time from `player.msTotal`, signed-in ✓; students who never answered sort last, never above someone who played and went backwards) with a CSV — `host.js` `renderFinalPlayers`; King of the Hill shows its standings instead. **Sound** is projector-only, synthesized with Web Audio (`public/js/live-drill/sound.js`: whistle at kickoff, a tick on each of a clock's last five seconds, chime on a Huddle reveal, horn on a touchdown, buzzer at the final) — phones stay silent on purpose. **The cheers are the one recorded sound**: `public/audio/live-drill/cheer-big.mp3` (touchdown, pick six, final) and `cheer.mp3` (a mostly-right Huddle reveal, a new king), owner-supplied stock cuts (licence is the owner's — see the README there), fetched after the first click and played at a slightly random speed; until they load, or if they can't, `cheer()` falls back to the synthesized roar. **The murmur under play is also a recording**: `murmur.mp3`, a seamless loop (seconds 1–25; a second of lead-in and two of tail keep `loopStart`/`loopEnd` off the codec's padding) DERIVED from the two cheers by `scripts/buildCrowdMurmur.js` (a grain cloud of their bodies, low-passed, crossfaded) so it carries the same licence; `startMurmur` plays it looping through a low-pass that opens with hype, and the synthesized voices below are the stand-in until it loads. Three switches, each remembered per device: **Sound** (master; `M`), **Music** (an original drumline + bass loop, OFF by default) and **Crowd** (a gym full of voices that gets busier as a ball nears the goal, cheers on a touchdown, cheer/groan on a Huddle reveal). **The crowd is VOICES, never a noise bed**: twelve sawtooth speakers at their own fundamentals through two formant band-passes hopping between vowels, gated into words on their own clocks. Two filtered-noise beds in a row (a swelling band, then four tremolo bands over a low rumble) were heard as "an ocean" — noise has no pitch and no formants, so no amount of shaping makes it a crowd. A hotter game is shorter pauses, not a bigger wave. Nothing synthesized rides over the recorded bed: a voiced "GO! GO! GO!" chant and then a stomp-stomp-CLAP with whoops were both tried and both sounded like a machine; with the recording playing, the red zone is the recording louder and closer (gain + a low-pass that opens with hype), nothing else. The page only says where the game is (`setScene`: setup/lobby/live/reveal/final) and `setHype`; sound.js owns the mix. Pinned by `tests/unit/liveDrillSound.test.js` (fake Web Audio graph). **The lobby's "How scoring works"** (both screens, `LiveDrill.rulesHTML`) renders `state.rules` from `games.rulesFor` — never hardcode a number there; the "lobby states the rules the server plays" tests answer at each stated edge. **Math Facts** (fluency mode) is the third drill and the one NOT read from a course page: `utils/liveDrill/facts.js` owns the bank (`DRILLS.facts.native`; +, −, ×, ÷, Mixed, Integers, Squares & roots), plays carry `input: 'number'` and no choices — answers are TYPED on a number pad (`play.js` `openPad`) and graded by `facts.normalizeTyped` (junk is a 400, never a sack). A teacher's **focus** (`game.focus`, e.g. `[2, 5, 10]`) puts one of those numbers in every +/−/×/÷ fact. Its own scoring (`SCORING.facts`: +6/+4/+2 at 3 s/6 s, sack −2) and Huddle clocks (`FACT_SETTINGS`) come from the drill, never a literal. Every answer is tracked per student per fact (`player.facts`, `factLog`): the host's final screen gets a **Fact tracker** (fluent = always right in ≤ `FLUENT_MS`; missed; slow), a class grid per fact family (56 ÷ 7 lands in the 7 × 8 cell) and a client-side CSV; the phone gets "Your facts". The game itself is in memory, but each **signed-in** student's answers are SAVED when a Math Facts game ends: `games.onGameOver` → `utils/liveDrill/fluency.js` `saveGame` → `models/factFluency.js` (one doc per student, `facts` keyed by exact fact id with its family cell; one dotted `$inc`/`$push`+`$slice` upsert per student, so games ending together can't clobber each other). Status is computed on read, never stored: missed (any of last 3 wrong) / fluent (2+ right, typical ≤ 3 s) / slow / new ("right once"). Guests who joined with only a code are not saved — the host's final screen marks saved students ✓ and says so. Teachers read it at **`/fact-fluency`** (teacher-only page; `GET /api/live-drill/host/fluency/classes/:classId[/students/:id]`, own classes only, FERPA-logged as `skill_mastery`); a student's phone shows their lifetime line via `/api/live-drill/mine/fluency` (self-access logged). It is an education record: in the FERPA export and the delete sweep (`routes/dataPrivacy.js`). Pinned by `tests/unit/liveDrillFacts.test.js`, `tests/unit/liveDrillFluency.test.js` and (real Mongo, CI) `tests/integration/factFluencyRoute.test.js`. **King of the Hill** (`mode: 'hill'`, any drill) is the third game type: solo climbers, own pace on one clock (it shares Team Drive's `currentPlay`/`answer` path via `ownPace`), no teams or ball. Its rules live in `utils/liveDrill/hill.js`: right answers climb by the drill's speed tiers, wrong ones slip, summit 100; every 3rd in a row earns a boulder and **the thrower PICKS who takes it** (owner 2026-11-18: "allow choice of who to attack") — but ONLY FROM BELOW: the choice is the climbers strictly above them (a tie, e.g. two students at the base, is not "above") within `TUNE.reach` (30), not steady; `onAnswer` parks `player.boulder`, `currentPlay` returns `{ pick }` before the next play (a reconnect sees the same list; the list is re-read each time and the boulder is dropped if everyone offered has moved out of reach or gone steady), `answer` refuses until it is made, `POST /play/:code/target` → `games.pickTarget` → `hill.throwAt`, which accepts only a name still strictly above and not steady (`'none'` keeps climbing). **The crab-pot answer** (owner: "how to avoid crabs in a pot?"), four rules that together keep a class from pulling the leader down until nobody climbs: reach (a leader who breaks away is untouchable until the pack closes in); STEADY (`TUNE.steadyMs` 6 s after a hit, nobody can be offered that climber — at most one boulder per climber per window, whoever throws); shields for EVERYONE (any 5th in a row, one at a time, eats a boulder whole; 5 is not a multiple of 3 so shields and boulders interleave); and a knock priced in the drill's own tiers (`knockAt(h, sc)` = ½ a fast answer + 10% of the target's height: Math Facts 3 → 13, a course drill 7.5 → 17.5 — the old flat 10 + 15% was two or three Math Facts answers a hit and pinned a class near the base, owner: "boulders push back too far"). The crown is heavy (the king climbs at half speed; a king's 3rd throws nothing — nobody above). Pinned by the "crabs in a pot" simulation in `liveDrillHill.test.js`: twelve bots that ALWAYS throw at the leader must leave the best student winning about as often as when nobody throws. `rules(sc)` takes the drill's scoring (the lobby prints the knock range from it). Phones: the typed-answer pad must fit with the browser's bars showing (iPhone SE ≈ 375×548) — Go lives in the 4×3 key grid, Integers get a ± beside the answer, and `#live.typing` compacts everything above it; a student who scrolls per fact isn't drilling facts. Crown = highest climber (tie: first there); final = standings + longest reign + most boulders. Projector draws the hill (`host.js` `renderHill`, keyed SVG so climbers glide) as a SCENE (2026-11, owner asked for "more graphic"): `hillScene` draws sky, sun, drifting clouds, two haze ridges, the mountain with a snow cap, a switchback trail, contour lines at 25/50/75, pines and rock outcrops ONCE (viewBox 1000×450; the geometry is unchanged — y linear in height, x a hash of the id spread across the slope's width, `halfAt`); climbers are little figures (`climberHTML`: jacket colour from `JACKETS` by the same hash, a badge with initials, a name for the king and the top three), the king glows and bobs a crown, a shield is a pulsing bubble, a `hit` climber tumbles; a fresh `knock`/`blocked` feed item makes `rollBoulder` lob a boulder along an arc (SMIL `animateMotion`) from the thrower to the target with a dust burst (or a blue ring on a block), and a fresh `crown` item fires `sparkle` over the new king — both read the feed BEFORE the feed list marks items seen. The phone's `renderMyHill` draws a mini hill (`miniClimber`: you, the climber above, the king at the snow cap) in place of the old bar. Pinned by `tests/unit/liveDrillHill.test.js` (rules; the scene is checked by eye in headless Chromium). **Heist** (`mode: 'heist'`, any drill; 2026-11) is the fourth game type: solo safecrackers on one clock (shares the own-pace `currentPlay`/`answer` path), the score is CASH. Rules in `utils/liveDrill/heist.js`: a right answer pays the drill's speed tiers × `CASH_MULT` (10 — a fast standard play is $150); a wrong answer trips the **alarm**: the sack × 10 off and the screen LOCKED for `alarmMs` (the drill's fast tier, ≤ 6 s) — `currentPlay` returns `{ alarm }` instead of a play, so nothing is dealt or timed until it clears. That lockout is the whole answer to the owner's Gold Quest problem (students guess and guess for more chances at the chests): a guesser spends the clock watching a countdown, pinned by the SIMULATOR in `tests/unit/liveDrillHeist.test.js` (event-driven bots: a thinker at 85%/5 s must beat a guesser at 25%/1.2 s ≥ 4 games in 5, and a half-guesser at 50%/3 s). Every `SAFE_EVERY` (3) right IN A ROW cracks the vault: `currentPlay` returns `{ safe }` until the student picks one of 3 safes (`POST /play/:code/safe`); the three are dealt from (seed, player, crack number) so a reconnect sees the same three and the server never sends the two not opened. Outcomes (`OUTCOMES`, weights sum to 100; cash priced in units of a fast answer): cash 1/2/3 units, a 6-unit jackpot, **grab** (20% of a player ABOVE you), **switch** (swap piles with a player above — only ever up), **shakedown** (the classmate you pick drops `SHAKE_LOSS` 30% and you pocket `SHAKE_TAKE` 10% — a spoiler that hurts them more than it helps you, the move for a runaway leader; owner 2026-11-12: a pick like the grab; nobody richer → cash), **decoy** (empty), **gadget** (a one-time trick the FINDER holds and fires when they like, `POST /play/:code/gadget`: smoke blurs every OTHER screen for 6 s, flip turns them upside down; the projector takes it too; `MAX_GADGETS` 3, a full pocket pays cash). **A grab, a switch or a shakedown is the opener's OWN PICK, from the classmates above them** (owner, 2026-11-11: "I want kids to be able to target their classmates, only from below"; the hill's boulder followed on 2026-11-18, same "only from below"; the blitz and the pick six stay untargeted): `openSafe` returns `choose` (every strictly richer classmate, richest first, `pickOptions`) and parks `player.pick`; `currentPlay` returns `{ pick }` ahead of the next play (a reconnect sees the same choice) and `answer` refuses until it is made; `POST /play/:code/target` → `pickTarget`, which accepts ONLY a player still strictly richer at that moment (a name below is a 400 whatever a lagging screen showed — nobody can rob down; everyone dropped below → cash). Phone: `play.js` `showTargets`/`pickTarget` (names with their cash, `.ch.target`). **MORE THAN HALF the safes are an attack** (`ATTACKS`, `rules.attackPct` ≥ 50 — owner's report 2026-11-11: a five-minute class game at the old 21% had "maybe a couple"); the six-bot 300 s simulator in `liveDrillHeist.test.js` must land ≥ 15 moves a game, every kind. **Nothing another player does ever takes a screen away** (owner, same day: "a swap keeps everyone playing"): a 10-second jail and a blackout gadget were built, played and dropped — the alarm (your own wrong answer) is the only lock in the game, pinned by "the alarm is the only lock". Cash never goes below 0; standings by cash (tie: first there); leader is null on an empty vault. Views: `hostView.heist` (crew as cash bars, live effects), `playerView.heist` (cash, rank, gap above, safe meter, held gadgets, the effect on THIS screen — never the finder's own), `final.heist` (standings with accuracy and alarms beside the cash, Safecracker and Biggest grab awards). Lobby rules from `heist.rules(sc)` via `rulesFor`. Client: `play.js` `renderMyHeist`/`showAlarm`/`showSafes`/`fireGadget` (`heistWait` holds the phone off the next play; `fx-smoke`/`fx-flip` classes), `host.js` `renderHeist`/`renderHeistFinal`, cues `SND.safe()`/`SND.smoke()`. Pinned by `liveDrillHeist.test.js` and the heist case in `tests/integration/liveDrillRoute.test.js`. **Test Prep drills** (`DRILLS.alg1m3`, `DRILLS.hgeo3`): native banks in `utils/liveDrill/prep/` built from the teacher's unit practice tests — one template per question type, fresh numbers every play, wrong choices = the common mistakes, generated SVG figures (graphs; the box from 3-D coordinates; the transversal whose angle classes come from position). Shared helpers in `prep/kit.js` (`makeBank`, multiple choice or a typed integer; a play that can be negative sets `neg`, which is what gives the phone pad its ± — never key it on a playbook name). Prep plays are whole test questions, so they score on `SCORING.prep` (20 s / 40 s tiers) with `PREP_SETTINGS` clocks. Per-drill flags, not "is it native": `typed` (rules say "type"), `trackFacts` (fact tracker AND the FactFluency save — prep banks are native but must never write fact records), `focus` (number picker). Every computed key is re-solved from the question's own text in `tests/unit/liveDrillPrep.test.js` — a new template needs a re-solve there. For the next unit test, add a bank beside these two and a `DRILLS` entry (and put it on a hub, below). **Chapter Reviews** (`DRILLS.alg1m7`, `DRILLS.hgeo4`, …): one quick-fire bank per chapter in `utils/liveDrill/review/`, built from the teacher's guided notes, study sheet and chapter review PDFs under `public/courses/*/pdfs/` (same `prep/kit.js` contract, standard scoring — every play is ONE move: apply a rule, name the rule, count the lines of symmetry, say what substituting gives; the two "solve it" templates keep small numbers). Playbooks are the chapter's sections plus Whole Chapter. Coverage is COMPLETE as of 2026-10-24: every Algebra 1 module (1–13; 3 is the Test Prep drill) and every Honors Geometry chapter (1, 3–11) has one, each registered in teaching order on its hub (`solo.js` `HUBS` — Module 1 and 2 sit ahead of the Module 3 prep, 4–6 between it and 7). A new one (a new chapter, or a rebuild after the teacher's packets change) is a file beside these, a `DRILLS` entry, a hub entry in order, and its own `tests/unit/liveDrillReview*.test.js` that RE-SOLVES every computed answer from the printed question text (the study sheet's rules typed by hand, never read from the bank — that is what caught a sign slip in completing the square, a statistics template that could print two equal ranges, and a dozen wrong-choice collisions before they shipped). Exact answers stay exact (`32π/3`, `150√3`, reduced fractions); every answer that can be negative sets `neg`; anything a card prints with a bare `<`/`>` goes through `esc()`. **Solo practice** (`/drill/<hub>`, `public/drill.html` + `public/js/live-drill/solo.js`): a course's games on one page, played alone — no host, no account, nothing saved but a personal best in the browser. `utils/liveDrill/solo.js` `HUBS` says which drills each course page offers (algebra: the course drill, Module 3 prep, Math Facts; geometry: proof reasons, Ch. 3 prep). `GET /api/live-drill/solo/plays` deals WHOLE plays, answer included, in batches of 40 — deliberately, since nothing is graded or stored server-side (the course site's own drill page is all client-side too); each batch re-deals from play 1 so page two continues page one. Public and GET-only, so it is mounted above the `/api` catch-alls and off the global apiLimiter like `/play`. Math Facts takes the same **focus** as a class game (`&focus=2,5,10` → `facts.normalizeFocus`, only on `FOCUSABLE` playbooks; the picker is the host's presets + number grid). A long `posed()` label (> 48 chars, e.g. a word problem's story) renders in sentence case (`.posed-ask.story`), never a paragraph of small caps. The page grades typed answers with a copy of `facts.normalizeTyped`, pinned to the original by `tests/unit/liveDrillSolo.test.js`. **Solo sound** (2026-11): `drill.html` loads `sound.js` in the SOLO profile (`window.LiveDrillSoundConfig` before the script: `defaultMuted`, `defaultCrowd:false`, `storagePrefix:'mm-drill-solo'` so a teacher's projector choice never bleeds into a kid's phone, `cheersFollowCrowd:false` so a personal best cheers with the murmur off) — MUTED until the student taps 🔇 (or `M`); cues are the whistle, the last-five-seconds tick, a whoosh on every 3rd in a row, the buzzer, and the recorded cheer for a new best or a clean round; nothing on an ordinary answer. Pinned in `liveDrillSound.test.js` ("solo practice starts MUTED") and `liveDrillSolo.test.js`. `/courses/` is generated, so the course site links here only through the Course Planner. **Find a topic** (the search box on `/drill`, every hub page and the host's setup) is `utils/liveDrill/search.js`: an index of every playbook of every `DRILLS` entry (title, section, name, blurb — the bank's own words) plus an `ALIASES` map for what people type (SOHCAHTOA, FOIL, PEMDAS, y=mx+b, times tables); every typed word must hit, directly or through its aliases, "chapter 9"/"module 11"/"unit 2" pins the drill NUMBERED so (`unitOf` reads the number from the title — "module 1" used to answer with all thirteen "Algebra 1 · Module N" drills), and a section outranks its Whole Module. **Two courses teach the same topic** ("completing the square" is Algebra 1 Module 11 and Algebra 2 Unit 4), so both pickers send the course page they are on (`&hub=`; the host sends its course tab) and a match in that course goes first when it is comparable to the best one (`HOME_SHARE`, half its score) — only comparable, because a dozen weak mentions promoted wholesale pushed the one real lesson, in the other course, off the list. It re-orders and never filters; the Arcade sends no hub and gets best match first. Served public at `GET /api/live-drill/solo/search?q=`; a result names its hub, so the solo page jumps to the other course's page with `?game=&book=`. A new bank is searchable the moment it is registered — add aliases, never a second catalog. Pinned by `tests/unit/liveDrillSearch.test.js`. **Algebra 2** (2026-11, another teacher's class; no Course Planner site for it): `DRILLS.alg2` → `utils/liveDrill/review/alg2.js`, one native course drill with a playbook per unit of the standard sequence (quadratics & complex numbers, polynomials, radicals & rational exponents, exponentials & logs, rational expressions, functions, sequences & series; 41 templates), on its own hub `algebra2` (`solo.HUBS`, with Math Facts) — `hubFor` sends "Algebra 2 / II / Two" there before the plain-algebra match (geometry still wins over both). Built to the common core of the course, not one teacher's packets; when his unit packets arrive, chapter banks go beside it and onto that hub. Every computed answer is re-solved from the printed question in `tests/unit/liveDrillAlg2.test.js` (the first run caught a completing-the-square prompt with no constant and a stray "(x)" factor choice). **His unit packets arrived 2026-11-18 (Units 0–4)**, so the hub now also carries a review per unit, in teaching order after the course drill: `DRILLS.alg2u0 … alg2u4` ("Algebra 2 · Unit N Review") → `utils/liveDrill/review/alg2Unit0.js … alg2Unit4.js` — Basic Algebra Skills Review, Systems of Equations, Function Algebra, Function Graphs, Transformations of Quadratics; 226 templates. One playbook per LESSON of the packet, labelled `ch: 'N.M'`, so the Section row reads 2.1 · 2.2 · 2.3 and "everything through 2.2" is a pick. The packets' words are the answers' words (each file's header lists them: "Ordered Pair / Infinitely Many / No Solution", the parent functions' names, "turning point (vertex)", "vertical compression by 1/4", a horizontal coefficient kept INSIDE the square with its factor the reciprocal, "compressed by a factor of 3" = a = 1/3) — match them, don't normalise them to a textbook's. The packets are scans (every equation an image), so the banks were built from transcriptions; nothing the packets do not teach was added. Shared pieces: `review/alg2Kit.js` (printing a term/line/system/quadratic the way the packets do, and the figures — `plane` grid with curves and open/closed dots, `table`, `matrix`, the three-piece `zig` graph). Tests: one suite per unit (`tests/unit/liveDrillAlg2Unit0…4.test.js`) on a shared harness, `tests/helpers/alg2UnitKit.js`, which READS a play the way a student does — an evaluator for printed math (`calc`, `same`), and decoders that pull the points of a curve, the dots, a table's cells or a matrix back out of the SVG — so a graph question is checked against what was actually drawn. Every template must have an entry in its suite's `CHECK` (a test fails otherwise). Writing them caught eleven bank bugs before a student saw one: a wrong choice that was also right (a line through the origin, a slope of −1, a y-coefficient of 1, a point with x = 0, a vertex at h = 1), a singular system offered as "one solution", and two shifts that could come out as "down 0". The course drill's playbooks are now labelled `ch: 'Alg 2'`, not "Unit N" — its seven units are the standard sequence's, not this teacher's, and two different "Unit 2"s on one hub is a trap. **The host's setup is THREE PICKS** (2026-11-06, owner: "a teacher would be overwhelmed"): 1 Who's playing (the class; a class on a known course page — `/classes` now returns `hub` from `solo.hubFor(mathCourse, className)` — switches the course tab), 2 What to practice (course TABS from the hubs in order plus one tab per "Any class" drill, i.e. Math Facts; the unit as a DROPDOWN in teaching order, remembered per course in `S.lastUnit`; the section as compact chips with the chosen one's blurb; Find-a-topic folded behind "Search a topic"), 3 How to play (game tiles drawn from the Arcade catalogue `/solo/arcade` — one source of game names and taglines — then the clock), and a one-line summary beside Open lobby. **One naming rule**: `GET /api/live-drill/host/drills` carries each drill's `name`/`blurb` from its hub entry (the words the Arcade and solo page use) beside `course` (`any` for a drill on more than one hub), and `DRILLS` titles follow `<Course> · <Unit> <Kind>` — "Algebra 1 · Module 3 Test Prep", "Honors Geometry · Chapter 4 Review" — never "Alg 1"/"H. Geometry"/"Ch."/"Test" (the lobby and the chat banner print `drillTitle`). `host.js` `settle()` keeps tab and unit consistent; `pickCourseForClass()` follows the class. Pinned in `tests/integration/liveDrillRoute.test.js` and `tests/unit/liveDrillArcade.test.js`. **A SECTION of a module is a pick** (2026-11-10, owner: "5.1, 5.2, etc"): `engine.listSections(drillId)` derives the numbered sections from the labels the banks already print (`BOOKS[*].ch` — "5.1", "5.3–5.5", "2.4, 2.7" via `sectionsOfLabel`; "Mod 5"/"Q1–5"/"+−×÷" cover none), in order, each with the books that cover it; ONLY covered sections are listed — a number the course skips (Module 4 is 4.1, 4.2, 4.3, 4.5 and Module 9 is 9.1, 9.3, 9.5: no 4.4 / 9.2 / 9.4 in the packets, the notes or the tests, checked 2026-11-11) is not a pick, not a greyed button. A section key IS a playbook, and SEVERAL can be chosen (2026-11-11, owner: "more than one section", live and solo alike — "everything through 5.2"): `resolvePlaybook(drillId, key)` → a book, a section (every covering book, `name: 'Section 5.2'`), a comma-joined list of sections and/or books (`'5.1,5.2'` → the union of their books in bank order, `name: 'Sections 5.1 & 5.2'`; the key comes back canonical — known parts only, sections in order, no repeats — so a game's `playbook` is one string however it was spelled), else `all`; `dealPlay` pools a native bank's templates across those books (`prep/kit.js` `makePlay` takes a list) or, for a published page's one-book `makePlay`, lets the seeded draw pick the book — play n stays a pure function of (seed, n). `games.createGame`, `solo.parseDeal` and `/drills`/`hubView` (`sections`) all take it; the lobby, the chat banner and the phone print "Section 5.2". Host setup: a **Section** segmented row under the Unit (Whole module · 5.1 · 5.2 …) where each number TOGGLES and Whole module clears; the chips become **Topic** and narrow to the chosen sections' books ("All of 5.1 & 5.2" first when they cover several); `S.sections` is remembered with the rest. The student's solo page (`drill.html` `#secs`, `solo.js` `sel.secs`) has the same row above its playbook tiles, same keys. Find a topic: "5.2" typed lands on the section itself and "5.1 5.2" on both together (`search.js` `sectionNums` + `multiSection` — exact, so 2.5 never answers 5.2, and section entries show only when a number is typed). A bank's `ch` labels are therefore load-bearing: label every book with the sections it truly covers. Pinned by `tests/unit/liveDrillSections.test.js` |
| **Fluency games & the class leaderboard** (Triangle Congruence Fluency; `/drill/geometry`) | **The bank**: `utils/liveDrill/fluency/congruence.js` → `DRILLS.congruence` ("Honors Geometry · Triangle Congruence Fluency", `scoring: 'facts'` — the Math Facts clocks, +6/+4/+2 at 3 s/6 s — and `graded: true`), on the geometry hub as "Congruence Fluency" (owner 2026-11-12: "fluency with sss, asa, hl, sas, aas, or not congruent … beat your high score … built in class leaderboard. asynch"). One move: two triangles with their marks, name the shortcut. **Six buttons in one FIXED order every play** (`prep/kit.js` `finish` honours `fixed: true` — fluency is a reflex, so the buttons never move); every figure is DRAWN from the case (a fresh triangle, a congruent copy rotated/reflected, ticks/arcs/a right-angle box on the parts the case gives), and the "Not congruent" pictures are HONEST — the second triangle really is a different triangle sharing the marked parts (the other solution of the SSA ambiguous case, a similar triangle for AAA/AA, a different included angle for SS). Books: `basic` (two triangles), `right` (HL, and the right angle as a free pair: hypotenuse + acute angle = AAS, two legs = SAS, a leg + an angle = ASA/AAS, one leg alone = not enough), `shared` (two triangles on side BD: Reflexive counts; SSA still does not), `all`. Each template's `make` returns `marks` beside the play so `tests/unit/liveDrillCongruence.test.js` re-derives the shortcut from the marks alone (rules typed there by hand) and checks the geometry of the pictures. **Server-scored runs** (`utils/liveDrill/soloRun.js`, `runRouter` at `/api/live-drill/run` — public like `/play`, CSRF-exempt, same limiter, owned by the unguessable run id): a drill marked `graded` is dealt from the run's seed, timed from the fetch and graded by the SERVER (the phone never sees an open play's answer) — the ONLY honest basis for a leaderboard, since ordinary solo rounds are self-reported; `POST /run` → `GET /run/:id/play` → `POST /run/:id/answer` → `POST /run/:id/finish`, which files a signed-in student's round as a `DrillResult` with **`graded: true`** (guests are scored the same and saved nowhere). Asynchronous: no host, no code, no class clock. **The class leaderboard** `GET /run/leaderboard?drill&book&seconds`: for every active class the student is in (`EnrollmentCode.enrolledStudents`), classmates' best GRADED rounds at that selection, first name + last initial (what a live game's projector shows the room anyway), top 10 + your rank; a guest or a student in no class gets the empty shape and the page says what to do. The solo page (`solo.js` `startRun`/`answerRun`/`finishRun`, `renderBoard` on the pick screen and the final) uses the run path whenever `hubView` says `graded`; everything else on the page is unchanged. A new fluency game is a bank with `fixed` choices + `graded: true` + a hub entry. Pinned by `liveDrillCongruence.test.js`, `liveDrillSoloRun.test.js` and the run cases in `tests/integration/liveDrillRoute.test.js` |
| **Knockout Arena** (`mode: 'knockout'`, Math Facts, or a fixed-answer drill — see the next row; 2026-11) — the fifth class game, and the only one a student STEERS | Musical chairs in a neon arena: each round the server posts a TARGET and scatters orbs, each a fact ("7×8", "60−4"); there is always ONE FEWER right orb than cars; **ONE orb each and EXACTLY ONE car out a round** (owner 2026-11-18, after the first class games: "still too short of rounds … everyone gets one answer. 1 player eliminated each time" — any-number hoarding, then a cap of two, both ended games in a handful of rounds): a car that takes its orb is SAFE for the round (`maxHold` 1; anything else it touches answers `{ safe }`, right or wrong), the round closes the moment every right orb is taken, and the car left without is out; if the clock runs out on several empty-handed cars only ONE goes — fewest points, then most wrong orbs that round, then the round's seeded coin — and the rest are `spared`. So a class of N plays about N rounds of sudden death (capped at N + `spareRounds`, not by a clock). **Points are the scoreboard** ("more points for finding it sooner"): a right orb pays `points.max` (100) at the round's first instant sliding to `points.min` (40) at its last (`pointsFor`), a wrong orb slows the car and costs `wrongCost` (never below 0); the winner is still the last car running, and the scoreboard is a second race (Top scorer, Quickest draw), the timeout tie-break, and what a game ended early is decided by (`standings`). Rules in `utils/liveDrill/knockout.js` (state on `game.ko` / `player.ko`, plain data so the Mongo shadow carries it; `rearm` restarts its clocks after a deploy). **Who decides what**: the student's device moves ONE car and nothing else — the server never simulates movement. Orbs drift on a path that is a pure function of time (`chipAt`, the SAME arithmetic in `public/js/live-drill/knockout.js` — change both or neither), so nothing about an orb is ever synced; a grab is a CLAIM (`POST /play/:code/grab` `{round, chip, x, y}`) the server checks against the orb's position at its own clock and against how far that car could have driven since its last report (`grabSlack`, `moveSlack`), first claim wins. Whether an orb is right is sent ONLY once the round has closed (`chipView`) — pinned. Other cars are cosmetic: each device reports its position AND velocity ~3×/s, and at once after a bump or a sharp turn (`POST /play/:code/pos` `{x, y, vx, vy}`, velocity clamped to the top speed; its own `carLimiter`, 360/min, mounted ABOVE `playIpLimiter` on purpose — a class behind one school IP would spend the shared ceiling in minutes) and `games.js` `carTicker` fans every car out 5×/s (`CAR_MS` 200) as a `cars` SSE event, outside the state stream (a successful `/pos` is never logged — `logger.isQuietRequest`; a class of 25 sends ~75 a second): `[id, x, y, held, vx, vy, boosting]`, so a screen LEADS each car by its velocity between reports. **Bumper cars** (owner 2026-11-19: "the cars should collide!!! and bounce off each other"): still no server simulation — each device bounces its OWN car off the cars it sees (`bumpOff` in the page: pushed apart, closing speed traded as between equal masses with restitution `bump.e`, never less than `bump.kick`, a `bump.stunMs` coast before the steering takes over), and knocks the other car back on its own screen until that car's report arrives; the two devices make the same call from opposite sides (pinned as mirror images). A SAFE car (holding its orb) is a ghost (`bump.ghostSafe`) — with nothing left to lose it would otherwise ram the cars still hunting. The projector draws sparks where two cars meet. The one server stake: a bounce is capped under `topMult` × speed, the travel the grab check allows between reports, so a car just bumped can still grab (pinned). **POWER-UP ORBS** (owner, same day: "make speed boost a powerup", then "every once in a while a boost can appear on the board as an orb. 100 pt powerup, 50 point powerup, or speed boost"): boost used to be free every 2.5 s; now every round deals power-up orbs (`dealPowerups`, one per `power.per` = 3 cars, at least `power.min` = 2, in `round.powerups` — owner after the first class games: "more boosts"; it was one per six at 50% speed), each `+100`, `+50` or ⚡ by the odds in `power.kinds`, each POPPING IN at its own seeded moment (`at`, between `from` and `to` of the round, spread out) clear of where the fact orbs will be then (their paths are pure functions of time), drifting like one (`chipAt`, `t0` = `at`) and gone `power.life` later (`until`). No screen is told about one before it pops in — `roundView(game, at)` hides it and `armPowerups` schedules a touch for the moment (re-armed by `rearm` after a deploy) — so nobody can park where one is coming. Taken with `POST /play/:code/grab` `{ power: id }` (`pickPower`; `{ boost }` is accepted as the old name): the same `plausible` check as an orb, 409 once it is gone, first claim wins; points go straight onto `pts` (and `bonus`, so they matter in the timeout tie-break), a ⚡ goes in the tank and a full tank of `boost.max` = 2 answers `{ full }` and leaves it; a safe car may take one. Every screen is told who took it (`by`, drawn as "+100 Ana" where it was). Charges are spent with `POST /play/:code/boost` (`fire`: `boost.mult` × speed for `boost.ms`, stamps `boostUntil`, 409 on an empty tank), carry from round to round and are lost when the car goes out. The final screen counts `powers`/`bonus` per driver and names the top power-up hunter (`awards.powers`). The page draws them GOLD (dark glass, gold ring, the prize in gold, a ring running down its time, a blink in its last 2 s) and ON TOP of the fact orbs — a power-up must never read as an answer, nor hide under one. Every number the devices use rides in `tune` (`boost`, `bump`, `power`, `topMult`). **The pit** (owner 2026-11-17: "must keep answering questions to get back in" and "the facts fluency when out should count for something"): an out student answers plays from the game's own deck through the ORDINARY own-pace `currentPlay`/`answer` path (so Math Facts answers are graded, timed, fact-tracked and saved to `FactFluency` like any game); `comeback` (4) right in a row OR `comebackTotal` (8) right in all puts them back at the next round (raised from 3/6 by the owner 2026-11-18 — with one car out a round the pit emptied too fast) — the second route exists so a student stuck on one fact is never locked out; every right pit answer also scores for **Fact Champion** (`benchPoints`: fluent double), a second winner crowned beside the last car and the only thing a benched student plays for once the gate closes. **Clocks**: the teacher's `seconds` is the GATE (how long comebacks stay open; it is what every screen's clock shows) and `secondsPerPlay` is the round length; after the gate it is sudden death, capped by rounds (`spareRounds`); `emptyRounds` rounds in which nobody grabs anything ends an abandoned game. A late joiner starts in the pit. Chips: `makeChips` writes the target every way the bank's facts can (`FORMS`, inside the bank's ranges), distinct first, and the wrong ones are NEAR misses (facts worth a neighbouring number); orbs are BIG (`chipR` 40, the fact sized to the orb — owner 2026-11-18: you have to read them) and dealt clear of every car (`carClear`) and of each other (`chipGap`), so no round opens with a free grab; on the projector a live knockout takes the whole screen (`.wrap:has(... .mode-knockout)`); of Math Facts, books `all/add/sub/mul/div` only — `createGame` refuses anything `knockout.playable(drill, book)` does not allow with a 400 and the host's setup greys Open lobby with a note. Client: `knockout.js` `mount(canvas, opts)` is one arena on one canvas — with `opts.me` it is a student's view (keys/touch steer; the BOOST button, space or a second finger spends a charge — a quick tap no longer boosts), without it the projector (every car named and in its own colour). **Every screen shows the WHOLE arena** (owner 2026-11-19: "they should be able to see the whole arena view from their screen. The zoom was too much" — the follow camera that zoomed in, and its edge arrows, are gone): `fitView` fits it, and a PORTRAIT phone turns it a quarter (`rot`) so its long side runs down the screen (about half again as big), with steering turned back (`screenToWorld`) so a drag goes where the finger goes and all text drawn upright (`upright`); a fact is never under `MIN_FACT_PX` on screen. A wide screen (a Chromebook) gives the arena the full height and puts the number in the left strip and BOOST in the right (`layout`); otherwise the number gets a band on top and the button a band below. Your car is the gold one inside a breathing ring ("YOU" only for the first seconds of a round — it, and the old "= target" tag, covered orbs). `fitView`, `screenToWorld`, `bumpOff`, `chipAt` are exported for node and pinned in `liveDrillKnockout.test.js`. **It has to run on a school Chromebook** (owner 2026-11-19: "students had issues with lagging"): measured in a CPU-throttled browser with 26 cars, per-frame canvas blur (`shadowBlur`) halved the frame rate (a phone 16 fps → 50+ without it). So NOTHING is blurred on the live canvas: the floor, grid, lines and glowing wall are drawn once per layout into `arenaCache` (`arenaLayer`) and copied each frame; each fact orb (glow, core, ring, fact) and each kind of power-up is drawn once into a cached picture (`sprite`/`stamp`, keyed by id and scale, cleared each round); every other glow is a second, wide translucent stroke; the canvas is measured on a resize (`ResizeObserver`), not every frame; and `governor` drops the drawing resolution (dpr 2 → 1.5 → 1) on a device that stays under ~33 fps for two seconds. A new effect follows the same rule — `ctx.shadowBlur` on the live canvas fails the "nothing is blurred per frame" pin. **On a phone the arena is the whole screen** (`#live.driving .arena` is `position:fixed` under 700 px, so the canvas draws its own "N left" and gate clock; the page's score strip is hidden while driving). **The projector's "Hide scoreboard"** (`#ko-wide`, or H; remembered per computer as `mm-ko-wide`) drops the side panel and the score strip so the arena takes the screen, and the canvas then draws who is left and the gate (`pitch.hud(on)`); the look (night arena, neon lines, rocket cars, boost flame) is drawn entirely there, no image files. `play.js` `knockoutLive` shows the arena while `st.knockout.in` and the ordinary play screen in the pit; `host.js` `renderKnockout` / `renderKnockoutFinal`. Phones stay silent as in every class game; the projector cues are existing `SND` calls. Pinned by `tests/unit/liveDrillKnockout.test.js` (every chip re-solved from its text; the open round leaks nothing; the plausibility checks; the pit; snapshot/hydrate; a bot simulator — a class always finishes, and knowing the facts beats driving into the nearest orb) and the knockout case in `tests/integration/liveDrillRoute.test.js`. Checked by eye in headless Chrome, like the hill |
| **Knockout Arena with other content: LABEL ROUNDS** (Triangle Congruence in the arena; 2026-11-20) | Owner: "Can Knockout arena handle other content from my courses … Little ASA and SSS SAS HL orbs and a space for a diagram", then "maybe a little built in think time for each new question." A drill whose every play has the same few SHORT answers is marked `arena: 'labels'` in `engine.js` `DRILLS` (today: `congruence`) and plays the arena with the question and the orbs swapped round: **every car gets its OWN diagram and the orbs carry the answers** (SSS · SAS · ASA · AAS · HL · Not ≅ — a bank's `ORB` map shortens an answer for an orb). One diagram for the whole room was the first idea and is wrong on purpose: it is one shout ("it's SAS!") and nobody else thinks. Everything is in `utils/liveDrill/knockout.js` beside the facts game, keyed on `kindOf(game)` / `round.kind`: `questionFor(game, player, n)` deals a play of the game's bank from seed `${game.seed}:arena:${player.id}` — a pure function, cached per game in a WeakMap keyed by (seed, player, round) — the seed is in the key because "Run it back" reseeds the SAME game object — and NEVER in the snapshot, so a deploy re-deals the same pictures; `labelChips` puts out THE SAME NUMBER of every label — as many as the most-needed one needs, so every car's answer has an orb and the counts say nothing about which answer is likeliest (QA 2026-11-21: 8 SAS orbs beside one of everything else told a student who could not read the figure where to drive); the arena grows with the orbs (`TUNE.label.orbsPer`) (`ok`/`val` are null — an orb is right only FOR A CAR: `grab` compares its text to that car's `label`), and a wrong grab stings (slow, `wrongCost`) without using the orb up. Still one orb each and one car out: the round closes when all but one car is safe. **Think time** (`TUNE.label.thinkMs`, 4 s; label rounds only — Math Facts rounds open live): `round.goAt`; `grab` and `/boost` are 409 before it, power-ups pop in after it, the round's length and the points clock run from it (reading the picture is never on the clock), and the orbs HOLD STILL until it (`t0 = goAt`, and `chipAt` clamps time at 0 in BOTH files — four seconds of drift used to stack them before anyone moved). **What a screen may see**: `playerKnockout` sends a car `q = { n, fig, ask }` and adds `{ label, answer, tell, got }` only once the round has closed; the car that round knocked out gets it too (`inRound`), and `play.js` holds the arena up for that student through the reveal (`reveal` in `knockoutLive`: no pit play is dealt behind it) — never hide the figure on `in`; `chipView(c, closed, mine)` marks orbs right or wrong for THAT car; the projector is sent no question while a round is open. The teacher gets `hostKnockout.look` ("One to look at": a question someone missed last round, its answer and the bank's tell, no name — up from the reveal through the next think) and `final.knockout.labels` (per answer: asked, found, `wrong` = drove into another label, `none` = never touched an orb — kept apart, because a round's last car is always empty-handed and may only have been slowest — "Which answers gave trouble"). The pit is the bank's ordinary graded plays (`trackFacts` is off for these drills, so nothing is written to a fact record; the lobby says Pit Champion). Client (`public/js/live-drill/knockout.js`): the diagram is a DOM box over the canvas (`#p-fig`, `syncFig` — written only when something changes, never per frame): LARGE in the middle through think time with a countdown, then in its seat — on a wide screen the arena sits to the right and the figure and BOOST share ONE left strip, on a phone it gets a band on top (`layout(world, target, labels)`); at the reveal its border and caption say "✓ It was SAS". The car is held and the orbs dimmed until GO; the projector's slab reads THINK n, then FIND YOURS. `rules(game)` carries `kind`, `thinkSec`, `orbs` and the lobby renders those (`common.js` `knockoutRulesHTML`); `/host/drills` carries `arena` (`'labels'`/`'facts'`) and `host.js` `koOk` reads it. **A new one** is a bank with `fixed: true` choices whose every play has a figure and the same ≤ 8 answers of ≤ 6 characters on an orb (give long ones an `ORB` short form), plus `arena: 'labels'` on its `DRILLS` entry — the "every drill marked for the arena" test walks all of them. Pinned by `tests/unit/liveDrillKnockoutLabels.test.js` (own question per car; orbs cover every need; think time; nothing leaks while open; right for one car and wrong for another; all-but-one closes; look and the final table; snapshot/hydrate; a simulator in which reading the diagram beats driving into the nearest orb) and the label case in `tests/integration/liveDrillRoute.test.js`. Checked by eye in headless Chrome on a phone, a Chromebook and the projector |
| **Every game, played ALONE: computer rivals** (`/drill/<hub>` → How to play; 2026-11-21) | Owner: "Possible to allow all of the games to be played individually without a class?" All five are contests, so a student alone needs someone to play. A solo game is an ORDINARY game (`games.js` — same rules, clocks, grading, views, and the same `/play` screen) with one human seat and a few seats filled by the computer: `utils/liveDrill/rivals.js`. `game.solo = { level, hub, humanId, saves }`; `hostId` is `solo:<device>`, so no teacher route can see, start or end one. **A rival** is a seated player with `player.bot` and a 🤖 after its name — never passed off as a classmate. It plays ONLY through the doors a phone uses (`currentPlay` / `answer` / `openSafe` / `pickTarget` / `grabChip` / `reportPosition`), so every rule binds it as it binds a student: timed from when its play was dealt, locked by an alarm, robbing or rolling a boulder only at someone above. It is a model of a student, not an oracle: right with probability `acc`, thinking `pace` × the drill's FAST tier (never under `THINK.floor`), blinded by a smoke bomb (`fogged`). `LEVELS` easy / medium / hard (0.55·1.7, 0.7·1.25, 0.88·0.9), spread within a field by `SPREAD` so there is someone to chase and someone to stay ahead of; `RIVALS` = how many each game seats (Team Drive and Huddle are one against one; hill and heist 5; arena 7). Calibrated by simulation and pinned: a typical student (70%, about the fast tier) beats Easy most of the time, splits Medium, loses to Hard, and a strong one beats Hard. One clock per game (`tick`, 5×/s, on the game's own timer set so `endGame` stops it) walks each rival's state machine: `paceTick` (drive, hill, heist, and the arena's pit), `huddleSeat`, `carTick`. **Knockout Arena is the one place the server moves a car**: a rival has no device, so `carTick` is its device — it "reads the board" (`ARENA.read`), drives at under cruising speed, and claims an orb through the ordinary `grab` from where it really is; its position rides the ordinary `cars` frames. Rivals leave power-ups for the student. **The student runs the game**: `POST /api/live-drill/play/solo` (public, CSRF-exempt like the rest of `/play`; `soloGameLimiter`) opens it in the LOBBY and returns an ordinary seat; `POST /play/:code/begin` starts it (so no clock runs while a page loads), `/next` deals the next Huddle play (reading the reveal is not on a clock; `REVEAL_MAX_MS` is only the fallback), `/again` runs it back at any level — all three refuse anyone but the human of a solo game (403), so a class game can never be started from a phone. **Housekeeping**: its own ceiling (`MAX_SOLO_GAMES` 400 — the class ceiling counts class games only, so practice can never block a teacher); one per device (opening another drops the last); a student whose screen has been closed `AWAY_MS` (45 s) ends it; swept `SOLO_TTL_MS` (10 min) after it ends; NEVER shadowed to Mongo (`store.js` skips `game.solo` in `schedule`, `forget` and `handoff` — rivals would write it every second), so a deploy ends a solo game and the screen says "Start another one". **Records**: a signed-in student is seated under their account, so Math Facts answers fold into `FactFluency` like any game, and `G.onGameOver` files `rivals.result(game)` as a `DrillResult` with `graded: true` and **`mode`** (new field: '' = the classic drill). A versus score is that game's own number (yards, height, cash, arena points), so every personal best and class leaderboard query carries `CLASSIC` (`mode ∈ [null, '']`), and `practice.js` reads best / first / last / movement from classic rounds only while rounds, minutes and recency count both (`versus` on each game). A guest plays the same game and nothing is kept. **Client**: `solo.js` `renderModes` (tiles from the Arcade catalogue plus "On your own"; Knockout greyed where `hubView().games[].arena` says the playbook cannot build orbs; level seg; `startVersus` stores the seat where `play.js` looks for it, or passes it in the hash) and `play.js` on `st.solo`: a Start button in the lobby, Next play on a Huddle reveal, Play again with a level picker and "Pick another game" on the final, Quit while playing. **Adding a game type** needs a `RIVALS` count and a branch in `tick`; **changing difficulty** is `LEVELS` — re-run the "three levels" tests, which are the calibration. Pinned by `tests/unit/liveDrillRivals.test.js` (44 tests: all five games to the end; not an oracle; the levels; Huddle waits; housekeeping; what is filed) and the "played alone" block in `tests/integration/liveDrillRoute.test.js`. Checked by eye in headless Chrome |
| **Mathmatix Arcade** (`/arcade`, also `/games` — the one front door to every game) | `public/arcade.html` + `public/js/live-drill/arcade.js` (not bundled; styles in `live-drill.css` under "Mathmatix Arcade"), public. The catalogue is `utils/liveDrill/arcade.js` served at `GET /api/live-drill/solo/arcade`: `GAMES` (the five class game types — ids MUST equal `games.js` `MODES`; the Host button opens `/live-drill?mode=<id>`, which `host.js` preselects), the solo hubs from `solo.hubList()` (never a second course list) and `TESTS` (ACT/SAT/PreACT public pages). `GET /api/live-drill/solo/me` carries `teacher` so a teacher sees Host buttons and a guest sees "your teacher hosts this"; a signed-in student gets a Live-now strip from `/api/live-drill/mine`. The join box goes to `/play?code=`; Find-a-topic is the same `/solo/search` index, results link to `/drill/<hub>?game&book`. `/play`, `/drill`, the host page and the teacher dashboard's Live Drill card link back to it. Pinned by `tests/unit/liveDrillArcade.test.js` and the Arcade case in `tests/integration/liveDrillRoute.test.js` |
| Who is using the Two-Minute Drill (site-wide pull) | `utils/drillUsageReport.js` → `GET /api/admin/reports/drill-usage?days=30[&format=csv]` (admin; every student read FERPA-logged as an export) and `npm run report:drill -- --days=30 [--out=file.csv] [--json]` for a Render shell. One row per signed-in student from the two durable drill records: solo rounds (`DrillResult`, SELF-REPORTED scores — effort and recency are real, scores are not assessment evidence) and live Math Facts fluency (`FactFluency`, server-graded). A live class game in any OTHER drill leaves no per-student record (the game shadow expires in 3 h) and guests are nowhere — the report's `caveats` say so; don't quote a number without them. The teacher's per-class views are `/drill-practice` and `/fact-fluency`. Pinned by `tests/unit/drillUsageReport.test.js` and (real Mongo, CI) `tests/integration/drillUsageReport.test.js` |
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
- **Every student course opens with a placement, and placement CLOSES MODULES.** Which one is
  `utils/courseDiagnostic.js`: ACT/SAT prep → a full practice test (the only blocking ones);
  Algebra 1/2, Pre-Calculus, both Calculus → the Starting Point; every other course → its own quick
  check (`GET/POST /api/course-sessions/:id/preassessment`) — but only where the bank can build one
  (`coursePlacementService.preAssessmentAvailable`: every skill of the course's first module has
  items); otherwise the Starting Point, never a dead end. Parent guides are not placed. **The bank is keyed by BANK ids, courses by
  COURSE ids** — every lookup goes through `skillLookupCandidates` (`bankForCourse`); querying by the
  course's own ids found nothing and produced "No pre-assessment available" in production while the
  old route test, which seeded items under course ids, stayed green. What a placement proves is
  applied by `utils/coursePlacement.js` `applyPlacement` (after the quick check, at enrollment, and
  after a Starting Point via `applyPlacementToActiveCourses` in `routes/screener.js` `/complete`): a
  module closes (`placedOut`) when the student owns EVERY skill in it (`skillRung.clearsPrerequisites`
  — the ladder's one definition of owned), a checkpoint only when everything before it is done, the
  last module never; it never touches a module in progress and only moves the course forward. A
  module the student only partly owns stays open and the tutor spot-checks the owned skills
  (`coursePrompt` "ALREADY PROVEN"). **The quick check runs in STAGES**
  (`coursePreAssessment.buildStageBlueprint`): each GET serves every skill the student does not yet
  own in the next open module(s), two items a skill, up to ten skills; a clean stage closes those
  modules and offers the next (`canContinue`), the first miss is where the course starts, and a
  module with a skill the bank cannot test ends the check. It used to sample ~10 skills across the
  whole course, so a perfect run owned a skill or two in each module and closed none. Items come
  from the live bank through `coursePlacementService.pickItems`: text-only (no `svg`/`figure`, no
  "the figure shown"), graded CLEANLY by the real grader (`isCheckable` — exactly one right option,
  or its own answer accepted; ~30 of the bank's 21,797 items are not), tutoring bank first and the
  practice-test banks (`act-*`, `sat-*`) only for a skill with nothing else, and never one item
  for two skills. An item the old converter gave junk options (options but no `correctOption`,
  a typeable answer) is asked TYPED, as it was written (`servedForm` / `gradeServed`) — its options
  let a guesser through. **The live bank covers every skill of the six quick-check courses** (measured
  2026-11-21 on an export: a student who knows the course is checked out of all but the final
  module in 4-5 stages) — but `docs/mathmatixdb.problems.json` in this repo is an OLD export
  (12,619 of 21,797 items) and says otherwise; do not size a content gap from it. Pinned by
  `tests/integration/coursePlacementClosesModules.test.js` (real Mongo, CI).
- **A course's check tests a skill from ITS OWN items where the course has them — never from the
  crosswalk's pool (2026-11-22).** The crosswalk points each course skill at the nearest large pool,
  and for ~70 skills of the six quick-check courses that pool did not test the skill: 8th-grade
  cylinder/cone/sphere volume → prism items, "ordering real numbers" → "Order 14, 16, 6" (preK),
  rigid transformations → shifting y = x², four Geometry circle skills → the equation of a circle,
  7th-grade unit rates → "travel 15 apples in 7.5 bags". Those skills now have 12 items each
  (3 tiers × 4, difficulty 2–4), written at the course's level: templates in
  `scripts/lib/courseLevel*.js` (one file per course; `courseSkill` = the course's id, `skillId` =
  the bank id), built by `npm run build:course-level` into `seeds/course-level-items.generated.json`
  + `seeds/course-level-sources.generated.json`, seeded by `npm run seed:course-level` (also a
  `seed:all` step). `utils/courseCheckSources.js` reads the sources files (the generated one plus
  `course-level-sources.manual.json` for a better pool that already exists) and
  `coursePlacementService.bankForCourse` uses a listed skill's ids AND NOTHING ELSE — so with the
  items not seeded the skill is untestable and the check stops there; it never falls back to the
  old pool. The override is per COURSE (8th grade's `transformations` ≠ Algebra 2's). That strict
  rule is the two course checks'. The surfaces that practise a skill with no course in hand —
  spaced review (`routes/review.js` `findProblemForSkill`), practice packs
  (`routes/practicePack.js`) and the mastery test-out (`routes/mastery.js` `/challenge`) — ask
  `atLevelIdsFor(skillId)` and PREFER those items, falling back to the crosswalk when the bank
  holds none (practice with an imperfect item beats none). Every item must pass `isCheckable` (the builder refuses otherwise — so no "figure",
  "shown", "diagram" in a prompt) and each template file has a `tests/unit/courseLevel*.test.js`
  that RE-SOLVES every item from its printed text. To fix another skill: add a template, rebuild,
  commit both seed files, re-seed. Pinned by `tests/unit/courseCheckSources.test.js` (seed files
  current, every override a real course skill) and the "tested from those alone" block of
  `tests/integration/coursePlacementClosesModules.test.js`.
- **"I think I already know this!" and "Start over" (courses, 2026-11-21).** The lesson tracker
  lists the current unit's skills (`lesson-progress` → `progressUpdate.skills`, names from
  `utils/courseSkillLabels.js` — course skills mostly have no Skill document, so the seed files
  name them) with a button on each one the student does not own
  (`lessonTracker.js` `_renderSkills`, chat-js3 bundle). It runs the course's ONE-SKILL CHECK,
  `GET/POST /api/course-sessions/:id/skill-check/:skillId`: five checkable items, no hints, one
  shot, every item answered and all right; the server grades only the items it served
  (`session.skillCheckServed`) and clears them, so a submission cannot be replayed. A pass proves
  the skill (`via: 'challenge'`) and runs `applyPlacement`, so the unit closes when that was its last
  skill. It reuses `challengeCard.js` (`MMChallengeCard.launch(skillId, { base })`); it is NOT
  `/api/mastery/challenge`, which needs a Skill doc. **Start over** (`POST /:id/restart`, the
  catalog card's button; not offered for test prep): every module back to locked, progress and its
  floor to 0, a NEW conversation, and `fromTheBeginning: true` — while that is set nothing the
  student already owns closes a module (`placeSession` stands down), the tutor's "ALREADY PROVEN"
  shortcut reads only `session.skillsProvenHere` (skills re-proved since the restart), and a
  one-skill check may close only that skill's own unit. Their skill record is never erased.
  Pinned by the last two blocks of `tests/integration/coursePlacementClosesModules.test.js`.
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
- **Which option of a multiple-choice item is right is ONE decision: `mcOptions.resolveKey`.** Both
  graders use it — `answerComparison.compareAnswer` (behind `problem.checkAnswer()`: practice,
  review, tests) and `skillChallenge.gradeOne` (the mastery test-out, the course checks). The key is
  the one option whose text IS `answer.value`; else the option `answer.value` names by letter; else
  `correctOption`; else the one option equal in value to the answer. An option whose text the author
  wrote into `equivalents` is right too ("1" beside "2/2"); equal in value alone is not ("81" is not
  "80 + 1"). They used to decide separately, and on the live bank (2026-11-22, 18,226 MC items):
  72 items whose `correctOption` contradicts their own answer had the RIGHT pick marked wrong by
  `gradeOne` and a wrong pick accepted by `compareAnswer`; a letter key with its text as an
  equivalent passed up to all four options; a fraction key against a rounded-decimal option passed
  none. Anything that SHOWS the key after grading uses `keyLabelOf(problem)`, never
  `correctLabelOf` (which reads `correctOption` alone and is only for translating a stored letter
  to its position). The stored letters themselves are repaired by `scripts/fixMcKeyDefects.js`
  (re-solves each key from its prompt; `--write`), and the handful of items with no single right
  option (bimodal "find the mode") are retired by `npm run retire:ungradable-mc` (dry run;
  `--apply`). Pinned by `tests/unit/mcKeyResolution.test.js`, on items copied from the export.
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
- **On teacher surfaces, "active" means WORK and "mastered" means PRACTICED.** A conversation's
  `lastActivity`/`activeMinutes` move whenever the chat page is open, and `status:'mastered'` is also
  true of placement, inference and evidence-free seeds. Measured on prod 2026-11-17: a roster's 42
  "active this week" were 4 who had talked to the tutor, and its 258 "mastered" were 10 practiced +
  248 placed out. `utils/studentActivity.js` carries two clocks (`lastActiveAt`/`weeklyMinutes` =
  presence, `lastWorkedAt`/`workByWeek` = a message, test module, activity check or drill) and
  `utils/skillSummary.js` splits `mastered` from `placedOut` via `parentSkillPicture.classifySkill`.
  Every teacher count — roster, `/classes`, course progress, skill gaps, the Teaching Aide — reads
  those two, and the live feed's percentage is `firstTryCorrect/firstTryAttempted` (retries and
  skips excluded). Per-student teacher routes authorize with `teacherHasStudent()` (roster: direct
  OR class code) — a `{ _id, teacherId }` lookup refuses every class-code student, silently. Pinned
  by `tests/unit/teacherDataAccuracy.test.js`.
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
