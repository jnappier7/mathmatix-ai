/**
 * Shared Unicode math normalization utility.
 *
 * Converts Unicode math characters (superscripts, operators, Greek letters,
 * fractions, LaTeX commands) to their ASCII equivalents so downstream regex
 * patterns can match without per-site normalization.
 *
 * Used by visualCommandEnforcer, observe pipeline, and anywhere else that
 * extracts math expressions from AI/student text.
 *
 * @module mathUnicodeNormalizer
 */

// ── Superscript digits ──
const SUPERSCRIPT_MAP = {
  '\u2070': '^0', // ⁰
  '\u00B9': '^1', // ¹
  '\u00B2': '^2', // ²
  '\u00B3': '^3', // ³
  '\u2074': '^4', // ⁴
  '\u2075': '^5', // ⁵
  '\u2076': '^6', // ⁶
  '\u2077': '^7', // ⁷
  '\u2078': '^8', // ⁸
  '\u2079': '^9', // ⁹
  '\u207B': '-',  // ⁻ (superscript minus)
  '\u207A': '+',  // ⁺ (superscript plus)
  '\u207F': '^n', // ⁿ
};

// ── Subscript digits ──
const SUBSCRIPT_MAP = {
  '\u2080': '0', // ₀
  '\u2081': '1', // ₁
  '\u2082': '2', // ₂
  '\u2083': '3', // ₃
  '\u2084': '4', // ₄
  '\u2085': '5', // ₅
  '\u2086': '6', // ₆
  '\u2087': '7', // ₇
  '\u2088': '8', // ₈
  '\u2089': '9', // ₉
};

// ── Unicode operator replacements ──
const OPERATOR_MAP = {
  '\u2212': '-',  // − (minus sign)
  '\u00D7': '*',  // × (multiplication)
  '\u00F7': '/',  // ÷ (division)
  '\u22C5': '*',  // ⋅ (dot operator)
  '\u2022': '*',  // • (bullet, sometimes used as multiplication)
  '\u00B7': '*',  // · (middle dot)
  '\u2264': '<=', // ≤
  '\u2265': '>=', // ≥
  '\u2260': '!=', // ≠
  '\u2248': '~=', // ≈
  '\u221A': 'sqrt', // √
};

// ── Unicode fraction replacements ──
const FRACTION_MAP = {
  '\u00BD': '(1/2)', // ½
  '\u2153': '(1/3)', // ⅓
  '\u2154': '(2/3)', // ⅔
  '\u00BC': '(1/4)', // ¼
  '\u00BE': '(3/4)', // ¾
  '\u2155': '(1/5)', // ⅕
  '\u2156': '(2/5)', // ⅖
  '\u2157': '(3/5)', // ⅗
  '\u2158': '(4/5)', // ⅘
  '\u2159': '(1/6)', // ⅙
  '\u215A': '(5/6)', // ⅚
  '\u2150': '(1/7)', // ⅐
  '\u215B': '(1/8)', // ⅛
  '\u215C': '(3/8)', // ⅜
  '\u215D': '(5/8)', // ⅝
  '\u215E': '(7/8)', // ⅞
  '\u2151': '(1/9)', // ⅑
  '\u2152': '(1/10)', // ⅒
};

// ── Greek letters commonly used in math ──
const GREEK_MAP = {
  '\u03C0': 'pi',    // π
  '\u03B8': 'theta', // θ
  '\u03B1': 'alpha', // α
  '\u03B2': 'beta',  // β
  '\u03B3': 'gamma', // γ
  '\u03B4': 'delta', // δ
  '\u03BB': 'lambda', // λ
  '\u03C3': 'sigma', // σ
  '\u03C4': 'tau',   // τ
  '\u221E': 'Infinity', // ∞
};

// Build a single regex that matches any character we need to replace
const ALL_CHARS = Object.assign({}, SUPERSCRIPT_MAP, SUBSCRIPT_MAP, OPERATOR_MAP, FRACTION_MAP, GREEK_MAP);
const UNICODE_REGEX = new RegExp('[' + Object.keys(ALL_CHARS).join('') + ']', 'g');

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

module.exports = { normalizeMathUnicode };
