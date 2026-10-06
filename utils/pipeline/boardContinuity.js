/**
 * boardContinuity.js — one problem, one card.
 *
 * Production, 2026-10-05: a student solved 5(x+2) − 3x = 26 ⇒ x = 8 while the
 * tutor restarted the problem several times, and the work dock sealed it as
 * FIVE cards, three of them titled with a line of the student's own working
 * (2x = 16, 2x + 10 = 26, 5x + 10 − 3x = 26). The persisted ledger showed the
 * chain exactly:
 *
 *   1. the model sent `verify` with tex "2x + 10 = 26" — not an answer, the
 *      variable is not isolated — which marked the card solved and dropped the
 *      pin (lastBoardAction 'verify' = cycle closed);
 *   2. with no pin, the synthesizer's empty-board branch posed the next single
 *      equation anyone wrote ("2x = 16"), and a pose of different tex archives
 *      the card in focus — so every restated step sealed a card and opened one.
 *
 * The decision this module encodes: a restated line of the problem in focus
 * CONTINUES that card. It never seals it and never moves the pin. "Restated"
 * is decided by the math, not the wording: two equations in one variable are
 * the same line of work when their residuals (left − right) are proportional —
 * exactly the moves a derivation makes (expanding, combining, adding to or
 * scaling both sides).
 *
 * For linear equations that test cannot tell a step from a DIFFERENT problem
 * with the same answer (every single-root linear equation in x with root 8 is
 * proportional to x − 8). So it is tightened once the card is solved: then
 * only an identical residual (up to sign: 2x = 16 ≡ 16 = 2x ≡ 2x + 10 = 26) or
 * a line already on the card counts, and a new problem that merely shares the
 * answer gets its own card. While the card is still open, a different problem
 * with the same answer posed mid-solve is not a realistic move; a restart is.
 *
 * Pure: no Mongo, no clock. Numeric sampling via checkWorkSteps.parseLine.
 */
'use strict';

const { parseLine } = require('./checkWorkSteps');

const SAMPLE_POINTS = [-3.7, -1.3, 0.6, 1.9, 2.8, 4.1, 6.3];
const REL_TOL = 1e-6;

function close(a, b) {
  return Math.abs(a - b) <= REL_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

// A one-variable EQUATION, or null. Anything else (an expression, a system, a
// blank, prose) is not something this module reasons about.
function oneVarEquation(tex) {
  const line = parseLine(String(tex == null ? '' : tex));
  if (!line || line.kind !== 'equation' || line.vars.size !== 1) return null;
  return { line, v: [...line.vars][0] };
}

function residualAt(eq, x) {
  try {
    const y = eq.line.f({ [eq.v]: x });
    const n = typeof y === 'number' ? y : Number(y);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

/**
 * The constant k with residual(b) = k · residual(a), when there is one — i.e.
 * b is a / restated by a derivation's moves. Null when either side is not a
 * one-variable equation, the variables differ, or the ratio is not constant.
 */
function residualRatio(aTex, bTex) {
  const a = oneVarEquation(aTex);
  const b = oneVarEquation(bTex);
  if (!a || !b || a.v !== b.v) return null;
  let ratio = null;
  let checked = 0;
  for (const p of SAMPLE_POINTS) {
    const ya = residualAt(a, p);
    const yb = residualAt(b, p);
    if (ya === null || yb === null) continue;
    const za = Math.abs(ya) < 1e-9;
    const zb = Math.abs(yb) < 1e-9;
    if (za && zb) continue;           // a shared root sampled exactly
    if (za || zb) return null;
    const r = yb / ya;
    if (ratio === null) ratio = r;
    else if (!close(r, ratio)) return null;
    checked++;
  }
  return checked >= 3 ? ratio : null;
}

// Light textual identity — whitespace, \left/\right and unicode minus folded.
function normLine(tex) {
  return String(tex == null ? '' : tex)
    .replace(/\\left|\\right/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * A verify card CLOSES the problem: it marks the card solved, drops the pin,
 * and lets the next single equation anyone writes be posed as a new problem.
 * So its tex has to state an answer. A one-variable equation with no side that
 * is the bare variable — "2x + 10 = 26", "x^2 = 9" — is a line of work, not an
 * answer. Identities ("x^2 - 1 = (x - 1)(x + 1)", a factoring check) and
 * arithmetic substitution checks ("2(8) + 10 = 26") are left alone.
 */
function isUnsolvedEquation(tex) {
  const eq = oneVarEquation(tex);
  if (!eq) return false;
  const sides = eq.line.text.split('=').map(s => s.trim());
  if (sides.some(s => /^[a-z]$/i.test(s))) return false;      // "x = 8", "8 = x"
  let nonZero = false;
  for (const p of SAMPLE_POINTS) {
    const y = residualAt(eq, p);
    if (y !== null && Math.abs(y) > 1e-9) { nonZero = true; break; }
  }
  return nonZero;                                              // identity → leave it
}

/**
 * Demote a verify whose tex is still an unsolved equation to the resolve it
 * really is (dropped outright when the batch already carries that line). Pure;
 * returns { commands, demoted }.
 */
function demoteNonAnswerVerifies(commands) {
  const list = Array.isArray(commands) ? commands : [];
  const out = [];
  const demoted = [];
  for (const c of list) {
    if (!c || c.action !== 'verify' || !isUnsolvedEquation(c.tex)) { out.push(c); continue; }
    demoted.push(c);
    const dup = list.some(o => o && o.action === 'resolve' && normLine(o.tex) === normLine(c.tex));
    if (!dup) out.push({ action: 'resolve', tex: c.tex });
  }
  return { commands: out, demoted };
}

// The problem in focus is ledger.current: it survives a verify (the pin does
// not), which is exactly when a restart used to open a second card.
function isRestatement(tex, focus) {
  if (!focus || !tex) return false;
  const key = normLine(tex);
  if (focus.lines.some(l => normLine(l) === key)) return true;
  const k = residualRatio(focus.problemTex, tex);
  if (k === null) return false;
  return focus.solved ? close(Math.abs(k), 1) : true;
}

/**
 * Fold poses that restate the problem in focus back into its card. Each such
 * pose (and the `clear` paired in front of it) is removed; if the pin has been
 * dropped — the card was closed by a verify — the pose is re-anchored to the
 * focus problem's own tex instead, so the pin comes back and the ledger and the
 * client both read it as the same problem (same tex = no archive).
 *
 * An explicit start-over from the student ("start over", "new problem") is
 * honoured — the caller passes startOver and nothing is folded.
 *
 * @param {Array}  commands
 * @param {object} opts
 * @param {object|null} opts.ledger   conversation.boardLedger BEFORE this turn
 * @param {string|null} opts.pinTex   conversation.boardProblem.tex
 * @param {boolean}     opts.startOver
 * @returns {{ commands: Array, folded: Array }}
 */
function foldRestatedPoses(commands, { ledger = null, pinTex = null, startOver = false } = {}) {
  const list = Array.isArray(commands) ? commands : [];
  const cur = ledger && ledger.current && ledger.current.problemTex ? ledger.current : null;
  if (!cur || startOver || !list.some(c => c && c.action === 'pose')) return { commands: list, folded: [] };

  const steps = Array.isArray(cur.steps) ? cur.steps : [];
  const focus = {
    problemTex: cur.problemTex,
    solved: steps.some(s => s && s.action === 'verify'),
    lines: [cur.problemTex].concat(
      steps.filter(s => s && (s.action === 'resolve' || s.action === 'verify') && s.tex).map(s => s.tex)
    ),
  };
  const pinned = !!pinTex && normLine(pinTex) === normLine(cur.problemTex);

  const kept = [];
  const folded = [];
  for (const c of list) {
    if (!c || c.action !== 'pose' || !isRestatement(c.tex, focus)) { kept.push(c); continue; }
    folded.push(c);
    const prev = kept[kept.length - 1];
    if (prev && prev.action === 'clear') folded.push(kept.pop());
    if (!pinned) kept.push({ action: 'pose', tex: cur.problemTex });
  }
  return { commands: kept, folded };
}

// Is a scaffold's lone blank standing in for a number the problem already
// GIVES? "5(x) + 5(2) − 3x = \boxed{}" under 5(x+2) − 3x = 26: the only value
// that makes the line true is 26, the problem's own right side — distributing
// never touches it. The student types 26, and the tutor then talks about "the
// 26 you got for the blank step" (production 2026-10-05). A blank must stand
// for something the student works out. Narrow by design: exactly one "=", one
// side wholly a single blank, the problem a one-variable equation with a bare
// number on a side; anything else abstains.
function scaffoldBlankIsGiven(scaffoldTex, problemTex, isWholeBlank) {
  if (!scaffoldTex || !problemTex || typeof isWholeBlank !== 'function') return false;
  const parts = String(scaffoldTex).split('=');
  if (parts.length !== 2) return false;
  const [l, r] = parts.map(s => s.trim());
  const lb = isWholeBlank(l);
  const rb = isWholeBlank(r);
  if (lb === rb) return false;
  const shown = lb ? r : l;
  if (/\\boxed|\\square|_{3,}|(?:\\_){3,}/.test(shown)) return false;
  const pSides = String(problemTex).split('=').map(s => s.trim());
  if (pSides.length !== 2) return false;
  const givens = pSides.filter(s => /^-?\d+(?:\.\d+)?$/.test(s.replace(/\s+/g, '')));
  return givens.some(g => residualRatio(problemTex, lb ? `${g} = ${shown}` : `${shown} = ${g}`) !== null);
}

module.exports = {
  residualRatio,
  isUnsolvedEquation,
  demoteNonAnswerVerifies,
  foldRestatedPoses,
  scaffoldBlankIsGiven,
  _isRestatement: isRestatement,
  _normLine: normLine,
};
