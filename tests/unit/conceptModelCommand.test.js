const { resolveModelCommands, LIMITS } = require('../../utils/conceptModelCommand');

// A minimal, structurally-valid generated spec (a model NOT in the curated
// catalog) — the long-tail shape the tutor authors.
function validGeneratedSpec() {
  return {
    model: 'cosine_wave',
    title: 'y = a·cos(bx)',
    params: { a: 2, b: 1 },
    controls: [{ type: 'slider', param: 'a', label: 'a', range: [-3, 3], step: 0.25 }],
    elements: [
      { id: 'plane', type: 'plane', x: [-7, 7], y: [-4, 4], grid: true, axisLabels: true },
      { id: 'curve', type: 'function', fn: 'a*cos(b*x)' },
      { id: 'out', type: 'readout', text: 'y = {a}cos({b}x)', at: 'top' },
    ],
    reveal: ['plane', 'curve', 'out'],
    prompt: 'Slide a and b — what changes?',
  };
}

describe('conceptModelCommand — resolveModelCommands (generative long-tail gate)', () => {
  it('passes a curated model name through untouched', () => {
    const cmds = [{ action: 'model', model: 'slope_intercept_line', prompt: 'Slide m' }];
    const { commands, dropped } = resolveModelCommands(cmds);
    expect(dropped).toHaveLength(0);
    expect(commands).toEqual(cmds);
  });

  it('drops an unknown curated name', () => {
    const { commands, dropped } = resolveModelCommands([{ action: 'model', model: 'not_a_real_model' }]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_unknown_name');
  });

  it('parses + validates a generated spec (JSON string) and attaches the object', () => {
    const spec = validGeneratedSpec();
    const { commands, dropped } = resolveModelCommands([
      { action: 'model', spec: JSON.stringify(spec), prompt: 'Slide a and b' },
    ]);
    expect(dropped).toHaveLength(0);
    expect(commands).toHaveLength(1);
    // The string is replaced by the parsed object.
    expect(typeof commands[0].spec).toBe('object');
    expect(commands[0].spec.model).toBe('cosine_wave');
    // The prompt is preserved, and the spec's name surfaces as the command name.
    expect(commands[0].prompt).toBe('Slide a and b');
    expect(commands[0].model).toBe('cosine_wave');
  });

  it('validates a generated spec already given as an object', () => {
    const { commands, dropped } = resolveModelCommands([
      { action: 'model', spec: validGeneratedSpec() },
    ]);
    expect(dropped).toHaveLength(0);
    expect(commands[0].spec.model).toBe('cosine_wave');
  });

  it('drops a spec that is not valid JSON', () => {
    const { commands, dropped } = resolveModelCommands([
      { action: 'model', spec: '{ not valid json' },
    ]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_spec_unparseable');
  });

  it('drops a structurally-invalid spec (a reference that does not resolve)', () => {
    const spec = validGeneratedSpec();
    // fn reads `c`, which is not a declared param — the validator must reject it,
    // so a generated model "can pick a weird layout but cannot display wrong math."
    spec.elements[1].fn = 'a*cos(b*x) + c';
    const { commands, dropped } = resolveModelCommands([
      { action: 'model', spec: JSON.stringify(spec) },
    ]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_spec_invalid');
    expect(dropped[0].errors.join(' ')).toMatch(/unknown name "c"/);
  });

  it('drops a spec that blows the size bounds', () => {
    const spec = validGeneratedSpec();
    spec.elements = [];
    for (let i = 0; i < LIMITS.elements + 5; i++) {
      spec.elements.push({ id: 'p' + i, type: 'point', at: [0, 0] });
    }
    const { commands, dropped } = resolveModelCommands([
      { action: 'model', spec: JSON.stringify(spec) },
    ]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_spec_exceeds_limits');
  });

  it('drops a spec whose raw JSON is too large before parsing', () => {
    const huge = 'x'.repeat(LIMITS.specChars + 1);
    const { commands, dropped } = resolveModelCommands([{ action: 'model', spec: huge }]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_spec_too_large');
  });

  it('drops a model command with neither a name nor a spec', () => {
    const { commands, dropped } = resolveModelCommands([{ action: 'model', prompt: 'hi' }]);
    expect(commands).toHaveLength(0);
    expect(dropped[0].reason).toBe('model_missing_spec_and_name');
  });

  it('leaves non-model commands untouched and in order', () => {
    const cmds = [
      { action: 'pose', tex: '2x + 4 = 20' },
      { action: 'model', model: 'two_point_line' },
      { action: 'graph', fn: 'x^2' },
    ];
    const { commands, dropped } = resolveModelCommands(cmds);
    expect(dropped).toHaveLength(0);
    expect(commands).toEqual(cmds);
  });

  it('returns empty for a non-array input', () => {
    expect(resolveModelCommands(null)).toEqual({ commands: [], dropped: [] });
  });
});
