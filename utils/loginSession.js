/**
 * LOGIN SESSION — which sign-in a conversation belongs to.
 *
 * `utils/sessionWindow.js` answers "has this conversation gone idle?". That is
 * necessary but not sufficient: the owner's continuity policy (2026-07-28) is
 * stated in terms of LOGINS, not clock time.
 *
 *   1. Returning from voice mode continues the chat exactly where it left off.
 *   2. A NEW login does not resume the old transcript.
 *   3. Entering a course chat starts fresh unless it's within the same login.
 *
 * The idle window can't express (2) or (3). The failure that motivated this was
 * a course view holding three or four sittings at once — duplicate assistant
 * bubbles, 12:02 AM messages rendered above a 12:24 AM continuation. Twenty-two
 * minutes apart, so the 30-minute window never fired; they were different
 * logins, and nothing in the system knew that.
 *
 * The marker is a random id stored on `req.session`. Passport regenerates the
 * express session on every `req.logIn()` (see passport's SessionManager — it is
 * unconditional session-fixation defence), so a fresh login always arrives with
 * an empty session and mints a new id here. That means we do NOT have to stamp
 * every login path — local, the three OAuth strategies, signup auto-login and
 * anything added later all get a new marker for free.
 *
 * Conversations carry the marker they were opened under (`loginSessionId`).
 * Comparing the two is the whole mechanism.
 *
 * UNMARKED CONVERSATIONS ARE ADOPTED, NOT ROLLED. A conversation written before
 * this shipped — or by a path with no HTTP session to read (a voice socket that
 * lost its session, a script) — has no marker. Treating that as "foreign" would
 * throw away a live session on deploy day and on every unmarked write. Instead
 * the first request that sees one claims it for the current login; the next
 * login then finds a marker that doesn't match and rolls correctly. One extra
 * sitting of carry-over, then the policy holds.
 */

const crypto = require('crypto');
const { isSessionStale } = require('./sessionWindow');

const LOGIN_SESSION_KEY = 'loginSessionId';

/**
 * The current login's marker, minting one if this session doesn't have it yet.
 * Safe to call on any authenticated request; returns null when there is no
 * session at all (unauthenticated, or a non-HTTP caller).
 */
function getLoginSessionId(req) {
    const session = req && req.session;
    if (!session) return null;
    const existing = session[LOGIN_SESSION_KEY];
    if (typeof existing === 'string' && existing.length > 0) return existing;
    const minted = crypto.randomUUID();
    session[LOGIN_SESSION_KEY] = minted;
    return minted;
}

/**
 * Read the marker WITHOUT minting one. Use this off the WebSocket upgrade
 * request: a voice socket has a session object but no response to flush, so a
 * mint there would be lost anyway — and voice must never be the path that
 * decides a session boundary (rule 1).
 */
function peekLoginSessionId(req) {
    const session = req && req.session;
    if (!session) return null;
    const existing = session[LOGIN_SESSION_KEY];
    return (typeof existing === 'string' && existing.length > 0) ? existing : null;
}

/**
 * Does this conversation belong to a DIFFERENT login than the one asking?
 *
 * False whenever either side is unknown — see the adoption note in the header.
 * An unmarked conversation is claimable, not foreign.
 */
function isForeignLoginSession(conversation, loginSessionId) {
    if (!conversation || !loginSessionId) return false;
    const stored = conversation.loginSessionId;
    if (!stored) return false;
    return String(stored) !== String(loginSessionId);
}

/**
 * Claim an unmarked conversation for the current login. Never overwrites an
 * existing marker — that would silently launder a foreign conversation into
 * this login and defeat rule 2. Mutates and returns the conversation.
 */
function claimLoginSession(conversation, loginSessionId) {
    if (!conversation || !loginSessionId) return conversation;
    if (!conversation.loginSessionId) conversation.loginSessionId = loginSessionId;
    return conversation;
}

/**
 * Why this conversation should be abandoned for a fresh one — or null to
 * continue it. The single decision point behind all three rules, kept pure so
 * the policy can be tested without a database.
 *
 *   'missing'   nothing to continue
 *   'closed'    the conversation was already ended
 *   'new_login' rule 2/3 — a different sign-in opened it
 *   'idle'      rule from sessionWindow — gone quiet past the session window
 *
 * Callers layer their own conditions on top (chat also refuses to continue a
 * mastery conversation in general mode, for instance).
 */
function sessionBreakReason(conversation, loginSessionId, now = Date.now()) {
    if (!conversation) return 'missing';
    if (conversation.isActive === false) return 'closed';
    if (isForeignLoginSession(conversation, loginSessionId)) return 'new_login';
    if (isSessionStale(conversation, now)) return 'idle';
    return null;
}

module.exports = {
    LOGIN_SESSION_KEY,
    getLoginSessionId,
    peekLoginSessionId,
    isForeignLoginSession,
    claimLoginSession,
    sessionBreakReason,
};
