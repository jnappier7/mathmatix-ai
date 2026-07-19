# MATHMATIX.AI — Courses / Unified Taxonomy Handoff

Status snapshot of the in-flight **test-prep bootcamps + unified taxonomy** arc,
written so a fresh session (human or AI) can pick up cold. Read `CLAUDE.md` first
(repo onboarding map); this doc covers just this arc.

**Repo:** `jnappier7/mathmatix-ai` · **Working branch:** `claude/courses-flow-mathmatix-fn8hq9`
**Stack:** Node/Express, MongoDB/Mongoose, vanilla-JS+Vite, **OpenAI-only** LLM via `utils/llmGateway.js`.

---

## 1. The big picture

Two intertwined goals:
1. **Test-prep bootcamps** (ACT, AP Calc AB, Digital SAT) — Fable authors machine-verifiable JSON → Python ingest → sympy audit → seed `Problem` docs → weekly delivery "rail" + day-one diagnostic card.
2. **Unify the platform's math content** under one skill taxonomy — the **"Map of Mathmatix"**: 315 skills, 7 course levels (ELEM→MS→ALG1→GEO→ALG2→PREC→CALC), 6 cross-cutting strands (QNT/PRP/EQV/FNC/SPC/DTA), ids like `ALG1.EQV.1`. Source of record: `seeds/unified-taxonomy/math_taxonomy.json`.

The content-bank pipeline is proven and identical across banks: **Fable JSON → ingest.py → audit.py (sympy `verify`) → seed.js → rail + card.**

---

## 2. What's DONE (merged to `main`)

| PR | What |
|----|------|
| #1212 | **AP Calc foundation**: `scripts/calcFigureRenderer.py`, `ingestCalcItems.py`, `calcSkillMap.py`, `auditCalcItems.py`, `seedCalcItems.js`. |
| #1215/#1218 | **Course diagnostic cards**: `routes/courseSession.js` `buildCourseDiagnostic()` + `public/js/courseCatalog.js` card rendering (act-practice / starting-point). |
| #1217 | **AP Calc weekly rail**: `utils/calcBootcamp.js`, `models/calcBootcampSession.js`, `routes/calcBootcamp.js` (`/api/calc-bootcamp`). MC auto-scored + FRQ LLM-rubric-scored; AP-band projection; priority-scored ≤3-topic plan. |
| #1221 | SAT authoring spec (`seeds/sat-math/SAT_SPEC.md`), verified against **current Digital SAT** format. |
| #1223 | **Unified taxonomy landed**: `seeds/unified-taxonomy/math_taxonomy.json` (315 skills), `seeds/skills-unified.json`, `scripts/genUnifiedSkills.py` (`tax:skills`), `scripts/seedUnifiedSkills.js` (`tax:seed`), `models/skill.js` gained `strand`+`courseLevel`, `tests/unit/unifiedTaxonomy.test.js`, `docs/Map_of_Mathmatix.html`. Coexists with legacy per-course catalogs. |
| #1227 | **SAT bank ingested under unified ids**: `scripts/satSkillMap.py` (79 labels→30 unified ids, 0 unmapped), `ingestSatItems.py` (132 Problem docs = 101 MC + 31 grid-in), `satFigureRenderer.py` (17 figs), `auditSatItems.py` (125/125 verify), `seedSatItems.js`, `tests/unit/satItems.test.js`. npm: `sat:ingest/seed/audit`. **Also carried the Alg1→unified crosswalk** (`scripts/alg1UnifiedCrosswalk.py`, `seeds/unified-taxonomy/alg1-crosswalk.json`, `docs/ALG1_UNIFIED_REVIEW.md`). SAT is fully auto-scored (grid-ins → no FRQ/LLM). |
| #1228 | **Canonicalizer resolver**: `utils/skillCanonicalizer.js` — `canonicalSkillId(id)` maps legacy→unified via `seeds/unified-taxonomy/*-crosswalk.json` (auto-discovers all crosswalks); identity passthrough for unknown/already-unified. |
| #1230 | **Canonicalize skillId at the mastery boundary** — see §4. |

### Earlier (pre-this-arc, already in `main`)
- **ACT bootcamp**: `routes/actTest.js` (fixed-form auto-scored), `scripts/ingestFableActItems.py`, `seedActItems.js`. npm: `act:*`.
- **Algebra 1 bank**: `scripts/ingestAlg1Items.py` (+ `alg1FigureRenderer.py`, `alg1SkillClassifier.py`), 798 Problem docs across 9 modules, fine legacy kebab skillIds. npm: `alg1:*`. Source: `seeds/alg1-assessments/`.
- Sidebar reorder (courses top / avatar bottom); `domain-and-range` added as a real skill.

---

## 3. The Alg1 → unified crosswalk (the reviewed mapping)

- `seeds/unified-taxonomy/alg1-crosswalk.json` — 64 legacy Alg1 skillIds → unified ids, each with confidence + alternatives + item count.
- Built by `scripts/alg1UnifiedCrosswalk.py`; human-review worksheet at `docs/ALG1_UNIFIED_REVIEW.md`.
- **Policy decision (user):** keep the Alg1 bank tagged at **Algebra 1 level** → 57/64 map to `ALG1.*`. The only exceptions are **7 pre-algebra holdouts** (order of operations, integer/fraction/decimal ops, writing/evaluating expressions, proportions) that have **no ALG1-level node** in the Map, so they stay at `MS.*` (collapsing to 4 MS nodes). Intentional and approved.

---

## 4. PR #1230 — mastery-boundary canonicalization (MERGED)

**Decision:** activate the unified taxonomy for real, but the *safe* way — **canonicalize skillId at the mastery read/write boundary, DO NOT re-tag the content banks.**

**Why not flip the bank tags:** the screener pulls problems by *exact* `Problem.skillId` match, and its candidate ids come from the catalog + `Problem.distinct('skillId')` + generator templates (all legacy). Flipping the bank would return **zero problems** unless catalog + generator moved in lockstep. Also, mastery writes/reads are scattered (~8 write, ~14 read sites across 7 files) with BKT/FSRS in a *separate* keyed map — no single choke-point. Canonicalizing the boundary sidesteps all of it and fixes pre-existing id fragmentation.

**How it works:** every mastery read/write routes its `skillId` through `canonicalSkillId()`, so a legacy id and its unified id collapse to one node.

**Write sites (new writes land on unified key):**
- `utils/pipeline/persist.js` — `updateSkillMastery`, `skillStarted`, `updateBadgeProgress`
- `utils/pipeline/coursePersist.js` — `processSkillMastery`
- `utils/pipeline/index.js` — `updateLearningEngines` (BKT/FSRS/consistency) + paired engine reads
- `routes/{screener,assessment}.js` — placement results
- `routes/{review,mastery,student}.js` — read-modify-write via `resolveMasteryKey`
- `routes/admin.js` + `scripts/mergeAccounts.js` — account-merge collapses duplicates

**Read sites (legacy-id lookup resolves unified entry, with legacy fallback):**
- `utils/masteryGuard.js` — `getSkillMasteryEntry` canonicalizes; **exports** `resolveMasteryKey` (canonical key / legacy fallback / canonical default — duplicate-free)
- `routes/mastery.js` + `utils/patternBadges.js` — milestone/tier checks via local `readMasteryEntry`
- `utils/sessionPatternDetector.js` — retention-decay lookup

**Also in the PR:**
- `scripts/backfillUnifiedMasteryKeys.js` — optional one-time migration (dry-run default; `--apply`) that rewrites historical `skillMastery` + `learningEngines` keys legacy→unified and collapses dupes. **Optional** — the read fallback means nothing breaks without it.
- `tests/unit/skillCanonicalizer.test.js` — 15 tests.

**Verified:** full unit suite 3844 pass (238 suites); eslint clean; drove the *real* `updateSkillMastery`/`updateBadgeProgress` — legacy id lands under `ALG1.EQV.1` / `ALG1.PRP.2`, no legacy key leaked.

---

## 5. What's LEFT

**Activate the migration for the other banks (mechanism already built, bank-agnostic):**
- **ACT** and **AP Calc** crosswalks — same flow as Alg1: a `*UnifiedCrosswalk.py`-style mapper → `seeds/unified-taxonomy/{act,calc}-crosswalk.json` + a `docs/*_UNIFIED_REVIEW.md` worksheet → **human review** (Fable's migration report self-flags many as weak-match: ACT ~114/225, Calc ~27/95) → drop the crosswalk in; `skillCanonicalizer` auto-discovers it, **no code change**. (SAT is already native-unified; no crosswalk needed.)
- **Optional:** run `scripts/backfillUnifiedMasteryKeys.js` against production (dry-run first) to make historical keys uniform.

**SAT bootcamp delivery (flagged as follow-up after #1227, NOT built):**
- SAT weekly **rail** — auto-scored throughout (MC + grid-in, **no FRQ/LLM**), the SAT analogue of `routes/calcBootcamp.js`. Input contract already emitted: `seeds/sat-assessment-map.json`.
- SAT **day-one diagnostic card** — needs a `sat-prep` pathway wired into `routes/courseSession.js` `COURSE_DIAGNOSTICS` + `public/js/courseCatalog.js` (mirror the ACT/starting-point cards).

**Bigger "Map usage" ideas discussed but not chosen (optional future):**
- **Strand-progress view** — vertical "how far along each of the 6 strands" UX ("See the Patterns" story); `docs/Map_of_Mathmatix.html` is the first draft.
- **Prereq-graph into diagnosis** — make the tutor's `prerequisite-bridge` action traverse the unified cross-course graph so a gap can bridge *down* a level (e.g. a Calc miss → an Alg2 prereq).
- Full **bank-tag migration** (flipping `Problem.skillId` + catalog + generator in lockstep) remains deliberately deferred — the taxonomy still *coexists* with legacy per-course catalogs. Not needed now that mastery is canonicalized.

---

## 6. Working agreements / gotchas

- **Branch lifecycle:** after each PR merges, GitHub auto-deletes the branch. Re-branch fresh: `git fetch origin main && git checkout -B claude/courses-flow-mathmatix-fn8hq9 origin/main`. Never stack new work on already-merged history.
- **Git identity:** `git config user.email noreply@anthropic.com && git config user.name Claude` (do NOT amend GitHub's own merge commits — the unverified committer on those is expected).
- **PRs:** open as **draft**; auto-subscribe to PR activity; a stop-hook nags about uncommitted/untracked files, so commit before ending a turn.
- **Canonicalizer is the extension point:** adding any bank's reviewed crosswalk to `seeds/unified-taxonomy/*-crosswalk.json` extends mastery unification with zero code change.
- **Never** import `openaiClient` directly from routes (bypasses PII anonymization) — go through `utils/llmGateway.js`. Requiring pipeline modules standalone needs `OPENAI_API_KEY` set.
