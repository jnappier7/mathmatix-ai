// public/js/rig/rig-core.js
// Pure animation math for layered PNG rigs (no DOM, no canvas): easing,
// keyframe sampling, clip layering, and hierarchical (FK) matrix composition.
// UMD so the browser gets `window.RigCore` and jest can `require()` it.
//
// Concepts:
//   rig    — parsed rig.json: parts with {pivot, z, parent, hidden}, slots, root.
//   clip   — {name, duration, loop, tracks: { "<part>.<prop>": [key...],
//             "slots.<slot>": [key...] }}. A key is {t, v, e?} where `e` is the
//             easing of the segment LEAVING that key. String values step.
//   pose   — flat map of sampled track values, e.g. {"head.rotation": -2.1}.
//   Props per part: rotation (deg, CW+), x, y (px, canvas space), scaleX,
//   scaleY, opacity. Defaults 0/0/0/1/1/1.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RigCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHANNEL_DEFAULTS = Object.freeze({
    rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1,
  });
  const CHANNELS = Object.freeze(Object.keys(CHANNEL_DEFAULTS));

  // ---------------------------------------------------------------- easing --
  const c1 = 1.70158;
  const EASINGS = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: (p) => 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2),
    outElastic: (p) => {
      if (p === 0 || p === 1) return p;
      return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
    outBounce: (p) => {
      const n1 = 7.5625; const d1 = 2.75;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
      if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
      return n1 * (p -= 2.625 / d1) * p + 0.984375;
    },
    step: () => 0, // hold the leaving key's value for the whole segment
  };
  const DEFAULT_EASING = 'inOutCubic';

  // ------------------------------------------------------------- sampling --
  function sortKeys(keys) {
    return [...keys].sort((a, b) => a.t - b.t);
  }

  // keys MUST be sorted by t. Strings always step; numbers ease.
  function sampleTrack(keys, t) {
    if (!keys || keys.length === 0) return undefined;
    if (t <= keys[0].t) {
      // before the first key: hold it (strings and numbers alike)
      return keys[0].v;
    }
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    // find segment [i, i+1] containing t (keys.length >= 2 here)
    let lo = 0; let hi = keys.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = keys[lo]; const b = keys[hi];
    if (typeof a.v === 'string' || typeof b.v === 'string') return a.v;
    const span = b.t - a.t;
    if (span <= 0) return b.v;
    const easeName = a.e || DEFAULT_EASING;
    const ease = EASINGS[easeName] || EASINGS[DEFAULT_EASING];
    if (easeName === 'step') return a.v;
    const p = ease((t - a.t) / span);
    return a.v + (b.v - a.v) * p;
  }

  function clipDuration(clip) {
    if (clip && Number.isFinite(clip.duration) && clip.duration > 0) return clip.duration;
    let max = 0;
    if (clip && clip.tracks) {
      for (const keys of Object.values(clip.tracks)) {
        for (const k of keys) max = Math.max(max, k.t);
      }
    }
    return max || 1;
  }

  // Sample every track of a clip at absolute time `time` (seconds).
  // Looping clips wrap; non-looping clips clamp at their last pose.
  function sampleClip(clip, time) {
    const pose = {};
    if (!clip || !clip.tracks) return pose;
    const dur = clipDuration(clip);
    let t = time;
    if (clip.loop && dur > 0) {
      t = ((time % dur) + dur) % dur;
    } else {
      t = Math.min(Math.max(time, 0), dur);
    }
    for (const [name, keys] of Object.entries(clip.tracks)) {
      if (!keys || keys.length === 0) continue;
      const v = sampleTrack(keys, t);
      if (v !== undefined) pose[name] = v;
    }
    return pose;
  }

  // Later poses override earlier ones, track by track (overlay semantics).
  function composePose(...poses) {
    return Object.assign({}, ...poses.filter(Boolean));
  }

  function getChannel(pose, part, prop) {
    const v = pose[part + '.' + prop];
    return v === undefined ? CHANNEL_DEFAULTS[prop] : v;
  }

  // ------------------------------------------------------------- matrices --
  // 2D affine matrix in canvas setTransform() order: [a, b, c, d, e, f]
  //   | a c e |
  //   | b d f |
  function matIdentity() { return [1, 0, 0, 1, 0, 0]; }

  function matMul(A, B) { // A · B (apply B first, then A)
    return [
      A[0] * B[0] + A[2] * B[1],
      A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3],
      A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4],
      A[1] * B[4] + A[3] * B[5] + A[5],
    ];
  }

  function matApply(M, x, y) {
    return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  }

  function matInvert(M) {
    const det = M[0] * M[3] - M[1] * M[2];
    if (!det) return null;
    const id = 1 / det;
    return [
      M[3] * id, -M[1] * id, -M[2] * id, M[0] * id,
      (M[2] * M[5] - M[3] * M[4]) * id,
      (M[1] * M[4] - M[0] * M[5]) * id,
    ];
  }

  // Local transform: translate by (x, y), then rotate/scale about the pivot.
  // M = T(x + px, y + py) · R(rot) · S(sx, sy) · T(-px, -py)
  function localMatrix(pivot, ch) {
    const px = pivot[0]; const py = pivot[1];
    const r = (ch.rotation || 0) * (Math.PI / 180);
    const cos = Math.cos(r); const sin = Math.sin(r);
    const sx = ch.scaleX === undefined ? 1 : ch.scaleX;
    const sy = ch.scaleY === undefined ? 1 : ch.scaleY;
    const a = cos * sx; const b = sin * sx;
    const c = -sin * sy; const d = cos * sy;
    return [
      a, b, c, d,
      (ch.x || 0) + px - (a * px + c * py),
      (ch.y || 0) + py - (b * px + d * py),
    ];
  }

  function channelsFor(pose, node) {
    return {
      rotation: getChannel(pose, node, 'rotation'),
      x: getChannel(pose, node, 'x'),
      y: getChannel(pose, node, 'y'),
      scaleX: getChannel(pose, node, 'scaleX'),
      scaleY: getChannel(pose, node, 'scaleY'),
      opacity: getChannel(pose, node, 'opacity'),
    };
  }

  // World transform + accumulated opacity for every part (and virtual root).
  // Returns { [name]: { matrix, opacity } }.
  function computeWorldTransforms(rig, pose) {
    const out = {};
    const rootPivot = (rig.root && rig.root.pivot) || [
      rig.canvas[0] / 2, rig.canvas[1] / 2,
    ];
    const rootCh = channelsFor(pose, 'root');
    out.root = { matrix: localMatrix(rootPivot, rootCh), opacity: rootCh.opacity };

    const resolve = (name, stack) => {
      if (out[name]) return out[name];
      const part = rig.parts[name];
      if (!part) return out.root;
      if (stack.has(name)) return out.root; // cycle guard
      stack.add(name);
      const parent = resolve(part.parent && rig.parts[part.parent] ? part.parent : 'root', stack);
      const ch = channelsFor(pose, name);
      out[name] = {
        matrix: matMul(parent.matrix, localMatrix(part.pivot, ch)),
        opacity: parent.opacity * ch.opacity,
      };
      return out[name];
    };
    for (const name of Object.keys(rig.parts)) resolve(name, new Set());
    return out;
  }

  // --------------------------------------------------------------- slots --
  // Which part is visible for each slot given the pose; returns
  // { [partName]: boolean } covering every part that belongs to some slot.
  function resolveSlotVisibility(rig, pose) {
    const vis = {};
    if (!rig.slots) return vis;
    for (const [slotName, slot] of Object.entries(rig.slots)) {
      const active = pose['slots.' + slotName] !== undefined
        ? pose['slots.' + slotName] : slot.default;
      for (const [state, partName] of Object.entries(slot.states)) {
        vis[partName] = state === active;
      }
    }
    return vis;
  }

  function isPartVisible(rig, pose, name, slotVis) {
    if (slotVis && Object.prototype.hasOwnProperty.call(slotVis, name)) {
      return slotVis[name];
    }
    return !rig.parts[name].hidden;
  }

  // Draw order: ascending z, ties broken by declaration order.
  function drawOrder(rig) {
    return Object.keys(rig.parts)
      .map((name, i) => ({ name, z: rig.parts[name].z || 0, i }))
      .sort((a, b) => (a.z - b.z) || (a.i - b.i))
      .map((e) => e.name);
  }

  // ----------------------------------------------------------- validation --
  const TRACK_RE = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$|^slots\.([A-Za-z0-9_]+)$/;

  function validateClip(clip, rig) {
    const errors = [];
    if (!clip || typeof clip !== 'object') return ['clip is not an object'];
    if (!clip.tracks || typeof clip.tracks !== 'object') errors.push('clip.tracks missing');
    if (clip.duration !== undefined && !(Number.isFinite(clip.duration) && clip.duration > 0)) {
      errors.push('clip.duration must be a positive number');
    }
    for (const [name, keys] of Object.entries(clip.tracks || {})) {
      const slotMatch = /^slots\.([A-Za-z0-9_]+)$/.exec(name);
      const partMatch = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(name);
      let slot = null;
      if (slotMatch) {
        slot = rig.slots && rig.slots[slotMatch[1]];
        if (!slot) { errors.push(`unknown slot: ${name}`); continue; }
      } else if (partMatch) {
        const [, part, prop] = partMatch;
        if (part !== 'root' && !rig.parts[part]) { errors.push(`unknown part: ${name}`); continue; }
        if (!CHANNELS.includes(prop)) { errors.push(`unknown property: ${name}`); continue; }
      } else {
        errors.push(`malformed track name: ${name}`); continue;
      }
      if (!Array.isArray(keys)) { errors.push(`${name}: keys is not an array`); continue; }
      let prev = -Infinity;
      for (const k of keys) {
        if (!k || !Number.isFinite(k.t) || k.t < 0) { errors.push(`${name}: bad key time`); break; }
        if (k.t < prev) { errors.push(`${name}: keys out of order`); break; }
        prev = k.t;
        if (slot) {
          if (typeof k.v !== 'string' || !slot.states[k.v]) {
            errors.push(`${name}: unknown state "${k.v}"`); break;
          }
        } else if (!Number.isFinite(k.v)) {
          errors.push(`${name}: non-finite value`); break;
        }
        if (k.e !== undefined && !EASINGS[k.e]) { errors.push(`${name}: unknown easing "${k.e}"`); break; }
      }
    }
    return errors;
  }

  function newClip(name) {
    return { name: name || 'untitled', duration: 2, loop: true, tracks: {} };
  }

  // ------------------------------------------------- secondary motion ------
  // Spring-driven follow-through: for each part in rig.secondaryMotion, the
  // rendered local rotation chases the animated value with a damped spring,
  // and reacts to the parent chain's angular velocity (a fast arm swing makes
  // the hand lag and overshoot; the tie sways when the torso turns).
  //
  // Config per part (in rig.json):
  //   { stiffness, damping, react, max }
  //     stiffness/damping — spring constants (≈ 60–300 / 10–30)
  //     react             — deg of deflection per deg/s of parent velocity
  //     max               — deflection clamp in degrees
  //
  // state is carried between calls: { [part]: {value, velocity, parentAngle} }.
  // Deterministic for a fixed dt sequence (exports use dt = 1/fps).

  function chainAngle(rig, pose, part) {
    // Sum of local rotations up the parent chain (cheap world-angle proxy).
    let angle = 0;
    let node = rig.parts[part] && rig.parts[part].parent;
    const seen = new Set();
    while (node && node !== 'root' && rig.parts[node] && !seen.has(node)) {
      seen.add(node);
      angle += getChannel(pose, node, 'rotation');
      node = rig.parts[node].parent;
    }
    return angle + getChannel(pose, 'root', 'rotation');
  }

  function newSpringState() { return {}; }

  // Returns a NEW pose with sprung rotations; mutates `state`.
  function stepSecondaryMotion(rig, pose, state, dt) {
    const cfgAll = rig.secondaryMotion;
    if (!cfgAll || dt <= 0) return pose;
    const out = { ...pose };
    const step = Math.min(dt, 0.05); // clamp huge frame gaps for stability
    for (const [part, cfg] of Object.entries(cfgAll)) {
      if (!rig.parts[part]) continue;
      const animated = getChannel(pose, part, 'rotation');
      const parentAngle = chainAngle(rig, pose, part);
      let s = state[part];
      if (!s) {
        s = { value: animated, velocity: 0, parentAngle };
        state[part] = s;
      }
      const parentVel = (parentAngle - s.parentAngle) / step; // deg/s
      s.parentAngle = parentAngle;
      const max = cfg.max === undefined ? 15 : cfg.max;
      const react = cfg.react || 0;
      const deflect = Math.max(-max, Math.min(max, -parentVel * react));
      const target = animated + deflect;
      // semi-implicit Euler, substepped for stiff springs at low fps
      const substeps = Math.max(1, Math.ceil(step / (1 / 120)));
      const h = step / substeps;
      const k = cfg.stiffness === undefined ? 160 : cfg.stiffness;
      const c = cfg.damping === undefined ? 18 : cfg.damping;
      for (let i = 0; i < substeps; i++) {
        s.velocity += (k * (target - s.value) - c * s.velocity) * h;
        s.value += s.velocity * h;
      }
      // never drift further than max from the animated pose
      s.value = Math.max(animated - max, Math.min(animated + max, s.value));
      out[part + '.rotation'] = s.value;
    }
    return out;
  }

  // --------------------------------------------------- micro motion --------
  // "Moving hold": deterministic sub-degree drift so held poses stay alive.
  // rig.microMotion maps track names to { amp, freq } — two detuned sines,
  // a pure function of t (no state; exports and live playback agree).
  function applyMicroMotion(rig, pose, t) {
    const cfg = rig.microMotion;
    if (!cfg) return pose;
    const out = { ...pose };
    let i = 0;
    for (const [track, m] of Object.entries(cfg)) {
      const phase = i++ * 1.7; // decorrelate channels
      const wobble = m.amp * (
        0.62 * Math.sin(2 * Math.PI * m.freq * t + phase)
        + 0.38 * Math.sin(2 * Math.PI * m.freq * 2.7 * t + phase * 2.3)
      );
      const parts = track.split('.');
      const base = out[track] !== undefined ? out[track] : CHANNEL_DEFAULTS[parts[1]];
      if (typeof base === 'number') out[track] = base + wobble;
    }
    return out;
  }

  // ----------------------------------------------------------- IK ----------
  // CCD solver: adjusts the local rotation of each chain part (child-first,
  // e.g. ['forearm_L','upper_arm_L']) so that `effector`'s pivot reaches
  // `target` (rig space). Returns a NEW pose; original is untouched.
  function solveIK(rig, pose, chain, effector, target, {
    iterations = 10, tolerance = 1, maxStep = 30,
  } = {}) {
    const out = { ...pose };
    const effPivot = rig.parts[effector].pivot;
    for (let it = 0; it < iterations; it++) {
      const world = computeWorldTransforms(rig, out);
      const [ex, ey] = matApply(world[effector].matrix, effPivot[0], effPivot[1]);
      if (Math.hypot(target[0] - ex, target[1] - ey) < tolerance) break;
      for (const bone of chain) {
        const w = computeWorldTransforms(rig, out);
        const [cx, cy] = matApply(w[effector].matrix, effPivot[0], effPivot[1]);
        const bonePivot = rig.parts[bone].pivot;
        const [bx, by] = matApply(w[bone].matrix, bonePivot[0], bonePivot[1]);
        const a0 = Math.atan2(cy - by, cx - bx);
        const a1 = Math.atan2(target[1] - by, target[0] - bx);
        let delta = (a1 - a0) * 180 / Math.PI;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        delta = Math.max(-maxStep, Math.min(maxStep, delta));
        out[bone + '.rotation'] = getChannel(out, bone, 'rotation') + delta;
      }
    }
    return out;
  }

  // ------------------------------------------------------ sequences --------
  // A sequence is a long-form composition: a looping base clip with clips
  // scheduled on top, e.g. a 90s explainer (idle + talk 4–12s + wave at 2s).
  //   { name, duration, base: 'idle',
  //     events: [{ clip, t, until? }] }   — `until` bounds LOOPING clips;
  //                                         one-shots always play once.
  // Evaluation is pure layering: base first, events in array order on top.
  function evaluateSequence(seq, clipsByName, t) {
    let pose = {};
    const base = seq && seq.base && clipsByName[seq.base];
    if (base) pose = sampleClip(base, t);
    if (!seq || !seq.events) return pose;
    for (const ev of seq.events) {
      const clip = clipsByName[ev.clip];
      if (!clip) continue;
      const local = t - ev.t;
      if (local < 0) continue;
      const dur = clipDuration(clip);
      const active = clip.loop
        ? t < (ev.until !== undefined ? ev.until : ev.t + dur)
        : local <= dur;
      if (active) pose = composePose(pose, sampleClip(clip, local));
    }
    return pose;
  }

  function validateSequence(seq, clipsByName) {
    const errors = [];
    if (!seq || typeof seq !== 'object') return ['sequence is not an object'];
    if (!(Number.isFinite(seq.duration) && seq.duration > 0)) {
      errors.push('sequence.duration must be a positive number');
    }
    if (seq.base && !clipsByName[seq.base]) errors.push(`unknown base clip: ${seq.base}`);
    for (const [i, ev] of (seq.events || []).entries()) {
      if (!clipsByName[ev.clip]) errors.push(`event ${i}: unknown clip "${ev.clip}"`);
      if (!Number.isFinite(ev.t) || ev.t < 0) errors.push(`event ${i}: bad start time`);
      if (ev.until !== undefined && !(Number.isFinite(ev.until) && ev.until > ev.t)) {
        errors.push(`event ${i}: until must be after t`);
      }
    }
    return errors;
  }

  // ------------------------------------------------------- lip sync --------
  // Turn a windowed RMS envelope of a voiceover into a slots.mouth track.
  // rms: array of per-window RMS values; windowSec: seconds per window.
  // Auto-thresholds from the envelope (noise floor → speech), applies
  // hysteresis, drops blips, and splits long holds into flaps so sustained
  // speech reads as talking rather than a frozen open mouth.
  function lipSyncFromRms(rms, windowSec, opts = {}) {
    if (!rms || rms.length === 0) return [];
    const sorted = [...rms].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    // 2%/98% percentiles: the true noise floor and speech level survive even
    // when the recording is mostly continuous speech with little silence.
    const floor = q(0.02);
    const peak = q(0.98);
    if (peak - floor < 1e-6) return []; // silence or constant tone
    const open = opts.threshold !== undefined ? opts.threshold : floor + 0.22 * (peak - floor);
    const close = open * (opts.hysteresis !== undefined ? opts.hysteresis : 0.7);
    const minOpen = opts.minOpen !== undefined ? opts.minOpen : 0.06;
    const minClose = opts.minClose !== undefined ? opts.minClose : 0.05;
    const maxHold = opts.maxHold !== undefined ? opts.maxHold : 0.28;
    const flapGap = opts.flapGap !== undefined ? opts.flapGap : 0.07;

    // 1. raw open/close spans with hysteresis
    const spans = [];
    let openAt = null;
    for (let i = 0; i < rms.length; i++) {
      const t = i * windowSec;
      if (openAt === null && rms[i] >= open) openAt = t;
      else if (openAt !== null && rms[i] < close) { spans.push([openAt, t]); openAt = null; }
    }
    if (openAt !== null) spans.push([openAt, rms.length * windowSec]);

    // 2. merge tiny gaps, drop tiny blips
    const merged = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span[0] - last[1] < minClose) last[1] = span[1];
      else merged.push([...span]);
    }
    const clean = merged.filter(([a, b]) => b - a >= minOpen);

    // 3. split sustained spans into flaps, emit step keys
    const keys = [];
    let cursor = 0; // last emitted state end; rest is implicit before first key
    for (const [a, b] of clean) {
      if (keys.length === 0 || a > cursor) keys.push({ t: a, v: 'ah', e: 'step' });
      else keys.push({ t: cursor, v: 'ah', e: 'step' });
      let pos = a;
      while (b - pos > maxHold + flapGap + minOpen) {
        pos += maxHold;
        keys.push({ t: pos, v: 'rest', e: 'step' });
        pos += flapGap;
        keys.push({ t: pos, v: 'ah', e: 'step' });
      }
      keys.push({ t: b, v: 'rest', e: 'step' });
      cursor = b;
    }
    // ensure the track starts closed if speech starts late
    if (keys.length && keys[0].t > 0.01) keys.unshift({ t: 0, v: 'rest', e: 'step' });
    return keys;
  }

  // -------------------------------------------- audio-driven performance --
  // Derive a gesture performance from a voiceover's RMS envelope — the
  // "animate from audio" director. Prosody only (no transcript): phrases,
  // pauses, and energy peaks become gesture cues:
  //   greeting — first phrase starts        → e.g. wave
  //   beat     — energy peak mid-phrase     → e.g. head/brow accent
  //   affirm   — a phrase lands             → e.g. nod
  //   ponder   — a long pause               → e.g. thinking (bounded by until)
  //   closing  — final phrase starts        → e.g. celebrate
  // Returns [{ type, t, until? }] sorted by t. Deterministic.
  function gestureCuesFromRms(rms, windowSec, opts = {}) {
    if (!rms || rms.length === 0) return [];
    const sorted = [...rms].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    // 2%/98% percentiles: the true noise floor and speech level survive even
    // when the recording is mostly continuous speech with little silence.
    const floor = q(0.02);
    const peak = q(0.98);
    if (peak - floor < 1e-6) return [];
    const open = floor + 0.22 * (peak - floor);
    const close = open * 0.7;
    const minPhrase = opts.minPhrase !== undefined ? opts.minPhrase : 0.5;
    const mergeGap = opts.mergeGap !== undefined ? opts.mergeGap : 0.4;
    const ponderMin = opts.ponderMin !== undefined ? opts.ponderMin : 1.1;
    const beatSpacing = opts.beatSpacing !== undefined ? opts.beatSpacing : 2.5;
    const cueSpacing = opts.cueSpacing !== undefined ? opts.cueSpacing : 1.2;

    // 1. speech spans with hysteresis → phrases
    const spans = [];
    let openAt = null;
    for (let i = 0; i < rms.length; i++) {
      const t = i * windowSec;
      if (openAt === null && rms[i] >= open) openAt = t;
      else if (openAt !== null && rms[i] < close) { spans.push([openAt, t]); openAt = null; }
    }
    if (openAt !== null) spans.push([openAt, rms.length * windowSec]);
    const merged = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] - last[1] < mergeGap) last[1] = s[1];
      else merged.push([...s]);
    }
    const phrases = merged.filter(([a, b]) => b - a >= minPhrase);
    if (!phrases.length) return [];

    const cues = [];
    // 2. greeting / closing
    cues.push({ type: 'greeting', t: Math.max(0, phrases[0][0] - 0.1) });
    if (phrases.length > 1) {
      cues.push({ type: 'closing', t: phrases[phrases.length - 1][0] });
    }
    // 3. ponder during long pauses
    for (let i = 0; i + 1 < phrases.length; i++) {
      const gapStart = phrases[i][1];
      const gapEnd = phrases[i + 1][0];
      if (gapEnd - gapStart >= ponderMin) {
        cues.push({ type: 'ponder', t: gapStart + 0.15, until: gapEnd });
      }
    }
    // 4. affirm as interior phrases land (every other one, keeps it human)
    for (let i = 1; i < phrases.length - 1; i += 2) {
      cues.push({ type: 'affirm', t: Math.max(0, phrases[i][1] - 0.3) });
    }
    // 5. beats on energy peaks inside phrases
    const half = Math.max(1, Math.round(0.25 / windowSec));
    let lastBeat = -Infinity;
    for (const [a, b] of phrases) {
      const i0 = Math.round(a / windowSec);
      const i1 = Math.min(rms.length - 1, Math.round(b / windowSec));
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += rms[i];
      const avg = sum / Math.max(1, i1 - i0 + 1);
      for (let i = i0 + half; i <= i1 - half; i++) {
        if (rms[i] < avg * 1.15) continue;
        let isPeak = true;
        for (let j = i - half; j <= i + half; j++) {
          if (rms[j] > rms[i]) { isPeak = false; break; }
        }
        if (!isPeak) continue;
        const t = i * windowSec;
        if (t - lastBeat < beatSpacing) continue;
        lastBeat = t;
        cues.push({ type: 'beat', t });
      }
    }
    // 6. sort; thin out beats/affirms that crowd structural cues
    cues.sort((x, y) => x.t - y.t);
    const kept = [];
    for (const cue of cues) {
      const prev = kept[kept.length - 1];
      const structural = cue.type === 'greeting' || cue.type === 'closing' || cue.type === 'ponder';
      if (!structural && prev && cue.t - prev.t < cueSpacing) continue;
      kept.push(cue);
    }
    return kept;
  }

  return {
    CHANNELS,
    CHANNEL_DEFAULTS,
    EASINGS,
    DEFAULT_EASING,
    TRACK_RE,
    sortKeys,
    sampleTrack,
    sampleClip,
    clipDuration,
    composePose,
    getChannel,
    matIdentity,
    matMul,
    matApply,
    matInvert,
    localMatrix,
    computeWorldTransforms,
    resolveSlotVisibility,
    isPartVisible,
    drawOrder,
    validateClip,
    newClip,
    chainAngle,
    newSpringState,
    stepSecondaryMotion,
    applyMicroMotion,
    solveIK,
    evaluateSequence,
    validateSequence,
    lipSyncFromRms,
    gestureCuesFromRms,
  };
});
