/**
 * Live Two-Minute Drill — projector sound (public/js/live-drill/sound.js), run against a fake
 * Web Audio graph. What these pin:
 *   - music is OFF until a teacher turns it on, crowd is on, and each switch is remembered;
 *   - the crowd is synthesized VOICES (pitched, formant-filtered, gated into words), never a
 *     looping noise bed — two noise beds in a row were heard as an ocean;
 *   - Sound (the master) silences everything, whatever the other two say;
 *   - the band plays only where the scene calls for it, and stops for the final.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/sound.js'), 'utf8');

function fakeAudio() {
  const made = { osc: 0, buffer: 0, oscs: [], filters: [], sources: [], gains: [], events: 0 };
  const t0 = Date.now();
  // every scheduled change to any param is counted: a syllable is two of them on a voice's gate
  const param = (v = 0) => ({
    value: v, setValueAtTime() { made.events++; }, cancelScheduledValues() {}, linearRampToValueAtTime(x) { this.value = x; },
    exponentialRampToValueAtTime() {}, setTargetAtTime(x, at) { made.events++; this.target = x; this.moves = (this.moves || 0) + 1; (this.at = this.at || []).push(at); },
  });
  const node = (extra) => ({ connect: (n) => n, start() {}, stop() {}, ...extra });
  class AC {
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
    get currentTime() { return (Date.now() - t0) / 1000; }
    resume() { return Promise.resolve(); }
    createGain() { const g = node({ gain: param(1) }); made.gains.push(g); return g; }
    createOscillator() { made.osc++; const o = node({ type: 'sine', frequency: param(440) }); made.oscs.push(o); return o; }
    createBiquadFilter() { const f = node({ type: 'lowpass', frequency: param(350), Q: param(1) }); made.filters.push(f); return f; }
    createBufferSource() { made.buffer++; const s = node({ buffer: null, loop: false }); made.sources.push(s); return s; }
    createStereoPanner() { return node({ pan: param(0) }); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  }
  return { AC, made };
}

/** The crowd schedules claps and whoops at random; a seeded Math.random keeps every run the same. */
function seededMath(seed = 12345) {
  let a = seed;
  const random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Object.assign(Object.create(Math), { random });
}

function load(store = new Map()) {
  const { AC, made } = fakeAudio();
  const window = { AudioContext: AC };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  vm.runInNewContext(SRC, { window, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, Math: seededMath(), Promise, Float32Array });
  return { S: window.LiveDrillSound, made, store };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('music starts off, crowd on, and both switches are remembered on this device', () => {
  const { S, store } = load();
  expect(S.musicOn).toBe(false);
  expect(S.crowdOn).toBe(true);
  S.setMusic(true); S.setCrowd(false);
  const again = load(store).S;
  expect(again.musicOn).toBe(true);
  expect(again.crowdOn).toBe(false);
});

test('with music off the lobby is quiet; turned on, the band plays', () => {
  const { S, made } = load();
  S.unlock();
  S.setScene('lobby');
  jest.advanceTimersByTime(2000);
  // Only the crowd: twelve voice oscillators, plus a few whoops out of the stands. No band yet.
  const voices = made.oscs.filter((o) => o.type === 'sawtooth').length;
  expect(voices).toBe(12);
  expect(made.osc).toBeLessThan(voices + 8);
  S.setMusic(true);
  jest.advanceTimersByTime(2000);
  expect(made.osc).toBeGreaterThan(voices + 14); // kicks, snares, bass…
});

test('the murmur is VOICES, not surf: pitched speakers with formants, syllable gating, and no noise bed', () => {
  const { S, made } = load();
  S.unlock();
  S.setScene('live');
  // The first two beds were filtered noise — one swelling band, then four flickering bands over a
  // low rumble — and students heard an ocean both times. Noise has no pitch; a crowd does.
  // (1) Twelve speakers, each a sawtooth at a human fundamental, all different.
  const voices = made.oscs.filter((o) => o.type === 'sawtooth');
  expect(voices).toHaveLength(12);
  for (const v of voices) { expect(v.frequency.value).toBeGreaterThan(90); expect(v.frequency.value).toBeLessThan(400); }
  expect(new Set(voices.map((v) => Math.round(v.frequency.value))).size).toBe(12);
  // (2) Two formant band-passes per voice, in the vowel range.
  const formants = made.filters.filter((f) => f.type === 'bandpass' && f.frequency.value >= 250 && f.frequency.value <= 2500);
  expect(formants.length).toBeGreaterThanOrEqual(24);
  // (3) NO looping noise bed under it — the rumble was the ocean. Every noise source is a short burst.
  expect(made.sources.every((src) => !src.loop)).toBe(true);
  expect(made.filters.some((f) => f.type === 'lowpass' && f.frequency.value <= 300)).toBe(false);
  // (4) The voices TALK: in three seconds the gates and formants are moved hundreds of times, at
  //     syllable speed — nothing in the bed moves slower than a word.
  const before = made.events;
  jest.advanceTimersByTime(3000);
  expect(made.events - before).toBeGreaterThan(150);
  for (const v of voices) expect(v.frequency.moves).toBeGreaterThan(0); // every speaker has said something
  // (5) The stands are alive: claps and consonants keep arriving while the game is live.
  const bursts = made.buffer;
  jest.advanceTimersByTime(4000);
  expect(made.buffer).toBeGreaterThan(bursts);
  // (6) Crowd off: every voice stops, no more words, no more claps.
  S.setCrowd(false);
  jest.advanceTimersByTime(2000);
  const quiet = { buffer: made.buffer, events: made.events };
  jest.advanceTimersByTime(4000);
  expect(made.buffer).toBe(quiet.buffer);
  expect(made.events).toBe(quiet.events);
});

test('a hotter game is more people talking, not a bigger wave: pauses shorten with hype', () => {
  const words = (hype) => {
    const { S, made } = load();
    S.unlock();
    S.setScene('live');
    S.setHype(hype);
    const before = made.events;
    jest.advanceTimersByTime(6000);
    return made.events - before;
  };
  expect(words(1)).toBeGreaterThan(words(0) * 1.3);
});

test('deep in the red zone the gym chants GO! GO! GO! — every voice on the same beat; at midfield nobody does', () => {
  // How many voice gates moved inside the same 60 ms window, at most: a chant is all twelve.
  const unison = (hype) => {
    const { S, made } = load();
    S.unlock();
    S.setScene('live');
    S.setHype(hype);
    const voices = made.oscs.filter((o) => o.type === 'sawtooth');
    jest.advanceTimersByTime(5000);
    const gates = made.gains.filter((g) => g.gain.at && g.gain.at.length).slice(0, 200);
    // the gates created right after each voice oscillator are the voices' own
    const onsets = voices.flatMap((o, i) => (gates[i] && gates[i].gain.at) || []).map((t) => Math.round(t / 0.06));
    const count = new Map();
    for (const b of onsets) count.set(b, (count.get(b) || 0) + 1);
    return Math.max(0, ...count.values());
  };
  expect(unison(0.9)).toBeGreaterThanOrEqual(10);
  expect(unison(0)).toBeLessThan(8);
});

test('the band stops for the final', () => {
  const { S, made } = load();
  S.setMusic(true);
  S.unlock();
  S.setScene('live');
  jest.advanceTimersByTime(1000);
  expect(made.osc).toBeGreaterThan(5); // it was playing
  S.setScene('final');
  jest.advanceTimersByTime(1500);
  const after = made.osc;
  jest.advanceTimersByTime(3000);
  expect(made.osc).toBe(after);
});

test('muted means silent: no cue, cheer or band makes a sound', () => {
  const { S, made } = load();
  S.setMusic(true);
  S.setMuted(true);
  S.unlock();
  S.setScene('lobby');
  const before = made.osc + made.buffer;
  S.horn(); S.cheer(true); S.groan(); S.whistle(); S.tick(true);
  jest.advanceTimersByTime(3000);
  expect(made.osc + made.buffer).toBe(before);
});

test('crowd off silences the cheers but not the horn', () => {
  const { S, made } = load();
  S.setCrowd(false);
  S.unlock();
  const before = made.buffer;
  S.cheer(true); S.groan();
  expect(made.buffer).toBe(before);
  const osc = made.osc;
  S.horn();
  expect(made.osc).toBeGreaterThan(osc);
});

test('nothing breaks before the first click unlocks audio', () => {
  const { S } = load();
  expect(() => { S.setScene('lobby'); S.setHype(0.7); S.cheer(true); S.horn(); S.setMusic(true); }).not.toThrow();
});
