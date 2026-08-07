// tests/integration/tutorQualityReport.test.js
//
// The transcript-mining feedback loop, end to end minus Mongo:
//   1. sweep() over mocked Conversation/User collections — the query window,
//      stamp-derived judging, PII anonymization of everything stored, and the
//      scenario stubs.
//   2. The admin surface — GET serves the latest report and writes a FERPA
//      access log entry per student surfaced; POST kicks off a run with
//      trigger 'admin'.
//
// Models are mocked — no MongoDB.

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  ensureNotAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
  isParent: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
  isAuthorizedForLeaderboard: (req, _res, next) => next(),
  handleLogout: (req, _res, next) => next(),
  aiEndpointLimiter: (req, _res, next) => next(),
}));

jest.mock('../../models/conversation', () => ({ find: jest.fn() }));
jest.mock('../../models/user', () => ({ find: jest.fn(), findById: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), updateMany: jest.fn() }));
jest.mock('../../models/tutorQualityReport', () => ({ find: jest.fn(), findById: jest.fn(), findOne: jest.fn(), create: jest.fn() }));
jest.mock('../../models/educationRecordAccessLog', () => ({ create: jest.fn().mockResolvedValue({}) }));

const Conversation = require('../../models/conversation');
const User = require('../../models/user');
const TutorQualityReport = require('../../models/tutorQualityReport');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');
const { sweep, runSweepAndSave } = require('../../utils/transcriptMiner');

const STUDENT_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439099';

// Query-chain stubs: Conversation.find(...).select().sort().limit().lean()
// and User.find(...).select().lean().
function stubFindChain(model, docs) {
  model.find.mockImplementation(() => {
    const chain = {
      select: () => chain,
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve(docs),
    };
    return chain;
  });
}

const NOW = new Date('2026-08-07T07:00:00Z');
const RECENT = new Date('2026-08-07T01:00:00Z');

function fixtureConversation() {
  return {
    _id: 'convo1',
    userId: STUDENT_ID,
    topic: 'Fractions',
    conversationType: 'general',
    lastActivity: RECENT,
    messages: [
      {
        role: 'assistant',
        content: 'How would you add 1/4 + 1/6, Jordan?',
        timestamp: RECENT,
        problemInfo: { type: 'fraction_addition', correctAnswer: '5/12' },
      },
      { role: 'user', content: 'oh wait. 10/24, right?', timestamp: RECENT },
      {
        role: 'assistant',
        content: 'Not quite, Jordan — let\'s re-add those numbers.',
        timestamp: RECENT,
        problemResult: 'correct',
      },
    ],
  };
}

describe('sweep() — mocked collections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubFindChain(Conversation, [fixtureConversation()]);
    stubFindChain(User, [{ _id: STUDENT_ID, firstName: 'Jordan', lastName: 'Rivera' }]);
  });

  test('finds the rejected-correct-answer moment and anonymizes everything stored', async () => {
    const report = await sweep({ now: NOW, llmEnabled: false });

    expect(report.stats.conversationsScanned).toBe(1);
    expect(report.stats.turnsJudged).toBe(2);

    const rejected = report.findings.find(f => f.judge === 'rejectedCorrectAnswer');
    expect(rejected).toBeDefined();
    expect(rejected.conversationId).toBe('convo1');
    expect(rejected.userId).toBe(STUDENT_ID);
    expect(rejected.turnIndex).toBe(2);
    expect(rejected.ctx.studentWasCorrect).toBe(true);

    // Ranked work-list: the firing judge is at (or tied at) the top.
    expect(report.stats.rankedJudges[0].violations).toBeGreaterThan(0);
    const bucket = report.stats.rankedJudges.find(b => b.judge === 'rejectedCorrectAnswer');
    expect(bucket.eligibleTurns).toBe(1); // only the correct-stamped turn
    expect(bucket.violations).toBe(1);

    // A copy-pasteable eval-scenario stub exists for the hit.
    expect(report.scenarioStubs.length).toBeGreaterThan(0);
    expect(report.scenarioStubs[0].turns.slice(-1)[0].judge).toEqual(['rejectedCorrectAnswer']);

    // FERPA: no student name anywhere in the persisted body — findings,
    // stubs, evidence, everything.
    expect(JSON.stringify(report)).not.toMatch(/Jordan|Rivera/);
    // The internal working `turn` (raw text) never persists.
    expect(rejected.turn).toBeUndefined();
  });

  test('queries the lastActivity window and skips the LLM tier when disabled', async () => {
    await sweep({ now: NOW, windowHours: 24, llmEnabled: false });
    const query = Conversation.find.mock.calls[0][0];
    expect(query.lastActivity.$gte).toEqual(new Date(NOW.getTime() - 24 * 3600 * 1000));
  });

  test('runSweepAndSave persists with the trigger stamped', async () => {
    TutorQualityReport.create.mockImplementation(async (doc) => doc);
    const saved = await runSweepAndSave({ now: NOW, llmEnabled: false, trigger: 'admin' });
    expect(TutorQualityReport.create).toHaveBeenCalledTimes(1);
    expect(saved.trigger).toBe('admin');
    expect(saved.stats.totalViolations).toBeGreaterThan(0);
  });
});

describe('admin endpoints', () => {
  const express = require('express');
  const supertest = require('supertest');

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { _id: ADMIN_ID, roles: ['admin'], role: 'admin' };
      req.isAuthenticated = () => true;
      next();
    });
    app.use('/api/admin', require('../../routes/admin'));
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    EducationRecordAccessLog.create.mockResolvedValue({});
  });

  test('GET serves the latest report and FERPA-logs each surfaced student', async () => {
    const stored = {
      _id: 'run1',
      runAt: NOW,
      stats: { totalViolations: 2 },
      findings: [
        { userId: STUDENT_ID, judge: 'rejectedCorrectAnswer', conversationId: 'convo1' },
        { userId: STUDENT_ID, judge: 'lostContext', conversationId: 'convo1' },
        { userId: '507f1f77bcf86cd799439022', judge: 'revealedAnswer', conversationId: 'convo2' },
      ],
    };
    TutorQualityReport.findOne.mockImplementation(() => {
      const chain = { sort: () => chain, lean: () => Promise.resolve(stored) };
      return chain;
    });

    const res = await supertest(buildApp()).get('/api/admin/tutor-quality-report');
    expect(res.status).toBe(200);
    expect(res.body._id).toBe('run1');

    // One access-log entry per DISTINCT student in the served findings.
    await new Promise(r => setImmediate(r));
    expect(EducationRecordAccessLog.create).toHaveBeenCalledTimes(2);
    const logged = EducationRecordAccessLog.create.mock.calls.map(c => c[0]);
    expect(logged.map(l => l.studentId).sort()).toEqual([STUDENT_ID, '507f1f77bcf86cd799439022'].sort());
    expect(logged[0].recordType).toBe('conversations');
    expect(logged[0].legitimateInterest).toBe('administrative_function');
  });

  test('GET 404s helpfully when no run exists yet', async () => {
    TutorQualityReport.findOne.mockImplementation(() => {
      const chain = { sort: () => chain, lean: () => Promise.resolve(null) };
      return chain;
    });
    const res = await supertest(buildApp()).get('/api/admin/tutor-quality-report');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/cron:mine-transcripts/);
  });

  test('POST /run answers 202 and runs the sweep with trigger admin', async () => {
    stubFindChain(Conversation, []);
    stubFindChain(User, []);
    TutorQualityReport.create.mockImplementation(async (doc) => ({ ...doc, _id: 'run2' }));

    const res = await supertest(buildApp())
      .post('/api/admin/tutor-quality-report/run')
      .send({ windowHours: 48, llmEnabled: false });
    expect(res.status).toBe(202);
    expect(res.body.options.windowHours).toBe(48);

    // The run is async — let it drain, then confirm it persisted.
    await new Promise(r => setTimeout(r, 50));
    expect(TutorQualityReport.create).toHaveBeenCalledTimes(1);
    expect(TutorQualityReport.create.mock.calls[0][0].trigger).toBe('admin');
  });
});
