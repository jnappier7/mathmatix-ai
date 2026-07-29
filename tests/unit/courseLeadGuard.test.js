/**
 * Course-mode student's-lead guard (owner report, 2026-07-29): inside
 * ACT Math Prep, the student answered "yep" to "Ready?" and the tutor
 * offered an open-tutoring topic menu ("how about triangle properties?",
 * "where do you want to point today?") instead of launching the module.
 *
 * Root cause: course lessons carry no lessonPhaseManager phaseState (their
 * state rides in the course prompt + _course metadata), so the student's-
 * lead guard treated the lesson like topicless free chat. decide() now
 * receives isCourseMode and flips the directive: launch the module step,
 * never offer a menu.
 */

const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');

function opener(messageType = MESSAGE_TYPES.AFFIRMATIVE) {
  return {
    messageType,
    answer: null,
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0, recentCorrectCount: 0 },
    contextSignals: [],
    raw: 'yep',
  };
}

const noAnswerDiagnosis = {
  type: 'no_answer', isCorrect: null, correctAnswer: null, verificationState: 'not_applicable',
};

function directivesFor(context) {
  const decision = decide(opener(), noAnswerDiagnosis, {
    conversation: { messages: [] },
    ...context,
  });
  return decision.directives.join('\n');
}

describe("student's-lead guard × course mode", () => {
  test('course mode: a bare "yep" launches the module, never a topic menu', () => {
    const directives = directivesFor({ isCourseMode: true });
    expect(directives).toContain('COURSE LESSON DRIVES');
    expect(directives).toContain('Do NOT offer a topic menu');
    expect(directives).not.toContain("STUDENT'S LEAD");
  });

  test('open tutoring: the original student\'s-lead directive still fires', () => {
    const directives = directivesFor({ isCourseMode: false });
    expect(directives).toContain("STUDENT'S LEAD");
    expect(directives).not.toContain('COURSE LESSON DRIVES');
  });

  test('phaseState still wins over both (phase-driven lessons untouched)', () => {
    const directives = directivesFor({ isCourseMode: true, phaseState: { currentPhase: 'I_DO' } });
    expect(directives).not.toContain('COURSE LESSON DRIVES');
    expect(directives).not.toContain("STUDENT'S LEAD");
  });

  test('a substantive message in course mode gets neither directive', () => {
    const decision = decide(
      { ...opener(MESSAGE_TYPES.GENERAL_MATH), raw: 'how do radicals work?' },
      noAnswerDiagnosis,
      { isCourseMode: true, conversation: { messages: [] } }
    );
    const directives = decision.directives.join('\n');
    expect(directives).not.toContain('COURSE LESSON DRIVES');
    expect(directives).not.toContain("STUDENT'S LEAD");
  });

  test('greetings in course mode also launch the lesson', () => {
    const directives = directivesFor({ isCourseMode: true });
    expect(directives).toContain('Launch the CURRENT module step');
  });
});
