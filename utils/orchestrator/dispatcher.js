// utils/orchestrator/dispatcher.js
// Streams an OrchestratorEnvelope's segments to the client over NDJSON
// (HTTP) or a WebSocket. Owns:
//   - per-segment lifecycle frames
//   - segment-N+1 TTS prefetch while segment-N plays
//   - WAIT timer scheduling on segments that carry one
//   - speech-leads-pen 300ms client offset (advisory metadata only;
//     actual offset is enforced client-side in segmentPlayer.js)
//
// Transport-agnostic: caller passes `{ send(frame), end() }` so this
// module works behind both /api/voice-tutor/process (NDJSON) and the
// existing WebSocket path in voiceSession.js.
//
// Note on TTS: prefetch is currently ADVISORY in this build — we send a
// "prefetch" frame to the client, but actual audio synthesis happens via
// the persistent Cartesia pool that voiceSession already manages. When
// the orchestrator runs alongside voiceSession (the streaming voice
// path), it shares that pool. When it runs behind the HTTP /process
// path (legacy), TTS happens synchronously in the route handler. Both
// paths emit the same frame shape, so segmentPlayer doesn't care.

'use strict';

const ttsProvider = require('../ttsProvider');
const waitTimer = require('./waitTimer');
const logger = require('../logger').child({ module: 'orchestratorDispatcher' });

const SPEECH_LEADS_PEN_MS = 300;

/**
 * Frame protocol — extends voiceTutor's existing 3-phase NDJSON:
 *   {phase:'transcription', transcription}
 *   {phase:'response', response, mathSteps}
 *   {phase:'audio', audioUrl}
 * Adds:
 *   {phase:'envelope', envelope}                  initial envelope (for legacy mathSteps render)
 *   {phase:'segment-start', segmentId, spoken, mode, expectedDurationMs, leadsPenMs}
 *   {phase:'board-op', segmentId, op}             one boardOp at a time
 *   {phase:'segment-audio', segmentId, audioUrl}  audio ready for this segment
 *   {phase:'wait', segmentId, expect, timeoutMs}
 *   {phase:'wait-rung', segmentId, kind, spoken}  hint ladder rung firing
 *   {phase:'segment-end', segmentId}
 *   {phase:'interrupt-ack', segmentId}
 *   {phase:'flushed', segmentIds}
 *   {phase:'turn-end', turnId}
 *   {phase:'error', message}
 */

class Dispatcher {
  /**
   * @param {Object} args
   * @param {{send:(frame:Object)=>void, end:()=>void}} args.transport
   * @param {import('./sessionStore').OrchestratorSession} args.session
   * @param {Object} [args.user]                  For TTS voice resolution
   */
  constructor({ transport, session, user }) {
    this.transport = transport;
    this.session = session;
    this.user = user || null;
    this._closed = false;
  }

  send(frame) {
    if (this._closed) return;
    try { this.transport.send(frame); }
    catch (err) { logger.warn('dispatch send failed', { error: err.message }); }
  }

  end() {
    if (this._closed) return;
    this._closed = true;
    try { this.transport.end(); }
    catch (_) { /* swallow */ }
  }

  /**
   * Stream an envelope. Returns when the queue is drained OR a WAIT was
   * entered (in which case the caller's interrupt handler will resume).
   *
   * @param {import('./types').OrchestratorEnvelope} envelope
   * @param {Object} [opts]
   * @param {Function} [opts.onWait] - (segment) => void — fires when a WAIT segment is reached
   * @param {Function} [opts.onSegmentTTS] - async (segment, abortSignal) => void
   *        Called between board-op dispatch and segment-end. Awaited.
   *        Used by the WS path to drive per-segment Cartesia synthesis
   *        through voiceSession's persistent pool.
   */
  async stream(envelope, opts = {}) {
    if (!envelope || !Array.isArray(envelope.segments)) {
      this.send({ phase: 'error', message: 'invalid envelope' });
      return;
    }

    // Initial envelope frame — gives the client the legacy mathSteps mirror
    // immediately so renderMathSteps() can paint the math board before audio.
    this.send({
      phase: 'envelope',
      envelope: {
        schemaVersion: envelope.schemaVersion,
        turnId: envelope.turnId,
        segments: envelope.segments.map(s => ({
          id: s.id,
          mode: s.mode,
          hasWait: !!s.wait,
          spokenLength: (s.spoken || '').length,
        })),
        mathSteps: envelope.mathSteps || [],
        spoken: envelope.spoken || '',
      },
    });

    this.session.queue = envelope.segments;
    this.session.queueIndex = -1;

    for (let i = 0; i < envelope.segments.length; i++) {
      if (this._closed) break;
      if (this.session.turnAbort?.signal.aborted) break;

      const seg = envelope.segments[i];
      this.session.queueIndex = i;
      this.session.activeSegmentId = seg.id;

      // Register a per-segment AbortController scoped to the turn
      this.session.registerSegmentAbort(seg.id);

      // Pre-fetch hint for the NEXT segment so the client (or the audio
      // pool) can start synthesis early. Advisory only — see header note.
      const nextSeg = envelope.segments[i + 1];
      if (nextSeg) {
        this.send({ phase: 'prefetch-hint', segmentId: nextSeg.id, spoken: nextSeg.spoken || '' });
      }

      this.send({
        phase: 'segment-start',
        segmentId: seg.id,
        spoken: seg.spoken || '',
        mode: seg.mode,
        leadsPenMs: SPEECH_LEADS_PEN_MS,
        expectedDurationMs: seg.expectedDurationMs || estimateSpokenDurationMs(seg.spoken),
      });

      // Stream board ops one at a time so the client can interleave them
      // with TTS pacing. Order is preserved; the client decides timing
      // relative to audio onset (300ms speech-leads-pen).
      for (const op of (seg.boardOps || [])) {
        if (this._closed) break;
        this.send({ phase: 'board-op', segmentId: seg.id, op });
      }

      // Per-segment TTS hook (WS path uses this to drive Cartesia). The
      // hook owns segment audio lifecycle; dispatcher just awaits it.
      // Aborts via the segment's AbortController if the turn is killed.
      if (typeof opts.onSegmentTTS === 'function') {
        const segAc = this.session.segmentAbort.get(seg.id);
        try {
          await opts.onSegmentTTS(seg, segAc?.signal || null);
        } catch (err) {
          if (segAc?.signal?.aborted) {
            // Aborted mid-TTS — emit segment-end so client can clean up
            this.send({ phase: 'segment-end', segmentId: seg.id, aborted: true });
            return;
          }
          logger.warn('onSegmentTTS error', { error: err.message, segmentId: seg.id });
        }
      }

      // If the segment carries a WAIT, schedule the ladder and PAUSE the
      // outer loop. The orchestrator's interrupt handler will either
      // resume (next segment) or replan (new envelope).
      if (seg.wait) {
        const ladder = waitTimer.resolveLadder(seg, seg.emittedUnderPhase || null);
        const ctrl = waitTimer.schedule({
          ladder,
          onRung: (rung) => this.send({
            phase: 'wait-rung',
            segmentId: seg.id,
            kind: rung.kind,
            spoken: rung.spoken,
            boardOps: rung.boardOps || [],
          }),
        });
        this.session.setWaitTimer(ctrl, seg.id);

        this.send({
          phase: 'wait',
          segmentId: seg.id,
          expect: seg.wait.expect || null,
          timeoutMs: ladder[ladder.length - 1]?.delayMs || 30000,
        });
        if (typeof opts.onWait === 'function') {
          try { opts.onWait(seg); } catch (_) { /* swallow */ }
        }
        // Do not advance — caller resumes when student responds.
        return;
      }

      this.send({ phase: 'segment-end', segmentId: seg.id });
    }

    if (!this._closed) {
      this.send({ phase: 'turn-end', turnId: envelope.turnId });
    }
  }

  /** Acknowledge an interrupt to the client. Caller decides what comes after. */
  ackInterrupt(segmentId) {
    this.send({ phase: 'interrupt-ack', segmentId });
  }

  /** Notify the client that segments were flushed (won't be played). */
  notifyFlushed(segmentIds) {
    if (!segmentIds?.length) return;
    this.send({ phase: 'flushed', segmentIds });
  }
}

/**
 * Rough TTS duration estimate. ~150 wpm spoken cadence ≈ 400ms per word.
 * Used only to schedule prefetch hints; doesn't gate playback.
 */
function estimateSpokenDurationMs(spoken) {
  if (!spoken) return 0;
  const words = String(spoken).trim().split(/\s+/).length;
  return words * 400;
}

module.exports = { Dispatcher, SPEECH_LEADS_PEN_MS, estimateSpokenDurationMs };
