/**
 * What the student said brought them to Mathmatix.
 *
 * onboarding.html asks an open question ("what brings you here?"), captures it
 * by voice or text, and classifies it into user.onboarding.intentCategory. The
 * capture, the classifier and the schema have all existed for a while — but
 * nothing has ever read the answer. intentText and intentCategory were written
 * and never consumed by any route, prompt or report, so the question produced
 * data no code path used. This is the consumer.
 *
 * Only the CATEGORY is used, never intentText.
 * ---------------------------------------------
 * intentCategory is a schema enum, so it cannot carry anything but one of
 * eight known strings. intentText is up to 2000 characters of free-form voice
 * or typed input from an unauthenticated-ish onboarding step, and putting that
 * verbatim into a system prompt is a prompt-injection surface. The category
 * carries essentially all of the signal and none of the risk. If the raw text
 * is ever wanted for rapport, it should go through the same treatment the rest
 * of the untrusted-input path gets (see middleware/promptInjection.js), not
 * straight into the prompt.
 *
 * @module utils/onboardingIntent
 */

/**
 * Category -> one line of tutoring guidance.
 *
 * parent_support and teacher_exploring are deliberately absent: they say the
 * account holder is not the student, which is a fact about the account rather
 * than a way to teach, and acting on it inside a student session would be
 * guessing. unknown and just_exploring are handled below.
 */
const INTENT_GUIDANCE = {
  student_homework:
    'came here for homework help, so expect specific assigned problems rather than open practice.',
  student_test_prep:
    'came here to get ready for a test, so favour retrieval practice and spotting the question type.',
  act_sat_prep:
    'came here for ACT/SAT prep, so favour strategy, pacing and eliminating answers over long derivations.',
  general_math_help:
    'came here to shore up general understanding, so prioritise the underlying idea over speed.',
  just_exploring:
    'said they were just looking around, so earn the next question rather than assuming commitment.'
};

/**
 * Build the intent line for the tutor prompt.
 *
 * Framed as what they said at signup, not as a standing fact — a kid who
 * arrived for one homework problem in September should not still be treated as
 * a homework-only student in March. The tutor should weigh it, not obey it.
 *
 * @param {Object|null} onboarding - user.onboarding
 * @param {string} firstName
 * @returns {string} a single line, or '' when there is nothing useful to say
 */
function buildIntentPrompt(onboarding, firstName) {
  if (!onboarding || !onboarding.intentCategory) return '';

  const guidance = INTENT_GUIDANCE[onboarding.intentCategory];
  if (!guidance) return '';   // unknown, parent_support, teacher_exploring

  return `When ${firstName} signed up they ${guidance} Treat it as context, not as a rule — it may be out of date.`;
}

module.exports = { buildIntentPrompt, INTENT_GUIDANCE };
