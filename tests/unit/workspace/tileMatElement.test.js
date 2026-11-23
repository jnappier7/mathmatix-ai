/**
 * The tile mat's model (public/js/living-workspace/dom/tileMatElement.js).
 *
 * The mat blocks nothing — a student may take a tile off one side only — so
 * its whole claim to being trustworthy is that it never lies about itself:
 * the readout is exactly what is on the mat, and "still the same equation"
 * is true when it says so. Those two are pinned here; the dragging is checked
 * by eye in headless Chromium.
 */
const T = require('../../../public/js/living-workspace/dom/tileMatElement.js');
const { parseTileMat } = require('../../../utils/workspace/tileMat');

const start = (tex) => T.fromMat(parseTileMat(tex));
const first = (state, sideIndex, kind, sign) => state.sides[sideIndex].find(t => t.kind === kind && t.sign === sign);

describe('the mat is drawn from the server\'s reading', () => {
  test('one tile per unit of each term, tidy order', () => {
    const s = start('x^2 - 2x + 3 = 7');
    expect(s.sides[0].map(t => `${t.sign > 0 ? '+' : '-'}${t.kind}`)).toEqual(['+x2', '-x', '-x', '+unit', '+unit', '+unit']);
    expect(s.sides[1]).toHaveLength(7);
    expect(T.readout(s)).toBe('x^2 - 2x + 3 = 7');
  });

  test('a mat that is not a mat draws nothing', () => {
    for (const bad of [null, {}, { sides: [] }, { sides: [{ x2: [0, 0], x: [1, 0] }] }, { sides: [{ x2: [0, 0], x: [-1, 0], unit: [0, 0] }] }, { sides: [{ x2: [0, 0], x: [999, 0], unit: [0, 0] }] }]) {
      expect(T.fromMat(bad)).toBeNull();
    }
  });
});

describe('moves', () => {
  test('a zero pair is a + and a − of the same kind on the same side — nothing else', () => {
    let s = start('2x + 3 - 3 = 4');
    const pos = first(s, 0, 'unit', 1), neg = first(s, 0, 'unit', -1), x = first(s, 0, 'x', 1), right = first(s, 1, 'unit', 1);
    expect(T.zeroPair(s, pos.id, x.id)).toBeNull();          // unlike tiles
    expect(T.zeroPair(s, neg.id, right.id)).toBeNull();      // across the equals sign
    expect(T.zeroPair(s, pos.id, pos.id)).toBeNull();
    s = T.zeroPair(s, pos.id, neg.id);
    expect(T.readout(s)).toBe('2x + 2 - 2 = 4');
  });

  test('cancelling every zero pair leaves the simplified line', () => {
    let s = start('2x + 3 - 3 = 7 - 3');
    T.zeroPairs(s).forEach(([a, b]) => { s = T.zeroPair(s, a, b); });
    expect(T.readout(s)).toBe('2x = 4');
    expect(T.zeroPairs(s)).toHaveLength(0);
  });

  test('flip turns a tile into its opposite, in place on its side', () => {
    const s = start('x + 1');
    const f = T.flip(s, first(s, 0, 'x', 1).id);
    expect(T.readout(f)).toBe('-x + 1');
    expect(T.readout(s)).toBe('x + 1');                      // moves never mutate
  });

  test('add to all sides, add to one, move across, take off', () => {
    let s = start('2x + 3 = 7');
    s = T.addToAll(s, 'unit', -1);
    expect(T.readout(s)).toBe('2x + 3 - 1 = 7 - 1');
    s = T.add(s, 1, 'x', 1);
    expect(T.readout(s)).toBe('2x + 3 - 1 = x + 7 - 1');
    s = T.move(s, first(s, 1, 'x', 1).id, 0);
    expect(T.readout(s)).toBe('3x + 3 - 1 = 7 - 1');
    s = T.remove(s, first(s, 0, 'unit', -1).id);
    expect(T.readout(s)).toBe('3x + 3 = 7 - 1');
  });

  test('a full side refuses another tile — on both sides or neither', () => {
    let s = start('x = 1');
    for (let i = s.sides[0].length; i < T.MAX_PER_SIDE; i++) s = T.add(s, 0, 'unit', 1);
    expect(T.add(s, 0, 'unit', 1)).toBeNull();
    expect(T.addToAll(s, 'unit', 1)).toBeNull();
  });

  test('an empty side reads 0', () => {
    let s = start('x = 1');
    s = T.remove(s, s.sides[1][0].id);
    expect(T.readout(s)).toBe('x = 0');
  });
});

describe('"still the same equation" is true when the mat says so', () => {
  const eq = '2x + 3 = 7';
  const same = (s) => T.sameAsStart(s, start(eq));

  test('untouched; the same tile on both sides; cancelling zero pairs', () => {
    let s = start(eq);
    expect(same(s)).toBe(true);
    for (let i = 0; i < 3; i++) s = T.addToAll(s, 'unit', -1);
    expect(same(s)).toBe(true);
    T.zeroPairs(s).forEach(([a, b]) => { s = T.zeroPair(s, a, b); });
    expect(T.readout(s)).toBe('2x = 4');
    expect(same(s)).toBe(true);
  });

  test('flipping EVERY tile keeps it (both sides times −1); flipping one does not', () => {
    let s = start(eq);
    const one = T.flip(s, s.sides[0][0].id);
    expect(same(one)).toBe(false);
    s.sides.forEach(side => side.forEach(t => { s = T.flip(s, t.id); }));
    expect(T.readout(s)).toBe('-2x - 3 = -7');
    expect(same(s)).toBe(true);
  });

  test('a tile on one side only, a tile moved across, a tile taken off — all change it', () => {
    const s = start(eq);
    expect(same(T.add(s, 0, 'unit', 1))).toBe(false);
    expect(same(T.move(s, first(s, 0, 'unit', 1).id, 1))).toBe(false);
    expect(same(T.remove(s, s.sides[1][0].id))).toBe(false);
  });

  test('an expression is the same only while its value is', () => {
    const s = start('x^2 - 4x + 3');
    const ref = start('x^2 - 4x + 3');
    let z = T.add(T.add(s, 0, 'x', 1), 0, 'x', -1);           // a zero pair added
    expect(T.sameAsStart(z, ref)).toBe(true);
    expect(T.sameAsStart(T.add(s, 0, 'unit', 1), ref)).toBe(false);
    expect(T.sameAsStart(T.flip(s, s.sides[0][0].id), ref)).toBe(false);
  });

  test('emptying both sides is not "the same equation"', () => {
    let s = start('x = 1');
    s = T.remove(s, s.sides[0][0].id);
    s = T.remove(s, s.sides[1][0].id);
    expect(T.sameAsStart(s, start('x = 1'))).toBe(false);
  });
});
