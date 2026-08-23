/**
 * Pins the interrupt contract of public/js/voice-stream-client.js.
 *
 * The bug this guards against: interrupting the tutor started the new
 * response *on top of* the old one. Three independent causes, all here —
 *   1. barge-in faded the output gain for 30ms and then restored it,
 *      while the already-scheduled AudioBufferSourceNodes played on;
 *   2. the `interrupted` event didn't touch playback at all;
 *   3. audio frames carry the producing turn's tag and nothing read it,
 *      so chunks still in flight from a killed turn played under its
 *      replacement.
 */

const fs = require('fs');
const path = require('path');

// ─── Minimal Web Audio fake ─────────────────────────────────────────────
// Records stop() calls so the test can assert the graph was actually
// silenced rather than merely faded.

class FakeParam {
    constructor(value) { this.value = value; this.ramps = []; }
    cancelScheduledValues() {}
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime(v) { this.ramps.push(v); this.value = v; }
}

class FakeNode {
    constructor() { this.connected = []; }
    connect(n) { this.connected.push(n); return n; }
    disconnect() {}
}

class FakeSource extends FakeNode {
    constructor() { super(); this.started = false; this.stopped = false; this.onended = null; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
}

class FakeAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = new FakeNode();
        this.sources = [];
        this.audioWorklet = { addModule: () => Promise.resolve() };
    }
    createGain() { const g = new FakeNode(); g.gain = new FakeParam(1); return g; }
    createAnalyser() { const a = new FakeNode(); a.fftSize = 0; a.smoothingTimeConstant = 0; return a; }
    createBuffer(ch, len, sr) {
        return { duration: len / sr, copyToChannel: () => {}, length: len, sampleRate: sr };
    }
    createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() {}
    addEventListener() {}
}

/** Build one server audio frame: [0x01][4B turnTag BE][2B sampleRate BE][pcm]. */
function audioFrame(turnTag, sampleRate, samples = 128) {
    const bytes = new Uint8Array(7 + samples * 2);
    bytes[0] = 0x01;
    bytes[1] = (turnTag >>> 24) & 0xff;
    bytes[2] = (turnTag >>> 16) & 0xff;
    bytes[3] = (turnTag >>> 8) & 0xff;
    bytes[4] = turnTag & 0xff;
    bytes[5] = (sampleRate >> 8) & 0xff;
    bytes[6] = sampleRate & 0xff;
    return bytes;
}

let VoiceStreamClient;

beforeAll(() => {
    const src = fs.readFileSync(
        path.join(__dirname, '../../public/js/voice-stream-client.js'), 'utf8'
    );
    // The client is a browser IIFE that publishes onto `window`. It needs
    // no DOM beyond that here — _dispatchPlaybackEvent already tolerates a
    // missing document, so this runs in the default node environment
    // rather than pulling in jsdom.
    global.window = global.window || {};
    global.AudioContext = FakeAudioContext;
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    VoiceStreamClient = global.window.VoiceStreamClient;
});

// Clients hold a duck failsafe timer; drop it between tests so jest can exit.
const openClients = [];
afterEach(() => {
    while (openClients.length) {
        const c = openClients.pop();
        if (c._duckFailsafeTimer) clearTimeout(c._duckFailsafeTimer);
    }
});

/** A client with a running fake audio graph and no socket. */
function makeClient() {
    const events = [];
    const client = new VoiceStreamClient({ on: (ev) => events.push(ev) });
    const ctx = new FakeAudioContext();
    client.audioCtx = ctx;
    client.outGain = ctx.createGain();
    client.outAnalyser = ctx.createAnalyser();
    client.ws = { readyState: 1, send: jest.fn() };
    openClients.push(client);
    return { client, ctx, events };
}

/** Drive a turn to the point where it is audibly speaking. */
function startSpeaking(client, tag) {
    client._handleEvent({ type: 'turn_start', turnId: `t-${tag}`, audioTag: tag });
    client._handleAudioFrame(audioFrame(tag, 22050));
    client._handleAudioFrame(audioFrame(tag, 22050));
}

describe('interrupt silences the tutor', () => {
    it('stops every scheduled source, not just the gain', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 111);
        expect(ctx.sources.length).toBe(2);
        expect(client.aiSpeaking).toBe(true);

        client._handleEvent({ type: 'interrupted', audioTag: 111, reason: 'user_barge_in' });

        // The old failure mode: sources still playing, gain back at 1.0.
        expect(ctx.sources.every(s => s.stopped)).toBe(true);
        expect(client.aiSpeaking).toBe(false);
    });

    it('leaves the output at full gain so the next turn is not born ducked', () => {
        const { client } = makeClient();
        startSpeaking(client, 222);
        client._fireBargeIn();
        expect(client.outGain.gain.value).toBeLessThan(1);

        client._handleEvent({ type: 'interrupted', audioTag: 222, reason: 'user_barge_in' });
        expect(client.outGain.gain.value).toBe(1);
        expect(client.ducked).toBe(false);
    });

    it('drops audio still in flight from the interrupted turn', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 333);
        client._handleEvent({ type: 'interrupted', audioTag: 333, reason: 'user_barge_in' });
        const afterInterrupt = ctx.sources.length;

        // Chunks the server had already flushed before it killed the turn.
        client._handleAudioFrame(audioFrame(333, 22050));
        client._handleAudioFrame(audioFrame(333, 22050));

        expect(ctx.sources.length).toBe(afterInterrupt);
    });

    it('does not let a dead turn play underneath its replacement', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 444);
        client._handleEvent({ type: 'interrupted', audioTag: 444, reason: 'user_barge_in' });

        // New turn begins; a straggler from the old turn arrives after it.
        client._handleEvent({ type: 'turn_start', turnId: 't-555', audioTag: 555 });
        const before = ctx.sources.length;
        client._handleAudioFrame(audioFrame(444, 22050));   // stale
        expect(ctx.sources.length).toBe(before);

        client._handleAudioFrame(audioFrame(555, 22050));   // current
        expect(ctx.sources.length).toBe(before + 1);
    });

    it('flushes queued audio when a new turn starts', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 666);
        client._handleEvent({ type: 'turn_start', turnId: 't-777', audioTag: 777 });
        expect(ctx.sources.every(s => s.stopped)).toBe(true);
    });

    it('clears everything queued on a tts_flush retraction', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 888);
        client._handleEvent({ type: 'tts_flush' });
        expect(ctx.sources.every(s => s.stopped)).toBe(true);
    });
});

describe('barge-in ducks before it decides', () => {
    it('ducks rather than stopping, and tells the server', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 100);
        client._fireBargeIn();

        // Audibly acknowledged, but the explanation is still recoverable.
        expect(client.ducked).toBe(true);
        expect(client.outGain.gain.value).toBeCloseTo(0.15, 5);
        expect(ctx.sources.some(s => s.stopped)).toBe(false);
        expect(client.ws.send).toHaveBeenCalledWith(
            expect.stringContaining('"barge_in"')
        );
    });

    it('comes back to full volume when the server says it was a backchannel', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 200);
        client._fireBargeIn();

        client._handleEvent({ type: 'resume_speaking', reason: 'backchannel' });

        expect(client.ducked).toBe(false);
        expect(client.outGain.gain.value).toBe(1);
        // The whole point: nothing was destroyed, the tutor finishes.
        expect(ctx.sources.some(s => s.stopped)).toBe(false);
        expect(client.aiSpeaking).toBe(true);
    });

    it('keeps accepting the turn\'s audio while ducked', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 300);
        client._fireBargeIn();
        const before = ctx.sources.length;
        client._handleAudioFrame(audioFrame(300, 22050));
        expect(ctx.sources.length).toBe(before + 1);
    });

    it('un-ducks on its own if no verdict ever arrives', () => {
        jest.useFakeTimers();
        try {
            const { client } = makeClient();
            startSpeaking(client, 400);
            client._fireBargeIn();
            expect(client.ducked).toBe(true);

            jest.advanceTimersByTime(2000);

            expect(client.ducked).toBe(false);
            expect(client.outGain.gain.value).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not duck when the tutor is not speaking', () => {
        const { client } = makeClient();
        client._fireBargeIn();
        expect(client.ducked).toBe(false);
        expect(client.ws.send).not.toHaveBeenCalled();
    });
});

describe('playback bookkeeping', () => {
    it('ignores completion timers left behind by a superseded turn', () => {
        // Each audio chunk arms a timer that reports "the tutor finished
        // speaking". Those timers survive an interrupt, so without the epoch
        // guard one of them lands mid-way through the NEXT turn and drops the
        // UI to "listening" while the tutor is still talking.
        jest.useFakeTimers();
        try {
            const { client, ctx, events } = makeClient();
            startSpeaking(client, 10);

            client._stopPlayback();          // interrupt: bumps the epoch
            events.length = 0;
            ctx.currentTime = 999;           // stale timers now look "finished"

            jest.advanceTimersByTime(5000);

            expect(events.filter(e => e.type === 'ai_speaking_ended')).toHaveLength(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it('releases source references as they finish so they cannot leak', () => {
        const { client, ctx } = makeClient();
        startSpeaking(client, 30);
        expect(client._liveSources.size).toBe(2);
        ctx.sources.forEach(s => s.onended && s.onended());
        expect(client._liveSources.size).toBe(0);
    });
});
