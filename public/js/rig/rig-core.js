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
  };
});
