/**
 * Chapter Review drills, fifth pair: Honors Geometry Ch. 8 (similarity) and Alg 1 Module 11
 * (quadratic functions). Same contract as the other review suites, with every computed answer
 * re-solved from the printed question: ratios re-reduced, proportions re-cross-multiplied, every
 * quadratic's roots substituted back into the printed equation.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch11');
const GEO = require('../../utils/liveDrill/review/hgeoCh8');

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
const nums = (s) => (plain(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fracVal = (s) => { const m = s.trim().match(/^(-?\d+)(?:\/(\d+))?$/); return +m[1] / (m[2] ? +m[2] : 1); };
/** "ax^2 + bx + c" → [a, b, c] */
function quadOf(s) {
  const t = s.replace(/\s/g, '').replace(/=0$/, '').replace(/-/g, '+-'); const terms = t.split('+').filter(Boolean); const c = [0, 0, 0];
  for (const term of terms) { const m = term.match(/^(-?\d*)([xwt])?(?:\^2)?$/); const coef = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; if (!m[2]) c[2] += coef; else if (term.includes('^2')) c[0] += coef; else c[1] += coef; }
  return c;
}
const evalQ = ([a, b, c], x) => a * x * x + b * x + c;

describe.each([['alg1m11', ALG], ['hgeo8', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill, on its hub, reachable from Whole Chapter', () => {
    expect(DRILLS[drill].native).toBe(bank); expect(DRILLS[drill].scoring).toBeUndefined();
    expect(Object.values(solo.HUBS).some((h) => h.games.some((g) => g.drill === drill))).toBe(true);
    const seen = new Set(); for (let n = 1; n <= 500; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Geometry Ch. 8 — re-solved from the question text', () => {
  test('scale factor: image over original, in the direction asked, reduced', () => {
    for (const p of deal(GEO, 'scaleFactor')) {
      const t = promptOf(p); const [t1, t2] = t.match(/△(\w{3})/g).map((x) => x.slice(1)); const [ab, de] = nums(t);
      const [from, to] = plain(p.head).match(/△(\w{3}) to △(\w{3})/).slice(1);
      const want = from === t1 ? [de, ab] : [ab, de]; const g = gcd(want[0], want[1]);
      expect(keyText(p)).toBe(want[1] / g === 1 ? String(want[0] / g) : `${want[0] / g}/${want[1] / g}`);
    }
  });
  test('similar or not: every ratio equal', () => {
    for (const p of deal(GEO, 'similarCheck')) { const [A, B] = promptOf(p).split('are ')[1].split(' and ').map(nums); const r = A[0] / B[0]; expect(keyText(p).startsWith('Yes')).toBe(A.every((a, i) => a / B[i] === r)); }
    for (const p of deal(GEO, 'rectSimilar')) { const [w, h, W, H] = nums(promptOf(p)); expect(keyText(p).startsWith('Yes')).toBe(w * H === h * W); }
    for (const p of deal(GEO, 'sssSim')) { const [A, B] = promptOf(p).replace('Sides ', '').split(' and ').map(nums); const r = A[0] / B[0]; expect(keyText(p).startsWith('Yes')).toBe(A.every((a, i) => a / B[i] === r)); }
    for (const p of deal(GEO, 'sasSim')) { expect(keyText(p).startsWith('Yes')).toBe(/\d+° included/.test(promptOf(p))); }
    for (const p of deal(GEO, 'propConverse')) { const [a1, a2, b1, b2] = nums(promptOf(p)); expect(keyText(p).startsWith('Yes')).toBe(a1 * b2 === a2 * b1); }
  });
  test('proportions: cross-multiply from the printed numbers', () => {
    for (const p of deal(GEO, 'solveSimilar')) { const [c, pq, kl, qr] = nums(promptOf(p)); expect(c * Number(p.answer) * qr).toBe(pq * kl); }
    for (const p of deal(GEO, 'perimeter')) {
      const t = promptOf(p); if (/pentagons/.test(t)) { const [pn, qd, big] = nums(t); expect(Number(p.answer) * qd).toBe(big * pn); } else { const [s0, s1, s2, uv] = nums(t); expect(Number(p.answer) * s0).toBe((s0 + s1 + s2) * uv); }
    }
    for (const p of deal(GEO, 'parallelProp')) { const [ad, db, ae] = nums(promptOf(p)); expect(Number(p.answer) * ad).toBe(db * ae); }
    for (const p of deal(GEO, 'shadow')) { const [post, shadow, bshadow] = nums(promptOf(p)); expect(Number(p.answer) * shadow).toBe(post * bshadow); }
    for (const p of deal(GEO, 'threeParallel')) { const t = promptOf(p); const [l0, l1] = nums(t.split('another')[0]); const right = t.split('another into ')[1]; const x = Number(p.answer);
      if (right.startsWith('x')) expect(x * l1).toBe(l0 * nums(right)[0]); else expect(nums(right)[0] * l1).toBe(l0 * x); }
    for (const p of deal(GEO, 'angleBisector')) { const [ab, bc, ac] = nums(promptOf(p)); const ad = Number(p.answer); expect(ad * bc).toBe((ac - ad) * ab); }
    for (const p of deal(GEO, 'drawingScale')) { const ns = nums(promptOf(p)); const feet = ns[0]; const s = ns[ns.length - 1]; expect(Number(p.answer) * s).toBe(feet * 12); }
    for (const p of deal(GEO, 'aa')) { const [a, b] = nums(promptOf(p)); if (p.input === 'number') expect(Number(p.answer)).toBe(180 - a - b); else expect(keyText(p)).toBe('Yes — AA Similarity'); }
  });
});

describe('Algebra Module 11 — re-solved from the question text', () => {
  const rootsOf = (s) => s.match(/x = (-?\d+(?:\/\d+)?)/g).map((m) => fracVal(m.slice(4)));
  test('axis, vertex, y-intercept, opening', () => {
    for (const p of deal(ALG, 'axisVertex')) {
      const [a, b, c] = quadOf(promptOf(p).replace(/^y = /, '')); const k = keyText(p); const h = -b / (2 * a);
      if (/axis/.test(p.head)) expect(k).toBe(`x = ${h}`); else if (/vertex/.test(p.head)) expect(nums(k)).toEqual([h, evalQ([a, b, c], h)]); else expect(nums(k)).toEqual([0, c]);
    }
    for (const p of deal(ALG, 'opens')) { const [a] = quadOf(promptOf(p).replace(/^y = /, '')); expect(keyText(p).startsWith(a > 0 ? 'opens UP' : 'opens DOWN')).toBe(true); }
    for (const p of deal(ALG, 'zerosForm')) {
      const [r1, r2] = promptOf(p).match(/\(x ([+-]) (\d+)\)/g).map((m) => { const mm = m.match(/\(x ([+-]) (\d+)\)/); return (mm[1] === '-' ? 1 : -1) * +mm[2]; });
      if (p.input === 'number') expect(Number(p.answer)).toBe((r1 + r2) / 2); else expect(rootsOf(keyText(p)).sort((x, y) => x - y)).toEqual([r1, r2].sort((x, y) => x - y));
    }
  });
  test('every solved equation: the roots satisfy the printed equation, and there are two unless they coincide', () => {
    for (const id of ['solveFactor', 'solveFactorA', 'quadFormula', 'completeSquare']) for (const p of deal(ALG, id)) {
      if (p.input === 'number') { const [, b] = quadOf(promptOf(p).replace(/\+ ____$/, '')); expect(Number(p.answer)).toBe((b / 2) ** 2); continue; } // the completing number
      const q = quadOf(promptOf(p)); const rs = rootsOf(keyText(p)); expect(rs.length).toBe(2);
      for (const r of rs) expect(evalQ(q, r)).toBeCloseTo(0, 9);
    }
    for (const p of deal(ALG, 'squareRoots')) { const ns = nums(promptOf(p).replace(/x\^2/, 'x').replace(/= 0$/, '')); const c = ns.length === 2 ? ns[0] : 1; const k2 = Math.abs(ns[ns.length - 1]); const [k] = nums(keyText(p)); expect(keyText(p)).toMatch(/^x = ±/); expect(c * k * k).toBe(k2); }
    for (const p of deal(ALG, 'gusError')) { const [k2] = nums(promptOf(p).replace(/x\^2/, 'x')); expect(nums(keyText(p))[0] ** 2).toBe(k2); expect(keyText(p)).toMatch(/±/); }
  });
  test('the discriminant and its verdict', () => {
    for (const p of deal(ALG, 'discriminant')) {
      const [a, b, c] = quadOf(promptOf(p)); const d = b * b - 4 * a * c;
      if (p.input === 'number') expect(Number(p.answer)).toBe(d); else expect(keyText(p).startsWith(d < 0 ? 'no' : d === 0 ? 'exactly one' : 'two')).toBe(true);
    }
  });
  test('applications: the rocket\'s vertex and the garden\'s width', () => {
    for (const p of deal(ALG, 'rocket')) { const [, v, h0 = 0] = nums(promptOf(p).replace(/-16t\^2/, '16')); const t = v / 32; expect(Number(p.answer)).toBe(/seconds/.test(p.head) ? t : -16 * t * t + v * t + h0); }
    for (const p of deal(ALG, 'garden')) { const [d, area] = nums(promptOf(p)); if (p.input === 'number') { const w = Number(p.answer); expect(w * (w + d)).toBe(area); } else expect(quadOf(keyText(p).replace(/w/g, 'x'))).toEqual([1, d, -area]); }
  });
});
