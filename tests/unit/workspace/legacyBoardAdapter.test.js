'use strict';
/* Living Workspace P5 — legacy board-command → workspace-element adapter.
   Verifies content-equivalence mapping, schema conformance, the clear
   directive, and that unmappable commands are reported (never dropped). */

const { adaptBoardCommands, WorkspaceElement, ELEMENT_TYPES } = require('../../../shared/workspace');

// Every produced element must satisfy the shared WorkspaceElement contract.
function assertAllValid(elements) {
  for (const el of elements) {
    const { valid, errors } = WorkspaceElement.validate(el, { context: 'server' });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  }
}

describe('adaptBoardCommands — action → element mapping', () => {
  const cases = [
    { cmd: { action: 'pose', tex: '2x + 4 = 20' },                    type: ELEMENT_TYPES.EQUATION, role: 'problem' },
    { cmd: { action: 'resolve', tex: '2x = 16' },                     type: ELEMENT_TYPES.EQUATION, role: 'step' },
    { cmd: { action: 'verify', tex: 'x = 8', check: '2(8)+4 = 20' },  type: ELEMENT_TYPES.EQUATION, role: 'solution' },
    { cmd: { action: 'scaffold', tex: 'x^2 + 4x + \\boxed{} = 12' },  type: ELEMENT_TYPES.EQUATION, role: 'scaffold' },
    { cmd: { action: 'example', tex: '\\int x^2 dx', caption: 'Power rule' }, type: ELEMENT_TYPES.EQUATION, role: 'example' },
    { cmd: { action: 'apply', op: 'subtract 4 from both sides' },     type: ELEMENT_TYPES.EQUATION, role: 'operation' },
    { cmd: { action: 'graph', fn: 'x^2 - 4', caption: 'Zeros' },      type: ELEMENT_TYPES.GRAPH },
    { cmd: { action: 'image', query: 'unit circle', caption: 'Ref' }, type: ELEMENT_TYPES.IMAGE },
    { cmd: { action: 'diagram', diagram_type: 'triangle', diagram_params: { a: 3 } }, type: ELEMENT_TYPES.GEOMETRY },
  ];

  for (const { cmd, type, role } of cases) {
    test(`${cmd.action} → ${type}${role ? ' (' + role + ')' : ''}`, () => {
      const { elements } = adaptBoardCommands([cmd]);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe(type);
      if (role) expect(elements[0].semantic.role).toBe(role);
      assertAllValid(elements);
    });
  }

  test('verify carries the substitution check into semantic', () => {
    const { elements } = adaptBoardCommands([{ action: 'verify', tex: 'x = 8', check: '2(8)+4 = 20' }]);
    expect(elements[0].semantic.latex).toBe('x = 8');
    expect(elements[0].semantic.check).toBe('2(8)+4 = 20');
  });

  test('apply wraps the prose operation in \\text{} so KaTeX renders it upright', () => {
    const { elements } = adaptBoardCommands([{ action: 'apply', op: 'subtract 4 from both sides' }]);
    expect(elements[0].semantic.latex).toBe('\\text{subtract 4 from both sides}');
    expect(elements[0].semantic.op).toBe('subtract 4 from both sides'); // raw phrase preserved
  });

  test('equation semantic exposes latex (what the renderer reads)', () => {
    const { elements } = adaptBoardCommands([{ action: 'pose', tex: '3x = 9' }]);
    expect(elements[0].semantic.latex).toBe('3x = 9');
  });
});

describe('adaptBoardCommands — directives & coverage gaps', () => {
  test('clear is a directive, not an element', () => {
    const { elements, clear } = adaptBoardCommands([{ action: 'clear' }]);
    expect(clear).toBe(true);
    expect(elements).toHaveLength(0);
  });

  test('concept model maps to a workspace element (§6.8 — was unmapped before dom/modelElement.js)', () => {
    const { elements, unmapped } = adaptBoardCommands([{ action: 'model', model: 'slope_intercept_line' }]);
    expect(unmapped).toHaveLength(0);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe('model');
    expect(elements[0].semantic.model).toBe('slope_intercept_line');
  });

  test('a command missing its required payload is skipped and reported', () => {
    const { elements, unmapped } = adaptBoardCommands([{ action: 'pose' }, { action: 'graph' }]);
    expect(elements).toHaveLength(0);
    expect(unmapped.map(u => u.action).sort()).toEqual(['graph', 'pose']);
  });

  test('ignores malformed entries without throwing', () => {
    const { elements } = adaptBoardCommands([null, 42, {}, { action: 5 }, { action: 'pose', tex: 'x=1' }]);
    expect(elements).toHaveLength(1);
  });

  test('non-array input → empty result', () => {
    expect(adaptBoardCommands(undefined)).toEqual({ elements: [], clear: false, unmapped: [] });
  });
});

describe('adaptBoardCommands — a full tutor turn (P5 DoD: equivalent content)', () => {
  // A real solve-cycle turn from the pipeline.
  const turn = [
    { action: 'pose', tex: '2x + 4 = 20' },
    { action: 'apply', op: 'subtract 4 from both sides' },
    { action: 'resolve', tex: '2x = 16' },
    { action: 'verify', tex: 'x = 8', check: '2(8)+4 = 20' },
  ];

  test('every board card is conveyed as a workspace element, in order', () => {
    const { elements } = adaptBoardCommands(turn);
    expect(elements.map(e => e.semantic.role)).toEqual(['problem', 'operation', 'step', 'solution']);
    expect(elements.map(e => e.semantic.latex || e.semantic)).toContain('2x + 4 = 20');
    assertAllValid(elements);
  });

  test('cards stack down the canvas (no pile-up) with unique ids', () => {
    const { elements } = adaptBoardCommands(turn);
    const ys = elements.map(e => e.position.y);
    expect(new Set(ys).size).toBe(ys.length);           // distinct y per card
    expect(ys).toEqual([...ys].sort((a, b) => a - b));  // increasing (stacked)
    expect(new Set(elements.map(e => e.id)).size).toBe(elements.length); // unique ids
    expect(elements.every(e => e.z !== undefined)).toBe(true);
  });

  test('legacy content is committed, not provisional (that state is for student moves)', () => {
    const { elements } = adaptBoardCommands(turn);
    expect(elements.every(e => e.provisional === false)).toBe(true);
  });

  test('createdAt only when caller supplies a timestamp (no ambient Date.now)', () => {
    expect(adaptBoardCommands(turn)[0]) ; // no throw
    const withTime = adaptBoardCommands(turn, { now: '2026-07-13T00:00:00.000Z' });
    expect(withTime.elements[0].createdAt).toBe('2026-07-13T00:00:00.000Z');
    const without = adaptBoardCommands(turn);
    expect(without.elements[0].createdAt).toBeUndefined();
  });
});
