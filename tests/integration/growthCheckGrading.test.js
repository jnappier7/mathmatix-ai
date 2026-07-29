// tests/integration/growthCheckGrading.test.js
//
// Growth-check answer grading, end to end through the route that grades it.
//
// ORIGIN: routes/growthCheck.js hand-rolled its own comparison —
//
//     const correctAnswer = problem.correctAnswer;   // never a Problem field
//     ...
//     return answer === correctAnswer;               // answer === undefined
//
// `correctAnswer` does not exist on models/problem.js (the real fields are
// answer.equivalents[], answerType, options[] and correctOption), so neither
// typed branch was taken and every growth-check answer fell through to a
// comparison against `undefined`. Every student scored 0% and their theta
// dropped accordingly.
//
// That route is retired. Growth checks now run on the DB-backed screener, which
// grades through the Problem schema method — so these tests pin the surviving
// path: POST /api/screener/submit-answer must grade a correct multiple-choice
// answer as correct, for a session whose sessionType is 'growth-check'.
//
// The Problem model is deliberately NOT mocked: problem.checkAnswer() is the
// thing under test, so the test hydrates a real Problem document and only stubs
// the database lookups around it.

jest.mock('../../models/screenerSession');
jest.mock('../../models/skill', () => ({ findOne: jest.fn() }));
jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const express = require('express');
const supertest = require('supertest');

const Problem = require('../../models/problem');
const ScreenerSession = require('../../models/screenerSession');
const Skill = require('../../models/skill');

const USER_ID = '507f1f77bcf86cd799439011';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: USER_ID, username: 'growth-tester' };
    next();
  });
  app.use('/api/screener', require('../../routes/screener'));
  return app;
}

/**
 * A real Problem document (not a mock) so the schema's checkAnswer() runs.
 * 7 x 8 = 56, offered as four choices with C correct.
 */
function makeMultipleChoiceProblem() {
  return new Problem({
    problemId: 'gc-mc-1',
    skillId: 'mult.facts.7',
    prompt: 'What is 7 x 8?',
    answer: { type: 'exact', value: '56', equivalents: [] },
    answerType: 'multiple-choice',
    options: [
      { label: 'A', text: '48' },
      { label: 'B', text: '54' },
      { label: 'C', text: '56' },
      { label: 'D', text: '63' },
    ],
    correctOption: 'C',
    difficulty: 2,
  });
}

/** A mid-flight growth-check session that will not terminate on this answer. */
function makeGrowthCheckSession() {
  return {
    sessionId: 'gc-session-1',
    userId: USER_ID,
    sessionType: 'growth-check',
    phase: 'screening',
    theta: 0.5,
    standardError: 0.6,
    // Growth checks anchor the Bayesian prior on the student's saved estimate
    // (routes/screener.js /start), so both prior fields are always populated.
    priorMean: 0.5,
    priorSD: 0.5,
    startTime: new Date('2026-07-28T12:00:00Z'),
    questionCount: 1,
    minQuestions: 5,
    targetQuestions: 6,
    maxQuestions: 10,
    responses: [],
    testedSkills: [],
    testedSkillCategories: [],
    cumulativeInformation: 0,
    confidence: 0,
    converged: false,
    plateaued: false,
    frontier: {},
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
  };
}

async function submit(answer) {
  const res = await supertest(makeApp())
    .post('/api/screener/submit-answer')
    .send({
      sessionId: 'gc-session-1',
      problemId: 'gc-mc-1',
      answer,
      responseTime: 4.2,
    });
  return res;
}

describe('growth-check answer grading (POST /api/screener/submit-answer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ScreenerSession.findBySessionId = jest.fn().mockResolvedValue(makeGrowthCheckSession());
    Skill.findOne = jest.fn().mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ category: 'multiplication' }) }),
    });
    jest.spyOn(Problem, 'findOne').mockResolvedValue(makeMultipleChoiceProblem());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // THE REGRESSION. Under the retired hand-rolled comparison this was false.
  test('a correct multiple-choice answer grades as CORRECT', async () => {
    const res = await submit('C');

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  test('a wrong multiple-choice answer still grades as incorrect', async () => {
    const res = await submit('A');

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });

  // The old client sent the choice INDEX; the schema method reads letter
  // labels. Whatever the wire format, a typed value must not be graded by
  // accident — "56" is the right answer however it arrives.
  test('the correct value typed instead of its letter grades as correct', async () => {
    const res = await submit('56');

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  test('a bare option index is not silently accepted as a letter', async () => {
    // '2' is neither the answer (56) nor the label 'C'. It must be wrong,
    // rather than being coerced into "third option, therefore correct".
    const res = await submit('2');

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });

  test('grading records the response against the growth-check session', async () => {
    const session = makeGrowthCheckSession();
    ScreenerSession.findBySessionId = jest.fn().mockResolvedValue(session);

    await submit('C');

    expect(session.save).toHaveBeenCalled();
    expect(session.responses).toHaveLength(1);
    expect(session.responses[0]).toMatchObject({
      problemId: 'gc-mc-1',
      correct: true,
    });
  });
});

describe('Problem.checkAnswer is the single grading authority', () => {
  test('the retired routes/growthCheck.js and utils/growthCheck.js are gone', () => {
    // They ran a second, diverged CAT off an in-memory session Map and graded
    // against a field the Problem schema has never had. If either comes back,
    // the grading bug and the duplicate implementation come back with it.
    expect(() => require.resolve('../../routes/growthCheck')).toThrow();
    expect(() => require.resolve('../../utils/growthCheck')).toThrow();
  });

  test('no route grades against the non-existent problem.correctAnswer field', () => {
    const fs = require('fs');
    const path = require('path');
    const routesDir = path.join(__dirname, '../../routes');

    // Comment lines are excluded on purpose — screener.js documents the retired
    // bug by name, and that prose must not read as a reintroduction of it.
    const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

    const offenders = fs
      .readdirSync(routesDir)
      .filter((f) => f.endsWith('.js'))
      .filter((f) =>
        fs
          .readFileSync(path.join(routesDir, f), 'utf8')
          .split('\n')
          .some((line) => !isComment(line) && /problem\??\.correctAnswer/.test(line))
      );

    expect(offenders).toEqual([]);
  });
});
