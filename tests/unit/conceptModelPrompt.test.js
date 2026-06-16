const {
  isConceptModelsEnabled,
  isConceptModelsGenerativeEnabled,
  buildConceptModelInstructions,
  GENERATIVE_EXAMPLES,
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

  it('every example the LLM is shown is itself a valid spec', () => {
    // The examples we hand the LLM must pass the very validator that gates its
    // output — otherwise we'd be teaching a shape we'd then reject. Validate the
    // EXPORTED objects (the actual source of the shown JSON), so an example can't
    // drift out of validity unnoticed.
    Object.keys(GENERATIVE_EXAMPLES).forEach((key) => {
      const result = validateModelSpec(GENERATIVE_EXAMPLES[key]);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('the shown examples are emitted as strict, parseable JSON (no comments)', () => {
    // Regression for the foot-gun where the template carried `//` comments that
    // would make a copied spec unparseable. The JSON blocks must round-trip and
    // re-validate.
    const text = buildConceptModelInstructions(false, { generative: true });
    expect(text).not.toMatch(/^\s*\/\//m);            // no comment lines
    const fnJson = JSON.stringify(GENERATIVE_EXAMPLES.fn, null, 2);
    expect(text).toContain(fnJson);                   // the literal JSON is present
    expect(validateModelSpec(JSON.parse(fnJson)).valid).toBe(true);
  });

  it('documents that measures are angle-only and coords take numbers/params', () => {
    const text = buildConceptModelInstructions(false, { generative: true });
    expect(text).toMatch(/ANGLES ONLY/);
    expect(text.toLowerCase()).toContain('draws the arc');
  });
});
