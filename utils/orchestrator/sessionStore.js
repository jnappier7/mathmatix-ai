// utils/orchestrator/sessionStore.js
// In-memory session registry for the segment orchestrator. Per the v1.1
// plan: no Redis, no Mongo for hot path. Lost on restart is acceptable
// because clients rehydrate from conversation history breadcrumbs (see
// dispatcher.js + index.js).
//
// One Session per (sessionId) — keyed the same way voiceSession.js
// registers active sessions, so lookups across the two layers can share
// the same id space.

'use strict';

const logger = require('../logger').child({ module: 'orchestratorSessionStore' });

const IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** @type {Map<string, OrchestratorSession>} */
const sessions = new Map();

class OrchestratorSession {
  constructor(sessionId, userId) {
    this.sessionId = sessionId;
    this.userId = String(userId || '');
    this.createdAt = Date.now();
    this.lastTouched = Date.now();

    // Turn-scope AbortController. Aborting this fires segmentAbort children
    // implicitly via signal propagation when the turn dies. Re-created per turn.
    this.turnAbort = null;
    this.currentTurnId = null;

    /** @type {Map<string, AbortController>} */
    this.segmentAbort = new Map();
    /** @type {Map<string, AbortController>} */
    this.ttsPrefetch = new Map();

    /** @type {import('./types').Segment[]} */
    this.queue = [];
    /** @type {number} */
    this.queueIndex = 0;
    /** @type {string|null} segment id currently in TTS or playback */
    this.activeSegmentId = null;

    // The interrupt chain for the active turn. Cleared when a new turn
    // starts. The pipeline reads this on the NEXT turn via
    // ctx.previousInterruptions.
    /** @type {import('./types').InterruptionEvent[]} */
    this.interruptionChain = [];

    this.waitTimer = null;          // setTimeout handle for current WAIT
    this.waitStartedAt = null;
    this.waitSegmentId = null;

    // Last persisted segment-end breadcrumb — written on every segment
    // boundary so a client reconnect can rehydrate where playback left off.
    this.lastBreadcrumb = null;

    // Telemetry: when this turn started speaking — used to compute the
    // ack/substantive split metrics on interrupt.
    this.turnStartedAt = null;
    this.firstAudioAt = null;
  }

  touch() {
    this.lastTouched = Date.now();
  }

  /** Begin a new turn. Aborts any prior turn cleanly. */
  startTurn(turnId) {
    if (this.turnAbort) {
      try { this.turnAbort.abort('superseded'); } catch (_) { /* node version variance */ }
    }
    this.turnAbort = new AbortController();
    this.currentTurnId = turnId;
    this.queue = [];
    this.queueIndex = 0;
    this.activeSegmentId = null;
    this.segmentAbort.clear();
    this.ttsPrefetch.clear();
    this.interruptionChain = [];
    this.clearWaitTimer();
    this.turnStartedAt = Date.now();
    this.firstAudioAt = null;
    this.touch();
    return this.turnAbort.signal;
  }

  registerSegmentAbort(segmentId) {
    const ac = new AbortController();
    this.segmentAbort.set(segmentId, ac);
    // If the parent turn aborts, cascade to the segment.
    if (this.turnAbort) {
      const onTurnAbort = () => { try { ac.abort('turn_abort'); } catch (_) {} };
      if (this.turnAbort.signal.aborted) onTurnAbort();
      else this.turnAbort.signal.addEventListener('abort', onTurnAbort, { once: true });
    }
    return ac;
  }

  abortSegment(segmentId, reason = 'segment_abort') {
    const ac = this.segmentAbort.get(segmentId);
    if (!ac) return false;
    try { ac.abort(reason); } catch (_) { /* swallow */ }
    return true;
  }

  abortPrefetch(segmentId, reason = 'prefetch_abort') {
    const ac = this.ttsPrefetch.get(segmentId);
    if (!ac) return false;
    try { ac.abort(reason); } catch (_) { /* swallow */ }
    this.ttsPrefetch.delete(segmentId);
    return true;
  }

  /** Flush remaining queued segments — drops everything past queueIndex. */
  flushQueue(reason = 'flush') {
    const flushed = this.queue.slice(this.queueIndex + 1).map(s => s.id);
    // Abort prefetches for flushed segments
    for (const id of flushed) this.abortPrefetch(id, reason);
    this.queue = this.queue.slice(0, this.queueIndex + 1);
    return flushed;
  }

  setWaitTimer(handle, segmentId) {
    this.clearWaitTimer();
    this.waitTimer = handle;
    this.waitStartedAt = Date.now();
    this.waitSegmentId = segmentId;
  }

  clearWaitTimer() {
    if (this.waitTimer) {
      try { clearTimeout(this.waitTimer); } catch (_) {}
      try { clearInterval(this.waitTimer); } catch (_) {}
    }
    this.waitTimer = null;
    this.waitStartedAt = null;
    this.waitSegmentId = null;
  }

  appendInterruption(event) {
    this.interruptionChain.push(event);
    if (this.interruptionChain.length > 5) {
      this.interruptionChain = this.interruptionChain.slice(-5);
    }
  }

  /** Tear down everything. Idempotent. */
  shutdown(reason = 'shutdown') {
    if (this.turnAbort) {
      try { this.turnAbort.abort(reason); } catch (_) {}
    }
    for (const ac of this.segmentAbort.values()) {
      try { ac.abort(reason); } catch (_) {}
    }
    for (const ac of this.ttsPrefetch.values()) {
      try { ac.abort(reason); } catch (_) {}
    }
    this.segmentAbort.clear();
    this.ttsPrefetch.clear();
    this.clearWaitTimer();
    this.queue = [];
  }
}

/** @param {string} sessionId @param {string} userId */
function getOrCreate(sessionId, userId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = new OrchestratorSession(sessionId, userId);
    sessions.set(sessionId, s);
  }
  s.touch();
  return s;
}

function get(sessionId) {
  const s = sessions.get(sessionId);
  if (s) s.touch();
  return s || null;
}

function destroy(sessionId, reason = 'destroy') {
  const s = sessions.get(sessionId);
  if (!s) return false;
  s.shutdown(reason);
  sessions.delete(sessionId);
  return true;
}

function size() { return sessions.size; }

// Idle sweep — evict sessions inactive longer than IDLE_TTL_MS. Runs
// only when something has registered with the store, so test/import-only
// usage doesn't keep a process alive.
let sweepHandle = null;
function startSweep() {
  if (sweepHandle) return;
  sweepHandle = setInterval(() => {
    const cutoff = Date.now() - IDLE_TTL_MS;
    for (const [id, s] of sessions.entries()) {
      if (s.lastTouched < cutoff) {
        logger.info('evict idle orchestrator session', { sessionId: id, userId: s.userId });
        s.shutdown('idle_evict');
        sessions.delete(id);
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweepHandle.unref?.();
}
function stopSweep() {
  if (sweepHandle) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
}

module.exports = {
  OrchestratorSession,
  getOrCreate,
  get,
  destroy,
  size,
  startSweep,
  stopSweep,
};
