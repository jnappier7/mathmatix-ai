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
    console.log(`[Pipeline] Mood: ${sessionMood.trajectory} (energy: ${sessionMood.energy}, momentum: ${sessionMood.momentum}${sessionMood.inFlow ? ', IN FLOW' : ''}${sessionMood.fatigueSignal ? ', FATIGUE' : ''})`);
  }

  // ── Stage 3: DECIDE ──
  const decision = decide(observation, diagnosis, {
    phaseState: ctx.phaseState || null,
    activeSkill: ctx.activeSkill || null,
    sessionMood,
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
  });

  console.log(`[Pipeline] Verify: ${verified.flags.length > 0 ? verified.flags.join(', ') : 'clean'}`);

  // ── Merge LLM signals into sidecar ──
  mergeLlmSignals(sidecar, verified.extracted);
  const signalStats = getSignalStats(sidecar);
  console.log(`[Pipeline] Sidecar: ${signalStats.total} signals (${signalStats.pipelineDerived} deterministic, ${signalStats.llmEmitted} from LLM)`);

  // ── Stage 6: PERSIST ──
  const aiProcessingSeconds = Math.ceil((Date.now() - (ctx.aiProcessingStartTime || startTime)) / 1000);

  const persistResults = await persist({
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
  });

  const pipelineTime = Date.now() - startTime;
  console.log(`[Pipeline] Complete in ${pipelineTime}ms (observe→diagnose→decide→generate→verify→persist)`);

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
      timeMs: pipelineTime,
    },
  };
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
};
