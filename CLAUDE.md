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
| **LLM (runtime)** | **OpenAI only** — `gpt-4o-mini` (chat/teaching), `gpt-4o` (vision grading). See §7. |
| Voice STT | Deepgram (`nova-2`/`nova-3`), Whisper-1 fallback |
| Voice TTS | Cartesia (`sonic-2`), streaming over WebSocket |
| Math OCR | Mathpix (`/v3/text`, `/v3/pdf`) |
| Math render | KaTeX + MathLive (client); JSXGraph for interactive diagrams |
| Auth | Passport (local, Google, Microsoft, Clever SSO) |
| Billing | Stripe (subscriptions + school licenses) |
| Storage | AWS S3 (or R2/Spaces/MinIO via `S3_ENDPOINT`) |
| Email | Nodemailer (SendGrid/SES/Postmark) |
| Observability | Sentry + Winston + Better Stack (Logtail) |
| Frontend | **Vanilla JS + Vite** (multi-page, no SPA framework) |
| Hosting | Render (Docker); Puppeteer headless-shell + Python3/matplotlib in image |

> ⚠️ `ANTHROPIC_API_KEY_*` appears in `.env.example`, but **Claude is not wired in at runtime** —
> the only reference (`utils/pipeline/llmVerifier.js`) is a comment about a *future* swap. Treat the
> app as OpenAI-only until that path is actually built.

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
models/      (34)      Mongoose schemas — see §6
routes/      (77)      HTTP surface, grouped by domain — see §5
services/    (7)       chatService · sessionService · assessmentService · userService ·
                       aiService(legacy) · cleverApi · cleverSync
utils/       (160)     The brains: pipeline/, prompts, learning engines, voice, OCR — see §7
public/      (~1220)   Vanilla-JS + Vite frontend — see §8
scripts/     (85)      Seeding, data migration, problem/skill gen & QA, crons — see §10
seeds/                 Skill/problem/curriculum seed JSON (incl. pattern skills)
docs/        (65)      Design docs + data dumps (skills.json, problems.json)
tests/                 unit/ · integration/ (supertest) · load/ (k6)
Dockerfile render.yaml .puppeteerrc.cjs   Deploy
```

---

## 5. HTTP API surface (`routes/`, registered in `config/routes.js`)

77 files, ~270 endpoints. Guards: `isAuthenticated`, `isAdmin/isTeacher/isParent/isStudent`,
`aiEndpointLimiter`, `usageGate`, `premiumFeatureGate`. Roles checked via `user.roles[]` (array,
preferred) with fallback to legacy `user.role` (string).

| Domain | Key files |
|--------|-----------|
| **Chat/tutor core** ⭐ | `chat.js` (the main endpoint), `conversations.js`, `courseChat.js`, `trialChat.js`, `voiceTutor.js`, `voice.js` |
| Assessment | `screener.js` (IRT placement), `assessment.js`, `growthCheck.js`, `checkpoint.js`, `mastery.js` (badges), `review.js` |
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
   (~30% of topics, fast/exact) **and** an LLM verifier (`pipeline/llmVerifier.js`, `gpt-4o-mini`) for the rest.
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
  `max_completion_tokens` vs `max_tokens` per model). 35 files import one of these two.

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
npm run seed:playground / seed:test / seed:skills   # seed data
```

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
| Mastery / badges | `routes/mastery.js`, `utils/{masteryEngine,badgeAwarder,patternBadges}.js`; docs: `MASTER_MODE_BADGE_SYSTEM.md`, `PATTERN_BADGE_GUIDE.md` |
| Skills/problems data | `models/{skill,problem}.js`, `seeds/`, `scripts/generate*.js` + QA scripts |
| IEP / accommodations | `models/iepPlan.js`, `routes/iepTemplates.js`, `utils/iepTemplates.js`; docs: `IEP_*` |
| Voice | `routes/voiceTutor.js`, `utils/{voiceSession,sttStream,ttsStream}.js` |
| Whiteboard / board commands | `utils/{boardCommandGuard,boardResponseSchema}.js`, `pipeline/board*.js`; docs: `WHITEBOARD_*`, `BOARD_LLM_STAGE_DESIGN.md` |
| Auth / roles / SSO | `auth/passport-config.js`, `middleware/auth.js`, `services/cleverSync.js` |
| Billing / plans | `routes/billing.js`, `middleware/usageGate.js` |
| Teacher/parent/admin dashboards | `routes/{teacher,parent,admin}.js` + matching `public/*-dashboard.html`/`.js` |
| Chat UI / rendering | `public/js/script.js`, `public/js/inlineChatVisuals.js`, `public/css/chat*.css` |

---

## 12. Gotchas & sharp edges

- **`role` vs `roles`** — dual fields exist; always read via the `hasRole()` helper (`roles[]` first).
- **Use `promptCompact`, not the legacy `prompt.js` body** — the latter is rollback-only and huge.
- **Use `llmGateway`, never `openaiClient` directly** from routes — you'd bypass PII anonymization.
- **`config/middleware.js` order matters** — Stripe raw-body must precede `express.json`; CSP nonce
  must precede helmet; CSRF after session.
- **Per-user chat lock** in `routes/chat.js` serializes a user's concurrent messages — don't remove it.
- **Math-answer injection gate**: the verified answer is injected into context **only** on an
  `ANSWER_ATTEMPT`, never when the student is *asking* — preserve this or you'll leak answers.
- **Conversations >100 msgs are summarized** before hitting the LLM — mind token budgets.
- **IEP is split** (collection + cached copy on user) — update both / sync on read.
- **Skill inference**: mastery can be *inferred* from prerequisites with no cascade-invalidation if a
  prereq later fails — be careful trusting `masteryType: inferred`.
- **Clever sync is non-blocking** — roster failures are swallowed; surface them when debugging "missing students."
- **`render.yaml` ≠ prod config** — it's documentation; real config/crons live in the Render dashboard.
- **Known doc↔code drift** (see `docs/SCREENER_STATE_ANALYSIS.md`): screener grade-based start / theta-reset,
  IEP UI vs schema mismatch, pattern-skill coverage incomplete (~59 of ~204).

---

## 13. Where the design intent lives (`docs/`)

Start with `SITE_OVERVIEW.md` (feature catalog) and `STUDENT_UX_FLOW.md`. Then by area:
pedagogy → `PEDAGOGY_ANALYSIS_AND_RECOMMENDATIONS.md`, `MATH_SKILLS_VERTICAL_ALIGNMENT.md`,
`DUAL_MODE_SYSTEM_DESIGN.md`; assessment → `PLACEMENT_TEST_SYSTEM.md`; gamification →
`BADGE_SYSTEM_DESIGN.md`, `MASTER_MODE_BADGE_SYSTEM.md`, `PATTERN_BADGE_GUIDE.md`; whiteboard →
`WHITEBOARD_AI_INTEGRATION.md`, `BOARD_LLM_STAGE_DESIGN.md`, `CHAT_BOARD_AI_INTEGRATION.md`;
security/compliance → `SECURITY.md`, `STUDENT_DATA_SECURITY_AUDIT.md`, `CSRF_PROTECTION.md`;
cost → `AI_COST_PROJECTIONS.md`. **Docs describe intent and may lag code — verify against the source.**
