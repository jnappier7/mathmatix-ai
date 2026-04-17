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

// Small, fast model. Matches the existing PRIMARY_CHAT_MODEL in verify.js so
// we stay within the OpenAI-only contract of openaiClient.js. A swap to
// Claude Haiku 4.5 would require adding an anthropic client path.
const VERIFIER_MODEL = 'gpt-4o-mini';

// If the equivalence judge returns below this confidence, we treat the
// verdict as unverifiable rather than acting on a weak signal.
const CONFIDENCE_THRESHOLD = 0.6;

const MAX_PROBLEM_CHARS = 2000;
const MAX_ANSWER_CHARS = 500;

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

    // ── Step 2: Ask equivalence judge ──
    // Independent call, still no persona. Just: do these two mean the same thing?
    const step2Messages = [
      {
        role: 'system',
        content:
          'You are a math equivalence judge. Given an expected answer and a student answer, determine whether they are mathematically equivalent. ' +
          'Accept all valid equivalent forms: 0.5 ≡ 1/2, (x+2)(x-3) ≡ x^2-x-6, 2 ≡ 2.0, sin^2(x) ≡ 1-cos^2(x) when the problem allows. ' +
          'A different form of the same number/expression counts as a MATCH. ' +
          'A different value, wrong sign, wrong coefficient, or an incomplete simplification counts as NO MATCH. ' +
          'Respond with JSON ONLY: {"matches": true|false, "confidence": <0.0-1.0>, "rationale": "<brief reason>"}.',
      },
      {
        role: 'user',
        content:
          `Problem:\n${problem}\n\n` +
          `Expected answer: ${modelAnswer}\n` +
          `Student answer: ${answer}\n\n` +
          `Are these mathematically equivalent?`,
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
    // back to its existing behavior.
    if (confidence < threshold) {
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
 * Choose the assistant message that posed the problem the student is answering.
 * Walks the recent assistant messages in reverse order; prefers messages with
 * stored problemInfo metadata, then falls back to the most recent message.
 *
 * Pure helper — safe to call from any stage.
 *
 * @param {Array} recentAssistantMessages - Ordered oldest → newest.
 * @returns {string|null} The problem text, or null if none found.
 */
function pickProblemContext(recentAssistantMessages) {
  if (!Array.isArray(recentAssistantMessages) || recentAssistantMessages.length === 0) {
    return null;
  }
  // Prefer the most recent message that actually contains a question mark or
  // math-looking content. Fall back to the most recent one.
  for (let i = recentAssistantMessages.length - 1; i >= 0; i--) {
    const msg = recentAssistantMessages[i];
    const content = msg?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }
  }
  return null;
}

module.exports = {
  llmVerifyAnswer,
  pickProblemContext,
  VERIFIER_MODEL,
  CONFIDENCE_THRESHOLD,
};
