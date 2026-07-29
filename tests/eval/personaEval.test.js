/**
 * PERSONA EVAL — deterministic tier. Runs the behavioral personas through the
 * REAL observe → diagnose → decide stages with the LLM boundary empty, plus
 * real prompt assembly for the answer-leak invariant. No API key, runs in the
 * keyless CI gate with the rest of `npm run test:eval`.
 *
 * What this pins that the unit suite doesn't: multi-turn trajectories. A
 * decide-stage tweak that looks fine on a single hand-built context can still
 * break "the frustrated kid gets acknowledged" or "the answer-fisher never
 * gets the answer into the prompt" three turns into a conversation.
 */

// generate.js (assemblePrompt) loads llmGateway → openaiClient at module
// scope; mock the gateway so the keyless suite never constructs the client.
jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const personas = require('./personas.json').personas;
const { runScenario, formatFailures } = require('./runner');
const { assemblePrompt } = require('../../utils/pipeline/generate');

const BASE_SYSTEM_PROMPT = '--- IDENTITY ---\nYou are Maya, a warm middle-school math tutor.';

function assembleForTurn({ decision, history }) {
  return assemblePrompt(decision, {
    systemPrompt: BASE_SYSTEM_PROMPT,
    messages: history,
    useSlimRules: false,
  });
}

describe('persona eval — deterministic pedagogy invariants', () => {
  for (const persona of personas) {
    test(persona.name, async () => {
      const result = await runScenario(persona, { assemblePrompt: assembleForTurn });
      if (!result.classificationPassed) {
        throw new Error(`persona invariant failed:\n${formatFailures(result).join('\n')}`);
      }
    });
  }
});

describe('persona suite integrity', () => {
  test('every persona has at least one decide-layer assertion', () => {
    for (const p of personas) {
      const hasDecide = p.turns.some((t) => t.expectDecide || t.expectPrompt);
      expect(hasDecide).toBe(true);
    }
  });

  test('live-tier judgeLlm specs only reference known judges', () => {
    const known = new Set(['answerLeak', 'scaffoldVsTell', 'toneSupport']);
    for (const p of personas) {
      for (const t of p.turns) {
        for (const name of Object.keys(t.judgeLlm || {})) {
          expect(known.has(name)).toBe(true);
        }
      }
    }
  });
});
