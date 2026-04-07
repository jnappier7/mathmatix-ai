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

  // Equals — but only isolated = signs, not inside words
  speech = speech.replace(/\s*=\s*/g, ' equals ');

  // Plus/minus in expressions: make them speakable
  speech = speech.replace(/\s*\+\s*/g, ' plus ');
  speech = speech.replace(/\s*-\s*/g, ' minus ');

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

/**
 * Full TTS preprocessing pipeline.
 * Strips markdown, converts LaTeX to speech, cleans visual commands.
 */
function cleanTextForTTS(text) {
  let cleaned = text;

  // Remove visual commands: [DIAGRAM:...], [FUNCTION_GRAPH:...], etc.
  cleaned = cleaned.replace(/\[(DIAGRAM|FUNCTION_GRAPH|SLIDER_GRAPH|POINTS|DERIVATIVE_GRAPH|VELOCITY_GRAPH|RATIONAL_GRAPH|NUMBER_LINE|FRACTION|PIE_CHART|BAR_CHART|UNIT_CIRCLE|AREA_MODEL|SEARCH_IMAGE|WHITEBOARD_WRITE|EQUATION_SOLVE|STEPS|\/STEPS|OLD|NEW|FOCUS|TRIANGLE_PROBLEM)[^\]]*\]/g, '');

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

  // Convert LaTeX expressions to speech
  cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/(?<![\\$])\$([^$\n]+?)\$/g, (_, latex) => convertLatexToSpeech(latex));

  // Remove any remaining LaTeX commands
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

module.exports = {
  cleanTextForTTS,
  convertLatexToSpeech,
  speakNumber,
  speakOrdinal,
};
