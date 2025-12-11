# Placement Test System Design

## Overview

An adaptive, conversational placement test that assesses students' mathematical skill level (K-Calculus 3) and places them at the optimal starting point in the progression map. The test informs badge availability, unlocks appropriate content, and provides a personalized learning roadmap.

---

## Core Principles

1. **Conversational, Not Intimidating**: Feels like a chat, not a formal test
2. **Adaptive**: Adjusts difficulty based on responses (binary search approach)
3. **Efficient**: 15-25 minutes, ~15-20 questions
4. **Comprehensive**: Covers K through Calculus 3 progression
5. **Actionable**: Produces clear skill map and badge unlocks

---

## Test Flow

### **Entry Points**

Students can take the placement test:
1. **During onboarding** (new users)
2. **From settings** (anytime)
3. **AI suggestion** (if skill level unclear)
4. **After grade/course change** (reassessment)

### **Pre-Test Setup**

```
┌──────────────────────────────────────────────────────┐
│  📍 Math Placement Assessment                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Welcome! This quick assessment helps us understand │
│  your current math level so we can personalize your │
│  learning experience.                               │
│                                                      │
│  ⏱️ Time: 15-25 minutes                             │
│  📊 Questions: ~15-20 (adapts to your answers)      │
│  💬 Format: Conversational with your AI tutor       │
│                                                      │
│  What you'll get:                                   │
│  ✓ Your skill level across all math topics         │
│  ✓ Personalized badge recommendations              │
│  ✓ Custom learning path                            │
│  ✓ Unlocked content at your level                  │
│                                                      │
│  First, tell us:                                    │
│  What grade are you in? [Dropdown: K-12, College]  │
│  Current math course? [Dropdown or text]           │
│                                                      │
│  [Start Assessment →]  [Skip for Now]               │
└──────────────────────────────────────────────────────┘
```

---

## Adaptive Algorithm

### **Binary Search Approach**

The test uses adaptive questioning to efficiently find the student's skill level:

```
Skill Range: K (0) ────────────────────► Calculus 3 (13)

Start: Test at expected grade level
       ↓
    Correct? → Test harder (move up)
    Incorrect? → Test easier (move down)
       ↓
    Converge on actual level
```

### **Algorithm Pseudocode**

```javascript
function placementTest(student) {
  // Initial range based on self-reported grade
  let minLevel = student.reportedGrade - 2;
  let maxLevel = student.reportedGrade + 2;
  let currentLevel = student.reportedGrade;

  let questionsAsked = 0;
  const maxQuestions = 20;

  while (questionsAsked < maxQuestions && (maxLevel - minLevel) > 0.5) {
    // Generate question at current level
    const question = generateQuestion(currentLevel);
    const response = await askStudent(question);

    questionsAsked++;

    if (response.correct) {
      // Student got it right, try harder
      minLevel = currentLevel;
      currentLevel = (currentLevel + maxLevel) / 2;
    } else {
      // Student struggled, try easier
      maxLevel = currentLevel;
      currentLevel = (minLevel + currentLevel) / 2;
    }

    // Check for mastery at current level
    if (hasConsecutiveCorrect(currentLevel, 3)) {
      // Confidently at this level
      break;
    }
  }

  // Final placement
  return {
    placementLevel: Math.floor(currentLevel),
    confidenceLevel: calculateConfidence(responses),
    strengthAreas: identifyStrengths(responses),
    gapAreas: identifyGaps(responses)
  };
}
```

---

## Question Bank Structure

### **Skill Coverage Map**

```javascript
const placementQuestions = {
  // Level 0: Kindergarten
  0: {
    skills: ['counting', 'number-recognition', 'basic-shapes'],
    questions: [
      { id: 'k-count-1', skill: 'counting', difficulty: 1 },
      { id: 'k-shapes-1', skill: 'basic-shapes', difficulty: 1 }
    ]
  },

  // Level 1-2: Grades 1-2
  1.5: {
    skills: ['addition-20', 'subtraction-20', 'place-value'],
    questions: [
      { id: 'g12-add-1', skill: 'addition-20', difficulty: 2 },
      { id: 'g12-place-1', skill: 'place-value', difficulty: 2 }
    ]
  },

  // Level 3-5: Grades 3-5
  4: {
    skills: ['multiplication', 'division', 'fractions', 'decimals'],
    questions: [
      { id: 'g35-mult-1', skill: 'multiplication', difficulty: 3 },
      { id: 'g35-frac-1', skill: 'fractions', difficulty: 4 }
    ]
  },

  // Level 6-8: Middle School
  7: {
    skills: ['integers', 'equations', 'ratios', 'proportions'],
    questions: [
      { id: 'ms-int-1', skill: 'integers', difficulty: 5 },
      { id: 'ms-eq-1', skill: 'equations', difficulty: 6 }
    ]
  },

  // Level 9: Algebra 1
  9: {
    skills: ['linear-equations', 'quadratics', 'polynomials'],
    questions: [
      { id: 'alg1-linear-1', skill: 'linear-equations', difficulty: 7 },
      { id: 'alg1-quad-1', skill: 'quadratics', difficulty: 8 }
    ]
  },

  // Level 10: Geometry
  10: {
    skills: ['proofs', 'triangles', 'circles', 'trig-basics'],
    questions: [
      { id: 'geo-proof-1', skill: 'proofs', difficulty: 7 },
      { id: 'geo-trig-1', skill: 'trig-basics', difficulty: 8 }
    ]
  },

  // Level 11: Algebra 2
  11: {
    skills: ['complex-numbers', 'exponentials', 'logs', 'trig-identities'],
    questions: [
      { id: 'alg2-complex-1', skill: 'complex-numbers', difficulty: 9 },
      { id: 'alg2-log-1', skill: 'logs', difficulty: 9 }
    ]
  },

  // Level 12: Pre-Calculus
  12: {
    skills: ['limits-intro', 'vectors', 'polar', 'conics'],
    questions: [
      { id: 'precalc-limit-1', skill: 'limits-intro', difficulty: 10 },
      { id: 'precalc-vector-1', skill: 'vectors', difficulty: 10 }
    ]
  },

  // Level 13: Calculus
  13: {
    skills: ['derivatives', 'integrals', 'series', 'multivariable'],
    questions: [
      { id: 'calc-deriv-1', skill: 'derivatives', difficulty: 11 },
      { id: 'calc-int-1', skill: 'integrals', difficulty: 11 }
    ]
  }
};
```

---

## Conversational Format

### **Question Delivery**

```
┌──────────────────────────────────────────────────────┐
│  📍 Placement Assessment                             │
│  Question 7 of ~15                                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Mr. Nappier:                                       │
│                                                      │
│  Nice work so far! Let's try this one:              │
│                                                      │
│  Solve for x:                                       │
│  2x + 5 = 13                                        │
│                                                      │
│  Take your time. If you're not sure, that's okay - │
│  just give it your best shot!                       │
│                                                      │
│  [Your answer: ____________]             [Submit]   │
│                                                      │
│  💡 Not sure? [Skip this question]                  │
└──────────────────────────────────────────────────────┘
```

### **Response Handling**

```javascript
// AI evaluates answer conversationally
if (answer.correct) {
  aiResponse = `Great! You got it. x = 4 is correct.`;
  // Move to harder question
} else if (answer.partiallyCorrect) {
  aiResponse = `You're on the right track! You got to 2x = 8,
                but remember to divide both sides by 2 to get x = 4.`;
  // Same level or slightly easier
} else if (answer.showsWork) {
  aiResponse = `I see you tried! The correct answer is x = 4.
                Let's try something a bit different.`;
  // Move to easier question
} else {
  aiResponse = `No worries! The answer is x = 4. Let's try
                another type of problem.`;
  // Move to easier question
}
```

---

## Results & Placement

### **Placement Report**

```
┌──────────────────────────────────────────────────────┐
│  🎉 Assessment Complete!                             │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Great work, Sarah! Here's what we learned:         │
│                                                      │
│  📊 Your Math Level: Late 7th Grade / Early 8th     │
│                                                      │
│  ✅ Strong Areas:                                   │
│  • Integer operations - You've got this!            │
│  • Ratios & proportions - Solid understanding       │
│  • Basic equation solving - Well mastered           │
│                                                      │
│  📚 Ready to Learn:                                 │
│  • Two-step equations - This is your next step      │
│  • Linear graphing - Build on what you know         │
│                                                      │
│  💡 Foundation Gaps:                                │
│  • Fraction multiplication - Let's strengthen this  │
│  • Distributive property - Quick review needed      │
│                                                      │
│  🎯 Recommended Starting Point:                     │
│  Grade 7 Review + Grade 8 New Content              │
│                                                      │
│  🏆 Badges Unlocked: 8                              │
│  🔓 Skills Available: 23                            │
│                                                      │
│  [View My Learning Path →]  [Start Learning! 🚀]   │
└──────────────────────────────────────────────────────┘
```

### **Detailed Skill Map**

```
┌──────────────────────────────────────────────────────┐
│  📊 Your Skill Map                                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Phase 1: Foundations (K-5)                         │
│  [🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢] 100% Mastered ✓            │
│                                                      │
│  Phase 2: Middle School (6-8)                       │
│  [🟢🟢🟢🟢🟢🟢🟢🔵⚪⚪] 70% Complete               │
│                                                      │
│  Grade 6 Skills:                                    │
│  ✅ Ratios & Rates                100%              │
│  ✅ Integers                      100%              │
│  ✅ Basic Equations               100%              │
│                                                      │
│  Grade 7 Skills:                                    │
│  ✅ Proportions                   100%              │
│  🔵 Two-Step Equations             60% ← Working on │
│  ⚪ Inequalities                    0% ← Ready      │
│                                                      │
│  Grade 8 Skills:                                    │
│  🔵 Linear Functions               40%              │
│  ⚪ Systems of Equations            0% ← Locked     │
│  ⚪ Pythagorean Theorem             0% ← Locked     │
│                                                      │
│  💡 Gaps to Fill:                                   │
│  📍 Fraction Multiplication (Grade 5) - 45%         │
│  📍 Distributive Property (Grade 6) - 60%           │
│                                                      │
│  [View Full Progression Map →]                      │
└──────────────────────────────────────────────────────┘
```

---

## Badge Unlocking Logic

### **Based on Placement Results**

```javascript
function unlockBadgesFromPlacement(placementResult) {
  const unlockedBadges = [];

  // 1. Unlock all badges for completed levels
  for (let level = 0; level <= placementResult.placementLevel; level++) {
    const levelBadges = Badge.find({ gradeLevel: level, category: 'grade-complete' });
    unlockedBadges.push(...levelBadges);
  }

  // 2. Unlock skill-specific badges for mastered skills
  placementResult.masteredSkills.forEach(skillId => {
    const relatedBadges = Badge.find({
      'requirements.skillsMastered': skillId,
      prerequisites: { requiredBadges: { $size: 0 } } // No prereqs
    });
    unlockedBadges.push(...relatedBadges);
  });

  // 3. Mark available badges based on current level
  const availableBadges = Badge.find({
    gradeLevel: placementResult.placementLevel,
    status: { $in: ['ready', 'learning'] }
  });

  // 4. Set skill mastery in user profile
  placementResult.skillAssessment.forEach(skill => {
    user.skillMastery.set(skill.skillId, {
      status: skill.percent >= 90 ? 'mastered' :
              skill.percent >= 50 ? 'learning' : 'ready',
      masteryScore: skill.percent / 100,
      assessmentDate: new Date(),
      source: 'placement-test'
    });
  });

  return {
    unlockedBadges,
    availableBadges,
    lockedBadges: Badge.find({ /* locked logic */ })
  };
}
```

---

## Integration with Progression System

### **Updating User Profile**

```javascript
// After placement test completion
user.learningProfile = {
  ...user.learningProfile,
  assessmentCompleted: true,
  assessmentDate: new Date(),
  initialPlacement: placementResult.placementLevel,
  placementConfidence: placementResult.confidenceLevel
};

user.academicProfile = {
  currentGrade: user.reportedGrade,
  actualSkillLevel: placementResult.placementLevel,
  expectedSkillLevel: user.reportedGrade,
  isAheadOfGrade: placementResult.placementLevel > user.reportedGrade,
  isBehindGrade: placementResult.placementLevel < user.reportedGrade - 1,
  gapSkills: placementResult.gapAreas.map(g => g.skillId)
};

// Update skill mastery map
placementResult.skillAssessment.forEach(skill => {
  user.skillMastery.set(skill.skillId, {
    status: determineStatus(skill.percent),
    masteryScore: skill.percent / 100,
    lastPracticed: new Date(),
    source: 'placement-test'
  });
});
```

### **Personalized Learning Path**

```javascript
function generateLearningPath(placementResult) {
  return {
    // Step 1: Fill gaps from lower levels
    foundationReview: placementResult.gapAreas.filter(
      g => g.gradeLevel < placementResult.placementLevel - 1
    ),

    // Step 2: Strengthen current level
    currentLevelSkills: getSkillsForLevel(
      placementResult.placementLevel
    ).filter(s => s.masteryScore < 0.9),

    // Step 3: Introduce next level
    nextLevelSkills: getSkillsForLevel(
      placementResult.placementLevel + 1
    ).slice(0, 3), // First 3 skills

    // Recommended badges to pursue
    recommendedBadges: prioritizeBadges(placementResult),

    // Estimated timeline
    estimatedWeeks: calculateTimeToCompletion(placementResult)
  };
}
```

---

## Retaking & Reassessment

### **When to Reassess**

- **Grade level changes**: Start of new school year
- **Course changes**: Switching from Algebra 1 to Geometry
- **Significant progress**: After mastering 50+ skills
- **Student request**: Anytime from settings
- **AI suggestion**: If performance indicates level mismatch

### **Reassessment Flow**

```
┌──────────────────────────────────────────────────────┐
│  📍 Reassessment Available                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  You've made great progress since your last         │
│  assessment 3 months ago!                           │
│                                                      │
│  Since then:                                        │
│  • 42 skills mastered                               │
│  • 8 badges earned                                  │
│  • Moved from 7th to 8th grade level               │
│                                                      │
│  Want to retake the placement test to unlock more  │
│  content at your new level?                        │
│                                                      │
│  ⏱️ Time: ~15 minutes                               │
│  🎯 You'll likely unlock 10+ new badges             │
│                                                      │
│  [Take Reassessment →]  [Later]                     │
└──────────────────────────────────────────────────────┘
```

---

## Analytics & Insights

### **Placement Distribution**

```javascript
// Track where students place
const placementAnalytics = {
  totalAssessments: 1543,
  averagePlacement: 7.2, // Grade 7.2
  distribution: {
    'K-2': 45,
    '3-5': 234,
    '6-8': 678, // Most common
    '9-10': 412,
    '11-12': 152,
    'College': 22
  },
  accuracyMetrics: {
    selfReportedVsActual: -0.8, // Students typically overestimate by 0.8 grades
    confidenceLevel: 0.87 // 87% confidence in placements
  }
};
```

### **Teacher/Parent Reports**

```
┌──────────────────────────────────────────────────────┐
│  Sarah's Placement Report                            │
│  Completed: January 15, 2024                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Placement Level: 7.5 (Mid 7th - Early 8th grade)  │
│  Self-Reported: 8th grade                           │
│  Confidence: High (92%)                             │
│                                                      │
│  Strengths:                                         │
│  • Integer operations (100%)                        │
│  • Ratios & proportions (98%)                       │
│  • Basic equations (95%)                            │
│                                                      │
│  Growth Areas:                                      │
│  • Fraction operations (65%) - Review needed        │
│  • Distributive property (70%) - Practice more      │
│                                                      │
│  Recommended Focus:                                 │
│  1. Review Grade 5 fraction skills                  │
│  2. Master Grade 7 two-step equations               │
│  3. Begin Grade 8 linear functions                  │
│                                                      │
│  [View Detailed Report]  [Download PDF]             │
└──────────────────────────────────────────────────────┘
```

---

## Implementation Components

### **Backend**

```
/routes/placement.js
├── POST /api/placement/start
├── POST /api/placement/respond
├── GET /api/placement/results
└── POST /api/placement/apply-results

/services/placementService.js
├── adaptiveQuestionSelection()
├── evaluateResponse()
├── calculatePlacement()
└── generateLearningPath()

/models/placementTest.js
└── Schema for storing test results
```

### **Frontend**

```
/public/placement/
├── placement-test.html
├── placement-test.js
├── results.html
└── results.js
```

---

## Benefits

1. **Accurate Placement**: Binary search finds true skill level quickly
2. **Personalized Start**: No wasted time on too-easy or too-hard content
3. **Badge Unlocking**: Automatically unlocks appropriate badges
4. **Gap Identification**: Finds specific skills needing review
5. **Progress Baseline**: Creates benchmark for measuring growth
6. **Confidence Building**: Students start at comfortable challenge level
7. **Efficient**: 15-25 minutes vs hours of trial-and-error

This placement test integrates seamlessly with the progression map and badge system to create a personalized, efficient onboarding experience!
