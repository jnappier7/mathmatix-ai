// tests/integration/growthCheckClosure.test.js
//
// POST /api/screener/complete for a GROWTH CHECK session — the completion
// moment, end to end through the route.
//
// Two things were wrong before this. The student side: a growth check ended on
// a placement card with no comparison to last time and no next step, and the
// tutor (who had just said "come back here when you're done") never mentioned
// it again. The data side: /complete treated a growth check exactly like a
// Starting Point — it overwrote initialPlacement, renewed the annual
// assessmentExpiresAt, and filed the run in assessmentHistory as
// 'starting-point', so the very baseline the next check compares against was
// destroyed by the check itself.
//
// Models are mocked — no MongoDB.

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/problem', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../models/screenerSession', () => ({ findBySessionId: jest.fn() }));
jest.mock('../../utils/badgeAwarder', () => ({ awardBadgesForSkills: jest.fn().mockResolvedValue([]) }));
jest.mock('../../utils/catCache', () => ({
  getSkillSelectionData: jest.fn().mockResolvedValue([]),
  warmupCache: jest.fn().mockResolvedValue(undefined),
}));

// Skill lookups back the student-facing names in the summary.
jest.mock('../../models/skill', () => ({ findOne: jest.fn(), find: jest.fn() }));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Skill = require('../../models/skill');
const ScreenerSession = require('../../models/screenerSession');
const screenerRoutes = require('../../routes/screener');

const STUDENT_ID = '507f1f77bcf86cd799439011';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: STUDENT_ID, roles: ['student'] };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/screener', screenerRoutes);
  return app;
}

// Skill.find(...).select(...).sort(...).limit(...).lean() and the shorter
// .select(...).lean() chain both used by utils/growthSummary.
function stubSkillCatalog(docs) {
  Skill.find.mockImplementation(() => {
    const chain = {
      select: () => chain,
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve(docs),
    };
    return chain;
  });
}

// A growth-check session whose responses put the student ABOVE where they
// started: correct on ratios, a miss on fractions.
function growthSession(overrides = {}) {
  const session = {
    sessionId: 'screener_growth_1',
    sessionType: 'growth-check',
    theta: 0.75,
    standardError: 0.32,
    confidence: 0.8,
    questionCount: 6,
    phase: 'screener',
    startTime: Date.now() - 300000,
    endTime: null,
    frontier: {},
    testedSkills: ['ms-ratios', 'ms-fractions'],
    responses: [
      { skillId: 'ms-ratios', difficulty: 0.5, discrimination: 1, correct: true },
      { skillId: 'ms-ratios', difficulty: 0.7, discrimination: 1, correct: true },
      { skillId: 'ms-fractions', difficulty: 0.4, discrimination: 1, correct: false },
      { skillId: 'ms-ratios', difficulty: 0.8, discrimination: 1, correct: true },
      { skillId: 'ms-fractions', difficulty: 0.3, discrimination: 1, correct: true },
      { skillId: 'ms-ratios', difficulty: 0.9, discrimination: 1, correct: true },
    ],
    ...overrides,
  };
  session.toObject = () => ({ ...session });
  session.save = jest.fn().mockResolvedValue(session);
  return session;
}

// A student already placed at 6th Grade by a Starting Point six months ago.
function placedStudent(overrides = {}) {
  const user = {
    _id: STUDENT_ID,
    firstName: 'Jason',
    assessmentCompleted: true,
    initialPlacement: '6th Grade',
    assessmentExpiresAt: new Date('2026-12-01'),
    currentTheta: 0.2,
    skillMastery: new Map([['ms-ratios', { status: 'learning' }]]),
    assessmentHistory: [{ type: 'starting-point', gradeLevel: '6th Grade', theta: 0.2 }],
    learningProfile: {
      assessmentCompleted: true,
      initialPlacement: '6th Grade',
      currentTheta: 0.2,
      abilityEstimate: { theta: 0.2, standardError: 0.5, gradeLevel: '6th Grade' },
      growthCheckHistory: [],
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  User.findById.mockResolvedValue(user);
  return user;
}

describe('POST /api/screener/complete — growth check', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    stubSkillCatalog([
      { skillId: 'ms-ratios', displayName: 'Ratios and Proportional Relationships', studentLabel: 'ratios' },
      { skillId: 'ms-fractions', displayName: 'Adding Fractions', studentLabel: 'adding fractions' },
      { skillId: 'alg1-slope', displayName: 'Slope of a Line', studentLabel: 'slope', irtDifficulty: 0.8 },
    ]);
  });

  test('returns a student-readable summary: previous vs new level, skills, ONE next step', async () => {
    placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession());

    const res = await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    expect(res.body.sessionType).toBe('growth-check');
    const summary = res.body.growthSummary;
    expect(summary).toBeTruthy();

    // The comparison — the whole reason a growth check exists.
    expect(summary.previousLevel).toBe('6th Grade');   // θ 0.2, read BEFORE the write
    expect(summary.newLevel).toBe('8th Grade');        // θ 0.75
    expect(summary.levelChanged).toBe(true);
    expect(summary.growthStatus).toBe('significant-growth');

    // What they did, in student-facing names.
    expect(summary.skillsConfirmed.map(s => s.name)).toContain('ratios');
    expect(summary.needsReview.map(s => s.name)).toContain('adding fractions');

    // Exactly one next step, and it says something.
    expect(summary.suggestedNextStep.text).toEqual(expect.any(String));
    expect(summary.suggestedNextStep.text.length).toBeGreaterThan(0);

    expect(res.body.message).toMatch(/Growth Check complete/i);
  });

  test('leaves the ORIGINAL placement and the annual clock alone', async () => {
    const user = placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession());
    const originalExpiry = user.assessmentExpiresAt;

    await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    // initialPlacement is the record of where the student STARTED. Overwriting
    // it (the old behavior) erased the baseline the next check compares to.
    expect(user.initialPlacement).toBe('6th Grade');
    expect(user.learningProfile.initialPlacement).toBe('6th Grade');
    // A growth check must not renew the Starting Point's annual expiry, or a
    // student doing quarterly checks never gets re-placed.
    expect(user.assessmentExpiresAt).toBe(originalExpiry);
  });

  test('advances the CURRENT level and every theta read path', async () => {
    const user = placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession());

    await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    // The tutor's pathway and the assessed-level string follow the new theta.
    expect(user.mathCourse).toBe('8th Grade');
    expect(user.learningProfile.abilityEstimate.gradeLevel).toBe('8th Grade');
    // All three theta fields stay in agreement (utils/theta.js).
    expect(user.currentTheta).toBeCloseTo(0.75, 5);
    expect(user.learningProfile.currentTheta).toBeCloseTo(0.75, 5);
    expect(user.learningProfile.abilityEstimate.theta).toBeCloseTo(0.75, 5);
  });

  test('files the run as a growth check and schedules the next one', async () => {
    const user = placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession());

    await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    const latest = user.assessmentHistory[user.assessmentHistory.length - 1];
    expect(latest.type).toBe('growth-check');
    expect(latest.sessionId).toBe('screener_growth_1');

    expect(user.learningProfile.growthCheckHistory).toHaveLength(1);
    expect(user.learningProfile.growthCheckHistory[0]).toMatchObject({
      sessionId: 'screener_growth_1',
      growthStatus: 'significant-growth',
    });

    expect(user.lastGrowthCheck).toBeInstanceOf(Date);
    expect(user.nextGrowthCheckDue.getTime()).toBeGreaterThan(Date.now());
  });

  test('leaves the tutor a debrief to deliver back in chat', async () => {
    const user = placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession());

    await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    // The check ends outside the transcript, so the wrap-up is handed to
    // routes/chat.js rather than being lost with the results card.
    const pending = user.learningProfile.pendingGrowthCheckDebrief;
    expect(pending).toBeTruthy();
    expect(pending.summary.newLevel).toBe('8th Grade');
    expect(pending.summary.suggestedNextStep.text).toEqual(expect.any(String));
    expect(pending.createdAt).toBeInstanceOf(Date);
  });

  test('a DROP in level is recorded honestly and still ends on a next step', async () => {
    const user = placedStudent();
    ScreenerSession.findBySessionId.mockResolvedValue(growthSession({
      theta: -0.4,
      responses: [
        { skillId: 'ms-ratios', difficulty: 0.2, discrimination: 1, correct: false },
        { skillId: 'ms-fractions', difficulty: 0.1, discrimination: 1, correct: false },
        { skillId: 'ms-ratios', difficulty: -0.5, discrimination: 1, correct: true },
        { skillId: 'ms-fractions', difficulty: -0.6, discrimination: 1, correct: false },
        { skillId: 'ms-ratios', difficulty: -0.4, discrimination: 1, correct: true },
      ],
    }));

    const res = await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    const summary = res.body.growthSummary;
    expect(summary.growthStatus).toBe('review-needed');
    expect(summary.previousLevel).toBe('6th Grade');
    expect(summary.newLevel).toBe('5th Grade');  // θ -0.4 (the 4th-grade band is θ ≤ -0.5)
    expect(summary.suggestedNextStep.text.length).toBeGreaterThan(0);
    // Even on a drop, the baseline survives.
    expect(user.initialPlacement).toBe('6th Grade');
  });
});

describe('POST /api/screener/complete — starting point is unchanged', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    stubSkillCatalog([]);
  });

  test('still writes the placement, the annual expiry, and no growth summary', async () => {
    const user = placedStudent({ initialPlacement: null, assessmentExpiresAt: null });
    const session = growthSession({ sessionType: 'starting-point', theta: 0.75 });
    ScreenerSession.findBySessionId.mockResolvedValue(session);

    const res = await supertest(app)
      .post('/api/screener/complete')
      .send({ sessionId: 'screener_growth_1' })
      .expect(200);

    expect(res.body.growthSummary).toBeUndefined();
    expect(res.body.sessionType).toBe('starting-point');
    expect(user.initialPlacement).toBe('8th Grade');
    expect(user.assessmentExpiresAt).toBeInstanceOf(Date);
    expect(user.assessmentHistory[user.assessmentHistory.length - 1].type).toBe('starting-point');
    expect(user.learningProfile.pendingGrowthCheckDebrief).toBeUndefined();
  });
});
