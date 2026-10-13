// tests/unit/voiceTurnTaking.test.js
//
// Owner report 2026-10-13: the tutor "kept talking through interruptions and
// picked up background speech as if it were the student". Three causes,
// pinned here:
//   1. The reply's PLAYBACK outlives its server turn (Cartesia synthesizes
//      faster than real time). Barge-in required a live turn, so the tail of
//      every reply answered the client's duck with "no_active_turn" and the
//      tutor talked on over the student.
//   2. The STT wiring forwarded only the text — no confidence, no
//      speech_final — so nothing could tell the student from a TV.
//   3. The tutor's own voice coming back through the mic became a turn.

const sttStream = require('../../utils/sttStream');
const { VoiceSession, tutorAudible, isTutorEcho } = require('../../utils/voiceSession');

const P = VoiceSession.prototype;

function session(overrides = {}) {
    const s = {
        userId: 'student123',
        currentTurn: null,
        history: [{ role: 'user', content: 'help' }, { role: 'assistant', content: 'Let us look at the left side first.' }],
        _accumulatedFinal: '',
        _accumulatedConfidence: [],
        _bargeDuckTimer: null,
        _playbackUntil: 0,
        _playbackTag: 777,
        _send: jest.fn(),
        _setStatus: jest.fn(),
        _abortCurrentTurn: jest.fn(),
        _startTurn: jest.fn(),
        ...overrides,
    };
    for (const name of ['_onPartial', '_onFinal', '_commitUtterance', '_openBargeDuck',
        '_resolveBargeDuck', '_clearBargeDuckTimer', '_interruptPlaybackTail']) {
        if (!s[name]) s[name] = P[name];
    }
    return s;
}

const sent = (s, type) => s._send.mock.calls.map(c => c[0]).filter(m => m.type === type);

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the playback tail is interruptible', () => {
    test('audio still playing after the turn ended counts as the tutor speaking', () => {
        expect(tutorAudible(session({ _playbackUntil: Date.now() + 3000 }))).toBe(true);
        expect(tutorAudible(session({ _playbackUntil: Date.now() - 10 }))).toBe(false);
    });

    test('a duck during the tail is held open, not dismissed as no_active_turn', () => {
        jest.useFakeTimers();
        const s = session({ _playbackUntil: Date.now() + 3000 });
        s._openBargeDuck();
        expect(sent(s, 'resume_speaking')).toHaveLength(0);
        expect(s._bargeDuckTimer).not.toBeNull();
    });

    test('real speech during the tail stops playback by its audio tag', () => {
        const s = session({ _playbackUntil: Date.now() + 3000 });
        s._onPartial('wait I think it is seven', 0.93);
        const [stop] = sent(s, 'interrupted');
        expect(stop).toMatchObject({ audioTag: 777 });
        expect(s._playbackUntil).toBe(0);
        // The model is told the student never heard the end.
        expect(s.history[1].content).toMatch(/\[INTERRUPTED\]$/);
    });

    test('a nod during the tail keeps the tutor talking', () => {
        const s = session({ _playbackUntil: Date.now() + 3000 });
        s._onPartial('mm-hmm', 0.95);
        expect(sent(s, 'interrupted')).toHaveLength(0);
        expect(sent(s, 'resume_speaking')).toHaveLength(1);
    });

    test('with nothing playing, a duck is still released immediately', () => {
        const s = session();
        s._openBargeDuck();
        expect(sent(s, 'resume_speaking')[0]).toMatchObject({ reason: 'no_active_turn' });
    });

    test('playback end is estimated from the audio actually sent', () => {
        const s = session({ ws: { readyState: 1, send: jest.fn() } });
        const before = Date.now();
        P._sendAudioChunk.call(s, new Int16Array(22050 * 2), 22050, 'turn-a');
        expect(s._playbackUntil).toBeGreaterThanOrEqual(before + 2000);
    });
});

describe('background speech is not the student', () => {
    test('a low-confidence partial does not stop the tutor', () => {
        const s = session({ currentTurn: { status: 'speaking', spokenAcc: '' } });
        s._onPartial('and now the weather for tonight', 0.31);
        expect(s._abortCurrentTurn).not.toHaveBeenCalled();
    });

    test('a confident partial still stops the tutor', () => {
        const s = session({ currentTurn: { status: 'speaking', spokenAcc: '' } });
        s._onPartial('no that is not right', 0.9);
        expect(s._abortCurrentTurn).toHaveBeenCalled();
    });

    test('a low-confidence utterance never becomes a turn', () => {
        const s = session();
        s._onFinal('what time does the game start', 0.28, true);
        expect(s._startTurn).not.toHaveBeenCalled();
        expect(sent(s, 'utterance_ignored')[0]).toMatchObject({ reason: 'low_confidence' });
    });

    test('a clear utterance is answered on speech_final', () => {
        const s = session();
        s._onFinal('I got x equals six', 0.92, true);
        expect(s._startTurn).toHaveBeenCalledWith('I got x equals six', expect.objectContaining({ endpointReason: 'speech_final' }));
    });

    test('confidence is word-weighted across an utterance\'s segments', () => {
        const s = session();
        s._onFinal('um', 0.2, false);                          // one mumbled word
        s._onFinal('I think the answer is twelve', 0.9, true);  // then clear speech
        expect(s._startTurn).toHaveBeenCalled();
    });

    test('STT that reports no confidence (Whisper fallback) is never gated', () => {
        const s = session();
        s._accumulatedFinal = 'x equals four';
        s._commitUtterance('utterance_end');
        expect(s._startTurn).toHaveBeenCalled();
    });
});

describe('the tutor hearing its own voice', () => {
    const tutorSaid = 'So what do we get when we divide both sides by three?';

    test('its own words coming back are recognised as echo', () => {
        const s = session({ _lastTutorSpoken: tutorSaid, _playbackUntil: Date.now() + 1000 });
        expect(isTutorEcho(s, 'divide both sides by three')).toBe(true);
    });

    test('a short student answer that shares words is not echo', () => {
        const s = session({ _lastTutorSpoken: tutorSaid });
        expect(isTutorEcho(s, 'by three')).toBe(false);
        expect(isTutorEcho(s, 'x equals two')).toBe(false);
    });

    test('echo during playback does not become a turn', () => {
        const s = session({ _lastTutorSpoken: tutorSaid, _playbackUntil: Date.now() + 1000 });
        s._onFinal('when we divide both sides by three', 0.88, true);
        expect(s._startTurn).not.toHaveBeenCalled();
        expect(sent(s, 'utterance_ignored')[0]).toMatchObject({ reason: 'echo' });
    });

    test('long after playback, repeating the tutor is a real turn', () => {
        const s = session({ _lastTutorSpoken: tutorSaid, _playbackUntil: Date.now() - 60_000 });
        s._onFinal('divide both sides by three', 0.9, true);
        expect(s._startTurn).toHaveBeenCalled();
    });
});

describe('STT wiring forwards everything Deepgram reports', () => {
    test('confidence and speech_final reach the session', () => {
        let handlers;
        jest.spyOn(sttStream, 'isConfigured').mockReturnValue(true);
        jest.spyOn(sttStream, 'createSession').mockImplementation((opts) => {
            handlers = opts;
            return { isOpen: () => true, close: () => {}, billedSeconds: 0 };
        });
        const s = session({ langCode: 'en', _sttIdleTimer: 1, _onPartial: jest.fn(), _onFinal: jest.fn() });
        P._openStt.call(s);

        handlers.onPartial('hello', 0.42);
        handlers.onFinal('hello there', 0.87, true);
        expect(s._onPartial).toHaveBeenCalledWith('hello', 0.42);
        expect(s._onFinal).toHaveBeenCalledWith('hello there', 0.87, true);
    });
});
