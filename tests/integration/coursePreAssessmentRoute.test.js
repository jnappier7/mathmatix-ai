/**
 * The course pre-assessment endpoints, against a real database.
 *
 * The unit tests cover the blueprint math; what they cannot cover is the chain
 * this feature actually is: serve items with no answers -> grade server-side ->
 * prove credited skills at rung 2 -> cascade prerequisites -> move the course's
 * start module -> stop offering the card. Each link of that chain has failed
 * once already this session when only unit-tested, so this drives the real
 * routes against a real mongod.
 *
 * Uses a real pathway file (6th-grade-math) rather than a fixture, so the test
 * also breaks if the pathway format drifts out from under the endpoint.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Skill = require('../../models/skill');
const Problem = require('../../models/problem');
const CourseSession = require('../../models/courseSession');
const { getSkillMasteryEntry } = require('../../utils/masteryGuard');
const { courseSkills } = require('../../utils/coursePreAssessment');

const COURSE_ID = '6th-grade-math';
const pathway = require('../../public/resources/6th-grade-math-pathway.json');

let mem;
let app;
let currentUserId;
let sessionId;
let servedSkillIds;   // the skills the GET blueprint chose to test

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  // Give every course skill a couple of gradable items so the blueprint can
  // cover the whole pathway.
  const skills = courseSkills(pathway);
  const docs = [];
  skills.forEach((s, i) => {
    for (let n = 0; n < 2; n += 1) {
      docs.push({
        problemId: `cpa-${i}-${n}`,
        skillId: s.skillId,
        prompt: `Compute ${i} + ${n}`,
        answer: { type: 'exact', value: String(i + n) },
        difficulty: 2
      });
    }
  });
  await Problem.insertMany(docs);

  // A minimal unified catalog so the cascade has a graph. Real ids, one edge.
  await Skill.insertMany([
    {
      skillId: 'MS.QNT.1', displayName: 'Decimal ops', studentLabel: 'Decimal arithmetic',
      description: 'd', category: 'number-system', strand: 'QNT', courseLevel: 'MS',
      prerequisites: [], crossPrereqs: [], source: 'unified-taxonomy'
    }
  ]);

  const router = require('../../routes/courseSession');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: currentUserId };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/course-sessions', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

beforeEach(async () => {
  const u = await User.create({
    username: `cpa${Date.now()}`, email: `cpa${Date.now()}@e.com`,
    firstName: 'C', lastName: 'P'
  });
  currentUserId = u._id;
  const s = await CourseSession.create({
    userId: u._id, courseId: COURSE_ID, status: 'active',
    pathwayId: '6th-grade-math-pathway', courseName: '6th Grade Math',
    currentModuleId: pathway.modules[0].moduleId
  });
  sessionId = String(s._id);
});

afterEach(async () => {
  await User.deleteMany({});
  await CourseSession.deleteMany({});
});

const fetchPre = () => supertest(app).get(`/api/course-sessions/${sessionId}/preassessment`);

const answersFor = async (problems, wrongFor = new Set()) => {
  const out = [];
  for (const p of problems) {
    const doc = await Problem.findById(p.problemId).lean();
    out.push({
      problemId: p.problemId,
      answer: wrongFor.has(doc.skillId) ? 'definitely wrong' : String(doc.answer.value)
    });
  }
  return out;
};

describe('GET /:id/preassessment', () => {
  test('serves items for the course without leaking answers', async () => {
    const res = await fetchPre();
    expect(res.status).toBe(200);
    expect(res.body.problems.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/"answer"\s*:/);
    expect(res.body.coverage).toBeGreaterThan(0);
    servedSkillIds = [...new Set(res.body.problems.map((p) => p.skillId))];
  });

  test('is honest about partial coverage', async () => {
    const res = await fetchPre();
    // The pathway has more skills than a 20-item cap can cover at 2 per skill,
    // so coverage must be reported as < 1, not implied as complete.
    expect(res.body.skillsAssessed).toBeLessThanOrEqual(10);
    expect(res.body.coverage).toBeLessThan(1);
    expect(res.body.totalCourseSkills).toBe(courseSkills(pathway).length);
  });
});

describe('POST /:id/preassessment', () => {
  test('a clean run credits skills, moves the start, and stops the card', async () => {
    const served = (await fetchPre()).body.problems;
    const submissions = await answersFor(served);

    const res = await supertest(app)
      .post(`/api/course-sessions/${sessionId}/preassessment`)
      .send({ submissions });

    expect(res.status).toBe(200);
    expect(res.body.credited.length).toBeGreaterThan(0);

    // Credited skills are really proved on the user document.
    const user = await User.findById(currentUserId);
    const first = getSkillMasteryEntry(user, res.body.credited[0]);
    expect(first.rung).toBe('proved');
    expect(first.provenBy).toBe('placement');

    // The session records completion, so buildCourseDiagnostic stops offering it.
    const session = await CourseSession.findById(sessionId);
    expect(session.preAssessmentCompletedAt).toBeTruthy();
    expect(session.preAssessment.credited).toEqual(res.body.credited);
  });

  test('missing a skill starts the course at that module, not past it', async () => {
    const served = (await fetchPre()).body.problems;
    // Fail everything from the FIRST tested skill; ace the rest.
    const firstSkill = served[0].skillId;
    const submissions = await answersFor(served, new Set([firstSkill]));

    const res = await supertest(app)
      .post(`/api/course-sessions/${sessionId}/preassessment`)
      .send({ submissions });

    expect(res.body.notCredited).toContain(firstSkill);
    expect(res.body.start).toBeTruthy();
    // The first module containing the missed skill is where the course starts.
    const skillModule = courseSkills(pathway).find((s) => s.skillId === firstSkill).moduleId;
    expect(res.body.start.moduleId).toBe(skillModule);

    const session = await CourseSession.findById(sessionId);
    expect(session.currentModuleId).toBe(skillModule);
  });

  test('a wrong-answer run credits nothing and moves nothing', async () => {
    const served = (await fetchPre()).body.problems;
    const submissions = served.map((p) => ({ problemId: p.problemId, answer: 'nope' }));

    const res = await supertest(app)
      .post(`/api/course-sessions/${sessionId}/preassessment`)
      .send({ submissions });

    expect(res.body.credited).toEqual([]);
    // Failing the pre-assessment is free: nothing on the user changed.
    const user = await User.findById(currentUserId);
    expect(user.skillMastery.size).toBe(0);
    // And the course starts at the first module with a gap — the beginning.
    expect(res.body.start.moduleId).toBe(pathway.modules[0].moduleId);
  });

  test('client-claimed correctness is ignored', async () => {
    const served = (await fetchPre()).body.problems;
    const lying = served.map((p) => ({
      problemId: p.problemId, answer: 'wrong', correct: true, isCorrect: true
    }));

    const res = await supertest(app)
      .post(`/api/course-sessions/${sessionId}/preassessment`)
      .send({ submissions: lying });

    expect(res.body.credited).toEqual([]);
  });

  test('another user\'s session id is not accessible', async () => {
    const stranger = await User.create({
      username: `x${Date.now()}`, email: `x${Date.now()}@e.com`, firstName: 'X', lastName: 'X'
    });
    const strangerSession = await CourseSession.create({
      userId: stranger._id, courseId: COURSE_ID, status: 'active',
      pathwayId: '6th-grade-math-pathway', courseName: '6th Grade Math'
    });

    const res = await supertest(app)
      .post(`/api/course-sessions/${strangerSession._id}/preassessment`)
      .send({ submissions: [{ problemId: 'p', answer: 'x' }] });
    expect(res.status).toBe(404);
  });
});
