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
| **LLM (runtime)** | **Provider-agnostic, currently all OpenAI** (`gpt-4o-mini` chat, `gpt-4o` vision grading, `text-embedding-3-small`). The tutor's generate stage is env-switchable via `TUTOR_MODEL`; as of **2026-08-18 production runs `gpt-4o-mini`** — the Claude path is wired but dormant. See §7. |
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

> **`TUTOR_MODEL` is the one switch, and it is currently unset / `gpt-4o-mini`.** Which means: every
> LLM call in the app is OpenAI today. Don't read the Claude machinery below as describing a live code
> path — it's a dormant capability. (This note has been wrong in *both* directions historically; check
> the Render env before trusting any statement about which model prod runs.)
>
> `utils/pipeline/generate.js` reads `PRIMARY_CHAT_MODEL = process.env.TUTOR_MODEL || 'gpt-4o-mini'`,
> and `utils/openaiClient.js` dispatches to `utils/anthropicClient.js` whenever the model id starts with
> `claude`. That adapter is a full drop-in for `callLLM` / `callLLMStream` / `callLLMStructured` and
> normalizes Claude's request/response/stream shapes into the OpenAI ones the rest of the app consumes,
> so the pipeline stays provider-agnostic and the switch is a one-env-var flip in either direction. It
> also prepends a **child-safety system prompt** on every Claude call (Anthropic requires it for
> products serving minors) — provider-scoped, the OpenAI path is unchanged. Also dormant while
> `TUTOR_MODEL` is OpenAI: the Claude prompt-cache breakpoint in `promptCompact.js`, and the
> `TUTOR_FALLBACK_MODEL` cross-provider failover (there's no second provider to fail over *to*).
>
> Always OpenAI regardless of `TUTOR_MODEL`: **vision grading** (deliberately — `llmGateway` calls the
> OpenAI SDK directly for it), **embeddings**, `llmGateway`'s `DEFAULT_MODELS` for any caller that
> doesn't pass a model explicitly, and every hard-coded `PRIMARY_CHAT_MODEL = 'gpt-4o-mini'` outside
> generate.js (`pipeline/verify.js`, `routes/chat.js`, `routes/courseChat.js`).
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
   **tiered**: `gpt-4o-mini` first, escalating to `gpt-4o` when it can't resolve (low confidence / parse
   fail) instead of silently giving up. Outcomes (incl. the `unverifiableRate`) are tracked in
   `utils/verifyMetrics.js`, surfaced on `GET /api/admin/structured-tutor-metrics`.
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
- **`utils/llmGateway.js`** is the single entry point. It does **PII anonymization** (strips student
  names → `[Student]` → rehydrates) before/after the API call. Routes/pipeline should call this, **not**
  `openaiClient` directly.
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
(multer → Sharp EXIF-strip → Mathpix → injected into prompt as context).

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
- **Feature flags / shelved**: whiteboard panel (`MM_FEATURES.boardPanel`, default off — tutor work
  shows as inline chat cards instead), voice-mode-in-chat, course catalog UI.

---

## 9. Cross-cutting concerns

- **Security**: helmet/CSP+nonce, custom **double-submit CSRF** (`middleware/csrf.js`, constant-time),
  rate limiters (`authLimiter` 5/15m, `signupLimiter`, `apiLimiter` 300/15m, `aiEndpointLimiter`,
  trial 30/hr), prompt-injection middleware, upload validation + 30-day auto-delete, optional
  AES-256-GCM field encryption (`FIELD_ENCRYPTION_KEY`).
- **Compliance (FERPA/COPPA)**: `consentGate`/`consent.js`/`consentManager.js`, `ferpaAccessLog`,
  `dataPrivacy.js` (export/delete/amend), `dataRetention.js`, PII anonymization in the LLM gateway,
  `impersonation.js` (read-only, 20-min timeout, fully audited).
- **Billing/gating**: `routes/billing.js` + `middleware/usageGate.js`. Free = 30 AI-min/wk (students);
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
| Auth / roles / SSO | `auth/passport-config.js`, `middleware/auth.js`, `services/cleverSync.js` |
| Billing / plans | `routes/billing.js`, `middleware/usageGate.js` |
| Teacher/parent/admin dashboards | `routes/{teacher,parent,admin}.js` + matching `public/*-dashboard.html`/`.js` |
| Chat UI / rendering | `public/js/script.js`, `public/js/inlineChatVisuals.js`, `public/css/chat*.css` |
| Tutor teaching-quality regression / evals | `tests/eval/` — replayed-bug scenarios + behavioral personas through real observe→diagnose→decide; heuristic + LLM judges; live tier via `RUN_LLM_EVAL=1 npm run test:eval:live`. The judges themselves live in `utils/replyJudges.js` / `utils/replyLlmJudges.js` (shared with prod; tests/eval keeps shims) |
| Transcript mining (nightly prod tutor-quality sweep) | `utils/transcriptMiner.js`, `scripts/mineTranscripts.js` (`npm run cron:mine-transcripts`), `GET /api/admin/tutor-quality-report`; doc: `TRANSCRIPT_MINING.md`. Findings are candidates for human review, never auto-actioned |
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
- **Use `llmGateway`, never `openaiClient` directly** from routes — you'd bypass PII anonymization.
- **`config/middleware.js` order matters** — Stripe raw-body must precede `express.json`; CSP nonce
  must precede helmet; CSRF after session.
- **Per-user chat lock** in `routes/chat.js` serializes a user's concurrent messages — don't remove it.
- **Math-answer injection gate**: the verified answer is injected into context **only** on an
  `ANSWER_ATTEMPT`, never when the student is *asking* — preserve this or you'll leak answers.
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

---

## 13. Where the design intent lives (`docs/`)

Start with `SITE_OVERVIEW.md` (feature catalog) and `STUDENT_UX_FLOW.md`. Then by area:
pedagogy → `PEDAGOGY_ANALYSIS_AND_RECOMMENDATIONS.md`, `MATH_SKILLS_VERTICAL_ALIGNMENT.md`,
`DUAL_MODE_SYSTEM_DESIGN.md`; assessment → `PLACEMENT_TEST_SYSTEM.md`; gamification →
`BADGE_SYSTEM_DESIGN.md`, `MASTER_MODE_BADGE_SYSTEM.md`, `PATTERN_BADGE_GUIDE.md`; whiteboard →
`WHITEBOARD_AI_INTEGRATION.md`, `BOARD_LLM_STAGE_DESIGN.md`, `CHAT_BOARD_AI_INTEGRATION.md`;
security/compliance → `SECURITY.md`, `STUDENT_DATA_SECURITY_AUDIT.md`, `CSRF_PROTECTION.md`;
cost → `AI_COST_PROJECTIONS.md`. **Docs describe intent and may lag code — verify against the source.**
