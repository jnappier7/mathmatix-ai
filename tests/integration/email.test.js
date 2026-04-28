// tests/integration/email.test.js
// Integration test for routes/email.js (test, weekly-report, status)

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/demoClone', () => ({
  cleanupDemoClone: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../utils/emailService', () => ({
  sendTestEmail: jest.fn(),
  sendParentWeeklyReport: jest.fn(),
  getEmailConfig: jest.fn().mockReturnValue({
    from: 'noreply@mathmatix.ai',
    fromName: 'Mathmatix',
    replyTo: 'support@mathmatix.ai'
  })
}));

jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/conversation', () => ({ aggregate: jest.fn() }));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const { sendTestEmail, sendParentWeeklyReport } = require('../../utils/emailService');
const router = require('../../routes/email');

function makeApp(currentUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => Boolean(currentUser);
    req.user = currentUser || null;
    next();
  });
  app.use('/api/email', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/email/test', () => {
  test('rejects unauthenticated', async () => {
    const res = await supertest(makeApp(null)).post('/api/email/test').send({});
    expect(res.status).toBe(401);
  });

  test('uses current user email when none provided', async () => {
    sendTestEmail.mockResolvedValue({ messageId: '<id-1>' });
    const app = makeApp({ _id: 'u1', email: 'sam@x.io' });
    const res = await supertest(app).post('/api/email/test').send({});
    expect(res.status).toBe(200);
    expect(sendTestEmail).toHaveBeenCalledWith('sam@x.io');
  });

  test('uses provided recipient email when set', async () => {
    sendTestEmail.mockResolvedValue({ messageId: 'id' });
    const app = makeApp({ _id: 'u1', email: 'sam@x.io' });
    await supertest(app).post('/api/email/test').send({ recipientEmail: 'other@x.io' });
    expect(sendTestEmail).toHaveBeenCalledWith('other@x.io');
  });

  test('returns 400 when neither current user email nor recipient is provided', async () => {
    const app = makeApp({ _id: 'u1' }); // no email
    const res = await supertest(app).post('/api/email/test').send({});
    expect(res.status).toBe(400);
  });

  test('returns 500 when SMTP throws', async () => {
    sendTestEmail.mockRejectedValue(new Error('smtp down'));
    const app = makeApp({ _id: 'u1', email: 'sam@x.io' });
    const res = await supertest(app).post('/api/email/test').send({});
    expect(res.status).toBe(500);
  });
});

describe('POST /api/email/weekly-report', () => {
  test('forbids non-parents', async () => {
    const app = makeApp({ _id: 't1', role: 'teacher' });
    const res = await supertest(app).post('/api/email/weekly-report').send({ studentId: 's1' });
    expect(res.status).toBe(403);
  });

  test('forbids parents accessing children they don\'t own', async () => {
    const app = makeApp({ _id: 'p1', role: 'parent', children: ['kid-other'] });
    const res = await supertest(app).post('/api/email/weekly-report').send({ studentId: 'kid-mine' });
    expect(res.status).toBe(403);
  });

  test('returns 404 when child does not exist', async () => {
    User.findById.mockResolvedValue(null);
    const app = makeApp({ _id: 'p1', role: 'parent', children: ['kid-1'] });
    const res = await supertest(app).post('/api/email/weekly-report').send({ studentId: 'kid-1' });
    expect(res.status).toBe(404);
  });

  test('aggregates stats and sends report on success', async () => {
    User.findById.mockResolvedValue({
      _id: 'kid-1',
      firstName: 'Sam',
      lastName: 'Lee',
      level: 5,
      xp: 200,
      totalActiveTutoringMinutes: 90,
      skillMastery: new Map([
        ['add', { status: 'mastered', masteredDate: new Date() }],
        ['sub', { status: 'practicing' }],
        ['mul', { status: 'needs-review' }]
      ]),
      badges: [],
      dailyQuests: { currentStreak: 3 }
    });
    Conversation.aggregate.mockResolvedValue([{ totalProblems: 50, totalCorrect: 40 }]);
    sendParentWeeklyReport.mockResolvedValue({ success: true, messageId: '<rep-1>' });

    const app = makeApp({ _id: 'p1', role: 'parent', email: 'parent@x.io', children: ['kid-1'] });
    const res = await supertest(app).post('/api/email/weekly-report').send({ studentId: 'kid-1' });

    expect(res.status).toBe(200);
    expect(sendParentWeeklyReport).toHaveBeenCalled();
    const studentData = sendParentWeeklyReport.mock.calls[0][1];
    expect(studentData.studentName).toBe('Sam Lee');
    expect(studentData.accuracy).toBe(80);
    expect(studentData.strugglingSkills).toContain('mul');
    expect(studentData.currentStreak).toBe(3);
  });

  test('returns 500 when sender fails', async () => {
    User.findById.mockResolvedValue({
      _id: 'kid-1', firstName: 'A', lastName: 'B', level: 1, xp: 0,
      skillMastery: new Map(), badges: [], dailyQuests: {}
    });
    Conversation.aggregate.mockResolvedValue([]);
    sendParentWeeklyReport.mockResolvedValue({ success: false, error: 'failed' });

    const app = makeApp({ _id: 'p1', role: 'parent', children: ['kid-1'], email: 'p@x.io' });
    const res = await supertest(app).post('/api/email/weekly-report').send({ studentId: 'kid-1' });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/email/status', () => {
  test('reports configured=false when SMTP env not set', async () => {
    delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    const app = makeApp({ _id: 'u1' });
    const res = await supertest(app).get('/api/email/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  test('reports configured=true and includes sender info when configured', async () => {
    process.env.SMTP_HOST = 'smtp.x.io';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    const app = makeApp({ _id: 'u1' });
    const res = await supertest(app).get('/api/email/status');
    expect(res.body.configured).toBe(true);
    expect(res.body.sender.from).toBe('noreply@mathmatix.ai');
    delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  });
});
