/**
 * Live Two-Minute Drill — the Math Facts bank (fluency mode).
 *
 * Unlike Algebra and Geometry, whose item banks are read out of the published course pages
 * (engine.js), this one lives here: the course site has no facts drill, and a facts bank is small
 * enough to own. It produces plays in the same normalized shape engine.normalize does, with two
 * differences the rest of the game keys on:
 *
 *   - `input: 'number'` and no choices: the student TYPES the answer. Fluency is recall, and
 *     four choices turn recall into recognition (and 7 × 8 into "which of these ends in 6").
 *   - `fact`: which fact this is ({ id, fam, a, b, label }), so games.js can track every student's
 *     accuracy and speed fact by fact. `fam` groups a fact with its inverse — 56 ÷ 7 lands in the
 *     7 × 8 cell of the × / ÷ grid, 13 − 8 in the 8 + 5 cell of the + / − grid — because a fact
 *     family is what a student actually knows or doesn't.
 *
 * Every draw comes from the `rand` it is handed (engine.js passes the game's seeded generator), so
 * play n of a game is still a pure function of (seed, n).
 */

const BOOKS = {
  all: { name: 'Mixed', ch: '+−×÷', blurb: 'All four operations, shuffled.' },
  add: { name: 'Addition', ch: '+', blurb: 'Sums to 20.' },
  sub: { name: 'Subtraction', ch: '−', blurb: 'Differences from 20.' },
  mul: { name: 'Multiplication', ch: '×', blurb: 'Facts to 12 × 12.' },
  div: { name: 'Division', ch: '÷', blurb: 'Quotients to 12.' },
  int: { name: 'Integers', ch: '±', blurb: 'Signed +, −, × to ±12.' },
  sq: { name: 'Squares & roots', ch: 'x²', blurb: 'Squares to 20², roots to √225.' },
};
const MIXED = ['add', 'sub', 'mul', 'div'];

// The facts students actually miss get dealt more: 6–9 and 12 are the hard rows, 0, 1 and 10
// are near-free. Weights, not exclusions — an easy fact now and then keeps the pace honest.
const MUL_W = { 0: 0.3, 1: 0.3, 2: 0.8, 3: 1, 4: 1, 5: 0.8, 6: 1.5, 7: 1.6, 8: 1.6, 9: 1.4, 10: 0.5, 11: 0.8, 12: 1.3 };
const ADD_W = { 0: 0.3, 1: 0.5, 2: 0.8, 3: 1, 4: 1, 5: 1, 6: 1.3, 7: 1.5, 8: 1.5, 9: 1.5, 10: 0.6 };

const M = '−'; // display minus
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const par = (n) => (n < 0 ? `(${num(n)})` : String(n));

function weighted(rand, weights) {
  const keys = Object.keys(weights).map(Number);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = rand() * total;
  for (const k of keys) { x -= weights[k]; if (x < 0) return k; }
  return keys[keys.length - 1];
}
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---------------------------------------------------------------- strategies (the "tell")

/** The derived-fact strategy for a × b, anchored on the friendliest factor in it. */
function mulTell(a, b) {
  const order = [0, 1, 10, 2, 5, 9, 4, 11, 3, 12, 6, 8, 7];
  const f = order.find((x) => x === a || x === b);
  const n = f === a ? b : a;
  const p = a * b;
  switch (f) {
    case 0: return 'Anything times 0 is 0.';
    case 1: return `Times 1 keeps the number: ${n}.`;
    case 10: return `Times 10: put a zero on ${n} → ${p}.`;
    case 2: return `Double it: ${n} + ${n} = ${p}.`;
    case 5: return `Half of 10 × ${n}: half of ${10 * n} is ${p}.`;
    case 9: return `10 × ${n} = ${10 * n}, minus one ${n} → ${p}.`;
    case 4: return `Double, then double again: ${n} → ${2 * n} → ${p}.`;
    case 11: return `10 × ${n} = ${10 * n}, plus one ${n} → ${p}.`;
    case 3: return `Double it, add one more: ${2 * n} + ${n} = ${p}.`;
    case 12: return `10 × ${n} = ${10 * n}, plus 2 × ${n} = ${2 * n} → ${p}.`;
    case 6: return `5 × ${n} = ${5 * n}, plus one more ${n} → ${p}.`;
    case 8: return `Double three times: ${n} → ${2 * n} → ${4 * n} → ${p}.`;
    default: return `5 × ${n} = ${5 * n}, plus 2 × ${n} = ${2 * n} → ${p}.`; // 7
  }
}

function addTell(a, b) {
  const s = a + b;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  if (small === 0) return 'Adding 0 changes nothing.';
  if (a === b) return `A double: ${a} + ${a} = ${s}.`;
  if (big - small === 1) return `Near double: ${small} + ${small} = ${2 * small}, one more → ${s}.`;
  if (s > 10 && big >= 7) return `Make ten: ${big} + ${10 - big} = 10, then ${small - (10 - big)} more → ${s}.`;
  return `Start at ${big} and count on ${small} → ${s}.`;
}

function subTell(c, a, b) {
  if (c > 10 && a < 10) return `Count up: ${a} to 10 is ${10 - a}, 10 to ${c} is ${c - 10} → ${b}.`;
  return `Think addition: ${a} + ? = ${c} → ${b}.`;
}

const divTell = (p, a, b) => `Think multiplication: ${a} × ? = ${p} → ${b}.`;

function intTell(op, a, b) {
  if (op === '×') {
    return (a < 0) === (b < 0) ? `Signs alike → positive: ${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)}.`
      : `Signs different → negative: ${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)}, so ${num(a * b)}.`;
  }
  if (op === M) return `Subtracting is adding the opposite: ${par(a)} + ${par(-b)} = ${num(a - b)}.`;
  return (a < 0) === (b < 0) ? `Same signs: add the sizes and keep the sign → ${num(a + b)}.`
    : `Different signs: subtract the sizes, keep the sign of the bigger one → ${num(a + b)}.`;
}

// ---------------------------------------------------------------- one fact per playbook

/**
 * The teacher's focus (e.g. [2, 5, 10]): every +, −, ×, ÷ fact has one of these numbers in it — an
 * addend, the number subtracted, a factor, the divisor — and the other number is anything in range.
 * A focus with nothing in an operation's range (11s and 12s for addition) leaves that one unfocused.
 */
function anchor(rand, weights, focus) {
  const pool = (focus || []).filter((n) => n in weights);
  return pool.length ? pool[Math.floor(rand() * pool.length)] : weighted(rand, weights);
}
/** One focused number, one free one, in either order. */
function pair(rand, weights, focus) {
  const x = anchor(rand, weights, focus);
  const y = weighted(rand, weights);
  return rand() < 0.5 ? [x, y] : [y, x];
}

function addFact(rand, focus) {
  const [a, b] = pair(rand, ADD_W, focus);
  return { pb: 'add', fam: 'add', a, b, q: `${a} + ${b}`, ans: a + b, tell: addTell(a, b) };
}
function subFact(rand, focus) {
  const a = anchor(rand, ADD_W, focus); const b = weighted(rand, ADD_W); const c = a + b;
  return { pb: 'sub', fam: 'add', a, b, q: `${c} ${M} ${a}`, ans: b, tell: subTell(c, a, b) };
}
function mulFact(rand, focus) {
  const [a, b] = pair(rand, MUL_W, focus);
  return { pb: 'mul', fam: 'mul', a, b, q: `${a} × ${b}`, ans: a * b, tell: mulTell(a, b) };
}
function divFact(rand, focus) {
  const f = (focus || []).filter((n) => n !== 0);
  let a = anchor(rand, MUL_W, f.length ? f : null);
  if (a === 0) a = int(rand, 2, 12); // no ÷ 0
  const b = weighted(rand, MUL_W); const p = a * b;
  return { pb: 'div', fam: 'mul', a, b, q: `${p} ÷ ${a}`, ans: b, tell: divTell(p, a, b) };
}
function intFact(rand) {
  const op = ['+', M, '×'][int(rand, 0, 2)];
  const sign = () => (rand() < 0.55 ? -1 : 1);
  let a = sign() * int(rand, 1, 12); let b = sign() * int(rand, 1, 12);
  if (a > 0 && b > 0) { if (rand() < 0.5) a = -a; else b = -b; } // always at least one negative
  const ans = op === '+' ? a + b : op === M ? a - b : a * b;
  return { pb: 'int', fam: null, a, b, q: `${par(a)} ${op} ${par(b)}`, ans, tell: intTell(op, a, b), op };
}
function sqFact(rand) {
  if (rand() < 0.6) {
    const n = int(rand, 1, 20);
    return { pb: 'sq', fam: null, a: n, b: 2, q: `${n}²`, ans: n * n, tell: `${n}² = ${n} × ${n} = ${n * n}.`, op: 'sq' };
  }
  const n = int(rand, 1, 15);
  return { pb: 'sq', fam: null, a: n * n, b: 0, q: `√${n * n}`, ans: n, tell: `What times itself is ${n * n}? ${n} × ${n} = ${n * n}, so ${n}.`, op: 'rt' };
}
const MAKERS = { add: addFact, sub: subFact, mul: mulFact, div: divFact, int: intFact, sq: sqFact };

function idOf(f) {
  const op = f.op === 'sq' || f.op === 'rt' ? f.op : f.op ? { '+': 'iadd', [M]: 'isub', '×': 'imul' }[f.op] : f.pb;
  return `${op}:${f.a},${f.b}`;
}

function cardFor(q, shown) {
  const blank = shown == null ? '<span class="blank">?</span>' : `<span class="blank ok">${shown}</span>`;
  return `<div class="card-body"><div class="fact">${q} = ${blank}</div></div>`;
}

/**
 * Deal one fact. `recentIds` are the last few plays' ids; a fact the class just saw is redrawn
 * (a few tries — a tiny playbook like Squares can't always avoid a repeat, and that's fine).
 */
function makePlay(book, recentIds, rand, opts) {
  const key = BOOKS[book] ? book : 'all';
  const focus = normalizeFocus(opts && opts.focus);
  let f;
  for (let i = 0; i < 12; i++) {
    const pb = key === 'all' ? MIXED[Math.floor(rand() * MIXED.length)] : key;
    f = MAKERS[pb](rand, focus);
    if (!(recentIds || []).includes(idOf(f))) break;
  }
  const ans = num(f.ans);
  return {
    id: idOf(f),
    playbook: f.pb,
    playbookName: BOOKS[f.pb].name,
    head: 'Type the answer.',
    card: cardFor(f.q, null),
    choices: [],
    input: 'number',
    answer: String(f.ans),
    answerHtml: ans,
    tell: `<b>${f.q} = ${ans}</b> &mdash; ${f.tell}`,
    revealCard: cardFor(f.q, ans),
    summary: `${f.q} = ${ans}`,
    fact: { id: idOf(f), fam: f.fam, a: f.a, b: f.b, label: f.q },
  };
}

/** Which playbooks a focus applies to (Integers and Squares have their own ranges). */
const FOCUSABLE = ['all', 'add', 'sub', 'mul', 'div'];
const FOCUS_MAX = 12;

/** A focus as the game keeps it: distinct whole numbers 0–12, sorted; null for "all of them". */
function normalizeFocus(raw) {
  if (!Array.isArray(raw)) return null;
  const set = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= FOCUS_MAX))].sort((a, b) => a - b);
  return set.length && set.length <= FOCUS_MAX ? set : null;
}

/** "2s, 5s & 10s" — how the lobby and the scoreboard name a focus. */
function focusLabel(focus) {
  if (!focus) return '';
  const names = focus.map((n) => `${n}s`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * A typed answer as the grader compares it: digits with an optional leading minus (the display
 * minus "−" counts too), no leading zeros. Anything else is null — not a wrong answer, an unread one.
 */
function normalizeTyped(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (!/^-?\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return String(Object.is(n, -0) ? 0 : n);
}

module.exports = { BOOKS, FOCUSABLE, FOCUS_MAX, makePlay, normalizeTyped, normalizeFocus, focusLabel, _mulTell: mulTell };
