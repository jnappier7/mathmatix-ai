/**
 * The record-and-upload voice path must SEND the turn when the student stops.
 *
 * Owner's iPhone, 2026-11-26: voice mode sat on "Processing…" with the mic
 * open, forever. A phone's mic processing turns the room back up the moment
 * the student stops talking (automatic gain), after having gated it down to
 * near silence (noise suppression). The old detector read that returning room
 * noise as speech, cancelled its countdown on every loud frame, and never
 * committed a turn.
 *
 * These replay level traces (dBFS per 50 ms frame) through the detector.
 */
const fs = require('fs');
const path = require('path');
const { VoiceEndpointer } = require('../../public/js/voice-controller.js');

const FRAME = 50;

// Deterministic noise so a failure reproduces.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Run frames through a detector; return [{ t, event }] for every event. */
function run(ep, frames, dt = FRAME) {
  const events = [];
  let t = 0;
  for (const db of frames) {
    t += dt;
    const event = ep.push(db, dt);
    if (event) events.push({ t, event });
  }
  return events;
}

const seq = (ms, fn) => Array.from({ length: Math.round(ms / FRAME) }, (_, i) => fn(i));
const speech = (ms, level = -22, r = rng(1)) => seq(ms, () => level + (r() - 0.5) * 8);
const room = (ms, level, r = rng(2), spread = 6) => seq(ms, () => level + (r() - 0.5) * spread);
const endOf = (events) => events.find((e) => e.event === 'end');

test('a quiet room: the turn is sent one silence window after the student stops', () => {
  const ep = new VoiceEndpointer();
  const frames = [...room(1000, -70), ...speech(2000), ...room(4000, -70)];
  const events = run(ep, frames);
  expect(events[0].event).toBe('speech');
  const end = endOf(events);
  expect(end).toBeDefined();
  // speech ends at 3000 ms; 2500 ms of silence later, give or take a frame.
  expect(end.t).toBeGreaterThanOrEqual(5400);
  expect(end.t).toBeLessThanOrEqual(5700);
});

test('the phone: noise gated to silence, then gained back UP after the student stops', () => {
  // Before speech the suppressor holds the room near digital silence. After
  // it, automatic gain lifts the same room to -50 dBFS with spikes to -44 —
  // 40 dB over the quietest frame, which the old "8 dB over the floor" gate
  // heard as talking, indefinitely.
  const r = rng(7);
  const pumped = seq(8000, (i) => (i % 6 === 0 ? -44 : -50 + (r() - 0.5) * 6));
  const ep = new VoiceEndpointer();
  const events = run(ep, [...room(800, -95), ...speech(2500), ...pumped]);
  const end = endOf(events);
  expect(end).toBeDefined();
  expect(end.t).toBeLessThanOrEqual(800 + 2500 + 2500 + 400);
  expect(events.filter((e) => e.event === 'resume')).toHaveLength(0);
});

test('one loud frame in a pause (a pencil, a chair) does not restart the wait', () => {
  const ep = new VoiceEndpointer();
  const pause = room(4000, -65);
  for (let i = 8; i < pause.length; i += 12) pause[i] = -18;   // a click every 600 ms
  const events = run(ep, [...room(500, -65), ...speech(1500), ...pause]);
  const end = endOf(events);
  expect(end).toBeDefined();
  expect(end.t).toBeLessThanOrEqual(500 + 1500 + 2500 + 200);
});

test('a student who pauses to think and goes on is NOT cut off', () => {
  const ep = new VoiceEndpointer();
  const frames = [
    ...room(500, -65),
    ...speech(1500),
    ...room(1800, -65),          // "um…" — shorter than the silence window
    ...speech(1500, -22, rng(3)),
    ...room(3500, -65),
  ];
  const events = run(ep, frames);
  expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(['pause', 'resume', 'end']));
  const end = endOf(events);
  // The turn ends after the SECOND stretch of speech (which stops at 5300 ms).
  expect(end.t).toBeGreaterThanOrEqual(5300 + 2400);
});

test('short bursts add up to a turn: "um… nine… I think"', () => {
  const ep = new VoiceEndpointer();
  const burst = () => [...speech(300), ...room(150, -65)];
  const events = run(ep, [...room(500, -65), ...burst(), ...burst(), ...burst(), ...burst(), ...room(3500, -65)]);
  expect(events[0].event).toBe('speech');
  expect(endOf(events)).toBeDefined();
});

test('a cough and a chair never make a turn', () => {
  const ep = new VoiceEndpointer();
  const frames = room(20000, -65);
  for (let i = 20; i < frames.length; i += 40) { frames[i] = -15; frames[i + 1] = -20; }   // 100 ms every 2 s
  expect(run(ep, frames)).toEqual([]);
});

test('a quiet speaker is still heard', () => {
  const ep = new VoiceEndpointer();
  const events = run(ep, [...room(800, -72), ...speech(2000, -44), ...room(3500, -72)]);
  expect(events[0].event).toBe('speech');
  expect(endOf(events)).toBeDefined();
});

test('steady classroom noise: the floor follows the room, the turn still ends', () => {
  // Chatter at -42 the whole time; the student talks over it at -20.
  const ep = new VoiceEndpointer();
  const events = run(ep, [...room(3000, -42, rng(5), 8), ...speech(2500, -20), ...room(6000, -42, rng(6), 8)]);
  expect(events[0].event).toBe('speech');
  expect(events[0].t).toBeGreaterThan(3000);            // the chatter alone was not a turn
  expect(endOf(events)).toBeDefined();
});

test('no room can hold the mic open: a turn is sent at the cap regardless', () => {
  const ep = new VoiceEndpointer({ maxTurnMs: 45000 });
  const events = run(ep, [...room(500, -65), ...speech(120000)]);   // "speech" that never stops
  const end = endOf(events);
  expect(end).toBeDefined();
  expect(end.t).toBeLessThanOrEqual(500 + 45000 + 600);
});

test('a backgrounded tab (1 s timer ticks) still ends the turn', () => {
  const ep = new VoiceEndpointer();
  run(ep, [...room(500, -65), ...speech(1500)]);
  const events = run(ep, [-65, -65, -65, -65], 1000);
  expect(endOf(events)).toBeDefined();
});

test('it reports the end exactly once', () => {
  const ep = new VoiceEndpointer();
  const events = run(ep, [...room(500, -65), ...speech(1500), ...room(10000, -65)]);
  expect(events.filter((e) => e.event === 'end')).toHaveLength(1);
});

describe('the controller around it', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/js/voice-controller.js'), 'utf8');

  test('the status label never claims "Processing" while the mic is still open', () => {
    // The label and the caption chip disagreed on screen ("Listening" above,
    // "Processing…" below). The label now changes only through updateUI.
    expect(src).not.toMatch(/Processing\.\.\./);
  });

  test('a failed upload cannot strand the orb on "Thinking…"', () => {
    // The request used to run inside a FileReader callback, outside the try.
    const body = src.slice(src.indexOf('async sendAudioToBackend('), src.indexOf('VOICE OUTPUT (Text-to-Speech)'));
    expect(body).not.toMatch(/reader\.onloadend = async/);
    expect(body).toMatch(/catch \(error\)[\s\S]*updateUI\('error'\)/);
  });
});
