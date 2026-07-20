/**
 * TEACH-BACK — the top rung of the mastery ladder.
 *
 * The student explains a skill while the tutor plays a confused student with a
 * plausible misconception; the explanation is rubric-scored, and a passing score
 * advances the skill to rung 'taught' (see utils/skillRung.js). It is the rarest,
 * highest-status proof because it is the hardest to fake: you cannot pattern-match
 * your way through explaining WHY something works to someone who has it wrong.
 *
 * FAIL-SAFE. Teaching is the top rung, so a scorer that cannot reach a verdict
 * must NOT resolve it either way. An LLM outage returns { scored: false } and the
 * caller tells the student to try again — never an unearned 'taught', never a
 * penalty for our infrastructure failing. That asymmetry is deliberate: a false
 * grant corrupts the map, and a false failure teaches the student not to bother.
 *
 * The LLM call is injected so this is unit-testable without a live model, and it
 * routes through utils/llmGateway (PII-anonymized) in production.
 */

const { GATES } = require('./skillRung');

const PASS = GATES.TEACH_MIN_RUBRIC;   // 3 of 4
const MAX = GATES.TEACH_RUBRIC_MAX;    // 4

// Below this the explanation is too thin to be a teach-back at all — a cheap
// anti-gaming guard applied before we spend an LLM call. Intentionally low so a
// terse-but-correct explanation is judged on merit, not length.
const MIN_WORDS = 12;

const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

/**
 * The misconception the student must talk their confused peer out of.
 *
 * Prefers a real, skill-specific mistake from the catalog's teachingGuidance so
 * the challenge is authentic; falls back to a generic prompt. Pure — no LLM — so
 * starting a teach-back is deterministic and cheap.
 */
function confusedStudentOpener(skill) {
  const label = skill?.studentLabel || skill?.displayName || 'this skill';
  const mistakes = skill?.teachingGuidance?.commonMistakes || [];
  if (mistakes.length) {
    // Vary by skill id rather than at random so the opener is stable per skill
    // (Math.random is unavailable here anyway).
    const idx = Math.abs(hash(skill.skillId || label)) % mistakes.length;
    return {
      misconception: mistakes[idx],
      prompt: `Okay, I think I get ${label}, but here's what I keep doing: ${mistakes[idx]} — is that right? Can you explain it to me?`
    };
  }
  return {
    misconception: null,
    prompt: `I'm a bit lost on ${label}. Can you explain it to me like I've never seen it — and tell me WHY it works, not just the steps?`
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Build the scoring prompt. Separated out so tests can assert what we ask the
 * model, and so the rubric is visible in one place rather than buried in a string.
 */
function buildScoringPrompt({ skill, explanation, misconception }) {
  const label = skill?.studentLabel || skill?.displayName || 'the skill';
  return [
    `You are grading a "teach-back": a student is explaining "${label}" to a confused peer,`,
    `to prove they truly understand it. Grade ONLY the explanation below, strictly.`,
    misconception ? `The confused peer's mistake was: "${misconception}". A strong explanation addresses it head-on.` : '',
    ``,
    `Score each dimension 0-1, then give an overall 0-${MAX} (their sum, rounded):`,
    `- correct: is it mathematically accurate? (an error here should cap the overall low)`,
    `- complete: does it cover the key idea, not just one piece?`,
    `- why: does it explain WHY, the reasoning — not only the steps/what?`,
    `- addresses: does it correct the peer's specific misconception? (score 1 if no misconception was given and the explanation is sound)`,
    ``,
    `A passing teach-back is ${PASS}+ and MUST be mathematically correct.`,
    `Return ONLY JSON: {"correct":0|1,"complete":0|1,"why":0|1,"addresses":0|1,"overall":0-${MAX},"feedback":"one specific sentence"}`,
    ``,
    `STUDENT EXPLANATION:`,
    explanation
  ].filter(Boolean).join('\n');
}

/**
 * Parse and sanity-check the model's JSON. Returns null if it is unusable, so the
 * caller treats it as "could not score" rather than trusting a malformed verdict.
 */
function parseVerdict(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { obj = JSON.parse(match[0]); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dims = {
    correct: num(obj.correct),
    complete: num(obj.complete),
    why: num(obj.why),
    addresses: num(obj.addresses)
  };
  let overall = num(obj.overall);
  if (overall === null && Object.values(dims).every((v) => v !== null)) {
    overall = dims.correct + dims.complete + dims.why + dims.addresses;
  }
  if (overall === null) return null;
  overall = Math.max(0, Math.min(MAX, overall));
  return { dimensions: dims, overall, feedback: typeof obj.feedback === 'string' ? obj.feedback : '' };
}

/**
 * Score a teach-back explanation.
 *
 * @param {Object} args
 * @param {Object} args.skill        the Skill doc (for label + misconception)
 * @param {string} args.explanation  the student's explanation
 * @param {string} [args.misconception] the peer mistake the opener posed
 * @param {Object} [deps]
 * @param {Function} [deps.llm]  async (prompt, opts) => string|object; defaults to llmGateway.reason
 * @param {Object}  [deps.user] passed to the gateway for PII anonymization
 * @returns {Promise<{scored:boolean, passed?:boolean, score?:number, dimensions?:object, feedback?:string, reason?:string}>}
 */
async function scoreTeachBack({ skill, explanation, misconception }, deps = {}) {
  if (wordCount(explanation) < MIN_WORDS) {
    // Deterministic, no LLM: this is not yet a teach-back. Not a penalty — the
    // student simply has not explained anything yet.
    return { scored: true, passed: false, score: 0, feedback: `Say more — walk me through it like I've never seen ${skill?.studentLabel || 'it'}.` };
  }

  const llm = deps.llm || defaultLlm;
  const prompt = buildScoringPrompt({ skill, explanation, misconception });

  let verdict = null;
  try {
    const raw = await llm(prompt, { user: deps.user, temperature: 0.2, maxTokens: 300 });
    verdict = parseVerdict(raw);
  } catch (err) {
    return { scored: false, reason: `scorer unavailable: ${err.message}` };
  }
  if (!verdict) return { scored: false, reason: 'scorer returned an unusable verdict' };

  // A mathematically incorrect explanation cannot pass, whatever the sum says —
  // teaching something wrong is worse than not teaching it.
  const mathWrong = verdict.dimensions.correct === 0;
  const passed = !mathWrong && verdict.overall >= PASS;

  return {
    scored: true,
    passed,
    score: verdict.overall,
    dimensions: verdict.dimensions,
    feedback: verdict.feedback
  };
}

async function defaultLlm(prompt, opts) {
  // Lazy require so unit tests that inject `llm` never load the gateway (which
  // pulls in the OpenAI client and needs an API key at construct time).
  const { reason } = require('./llmGateway');
  return reason(prompt, opts);
}

module.exports = {
  PASS,
  MAX,
  MIN_WORDS,
  confusedStudentOpener,
  buildScoringPrompt,
  parseVerdict,
  scoreTeachBack
};
