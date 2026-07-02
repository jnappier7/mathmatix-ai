# XP, Leveling, Tutor Unlock & Leaderboard — System Overview

> Status report of the gamification/progression system **as it currently exists in code**
> (verified against source, not design docs). Where the code and the intended design diverge,
> that divergence is called out explicitly.

---

## 1. The big picture

XP is a **pure engagement + behavior-reinforcement currency**. There is **no spend/store
mechanic** — you cannot buy anything with XP. XP does exactly three things:

1. Accumulates on `user.xp` and drives `user.level` up a mildly increasing curve.
2. Levels gate a small set of unlocks (Avatar Builder, tutor characters) and scale quest/challenge difficulty.
3. XP + level determine **leaderboard ranking**.

The system is deliberately built on **variable-ratio reinforcement** ("keep them guessing")
— XP amounts, unlock timing, and teaser messaging are all designed around a dopamine loop.

**Key files**

| Concern | File |
|---|---|
| Per-turn XP calc + level-up + unlock application | `utils/pipeline/xpEngine.js` |
| Config: XP amounts, level curve, boost | `utils/brand.js` (lines 74–205) |
| Tutor unlock logic (variable ratio) | `utils/unlockTutors.js` |
| Tutor definitions + unlock gates | `utils/tutorConfig.js` |
| New-user boost factor | `utils/promptCompressor.js:174–205` |
| Pipeline wiring (where XP is applied each turn) | `utils/pipeline/persist.js:348–360` |
| Leaderboard API | `routes/leaderboard.js` |
| Frontend display, celebrations, teasers | `public/js/modules/gamification.js` |
| Storage | `models/user.js` (`xp`, `level`, `xpLadderStats`, `unlockedItems`, `avatarBuilderUnlocked`) |
| Bulk XP sources | `routes/dailyQuests.js`, `routes/weeklyChallenges.js`, `routes/mastery.js` |

---

## 2. How XP is earned per chat turn — the three-tier "XP ladder"

Every student turn runs `computeXpBreakdown()` (`xpEngine.js:27–66`), driven by
`BRAND_CONFIG.xpLadder` (`brand.js:85–124`). It produces up to three tiers:

### Tier 1 — Turn XP (engagement)
- **+2 XP on every single turn**, unconditionally (`brand.js:87–92`, engine line 32).
- **Silent** — no UI notification. Pure "showing up" reinforcement.

### Tier 2 — Performance XP (correct answers only)
Awarded only when `wasCorrect` is true (engine lines 35–41):
- **+10 XP ("clean")** — correct without asking for help.
- **+5 XP ("correct")** — correct, but the student asked for a hint in the last ~6 messages.
- Hint detection: regex `/\b(hint|help|stuck|don'?t know|idk|confused)\b/i` over recent **user** messages (engine line 14).
- Hard cap: `maxTier2PerTurn = 10`.

### Tier 3 — Core Behavior XP (the ceremonial reward)
The tutor LLM emits a `<CORE_BEHAVIOR_XP:amount,behavior>` tag, extracted upstream and passed
in as `extracted.coreBehaviorXp` (engine lines 44–49). Amounts (`brand.js:105–109`):
- **25 (small)** — good reasoning shown.
- **50 (medium)** — caught own error / strategy selection.
- **100 (large)** — transfer / persistence through struggle.

Six recognized trigger behaviors (`brand.js:110–117`):
`explained_reasoning`, `caught_own_error`, `strategy_selection`, `persistence`, `transfer`, `taught_back`.

Cap: `maxTier3PerTurn = 100` (scaled by boost — see below).

**Legacy fallback:** older model outputs emitting `legacyXp` are routed into Tier 2, capped at 10 (engine lines 50–54).

### Turn total & course boost
`total = tier1 + tier2 + tier3`. If the turn is inside a structured course session
(`user.activeCourseSessionId`), the **entire total is multiplied by 1.5×** (engine lines 59–63).

---

## 3. New-user boost (first 15 levels)

`calculateXpBoostFactor(level)` (`promptCompressor.js:174–205`) multiplies **Tier 3 only**:

- **Levels 1–5:** flat **2.0×** (both the award *and* the Tier-3 cap are scaled — engine lines 45–48). Prompt guidance set to `'high'` (AI actively hunts for XP-worthy behaviors).
- **Levels 6–14:** fades linearly from 2.0× down toward 1.0×
  (`factor = 2.0 - fadeProgress*(1.0)`, where `fadeProgress = (level-6)/9`).
- **Level 15+:** **1.0×** (no boost).

Config lives in `brand.js:129–151` (`newUserBoost`). The intent is early momentum that
tapers as the student matures.

---

## 4. Applying XP + leveling up

`applyXpToUser(user, breakdown)` (`xpEngine.js:77–128`) mutates the user doc (caller saves):

1. `user.xp += breakdown.total`.
2. Accumulates lifetime analytics in `user.xpLadderStats` (`lifetimeTier1/2/3` and a
   per-behavior `tier3Behaviors[]` with counts + `lastEarned`). These behavior counts feed
   tutor unlocks (§6).
3. **Level-up loop** (lines 104–108): bumps `user.level` while
   `user.xp >= cumulativeXpForLevel(level+1)`.
4. Runs tutor-unlock check (§6) and Avatar Builder unlock (§5).

Wired into the pipeline at `persist.js:349–360` (main chat) and mirrored in the standalone
course path — both call the same shared engine, by design.

### The level curve (`brand.js:166–183`)
- `xpPerLevel = 100`, `xpScalingFactor = 0.1` (each level costs 10% more than the previous).
- **XP to go from level L → L+1:** `round(100 * (1 + 0.1*(L-1)))`
  - Level 1→2 = **100**, 5→6 = **140**, 10→11 = **190**, 20→21 = **290**.
- `cumulativeXpForLevel(L)` sums the per-level costs to get total XP to *reach* level L.

---

## 5. Avatar Builder unlock

- Unlocks at **Level 2** (`xpEngine.js:121–125`), sets `user.avatarBuilderUnlocked = true`.
- Only fires on a level-up transition, one time.

---

## 6. Tutor unlock system (`utils/unlockTutors.js`)

This is the **primary intended reward** for leveling. Each unlockable tutor in `tutorConfig.js`
has: `unlockLevel` (minimum), `unlockLevelMax` (guaranteed by), `unlockTrigger` (a Tier-3
behavior), and `unlockTriggerCount`.

`getTutorsToUnlock(level, unlockedItems, behaviorStats)` unlocks a tutor when **all** hold:
1. `level >= unlockLevel`, and the tutor isn't already unlocked, and is not `active:false`.
2. **One of:**
   - **Behavior trigger:** the linked behavior has been demonstrated `>= unlockTriggerCount` times.
   - **Guaranteed:** `level >= unlockLevelMax`.
   - **Variable-ratio roll:** probability ramps from **15% at `unlockLevel` → ~70% near `unlockLevelMax`**
     (`0.15 + 0.55*(progress/range)`, lines 57–68). The roll is *deterministic per (tutorId, level)*
     via a string hash, so it doesn't flip-flop between requests within the same level.

### The configured tutor gates (`tutorConfig.js`)

| Tutor | unlockLevel–Max | Behavior trigger (×count) | Narrative |
|---|---|---|---|
| Ms. Rashida | 5–7 | `persistence` ×1 | "unlocks because you didn't give up" |
| Mr. Sierawski | 8–12 | `persistence` ×3 | wrestling coach — grit |
| Prof. Davies | 13–17 | `explained_reasoning` ×2 | intellectual curiosity |
| Ms. Alex | 18–22 | `strategy_selection` ×2 | thought before solving |
| Mr. Lee | 22–27 | `caught_own_error` ×3 | precision / self-correction |
| Dr. G | 27–32 | `transfer` ×2 | strength spans domains |
| Mr. Wiggles | 32–37 | `taught_back` ×2 | taught it back |

### ⚠️ Current state: tutor unlock is DORMANT
**All seven unlockable tutors are currently `active: false`** in `tutorConfig.js`
(the "INACTIVE TUTORS" block, lines 66+). `getTutorsToUnlock` filters out any tutor with
`active === false` (`unlockTutors.js:35`). The four starting tutors (**Bob, Maya, Ms. Maria,
Mr. Nappier**) are `unlocked: true` with no `unlockLevel`, so they're skipped too.

**Net effect: `getTutorsToUnlock` returns nothing today — no tutor can actually be unlocked
via XP right now.** The entire mechanic (level gates, behavior triggers, variable-ratio rolls,
the "Mortal Kombat" reveal UI) is fully built and wired, but gated off behind the `active`
flags. Per the code comment, any tutor can be reactivated later by removing its `active:false`
flag (voices, personas, and unlock config are all intact).

---

## 7. Other XP sources (bulk XP)

Beyond per-turn XP, three systems award larger chunks (numbers per the route files):

- **Daily Quests** (`routes/dailyQuests.js`): 3 quests/day (`streakKeeper` always included).
  Rewards range **25–100 XP** (streakKeeper 25; problemSolver/explorer 50; speedster 60;
  skillBuilder/accuracyAce 75; masteryHunter/perfectionist 100), added directly to `user.xp`
  on completion. **Pi Day (Mar 14)** swaps in a special quest set with a **3.14× multiplier**.
  Quest target counts scale with level: `floor(level/5)`.
- **Weekly Challenges** (`routes/weeklyChallenges.js`): 3/week, **300–750 XP** each plus a
  `specialReward` (badges, "2× XP Weekend Pass", etc.). Difficulty scales `floor(level/10)`.
- **Mastery-mode badges** (`routes/mastery.js`): each badge earned grants a flat **+500 XP** bonus.

---

## 8. Streaks

Two parallel streak notions:
- **Daily-quest streak** (`user.dailyQuests.currentStreak/longestStreak`), bumped by
  `bumpDailyStreak()` (`utils/gamificationEvents.js`) on every substantive turn
  (`persist.js:377`). Consecutive-day logic; a **weekly streak freeze** absorbs a single
  1-day gap; a gap > 1 day resets the streak to 1.
- **Paper-progress streak** fields on the user doc (separate feature).

⚠️ **Display-only multiplier:** `routes/dailyQuests.js` exposes
`streakMultiplier = 1 + min(streak*0.01, 0.5)` (up to 1.5×) in the stats endpoint, but **no
code path actually applies it to earned XP**. Streaks currently drive the `streakKeeper` quest
and UI only — not a real XP multiplier.

---

## 9. Leaderboard (`routes/leaderboard.js`)

- `GET /api/leaderboard`, guarded by `isAuthorizedForLeaderboard`.
- Returns **top 10 students**, sorted by **`level` desc, then `xp` desc**.
- **Scope by role:**
  - Teacher → only their own students (`teacherId == req.user._id`).
  - Student → classmates sharing their `teacherId`; if the student has no teacher, a **global**
    leaderboard.
  - Admin → all students.
  - Demo/clone accounts excluded.
- **FERPA:** names formatted "First L."; students who opted out of directory info via
  `hasOptedOutOfDirectoryInfo()` are redacted to `"Student"` with `level` hidden (XP still returned).

---

## 10. Frontend display & celebrations (`public/js/modules/gamification.js`)

The server sends the client `xpForCurrentLevel` (XP within the current level) and
`xpForNextLevel` (= `xpRequiredForLevel(level)`), computed in `routes/chat.js` (~lines 286,
411–419, 466–474, 1503–1510) and `routes/courseChat.js`.

- **Sidebar** (`updateGamificationDisplay`): shows level, an `X / Y XP` label, and a progress
  bar filled to `xpForCurrentLevel / xpForNextLevel`.
- **Floating XP animation** (`triggerXpAnimation`): pops "+N XP" text over the chat; a
  `special-xp` style for larger awards.
- **Level-up celebration** (`showLevelUpCelebration` + `triggerXpAnimation` level-up branch):
  brand-colored confetti; an in-place "tutor comes to life" hero overlay, falling back to a
  fullscreen modal video. Every **5th level** is a milestone → bigger `LEVEL N!` treatment.
  Only tutors in `TUTORS_WITH_CELEBRATION_VIDEO` (bob, maya, mr-nappier, ms-maria) get the video modal.
- **Tutor unlock reveal** (`showTutorUnlockCelebration`): a "Mortal Kombat"-style full-screen
  reveal, cycling through each newly unlocked tutor (image, catchphrase, specialties).
  *(Currently never triggers — see §6.)*
- **Proximity teaser** (`showUnlockProximityTeaser`): when within **3 levels** of an upcoming
  unlock, shows a deliberately vague toast ("Something's about to unlock… keep going!") — it
  hard-codes the unlock ladder (Avatar Builder @2, tutors @5/8/13/18/22/27/32) but hides exact
  levels to preserve the variable-ratio mystery.
- **Quest/challenge completion** (`processGamificationEvents`): toasts with earned XP + confetti.
- **Badge award** (`processBadgeAward`): full modal with tier + `+N XP`.

---

## 11. Data model (`models/user.js`)

| Field | Meaning |
|---|---|
| `xp` (default 0) | Total lifetime XP |
| `level` (default 1) | Current level |
| `xpLadderStats` | `{ lifetimeTier1, lifetimeTier2, lifetimeTier3, tier3Behaviors:[{behavior,count,lastEarned}] }` |
| `unlockedItems[]` | Unlocked tutor IDs (empty in practice today — §6) |
| `avatarBuilderUnlocked` | Set true at level 2 |
| `dailyQuests.currentStreak / longestStreak` | Daily streak state |

---

## 12. Summary of "what currently exists vs. dormant"

**Fully live today:**
- 3-tier per-turn XP (2 / 5–10 / 25–100), course 1.5× boost, new-user 2×→1× Tier-3 boost.
- Leveling on the scaling curve; level-up confetti + celebration modal.
- Avatar Builder unlock at level 2.
- Daily quests, weekly challenges, mastery-badge XP.
- Daily streaks (with weekly freeze).
- Leaderboard (role-scoped, FERPA-aware).
- Full sidebar/animation/teaser UI.

**Built but currently inactive:**
- **Tutor unlocking** — the entire variable-ratio + behavior-trigger engine and reveal UI are
  wired, but every unlockable tutor is `active:false`, so no unlocks fire. Reactivating is a
  one-line flag flip per tutor.
- **Streak XP multiplier** — computed and surfaced, but not applied to earned XP.
