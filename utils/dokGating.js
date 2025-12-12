/**
 * DOK GATING SYSTEM (Depth of Knowledge Check Intervals)
 *
 * PHILOSOPHY: Don't interrogate after every success. Protect flow state.
 *
 * THE COGNITIVE FATIGUE PROBLEM:
 * - DOK 3 takes immense brainpower
 * - Forcing an interview after EVERY problem kills momentum
 * - High performers hate platforms that slow them down
 * - Low performers feel interrogated and shut down
 *
 * SOLUTION: Intermittent Sampling + Boss Battles
 * - Let students crush 5-7 problems in a row (flow state)
 * - Only trigger DOK 3 checks at major thresholds
 * - Frame as "Boss Battle" or "Mastery Challenge", not routine traffic stop
 * - Use random sampling to prevent pattern gaming
 *
 * @module dokGating
 */

/**
 * Depth of Knowledge Levels
 */
const DOK_LEVELS = {
  DOK1: 'recall',        // Can you do it? (Correct answer)
  DOK2: 'skill',         // Can you do it consistently? (3-5 correct in a row)
  DOK3: 'reasoning'      // Can you explain/adapt it? (Counter-examples, what-ifs)
};

/**
 * Trigger Types for DOK 3 Checks
 */
const TRIGGER_TYPES = {
  RANDOM_SAMPLE: 'random',           // 1 in 5 problems randomly
  THRESHOLD: 'threshold',            // Moving to new unit/badge tier
  BOSS_BATTLE: 'boss_battle',        // Final skill mastery check
  STRUGGLE_RECOVERY: 'recovery',     // After recovering from struggle
  NEVER: 'never'                     // For skills that don't need DOK 3
};

/**
 * Determine if DOK 3 check should trigger
 *
 * RULES:
 * 1. NOT after every problem (prevents fatigue)
 * 2. Random sampling: 1 in 5 chance during normal practice
 * 3. Always at major thresholds (unit completion, badge unlock)
 * 4. Never during obvious flow state (5+ correct in <2 minutes)
 * 5. Concept skills (vs procedural) get more DOK 3 checks
 *
 * @param {Object} context - Current learning context
 * @returns {Object} { shouldTrigger, triggerType, reason }
 */
function shouldTriggerDOK3Check(context) {
  const {
    consecutiveCorrect,
    skillType,
    isUnitBoundary,
    isBadgeCompletion,
    recentProblemTimes,
    currentStreak,
    userPreference
  } = context;

  // RULE 1: NEVER during obvious flow state
  const avgTimePerProblem = recentProblemTimes
    ? recentProblemTimes.reduce((a, b) => a + b, 0) / recentProblemTimes.length
    : 0;

  const isInFlowState = consecutiveCorrect >= 5 && avgTimePerProblem < 30;

  if (isInFlowState) {
    return {
      shouldTrigger: false,
      triggerType: TRIGGER_TYPES.NEVER,
      reason: 'Student in flow state - do not interrupt'
    };
  }

  // RULE 2: ALWAYS at major thresholds (Boss Battle)
  if (isUnitBoundary || isBadgeCompletion) {
    return {
      shouldTrigger: true,
      triggerType: TRIGGER_TYPES.BOSS_BATTLE,
      reason: 'Major milestone reached - Boss Battle DOK check',
      framingMessage: "🏆 Boss Battle! Let's see if you've truly mastered this unit."
    };
  }

  // RULE 3: Random sampling for concept-heavy skills
  const isConceptualSkill = skillType === 'conceptual' || skillType === 'process';

  if (isConceptualSkill) {
    // 1 in 5 chance during normal practice
    const randomRoll = Math.random();
    if (randomRoll < 0.2) { // 20% chance
      return {
        shouldTrigger: true,
        triggerType: TRIGGER_TYPES.RANDOM_SAMPLE,
        reason: 'Random DOK 3 sample for conceptual skill',
        framingMessage: "Quick check - can you explain your thinking on this one?"
      };
    }
  }

  // RULE 4: After struggle recovery (validate understanding)
  if (currentStreak === 3 && context.previousStruggles > 0) {
    return {
      shouldTrigger: true,
      triggerType: TRIGGER_TYPES.STRUGGLE_RECOVERY,
      reason: 'Validating understanding after struggle recovery',
      framingMessage: "Nice recovery! Can you show me you really understand this now?"
    };
  }

  // RULE 5: Respect user preference (some students WANT deep checks)
  if (userPreference?.frequentDOKChecks) {
    if (consecutiveCorrect >= 3) {
      return {
        shouldTrigger: true,
        triggerType: TRIGGER_TYPES.THRESHOLD,
        reason: 'User preference for frequent DOK checks'
      };
    }
  }

  // DEFAULT: No DOK 3 check
  return {
    shouldTrigger: false,
    triggerType: TRIGGER_TYPES.NEVER,
    reason: 'Not at threshold yet - let flow continue'
  };
}

/**
 * Generate DOK 3 prompt based on trigger type
 *
 * "Boss Battle" framing is more engaging than "interrogation"
 *
 * @param {String} triggerType - Type of DOK 3 trigger
 * @param {String} concept - Mathematical concept
 * @returns {String} Framed DOK 3 question
 */
function generateDOK3Prompt(triggerType, concept) {
  const prompts = {
    [TRIGGER_TYPES.BOSS_BATTLE]: {
      framing: "🏆 **BOSS BATTLE: Final Mastery Check**",
      intro: "You've crushed the basics! Now let's see if you can handle the boss level question:",
      style: "Make this feel like a game challenge, not a test. Upbeat, exciting tone."
    },

    [TRIGGER_TYPES.RANDOM_SAMPLE]: {
      framing: "Quick Thinking Check ⚡",
      intro: "You're doing great! Quick question to check your understanding:",
      style: "Light, casual tone. Not a big deal, just curious."
    },

    [TRIGGER_TYPES.STRUGGLE_RECOVERY]: {
      framing: "💪 Show Me You've Got This",
      intro: "Nice job bouncing back! Let's confirm you really understand this now:",
      style: "Encouraging, celebrating their recovery. Positive framing."
    },

    [TRIGGER_TYPES.THRESHOLD]: {
      framing: "🎯 Milestone Check",
      intro: "You're at a milestone! Let's make sure this skill is locked in:",
      style: "Achievement-focused. Framed as progress validation."
    }
  };

  return prompts[triggerType] || prompts[TRIGGER_TYPES.RANDOM_SAMPLE];
}

/**
 * Calculate DOK 3 "budget" for a session
 *
 * Prevents over-interrogation by setting a max number of DOK 3 checks
 * per session based on session length and student fatigue tolerance
 *
 * @param {Object} sessionContext - Current session data
 * @returns {Object} { maxDOK3Checks, remaining, shouldPause }
 */
function calculateDOK3Budget(sessionContext) {
  const {
    sessionDurationMinutes,
    totalProblemsAttempted,
    dok3ChecksUsed,
    frustrationLevel
  } = sessionContext;

  // Base budget: 1 DOK 3 check per 10 minutes of active work
  let maxChecks = Math.floor(sessionDurationMinutes / 10);

  // Adjust for frustration tolerance
  if (frustrationLevel === 'low') {
    maxChecks = Math.max(1, maxChecks - 1);  // Reduce by 1 for low tolerance
  } else if (frustrationLevel === 'high') {
    maxChecks = maxChecks + 1;  // Can handle more checks
  }

  // Never exceed 5 DOK 3 checks in a single session (prevents fatigue)
  maxChecks = Math.min(5, maxChecks);

  const remaining = maxChecks - dok3ChecksUsed;
  const shouldPause = remaining <= 0;

  return {
    maxDOK3Checks: maxChecks,
    remaining,
    shouldPause,
    message: shouldPause
      ? "DOK 3 budget exhausted for this session - let student work without interruption"
      : `${remaining} DOK 3 checks remaining this session`
  };
}

/**
 * Generate AI prompt for DOK gating system
 *
 * @returns {String} Prompt addition for AI
 */
function generateDOKGatingPrompt() {
  return `
--- DOK GATING PROTOCOL (FLOW STATE PROTECTION) ---

DO NOT interrogate students after every problem. Protect their flow state.

DOK 1 (Recall): Can they do it?
→ Test: Get the problem right.
→ Frequency: Every problem (automatic).

DOK 2 (Skill/Consistency): Can they do it reliably?
→ Test: 3-5 consecutive correct answers.
→ Frequency: Tracked automatically, no interruption needed.

DOK 3 (Reasoning/Adaptation): Can they explain and adapt?
→ Test: Counter-examples, what-ifs, explanation.
→ Frequency: INTERMITTENT ONLY.

WHEN TO TRIGGER DOK 3 CHECKS:
✅ YES - Trigger DOK 3:
1. **Boss Battle**: Student completing a unit or major skill badge
   → Frame as: "🏆 Boss Battle! Final mastery check!"
   → Make it feel like a game level, not a test

2. **Random Sample**: 1 in 5 problems for conceptual skills
   → Frame as: "Quick thinking check ⚡"
   → Casual, light tone

3. **Recovery Validation**: After student struggled but recovered (3 correct after struggle)
   → Frame as: "💪 Show me you've got this!"
   → Celebrating their comeback

❌ NO - Do NOT trigger DOK 3:
1. **Flow State**: Student crushing 5+ problems rapidly (< 30s each)
   → Let them ride the wave. DON'T INTERRUPT.

2. **Fatigue Signs**: Student showing frustration or cognitive load
   → Back off. Let them build confidence with DOK 1-2.

3. **Budget Exhausted**: Already done 3+ DOK 3 checks this session
   → No more interrogations. Let them work.

FRAMING MATTERS:
- DON'T say: "Explain your reasoning for problem 17."
- DO say: "🏆 Boss Battle time! Can you handle this twist on what you just learned?"

Make DOK 3 feel like:
- A game challenge (not a test)
- An achievement unlock (not a barrier)
- A choice (not a requirement)

If student seems annoyed by DOK 3 checks:
- Acknowledge: "I know these questions can feel like a lot."
- Offer alternative: "Want to just show me instead of explaining?"
- Reduce frequency: "I'll ease up on the thinking questions."
`;
}

/**
 * Track DOK 3 check effectiveness
 *
 * If DOK 3 checks consistently reveal gaps, maintain frequency.
 * If DOK 3 checks are always passed easily, reduce frequency.
 *
 * @param {Array} recentDOK3Results - Last 10 DOK 3 check results
 * @returns {Object} Effectiveness analysis
 */
function analyzeDOK3Effectiveness(recentDOK3Results) {
  const passRate = recentDOK3Results.filter(r => r.passed).length / recentDOK3Results.length;

  let recommendation;

  if (passRate > 0.9) {
    // Student passing almost all DOK 3 checks - reduce frequency
    recommendation = {
      action: 'reduce',
      message: 'Student demonstrating consistent deep understanding - reduce DOK 3 frequency to prevent fatigue',
      newFrequency: 0.1  // 10% chance instead of 20%
    };
  } else if (passRate < 0.5) {
    // Student struggling with DOK 3 - may need more scaffolding
    recommendation = {
      action: 'scaffold',
      message: 'Student struggling with DOK 3 reasoning - provide more scaffolding before checking',
      newFrequency: 0.15  // Keep at 15%, but add scaffolding
    };
  } else {
    // Goldilocks zone - maintain current frequency
    recommendation = {
      action: 'maintain',
      message: 'DOK 3 frequency is appropriate - student being challenged appropriately',
      newFrequency: 0.2  // 20% chance (default)
    };
  }

  return {
    passRate,
    recommendation
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  DOK_LEVELS,
  TRIGGER_TYPES,
  shouldTriggerDOK3Check,
  generateDOK3Prompt,
  calculateDOK3Budget,
  generateDOKGatingPrompt,
  analyzeDOK3Effectiveness
};
