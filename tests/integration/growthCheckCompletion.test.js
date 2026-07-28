// tests/integration/growthCheckCompletion.test.js
//
// POST /api/screener/complete, for a session whose sessionType is
// 'growth-check'.
//
// RIPPLE: routes/growthCheck.js was the ONLY writer of
// learningProfile.growthCheckHistory and learningProfile.lastGrowthCheck.
// Eight places read them — routes/parent.js (x3), routes/teacher.js (x3),
// routes/admin.js (x2) — plus scripts/weeklyDigest.js. Retiring that route
// without porting the write would have left every growth panel and the weekly
// digest permanently empty, silently. These tests pin the port.
//
// The second guarantee here is the inverse: a growth check must NOT be
// bookkept as a placement. It re-estimates ability; it does not re-place the
// student, does not reset the annual assessment expiry, and does not overwrite
// initialPlacement (which "since your placement" comparisons measure from).

jest.mock('../../models/screenerSession');
jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/skill', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));
// Badge awarding hits the skill catalog and is not what these tests are about.
jest.mock('../../utils/badgeAwarder', () => ({
  awardBadgesForSkills: jest.fn().mockResolvedValue([]),
}));

const express = require('express');
const supertest = require('supertest');

const User = require('../../models/user');
const ScreenerSession = require('../../models/screenerSession');

const USER_ID = '507f1f77bcf86cd799439011';
const PLACED_ON = new Date('2026-01-15T10:00:00Z');
const EXPIRES_ON = new Date('2027-01-15T10:00:00Z');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: USER_ID };
    next();
  });
  app.use('/api/screener', require('../../routes/screener'));
  return app;
}

/** A student already placed at 6th grade back in January, theta 0.40. */
function makePlacedUser() {
  return {
    _id: USER_ID,
    assessmentCompleted: true,
    assessmentDate: PLACED_ON,
    assessmentExpiresAt: EXPIRES_ON,
    initialPlacement: '6',
    mathCourse: '6',
    currentTheta: 0.4,
    nextGrowthCheckDue: new Date('2026-04-15T10:00:00Z'),
    assessmentHistory: [{ type: 'starting-point', date: PLACED_ON, theta: 0.4 }],
    learningProfile: {
      assessmentCompleted: true,
      assessmentDate: PLACED_ON,
      initialPlacement: '6',
      currentTheta: 0.4,
      standardError: 0.5,
      abilityEstimate: { theta: 0.4, standardError: 0.5, gradeLevel: '6' },
      skillMastery: new Map(),
      growthCheckHistory: [],
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * A finished growth-check session.
 *
 * By the time /complete runs, submit-answer has already walked session.theta to
 * its final value — /complete reports it, it does not re-estimate. So the
 * session arrives at 0.85 while the USER doc still holds the pre-run 0.40. That
 * gap is exactly what thetaChange has to measure.
 */
function makeFinishedSession(sessionType = 'growth-check') {
  const responses = Array.from({ length: 6 }, (_, i) => ({
    problemId: `p-${i}`,
    skillId: 'ratios.unit-rate',
    skillCategory: 'ratios',
    difficulty: 1.0,
    discrimination: 1.0,
    correct: true,
    skipped: false,
    responseTime: 5,
  }));

  return {
    sessionId: 'gc-complete-1',
    userId: USER_ID,
    sessionType,
    phase: 'screening',
    theta: 0.85,
    standardError: 0.45,
    priorMean: 0.4,
    priorSD: 0.5,
    questionCount: responses.length,
    minQuestions: 5,
    targetQuestions: 6,
    maxQuestions: 10,
    responses,
    testedSkills: ['ratios.unit-rate'],
    testedSkillCategories: ['ratios'],
    startTime: new Date('2026-07-28T12:00:00Z'),
    endTime: null,
    converged: true,
    plateaued: false,
    frontier: {},
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
  };
}

async function complete() {
  return supertest(makeApp())
    .post('/api/screener/complete')
    .send({ sessionId: 'gc-complete-1' });
}

describe('completing a growth check', () => {
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    user = makePlacedUser();
    User.findById = jest.fn().mockResolvedValue(user);
    ScreenerSession.findBySessionId = jest.fn().mockResolvedValue(makeFinishedSession());
  });

  test('appends the growthCheckHistory entry the growth panels read', async () => {
    const res = await complete();
    expect(res.status).toBe(200);

    const history = user.learningProfile.growthCheckHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      sessionId: 'gc-complete-1',
      previousTheta: 0.4,
      questionsAnswered: 6,
    });
    expect(typeof history[0].newTheta).toBe('number');
    expect(typeof history[0].thetaChange).toBe('number');
  });

  test('thetaChange is measured against the PRE-run theta, not the value just written', async () => {
    await complete();

    const entry = user.learningProfile.growthCheckHistory[0];
    // previousTheta comes from the USER doc (0.40), newTheta from the finished
    // SESSION (0.85). If previousTheta were captured after the completion
    // writes, both would read 0.85 and thetaChange would be exactly 0.
    expect(entry.previousTheta).toBe(0.4);
    expect(entry.newTheta).toBe(0.85);
    expect(entry.thetaChange).toBeCloseTo(0.45, 2);
    expect(entry.growthStatus).toBe('significant-growth');
  });

  test('records a growthStatus the user schema enum accepts', async () => {
    await complete();

    const { GROWTH_STATUSES } = require('../../utils/growthStatus');
    expect(GROWTH_STATUSES).toContain(user.learningProfile.growthCheckHistory[0].growthStatus);
  });

  test('stamps lastGrowthCheck and re-arms nextGrowthCheckDue', async () => {
    const before = user.nextGrowthCheckDue;
    await complete();

    expect(user.learningProfile.lastGrowthCheck).toBeInstanceOf(Date);
    expect(user.nextGrowthCheckDue.getTime()).toBeGreaterThan(before.getTime());
  });

  test('files the run in assessmentHistory as a growth-check, not a starting-point', async () => {
    await complete();

    const latest = user.assessmentHistory[user.assessmentHistory.length - 1];
    expect(latest.type).toBe('growth-check');
    expect(user.assessmentHistory).toHaveLength(2);
  });

  test('does NOT rewrite the placement or renew the annual expiry', async () => {
    await complete();

    // The January placement is the baseline growth is measured from.
    expect(user.initialPlacement).toBe('6');
    expect(user.learningProfile.initialPlacement).toBe('6');
    expect(user.assessmentDate).toBe(PLACED_ON);
    expect(user.learningProfile.assessmentDate).toBe(PLACED_ON);
    // A student who keeps taking growth checks must still get re-placed yearly.
    expect(user.assessmentExpiresAt).toBe(EXPIRES_ON);
  });

  test('still re-syncs the live ability estimate and tutor pathway', async () => {
    await complete();

    // Growth checks DO move what the tutor teaches from — just not the placement.
    expect(user.currentTheta).toBe(0.85);
    expect(user.learningProfile.currentTheta).toBe(user.currentTheta);
    expect(user.learningProfile.abilityEstimate.theta).toBe(user.currentTheta);
    expect(user.mathCourse).toBe(user.learningProfile.abilityEstimate.gradeLevel);
  });

  test('caps stored history at 20 entries', async () => {
    user.learningProfile.growthCheckHistory = Array.from({ length: 20 }, (_, i) => ({
      sessionId: `old-${i}`,
      date: new Date('2026-02-01T00:00:00Z'),
      previousTheta: 0,
      newTheta: 0,
      thetaChange: 0,
      growthStatus: 'stable',
      questionsAnswered: 5,
      accuracy: 50,
    }));

    await complete();

    const history = user.learningProfile.growthCheckHistory;
    expect(history).toHaveLength(20);
    // Oldest dropped, newest kept.
    expect(history[history.length - 1].sessionId).toBe('gc-complete-1');
    expect(history.some((h) => h.sessionId === 'old-0')).toBe(false);
  });
});

describe('completing a starting-point run is unaffected', () => {
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    user = makePlacedUser();
    User.findById = jest.fn().mockResolvedValue(user);
    ScreenerSession.findBySessionId = jest
      .fn()
      .mockResolvedValue(makeFinishedSession('starting-point'));
  });

  test('writes no growth-check history and does re-place the student', async () => {
    const res = await complete();
    expect(res.status).toBe(200);

    expect(user.learningProfile.growthCheckHistory).toHaveLength(0);
    expect(user.learningProfile.lastGrowthCheck).toBeUndefined();

    // Placement fields move on a starting point — that's the whole point of one.
    expect(user.assessmentDate).not.toBe(PLACED_ON);
    expect(user.assessmentExpiresAt).not.toBe(EXPIRES_ON);
    expect(user.assessmentHistory[user.assessmentHistory.length - 1].type)
      .toBe('starting-point');
  });
});
