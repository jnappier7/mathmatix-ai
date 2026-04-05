/**
 * PHASE EVIDENCE EVALUATOR — Data-driven instruction phase advancement
 *
 * A human tutor doesn't advance from "I Do" to "We Do" because the student
 * got one answer right. They advance because they see a PATTERN of evidence:
 * - Student can explain the concept back (not just mimic)
 * - Student catches errors in examples (showing real understanding)
 * - Student asks good questions (engaged, not lost)
 * - Student's confidence is genuine (not just saying "I get it")
 *
 * This module evaluates accumulated evidence across a phase to determine
 * when the student is genuinely ready to advance — and when they need
 * to regress. It also handles real-time familiarity re-assessment:
 * if a student was classified as "never-seen" but demonstrates prior
 * knowledge, we upgrade immediately.
 *
 * @module utils/phaseEvidenceEvaluator
 */

const { INSTRUCTIONAL_MODES } = require('./pipeline/decide');

// ── Evidence thresholds per phase ──
// Each phase requires different types and amounts of evidence to advance.
const PHASE_ADVANCEMENT_CRITERIA = {
  'vocabulary': {
    // Student can use terms correctly in context
    minTurns: 2,
    minCorrect: 0, // Vocab phase doesn't have "correct answers" per se
    signals: ['used_term_correctly', 'asked_clarifying_question', 'acknowledged_understanding'],
    requiredSignals: 1,
    // Advance faster if student already knows the terms
    fastTrack: { condition: 'demonstrated_prior_vocab', advanceTo: 'concept-intro' },
  },
  'concept-intro': {
    // Student grasps the big idea
    minTurns: 2,
    minCorrect: 0,
    signals: ['explained_concept_back', 'connected_to_prior', 'asked_about_application', 'acknowledged_understanding'],
    requiredSignals: 1,
    fastTrack: { condition: 'demonstrated_deep_understanding', advanceTo: 'we-do' },
  },
  'i-do': {
    // Student followed the model and is ready to try together
    minTurns: 2,
    minCorrect: 0,
    signals: ['followed_along', 'asked_about_step', 'predicted_next_step', 'acknowledged_understanding'],
    requiredSignals: 1,
    fastTrack: { condition: 'predicted_steps_correctly', advanceTo: 'you-do' },
  },
  'we-do': {
    // Student can do it with decreasing support
    minTurns: 3,
    minCorrect: 2,
    signals: ['correct_with_scaffold', 'correct_without_scaffold', 'explained_reasoning', 'caught_own_error'],
    requiredSignals: 2,
    fastTrack: { condition: 'multiple_correct_no_scaffold', advanceTo: 'you-do' },
  },
  'you-do': {
    // Student can do it independently and transfer
    minTurns: 3,
    minCorrect: 2,
    signals: ['correct_independently', 'correct_novel_context', 'explained_why', 'taught_back'],
    requiredSignals: 2,
    fastTrack: { condition: 'three_consecutive_correct', advanceTo: 'mastery-check' },
  },
  'mastery-check': {
    // Student demonstrates real mastery
    minTurns: 1,
    minCorrect: 1,
    signals: ['correct_transfer', 'correct_teach_back', 'correct_application'],
    requiredSignals: 1,
    fastTrack: null, // No fast track — mastery is mastery
  },
};

// ── Evidence signals extracted from pipeline data ──
const EVIDENCE_SIGNALS = {
  // From diagnosis
  CORRECT_ANSWER: 'correct_answer',
  INCORRECT_ANSWER: 'incorrect_answer',
  DEMONSTRATED_REASONING: 'demonstrated_reasoning',
  MISCONCEPTION: 'misconception',

  // From observation
  ASKED_QUESTION: 'asked_question',
  EXPRESSED_CONFIDENCE: 'expressed_confidence',
  EXPRESSED_CONFUSION: 'expressed_confusion',
  USED_VOCABULARY: 'used_vocabulary',
  PREDICTED_STEP: 'predicted_step',

  // Composite
  INDEPENDENT_CORRECT: 'correct_independently',       // Correct without hints
  SCAFFOLDED_CORRECT: 'correct_with_scaffold',         // Correct with help
  CONSECUTIVE_CORRECT: 'consecutive_correct',           // 2+ in a row
  TRANSFER_CORRECT: 'correct_novel_context',            // Correct in new context
  SELF_CORRECTION: 'caught_own_error',                  // Student caught their own mistake
  TEACH_BACK: 'taught_back',                            // Student explained it to tutor
};

/**
 * Evaluate whether the student should advance, stay, or regress in phase.
 *
 * @param {Object} currentPhase - { phase, turnsInPhase, evidenceLog[] }
 * @param {Object} newEvidence - Evidence from the current turn
 * @param {Object} context - { tutorPlan, sessionMood, evidence (from evidenceAccumulator) }
 * @returns {Object} { shouldAdvance, shouldRegress, nextPhase, confidence, reasoning }
 */
function evaluatePhaseAdvancement(currentPhase, newEvidence, context = {}) {
  const { phase, turnsInPhase = 0, evidenceLog = [] } = currentPhase;
  const criteria = PHASE_ADVANCEMENT_CRITERIA[phase];

  if (!criteria) {
    return { shouldAdvance: false, shouldRegress: false, nextPhase: null, confidence: 0, reasoning: 'Unknown phase' };
  }

  // Add new evidence to the running log
  const fullLog = [...evidenceLog, ...extractSignals(newEvidence, context)];

  // ── Check for fast-track (student already knows this) ──
  if (criteria.fastTrack) {
    const fastTrackResult = checkFastTrack(criteria.fastTrack, fullLog, newEvidence, context);
    if (fastTrackResult.triggered) {
      return {
        shouldAdvance: true,
        shouldRegress: false,
        nextPhase: fastTrackResult.advanceTo,
        confidence: fastTrackResult.confidence,
        reasoning: `Fast-track: ${fastTrackResult.reason}`,
        skipPhases: true,
      };
    }
  }

  // ── Check for regression (student is lost) ──
  const regressionResult = checkRegression(phase, fullLog, newEvidence, context);
  if (regressionResult.shouldRegress) {
    return {
      shouldAdvance: false,
      shouldRegress: true,
      nextPhase: regressionResult.regressTo,
      confidence: regressionResult.confidence,
      reasoning: `Regression: ${regressionResult.reason}`,
    };
  }

  // ── Check standard advancement criteria ──
  const turns = turnsInPhase + 1;
  if (turns < criteria.minTurns) {
    return {
      shouldAdvance: false,
      shouldRegress: false,
      nextPhase: null,
      confidence: 0,
      reasoning: `Need ${criteria.minTurns - turns} more turn(s) in ${phase}`,
    };
  }

  // Count correct answers in this phase
  const correctCount = fullLog.filter(s =>
    s === EVIDENCE_SIGNALS.CORRECT_ANSWER ||
    s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT ||
    s === EVIDENCE_SIGNALS.SCAFFOLDED_CORRECT
  ).length;

  if (correctCount < criteria.minCorrect) {
    return {
      shouldAdvance: false,
      shouldRegress: false,
      nextPhase: null,
      confidence: 0,
      reasoning: `Need ${criteria.minCorrect - correctCount} more correct answer(s) in ${phase}`,
    };
  }

  // Count required signal types present
  const signalTypesPresent = new Set(fullLog.filter(s => criteria.signals.includes(s)));
  if (signalTypesPresent.size < criteria.requiredSignals) {
    return {
      shouldAdvance: false,
      shouldRegress: false,
      nextPhase: null,
      confidence: 0.3,
      reasoning: `Need more evidence types: have ${signalTypesPresent.size}/${criteria.requiredSignals} signal types`,
    };
  }

  // ── All criteria met — advance ──
  const nextPhase = getNextPhase(phase);
  const confidence = Math.min(1, 0.5 + (signalTypesPresent.size / criteria.signals.length) * 0.5);

  return {
    shouldAdvance: true,
    shouldRegress: false,
    nextPhase,
    confidence,
    reasoning: `Phase criteria met: ${turns} turns, ${correctCount} correct, ${signalTypesPresent.size} signal types`,
    evidenceLog: fullLog,
  };
}

/**
 * Extract evidence signals from pipeline data for this turn.
 */
function extractSignals(newEvidence, context) {
  const signals = [];
  const { diagnosis, observation, decision, sessionMood } = newEvidence;

  // From diagnosis
  if (diagnosis) {
    if (diagnosis.isCorrect === true) {
      signals.push(EVIDENCE_SIGNALS.CORRECT_ANSWER);
      if (diagnosis.demonstratedReasoning) {
        signals.push(EVIDENCE_SIGNALS.DEMONSTRATED_REASONING);
        signals.push(EVIDENCE_SIGNALS.INDEPENDENT_CORRECT);
      }
      if (diagnosis.hasExplanation) {
        signals.push(EVIDENCE_SIGNALS.DEMONSTRATED_REASONING);
      }
    } else if (diagnosis.isCorrect === false) {
      signals.push(EVIDENCE_SIGNALS.INCORRECT_ANSWER);
      if (diagnosis.misconception) {
        signals.push(EVIDENCE_SIGNALS.MISCONCEPTION);
      }
    }
  }

  // From observation
  if (observation) {
    if (observation.messageType === 'question') {
      signals.push(EVIDENCE_SIGNALS.ASKED_QUESTION);
    }
    // Check for vocabulary use in the message
    if (observation.contextSignals?.some(s => s.type === 'math_term_used')) {
      signals.push(EVIDENCE_SIGNALS.USED_VOCABULARY);
    }
  }

  // From decision context — was scaffolding used?
  if (decision) {
    if (diagnosis?.isCorrect === true) {
      if (decision.scaffoldLevel <= 2) {
        signals.push(EVIDENCE_SIGNALS.INDEPENDENT_CORRECT);
      } else {
        signals.push(EVIDENCE_SIGNALS.SCAFFOLDED_CORRECT);
      }
    }
  }

  // Self-correction detection (student said "wait, I made a mistake")
  if (observation?.contextSignals?.some(s => s.type === 'self_correction')) {
    signals.push(EVIDENCE_SIGNALS.SELF_CORRECTION);
  }

  return signals;
}

/**
 * Check if fast-track conditions are met.
 */
function checkFastTrack(fastTrack, evidenceLog, newEvidence, context) {
  const { condition, advanceTo } = fastTrack;

  switch (condition) {
    case 'demonstrated_prior_vocab':
      // Student used correct terms without being taught them
      if (evidenceLog.filter(s => s === EVIDENCE_SIGNALS.USED_VOCABULARY).length >= 2) {
        return { triggered: true, advanceTo, confidence: 0.8, reason: 'Student already knows the vocabulary' };
      }
      break;

    case 'demonstrated_deep_understanding':
      // Student explained the concept or asked application questions
      if (evidenceLog.includes(EVIDENCE_SIGNALS.DEMONSTRATED_REASONING) &&
          evidenceLog.includes(EVIDENCE_SIGNALS.ASKED_QUESTION)) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: 'Student shows deep understanding of concept' };
      }
      break;

    case 'predicted_steps_correctly':
      // Student predicted what comes next in worked examples
      if (evidenceLog.filter(s => s === EVIDENCE_SIGNALS.PREDICTED_STEP).length >= 2) {
        return { triggered: true, advanceTo, confidence: 0.8, reason: 'Student predicted model steps — ready for practice' };
      }
      // Also fast-track if they just solved it correctly during I-Do
      if (evidenceLog.includes(EVIDENCE_SIGNALS.INDEPENDENT_CORRECT)) {
        return { triggered: true, advanceTo, confidence: 0.9, reason: 'Student solved it independently during modeling' };
      }
      break;

    case 'multiple_correct_no_scaffold':
      // Student got 2+ correct without help during We Do
      if (evidenceLog.filter(s => s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT).length >= 2) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: 'Student solving independently — ready for You Do' };
      }
      break;

    case 'three_consecutive_correct':
      // 3 consecutive correct in You Do
      const last3 = evidenceLog.slice(-3);
      if (last3.length >= 3 && last3.every(s =>
        s === EVIDENCE_SIGNALS.CORRECT_ANSWER ||
        s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT
      )) {
        return { triggered: true, advanceTo, confidence: 0.9, reason: 'Three consecutive correct — ready for mastery check' };
      }
      break;
  }

  return { triggered: false };
}

/**
 * Check if the student needs to regress to an earlier phase.
 */
function checkRegression(currentPhase, evidenceLog, newEvidence, context) {
  const recentSignals = evidenceLog.slice(-5);

  // Count recent incorrect answers
  const recentWrong = recentSignals.filter(s =>
    s === EVIDENCE_SIGNALS.INCORRECT_ANSWER || s === EVIDENCE_SIGNALS.MISCONCEPTION
  ).length;

  // Count recent correct answers
  const recentCorrect = recentSignals.filter(s =>
    s === EVIDENCE_SIGNALS.CORRECT_ANSWER ||
    s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT ||
    s === EVIDENCE_SIGNALS.SCAFFOLDED_CORRECT
  ).length;

  // Phase-specific regression rules
  switch (currentPhase) {
    case 'you-do':
      // If student is struggling in independent practice, drop to guided
      if (recentWrong >= 3 && recentCorrect <= 1) {
        return {
          shouldRegress: true,
          regressTo: 'we-do',
          confidence: 0.8,
          reason: `${recentWrong} wrong in independent practice — need more guided work`,
        };
      }
      break;

    case 'we-do':
      // If student is lost even with scaffolding, go back to modeling
      if (recentWrong >= 3 && recentCorrect === 0) {
        return {
          shouldRegress: true,
          regressTo: 'i-do',
          confidence: 0.75,
          reason: 'Struggling even with scaffolding — need to re-model',
        };
      }
      break;

    case 'mastery-check':
      // Failed mastery check — back to practice
      if (recentWrong >= 1 && recentCorrect === 0) {
        return {
          shouldRegress: true,
          regressTo: 'we-do',
          confidence: 0.7,
          reason: 'Failed mastery check — more practice needed',
        };
      }
      break;
  }

  // General: cognitive overload signal from evidence accumulator
  if (context.evidence?.cognitiveLoad?.isOverloaded) {
    const regressMap = {
      'you-do': 'we-do',
      'we-do': 'i-do',
      'mastery-check': 'we-do',
    };
    if (regressMap[currentPhase]) {
      return {
        shouldRegress: true,
        regressTo: regressMap[currentPhase],
        confidence: 0.85,
        reason: 'Cognitive overload detected — reducing complexity',
      };
    }
  }

  return { shouldRegress: false };
}

/**
 * Get the next phase in the instructional sequence.
 */
function getNextPhase(currentPhase) {
  const sequence = ['prerequisite-review', 'vocabulary', 'concept-intro', 'i-do', 'we-do', 'you-do', 'mastery-check'];
  const idx = sequence.indexOf(currentPhase);
  if (idx >= 0 && idx < sequence.length - 1) return sequence[idx + 1];
  return null; // Already at mastery-check or unknown
}

/**
 * Re-assess familiarity in real-time based on student behavior.
 *
 * If a student was classified as "never-seen" but demonstrates prior knowledge,
 * upgrade immediately. If classified as "proficient" but can't answer basics,
 * downgrade. This prevents wasting time teaching what's already known
 * or assuming mastery that doesn't exist.
 *
 * @param {Object} currentAssessment - { familiarity, instructionalMode }
 * @param {Object} evidenceFromTurn - { diagnosis, observation, turnsInMode }
 * @returns {Object|null} Updated assessment or null if no change needed
 */
function reassessFamiliarity(currentAssessment, evidenceFromTurn) {
  const { familiarity, instructionalMode } = currentAssessment;
  const { diagnosis, observation, turnsInMode = 0 } = evidenceFromTurn;

  // ── Upgrade: student knows more than expected ──

  // Student solves problems correctly during INSTRUCT mode (vocab/concept/i-do)
  // They shouldn't be solving anything yet — they're ahead
  if (instructionalMode === 'instruct' && turnsInMode <= 3) {
    if (diagnosis?.isCorrect === true && diagnosis?.demonstratedReasoning) {
      // Student gave a correct answer WITH reasoning during what should be instruction
      if (familiarity === 'never-seen') {
        return {
          familiarity: 'developing',
          instructionalMode: 'guide',
          reason: 'Student demonstrated prior knowledge during instruction — upgrading to guided mode',
          confidence: 0.85,
        };
      }
      if (familiarity === 'introduced') {
        return {
          familiarity: 'developing',
          instructionalMode: 'guide',
          reason: 'Student showing stronger foundation than expected — Socratic guidance appropriate',
          confidence: 0.8,
        };
      }
    }

    // Student uses correct vocabulary without being taught
    if (observation?.contextSignals?.some(s => s.type === 'math_term_used')) {
      if (familiarity === 'never-seen') {
        return {
          familiarity: 'introduced',
          instructionalMode: 'instruct', // Stay in instruct but we can fast-track
          reason: 'Student using correct terminology — has some prior exposure',
          confidence: 0.7,
        };
      }
    }
  }

  // Student breezing through GUIDE mode — multiple correct, no help needed
  if (instructionalMode === 'guide' && turnsInMode >= 3) {
    if (diagnosis?.isCorrect === true && !observation?.contextSignals?.some(s => s.type === 'uncertainty')) {
      // Check recent history — if consistently correct, upgrade
      if (turnsInMode >= 4) {
        return {
          familiarity: 'proficient',
          instructionalMode: 'strengthen',
          reason: 'Student consistently correct with no scaffolding — upgrading to strengthen',
          confidence: 0.75,
        };
      }
    }
  }

  // ── Downgrade: student knows less than expected ──

  // Student struggling in STRENGTHEN mode — can't do harder problems
  if (instructionalMode === 'strengthen' && turnsInMode >= 2) {
    if (diagnosis?.isCorrect === false && diagnosis?.misconception) {
      return {
        familiarity: 'developing',
        instructionalMode: 'guide',
        reason: 'Misconception detected during strengthening — dropping to guided practice',
        confidence: 0.8,
      };
    }
  }

  // Student struggling in GUIDE mode — can't answer even with scaffolding
  if (instructionalMode === 'guide' && turnsInMode >= 3) {
    const recentWrong = turnsInMode; // rough proxy
    if (diagnosis?.isCorrect === false && observation?.streaks?.recentWrongCount >= 3) {
      return {
        familiarity: 'introduced',
        instructionalMode: 'instruct',
        reason: 'Student struggling with guided practice — needs direct instruction first',
        confidence: 0.75,
      };
    }
  }

  return null; // No change needed
}

/**
 * Build a phase evidence tracker for a new instructional target.
 * Store this on the conversation or TutorPlan to accumulate evidence.
 *
 * @param {string} phase - Starting phase
 * @param {string} skillId - Skill being taught
 * @returns {Object} Phase evidence tracker
 */
function createPhaseTracker(phase, skillId) {
  return {
    skillId,
    phase,
    turnsInPhase: 0,
    turnsInMode: 0,
    evidenceLog: [],
    phaseHistory: [{ phase, startedAt: new Date() }],
    advancementCount: 0,
    regressionCount: 0,
  };
}

/**
 * Update the phase tracker after evaluation.
 *
 * @param {Object} tracker - Phase evidence tracker
 * @param {Object} evaluation - Result from evaluatePhaseAdvancement
 * @param {Object} newEvidence - Evidence from this turn
 * @returns {Object} Updated tracker
 */
function updatePhaseTracker(tracker, evaluation, newEvidence) {
  tracker.turnsInPhase += 1;
  tracker.turnsInMode += 1;

  // Add signals to evidence log
  const signals = extractSignals(newEvidence, {});
  tracker.evidenceLog.push(...signals);

  // Cap evidence log to last 20 signals
  if (tracker.evidenceLog.length > 20) {
    tracker.evidenceLog = tracker.evidenceLog.slice(-20);
  }

  if (evaluation.shouldAdvance && evaluation.nextPhase) {
    tracker.phase = evaluation.nextPhase;
    tracker.turnsInPhase = 0;
    tracker.advancementCount += 1;
    tracker.phaseHistory.push({
      phase: evaluation.nextPhase,
      startedAt: new Date(),
      reason: evaluation.reasoning,
    });
  }

  if (evaluation.shouldRegress && evaluation.nextPhase) {
    tracker.phase = evaluation.nextPhase;
    tracker.turnsInPhase = 0;
    tracker.regressionCount += 1;
    tracker.phaseHistory.push({
      phase: evaluation.nextPhase,
      startedAt: new Date(),
      reason: evaluation.reasoning,
      isRegression: true,
    });
  }

  return tracker;
}

module.exports = {
  evaluatePhaseAdvancement,
  reassessFamiliarity,
  createPhaseTracker,
  updatePhaseTracker,
  extractSignals,
  getNextPhase,
  PHASE_ADVANCEMENT_CRITERIA,
  EVIDENCE_SIGNALS,
};
