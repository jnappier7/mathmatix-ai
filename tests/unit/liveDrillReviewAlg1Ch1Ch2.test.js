/**
 * Chapter Review drills: Algebra 1 Modules 1 (expressions) and 2 (equations). Same contract as the
 * other review suites, with every computed answer re-solved from the printed question: every
 * evaluation recomputed by an independent evaluator, every simplified expression re-expanded from
 * the printed one, every solved equation's key substituted back into the printed equation, every
 * story's numbers recombined, every proportion cross-multiplied.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const M1 = require('../../utils/liveDrill/review/alg1Ch1');
const M2 = require('../../utils/liveDrill/review/alg1Ch2');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
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
/** "ax + b" (a may be implicit or missing, b may be missing) → [a, b] for the variable v */
function linOf(s, v = 'x') {
  const t = plain(s).replace(/\s/g, '').replace(/-/g, '+-').split('+').filter(Boolean); let a = 0; let b = 0;
  for (const term of t) { if (term.endsWith(v)) { const c = term.slice(0, -1); a += c === '' ? 1 : c === '-' ? -1 : +c; } else b += +term; }
  return [a, b];
}
/** Evaluate a printed arithmetic expression with ×, ÷, ², [ ], ( ) — an independent evaluator. */
function evalArith(s) {
  const t = plain(s).replace(/×|·/g, '*').replace(/÷/g, '/').replace(/\[/g, '(').replace(/\]/g, ')').replace(/(\d+)²/g, '($1*$1)').replace(/(\([^()]*\))²/g, '($1*$1)').replace(/(\d)\(/g, '$1*(').replace(/\)\(/g, ')*(').replace(/\)(\d)/g, ')*$1');
  if (!/^[\d\s+\-*/().]+$/.test(t)) throw new Error('unexpected token in ' + t);
  return Function(`"use strict"; return (${t});`)();
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

describe.each([['alg1m1', M1], ['alg1m2', M2]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill, on the algebra hub in module order, reachable from Whole Module', () => {
    expect(DRILLS[drill].native).toBe(bank); expect(DRILLS[drill].scoring).toBeUndefined();
    const order = solo.HUBS.algebra.games.map((g) => g.drill); expect(order).toContain(drill); expect(order.indexOf(drill)).toBeLessThan(order.indexOf('alg1m3'));
    const seen = new Set(); for (let n = 1; n <= 600; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Algebra Module 1 — re-solved from the question text', () => {
  test('numerical: the chosen expression evaluates to what the words say; order of operations re-evaluated', () => {
    for (const p of deal(M1, 'wordsToNumeric')) {
      const w = promptOf(p); const val = evalArith(keyText(p)); let m; let want;
      if ((m = w.match(/^(\d+) less than the difference of (\d+) and (\d+)$/))) want = (+m[2] - +m[3]) - +m[1];
      else if ((m = w.match(/^the product of (\d+) and the sum of (\d+) and (\d+)$/))) want = +m[1] * (+m[2] + +m[3]);
      else if ((m = w.match(/^the quotient of (\d+) and (\d+), increased by (\d+)$/))) want = +m[1] / +m[2] + +m[3];
      else if ((m = w.match(/^(\d+) more than the square of (\d+)$/))) want = +m[2] * +m[2] + +m[1];
      else { m = w.match(/^(\d+) decreased by the product of (\d+) and (\d+)$/); want = +m[1] - +m[2] * +m[3]; }
      expect(val).toBeCloseTo(want, 9);
    }
    for (const p of deal(M1, 'orderOps')) expect(Number(p.answer)).toBe(evalArith(promptOf(p)));
    for (const p of deal(M1, 'concession')) {
      const t = promptOf(p); const prices = {}; for (const m of t.matchAll(/(\w[\w ]*?) \$(\d+)/g)) prices[m[1].trim().replace(/^Prices: /, '')] = +m[2];
      const bought = t.split('bought ')[1].replace(/\.$/, '').split(/, and |, /); let total = 0;
      for (const b of bought) { const [, n, name] = b.match(/^(\d+) (.+)$/); const key = Object.keys(prices).find((k) => name.startsWith(k) || name.startsWith(k.replace(/y$/, 'ie')) || k.startsWith(name.replace(/s$/, '').replace(/es$/, ''))); total += +n * prices[key]; }
      expect(Number(p.answer)).toBe(total);
    }
  });
  test('algebraic: match, evaluate, earnings', () => {
    for (const p of deal(M1, 'matchVerbal')) {
      const w = promptOf(p); const k = keyText(p); const v = w.match(/(?:^|\s)([a-z])(?=[\s,]|$)/)[1]; const x = 7; let m; let want;
      const val = Function(v, `"use strict"; return (${k.replace(/(\d)([a-z])/g, '$1*$2').replace(/(\d)\(/g, '$1*(')});`)(x);
      if ((m = w.match(/^the product of (\d+) and [a-z], subtracted from (\d+)$/))) want = +m[2] - +m[1] * x;
      else if ((m = w.match(/^(\d+) times the difference of (\d+) and [a-z]$/))) want = +m[1] * (+m[2] - x);
      else if ((m = w.match(/^(\d+) less than the product of (\d+) and [a-z]$/))) want = +m[2] * x - +m[1];
      else if ((m = w.match(/^(\d+) decreased by the sum of (\d+) and [a-z]$/))) want = +m[1] - (+m[2] + x);
      else if ((m = w.match(/^the sum of (\d+) times [a-z] and (\d+)$/))) want = +m[1] * x + +m[2];
      else { m = w.match(/^(\d+) more than one-(\w+) of [a-z]$/); const den = ['', '', 'half', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'].indexOf(m[2]); want = x / den + +m[1]; }
      expect(val).toBeCloseTo(want, 9);
    }
    for (const p of deal(M1, 'evaluate')) { const [k, d, a, b, c] = nums(promptOf(p).replace(/2c/, '')); expect(Number(p.answer)).toBe((k * (a + b) ** 2) / d + 2 * c); }
    for (const p of deal(M1, 'earnings')) { const ns = nums(promptOf(p)); if (p.input === 'number') { const [p1, p2, n1, n2] = ns; expect(Number(p.answer)).toBe(p1 * n1 + p2 * n2); } else expect(keyText(p)).toBe(`${ns[0]}a + ${ns[1]}c`); }
  });
  test('properties, like terms, distributing, perimeter', () => {
    for (const p of deal(M1, 'property')) { const t = promptOf(p); const k = keyText(p); if (/^If .* then/.test(t)) expect(/Symmetric|Transitive/.test(k)).toBe(/and/.test(t) ? k === 'Transitive Property' : k === 'Symmetric Property'); else if (/· 1 =/.test(t)) expect(k).toBe('Multiplicative Identity'); else if (/\+ 0 =/.test(t)) expect(k).toBe('Additive Identity'); else if (/\(1\//.test(t)) expect(k).toBe('Multiplicative Inverse'); else if (/· 0 = 0/.test(t)) expect(k).toBe('Multiplicative Property of Zero'); }
    for (const p of deal(M1, 'combineLike')) { const t = promptOf(p); const v = t.match(/[a-z]/)[0]; expect(linOf(keyText(p), v)).toEqual(linOf(t, v)); }
    for (const p of deal(M1, 'distributeSimplify')) {
      const t = promptOf(p); const v = t.match(/[a-z]/)[0]; const m = t.match(/^(\d*)\(([^)]+)\) - (\d+)([a-z])$/) || t.match(/^(\d+)([a-z]) - (\d+)\(([^)]+)\)$/);
      let want; if (m && m[4] === v && !/[a-z]/.test(m[3])) { const [a, b] = linOf(m[2], v); want = [+m[1] * a - +m[3], +m[1] * b]; } else { const mm = t.match(/^(\d+)([a-z]) - (\d+)\(([^)]+)\)$/); const [a, b] = linOf(mm[4], v); want = [+mm[1] - +mm[3] * a, -mm[3] * b]; }
      expect(linOf(keyText(p), v)).toEqual(want);
    }
    for (const p of deal(M1, 'perimeter')) { const t = promptOf(p); const [a, b] = linOf(t.match(/length (.*)\.$/)[1], 'w'); if (p.input === 'number') { const [w] = nums(askOf(p)); expect(Number(p.answer)).toBe(2 * (a * w + b) + 2 * w); } else expect(linOf(keyText(p), 'w')).toEqual([2 * a + 2, 2 * b]); }
  });
  test('absolute value, rates, metrics, the ACT items', () => {
    for (const p of deal(M1, 'absValue')) {
      const t = promptOf(p); const [n, m, pp] = nums(t.split(', where ')[1]); const e = t.split(', where ')[0]; const abs = Math.abs;
      const table = { '|m|': abs(m), '-|n|': -abs(n), '|-p|': abs(-pp), '-|-m|': -abs(-m), '|n| + |m|': abs(n) + abs(m), '-|m| + p': -abs(m) + pp, '|m - n|': abs(m - n), '|n - p| - |m|': abs(n - pp) - abs(m) };
      expect(Number(p.answer)).toBe(table[e]);
    }
    for (const p of deal(M1, 'rate')) { const [total, units] = nums(promptOf(p)); expect(Number(p.answer) * units).toBe(total); }
    for (const p of deal(M1, 'compareMetrics')) { const [t1, g1, t2, g2] = nums(promptOf(p)); expect(keyText(p)).toBe(`${t1 > t2 ? 'Alvarez' : 'Brooks'} leads in total points, but ${t1 / g1 > t2 / g2 ? 'Alvarez' : 'Brooks'} leads in points per game`); }
    for (const p of deal(M1, 'fractions')) { const [p1, q1, p2, q2] = nums(promptOf(p)); const k = keyText(p); const [tp, tq = 1] = nums(k); expect(tp * q1 * q2).toBe(tq * (p1 * q2 + p2 * q1)); expect(gcd(tp, tq)).toBe(1); }
    for (const p of deal(M1, 'percentOf')) { const [pct, n] = nums(promptOf(p)); expect(Number(p.answer) * 100).toBe(pct * n); }
    for (const p of deal(M1, 'integerOps')) expect(Number(p.answer)).toBe(evalArith(promptOf(p).replace(/\((-?\d+)\)/g, '$1').replace(/- -/g, '+ ').replace(/\+ -/g, '- ')));
  });
});

describe('Algebra Module 2 — re-solved from the question text', () => {
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const wordNum = (w) => WORDS.indexOf(w.toLowerCase());
  const checkEq = (eqText, x) => { const [L, R] = plain(eqText).split(' = '); const ev = (s) => { const t = s.replace(/\s/g, '').replace(/(\d)\(/g, '$1*(').replace(/(\d)([a-z])/g, '$1*$2').replace(/\(([^)]*)\)\*?/g, '($1)').replace(/([a-z])/g, `(${x})`).replace(/(\d|\))\(/g, '$1*('); return Function(`"use strict"; return (${t});`)(); }; expect(ev(L)).toBeCloseTo(ev(R), 9); };
  test('solving: the key satisfies the printed equation', () => {
    for (const p of deal(M2, 'wordsToEquation')) {
      const w = promptOf(p); const m = w.match(/^(\w+) (less|more) than (\w+) times a number, n, is (-?\d+)\./); const c = wordNum(m[1]); const k = wordNum(m[3]); const r = +m[4]; const less = m[2] === 'less';
      if (p.input === 'number') expect(k * Number(p.answer) + (less ? -c : c)).toBe(r); else expect(keyText(p)).toBe(`${k}n ${less ? '-' : '+'} ${c} = ${r}`);
    }
    for (const id of ['twoStep', 'distributeFirst', 'bothSides']) for (const p of deal(M2, id)) checkEq(promptOf(p), Number(p.answer));
    for (const p of deal(M2, 'fractionCoef')) { const [pp, q, b, r] = nums(promptOf(p)); const sign = / - \d+ =/.test(promptOf(p)) ? -1 : 1; expect((pp * Number(p.answer)) / q + sign * b).toBeCloseTo(r, 9); }
    for (const p of deal(M2, 'decimalEq')) { const [a, b, r] = nums(promptOf(p)); const sign = / - [\d.]+ =/.test(promptOf(p)) ? -1 : 1; expect(a * Number(p.answer) + sign * b).toBeCloseTo(r, 9); }
    for (const p of deal(M2, 'rexEquation')) { if (p.input === 'number') checkEq(promptOf(p), Number(p.answer)); else expect(keyText(p)).toMatch(/^he distributed/); }
  });
  test('special cases and literal equations', () => {
    for (const p of deal(M2, 'specialCase')) {
      const [L, R] = promptOf(p).split(' = '); const ex = (s) => { const m = s.match(/^(\d+)\((.*)\)$/); if (m) { const [a, b] = linOf(m[2]); return [+m[1] * a, +m[1] * b]; } return linOf(s); };
      const [a1, b1] = ex(L); const [a2, b2] = ex(R); expect(keyText(p)).toBe(a1 !== a2 ? 'exactly one solution' : b1 === b2 ? 'identity — true for all x' : 'no solution');
    }
    for (const p of deal(M2, 'literal')) { const t = promptOf(p); const v = t.match(/for (\w)$/)[1]; expect(keyText(p).startsWith(`${v} = `)).toBe(true); }
  });
  test('stories: bowling, consecutive integers, the rectangle', () => {
    for (const p of deal(M2, 'bowling')) { const [shoe, per, total] = nums(promptOf(p)); if (p.input === 'number') expect(per * Number(p.answer) + shoe).toBeCloseTo(total, 9); else expect(keyText(p)).toBe(`${per}g + ${shoe} = ${total}`); }
    for (const p of deal(M2, 'consecutive')) { const t = promptOf(p); const [sum] = nums(t); const step = /even|odd/.test(t) ? 2 : 1; const a = Number(p.answer); const first = /smallest/.test(p.head) ? a : a - 2 * step; expect(first + (first + step) + (first + 2 * step)).toBe(sum); if (/even/.test(t)) expect(first % 2).toBe(0); if (/odd/.test(t)) expect(Math.abs(first % 2)).toBe(1); }
    for (const p of deal(M2, 'rectangle')) { const t = promptOf(p); const [c, P] = nums(t); const k = /twice/.test(t) ? 2 : 3; const a = Number(p.answer); const w = /width/.test(p.head) ? a : (a - c) / k; expect(2 * w + 2 * (k * w + c)).toBe(P); }
  });
  test('absolute value: both solutions satisfy the printed equation', () => {
    for (const p of deal(M2, 'absEq')) {
      const t = promptOf(p); const k = keyText(p); const [inner, r] = t.split('| = '); const v = (inner.match(/[a-z]/) || ['x'])[0]; const [a, b] = linOf(inner.slice(1), v);
      if (+r < 0) { expect(k).toMatch(/^no solution/); continue; }
      const roots = k.match(/= (-?\d+)/g).map((m) => +m.slice(2)); expect(roots.length).toBe(+r === 0 ? 1 : 2); for (const x of roots) expect(Math.abs(a * x + b)).toBe(+r);
    }
    for (const p of deal(M2, 'giveOrTake')) { const [mid, tol] = nums(promptOf(p)); if (p.input === 'number') expect(Number(p.answer)).toBe(/maximum/.test(p.head) ? mid + tol : mid - tol); else expect(keyText(p)).toBe(`|s - ${mid}| = ${tol}`); }
  });
  test('proportions: cross products equal; percent proportion', () => {
    for (const p of deal(M2, 'proportion')) { const [L, R] = promptOf(p).split(' = '); const x = Number(p.answer); const side = (s) => s.split('/').map((q) => (q === 'x' ? x : +q)); const [n1, d1] = side(L); const [n2, d2] = side(R); expect(n1 * d2).toBe(n2 * d1); }
    for (const p of deal(M2, 'sinkingCity')) { const [rate, per, years] = nums(promptOf(p)); expect(Number(p.answer) * per).toBe(rate * years); }
    for (const p of deal(M2, 'punch')) { const [a, b, cran] = nums(promptOf(p)); expect(Number(p.answer) * a).toBe(b * cran); }
    for (const p of deal(M2, 'percentProportion')) {
      const t = promptOf(p); const x = Number(p.answer);
      if (/trail mix/.test(t)) { const [nuts, pct] = nums(t); expect((x / (x + nuts)) * 100).toBeCloseTo(pct, 9); }
      else if (/^What is/.test(t)) { const [pct, whole] = nums(t); expect(x * 100).toBe(pct * whole); }
      else if (/what percent/.test(t)) { const [part, whole] = nums(t); expect(x * whole).toBe(part * 100); }
      else { const [part, pct] = nums(t); expect(pct * x).toBe(part * 100); }
    }
  });
  test('cumulative review', () => {
    for (const p of deal(M2, 'evaluateQuad')) { const [a, b, x] = nums(askOf(p)); expect(Number(p.answer)).toBe(a * x * x - b); }
    for (const p of deal(M2, 'equivalent')) { const t = promptOf(p); const m = t.match(/^(\d+)\((.*)\) \+ (\d+)x$/); const [a, b] = linOf(m[2]); expect(linOf(keyText(p))).toEqual([+m[1] * a + +m[3], +m[1] * b]); }
  });
});
