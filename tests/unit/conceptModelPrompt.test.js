const {
  isConceptModelsEnabled,
  isConceptModelsGenerativeEnabled,
  buildConceptModelInstructions,
  modelCatalogLines,
} = require('../../utils/conceptModelPrompt');
const { MODELS, validateModelSpec } = require('../../public/js/conceptModelSpec');

describe('conceptModelPrompt — CONCEPT_MODELS flag', () => {
  const original = process.env.CONCEPT_MODELS;
  afterEach(() => {
    if (original === undefined) delete process.env.CONCEPT_MODELS;
    else process.env.CONCEPT_MODELS = original;
  });

  it('defaults OFF', () => {
    delete process.env.CONCEPT_MODELS;
    expect(isConceptModelsEnabled()).toBe(false);
  });

  it('reads the flag at call time ("true" / "1")', () => {
    process.env.CONCEPT_MODELS = 'true';
    expect(isConceptModelsEnabled()).toBe(true);
    process.env.CONCEPT_MODELS = '1';
    expect(isConceptModelsEnabled()).toBe(true);
    process.env.CONCEPT_MODELS = 'false';
    expect(isConceptModelsEnabled()).toBe(false);
  });
});

describe('conceptModelPrompt — CONCEPT_MODELS_GENERATIVE flag', () => {
  const original = process.env.CONCEPT_MODELS_GENERATIVE;
  afterEach(() => {
    if (original === undefined) delete process.env.CONCEPT_MODELS_GENERATIVE;
    else process.env.CONCEPT_MODELS_GENERATIVE = original;
  });

  it('defaults OFF', () => {
    delete process.env.CONCEPT_MODELS_GENERATIVE;
    expect(isConceptModelsGenerativeEnabled()).toBe(false);
  });

  it('reads the flag at call time ("true" / "1")', () => {
    process.env.CONCEPT_MODELS_GENERATIVE = 'true';
    expect(isConceptModelsGenerativeEnabled()).toBe(true);
    process.env.CONCEPT_MODELS_GENERATIVE = '1';
    expect(isConceptModelsGenerativeEnabled()).toBe(true);
    process.env.CONCEPT_MODELS_GENERATIVE = 'false';
    expect(isConceptModelsGenerativeEnabled()).toBe(false);
  });
});

describe('conceptModelPrompt — instruction text', () => {
  it('lists every curated model from the single source of truth', () => {
    const lines = modelCatalogLines();
    MODELS.forEach((name) => {
      expect(lines).toContain(name);
    });
  });

  it('emits <BOARD> tag syntax in legacy mode', () => {
    const text = buildConceptModelInstructions(false);
    expect(text).toMatch(/<BOARD action="model"/);
    expect(text).not.toMatch(/board_commands/);
    expect(text).toContain('slope_intercept_line');
  });

  it('emits board_commands JSON syntax in structured mode', () => {
    const text = buildConceptModelInstructions(true);
    expect(text).toMatch(/board_commands/);
    expect(text).toMatch(/action: "model"/);
    expect(text).not.toMatch(/<BOARD/);
  });

  it('frames summoning with intent (a prompt) and the safety note', () => {
    const text = buildConceptModelInstructions(false);
    expect(text.toLowerCase()).toContain('intent');
    expect(text).toMatch(/prompt/);
    expect(text.toLowerCase()).toContain('never the student');
  });

  it('omits the generative section unless asked for it', () => {
    expect(buildConceptModelInstructions(false)).not.toMatch(/GENERATIVE LONG-TAIL/);
    expect(buildConceptModelInstructions(true)).not.toMatch(/GENERATIVE LONG-TAIL/);
  });

  it('appends the generative authoring section when generative is on', () => {
    const tag = buildConceptModelInstructions(false, { generative: true });
    expect(tag).toMatch(/GENERATIVE LONG-TAIL/);
    // The curated section is still present (generative is additive).
    expect(tag).toContain('slope_intercept_line');
    // Legacy mode teaches putting the spec JSON in the tag body.
    expect(tag).toMatch(/<BOARD action="model"[^>]*>\{/);

    const structured = buildConceptModelInstructions(true, { generative: true });
    expect(structured).toMatch(/GENERATIVE LONG-TAIL/);
    // Structured mode teaches the spec field.
    expect(structured).toMatch(/spec/);
  });

  it("the generative section's worked example is itself a valid spec", () => {
    // The example we hand the LLM must pass the very validator that gates its
    // output — otherwise we'd be teaching a shape we'd then reject.
    const example = {
      model: 'cosine_wave',
      title: 'y = a·cos(bx)',
      params: { a: 1, b: 1 },
      controls: [{ type: 'slider', param: 'a', label: 'a', range: [-3, 3], step: 0.25 }],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10], grid: true, axisLabels: true },
        { id: 'curve', type: 'function', fn: 'a*cos(b*x)' },
        { id: 'out', type: 'readout', text: 'y = {a}cos({b}x)', at: 'top' },
      ],
      reveal: ['plane', 'curve', 'out'],
      prompt: 'Slide a and b — how does the wave change?',
    };
    expect(validateModelSpec(example).valid).toBe(true);
  });
});
