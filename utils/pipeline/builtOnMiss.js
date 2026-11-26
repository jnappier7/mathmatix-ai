/**
 * Did the tutor's last question BUILD ON the student's wrong answer?
 *
 * Live, 2026-11-26, on 3/4 + 2/3: the student gave the numerators as "9 and 6"
 * (graded incorrect) and the tutor replied "what do you get when you add the
 * numerators 9 and 6?". "15/12" answers that question exactly, so it was
 * confirmed as the answer to the problem. It is not; 17/12 is.
 *
 * The pipeline can see three facts on such a turn — the previous answer was
 * graded incorrect, this one is right for the tutor's follow-up, and it is not
 * the board problem's answer — but a student who simply FIXES a missed
 * sub-step shows the same three ("what is 1/3 of 24?" → "6" → "try again" →
 * "8"). What separates them is the tutor's question: did it take the wrong
 * values as given and ask for the next thing computed from them? That is a
 * reading judgment, so a small model call makes it — only on turns where the
 * three facts hold AND the wrong values literally appear in the tutor's turn.
 *
 * @module utils/pipeline/builtOnMiss
 */

const { verifierCall, parseVerdict, VERIFIER_MODEL } = require('./llmVerifier');

const numbersIn = (text) => (String(text || '')
  .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
  .match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []);

/** Every number of the student's earlier answer appears in the tutor's turn. */
function quotesAnswer(tutorText, previousAnswer) {
  const said = numbersIn(previousAnswer);
  if (said.length === 0) return false;
  const tutor = new Set(numbersIn(tutorText));
  return said.every((n) => tutor.has(n));
}

const SYSTEM =
  'You read one exchange from a math tutoring session. The student\'s answer shown was WRONG. '
  + 'Decide what the tutor\'s reply does with it. Respond with JSON ONLY: {"buildsOn": true|false}.\n'
  + 'true — the tutor takes the student\'s values as given and asks for the NEXT thing computed from them '
  + '("add the numerators 9 and 6", "now simplify that", "so what is x?").\n'
  + 'false — the tutor questions, corrects or re-asks: it asks how they got a value, asks them to try the same step again, '
  + 'points at the mistake, or asks something that does not use those values.';

/**
 * @param {string} tutorText       the tutor's last turn
 * @param {string} previousAnswer  the student's answer that was graded incorrect
 * @returns {Promise<boolean>} true only on a confident reading; false on any doubt or failure. Never rejects.
 */
async function questionBuildsOnAnswer(tutorText, previousAnswer, { model } = {}) {
  if (!tutorText || !previousAnswer || !quotesAnswer(tutorText, previousAnswer)) return false;
  try {
    const res = await verifierCall(model || VERIFIER_MODEL, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Student's (wrong) answer:\n${String(previousAnswer).slice(0, 400)}\n\nTutor's reply:\n${String(tutorText).slice(0, 1200)}` },
    ], { temperature: 0, max_tokens: 60, response_format: { type: 'json_object' } });
    const parsed = parseVerdict(res?.choices?.[0]?.message?.content?.trim() || '');
    return !!(parsed && parsed.buildsOn === true);
  } catch (err) {
    console.error('[BuiltOnMiss] check failed (non-fatal):', err.message);
    return false;
  }
}

module.exports = { questionBuildsOnAnswer, quotesAnswer };
