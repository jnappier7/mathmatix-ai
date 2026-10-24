/**
 * Chapter Review drill: Algebra 1 Module 6 (inequalities). Same contract as the other review suites,
 * with every computed answer re-solved from the printed question: every solved inequality's key is
 * checked by evaluating the PRINTED inequality at numbers just inside and just outside the key's
 * boundary (so a wrong direction, a missed flip, or a wrong endpoint all fail), compound and absolute
 * value answers the same way, every two-variable answer by substituting points.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const M6 = require('../../utils/liveDrill/review/alg1Ch6');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<br>/g, ' ; ').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 1357 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const askOf = (p) => plain((p.card.match(/<p class="posed-ask[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
const nums = (s) => (plain(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const CMP = { '<': (a, b) => a < b, '≤': (a, b) => a <= b, '>': (a, b) => a > b, '≥': (a, b) => a >= b };
/** Evaluate a one-variable expression (with |…|, distribution, the variable v) at x. */
function ev(expr, x, v) {
  let t = plain(expr).replace(/\s/g, '').replace(new RegExp(v, 'g'), `(${x})`);
  t = t.replace(/\|([^|]*)\|/g, 'Math.abs($1)').replace(/(\d)\(/g, '$1*(').replace(/\)\(/g, ')*(');
  if (!/^[\d\s+\-*/().Mathabs,]+$/.test(t)) throw new Error('unexpected token in ' + t);
  return Function(`"use strict"; return (${t});`)();
}
/** Does the printed inequality (one or two symbols, one variable) hold at x? */
function holds(ineq, x) {
  if (/ or /.test(ineq)) return plain(ineq).split(' or ').some((part) => holds(part, x));
  const v = (plain(ineq).match(/[a-z]/g) || []).find((c) => c !== 'M'); const parts = plain(ineq).split(/ ([<>≤≥]) /);
  for (let i = 1; i < parts.length; i += 2) if (!CMP[parts[i]](ev(parts[i - 1], x, v), ev(parts[i + 1], x, v))) return false;
  return true;
}
/** Parse a solution like "x > 3", "-2 < x ≤ 5", "x < -2 or x ≥ 4" into a predicate. */
function solPred(s) {
  const t = plain(s); if (/ or /.test(t)) { const [a, b] = t.split(' or ').map(solPred); return (x) => a(x) || b(x); }
  const parts = t.split(/ ([<>≤≥]) /); const v = (t.match(/[a-z]/g) || [])[0];
  return (x) => { for (let i = 1; i < parts.length; i += 2) { const L = parts[i - 1] === v ? x : +parts[i - 1]; const R = parts[i + 1] === v ? x : +parts[i + 1]; if (!CMP[parts[i]](L, R)) return false; } return true; };
}
/** The key's predicate must agree with the printed inequality at every half-integer in [-30, 30]. */
function agree(ineq, key) { const pred = solPred(key); for (let x = -30; x <= 30; x += 0.5) expect(pred(x)).toBe(holds(ineq, x)); }

describe('alg1m6: every play is well formed', () => {
  test.each(Object.keys(M6.TEMPLATES))('%s', (id) => {
    for (const p of deal(M6, id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/); for (const c of p.choices) expect(c.html).not.toMatch(/[<>](?!\/?(b|i|sup|span)[ >])/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill, on the algebra hub between Module 5 and Module 7, reachable from Whole Module', () => {
    expect(DRILLS.alg1m6.native).toBe(M6); expect(DRILLS.alg1m6.scoring).toBeUndefined();
    const order = solo.HUBS.algebra.games.map((g) => g.drill); expect(order.indexOf('alg1m6')).toBe(order.indexOf('alg1m5') + 1); expect(order.indexOf('alg1m7')).toBe(order.indexOf('alg1m6') + 1);
    const seen = new Set(); for (let n = 1; n <= 700; n++) seen.add(dealPlay('alg1m6', 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(M6.TEMPLATES).sort());
    for (const book of Object.keys(M6.BOOKS)) expect(dealPlay('alg1m6', book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay('alg1m6', 'all', 'x', 7, [])).toEqual(dealPlay('alg1m6', 'all', 'x', 7, []));
  });
});

describe('Algebra Module 6 — re-solved from the question text', () => {
  test('read and graph: circle and direction follow the symbol', () => {
    for (const p of deal(M6, 'graphIt')) { const t = promptOf(p); const k = keyText(p); const pred = solPred(/^[a-z]/.test(t) ? t : t.split(' ').reverse().join(' ').replace(/[<>≤≥]/, (s) => ({ '<': '>', '>': '<', '≤': '≥', '≥': '≤' }[s]))); const [n] = nums(k); expect(k).toMatch(pred(n) ? /^CLOSED/ : /^OPEN/); expect(k.endsWith('LEFT')).toBe(pred(n - 1)); }
    for (const p of deal(M6, 'fromGraph')) { const t = promptOf(p); const [n] = nums(t); const pred = solPred(keyText(p)); expect(pred(n)).toBe(/^CLOSED/.test(t)); expect(pred(n - 1)).toBe(/LEFT/.test(t)); expect(pred(n + 1)).toBe(/RIGHT/.test(t)); }
    for (const p of deal(M6, 'setBuilder')) expect(keyText(p)).toBe(`{x | ${promptOf(p)}}`);
    for (const p of deal(M6, 'rexGraph')) { const h = askOf(p); const ineq = h.match(/graphed (x [<>] -?\d+) with/)[1]; const [n] = nums(ineq); const closed = /CLOSED/.test(h); const right = /RIGHT/.test(h); const pred = solPred(ineq); const circleWrong = closed; const sideWrong = pred(n + 1) !== right; const k = keyText(p); expect(k.startsWith('two mistakes')).toBe(circleWrong && sideWrong); if (circleWrong && !sideWrong) expect(k).toMatch(/must be OPEN$/); if (!circleWrong && sideWrong) expect(k).toMatch(/^"(less|greater) than" shades/); }
  });
  test('one- and multi-step: the key agrees with the printed inequality at every half-integer in [−30, 30]', () => {
    for (const id of ['oneStep', 'multiStep']) for (const p of deal(M6, id)) agree(promptOf(p), keyText(p));
    for (const p of deal(M6, 'banner')) { const [w, maxP] = nums(promptOf(p)); if (p.input === 'number') { const l = Number(p.answer); expect(2 * l + 2 * w).toBeLessThanOrEqual(maxP); expect(2 * (l + 1) + 2 * w).toBeGreaterThan(maxP); } else expect(keyText(p)).toBe(`2l + ${2 * w} ≤ ${maxP}`); }
    for (const p of deal(M6, 'amplifier')) { const [saved, per, goal] = nums(promptOf(p)); if (p.input === 'number') { const w = Number(p.answer); expect(per * w + saved).toBeGreaterThanOrEqual(goal); expect(per * (w - 1) + saved).toBeLessThan(goal); } else expect(keyText(p)).toBe(`${per}w + ${saved} ≥ ${goal}`); }
    for (const p of deal(M6, 'printing')) { const [flat, per, budget] = nums(promptOf(p)); const c = Number(p.answer); expect(flat + per * c).toBeLessThanOrEqual(budget); expect(flat + per * (c + 1)).toBeGreaterThan(budget); }
    for (const p of deal(M6, 'wordsToIneq')) { const w = promptOf(p); const k = keyText(p); expect(k).toMatch(/no more than/.test(w) ? /≤/ : /at least/.test(w) ? /≥/ : /less than \d+\.$/.test(w) ? /</ : />/); }
  });
  test('compound and absolute value: the key agrees with the printed inequality everywhere', () => {
    for (const id of ['andIneq', 'orIneq', 'absIneq', 'absCoef']) for (const p of deal(M6, id)) {
      const t = promptOf(p); const k = keyText(p);
      if (/^no solution/.test(k)) { for (let x = -30; x <= 30; x += 0.5) expect(holds(t, x)).toBe(false); continue; }
      if (/^all real/.test(k)) { for (let x = -30; x <= 30; x += 0.5) expect(holds(t, x)).toBe(true); continue; }
      agree(t, k);
    }
    for (const p of deal(M6, 'proofingBox')) { const [lo, hi] = nums(promptOf(p)); const incl = /inclusive/.test(promptOf(p)); const pred = solPred(keyText(p)); expect(pred(lo)).toBe(incl); expect(pred(hi)).toBe(incl); expect(pred((lo + hi) / 2)).toBe(true); expect(pred(lo - 1)).toBe(false); expect(pred(hi + 1)).toBe(false); }
  });
  test('two variables: boundary, shading, and point tests', () => {
    for (const p of deal(M6, 'boundaryShade')) { const t = promptOf(p); const s = t.match(/[<>≤≥]/)[0]; const k = keyText(p); expect(k.startsWith(/[<>]/.test(s) ? 'dashed' : 'solid')).toBe(true); expect(k.endsWith(/[>≥]/.test(s) ? 'above' : 'below')).toBe(true); expect(k).toContain(`line y = ${t.split(/ [<>≤≥] /)[1]}`); }
    for (const p of deal(M6, 'isSolution')) { const [x, y] = nums(askOf(p)); const t = promptOf(p); const s = t.match(/[<>≤≥]/)[0]; const rhs = ev(t.split(/ [<>≤≥] /)[1], x, 'x'); expect(keyText(p).startsWith('Yes')).toBe(CMP[s](y, rhs)); }
    for (const p of deal(M6, 'standardToSlopeIneq')) {
      const t = promptOf(p); const k = keyText(p); const s0 = t.match(/[<>≤≥]/)[0]; const [L, R] = t.split(/ [<>≤≥] /); const s1 = k.match(/[<>≤≥]/)[0]; const rhs = k.split(/ [<>≤≥] /)[1];
      for (const x of [-3, 0, 2]) for (const y of [-7, -1, 0, 4, 9]) { const lhs = Function('x', 'y', `"use strict"; return (${L.replace(/\s/g, '').replace(/(\d)([xy])/g, '$1*$2').replace(/^-([xy])/, '-1*$1').replace(/([+-])([xy])/g, '$1' + '1*$2')});`)(x, y); expect(CMP[s1](y, ev(rhs, x, 'x'))).toBe(CMP[s0](lhs, +R)); }
    }
  });
  test('cumulative review', () => {
    for (const p of deal(M6, 'lineReview')) { const [m, b] = nums(promptOf(p)); const k = keyText(p); const mm = k.match(/^y = (-?\d*)x/)[1]; expect(mm === '' ? 1 : mm === '-' ? -1 : +mm).toBe(m); expect(ev(k.replace(/^y = /, ''), 0, 'x')).toBe(b); }
    for (const p of deal(M6, 'slopeReview')) { const [x1, y1, x2, y2] = nums(promptOf(p)); expect(Number(p.answer) * (x2 - x1)).toBe(y2 - y1); }
    for (const p of deal(M6, 'evalF')) { const [a, b, x] = nums(askOf(p)); expect(Number(p.answer)).toBe(a * x - b); }
  });
});
