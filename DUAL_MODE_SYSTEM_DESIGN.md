# Dual-Mode Learning System Design

## Overview

Students can choose between two learning modes at any time:
1. **Regular Tutoring Mode**: Free-form, conversational AI tutoring (homework help, concept exploration)
2. **Mastery Mode**: Focused skill progression with badges, XP, and systematic practice

This gives students autonomy to match their learning style and current needs.

---

## Mode Comparison

| Feature | Regular Tutoring Mode | Mastery Mode |
|---------|----------------------|--------------|
| **Purpose** | Homework help, concept exploration | Skill building, badge earning |
| **Structure** | Free-form conversation | Structured practice |
| **AI Behavior** | Conversational, flexible | Focused, systematic |
| **Progress Tracking** | Informal | Explicit (bubbles, badges) |
| **XP Earning** | Yes (for engagement) | Yes (with multipliers) |
| **Badges** | Can earn incidentally | Primary focus |
| **Student Control** | High (topics, pace) | Moderate (skill path) |
| **Best For** | Homework, questions, exploration | Building foundations, earning rewards |

---

## Mode Selection UI

### **Landing Page Choice**

```
┌───────────────────────────────────────────────────────┐
│  Welcome back, Sarah! What would you like to do?      │
│                                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │  💬 Tutor Mode      │  │  🎯 Mastery Mode    │   │
│  │                     │  │                     │   │
│  │  Chat freely with   │  │  Build skills &     │   │
│  │  your AI tutor      │  │  earn badges        │   │
│  │                     │  │                     │   │
│  │  • Homework help    │  │  • Skill practice   │   │
│  │  • Ask questions    │  │  • Badge progress   │   │
│  │  • Explore topics   │  │  • XP multipliers   │   │
│  │                     │  │                     │   │
│  │  [Start Chat →]     │  │  [Enter Mode →]     │   │
│  └─────────────────────┘  └─────────────────────┘   │
│                                                       │
│  💡 Tip: You can switch modes anytime!                │
└───────────────────────────────────────────────────────┘
```

### **Mode Indicator (Always Visible)**

```
Top Navigation Bar:
┌────────────────────────────────────────────┐
│ 🏠 MathMatix  │  💬 Tutor Mode  │  👤 Sarah│
│               │  [Switch ⇄]    │          │
└────────────────────────────────────────────┘

or

┌────────────────────────────────────────────┐
│ 🏠 MathMatix  │  🎯 Mastery Mode│  👤 Sarah│
│               │  [Switch ⇄]    │          │
└────────────────────────────────────────────┘
```

### **Mode Switching Dialog**

```
┌───────────────────────────────────────────────┐
│  Switch Learning Mode?                        │
│                                               │
│  You're currently in: 💬 Tutor Mode           │
│                                               │
│  Would you like to switch to:                 │
│  🎯 Mastery Mode - Focused skill practice     │
│                                               │
│  Your progress is saved in both modes!        │
│                                               │
│  [Switch to Mastery Mode]  [Stay in Tutor]    │
└───────────────────────────────────────────────┘
```

---

## Regular Tutoring Mode

### **Interface**

```
┌─────────────────────────────────────────────────────┐
│  💬 Tutor Mode                      [Switch Mode ⇄] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Student: Can you help me with this homework        │
│           problem? I need to solve 3x + 5 = 14      │
│                                                     │
│  Mr. Nappier: Of course! Let's work through this    │
│               together. What do you think the       │
│               first step should be?                 │
│                                                     │
│  [Type your message...]                      [Send] │
│                                                     │
├─────────────────────────────────────────────────────┤
│  💡 Quick Actions:                                  │
│  • 📷 Upload problem image                          │
│  • 📝 Request practice problem                      │
│  • 🎯 Switch to Mastery Mode                        │
└─────────────────────────────────────────────────────┘
```

### **AI Behavior in Tutor Mode**

```javascript
// AI Prompt Configuration - Tutor Mode
{
  mode: "tutoring",
  characteristics: {
    conversational: true,
    flexible: true,
    studentLed: true,
    scaffolding: "adaptive",
    pacing: "student-controlled"
  },

  behaviors: {
    // Follow student's lead
    followStudentTopics: true,

    // Socratic method
    askGuidingQuestions: true,

    // Build relationships
    referToHistory: true,
    personalizeExamples: true,

    // Support homework
    helpWithSpecificProblems: true,
    explainConcepts: true,

    // Gentle skill tracking
    trackSkillsInBackground: true,  // Still tracks, but doesn't force it
    suggestMasteryMode: "subtly"    // "Want to practice more of these?"
  },

  skillTracking: {
    // AI still tags skills demonstrated/mastered
    updateSkillMastery: true,

    // But doesn't structure session around skills
    enforceSkillProgression: false,

    // Celebrates naturally
    celebrateMastery: "conversational"  // "Nice work! You've really got this concept down."
  }
}
```

### **Example Tutor Mode Session**

```
Student: I don't understand how to solve 2(x + 3) = 10

AI: Let's break this down together. Do you see the
    parentheses with "x + 3" inside?

Student: Yeah

AI: Great! What do you think we should do with that
    2 that's sitting outside the parentheses?

Student: Multiply?

AI: Exactly! We need to distribute that 2 to both
    terms inside. Want to try that?

Student: So 2x + 6?

AI: Perfect! Now you have 2x + 6 = 10. This looks
    like a two-step equation now. What's your next
    move?

[continues conversationally...]

🔔 Behind the scenes: AI tags skills used
    - distributive-property: demonstrated ✓
    - two-step-equations: practiced ✓
```

---

## Mastery Mode

### **Interface**

```
┌─────────────────────────────────────────────────────┐
│  🎯 Mastery Mode                    [Switch Mode ⇄] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Current Skill: Two-Step Equations                  │
│  [🔵🔵🔵🔵🔵🔵⚪⚪⚪⚪] 60%                            │
│                                                     │
│  Problem 7/10:                                      │
│                                                     │
│  Solve for x:                                       │
│  3x + 7 = 19                                        │
│                                                     │
│  [Your answer: ____________]              [Submit]  │
│                                                     │
│  💡 Hint available (costs 10 XP)                    │
│  ↩️  Go Back    |    ⏭️ Skip (no progress)          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🎯 Session Stats:                                  │
│  ✅ 6 correct  |  ❌ 0 incorrect  |  🔥 6 streak    │
│  ⭐ +60 XP earned (1.05x multiplier)                │
└─────────────────────────────────────────────────────┘
```

### **AI Behavior in Mastery Mode**

```javascript
// AI Prompt Configuration - Mastery Mode
{
  mode: "mastery",
  characteristics: {
    structured: true,
    focused: true,
    goalOriented: true,
    scaffolding: "skill-appropriate",
    pacing: "optimal-challenge"
  },

  behaviors: {
    // Systematic progression
    followSkillPath: true,
    enforcePrerequisites: true,

    // Problem generation
    generatePracticeProblems: true,
    adaptDifficulty: true,

    // Explicit progress
    showProgressBubbles: true,
    celebrateMilestones: true,

    // Badge awareness
    remindBadgeProgress: true,
    suggestNextSkills: true
  },

  problemGeneration: {
    // Start easier, increase difficulty
    adaptiveDifficulty: true,

    // Variety within skill
    diverseExamples: true,

    // Spacing and interleaving
    reviewPastSkills: "occasionally",

    // Challenge problems for mastery
    requireMasteryProblems: true
  },

  feedback: {
    // Immediate after each problem
    immediateCorrectness: true,

    // Explain mistakes
    showWorkWhenWrong: true,

    // Encourage persistence
    growthMindsetMessages: true,

    // Track streaks
    celebrateStreaks: true
  }
}
```

### **Example Mastery Mode Session**

```
┌─────────────────────────────────────────────────────┐
│  🎯 Two-Step Equations Practice                     │
│  [🔵🔵🔵🔵🔵⚪⚪⚪⚪⚪] 50%                            │
│                                                     │
│  Problem 1:                                         │
│  Solve: 2x + 3 = 11                                 │
│  Answer: 4              ✅ Correct! +10 XP          │
│                                                     │
│  Problem 2:                                         │
│  Solve: 5x - 4 = 16                                 │
│  Answer: 4              ✅ Correct! +10 XP  🔥×2    │
│                                                     │
│  Problem 3:                                         │
│  Solve: -3x + 7 = 1                                 │
│  Answer: 3              ❌ Not quite...             │
│                                                     │
│  Let's see what happened:                           │
│  -3x + 7 = 1                                        │
│  -3x = -6     (subtract 7 from both sides)          │
│  x = 2        (divide by -3)                        │
│                                                     │
│  You got x = 3. Did you divide by -3 or by 3?       │
│  Remember: negative divided by negative = positive! │
│                                                     │
│  [Try Again]  [Next Problem]                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Badge Progress:                                    │
│  🎯 Equation Solver: 2/3 skills mastered            │
│  (Two-Step Equations will be your 3rd!)             │
└─────────────────────────────────────────────────────┘
```

---

## Skill Selection in Mastery Mode

### **Choose Your Focus**

```
┌─────────────────────────────────────────────────────┐
│  🎯 Mastery Mode - Choose Your Focus                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Recommended Skills (Based on your progress):       │
│                                                     │
│  ✅ READY TO LEARN:                                 │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📐 Two-Step Equations  [🔵🔵🔵🔵🔵⚪⚪⚪⚪⚪]│  │
│  │ Continue where you left off - 50% complete   │  │
│  │ [Practice This →]                            │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📊 Combining Like Terms  [⚪⚪⚪⚪⚪⚪⚪⚪⚪⚪]│  │
│  │ New skill unlocked! Ready to start?          │  │
│  │ [Start Learning →]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  🔄 NEEDS REVIEW:                                   │
│  ┌──────────────────────────────────────────────┐  │
│  │ ➕ Integer Addition  [🟡🟡🟡🟡⚪⚪⚪⚪⚪⚪]  │  │
│  │ Let's refresh this! It's been a while.       │  │
│  │ [Review →]                                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  🎯 BADGE FOCUS:                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🍕 Fraction Wizard Badge (75% complete)      │  │
│  │ Only 1 skill left: Fraction Division         │  │
│  │ [Finish This Badge! →]                       │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [View All Skills]  [Badge Progress]                │
└─────────────────────────────────────────────────────┘
```

### **Skill Categories View**

```
┌─────────────────────────────────────────────────────┐
│  Choose a skill category:                           │
│                                                     │
│  📊 Operations (3/8 mastered)                       │
│  [🟢🟢🟢🔵🔵⚪⚪⚪] 50%                               │
│                                                     │
│  📐 Equations (2/6 mastered)                        │
│  [🟢🟢🔵🔵⚪⚪] 33%                                   │
│                                                     │
│  📈 Graphing (0/5 mastered)                         │
│  [⚪⚪⚪⚪⚪] 0% (Locked - complete Equations first)  │
│                                                     │
│  [Expand to see skills →]                           │
└─────────────────────────────────────────────────────┘
```

---

## Mode-Switching Intelligence

### **Smart Suggestions**

The AI should intelligently suggest mode switches based on context:

#### **Suggest Mastery Mode When:**

```javascript
// In Tutor Mode, suggest Mastery Mode if:
- Student practices the same skill 3+ times naturally
  "You're getting good at two-step equations! Want to
   jump into Mastery Mode and earn some XP/badges for
   this skill?"

- Student asks for more practice
  "Want to switch to Mastery Mode? I can generate
   unlimited practice problems and track your progress!"

- Student is close to mastering a skill
  "You're at 80% mastery on this! Want to finish it
   off in Mastery Mode and earn the badge?"

- Badge is almost complete
  "You're one skill away from the Fraction Wizard badge!
   🍕 Want to knock that out in Mastery Mode?"
```

#### **Suggest Tutor Mode When:**

```javascript
// In Mastery Mode, suggest Tutor Mode if:
- Student struggling significantly (< 30% accuracy)
  "I notice you're having trouble with this. Want to
   switch to Tutor Mode so we can talk through it?"

- Student asks conceptual questions
  "That's a great question! Want to switch to Tutor
   Mode so we can explore this concept together?"

- Student requests homework help
  "I can help! Let's switch to Tutor Mode where we
   can work through your homework together."

- Student seems frustrated (multiple wrong answers)
  "Want to take a break from practice and chat about
   this concept in Tutor Mode? Sometimes talking it
   through helps!"
```

### **Seamless Context Preservation**

When switching modes, preserve context:

```javascript
// Switching from Tutor → Mastery
{
  preserveContext: {
    currentSkill: "two-step-equations",
    conversationHistory: "last 10 messages",
    strugglingAreas: ["negative numbers", "isolating variable"],

    action: "Start Mastery Mode on two-step-equations with
             extra focus on negative numbers"
  }
}

// Switching from Mastery → Tutor
{
  preserveContext: {
    currentSkill: "two-step-equations",
    recentProblems: ["3x + 5 = 11", "-2x + 7 = 3"],
    strugglingOn: "problems with negatives",

    action: "Open Tutor Mode with context about struggling
             with negative coefficients in two-step equations"
  }
}
```

---

## Progress Tracking Across Modes

### **Unified Progress System**

```javascript
// Skills are tracked in BOTH modes
user.skillMastery = {
  "two-step-equations": {
    masteryScore: 0.67,

    // Track WHERE progress happened
    progressSources: {
      tutorMode: {
        problemsSolved: 5,
        conceptsDiscussed: 3,
        masteryGain: 0.25
      },
      masteryMode: {
        problemsSolved: 15,
        sessionsCompleted: 2,
        masteryGain: 0.42
      }
    },

    // Combined total
    totalAttempts: 20,
    status: "learning"
  }
};
```

### **XP Earning in Both Modes**

```javascript
// Tutor Mode XP
{
  mode: "tutoring",
  xpRates: {
    problemSolved: 10,           // Base XP per problem
    conceptDemonstrated: 15,     // Understanding shown
    helpfulQuestion: 5,          // Asking good questions
    sessionEngagement: 20,       // Per 10 minutes active
    skillMastered: 50            // When skill hits 90%
  },
  multipliers: true              // Badge multipliers apply
}

// Mastery Mode XP
{
  mode: "mastery",
  xpRates: {
    correctAnswer: 10,           // Base XP per correct
    firstTryBonus: 5,            // No hints used
    streakBonus: 5,              // Per streak level (5, 10, 15...)
    skillMastered: 100,          // When skill hits 90%
    badgeEarned: "varies"        // Badge-specific
  },
  multipliers: true              // Badge multipliers apply
}
```

---

## User Preferences

### **Mode Preferences Storage**

```javascript
user.preferences.learningModes = {
  // Default mode on login
  defaultMode: "tutoring",  // or "mastery"

  // Last used mode
  lastMode: "mastery",

  // Mode-specific settings
  tutorMode: {
    preferredPacing: "student-led",
    showSkillProgress: true,          // Show bubbles in sidebar
    remindMasteryMode: true           // AI can suggest switches
  },

  masteryMode: {
    problemsPerSession: 10,
    difficultyPreference: "adaptive", // or "easy", "medium", "hard"
    showHints: true,
    skipAllowed: true,
    autoAdvanceSkills: false          // Manual skill selection
  },

  // When does student typically use each mode?
  usage: {
    tutorMode: ["homework", "concepts", "questions"],
    masteryMode: ["practice", "badges", "skill-building"]
  }
};
```

### **Settings Page**

```
┌─────────────────────────────────────────────────────┐
│  ⚙️ Learning Mode Settings                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Default Mode:                                      │
│  ○ Tutor Mode    ● Mastery Mode                     │
│                                                     │
│  💬 Tutor Mode Settings:                            │
│  ☑ Show skill progress in sidebar                   │
│  ☑ AI can suggest Mastery Mode                      │
│  ☐ Track skills in background only                  │
│                                                     │
│  🎯 Mastery Mode Settings:                          │
│  Problems per session: [10] ▼                       │
│  Difficulty: [○ Easy  ● Adaptive  ○ Hard]           │
│  ☑ Show hints                                       │
│  ☑ Allow skipping problems                          │
│  ☐ Auto-advance to next skill                       │
│                                                     │
│  [Save Settings]                                    │
└─────────────────────────────────────────────────────┘
```

---

## Analytics & Insights

### **Mode Usage Tracking**

```javascript
// Track which mode is more effective for each student
user.analytics.modeEffectiveness = {
  tutorMode: {
    timeSpent: 240,              // minutes
    skillsMastered: 3,
    xpEarned: 450,
    engagementScore: 0.85,
    preferredFor: ["homework", "conceptual-questions"]
  },

  masteryMode: {
    timeSpent: 180,              // minutes
    skillsMastered: 5,
    xpEarned: 850,
    engagementScore: 0.92,
    preferredFor: ["skill-building", "badge-hunting"]
  },

  insights: {
    mostEffectiveMode: "mastery",
    recommendation: "Student learns fastest in Mastery Mode
                     but uses Tutor Mode for homework help"
  }
};
```

### **Teacher/Parent Dashboard**

```
┌─────────────────────────────────────────────────────┐
│  Sarah's Learning Modes                             │
│                                                     │
│  This Week:                                         │
│  💬 Tutor Mode:   2.5 hours (40%)                   │
│  🎯 Mastery Mode: 3.5 hours (60%)                   │
│                                                     │
│  Effectiveness:                                     │
│  • Mastery Mode: 5 skills mastered, 2 badges        │
│  • Tutor Mode: 3 homework problems completed        │
│                                                     │
│  💡 Insight: Sarah uses Mastery Mode for            │
│     systematic learning and Tutor Mode for          │
│     homework help. Both modes are effective!        │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### **Phase 1: Mode Infrastructure** (Week 1)
- [ ] Add mode field to conversation/session model
- [ ] Create mode switching API endpoints
- [ ] Build mode selection UI components
- [ ] Implement context preservation on switch

### **Phase 2: AI Behavior Differentiation** (Week 2)
- [ ] Configure AI prompts for Tutor Mode
- [ ] Configure AI prompts for Mastery Mode
- [ ] Build problem generation for Mastery Mode
- [ ] Implement smart mode suggestions

### **Phase 3: Mastery Mode Features** (Week 3)
- [ ] Skill selection interface
- [ ] Practice problem flow
- [ ] Real-time progress bubbles
- [ ] Adaptive difficulty system

### **Phase 4: Polish & Analytics** (Week 4)
- [ ] Mode preferences and settings
- [ ] Usage analytics tracking
- [ ] Teacher/parent dashboards
- [ ] Mode effectiveness insights

---

## Benefits

### **For Students**
1. **Autonomy**: Choose learning style that fits current needs
2. **Flexibility**: Get homework help OR build skills systematically
3. **Variety**: Different modes keep learning fresh
4. **Clear Goals**: Mastery Mode for focused progression
5. **Personal Support**: Tutor Mode for individual needs

### **For Teachers**
1. **Visibility**: See how students use each mode
2. **Insights**: Understand which mode works best for each student
3. **Alignment**: Tutor Mode supports classroom work
4. **Accountability**: Mastery Mode shows systematic progress

### **For the Platform**
1. **Engagement**: Two modes = more use cases
2. **Retention**: Students can always find value
3. **Differentiation**: Unique dual-mode approach
4. **Data**: Rich analytics on learning preferences

This dual-mode system gives MathMatix the best of both worlds: conversational AI tutoring AND systematic skill mastery!
