/**
 * voiceBoardCards.js — a new problem gets a new card in a voice call.
 *
 * Owner, 2026-11-28, after a call on the first build that showed the board in
 * voice mode: "the board doesn't refresh for a new problem. I did about 4
 * problems and was on line 23."
 *
 * Voice has no pose concept. Its board protocol is a list of lines (a
 * cumulative <math> array, or [WRITE:] tags) and the translator turns every
 * line into a `resolve` — "one more step of the card in focus". The server's
 * ledger knew about a change of problem only when the model relabelled its
 * first entry "Given"; the client was never told at all, so every line of
 * every problem landed on one card.
 *
 * Here each line is sorted against the card in focus, by the math and not by
 * the label:
 *
 *   - already on the card (or on a card finished earlier, which the
 *     cumulative protocol keeps re-sending)            -> dropped
 *   - the answer to the problem in focus               -> `verify` (closes it)
 *   - a line of the same work                          -> `resolve`
 *   - provably DIFFERENT math, or a line the tutor
 *     labelled "Given"/"Problem" that is new           -> `pose` (new card)
 *   - cannot tell                                      -> `resolve`
 *
 * "Provably different" is deliberately narrow — one-variable equations only:
 * another variable, a linear equation with another root, or anything new once
 * the card is solved. Arithmetic and bare expressions are never called
 * different by the math (their steps are full of unequal parts: "3/4 = 6/8",
 * "2x + 6"), so there the tutor's label is what opens a card.
 *
 * "Cannot tell" stays on the card on purpose: a step filed under the wrong
 * card is a smaller mistake than a solve chopped into several cards (see
 * pipeline/boardContinuity.js, which made the same call for the typed path).
 *
 * voiceSession sends the result to the client as `boardCommands`, and folds
 * the same list into the ledger, so the board the student sees and the board
 * the tutor is told about cannot differ.
 *
 * Pure: no Mongo, no clock.
 */
'use strict';

const { parseLine } = require('./pipeline/checkWorkSteps');
const { residualRatio, answersProblem } = require('./pipeline/boardContinuity');

const SAMPLES = [-3.7, -1.3, 0.6, 1.9, 2.8, 4.1, 6.3];
const REL_TOL = 1e-6;

function close(a, b) {
  return Math.abs(a - b) <= REL_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

// Same textual identity the continuity module uses.
function normLine(tex) {
  return String(tex == null ? '' : tex)
    .replace(/\\left|\\right/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parse(tex) {
  try { return parseLine(String(tex == null ? '' : tex)) || null; } catch (_) { return null; }
}

function sameVars(a, b) {
  if (a.vars.size !== b.vars.size) return false;
  for (const v of a.vars) if (!b.vars.has(v)) return false;
  return true;
}

// Evaluate a parsed line with every variable set from the i-th sample (each
// variable gets its own offset so x and y never coincide).
function at(line, i) {
  const scope = {};
  let k = 0;
  for (const v of [...line.vars].sort()) scope[v] = SAMPLES[i] + 0.37 * k++;
  try {
    const y = line.f(scope);
    const n = typeof y === 'number' ? y : Number(y);
    return Number.isFinite(n) ? n : null;
  } catch (_) { return null; }
}

// Are two expressions the same expression? true / false, or null when they
// cannot be evaluated often enough to say.
function sameExpression(a, b) {
  let checked = 0;
  for (let i = 0; i < SAMPLES.length; i++) {
    const ya = at(a, i);
    const yb = at(b, i);
    if (ya === null || yb === null) continue;
    if (!close(ya, yb)) return false;
    checked++;
  }
  return checked >= (a.vars.size ? 3 : 1) ? true : null;
}

function sidesOf(line) {
  const parts = String(line.text).split('=');
  if (parts.length !== 2) return [];
  return parts.map(parse).filter(Boolean);
}

// The root of a one-variable LINEAR equation, or null.
function linearRoot(line) {
  if (line.kind !== 'equation' || line.vars.size !== 1) return null;
  const v = [...line.vars][0];
  const f = x => { try { const y = Number(line.f({ [v]: x })); return Number.isFinite(y) ? y : null; } catch (_) { return null; } };
  const pts = [-2, -1, 0, 1, 2.5].map(f);
  if (pts.some(y => y === null)) return null;
  const slope = pts[1] - pts[0];
  if (Math.abs(slope) < 1e-12) return null;
  if (!close(pts[2] - pts[1], slope) || !close(pts[3] - pts[2], slope) || !close((pts[4] - pts[3]) / 1.5, slope)) return null;
  return -pts[2] / slope;
}

function residualAtRoot(line, root) {
  const v = [...line.vars][0];
  try { const y = Number(line.f({ [v]: root })); return Number.isFinite(y) ? y : null; } catch (_) { return null; }
}

/**
 * Is line `b` part of the same work as line `a`?
 *   true  — it is (a step, a restatement, a root of it, the same value)
 *   false — it is different math
 *   null  — cannot tell
 * `strict` (the card is already solved): a merely proportional equation no
 * longer counts — every linear equation with root 5 is proportional to x − 5,
 * and after the answer the next one is a new problem.
 */
function sameWork(aTex, bTex, { strict = false } = {}) {
  const a = parse(aTex);
  const b = parse(bTex);
  if (!a || !b) return null;

  if (a.kind === 'equation' && b.kind === 'equation') {
    // Arithmetic statements ("3/4 + 1/8 = 7/8"): same work when a value is
    // shared. Never "different": the steps of an arithmetic problem are full
    // of true statements about its parts ("3/4 = 6/8", "10 × 4 = 40").
    if (a.vars.size === 0 && b.vars.size === 0) {
      const va = sidesOf(a).map(s => at(s, 0)).filter(n => n !== null);
      const vb = sidesOf(b).map(s => at(s, 0)).filter(n => n !== null);
      return va.some(x => vb.some(y => close(x, y))) ? true : null;
    }
    if (a.vars.size === 1 && b.vars.size === 1) {
      if (!sameVars(a, b)) return false;                 // solved for x, now y
      const k = residualRatio(aTex, bTex);
      if (k !== null) return strict ? close(Math.abs(k), 1) : true;
      if (strict) return false;
      // A root of the problem ("x − 2 = 0", "x = 2" under a quadratic).
      const rb = linearRoot(b);
      if (rb !== null) {
        const y = residualAtRoot(a, rb);
        if (y !== null) return Math.abs(y) <= 1e-6 * Math.max(1, Math.abs(rb));
      }
      // Two linear equations with different roots are different problems.
      const ra = linearRoot(a);
      if (ra !== null && rb === null) return false;
      return null;
    }
    // Two or more variables: a system keeps unlike equations on one card.
    return null;
  }

  // Expressions: the same expression is the same work; an unequal one may be
  // a part of it being worked on its own ("2x + 6" under 2(x + 3) + 4x), so it
  // is never called different.
  if (a.kind === 'expression' && b.kind === 'expression') {
    return sameVars(a, b) && sameExpression(a, b) === true ? true : null;
  }

  // One expression, one equation: same work when a side of the equation IS
  // the expression ("3/4 + 1/8" then "3/4 + 1/8 = 7/8").
  const expr = a.kind === 'expression' ? a : b;
  const eq = a.kind === 'expression' ? b : a;
  const sides = sidesOf(eq);
  if (!sides.length) return null;
  for (const s of sides) {
    if (sameVars(s, expr) && sameExpression(s, expr) === true) return true;
  }
  return null;
}

function focusOf(ledger) {
  const cur = ledger && ledger.current && ledger.current.problemTex ? ledger.current : null;
  if (!cur) return null;
  const steps = Array.isArray(cur.steps) ? cur.steps : [];
  return {
    problemTex: String(cur.problemTex),
    lines: steps.filter(s => s && (s.action === 'resolve' || s.action === 'verify') && s.tex).map(s => String(s.tex)),
    solved: steps.some(s => s && s.action === 'verify'),
  };
}

// Every line of every finished card. The cumulative protocol re-sends them.
function pastLines(ledger) {
  const seen = new Set();
  for (const e of (ledger && Array.isArray(ledger.completed) ? ledger.completed : [])) {
    if (!e) continue;
    if (e.problemTex) seen.add(normLine(e.problemTex));
    for (const s of Array.isArray(e.steps) ? e.steps : []) {
      if (s && s.tex && (s.action === 'resolve' || s.action === 'verify')) seen.add(normLine(s.tex));
    }
  }
  return seen;
}

/**
 * Sort one voice turn's board commands onto cards.
 * @param {object|null} ledger  the board ledger BEFORE this turn
 * @param {Array} commands      voiceToBoardCommands output (poses already
 *                              promoted by the ledger's own helpers pass through)
 * @param {object} [opts]
 * @param {Array<string>} [opts.given]  tex of every line the tutor labelled
 *                              "Given"/"Problem" this turn
 * @returns {Array} commands for the client and the ledger alike
 */
function cardVoiceLines(ledger, commands, { given = [] } = {}) {
  const list = Array.isArray(commands) ? commands : [];
  const labelled = new Set((Array.isArray(given) ? given : []).map(normLine));
  let focus = focusOf(ledger);
  const past = pastLines(ledger);
  const out = [];

  const retire = () => {
    if (!focus) return;
    past.add(normLine(focus.problemTex));
    focus.lines.forEach(l => past.add(normLine(l)));
  };
  const open = (tex) => { retire(); focus = { problemTex: String(tex), lines: [], solved: false }; };

  for (const c of list) {
    if (!c || !c.action) continue;
    if (c.action === 'clear') { retire(); focus = null; out.push(c); continue; }
    if (c.action === 'pose' && c.tex) {
      if (focus && normLine(focus.problemTex) === normLine(c.tex)) continue;   // same card
      open(c.tex); out.push(c); continue;
    }
    if (c.action !== 'resolve' || !c.tex) { out.push(c); continue; }

    const key = normLine(c.tex);
    if (!focus) {
      // An empty board: the first line IS the problem — unless it is only a
      // finished card coming round again.
      if (past.has(key) && list.length > 1) continue;
      open(c.tex); out.push({ action: 'pose', tex: c.tex }); continue;
    }
    if (key === normLine(focus.problemTex) || focus.lines.some(l => normLine(l) === key)) continue;
    if (past.has(key)) continue;
    // The tutor called it the problem, and it is not one we have seen.
    if (labelled.has(key)) { open(c.tex); out.push({ action: 'pose', tex: c.tex }); continue; }

    if (!focus.solved && answersProblem(c.tex, focus.problemTex)) {
      focus.lines.push(String(c.tex)); focus.solved = true;
      out.push(Object.assign({}, c, { action: 'verify' }));
      continue;
    }

    // Same work as the problem, or as any line already on the card?
    const opts = { strict: focus.solved };
    let verdict = sameWork(focus.problemTex, c.tex, opts);
    if (verdict !== true) {
      for (const l of focus.lines) {
        const v = sameWork(l, c.tex, opts);
        if (v === true) { verdict = true; break; }
      }
    }
    if (verdict === false) { open(c.tex); out.push({ action: 'pose', tex: c.tex }); continue; }
    focus.lines.push(String(c.tex));
    out.push(c);
  }
  return out;
}

// Which of a turn's raw math steps did the tutor label as the problem?
function givenTexes(mathSteps) {
  return (Array.isArray(mathSteps) ? mathSteps : [])
    .filter(st => st && st.latex && /^\s*(given|problem|new problem)\b/i.test(String(st.label || '')))
    .map(st => String(st.latex).trim());
}

module.exports = { cardVoiceLines, sameWork, givenTexes };
