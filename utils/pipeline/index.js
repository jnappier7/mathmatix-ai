/**
 * TUTORING PIPELINE — Orchestrates the 6-stage cognitive architecture
 *
 * observe → diagnose → decide → generate → verify → persist
 *
 * The engine decides. The LLM speaks. The system verifies.
 *
 * Usage from chat.js:
 *   const { runPipeline } = require('../utils/pipeline');
 *   const result = await runPipeline(message, pipelineContext);
 *
 * The pipeline returns everything chat.js needs to build the response JSON.
 * Chat.js keeps responsibility for: request validation, context loading,
 * streaming setup, and response formatting.
 *
 * @module pipeline
 */

const { observe, MESSAGE_TYPES } = require('./observe');
const { diagnose } = require('./diagnose');
const { decide, ACTIONS } = require('./decide');
const { generate, assemblePrompt } = require('./generate');
const { verify } = require('./verify');
const { persist } = require('./persist');
const { buildSidecar, mergeLlmSignals, getSignalStats } = require('./sidecar');
const { computeSessionMood, buildMoodDirective } = require('./sessionMood');
const { generateSuggestions } = require('./suggestions');
const { assembleEvidence } = require('./evidenceAccumulator');

// New data-driven engines
const { updateBKT, initializeBKT } = require('../knowledgeTracer');
const { updateCard, initializeCard, rateAttempt, RATINGS } = require('../fsrsScheduler');
const { recordAttempt: recordConsistencyAttempt, initializeScore, categorizeDifficulty } = require('../consistencyScorer');

/**
 * Run the full tutoring pipeline.
 *
 * @param {string} message - The student's raw message
 * @param {Object} ctx - Pipeline context (assembled by chat.js before calling)
 * @param {Object} ctx.user - Mongoose user document
 * @param {Object} ctx.conversation - Mongoose conversation document
 * @param {string} ctx.systemPrompt - Pre-built system prompt
 * @param {Array}  ctx.formattedMessages - Conversation history for LLM
 * @param {Object} ctx.activeSkill - Current skill if any { skillId, displayName, teachingGuidance }
 * @param {Object} ctx.phaseState - Lesson phase state if in structured mode
 * @param {boolean} ctx.hasRecentUpload - Whether student has recent uploads
 * @param {boolean} ctx.stream - Whether to stream the response
 * @param {Object} ctx.res - Express response object (for streaming)
 * @param {number} ctx.aiProcessingStartTime - Date.now() when processing started
 * @param {boolean} [ctx.skipPersist=false] - Skip persist stage and learning engine updates (for anonymous trial chat)
 * @returns {Object} Pipeline result with everything needed for the response
 */
async function runPipeline(message, ctx) {
  const startTime = Date.now();

  // ── Stage 1: OBSERVE ──
  const recentUserMessages = ctx.conversation.messages
    .filter(msg => msg.role === 'user')
    .slice(-6);
  const recentAssistantMessages = ctx.conversation.messages
    .filter(msg => msg.role === 'assistant')
    .slice(-6);

  const observation = observe(message, {
    recentUserMessages,
    recentAssistantMessages,
    hasRecentUpload: ctx.hasRecentUpload || false,
  });

  console.log(`[Pipeline] Observe: ${observation.messageType} (confidence: ${observation.confidence})`);

  // ── Stage 2: DIAGNOSE ──
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages: recentAssistantMessages.map(msg => ({
      content: msg.content,
      problemResult: msg.problemResult,
    })),
    recentUserMessages: recentUserMessages.map(msg => ({ content: msg.content })),
    activeSkill: ctx.activeSkill || null,
    user: ctx.user,
  });

  if (diagnosis.type !== 'no_answer') {
    console.log(`[Pipeline] Diagnose: ${diagnosis.type} (answer: ${diagnosis.answer}, correct: ${diagnosis.correctAnswer})`);
  }

  // ── Session mood (emotional arc across the conversation) ──
  const sessionMood = computeSessionMood(ctx.conversation.messages, {
    sessionStart: ctx.conversation.createdAt || ctx.conversation.startDate,
  });

  if (sessionMood.summary) {
    const emotionalTag = sessionMood.emotionalState?.state && sessionMood.emotionalState.state !== 'neutral'
      ? `, emotion: ${sessionMood.emotionalState.state} (${Math.round(sessionMood.emotionalState.confidence * 100)}%)`
      : '';
    console.log(`[Pipeline] Mood: ${sessionMood.trajectory} (energy: ${sessionMood.energy}, momentum: ${sessionMood.momentum}${sessionMood.inFlow ? ', IN FLOW' : ''}${sessionMood.fatigueSignal ? ', FATIGUE' : ''}${emotionalTag})`);
  }

  // ── Evidence Assembly (NEW: data-driven intelligence layer) ──
  // Gathers signals from BKT, FSRS, cognitive load, consistency scoring,
  // and misconception history into a unified evidence object for decide.js
  let evidence = null;
  try {
    // Extract session data for cognitive load estimation
    const allMessages = ctx.conversation.messages || [];
    const userMsgs = allMessages.filter(m => m.role === 'user');
    const assistantMsgs = allMessages.filter(m => m.role === 'assistant');

    const conversationData = {
      responseTimes: assistantMsgs
        .filter(m => m.responseTime)
        .map(m => m.responseTime),
      results: assistantMsgs
        .filter(m => m.problemResult)
        .map(m => ({
          correct: m.problemResult === 'correct',
          hintUsed: false, // TODO: extract from message signals
          difficulty: 'medium',
        })),
      messageLengths: userMsgs
        .slice(-10)
        .map(m => (m.content || '').split(/\s+/).length),
      sessionDurationMinutes: ctx.conversation.createdAt
        ? (Date.now() - new Date(ctx.conversation.createdAt).getTime()) / 60000
        : 0,
    };

    // Get BKT state for active skill (from user's learningEngines data)
    const bktState = ctx.activeSkill && ctx.user.learningEngines?.bkt
      ? (ctx.user.learningEngines.bkt.get
        ? ctx.user.learningEngines.bkt.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.bkt[ctx.activeSkill.skillId])
      : null;

    // Get FSRS card for active skill
    const fsrsCard = ctx.activeSkill && ctx.user.learningEngines?.fsrs
      ? (ctx.user.learningEngines.fsrs.get
        ? ctx.user.learningEngines.fsrs.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.fsrs[ctx.activeSkill.skillId])
      : null;

    // Get consistency state for active skill
    const consistencyState = ctx.activeSkill && ctx.user.learningEngines?.consistency
      ? (ctx.user.learningEngines.consistency.get
        ? ctx.user.learningEngines.consistency.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.consistency[ctx.activeSkill.skillId])
      : null;

    // Get misconception history
    const misconceptionHistory = ctx.user.masteryProgress?.activeBadge?.misconceptionsAddressed || [];

    evidence = assembleEvidence({
      observation,
      diagnosis,
      sessionMood,
      bktState,
      fsrsCard,
      consistencyState,
      conversationData,
      studentProfile: {
        theta: ctx.user.assessmentResults?.theta || 0,
        misconceptionHistory,
        skillMastery: ctx.user.skillMastery,
      },
      activeSkill: ctx.activeSkill,
    });

    if (evidence.composite.reasoning.length > 0) {
      console.log(`[Pipeline] Evidence: ${evidence.composite.reasoning.slice(0, 3).join('; ')}`);
    }
  } catch (err) {
    console.error('[Pipeline] Evidence assembly error (non-fatal):', err.message);
    // Evidence is optional — pipeline continues without it
  }

  // ── Stage 3: DECIDE (enhanced with evidence) ──
  const decision = decide(observation, diagnosis, {
    phaseState: ctx.phaseState || null,
    activeSkill: ctx.activeSkill || null,
    sessionMood,
    evidence,
  });

  console.log(`[Pipeline] Decide: ${decision.action}${decision.phase ? ` (phase: ${decision.phase})` : ''}`);

  // ── Build sidecar (deterministic signals pre-filled) ──
  const sidecar = buildSidecar(observation, diagnosis, decision, {
    user: ctx.user,
    activeSkill: ctx.activeSkill || null,
  });

  // ── Stage 4: GENERATE ──
  const moodDirective = buildMoodDirective(sessionMood);
  const assembled = assemblePrompt(decision, {
    systemPrompt: ctx.systemPrompt,
    messages: ctx.formattedMessages,
    moodDirective,
  });

  let rawResponseText;
  if (ctx.stream && ctx.res) {
    rawResponseText = await generate(assembled, { stream: true, res: ctx.res });
  } else {
    rawResponseText = await generate(assembled);
  }

  // ── Stage 5: VERIFY ──
  const verified = await verify(rawResponseText, {
    userId: ctx.user._id?.toString(),
    userMessage: message,
    iepReadingLevel: ctx.user.iepPlan?.readingLevel || null,
    firstName: ctx.user.firstName,
    isStreaming: ctx.stream || false,
    res: ctx.res || null,
    action: decision.action,
    messageType: observation.messageType,
  });

  console.log(`[Pipeline] Verify: ${verified.flags.length > 0 ? verified.flags.join(', ') : 'clean'}`);

  // ── Merge LLM signals into sidecar ──
  mergeLlmSignals(sidecar, verified.extracted);
  const signalStats = getSignalStats(sidecar);
  console.log(`[Pipeline] Sidecar: ${signalStats.total} signals (${signalStats.pipelineDerived} deterministic, ${signalStats.llmEmitted} from LLM)`);

  // ── Stage 6: PERSIST ──
  // When skipPersist is true (e.g. anonymous trial chat), skip all DB writes
  // and learning engine updates. The cognitive stages still ran, so the AI
  // response quality is identical — we just don't save state.
  const aiProcessingSeconds = Math.ceil((Date.now() - (ctx.aiProcessingStartTime || startTime)) / 1000);

  let persistResults;
  if (ctx.skipPersist) {
    persistResults = {
      xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
      problemAnswered: false,
      wasCorrect: false,
      wasSkipped: false,
      leveledUp: false,
      tutorsUnlocked: [],
      avatarBuilderUnlocked: false,
      iepGoalUpdates: [],
      courseProgressUpdate: null,
      aiTimeUsed: 0,
      freeWeeklySecondsRemaining: null,
    };
    console.log('[Pipeline] Persist: SKIPPED (skipPersist=true)');
  } else {
    // ── Update learning engines (BKT, FSRS, ConsistencyScorer) ──
    // These run BEFORE persist so the updated states are saved with the user document.
    if (ctx.activeSkill && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
      try {
        updateLearningEngines(ctx.user, ctx.activeSkill.skillId, diagnosis, observation);
      } catch (err) {
        console.error('[Pipeline] Learning engine update error (non-fatal):', err.message);
      }
    }

    persistResults = await persist({
      user: ctx.user,
      conversation: ctx.conversation,
      extracted: verified.extracted,
      diagnosis,
      observation,
      decision,
      responseText: verified.text,
      originalMessage: message,
      aiProcessingSeconds,
      sessionMood,
      evidence,
    });
  }

  const pipelineTime = Date.now() - startTime;
  console.log(`[Pipeline] Complete in ${pipelineTime}ms (observe→diagnose→decide→generate→verify→persist)`);

  // ── Generate smart suggestion chips ──
  const suggestions = generateSuggestions({
    decision,
    diagnosis,
    observation,
    sessionMood,
    user: ctx.user,
    conversationStats: {
      problemsAttempted: ctx.conversation.problemsAttempted || 0,
      problemsCorrect: ctx.conversation.problemsCorrect || 0,
    },
  });

  // ── Return everything chat.js needs ──
  return {
    text: verified.text,
    visualCommands: verified.visualCommands,
    drawingSequence: verified.drawingSequence,
    boardContext: verified.boardContext,
    xpBreakdown: persistResults.xpBreakdown,
    problemResult: persistResults.problemAnswered
      ? (persistResults.wasCorrect ? 'correct' : 'incorrect')
      : null,
    leveledUp: persistResults.leveledUp,
    tutorsUnlocked: persistResults.tutorsUnlocked,
    iepGoalUpdates: persistResults.iepGoalUpdates,
    courseProgressUpdate: persistResults.courseProgressUpdate,
    aiTimeUsed: persistResults.aiTimeUsed,
    freeWeeklySecondsRemaining: persistResults.freeWeeklySecondsRemaining,
    sessionStats: {
      problemsAttempted: ctx.conversation.problemsAttempted || 0,
      problemsCorrect: ctx.conversation.problemsCorrect || 0,
    },
    // Smart suggestion chips (context-aware)
    suggestions,
    // Structured sidecar (deterministic + LLM signals merged)
    sidecar,
    // Pipeline metadata (for debugging/logging)
    _pipeline: {
      messageType: observation.messageType,
      action: decision.action,
      phase: decision.phase,
      diagnosisType: diagnosis.type,
      flags: verified.flags,
      signalStats,
      sessionMood: {
        trajectory: sessionMood.trajectory,
        energy: sessionMood.energy,
        momentum: sessionMood.momentum,
        inFlow: sessionMood.inFlow,
        fatigueSignal: sessionMood.fatigueSignal,
      },
      // Evidence-based intelligence (new)
      evidence: evidence ? {
        cognitiveLoad: evidence.cognitiveLoad?.level || null,
        knowledgePL: evidence.knowledge?.pLearned || null,
        memoryRetrievability: evidence.memory?.retrievability || null,
        smartScore: evidence.performance?.smartScore || null,
        productiveStruggle: evidence.performance?.productiveStruggle || false,
        compositeReadiness: evidence.composite?.readiness || null,
        compositeReasoning: evidence.composite?.reasoning || [],
      } : null,
      timeMs: pipelineTime,
    },
  };
}

/**
 * Update BKT, FSRS, and ConsistencyScorer states after an answer attempt.
 *
 * These engines maintain per-skill, per-student learning state that makes
 * the system's predictions and decisions dramatically more accurate over time.
 *
 * @param {Object} user - Mongoose user document
 * @param {string} skillId - Active skill ID
 * @param {Object} diagnosis - Diagnosis result
 * @param {Object} observation - Observation result
 */
function updateLearningEngines(user, skillId, diagnosis, observation) {
  const isCorrect = diagnosis.isCorrect === true;
  const hintUsed = observation.contextSignals?.some(s => s.type === 'uncertainty') || false;

  // Initialize learningEngines on user if not exists
  if (!user.learningEngines) {
    user.learningEngines = { bkt: {}, fsrs: {}, consistency: {} };
  }

  // ── 1. Update BKT (Bayesian Knowledge Tracing) ──
  let bktStates = user.learningEngines.bkt;
  if (bktStates instanceof Map) {
    // Convert Map to plain object for compatibility
    bktStates = Object.fromEntries(bktStates);
  }

  let bktState = bktStates[skillId];
  if (!bktState) {
    bktState = initializeBKT(skillId, 'default');
  }

  bktState = updateBKT(bktState, isCorrect, { hintUsed });
  bktStates[skillId] = bktState;
  user.learningEngines.bkt = bktStates;

  console.log(`[LearningEngines] BKT ${skillId}: P(L)=${bktState.pLearned.toFixed(3)} (${isCorrect ? '✓' : '✗'})`);

  // ── 2. Update FSRS (Spaced Repetition) ──
  let fsrsCards = user.learningEngines.fsrs;
  if (fsrsCards instanceof Map) {
    fsrsCards = Object.fromEntries(fsrsCards);
  }

  let fsrsCard = fsrsCards[skillId];
  const rating = rateAttempt({
    correct: isCorrect,
    hintUsed,
    consecutiveCorrect: bktState.consecutiveCorrect,
  });

  if (!fsrsCard) {
    fsrsCard = initializeCard(rating);
  } else {
    fsrsCard = updateCard(fsrsCard, rating);
  }

  fsrsCards[skillId] = fsrsCard;
  user.learningEngines.fsrs = fsrsCards;

  console.log(`[LearningEngines] FSRS ${skillId}: S=${fsrsCard.stability.toFixed(1)}, next=${fsrsCard.scheduledDays}d`);

  // ── 3. Update ConsistencyScorer ──
  let consistencyStates = user.learningEngines.consistency;
  if (consistencyStates instanceof Map) {
    consistencyStates = Object.fromEntries(consistencyStates);
  }

  let consistencyState = consistencyStates[skillId];
  if (!consistencyState) {
    consistencyState = initializeScore(skillId);
  }

  consistencyState = recordConsistencyAttempt(consistencyState, {
    correct: isCorrect,
    difficulty: categorizeDifficulty(diagnosis.problemInfo?.difficulty || 0),
  });

  consistencyStates[skillId] = consistencyState;
  user.learningEngines.consistency = consistencyStates;

  console.log(`[LearningEngines] SmartScore ${skillId}: ${consistencyState.smartScore}${consistencyState.productiveStruggleDetected ? ' (productive struggle!)' : ''}`);

  // Mark as modified for Mongoose
  user.markModified('learningEngines');
}

module.exports = {
  runPipeline,
  // Re-export for direct access when needed
  observe,
  diagnose,
  decide,
  generate: require('./generate'),
  verify,
  persist,
  MESSAGE_TYPES,
  ACTIONS,
  sidecar: require('./sidecar'),
  // New engines
  evidenceAccumulator: require('./evidenceAccumulator'),
};
