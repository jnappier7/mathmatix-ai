/**
 * Shared Unicode math normalization utility.
 *
 * Converts Unicode math characters (superscripts, operators, Greek letters,
 * fractions, LaTeX commands) to their ASCII equivalents so downstream regex
 * patterns can match without per-site normalization.
 *
 * Used by visualCommandEnforcer, mathSolver, the observe pipeline, and anywhere
 * else that extracts or grades math expressions from AI/student text.
 *
 * @module mathUnicodeNormalizer
 */

// ── Superscript digits ──
const SUPERSCRIPT_MAP = {
  '⁰': '^0', // ⁰
  '¹': '^1', // ¹
  '²': '^2', // ²
  '³': '^3', // ³
  '⁴': '^4', // ⁴
  '⁵': '^5', // ⁵
  '⁶': '^6', // ⁶
  '⁷': '^7', // ⁷
  '⁸': '^8', // ⁸
  '⁹': '^9', // ⁹
  '⁻': '-',  // ⁻ (superscript minus)
  '⁺': '+',  // ⁺ (superscript plus)
  'ⁿ': '^n', // ⁿ
};

// ── Subscript digits ──
const SUBSCRIPT_MAP = {
  '₀': '0', // ₀
  '₁': '1', // ₁
  '₂': '2', // ₂
  '₃': '3', // ₃
  '₄': '4', // ₄
  '₅': '5', // ₅
  '₆': '6', // ₆
  '₇': '7', // ₇
  '₈': '8', // ₈
  '₉': '9', // ₉
};

// ── Unicode operator/sign replacements ──
// Single source of truth for mapping Unicode math operators and signs to their
// ASCII equivalents. This is the map that has repeatedly bitten the regex-based
// math engine: MathLive / LaTeX / mobile keyboards emit these glyphs instead of
// ASCII, and any one that is MISSING here silently corrupts detection or grading
// (the U+2212 minus dropped a negative sign; the U+22C5 dot dropped a whole
// factor). Keep it EXHAUSTIVE — adding a variant here fixes every call site at once.
//
// Deliberately EXCLUDES the en dash (U+2013) and em dash (U+2014): those are
// PROSE punctuation, not a math minus, and rewriting them corrupts sentences
// like "$...$ — what's your next step?".
const OPERATOR_MAP = {
  // Minus / hyphen-minus
  '−': '-',    // − minus sign
  '－': '-',    // － fullwidth hyphen-minus
  '﹣': '-',    // ﹣ small hyphen-minus
  // Multiplication
  '×': '*',    // × multiplication sign
  '⋅': '*',    // ⋅ dot operator
  '·': '*',    // · middle dot
  '∙': '*',    // ∙ bullet operator
  '•': '*',    // • bullet
  '∗': '*',    // ∗ asterisk operator
  '＊': '*',    // ＊ fullwidth asterisk
  // Division
  '÷': '/',    // ÷ division sign
  '∕': '/',    // ∕ division slash
  '⁄': '/',    // ⁄ fraction slash
  '／': '/',    // ／ fullwidth solidus
  // Plus / equals
  '＋': '+',    // ＋ fullwidth plus
  '＝': '=',    // ＝ fullwidth equals
  // Comparison + roots
  '≤': '<=',   // ≤
  '≥': '>=',   // ≥
  '≠': '!=',   // ≠
  '≈': '~=',   // ≈
  '√': 'sqrt', // √
};

// ── Unicode fraction replacements ──
const FRACTION_MAP = {
  '½': '(1/2)', // ½
  '⅓': '(1/3)', // ⅓
  '⅔': '(2/3)', // ⅔
  '¼': '(1/4)', // ¼
  '¾': '(3/4)', // ¾
  '⅕': '(1/5)', // ⅕
  '⅖': '(2/5)', // ⅖
  '⅗': '(3/5)', // ⅗
  '⅘': '(4/5)', // ⅘
  '⅙': '(1/6)', // ⅙
  '⅚': '(5/6)', // ⅚
  '⅐': '(1/7)', // ⅐
  '⅛': '(1/8)', // ⅛
  '⅜': '(3/8)', // ⅜
  '⅝': '(5/8)', // ⅝
  '⅞': '(7/8)', // ⅞
  '⅑': '(1/9)', // ⅑
  '⅒': '(1/10)', // ⅒
};

// ── Greek letters commonly used in math ──
const GREEK_MAP = {
  'π': 'pi',    // π
  'θ': 'theta', // θ
  'α': 'alpha', // α
  'β': 'beta',  // β
  'γ': 'gamma', // γ
  'δ': 'delta', // δ
  'λ': 'lambda', // λ
  'σ': 'sigma', // σ
  'τ': 'tau',   // τ
  '∞': 'Infinity', // ∞
};

// Build a single regex that matches any character we need to replace
const ALL_CHARS = Object.assign({}, SUPERSCRIPT_MAP, SUBSCRIPT_MAP, OPERATOR_MAP, FRACTION_MAP, GREEK_MAP);
const UNICODE_REGEX = new RegExp('[' + Object.keys(ALL_CHARS).join('') + ']', 'g');

// Operator-only regex, for callers (like the regex-based math engine) that want
// to normalize operators/signs WITHOUT rewriting fractions/superscripts/Greek —
// e.g. mathSolver handles vulgar fractions its own way and must not receive
// "(1/2)" in place of "½".
const OPERATOR_REGEX = new RegExp('[' + Object.keys(OPERATOR_MAP).join('') + ']', 'g');

/**
 * Normalize ONLY Unicode math operators and signs to ASCII (minus, ×, ÷, dots,
 * comparison operators, √, and their fullwidth/variant forms). Leaves
 * fractions, superscripts, Greek letters, and all other text untouched.
 *
 * This is the focused entry point for the regex-based math engine — apply it at
 * every point that parses or grades an expression so no Unicode operator variant
 * can slip through. Idempotent and safe on any string.
 *
 * @param {string} str
 * @returns {string}
 */
function normalizeMathOperators(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str.replace(OPERATOR_REGEX, ch => OPERATOR_MAP[ch] || ch);
}

/**
 * Normalize Unicode math characters to ASCII equivalents.
 *
 * Handles superscripts, subscripts, operators, vulgar fractions, Greek
 * letters, and common LaTeX commands. Safe to call on any string — unknown
 * characters pass through unchanged.
 *
 * @param {string} str - Input that may contain Unicode math
 * @returns {string} ASCII-normalized string
 */
function normalizeMathUnicode(str) {
  if (!str || typeof str !== 'string') return str || '';

  // Single-pass character replacement
  let result = str.replace(UNICODE_REGEX, ch => ALL_CHARS[ch] || ch);

  // Collapse consecutive ^digit sequences into ^{digits} when multi-digit
  // e.g. "x^1^2" (from x¹²) → "x^{12}"
  result = result.replace(/\^(\d)\^(\d+)/g, '^{$1$2}');

  // LaTeX normalization
  result = result
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot/g, '*');

  return result;
}

module.exports = { normalizeMathUnicode, normalizeMathOperators, OPERATOR_MAP };
