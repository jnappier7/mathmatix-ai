/**
 * A graph of the student's OWN unsolved function is the answer, drawn
 * (QA on #1943, 2026-11-25). The landing preview has let function graphs
 * through to anonymous visitors since #1943; the only leak guard is the inline
 * graph gate, and it knew the problem only from the board pin or a graded
 * answer. On the turn a problem is first stated neither exists yet — the pin
 * is set AFTER the gate runs — so "find the roots of x^2-5x+6" answered with
 * [FUNCTION_GRAPH:fn=x^2-5x+6] shipped the parabola crossing at 2 and 3.
 *
 * These run the REAL route and the REAL pipeline; only the model is mocked.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));
jest.mock('../../utils/ttsProvider', () => ({ isConfigured: () => false }));
jest.mock('../../utils/visualDecisionLog', () => ({
  buildDecisionDoc: jest.fn(() => ({})),
  persistVisualDecisions: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { callLLM, callLLMStructured } = require('../../utils/llmGateway');
const trialRouter = require('../../routes/trialChat');
const { runPipeline } = require('../../utils/pipeline');

let mockReply = '';
function installModel() {
  const answer = (_model, messages) => {
    const sys = (messages.find((m) => m.role === 'system') || {}).content || '';
    // Verifier / judge calls: undecided, so nothing is graded.
    if (/math answer engine/i.test(sys)) return Promise.resolve({ choices: [{ message: { content: '{"answer":"unknown","form":"unknown"}' } }] });
    if (/equivalence judge/i.test(sys)) return Promise.resolve({ choices: [{ message: { content: '{"matches":false,"confidence":0.1,"rationale":"mock"}' } }] });
    return Promise.resolve({ choices: [{ message: { content: mockReply } }] });
  };
  callLLM.mockImplementation(answer);
  callLLMStructured.mockImplementation(() => Promise.reject(new Error('structured not mocked')));
}

function buildApp() {
  const sessions = new Map();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-test-browser'] || 'default';
    if (!sessions.has(id)) sessions.set(id, {});
    req.session = sessions.get(id);
    next();
  });
  app.use('/api/trial-chat', trialRouter);
  return app;
}

let browser = 0;
async function firstTrialTurn(message, reply) {
  mockReply = reply;
  browser += 1;
  const res = await request(buildApp())
    .post('/api/trial-chat')
    .set({ 'x-test-browser': `b${browser}` })
    .send({ tutorId: 'mr-nappier', message });
  expect(res.status).toBe(200);
  return res.body.reply;
}

beforeEach(() => { jest.clearAllMocks(); installModel(); });
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // No Mongo in a unit run: the plan lookup finds nothing and a fresh one is built in memory.
  jest.spyOn(require('../../models/tutorPlan'), 'findOne').mockResolvedValue(null);
});
afterAll(() => { jest.restoreAllMocks(); });

describe('landing preview: a first-turn graph of the student\'s own problem is not drawn', () => {
  test('the function itself: "find the roots of x^2-5x+6" → no parabola', async () => {
    const reply = await firstTrialTurn(
      'find the roots of x^2-5x+6',
      'Let\'s look at where it crosses the axis.\n\n[FUNCTION_GRAPH:fn=x^2-5x+6]\n\nWhat two numbers multiply to 6 and add to -5?');
    expect(reply).not.toMatch(/FUNCTION_GRAPH/);
    expect(reply).toMatch(/What two numbers multiply to 6/);
  });

  test('disguised as its factored form: fn=(x-2)(x-3)', async () => {
    const reply = await firstTrialTurn(
      'find the roots of x^2-5x+6',
      'Here is a picture to start from.\n\n[FUNCTION_GRAPH:fn=(x-2)(x-3)]\n\nWhat do you notice?');
    expect(reply).not.toMatch(/FUNCTION_GRAPH/);
  });

  test('an equation set to zero, and y= spelling: "solve x^2 - 5x + 6 = 0"', async () => {
    const reply = await firstTrialTurn(
      'solve x^2 - 5x + 6 = 0',
      'Picture it:\n\n[FUNCTION_GRAPH:fn=y = x^2 - 5x + 6,title="Your parabola"]\n\nWhere does it cross?');
    expect(reply).not.toMatch(/FUNCTION_GRAPH/);
  });

  test('the student\'s own system: the crossing point is the solution', async () => {
    const reply = await firstTrialTurn(
      'solve the system y = 2x + 1 and y = -x + 4',
      'Two lines:\n\n[SYSTEM_GRAPH:eqs="y=2x+1;y=-x+4"]\n\nWhere do they meet?');
    expect(reply).not.toMatch(/SYSTEM_GRAPH/);
  });

  test('a linear equation plotted as its residual line: "solve 3x + 7 = 22" → fn=3x-15', async () => {
    const reply = await firstTrialTurn(
      'solve 3x + 7 = 22',
      'See where this line crosses zero.\n\n[FUNCTION_GRAPH:fn=3x-15]\n\nWhat undoes the +7?');
    expect(reply).not.toMatch(/FUNCTION_GRAPH/);
  });
});

describe('…and what is not a leak still draws', () => {
  test('graphing IS the task: "graph y = x^2 - 5x + 6"', async () => {
    const reply = await firstTrialTurn(
      'can you graph y = x^2 - 5x + 6 for me',
      'Here it is.\n\n[FUNCTION_GRAPH:fn=x^2-5x+6]\n\nWhat shape is it?');
    expect(reply).toMatch(/\[FUNCTION_GRAPH:fn=x\^2-5x\+6\]/);
  });

  test('a different function — the tutor\'s own example — is left alone', async () => {
    const reply = await firstTrialTurn(
      'find the roots of x^2-5x+6',
      'First, a simpler cousin.\n\n[FUNCTION_GRAPH:fn=x^2-1]\n\nWhere does THIS one cross?');
    expect(reply).toMatch(/\[FUNCTION_GRAPH:fn=x\^2-1\]/);
  });

  test('a concept question with no problem in it', async () => {
    const reply = await firstTrialTurn(
      'what is a parabola?',
      'A parabola is a U-shaped curve.\n\n[FUNCTION_GRAPH:fn=x^2]\n\nWhat do you notice about its lowest point?');
    expect(reply).toMatch(/\[FUNCTION_GRAPH:fn=x\^2\]/);
  });
});

describe('the signed-in chat gets the same guard on the turn a problem is first stated', () => {
  const ctxFor = (message) => {
    const conversation = {
      _id: 'c1', messages: [{ role: 'user', content: message }],
      createdAt: new Date(), startDate: new Date(), problemsAttempted: 0, problemsCorrect: 0,
      boardProblem: null,
    };
    return {
      // _id null keeps the turn off Mongo (TutorPlan); the gate does not read it.
      user: { _id: null, firstName: 'Sam', level: 1, learningProfile: {}, skillMastery: new Map() },
      conversation,
      systemPrompt: 'You are a math tutor.',
      formattedMessages: [{ role: 'user', content: message }],
      activeSkill: null, phaseState: null, hasRecentUpload: false,
      stream: false, res: null, aiProcessingStartTime: Date.now(), skipPersist: true,
    };
  };

  test('no pin yet: the student\'s own function is not graphed', async () => {
    mockReply = 'Look here.\n\n[FUNCTION_GRAPH:fn=x^2-5x+6]\n\nWhat two numbers multiply to 6?';
    const out = await runPipeline('find the roots of x^2-5x+6', ctxFor('find the roots of x^2-5x+6'));
    expect(out.text).not.toMatch(/FUNCTION_GRAPH/);
  });

  test('a pinned problem still decides, exactly as before', async () => {
    mockReply = 'A fresh example.\n\n[FUNCTION_GRAPH:fn=x^2-9]\n\nWhere does it cross?';
    const ctx = ctxFor('ok show me another one');
    ctx.conversation.boardProblem = { tex: 'x^2 - 5x + 6 = 0' };
    const out = await runPipeline('ok show me another one', ctx);
    expect(out.text).toMatch(/\[FUNCTION_GRAPH:fn=x\^2-9\]/);
  });
});

describe('reading the problem from what the student wrote (statedProblem.js)', () => {
  const { problemFromStudentText } = require('../../utils/pipeline/statedProblem');
  const forms = (...messages) => (problemFromStudentText(messages) || { forms: null }).forms;

  test('the math beside a request a graph would answer', () => {
    expect(forms('find the roots of x^2-5x+6')).toEqual(['x^2-5x+6']);
    expect(forms('solve 3x + 7 = 22')).toEqual(['3x + 7 = 22']);
    expect(forms('what is the vertex of y=x^2-4x+3')).toEqual(['y=x^2-4x+3']);
    expect(forms('how do I find the zeros of f(x) = 2x² − 8.')).toEqual(['2x^2 - 8']);
    expect(forms('solve the system y = 2x + 1 and y = -x + 4')).toEqual(['y = 2x + 1', 'y = -x + 4']);
    expect(forms('x^2 - 5x + 6')).toEqual(['x^2 - 5x + 6']);
  });

  test('nothing when the student asks for the picture, or poses nothing', () => {
    expect(forms('can you graph y = x^2 - 5x + 6 for me')).toBeNull();
    expect(forms('sketch x^2-5x+6 so I can find the roots')).toBeNull();
    expect(forms('why is x^2 always positive?')).toBeNull();
    expect(forms('what is a parabola?')).toBeNull();
    expect(forms('')).toBeNull();
  });

  test('a problem from an earlier turn still counts; asking for the graph NOW lifts it', () => {
    expect(forms('i dont know where to start', 'find the roots of x^2-5x+6')).toEqual(['x^2-5x+6']);
    expect(forms('ok now graph it', 'find the roots of x^2-5x+6')).toBeNull();
  });
});

describe('the gate, given only what the student wrote', () => {
  const { assessLeak } = require('../../utils/visualGate');
  const stated = (...statedForms) => ({ problemText: 't', normalizedExpression: 't', statedForms, status: 'unsolved' });
  const leaks = (fn, problem) => assessLeak({ action: 'graph', fn }, problem).leak;

  test('the same function in any form is a leak', () => {
    expect(leaks('x^2-5x+6', stated('x^2-5x+6'))).toBe(true);
    expect(leaks('y = x^2 - 5x + 6', stated('x^2-5x+6'))).toBe(true);
    expect(leaks('(x-2)(x-3)', stated('x^2-5x+6'))).toBe(true);
    expect(leaks('2x^2-10x+12', stated('x^2-5x+6'))).toBe(true);
    expect(leaks('-x^2+5x-6', stated('x^2 - 5x + 6 = 0'))).toBe(true);
    expect(leaks('2(x^2-4)', stated('2x^2 - 8'))).toBe(true);
  });

  test('an equation: either side, the residual line, or both sides as two curves', () => {
    expect(leaks('3x+7', stated('3x + 7 = 22'))).toBe(true);
    expect(leaks('3x-15', stated('3x + 7 = 22'))).toBe(true);
    expect(leaks('y=3x+7;y=22', stated('3x + 7 = 22'))).toBe(true);
  });

  test('a system is a leak only when every curve is the student\'s', () => {
    expect(leaks('y=2x+1;y=-x+4', stated('y = 2x + 1', 'y = -x + 4'))).toBe(true);
    expect(leaks('y=2x+1;y=x-3', stated('y = 2x + 1', 'y = -x + 4'))).toBe(false);
  });

  test('whole forms, never substrings: the tutor\'s simpler cousin still draws', () => {
    expect(leaks('x^2', stated('x^2-5x+6'))).toBe(false);
    expect(leaks('x^2-1', stated('x^2-5x+6'))).toBe(false);
    expect(leaks('x^2-7x+12', stated('x^2-5x+6'))).toBe(false);
    expect(leaks('2x', stated('3x + 7 = 22'))).toBe(false);
  });

  test('a PINNED problem: unchanged, plus its own function rearranged', () => {
    const pinned = { problemText: 'x^2 - 5x + 6 = 0', normalizedExpression: 'x^2 - 5x + 6 = 0', correctAnswer: null, status: 'unsolved' };
    expect(leaks('x^2 - 5x + 6', pinned)).toBe(true);     // Rule A, as before
    expect(leaks('(x-2)(x-3)', pinned)).toBe(true);        // was allowed: no graded answer for Rule B
    expect(leaks('x^2 - 15x + 56', pinned)).toBe(false);   // a parallel problem
    expect(leaks('x^2-9', { ...pinned, status: 'solved' })).toBe(false);
  });
});

describe('the LaTeX normalizer leaves every drawable tag alone', () => {
  const { normalizeLatex } = require('../../utils/pipeline/verify');
  test.each([
    '[SYSTEM_GRAPH:eqs="y=2x+1;y=-x+4"]',
    '[FUNCTION_GRAPH:fn=x^2-5x+6]',
    '[REGULAR_POLYGON:sides=6,label="x^2"]',
    '[CIRCLE_DIAGRAM:r=5,show="r^2"]',
    '[COUNTERS:positive=3,negative=2]',
  ])('%s', (tag) => {
    expect(normalizeLatex(`Look:\n\n${tag}\n\nWhat do you see?`)).toContain(tag);
  });
});
