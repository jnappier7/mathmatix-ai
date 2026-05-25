// ============================================================
// sseKeepalive.js — keep an SSE response alive through silent
// stretches by emitting a no-op comment on a fixed interval.
//
// Why this exists
// ---------------
// When the chat pipeline is mid-LLM-call (a typical 5–15s of no
// outbound writes), proxies between Express and the browser
// (Cloudflare, Render's edge, corporate routers) can decide the
// connection is idle and drop it. The TCP socket dies silently;
// the server eventually writes the full response, but the bytes
// have nowhere to go. The client never sees `done` on its reader
// loop and the "thinking…" indicator spins forever.
//
// SSE has a built-in solution: any line starting with ":" is a
// comment, ignored by the EventSource parser and by our hand-
// rolled fetch reader. Writing `": ping\n\n"` every ~15 seconds
// is enough to keep every proxy in the chain happy without
// polluting the application stream.
//
// Usage
// -----
//   const { createKeepalive } = require('../utils/sseKeepalive');
//   // After res.flushHeaders():
//   const ka = createKeepalive(res, { intervalMs: 15000 });
//   ka.start();
//   req.on('close', () => ka.stop());
//   // ... when the response completes:
//   ka.stop();
//   res.end();
//
// The helper is defensive: it stops itself once `res.end()` is
// called and won't write to a finished response. It also catches
// any synchronous write error (broken pipe, etc.) and stops.
// ============================================================

'use strict';

const DEFAULT_INTERVAL_MS = 15 * 1000;
const KEEPALIVE_LINE = ': ping\n\n';

/**
 * Wrap an Express response with a heartbeat writer.
 *
 * @param {import('http').ServerResponse} res
 * @param {Object} [options]
 * @param {number} [options.intervalMs=15000] - heartbeat cadence
 * @param {Function} [options.now=Date.now] - testable clock
 * @param {Function} [options.setInterval=setInterval] - testable scheduler
 * @param {Function} [options.clearInterval=clearInterval]
 * @returns {{ start: Function, stop: Function, isRunning: Function, beatCount: Function }}
 */
function createKeepalive(res, options = {}) {
    const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    const scheduler = options.setInterval || setInterval;
    const canceler = options.clearInterval || clearInterval;

    let timer = null;
    let stopped = false;
    let beats = 0;

    function stop() {
        if (stopped) return;
        stopped = true;
        if (timer) {
            canceler(timer);
            timer = null;
        }
    }

    function tick() {
        if (stopped) return;
        // writableEnded means res.end() was called; writableFinished means
        // the body has been fully flushed. Either way, no more writes are
        // safe — stop here rather than letting Node throw.
        if (!res || res.writableEnded || res.writableFinished || res.destroyed) {
            stop();
            return;
        }
        try {
            res.write(KEEPALIVE_LINE);
            beats++;
        } catch (_) {
            // Broken pipe, ECONNRESET, etc. The response is gone; nothing
            // we can do but stop the timer so we don't keep throwing.
            stop();
        }
    }

    function start() {
        if (timer || stopped) return;
        timer = scheduler(tick, intervalMs);
        // Don't keep the Node event loop alive just for this heartbeat
        // — if the process is otherwise idle, we have bigger problems.
        if (timer && typeof timer.unref === 'function') {
            timer.unref();
        }
    }

    return {
        start,
        stop,
        isRunning: () => !stopped && timer !== null,
        beatCount: () => beats,
    };
}

module.exports = {
    createKeepalive,
    KEEPALIVE_LINE,
    DEFAULT_INTERVAL_MS,
};
