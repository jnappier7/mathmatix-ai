# Pattern Badge System: Implementation Guide

## What This Solves

**The Problem:** Badge systems either:
1. Show "baby math" to older students (dignity collapse)
2. Lie about mastery (fake green checkmarks)
3. Create overwhelming flat lists (no growth visible)

**The Solution:** Pattern badges that grow K-12 with abstraction tiers.

---

## Core Concept

### Badges = Who You're Becoming

**Pattern Badges** (permanent, K-12):
- EQUIVALENCE (Balance)
- SCALING (Proportional reasoning)
- CHANGE (Rate)

Same badge from Grade 3 → Calculus. Just upgrades tiers.

### Tiers = Abstraction Height

**Not difficulty. Abstraction.**

- **Tier 1:** Concrete (objects, visual models, specific numbers)
- **Tier 2:** Symbolic (variables, generalized procedures)
- **Tier 3:** Structural (families of functions, transformations)
- **Tier 4:** Formal (proof, limits, rigorous reasoning)

### Milestones = Daily Progress

Micro-competencies within a tier. Not badges. Checkpoints.

---

## Example: The 9th Grader with Weak Fractions

**Old system (broken):**
```
Student sees: "Grade 4: Multiply Fractions" badge
Result: Shame spiral, disengagement
```

**New system (dignified):**
```
Pattern: SCALING
Current Tier: Tier 2 (Symbolic - Rational Expressions)
Fragile Milestone: "Simplify rational expressions with unlike denominators"

Problem: Simplify (3/x + 2/(x+1))

Silent tracking: Fraction addition is monitored
If fails → Micro-repair inside algebra context

Message:
"Let's strengthen fraction operations so you can crush rational expressions"

NOT:
"Let's go back to 4th grade fractions"
```

**Fractions are repaired in algebra context, not via rewind.**

---

## How It Works

### 1. Student Solves Problem

```javascript
POST /api/mastery/record-mastery-attempt
{
  "skillId": "simplify-rational-expressions",
  "correct": true,
  "hintUsed": false,
  "problemContext": "algebraic",
  "responseTime": 45
}
```

### 2. System Updates Skill Mastery

```javascript
// Skill marked as mastered
skillMastery: {
  status: 'mastered',
  masteryType: 'verified',  // <-- Directly tested
  tier: 3,  // Tier 3 skill
  patternId: 'scaling'
}
```

### 3. Inference Engine Triggers

```javascript
// Check if should infer lower-tier skills
if (tier >= 2 && status === 'mastered' && accuracy >= 0.85) {
  // Infer Tier 1 skills in same pattern
  inferredSkills = [
    'multiply-fractions',  // Tier 1
    'divide-fractions',    // Tier 1
    'add-fractions'        // Tier 1
  ];

  // Mark as inferred (85% mastery score)
  for (skill of inferredSkills) {
    skillMastery[skill] = {
      status: 'mastered',
      masteryType: 'inferred',  // <-- Not directly tested
      masteryScore: 85,
      inferredFrom: 'simplify-rational-expressions',
      inferredTier: 3
    };
  }
}
```

### 4. Pattern Progress Updates

```javascript
POST /api/mastery/update-pattern-progress
{
  "skillId": "simplify-rational-expressions"
}

// Response:
{
  "patternId": "scaling",
  "oldTier": 2,
  "newTier": 3,
  "tierUpgraded": true,
  "message": "Pattern tier upgraded: 2 → 3"
}
```

### 5. Badge Map Shows Growth

```javascript
GET /api/mastery/pattern-badges

// Grade 9 student sees:
{
  "patternBadges": [
    {
      "patternId": "scaling",
      "name": "Scaling",
      "currentTier": 3,
      "visibleTiers": [
        {
          "tier": 2,
          "name": "Ratios & Rates",
          "milestoneCount": 4
        },
        {
          "tier": 3,
          "name": "Rational Expressions",
          "milestoneCount": 4
        },
        {
          "tier": 4,
          "name": "Rational Functions",
          "milestoneCount": 2
        }
      ],
      "nextMilestone": {
        "milestoneId": "rational-functions",
        "name": "Rational Functions",
        "description": "Graph and analyze f(x) = p(x)/q(x)"
      },
      "progress": 75,
      "status": "in-progress"
    }
  ],
  "inferenceSummary": {
    "totalInferred": 12,
    "byPattern": {
      "scaling": 8,
      "equivalence": 4
    }
  }
}
```

**Notice:** No "Grade 4" labels. Ever.

---

## What Happens If Inferred Skill Fails Later?

### Scenario:
```
Student mastered rational expressions (Tier 3)
→ Fractions inferred as mastered (Tier 1)
→ Later, student directly fails a fraction problem
```

### System Response:

```javascript
// Mark as fragile-inferred
skillMastery['multiply-fractions'] = {
  status: 're-fragile',
  masteryType: 'fragile-inferred',
  masteryScore: 65,  // Dropped from 85
  explicitlyFailed: true,
  failureDate: new Date(),
  failureContext: { tier: 3, skill: 'rational-expressions' }
};

// Get repair strategy
repairStrategy = {
  skillId: 'multiply-fractions',
  repairStrategy: 'micro-repair-in-context',
  repairContext: { tier: 3 },  // Repair at Tier 3, not Tier 1
  message: "Quick tune-up needed. We'll strengthen this inside your current work."
};

// Generate 5 repair problems at Tier 3
repairProblems = [
  "(3x/4) × (2/5x)",  // Algebraic fractions, not 3/4 × 2/5
  "Simplify (x²/3) × (6/x)",
  // ... 3 more
];
```

**Key:** Repair happens at Tier 3 (algebra), not Tier 1 (4th grade).

---

## API Reference

### Get Pattern Badge Map

```http
GET /api/mastery/pattern-badges
```

**Returns:**
- Pattern badges with current tier
- Visible tiers based on grade level
- Next milestone to complete
- Inference summary

**Example Response:**
```json
{
  "success": true,
  "patternBadges": [
    {
      "patternId": "equivalence",
      "name": "Equivalence",
      "description": "Balance, sameness, and maintaining relationships",
      "icon": "fa-balance-scale",
      "color": "#2196f3",
      "currentTier": 2,
      "highestTierReached": 2,
      "visibleTiers": [
        {
          "tier": 1,
          "name": "Concrete Balance",
          "description": "Balance scales, missing addends, fact families",
          "gradeRange": [1, 3],
          "milestoneCount": 4
        },
        {
          "tier": 2,
          "name": "Symbolic Equations",
          "description": "Variables, inverse operations, maintaining balance",
          "gradeRange": [6, 8],
          "milestoneCount": 4
        },
        {
          "tier": 3,
          "name": "Systems & Constraints",
          "description": "Multiple equations, solution spaces, constraints",
          "gradeRange": [9, 10],
          "milestoneCount": 4
        }
      ],
      "nextMilestone": {
        "milestoneId": "systems-substitution",
        "name": "Systems (Substitution)",
        "description": "Solve systems by substituting one equation into another",
        "requiredAccuracy": 0.85,
        "requiredProblems": 12
      },
      "progress": 50,
      "status": "in-progress",
      "lastPracticed": "2025-12-27T10:30:00Z"
    }
  ],
  "gradeLevel": 9,
  "inferenceSummary": {
    "totalInferred": 12,
    "byPattern": {
      "equivalence": 4,
      "scaling": 8
    },
    "recentInferences": [
      {
        "skillId": "multiply-fractions",
        "inferredFrom": "simplify-rational-expressions",
        "daysAgo": 2
      }
    ]
  }
}
```

### Get Pattern Details

```http
GET /api/mastery/pattern/:patternId
```

**Example:**
```http
GET /api/mastery/pattern/scaling
```

**Returns:**
- All milestones across all tiers
- Completion status (completed, masteryType: verified/inferred)
- Tier upgrade history

### Update Pattern Progress

```http
POST /api/mastery/update-pattern-progress
{
  "skillId": "two-step-equations"
}
```

**What it does:**
1. Checks if skill mastery should trigger inference
2. Infers lower-tier skills if applicable
3. Recalculates pattern tier
4. Records tier upgrade if 50%+ milestones complete

**Returns:**
```json
{
  "success": true,
  "patternId": "equivalence",
  "oldTier": 1,
  "newTier": 2,
  "tierUpgraded": true,
  "status": "in-progress",
  "message": "Pattern tier upgraded: 1 → 2"
}
```

---

## Frontend Integration

### Display Pattern Badge Map

```javascript
async function loadPatternBadges() {
  const response = await fetch('/api/mastery/pattern-badges');
  const { patternBadges, inferenceSummary } = await response.json();

  const container = document.getElementById('pattern-badges');
  container.innerHTML = '';

  patternBadges.forEach(pattern => {
    const card = createPatternBadgeCard(pattern);
    container.appendChild(card);
  });

  // Show inference count
  document.getElementById('inferred-count').textContent =
    `${inferenceSummary.totalInferred} skills inferred from higher-tier mastery`;
}

function createPatternBadgeCard(pattern) {
  const card = document.createElement('div');
  card.className = 'pattern-badge-card';
  card.style.borderColor = pattern.color;

  const tierDisplay = pattern.visibleTiers.map(tier => `
    <div class="tier ${tier.tier === pattern.currentTier ? 'current' : ''}">
      <div class="tier-number">${tier.tier}</div>
      <div class="tier-name">${tier.name}</div>
      <div class="tier-progress">
        ${tier.tier < pattern.currentTier ? '✓' :
          tier.tier === pattern.currentTier ? `${pattern.progress}%` : '🔒'}
      </div>
    </div>
  `).join('');

  card.innerHTML = `
    <div class="pattern-icon" style="color: ${pattern.color}">
      <i class="fas ${pattern.icon}"></i>
    </div>
    <h3>${pattern.name}</h3>
    <p>${pattern.description}</p>

    <div class="tier-progression">
      ${tierDisplay}
    </div>

    ${pattern.nextMilestone ? `
      <div class="next-milestone">
        <strong>Next:</strong> ${pattern.nextMilestone.name}
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pattern.progress}%"></div>
        </div>
      </div>
    ` : ''}
  `;

  return card;
}
```

### CSS for Pattern Badges

```css
.pattern-badge-card {
  border: 3px solid;
  border-radius: 16px;
  padding: 24px;
  margin: 16px 0;
  background: linear-gradient(to bottom, #fff, #f9f9f9);
}

.pattern-icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: 16px;
}

.tier-progression {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}

.tier {
  flex: 1;
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  border: 2px solid #ddd;
  background: #f5f5f5;
}

.tier.current {
  border-color: #4caf50;
  background: linear-gradient(to bottom, #e8f5e9, #f5f5f5);
}

.tier-number {
  font-size: 24px;
  font-weight: bold;
  color: #666;
}

.tier-name {
  font-size: 12px;
  margin-top: 8px;
  color: #888;
}

.tier-progress {
  margin-top: 8px;
  font-size: 14px;
  font-weight: bold;
}

.next-milestone {
  margin-top: 16px;
  padding: 12px;
  background: #fffbea;
  border-radius: 8px;
  border-left: 4px solid #ffb74d;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(to right, #4caf50, #8bc34a);
  transition: width 0.5s ease-out;
}
```

---

## The Inference Rules (Guardrails)

### 1. Don't Cascade More Than 2 Tiers

```javascript
// Tier 4 mastered → infer Tier 2-3 ✓
// Tier 4 mastered → infer Tier 1 ✗ (too far)
```

### 2. Don't Infer If Recently Failed

```javascript
// Check recent attempt history
if (recentFailures.length > 0) {
  return { valid: false, reason: 'recent-failure' };
}
```

### 3. Don't Infer From Inferred

```javascript
// No inference cascades
if (skill.masteryType === 'inferred') {
  return false;  // Can't infer from inferred
}
```

### 4. Require Solid Performance

```javascript
// Must meet these thresholds:
- accuracy >= 0.85 (85%)
- hints <= 5
- status === 'mastered'
- tier >= 2
```

---

## North Star (Put This in Your Repo)

```
Patterns are the map.
Tiers show growth.
Milestones make progress visible.
Remediation never breaks dignity.
```

---

## What's Next

1. **Map existing skills to patterns** - Add `patternId` and `tier` to Skill model
2. **Test with 2 students:**
   - Grade 3: Should see Tier 1-2
   - Grade 9: Should see Tier 2-4, never "Grade 3" content
3. **Build pattern badge UI** - Use CSS above, show tier progression
4. **Add 5 more patterns** (Structure, Space, Comparison, Uncertainty, Accumulation)

The infrastructure is ready. Start mapping skills.
