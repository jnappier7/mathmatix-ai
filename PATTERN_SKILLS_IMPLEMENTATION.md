# Pattern-Based Skills Implementation Guide

## Overview

This document describes the implementation of comprehensive skill definitions for the pattern-based mastery mode UX, along with strategic expansions to the pattern milestone structure.

## What Was Implemented

### 1. Skill Database Population (59 Core Skills Created)

Created `/seeds/skills-pattern-based.json` with 59 foundational skills covering:

- **Equivalence Pattern**: Fact families, missing addends, balance scales, equations (1-step through systems)
- **Scaling Pattern**: Skip counting, multiplication, fractions, ratios, proportions
- **Change Pattern**: Counting, addition/subtraction, comparing numbers
- **Structure Pattern**: Place value, decomposition/composition, combining like terms, distributive property
- **Comparison Pattern**: Greater/less than, ordering, rounding
- **Accumulation Pattern**: Counting, repeated addition, multi-digit addition

### 2. Pattern Milestone Expansions (5 New Milestones Added)

Enhanced pattern structure with strategic additions:

| Pattern | Tier | New Milestone | Description |
|---------|------|---------------|-------------|
| Structure | Tier 1 | Number Bonds | Build fluency with number relationships |
| Structure | Tier 2 | Order of Operations | Apply PEMDAS/GEMDAS systematically |
| Space | Tier 1 | Symmetry | Identify and create symmetric shapes |
| Comparison | Tier 1 | Estimation | Estimate sums and check reasonableness |
| Change | Tier 1 | Change Story Problems | Solve word problems with change scenarios |

### 3. Updated Pattern Distribution

**Before:**
- Total: 97 milestones
- Range: 11-14 milestones per pattern
- Tier 1 range: 3-4 milestones

**After:**
- Total: 102 milestones
- Range: 12-14 milestones per pattern
- Tier 1: Consistently 3-4 milestones across all patterns

**Distribution by Pattern:**
```
Equivalence: 14 milestones (4-4-4-2 across tiers)
Scaling:     14 milestones (4-4-4-2 across tiers)
Change:      13 milestones (4-4-3-2 across tiers)
Structure:   13 milestones (4-4-3-2 across tiers)
Space:       12 milestones (4-3-3-2 across tiers)
Comparison:  12 milestones (4-3-3-2 across tiers)
Uncertainty: 12 milestones (3-3-3-3 across tiers)
Accumulation:12 milestones (3-3-3-3 across tiers)
```

## Files Modified

### Created
- `/seeds/skills-pattern-based.json` - 59 foundational pattern-based skills
- `/scripts/seed-pattern-skills.js` - Upsert-based seeding script (non-destructive)
- `/PATTERN_SKILLS_IMPLEMENTATION.md` - This documentation

### Modified
- `/utils/patternBadges.js` - Added 5 new strategic milestones

## Deployment Instructions

### Step 1: Database Setup

Ensure you have a MongoDB connection configured in `.env`:

```bash
MONGO_URI=mongodb://localhost:27017/mathmatix
# or your production MongoDB URI
```

### Step 2: Seed Pattern Skills

Run the seeding script to add pattern-based skills to your database:

```bash
cd /home/user/mathmatix-ai
node scripts/seed-pattern-skills.js
```

This script:
- ✅ Does NOT delete existing skills
- ✅ Uses upsert operations (updates if exists, inserts if new)
- ✅ Preserves all existing skill data
- ✅ Shows detailed summary of operations

Expected output:
```
Loaded 59 pattern-based skills from JSON file
Current database has X skills
Upserting skills (updating existing, adding new)...
✓ Inserted: Y new skills
✓ Updated: Z existing skills
Total skills in database: X+Y
```

### Step 3: Verify Installation

Test the skill lookup with a pattern milestone:

```javascript
const Skill = require('./models/skill');

// Example: Test one-step equations (Equivalence Tier 2)
const skill = await Skill.findOne({ skillId: 'one-step-equations' });
console.log(skill); // Should return the skill object

// Example: Test skip-counting (Scaling Tier 1)
const skill2 = await Skill.findOne({ skillId: 'skip-counting' });
console.log(skill2); // Should return the skill object
```

### Step 4: Test Pattern-Based UX

1. Complete the screener assessment (if not already done)
2. Navigate to `/badge-map.html`
3. Verify patterns display with expanded accordion cards
4. Select a milestone from any pattern
5. Verify mastery-chat loads with pattern breadcrumb
6. Check that problems generate without "Skill not found" errors

## Skill Coverage Analysis

### Skills Now Available (59/204 = 29%)

The 59 skills created cover the most critical early-tier concepts:

**✅ Full Coverage:**
- Tier 1 Equivalence (fact families, missing addends, balance scales, proto-variables)
- Tier 1-2 Scaling (skip counting through fractions)
- Tier 1 Change (counting, addition/subtraction, comparison)
- Tier 1-2 Structure (place value, decomposition, algebraic expressions)
- Tier 1 Comparison (greater/less than, ordering, rounding)

**⚠️ Partial Coverage:**
- Tier 2-3 Equivalence (equations and systems - 10/16 skills)
- Tier 2-3 Change (slope, linear relationships - need more)
- All Tier 3-4 content across patterns (primarily high school/college)

### Remaining Skills Needed (145 skills)

**High Priority (Tier 1-2, ~60 skills):**
- Space pattern: shapes, spatial relationships, coordinate plane
- Uncertainty pattern: probability, data collection, statistics
- Accumulation pattern: sequences, series
- Additional word problem types

**Medium Priority (Tier 3, ~50 skills):**
- Systems of equations/inequalities
- Quadratic functions
- Rational expressions
- Function transformations
- Geometry proofs

**Lower Priority (Tier 4, ~35 skills):**
- Calculus (limits, derivatives, integrals)
- Linear algebra (matrices, vectors, transformations)
- Advanced statistics (hypothesis testing, confidence intervals)
- Abstract algebra concepts

## Next Steps

### Option A: Manual Skill Creation (Recommended for Quality)

Continue adding skills to `/seeds/skills-pattern-based.json` following the established schema:

```json
{
  "skillId": "unique-id",
  "displayName": "Human-Readable Name",
  "description": "What the skill teaches",
  "category": "skill-category",
  "course": "Grade Level or Course",
  "quarter": 1,
  "unit": "Pattern Name - Tier X",
  "prerequisites": ["skill-id-1", "skill-id-2"],
  "enables": ["skill-id-3", "skill-id-4"],
  "standardsAlignment": ["CCSS.MATH.X.Y.Z"],
  "teachingGuidance": {
    "coreConcepts": ["Concept 1", "Concept 2"],
    "commonMistakes": ["Mistake 1", "Mistake 2"],
    "teachingTips": ["Tip 1", "Tip 2"]
  },
  "difficultyLevel": 5,
  "fluencyMetadata": {
    "baseFluencyTime": 35,
    "fluencyType": "procedural",
    "toleranceFactor": 3.0
  }
}
```

After adding skills, run the seed script again:
```bash
node scripts/seed-pattern-skills.js
```

### Option B: Automated Skill Generation (Faster, Less Nuanced)

Create a skill generator script that auto-generates basic skills from milestone definitions:

```javascript
// Pseudo-code for automation
milestones.forEach(milestone => {
  milestone.skillIds.forEach(skillId => {
    if (!skillExists(skillId)) {
      generateBasicSkill({
        skillId,
        pattern: milestone.pattern,
        tier: milestone.tier,
        basedOn: milestone.description
      });
    }
  });
});
```

⚠️ **Trade-off:** Automated skills lack the pedagogical nuance of hand-crafted ones (teaching guidance, common mistakes, etc.)

### Option C: Hybrid Approach (Best Balance)

1. Auto-generate basic skill stubs for all 145 missing skills
2. Manually enhance high-priority Tier 1-2 skills with teaching guidance
3. Leave Tier 3-4 skills as basic stubs until needed

## Problem Generation Notes

### Current Fallback System

The `/utils/badgePhaseController.js` includes a fallback skill generator:

```javascript
// If no real skill found, creates temporary skill object
if (!skill && badge.isPatternBadge) {
  skill = {
    skillId: badge.milestoneId,
    name: badge.milestoneName,
    difficulty: 0.0,
    problemType: 'algebra-basic',
    generatorFunction: 'generateBasicAlgebraProblem'
  };
}
```

### Recommendation

The fallback works for MVP, but real skills provide:
- ✅ Accurate difficulty calibration (IRT theta values)
- ✅ Appropriate problem types for the concept
- ✅ Teaching guidance and hints
- ✅ Prerequisite/dependency tracking

**Priority:** Create real skills for Tier 1-2 milestones first, since these are encountered most frequently by students.

## Testing Checklist

- [ ] Seed script runs without errors
- [ ] Database shows increased skill count
- [ ] Pattern cards display correctly on /badge-map.html
- [ ] All 5 new milestones appear in their respective patterns
- [ ] Clicking a milestone navigates to /mastery-chat.html
- [ ] Pattern breadcrumb shows correctly
- [ ] Problems generate without "Skill not found" errors
- [ ] IRT scoring works for skills with real difficulty values
- [ ] Fallback skills work for milestones without database skills

## Maintenance

### Adding New Skills

1. Add skill definition to `/seeds/skills-pattern-based.json`
2. Run `node scripts/seed-pattern-skills.js`
3. Test in development environment
4. Deploy to production

### Adding New Milestones

1. Edit `/utils/patternBadges.js`
2. Add milestone to appropriate tier with:
   - Unique `milestoneId`
   - Clear `name` and `description`
   - Array of `skillIds` (create corresponding skills)
   - Required accuracy and problem count
3. Create skills for the new milestone
4. Seed skills into database
5. Test the full flow

## Architecture Notes

### Skill Lookup Flow

```
User selects milestone
  → activeBadge created with allSkillIds: [...]
  → generatePhaseProblem() tries each skillId in array
  → First match loads from database
  → If no match, fallback skill generated
  → Problem created using skill metadata
```

### Pattern Progress Calculation

```
Pattern progress = (mastered milestones / total milestones) × 100
Milestone mastery = ALL skillIds in milestone are mastered
Skill mastery = IRT theta above threshold OR inferred from assessment
```

## Support

For questions or issues:
1. Check console logs during skill seeding
2. Verify MongoDB connection in .env
3. Test individual skill lookups with Skill.findOne()
4. Review fallback behavior in /utils/badgePhaseController.js

---

**Implementation Date:** 2025-12-30
**Total Skills Created:** 59
**Total Milestones:** 102 (up from 97)
**Coverage:** 29% of required skills (59/204)
