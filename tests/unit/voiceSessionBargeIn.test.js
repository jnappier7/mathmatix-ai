// tests/unit/voiceSessionBargeIn.test.js
//
// The turn-taking half of "make voice feel like a person".
//
// Before this, ANY STT partial longer than two characters killed the
// in-flight turn. A student saying "mm-hm" while the tutor explained lost
// the rest of the explanation, had it stored as [INTERRUPTED], and then got
// a fresh answer to a word they meant as a nod. These tests pin the
// duck-then-decide policy: the tutor is only stopped once the transcript
// shows the student meant to take the floor.

const { VoiceSession } = require('../../utils/voiceSession');

const {
    _onPartial,
    _onUtteranceEnd,
    _commitUtterance,
    _openBargeDuck,
    _resolveBargeDuck,
    _clearBargeDuckTimer,
    _handleClientMessage,
} = VoiceSession.prototype;

/**
 * Minimal stand-in. The barge-in path only touches the current turn, the
 * outbound socket and the abort hook, so a real session (ws, Deepgram,
 * Cartesia pool, LLM) would be testing the mocks rather than the policy.
 */
function session(overrides = {}) {
    return {
        userId: 'student123',
        currentTurn: { status: 'speaking', metric: { turnId: 't1' }, spokenAcc: '' },
        _accumulatedFinal: '',
        _bargeDuckTimer: null,
        _speechEndedAt: null,
        _send: jest.fn(),
        _abortCurrentTurn: jest.fn(),
        _startTurn: jest.fn(),
        _openBargeDuck,
        _resolveBargeDuck,
        _clearBargeDuckTimer,
        // _onUtteranceEnd delegates here now that speech_final shares the
        // commit path — see voiceEndpointing.test.js for that seam.
        _commitUtterance,
        ...overrides,
    };
}

const sentTypes = (s) => s._send.mock.calls.map(c => c[0].type);

afterEach(() => {
    jest.useRealTimers();
});

describe('_onPartial — deciding whether speech over the tutor is an interruption', () => {
    test('a nod does not stop the tutor', () => {
        const s = session();
        _onPartial.call(s, 'mm-hmm');

        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
        expect(sentTypes(s)).toContain('resume_speaking');
    });

    test('a real question stops the tutor', () => {
        const s = session();
        _onPartial.call(s, 'wait why is it negative');

        expect(s._abortCurrentTurn).toHaveBeenCalledWith('user_barge_in_server_detected');
    });

    test('an empty partial from room noise holds the turn open', () => {
        const s = session();
        _onPartial.call(s, '');

        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
    });

    test('nothing is interrupted when the tutor is not speaking', () => {
        const s = session({ currentTurn: { status: 'thinking', metric: { turnId: 't1' } } });
        _onPartial.call(s, 'wait stop');

        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
    });

    test('still forwards the partial transcript to the client either way', () => {
        const s = session();
        _onPartial.call(s, 'okay');
        expect(sentTypes(s)).toContain('transcript_partial');
    });
});

describe('_onUtteranceEnd — a backchannel is not a turn', () => {
    test('swallows "yeah" spoken over the tutor instead of answering it', () => {
        const s = session({ _accumulatedFinal: 'yeah' });
        _onUtteranceEnd.call(s);

        expect(s._startTurn).not.toHaveBeenCalled();
        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
        expect(sentTypes(s)).toContain('resume_speaking');
    });

    test('answers the same word once the tutor has finished', () => {
        // "okay" after the explanation means "I'm ready" — a real turn.
        const s = session({ currentTurn: null, _accumulatedFinal: 'okay' });
        _onUtteranceEnd.call(s);

        expect(s._startTurn).toHaveBeenCalledWith(
            'okay', { source: 'voice', endpointReason: 'utterance_end' }
        );
    });

    test('a real utterance over the tutor interrupts and starts a new turn', () => {
        const s = session({ _accumulatedFinal: 'can you show that on the board' });
        _onUtteranceEnd.call(s);

        expect(s._abortCurrentTurn).toHaveBeenCalledWith('user_barge_in');
        expect(s._startTurn).toHaveBeenCalledWith(
            'can you show that on the board',
            { source: 'voice', endpointReason: 'utterance_end' }
        );
    });

    test('clears the accumulator so the next utterance starts clean', () => {
        const s = session({ _accumulatedFinal: 'mhm' });
        _onUtteranceEnd.call(s);
        expect(s._accumulatedFinal).toBe('');
    });
});

describe('barge_in from the client is a question, not an order', () => {
    test('holds the turn open instead of killing it on local VAD alone', async () => {
        const s = session();
        await _handleClientMessage.call(s, { type: 'barge_in', at_ms: Date.now() });

        // The mic cannot tell speech from a dropped pencil — the transcript
        // decides, so nothing is destroyed yet.
        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
        expect(s._bargeDuckTimer).not.toBeNull();
    });

    test('tells the client to come back up when the turn is already over', async () => {
        const s = session({ currentTurn: null });
        await _handleClientMessage.call(s, { type: 'barge_in', at_ms: Date.now() });

        expect(sentTypes(s)).toContain('resume_speaking');
        expect(s._bargeDuckTimer).toBeNull();
    });
});

describe('the duck always resolves', () => {
    test('lifts itself when no transcript arrives — it was just noise', () => {
        jest.useFakeTimers();
        const s = session();
        _openBargeDuck.call(s);
        expect(s._send).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1000);

        expect(sentTypes(s)).toContain('resume_speaking');
        expect(s._bargeDuckTimer).toBeNull();
    });

    test('a confirmed interruption cancels the pending watchdog', () => {
        jest.useFakeTimers();
        const s = session();
        _openBargeDuck.call(s);
        _clearBargeDuckTimer.call(s);

        jest.advanceTimersByTime(5000);

        expect(sentTypes(s)).not.toContain('resume_speaking');
    });

    test('a second barge-in does not stack a second watchdog', () => {
        jest.useFakeTimers();
        const s = session();
        _openBargeDuck.call(s);
        const first = s._bargeDuckTimer;
        _openBargeDuck.call(s);

        expect(s._bargeDuckTimer).toBe(first);
    });
});

describe('_sendInterruptedFinal — an interrupted turn keeps its work', () => {
    // An aborted turn returns before response_final, which is the only
    // message carrying the board payload. Live Workspace defers rendering to
    // that message, so interrupting the tutor used to wipe out both the
    // partial sentence they got out and the lines they had already drawn.
    const { _sendInterruptedFinal } = VoiceSession.prototype;

    function turn(overrides = {}) {
        return {
            metric: { turnId: 't1' },
            spokenAcc: '',
            mathBuffer: '',
            boardActions: [],
            ...overrides,
        };
    }

    function boardSession(overrides = {}) {
        return {
            mode: 'board-actions',
            _send: jest.fn(),
            _parseMathBuffer: jest.fn(() => []),
            ...overrides,
        };
    }

    test('flushes the board work the tutor already streamed', () => {
        const s = boardSession();
        const actions = [{ type: 'write', text: '2x = 4' }];
        _sendInterruptedFinal.call(s, turn({ spokenAcc: 'So we add four', boardActions: actions }));

        const [msg] = s._send.mock.calls[0];
        expect(msg.type).toBe('response_final');
        expect(msg.boardActions).toEqual(actions);
        expect(msg.interrupted).toBe(true);
    });

    test('keeps the words the student actually heard', () => {
        const s = boardSession();
        _sendInterruptedFinal.call(s, turn({ spokenAcc: 'So the first step is' }));

        expect(s._send.mock.calls[0][0].text).toBe('So the first step is');
    });

    test('never ships visuals the verify stage has not cleared', () => {
        // Visual commands resolve after verify precisely so an answer-leaking
        // diagram can be dropped. An interrupted turn never runs verify, so it
        // must not smuggle them out.
        const s = boardSession();
        _sendInterruptedFinal.call(s, turn({ spokenAcc: 'Here', boardActions: [{ type: 'write' }] }));

        expect(s._send.mock.calls[0][0].visualCommands).toBeNull();
    });

    test('stays silent when the turn produced nothing', () => {
        const s = boardSession();
        _sendInterruptedFinal.call(s, turn());

        expect(s._send).not.toHaveBeenCalled();
    });

    test('carries parsed math steps in math-steps mode', () => {
        const steps = [{ label: 'Given', latex: '2x-4=0' }];
        const s = boardSession({
            mode: 'math-steps',
            _parseMathBuffer: jest.fn(() => steps),
        });
        _sendInterruptedFinal.call(s, turn({ spokenAcc: 'Start here', mathBuffer: '[]' }));

        expect(s._send.mock.calls[0][0].mathSteps).toEqual(steps);
    });

    test('a parse failure cannot cost the student their interrupt', () => {
        const s = boardSession({
            mode: 'math-steps',
            _parseMathBuffer: jest.fn(() => { throw new Error('bad json'); }),
        });

        expect(() => _sendInterruptedFinal.call(s, turn({ spokenAcc: 'x' }))).not.toThrow();
    });
});
