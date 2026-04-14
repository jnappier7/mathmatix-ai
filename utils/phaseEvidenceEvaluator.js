/**
 * PHASE EVIDENCE EVALUATOR — Data-driven instruction phase advancement
 *
 * The SOLE decision maker for all phase transitions. Uses accumulated
 * evidence from the pipeline (diagnosis, observation, BKT, FSRS,
 * consistency, session mood, cognitive load) to decide when to advance,
 * stay, or regress.
 *
 * Phase sequence follows concept-first gradual release:
 *   INTRO → WARMUP → CONCEPT_INTRO → I_DO → CONCEPT_CHECK
 *        → WE_DO → CHECK_IN → YOU_DO → MASTERY_CHECK
 *
 * lessonPhaseManager remains the state container (init, prompts,
 * transition execution). This module is the brain.
 *
 * @module utils/phaseEvidenceEvaluator
 */

// ── Concept-first phase sequence (gradual release) ──
const PHASE_SEQUENCE = [
  'intro', 'warmup', 'concept-intro', 'i-do', 'concept-check',
  'we-do', 'paper-practice', 'check-in', 'you-do', 'mastery',
];

// ── Evidence thresholds per phase ──
// Each phase requires different types and amounts of evidence to advance.
// Learning engine data (BKT, FSRS, consistency) modifies these via fast-track.
const PHASE_ADVANCEMENT_CRITERIA = {
  'intro': {
    // Student makes their choice — handled externally by chat.js
    minTurns: 1,
    minCorrect: 0,
    signals: ['acknowledged_understanding'],
    requiredSignals: 0,
    fastTrack: null, // INTRO choice is explicit, not evidence-based
  },
  'warmup': {
    // Quick prerequisite review — advance when student shows basic competence
    minTurns: 1,
    minCorrect: 0,
    signals: ['correct_answer', 'used_term_correctly', 'acknowledged_understanding'],
    requiredSignals: 1,
    fastTrack: { condition: 'bkt_high_prior', advanceTo: 'concept-intro' },
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
  'concept-check': {
    // Verify the student understands WHY, not just HOW
    minTurns: 1,
    minCorrect: 0,
    signals: ['demonstrated_reasoning', 'explained_concept_back'],
    requiredSignals: 1,
    fastTrack: null, // Must demonstrate understanding — no shortcut
  },
  'we-do': {
    // Student can do it with decreasing support
    minTurns: 3,
    minCorrect: 2,
    signals: ['correct_with_scaffold', 'correct_without_scaffold', 'explained_reasoning', 'caught_own_error'],
    requiredSignals: 2,
    fastTrack: { condition: 'multiple_correct_no_scaffold', advanceTo: 'you-do' },
  },
  'paper-practice': {
    // Student must upload paper work — gated by paperSubmitted flag
    minTurns: 1,
    minCorrect: 0,
    signals: ['paper_work_uploaded', 'acknowledged_understanding'],
    requiredSignals: 1,
    fastTrack: null, // No shortcut — paper work is the point
  },
  'check-in': {
    // Emotional confidence check — always advance
    minTurns: 1,
    minCorrect: 0,
    signals: ['acknowledged_understanding'],
    requiredSignals: 0,
    fastTrack: null,
  },
  'you-do': {
    // Student can do it independently
    minTurns: 3,
    minCorrect: 2,
    signals: ['correct_independently', 'correct_novel_context', 'explained_why', 'taught_back'],
    requiredSignals: 2,
    fastTrack: { condition: 'consistency_high', advanceTo: 'mastery' },
  },
  'mastery': {
    // Student demonstrates real mastery
    minTurns: 1,
    minCorrect: 1,
    signals: ['correct_independently', 'correct_novel_context'],
    requiredSignals: 1,
    fastTrack: null, // Mastery is mastery
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

  // Paper practice
  PAPER_WORK_UPLOADED: 'paper_work_uploaded',           // Student uploaded handwritten work photo
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

  // Phases that always advance after first interaction
  if (phase === 'intro' || phase === 'check-in') {
    const next = getNextPhase(phase);
    return {
      shouldAdvance: true, shouldRegress: false, nextPhase: next,
      confidence: 1.0, reasoning: `${phase} complete — advancing to ${next}`,
    };
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
 * Uses both evidence signals AND learning engine data (BKT, FSRS, consistency).
 */
function checkFastTrack(fastTrack, evidenceLog, newEvidence, context) {
  const { condition, advanceTo } = fastTrack;
  const { evidence } = context;

  // Learning engine shortcuts
  const bkt = evidence?.knowledge?.bktState;
  const consistency = evidence?.performance;

  switch (condition) {
    case 'bkt_high_prior':
      // BKT says student already knows this skill — skip warmup
      if (bkt && bkt.pLearned > 0.7) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: `BKT P(learned)=${bkt.pLearned.toFixed(2)} — student has prior knowledge` };
      }
      // FSRS says skill was recently practiced with high stability
      if (evidence?.memory?.retrievability > 0.8) {
        return { triggered: true, advanceTo, confidence: 0.8, reason: 'FSRS high retrievability — recently practiced' };
      }
      // Also fast-track on evidence: correct answer in warmup
      if (evidenceLog.includes(EVIDENCE_SIGNALS.CORRECT_ANSWER)) {
        return { triggered: true, advanceTo, confidence: 0.75, reason: 'Correct in warmup — prerequisite solid' };
      }
      break;

    case 'demonstrated_deep_understanding':
      // Student explained the concept or asked application questions
      if (evidenceLog.includes(EVIDENCE_SIGNALS.DEMONSTRATED_REASONING) &&
          evidenceLog.includes(EVIDENCE_SIGNALS.ASKED_QUESTION)) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: 'Student shows deep understanding of concept' };
      }
      // BKT says they already know this — skip to practice
      if (bkt && bkt.pLearned > 0.85 && bkt.consecutiveCorrect >= 2) {
        return { triggered: true, advanceTo, confidence: 0.9, reason: 'BKT confirms prior mastery — skip to practice' };
      }
      break;

    case 'predicted_steps_correctly':
      // Student predicted what comes next in worked examples
      if (evidenceLog.filter(s => s === EVIDENCE_SIGNALS.PREDICTED_STEP).length >= 2) {
        return { triggered: true, advanceTo, confidence: 0.8, reason: 'Student predicted model steps — ready for practice' };
      }
      // Solved it correctly during I-Do
      if (evidenceLog.includes(EVIDENCE_SIGNALS.INDEPENDENT_CORRECT)) {
        return { triggered: true, advanceTo, confidence: 0.9, reason: 'Student solved it independently during modeling' };
      }
      break;

    case 'multiple_correct_no_scaffold':
      // 2+ correct without help during We Do
      if (evidenceLog.filter(s => s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT).length >= 2) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: 'Student solving independently — ready for You Do' };
      }
      break;

    case 'consistency_high': {
      // Consistency scorer says student is solid
      if (consistency?.smartScore >= 80 && consistency?.longestCorrectStreak >= 3) {
        return { triggered: true, advanceTo, confidence: 0.9, reason: `SmartScore ${consistency.smartScore} with ${consistency.longestCorrectStreak}-streak — ready for mastery` };
      }
      // Fallback: 3 consecutive correct in evidence
      const last3 = evidenceLog.slice(-3);
      if (last3.length >= 3 && last3.every(s =>
        s === EVIDENCE_SIGNALS.CORRECT_ANSWER ||
        s === EVIDENCE_SIGNALS.INDEPENDENT_CORRECT
      )) {
        return { triggered: true, advanceTo, confidence: 0.85, reason: 'Three consecutive correct — ready for mastery check' };
      }
      break;
    }
  }

  return { triggered: false };
}

/**
 * Check if the student needs to regress to an earlier phase.
 * Uses evidence signals, cognitive load, session mood, and consistency.
 */
function checkRegression(currentPhase, evidenceLog, newEvidence, context) {
  const recentSignals = evidenceLog.slice(-5);
  const { evidence, sessionMood } = context;

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

  // Productive struggle exception: consistency scorer says struggle is healthy
  // Don't regress if the student is in the challenge zone and making progress
  if (evidence?.performance?.productiveStruggleDetected) {
    return { shouldRegress: false };
  }

  // Phase-specific regression rules
  switch (currentPhase) {
    case 'you-do':
      if (recentWrong >= 3 && recentCorrect <= 1) {
        return { shouldRegress: true, regressTo: 'we-do', confidence: 0.8,
          reason: `${recentWrong} wrong in independent practice — need more guided work` };
      }
      break;

    case 'we-do':
      if (recentWrong >= 3 && recentCorrect === 0) {
        return { shouldRegress: true, regressTo: 'i-do', confidence: 0.75,
          reason: 'Struggling even with scaffolding — need to re-model' };
      }
      // Correct answers but no reasoning → understanding gap
      if (recentCorrect >= 2 && !evidenceLog.slice(-5).includes(EVIDENCE_SIGNALS.DEMONSTRATED_REASONING)) {
        return { shouldRegress: true, regressTo: 'concept-check', confidence: 0.65,
          reason: 'Procedural success but no reasoning demonstrated — revisit concepts' };
      }
      break;

    case 'concept-check':
      if (recentWrong >= 2 && recentCorrect === 0) {
        return { shouldRegress: true, regressTo: 'concept-intro', confidence: 0.75,
          reason: 'Cannot explain reasoning — need to re-introduce concept' };
      }
      break;

    case 'mastery':
      if (recentWrong >= 1 && recentCorrect === 0) {
        return { shouldRegress: true, regressTo: 'you-do', confidence: 0.7,
          reason: 'Failed mastery check — more independent practice needed' };
      }
      break;
  }

  // Cognitive overload — from evidence accumulator
  if (evidence?.cognitiveLoad?.isOverloaded) {
    const regressMap = {
      'you-do': 'we-do',
      'paper-practice': 'we-do',
      'we-do': 'i-do',
      'mastery': 'we-do',
      'concept-check': 'concept-intro',
    };
    if (regressMap[currentPhase]) {
      return { shouldRegress: true, regressTo: regressMap[currentPhase], confidence: 0.85,
        reason: 'Cognitive overload detected — reducing complexity' };
    }
  }

  // Session fatigue — don't advance, consider regression for hard phases
  if (sessionMood?.fatigueSignal > 0.7 && (currentPhase === 'you-do' || currentPhase === 'mastery')) {
    return { shouldRegress: true, regressTo: 'check-in', confidence: 0.7,
      reason: 'Fatigue detected — emotional check-in before continuing' };
  }

  return { shouldRegress: false };
}

/**
 * Get the next phase in the concept-first instructional sequence.
 */
function getNextPhase(currentPhase) {
  const idx = PHASE_SEQUENCE.indexOf(currentPhase);
  if (idx >= 0 && idx < PHASE_SEQUENCE.length - 1) return PHASE_SEQUENCE[idx + 1];
  return null; // Already at mastery or unknown
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
  // Initialize fields if missing (backwards compat with phaseState objects)
  if (tracker.turnsInPhase == null) tracker.turnsInPhase = 0;
  if (tracker.turnsInMode == null) tracker.turnsInMode = 0;
  if (!tracker.evidenceLog) tracker.evidenceLog = [];
  if (!tracker.phaseHistory) tracker.phaseHistory = [];
  if (tracker.advancementCount == null) tracker.advancementCount = 0;
  if (tracker.regressionCount == null) tracker.regressionCount = 0;

  tracker.turnsInPhase += 1;
  tracker.turnsInMode += 1;

  // Add signals to evidence log
  const signals = extractSignals(newEvidence, {});
  tracker.evidenceLog.push(...signals);

  // Cap evidence log to last 20 signals
  if (tracker.evidenceLog.length > 20) {
    tracker.evidenceLog = tracker.evidenceLog.slice(-20);
  }

  // Phase change (advance or regress) — update both `phase` and `currentPhase`
  // so the tracker works whether it started as a phaseTracker or phaseState.
  const phaseChanged = (evaluation.shouldAdvance || evaluation.shouldRegress) && evaluation.nextPhase;
  if (phaseChanged) {
    tracker.phase = evaluation.nextPhase;
    tracker.currentPhase = evaluation.nextPhase;
    tracker.turnsInPhase = 0;

    if (evaluation.shouldAdvance) tracker.advancementCount += 1;
    if (evaluation.shouldRegress) tracker.regressionCount += 1;

    tracker.phaseHistory.push({
      phase: evaluation.nextPhase,
      startedAt: new Date(),
      reason: evaluation.reasoning,
      isRegression: evaluation.shouldRegress || false,
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
  PHASE_SEQUENCE,
  PHASE_ADVANCEMENT_CRITERIA,
  EVIDENCE_SIGNALS,
};
