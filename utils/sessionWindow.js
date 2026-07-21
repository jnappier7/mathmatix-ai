/**
 * SESSION WINDOW — when a conversation stops being "this session".
 *
 * There was no inactivity boundary at all: the active conversation is chosen by
 * `isActive: true` sorted by updatedAt, and dataRetention only archives after
 * TWELVE MONTHS. So one conversation stayed open indefinitely and resumed
 * whenever the student came back — a session from days ago and today's session
 * were the same document.
 *
 * A beta tester hit this as an apparently-fabricated turn: a "½" they never sent,
 * sitting above the current greeting and treated by the tutor as present context
 * ("your notes"). It was a real turn from a previous session.
 *
 * Stale context is not cosmetic — it feeds the engines. `diagnose()` scans recent
 * assistant messages for the last parseable problem to use as the answer key, so
 * on a conversation spanning days that scan can reach an unrelated session's
 * problem. The whiteboard is scoped to the conversation, so it accumulates work
 * across topics. Summarization and token budgets both degrade on a document that
 * never closes.
 *
 * 30 minutes: long enough to survive a bathroom break or a phone call mid-problem,
 * short enough that "yesterday" is never the same session. It also matches the
 * window routes/parent.js already uses to decide whether a child is working right
 * now, so the two agree by construction rather than by coincidence.
 */

const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * Has this conversation gone idle past the session window?
 *
 * Conservative on missing data: a conversation with no activity timestamp is
 * NOT treated as stale, because rolling a live session by mistake would lose the
 * student's working context mid-problem. Falls back to updatedAt, then the
 * document's own creation time.
 */
function isSessionStale(conversation, now = Date.now()) {
  if (!conversation) return false;
  const last = conversation.lastActivity || conversation.updatedAt || conversation.createdAt;
  if (!last) return false;
  const at = new Date(last).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at > SESSION_IDLE_MS;
}

/** Stamp a conversation as active right now. Safe on a plain object or a doc. */
function touchSession(conversation, now = new Date()) {
  if (!conversation) return conversation;
  conversation.lastActivity = now;
  return conversation;
}

module.exports = { SESSION_IDLE_MS, isSessionStale, touchSession };
