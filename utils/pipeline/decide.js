/**
 * DECIDE STAGE — The engine chooses the tutoring move
 *
 * This is the "big inversion": the engine decides what to do,
 * and the LLM just speaks. No more hoping the model picks the
 * right pedagogical move from a 3K-token prompt.
 *
 * Consumes: observation (from observe) + diagnosis (from diagnose)
 * Produces: a tutoring action that the generate stage will execute
 *
 * @module pipeline/decide
 */

const {
  PHASES,
  initializeLessonPhase,
  recordAssessment,
  recordUnderstandingSignal,
  evaluatePhaseTransition,
  transitionPhase,
  getPhasePrompt,
  ASSESSMENT_SIGNALS,
} = require('../lessonPhaseManager');

const { MESSAGE_TYPES } = require('./observe');

// ── Tutoring actions the engine can choose ──
const ACTIONS = {
  CONFIRM_CORRECT: 'confirm_correct',
  GUIDE_INCORRECT: 'guide_incorrect',
  HINT: 'hint',
  WORKED_EXAMPLE: 'worked_example',
  PROBING_QUESTION: 'probing_question',
  SWITCH_REPRESENTATION: 'switch_representation',
  REVIEW_PREREQUISITE: 'review_prerequisite',
  RETEACH_MISCONCEPTION: 'reteach_misconception',
  EXIT_RAMP: 'exit_ramp',
  SCAFFOLD_DOWN: 'scaffold_down',
  REDIRECT_TO_MATH: 'redirect_to_math',
  ACKNOWLEDGE_FRUSTRATION: 'acknowledge_frustration',
  CONTINUE_CONVERSATION: 'continue_conversation',
  CHECK_UNDERSTANDING: 'check_understanding',
  PRESENT_PROBLEM: 'present_problem',
  PHASE_INSTRUCTION: 'phase_instruction',
};

/**
 * Choose the tutoring action based on observation, diagnosis, and phase state.
 *
 * Enhanced with evidence accumulator: when evidence is provided, the decision
 * engine uses BKT knowledge state, FSRS memory signals, cognitive load,
 * consistency scoring, and misconception intelligence to make significantly
 * more accurate pedagogical decisions.
 *
 * @param {Object} observation - From observe stage
 * @param {Object} diagnosis - From diagnose stage
 * @param {Object} context
 * @param {Object} context.phaseState - Current lesson phase state (or null for free chat)
 * @param {Object} context.activeSkill - Current skill { skillId, displayName }
 * @param {Object} context.streakHistory - { idkCount, giveUpCount, recentWrongCount }
 * @param {Object} context.evidence - From evidenceAccumulator (optional, enhances decisions)
 * @returns {Object} Decision: { action, phase, phasePrompt, scaffoldLevel, diagnosis, directives }
 */
function decide(observation, diagnosis, context = {}) {
  const decision = decideCore(observation, diagnosis, context);

  // Session mood modifiers run AFTER the core decision.
  // This ensures they apply to ALL branches, including early returns.
  applyMoodModifiers(decision, context.sessionMood);

  // Evidence-based modifiers run LAST — they override mood when data is stronger.
  if (context.evidence) {
    applyEvidenceModifiers(decision, context.evidence);
  }

  return decision;
}

/**
 * Core decision logic — picks the tutoring action.
 * Extracted so mood modifiers can wrap it cleanly.
 */
function decideCore(observation, diagnosis, context) {
  const { phaseState, activeSkill } = context;
  const streaks = observation.streaks;
  const msgType = observation.messageType;

  // ── Build the decision object ──
  const decision = {
    action: null,
    phase: phaseState?.currentPhase || null,
    phasePrompt: null,
    phaseState: phaseState,
    scaffoldLevel: 3, // 1=minimal, 5=heavy (default medium)
    diagnosis,
    observation,
    directives: [], // Additional instructions for the generate stage
  };

  // ── Off-task / frustration — handle immediately ──
  if (msgType === MESSAGE_TYPES.OFF_TASK) {
    decision.action = ACTIONS.REDIRECT_TO_MATH;
    decision.directives.push('Redirect gently to math. Brief, not preachy.');
    return decision;
  }

  if (msgType === MESSAGE_TYPES.FRUSTRATION) {
    decision.action = ACTIONS.ACKNOWLEDGE_FRUSTRATION;
    decision.scaffoldLevel = 5; // Maximum support
    decision.directives.push(
      'Acknowledge the frustration briefly and genuinely.',
      'Then offer a concrete next step (easier problem, different approach, or break).',
      'Do NOT be condescending or use banned phrases.'
    );
    return decision;
  }

  // ── Give-up / IDK streaks — exit ramp logic ──
  if (msgType === MESSAGE_TYPES.GIVE_UP || streaks.giveUpCount >= 1) {
    decision.action = ACTIONS.EXIT_RAMP;
    decision.directives.push(
      'NEVER reveal the answer.',
      'Work through a PARALLEL problem (same skill, different numbers).',
      'Then have them try their original problem.',
      'If still stuck, offer to skip and move on.'
    );
    return decision;
  }

  if (msgType === MESSAGE_TYPES.IDK) {
    // Progressive IDK handling
    if (streaks.idkCount >= 3) {
      decision.action = ACTIONS.EXIT_RAMP;
      decision.directives.push(
        'Student has said IDK 3+ times. Use exit ramp.',
        'Work a parallel problem, then retry. If still stuck, skip.'
      );
    } else if (streaks.idkCount >= 2) {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.scaffoldLevel = 5;
      decision.directives.push(
        'Lower the barrier: rephrase as multiple choice or yes/no.',
        'Change approach entirely from what was tried before.'
      );
    } else {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.scaffoldLevel = 4;
      decision.directives.push('Scaffold with a simpler sub-question.');
    }
    return decision;
  }

  // ── Answer attempts — correctness-driven decisions ──
  if (msgType === MESSAGE_TYPES.ANSWER_ATTEMPT && diagnosis.type !== 'no_answer') {
    if (diagnosis.isCorrect) {
      decision.action = ACTIONS.CONFIRM_CORRECT;
      decision.directives.push(
        'Confirm immediately. Do NOT hedge.',
        'Specific praise about what they did right (not generic).'
      );

      // Update phase state if in structured lesson
      if (phaseState) {
        recordAssessment(phaseState, 'CORRECT_FAST');
        const transition = evaluatePhaseTransition(phaseState);
        if (transition.shouldTransition) {
          transitionPhase(phaseState, transition.nextPhase, transition.rationale);
          decision.phase = phaseState.currentPhase;
          decision.directives.push(`Phase transition: ${transition.rationale}`);
        }
      }
    } else if (diagnosis.isCorrect === false) {
      // Wrong answer — decide between misconception reteach and general guidance
      if (diagnosis.misconception && diagnosis.misconception.fix) {
        decision.action = ACTIONS.RETEACH_MISCONCEPTION;
        decision.directives.push(
          `Misconception detected: ${diagnosis.misconception.name}`,
          `Reteaching strategy: ${diagnosis.misconception.fix}`,
          'Do NOT reveal the answer. Address the root cause.'
        );
      } else if (streaks.recentWrongCount >= 3) {
        decision.action = ACTIONS.WORKED_EXAMPLE;
        decision.scaffoldLevel = 5;
        decision.directives.push(
          'Multiple wrong answers. Show a worked example with a PARALLEL problem.',
          'Then have them try their original problem again.'
        );
      } else {
        decision.action = ACTIONS.GUIDE_INCORRECT;
        decision.directives.push(
          'Guide with a question that exposes WHY the answer is wrong.',
          'Let THEM arrive at the fix. Do not hand them the correction.'
        );
      }

      // Update phase state
      if (phaseState) {
        const signal = diagnosis.misconception?.severity === 'high'
          ? 'INCORRECT_FAR' : 'INCORRECT_CLOSE';
        recordAssessment(phaseState, signal);
        const transition = evaluatePhaseTransition(phaseState);
        if (transition.shouldTransition) {
          transitionPhase(phaseState, transition.nextPhase, transition.rationale);
          decision.phase = phaseState.currentPhase;
          decision.directives.push(`Phase regression: ${transition.rationale}`);
        }
      }
    } else {
      // Unverifiable — let AI handle naturally
      decision.action = ACTIONS.CONTINUE_CONVERSATION;
      decision.directives.push('Could not verify answer. Evaluate naturally.');
    }
    return decision;
  }

  // ── Help requests ──
  if (msgType === MESSAGE_TYPES.HELP_REQUEST) {
    decision.action = ACTIONS.HINT;
    decision.scaffoldLevel = 4;
    decision.directives.push('Provide a hint, not the answer. Ask a guiding sub-question.');

    if (phaseState) {
      recordAssessment(phaseState, 'INCORRECT_CLOSE', 'UNCERTAIN');
    }
    return decision;
  }

  // ── Skip requests ──
  if (msgType === MESSAGE_TYPES.SKIP_REQUEST) {
    if (phaseState) {
      // In structured lesson: don't skip without evidence
      decision.action = ACTIONS.CHECK_UNDERSTANDING;
      decision.directives.push(
        'Student wants to skip. Deploy an evidence-gathering move first.',
        'Do NOT advance without proof of understanding.'
      );
    } else {
      decision.action = ACTIONS.PRESENT_PROBLEM;
      decision.directives.push('Move to the next problem as requested.');
    }
    return decision;
  }

  // ── Check my work ──
  if (msgType === MESSAGE_TYPES.CHECK_MY_WORK) {
    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'Reference uploaded content from conversation history.',
      'Check work one problem at a time. Do NOT just give answers.',
      'Do NOT ask the student to re-share the problem.'
    );
    return decision;
  }

  // ── Affirmative / engagement responses — continue the flow ──
  if (msgType === MESSAGE_TYPES.AFFIRMATIVE || msgType === MESSAGE_TYPES.GREETING) {
    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'Student is engaged and following along. Continue naturally.',
      'Build on the current conversation thread — do NOT repeat or re-ask what was already covered.',
      'If the student just confirmed understanding, move forward to the next step or problem.',
      'Maintain conversational continuity with what was just discussed.'
    );
    return decision;
  }

  // ── Phase-specific decisions (when in structured lesson) ──
  if (phaseState && activeSkill) {
    decision.phasePrompt = getPhasePrompt(phaseState, activeSkill.displayName);
    decision.action = ACTIONS.PHASE_INSTRUCTION;
    decision.directives.push(`Follow ${phaseState.currentPhase} phase instructions.`);
    return decision;
  }

  // ── Default: continue conversation naturally ──
  decision.action = ACTIONS.CONTINUE_CONVERSATION;
  decision.directives.push(
    'Continue the conversation naturally, building on the current topic.',
    'Do NOT repeat information already confirmed or covered.'
  );
  return decision;
}

/**
 * Apply session mood modifiers to a decision.
 * Mood doesn't change the ACTION — it adjusts how the action is executed.
 * Called after the core decision logic, before return.
 */
function applyMoodModifiers(decision, sessionMood) {
  if (!sessionMood) return;

  // ── Flow state: don't interrupt ──
  if (sessionMood.inFlow) {
    // Suppress comprehension checks — student is proving mastery by doing
    if (decision.action === ACTIONS.CHECK_UNDERSTANDING) {
      decision.action = ACTIONS.PRESENT_PROBLEM;
      decision.directives.push(
        'Student is in flow state — skip the comprehension check.',
        'Present the next problem to maintain momentum.'
      );
    }
    // Keep praise brief in flow — don't slow them down
    if (decision.action === ACTIONS.CONFIRM_CORRECT) {
      decision.directives.push('Brief confirmation only — student is in flow. Keep pace up.');
    }
  }

  // ── Fatigue: lighten up ──
  if (sessionMood.fatigueSignal) {
    decision.scaffoldLevel = Math.max(decision.scaffoldLevel, 4);
    decision.directives.push(
      'Student is showing fatigue. Keep response SHORT (1-2 sentences).',
      'If struggling, offer a break or easier warm-up problem.'
    );
  }

  // ── Falling trajectory: more support ──
  if (sessionMood.trajectory === 'falling' && !sessionMood.fatigueSignal) {
    if (decision.scaffoldLevel < 4) {
      decision.scaffoldLevel = 4;
    }
    decision.directives.push(
      'Student energy has been dropping. Slightly more support than usual.'
    );
  }

  // ── Recovered: acknowledge the turnaround ──
  if (sessionMood.trajectory === 'recovered') {
    if (decision.action === ACTIONS.CONFIRM_CORRECT) {
      decision.directives.push(
        'Student was struggling earlier but is now getting it. Acknowledge the turnaround naturally (not patronizingly).'
      );
    }
  }
}

/**
 * Apply evidence-based modifiers to a decision.
 *
 * These are informed by BKT, FSRS, cognitive load, consistency scoring,
 * and misconception intelligence. They provide data-driven overrides
 * to the heuristic-based core decision and mood modifiers.
 *
 * Evidence modifiers are STRONGER than mood modifiers because they're
 * backed by mathematical models, not just pattern matching.
 */
function applyEvidenceModifiers(decision, evidence) {
  if (!evidence || !evidence.composite) return;

  const composite = evidence.composite;

  // ── Cognitive overload override (highest priority) ──
  // If the student is cognitively overloaded, ALWAYS reduce scaffold
  if (evidence.cognitiveLoad?.isOverloaded) {
    decision.scaffoldLevel = 5; // Maximum support
    decision.directives.push(
      'COGNITIVE OVERLOAD DETECTED. Simplify immediately.',
      'Break the problem into smaller steps. One piece at a time.',
      'Keep response very short (1-2 sentences max).'
    );

    // If we were about to present a new problem, switch to review
    if (decision.action === ACTIONS.PRESENT_PROBLEM) {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.directives.push(
        'Do NOT present a new problem while overloaded.',
        'Offer a simpler version or a worked example first.'
      );
    }
  }

  // ── Optimal scaffold level from evidence ──
  // Evidence-based scaffold overrides mood-based scaffold when available
  if (composite.optimalScaffold && !evidence.cognitiveLoad?.isOverloaded) {
    decision.scaffoldLevel = composite.optimalScaffold;
  }

  // ── Recurring misconception intervention ──
  if (evidence.misconceptions?.needsIntervention && diagnosis) {
    decision.directives.push(
      `WARNING: This misconception has occurred ${evidence.misconceptions.recurringCount}+ times.`,
      'Previous teaching approach is NOT working. Try a completely different representation.',
      'Use concrete examples, visual models, or manipulatives instead of symbolic explanation.'
    );

    // If we were going to do standard guide_incorrect, escalate to reteach
    if (decision.action === ACTIONS.GUIDE_INCORRECT) {
      decision.action = ACTIONS.RETEACH_MISCONCEPTION;
      decision.directives.push(
        'ESCALATED: Standard guidance has failed repeatedly. Use reteaching protocol.'
      );
    }
  }

  // ── BKT-informed mastery signals ──
  if (evidence.knowledge?.available) {
    const pL = evidence.knowledge.pLearned;

    // Near mastery — focus on consolidation
    if (pL > 0.90 && pL < 0.95) {
      decision.directives.push(
        'Student is near mastery (P(L)=' + pL.toFixed(2) + '). Focus on consolidation.',
        'Present slightly harder variants to push across the mastery threshold.'
      );
    }

    // Overestimated mastery — student is answering correctly but BKT says not learned
    if (evidence.knowledge.predictedCorrect > 0.7 && pL < 0.4) {
      decision.directives.push(
        'BKT indicates possible guessing (high predicted correct but low P(L)).',
        'Include a transfer problem or ask the student to EXPLAIN their reasoning.'
      );
    }
  }

  // ── Productive struggle recognition ──
  if (evidence.performance?.productiveStruggle) {
    decision.directives.push(
      'PRODUCTIVE STRUGGLE detected. Student struggled and recovered — this is excellent.',
      'Acknowledge the perseverance naturally. Do NOT over-scaffold.'
    );

    // Reduce scaffold if we were going to over-support
    if (decision.scaffoldLevel >= 4 && !evidence.cognitiveLoad?.isOverloaded) {
      decision.scaffoldLevel = 3;
    }
  }

  // ── Break suggestion ──
  if (composite.shouldSuggestBreak && decision.action !== ACTIONS.ACKNOWLEDGE_FRUSTRATION) {
    decision.directives.push(
      'Session fatigue detected. Gently offer a break or suggest switching to an easier topic.',
      'If student continues, keep problems easy and responses very short.'
    );
  }

  // ── Teachable moment ──
  if (composite.teachableMoment && decision.action === ACTIONS.CONFIRM_CORRECT) {
    decision.directives.push(
      'TEACHABLE MOMENT: Student is showing metacognition.',
      'Deepen understanding: ask "Why does this work?" or "What would happen if...?"',
      'Keep it brief — build on their insight, don\'t lecture.'
    );
  }

  // ── Add evidence reasoning to directives ──
  if (composite.reasoning.length > 0) {
    decision.directives.push(
      `[Evidence: ${composite.reasoning.join('; ')}]`
    );
  }
}

/**
 * Initialize or retrieve lesson phase state for a session.
 * Call this at the start of a mastery/lesson session.
 */
function initPhase(skillId, warmupData = { skillName: 'prerequisite', concepts: ['basics'] }) {
  return initializeLessonPhase(skillId, warmupData);
}

module.exports = {
  decide,
  initPhase,
  ACTIONS,
};
