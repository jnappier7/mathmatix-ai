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

## 3. What is IN FLIGHT (not done — agents were killed)

Four background research agents were launched and **all four died when the
process exited. None wrote its deliverable.** Relaunch from scratch.

| Deliverable (none exist yet) | Scope |
|---|---|
| `seeds/unified-taxonomy/standards-alignment.json` | `{skillId: [codes]}` for all 315 |
| `seeds/unified-taxonomy/student-labels.json` | `{"labels": {skillId: "plain name"}}` for all 315 |

The generator **already reads both** and falls back safely per skill, so they drop
in as pure data with no code change. `scripts/genUnifiedSkills.py` reports
`skills without standards alignment: 315` and `skills still using the formal name
as the student label: 315` — those counters go to zero when the files land.

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

## 4. What is NEXT (designed, not started)

Ordered. Steps 2-3 are invisible and are the whole ballgame; step 4 is where a
student feels it.

**2 — The ladder in the schema.** `rung` (`none|learned|proved|taught`) +
`provenBy` (`challenge|fluency|teachback|inference`) on `skillMastery`. Keep the
4 pillars — they become the *evidence behind* rung 2, not a parallel system.
**Single writer owns every rung transition, logged with its receipt.** Today
`masteryEngine.updateSkillMastery` (L215) updates pillars and score but **never
assigns `status`** — which is why the UI invented a "mastered" label off ~5
problems.

**3 — Closure + inference.** Transitive prerequisite closure on prove (does not
exist anywhere today — only single-hop read-time checks). Revive
`utils/masteryInference.js`, which is **dead code**: L27 reads `skill.patternId`
and `skill.tier`, neither of which is on the Skill schema, so it returns `[]` for
every real skill. Plus demote-on-contradiction (the cascade-invalidation gap
`CLAUDE.md` flags).

**4 — Proof endpoints.** `POST /api/mastery/attempt/:skillId` with mode
`challenge | fluency`, and a band-level `teachback` running as a pipeline mode
with a rubric. Today "test-out" is **keyword matching in `routes/chat.js:1296`**
and nothing else. Teach-back does not exist at all.

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
