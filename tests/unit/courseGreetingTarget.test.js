/**
 * What the course greeting does with the transcript already on screen.
 *
 * Context: the continuity work (PR #1361) made the server roll a course
 * conversation when a new login enters, and report `conversationId` +
 * `sessionRolled` so the client stops appending a fresh lesson start under the
 * previous sitting's bubbles.
 *
 * The first cut of that client guard was wrong in a way the server tests could
 * not see. It clear-blanked the view whenever the id merely DIFFERED from
 * `window.currentConversationId`, roll or no roll. But a non-rolled mismatch
 * means the opposite thing: the sitting is still live and the view is simply
 * pointed elsewhere (a course entered without going through activate, or the
 * greeting fired from onBaselineComplete after an ACT test). Blanking there
 * hides a live thread AND hydrates the board to empty — the inverse of the bug
 * being fixed.
 *
 * So: roll → clear; mismatch without a roll → a real switch that replays the
 * messages and the board; otherwise leave it alone.
 *
 * courseCatalog.js only auto-instantiates inside a DOMContentLoaded handler, so
 * a minimal `document` stub lets it load in node.
 */

global.document = global.document || { addEventListener() {} };
const { CourseManager } = require('../../public/js/courseCatalog');

const reconcile = (data, current) => CourseManager.reconcileGreetingTarget(data, current);

const withSidebar = (fn) => {
    const prev = global.window;
    global.window = { sidebar: { switchSession: () => {} } };
    try { return fn(); } finally { global.window = prev; }
};

const withoutSidebar = (fn) => {
    const prev = global.window;
    global.window = {};
    try { return fn(); } finally { global.window = prev; }
};

describe('a rolled sitting is cleared', () => {
    test('clears to the conversation the server actually wrote to', () => {
        const t = withSidebar(() => reconcile({ conversationId: 'new-1', sessionRolled: true }, 'old-9'));
        expect(t).toEqual({ action: 'clear', conversationId: 'new-1' });
    });

    test('a roll wins even when the ids happen to match', () => {
        // The server is authoritative about having started a new sitting; the
        // id comparison is only a fallback signal.
        const t = withSidebar(() => reconcile({ conversationId: 'c-1', sessionRolled: true }, 'c-1'));
        expect(t.action).toBe('clear');
    });
});

describe('a live sitting is never blanked', () => {
    test('a mismatch WITHOUT a roll switches instead of clearing', () => {
        // THE REGRESSION THIS PINS. 'clear' here would hide the existing course
        // messages and wipe the board of a conversation the server just told us
        // is continuing.
        const t = withSidebar(() => reconcile({ conversationId: 'course-1', sessionRolled: false }, 'general-7'));
        expect(t).toEqual({ action: 'switch', conversationId: 'course-1' });
    });

    test('a missing sessionRolled field is treated as "not rolled"', () => {
        // Older server builds, and the deferred/baseline responses, omit it.
        const t = withSidebar(() => reconcile({ conversationId: 'course-1' }, 'general-7'));
        expect(t.action).toBe('switch');
    });

    test('falls back to leaving the view alone when no sidebar can switch', () => {
        // Better a stale view than a blank one: the student can still see their
        // work, and the next turn reconciles it.
        const t = withoutSidebar(() => reconcile({ conversationId: 'course-1', sessionRolled: false }, 'general-7'));
        expect(t).toEqual({ action: 'none', conversationId: 'course-1' });
    });
});

describe('the ordinary case does nothing', () => {
    test('the view already shows this conversation', () => {
        const t = withSidebar(() => reconcile({ conversationId: 'c-1', sessionRolled: false }, 'c-1'));
        expect(t).toEqual({ action: 'none', conversationId: 'c-1' });
    });

    test('ObjectId-vs-string ids compare by value, not identity', () => {
        // The server sends a mongoose ObjectId; the client holds whatever a
        // previous response left in window.currentConversationId.
        const objectIdish = { toString: () => '507f1f77bcf86cd799439011' };
        const t = withSidebar(() => reconcile(
            { conversationId: objectIdish, sessionRolled: false },
            '507f1f77bcf86cd799439011',
        ));
        expect(t.action).toBe('none');
    });

    test('no conversationId at all is a no-op', () => {
        // Nothing to reconcile against — render the greeting where we are.
        expect(reconcile({ sessionRolled: true }, 'c-1')).toEqual({ action: 'none', conversationId: null });
        expect(reconcile({}, 'c-1').action).toBe('none');
        expect(reconcile(null, 'c-1').action).toBe('none');
    });

    test('an unknown current conversation still reconciles', () => {
        // First paint of the page: currentConversationId is undefined.
        const t = withSidebar(() => reconcile({ conversationId: 'c-1', sessionRolled: false }, undefined));
        expect(t.action).toBe('switch');
    });
});
