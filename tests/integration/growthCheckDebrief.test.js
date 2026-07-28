// tests/integration/growthCheckDebrief.test.js
//
// The tutor delivering the Growth Check wrap-up in chat, end to end through
// POST /api/chat { growthCheckDebrief: true }.
//
// A Growth Check finishes inside the FloatingScreener, outside the transcript.
// routes/screener.js parks the summary on the student as a pending debrief;
// this proves the tutor picks it up, says it once, and never says it twice.
// That last point matters: a chat load can fire more than one request that
// would deliver it (the client request, a retry, a second tab), and a
// read-then-clear would let two of them tell the student their results twice.
//
// Models are mocked — no MongoDB. The User fake implements findOneAndUpdate
// with Mongo's documented atomicity (match-and-update is a single indivisible
// operation), which is the property the handler's claim depends on. What's
// under test is the handler's use of it: claim FIRST, then generate, and stay
// silent when the claim comes back empty.

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isParent: (req, _res, next) => next(),
}));

jest.mock('../../middleware/promptInjection', () => ({
  promptInjectionFilter: (req, _res, next) => next(),
}));

jest.mock('../../models/user', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../models/conversation', () => {
  const saved = [];
  function Conversation(doc) {
    Object.assign(this, doc);
    this._id = 'conv_1';
    this.messages = doc.messages || [];
    this.isActive = true;
    this.save = jest.fn(function () { saved.push(this); return Promise.resolve(this); });
  }
  Conversation.findById = jest.fn().mockResolvedValue(null);
  Conversation.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
  Conversation.__saved = saved;
  return Conversation;
});

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const { callLLM } = require('../../utils/llmGateway');
const { buildGrowthCheckSummary } = require('../../utils/growthSummary');
const chatRoutes = require('../../routes/chat');

const STUDENT_ID = '507f1f77bcf86cd799439011';

const SUMMARY = buildGrowthCheckSummary({
  previousTheta: 0.2,
  newTheta: 0.75,
  accuracy: 83,
  questionsAnswered: 6,
  sessionId: 'screener_growth_1',
  confirmedSkills: [{ skillId: 'ms-ratios', name: 'ratios' }],
  needsReviewSkills: [{ skillId: 'ms-fractions', name: 'adding fractions' }],
  newlyReachableSkills: [{ skillId: 'alg1-slope', name: 'slope' }],
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: STUDENT_ID, roles: ['student'] };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/chat', chatRoutes);
  return app;
}

/**
 * Seed the student. `store` holds the one mutable piece of state the claim
 * races over, so findOneAndUpdate can match-and-clear indivisibly the way
 * Mongo does.
 */
function seedStudent({ pendingDebrief = true, createdAt = new Date() } = {}) {
  const store = {
    pending: pendingDebrief ? { summary: SUMMARY, createdAt } : undefined,
  };

  const userDoc = {
    _id: STUDENT_ID,
    firstName: 'Jason',
    xp: 120,
    level: 2,
    selectedTutorId: 'default',
    activeConversationId: null,
    learningProfile: { assessmentCompleted: true },
    toObject() { return { ...this }; },
    save: jest.fn().mockResolvedValue(true),
  };
  User.findById.mockResolvedValue(userDoc);

  // Mongo semantics: the filter match and the $unset happen as one operation,
  // and `new: false` returns the document as it was BEFORE the update. Exactly
  // one concurrent caller can therefore observe a non-empty pending field.
  User.findOneAndUpdate.mockImplementation((filter, update, options) => {
    const chain = {
      lean: async () => {
        if (!store.pending) return null;             // filter didn't match
        const before = { learningProfile: { pendingGrowthCheckDebrief: store.pending } };
        if (update?.$unset?.['learningProfile.pendingGrowthCheckDebrief']) {
          store.pending = undefined;                 // claimed
        }
        return options?.new === true ? { learningProfile: {} } : before;
      },
    };
    return chain;
  });

  return { userDoc, store };
}

beforeEach(() => {
  jest.clearAllMocks();
  Conversation.__saved.length = 0;
  Conversation.findById.mockResolvedValue(null);
  User.findByIdAndUpdate.mockResolvedValue(null);
  callLLM.mockResolvedValue({
    choices: [{ message: { content: 'Nice work — you moved from 6th Grade up to 8th Grade. Want to try slope next time?' } }],
  });
});

describe('POST /api/chat { growthCheckDebrief: true }', () => {
  test('delivers the pending debrief in the tutor voice and returns the summary', async () => {
    seedStudent();

    const res = await supertest(buildApp())
      .post('/api/chat')
      .send({ growthCheckDebrief: true })
      .expect(200);

    expect(res.body.debriefDelivered).toBe(true);
    expect(res.body.text).toContain('8th Grade');
    expect(res.body.growthSummary.newLevel).toBe('8th Grade');
    expect(res.body.growthSummary.previousLevel).toBe('6th Grade');
    expect(res.body.growthSummary.suggestedNextStep.text).toEqual(expect.any(String));
  });

  test('a debrief request carries no message, and must not be rejected as empty', async () => {
    seedStudent();

    // The "Message is required" guard runs before the dispatch — the debrief is
    // the TUTOR talking, so it has no student message by design.
    await supertest(buildApp())
      .post('/api/chat')
      .send({ growthCheckDebrief: true })
      .expect(200);
  });

  test('hands the LLM the real results and the suggest-don\'t-launch rule', async () => {
    seedStudent();

    await supertest(buildApp()).post('/api/chat').send({ growthCheckDebrief: true }).expect(200);

    const instruction = callLLM.mock.calls[0][1].map(m => m.content).join('\n');
    expect(instruction).toContain('6th Grade');
    expect(instruction).toContain('8th Grade');
    expect(instruction).toContain('ratios');
    expect(instruction).toContain('adding fractions');
    expect(instruction).toMatch(/EXACTLY ONE suggested next step/);
    expect(instruction).toMatch(/Do NOT start that activity/i);
    expect(instruction).toMatch(/do NOT ask them a math question now/i);
  });

  test('lands in the transcript, so the wrap-up survives a refresh', async () => {
    seedStudent();

    await supertest(buildApp()).post('/api/chat').send({ growthCheckDebrief: true }).expect(200);

    expect(Conversation.__saved).toHaveLength(1);
    const messages = Conversation.__saved[0].messages;
    const last = messages[messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.content).toContain('8th Grade');
  });

  test('says it ONCE — a second request gets nothing, not a repeat', async () => {
    seedStudent();
    const app = buildApp();

    const first = await supertest(app).post('/api/chat').send({ growthCheckDebrief: true }).expect(200);
    const second = await supertest(app).post('/api/chat').send({ growthCheckDebrief: true }).expect(200);

    expect(first.body.debriefDelivered).toBe(true);
    expect(second.body.debriefDelivered).toBe(false);
    expect(second.body.text).toBe('');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('CONCURRENT requests (two tabs, a retry) still produce exactly one debrief', async () => {
    seedStudent();
    const app = buildApp();

    const results = await Promise.all([
      supertest(app).post('/api/chat').send({ growthCheckDebrief: true }),
      supertest(app).post('/api/chat').send({ growthCheckDebrief: true }),
      supertest(app).post('/api/chat').send({ growthCheckDebrief: true }),
    ]);

    expect(results.filter(r => r.body.debriefDelivered)).toHaveLength(1);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('nothing pending → silent, no empty bubble, no LLM call', async () => {
    seedStudent({ pendingDebrief: false });

    const res = await supertest(buildApp())
      .post('/api/chat')
      .send({ growthCheckDebrief: true })
      .expect(200);

    expect(res.body.debriefDelivered).toBe(false);
    expect(res.body.text).toBe('');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('a debrief the student never came back for expires instead of arriving weeks late', async () => {
    const { store } = seedStudent({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    const res = await supertest(buildApp())
      .post('/api/chat')
      .send({ growthCheckDebrief: true })
      .expect(200);

    expect(res.body.debriefDelivered).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
    // ...and it's cleared, so it can't resurface months later either.
    expect(store.pending).toBeUndefined();
  });

  test('an LLM outage still closes the loop, via the deterministic fallback', async () => {
    seedStudent();
    callLLM.mockRejectedValue(new Error('provider down'));

    const res = await supertest(buildApp())
      .post('/api/chat')
      .send({ growthCheckDebrief: true })
      .expect(200);

    expect(res.body.debriefDelivered).toBe(true);
    expect(res.body.text).toContain('8th Grade');
    expect(res.body.text).toContain('83%');
    expect(res.body.text).toContain(SUMMARY.suggestedNextStep.text);
  });
});
