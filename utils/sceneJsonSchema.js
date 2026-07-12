/**
 * sceneJsonSchema.js — JSON Schema for a geometry SCENE (model structured output).
 *
 * The canonical shape the tutor model emits (see docs/DIAGRAM_SCENE_PROMPT.md).
 * This draft-07 schema is the FIRST gate on a model emission (well-typed JSON);
 * `public/js/sceneSpec.js` validateScene is the SECOND (references resolve, no
 * cycles, relations solvable) and utils/sceneGate.js is the THIRD (answer-leak).
 *
 * OpenAI note: strict structured-output mode is a SUBSET of JSON Schema (no
 * minItems/maxItems, enum not const, every property required, additionalProperties
 * false). Rather than contort this schema into that subset, the intended wiring is
 * response_format with this schema for typing + `validateScene` as the precise
 * field/shape backstop right after. `buildOpenAIResponseFormat()` wraps it.
 */
'use strict';

const ID = { type: 'string', minLength: 1 };
const NUM_PAIR = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };
const ID_LIST = (min, max) => {
  const s = { type: 'array', items: ID, minItems: min };
  if (max != null) s.maxItems = max;
  return s;
};

function objType(typeName, required, props) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type'].concat(required),
    properties: Object.assign({ id: ID, type: { const: typeName } }, props),
  };
}
function markType(kind, required, props) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind'].concat(required),
    properties: Object.assign({ kind: { const: kind } }, props),
  };
}

const OBJECT_SCHEMAS = [
  objType('point', ['at'], { at: NUM_PAIR }),
  objType('midpoint', ['of'], { of: ID_LIST(2, 2) }),
  objType('intersection', ['of'], { of: ID_LIST(2, 2) }),
  objType('glider', ['on', 'at'], { on: ID, at: NUM_PAIR }),
  objType('segment', ['from', 'to'], { from: ID, to: ID }),
  objType('line', ['from', 'to'], { from: ID, to: ID }),
  objType('ray', ['from', 'to'], { from: ID, to: ID }),
  objType('circle', ['center'], { center: ID, through: ID, radius: { type: 'number' } }),
  objType('polygon', ['points'], { points: ID_LIST(3) }),
  objType('parallel', ['through', 'to'], { through: ID, to: ID }),
  objType('perpendicular', ['through', 'to'], { through: ID, to: ID }),
];

const MARK_SCHEMAS = [
  markType('tick', ['on'], { on: ID_LIST(2, 2), count: { type: 'integer', minimum: 1 } }),
  markType('angle', ['at', 'from', 'to'], { at: ID, from: ID, to: ID, arcs: { type: 'integer', minimum: 1 } }),
  markType('right', ['at', 'from', 'to'], { at: ID, from: ID, to: ID }),
  markType('parallel', ['on'], { on: ID_LIST(4, 4) }),
  markType('label', ['on', 'text'], { on: ID, text: { type: 'string' } }),
  markType('measure', ['on'], {
    on: ID_LIST(1, 2),
    symbol: { type: 'string' },
    value: { type: ['number', 'null'] },
    unit: { type: 'string' },
    solve: { type: 'boolean' },
  }),
];

const SCENE_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['objects'],
  properties: {
    extent: {
      type: 'object',
      additionalProperties: false,
      required: ['xMin', 'xMax', 'yMin', 'yMax'],
      properties: { xMin: { type: 'number' }, xMax: { type: 'number' }, yMin: { type: 'number' }, yMax: { type: 'number' } },
    },
    objects: { type: 'array', minItems: 1, items: { anyOf: OBJECT_SCHEMAS } },
    marks: { type: 'array', items: { anyOf: MARK_SCHEMAS } },
  },
};

/** Wrap for an OpenAI `response_format`. Pair with validateScene as the backstop. */
function buildOpenAIResponseFormat(name) {
  return { type: 'json_schema', json_schema: { name: name || 'geometry_scene', schema: SCENE_JSON_SCHEMA } };
}

module.exports = { SCENE_JSON_SCHEMA, OBJECT_SCHEMAS, MARK_SCHEMAS, buildOpenAIResponseFormat };
