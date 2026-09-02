/**
 * LESSON PLANNER — the teacher tools must not leak the roster.
 *
 * POST /api/teacher/lesson-planner used to write every student's first name,
 * grade, course, IEP accommodations, IEP goal text and exact goal progress
 * into one system prompt and send it to OpenAI through the raw client — so
 * even with PII_STRIP_OUTBOUND on (pattern-only), the names survived. It was
 * the one place the app deliberately lined up name + grade + disability
 * status, which is the combination that makes accommodations personally
 * identifiable under FERPA's linkability test (34 CFR 99.3).
 *
 * Pinned here:
 *   1. What leaves the app carries "[Student N]" labels, never roster names —
 *      in the system prompt, the prior turns, the client-supplied skill gaps,
 *      and the teacher's own question.
 *   2. IEP accommodation TYPES still go (a lesson plan needs them); goal
 *      descriptions and exact percentages do not.
 *   3. The reply the teacher sees has the real names back, even when a label
 *      arrives split across two stream chunks.
 *   4. It is unconditional — no env flag involved.
 *   5. The disclosure is recorded once per student (34 CFR 99.32).
 */

jest.mock('../../models/user', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../models/conversation', () => ({
  find: jest.fn(), findOne: jest.fn(), findById: jest.fn(),
  findByIdAndUpdate: jest.fn(), findOneAndUpdate: jest.fn(),
}));
jest.mock('../../models/enrollmentCode', () => ({ find: jest.fn(), findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../../models/screenerSession', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/skill', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/learningCard', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../utils/skillDisplayNames', () => ({
  resolveSkillDisplayNames: jest.fn().mockResolvedValue({ 'alg-two-step': 'Two-step equations' }),
}));
jest.mock('../../utils/activitySummarizer', () => ({
  generateLiveSummary: jest.fn(),
  detectStruggle: jest.fn().mockReturnValue({ isStruggling: false }),
  detectTopic: jest.fn().mockReturnValue(null),
  calculateProblemStats: jest.fn().mockReturnValue({}),
}));
jest.mock('../../services/sessionService', () => ({ cleanupStaleSessions: jest.fn().mockResolvedValue() }));
jest.mock('../../utils/interventionAlerts', () => ({
  computeRiskScore: jest.fn(), getInterventionTier: jest.fn(), generateRecommendation: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({ callLLMStream: jest.fn() }));
jest.mock('../../services/userService', () => ({ getStudentIdsForTeacher: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
  isTeacher: (req, res, next) => next(),
  isAdmin: (req, res, next) => next(),
  isAuthenticated: (req, res, next) => next(),
  isParent: (req, res, next) => next(),
  isStudent: (req, res, next) => next(),
}));
jest.mock('../../middleware/consentGate', () => ({ requireActiveConsent: () => (req, res, next) => next() }));
jest.mock('../../models/educationRecordAccessLog', () => ({
  create: jest.fn().mockResolvedValue({}),
  insertMany: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../utils/logger', () => {
  const base = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { ...base, child: () => base };
});

const request = require('supertest');
const express = require('express');

const User = require('../../models/user');
const EducationRecordAccessLog = require('../../models/educationRecordAccessLog');
const { callLLMStream } = require('../../utils/openaiClient');
const { getStudentIdsForTeacher } = require('../../services/userService');
const teacherRoutes = require('../../routes/teacher');

const TEACHER = { _id: '650000000000000000000001', firstName: 'Dana', lastName: 'Rivera', roles: ['teacher'], role: 'teacher' };

const ROSTER = [
  {
    _id: '650000000000000000000011', firstName: 'Maya', lastName: 'Chen', gradeLevel: 7, mathCourse: 'Pre-Algebra',
    skillMastery: { 'alg-two-step': { status: 'learning', masteryScore: 20 } },
    iepPlan: {
      accommodations: { extendedTime: true, calculator: true, readAloud: false },
      goals: [{ status: 'active', description: 'Solve two-step equations with 80% accuracy', currentProgress: 45 }],
    },
    lastLogin: new Date(),
  },
  {
    _id: '650000000000000000000012', firstName: 'Jordan', lastName: 'Okafor', gradeLevel: 7, mathCourse: 'Pre-Algebra',
    skillMastery: {}, lastLogin: new Date(),
  },
];

function streamOf(chunks) {
  return (async function* () {
    for (const c of chunks) yield { choices: [{ delta: { content: c } }] };
  })();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = TEACHER; req.isAuthenticated = () => true; next(); });
  app.use('/api/teacher', teacherRoutes);
  return app;
}

const streamedText = (res) => res.text.split('\n')
  .filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
  .map((l) => JSON.parse(l.slice(6)).text)
  .join('');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PII_STRIP_OUTBOUND;
  getStudentIdsForTeacher.mockResolvedValue(ROSTER.map((s) => s._id));
  User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(ROSTER) });
  User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(TEACHER) });
});

async function plan(body, chunks = ['Pair [Student 1] with [Student 2].']) {
  callLLMStream.mockResolvedValue(streamOf(chunks));
  const res = await request(makeApp()).post('/api/teacher/lesson-planner').send({
    prompt: 'Who should I group together tomorrow?',
    ...body,
  });
  expect(res.status).toBe(200);
  return res;
}

const outboundText = () => callLLMStream.mock.calls[0][1].map((m) => m.content).join('\n');

describe('what leaves the app', () => {
  test('no roster name appears anywhere in the outbound messages', async () => {
    await plan({
      conversationHistory: [
        { role: 'user', content: 'Tell me about Maya.' },
        { role: 'assistant', content: 'Maya Chen is working on two-step equations; Jordan is ahead.' },
      ],
      skillGaps: [{
        displayName: 'Two-step equations', mastered: 1, totalStudents: 2, learning: 1, notMasteredCount: 1,
        strugglingStudents: [{ name: 'Maya' }],
      }],
      prompt: 'What should I do about Maya and Jordan Okafor? Signed, Ms. Rivera',
    });

    const sent = outboundText();
    for (const name of ['Maya', 'Chen', 'Jordan', 'Okafor', 'Dana', 'Rivera']) {
      expect(sent).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'));
    }
    expect(sent).toContain('[Student 1]');
    expect(sent).toContain('[Student 2]');
    expect(sent).toContain('[Teacher]');
  });

  test('the model is told what the labels are and to use them verbatim', async () => {
    await plan({});
    const system = callLLMStream.mock.calls[0][1][0];
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/STUDENT LABELS/);
    expect(system.content).not.toMatch(/by name/);
  });

  test('accommodation types go; goal text and exact progress do not', async () => {
    await plan({});
    const sent = outboundText();
    expect(sent).toMatch(/IEP: extended time, calculator/);
    expect(sent).not.toMatch(/Solve two-step equations with 80% accuracy/);
    expect(sent).not.toMatch(/45%/);
    expect(sent).toMatch(/1 active IEP goal \(developing\)/);
  });

  test('is not gated on PII_STRIP_OUTBOUND', async () => {
    process.env.PII_STRIP_OUTBOUND = 'false';
    await plan({ prompt: 'Group Maya with Jordan.' });
    expect(outboundText()).not.toMatch(/\bMaya\b/);
  });

  test('tells the outbound chokepoint the caller owns rehydration', async () => {
    await plan({});
    const options = callLLMStream.mock.calls[0][2];
    expect(options.anonContext).toBeDefined();
    expect(typeof options.anonContext.rehydrate).toBe('function');
  });
});

describe('what the teacher reads back', () => {
  test('labels become first names in the streamed reply', async () => {
    const res = await plan({}, ['Pair **[Student 1]** with [Student 2]. ', 'Give [Student 1] extended time.']);
    expect(streamedText(res)).toBe('Pair **Maya** with Jordan. Give Maya extended time.');
  });

  test('a label split across chunks is still reassembled', async () => {
    const res = await plan({}, ['Start with [Stu', 'dent 2], then [Student', ' 1].']);
    expect(streamedText(res)).toBe('Start with Jordan, then Maya.');
  });

  test('the SSE stream still terminates with [DONE]', async () => {
    const res = await plan({});
    expect(res.text.trim().endsWith('data: [DONE]')).toBe(true);
  });
});

describe('the disclosure is recorded', () => {
  test('one access-log entry per student on the roster, for the lesson planner', async () => {
    await plan({});
    // res.on('finish') runs after supertest resolves; give it a tick.
    await new Promise((r) => setImmediate(r));
    expect(EducationRecordAccessLog.insertMany).toHaveBeenCalledTimes(1);
    const docs = EducationRecordAccessLog.insertMany.mock.calls[0][0];
    expect(docs.map((d) => String(d.studentId)).sort()).toEqual(ROSTER.map((s) => s._id).sort());
    expect(docs.every((d) => d.recordType === 'iep_plan' && d.accessedByRole === 'teacher')).toBe(true);
    expect(docs[0].endpoint).toBe('POST /api/teacher/lesson-planner');
  });

  test('and for the class snapshot, which reads the same records', async () => {
    const res = await request(makeApp()).get('/api/teacher/class-snapshot');
    expect(res.status).toBe(200);
    // The dashboard keeps real names — nothing here leaves the app.
    expect(res.body.iepStudents).toEqual(['Maya']);
    await new Promise((r) => setImmediate(r));
    expect(EducationRecordAccessLog.insertMany).toHaveBeenCalledTimes(1);
    expect(EducationRecordAccessLog.insertMany.mock.calls[0][0]).toHaveLength(2);
  });
});
