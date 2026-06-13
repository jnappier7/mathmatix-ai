const {
  isConceptModelsEnabled,
  buildConceptModelInstructions,
  modelCatalogLines,
} = require('../../utils/conceptModelPrompt');
const { MODELS } = require('../../public/js/conceptModelSpec');

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
});
