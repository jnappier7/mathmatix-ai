const { validateScene, extractSceneValues, redactScene } = require('../../public/js/sceneSpec');

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

describe('sceneSpec — field-level shape validation (the schema)', () => {
  const bad = (obj) => validateScene({ objects: [obj] });
  it('rejects malformed object fields', () => {
    expect(bad({ id: 'A', type: 'point', at: [0] }).valid).toBe(false);          // at not a pair
    expect(bad({ id: 'A', type: 'point' }).valid).toBe(false);                    // no at
    expect(bad({ id: 'P', type: 'polygon', points: ['A', 'B'] }).valid).toBe(false); // <3 pts
    expect(bad({ id: 'S', type: 'segment', from: 'A' }).valid).toBe(false);       // no to
    expect(bad({ id: 'M', type: 'midpoint', of: ['A'] }).valid).toBe(false);      // needs 2
  });
  it('circle requires through OR radius', () => {
    expect(validateScene({ objects: [{ id: 'O', type: 'point', at: [0, 0] }, { id: 'c', type: 'circle', center: 'O' }] }).valid).toBe(false);
    expect(validateScene({ objects: [{ id: 'O', type: 'point', at: [0, 0] }, { id: 'c', type: 'circle', center: 'O', radius: 3 }] }).valid).toBe(true);
  });
  it('rejects malformed mark fields', () => {
    const objs = [{ id: 'A', type: 'point', at: [0, 0] }, { id: 'B', type: 'point', at: [1, 0] }];
    expect(validateScene({ objects: objs, marks: [{ kind: 'tick', on: ['A'], count: 1 }] }).valid).toBe(false); // tick needs 2
    expect(validateScene({ objects: objs, marks: [{ kind: 'measure', on: ['A', 'B'], value: 'ten' }] }).valid).toBe(false); // value not number
    expect(validateScene({ objects: objs, marks: [{ kind: 'measure', on: ['A', 'B'], value: 10 }] }).valid).toBe(true);
  });
});

describe('sceneSpec — displayed values (redaction / extraction)', () => {
  const scene = {
    objects: [{ id: 'A', type: 'point', at: [0, 0] }, { id: 'B', type: 'point', at: [4, 0] }, { id: 'C', type: 'point', at: [4, 3] }],
    marks: [
      { kind: 'measure', on: ['A', 'B'], symbol: 'AB', value: 6, unit: 'cm' },   // given
      { kind: 'measure', on: ['A', 'C'], symbol: 'x', value: 10, solve: true },   // to-be-found
      { kind: 'label', on: 'A', text: 'A' },
    ],
  };

  it('extractSceneValues collects every displayed number', () => {
    expect(extractSceneValues(scene).sort((a, b) => a - b)).toEqual([6, 10]);
  });

  it('redactSolve hides the unknown but KEEPS the given', () => {
    const r = redactScene(scene, { redactSolve: true });
    const ab = r.marks[0], x = r.marks[1];
    expect(ab.value).toBe(6);       // given stays
    expect(x.value).toBeNull();     // unknown hidden
    expect(x.redacted).toBe(true);
    expect(r.objects).toBe(scene.objects); // geometry untouched
  });

  it('answerValues hides any value matching the answer, regardless of solve', () => {
    const r = redactScene(scene, { answerValues: [6] });
    expect(r.marks[0].value).toBeNull(); // 6 matches → hidden even though it was a "given"
    expect(r.marks[1].value).toBe(10);   // 10 doesn't match → stays
  });

  it('no opts → nothing hidden (givens are safe by default)', () => {
    expect(redactScene(scene).marks[0].value).toBe(6);
  });

  it('is non-mutating', () => {
    const copy = JSON.parse(JSON.stringify(scene));
    redactScene(scene, { redactSolve: true, answerValues: [6, 10] });
    expect(scene).toEqual(copy);
  });
});
