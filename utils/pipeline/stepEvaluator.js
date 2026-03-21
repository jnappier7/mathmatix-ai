/**
 * STEP EVALUATOR — Backend-driven progression engine
 *
 * Replaces the old system where the teaching LLM had to emit
 * <SCAFFOLD_ADVANCE> tags. Now the AI just teaches; the backend
 * decides when a step is complete.
 *
 * Two modes:
 *   1. Deterministic — practice steps: count correct answers (no LLM needed)
 *   2. LLM evaluator — explanation/model steps: a tiny, focused sidecar call
 *      inspects the last few exchanges and judges completion
 *
 * The evaluator is deliberately narrow. It sees:
 *   - The step objective
 *   - The step type
 *   - The last 3-4 exchanges
 *   - Optional success signals from the step JSON
 *
 * It does NOT see the full system prompt, lesson plan, or teaching
 * instructions. Its only job: "Is this step done?"
 *
 * @module pipeline/stepEvaluator
 */

const { callLLM } = require('../openaiClient');

// ── Step type → completion mode mapping ──
// These defaults apply when the step JSON has no explicit `completion` field.
const PRACTICE_TYPES = new Set([
  'guided_practice', 'independent_practice', 'we-do', 'you-do', 'mastery-check',
]);

const EXPLANATION_TYPES = new Set([
  'explanation', 'concept-intro',
]);

const MODEL_TYPES = new Set([
  'model', 'i-do',
]);

const CHECK_TYPES = new Set([
  'check-in', 'concept-check',
]);

// Minimum correct answers for practice steps (matches coursePersist constant)
const MIN_CORRECT_FOR_ADVANCE = 2;

// Minimum assistant turns before we even consider evaluating explanation/model steps.
// Prevents advancing on the very first exchange.
const MIN_TURNS_BEFORE_EVAL = 2;

// The small, fast model used for evaluation sidecar calls
const EVAL_MODEL = 'gpt-4o-mini';

/**
 * Evaluate whether the current scaffold step is complete.
 *
 * @param {Object} step - Current scaffold step from module JSON
 * @param {Object} conversation - Mongoose conversation document
 * @param {Object} options
 * @param {boolean} options.wasCorrect - Whether the latest answer was correct
 * @param {boolean} options.isParentCourse - Parent courses have lower bar
 * @returns {Promise<Object>} { complete: boolean, mode: string, confidence: number, evidence: string }
 */
async function evaluateStepCompletion(step, conversation, options = {}) {
  if (!step) {
    return { complete: false, mode: 'none', confidence: 0, evidence: 'No step provided' };
  }

  const stepType = step.type || step.lessonPhase || '';
  const completion = step.completion || {};
  const mode = completion.mode || inferCompletionMode(stepType);

  switch (mode) {
    case 'deterministic':
      return evaluateDeterministic(step, conversation, options);

    case 'llm_eval':
      return evaluateLlmSidecar(step, conversation, options);

    case 'turn_count':
      return evaluateTurnCount(step, conversation, options);

    default:
      // Unknown mode — fall back to turn count
      return evaluateTurnCount(step, conversation, options);
  }
}

/**
 * Infer completion mode from step type when no explicit completion config exists.
 */
function inferCompletionMode(stepType) {
  if (PRACTICE_TYPES.has(stepType)) return 'deterministic';
  if (EXPLANATION_TYPES.has(stepType)) return 'llm_eval';
  if (MODEL_TYPES.has(stepType)) return 'llm_eval';
  if (CHECK_TYPES.has(stepType)) return 'llm_eval';
  return 'llm_eval'; // Default: ask the evaluator
}

/**
 * Deterministic evaluation for practice steps.
 * Counts correct answers since the last scaffold advance.
 * No LLM call needed.
 */
function evaluateDeterministic(step, conversation, options = {}) {
  const minCorrect = step.completion?.min_correct || MIN_CORRECT_FOR_ADVANCE;
  const messages = conversation?.messages || [];

  let correctSinceLastAdvance = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.scaffoldAdvanced) break;
    if (msg.problemResult === 'correct') correctSinceLastAdvance++;
  }

  // Include the current turn's result if it was correct
  if (options.wasCorrect) correctSinceLastAdvance++;

  const complete = options.isParentCourse || correctSinceLastAdvance >= minCorrect;

  return {
    complete,
    mode: 'deterministic',
    confidence: complete ? 1.0 : correctSinceLastAdvance / minCorrect,
    evidence: `${correctSinceLastAdvance}/${minCorrect} correct answers since last advance`,
  };
}

/**
 * LLM sidecar evaluation for explanation and model steps.
 * Makes a tiny, focused call to judge whether the step objective has been met.
 */
async function evaluateLlmSidecar(step, conversation, options = {}) {
  const messages = conversation?.messages || [];

  // Count assistant turns since last advance
  let assistantTurnsSinceAdvance = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.scaffoldAdvanced) break;
    if (msg.role === 'assistant') assistantTurnsSinceAdvance++;
  }

  // Don't evaluate too early — let the teaching happen first
  if (assistantTurnsSinceAdvance < MIN_TURNS_BEFORE_EVAL) {
    return {
      complete: false,
      mode: 'llm_eval',
      confidence: 0,
      evidence: `Only ${assistantTurnsSinceAdvance} assistant turns — too early to evaluate`,
    };
  }

  // Parent courses: lower bar — if student engaged for 2+ turns, advance
  if (options.isParentCourse && assistantTurnsSinceAdvance >= 2) {
    return {
      complete: true,
      mode: 'llm_eval_parent',
      confidence: 0.9,
      evidence: 'Parent course: engagement threshold met',
    };
  }

  // Extract the last few exchanges (not the whole conversation)
  const recentExchanges = extractRecentExchanges(messages, 4);
  if (recentExchanges.length === 0) {
    return {
      complete: false,
      mode: 'llm_eval',
      confidence: 0,
      evidence: 'No recent exchanges to evaluate',
    };
  }

  // Build the evaluator prompt
  const stepType = step.type || step.lessonPhase || '';
  const objective = step.completion?.objective || step.title || step.skill || 'Complete this step';
  const successSignals = step.completion?.success_signals || getDefaultSuccessSignals(stepType);

  const evalPrompt = buildEvalPrompt(stepType, objective, successSignals, recentExchanges);

  try {
    const completion = await callLLM(EVAL_MODEL, [
      { role: 'system', content: evalPrompt },
    ], { temperature: 0, max_tokens: 150 });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    return parseEvalResponse(raw);
  } catch (err) {
    console.error('[StepEvaluator] LLM eval failed:', err.message);
    // On failure, don't block — use turn-count fallback
    return evaluateTurnCount(step, conversation, options);
  }
}

/**
 * Turn-count fallback — used when LLM eval fails or for unknown step types.
 * If enough teaching has happened, advance.
 */
function evaluateTurnCount(step, conversation, options = {}) {
  const messages = conversation?.messages || [];
  const stepType = step.type || step.lessonPhase || '';

  // Thresholds by step type — how many assistant turns before we advance
  const thresholds = {
    'explanation': 3, 'concept-intro': 3,
    'model': 4, 'i-do': 4,
    'check-in': 2, 'concept-check': 2,
  };
  const threshold = step.completion?.turn_threshold || thresholds[stepType] || 4;

  let assistantTurnsSinceAdvance = 0;
  let studentResponded = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.scaffoldAdvanced) break;
    if (msg.role === 'assistant') assistantTurnsSinceAdvance++;
    if (msg.role === 'user') studentResponded = true;
  }

  const complete = assistantTurnsSinceAdvance >= threshold && studentResponded;

  return {
    complete,
    mode: 'turn_count',
    confidence: complete ? 0.7 : 0,
    evidence: `${assistantTurnsSinceAdvance}/${threshold} assistant turns${studentResponded ? ', student responded' : ', awaiting student'}`,
  };
}

// ── Helpers ──

/**
 * Extract the last N exchanges (user + assistant pairs) since the last advance.
 */
function extractRecentExchanges(messages, maxPairs) {
  const exchanges = [];
  let count = 0;

  for (let i = messages.length - 1; i >= 0 && count < maxPairs * 2; i--) {
    const msg = messages[i];
    if (msg.scaffoldAdvanced && exchanges.length > 0) break;
    if (msg.role === 'user' || msg.role === 'assistant') {
      exchanges.unshift({ role: msg.role, content: (msg.content || '').substring(0, 500) });
      count++;
    }
  }

  return exchanges;
}

/**
 * Default success signals by step type (used when step JSON has none).
 */
function getDefaultSuccessSignals(stepType) {
  if (EXPLANATION_TYPES.has(stepType)) {
    return [
      'Student engaged with the concept (asked a question, answered a check, or paraphrased)',
      'Student demonstrated understanding beyond just saying "got it"',
    ];
  }
  if (MODEL_TYPES.has(stepType)) {
    return [
      'AI presented the worked example',
      'Student answered a follow-up question or demonstrated comprehension',
    ];
  }
  if (CHECK_TYPES.has(stepType)) {
    return [
      'Student responded to the check-in question',
      'Student demonstrated engagement with the material',
    ];
  }
  return ['Student engaged with the content'];
}

/**
 * Build the evaluator prompt. Deliberately tiny and focused.
 */
function buildEvalPrompt(stepType, objective, successSignals, exchanges) {
  const exchangeText = exchanges.map(e =>
    `${e.role === 'user' ? 'STUDENT' : 'TUTOR'}: ${e.content}`
  ).join('\n\n');

  const signalList = successSignals.map(s => `  - ${s}`).join('\n');

  return `You are a step-completion evaluator for a math tutoring system.
Your ONLY job: decide if the current teaching step is complete.

STEP TYPE: ${stepType}
OBJECTIVE: ${objective}

COMPLETION SIGNALS (what "done" looks like):
${signalList}

RECENT EXCHANGES:
${exchangeText}

IMPORTANT:
- "understood" = student showed real evidence of engagement or understanding
- "not_yet" = teaching is still in progress or student hasn't engaged enough
- "unclear" = student responded but it's ambiguous whether they understand
- A student saying "ok" or "got it" alone is NOT sufficient evidence — they must demonstrate engagement
- If the tutor just introduced the concept and asked a question, but the student hasn't answered yet, that is "not_yet"

Respond with ONLY this JSON (no other text):
{"status":"understood|not_yet|unclear","confidence":0.0-1.0,"evidence":"one sentence reason"}`;
}

/**
 * Parse the evaluator's JSON response into our standard format.
 */
function parseEvalResponse(raw) {
  try {
    // Handle potential markdown code blocks
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const status = parsed.status || 'not_yet';
    const confidence = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0));
    const evidence = parsed.evidence || 'No evidence provided';

    return {
      complete: status === 'understood',
      mode: 'llm_eval',
      confidence,
      evidence,
      status, // Preserve the three-way status
    };
  } catch (err) {
    console.warn('[StepEvaluator] Failed to parse eval response:', raw);
    return {
      complete: false,
      mode: 'llm_eval',
      confidence: 0,
      evidence: `Parse error: ${raw.substring(0, 100)}`,
    };
  }
}

module.exports = {
  evaluateStepCompletion,
  // Exported for testing
  evaluateDeterministic,
  evaluateLlmSidecar,
  evaluateTurnCount,
  inferCompletionMode,
  extractRecentExchanges,
  buildEvalPrompt,
  parseEvalResponse,
  MIN_CORRECT_FOR_ADVANCE,
  MIN_TURNS_BEFORE_EVAL,
};
