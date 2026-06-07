# Stabilization Triage — 2026-06-07

Cold triage of "features that flat out do not work," from a read-only audit (4 parallel
investigators + full test suite). **Foundation is solid: 2,851 / 2,852 unit tests pass**
(the 1 failure is a trivial schema-count test in `boardResponseSchema.test.js`). The core
chat tutoring loop, auth/SSO, and Stripe webhook security are all correct. The breaks are
at the **seams** — config, the parent/monetization path, and half-built features.

Severity: 🔴 broken · 🟠 likely-broken pending prod check · 🟡 degraded/half-built · ⚪ shelved (intentional)

---

## 0. 🟠 VERIFY FIRST — Render env vars (may explain a large chunk)

`render.yaml` does not declare these (dashboard-managed, `sync:false` — can't be seen from
the repo). If any are unset in the Render dashboard, the listed features silently break.
**Verify each in Render → Environment:**

| Var | If unset |
| --- | --- |
| `BASE_URL` (= `https://mathmatix.ai`) | Email-verification links point to `localhost:3000` (dead for everyone); Stripe redirects after checkout go to localhost (blank screen after payment). |
| `CARTESIA_API_KEY`, `DEEPGRAM_API_KEY` | Entire voice tutor is dark — no audio out; "Hear me" preview fails silently. |
| `BILLING_ENABLED` (= `true`) | Whole paywall inert — everyone unlimited, no checkout path. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | No checkout / webhooks. |
| `SMTP_*` | No email at all (verification, reset, progress reports). |

---

## 1. 🔴 Parent / monetization path (the priority — broken AND the revenue blocker)

| # | Issue | Evidence | Status |
| - | ----- | -------- | ------ |
| 1.1 | **No parent captured at signup** — no parent-email field exists in the student signup form, so parent-pays-for-child can never trigger. Root cause of ~95% of students having no linked parent. | `public/signup.html:186`, `routes/signup.js:273` | NEEDS DESIGN DECISION |
| 1.2 | **Parent-linking is built but only reachable during onboarding** — `POST /api/student/link-to-parent` exists & works (`routes/student.js:102`) and is called from onboarding + complete-profile. Gap is NOT the backend: an *already-onboarded* student has no persistent "add a parent" entry point, and the parent dashboard's "Generate Invite Code" relies on the kid redeeming it during a flow they've already passed. Fix = a persistent link-a-parent affordance in student settings (small UI), not new backend. | `routes/student.js:102`, `public/js/onboarding.js:389` | SMALL UI (backend already done) |
| 1.3 | **Weekly progress emails never auto-send** — no cron/scheduler exists anywhere; the "we email your child's progress" hook only fires if run by hand. Also no idempotency → dup emails if run twice. | `scripts/weeklyDigest.js`, no scheduler in `server.js`/`render.yaml` | NEEDS INFRA DECISION |
| 1.4 | **"LIVE NOW" parent indicator never starts on load** — un-awaited `loadChildren()` race; real-time session badge/notification dead unless the parent tab-switches. | `public/js/parent-dashboard.js:1640` | ✅ FIXED (this branch) |

## 2. 🔴 Other confirmed code bugs

| # | Issue | Evidence | Status |
| - | ----- | -------- | ------ |
| 2.1 | **Message reactions 404 every time** — frontend `PATCH /api/chat/reaction` has no matching route; kids get "Failed to save reaction." | `public/js/script.js:4895` (no route in `routes/chat.js`) | TODO |
| 2.2 | **Post-payment is silent** — `success_url` `?upgraded=true` is never handled on chat.html; no confirmation, UI may not unlock until hard refresh. | `routes/billing.js:188`, `public/chat.html` | TODO |
| 2.3 | **Subscription renewal date broken** — reads top-level `subscription.current_period_end`, which moved to `subscription.items.data[0]` in the pinned Stripe API version; cancel/manage screens show no "access until" date. | `routes/billing.js:432,604` | TODO |

## 3. 🟡 Half-built features that make it *feel* broken

- **Visuals run on the unreliable fallback path.** `ENABLE_VISUAL_TOOLS` and
  `STRUCTURED_TUTOR_RESPONSE` are OFF in prod, so the board renders via legacy text-tag
  parsing the code itself calls "unreliable." **Most likely cause of inconsistent whiteboard
  behavior.** (`utils/pipeline/generate.js:41`)
- **Auto re-engagement never fires.** Spaced-repetition / pattern-badge engines compute
  due-dates but no scheduler triggers reviews — so the system that would fight dormancy is
  passive. (`utils/spacedRepetition.js`, `routes/review.js`)
- **"Coming soon" stubs users hit:** teacher reasoning-trace column
  (`teacher-transcripts.js:336`), parent courses tab (`parent-dashboard.js:1528`).
- **Intervention-alerts system fully built but no UI calls it** — invisible to teachers.
  (`routes/teacher.js:1841`)
- Mobile nav Learn/Quests tabs half-built; weekly challenges hidden behind `if(false)`.

## 4. ⚪ Shelved (intentional — low priority, mostly unreachable)

Fact-fluency, celeration charts, manual whiteboard (PDF "coming soon"), surface-preference
voice routing, multimodal assessment. Backend often exists; routes commented out in
`config/routes.js`; not reachable from the student loop.

---

## Recommended order

1. **Verify Render env vars** (§0) — cheapest, possibly collapses several "breaks" to one config fix.
2. **Parent path** (§1) — both the worst breakage and the revenue unlock; same work, two payoffs.
3. **Confirmed bugs** (§2) — small, clean fixes.
4. **Flip/verify feature flags** (§3) — turn on the reliable visual path once its code is on main.
