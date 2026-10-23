/**
 * Chapter Review drills, seventh pair: Honors Geometry Ch. 10 (circles) and Alg 1 Module 13 (the
 * Semester 2 Exam Review). Same contract as the other review suites, with every computed answer
 * re-solved from the printed question: every circle theorem re-applied to the printed arcs and
 * segments, every system's key substituted back into both printed equations, exponent rules
 * re-applied, every factored key multiplied back, every root substituted into the printed equation.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Sem2');
const GEO = require('../../utils/liveDrill/review/hgeoCh10');

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
const nums = (s) => (plain(s).replace(/\^2/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const radVal = (s) => { const m = plain(s).match(/^(\d*)√(\d+)(?:\/(\d+))?$/); return m ? (m[1] ? +m[1] : 1) * Math.sqrt(+m[2]) / (m[3] ? +m[3] : 1) : +s; };
const squareFree = (m) => { for (let f = 2; f * f <= m; f++) if (m % (f * f) === 0) return false; return true; };
/** "ax^2 + bx + c" (any single variable) → [a, b, c]; "(x − 3)^2" style is not handled here. */
function quadOf(s) {
  const t = plain(s).replace(/\s/g, '').replace(/=0$/, '').replace(/-/g, '+-'); const terms = t.split('+').filter(Boolean); const c = [0, 0, 0];
  for (const term of terms) { const m = term.match(/^(-?\d*)([a-z])?(?:\^2)?$/); const coef = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; if (!m[2]) c[2] += coef; else if (term.includes('^2')) c[0] += coef; else c[1] += coef; }
  return c;
}
const evalQ = ([a, b, c], x) => a * x * x + b * x + c;
/** "3x + 2y = 7" → [3, 2, 7] (x and y coefficients may be implicit) */
function linOf(s) {
  const m = plain(s).replace(/\s/g, '').match(/^(-?\d*)x([+-]\d*)y=(-?\d+)$/); const co = (v) => (v === '' || v === '+' ? 1 : v === '-' ? -1 : +v);
  return [co(m[1]), co(m[2]), +m[3]];
}
const rootsOf = (s) => plain(s).match(/x = (-?\d+)/g).map((m) => +m.slice(4));
/** "(x + 3)(x − 5)" / "2(x + 3)(x − 5)" / "(2x + 1)(x − 5)" → the expanded [a, b, c] */
function expandFactors(s) {
  const t = plain(s); const lead = t.match(/^(\d+)\(/); let out = [lead ? +lead[1] : 1];
  for (const f of t.match(/\([^()]*\)/g)) { const m = f.replace(/[()\s]/g, '').match(/^(-?\d*)([a-z])([+-]\d+)$/); const a = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; out = mul(out, [a, +m[3]]); }
  return out;
}
const mul = (a, b) => { const o = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
const polyOf = (s, v) => { const t = plain(s).replace(/\s/g, '').replace(/-/g, '+-').split('+').filter(Boolean); const c = [0, 0, 0]; for (const term of t) { const m = term.match(new RegExp(`^(-?\\d*)(${v})?(?:\\^(\\d))?$`)); const k = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; c[m[2] ? 2 - (m[3] ? +m[3] : 1) : 2] += k; } return c; };

describe.each([['alg1m13', ALG], ['hgeo10', GEO]])('%s: every play is well formed', (drill, bank) => {
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
    const seen = new Set(); for (let n = 1; n <= 700; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Geometry Ch. 10 — re-solved from the question text', () => {
  test('tangents: the right-triangle check, r from a tangent, congruent tangent segments', () => {
    for (const p of deal(GEO, 'isTangent')) { const [r, t, d] = nums(promptOf(p)); expect(keyText(p).startsWith('Yes')).toBe(r * r + t * t === d * d); }
    for (const p of deal(GEO, 'findR')) { const [t, e] = nums(promptOf(p)); const r = Number(p.answer); expect(t * t + r * r).toBe((r + e) ** 2); }
    for (const p of deal(GEO, 'tangentSegs')) {
      const [a, b, c, d] = promptOf(p).match(/(\d*)x ([+-]) (\d+)/g).flatMap((e) => { const m = e.match(/(\d*)x ([+-]) (\d+)/); return [m[1] === '' ? 1 : +m[1], (m[2] === '-' ? -1 : 1) * +m[3]]; });
      const x = (d - b) / (a - c); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/each/.test(p.head) ? a * x + b : x);
    }
  });
  test('arcs and chords: every measure re-derived from the printed one', () => {
    for (const p of deal(GEO, 'diameterArc')) { const [a] = nums(promptOf(p)); expect(Number(p.answer)).toBe(180 - a); }
    for (const p of deal(GEO, 'majorArc')) { const [a] = nums(promptOf(p)); expect(Number(p.answer)).toBe(360 - a); }
    for (const p of deal(GEO, 'circleGraph')) { const [pct] = nums(promptOf(p)); expect(Number(p.answer)).toBe(pct * 3.6); }
    for (const p of deal(GEO, 'congruentChords')) { const [a] = nums(promptOf(p)); if (p.input === 'number') expect(Number(p.answer)).toBe(a); else expect(keyText(p)).toBe(`RS is also ${a} from the center`); }
    for (const p of deal(GEO, 'diamPerpChord')) { const [a] = nums(promptOf(p)); expect(Number(p.answer) * 2).toBe(a); }
    for (const p of deal(GEO, 'chordTriangle')) {
      const [u, v] = nums(promptOf(p)); const x = Number(p.answer); const h = p.head;
      if (/How far/.test(h)) expect((v / 2) ** 2 + x * x).toBe(u * u); else if (/radius/.test(h)) expect((u / 2) ** 2 + v * v).toBe(x * x); else expect((x / 2) ** 2 + v * v).toBe(u * u);
    }
  });
  test('inscribed angles: half the arc, the semicircle, the quadrilateral', () => {
    for (const p of deal(GEO, 'inscribedAngle')) { const [a] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/arc/.test(p.head) ? 2 * a : a / 2); }
    for (const p of deal(GEO, 'sameArc')) { const [a] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/central/.test(p.head) ? 2 * a : a); }
    for (const p of deal(GEO, 'semicircle')) {
      const t = promptOf(p); if (/one acute angle is/.test(t)) { const [a] = nums(t); expect(Number(p.answer)).toBe(90 - a); continue; }
      const [A, B] = t.match(/\(([^)]*)\)/g).map((e) => { const m = e.match(/(\d*)x ([+-]) (\d+)/); return [m[1] === '' ? 1 : +m[1], (m[2] === '-' ? -1 : 1) * +m[3]]; });
      const x = (90 - A[1] - B[1]) / (A[0] + B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/larger/.test(p.head) ? Math.max(A[0] * x + A[1], B[0] * x + B[1]) : x);
    }
    for (const p of deal(GEO, 'inscribedQuad')) {
      const t = promptOf(p); if (/one angle is/.test(t)) { const [a] = nums(t); expect(Number(p.answer)).toBe(180 - a); continue; }
      const [A, B] = t.match(/\(([^)]*)\)/g).map((e) => { const m = e.match(/(\d*)y ([+-]) (\d+)/); return [m[1] === '' ? 1 : +m[1], (m[2] === '-' ? -1 : 1) * +m[3]]; });
      expect(Number(p.answer)).toBe((180 - A[1] - B[1]) / (A[0] + B[0]));
    }
  });
  test('where is the vertex: every angle rule re-applied to the printed arcs', () => {
    for (const p of deal(GEO, 'tangentChord')) { const [a] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/arc/.test(p.head) ? 2 * a : a / 2); }
    for (const p of deal(GEO, 'insideAngle')) { const [a, b] = nums(promptOf(p)); expect(Number(p.answer)).toBe((a + b) / 2); }
    for (const p of deal(GEO, 'outsideAngle')) { const [far, near] = nums(promptOf(p)); expect(far).toBeGreaterThan(near); expect(Number(p.answer)).toBe((far - near) / 2); if (/tangents/.test(promptOf(p))) expect(far + near).toBe(360); }
    for (const p of deal(GEO, 'circumscribed')) { const [c] = nums(promptOf(p)); expect(Number(p.answer)).toBe(180 - c); }
    for (const p of deal(GEO, 'whichRule')) { const t = promptOf(p); expect(keyText(p)).toBe(/CENTER/.test(t) ? 'angle = the arc' : /ON the/.test(t) ? 'angle = ½ · arc' : /INSIDE/.test(t) ? 'angle = ½ (arc + arc)' : /OUTSIDE/.test(t) ? 'angle = ½ (far - near)' : 'angle = 180° - central'); }
  });
  test('segment products: chords, secants (whole times external), tangent squared', () => {
    for (const p of deal(GEO, 'chordsProduct')) { const [a, b, c] = nums(promptOf(p)); expect(c * Number(p.answer)).toBe(a * b); }
    for (const p of deal(GEO, 'secantsProduct')) { const [e1, f1, e2] = nums(promptOf(p)); const x = Number(p.answer); expect((e2 + x) * e2).toBe((e1 + f1) * e1); }
    for (const p of deal(GEO, 'tangentSecant')) {
      const [e, f] = nums(promptOf(p)); const t2 = e * (e + f);
      if (p.input === 'number') expect(Number(p.answer) ** 2).toBe(t2); else { const m = keyText(p).match(/^(\d*)√(\d+)$/); expect(m).toBeTruthy(); expect((+m[1] || 1) ** 2 * +m[2]).toBe(t2); expect(squareFree(+m[2])).toBe(true); }
    }
  });
  test('coordinate plane: equations, centers, radii, point tests, midpoints', () => {
    const eqOf = (s) => { const t = plain(s); const h = (t.match(/\(x ([+-]) (\d+)\)/) || [null, '+', '0']); const k = (t.match(/\(y ([+-]) (\d+)\)/) || [null, '+', '0']); const r2 = +t.match(/= (\d+)$/)[1]; return [(h[1] === '-' ? 1 : -1) * +h[2], (k[1] === '-' ? 1 : -1) * +k[2], r2]; };
    for (const p of deal(GEO, 'writeEquation')) { const [h, k, r] = nums(promptOf(p)); expect(eqOf(keyText(p))).toEqual([h, k, r * r]); }
    for (const p of deal(GEO, 'readEquation')) { const [h, k, r2] = eqOf(promptOf(p)); if (p.input === 'number') expect(Number(p.answer) ** 2).toBe(r2); else expect(nums(keyText(p))).toEqual([h, k]); }
    for (const p of deal(GEO, 'pointTest')) { const [x, y] = nums(askOf(p)); const [r2] = nums(promptOf(p)); const d2 = x * x + y * y; expect(keyText(p).split(' ')[0]).toBe(d2 === r2 ? 'ON' : d2 < r2 ? 'INSIDE' : 'OUTSIDE'); }
    for (const p of deal(GEO, 'radiusFromPoint')) { const [h, k, x, y] = nums(promptOf(p)); expect((x - h) ** 2 + (y - k) ** 2).toBe(Number(p.answer) ** 2); }
    for (const p of deal(GEO, 'centerFromDiameter')) { const [x1, y1, x2, y2] = nums(promptOf(p)); expect(nums(keyText(p))).toEqual([(x1 + x2) / 2, (y1 + y2) / 2]); }
  });
});

describe('Algebra Semester 2 Exam Review — re-solved from the question text', () => {
  test('systems: the key satisfies both printed equations; counts and stories recomputed', () => {
    for (const p of deal(ALG, 'substitution')) {
      const [first, second] = promptOf(p).split(' and '); const [x, y] = nums(keyText(p)); const m1 = first.replace(/\s/g, '').match(/^y=(-?\d*)x([+-]\d+)$/); const m = m1[1] === '' ? 1 : m1[1] === '-' ? -1 : +m1[1];
      expect(y).toBe(m * x + +m1[2]); const [a, b, c] = linOf(second); expect(a * x + b * y).toBe(c);
    }
    for (const p of deal(ALG, 'elimination')) { const [x, y] = nums(keyText(p)); for (const eq of promptOf(p).split(' and ')) { const [a, b, c] = linOf(eq); expect(a * x + b * y).toBe(c); } }
    for (const p of deal(ALG, 'howMany')) {
      const [[a, b, c], [d, e, f]] = promptOf(p).split(' and ').map(linOf); const det = a * e - b * d; const k = keyText(p);
      if (det !== 0) expect(k).toBe('one solution'); else expect(k).toBe(a * f === c * d && b * f === c * e ? 'infinitely many solutions' : 'no solution');
    }
    for (const p of deal(ALG, 'coaster')) { const [cars, , , people] = nums(promptOf(p)); const [s, b] = keyText(p).match(/= (\d+)/g).map((m) => +m.slice(2)); expect(s + b).toBe(cars); expect(4 * s + 6 * b).toBe(people); }
    for (const p of deal(ALG, 'twoNumbers')) { const [sum, , k] = nums(promptOf(p)); const [s, b] = nums(keyText(p)); expect(s + b).toBe(sum); expect(s * k).toBe(b); }
    for (const p of deal(ALG, 'candles')) { const k = keyText(p); expect(k).toMatch(/^s \+ l ≥ \d+ and [\d.]+s \+ [\d.]+l ≤ \d+$/); }
    for (const p of deal(ALG, 'shirts')) { const [n, total, cf, cp] = nums(promptOf(p)); const f = Number(p.answer); expect(cf * f + cp * (n - f)).toBe(total); }
  });
  test('exponents: every rule re-applied, every model and dollar amount recomputed', () => {
    for (const p of deal(ALG, 'productRule')) { const t = plain(promptOf(p)); const [b, m, , n] = t.match(/\d+/g).map(Number); expect(keyText(p)).toBe(`${b}^${m + n}`); }
    for (const p of deal(ALG, 'powerRule')) { const m = plain(promptOf(p)).match(/^\((\d+)([a-z])\^(\d+)\)\^(\d+)$/); expect(keyText(p)).toBe(`${(+m[1]) ** +m[4]}${m[2]}^${+m[3] * +m[4]}`); }
    for (const p of deal(ALG, 'quotientRule')) { const exps = (s) => ['x', 'y', 'z'].map((v) => { const m = s.match(new RegExp(`${v}(?:\\^(\\d+))?`)); return m[1] ? +m[1] : 1; }); const [top, bottom] = plain(promptOf(p)).split(' ÷ '); const [a, b, c] = exps(top); const [d, e, f] = exps(bottom); const show = (x) => (x === 1 ? '' : `^${x}`); expect(keyText(p)).toBe(`x${show(a - d)}y${show(b - e)}z${show(c - f)}`); }
    for (const p of deal(ALG, 'negativeExp')) { const m = plain(promptOf(p)).match(/^(\d+)([a-z])\^-(\d+)$/); expect(keyText(p)).toBe(`${m[1]}/${m[2]}^${m[3]}`); }
    for (const p of deal(ALG, 'decayModel')) { const t = promptOf(p); const [rate, p0] = nums(t); const f = /increases/.test(t) ? 1 + rate / 100 : 1 - rate / 100; expect(keyText(p)).toBe(`P = ${p0}(${+f.toFixed(4)})^n`); }
    for (const p of deal(ALG, 'compound')) { const t = promptOf(p).replace(/,/g, ''); const [P, r, n] = nums(t.replace(/A = P\(1 \+ r\)\^n:/, '')); const A = P * (1 + r / 100) ** n; expect(Number(keyText(p).replace(/[$,]/g, ''))).toBe(Math.round(A)); }
    for (const p of deal(ALG, 'growthOrDecay')) { const m = plain(promptOf(p)).match(/^y = (\d+)\(([\d/]+)\)\^x$/); const b = m[2].includes('/') ? +m[2].split('/')[0] / +m[2].split('/')[1] : +m[2]; expect(keyText(p)).toBe(`${b > 1 ? 'growth' : 'decay'}, factor ${m[2]}`); }
    for (const p of deal(ALG, 'tableValue')) { const [x] = nums(p.head); const [a, b] = nums(promptOf(p)); expect(Number(p.answer)).toBe(a * b ** x); }
  });
  test('polynomials: sums re-added, products re-expanded, every factored key multiplied back', () => {
    for (const p of deal(ALG, 'addSub')) {
      const t = promptOf(p); const v = t.match(/[a-z]/)[0]; const [A, B] = t.match(/\(([^)]*)\)/g).map((s) => polyOf(s.slice(1, -1), v)); const sub = / - \(/.test(t);
      expect(polyOf(keyText(p), v)).toEqual(A.map((c, i) => c + (sub ? -B[i] : B[i])));
    }
    for (const p of deal(ALG, 'foil')) { const t = promptOf(p); const v = t.match(/[a-z]/)[0]; expect(polyOf(keyText(p), v)).toEqual(expandFactors(t)); }
    for (const id of ['factorTrinomial', 'factorA', 'gcfFirst', 'diffSquares']) for (const p of deal(ALG, id)) {
      const t = promptOf(p); const v = t.match(/[a-z]/)[0]; const k = keyText(p); const expanded = k.includes('^2') ? null : expandFactors(k);
      expect(expanded).toEqual(polyOf(t, v));
      if (id === 'gcfFirst') expect(k).toMatch(/^\d+\(/); if (id === 'factorA') expect(k).toMatch(/^\(\d+[a-z]/);
    }
  });
  test('quadratics: every root satisfies the printed equation; translations and vertices read back', () => {
    for (const p of deal(ALG, 'zeroProduct')) { const q = expandFactors(promptOf(p).replace(/ = 0$/, '')); for (const r of rootsOf(keyText(p))) expect(evalQ(q, r)).toBe(0); }
    for (const p of deal(ALG, 'juan')) { const rs = rootsOf(askOf(p)); const [lhs, rhs] = plain(keyText(p)).split(' = '); const q = quadOf(lhs); for (const r of rs) expect(evalQ(q, r)).toBe(+rhs); }
    for (const p of deal(ALG, 'translation')) { const m = plain(promptOf(p)).match(/\(x ([+-]) (\d+)\)\^2 ([+-]) (\d+)/); expect(keyText(p)).toBe(`${m[2]} units ${m[1] === '-' ? 'right' : 'left'} and ${m[4]} units ${m[3] === '+' ? 'up' : 'down'}`); }
    for (const p of deal(ALG, 'zerosOf')) { const q = quadOf(promptOf(p).replace(/^g\(x\) = /, '')); const rs = rootsOf(keyText(p)); expect(rs.length).toBe(2); for (const r of rs) expect(evalQ(q, r)).toBe(0); }
    for (const p of deal(ALG, 'vertexForm')) { const m = plain(promptOf(p)).match(/\(x ([+-]) (\d+)\)\^2 ([+-]) (\d+)/); expect(nums(keyText(p))).toEqual([(m[1] === '-' ? 1 : -1) * +m[2], (m[3] === '-' ? -1 : 1) * +m[4]]); }
    for (const p of deal(ALG, 'arrowGround')) { const [h0, v] = nums(promptOf(p)); const t = Number(p.answer); expect(-16 * t * t + v * t + h0).toBe(0); expect(t).toBeGreaterThan(0); }
    for (const p of deal(ALG, 'solveQuad')) {
      const t = plain(promptOf(p)); const [lhs, rhs] = t.split(' = '); const q = quadOf(lhs); const rs = rootsOf(keyText(p)); expect(rs.length).toBe(2);
      for (const r of rs) expect(evalQ(q, r)).toBe(+rhs);
    }
  });
  test('radicals and stats: simplest form, rationalized, like radicals added, products simplified', () => {
    for (const p of deal(ALG, 'simplifyRadical')) { const [n] = nums(promptOf(p)); const m = keyText(p).match(/^(\d*)√(\d+)$/); expect((+m[1] || 1) ** 2 * +m[2]).toBe(n); expect(squareFree(+m[2])).toBe(true); }
    for (const p of deal(ALG, 'rationalize')) { const [a, b] = nums(promptOf(p)); const k = keyText(p); expect(k).not.toMatch(/\/√/); expect(Math.abs(radVal(k) - a / Math.sqrt(b))).toBeLessThan(1e-9); }
    for (const p of deal(ALG, 'addRadicals')) { const [a, m, b] = nums(promptOf(p)); const sign = / - /.test(promptOf(p)) ? -1 : 1; const k = keyText(p).match(/^(\d*)√(\d+)$/); expect(+k[2]).toBe(m); expect(+k[1] || 1).toBe(a + sign * b); }
    for (const p of deal(ALG, 'multiplyRadicals')) { const [a, b] = nums(promptOf(p)); const k = keyText(p); const m = k.match(/^(\d*)√(\d+)$/); if (m) { expect((+m[1] || 1) ** 2 * +m[2]).toBe(a * b); expect(squareFree(+m[2])).toBe(true); } else expect((+k) ** 2).toBe(a * b); }
    for (const p of deal(ALG, 'bestMeasure')) expect(keyText(p)).toBe('median');
  });
});
