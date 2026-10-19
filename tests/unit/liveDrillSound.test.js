/**
 * Live Two-Minute Drill — projector sound (public/js/live-drill/sound.js), run against a fake
 * Web Audio graph. What these pin:
 *   - music is OFF until a teacher turns it on, crowd is on, and each switch is remembered;
 *   - Sound (the master) silences everything, whatever the other two say;
 *   - the band plays only where the scene calls for it, and stops for the final.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/sound.js'), 'utf8');

function fakeAudio() {
  const made = { osc: 0, buffer: 0 };
  const t0 = Date.now();
  const param = (v = 0) => ({ value: v, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime(x) { this.value = x; }, exponentialRampToValueAtTime() {} });
  const node = (extra) => ({ connect: (n) => n, start() {}, stop() {}, ...extra });
  class AC {
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
    get currentTime() { return (Date.now() - t0) / 1000; }
    resume() { return Promise.resolve(); }
    createGain() { return node({ gain: param(1) }); }
    createOscillator() { made.osc++; return node({ type: 'sine', frequency: param(440) }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(350), Q: param(1) }); }
    createBufferSource() { made.buffer++; return node({ buffer: null, loop: false }); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  }
  return { AC, made };
}

function load(store = new Map()) {
  const { AC, made } = fakeAudio();
  const window = { AudioContext: AC };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  vm.runInNewContext(SRC, { window, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, Math, Promise, Float32Array });
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
  expect(made.osc).toBe(1); // only the crowd murmur's slow LFO
  S.setMusic(true);
  jest.advanceTimersByTime(2000);
  expect(made.osc).toBeGreaterThan(10); // kicks, snares, bass…
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
