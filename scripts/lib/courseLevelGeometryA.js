'use strict';
/**
 * At-level check items for high-school Geometry, part A: angles, parallel
 * lines, triangle classification and angle sums, congruence criteria, CPCTC,
 * congruence proofs and the Pythagorean converse.
 *
 * No picture exists for any of these, so every configuration is described in
 * words with a fixed convention (named points, "side BC is extended through C
 * to D", the eight numbered angles of a transversal). Answers are computed from
 * the numbers drawn; tests/unit/courseLevelGeometryA.test.js re-solves every
 * item from its printed text.
 */

const K = require('./templateKit');
const { int, pick, signed } = K;

const COURSE_ID = 'geometry';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

/** A linear expression "ax + b" (a >= 2, b != 0) worth V when x is the given value. */
function mkExpr(r, x, V, avoid = []) {
  const a0 = Math.max(2, Math.round(V / x));
  const cands = [a0 - 1, a0, a0 + 1, a0 + 2, a0 + 3].filter((a) => a >= 2 && !avoid.includes(a) && V - a * x !== 0);
  const a = cands[int(r, 0, Math.min(2, cands.length - 1))];
  const b = V - a * x;
  return { a, b, v: V, s: `${a}x ${signed(b)}` };
}
const deg = (e) => `(${e.s})°`;

/** Multiple choice: the right answer and its three mistakes, right answer at a drawn position. */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((t) => t !== c).slice(0, 3);
  if (w.length < 3) throw new Error(`fewer than 3 distinct distractors for ${c}`);
  const pos = int(r, 0, 3);
  const options = w.slice();
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

/** Multiple choice over a fixed list of four labels, rotated by a drawn amount. */
function mcFixed(r, list, correct) {
  const shift = int(r, 0, 3);
  const options = list.map((_, i) => list[(i + shift) % 4]);
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const listAnd = (parts) => `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

// ── parallel lines: the eight numbered angles ──────────────────────────────

const NUMBERED = 'At line m the four angles are ∠1 (upper left), ∠2 (upper right), ∠3 (lower left) and ∠4 (lower right). '
  + 'At line n they are ∠5 (upper left), ∠6 (upper right), ∠7 (lower left) and ∠8 (lower right).';
const CUT = `Line m lies above line n, and transversal t crosses both. ${NUMBERED}`;
const PAR_CUT = `Parallel lines m and n are cut by transversal t, with m above n. ${NUMBERED}`;

const PAIR_KINDS = ['Corresponding angles', 'Alternate interior angles', 'Alternate exterior angles', 'Same-side interior angles'];
const PAIRS = {
  'Corresponding angles': [[1, 5], [2, 6], [3, 7], [4, 8]],
  'Alternate interior angles': [[3, 6], [4, 5]],
  'Alternate exterior angles': [[1, 8], [2, 7]],
  'Same-side interior angles': [[3, 5], [4, 6]],
};
// Angles 1, 4, 5, 8 are congruent to each other when m ∥ n; so are 2, 3, 6, 7.
const sameClass = (p, q) => [1, 4, 5, 8].includes(p) === [1, 4, 5, 8].includes(q);

// ── triangles for classification ───────────────────────────────────────────

const ACUTE_SCALENE = [[50, 60, 70], [40, 65, 75], [55, 58, 67], [48, 62, 70], [35, 70, 75], [44, 56, 80]];
function anglesOfType(r, angleType, sideType) {
  if (angleType === 'Right') {
    if (sideType === 'isosceles') return [90, 45, 45];
    const a = int(r, 20, 40);
    return [90, a, 90 - a];
  }
  if (angleType === 'Obtuse') {
    if (sideType === 'isosceles') { const v = 2 * int(r, 50, 70); return [v, (180 - v) / 2, (180 - v) / 2]; }
    const v = int(r, 95, 130);
    const a = int(r, 15, Math.floor((180 - v) / 2) - 1);
    return [v, a, 180 - v - a];
  }
  if (sideType === 'isosceles') {
    let v = 2 * int(r, 20, 40);
    if (v === 60) v = 64;
    return [v, (180 - v) / 2, (180 - v) / 2];
  }
  return pick(r, ACUTE_SCALENE).slice();
}

const RIGHT_TRIPLES = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20], [9, 40, 41], [20, 21, 29], [15, 20, 25]];
const sq = (n) => n * n;
/** Acute / Right / Obtuse from three side lengths (any order). */
function bySides(sides) {
  const [a, b, c] = sides.slice().sort((x, y) => x - y);
  const s = sq(a) + sq(b);
  return s === sq(c) ? 'Right' : s > sq(c) ? 'Acute' : 'Obtuse';
}

// ── congruence criteria ────────────────────────────────────────────────────

const TRI_NAMES = [['ABC', 'DEF'], ['PQR', 'STU'], ['JKL', 'MNP'], ['RST', 'XYZ'], ['GHJ', 'KLM']];
const NOT_ENOUGH = 'Not enough information to prove them congruent';
const OPTS_SSS = ['SSS', 'SAS', 'ASA', NOT_ENOUGH];
const OPTS_AAS = ['ASA', 'AAS', 'HL', NOT_ENOUGH];

const sideSt = (T1, T2, i, j) => `${T1[i]}${T1[j]} ≅ ${T2[i]}${T2[j]}`;
const angSt = (T1, T2, i) => `∠${T1[i]} ≅ ∠${T2[i]}`;

/** The three given congruences for a named case; v is the "special" vertex, u and w the others. */
function givens(kind, T1, T2, v, u, w) {
  switch (kind) {
    case 'SSS': return [sideSt(T1, T2, Math.min(u, v), Math.max(u, v)), sideSt(T1, T2, Math.min(v, w), Math.max(v, w)), sideSt(T1, T2, Math.min(u, w), Math.max(u, w))];
    case 'SAS': return [sideSt(T1, T2, Math.min(u, v), Math.max(u, v)), angSt(T1, T2, v), sideSt(T1, T2, Math.min(v, w), Math.max(v, w))];
    case 'SSA': return [sideSt(T1, T2, Math.min(u, v), Math.max(u, v)), sideSt(T1, T2, Math.min(v, w), Math.max(v, w)), angSt(T1, T2, u)];
    case 'ASA': return [angSt(T1, T2, u), sideSt(T1, T2, Math.min(u, w), Math.max(u, w)), angSt(T1, T2, w)];
    case 'AAS': return [angSt(T1, T2, u), angSt(T1, T2, w), sideSt(T1, T2, Math.min(u, v), Math.max(u, v))];
    case 'AAA': return [angSt(T1, T2, 0), angSt(T1, T2, 1), angSt(T1, T2, 2)];
    default: throw new Error(kind);
  }
}

const WHY = {
  SSS: 'All three pairs of sides are congruent, which is SSS.',
  SAS: 'Two pairs of sides and the angle BETWEEN them are congruent, which is SAS. If the angle were not between the two sides it would be SSA, which proves nothing.',
  ASA: 'Two pairs of angles and the side BETWEEN them are congruent, which is ASA. If the side were not between the two angles it would be AAS instead.',
  AAS: 'Two pairs of angles and a side that is NOT between them are congruent, which is AAS. If the side were between the two angles it would be ASA.',
  SSA: 'The angle is not between the two sides, so this is SSA. Two different triangles can share those parts, so it is not enough — the usual slip is to call it SAS.',
  AAA: 'Three pairs of congruent angles make the triangles the same shape (similar) but not necessarily the same size, so no side is fixed and AAA proves nothing.',
};

function criterionItem(r, kind, optionList, { scramble = false } = {}) {
  const [T1, T2] = pick(r, TRI_NAMES);
  const [v, u, w] = shuffle(r, [0, 1, 2]);
  let g = givens(kind, T1, T2, v, u, w);
  if (scramble) g = shuffle(r, g);
  const correct = kind === 'SSA' || kind === 'AAA' ? NOT_ENOUGH : kind;
  return {
    prompt: `In △${T1} and △${T2}, ${listAnd(g)}. Which criterion, if any, proves △${T1} ≅ △${T2}?`,
    ...mcFixed(r, optionList, correct),
    explanation: WHY[kind],
  };
}

// ── CPCTC ──────────────────────────────────────────────────────────────────

function congruentPair(r) {
  const [T1, base] = pick(r, TRI_NAMES);
  let T2 = base;
  while (T2 === base) T2 = shuffle(r, base.split('')).join('');
  return [T1, T2];
}
const PAIRS3 = [[0, 1], [1, 2], [0, 2]];

// ── proofs: letter sets ────────────────────────────────────────────────────

const QUADS = ['ABCD', 'PQRS', 'WXYZ', 'EFGH'];

const TEMPLATES = [
  // ── 1 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'angle-measurement',
    skillId: 'geo-angle-measurement',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const p = int(r, 24, 68), q = int(r, 22, 64);
        switch (idx % 4) {
          case 0:
            return { prompt: `Point B lies in the interior of ∠AOC. If m∠AOB = ${p}° and m∠BOC = ${q}°, what is m∠AOC, in degrees?`,
              value: p + q,
              explanation: `By the Angle Addition Postulate, m∠AOC = m∠AOB + m∠BOC = ${p} + ${q} = ${p + q}°. The usual slip is to subtract instead of add.` };
          case 1: {
            const t = 2 * int(r, 31, 79);
            return { prompt: `Ray OB bisects ∠AOC. If m∠AOC = ${t}°, what is m∠AOB, in degrees?`,
              value: t / 2,
              explanation: `A bisector cuts an angle into two congruent angles, so m∠AOB = ${t} ÷ 2 = ${t / 2}°. Doubling instead of halving gives ${2 * t}°, which is the common slip.` };
          }
          case 2:
            return { prompt: `Point B lies in the interior of ∠AOC. If m∠AOC = ${p + q}° and m∠AOB = ${p}°, what is m∠BOC, in degrees?`,
              value: q,
              explanation: `m∠AOB + m∠BOC = m∠AOC, so m∠BOC = ${p + q} − ${p} = ${q}°. Adding the two given measures (${2 * p + q}°) is the usual slip.` };
          default: {
            const h = pick(r, [int(r, 22, 43), 45, int(r, 47, 85), int(r, 50, 88)]);
            const kind = h < 45 ? 'Acute' : h === 45 ? 'Right' : 'Obtuse';
            return { prompt: `Ray OB bisects ∠AOC, and m∠AOB = ${h}°. How is ∠AOC classified?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'Straight'], kind),
              explanation: `The bisector makes two congruent halves, so m∠AOC = 2 × ${h} = ${2 * h}°, which is ${kind.toLowerCase()}. Classifying the half-angle ${h}° instead of the whole angle is the usual slip.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0:
          case 1: {
            const e1 = mkExpr(r, x, int(r, 30, 70)), e2 = mkExpr(r, x, int(r, 20, 60));
            const total = e1.v + e2.v;
            const askX = idx % 4 === 0;
            return { prompt: `Point B lies in the interior of ∠AOC. m∠AOB = ${deg(e1)}, m∠BOC = ${deg(e2)} and m∠AOC = ${total}°. ${askX ? 'What is the value of x?' : 'What is m∠AOB, in degrees?'}`,
              value: askX ? x : e1.v,
              explanation: `Angle addition: (${e1.s}) + (${e2.s}) = ${total}, so ${e1.a + e2.a}x ${signed(e1.b + e2.b)} = ${total} and x = ${x}. Then m∠AOB = ${e1.a}(${x}) ${signed(e1.b)} = ${e1.v}°. Setting the two parts equal to each other is the usual slip — that is only true for a bisector.` };
          }
          case 2: {
            const e1 = mkExpr(r, x, int(r, 25, 80)), e2 = mkExpr(r, x, e1.v, [e1.a]);
            return { prompt: `Ray OB bisects ∠AOC. m∠AOB = ${deg(e1)} and m∠BOC = ${deg(e2)}. What is the value of x?`,
              value: x,
              explanation: `A bisector makes the two parts congruent: ${e1.s} = ${e2.s}, which gives x = ${x} (each part is ${e1.v}°). Adding the expressions and setting the sum to 180 is the usual slip.` };
          }
          default: {
            const e1 = mkExpr(r, x, int(r, 25, 80));
            const e2 = mkExpr(r, x, 2 * e1.v, [2 * e1.a]);
            return { prompt: `Ray OB bisects ∠AOC. m∠AOB = ${deg(e1)} and m∠AOC = ${deg(e2)}. What is m∠AOC, in degrees?`,
              value: e2.v,
              explanation: `The whole angle is twice the half: 2(${e1.s}) = ${e2.s}, so x = ${x} and m∠AOC = ${e2.a}(${x}) ${signed(e2.b)} = ${e2.v}°. Setting ${e1.s} equal to ${e2.s} forgets to double the half.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const e1 = mkExpr(r, x, int(r, 30, 70)), e2 = mkExpr(r, x, int(r, 20, 60));
            const e3 = mkExpr(r, x, e1.v + e2.v, [e1.a + e2.a]);
            return { prompt: `Point B lies in the interior of ∠AOC. m∠AOB = ${deg(e1)}, m∠BOC = ${deg(e2)} and m∠AOC = ${deg(e3)}. What is m∠AOC, in degrees?`,
              value: e3.v,
              explanation: `Angle addition: (${e1.s}) + (${e2.s}) = ${e3.s}, so x = ${x}. Then m∠AOC = ${e3.a}(${x}) ${signed(e3.b)} = ${e3.v}° (check: ${e1.v}° + ${e2.v}°). Stopping at x = ${x} without substituting back is the usual slip.` };
          }
          case 1: {
            const e1 = mkExpr(r, x, int(r, 25, 80)), e2 = mkExpr(r, x, e1.v, [e1.a]);
            return { prompt: `Ray OB bisects ∠AOC. m∠AOB = ${deg(e1)} and m∠BOC = ${deg(e2)}. What is m∠AOC, in degrees?`,
              value: 2 * e1.v,
              explanation: `The halves are congruent: ${e1.s} = ${e2.s}, so x = ${x} and each half is ${e1.v}°. The whole angle is 2 × ${e1.v} = ${2 * e1.v}°. Answering ${e1.v}° gives only one half.` };
          }
          case 2: {
            const v1 = int(r, 28, 62), v2 = int(r, 34, 70);
            const e1 = mkExpr(r, x, v1), e2 = mkExpr(r, x, v2), e3 = mkExpr(r, x, 180 - v1 - v2);
            return { prompt: `Points A, O and D lie on a line, with O between A and D. Rays OB and OC lie on the same side of that line, so that ∠AOB, ∠BOC and ∠COD are side by side, do not overlap, and together make the straight angle ∠AOD. m∠AOB = ${deg(e1)}, m∠BOC = ${deg(e2)} and m∠COD = ${deg(e3)}. What is m∠BOC, in degrees?`,
              value: v2,
              explanation: `The three angles fill a straight angle: (${e1.s}) + (${e2.s}) + (${e3.s}) = 180, so ${e1.a + e2.a + e3.a}x ${signed(e1.b + e2.b + e3.b)} = 180 and x = ${x}. Then m∠BOC = ${e2.a}(${x}) ${signed(e2.b)} = ${v2}°. Using 360 or 90 for the total is the usual slip.` };
          }
          default: {
            const h = pick(r, [int(r, 26, 43), 45, int(r, 47, 80), int(r, 52, 85)]);
            const e1 = mkExpr(r, x, h), e2 = mkExpr(r, x, h, [e1.a]);
            const kind = h < 45 ? 'Acute' : h === 45 ? 'Right' : 'Obtuse';
            return { prompt: `Ray OB bisects ∠AOC. m∠AOB = ${deg(e1)} and m∠BOC = ${deg(e2)}. How is ∠AOC classified?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'Straight'], kind),
              explanation: `${e1.s} = ${e2.s} gives x = ${x}, so each half is ${h}° and m∠AOC = ${2 * h}°, which is ${kind.toLowerCase()}. Classifying the half-angle (${h}°) instead of the whole angle is the usual slip.` };
          }
        }
      } },
    ],
  },

  // ── 2 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'angle-pair-relationships',
    skillId: 'geo-angle-pair-relationships',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const n = int(r, 35, 75), e = mkExpr(r, x, 180 - n);
            return { prompt: `Two angles form a linear pair. One measures ${deg(e)} and the other measures ${n}°. What is the value of x?`,
              value: x,
              explanation: `A linear pair is supplementary: (${e.s}) + ${n} = 180, so ${e.s} = ${180 - n} and x = ${x}. Setting the two angles equal, or using 90, is the usual slip.` };
          }
          case 1: {
            const n = int(r, 38, 142), e = mkExpr(r, x, n);
            return { prompt: `Two lines intersect. A pair of vertical angles measure ${deg(e)} and ${n}°. What is the value of x?`,
              value: x,
              explanation: `Vertical angles are congruent: ${e.s} = ${n}, so x = ${x}. Adding the two measures to 180 treats them as a linear pair, which is the usual slip.` };
          }
          case 2: {
            const n = int(r, 28, 77);
            return { prompt: `Two lines intersect, and one of the four angles formed measures ${n}°. What is the measure, in degrees, of an angle adjacent to it?`,
              value: 180 - n,
              explanation: `Adjacent angles formed by two intersecting lines are a linear pair, so the measure is 180 − ${n} = ${180 - n}°. ${n}° is the vertical angle, and 90 − ${n} would be a complement.` };
          }
          default: {
            const [p, q] = pick(r, [[1, 3], [2, 4], [1, 2], [2, 3], [3, 4], [1, 4]]);
            const vertical = (q - p) === 2;
            const OPTS = ['Vertical angles, so they are congruent', 'A linear pair, so they are supplementary',
              'Vertical angles, so they are supplementary', 'A linear pair, so they are congruent'];
            return { prompt: `Two lines intersect at point P, forming four angles numbered ∠1, ∠2, ∠3 and ∠4 in order going around P. Which describes ∠${p} and ∠${q}?`,
              ...mcFixed(r, OPTS, vertical ? OPTS[0] : OPTS[1]),
              explanation: vertical
                ? `∠${p} and ∠${q} are opposite each other across P, so they are vertical angles, and vertical angles are congruent. Angles next to each other would be a linear pair.`
                : `∠${p} and ∠${q} are next to each other and their outer sides form a line, so they are a linear pair, which is supplementary (sum 180°). Only opposite angles are vertical.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const v = int(r, 48, 132);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 180 - v);
            return { prompt: `Two angles form a linear pair. Their measures are ${deg(e1)} and ${deg(e2)}. What is the value of x?`,
              value: x,
              explanation: `A linear pair sums to 180°: (${e1.s}) + (${e2.s}) = 180, so ${e1.a + e2.a}x ${signed(e1.b + e2.b)} = 180 and x = ${x}. Setting the expressions equal treats them as vertical angles.` };
          }
          case 1: {
            const v = int(r, 40, 140);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `Two lines intersect. A pair of vertical angles measure ${deg(e1)} and ${deg(e2)}. What is the measure of each of these angles, in degrees?`,
              value: v,
              explanation: `Vertical angles are congruent: ${e1.s} = ${e2.s}, so x = ${x} and each angle is ${e1.a}(${x}) ${signed(e1.b)} = ${v}°. Answering x = ${x} instead of the angle measure is the usual slip.` };
          }
          case 2: {
            const v = int(r, 24, 66);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 90 - v);
            return { prompt: `Two angles are complementary. Their measures are ${deg(e1)} and ${deg(e2)}. What is the measure, in degrees, of the angle that measures ${deg(e1)}?`,
              value: v,
              explanation: `Complementary angles sum to 90°: (${e1.s}) + (${e2.s}) = 90, so x = ${x} and the angle is ${e1.a}(${x}) ${signed(e1.b)} = ${v}°. Using 180 (supplementary) is the usual slip.` };
          }
          default: {
            const k = pick(r, [2, 4, 5, 8, 9]);
            const c = 90 / (k + 1);
            return { prompt: `The measure of an angle is ${k} times the measure of its complement. What is the measure of the angle, in degrees?`,
              value: k * c,
              explanation: `Let the complement be c. Then the angle is ${k}c and ${k}c + c = 90, so c = ${c}° and the angle is ${k} × ${c} = ${k * c}°. Answering ${c}° gives the complement, and using 180 gives ${K.frac(180 * k, k + 1)}.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const k = pick(r, [3, 4, 6, 7, 10, 11, 16]);
            const a = (90 * k - 180) / (k - 1);
            return { prompt: `The supplement of an angle is ${k} times the complement of the same angle. What is the measure of the angle, in degrees?`,
              value: a,
              explanation: `Let the angle be a. Then 180 − a = ${k}(90 − a), so 180 − a = ${90 * k} − ${k}a, ${k - 1}a = ${90 * k - 180} and a = ${a}°. Check: supplement ${180 - a}° = ${k} × complement ${90 - a}°. Swapping which is the supplement and which the complement is the usual slip.` };
          }
          case 1: {
            const k = pick(r, [2, 3]);
            const s = k === 2 ? int(r, 40, 58) : int(r, 35, 44);
            const d = 180 - s - k * s;
            return { prompt: `The measure of an angle is ${d}° more than ${k} times the measure of its supplement. What is the measure of the angle, in degrees?`,
              value: 180 - s,
              explanation: `Let the supplement be s. The angle is ${k}s + ${d}, and (${k}s + ${d}) + s = 180, so ${k + 1}s = ${180 - d} and s = ${s}°. The angle is 180 − ${s} = ${180 - s}°. Answering ${s}° gives the supplement instead.` };
          }
          case 2: {
            const v = int(r, 40, 140);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `Two lines intersect. A pair of vertical angles measure ${deg(e1)} and ${deg(e2)}. What is the measure, in degrees, of each of the OTHER two angles formed?`,
              value: 180 - v,
              explanation: `Vertical angles are congruent: ${e1.s} = ${e2.s}, so x = ${x} and each of those angles is ${v}°. The other two angles each form a linear pair with them: 180 − ${v} = ${180 - v}°. Stopping at ${v}° is the usual slip.` };
          }
          default: {
            const n = int(r, 18, 72);
            return { prompt: `∠A and ∠B are complementary, and ∠B and ∠C are supplementary. If m∠A = ${n}°, what is m∠C, in degrees?`,
              value: 90 + n,
              explanation: `m∠B = 90 − ${n} = ${90 - n}°, and m∠C = 180 − ${90 - n} = ${90 + n}°. Using 180 − ${n} = ${180 - n}° skips the middle step through ∠B.` };
          }
        }
      } },
    ],
  },

  // ── 3 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'parallel-lines-transversals',
    skillId: 'geo-parallel-lines-transversals',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        switch (idx % 4) {
          case 0: {
            const kind = pick(r, PAIR_KINDS);
            const [p, q] = pick(r, PAIRS[kind]);
            return { prompt: `${CUT} What kind of angle pair are ∠${p} and ∠${q}?`,
              ...mcFixed(r, PAIR_KINDS, kind),
              explanation: `∠${p} is at line m and ∠${q} is at line n. ${kind} is the name for this pair: interior angles lie between the two lines (∠3, ∠4, ∠5, ∠6), "alternate" means opposite sides of t, and corresponding angles sit in the same position at each crossing. Mixing up alternate and same-side is the usual slip.` };
          }
          case 1: {
            const n = int(r, 52, 128);
            return { prompt: `Two parallel lines are cut by a transversal. One of a pair of same-side interior angles measures ${n}°. What is the measure of the other, in degrees?`,
              value: 180 - n,
              explanation: `Same-side interior angles between parallel lines are supplementary: 180 − ${n} = ${180 - n}°. Answering ${n}° treats them as congruent, which is true for alternate interior angles, not same-side ones.` };
          }
          case 2: {
            const p = int(r, 1, 4), q = int(r, 5, 8), n = int(r, 48, 132);
            const ans = sameClass(p, q) ? n : 180 - n;
            return { prompt: `${PAR_CUT} If m∠${p} = ${n}°, what is m∠${q}, in degrees?`,
              value: ans,
              explanation: `With m ∥ n, angles 1, 4, 5 and 8 are all congruent, and so are angles 2, 3, 6 and 7; an angle from one group is supplementary to an angle from the other. So m∠${q} = ${sameClass(p, q) ? `${n}°` : `180 − ${n} = ${ans}°`}. The usual slip is to assume every pair is congruent.` };
          }
          default: {
            const kind = pick(r, PAIR_KINDS);
            const [p, q] = pick(r, PAIRS[kind]);
            return { prompt: `${CUT} Which angle forms a pair of ${kind.toLowerCase()} with ∠${p}?`,
              ...mcFixed(r, ['∠5', '∠6', '∠7', '∠8'], `∠${q}`),
              explanation: `${kind} with ∠${p}: the partner is ∠${q}. Interior angles lie between the lines (∠3 to ∠6), exterior ones outside; "alternate" means opposite sides of the transversal; corresponding angles sit in the same position at both crossings.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        const INTRO = 'Two parallel lines are cut by a transversal.';
        switch (idx % 4) {
          case 0: {
            const v = int(r, 42, 138);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `${INTRO} One of a pair of alternate interior angles measures ${deg(e1)} and the other measures ${deg(e2)}. What is the value of x?`,
              value: x,
              explanation: `Alternate interior angles between parallel lines are congruent: ${e1.s} = ${e2.s}, so x = ${x}. Setting the sum equal to 180 is the rule for same-side interior angles.` };
          }
          case 1: {
            const v = int(r, 52, 128);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 180 - v);
            return { prompt: `${INTRO} One of a pair of same-side interior angles measures ${deg(e1)} and the other measures ${deg(e2)}. What is the value of x?`,
              value: x,
              explanation: `Same-side interior angles between parallel lines are supplementary: (${e1.s}) + (${e2.s}) = 180, so ${e1.a + e2.a}x ${signed(e1.b + e2.b)} = 180 and x = ${x}. Setting the two expressions equal is the usual slip.` };
          }
          case 2: {
            const v = int(r, 42, 138);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `${INTRO} One of a pair of corresponding angles measures ${deg(e1)} and the other measures ${deg(e2)}. What is the measure of each of these angles, in degrees?`,
              value: v,
              explanation: `Corresponding angles on parallel lines are congruent: ${e1.s} = ${e2.s}, so x = ${x} and each angle is ${e1.a}(${x}) ${signed(e1.b)} = ${v}°. Answering x instead of the angle is the usual slip.` };
          }
          default: {
            const v = int(r, 52, 128);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 180 - v);
            return { prompt: `${INTRO} One of a pair of same-side interior angles measures ${deg(e1)} and the other measures ${deg(e2)}. What is the measure, in degrees, of the angle that measures ${deg(e1)}?`,
              value: v,
              explanation: `Same-side interior angles are supplementary: (${e1.s}) + (${e2.s}) = 180, so x = ${x} and the angle is ${e1.a}(${x}) ${signed(e1.b)} = ${v}°. Treating the pair as congruent is the usual slip.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const GOOD = ['∠3 ≅ ∠6', '∠4 ≅ ∠5', '∠1 ≅ ∠5', '∠2 ≅ ∠6', '∠3 ≅ ∠7', '∠4 ≅ ∠8', '∠1 ≅ ∠8', '∠2 ≅ ∠7', 'm∠3 + m∠5 = 180°', 'm∠4 + m∠6 = 180°'];
            const ALWAYS_VERT = ['∠1 ≅ ∠4', '∠2 ≅ ∠3', '∠5 ≅ ∠8', '∠6 ≅ ∠7'];
            const ALWAYS_LIN = ['m∠1 + m∠2 = 180°', 'm∠5 + m∠6 = 180°', 'm∠3 + m∠4 = 180°', 'm∠7 + m∠8 = 180°'];
            const MISUSED = ['∠3 ≅ ∠5', '∠4 ≅ ∠6', 'm∠3 + m∠6 = 180°', 'm∠4 + m∠5 = 180°', 'm∠1 + m∠5 = 180°'];
            const good = pick(r, GOOD);
            return { prompt: `${CUT} Which condition is enough to prove that line m is parallel to line n?`,
              ...mc(r, good, [pick(r, ALWAYS_VERT), pick(r, ALWAYS_LIN), pick(r, MISUSED)]),
              explanation: `${good} is the converse of a parallel-lines theorem: congruent corresponding, alternate interior or alternate exterior angles, or supplementary same-side interior angles, force m ∥ n. Vertical angles and linear pairs are true for ANY two lines, so they prove nothing, and the remaining choice applies the wrong relationship to its pair.` };
          }
          case 2: {
            const kind = pick(r, PAIR_KINDS);
            const [p, q] = pick(r, PAIRS[kind]);
            const fact = kind === 'Same-side interior angles' ? `m∠${p} + m∠${q} = 180°` : `∠${p} ≅ ∠${q}`;
            const name = (k) => `Converse of the ${k.replace(/ [a-z]/g, (c) => c.toUpperCase()).replace('-side', '-Side')} Theorem`;
            return { prompt: `${CUT} It is known that ${fact}. Which theorem proves that line m is parallel to line n?`,
              ...mcFixed(r, PAIR_KINDS.map(name), name(kind)),
              explanation: `∠${p} and ∠${q} are ${kind.toLowerCase()} (${kind === 'Same-side interior angles' ? 'both between the lines, on the same side of t' : 'see their positions at the two crossings'}), and they are ${kind === 'Same-side interior angles' ? 'supplementary' : 'congruent'}, so the converse of that theorem gives m ∥ n. Naming the pair by the wrong relationship is the usual slip.` };
          }
          case 1: {
            const v = int(r, 52, 128);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 180 - v);
            return { prompt: `Lines m and n are cut by a transversal. A pair of same-side interior angles measure ${deg(e1)} and ${deg(e2)}. For what value of x is line m parallel to line n?`,
              value: x,
              explanation: `By the converse of the same-side interior angles theorem, the lines are parallel exactly when the pair is supplementary: (${e1.s}) + (${e2.s}) = 180, so x = ${x}. Setting the expressions equal is the test for alternate interior angles.` };
          }
          default: {
            const p = int(r, 1, 4), q = int(r, 5, 8);
            let t = int(r, 1, 8);
            while (t === p || t === q) t = int(r, 1, 8);
            const v = int(r, 52, 128);
            const same = sameClass(p, q);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, same ? v : 180 - v, same ? [e1.a] : []);
            const ans = sameClass(p, t) ? v : 180 - v;
            return { prompt: `${PAR_CUT} m∠${p} = ${deg(e1)} and m∠${q} = ${deg(e2)}. What is m∠${t}, in degrees?`,
              value: ans,
              explanation: `With m ∥ n, angles 1, 4, 5, 8 are congruent to each other and angles 2, 3, 6, 7 are congruent to each other; angles from different groups are supplementary. ∠${p} and ∠${q} are ${same ? 'congruent' : 'supplementary'}, so ${same ? `${e1.s} = ${e2.s}` : `(${e1.s}) + (${e2.s}) = 180`} and x = ${x}, giving m∠${p} = ${v}°. ∠${t} is ${sameClass(p, t) ? 'congruent to' : 'supplementary to'} ∠${p}, so m∠${t} = ${ans}°. Using the wrong relationship for either pair is the usual slip.` };
          }
        }
      } },
    ],
  },

  // ── 4 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'triangle-classification',
    skillId: 'geo-triangle-classification',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        switch (idx % 4) {
          case 0: {
            const type = pick(r, ['Right', 'Obtuse', 'Acute']);
            const ang = anglesOfType(r, type, 'scalene');
            const [p, q] = type === 'Acute' ? [ang[0], ang[1]] : [ang[1], ang[2]];
            const third = 180 - p - q;
            return { prompt: `Two angles of a triangle measure ${p}° and ${q}°. How is the triangle classified by its angles?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'Equiangular'], type),
              explanation: `The third angle is 180 − ${p} − ${q} = ${third}°. The largest angle is ${Math.max(p, q, third)}°, so the triangle is ${type.toLowerCase()}. Judging from only the two given angles (both acute) is the usual slip.` };
          }
          case 1: {
            const iso = int(r, 0, 1) === 1;
            const a = int(r, 6, 12), b = a + int(r, 2, 4);
            const c = iso ? pick(r, [a, b]) : b + int(r, 1, 3);
            return { prompt: `Two sides of a triangle measure ${a} cm and ${b} cm, and its perimeter is ${a + b + c} cm. How is the triangle classified by its sides?`,
              ...mcFixed(r, ['Scalene', 'Isosceles', 'Equilateral', 'Equiangular'], iso ? 'Isosceles' : 'Scalene'),
              explanation: `The third side is ${a + b + c} − ${a} − ${b} = ${c} cm, so the sides are ${a}, ${b} and ${c}: ${iso ? 'exactly two are congruent, so it is isosceles' : 'no two are congruent, so it is scalene'}. Classifying from the two given sides alone is the usual slip.` };
          }
          case 2: {
            const v = 2 * int(r, 12, 64);
            return { prompt: `In isosceles △ABC, AB = AC and m∠A = ${v}°. What is m∠B, in degrees?`,
              value: (180 - v) / 2,
              explanation: `The base angles ∠B and ∠C are opposite the congruent sides, so they are congruent: m∠B = (180 − ${v}) ÷ 2 = ${(180 - v) / 2}°. Forgetting to halve gives ${180 - v}°.` };
          }
          default: {
            let a = int(r, 25, 75);
            if (a === 60) a = 62;
            const v = 180 - 2 * a;
            const type = v > 90 ? 'Obtuse isosceles' : v === 90 ? 'Right isosceles' : 'Acute isosceles';
            return { prompt: `Two angles of a triangle measure ${a}° and ${v}°. Which describes the triangle?`,
              ...mcFixed(r, ['Acute isosceles', 'Right isosceles', 'Obtuse isosceles', v > 90 ? 'Obtuse scalene' : 'Acute scalene'], type),
              explanation: `The third angle is 180 − ${a} − ${v} = ${a}°. Two angles are congruent, so the sides opposite them are congruent (isosceles), and the largest angle is ${Math.max(a, v)}°, so it is ${type.toLowerCase()}. Not finding the third angle makes it look scalene.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const b = int(r, 28, 78);
            return { prompt: `In △ABC, AB = AC and m∠B = ${b}°. What is m∠A, in degrees?`,
              value: 180 - 2 * b,
              explanation: `AB = AC makes ∠B and ∠C the congruent base angles, so m∠C = ${b}° and m∠A = 180 − 2(${b}) = ${180 - 2 * b}°. Answering 180 − ${b} = ${180 - b}° forgets the second base angle.` };
          }
          case 1: {
            const v = int(r, 32, 78);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `In △ABC, AB = AC. m∠B = ${deg(e1)} and m∠C = ${deg(e2)}. What is the value of x?`,
              value: x,
              explanation: `∠B and ∠C are opposite the congruent sides AC and AB, so they are congruent: ${e1.s} = ${e2.s}, and x = ${x}. Setting their sum to 180 forgets ∠A.` };
          }
          case 2: {
            const TYPES = [['Obtuse', 'isosceles'], ['Acute', 'isosceles'], ['Right', 'scalene'], ['Obtuse', 'scalene'], ['Right', 'isosceles'], ['Acute', 'scalene']];
            const order = shuffle(r, TYPES).slice(0, 4);
            const fmt = (t) => `${t[0]}°, ${t[1]}°, ${t[2]}°`;
            const opts = order.map(([a, s]) => fmt(anglesOfType(r, a, s)));
            const [a0, s0] = order[0];
            return { prompt: `Which set of angle measures belongs to ${a0 === 'Right' ? 'a' : 'an'} ${a0.toLowerCase()} ${s0} triangle?`,
              ...mc(r, opts[0], opts.slice(1)),
              explanation: `${opts[0]}: the largest angle makes it ${a0.toLowerCase()}, and ${s0 === 'isosceles' ? 'two congruent angles mean two congruent sides (isosceles)' : 'three different angles mean three different sides (scalene)'}. Every choice sums to 180°, so the angle sum alone does not decide it.` };
          }
          default: {
            const s = int(r, 9, 30);
            const e1 = mkExpr(r, x, s), e2 = mkExpr(r, x, s, [e1.a]);
            return { prompt: `△ABC is equilateral, with AB = ${e1.s} and BC = ${e2.s}. What is the perimeter of △ABC?`,
              value: 3 * s,
              explanation: `All sides of an equilateral triangle are congruent: ${e1.s} = ${e2.s}, so x = ${x} and each side is ${s}. The perimeter is 3 × ${s} = ${3 * s}. Adding only the two given sides (${2 * s}) is the usual slip.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const [a, b, c0] = pick(r, RIGHT_TRIPLES.slice(1));
            const c = c0 + pick(r, [-1, 0, 1]);
            const type = bySides([a, b, c]);
            const [s1, s2, s3] = shuffle(r, [a, b, c]);
            const big = Math.max(a, b, c);
            const [lo, mid] = [a, b, c].sort((p, q) => p - q);
            return { prompt: `A triangle has side lengths ${s1}, ${s2} and ${s3}. How is the triangle classified by its angles?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'These lengths cannot form a triangle'], type),
              explanation: `Compare the square of the longest side with the sum of the other two squares: ${lo}² + ${mid}² = ${sq(lo) + sq(mid)} and ${big}² = ${sq(big)}. The sum is ${type === 'Right' ? 'equal, so the triangle is right' : type === 'Acute' ? 'greater, so the triangle is acute' : 'less, so the triangle is obtuse'}. Reversing "greater means obtuse" is the usual slip.` };
          }
          case 1: {
            const b = int(r, 32, 74);
            const e1 = mkExpr(r, x, 180 - 2 * b), e2 = mkExpr(r, x, b);
            return { prompt: `In △ABC, AB = AC. m∠A = ${deg(e1)} and m∠B = ${deg(e2)}. What is m∠C, in degrees?`,
              value: b,
              explanation: `AB = AC makes ∠B ≅ ∠C, so (${e1.s}) + 2(${e2.s}) = 180, which gives x = ${x}. Then m∠C = m∠B = ${e2.a}(${x}) ${signed(e2.b)} = ${b}°. Adding the base angle only once is the usual slip.` };
          }
          case 2: {
            const a = int(r, 5, 12);
            const c = a + int(r, 1, a - 2);
            const ang = bySides([a, a, c]);
            const type = `${ang} isosceles`;
            return { prompt: `A triangle has side lengths ${a}, ${a} and ${c}. Which describes the triangle?`,
              ...mcFixed(r, ['Acute isosceles', 'Right isosceles', 'Obtuse isosceles', `${ang} scalene`], type),
              explanation: `Two sides are congruent, so it is isosceles. For the angles, ${a}² + ${a}² = ${2 * sq(a)} and ${c}² = ${sq(c)}; the sum is ${ang === 'Acute' ? 'greater, so the largest angle is acute' : 'less, so the largest angle is obtuse'}. Comparing ${a} + ${a} with ${c} instead of the squares is the usual slip.` };
          }
          default: {
            const TYPES = [['Right', 'scalene'], ['Obtuse', 'isosceles'], ['Acute', 'isosceles'], ['Obtuse', 'scalene'], ['Acute', 'scalene']];
            const [at, st] = pick(r, TYPES);
            const ang = shuffle(r, anglesOfType(r, at, st));
            const e = ang.map((v) => mkExpr(r, x, v));
            const other = st === 'scalene' ? 'isosceles' : 'scalene';
            const wrongs = [`${at} ${other}`, ...['Acute', 'Right', 'Obtuse'].filter((t) => t !== at).map((t) => `${t} ${st}`)];
            return { prompt: `In △PQR, m∠P = ${deg(e[0])}, m∠Q = ${deg(e[1])} and m∠R = ${deg(e[2])}. Which describes the triangle?`,
              ...mc(r, `${at} ${st}`, wrongs),
              explanation: `The angles sum to 180: ${e[0].a + e[1].a + e[2].a}x ${signed(e[0].b + e[1].b + e[2].b)} = 180, so x = ${x} and the angles are ${ang[0]}°, ${ang[1]}° and ${ang[2]}°. The largest is ${Math.max(...ang)}° (${at.toLowerCase()}), and ${st === 'isosceles' ? 'two angles are congruent (isosceles)' : 'no two angles are congruent (scalene)'}. Classifying from the expressions without finding the angles is the usual slip.` };
          }
        }
      } },
    ],
  },

  // ── 5 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'triangle-angle-sum',
    skillId: 'geo-triangle-angle-sum',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        switch (idx % 4) {
          case 0: {
            const p = int(r, 28, 84), q = int(r, 24, 70);
            return { prompt: `Two angles of a triangle measure ${p}° and ${q}°. What is the measure of the third angle, in degrees?`,
              value: 180 - p - q,
              explanation: `The angles of a triangle sum to 180°: 180 − ${p} − ${q} = ${180 - p - q}°. Subtracting from 360 or from 90 is the usual slip.` };
          }
          case 1: {
            const p = int(r, 18, 72);
            return { prompt: `One acute angle of a right triangle measures ${p}°. What is the measure of the other acute angle, in degrees?`,
              value: 90 - p,
              explanation: `The right angle uses 90°, so the two acute angles share the other 90°: 90 − ${p} = ${90 - p}°. Answering 180 − ${p} = ${180 - p}° forgets the right angle.` };
          }
          case 2: {
            const n = 2 * int(r, 16, 62);
            return { prompt: `The angles of a triangle measure x°, x° and ${n}°. What is the value of x?`,
              value: (180 - n) / 2,
              explanation: `x + x + ${n} = 180, so 2x = ${180 - n} and x = ${(180 - n) / 2}. Forgetting to divide by 2 gives ${180 - n}.` };
          }
          default: {
            let x = int(r, 35, 55), p = int(r, 4, 18);
            while (180 - 3 * x - p === 0 || 180 - 3 * x - p === p) { x = int(r, 35, 55); p = int(r, 4, 18); }
            const q = 180 - 3 * x - p;
            return { prompt: `The angles of a triangle measure x°, (x + ${p})° and (x ${signed(q)})°. What is the value of x?`,
              value: x,
              explanation: `x + (x + ${p}) + (x ${signed(q)}) = 180, so 3x ${signed(p + q)} = 180 and x = ${x}. Setting the sum to 360 is the usual slip.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        const RATIOS = [[1, 2, 3], [2, 3, 4], [3, 4, 5], [2, 3, 5], [1, 3, 5], [2, 3, 7], [4, 5, 6], [1, 4, 5], [2, 5, 8], [3, 5, 7], [5, 6, 7], [1, 2, 6]];
        switch (idx % 4) {
          case 0: {
            const v1 = int(r, 35, 70), v2 = int(r, 40, 75);
            const e = [v1, v2, 180 - v1 - v2].map((v) => mkExpr(r, x, v));
            return { prompt: `The angles of a triangle measure ${deg(e[0])}, ${deg(e[1])} and ${deg(e[2])}. What is the value of x?`,
              value: x,
              explanation: `The three angles sum to 180: ${e[0].a + e[1].a + e[2].a}x ${signed(e[0].b + e[1].b + e[2].b)} = 180, so x = ${x}. Dropping one of the constants when combining like terms is the usual slip.` };
          }
          case 1: {
            const [a, b, c] = pick(r, RATIOS);
            const u = 180 / (a + b + c);
            return { prompt: `The measures of the angles of a triangle are in the ratio ${a}:${b}:${c}. What is the measure of the largest angle, in degrees?`,
              value: c * u,
              explanation: `Write the angles as ${a}k, ${b}k and ${c}k: ${a + b + c}k = 180, so k = ${u}. The largest angle is ${c} × ${u} = ${c * u}°. Answering k = ${u} or the smallest angle (${a * u}°) is the usual slip.` };
          }
          case 2: {
            const b = int(r, 40, 58);
            const d = 180 - 3 * b;
            return { prompt: `In an isosceles triangle, the vertex angle measures ${d}° more than each base angle. What is the measure of the vertex angle, in degrees?`,
              value: b + d,
              explanation: `Let each base angle be b. Then b + b + (b + ${d}) = 180, so 3b = ${180 - d} and b = ${b}°. The vertex angle is ${b} + ${d} = ${b + d}°. Answering ${b}° gives a base angle.` };
          }
          default: {
            let v = int(r, 24, 66);
            if (v === 45) v = 41;
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, 90 - v);
            return { prompt: `The acute angles of a right triangle measure ${deg(e1)} and ${deg(e2)}. What is the measure of the SMALLER acute angle, in degrees?`,
              value: Math.min(v, 90 - v),
              explanation: `The acute angles of a right triangle sum to 90: (${e1.s}) + (${e2.s}) = 90, so x = ${x}. The angles are ${v}° and ${90 - v}°, and the smaller is ${Math.min(v, 90 - v)}°. Using 180 forgets the right angle.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        switch (idx % 4) {
          case 0: {
            const v1 = int(r, 30, 55), v2 = int(r, 30, 55);
            const vals = shuffle(r, [v1, v2, 180 - v1 - v2]);
            const e = vals.map((v) => mkExpr(r, x, v));
            return { prompt: `The angles of a triangle measure ${deg(e[0])}, ${deg(e[1])} and ${deg(e[2])}. What is the measure of the LARGEST angle, in degrees?`,
              value: Math.max(...vals),
              explanation: `${e[0].a + e[1].a + e[2].a}x ${signed(e[0].b + e[1].b + e[2].b)} = 180, so x = ${x}. The angles are ${vals[0]}°, ${vals[1]}° and ${vals[2]}°, and the largest is ${Math.max(...vals)}°. Picking the expression with the largest coefficient without substituting is the usual slip.` };
          }
          case 1: {
            const [a, b, c] = pick(r, [[1, 2, 3], [2, 3, 4], [1, 1, 2], [1, 2, 6], [2, 3, 5], [4, 5, 6], [1, 3, 5], [2, 3, 7], [3, 4, 5], [1, 4, 5], [2, 5, 8]]);
            const u = 180 / (a + b + c);
            const big = c * u;
            const type = big === 90 ? 'Right' : big > 90 ? 'Obtuse' : 'Acute';
            return { prompt: `The measures of the angles of a triangle are in the ratio ${a}:${b}:${c}. How is the triangle classified by its angles?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'Equiangular'], type),
              explanation: `${a}k + ${b}k + ${c}k = 180, so k = ${u} and the angles are ${a * u}°, ${b * u}° and ${big}°. The largest is ${big}°, so the triangle is ${type.toLowerCase()}. Guessing from the ratio numbers without finding the angles is the usual slip.` };
          }
          case 2: {
            const a = 2 * int(r, 15, 35), b = 2 * int(r, 18, 36);
            const half = (180 - a - b) / 2;
            return { prompt: `In △ABC, m∠A = ${a}° and m∠B = ${b}°. The bisector of ∠C meets side AB at point D. What is m∠ADC, in degrees?`,
              value: 180 - a - half,
              explanation: `m∠C = 180 − ${a} − ${b} = ${2 * half}°, so the bisector makes m∠ACD = ${half}°. In △ADC, m∠ADC = 180 − ${a} − ${half} = ${180 - a - half}°. Using all of ∠C (${2 * half}°) instead of half of it is the usual slip.` };
          }
          default: {
            const k = pick(r, [2, 3]);
            const b = k === 2 ? int(r, 36, 44) : int(r, 28, 35);
            const d = 180 - (k + 2) * b;
            return { prompt: `In △ABC, ∠A measures ${d}° more than ∠B, and ∠C measures ${k} times as much as ∠B. What is m∠C, in degrees?`,
              value: k * b,
              explanation: `Let m∠B = b. Then (b + ${d}) + b + ${k}b = 180, so ${k + 2}b = ${180 - d} and b = ${b}°. So m∠C = ${k} × ${b} = ${k * b}°. Answering ${b}° (∠B) or ${b + d}° (∠A) is the usual slip.` };
          }
        }
      } },
    ],
  },

  // ── 6 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'exterior-angle-theorem',
    skillId: 'geo-exterior-angle-theorem',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const EXT = 'Side BC is extended through C to point D.';
        switch (idx % 4) {
          case 0: {
            const a = int(r, 32, 78), b = int(r, 28, 70);
            return { prompt: `In △ABC, m∠A = ${a}° and m∠B = ${b}°. ${EXT} What is m∠ACD, in degrees?`,
              value: a + b,
              explanation: `∠ACD is an exterior angle, so it equals the sum of the two remote interior angles: ${a} + ${b} = ${a + b}°. 180 − ${a + b} = ${180 - a - b}° is the interior angle at C, the usual slip.` };
          }
          case 1: {
            const a = int(r, 32, 78), b = int(r, 28, 70);
            return { prompt: `In △ABC, m∠A = ${a}°. ${EXT} If m∠ACD = ${a + b}°, what is m∠B, in degrees?`,
              value: b,
              explanation: `The exterior angle equals the sum of the remote interior angles: ${a} + m∠B = ${a + b}, so m∠B = ${b}°. Subtracting the exterior angle from 180 gives the interior angle at C (${180 - a - b}°), not ∠B.` };
          }
          case 2: {
            const e = 2 * int(r, 32, 74);
            return { prompt: `In △ABC, ∠A ≅ ∠B. ${EXT} If m∠ACD = ${e}°, what is m∠A, in degrees?`,
              value: e / 2,
              explanation: `m∠A + m∠B = m∠ACD, and the two remote interior angles are congruent, so 2·m∠A = ${e} and m∠A = ${e / 2}°. Using 180 − ${e} = ${180 - e}° finds the interior angle at C instead.` };
          }
          default: {
            const [P, Q, R, S] = pick(r, ['PQRS', 'ABCD', 'JKLM', 'XYZW']).split('');
            return { prompt: `In △${P}${Q}${R}, side ${Q}${R} is extended through ${R} to point ${S}. Which equation must be true?`,
              ...mc(r, `m∠${P}${R}${S} = m∠${P} + m∠${Q}`, [
                `m∠${P}${R}${S} = m∠${P} + m∠${P}${R}${Q}`,
                `m∠${P}${R}${S} = 180° − (m∠${P} + m∠${Q})`,
                `m∠${P}${R}${S} + m∠${P} + m∠${Q} = 180°`,
              ]),
              explanation: `∠${P}${R}${S} is an exterior angle at ${R}; it equals the sum of the two remote interior angles, ∠${P} and ∠${Q}. 180° − (m∠${P} + m∠${Q}) is the INTERIOR angle at ${R}, and ∠${P}${R}${Q} is adjacent, not remote.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const x = int(r, 6, 14);
        const EXT = 'Side BC is extended through C to point D.';
        switch (idx % 4) {
          case 0: {
            const a = int(r, 32, 70), b = int(r, 30, 66);
            const e1 = mkExpr(r, x, a), e2 = mkExpr(r, x, b), e3 = mkExpr(r, x, a + b, [e1.a + e2.a]);
            return { prompt: `In △ABC, m∠A = ${deg(e1)} and m∠B = ${deg(e2)}. ${EXT} If m∠ACD = ${deg(e3)}, what is the value of x?`,
              value: x,
              explanation: `Exterior angle = sum of the remote interior angles: (${e1.s}) + (${e2.s}) = ${e3.s}, so x = ${x}. Setting all three expressions to sum to 180 is the usual slip.` };
          }
          case 1: {
            const a = int(r, 32, 70), b = int(r, 30, 66);
            const e2 = mkExpr(r, x, b), e3 = mkExpr(r, x, a + b, [e2.a]);
            return { prompt: `In △ABC, m∠A = ${a}° and m∠B = ${deg(e2)}. ${EXT} If m∠ACD = ${deg(e3)}, what is m∠ACD, in degrees?`,
              value: a + b,
              explanation: `${a} + (${e2.s}) = ${e3.s}, so x = ${x} and m∠ACD = ${e3.a}(${x}) ${signed(e3.b)} = ${a + b}°. Answering x, or the interior angle 180 − ${a + b} = ${180 - a - b}°, is the usual slip.` };
          }
          case 2: {
            let a = int(r, 32, 62), b = int(r, 40, 72);
            while (new Set([b, 180 - a - b, 2 * a + b, 180 - b, 180 - a]).size < 5 || 2 * a + b >= 180) { a = int(r, 32, 62); b = int(r, 40, 72); }
            const e = a + b;
            return { prompt: `In △ABC, m∠A = ${a}°. ${EXT} If m∠ACD = ${e}°, what is m∠B?`,
              ...mc(r, `${b}°`, [`${180 - e}°`, `${e + a}°`, `${180 - b}°`]),
              explanation: `m∠A + m∠B = m∠ACD, so m∠B = ${e} − ${a} = ${b}°. ${180 - e}° is the interior angle at C (180 − ${e}), and ${e + a}° adds the given angle instead of subtracting it.` };
          }
          default: {
            const e = int(r, 104, 158);
            return { prompt: `In isosceles △ABC, AB = AC. Side CB is extended through B to point D, and m∠ABD = ${e}°. What is m∠A, in degrees?`,
              value: 2 * e - 180,
              explanation: `The interior angle at B is 180 − ${e} = ${180 - e}°, and ∠C is the other base angle, also ${180 - e}°. The exterior angle equals ∠A + ∠C, so m∠A = ${e} − ${180 - e} = ${2 * e - 180}°. Answering ${180 - e}° gives a base angle.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const x = int(r, 6, 14);
        const EXT = 'Side BC is extended through C to point D.';
        switch (idx % 4) {
          case 0: {
            const a = int(r, 32, 70), b = int(r, 30, 66);
            const e1 = mkExpr(r, x, a), e2 = mkExpr(r, x, b), e3 = mkExpr(r, x, a + b, [e1.a + e2.a]);
            return { prompt: `In △ABC, m∠A = ${deg(e1)} and m∠B = ${deg(e2)}. ${EXT} If m∠ACD = ${deg(e3)}, what is m∠ACD, in degrees?`,
              value: a + b,
              explanation: `(${e1.s}) + (${e2.s}) = ${e3.s}, so x = ${x}. Then m∠ACD = ${e3.a}(${x}) ${signed(e3.b)} = ${a + b}° (check: ${a}° + ${b}°). Stopping at x = ${x} is the usual slip.` };
          }
          case 1: {
            const a = int(r, 32, 70), b = int(r, 30, 66);
            const e1 = mkExpr(r, x, a), e3 = mkExpr(r, x, a + b, [e1.a]);
            return { prompt: `In △ABC, m∠A = ${deg(e1)} and m∠B = ${b}°. ${EXT} If m∠ACD = ${deg(e3)}, what is the measure of the INTERIOR angle ∠ACB, in degrees?`,
              value: 180 - a - b,
              explanation: `(${e1.s}) + ${b} = ${e3.s}, so x = ${x} and the exterior angle is ${a + b}°. The interior angle at C is its linear pair: 180 − ${a + b} = ${180 - a - b}°. Answering ${a + b}° gives the exterior angle.` };
          }
          case 2: {
            let a = int(r, 35, 70), b = int(r, 40, 75);
            while (a === b || a + b === 90 || 180 - a - b === a || 180 - a - b === b) { a = int(r, 35, 70); b = int(r, 40, 75); }
            const s = a + b;
            return { prompt: `In △ABC, m∠A = ${a}° and m∠B = ${b}°. A student finds the exterior angle at C by writing 180° − (${a}° + ${b}°) = ${180 - s}°. Which statement about the student's work is true?`,
              ...mc(r, `It is incorrect: ${180 - s}° is the interior angle at C, and the exterior angle is ${s}°.`, [
                `It is correct: the exterior angle at C is ${180 - s}°.`,
                `It is incorrect: the exterior angle at C is 360° − ${s}° = ${360 - s}°.`,
                `It is incorrect: the exterior angle at C equals the larger remote angle, ${Math.max(a, b)}°.`,
              ]),
              explanation: `180 − (${a} + ${b}) = ${180 - s}° is the third INTERIOR angle. The exterior angle at C equals the sum of the remote interior angles, ${a} + ${b} = ${s}°. Subtracting from 180 when the theorem says to add is the classic slip.` };
          }
          default: {
            const p = int(r, 108, 150), q = int(r, 104, 146);
            return { prompt: `In △ABC, an exterior angle at vertex A measures ${p}° and an exterior angle at vertex B measures ${q}°. What is m∠C, in degrees?`,
              value: p + q - 180,
              explanation: `The interior angles at A and B are 180 − ${p} = ${180 - p}° and 180 − ${q} = ${180 - q}°. So m∠C = 180 − ${180 - p} − ${180 - q} = ${p + q - 180}°. Using the exterior measures directly in the angle sum is the usual slip.` };
          }
        }
      } },
    ],
  },

  // ── 7 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'triangle-congruence-sss-sas-asa',
    skillId: 'geo-triangle-congruence-sss-sas-asa',
    tiers: [
      { difficulty: 2, gen: (r, idx) => criterionItem(r, ['SSS', 'SAS', 'ASA', 'AAA'][idx % 4], OPTS_SSS) },
      { difficulty: 3, gen: (r, idx) => {
        switch (idx % 4) {
          case 0: return criterionItem(r, 'SSA', OPTS_SSS);
          case 1: {
            const [T1, T2] = pick(r, TRI_NAMES);
            const [v, u, w] = shuffle(r, [0, 1, 2]);
            const s1 = sideSt(T1, T2, Math.min(u, v), Math.max(u, v)), s2 = sideSt(T1, T2, Math.min(v, w), Math.max(v, w));
            return { prompt: `In △${T1} and △${T2}, ${s1} and ${s2}. Which additional congruence proves △${T1} ≅ △${T2} by SAS?`,
              ...mc(r, angSt(T1, T2, v), [angSt(T1, T2, u), angSt(T1, T2, w), sideSt(T1, T2, Math.min(u, w), Math.max(u, w))]),
              explanation: `SAS needs the angle BETWEEN the two given sides. Both sides meet at ${T1[v]} (and at ${T2[v]}), so the needed pair is ${angSt(T1, T2, v)}. The third pair of sides would prove congruence too, but by SSS, and either other angle gives SSA, which proves nothing.` };
          }
          case 2: {
            const [T1, T2] = pick(r, TRI_NAMES);
            const [v, u, w] = shuffle(r, [0, 1, 2]);
            const inc = sideSt(T1, T2, Math.min(u, w), Math.max(u, w));
            return { prompt: `In △${T1} and △${T2}, ${angSt(T1, T2, u)} and ${angSt(T1, T2, w)}. Which additional congruence proves △${T1} ≅ △${T2} by ASA?`,
              ...mc(r, inc, [sideSt(T1, T2, Math.min(u, v), Math.max(u, v)), sideSt(T1, T2, Math.min(v, w), Math.max(v, w)), angSt(T1, T2, v)]),
              explanation: `ASA needs the side BETWEEN the two given angles, the side joining ${T1[u]} and ${T1[w]}: ${inc}. Either other side is not between the angles (that would be AAS, not ASA), and a third angle gives AAA, which proves nothing.` };
          }
          default: return criterionItem(r, pick(r, ['SAS', 'ASA', 'SSA']), OPTS_SSS, { scramble: true });
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [A, B, C, D] = pick(r, QUADS).split('');
        const quad = `In quadrilateral ${A}${B}${C}${D}, diagonal ${A}${C} is drawn.`;
        const ask = `Which criterion, if any, proves △${A}${B}${C} ≅ △${C}${D}${A}?`;
        switch (idx % 4) {
          case 0:
            return { prompt: `${quad} ${A}${B} ≅ ${C}${D} and ∠${B}${A}${C} ≅ ∠${D}${C}${A}. ${ask}`,
              ...mcFixed(r, OPTS_SSS, 'SAS'),
              explanation: `The diagonal ${A}${C} is a side of both triangles (Reflexive Property). ∠${B}${A}${C} lies between ${A}${B} and ${A}${C}, and ∠${D}${C}${A} lies between ${C}${D} and ${C}${A}, so two sides and the included angle match: SAS. Missing the shared side is the usual slip.` };
          case 1:
            return { prompt: `${quad} ${A}${B} ≅ ${C}${D} and ${B}${C} ≅ ${D}${A}. ${ask}`,
              ...mcFixed(r, OPTS_SSS, 'SSS'),
              explanation: `The diagonal ${A}${C} is a side of both triangles (Reflexive Property), which gives the third pair of congruent sides: SSS. Answering "not enough" misses the shared side.` };
          case 2: {
            const useAngle = int(r, 0, 1) === 1;
            const E = 'M';
            return { prompt: `Segments ${A}${C} and ${B}${D} intersect at point ${E}. ${A}${E} ≅ ${C}${E} and ${useAngle ? `∠${A} ≅ ∠${C}` : `${B}${E} ≅ ${D}${E}`}. Which criterion, if any, proves △${A}${E}${B} ≅ △${C}${E}${D}?`,
              ...mcFixed(r, OPTS_SSS, useAngle ? 'ASA' : 'SAS'),
              explanation: useAngle
                ? `∠${A}${E}${B} and ∠${C}${E}${D} are vertical angles, so they are congruent. Side ${A}${E} lies between ∠${A} and ∠${A}${E}${B} (and ${C}${E} between ∠${C} and ∠${C}${E}${D}), so two angles and the included side match: ASA. Missing the vertical angles is the usual slip.`
                : `∠${A}${E}${B} and ∠${C}${E}${D} are vertical angles, so they are congruent, and they lie between the two given pairs of sides: SAS. Missing the vertical angles (and answering "not enough") is the usual slip.` };
          }
          default:
            return { prompt: `${quad} ${A}${B} ≅ ${C}${D} and ∠${B}${C}${A} ≅ ∠${D}${A}${C}. ${ask}`,
              ...mcFixed(r, OPTS_SSS, NOT_ENOUGH),
              explanation: `The triangles share ${A}${C}, so two pairs of sides are congruent (${A}${B} ≅ ${C}${D} and ${A}${C} ≅ ${C}${A}). But ∠${B}${C}${A} is opposite ${A}${B}, not between ${A}${B} and ${A}${C}, so this is SSA, which does not prove congruence. Calling it SAS is the usual slip.` };
        }
      } },
    ],
  },

  // ── 8 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'triangle-congruence-aas-hl',
    skillId: 'geo-triangle-congruence-aas-hl',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        if (idx % 4 !== 1) return criterionItem(r, ['AAS', 'HL', 'ASA', 'AAS'][idx % 4], OPTS_AAS, { scramble: idx % 4 === 3 });
        const [T1, T2] = pick(r, TRI_NAMES);
        const [v, u, w] = shuffle(r, [0, 1, 2]);
        const hyp = sideSt(T1, T2, Math.min(u, w), Math.max(u, w)), leg = sideSt(T1, T2, Math.min(u, v), Math.max(u, v));
        return { prompt: `In △${T1} and △${T2}, ∠${T1[v]} and ∠${T2[v]} are right angles, ${hyp}, and ${leg}. Which criterion, if any, proves △${T1} ≅ △${T2}?`,
          ...mcFixed(r, OPTS_AAS, 'HL'),
          explanation: `Both are right triangles. The sides opposite the right angles (the hypotenuses) are congruent, and one pair of legs is congruent, which is HL. HL only works in right triangles; without the right angles this would be SSA.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const [T1, T2] = pick(r, TRI_NAMES);
        const [v, u, w] = shuffle(r, [0, 1, 2]);
        const S = (i, j) => sideSt(T1, T2, Math.min(i, j), Math.max(i, j));
        switch (idx % 4) {
          case 0: {
            const g = givens('SSA', T1, T2, v, u, w);
            return { prompt: `In △${T1} and △${T2}, ${listAnd(g)}. No angle is known to be a right angle. Which criterion, if any, proves △${T1} ≅ △${T2}?`,
              ...mcFixed(r, OPTS_AAS, NOT_ENOUGH),
              explanation: `Two pairs of sides and an angle that is NOT between them is SSA, which does not prove congruence. It becomes HL only when the given angle is a right angle, and nothing says it is. Choosing HL anyway is the usual slip.` };
          }
          case 1:
            return { prompt: `△${T1} and △${T2} are right triangles with right angles at ${T1[v]} and ${T2[v]}, and their hypotenuses are congruent: ${S(u, w)}. Which additional congruence proves △${T1} ≅ △${T2} by HL?`,
              ...mc(r, S(u, v), [angSt(T1, T2, u), angSt(T1, T2, w), angSt(T1, T2, v)]),
              explanation: `HL needs the hypotenuses and ONE pair of legs. ${S(u, v)} is a pair of legs (each has an endpoint at the right angle). A pair of acute angles would prove congruence by AAS, not HL, and the right angles are already known.` };
          case 2:
            return { prompt: `In △${T1} and △${T2}, ${angSt(T1, T2, u)} and ${angSt(T1, T2, w)}. Which additional congruence proves △${T1} ≅ △${T2} by AAS (not ASA)?`,
              ...mc(r, S(u, v), [S(u, w), angSt(T1, T2, v), `${T1[u]}${T1[v]} ≅ ${T2[u]}${T2[w]}`]),
              explanation: `AAS uses a side that is NOT between the two given angles. ${S(u, v)} touches only one of them, so it works. ${S(u, w)} is the included side, which is ASA; a third angle gives AAA; and the last choice pairs sides that do not correspond.` };
          default: {
            const OPTS = ['SAS', 'HL', 'AAS', NOT_ENOUGH];
            return { prompt: `In △${T1} and △${T2}, ∠${T1[v]} and ∠${T2[v]} are right angles, ${S(u, v)}, and ${S(v, w)}. Which criterion, if any, proves △${T1} ≅ △${T2}?`,
              ...mcFixed(r, OPTS, 'SAS'),
              explanation: `Both given pairs of sides are LEGS (each has an endpoint at the right angle), and the right angles lie between them, so this is SAS. HL needs the hypotenuses, which are not given here — choosing HL for every right triangle is the usual slip.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [A, B, C, D] = pick(r, QUADS).split('');
        const setup = `In △${A}${B}${C}, point ${D} lies on side ${A}${C} with ${B}${D} ⊥ ${A}${C}`;
        const ask = `Which criterion, if any, proves △${A}${B}${D} ≅ △${C}${B}${D}?`;
        switch (idx % 4) {
          case 0:
            return { prompt: `${setup}, and ${A}${B} ≅ ${C}${B}. ${ask}`,
              ...mcFixed(r, OPTS_AAS, 'HL'),
              explanation: `${B}${D} ⊥ ${A}${C} makes both triangles right triangles with right angles at ${D}. ${A}${B} and ${C}${B} are their hypotenuses (opposite the right angles), and ${B}${D} is a leg of both: HL. Missing the shared leg is the usual slip.` };
          case 1:
            return { prompt: `${setup}, and ∠${A} ≅ ∠${C}. ${ask}`,
              ...mcFixed(r, OPTS_AAS, 'AAS'),
              explanation: `The right angles at ${D} are congruent, ∠${A} ≅ ∠${C}, and ${B}${D} is a side of both triangles. ${B}${D} is not between ∠${A} and the right angle (that side is ${A}${D}), so this is AAS, not ASA.` };
          case 2:
            return { prompt: `${setup}, and ${B}${D} bisects ∠${A}${B}${C}. ${ask}`,
              ...mcFixed(r, OPTS_AAS, 'ASA'),
              explanation: `The bisector gives ∠${A}${B}${D} ≅ ∠${C}${B}${D}, the right angles at ${D} are congruent, and the shared side ${B}${D} lies BETWEEN those two angles in each triangle: ASA. Calling it AAS ignores where the shared side sits.` };
          default: {
            const [T1, T2] = pick(r, TRI_NAMES);
            const [v, u] = shuffle(r, [0, 1, 2]);
            return { prompt: `△${T1} and △${T2} are right triangles with right angles at ${T1[v]} and ${T2[v]}, and ${angSt(T1, T2, u)}. No side lengths are known. Which criterion, if any, proves △${T1} ≅ △${T2}?`,
              ...mcFixed(r, OPTS_AAS, NOT_ENOUGH),
              explanation: `Only angles are known (the third pair follows from the angle sum), so this is AAA: the triangles have the same shape but could be different sizes. AAS and ASA both need a pair of congruent sides.` };
          }
        }
      } },
    ],
  },

  // ── 9 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'cpctc',
    skillId: 'geo-cpctc',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const [T1, T2] = congruentPair(r);
        const [i, j, k] = shuffle(r, [0, 1, 2]);
        const map = `${T1[0]} ↔ ${T2[0]}, ${T1[1]} ↔ ${T2[1]}, ${T1[2]} ↔ ${T2[2]}`;
        switch (idx % 4) {
          case 0:
            return { prompt: `△${T1} ≅ △${T2}. Which statement must be true?`,
              ...mc(r, `${T1[i]}${T1[j]} ≅ ${T2[i]}${T2[j]}`, [`${T1[i]}${T1[j]} ≅ ${T2[j]}${T2[k]}`, `${T1[i]}${T1[j]} ≅ ${T2[i]}${T2[k]}`, `∠${T1[i]} ≅ ∠${T2[j]}`]),
              explanation: `The order of the letters gives the correspondence: ${map}. So side ${T1[i]}${T1[j]} matches ${T2[i]}${T2[j]}. Matching letters alphabetically instead of by position is the usual slip.` };
          case 1: {
            const s1 = int(r, 6, 10), s2 = s1 + int(r, 1, 3), s3 = s2 + int(r, 1, 3);
            const len = shuffle(r, [s1, s2, s3]);
            const [a, b] = PAIRS3[idx % 3];
            return { prompt: `△${T1} ≅ △${T2}. In △${T1}, ${T1[0]}${T1[1]} = ${len[0]}, ${T1[1]}${T1[2]} = ${len[1]} and ${T1[0]}${T1[2]} = ${len[2]}. What is the length of ${T2[a]}${T2[b]}?`,
              value: len[[0, 1, 2].find((n) => PAIRS3[n][0] === a && PAIRS3[n][1] === b)],
              explanation: `The correspondence is ${map}, so ${T2[a]}${T2[b]} matches ${T1[a]}${T1[b]}, and corresponding parts of congruent triangles are congruent. Matching by alphabetical order instead of position is the usual slip.` };
          }
          case 2: {
            const ang = shuffle(r, pick(r, [[40, 65, 75], [35, 60, 85], [48, 52, 80], [30, 70, 80], [44, 58, 78]]));
            return { prompt: `△${T1} ≅ △${T2}. m∠${T1[0]} = ${ang[0]}°, m∠${T1[1]} = ${ang[1]}° and m∠${T1[2]} = ${ang[2]}°. What is m∠${T2[i]}, in degrees?`,
              value: ang[i],
              explanation: `The correspondence is ${map}, so ∠${T2[i]} matches ∠${T1[i]} and measures ${ang[i]}°. Matching letters alphabetically instead of by position is the usual slip.` };
          }
          default:
            return { prompt: `△${T1} ≅ △${T2}. Which statement about the angles must be true?`,
              ...mc(r, `∠${T1[i]} ≅ ∠${T2[i]}`, [`∠${T1[i]} ≅ ∠${T2[j]}`, `∠${T1[i]} ≅ ∠${T2[k]}`, `∠${T1[j]} ≅ ∠${T2[k]}`]),
              explanation: `The order of the letters gives the correspondence: ${map}. So ∠${T1[i]} matches ∠${T2[i]}. Matching letters alphabetically instead of by position is the usual slip.` };
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const [T1, T2] = congruentPair(r);
        const x = int(r, 3, 9);
        const [i, j, k] = shuffle(r, [0, 1, 2]);
        const map = `${T1[0]} ↔ ${T2[0]}, ${T1[1]} ↔ ${T2[1]}, ${T1[2]} ↔ ${T2[2]}`;
        switch (idx % 4) {
          case 0: {
            const e = mkExpr(r, x, int(r, 14, 40));
            return { prompt: `△${T1} ≅ △${T2}. ${T1[i]}${T1[j]} = ${e.s} and ${T2[i]}${T2[j]} = ${e.v}. What is the value of x?`,
              value: x,
              explanation: `${T1[i]}${T1[j]} and ${T2[i]}${T2[j]} are corresponding sides (${map}), so ${e.s} = ${e.v} and x = ${x}. Check that the two sides really correspond before setting them equal.` };
          }
          case 1: {
            const e = mkExpr(r, x, int(r, 35, 110));
            return { prompt: `△${T1} ≅ △${T2}. m∠${T1[i]} = ${deg(e)} and m∠${T2[i]} = ${e.v}°. What is the value of x?`,
              value: x,
              explanation: `∠${T1[i]} and ∠${T2[i]} are corresponding angles (${map}), so ${e.s} = ${e.v} and x = ${x}. Corresponding parts of congruent triangles are congruent, not supplementary.` };
          }
          case 2: {
            const p = int(r, 35, 70), q = int(r, 40, 68);
            return { prompt: `△${T1} ≅ △${T2}. m∠${T1[i]} = ${p}° and m∠${T2[j]} = ${q}°. What is m∠${T2[k]}, in degrees?`,
              value: 180 - p - q,
              explanation: `The correspondence is ${map}, so m∠${T2[i]} = m∠${T1[i]} = ${p}°. In △${T2} the angles sum to 180°, so m∠${T2[k]} = 180 − ${p} − ${q} = ${180 - p - q}°. Assuming ∠${T2[k]} matches the given angle is the usual slip.` };
          }
          default: {
            const v = int(r, 14, 40);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]);
            return { prompt: `△${T1} ≅ △${T2}. ${T1[i]}${T1[j]} = ${e1.s} and ${T2[i]}${T2[j]} = ${e2.s}. What is the length of ${T1[i]}${T1[j]}?`,
              value: v,
              explanation: `The sides correspond (${map}), so ${e1.s} = ${e2.s}, x = ${x}, and ${T1[i]}${T1[j]} = ${e1.a}(${x}) ${signed(e1.b)} = ${v}. Answering x = ${x} instead of the length is the usual slip.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [T1, T2] = congruentPair(r);
        const x = int(r, 3, 9);
        const map = `${T1[0]} ↔ ${T2[0]}, ${T1[1]} ↔ ${T2[1]}, ${T1[2]} ↔ ${T2[2]}`;
        switch (idx % 4) {
          case 0: {
            const s1 = int(r, 7, 12), s2 = s1 + int(r, 1, 4), s3 = s2 + int(r, 1, 4);
            const [p, q, s] = shuffle(r, [s1, s2, s3]);
            return { prompt: `△${T1} ≅ △${T2}. ${T1[0]}${T1[1]} = ${p}, ${T2[1]}${T2[2]} = ${q} and ${T2[0]}${T2[2]} = ${s}. What is the perimeter of △${T1}?`,
              value: p + q + s,
              explanation: `By correspondence (${map}), ${T1[1]}${T1[2]} = ${T2[1]}${T2[2]} = ${q} and ${T1[0]}${T1[2]} = ${T2[0]}${T2[2]} = ${s}. The three given lengths are three different sides, so the perimeter is ${p} + ${q} + ${s} = ${p + q + s}. Thinking two of the lengths are the same side is the usual slip.` };
          }
          case 1: {
            const a = int(r, 35, 70), b = int(r, 40, 68);
            const e1 = mkExpr(r, x, a), e2 = mkExpr(r, x, a, [e1.a]);
            return { prompt: `△${T1} ≅ △${T2}. m∠${T1[0]} = ${deg(e1)}, m∠${T2[0]} = ${deg(e2)} and m∠${T1[1]} = ${b}°. What is m∠${T2[2]}, in degrees?`,
              value: 180 - a - b,
              explanation: `∠${T1[0]} and ∠${T2[0]} correspond, so ${e1.s} = ${e2.s}, x = ${x} and both measure ${a}°. Then m∠${T1[2]} = 180 − ${a} − ${b} = ${180 - a - b}°, and ∠${T2[2]} corresponds to it. Stopping at ${a}° is the usual slip.` };
          }
          case 2: {
            const perms = [[1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]];
            const [s0, s1, s2] = shuffle(r, perms);
            const ap = (T, p) => p.map((n) => T[n]).join('');
            return { prompt: `△${T1} ≅ △${T2}. Which statement is another correct way to write this congruence?`,
              ...mc(r, `△${ap(T1, s0)} ≅ △${ap(T2, s0)}`, [`△${ap(T1, s0)} ≅ △${T2}`, `△${ap(T1, s0)} ≅ △${ap(T2, s1)}`, `△${ap(T1, s0)} ≅ △${ap(T2, s2)}`]),
              explanation: `The correspondence ${map} must be kept: whatever order the first triangle's vertices are written in, the second triangle's must follow the same order. Only △${ap(T1, s0)} ≅ △${ap(T2, s0)} does. Reordering one triangle but not the other is the usual slip.` };
          }
          default: {
            const v = int(r, 14, 36), v2 = int(r, 12, 34);
            const e1 = mkExpr(r, x, v), e2 = mkExpr(r, x, v, [e1.a]), e3 = mkExpr(r, x, v2);
            return { prompt: `△${T1} ≅ △${T2}. ${T1[0]}${T1[1]} = ${e1.s}, ${T2[0]}${T2[1]} = ${e2.s} and ${T1[1]}${T1[2]} = ${e3.s}. What is the length of ${T2[1]}${T2[2]}?`,
              value: v2,
              explanation: `${T1[0]}${T1[1]} and ${T2[0]}${T2[1]} correspond, so ${e1.s} = ${e2.s} and x = ${x}. ${T2[1]}${T2[2]} corresponds to ${T1[1]}${T1[2]} = ${e3.a}(${x}) ${signed(e3.b)} = ${v2}. Answering ${v} gives the wrong side.` };
          }
        }
      } },
    ],
  },

  // ── 10 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'congruence-proofs',
    skillId: 'geo-congruence-proofs',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const [A, B, C, D] = pick(r, QUADS).split('');
        switch (idx % 4) {
          case 0:
            return { prompt: `Given: ${A}${B} ≅ ${C}${B}, and ${B}${D} bisects ∠${A}${B}${C}, with ${D} on side ${A}${C} of △${A}${B}${C}. Prove: △${A}${B}${D} ≅ △${C}${B}${D}. Statement 1: ${A}${B} ≅ ${C}${B} (Given). Statement 2: ∠${A}${B}${D} ≅ ∠${C}${B}${D} (Definition of angle bisector). Statement 3: ${B}${D} ≅ ${B}${D}. What is the reason for Statement 3?`,
              ...mc(r, 'Reflexive Property of Congruence', ['Symmetric Property of Congruence', 'Definition of midpoint', 'CPCTC']),
              explanation: `A segment is congruent to itself: that is the Reflexive Property, used for a side shared by both triangles. CPCTC can only be used AFTER the triangles are proved congruent, and no midpoint is given.` };
          case 1:
            return { prompt: `Given: segments ${A}${C} and ${B}${D} intersect at M, and M is the midpoint of both ${A}${C} and ${B}${D}. Prove: △${A}M${B} ≅ △${C}M${D}. Statement 2 of the proof is ${A}M ≅ ${C}M. What is the reason for Statement 2?`,
              ...mc(r, 'Definition of midpoint', ['Definition of angle bisector', 'Reflexive Property of Congruence', 'Vertical Angles Theorem']),
              explanation: `A midpoint divides a segment into two congruent segments, so ${A}M ≅ ${C}M by the definition of midpoint. The Reflexive Property is for a segment and itself, and the Vertical Angles Theorem is about angles, not segments.` };
          case 2:
            return { prompt: `Given: segments ${A}${C} and ${B}${D} intersect at M, and M is the midpoint of both ${A}${C} and ${B}${D}. Prove: △${A}M${B} ≅ △${C}M${D}. Statement 3 of the proof is ∠${A}M${B} ≅ ∠${C}M${D}. What is the reason for Statement 3?`,
              ...mc(r, 'Vertical Angles Theorem', ['Alternate Interior Angles Theorem', 'Reflexive Property of Congruence', 'Definition of midpoint']),
              explanation: `∠${A}M${B} and ∠${C}M${D} are opposite angles formed by the intersecting segments, so they are vertical angles and congruent. Alternate interior angles would need parallel lines, which are not given.` };
          default:
            return { prompt: `Given: in quadrilateral ${A}${B}${C}${D}, ${A}${B} ∥ ${C}${D} and ${A}${B} ≅ ${C}${D}; diagonal ${A}${C} is drawn. Prove: △${A}${B}${C} ≅ △${C}${D}${A}. Statement 2 of the proof is ∠${B}${A}${C} ≅ ∠${D}${C}${A}. What is the reason for Statement 2?`,
              ...mc(r, 'Alternate Interior Angles Theorem', ['Corresponding Angles Postulate', 'Vertical Angles Theorem', 'CPCTC']),
              explanation: `${A}${C} is a transversal of the parallel sides ${A}${B} and ${C}${D}; ∠${B}${A}${C} and ∠${D}${C}${A} lie between the parallel lines on opposite sides of ${A}${C}, so they are alternate interior angles. CPCTC cannot be used before the triangles are proved congruent.` };
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const [A, B, C, D] = pick(r, QUADS).split('');
        switch (idx % 4) {
          case 0:
            return { prompt: `A proof that △${A}${B}${D} ≅ △${C}${B}${D} has these steps. 1: ${A}${B} ≅ ${C}${B} (Given). 2: ∠${A}${B}${D} ≅ ∠${C}${B}${D} (Definition of angle bisector). 3: ${B}${D} ≅ ${B}${D} (Reflexive Property). 4: △${A}${B}${D} ≅ △${C}${B}${D}. What is the reason for step 4?`,
              ...mcFixed(r, ['SSS', 'SAS', 'ASA', 'AAS'], 'SAS'),
              explanation: `The steps give two pairs of sides (${A}${B} ≅ ${C}${B} and ${B}${D} ≅ ${B}${D}) and the angles at ${B} between them, so the reason is SAS. Counting "two sides and an angle" without checking the angle is included is the usual slip.` };
          case 1:
            return { prompt: `Segments ${A}${C} and ${B}${D} intersect at M. A proof has these steps. 1: M is the midpoint of ${A}${C} and of ${B}${D} (Given). 2: ${A}M ≅ ${C}M and ${B}M ≅ ${D}M (Definition of midpoint). 3: ? (Vertical Angles Theorem). 4: △${A}M${B} ≅ △${C}M${D} (SAS). Which statement is step 3?`,
              ...mc(r, `∠${A}M${B} ≅ ∠${C}M${D}`, [`∠${A}M${D} ≅ ∠${C}M${B}`, `∠M${A}${B} ≅ ∠M${C}${D}`, `${A}${B} ≅ ${C}${D}`]),
              explanation: `SAS needs the angle between ${A}M and ${B}M and the angle between ${C}M and ${D}M: ∠${A}M${B} ≅ ∠${C}M${D}, which are vertical angles. ∠${A}M${D} and ∠${C}M${B} are vertical too, but they are not angles of these two triangles.` };
          case 2:
            return { prompt: `In quadrilateral ${A}${B}${C}${D}, diagonal ${A}${C} is drawn. A proof has these steps. 1: ${A}${B} ∥ ${C}${D} and ${A}${B} ≅ ${C}${D} (Given). 2: ∠${B}${A}${C} ≅ ∠${D}${C}${A} (Alternate Interior Angles Theorem). 3: ${A}${C} ≅ ${C}${A} (Reflexive Property). 4: △${A}${B}${C} ≅ △${C}${D}${A}. What is the reason for step 4?`,
              ...mcFixed(r, ['SSS', 'SAS', 'ASA', 'AAS'], 'SAS'),
              explanation: `The steps give sides ${A}${B} ≅ ${C}${D} and ${A}${C} ≅ ${C}${A} with the included angles ∠${B}${A}${C} ≅ ∠${D}${C}${A}: SAS. Seeing an angle from parallel lines and assuming ASA is the usual slip — only one pair of angles is known.` };
          default:
            return { prompt: `A proof has these steps. 1: ${A}${B} ≅ ${C}${B} (Given). 2: ∠${A}${B}${D} ≅ ∠${C}${B}${D} (Definition of angle bisector). 3: ${B}${D} ≅ ${B}${D} (Reflexive Property). 4: △${A}${B}${D} ≅ △${C}${B}${D} (SAS). 5: ${A}${D} ≅ ${C}${D}. What is the reason for step 5?`,
              ...mc(r, 'CPCTC', ['Reflexive Property of Congruence', 'Definition of midpoint', 'SAS']),
              explanation: `Once the triangles are proved congruent, their corresponding parts are congruent — CPCTC. ${D} was never given as a midpoint; that is what step 5 establishes, so it cannot be its reason.` };
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [A, B, C, D] = pick(r, QUADS).split('');
        switch (idx % 4) {
          case 0:
            return { prompt: `A proof that △${A}${B}${D} ≅ △${C}${B}${D} uses these four steps, listed out of order. I: △${A}${B}${D} ≅ △${C}${B}${D} by SAS. II: ${B}${D} ≅ ${B}${D} by the Reflexive Property. III: ${A}${B} ≅ ${C}${B} and ${B}${D} bisects ∠${A}${B}${C} (Given). IV: ∠${A}${B}${D} ≅ ∠${C}${B}${D} by the definition of angle bisector. Which order is logically valid?`,
              ...mc(r, 'III, IV, II, I', ['IV, III, II, I', 'III, IV, I, II', 'I, III, IV, II']),
              explanation: `Each step may use only what comes before it. IV uses the bisector given in III, and the SAS conclusion (I) needs both sides and the angle, so it must come last: III, IV, II, I. Stating the congruence before all three parts are established is the usual slip.` };
          case 1:
            return { prompt: `Given: in △${A}${B}${C}, ${D} is on ${A}${C}, ${B}${D} ⊥ ${A}${C}, and ${D} is the midpoint of ${A}${C}. Prove: ${A}${B} ≅ ${C}${B}. Steps: 1: Given. 2: ∠${A}${D}${B} and ∠${C}${D}${B} are right angles (Definition of perpendicular). 3: ∠${A}${D}${B} ≅ ∠${C}${D}${B} (All right angles are congruent). 4: ${A}${D} ≅ ${C}${D} (Definition of midpoint). 5: ${B}${D} ≅ ${B}${D} (Reflexive Property). 6: △${A}${D}${B} ≅ △${C}${D}${B}. 7: ${A}${B} ≅ ${C}${B} (CPCTC). What is the reason for step 6?`,
              ...mcFixed(r, ['SAS', 'HL', 'SSS', 'ASA'], 'SAS'),
              explanation: `Steps 3 to 5 give two pairs of sides (${A}${D} ≅ ${C}${D}, ${B}${D} ≅ ${B}${D}) and the right angles between them: SAS. HL would need the hypotenuses ${A}${B} and ${C}${B} congruent, and that is what the proof is trying to show — using it would be circular.` };
          case 2:
            return { prompt: `Given: in △${A}${B}${C}, ${D} is on ${A}${C}, ${B}${D} ⊥ ${A}${C}, and ${A}${B} ≅ ${C}${B}. Steps: 1: Given. 2: ∠${A}${D}${B} and ∠${C}${D}${B} are right angles (Definition of perpendicular). 3: ${B}${D} ≅ ${B}${D} (Reflexive Property). 4: △${A}${D}${B} ≅ △${C}${D}${B}. What is the reason for step 4?`,
              ...mcFixed(r, ['HL', 'SAS', 'SSA', 'ASA'], 'HL'),
              explanation: `Both are right triangles (step 2), their hypotenuses ${A}${B} and ${C}${B} are congruent (given) and they share leg ${B}${D} (step 3): HL. SAS fails because the right angle is not between ${A}${B} and ${B}${D}, and SSA alone is never a valid reason.` };
          default:
            return { prompt: `In quadrilateral ${A}${B}${C}${D}, diagonal ${A}${C} is drawn. A student is proving △${A}${B}${C} ≅ △${C}${D}${A} and has written: 1: ${A}${B} ∥ ${C}${D} (Given). 2: ∠${B}${A}${C} ≅ ∠${D}${C}${A} (Alternate Interior Angles Theorem). 3: ${A}${C} ≅ ${C}${A} (Reflexive Property). Which additional statement lets the student finish the proof by ASA?`,
              ...mc(r, `∠${B}${C}${A} ≅ ∠${D}${A}${C}`, [`${A}${B} ≅ ${C}${D}`, `${B}${C} ≅ ${D}${A}`, `∠${B} ≅ ∠${D}`]),
              explanation: `ASA needs the side ${A}${C} to lie between two pairs of congruent angles: the angles at ${A} and ${C} in each triangle. So the student needs ∠${B}${C}${A} ≅ ∠${D}${A}${C}. ${A}${B} ≅ ${C}${D} would finish it by SAS instead, ∠${B} ≅ ∠${D} by AAS, and ${B}${C} ≅ ${D}${A} gives only SSA.` };
        }
      } },
    ],
  },

  // ── 11 ───────────────────────────────────────────────────────────────────
  {
    courseSkill: 'pythagorean-converse',
    skillId: 'geo-pythagorean-converse',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const [a, b, c0] = pick(r, RIGHT_TRIPLES);
        switch (idx % 4) {
          case 0:
          case 2: {
            const right = idx % 4 === 0;
            const c = right ? c0 : c0 + pick(r, [1, 2]);
            const anyThree = `Yes, because any three lengths with ${a} + ${b} > ${c} form a right triangle`;
            return { prompt: `A triangle has side lengths ${a}, ${b} and ${c}. Which statement correctly decides whether it is a right triangle?`,
              ...(right
                ? mc(r, `Yes, because ${a}² + ${b}² = ${c}²`, [`No, because ${a}² + ${c}² ≠ ${b}²`, `No, because ${a} + ${b} ≠ ${c}`, anyThree])
                : mc(r, `No, because ${a}² + ${b}² ≠ ${c}²`, [`Yes, because ${a}² + ${b}² = ${c}²`, anyThree, `No, because a triangle cannot have sides ${a}, ${b} and ${c}`])),
              explanation: `Test the longest side against the other two: ${a}² + ${b}² = ${sq(a) + sq(b)} and ${c}² = ${sq(c)}. They are ${right ? 'equal, so by the converse of the Pythagorean Theorem the triangle is right' : 'not equal, so the triangle is not right'}. Putting a shorter side in the place of c, or adding the sides without squaring, is the usual slip.` };
          }
          case 1:
            return { prompt: `The two shorter sides of a triangle measure ${a} and ${b}. What must the length of the longest side be for the triangle to be a right triangle?`,
              value: c0,
              explanation: `The longest side c must satisfy c² = ${a}² + ${b}² = ${sq(a) + sq(b)}, so c = ${c0}. Adding the sides (${a + b}) instead of their squares is the usual slip.` };
          default: {
            const four = shuffle(r, RIGHT_TRIPLES).slice(0, 4);
            const fmt = (t) => `${t[0]}, ${t[1]}, ${t[2]}`;
            const wrongs = four.slice(1).map(([p, q, s], n) => fmt([p, q, s + (n === 1 ? -1 : 1)]));
            return { prompt: 'Which set of side lengths forms a right triangle?',
              ...mc(r, fmt(four[0]), wrongs),
              explanation: `Only ${fmt(four[0])} satisfies a² + b² = c²: ${sq(four[0][0])} + ${sq(four[0][1])} = ${sq(four[0][2])}. Each other set is off by 1 in its longest side, so "it looks like a triple" is not enough — square and check.` };
          }
        }
      } },
      { difficulty: 3, gen: (r, idx) => {
        const [a, b, c0] = pick(r, RIGHT_TRIPLES.slice(1));
        const CLASS = ['Acute', 'Right', 'Obtuse', 'These lengths cannot form a triangle'];
        switch (idx % 4) {
          case 0:
          case 2: {
            const c = c0 + (idx % 4 === 0 ? pick(r, [-1, 1]) : pick(r, [-1, 0, 2]));
            const type = bySides([a, b, c]);
            const [s1, s2, s3] = shuffle(r, [a, b, c]);
            const [lo, mid, big] = [a, b, c].sort((p, q) => p - q);
            return { prompt: `A triangle has side lengths ${s1}, ${s2} and ${s3}. Is the triangle acute, right or obtuse?`,
              ...mcFixed(r, CLASS, type),
              explanation: `The longest side is ${big}: ${big}² = ${sq(big)}, and ${lo}² + ${mid}² = ${sq(lo) + sq(mid)}. Since c² is ${type === 'Right' ? 'equal to' : type === 'Acute' ? 'less than' : 'greater than'} a² + b², the triangle is ${type.toLowerCase()}. Not using the LONGEST side as c is the usual slip.` };
          }
          case 1:
            return { prompt: `A triangle has side lengths ${a}, x and ${c0}, where ${c0} is the longest side. For what value of x is it a right triangle?`,
              value: b,
              explanation: `${a}² + x² = ${c0}², so x² = ${sq(c0)} − ${sq(a)} = ${sq(b)} and x = ${b}. Adding the squares (treating x as the hypotenuse) is the usual slip.` };
          default: {
            const d = c0 + pick(r, [-1, 0, 1]);
            const OPTS = ['The corner is exactly 90°', 'The corner is less than 90°', 'The corner is greater than 90°', 'The three lengths cannot form a triangle'];
            const which = d === c0 ? 0 : d < c0 ? 1 : 2;
            return { prompt: `To check a corner, a carpenter marks a point ${a} ft from the corner along one wall and a point ${b} ft from the corner along the other wall. The straight-line distance between the two marks is ${d} ft. Which conclusion is correct?`,
              ...mcFixed(r, OPTS, OPTS[which]),
              explanation: `${a}² + ${b}² = ${sq(a) + sq(b)} and ${d}² = ${sq(d)}. ${which === 0 ? 'They are equal, so the corner is a right angle.' : which === 1 ? 'The side opposite the corner is too short for a right angle (c² < a² + b²), so the corner is less than 90°.' : 'The side opposite the corner is too long for a right angle (c² > a² + b²), so the corner is greater than 90°.'} Reversing "longer means acute" is the usual slip.` };
          }
        }
      } },
      { difficulty: 4, gen: (r, idx) => {
        const [a, b, c0] = pick(r, RIGHT_TRIPLES);
        switch (idx % 4) {
          case 0: {
            let p, q, n;
            do {
              p = int(r, 3, 9); q = int(r, 3, 9);
              n = sq(p) + sq(q) + pick(r, [-5, -3, 0, 0, 4, 6]);
            } while (p === q || Number.isInteger(Math.sqrt(n)));
            const diff = n - sq(p) - sq(q);
            const type = diff === 0 ? 'Right' : diff < 0 ? 'Acute' : 'Obtuse';
            return { prompt: `A triangle has side lengths ${p}, ${q} and √${n}, where √${n} is the longest side. How is the triangle classified by its angles?`,
              ...mcFixed(r, ['Acute', 'Right', 'Obtuse', 'These lengths cannot form a triangle'], type),
              explanation: `The square of the longest side is ${n}, and ${p}² + ${q}² = ${sq(p) + sq(q)}. Since c² is ${type === 'Right' ? 'equal to' : type === 'Acute' ? 'less than' : 'greater than'} a² + b², the triangle is ${type.toLowerCase()}. Squaring √${n} incorrectly, or reversing the inequality, is the usual slip.` };
          }
          case 1: {
            const [ta, tb, tc] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
            const k = int(r, 2, 6);
            return { prompt: `The side lengths of a triangle are ${ta}x, ${tb}x and ${tc * k}, and ${tc * k} is the longest side. For what value of x is the triangle a right triangle?`,
              value: k,
              explanation: `(${ta}x)² + (${tb}x)² = ${tc * k}² gives ${sq(ta) + sq(tb)}x² = ${sq(tc * k)}, so x² = ${sq(k)} and x = ${k}. Forgetting to square the coefficients (${ta}x² + ${tb}x²) is the usual slip.` };
          }
          case 2:
            return { prompt: `Two sides of a triangle have lengths ${a} and ${b}. The third side has length s and is the longest side. Which describes exactly the values of s for which a triangle exists and is obtuse?`,
              ...mc(r, `${c0} < s < ${a + b}`, [`s > ${c0}`, `${b} < s < ${c0}`, `s = ${c0}`]),
              explanation: `The triangle is obtuse when s² > ${a}² + ${b}² = ${sq(c0)}, so s > ${c0}; and a triangle exists only when s < ${a} + ${b} = ${a + b}. Together: ${c0} < s < ${a + b}. "s > ${c0}" alone forgets the triangle inequality, and ${b} < s < ${c0} is the acute range.` };
          default: {
            const sum = sq(c0) + sq(a);
            return { prompt: `A triangle has side lengths ${c0}, ${a} and ${b}. A student computes ${c0}² + ${a}² = ${sum}, compares it with ${b}² = ${sq(b)}, and concludes the triangle is not a right triangle. Which statement is true?`,
              ...mc(r, `The student is wrong: the longest side, ${c0}, must be tested alone, and ${a}² + ${b}² = ${c0}², so the triangle is right.`, [
                `The student is correct: ${sum} ≠ ${sq(b)}, so the triangle is not right.`,
                `The student is correct, and since ${sum} > ${sq(b)} the triangle is acute.`,
                `The student is wrong: the triangle is right because ${a} + ${b} > ${c0}.`,
              ]),
              explanation: `In the converse of the Pythagorean Theorem, c must be the LONGEST side. ${a}² + ${b}² = ${sq(a)} + ${sq(b)} = ${sq(c0)} = ${c0}², so the triangle is right. The student put the longest side on the wrong side of the equation.` };
          }
        }
      } },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
