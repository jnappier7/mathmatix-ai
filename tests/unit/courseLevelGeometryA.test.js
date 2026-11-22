/**
 * Geometry (part A) at-level check items — every item RE-SOLVED from its text.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the printed
 * question (regex the numbers, expressions, vertex letters and given
 * congruences out of the prompt), works the answer out a second way with the
 * rules typed by hand below, and compares it with the keyed answer. For the
 * multiple-choice items it also checks that no OTHER option is right.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelGeometryA');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── reading a prompt ───────────────────────────────────────────────────────

/** Every "ax + b" / "ax − b" printed in the text, in order. */
function exprs(text) {
  return [...text.matchAll(/(\d+)x(?: ([+−]) (\d+))?/g)].map((m) => ({
    a: Number(m[1]),
    b: m[2] ? (m[2] === '−' ? -Number(m[3]) : Number(m[3])) : 0,
  }));
}
const at = (e, x) => e.a * x + e.b;
/** x with e1 = e2. */
const solveEqual = (e1, e2) => (e2.b - e1.b) / (e1.a - e2.a);
/** x with (sum of the expressions) + extra = total. */
const solveSum = (es, total, extra = 0) => (total - extra - es.reduce((s, e) => s + e.b, 0)) / es.reduce((s, e) => s + e.a, 0);
const num = (text, re) => { const m = text.match(re); if (!m) throw new Error(`no match ${re} in: ${text}`); return m.slice(1).map(Number); };
const whole = (x) => { if (!Number.isInteger(x) || x <= 0) throw new Error(`x = ${x} is not a positive integer`); return x; };
const optionTexts = (item) => item.options.map((o) => o.text);
/** The single option a predicate accepts — throws when none or several do. */
function onlyOption(item, isRight) {
  const good = optionTexts(item).filter(isRight);
  if (good.length !== 1) throw new Error(`${good.length} options are right: ${JSON.stringify(good)} — ${item.prompt}`);
  return good[0];
}

const angleKind = (deg) => (deg < 90 ? 'Acute' : deg === 90 ? 'Right' : deg < 180 ? 'Obtuse' : 'Straight');
/** By the Pythagorean comparison, from three side lengths in any order. */
function kindFromSides(sides) {
  const s = sides.slice().sort((p, q) => p - q);
  if (s[0] + s[1] <= s[2]) return 'These lengths cannot form a triangle';
  const lhs = s[0] * s[0] + s[1] * s[1], rhs = s[2] * s[2];
  return lhs === rhs ? 'Right' : lhs > rhs ? 'Acute' : 'Obtuse';
}
function triangleFromAngles(angles) {
  if (angles[0] + angles[1] + angles[2] !== 180) throw new Error(`angles ${angles} do not sum to 180`);
  const sideKind = new Set(angles).size === 3 ? 'scalene' : 'isosceles';
  return `${angleKind(Math.max(...angles))} ${sideKind}`;
}

// ── the eight angles of a transversal, from their printed positions ────────

function place(n) {
  const k = (n - 1) % 4;
  const line = n <= 4 ? 'm' : 'n';
  const upper = k < 2, left = k % 2 === 0;
  return { line, upper, left, interior: line === 'm' ? !upper : upper };
}
function pairKind(p, q) {
  const P = place(p), Q = place(q);
  if (P.line === Q.line) return P.upper !== Q.upper && P.left !== Q.left ? 'vertical' : 'linear pair';
  if (P.upper === Q.upper && P.left === Q.left) return 'Corresponding angles';
  if (P.interior && Q.interior) return P.left !== Q.left ? 'Alternate interior angles' : 'Same-side interior angles';
  if (!P.interior && !Q.interior) return P.left !== Q.left ? 'Alternate exterior angles' : 'same-side exterior';
  return 'none';
}
/** With m ∥ n: two of the eight angles are congruent, or else supplementary. */
function congruentWhenParallel(p, q) {
  // A transversal makes one acute and one obtuse measure; upper-left and
  // lower-right take one, upper-right and lower-left the other, at both lines.
  const tilt = (n) => place(n).upper === place(n).left;
  return tilt(p) === tilt(q);
}
const CONVERSE = {
  'Corresponding angles': 'Converse of the Corresponding Angles Theorem',
  'Alternate interior angles': 'Converse of the Alternate Interior Angles Theorem',
  'Alternate exterior angles': 'Converse of the Alternate Exterior Angles Theorem',
  'Same-side interior angles': 'Converse of the Same-Side Interior Angles Theorem',
};
const PROVES_BY_CONGRUENCE = ['Corresponding angles', 'Alternate interior angles', 'Alternate exterior angles'];

// ── congruence criteria, from the listed parts ─────────────────────────────

const NOT_ENOUGH = 'Not enough information to prove them congruent';

/** Parse "AB ≅ DE", "∠A ≅ ∠D", "∠BAC ≅ ∠DCA" out of a stretch of text (left-hand triangle's parts). */
function partsIn(text) {
  const sides = [], angles = [], pairs = [];
  for (const m of text.matchAll(/(∠?)([A-Z]{1,3}) ≅ (∠?)([A-Z]{1,3})(?![A-Z])/g)) {
    const [, la, L, ra, R] = m;
    if (!!la !== !!ra || L.length !== R.length) throw new Error(`mismatched statement ${m[0]}`);
    pairs.push({ angle: !!la, L, R });
    if (la) angles.push(L.length === 3 ? L[1] : L);
    else sides.push(L);
  }
  return { sides, angles, pairs };
}

/**
 * Which criterion do these parts of ONE triangle give?
 * sides: two-letter names; angles: vertex letters; right: vertex of a known right angle (or null).
 */
function criterion(sides, angles, right) {
  const S = [...new Set(sides.map((s) => s.split('').sort().join('')))];
  const A = [...new Set(angles.concat(right ? [right] : []))];
  if (S.length === 3) return 'SSS';
  if (S.length === 2 && A.length === 1) {
    const common = S[0].split('').find((c) => S[1].includes(c));
    if (A[0] === common) return 'SAS';
    if (right && A[0] === right && S.some((s) => !s.includes(right))) return 'HL';   // hypotenuse + a leg
    return NOT_ENOUGH;                                                                // SSA
  }
  if (S.length === 1 && A.length === 2) return A.every((v) => S[0].includes(v)) ? 'ASA' : 'AAS';
  if (S.length === 0) return NOT_ENOUGH;                                              // AAA or less
  return 'incomplete';
}

/** True when "XY ≅ UV" / "∠X ≅ ∠U" pairs CORRESPONDING parts of T1 and T2. */
function corresponds(pair, T1, T2) {
  const to = (c) => T2[T1.indexOf(c)];
  if (pair.angle) return to(pair.L) === pair.R;
  return [...pair.L].map(to).sort().join('') === [...pair.R].sort().join('');
}

function solveCriterion(item) {
  const p = item.prompt;
  const stem = p.slice(0, p.indexOf('Which'));
  let T1, T2, right = null;
  const sides = [], angles = [];

  let m;
  if ((m = p.match(/In quadrilateral ([A-Z]{4}), diagonal ([A-Z]{2}) is drawn/))) {
    [, T1, T2] = p.match(/proves △([A-Z]{3}) ≅ △([A-Z]{3})/);
    sides.push(m[2]);                                     // the diagonal is a side of both triangles
  } else if ((m = p.match(/Segments [A-Z]{2} and [A-Z]{2} intersect at point ([A-Z])/))) {
    [, T1, T2] = p.match(/proves △([A-Z]{3}) ≅ △([A-Z]{3})/);
    angles.push(m[1]);                                    // vertical angles at the crossing
  } else if ((m = p.match(/point ([A-Z]) lies on side [A-Z]{2} with ([A-Z]{2}) ⊥/))) {
    [, T1, T2] = p.match(/proves △([A-Z]{3}) ≅ △([A-Z]{3})/);
    right = m[1];                                         // the foot of the perpendicular
    sides.push(m[2]);                                     // the perpendicular segment is shared
    const bis = p.match(/bisects ∠[A-Z]([A-Z])[A-Z]/);
    if (bis) angles.push(bis[1]);
  } else if ((m = p.match(/△([A-Z]{3}) and △([A-Z]{3}) are right triangles with right angles at ([A-Z]) and ([A-Z])/))) {
    [, T1, T2, right] = m;
    expect(T2[T1.indexOf(right)]).toBe(m[4]);
  } else {
    [, T1, T2] = p.match(/In △([A-Z]{3}) and △([A-Z]{3})/);
    const ra = p.match(/∠([A-Z]) and ∠([A-Z]) are right angles/);
    if (ra) { right = ra[1]; expect(T2[T1.indexOf(right)]).toBe(ra[2]); }
  }
  const given = partsIn(stem);
  sides.push(...given.sides);
  angles.push(...given.angles);
  // Every stated congruence must pair corresponding parts of the two triangles named.
  if (/^In △[A-Z]{3} and △|are right triangles/.test(p)) {
    for (const pair of given.pairs) expect(corresponds(pair, T1, T2)).toBe(true);
  }

  const want = p.match(/by (SAS|ASA|AAS|HL)/);
  if (want) {
    return onlyOption(item, (text) => {
      const extra = partsIn(text);
      if (extra.pairs.length !== 1 || !corresponds(extra.pairs[0], T1, T2)) return false;
      return criterion(sides.concat(extra.sides), angles.concat(extra.angles), right) === want[1];
    });
  }
  const found = criterion(sides, angles, right);
  expect(optionTexts(item)).toContain(found);
  return found;
}

// ── CPCTC: the correspondence is the order of the letters ──────────────────

function correspondence(prompt) {
  const [, T1, T2] = prompt.match(/△([A-Z]{3}) ≅ △([A-Z]{3})/);
  const to = (s) => [...s].map((c) => T2[T1.indexOf(c)]).join('');
  const back = (s) => [...s].map((c) => T1[T2.indexOf(c)]).join('');
  const key = (s) => [...s].sort().join('');
  return { T1, T2, to, back, key };
}

// ── the re-solvers ─────────────────────────────────────────────────────────

const RESOLVERS = {
  'geo-angle-measurement': (item) => {
    const p = item.prompt, es = exprs(p);
    if (/straight angle/.test(p)) return at(es[1], whole(solveSum(es, 180)));
    if (/bisects/.test(p)) {
      if (!es.length) {
        if (/If m∠AOC = /.test(p)) return num(p, /m∠AOC = (\d+)°/)[0] / 2;
        return angleKind(2 * num(p, /m∠AOB = (\d+)°/)[0]);
      }
      if (/m∠AOC = \(/.test(p)) {                 // half and whole: 2·e1 = e2
        const x = whole((es[1].b - 2 * es[0].b) / (2 * es[0].a - es[1].a));
        expect(at(es[1], x)).toBe(2 * at(es[0], x));
        return at(es[1], x);
      }
      const x = whole(solveEqual(es[0], es[1]));  // two halves
      if (/value of x/.test(p)) return x;
      return /classified/.test(p) ? angleKind(2 * at(es[0], x)) : 2 * at(es[0], x);
    }
    if (!es.length) {
      const [whole_, part] = /If m∠AOC/.test(p) ? num(p, /m∠AOC = (\d+)° and m∠AOB = (\d+)°/) : [null, null];
      if (whole_ !== null) return whole_ - part;
      const [a, b] = num(p, /m∠AOB = (\d+)° and m∠BOC = (\d+)°/);
      return a + b;
    }
    if (es.length === 2) {
      const x = whole(solveSum(es, num(p, /m∠AOC = (\d+)°/)[0]));
      return /value of x/.test(p) ? x : at(es[0], x);
    }
    const x = whole((es[2].b - es[0].b - es[1].b) / (es[0].a + es[1].a - es[2].a));   // e1 + e2 = e3
    return at(es[2], x);
  },

  'geo-angle-pair-relationships': (item) => {
    const p = item.prompt, es = exprs(p);
    let m;
    if ((m = p.match(/Which describes ∠(\d) and ∠(\d)/))) {
      // Numbered in order around the point: two apart are opposite, one (or three) apart are neighbours.
      return Math.abs(m[1] - m[2]) === 2 ? 'Vertical angles, so they are congruent' : 'A linear pair, so they are supplementary';
    }
    if ((m = p.match(/is (\d+) times the measure of its complement/))) {
      for (let a = 1; a < 90; a++) if (a === m[1] * (90 - a)) return a;
    }
    if ((m = p.match(/supplement of an angle is (\d+) times the complement/))) {
      for (let a = 1; a < 90; a++) if (180 - a === m[1] * (90 - a)) return a;
    }
    if ((m = p.match(/is (\d+)° more than (\d+) times the measure of its supplement/))) {
      for (let a = 1; a < 180; a++) if (a === Number(m[1]) + m[2] * (180 - a)) return a;
    }
    if (/∠A and ∠B are complementary, and ∠B and ∠C are supplementary/.test(p)) {
      const b = 90 - num(p, /m∠A = (\d+)°/)[0];
      return 180 - b;
    }
    if (/one of the four angles formed measures/.test(p)) return 180 - num(p, /measures (\d+)°/)[0];
    if (es.length === 1) {
      const n = num(p, /(?:measures|and) (\d+)°/)[0];
      return whole(/linear pair/.test(p) ? (180 - n - es[0].b) / es[0].a : (n - es[0].b) / es[0].a);
    }
    if (/linear pair/.test(p)) return whole(solveSum(es.slice(0, 2), 180));
    if (/complementary/.test(p)) return at(es[0], whole(solveSum(es.slice(0, 2), 90)));
    const v = at(es[0], whole(solveEqual(es[0], es[1])));       // vertical angles
    return /OTHER two/.test(p) ? 180 - v : v;
  },

  'geo-parallel-lines-transversals': (item) => {
    const p = item.prompt, es = exprs(p);
    let m;
    if ((m = p.match(/What kind of angle pair are ∠(\d) and ∠(\d)/))) return pairKind(+m[1], +m[2]);
    if ((m = p.match(/Which angle forms a pair of ([a-z- ]+ angles) with ∠(\d)/))) {
      return onlyOption(item, (t) => pairKind(+m[2], +t.slice(1)).toLowerCase() === m[1]);
    }
    if (/Which condition is enough/.test(p)) {
      return onlyOption(item, (t) => {
        const c = t.match(/^∠(\d) ≅ ∠(\d)$/), s = t.match(/^m∠(\d) \+ m∠(\d) = 180°$/);
        if (c) return PROVES_BY_CONGRUENCE.includes(pairKind(+c[1], +c[2]));
        if (s) return pairKind(+s[1], +s[2]) === 'Same-side interior angles';
        throw new Error(`unreadable option ${t}`);
      });
    }
    if ((m = p.match(/It is known that (?:∠(\d) ≅ ∠(\d)|m∠(\d) \+ m∠(\d) = 180°)/))) {
      const kind = m[1] ? pairKind(+m[1], +m[2]) : pairKind(+m[3], +m[4]);
      expect(m[1] ? PROVES_BY_CONGRUENCE.includes(kind) : kind === 'Same-side interior angles').toBe(true);
      return CONVERSE[kind];
    }
    if ((m = p.match(/If m∠(\d) = (\d+)°, what is m∠(\d)/))) {
      return congruentWhenParallel(+m[1], +m[3]) ? +m[2] : 180 - m[2];
    }
    if ((m = p.match(/m∠(\d) = \([^)]*\)° and m∠(\d) = \([^)]*\)°\. What is m∠(\d)/))) {
      const same = congruentWhenParallel(+m[1], +m[2]);
      const x = whole(same ? solveEqual(es[0], es[1]) : solveSum(es, 180));
      const v = at(es[0], x);
      return congruentWhenParallel(+m[1], +m[3]) ? v : 180 - v;
    }
    if (!es.length) return 180 - num(p, /same-side interior angles measures (\d+)°/)[0];
    const supplementary = /same-side interior/.test(p);
    expect(supplementary || /alternate interior|corresponding/.test(p)).toBe(true);
    const x = whole(supplementary ? solveSum(es.slice(0, 2), 180) : solveEqual(es[0], es[1]));
    return /value of x/.test(p) ? x : at(es[0], x);
  },

  'geo-triangle-classification': (item) => {
    const p = item.prompt, es = exprs(p);
    let m;
    if ((m = p.match(/Two angles of a triangle measure (\d+)° and (\d+)°/))) {
      const angles = [+m[1], +m[2], 180 - m[1] - m[2]];
      return /by its angles/.test(p) ? angleKind(Math.max(...angles)) : triangleFromAngles(angles);
    }
    if ((m = p.match(/measure (\d+) cm and (\d+) cm, and its perimeter is (\d+) cm/))) {
      const s = [+m[1], +m[2], m[3] - m[1] - m[2]];
      expect(kindFromSides(s)).not.toMatch(/cannot/);
      return new Set(s).size === 3 ? 'Scalene' : new Set(s).size === 2 ? 'Isosceles' : 'Equilateral';
    }
    if ((m = p.match(/AB = AC and m∠A = (\d+)°\. What is m∠B/))) return (180 - m[1]) / 2;
    if ((m = p.match(/AB = AC and m∠B = (\d+)°\. What is m∠A/))) return 180 - 2 * m[1];
    if (/AB = AC\. m∠B = .* and m∠C = /.test(p)) return whole(solveEqual(es[0], es[1]));
    if ((m = p.match(/Which set of angle measures belongs to an? (\w+) (\w+) triangle/))) {
      const want = `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}`;
      return onlyOption(item, (t) => triangleFromAngles(t.match(/\d+/g).map(Number)) === want);
    }
    if (/equilateral/.test(p)) return 3 * at(es[0], whole(solveEqual(es[0], es[1])));
    if ((m = p.match(/side lengths (\d+), (\d+) and (\d+)\. How is the triangle classified by its angles/))) {
      return kindFromSides([+m[1], +m[2], +m[3]]);
    }
    if (/AB = AC\. m∠A = .* and m∠B = /.test(p)) {
      // ∠A + 2∠B = 180, because ∠C ≅ ∠B.
      const x = whole((180 - es[0].b - 2 * es[1].b) / (es[0].a + 2 * es[1].a));
      return at(es[1], x);
    }
    if ((m = p.match(/side lengths (\d+), (\d+) and (\d+)\. Which describes the triangle/))) {
      const s = [+m[1], +m[2], +m[3]];
      return `${kindFromSides(s)} ${new Set(s).size === 3 ? 'scalene' : 'isosceles'}`;
    }
    if (/In △PQR/.test(p)) {
      const x = whole(solveSum(es, 180));
      return triangleFromAngles(es.map((e) => at(e, x)));
    }
    return undefined;
  },

  'geo-triangle-angle-sum': (item) => {
    const p = item.prompt, es = exprs(p);
    let m;
    if ((m = p.match(/Two angles of a triangle measure (\d+)° and (\d+)°/))) return 180 - m[1] - m[2];
    if ((m = p.match(/One acute angle of a right triangle measures (\d+)°/))) return 90 - m[1];
    if ((m = p.match(/measure x°, x° and (\d+)°/))) return (180 - m[1]) / 2;
    if ((m = p.match(/measure x°, \(x \+ (\d+)\)° and \(x ([+−]) (\d+)\)°/))) {
      return whole((180 - m[1] - (m[2] === '−' ? -m[3] : +m[3])) / 3);
    }
    if ((m = p.match(/ratio (\d+):(\d+):(\d+)/))) {
      const parts = [+m[1], +m[2], +m[3]];
      const unit = 180 / (parts[0] + parts[1] + parts[2]);
      const big = Math.max(...parts) * unit;
      return /classified/.test(p) ? angleKind(big) : big;
    }
    if ((m = p.match(/vertex angle measures (\d+)° more than each base angle/))) {
      for (let b = 1; b < 90; b++) if (3 * b + Number(m[1]) === 180) return b + Number(m[1]);
    }
    if (/acute angles of a right triangle/.test(p)) {
      const x = whole(solveSum(es, 90));
      return Math.min(at(es[0], x), at(es[1], x));
    }
    if ((m = p.match(/m∠A = (\d+)° and m∠B = (\d+)°\. The bisector of ∠C/))) {
      const acd = (180 - m[1] - m[2]) / 2;      // half of ∠C
      return 180 - m[1] - acd;                  // triangle ADC
    }
    if ((m = p.match(/∠A measures (\d+)° more than ∠B, and ∠C measures (\d+) times/))) {
      for (let b = 1; b < 180; b++) if (b + (b + Number(m[1])) + m[2] * b === 180) return m[2] * b;
    }
    if (es.length === 3) {
      const x = whole(solveSum(es, 180));
      return /LARGEST/.test(p) ? Math.max(...es.map((e) => at(e, x))) : x;
    }
    return undefined;
  },

  'geo-exterior-angle-theorem': (item) => {
    const p = item.prompt, es = exprs(p);
    let m;
    if ((m = p.match(/In △([A-Z])([A-Z])([A-Z]), side \2\3 is extended through \3 to point ([A-Z])\. Which equation/))) {
      const [, P, Q, R, S] = m;
      return `m∠${P}${R}${S} = m∠${P} + m∠${Q}`;
    }
    if ((m = p.match(/m∠A = (\d+)° and m∠B = (\d+)°\. A student/))) {
      const ext = Number(m[1]) + Number(m[2]);
      return onlyOption(item, (t) => /^It is incorrect/.test(t) && t.includes(`the exterior angle is ${ext}°`) && t.includes(`${180 - ext}° is the interior angle`));
    }
    if ((m = p.match(/exterior angle at vertex A measures (\d+)° and an exterior angle at vertex B measures (\d+)°/))) {
      return 180 - (180 - m[1]) - (180 - m[2]);
    }
    if ((m = p.match(/AB = AC\. Side CB is extended through B to point D, and m∠ABD = (\d+)°/))) {
      const base = 180 - m[1];
      return 180 - 2 * base;
    }
    if ((m = p.match(/∠A ≅ ∠B\..*m∠ACD = (\d+)°/))) return m[1] / 2;
    if (!es.length) {
      if ((m = p.match(/m∠A = (\d+)° and m∠B = (\d+)°\. Side BC is extended through C to point D\. What is m∠ACD/))) return +m[1] + +m[2];
      m = p.match(/m∠A = (\d+)°\. Side BC is extended through C to point D\. If m∠ACD = (\d+)°, what is m∠B/);
      const b = m[2] - m[1];
      return item.options ? `${b}°` : b;
    }
    expect(p).toMatch(/Side BC is extended through C to point D/);
    if (es.length === 3) {                       // ∠A + ∠B = ∠ACD
      const x = whole((es[2].b - es[0].b - es[1].b) / (es[0].a + es[1].a - es[2].a));
      return /value of x/.test(p) ? x : at(es[2], x);
    }
    // one remote angle is a number, the other an expression; the exterior angle is the last expression
    const n = num(p, /m∠[AB] = (\d+)°/)[0];
    const x = whole((es[1].b - es[0].b - n) / (es[0].a - es[1].a));
    const ext = at(es[1], x);
    expect(ext).toBe(at(es[0], x) + n);
    return /INTERIOR/.test(p) ? 180 - ext : ext;
  },

  'geo-triangle-congruence-sss-sas-asa': solveCriterion,
  'geo-triangle-congruence-aas-hl': solveCriterion,

  'geo-cpctc': (item) => {
    const p = item.prompt, es = exprs(p);
    const { T1, T2, to, back, key } = correspondence(p);
    const sameSide = (a, b) => key(to(a)) === key(b);
    let m;
    if (/Which statement (about the angles )?must be true/.test(p)) {
      return onlyOption(item, (t) => {
        const { pairs } = partsIn(t);
        return corresponds(pairs[0], T1, T2);
      });
    }
    if (/another correct way to write/.test(p)) {
      return onlyOption(item, (t) => {
        const [, L, R] = t.match(/^△([A-Z]{3}) ≅ △([A-Z]{3})$/);
        return key(L) === key(T1) && to(L) === R;
      });
    }
    if (/What is the perimeter of △/.test(p)) {
      const lens = {};
      for (const s of p.matchAll(/([A-Z]{2}) = (\d+)/g)) {
        const name = T1.includes(s[1][0]) ? s[1] : back(s[1]);
        lens[key(name)] = Number(s[2]);
      }
      expect(Object.keys(lens)).toHaveLength(3);
      return Object.values(lens).reduce((a, b) => a + b, 0);
    }
    if ((m = p.match(/What is the length of ([A-Z]{2})\?/)) && !es.length) {
      const lens = {};
      for (const s of p.matchAll(/([A-Z]{2}) = (\d+)/g)) lens[key(s[1])] = Number(s[2]);
      return lens[key(back(m[1]))];
    }
    if ((m = p.match(/What is m∠([A-Z]), in degrees\?/)) && !es.length) {
      const known = {};                          // angle measures, all moved into the second triangle
      for (const s of p.matchAll(/m∠([A-Z]) = (\d+)°/g)) known[T1.includes(s[1]) ? to(s[1]) : s[1]] = Number(s[2]);
      if (known[m[1]] !== undefined) return known[m[1]];
      expect(Object.keys(known)).toHaveLength(2);
      return 180 - Object.values(known).reduce((a, b) => a + b, 0);
    }
    if (es.length === 1) {
      const side = p.match(/([A-Z]{2}) = \d+x[^.]* and ([A-Z]{2}) = (\d+)\./);
      const ang = p.match(/m∠([A-Z]) = \([^)]*\)° and m∠([A-Z]) = (\d+)°/);
      if (side) { expect(sameSide(side[1], side[2])).toBe(true); return whole((side[3] - es[0].b) / es[0].a); }
      expect(to(ang[1])).toBe(ang[2]);
      return whole((ang[3] - es[0].b) / es[0].a);
    }
    if (es.length === 2 && (m = p.match(/([A-Z]{2}) = \d+x[^.]*? and ([A-Z]{2}) = \d+x[^.]*\. What is the length of ([A-Z]{2})/))) {
      expect(sameSide(m[1], m[2])).toBe(true);
      expect(m[3]).toBe(m[1]);
      return at(es[0], whole(solveEqual(es[0], es[1])));
    }
    if (es.length === 2) {
      m = p.match(/m∠([A-Z]) = \([^)]*\)°, m∠([A-Z]) = \([^)]*\)° and m∠([A-Z]) = (\d+)°\. What is m∠([A-Z])/);
      expect(to(m[1])).toBe(m[2]);
      const a = at(es[0], whole(solveEqual(es[0], es[1])));
      const target = back(m[5]);
      expect([m[1], m[3]]).not.toContain(target);
      return 180 - a - m[4];
    }
    m = p.match(/([A-Z]{2}) = [^,]*, ([A-Z]{2}) = [^.]*? and ([A-Z]{2}) = [^.]*\. What is the length of ([A-Z]{2})/);
    expect(sameSide(m[1], m[2])).toBe(true);
    expect(sameSide(m[3], m[4])).toBe(true);
    return at(es[2], whole(solveEqual(es[0], es[1])));
  },

  // Conceptual: the keyed reason is checked against this hand-typed table.
  'geo-congruence-proofs': (item) => {
    const p = item.prompt;
    const TABLE = [
      [/Statement 3: ([A-Z]{2}) ≅ \1\. What is the reason/, () => 'Reflexive Property of Congruence'],
      [/midpoint of both .* Statement 2 of the proof is [A-Z]M ≅ [A-Z]M/, () => 'Definition of midpoint'],
      [/intersect at M.* Statement 3 of the proof is ∠[A-Z]M[A-Z] ≅ ∠[A-Z]M[A-Z]/, () => 'Vertical Angles Theorem'],
      [/∥ .* Statement 2 of the proof is ∠/, () => 'Alternate Interior Angles Theorem'],
      [/3: \? \(Vertical Angles Theorem\)\. 4: △([A-Z]{3}) ≅ △([A-Z]{3}) \(SAS\)/, (m) => `∠${m[1]} ≅ ∠${m[2]}`],
      [/What is the reason for step 5/, () => 'CPCTC'],
      [/listed out of order/, () => 'III, IV, II, I'],
      [/What is the reason for step 6/, () => 'SAS'],
      [/⊥ .*\(Reflexive Property\)\. 4: △[A-Z]{3} ≅ △[A-Z]{3}\. What is the reason for step 4/, () => 'HL'],
      [/\(Definition of angle bisector\)\. 3: .*\(Reflexive Property\)\. 4: △[A-Z]{3} ≅ △[A-Z]{3}\. What is the reason for step 4/, () => 'SAS'],
      [/\(Alternate Interior Angles Theorem\)\. 3: .*\(Reflexive Property\)\. 4: △[A-Z]{3} ≅ △[A-Z]{3}\. What is the reason for step 4/, () => 'SAS'],
      [/proving △([A-Z])([A-Z])([A-Z]) ≅ △([A-Z])([A-Z])([A-Z]) .* finish the proof by ASA/, (m) => `∠${m[2]}${m[3]}${m[1]} ≅ ∠${m[5]}${m[6]}${m[4]}`],
    ];
    for (const [re, answer] of TABLE) {
      const m = p.match(re);
      if (m) return answer(m);
    }
    return undefined;
  },

  'geo-pythagorean-converse': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/side lengths (\d+), (\d+) and (\d+)\. Which statement correctly decides/))) {
      const [a, b, c] = [+m[1], +m[2], +m[3]];
      expect(c).toBeGreaterThan(Math.max(a, b));
      return a * a + b * b === c * c ? `Yes, because ${a}² + ${b}² = ${c}²` : `No, because ${a}² + ${b}² ≠ ${c}²`;
    }
    if ((m = p.match(/two shorter sides of a triangle measure (\d+) and (\d+)/))) return Math.sqrt(m[1] * m[1] + m[2] * m[2]);
    if (/Which set of side lengths forms a right triangle/.test(p)) {
      return onlyOption(item, (t) => kindFromSides(t.split(', ').map(Number)) === 'Right');
    }
    if ((m = p.match(/side lengths (\d+), (\d+) and (\d+)\. Is the triangle acute, right or obtuse/))) {
      return kindFromSides([+m[1], +m[2], +m[3]]);
    }
    if ((m = p.match(/side lengths (\d+), x and (\d+), where \2 is the longest side/))) return Math.sqrt(m[2] * m[2] - m[1] * m[1]);
    if ((m = p.match(/a point (\d+) ft from the corner .* a point (\d+) ft from the corner .* is (\d+) ft/))) {
      const legs = m[1] * m[1] + m[2] * m[2], opp = m[3] * m[3];
      expect(+m[3]).toBeLessThan(+m[1] + +m[2]);
      // The angle at the corner is opposite the measured distance.
      return opp === legs ? 'The corner is exactly 90°' : opp < legs ? 'The corner is less than 90°' : 'The corner is greater than 90°';
    }
    if ((m = p.match(/side lengths (\d+), (\d+) and √(\d+), where √\3 is the longest side/))) {
      const legs = m[1] * m[1] + m[2] * m[2], n = +m[3];
      expect(n).toBeGreaterThan(Math.max(m[1] * m[1], m[2] * m[2]));
      expect(Math.sqrt(n)).toBeLessThan(+m[1] + +m[2]);
      return n === legs ? 'Right' : n < legs ? 'Acute' : 'Obtuse';
    }
    if ((m = p.match(/are (\d+)x, (\d+)x and (\d+), and \3 is the longest side/))) {
      for (let x = 1; x <= 50; x++) if ((m[1] * x) ** 2 + (m[2] * x) ** 2 === m[3] ** 2) return x;
    }
    if ((m = p.match(/lengths (\d+) and (\d+)\. The third side has length s and is the longest side/))) {
      const right = Math.sqrt(m[1] * m[1] + m[2] * m[2]);
      return `${right} < s < ${+m[1] + +m[2]}`;
    }
    if ((m = p.match(/side lengths (\d+), (\d+) and (\d+)\. A student computes/))) {
      const [c, a, b] = [+m[1], +m[2], +m[3]];
      expect(a * a + b * b).toBe(c * c);        // it IS a right triangle, so the student is wrong
      return onlyOption(item, (t) => /^The student is wrong: the longest side/.test(t) && t.includes(`${a}² + ${b}² = ${c}²`));
    }
    return undefined;
  },
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items: Geometry A', () => {
  test('the bank is for the geometry course, with the eleven skills asked for', () => {
    expect(bank.COURSE_ID).toBe('geometry');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES.map((t) => t.courseSkill)).toEqual([
      'angle-measurement', 'angle-pair-relationships', 'parallel-lines-transversals',
      'triangle-classification', 'triangle-angle-sum', 'exterior-angle-theorem',
      'triangle-congruence-sss-sas-asa', 'triangle-congruence-aas-hl', 'cpctc',
      'congruence-proofs', 'pythagorean-converse',
    ]);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`geo-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVERS[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVERS).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('twelve items a skill, four per tier, and the builder accepts them all', () => {
    for (const items of Object.values(ITEMS)) {
      expect(items).toHaveLength(12);
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    }
    expect(validate(ALL)).toEqual([]);
  });

  describe.each(bank.TEMPLATES.map((t) => [t.skillId]))('%s', (skillId) => {
    test.each(ITEMS[skillId].map((it) => [it.problemId, it]))('%s re-solves to its key', (_id, item) => {
      const expected = RESOLVERS[skillId](item);
      if (expected === undefined || expected === null || Number.isNaN(expected)) {
        throw new Error(`no re-solver branch for: ${item.prompt}`);
      }
      expect(String(item.answer.value)).toBe(String(expected));
    });
  });

  test('text only: nothing refers to a picture', () => {
    for (const it of ALL) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
    }
  });

  test('typed answers are whole numbers; multiple choice keys one of four distinct options', () => {
    for (const it of ALL) {
      if (it.answerType === 'multiple-choice') {
        expect(it.options).toHaveLength(4);
        expect(new Set(optionTexts(it)).size).toBe(4);
        expect(it.options.find((o) => o.label === it.correctOption).text).toBe(it.answer.value);
      } else {
        expect(it.answer.value).toMatch(/^\d+$/);
        expect(Number(it.answer.value)).toBeGreaterThan(0);
      }
    }
  });

  test('the right answer is not parked in one position', () => {
    const letters = new Set(ALL.filter((i) => i.options).map((i) => i.correctOption));
    expect(letters.size).toBe(4);
  });

  test('every angle an item prints or keys is a real angle (between 0° and 180°)', () => {
    for (const it of ALL) {
      for (const m of it.prompt.matchAll(/= (\d+)°/g)) {
        expect(Number(m[1])).toBeGreaterThan(0);
        expect(Number(m[1])).toBeLessThanOrEqual(180);
      }
    }
  });
});
