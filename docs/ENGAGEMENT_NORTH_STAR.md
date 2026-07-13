# Engagement North-Star — Making Progress Feel Alive

> Where the gamification vision is going and why. Captures the "layered
> progression" thesis (six layers + anticipation + tutor relationship + mastery
> reputation) and, crucially, tags each idea **Exists / Dormant / Net-new**
> against the *actual* codebase — so this is a buildable roadmap, not a manifesto.
>
> Companion docs: `XP_LEVELING_SYSTEM_OVERVIEW.md` (current economy),
> `COSMETICS_SHOP_DESIGN.md` (Coins + shop).

---

## The core thesis

A student didn't ask "what is XP?" — they asked **"why should I care?"** The
diagnosis: Mathmatix has **progress** but not **anticipation**. Good games hook
on *uncertainty and "what's next,"* not points. The fix is not "more math
excitement" — it's **making the progress we already track visible, personal, and
forward-looking.**

The single feeling to optimize for: **"just one more problem."** Every mechanic
below is judged by whether it serves that without compromising the teaching.

**The under-appreciated fact:** we already own most of the substrate. The work is
mostly *surfacing and connecting* existing systems, not inventing new ones.

---

## The six layers — tagged against reality

### 1. Tutor relationship (proud-of-you) — **Net-new, highest ROI**
Students build a *relationship*, not just a level. Milestone- and history-aware,
persona-specific dialogue: "Yesterday you struggled with distribution — today I
think you're ready."
- **Substrate exists:** `tutorPlan` is literally "the tutor's persistent mental
  model of a student"; each persona has distinct `humanBehaviors`; the status
  card already renders a persona line.
- **Net-new:** milestone triggers + a tutorPlan-backed "what should the tutor
  notice today" message. This is the most on-brand idea ("the tutor that won't
  let you fake it") and cheap relative to impact.

### 2. Collections — **Exists, unsurfaced**
- **Exists:** `badges`, `strategyBadges`, `habitBadges`, `metaBadges`,
  `patternBadges`, mastery badges. That *is* a collection system.
- **Work:** present it as a **case/shelf to complete** (progress toward sets),
  not a scattered list. Pure UI + a completion metric.

### 3. Random drops — **Net-new, guardrails required**
Small chance of a delightful cosmetic on a *verified* win.
- **Guardrails (non-negotiable):** earned-only, **never paid randomization**
  (loot boxes for minors = gambling; a hard No-Go). Drops key off
  **verified-correct + genuine behavior** (same gate as the combo meter / Tier-3
  XP), **never problem volume** — otherwise it fights `antiGaming`/`worksheetGuard`.
- **Substrate:** the app already uses variable-ratio (tutor unlock rolls,
  `showUnlockProximityTeaser`) and now has the Coins/cosmetics economy to drop into.

### 4. Daily quests — **Exists, now surfaced**
- **Exists & shipped:** `routes/dailyQuests.js` (3/day, streakKeeper, Pi Day
  3.14×). The Personal Status Card now surfaces them prominently (they were
  buried in an unreachable drawer).
- **Work:** richer quest variety ("help Maya teach Bob," "beat yesterday's
  streak") + visibility in more entry points.

### 5. Visible skill trees — **Data exists, no visualization**
- **Exists:** `skill.js` has a prereq/enables graph; `masteryEngine` scores it.
- **Net-new:** the *visualization* — a tree that lights up as skills are
  mastered. Parents and teachers value this too. Rendering job, not a modeling job.

### 6. Unlocking personality / deeper tutors — **Partially exists / Dormant**
Tutors deepen over levels (stories → jokes → roasts → custom celebrations).
- **Dormant:** the tutor *unlock* engine is fully built but all unlockable tutors
  are `active:false` (see `XP_LEVELING_SYSTEM_OVERVIEW.md`).
- **Net-new:** level-gated *dialogue* layers per persona (distinct from
  unlocking new tutors).

---

## The two finishers (both cheaper than they look)

### Anticipation / surprise — **Partially exists**
"Before today's lesson… I found something" → a chest → a rare cosmetic.
- **Exists:** `showUnlockProximityTeaser` already does "something's about to
  unlock." Extend into session-open surprise moments, powered by the drop system.

### Mastery Reputation (Learning → Confident → Proven) — **Already built, needs renaming/surfacing**
> This is the big one, and it's **already your core differentiator.**
- The `masteryEngine` has a **4-pillar model (accuracy / independence / transfer
  / retention)** with tiers. "Proven = demonstrate later, in a new context,
  without prompting" is **literally the transfer pillar + FSRS retention**, and
  `transfer` is already one of the six Tier-3 behaviors the tutor awards.
- **Work:** surface the existing tiers as **Learning → Confident → Proven** and
  gate "Proven" on unprompted transfer. Mostly renaming + a status display over
  an engine that already exists — and it aligns reward with *real* mastery, not
  shallow repetition. This should be the **top of the progression stack**, above
  "Level N."

---

## XP economy → Coins (already underway)
"XP should buy things" — resolved in `COSMETICS_SHOP_DESIGN.md`: a separate
**earned Coins** currency (not XP, not real money), cosmetic-only, no pay-to-win.
**Shipped:** the wallet spine + earning on level-up and quest/challenge
completion. **Next:** the shop/catalog + spend endpoints, then cosmetics and
avatar unlocks.

## Seasons — **Extend an existing pattern**
Pi Day already works (3.14× event). A seasonal *framework* (Halloween, Back to
School, Summer Camp) with exclusive quests/cosmetics/badges is generalizing one
proven mechanic.

---

## Guardrails (duty of care — apply to everything above)
1. **No loot boxes / no paid randomization** for minors. Direct purchases only.
2. **Rewards tie to verified learning**, never volume — protects the teaching and
   the anti-gaming systems.
3. **Nothing educational is ever locked.** Everything is earnable. Keeps faith
   with *"an affordable math tutor for every child."*
4. **Accessibility is a gate** (contrast, math legibility, reduced-motion,
   IEP force-plain) — see the cosmetics spec.
5. **Attention budget.** Don't ship six meters at once; surface layers
   sequentially, each showing something real.

---

## Sequenced roadmap (by ROI, lowest risk first)

| # | Move | Status of substrate | Effort |
|---|---|---|---|
| 1 | ✅ Surface quests + status card + combo/identity chips | done | shipped |
| 2 | ✅ Coins wallet + earning | done | shipped |
| 3 | **Mastery Reputation (Learning/Confident/Proven)** surfacing | engine exists | low–med |
| 4 | **Tutor "proud of you" milestone messages** | tutorPlan exists | low–med |
| 5 | **Collections shelf** (badges as completable sets) | badges exist | low |
| 6 | **Cosmetics shop + spend** (Coins sink) | wallet exists | med |
| 7 | **Skill-tree visualization** | graph exists | med |
| 8 | **Student avatar glow-up** (revive 54 orphaned PNGs, gate by level/Coins) | art + schema exist | med |
| 9 | **Earned random drops + session-open surprise** | variable-ratio + Coins exist | med (guardrails) |
| 10 | **Tutor personality layers** + reactivate dormant tutor unlocks | unlock engine exists (dormant) | med |
| 11 | **Seasonal framework** | Pi Day exists | med |

**Throughline:** you have the telemetry (mastery pillars, badges, tutorPlan,
tier-3 behaviors, skill graph). Almost none of it is *shown back* to the student
as anticipation. Close that gap and Mathmatix stops feeling like school pretending
to be a game and starts feeling like a tutor you *want* to come back to.
