'use strict';
/* ============================================================
   twinGenerator.js — generate a VERIFIED "twin" of a math problem.

   A twin is the SAME skill and structure as the student's problem but with
   DIFFERENT numbers, so the tutor can demonstrate the method on a parallel
   problem WITHOUT solving the student's own (the anti-cheat contract — see
   utils/worksheetGuard.js, which today only *instructs* the LLM to invent a
   parallel problem, with no computed answer).

   The whole point is trust: an LLM proposes the twin + its answer, then the
   deterministic CAS (utils/pipeline/symbolicVerifier) INDEPENDENTLY confirms the
   answer before the twin is ever used. A cheap model is safe here precisely
   because nothing ships unverified — a wrong answer fails the CAS check and we
   retry or fall back to today's behavior.

   Contract: generateVerifiedTwin() returns { ok:true, verified:true, ... } ONLY
   when the CAS confirmed the answer. Otherwise { ok:false } and the caller keeps
   the existing (LLM-improvised) behavior — this feature is strictly additive.
   ============================================================ */

const { callLLM } = require('./llmGateway');
const { symbolicVerify } = require('./pipeline/symbolicVerifier');
let logger;
try { logger = require('./logger').child({ module: 'twinGenerator' }); }
catch (_) { logger = { info() {}, warn() {}, error() {}, debug() {} }; }

const TWIN_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You generate a "twin" of a math problem: the SAME skill and structure, but DIFFERENT numbers, so a tutor can demonstrate the method on a parallel problem without solving the student's own.

Rules:
- Keep the skill and structure identical; change the numbers (and names/context if it's a word problem).
- The twin must NOT be the same problem — at least the key numbers must differ.
- Solve your twin yourself and give the answer.
- Provide fields that let a computer algebra system verify your answer INDEPENDENTLY.

Return STRICT JSON only:
{
  "twin": "<the twin problem, exactly as you'd show a student>",
  "problemTex": "<the twin in plain math notation, e.g. '3x - 5 = 16' or '\\\\int 6x^5 dx'>",
  "answer": "<your answer, e.g. 'x = 7' or 'x^6 + C' or '3x + 6'>",
  "checkType": "equation | antiderivative | equivalence | none",
  "checkAgainst": "<see below>"
}

Pick checkType and checkAgainst so the answer can be checked deterministically:
- "equation"        -> the twin is 'solve ... = ...'.  checkAgainst = the equation (same as problemTex).
- "antiderivative"  -> the twin is an indefinite integral.  checkAgainst = the integral (same as problemTex).
- "equivalence"     -> the twin is simplify / expand / factor.  checkAgainst = the ORIGINAL expression the answer must equal.
- "none"            -> none of the above (word problem, derivative, geometry, etc.).  checkAgainst = "".`;

// Tolerant JSON extraction (mirrors llmVerifier): try strict, then first {...}.
function parseJson(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  try { return JSON.parse(s); } catch (_) { /* try to salvage */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* give up */ } }
  return null;
}

function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }

/**
 * Independently confirm a proposed twin's answer with the CAS.
 * @returns {{verified: boolean, method: string}}
 */
function verifyTwin(t) {
  if (!t || t.answer == null) return { verified: false, method: 'none' };
  const type = t.checkType;
  const against = t.checkAgainst || t.problemTex;
  let r = { isCorrect: null, method: 'unverifiable' };
  try {
    if (type === 'equation' || type === 'antiderivative') {
      // symbolicVerify auto-detects: an integral problemTex -> antiderivative
      // path, an equation problemTex -> substitute-and-check path.
      r = symbolicVerify({ studentAnswer: t.answer, problemTex: against });
    } else if (type === 'equivalence') {
      r = symbolicVerify({ studentAnswer: t.answer, correctAnswer: against });
    }
  } catch (_) { /* stays unverifiable */ }
  return { verified: r.isCorrect === true, method: r.method };
}

/**
 * Generate a twin of `problemText` whose answer the CAS has confirmed.
 * @param {string} problemText  the student's problem (text/LaTeX)
 * @param {object} [opts]  { maxAttempts=2 }
 * @returns {Promise<{ok:boolean, verified?:boolean, twin?:string, problemTex?:string, answer?:string, method?:string, attempts?:number, reason?:string}>}
 */
async function generateVerifiedTwin(problemText, opts) {
  opts = opts || {};
  const maxAttempts = opts.maxAttempts || 2;
  if (!problemText || !String(problemText).trim()) return { ok: false, reason: 'no_problem' };
  const studentNorm = norm(problemText);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp;
    try {
      resp = await callLLM(TWIN_MODEL, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Student's problem:\n${String(problemText).slice(0, 1000)}\n\nGenerate a verified twin.` },
      ], { temperature: attempt === 1 ? 0.4 : 0.85, max_tokens: 500, response_format: { type: 'json_object' } });
    } catch (err) {
      logger.warn({ err: err && err.message, attempt }, 'twin LLM call failed');
      continue;
    }

    const raw = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
    const t = parseJson(raw);
    if (!t || !t.twin || t.answer == null) continue;

    // Anti-cheat guard: a twin that's verbatim the student's problem would leak
    // the student's own answer. Reject and retry with more variety.
    if (norm(t.twin) === studentNorm || norm(t.problemTex) === studentNorm) {
      logger.info({ attempt }, 'twin identical to student problem — rejecting');
      continue;
    }

    const v = verifyTwin(t);
    if (v.verified) {
      return { ok: true, verified: true, twin: t.twin, problemTex: t.problemTex, answer: t.answer, method: v.method, attempts: attempt };
    }
    logger.info({ attempt, checkType: t.checkType }, 'twin answer unverified by CAS — retrying');
  }
  // Couldn't produce a CAS-verified twin — caller falls back to existing behavior.
  return { ok: false, verified: false, reason: 'unverified' };
}

/**
 * Best-effort: attach a CAS-verified twin to a decision for the tutor to
 * co-solve. Mutates and returns `decision`. Never throws and only sets
 * `decision.verifiedTwin` when a twin was actually verified — so the caller's
 * gating (which actions warrant a twin) stays in the caller, and any failure
 * silently falls back to the improvised parallel problem in buildActionPrompt.
 *
 * @param {object} decision       the decide() result (mutated)
 * @param {string} problemText    the problem the student is stuck on
 * @returns {Promise<object>} the same decision
 */
async function attachVerifiedTwin(decision, problemText) {
  if (!decision || !problemText) return decision;
  try {
    const t = await generateVerifiedTwin(problemText);
    if (t.ok) decision.verifiedTwin = { twin: t.twin, answer: t.answer };
  } catch (_) { /* best-effort — improvised parallel problem remains the fallback */ }
  return decision;
}

module.exports = { generateVerifiedTwin, verifyTwin, attachVerifiedTwin, TWIN_MODEL };
