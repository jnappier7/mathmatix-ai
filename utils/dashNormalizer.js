'use strict';

/**
 * Replace punctuation EM dashes (—, U+2014) with a comma.
 *
 * Why: a tutor writing "That's right — 7" gets misread by a student as
 * "that's right minus 7". An em dash is a punctuation dash, never a math
 * glyph, so swapping it for a comma removes the dash-vs-minus ambiguity
 * without touching any math.
 *
 * What we deliberately DO NOT touch:
 *   • hyphen-minus '-' (U+002D)  — the normal minus/subtraction character
 *   • en dash       '–' (U+2013) — a minus lookalike used for negatives,
 *                                   subtraction, and numeric ranges
 * Rewriting those would corrupt real math: "8 – 3" is subtraction, not
 * "8, 3", and "–7" is negative seven, not ", 7".
 *
 * Even for em dashes we leave one alone when it sits directly between two
 * numbers (e.g. "8—3" or a "3—5" range), on the off chance it was meant as
 * an operator. An em dash with a non-number on either side is punctuation
 * and becomes a comma — which is exactly the reported case ("right — 7").
 *
 * @param {string} text
 * @returns {string} the same value if not a non-empty string
 */
function replaceDashes(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/(\d?)\s*—\s*(\d?)/g, (match, before, after) => {
    // Number on both sides → treat as a range/operator, leave untouched.
    if (before && after) return match;
    return `${before}, ${after}`;
  });
}

module.exports = { replaceDashes };
