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
