/**
 * The skill bank over HTTP (routes/liveDrill.js + utils/liveDrill/catalog.js): any catalog skill
 * searched, browsed, dealt, played against the computer, filed to a student's account, and hosted
 * as a class game — through the same public solo routes the course drills use.
 */
jest.mock('../../utils/skillCanonicalizer', () => ({ skillLookupCandidates: (id) => [id] }));
jest.mock('../../models/enrollmentCode', () => {
  const chain = (v) => ({ lean: () => Promise.resolve(v), sort: () => chain(v) });
  return { find: () => chain([]), findOne: () => chain(null) };
});
jest.mock('../../models/drillResult', () => {
  const ROWS = [];
  const chain = (v) => ({ lean: () => Promise.resolve(v), sort: () => chain(v) });
  return {
    _rows: ROWS,
    create: async (row) => { ROWS.push({ ...row }); return row; },
    findOne: (q) => chain([...ROWS].filter((r) => String(r.userId) === String(q.userId) && r.drill === q.drill).sort((a, b) => b.score - a.score)[0] || null),
    countDocuments: async () => ROWS.length,
  };
});
jest.mock('../../models/user', () => {
  const chain = (v) => ({ lean: () => Promise.resolve(v), sort: () => chain(v), select: () => chain(v) });
  return { find: () => chain([]), findOne: () => chain(null), findById: () => chain(null) };
});
const express = require('express');
const supertest = require('supertest');
const G = require('../../utils/liveDrill/games');
const catalog = require('../../utils/liveDrill/catalog');
const DrillResult = require('../../models/drillResult');
const { hostRouter, playRouter, soloRouter } = require('../../routes/liveDrill');

const chain = (v) => ({ select: () => chain(v), limit: () => chain(v), lean: () => Promise.resolve(v) });
const SKILLS = [
  { skillId: 'two-step-equations', displayName: 'Two-Step Equations', studentLabel: 'Two-step equations', description: 'Solve ax + b = c.', category: 'equations', courseLevel: 'MS' },
  { skillId: 'thin-skill', displayName: 'Thin Skill', description: 'Too few items.', category: 'equations', gradeBand: '5-8' },
];
const mc = (id, skillId, i) => ({
  _id: id, problemId: id, skillId, isActive: true, difficulty: 1 + (i % 5), prompt: `Solve 2x + ${i} = ${2 * i + 4}.`, explanation: 'Undo.',
  options: [{ label: 'A', text: `${i + 2}` }, { label: 'B', text: `${i}` }, { label: 'C', text: `${i + 1}` }, { label: 'D', text: `${i + 3}` }], correctOption: 'A', answer: { value: `${i + 2}` },
});
const PROBLEMS = [...Array.from({ length: 10 }, (_, i) => mc(`p${i}`, 'two-step-equations', i)), mc('x0', 'thin-skill', 0)];
catalog._setModels({
  Skill: { find: () => chain(SKILLS) },
  Problem: {
    aggregate: async () => [{ _id: 'two-step-equations', n: 10 }, { _id: 'thin-skill', n: 1 }],
    find: (q) => chain(PROBLEMS.filter((p) => q.skillId.$in.includes(p.skillId))),
  },
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/live-drill/host', (req, _res, next) => { req.user = { _id: 'teacher-1', firstName: 'Jason', lastName: 'N' }; next(); }, hostRouter);
  app.use('/api/live-drill/play', (req, _res, next) => {
    const stu = req.get('X-Test-Student');
    if (stu) { req.user = { _id: stu, roles: ['student'], firstName: 'Marcus', lastName: 'Thompson' }; req.isAuthenticated = () => true; }
    next();
  }, playRouter);
  app.use('/api/live-drill/solo', (req, _res, next) => {
    const stu = req.get('X-Test-Student');
    if (stu) { req.user = { _id: stu, roles: ['student'], firstName: 'Marcus', lastName: 'Thompson' }; req.isAuthenticated = () => true; }
    next();
  }, soloRouter);
  return app;
}

const D = 'skill:two-step-equations';
const req = supertest(makeApp());
afterEach(() => { G._reset(); });
afterAll(() => { catalog._reset(); });

describe('the skill bank over HTTP', () => {
  test('search answers with skills beside the course drills; browse lists the bank by level', async () => {
    const r = await req.get('/api/live-drill/solo/search?q=two%20step');
    expect(r.status).toBe(200);
    expect(r.body.skills.map((k) => k.drill)).toEqual([D]);
    expect(r.body.skills[0]).toMatchObject({ name: 'Two-step equations', items: 10, url: '/drill/skills?skill=two-step-equations' });
    expect(Array.isArray(r.body.results)).toBe(true);
    const b = await req.get('/api/live-drill/solo/skills');
    expect(b.status).toBe(200);
    expect(b.body.skills).toBe(1);
    expect(b.body.levels[0]).toMatchObject({ id: 'ms', title: 'Middle school' });
    expect(b.body.levels[0].categories[0].skills[0].skillId).toBe('two-step-equations');
  });

  test('a skill is a hub of its own: /hubs/skills?skill= gives one game; an unknown or thin skill is 404', async () => {
    const r = await req.get('/api/live-drill/solo/hubs/skills?skill=two-step-equations');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'skills', title: 'Two-step equations' });
    expect(r.body.games).toHaveLength(1);
    expect(r.body.games[0]).toMatchObject({ drill: D, arena: false });
    expect(r.body.games[0].playbooks[0].key).toBe('all');
    expect((await req.get('/api/live-drill/solo/hubs/skills?skill=thin-skill')).status).toBe(404);
    expect((await req.get('/api/live-drill/solo/hubs/skills?skill=nope')).status).toBe(404);
    expect((await req.get('/api/live-drill/solo/hubs/skills')).status).toBe(404);
  });

  test('plays are dealt for a skill drill, the same for the same seed, answers included (solo practice is client-scored)', async () => {
    const q = `/api/live-drill/solo/plays?drill=${encodeURIComponent(D)}&book=all&seed=Abc12345`;
    const a = await req.get(q);
    expect(a.status).toBe(200);
    expect(a.body.plays.length).toBeGreaterThan(10);
    expect(a.body.plays[0]).toMatchObject({ head: 'Pick the answer.' });
    expect(a.body.plays[0].choices.map((c) => c.k)).toEqual(['A', 'B', 'C', 'D']);
    expect(a.body.plays[0].answer).toMatch(/^[A-D]$/);
    expect((await req.get(q)).body).toEqual(a.body);
    expect((await req.get('/api/live-drill/solo/plays?drill=skill:nope&book=all&seed=Abc12345')).status).toBe(400);
  });

  test('a signed-in student\'s round on a skill is filed under the skills hub; a guest\'s is not', async () => {
    const body = { hub: 'skills', drill: D, book: 'all', seconds: 120, score: 40, right: 8, attempted: 10, streak: 4 };
    expect((await req.post('/api/live-drill/solo/result').send(body)).status).toBe(401);
    const r = await req.post('/api/live-drill/solo/result').set('X-Test-Student', 'stu-1').send(body);
    expect(r.status).toBe(200);
    expect(r.body.saved).toBe(true);
    expect(DrillResult._rows[0]).toMatchObject({ hub: 'skills', drill: D, playbook: 'all', score: 40 });
    expect((await req.post('/api/live-drill/solo/result').set('X-Test-Student', 'stu-1').send({ ...body, drill: 'skill:nope' })).status).toBe(400);
    const me = await req.get(`/api/live-drill/solo/me?drill=${encodeURIComponent(D)}&book=all&seconds=120`).set('X-Test-Student', 'stu-1');
    expect(me.body.best).toMatchObject({ score: 40 });
  });

  test('every game can be played alone on a skill, against the computer, and the seat remembers the skill', async () => {
    for (const mode of ['drive', 'huddle', 'hill', 'heist']) {
      const r = await req.post('/api/live-drill/play/solo').send({ drill: D, book: 'all', mode, level: 'easy', device: 'device-abcdef12' });
      expect(r.status).toBe(201);
      const st = await req.get(`/api/live-drill/play/${r.body.code}/state`).set('X-Live-Drill-Token', r.body.token);
      expect(st.status).toBe(200);
      expect(st.body.solo).toMatchObject({ hub: 'skills', skill: 'two-step-equations' });
    }
    expect((await req.post('/api/live-drill/play/solo').send({ drill: D, book: 'all', mode: 'knockout', level: 'easy', device: 'device-abcdef12' })).status).toBe(400);
    expect((await req.post('/api/live-drill/play/solo').send({ drill: 'skill:nope', book: 'all', mode: 'heist', level: 'easy', device: 'device-abcdef12' })).status).toBe(400);
  });

  test('a teacher can host a class game on any skill in the bank', async () => {
    const r = await req.post('/api/live-drill/host/games').send({ drill: D, playbook: 'all', mode: 'huddle' });
    expect(r.status).toBe(201);
    expect(r.body.drill).toBe(D);
    expect((await req.post('/api/live-drill/host/games').send({ drill: 'skill:nope', playbook: 'all', mode: 'huddle' })).status).toBe(404);
  });
});
