/**
 * EVIDENCE ACCUMULATOR — Bridges all data engines into decision-making
 *
 * The problem with the current system: observe, diagnose, and sessionMood
 * collect tons of data that decide.js and skillSelector.js never see.
 * Response times, misconception history, confidence signals, fluency
 * z-scores — all dead-ending at persist.
 *
 * The Evidence Accumulator gathers signals from ALL engines and produces
 * a unified evidence object that decide.js consumes. This is the "closing
 * the feedback loop" that separates elite platforms from good ones.
 *
 * DATA SOURCES:
 *   1. BKT (knowledgeTracer) → P(L), ZPD score, mastery predictions
 *   2. FSRS (fsrsScheduler) → Retrievability, review urgency, stability
 *   3. Cognitive Load (cognitiveLoadEstimator) → Load level, overload detection
 *   4. Consistency Scorer → SmartScore, productive struggle, pattern analysis
 *   5. Interleaving Engine → Interleave decisions, session statistics
 *   6. Misconception History → Recurring patterns, unaddressed misconceptions
 *   7. Session Mood → Emotional trajectory, fatigue, flow state
 *   8. Observation → Context signals, streaks, confidence markers
 *
 * OUTPUT: A structured evidence object that tells decide.js everything
 * it needs to make the optimal pedagogical move.
 *
 * @module pipeline/evidenceAccumulator
 */

const { estimateCognitiveLoad } = require('../cognitiveLoadEstimator');
const { analyzePattern } = require('../consistencyScorer');

// ============================================================================
// EVIDENCE ASSEMBLY
// ============================================================================

/**
 * Assemble evidence from all available data sources.
 *
 * This runs BEFORE decide.js, gathering every signal the system has
 * into a single structured object.
 *
 * @param {Object} params
 * @param {Object} params.observation - From observe stage
 * @param {Object} params.diagnosis - From diagnose stage
 * @param {Object} params.sessionMood - From sessionMood
 * @param {Object} params.bktState - BKT state for active skill (if available)
 * @param {Object} params.fsrsCard - FSRS card for active skill (if available)
 * @param {Object} params.consistencyState - ConsistencyScorer state (if available)
 * @param {Object} params.conversationData - { messages, responseTimes, messageLengths }
 * @param {Object} params.studentProfile - { theta, misconceptionHistory, skillMastery }
 * @param {Object} params.activeSkill - Current skill { skillId, difficulty }
 * @returns {Object} Unified evidence object
 */
function assembleEvidence(params = {}) {
  const {
    observation,
    diagnosis,
    sessionMood,
    bktState,
    fsrsCard,
    consistencyState,
    conversationData = {},
    studentProfile = {},
    activeSkill,
  } = params;

  const evidence = {
    // ── Knowledge State (from BKT) ──
    knowledge: assembleKnowledgeEvidence(bktState, activeSkill),

    // ── Memory State (from FSRS) ──
    memory: assembleMemoryEvidence(fsrsCard),

    // ── Cognitive Load (computed fresh) ──
    cognitiveLoad: assembleCognitiveLoadEvidence(
      conversationData, studentProfile, activeSkill
    ),

    // ── Performance Pattern (from ConsistencyScorer) ──
    performance: assemblePerformanceEvidence(consistencyState),

    // ── Misconception Intelligence ──
    misconceptions: assembleMisconceptionEvidence(
      diagnosis, studentProfile.misconceptionHistory
    ),

    // ── Emotional/Engagement State (from SessionMood) ──
    engagement: assembleEngagementEvidence(sessionMood, observation),

    // ── Composite Signals (cross-cutting) ──
    composite: null, // Filled below
  };

  // Generate composite signals from combined evidence
  evidence.composite = generateCompositeSignals(evidence);

  return evidence;
}

// ============================================================================
// INDIVIDUAL EVIDENCE ASSEMBLERS
// ============================================================================

/**
 * Knowledge evidence from BKT.
 */
function assembleKnowledgeEvidence(bktState, activeSkill) {
  if (!bktState) {
    return {
      available: false,
      pLearned: null,
      zpdScore: null,
      mastered: false,
      predictedCorrect: null,
    };
  }

  // Import here to avoid circular dependency
  const { predictCorrect, calculateZPDScore } = require('../knowledgeTracer');

  return {
    available: true,
    pLearned: bktState.pLearned,
    zpdScore: calculateZPDScore(bktState),
    mastered: bktState.mastered,
    predictedCorrect: predictCorrect(bktState),
    confidence: bktState.confidence,
    totalAttempts: bktState.totalAttempts,
    consecutiveCorrect: bktState.consecutiveCorrect,
    consecutiveIncorrect: bktState.consecutiveIncorrect,
  };
}

/**
 * Memory evidence from FSRS.
 */
function assembleMemoryEvidence(fsrsCard) {
  if (!fsrsCard) {
    return {
      available: false,
      retrievability: null,
      stability: null,
      isDue: false,
      daysUntilDue: null,
    };
  }

  const { calculateRetrievability } = require('../fsrsScheduler');

  const elapsedDays = fsrsCard.lastReview
    ? (Date.now() - new Date(fsrsCard.lastReview).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const retrievability = calculateRetrievability(elapsedDays, fsrsCard.stability);
  const isDue = elapsedDays >= fsrsCard.scheduledDays;
  const daysUntilDue = Math.max(0, fsrsCard.scheduledDays - elapsedDays);

  return {
    available: true,
    retrievability: Math.round(retrievability * 1000) / 1000,
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    isDue,
    daysUntilDue: Math.round(daysUntilDue * 10) / 10,
    reps: fsrsCard.reps,
    lapses: fsrsCard.lapses,
    state: fsrsCard.state,
  };
}

/**
 * Cognitive load evidence (computed fresh from session data).
 */
function assembleCognitiveLoadEvidence(conversationData, studentProfile, activeSkill) {
  const {
    responseTimes = [],
    results = [],
    messageLengths = [],
    sessionDurationMinutes = 0,
  } = conversationData;

  // Only estimate if we have enough data
  if (results.length < 3) {
    return {
      available: false,
      load: null,
      level: null,
      isOverloaded: false,
    };
  }

  const estimate = estimateCognitiveLoad({
    responseTimes,
    results,
    messageLengths,
    sessionDurationMinutes,
    studentTheta: studentProfile.theta || 0,
    currentDifficulty: activeSkill?.difficulty || 0,
  });

  return {
    available: true,
    load: estimate.cognitiveLoad,
    level: estimate.level,
    isOverloaded: estimate.isOverloaded,
    isOptimal: estimate.isOptimal,
    signals: estimate.signals,
    recommendations: estimate.recommendations,
  };
}

/**
 * Performance pattern evidence from ConsistencyScorer.
 */
function assemblePerformanceEvidence(consistencyState) {
  if (!consistencyState || consistencyState.responses.length < 3) {
    return {
      available: false,
      smartScore: null,
      pattern: null,
      productiveStruggle: false,
    };
  }

  const pattern = analyzePattern(consistencyState);

  return {
    available: true,
    smartScore: consistencyState.smartScore,
    rawAccuracy: Math.round((consistencyState.rawAccuracy || 0) * 100),
    productiveStruggle: consistencyState.productiveStruggleDetected,
    inChallengeZone: consistencyState.inChallengeZone,
    pattern: pattern.pattern,
    signal: pattern.signal,
    recoveryCount: consistencyState.recoveryCount,
    longestCorrectStreak: consistencyState.longestCorrectStreak,
    recommendation: pattern.recommendation,
  };
}

/**
 * Misconception intelligence from diagnosis + history.
 */
function assembleMisconceptionEvidence(diagnosis, misconceptionHistory) {
  const evidence = {
    currentMisconception: null,
    isRecurring: false,
    recurringCount: 0,
    totalUnaddressed: 0,
    needsIntervention: false,
  };

  // Current misconception from diagnosis
  if (diagnosis?.misconception) {
    evidence.currentMisconception = {
      name: diagnosis.misconception.name,
      severity: diagnosis.misconception.severity,
      source: diagnosis.misconception.source,
      hasFix: !!diagnosis.misconception.fix,
    };
  }

  // Historical patterns
  if (misconceptionHistory && Array.isArray(misconceptionHistory)) {
    evidence.totalUnaddressed = misconceptionHistory.filter(m => !m.addressed).length;

    // Check if current misconception is recurring
    if (evidence.currentMisconception) {
      const matchingHistory = misconceptionHistory.filter(
        m => m.misconceptionName === evidence.currentMisconception.name
      );
      evidence.recurringCount = matchingHistory.length;
      evidence.isRecurring = evidence.recurringCount >= 2;
      evidence.needsIntervention = evidence.recurringCount >= 3;
    }
  }

  return evidence;
}

/**
 * Engagement evidence from session mood + observation signals.
 */
function assembleEngagementEvidence(sessionMood, observation) {
  if (!sessionMood) {
    return {
      available: false,
      trajectory: null,
      inFlow: false,
      fatigueSignal: false,
    };
  }

  // Extract confidence/uncertainty from observation context signals
  let confidenceLevel = 'neutral';
  if (observation?.contextSignals) {
    const hasConfidence = observation.contextSignals.some(s => s.type === 'confidence');
    const hasUncertainty = observation.contextSignals.some(s => s.type === 'uncertainty');
    const hasMetacognition = observation.contextSignals.some(s => s.type === 'metacognition');

    if (hasMetacognition) confidenceLevel = 'metacognitive'; // Best signal
    else if (hasConfidence) confidenceLevel = 'confident';
    else if (hasUncertainty) confidenceLevel = 'uncertain';
  }

  return {
    available: true,
    trajectory: sessionMood.trajectory,
    energy: sessionMood.energy,
    momentum: sessionMood.momentum,
    inFlow: sessionMood.inFlow,
    fatigueSignal: sessionMood.fatigueSignal,
    consecutiveCorrect: sessionMood.consecutiveCorrect,
    confidenceLevel,
  };
}

// ============================================================================
// COMPOSITE SIGNALS
// ============================================================================

/**
 * Generate composite signals that combine evidence from multiple sources.
 *
 * These are the high-level decision signals that decide.js acts on.
 */
function generateCompositeSignals(evidence) {
  const signals = {
    // Should we reduce difficulty?
    shouldReduceDifficulty: false,

    // Should we increase difficulty?
    shouldIncreaseDifficulty: false,

    // Should we switch teaching approach?
    shouldSwitchApproach: false,

    // Should we suggest a break?
    shouldSuggestBreak: false,

    // Should we interleave a review problem?
    shouldInterleave: false,

    // Is this a teachable moment?
    teachableMoment: false,

    // Overall readiness level (0-1)
    readiness: 0.5,

    // Optimal scaffold level (1-5)
    optimalScaffold: 3,

    // Reasoning for primary recommendation
    reasoning: [],
  };

  // ── Reduce difficulty signals ──
  if (evidence.cognitiveLoad.available && evidence.cognitiveLoad.isOverloaded) {
    signals.shouldReduceDifficulty = true;
    signals.reasoning.push('Cognitive overload detected');
  }

  if (evidence.knowledge.available && evidence.knowledge.zpdScore < 0.2) {
    signals.shouldReduceDifficulty = true;
    signals.reasoning.push('Problem is outside zone of proximal development');
  }

  if (evidence.performance.available && evidence.performance.signal === 'negative') {
    signals.shouldReduceDifficulty = true;
    signals.reasoning.push(`Performance pattern: ${evidence.performance.pattern}`);
  }

  // ── Increase difficulty signals ──
  if (evidence.knowledge.available && evidence.knowledge.pLearned > 0.90) {
    signals.shouldIncreaseDifficulty = true;
    signals.reasoning.push('BKT indicates near-mastery');
  }

  if (evidence.cognitiveLoad.available && evidence.cognitiveLoad.level === 'low') {
    signals.shouldIncreaseDifficulty = true;
    signals.reasoning.push('Low cognitive load — student may be bored');
  }

  if (evidence.engagement.available && evidence.engagement.inFlow) {
    signals.shouldIncreaseDifficulty = true;
    signals.reasoning.push('Student is in flow state');
  }

  // ── Switch approach signals ──
  if (evidence.misconceptions.isRecurring) {
    signals.shouldSwitchApproach = true;
    signals.reasoning.push(
      `Recurring misconception (${evidence.misconceptions.recurringCount}x): ${evidence.misconceptions.currentMisconception?.name}`
    );
  }

  if (evidence.performance.available && evidence.performance.pattern === 'stuck') {
    signals.shouldSwitchApproach = true;
    signals.reasoning.push('Student is stuck — same approach not working');
  }

  // ── Break suggestion signals ──
  if (evidence.engagement.available && evidence.engagement.fatigueSignal) {
    signals.shouldSuggestBreak = true;
    signals.reasoning.push('Fatigue detected');
  }

  if (evidence.cognitiveLoad.available &&
      evidence.cognitiveLoad.signals?.fatigue > 0.7) {
    signals.shouldSuggestBreak = true;
    signals.reasoning.push('Time-on-task fatigue');
  }

  // ── Interleave signals ──
  if (evidence.memory.available && evidence.memory.isDue) {
    signals.shouldInterleave = true;
    signals.reasoning.push('FSRS: skill due for review');
  }

  // ── Teachable moment detection ──
  if (evidence.engagement.available &&
      evidence.engagement.confidenceLevel === 'metacognitive') {
    signals.teachableMoment = true;
    signals.reasoning.push('Student showing metacognition — deepen understanding');
  }

  if (evidence.performance.available &&
      evidence.performance.productiveStruggle) {
    signals.teachableMoment = true;
    signals.reasoning.push('Productive struggle detected — reinforce the recovery');
  }

  // ── Readiness calculation ──
  let readiness = 0.5;

  if (evidence.knowledge.available) {
    readiness = evidence.knowledge.zpdScore * 0.3 + readiness * 0.7;
  }

  if (evidence.cognitiveLoad.available) {
    const loadPenalty = evidence.cognitiveLoad.isOverloaded ? -0.3
      : evidence.cognitiveLoad.level === 'high' ? -0.15
      : evidence.cognitiveLoad.isOptimal ? 0.1
      : 0;
    readiness += loadPenalty;
  }

  if (evidence.engagement.available) {
    if (evidence.engagement.inFlow) readiness += 0.15;
    if (evidence.engagement.fatigueSignal) readiness -= 0.2;
    if (evidence.engagement.trajectory === 'falling') readiness -= 0.1;
  }

  signals.readiness = Math.max(0, Math.min(1, Math.round(readiness * 100) / 100));

  // ── Optimal scaffold level ──
  if (signals.shouldReduceDifficulty) {
    signals.optimalScaffold = Math.min(5, signals.optimalScaffold + 1);
  }
  if (evidence.cognitiveLoad.available && evidence.cognitiveLoad.isOverloaded) {
    signals.optimalScaffold = 5;
  }
  if (evidence.engagement.available && evidence.engagement.inFlow) {
    signals.optimalScaffold = Math.max(1, signals.optimalScaffold - 1);
  }
  if (signals.shouldIncreaseDifficulty && !signals.shouldReduceDifficulty) {
    signals.optimalScaffold = Math.max(1, signals.optimalScaffold - 1);
  }

  return signals;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  assembleEvidence,
  generateCompositeSignals,
};
