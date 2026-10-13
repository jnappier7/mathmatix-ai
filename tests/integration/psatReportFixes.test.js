/**
 * Fixes from the external PSAT test report (2026-10-13), pinned.
 *
 *   1. The score scale is set from the form's own extremes: only a perfect
 *      harder-route paper reaches the top, every miss costs points, and a
 *      blank paper is the floor. (Two misses used to read 760 on the PSAT and
 *      0–4 misses 800 on the SAT, with the likely range collapsed away.)
 *   2. A guest's Module 2 is as fresh as Module 1: questions from this
 *      browser's earlier tests stay out of both. (Only Module 1 excluded them.)
 *   3. The outlier question carries its data: the claim that removing 180
 *      moves the mean more than the median follows from the stem alone.
 */

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const supertest = require('supertest');

const Problem = require('../../models/problem');
const ActTestSession = require('../../models/actTestSession');
const { useTest } = require('../../utils/practiceTests');
const { irtScaled, moduleBlueprint } = require('../../utils/testModules');
const { difficultyForPosition } = require('../../utils/actTestAssembler');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');

/** A 44-item form at the blueprint's own ramps: Module 1, then the routed Module 2. */
function form(bp, route) {
  const items = [];
  const m1 = moduleBlueprint(bp, 1);
  for (let p = 1; p <= 22; p++) items.push({ position: p, difficulty: difficultyForPosition(m1, p) });
  const m2 = moduleBlueprint(bp, 2, route);
  for (let p = 1; p <= 22; p++) items.push({ position: 22 + p, difficulty: difficultyForPosition(m2, p) });
  return items;
}
/** Score a form with `misses` wrong answers on its hardest questions. */
function score(bp, route, misses) {
  const items = form(bp, route);
  const responses = items.map((it, i) => ({ position: it.position, correct: i < items.length - misses }));
  return irtScaled(items, responses, bp);
}

describe.each([
  ['sat', require('../../seeds/sat-math-blueprint.json')],
  ['psat', require('../../seeds/psat-math-blueprint.json')],
])('the %s scale', (_name, bp) => {
  const { min, max } = bp.irtScale;

  test('only a perfect harder-route paper reaches the top, and every miss costs points', () => {
    expect(score(bp, 'harder', 0).scaled).toBe(max);
    let prev = max;
    for (const misses of [1, 2, 4]) {
      const s = score(bp, 'harder', misses).scaled;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  test('a near-perfect paper keeps a real likely range', () => {
    const r = score(bp, 'harder', 2);
    expect(r.range.low).toBeLessThan(r.range.high);
  });

  test('a blank paper is the floor', () => {
    expect(score(bp, 'easier', 44).scaled).toBe(min);
  });

  test('an easier route cannot reach the top', () => {
    expect(score(bp, 'easier', 0).scaled).toBeLessThan(max);
  });
});

describe('a guest\'s Module 2', () => {
  let mem; let app;
  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await Problem.insertMany(SAT_ITEMS);
    app = express();
    app.use(express.json());
    app.use('/api/psat-practice', useTest('psat-math'), require('../../routes/actTest').guestRouter);
  }, 60000);
  afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

  async function takeGuest(previous) {
    const start = await supertest(app).post('/api/psat-practice/start').send({ previous });
    expect(start.status).toBe(200);
    const sid = String(start.body.sessionId);
    const token = start.body.guestToken;
    const next = await supertest(app).post('/api/psat-practice/next-module')
      .set('X-Act-Guest-Token', token).send({ sessionId: sid, answers: [], previous });
    expect(next.status).toBe(200);
    const s = await ActTestSession.findById(sid).lean();
    return { sid, token, ids: s.items.map((it) => it.problemId), m2: s.items.filter((it) => it.module === 2).map((it) => it.problemId) };
  }

  test('keeps out every question this browser saw on an earlier test, in both modules', async () => {
    const first = await takeGuest([]);
    expect(first.m2.length).toBeGreaterThan(0);
    const second = await takeGuest([{ sessionId: first.sid, token: first.token }]);
    const before = new Set(first.ids);
    expect(second.ids.filter((id) => before.has(id))).toEqual([]);
    expect(second.m2.length).toBeGreaterThan(0);
  });
});

test('the outlier question gives the data its answer depends on', () => {
  const item = require('../../seeds/sat-math/sat_w3.json').items.find((it) => /hospital recorded the wait times/.test(it.stem));
  const nums = (item.stem.match(/:\s*([\d,\sand]+)\./) || [])[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(Number).filter(Number.isFinite);
  expect(nums).toHaveLength(15);
  const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length / 2; return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2; };
  expect(mean(nums)).toBe(42);
  expect(median(nums)).toBe(34);
  const rest = nums.filter((x) => x !== 180);
  expect(mean(nums) - mean(rest)).toBeGreaterThan(5 * (median(nums) - median(rest)));
});
