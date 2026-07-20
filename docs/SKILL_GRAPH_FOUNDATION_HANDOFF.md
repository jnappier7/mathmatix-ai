# Skill Graph Foundation — Handoff

Picks up where `COURSES_UNIFIED_TAXONOMY_HANDOFF.md` left off. Written so a cold
session can resume. **Branch:** `claude/skill-graph-foundation` (off `origin/main`).

---

## 1. The arc this belongs to

Courses are being narrowed to **prep and readiness only** (ACT / SAT / AP Calc /
course-readiness rails). The main student loop becomes **filling in the skill
map** — the 315-skill unified taxonomy — with tutoring in support of it.

The model agreed with the product owner:

**Every skill has three rungs: learn it → prove it → teach it.**

- **Learn it** — worked through with the tutor (I-do / we-do / you-do).
- **Prove it** — independent evidence. Challenge (5 problems, no hints, one shot)
  or a fluency run against the student's own baseline. *A student may skip
  straight here on anything they already own* — this is the test-out path.
- **Teach it** — the student explains, the tutor plays the confused student.
  Rarest rung, highest status.

Plus a fourth, system-granted state: **cleared from above** — when a skill is
proved, every prerequisite beneath it in the graph closes by inference. This is
the payoff moment (a cascade of cells lighting up) and the fix for the observed
bug where a student ground through absolute value they already knew because the
screener never closed it.

**Design decisions already made:**
- Teach-back targets a **strand band** (strand × course level), not a single
  skill. Teaching 8 skills individually is grinding; teaching *why unit rate,
  slope and rate of change are one idea* once is better evidence and less work.
- **Cleared-from-above cannot jump to taught.** Inference is a convenience, not
  an achievement. It clears prerequisites; it does not earn rung 3.
- **Retention is decay, not a gate.** The current `masteryEngine` demands a
  passed retention check *before* mastery, which is why little legitimately
  reaches `mastered`. Invert: proving grants rung 2 immediately, FSRS demotes it
  later if it goes stale.
- **Reward proof, never volume.** The live day-one card celebrates
  "5 practiced this week" — activity, not evidence. That is what made a 100%
  mastery claim feel hollow.

**Visual direction:** not an ALEKS pie. Six **strand towers** (columns), seven
**altitude bands** (ELEM→CALC), filling bottom-up. A pattern is then a vertical
thread you can trace — unit rate → slope → derivative is literally one column.
Interactive prototype exists (published artifact, built from the real taxonomy).

---

## 2. What is DONE on this branch

| Commit | What |
|--------|------|
| `fa0ae1bd` | **Skill graph repaired.** See below. |
| `86a8dfa1` | **`studentLabel`** added to `models/skill.js` + generator plumbing. |
| `44d6f6e2` | CCSS reference (337 codes) + this handoff. |
| `e9f3fc07` | **Step 2 — the ladder.** `utils/skillRung.js`, 31 tests. |
| `34cbd8e0` | **Student labels for all 315**, 4 copy-guard tests. |
| `3000a930` | **Step 3 — closure + cascade.** `utils/skillClosure.js`, 24 tests. |

> **Status:** steps 1-3 of the five-step plan are done. Suite at **3937 pass /
> 242 suites**, eslint clean. The new modules are **islands** — nothing in the
> live pipeline calls them yet. That wiring is step 4 and wants review first.

### `fa0ae1bd` — three defects, one root cause (seeded as a list, not a graph)

1. `models/skill.js` declared `strand` **twice** — L162 with the
   QNT/PRP/EQV/FNC/SPC/DTA enum, and again ~L265 as a bare `String`. Later key
   wins in an object literal, so the enum was silently discarded and never
   validated. Duplicate removed.
2. `enables` was **empty on all 315 skills** — the reverse graph was never built.
   `utils/retentionProbe.js:13` scores retention priority by
   `skill.enables.length`, so that term was uniformly zero. Now derived (515 edges).
3. `prereq_ids` and `cross_prereq_ids` were **flattened into one array**, losing
   the distinction between a same-level next step and a lower-level ancestor that
   is the same idea less abstractly. Split into `prerequisites` (360 edges) and
   the new **`crossPrereqs`** (155 edges).

`tests/unit/skillGraph.test.js` (12 tests) locks: acyclicity, resolvable refs, no
self-edges, same-level edges never point upward, cross-level edges point strictly
downward, `enables` exactly reverses the edge set, no orphans, depth smoke alarm.
**The graph passed every structural test on first run** — good signal on the
taxonomy's underlying quality.

Deepest genuine chain is **22 hops**: `ELEM.QNT.4` (multiplication facts, grade 3)
→ division → factors/multiples → `MS.QNT.3` GCF/LCM → polynomials → the factoring
chain → `ALG1.EQV.16` complete the square → function transformations →
`CALC.FNC.1` limits → chain rule → FTC → `CALC.FNC.28` separation of variables.
That length is load-bearing: it is what lets a calculus failure bridge down to the
actual gap.

### `86a8dfa1` — `studentLabel`

63 of 315 names lead with category vocabulary ("Multiplicative comparison",
"Literal equations", "Interpret numerical expressions"). On the board the label
IS the interface. `studentLabel` is **added beside** `displayName`, not replacing
it — teachers write IEP goals against the formal name and standards codes align
to it. Plain name is the headline, formal name the subtitle.

**Hard rule for label copy:** never narrow the scope to get a plainer label.
`MS.QNT.8` "Rational number operations" is all four operations on negatives *and*
fractions; "Adding fractions" is plainer and wrong.

---

## 2b. Steps 2 and 3 — what landed

### `e9f3fc07` — the ladder (`utils/skillRung.js`)

`rung` / `provenBy` / `rungHistory` on `skillMastery`, with this module as the
**single writer** of all three. `canAdvance()` governs what may be attempted;
`evidenceSupports()` governs whether the attempt cleared the bar — separated so a
student can be told "you may try this" and "you did not make it" as different
things. Gates pinned to the existing pillar thresholds (0.90 accuracy, 3 hints) so
the two systems cannot drift.

Test named after the production bug: *"four first-try wins in a week is not a
mastery claim."*

### `3000a930` — closure (`utils/skillClosure.js`)

Pure functions over a graph + mastery map, so they test against the real 315
skills with no database.

- `applyProofCascade` — proving clears everything beneath. Proving separation of
  variables clears 20+ skills down to third-grade multiplication facts.
- `invalidateFrom` — contradiction travels up, withdrawing **inferred** rungs
  only. A skill the student proved themselves survives.
- `availability` — the attackable frontier. `learned` does not unlock; only
  `proved` or better does.
- `bandProgress` / `nearestClosableBand` — the proximity hook. A band is offered
  only when its remainder is actually startable.

Two cascade guards: an already-proved skill is skipped, not overwritten (receipt
stays `challenge`); an `explicitlyFailed` skill is never re-granted.

---

## 3. What is IN FLIGHT

### Done
`seeds/unified-taxonomy/student-labels.json` — **all 315 landed** (`34cbd8e0`).
~200 changed substantively; 26 keep the formal name (almost all PREC/CALC, where
the real term is what the student already owns).

**Carried forward for review, not acted on:**
- **24 skills flagged as possible splits** — strongest: `MS.QNT.8` (four
  operations over signed fractions and decimals), `MS.SPC.7` (rigid motions and
  dilations bundled), `GEO.SPC.19` (four formula families), `ALG2.FNC.13`
  (arithmetic, finite and infinite series), `ALG1.EQV.11` (GCF vs grouping).
- **`PREC.EQV.4` and `ALG2.EQV.17`** appear to be the same skill with identical
  formal names in the same strand — likely a redundant taxonomy entry.
- **`GEO.SPC.10`** — formal `displayName` "Parallelogram properties" is narrower
  than the skill (description covers rectangles, rhombi, squares, trapezoids,
  kites). Proposed rename to "Quadrilateral properties".

### Still owed
`seeds/unified-taxonomy/standards-alignment.json` — `{skillId: [codes]}` for all
315. Three audit agents running. The generator already reads it with per-skill
fallback and reports `skills without standards alignment: 315`; that counter goes
to zero when the file lands. **No code change needed.**

**Salvaged:** `seeds/unified-taxonomy/ccss-reference.json` — 337 CCSS-M codes with
full standard text, scraped and cleaned (trailing footnote markers stripped).
Reusable lookup so the audit does not re-scrape.

> ⚠️ **Known gap in the reference:** grade 7 has only **13 codes**, well short of
> the real ~24. Grade 7 is where the PRP (proportional reasoning) strand lives —
> exactly the content the product thesis leans on hardest. **Re-scrape grade 7
> before trusting any PRP alignment.** Counts by band:
> K 15 · 1 20 · 2 26 · 3 25 · 4 28 · 5 26 · 6 21 · **7 13** · 8 24 ·
> HSN 24 · HSA 27 · HSF 28 · HSG 38 · HSS 22.

### What the audit must produce, per skill
1. **standards** — exact CCSS-M codes; AP CED topic codes for calculus
   (prefix non-CCSS as `AP-CALC:2.1`, `OH:7.RP.2`); `no-ccss` with a reason.
2. **grade_check** — does the taxonomy's `grade` match where CCSS places it?
3. **prereq_verdict** — audit each of the 515 edges: ok / wrong-direction /
   missing-prereq / spurious.
4. **missing_prereqs** — edges that should exist.
5. **confidence** — high / medium / low.

**Sources:** corestandards.org; **achievethecore.org Progressions Documents**
(Univ. of Arizona / IME — the definitive source on prerequisite ordering);
education.ohio.gov Ohio's Learning Standards (this product serves Ohio schools);
apcentral.collegeboard.org.

**Fabricating a standard code is the worst outcome — flag uncertainty instead.**

Two specific things to check hard:
- Is geometry rooted in **transformations** (per CCSS 8.G, HSG.CO/SRT), or does
  it use the older axiomatic ordering treating congruence as primitive?
- Is **DTA adequate**? At 29 skills it is the smallest strand; report real gaps
  against 6-8.SP and HSS.

**Audit findings are proposals, not auto-applied.** Bring disagreements to the
owner — some will be judgment calls the taxonomy author had a reason for. A data
fix on top of the foundation is not a rework; the tests guard it.

---

## 4. What is NEXT

**4 — Wire it in, then the proof endpoints.** ⚠️ **The step-2/3 modules are
islands — no production code calls them yet.** Wiring is the first genuinely
risky change on this branch and should be reviewed before it lands.

Order within step 4:
1. **Make `masteryEngine.updateSkillMastery` (L215) delegate rung transitions to
   `skillRung`.** It currently updates pillars and score but never assigns
   `status`, which is why the UI invented "mastered" off ~5 problems. This is the
   single highest-value wiring change and the one that fixes the screenshot.
2. **Call `applyProofCascade` from the mastery write path** (`utils/pipeline/persist.js`
   `updateSkillMastery`, `routes/mastery.js` `/record-mastery-attempt`), and
   `invalidateFrom` + `markExplicitFailure` when a cleared skill is missed.
3. **Retire the double bookkeeping:** `masteryEngine.calculateMasteryState`
   currently demands a passed retention check *before* mastery. Under the ladder,
   retention is decay — proving grants the rung and FSRS demotes later.
4. **`POST /api/mastery/attempt/:skillId`** with mode `challenge | fluency`, plus
   a band-level `teachback` as a pipeline mode with a rubric. Today "test-out" is
   **keyword matching in `routes/chat.js:1296`** and nothing else; teach-back does
   not exist at all.

**Read-only first.** `GET /api/mastery/map` (graph + rungs + band progress) is
additive and changes no existing behaviour — safe to land ahead of the write-path
wiring, and it is what step 5's board consumes.

**5 — The board.** Replace the D3 force graph in `public/js/skill-map.js` with
the towers. Note `/api/mastery/skill-graph` (`routes/mastery.js:2414`) currently
builds nodes from the hardcoded `patternBadges` const and edges from the
hardcoded `prerequisiteMapper.SKILL_PREREQUISITES` — **not** from Mongo. Repoint
it at the real graph.

### Competing graph sources still to retire
1. `Skill.prerequisites` / `.enables` in Mongo ← **the winner**
2. `utils/prerequisiteMapper.js` `SKILL_PREREQUISITES` (hardcoded)
3. `utils/patternBadges.js` — 1,364 lines of hand-maintained `skillIds[]`; should
   reduce to cosmetics over strands
4. pathway JSON `prerequisites`

---

## 5. Working agreements

- Re-branch fresh off `origin/main` after each merge; never stack on merged history.
- `git config user.email noreply@anthropic.com && git config user.name Claude`.
- PRs open as **draft**. Commit before ending a turn (a stop-hook nags).
- Never import `openaiClient` from routes — go through `utils/llmGateway.js`.
- Regenerate with `python3 scripts/genUnifiedSkills.py`; seed with `npm run tax:seed`.
- Verify with `npx jest tests/unit/skillGraph.test.js tests/unit/unifiedTaxonomy.test.js`.
