/**
 * voiceMathJson.js — read the voice tutor's <math> array without losing its LaTeX.
 *
 * Owner, 2026-11-28: "want to make sure that latex works for this feature.
 * Had some weird mark up last test."
 *
 * The voice tutor ends each reply with a JSON array of board lines, and the
 * lines are LaTeX. JSON and LaTeX both use the backslash, and a model writes
 * "\frac{3}{4}" far more readily than the "\\frac{3}{4}" JSON needs:
 *
 *   "\frac{3}{4}"   parses — as a FORM FEED followed by "rac{3}{4}"
 *   "3 \times 4"    parses — as "3", a TAB, "imes 4"
 *   "\neq", "\right", "\beta", "\boxed"   likewise (\n \r \b)
 *   "\sqrt{16}", "\cdot", "\div", "\le"   are not JSON escapes at all, so the
 *                    WHOLE array failed to parse and the board kept showing
 *                    the previous turn
 *
 * So before parsing, every backslash that is not already a deliberate JSON
 * escape of a backslash, a quote or a slash is doubled. Inside a math array a
 * raw newline, tab, form feed or backspace is never what the tutor meant; a
 * LaTeX command always is.
 *
 * Pure.
 */
'use strict';

const HEX4 = /^[0-9a-fA-F]{4}$/;

/** Double every backslash that JSON would otherwise eat or choke on. */
function escapeLatexBackslashes(raw) {
  const s = String(raw == null ? '' : raw);
  // Is the tutor writing LaTeX with ONE backslash here ("\frac", "\,")? Then
  // a "\\" that is not in front of a command name is LaTeX's own row break,
  // not an escaped backslash, and has to survive as two.
  const single = /(^|[^\\])\\(?:[a-zA-Z]{2,}|[^\\"/a-zA-Z\s])/.test(s);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const next = s[i + 1];
    // Already-escaped backslash, quote or slash: leave the pair alone.
    if (next === '\\' && single && !/[a-zA-Z]/.test(s[i + 2] || '')) { out += '\\\\\\\\'; i++; continue; }
    if (next === '\\' || next === '"' || next === '/') { out += c + next; i++; continue; }
    // A real unicode escape (×). "\underline" is not one.
    if (next === 'u' && HEX4.test(s.slice(i + 2, i + 6))) { out += s.slice(i, i + 6); i += 5; continue; }
    out += '\\\\';
  }
  return out;
}

// Whatever still slipped through as a control character is not math.
function scrub(value) {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]+/g, ' ').trim() : value;
}

// Names that are math even without their backslash.
const MATH_WORDS = new Set(['sqrt', 'frac', 'sin', 'cos', 'tan', 'log', 'lim', 'max', 'min', 'mod', 'gcd', 'lcm']);
// An empty answer box. On the chat board it is a blank the student types
// into; in a call there is nothing to type with, and "[ ] = 5pi/6" with no
// way to fill it in reads as a rendering fault. A question mark says the same
// thing and needs no explaining.
const BLANK = /\\boxed\s*\{\s*(?:\\phantom\s*\{[^{}]*\}|\\quad|\\;|\\,|\?|\s)*\}|\\square\b|\\Box\b|\\underline\s*\{\s*(?:\\hspace\s*\{[^{}]*\}|\\quad|\s)*\}|(?:\\_){2,}|_{3,}/g;

/**
 * One board line, made safe to typeset. Returns { latex, label } — the label
 * only when the line opened with words that were really its caption.
 */
function tidyLatex(latex) {
  let t = scrub(latex);
  let label = null;
  // Delimiters the prompt forbids and the model sends anyway.
  t = t.replace(/^\$\$?|\$\$?$/g, '').replace(/^\\[([]|\\[)\]]$/g, '').trim();
  t = t.replace(BLANK, '?');
  // "Subtract 2: 3x = 15" — the words are the caption, the rest is the line.
  const cap = t.match(/^([A-Za-z][A-Za-z0-9 ,']{2,48}?)\s*[:\u2014\u2013]\s+(\S.*)$/);
  if (cap && /[=\d\\]/.test(cap[2]) && !/\\/.test(cap[1])) { label = cap[1].trim(); t = cap[2].trim(); }
  // A stray word or two inside math ("3 apples + 2 apples") would be set as
  // italic letters run together. Three or more words is a sentence, which the
  // board's own prose path sets better than \text would.
  const TOKEN = /\\(?:text|textbf|textit|mathrm|mathbf|mathit|operatorname|begin|end)\s*\{[^{}]*\}|\\[a-zA-Z]+|[A-Za-z]{4,}/g;
  const words = (t.match(TOKEN) || []).filter(m => m[0] !== '\\' && !MATH_WORDS.has(m.toLowerCase()));
  if (words.length && words.length < 3) {
    t = t.replace(TOKEN, m => (m[0] === '\\' || MATH_WORDS.has(m.toLowerCase()) ? m : '\\text{ ' + m + ' }'));
  }
  return { latex: t, label };
}

function tidy(step) {
  if (!step || typeof step !== 'object') return step;
  const out = Object.assign({}, step);
  for (const k of ['label', 'explanation', 'text']) {
    if (typeof out[k] === 'string') out[k] = scrub(out[k]);
  }
  if (typeof out.latex === 'string') {
    const t = tidyLatex(out.latex);
    out.latex = t.latex;
    if (t.label && !out.label) out.label = t.label;
  }
  return out;
}

/**
 * Parse the tutor's math array.
 * @param {string} buf  the text between <math> and </math>
 * @returns {Array|null} the steps, or null when it is not an array at all
 */
function parseMathArray(buf) {
  const trimmed = String(buf == null ? '' : buf).trim();
  if (!trimmed) return null;
  const repaired = escapeLatexBackslashes(trimmed);
  const attempts = [
    repaired,
    // Common model quirks: a trailing comma, single-quoted strings.
    repaired.replace(/,\s*([}\]])/g, '$1'),
    repaired.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"'),
  ];
  for (const text of attempts) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(tidy);
    } catch (_) { /* try the next repair */ }
  }
  return null;
}

module.exports = { parseMathArray, escapeLatexBackslashes, tidyLatex };
