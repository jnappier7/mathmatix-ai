'use strict';
/* ============================================================
   scaffoldBlankVerifier.js — server-authoritative verdict for a
   student filling a scaffold blank (\boxed{}) on an equation card.

   Owner call, 2026-07-28: the board's blanks must be interactive
   again — but through the StudentMove contract this time ("if board
   input returns it must be StudentMoves"; the 2026-07-25 removal was
   of inputs that submitted through a side door chat had no concept of).

   Verdict philosophy (same asymmetry as diagnose):
     - a SINGLE-blank equation ("1 \div \boxed{} = 10" filled with 0.1)
       is decided deterministically via the CAS: substitute, split on
       "=", numeric-sample both sides.
     - anything the CAS cannot settle (remaining blanks, un-texable
       commands, no equation) stays mathematicallyValid: null — the
       delegated tutor turn grades it with full context instead. A
       blank fill is NEVER called wrong by a parser failure.
   ============================================================ */

const { equivalent } = require('../pipeline/symbolicVerifier');

const BOXED_RX = /\\boxed\s*\{[^{}]*\}/g;
// What a typed blank value may contain: numbers, variables, basic operators,
// parens, decimal/comma, minus signs (ascii + unicode), slash, caret, percent.
const VALUE_RX = /^[-+0-9a-zA-Z().,/^*%\s−]{1,30}$/;

/**
 * Convert the small tex subset the board scaffold uses into a mathjs-parseable
 * plain expression. Returns null when anything unconvertible remains — the
 * caller must then abstain rather than risk a wrong verdict.
 */
function texToPlain(tex) {
  if (typeof tex !== 'string') return null;
  let t = tex;
  t = t.replace(/\\left|\\right/g, '');
  t = t.replace(/\\boxed\s*\{([^{}]*)\}/g, '($1)');
  t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
  t = t.replace(/\\div/g, '/').replace(/\\times/g, '*').replace(/\\cdot/g, '*');
  t = t.replace(/−/g, '-').replace(/\\%/g, '%');
  t = t.replace(/\\[,;!\s]/g, ' ');
  if (/\\[a-zA-Z]/.test(t)) return null;   // an untranslated command — abstain
  // Grouping braces are LaTeX syntax, not mathjs — convert to parens.
  t = t.replace(/\{/g, '(').replace(/\}/g, ')');
  return t.trim();
}

/**
 * Substitute `value` into the blankIndex-th \boxed{} of stepTex.
 * @returns {string|null} the substituted tex, or null if no such blank
 */
function substituteBlank(stepTex, blankIndex, value) {
  if (typeof stepTex !== 'string') return null;
  let i = -1;
  let hit = false;
  const out = stepTex.replace(BOXED_RX, (m) => {
    i += 1;
    if (i === Number(blankIndex)) { hit = true; return `{${value}}`; }
    return m;
  });
  return hit ? out : null;
}

/**
 * @param {object} move  validated StudentMove (elementType 'equation',
 *                       operation { type:'fill_blank',
 *                                   parameters:{ stepTex, blankIndex, value } })
 * @returns {{ interactionValid:boolean, mathematicallyValid:(boolean|null),
 *             classification:string, canonicalMove:(string|null),
 *             resultingState:(object|null) }}
 */
function verifyScaffoldBlankMove(move) {
  const p = (move && move.operation && move.operation.parameters) || {};
  const invalid = {
    interactionValid: false, mathematicallyValid: null,
    classification: 'invalid_interaction', canonicalMove: null, resultingState: null,
  };
  if (!move || !move.operation || move.operation.type !== 'fill_blank') return invalid;
  const value = typeof p.value === 'string' ? p.value.trim() : '';
  if (!value || !VALUE_RX.test(value)) return invalid;
  if (typeof p.stepTex !== 'string' || !/\\boxed/.test(p.stepTex)) return invalid;

  const substituted = substituteBlank(p.stepTex, p.blankIndex, value);
  if (substituted === null) return invalid;

  const base = {
    interactionValid: true,
    canonicalMove: 'fill_blank',
    resultingState: { tex: substituted },
  };

  // More blanks still open → the claim is partial; nothing to decide yet.
  if (/\\boxed\s*\{/.test(substituted)) {
    return { ...base, mathematicallyValid: null, classification: 'blank_fill_unverified' };
  }

  const plain = texToPlain(substituted);
  const parts = plain ? plain.split('=') : [];
  if (!plain || parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return { ...base, mathematicallyValid: null, classification: 'blank_fill_unverified' };
  }

  let verdict = null;
  try { verdict = equivalent(parts[0], parts[1]); } catch (_) { verdict = null; }
  if (verdict === true) {
    return { ...base, mathematicallyValid: true, classification: 'blank_fill_valid' };
  }
  if (verdict === false) {
    return { ...base, mathematicallyValid: false, classification: 'blank_fill_incorrect' };
  }
  return { ...base, mathematicallyValid: null, classification: 'blank_fill_unverified' };
}

module.exports = { verifyScaffoldBlankMove, substituteBlank, texToPlain };
