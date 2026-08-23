const { OrchestratorSession } = require('../../utils/orchestrator/sessionStore');

/**
 * The orchestrated voice path runs its segment loop off the orchestrator's
 * own AbortController (session.turnAbort), not the voice turn's. A barge-in
 * therefore has to reach across into here — otherwise the dispatcher keeps
 * walking the killed turn's segments, synthesizing and streaming them while
 * the replacement turn is already speaking. That is the server half of
 * "the interrupt starts a new response on top of the old one".
 */
describe('OrchestratorSession.abortTurn', () => {
    function liveSession() {
        const s = new OrchestratorSession('sess-1', 'user-1');
        s.startTurn('turn-1');
        return s;
    }

    it('aborts the in-flight turn so the dispatcher loop breaks', () => {
        const s = liveSession();
        expect(s.turnAbort.signal.aborted).toBe(false);

        expect(s.abortTurn('user_barge_in')).toBe(true);

        expect(s.turnAbort.signal.aborted).toBe(true);
    });

    it('cascades to every registered segment', () => {
        const s = liveSession();
        const a = s.registerSegmentAbort('seg-a');
        const b = s.registerSegmentAbort('seg-b');

        s.abortTurn('user_barge_in');

        expect(a.signal.aborted).toBe(true);
        expect(b.signal.aborted).toBe(true);
    });

    it('drops queued segments so nothing further is synthesized', () => {
        const s = liveSession();
        s.queue = [{ id: 'seg-a' }, { id: 'seg-b' }, { id: 'seg-c' }];
        s.queueIndex = 0;
        s.activeSegmentId = 'seg-a';

        s.abortTurn('user_barge_in');

        expect(s.queue).toEqual([]);
        expect(s.activeSegmentId).toBeNull();
    });

    it('clears a pending WAIT so the ladder cannot fire after the interrupt', () => {
        const s = liveSession();
        const handle = setTimeout(() => {}, 60_000);
        s.setWaitTimer(handle, 'seg-a');

        s.abortTurn('user_barge_in');

        expect(s.waitTimer).toBeNull();
        expect(s.waitSegmentId).toBeNull();
    });

    it('reports false when there was no live turn to stop', () => {
        const s = new OrchestratorSession('sess-2', 'user-1');
        expect(s.abortTurn('user_barge_in')).toBe(false);
    });

    it('is idempotent — a second barge-in is not an error', () => {
        const s = liveSession();
        expect(s.abortTurn('first')).toBe(true);
        expect(s.abortTurn('second')).toBe(false);
        expect(s.turnAbort.signal.aborted).toBe(true);
    });

    it('leaves the session usable for the replacement turn', () => {
        const s = liveSession();
        s.abortTurn('user_barge_in');

        s.startTurn('turn-2');

        expect(s.currentTurnId).toBe('turn-2');
        expect(s.turnAbort.signal.aborted).toBe(false);
    });
});
