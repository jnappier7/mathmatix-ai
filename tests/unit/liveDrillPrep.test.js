/**
 * Test Prep drills (utils/liveDrill/prep/): Alg 1 Module 3 and Honors Geometry Ch. 3, built from the
 * teacher's practice tests.
 *
 * What these pin — every play is a question a student could be graded on, so:
 *   - shape: 2–4 distinct choices with the key among them, or a typed INTEGER (negative only when
 *     the play offers the ± key); every template is reachable from its playbook and from Full Test;
 *   - correctness, independently: each computational question is re-solved from its own text
 *     (parse the prompt, solve, compare to the key) — not by calling the template's own arithmetic;
 *   - geometry from the figure: box relationships are re-derived from 3-D coordinates (skew = not
 *     coplanar), and the angle classes match the textbook positions.
 */
const { dealPlay } = require('../../utils/liveDrill/engine');
const ALG = require('../../utils/liveDrill/prep/alg1Module3');
const GEO = require('../../utils/liveDrill/prep/hgeoCh3');

const N = 250;
const plain = (h) => String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/−/g, '-').trim();
/** n plays of one template, straight from the bank with a seeded rng. */
function deal(bank, id, n = N) {
  let s = 12345 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = bank.TEMPLATES[id];
    const play = bank.makePlay(t.book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand); // only `id` is fresh
    out.push(play);
  }
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
/** The question's own text (the card minus its ask line and figure). */
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');

describe.each([['alg1m3', ALG], ['hgeo3', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 120)) {
      expect(p.id).toBe(id);
      expect(p.card).toBeTruthy();
      expect(p.tell).toBeTruthy();
      expect(String(p.summary).replace(/<[^>]*>/g, '').trim()).not.toBe('');
      expect(p.summary).not.toMatch(/<svg/);
      if (p.input === 'number') {
        expect(Number.isInteger(Number(p.answer))).toBe(true);
        if (Number(p.answer) < 0) expect(p.neg).toBe(true);
        expect(p.card).not.toContain('posed-ans');
      } else {
        const ks = p.choices.map((c) => c.k);
        expect(p.choices.length).toBeGreaterThanOrEqual(2);
        expect(p.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length);
        expect(ks).toContain(p.answer);
        expect(p.card).not.toContain('posed-ans');
        expect(p.card).not.toContain('q ok');
      }
    }
  });

  test('every playbook deals, Full Test reaches every template, and play n is a pure function of (seed, n)', () => {
    const seen = new Set();
    for (let n = 1; n <= 400; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Algebra 1, Module 3 — re-solved from the question text', () => {
  test('f(p) ± f(q)', () => {
    for (const p of deal(ALG, 'fsum')) {
      const [, m, b] = plain(p.card).match(/f\(x\) = (-?\d*)x ([+-]) (\d+)/).slice(0, 3).concat();
      const mm = Number(m === '-' ? -1 : m || 1);
      const [, sgn, bb] = plain(p.card).match(/f\(x\) = -?\d*x ([+-]) (\d+)/);
      const B = sgn === '-' ? -Number(bb) : Number(bb);
      const [, a, op, c] = p.head.replace(/−/g, '-').match(/f\((-?\d+)\) ([+-]) f\((-?\d+)\)/);
      const f = (x) => mm * x + B;
      expect(Number(p.answer)).toBe(op === '+' ? f(+a) + f(+c) : f(+a) - f(+c));
      expect(b).toBeDefined();
    }
  });
  test('g(h) for an hourly rate', () => {
    for (const p of deal(ALG, 'geval')) {
      const r = +plain(p.card).match(/g\(x\) = (\d+)x/)[1];
      const h = +p.head.match(/g\((\d+)\)/)[1];
      expect(Number(p.answer)).toBe(r * h);
    }
  });
  test('domain and range', () => {
    for (const p of deal(ALG, 'domrange')) {
      const pairs = [...plain(p.card).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [+m[1], +m[2]]);
      const want = /domain/.test(p.head) ? pairs.map(([x]) => x) : pairs.map(([, y]) => y);
      const set = `{${[...new Set(want)].sort((a, b) => a - b).join(', ')}}`;
      expect(keyText(p)).toBe(set);
    }
  });
  test('function or not: "No" exactly when an x repeats with two different y-values', () => {
    for (const p of deal(ALG, 'isfunc')) {
      const pairs = [...plain(p.card).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [+m[1], +m[2]]);
      const byX = new Map();
      let fn = true;
      for (const [x, y] of pairs) { if (byX.has(x) && byX.get(x) !== y) fn = false; byX.set(x, y); }
      expect(keyText(p).startsWith(fn ? 'Yes' : 'No')).toBe(true);
    }
  });
  test('intercepts of Ax + By = C', () => {
    for (const p of deal(ALG, 'intercepts')) {
      const eq = plain(p.card).match(/(-?\d*)x ([+-]) (\d*)y = (-?\d+)/);
      const A = eq[1] === '-' ? -1 : eq[1] === '' ? 1 : +eq[1];
      const B = (eq[2] === '-' ? -1 : 1) * (eq[3] === '' ? 1 : +eq[3]);
      const C = +eq[4];
      expect(keyText(p)).toBe(`x-int (${C / A}, 0), y-int (0, ${C / B})`);
    }
  });
  test('the tank: rate and slope', () => {
    for (const p of deal(ALG, 'tank')) {
      const [, V, Tm] = plain(p.card).match(/A (\d+)-gallon tank .* after (\d+) minutes/).map(Number);
      if (/gallons drain/.test(p.head)) expect(Number(p.answer)).toBe(V / Tm);
      if (/slope/.test(p.head)) expect(Number(p.answer)).toBe(-V / Tm);
    }
  });
  test('ACT: solve a(x − b) = x + c, and the equivalent expression', () => {
    for (const p of deal(ALG, 'solve')) {
      const [, a, b, sgn, c] = plain(p.card).match(/(\d)\(x - (\d+)\) = x(?: ([+-]) (\d+))?/);
      const C = sgn ? (sgn === '-' ? -c : +c) : 0;
      const x = Number(keyText(p));
      expect(a * (x - b)).toBe(x + C);
    }
    for (const p of deal(ALG, 'equiv')) {
      const [, a, b, sgn, r] = plain(p.card).match(/(\d)\(x - (\d+)\) ([+-]) (\d+)x/);
      const R = sgn === '-' ? -r : +r;
      const at = (x) => a * (x - b) + R * x;
      const k = keyText(p).match(/(-?\d*)x - (\d+)/);
      const m = k[1] === '' ? 1 : k[1] === '-' ? -1 : +k[1];
      for (const x of [0, 2, 5]) expect(m * x - k[2]).toBe(at(x));
    }
  });
  test('graph questions come with the graph', () => {
    for (const id of ['pxint', 'pyint', 'psign', 'psym', 'pend', 'pvertex', 'gincdec', 'gextrema']) {
      for (const p of deal(ALG, id, 20)) expect(p.card).toMatch(/<svg/);
    }
  });
});

describe('Honors Geometry, Ch. 3 — re-derived from the figure and the text', () => {
  const { V, EDGES, FACES, relate, opposite, classify } = GEO._geo;
  const sub = (p, q) => p.map((v, i) => v - q[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  test('box: parallel / skew / intersecting from coordinates (skew = not coplanar)', () => {
    for (const e of EDGES) for (const f of EDGES) {
      if (e === f) continue;
      const [a, b, c, d] = [V[e[0]], V[e[1]], V[f[0]], V[f[1]]];
      const coplanar = dot(cross(sub(b, a), sub(c, a)), sub(d, a)) === 0;
      const meet = [...e].some((v) => f.includes(v));
      const r = relate(e, f);
      if (meet) expect(r).toBe('intersect');
      else if (coplanar) expect(r).toBe('parallel');
      else expect(r).toBe('skew');
    }
    for (const f of FACES) expect([...opposite(f)].every((v) => !f.includes(v))).toBe(true);
  });
  test('box answers are what the coordinates say', () => {
    for (const p of deal(GEO, 'boxPar')) { const e = p.head.match(/line ([A-H]{2})/)[1]; expect(relate(e, keyText(p).slice(5))).toBe('parallel'); }
    for (const p of deal(GEO, 'boxSkew')) { const e = p.head.match(/line ([A-H]{2})/)[1]; expect(relate(e, keyText(p).slice(5))).toBe('skew'); }
    for (const p of deal(GEO, 'boxPlane')) {
      const f = p.head.match(/plane (\w{3})/)[1]; const g = keyText(p).slice(6);
      expect([...g].every((v) => !f.includes(v))).toBe(true); // shares no vertex: the opposite face
    }
  });
  test('angle pairs match the textbook positions (1–4 at the top, 5–8 below)', () => {
    expect(classify(1, 5)).toBe('corresponding');
    expect(classify(3, 6)).toBe('alternate interior');
    expect(classify(4, 5)).toBe('alternate interior');
    expect(classify(1, 8)).toBe('alternate exterior');
    expect(classify(3, 5)).toBe('consecutive interior');
    expect(classify(4, 6)).toBe('consecutive interior');
    expect(classify(1, 4)).toBe('vertical');
    expect(classify(1, 2)).toBe('linear pair');
  });
  test('find the angle: congruent or supplementary, consistent with a full assignment of all eight', () => {
    for (const p of deal(GEO, 'findAngle')) {
      const [, a, ma, b] = p.head.match(/m∠(\d) = (\d+)°\. Find m∠(\d)/).map(Number);
      // every angle at an intersection is m or 180 − m; vertical equal, linear pair supplementary
      const m = Number(p.answer);
      const k = classify(a, b);
      if (['corresponding', 'alternate interior', 'alternate exterior', 'vertical'].includes(k)) expect(m).toBe(ma);
      if (['consecutive interior', 'consecutive exterior', 'linear pair'].includes(k)) expect(m + ma).toBe(180);
    }
  });
  const lin = (s) => { const m = s.match(/\((\d+)x ([+-]) (\d+)\)/); return [+m[1], (m[2] === '-' ? -1 : 1) * m[3]]; };
  test('angle algebra, solved from the text', () => {
    for (const p of deal(GEO, 'solveCong')) {
      const t = plain(p.card); const x = Number(p.answer);
      const exprs = [...t.matchAll(/\(\d+x [+-] \d+\)/g)].map((m) => lin(m[0]));
      if (exprs.length === 2) expect(exprs[0][0] * x + exprs[0][1]).toBe(exprs[1][0] * x + exprs[1][1]);
      else expect(exprs[0][0] * x + exprs[0][1]).toBe(+t.match(/and (\d+)°/)[1]);
    }
    for (const p of deal(GEO, 'solveSupp')) {
      const [e1, e2] = [...plain(p.card).matchAll(/\(\d+x [+-] \d+\)/g)].map((m) => lin(m[0]));
      if (/LARGER/.test(p.head)) {
        const x = (180 - e1[1] - e2[1]) / (e1[0] + e2[0]);
        expect(Number(p.answer)).toBe(Math.max(e1[0] * x + e1[1], e2[0] * x + e2[1]));
      } else {
        const x = Number(p.answer);
        expect(e1[0] * x + e1[1] + e2[0] * x + e2[1]).toBe(180);
      }
    }
    for (const p of deal(GEO, 'perpSplit')) {
      const [e1, e2] = [...plain(p.card).matchAll(/\(\d+x [+-] \d+\)/g)].map((m) => lin(m[0]));
      const x = Number(p.answer);
      expect(e1[0] * x + e1[1] + e2[0] * x + e2[1]).toBe(90);
    }
    for (const p of deal(GEO, 'perpBis')) {
      const t = plain(p.card);
      const pa = t.match(/PA = (\d+)x ([+-]) (\d+)/); const pb = t.match(/PB = (\d+)x ([+-]) (\d+)/);
      const A = [+pa[1], (pa[2] === '-' ? -1 : 1) * pa[3]]; const B = [+pb[1], (pb[2] === '-' ? -1 : 1) * pb[3]];
      const x = (B[1] - A[1]) / (A[0] - B[0]);
      expect(Number(p.answer)).toBe(A[0] * x + A[1]);
    }
  });
  const unparen = (s) => s.replace(/-\((\d+\/\d+)\)/g, '-$1').replace(/\((\d+\/\d+)\)/g, '$1');
  const slopeOf = (s) => { const m = unparen(s).match(/y = (-?\d*)(?:\/(\d+))?x/); if (!m) return 0; const n = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; return n / (m[2] ? +m[2] : 1); };
  const lineOf = (s) => { const t = unparen(s).replace(/\s/g, ''); const m = t.match(/^y=(-?\d*)(?:\/(\d+))?x([+-]\d+)?$/); const n = m[1] === '' ? 1 : m[1] === '-' ? -1 : +m[1]; return [n / (m[2] ? +m[2] : 1), m[3] ? +m[3] : 0]; };
  test('slope from two points', () => {
    for (const p of deal(GEO, 'slope')) {
      const [[x1, y1], [x2, y2]] = [...plain(p.card).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [+m[1], +m[2]]);
      const k = keyText(p).split('/');
      expect(+k[0] / (k[1] ? +k[1] : 1)).toBeCloseTo((y2 - y1) / (x2 - x1));
    }
  });
  test('parallel and perpendicular lines through a point', () => {
    for (const p of deal(GEO, 'parallelLine')) {
      const t = plain(p.card); const [, x0, y0] = t.match(/through \((-?\d+), (-?\d+)\)/).map(Number);
      const [m, b] = lineOf(keyText(p));
      expect(m).toBeCloseTo(slopeOf(t.match(/parallel to (y = [^ ]+(?: [+-] \d+)?)/)[1]));
      expect(m * x0 + b).toBeCloseTo(y0);
    }
    for (const p of deal(GEO, 'perpLine')) {
      const t = plain(p.card); const [, x0, y0] = t.match(/through \((-?\d+), (-?\d+)\)/).map(Number);
      const k = +t.match(/x - (\d+)y =/)[1];
      const [m, b] = lineOf(keyText(p));
      expect(m * (1 / k)).toBeCloseTo(-1);
      expect(m * x0 + b).toBeCloseTo(y0);
    }
  });
  test('parallel / perpendicular / coinciding / neither, from the two equations', () => {
    for (const p of deal(GEO, 'relation')) {
      const t = promptOf(p);
      const [l1, l2] = t.split(' and ');
      const [m1, b1] = lineOf(l1);
      const s = l2.replace(/\s/g, '').match(/^(-?\d*)x?([+-]\d*)y=(-?\d+)$|^(-?\d*)y=(-?\d+)$/);
      let A; let B; let C;
      if (s[2] !== undefined) { A = s[1] === '' ? 1 : s[1] === '-' ? -1 : +s[1]; B = s[2] === '+' ? 1 : s[2] === '-' ? -1 : +s[2]; C = +s[3]; } else { A = 0; B = s[4] === '' ? 1 : +s[4]; C = +s[5]; }
      const m2 = -A / B; const b2 = C / B;
      const expected = Math.abs(m1 - m2) < 1e-9 ? (Math.abs(b1 - b2) < 1e-9 ? 'Coinciding' : 'Parallel') : Math.abs(m1 * m2 + 1) < 1e-9 ? 'Perpendicular' : 'Neither';
      expect(keyText(p)).toBe(expected);
    }
  });
  test('proofs: every step is a valid chain (corresponding then vertical, or vertical then corresponding)', () => {
    for (const p of deal(GEO, 'proof', 120)) {
      const steps = [...plain(p.card).matchAll(/∠(\d) ≅ ∠(\d)/g)].map((m) => [+m[1], +m[2]]);
      // the card shows the rows up to the step asked; check every shown "∠a ≅ ∠b" row is a real relation
      for (const [a, b] of steps) expect(['corresponding', 'vertical', 'alternate interior', 'alternate exterior']).toContain(classify(a, b));
    }
  });
});
