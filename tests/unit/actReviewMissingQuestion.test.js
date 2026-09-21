/**
 * A missed question whose TEXT never loaded must not be presented as one the
 * tutor is holding.
 *
 * Owner transcript, 2026-09-20. The student asked for question 30 four times:
 *
 *   "Let's go over question 30."  -> "To question 30! What have you tried so far?"
 *   "Let's go over question 30."  -> "Alright, let's dive into question 30! What
 *                                     have you tried so far with this problem?"
 *   "Let's go over question 30."  -> (same again)
 *   "Let's go over question 30."  -> (same again)
 *   "I just know I got the wrong answer."
 *   "Can you remind me what the question was about?"
 *
 * The queue stores `it.content || p.prompt || ''`. Both are optional, so a miss
 * whose session item never carried content and whose problemId no longer
 * resolves in the bank lands in the queue with an EMPTY question — and the
 * section built for it still ended with "YOU HAVE THE QUESTION; THE STUDENT DOES
 * NOT … never ask them to share, paste, remember, or describe the question."
 * That boxes the model in completely: it cannot present what isn't there and it
 * is forbidden to ask. Four contentless turns is what the box produces.
 *
 * Nothing threw, nothing logged, and the panel kept showing "#30 · up next".
 */

const {
  buildReviewQueue,
  reviewPromptSection,
  hasQuestionText,
} = require('../../utils/actReview');

const sessionWithABlankItem = {
  items: [
    // Content stamped — the normal case.
    { position: 23, problemId: 'q23', skillId: 'act-percentages', category: 'integrating-essential-skills', content: 'A stock rose 25% then fell 20%. The net change was:', options: [{ label: 'A', text: 'a 5% decrease' }, { label: 'B', text: 'no change' }] },
    // No content, and the bank will not resolve it either.
    { position: 30, problemId: 'q30', skillId: 'act-functions', category: 'functions', options: [{ label: 'A', text: 'f(g(2))' }, { label: 'B', text: 'g(f(2))' }] },
  ],
  responses: [
    { position: 23, problemId: 'q23', answer: 'C', correct: false },
    { position: 30, problemId: 'q30', answer: 'A', correct: false },
  ],
};

describe('hasQuestionText', () => {
  test('is false for absent, empty and whitespace-only prompts', () => {
    expect(hasQuestionText(null)).toBe(false);
    expect(hasQuestionText({})).toBe(false);
    expect(hasQuestionText({ prompt: '' })).toBe(false);
    expect(hasQuestionText({ prompt: '   ' })).toBe(false);
  });

  test('is true once there is real text', () => {
    expect(hasQuestionText({ prompt: 'Solve 2x+3=11' })).toBe(true);
  });
});

describe('a queued miss with no question text', () => {
  const queue = buildReviewQueue(sessionWithABlankItem, {
    q23: { correctOption: 'B', answer: { value: 'no change' }, explanation: '1.25 x 0.8 = 1.' },
    // q30 deliberately absent from the bank — the state that produced the bug.
  });
  const blank = queue.find((m) => m.position === 30);
  const full = queue.find((m) => m.position === 23);

  test('the queue really does carry an empty question (the state under test)', () => {
    expect(blank.prompt).toBe('');
    expect(hasQuestionText(blank)).toBe(false);
    expect(hasQuestionText(full)).toBe(true);
  });

  test('the section does NOT claim the tutor is holding the question', () => {
    const section = reviewPromptSection(blank, 1, 2);
    expect(section).not.toMatch(/YOU HAVE THE QUESTION/);
    expect(section).toMatch(/DID NOT LOAD/);
  });

  test('the section lifts the ban on asking the student for it', () => {
    const section = reviewPromptSection(blank, 1, 2);
    // The normal section's prohibition must not survive into this one.
    expect(section).not.toMatch(/Never ask them to\s+share/);
    expect(section).toMatch(/ask them to read it\s+to you or snap a photo/);
  });

  test('it forbids the two ways the model papered over the gap', () => {
    const section = reviewPromptSection(blank, 1, 2);
    // It asked what they had tried on a question neither party could see…
    expect(section).toMatch(/do NOT ask them what they tried/i);
    // …and inventing a plausible functions question would be worse.
    expect(section).toMatch(/do NOT invent a question/i);
  });

  test('it still hands over everything we DO know', () => {
    const section = reviewPromptSection(blank, 1, 2);
    expect(section).toMatch(/#30/);
    expect(section).toMatch(/Functions/i);
    expect(section).toMatch(/they answered/i);
  });

  test('a skipped blank says skipped, not "they answered"', () => {
    const section = reviewPromptSection({ ...blank, skipped: true, theirAnswer: null }, 1, 2);
    expect(section).toMatch(/SKIPPED/);
    expect(section).not.toMatch(/they answered/i);
  });

  test('a miss WITH text is untouched — the normal section still renders', () => {
    const section = reviewPromptSection(full, 0, 2);
    expect(section).toMatch(/YOU HAVE THE QUESTION/);
    expect(section).toMatch(/A stock rose 25%/);
    expect(section).toMatch(/STORED KEY/);
  });
});

describe('the decide directive agrees with the section', () => {
  const { decide } = require('../../utils/pipeline/decide');

  const run = (miss) => {
    const observation = {
      messageType: 'question', raw: "Let's go over question 30.", confidence: 0.8,
      streaks: { giveUpCount: 0, recentCorrectCount: 0, recentWrongCount: 0 },
    };
    const decision = decide(observation, { type: 'unknown' }, {
      phaseState: null, activeSkill: null, isCourseMode: true, actReviewMiss: miss,
    });
    return decision.directives.join('\n');
  };

  test('with the question in hand it still forbids asking (unchanged)', () => {
    const d = run({ position: 23, hasPrompt: true });
    expect(d).toMatch(/YOU HAVE THE QUESTION/);
    expect(d).toMatch(/Do NOT ask them to share/);
  });

  test('without it, the directive asks instead of forbidding', () => {
    const d = run({ position: 30, hasPrompt: false });
    expect(d).toMatch(/DID NOT LOAD/);
    expect(d).toMatch(/ask them to read it to you/);
    // The contradiction that deadlocked the turn: a directive the model reads
    // FIRST, telling it not to ask for something it does not have.
    expect(d).not.toMatch(/Do NOT ask them to share/);
    expect(d).not.toMatch(/you are holding it/);
  });

  test('a legacy miss with no hasPrompt flag keeps the old directive', () => {
    // Conversations already in flight carry an actReviewMiss built before the
    // flag existed. Undefined must not read as "no question".
    const d = run({ position: 12 });
    expect(d).toMatch(/YOU HAVE THE QUESTION/);
  });
});
