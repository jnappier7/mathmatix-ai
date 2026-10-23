/**
 * Chapter Review drills, second pair: Honors Geometry Ch. 5 (congruent triangles) and Alg 1
 * Module 8 (exponents and radicals). Same contract as liveDrillReview.test.js: well formed,
 * registered, reachable — and every computational template RE-SOLVED from its own question text.
 * The exponent rules and the triangle theorems here are the notes', not the bank's.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch8');
const GEO = require('../../utils/liveDrill/review/hgeoCh5');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 777 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const nums = (s) => (plain(s).match(/-?\d+/g) || []).map(Number);

describe.each([['alg1m8', ALG], ['hgeo5', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id);
      expect(p.card).toBeTruthy();
      expect(p.tell).toBeTruthy();
      expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') {
        expect(Number.isInteger(Number(p.answer))).toBe(true);
        if (Number(p.answer) < 0) expect(p.neg).toBe(true);
      } else {
        expect(p.choices.length).toBeGreaterThanOrEqual(2);
        expect(p.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length);
        expect(p.choices.map((c) => c.k)).toContain(p.answer);
        expect(p.card).not.toContain('posed-ans');
        expect(p.card).not.toContain('q ok');
      }
    }
  });
  test('registered as a standard-scoring native drill, on its hub, reachable from Whole Chapter', () => {
    expect(DRILLS[drill].native).toBe(bank);
    expect(DRILLS[drill].scoring).toBeUndefined();
    expect(Object.values(solo.HUBS).some((h) => h.games.some((g) => g.drill === drill))).toBe(true);
    const seen = new Set();
    for (let n = 1; n <= 500; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

// ---------------------------------------------------------------- Geometry Ch. 5

/** "(3x + 6)" / "3x - 6" / "(2x)" → [a, b] of ax + b. */
function lin(s) {
  const m = s.match(/\(?(\d*)x(?: ([+-]) (\d+))?\)?/);
  return [m[1] === '' ? 1 : +m[1], m[2] ? (m[2] === '-' ? -1 : 1) * +m[3] : 0];
}
describe('Geometry Ch. 5 — re-solved from the question text', () => {
  test('third angle, Third Angles Theorem: 180 minus the two given', () => {
    for (const p of deal(GEO, 'thirdAngle')) { const [a, b] = nums(promptOf(p)); expect(Number(p.answer)).toBe(180 - a - b); }
    for (const p of deal(GEO, 'thirdAngles')) { const [a, b] = nums(promptOf(p)).slice(-2); expect(Number(p.answer)).toBe(180 - a - b); }
  });
  test('x from three angle expressions summing to 180; right triangle: two summing to 90', () => {
    for (const p of deal(GEO, 'triSumAlg')) {
      const parts = promptOf(p).match(/\([^)]*\)°/g).map(lin);
      const A = parts.reduce((t, [a]) => t + a, 0); const B = parts.reduce((t, [, b]) => t + b, 0);
      expect(A * Number(p.answer) + B).toBe(180);
      for (const [a, b] of parts) expect(a * Number(p.answer) + b).toBeGreaterThan(0);
    }
    for (const p of deal(GEO, 'rightAcute')) {
      const parts = promptOf(p).match(/\([^)]*\)°/g).map(lin);
      expect(parts.reduce((t, [a, b]) => t + a * Number(p.answer) + b, 0)).toBe(90);
    }
  });
  test('exterior angle = sum of the remote interior angles', () => {
    for (const p of deal(GEO, 'exterior')) {
      const [a, b] = nums(promptOf(p));
      if (/other remote/.test(p.head)) expect(Number(p.answer)).toBe(a - b); else expect(Number(p.answer)).toBe(a + b);
    }
  });
  test('classify: from the sides and angles as printed', () => {
    for (const p of deal(GEO, 'classify')) {
      const t = promptOf(p); const sides = t.match(/sides ([^;]+);/)[1].split(', '); const angles = nums(t.split(';')[1]);
      const bySide = new Set(sides).size === 1 ? 'equilateral' : new Set(sides).size === 2 ? 'isosceles' : 'scalene';
      const byAngle = angles.every((a) => a === 60) ? 'equiangular' : angles.includes(90) ? 'right' : angles.some((a) => a > 90) ? 'obtuse' : 'acute';
      expect(keyText(p)).toBe(`${bySide} and ${byAngle}`);
    }
  });
  test('corresponding parts follow the letter order; the solve uses the same positions', () => {
    const tris = (s) => plain(s).match(/△([A-Z]{3})/g).map((t) => t.slice(1));
    for (const p of deal(GEO, 'corresponds')) {
      const [t1, t2] = tris(promptOf(p)); const key = keyText(p);
      const m = plain(p.head).match(/(?:side|angle) corresponds to ∠?([A-Z]{1,2})\?/); const part = m[1];
      const expected = [...part].map((ch) => t2[t1.indexOf(ch)]).join('');
      expect(key.replace('∠', '')).toBe(expected);
    }
    for (const p of deal(GEO, 'congrSolve')) {
      const t = promptOf(p); const [t1, t2] = tris(t);
      const m = t.match(/(?:m∠)?([A-Z]{1,2}) = (\(?[^,]*?)\)?°?, and (?:m∠)?([A-Z]{1,2}) = (\d+)/);
      expect([...m[1]].map((ch) => t2[t1.indexOf(ch)]).join('')).toBe(m[3]); // same positions
      const [a, b] = lin(m[2]); expect(a * Number(p.answer) + b).toBe(+m[4]);
    }
    for (const p of deal(GEO, 'restate')) {
      const [t1, t2] = tris(promptOf(p)); const [k1, k2] = tris(keyText(p));
      for (let i = 0; i < 3; i++) expect(t2[t1.indexOf(k1[i])]).toBe(k2[i]);
      for (const c of p.choices) if (c.k !== p.answer) { const [w1, w2] = tris(c.html); expect([0, 1, 2].every((i) => t2[t1.indexOf(w1[i])] === w2[i])).toBe(false); }
    }
  });
  test('the decision guide: SSS/SAS/ASA/AAS/HL/NONE by the parts named', () => {
    for (const p of deal(GEO, 'criterion')) {
      const t = promptOf(p).toLowerCase(); const k = keyText(p);
      if (t.startsWith('three pairs of congruent sides')) expect(k).toBe('SSS');
      if (t.includes('sides and the pair of congruent angles between')) expect(k).toBe('SAS');
      if (t.includes('angles and the pair of congruent sides between')) expect(k).toBe('ASA');
      if (t.includes('angles and a pair of congruent sides not between')) expect(k).toBe('AAS');
      if (t.includes('sides and a pair of congruent angles not between') || t.startsWith('all three pairs of congruent angles') || t.startsWith('two pairs of congruent angles only')) expect(k).toBe('NONE');
      if (t.includes('hypotenuses')) expect(k).toBe('HL');
    }
  });
  test('isosceles: base angles from the vertex angle and back; x from congruent parts; 60° for equilateral', () => {
    for (const p of deal(GEO, 'baseAngles')) { const [v] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/vertex angle of/.test(promptOf(p)) ? (180 - v) / 2 : 180 - 2 * v); }
    for (const p of deal(GEO, 'baseAlg')) {
      const parts = (promptOf(p).match(/\(?\d*x(?: [+-] \d+)?\)?°?/g) || []).map(lin);
      const x = Number(p.answer); expect(parts[0][0] * x + parts[0][1]).toBe(parts[1][0] * x + parts[1][1]);
    }
    for (const p of deal(GEO, 'equilateral')) { const [a, b] = lin(promptOf(p)); expect(a * Number(p.answer) + b).toBe(60); }
  });
  test('proof steps: CPCTC only after a congruence line, Reflexive only on a shared part, never a bare Given', () => {
    for (const p of deal(GEO, 'proofStep')) {
      const k = keyText(p);
      expect(k).not.toBe('Given');
      const spaced = plain(p.card.replace(/<\/t[dr]>/g, ' ')); // cells apart
      const current = plain((p.card.match(/<tr class="now">([\s\S]*?)<\/tr>/) || [])[1].replace(/<\/td>/g, ' '));
      if (k === 'CPCTC') { expect(current).not.toMatch(/△/); expect(spaced).toMatch(/△\w+ ≅ △\w+\s+(SSS|SAS|ASA|AAS|HL) Congruence Theorem/); }
      if (k === 'Reflexive Property of Congruence') { const m = current.match(/(\w+) ≅ (\w+)/); expect(m[1]).toBe(m[2]); }
      if (/Congruence Theorem/.test(k)) expect(current).toMatch(/△\w+ ≅ △\w+/);
    }
  });
});

// ---------------------------------------------------------------- Algebra Module 8

/** "-4m^3" / "m^3" / "6" → { c, e } for c·v^e (e = 0 when no variable). */
function monoOf(s) {
  const m = s.replace(/\s/g, '').match(/^(-?\d*)([a-z])?(?:\^(\d+))?$/);
  const c = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1];
  return { c, v: m[2] || null, e: m[2] ? (m[3] ? +m[3] : 1) : 0 };
}
/** numeric value of "a√b", "a√b/c", "a/b", "√b", "a" */
function radVal(s) {
  const t = s.replace(/\s/g, '');
  const m = t.match(/^(\d*)(?:√(\d+))?(?:\/(\d+))?$/);
  if (!m) return NaN;
  return ((m[1] === '' ? 1 : +m[1]) * (m[2] ? Math.sqrt(+m[2]) : 1)) / (m[3] ? +m[3] : 1);
}
const squareFree = (n) => { for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false; return true; };

describe('Algebra Module 8 — re-solved from the question text', () => {
  test('product rule: add exponents, multiply coefficients', () => {
    for (const p of deal(ALG, 'product')) {
      const [a, b] = promptOf(p).match(/\(([^)]+)\)/g).map((s) => monoOf(s.slice(1, -1))); const k = monoOf(keyText(p));
      expect(k).toEqual({ c: a.c * b.c, v: a.v, e: a.e + b.e });
    }
  });
  test('power of a power: multiply; power of a product / quotient: every factor', () => {
    for (const p of deal(ALG, 'powerPower')) {
      const m = promptOf(p).match(/\(([a-z])\^(\d+)\)\^(\d+)/); expect(monoOf(keyText(p))).toEqual({ c: 1, v: m[1], e: +m[2] * +m[3] });
    }
    for (const p of deal(ALG, 'powerProduct')) {
      const m = promptOf(p).match(/\((-?\d+)([a-z])\^(\d+)([a-z])(?:\^(\d+))?\)\^(\d+)/);
      const r = +m[6]; const want = `${(+m[1]) ** r}${m[2]}^${+m[3] * r}${m[4]}^${(m[5] ? +m[5] : 1) * r}`.replace(/\^1(?![0-9])/g, '');
      expect(keyText(p).replace(/\s/g, '')).toBe(want);
    }
    for (const p of deal(ALG, 'powerQuotient')) {
      const m = promptOf(p).match(/\((\d+)([a-z])(?:\^(\d+))?\/([a-z])(?:\^(\d+))?\)\^(\d+)/);
      const r = +m[6]; const want = `${(+m[1]) ** r}${m[2]}^${(m[3] ? +m[3] : 1) * r}/${m[4]}^${(m[5] ? +m[5] : 1) * r}`.replace(/\^1(?![0-9])/g, '');
      expect(keyText(p).replace(/\s/g, '')).toBe(want);
    }
  });
  test('quotient rule: subtract exponents, divide coefficients', () => {
    for (const p of deal(ALG, 'quotient')) {
      const [a, b] = promptOf(p).split(' / ').map(monoOf); expect(monoOf(keyText(p))).toEqual({ c: a.c / b.c, v: a.v, e: a.e - b.e });
    }
  });
  test('zero and negative exponents', () => {
    for (const p of deal(ALG, 'zero')) {
      const t = promptOf(p); const k = keyText(p);
      if (/^\(.*\)\^0$/.test(t)) expect(k).toBe('1'); else expect(k).toBe(String(nums(t)[0]));
    }
    for (const p of deal(ALG, 'negative')) {
      const t = promptOf(p); const k = keyText(p); const e = nums(t).slice(-1)[0];
      const val = (s, x) => { // evaluate c·v^±e, c/v^e, 1/v^e, v^e at v = x
        if (/^1\/[a-z]\^-?\d+$/.test(s)) return 1 / x ** nums(s)[1];
        if (/^(\d+)\/[a-z]\^\d+$/.test(s)) return nums(s)[0] / x ** nums(s)[1];
        if (/^-?\d*[a-z]\^-?\d+$/.test(s)) { const m = monoOf(s.replace(/\^-(\d+)/, '^$1')); return m.c * x ** (s.includes('^-') ? -m.e : m.e); }
        return NaN;
      };
      expect(k).not.toMatch(/\^-/);
      expect(val(k, 2)).toBeCloseTo(val(t, 2), 10);
      expect(Math.abs(e)).toBeGreaterThan(0);
    }
  });
  test('rational exponents: root in the denominator, power in the numerator; evaluations', () => {
    for (const p of deal(ALG, 'rationalForm')) {
      const t = promptOf(p); const k = keyText(p);
      const exp = /\^\d\/\d/.test(t) ? t : k; const radical = exp === t ? k : t;
      const [, m, n] = exp.match(/\^(\d)\/(\d)/);
      const idx = radical.startsWith('√') ? 2 : radical.startsWith('∛') ? 3 : radical.startsWith('∜') ? 4 : +radical.match(/^\^(\d)√/)[1];
      expect(idx).toBe(+n);
      const inner = radical.replace(/^(\^\d)?[√∛∜]/, '');
      expect(/\^(\d+)\)?$/.test(inner) ? +inner.match(/\^(\d+)\)?$/)[1] : 1).toBe(+m);
    }
    for (const p of deal(ALG, 'evalRational')) {
      const [b, m, n] = nums(promptOf(p)); expect(Number(p.answer) ** n).toBeCloseTo(b ** m, 6);
    }
  });
  test('simplifying roots: a√b with b square-free and a²b the radicand; variables halve the exponent', () => {
    for (const p of deal(ALG, 'simplifyRoot')) { const n = nums(promptOf(p))[0]; const [a, b] = nums(keyText(p)); expect(a * a * b).toBe(n); expect(squareFree(b)).toBe(true); }
    for (const p of deal(ALG, 'multiplyRoots')) { const [x, y] = nums(promptOf(p)); const [a, b = 1] = nums(keyText(p)); expect(a * a * b).toBe(x * y); expect(squareFree(b)).toBe(true); }
    for (const p of deal(ALG, 'rootVar')) { const [C, E] = nums(promptOf(p)); const k = monoOf(keyText(p)); expect(k.c * k.c).toBe(C); expect(2 * k.e).toBe(E); }
  });
  test('operations: numeric equality, and the key is in simplest form', () => {
    const sumVal = (s) => s.split(/ (?=[+-] )/).reduce((t, term) => { const neg = term.startsWith('- '); return t + (neg ? -1 : 1) * radVal(term.replace(/^[+-] /, '')); }, 0);
    for (const id of ['addLike', 'addUnlike']) for (const p of deal(ALG, id)) {
      expect(radVal(keyText(p))).toBeCloseTo(sumVal(promptOf(p)), 9);
      const [, b] = nums(keyText(p)).length === 2 ? nums(keyText(p)) : [0, nums(keyText(p))[0]]; expect(squareFree(b)).toBe(true);
    }
    for (const p of deal(ALG, 'multiplyCoef')) {
      const [a, b] = promptOf(p).split(' · ').map(radVal); expect(radVal(keyText(p))).toBeCloseTo(a * b, 9);
      expect(squareFree(nums(keyText(p))[1])).toBe(true);
    }
    for (const p of deal(ALG, 'rationalize')) {
      const [c, r] = nums(promptOf(p)); const k = keyText(p);
      expect(radVal(k)).toBeCloseTo(c / Math.sqrt(r), 9);
      expect(k.split('/')[1] || '').not.toMatch(/√/); // no radical left downstairs
      const m = k.match(/^(\d*)√\d+\/(\d+)$/); if (m) { const g = (x, y) => (y ? g(y, x % y) : x); expect(g(m[1] === '' ? 1 : +m[1], +m[2])).toBe(1); } // reduced
    }
    for (const p of deal(ALG, 'rootSum')) { const [a, b] = nums(promptOf(p)); expect(Number(p.answer) ** 2).toBe(a + b); }
  });
  test('equations: the typed or chosen x satisfies the equation as printed', () => {
    for (const p of deal(ALG, 'expEq')) { const [b, rhs] = nums(promptOf(p)); expect(b ** Number(p.answer)).toBe(rhs); }
    for (const p of deal(ALG, 'expEqFrac')) { const [b, r] = nums(promptOf(p)); const [n, d] = keyText(p).split('/').map(Number); expect(b ** (n / d)).toBeCloseTo(r, 6); }
    for (const p of deal(ALG, 'radicalEq')) { const t = promptOf(p); const [c, k] = nums(t); const sign = t.includes('- ') ? -1 : 1; expect(Math.sqrt(Number(p.answer) + sign * c)).toBeCloseTo(k, 9); }
  });
});
