/**
 * Chapter Review drills, fourth pair: Honors Geometry Ch. 7 (quadrilaterals and other polygons)
 * and Alg 1 Module 10 (polynomials and factoring). Same contract as the other review suites —
 * and every polynomial answer is re-derived by expanding or multiplying the printed expressions
 * with a tiny polynomial arithmetic here, never the bank's.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch10');
const GEO = require('../../utils/liveDrill/review/hgeoCh7');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 2468 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const nums = (s) => (plain(s).match(/-?\d+/g) || []).map(Number);
function lin(s) { const m = s.match(/(\d*)[xt](?: ([+-]) (\d+))?/); return [m[1] === '' ? 1 : +m[1], m[2] ? (m[2] === '-' ? -1 : 1) * +m[3] : 0]; }

// ---- polynomial arithmetic on coefficient arrays (highest degree first), for the re-solves
function parsePoly(s) {
  const t = s.replace(/\s/g, '').replace(/-/g, '+-'); const terms = t.split('+').filter(Boolean); const map = {};
  for (const term of terms) {
    const m = term.match(/^(-?\d*)(x(?:\^(\d+))?)?$/); if (!m) throw new Error(`bad term ${term} in ${s}`);
    const c = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; const e = m[2] ? (m[3] ? +m[3] : 1) : 0; map[e] = (map[e] || 0) + c;
  }
  const deg = Math.max(...Object.keys(map).map(Number)); return Array.from({ length: deg + 1 }, (_, i) => map[deg - i] || 0);
}
const padTo = (a, n) => Array(n - a.length).fill(0).concat(a);
const addP = (a, b) => { const n = Math.max(a.length, b.length); return padTo(a, n).map((x, i) => x + padTo(b, n)[i]); };
const mulP = (a, b) => { const out = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
const trimP = (a) => { let i = 0; while (i < a.length - 1 && a[i] === 0) i++; return a.slice(i); };
/** "(2x - 5)(2x - 3)" / "3x^2(6x^2 - 3x + 5)" / "(2x + 7)^2" / "3(x + 5)(x + 6)" → expanded coefficients */
function expand(s) {
  let t = s.replace(/\s/g, ''); let acc = [1];
  const sq = t.match(/^\((.*)\)\^2$/); if (sq) return mulP(parsePoly(sq[1]), parsePoly(sq[1]));
  while (t.length) {
    let m = t.match(/^\(([^()]*)\)/); if (m) { acc = mulP(acc, parsePoly(m[1])); t = t.slice(m[0].length); continue; }
    m = t.match(/^([^()]+)/); acc = mulP(acc, parsePoly(m[1])); t = t.slice(m[0].length);
  }
  return acc;
}

describe.each([['alg1m10', ALG], ['hgeo7', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id);
      expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else {
        expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length);
        expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans');
      }
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

describe('Geometry Ch. 7 — re-solved from the question text', () => {
  const NAMES = { triangle: 3, quadrilateral: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10, dodecagon: 12 };
  const sidesOf = (t) => { const m = t.match(/(\d+)-gon|(\w+)$/); return m[1] ? +m[1] : NAMES[m[2]]; };
  test('polygon angle formulas', () => {
    for (const p of deal(GEO, 'interiorSum')) expect(Number(p.answer)).toBe((sidesOf(promptOf(p)) - 2) * 180);
    for (const p of deal(GEO, 'regularAngle')) { const n = sidesOf(promptOf(p)); expect(Number(p.answer)).toBe(/exterior/.test(p.head) ? 360 / n : ((n - 2) * 180) / n); }
    for (const p of deal(GEO, 'sidesFrom')) { const v = nums(promptOf(p))[0]; expect(Number(p.answer)).toBe(/exterior/.test(promptOf(p)) ? 360 / v : v / 180 + 2); }
    for (const p of deal(GEO, 'missingAngle')) { const t = promptOf(p); const n = sidesOf(t.match(/convex (\w+) measure/)[1]); const known = nums(t.split('measure')[1]); expect(Number(p.answer)).toBe((n - 2) * 180 - known.reduce((a, b) => a + b, 0)); }
  });
  test('parallelograms: congruent opposite sides, supplementary consecutive angles, bisecting diagonals, the fourth vertex', () => {
    for (const id of ['paraSides', 'conditionSolve', 'isoTrapLegs', 'rectDiagonals', 'paraDiagonals']) for (const p of deal(GEO, id)) {
      const t = promptOf(p); const exprs = t.match(/\d*[xt](?: [+-] \d+)?/g);
      if (exprs && exprs.length === 2 && /Find [xt]/.test(p.head)) { const [e1, e2] = exprs.map(lin); const x = Number(p.answer); expect(e1[0] * x + e1[1]).toBe(e2[0] * x + e2[1]); }
      else if (/^Find \w\w$/.test(plain(p.head))) { const given = nums(t).slice(-1)[0]; expect(Number(p.answer)).toBe(/rectangle/.test(t) ? given / 2 : 2 * given); }
    }
    for (const p of deal(GEO, 'paraAngles')) { const t = promptOf(p); const quad = t.match(/▱(\w{4})/)[1]; const given = t.match(/m∠(\w) = (\d+)/); const asked = plain(p.head).match(/m∠(\w)/)[1];
      const opposite = (quad.indexOf(asked) - quad.indexOf(given[1]) + 4) % 4 === 2; expect(Number(p.answer)).toBe(opposite ? +given[2] : 180 - +given[2]); }
    for (const p of deal(GEO, 'fourthVertex')) {
      const t = promptOf(p); const quad = t.match(/▱(\w{4})/)[1]; const pts = {}; for (const m of t.matchAll(/(\w)\((-?\d+), (-?\d+)\)/g)) pts[m[1]] = [+m[2], +m[3]];
      const missing = plain(p.head).match(/Find (\w)/)[1]; const i = quad.indexOf(missing); const prev = pts[quad[(i + 3) % 4]]; const next = pts[quad[(i + 1) % 4]]; const opp = pts[quad[(i + 2) % 4]];
      expect(nums(keyText(p))).toEqual([prev[0] + next[0] - opp[0], prev[1] + next[1] - opp[1]]);
    }
  });
  test('the conditions, per the study sheet', () => {
    for (const p of deal(GEO, 'condition')) {
      const t = promptOf(p).toLowerCase(); const k = keyText(p);
      const enough = /both pairs of opposite sides are (congruent|parallel)|both pairs of opposite angles|both parallel and congruent|diagonals bisect each other/.test(t);
      expect(k.startsWith('Yes')).toBe(enough);
    }
  });
  test('rhombus, rectangle, square, kite and trapezoid measures', () => {
    for (const p of deal(GEO, 'rhombusAngles')) { const t = promptOf(p); const a = nums(t).slice(-1)[0]; const k = Number(p.answer); const head = plain(p.head); const rh = t.match(/rhombus (\w{4})/)[1]; const asked = head.match(/m∠(\w{3})/)[1];
      if (asked[1] === rh[0] && asked[0] === rh[1] && asked[2] === rh[3]) expect(k).toBe(2 * a); else if (asked[1] === t.match(/meet at (\w)/)[1]) expect(k).toBe(90); else expect(k).toBe(180 - 2 * a); }
    for (const p of deal(GEO, 'squareDiagonals')) { const jx = nums(promptOf(p)).slice(-1)[0]; const head = plain(p.head);
      if (/exact/.test(head)) expect(keyText(p)).toBe(`${jx}√2`); else if (/m∠\w\w\w/.test(head)) expect([45, 90]).toContain(Number(p.answer)); else expect(Number(p.answer)).toBe(2 * jx); }
    for (const p of deal(GEO, 'kiteAngles')) { const [a, c] = nums(promptOf(p)).slice(-2); expect(Number(p.answer)).toBe((360 - a - c) / 2); }
    for (const p of deal(GEO, 'trapMidsegment')) { const t = promptOf(p); const head = plain(p.head);
      if (/Find x/.test(head)) { const [b1, b2] = t.match(/\d*x(?: [+-] \d+)?/g).map(lin); const m = nums(t).slice(-1)[0]; const x = Number(p.answer); expect(b1[0] * x + b1[1] + b2[0] * x + b2[1]).toBe(2 * m); }
      else if (/midsegment$/.test(head)) { const [b1, b2] = nums(t); expect(Number(p.answer) * 2).toBe(b1 + b2); } else { const [m, b1] = nums(t); expect(Number(p.answer)).toBe(2 * m - b1); } }
    for (const p of deal(GEO, 'isoTrapAngles')) { const t = promptOf(p); const quad = t.match(/trapezoid (\w{4})/)[1]; const a = nums(t).slice(-1)[0]; const asked = plain(p.head).match(/m∠(\w)/)[1];
      expect(Number(p.answer)).toBe(asked === quad[1] ? a : 180 - a); }
    for (const p of deal(GEO, 'alwaysSometimesNever')) { const s = promptOf(p); const k = keyText(p);
      if (/^A square is a (rectangle|rhombus|parallelogram)/.test(s) || /^A rectangle is a parallelogram/.test(s)) expect(k).toBe('always');
      if (/^A rectangle is a rhombus|^A rhombus is a square/.test(s)) expect(k).toBe('sometimes');
      if (/trapezoid\.$/.test(s) && /parallelogram is/.test(s)) expect(k).toBe('never'); }
  });
});

describe('Algebra Module 10 — re-derived by polynomial arithmetic', () => {
  test('sum and difference', () => {
    for (const p of deal(ALG, 'addPoly')) { const [a, b] = promptOf(p).match(/\(([^)]+)\)/g).map((s) => parsePoly(s.slice(1, -1))); expect(trimP(parsePoly(keyText(p)))).toEqual(trimP(addP(a, b))); }
    for (const p of deal(ALG, 'subPoly')) { const [a, b] = promptOf(p).match(/\(([^)]+)\)/g).map((s) => parsePoly(s.slice(1, -1))); expect(trimP(parsePoly(keyText(p)))).toEqual(trimP(addP(a, b.map((c) => -c)))); }
  });
  test('products: the key expands to the product of the printed factors', () => {
    for (const id of ['monoTimes', 'foil', 'binomTrinom', 'square']) for (const p of deal(ALG, id)) expect(trimP(parsePoly(keyText(p)))).toEqual(trimP(expand(promptOf(p))));
  });
  test('factoring: the key multiplies back to the printed polynomial, and is complete', () => {
    for (const id of ['gcf', 'factorTrinomial', 'factorTrinomialA', 'diffSquares', 'perfectSquare', 'gcfThenFactor']) for (const p of deal(ALG, id)) {
      expect(trimP(expand(keyText(p)))).toEqual(trimP(parsePoly(promptOf(p))));
    }
    for (const p of deal(ALG, 'gcf')) { const inner = parsePoly(keyText(p).match(/\((.*)\)/)[1]); const g = inner.reduce((a, b) => { const gg = (x, y) => (y ? gg(y, x % y) : Math.abs(x)); return gg(a, b); }); expect(g).toBe(1); expect(inner[inner.length - 1]).not.toBe(0); }
    for (const p of deal(ALG, 'diffSquares')) { const [a, b] = nums(keyText(p).match(/\(([^)]+)\)/)[1].replace(/x/, ' ')).length === 2 ? nums(keyText(p).match(/\(([^)]+)\)/)[1]) : [1, nums(keyText(p))[0]]; const gg = (x, y) => (y ? gg(y, x % y) : Math.abs(x)); expect(gg(a, b)).toBe(1); }
    for (const p of deal(ALG, 'prime')) {
      const c = parsePoly(promptOf(p)); const k = keyText(p); const [, b, cc] = c;
      let factorable = false; for (let i = 1; i * i <= cc; i++) if (cc % i === 0 && i + cc / i === b) factorable = true;
      expect(k === 'PRIME').toBe(!factorable); if (factorable) expect(trimP(expand(k))).toEqual(c);
    }
    for (const p of deal(ALG, 'factorPair')) { const [, b, c] = parsePoly(promptOf(p)); const [u, v] = nums(keyText(p)); expect(u * v).toBe(c); expect(u + v).toBe(b); }
  });
  test('naming: degree and term count from the printed polynomial', () => {
    const DEG = ['constant', 'linear', 'quadratic', 'cubic']; const TERMS = ['monomial', 'binomial', 'trinomial'];
    for (const p of deal(ALG, 'namePoly')) { const c = trimP(parsePoly(promptOf(p))); expect(keyText(p)).toBe(`${DEG[c.length - 1]} ${TERMS[c.filter((x) => x !== 0).length - 1]}`); }
  });
});
