// Build a seamless ambient crowd loop from the two cheer recordings: a grain cloud of their bodies.
// Output: murmur.f32 (mono 44.1k) = 1 s lead-in + 24 s seamless loop + 1 s tail, so the player can
// loop [1, 25] away from the codec's edges.
const fs = require('fs');
const SR = 44100;
const load = (f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
const srcs = [
  { x: load('cheer-big.f32'), from: 0.6, to: 4.2 },  // the body, before the fade
  { x: load('cheer.f32'), from: 0.9, to: 3.9 },
];
let seed = 20261105;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const LOOP = 24, OUT = LOOP + 3; // 1 s lead-in, the loop, 2 s for the crossfade and tail
const out = new Float32Array(SR * OUT);
// grains: a new one every ~70 ms, 350–900 ms long, Hann window, pitch ±8 % (resampled), level 0.4–1
for (let t = 0; t < OUT; t += 0.05 + rnd() * 0.04) {
  const s = srcs[rnd() < 0.6 ? 0 : 1];
  const len = 0.35 + rnd() * 0.55;
  const ratio = 0.92 + rnd() * 0.16;
  const gain = 0.4 + rnd() * 0.6;
  const start = s.from + rnd() * (s.to - s.from - len * ratio);
  const n = Math.round(len * SR);
  const o0 = Math.round(t * SR);
  for (let i = 0; i < n && o0 + i < out.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const p = (start * SR) + i * ratio; const k = Math.floor(p); const f = p - k;
    const v = s.x[k] * (1 - f) + (s.x[k + 1] || 0) * f;
    out[o0 + i] += v * w * gain;
  }
}
// distance: a gentle two-pole low-pass around 2.2 kHz (voices stay, hiss goes)
function lowpass(x, fc) {
  const w0 = 2 * Math.PI * fc / SR, q = 0.6, a = Math.sin(w0) / (2 * q), c = Math.cos(w0);
  const b0 = (1 - c) / 2, b1 = 1 - c, b2 = (1 - c) / 2, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
}
lowpass(out, 2200);
// seamless loop over [1, 25]: fold the 2 s past the loop end back over the 2 s after the loop start
const L0 = SR * 1, L1 = SR * (1 + LOOP), X = SR * 2;
for (let i = 0; i < X; i++) {
  const f = i / X; // 0 → 1 across the crossfade
  const a = out[L0 + i], b = out[L1 + i];
  out[L0 + i] = a * Math.sqrt(f) + b * Math.sqrt(1 - f); // equal-power
}
// the tail after the loop end must equal the lead-in after the loop start, and the lead-in before
// the loop start must equal what precedes the loop end — so a decoder's padding never shows
for (let i = 0; i < SR; i++) { out[L1 + i] = out[L0 + i]; out[L0 - SR + i] = out[L1 - SR + i]; }
// normalise to −6 dBFS peak
let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
const g = 0.5 / peak; for (let i = 0; i < out.length; i++) out[i] *= g;
for (const v of out) if (Number.isNaN(v)) throw new Error('NaN in output');
fs.writeFileSync('murmur.f32', Buffer.from(out.buffer));
let e = 0; for (let i = L0; i < L1; i++) e += out[i] * out[i];
console.log('loop rms', Math.sqrt(e / LOOP / SR).toFixed(3), 'peak', 0.5, 'seconds', OUT);
