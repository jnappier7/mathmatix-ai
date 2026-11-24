'use strict';
/* ============================================================
   tileMatState.js — what the student has done with the tiles,
   in a form the tutor can read.

   The tile mat (public/js/living-workspace/dom/tileMatElement.js) lets a
   student drag, flip, add and cancel tiles. Until this existed the tutor
   knew only that the tiles were out: it could not tell a student who had
   just cancelled three zero pairs from one who had not touched the mat.

   The browser reports two things after each settled change — how many of
   each tile sit on each side, and the kind of move that got there — and
   NOTHING else. Every word the tutor reads is written HERE from those
   counts: the line the mat now shows, whether that is still the line it
   started as, and a short account of the moves. So a student (or anyone
   driving their session) cannot put text into the tutor's prompt through
   the mat, and the mat cannot claim an equation it does not show.

   It is the student's own work, reported as theirs. It is never graded,
   earns nothing, and is not an answer the tutor may repeat back as given:
   the board block says what it is — something the student did with their
   hands — and the tutor reacts to it like a tutor watching.

   Pure. No Mongo. routes/studentMoves.js loads and saves the conversation.
   ============================================================ */

const KINDS = ['x2', 'x', 'unit'];
// The mat itself refuses a 41st tile on a side (tileMatElement.MAX_PER_SIDE).
const MAX_PER_SIDE = 40;
// The tutor is told the recent story, not a transcript of an afternoon.
const MAX_MOVES = 12;

// Every move the mat can make. Anything else in a report is dropped.
const MOVE_TYPES = new Set(['add_both', 'add_one', 'zero_pair', 'zero_pairs', 'flip', 'move', 'remove', 'reset']);

function normTex(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
}

function isCount(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_PER_SIDE;
}

/**
 * The sides of a report, or null. `expected` is how many sides the mat was
 * laid out with — an expression cannot grow an equals sign.
 */
function cleanSides(sides, expected) {
  if (!Array.isArray(sides) || sides.length !== expected) return null;
  const out = [];
  for (const s of sides) {
    if (!s || typeof s !== 'object') return null;
    const side = {};
    let total = 0;
    for (const k of KINDS) {
      const pair = s[k];
      if (!Array.isArray(pair) || pair.length !== 2 || !isCount(pair[0]) || !isCount(pair[1])) return null;
      side[k] = [pair[0], pair[1]];
      total += pair[0] + pair[1];
    }
    if (total > MAX_PER_SIDE) return null;
    out.push(side);
  }
  return out;
}

function cleanMoves(moves) {
  if (!Array.isArray(moves)) return [];
  const out = [];
  for (const m of moves.slice(-MAX_MOVES)) {
    if (!m || typeof m !== 'object' || !MOVE_TYPES.has(m.t)) continue;
    const move = { t: m.t };
    if (KINDS.includes(m.k)) move.k = m.k;
    if (m.s === 1 || m.s === -1) move.s = m.s;
    out.push(move);
  }
  return out;
}

/** One side as the mat shows it — positives then negatives, nothing netted out. */
function sideTex(side, variable) {
  const names = { x2: `${variable}^2`, x: variable, unit: '' };
  const parts = [];
  for (const k of KINDS) {
    side[k].forEach((n, neg) => {
      if (!n) return;
      const body = names[k] ? (n === 1 ? '' : String(n)) + names[k] : String(n);
      parts.push({ neg: !!neg, body });
    });
  }
  if (!parts.length) return '0';
  return parts.map((p, i) => (i === 0 ? (p.neg ? '-' : '') + p.body : (p.neg ? ' - ' : ' + ') + p.body)).join('');
}

/** The line a set of sides shows, e.g. "2x + 3 - 3 = 7 - 3". */
function matTex(sides, variable = 'x') {
  return sides.map(s => sideTex(s, variable)).join(' = ');
}

function net(side) {
  return KINDS.map(k => side[k][0] - side[k][1]);
}

/**
 * Is `now` still the line `start` was? An expression: the same polynomial.
 * An equation: the same solutions — (left − right) a non-zero multiple of
 * where it began. The same rule as the mat's own status line
 * (tileMatElement.sameAsStart); tests/unit/workspace/tileMatState.test.js
 * runs both over the same mats.
 */
function sameLine(start, now) {
  if (!Array.isArray(start) || !Array.isArray(now) || start.length !== now.length) return false;
  if (now.length === 1) {
    const a = net(now[0]); const b = net(start[0]);
    return a.every((v, i) => v === b[i]);
  }
  const diff = (s) => { const l = net(s[0]); const r = net(s[1]); return l.map((v, i) => v - r[i]); };
  const d = diff(now); const d0 = diff(start);
  const zero = v => v.every(n => n === 0);
  if (zero(d) || zero(d0)) return zero(d) && zero(d0);
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      if (d[i] * d0[j] !== d[j] * d0[i]) return false;
    }
  }
  return true;
}

function tileName(k, s, variable) {
  const body = k === 'x2' ? `${variable}²` : k === 'x' ? variable : '1';
  return `${s < 0 ? '−' : '+'}${body}`;
}

/**
 * The recent moves in words, repeats folded: "added a −1 tile to both sides
 * ×3, then cancelled zero pairs". Written from the move TYPES only.
 */
function describeMoves(moves, variable = 'x') {
  const phrases = cleanMoves(moves).map((m) => {
    const tile = m.k && m.s ? `a ${tileName(m.k, m.s, variable)} tile` : 'a tile';
    switch (m.t) {
      case 'add_both': return `added ${tile} to both sides`;
      case 'add_one': return `added ${tile} to ONE side only`;
      case 'zero_pair': return 'cancelled a zero pair';
      case 'zero_pairs': return 'cancelled every zero pair at once';
      case 'flip': return 'flipped a tile to its opposite';
      case 'move': return 'slid a tile across to the other side';
      case 'remove': return 'took a tile off the mat';
      case 'reset': return 'started the mat again';
      default: return null;
    }
  }).filter(Boolean);
  const folded = [];
  for (const p of phrases) {
    const last = folded[folded.length - 1];
    if (last && last.p === p) last.n += 1; else folded.push({ p, n: 1 });
  }
  return folded.map(f => (f.n > 1 ? `${f.p} ×${f.n}` : f.p)).join(', then ');
}

function findTilesStep(steps, start) {
  if (!Array.isArray(steps)) return null;
  const want = normTex(start);
  for (let i = steps.length - 1; i >= 0; i--) {
    const c = steps[i];
    if (c && c.action === 'tiles' && c.mat && Array.isArray(c.mat.sides) && normTex(c.mat.tex) === want) return c;
  }
  return null;
}

/**
 * Record what the student's mat now shows on the tiles card it belongs to.
 * Mutates `ledger` (the caller saves it). The card is found by the line it was
 * laid out for — in the problem in focus first, then the finished ones.
 *
 * @param {object|null} ledger  conversation.boardLedger
 * @param {{ start:string, sides:Array, moves?:Array }} report  from the browser
 * @param {Date} [now]
 * @returns {{ ok:true, now:object, inFocus:boolean } | { ok:false, reason:string }}
 */
function recordStudentMat(ledger, report, now = new Date()) {
  if (!ledger || typeof ledger !== 'object' || !report || typeof report.start !== 'string') {
    return { ok: false, reason: 'no_board' };
  }
  let step = findTilesStep(ledger.current && ledger.current.steps, report.start);
  const inFocus = !!step;
  if (!step) {
    const done = Array.isArray(ledger.completed) ? ledger.completed : [];
    for (let i = done.length - 1; i >= 0 && !step; i--) step = findTilesStep(done[i] && done[i].steps, report.start);
  }
  if (!step) return { ok: false, reason: 'no_tiles_card' };

  const sides = cleanSides(report.sides, step.mat.sides.length);
  if (!sides) return { ok: false, reason: 'bad_sides' };
  const start = cleanSides(step.mat.sides, step.mat.sides.length);
  if (!start) return { ok: false, reason: 'bad_card' };

  const variable = typeof step.mat.variable === 'string' && /^[a-z]$/i.test(step.mat.variable) ? step.mat.variable : 'x';
  const prior = step.mat.now && Array.isArray(step.mat.now.moves) ? step.mat.now.moves : [];
  const fresh = cleanMoves(report.moves);
  // A reset wipes the story as well as the mat.
  const lastReset = fresh.map(m => m.t).lastIndexOf('reset');
  const moves = (lastReset === -1 ? prior.concat(fresh) : fresh.slice(lastReset)).slice(-MAX_MOVES);

  step.mat.now = {
    sides,
    tex: matTex(sides, variable),
    same: sameLine(start, sides),
    moves,
    at: now.toISOString(),
  };
  return { ok: true, now: step.mat.now, inFocus };
}

/**
 * What the tutor is told about a tiles card — one line of the board block.
 * Untouched: just that the tiles are out. Touched: what the student did.
 */
function describeForTutor(mat) {
  const start = (mat && mat.tex) || '';
  const head = `ALGEBRA TILES the student can move, flip and cancel, laid out for: ${start}`;
  const now = mat && mat.now;
  if (!now || typeof now.tex !== 'string') {
    return `${head} — they have NOT touched the mat yet.`;
  }
  const variable = typeof mat.variable === 'string' ? mat.variable : 'x';
  const story = describeMoves(now.moves, variable);
  const verdict = now.same
    ? 'still the SAME equation/expression as the line it started from (their moves kept it balanced)'
    : 'NOT the same as the line it started from (a move changed its value — do not announce that it is wrong; ask what they did to each side and let them find it)';
  return `${head} — WITH THEIR OWN HANDS the student ${story ? `${story}, and ` : ''}the mat now shows: ${now.tex} — ${verdict}. `
    + 'You can see this mat. React to what they DID like a tutor watching over their shoulder: name the move, ask what it shows. '
    + 'It is their work on the tiles, not a typed answer — do not grade it, and do not write the next line for them.';
}

module.exports = {
  recordStudentMat, describeForTutor, describeMoves, matTex, sameLine, cleanSides, cleanMoves,
  MOVE_TYPES, MAX_MOVES, MAX_PER_SIDE,
};
