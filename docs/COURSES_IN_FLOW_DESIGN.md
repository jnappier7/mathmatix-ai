# COURSES-IN-FLOW — Design Doc

> **Status:** Proposal / decision record. Written 2026-07 on branch
> `claude/courses-flow-mathmatix-fn8hq9`.
> **Decision owner:** Jason.
> **One-line:** Make *structure* the default tutoring experience for everyone,
> dissolve the separate "course mode" into the main pipeline, and open courses
> to free users as a conversion on-ramp (usage cap, not a paywall, is the lever).

---

## 1. The decision

Two decisions are now settled and drive everything below:

1. **Structure everywhere.** The default experience is engine-driven and
   sequenced, not purely reactive Socratic chat. The tutor should know "what to
   teach next" for *every* student, not only for students who explicitly enrol
   in a course.
2. **Courses are a free on-ramp.** Free users can browse, enrol, and work
   through courses. Conversion happens naturally: a free student gets pulled
   into a compelling sequence, hits the monthly AI-minute cap mid-module, and
   the upgrade prompt becomes *"keep going with Mathmatix+"* — a warm,
   in-context nudge instead of a cold door-slam paywall. Mathmatix+ removes the
   usage cap; it does **not** unlock structure.

This reverses the current posture, where structure is a walled-off premium mode
you opt into via a gated catalog.

---

## 2. Current state — three overlapping "course" concepts

There is no single "course" in the codebase. There are three, at very different
levels of liveness. This drift is the main risk the rework must retire.

### Layer 1 — the dormant LMS model (`models/course.js`)
Rich, fully-specified schema: `units → lessons → phases (i-do / we-do / you-do)
→ assessments`. **Only `routes/course.js` and `scripts/seedCourse.js` reference
it.** Nothing a student experiences reads it. It is a parallel authoring format
that never got wired to runtime.

### Layer 2 — the live course mode (pathway JSON)
What students actually run:
- Content: `public/resources/*-pathway.json` (modules → scaffold steps →
  checkpoints). ~10 pathways today (algebra-1, geometry, grade-8, AP Calc AB,
  ACT prep, parent mini-courses, …).
- State: `models/courseSession.js` — per-user progress, `currentModuleId`,
  `currentScaffoldIndex`, `progressFloorPct` (bar never moves backward).
- Runtime: `routes/courseChat.js` (`POST /api/course-chat`) →
  `utils/pipeline/courseAdapter.js` → the unified pipeline.
- Prompt: `utils/coursePrompt.js` hard-locks the tutor to one scaffold step
  (`🔒 YOU ARE LOCKED TO THE CURRENT STEP`).
- **Gating:** `/api/courses` and `/api/course-sessions` are behind
  `premiumFeatureGate('Courses')` (browse + enrol = premium). `/api/course-chat`
  is only `usageGate` — i.e. **chatting inside a course is already free** up to
  the cap. The wall is only on the front door.

### Layer 3 — the soft version already in free chat
`buildCourseProgressionCompact()` in `utils/promptCompact.js` reads the *same*
pathway JSON off the student's `mathCourse` field and injects the module
progression as advisory context ("when the student asks 'what's next?' → follow
this progression"). No state tracking, no step-lock — just a nudge.

### Two entry points into course mode
Course context enters through **both** endpoints:
- `POST /api/course-chat` (dedicated, via `courseAdapter`), and
- `POST /api/chat` — which itself branches on `user.activeCourseSessionId` and
  calls `buildCourseSystemPrompt` in three places
  (`routes/chat.js:1021, 1061, 2558`).

So "course mode" is not one code path; it is two, plus a soft third. Unifying
these is most of the work.

### Frontend is already merged
Courses live *inside* `chat.html`: a sidebar course list, a progress bar over the
chat, and an "exit lesson → return to general chat" button. `courseCatalog.js`
switches the client between `/api/chat` and `/api/course-chat`. **The UI merge is
essentially done** — this rework is a backend/pipeline consolidation.

---

## 3. The insight that makes this cheap

The main free-chat flow **already contains the entire structured-teaching
machine** — it just never runs.

- `models/tutorPlan.js` holds `skillFocus[]` (a prioritized skill queue),
  `currentTarget`, and an `instructionPhase` enum
  (`prerequisite-review → vocabulary → concept-intro → i-do → we-do → you-do →
  mastery-check`).
- `utils/tutorPlanManager.js`, `utils/skillFamiliarityResolver.js`, and
  `utils/promptPlanLayer.js` fully implement resolving a target, walking the
  prerequisite chain, and injecting a gradual-release plan into the prompt —
  including `shouldSuppressSocratic()`, which structurally turns off the
  "never give the answer" rule during direct-instruction phases.
- `utils/pipeline/decide.js` calls `applyInstructionalMode()` whenever a
  `currentTarget` exists.

**The gap:** `tutorPlan.skillFocus` is essentially never populated in free chat.
`addSkillToFocus()` has **zero production callers** (only tests). So
`getHighestPrioritySkill()` returns null → no `currentTarget` →
`applyInstructionalMode()` returns null → `decide` falls through to the reactive
Socratic default, every turn.

Course mode "works" only because it feeds the queue externally (via the pathway
scaffold in `courseAdapter`). **Feeding that same queue from signals we already
compute is how structure turns on everywhere — no new engine required.**

---

## 4. Target architecture

One pipeline. One course representation. Structure as an *intensity setting*,
not a separate mode.

```
                 ┌───────────────────────────────────────────┐
                 │            POST /api/chat                   │
                 │        (single tutoring endpoint)           │
                 └───────────────────────────────────────────┘
                                   │
                                   ▼
                 ┌───────────────────────────────────────────┐
                 │              runPipeline                    │
                 │  observe → diagnose → decide → generate →   │
                 │            verify → persist                 │
                 └───────────────────────────────────────────┘
                                   │
        tutorPlan.skillFocus  ◄────┴────►  structureLevel flag
        fed by:                            per turn:
          • screener placement               • 'free'    → engine picks next
          • BKT prerequisite gaps              skill, step-lock OFF
          • FSRS review-due clusters         • 'guided'  → engine picks, softer
          • course pathway (when enrolled)     scaffolding
          • mastery mode                     • 'course'  → queue PINNED to
                                               pathway, step-lock ON
```

- **One representation:** pathway JSON is the winner. Retire Layer 1
  (`models/course.js` + `routes/course.js`) or clearly mark it archived.
- **One endpoint:** collapse `/api/course-chat` into `/api/chat`. Course-ness
  becomes `structureLevel: 'course'` on the turn context, not a different route.
  `courseAdapter` becomes an input-builder the single pipeline calls when a
  course session is active — which is exactly the direction its own header
  comment already states ("the course scaffold becomes INPUT to the pipeline,
  not a parallel system").
- **Structure as a dial:** the same `promptPlanLayer` + `decide` machinery
  runs for all three levels; only the queue source and the step-lock strictness
  change.

---

## 5. Gating change — the conversion funnel

Small, surgical, and the highest-visibility user-facing change.

- **Remove** `premiumFeatureGate('Courses')` from
  `config/routes.js:229–230` (`/api/courses`, `/api/course-sessions`). Free
  users can now browse + enrol.
- **Keep** `usageGate` on all AI turns (`/api/chat`, and the folded-in course
  chat). The 30-AI-minutes/month cap (`FREE_WEEKLY_SECONDS`, monthly reset) is
  the conversion lever.
- **Re-word the cap prompt in a course context.** When `usageGate` blocks a
  student who is mid-module, the message should be course-aware: *"You're 60%
  through Unit 2 — upgrade to Mathmatix+ to finish without waiting for your
  minutes to reset."* (Today's copy in `usageGate.js:167` is generic.)
- Mathmatix+ (`subscriptionTier: 'unlimited'`) and school licenses continue to
  lift the cap. **No feature is unlocked by tier — only more minutes.**

---

## 6. Phased plan

Ordered by leverage-to-risk. Each phase ships independently.

### Phase 0 — write down the decision *(this doc)*
No code. Get §1 agreed so the drift cleanup and the queue work aren't relitigated.

### Phase 1 — open the funnel *(small, high visibility)*
- Drop the two `premiumFeatureGate('Courses')` gates.
- Make the `usageGate` upgrade copy course-aware.
- Verify a free account can browse → enrol → chat → hit the cap → see the
  in-context upgrade prompt.
- **Risk:** low. Reversible by re-adding the gate.

### Phase 2 — feed `skillFocus` in free chat *(the core)* — **v1 SHIPPED**
Populate `tutorPlan.skillFocus` from signals already computed, so the structured
machine runs for un-enrolled students. Implemented in `utils/skillFocusBuilder.js`,
called from the pipeline right after the plan loads (`pipeline/index.js`).

**Open question #2 resolved — "guided", not "course-locked".** v1 seeds ONLY
skills the student has already *touched*:
- **Review-due** (FSRS `reviewSchedule.nextReviewDate`) → jumps the queue (priority 8).
- **In-progress** (developing / introduced / proficient via `TutorPlan.inferFamiliarity`)
  → continues the work, ordered by familiarity.

It deliberately **skips `never-seen` skills**, because those map to the
answer-dumping `instruct` mode; touched skills map to `guide`/`strengthen`,
which stay Socratic-compatible. So the tutor proactively *continues and reviews*
what the student is working on, but does not force-introduce brand-new frontier
skills against an off-plan question. The existing off-plan gate in `decide.js`
(`isStudentOnPlanTopic`) remains the backstop. Proactive frontier introduction
is a Phase 2b follow-up, gated on the mode-transition detector being proven.

- Only runs when the active queue is empty (no thrash) and never during a course
  session (the course drives its own queue).
- **Kill switch:** env `STRUCTURED_FREE_CHAT=false` disables seeding globally.
- Covered by `tests/unit/skillFocusBuilder.test.js`.
- **Still to do (2b):** frontier/never-seen introduction, placement-result seeding
  for brand-new students, and a defined soft step-lock strength.

### Phase 3 — unify the endpoints
- Fold `/api/course-chat` handling into `/api/chat` behind a `structureLevel`
  computed from `activeCourseSessionId`.
- Reduce `courseAdapter` to an input-builder; delete the duplicate course-prompt
  branches in `routes/chat.js` (1021/1061/2558) in favor of one path.
- Keep `/api/course-chat` as a thin alias initially (client still calls it);
  retire once the client is updated.
- **Risk:** medium-high. Touches the busiest endpoint + the per-user lock. Do
  behind tests; the two locks (`acquireUserLock`, `acquireCourseLock`) must
  become one.

### Phase 4 — retire Layer 1
- Archive `models/course.js` + `routes/course.js` (or delete after confirming no
  runtime reads). Migrate `scripts/seedCourse.js` intent to pathway JSON if any
  authoring value remains.
- Collapse `buildCourseProgressionCompact` (Layer 3) into the Phase-2 queue so
  there's one source of "what's next," not two.
- **Risk:** low once Phases 2–3 land. Mostly deletion.

---

## 6b. ACT boot-camp practice tests — **content engine + fixed-form rail SHIPPED**

Boot camps (ACT/SAT/algebra-prep/calc-prep, ~3 weeks) run on the pathway system;
their differentiator is a **practice test** built from a composite of the boot
camp's skills, as *original parallel forms* (our own items), delivered like the
Starting Point.

The ACT Math skill catalog already existed (`seeds/skills-act-math-prep.json`,
36 skills in ACT reporting categories). Built on top:

- **`seeds/act-math-blueprint.json`** — the 60-item composition (category weights,
  easy→hard difficulty ramp, skills-by-category, approximate raw→scaled 1–36
  table). Derived from the ACT Math *reporting-category structure* — not a copy of
  any published test.
- **`utils/actTestAssembler.js`** — assembles an original parallel form by
  sampling our own skill-tagged bank (`Problem.findNearDifficulty`); reports any
  unfillable slot as a **generation spec** for `scripts/generate*.js`.
  `skillPool()` / `rawToScaled()` support both delivery modes.
- **`routes/actTest.js` + `models/actTestSession.js`** — a **fixed-form** delivery
  rail (parallel to the screener, per the `growthCheck.js` precedent) at
  `/api/act-test` (`start` / `next-problem` / `submit-answer` / `complete`),
  mirroring the screener's per-item contract so the existing item-render UI can
  drive it. Grades by re-fetching the Problem server-side; returns raw + scaled +
  per-category breakdown. **Free** (boot-camp on-ramp), no AI at request time.
- **`scripts/actTestCoverage.js`** (`npm run act:coverage`) — reports how much of
  a form the bank can fill and prints the generation worklist for gaps.

**Prerequisite before it delivers value:** the `Problem` bank must actually
contain `act-*`-tagged items. Run `act:coverage`; generate to fill the gaps.

**Adaptive diagnostic (follow-up, "delivered like the Starting Point"):** the CAT
engine is reusable — `skillSelector.selectSkill(pool, …)` takes whatever skill
pool it's handed, so constraining it to `skillPool()` yields an adaptive ACT
diagnostic. Prereqs the screener map surfaced: add `'act-math'` to
`ScreenerSession.sessionType`; give ACT skills IRT difficulties (they carry
`difficultyLevel`, not `irtDifficulty`) or extend `catConfig`'s
`CATEGORY_DIFFICULTY_MAP`/`CATEGORY_TO_BROAD` to cover ACT categories; map
theta→scaled(1–36) for the report; add an ACT branch/fork to `FloatingScreener`.

## 7. Open questions

1. **Where does a non-enrolled student's queue come from before they've been
   screened?** Grade + `mathCourse` → default pathway (the Layer-3 map already
   exists) is the obvious seed. Confirm every student has enough profile to seed
   *something*, or the "structure everywhere" promise has holes for brand-new
   users.
2. **Step-lock strictness for `'guided'` (non-course) structure.** Course mode
   hard-locks to one step. Free-chat structure should be softer — steer, don't
   cage — or it'll feel worse than today's flexible chat. Needs a defined
   middle setting in `promptPlanLayer`/`decide`.
3. **Does opening courses to free users blow the AI cost model?** Structured
   sequences may drive *more* engagement per free user before the cap. Check
   against `docs/AI_COST_PROJECTIONS.md`; the 30-min cap still bounds spend, but
   model the funnel conversion rate needed to stay positive.
4. **Progress/mastery double-counting.** Course progress (`courseSession`) and
   skill mastery (`user.skillMastery`) are separate. Once one pipeline drives
   both, confirm a single answer doesn't advance two independent bars
   inconsistently.
5. **Do we keep the `Course` LMS schema for future teacher-authored courses?**
   If teacher authoring is on the roadmap, Layer 1 might be revived rather than
   deleted — but it should then *compile to* pathway JSON, not run in parallel.

---

## 8. Explicitly out of scope (for now)

- Reviving the dormant `Course` model as a live runtime path.
- New pathway content authoring (separate content effort).
- Whiteboard/board-panel changes (`MM_FEATURES.boardPanel` stays off).
- Any change to how Mathmatix+ is priced or what `usageGate` counts.

---

## 9. TL;DR for a reviewer

The structured-teaching engine is already built and already runs the pipeline;
it's just fed only by the walled-off course mode. This rework (a) opens that
mode to free users as a funnel by removing one gate, (b) feeds the same skill
queue from placement/BKT/FSRS so structure runs for everyone, and (c) collapses
three overlapping "course" representations and two endpoints into one. Most of
it is deletion and rewiring, not new machinery.
