// tests/unit/workspace/livingWorkspaceCore.test.js
// Pure-logic core of the Living Workspace shell (P3): Viewport transform,
// ElementRegistry, SnapshotManager round-trip + corruption recovery, the
// LIVING_WORKSPACE flag resolver, and the a11y command/description layer.
// DOM glue (grid render, overlay sync, equation element) is verified in the
// browser harness — this file is the headless, deterministic half.

const Viewport = require('../../../public/js/living-workspace/core/viewport');
const ElementRegistry = require('../../../public/js/living-workspace/core/elementRegistry');
const SnapshotManager = require('../../../public/js/living-workspace/core/snapshotManager');
const flags = require('../../../public/js/living-workspace/core/flags');
const a11y = require('../../../public/js/living-workspace/core/a11yCommands');

describe('Viewport transform', () => {
  test('world↔screen round-trips exactly', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600, scale: 1.5 }).setPan(100, 50);
    const s = vp.worldToScreen(300, 200);
    const w = vp.screenToWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(300, 9);
    expect(w.y).toBeCloseTo(200, 9);
  });

  test('identity at scale 1, zero pan', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600 });
    expect(vp.worldToScreen(120, 80)).toEqual({ x: 120, y: 80 });
  });

  test('zoomAt keeps the world point under the cursor fixed (no drift)', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600, world: { width: 5000, height: 5000 } }).setPan(200, 200);
    const focus = { x: 500, y: 300 };
    const worldBefore = vp.screenToWorld(focus.x, focus.y);
    vp.zoomAt(focus.x, focus.y, 1.7);
    const worldAfter = vp.screenToWorld(focus.x, focus.y);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  test('scale clamps to [min,max]', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600, minScale: 0.5, maxScale: 2 });
    vp.setScale(99); expect(vp.scale).toBe(2);
    vp.setScale(0.01); expect(vp.scale).toBe(0.5);
  });

  test('pan is clamped so the bounded world cannot scroll fully off-screen', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600, world: { width: 2400, height: 1600 } });
    vp.setPan(-500, -500);
    expect(vp.panX).toBe(0);
    expect(vp.panY).toBe(0);
    vp.setPan(99999, 99999);
    expect(vp.panX).toBeCloseTo(2400 - 800, 6);
    expect(vp.panY).toBeCloseTo(1600 - 600, 6);
  });

  test('view state serializes and restores', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600 }).setPan(120, 90).setScale(1.25);
    const json = vp.toJSON();
    const vp2 = new Viewport({ viewW: 800, viewH: 600 }).applyJSON(json);
    expect(vp2.toJSON()).toEqual(json);
  });
});

describe('ElementRegistry', () => {
  const eq = (id, x, y) => ({ id, type: 'equation', position: { x, y }, semantic: { latex: 'x+1' } });

  test('add/get/list with ascending z-order', () => {
    const r = new ElementRegistry();
    r.add(eq('a', 0, 0)); r.add(eq('b', 10, 10));
    expect(r.size).toBe(2);
    expect(r.list().map((e) => e.id)).toEqual(['a', 'b']);
    r.bringToFront('a');
    expect(r.list().map((e) => e.id)).toEqual(['b', 'a']);
  });

  test('duplicate id and id-less add throw', () => {
    const r = new ElementRegistry();
    r.add(eq('a', 0, 0));
    expect(() => r.add(eq('a', 1, 1))).toThrow(/duplicate/);
    expect(() => r.add({ type: 'equation' })).toThrow(/string id/);
  });

  test('move patches only position; update merges', () => {
    const r = new ElementRegistry();
    r.add(eq('a', 0, 0));
    r.move('a', 5, 7);
    expect(r.get('a').position).toEqual({ x: 5, y: 7 });
    r.update('a', { position: { x: 9 } });
    expect(r.get('a').position).toEqual({ x: 9, y: 7 }); // y preserved
  });

  test('subscribers see add/update/remove/clear and unsubscribe works', () => {
    const r = new ElementRegistry();
    const events = [];
    const off = r.subscribe((e) => events.push(e.type));
    r.add(eq('a', 0, 0)); r.move('a', 1, 1); r.remove('a'); r.clear();
    off();
    r.add(eq('b', 0, 0));
    expect(events).toEqual(['add', 'update', 'remove']); // clear on empty emits nothing; post-unsub add not seen
  });

  test('a throwing listener does not break the registry', () => {
    const r = new ElementRegistry();
    r.subscribe(() => { throw new Error('bad listener'); });
    expect(() => r.add(eq('a', 0, 0))).not.toThrow();
    expect(r.size).toBe(1);
  });
});

describe('SnapshotManager', () => {
  const eq = (id, x, y, latex) => ({ id, type: 'equation', position: { x, y }, semantic: { latex } });

  test('capture → restore round-trips elements + view state', () => {
    const r = new ElementRegistry();
    r.add(eq('a', 10, 20, 'x+1')); r.add(eq('b', 30, 40, '2x'));
    const vp = new Viewport({ viewW: 800, viewH: 600 }).setPan(50, 60).setScale(1.25);

    const snap = SnapshotManager.capture(r, vp, { conversationId: 'c1' });
    expect(snap.meta).toEqual({ conversationId: 'c1' });

    const r2 = new ElementRegistry();
    const vp2 = new Viewport({ viewW: 800, viewH: 600 });
    const res = SnapshotManager.restore(snap, r2, vp2);
    expect(res).toMatchObject({ restored: 2, skipped: 0 });
    expect(r2.list().map((e) => e.semantic.latex)).toEqual(['x+1', '2x']);
    expect(vp2.toJSON()).toEqual(vp.toJSON());
  });

  test('restore recovers from a corrupt snapshot (skips bad elements, never throws)', () => {
    const r = new ElementRegistry();
    const snap = {
      schemaVersion: 1,
      view: { scale: 'bad', panX: 10, panY: 20 },
      elements: [
        eq('good', 1, 2, 'x'),
        { id: 'nopos', type: 'equation', semantic: {} },      // missing position
        null,                                                  // junk
        { id: 'good', type: 'equation', position: { x: 0, y: 0 }, semantic: {} }, // dup id
        { type: 'equation', position: { x: 0, y: 0 }, semantic: {} },             // no id
      ],
    };
    const vp = new Viewport({ viewW: 800, viewH: 600 });
    const res = SnapshotManager.restore(snap, r, vp);
    expect(res.restored).toBe(1);
    expect(res.skipped).toBe(4);
    expect(res.recovered).toBe(true);
    expect(r.list().map((e) => e.id)).toEqual(['good']);
    // bad view.scale ignored, but valid pan applied
    expect(vp.panX).toBe(10);
  });

  test('garbage payload yields an empty workspace', () => {
    const r = new ElementRegistry(); r.add(eq('x', 0, 0, 'x'));
    const res = SnapshotManager.restore('not json at all', r, null);
    expect(r.size).toBe(0);
    expect(res.restored).toBe(0);
    expect(SnapshotManager.safeParse('{bad json')).toBeNull();
    expect(SnapshotManager.safeParse('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('LIVING_WORKSPACE flag resolver', () => {
  test('defaults to off', () => {
    expect(flags.resolveMode({ features: {}, search: '' })).toBe('off');
    expect(flags.isEnabled({ features: {}, search: '' })).toBe(false);
  });
  test('MM_FEATURES wins over query param', () => {
    expect(flags.resolveMode({ features: { livingWorkspace: 'beta' }, search: '?livingWorkspace=live' })).toBe('beta');
  });
  test('query param used when no feature flag', () => {
    expect(flags.resolveMode({ features: {}, search: '?foo=1&livingWorkspace=dev' })).toBe('dev');
    expect(flags.isDev({ features: {}, search: '?livingWorkspace=dev' })).toBe(true);
  });
  test('unknown modes normalize to off', () => {
    expect(flags.resolveMode({ features: { livingWorkspace: 'banana' } })).toBe('off');
  });
});

describe('a11y command + description layer', () => {
  test('keys map to canonical commands', () => {
    expect(a11y.commandForKey('ArrowLeft')).toBe('pan-left');
    expect(a11y.commandForKey('+')).toBe('zoom-in');
    expect(a11y.commandForKey('0')).toBe('zoom-reset');
    expect(a11y.commandForKey('q')).toBeNull();
  });

  test('viewport commands move/zoom the view', () => {
    const vp = new Viewport({ viewW: 800, viewH: 600, world: { width: 5000, height: 5000 } }).setPan(500, 500);
    const beforePan = vp.panX;
    expect(a11y.applyViewportCommand('pan-right', vp)).toBe(true);
    expect(vp.panX).toBeGreaterThan(beforePan);
    const beforeScale = vp.scale;
    expect(a11y.applyViewportCommand('zoom-in', vp)).toBe(true);
    expect(vp.scale).toBeGreaterThan(beforeScale);
    expect(a11y.applyViewportCommand('focus-next', vp)).toBe(false); // element-level, not viewport
  });

  test('describes elements and workspace for screen readers', () => {
    expect(a11y.describeElement({ type: 'equation', semantic: { plain: 'x + 1 = 5' } })).toBe('equation: x + 1 = 5');
    expect(a11y.describeElement({ type: 'algebra-tiles', semantic: { latex: '2x' }, provisional: true }))
      .toBe('algebra tiles: 2x, provisional');
    const r = new ElementRegistry();
    r.add({ id: 'a', type: 'equation', position: { x: 0, y: 0 }, semantic: { latex: 'x' } });
    const vp = new Viewport({ viewW: 800, viewH: 600 }).setScale(1.25);
    expect(a11y.describeWorkspace(r, vp)).toBe('Workspace with 1 element. Zoom 125 percent');
  });
});
