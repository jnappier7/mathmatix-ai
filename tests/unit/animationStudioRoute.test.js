// tests/unit/animationStudioRoute.test.js
// The Animation Studio producer endpoints (routes/animationStudio.js):
// role guard, input validation, and script sanitization. The LLM gateway is
// mocked — no network, no DB.

jest.mock('../../utils/llmGateway', () => ({
  callLLMStructured: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { callLLMStructured } = require('../../utils/llmGateway');
const router = require('../../routes/animationStudio');

function appAs(user) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    req.isAuthenticated = () => !!user;
    next();
  });
  app.use('/api/animation-studio', router);
  return app;
}

const teacher = { roles: ['teacher'], firstName: 'Pat' };
const student = { roles: ['student'] };

beforeEach(() => jest.clearAllMocks());

describe('role guard', () => {
  test('students are rejected', async () => {
    const res = await request(appAs(student)).get('/api/animation-studio/tutors');
    expect(res.status).toBe(403);
  });

  test('unauthenticated is rejected', async () => {
    const res = await request(appAs(null)).get('/api/animation-studio/tutors');
    expect(res.status).toBe(403);
  });

  test('legacy single-role admin passes', async () => {
    const res = await request(appAs({ role: 'admin' })).get('/api/animation-studio/tutors');
    expect(res.status).toBe(200);
  });
});

describe('GET /tutors', () => {
  test('lists personas with id, name, and voiceId', async () => {
    const res = await request(appAs(teacher)).get('/api/animation-studio/tutors');
    expect(res.status).toBe(200);
    const ids = res.body.tutors.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['bob', 'maya', 'ms-maria', 'mr-nappier']));
    for (const t of res.body.tutors) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.voiceId).toBe('string');
    }
  });
});

describe('POST /script', () => {
  test('requires a topic', async () => {
    const res = await request(appAs(teacher))
      .post('/api/animation-studio/script').send({});
    expect(res.status).toBe(400);
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  test('returns sanitized segments and clamps inputs', async () => {
    callLLMStructured.mockResolvedValue({
      title: 'Adding Fractions',
      segments: [
        { text: '  Hey everyone!  ', gesture: 'wave' },
        { text: 'Bad gesture becomes none', gesture: 'backflip' },
        { text: '', gesture: 'nod' }, // dropped: empty text
        { text: 'Wrap up!', gesture: 'celebrate' },
      ],
    });
    const res = await request(appAs(teacher))
      .post('/api/animation-studio/script')
      .send({ topic: 'fractions', targetSeconds: 9999, tutorId: 'no-such-tutor' });
    expect(res.status).toBe(200);
    expect(res.body.tutorId).toBe('mr-nappier'); // unknown tutor falls back
    expect(res.body.segments).toEqual([
      { text: 'Hey everyone!', gesture: 'wave' },
      { text: 'Bad gesture becomes none', gesture: 'none' },
      { text: 'Wrap up!', gesture: 'celebrate' },
    ]);
    // targetSeconds clamped into [30, 180] before it reaches the prompt
    const userMsg = callLLMStructured.mock.calls[0][1].find((m) => m.role === 'user').content;
    expect(userMsg).toContain('180-second');
  });

  test('LLM failure maps to 502, not a crash', async () => {
    callLLMStructured.mockRejectedValue(new Error('rate limited'));
    const res = await request(appAs(teacher))
      .post('/api/animation-studio/script').send({ topic: 'x' });
    expect(res.status).toBe(502);
  });

  test('empty usable output maps to 502', async () => {
    callLLMStructured.mockResolvedValue({ title: 't', segments: [{ text: '', gesture: 'nod' }] });
    const res = await request(appAs(teacher))
      .post('/api/animation-studio/script').send({ topic: 'x' });
    expect(res.status).toBe(502);
  });
});
