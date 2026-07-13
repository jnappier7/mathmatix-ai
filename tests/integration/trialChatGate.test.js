// Integration test for the durable, per-browser trial gate.
//
// Guards the anti-farming fix: the free-turn limit must survive a page refresh
// (same session) and must be scoped per browser (each session gets its own
// allowance), NOT per in-memory-process or per IP.

// Mock the heavy/nondeterministic dependencies so we exercise ONLY the gate.
jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Greeting!' } }] }),
}));
jest.mock('../../utils/pipeline', () => ({
  runPipeline: jest.fn().mockResolvedValue({
    text: 'Here is a guiding question — what do you think the first step is?',
    _pipeline: { messageType: 'QUESTION', action: 'scaffold', flags: [] },
  }),
}));
jest.mock('../../utils/prompt', () => ({
  generateSystemPrompt: jest.fn().mockReturnValue('SYSTEM PROMPT'),
}));
jest.mock('../../middleware/promptInjection', () => ({
  sanitizeForAI: (s) => s,
}));

const express = require('express');
const request = require('supertest');
const trialRouter = require('../../routes/trialChat');

// A fake session middleware that persists per "browser" — keyed by a test
// header. Same header across requests = the SAME session surviving a refresh;
// a different header = a different browser. This mirrors the Mongo-backed
// session the real app uses.
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

// A valid unlocked tutor id (mirrors what the landing page sends).
const TUTOR = 'mr-nappier';

describe('trial gate — durable, per-browser', () => {
  test('one browser gets exactly 4 turns (greet + 3), then is gated', async () => {
    const app = buildApp();
    const browser = 'alice';
    const hdr = { 'x-test-browser': browser };

    const greet = await request(app).post('/api/trial-chat/greet').set(hdr).send({ tutorId: TUTOR });
    expect(greet.body.greeting).toBeTruthy();
    expect(greet.body.turnsRemaining).toBe(3);

    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message: 'Solve 2x=10' });
      expect(r.body.reply).toBeTruthy();
    }

    // The 3rd message hit the limit — the response says gated.
    const last = await request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message: 'again' });
    expect(last.body.gated).toBe(true);
    expect(last.body.reply).toBeNull();
  });

  test('refreshing (same session) does NOT grant more turns', async () => {
    const app = buildApp();
    const hdr = { 'x-test-browser': 'bob' };

    // Exhaust: greet + 3 messages.
    await request(app).post('/api/trial-chat/greet').set(hdr).send({ tutorId: TUTOR });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message: 'q' });
    }

    // Simulate a refresh: the landing page calls /greet again on load.
    const regreet = await request(app).post('/api/trial-chat/greet').set(hdr).send({ tutorId: TUTOR });
    expect(regreet.body.gated).toBe(true);
    expect(regreet.body.greeting).toBeNull();

    // And trying to send another message is still gated.
    const retry = await request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message: 'more please' });
    expect(retry.body.gated).toBe(true);
  });

  test('a different browser gets its own fresh allowance (fair to shared IPs)', async () => {
    const app = buildApp();

    // Browser 1 exhausts its turns.
    const h1 = { 'x-test-browser': 'shared-ip-student-1' };
    await request(app).post('/api/trial-chat/greet').set(h1).send({ tutorId: TUTOR });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/trial-chat').set(h1).send({ tutorId: TUTOR, message: 'q' });
    }
    const blocked = await request(app).post('/api/trial-chat').set(h1).send({ tutorId: TUTOR, message: 'q' });
    expect(blocked.body.gated).toBe(true);

    // Browser 2 (same test IP, different session) is unaffected.
    const h2 = { 'x-test-browser': 'shared-ip-student-2' };
    const greet2 = await request(app).post('/api/trial-chat/greet').set(h2).send({ tutorId: TUTOR });
    expect(greet2.body.greeting).toBeTruthy();
    expect(greet2.body.gated).toBeFalsy();
    const reply2 = await request(app).post('/api/trial-chat').set(h2).send({ tutorId: TUTOR, message: 'Solve 3x=9' });
    expect(reply2.body.reply).toBeTruthy();
  });
});
