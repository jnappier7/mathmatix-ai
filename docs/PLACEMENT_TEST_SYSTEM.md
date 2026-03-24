# Adaptive Screener System (CAT with IRT)

## Overview

A **true computerized adaptive test (CAT)** using **Item Response Theory (IRT)** to assess students' mathematical ability (K-Calculus 3) and place them at the optimal starting point. The screener adapts difficulty in real-time, maintains topic diversity, and provides a confidence-based assessment that respects students' time.

---

## Core Principles

1. **Truly Adaptive**: Stops when confident, not at fixed question count (5-30 questions)
2. **IRT-Based**: Uses 2-Parameter Logistic (2PL) IRT model for precise ability estimation
3. **Confidence-Driven**: Progress reflects statistical confidence, not just question count
4. **Topic Diversity**: Balances across number operations, algebra, geometry, and advanced topics
5. **Efficient**: Advanced students finish in 5-8 questions; average in 12-18; max 30
6. **Actionable**: Produces theta estimate, skill map, and badge unlocks

---

## Test Flow

### **Entry Points**

Students can take the placement test:
1. **During onboarding** (new users - required before accessing content)
2. **From settings** (retake anytime)
3. **After grade/course change** (reassessment recommended)
4. **AI suggestion** (if skill level unclear)

### **Pre-Test Setup**

```
┌──────────────────────────────────────────────────────┐
│  📍 Math Mastery Screener                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Welcome! This adaptive assessment finds your level │
│  using computerized adaptive testing (CAT).         │
│                                                      │
│  ⏱️ Time: Variable (5-30 minutes based on you)      │
│  📊 Questions: As many as needed for confidence     │
│  🎯 Format: Adaptive difficulty with diverse topics │
│                                                      │
│  How it works:                                      │
│  ✓ Questions adapt to your performance              │
│  ✓ Difficulty increases/decreases based on answers  │
│  ✓ Test ends when we're confident in your level    │
│  ✓ No feedback during test (prevents momentum loss) │
│                                                      │
│  What you'll get:                                   │
│  ✓ Your ability estimate (theta score)              │
│  ✓ Skill level across all math topics              │
│  ✓ Personalized badge recommendations               │
│  ✓ Custom learning path                             │
│                                                      │
│  [Start Assessment →]  [Learn More]                 │
└──────────────────────────────────────────────────────┘
```

---

## Adaptive Algorithm: IRT with CAT

### **Item Response Theory (2PL Model)**

The screener uses a **2-Parameter Logistic (2PL) IRT model** to estimate student ability:

```
P(θ) = 1 / (1 + exp(-α(θ - β)))

Where:
- θ (theta) = Student's ability (latent trait)
- β (beta) = Problem difficulty (-3 to +3 scale)
- α (alpha) = Problem discrimination (how well it distinguishes ability levels)
- P(θ) = Probability of correct response
```

### **Maximum Likelihood Estimation (MLE)**

After each response, theta is updated using **Newton-Raphson iteration**:

```javascript
function estimateAbility(responses) {
  let theta = 0; // Start at average ability

  for (let iteration = 0; iteration < 20; iteration++) {
    // Calculate derivatives of log-likelihood
    let firstDerivative = 0;   // Score function
    let secondDerivative = 0;  // Negative information

    for (const response of responses) {
      const { difficulty, discrimination, correct } = response;
      const p = 1 / (1 + Math.exp(-discrimination * (theta - difficulty)));

      firstDerivative += discrimination * (correct - p);
      secondDerivative -= discrimination**2 * p * (1 - p);
    }

    // Newton-Raphson update
    const delta = firstDerivative / secondDerivative;
    theta = theta - delta;

    // Converge if change is tiny
    if (Math.abs(delta) < 0.001) break;
  }

  // Calculate Standard Error (SE)
  const information = responses.reduce((sum, r) => {
    const p = 1 / (1 + Math.exp(-r.discrimination * (theta - r.difficulty)));
    return sum + r.discrimination**2 * p * (1 - p);
  }, 0);

  const standardError = 1 / Math.sqrt(information);

  return { theta, standardError };
}
```

### **Dampened Difficulty Jumps (NOT Raw Theta)**

**CRITICAL**: Next problem difficulty uses **dampened jumps**, not raw theta!

```javascript
function calculateJumpSize(isCorrect, questionCount, standardError) {
  if (isCorrect) {
    // UPWARD JUMP with dampening
    const baseJump = 1.5;

    // Dampen by confidence (high SE = large jump, low SE = small jump)
    const confidenceDampen = Math.max(standardError, 0.3);

    // Dampen by time (early questions = large jump, later = small)
    const timeDampen = Math.pow(0.9, questionCount - 1);

    const jumpSize = baseJump * confidenceDampen * timeDampen;
    return Math.max(0.3, Math.min(1.5, jumpSize)); // Clamp to [0.3, 1.5]
  } else {
    // DOWNWARD STEP (consistent)
    return -0.5; // Always step down half a difficulty level
  }
}

// Apply jump to previous difficulty (not raw theta!)
targetDifficulty = lastDifficulty + calculateJumpSize(wasCorrect, questionCount, SE);

// Bound to prevent wild swings
targetDifficulty = Math.max(
  Math.min(theta - 1.0, lastDifficulty - 1.5),
  Math.min(Math.max(theta + 1.0, lastDifficulty + 1.5), targetDifficulty)
);
```

**Why Dampened Jumps?**
- Prevents wild swings (fractions → kindergarten → calculus)
- Provides smooth difficulty progression
- Respects theta but doesn't jump to it directly
- Dampens as confidence increases

---

## Skill Selection with Diversity

### **Multi-Factor Scoring Formula**

Skills are scored based on 4 factors:

```javascript
score = (difficultyDistance * 10) +     // Match target difficulty (10x weight)
        recencyPenalty +                // Exponential decay for recently tested
        categoryPenalty +               // Balance across topics (5x per category)
        (Math.pow(2, testCount) - 1);   // Exponential repetition penalty
```

### **1. Difficulty Matching (10x weight)**

```javascript
const difficultyDistance = Math.abs(estimatedDifficulty - targetDifficulty);
// Prefer skills close to target difficulty
```

### **2. Recency Penalty (Exponential Decay)**

```javascript
const questionsSinceLastTest = session.testedSkills.length - mostRecentIndex;
const recencyPenalty = 50 * Math.pow(0.5, questionsSinceLastTest - 1);

// Just tested (1 ago): +50 penalty
// 2 questions ago: +25 penalty
// 3 questions ago: +12.5 penalty
// 4 questions ago: +6.25 penalty
```

**Result**: Skills won't repeat back-to-back (no more "12 one-step equations in a row")

### **3. Category Balancing (5x per category test)**

```javascript
// Map 90+ categories to 4 broad categories
const broadCategories = {
  'number-operations': ['counting', 'addition', 'multiplication', 'fractions', 'decimals'],
  'algebra': ['equations', 'linear', 'quadratics', 'polynomials', 'functions'],
  'geometry': ['shapes', 'measurement', 'area', 'pythagorean', 'trigonometry'],
  'advanced': ['limits', 'derivatives', 'integration', 'calculus', 'statistics']
};

const categoryPenalty = categoryTestCount * 5;
```

**Result**: Test rotates through different topic areas

### **4. Skill Clustering (2+ skills per difficulty level)**

```javascript
// Group skills into difficulty bins (±0.35 range)
const DIFFICULTY_BIN_SIZE = 0.7;
const MIN_SKILLS_PER_BIN = 2;

// If tested < 2 skills in current bin, prefer skills in this bin
if (skillsInCurrentBin < MIN_SKILLS_PER_BIN && skillsInBin.length > 0) {
  candidateSkills = skillsInBin; // Stay at current difficulty
}
```

**Result**: Tests multiple skills at similar difficulty before jumping

---

## Convergence Criteria (When to Stop)

### **Multi-Tier Stopping Rules**

```javascript
const criteria = {
  minQuestions: 8,               // Minimum for reliability
  targetQuestions: 15,           // Soft target for typical students
  maxQuestions: 30,              // Hard cap (rarely hit)
  seThresholdStringent: 0.25,    // High confidence
  seThresholdAcceptable: 0.30,   // Acceptable confidence
  seThresholdFallback: 0.40,     // Minimum at max questions
  minInformationGain: 0.08       // Stop if gains < this for 3 questions
};
```

### **Stopping Conditions (Priority Order)**

**1. High Confidence Convergence (IDEAL STOP)**
```javascript
if (SE <= 0.30 && questionCount >= minQuestions) {
  return { action: 'interview', reason: 'converged' };
}
```

**2. Very Early Stopping (5 questions minimum)**
```javascript
// Advanced: 5 correct at difficulty > 1.0, theta > 1.5, SE <= 0.35
if (last5AllCorrect && avgDifficulty > 1.0 && theta > 1.5) {
  return { action: 'interview', reason: 'very-advanced' };
}

// Struggling: 5 incorrect at difficulty < -0.5, theta < -1.5, SE <= 0.35
if (last5AllIncorrect && avgDifficulty < -0.5 && theta < -1.5) {
  return { action: 'interview', reason: 'foundational-needs' };
}
```

**3. Target Questions Reached**
```javascript
if (questionCount >= targetQuestions && SE <= 0.40) {
  return { action: 'interview', reason: 'target-reached' };
}
```

**4. Information Plateau Detected**
```javascript
if (last3QuestionsInfoGain < 0.08 && questionCount >= minQuestions) {
  return { action: 'interview', reason: 'plateaued' };
}
```

**5. Max Questions (HARD STOP)**
```javascript
if (questionCount >= maxQuestions) {
  return { action: 'interview', reason: 'max-questions' };
}
```

### **Expected Question Counts**

- **Very Advanced Students**: 5-8 questions (perfect streak at high difficulty)
- **Advanced Students**: 8-12 questions (quick convergence)
- **Average Students**: 12-18 questions (normal convergence)
- **Struggling Students**: 8-12 questions (quick convergence at low difficulty)
- **Borderline/Inconsistent**: 20-30 questions (slow convergence)

---

## Progress & Confidence Meter

### **Confidence-Based Progress (NOT Question Count)**

```javascript
function calculateAdaptiveProgress(session) {
  // Phase 1: Questions 1 to minQuestions (8)
  // Linear progress: 0% → 50% (building baseline)
  if (questionCount < minQuestions) {
    return (questionCount / minQuestions) * 50;
  }

  // Phase 2: After minQuestions
  // Confidence-based: 50% → 100% (refining estimate)
  const confidenceGained = (1.0 - currentSE) / (1.0 - 0.30);
  return 50 + (confidenceGained * 50); // Never exceeds 100%
}
```

### **Confidence States**

| State | Condition | Progress | Description | UI Color |
|-------|-----------|----------|-------------|----------|
| **gathering** | Q1-8 | 0-50% | Building baseline | Blue/Gray |
| **low** | SE > 0.30 | 50-100% | Refining estimate | Yellow/Orange |
| **medium** | SE ≤ 0.30 | 100% ✓ | Confident | Light Green |
| **high** | SE ≤ 0.25 | 100% ✓✓ | High confidence | Dark Green |

### **API Response**

```json
{
  "progress": {
    "current": 12,
    "min": 8,
    "target": 15,
    "max": 30,
    "percentComplete": 85,
    "confidenceLevel": "medium",
    "confidenceAchieved": true,
    "confidenceDescription": "Confident"
  }
}
```

### **UI Visualization**

```
┌─────────────────────────────────────────┐
│ Assessing Your Level... 85% ✓ Confident │
│                                          │
│ [████████████████░░░░░░░░░]             │
│  ▲               ▲                       │
│  Baseline     Threshold                  │
│                                          │
│ Question 12 of ~15                       │
└─────────────────────────────────────────┘
```

---

## Question Delivery (No Feedback During Test)

### **Question Format**

```
┌──────────────────────────────────────────────────────┐
│  📍 Placement Assessment                             │
│  Question 7 of ~15 • 65% Complete                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Solve for x:                                       │
│                                                      │
│  2x + 5 = 13                                        │
│                                                      │
│  [Your answer: ____________]             [Submit]   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**IMPORTANT**: **NO FEEDBACK** during test (prevents negative momentum)
- No "Correct!" or "Incorrect" messages
- No showing correct answer
- Silent transition to next question
- Only final report at end

---

## Results & Placement

### **Theta to Grade Level Mapping**

```javascript
const thetaToGrade = {
  '-3.0 to -2.0': 'Kindergarten - 1st Grade',
  '-2.0 to -1.0': '2nd - 3rd Grade',
  '-1.0 to 0.0':  '4th - 6th Grade',
  '0.0 to 1.0':   '7th - 8th Grade',
  '1.0 to 2.0':   'Algebra 1 - Geometry',
  '2.0 to 3.0':   'Algebra 2 - Precalculus',
  '3.0+':         'Calculus and Beyond'
};

// Percentile conversion
function thetaToPercentile(theta) {
  // Assuming normal distribution of theta
  // θ = 0 → 50th percentile
  // θ = 1 → ~84th percentile
  // θ = -1 → ~16th percentile
}
```

### **Skill Categorization**

```javascript
function categorizeSkills(theta, responses) {
  const skillPerformance = {};

  // Aggregate by skill
  responses.forEach(r => {
    skillPerformance[r.skillId] = {
      attempts: count,
      correct: correctCount,
      avgDifficulty: avg(difficulties),
      accuracy: correct / attempts
    };
  });

  // Categorize
  return {
    mastered: skills.filter(s =>
      s.accuracy >= 0.8 && s.avgDifficulty < theta - 0.5
    ),
    learning: skills.filter(s =>
      s.correct > 0 && s.avgDifficulty <= theta
    ),
    ready: skills.filter(s =>
      Math.abs(s.avgDifficulty - theta) < 0.5
    ),
    frontier: skills.filter(s =>
      !s.correct && Math.abs(s.avgDifficulty - theta) < 0.7
    )
  };
}
```

### **Placement Report**

```
┌──────────────────────────────────────────────────────┐
│  🎉 Assessment Complete!                             │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Great work! Here's your math profile:              │
│                                                      │
│  📊 Your Ability Level                              │
│  Theta: 0.85 (72nd percentile)                     │
│  Confidence: High (SE = 0.24)                       │
│  Grade Equivalent: Mid 8th Grade                    │
│                                                      │
│  Questions Answered: 14                             │
│  Accuracy: 71% (10/14 correct)                      │
│  Duration: 12 minutes                               │
│                                                      │
│  ✅ Mastered Skills (23):                           │
│  • Integer operations                               │
│  • Ratios & proportions                             │
│  • One-step equations                               │
│  • Basic fractions                                  │
│  [+19 more...]                                      │
│                                                      │
│  📚 Learning Skills (8):                            │
│  • Two-step equations                               │
│  • Linear functions                                 │
│  • Multi-step equations                             │
│  [+5 more...]                                       │
│                                                      │
│  🎯 Ready to Learn (5):                             │
│  • Systems of equations                             │
│  • Quadratics                                       │
│  • Polynomials                                      │
│  [+2 more...]                                       │
│                                                      │
│  🏆 Badges Unlocked: 23                             │
│  🔓 Skills Available: 31                            │
│                                                      │
│  [View Full Report →]  [Start Learning! 🚀]        │
└──────────────────────────────────────────────────────┘
```

---

## Interview Phase (Frontier Exploration)

After convergence, the system transitions to an **interview phase** to probe frontier skills:

```javascript
function identifyInterviewSkills(session) {
  const { theta, responses } = session;
  const frontierSkills = [];

  // Find skills near theta that were failed
  for (const response of responses) {
    const diffFromTheta = Math.abs(response.difficulty - theta);

    if (!response.correct && diffFromTheta < 0.7) {
      frontierSkills.push({
        skillId: response.skillId,
        difficulty: response.difficulty,
        needsProbe: true,
        reason: 'failed-near-theta'
      });
    }
  }

  return frontierSkills.slice(0, 3); // Top 3 skills to probe
}
```

**Interview Questions:**
- 2-3 additional questions at frontier skills
- Conversational with AI feedback (unlike silent screener)
- Confirms edge of knowledge
- Informs personalized learning path

---

## Badge Unlocking Logic

### **Auto-Award Based on Theta**

```javascript
async function awardBadgesForSkills(user, session, masteredSkills, theta) {
  const earnedBadges = [];

  // 1. Award badges for mastered skills (accuracy >= 80%)
  for (const skillId of masteredSkills) {
    const badges = await Badge.find({
      'requirements.skillsMastered': skillId,
      'requirements.minTheta': { $lte: theta }
    });
    earnedBadges.push(...badges);
  }

  // 2. Award grade-level completion badges
  const gradeLevel = thetaToGradeLevel(theta);
  for (let level = 0; level <= gradeLevel; level++) {
    const gradeBadges = await Badge.find({
      category: 'grade-complete',
      gradeLevel: level
    });
    earnedBadges.push(...gradeBadges);
  }

  // 3. Mark badges as earned
  for (const badge of earnedBadges) {
    user.badges.push({
      badgeId: badge.badgeId,
      earnedDate: new Date(),
      source: 'placement-test',
      theta: theta
    });
  }

  await user.save();
  return earnedBadges;
}
```

---

## Analytics & Debugging

### **Logging Output**

```bash
[Screener Jump] Q5: CORRECT at d=0.50 → jump +0.75 → target 1.25 (θ=0.82, SE=0.45)

[Screener Q6] Target d=1.25 → "quadratics" (d=1.18, Δ=0.07, score=2.7
  [diff=0.7 + recency=0.0 + cat=5.0 + tests=0.0])

[DEBUG] Category counts: {
  number-operations: 2,
  algebra: 3,
  geometry: 1,
  advanced: 0
}

[DEBUG] Current difficulty bin: [-0.15, 1.25], tested 1 skills in bin
[DEBUG] Clustering: Staying in current bin, 5 untested skills available

[Screener] Q6 Result: CORRECT | Theta: 0.82 → 1.05 (Δ+0.23) | SE: 0.412
```

### **Session Data Structure**

```javascript
{
  sessionId: 'screener_1234567890_abc123',
  userId: ObjectId('...'),
  theta: 0.85,
  standardError: 0.24,
  confidence: 0.81,
  questionCount: 14,
  converged: true,

  responses: [
    {
      problemId: 'prob_123',
      skillId: 'one-step-equations-addition',
      skillCategory: 'equations',
      difficulty: 0.0,
      discrimination: 1.2,
      correct: true,
      responseTime: 15000,
      thetaBefore: 0.0,
      thetaAfter: 0.35,
      thetaChange: 0.35,
      informationGained: 0.18
    },
    // ... more responses
  ],

  testedSkills: ['one-step-equations-addition', 'fractions', 'integers', ...],
  testedSkillCategories: {
    'number-operations': 4,
    'algebra': 6,
    'geometry': 3,
    'advanced': 1
  },

  frontier: {
    skillId: 'two-step-equations',
    difficultyLevel: 1.0,
    firstFailureTheta: 0.85
  }
}
```

---

## Implementation Components

### **Backend**

```
/routes/screener.js
├── POST /api/screener/start          (Initialize session)
├── GET /api/screener/next-problem    (Get adaptive problem)
├── POST /api/screener/submit-answer  (Process response, update theta)
├── GET /api/screener/report          (Get final report)
└── POST /api/screener/complete       (Apply results, award badges)

/utils/adaptiveScreener.js
├── initializeSession()               (Create session with IRT defaults)
├── processResponse()                 (Update theta via MLE)
├── checkConvergenceCriteria()        (Multi-tier stopping rules)
├── determineNextAction()             (Continue vs interview vs complete)
├── calculateJumpSize()               (Dampened difficulty jumps)
├── identifyInterviewSkills()         (Find frontier skills)
└── generateReport()                  (Categorize skills, create summary)

/utils/irt.js
├── estimateAbility()                 (Newton-Raphson MLE)
├── calculateInformation()            (Fisher information)
├── thetaToPercentile()               (Theta → percentile conversion)
├── hasConverged()                    (SE threshold check)
└── hasPlateaued()                    (Information gain check)

/models/screenerSession.js
└── TTL index (auto-delete after 24 hours)
```

### **Frontend**

```
/public/js/adaptiveScreener.js
├── UI for confidence meter
├── Progress bar with threshold marker
├── Question display (no feedback)
└── Results visualization
```

---

## Advantages Over Binary Search

| Feature | Binary Search (Old) | IRT-CAT (New) |
|---------|---------------------|---------------|
| **Ability Estimate** | Discrete level (0-13) | Continuous theta (-3 to +3) |
| **Precision** | ±1 grade level | ±0.5 grade level (SE = 0.30) |
| **Question Count** | Fixed 15-20 | Adaptive 5-30 |
| **Difficulty Jumps** | Fixed 50% reduction | Dampened by confidence & time |
| **Topic Diversity** | Random | Balanced across categories |
| **Confidence** | None | Statistical SE with thresholds |
| **Early Stopping** | No | Yes (very advanced/struggling) |
| **Progress Indicator** | Question count | Confidence-based meter |

---

## Benefits

1. **Statistically Rigorous**: IRT provides scientific ability estimation
2. **Truly Adaptive**: Stops when confident, not at arbitrary count
3. **Respects Time**: Advanced students finish in 5-8 questions
4. **Topic Coverage**: Ensures diverse skill assessment
5. **Smooth Progression**: Dampened jumps prevent wild difficulty swings
6. **Transparent**: Confidence meter shows WHY test continues
7. **Actionable**: Theta score enables precise badge unlocking
8. **Professional**: Same methodology used by GRE, SAT, and GMAT

This IRT-based CAT screener provides research-grade psychometric assessment while maintaining a student-friendly, efficient experience!
