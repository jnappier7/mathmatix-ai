# MASTER MODE: Badge System & Mastery Architecture

## Philosophy

Master Mode is not "do 20 problems."

It's:
- **Proof of skill** (consistent, not lucky)
- **Pressure-tested** (spaced practice, mixed review, error recovery)
- **Visible status** (badges, tiers, streaks, mastery map)
- **Short feedback loops** (micro badges, progress rings, pop-ups)

**UX Goal:** A student always knows what to do next and always sees progress, even if small.

---

## 1. Badge Taxonomy: 4 Layers

### A) Skill Badges (the core)

Map to standards/skills: slope, solving equations, factoring, etc.

**Tiers** (badges upgrade visually, not multiply):
- **Bronze** = Can do it with support
  - 6-8 problems, 70% accuracy
  - Hints allowed (up to 2 per problem)
  - Single context (e.g., numeric only)

- **Silver** = Can do it independently
  - 10-12 problems, 80% accuracy
  - Limited hints (max 1 per problem)
  - Mixed formats (equations + word problems)

- **Gold** = Can do it mixed/in-context
  - 12-15 problems, 90% accuracy
  - Minimal hints (3 total across all problems)
  - Transfer contexts (graphs, tables, real-world)
  - Spaced practice (return after 2+ days, maintain performance)

- **Diamond** = Can teach it / explain / challenge variants
  - 15+ problems, 95% accuracy
  - Zero hints
  - Challenge problems (DOK level 3)
  - Must explain reasoning on 3 problems
  - Retention verified (30+ days later, still ≥90%)

**UI Spec:**
- One badge tile that upgrades visually
- Progress ring around badge (fills based on problems completed)
- Tier indicator (Bronze → Silver → Gold → Diamond)
- Hover tooltip shows criteria for next tier

**Database:**
```javascript
skillBadges: {
  type: Map,
  of: {
    skillId: String,
    currentTier: { type: String, enum: ['bronze', 'silver', 'gold', 'diamond'] },
    earnedDate: Date,
    progress: {
      problemsCompleted: Number,
      problemsCorrect: Number,
      hintsUsed: Number,
      lastAttemptDate: Date,
      retentionCheckDue: Date
    }
  }
}
```

---

### B) Strategy Badges (teacher moves system)

Reward **methods**, not just answers. Rare, fun, identity-building.

**Examples:**

**Algebra Strategy Badges:**
- **Double Distribution Disciple**
  - Uses distribution correctly (not FOIL autopilot)
  - Triggered when student expands `3(x+2)(x-5)` correctly in 3 separate problems

- **Box-in-the-Variable**
  - Isolates variable cleanly
  - Triggered when student solves 5 multi-step equations with perfect isolation steps

- **Side-by-Side Simplifier**
  - Simplifies rational expressions methodically
  - Triggered when student reduces 4 rational expressions without skipping steps

- **Factoring Ninja**
  - Recognizes patterns instantly (difference of squares, perfect square trinomial)
  - Triggered when student factors 3 challenging polynomials in <30 seconds each

**Meta-Strategy Badges:**
- **Error Hunter**
  - Finds mistakes in worked examples
  - Triggered when student correctly identifies errors in 5 flawed solutions

- **Multiple Paths Master**
  - Solves same problem using 2+ methods
  - Triggered when student demonstrates alternative solutions 3 times

- **Proof Checker**
  - Validates algebraic steps
  - Triggered when student verifies 5 multi-step solutions by substitution

**Geometry Strategy Badges:**
- **Angle Architect**
  - Uses angle relationships (complementary, supplementary, vertical)
  - Triggered after 8 correct applications across different contexts

- **Triangle Hunter**
  - Identifies triangle types and properties
  - Triggered after solving 6 problems requiring triangle classification

- **Pythagorean Pro**
  - Applies Pythagorean theorem in non-obvious contexts
  - Triggered after 5 real-world Pythagorean applications

**Earning Criteria:**
- Automatic detection via problem-solving patterns
- Not manually selectable (they "discover" you)
- Rare (only 10-15% of students earn each one)
- Permanent (once earned, always displayed)

**UI Spec:**
- Special badge shelf (separate from skill badges)
- Animated unlock (confetti + sound)
- Share-worthy (social proof)

**Database:**
```javascript
strategyBadges: [{
  badgeId: String,
  earnedDate: Date,
  triggerContext: {
    problemIds: [String],
    detectionReason: String
  }
}]
```

---

### C) Habits Badges (streaks, consistency, grit)

Not participation trophies. Tied to learning science.

**Examples:**

**Consistency Badges:**
- **Spaced Practice Pro** (7-day)
  - Returns after 2+ days and improves
  - Criteria: Complete 3 skill sessions with 2-day gaps, maintain/improve accuracy

- **Daily Grinder** (14-day streak)
  - Works on math 7+ days in a row
  - At least 5 problems per day

- **Marathon Mode** (30-day streak)
  - Consistent practice for a full month
  - No gaps longer than 2 days

**Resilience Badges:**
- **Comeback Kid**
  - Misses → retries → improves
  - Criteria: Score <70% → retry same skill → score ≥85%

- **Error Recovery**
  - Gets problem wrong → analyzes mistake → corrects on next attempt
  - Criteria: 5 successful error-correction cycles

- **Grit Award**
  - Attempts challenging problem 3+ times before succeeding
  - Criteria: 3 problems with ≥3 attempts each, all eventually correct

**Efficiency Badges:**
- **No Hint Needed**
  - Solves 5 in a row without hints
  - Resets on hint usage

- **Speed Demon**
  - Completes 10 problems in <2 minutes total
  - Must maintain ≥80% accuracy

- **Mixed Review Beast**
  - Handles interleaving without accuracy drop
  - Criteria: Complete mixed review (5+ skills) with ≥85% accuracy

**Metacognition Badges:**
- **Self-Checker**
  - Catches own mistakes before submitting
  - Criteria: Uses "Check My Work" feature 5 times, finds errors 80% of time

- **Strategy Switcher**
  - Tries different approach after getting stuck
  - Criteria: Requests hint, then solves using alternative method 3 times

**Earning Criteria:**
- Automatic based on behavior patterns
- No notification until earned (surprise factor)
- Can be re-earned (e.g., new 14-day streak)

**UI Spec:**
- Badge ribbon (like Xbox achievements)
- Progress bar for streak badges
- Subtle glow animation on earn

**Database:**
```javascript
habitBadges: [{
  badgeId: String,
  earnedDate: Date,
  count: Number, // For re-earnable badges
  currentStreak: Number, // For streak badges
  bestStreak: Number
}]
```

---

### D) Meta/Challenge Badges (special achievements)

Ultra-rare, community-building, aspirational.

**Examples:**

**Mastery Milestones:**
- **First Diamond**
  - Earn first Diamond-tier skill badge

- **Full Domain**
  - Master all skills in one domain (e.g., all Algebra 1 skills to Gold+)

- **Grade Level Complete**
  - Master all skills for a full grade level

- **Fluency King/Queen**
  - Achieve fluent speed on 20+ skills

**Community Badges:**
- **Tutor Training**
  - Help explain concept to peer (if peer tutoring enabled)

- **Challenge Creator**
  - Submit custom problem that gets accepted

**Event Badges:**
- **Math Marathon Champion**
  - Special event participation

- **Seasonal Achievement**
  - Time-limited challenges

**Earning Criteria:**
- Major milestones only
- <5% of students earn most of these
- Permanent and prestigious

---

## 2. Mastery Definition: The 4 Pillars

A skill is **Mastered** only when ALL four are true:

### Pillar 1: Accuracy
- ≥ 90% correct
- Across at least 12-15 problems
- No identical repeats
- Adaptive difficulty (IRT-based)

**Implementation:**
```javascript
accuracy: {
  correct: Number,
  total: Number,
  percentage: Number,
  threshold: 0.90
}
```

### Pillar 2: Independence
- Limited hints (≤3 total)
- No step-by-step handholding
- If hints spike, mastery freezes

**Implementation:**
```javascript
independence: {
  hintsUsed: Number,
  hintsAvailable: Number,
  hintThreshold: 3,
  autoStepUsed: Boolean // Auto-pause mastery if true
}
```

### Pillar 3: Transfer
- Mixed problem set
- Multiple representations (equations, graphs, tables, word problems)
- Different contexts, same concept

**Implementation:**
```javascript
transfer: {
  contextsAttempted: [String], // ['numeric', 'graphical', 'word-problem', 'real-world']
  contextsRequired: Number, // Minimum 3
  formatVariety: Boolean
}
```

### Pillar 4: Retention
- Skill resurfaces later (spaced repetition)
- Student still performs (≥80% after 7+ days)
- No "learn Friday, forget Monday"

**Implementation:**
```javascript
retention: {
  lastPracticed: Date,
  retentionChecks: [{
    checkDate: Date,
    daysSinceLastPractice: Number,
    accuracy: Number,
    passed: Boolean
  }],
  nextRetentionCheck: Date
}
```

---

## 3. Mastery State Machine

```
┌──────────┐
│  LOCKED  │ Prerequisites not met
└────┬─────┘
     │ Prerequisites completed
     ▼
┌──────────┐
│  READY   │ Can start learning
└────┬─────┘
     │ First problem attempted
     ▼
┌──────────┐
│ LEARNING │ Bronze tier progress (0-70% mastery score)
└────┬─────┘
     │ 70%+ mastery score
     ▼
┌──────────┐
│PRACTICING│ Silver/Gold tier progress (70-90% mastery score)
└────┬─────┘
     │ All 4 pillars met
     ▼
┌──────────┐
│ MASTERED │ Gold/Diamond tier (90-100% mastery score)
└────┬─────┘
     │ Retention check failed (<80% after 7+ days)
     ▼
┌──────────┐
│RE-FRAGILE│ Needs refresh (mastery score drops to 70-85%)
└────┬─────┘
     │ Performance recovered
     └──────► MASTERED
```

**State Transition Logic:**

```javascript
function calculateMasteryState(skill) {
  const { accuracy, independence, transfer, retention } = skill.pillars;
  const masteryScore = calculateMasteryScore(skill); // 0-100

  // Check prerequisites
  if (!allPrerequisitesMastered(skill.prerequisites)) {
    return 'locked';
  }

  // Never attempted
  if (skill.totalAttempts === 0) {
    return 'ready';
  }

  // Check retention (can fall out of mastery)
  if (skill.status === 'mastered' && retention.failed) {
    return 're-fragile';
  }

  // Check if all pillars met
  if (
    accuracy.percentage >= 0.90 &&
    independence.hintsUsed <= independence.hintThreshold &&
    transfer.contextsAttempted.length >= transfer.contextsRequired &&
    retention.checks.every(c => c.passed)
  ) {
    return 'mastered';
  }

  // Partial progress
  if (masteryScore >= 0.70) {
    return 'practicing';
  }

  return 'learning';
}
```

**Mastery Score Formula:**

```javascript
function calculateMasteryScore(skill) {
  const weights = {
    accuracy: 0.40,      // 40% weight
    independence: 0.20,  // 20% weight
    transfer: 0.20,      // 20% weight
    retention: 0.20      // 20% weight
  };

  const accuracyScore = skill.pillars.accuracy.percentage;

  const independenceScore = Math.max(0, 1 - (skill.pillars.independence.hintsUsed / 15));

  const transferScore = skill.pillars.transfer.contextsAttempted.length /
                        skill.pillars.transfer.contextsRequired;

  const retentionScore = skill.pillars.retention.checks.length > 0
    ? skill.pillars.retention.checks.filter(c => c.passed).length /
      skill.pillars.retention.checks.length
    : 0;

  return (
    accuracyScore * weights.accuracy +
    independenceScore * weights.independence +
    transferScore * weights.transfer +
    retentionScore * weights.retention
  ) * 100;
}
```

---

## 4. UX Specifications

### Progress Ring (Slow-Fill Animation)

**Visual Design:**
- Circular ring around badge
- 4-segment ring (one per pillar)
- Each segment fills independently
- Colors:
  - Empty: `#e0e0e0` (light gray)
  - Filling: `#ffb74d` (amber)
  - Complete: `#4caf50` (green)
  - Fragile: `#ff9800` (orange)

**Animation:**
- Segment fills over 0.5s (ease-out)
- Slight pulse when segment completes
- Ring glows subtly when all segments filled

**Tooltip Text (while practicing):**
- Bronze: "Getting started"
- Silver: "Solid progress"
- Gold: "Getting reliable"
- Diamond: "Nearly mastered"

**Segment Labels:**
- Accuracy (top)
- Independence (right)
- Transfer (bottom)
- Retention (left)

**Code Structure:**
```html
<div class="badge-progress-ring">
  <svg viewBox="0 0 100 100">
    <circle class="ring-segment accuracy" cx="50" cy="50" r="45" />
    <circle class="ring-segment independence" cx="50" cy="50" r="45" />
    <circle class="ring-segment transfer" cx="50" cy="50" r="45" />
    <circle class="ring-segment retention" cx="50" cy="50" r="45" />
  </svg>
  <div class="badge-icon"></div>
</div>
```

---

### Badge Upgrade Ceremony (Ceremonial but Brief)

**When Triggered:**
- All 4 pillars reach threshold for next tier
- E.g., Bronze → Silver (70% → 80% mastery score)

**Animation Sequence:**
1. **Pause** (0.5s): Screen dims slightly, focus on badge
2. **Ring Completion** (0.3s): All segments fill to 100%
3. **Badge Morph** (0.5s): Badge icon upgrades visually
4. **Text Reveal** (0.8s): Tier name appears
5. **Celebrate** (1.0s): Subtle confetti/sparkle effect
6. **Next Action** (immediate): Show next step

**Total Duration:** 3.1 seconds (not annoying)

**Modal Content:**
```
┌───────────────────────────────────┐
│                                   │
│     [Badge Icon - Upgraded]       │
│                                   │
│   "This skill is now reliable.    │
│    You'll see it again.           │
│    Don't panic."                  │
│                                   │
│   ┌─────────────────────────┐    │
│   │  Continue to Next Skill  │    │
│   └─────────────────────────┘    │
│                                   │
└───────────────────────────────────┘
```

**After Diamond Unlock:**
```
┌───────────────────────────────────┐
│                                   │
│     [Diamond Badge - Glowing]     │
│                                   │
│   "You can teach this now.        │
│    It's yours."                   │
│                                   │
│   ┌─────────────────────────────┐ │
│   │  View Mastery Map         │ │
│   └─────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

---

### Next-Action Prompts (Always Visible)

**Location:** Bottom of screen (sticky bar)

**Content (dynamic based on state):**

**During Badge Work:**
```
┌────────────────────────────────────────────────────┐
│  📊 Working on: Solving Two-Step Equations         │
│  Progress: 7/12 problems • 85% accuracy            │
│  Next: [Continue Practice] or [Take a Break]       │
└────────────────────────────────────────────────────┘
```

**After Badge Earned:**
```
┌────────────────────────────────────────────────────┐
│  ✨ Badge Earned! Ready for next challenge?        │
│  Recommended: [Multi-Step Equations] or [Choose]   │
└────────────────────────────────────────────────────┘
```

**During Re-Fragile State:**
```
┌────────────────────────────────────────────────────┐
│  ⚠️  Slope needs a refresh (30 days since practice)│
│  Quick tune-up: [Review Slope] (5 problems)        │
└────────────────────────────────────────────────────┘
```

**Mixed Review Due:**
```
┌────────────────────────────────────────────────────┐
│  🔄 Time for mixed review (5 skills, 10 problems)  │
│  Keeps your mastery sharp • [Start Review]         │
└────────────────────────────────────────────────────┘
```

---

## 5. Teacher-Facing Mastery Dashboard

**Purpose:** Instructional clarity - "Is this safe to build on?"

**View:** Skill grid for entire class

**Color Coding:**
- **Green** = Mastered (90-100% mastery score)
- **Yellow** = Fragile mastery (70-89% or re-fragile state)
- **Red** = Never stabilized (<70% after 10+ attempts)
- **Gray** = Not attempted or locked

**Data Display (per student, per skill):**
```
┌─────────────────────────────────────────────────┐
│ Student: Alex Chen                              │
│ Skill: Solving Two-Step Equations               │
│                                                 │
│ Status: 🟢 MASTERED (Gold tier)                 │
│ Mastery Score: 92%                              │
│                                                 │
│ Pillars:                                        │
│   ✓ Accuracy: 14/15 (93%)                       │
│   ✓ Independence: 2 hints used                  │
│   ✓ Transfer: 4 contexts                        │
│   ✓ Retention: Passed (7 days ago, 87%)         │
│                                                 │
│ Last Practiced: 12/15/2025                      │
│ Next Retention Check: 12/29/2025                │
│                                                 │
│ [View Problem History] [Assign Refresh]         │
└─────────────────────────────────────────────────┘
```

**Class Heatmap:**
```
Skill                        A.C. B.L. C.M. D.P. (students →)
─────────────────────────────────────────────────────────────
Solving One-Step Equations   🟢   🟢   🟢   🟢
Solving Two-Step Equations   🟢   🟡   🟢   🔴
Multi-Step Equations         🟡   ⚪   🟡   ⚪
Equations with Fractions     ⚪   ⚪   ⚪   ⚪
```

**Filters:**
- Show only fragile skills
- Show students below 70% on target skill
- Show retention checks due this week

**Export:**
- CSV download
- Standards alignment report
- Parent progress report

---

## 6. Implementation Checklist

### Database Schema
- [ ] Enhance `User.skillMastery` with 4-pillar structure
- [ ] Add `User.skillBadges` Map for skill badge tiers
- [ ] Add `User.strategyBadges` array
- [ ] Add `User.habitBadges` array
- [ ] Add `User.metaBadges` array
- [ ] Create retention check scheduler

### Backend Logic
- [ ] Implement mastery state machine
- [ ] Implement mastery score calculator
- [ ] Create badge detection system (strategy badges)
- [ ] Create habit tracking system
- [ ] Build retention check system (cron job)
- [ ] Add API endpoint: `GET /api/mastery/skill-status/:skillId`
- [ ] Add API endpoint: `POST /api/mastery/record-attempt` (enhanced)
- [ ] Add API endpoint: `GET /api/mastery/badges/all`
- [ ] Add API endpoint: `GET /api/mastery/teacher-dashboard`

### Frontend Components
- [ ] Build progress ring component (4-segment SVG)
- [ ] Build badge upgrade modal
- [ ] Build next-action sticky bar
- [ ] Update badge map to show tiers
- [ ] Add strategy badge shelf
- [ ] Add habit badge ribbon
- [ ] Build teacher dashboard view

### Testing
- [ ] Test mastery state transitions
- [ ] Test retention check system
- [ ] Test badge detection (strategy)
- [ ] Test habit tracking
- [ ] Test UI animations
- [ ] Test teacher dashboard data accuracy

---

## 7. Badge Definitions (Initial Set)

### Skill Badges (30 core skills)

**Algebra:**
1. Solving One-Step Equations
2. Solving Two-Step Equations
3. Multi-Step Equations
4. Equations with Fractions
5. Slope from Two Points
6. Graphing Linear Equations
7. Systems of Equations (Substitution)
8. Systems of Equations (Elimination)
9. Factoring GCF
10. Factoring Trinomials

**Geometry:**
11. Angle Relationships
12. Triangle Classification
13. Pythagorean Theorem
14. Area of Triangles
15. Area of Circles
16. Volume of Rectangular Prisms
17. Surface Area

**Fractions/Ratios:**
18. Simplifying Fractions
19. Adding Fractions
20. Multiplying Fractions
21. Dividing Fractions
22. Ratios and Proportions
23. Percent Problems
24. Unit Conversions

**Number Sense:**
25. Order of Operations
26. Integer Operations
27. Exponent Rules
28. Scientific Notation
29. Evaluating Expressions
30. Absolute Value

### Strategy Badges (15 initial)

1. Double Distribution Disciple
2. Box-in-the-Variable
3. Side-by-Side Simplifier
4. Factoring Ninja
5. Error Hunter
6. Multiple Paths Master
7. Proof Checker
8. Angle Architect
9. Triangle Hunter
10. Pythagorean Pro
11. Fraction Fluent
12. Ratio Reasoning
13. Graph Reader
14. Pattern Spotter
15. Estimation Expert

### Habits Badges (12 initial)

**Consistency:**
1. Spaced Practice Pro (7-day)
2. Daily Grinder (14-day streak)
3. Marathon Mode (30-day streak)

**Resilience:**
4. Comeback Kid
5. Error Recovery
6. Grit Award

**Efficiency:**
7. No Hint Needed
8. Speed Demon
9. Mixed Review Beast

**Metacognition:**
10. Self-Checker
11. Strategy Switcher
12. Question Asker

### Meta/Challenge Badges (8 initial)

1. First Diamond
2. Full Domain
3. Grade Level Complete
4. Fluency King/Queen
5. Tutor Training
6. Challenge Creator
7. Math Marathon Champion
8. Seasonal Achievement

---

## 8. Visual Design System

### Color Palette

**Badge Tiers:**
- Bronze: `#cd7f32` (classic bronze)
- Silver: `#c0c0c0` (metallic silver)
- Gold: `#ffd700` (bright gold)
- Diamond: `#b9f2ff` (ice blue with sparkle)

**Status Colors:**
- Locked: `#9e9e9e` (gray)
- Ready: `#2196f3` (blue)
- Learning: `#ffb74d` (amber)
- Practicing: `#ff9800` (orange)
- Mastered: `#4caf50` (green)
- Re-Fragile: `#f44336` (red)

**Badge Categories:**
- Skill: `#1976d2` (dark blue)
- Strategy: `#7b1fa2` (purple)
- Habits: `#388e3c` (green)
- Meta: `#f57c00` (deep orange)

### Typography

**Badge Names:**
- Font: `'Poppins', sans-serif` (bold, 600 weight)
- Size: 18px
- Letter-spacing: 0.5px

**Descriptions:**
- Font: `'Inter', sans-serif` (regular, 400 weight)
- Size: 14px
- Line-height: 1.5

### Iconography

**Badge Icons:**
- Skill badges: Subject-specific icons (equation symbol, protractor, ruler, etc.)
- Strategy badges: Action icons (target, lightbulb, magnifying glass, etc.)
- Habits badges: Achievement icons (flame, trophy, star, etc.)
- Meta badges: Special icons (crown, diamond, shield, etc.)

**Icon Library:** Font Awesome 6 (already in use)

---

## 9. Student-Facing Copy

### Mastery Messaging

**Bronze Tier:**
> "You're getting the hang of this! Keep practicing with support."

**Silver Tier:**
> "You can do this independently now. Let's add some variety."

**Gold Tier:**
> "This skill is reliable. You'll see it mixed with others soon."

**Diamond Tier:**
> "You own this. You could teach someone else."

### State Messaging

**Locked:**
> "Complete [prerequisite skills] first to unlock this badge."

**Ready:**
> "Ready to start! This builds on what you already know."

**Learning:**
> "Take your time. Mistakes help you learn."

**Practicing:**
> "You're getting more consistent. Keep going."

**Mastered:**
> "This skill is solid. It'll show up in mixed review to stay sharp."

**Re-Fragile:**
> "Time for a quick refresh! You've got this—just needs a tune-up."

### Strategy Badge Unlocks

**Double Distribution Disciple:**
> "You've mastered distributing across parentheses! Most students forget this step."

**Error Hunter:**
> "You're great at catching mistakes! This skill will make you a better problem-solver."

**Multiple Paths Master:**
> "You found different ways to solve the same problem. That's expert-level thinking."

---

## 10. Technical Architecture

### Data Flow

```
Student attempts problem
        │
        ▼
Problem result recorded
        │
        ├─► Update skill mastery pillars
        ├─► Recalculate mastery score
        ├─► Check mastery state transition
        ├─► Check badge tier eligibility
        ├─► Detect strategy badge triggers
        ├─► Update habit tracking
        └─► Schedule retention check
        │
        ▼
Real-time UI update
        ├─► Progress ring animation
        ├─► Badge tier upgrade (if earned)
        ├─► Next-action prompt
        └─► Teacher dashboard refresh
```

### Cron Jobs

**Daily (midnight):**
- Check habit streaks
- Award streak badges
- Reset daily counters

**Weekly (Sunday midnight):**
- Generate retention check queue
- Identify re-fragile skills
- Send teacher digest email

**Monthly (1st of month):**
- Archive old attempt data
- Generate progress reports
- Update leaderboards (if enabled)

### Performance Optimization

**Caching:**
- Badge catalog cached client-side (localStorage)
- Mastery state cached per session
- Teacher dashboard cached for 5 minutes

**Database Indexes:**
- `User.skillMastery` indexed by skillId
- `User.badges` indexed by badgeId and earnedDate
- `Attempt.timestamp` indexed for retention queries

**Lazy Loading:**
- Badge icons loaded on scroll (badge map)
- Teacher dashboard loads 25 students at a time
- Problem history paginated (50 per page)

---

## 11. Success Metrics

### Student Engagement
- **Badge earn rate:** % of students earning ≥1 badge per week
- **Streak retention:** % of students maintaining 7+ day streaks
- **Return rate:** % of students returning after re-fragile notification

### Learning Outcomes
- **Mastery stability:** % of mastered skills maintaining ≥80% after 30 days
- **Transfer success:** % of students succeeding on first transfer problem
- **Independence growth:** Average hint usage decrease over time

### UX Quality
- **Badge upgrade satisfaction:** Survey rating after tier upgrade
- **Next-action click rate:** % clicking suggested next action
- **Progress clarity:** % of students who can explain their status

---

## 12. Future Enhancements

**Social Features:**
- Badge showcases (student profiles)
- Leaderboards (opt-in, class-level only)
- Peer tutoring unlocks (Diamond badge holders)

**Adaptive Pathways:**
- AI-recommended badge sequences
- Personalized mastery timelines
- Learning style adaptations

**Gamification:**
- Badge collections (themed sets)
- Seasonal challenges
- Bonus XP events

**Analytics:**
- Predictive mastery modeling
- Struggle pattern detection
- Intervention recommendations

---

**End of Master Mode Badge System Design**

