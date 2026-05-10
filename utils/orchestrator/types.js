// utils/orchestrator/types.js
// Schema for the segment orchestrator. Pure JSDoc — no runtime code.
// Extends the voice tutor's {spoken, mathSteps[]} contract additively so
// renderMathSteps() in voice-tutor-session.js keeps working unchanged.

'use strict';

/**
 * @typedef {'vocabulary'|'concept-intro'|'i-do'|'we-do'|'you-do'|'mastery-check'|'prerequisite-review'} Phase
 * Aligned with tutorPlanManager.advanceInstructionPhase phase enum.
 */

/**
 * @typedef {'teacher'|'student'|'collaborative'} Mode
 * Maps to whiteboard.setBoardMode().
 */

/**
 * @typedef {'clarification'|'answer_attempt'|'confusion'|'off_track'|'control'} InterruptLabel
 */

/**
 * @typedef {'pause'|'flush-queue'|'abort-turn'} InterruptTier
 * pause       — preserve queue, may rewind/zoom/disambiguate
 * flush-queue — drop queued segments, replan via pipeline; turn lifecycle continues
 * abort-turn  — fire turn AbortController, end conversational turn entirely
 */

/**
 * @typedef {Object} ExpectSpec
 * @property {'math-equiv'|'choice'|'free-text'|'any'} kind
 * @property {string} [target]           Canonical answer (latex or plain).
 * @property {string[]} [acceptable]     Alternate accepted forms.
 * @property {{vars?: string[], tolerance?: number}} [domain]
 */

/**
 * @typedef {Object} HintRung
 * @property {number} delayMs            Ms since wait start when this rung fires.
 * @property {string} spoken
 * @property {BoardOp[]} [boardOps]
 * @property {'nudge'|'reprompt'|'hint'|'abandon'} kind
 */

/**
 * @typedef {Object} WaitDirective
 * @property {ExpectSpec} [expect]
 * @property {number} [timeoutMs]        Override default ladder.
 * @property {HintRung[]} [hintLadder]   Caller-supplied; defaults applied if omitted.
 */

/**
 * Discriminated union — `op` is the discriminator. inlineTag is the bridge
 * for main-chat's existing tag vocabulary (FUNCTION_GRAPH, ALGEBRA_TILES,
 * UNIT_CIRCLE, WHITEBOARD_WRITE, etc.); structured ops are the migration
 * target for individual tag families.
 *
 * @typedef {(
 *   { op: 'writeStep', id?: string, label?: string, latex: string,
 *     explanation?: string, region?: 'working'|'scratch'|'given'|'answer' }
 *   | { op: 'writeText', text: string, x?: number, y?: number }
 *   | { op: 'graph', fn: string, xRange?: [number,number], yRange?: [number,number] }
 *   | { op: 'algebraTiles', expr: string }
 *   | { op: 'unitCircle', angle?: number }
 *   | { op: 'highlight', objectId: string, color?: string, durationMs?: number }
 *   | { op: 'circleWithQuestion', objectId: string, message: string }
 *   | { op: 'drawArrowToBlank', fromId: string, message: string }
 *   | { op: 'moveToRegion', objectId: string, region: 'working'|'scratch'|'given'|'answer' }
 *   | { op: 'clear' }
 *   | { op: 'inlineTag', raw: string }
 * )} BoardOp
 */

/**
 * One unit of orchestrated playback. Cumulative by default — boardOps add
 * to existing board state unless an `op:'clear'` is included.
 *
 * @typedef {Object} Segment
 * @property {string} id                      ULID-ish; uuid v4 in this build.
 * @property {string} spoken                  TTS payload. May be '' for board-only.
 * @property {Mode} mode
 * @property {BoardOp[]} boardOps
 * @property {WaitDirective} [wait]           Presence => block after this segment.
 * @property {Phase} emittedUnderPhase        Server-stamped pre-phaseEnforcer.
 * @property {number} [expectedDurationMs]    For TTS prefetch scheduling.
 * @property {{onConfusion?: 'pause'|'flush-queue', onAnswerAttempt?: 'evaluate'|'flush-queue'}} [interruptPolicy]
 */

/**
 * Top-level envelope. mathSteps + spoken are auto-derived legacy mirrors
 * that keep voice-tutor-session.js renderMathSteps() and the chat
 * transcript bubble functioning without changes.
 *
 * @typedef {Object} OrchestratorEnvelope
 * @property {'1.0'} schemaVersion
 * @property {string} turnId
 * @property {Segment[]} segments
 * @property {Array<{label?:string, latex:string, explanation?:string}>} [mathSteps]
 * @property {string} [spoken]
 * @property {{kind:'advance'|'stay'|'regress', toPhase?: Phase}} [phaseHint]
 * @property {{generator:'voice'|'chat', pipelineRunId:string}} [meta]
 */

/**
 * What the next pipeline turn sees. Plural — students chain interrupts
 * (interrupt → clarification → "wait, but...") and observe.js needs the
 * full chain, not just the most recent overwrite.
 *
 * @typedef {Object} InterruptionEvent
 * @property {number} seq                     0-indexed within the turn.
 * @property {string} turnId
 * @property {string} segmentId
 * @property {number} atMs                    Playback offset where stopped.
 * @property {number} [atTokenN]
 * @property {InterruptLabel} label
 * @property {number} classifierConfidence
 * @property {'unanimous'|'majority'|'split'} [classifierConsensus]
 * @property {string} studentText
 * @property {{boardObjectId:string, latex?:string}} [referent]
 * @property {ExpectSpec} [pendingExpect]
 * @property {InterruptTier} resolutionTier
 * @property {string[]} flushedSegmentIds
 * @property {string} [evaluatorVerdict]      'correct'|'incorrect'|'cannot-evaluate'
 */

module.exports = {
  PHASES: [
    'prerequisite-review',
    'vocabulary',
    'concept-intro',
    'i-do',
    'we-do',
    'you-do',
    'mastery-check',
  ],
  INTERRUPT_LABELS: ['clarification', 'answer_attempt', 'confusion', 'off_track', 'control'],
  INTERRUPT_TIERS: ['pause', 'flush-queue', 'abort-turn'],
  // Tiebreaker order when 3-vote is split — favors the lower-action label so
  // an ambiguous classification doesn't auto-promote into "abort the turn".
  LABEL_PRIORITY: ['clarification', 'answer_attempt', 'confusion', 'off_track', 'control'],
};
