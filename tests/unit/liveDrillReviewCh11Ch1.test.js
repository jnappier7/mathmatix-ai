/**
 * Chapter Review drills, eighth pair: Honors Geometry Ch. 11 (circumference, area, volume) and
 * Ch. 1 (basics of geometry). Same contract as the other review suites, with every computed answer
 * re-solved from the printed question: every exact "kπ" answer recomputed as a reduced fraction of π
 * from the printed radius/angle/height, every √3 area from the printed side, Euler's formula
 * re-applied, every segment/angle algebra equation solved again from its printed expressions, every
 * midpoint and distance recomputed from the printed coordinates.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const CH11 = require('../../utils/liveDrill/review/hgeoCh11');
const CH1 = require('../../utils/liveDrill/review/hgeoCh1');

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
/** "26π" / "32π/3" / "π/6" / "π" → the coefficient of π as a number */
const piVal = (s) => { const m = plain(s).match(/^(\d*)π(?:\/(\d+))?$/); if (!m) return NaN; return (m[1] ? +m[1] : 1) / (m[2] ? +m[2] : 1); };
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** an exact "kπ" answer must be in lowest terms */
const reduced = (s) => { const m = plain(s).match(/^(\d*)π(?:\/(\d+))?$/); return !m[2] || gcd(+m[1] || 1, +m[2]) === 1; };
/** "(ax + b)" pieces → [a, b] */
const lin = (s, v = 'x') => { const m = plain(s).replace(/[()°]/g, '').trim().match(new RegExp(`^(\\d*)${v}(?: ([+-]) (\\d+))?$`)); return [m[1] === '' ? 1 : +m[1], m[2] ? (m[2] === '-' ? -1 : 1) * +m[3] : 0]; };
const tenth = (x) => (Math.round(x * 10) / 10).toFixed(1);

describe.each([['hgeo11', CH11], ['hgeo1', CH1]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill, on the geometry hub, reachable from Whole Chapter', () => {
    expect(DRILLS[drill].native).toBe(bank); expect(DRILLS[drill].scoring).toBeUndefined();
    expect(solo.HUBS.geometry.games.some((g) => g.drill === drill)).toBe(true);
    const seen = new Set(); for (let n = 1; n <= 600; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Geometry Ch. 11 — re-solved from the question text', () => {
  test('circles: C, arcs, radians, areas, sectors, and the backward problems', () => {
    for (const p of deal(CH11, 'circumference')) { const t = promptOf(p); const [n] = nums(t); const r = /diameter/.test(t) ? n / 2 : n; expect(reduced(keyText(p))).toBe(true); close(piVal(keyText(p)), 2 * r); }
    for (const p of deal(CH11, 'arcLength')) { const [m, r] = nums(promptOf(p)); expect(reduced(keyText(p))).toBe(true); close(piVal(keyText(p)), (m / 360) * 2 * r); }
    for (const p of deal(CH11, 'toRadians')) { const [d] = nums(promptOf(p)); expect(reduced(keyText(p))).toBe(true); close(piVal(keyText(p)), d / 180); }
    for (const p of deal(CH11, 'toDegrees')) { const k = piVal(promptOf(p).replace(' radians', '')); close(Number(p.answer), k * 180); }
    for (const p of deal(CH11, 'circleArea')) { const t = promptOf(p); const [n] = nums(t); const r = /diameter/.test(t) ? n / 2 : n; close(piVal(keyText(p)), r * r); }
    for (const p of deal(CH11, 'sectorArea')) { const [m, r] = nums(promptOf(p)); expect(reduced(keyText(p))).toBe(true); close(piVal(keyText(p)), (m / 360) * r * r); }
    for (const p of deal(CH11, 'backward')) {
      const t = promptOf(p); const k = piVal(t.match(/(\S*π\S*)\.$/)[1]);
      if (/central angle/.test(p.head)) { const [r] = nums(t); close((Number(p.answer) / 360) * r * r, k); } else { const [m] = nums(t); close((m / 360) * 2 * Number(p.answer), k); }
    }
  });
  test('polygons: kites, hexagons, apothems, central angles', () => {
    for (const p of deal(CH11, 'kiteArea')) { const [d1, d2] = nums(promptOf(p)); expect(Number(p.answer) * 2).toBe(d1 * d2); }
    for (const p of deal(CH11, 'hexagonArea')) { const [s] = nums(promptOf(p)); const m = keyText(p).match(/^(\d*)√3$/); expect(m).toBeTruthy(); close(+m[1] || 1, (3 * s * s) / 2); }
    for (const p of deal(CH11, 'regularArea')) { const t = promptOf(p); const n = { pentagon: 5, hexagon: 6, octagon: 8, decagon: 10, dodecagon: 12 }[t.match(/regular (\w+)/)[1]]; const [s, a] = nums(t); expect(Number(p.answer) * 2).toBe(a * n * s); }
    for (const p of deal(CH11, 'centralAngle')) { const n = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, octagon: 8, nonagon: 9, decagon: 10, dodecagon: 12 }[promptOf(p).match(/regular (\w+)/)[1]]; expect(Number(p.answer)).toBe(/top angle/.test(p.head) ? 180 / n : 360 / n); }
    for (const p of deal(CH11, 'apothemSetup')) { const t = promptOf(p); const n = { pentagon: 5, octagon: 8, nonagon: 9, decagon: 10, dodecagon: 12 }[t.match(/regular (\w+)/)[1]]; const [s] = nums(t); expect(keyText(p)).toBe(`tan(${180 / n}°) = ${s / 2}/a`); }
  });
  test('solids: Euler, V = Bh, cylinders', () => {
    for (const p of deal(CH11, 'euler')) { const [a, b] = nums(promptOf(p)); const x = Number(p.answer); const h = p.head; if (/edges/.test(h)) expect(a + b - x).toBe(2); else if (/vertices/.test(h)) expect(a + x - b).toBe(2); else expect(x + a - b).toBe(2); }
    for (const p of deal(CH11, 'prismVolume')) { const ns = nums(promptOf(p)); expect(Number(p.answer)).toBe(/triangle/.test(promptOf(p)) ? (ns[0] * ns[1] * ns[2]) / 2 : ns[0] * ns[1] * ns[2]); }
    for (const p of deal(CH11, 'cylinderVolume')) { const t = promptOf(p); const [n, h] = nums(t); const r = /diameter/.test(t) ? n / 2 : n; close(piVal(keyText(p)), r * r * h); }
    for (const p of deal(CH11, 'cavalieri')) { if (/leans/.test(p.head)) { const [r, h] = nums(promptOf(p)); expect(keyText(p)).toMatch(/^the same/); close(piVal(keyText(p).match(/the same: (\S+π\S*) /)[1]), r * r * h); } }
  });
  test('pointed solids: the third, the slant height, the true height in volume', () => {
    for (const p of deal(CH11, 'pyramidVolume')) { const t = promptOf(p); const ns = nums(t.replace('-by-', ' by ')); const B = /-by-/.test(t) ? ns[0] * ns[1] : ns[0] * ns[0]; const h = ns[ns.length - 1]; expect(Number(p.answer) * 3).toBe(B * h); }
    for (const p of deal(CH11, 'coneVolume')) { const [r, h] = nums(promptOf(p)); expect(reduced(keyText(p))).toBe(true); close(piVal(keyText(p)), (r * r * h) / 3); }
    for (const p of deal(CH11, 'slantHeight')) {
      const t = promptOf(p); const ns = nums(t);
      if (/slant height$/.test(p.head)) { const [r, h] = ns; expect(Number(p.answer) ** 2).toBe(r * r + h * h); }
      else if (/surface/.test(p.head)) { const [r, l] = ns; close(piVal(keyText(p)), r * r + r * l); }
      else { const [r, h, l] = ns; expect(l * l).toBe(r * r + h * h); close(piVal(keyText(p)), (r * r * h) / 3); }
    }
    for (const p of deal(CH11, 'backwardHeight')) {
      const t = promptOf(p).replace('-by-', ' by '); const h = Number(p.answer);
      if (/cylinder/.test(t)) { const [r] = nums(t); close(piVal(t.match(/volume (\S+π\S*)\./)[1]), r * r * h); }
      else if (/cone/.test(t)) { const [r] = nums(t); close(piVal(t.match(/volume (\S+π\S*)\./)[1]), (r * r * h) / 3); }
      else { const [l, w, V] = nums(t); expect(l * w * h).toBe(3 * V); }
    }
  });
  test('spheres, scaling, composites', () => {
    for (const p of deal(CH11, 'sphere')) {
      const [r] = nums(promptOf(p)); const k = piVal(keyText(p)); const h = p.head; expect(reduced(keyText(p))).toBe(true);
      if (/TOTAL/.test(h)) close(k, 3 * r * r); else if (/hemisphere/.test(h)) close(k, (2 * r * r * r) / 3); else if (/surface/.test(h)) close(k, 4 * r * r); else close(k, (4 * r * r * r) / 3);
    }
    for (const p of deal(CH11, 'nearestTenth')) { const t = promptOf(p); const [r] = nums(t); const hemi = /hemisphere/.test(t); const want = /Surface/.test(p.head) ? 4 * Math.PI * r * r : (hemi ? 2 / 3 : 4 / 3) * Math.PI * r ** 3; expect(keyText(p)).toBe(tenth(want)); }
    for (const p of deal(CH11, 'scaling')) { const [k] = nums(p.head); expect(Number(p.answer)).toBe(/volume/.test(p.head) ? k ** 3 : k * k); }
    for (const p of deal(CH11, 'composite')) {
      const t = promptOf(p); const [r, h, ...rest] = nums(t); const k = piVal(keyText(p)); expect(reduced(keyText(p))).toBe(true);
      if (/rocket/.test(t)) close(k, r * r * h + (r * r * rest[1]) / 3); else if (/silo/.test(t)) close(k, r * r * h + (2 * r ** 3) / 3); else close(k, r * r * h + (4 * r ** 3) / 3);
    }
  });
});

describe('Geometry Ch. 1 — re-solved from the question text', () => {
  test('segments: addition, algebra, cities, midpoints', () => {
    for (const p of deal(CH1, 'segAdd')) { const t = promptOf(p); const [, A, C] = t.match(/between (\w) and (\w)\./); const [a, b] = nums(t); const first = t.match(/\. (\w\w) = /)[1]; expect(Number(p.answer)).toBe(first === A + C ? a - b : a + b); }
    for (const p of deal(CH1, 'segAlgebra')) {
      const t = promptOf(p); const [A, B] = t.match(/= ([^,]+),/g).map((e) => lin(e.replace(/^= |,$/g, ''))); const rt = nums(t.split('= ').pop())[0]; const x = (rt - A[1] - B[1]) / (A[0] + B[0]); expect(Number.isInteger(x)).toBe(true);
      expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : p.head.slice(5) === t.match(/(\w\w) = [^,]+,/)[1] ? A[0] * x + A[1] : rt);
    }
    for (const p of deal(CH1, 'cities')) { const t = promptOf(p); const [, A, , C] = t.match(/^(.+?), (.+?), and (.+?) lie/); const [, from, to] = t.match(/\. (.+?) to (.+?) is \d/); const [a, b] = nums(t); expect(Number(p.answer)).toBe(from === A && to === C ? a - b : a + b); }
    for (const p of deal(CH1, 'midpointFacts')) { const [n] = nums(promptOf(p)); expect(Number(p.answer)).toBe(/^\w is the midpoint of \w\w\. \w\w = \d+\.$/.test(promptOf(p)) && promptOf(p).match(/of (\w\w)\. (\w\w) =/)[1] === promptOf(p).match(/of (\w\w)\. (\w\w) =/)[2] ? n / 2 : n); }
    for (const p of deal(CH1, 'midpointAlgebra')) { const t = promptOf(p); const [A, B] = t.match(/= ([^.]+?)(?= and| \.|\.$)/g).map((e) => lin(e.slice(2))); const x = (B[1] - A[1]) / (A[0] - B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : 2 * (A[0] * x + A[1])); }
  });
  test('coordinate plane: midpoints, endpoints, distances, perimeter and area', () => {
    for (const p of deal(CH1, 'midpointCoords')) { const [x1, y1, x2, y2] = nums(promptOf(p)); expect(nums(keyText(p))).toEqual([(x1 + x2) / 2, (y1 + y2) / 2]); }
    for (const p of deal(CH1, 'endpoint')) { const [mx, my, jx, jy] = nums(promptOf(p)); expect(nums(keyText(p))).toEqual([2 * mx - jx, 2 * my - jy]); }
    for (const p of deal(CH1, 'distance')) { const [x1, y1, x2, y2] = nums(promptOf(p)); expect((x2 - x1) ** 2 + (y2 - y1) ** 2).toBe(Number(p.answer) ** 2); }
    for (const p of deal(CH1, 'congruentSegs')) { const [x1, y1, x2, y2, x3, y3, x4, y4] = nums(promptOf(p)); const ab = Math.hypot(x2 - x1, y2 - y1); const cd = Math.hypot(x4 - x3, y4 - y3); expect(keyText(p).startsWith('Yes')).toBe(ab === cd); expect(nums(keyText(p))[0]).toBe(ab); }
    for (const p of deal(CH1, 'rectangle')) { const ns = nums(promptOf(p)); const xs = [ns[0], ns[2], ns[4], ns[6]]; const ys = [ns[1], ns[3], ns[5], ns[7]]; const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys); expect(Number(p.answer)).toBe(/area/.test(p.head) ? w * h : 2 * (w + h)); }
    for (const p of deal(CH1, 'triangleArea')) { const [x1, y1, x2, , , y3] = nums(promptOf(p)); const a = x2 - x1; const b = y3 - y1; const c = Math.hypot(a, b); expect(Number(p.answer)).toBe(/area/.test(p.head) ? (a * b) / 2 : a + b + c); }
    for (const p of deal(CH1, 'polygonName')) { if (/sides/.test(promptOf(p))) { const [n] = nums(promptOf(p)); expect(keyText(p)).toBe({ 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' }[n]); } else expect(keyText(p)).toBe('concave'); }
  });
  test('angles: classify, addition, splits, bisectors, pairs', () => {
    for (const p of deal(CH1, 'classify')) { const [m] = nums(promptOf(p)); expect(keyText(p)).toBe(m < 90 ? 'acute' : m === 90 ? 'right' : m < 180 ? 'obtuse' : 'straight'); }
    for (const p of deal(CH1, 'angleAdd')) { const [a, b] = nums(promptOf(p)); const t = promptOf(p); expect(Number(p.answer)).toBe(t.match(/m∠(\w+) = \d+° and m∠(\w+) = \d+°/)[1] === p.head.slice(7) || /interior of ∠(\w+)\. m∠\1 =/.test(t) ? a - b : a + b); }
    for (const p of deal(CH1, 'splitAngle')) { const t = promptOf(p); const total = /straight/.test(t) ? 180 : 90; const [A, B] = t.match(/\(([^)]+)\)/g).map((e) => lin(e)); const x = (total - A[1] - B[1]) / (A[0] + B[0]); expect(Number.isInteger(x)).toBe(true); const h = p.head; expect(Number(p.answer)).toBe(/Find x/.test(h) ? x : h.slice(7) === t.match(/m∠(\w+) = \(/)[1] ? A[0] * x + A[1] : B[0] * x + B[1]); }
    for (const p of deal(CH1, 'bisector')) {
      const t = promptOf(p); const [A, B] = t.match(/\(([^)]+)\)/g).map((e) => lin(e, /y/.test(e) ? 'y' : 'x'));
      if (/bisects ∠(\w+)\. m∠\w+ = \([^)]+\)° and m∠\1 =/.test(t)) { const y = (2 * A[1] - B[1]) / (B[0] - 2 * A[0]); expect(Number.isInteger(y)).toBe(true); expect(Number(p.answer)).toBe(A[0] * y + A[1]); }
      else { const x = (B[1] - A[1]) / (A[0] - B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : 2 * (A[0] * x + A[1])); }
    }
    for (const p of deal(CH1, 'compSupp')) { const t = promptOf(p); const total = /complementary/.test(t) ? 90 : 180; const [A, B] = t.match(/\(([^)]+)\)/g).map((e) => lin(e)); const x = (total - A[1] - B[1]) / (A[0] + B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : p.head.slice(7) === t.match(/^∠(\w+) and/)[1] ? A[0] * x + A[1] : B[0] * x + B[1]); }
    for (const p of deal(CH1, 'complementOf')) { const [m] = nums(p.head); expect(Number(p.answer)).toBe((/complement/.test(p.head) ? 90 : 180) - m); }
    for (const p of deal(CH1, 'verticalLinear')) {
      const t = promptOf(p); const [A, B] = t.match(/\(([^)]+)\)/g).map((e) => lin(e));
      if (/vertical/.test(t)) { const x = (B[1] - A[1]) / (A[0] - B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : A[0] * x + A[1]); }
      else { const x = (180 - A[1] - B[1]) / (A[0] + B[0]); expect(Number.isInteger(x)).toBe(true); expect(Number(p.answer)).toBe(/Find x/.test(p.head) ? x : Math.max(A[0] * x + A[1], B[0] * x + B[1])); }
    }
    for (const p of deal(CH1, 'diagram')) { const m = nums(promptOf(p)).pop(); expect(Number(p.answer)).toBe(/∠3/.test(p.head) ? m : 180 - m); }
  });
});
