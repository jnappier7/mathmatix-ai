// Integration test for the trial living-board wiring in routes/trialChat.js:
//   1. the ALREADY-GATED board commands are forwarded, filtered to the ops the
//      lightweight trial notebook renders (graph/image/model dropped);
//   2. the board pin is carried across turns SERVER-SIDE via the session (never
//      from the client body), and is per-browser.

var mockPinsSeen = []; // pins runPipeline received, in call order (mock-prefixed for jest)

jest.mock('../../utils/pipeline', () => ({
  runPipeline: jest.fn(async (msg, ctx) => {
    mockPinsSeen.push(ctx.conversation.boardProblem ? ctx.conversation.boardProblem.tex : null);
    // Simulate the pipeline posing + pinning the problem this turn.
    ctx.conversation.boardProblem = { tex: '3x + 7 = 22' };
    return {
      text: 'What undoes the +7?',
      boardCommands: [
        { action: 'pose', tex: '3x + 7 = 22' },
        { action: 'scaffold', tex: 'x = \\boxed{}' },
        { action: 'graph', fn: 'y=3x+7', caption: 'line' }, // forwarded WITH server points
        { action: 'image', query: 'triangle' },             // must be filtered out
      ],
      _pipeline: { messageType: 'answer_attempt', action: 'scaffold', flags: [] },
    };
  }),
}));
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'hi' } }] }) }));
jest.mock('../../utils/prompt', () => ({ generateSystemPrompt: jest.fn().mockReturnValue('SYS') }));
jest.mock('../../middleware/promptInjection', () => ({ sanitizeForAI: (s) => s }));
jest.mock('../../utils/ttsProvider', () => ({ isConfigured: () => false }));

const express = require('express');
const request = require('supertest');
const trialRouter = require('../../routes/trialChat');

// Fake per-browser session keyed by a test header (mirrors the Mongo-backed session).
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

const TUTOR = 'mr-nappier';
const send = (app, hdr) => request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message: '3x + 7 = 22' });

beforeEach(() => { mockPinsSeen.length = 0; });

describe('trial living-board wiring', () => {
  test('forwards notebook-renderable ops; graph gets server points; image dropped', async () => {
    const app = buildApp();
    const res = await send(app, { 'x-test-browser': 'a' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.board)).toBe(true);
    const actions = res.body.board.map(c => c.action);
    expect(actions).toEqual(['pose', 'scaffold', 'graph']); // image dropped
    expect(actions).not.toContain('image');

    // The graph card carries server-computed points (client never parses math).
    const graph = res.body.board.find(c => c.action === 'graph');
    expect(Array.isArray(graph.points)).toBe(true);
    expect(graph.points.length).toBeGreaterThan(2);
    expect(typeof graph.yMin).toBe('number');
  });

  test('carries the board pin across turns via the session (not the client body)', async () => {
    const app = buildApp();
    const hdr = { 'x-test-browser': 'b' };

    await send(app, hdr); // turn 1
    await send(app, hdr); // turn 2 (same browser)

    expect(mockPinsSeen[0]).toBeNull();          // no pin on the first turn
    expect(mockPinsSeen[1]).toBe('3x + 7 = 22'); // restored from the session on turn 2
  });

  test('awards engagement XP and accumulates it server-side across turns', async () => {
    const app = buildApp();
    const hdr = { 'x-test-browser': 'xp' };

    const t1 = await send(app, hdr); // answer_attempt → 15
    expect(t1.body.xp).toMatchObject({ awarded: 15, total: 15 });

    const t2 = await send(app, hdr);
    expect(t2.body.xp.total).toBe(30); // accumulates in the session, not reset per turn
  });

  test('the pin is per-browser (a different session starts unpinned)', async () => {
    const app = buildApp();
    await send(app, { 'x-test-browser': 'c' }); // c pins
    await send(app, { 'x-test-browser': 'd' }); // d is a different browser

    expect(mockPinsSeen[0]).toBeNull(); // c turn 1
    expect(mockPinsSeen[1]).toBeNull(); // d turn 1 — unaffected by c
  });
});
