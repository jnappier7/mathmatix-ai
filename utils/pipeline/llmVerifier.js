/**
 * LLM VERIFIER — Parallel LLM answer verification
 *
 * The deterministic math solver (utils/mathSolver.js) only handles a fraction of
 * math problems (arithmetic, basic algebra, simple equations). For the rest —
 * calculus, trig, proofs, factored polynomials, word problems — the solver
 * returns `unverifiable` and the main tutor LLM is left to judge correctness
 * while also teaching Socratically, which leads to false rejections ("Close!"
 * on correct derivatives) and false affirmations.
 *
 * This module runs a small, focused LLM call in parallel with the main tutor
 * response — fresh context, no tutoring persona, no conversation bias — and
 * returns a clean verdict the pipeline can trust for the cases the solver
 * can't handle.
 *
 * Hallucination mitigations:
 *   1. Two-step verification — first compute the answer independently, THEN
 *      ask if the student's matches. Reduces "agree with whatever is in front
 *      of me" bias.
 *   2. Fresh context every call — no student history, no persona, no prior turns.
 *   3. Temperature 0 — deterministic answers.
 *   4. Confidence threshold — low-confidence verdicts are treated as unverifiable.
 *
 * @module pipeline/llmVerifier
 */

const { callLLM } = require('../llmGateway');
const { symbolicVerify } = require('./symbolicVerifier');

// Small, fast model, held on OpenAI deliberately. openaiClient now routes any
// `claude*` id to anthropicClient, so a swap to Claude Haiku is a one-line
// change here rather than new plumbing — but the verifier is the second opinion
// that checks the tutor's own answer, and the tutor generate stage already runs
// Claude in production (TUTOR_MODEL). Keeping the verifier on a different
// provider is the point: two independent models are a real cross-check, one
// model grading itself is not.
const VERIFIER_MODEL = 'gpt-4o-mini';

// If the equivalence judge returns below this confidence, we treat the
// verdict as unverifiable rather than acting on a weak signal.
const CONFIDENCE_THRESHOLD = 0.6;

// A NEGATIVE verdict must clear a higher bar than a positive one. The two
// mistakes are not symmetric: telling a student their correct answer is wrong
// derails the lesson and costs their trust in the tutor, while a missed
// rejection only leaves the turn unverified — and under the assertion invariant
// an unverified turn makes the tutor ask rather than assert. So "no match" at
// middling confidence buys nothing and is discarded.
const NEGATIVE_CONFIDENCE_THRESHOLD = 0.8;

const MAX_PROBLEM_CHARS = 2000;
const MAX_ANSWER_CHARS = 500;

// Stronger judge for the minority of attempts the fast model can't resolve.
// gpt-4o is already used for vision grading, so it stays within the OpenAI-only
// contract. Escalation only fires on uncertain cases, so the cost/latency hit is
// bounded to a small fraction of answer attempts.
const ESCALATION_MODEL = 'gpt-4o';

/**
 * Run two-step LLM verification on a student's answer.
 *
 * @param {string} problemText - The problem as posed (typically the assistant's
 *   prior message that contained the question). May be natural language with
 *   embedded math — the verifier handles extraction itself.
 * @param {string} studentAnswer - The student's answer.
 * @param {Object} [options]
 * @param {string} [options.model] - Override the model name.
 * @param {number} [options.confidenceThreshold] - Minimum confidence to act on.
 * @returns {Promise<Object>} Verdict
 *   - isCorrect {boolean|null}: true/false, or null if unverifiable
 *   - confidence {number}: 0.0–1.0
 *   - modelAnswer {string|null}: what the verifier computed independently
 *   - rationale {string|null}: brief reason (for logging / debugging)
 *   - error {string|null}: error message if the call failed
 */
async function llmVerifyAnswer(problemText, studentAnswer, options = {}) {
  const unverifiable = {
    isCorrect: null,
    confidence: 0,
    modelAnswer: null,
    rationale: null,
    error: null,
  };

  if (!problemText || !studentAnswer) {
    return { ...unverifiable, error: 'missing_input' };
  }

  const problem = String(problemText).slice(0, MAX_PROBLEM_CHARS);
  const answer = String(studentAnswer).slice(0, MAX_ANSWER_CHARS);
  const model = options.model || VERIFIER_MODEL;
  const threshold = options.confidenceThreshold != null
    ? options.confidenceThreshold
    : CONFIDENCE_THRESHOLD;

  try {
    // ── Step 1: Independently compute the answer ──
    // Fresh context, no student, no persona. Plain math engine.
    const step1Messages = [
      {
        role: 'system',
        content:
          'You are a precise math answer engine. Given a math problem, return ONLY the final simplified answer as a short string. ' +
          'Do not show work, do not add commentary, do not repeat the problem. ' +
          'If multiple equivalent forms are acceptable (e.g. factored vs expanded), return the simplest standard form. ' +
          'If the problem text asks MORE THAN ONE thing (a warm-up sub-step and then the real result — ' +
          'e.g. "what\'s 0.15 × 2, and then where does the decimal land once you account for the 2000?"), ' +
          'return the answer to the LAST thing asked: that is the question the student is completing. ' +
          'Never anchor on an intermediate sub-step when a final result is also requested. ' +
          'Respond with JSON: {"answer": "<answer>", "form": "<e.g. simplified|factored|decimal>"}.',
      },
      {
        role: 'user',
        content: `Problem:\n${problem}`,
      },
    ];

    const step1 = await callLLM(model, step1Messages, {
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const step1Raw = step1?.choices?.[0]?.message?.content?.trim() || '';
    let modelAnswer = null;
    try {
      const parsed = JSON.parse(step1Raw);
      modelAnswer = typeof parsed.answer === 'string' ? parsed.answer.trim() : null;
    } catch (_) {
      // Non-JSON reply — fall through
    }

    if (!modelAnswer) {
      return { ...unverifiable, error: 'step1_parse_failed' };
    }

    // ── Step 2a: SYMBOLIC equivalence (deterministic, before the LLM judge) ──
    // Step 1's LLM is good at COMPUTING the expected answer for any math it
    // reads — algebra, calculus, inline sub-questions. The CAS is exact at
    // CHECKING equivalence. Confirm with mathjs first, so any answer that's
    // symbolically parseable gets a deterministic verdict instead of the flaky
    // LLM equivalence judge (the step that eyeballed x^6-2x^2+... and got it
    // wrong). Non-symbolic answers (word problems, proofs) fall through below.
    try {
      const sym = symbolicVerify({ studentAnswer: answer, correctAnswer: modelAnswer });
      if (sym.isCorrect !== null) {
        return { isCorrect: sym.isCorrect, confidence: 0.98, modelAnswer, rationale: 'symbolic:' + sym.method, error: null };
      }
    } catch (_) { /* fall through to the LLM equivalence judge */ }

    // ── Step 2: Ask equivalence judge ──
    // Independent call, still no persona. Just: do these two mean the same thing?
    // The student's full reply, when the caller provides it, protects the
    // multi-part-question case: a student answering "what's 0.15×2, and then
    // where does the decimal land?" with "0.3 … 300" answered BOTH parts —
    // the intermediate 0.3 must not read as a wrong final answer.
    const fullReply = typeof options.fullStudentMessage === 'string'
      && options.fullStudentMessage.trim()
      && options.fullStudentMessage.trim() !== answer
      ? String(options.fullStudentMessage).slice(0, MAX_ANSWER_CHARS * 4)
      : null;

    const step2Messages = [
      {
        role: 'system',
        content:
          'You are a math equivalence judge. Given an expected answer and a student answer, determine whether they are mathematically equivalent. ' +
          'Accept all valid equivalent forms: 0.5 ≡ 1/2, (x+2)(x-3) ≡ x^2-x-6, 2 ≡ 2.0, sin^2(x) ≡ 1-cos^2(x) when the problem allows. ' +
          'A different form of the same number/expression counts as a MATCH. ' +
          'A different value, wrong sign, wrong coefficient, or an incomplete simplification counts as NO MATCH. ' +
          'If the student\'s full reply is provided, judge their FINAL answer against the expected answer — ' +
          'intermediate values they computed along the way are shown work, not wrong answers. ' +
          'Respond with JSON ONLY: {"matches": true|false, "confidence": <0.0-1.0>, "rationale": "<brief reason>"}.',
      },
      {
        role: 'user',
        content:
          `Problem:\n${problem}\n\n` +
          `Expected answer: ${modelAnswer}\n` +
          `Student answer: ${answer}\n` +
          (fullReply ? `Student's full reply (for context):\n${fullReply}\n` : '') +
          `\nAre these mathematically equivalent?`,
      },
    ];

    const step2 = await callLLM(model, step2Messages, {
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const step2Raw = step2?.choices?.[0]?.message?.content?.trim() || '';
    let judged;
    try {
      judged = JSON.parse(step2Raw);
    } catch (_) {
      return { ...unverifiable, modelAnswer, error: 'step2_parse_failed' };
    }

    const matches = judged.matches === true;
    const rawConfidence = typeof judged.confidence === 'number' ? judged.confidence : 0;
    const confidence = Math.max(0, Math.min(1, rawConfidence));
    const rationale = typeof judged.rationale === 'string' ? judged.rationale.slice(0, 300) : null;

    // Below-threshold confidence → don't trust the verdict. Return
    // isCorrect=null so the pipeline treats it as unverifiable and falls
    // back to its existing behavior. Rejections are held to the higher
    // negative bar (see NEGATIVE_CONFIDENCE_THRESHOLD).
    const negativeThreshold = options.negativeConfidenceThreshold != null
      ? options.negativeConfidenceThreshold
      : Math.max(threshold, NEGATIVE_CONFIDENCE_THRESHOLD);
    if (confidence < threshold || (!matches && confidence < negativeThreshold)) {
      return {
        isCorrect: null,
        confidence,
        modelAnswer,
        rationale,
        error: null,
      };
    }

    return {
      isCorrect: matches,
      confidence,
      modelAnswer,
      rationale,
      error: null,
    };
  } catch (err) {
    console.error('[LLMVerifier] Verification call failed:', err.message);
    return { ...unverifiable, error: err.message || 'llm_error' };
  }
}

/**
 * Verify a CONCEPTUAL answer — one whose correctness is an idea, not a value.
 *
 * The two-step verifier above is a math answer engine: step 1 computes the
 * problem's answer and step 2 checks equivalence. Hand it "what distinguishes a
 * vertical asymptote from a hole?" and it has no answer to compute, so the
 * judge compares the student's words to whatever step 1 improvised and reports
 * NO MATCH — a false rejection of a correct idea (production, AP Calculus AB,
 * 2026-07-28: "if its zero on top too" is exactly right, and was dismissed).
 *
 * This path grades the IDEA instead, and is deliberately generous about form:
 * students type conceptual answers fast, informally, and without the vocabulary
 * — "zero on top" is "the numerator is also zero at that x". Wording is never
 * the failure. Rejections clear the higher negative bar; anything murky returns
 * unverifiable so the tutor asks rather than accuses.
 *
 * @param {string} questionText - The tutor's question, as asked.
 * @param {string} studentAnswer - The student's reply, verbatim.
 * @param {Object} [options] - { model, confidenceThreshold, negativeConfidenceThreshold }
 * @returns {Promise<Object>} verdict
 *   - isCorrect {boolean|null}
 *   - partial {boolean}: the right idea, missing a necessary piece
 *   - verdict {string|null}: 'correct' | 'partially_correct' | 'incorrect' | 'unclear'
 *   - keyIdea {string|null}: the correct idea, for the tutor's own reference.
 *     NEVER surfaced as `correctAnswer` — an unsaid answer is not ours to reveal.
 *   - conceptual {boolean}: always true, so callers can tell the paths apart
 */
async function llmVerifyConceptual(questionText, studentAnswer, options = {}) {
  const unverifiable = {
    isCorrect: null,
    partial: false,
    confidence: 0,
    verdict: null,
    keyIdea: null,
    modelAnswer: null,
    rationale: null,
    conceptual: true,
    error: null,
  };

  if (!questionText || !studentAnswer) {
    return { ...unverifiable, error: 'missing_input' };
  }

  const question = String(questionText).slice(0, MAX_PROBLEM_CHARS);
  const answer = String(studentAnswer).slice(0, MAX_ANSWER_CHARS);
  const model = options.model || VERIFIER_MODEL;
  const threshold = options.confidenceThreshold != null
    ? options.confidenceThreshold
    : CONFIDENCE_THRESHOLD;
  const negativeThreshold = options.negativeConfidenceThreshold != null
    ? options.negativeConfidenceThreshold
    : Math.max(threshold, NEGATIVE_CONFIDENCE_THRESHOLD);

  try {
    const messages = [
      {
        role: 'system',
        content:
          'You grade a student\'s short answer to a math tutor\'s CONCEPTUAL question — a question whose answer is an idea, a condition, or a distinction rather than a computed value. ' +
          'Students type these fast and informally: expect no punctuation, "its" for "it is", missing subjects, and none of the technical vocabulary. Judge the IDEA ONLY. Wording, spelling, grammar and terminology are never grounds for rejection. ' +
          'If the student names the right condition or distinction in their own words — even partially phrased, even with the subject left implicit — the verdict is "correct". ' +
          'Use "partially_correct" when they have a real piece of the idea but a necessary part is missing. ' +
          'Use "incorrect" ONLY when what they actually said is mathematically false. ' +
          'Use "unclear" when the answer is too vague to judge, is off-topic, or when the question was not conceptual after all. ' +
          'Respond with JSON ONLY: {"verdict":"correct"|"partially_correct"|"incorrect"|"unclear","confidence":<0.0-1.0>,"keyIdea":"<the correct idea in one short sentence>","rationale":"<brief reason>"}.',
      },
      {
        role: 'user',
        content: `Tutor's question:\n${question}\n\nStudent's answer:\n${answer}`,
      },
    ];

    const res = await callLLM(model, messages, {
      temperature: 0,
      max_tokens: 250,
      response_format: { type: 'json_object' },
    });

    const raw = res?.choices?.[0]?.message?.content?.trim() || '';
    let judged;
    try {
      judged = JSON.parse(raw);
    } catch (_) {
      return { ...unverifiable, error: 'conceptual_parse_failed' };
    }

    const verdict = typeof judged.verdict === 'string' ? judged.verdict.toLowerCase() : null;
    const rawConfidence = typeof judged.confidence === 'number' ? judged.confidence : 0;
    const confidence = Math.max(0, Math.min(1, rawConfidence));
    const keyIdea = typeof judged.keyIdea === 'string' ? judged.keyIdea.slice(0, 300) : null;
    const rationale = typeof judged.rationale === 'string' ? judged.rationale.slice(0, 300) : null;
    const base = { ...unverifiable, confidence, verdict, keyIdea, rationale };

    if (verdict === 'correct' && confidence >= threshold) {
      return { ...base, isCorrect: true };
    }
    // Partially correct is NOT wrong. It carries no boolean — the student built
    // something real and the tutor's job is to affirm that piece and ask for the
    // rest, never to run the wrong-answer ladder over it.
    if (verdict === 'partially_correct' && confidence >= threshold) {
      return { ...base, isCorrect: null, partial: true };
    }
    if (verdict === 'incorrect' && confidence >= negativeThreshold) {
      return { ...base, isCorrect: false };
    }
    return base;
  } catch (err) {
    console.error('[LLMVerifier] Conceptual verification failed:', err.message);
    return { ...unverifiable, error: err.message || 'llm_error' };
  }
}

/**
 * Verify an answer with a fast model, escalating to a stronger judge when the
 * fast model can't resolve it.
 *
 * Tier 1 (gpt-4o-mini) handles the common cases cheaply. When it returns no
 * usable verdict — low confidence, a parse failure, or an upstream error — we
 * escalate to Tier 2 (gpt-4o) rather than silently giving up, which is where the
 * tutor would otherwise be left to judge correctness itself (the false
 * affirm/reject risk). Missing-input cases never escalate (nothing to verify).
 *
 * Runs in parallel with the main tutor response, so the added latency lands
 * inside the generate window for the small share of turns that escalate.
 *
 * @param {string} problemText
 * @param {string} studentAnswer
 * @param {Object} [options] - forwarded to llmVerifyAnswer (model, confidenceThreshold)
 * @returns {Promise<Object>} verdict augmented with:
 *   - tier {string}: the model that produced the final verdict
 *   - escalated {boolean}: whether the stronger judge was invoked
 *   - escalationResolved {boolean}: whether escalation produced a usable verdict
 */
async function verifyWithEscalation(problemText, studentAnswer, options = {}) {
  const tier1Model = options.model || VERIFIER_MODEL;
  const first = await llmVerifyAnswer(problemText, studentAnswer, options);

  // Tier 1 resolved it — done.
  if (first.isCorrect !== null) {
    return { ...first, tier: tier1Model, escalated: false, escalationResolved: false };
  }
  // Nothing to verify — don't burn a stronger call on missing input.
  if (first.error === 'missing_input') {
    return { ...first, tier: tier1Model, escalated: false, escalationResolved: false };
  }

  // Tier 2: stronger judge for the hard/uncertain cases.
  const second = await llmVerifyAnswer(problemText, studentAnswer, {
    ...options,
    model: ESCALATION_MODEL,
  });
  return {
    ...second,
    tier: ESCALATION_MODEL,
    escalated: true,
    escalationResolved: second.isCorrect !== null,
  };
}

const hasContent = (m) => typeof m?.content === 'string' && m.content.trim().length > 0;
const hasProblemInfo = (m) => hasContent(m) && m.problemInfo && m.problemInfo.correctAnswer != null;
const looksMathy = (m) => hasContent(m) && (
  /\\\(|\\\[|\\frac|\$/.test(m.content) ||                 // LaTeX delimiters / macros
  /\d\s*[+\-*/=×÷^]|[+\-*/=×÷^]\s*\d/.test(m.content)      // a digit adjacent to an operator
);
const hasQuestion = (m) => hasContent(m) && m.content.includes('?');
const problemLike = (m) => hasProblemInfo(m) || looksMathy(m);

/**
 * Choose the assistant message that actually POSED the problem the student is
 * answering — not merely the most recent message, which is frequently a
 * pleasantry or follow-up ("Nice — ready for the next one?"). Verifying an
 * answer against the wrong text produces spurious correct/incorrect verdicts,
 * so we rank messages by how problem-like they are, newest-first within each
 * tier, and take the first hit:
 *
 *   1. Problem-like: carries stored problemInfo metadata (the persist stage
 *      recorded a posed problem with a correctAnswer), or contains math-looking
 *      content — LaTeX delimiters/macros, or a digit next to an operator.
 *   2. Contains a question mark — a question, possibly the problem.
 *   3. Fallback: the most recent non-empty message (the prior behavior, kept so
 *      we never return null where we previously found something).
 *
 * RECENCY BEATS METADATA within tier 1. The ranking used to sweep the whole
 * window for stored problemInfo before it would look at anything newer, so once
 * the tutor broke a problem into sub-questions the verifier kept grading against
 * the ORIGINAL problem several turns back. That is the AP Calculus AB failure of
 * 2026-07-28: the tutor asked "what value of x would make x - 3 equal zero?",
 * the student said "3", and the verifier — still holding "simplify
 * (x^2-9)/(x-3)" — reported the answer should be x+3 and marked them wrong. A
 * student answers the question they were just asked.
 *
 * Pure helper — safe to call from any stage.
 *
 * @param {Array<{content?: string, problemInfo?: Object|null}>} recentAssistantMessages
 *   Ordered oldest → newest.
 * @returns {string|null} The chosen problem text, or null if none found.
 */
function pickProblemContext(recentAssistantMessages) {
  if (!Array.isArray(recentAssistantMessages) || recentAssistantMessages.length === 0) {
    return null;
  }

  // Newest-first scan within each tier; first match wins.
  for (const tier of [problemLike, hasQuestion, hasContent]) {
    for (let i = recentAssistantMessages.length - 1; i >= 0; i--) {
      if (tier(recentAssistantMessages[i])) {
        return recentAssistantMessages[i].content;
      }
    }
  }
  return null;
}

/**
 * The question the student is actually replying to — the newest tutor message
 * that asks something or poses a problem.
 *
 * Distinct from pickProblemContext, which is allowed to reach back for a
 * solvable problem statement. Conceptual verification must never reach back:
 * the whole point is to judge the student's words against the question in front
 * of them.
 *
 * @param {Array<{content?: string, problemInfo?: Object|null}>} recentAssistantMessages
 * @returns {string|null}
 */
function pickPosedQuestion(recentAssistantMessages) {
  if (!Array.isArray(recentAssistantMessages) || recentAssistantMessages.length === 0) {
    return null;
  }
  for (let i = recentAssistantMessages.length - 1; i >= 0; i--) {
    const m = recentAssistantMessages[i];
    if (hasQuestion(m) || problemLike(m)) return m.content;
  }
  return null;
}

// Phrasings that ask for an IDEA even when the sentence is full of math. A
// question can be thick with LaTeX and still have no computable answer —
// "what distinguishes a vertical asymptote from a hole in f(x)=(x^2-9)/(x-3)?"
// looks maximally mathy and cannot be answered with a value.
const CONCEPTUAL_INTERROGATIVE = /\b(why\b|what\s+distinguishes|what'?s\s+the\s+difference|difference\s+between|what\s+does\s+.{0,40}\bmean|what\s+makes\s+.{0,40}\b(?:a|an|the)\b|how\s+(?:do|would|can)\s+you\s+(?:know|tell)|explain|describe|in\s+your\s+own\s+words|what\s+is\s+the\s+idea)\b/i;

/**
 * Is the tutor asking for an idea rather than a value?
 *
 * @param {string} questionText
 * @returns {boolean}
 */
function isConceptualQuestion(questionText) {
  if (!questionText || typeof questionText !== 'string') return false;
  if (!questionText.includes('?')) return false;
  if (CONCEPTUAL_INTERROGATIVE.test(questionText)) return true;
  return !looksMathy({ content: questionText });
}

/**
 * Did the student answer in words rather than with a value or an expression?
 *
 * Two or more real words is the bar. "x = 3" and "3" are not prose; "if its
 * zero on top too" is — and a value-matcher can only ever reject it.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isProseAnswer(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.length > 400) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.filter(w => /^[a-z][a-z']*$/i.test(w)).length >= 2;
}

// A true/false (or yes/no) question takes a POLARITY answer — a single word
// that is neither a value nor prose, so both existing conceptual gates miss it
// (each requires 2+ words) and the turn falls through to the value-matcher,
// which can only reject what it cannot parse. Production (AP Calculus AB,
// 2026-07-28, the post-#1360 confirmation run): tutor asked "True or false: a
// function can take two different inputs and give the same output" → student
// answered "true" (correct) → "Careful there—" and a re-ask instead of an
// affirmation. The answer regex is deliberately anchored: the polarity word
// (with an optional hedge prefix) must BE the whole message — "true story" or
// "no idea" must not route here.
const POLARITY_QUESTION_RX = /\btrue\s+or\s+false\b|\byes\s+or\s+no\b/i;
const POLARITY_ANSWER_RX = /^(?:i\s+(?:think|say|would\s+say)\s+|it'?s\s+|probably\s+|definitely\s+)?(?:true|false|yes|no|nope|yep|yeah|nah)[\s.!?]*$/i;

function isPolarityQuestion(questionText) {
  return typeof questionText === 'string' && POLARITY_QUESTION_RX.test(questionText);
}

function isPolarityAnswer(text) {
  return typeof text === 'string' && POLARITY_ANSWER_RX.test(text.trim());
}

module.exports = {
  llmVerifyAnswer,
  llmVerifyConceptual,
  isConceptualQuestion,
  isProseAnswer,
  isPolarityQuestion,
  isPolarityAnswer,
  verifyWithEscalation,
  pickProblemContext,
  pickPosedQuestion,
  VERIFIER_MODEL,
  ESCALATION_MODEL,
  CONFIDENCE_THRESHOLD,
  NEGATIVE_CONFIDENCE_THRESHOLD,
};
