'use strict';
/**
 * The six Geometry skills with NO bank content anywhere.
 *
 * These are the gaps the manual crosswalk deliberately left visible (see the
 * "why" note in pathway-crosswalk.manual.json): the fuzzy matcher proposed
 * geometric-mean → mean (the arithmetic average) and similar wrong-topic
 * matches, so these were held back for real authoring rather than mapped.
 *
 * Number design: angle work stays on integer degrees, midsegments draw
 * even-sum bases so halving is exact, and every geometric mean draws a pair
 * whose product is a perfect square (or a right-triangle segment pair whose
 * relation p·(p+q) is one), so answers are whole numbers a student can type.
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '9-12';

const TEMPLATES = [
  {
    skillId: 'points-lines-planes',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        // Foundational-vocabulary MC. Categorical, so cycle on the item index —
        // a random draw could repeat one fact four times.
        const CASES = [
          { q: 'Through any TWO distinct points there is exactly one ___.',
            a: 'Line', opts: ['Line', 'Plane', 'Ray', 'Circle'],
            e: 'Two distinct points determine exactly one line — one of the foundational postulates. A plane needs a third point not on that line.' },
          { q: 'How many NON-COLLINEAR points does it take to determine a plane?',
            a: '3', opts: ['3', '2', '4', '1'],
            e: 'Two points only pin down a line; a third point NOT on that line tips the line into exactly one plane. That is why a three-legged stool never wobbles.' },
          { q: 'Two distinct planes that intersect meet in a ___.',
            a: 'Line', opts: ['Line', 'Point', 'Plane', 'Segment'],
            e: 'Picture a wall meeting the floor: the intersection runs along the whole baseboard — a line, not a single point.' },
          { q: 'Points that lie on the SAME LINE are called ___.',
            a: 'Collinear', opts: ['Collinear', 'Coplanar', 'Congruent', 'Concurrent'],
            e: '"Co-" (together) + "linear" (line): collinear points share a line. Coplanar points share a plane — a weaker condition, since every pair of points is collinear but three points may not be.' },
          { q: 'Points that lie in the SAME PLANE are called ___.',
            a: 'Coplanar', opts: ['Coplanar', 'Collinear', 'Parallel', 'Perpendicular'],
            e: '"Co-" (together) + "planar" (plane). Any three points are always coplanar; four points may not be — think of the corners of a tent.' },
          { q: 'A part of a line with TWO endpoints is called a ___.',
            a: 'Segment', opts: ['Segment', 'Ray', 'Line', 'Angle'],
            e: 'A segment is the piece of a line between two endpoints — it has a definite length. A ray has ONE endpoint and runs forever; a line has none and runs forever both ways.' },
          { q: 'A part of a line with ONE endpoint, extending forever in one direction, is called a ___.',
            a: 'Ray', opts: ['Ray', 'Segment', 'Line', 'Vector'],
            e: 'A ray starts at its endpoint and never stops — like a laser beam. Name it endpoint-first: ray AB starts at A and passes through B.' },
          { q: 'Two distinct lines can intersect in AT MOST how many points?',
            a: '1', opts: ['1', '2', '0', 'Infinitely many'],
            e: 'If two lines shared two points, both would be THE line through those points — and they would be the same line. Distinct lines meet at most once.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r) => {
        const n = int(r, 3, 7);
        const lines = (n * (n - 1)) / 2;
        return { prompt: `${n} points are drawn so that NO three are collinear. How many distinct lines pass through pairs of these points?`,
          value: lines,
          explanation: `Each pair of points determines one line, and no three points share a line, so nothing double-counts: ${n} choose 2 = ${n}·${n - 1}/2 = ${lines}.` };
      } },
    ],
  },

  {
    skillId: 'triangle-inequalities',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        // Alternate CAN and CANNOT — otherwise a seed can draw "Yes" four times.
        const a = int(r, 3, 9), b = int(r, 3, 9);
        const lo = Math.abs(a - b) + 1, hi = a + b - 1;
        const valid = made % 2 === 0;
        const c = valid ? int(r, lo, hi) : a + b + int(r, 0, 3);
        return { prompt: `Can segments of length ${a}, ${b}, and ${c} form a triangle?`,
          value: valid ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only if it is a right triangle', 'Cannot be determined'],
          correctOption: valid ? 'A' : 'B',
          explanation: valid
            ? `Check the Triangle Inequality: each side must be shorter than the other two combined. ${a} + ${b} = ${a + b} > ${c}, ${a} + ${c} = ${a + c} > ${b}, and ${b} + ${c} = ${b + c} > ${a} — all three hold, so yes.`
            : `The Triangle Inequality requires each side to be SHORTER than the other two combined. Here ${a} + ${b} = ${a + b}, which is not greater than ${c} — the two short sides cannot reach around, so no triangle exists.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        const a = int(r, 3, 8); const b = a + int(r, 2, 7);
        const smallest = b - a + 1, largest = a + b - 1;
        if (made % 2 === 0) {
          return { prompt: `Two sides of a triangle measure ${a} and ${b}. What is the SMALLEST whole number the third side could be?`,
            value: smallest,
            explanation: `The third side must be longer than the difference: x > ${b} − ${a} = ${b - a}. The smallest whole number above ${b - a} is ${smallest}. (It must also stay below ${a} + ${b} = ${a + b}.)` };
        }
        return { prompt: `Two sides of a triangle measure ${a} and ${b}. What is the LARGEST whole number the third side could be?`,
          value: largest,
          explanation: `The third side must be shorter than the sum: x < ${a} + ${b} = ${a + b}. The largest whole number below ${a + b} is ${largest}. (It must also stay above ${b} − ${a} = ${b - a}.)` };
      } },
      { difficulty: 4, gen: (r, made) => {
        // Three distinct side lengths; the largest angle sits opposite the
        // longest side. Side a = BC is opposite angle A, b = CA opposite B,
        // c = AB opposite C.
        const base = int(r, 4, 9);
        const sides = [base, base + int(r, 1, 3), base + int(r, 4, 6)]; // strictly increasing
        const order = [[0, 1, 2], [1, 2, 0], [2, 0, 1]][made % 3];
        const a = sides[order[0]], b = sides[order[1]], c = sides[order[2]];
        const wantLargest = made % 2 === 0;
        const target = wantLargest ? Math.max(a, b, c) : Math.min(a, b, c);
        const angle = target === a ? 'Angle A' : target === b ? 'Angle B' : 'Angle C';
        const side = target === a ? `BC = ${a}` : target === b ? `CA = ${b}` : `AB = ${c}`;
        return { prompt: `In triangle ABC, BC = ${a}, CA = ${b}, and AB = ${c}. Which angle is the ${wantLargest ? 'LARGEST' : 'SMALLEST'}?`,
          value: angle,
          options: ['Angle A', 'Angle B', 'Angle C', 'They are all equal'],
          correctOption: 'ABC'[['Angle A', 'Angle B', 'Angle C'].indexOf(angle)],
          explanation: `In any triangle, the ${wantLargest ? 'largest' : 'smallest'} angle sits OPPOSITE the ${wantLargest ? 'longest' : 'shortest'} side. The ${wantLargest ? 'longest' : 'shortest'} side is ${side}, and the angle opposite it is ${angle.toLowerCase()} — each angle faces the side that does not touch it.` };
      } },
    ],
  },

  {
    skillId: 'polygon-angle-sum',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const NAMES = { 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: '12-gon' };
        const n = pick(r, [5, 6, 7, 8, 9, 10, 12]);
        const sum = (n - 2) * 180;
        const art = n === 8 ? 'an' : 'a'; // "an octagon"
        return { prompt: `What is the sum of the interior angles of ${art} ${NAMES[n]} (${n} sides)?`,
          value: sum,
          explanation: `From one vertex, a ${n}-sided polygon splits into ${n - 2} triangles, each contributing 180°: (${n} − 2) · 180° = ${sum}°.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        const n = pick(r, [5, 6, 8, 9, 10, 12]);
        if (made % 2 === 0) {
          const each = ((n - 2) * 180) / n;
          return { prompt: `Each interior angle of a REGULAR ${n}-gon measures how many degrees?`,
            value: each,
            explanation: `The interior angles total (${n} − 2) · 180° = ${(n - 2) * 180}°, and a regular polygon shares that equally among ${n} angles: ${(n - 2) * 180}/${n} = ${each}°.` };
        }
        const ext = 360 / n;
        return { prompt: `Each EXTERIOR angle of a regular ${n}-gon measures how many degrees?`,
          value: ext,
          explanation: `Walking once around any polygon turns you through 360° total, so a regular ${n}-gon turns 360/${n} = ${ext}° at each corner. (Interior + exterior = 180° at every vertex.)` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const n = int(r, 5, 12);
          const sum = (n - 2) * 180;
          return { prompt: `The interior angles of a polygon add up to ${sum}°. How many sides does it have?`,
            value: n,
            explanation: `Undo the formula: sum = (n − 2) · 180, so n − 2 = ${sum}/180 = ${n - 2}, giving n = ${n} sides.` };
        }
        const e = pick(r, [24, 30, 36, 40, 45, 60, 72]);
        const n = 360 / e;
        return { prompt: `Each exterior angle of a regular polygon measures ${e}°. How many sides does the polygon have?`,
          value: n,
          explanation: `Exterior angles of any polygon total 360°, and a regular polygon splits that equally: n = 360/${e} = ${n} sides.` };
      } },
    ],
  },

  {
    skillId: 'quadrilateral-properties',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Which quadrilateral has all four sides congruent AND all four angles right?',
            a: 'Square', opts: ['Square', 'Rhombus', 'Rectangle', 'Trapezoid'],
            e: 'A square is the most specific quadrilateral: congruent sides (like a rhombus) AND right angles (like a rectangle). It inherits every property of both.' },
          { q: 'Which quadrilateral has all four sides congruent, but not necessarily any right angles?',
            a: 'Rhombus', opts: ['Rhombus', 'Rectangle', 'Square', 'Kite'],
            e: 'A rhombus is defined by four congruent sides — a "pushed-over square". Its diagonals are perpendicular bisectors of each other, but its angles need not be 90°.' },
          { q: 'Which quadrilateral has four right angles, but not necessarily four congruent sides?',
            a: 'Rectangle', opts: ['Rectangle', 'Rhombus', 'Trapezoid', 'Parallelogram'],
            e: 'A rectangle is defined by its four right angles. Its diagonals are congruent and bisect each other, but adjacent sides can have different lengths.' },
          { q: 'Which quadrilateral has EXACTLY one pair of parallel sides?',
            a: 'Trapezoid', opts: ['Trapezoid', 'Parallelogram', 'Rhombus', 'Kite'],
            e: 'A trapezoid has exactly one pair of parallel sides (the bases). With TWO pairs of parallel sides it would be a parallelogram instead.' },
          { q: 'Which quadrilateral has two pairs of parallel sides, with no other conditions required?',
            a: 'Parallelogram', opts: ['Parallelogram', 'Trapezoid', 'Square', 'Kite'],
            e: 'Two pairs of parallel sides is the defining property of a parallelogram. Rectangles, rhombi and squares are all SPECIAL parallelograms with extra conditions added.' },
          { q: 'Which quadrilateral has two pairs of CONSECUTIVE congruent sides, but opposite sides that are not congruent?',
            a: 'Kite', opts: ['Kite', 'Rhombus', 'Trapezoid', 'Parallelogram'],
            e: 'A kite pairs up its congruent sides next to each other, like the toy. In a parallelogram or rhombus, the congruent sides sit OPPOSITE each other.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r, made) => {
        const form = made % 3;
        if (form === 0) {
          const x = pick(r, [50, 62, 65, 74, 105, 110, 118, 125]);
          return { prompt: `In parallelogram ABCD, angle A measures ${x}°. What is the measure of the OPPOSITE angle C?`,
            value: x,
            explanation: `Opposite angles of a parallelogram are congruent, so angle C = angle A = ${x}°. (The consecutive angles B and D each measure 180 − ${x} = ${180 - x}°.)` };
        }
        if (form === 1) {
          const x = pick(r, [48, 55, 63, 70, 100, 112, 121, 130]);
          return { prompt: `In parallelogram ABCD, angle A measures ${x}°. What is the measure of the CONSECUTIVE angle B?`,
            value: 180 - x,
            explanation: `Consecutive angles of a parallelogram are supplementary (the sides are parallel, so they are co-interior angles): angle B = 180 − ${x} = ${180 - x}°.` };
        }
        const m = int(r, 4, 12);
        return { prompt: `The diagonals of parallelogram ABCD intersect at P. If AC = ${2 * m}, what is AP?`,
          value: m,
          explanation: `The diagonals of a parallelogram BISECT each other, so P is the midpoint of AC: AP = ${2 * m}/2 = ${m}.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const CASES = [
          { q: 'True or false: every square is a rectangle.', a: 'True',
            e: 'A rectangle needs four right angles — a square has them (plus congruent sides). Adding conditions never disqualifies: the square is the special case.' },
          { q: 'True or false: every rectangle is a square.', a: 'False',
            e: 'A square also needs four CONGRUENT sides. A 3-by-5 rectangle has the right angles but not the equal sides, so rectangles are not automatically squares.' },
          { q: 'True or false: every rhombus is a parallelogram.', a: 'True',
            e: 'Four congruent sides force both pairs of opposite sides to be parallel, so every rhombus is a parallelogram with an extra property.' },
          { q: 'True or false: every parallelogram is a rhombus.', a: 'False',
            e: 'A rhombus needs four congruent sides. A 3-by-5 parallelogram has two pairs of parallel sides but unequal adjacent sides.' },
          { q: 'True or false: every square is a rhombus.', a: 'True',
            e: 'A rhombus needs four congruent sides — a square has them (plus right angles). The square sits at the bottom of the hierarchy, inheriting from both rectangle and rhombus.' },
          { q: 'True or false: every trapezoid is a parallelogram.', a: 'False',
            e: 'A trapezoid has exactly ONE pair of parallel sides; a parallelogram needs two. The two families are disjoint under this definition.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: ['True', 'False'],
          correctOption: c.a === 'True' ? 'A' : 'B', explanation: c.e };
      } },
    ],
  },

  {
    skillId: 'trapezoid-properties',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const b1 = 2 * int(r, 2, 8); let b2 = 2 * int(r, 5, 12);
        if (b2 === b1) b2 += 2;
        const mid = (b1 + b2) / 2;
        return { prompt: `A trapezoid has parallel bases of length ${b1} and ${b2}. How long is its MIDSEGMENT?`,
          value: mid,
          explanation: `The midsegment joins the midpoints of the legs, runs parallel to both bases, and its length is the AVERAGE of the bases: (${b1} + ${b2})/2 = ${mid}.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const form = made % 3;
        if (form === 0) {
          const b1 = 2 * int(r, 2, 7), b2 = b1 + 2 * int(r, 2, 6);
          const mid = (b1 + b2) / 2;
          return { prompt: `A trapezoid's midsegment measures ${mid}, and one base measures ${b1}. How long is the other base?`,
            value: b2,
            explanation: `The midsegment is the average of the bases: (${b1} + x)/2 = ${mid}, so x = 2 · ${mid} − ${b1} = ${b2}.` };
        }
        if (form === 1) {
          const x = pick(r, [52, 58, 64, 70, 76, 82]);
          return { prompt: `In an ISOSCELES trapezoid, one base angle measures ${x}°. What is the measure of the other angle on the SAME base?`,
            value: x,
            explanation: `In an isosceles trapezoid the legs are congruent, so the two base angles on each base are congruent: the other angle is also ${x}°. (Each angle on the OTHER base measures 180 − ${x} = ${180 - x}°.)` };
        }
        const x = pick(r, [55, 60, 68, 74, 100, 115]);
        return { prompt: `In trapezoid ABCD, sides AB and CD are the parallel bases. Angle A (at base AB) measures ${x}°. What is the measure of angle D, on the same leg AD?`,
          value: 180 - x,
          explanation: `AB ∥ CD makes angles A and D co-interior angles on the transversal AD, so they are supplementary: angle D = 180 − ${x} = ${180 - x}°.` };
      } },
    ],
  },

  {
    skillId: 'geometric-mean',
    tiers: [
      { difficulty: 3, gen: (r) => {
        // Pairs whose product is a perfect square, so the mean is whole.
        const [a, b] = pick(r, [[2, 8], [3, 12], [4, 9], [5, 20], [2, 18], [8, 18], [3, 27], [4, 25], [6, 24], [5, 45]]);
        const g = Math.sqrt(a * b);
        return { prompt: `Find the geometric mean of ${a} and ${b}.`,
          value: g,
          explanation: `The geometric mean of a and b is √(a·b): √(${a} · ${b}) = √${a * b} = ${g}. Unlike the arithmetic mean (which averages by ADDING), the geometric mean averages by MULTIPLYING — it is the side of a square with the same area as the ${a}-by-${b} rectangle.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const [p, q] = pick(r, [[4, 9], [2, 8], [3, 12], [9, 16], [4, 16], [2, 18]]);
          const h = Math.sqrt(p * q);
          return { prompt: `In a right triangle, the altitude to the hypotenuse splits the hypotenuse into segments of length ${p} and ${q}. How long is the altitude?`,
            value: h,
            explanation: `The altitude to the hypotenuse is the geometric mean of the two segments it creates: h = √(${p} · ${q}) = √${p * q} = ${h}. (The altitude splits the triangle into two smaller triangles similar to the original — that similarity is where the relation comes from.)` };
        }
        const [p, q] = pick(r, [[4, 5], [2, 6], [3, 9], [9, 7], [5, 15], [16, 9]]);
        const leg = Math.sqrt(p * (p + q));
        return { prompt: `In a right triangle, the altitude to the hypotenuse splits the hypotenuse into segments of length ${p} and ${q}, with the segment of length ${p} adjacent to leg L. How long is leg L?`,
          value: leg,
          explanation: `Each leg is the geometric mean of the WHOLE hypotenuse and the segment adjacent to that leg: L = √(${p} · (${p} + ${q})) = √(${p} · ${p + q}) = √${p * (p + q)} = ${leg}.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
