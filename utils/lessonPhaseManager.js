/**
 * LESSON PHASE MANAGER
 *
 * Manages internal instructional phases (I Do / We Do / You Do)
 * Tracks formative assessment and determines adaptive phase transitions
 *
 * IMPORTANT: These phases are INTERNAL ONLY - not shown to students
 * Students experience seamless, natural teaching conversation
 */

/**
 * Lesson phases following gradual release model
 */
const PHASES = {
  INTRO: 'intro',             // Student choice: lesson vs. direct test
  WARMUP: 'warmup',           // Prerequisite skill review
  I_DO: 'i-do',               // Teacher models with think-aloud
  WE_DO: 'we-do',             // Guided practice with scaffolding
  CHECK_IN: 'check-in',       // Emotional confidence assessment
  YOU_DO: 'you-do',           // Independent practice
  MASTERY_CHECK: 'mastery'    // Final assessment for badge eligibility
};

/**
 * Assessment signals from student responses
 */
const ASSESSMENT_SIGNALS = {
  // Accuracy signals
  CORRECT_FAST: { points: 3, confidence: 0.9 },
  CORRECT_SLOW: { points: 2, confidence: 0.7 },
  INCORRECT_CLOSE: { points: 1, confidence: 0.5 },
  INCORRECT_FAR: { points: 0, confidence: 0.2 },

  // Verbal confidence signals
  CONFIDENT: { multiplier: 1.2 },
  UNCERTAIN: { multiplier: 0.8 },
  CONFUSED: { multiplier: 0.5 }
};

/**
 * Initialize lesson phase state
 * @param {String} skillId - Target skill being taught
 * @param {Object} warmupData - Warmup skill and concepts
 * @returns {Object} Initial phase state
 */
function initializeLessonPhase(skillId, warmupData) {
  return {
    skillId,
    currentPhase: PHASES.INTRO,  // Start with student choice
    warmupData,
    phaseHistory: [],
    assessmentData: {
      intro: { attempts: 0, correct: 0, signals: [] },
      warmup: { attempts: 0, correct: 0, signals: [] },
      'i-do': { attempts: 0, correct: 0, signals: [] },
      'we-do': { attempts: 0, correct: 0, signals: [] },
      'you-do': { attempts: 0, correct: 0, signals: [] }
    },
    transitionLog: [],
    startTime: new Date(),
    readyForMastery: false,
    studentChoice: null  // 'lesson' or 'test'
  };
}

/**
 * Record formative assessment signal
 * @param {Object} phaseState - Current lesson phase state
 * @param {String} responseType - Type of response (correct_fast, incorrect_close, etc.)
 * @param {String} verbalSignal - Confidence expressed verbally (confident, uncertain, confused)
 * @returns {Object} Updated assessment data
 */
function recordAssessment(phaseState, responseType, verbalSignal = null) {
  const phase = phaseState.currentPhase;
  const assessment = phaseState.assessmentData[phase];

  if (!assessment) {
    console.warn(`No assessment tracking for phase: ${phase}`);
    return phaseState;
  }

  // Record the signal
  const signal = ASSESSMENT_SIGNALS[responseType.toUpperCase()] || ASSESSMENT_SIGNALS.INCORRECT_FAR;
  assessment.attempts++;

  if (signal.points >= 2) {
    assessment.correct++;
  }

  assessment.signals.push({
    responseType,
    verbalSignal,
    points: signal.points,
    confidence: signal.confidence,
    timestamp: new Date()
  });

  // Apply verbal confidence multiplier
  if (verbalSignal && ASSESSMENT_SIGNALS[verbalSignal.toUpperCase()]) {
    const lastSignal = assessment.signals[assessment.signals.length - 1];
    lastSignal.confidence *= ASSESSMENT_SIGNALS[verbalSignal.toUpperCase()].multiplier;
  }

  return phaseState;
}

/**
 * Calculate current confidence level for a phase
 * @param {Object} assessment - Assessment data for phase
 * @returns {Number} Confidence score 0-1
 */
function calculateConfidence(assessment) {
  if (assessment.attempts === 0) return 0;

  const recentSignals = assessment.signals.slice(-3); // Last 3 attempts
  const avgConfidence = recentSignals.reduce((sum, s) => sum + s.confidence, 0) / recentSignals.length;

  return avgConfidence;
}

/**
 * Determine if ready to transition to next phase
 * Uses adaptive logic based on formative assessment
 *
 * @param {Object} phaseState - Current lesson phase state
 * @returns {Object} Transition decision { shouldTransition, nextPhase, rationale }
 */
function evaluatePhaseTransition(phaseState) {
  const currentPhase = phaseState.currentPhase;
  const assessment = phaseState.assessmentData[currentPhase];

  // Minimum attempts before considering transition
  const MIN_ATTEMPTS = {
    intro: 1,       // Just needs student's choice
    warmup: 2,
    'i-do': 1,      // Just needs to observe modeling
    'we-do': 3,     // Practice with guidance
    'you-do': 5     // Independent mastery
  };

  const minAttempts = MIN_ATTEMPTS[currentPhase] || 2;

  // Not enough data yet
  if (assessment.attempts < minAttempts) {
    return {
      shouldTransition: false,
      nextPhase: currentPhase,
      rationale: `Need more data (${assessment.attempts}/${minAttempts} attempts)`
    };
  }

  const confidence = calculateConfidence(assessment);
  const accuracy = assessment.correct / assessment.attempts;

  // Phase-specific transition logic
  switch (currentPhase) {
    case PHASES.INTRO:
      // Student made their choice - transition based on studentChoice
      if (phaseState.studentChoice === 'test') {
        return {
          shouldTransition: true,
          nextPhase: PHASES.MASTERY_CHECK,
          rationale: 'Student chose to skip lesson and go straight to mastery test'
        };
      } else {
        // Default to lesson path (studentChoice === 'lesson' or null)
        return {
          shouldTransition: true,
          nextPhase: PHASES.WARMUP,
          rationale: 'Student chose structured lesson - starting with warmup'
        };
      }

    case PHASES.WARMUP:
      // If warmup is strong, skip I Do and go straight to We Do
      if (confidence >= 0.8 && accuracy >= 0.75) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.WE_DO,
          rationale: 'Strong warmup performance - ready for guided practice'
        };
      }
      // If warmup is weak, need more modeling
      if (confidence < 0.5 || accuracy < 0.5) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.I_DO,
          rationale: 'Warmup shows gaps - need teacher modeling first'
        };
      }
      // Moderate warmup - start with I Do
      return {
        shouldTransition: true,
        nextPhase: PHASES.I_DO,
        rationale: 'Moving to teacher modeling after warmup'
      };

    case PHASES.I_DO:
      // I Do is about observation, always transition to We Do
      return {
        shouldTransition: true,
        nextPhase: PHASES.WE_DO,
        rationale: 'Modeling complete - ready for guided practice'
      };

    case PHASES.WE_DO:
      // Strong performance - ready for independence
      if (confidence >= 0.7 && accuracy >= 0.7) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.CHECK_IN,
          rationale: 'Strong guided practice - checking student confidence'
        };
      }
      // Struggling - go back to I Do for more modeling
      if (confidence < 0.4 || accuracy < 0.4) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.I_DO,
          rationale: 'Student struggling - need more modeling'
        };
      }
      // Still building - stay in We Do
      return {
        shouldTransition: false,
        nextPhase: PHASES.WE_DO,
        rationale: 'Continue guided practice to build confidence'
      };

    case PHASES.CHECK_IN:
      // Always transition to You Do after check-in
      return {
        shouldTransition: true,
        nextPhase: PHASES.YOU_DO,
        rationale: 'Emotional check-in complete - moving to independent practice'
      };

    case PHASES.YOU_DO:
      // Ready for mastery assessment
      if (confidence >= 0.75 && accuracy >= 0.75 && assessment.attempts >= 5) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.MASTERY_CHECK,
          rationale: 'Consistent independent success - ready for mastery check'
        };
      }
      // Need more practice - go back to We Do
      if (confidence < 0.5 || accuracy < 0.5) {
        return {
          shouldTransition: true,
          nextPhase: PHASES.WE_DO,
          rationale: 'Independent practice shows gaps - return to guided practice'
        };
      }
      // Keep practicing
      return {
        shouldTransition: false,
        nextPhase: PHASES.YOU_DO,
        rationale: 'Continue independent practice to solidify mastery'
      };

    case PHASES.MASTERY_CHECK:
      // Mastery achieved
      if (confidence >= 0.8 && accuracy >= 0.8) {
        phaseState.readyForMastery = true;
        return {
          shouldTransition: false,
          nextPhase: PHASES.MASTERY_CHECK,
          rationale: 'Mastery demonstrated - ready for badge earning'
        };
      }
      // Not quite there - more You Do practice
      return {
        shouldTransition: true,
        nextPhase: PHASES.YOU_DO,
        rationale: 'Need more practice before mastery achieved'
      };

    default:
      return {
        shouldTransition: false,
        nextPhase: currentPhase,
        rationale: 'Unknown phase'
      };
  }
}

/**
 * Execute phase transition
 * @param {Object} phaseState - Current phase state
 * @param {String} newPhase - Phase to transition to
 * @param {String} rationale - Reason for transition
 * @returns {Object} Updated phase state
 */
function transitionPhase(phaseState, newPhase, rationale) {
  phaseState.phaseHistory.push({
    phase: phaseState.currentPhase,
    duration: Date.now() - phaseState.startTime,
    assessment: { ...phaseState.assessmentData[phaseState.currentPhase] }
  });

  phaseState.transitionLog.push({
    from: phaseState.currentPhase,
    to: newPhase,
    rationale,
    timestamp: new Date()
  });

  phaseState.currentPhase = newPhase;
  phaseState.startTime = new Date();

  console.log(`📚 Phase Transition: ${newPhase} - ${rationale}`);

  return phaseState;
}

/**
 * Get AI system prompt for current phase
 * Provides phase-specific instructions (internal, not student-facing)
 *
 * @param {Object} phaseState - Current lesson phase state
 * @param {String} skillName - Human-readable skill name
 * @returns {String} System prompt for AI
 */
function getPhasePrompt(phaseState, skillName) {
  const phase = phaseState.currentPhase;
  const warmup = phaseState.warmupData;

  const baseInstructions = `
**IMPORTANT: These phase instructions are INTERNAL ONLY. The student does NOT see phase labels.**
**Your conversation should be natural and seamless, but internally you're following this structure.**
`;

  switch (phase) {
    case PHASES.INTRO:
      return baseInstructions + `
## Internal Phase: INTRO (Student Choice)

**Your Task:**
1. Welcome the student to practice on: **${skillName}**
2. Briefly explain what this skill involves (1 sentence with a concrete example)
3. Give them TWO clear options:
   - **Option 1**: "Teach me step-by-step" (full structured lesson)
   - **Option 2**: "I'm ready - test me now!" (skip to mastery gate)
4. Wait for their choice before proceeding

**Example Opening:**
"You're working on **${skillName}** - that means solving problems like [give specific example from this skill].

How would you like to approach this?

1️⃣ **Teach me step-by-step** - I'll guide you through warmup, examples, and practice
2️⃣ **I'm ready - test me now!** - Skip straight to the mastery test

Which works better for you?"

**Listen For:**
- "Teach me" / "Step by step" / "1" / "I need help" / "Show me how" → Route to WARMUP (full lesson)
- "Test me" / "I know this" / "2" / "I'm ready" / "Skip" → Route to MASTERY_CHECK (direct assessment)
- Uncertain responses → Recommend Option 1 (safer choice for learning)

**CRITICAL**:
- Detect their choice from natural language (don't require exact phrasing)
- Mark phaseState.studentChoice = 'lesson' or 'test'
- Be specific about what this skill covers (not generic)
`;

    case PHASES.WARMUP:
      return baseInstructions + `
## Internal Phase: WARMUP (Prerequisite Review)

**Your Task:**
1. Start with a confidence-building review of: ${warmup.skillName}
2. Ask a warmup question from: ${warmup.concepts.join(' OR ')}
3. Keep it brief and positive - this builds confidence for the main lesson
4. Connect this prerequisite to the upcoming skill: ${skillName}

**Example Opening:**
"Before we dive into ${skillName}, let's warm up with something you already know! [Ask warmup question]"

**What You're Assessing:**
- Does student have solid foundation in prerequisites?
- Do they show confidence or uncertainty?
- Should you spend more time modeling or can you move quickly to guided practice?
`;

    case PHASES.I_DO:
      return baseInstructions + `
## Internal Phase: I DO (Teacher Modeling)

**Your Task:**
1. Introduce ${skillName} naturally
2. Walk through an example step-by-step
3. **Think aloud** - explain your reasoning at each step
4. Model expert problem-solving strategies
5. Ask occasional check-for-understanding questions (but YOU do the work)

**Example:**
"Let me show you how I approach this. When I see [problem], the first thing I think is... [explain thinking]. Watch as I [demonstrate step]. I'm doing this because..."

**Metacognitive Modeling:**
- "I notice that..."
- "This reminds me of..."
- "I'm going to try..."
- "Let me check if that makes sense..."

**What You're Assessing:**
- Are they following along?
- Do their responses show understanding?
- Can you move to guided practice?
`;

    case PHASES.WE_DO:
      return baseInstructions + `
## Internal Phase: WE DO (Guided Practice)

**Your Task:**
1. Present a problem and guide the student through it
2. **YOU lead, but ASK for their input at each step**
3. Provide scaffolding: "What should we do first?" "How do we..."
4. Celebrate correct thinking, gently guide if incorrect
5. Gradually reduce support as they show competence

**Example:**
"Let's try this one together. [Present problem]. What do you think our first step should be? ... Great! Now, what operation should we use next?"

**Scaffolding Techniques:**
- Prompting: "What do we do when we see..."
- Cueing: "Remember how we..."
- Partial completion: "We get 3x + 5 = 14, so next we..."

**What You're Assessing:**
- Can they contribute meaningful steps?
- Are they relying on you or showing independence?
- Do they need more modeling or ready for solo practice?
`;

    case PHASES.CHECK_IN:
      return baseInstructions + `
## Internal Phase: CHECK-IN (Emotional/Confidence Assessment)

**Your Task:**
1. Pause and ask: "How are you feeling about this so far?"
2. Normalize struggle: "It's okay if this feels challenging"
3. Assess emotional readiness for independent work
4. Build confidence before You Do phase

**Example:**
"You've been doing great with the guided practice! Before you try some on your own, how are you feeling about ${skillName}? Confident? A little nervous? Somewhere in between?"

**Listen For:**
- "I think I get it" → Ready for You Do
- "I'm still confused about..." → May need more We Do
- "Can you show me one more time?" → Return to I Do

**What You're Assessing:**
- Self-reported confidence
- Emotional readiness
- Need for additional support
`;

    case PHASES.YOU_DO:
      return baseInstructions + `
## Internal Phase: YOU DO (Independent Practice)

**Your Task:**
1. Present problems for student to solve independently
2. **Step back** - let them struggle productively
3. Provide feedback: specific praise for correct work, hints for errors
4. Encourage self-monitoring: "How can you check your answer?"
5. Build towards mastery

**Example:**
"You're ready to try some on your own! Here's your first problem: [problem]. Take your time and show me your thinking."

**When They Respond:**
- ✓ Correct: "Excellent! You [specific praise]. Ready for another?"
- ✗ Incorrect: "Not quite. What if you tried... [gentle hint]"
- Stuck: "What's the first step we always take?"

**CRITICAL - Problem Tracking:**
After evaluating each student answer, include this marker:
<ANSWER_RESULT correct="true" problem="1"/>  (if correct)
<ANSWER_RESULT correct="false" problem="1"/>  (if incorrect)

This marker MUST be on its own line and will be parsed by the system to track progress.
Do NOT show this marker to the student - it's for system tracking only.

**What You're Assessing:**
- Consistent accuracy (75%+)
- Speed and confidence
- Ready for mastery check or need more practice?
`;

    case PHASES.MASTERY_CHECK:
      return baseInstructions + `
## Internal Phase: MASTERY CHECK (Final Assessment)

**Your Task:**
1. Present 3-5 problems at skill level
2. Assess if student has achieved mastery (80%+ accuracy, confident execution)
3. If mastery achieved: End with **<END_LESSON_DIALOGUE />**
4. If not quite there: Return to You Do for more practice

**Example:**
"You've been doing really well! Let's make sure you've got this down. I'm going to give you a few problems to demonstrate your mastery of ${skillName}."

**Mastery Criteria:**
- 80%+ accuracy
- Consistent correct responses
- Confident, quick execution
- Can explain their reasoning

**CRITICAL - Problem Tracking:**
After evaluating each student answer, include this marker:
<ANSWER_RESULT correct="true" problem="1"/>  (if correct)
<ANSWER_RESULT correct="false" problem="1"/>  (if incorrect)

This marker MUST be on its own line and will be parsed by the system to track progress.
Do NOT show this marker to the student - it's for system tracking only.

**What You're Deciding:**
- Has student mastered this skill?
- Ready to earn badge or need more practice?
`;

    default:
      return baseInstructions + `Continue the lesson on ${skillName} naturally.`;
  }
}

module.exports = {
  PHASES,
  ASSESSMENT_SIGNALS,
  initializeLessonPhase,
  recordAssessment,
  calculateConfidence,
  evaluatePhaseTransition,
  transitionPhase,
  getPhasePrompt
};
