/**
 * utils/testPrepScores.js — the teacher's read of practice-test results.
 * Flagged attempts stay visible but never set "best", "change" or the class
 * average: a teacher must not plan around a score earned by clicking through.
 */
const TP = require('../../utils/testPrepScores');

const T0 = new Date('2026-10-01T15:00:00Z').getTime();
const MIN = 60000;
const responses = (n, correct, cat = 'algebra') => Array.from({ length: n }, (_, i) => ({ category: cat, correct: i < correct, answer: 'A' }));
const session = (o = {}) => ({
  _id: Math.random().toString(16).slice(2),
  testId: 'act-math', status: 'completed', timeLimitMinutes: 50,
  startedAt: new Date(T0), completedAt: new Date(T0 + 45 * MIN),
  items: Array.from({ length: 45 }, (_, i) => ({ position: i })),
  responses: responses(45, 30), rawScore: 30, scaledScore: 24, ...o,
});

describe('summarizeAttempt', () => {
  test('a full, honest attempt counts', () => {
    const a = TP.summarizeAttempt(session());
    expect(a).toMatchObject({ flags: [], countsTowardAverage: true, durationMinutes: 45, answered: 45, skippedCount: 0 });
    expect(a.byCategory.algebra).toEqual({ correct: 30, total: 45, label: expect.any(String) });
  });
  test('rushed (< 25% of the limit) is flagged and excluded', () => {
    const a = TP.summarizeAttempt(session({ completedAt: new Date(T0 + 6 * MIN) }));
    expect(a.flags).toContain('rushed');
    expect(a.countsTowardAverage).toBe(false);
  });
  test('5+ blank questions is unfinished', () => {
    const r = responses(45, 30).map((x, i) => (i < 6 ? { ...x, answer: '' } : x));
    const a = TP.summarizeAttempt(session({ responses: r }));
    expect(a.skippedCount).toBe(6);
    expect(a.flags).toContain('unfinished');
    expect(a.countsTowardAverage).toBe(false);
  });
  test('easier SAT route is flagged but still counts (real score, lower ceiling)', () => {
    const a = TP.summarizeAttempt(session({
      testId: 'sat-math', timeLimitMinutes: 35,
      modules: [{ n: 1, startedAt: new Date(T0) }, { n: 2, route: 'easier', startedAt: new Date(T0 + 34 * MIN) }],
      completedAt: new Date(T0 + 68 * MIN), scaledScore: 520,
    }));
    expect(a.flags).toEqual(['easier-route']);
    expect(a.countsTowardAverage).toBe(true);
    expect(a.moduleRoute).toBe('easier');
    // Whole-section clock, not Module 2's.
    expect(a.durationMinutes).toBe(68);
  });
});

describe('buildStudentExams', () => {
  test('best and change ignore flagged attempts; first/latest are literal', () => {
    const rushedHigh = TP.summarizeAttempt(session({ completedAt: new Date(T0 + 5 * MIN), scaledScore: 33 }));
    const base = TP.summarizeAttempt(session({ startedAt: new Date(T0 + 1e7), completedAt: new Date(T0 + 1e7 + 40 * MIN), scaledScore: 20 }));
    const later = TP.summarizeAttempt(session({ startedAt: new Date(T0 + 2e7), completedAt: new Date(T0 + 2e7 + 40 * MIN), scaledScore: 25 }));
    const e = TP.buildStudentExams([later, rushedHigh, base])['act-math'];
    expect(e.attemptCount).toBe(3);
    expect(e.first.scaledScore).toBe(33);
    expect(e.latest.scaledScore).toBe(25);
    expect(e.best.scaledScore).toBe(25);
    expect(e.change).toBe(5);
  });
});

describe('buildClassSummary', () => {
  const stu = (attempts) => ({ exams: TP.buildStudentExams(attempts) });
  test('average of each student\'s latest fair attempt; weakest category pooled', () => {
    const a = TP.summarizeAttempt(session({ scaledScore: 20, responses: [...responses(20, 15, 'algebra'), ...responses(25, 5, 'geometry')] }));
    const b = TP.summarizeAttempt(session({ scaledScore: 30, responses: [...responses(20, 18, 'algebra'), ...responses(25, 10, 'geometry')] }));
    const rushedOnly = TP.summarizeAttempt(session({ completedAt: new Date(T0 + 3 * MIN), scaledScore: 36 }));
    const s = TP.buildClassSummary([stu([a]), stu([b]), stu([rushedOnly]), stu([])], 'act-math');
    expect(s).toMatchObject({ studentsTested: 3, averagedOver: 2, excludedFlagged: 1, classAverage: 25, label: 'ACT' });
    expect(s.weakestCategory).toMatchObject({ key: 'geometry', pct: 30 });
  });
  test('nobody tested → empty, not zero', () => {
    expect(TP.buildClassSummary([{ exams: {} }], 'sat-math')).toMatchObject({ studentsTested: 0, classAverage: null, weakestCategory: null });
  });
});

describe('one rushed rule', () => {
  test('the student report route uses the same helper', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../routes/actTest.js'), 'utf8');
    expect(src).toMatch(/return isRushedSession\(session\);/);
  });
});

describe('likelyRange', () => {
  const { getTestDef } = require('../../utils/practiceTests');
  test('a band that already contains the score is kept', () => {
    expect(TP.likelyRange({ low: 22, high: 28 }, 25, getTestDef('act-math').blueprint)).toEqual({ low: 22, high: 28 });
  });
  test('an IRT score outside the raw band gets the same width, centred on it, on the scale\'s step', () => {
    const r = TP.likelyRange({ low: 480, high: 560 }, 640, getTestDef('sat-math').blueprint);
    expect(r).toEqual({ low: 600, high: 680 });
  });
  test('clamped to the scale', () => {
    expect(TP.likelyRange({ low: 16, high: 20 }, 36, getTestDef('act-math').blueprint)).toEqual({ low: 34, high: 36 });
  });
});

describe('Test Prep tab wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const read = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  test('tab exists, is a primary nav item, and its assets are bundled', () => {
    expect(read('public/teacher-dashboard.html')).toMatch(/data-tab="testprep"[\s\S]*id="testprep-tab"/);
    expect(read('public/js/teacher-home.js')).toMatch(/PRIMARY = \['today', 'students', 'classes', 'testprep'/);
    const m = JSON.parse(read('public/dist/page-bundles.manifest.json'))['teacher-dashboard.html'];
    expect(m.js.flatMap(b => b.files)).toContain('/js/teacher-testprep.js');
    expect(m.css.flatMap(b => b.files)).toContain('/css/teacher-testprep.css');
  });
  test('the client escapes names and never computes flags or averages itself', () => {
    const src = read('public/js/teacher-testprep.js');
    expect(src).toMatch(/esc\(s\.name\)/);
    expect(src).not.toMatch(/isRushed|0\.25|RUSHED_FRACTION/);
  });
  test('the API is mounted behind the teacher gate', () => {
    expect(read('config/routes.js')).toMatch(/app\.use\('\/api\/teacher\/test-prep', isAuthenticated, isTeacher, teacherTestPrepRoutes\)/);
  });
});

describe('assignmentStatus', () => {
  const at = new Date('2026-10-10T00:00:00Z');
  test('only attempts started on/after the assignment count; done beats in-progress', () => {
    expect(TP.assignmentStatus([{ status: 'completed', startedAt: new Date('2026-10-01'), completedAt: new Date('2026-10-01') }], at).status).toBe('not-started');
    expect(TP.assignmentStatus([{ status: 'in_progress', startedAt: new Date('2026-10-11') }], at).status).toBe('in-progress');
    expect(TP.assignmentStatus([
      { status: 'completed', startedAt: new Date('2026-10-11'), completedAt: new Date('2026-10-11'), scaledScore: 24 },
      { status: 'in_progress', startedAt: new Date('2026-10-12') },
    ], at)).toMatchObject({ status: 'done', scaledScore: 24 });
  });
  test('every exam has a runner URL', () => {
    expect(Object.keys(TP.RUNNER_URL).sort()).toEqual([...TP.KNOWN_EXAMS].sort());
  });
});

describe('buildChildExamList (the parent read of one child)', () => {
  test('ordered junior-first, same per-exam numbers as the teacher grid, nothing class-level', () => {
    const attempts = [
      TP.summarizeAttempt(session({ testId: 'act-math', scaledScore: 20, completedAt: new Date(T0 + 45 * MIN) })),
      TP.summarizeAttempt(session({ testId: 'act-math', scaledScore: 26, startedAt: new Date(T0 + 86400000), completedAt: new Date(T0 + 86400000 + 45 * MIN) })),
      TP.summarizeAttempt(session({ testId: 'psat-math', scaledScore: 480, timeLimitMinutes: 70 })),
    ];
    const list = TP.buildChildExamList(attempts);
    expect(list.map(e => e.testId)).toEqual(['psat-math', 'act-math']);
    const act = list[1];
    expect(act).toMatchObject({ label: 'ACT', attemptCount: 2, change: 6 });
    expect(act.latest.scaledScore).toBe(26);
    expect(act).not.toHaveProperty('classAverage');
  });
  test('no attempts → empty list', () => {
    expect(TP.buildChildExamList([])).toEqual([]);
    expect(TP.buildChildExamList(undefined)).toEqual([]);
  });
});
