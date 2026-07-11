const { validateScene } = require('../../public/js/sceneSpec');

const midsegment = {
  objects: [
    { id: 'A', type: 'point', at: [1, 5] },
    { id: 'B', type: 'point', at: [0, 0] },
    { id: 'C', type: 'point', at: [8, 0] },
    { id: 'D', type: 'midpoint', of: ['A', 'B'] },
    { id: 'E', type: 'midpoint', of: ['A', 'C'] },
    { id: 'DE', type: 'segment', from: 'D', to: 'E' },
  ],
  marks: [{ kind: 'tick', on: ['A', 'D'], count: 1 }, { kind: 'parallel', on: ['D', 'E', 'B', 'C'] }],
};

describe('sceneSpec.validateScene', () => {
  it('validates a well-formed scene and orders deps before dependents', () => {
    const v = validateScene(midsegment);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    const pos = (id) => v.order.indexOf(id);
    // midpoints come after their endpoints; the segment after both midpoints
    expect(pos('D')).toBeGreaterThan(pos('A'));
    expect(pos('D')).toBeGreaterThan(pos('B'));
    expect(pos('DE')).toBeGreaterThan(pos('D'));
    expect(pos('DE')).toBeGreaterThan(pos('E'));
    expect(v.order).toHaveLength(6);
  });

  it('flags a reference to a missing object', () => {
    const v = validateScene({ objects: [{ id: 'S', type: 'segment', from: 'A', to: 'Z' }] });
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/missing id: A|missing id: Z/);
  });

  it('rejects a dependency cycle', () => {
    const v = validateScene({
      objects: [
        { id: 'D', type: 'midpoint', of: ['E', 'B'] },
        { id: 'E', type: 'midpoint', of: ['D', 'C'] }, // D<->E cycle
        { id: 'B', type: 'point', at: [0, 0] },
        { id: 'C', type: 'point', at: [1, 0] },
      ],
    });
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/cycle/);
  });

  it('flags unknown object + mark kinds', () => {
    expect(validateScene({ objects: [{ id: 'x', type: 'wormhole' }] }).errors.join(' ')).toMatch(/unknown object type/);
    expect(validateScene({ objects: [{ id: 'A', type: 'point', at: [0, 0] }], marks: [{ kind: 'sparkle', on: 'A' }] }).errors.join(' ')).toMatch(/unknown mark kind/);
  });

  it('flags a mark referencing a missing object', () => {
    const v = validateScene({ objects: [{ id: 'A', type: 'point', at: [0, 0] }], marks: [{ kind: 'tick', on: ['A', 'ZZ'], count: 1 }] });
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/missing id: ZZ/);
  });

  it('handles the parallel/perpendicular constructive relations', () => {
    const v = validateScene({
      objects: [
        { id: 'P1', type: 'point', at: [0, 4] }, { id: 'P2', type: 'point', at: [8, 4] },
        { id: 'l1', type: 'line', from: 'P1', to: 'P2' },
        { id: 'Q', type: 'point', at: [0, 1] },
        { id: 'l2', type: 'parallel', through: 'Q', to: 'l1' },
      ],
    });
    expect(v.valid).toBe(true);
    expect(v.order.indexOf('l2')).toBeGreaterThan(v.order.indexOf('l1'));
  });
});
