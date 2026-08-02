/**
 * MATH-AWARE TTS PREPROCESSOR
 *
 * Converts LaTeX math notation and markdown into natural speech text
 * suitable for text-to-speech engines (Cartesia, etc.).
 *
 * Shared by routes/voice.js and routes/speak.js to eliminate duplication.
 *
 * @module utils/mathTTS
 */

const { replaceDashes } = require('./dashNormalizer');

/**
 * Convert LaTeX math notation to natural speech.
 *
 * Examples:
 *   \frac{3}{4}      → "three fourths"
 *   x^2              → "x squared"
 *   \sqrt{16}        → "square root of 16"
 *   3x^2 + 2x - 5    → "3 x squared plus 2 x minus 5"
 */
function convertLatexToSpeech(latex) {
  let speech = latex;

  // Degrees: 45^\circ, 45^{\circ}, 45° → "45 degrees". Must run before the
  // superscript handling below, otherwise \circ is spoken as "to the power".
  speech = speech.replace(/\^\s*(?:\{\s*)?\\circ(?:\s*\})?/g, ' degrees');
  speech = speech.replace(/(\d)\s*\\circ\b/g, '$1 degrees');
  speech = speech.replace(/°/g, ' degrees');
  speech = speech.replace(/\\degrees?\b/gi, ' degrees');

  // Fractions: \frac{a}{b} → spoken fraction
  speech = speech.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_, num, den) => {
    return `${speakNumber(num)} over ${speakNumber(den)}`;
  });

  // Common simple fractions (without \frac): 1/2, 3/4, etc.
  speech = speech.replace(/(\d+)\s*\/\s*(\d+)/g, (_, num, den) => {
    return `${speakNumber(num)} over ${speakNumber(den)}`;
  });

  // Superscripts: x^2, x^3, x^{n+1}
  speech = speech.replace(/\^2(?!\d)/g, ' squared');
  speech = speech.replace(/\^3(?!\d)/g, ' cubed');
  speech = speech.replace(/\^(\d+)/g, (_, n) => ` to the ${speakOrdinal(n)} power`);
  speech = speech.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
  speech = speech.replace(/\^([a-zA-Z])/g, ' to the $1');

  // Subscripts: x_1 → "x sub 1"
  speech = speech.replace(/_\{([^}]+)\}/g, ' sub $1');
  speech = speech.replace(/_([a-zA-Z0-9])/g, ' sub $1');

  // Square root: \sqrt{x} → "square root of x"
  speech = speech.replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, '$1th root of $2');
  speech = speech.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');

  // Absolute value: |x| or \left|x\right|
  speech = speech.replace(/\\left\|([^|]+?)\\right\|/g, 'the absolute value of $1');
  speech = speech.replace(/\|([^|]+?)\|/g, 'the absolute value of $1');

  // Logarithms
  speech = speech.replace(/\\log_\{([^}]+)\}/g, 'log base $1 of');
  speech = speech.replace(/\\log\b/g, 'log');
  speech = speech.replace(/\\ln\b/g, 'natural log of');

  // Trigonometric functions
  speech = speech.replace(/\\sin/g, 'sine');
  speech = speech.replace(/\\cos/g, 'cosine');
  speech = speech.replace(/\\tan/g, 'tangent');
  speech = speech.replace(/\\cot/g, 'cotangent');
  speech = speech.replace(/\\sec/g, 'secant');
  speech = speech.replace(/\\csc/g, 'cosecant');

  // Calculus
  speech = speech.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, 'the integral from $1 to $2 of');
  speech = speech.replace(/\\int/g, 'the integral of');
  speech = speech.replace(/\\lim_\{([^}]+)\}/g, 'the limit as $1 of');
  speech = speech.replace(/\\infty/g, 'infinity');
  speech = speech.replace(/\\to\b/g, ' approaches ');
  speech = speech.replace(/\\frac\{d\}\{dx\}/g, 'the derivative with respect to x of');
  speech = speech.replace(/\\frac\{d\}\{dt\}/g, 'the derivative with respect to t of');

  // Greek letters
  const greeks = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta',
    epsilon: 'epsilon', theta: 'theta', lambda: 'lambda', mu: 'mu',
    pi: 'pi', sigma: 'sigma', phi: 'phi', omega: 'omega',
    Delta: 'delta', Sigma: 'sigma', Pi: 'pi', Omega: 'omega',
  };
  for (const [cmd, word] of Object.entries(greeks)) {
    speech = speech.replace(new RegExp(`\\\\${cmd}\\b`, 'g'), word);
  }

  // Mathematical operators
  speech = speech.replace(/\\times/g, ' times ');
  speech = speech.replace(/\\div/g, ' divided by ');
  speech = speech.replace(/\\pm/g, ' plus or minus ');
  speech = speech.replace(/\\mp/g, ' minus or plus ');
  speech = speech.replace(/\\cdot/g, ' times ');
  speech = speech.replace(/\\leq/g, ' less than or equal to ');
  speech = speech.replace(/\\geq/g, ' greater than or equal to ');
  speech = speech.replace(/\\neq/g, ' not equal to ');
  speech = speech.replace(/\\approx/g, ' approximately ');
  speech = speech.replace(/\\rightarrow/g, ' leads to ');
  speech = speech.replace(/\\Rightarrow/g, ' therefore ');

  // Plus/minus in expressions: make them speakable. A "-" that has no
  // operand before it (start of expression, or after "(", "=", another
  // operator) is a negative sign; everything else is subtraction. Runs
  // before "=" is turned into a word, so "= -5" is still seen as negative.
  speech = speech.replace(/\s*\+\s*/g, ' plus ');
  speech = speech.replace(/(^|[^\w).\s])\s*-\s*(?=[\d.]|[A-Za-z])/g, '$1negative ');
  speech = speech.replace(/\s*-\s*/g, ' minus ');

  // Equals — but only isolated = signs, not inside words
  speech = speech.replace(/\s*=\s*/g, ' equals ');

  // Parentheses
  speech = speech.replace(/\\left\(/g, '(');
  speech = speech.replace(/\\right\)/g, ')');

  // Remove curly braces
  speech = speech.replace(/[{}]/g, '');

  // Remove remaining backslashes and LaTeX commands
  speech = speech.replace(/\\[a-zA-Z]+/g, '');
  speech = speech.replace(/\\/g, '');

  // Clean up multiple spaces
  speech = speech.replace(/\s+/g, ' ').trim();

  return speech;
}

/**
 * Speak a number as words for common small numbers in fractions.
 */
function speakNumber(str) {
  const trimmed = str.trim();
  const words = {
    '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
    '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
    '11': 'eleven', '12': 'twelve',
  };
  return words[trimmed] || trimmed;
}

/**
 * Convert a number to its ordinal form for exponents.
 */
function speakOrdinal(n) {
  const num = parseInt(n, 10);
  const ordinals = {
    1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
    6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
  };
  if (ordinals[num]) return ordinals[num];
  // Fallback: "Nth"
  const suffix = (num % 10 === 1 && num !== 11) ? 'st'
    : (num % 10 === 2 && num !== 12) ? 'nd'
    : (num % 10 === 3 && num !== 13) ? 'rd' : 'th';
  return `${num}${suffix}`;
}

// A numbered-list marker: at the start of a line (markdown list) or inline
// after a sentence break ("1. 2x-4=3, 2. 8x-9=43" on one line).
const LIST_MARKER_RE = /(?:^[ \t]*|(?<=[,;:.!?]\s))(\d{1,2})[.)][ \t]+/gm;

/**
 * Give numbered list items a beat between them.
 *
 * The final `\s+ → ' '` collapse in cleanTextForTTS flattens a list into one
 * unbroken run, so the engine reads "1. 2x-4=3  2. 8x-9=43" as
 * "one two x minus four equals three two eight x minus nine..." — the item
 * number blurs into the math that follows it. Ending the previous item with a
 * period and speaking the marker as "Number two." gives the engine a sentence
 * boundary to pause on and separates the label from the expression.
 *
 * Only applied when the markers form an ascending consecutive run of two or
 * more, so a lone "2. " in ordinary prose is left alone.
 */
function pauseNumberedListItems(text) {
  LIST_MARKER_RE.lastIndex = 0;
  const markers = [];
  let m;
  while ((m = LIST_MARKER_RE.exec(text)) !== null) {
    markers.push({ index: m.index, length: m[0].length, n: parseInt(m[1], 10) });
  }
  if (markers.length < 2) return text;
  for (let i = 1; i < markers.length; i++) {
    if (markers[i].n !== markers[i - 1].n + 1) return text;
  }

  let out = '';
  let cursor = 0;
  for (const marker of markers) {
    let before = text.slice(cursor, marker.index);
    // Close the previous item so the engine hears a full stop before the next.
    if (/[^\s]/.test(before) && !/[.!?:;,]\s*$/.test(before)) {
      before = `${before.replace(/\s+$/, '')}. `;
    }
    out += before;
    out += `Number ${speakNumber(String(marker.n))}. `;
    cursor = marker.index + marker.length;
  }
  return out + text.slice(cursor);
}

/**
 * Full TTS preprocessing pipeline.
 * Strips markdown, converts LaTeX to speech, cleans visual commands.
 */
function cleanTextForTTS(text) {
  let cleaned = text;

  // Remove visual commands: [DIAGRAM:...], [FUNCTION_GRAPH:...], etc.
  // Params can nest one level of brackets (points=[-3,3]) — match whole
  // "[...]" groups too, or the strip stops at the first inner "]" and TTS
  // reads the leftover tail (',label="..."]') aloud.
  cleaned = cleaned.replace(/\[(DIAGRAM|FUNCTION_GRAPH|SLIDER_GRAPH|POINTS|DERIVATIVE_GRAPH|VELOCITY_GRAPH|RATIONAL_GRAPH|NUMBER_LINE|FRACTION|PIE_CHART|BAR_CHART|UNIT_CIRCLE|AREA_MODEL|SEARCH_IMAGE|WHITEBOARD_WRITE|EQUATION_SOLVE|STEPS|\/STEPS|OLD|NEW|FOCUS|TRIANGLE_PROBLEM)(?:[^\[\]]|\[[^\]]*\])*\]/g, '');

  // Remove markdown headers (### Title → Title)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Remove markdown bold/italic
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

  // Remove markdown links
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove inline code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

  // Remove horizontal rules
  cleaned = cleaned.replace(/^[-*]{3,}$/gm, '');

  // Numbered lists: insert a beat between items while the line breaks that
  // mark them still exist (the whitespace collapse below erases them).
  cleaned = pauseNumberedListItems(cleaned);

  // Convert LaTeX expressions to speech
  cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/(?<![\\$])\$([^$\n]+?)\$/g, (_, latex) => convertLatexToSpeech(latex));

  // Degrees: 45°, 45^\circ, 45^{\circ}, \degree → "45 degrees". Must run
  // before the generic LaTeX-command strip below, which would otherwise
  // delete \circ and leave a stray "^".
  cleaned = cleaned.replace(/\^\s*(?:\{\s*)?\\?circ(?:\s*\})?/g, ' degrees');
  cleaned = cleaned.replace(/(\d)\s*\\circ\b/g, '$1 degrees');
  cleaned = cleaned.replace(/°/g, ' degrees');
  cleaned = cleaned.replace(/\\degrees?\b/gi, ' degrees');

  // Remove any remaining LaTeX commands
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

  // ── Bare math cleanup: catch undelimited notation the LLM may produce ──
  // Function notation: f(x) → "f of x", g(2) → "g of 2", f'(x) → "f prime of x"
  cleaned = cleaned.replace(/\b([a-zA-Z])'\(([^)]+)\)/g, '$1 prime of $2');
  cleaned = cleaned.replace(/\b([a-zA-Z])\(([^)]{1,20})\)/g, '$1 of $2');
  // Caret exponents: x^2 → "x squared", y^3 → "y cubed", n^{k+1} → "n to the k+1 power"
  cleaned = cleaned.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
  cleaned = cleaned.replace(/\^2(?=\b|[^0-9]|$)/g, ' squared');
  cleaned = cleaned.replace(/\^3(?=\b|[^0-9]|$)/g, ' cubed');
  cleaned = cleaned.replace(/\^(\d+)/g, (_, n) => ` to the ${speakOrdinal(parseInt(n, 10))} power`);
  cleaned = cleaned.replace(/\^([a-zA-Z])/g, ' to the $1 power');
  // Subscripts: x_1 → "x sub 1"
  cleaned = cleaned.replace(/_\{([^}]+)\}/g, ' sub $1');
  cleaned = cleaned.replace(/_(\d)/g, ' sub $1');
  // Remove leftover curly braces
  cleaned = cleaned.replace(/[{}]/g, '');

  // ── Spoken math operators for undelimited notation ──
  // (Delimited math already went through convertLatexToSpeech above.)
  // Otherwise a TTS engine reads "=" as "equal sign" and "-" as a bare pause.
  // Equals — but not <=, >=, !=, ==.
  cleaned = cleaned.replace(/(?<![<>=!])=(?!=)/g, ' equals ');
  // Subtraction: only between math operands (digit, ")", or a single-letter
  // variable), so word hyphens like "well-done" or "x-ray" stay intact.
  cleaned = cleaned.replace(/(\d|\))\s*-\s*(?=\d|\(|[A-Za-z]\b)/g, '$1 minus ');
  cleaned = cleaned.replace(/\b([A-Za-z])\s*-\s*(?=\d|\(|[A-Za-z]\b)/g, '$1 minus ');
  // Whatever "-" is left in front of a number/variable (after "(", "=", an
  // operator, or at the start) is a negative sign, not a pause.
  cleaned = cleaned.replace(/(^|[\s(=+*/,:])-\s*(?=[\d.]|[A-Za-z]\b)/g, '$1negative ');

  // Em dash → comma (a natural spoken pause). Leaves en dashes and hyphens
  // alone so "8 – 3" / "-7" still read as subtraction / a negative.
  cleaned = replaceDashes(cleaned);

  // Strip emoji — TTS engines read them as names ("party popper", "sparkles", etc.)
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// ── Spoken-prose math normalization (voice channel) ─────────────────────────
//
// The voice tutor's spoken stream is prose with light math leakage — the
// model is told to keep notation in the <math> tag, but simple equations
// still slip through and the TTS engine reads them awkwardly: "=" becomes
// "equal sign" mid-equation, and a variable product like "ax" or "Ax" is
// pronounced as the word "axe" (owner report, 2026-07-29).

/**
 * Normalize light math notation inside spoken prose. Deliberately narrower
 * than cleanTextForTTS: it must be safe on ordinary sentences, so every rule
 * is gated on adjacent math context.
 */
function speakMathInProse(text) {
  if (!text) return text;
  let s = text;

  // Variable products: a letter pair ending in x/y/z adjacent to a math
  // operator (or glued to a leading digit) is algebra, not a word —
  // "ax + b" → "a x plus b", "Ax = b" → "A x equals b", "2ax" → "2 a x".
  // Ordinary words are untouched: "wax on", "by 2", "my answer" have no
  // operator adjacency ("divided by 2" has a digit, but with a space).
  s = s.replace(/\b([a-zA-Z])([xyz])\b(?=\s*[+\-=*/^×÷])/g, '$1 $2');
  s = s.replace(/(?<=[+\-=*/^×÷]\s*)\b([a-zA-Z])([xyz])\b/g, '$1 $2');
  s = s.replace(/(?<=\d)([a-zA-Z])([xyz])\b/g, ' $1 $2');

  // Unicode operators the engine reads oddly or skips.
  s = s.replace(/\s*×\s*/g, ' times ');
  s = s.replace(/\s*÷\s*/g, ' divided by ');
  s = s.replace(/\s*≤\s*/g, ' less than or equal to ');
  s = s.replace(/\s*≥\s*/g, ' greater than or equal to ');
  s = s.replace(/\s*≠\s*/g, ' is not equal to ');

  // Caret exponents that leaked into speech.
  s = s.replace(/\^2(?!\d)/g, ' squared');
  s = s.replace(/\^3(?!\d)/g, ' cubed');
  s = s.replace(/\^(\d+)/g, (_, n) => ` to the ${speakOrdinal(parseInt(n, 10))} power`);

  // "=" reads as "equal sign" — say "equals". Guard comparison pairs.
  s = s.replace(/\s*(?<![<>=!])=(?!=)\s*/g, ' equals ');

  // Collapse doubled spaces the insertions may create (leave newlines alone).
  s = s.replace(/ {2,}/g, ' ');
  return s;
}

/**
 * Streaming wrapper for speakMathInProse. The voice session forwards
 * token-level fragments to Cartesia, and the prose rules need one token of
 * lookahead ("ax" is only algebra once the "+" after it arrives) — so the
 * filter holds back the trailing unfinished token and normalizes everything
 * before it. Same push/flush contract as the board-tag stream filters.
 */
function createMathSpeechStreamFilter() {
  let buffer = '';
  let endedWithSpace = false;

  // Normalization can add a leading space ("= 20" → " equals 20"); when the
  // previous emission already ended in one, collapse the seam.
  function emitNormalized(raw) {
    if (!raw) return '';
    let out = speakMathInProse(raw);
    if (endedWithSpace) out = out.replace(/^ +/, '');
    if (out) endedWithSpace = / $/.test(out);
    return out;
  }

  return {
    /** Append a fragment; returns normalized text that is safe to emit now. */
    push(fragment) {
      if (fragment) buffer += fragment;
      // Hold back the final \S+ run (a token possibly still being streamed)
      // plus any trailing operator cluster whose right operand hasn't arrived.
      const m = buffer.match(/(?:[\s]|^)(?:[+\-=*/^×÷≤≥≠]\s*)?\S*$/);
      const holdFrom = m ? m.index + (m[0].startsWith(' ') || m[0].startsWith('\n') ? 1 : 0) : buffer.length;
      if (holdFrom <= 0) return '';
      const emit = buffer.slice(0, holdFrom);
      buffer = buffer.slice(holdFrom);
      return emitNormalized(emit);
    },
    /** Drain whatever is held back (end of turn). */
    flush() {
      const tail = buffer;
      buffer = '';
      return emitNormalized(tail);
    },
  };
}

module.exports = {
  cleanTextForTTS,
  convertLatexToSpeech,
  pauseNumberedListItems,
  speakMathInProse,
  createMathSpeechStreamFilter,
  speakNumber,
  speakOrdinal,
};
