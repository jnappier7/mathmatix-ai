// tests/unit/doubtOnUndecidedAnswer.test.js
//
// A correct answer must never be told it is wrong — least of all by implication,
// on a turn where the pipeline reached NO verdict at all.
//
// ORIGIN — landing page, 2026-09-07, solving 2(x - 3) = 10. The student worked
// it correctly, step by step, and finished with "x=8", which is right:
//
//   "I see where you're going with x = 8, but let's take a closer look at the
//    steps you took. Can you walk me through how you arrived at that solution?
//    Sometimes retracing our steps can help us spot any little mistakes along
//    the way."
//
// Nothing there says "wrong". Every part of it means wrong. That is what makes
// it worse than a wrong verdict: it presupposes the error instead of asserting
// it, so a student who was right has nothing to argue with.
//
// TWO SEPARATE DEFECTS PRODUCED IT, and this file pins both:
//
//   1. CONSOLATION READ AS PRAISE. leadsWithDoubtOnCorrect asks whether the
//      opening clause affirms, via a word-level scan that contains "great",
//      "nice" and "good". So "Great effort!" and "Nice try!" — the register a
//      teacher uses for a MISS — passed as affirmations, and the false-rejection
//      guard let them through even on a verified-correct answer.
//
//   2. NOTHING CHECKED AN UNDECIDED TURN. Every language guard in verify.js
//      needs a verdict: the false-rejection guard runs on a verified-correct
//      ACTION, and the llmVerdict guards on a verdict that resolved. With
//      diagnosisType 'unverifiable' the reply went out unchecked — which is
//      exactly the turn where the tutor has the least standing to imply
//      anything. decide.js already orders "Do not default to implying the
//      student is wrong", but a directive is advice; this is the enforcement.
//
// Why the answer was undecided at all is a THIRD thing, deliberately not
// changed here: diagnose defers when the tutor's latest turn asks a question of
// its own, so it cannot grade against a stale problem (a real AP Calculus bug it
// fixed). Scaffolding well means ending on a question, so a well-tutored problem
// now reliably ends undecided. Making the tutor safe when undecided is the fix
// that holds regardless of why the verdict is missing.

const {
  leadsWithDoubtOnCorrect,
  stripPresupposedError,
  verify,
} = require('../../utils/pipeline/verify');

// Verbatim from the screenshot.
const LIVE_REPLY = "I see where you're going with x = 8, but let's take a closer look at "
  + 'the steps you took. Can you walk me through how you arrived at that solution? '
  + 'Sometimes retracing our steps can help us spot any little mistakes along the way.';

// ============================================================================
// Defect 1 — consolation is not affirmation
// ============================================================================

describe('leadsWithDoubtOnCorrect treats consolation as doubt', () => {
  test.each([
    'Great effort! Adding 3 to both sides is a solid step. What do you get?',
    'Nice try! Let us look at that again.',
    'Good attempt — walk me through it.',
    'Nice thinking, but check the second line.',
    "I see where you're going with x = 8, but let's take a closer look.",
    'I appreciate your effort here.',
  ])('flags consolation dressed as praise: %j', (reply) => {
    expect(leadsWithDoubtOnCorrect(reply)).toBe(true);
  });

  // The guard must still recognise real affirmation, or it would regenerate
  // every correct-answer turn and the fix would cost more than the bug.
  test.each([
    'Exactly right — x = 8.',
    'Nice! That is exactly it.',
    'Great job — x = 8 is correct.',
    'Perfect, you nailed it.',
    "That's it. Ready for the next one?",
    'Yes! Well done.',
  ])('still passes a genuine affirmation: %j', (reply) => {
    expect(leadsWithDoubtOnCorrect(reply)).toBe(false);
  });
});

// ============================================================================
// Defect 2 — the stripper
// ============================================================================

describe('stripPresupposedError', () => {
  test('turns the live reply into the neutral ask the directives asked for', () => {
    const { text, changed } = stripPresupposedError(LIVE_REPLY);
    expect(changed).toBe(true);
    expect(text).toBe('Can you walk me through how you arrived at that solution?');
    // Every phrase that carried the accusation is gone.
    expect(text).not.toMatch(/mistake/i);
    expect(text).not.toMatch(/closer look/i);
    expect(text).not.toMatch(/I see where you're going/i);
  });

  test('catches "take a closer look" after a genuine affirmation', () => {
    // Same session, turn 17, on a CORRECT intermediate step. The opener here is
    // real praise — "Great job getting to x + 2 = 7!" — so the consolation and
    // affirmation checks both pass it. The doubt is in the sentence AFTER, which
    // is why this guard is sentence-scoped rather than opener-scoped.
    const live = 'Great job getting to x + 2 = 7! Let\'s take a closer look at that step '
      + 'together. Can you walk me through how you got from 3(x + 2) = 21 to x + 2 = 7?';
    const { text, changed } = stripPresupposedError(live);
    expect(changed).toBe(true);
    expect(text).toMatch(/^Great job getting to x \+ 2 = 7!/);
    expect(text).not.toMatch(/closer look/i);
  });

  test('drops a consolation opener but keeps the real question', () => {
    const { text, changed } = stripPresupposedError('Great effort! What do you get after you add 3 to both sides?');
    expect(changed).toBe(true);
    expect(text).toBe('What do you get after you add 3 to both sides?');
  });

  test.each([
    'Nice work — x = 8 is right. Ready for the next one?',
    'Can you walk me through how you got there?',
    'What do you get when you divide both sides by 2?',
  ])('leaves clean copy alone: %j', (reply) => {
    const { text, changed } = stripPresupposedError(reply);
    expect(changed).toBe(false);
    expect(text).toBe(reply);
  });

  test('never strips a reply down to nothing', () => {
    // If every sentence presupposed an error there is no neutral remainder, and
    // an empty bubble is worse than the original — the flag surfaces it instead.
    const allBad = 'Let us find the mistake. Can you spot any little mistakes?';
    const { text, changed } = stripPresupposedError(allBad);
    expect(text.trim().length).toBeGreaterThan(0);
    if (!changed) expect(text).toBe(allBad);
  });

  test('tolerates empty and non-string input', () => {
    expect(stripPresupposedError('').changed).toBe(false);
    expect(stripPresupposedError(null).changed).toBe(false);
    expect(stripPresupposedError(undefined).changed).toBe(false);
  });
});

// ============================================================================
// The wiring — it must fire when undecided, and ONLY when undecided
// ============================================================================

describe('verify strips accusation only on an undecided answer', () => {
  const base = {
    messageType: 'answer_attempt',
    action: 'continue_conversation',
    isBareProblemDrop: false,
    userMessage: 'x=8',
    studentAnswer: '8',
  };

  test('fires on the live case — diagnosisType unverifiable, no llm verdict', async () => {
    const r = await verify(LIVE_REPLY, { ...base, diagnosisType: 'unverifiable', llmVerdict: null });
    expect(r.flags).toEqual(expect.arrayContaining(['presupposed_error_on_undecided_answer']));
    expect(r.text).not.toMatch(/mistake/i);
  });

  test('does NOT fire when the answer is actually wrong', async () => {
    // A genuinely incorrect answer still gets corrective language. Stripping it
    // there would leave the tutor unable to say anything is wrong at all.
    const r = await verify(LIVE_REPLY, {
      ...base,
      diagnosisType: 'incorrect',
      llmVerdict: { isCorrect: false, modelAnswer: '9' },
    });
    expect(r.flags).not.toEqual(expect.arrayContaining(['presupposed_error_on_undecided_answer']));
  });

  test('does NOT fire when a verifier resolved the answer', async () => {
    // An llmVerdict that came back either way is a verdict; this guard is only
    // for the case where nothing decided.
    const r = await verify(LIVE_REPLY, {
      ...base,
      diagnosisType: 'unverifiable',
      llmVerdict: { isCorrect: true, modelAnswer: '8' },
    });
    expect(r.flags).not.toEqual(expect.arrayContaining(['presupposed_error_on_undecided_answer']));
  });

  test('does NOT fire on a message that was not an answer attempt', async () => {
    const r = await verify(LIVE_REPLY, {
      ...base,
      messageType: 'question',
      diagnosisType: 'unverifiable',
      llmVerdict: null,
    });
    expect(r.flags).not.toEqual(expect.arrayContaining(['presupposed_error_on_undecided_answer']));
  });
});
