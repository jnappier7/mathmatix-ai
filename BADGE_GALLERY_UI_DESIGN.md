# Badge Gallery UI Design

## Overview

A visual badge collection interface where students can:
1. **View all badges** they can potentially earn
2. **See badge states**: Locked (prerequisites unmet), Available (can earn now), Earned (unlocked)
3. **Select available badges** to trigger AI-guided learning, conversation, and assessment

This transforms badges from passive rewards into **active learning entry points**.

---

## Badge States & Visual Design

### **Three Badge States**

#### **1. Locked 🔒 (Prerequisites Not Met)**
```
┌──────────────────┐
│   🔒             │  ← Lock icon overlay
│   [GREY/DIMMED]  │  ← Desaturated badge image
│   Fraction       │
│   Wizard         │
│                  │
│   Requires:      │
│   ✗ Number Sense │  ← Red X for unmet prerequisites
│   ✗ Basic Add    │
└──────────────────┘

Visual: 30% opacity, lock icon, no hover effect, not clickable
```

#### **2. Available ⭐ (Can Earn Now - Greyed)**
```
┌──────────────────┐
│   ⭐             │  ← Star/sparkle indicating available
│   [GREYSCALE]    │  ← Full detail but no color yet
│   Fraction       │
│   Wizard         │
│                  │
│   [Click to      │
│    Start! →]     │
└──────────────────┘

Visual: 70% opacity, greyscale, hover effect, pulsing border, CLICKABLE
```

#### **3. Earned 🏆 (Unlocked)**
```
┌──────────────────┐
│   ✨             │  ← Shine/glow effect
│   [FULL COLOR]   │  ← Vibrant, full color badge
│   Fraction       │
│   Wizard         │
│                  │
│   Earned:        │
│   Jan 15, 2024   │
│   +400 XP        │
└──────────────────┘

Visual: 100% opacity, full color, gold border, subtle glow
```

---

## Badge Gallery Layout

### **Mobile-First Grid View**

```
┌──────────────────────────────────────────────────────┐
│  🏆 Badge Gallery                   [Filter ▼] [🔍]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Your Progress: 12/50 Badges Earned (24%)           │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │  [🏆]   │  │  [⭐]   │  │  [🔒]   │             │
│  │ ████    │  │         │  │         │             │
│  │         │  │Equation │  │Geometry │             │
│  │Number   │  │ Solver  │  │  Guru   │             │
│  │Explorer │  │         │  │         │             │
│  │         │  │[Start→] │  │ Locked  │             │
│  │Earned! ✓│  │         │  │         │             │
│  └─────────┘  └─────────┘  └─────────┘             │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │  [⭐]   │  │  [⭐]   │  │  [🔒]   │             │
│  │         │  │         │  │         │             │
│  │Fraction │  │ Integer │  │Calculus │             │
│  │ Wizard  │  │ Warrior │  │  King   │             │
│  │         │  │         │  │         │             │
│  │[Start→] │  │[Start→] │  │ Locked  │             │
│  │75% done │  │         │  │         │             │
│  └─────────┘  └─────────┘  └─────────┘             │
│                                                      │
│  [Show More Badges ↓]                                │
└──────────────────────────────────────────────────────┘
```

### **Desktop Detailed View**

```
┌─────────────────────────────────────────────────────────────────┐
│  🏆 Badge Gallery                                               │
├──────────────────┬──────────────────────────────────────────────┤
│  Filters:        │  All Badges (50)                             │
│                  │                                              │
│  ☑ Available (8) │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│  ☐ Earned (12)   │  │ 🏆  │ │ ⭐  │ │ ⭐  │ │ 🔒  │ │ ⭐  │  │
│  ☐ Locked (30)   │  │████ │ │     │ │     │ │     │ │     │  │
│                  │  │Num  │ │Eqn  │ │Frac │ │Geo  │ │Int  │  │
│  Categories:     │  │Exp  │ │Solv │ │Wiz  │ │Guru │ │War  │  │
│  ☐ Grade K-5     │  │✓    │ │→    │ │→    │ │🔒   │ │→    │  │
│  ☑ Grade 6-8     │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  │
│  ☐ High School   │                                              │
│  ☐ Advanced      │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│                  │  │ ⭐  │ │ 🔒  │ │ 🔒  │ │ ⭐  │ │ 🏆  │  │
│  Rarity:         │  │     │ │     │ │     │ │     │ │████ │  │
│  ☐ Common        │  │Perc │ │Poly │ │Trig │ │Rat  │ │Oper │  │
│  ☐ Rare          │  │Pro  │ │Pio  │ │Mas  │ │Exp  │ │Mas  │  │
│  ☐ Epic          │  │→    │ │🔒   │ │🔒   │ │→    │ │✓    │  │
│  ☐ Legendary     │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  │
└──────────────────┴──────────────────────────────────────────────┘
```

---

## Badge Selection Flow

### **Step 1: Student Clicks Available Badge**

```
Student clicks: [Fraction Wizard Badge ⭐]
                (Currently greyscale/available)

↓

System checks:
- Prerequisites: ✓ All met
- Current progress: 3/4 skills mastered (75%)
- Remaining: Fraction Division
```

### **Step 2: Badge Detail Modal Opens**

```
┌──────────────────────────────────────────────────────┐
│  🍕 Fraction Wizard Badge                     [×]    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────┐                                │
│  │   [GREYSCALE]   │  ← Badge preview (not earned)  │
│  │      🍕         │                                │
│  │  Fraction Wiz   │                                │
│  └─────────────────┘                                │
│                                                      │
│  Master all fraction operations and become a        │
│  fraction wizard!                                   │
│                                                      │
│  🎯 Requirements:                                   │
│  ✅ Fraction Addition        [🟢🟢🟢🟢🟢] 100%      │
│  ✅ Fraction Subtraction     [🟢🟢🟢🟢🟢] 100%      │
│  ✅ Fraction Multiplication  [🟢🟢🟢🟢🟢] 100%      │
│  🔵 Fraction Division        [🔵🔵🔵⚪⚪] 60%       │
│                                                      │
│  🎁 Rewards:                                        │
│  • +400 XP                                          │
│  • 1.05x XP Multiplier (permanent)                  │
│  • Unlock advanced fraction problems               │
│                                                      │
│  Progress: 75% complete (1 skill remaining)         │
│  Estimated time: 15-20 minutes                      │
│                                                      │
│  [Start Learning! 🚀]  [Cancel]                     │
└──────────────────────────────────────────────────────┘
```

### **Step 3: AI-Guided Learning Begins**

When student clicks **"Start Learning!"**, the system initiates a three-phase flow:

#### **Phase A: AI Lesson (Teaching)**

```
┌──────────────────────────────────────────────────────┐
│  🎯 Learning: Fraction Division                      │
│  (Working towards: 🍕 Fraction Wizard Badge)         │
├──────────────────────────────────────────────────────┤
│                                                      │
│  AI Tutor (Mr. Nappier):                            │
│                                                      │
│  Hey! I see you want to earn the Fraction Wizard    │
│  badge. Nice! You've already mastered adding,       │
│  subtracting, and multiplying fractions. Let's      │
│  tackle division now!                               │
│                                                      │
│  Here's the key idea: dividing by a fraction is     │
│  the same as multiplying by its reciprocal.         │
│                                                      │
│  For example:                                       │
│  1/2 ÷ 1/4  =  1/2 × 4/1  =  4/2  =  2              │
│                                                      │
│  See how we flipped 1/4 to become 4/1? That's       │
│  the reciprocal! Then we just multiply.             │
│                                                      │
│  [Visual diagram showing flip]                      │
│                                                      │
│  Make sense so far?                                 │
│                                                      │
│  [Yeah, I get it]  [Can you explain more?]          │
└──────────────────────────────────────────────────────┘
```

#### **Phase B: Conversational Practice**

```
┌──────────────────────────────────────────────────────┐
│  🎯 Practicing: Fraction Division                    │
│  Progress: [🔵🔵🔵🔵⚪⚪⚪⚪⚪⚪] 40% → 80%            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  AI: Great! Let's try one together. Can you solve   │
│      this?                                          │
│                                                      │
│      3/4 ÷ 1/2 = ?                                  │
│                                                      │
│  Student: I flip the second one to 2/1?             │
│                                                      │
│  AI: Exactly! So now you have 3/4 × 2/1. What's     │
│      that equal?                                    │
│                                                      │
│  Student: 6/4... which simplifies to 3/2!           │
│                                                      │
│  AI: Perfect! You're really getting this! 🎉        │
│      [🔵🔵🔵🔵🔵🔵⚪⚪⚪⚪] 60%                        │
│                                                      │
│      Let's try a couple more to make sure you've    │
│      got it down solid...                           │
│                                                      │
│  [Continue Practice]                                │
└──────────────────────────────────────────────────────┘
```

#### **Phase C: Assessment (Mastery Check)**

```
┌──────────────────────────────────────────────────────┐
│  🎯 Mastery Assessment: Fraction Division            │
│  You're ready for the final check!                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Solve these 5 problems to demonstrate mastery:     │
│                                                      │
│  1. 2/3 ÷ 1/6 = _______                             │
│     Your answer: 4       ✅ Correct!                 │
│                                                      │
│  2. 5/8 ÷ 3/4 = _______                             │
│     Your answer: 5/6     ✅ Correct!                 │
│                                                      │
│  3. 1/2 ÷ 2/5 = _______                             │
│     Your answer: 5/4     ✅ Correct!                 │
│                                                      │
│  4. 7/10 ÷ 1/5 = _______                            │
│     Your answer: [_____]  [Submit]                   │
│                                                      │
│  Progress: 3/5 correct so far                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### **Step 4: Badge Earned! 🎉**

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              🎉 BADGE EARNED! 🎉                     │
│                                                      │
│          ┌─────────────────────┐                    │
│          │   [FULL COLOR]      │  ← Now in color!   │
│          │       🍕            │                    │
│          │  Fraction Wizard    │                    │
│          └─────────────────────┘                    │
│                                                      │
│  Congratulations! You've mastered all fraction      │
│  operations!                                        │
│                                                      │
│  🎁 Rewards Unlocked:                               │
│  ✨ +400 XP (760 total XP!)                         │
│  ✨ 1.05x XP Multiplier (now 1.15x total!)          │
│  ✨ Advanced fraction problems unlocked             │
│                                                      │
│  🏆 Fraction Division: [🟢🟢🟢🟢🟢] Mastered!       │
│                                                      │
│  💬 Mr. Nappier: "Amazing work! You tackled         │
│     fraction division like a pro. I'm proud         │
│     of you! 🎉"                                     │
│                                                      │
│  What's next?                                       │
│  [View Badge Collection]  [Continue Learning]       │
└──────────────────────────────────────────────────────┘
```

### **Step 5: Badge Collection Updated**

```
Badge Gallery now shows:

┌──────────────┐
│   [🏆]       │  ← Now FULL COLOR with glow
│  ████████    │
│   🍕         │
│  Fraction    │
│   Wizard     │
│              │
│  Earned! ✓   │
│  Jan 15      │
└──────────────┘
```

---

## Badge Detail States

### **Locked Badge (Clicked - Shows Requirements)**

```
┌──────────────────────────────────────────────────────┐
│  🔒 Algebra 1 Complete Badge              [×]        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────┐                                │
│  │   [LOCKED]      │  ← Lock icon, very dimmed      │
│  │      🔒         │                                │
│  │  Algebra 1      │                                │
│  └─────────────────┘                                │
│                                                      │
│  Master all core Algebra 1 skills to unlock this    │
│  prestigious badge!                                 │
│                                                      │
│  🔒 Prerequisites Not Met:                          │
│  ❌ Linear Legend                                   │
│  ❌ Polynomial Pioneer                              │
│  ❌ Quadratic Champion                              │
│                                                      │
│  🎁 Rewards (when earned):                          │
│  • +2500 XP                                         │
│  • 1.15x XP Multiplier                              │
│  • Unlock Algebra 2 content                         │
│                                                      │
│  💡 Tip: Complete the three prerequisite badges     │
│     first, then this will unlock automatically!     │
│                                                      │
│  [View Prerequisites]  [Close]                      │
└──────────────────────────────────────────────────────┘
```

### **Available Badge (In Progress - Shows Current Status)**

```
┌──────────────────────────────────────────────────────┐
│  ⭐ Equation Solver Badge                   [×]      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────┐                                │
│  │   [GREYSCALE]   │  ← Available but not earned    │
│  │      ⭐         │                                │
│  │   Equation      │                                │
│  │    Solver       │                                │
│  └─────────────────┘                                │
│                                                      │
│  Master one-step and two-step equations!            │
│                                                      │
│  🎯 Requirements:                                   │
│  ✅ One-Step Add/Sub      [🟢🟢🟢🟢🟢] 100%         │
│  ✅ One-Step Mult/Div     [🟢🟢🟢🟢🟢] 100%         │
│  🔵 Two-Step Equations    [🔵🔵🔵🔵🔵⚪⚪⚪⚪⚪] 50%  │
│                                                      │
│  Progress: 67% complete                             │
│  Estimated time: 20 minutes                         │
│                                                      │
│  💬 "You're more than halfway there! Let's finish   │
│     Two-Step Equations together!"                   │
│                                                      │
│  [Continue Learning 🚀]  [Cancel]                   │
└──────────────────────────────────────────────────────┘
```

### **Earned Badge (Clicked - Shows Achievement)**

```
┌──────────────────────────────────────────────────────┐
│  🏆 Integer Warrior Badge                  [×]       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────┐                                │
│  │  [FULL COLOR]   │  ← Vibrant, glowing            │
│  │      ⚔️         │                                │
│  │    Integer      │                                │
│  │    Warrior      │                                │
│  └─────────────────┘                                │
│                                                      │
│  Mastered all integer operations!                   │
│                                                      │
│  ✅ Skills Mastered:                                │
│  • Understanding Integers                           │
│  • Adding Integers                                  │
│  • Subtracting Integers                             │
│  • All Integer Operations                           │
│                                                      │
│  🎁 Rewards:                                        │
│  • +300 XP (Earned!)                                │
│  • 1.04x XP Multiplier (Active!)                    │
│                                                      │
│  📅 Earned: January 12, 2024                        │
│  ⏱️ Time spent: 2.5 hours                           │
│  🎯 Problems solved: 47                             │
│                                                      │
│  💬 Mr. Nappier said: "You crushed those negative   │
│     numbers! Awesome work!"                         │
│                                                      │
│  [Share Badge]  [Close]                             │
└──────────────────────────────────────────────────────┘
```

---

## Badge Gallery Filters & Search

### **Filter Options**

```
┌──────────────────────────────────────┐
│  Filter Badges:                      │
│                                      │
│  Status:                             │
│  ☑ Available Now (8)                 │
│  ☐ In Progress (3)                   │
│  ☐ Earned (12)                       │
│  ☐ Locked (27)                       │
│                                      │
│  Phase:                              │
│  ☐ Foundations (K-5)                 │
│  ☑ Middle School (6-8)               │
│  ☐ High School                       │
│  ☐ Advanced                          │
│                                      │
│  Category:                           │
│  ☐ Skill Mastery                     │
│  ☐ Grade Complete                    │
│  ☐ Course Complete                   │
│  ☐ Speed & Streaks                   │
│  ☐ Special                           │
│                                      │
│  Rarity:                             │
│  ☐ Common                            │
│  ☐ Uncommon                          │
│  ☐ Rare                              │
│  ☐ Epic                              │
│  ☐ Legendary                         │
│                                      │
│  [Apply Filters]  [Reset]            │
└──────────────────────────────────────┘
```

### **Search Function**

```
┌──────────────────────────────────────────────┐
│  🔍 Search badges:  [fraction_______]  [🔍]  │
├──────────────────────────────────────────────┤
│  Results for "fraction":                     │
│                                              │
│  ┌────────┐  ┌────────┐                     │
│  │ 🏆     │  │ ⭐     │                     │
│  │Fraction│  │Fraction│                     │
│  │Wizard  │  │Master  │                     │
│  │Earned ✓│  │75% →   │                     │
│  └────────┘  └────────┘                     │
└──────────────────────────────────────────────┘
```

---

## Badge Gallery Analytics

### **Progress Overview (Top of Gallery)**

```
┌──────────────────────────────────────────────────────┐
│  🏆 Your Badge Journey                               │
│                                                      │
│  Badges Earned: 12/50 (24%)                         │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                                      │
│  Quick Stats:                                       │
│  • Current XP Multiplier: 1.15x                     │
│  • Next Badge: Fraction Wizard (75% complete)       │
│  • Badges Available Now: 8                          │
│  • Total XP from Badges: 4,500 XP                   │
│                                                      │
│  🎯 Recommended: Complete "Fraction Wizard" next!   │
│     Only 1 skill remaining.                         │
│                                                      │
│  [Start Learning →]                                 │
└──────────────────────────────────────────────────────┘
```

### **Achievement Showcase**

```
┌──────────────────────────────────────────────────────┐
│  🌟 Recent Achievements                              │
│                                                      │
│  🏆 Integer Warrior - Earned 3 days ago             │
│  🏆 7th Grade Complete - Earned 1 week ago           │
│  🏆 Ratio Expert - Earned 2 weeks ago                │
│                                                      │
│  [View All Earned Badges →]                         │
└──────────────────────────────────────────────────────┘
```

---

## Mobile-Optimized Views

### **Mobile Badge Card**

```
┌────────────────────┐
│  [Badge Image]     │  ← Large, centered
│  ⭐                │  ← State indicator
│                    │
│  Fraction Wizard   │
│                    │
│  ●●●○ 75%          │  ← Simple progress
│                    │
│  [Start →]         │  ← Clear CTA
└────────────────────┘
```

### **Mobile Detail Modal (Fullscreen)**

```
┌─────────────────────────┐
│ ← Back    Fraction Wiz  │
├─────────────────────────┤
│                         │
│    [Badge Image]        │
│      🍕 (grey)          │
│                         │
│  Master all fraction    │
│  operations!            │
│                         │
│  Requirements:          │
│  ✅ Addition     100%   │
│  ✅ Subtraction  100%   │
│  ✅ Multiply     100%   │
│  🔵 Division      60%   │
│                         │
│  Rewards:               │
│  • +400 XP              │
│  • 1.05x Multiplier     │
│                         │
│  [Start Learning 🚀]    │
│  [Cancel]               │
└─────────────────────────┘
```

---

## Implementation Components

### **Frontend Components**

```
/public/js/badges/
├── BadgeGallery.js         # Main gallery view
├── BadgeCard.js            # Individual badge display
├── BadgeDetailModal.js     # Detail popup
├── BadgeLearningFlow.js    # AI lesson → conversation → assessment
├── BadgeFilters.js         # Filter sidebar
└── BadgeProgress.js        # Progress tracking UI
```

### **API Endpoints**

```javascript
// Get all badges with student's progress
GET /api/badges/gallery
→ Returns badges grouped by status (earned, available, locked)

// Get specific badge details
GET /api/badges/:badgeId
→ Returns badge info, requirements, progress, rewards

// Start badge learning flow
POST /api/badges/:badgeId/start
→ Initiates AI lesson, returns conversation ID

// Check badge earning eligibility
POST /api/badges/:badgeId/check
→ Runs assessment, awards badge if criteria met
```

---

## AI Lesson Flow Logic

### **When Student Selects Badge**

```javascript
// 1. Check requirements
const badge = await Badge.findById(badgeId);
const userProgress = await getUserBadgeProgress(userId, badgeId);

// 2. Identify missing skills
const missingSkills = badge.requirements.skillsMastered.filter(
  skillId => user.skillMastery.get(skillId)?.status !== 'mastered'
);

// 3. Create AI conversation with context
const conversation = await Conversation.create({
  userId,
  mode: 'badge-learning',
  targetBadge: badgeId,
  focusSkills: missingSkills,
  phases: ['lesson', 'practice', 'assessment']
});

// 4. AI builds lesson plan
const aiPrompt = `
  Student ${user.firstName} wants to earn the ${badge.displayName} badge.

  They need to master: ${missingSkills.map(s => s.displayName).join(', ')}

  Current progress: ${userProgress.map(p => `${p.skill}: ${p.percent}%`).join(', ')}

  Phase 1: Teach the concepts
  Phase 2: Practice with conversation
  Phase 3: Run mastery assessment

  Start with Phase 1 now.
`;

// 5. Launch conversation
return { conversationId, initialMessage };
```

---

## Benefits of This Approach

1. **Visual Discovery**: Students browse badges like a collection
2. **Clear Goals**: Badges become learning targets
3. **Motivated Learning**: "I want that badge" → proactive learning
4. **Structured Path**: AI guides through lesson → practice → assessment
5. **Instant Gratification**: Badge unlocks in full color when earned
6. **Progress Transparency**: Always see how close you are
7. **No Dead Ends**: Locked badges show prerequisites (roadmap)
8. **Gamification**: Collection mindset drives engagement

This transforms badges from passive rewards into **active learning initiators**!
