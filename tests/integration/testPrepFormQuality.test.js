/**
 * Practice-test forms after the 2026-10-13 QA pass (Phase 5: content and
 * assembly), pinned against the REAL banks.
 *
 *   1. Repetition. Every repeat across a guest's PSAT retakes was in Module 2:
 *      "Kavi's marathon" sat on 7 of 7 forms, f(x) = 4x − 9 → f(5) on 6.
 *      Module 2 now reads the server's own guest record, as /start does; the
 *      record spans the tests that share a bank (SAT↔PSAT, ACT↔PreACT); one
 *      cookie serves every guest rail.
 *   2. Templates. One item per template per form (light-travel sat at Q17
 *      and Q20 of one ACT form), and a retake avoids templates the student
 *      has already met — never at the cost of a gap.
 *   3. Exhaustion. A student who has seen every eligible item gets the least
 *      recently seen one, counted in coverage.reused, instead of a short form.
 *   4. Routes. The harder Module 2 never draws below its band, the easier
 *      never above (the harder module held f(5)-level items).
 *   5. Answer positions. ~25% per letter, no run of more than 3 keys on one
 *      letter, numeric choices still ascending, and grading unchanged.
 *   6. PreACT scope. No rational-function asymptotes, no f(−x).
 */

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => next(),
  isAdmin: (req, _res, next) => next(),
  isTeacher: (req, _res, next) => next(),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const cookieParser = require('cookie-parser');
const supertest = require('supertest');

const Problem = require('../../models/problem');
const ActTestSession = require('../../models/actTestSession');
const { useTest, getTestDef } = require('../../utils/practiceTests');
const { moduleBlueprint } = require('../../utils/testModules');
const { assembleForm, templateFamily, inBlueprintScope } = require('../../utils/actTestAssembler');
const { sortValues, isMonotonic } = require('../../utils/actChoiceOrder');
const { correctOptionIndex } = require('../../utils/distractorQuality');
const { normalizeOptions } = require('../../utils/mcOptions');

const SAT_ITEMS = require('../../seeds/sat-items.generated.json');
const ACT_ITEMS = [
  ...require('../../seeds/act-fable-items.generated.json'),
  ...require('../../seeds/act-ies-expansion/ies-items.generated.json'),
  ...require('../../seeds/act-enhanced/act-items.generated.json'),
  ...require('../../seeds/act-visual/act-visual-items.generated.json'),
  ...require('../../seeds/act-reasoning/act-reasoning-items.generated.json'),
  ...require('../../seeds/act-sets/act-set-items.generated.json'),
];
const BANK = new Map([...SAT_ITEMS, ...ACT_ITEMS].map((p) => [p.problemId, p]));
const keyTextOf = (problemId) => {
  const p = BANK.get(problemId);
  const i = p && correctOptionIndex(p);
  return i == null ? null : normalizeOptions(p.options)[i].text;
};

let mem; let app;
const USER_ID = new mongoose.Types.ObjectId();
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany([...SAT_ITEMS, ...ACT_ITEMS], { ordered: false });
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  const routes = require('../../routes/actTest');
  app.use('/api/sat-practice', useTest('sat-math'), routes.guestRouter);
  app.use('/api/psat-practice', useTest('psat-math'), routes.guestRouter);
  app.use('/api/act-test', (req, _res, next) => { req.user = { _id: USER_ID }; next(); }, routes);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

/** One whole guest test through both modules; the agent keeps the cookie, like a browser. */
async function guestTest(agent, rail) {
  const start = await agent.post(`/api/${rail}/start`).send({});   // no `previous`: storage was cleared
  expect(start.status).toBe(200);
  const sid = String(start.body.sessionId);
  const next = await agent.post(`/api/${rail}/next-module`)
    .set('X-Act-Guest-Token', start.body.guestToken).send({ sessionId: sid, answers: [] });
  expect(next.status).toBe(200);
  const s = await ActTestSession.findById(sid).lean();
  return s.items.map((it) => it.problemId);
}

describe('repetition across retakes', () => {
  afterEach(async () => { await ActTestSession.deleteMany({}); });

  test('a guest\'s PSAT retakes repeat nothing — Module 2 included — with no list from the browser', async () => {
    const agent = supertest.agent(app);
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      const ids = await guestTest(agent, 'psat-practice');
      expect(ids).toHaveLength(44);
      expect(ids.filter((id) => seen.has(id))).toEqual([]);
      ids.forEach((id) => seen.add(id));
    }
  }, 120000);

  test('the SAT and the PSAT share a bank, so a PSAT after an SAT repeats none of it', async () => {
    const agent = supertest.agent(app);
    const sat = new Set(await guestTest(agent, 'sat-practice'));
    const psat = await guestTest(agent, 'psat-practice');
    expect(psat.filter((id) => sat.has(id))).toEqual([]);
  }, 120000);
});

describe('templates', () => {
  const ACT = getTestDef('act-math').blueprint;
  const named = (ids) => ids.map((id) => templateFamily(BANK.get(id))).filter((f) => /^act-(reasoning|visual|set):/.test(f));
  const dupFamilies = (items) => {
    // Members of one shared-stimulus set are one template by design.
    const fams = items.filter((it) => !it.setId).map((it) => templateFamily(BANK.get(it.problemId)));
    return fams.filter((f, i) => fams.indexOf(f) !== i);
  };

  test('one item per template per form', async () => {
    for (let i = 0; i < 12; i++) {
      const form = await assembleForm({ blueprint: ACT, seed: `tpl-${i}` });
      expect(form.items).toHaveLength(45);
      expect(dupFamilies(form.items)).toEqual([]);
    }
  }, 120000);

  test('a retake avoids the templates of the last form', async () => {
    for (let i = 0; i < 4; i++) {
      const first = await assembleForm({ blueprint: ACT, seed: `tpl-a-${i}` });
      const ids = first.items.map((x) => x.problemId);
      const retake = await assembleForm({ blueprint: ACT, seed: `tpl-b-${i}`, excludeIds: ids });
      expect(retake.gaps).toEqual([]);
      const before = new Set(named(ids));
      expect(named(retake.items.map((x) => x.problemId)).filter((f) => before.has(f))).toEqual([]);
    }
  }, 120000);
});

describe('an exhausted pool', () => {
  const TINY = {
    testId: 'tiny', title: 'T', totalItems: 4, timeLimitMinutes: 10,
    categoryWeights: { c: 4 }, skillsByCategory: { c: ['ex-skill'] },
    difficultyRamp: [{ fromPosition: 1, toPosition: 4, targetDifficulty: 3 }],
    sources: ['ex-test'],
  };
  beforeAll(async () => {
    const docs = [];
    const words = ['apples', 'trains', 'ladders', 'rivers', 'clocks', 'candles'];
    words.forEach((w, i) => docs.push({
      problemId: `ex-${i}`, skillId: 'ex-skill', prompt: `How many ${w} are in the picture of ${w}?`,
      answer: { value: '1' }, answerType: 'multiple-choice',
      options: [{ label: 'A', text: 'red' }, { label: 'B', text: 'blue' }, { label: 'C', text: 'green' }, { label: 'D', text: 'gold' }],
      correctOption: 'A', difficulty: 3, isActive: true, source: 'ex-test',
    }));
    await Problem.insertMany(docs);
  });

  test('reuses the least recently seen items instead of leaving gaps, and says so', async () => {
    const seenAt = { 'ex-0': 5, 'ex-1': 1, 'ex-2': 4, 'ex-3': 2, 'ex-4': 6, 'ex-5': 3 };
    const all = Object.keys(seenAt);
    const strict = await assembleForm({ blueprint: TINY, seed: 'ex', excludeIds: all });
    expect(strict.items).toHaveLength(0);               // the default is unchanged: no reuse
    const form = await assembleForm({ blueprint: TINY, seed: 'ex', excludeIds: all, seenAt, reuseSeen: true });
    expect(form.items).toHaveLength(4);
    expect(form.coverage.reused).toBe(4);
    expect(form.items.map((x) => x.problemId).sort()).toEqual(['ex-1', 'ex-2', 'ex-3', 'ex-5']);
  });

  test('never reuses an item from earlier in the same sitting', async () => {
    const seenAt = { 'ex-0': 1, 'ex-1': 2, 'ex-2': 3, 'ex-3': 4, 'ex-4': 5, 'ex-5': 6 };
    const form = await assembleForm({
      blueprint: TINY, seed: 'ex2', excludeIds: Object.keys(seenAt), seenAt, reuseSeen: true, neverReuse: ['ex-0', 'ex-1'],
    });
    expect(form.items.map((x) => x.problemId)).not.toEqual(expect.arrayContaining(['ex-0']));
    expect(form.items.map((x) => x.problemId)).not.toEqual(expect.arrayContaining(['ex-1']));
  });
});

describe('adaptive routes', () => {
  test.each(['sat-math', 'psat-math'])('%s: the harder Module 2 never dips below its band, the easier never rises above it', async (testId) => {
    const bp = getTestDef(testId).blueprint;
    for (let i = 0; i < 6; i++) {
      for (const route of ['harder', 'easier']) {
        const mbp = moduleBlueprint(bp, 2, route);
        const form = await assembleForm({ blueprint: mbp, seed: `${testId}-${route}-${i}` });
        expect(form.items).toHaveLength(22);
        form.items.forEach((it) => {
          expect(it.difficulty).toBeGreaterThanOrEqual(mbp.difficultyBand.min);
          expect(it.difficulty).toBeLessThanOrEqual(mbp.difficultyBand.max);
        });
      }
    }
    // The f(5) item is difficulty 2: easier-route material only.
    expect(BANK.get('sat-math-w5q3').difficulty).toBeLessThan(moduleBlueprint(bp, 2, 'harder').difficultyBand.min);
  }, 120000);
});

describe('answer positions', () => {
  const run = (keys) => keys.reduce((acc, k, i) => {
    const r = i && keys[i - 1] === k ? acc.cur + 1 : 1;
    return { cur: r, max: Math.max(acc.max, r) };
  }, { cur: 0, max: 0 }).max;

  test.each([['act-math', 45], ['preact-math', 36]])('%s forms are balanced, with no run past 3', async (testId, n) => {
    const bp = getTestDef(testId).blueprint;
    const totals = [0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      const form = await assembleForm({ blueprint: bp, seed: `bal-${testId}-${i}` });
      expect(form.items).toHaveLength(n);
      const keys = form.items.map((it) => it.options.findIndex((o) => o.text === keyTextOf(it.problemId)));
      expect(keys.every((k) => k >= 0)).toBe(true);
      expect(run(keys)).toBeLessThanOrEqual(3);
      const counts = [0, 0, 0, 0];
      keys.forEach((k) => { counts[k] += 1; totals[k] += 1; });
      counts.forEach((c) => expect(c / n).toBeLessThanOrEqual(0.36));
      // Numeric choices keep their order (ascending as served, or as authored when already in order).
      form.items.forEach((it) => {
        const v = sortValues(it.options.map((o) => o.text));
        if (v) expect(isMonotonic(v)).toBe(true);
      });
    }
    const all = totals.reduce((a, b) => a + b, 0);
    totals.forEach((c) => {
      expect(c / all).toBeGreaterThan(0.18);
      expect(c / all).toBeLessThan(0.32);
    });
  }, 180000);
});

describe('a moved key still grades', () => {
  test('answering every key, by the letter it was SERVED at, scores a perfect paper', async () => {
    const start = await supertest(app).post('/api/act-test/start').send({ restart: true });
    expect(start.status).toBe(200);
    const sid = String(start.body.sessionId);
    const s = await ActTestSession.findById(sid).lean();
    let moved = 0;
    const answers = s.items.map((it) => {
      const label = it.options.find((o) => o.text === keyTextOf(it.problemId)).label;
      if (label !== BANK.get(it.problemId).correctOption) moved += 1;
      return { position: it.position, answer: label };
    });
    expect(moved).toBeGreaterThan(0);   // the balancer did move keys on this form
    const done = await supertest(app).post('/api/act-test/complete').send({ sessionId: sid, answers });
    expect(done.status).toBe(200);
    expect(done.body.report.rawScore).toBe(s.items.length);
  }, 120000);
});

describe('PreACT scope', () => {
  test('no rational-function asymptotes and no f(−x) on a PreACT form; the ACT keeps them', async () => {
    const bp = getTestDef('preact-math').blueprint;
    const outOfScope = ACT_ITEMS.filter((p) => !inBlueprintScope(bp, p));
    expect(outOfScope.some((p) => /asymptote/i.test(p.prompt))).toBe(true);
    expect(outOfScope.some((p) => /f\(-x\)/.test(p.prompt))).toBe(true);
    expect(inBlueprintScope(getTestDef('act-math').blueprint, outOfScope[0])).toBe(true);
    for (let i = 0; i < 12; i++) {
      const form = await assembleForm({ blueprint: bp, seed: `scope-${i}` });
      form.items.forEach((it) => {
        expect(it.content).not.toMatch(/asymptot/i);
        expect(it.content).not.toMatch(/f\(\s*[−-]\s*x\s*\)/);
      });
    }
  }, 120000);
});
