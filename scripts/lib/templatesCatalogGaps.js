'use strict';
/**
 * The last catalog gaps: seventeen families no bank or crosswalk could
 * honestly reach — early-years foundations (position words, sorting, number
 * words, measuring, telling time, money), the geometry circle/centers block
 * (bisectors, special right triangles, arcs, tangents, sectors, geometric
 * probability), and five algebra-2/precalculus stragglers (radical
 * equations, adding rational expressions, parabola focus/directrix, angular
 * speed, tangent/secant graphs).
 *
 * These exist so a ladder test-out can NEVER be denied for lack of items —
 * every unified skill crosswalks to a real family after this file.
 *
 * Number design: special right triangles keep the leg as the drawn value so
 * answers are a√2 / 2a / a√3 exactly; arcs draw even degree measures so
 * inscribed angles stay whole; sectors draw θ dividing 360 so answers are
 * clean multiples of π; radical equations draw b² − a to be positive; money
 * draws coins whose totals never need fraction cents. Answers are computed
 * from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = 'K-12';

const TEMPLATES = [
  // ── Early years ──────────────────────────────────────────────────────────
  {
    skillId: 'position-words-basics',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const CASES = [
          { q: 'The cat sits ON TOP of the box. Is the cat above or below the box?', a: 'Above',
            opts: ['Above', 'Below', 'Beside', 'Inside'], e: '"On top" means the cat is higher than the box — above it. Position words come in pairs: above/below, over/under, in front/behind.' },
          { q: 'The ball rolled UNDER the table. Is the ball above or below the table?', a: 'Below',
            opts: ['Below', 'Above', 'Next to', 'On top'], e: '"Under" means lower than — below. Under and below name the same position.' },
          { q: 'Sam stands BETWEEN Ava and Ben. Who is in the middle?', a: 'Sam',
            opts: ['Sam', 'Ava', 'Ben', 'No one'], e: '"Between" places Sam in the middle, with one friend on each side.' },
          { q: 'The dog is INSIDE the house. Where is the dog?', a: 'In the house',
            opts: ['In the house', 'Outside the house', 'On the roof', 'Behind the house'], e: '"Inside" means within — the house contains the dog. Inside/outside is the containment pair.' },
          { q: 'The lamp is to the LEFT of the bed, so the bed is to the ___ of the lamp.', a: 'Right',
            opts: ['Right', 'Left', 'Top', 'Bottom'], e: 'Left and right reverse when you swap the two objects: if A is left of B, then B is right of A.' },
          { q: 'The bird flies OVER the tree. Is the bird higher or lower than the tree?', a: 'Higher',
            opts: ['Higher', 'Lower', 'The same height', 'Inside'], e: '"Over" means passing above — the bird is higher. Over/under works like above/below.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 2, gen: (r, made) => {
        const ORDS = ['first', 'second', 'third', 'fourth', 'fifth'];
        const pos = made % 4;
        const kids = ['Maya', 'Leo', 'Zoe', 'Kai', 'Ana'];
        return { prompt: `Five children stand in line: ${kids.join(', ')}. Who is ${ORDS[pos + 1]} in line?`,
          value: kids[pos + 1],
          options: [kids[pos + 1], kids[pos], kids[(pos + 2) % 5], kids[(pos + 3) % 5]],
          correctOption: 'A',
          explanation: `Count the positions in order: ${kids.map((k, i) => `${k} is ${ORDS[i]}`).slice(0, pos + 2).join(', ')}. Ordinal words (first, second, third…) name POSITIONS, not amounts.` };
      } },
    ],
  },

  {
    skillId: 'sorting-attributes',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const CASES = [
          { q: 'A group holds a red circle, a red square, and a red triangle. What attribute was used to sort them?', a: 'Color',
            opts: ['Color', 'Shape', 'Size', 'Weight'], e: 'The shapes differ, but everything is red — color is the shared attribute. Sorting means grouping by ONE shared property.' },
          { q: 'A group holds a small circle, a big circle, and a medium circle. What attribute do they share?', a: 'Shape',
            opts: ['Shape', 'Size', 'Color', 'Number'], e: 'The sizes differ, but every piece is a circle — the sort is by shape.' },
          { q: 'Which does NOT belong: a big dog, a big house, a big truck, a small ball?', a: 'The small ball',
            opts: ['The small ball', 'The big dog', 'The big house', 'The big truck'], e: 'Three are big; the ball is small. Odd-one-out puzzles are sorting in reverse — find the attribute everyone else shares.' },
          { q: 'Buttons are sorted into a two-hole pile and a four-hole pile. What attribute was used?', a: 'Number of holes',
            opts: ['Number of holes', 'Color', 'Size', 'Shape'], e: 'The piles differ by hole count — a countable attribute. Anything you can name or count can be a sorting rule.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 3, 8), b = int(r, 2, 7);
        return { prompt: `Toys are sorted by color: ${a} red toys and ${b} blue toys. How many toys are there in all?`,
          value: a + b,
          explanation: `Sorting splits the group without changing its size: ${a} + ${b} = ${a + b} toys. Counting each pile and adding is how sorting turns into early data work.` };
      } },
    ],
  },

  {
    skillId: 'number-words-basics',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        const n = (made * 3 + 2) % 10 + 1; // cycles 3,6,9,2,5,8,1,4,7,10
        if (made % 2 === 0) {
          return { prompt: `Write the numeral for the word "${WORDS[n]}".`,
            value: n,
            explanation: `The word "${WORDS[n]}" names the number ${n}. Matching number words to numerals is reading's first handshake with math.` };
        }
        const opts = [WORDS[n], WORDS[(n + 2) % 11], WORDS[(n + 5) % 11], WORDS[(n + 8) % 11]];
        return { prompt: `Which word names the number ${n}?`,
          value: WORDS[n], options: opts,
          correctOption: 'A',
          explanation: `${n} is written "${WORDS[n]}". Counting aloud while pointing at numerals ties the three forms together — quantity, numeral, word.` };
      } },
      { difficulty: 2, gen: (r, made) => {
        const TEENS = { 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty' };
        const keys = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        const n = keys[made % keys.length];
        return { prompt: `Write the numeral for the word "${TEENS[n]}".`,
          value: n,
          explanation: `"${TEENS[n]}" is ${n}. The teen words are the trickiest — "${TEENS[n]}"${n < 20 ? ` hides the ten inside (10 + ${n - 10})` : ' is two tens'}, which place-value work will soon make visible.` };
      } },
    ],
  },

  {
    skillId: 'measuring-length-basics',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 5, 12), b = int(r, 2, a - 2);
        return { prompt: `A pencil is ${a} cubes long. A crayon is ${b} cubes long. How much longer is the pencil?`,
          value: a - b,
          explanation: `Compare by subtracting: ${a} − ${b} = ${a - b} cubes. Measuring with same-size units (cubes, paper clips) is the step before rulers — the units must match for the comparison to mean anything.` };
      } },
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Which unit fits best for measuring the height of a door?', a: 'Meters',
            opts: ['Meters', 'Centimeters', 'Kilometers', 'Millimeters'], e: 'A door is about 2 meters tall — meters give a small, sayable number. Centimeters would work but give ~200; kilometers are for distances between places.' },
          { q: 'Which unit fits best for measuring the length of an ant?', a: 'Millimeters',
            opts: ['Millimeters', 'Meters', 'Kilometers', 'Liters'], e: 'An ant is a few millimeters long. Choosing units that give small whole numbers is the heart of measurement sense. (Liters measure volume, not length.)' },
          { q: 'A ribbon measures 3 with a short unit and again with a longer unit. Which count is BIGGER?', a: 'The count with the short unit',
            opts: ['The count with the short unit', 'The count with the long unit', 'Both counts are equal', 'It cannot be known'], e: 'Shorter units take more copies to cover the same length — unit size and count trade off inversely. This is the key measurement insight before standard units.' },
          { q: 'To measure a ribbon with paper clips correctly, the clips must be laid ___.', a: 'End to end with no gaps or overlaps',
            opts: ['End to end with no gaps or overlaps', 'In a pile', 'With spaces between them', 'Only at the two ends'], e: 'Gaps undercount and overlaps double-count. End-to-end tiling is what makes the count a measurement.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
    ],
  },

  {
    skillId: 'telling-time-basics',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const h = int(r, 1, 12);
        if (made % 2 === 0) {
          return { prompt: `On a clock, the hour hand points at ${h} and the minute hand points straight up at 12. What time is it?`,
            value: `${h}:00`,
            explanation: `Minute hand at 12 means o'clock: ${h}:00. The short hand names the hour; the long hand at 12 says the hour is exact.` };
        }
        return { prompt: `The hour hand is just past ${h} and the minute hand points straight down at 6. What time is it?`,
          value: `${h}:30`,
          explanation: `Minute hand at 6 means half past: ${h}:30. Halfway around the clock is 30 minutes — and note the hour hand sits BETWEEN ${h} and ${h === 12 ? 1 : h + 1}, which is what "half past" looks like.` };
      } },
      { difficulty: 2, gen: (r) => {
        const h = int(r, 1, 12), tick = int(r, 1, 11);
        return { prompt: `The hour hand is near ${h} and the minute hand points at the ${tick} on the clock face. How many minutes past the hour is that?`,
          value: tick * 5,
          explanation: `Each number on the face marks 5 minutes: ${tick} × 5 = ${tick * 5} minutes, so the time is ${h}:${String(tick * 5).padStart(2, '0')}. Skip-counting by fives around the face is exactly how the clock is read.` };
      } },
    ],
  },

  {
    skillId: 'money-counting-basics',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const COINS = [['penny', 1], ['nickel', 5], ['dime', 10], ['quarter', 25]];
        const [name, cents] = COINS[made % COINS.length];
        const k = int(r, 2, 6);
        return { prompt: `How many cents are ${k} ${name === 'penny' ? 'pennies' : name + 's'} worth?`,
          value: k * cents,
          explanation: `A ${name} is worth ${cents}¢, so ${k} of them are ${k} × ${cents} = ${k * cents}¢. Skip-counting by ${cents} is the fastest way to count same-value coins.` };
      } },
      { difficulty: 2, gen: (r) => {
        const q = int(r, 0, 3), d = int(r, 1, 4), n = int(r, 0, 3), p = int(r, 0, 4);
        const total = q * 25 + d * 10 + n * 5 + p;
        return { prompt: `Count the money: ${q} quarter${q === 1 ? '' : 's'}, ${d} dime${d === 1 ? '' : 's'}, ${n} nickel${n === 1 ? '' : 's'}, and ${p} penn${p === 1 ? 'y' : 'ies'}. How many cents in all?`,
          value: total,
          explanation: `Count from the biggest coin down: ${q} × 25 = ${q * 25}, plus ${d} × 10 = ${d * 10}, plus ${n} × 5 = ${n * 5}, plus ${p} = ${total}¢. Largest-first keeps the running total easy.` };
      } },
    ],
  },

  // ── Geometry: circles and centers ────────────────────────────────────────
  {
    skillId: 'geo-bisectors-centers',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const x = pick(r, [40, 56, 64, 72, 84, 100]);
          return { prompt: `Ray BD bisects angle ABC, which measures ${x}°. What is the measure of angle ABD?`,
            value: x / 2,
            explanation: `A bisector splits the angle into two equal halves: ${x}/2 = ${x / 2}°. "Bisect" always means two EQUAL parts — of an angle here, of a segment for a perpendicular bisector.` };
        }
        const d = int(r, 3, 9);
        return { prompt: `Point P lies on the perpendicular bisector of segment AB, and PA = ${d}. What is PB?`,
          value: d,
          explanation: `The perpendicular bisector is exactly the set of points EQUIDISTANT from A and B, so PB = PA = ${d}. This equidistance property is why the circumcenter (where the three bisectors meet) reaches all three vertices equally.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const CASES = [
            { q: 'Which center of a triangle is equidistant from the three VERTICES?', a: 'Circumcenter',
              e: 'The circumcenter — the meet of the perpendicular bisectors — is equidistant from the vertices, so a circle centered there passes through all three (the circumscribed circle).' },
            { q: 'Which center of a triangle is equidistant from the three SIDES?', a: 'Incenter',
              e: 'The incenter — the meet of the angle bisectors — is equidistant from the sides, so the inscribed circle fits inside touching all three.' },
            { q: 'Which center of a triangle is its balance point (where the medians meet)?', a: 'Centroid',
              e: 'The centroid is the meet of the medians and the physical balance point of a triangular sheet. Vertices vs sides vs balance — each center answers a different "equidistant from what?"' },
          ];
          const c = CASES[Math.floor(made / 2) % CASES.length];
          return { prompt: c.q, value: c.a,
            options: ['Circumcenter', 'Incenter', 'Centroid', 'Orthocenter'],
            correctOption: 'ABC'[['Circumcenter', 'Incenter', 'Centroid'].indexOf(c.a)],
            explanation: c.e };
        }
        const short = int(r, 2, 8);
        return { prompt: `The centroid divides each median in a 2:1 ratio, vertex side longer. If the short piece (centroid to midpoint) is ${short}, how long is the whole median?`,
          value: 3 * short,
          explanation: `The pieces are 2:1, so the long piece is ${2 * short} and the whole median is ${2 * short} + ${short} = ${3 * short}. The centroid always sits one third of the way up from each side.` };
      } },
    ],
  },

  {
    skillId: 'special-right-triangles',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const a = int(r, 2, 9);
        if (made % 2 === 0) {
          return { prompt: `A 45-45-90 triangle has legs of length ${a}. What is the exact length of the hypotenuse?`,
            value: `${a}√2`,
            explanation: `In a 45-45-90 triangle the hypotenuse is leg × √2: ${a}√2. (Check with Pythagoras: ${a}² + ${a}² = ${2 * a * a} = (${a}√2)².) Half a square, cut along its diagonal.` };
        }
        return { prompt: `A 30-60-90 triangle has a SHORT leg of length ${a}. What is the length of the hypotenuse?`,
          value: 2 * a,
          explanation: `The 30-60-90 sides are in ratio 1 : √3 : 2, so the hypotenuse is twice the short leg: ${2 * a}. Half an equilateral triangle — the short leg is half the original side, which is the hypotenuse.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const a = int(r, 2, 8);
        if (made % 2 === 0) {
          return { prompt: `A 30-60-90 triangle has a short leg of length ${a}. What is the exact length of the LONGER leg?`,
            value: `${a}√3`,
            explanation: `Ratio 1 : √3 : 2 puts the longer leg at short × √3 = ${a}√3. (Check: ${a}² + (${a}√3)² = ${a * a} + ${3 * a * a} = ${4 * a * a} = (${2 * a})² ✓.)` };
        }
        return { prompt: `A square has sides of length ${a}. What is the exact length of its diagonal?`,
          value: `${a}√2`,
          explanation: `The diagonal splits the square into two 45-45-90 triangles, so it measures side × √2 = ${a}√2 — the special-triangle ratio applied to the shape it comes from.` };
      } },
    ],
  },

  {
    skillId: 'circle-arcs-chords',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const arc = 2 * int(r, 20, 80);
        return { prompt: `A central angle of a circle measures ${arc}°. What is the measure of the arc it intercepts?`,
          value: arc,
          explanation: `A central angle and its intercepted arc have the SAME measure: ${arc}°. The angle at the center literally sweeps out the arc — they are two views of one turning.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const arc = 2 * int(r, 20, 80);
        if (made % 2 === 0) {
          return { prompt: `An INSCRIBED angle intercepts an arc of ${arc}°. What is the measure of the inscribed angle?`,
            value: arc / 2,
            explanation: `An inscribed angle is HALF its intercepted arc: ${arc}/2 = ${arc / 2}°. Same arc, but the vertex sits on the circle instead of at the center — the view from the rim is half as wide.` };
        }
        return { prompt: 'An angle is inscribed in a semicircle (its intercepted arc is 180°). What is its measure?',
          value: 90,
          explanation: 'Half of 180° is 90° — every angle inscribed in a semicircle is right (Thales\' theorem). A diameter seen from anywhere on the circle makes a perfect corner.' };
      } },
    ],
  },

  {
    skillId: 'circle-tangents-secants',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'A tangent line touches a circle at point P. What angle does the tangent make with the radius drawn to P?',
            value: 90,
            explanation: 'A tangent is always perpendicular to the radius at the point of tangency: 90°. This right angle is the entry point of nearly every tangent problem — it plants a right triangle in the figure.' };
        }
        const d = int(r, 4, 12);
        return { prompt: `From external point Q, two tangent segments touch a circle. One has length ${d}. How long is the other?`,
          value: d,
          explanation: `Tangent segments from the same external point are congruent: both ${d}. (The two right triangles they form with the radii are congruent by hypotenuse-leg.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
        return { prompt: `A tangent touches a circle of radius ${a}. The center is ${c} units from an external point on the tangent line. How long is the tangent segment from that point to the point of tangency?`,
          value: b,
          explanation: `Radius ⟂ tangent makes a right triangle: leg ${a} (radius), hypotenuse ${c} (center to point). Tangent segment = √(${c}² − ${a}²) = ${b} — the ${a}-${b}-${c} triple. The perpendicularity theorem converts every such problem to Pythagoras.` };
      } },
    ],
  },

  {
    skillId: 'arc-length-sectors',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const theta = pick(r, [60, 90, 120, 180]), rad = pick(r, [3, 6, 9, 12]);
        const frac = theta / 360;
        const len = 2 * rad * frac; // coefficient of π
        return { prompt: `A circle has radius ${rad}. Find the length of an arc with central angle ${theta}°. Give an exact answer in terms of π.`,
          value: `${len === 1 ? '' : len}π`,
          explanation: `Arc length = (θ/360) × 2πr = (${theta}/360) × 2π(${rad}) = ${len === 1 ? '' : len}π. The arc is just the fraction ${theta}/360 of the full circumference ${2 * rad}π.` };
      } },
      { difficulty: 4, gen: (r) => {
        const theta = pick(r, [60, 90, 120, 180]), rad = pick(r, [6, 12]);
        const area = (theta / 360) * rad * rad; // coefficient of π
        return { prompt: `A circle has radius ${rad}. Find the area of a sector with central angle ${theta}°. Give an exact answer in terms of π.`,
          value: `${area}π`,
          explanation: `Sector area = (θ/360) × πr² = (${theta}/360) × π(${rad * rad}) = ${area}π. Same fraction-of-the-circle logic as arc length — length takes a fraction of circumference, area a fraction of πr².` };
      } },
    ],
  },

  {
    skillId: 'geometric-probability',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const total = pick(r, [10, 12, 20]), fav = int(r, 2, total / 2);
        return { prompt: `A point is chosen at random on a segment of length ${total}. What is the probability it lands on a marked piece of length ${fav}?`,
          value: K.frac(fav, total),
          explanation: `Geometric probability = favorable length / total length = ${fav}/${total} = ${K.frac(fav, total)}. When outcomes form a continuum, counting gives way to measuring — length here, area next.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        // Vary the side ratio — a target always half the side made every
        // answer 1/4.
        const ratio = [[2, 'Half'], [3, 'A third of'], [4, 'A quarter of']][made % 3];
        const big = ratio[0] * pick(r, [2, 3, 4]);
        const small = big / ratio[0];
        return { prompt: `A dart lands at random inside a ${big}-by-${big} square. A ${small}-by-${small} target square sits inside it. What is the probability the dart lands in the target?`,
          value: K.frac(small * small, big * big),
          explanation: `Ratio of areas: ${small}²/${big}² = ${small * small}/${big * big} = ${K.frac(small * small, big * big)}. ${ratio[1]} the side length means 1/${ratio[0] * ratio[0]} of the area — probability scales with area, and area scales with the SQUARE of length.` };
      } },
    ],
  },

  // ── Algebra 2 stragglers ─────────────────────────────────────────────────
  {
    skillId: 'radical-equations',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const b = int(r, 2, 9), a = int(r, 1, b * b - 1);
        return { prompt: `Solve: √(x + ${a}) = ${b}`,
          value: b * b - a,
          explanation: `Square both sides: x + ${a} = ${b * b}, so x = ${b * b - a}. Check in the ORIGINAL: √(${b * b - a} + ${a}) = √${b * b} = ${b} ✓. The check matters — squaring can manufacture solutions the original equation rejects.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const k = pick(r, [2, 3, 5]), b = int(r, 2, 6);
          return { prompt: `Solve: √(${k}x) = ${b}`,
            value: (b * b) / k % 1 === 0 ? (b * b) / k : `${b * b}/${k}`,
            explanation: `Square both sides: ${k}x = ${b * b}, so x = ${b * b}/${k}${(b * b) % k === 0 ? ` = ${(b * b) / k}` : ''}. Verify: √(${k} · ${(b * b) % k === 0 ? (b * b) / k : `${b * b}/${k}`}) = √${b * b} = ${b} ✓.` };
        }
        const c = int(r, 2, 7);
        return { prompt: `A student squares both sides of √x = −${c} and gets x = ${c * c}. Is x = ${c * c} a solution of the original equation?`,
          value: 'No — it is extraneous',
          options: ['No — it is extraneous', 'Yes', 'Only if x is negative', `Only if c = ${c}`],
          correctOption: 'A',
          explanation: `Check: √${c * c} = ${c}, not −${c} — the square root symbol never returns a negative. Squaring erased the sign and invented a solution; the original equation has none. This is WHY radical equations demand the check.` };
      } },
    ],
  },

  {
    skillId: 'adding-rational-expressions',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 5), b = int(r, 1, 6);
        return { prompt: `Add: ${a}/x + ${b}/x`,
          value: `${a + b}/x`,
          explanation: `Same denominator, so numerators add: (${a} + ${b})/x = ${a + b}/x — exactly like ${a}/7 + ${b}/7. Rational expressions follow fraction arithmetic with x standing in for the number.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const k = pick(r, [2, 3, 4]);
          const num = 1 * k + 1; // 1/x + 1/(kx) = (k+1)/(kx)
          return { prompt: `Add: 1/x + 1/(${k}x)`,
            value: `${num}/(${k}x)`,
            explanation: `The LCD is ${k}x. Rewrite: 1/x = ${k}/(${k}x), then ${k}/(${k}x) + 1/(${k}x) = ${num}/(${k}x). Building each fraction up to the least common denominator is the whole technique.` };
        }
        const a = int(r, 1, 4), b = int(r, 1, 4);
        return { prompt: `Subtract: ${a + b}/(x + 1) − ${b}/(x + 1)`,
          value: `${a}/(x + 1)`,
          explanation: `Same denominator: (${a + b} − ${b})/(x + 1) = ${a}/(x + 1). The denominator (x + 1) rides along untouched — only numerators combine, and the excluded value x = −1 stays excluded.` };
      } },
    ],
  },

  {
    skillId: 'parabola-focus-directrix',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const p = pick(r, [1, 2, 3, 4]);
        if (made % 2 === 0) {
          return { prompt: `The parabola x² = ${4 * p}y opens upward from the origin. What are the coordinates of its FOCUS?`,
            value: `(0, ${p})`,
            explanation: `x² = 4py has focus (0, p): here 4p = ${4 * p}, so p = ${p} and the focus is (0, ${p}). The focus sits inside the curve, p units from the vertex along the axis.` };
        }
        return { prompt: `The parabola x² = ${4 * p}y has focus (0, ${p}). What is the equation of its DIRECTRIX?`,
          value: `y = −${p}`,
          explanation: `The directrix mirrors the focus across the vertex: y = −${p}. Focus and directrix sit p = ${p} on either side of the vertex — the parabola is exactly the points equidistant from both.` };
      } },
      { difficulty: 4, gen: (r) => {
        const p = pick(r, [1, 2, 3, 5]);
        return { prompt: `A parabola consists of all points equidistant from the focus (0, ${p}) and the directrix y = −${p}. What is its equation?`,
          value: `x² = ${4 * p}y`,
          explanation: `With focus (0, p) and directrix y = −p, the equidistance condition simplifies to x² = 4py = ${4 * p}y. The defining property IS the equation — setting distance-to-focus equal to distance-to-directrix and squaring derives it in four lines.` };
      } },
    ],
  },

  // ── Precalculus stragglers ───────────────────────────────────────────────
  {
    skillId: 'angular-linear-speed',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const rad = pick(r, [2, 3, 5, 10]), omega = int(r, 2, 8);
        return { prompt: `A wheel of radius ${rad} m spins at ${omega} radians per second. What is the linear speed of a point on its rim? (m/s)`,
          value: rad * omega,
          explanation: `v = rω = ${rad} × ${omega} = ${rad * omega} m/s. Radians make this clean: each radian of turn moves the rim exactly one radius of distance — that is what the unit is FOR.` };
      } },
      { difficulty: 4, gen: (r) => {
        const rpm = pick(r, [10, 20, 30, 45]);
        return { prompt: `A turntable spins at ${rpm} revolutions per minute. What is its angular speed in radians per minute? Give an exact answer in terms of π.`,
          value: `${2 * rpm}π`,
          explanation: `Each revolution is 2π radians: ${rpm} × 2π = ${2 * rpm}π radians per minute. Converting rev → radians first is what lets v = rω work — mixing revolutions into that formula is the standard error.` };
      } },
    ],
  },

  {
    skillId: 'tangent-secant-graphs',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const b = pick(r, [1, 2, 3, 4]);
          return { prompt: `What is the period of y = tan(${b === 1 ? '' : b}x)?`,
            value: b === 1 ? 'π' : `π/${b}`,
            explanation: `Tangent's base period is π (not 2π — its cycle repeats twice as fast as sine's), and the ${b === 1 ? 'coefficient 1 leaves it at π' : `coefficient ${b} compresses it to π/${b}`}. Sine and cosine need a full 2π lap; tangent repeats every half lap.` };
        }
        return { prompt: 'Where does y = tan(x) have vertical asymptotes?',
          value: 'At odd multiples of π/2 (x = ±π/2, ±3π/2, …)',
          options: ['At odd multiples of π/2 (x = ±π/2, ±3π/2, …)', 'At multiples of π', 'At multiples of 2π', 'Tangent has no asymptotes'],
          correctOption: 'A',
          explanation: 'tan x = sin x / cos x blows up where cos x = 0 — exactly the odd multiples of π/2. Each asymptote marks a cosine zero; between consecutive ones, tangent sweeps from −∞ to +∞.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'The graph of y = sec(x) has vertical asymptotes exactly where which function equals zero?',
            value: 'cos(x)',
            options: ['cos(x)', 'sin(x)', 'tan(x)', 'sec(x) itself'],
            correctOption: 'A',
            explanation: 'sec x = 1/cos x, so it blows up at every cosine zero. Graphing secant always starts by sketching cosine: the secant branches sit in the cosine arches, touching at the peaks (±1) and fleeing to the asymptotes.' };
        }
        return { prompt: 'What is the range of y = sec(x)?',
          value: 'y ≤ −1 or y ≥ 1',
          options: ['y ≤ −1 or y ≥ 1', 'All real numbers', '−1 ≤ y ≤ 1', 'y > 0'],
          correctOption: 'A',
          explanation: 'Since |cos x| ≤ 1, its reciprocal satisfies |sec x| ≥ 1 — the band between −1 and 1 is unreachable. Secant\'s range is the exact complement of cosine\'s: the U-shaped branches start at ±1 and open away from the axis.' };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
