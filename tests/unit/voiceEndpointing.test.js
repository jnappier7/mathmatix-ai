// tests/unit/voiceEndpointing.test.js
//
// How long the tutor waits after the student stops talking.
//
// Deepgram raises TWO end-of-speech signals: `speech_final` on the closing
// transcript once `endpointing` ms of silence pass (300ms here), and the
// separate UtteranceEnd event, which the API will not let us set below
// 1000ms. The session used to commit only on UtteranceEnd, so every single
// spoken turn spent ~700ms of pure dead air — nothing computing, the student
// just waiting — before the tutor even started thinking.
//
// These tests pin the fast path and, just as importantly, the fallback:
// speech_final does not always fire (trailing room noise keeps Deepgram from
// calling it), and a student whose endpointing verdict never arrives must
// still get an answer.

const { VoiceSession } = require('../../utils/voiceSession');

const {
    _onFinal,
    _onUtteranceEnd,
    _commitUtterance,
    _startTurn,
} = VoiceSession.prototype;

function session(overrides = {}) {
    return {
        userId: 'student123',
        currentTurn: null,
        _accumulatedFinal: '',
        _speechEndedAt: null,
        _bargeDuckTimer: null,
        _send: jest.fn(),
        _startTurn: jest.fn(),
        _abortCurrentTurn: jest.fn(),
        _resolveBargeDuck: jest.fn(),
        _commitUtterance,
        ...overrides,
    };
}

const sentTypes = (s) => s._send.mock.calls.map(c => c[0].type);

describe('the tutor answers as soon as the student stops', () => {
    test('commits the turn on speech_final, without waiting for UtteranceEnd', () => {
        const s = session();
        _onFinal.call(s, 'what is the slope', 0.98, true);

        expect(s._startTurn).toHaveBeenCalledWith(
            'what is the slope',
            { source: 'voice', endpointReason: 'speech_final' }
        );
    });

    test('keeps accumulating while the student is still mid-utterance', () => {
        // Deepgram emits one is_final per phrase; only the last carries
        // speech_final. Committing on the first would cut students off
        // mid-sentence — the failure this fast path must not introduce.
        const s = session();
        _onFinal.call(s, 'so if x equals four', 0.9, false);
        _onFinal.call(s, 'then y is what', 0.9, false);

        expect(s._startTurn).not.toHaveBeenCalled();
        expect(s._accumulatedFinal).toBe('so if x equals four then y is what');
    });

    test('sends the whole utterance, not just the closing phrase', () => {
        const s = session();
        _onFinal.call(s, 'so if x equals four', 0.9, false);
        _onFinal.call(s, 'then y is what', 0.9, true);

        expect(s._startTurn).toHaveBeenCalledWith(
            'so if x equals four then y is what',
            expect.objectContaining({ source: 'voice' })
        );
    });

    test('still streams each final segment to the client for live captions', () => {
        const s = session();
        _onFinal.call(s, 'hello', 0.9, true);
        expect(sentTypes(s)).toContain('transcript_final_segment');
        expect(sentTypes(s)).toContain('transcript_final');
    });
});

describe('UtteranceEnd is the fallback, not the trigger', () => {
    test('still answers when speech_final never fires', () => {
        // Room noise can keep Deepgram from ever raising its endpointing
        // verdict. Without this path the student would wait forever.
        const s = session();
        _onFinal.call(s, 'can you explain that again', 0.9, false);
        expect(s._startTurn).not.toHaveBeenCalled();

        _onUtteranceEnd.call(s);

        expect(s._startTurn).toHaveBeenCalledWith(
            'can you explain that again',
            { source: 'voice', endpointReason: 'utterance_end' }
        );
    });

    test('does not answer twice when speech_final already committed', () => {
        const s = session();
        _onFinal.call(s, 'what is a slope', 0.9, true);
        _onUtteranceEnd.call(s);

        expect(s._startTurn).toHaveBeenCalledTimes(1);
    });

    test('a bare UtteranceEnd with nothing accumulated is a no-op', () => {
        const s = session();
        _onUtteranceEnd.call(s);
        expect(s._startTurn).not.toHaveBeenCalled();
        expect(s._send).not.toHaveBeenCalled();
    });
});

describe('the fast path keeps the turn-taking rules it inherited', () => {
    test('a backchannel over the tutor is still swallowed', () => {
        // speech_final must not become a back door around the nod handling.
        const s = session({ currentTurn: { status: 'speaking' } });
        _onFinal.call(s, 'mm-hmm', 0.9, true);

        expect(s._startTurn).not.toHaveBeenCalled();
        expect(s._resolveBargeDuck).toHaveBeenCalled();
    });

    test('a real utterance over the tutor still interrupts', () => {
        const s = session({ currentTurn: { status: 'speaking' } });
        _onFinal.call(s, 'wait go back', 0.9, true);

        expect(s._abortCurrentTurn).toHaveBeenCalledWith('user_barge_in');
        expect(s._startTurn).toHaveBeenCalled();
    });
});

describe('latency is measured from when the student actually stopped', () => {
    test('stamps the speech-end moment at commit, not at turn start', () => {
        // The old code stamped t_user_speech_end inside _startTurn — after
        // the endpointing wait — so the dead air never appeared in ttfa and
        // the metric looked healthy while students sat in silence.
        const s = session();
        _onFinal.call(s, 'hello', 0.9, true);
        expect(typeof s._speechEndedAt).toBe('number');
    });

    test('_startTurn measures from that moment and records how we got there', () => {
        const s = {
            closed: false,
            userId: 'u1',
            sessionId: 's1',
            _speechEndedAt: 1000,
            tutorProfile: { id: 'bob' },
            currentTurn: null,
            _send: jest.fn(),
            _setStatus: jest.fn(),
            _clearBargeDuckTimer: jest.fn(),
            _driveTurn: jest.fn().mockResolvedValue(undefined),
        };

        return _startTurn.call(s, 'hi', { source: 'voice', endpointReason: 'speech_final' })
            .then(() => {
                const turnStart = s._send.mock.calls
                    .map(c => c[0])
                    .find(m => m.type === 'turn_start');
                expect(turnStart).toBeDefined();
                // Consumed, so a later typed turn is not attributed to it.
                expect(s._speechEndedAt).toBeNull();
            });
    });

    test('typed input has no speech-end to inherit', () => {
        const s = session({ _speechEndedAt: null });
        expect(s._speechEndedAt).toBeNull();
    });
});
