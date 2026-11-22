/**
 * THE HARD MOMENT GOES TO THE STRONGER MODEL
 *
 * Owner's decision, 2026-11-22. A student who has missed the same thing twice needs the
 * explanation to change, and gpt-4o-mini would not change it under four different
 * instructions (live eval, representation-switch persona: 0 of 5, four runs in a row — the
 * reply was "you had 3/6 + 2/6, what is 3 + 2?" every time). So the one reply that follows a
 * second wrong answer is written by a stronger model, and every other turn is untouched.
 *
 * Whether the stronger model actually changes its approach is the live tier's question.
 * This file pins WHICH model is asked, and that nothing else moved.
 */
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn(), callLLMStream: jest.fn() }));
jest.mock('../../utils/openaiClient', () => ({ chat: { completions: { create: jest.fn() } } }));

const { modelForDecision, escalationModel, assemblePrompt } = require('../../utils/pipeline/generate');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const fs = require('fs');
const path = require('path');

describe('modelForDecision', () => {
  it('an ordinary turn uses the tutor model', () => {
    expect(modelForDecision({ action: 'guide_incorrect' }, {})).toBe('gpt-4o-mini');
    expect(modelForDecision({}, { TUTOR_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
    expect(modelForDecision(null, {})).toBe('gpt-4o-mini');
  });

  it('a repeat miss goes to gpt-4o when the tutor is a budget-tier model', () => {
    expect(modelForDecision({ repeatMiss: true }, {})).toBe('gpt-4o');
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_MODEL: 'gpt-4o-mini' })).toBe('gpt-4o');
    // The 4o-mini successor (OpenAI retires gpt-4o-mini 2027-01-14) is budget tier too.
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_MODEL: 'gpt-6-luna' })).toBe('gpt-4o');
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_MODEL: 'gpt-5.6-luna' })).toBe('gpt-4o');
  });

  it('does not "escalate" DOWN when the tutor has been pointed at another model', () => {
    // A hard-coded gpt-4o would be a downgrade from a stronger TUTOR_MODEL.
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
    expect(escalationModel({ TUTOR_MODEL: 'claude-sonnet-5' })).toBeNull();
  });

  it('TUTOR_ESCALATION_MODEL names the model, whatever the tutor is', () => {
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_ESCALATION_MODEL: 'gpt-5' })).toBe('gpt-5');
    expect(modelForDecision({ repeatMiss: true }, { TUTOR_MODEL: 'claude-haiku-4-5', TUTOR_ESCALATION_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
  });

  it('TUTOR_ESCALATION_MODEL=off is the kill switch', () => {
    for (const v of ['off', 'OFF', 'none', 'false', '0']) {
      expect(modelForDecision({ repeatMiss: true }, { TUTOR_ESCALATION_MODEL: v })).toBe('gpt-4o-mini');
    }
  });
});

describe('the pipeline asks the stronger model on that turn, and only that turn', () => {
  const base = { systemPrompt: 'SYSTEM', messages: [{ role: 'user', content: 'is it 2/5?' }] };
  const saved = { m: process.env.TUTOR_MODEL, e: process.env.TUTOR_ESCALATION_MODEL };
  beforeEach(() => { delete process.env.TUTOR_MODEL; delete process.env.TUTOR_ESCALATION_MODEL; });
  afterAll(() => {
    for (const [k, v] of [['TUTOR_MODEL', saved.m], ['TUTOR_ESCALATION_MODEL', saved.e]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  const decisionFor = (repeatMiss) => ({
    action: ACTIONS.GUIDE_INCORRECT, directives: [], repeatMiss,
    observation: { answer: { value: '2/5' } }, diagnosis: { correctAnswer: '5/6' },
  });

  it('assemblePrompt carries gpt-4o on a repeat miss', () => {
    expect(assemblePrompt(decisionFor(true), base).model).toBe('gpt-4o');
  });

  it('and the tutor model on a first miss', () => {
    expect(assemblePrompt(decisionFor(false), base).model).toBe('gpt-4o-mini');
  });

  it('the kill switch is read at call time, not at boot', () => {
    process.env.TUTOR_ESCALATION_MODEL = 'off';
    expect(assemblePrompt(decisionFor(true), base).model).toBe('gpt-4o-mini');
  });

  it('decide sets repeatMiss in exactly one place: the second-wrong branch', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'pipeline', 'decide.js'), 'utf8');
    expect(src.match(/decision\.repeatMiss\s*=\s*true/g)).toHaveLength(1);
    const i = src.indexOf('decision.repeatMiss = true');
    expect(src.slice(i - 500, i)).toMatch(/recentWrongCount >= 2/);
    expect(typeof decide).toBe('function');
  });
});

describe('the live eval measures the model a student would get', () => {
  it('the persona eval takes its model from modelForDecision', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'eval', 'livePersonaEval.test.js'), 'utf8');
    expect(src).toMatch(/modelForDecision\(decision\)/);
  });
});
