/**
 * Checkpoint and step evidence — course audit, 2026-10-23.
 *
 * Every checkpoint the auditor launched (Number Sense diagnostic, Quarters
 * 1-3, Algebra 1 Unit 1) was marked complete on launch or after one or two
 * answers, and the rest of its answers advanced the NEXT module's steps.
 * Cause: the checkpoint branch counted problemResult across the whole
 * conversation, and every practice gate counted this turn's verdict twice
 * (persist stamps it before progression runs, then wasCorrect added it again).
 */

const {
  messagesSinceAdvance,
  countCorrectSinceAdvance,
  checkpointStartedAt,
  tallyCheckpoint,
} = require('../../utils/pipeline/checkpointEvidence');
const { evaluateDeterministic } = require('../../utils/pipeline/stepEvaluator');
const { advanceCourseProgress } = require('../../utils/pipeline/courseAdapter');

const T0 = new Date('2026-10-23T10:00:00Z').getTime();
const at = (min) => new Date(T0 + min * 60000);

// A finished practice turn: student answer, then the graded assistant reply.
function answered(result, min, extra = {}) {
  return [
    { role: 'user', content: 'answer', timestamp: at(min) },
    { role: 'assistant', content: 'reply', problemResult: result, timestamp: at(min), ...extra },
  ];
}

// A conversation that already holds `n` correct answers from earlier modules,
// ending with the module-complete turn (marker stamped on its last message).
function priorModules(n) {
  const msgs = [];
  for (let i = 0; i < n; i++) msgs.push(...answered('correct', i));
  msgs[msgs.length - 1].scaffoldAdvanced = true;
  return msgs;
}

const QUARTER_1 = Array.from({ length: 14 }, (_, i) => ({ id: `q${i + 1}`, points: 1 }));

function checkpointSession(overrides = {}) {
  return {
    courseId: 'early-math',
    currentModuleId: 'checkpoint_q1',
    currentScaffoldIndex: 0,
    progressFloorPct: 0,
    overallProgress: 0,
    modules: [
      { moduleId: 'multiplication', status: 'completed', lessons: [] },
      { moduleId: 'checkpoint_q1', status: 'in_progress', startedAt: at(30), lessons: [] },
      { moduleId: 'division', status: 'locked', lessons: [] },
    ],
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('checkpoint completion needs the checkpoint\'s own answers', () => {
  test('audit repro: 30 earlier correct answers do not complete a 14-question checkpoint after one answer', async () => {
    const conversation = { messages: [...priorModules(30), ...answered('correct', 31)] };
    const session = checkpointSession();

    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: { type: 'assessment', assessmentProblems: QUARTER_1, scaffold: [] },
      conversation,
      wasCorrect: true,
      isCheckpoint: true,
    });

    expect(courseProgressUpdate).toBeNull();
    expect(session.currentModuleId).toBe('checkpoint_q1');
    expect(session.modules[1].status).toBe('in_progress');
    expect(session.modules[2].status).toBe('locked');
  });

  test('audit repro: launching the checkpoint with no answer does not complete it', async () => {
    const conversation = { messages: [...priorModules(40), { role: 'assistant', content: 'Problem 1 of 14', timestamp: at(41) }] };
    const session = checkpointSession();
    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: { type: 'assessment', assessmentProblems: QUARTER_1, scaffold: [] },
      conversation, wasCorrect: null, isCheckpoint: true,
    });
    expect(courseProgressUpdate).toBeNull();
  });

  test('all 14 answered completes it, with a score from those 14 only', async () => {
    const msgs = [...priorModules(30)];
    for (let i = 0; i < 14; i++) msgs.push(...answered(i < 12 ? 'correct' : 'incorrect', 31 + i));
    const session = checkpointSession();

    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: { type: 'assessment', assessmentProblems: QUARTER_1, scaffold: [], passThreshold: 70 },
      conversation: { messages: msgs }, wasCorrect: false, isCheckpoint: true,
    });

    expect(courseProgressUpdate.event).toBe('module_complete');
    expect(session.modules[1].checkpointScore).toBe(86); // 12/14
    expect(session.modules[1].checkpointPassed).toBe(true);
    expect(session.currentModuleId).toBe('division');
  });

  test('legacy conversation with no persisted markers is bounded by the module\'s startedAt', () => {
    const msgs = [];
    for (let i = 0; i < 30; i++) msgs.push(...answered('correct', i)); // no markers at all
    msgs.push(...answered('correct', 31));
    const tally = tallyCheckpoint({ messages: msgs }, checkpointSession(), QUARTER_1);
    expect(tally.attempted).toBe(1);
    expect(tally.complete).toBe(false);
  });

  test('a test-out starts counting at checkpointState.startedAt, not at the lesson\'s last advance', () => {
    const msgs = [...priorModules(5)];
    for (let i = 0; i < 20; i++) msgs.push(...answered('correct', 10 + i)); // current lesson's practice
    msgs.push(...answered('correct', 40));
    const session = checkpointSession({
      checkpointState: { moduleId: 'checkpoint_q1', startedAt: at(35) },
    });
    session.modules[1].startedAt = undefined;
    expect(checkpointStartedAt(session).getTime()).toBe(at(35).getTime());
    expect(tallyCheckpoint({ messages: msgs }, session, QUARTER_1).attempted).toBe(1);
  });

  test('a numbered set answered in one message counts every item', () => {
    const msgs = [
      ...priorModules(10),
      ...answered('correct', 31),
      ...answered('correct', 32),
      ...answered(null, 33, { problemItems: { total: 13, correct: 12, wrong: 0 } }),
    ];
    const problems = Array.from({ length: 15 }, () => ({ points: 1 }));
    const tally = tallyCheckpoint({ messages: msgs }, checkpointSession(), problems);
    expect(tally.attempted).toBe(15);
    expect(tally.correct).toBe(14);
    expect(tally.undecided).toBe(1);
    expect(tally.complete).toBe(true);
    // the unverified item is not scored as a miss
    expect(tally.score).toBe(100);
  });
});

describe('this turn\'s verdict counts once', () => {
  test('one correct answer, already stamped by persist, is one — not two', () => {
    const messages = [...priorModules(3), ...answered('correct', 10)];
    expect(countCorrectSinceAdvance(messages, true)).toBe(1);
    const verdict = evaluateDeterministic({ type: 'guided_practice' }, { messages }, { wasCorrect: true });
    expect(verdict.complete).toBe(false);
  });

  test('wasCorrect still counts when the turn is not yet on the conversation', () => {
    const messages = [...priorModules(3), ...answered('correct', 10), { role: 'user', content: '42' }];
    expect(countCorrectSinceAdvance(messages, true)).toBe(2);
  });

  test('a readiness message with one prior correct answer does not clear a practice step', () => {
    const messages = [
      ...priorModules(3),
      ...answered('correct', 10),
      { role: 'user', content: "I'm ready for the next problem" },
      { role: 'assistant', content: 'Here is the next one' },
    ];
    const verdict = evaluateDeterministic({ type: 'independent_practice' }, { messages }, { wasCorrect: null });
    expect(verdict.complete).toBe(false);
  });

  test('messagesSinceAdvance stops at the marker', () => {
    const messages = [...priorModules(3), ...answered('correct', 10)];
    expect(messagesSinceAdvance(messages)).toHaveLength(2);
  });
});
