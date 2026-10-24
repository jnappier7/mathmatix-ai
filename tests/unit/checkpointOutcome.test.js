/**
 * A missed checkpoint holds the module for review + retake.
 *
 * Owner decision, 2026-10-24 (course audit C01/C06): a failed checkpoint must
 * not unlock the next module. Show the score, review the missed skills, allow
 * a retake. Both checkpoint flows — in-chat (courseAdapter) and the
 * server-graded panel (routes/checkpoint.js) — settle through
 * utils/checkpointOutcome.js.
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../models/courseSession', () => ({ findById: jest.fn() }));
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const CourseSession = require('../../models/courseSession');
const outcome = require('../../utils/checkpointOutcome');
const { advanceCourseProgress } = require('../../utils/pipeline/courseAdapter');
const { buildCourseSystemPrompt } = require('../../utils/coursePrompt');

const T0 = new Date('2026-10-24T10:00:00Z').getTime();
const at = (min) => new Date(T0 + min * 60000);

const PROBLEMS = [
  { skill: 'counting-principles' }, { skill: 'counting-principles' },
  { skill: 'probability-rules' }, { skill: 'probability-rules' },
  { skill: 'binomial-probability' },
];
const MODULE_DATA = { type: 'assessment', title: 'Unit 9 Checkpoint', passThreshold: 70, assessmentProblems: PROBLEMS, scaffold: [] };

function session(overrides = {}) {
  return {
    _id: 'cs1',
    courseId: 'algebra-2',
    currentModuleId: 'checkpoint_u9',
    currentScaffoldIndex: 0,
    progressFloorPct: 0,
    overallProgress: 0,
    modules: [
      { moduleId: 'stats', status: 'completed', lessons: [] },
      { moduleId: 'checkpoint_u9', title: 'Unit 9 Checkpoint', status: 'in_progress', startedAt: at(0), lessons: [] },
      { moduleId: 'u10', status: 'locked', lessons: [] },
    ],
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function answers(results, startMin) {
  const msgs = [];
  results.forEach((r, i) => {
    msgs.push({ role: 'user', content: 'ans', timestamp: at(startMin + i) });
    msgs.push({ role: 'assistant', content: 'ok', problemResult: r, timestamp: at(startMin + i) });
  });
  return msgs;
}

const run = (cs, messages) => advanceCourseProgress({
  courseSession: cs, moduleData: MODULE_DATA, conversation: { messages }, wasCorrect: null, isCheckpoint: true,
});

describe('in-chat checkpoint', () => {
  test('a miss keeps the module, keeps the next one locked, and opens review with the missed skills', async () => {
    const cs = session();
    // 2/5 = 40%: both probability-rules items and the binomial item missed
    const { courseProgressUpdate } = await run(cs, answers(['correct', 'correct', 'incorrect', 'incorrect', 'incorrect'], 1));

    expect(courseProgressUpdate.event).toBe('checkpoint_failed');
    expect(courseProgressUpdate.score).toBe(40);
    expect(courseProgressUpdate.missedSkills).toEqual(['probability-rules', 'binomial-probability']);
    expect(cs.currentModuleId).toBe('checkpoint_u9');
    expect(cs.modules[1].status).toBe('in_progress');
    expect(cs.modules[1].checkpointPassed).toBe(false);
    expect(cs.modules[1].checkpointAttempts).toBe(1);
    expect(cs.modules[1].checkpointReview.active).toBe(true);
    expect(cs.modules[2].status).toBe('locked');
  });

  test('during review, practice answers never complete or fail the checkpoint', async () => {
    const cs = session();
    cs.modules[1].checkpointReview = { active: true, score: 40, passThreshold: 70, missedSkills: ['probability-rules'] };
    const { courseProgressUpdate } = await run(cs, answers(['correct', 'correct', 'correct', 'correct', 'correct'], 10));
    expect(courseProgressUpdate).toBeNull();
    expect(cs.modules[1].status).toBe('in_progress');
    expect(cs.modules[2].status).toBe('locked');
  });

  test('a retake counts only answers given after it starts, and a pass completes the module', async () => {
    const cs = session();
    cs.modules[1].checkpointReview = { active: true, score: 40, passThreshold: 70 };
    cs.modules[1].checkpointAttempts = 1;
    // failed attempt + review practice, all before the retake
    const before = answers(['correct', 'correct', 'incorrect', 'incorrect', 'incorrect', 'correct', 'correct'], 1);

    jest.useFakeTimers().setSystemTime(at(30));
    expect(outcome.beginCheckpointRetake(cs)).toBe(true);
    jest.useRealTimers();
    expect(cs.modules[1].checkpointReview).toBeUndefined();

    // one retake answer: not finished, nothing settles
    let res = await run(cs, [...before, ...answers(['correct'], 31)]);
    expect(res.courseProgressUpdate).toBeNull();

    res = await run(cs, [...before, ...answers(['correct', 'correct', 'correct', 'correct', 'incorrect'], 31)]);
    expect(res.courseProgressUpdate.event).toBe('module_complete');
    expect(cs.modules[1].checkpointScore).toBe(80);
    expect(cs.modules[1].checkpointPassed).toBe(true);
    expect(cs.modules[1].checkpointAttempts).toBe(2);
    expect(cs.currentModuleId).toBe('u10');
  });

  test('a missed test-out returns the student where they were, with no review state', async () => {
    const cs = session({
      currentModuleId: 'checkpoint_u9',
      checkpointState: {
        moduleId: 'checkpoint_u9', startedAt: at(0),
        testOutFrom: { moduleId: 'stats', scaffoldIndex: 3, checkpointPrevStatus: 'locked' },
      },
    });
    cs.modules[0].status = 'in_progress';
    const { courseProgressUpdate } = await run(cs, answers(['incorrect', 'incorrect', 'correct', 'incorrect', 'incorrect'], 1));
    expect(courseProgressUpdate.event).toBe('checkpoint_failed');
    expect(courseProgressUpdate.testOut).toBe(true);
    expect(cs.currentModuleId).toBe('stats');
    expect(cs.currentScaffoldIndex).toBe(3);
    expect(cs.modules[1].status).toBe('locked');
    expect(cs.modules[1].checkpointReview).toBeUndefined();
  });
});

describe('retake requests', () => {
  test.each([
    ['retake', true], ['Can I retake the checkpoint?', true], ["I'm ready to take the test again", true],
    ['re-do the checkpoint', true], ['take it again', true],
    ['what is a permutation?', false], ['I take the bus', false],
  ])('%s → %s', (text, expected) => {
    expect(outcome.isRetakeRequest(text)).toBe(expected);
  });
});

describe('tutor prompt during review', () => {
  test('reteaches the missed skills by name, not by storage id, and does not administer the checkpoint', () => {
    const cs = session();
    cs.modules[1].checkpointReview = { active: true, score: 40, passThreshold: 70, missedSkills: ['probability-rules'] };
    const prompt = buildCourseSystemPrompt({
      userProfile: { firstName: 'Ava' }, tutorProfile: { name: 'Bob' }, courseSession: cs,
      pathway: { track: 'Algebra 2' }, scaffoldData: MODULE_DATA, currentModule: { title: 'Unit 9 Checkpoint', isCheckpoint: true },
    });
    expect(prompt).toMatch(/CHECKPOINT REVIEW/);
    expect(prompt).toMatch(/Probability Rules/);
    expect(prompt).not.toMatch(/probability-rules/);
    expect(prompt).not.toMatch(/CHECKPOINT MODE — ASSESSMENT/);
  });
});

describe('checkpoint panel /complete', () => {
  function app(cs) {
    CourseSession.findById.mockResolvedValue(cs);
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { req.user = { _id: 'u1', firstName: 'Ava', activeCourseSessionId: 'cs1' }; next(); });
    a.use('/api/checkpoint', require('../../routes/checkpoint'));
    return a;
  }
  const resp = (skill, correct, points = 10) => ({ skill, correct, points, earnedPoints: correct ? points : 0 });

  test('a miss holds the module and returns the review', async () => {
    const cs = session({
      checkpointState: { moduleId: 'checkpoint_u9', startedAt: at(0), responses: [
        resp('counting-principles', true), resp('probability-rules', false), resp('probability-rules', false),
      ] },
    });
    const res = await request(app(cs)).post('/api/checkpoint/complete').expect(200);
    expect(res.body.passed).toBe(false);
    expect(res.body.summary.scorePercent).toBe(33);
    expect(res.body.review.missedSkills).toEqual(['probability-rules']);
    expect(cs.currentModuleId).toBe('checkpoint_u9');
    expect(cs.modules[1].status).toBe('in_progress');
    expect(cs.modules[1].checkpointReview.active).toBe(true);
    expect(cs.modules[2].status).toBe('locked');
    expect(cs.checkpointState).toBeNull();
  });

  test('a pass completes and unlocks the next module', async () => {
    const cs = session({
      checkpointState: { moduleId: 'checkpoint_u9', startedAt: at(0), responses: [
        resp('counting-principles', true), resp('probability-rules', true), resp('probability-rules', false),
        resp('binomial-probability', true),
      ] },
    });
    const res = await request(app(cs)).post('/api/checkpoint/complete').expect(200);
    expect(res.body.summary.passed).toBe(true);
    expect(cs.modules[1].status).toBe('completed');
    expect(cs.modules[1].checkpointPassed).toBe(true);
    expect(cs.currentModuleId).toBe('u10');
  });
});
