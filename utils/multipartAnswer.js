'use strict';
/* ============================================================
   multipartAnswer.js — grade an answer key that has lettered parts.

   Student audit, 2026-10-14: a "Systems by substitution" challenge scored a
   fully correct run 2 of 5. Two misses were "x=3, y=5" against "(3, 5)" —
   fixed in the shared comparator (#1734). The third was this item:

     key:     a) n + d = 30 and 0.05n + 0.10d = 2.20; b) 16 nickels and 14 dimes
     student: n nickels, d dimes; n+d=30; 5n+10d=220; n=16,d=14

   Correct in every part, and no single-value comparator can say so: the key is
   two answers glued together with prose. 78 active items have keys of this
   shape (factoring sets, slope/intercept/equation triples, word-problem
   systems). This module grades them part by part instead of as one string.

   Verdicts are asymmetric, as everywhere else in grading: a part we can read
   and that disagrees is WRONG; a part we cannot read (prose — "the pool loses
   25 gallons each minute") is UNDECIDED, and an undecided item is reported
   ungradable so a parsing limit never becomes a diagnosed skill gap.
   ============================================================ */

const math = require('mathjs');
const { verifyAnswer } = require('./mathSolver');

const PART_RE = /(?:^|[\s;,.])\(?([a-f])\)\s*/g;
const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?`;

const clean = (s) => String(s == null ? '' : s)
  .replace(/[−–—]/g, '-')
  .replace(/[·×]/g, '*')
  .replace(/\$/g, '')
  .trim();

function same(a, b) {
  try { return verifyAnswer(a, b).isCorrect; } catch { return false; }
}

/** "a) … b) …" → [{ label, text }], or null when the text has fewer than two parts. */
function splitParts(text) {
  const s = clean(text);
  const marks = [...s.matchAll(PART_RE)];
  // Labels must run a, b, c… from the first one, or "f(x) = 3" style text would
  // split on its own parentheses.
  const ordered = [];
  for (const m of marks) {
    const want = String.fromCharCode(97 + ordered.length);
    if (m[1] === want) ordered.push(m);
  }
  if (ordered.length < 2) return null;
  return ordered.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < ordered.length ? ordered[i + 1].index : s.length;
    return { label: m[1], text: s.slice(start, end).replace(/[\s;,.]+$/, '').trim() };
  });
}

/** Segments of free text: split on ; , newlines and the word "and". */
function segments(text) {
  const parts = splitParts(text);
  const body = parts ? parts.map((p) => p.text).join('; ') : clean(text);
  return body.split(/[;\n]|,(?!\d{3}\b)|\band\b/i).map((t) => t.trim()).filter(Boolean);
}

/** Bare assignments "n = 16" → [{ name, value }]. */
function parseAssignments(text) {
  const re = new RegExp(String.raw`^([a-z])\s*=\s*(${NUMBER})$`, 'i');
  const out = [];
  for (const seg of segments(text)) {
    const m = seg.match(re);
    if (!m) continue;
    const value = math.evaluate(m[2]);
    if (Number.isFinite(value)) out.push({ name: m[1].toLowerCase(), value });
  }
  return out;
}

/** Variables of an expression, or null if it names anything but single letters. */
function variablesOf(expr) {
  const vars = new Set();
  let bad = false;
  math.parse(expr).traverse((n) => {
    if (!n.isSymbolNode) return;
    if (/^[a-z]$/i.test(n.name)) vars.add(n.name.toLowerCase());
    else if (typeof math[n.name] !== 'function') bad = true;
  });
  return bad ? null : vars;
}

/**
 * Equations relating two or more unknowns ("n + d = 30", chained "a = b = c"),
 * compiled for evaluation. Prose and single-variable assignments are skipped.
 */
function parseEquations(text) {
  const out = [];
  for (const seg of segments(text)) {
    if (!seg.includes('=') || /[a-z]{2,}/i.test(seg.replace(/\b(sqrt|abs)\b/g, ''))) continue;
    const sides = seg.split('=').map((t) => t.trim().toLowerCase());
    if (sides.some((t) => !t)) continue;
    try {
      const vars = new Set();
      for (const side of sides) {
        const v = variablesOf(side);
        if (!v) throw new Error('not math');
        v.forEach((x) => vars.add(x));
      }
      if (vars.size < 2) continue;
      const checks = [];
      for (let i = 0; i + 1 < sides.length; i++) checks.push(math.compile(`(${sides[i]}) - (${sides[i + 1]})`));
      out.push({ vars, holdsAt: (scope) => checks.every((c) => Math.abs(c.evaluate(scope)) < 1e-6) });
    } catch { /* not an equation we can evaluate */ }
  }
  return out;
}

/** "16 nickels and 14 dimes" → [{ value: 16, noun: 'nickels' }, …]. Percents are not quantities. */
function parseQuantities(text) {
  const re = new RegExp(String.raw`(${NUMBER})\s+(?!%)([a-z][a-z-]*)`, 'gi');
  return [...clean(text).matchAll(re)]
    .map((m) => ({ value: math.evaluate(m[1]), noun: m[2].toLowerCase() }))
    .filter((q) => Number.isFinite(q.value) && !/^(of|and|or|to|per|is|are)$/.test(q.noun));
}

const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const rest = [...b];
  return a.every((v) => {
    const i = rest.findIndex((w) => near(v, w));
    if (i < 0) return false;
    rest.splice(i, 1);
    return true;
  });
}

/**
 * Word-problem systems: the last part names the solution as quantities, the
 * student states it as assignments. Returns a verdict or null when this is not
 * that shape.
 */
function gradeSolution(parts, submitted) {
  const quantities = parseQuantities(parts[parts.length - 1].text);
  const assigned = parseAssignments(submitted);
  if (quantities.length < 2 || assigned.length !== quantities.length) return null;

  const keyValues = quantities.map((q) => q.value);
  const values = assigned.map((a) => a.value);
  if (!sameMultiset(values, keyValues)) return { correct: false, reason: null };

  const scope = Object.fromEntries(assigned.map((a) => [a.name, a.value]));
  const names = assigned.map((a) => a.name);

  // Which unknown is which. Distinct values make this a non-question; equal
  // values (12 and 12) likewise. Otherwise read it from the key's own
  // equations when they use the student's letters, or from the nouns' initials
  // ("n" ↔ nickels), and only then fall back to the order the key lists them.
  if (new Set(keyValues).size > 1) {
    const keyEquations = parseEquations(parts.slice(0, -1).map((p) => p.text).join('; '));
    const usable = keyEquations.filter((e) => [...e.vars].every((v) => names.includes(v)));
    let mapped;
    if (usable.length) {
      mapped = usable.every((e) => e.holdsAt(scope));
    } else {
      const initials = quantities.map((q) => q.noun[0]);
      if (new Set(initials).size === initials.length && initials.every((c) => names.includes(c))) {
        mapped = quantities.every((q) => near(scope[q.noun[0]], q.value));
      } else {
        mapped = values.every((v, i) => near(v, keyValues[i]));
      }
    }
    if (!mapped) return { correct: false, reason: null };
  }

  // The modeling part. A key that asks for the system wants it written; and
  // every equation the student wrote must actually hold at their solution.
  const keyEquationCount = parseEquations(parts.slice(0, -1).map((p) => p.text).join('; ')).length;
  const written = parseEquations(submitted).filter((e) => [...e.vars].every((v) => v in scope));
  if (written.length < keyEquationCount) return { correct: false, reason: 'incomplete' };
  if (!written.every((e) => { try { return e.holdsAt(scope); } catch { return false; } })) {
    return { correct: false, reason: null };
  }
  return { correct: true, reason: null };
}

/**
 * A key part we can compare on value, as opposed to a sentence. Any word of two
 * or more letters makes it prose ("slope = −25, y-intercept = 300" names two
 * things; "the pool loses 25 gallons each minute" is an explanation) — except
 * the one-word answers a factoring or slope set uses.
 */
function isMathPart(text) {
  const words = (clean(text).match(/[a-z]{2,}/gi) || [])
    .filter((w) => !/^(prime|undefined|sqrt|abs)$/i.test(w));
  return words.length === 0;
}

const SAMPLES = [{ x: 1.3, y: -0.7 }, { x: -2.1, y: 3.4 }, { x: 0.6, y: 2.9 }];

/** Two equations with the same solution set, for the linear forms these keys use. */
function sameEquation(a, b) {
  try {
    const fa = math.compile(a.split('=').map((t) => `(${t})`).join('-'));
    const fb = math.compile(b.split('=').map((t) => `(${t})`).join('-'));
    const scope = (pt) => ({ ...pt, m: 2, b: 5 });
    const ratios = SAMPLES.map((pt) => {
      const va = fa.evaluate(scope(pt));
      const vb = fb.evaluate(scope(pt));
      return Math.abs(vb) < 1e-9 ? (Math.abs(va) < 1e-9 ? null : NaN) : va / vb;
    }).filter((r) => r !== null);
    return ratios.length > 0 && ratios.every((r) => Number.isFinite(r) && Math.abs(r) > 1e-9 && near(r, ratios[0]));
  } catch { return false; }
}

/** One part: on value, on the right-hand side of "m = 3", or as an equation. */
function partMatches(answer, key) {
  if (same(answer, key)) return true;
  const assign = key.match(/^([a-z])\s*=\s*([^=]+)$/i);
  if (assign && !/[a-z]/i.test(assign[2])) {
    const theirs = answer.replace(new RegExp(`^${assign[1]}\\s*=\\s*`, 'i'), '');
    return !theirs.includes('=') && same(theirs, assign[2]);
  }
  if ((key.match(/=/g) || []).length === 1 && (answer.match(/=/g) || []).length === 1) {
    return sameEquation(clean(answer).toLowerCase(), clean(key).toLowerCase());
  }
  return false;
}

/** Part-by-part: the student's parts (lettered, or separated by ;) against the key's. */
function gradeByParts(parts, submitted) {
  let theirs = splitParts(submitted);
  if (!theirs) {
    const pieces = clean(submitted).split(/;|\n/).map((t) => t.trim()).filter(Boolean);
    if (pieces.length === parts.length) theirs = pieces.map((text, i) => ({ label: parts[i].label, text }));
  }
  if (!theirs || theirs.length !== parts.length) return { correct: false, reason: 'ungradable' };

  let undecided = false;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i].text;
    if (partMatches(theirs[i].text, key)) continue;
    if (isMathPart(key)) return { correct: false, reason: null };
    undecided = true;
  }
  return undecided ? { correct: false, reason: 'ungradable' } : { correct: true, reason: null };
}

/**
 * Grade a submission against a lettered multipart key.
 * Returns null when the key is not multipart (the caller grades it as one value),
 * otherwise { correct, reason } with reason null | 'incomplete' | 'ungradable'.
 */
function gradeMultipart(key, submitted) {
  const parts = splitParts(key);
  if (!parts) return null;
  return gradeSolution(parts, submitted) || gradeByParts(parts, submitted);
}

module.exports = { gradeMultipart, splitParts, parseAssignments, parseEquations, parseQuantities };
