'use strict';
/* ============================================================
   algebraTileVerifier.js — the SERVER-authoritative check for an
   algebra-tile student move (Living Math Workspace, spec P1/P2).

   This is the deterministic half of "client proposes, server
   disposes": the browser renders a provisional result instantly,
   but THIS decides whether the move is mathematically valid. The
   client's claim is never trusted.

   Scope (P1 slice — enough to prove the loop): combine_like_terms
   and create_zero_pair. The full tile engine (all ops + full state
   application) is P2; this returns the verdict + canonical result,
   which is what the tutoring pipeline needs to react.

   A term = { coefficient:number, variable:string }. variable is
   'x', 'x^2', … or '' for a constant/unit tile.
   ============================================================ */

const { MATH_CLASSIFICATIONS } = require('../../shared/workspace/constants/moveTypes');

function isTerm(t) {
  return t && typeof t === 'object'
    && typeof t.coefficient === 'number' && Number.isFinite(t.coefficient)
    && typeof t.variable === 'string';
}

function termToString(t) {
  const v = t.variable || '';
  if (!v) return String(t.coefficient);
  if (t.coefficient === 1) return v;
  if (t.coefficient === -1) return '-' + v;
  return `${t.coefficient}${v}`;
}

function sumToString(terms) {
  return terms.map(termToString).join(' + ').replace(/\+ -/g, '- ');
}

/**
 * @param {object} previousState  the element's tile state before the move (opaque here; echoed on valid)
 * @param {object} operation      { type, operands: Term[] }
 * @returns {{
 *   interactionValid:boolean,           // was it a real, well-formed interaction?
 *   mathematicallyValid:(boolean|null), // null when validity is N/A
 *   classification:string,              // one of MATH_CLASSIFICATIONS
 *   canonicalMove:(string|null),        // "2x + 3x -> 5x"
 *   misconceptionCode:(string|null),
 *   resultingState:(object|null)        // canonical result when valid
 * }}
 */
function verifyAlgebraTileMove(previousState, operation) {
  const fail = (reason) => ({
    interactionValid: false,
    mathematicallyValid: null,
    classification: 'invalid_interaction',
    canonicalMove: null,
    misconceptionCode: reason,
    resultingState: null,
  });

  if (!operation || typeof operation !== 'object') return fail('MALFORMED_OPERATION');
  const operands = Array.isArray(operation.operands) ? operation.operands : [];

  switch (operation.type) {
    case 'combine_like_terms': {
      if (operands.length !== 2 || !operands.every(isTerm)) return fail('COMBINE_NEEDS_TWO_TERMS');
      const [a, b] = operands;
      const like = a.variable === b.variable;

      if (!like) {
        // A real interaction, but a mathematical error — the classic
        // "2x + 3 = 5x". Allow-and-teach: flag it, don't reject it.
        return {
          interactionValid: true,
          mathematicallyValid: false,
          classification: 'combine_unlike_terms',
          canonicalMove: `${termToString(a)} + ${termToString(b)} (unlike terms — cannot combine)`,
          misconceptionCode: 'COMBINED_UNLIKE_TERMS',
          resultingState: null, // we never fabricate the student's wrong claim as fact
        };
      }

      const combined = { coefficient: a.coefficient + b.coefficient, variable: a.variable };
      return {
        interactionValid: true,
        mathematicallyValid: true,
        classification: 'combine_like_terms',
        canonicalMove: `${termToString(a)} + ${termToString(b)} -> ${termToString(combined)}`,
        misconceptionCode: null,
        resultingState: Object.assign({}, previousState, { lastResult: combined }),
      };
    }

    case 'create_zero_pair': {
      if (operands.length !== 2 || !operands.every(isTerm)) return fail('ZERO_PAIR_NEEDS_TWO_TERMS');
      const [a, b] = operands;
      const opposite = a.variable === b.variable && (a.coefficient + b.coefficient === 0);
      if (!opposite) {
        return {
          interactionValid: true,
          mathematicallyValid: false,
          classification: 'invalid_interaction',
          canonicalMove: null,
          misconceptionCode: 'NOT_A_ZERO_PAIR',
          resultingState: null,
        };
      }
      return {
        interactionValid: true,
        mathematicallyValid: true,
        classification: 'create_zero_pair',
        canonicalMove: `${termToString(a)} + ${termToString(b)} -> 0`,
        misconceptionCode: null,
        resultingState: Object.assign({}, previousState, { lastResult: { coefficient: 0, variable: a.variable } }),
      };
    }

    default:
      return fail('UNSUPPORTED_OPERATION');
  }
}

module.exports = { verifyAlgebraTileMove, termToString, sumToString, MATH_CLASSIFICATIONS };
