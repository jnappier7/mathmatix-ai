// tests/integration/startSkillRoute.test.js
//
// POST /api/mastery/start-skill — "I pick this one", through the route.
//
// This endpoint is the wire that was never run. The skill map's "Learn it"
// rung and its available-now list have navigated to `/chat.html?skill=<id>`
// since the board shipped, and nothing on either side read that parameter: a
// student chose a skill, landed in chat, and got a generic greeting. The
// placement ladder is now a chooser too, so this route is what every "start
// this skill" affordance in the product goes through.
//
// What is pinned here is the refusal surface. A chooser must never offer a
// route the server then rejects, and it must never quietly teach a student
// something they were already credited with:
//
//   locked   -> 409, with what is in the way
//   owned    -> 409, and cleared-from-above says "prove it instead"
//   open     -> 200, and the tutor's target is set EXPLICITLY (a stale target
//               from last session outranks any queue entry, so seeding only
//               the priority queue would strand the student on old work)
//
// Models are mocked — no MongoDB.

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
  isStudent: (req, _res, next) => next(),
  aiEndpointLimiter: (req, _res, next) => next(),
}));

jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/skill', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../../models/problem', () => ({ findOne: jest.fn(), find: jest.fn(), countDocuments: jest.fn() }));

// The route reads the catalog through configCache, which is right for a
// read-only check but would otherwise carry one test's catalog into the next.
jest.mock('../../utils/cache', () => ({
  configCache: { getOrSet: (_key, loader) => loader() },
  __esModule: true,
}));

jest.mock('../../utils/tutorPlanManager', () => ({
  loadOrCreatePlan: jest.fn(),
  addSkillToFocus: jest.fn((plan, data) => { plan.skillFocus.push(data); return plan; }),
  resolveCurrentTarget: jest.fn(),
  updatePlanAfterInteraction: jest.fn(),
  advanceInstructionPhase: jest.fn(),
  recentPracticeSkillId: jest.fn(),
}));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const Skill = require('../../models/skill');
const { loadOrCreatePlan, addSkillToFocus } = require('../../utils/tutorPlanManager');
const masteryRoutes = require('../../routes/mastery');

const STUDENT_ID = '507f1f77bcf86cd799439011';

// MS.PRP.1 -> ALG1.PRP.2 -> ALG1.FNC.1, plus a sibling at the floor.
const CATALOG = [
  { skillId: 'MS.PRP.1', displayName: 'Unit rate', studentLabel: 'unit rate', strand: 'PRP', courseLevel: 'MS', prerequisites: [] },
  { skillId: 'MS.QNT.1', displayName: 'Integer operations', studentLabel: 'integer ops', strand: 'QNT', courseLevel: 'MS', prerequisites: [] },
  { skillId: 'ALG1.PRP.2', displayName: 'Slope as a rate', studentLabel: 'slope as a rate', strand: 'PRP', courseLevel: 'ALG1', prerequisites: ['MS.PRP.1'] },
  { skillId: 'ALG1.FNC.1', displayName: 'Linear functions', studentLabel: 'linear functions', strand: 'FNC', courseLevel: 'ALG1', prerequisites: ['ALG1.PRP.2'] },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: STUDENT_ID, roles: ['student'] };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/mastery', masteryRoutes);
  return app;
}

function stubCatalog(docs) {
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

function student(skillMastery = new Map()) {
  const user = { _id: STUDENT_ID, skillMastery, save: jest.fn().mockResolvedValue(true) };
  User.findById.mockResolvedValue(user);
  return user;
}

function stubPlan() {
  const plan = {
    skillFocus: [],
    currentTarget: null,
    save: jest.fn().mockResolvedValue(true),
  };
  loadOrCreatePlan.mockResolvedValue(plan);
  return plan;
}

const proved = { rung: 'proved', provenBy: 'placement' };
const cleared = { rung: 'proved', provenBy: 'inference' };

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
  stubCatalog(CATALOG);
});

describe('POST /api/mastery/start-skill — the student picks', () => {
  test('an open skill sets the tutor on it and says so', async () => {
    student();
    const plan = stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, skillId: 'MS.PRP.1', state: 'open' });
    // The name the student reads, not the catalog's formal one.
    expect(res.body.label).toBe('unit rate');
    expect(plan.save).toHaveBeenCalled();
  });

  test('currentTarget is set EXPLICITLY, overriding whatever the plan was on', async () => {
    student();
    const plan = stubPlan();
    plan.currentTarget = { skillId: 'SOME.OLD.SKILL', displayName: 'last week' };

    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.QNT.1' })
      .expect(200);

    // resolveCurrentTarget prefers an existing currentTarget over the priority
    // queue, so seeding only the queue would leave the student on last week's
    // skill no matter how high the new entry ranked.
    expect(plan.currentTarget.skillId).toBe('MS.QNT.1');
    expect(plan.currentTarget.displayName).toBe('integer ops');
  });

  test('the chosen skill goes to the top of the focus queue', async () => {
    student();
    const plan = stubPlan();

    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(200);

    expect(addSkillToFocus).toHaveBeenCalled();
    const entry = plan.skillFocus[0];
    expect(entry.skillId).toBe('MS.PRP.1');
    // A skill the student asked for outranks anything the system inferred.
    expect(entry.priority).toBe(10);
  });

  test('a skill already underway resumes rather than restarting', async () => {
    student(new Map([['MS.PRP.1', { rung: 'learned' }]]));
    stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(200);

    expect(res.body.state).toBe('learned');
  });

  test('a locked skill is refused, and says what is in the way', async () => {
    student();
    stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'ALG1.FNC.1' })
      .expect(409);

    expect(res.body.error).toBe('Locked');
    // Named the way the student reads them, so the refusal is actionable.
    expect(res.body.prerequisites).toEqual(['slope as a rate']);
  });

  test('a skill the student already proved is refused', async () => {
    student(new Map([['MS.PRP.1', proved]]));
    stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(409);

    expect(res.body.error).toBe('Already owned');
  });

  test('a skill cleared from above sends them to prove it, not to a lesson', async () => {
    student(new Map([['MS.PRP.1', cleared]]));
    stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(409);

    // Teaching it again would walk a student through work the cascade already
    // credited them for; proving it directly is the only honest next step.
    expect(res.body.proveInstead).toBe(true);
    expect(res.body.reason).toMatch(/prove it directly/i);
  });

  test('a refused pick never touches the tutor plan', async () => {
    student();
    const plan = stubPlan();

    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'ALG1.FNC.1' })
      .expect(409);

    expect(plan.save).not.toHaveBeenCalled();
    expect(plan.currentTarget).toBeNull();
  });

  test('an unknown skill 404s', async () => {
    student();
    stubPlan();

    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'NOT.A.SKILL' })
      .expect(404);
  });

  test('a missing skillId is a 400, not a crash', async () => {
    student();
    stubPlan();

    await supertest(app).post('/api/mastery/start-skill').send({}).expect(400);
    await supertest(app).post('/api/mastery/start-skill').send({ skillId: 42 }).expect(400);
  });

  test('an unseeded catalog says so rather than 404ing every skill', async () => {
    stubCatalog([]);
    student();
    stubPlan();

    const res = await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'MS.PRP.1' })
      .expect(503);

    expect(res.body.error).toMatch(/catalog/i);
  });

  test('proving a prerequisite makes the next skill choosable', async () => {
    student();
    stubPlan();
    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'ALG1.PRP.2' })
      .expect(409); // locked behind MS.PRP.1

    student(new Map([['MS.PRP.1', proved]]));
    stubPlan();
    await supertest(app)
      .post('/api/mastery/start-skill')
      .send({ skillId: 'ALG1.PRP.2' })
      .expect(200);
  });
});
