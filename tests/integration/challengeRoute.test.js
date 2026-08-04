/**
 * The challenge (test-out) endpoints, against a real database.
 *
 * The two properties worth guarding here are security and payoff: the served
 * payload must never leak answers, a client that lies about correctness must
 * still be graded on its actual answers, and a genuine pass must cascade to the
 * prerequisites beneath the skill and survive a reload.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Skill = require('../../models/skill');
const Problem = require('../../models/problem');
const { getSkillMasteryEntry } = require('../../utils/masteryGuard');

let mem;
let app;
let currentUserId;
const SKILL = 'ALG1.PRP.2'; // Slope as rate — has real prerequisites beneath it

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  // Seed the unified catalog so the cascade has a real graph to walk.
  const SKILLS = require('../../seeds/skills-unified.json');
  await Skill.insertMany(
    SKILLS.map((s) => ({
      skillId: s.skillId,
      displayName: s.displayName,
      studentLabel: s.studentLabel,
      description: s.description,
      category: s.category,
      strand: s.strand,
      courseLevel: s.courseLevel,
      prerequisites: s.prerequisites,
      crossPrereqs: s.crossPrereqs,
      enables: s.enables,
      source: 'unified-taxonomy'
    }))
  );

  await Problem.insertMany(
    [1, 2, 3, 4, 5].map((n) => ({
      problemId: `chal-${n}`,
      skillId: SKILL,
      prompt: `What is ${n} + ${n}?`,
      answer: { type: 'exact', value: String(n * 2) },
      difficulty: 2
    }))
  );

  const router = require('../../routes/mastery');
  app = express();
  app.use(express.json());
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
  const u = await User.create({ username: `c${Date.now()}`, email: `c${Date.now()}@e.com`, firstName: 'C', lastName: 'C' });
  currentUserId = u._id;
});

afterEach(async () => { await User.deleteMany({}); });

const fetchChallenge = () => supertest(app).get(`/api/mastery/challenge/${SKILL}`);

describe('GET /challenge/:skillId', () => {
  test('serves problems without ever leaking the answers', async () => {
    const res = await fetchChallenge();
    expect(res.status).toBe(200);
    expect(res.body.problems.length).toBeGreaterThanOrEqual(4);
    const serialized = JSON.stringify(res.body);
    res.body.problems.forEach((p) => {
      expect(p.answer).toBeUndefined();
      expect(p.correctOption).toBeUndefined();
    });
    // the literal answers must not appear anywhere in the payload
    expect(serialized).not.toMatch(/"answer"\s*:/);
  });
});

describe('a skill whose items live under a crosswalked bank id', () => {
  // The owner's line: "I don't want students to be denied a test out on a
  // ladder skill because no items exist." Items often DO exist — under the
  // bank id a crosswalk row points to. The GET once sampled by the single
  // canonical id and 409'd ("Not enough problems") while hundreds of items
  // sat one alias away; the POST then filtered by the catalog doc's key and
  // would have graded an empty set. Both ends must use the candidate set.
  const COURSE_SKILL = 'g6-percent-intro';   // manual crosswalk → percent-of-a-number
  const BANK_ID = 'percent-of-a-number';

  beforeAll(async () => {
    await Skill.create({ skillId: COURSE_SKILL, displayName: 'Percent Intro', description: 'intro to percent', category: 'ratios-proportions' });
    await Problem.insertMany(
      [1, 2, 3, 4, 5].map((n) => ({
        problemId: `xwalk-${n}`,
        skillId: BANK_ID,
        prompt: `What is ${n * 10}% of 100?`,
        answer: { type: 'exact', value: String(n * 10) },
        difficulty: 2
      }))
    );
  });

  test('the test-out is served from the crosswalked bank and grades a pass', async () => {
    const got = await supertest(app).get(`/api/mastery/challenge/${COURSE_SKILL}`);
    expect(got.status).toBe(200);
    expect(got.body.problems.length).toBeGreaterThanOrEqual(4);

    const submissions = [];
    for (const p of got.body.problems) {
      const doc = await Problem.findById(p.problemId).lean();
      submissions.push({ problemId: p.problemId, answer: doc.answer.value });
    }
    const res = await supertest(app).post(`/api/mastery/challenge/${COURSE_SKILL}`).send({ submissions });
    expect(res.body.passed).toBe(true);
    expect(res.body.correct).toBe(submissions.length);
  });
});

describe('POST /challenge/:skillId', () => {
  const answersFor = (problems, fn) => problems.map((p) => ({
    problemId: p.problemId,
    answer: fn(p)
  }));

  const correctAnswerFor = async (problemId) => {
    const doc = await Problem.findById(problemId).lean();
    return doc.answer.value;
  };

  test('a clean run proves the skill and cascades beneath it', async () => {
    const served = (await fetchChallenge()).body.problems;
    const submissions = [];
    for (const p of served) submissions.push({ problemId: p.problemId, answer: await correctAnswerFor(p.problemId) });

    const res = await supertest(app).post(`/api/mastery/challenge/${SKILL}`).send({ submissions });

    expect(res.body).toMatchObject({ passed: true, rung: 'proved' });
    expect(res.body.clearedFromAbove).toContain('MS.PRP.3'); // unit rates, beneath slope

    const reloaded = await User.findById(currentUserId);
    expect(getSkillMasteryEntry(reloaded, SKILL).rung).toBe('proved');
    expect(getSkillMasteryEntry(reloaded, SKILL).provenBy).toBe('challenge');
    expect(getSkillMasteryEntry(reloaded, 'MS.PRP.3').provenBy).toBe('inference');
  });

  test('a client that claims correctness is still graded on its answers', async () => {
    const served = (await fetchChallenge()).body.problems;
    const lying = served.map((p) => ({ problemId: p.problemId, answer: 'definitely wrong', correct: true, isCorrect: true }));

    const res = await supertest(app).post(`/api/mastery/challenge/${SKILL}`).send({ submissions: lying });

    expect(res.body.passed).toBe(false);
    expect(res.body.correct).toBe(0);
    const reloaded = await User.findById(currentUserId);
    const entry = getSkillMasteryEntry(reloaded, SKILL);
    expect(entry === null || entry.rung !== 'proved').toBe(true);
  });

  test('failing costs nothing — the rung is untouched and the gap is named', async () => {
    const served = (await fetchChallenge()).body.problems;
    const submissions = answersFor(served, () => '0');

    const res = await supertest(app).post(`/api/mastery/challenge/${SKILL}`).send({ submissions });

    expect(res.body.passed).toBe(false);
    expect(res.body.missedProblemIds.length).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/gap/i);
  });

  test('a skill already proved is not offered a challenge', async () => {
    const served = (await fetchChallenge()).body.problems;
    const submissions = [];
    for (const p of served) submissions.push({ problemId: p.problemId, answer: await correctAnswerFor(p.problemId) });
    await supertest(app).post(`/api/mastery/challenge/${SKILL}`).send({ submissions });

    const again = await fetchChallenge();
    expect(again.status).toBe(409);
    expect(again.body.reason).toMatch(/already own/i);
  });
});
