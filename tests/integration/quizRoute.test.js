/**
 * The anonymous pop-quiz endpoints (/api/quiz — the Facebook ad funnel).
 *
 * What matters here: the GET surface must never leak the correct answer
 * (the reveal is the payoff for voting), a vote must grade correctly and
 * count exactly once per session no matter how many times it's re-sent,
 * and the tally must always carry every option so the poll bars render.
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const QuizPoll = require('../../models/quizPoll');

jest.mock('../../utils/conversionEvents', () => ({ recordConversionEvent: jest.fn() }));
const { recordConversionEvent } = require('../../utils/conversionEvents');

const quizRoutes = require('../../routes/quiz');

let mem;
let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use('/api/quiz', quizRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

beforeEach(async () => {
  await QuizPoll.deleteMany({});
  recordConversionEvent.mockClear();
});

describe('GET /api/quiz', () => {
  it('lists the quizzes in ad order without leaking answers', async () => {
    const res = await supertest(app).get('/api/quiz').expect(200);
    expect(res.body.quizzes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.quizzes[0].id).toBe('oops-24');
    for (const q of res.body.quizzes) {
      expect(q.correct).toBeUndefined();
      expect(q.trap).toBeUndefined();
      expect(q.teach).toBeUndefined();
      expect(Array.isArray(q.options)).toBe(true);
    }
  });
});

describe('POST /api/quiz/:id/vote', () => {
  it('grades the correct answer, returns teach content and a zero-filled tally', async () => {
    const res = await supertest(app)
      .post('/api/quiz/oops-24/vote')
      .send({ answer: '14' })
      .expect(200);

    expect(res.body.correct).toBe(true);
    expect(res.body.correctAnswer).toBe('14');
    expect(res.body.alreadyVoted).toBe(false);
    expect(res.body.teach.steps.length).toBeGreaterThan(0);
    // every option present, including the implicit 'other'
    expect(res.body.tally.counts).toEqual({ '14': 1, '2': 0, other: 0 });
    expect(res.body.tally.total).toBe(1);
    expect(recordConversionEvent).toHaveBeenCalledWith('quiz_vote', expect.objectContaining({
      context: expect.objectContaining({ quizId: 'oops-24', answer: '14', correct: true }),
    }));
  });

  it('grades the trap answer as wrong and still teaches', async () => {
    const res = await supertest(app)
      .post('/api/quiz/oops-24/vote')
      .send({ answer: '2' })
      .expect(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.trapAnswer).toBe('2');
    expect(res.body.teach.trapNote).toBeTruthy();
  });

  it('accepts an "other" vote', async () => {
    const res = await supertest(app)
      .post('/api/quiz/oops-24/vote')
      .send({ answer: 'other' })
      .expect(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.tally.counts.other).toBe(1);
  });

  it('counts one vote per session — a repeat re-grades the ORIGINAL answer without incrementing', async () => {
    const agent = supertest.agent(app); // keeps the session cookie
    await agent.post('/api/quiz/oops-24/vote').send({ answer: '2' }).expect(200);
    const second = await agent.post('/api/quiz/oops-24/vote').send({ answer: '14' }).expect(200);

    expect(second.body.alreadyVoted).toBe(true);
    expect(second.body.yourAnswer).toBe('2'); // the first answer stands
    expect(second.body.correct).toBe(false);
    expect(second.body.tally.total).toBe(1);  // not stuffed
    expect(recordConversionEvent).toHaveBeenCalledTimes(1);
  });

  it('separate sessions each count', async () => {
    await supertest(app).post('/api/quiz/oops-24/vote').send({ answer: '14' }).expect(200);
    const res = await supertest(app).post('/api/quiz/oops-24/vote').send({ answer: '2' }).expect(200);
    expect(res.body.tally.total).toBe(2);
    expect(res.body.tally.counts).toEqual({ '14': 1, '2': 1, other: 0 });
  });

  it('rejects unknown quizzes and off-menu answers', async () => {
    await supertest(app).post('/api/quiz/nope/vote').send({ answer: '14' }).expect(404);
    await supertest(app).post('/api/quiz/oops-24/vote').send({ answer: '16' }).expect(400);
    await supertest(app).post('/api/quiz/oops-24/vote').send({}).expect(400);
  });
});

describe('GET /api/quiz/:id/stats', () => {
  it('returns the live tally with zeros before any votes', async () => {
    const res = await supertest(app).get('/api/quiz/oops-6/stats').expect(200);
    expect(res.body.tally).toEqual({ counts: { '4': 0, '1': 0, other: 0 }, total: 0 });
  });

  it('404s on unknown quiz', async () => {
    await supertest(app).get('/api/quiz/nope/stats').expect(404);
  });
});
