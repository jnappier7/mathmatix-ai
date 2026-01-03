# Interview Phase - Current State & Implementation Plan

## 📊 Current State

### ✅ What Exists

**1. Backend Logic (`utils/adaptiveScreener.js`)**
- `determineNextAction()` - ALL completion paths return `action: 'interview'`
  - `converged`, `target-reached`, `max-questions`, `plateaued`, `early-mastery`, etc.
- `identifyInterviewSkills()` - Identifies frontier skills to probe
  - Skills near theta boundary
  - Recently failed skills
  - Slow correct responses (indicates shaky understanding)

**2. Interview Question Generator (`utils/dynamicInterviewGenerator.js`)**
- `generateInterviewQuestions()` - Creates deep-probing questions
- Question types:
  - **Explanation**: "Why does this work?"
  - **Transfer**: "Apply this to a new context"
  - **Misconception Probe**: "What if we did X instead?"
  - **Justification**: "How do you know you're right?"
  - **Connection**: "How does this relate to...?"
- Uses `reason()` from LLM Gateway for dynamic generation

**3. Screener Route Handler (`routes/screener.js:752-774`)**
```javascript
else if (result.action === 'interview') {
  session.phase = 'interview';
  session.endTime = Date.now();

  const report = generateReport(session.toObject());
  const interviewSkills = identifyInterviewSkills(session.toObject(), []);

  res.json({
    nextAction: 'interview',
    reason: result.reason,
    message: result.message,
    report: { accuracy, questionsAnswered },
    interviewSkills  // Array of skills to probe
  });
}
```

### ❌ What's Missing

**1. Interview Endpoints** - NO routes to:
- `GET /api/screener/interview-questions` - Generate questions for identified skills
- `POST /api/screener/interview-answer` - Submit and analyze interview answers
- `POST /api/screener/interview-complete` - Finalize interview and update user profile

**2. Frontend Interview Handler** - `public/js/adaptiveScreener.js`
- Line 161-163: When `nextAction !== 'continue'`, calls `handleCompletion()`
- `handleCompletion()` BYPASSES interview → goes straight to `/api/screener/complete`
- Line 348: Redirects to `badge-map.html` (skips interview)

**3. Interview UI** - NO interview screen in `public/screener.html`
- Needs interview question display
- Needs text input for explanations
- Needs scoring/analysis display

---

## 🎯 Why Interview Phase Matters

### The Horizontal IRT Problem

**Vertical IRT** (traditional): One dimension of ability
- Theta estimates "how good you are at math overall"
- Problem: Math is multi-dimensional (algebra, geometry, statistics, etc.)

**Horizontal IRT** (Mathmatix approach): Pattern-based mastery
- Skills organized by patterns (Equivalence, Scaling, Change, Structure, etc.)
- Theta should summarize pattern mastery, not drive it
- Need to probe BOUNDARIES between known/unknown patterns

### Interview Phase Purpose

**Surface-level screener can't detect:**
1. **Fragile Knowledge** - Got it right by luck, doesn't understand why
2. **Misconceptions** - Right answer, wrong reasoning
3. **Transfer Failure** - Can solve drill problems but can't apply to new contexts
4. **Pattern Boundaries** - Where does Equivalence end and Transformation begin?

**Interview probes:**
- "You solved x² - 4 = 0 correctly. Can you explain WHY this factoring method works?"
- "Apply this pattern to a totally new context"
- "What if we changed X? What would happen and why?"

**Result:** Confident pattern mastery boundaries, not just a theta score

---

## 🛠️ Implementation Plan

### Phase 1: Backend Endpoints ✅

**`routes/screener.js` - Add 3 new endpoints:**

**1. GET `/api/screener/interview-questions`**
```javascript
// Input: sessionId
// Process:
//   - Get session from DB
//   - Use identifyInterviewSkills() to find frontier skills
//   - Use dynamicInterviewGenerator to create questions
// Output: Array of interview questions with rubrics
```

**2. POST `/api/screener/interview-answer`**
```javascript
// Input: sessionId, questionId, answer (text)
// Process:
//   - Analyze answer using Claude
//   - Score against rubric (0-3 scale)
//   - Detect misconceptions
//   - Update session with analysis
// Output: Feedback + score + next question or "interview complete"
```

**3. POST `/api/screener/interview-complete`**
```javascript
// Input: sessionId
// Process:
//   - Finalize interview analysis
//   - Refine theta based on interview results
//   - Update user profile with pattern mastery
//   - Award badges for demonstrated skills
// Output: Final report + badges + redirect to badge-map
```

### Phase 2: Frontend UI ✅

**`public/screener.html` - Add interview screen:**
```html
<div id="interview-screen" class="screen" style="display: none;">
  <div class="interview-container">
    <h2>Let's Explore Your Understanding</h2>
    <div class="interview-question">
      <p id="interview-question-text"></p>
      <textarea id="interview-answer" rows="4"></textarea>
      <button id="interview-submit-btn">Submit</button>
    </div>
    <div class="interview-feedback" style="display: none;">
      <p id="interview-feedback-text"></p>
      <button id="interview-next-btn">Next Question</button>
    </div>
    <div class="interview-progress">
      <span id="interview-question-count">Question 1 of 3</span>
    </div>
  </div>
</div>
```

**`public/js/adaptiveScreener.js` - Fix flow:**
```javascript
async function handleCompletion(data) {
  if (data.nextAction === 'interview') {
    // Start interview phase
    await startInterview(data);
  } else {
    // Complete (shouldn't happen - all paths go through interview)
    await completeScreener(data);
  }
}

async function startInterview(data) {
  // Fetch interview questions
  const response = await fetch(`/api/screener/interview-questions?sessionId=${state.sessionId}`);
  const interviewData = await response.json();

  state.interviewQuestions = interviewData.questions;
  state.currentInterviewQuestion = 0;

  // Show interview screen
  displayInterviewQuestion(state.interviewQuestions[0]);
  switchScreen('interview');
}

async function submitInterviewAnswer() {
  const answer = elements.interviewAnswer.value;

  const response = await fetch('/api/screener/interview-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      questionId: state.interviewQuestions[state.currentInterviewQuestion].id,
      answer
    })
  });

  const data = await response.json();

  // Show feedback
  displayInterviewFeedback(data);

  // Check if interview complete
  if (data.complete) {
    await completeInterview();
  }
}

async function completeInterview() {
  const response = await fetch('/api/screener/interview-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.sessionId })
  });

  const data = await response.json();

  // Redirect to badge map
  window.location.href = '/badge-map.html';
}
```

### Phase 3: Integration ✅

**Test flow:**
1. Student completes screener (8-30 questions)
2. Backend determines `action: 'interview'`
3. Frontend receives interview action → shows interview screen
4. Backend generates 3-5 deep questions about frontier skills
5. Student answers each question (text explanations)
6. Claude analyzes answers using rubrics
7. Interview completes → refines theta + pattern mastery
8. Redirects to badge-map with finalized results

---

## 📋 Technical Specifications

### Interview Question Structure
```javascript
{
  id: 'interview_q1',
  type: 'explanation',  // or 'transfer', 'misconception-probe', etc.
  skillId: 'quadratic-functions',
  question: "You correctly solved x² - 4 = 0 by factoring. Explain WHY the factoring method works for this equation.",
  baseProblem: "Solve: x² - 4 = 0",
  expectedAnswer: "2 and -2",
  rubric: {
    3: "Fully explains difference of squares and zero product property",
    2: "Mentions factoring but incomplete explanation",
    1: "Vague or circular reasoning",
    0: "No understanding or wrong explanation"
  }
}
```

### Interview Answer Analysis
```javascript
{
  score: 2,  // 0-3 scale
  analysis: "Student understands the factoring step but didn't explain why x² - 4 = (x+2)(x-2)",
  misconceptions: ["Doesn't fully grasp difference of squares pattern"],
  strengths: ["Correctly identified zero product property"],
  nextQuestion: { ... },  // or null if complete
  complete: false
}
```

### Updated User Profile After Interview
```javascript
user.learningProfile = {
  assessmentCompleted: true,
  assessmentDate: new Date(),
  initialPlacement: "Theta: 1.2 (82nd percentile)",
  abilityEstimate: {
    theta: 1.2,
    standardError: 0.25,
    percentile: 82
  },
  // NEW: Pattern mastery from interview
  patternMastery: {
    equivalence: { level: 'mastered', confidence: 0.9 },
    scaling: { level: 'mastered', confidence: 0.85 },
    change: { level: 'learning', confidence: 0.6 },  // Frontier detected
    structure: { level: 'learning', confidence: 0.55 }
  }
};
```

---

## 🚀 Expected Impact

**Before (current):**
- Screener → Badge Map
- Theta estimate only
- No understanding of WHY student got answers right/wrong
- Can't detect fragile knowledge

**After (with interview):**
- Screener → Interview → Badge Map
- Theta + Pattern Mastery Boundaries
- Deep understanding of student's reasoning
- Confident identification of:
  - True mastery (can explain AND apply)
  - Fragile knowledge (right answer, wrong/no reasoning)
  - Frontier skills (almost ready to master)
  - Misconceptions (systematic errors in thinking)

**Result:** Horizontal IRT that actually works - pattern-based mastery, not just a vertical ability score.

---

## 📊 Success Metrics

1. **Interview Completion Rate** > 90%
   - Students don't abandon during interview

2. **Pattern Mastery Confidence** > 0.8
   - Clearly identify mastered vs learning patterns

3. **Misconception Detection** > 60%
   - Catch fragile knowledge that screener missed

4. **Badge Accuracy** > 95%
   - Badges match true pattern mastery (not false positives from lucky guesses)
