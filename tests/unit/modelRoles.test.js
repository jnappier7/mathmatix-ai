/**
 * utils/modelRoles — the OpenAI models behind the roles that used to be a
 * hard-coded `gpt-4o`. OpenAI retires gpt-4o and gpt-4o-mini on 2027-01-14.
 *
 * Pins three things:
 *   1. the defaults and their env overrides (each role is a Render env flip);
 *   2. the cross-provider shape the graders depend on — the verifier's tier 2
 *      and the check-work OpenAI judge are OpenAI while tier 1 / the other judge
 *      is Claude, so no model ever grades its own work alone;
 *   3. that no bare 'gpt-4o' literal is left in runtime code — a wrong or retired
 *      id is a terminal 400 with no fallback (openaiClient isTransientError), so
 *      the failure mode is "every check-work upload fails", silently.
 */
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn(), callLLMStructured: jest.fn(), callLLMStream: jest.fn() }));

const fs = require('fs');
const path = require('path');
const roles = require('../../utils/modelRoles');

describe('defaults', () => {
  it('vision reads photos on gpt-6-sol, judging runs on gpt-6.1-terra, tier 1 stays Claude', () => {
    expect(roles.visionModel({})).toBe('gpt-6-sol');
    expect(roles.judgeModel({})).toBe('gpt-6.1-terra');
    expect(roles.verifierModel({})).toBe('claude-haiku-5-5');
    expect(roles.verifierEscalationModel({})).toBe('gpt-6.1-terra');
  });
  it('none of them is a model OpenAI retires on 2027-01-14', () => {
    for (const fn of ['visionModel', 'judgeModel', 'verifierEscalationModel']) {
      expect(roles[fn]({})).not.toMatch(/gpt-4o/);
    }
  });
});

describe('env overrides', () => {
  it('each role reads its own var, trimmed, and ignores an empty one', () => {
    expect(roles.visionModel({ VISION_MODEL: ' gpt-6.2-sol ' })).toBe('gpt-6.2-sol');
    expect(roles.visionModel({ VISION_MODEL: '   ' })).toBe('gpt-6-sol');
    expect(roles.judgeModel({ JUDGE_MODEL: 'gpt-6-sol' })).toBe('gpt-6-sol');
    expect(roles.verifierModel({ VERIFIER_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
  });
  it('the verifier tier 2 follows JUDGE_MODEL unless VERIFIER_ESCALATION_MODEL names its own', () => {
    expect(roles.verifierEscalationModel({ JUDGE_MODEL: 'gpt-6-sol' })).toBe('gpt-6-sol');
    expect(roles.verifierEscalationModel({ JUDGE_MODEL: 'gpt-6-sol', VERIFIER_ESCALATION_MODEL: 'gpt-6.2-sol' })).toBe('gpt-6.2-sol');
  });
});

describe('the sites read the roles', () => {
  it('llmGateway DEFAULT_MODELS: grading is the vision model, judge is the judge model', () => {
    const gateway = jest.requireActual('../../utils/llmGateway');
    expect(gateway.DEFAULT_MODELS.grading).toBe(roles.visionModel());
    expect(gateway.DEFAULT_MODELS.judge).toBe(roles.judgeModel());
  });
  it('the check-work grader reads with the vision model and judges cross-provider', () => {
    const { _internal } = require('../../utils/pipeline/checkWorkGrader');
    expect(_internal.JUDGE_MODELS).toEqual([roles.judgeModel(), roles.verifierModel()]);
    const [openaiJudge, claudeJudge] = _internal.JUDGE_MODELS;
    expect(openaiJudge).not.toMatch(/^claude/);
    expect(claudeJudge).toMatch(/^claude/);
  });
  it('the answer verifier escalates from Claude to the OpenAI judge', () => {
    const { VERIFIER_MODEL, ESCALATION_MODEL } = require('../../utils/pipeline/llmVerifier');
    expect(VERIFIER_MODEL).toBe(roles.verifierModel());
    expect(ESCALATION_MODEL).toBe(roles.verifierEscalationModel());
    expect(VERIFIER_MODEL).toMatch(/^claude/);
    expect(ESCALATION_MODEL).not.toMatch(/^claude/);
  });
});

describe('no runtime file names gpt-4o by hand', () => {
  const ROOT = path.resolve(__dirname, '..', '..');
  const DIRS = ['utils', 'routes', 'services', 'config', 'middleware', 'models', 'scripts'];
  const walk = (dir, out = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p, out); }
      else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  it("no quoted 'gpt-4o' (the retired vision/judge id) outside modelRoles' own comments", () => {
    const hits = [];
    for (const dir of DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        // Strip line comments: the rule is about ids that are SENT, not prose.
        const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        if (/['"`]gpt-4o(-20\d\d-\d\d-\d\d)?['"`]/.test(code)) hits.push(path.relative(ROOT, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
