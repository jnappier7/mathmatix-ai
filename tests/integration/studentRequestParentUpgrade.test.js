// tests/integration/studentRequestParentUpgrade.test.js
// Integration test for POST /api/student/request-parent-upgrade — the "ask a
// parent to unlock Mathmatix+" path that gets the trial offer to the card holder.
// Models + email are mocked; no MongoDB.

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
}));

jest.mock('../../models/user', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../../models/conversation', () => ({}));
jest.mock('../../models/gradingResult', () => ({}));
jest.mock('../../models/studentUpload', () => ({}));
jest.mock('../../models/notification', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../../utils/emailService', () => ({
  sendParentUpgradeRequest: jest.fn().mockResolvedValue({ success: true }),
}));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Notification = require('../../models/notification');
const emailService = require('../../utils/emailService');
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

// findById resolves to a mutable student doc with a save() spy.
function stubStudent(overrides = {}) {
  const student = {
    _id: STUDENT_ID, firstName: 'Kid', parentIds: [],
    lastParentUpgradeRequestAt: null,
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  };
  User.findById.mockResolvedValue(student);
  return student;
}

function stubParents(parents) {
  User.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(parents) }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  Notification.create.mockResolvedValue({});
  emailService.sendParentUpgradeRequest.mockResolvedValue({ success: true });
});

describe('POST /api/student/request-parent-upgrade', () => {
  test('notifies a linked (non-subscribed) parent by email + notification', async () => {
    const student = stubStudent({ parentIds: ['p1'] });
    stubParents([{ _id: 'p1', email: 'mom@x.com', firstName: 'Mom', subscriptionTier: 'free' }]);

    const r = await supertest(buildApp()).post('/api/student/request-parent-upgrade').send({});

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, linked: true, notified: 1 });
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(emailService.sendParentUpgradeRequest).toHaveBeenCalledTimes(1);
    expect(emailService.sendParentUpgradeRequest.mock.calls[0][1]).toBe('Kid'); // childName
    expect(student.lastParentUpgradeRequestAt).toBeInstanceOf(Date);
    expect(student.save).toHaveBeenCalled();
  });

  test('returns linked:false when no parent is linked (client then invites)', async () => {
    stubStudent({ parentIds: [] });

    const r = await supertest(buildApp()).post('/api/student/request-parent-upgrade').send({});

    expect(r.status).toBe(200);
    expect(r.body.linked).toBe(false);
    expect(emailService.sendParentUpgradeRequest).not.toHaveBeenCalled();
  });

  test('throttles repeat requests within 12h', async () => {
    stubStudent({ parentIds: ['p1'], lastParentUpgradeRequestAt: new Date() });

    const r = await supertest(buildApp()).post('/api/student/request-parent-upgrade').send({});

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ linked: true, alreadySent: true });
    expect(emailService.sendParentUpgradeRequest).not.toHaveBeenCalled();
  });

  test('reports already-covered when every linked parent is unlimited', async () => {
    stubStudent({ parentIds: ['p1'] });
    stubParents([{ _id: 'p1', email: 'mom@x.com', firstName: 'Mom', subscriptionTier: 'unlimited' }]);

    const r = await supertest(buildApp()).post('/api/student/request-parent-upgrade').send({});

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ linked: true, alreadyCovered: true });
    expect(emailService.sendParentUpgradeRequest).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });
});
