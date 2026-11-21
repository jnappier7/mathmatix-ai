/**
 * Every course begins with a placement, and the placement SHORTENS the course.
 *
 * Three things were not true before this file existed (course QA, 2026-11-21):
 *
 *  1. THE DEAD END. The quick check looked the bank up by the course's own
 *     skill ids ("g6-unit-rates"). The bank keys that content by bank ids
 *     ("unit-rates"), so the check found nothing and told the student "No
 *     pre-assessment available for this course yet" — and the card that sent
 *     them there came back on every visit. The earlier route test seeded its
 *     items under the COURSE ids, which is why it passed while production
 *     failed; this one seeds them the way the bank really holds them.
 *
 *  2. NOTHING CLOSED. A passed check marked skills mastered and left the course
 *     at "0 of 15 modules". Placement now closes every module whose skills the
 *     student owns and moves the bar.
 *
 *  3. THE STARTING POINT NEVER REACHED A COURSE. Algebra 1, Algebra 2,
 *     Pre-Calculus and both Calculus courses place by the Starting Point; its
 *     result changed nothing in them.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Problem = require('../../models/problem');
const CourseSession = require('../../models/courseSession');
const { skillLookupCandidates, canonicalSkillId } = require('../../utils/skillCanonicalizer');
const { setSkillMasteryEntry } = require('../../utils/masteryGuard');
const { advanceRung } = require('../../utils/skillRung');
const { buildCourseDiagnostic } = require('../../utils/courseDiagnostic');
const service = require('../../utils/coursePlacementService');

const G6 = require('../../public/resources/6th-grade-math-pathway.json');
const ALG1 = require('../../public/resources/algebra-1-pathway.json');

const G6_RAW = new Set(G6.modules.flatMap((m) => m.skills || []));

let mem;
let app;
let currentUser;

const post = (url, body) => supertest(app).post(url).send(body || {});
const get = (url) => supertest(app).get(url);
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** The id the BANK holds a course skill under: its mapped bank id, never the course id. */
const bankIdFor = (raw) => skillLookupCandidates(raw).find((id) => id !== raw && id !== canonicalSkillId(raw));

/** Prove a skill on a user the way a placement does. */
function prove(user, skillId) {
  const entry = {};
  advanceRung(entry, 'proved', { via: 'placement' });
  delete entry.__rungResult;
  entry.status = 'mastered';
  setSkillMasteryEntry(user, skillId, entry);
}

async function answer(problems, { wrong = () => false } = {}) {
  const out = [];
  for (const p of problems) {
    const doc = await Problem.findById(p.problemId).lean();
    out.push({ problemId: p.problemId, answer: wrong(p) ? 'nope' : String(doc.answer.value) });
  }
  return out;
}

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  // The bank as production holds it: items under BANK ids only. Every
  // 6th-grade skill that has a mapped bank id gets four items there.
  const docs = [];
  const seen = new Set();
  for (const m of G6.modules) {
    for (const raw of m.skills || []) {
      const bankId = bankIdFor(raw);
      if (!bankId || seen.has(bankId) || G6_RAW.has(bankId)) continue;
      seen.add(bankId);
      for (let n = 0; n < 4; n += 1) {
        docs.push({
          problemId: `bank-${bankId}-${n}`, skillId: bankId, prompt: `(${bankId}) ${n} + 1`,
          answer: { type: 'exact', value: String(n + 1) }, difficulty: 2,
        });
      }
    }
  }
  await Problem.insertMany(docs);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser; req.isAuthenticated = () => !!currentUser; next(); });
  app.use('/api/course-sessions', require('../../routes/courseSession'));
}, 60000);

afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

beforeEach(async () => {
  service._resetCache();
  currentUser = await User.create({
    username: `p${uniq()}`, email: `p${uniq()}@example.com`, firstName: 'Ava', lastName: 'N',
    role: 'student', roles: ['student'],
  });
});

afterEach(async () => { await CourseSession.deleteMany({}); await User.deleteMany({}); });

describe('the quick check finds the bank', () => {
  test('the fixture is honest: no item is keyed by a course skill id', async () => {
    const courseIds = G6.modules.flatMap((m) => m.skills || []);
    expect(await Problem.countDocuments({ skillId: { $in: courseIds } })).toBe(0);
    expect(await Problem.countDocuments({})).toBeGreaterThan(20);
  });

  test('items held under bank ids are served, labelled with the COURSE skill, answers withheld', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    expect(enrolled.body.welcomeData.diagnostic.type).toBe('course-preassessment');

    const res = await get(`/api/course-sessions/${enrolled.body.session._id}/preassessment`);
    expect(res.status).toBe(200);
    expect(res.body.problems.length).toBeGreaterThanOrEqual(6);
    const courseIds = new Set(G6.modules.flatMap((m) => m.skills || []).map(canonicalSkillId));
    for (const p of res.body.problems) expect(courseIds.has(p.skillId)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/"answer"\s*:|correctOption|isCorrect/);
  });

  test('a clean run credits COURSE skills — where the course reads them', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    const id = enrolled.body.session._id;
    const served = (await get(`/api/course-sessions/${id}/preassessment`)).body.problems;
    const res = await post(`/api/course-sessions/${id}/preassessment`, { submissions: await answer(served) });

    expect(res.status).toBe(200);
    expect(res.body.credited.sort()).toEqual([...new Set(served.map((p) => p.skillId))].sort());
    const user = await User.findById(currentUser._id);
    const { ownedCourseSkills } = require('../../utils/coursePlacement');
    const owned = ownedCourseSkills(user, G6);
    for (const skillId of res.body.credited) expect(owned.has(skillId)).toBe(true);

    // And the card is gone for good.
    expect(await buildCourseDiagnostic(user, '6th-grade-math')).toBeNull();
  });
});

describe('placement closes modules and moves the bar', () => {
  test('a student who owns a module\'s skills does not sit it', async () => {
    // Owns everything in the first content module and its checkpoint.
    const user = await User.findById(currentUser._id);
    for (const raw of G6.modules[0].skills) prove(user, raw);
    await user.save();
    currentUser = await User.findById(currentUser._id);

    const res = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    const s = res.body.session;
    expect(s.modules[0].status).toBe('completed');
    expect(s.modules[0].placedOut).toBe(true);
    expect(s.modules[1].status).toBe('completed');          // its checkpoint tests the same skills
    expect(s.modules[2].status).toBe('available');
    expect(s.currentModuleId).toBe(G6.modules[2].moduleId);
    expect(s.overallProgress).toBeGreaterThan(0);
    expect(res.body.welcomeData.placement.closed).toBe(2);
    expect(res.body.welcomeData.placement.modulesLeft).toBe(G6.modules.length - 2);
    expect(res.body.welcomeData.firstModuleTitle).toBe(G6.modules[2].title);
  });

  test('the quick check itself closes what it proves, and says so', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    const id = enrolled.body.session._id;
    expect(enrolled.body.session.overallProgress).toBe(0);

    // The student already owns the skills the check has no room to sample in
    // module 1; the check supplies the rest. Together they close the module.
    const served = (await get(`/api/course-sessions/${id}/preassessment`)).body.problems;
    const user = await User.findById(currentUser._id);
    const tested = new Set(served.map((p) => p.skillId));
    for (const raw of G6.modules[0].skills) if (!tested.has(canonicalSkillId(raw))) prove(user, raw);
    await user.save();

    const res = await post(`/api/course-sessions/${id}/preassessment`, { submissions: await answer(served) });
    expect(res.body.closedModules.map((m) => m.moduleId)).toContain(G6.modules[0].moduleId);
    expect(res.body.modulesLeft).toBeLessThan(G6.modules.length);
    expect(res.body.overallProgress).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/marked done/);

    const session = await CourseSession.findById(id);
    expect(session.modules[0].status).toBe('completed');
    expect(session.overallProgress).toBe(res.body.overallProgress);
    expect(session.currentModuleId).toBe(res.body.start.moduleId);
    expect(session.modules.find((m) => m.moduleId === session.currentModuleId).status).not.toBe('locked');
  });

  test('a wrong-answer run closes nothing and costs nothing', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    const id = enrolled.body.session._id;
    const served = (await get(`/api/course-sessions/${id}/preassessment`)).body.problems;
    const res = await post(`/api/course-sessions/${id}/preassessment`,
      { submissions: await answer(served, { wrong: () => true }) });

    expect(res.body.credited).toEqual([]);
    expect(res.body.closedModules).toEqual([]);
    expect(res.body.start.moduleId).toBe(G6.modules[0].moduleId);
    expect(res.body.overallProgress).toBe(0);
  });

  test('owning the whole course still leaves the final module to sit', async () => {
    const user = await User.findById(currentUser._id);
    for (const m of G6.modules) for (const raw of m.skills || []) prove(user, raw);
    await user.save();
    currentUser = await User.findById(currentUser._id);

    const s = (await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' })).body.session;
    const last = s.modules[s.modules.length - 1];
    expect(last.status).not.toBe('completed');
    expect(s.currentModuleId).toBe(last.moduleId);
    expect(s.status).toBe('active');
    expect(s.overallProgress).toBeLessThan(100);
  });

  test('work in progress is never closed underneath the student', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: '6th-grade-math' });
    const session = await CourseSession.findById(enrolled.body.session._id);
    session.modules[0].status = 'in_progress';
    session.modules[0].scaffoldProgress = 40;
    session.markModified('modules');
    await session.save();

    const user = await User.findById(currentUser._id);
    for (const raw of G6.modules[0].skills) prove(user, raw);
    await user.save();

    const placed = await service.applyPlacementToActiveCourses(user);
    const after = await CourseSession.findById(session._id);
    expect(after.modules[0].status).toBe('in_progress');
    expect(after.modules[0].scaffoldProgress).toBe(40);
    expect(after.currentModuleId).toBe(G6.modules[0].moduleId);
    expect(placed).toEqual([]);
  });
});

describe('a Starting Point reaches the course', () => {
  test('skills proved after enrolling close their modules in the active course', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: 'algebra-1' });
    expect(enrolled.body.session.overallProgress).toBe(0);
    expect(enrolled.body.welcomeData.diagnostic.type).toBe('starting-point');

    // What routes/screener.js /complete does, then the hook it now calls.
    const user = await User.findById(currentUser._id);
    for (const raw of ALG1.modules[0].skills) prove(user, raw);
    await user.save();
    const placed = await service.applyPlacementToActiveCourses(user);

    expect(placed).toHaveLength(1);
    expect(placed[0].courseId).toBe('algebra-1');
    expect(placed[0].closed).toBe(2);            // the unit and its (skill-less) checkpoint
    const after = await CourseSession.findById(enrolled.body.session._id);
    expect(after.modules[0].placedOut).toBe(true);
    expect(after.modules[1].status).toBe('completed');
    expect(after.currentModuleId).toBe(ALG1.modules[2].moduleId);
    expect(after.overallProgress).toBeGreaterThan(0);

    // Idempotent: running it again changes nothing.
    expect(await service.applyPlacementToActiveCourses(user)).toEqual([]);
  });

  test('a skill-less checkpoint is NOT closed when the unit before it is still open', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: 'algebra-1' });
    const user = await User.findById(currentUser._id);
    for (const raw of ALG1.modules[2].skills) prove(user, raw);     // unit 2 only
    await user.save();
    await service.applyPlacementToActiveCourses(user);

    const after = await CourseSession.findById(enrolled.body.session._id);
    expect(after.modules[0].status).not.toBe('completed');
    expect(after.modules[2].status).toBe('completed');              // owned, so not re-taught
    expect(after.modules[3].status).not.toBe('completed');          // its checkpoint is still sat
    expect(after.currentModuleId).toBe(ALG1.modules[0].moduleId);   // and the course starts at the gap
  });

  test('test-prep courses keep their own baseline loop', async () => {
    const enrolled = await post('/api/course-sessions/enroll', { courseId: 'act-prep' });
    expect(enrolled.body.welcomeData.diagnostic.type).toBe('act-practice');
    const user = await User.findById(currentUser._id);
    const act = require('../../public/resources/act-prep-pathway.json');
    for (const m of act.modules) for (const raw of m.skills || []) prove(user, raw);
    await user.save();
    expect(await service.applyPlacementToActiveCourses(user)).toEqual([]);
  });
});

describe('every course opens with a placement it can actually run', () => {
  test('a course the bank cannot test falls back to the Starting Point, never a dead end', async () => {
    // Empty the bank for this test: no course can build a quick check.
    await Problem.updateMany({}, { $set: { isActive: false } });
    service._resetCache();
    let user;
    let card;
    try {
      user = await User.findById(currentUser._id);
      expect(await service.preAssessmentAvailable('consumer-math')).toBe(false);
      card = await buildCourseDiagnostic(user, 'consumer-math');
    } finally {
      await Problem.updateMany({}, { $set: { isActive: true } });
    }
    expect(card.type).toBe('starting-point');
    expect(card.blocking).toBe(false);
    await Problem.updateMany({}, { $set: { isActive: false } });
    service._resetCache();

    // …and once the student has a current Starting Point, there is nothing left to ask.
    user.assessmentCompleted = true;
    user.assessmentExpiresAt = new Date(Date.now() + 86400000);
    try {
      expect(await buildCourseDiagnostic(user, 'consumer-math')).toBeNull();
    } finally {
      await Problem.updateMany({}, { $set: { isActive: true } });
    }
  });

  test('a course the bank CAN test offers its own quick check', async () => {
    const user = await User.findById(currentUser._id);
    expect(await service.testableSkillCount('6th-grade-math')).toBeGreaterThanOrEqual(service.MIN_TESTABLE_SKILLS);
    expect((await buildCourseDiagnostic(user, '6th-grade-math')).type).toBe('course-preassessment');
  });

  test('parent guides are not placed', async () => {
    const parent = await User.create({
      username: `g${uniq()}`, email: `g${uniq()}@example.com`, firstName: 'Pat', lastName: 'G',
      role: 'parent', roles: ['parent'],
    });
    expect(await buildCourseDiagnostic(parent, 'parent-math-k2')).toBeNull();
  });

  test('every student course in the catalog resolves to a placement', async () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../public/resources');
    const user = await User.findById(currentUser._id);
    const kinds = {};
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-pathway.json'))) {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p.audience === 'parent') continue;
      const courseId = f.replace('-pathway.json', '');
      const card = await buildCourseDiagnostic(user, courseId);
      expect(card).toBeTruthy();
      expect(['course-preassessment', 'starting-point', 'act-practice', 'sat-practice']).toContain(card.type);
      kinds[courseId] = card.type;
    }
    expect(kinds['act-prep']).toBe('act-practice');
    expect(kinds['sat-prep']).toBe('sat-practice');
    expect(kinds['algebra-1']).toBe('starting-point');
  });
});
