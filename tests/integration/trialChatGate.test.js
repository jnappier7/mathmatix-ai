// Integration test for the durable, per-browser preview gate.
//
// Guards the anti-farming fix: the free-turn limit must survive a page refresh
// (same session) and must be scoped per browser (each session gets its own
// allowance), NOT per in-memory-process or per IP.
//
// Every count here derives from the router's own MAX_TURNS. This file used to
// hardcode "4 turns (greet + 3)", so raising the preview to 8 volleys failed it
// for the one reason that is not a bug — the cap moving on purpose. What is
// actually under test is the SHAPE of the gate, which is unchanged: a greeting
// costs a turn, the allowance is per browser, and a refresh buys nothing.

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

const { MAX_TURNS } = trialRouter;
// The greeting consumes one turn, so this is what the visitor actually gets.
const PREVIEW_VOLLEYS = MAX_TURNS - 1;

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

const greet = (app, hdr) =>
  request(app).post('/api/trial-chat/greet').set(hdr).send({ tutorId: TUTOR });
const say = (app, hdr, message = 'Solve 2x=10') =>
  request(app).post('/api/trial-chat').set(hdr).send({ tutorId: TUTOR, message });

describe('trial gate — durable, per-browser', () => {
  test('the preview is long enough to finish a problem', () => {
    // A scaffolded problem runs 4-8 exchanges, so a cap below that walls the
    // visitor mid-solve — which reads as the tutor quitting, not as a hook.
    expect(PREVIEW_VOLLEYS).toBeGreaterThanOrEqual(8);
  });

  test('one browser gets exactly PREVIEW_VOLLEYS volleys, then is gated', async () => {
    const app = buildApp();
    const hdr = { 'x-test-browser': 'alice' };

    const g = await greet(app, hdr);
    expect(g.body.greeting).toBeTruthy();
    expect(g.body.turnsRemaining).toBe(PREVIEW_VOLLEYS);

    for (let i = 1; i <= PREVIEW_VOLLEYS; i++) {
      const r = await say(app, hdr);
      expect(r.body.reply).toBeTruthy();
      expect(r.body.turnsRemaining).toBe(PREVIEW_VOLLEYS - i);
      // The FINAL allowed volley still answers, and flags gated in the same
      // response — that pairing is the wall's contract with the client: the
      // cliffhanger reply renders, then the gate opens under it.
      expect(r.body.gated).toBe(i === PREVIEW_VOLLEYS);
    }

    // One past the cap: no reply at all.
    const last = await say(app, hdr, 'again');
    expect(last.body.gated).toBe(true);
    expect(last.body.reply).toBeNull();
  });

  test('refreshing (same session) does NOT grant more turns', async () => {
    const app = buildApp();
    const hdr = { 'x-test-browser': 'bob' };

    await greet(app, hdr);
    for (let i = 0; i < PREVIEW_VOLLEYS; i++) await say(app, hdr, 'q');

    // Simulate a refresh: the landing page calls /greet again on load.
    const regreet = await greet(app, hdr);
    expect(regreet.body.gated).toBe(true);
    expect(regreet.body.greeting).toBeNull();

    // And trying to send another message is still gated.
    const retry = await say(app, hdr, 'more please');
    expect(retry.body.gated).toBe(true);
  });

  test('a different browser gets its own fresh allowance (fair to shared IPs)', async () => {
    const app = buildApp();

    // Browser 1 exhausts its turns.
    const h1 = { 'x-test-browser': 'shared-ip-student-1' };
    await greet(app, h1);
    for (let i = 0; i < PREVIEW_VOLLEYS; i++) await say(app, h1, 'q');
    const blocked = await say(app, h1, 'q');
    expect(blocked.body.gated).toBe(true);
    expect(blocked.body.reply).toBeNull();

    // Browser 2 (same test IP, different session) is unaffected.
    const h2 = { 'x-test-browser': 'shared-ip-student-2' };
    const greet2 = await greet(app, h2);
    expect(greet2.body.greeting).toBeTruthy();
    expect(greet2.body.gated).toBeFalsy();
    const reply2 = await say(app, h2, 'Solve 3x=9');
    expect(reply2.body.reply).toBeTruthy();
  });

  test('the transcript carried into signup covers the whole preview', async () => {
    // routes/signup.js turns req.session.trialTranscript into a real
    // Conversation. If the greeting or any volley stops being recorded, the
    // wall's "your conversation continues right where you left off" quietly
    // becomes false — the failure mode this whole seam exists to prevent.
    const sessions = new Map();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (!sessions.has('solo')) sessions.set('solo', {});
      req.session = sessions.get('solo');
      next();
    });
    app.use('/api/trial-chat', trialRouter);

    await greet(app, {});
    for (let i = 0; i < PREVIEW_VOLLEYS; i++) await say(app, {}, `question ${i}`);

    const transcript = sessions.get('solo').trialTranscript;
    // greeting + one user/assistant pair per volley.
    expect(transcript).toHaveLength(1 + PREVIEW_VOLLEYS * 2);
    expect(transcript[0].role).toBe('assistant');
    expect(transcript[1]).toMatchObject({ role: 'user', content: 'question 0' });
    expect(transcript[2].role).toBe('assistant');
    expect(transcript.at(-1).role).toBe('assistant');
  });
});
