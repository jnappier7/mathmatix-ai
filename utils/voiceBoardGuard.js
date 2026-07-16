// ============================================================
// voiceBoardGuard.js — "voice explains, board shows."
//
// Voice mode has no transcript: captions are ephemeral and the
// board is the only durable record. The voice prompts tell the
// model to keep math off the spoken channel and on the board, but
// nothing enforced it — a turn could say "so we get 12x + 18" and
// ship an empty mathSteps array, evaporating the math into audio.
//
// This guard runs right before response_final: if the (verified)
// spoken text carries symbolic math but the turn has no usable
// board output, the spoken math is mirrored onto the board as
// synthesized mathSteps.
//
// Anti-cheat by construction: the guard only ever mirrors text the
// student already heard AND that already passed pipeline verify —
// it can never put more on the board than was said aloud. Callers
// must still skip it on verify-redirected turns (the redirect
// deliberately drops board content).
//
// Detection is deliberately conservative (symbolic notation only):
// spoken-word math ("two thirds") can't be extracted reliably, and
// a false mirror ("pages 10-12" on the board) is worse than a miss.
// ============================================================

'use strict';

const LATEX_CMD = /\\(frac|sqrt|cdot|times|div|pi|theta|alpha|beta|sum|int|le|ge|ne|pm)\b/;

// Math-ish token stream: numbers, single-letter variables, LaTeX
// commands (with optional {...} args), and operators/relations.
// Single letters only, bounded on BOTH sides — "May", "am", and the
// trailing letter of a word ("have 2x") never tokenize as variables.
const SPAN_RE = /(?:\\[a-zA-Z]+(?:\{[^{}]*\})*|\d+(?:\.\d+)?|(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])|[+\-*/^=()<>±·√≤≥])(?:\s{0,2}(?:\\[a-zA-Z]+(?:\{[^{}]*\})*|\d+(?:\.\d+)?|(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])|[+\-*/^=()<>±·√≤≥]))*/g;

const MAX_MIRRORED_LINES = 4;

/**
 * A candidate span only counts as real math when it has structure a
 * range/date/count can't fake: a relation (=, <, >, ≤, ≥), an exponent,
 * a LaTeX command, or a variable letter in play (coefficient "12x" or
 * an operator touching a variable). Bare arithmetic between numbers
 * ("10-12", "1 - 5") is EXCLUDED on purpose — page ranges and list
 * counts look identical to subtraction.
 */
function isRealMathSpan(span) {
  const s = span.trim();
  if (s.length < 3) return false;
  if (/[=<>≤≥^]/.test(s)) return true;
  if (LATEX_CMD.test(s)) return true;
  if (/\d\s?[a-zA-Z]\b/.test(s)) return true;                 // coefficient: 12x
  if (/\b[a-zA-Z]\s?[+\-*/·]/.test(s)) return true;           // x + ...
  if (/[+\-*/·]\s?[a-zA-Z]\b/.test(s)) return true;           // ... + x
  return false;
}

function cleanSpan(span) {
  let s = span.trim();
  // Trailing sentence punctuation isn't math.
  s = s.replace(/[.,;:!?]+$/, '').trim();
  // Unbalanced trailing paren from sentence structure, e.g. "(so 2x = 4)".
  while (s.endsWith(')') && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) {
    s = s.slice(0, -1).trim();
  }
  while (s.startsWith('(') && (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) {
    s = s.slice(1).trim();
  }
  // A span that ends dangling on an operator lost its tail to prose.
  s = s.replace(/[+\-*/·=<>≤≥^]+$/, '').trim();
  return s;
}

/**
 * Extract the symbolic-math spans from spoken text.
 * Returns cleaned, deduped strings (renderable as TeX-ish lines).
 */
function findMathSpans(text) {
  const src = String(text || '');
  const out = [];
  const seen = new Set();
  const matches = src.match(SPAN_RE) || [];
  for (const raw of matches) {
    if (!isRealMathSpan(raw)) continue;
    const cleaned = cleanSpan(raw);
    if (!cleaned || cleaned.length < 3 || !isRealMathSpan(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function containsSpokenMath(text) {
  return findMathSpans(text).length > 0;
}

/**
 * Does this turn already carry board output the client bridge can
 * render? (Text-only mathSteps are narration and get skipped by
 * voiceBoardTranslate; a lone `clear` empties the board rather than
 * showing anything.)
 */
function hasUsableBoardOutput(mathSteps, boardActions) {
  const steps = Array.isArray(mathSteps) ? mathSteps : [];
  if (steps.some(s => s && (s.latex || s.visual))) return true;
  const actions = Array.isArray(boardActions) ? boardActions : [];
  return actions.some(a => a && a.type && a.type !== 'clear');
}

/**
 * The guard. Returns { mathSteps, mirrored } where `mirrored` lists the
 * synthesized lines (empty = nothing changed). Never mutates inputs.
 */
function ensureBoardCarriesSpokenMath(spokenText, mathSteps, boardActions) {
  const steps = Array.isArray(mathSteps) ? mathSteps : [];
  if (hasUsableBoardOutput(steps, boardActions)) {
    return { mathSteps: steps, mirrored: [] };
  }
  const spans = findMathSpans(spokenText).slice(0, MAX_MIRRORED_LINES);
  if (!spans.length) {
    return { mathSteps: steps, mirrored: [] };
  }
  const mirroredSteps = spans.map(latex => ({
    latex,
    label: 'From what we just said',
    mirrored: true, // provenance marker for metrics/debugging
  }));
  return { mathSteps: steps.concat(mirroredSteps), mirrored: spans };
}

module.exports = {
  findMathSpans,
  containsSpokenMath,
  hasUsableBoardOutput,
  ensureBoardCarriesSpokenMath,
};
