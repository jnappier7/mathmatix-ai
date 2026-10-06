/**
 * SOLVE CREDIT — when does a turn finish a problem, and was it first-try?
 *
 * Tier-2 XP, the "clean solve" chip, coins, problemsCorrect, badge progress and
 * the problemResult stamp all hang off persist's `problemAnswered && wasCorrect`.
 * That pair used to be true for any turn with a correct verdict — including a
 * correct intermediate STEP — and for any turn the tutor model tagged
 * <PROBLEM_RESULT:correct> when diagnose had no verdict of its own. Production,
 * 2026-10: "5(x)+5(2)-3x=26", "2x+10=26" and "-10 on both sides to get 2x=16"
 * each paid "+18 XP — clean solve" on one problem the student had already been
 * restarted on several times.
 *
 * The rules this module holds:
 *   - A step is not a solve. A correct step keeps the problem open.
 *   - One problem pays out once. Re-reaching an answer already credited (a
 *     restart, a re-check) earns nothing.
 *   - "Clean" is first-try: no earlier wrong attempt on this problem, no hint.
 *
 * Step detection is deliberately narrow, because the cost of a false "step" is
 * a real solve going unpaid. An equation counts as a step only when it is not in
 * solved form AND it shares its solution with an equation already on the table
 * (the pin, or something either side wrote in the last few turns). So "3x+5=20"
 * as the answer to "write an equation for…" still counts — nothing earlier
 * solves to 5 — while "2x=16" after "2x+10=26" does not.
 *
 * Pure; no DB, no LLM.
 *
 * @module pipeline/solveCredit
 */

const { parseCleanProblem, verifyAnswer } = require('../mathSolver');
const { normalizeMathUnicode } = require('../mathUnicodeNormalizer');

// How far back a "same problem, same answer" solve still counts as a repeat.
const SOLVE_LOG_SIZE = 10;
// Messages before this turn searched for an equation the student's line could be a step of.
const LIVE_WINDOW = 8;

function clean(text) {
  if (!text || typeof text !== 'string') return '';
  return normalizeMathUnicode(text
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/');
}

/**
 * The math statements in a piece of text, in order. Prose words (two or more
 * letters) are separators, so "-10 on both sides to get 2x=16" yields "-10" and
 * "2x=16", and "Nice! So 2x + 10 = 26. What next?" yields "2x + 10 = 26".
 */
function mathStatements(text) {
  return clean(text)
    .replace(/\b[a-z]{2,}\b/gi, '|')
    .split(/[|\n\r?!,;:]|\.(?!\d)/)
    .map(s => s.trim())
    .filter(s => /\d/.test(s));
}

function equationsIn(text) {
  return mathStatements(text).filter(s => (s.match(/=/g) || []).length === 1 && /[a-z]/i.test(s));
}

/** The last math statement the student made, or null. */
function lastMathStatement(text) {
  const all = mathStatements(text);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Is this statement in final-answer form — a bare value, or one variable set
 * equal to a value ("x = 8", "8 = x", "x = -3/4")?
 */
// One value: a signed integer, decimal or fraction, optionally a percent.
// "24-3+3" is an expression still to be evaluated, not a value.
const VALUE = String.raw`[-+]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*%?`;
const BARE_VALUE = new RegExp(`^${VALUE}$`);
const VAR_EQUALS_VALUE = new RegExp(`^[a-z]\\s*=\\s*${VALUE}$`, 'i');
const VALUE_EQUALS_VAR = new RegExp(`^${VALUE}\\s*=\\s*[a-z]$`, 'i');

function isFinalForm(statement) {
  if (!statement) return false;
  const s = statement.trim();
  return BARE_VALUE.test(s) || VAR_EQUALS_VALUE.test(s) || VALUE_EQUALS_VAR.test(s);
}

/** The value a final-form statement states ("x = 8" → "8"), else null. */
function finalValue(statement) {
  if (!isFinalForm(statement)) return null;
  const parts = statement.split('=');
  const value = parts.length === 1 ? parts[0] : (/[a-z]/i.test(parts[0]) ? parts[1] : parts[0]);
  return value.replace(/\s+/g, '');
}

function solveEquation(eq) {
  try {
    const parsed = parseCleanProblem(eq);
    if (!parsed.hasMath || !parsed.solution || parsed.solution.success !== true) return null;
    return String(parsed.solution.answer);
  } catch (_) {
    return null;
  }
}

const normEq = s => String(s || '').replace(/[\s()]/g, '').toLowerCase();

/**
 * Is the student's message an unsolved rewrite of an equation already on the
 * table? See the module header for why both conditions are required.
 *
 * @param {string} message - the student's message
 * @param {string[]} liveTexts - pin tex and recent messages from BEFORE this turn
 */
function isEquationStep(message, liveTexts) {
  const statement = lastMathStatement(message);
  if (!statement || isFinalForm(statement) || equationsIn(statement).length !== 1) return false;
  const value = solveEquation(statement);
  if (value == null) return false;
  const mine = normEq(statement);
  for (const text of liveTexts || []) {
    for (const eq of equationsIn(text)) {
      if (normEq(eq) === mine) continue;
      const other = solveEquation(eq);
      if (other != null && verifyAnswer(value, other).isCorrect === true) return true;
    }
  }
  return false;
}

/**
 * Settle what this turn did to the problem in progress.
 *
 * @returns {{ outcome: 'partial'|'step'|'answered'|'none', correct: boolean, skipped: boolean }}
 */
function classifyTurn({ diagnosis, extracted, message, liveTexts }) {
  if (diagnosis && diagnosis.type === 'correct_partial') {
    return { outcome: 'partial', correct: false, skipped: false };
  }
  if (diagnosis && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
    // Diagnose's own step verdicts (an equivalent rewrite, a chain that stops
    // short of the answer) affirm the work without finishing the problem. A
    // WRONG step is still a wrong attempt, so only the correct side is held back.
    if (diagnosis.isCorrect === true && diagnosis.isStep) return { outcome: 'step', correct: true, skipped: false };
    return { outcome: 'answered', correct: diagnosis.isCorrect === true, skipped: false };
  }
  const tag = extracted && extracted.problemResult;
  if (!tag) return { outcome: 'none', correct: false, skipped: false };
  if (tag === 'skipped') return { outcome: 'answered', correct: false, skipped: true };
  // The tutor model's own tag, on a turn nothing deterministic could grade. It
  // is asked for on "an answer to a specific math problem", and a correct step
  // looks like one — so a tagged step is held to the same rule as above.
  if (tag === 'correct') {
    const statement = lastMathStatement(message);
    const unfinishedWork = diagnosis && diagnosis.isTransformation && !isFinalForm(statement);
    if (unfinishedWork || isEquationStep(message, liveTexts)) {
      return { outcome: 'step', correct: true, skipped: false };
    }
  }
  return { outcome: 'answered', correct: tag === 'correct', skipped: false };
}

/** A stable identity for the problem in progress, when one is knowable. */
function problemKey({ pinnedProblemTex, lastProblemState, diagnosis }) {
  const raw = pinnedProblemTex
    || (lastProblemState && lastProblemState.problemText)
    || (diagnosis && diagnosis.problemInfo && diagnosis.problemInfo.content)
    || null;
  return raw ? normEq(clean(raw)).slice(0, 120) : null;
}

/** The answer a solve reached, normalized for comparison. */
function solveAnswer({ diagnosis, observation, message }) {
  const raw = (diagnosis && diagnosis.answer != null && diagnosis.answer)
    || (observation && observation.answer && observation.answer.value)
    || finalValue(lastMathStatement(message))
    || message;
  return normEq(clean(String(raw)));
}

/**
 * Has this exact solve already been credited? Same answer, and the same problem
 * — matched by key when both sides have one, else only against the most recent
 * solve (a restart re-reaches the answer it just reached).
 */
function isRepeatSolve(solveLog, key, answer) {
  const log = Array.isArray(solveLog) ? solveLog : [];
  if (!answer) return false;
  return log.some((entry, i) => {
    if (!entry || entry.answer !== answer) return false;
    if (key && entry.key) return entry.key === key;
    return i === log.length - 1;
  });
}

function appendSolve(solveLog, key, answer, now = new Date()) {
  const log = Array.isArray(solveLog) ? solveLog.slice() : [];
  log.push({ key: key || null, answer, at: now });
  while (log.length > SOLVE_LOG_SIZE) log.shift();
  return log;
}

/** The messages before this turn that an equation step could belong to. */
function liveTextsFor(conversation, pinnedProblemTex) {
  const msgs = Array.isArray(conversation && conversation.messages) ? conversation.messages : [];
  // The last message is the student's current one — exclude it.
  const prior = msgs.slice(Math.max(0, msgs.length - 1 - LIVE_WINDOW), -1).map(m => m && m.content);
  return [pinnedProblemTex, conversation && conversation.lastProblemState && conversation.lastProblemState.problemText, ...prior]
    .filter(t => typeof t === 'string' && t);
}

module.exports = {
  classifyTurn,
  isEquationStep,
  isFinalForm,
  finalValue,
  lastMathStatement,
  equationsIn,
  problemKey,
  solveAnswer,
  isRepeatSolve,
  appendSolve,
  liveTextsFor,
};
