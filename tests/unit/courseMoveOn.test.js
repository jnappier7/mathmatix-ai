/**
 * "Move on" and "I already know this" in a course (owner decision 2026-10-18).
 *
 * Course audit: students said "move on", "how many more until I finish this
 * lesson?", "I know this stuff. Can't I just take a test and move past it?",
 * "I'm ready test me" — and the course heard none of it.
 */
const {
  classifyCourseRequest, isPracticeStep, findUnitCheckpoint, readPathway, beginTestOut, settleTestOut,
} = require('../../utils/courseMoveOn');

describe('classifyCourseRequest — the students\' own words', () => {
  test.each([
    ['I know this stuff. Can\'t I just take a test and move past it?', 'test_out'],
    ['I\'m ready test me', 'test_out'],
    ['i already know all of this', 'test_out'],
    ['move on. how many more until I finish this lesson?', 'skip'],
    ['can we go to the next section of this boot camp', 'skip'],
    ['next section please', 'skip'],
  ])('%s → %s', (text, kind) => expect(classifyCourseRequest(text)).toBe(kind));

  test.each([
    'the next step is to subtract 3',
    'I think the next one is harder',
    'I know it\'s 5',
    'what is the next step?',
    'x = 4',
  ])('math talk is not a request: %s', (text) => expect(classifyCourseRequest(text)).toBeNull());
});

test('practice steps are recognized (they never skip)', () => {
  expect(isPracticeStep({ type: 'independent_practice' })).toBe(true);
  expect(isPracticeStep({ type: 'explanation' })).toBe(false);
});

describe('findUnitCheckpoint on the real pathways', () => {
  test('Algebra 1 Unit 1 → its checkpoint', () => {
    const ck = findUnitCheckpoint(readPathway('algebra-1'), 'foundations_algebra');
    expect(ck.moduleId).toBe('checkpoint_u1');
  });
  test('every content module in the curriculum courses has a gradable checkpoint ahead', () => {
    for (const course of ['early-math-foundations', '6th-grade-math', '7th-grade-math', 'grade-8-math', 'algebra-1', 'geometry', 'algebra-2', 'precalculus', 'ap-calculus-ab', 'calculus-bc']) {
      const pw = readPathway(course);
      const first = pw.modules[0].moduleId;
      expect([course, findUnitCheckpoint(pw, first)]).toEqual([course, expect.objectContaining({ moduleId: expect.any(String) })]);
    }
  });
});

describe('a test-out never costs progress', () => {
  const session = () => ({
    courseId: 'algebra-1',
    currentModuleId: 'foundations_algebra',
    currentScaffoldIndex: 3,
    modules: [
      { moduleId: 'foundations_algebra', status: 'in_progress', scaffoldProgress: 15 },
      { moduleId: 'checkpoint_u1', status: 'locked' },
      { moduleId: 'equations_inequalities', status: 'locked' },
    ],
    checkpointState: null,
  });

  test('begin: points at the checkpoint and remembers the way back', () => {
    const s = session();
    expect(beginTestOut(s).moduleId).toBe('checkpoint_u1');
    expect(s.currentModuleId).toBe('checkpoint_u1');
    expect(s.checkpointState.testOutFrom).toEqual({ moduleId: 'foundations_algebra', scaffoldIndex: 3, checkpointPrevStatus: 'locked' });
    expect(s.modules[1].status).toBe('available');
  });

  test('pass: the skipped unit is credited as tested out', () => {
    const s = session();
    beginTestOut(s);
    expect(settleTestOut(s, true)).toEqual({ testOut: true, passed: true });
    expect(s.modules[0]).toMatchObject({ status: 'completed', testedOut: true, scaffoldProgress: 100 });
  });

  test('miss: back exactly where they were, checkpoint not completed', () => {
    const s = session();
    beginTestOut(s);
    expect(settleTestOut(s, false)).toEqual({ testOut: true, passed: false, returnedTo: 'foundations_algebra' });
    expect(s).toMatchObject({ currentModuleId: 'foundations_algebra', currentScaffoldIndex: 3, checkpointState: null });
    expect(s.modules[0].status).toBe('in_progress');
    expect(s.modules[1].status).toBe('locked');
  });

  test('an ordinary checkpoint (no test-out) is left to the normal flow', () => {
    const s = session();
    s.checkpointState = { moduleId: 'checkpoint_u1', responses: [] };
    expect(settleTestOut(s, false)).toEqual({ testOut: false });
  });
});
