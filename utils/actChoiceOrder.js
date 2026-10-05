// utils/actChoiceOrder.js — numeric answer choices in ascending order.
//
// The real ACT lists numeric choices in increasing order. Two places apply it:
//   - scripts/sortActNumericChoices.js fixes the seed files (the source of
//     truth for the banks in this repo), and
//   - utils/actTestAssembler.js sorts every item as a form is built, which
//     covers items that reached production from anywhere else.
// Both use these functions so they cannot disagree.
//
// A test freezes the order it was built with. Grading and the review queue
// carry a pick to the bank by choice TEXT (relabelByText), so serving an order
// different from the bank's is safe; remapChoiceLetters keeps an
// explanation's "Choice B…" pointing at the right choice.

const { numericValue } = require('./distractorQuality');

/**
 * The value to sort a choice by: a plain number (numericValue), or a number
 * followed by a unit — "540°", "12 cm", "3.5 ft²" — when every choice in the
 * set carries the same unit. Returns null per choice when not sortable.
 */
function sortValues(texts) {
  const parts = texts.map((t) => {
    const s = String(t == null ? '' : t).trim();
    const plain = numericValue(s);
    if (plain != null) return { v: plain, unit: '' };
    const m = /^(.*?\d)\s*(°|[A-Za-z]{1,12}\.?[²³]?)$/.exec(s);
    if (!m) return null;
    const v = numericValue(m[1]);
    return v == null ? null : { v, unit: m[2].toLowerCase() };
  });
  if (parts.some((p) => !p)) return null;
  if (new Set(parts.map((p) => p.unit)).size !== 1) return null;   // mixed units: leave alone
  return parts.map((p) => p.v);
}

function isMonotonic(values) {
  let up = true;
  let down = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) up = false;
    if (values[i] > values[i - 1]) down = false;
  }
  return up || down;
}

/**
 * The new order for a list of choice texts, or null when nothing should move:
 * new position i holds old position perm[i]. Ascending, stable for ties. Sets
 * already in ascending or descending order are left as written.
 */
function sortPermutation(texts) {
  const values = sortValues(texts);
  if (!values || values.length < 3 || isMonotonic(values)) return null;
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v - b.v) || (a.i - b.i))
    .map((x) => x.i);
}

/**
 * Remap choice letters inside the sentences that talk about choices
 * ("Choice B (0.38) is…", "rules out A and B", "the answer is C"). A bare
 * letter anywhere else is usually a point or angle name (∠A, sin B) and is
 * left alone. `map` is old letter -> new letter.
 */
function remapChoiceLetters(text, map) {
  if (!text || !map) return text;
  return String(text).split(/(?<=[.!?])(\s+)/).map((s) => {
    if (!/\b(?:[Cc]hoices?|answer is|rules out)\b/.test(s)) return s;
    // Through a placeholder so A→B and B→A cannot collide.
    return s
      .replace(/(^|[^∠\w])([A-E])(?=$|[^\w])/g, (m, pre, l) => `${pre}\u0000${l}`)
      .replace(/\u0000([A-E])/g, (m, l) => map[l] || l);
  }).join('');
}

module.exports = { sortValues, isMonotonic, sortPermutation, remapChoiceLetters };
