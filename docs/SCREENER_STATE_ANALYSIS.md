# Horizontal IRT & Adaptive Screener - Current State Analysis

## 📊 Current Implementation Status

### ✅ What's Working
1. **2PL IRT Model** (`utils/irt.js`)
   - Probability calculation: `P(θ) = 1 / (1 + exp(-α(θ - β)))`
   - Maximum Likelihood Estimation (MLE) with Newton-Raphson
   - Fisher Information calculation
   - Standard Error estimation

2. **Adaptive Selection**
   - Dampened jump logic (large early, small late)
   - Convergence criteria: SE < 0.3, plateau detection
   - Problem selection by difficulty with LRU exclusion

3. **Student-Facing Display**
   - Students see: accuracy %, questions answered, duration
   - Students do NOT see: theta, SE, percentile (good!)
   - No feedback during test (prevents momentum issues)

---

## ❌ Critical Bugs

### 🔴 Bug #1: Theta Reset on Every Question
**Location:** `utils/adaptiveScreener.js:182`

**Current Code:**
\`\`\`javascript
const abilityEstimate = estimateAbility(responsesForEstimation);
\`\`\`

**Problem:** Missing `initialTheta` option, so estimation starts from θ=0 every time instead of continuing from previous estimate.

**Fix:**
\`\`\`javascript
const abilityEstimate = estimateAbility(responsesForEstimation, {
  initialTheta: session.theta  // Continue from previous estimate
});
\`\`\`

**Impact:** This causes wild θ swings and poor convergence. **MUST FIX IMMEDIATELY.**

---

### 🟡 Bug #2: Ignores Grade Level at Start
**Location:** `routes/screener.js:154`

**Current Code:**
\`\`\`javascript
const sessionData = initializeSession({
  userId: user._id.toString(),
  startingTheta: 0  // Always starts at average
});
\`\`\`

**Problem:** 9th graders start with elementary problems, kindergarteners get algebra.

**Fix:**
\`\`\`javascript
function gradeToTheta(grade) {
  const g = parseInt(grade, 10);
  if (Number.isNaN(g) || g < 1) return 0;
  // Map grade to theta using curriculum progression
  // K-2: -2.5 to -2.0 (foundations)
  // 3-5: -1.5 to -0.5 (elementary mastery)
  // 6-8: -0.5 to +0.5 (middle school)
  // 9-12: +0.5 to +1.5 (high school)
  // College: +1.5 to +2.5

  if (g <= 2) return -2.0;
  if (g <= 5) return -1.0;
  if (g <= 8) return 0;
  if (g <= 12) return 1.0;
  return 2.0;
}

const sessionData = initializeSession({
  userId: user._id.toString(),
  startingTheta: gradeToTheta(user.gradeLevel)
});
\`\`\`

---

## 🎯 Philosophical Questions to Resolve

### Question 1: What should students see at the end?

**Current:** `{ accuracy: 85, questionsAnswered: 15, duration: 180000 }`

**Options:**

**A) Show Theta (technical)**
- "Your ability estimate is θ=1.2 (84th percentile)"
- ❌ Students won't understand
- ❌ Feels cold/scientific

**B) Show Grade Level (intuitive)**
- "You're performing at a 9th grade level in math"
- ✅ Students understand immediately
- ❌ Downside: Grade level is imprecise (skills are horizontal, not vertical)
- ❌ Might discourage students ("I'm in 10th but testing at 8th?")

**C) Show Pattern Strengths (horizontal)**
- "You've mastered: Equivalence, Scaling, Structure"
- "Ready to learn: Change patterns, Transformation"
- ✅ Aligns with horizontal curriculum
- ✅ Actionable and encouraging
- ✅ No stigma of "below grade level"

**D) Hybrid: Estimated Grade Level + Pattern Breakdown**
- "Overall: 9th grade equivalent"
- "Strengths: Algebra, Geometry"
- "Growing: Statistics, Functions"
- ✅ Best of both worlds
- ⚠️ More complex UI

**RECOMMENDATION:** Option C (Pattern Strengths) or D (Hybrid)
- Students care about "what can I do?" not "what's my theta?"
- Horizontal skills avoid the stigma of vertical ranking

---

### Question 2: Grade-Based Theta Mapping

**Your question:** "Should we start the screener as the grade level prior to known?"

**Current:** Always starts at θ=0 (average)

**Recommendation:** YES, but with Bayesian priors

**Implementation:**
\`\`\`javascript
// Starting point
const priorMean = gradeToTheta(user.gradeLevel - 1);  // One grade below
const priorSD = 1.25;  // Wide prior (allow for variance)

// Use MAP estimation early (first 5-10 questions)
if (session.questionCount <= 10) {
  const abilityEstimate = estimateAbilityMAP(responsesForEstimation, {
    initialTheta: session.theta,
    priorMean,
    priorSD
  });
} else {
  // Switch to MLE after convergence
  const abilityEstimate = estimateAbility(responsesForEstimation, {
    initialTheta: session.theta
  });
}
\`\`\`

**Why "grade - 1"?**
- Conservative: Better to start slightly easy than frustratingly hard
- Builds confidence with early correct answers
- Adaptive system quickly adjusts upward if needed

**Downsides:**
- ❌ Assumes grade = ability (not always true)
- ❌ Students who skip grades or are advanced/struggling will still need many questions

**Mitigation:**
- Use wide prior (SD = 1.25) so data quickly overrides grade assumption
- After 5-10 items, switch to pure MLE

---

## 🔧 Technical Improvements Needed

### Priority 1: Critical Fixes (Do Now)
1. ✅ **Pass initialTheta to estimateAbility()** - Prevents theta reset bug
2. ✅ **Use grade-based starting theta** - Better initial placement
3. ⚠️ **Add MAP estimation** - Bayesian priors for first 10 questions

### Priority 2: Architecture Upgrades (Next Sprint)
4. **Replace jump heuristics with Fisher Information**
   - Current: Heuristic difficulty jumps based on correct/incorrect
   - Better: Select item with maximum information at current θ
   - Formula: I(θ) = α² × P(θ) × (1 - P(θ))

5. **Add content balancing**
   - Track coverage across patterns (Equivalence, Scaling, Change, etc.)
   - When multiple items have similar information, choose least-covered skill

6. **Implement exposure control**
   - Track how often each problem is used
   - Avoid overexposing high-value calibration items

### Priority 3: Long-Term (Future)
7. **Item calibration pipeline**
   - Collect real student response data
   - Re-estimate difficulty/discrimination using MMLE or MCMC
   - Replace expert-assigned parameters with empirical estimates

8. **Continuous validation**
   - Monte Carlo simulation with known θ
   - Measure RMSE, convergence rate, bias

9. **Speed-weighted responses**
   - Use response time to detect guessing
   - Down-weight "slow correct" and "fast incorrect" in likelihood

---

## 📋 Recommended Display for Students

**End of Screener:**

\`\`\`
🎉 Assessment Complete!

You answered 18 questions in 6 minutes.

Your Math Strengths:
✓ Equivalence Patterns (Mastered)
✓ Scaling & Ratios (Mastered)
✓ Structure Recognition (Strong)

Ready to Learn:
→ Change & Rate Patterns
→ Transformation Geometry

Estimated Level: 9th Grade Math
(This is based on the skills you've demonstrated)

[Continue to Your Learning Path →]
\`\`\`

**Why this works:**
- ✅ Focuses on what they CAN do (strengths)
- ✅ Shows clear next steps (ready to learn)
- ✅ Includes grade level for parents/teachers
- ✅ No stigma ("Ready to learn" not "Deficient in")
- ✅ Aligns with horizontal curriculum

---

## 🚀 Implementation Roadmap

**Week 1: Critical Fixes**
- [ ] Fix theta reset bug (pass initialTheta)
- [ ] Add gradeToTheta() mapping
- [ ] Use grade-based starting theta
- [ ] Test convergence with real data

**Week 2: Bayesian Priors**
- [ ] Implement estimateAbilityMAP()
- [ ] Use MAP for first 10 questions, then MLE
- [ ] Compare convergence with/without priors

**Week 3: Student Display**
- [ ] Add thetaToGradeLevel() function
- [ ] Design pattern-based strength report
- [ ] Update frontend to show grade level + patterns

**Week 4: Fisher Information**
- [ ] Replace jump heuristics with max information selection
- [ ] Add content balancing across patterns
- [ ] Test with simulation

---

## 📝 Final Recommendation

**Grade Level Display: YES with caveats**
- Show it, but don't make it the primary message
- Lead with pattern strengths (horizontal)
- Include estimated grade level for context
- Frame as "based on skills demonstrated" not "your true level"

**Starting Theta: Grade - 1**
- Use Bayesian prior centered at (student's grade - 1)
- Wide SD (1.25) allows quick adjustment
- After 10 items, switch to pure MLE

**Critical Bug: Fix immediately**
- Theta reset on every question is breaking convergence
- One-line fix, massive impact

---

**Files to modify:**
1. `utils/adaptiveScreener.js:182` - Pass initialTheta
2. `routes/screener.js:154` - Use grade-based starting theta
3. `utils/irt.js` - Add estimateAbilityMAP()
4. `utils/adaptiveScreener.js` - Add thetaToGradeLevel()
5. Frontend - Update completion screen
