/**
 * Algebra 2 course drill (utils/liveDrill/review/alg2.js). Same contract as the other native
 * suites: every play well formed, registered on its hub, and EVERY computed answer re-solved from
 * the printed question — the complex product multiplied out again from the printed factors, the
 * remainder recomputed as p(r) from the printed cubic, 8^(2/3) re-evaluated, every log and
 * exponential equation solved again, every series re-summed term by term. The rules are typed here
 * by hand, never read from the bank.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const bank = require('../../utils/liveDrill/review/alg2');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<sub>/g, '_').replace(/<\/sub>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(id, n = N) {
  let s = 1357 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const ask = (p) => plain(p.head);
const nums = (s) => (plain(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const typed = (p) => { expect(p.input).toBe('number'); return Number(p.answer); };
/** coefficients of a polynomial in x from text like "2x^3 - x^2 + 5x - 7" → { 3: 2, 2: -1, 1: 5, 0: -7 } */
function poly(s) {
  const c = {};
  const t = plain(s).replace(/\s+/g, '');
  for (const m of t.matchAll(/([+-]?)(\d*)x(?:\^(\d+))?|([+-]?)(\d+)(?![\dx^])/g)) {
    if (m[5] !== undefined && m[2] === undefined) { c[0] = (c[0] || 0) + Number((m[4] || '') + m[5]); continue; }
    const deg = m[3] ? Number(m[3]) : 1;
    const coef = m[2] === '' ? 1 : Number(m[2]);
    c[deg] = (c[deg] || 0) + (m[1] === '-' ? -coef : coef);
  }
  return c;
}
/** "3 + 4i", "-3 - i", "5i", "-7" → [re, im] */
function cx(s) {
  const t = plain(s).replace(/[()\s]/g, '');
  if (!/i$/.test(t)) { expect(t).toMatch(/^-?\d+$/); return [Number(t), 0]; }
  // a real part only when a sign follows it: "-7i" is imaginary, "3-7i" has a real part
  const m = t.match(/^(?:(-?\d+)(?=[+-]))?([+-]?)(\d*)i$/);
  expect(m).toBeTruthy();
  return [m[1] ? Number(m[1]) : 0, Number((m[2] === '-' ? '-' : '') + (m[3] === '' ? '1' : m[3]))];
}
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
/** "(x - 3)" → 3 (the root) */
const rootOf = (s) => { const m = plain(s).match(/\(x ([+-]) (\d+)\)/); return m[1] === '-' ? Number(m[2]) : -Number(m[2]); };

describe('alg2: every play is well formed', () => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill on the algebra2 hub, every template reachable from Whole Course, every unit has plays', () => {
    expect(DRILLS.alg2.native).toBe(bank); expect(DRILLS.alg2.scoring).toBeUndefined();
    expect(solo.HUBS.algebra2.games.some((g) => g.drill === 'alg2')).toBe(true);
    const seen = new Set(); for (let n = 1; n <= 800; n++) seen.add(dealPlay('alg2', 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay('alg2', book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay('alg2', 'all', 'x', 7, [])).toEqual(dealPlay('alg2', 'all', 'x', 7, []));
    for (const t of Object.values(bank.TEMPLATES)) expect(Object.keys(bank.BOOKS)).toContain(t.book);
    expect(Object.keys(bank.TEMPLATES).length).toBeGreaterThanOrEqual(40);
  });
});

describe('quadratics & complex numbers — re-solved', () => {
  test('powers of i cycle every four', () => {
    for (const p of deal('iPowers')) { const n = nums(promptOf(p))[0]; expect(keyText(p)).toBe(['1', 'i', '-1', '-i'][n % 4]); }
  });
  test('complex add / subtract / multiply, from the printed factors', () => {
    for (const p of deal('complexAdd')) {
      const t = promptOf(p); const [A, B] = [...t.matchAll(/\(([^)]*)\)/g)].map((m) => cx(m[1])); const sub = / - \(/.test(t);
      const [re, im] = cx(keyText(p)); expect(re).toBe(sub ? A[0] - B[0] : A[0] + B[0]); expect(im).toBe(sub ? A[1] - B[1] : A[1] + B[1]);
    }
    for (const p of deal('complexMul')) {
      const [A, B] = [...promptOf(p).matchAll(/\(([^)]*)\)/g)].map((m) => cx(m[1]));
      const [re, im] = cx(keyText(p)); expect(re).toBe(A[0] * B[0] - A[1] * B[1]); expect(im).toBe(A[0] * B[1] + A[1] * B[0]);
    }
  });
  test('complex roots: x² + k² = 0 and (x − h)² = −k²', () => {
    for (const p of deal('complexRoots')) {
      const t = promptOf(p); const k = keyText(p);
      if (/^x\^2 \+ /.test(t)) { const K = Number(t.match(/^x\^2 \+ (\d+) = 0$/)[1]); expect(Number.isInteger(Math.sqrt(K))).toBe(true); expect(k).toBe(`x = ±${Math.sqrt(K)}i`); }
      else { const m = t.match(/\(x ([+-]) (\d+)\)\^2 = -(\d+)/); const h = m[1] === '-' ? +m[2] : -m[2]; expect(k).toBe(`x = ${h} ± ${Math.sqrt(+m[3])}i`); }
    }
  });
  test('the discriminant and what it says', () => {
    for (const p of deal('discriminantType')) {
      const c = poly(promptOf(p).split('=')[0]); const d = c[1] * c[1] - 4 * c[2] * c[0];
      if (p.input === 'number') expect(typed(p)).toBe(d);
      else expect(keyText(p)).toBe(d > 0 ? 'two real solutions' : d === 0 ? 'one real solution (a double root)' : 'two complex (non-real) solutions');
    }
  });
  test('the vertex, from vertex form and from standard form', () => {
    for (const p of deal('vertexForm')) {
      const t = promptOf(p); const [vx, vy] = nums(keyText(p));
      const m = t.match(/\(x ([+-]) (\d+)\)\^2(?: ([+-]) (\d+))?/);
      if (m) { expect(vx).toBe(m[1] === '-' ? +m[2] : -m[2]); expect(vy).toBe(m[3] ? (m[3] === '-' ? -m[4] : +m[4]) : 0); }
      else { const c = poly(t.replace(/^y = /, '')); expect(c[2]).toBe(1); const h = -c[1] / 2; expect(vx).toBe(h); expect(vy).toBe((c[0] || 0) - h * h); }
    }
  });
  test('completing the square: real and complex', () => {
    for (const p of deal('completeSquare')) {
      const c = poly(promptOf(p).split('=')[0]); expect(c[0]).toBeTruthy(); const h = -c[1] / 2; const d2 = h * h - c[0]; const k = keyText(p);
      if (d2 > 0) { const d = Math.sqrt(d2); expect(Number.isInteger(d)).toBe(true); expect(k).toBe(`x = ${Math.min(h - d, h + d)} or x = ${Math.max(h - d, h + d)}`); }
      else { const d = Math.sqrt(-d2); expect(Number.isInteger(d)).toBe(true); expect(k).toBe(`x = ${h} ± ${d === 1 ? '' : d}i`); }
    }
  });
});

describe('polynomials — re-solved', () => {
  test('(x + a)(x² + bx + c) multiplied out again', () => {
    for (const p of deal('multiplyPoly')) {
      const [f1, f2] = [...promptOf(p).matchAll(/\(([^)]*)\)/g)].map((m) => poly(m[1]));
      const out = poly(keyText(p)); const a = f1[0] || 0;
      expect(out[3] || 0).toBe(1); expect(out[2] || 0).toBe(a + (f2[1] || 0)); expect(out[1] || 0).toBe(a * (f2[1] || 0) + (f2[0] || 0)); expect(out[0] || 0).toBe(a * (f2[0] || 0));
    }
  });
  test('the remainder is p(r); a factor has p(k) = 0', () => {
    const at = (c, x) => (c[3] || 0) * x ** 3 + (c[2] || 0) * x * x + (c[1] || 0) * x + (c[0] || 0);
    for (const p of deal('remainder')) { const t = promptOf(p); const c = poly(t.match(/\((.*?)\) ÷/)[1]); const r = rootOf(t.split('÷')[1]); expect(typed(p)).toBe(at(c, r)); }
    for (const p of deal('factorTheorem')) {
      const c = poly(promptOf(p).replace(/^p\(x\) = /, '')); expect(at(c, rootOf(keyText(p)))).toBe(0);
      for (const ch of p.choices) if (ch.k !== p.answer) expect(at(c, rootOf(ch.html))).not.toBe(0);
    }
  });
  test('sum and difference of cubes', () => {
    for (const p of deal('cubes')) {
      const m = promptOf(p).match(/^x\^3 ([+-]) (\d+)$/); const a = Math.cbrt(+m[2]); expect(Number.isInteger(a)).toBe(true); const plus = m[1] === '+';
      expect(keyText(p)).toBe(`(x ${plus ? '+' : '-'} ${a})(x^2 ${plus ? '-' : '+'} ${a === 1 ? '' : a}x + ${a * a})`);
    }
  });
  test('end behavior from the leading term', () => {
    for (const p of deal('endBehavior')) {
      const m = promptOf(p).match(/f\(x\) = (-?)(\d*)x\^(\d+)/); const up = m[1] !== '-'; const even = +m[3] % 2 === 0;
      const left = even ? (up ? '+∞' : '-∞') : (up ? '-∞' : '+∞'); const right = up ? '+∞' : '-∞';
      expect(keyText(p)).toBe(`as x → -∞, f(x) → ${left}; as x → +∞, f(x) → ${right}`);
    }
  });
  test('zeros with multiplicity, and a quotient that checks by multiplication', () => {
    for (const p of deal('multiplicity')) { const m = promptOf(p).match(/\(x ([+-]) (\d+)\)\^2\(x ([+-]) (\d+)\)/); const a = m[1] === '-' ? +m[2] : -m[2]; const b = m[3] === '-' ? +m[4] : -m[4]; expect(keyText(p)).toBe(`x = ${a} (touches, multiplicity 2) and x = ${b} (crosses)`); }
    for (const p of deal('divide')) {
      const t = promptOf(p); const top = poly(t.match(/\((.*?)\) ÷/)[1]); const a = (poly(t.split('÷')[1]))[0] || 0; const q = poly(keyText(p)); const b = q[0] || 0;
      expect(q[1]).toBe(1); expect(a + b).toBe(top[1] || 0); expect(a * b).toBe(top[0] || 0);
    }
  });
});

describe('radicals & rational exponents — re-solved', () => {
  const rootIdx = (s) => (/∛/.test(s) ? 3 : /∜/.test(s) ? 4 : /\^5√/.test(s) ? 5 : 2);
  test('nth roots, exact and simplified', () => {
    for (const p of deal('nthRoot')) {
      const t = promptOf(p); const n = rootIdx(t); const [N] = nums(t.replace(/\^5/, ''));
      if (p.input === 'number') expect(typed(p) ** n).toBe(N);
      else { const k = keyText(p); const m = k.match(/^(\d+)(?:\^5)?[∛∜√](\d+)$/); expect(m).toBeTruthy(); expect((+m[1]) ** n * +m[2]).toBe(N); for (let j = 2; j <= 6; j++) expect(+m[2] % (j ** n)).not.toBe(0); }
    }
  });
  test('b^(p/q) evaluated as the qth root to the pth power', () => {
    for (const p of deal('rationalExp')) { const m = promptOf(p).match(/^(\d+)\^(\d+)\/(\d+)$/); close(typed(p), Math.round((+m[1]) ** (1 / +m[3])) ** +m[2]); expect(Math.round((+m[1]) ** (1 / +m[3])) ** +m[3]).toBe(+m[1]); }
  });
  test('radical ↔ rational exponent form agree', () => {
    for (const p of deal('radicalForm')) {
      const t = promptOf(p); const k = keyText(p);
      const parse = (s) => { let m = s.match(/^x\^(\d+)\/(\d+)$/); if (m) return [+m[1], +m[2]]; m = s.match(/^\((\^5)?([∛∜√])x\)\^(\d+)$/); return [+m[3], m[1] ? 5 : { '√': 2, '∛': 3, '∜': 4 }[m[2]]]; };
      expect(parse(k)).toEqual(parse(t));
    }
  });
  test('radical equations: the answer satisfies the printed equation', () => {
    for (const p of deal('radicalEq')) {
      const t = promptOf(p); const m = t.match(/√\(x ([+-]) (\d+)\)(?: \+ (\d+))? = (\d+)/); const a = m[1] === '-' ? -m[2] : +m[2]; const d = m[3] ? +m[3] : 0;
      expect(Math.sqrt(typed(p) + a) + d).toBe(+m[4]);
    }
  });
  test('√N simplified to a√b with b square-free', () => {
    for (const p of deal('simplifyRad')) { const [N] = nums(promptOf(p)); const m = keyText(p).match(/^(\d+)√(\d+)$/); expect(+m[1] * +m[1] * +m[2]).toBe(N); for (let j = 2; j <= 7; j++) expect(+m[2] % (j * j)).not.toBe(0); }
  });
});

describe('exponentials & logarithms — re-solved', () => {
  test('log ↔ exponential conversions say the same thing', () => {
    for (const p of deal('logConvert')) {
      const read = (s) => { let m = s.match(/^log_?(\d+) (\d+) = (\d+)$/); if (m) return [+m[1], +m[2], +m[3]]; m = s.match(/^(\d+)\^(\d+) = (\d+)$/); return [+m[1], +m[3], +m[2]]; };
      const [b, x, y] = read(promptOf(p)); expect(b ** y).toBe(x); expect(read(keyText(p))).toEqual([b, x, y]);
    }
  });
  test('logs evaluated', () => {
    for (const p of deal('logEval')) {
      const m = promptOf(p).match(/^log_(\d+) (?:\(1\/(\d+)\)|(\d+))$/); const b = +m[1];
      if (m[2]) expect(b ** -typed(p)).toBe(+m[2]); else expect(b ** typed(p)).toBe(+m[3]);
    }
  });
  test('expand and condense', () => {
    for (const p of deal('logProps')) {
      const t = promptOf(p); const [k] = nums(t);
      if (/^log\(xy/.test(t)) expect(keyText(p)).toBe(`log x + ${k} log y`); else expect(keyText(p)).toBe(`log(x^${k}/y)`);
    }
  });
  test('exponential and log equations solved again', () => {
    for (const p of deal('expEq')) { const m = promptOf(p).match(/^(\d+)\^x ([+-]) (\d+) = (\d+)$/); const a = m[2] === '-' ? -m[3] : +m[3]; expect((+m[1]) ** (typed(p) + a)).toBe(+m[4]); }
    for (const p of deal('logEq')) {
      const t = promptOf(p); let m = t.match(/^log_(\d+) x = (\d+)$/);
      if (m) expect(typed(p)).toBe((+m[1]) ** +m[2]);
      else { m = t.match(/^log_(\d+) \(x ([+-]) (\d+)\) = (\d+)$/); const a = m[2] === '-' ? -m[3] : +m[3]; expect(typed(p) + a).toBe((+m[1]) ** +m[4]); expect(typed(p) + a).toBeGreaterThan(0); }
    }
  });
  test('growth or decay and the rate, from the base', () => {
    for (const p of deal('growthDecay')) { const f = Number(promptOf(p).match(/\(([\d.]+)\)\^t/)[1]); const r = Math.round(Math.abs(f - 1) * 100); expect(keyText(p)).toBe(`${f > 1 ? 'growth' : 'decay'} at ${r}% per year`); }
  });
});

describe('rational expressions — re-solved', () => {
  test('simplify: the quotient times the divisor is the numerator', () => {
    for (const p of deal('simplifyRational')) {
      const t = promptOf(p); const top = poly(t.match(/^\((.*?)\) \//)[1]); const bot = poly(t.match(/\/ \((.*?)\)$/)[1]); const q = poly(keyText(p));
      expect(q[1]).toBe(1); const a = bot[0] || 0; const b = q[0] || 0;
      expect(top[2]).toBe(1); expect(top[1] || 0).toBe(a + b); expect(top[0] || 0).toBe(a * b);
    }
  });
  test('a/x + b/(x + c) over the common denominator', () => {
    for (const p of deal('rationalAdd')) { const [a, b, c] = nums(promptOf(p)); expect(keyText(p)).toBe(`(${a + b}x + ${a * c}) / (x(x + ${c}))`); }
  });
  test('a/x = c/b cross-multiplied', () => {
    for (const p of deal('proportion')) { const [a, c, b] = nums(promptOf(p)); expect(a * b).toBe(c * typed(p)); }
  });
  test('asymptotes and excluded values', () => {
    for (const p of deal('asymptotes')) { const m = promptOf(p).match(/^f\(x\) = \((-?)(\d*)x [+-] \d+\) \/ \(x ([+-]) (\d+)\)$/); const a = (m[1] === '-' ? -1 : 1) * (m[2] === '' ? 1 : +m[2]); const c = m[3] === '-' ? +m[4] : -m[4]; expect(keyText(p)).toBe(`vertical x = ${c}, horizontal y = ${a}`); }
    for (const p of deal('excluded')) { const d = poly(promptOf(p).match(/\/ \((.*?)\)$/)[1]); const [m, n] = nums(keyText(p)); expect(m).toBeLessThan(n); expect(m + n + (d[1] || 0)).toBe(0); expect(m * n).toBe(d[0] || 0); }
  });
});

describe('functions — re-solved', () => {
  test('f(k), f(g(k)) and g(f(k)) from the printed rules', () => {
    for (const p of deal('evalFunction')) { const t = promptOf(p); const c = poly(t.match(/f\(x\) = (.*?)\. Find/)[1]); const k = nums(t.match(/Find f\((.*?)\)/)[1])[0]; expect(typed(p)).toBe(k * k + (c[1] || 0) * k + (c[0] || 0)); }
    for (const p of deal('compose')) {
      const t = promptOf(p); const f = poly(t.match(/f\(x\) = (.*?), g/)[1]); const g = poly(t.match(/g\(x\) = (.*?)\. Find/)[1]); const inner = t.match(/Find (f|g)\((f|g)\((-?\d+)\)\)/);
      const F = (x) => (f[1] || 0) * x + (f[0] || 0); const G = (x) => x * x + (g[0] || 0); const k = +inner[3];
      expect(typed(p)).toBe(inner[1] === 'f' ? F(G(k)) : G(F(k)));
    }
  });
  test('the inverse of ax + b, and a shift read off g(x) = f(x − h) + k', () => {
    for (const p of deal('inverse')) { const c = poly(promptOf(p).replace(/^f\(x\) = /, '')); const b = c[0] || 0; expect(keyText(p)).toBe(`f^-1(x) = (x ${b < 0 ? '+' : '-'} ${Math.abs(b)}) / ${c[1]}`); }
    for (const p of deal('transform')) { const m = promptOf(p).match(/f\(x ([+-]) (\d+)\) ([+-]) (\d+)/); const h = m[1] === '-' ? +m[2] : -m[2]; const k = m[3] === '-' ? -m[4] : +m[4]; expect(keyText(p)).toBe(`${h > 0 ? 'right' : 'left'} ${Math.abs(h)}, ${k > 0 ? 'up' : 'down'} ${Math.abs(k)}`); }
  });
});

describe('sequences & series — re-summed', () => {
  const terms = (p) => nums(promptOf(p).replace(/…/, ''));
  const nth = (p) => Number(ask(p).match(/(\d+)th term/)[1]);
  test('arithmetic nth term and sum', () => {
    for (const p of deal('arithNth')) { const t = terms(p); const d = t[1] - t[0]; expect(t[2] - t[1]).toBe(d); expect(typed(p)).toBe(t[0] + (nth(p) - 1) * d); }
    for (const p of deal('arithSum')) { const t = terms(p); const d = t[1] - t[0]; const n = Number(ask(p).match(/first (\d+)/)[1]); let S = 0; for (let i = 0; i < n; i++) S += t[0] + i * d; expect(typed(p)).toBe(S); }
  });
  test('geometric nth term, finite sum and infinite sum', () => {
    for (const p of deal('geoNth')) { const t = terms(p); const r = t[1] / t[0]; expect(t[2] / t[1]).toBe(r); expect(typed(p)).toBe(t[0] * r ** (nth(p) - 1)); }
    for (const p of deal('geoSum')) { const t = terms(p); const r = t[1] / t[0]; const n = Number(ask(p).match(/first (\d+)/)[1]); let S = 0; for (let i = 0; i < n; i++) S += t[0] * r ** i; expect(typed(p)).toBe(S); }
    for (const p of deal('infGeoSum')) {
      const parts = promptOf(p).replace(/ \+ …$/, '').split(' + ').map((s) => { const m = s.match(/^(-?\d+)(?:\/(\d+))?$/); return +m[1] / (m[2] ? +m[2] : 1); });
      const r = parts[1] / parts[0]; close(parts[2] / parts[1], r); expect(Math.abs(r)).toBeLessThan(1); close(typed(p), parts[0] / (1 - r));
    }
  });
  test('sigma notation added term by term; arithmetic vs geometric named with its d or r', () => {
    for (const p of deal('sigma')) { const t = promptOf(p); const n = +t.match(/\^(\d+)/)[1]; const c = poly(t.match(/\((.*)\)$/)[1].replace(/k/g, 'x')); let S = 0; for (let k = 1; k <= n; k++) S += (c[1] || 0) * k + (c[0] || 0); expect(typed(p)).toBe(S); }
    for (const p of deal('arithOrGeo')) {
      const t = terms(p); const geo = t[1] / t[0] === t[2] / t[1] && t[1] - t[0] !== t[2] - t[1];
      expect(keyText(p)).toBe(geo ? `geometric, common ratio ${t[1] / t[0]}` : `arithmetic, common difference ${t[1] - t[0]}`);
    }
  });
});
