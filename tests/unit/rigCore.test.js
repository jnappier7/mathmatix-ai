// tests/unit/rigCore.test.js
// Pure-math coverage for the rig animation core that powers the animation
// studio and the RigPlayer runtime (public/js/rig/rig-core.js): easing,
// keyframe sampling, clip layering, slot resolution, and FK matrix math.

const Core = require('../../public/js/rig/rig-core');

const RIG = {
  canvas: [1000, 1000],
  root: { pivot: [500, 500] },
  parts: {
    torso: { pivot: [500, 600], z: 40, parent: 'root' },
    head: { pivot: [500, 300], z: 60, parent: 'torso' },
    mouth: { pivot: [500, 250], z: 63, parent: 'head' },
    mouth_ah: { pivot: [500, 250], z: 63, parent: 'head', hidden: true },
    arm: { pivot: [400, 450], z: 30, parent: 'torso' },
    forearm: { pivot: [350, 550], z: 31, parent: 'arm' },
    hand: { pivot: [330, 650], z: 32, parent: 'forearm' },
  },
  slots: {
    mouth: { default: 'rest', states: { rest: 'mouth', ah: 'mouth_ah' } },
  },
};

describe('easing', () => {
  test('all easings map 0→0 and 1→1 (except step, which holds)', () => {
    for (const [name, fn] of Object.entries(Core.EASINGS)) {
      if (name === 'step') continue;
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
    }
    expect(Core.EASINGS.step(0.99)).toBe(0);
  });

  test('inOutCubic is symmetric around the midpoint', () => {
    const f = Core.EASINGS.inOutCubic;
    expect(f(0.5)).toBeCloseTo(0.5, 6);
    expect(f(0.25) + f(0.75)).toBeCloseTo(1, 6);
  });
});

describe('sampleTrack', () => {
  const keys = [
    { t: 0, v: 0, e: 'linear' },
    { t: 1, v: 10, e: 'linear' },
    { t: 2, v: -10 },
  ];

  test('holds first value before the first key', () => {
    expect(Core.sampleTrack(keys, -5)).toBe(0);
  });

  test('holds last value after the last key', () => {
    expect(Core.sampleTrack(keys, 99)).toBe(-10);
  });

  test('interpolates linearly inside a linear segment', () => {
    expect(Core.sampleTrack(keys, 0.5)).toBeCloseTo(5);
    expect(Core.sampleTrack(keys, 0.25)).toBeCloseTo(2.5);
  });

  test('lands exactly on key values at key times', () => {
    expect(Core.sampleTrack(keys, 1)).toBe(10);
    expect(Core.sampleTrack(keys, 2)).toBe(-10);
  });

  test('string values step (never interpolate)', () => {
    const slots = [
      { t: 0, v: 'rest', e: 'step' },
      { t: 1, v: 'ah', e: 'step' },
    ];
    expect(Core.sampleTrack(slots, 0.999)).toBe('rest');
    expect(Core.sampleTrack(slots, 1)).toBe('ah');
  });

  test('step easing holds the leaving key for numbers too', () => {
    const stepped = [
      { t: 0, v: 1, e: 'step' },
      { t: 1, v: 2 },
    ];
    expect(Core.sampleTrack(stepped, 0.99)).toBe(1);
    expect(Core.sampleTrack(stepped, 1)).toBe(2);
  });

  test('empty or missing track samples to undefined', () => {
    expect(Core.sampleTrack([], 0)).toBeUndefined();
    expect(Core.sampleTrack(null, 0)).toBeUndefined();
  });
});

describe('sampleClip', () => {
  const clip = {
    name: 'test',
    duration: 2,
    loop: true,
    tracks: {
      'head.rotation': [
        { t: 0, v: 0, e: 'linear' },
        { t: 2, v: 20 },
      ],
      'slots.mouth': [{ t: 0, v: 'ah', e: 'step' }],
    },
  };

  test('samples all tracks at t', () => {
    const pose = Core.sampleClip(clip, 1);
    expect(pose['head.rotation']).toBeCloseTo(10);
    expect(pose['slots.mouth']).toBe('ah');
  });

  test('looping clips wrap time (including negatives)', () => {
    expect(Core.sampleClip(clip, 2.5)['head.rotation']).toBeCloseTo(5);
    expect(Core.sampleClip(clip, -0.5)['head.rotation']).toBeCloseTo(15);
  });

  test('non-looping clips clamp at the last pose', () => {
    const oneShot = { ...clip, loop: false };
    expect(Core.sampleClip(oneShot, 99)['head.rotation']).toBeCloseTo(20);
    expect(Core.sampleClip(oneShot, -1)['head.rotation']).toBeCloseTo(0);
  });

  test('clipDuration falls back to the max key time', () => {
    const noDur = { tracks: { 'head.x': [{ t: 0, v: 0 }, { t: 3.5, v: 1 }] } };
    expect(Core.clipDuration(noDur)).toBe(3.5);
    expect(Core.clipDuration(clip)).toBe(2);
  });
});

describe('composePose (overlay semantics)', () => {
  test('later poses override earlier tracks and keep the rest', () => {
    const base = { 'head.rotation': 5, 'torso.y': -2 };
    const overlay = { 'head.rotation': 90 };
    const out = Core.composePose(base, overlay);
    expect(out['head.rotation']).toBe(90);
    expect(out['torso.y']).toBe(-2);
  });

  test('getChannel falls back to channel defaults', () => {
    expect(Core.getChannel({}, 'head', 'scaleX')).toBe(1);
    expect(Core.getChannel({}, 'head', 'rotation')).toBe(0);
    expect(Core.getChannel({ 'head.rotation': 7 }, 'head', 'rotation')).toBe(7);
  });
});

describe('matrix math', () => {
  test('identity local matrix for default channels', () => {
    const m = Core.localMatrix([100, 200], {});
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 12));
  });

  test('rotation happens about the pivot (pivot stays fixed)', () => {
    const m = Core.localMatrix([100, 200], { rotation: 90 });
    const [px, py] = Core.matApply(m, 100, 200);
    expect(px).toBeCloseTo(100);
    expect(py).toBeCloseTo(200);
    // a point right of the pivot swings downward (CW in y-down space)
    const [qx, qy] = Core.matApply(m, 110, 200);
    expect(qx).toBeCloseTo(100);
    expect(qy).toBeCloseTo(210);
  });

  test('translation shifts the pivot itself', () => {
    const m = Core.localMatrix([100, 200], { x: 5, y: -3, rotation: 45 });
    const [px, py] = Core.matApply(m, 100, 200);
    expect(px).toBeCloseTo(105);
    expect(py).toBeCloseTo(197);
  });

  test('matInvert reverses matMul and matApply', () => {
    const m = Core.localMatrix([10, 20], { rotation: 30, x: 4, y: 7, scaleX: 1.2 });
    const inv = Core.matInvert(m);
    const [x, y] = Core.matApply(inv, ...Core.matApply(m, 42, 13));
    expect(x).toBeCloseTo(42);
    expect(y).toBeCloseTo(13);
    expect(Core.matInvert([0, 0, 0, 0, 1, 2])).toBeNull(); // singular
  });
});

describe('computeWorldTransforms (FK)', () => {
  test('children inherit parent rotation', () => {
    // rotate the arm 90° CW; the forearm pivot should swing with it
    const pose = { 'arm.rotation': 90 };
    const world = Core.computeWorldTransforms(RIG, pose);
    const [fx, fy] = Core.matApply(world.forearm.matrix, 350, 550);
    // forearm pivot (350,550) relative to arm pivot (400,450) is (-50,100);
    // rotated 90° CW (y-down) that becomes (-100,-50) → (300,400)
    expect(fx).toBeCloseTo(300);
    expect(fy).toBeCloseTo(400);
  });

  test('grandchildren compose through the whole chain', () => {
    const pose = { 'torso.y': -10, 'head.rotation': 180 };
    const world = Core.computeWorldTransforms(RIG, pose);
    // mouth pivot (500,250): torso lifts it to 240; head rotation about
    // (500,300-10) flips it to 500, 290+ (290-240)=340
    const [mx, my] = Core.matApply(world.mouth.matrix, 500, 250);
    expect(mx).toBeCloseTo(500);
    expect(my).toBeCloseTo(340);
  });

  test('opacity accumulates multiplicatively down the chain', () => {
    const pose = { 'torso.opacity': 0.5, 'head.opacity': 0.5 };
    const world = Core.computeWorldTransforms(RIG, pose);
    expect(world.head.opacity).toBeCloseTo(0.25);
    expect(world.mouth.opacity).toBeCloseTo(0.25);
    expect(world.arm.opacity).toBeCloseTo(0.5);
  });

  test('an unknown or cyclic parent falls back to root instead of crashing', () => {
    const rig = {
      canvas: [100, 100],
      parts: {
        a: { pivot: [0, 0], z: 1, parent: 'b' },
        b: { pivot: [0, 0], z: 2, parent: 'a' },
        c: { pivot: [0, 0], z: 3, parent: 'ghost' },
      },
    };
    const world = Core.computeWorldTransforms(rig, {});
    expect(world.a).toBeDefined();
    expect(world.b).toBeDefined();
    expect(world.c).toBeDefined();
  });
});

describe('slots', () => {
  test('default state shows the base part and hides variants', () => {
    const vis = Core.resolveSlotVisibility(RIG, {});
    expect(vis.mouth).toBe(true);
    expect(vis.mouth_ah).toBe(false);
  });

  test('pose slot values swap visibility', () => {
    const vis = Core.resolveSlotVisibility(RIG, { 'slots.mouth': 'ah' });
    expect(vis.mouth).toBe(false);
    expect(vis.mouth_ah).toBe(true);
  });

  test('isPartVisible respects slot visibility then the hidden flag', () => {
    const vis = Core.resolveSlotVisibility(RIG, {});
    expect(Core.isPartVisible(RIG, {}, 'mouth_ah', vis)).toBe(false);
    expect(Core.isPartVisible(RIG, {}, 'head', vis)).toBe(true);
  });
});

describe('drawOrder', () => {
  test('sorts ascending by z with stable ties', () => {
    const order = Core.drawOrder(RIG);
    expect(order[0]).toBe('arm');
    expect(order.indexOf('torso')).toBeLessThan(order.indexOf('head'));
    // mouth (63) declared before mouth_ah (63) — declaration order wins ties
    expect(order.indexOf('mouth')).toBeLessThan(order.indexOf('mouth_ah'));
  });
});

describe('validateClip', () => {
  test('accepts a well-formed clip', () => {
    const clip = {
      name: 'ok',
      duration: 1,
      loop: true,
      tracks: {
        'head.rotation': [{ t: 0, v: 0, e: 'linear' }, { t: 1, v: 5 }],
        'root.y': [{ t: 0, v: 0 }],
        'slots.mouth': [{ t: 0.5, v: 'ah', e: 'step' }],
      },
    };
    expect(Core.validateClip(clip, RIG)).toEqual([]);
  });

  test('flags unknown parts, props, slots, states, and easings', () => {
    const bad = {
      duration: 1,
      tracks: {
        'nose.rotation': [{ t: 0, v: 0 }],
        'head.wobble': [{ t: 0, v: 0 }],
        'slots.hat': [{ t: 0, v: 'on' }],
        'slots.mouth': [{ t: 0, v: 'scream' }],
        'torso.x': [{ t: 0, v: 0, e: 'bezierific' }],
      },
    };
    const errors = Core.validateClip(bad, RIG);
    expect(errors.some((e) => e.includes('nose.rotation'))).toBe(true);
    expect(errors.some((e) => e.includes('head.wobble'))).toBe(true);
    expect(errors.some((e) => e.includes('slots.hat'))).toBe(true);
    expect(errors.some((e) => e.includes('scream'))).toBe(true);
    expect(errors.some((e) => e.includes('bezierific'))).toBe(true);
  });

  test('flags out-of-order keys, non-finite values, and bad durations', () => {
    expect(Core.validateClip({ duration: -1, tracks: {} }, RIG))
      .toContain('clip.duration must be a positive number');
    const outOfOrder = { tracks: { 'head.x': [{ t: 1, v: 0 }, { t: 0, v: 1 }] } };
    expect(Core.validateClip(outOfOrder, RIG).some((e) => e.includes('out of order'))).toBe(true);
    const nonFinite = { tracks: { 'head.x': [{ t: 0, v: NaN }] } };
    expect(Core.validateClip(nonFinite, RIG).some((e) => e.includes('non-finite'))).toBe(true);
  });
});

describe('secondary motion (spring follow-through)', () => {
  const rig = {
    ...RIG,
    secondaryMotion: { forearm: { stiffness: 200, damping: 22, react: 0.05, max: 15 } },
  };

  test('a still pose stays still (spring initialized at rest)', () => {
    const state = Core.newSpringState();
    const pose = { 'forearm.rotation': 10 };
    for (let i = 0; i < 30; i++) {
      const out = Core.stepSecondaryMotion(rig, pose, state, 1 / 30);
      expect(out['forearm.rotation']).toBeCloseTo(10, 5);
    }
  });

  test('converges to a new animated value after it changes', () => {
    const state = Core.newSpringState();
    Core.stepSecondaryMotion(rig, { 'forearm.rotation': 0 }, state, 1 / 30);
    let out;
    for (let i = 0; i < 120; i++) {
      out = Core.stepSecondaryMotion(rig, { 'forearm.rotation': 40 }, state, 1 / 30);
    }
    expect(out['forearm.rotation']).toBeCloseTo(40, 1);
  });

  test('parent swing deflects the child, bounded by max', () => {
    const state = Core.newSpringState();
    Core.stepSecondaryMotion(rig, { 'arm.rotation': 0 }, state, 1 / 30);
    // parent whips 60° in one 33ms frame → child lags, but never beyond max
    let maxDeflect = 0;
    for (let i = 1; i <= 30; i++) {
      const out = Core.stepSecondaryMotion(rig, { 'arm.rotation': Math.min(60, i * 20) }, state, 1 / 30);
      maxDeflect = Math.max(maxDeflect, Math.abs(out['forearm.rotation']));
    }
    expect(maxDeflect).toBeGreaterThan(0.5); // it reacted
    expect(maxDeflect).toBeLessThanOrEqual(15 + 1e-6); // clamped
  });

  test('deterministic for a fixed dt sequence', () => {
    const run = () => {
      const state = Core.newSpringState();
      const vals = [];
      for (let i = 0; i < 20; i++) {
        vals.push(Core.stepSecondaryMotion(rig, { 'arm.rotation': i * 3 }, state, 1 / 30)['forearm.rotation']);
      }
      return vals;
    };
    expect(run()).toEqual(run());
  });

  test('no config → pose passes through untouched', () => {
    const pose = { 'arm.rotation': 5 };
    expect(Core.stepSecondaryMotion(RIG, pose, Core.newSpringState(), 1 / 30)).toBe(pose);
  });
});

describe('micro motion (moving hold)', () => {
  const rig = {
    ...RIG,
    microMotion: {
      'head.rotation': { amp: 0.4, freq: 0.1 },
      'head.y': { amp: 1.2, freq: 0.07 },
    },
  };

  test('is bounded by amp and pure in t', () => {
    for (const t of [0, 0.37, 1.5, 12.34, 100]) {
      const a = Core.applyMicroMotion(rig, {}, t);
      const b = Core.applyMicroMotion(rig, {}, t);
      expect(a).toEqual(b); // deterministic
      expect(Math.abs(a['head.rotation'])).toBeLessThanOrEqual(0.4);
      expect(Math.abs(a['head.y'])).toBeLessThanOrEqual(1.2);
    }
  });

  test('adds on top of animated values', () => {
    const out = Core.applyMicroMotion(rig, { 'head.rotation': 10 }, 3.3);
    expect(Math.abs(out['head.rotation'] - 10)).toBeLessThanOrEqual(0.4);
    expect(out['head.rotation']).not.toBe(10);
  });

  test('actually moves over time (not a constant offset)', () => {
    const a = Core.applyMicroMotion(rig, {}, 0.5)['head.rotation'];
    const b = Core.applyMicroMotion(rig, {}, 3.0)['head.rotation'];
    expect(a).not.toBeCloseTo(b, 4);
  });
});

describe('solveIK (CCD)', () => {
  // shoulder (400,450) → elbow (350,550) → wrist (330,650):
  // bone lengths ≈ 112 + 102, so max reach from the shoulder ≈ 214.
  // The chain rotates elbow-first, and the wrist (hand pivot) is the effector.

  test('reaches a reachable target with the two-bone chain', () => {
    const target = [430, 620]; // ~173 from the shoulder — inside the envelope
    const solved = Core.solveIK(RIG, {}, ['forearm', 'arm'], 'hand', target);
    const world = Core.computeWorldTransforms(RIG, solved);
    const [ex, ey] = Core.matApply(world.hand.matrix, 330, 650);
    expect(Math.hypot(ex - target[0], ey - target[1])).toBeLessThan(2);
  });

  test('points toward an unreachable target without blowing up', () => {
    const solved = Core.solveIK(RIG, {}, ['forearm', 'arm'], 'hand', [4000, 4000]);
    for (const v of Object.values(solved)) expect(Number.isFinite(v)).toBe(true);
  });

  test('does not mutate the input pose', () => {
    const pose = { 'arm.rotation': 5 };
    Core.solveIK(RIG, pose, ['forearm', 'arm'], 'hand', [430, 620]);
    expect(pose).toEqual({ 'arm.rotation': 5 });
  });
});

describe('evaluateSequence (long-form composition)', () => {
  const clips = {
    idle: {
      name: 'idle', duration: 2, loop: true,
      tracks: { 'torso.y': [{ t: 0, v: 0, e: 'linear' }, { t: 2, v: -4 }] },
    },
    wave: {
      name: 'wave', duration: 1, loop: false,
      tracks: { 'forearm.rotation': [{ t: 0, v: 0, e: 'linear' }, { t: 1, v: -50 }] },
    },
    talk: {
      name: 'talk', duration: 0.5, loop: true,
      tracks: { 'slots.mouth': [{ t: 0, v: 'ah', e: 'step' }, { t: 0.25, v: 'rest', e: 'step' }] },
    },
  };
  const seq = {
    name: 'explainer', duration: 90, base: 'idle',
    events: [
      { clip: 'wave', t: 2 },
      { clip: 'talk', t: 5, until: 12 },
    ],
  };

  test('base loops for the whole duration', () => {
    expect(Core.evaluateSequence(seq, clips, 0)['torso.y']).toBeCloseTo(0);
    expect(Core.evaluateSequence(seq, clips, 61)['torso.y']).toBeCloseTo(-2); // 61 % 2 = 1
  });

  test('one-shot event plays at its local time then ends', () => {
    expect(Core.evaluateSequence(seq, clips, 1.9)['forearm.rotation']).toBeUndefined();
    expect(Core.evaluateSequence(seq, clips, 2.5)['forearm.rotation']).toBeCloseTo(-25);
    expect(Core.evaluateSequence(seq, clips, 3.5)['forearm.rotation']).toBeUndefined();
  });

  test('looping event runs until `until` then stops', () => {
    expect(Core.evaluateSequence(seq, clips, 5.1)['slots.mouth']).toBe('ah');
    expect(Core.evaluateSequence(seq, clips, 11.9)['slots.mouth']).toBeDefined();
    expect(Core.evaluateSequence(seq, clips, 12.1)['slots.mouth']).toBeUndefined();
  });

  test('events override the base track-by-track', () => {
    const pose = Core.evaluateSequence(seq, clips, 2.5);
    expect(pose['torso.y']).toBeCloseTo(-1); // base still there
    expect(pose['forearm.rotation']).toBeCloseTo(-25); // overlay on top
  });

  test('validateSequence catches unknown clips and bad times', () => {
    const bad = {
      duration: -1, base: 'ghost',
      events: [{ clip: 'nope', t: -2 }, { clip: 'talk', t: 5, until: 3 }],
    };
    const errors = Core.validateSequence(bad, clips);
    expect(errors.some((e) => e.includes('duration'))).toBe(true);
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
    expect(errors.some((e) => e.includes('nope'))).toBe(true);
    expect(errors.some((e) => e.includes('until'))).toBe(true);
    expect(Core.validateSequence(seq, clips)).toEqual([]);
  });
});

describe('lipSyncFromRms', () => {
  const WINDOW = 0.03;
  // helper: silence + speech + silence envelope
  const envelope = (spans, totalSec) => {
    const n = Math.round(totalSec / WINDOW);
    const rms = new Array(n).fill(0.01);
    for (const [a, b] of spans) {
      for (let i = Math.round(a / WINDOW); i < Math.round(b / WINDOW); i++) rms[i] = 0.4;
    }
    return rms;
  };

  test('opens during speech, closed in silence', () => {
    const keys = Core.lipSyncFromRms(envelope([[1, 2]], 3), WINDOW);
    const at = (t) => Core.sampleTrack(keys, t);
    expect(at(0.5)).toBe('rest');
    expect(at(1.05)).toBe('ah');
    expect(at(2.5)).toBe('rest');
  });

  test('long speech is split into flaps (not one frozen open mouth)', () => {
    const keys = Core.lipSyncFromRms(envelope([[0.5, 3.5]], 4), WINDOW);
    const opens = keys.filter((k) => k.v === 'ah').length;
    expect(opens).toBeGreaterThan(3); // several flaps across 3s of speech
  });

  test('ignores blips shorter than minOpen', () => {
    const keys = Core.lipSyncFromRms(envelope([[1, 1.03]], 2), WINDOW);
    expect(keys.filter((k) => k.v === 'ah')).toHaveLength(0);
  });

  test('silence or empty input produces no keys', () => {
    expect(Core.lipSyncFromRms([], WINDOW)).toEqual([]);
    expect(Core.lipSyncFromRms(new Array(100).fill(0.02), WINDOW)).toEqual([]);
  });

  test('keys are step-eased, chronological, and deterministic', () => {
    const rms = envelope([[0.5, 1.2], [2, 2.6]], 3);
    const a = Core.lipSyncFromRms(rms, WINDOW);
    const b = Core.lipSyncFromRms(rms, WINDOW);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t);
    for (const k of a) expect(k.e).toBe('step');
  });
});

describe('gestureCuesFromRms (audio-driven director)', () => {
  const WINDOW = 0.03;
  // envelope helper: base noise + speech spans (with optional emphasis peaks)
  const envelope = (spans, totalSec, peaks = []) => {
    const n = Math.round(totalSec / WINDOW);
    const rms = new Array(n).fill(0.01);
    for (const [a, b] of spans) {
      for (let i = Math.round(a / WINDOW); i < Math.round(b / WINDOW); i++) rms[i] = 0.4;
    }
    for (const p of peaks) rms[Math.round(p / WINDOW)] = 0.9;
    return rms;
  };

  const phrases = [[0.5, 3], [4.5, 7], [8.5, 10]]; // gaps of 1.5s

  test('greeting at the first phrase, closing at the last', () => {
    const cues = Core.gestureCuesFromRms(envelope(phrases, 11), WINDOW);
    expect(cues[0].type).toBe('greeting');
    expect(cues[0].t).toBeCloseTo(0.4, 1);
    const closing = cues.find((c) => c.type === 'closing');
    expect(closing).toBeDefined();
    expect(closing.t).toBeCloseTo(8.5, 0);
  });

  test('long pauses become bounded ponder cues', () => {
    const cues = Core.gestureCuesFromRms(envelope(phrases, 11), WINDOW);
    const ponders = cues.filter((c) => c.type === 'ponder');
    expect(ponders.length).toBe(2);
    for (const p of ponders) {
      expect(p.until).toBeGreaterThan(p.t);
      expect(p.until - p.t).toBeLessThan(2);
    }
  });

  test('emphasis peaks become beats with enforced spacing', () => {
    const cues = Core.gestureCuesFromRms(
      envelope([[0.5, 10]], 11, [2, 2.3, 5.5, 9]), WINDOW,
    );
    const beats = cues.filter((c) => c.type === 'beat');
    expect(beats.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i].t - beats[i - 1].t).toBeGreaterThanOrEqual(2.5 - 1e-6);
    }
  });

  test('cues are sorted and deterministic', () => {
    const rms = envelope(phrases, 11, [1.5, 5.5]);
    const a = Core.gestureCuesFromRms(rms, WINDOW);
    const b = Core.gestureCuesFromRms(rms, WINDOW);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t);
  });

  test('silence or flat audio produces no cues', () => {
    expect(Core.gestureCuesFromRms([], WINDOW)).toEqual([]);
    expect(Core.gestureCuesFromRms(new Array(300).fill(0.02), WINDOW)).toEqual([]);
  });

  test('a single phrase gets a greeting but no closing', () => {
    const cues = Core.gestureCuesFromRms(envelope([[1, 4]], 5), WINDOW);
    expect(cues.some((c) => c.type === 'greeting')).toBe(true);
    expect(cues.some((c) => c.type === 'closing')).toBe(false);
  });
});

describe('shipped rig + preset clips', () => {
  const fs = require('fs');
  const path = require('path');
  const rigDir = path.join(__dirname, '../../public/rigs/mr-nappier');
  const rig = JSON.parse(fs.readFileSync(path.join(rigDir, 'rig.json'), 'utf8'));

  test('every part image exists and every parent is a real part', () => {
    for (const part of Object.values(rig.parts)) {
      expect(fs.existsSync(path.join(rigDir, rig.partsDir, part.src))).toBe(true);
      if (part.parent !== 'root') expect(rig.parts[part.parent]).toBeDefined();
      expect(Array.isArray(part.pivot)).toBe(true);
    }
  });

  test('every slot state maps to a real part', () => {
    for (const slot of Object.values(rig.slots)) {
      expect(slot.states[slot.default]).toBeDefined();
      for (const partName of Object.values(slot.states)) {
        expect(rig.parts[partName]).toBeDefined();
      }
    }
  });

  test('all preset clips validate against the rig and sample cleanly', () => {
    const index = JSON.parse(fs.readFileSync(path.join(rigDir, 'clips/index.json'), 'utf8'));
    expect(index.clips.length).toBeGreaterThanOrEqual(6);
    for (const name of index.clips) {
      const clip = JSON.parse(fs.readFileSync(path.join(rigDir, `clips/${name}.json`), 'utf8'));
      expect(Core.validateClip(clip, rig)).toEqual([]);
      // sampling at many points never produces NaN
      const dur = Core.clipDuration(clip);
      for (let i = 0; i <= 20; i++) {
        const pose = Core.sampleClip(clip, (dur * i) / 20);
        for (const v of Object.values(pose)) {
          if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
          else expect(typeof v).toBe('string');
        }
        const world = Core.computeWorldTransforms(rig, pose);
        for (const node of Object.values(world)) {
          expect(node.matrix.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});
