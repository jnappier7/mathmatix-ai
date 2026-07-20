/**
 * The teach-back endpoints, against a real database, with the LLM scorer mocked.
 *
 * Proves the rung enforcement and the persistence: you cannot teach a skill you
 * have not proved, a passing explanation advances it to 'taught' and survives a
 * reload, and a scorer outage changes nothing.
 */

// Mock the scorer so no live model is called; the scoring logic itself is unit-
// tested in tests/unit/teachBack.test.js.
jest.mock('../../utils/teachBack', () => {
  const actual = jest.requireActual('../../utils/teachBack');
  return { ...actual, scoreTeachBack: jest.fn() };
});

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Skill = require('../../models/skill');
const { setSkillMasteryEntry, getSkillMasteryEntry } = require('../../utils/masteryGuard');
const { advanceRung } = require('../../utils/skillRung');
const { scoreTeachBack } = require('../../utils/teachBack');

let mem;
let app;
let currentUserId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  await Skill.create({
    skillId: 'ALG1.EQV.9',
    displayName: 'Add subtract polynomials',
    studentLabel: 'Adding and subtracting polynomials',
    description: 'Add and subtract polynomials by combining like terms.',
    category: 'expressions-equations',
    strand: 'EQV',
    courseLevel: 'ALG1',
    source: 'unified-taxonomy',
    teachingGuidance: { commonMistakes: ['adds the exponents when combining like terms'] }
  });

  const router = require('../../routes/mastery');
  app = express();
  app.use(express.json());
  // Stand in for passport: isAuthenticated (middleware/auth) calls
  // req.isAuthenticated() && req.user, so provide both.
  app.use((req, _res, next) => {
    req.user = { _id: currentUserId };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/mastery', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

beforeEach(async () => {
  scoreTeachBack.mockReset();
  const u = await User.create({ username: `t${Date.now()}`, email: `t${Date.now()}@e.com`, firstName: 'T', lastName: 'T' });
  currentUserId = u._id;
});

afterEach(async () => {
  await User.deleteMany({});
});

const prove = async (userId, skillId) => {
  const u = await User.findById(userId);
  const entry = {};
  advanceRung(entry, 'proved', { via: 'challenge', evidence: { correct: 5, total: 5, hintsUsed: 0 } });
  delete entry.__rungResult;
  setSkillMasteryEntry(u, skillId, entry);
  await u.save();
};

describe('GET /teachback/:skillId', () => {
  test('is not eligible before the skill is proved', async () => {
    const res = await supertest(app).get('/api/mastery/teachback/ALG1.EQV.9');
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toMatch(/prove it/);
  });

  test('offers a real misconception opener once the skill is proved', async () => {
    await prove(currentUserId, 'ALG1.EQV.9');
    const res = await supertest(app).get('/api/mastery/teachback/ALG1.EQV.9');
    expect(res.body.eligible).toBe(true);
    expect(res.body.misconception).toContain('exponent');
  });
});

describe('POST /teachback/:skillId', () => {
  test('refuses to score a skill that has not been proved', async () => {
    const res = await supertest(app)
      .post('/api/mastery/teachback/ALG1.EQV.9')
      .send({ explanation: 'a full and correct explanation of combining like terms' });
    expect(res.status).toBe(409);
    expect(scoreTeachBack).not.toHaveBeenCalled();
  });

  test('a passing explanation advances the skill to taught and persists', async () => {
    await prove(currentUserId, 'ALG1.EQV.9');
    scoreTeachBack.mockResolvedValue({ scored: true, passed: true, score: 4, dimensions: { correct: 1 } });

    const res = await supertest(app)
      .post('/api/mastery/teachback/ALG1.EQV.9')
      .send({ explanation: 'combine like terms; the exponent stays the same because you count how many of that term you have' });

    expect(res.body).toMatchObject({ scored: true, passed: true, rung: 'taught' });

    const reloaded = await User.findById(currentUserId);
    const entry = getSkillMasteryEntry(reloaded, 'ALG1.EQV.9');
    expect(entry.rung).toBe('taught');
    expect(entry.rungHistory.some((h) => h.to === 'taught' && h.via === 'teachback')).toBe(true);
  });

  test('a failing explanation leaves the rung at proved', async () => {
    await prove(currentUserId, 'ALG1.EQV.9');
    scoreTeachBack.mockResolvedValue({ scored: true, passed: false, score: 2, feedback: 'thin' });

    const res = await supertest(app)
      .post('/api/mastery/teachback/ALG1.EQV.9')
      .send({ explanation: 'you just add them' });

    expect(res.body).toMatchObject({ scored: true, passed: false });
    const reloaded = await User.findById(currentUserId);
    expect(getSkillMasteryEntry(reloaded, 'ALG1.EQV.9').rung).toBe('proved');
  });

  test('a scorer outage changes nothing and invites a retry', async () => {
    await prove(currentUserId, 'ALG1.EQV.9');
    scoreTeachBack.mockResolvedValue({ scored: false, reason: 'scorer unavailable: 503' });

    const res = await supertest(app)
      .post('/api/mastery/teachback/ALG1.EQV.9')
      .send({ explanation: 'a genuine attempt at explaining the whole thing clearly' });

    expect(res.body).toMatchObject({ scored: false, retry: true });
    const reloaded = await User.findById(currentUserId);
    expect(getSkillMasteryEntry(reloaded, 'ALG1.EQV.9').rung).toBe('proved');
  });
});
