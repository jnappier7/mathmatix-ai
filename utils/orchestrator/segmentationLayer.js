// utils/orchestrator/segmentationLayer.js
// Converts pipeline / voice-tutor verified output into the orchestrator
// envelope shape. Two input flavors:
//
//   1. Voice tutor JSON  — already-structured {spoken, mathSteps[]} from
//      routes/voiceTutor.js. Becomes one segment per "natural break"
//      (sentence boundary or step boundary, whichever is coarser).
//
//   2. Pipeline verify output — text + visualCommands.{whiteboard,
//      algebraTiles, ...}[]. Each visualCommand item becomes a boardOp;
//      legacy inline tags survive as op:'inlineTag' so the existing
//      visualTeachingHandler.js client code keeps working unchanged.
//      (See plan §4 — bridge decision.)
//
// Backward compat: top-level `mathSteps` and `spoken` are auto-derived
// from segments[] so renderMathSteps() in voice-tutor-session.js gets
// the same shape it expects today.

'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../logger').child({ module: 'segmentationLayer' });

const SCHEMA_VERSION = '1.0';

function newTurnId() { return `turn_${uuidv4().slice(0, 12)}`; }
function newSegmentId() { return `seg_${uuidv4().slice(0, 12)}`; }

// ── Input variant 1: voice tutor JSON envelope ──────────────────────

/**
 * Convert {spoken, mathSteps[]} to an OrchestratorEnvelope.
 *
 * Heuristic: split spoken into sentences; pair sentences with mathSteps
 * by index when counts roughly align, otherwise fold all steps into the
 * first segment. The voice tutor today emits 1-2 sentences and 1-3 steps
 * per turn so most calls produce 1 segment.
 *
 * @param {Object} voiceOutput
 * @param {string} voiceOutput.spoken
 * @param {Array<{label?:string, latex:string, explanation?:string}>} [voiceOutput.mathSteps]
 * @param {Object} [opts]
 * @param {string} [opts.expectedPhase]
 * @param {string} [opts.mode='teacher']
 * @param {string} [opts.generator='voice']
 * @param {string} [opts.pipelineRunId]
 * @returns {import('./types').OrchestratorEnvelope}
 */
function fromVoiceTutorJSON(voiceOutput, opts = {}) {
  const spoken = (voiceOutput?.spoken || '').trim();
  const steps = Array.isArray(voiceOutput?.mathSteps) ? voiceOutput.mathSteps : [];
  const turnId = opts.turnId || newTurnId();

  // Always produce exactly one segment for now. Mid-turn splitting is a
  // v1.1 optimization that doesn't change correctness — the client plays
  // segments back-to-back either way.
  const segment = {
    id: newSegmentId(),
    spoken,
    mode: opts.mode || 'teacher',
    boardOps: steps
      .filter(s => s && s.latex)
      .map(s => ({
        op: 'writeStep',
        label: s.label || undefined,
        latex: s.latex,
        explanation: s.explanation || undefined,
      })),
    emittedUnderPhase: opts.expectedPhase || null,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    turnId,
    segments: [segment],
    mathSteps: deriveLegacyMathSteps([segment]),
    spoken: deriveLegacySpoken([segment]),
    meta: {
      generator: opts.generator || 'voice',
      pipelineRunId: opts.pipelineRunId || turnId,
    },
  };
}

// ── Input variant 2: pipeline verify output ─────────────────────────

/**
 * Convert pipeline verify() result into an OrchestratorEnvelope. The
 * inline-tag bridge (§4 of plan): unrecognized command shapes pass
 * through as op:'inlineTag' so the client's existing visualTeachingHandler
 * can still consume them.
 *
 * @param {Object} verified                    Output of pipeline verify()
 * @param {string} verified.text
 * @param {Object} [verified.visualCommands]   {whiteboard:[], algebraTiles:[], ...}
 * @param {Object} [opts]
 * @returns {import('./types').OrchestratorEnvelope}
 */
function fromPipelineVerified(verified, opts = {}) {
  const text = (verified?.text || '').trim();
  const turnId = opts.turnId || newTurnId();

  const boardOps = [];

  const vc = verified?.visualCommands || {};

  for (const wb of (vc.whiteboard || [])) {
    boardOps.push(mapWhiteboardCommandToBoardOp(wb));
  }
  for (const at of (vc.algebraTiles || [])) {
    boardOps.push({ op: 'algebraTiles', expr: at.expr || at.expression || '' });
  }
  // Manipulatives + images carry through as inlineTag for now — the
  // client renderer for those is hooked up via visualTeachingHandler.
  for (const m of (vc.manipulatives || [])) {
    boardOps.push({ op: 'inlineTag', raw: JSON.stringify({ kind: 'manipulative', ...m }) });
  }
  for (const i of (vc.images || [])) {
    boardOps.push({ op: 'inlineTag', raw: JSON.stringify({ kind: 'image', ...i }) });
  }

  // Filter out any falsy mappings (mapWhiteboardCommandToBoardOp returns
  // null when shape is unrecognized; we'd rather drop than corrupt).
  const cleanedOps = boardOps.filter(Boolean);

  const segment = {
    id: newSegmentId(),
    spoken: text,
    mode: opts.mode || 'teacher',
    boardOps: cleanedOps,
    emittedUnderPhase: opts.expectedPhase || null,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    turnId,
    segments: [segment],
    mathSteps: deriveLegacyMathSteps([segment]),
    spoken: deriveLegacySpoken([segment]),
    meta: {
      generator: opts.generator || 'chat',
      pipelineRunId: opts.pipelineRunId || turnId,
    },
  };
}

/**
 * Map one entry from visualCommands.whiteboard[] (as produced by
 * utils/visualTeachingParser.js) to a BoardOp. Unrecognized shapes fall
 * back to inlineTag so we don't drop content.
 */
function mapWhiteboardCommandToBoardOp(wb) {
  if (!wb || typeof wb !== 'object') return null;
  switch (wb.type) {
    case 'write':
      return { op: 'writeText', text: String(wb.text || '') };
    case 'equation':
      return { op: 'writeStep', latex: String(wb.latex || '') };
    case 'clear':
      return { op: 'clear' };
    case 'drawing':
      // Drawing sequences are complex — keep as inlineTag for now;
      // visualTeachingHandler.js renders them via the existing path.
      return { op: 'inlineTag', raw: JSON.stringify({ kind: 'drawing', sequence: wb.sequence }) };
    case 'triangle_problem':
      return { op: 'inlineTag', raw: JSON.stringify({ kind: 'triangle_problem', angles: wb.angles }) };
    default:
      // Unknown but well-formed: bridge through inlineTag
      return { op: 'inlineTag', raw: JSON.stringify(wb) };
  }
}

// ── Legacy mirror derivation ────────────────────────────────────────

function deriveLegacyMathSteps(segments) {
  const out = [];
  for (const seg of segments) {
    for (const op of (seg.boardOps || [])) {
      if (op.op === 'writeStep' && op.latex) {
        out.push({
          label: op.label,
          latex: op.latex,
          explanation: op.explanation,
        });
      }
    }
  }
  return out;
}

function deriveLegacySpoken(segments) {
  return segments.map(s => s.spoken || '').filter(Boolean).join(' ').trim();
}

// ── Synthesizing fast-path clarification segments ───────────────────

/**
 * Build a one-segment envelope for a fast-path clarification answer.
 * Used when the orchestrator can answer an interrupt locally without
 * re-running the pipeline (segment had a populated `explanation` field).
 */
function buildClarificationSegment({ explanation, referentObjectId, turnId }) {
  const segment = {
    id: newSegmentId(),
    spoken: `Good question — ${explanation}`.trim(),
    mode: 'teacher',
    boardOps: referentObjectId
      ? [{ op: 'highlight', objectId: referentObjectId, durationMs: 2000 }]
      : [],
    emittedUnderPhase: null,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    turnId: turnId || newTurnId(),
    segments: [segment],
    mathSteps: [],
    spoken: segment.spoken,
    meta: { generator: 'voice', pipelineRunId: 'fast-path-clarification' },
  };
}

/**
 * Build a one-segment "thinking ack" envelope. Plays while a slower
 * substantive response is being generated. Keeps the acknowledgment
 * latency budget within 600ms even when the substantive budget can't be.
 */
function buildThinkingAck({ turnId, phrase }) {
  const phrases = [
    'Good question, hold on a sec.',
    'Let me think about that.',
    'One sec — let me show you.',
  ];
  const spoken = phrase || phrases[Math.floor(Math.random() * phrases.length)];
  const segment = {
    id: newSegmentId(),
    spoken,
    mode: 'teacher',
    boardOps: [],
    emittedUnderPhase: null,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    turnId: turnId || newTurnId(),
    segments: [segment],
    mathSteps: [],
    spoken,
    meta: { generator: 'voice', pipelineRunId: 'thinking-ack' },
  };
}

module.exports = {
  SCHEMA_VERSION,
  newTurnId,
  newSegmentId,
  fromVoiceTutorJSON,
  fromPipelineVerified,
  buildClarificationSegment,
  buildThinkingAck,
  deriveLegacyMathSteps,
  deriveLegacySpoken,
  mapWhiteboardCommandToBoardOp,
};
