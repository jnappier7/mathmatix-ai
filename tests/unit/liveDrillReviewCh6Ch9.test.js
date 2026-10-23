/**
 * Chapter Review drills, third pair: Honors Geometry Ch. 6 (relationships within triangles) and
 * Alg 1 Module 9 (exponential functions and sequences). Same contract as the other review suites:
 * well formed, registered, reachable — and every computational template RE-SOLVED from its own
 * question text, with the theorems typed from the study sheet and the concurrency guide.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch9');
const GEO = require('../../utils/liveDrill/review/hgeoCh6');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<sub>/g, '_').replace(/<\/sub>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 999 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const nums = (s) => (plain(s).replace(/,(\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
/** "3x + 6" / "x - 4" / "2x" → [a, b] */
function lin(s) { const m = s.match(/(\d*)x(?: ([+-]) (\d+))?/); return [m[1] === '' ? 1 : +m[1], m[2] ? (m[2] === '-' ? -1 : 1) * +m[3] : 0]; }

describe.each([['alg1m9', ALG], ['hgeo6', GEO]])('%s: every play is well formed', (drill, bank) => {
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

// ---------------------------------------------------------------- Geometry Ch. 6

describe('Geometry Ch. 6 — re-solved from the question text', () => {
  test('equidistance (perpendicular bisector, angle bisector, circumcenter, incenter): the two expressions are equal at x', () => {
    for (const id of ['pbEquidistant', 'abDistance']) for (const p of deal(GEO, id)) {
      const [e1, e2] = promptOf(p).match(/\d*x(?: [+-] \d+)?/g).map(lin); const x = Number(p.answer);
      expect(e1[0] * x + e1[1]).toBe(e2[0] * x + e2[1]);
    }
    for (const p of deal(GEO, 'centerEquidistant')) {
      const [e1, e2] = promptOf(p).match(/\d*x(?: [+-] \d+)?/g).map(lin);
      const x = (e2[1] - e1[1]) / (e1[0] - e2[0]); expect(Number.isInteger(x)).toBe(true);
      expect(Number(p.answer)).toBe(e1[0] * x + e1[1]); // the common distance
    }
    for (const p of deal(GEO, 'abAngle')) {
      const t = promptOf(p); const exprs = t.match(/\d*x(?: [+-] \d+)?/g);
      if (exprs) { const [e1, e2] = exprs.map(lin); const x = Number(p.answer); expect(e1[0] * x + e1[1]).toBe(e2[0] * x + e2[1]); } else expect(Number(p.answer) * 2).toBe(nums(t)[0]);
    }
  });
  test('perpendicular bisector length: a right triangle at the midpoint', () => {
    for (const p of deal(GEO, 'pbLength')) { const [hyp, half] = nums(promptOf(p)); expect(Number(p.answer) ** 2 + half * half).toBe(hyp * hyp); }
  });
  test('the perpendicular bisector equation: perpendicular slope, through the midpoint', () => {
    for (const p of deal(GEO, 'pbEquation')) {
      const [[x1, y1], [x2, y2]] = promptOf(p).match(/\((-?\d+), (-?\d+)\)/g).map((s) => s.match(/-?\d+/g).map(Number));
      const m = keyText(p).match(/^y = (-?\d*)x(?: ([+-]) (\d+))?$/); const slope = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; const b = m[2] ? (m[2] === '-' ? -1 : 1) * +m[3] : 0;
      expect(slope * ((y2 - y1) / (x2 - x1))).toBe(-1);
      expect(slope * ((x1 + x2) / 2) + b).toBe((y1 + y2) / 2);
    }
  });
  test('the four centers: made from, property, and where they land, per the reference guide', () => {
    for (const p of deal(GEO, 'whichCenter')) {
      const t = promptOf(p).toLowerCase(); const k = keyText(p);
      if (/perpendicular bisectors|vertices|three towns|through all three/.test(t)) expect(k).toBe('circumcenter');
      if (/angle bisectors|sides —|walls|fits inside/.test(t)) expect(k).toBe('incenter');
      if (/medians|balance/.test(t)) expect(k).toBe('centroid');
      if (/altitudes/.test(t)) expect(k).toBe('orthocenter');
    }
    for (const p of deal(GEO, 'centerLands')) {
      const c = plain(p.head).match(/the (\w+)\?/)[1]; const kind = promptOf(p).match(/(acute|right|obtuse)/)[1]; const k = keyText(p);
      if (kind === 'acute') expect(k).toBe('inside');
      if (kind === 'obtuse') expect(k).toBe('outside');
      if (kind === 'right') expect(k).toBe(c === 'circumcenter' ? 'ON the triangle — the midpoint of the hypotenuse' : 'AT the right-angle vertex');
    }
  });
  test('centroid: 2 : 1 from the vertex; coordinates are the averages; the right triangle\'s circumcenter', () => {
    for (const p of deal(GEO, 'centroidRatio')) {
      const t = promptOf(p); const ans = Number(p.answer); const head = plain(p.head);
      if (/Find x/.test(head)) { const [e1, e2] = t.match(/\d*x(?: [+-] \d+)?/g).map(lin); expect(e1[0] * ans + e1[1]).toBe(2 * (e2[0] * ans + e2[1])); }
      else {
        const given = nums(t).slice(-1)[0]; const seg = head.match(/Find (\w+)/)[1]; const vertexToCentroid = t.match(/(\w+) = \d+\.?$/)[1];
        const parts = { }; parts[vertexToCentroid] = given;
        // which piece was given: AP (vertex–centroid), PX (centroid–midpoint) or AX (whole)?
        const names = t.match(/is the centroid of a triangle and (\w+) is a median|is the centroid and (\w+) is a median/); const median = names[1] || names[2];
        const P = t.match(/^(\w) is the centroid/)[1]; const [A, X] = [median[0], median[1]];
        const kind = (s) => (s === A + P ? 'AP' : s === P + X ? 'PX' : 'AX');
        const g = kind(vertexToCentroid); const want = kind(seg);
        const px = g === 'AP' ? given / 2 : g === 'PX' ? given : given / 3;
        expect(ans).toBe(want === 'AP' ? 2 * px : want === 'PX' ? px : 3 * px);
      }
    }
    for (const p of deal(GEO, 'centroidCoords')) {
      const pts = promptOf(p).match(/\((-?\d+), (-?\d+)\)/g).map((s) => s.match(/-?\d+/g).map(Number));
      const [cx, cy] = keyText(p).match(/-?\d+/g).map(Number);
      expect(cx * 3).toBe(pts[0][0] + pts[1][0] + pts[2][0]); expect(cy * 3).toBe(pts[0][1] + pts[1][1] + pts[2][1]);
    }
    for (const p of deal(GEO, 'rightCircumcenter')) {
      const [, b, a] = nums(promptOf(p).replace(/\(0, 0\)/, '')).length >= 2 ? [0, ...nums(promptOf(p)).filter((n) => n !== 0)] : [0, 0, 0];
      if (p.input === 'number') expect((2 * Number(p.answer)) ** 2).toBe(a * a + b * b);
      else { const [cx, cy] = keyText(p).match(/-?\d+/g).map(Number); expect([cx, cy]).toEqual([a / 2, b / 2]); }
    }
  });
  test('midsegments: half the third side; half the perimeter', () => {
    for (const p of deal(GEO, 'midsegment')) {
      const t = promptOf(p); const exprs = t.match(/\d*x(?: [+-] \d+)?/g);
      if (exprs) { const [de, ab] = exprs.map(lin); const x = Number(p.answer); expect(ab[0] * x + ab[1]).toBe(2 * (de[0] * x + de[1])); } else expect(Number(p.answer) * 2).toBe(nums(t)[0]);
    }
    for (const p of deal(GEO, 'midPerimeter')) { const [v] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/midsegment triangle of/.test(promptOf(p)) ? 2 * v : v / 2); }
  });
  test('inequalities: bigger side ↔ bigger angle; the triangle inequality; the third-side range', () => {
    for (const p of deal(GEO, 'orderAngles')) {
      const t = promptOf(p); const tri = t.match(/△(\w)(\w)(\w)/).slice(1); const sides = {};
      for (const m of t.matchAll(/(\w)(\w) = (\d+)/g)) sides[m[1] + m[2]] = +m[3];
      const opp = (v) => { const others = tri.filter((w) => w !== v); return sides[others.join('')] ?? sides[others.reverse().join('')]; };
      const want = [...tri].sort((u, v) => opp(u) - opp(v)).map((v) => `∠${v}`).join(', ');
      expect(keyText(p)).toBe(want);
    }
    for (const p of deal(GEO, 'orderSides')) {
      const t = promptOf(p); const tri = t.match(/△(\w)(\w)(\w)/).slice(1); const angles = {};
      for (const m of t.matchAll(/m∠(\w) = (\d+)°/g)) angles[m[1]] = +m[2];
      const sideOpp = (v) => tri.filter((w) => w !== v).join('');
      const want = [...tri].sort((u, v) => angles[u] - angles[v]).map(sideOpp);
      const got = keyText(p).split(', ');
      got.forEach((s, i) => expect([s, s[1] + s[0]]).toContain(want[i]));
    }
    for (const p of deal(GEO, 'canTriangle')) { const [a, b, c] = nums(promptOf(p)); expect(keyText(p).startsWith('Yes')).toBe(a + b > c && a + c > b && b + c > a); }
    for (const p of deal(GEO, 'thirdRange')) { const [a, b] = nums(promptOf(p)); expect(keyText(p)).toBe(`${Math.abs(a - b)} < x < ${a + b}`); }
  });
});

// ---------------------------------------------------------------- Algebra Module 9

describe('Algebra Module 9 — re-solved from the question text', () => {
  test('evaluate a · bˣ', () => {
    for (const p of deal(ALG, 'evaluate')) { const [a, b] = nums(promptOf(p)); const x = nums(p.head)[0]; expect(Number(p.answer)).toBeCloseTo(a * b ** x, 9); }
  });
  test('growth or decay and the rate, from the factor; the model from the story; interpretation', () => {
    for (const p of deal(ALG, 'growthOrDecay')) { const f = nums(promptOf(p))[1]; expect(keyText(p)).toBe(`${f > 1 ? 'growth' : 'decay'} — ${Math.round(Math.abs(1 - f) * 100)}% rate`); }
    for (const p of deal(ALG, 'writeModel')) {
      const t = promptOf(p); const r = nums(t.match(/(\d+)% per/)[0])[0]; const grows = /grows/.test(t); const k = keyText(p);
      const f = nums(k)[1]; expect(f).toBeCloseTo(grows ? 1 + r / 100 : 1 - r / 100, 9); expect(k).toMatch(/\^[xt]$/);
    }
    for (const p of deal(ALG, 'interpret')) { const [a, f] = nums(promptOf(p)); expect(keyText(p)).toBe(`initial value ${a}; factor ${f}, so it ${f > 1 ? 'grows' : 'shrinks'} ${Math.round(Math.abs(1 - f) * 100)}% each period`); }
  });
  test('predictions and compounding', () => {
    for (const p of deal(ALG, 'predictInteger')) {
      const t = promptOf(p); const a = nums(t)[0]; const n = nums(p.head)[0];
      const b = /QUADRUPLES/.test(t) ? 4 : /TRIPLES/.test(t) ? 3 : /DOUBLES/.test(t) ? 2 : /HALF/.test(t) ? 1 / 2 : 1 / 3;
      expect(Number(p.answer)).toBeCloseTo(a * b ** n, 9);
    }
    for (const p of deal(ALG, 'untilAtLeast')) { const [a, b] = nums(promptOf(p)); const target = nums(p.head)[0]; const n = Number(p.answer); expect(a * b ** n).toBeGreaterThanOrEqual(target); expect(a * b ** (n - 1)).toBeLessThan(target); }
    for (const p of deal(ALG, 'compoundError')) { const [a, r, n] = nums(promptOf(p)); expect(Number(p.answer)).toBeCloseTo(a * (1 + r / 100) ** n, 6); }
    for (const p of deal(ALG, 'compoundExpr')) {
      const t = promptOf(p); const [P, r, t2] = nums(t); const k = keyText(p);
      const periods = /quarterly/.test(t) ? 4 : /monthly/.test(t) ? 12 : /semiannually/.test(t) ? 2 : 1;
      if (periods === 1) expect(k).toBe(`${P}(${Math.round((1 + r / 100) * 10000) / 10000})^${t2}`);
      else expect(k).toBe(`${P}(1 + ${r / 100}/${periods})^${periods} · ${t2}`);
    }
  });
  test('writing from two points and from a table; sequences', () => {
    for (const p of deal(ALG, 'twoPoints')) {
      const [[x1, y1], [x2, y2]] = promptOf(p).match(/\((\d+), (\d+)\)/g).map((s) => s.match(/\d+/g).map(Number)); const [a, b] = nums(keyText(p));
      expect(a * b ** x1).toBe(y1); expect(a * b ** x2).toBe(y2);
    }
    for (const p of deal(ALG, 'tableRule')) {
      const ys = nums(promptOf(p).split('y:')[1]); const k = keyText(p);
      const geometric = ys[1] / ys[0] === ys[2] / ys[1] && ys[1] - ys[0] !== ys[2] - ys[1];
      expect(k.startsWith(geometric ? 'exponential' : 'linear')).toBe(true);
      if (geometric) { const [a, b] = nums(k); expect([a, a * b, a * b * b, a * b ** 3]).toEqual(ys); }
      else { const m = k.match(/y = (-?\d*)x \+ (\d+)/); const d = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; const a = +m[2]; expect([a, a + d, a + 2 * d, a + 3 * d]).toEqual(ys); }
    }
    for (const p of deal(ALG, 'isGeometric')) {
      const t = nums(promptOf(p)); const geo = t[1] / t[0] === t[2] / t[1] && t[2] / t[1] === t[3] / t[2];
      expect(keyText(p).startsWith(geo ? 'yes' : 'no')).toBe(true);
    }
    for (const p of deal(ALG, 'nextTerm')) { const t = nums(promptOf(p)); expect(Number(p.answer)).toBe(t[3] * (t[1] / t[0])); }
    for (const p of deal(ALG, 'commonRatio')) { const t = nums(promptOf(p)); const k = keyText(p); const r = k.includes('/') ? (k.startsWith('-') ? -1 : 1) / nums(k).slice(-1)[0] : Number(k); expect(t[0] * r).toBeCloseTo(t[1], 9); expect(t[1] * r).toBeCloseTo(t[2], 9); }
    for (const p of deal(ALG, 'nthTerm')) { const t = nums(promptOf(p)); const n = nums(p.head)[0]; expect(Number(p.answer)).toBeCloseTo(t[0] * (t[1] / t[0]) ** (n - 1), 6); }
    for (const p of deal(ALG, 'explicit')) { const t = nums(promptOf(p)); const [a, r] = nums(keyText(p)); expect(a).toBe(t[0]); expect(r).toBe(t[1] / t[0]); expect(keyText(p)).toMatch(/\^n - 1$/); }
    for (const p of deal(ALG, 'arithOrGeo')) { const t = nums(promptOf(p)); const geo = t[1] / t[0] === t[2] / t[1]; expect(keyText(p).startsWith(geo ? 'geometric' : 'arithmetic')).toBe(true); }
  });
});
