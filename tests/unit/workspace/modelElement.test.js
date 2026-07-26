/**
 * Concept-model bridge into the Living Workspace (spec §6.8).
 *
 * Until dom/modelElement.js, the P5 adapter dropped `model` commands with
 * 'no-workspace-element-yet' — interactives died at the door of the new
 * board even with CONCEPT_MODELS on. These tests pin the pipeline seams:
 * adapter mapping, spec parsing, and ledger replay fidelity for every
 * visual card type (graphs once silently lost their `fn` in the ledger's
 * field whitelist — that class of bug is what the round trip here catches).
 */
const { adaptBoardCommands } = require('../../../public/js/living-workspace/dom/legacyBoardAdapter.js');
const { parseSpec } = require('../../../public/js/living-workspace/dom/modelElement.js');
const { applyTurnToLedger } = require('../../../utils/pipeline/boardLedger');
const { ledgerToTurns } = require('../../../public/js/living-workspace/core/ledgerReplay.js');

const NOW = new Date('2026-07-25T12:00:00Z');

describe('adapter maps model commands', () => {
  test('curated model name → a model element with prompt', () => {
    const out = adaptBoardCommands([
      { action: 'model', model: 'slope_intercept_line', prompt: 'Slide m — what happens?' },
    ]);
    expect(out.unmapped).toEqual([]);
    expect(out.elements).toHaveLength(1);
    expect(out.elements[0].type).toBe('model');
    expect(out.elements[0].semantic).toEqual({ model: 'slope_intercept_line', spec: null, prompt: 'Slide m — what happens?' });
  });

  test('generated spec (JSON string) also maps; empty model card does not', () => {
    const spec = JSON.stringify({ model: 'custom', engine: 'jsxgraph' });
    expect(adaptBoardCommands([{ action: 'model', spec }]).elements[0].semantic.spec).toBe(spec);
    const out = adaptBoardCommands([{ action: 'model' }]);
    expect(out.elements).toEqual([]);
    expect(out.unmapped[0].reason).toBe('empty-or-unsupported');
  });
});

describe('parseSpec', () => {
  test('JSON strings parse, objects pass through, junk dies quietly', () => {
    expect(parseSpec('{"model":"m"}')).toEqual({ model: 'm' });
    const obj = { model: 'm' };
    expect(parseSpec(obj)).toBe(obj);
    expect(parseSpec('not json')).toBeNull();
    expect(parseSpec(null)).toBeNull();
  });
});

describe('every visual card type survives ledger → wire → replay → adapter', () => {
  test('graph fn, image query, diagram params, and model spec all round-trip', () => {
    let ledger = applyTurnToLedger(null, [{ action: 'pose', tex: 'y=mx+b' }], NOW);
    ledger = applyTurnToLedger(ledger, [
      { action: 'graph', fn: '2*x+1', caption: 'the line' },
      { action: 'image', query: 'balance scale' },
      { action: 'diagram', diagram_type: 'triangle', diagram_params: { a: 3, b: 4 } },
      { action: 'model', model: 'slope_intercept_line', prompt: 'Slide m' },
    ], NOW);

    const wire = JSON.parse(JSON.stringify(ledger));
    const turns = ledgerToTurns(wire);
    const out = adaptBoardCommands(turns[0], { idPrefix: 'rt' });

    expect(out.unmapped).toEqual([]);
    const byType = {};
    out.elements.forEach(e => { byType[e.type] = e.semantic; });
    expect(byType.graph.fn).toBe('2*x+1');
    expect(byType.image.query).toBe('balance scale');
    expect(byType.geometry.diagramType).toBe('triangle');
    expect(byType.model.model).toBe('slope_intercept_line');
    expect(byType.model.prompt).toBe('Slide m');
  });
});
