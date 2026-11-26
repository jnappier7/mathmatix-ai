/**
 * The open question: one record of what the tutor just asked, written when the
 * tutor asks it.
 *
 * Every grader in diagnose re-derives "which question is the student
 * answering?" from text, on the student's turn, each in its own way — the
 * pose-time stamp, the board pin, the newest-turn rule, the root-set override,
 * the verifier's pickProblemContext. Each is exact about the problem it holds;
 * the bugs are in which problem that is (owner session, 2026-11-25: four
 * correct answers stamped incorrect, every one against the wrong question).
 *
 * This module answers the question ONCE, at the moment it is unambiguous: when
 * the tutor's reply is written. A reader model — the verifier's, never the
 * tutor's own — reads the reply with the board problem beside it and records
 *
 *   kind        what sort of ask it is (final / substep / parallel / set /
 *               method / conceptual / none)
 *   question    the ask restated with its givens, so grading it later needs no
 *               other message ("each fraction" becomes 3/4 and 2/3)
 *   answer      its key, or null when the ask has no single answer
 *   finalAnswer the board problem's final answer, so a student who jumps ahead
 *               of a sub-step is recognised as having finished, not failed
 *
 * and the student's next message is graded against that record alone.
 *
 * SHADOW ONLY, for now. The record is stamped and graded on every turn, and
 * the result is compared with the verdict the current graders gave
 * (verifyMetrics → GET /api/admin/structured-tutor-metrics `openQuestion`,
 * and the verdict eval's shadow scoreboard). It decides nothing a student
 * sees until that comparison says it should. OPEN_QUESTION=off disables it.
 *
 * @module utils/pipeline/openQuestion
 */

const {
  verifierCall,
  parseVerdict,
  boardProblemStatement,
  VERIFIER_MODEL,
  CONFIDENCE_THRESHOLD,
  NEGATIVE_CONFIDENCE_THRESHOLD,
} = require('./llmVerifier');
const { symbolicVerify } = require('./symbolicVerifier');
const { verifyAnswer } = require('../mathSolver');

const KINDS = ['final', 'substep', 'parallel', 'set', 'method', 'conceptual', 'none'];
// Asks with one right answer. The others are graded elsewhere, not against a
// key: ideas by the conceptual judge, methods by the method audit, and a
// numbered set item by item (batchGrading.js) — one judge reading five answers
// at once let a wrong fifth through (verdict eval, 2026-11-25).
const KEYED_KINDS = new Set(['final', 'substep', 'parallel']);
const MAX_CHARS = 2000;
const DECLARE_TIMEOUT_MS = 8000;
// Enough to reach the problem a sub-question belongs to when no board holds it.
const HISTORY_TURNS = 8;

const enabled = () => String(process.env.OPEN_QUESTION || '').toLowerCase() !== 'off';

const clip = (s, n = MAX_CHARS) => String(s == null ? '' : s).trim().slice(0, n);
const shortText = (v, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

// The student's first name never leaves in a prompt; the tutor's replies use it.
function redact(text, firstName) {
  if (!text || !firstName || String(firstName).trim().length < 2) return text;
  const name = String(firstName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(`\\b${name}\\b`, 'gi'), '[Student]');
}

const DECLARE_SYSTEM =
  'You read ONE turn of a math tutoring conversation and record what the tutor has just asked the student. ' +
  'You are not the tutor and you do not reply to the student. Respond with JSON ONLY:\n' +
  '{"kind": "final|substep|parallel|set|method|conceptual|none", "question": "<string>", "answer": "<string or null>", "finalAnswer": "<string or null>"}\n\n' +
  'kind — what the tutor is asking for RIGHT NOW:\n' +
  '- "final": the answer to the whole problem (the one being worked on, or a new problem this turn poses).\n' +
  '- "substep": one intermediate value or expression on the way to it.\n' +
  '- "parallel": something about a DIFFERENT example problem the tutor brought in.\n' +
  '- "set": several separate problems posed at once (a numbered list to work through).\n' +
  '- "method": what to do, which step comes next, or how — no single value answers it.\n' +
  '- "conceptual": an idea or explanation in words.\n' +
  '- "none": nothing is asked (a confirmation, encouragement, "ready for another?").\n' +
  'When the turn asks several things, record the one the student must answer now. A step the tutor only announces for later ' +
  '("what is 1/3 of 24? Then we\'ll subtract that from 24") has not been asked yet.\n\n' +
  'question — that ask, restated so it stands completely on its own: put in every given it refers to ' +
  '("each fraction" becomes the actual fractions, "the radius" becomes its value). One or two sentences.\n\n' +
  'answer — the correct answer to `question`, worked carefully. ONLY the answer: a short string in simplest standard form, no working and no sentence. ' +
  'For two values write them together ("9 and 8"); for a solution set, "x = 7 or x = -2". ' +
  'null when kind is set, method, conceptual or none, or when the answer cannot be determined from what you were given.\n\n' +
  'finalAnswer — the final answer to the WHOLE problem the student is working on: "The problem on the board" when one is given, ' +
  'otherwise the problem the student brought or was set earlier in the conversation. Work it out whenever that problem is stated, ' +
  'whatever the tutor is asking about right now — a sub-step, a parallel example, a check. ONLY the answer, as a short string. ' +
  'It is ALWAYS about the student\'s own problem, never about a parallel example the tutor brought in. ' +
  'null only when no such problem is stated or it cannot be worked out. For a "final" ask it equals `answer`.';

/**
 * Read a tutor reply and record its open question.
 *
 * @param {Object} args
 * @param {string} args.reply            the tutor's reply as the student sees it
 * @param {string|null} [args.boardProblem]  the board problem as posed (llmVerifier.boardProblemStatement)
 * @param {Array<{role:string, content:string}>} [args.history]  the turns before it, oldest first
 * @param {string|null} [args.firstName]     redacted from everything sent
 * @param {string} [args.model]
 * @returns {Promise<{kind:string, question:string|null, answer:string|null, finalAnswer:string|null, model:string}|null>}
 *   null when disabled, on any failure, or when the reader's output is unusable. Never rejects.
 */
async function declareOpenQuestion({ reply, boardProblem = null, history = [], firstName = null, model } = {}) {
  if (!enabled() || !reply || typeof reply !== 'string' || !reply.trim()) return null;
  const use = model || VERIFIER_MODEL;
  const r = (t) => redact(t, firstName);
  const earlier = (Array.isArray(history) ? history : []).slice(-HISTORY_TURNS)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${clip(r(m.content), 500)}`)
    .join('\n');
  const user =
    (boardProblem ? `The problem on the board:\n${clip(r(boardProblem))}\n\n` : '')
    + (earlier ? `Earlier in the conversation (context only):\n${earlier}\n\n` : '')
    + `The tutor's turn to record:\n${clip(r(reply))}`;
  try {
    const res = await verifierCall(use, [
      { role: 'system', content: DECLARE_SYSTEM },
      { role: 'user', content: user },
    ], { temperature: 0, max_tokens: 400, response_format: { type: 'json_object' } });
    const parsed = parseVerdict(res?.choices?.[0]?.message?.content?.trim() || '');
    if (!parsed || !KINDS.includes(parsed.kind)) return null;
    const keyed = KEYED_KINDS.has(parsed.kind);
    return {
      kind: parsed.kind,
      question: shortText(parsed.question, 600),
      answer: keyed ? shortText(parsed.answer) : null,
      finalAnswer: shortText(parsed.finalAnswer),
      model: use,
    };
  } catch (err) {
    console.error('[OpenQuestion] declare failed (non-fatal):', err.message);
    return null;
  }
}

/** declareOpenQuestion with a ceiling, for callers that must not be held up. */
function declareWithTimeout(args, timeoutMs = DECLARE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([declareOpenQuestion(args), timeout]).finally(() => clearTimeout(timer));
}

/** Is there anything in this record to grade a reply against? */
function isGradeable(oq) {
  if (!oq) return false;
  // A keyed ask is graded against its key. Any ask — a method question too —
  // can still be answered by finishing the whole problem, and that is affirmed.
  return !!((KEYED_KINDS.has(oq.kind) && oq.answer) || oq.finalAnswer);
}

// Exact comparison of one value against one key: the CAS first, then the
// solver's own answer comparison. true / false / null (could not compare).
function sameValue(studentValue, key) {
  if (studentValue == null || key == null) return null;
  try {
    const sym = symbolicVerify({ studentAnswer: String(studentValue), correctAnswer: String(key) });
    if (sym && sym.isCorrect !== null) return sym.isCorrect;
  } catch (_) { /* not comparable symbolically */ }
  try {
    const v = verifyAnswer(String(studentValue), String(key));
    if (v && v.isCorrect === true) return true;
  } catch (_) { /* not comparable */ }
  return null;
}

const JUDGE_SYSTEM =
  'You grade one student reply against one question from a math tutor. Respond with JSON ONLY: ' +
  '{"verdict": "correct|incorrect|unclear", "matched": "answer|board|none", "confidence": <0.0-1.0>, "rationale": "<brief>"}.\n' +
  'The reply is CORRECT when it gives a value mathematically equivalent to the expected answer — any equivalent form, ' +
  'in any order for a pair or a set, with or without units, work, or extra words around it. ' +
  'It is ALSO correct — check this first — when it states the final answer to the whole problem (when one is provided), whatever the question was: ' +
  'the student has jumped ahead and finished ("oh so mine is (x-7)(x+2)=0, x = 7 or x = -2" under a question about a different example), which is never wrong. Report matched "board". ' +
  'Read the WHOLE reply. A student often states more than the question asked: for "what do you multiply 3 by?" (expected 3), the reply "you multiply by 3 so its 9" is CORRECT — ' +
  'the expected value is asserted, and the 9 is them carrying on to the next result. Values on the way to the answer, or beyond it, are not wrong answers.\n' +
  'It is INCORRECT only when the reply clearly commits to a value for this question and that value is wrong.\n' +
  'It is UNCLEAR when the reply does not attempt this question at all (a question back, a comment, an answer to something else), or you cannot tell. ' +
  'When in doubt between incorrect and unclear, say unclear.';

/**
 * Grade a student's reply against an open-question record, and nothing else.
 *
 * Exact match on the extracted answer affirms without a model call. Anything
 * else goes to one judge call that reads the whole reply — a rejection is
 * never made from an extracted fragment, because the fragment is the
 * extractor's guess at which number in the sentence was the answer.
 *
 * @param {Object|null} oq                  the record on the tutor's last turn
 * @param {string} studentMessage           the reply, whole
 * @param {Object} [options]
 * @param {string|null} [options.candidate] the answer observe extracted, if any
 * @param {string|null} [options.firstName]
 * @param {string} [options.model]
 * @returns {Promise<{isCorrect: boolean|null, matched: 'answer'|'board'|null, via: string, confidence: number, error?: string}>}
 *   Never rejects. isCorrect null = no verdict.
 */
async function gradeOpenQuestion(oq, studentMessage, options = {}) {
  const none = { isCorrect: null, matched: null, via: 'none', confidence: 0 };
  if (!isGradeable(oq) || !studentMessage || typeof studentMessage !== 'string') return none;

  const candidate = options.candidate != null ? String(options.candidate) : null;
  if (candidate) {
    if (oq.answer && sameValue(candidate, oq.answer) === true) {
      return { isCorrect: true, matched: 'answer', via: 'exact', confidence: 0.98 };
    }
    if (oq.finalAnswer && sameValue(candidate, oq.finalAnswer) === true) {
      return { isCorrect: true, matched: 'board', via: 'exact', confidence: 0.98 };
    }
  }

  const use = options.model || VERIFIER_MODEL;
  const user =
    `Question:\n${clip(oq.question || '(not recorded)', 600)}\n\n`
    + `Expected answer: ${oq.answer || '(none recorded)'}\n`
    + (oq.finalAnswer && oq.finalAnswer !== oq.answer ? `Final answer to the whole problem: ${oq.finalAnswer}\n` : '')
    + `\nStudent's reply:\n${clip(redact(studentMessage, options.firstName), 800)}`;
  try {
    const res = await verifierCall(use, [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: user },
    ], { temperature: 0, max_tokens: 200, response_format: { type: 'json_object' } });
    const parsed = parseVerdict(res?.choices?.[0]?.message?.content?.trim() || '');
    if (!parsed) return { ...none, via: 'judge', error: 'parse_failed' };
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    if (parsed.verdict === 'correct' && confidence >= CONFIDENCE_THRESHOLD) {
      return { isCorrect: true, matched: parsed.matched === 'board' ? 'board' : 'answer', via: 'judge', confidence };
    }
    // Asymmetric, as everywhere: a rejection needs more than an affirmation.
    // And needs the key to the question that was ASKED. With only the whole
    // problem's answer on record, a mismatch says the student did not jump
    // ahead — not that their reply to the actual question is wrong.
    if (parsed.verdict === 'incorrect' && oq.answer && confidence >= NEGATIVE_CONFIDENCE_THRESHOLD) {
      return { isCorrect: false, matched: null, via: 'judge', confidence };
    }
    return { ...none, via: 'judge', confidence };
  } catch (err) {
    console.error('[OpenQuestion] grade failed (non-fatal):', err.message);
    return { ...none, via: 'judge', error: err.message || 'llm_error' };
  }
}

/** The record on the newest tutor turn, or null. */
function latestOpenQuestion(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'assistant') return m.openQuestion && m.openQuestion.kind ? m.openQuestion : null;
  }
  return null;
}

/**
 * Read the tutor turn that was just saved and write its record onto it.
 *
 * Called after the turn is saved and never awaited by the reply: the student
 * already has the tutor's words, and one model call must not hold the turn
 * open. The record lands a moment later, by a targeted update of that one
 * message — so a student who replies within that moment simply finds no record,
 * and the shadow sits that turn out.
 *
 * @param {Object} conversation  the saved Mongoose conversation
 * @param {Object} [options]
 * @param {string|null} [options.firstName]
 * @param {(kind: string|null) => void} [options.onStamp]  metrics hook
 * @returns {Promise<Object|null>} the record written, or null. Never rejects.
 */
async function stampLatestTurn(conversation, { firstName = null, onStamp = null } = {}) {
  try {
    if (!enabled() || !conversation || !conversation._id) return null;
    const Model = conversation.constructor;
    if (!Model || typeof Model.updateOne !== 'function') return null;
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const turn = messages[messages.length - 1];
    if (!turn || turn.role !== 'assistant' || !turn._id || typeof turn.content !== 'string') return null;

    const before = messages.slice(0, -1);
    const record = await declareWithTimeout({
      reply: turn.content,
      boardProblem: boardProblemStatement(conversation.boardProblem?.tex || null, before),
      history: before.map((m) => ({ role: m.role, content: m.content })),
      firstName,
    });
    if (typeof onStamp === 'function') onStamp(record ? record.kind : null);
    if (!record) return null;
    await Model.updateOne(
      { _id: conversation._id, 'messages._id': turn._id },
      { $set: { 'messages.$.openQuestion': record } },
    );
    return record;
  } catch (err) {
    console.error('[OpenQuestion] stamp failed (non-fatal):', err.message);
    return null;
  }
}

// true / false / null → the label the two verdicts are compared under.
const label = (isCorrect) => (isCorrect === true ? 'correct' : isCorrect === false ? 'incorrect' : 'none');

module.exports = {
  declareOpenQuestion,
  declareWithTimeout,
  gradeOpenQuestion,
  stampLatestTurn,
  latestOpenQuestion,
  isGradeable,
  enabled,
  label,
  KINDS,
  KEYED_KINDS,
};
