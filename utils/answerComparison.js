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
/**
 * The number a string IS — or null when it is not a number at all.
 *
 * `parseFloat` reads the leading digits and ignores the rest, so it says
 * "4x^2 + 36" is 4 and "4x^2 - 36" is 4, "3,429" is 3 and "3,610" is 3,
 * "18 + 22i" is 18 and "18 - 14i" is 18 — and valuesMatch, which used it as
 * its last resort, then graded every one of those pairs EQUAL. Swept against
 * the seeded item banks that was 528 distractors on 344 multiple-choice items
 * grading correct when typed, across every bank, not one of them a bad item.
 * The ACT runner submits letters and was never exposed; every surface that
 * takes a typed answer (screener, review, challenges, the chat assessment) was.
 *
 * So: the whole string has to be a number, after the spellings that ARE the
 * same number are peeled off — and only those:
 *   - a typographic minus                    "−5"           → -5
 *   - a currency sign                        "$276"         → 276
 *   - a trailing ° or %                      "68°" "15%"    → 68, 15
 *   - trailing unit WORDS                    "9 only" "12 ft" "36 units squared"
 *     (each at least two letters — a lone "x" or "i" after a space is a
 *     variable, not a unit, and "5 x" must not become 5). A word that makes
 *     the number RELATIVE to something is not a unit and stops the peel:
 *     "8 and every choice smaller" is not 8, "4 centimeters left of the
 *     line" is not 4, and "8% decrease" is not "8% increase" — the bank has
 *     all three as key/distractor pairs.
 *   - thousands separators, in that pattern  "3,610"        → 3610  ("6,8,10" is a list)
 *   - scientific notation, both spellings    "1.8 × 10¹⁰"  "2.88 × 10^10"
 *     — and only with the mantissa in [1, 10). "16.9 × 10^5" is the same
 *     quantity as "1.69 × 10^6" but it is not scientific notation, and the
 *     items that carry it as a distractor exist to test exactly that; an
 *     unnormalized mantissa is a form error, so it is not a spelling of the
 *     number and stays out of numeric comparison.
 * Anything else that follows the digits — a variable, an operator, π, √, i, a
 * second number, a ratio colon — makes it NOT this number, and it stays out of
 * numeric comparison altogether. A key like "64π" then matches "64π" and its
 * equivalents, never a bare "64".
 *
 * @param {*} str
 * @returns {number|null}
 */
const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
// Trailing words that change what the number MEANS rather than name its unit.
const NOT_A_UNIT = new Set([
  'and', 'or', 'nor', 'not', 'of', 'the', 'than', 'each', 'every',
  'left', 'right', 'up', 'down', 'above', 'below', 'before', 'after',
  'larger', 'smaller', 'greater', 'less', 'more', 'fewer', 'bigger',
  'increase', 'decrease', 'gain', 'loss', 'positive', 'negative',
]);
function parseStrictNumber(str) {
  if (str === null || str === undefined) return null;
  let s = String(str).trim()
    .replace(/[−–]/g, '-')
    .replace(/^(-?)\$\s*/, '$1')            // "$276", "-$5"
    .replace(/^\$\s*(-)/, '$1')             // "$-5"
    .replace(/\s+$/, '');
  // Peel trailing unit words off the END, one at a time: "36 units squared"
  // → "36 units" → "36". Stopping at the first non-word token is what keeps
  // "5 or 6" and "3 and π" whole (and therefore not numbers). A single regex
  // with a lazy head cannot do this — it splits "$5 per hour" as "5 per" +
  // "hour", because "hour" alone satisfies the tail.
  for (let m = s.match(/\s+([a-zA-Z]{2,})\.?$/); m && !NOT_A_UNIT.has(m[1].toLowerCase()); m = s.match(/\s+([a-zA-Z]{2,})\.?$/)) {
    s = s.slice(0, m.index);
  }
  s = s.replace(/\s*[°%]$/, '');             // "68°", "15%"
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  // "1.8 × 10¹⁰" / "2.88 × 10^10" / "4.7 x 10^-4" → "1.8e10" / "2.88e10" / "4.7e-4"
  const sci = s.match(/^(-?(?:\d+\.?\d*|\.\d+))\s*[×x*]\s*10\s*(?:\^\s*(-?\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))$/);
  if (sci) {
    const mantissa = Math.abs(Number(sci[1]));
    if (!(mantissa >= 1 && mantissa < 10)) return null;   // not scientific notation
    const exp = sci[2] !== undefined ? sci[2] : [...sci[3]].map((c) => SUPERSCRIPT_DIGITS[c]).join('');
    s = `${sci[1]}e${exp}`;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseFractionOrDecimal(str) {
  const s = String(str).trim().replace(/[−–]/g, '-');

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

  // Not a fraction: a plain number, or nothing. Never the leading digits of
  // something else — see parseStrictNumber for what that cost.
  return parseStrictNumber(s);
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

  // Numeric comparison ("0.5" vs "0.50" vs ".5", "$276" vs "276", "3,610" vs
  // "3610"). Both sides must BE a number — parseFloat's leading-digits read is
  // what made "4x^2 + 36" equal "4x^2 - 36" here.
  const userNum = parseStrictNumber(userStr);
  const acceptableNum = parseStrictNumber(acceptable);
  if (userNum !== null && acceptableNum !== null) {
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
  //
  // Entered when the item is DECLARED multiple-choice, or simply carries
  // options. The second case matters because the clients decide to draw radio
  // buttons from options being present and never look at answerType — so ~774
  // items in the bank render as multiple choice, the student clicks a letter,
  // and this gated straight past MC handling and compared "C" against the
  // answer value as a raw string. Every one of those graded wrong. gradeOne
  // (utils/skillChallenge.js) never had the gate, which is why the skill-map
  // challenge handled them and review/challenges/actTest did not.
  const mcOptions = normalizeOptions(spec.options);
  const declaredMC = spec.answerType === 'multiple-choice';
  if (declaredMC || mcOptions.length > 0) {
    const userUpper = userStr.toUpperCase();
    // Labels are POSITIONAL — the slot the student actually read, which is what
    // every surface now serves. `correctOption` names an option's STORED
    // letter, and the two disagree on the pattern-problem bank, which shuffles
    // options with their labels attached (correctOption:'C' can mean slot 0).
    // normalizeOptions/correctLabelOf translate between the two; comparing the
    // submission to the raw stored letter instead would pass a wrong pick.
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
    //
    // Scoped to DECLARED multiple-choice on purpose. On an item that merely
    // carries options, "A" may be a legitimate free-response answer ("which
    // point is A?"), and returning false here would take away a verdict that
    // value comparison gets right today. Undeclared items therefore fall
    // through, which makes this change strictly additive for them: a letter
    // can start grading correct, but nothing that graded correct can stop.
    if (declaredMC && /^[A-F]$/.test(userUpper)) {
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
  parseStrictNumber,
  textAnswerMatch,
  expressionMatch,
  parseFractionOrDecimal,
  symbolsMatch,
  tokenize,
  SYMBOL_MAP,
};
