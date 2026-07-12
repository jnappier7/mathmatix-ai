const Ajv = require('ajv');
const { SCENE_JSON_SCHEMA, buildOpenAIResponseFormat } = require('../../utils/sceneJsonSchema');

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCENE_JSON_SCHEMA);

const midsegment = {
  objects: [
    { id: 'A', type: 'point', at: [1, 5] },
    { id: 'B', type: 'point', at: [0, 0] },
    { id: 'C', type: 'point', at: [8, 0] },
    { id: 'tri', type: 'polygon', points: ['A', 'B', 'C'] },
    { id: 'D', type: 'midpoint', of: ['A', 'B'] },
    { id: 'E', type: 'midpoint', of: ['A', 'C'] },
    { id: 'DE', type: 'segment', from: 'D', to: 'E' },
  ],
  marks: [
    { kind: 'tick', on: ['A', 'D'], count: 1 },
    { kind: 'parallel', on: ['D', 'E', 'B', 'C'] },
  ],
};

const hypotenuse = {
  objects: [
    { id: 'A', type: 'point', at: [0, 6] },
    { id: 'B', type: 'point', at: [0, 0] },
    { id: 'C', type: 'point', at: [8, 0] },
    { id: 'tri', type: 'polygon', points: ['A', 'B', 'C'] },
  ],
  marks: [
    { kind: 'right', at: 'B', from: 'A', to: 'C' },
    { kind: 'measure', on: ['A', 'B'], symbol: 'AB', value: 6 },
    { kind: 'measure', on: ['A', 'C'], symbol: 'x', value: 10, solve: true },
    { kind: 'measure', on: ['B', 'C'], symbol: 'BC', value: null }, // redacted form
  ],
};

const transversal = {
  objects: [
    { id: 'P1', type: 'point', at: [0, 4] }, { id: 'P2', type: 'point', at: [8, 4] },
    { id: 'l1', type: 'line', from: 'P1', to: 'P2' },
    { id: 'Q', type: 'point', at: [0, 1] },
    { id: 'l2', type: 'parallel', through: 'Q', to: 'l1' },
    { id: 'T1', type: 'point', at: [2, 6] }, { id: 'T2', type: 'point', at: [6, -1] },
    { id: 't', type: 'line', from: 'T1', to: 'T2' },
    { id: 'X', type: 'intersection', of: ['t', 'l1'] },
  ],
  marks: [{ kind: 'angle', at: 'X', from: 'P2', to: 'T2', arcs: 1 }],
};

describe('SCENE_JSON_SCHEMA (ajv)', () => {
  it('accepts the worked example scenes', () => {
    for (const s of [midsegment, hypotenuse, transversal]) {
      const ok = validate(s);
      if (!ok) throw new Error(JSON.stringify(validate.errors, null, 2));
      expect(ok).toBe(true);
    }
  });

  it('rejects malformed scenes', () => {
    expect(validate({ objects: [{ id: 'A', type: 'point' }] })).toBe(false);              // no at
    expect(validate({ objects: [{ id: 'A', type: 'point', at: [1] }] })).toBe(false);     // at not a pair
    expect(validate({ objects: [{ id: 'X', type: 'wormhole', at: [0, 0] }] })).toBe(false); // unknown type
    expect(validate({ objects: [{ id: 'P', type: 'polygon', points: ['A', 'B'] }] })).toBe(false); // <3
    expect(validate({ objects: [] })).toBe(false);                                        // empty
    expect(validate({})).toBe(false);                                                     // no objects
  });

  it('rejects a measure with a non-numeric value but allows null (redacted)', () => {
    const base = (val) => ({ objects: [{ id: 'A', type: 'point', at: [0, 0] }, { id: 'B', type: 'point', at: [1, 0] }], marks: [{ kind: 'measure', on: ['A', 'B'], value: val }] });
    expect(validate(base('ten'))).toBe(false);
    expect(validate(base(10))).toBe(true);
    expect(validate(base(null))).toBe(true);
  });

  it('rejects unknown/extra properties (additionalProperties:false)', () => {
    expect(validate({ objects: [{ id: 'A', type: 'point', at: [0, 0], color: 'red' }] })).toBe(false);
  });

  it('buildOpenAIResponseFormat wraps the schema for structured output', () => {
    const rf = buildOpenAIResponseFormat('geo');
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe('geo');
    expect(rf.json_schema.schema).toBe(SCENE_JSON_SCHEMA);
  });
});
