// tests/integration/nudges.test.js
// Integration tests for the /api/nudges endpoints — GET (compute current
// nudges and stamp promptedAt) and POST /:type/dismiss (stamp dismissedAt).
//
// User model is mocked so the test runs without a live Mongo instance.
// The compute function itself has its own unit tests; here we verify the
// route plumbing — auth gating, dismissal recording, and the response shape.

jest.mock('../../models/user', () => {
  const Module = jest.fn();
  Module.findById = jest.fn();
  return Module;
});

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const router = require('../../routes/nudges');

function makeApp(currentUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser || null;
    next();
  });
  app.use('/api/nudges', router);
  return app;
}

function makeUserDoc(fields = {}) {
  // Mongoose-ish stub. computeNudges only reads fields, and the route
  // calls user.markModified + user.save().
  const doc = {
    _id: 'u-1',
    role: 'student',
    assessmentCompleted: false,
    startingPointOffered: false,
    startingPointOfferedAt: null,
    nextGrowthCheckDue: null,
    nudgeState: undefined,
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...fields,
  };
  return doc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/nudges', () => {
  test('returns 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    const res = await supertest(makeApp({ _id: 'u-1' })).get('/api/nudges');
    expect(res.status).toBe(404);
  });

  test('returns starting-point nudge for fresh student', async () => {
    const user = makeUserDoc();
    User.findById.mockResolvedValue(user);
    const res = await supertest(makeApp({ _id: 'u-1' })).get('/api/nudges');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.nudges).toHaveLength(1);
    expect(res.body.nudges[0].type).toBe('starting-point');
    // promptedAt should have been stamped on the document
    expect(user.nudgeState.screener.promptedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();
  });

  test('returns empty array (and skips save) when no nudges apply', async () => {
    const user = makeUserDoc({ assessmentCompleted: true, nextGrowthCheckDue: null });
    User.findById.mockResolvedValue(user);
    const res = await supertest(makeApp({ _id: 'u-1' })).get('/api/nudges');
    expect(res.status).toBe(200);
    expect(res.body.nudges).toEqual([]);
    expect(user.save).not.toHaveBeenCalled();
  });
});

describe('POST /api/nudges/:type/dismiss', () => {
  test('rejects unknown nudge types', async () => {
    User.findById.mockResolvedValue(makeUserDoc());
    const res = await supertest(makeApp({ _id: 'u-1' })).post('/api/nudges/cheeseburger/dismiss');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown/);
  });

  test('records dismissal and increments count', async () => {
    const user = makeUserDoc();
    User.findById.mockResolvedValue(user);
    const res = await supertest(makeApp({ _id: 'u-1' })).post('/api/nudges/starting-point/dismiss');
    expect(res.status).toBe(200);
    expect(res.body.dismissCount).toBe(1);
    expect(user.nudgeState.screener.dismissedAt).toBeInstanceOf(Date);
    expect(user.markModified).toHaveBeenCalledWith('nudgeState');
    expect(user.save).toHaveBeenCalled();
  });

  test('increments existing dismissCount', async () => {
    const user = makeUserDoc({
      nudgeState: { growthCheck: { dismissedAt: new Date(), dismissCount: 2 } },
    });
    User.findById.mockResolvedValue(user);
    const res = await supertest(makeApp({ _id: 'u-1' })).post('/api/nudges/growth-check/dismiss');
    expect(res.status).toBe(200);
    expect(res.body.dismissCount).toBe(3);
  });

  test('returns 404 when user disappears', async () => {
    User.findById.mockResolvedValue(null);
    const res = await supertest(makeApp({ _id: 'u-1' })).post('/api/nudges/starting-point/dismiss');
    expect(res.status).toBe(404);
  });
});
