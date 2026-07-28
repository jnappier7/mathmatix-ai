/**
 * The login-session marker — the policy, without a database.
 *
 * utils/sessionWindow.js answers "has this gone idle?". That cannot express the
 * owner's continuity policy (2026-07-28), which is stated in LOGINS:
 *   1. returning from voice continues the chat exactly where it left off
 *   2. a NEW login does not resume the old transcript
 *   3. a course chat starts fresh unless it's within the same login
 *
 * The motivating failure — a course view holding three or four sittings, with
 * 12:02 AM messages above a 12:24 AM continuation — is 22 minutes wide, so the
 * 30-minute window never fired. Different logins is the distinction that was
 * missing, and these tests pin it.
 */

const {
    getLoginSessionId,
    peekLoginSessionId,
    isForeignLoginSession,
    claimLoginSession,
    sessionBreakReason,
} = require('../../utils/loginSession');

const NOW = new Date('2026-07-28T00:24:00Z').getTime();
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000);

describe('getLoginSessionId', () => {
    test('mints a marker on a session that has none', () => {
        const req = { session: {} };
        const id = getLoginSessionId(req);
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
        expect(req.session.loginSessionId).toBe(id);
    });

    test('is stable across requests within one login', () => {
        const req = { session: {} };
        const first = getLoginSessionId(req);
        // Same session object = same login: express keeps it until passport
        // regenerates it at the next req.logIn().
        expect(getLoginSessionId(req)).toBe(first);
        expect(getLoginSessionId({ session: req.session })).toBe(first);
    });

    test('a new login gets a different marker', () => {
        // Passport regenerates the express session on every req.logIn (session
        // fixation defence, unconditional in its SessionManager), so the next
        // login arrives with an empty session — which is precisely why we do
        // not have to stamp each login route by hand.
        const first = getLoginSessionId({ session: {} });
        const second = getLoginSessionId({ session: {} });
        expect(second).not.toBe(first);
    });

    test('returns null when there is no session at all', () => {
        expect(getLoginSessionId({})).toBeNull();
        expect(getLoginSessionId(null)).toBeNull();
    });
});

describe('peekLoginSessionId', () => {
    test('reads an existing marker', () => {
        expect(peekLoginSessionId({ session: { loginSessionId: 'abc' } })).toBe('abc');
    });

    test('does NOT mint — a WebSocket upgrade has no response to flush', () => {
        const req = { session: {} };
        expect(peekLoginSessionId(req)).toBeNull();
        expect(req.session.loginSessionId).toBeUndefined();
    });
});

describe('isForeignLoginSession', () => {
    test('a conversation from another login is foreign', () => {
        expect(isForeignLoginSession({ loginSessionId: 'login-a' }, 'login-b')).toBe(true);
    });

    test('the same login is not foreign', () => {
        expect(isForeignLoginSession({ loginSessionId: 'login-a' }, 'login-a')).toBe(false);
    });

    test('an UNMARKED conversation is adoptable, never foreign', () => {
        // Rolling these would throw away every live session on deploy day, and
        // would roll again on every write from a path with no HTTP session.
        expect(isForeignLoginSession({ loginSessionId: null }, 'login-a')).toBe(false);
        expect(isForeignLoginSession({}, 'login-a')).toBe(false);
    });

    test('an unknown caller marker never rolls anything', () => {
        expect(isForeignLoginSession({ loginSessionId: 'login-a' }, null)).toBe(false);
    });

    test('is safe on a missing conversation', () => {
        expect(isForeignLoginSession(null, 'login-a')).toBe(false);
    });
});

describe('claimLoginSession', () => {
    test('stamps an unmarked conversation', () => {
        const convo = { loginSessionId: null };
        claimLoginSession(convo, 'login-a');
        expect(convo.loginSessionId).toBe('login-a');
    });

    test('NEVER overwrites an existing marker', () => {
        // Overwriting would launder a previous login's transcript into this one
        // and quietly defeat rule 2.
        const convo = { loginSessionId: 'login-a' };
        claimLoginSession(convo, 'login-b');
        expect(convo.loginSessionId).toBe('login-a');
    });

    test('is a no-op without a marker to claim with', () => {
        const convo = { loginSessionId: null };
        claimLoginSession(convo, null);
        expect(convo.loginSessionId).toBeNull();
    });
});

describe('sessionBreakReason', () => {
    test('continues an active conversation from the same login', () => {
        const convo = { isActive: true, loginSessionId: 'login-a', lastActivity: minutesAgo(2) };
        expect(sessionBreakReason(convo, 'login-a', NOW)).toBeNull();
    });

    test('RULE 2/3: a new login breaks even a conversation active one minute ago', () => {
        const convo = { isActive: true, loginSessionId: 'login-a', lastActivity: minutesAgo(1) };
        expect(sessionBreakReason(convo, 'login-b', NOW)).toBe('new_login');
    });

    test('the exact reported gap — 22 minutes, different login — breaks', () => {
        // 12:02 AM under a 12:24 AM continuation. Inside the 30-minute window,
        // so the idle rule alone said "same session" and the transcripts merged.
        const convo = { isActive: true, loginSessionId: 'login-a', lastActivity: minutesAgo(22) };
        expect(sessionBreakReason(convo, 'login-a', NOW)).toBeNull();
        expect(sessionBreakReason(convo, 'login-b', NOW)).toBe('new_login');
    });

    test('the idle window still applies within one login', () => {
        const convo = { isActive: true, loginSessionId: 'login-a', lastActivity: minutesAgo(45) };
        expect(sessionBreakReason(convo, 'login-a', NOW)).toBe('idle');
    });

    test('a closed conversation breaks, and says so', () => {
        const convo = { isActive: false, loginSessionId: 'login-a', lastActivity: minutesAgo(1) };
        expect(sessionBreakReason(convo, 'login-a', NOW)).toBe('closed');
    });

    test('nothing to continue reads as missing', () => {
        expect(sessionBreakReason(null, 'login-a', NOW)).toBe('missing');
    });

    test('an unmarked conversation is adopted, not broken', () => {
        const convo = { isActive: true, loginSessionId: null, lastActivity: minutesAgo(3) };
        expect(sessionBreakReason(convo, 'login-a', NOW)).toBeNull();
    });
});
