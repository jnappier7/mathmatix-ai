// tests/integration/studentProgressSummary.test.js
// Integration test for GET /api/student/progress/summary using supertest.
//
// Verifies the weekly accuracy stat end-to-end through the route: that the chat
// pipeline counters and the "Show Your Work" grader are combined, that the
// low-sample threshold suppresses a misleading percentage, and that the grader
// aggregation only counts first attempts (no double-counting resubmissions).
// Models are mocked — no MongoDB.

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
}));

jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/conversation', () => ({ aggregate: jest.fn() }));
jest.mock('../../models/gradingResult', () => ({ aggregate: jest.fn() }));
jest.mock('../../models/studentUpload', () => ({}));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const GradingResult = require('../../models/gradingResult');
const studentRoutes = require('../../routes/student');

const STUDENT_ID = '507f1f77bcf86cd799439011';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: STUDENT_ID, roles: ['student'] };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/student', studentRoutes.router);
  return app;
}

// A minimal assessment-completed student with no skills/xp so the handler runs
// straight through to the weekly-stats block.
function stubStudent(overrides = {}) {
  User.findById.mockReturnValue({
    lean: () => Promise.resolve({
      _id: STUDENT_ID,
      learningProfile: { assessmentCompleted: true },
      skillMastery: {},
      dailyQuests: { currentStreak: 0, quests: [] },
      xpHistory: [],
      ...overrides,
    }),
  });
}

function setSources({ conv = [], grade = [] }) {
  Conversation.aggregate.mockResolvedValue(conv);
  GradingResult.aggregate.mockResolvedValue(grade);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubStudent();
});

describe('GET /api/student/progress/summary — weekly accuracy', () => {
  test('combines chat counters and Show Your Work grades into one percentage', async () => {
    setSources({
      conv: [{ totalProblems: 3, totalCorrect: 2 }],
      grade: [{ totalProblems: 4, totalCorrect: 3 }],
    });

    const res = await supertest(buildApp()).get('/api/student/progress/summary');

    expect(res.status).toBe(200);
    expect(res.body.weeklyStats.problemsSolved).toBe(7);
    expect(res.body.weeklyStats.problemsCorrect).toBe(5);
    expect(res.body.weeklyStats.accuracy).toBe(71); // round(5/7 * 100)
  });

  test('suppresses the percentage on a tiny sample but keeps the fraction', async () => {
    setSources({ conv: [{ totalProblems: 2, totalCorrect: 1 }], grade: [] });

    const res = await supertest(buildApp()).get('/api/student/progress/summary');

    expect(res.status).toBe(200);
    expect(res.body.weeklyStats.problemsSolved).toBe(2);
    expect(res.body.weeklyStats.problemsCorrect).toBe(1);
    expect(res.body.weeklyStats.accuracy).toBeNull();
  });

  test('Show Your Work alone can supply enough sample for a percentage', async () => {
    setSources({ conv: [], grade: [{ totalProblems: 6, totalCorrect: 6 }] });

    const res = await supertest(buildApp()).get('/api/student/progress/summary');

    expect(res.status).toBe(200);
    expect(res.body.weeklyStats.problemsSolved).toBe(6);
    expect(res.body.weeklyStats.accuracy).toBe(100);
  });

  test('only counts first-attempt worksheets (guards against resubmission double-count)', async () => {
    setSources({ conv: [], grade: [{ totalProblems: 5, totalCorrect: 5 }] });

    await supertest(buildApp()).get('/api/student/progress/summary');

    const pipeline = GradingResult.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toHaveProperty('previousAttemptId', null);
  });

  test('chat aggregation prefers the first-try counter over per-attempt counters', async () => {
    setSources({ conv: [{ totalProblems: 3, totalCorrect: 3 }], grade: [] });

    await supertest(buildApp()).get('/api/student/progress/summary');

    // The $group must read firstTryAttempted/firstTryCorrect (with a legacy
    // fallback), not the raw per-attempt counters.
    const pipeline = Conversation.aggregate.mock.calls[0][0];
    const groupJson = JSON.stringify(pipeline.find(s => s.$group).$group);
    expect(groupJson).toContain('firstTryAttempted');
    expect(groupJson).toContain('firstTryCorrect');
  });
});
