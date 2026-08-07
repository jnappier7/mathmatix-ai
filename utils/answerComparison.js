// utils/answerComparison.js
// The single answer-comparison engine. Every deterministic "is this student
// answer correct?" string/number comparison in the app routes through here —
// problem.checkAnswer() (the schema method) and assessmentService.checkAnswer()
// are both thin wrappers over compareAnswer(). Do not hand-roll a compare at a
// call site; extend the spec here instead (see CLAUDE.md §12).
//
// Deliberately NOT here: mathSolver.verifyAnswer (symbolic/deterministic
// solving) and the pipeline's LLM verifier — those judge mathematical
// equivalence of expressions. This module judges a student's literal answer
// against a known answer key.

const { normalizeOptions, correctLabelOf } = require('./mcOptions');

/**
 * Parse a string as either a fraction or decimal number.
 * Handles: "2/3", "0.666", ".5", "1 1/2" (mixed), "-3/4"
 *
 * @param {String} str
 * @returns {Number|null} numeric value, or null if unparseable
 */
function parseFractionOrDecimal(str) {
  const s = String(str).trim();

  // Mixed number like "1 1/2"
  const mixedMatch = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    return whole + (whole >= 0 ? 1 : -1) * (num / den);
  }

  // Simple fraction like "2/3"
  const fracMatch = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return den === 0 ? null : num / den;
  }

  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// Comparison-symbol synonyms: a student can select ">" where the key says
// "greater than" (or vice versa) and still be right.
const SYMBOL_MAP = {
  '>': ['>', 'greater than', 'greater', 'gt'],
  '<': ['<', 'less than', 'less', 'lt'],
  '=': ['=', 'equal', 'equals', 'equal to'],
  '>=': ['>=', 'greater than or equal', 'gte'],
  '<=': ['<=', 'less than or equal', 'lte'],
};

function symbolsMatch(a, b) {
  for (const variants of Object.values(SYMBOL_MAP)) {
    if (variants.includes(a) && variants.includes(b)) return true;
  }
  return false;
}

/**
 * Compare one user string against one acceptable answer.
 * Cascade: exact normalized string → fraction/decimal equivalence → numeric.
 *
 * @param {String} userStr - raw (trimmed) user answer
 * @param {*} acceptable - one acceptable answer value
 * @param {Object} [tolerance] - numeric tolerance config
 * @param {Number} [tolerance.absolute=0.0001] - absolute tolerance
 * @param {Number} [tolerance.relative] - if set, use |u-c|/|c| < relative
 *   (with tolerance.zeroAbsolute when the correct value is 0)
 * @returns {Boolean}
 */
function valuesMatch(userStr, acceptable, tolerance = {}) {
  const normalizedUser = String(userStr).trim().toLowerCase().replace(/\s+/g, '');
  const normalizedAcceptable = String(acceptable).trim().toLowerCase().replace(/\s+/g, '');

  if (normalizedUser === normalizedAcceptable) return true;

  const absolute = tolerance.absolute ?? 0.0001;

  const userIsFraction = String(userStr).includes('/');
  const acceptableIsFraction = String(acceptable).includes('/');

  // Fraction comparison ("1/2" vs "2/4" vs "0.5") — before plain parseFloat,
  // which would read "1/2" as 1.
  if (userIsFraction || acceptableIsFraction) {
    const userVal = parseFractionOrDecimal(userStr);
    const acceptableVal = parseFractionOrDecimal(acceptable);
    if (userVal !== null && acceptableVal !== null) {
      return numbersMatch(userVal, acceptableVal, tolerance, absolute);
    }
    return false;
  }

  // Numeric comparison ("0.5" vs "0.50" vs ".5")
  const userNum = parseFloat(userStr);
  const acceptableNum = parseFloat(acceptable);
  if (!isNaN(userNum) && !isNaN(acceptableNum)) {
    return numbersMatch(userNum, acceptableNum, tolerance, absolute);
  }

  return false;
}

function numbersMatch(userNum, correctNum, tolerance, absolute) {
  if (tolerance.relative != null) {
    if (correctNum === 0) {
      return Math.abs(userNum) < (tolerance.zeroAbsolute ?? absolute);
    }
    return Math.abs(userNum - correctNum) / Math.abs(correctNum) < tolerance.relative;
  }
  return Math.abs(userNum - correctNum) < absolute;
}

// Split free text into comparable tokens, keeping fractions ("3/4"),
// decimals (".5"), negatives, and symbol runs ("<=") intact.
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .match(/-?\d+\s*\/\s*\d+|-?\d*\.?\d+|[a-z]+|[<>=]+/g) || [];
}

/**
 * Token-boundary containment for free-text answers. Replaces raw
 * substring matching, which had two false-positive modes:
 *   "it is 425" .includes("42")            → wrongly correct
 *   "the answer is 42" .includes("4")      → wrongly correct (reverse dir)
 * A match requires the answer to appear as a whole token (or the full
 * normalized strings to be equal), in either direction.
 *
 * @param {String} userText
 * @param {String} correctText
 * @param {Object} [tolerance]
 * @returns {Boolean}
 */
function textAnswerMatch(userText, correctText, tolerance = {}) {
  const user = String(userText).trim().toLowerCase();
  const correct = String(correctText).trim().toLowerCase();

  if (valuesMatch(user, correct, tolerance)) return true;

  const userTokens = tokenize(user);
  const correctTokens = tokenize(correct);

  // Forward: student prose contains the (single-token) answer key.
  if (correctTokens.length === 1) {
    if (userTokens.some((t) => valuesMatch(t, correctTokens[0], tolerance) || symbolsMatch(t, correctTokens[0]))) {
      return true;
    }
  }

  // Reverse: answer key is a phrase, student typed just the value.
  // Only a single-token user answer may match this way — and only against a
  // numeric/symbol token of the key, never an English word ("a", "is", …).
  if (userTokens.length === 1 && /\d|[<>=]/.test(userTokens[0])) {
    if (correctTokens.some((t) => (/\d|[<>=]/.test(t)) && valuesMatch(userTokens[0], t, tolerance))) {
      return true;
    }
  }

  return symbolsMatch(user, correct);
}

/**
 * Normalized-equality-or-bounded-containment match for algebraic expressions.
 * Containment is allowed ("f(x)=(x+3)(x-3)" matches key "(x+3)(x-3)") but the
 * match must not butt up against another alphanumeric character, which is what
 * made raw .includes() grade "12x" correct against key "2x".
 *
 * @param {String} userExpr
 * @param {String} correctExpr
 * @returns {Boolean}
 */
function expressionMatch(userExpr, correctExpr) {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, '').replace(/\*\*/g, '^');
  const user = norm(userExpr);
  const correct = norm(correctExpr);

  if (!correct) return false;
  if (user === correct) return true;

  const idx = user.indexOf(correct);
  if (idx === -1) return false;

  const before = idx > 0 ? user[idx - 1] : '';
  const after = idx + correct.length < user.length ? user[idx + correct.length] : '';
  const isWordChar = (c) => /[a-z0-9]/.test(c);
  return !isWordChar(before) && !isWordChar(after);
}

/**
 * The full comparison engine — the logic behind problem.checkAnswer().
 *
 * @param {*} userAnswer - what the student submitted
 * @param {Object} spec - the answer key
 * @param {*} spec.value - canonical correct value
 * @param {Array}  [spec.equivalents] - other acceptable values
 * @param {String} [spec.answerType] - 'multiple-choice' triggers MC handling
 * @param {Array}  [spec.options] - MC options ({text} objects or strings)
 * @param {String} [spec.correctOption] - MC letter label ('A'–'F')
 * @param {Object} [spec.tolerance] - see valuesMatch()
 * @returns {Boolean}
 */
function compareAnswer(userAnswer, spec = {}) {
  const userStr = String(userAnswer).trim();
  const tolerance = spec.tolerance || {};

  const correctValue = spec.value;
  const equivalents = spec.equivalents || [];

  // Extra acceptable answers discovered during multiple-choice handling
  // (e.g. the correct option's text, so a typed value can match a letter answer)
  const extraAcceptable = [];

  // MULTIPLE CHOICE: handle first since user sends letters (A, B, C, D)
  if (spec.answerType === 'multiple-choice') {
    const userUpper = userStr.toUpperCase();
    // Labels are POSITIONAL — the slot the student actually read, which is what
    // every surface now serves. `correctOption` names an option's STORED
    // letter, and the two disagree on the pattern-problem bank, which shuffles
    // options with their labels attached (correctOption:'C' can mean slot 0).
    // normalizeOptions/correctLabelOf translate between the two; comparing the
    // submission to the raw stored letter instead would pass a wrong pick.
    const mcOptions = normalizeOptions(spec.options);
    const correctLabel = mcOptions.length ? correctLabelOf(spec) : null;

    // Method 1: direct correctOption comparison
    if (mcOptions.length ? (correctLabel && userUpper === correctLabel)
      : (spec.correctOption && userUpper === String(spec.correctOption).toUpperCase())) {
      return true;
    }

    // Method 2: user sent a letter (A–F) — look up that option's text and
    // compare to the correct answer value
    if (/^[A-F]$/.test(userUpper) && mcOptions.length > 0) {
      const optionIndex = userUpper.charCodeAt(0) - 65; // A=0, B=1, …

      if (optionIndex >= 0 && optionIndex < mcOptions.length) {
        const selectedText = mcOptions[optionIndex].text.trim().toLowerCase();
        const correctStr = String(correctValue).trim().toLowerCase();

        if (selectedText === correctStr) return true;

        for (const equiv of equivalents) {
          if (selectedText === String(equiv).trim().toLowerCase()) return true;
        }

        // ">" selected where the key says "greater than", etc.
        if (symbolsMatch(selectedText, correctStr)) return true;
      }
    }

    // The user did NOT match by option letter. Two cases:
    //
    //  1. An explicit A–F letter that simply isn't the correct one →
    //     genuinely wrong. Do NOT fall through to value matching (a stray
    //     letter must never match a number).
    //
    //  2. A free-form VALUE instead of a letter (e.g. "35") — normal in the
    //     chat-rendered screener, which shows the question text but not the
    //     A–D labels. Fall through to value comparison, after adding the
    //     correct option's text to the acceptable set.
    if (/^[A-F]$/.test(userUpper)) {
      return false;
    }

    // Resolve the correct option through its POSITIONAL label. Indexing the raw
    // stored letter (charCodeAt - 65) reads the wrong option's text on the
    // shuffled bank, which then makes a wrong typed value grade correct.
    if (correctLabel) {
      const correctOptText = mcOptions[correctLabel.charCodeAt(0) - 65]?.text;
      if (correctOptText != null && String(correctOptText).trim() !== '') {
        extraAcceptable.push(String(correctOptText));
      }
    }
  }

  // Value comparison for non-MC (or MC free-form fallback). A missing answer
  // key must grade FALSE, never stringify to "undefined" and match it — this
  // is the problem.correctAnswer / growth-check-0% bug class, both directions.
  const acceptableAnswers = [correctValue, ...equivalents, ...extraAcceptable]
    .filter((a) => a !== null && a !== undefined && String(a).trim() !== '');
  return acceptableAnswers.some((acceptable) => valuesMatch(userStr, acceptable, tolerance));
}

module.exports = {
  compareAnswer,
  valuesMatch,
  textAnswerMatch,
  expressionMatch,
  parseFractionOrDecimal,
  symbolsMatch,
  tokenize,
  SYMBOL_MAP,
};
