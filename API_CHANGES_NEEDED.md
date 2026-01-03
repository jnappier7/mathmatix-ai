# API Changes Required for New Pattern-Based UX

## Summary
The new UX redesign introduces a hierarchical pattern-based mastery system:
**Pattern → Tier → Milestone → Badge**

This requires new API endpoints and modifications to existing data structures.

---

## New API Endpoints Needed

### 1. `GET /api/mastery/mastery-map`
**Purpose**: Returns unified mastery map with full pattern hierarchy

**Response Format**:
```json
{
  "patterns": [
    {
      "patternId": "equivalence",
      "name": "Equivalence",
      "description": "Understanding equality and balance in mathematics",
      "currentTier": 2,
      "status": "in-progress",
      "progress": 45,
      "tiers": [
        {
          "tierNum": 1,
          "name": "Foundations",
          "status": "completed",
          "milestones": [
            {
              "milestoneId": "basic-equality",
              "name": "Basic Equality",
              "description": "Understanding the equals sign",
              "status": "completed",
              "progress": 100,
              "problemsCorrect": 10,
              "requiredProblems": 10
            }
          ]
        },
        {
          "tierNum": 2,
          "name": "Building Skills",
          "status": "active",
          "milestones": [
            {
              "milestoneId": "solving-equations",
              "name": "Solving Equations",
              "description": "One-step equation solving",
              "status": "in-progress",
              "progress": 60,
              "problemsCorrect": 6,
              "requiredProblems": 10
            }
          ]
        }
      ]
    }
  ],
  "assessmentCompleted": true
}
```

**Notes**:
- Should combine existing pattern data with tier/milestone structure
- Can initially fallback to existing `/pattern-badges` data if full hierarchy not implemented yet

---

### 2. `POST /api/mastery/select-milestone`
**Purpose**: Selects a specific milestone for practice

**Request Body**:
```json
{
  "patternId": "equivalence",
  "tierNum": 2,
  "milestoneId": "solving-equations"
}
```

**Response**:
```json
{
  "success": true,
  "activeBadge": {
    "patternId": "equivalence",
    "patternName": "Equivalence",
    "tierNum": 2,
    "tierName": "Building Skills",
    "milestoneId": "solving-equations",
    "milestoneName": "Solving Equations",
    "description": "One-step equation solving",
    "problemsCompleted": 6,
    "problemsCorrect": 6,
    "requiredProblems": 10,
    "requiredAccuracy": 0.8,
    "progress": 60
  }
}
```

**Notes**:
- Sets `user.masteryProgress.activeBadge` with pattern-based structure
- Backend needs to validate tier is unlocked
- Should return error if trying to select locked milestone

---

### 3. `GET /api/mastery/user-stats`
**Purpose**: Returns user statistics for sidebar display (lightweight, no full badge map)

**Response Format**:
```json
{
  "averageTheta": 0.5,
  "badgesEarned": 12,
  "totalXP": 2400
}
```

**Notes**:
- Lightweight alternative to `/badge-map` for stats-only requests
- Can extract from existing user model

---

## Modified API Endpoints

### 4. `GET /api/mastery/next-phase-problem`
**Current Behavior**: Returns next problem for active badge

**Required Changes**:
- Must support pattern-based `activeBadge` structure
- Should work with both old badge system and new pattern/tier/milestone system
- Check for `activeBadge.milestoneId` vs `activeBadge.badgeId`

**No breaking changes needed** - just conditional logic to support both structures

---

### 5. `POST /api/mastery/record-phase-attempt`
**Current Behavior**: Records problem attempt for active badge

**Required Changes**:
- Must update progress for pattern-based badges
- Should increment progress on `activeBadge.milestoneId` instead of `activeBadge.badgeId`
- Update `activeBadge.problemsCompleted` and `activeBadge.problemsCorrect`

**No breaking changes needed** - just conditional logic to support both structures

---

## Data Model Changes

### User.masteryProgress.activeBadge
**Old Structure** (Traditional Badges):
```javascript
{
  badgeId: String,
  badgeName: String,
  skillId: String,
  tier: String,  // 'bronze', 'silver', 'gold'
  problemsCompleted: Number,
  problemsCorrect: Number,
  requiredProblems: Number,
  requiredAccuracy: Number
}
```

**New Structure** (Pattern-Based):
```javascript
{
  // Pattern-based badges (new system)
  patternId: String,          // e.g., 'equivalence'
  patternName: String,        // e.g., 'Equivalence'
  tierNum: Number,            // 1, 2, 3, etc.
  tierName: String,           // e.g., 'Foundations'
  milestoneId: String,        // e.g., 'basic-equality'
  milestoneName: String,      // e.g., 'Basic Equality'
  description: String,        // Milestone description

  // Progress tracking (same as before)
  problemsCompleted: Number,
  problemsCorrect: Number,
  requiredProblems: Number,
  requiredAccuracy: Number,
  progress: Number,           // percentage

  // Legacy fields (for backward compatibility)
  badgeId: String,            // Can map to milestoneId
  badgeName: String,          // Can map to milestoneName
  skillId: String,            // Can map to milestoneId
  tier: String                // Can map to tierNum
}
```

**Notes**:
- Support both structures during transition
- Frontend checks for `patternId` to determine which structure is active

---

## Implementation Priority

### Phase 1 (Minimum Viable - Can test new UX with mock data):
1. ✅ Frontend redesign complete
2. ⚠️ Create `/api/mastery/mastery-map` endpoint (can return mock/transformed data from existing patterns)
3. ⚠️ Create `/api/mastery/select-milestone` endpoint
4. ⚠️ Create `/api/mastery/user-stats` endpoint

### Phase 2 (Full Integration):
1. Add tier/milestone data to pattern schema
2. Modify `next-phase-problem` to support pattern-based badges
3. Modify `record-phase-attempt` to update pattern-based progress
4. Add tier unlocking logic

### Phase 3 (Cleanup):
1. Migrate existing badge data to pattern hierarchy
2. Deprecate old `/badge-map` endpoint
3. Remove dual-system support

---

## Temporary Fallback Strategy
To test the new UX before full backend implementation:

1. **`/api/mastery/mastery-map`** can transform existing `/api/mastery/pattern-badges` data:
   - Map current patterns to tier 1 only
   - Create mock milestones from pattern data
   - Set all tiers 2+ as locked

2. **`/api/mastery/select-milestone`** can call existing `/api/mastery/select-pattern`:
   - Map milestoneId → patternId
   - Set activeBadge with pattern-based structure

3. **`/api/mastery/user-stats`** can extract from existing `/api/mastery/badge-map`:
   - Just return theta, badges earned, XP

This allows immediate testing of new UX while backend development continues.

---

## Files Modified in This Update
- ✅ `/public/badge-map.html` - Complete redesign with expandable cards
- ✅ `/public/mastery-chat.html` - Added pattern breadcrumb navigation
- ⚠️ Backend routes need updates listed above
