/**
 * Chapter Review drills: Algebra 1 Modules 4 (linear functions) and 5 (writing linear equations).
 * Same contract as the other review suites, with every computed answer re-solved from the printed
 * question: every slope recomputed from the printed points, every equation's key checked against the
 * printed points / slope / intercept by substitution, every conversion between forms re-derived,
 * every parallel/perpendicular slope recomputed, every sequence term re-added.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const M4 = require('../../utils/liveDrill/review/alg1Ch4');
const M5 = require('../../utils/liveDrill/review/alg1Ch5');

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
const fracVal = (s) => { const m = plain(s).trim().match(/^(-?\d+)(?:\/(\d+))?$/); return m ? +m[1] / (m[2] ? +m[2] : 1) : NaN; };
/** "y = (p/q)x + b" / "y = -3x - 2" / "y = 5" → [m, b] */
function sifOf(s) {
  const t = plain(s).replace(/^y = /, '').replace(/\s/g, '');
  const m = t.match(/^(-?)(?:\((\d+)\/(\d+)\)|(\d+)\/(\d+)|(\d*))x([+-]\d+)?$/);
  if (!m) return [0, +t];
  const sign = m[1] === '-' ? -1 : 1; const slope = m[2] ? +m[2] / +m[3] : m[4] ? +m[4] / +m[5] : m[6] === '' ? 1 : +m[6];
  return [sign * slope, m[7] ? +m[7] : 0];
}
/** "ax + by = c" → [a, b, c] */
function stdOf(s) {
  const m = plain(s).replace(/\s/g, '').match(/^(-?\d*)x([+-]\d*)y=(-?\d+)$/); const co = (v) => (v === '' || v === '+' ? 1 : v === '-' ? -1 : +v);
  return [co(m[1]), co(m[2]), +m[3]];
}
/** "y - y1 = m(x - x1)" → [m, x1, y1] */
function psfOf(s) {
  const m = plain(s).replace(/\s/g, '').match(/^y([+-]\d+)=(-?)(?:\((\d+)\/(\d+)\)|(\d*))\(x([+-]\d+)\)$/);
  const slope = (m[2] === '-' ? -1 : 1) * (m[3] ? +m[3] / +m[4] : m[5] === '' ? 1 : +m[5]);
  return [slope, -m[6], -m[1]];
}
const pts = (s) => [...plain(s).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [+m[1], +m[2]]);

describe.each([['alg1m4', M4], ['alg1m5', M5]])('%s: every play is well formed', (drill, bank) => {
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
    const order = solo.HUBS.algebra.games.map((g) => g.drill); expect(order.indexOf(drill)).toBeGreaterThan(order.indexOf('alg1m3')); expect(order.indexOf(drill)).toBeLessThan(order.indexOf('alg1m7'));
    const seen = new Set(); for (let n = 1; n <= 600; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Algebra Module 4 — re-solved from the question text', () => {
  test('graphing: points from the equation, intercepts, horizontal and vertical lines', () => {
    for (const p of deal(M4, 'nextPoint')) {
      const [m, b] = sifOf(promptOf(p)); const h = p.head;
      if (/start/.test(h)) expect(pts(keyText(p))[0]).toEqual([0, b]); else if (/next/.test(h)) expect(pts(keyText(p))[0]).toEqual([1, m + b]);
      else { const [[x, y]] = pts(h); expect(keyText(p).startsWith('Yes')).toBe(m * x + b === y); }
    }
    for (const p of deal(M4, 'intercepts')) { const [a, b, c] = stdOf(promptOf(p)); const [[x, y]] = pts(keyText(p)); expect(a * x + b * y).toBe(c); expect(/x-intercept/.test(p.head) ? y : x).toBe(0); }
    for (const p of deal(M4, 'horizVert')) { const t = promptOf(p); const vert = /^x =/.test(t); const [a] = nums(t); const k = keyText(p); if (/slope/.test(p.head)) expect(k).toBe(vert ? 'undefined' : '0'); else expect(k).toBe(vert ? `a vertical line through (${a}, 0)` : `a horizontal line through (0, ${a})`); }
    for (const p of deal(M4, 'dogFood')) { const [total, per] = nums(promptOf(p)); const k = keyText(p); if (/What is the x-intercept/.test(p.head)) expect(k).toBe(`(${total / per}, 0)`); else if (/x-intercept mean/.test(p.head)) expect(k).toBe(`the bag is empty after ${total / per} days`); else expect(k).toBe(`${total} cups in the bag at the start (day 0)`); }
  });
  test('slope: rise over run from the printed points; the missing coordinate; the table', () => {
    for (const p of deal(M4, 'slopeTwoPoints')) { const [[x1, y1], [x2, y2]] = pts(promptOf(p)); expect(fracVal(keyText(p))).toBeCloseTo((y2 - y1) / (x2 - x1), 12); }
    for (const p of deal(M4, 'undefinedSlope')) { const [[x1], [x2]] = pts(promptOf(p)); expect(x1).toBe(x2); expect(keyText(p)).toMatch(/^undefined/); }
    for (const p of deal(M4, 'missingCoord')) { const t = promptOf(p); const [m] = nums(t); const x1 = +t.match(/\((-?\d+), y\)/)[1]; const [[x2, y2]] = pts(t); expect((y2 - Number(p.answer)) / (x2 - x1)).toBe(m); }
    for (const p of deal(M4, 'tableRate')) { const rows = pts(promptOf(p)); const rates = rows.slice(1).map(([x, y], i) => (y - rows[i][1]) / (x - rows[i][0])); const linear = rates.every((r) => r === rates[0]); if (linear) expect(keyText(p)).toBe(`yes — constant rate ${rates[0]} per unit`); else expect(keyText(p)).toMatch(/^no/); }
  });
  test('slope-intercept form: written, converted, interpreted', () => {
    for (const p of deal(M4, 'writeSIF')) { const t = promptOf(p); const m = fracVal(t.match(/Slope (\S+),/)[1]); const b = +t.match(/y-intercept (-?\d+)/)[1]; expect(sifOf(keyText(p))).toEqual([m, b]); }
    for (const p of deal(M4, 'standardToSIF')) { const [a, b, c] = stdOf(promptOf(p)); if (/slope-intercept/.test(p.head)) { const [m, k] = sifOf(keyText(p)); expect(m).toBeCloseTo(-a / b, 12); expect(k).toBeCloseTo(c / b, 12); } else if (/slope/.test(p.head)) expect(fracVal(keyText(p))).toBeCloseTo(-a / b, 12); else expect(Number(p.answer)).toBe(c / b); }
    for (const p of deal(M4, 'meaning')) { const [m, b] = sifOf(promptOf(p)); const k = keyText(p); if (/slope/.test(p.head)) { const [r, run] = nums(k); expect(k.startsWith(m > 0 ? 'the line rises' : 'the line falls')).toBe(true); expect(r / run).toBeCloseTo(Math.abs(m), 12); } else expect(k).toBe(`the line crosses the y-axis at (0, ${b})`); }
    for (const p of deal(M4, 'drone')) { const [rate, start] = nums(promptOf(p)); if (p.input === 'number') expect(Number(p.answer) * rate + start).toBe(0); else if (/slope/.test(p.head)) expect(keyText(p)).toBe(`the battery loses ${-rate}% each minute`); else expect(keyText(p)).toBe(`${start}% charge at takeoff (t = 0)`); }
    for (const p of deal(M4, 'storyToSIF')) { const t = promptOf(p); const [m, b] = sifOf(keyText(p)); if (/users/.test(t)) { const [b0, r] = nums(t); expect([m, b]).toEqual([r, b0]); } else if (/electrician/.test(t)) { const [b0, r] = nums(t); expect([m, b]).toEqual([r, b0]); } else { const [b0, r] = nums(t); expect([m, b]).toEqual([-r, b0]); } }
  });
  test('arithmetic sequences: differences re-taken from the printed terms', () => {
    for (const p of deal(M4, 'isArithmetic')) { const seq = nums(promptOf(p)); const d = seq.slice(1).map((v, i) => v - seq[i]); expect(keyText(p).startsWith('Yes')).toBe(d.every((x) => x === d[0])); }
    for (const p of deal(M4, 'nextTerms')) { const seq = nums(promptOf(p)); const d = seq[1] - seq[0]; const a = Number(p.answer); if (/difference/.test(p.head)) expect(a).toBe(d); else if (/next/.test(p.head)) expect(a).toBe(seq[3] + d); else { const [n] = nums(p.head); expect(a).toBe(seq[0] + (n - 1) * d); } }
    for (const p of deal(M4, 'nthFormula')) { const seq = nums(promptOf(p)); const [d, b] = sifOf(keyText(p).replace(/^aₙ = /, 'y = ').replace(/n/, 'x')); for (let n = 1; n <= 4; n++) expect(d * n + b).toBe(seq[n - 1]); }
    for (const p of deal(M4, 'jogging')) { const [start, inc, goal] = nums(promptOf(p)); const n = Number(p.answer); expect(start + (n - 1) * inc).toBe(goal); }
  });
  test('cumulative review', () => {
    for (const p of deal(M4, 'whichFunction')) { const xs = pts(keyText(p)).map(([x]) => x); expect(new Set(xs).size).toBe(xs.length); for (const c of p.choices) { const cx = pts(c.html).map(([x]) => x); if (plain(c.html) !== keyText(p)) expect(new Set(cx).size).toBeLessThan(cx.length); } }
    for (const p of deal(M4, 'solveReview')) { const [k, b, r] = nums(promptOf(p)); expect(k * (Number(p.answer) + b)).toBe(r); }
    for (const p of deal(M4, 'literalReview')) { const v = promptOf(p).match(/for (\w)$/)[1]; expect(keyText(p).startsWith(`${v} = `)).toBe(true); }
  });
});

describe('Algebra Module 5 — re-solved from the question text', () => {
  test('slope-intercept form: the key passes through the printed points with the printed slope', () => {
    for (const p of deal(M5, 'fromMB')) { const [b, m] = nums(promptOf(p)); expect(sifOf(keyText(p))).toEqual([m, b]); }
    for (const p of deal(M5, 'pointSlope')) { const t = promptOf(p); const [[x1, y1]] = pts(t); const m0 = +t.match(/slope (-?\d+)/)[1]; const [m, b] = sifOf(keyText(p)); expect(m).toBe(m0); expect(m * x1 + b).toBe(y1); }
    for (const p of deal(M5, 'twoPoints')) { const [[x1, y1], [x2, y2]] = pts(promptOf(p)); const [m, b] = sifOf(keyText(p)); expect(m * x1 + b).toBe(y1); expect(m * x2 + b).toBe(y2); }
    for (const p of deal(M5, 'story')) {
      const t = promptOf(p); const ns = nums(t);
      if (/kayak/.test(t)) { const [fee, per] = ns; if (p.input === 'number') { const [h] = nums(p.head); expect(Number(p.answer)).toBe(per * h + fee); } else expect(keyText(p)).toBe(`C = ${per}h + ${fee}`); }
      else if (/gym/.test(t)) { const [per, n, total] = ns; const b = total - per * n; if (p.input === 'number') expect(Number(p.answer)).toBe(b); else expect(keyText(p)).toBe(`y = ${per}x + ${b}`); }
      else { const [drop, tt, temp] = ns; const b = temp + drop * tt; if (p.input === 'number') expect(Number(p.answer)).toBe(b); else expect(keyText(p)).toBe(`y = -${drop}x + ${b}`); }
    }
  });
  test('point-slope and standard form: every conversion re-derived', () => {
    for (const p of deal(M5, 'writePSF')) { const t = promptOf(p); const P = pts(t); const [m, x1, y1] = psfOf(keyText(p)); expect([x1, y1]).toEqual(P[0]); if (P.length === 2) expect(m).toBeCloseTo((P[1][1] - P[0][1]) / (P[1][0] - P[0][0]), 12); else expect(m).toBeCloseTo(fracVal(t.match(/slope (\S+)\./)[1]), 12); }
    for (const p of deal(M5, 'psfToSIF')) { const [m, x1, y1] = psfOf(promptOf(p)); const [mm, b] = sifOf(keyText(p)); expect(mm).toBe(m); expect(m * x1 + b).toBe(y1); }
    for (const p of deal(M5, 'sifToStandard')) { const [m, b] = sifOf(promptOf(p)); const [A, B, C] = stdOf(keyText(p)); expect(A).toBeGreaterThan(0); for (const x of [0, 1, 7]) expect(A * x + B * (m * x + b)).toBeCloseTo(C, 9); }
    for (const p of deal(M5, 'standardToSIF')) { const [a, b, c] = stdOf(promptOf(p)); const [m, k] = sifOf(keyText(p)); for (const x of [0, 1, 5]) expect(a * x + b * (m * x + k)).toBeCloseTo(c, 9); }
    for (const p of deal(M5, 'interceptsToStandard')) { const [[xi], [, yi]] = pts(promptOf(p)); const [A, B, C] = stdOf(keyText(p)); expect(A * xi).toBe(C); expect(B * yi).toBe(C); expect(A).toBeGreaterThan(0); }
  });
  test('parallel and perpendicular: slopes recomputed from the printed line', () => {
    const slopeOf = (s) => (/^y =/.test(s) ? sifOf(s)[0] : (() => { const [a, b] = stdOf(s); return -a / b; })());
    for (const p of deal(M5, 'slopeNeeded')) { const m = slopeOf(promptOf(p)); const k = fracVal(keyText(p)); expect(k).toBeCloseTo(/PERPENDICULAR/.test(p.head) ? -1 / m : m, 12); }
    for (const p of deal(M5, 'classify')) { const [l1, l2] = promptOf(p).split(' and '); const m1 = sifOf(l1)[0]; const m2 = sifOf(l2)[0]; const k = keyText(p); expect(k.split(' ')[0]).toBe(m1 === m2 ? 'parallel' : Math.abs(m1 * m2 + 1) < 1e-12 ? 'perpendicular' : 'neither'); }
    for (const p of deal(M5, 'writeParPerp')) { const t = promptOf(p); const [[x1, y1]] = pts(t); const m0 = sifOf(t.split(' to ')[1].replace(/\.$/, ''))[0]; const [m, b] = sifOf(keyText(p)); expect(m).toBeCloseTo(/PERPENDICULAR/.test(t) ? -1 / m0 : m0, 12); expect(m * x1 + b).toBeCloseTo(y1, 9); }
    for (const p of deal(M5, 'rexPerp')) { const m = sifOf(askOf(p).match(/to (y = [^ ]+ [-+] \d+)/)[1])[0]; expect(fracVal(keyText(p).match(/slope is (\S+)$/)[1])).toBeCloseTo(-1 / m, 12); }
  });
  test('correlation, lines of fit, r', () => {
    for (const p of deal(M5, 'correlation')) { const t = promptOf(p); const k = keyText(p); if (/increase.*increase|higher final|rise from left/.test(t)) expect(k).toBe('positive correlation'); else if (/fall|lower its value/.test(t)) expect(k).toBe('negative correlation'); else expect(k).toBe('no correlation'); }
    for (const p of deal(M5, 'lineOfFit')) { const [m, b] = sifOf(promptOf(p).match(/(y = .*)\.$/)[1]); if (p.input === 'number') { const [yr] = nums(p.head); expect(Number(p.answer)).toBe(m * (yr - 2000) + b); } else if (/slope/.test(p.head)) expect(keyText(p)).toBe(`the cost rises about ${m} hundred dollars per year`); else expect(keyText(p)).toMatch(/^linear extrapolation/); }
    for (const p of deal(M5, 'rValue')) { const [r] = nums(promptOf(p)); const k = keyText(p); expect(k).toBe(Math.abs(r) >= 0.85 ? `strong ${r > 0 ? 'positive' : 'negative'}` : Math.abs(r) >= 0.3 ? `moderate ${r > 0 ? 'positive' : 'negative'}` : 'little or no correlation'); }
  });
  test('cumulative review', () => {
    for (const p of deal(M5, 'slopeReview')) { const [[x1, y1], [x2, y2]] = pts(promptOf(p)); expect(Number(p.answer) * (x2 - x1)).toBe(y2 - y1); }
    for (const p of deal(M5, 'evalF')) { const [a, b, x] = nums(askOf(p)); expect(Number(p.answer)).toBe(a * x - b); }
    for (const p of deal(M5, 'solveReview')) { const [k, c, d, r] = nums(promptOf(p)); const x = Number(p.answer); expect(k * (x - c) + d * x).toBe(r); }
  });
});
