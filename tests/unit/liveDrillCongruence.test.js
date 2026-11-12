/**
 * Triangle Congruence Fluency (utils/liveDrill/fluency/congruence.js).
 *
 * Every template reports the marks it drew ({ sides, angles, right, shared }); this file
 * re-derives the shortcut from those marks ALONE — the rules typed here by hand, never read from
 * the bank — and checks the answer the template claims. It also pins what makes it a fluency
 * game: six buttons in one fixed order every play, every shortcut reachable, honest "Not
 * congruent" pictures (a different triangle that shares the marked parts), and the drill's
 * registration (fast clocks, server-graded).
 */
const C = require('../../utils/liveDrill/fluency/congruence');
const { DRILLS, dealPlay, listPlaybooks } = require('../../utils/liveDrill/engine');

const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

/**
 * The shortcut from the marks, by the book. Side i is opposite vertex i. For two separate
 * triangles the right angle counts as a marked angle only when the template says it does
 * (`rightCounts`); HL is right angle + hypotenuse (side opposite it) + a leg. On a shared side,
 * side 0 (the shared side) always counts (Reflexive); angle 0 is the apex, 1 at B, 2 at D.
 */
function derive(m) {
  const sides = new Set(m.sides); const angles = new Set(m.angles);
  if (m.right != null && m.rightCounts) angles.add(m.right);
  const S = sides.size; const A = angles.size;
  const included = (s) => !angles.has(s) && [...angles].every((v) => v !== s); // an angle is between two sides iff its vertex is not opposite either
  if (m.right != null && !m.rightCounts && sides.has(m.right) && S === 2 && A === 0) return 'HL'; // hypotenuse (opposite the right angle) + a leg
  if (S === 3) return 'SSS';
  if (S === 2 && A === 1) {
    const [v] = [...angles];
    // the angle is INCLUDED iff its vertex is the one shared by both marked sides: the sides opposite the OTHER two vertices
    const sidesMeetingAt = (vertex) => [0, 1, 2].filter((i) => i !== vertex);
    return sidesMeetingAt(v).every((i) => sides.has(i)) ? 'SAS' : C.NONE;
  }
  if (A === 2 && S === 1) {
    const [s] = [...sides];
    // the side is INCLUDED iff it runs between the two marked vertices, i.e. it is opposite the third vertex
    const third = [0, 1, 2].find((i) => !angles.has(i));
    return s === third ? 'ASA' : 'AAS';
  }
  void included;
  return C.NONE;
}

describe('the bank', () => {
  test('is registered as a graded fluency game on the fast clocks, with its four books', () => {
    expect(DRILLS.congruence).toMatchObject({ scoring: 'facts', graded: true, title: 'Honors Geometry · Triangle Congruence Fluency' });
    expect(listPlaybooks('congruence').map((b) => b.key)).toEqual(['all', 'basic', 'right', 'shared']);
  });

  test('six buttons, the same order every play; a drawn figure every play', () => {
    for (let n = 1; n <= 60; n++) {
      const p = dealPlay('congruence', 'all', 'fixed-order', n, []);
      expect(p.choices.map((c) => c.html)).toEqual(['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'Not congruent']);
      expect(p.choices.map((c) => c.k)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(p.card).toMatch(/<svg class="congr"/);
      expect(p.card.match(/<polygon/g)).toHaveLength(2);
      expect(p.answer).toMatch(/^[a-f]$/);
    }
  });

  test('every shortcut and the no-shortcut case come up in a mixed round, and books hold what they say', () => {
    const count = (book, n = 160) => {
      const seen = {};
      for (let i = 1; i <= n; i++) { const p = dealPlay('congruence', book, `cov-${book}`, i, []); const a = p.choices.find((c) => c.k === p.answer).html; seen[a] = (seen[a] || 0) + 1; }
      return seen;
    };
    const all = count('all');
    for (const k of ['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'Not congruent']) expect(all[k]).toBeGreaterThan(3);
    expect(all['Not congruent'] / 160).toBeLessThan(0.4); // most plays have a shortcut
    expect(count('right').HL).toBeGreaterThan(10);
    expect(count('basic').HL).toBeUndefined();
  });
});

describe('every template answers what its marks say', () => {
  const ids = Object.keys(C.TEMPLATES);
  test.each(ids)('%s', (id) => {
    const tpl = C.TEMPLATES[id];
    for (let s = 1; s <= 40; s++) {
      const t = tpl.make(rng(s * 7919 + id.length));
      expect(t.fixed).toBe(true);
      expect(t.choices).toEqual(C.CHOICES);
      const claimed = C.CHOICES[t.answer];
      expect(claimed).toBe(t.marks.ans);
      expect(derive(t.marks)).toBe(claimed);
      expect(t.fig).toMatch(/<svg/);
      expect(t.tell.length).toBeGreaterThan(10);
      if (claimed === C.NONE) expect(t.marks.why).toBeTruthy();
    }
  });
});

describe('the pictures tell the truth', () => {
  const { scalene, rightTri, ssaPair, sharedFigure, angleAt, dist } = C._geom;

  test('a scalene triangle is scalene with no tiny angle; a right triangle has its right angle at C', () => {
    for (let s = 1; s <= 30; s++) {
      const t = scalene(rng(s));
      for (let i = 0; i < 3; i++) expect(angleAt(t, i)).toBeGreaterThanOrEqual(27.5);
      const r = rightTri(rng(s));
      expect(Math.round(angleAt(r, 2))).toBe(90);
      expect(dist(r[0], r[1])).toBeGreaterThan(Math.max(dist(r[0], r[2]), dist(r[1], r[2]))); // side 2 is the hypotenuse
    }
  });

  test('the SSA pair really is two different triangles with the same two sides and the same non-included angle', () => {
    for (let s = 1; s <= 30; s++) {
      const [t1, t2] = ssaPair(rng(s));
      expect(Math.abs(angleAt(t1, 0) - angleAt(t2, 0))).toBeLessThan(0.01); // angle A
      expect(Math.abs(dist(t1[0], t1[2]) - dist(t2[0], t2[2]))).toBeLessThan(0.01); // AC
      expect(Math.abs(dist(t1[1], t1[2]) - dist(t2[1], t2[2]))).toBeLessThan(0.01); // BC
      expect(Math.abs(dist(t1[0], t1[1]) - dist(t2[0], t2[1]))).toBeGreaterThan(20); // AB differs: not congruent
    }
  });

  test('on a shared side the mirror image is congruent, and the SSA partner matches the marked parts but not the triangle', () => {
    for (let s = 1; s <= 30; s++) {
      const f = sharedFigure(rng(s), 'SSS');
      expect(Math.abs(dist(f.A, f.B) - dist(f.C, f.B))).toBeLessThan(0.01);
      expect(Math.abs(dist(f.A, f.D) - dist(f.C, f.D))).toBeLessThan(0.01);
      const g = sharedFigure(rng(s + 100), 'SSA');
      expect(Math.abs(dist(g.A, g.B) - dist(g.C, g.B))).toBeLessThan(0.5); // AB ≅ CB
      expect(Math.abs(angleAt(g.tri1, 2) - angleAt(g.tri2, 2))).toBeLessThan(0.5); // the angle at D
      expect(Math.abs(dist(g.A, g.D) - dist(g.C, g.D))).toBeGreaterThan(20); // AD ≠ CD: a different triangle
    }
  });
});
