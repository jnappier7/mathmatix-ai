// utils/lifecycle.js — process lifecycle state.
//
// The single source of truth for "should this instance be receiving traffic?".
// GET /api/health reads it, and Render's load balancer polls that endpoint to
// decide when to route to a NEW instance and when to stop routing to an OLD one.
//
// This exists because both edges of a deploy were serving 502s:
//
//   BOOT  — server.js calls app.listen() without awaiting connectDatabase(), so
//           the port is open (and /api/health answered 200 'degraded') seconds
//           before Mongo is up. Render cut traffic over to an instance whose
//           connect-mongo session store had no connection, so every request sat
//           in the session middleware until the proxy gave up. Now the instance
//           reports 503 until the DB has connected at least once.
//
//   DRAIN — SIGTERM used to call server.close() immediately, which stops
//           accepting connections while Render's proxy is still routing to us.
//           Now SIGTERM only flips this state; health goes 503, the proxy takes
//           us out of rotation, and we keep serving normally for the drain
//           window before actually closing. See gracefulShutdown in server.js.
//
// READY is a one-way door out of STARTING: a Mongo blip on a live instance must
// NOT drop it out of rotation (mongoose auto-reconnects, and a restart would be
// far more disruptive than a few degraded seconds), and a late reconnect during
// shutdown must never flip a draining instance back to ready.

const STATES = {
  STARTING: 'starting',
  READY: 'ready',
  DRAINING: 'draining',
};

let state = STATES.STARTING;

/** Promote to READY. Only ever moves STARTING -> READY (see note above). */
function markReady() {
  if (state === STATES.STARTING) state = STATES.READY;
}

/** Enter the drain window. Terminal — nothing moves the state after this. */
function markDraining() {
  state = STATES.DRAINING;
}

function getState() {
  return state;
}

/** True only in READY. Both STARTING and DRAINING must fail the health check. */
function isAcceptingTraffic() {
  return state === STATES.READY;
}

/** Test-only: reset back to STARTING. */
function _reset() {
  state = STATES.STARTING;
}

module.exports = { STATES, markReady, markDraining, getState, isAcceptingTraffic, _reset };
