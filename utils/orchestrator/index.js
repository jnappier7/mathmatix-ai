// utils/orchestrator/index.js
// Segment orchestrator entry point.
//
// Two public operations:
//   handleTurn(input, ctx, dispatcher, opts)
//     - wraps a verified pipeline output (or voice-tutor JSON envelope),
//       runs segmentation + phase enforcement, streams via dispatcher.
//
//   handleInterrupt(studentText, ctx, dispatcher)
//     - aborts current segment, classifies + evaluates in parallel,
//       resolves a tier action, returns a descriptor for what the
//       caller should do next (fast-path response, flush+replan,
//       or abort-turn).
//
// This module never calls runPipeline itself — it consumes verified
// output and returns "next action" descriptors. That keeps it free of
// chat.js / voiceTutor.js concerns and lets both surfaces share it.

'use strict';

const segmentationLayer = require('./segmentationLayer');
const phaseEnforcer = require('./phaseEnforcer');
const sessionStore = require('./sessionStore');
const { classify } = require('./interruptClassifier');
const { evaluate } = require('./answerEvaluator');
const { pickDisambiguator } = require('./disambiguator');
const voiceMetrics = require('../voiceMetrics');
const logger = require('../logger').child({ module: 'orchestrator' });

sessionStore.startSweep();

// ── Tier resolution ─────────────────────────────────────────────────
// The 3-tier action ladder (pause / flush-queue / abort-turn) keyed by
// (label, confidence, phase). Mastery-check is a special case — even
// the "always soft except for control" hard rule has to bend there.

/**
 * @param {{label:string, confidence:number}} c        Classifier result
 * @param {{verdict:string, confidence:number}} e      Evaluator result
 * @param {string|null} phase
 * @returns {'pause'|'flush-queue'|'abort-turn'}
 */
function decideTier(c, e, phase) {
  if (c.label === 'control') return 'abort-turn';

  if (phase === 'mastery-check' && c.label === 'answer_attempt') {
    // Mastery items are definitive — answer ends the WAIT, item is
    // recorded, and we move on regardless of correct/incorrect.
    return 'flush-queue';
  }

  if (c.label === 'confusion' && c.confidence >= 0.9) {
    // High-confidence confusion mid-lesson means the queue is wrong
    // for this student. Replan instead of pushing more confusing content.
    return 'flush-queue';
  }

  return 'pause';
}

/**
 * Decide what to do once we're paused. The "soft override" matrix from
 * v1.1: classifier + evaluator both fire, evaluator wins routing in
 * the 0.55–0.80 confidence band when expect was present.
 *
 * @returns {{action:'fast-path-clarification'|'paused-advance'|'paused-retry'|'paused-disambiguator', spoken?:string}}
 */
function decidePauseResolution(c, e, phase) {
  // Answer attempts during instruction phases: skip-ahead if correct
  if (c.label === 'answer_attempt') {
    if (e.verdict === 'correct') {
      // High classifier conf OR mid-band: evaluator agrees — skip i-do
      return { action: 'paused-advance' };
    }
    if (e.verdict === 'incorrect') {
      return { action: 'paused-retry' };
    }
    // cannot-evaluate
    if (c.confidence < 0.55) {
      return {
        action: 'paused-disambiguator',
        spoken: pickDisambiguator({ phase }),
      };
    }
    return { action: 'paused-retry' };
  }

  if (c.label === 'clarification') {
    return { action: 'fast-path-clarification' };
  }

  if (c.label === 'confusion') {
    return { action: 'paused-retry' };
  }

  if (c.label === 'off_track') {
    return { action: 'paused-disambiguator',
      spoken: 'I hear you — want to come back to this in a sec, or pivot now?' };
  }

  // Below thresholds, fall back to disambiguator
  return {
    action: 'paused-disambiguator',
    spoken: pickDisambiguator({ phase }),
  };
}

// ── handleTurn ──────────────────────────────────────────────────────

/**
 * Stream an already-verified pipeline output to the client.
 *
 * @param {Object} input
 * @param {'voice'|'pipeline'} input.kind
 * @param {Object} input.verified              When kind='pipeline': verify() return.
 * @param {Object} input.voiceJson             When kind='voice': {spoken, mathSteps[]}.
 * @param {Object} ctx
 * @param {string} ctx.sessionId
 * @param {string} ctx.userId
 * @param {string} [ctx.expectedPhase]         tutorPlan.currentTarget.instructionPhase
 * @param {Object} [ctx.activeTarget]          {prompt, expect, masteryPrompt} for phaseEnforcer rewrites
 * @param {Object} dispatcher                  Built by route handler
 * @returns {Promise<{turnId:string, segmentsPlayed:number, paused:boolean}>}
 */
async function handleTurn(input, ctx, dispatcher) {
  const session = sessionStore.getOrCreate(ctx.sessionId, ctx.userId);
  const turnSignal = session.startTurn(/* turnId set below */);

  let envelope;
  if (input.kind === 'voice') {
    envelope = segmentationLayer.fromVoiceTutorJSON(input.voiceJson, {
      expectedPhase: ctx.expectedPhase,
      generator: 'voice',
    });
  } else if (input.kind === 'pipeline') {
    envelope = segmentationLayer.fromPipelineVerified(input.verified, {
      expectedPhase: ctx.expectedPhase,
      generator: 'chat',
    });
  } else {
    dispatcher.send({ phase: 'error', message: `unknown input kind: ${input.kind}` });
    return { turnId: null, segmentsPlayed: 0, paused: false };
  }

  session.currentTurnId = envelope.turnId;

  // Phase enforcement — strip silently, log strip rate.
  const { envelope: rewritten, strips } = phaseEnforcer.rewrite(envelope, {
    expectedPhase: ctx.expectedPhase || null,
    activeTarget: ctx.activeTarget || null,
  });
  for (const s of strips) {
    logger.info('phase_strip', { ...s, sessionId: ctx.sessionId, expectedPhase: ctx.expectedPhase });
    voiceMetrics.recordPhaseStrip?.(ctx.expectedPhase, s.from, s.to);
  }

  let paused = false;
  await dispatcher.stream(rewritten, {
    onWait: () => { paused = true; },
  });

  return {
    turnId: envelope.turnId,
    segmentsPlayed: paused ? session.queueIndex + 1 : rewritten.segments.length,
    paused,
  };
}

// ── handleInterrupt ─────────────────────────────────────────────────

/**
 * Process a student utterance that arrived mid-turn. Aborts current
 * segment audio, classifies, evaluates against any pending expect,
 * decides a tier action, returns a descriptor.
 *
 * The CALLER is responsible for:
 *   - actually issuing audio.pause() on the client (the client did this
 *     locally on VAD onset; this method just acknowledges)
 *   - running a new pipeline pass when result.needsPipelinePass=true,
 *     passing result.previousInterruption into ctx.previousInterruptions
 *
 * @param {string} studentText
 * @param {Object} ctx
 * @param {string} ctx.sessionId
 * @param {string} [ctx.expectedPhase]
 * @param {string} [ctx.expectedMode]
 * @param {number} [ctx.atMs]                  playback offset where stopped
 * @param {Object} dispatcher
 * @returns {Promise<{
 *   resolution: 'fast-path'|'paused-advance'|'paused-retry'|'paused-disambiguator'|'flush-queue'|'abort-turn',
 *   envelope?: import('./types').OrchestratorEnvelope,
 *   needsPipelinePass?: boolean,
 *   previousInterruption: import('./types').InterruptionEvent,
 *   nextPhaseHint?: string
 * }>}
 */
async function handleInterrupt(studentText, ctx, dispatcher) {
  const session = sessionStore.get(ctx.sessionId);
  if (!session) {
    return {
      resolution: 'abort-turn',
      previousInterruption: buildEvent({ ctx, studentText, label: 'control', conf: 1, tier: 'abort-turn' }),
    };
  }

  // Abort the active segment + clear any wait timer immediately
  if (session.activeSegmentId) {
    session.abortSegment(session.activeSegmentId, 'student_interrupt');
  }
  session.clearWaitTimer();

  // Tell the client we got it. (Client likely already paused locally.)
  dispatcher.ackInterrupt(session.activeSegmentId);

  // Pull context for classifier + evaluator
  const activeSeg = session.queue[session.queueIndex] || null;
  const lastBoardOpType = pickLastBoardOpType(activeSeg);
  const pendingExpect = activeSeg?.wait?.expect || null;

  // Run classifier + evaluator in parallel
  const [c, e] = await Promise.all([
    classify(studentText, {
      currentPhase: ctx.expectedPhase,
      currentMode: ctx.expectedMode,
      lastSegmentSpoken: activeSeg?.spoken,
      lastBoardOpType,
    }).catch(err => {
      logger.warn('classify failed', { error: err.message });
      return { label: 'clarification', confidence: 0.4, source: 'fallback', consensus: 'split' };
    }),
    Promise.resolve(evaluate(studentText, pendingExpect)),
  ]);

  voiceMetrics.recordClassifierConsensus?.(c.consensus || 'unanimous');

  const tier = decideTier(c, e, ctx.expectedPhase);
  const referent = pickReferent(activeSeg, lastBoardOpType);

  const event = buildEvent({
    ctx, studentText, label: c.label, conf: c.confidence,
    consensus: c.consensus, tier, referent,
    pendingExpect, evaluatorVerdict: e.verdict,
  });
  session.appendInterruption(event);

  if (tier === 'abort-turn') {
    session.flushQueue('control');
    dispatcher.send({ phase: 'turn-end', turnId: session.currentTurnId, reason: 'control' });
    return {
      resolution: 'abort-turn',
      previousInterruption: event,
    };
  }

  if (tier === 'flush-queue') {
    const flushed = session.flushQueue('replan');
    event.flushedSegmentIds = flushed;
    dispatcher.notifyFlushed(flushed);
    return {
      resolution: 'flush-queue',
      needsPipelinePass: true,
      previousInterruption: event,
    };
  }

  // tier === 'pause'
  const resolution = decidePauseResolution(c, e, ctx.expectedPhase);

  if (resolution.action === 'fast-path-clarification') {
    // Fast path: if the active segment carries an `explanation`, we can
    // answer locally with a one-segment envelope. Hits the 600ms ack
    // budget without a pipeline pass.
    const explanation = pickExplanationFromSegment(activeSeg, lastBoardOpType);
    if (explanation) {
      const env = segmentationLayer.buildClarificationSegment({
        explanation,
        referentObjectId: referent?.boardObjectId,
        turnId: session.currentTurnId,
      });
      return {
        resolution: 'fast-path',
        envelope: env,
        needsPipelinePass: false,
        previousInterruption: event,
      };
    }
    // No explanation available — emit a thinking-ack now and signal
    // caller to run the pipeline for a substantive response.
    return {
      resolution: 'paused-disambiguator',
      envelope: segmentationLayer.buildThinkingAck({ turnId: session.currentTurnId }),
      needsPipelinePass: true,
      previousInterruption: event,
    };
  }

  if (resolution.action === 'paused-advance') {
    // Student answered correctly mid-instruction — skip ahead.
    // Caller will read previousInterruption.evaluatorVerdict='correct'
    // and pass it to advanceInstructionPhase.
    return {
      resolution: 'paused-advance',
      needsPipelinePass: true,
      previousInterruption: event,
      nextPhaseHint: 'advance',
    };
  }

  if (resolution.action === 'paused-retry') {
    return {
      resolution: 'paused-retry',
      needsPipelinePass: true,
      previousInterruption: event,
    };
  }

  // paused-disambiguator
  const env = {
    schemaVersion: '1.0',
    turnId: session.currentTurnId,
    segments: [{
      id: `seg_disambig_${Date.now().toString(36)}`,
      spoken: resolution.spoken || pickDisambiguator({ phase: ctx.expectedPhase }),
      mode: 'teacher',
      boardOps: [],
      emittedUnderPhase: ctx.expectedPhase || null,
      wait: { expect: { kind: 'free-text' }, timeoutMs: 30000 },
    }],
    mathSteps: [],
    spoken: resolution.spoken,
    meta: { generator: 'voice', pipelineRunId: 'disambiguator' },
  };
  return {
    resolution: 'paused-disambiguator',
    envelope: env,
    needsPipelinePass: false,
    previousInterruption: event,
  };
}

// ── helpers ─────────────────────────────────────────────────────────

function buildEvent({ ctx, studentText, label, conf, consensus, tier, referent, pendingExpect, evaluatorVerdict }) {
  const session = sessionStore.get(ctx.sessionId);
  const seq = session?.interruptionChain?.length || 0;
  return {
    seq,
    turnId: session?.currentTurnId || null,
    segmentId: session?.activeSegmentId || null,
    atMs: ctx.atMs || 0,
    label,
    classifierConfidence: conf,
    classifierConsensus: consensus,
    studentText,
    referent: referent || undefined,
    pendingExpect: pendingExpect || undefined,
    resolutionTier: tier,
    flushedSegmentIds: [],
    evaluatorVerdict: evaluatorVerdict || undefined,
  };
}

function pickLastBoardOpType(seg) {
  if (!seg?.boardOps?.length) return null;
  const ops = seg.boardOps;
  return ops[ops.length - 1].op || null;
}

function pickExplanationFromSegment(seg, lastBoardOpType) {
  if (!seg?.boardOps?.length) return null;
  // Prefer the most recent writeStep with explanation
  for (let i = seg.boardOps.length - 1; i >= 0; i--) {
    const op = seg.boardOps[i];
    if (op.op === 'writeStep' && op.explanation) return op.explanation;
  }
  return null;
}

function pickReferent(seg, lastBoardOpType) {
  if (!seg?.boardOps?.length) return null;
  for (let i = seg.boardOps.length - 1; i >= 0; i--) {
    const op = seg.boardOps[i];
    if (op.id) return { boardObjectId: op.id, latex: op.latex };
    if (op.op === 'writeStep' && op.latex) return { boardObjectId: null, latex: op.latex };
  }
  return null;
}

module.exports = {
  handleTurn,
  handleInterrupt,
  decideTier,
  decidePauseResolution,
  // Re-exports for testing / advanced wiring
  segmentationLayer,
  phaseEnforcer,
  sessionStore,
};
