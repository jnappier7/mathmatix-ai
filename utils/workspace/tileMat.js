'use strict';
/* ============================================================
   tileMat.js — which algebra tiles a line of math IS.

   The Work Board's `tiles` card is a picture of an expression or an
   equation laid out in algebra tiles: big squares for x², bars for x,
   small squares for units, one colour for positive and one for
   negative, and for an equation a mat with a left and a right side.

   The tutor only NAMES the line ("tiles for 2x + 3 = 7"). It never
   places a tile. This module reads the line and decides the tiles, so
   the picture is correct by construction — a model cannot draw a mat
   that disagrees with its own equation, miscount, or colour a negative
   as a positive. Anything this cannot read with certainty is `null`
   and the card is dropped upstream: the math stays in the message, and
   a missing picture is acceptable where a wrong one is not.

   What tiles can show (and so what is accepted):
     • ONE variable, any single letter
     • powers 1 and 2 only          (there is no x³ tile)
     • whole-number coefficients    (there is no half tile)
     • a plain sum of terms         (no brackets, fractions, radicals)
     • an expression, or an equation with exactly one "="
   Terms are NOT combined: 2x + 3 − 3 keeps three positive and three
   negative unit tiles, because the zero pairs are the lesson.

   Pure. No DOM, no Mongo. The client draws from the returned `mat`
   and never parses math itself.
   ============================================================ */

// A mat a student can take in at a glance. Past this the picture is a
// carpet, not a model — say it in words instead.
const LIMITS = { perSide: 30, squares: 6, coefficient: 20 };

const KINDS = ['x2', 'x', 'unit'];

function emptySide() {
  return { x2: [0, 0], x: [0, 0], unit: [0, 0] };   // each: [positive, negative]
}

/** Strip the LaTeX dressing a plain polynomial can arrive in. */
function plain(tex) {
  let s = String(tex == null ? '' : tex);
  if (/\d\s*(?:\\cdot|\\times|[*×·])\s*\d/.test(s)) return null;   // 2 · 3 is arithmetic, not a term
  s = s
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:! ]/g, '')
    .replace(/\\cdot|\\times|[*×·]/g, '')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/\^\s*\{\s*(\d+)\s*\}/g, '^$1')
    .replace(/[$\s]/g, '')
    .toLowerCase();
  return /^[0-9a-z+\-=^]+$/.test(s) ? s : null;
}

/** One side of the mat from "2x^2-3x+4", or null. `seen` carries the variable. */
function readSide(text, seen) {
  if (!text) return null;
  const side = emptySide();
  const term = /([+-]?)(\d*)(?:([a-z])(?:\^(\d+))?)?/y;
  let at = 0;
  while (at < text.length) {
    term.lastIndex = at;
    const m = term.exec(text);
    if (!m || m[0].length === 0) return null;
    const [, sign, digits, variable, power] = m;
    if (!digits && !variable) return null;            // a bare "+" or "-"
    if (at > 0 && !sign) return null;                 // "2x3", "xy" — not a sum of terms
    const n = digits === '' ? 1 : Number(digits);
    if (!Number.isInteger(n) || n > LIMITS.coefficient) return null;
    let kind = 'unit';
    if (variable) {
      if (seen.variable && seen.variable !== variable) return null;   // one variable only
      seen.variable = variable;
      if (power === undefined || power === '1') kind = 'x';
      else if (power === '2') kind = 'x2';
      else return null;
    }
    side[kind][sign === '-' ? 1 : 0] += n;
    at += m[0].length;
  }
  return side;
}

function countSide(side) {
  return KINDS.reduce((sum, k) => sum + side[k][0] + side[k][1], 0);
}

/**
 * @param {string} tex  an expression or equation, e.g. "2x + 3 = 7"
 * @returns {{ tex:string, variable:string, sides:Array<{x2:number[],x:number[],unit:number[]}> }|null}
 *   `sides` has one entry for an expression, two for an equation.
 */
function parseTileMat(tex) {
  const s = plain(tex);
  if (!s) return null;
  const parts = s.split('=');
  if (parts.length > 2) return null;
  const seen = { variable: '' };
  const sides = [];
  for (const part of parts) {
    const side = readSide(part, seen);
    if (!side) return null;
    if (countSide(side) > LIMITS.perSide) return null;
    if (side.x2[0] + side.x2[1] > LIMITS.squares) return null;
    sides.push(side);
  }
  if (sides.every(side => countSide(side) === 0)) return null;      // "0", "0 = 0"
  return { tex: String(tex).trim(), variable: seen.variable || 'x', sides };
}

module.exports = { parseTileMat, LIMITS };
