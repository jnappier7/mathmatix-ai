// utils/orchestrator/interruptClassifier.js
// Two-stage interrupt classifier: regex fast-path → gpt-4o-mini majority.
//
// The 0.80 / 0.55 thresholds in the brief are policy numbers, not real
// probabilities. gpt-4o-mini's self-reported confidence in a JSON field
// is poorly calibrated and reliably overconfident on short student
// utterances. So: when the LLM's self-confidence falls below 0.95, we
// run the call three times in parallel and take the majority. Ties
// resolve toward the lower-action label (LABEL_PRIORITY in types.js).
//
// All three votes share one prompt and one model — they're cheap (input
// is ~150 tokens, output is one JSON object). Three votes ≈ one round-
// trip when batched.

'use strict';

const { callLLM } = require('../openaiClient');
const { LABEL_PRIORITY, INTERRUPT_LABELS } = require('./types');
const logger = require('../logger').child({ module: 'interruptClassifier' });

const MODEL = process.env.INTERRUPT_CLASSIFIER_MODEL || 'gpt-4o-mini';
const HIGH_CONF_BYPASS = 0.95;
const NUM_VOTES = 3;

// ── Regex fast-path ─────────────────────────────────────────────────
// Order matters — first match wins. Patterns are tuned for short student
// utterances; longer ambiguous text falls through to the LLM.

const REGEX_RULES = [
  // control — explicit stop/cancel/restart
  { label: 'control', conf: 0.95,
    pattern: /^\s*(stop|wait stop|cancel|never\s*mind|nevermind|skip this|let'?s? move on|forget it|hold on stop)\s*[.!?]?\s*$/i },

  // clarification — "wait why", "but why", "what do you mean", "i don't get"
  { label: 'clarification', conf: 0.92,
    pattern: /\b(wait\s+why|why\s+(did|do|are|does|is)|but\s+why|what\s+do\s+you\s+mean|how\s+come|what'?s?\s+that|how\s+did\s+you|where\s+did\s+(that|the))\b/i },

  // confusion — "i don't get it", "i'm lost", "i don't understand"
  { label: 'confusion', conf: 0.9,
    pattern: /\b(i\s+(don'?t|do not)\s+(get|understand|follow)|i'?m\s+(lost|confused|stuck)|this\s+is\s+confusing|i\s+don'?t\s+know\s+what)\b/i },

  // answer_attempt — "is it X", "the answer is", "x equals/is N", bare number
  { label: 'answer_attempt', conf: 0.85,
    pattern: /^\s*(is\s+it|the\s+answer\s+is|i\s+think\s+(it'?s|its)|so\s+it'?s|its?\s+|x\s*(=|equals|is)\s|y\s*(=|equals|is)\s)/i },
  { label: 'answer_attempt', conf: 0.7,
    // Bare number with optional sign — only fires when student utterance
    // is short (<= 6 words) to avoid matching "we add 5 to both sides"
    pattern: /^[\s\-]*(?:negative\s+|minus\s+)?\d+(?:\s*\/\s*\d+|\.\d+)?\s*[.!?]?\s*$/i },

  // off_track — "can we talk about", "what about my homework", topic switch markers
  { label: 'off_track', conf: 0.85,
    pattern: /\b(can\s+we\s+talk\s+about|what\s+about\s+(my|the)\s+(homework|test|quiz)|change\s+(the\s+)?subject|different\s+problem)\b/i },
];

function classifyRegex(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  // Word-count gate for the bare-number rule: refuse to match if the
  // utterance has more than 6 words (prevents "now we add 5 to both sides"
  // → answer_attempt).
  const wordCount = t.split(/\s+/).length;
  for (const rule of REGEX_RULES) {
    if (rule.pattern.test(t)) {
      if (rule.label === 'answer_attempt' && rule.conf === 0.7 && wordCount > 6) continue;
      return {
        label: rule.label,
        confidence: rule.conf,
        source: 'regex',
        reasoning: `regex rule: ${rule.pattern.source}`,
      };
    }
  }
  return null;
}

// ── LLM path ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an interrupt classifier for a tutoring system. The student
interrupted the AI tutor mid-explanation. Classify the student's utterance
into exactly one label:

- clarification: asking why/how the tutor did something
- answer_attempt: trying to give an answer to the current problem
- confusion: signaling they're lost / don't understand
- off_track: changing the subject / asking about something else
- control: stop / cancel / move on / restart

Respond with ONLY a JSON object:
{"label": "<label>", "confidence": <0.0-1.0>, "ambiguity": "<low|medium|high>", "reasoning": "<one short sentence>"}

Confidence reflects how unambiguous the label is. Use ambiguity=high if the
utterance could plausibly be two of the labels.`;

async function classifyLLMOnce(studentText, ctx, signal) {
  const userMsg = buildUserMessage(studentText, ctx);
  const completion = await callLLM(MODEL, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ], {
    temperature: 0.1,
    max_tokens: 120,
    response_format: { type: 'json_object' },
    signal,
  });
  const raw = completion?.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!parsed.label || !INTERRUPT_LABELS.includes(parsed.label)) return null;
  return {
    label: parsed.label,
    confidence: typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5,
    ambiguity: parsed.ambiguity || 'medium',
    reasoning: parsed.reasoning || '',
    source: 'llm',
  };
}

function buildUserMessage(studentText, ctx) {
  const parts = [];
  if (ctx?.currentPhase) parts.push(`Phase: ${ctx.currentPhase}`);
  if (ctx?.currentMode) parts.push(`Mode: ${ctx.currentMode}`);
  if (ctx?.lastSegmentSpoken) {
    const t = String(ctx.lastSegmentSpoken).slice(0, 200);
    parts.push(`AI was just saying: "${t}"`);
  }
  if (ctx?.lastBoardOpType) parts.push(`Last board action: ${ctx.lastBoardOpType}`);
  parts.push(`Student said: "${studentText}"`);
  return parts.join('\n');
}

/**
 * Three-vote majority. Takes ties toward the lower-action label per
 * LABEL_PRIORITY (clarification < answer_attempt < confusion < off_track
 * < control). This keeps an ambiguous interrupt from auto-escalating
 * into a turn-aborting `control`.
 *
 * @param {Array<{label:string, confidence:number}>} votes
 * @returns {{label:string, confidence:number, consensus:'unanimous'|'majority'|'split'}}
 */
function resolveVotes(votes) {
  const counts = {};
  for (const v of votes) {
    if (!v) continue;
    counts[v.label] = (counts[v.label] || 0) + 1;
  }
  const labels = Object.keys(counts);
  if (labels.length === 0) {
    return { label: 'clarification', confidence: 0.4, consensus: 'split' };
  }
  // Highest-count wins. Tiebreak by LABEL_PRIORITY index (lower = preferred).
  labels.sort((a, b) => {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return LABEL_PRIORITY.indexOf(a) - LABEL_PRIORITY.indexOf(b);
  });
  const winner = labels[0];
  const winnerCount = counts[winner];
  const totalVotes = votes.filter(Boolean).length;
  const consensus = winnerCount === totalVotes ? 'unanimous'
    : winnerCount > totalVotes / 2 ? 'majority' : 'split';
  // Confidence = average self-confidence among the winning votes
  const winnerConfs = votes.filter(v => v && v.label === winner).map(v => v.confidence);
  const avgConf = winnerConfs.reduce((a, b) => a + b, 0) / Math.max(winnerConfs.length, 1);
  return {
    label: winner,
    confidence: avgConf,
    consensus,
  };
}

/**
 * Classify a student interrupt. Tries regex first, then LLM.
 *
 * @param {string} studentText
 * @param {Object} ctx                          Orchestrator context.
 * @param {string} [ctx.currentPhase]
 * @param {string} [ctx.currentMode]
 * @param {string} [ctx.lastSegmentSpoken]
 * @param {string} [ctx.lastBoardOpType]
 * @param {AbortSignal} [ctx.signal]
 * @returns {Promise<{label:string, confidence:number, source:'regex'|'llm', consensus?:string, reasoning?:string}>}
 */
async function classify(studentText, ctx = {}) {
  const fast = classifyRegex(studentText);
  if (fast) return fast;

  // First LLM call — single shot
  let primary;
  try {
    primary = await classifyLLMOnce(studentText, ctx, ctx.signal);
  } catch (err) {
    if (ctx.signal?.aborted) throw err;
    logger.warn('interrupt classify llm error', { error: err.message });
    return { label: 'clarification', confidence: 0.4, source: 'llm_fallback', consensus: 'split' };
  }
  if (!primary) {
    return { label: 'clarification', confidence: 0.4, source: 'llm_fallback', consensus: 'split' };
  }
  if (primary.confidence >= HIGH_CONF_BYPASS) {
    return { ...primary, consensus: 'unanimous' };
  }

  // Sub-confident — kick off two more votes in parallel and resolve
  const [v2, v3] = await Promise.all([
    classifyLLMOnce(studentText, ctx, ctx.signal).catch(() => null),
    classifyLLMOnce(studentText, ctx, ctx.signal).catch(() => null),
  ]);
  const resolved = resolveVotes([primary, v2, v3]);
  return {
    label: resolved.label,
    confidence: resolved.confidence,
    consensus: resolved.consensus,
    source: 'llm',
    reasoning: primary.reasoning,
    voteBreakdown: { primary: primary.label, v2: v2?.label || null, v3: v3?.label || null },
  };
}

module.exports = {
  classify,
  classifyRegex,
  resolveVotes,
  HIGH_CONF_BYPASS,
};
