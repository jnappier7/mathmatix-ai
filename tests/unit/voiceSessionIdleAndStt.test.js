/**
 * Two server bugs that together made live voice unusable (prod logs,
 * 2026-11-26, owner on an iPhone with a chat tab also open on a Mac):
 *
 *  1. Every chat page opens a voice socket when it loads, and a new socket
 *     closed the user's other one ON CONNECT. An idle tab on one device took
 *     voice away from the device being talked into, and two open pages kicked
 *     each other off in a loop — ~25 sessions in a minute.
 *
 *  2. While a Deepgram connection was still opening, the session replaced it
 *     on every 20 ms mic frame: 150 connections in 3 seconds, then HTTP 429
 *     from Deepgram and every voice session fell back to record-and-upload.
 */
const EventEmitter = require('events');

const liveConnections = [];
jest.mock('@deepgram/sdk', () => {
    const Emitter = require('events');
    return {
        LiveTranscriptionEvents: {
            Open: 'open', Transcript: 'transcript', UtteranceEnd: 'utteranceEnd',
            SpeechStarted: 'speechStarted', Error: 'error', Close: 'close',
        },
        createClient: () => ({
            listen: {
                live: () => {
                    const conn = new Emitter();
                    conn.sent = [];
                    conn.send = (buf) => conn.sent.push(buf);
                    conn.requestClose = jest.fn();
                    conn.finish = jest.fn();
                    liveConnections.push(conn);
                    return conn;
                },
            },
        }),
    };
});

process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'test-key';
const sttStream = require('../../utils/sttStream');
const { VoiceSession, CLOSE_SUPERSEDED } = require('../../utils/voiceSession');

const frame = () => Buffer.alloc(640);   // 20 ms of 16 kHz s16 mono

/** A session with a fake socket, built without running init(). */
function makeSession(userId = 'student1') {
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.send = jest.fn();
    ws.close = jest.fn();
    const s = Object.create(VoiceSession.prototype);
    Object.assign(s, {
        ws, userId, user: { _id: userId }, mode: 'board-actions', langCode: 'en',
        stt: null, currentTurn: null, closed: false, _unmetered: true,
        _meteredSeconds: 0, _pendingTurnDebounce: null,
    });
    s._bindClient();
    return s;
}

beforeEach(() => { liveConnections.length = 0; });

describe('speech-to-text connection', () => {
    test('audio arriving while Deepgram is still opening opens ONE connection', () => {
        const s = makeSession('storm');
        for (let i = 0; i < 150; i++) s.ws.emit('message', frame(), true);   // 3 s of mic audio
        expect(liveConnections).toHaveLength(1);
        s.shutdown('test');
    });

    test('that audio is held and sent when the connection opens, in order', () => {
        const s = makeSession('held');
        const frames = [Buffer.from([1, 0]), Buffer.from([2, 0]), Buffer.from([3, 0])];
        for (const f of frames) s.ws.emit('message', f, true);
        const conn = liveConnections[0];
        expect(conn.sent).toHaveLength(0);
        conn.emit('open');
        expect(conn.sent).toEqual(frames);
        s.ws.emit('message', Buffer.from([4, 0]), true);
        expect(conn.sent).toHaveLength(4);
        s.shutdown('test');
    });

    test('a session closed for idleness is replaced by exactly one new connection', () => {
        const s = makeSession('idle');
        s.ws.emit('message', frame(), true);
        liveConnections[0].emit('open');
        s.stt.close();                                     // what the idle watchdog does
        for (let i = 0; i < 50; i++) s.ws.emit('message', frame(), true);
        expect(liveConnections).toHaveLength(2);
        s.shutdown('test');
    });

    test('isUsable: true while opening and while open, false once closed or errored', () => {
        const a = sttStream.createSession({});
        expect(a.isOpen()).toBe(false);
        expect(a.isUsable()).toBe(true);
        liveConnections[0].emit('open');
        expect(a.isUsable()).toBe(true);
        a.close();
        expect(a.isUsable()).toBe(false);

        const b = sttStream.createSession({});
        liveConnections[1].emit('error', new Error('Unexpected server response: 429'));
        expect(b.isUsable()).toBe(false);
    });

    test('the held audio is bounded', () => {
        const a = sttStream.createSession({});
        for (let i = 0; i < 1000; i++) a.sendFrame(frame());
        liveConnections[0].emit('open');
        expect(liveConnections[0].sent.length).toBeLessThanOrEqual(150);
    });
});

describe('which connection holds voice', () => {
    test('a connection that is only open displaces no one and opens no Deepgram stream', () => {
        const talking = makeSession('twoDevices');
        talking.ws.emit('message', frame(), true);         // the phone, in a call
        const idleTab = makeSession('twoDevices');         // the laptop tab loads
        expect(talking.closed).toBe(false);
        expect(talking.ws.close).not.toHaveBeenCalled();
        expect(idleTab.stt).toBeNull();
        expect(liveConnections).toHaveLength(1);
        talking.shutdown('test'); idleTab.shutdown('test');
    });

    test('the device the student starts talking into takes over, once', () => {
        const first = makeSession('handover');
        first.ws.emit('message', frame(), true);
        const second = makeSession('handover');
        second.ws.emit('message', frame(), true);
        expect(first.closed).toBe(true);
        expect(first.ws.close).toHaveBeenCalledWith(CLOSE_SUPERSEDED, 'superseded_by_new_session');
        expect(second.closed).toBe(false);
        for (let i = 0; i < 20; i++) second.ws.emit('message', frame(), true);
        expect(second.ws.close).not.toHaveBeenCalled();
        second.shutdown('test');
    });

    test('an idle connection reconnecting again and again never ends the call', () => {
        const talking = makeSession('pingpong');
        talking.ws.emit('message', frame(), true);
        for (let i = 0; i < 25; i++) makeSession('pingpong').shutdown('client_close');
        expect(talking.closed).toBe(false);
        expect(liveConnections).toHaveLength(1);
        talking.shutdown('test');
    });

    test('closing an idle connection does not unregister the one in use', () => {
        const talking = makeSession('registry');
        talking.ws.emit('message', frame(), true);
        makeSession('registry').shutdown('client_close');
        const third = makeSession('registry');
        third.ws.emit('message', frame(), true);           // must still find and supersede it
        expect(talking.closed).toBe(true);
        third.shutdown('test');
    });
});
