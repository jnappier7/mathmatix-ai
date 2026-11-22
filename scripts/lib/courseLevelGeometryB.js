'use strict';
/**
 * At-level check items for eleven Geometry course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   parallelogram-proofs · arc-length · sector-area · inscribed-angles ·
 *   circle-theorems · similar-triangle-theorems · similarity-proofs ·
 *   volume-prisms-cylinders · volume-pyramids-cones-spheres ·
 *   surface-area-prisms-cylinders · surface-area-pyramids-cones-spheres
 *
 * No picture exists, so every shape is described in words. Answers are computed
 * from the numbers drawn. Anything with π is either multiple choice "in terms
 * of π" or says "Use 3.14 for π" with a product that terminates. Each wrong
 * choice is the answer a named slip produces (wrong formula, forgot to square,
 * lateral only, diameter for radius, slant height for height …).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelGeometryB.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'geometry';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item (distinct choices, whole numbers). */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 400; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 400 tries');
  };
}

/** Multiple choice: the right answer at a drawn position among three distinct wrong ones. */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((x) => x !== c);
  if (w.length < 3) again();
  const options = w.slice(0, 3);
  const pos = int(r, 0, 3);
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

/** A fixed set of four choices, rotated so the key moves. */
function mcFixed(r, opts, correct) {
  const k = int(r, 0, 3);
  const options = opts.slice(k).concat(opts.slice(0, k));
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

/** "12π", "π", "25π/3" — a rational multiple of π in lowest terms. */
function piStr(n, d = 1) {
  const [a, b] = K.reduce(n, d);
  const coef = a === 1 ? '' : String(a);
  return b === 1 ? `${coef}π` : `${coef}π/${b}`;
}

const dec = (x) => String(Number(x.toFixed(2)));
const isWhole = (x) => Math.abs(x - Math.round(x)) < 1e-9;
const unit = (r) => pick(r, ['cm', 'm', 'ft', 'mm']);

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Point names. Text is written with A–E behind a "#" and relettered.
const SETS = ['ABCDE', 'JKLMN', 'VWXYZ'];
const L = (text, set) => text.replace(/#([A-E]+)/g, (_, s) => [...s].map((ch) => set['ABCDE'.indexOf(ch)]).join(''));

// Pythagorean triples [leg, leg, hypotenuse].
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];
function triple(r, maxHyp = 40) {
  const [a, b, c] = pick(r, TRIPLES);
  const k = int(r, 1, 4);
  if (c * k > maxHyp) again();
  return int(r, 0, 1) ? [a * k, b * k, c * k] : [b * k, a * k, c * k];
}

// [central angle, radius step] — radius = step·k keeps θr/180 a whole number.
const ARC_EASY = [[30, 6], [45, 4], [60, 3], [90, 2], [120, 3]];
const ARC_HARD = [[135, 4], [150, 6], [40, 9], [72, 5], [80, 9], [160, 9], [240, 3], [270, 2]];
// [central angle, radius step] — radius = step·k keeps θr²/360 a whole number.
const SEC_EASY = [[30, 6], [45, 4], [60, 6], [90, 2], [120, 3]];
const SEC_HARD = [[135, 4], [150, 6], [40, 3], [72, 5], [80, 3], [160, 3], [240, 3], [270, 2]];

// ── parallelogram proofs ───────────────────────────────────────────────────

const PGRAM_ENOUGH = [
  '#AB ≅ #CD and #BC ≅ #DA',
  '#AB ∥ #CD and #BC ∥ #DA',
  '#AB ∥ #CD and #AB ≅ #CD',
  '∠#A ≅ ∠#C and ∠#B ≅ ∠#D',
  'Diagonals #AC and #BD bisect each other',
];
const PGRAM_NOT_ENOUGH = [
  '#AB ∥ #CD and #BC ≅ #DA',
  'Diagonals #AC and #BD are congruent',
  'Diagonals #AC and #BD are perpendicular',
  '#AB ≅ #BC and #CD ≅ #DA',
  '#AB ∥ #CD and ∠#B ≅ ∠#C',
  'Diagonal #AC bisects diagonal #BD',
];

const R_REFLEX = 'Reflexive Property of Congruence';
const R_SSS = 'SSS Congruence';
const R_SAS = 'SAS Congruence';
const R_ASA = 'ASA Congruence';
const R_CPCTC = 'CPCTC (corresponding parts of congruent triangles are congruent)';
const R_VERT = 'Vertical Angles Theorem';
const R_AIA = 'Alternate Interior Angles Theorem (parallel lines give congruent angles)';
const R_AIA_CONV = 'Converse of the Alternate Interior Angles Theorem (congruent angles give parallel lines)';
const R_DEF = 'Definition of a parallelogram (both pairs of opposite sides are parallel)';
const R_ONE_PAIR = 'A quadrilateral with one pair of opposite sides both parallel and congruent is a parallelogram';
const R_OPP_ANGLES = 'A quadrilateral with both pairs of opposite angles congruent is a parallelogram';
const R_CORR = 'Corresponding Angles Theorem (parallel lines give congruent corresponding angles)';
const R_AA = 'AA Similarity';
const R_SAS_SIM = 'SAS Similarity';
const R_SSS_SIM = 'SSS Similarity';
const R_RIGHT = 'All right angles are congruent';

const PGRAM_PROOFS = {
  A: {
    intro: 'Given: in quadrilateral #ABCD, #AB ≅ #CD and #BC ≅ #DA. Prove: #ABCD is a parallelogram.',
    steps: [
      'Draw diagonal #AC.',
      '#AC ≅ #AC.',
      '△#ABC ≅ △#CDA.',
      '∠#BAC ≅ ∠#DCA and ∠#BCA ≅ ∠#DAC.',
      '#AB ∥ #CD and #BC ∥ #DA.',
      '#ABCD is a parallelogram.',
    ],
  },
  B: {
    intro: 'Given: the diagonals of quadrilateral #ABCD meet at #E, with #AE ≅ #CE and #BE ≅ #DE. Prove: #ABCD is a parallelogram.',
    steps: [
      '∠#AEB ≅ ∠#CED.',
      '△#AEB ≅ △#CED.',
      '#AB ≅ #CD and ∠#BAE ≅ ∠#DCE.',
      '#AB ∥ #CD.',
      '#ABCD is a parallelogram.',
    ],
  },
  C: {
    intro: 'Given: #ABCD is a parallelogram. Prove: #AB ≅ #CD.',
    steps: [
      'Draw diagonal #AC.',
      '#AB ∥ #CD and #BC ∥ #DA.',
      '∠#BAC ≅ ∠#DCA and ∠#BCA ≅ ∠#DAC.',
      '#AC ≅ #AC.',
      '△#ABC ≅ △#CDA.',
      '#AB ≅ #CD.',
    ],
  },
};

// [proof, step, reason, three wrong reasons, why]
const PGRAM_QUESTIONS = [
  [
    ['A', 3, R_SSS, [R_SAS, R_ASA, R_CPCTC], 'Two pairs of sides are given and the diagonal is shared, so three pairs of sides match: SSS. No angle is known yet, so SAS and ASA cannot be used.'],
    ['B', 2, R_SAS, [R_SSS, R_ASA, R_CPCTC], 'Two pairs of sides are given and the vertical angles between them are congruent: side, included angle, side is SAS.'],
    ['C', 5, R_ASA, [R_SSS, R_SAS, R_CPCTC], 'Two pairs of angles are congruent and the shared diagonal lies between them: angle, included side, angle is ASA.'],
  ],
  [
    ['A', 5, R_AIA_CONV, [R_AIA, R_CPCTC, R_DEF], 'The step goes FROM congruent alternate interior angles TO parallel lines, which is the converse. The theorem itself goes the other way (parallel lines to congruent angles).'],
    ['C', 3, R_AIA, [R_AIA_CONV, R_VERT, R_CPCTC], 'The sides are already known to be parallel, so the diagonal is a transversal and the alternate interior angles are congruent. The converse would be used to PROVE lines parallel.'],
    ['B', 4, R_AIA_CONV, [R_AIA, R_CPCTC, R_VERT], 'Congruent alternate interior angles (with the diagonal as transversal) show the lines are parallel — that is the converse, not the theorem itself.'],
  ],
  [
    ['B', 5, R_ONE_PAIR, [R_DEF, R_OPP_ANGLES, R_CPCTC], 'Only ONE pair of sides has been shown, but it is both parallel (step 4) and congruent (step 3), and that is enough. The definition would need both pairs shown parallel.'],
    ['A', 6, R_DEF, [R_ONE_PAIR, R_OPP_ANGLES, R_CPCTC], 'Step 5 shows BOTH pairs of opposite sides are parallel, which is exactly the definition of a parallelogram. No side has been shown both parallel and congruent in one step.'],
    ['C', 2, R_DEF, [R_AIA, R_AIA_CONV, R_ONE_PAIR], 'It is given that the shape is a parallelogram, and by definition both pairs of its opposite sides are parallel.'],
  ],
  [
    ['A', 4, R_CPCTC, [R_REFLEX, R_SSS, R_AIA], 'The triangles were proved congruent in step 3, so their matching angles are congruent: CPCTC. The lines are not yet known to be parallel, so the Alternate Interior Angles Theorem cannot be used.'],
    ['C', 6, R_CPCTC, [R_REFLEX, R_ASA, R_DEF], 'The triangles were proved congruent in step 5, so their matching sides are congruent: CPCTC.'],
    ['B', 1, R_VERT, [R_AIA, R_REFLEX, R_CPCTC], 'The two angles are formed by the crossing diagonals and are opposite each other, so they are vertical angles.'],
    ['A', 2, R_REFLEX, [R_CPCTC, R_SSS, R_DEF], 'A segment is congruent to itself: the diagonal is a side of both triangles. That is the Reflexive Property.'],
  ],
];

function proofText(proof, set) {
  return `${L(proof.intro, set)} Steps: ${proof.steps.map((s, i) => `(${i + 1}) ${L(s, set)}`).join(' ')}`;
}

// ── similarity proofs ──────────────────────────────────────────────────────

const SIM_PROOFS = {
  S1: {
    intro: 'Given: segments #AD and #BC intersect at #E, and #AB ∥ #CD. Prove: △#ABE ~ △#DCE.',
    steps: ['#AB ∥ #CD.', '∠#BAE ≅ ∠#CDE.', '∠#AEB ≅ ∠#DEC.', '△#ABE ~ △#DCE.'],
  },
  S2: {
    intro: 'Given: in △#ABC, point #D is on side #AB, point #E is on side #AC, and #DE ∥ #BC. Prove: △#ADE ~ △#ABC.',
    steps: ['#DE ∥ #BC.', '∠#ADE ≅ ∠#ABC.', '∠#DAE ≅ ∠#BAC.', '△#ADE ~ △#ABC.'],
  },
  S4: {
    intro: 'Given: △#ABC has a right angle at #C, and #CD is the altitude to side #AB, so #D is on #AB. Prove: △#ACD ~ △#ABC.',
    steps: ['∠#ADC and ∠#ACB are right angles.', '∠#ADC ≅ ∠#ACB.', '∠#CAD ≅ ∠#BAC.', '△#ACD ~ △#ABC.'],
  },
};

const SIM_T2 = [
  ['S1', 3, R_VERT, [R_AIA, R_REFLEX, R_CORR], 'The two angles are opposite each other where the segments cross, so they are vertical angles.'],
  ['S2', 3, R_REFLEX, [R_VERT, R_CORR, R_AIA], 'Both triangles contain the very same angle at that vertex, and an angle is congruent to itself: the Reflexive Property.'],
  ['S1', 2, R_AIA, [R_CORR, R_VERT, R_REFLEX], 'The parallel lines are cut by a transversal and the two angles lie between the parallels on opposite sides of it: alternate interior angles.'],
  ['S2', 2, R_CORR, [R_AIA, R_VERT, R_REFLEX], 'The parallel lines are cut by a side of the big triangle and the two angles are in matching positions: corresponding angles. Alternate interior angles would be on opposite sides of the transversal.'],
];

// ── templates ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'parallelogram-proofs',
    skillId: 'geo-parallelogram-proofs',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const set = SETS[int(r, 0, 2)];
        const not = idx % 2 === 1;
        const yes = shuffle(r, PGRAM_ENOUGH);
        const no = shuffle(r, PGRAM_NOT_ENOUGH);
        const correct = L(not ? no[0] : yes[0], set);
        const wrongs = (not ? yes.slice(0, 3) : no.slice(0, 3)).map((s) => L(s, set));
        return {
          prompt: L(`The diagonals of quadrilateral #ABCD are #AC and #BD. Which information is ${not ? 'NOT enough' : 'enough'} to prove that #ABCD is a parallelogram?`, set),
          ...mc(r, correct, wrongs),
          explanation: not
            ? `"${correct}" does not force a parallelogram — a kite or a trapezoid can fit that description. The other three choices are each a proven test for a parallelogram.`
            : `"${correct}" is one of the tests for a parallelogram. Each of the other choices also fits a kite or a trapezoid that is not a parallelogram, so none of them is enough.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const set = SETS[int(r, 0, 2)];
        const [pid, step, reason, wrongs, why] = pick(r, PGRAM_QUESTIONS[idx % 4]);
        return {
          prompt: `${proofText(PGRAM_PROOFS[pid], set)} What reason justifies step ${step}?`,
          ...mc(r, reason, wrongs),
          explanation: why,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 1) {
          const x = int(r, 3, 9), a = int(r, 2, 4), c = a + int(r, 1, 3), b = int(r, 1, 9);
          const d = (c - a) * x - b;
          if (d < 1) again();
          const len = a * x + b;
          if (shape === 0) {
            return {
              prompt: `In quadrilateral ABCD, side AB is parallel to side CD. AB = ${a}x + ${b} and CD = ${c}x − ${d}. For what value of x must ABCD be a parallelogram?`,
              value: x,
              explanation: `One pair of opposite sides that is both parallel and congruent makes a parallelogram, so set ${a}x + ${b} = ${c}x − ${d}. Then ${b + d} = ${K.coefTerm(c - a)} and x = ${x} (each side is ${len}). A common slip is a sign error when moving the −${d}.`,
            };
          }
          const n = int(r, 6, 15);
          return {
            prompt: `The diagonals of quadrilateral PQRS intersect at T. PT = ${a}x + ${b}, RT = ${c}x − ${d}, and QT = ST = ${n}. For what value of x must PQRS be a parallelogram?`,
            value: x,
            explanation: `If the diagonals bisect each other the quadrilateral is a parallelogram. QT = ST already, so PT must equal RT: ${a}x + ${b} = ${c}x − ${d}, giving ${b + d} = ${K.coefTerm(c - a)} and x = ${x}. Setting PT equal to QT is the usual slip — the two diagonals need not be the same length.`,
          };
        }
        if (shape === 2) {
          const x = int(r, 8, 20), a = int(r, 2, 5), c = int(r, 2, 5), b = int(r, 1, 20);
          const d = 180 - (a + c) * x - b;
          if (d < 1 || d > 40) again();
          return {
            prompt: `In parallelogram JKLM, ∠J = (${a}x + ${b})° and ∠K = (${c}x + ${d})°. What is the value of x?`,
            value: x,
            explanation: `J and K are consecutive angles of a parallelogram, so they are supplementary: (${a}x + ${b}) + (${c}x + ${d}) = 180. Then ${a + c}x + ${b + d} = 180 and x = ${x}. Setting the two angles EQUAL is the usual slip — only opposite angles are congruent.`,
          };
        }
        const set = SETS[int(r, 0, 2)];
        const v = int(r, 0, 1);
        const claim = v === 0
          ? 'In quadrilateral #ABCD, #AB ∥ #CD and #BC ≅ #DA, so #ABCD must be a parallelogram.'
          : 'In quadrilateral #ABCD, the diagonals #AC and #BD are congruent, so #ABCD must be a parallelogram.';
        const wrongs = v === 0
          ? ['The student is right: one pair of parallel sides and one pair of congruent sides is always enough',
            'The student is right, because the diagonals must then bisect each other',
            'The student is wrong: opposite sides of a parallelogram are never congruent']
          : ['The student is right: congruent diagonals always make a parallelogram',
            'The student is right, because congruent diagonals must bisect each other',
            'The student is wrong: the diagonals of a parallelogram are never congruent'];
        return {
          prompt: L(`A student writes: "${claim}" Which statement is true?`, set),
          ...mc(r, L('The student is wrong: #ABCD could be an isosceles trapezoid', set), wrongs.map((w) => L(w, set))),
          explanation: v === 0
            ? 'An isosceles trapezoid has one pair of parallel sides and its OTHER pair of sides congruent, yet it is not a parallelogram. The same pair of sides must be both parallel and congruent.'
            : 'An isosceles trapezoid has congruent diagonals but is not a parallelogram. The test is that the diagonals BISECT each other, not that they are the same length.',
        };
      }) },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'arc-length',
    skillId: 'geo-arc-length',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const [t, step] = pick(r, ARC_EASY);
        const rad = step * int(r, 1, 3), u = unit(r);
        const ans = piStr(t * rad, 180);
        if (idx % 2 === 0) {
          return {
            prompt: `A circle has a radius of ${rad} ${u}. An arc of the circle has a central angle of ${t}°. What is the length of the arc, in ${u}, in terms of π?`,
            ...mc(r, ans, [piStr(t * rad * rad, 360), piStr(t * rad, 360), piStr(2 * rad)]),
            explanation: `Arc length = (${t}/360) · 2π(${rad}) = (${K.frac(t, 360)}) · ${2 * rad}π = ${ans}. ${piStr(t * rad * rad, 360)} is the sector's AREA, and ${piStr(2 * rad)} is the whole circumference.`,
          };
        }
        return {
          prompt: `A circle has a diameter of ${2 * rad} ${u}. An arc of the circle has a central angle of ${t}°. What is the length of the arc, in ${u}, in terms of π?`,
          ...mc(r, ans, [piStr(t * 2 * rad, 180), piStr(t * rad * rad, 360), piStr(2 * rad)]),
          explanation: `The circumference is πd = ${2 * rad}π, and the arc is ${K.frac(t, 360)} of it: ${ans}. Using the diameter ${2 * rad} as the radius doubles the answer to ${piStr(t * 2 * rad, 180)}.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const [t, step] = pick(r, ARC_EASY.concat(ARC_HARD));
          const rad = step * int(r, 1, 3), u = unit(r);
          const v = 3.14 * t * rad / 180;
          if (isWhole(v)) again();
          return {
            prompt: `A circle has a radius of ${rad} ${u}. Use 3.14 for π. What is the length of an arc with a central angle of ${t}°, in ${u}? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `Arc length = (${t}/360) · 2 · 3.14 · ${rad} = ${K.frac(t, 360)} of ${dec(6.28 * rad)} = ${dec(v)}. Forgetting the 2 (using πr) gives half of this.`,
          };
        }
        if (shape === 1) {
          const [t, step] = pick(r, ARC_HARD);
          const rad = step * int(r, 1, 2), u = unit(r);
          const ans = piStr(t * rad, 180);
          return {
            prompt: `An arc of a circle with a radius of ${rad} ${u} is intercepted by a central angle of ${t}°. In terms of π, how long is the arc, in ${u}?`,
            ...mc(r, ans, [piStr(t * rad * rad, 360), piStr(t * rad, 360), piStr(2 * rad)]),
            explanation: `Arc length = (${t}/360) · 2π(${rad}) = ${K.frac(t, 360)} · ${2 * rad}π = ${ans}. The choice ${piStr(t * rad * rad, 360)} uses the sector-area formula (πr²) instead.`,
          };
        }
        if (shape === 2) {
          const n = pick(r, [5, 10, 15, 20, 25, 40, 45]), len = pick(r, [6, 9, 12, 15, 18]);
          if ((n * len) % 30 !== 0) again();
          const t = 6 * n;
          const ans = piStr(t * len, 180);
          return {
            prompt: `The minute hand of a clock is ${len} cm long. In terms of π, how far does the tip of the minute hand travel in ${n} minutes, in cm?`,
            ...mc(r, ans, [piStr(t * len * len, 360), piStr(t * len, 360), piStr(2 * len)]),
            explanation: `In ${n} minutes the hand turns ${n}/60 of a full turn, which is ${t}°. The tip moves (${t}/360) · 2π(${len}) = ${ans} cm. ${piStr(2 * len)} is a full hour's travel.`,
          };
        }
        const [t, step] = pick(r, ARC_EASY.concat(ARC_HARD));
        const rad = step * int(r, 1, 3) * 5;
        const v = 3.14 * t * rad / 180;
        if (isWhole(v)) again();
        return {
          prompt: `A circular track has a diameter of ${2 * rad} m. Use 3.14 for π. A runner covers an arc of the track with a central angle of ${t}°. How far does the runner go, in m? Give your answer as a decimal.`,
          value: dec(v),
          explanation: `The circumference is 3.14 · ${2 * rad} = ${dec(6.28 * rad)} m, and the runner covers ${K.frac(t, 360)} of it: ${dec(v)} m. Treating ${2 * rad} as the radius doubles the answer.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        const [t, step] = pick(r, ARC_EASY.concat(ARC_HARD));
        const rad = step * int(r, 1, 3), u = unit(r);
        const a = t * rad / 180;
        if (shape === 0) {
          return {
            prompt: `An arc of a circle with a radius of ${rad} ${u} has a length of ${piStr(a)} ${u}. What is the measure of the arc's central angle, in degrees?`,
            value: t,
            explanation: `The circumference is 2π(${rad}) = ${2 * rad}π, so the arc is ${piStr(a)} ÷ ${2 * rad}π = ${K.frac(a, 2 * rad)} of the circle, and ${K.frac(a, 2 * rad)} of 360° is ${t}°. Dividing by πr² instead of 2πr is the usual slip.`,
          };
        }
        if (shape === 1) {
          return {
            prompt: `An arc with a central angle of ${t}° has a length of ${piStr(a)} ${u}. What is the radius of the circle, in ${u}?`,
            value: rad,
            explanation: `The arc is ${K.frac(t, 360)} of the circumference, so the circumference is ${piStr(a)} ÷ (${K.frac(t, 360)}) = ${2 * rad}π. Since 2πr = ${2 * rad}π, r = ${rad}. Stopping at ${2 * rad} gives the diameter, not the radius.`,
          };
        }
        if (shape === 2) {
          const ans = `${piStr(a)} + ${2 * rad}`;
          return {
            prompt: `A sector of a circle has a radius of ${rad} ${u} and a central angle of ${t}°. What is the perimeter of the sector (the arc plus the two radii), in ${u}?`,
            ...mc(r, ans, [piStr(a), `${piStr(a)} + ${rad}`, `${piStr(t * rad * rad, 360)} + ${2 * rad}`]),
            explanation: `The arc is (${t}/360) · 2π(${rad}) = ${piStr(a)}, and the two straight edges add ${rad} + ${rad} = ${2 * rad}: ${ans}. Giving only ${piStr(a)} leaves out the two radii.`,
          };
        }
        return {
          prompt: `An arc of a circle with a diameter of ${2 * rad} ${u} has a length of ${piStr(a)} ${u}. What is the measure of the arc's central angle, in degrees?`,
          value: t,
          explanation: `The circumference is πd = ${2 * rad}π, so the arc is ${piStr(a)} ÷ ${2 * rad}π = ${K.frac(a, 2 * rad)} of the circle, and ${K.frac(a, 2 * rad)} of 360° is ${t}°. Using ${2 * rad} as the radius would halve the angle.`,
        };
      }) },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'sector-area',
    skillId: 'geo-sector-area',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const [t, step] = pick(r, SEC_EASY);
        const rad = step * int(r, 1, 2), u = unit(r);
        const ans = piStr(t * rad * rad, 360);
        if (idx % 2 === 0) {
          return {
            prompt: `A circle has a radius of ${rad} ${u}. What is the area of a sector with a central angle of ${t}°, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(t * rad, 180), piStr(rad * rad), piStr(t * rad, 360)]),
            explanation: `Sector area = (${t}/360) · π(${rad})² = ${K.frac(t, 360)} · ${rad * rad}π = ${ans}. ${piStr(t * rad, 180)} comes from the arc-LENGTH formula, and ${piStr(t * rad, 360)} from forgetting to square the radius.`,
          };
        }
        return {
          prompt: `A circle has a diameter of ${2 * rad} ${u}. What is the area of a sector with a central angle of ${t}°, in ${u}², in terms of π?`,
          ...mc(r, ans, [piStr(t * 4 * rad * rad, 360), piStr(t * rad, 180), piStr(rad * rad)]),
          explanation: `The radius is ${rad}, so the sector is (${t}/360) · π(${rad})² = ${K.frac(t, 360)} · ${rad * rad}π = ${ans}. Squaring the diameter ${2 * rad} instead gives ${piStr(t * 4 * rad * rad, 360)}, four times too big.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 2) {
          const [t, step] = pick(r, SEC_EASY.concat(SEC_HARD));
          const rad = step * int(r, 1, 3);
          const v = 3.14 * t * rad * rad / 360;
          if (isWhole(v)) again();
          if (shape === 0) {
            const u = unit(r);
            return {
              prompt: `A circle has a radius of ${rad} ${u}. Use 3.14 for π. What is the area of a sector with a central angle of ${t}°, in ${u}²? Give your answer as a decimal.`,
              value: dec(v),
              explanation: `Sector area = (${t}/360) · 3.14 · ${rad}² = ${K.frac(t, 360)} of ${dec(3.14 * rad * rad)} = ${dec(v)}. Using 2 · 3.14 · ${rad} (the circumference) instead of 3.14 · ${rad}² is the usual slip.`,
            };
          }
          return {
            prompt: `A lawn sprinkler sprays water ${rad} m and turns back and forth through an angle of ${t}°. Use 3.14 for π. What area of lawn does it water, in m²? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `The watered region is a sector with radius ${rad} m: (${t}/360) · 3.14 · ${rad}² = ${K.frac(t, 360)} of ${dec(3.14 * rad * rad)} = ${dec(v)} m². Forgetting to square ${rad} is the usual slip.`,
          };
        }
        if (shape === 1) {
          const rad = pick(r, [4, 6, 8, 10, 12]), n = pick(r, [6, 8, 10, 12]);
          if ((rad * rad) % n !== 0) again();
          const ans = piStr(rad * rad, n);
          return {
            prompt: `A circular pizza has a diameter of ${2 * rad} inches and is cut into ${n} equal slices. What is the area of the top of one slice, in square inches, in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad * rad, n), piStr(2 * rad, n), piStr(rad * rad)]),
            explanation: `The radius is ${rad} in., so the whole pizza is π(${rad})² = ${rad * rad}π and one of ${n} equal slices is ${rad * rad}π ÷ ${n} = ${ans}. Squaring the diameter gives ${piStr(4 * rad * rad, n)}; ${piStr(2 * rad, n)} is the length of the slice's crust.`,
          };
        }
        const [t, step] = pick(r, SEC_HARD);
        const rad = step * int(r, 1, 2), u = unit(r);
        const ans = piStr(t * rad * rad, 360);
        return {
          prompt: `A sector of a circle with a radius of ${rad} ${u} has a central angle of ${t}°. In terms of π, what is its area, in ${u}²?`,
          ...mc(r, ans, [piStr(t * rad, 180), piStr(rad * rad), piStr(t * rad * rad, 180)]),
          explanation: `Sector area = (${t}/360) · π(${rad})² = ${K.frac(t, 360)} · ${rad * rad}π = ${ans}. ${piStr(t * rad, 180)} is the arc length, and ${piStr(t * rad * rad, 180)} divides by 180 instead of 360.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        const [t, step] = pick(r, SEC_EASY.concat(SEC_HARD));
        const rad = step * int(r, 1, 2), u = unit(r);
        const a = t * rad * rad / 360;
        if (shape === 0) {
          return {
            prompt: `A sector of a circle with a radius of ${rad} ${u} has an area of ${piStr(a)} ${u}². What is the measure of the sector's central angle, in degrees?`,
            value: t,
            explanation: `The whole circle is π(${rad})² = ${rad * rad}π, so the sector is ${piStr(a)} ÷ ${rad * rad}π = ${K.frac(a, rad * rad)} of it, and ${K.frac(a, rad * rad)} of 360° is ${t}°. Dividing by the circumference ${2 * rad}π instead is the usual slip.`,
          };
        }
        if (shape === 1) {
          return {
            prompt: `A sector with a central angle of ${t}° has an area of ${piStr(a)} ${u}². What is the radius of the circle, in ${u}?`,
            value: rad,
            explanation: `The sector is ${K.frac(t, 360)} of the circle, so the whole circle is ${piStr(a)} ÷ (${K.frac(t, 360)}) = ${rad * rad}π. Then r² = ${rad * rad} and r = ${rad}. Forgetting the square root gives ${rad * rad}.`,
          };
        }
        if (shape === 2) {
          const ans = piStr((360 - t) * rad * rad, 360);
          return {
            prompt: `A circle has a radius of ${rad} ${u}. A sector with a central angle of ${t}° is cut out and removed. What is the area of the part that remains, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(a), piStr(rad * rad), piStr((360 - t) * rad, 180)]),
            explanation: `What remains is a sector of ${360 - t}°: (${360 - t}/360) · π(${rad})² = ${ans} (or ${rad * rad}π − ${piStr(a)}). ${piStr(a)} is the piece that was removed, not the piece left.`,
          };
        }
        return {
          prompt: `A sector of a circle with a diameter of ${2 * rad} ${u} has an area of ${piStr(a)} ${u}². What is the measure of the sector's central angle, in degrees?`,
          value: t,
          explanation: `The radius is ${rad}, so the whole circle is ${rad * rad}π. The sector is ${piStr(a)} ÷ ${rad * rad}π = ${K.frac(a, rad * rad)} of it, and ${K.frac(a, rad * rad)} of 360° is ${t}°. Squaring the diameter makes the angle four times too small.`,
        };
      }) },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'inscribed-angles',
    skillId: 'geo-inscribed-angles',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4;
        const a = int(r, 21, 84);
        if (shape === 0) {
          return {
            prompt: `An inscribed angle of a circle intercepts an arc that measures ${2 * a}°. What is the measure of the inscribed angle, in degrees?`,
            value: a,
            explanation: `An inscribed angle is HALF its intercepted arc: ${2 * a} ÷ 2 = ${a}°. Answering ${2 * a}° treats it like a central angle.`,
          };
        }
        if (shape === 1) {
          return {
            prompt: `An inscribed angle of a circle measures ${a}°. What is the measure of the arc it intercepts, in degrees?`,
            value: 2 * a,
            explanation: `The intercepted arc is TWICE the inscribed angle: 2 · ${a} = ${2 * a}°. Halving instead of doubling is the usual slip.`,
          };
        }
        if (shape === 2) {
          return {
            prompt: `Triangle ABC is inscribed in a circle, and side AB is a diameter of the circle. Angle A measures ${a}°. What is the measure of angle B, in degrees?`,
            value: 90 - a,
            explanation: `Angle C is inscribed in a semicircle, so it is 90°. That leaves 90° for the other two angles: angle B = 90 − ${a} = ${90 - a}°. Subtracting from 180 forgets the right angle at C.`,
          };
        }
        return {
          prompt: `Points A, B and C are on a circle with centre O. Inscribed angle ACB measures ${a}° and intercepts arc AB. What is the measure of central angle AOB, in degrees?`,
          value: 2 * a,
          explanation: `Arc AB is twice the inscribed angle, 2 · ${a} = ${2 * a}°, and a central angle equals its arc, so angle AOB = ${2 * a}°. Saying ${a}° forgets that the inscribed angle is only half the arc.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const a = int(r, 62, 118), b = int(r, 62, 118);
          if (a === b || a + b === 180) again();
          const askC = int(r, 0, 1) === 0;
          return {
            prompt: `Quadrilateral ABCD is inscribed in a circle. Angle A measures ${a}° and angle B measures ${b}°. What is the measure of angle ${askC ? 'C' : 'D'}, in degrees?`,
            value: askC ? 180 - a : 180 - b,
            explanation: askC
              ? `Opposite angles of an inscribed quadrilateral are supplementary, and C is opposite A: 180 − ${a} = ${180 - a}°. Using angle B (${180 - b}°) pairs the wrong angles.`
              : `Opposite angles of an inscribed quadrilateral are supplementary, and D is opposite B: 180 − ${b} = ${180 - b}°. Using angle A (${180 - a}°) pairs the wrong angles.`,
          };
        }
        if (shape === 1) {
          const x = int(r, 6, 15), a = int(r, 2, 4), b = int(r, 1, 12), e = int(r, 1, 3);
          const c = 2 * a + e, d = e * x - 2 * b;
          if (d < 1 || a * x + b >= 90) again();
          return {
            prompt: `An inscribed angle measures (${a}x + ${b})° and the arc it intercepts measures (${c}x − ${d})°. What is the value of x?`,
            value: x,
            explanation: `The arc is twice the inscribed angle: 2(${a}x + ${b}) = ${c}x − ${d}, so ${2 * a}x + ${2 * b} = ${c}x − ${d} and x = ${x}. Setting the angle EQUAL to the arc is the usual slip.`,
          };
        }
        if (shape === 2) {
          const x = int(r, 5, 14), c = int(r, 2, 4), a = c + int(r, 1, 3), d = int(r, 2, 20);
          const b = (a - c) * x - d;
          if (b < 1 || c * x + d >= 90) again();
          return {
            prompt: `Inscribed angles ACB and ADB intercept the same arc AB of a circle. Angle ACB measures (${a}x − ${b})° and angle ADB measures (${c}x + ${d})°. What is the value of x?`,
            value: x,
            explanation: `Inscribed angles that intercept the same arc are congruent: ${a}x − ${b} = ${c}x + ${d}, so ${K.coefTerm(a - c)} = ${b + d} and x = ${x}. Adding the two angles to 180 is the usual slip — they are equal, not supplementary.`,
          };
        }
        const x = int(r, 5, 12), a = int(r, 2, 4), c = int(r, 2, 4), b = int(r, 1, 15);
        const d = 90 - (a + c) * x - b;
        if (d < 1 || d > 30) again();
        return {
          prompt: `Triangle PQR is inscribed in a circle, and side PQ is a diameter of the circle. Angle P measures (${a}x + ${b})° and angle Q measures (${c}x + ${d})°. What is the value of x?`,
          value: x,
          explanation: `Angle R is inscribed in a semicircle, so it is 90° and angles P and Q add to 90: (${a}x + ${b}) + (${c}x + ${d}) = 90. Then ${a + c}x + ${b + d} = 90 and x = ${x}. Setting the sum to 180 forgets the right angle at R.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const x = int(r, 8, 20), a = int(r, 2, 6), c = int(r, 2, 6), b = int(r, 1, 15);
          const d = (a + c) * x + b - 180;
          const A = a * x + b;
          if (d < 1 || d > 40 || A >= 150 || A <= 30) again();
          return {
            prompt: `Quadrilateral ABCD is inscribed in a circle. Angle A measures (${a}x + ${b})° and angle C measures (${c}x − ${d})°. What is the measure of angle A, in degrees?`,
            value: A,
            explanation: `A and C are opposite angles of an inscribed quadrilateral, so they add to 180: (${a}x + ${b}) + (${c}x − ${d}) = 180 gives x = ${x}. Then angle A = ${a}(${x}) + ${b} = ${A}°. Stopping at x = ${x}, or setting the angles equal, are the usual slips.`,
          };
        }
        if (shape === 1) {
          const p = 2 * int(r, 40, 75), q = 2 * int(r, 40, 75);
          const rest = 360 - p - q;
          if (rest < 40 || p === q) again();
          return {
            prompt: `Triangle ABC is inscribed in a circle. Its vertices divide the circle into three arcs: arc AB measures ${p}°, arc BC measures ${q}°, and arc CA is the rest of the circle. What is the measure of angle ABC, in degrees?`,
            value: rest / 2,
            explanation: `Angle ABC intercepts arc CA, the arc that does not touch B: 360 − ${p} − ${q} = ${rest}°. The inscribed angle is half of it, ${rest / 2}°. Halving arc AB or arc BC uses an arc the angle does not intercept.`,
          };
        }
        if (shape === 2) {
          const a = int(r, 26, 84);
          return {
            prompt: `Points A and B are on a circle with centre O, and central angle AOB measures ${2 * a}°. Point D is on the minor arc AB (the shorter arc between A and B). What is the measure of inscribed angle ADB, in degrees?`,
            value: 180 - a,
            explanation: `From D, the angle intercepts the MAJOR arc AB, which is 360 − ${2 * a} = ${360 - 2 * a}°. Half of that is ${180 - a}°. The answer ${a}° would be right only for a point on the major arc.`,
          };
        }
        const [p, q, h0] = pick(r, [[6, 8, 10], [10, 24, 26], [16, 30, 34], [12, 16, 20], [18, 24, 30], [14, 48, 50]]);
        const sw = int(r, 0, 1);
        return {
          prompt: `Triangle ABC is inscribed in a circle, and side AB is a diameter of the circle. AC = ${sw ? q : p} cm and BC = ${sw ? p : q} cm. What is the radius of the circle, in cm?`,
          value: h0 / 2,
          explanation: `Angle C is inscribed in a semicircle, so it is 90° and AB is the hypotenuse: AB² = ${p}² + ${q}² = ${h0 * h0}, so AB = ${h0} cm. The radius is half the diameter, ${h0 / 2} cm. Stopping at ${h0} gives the diameter.`,
        };
      }) },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'circle-theorems',
    skillId: 'geo-circle-theorems',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0 || shape === 3) {
          const [rad, t, h] = triple(r);
          if (shape === 0) {
            return {
              prompt: `Line AB is tangent to circle O at point B. The radius OB is ${rad} cm and AB = ${t} cm. What is the length of OA, in cm?`,
              value: h,
              explanation: `A tangent is perpendicular to the radius at the point of tangency, so triangle OBA has a right angle at B and OA is the hypotenuse: OA² = ${rad}² + ${t}² = ${h * h}, so OA = ${h} cm. Adding ${rad} + ${t} is the usual slip.`,
            };
          }
          return {
            prompt: `Line AB is tangent to circle O at point B. The radius OB is ${rad} cm and OA = ${h} cm. What is the length of AB, in cm?`,
            value: t,
            explanation: `The tangent is perpendicular to radius OB, so the right angle is at B and OA = ${h} is the hypotenuse: AB² = ${h}² − ${rad}² = ${t * t}, so AB = ${t} cm. Adding the squares (treating AB as the hypotenuse) is the usual slip.`,
          };
        }
        if (shape === 1) {
          const x = int(r, 3, 9), a = int(r, 2, 5), b = int(r, 1, 9);
          return {
            prompt: `From point P outside a circle, segments PA and PB are tangent to the circle at A and B. PA = ${a}x + ${b} and PB = ${a * x + b}. What is the value of x?`,
            value: x,
            explanation: `Two tangent segments from the same outside point are congruent, so ${a}x + ${b} = ${a * x + b}. Then ${a}x = ${a * x} and x = ${x}.`,
          };
        }
        const a = int(r, 41, 159);
        return {
          prompt: `In circle O, central angle AOB measures ${a}°. What is the measure of major arc AB (the longer arc from A to B), in degrees?`,
          value: 360 - a,
          explanation: `A central angle equals its intercepted arc, so minor arc AB is ${a}°. The major arc is the rest of the circle: 360 − ${a} = ${360 - a}°. Subtracting from 180 is the usual slip.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const [d, half, rad] = triple(r);
          return {
            prompt: `A circle has a radius of ${rad} cm. A chord of the circle is ${d} cm from the centre. How long is the chord, in cm?`,
            value: 2 * half,
            explanation: `The perpendicular from the centre bisects the chord, making a right triangle with hypotenuse ${rad} and leg ${d}. Half the chord is √(${rad}² − ${d}²) = ${half}, so the chord is ${2 * half} cm. Forgetting to double gives ${half}.`,
          };
        }
        if (shape === 1) {
          const [d, half, rad] = triple(r);
          return {
            prompt: `A circle has a radius of ${rad} cm. A chord of the circle is ${2 * half} cm long. How far is the chord from the centre of the circle, in cm?`,
            value: d,
            explanation: `The perpendicular from the centre bisects the chord, so half the chord is ${half} cm. With the radius as hypotenuse, the distance is √(${rad}² − ${half}²) = ${d} cm. Using the whole chord ${2 * half} as a leg is the usual slip.`,
          };
        }
        if (shape === 2) {
          const c = int(r, 2, 9), d = int(r, 2, 12), a = int(r, 2, 12);
          if ((c * d) % a !== 0 || a === c || a === d || c === d) again();
          const b = c * d / a;
          if (b === a || b === c || b > 24) again();
          return {
            prompt: `Chords AB and CD of a circle intersect at point E inside the circle. AE = ${a}, EB = ${b} and CE = ${c}. What is the length of ED?`,
            value: d,
            explanation: `When two chords intersect, the products of their parts are equal: AE · EB = CE · ED, so ${a} · ${b} = ${c} · ED and ED = ${a * b} ÷ ${c} = ${d}. Setting up AE/EB = CE/ED as a proportion is the usual slip.`,
          };
        }
        const x = int(r, 3, 9), a = int(r, 2, 4), c = a + int(r, 1, 3), b = int(r, 1, 9);
        const d = (c - a) * x - b;
        if (d < 1) again();
        return {
          prompt: `From point P outside a circle, segments PA and PB are tangent to the circle at A and B. PA = ${a}x + ${b} and PB = ${c}x − ${d}. What is the length of PA?`,
          value: a * x + b,
          explanation: `Tangent segments from the same point are congruent: ${a}x + ${b} = ${c}x − ${d}, so x = ${x}. Then PA = ${a}(${x}) + ${b} = ${a * x + b}. Stopping at x = ${x} answers a different question.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const [rad, t, h] = triple(r);
          return {
            prompt: `Line AB is tangent to circle O at point B, with AB = ${t} cm. Segment OA crosses the circle at point C, and AC = ${h - rad} cm. What is the radius of the circle, in cm?`,
            value: rad,
            explanation: `Let the radius be r. Then OB = r, OA = r + ${h - rad}, and the tangent makes a right angle at B: r² + ${t}² = (r + ${h - rad})². Expanding, ${t * t} = ${2 * (h - rad)}r + ${(h - rad) ** 2}, so r = ${rad} cm. Treating AC as the whole of OA is the usual slip.`,
          };
        }
        if (shape === 1) {
          const c = int(r, 2, 9), d = int(r, 2, 12), a = int(r, 2, 12);
          if ((c * d) % a !== 0 || a === c || a === d || c === d) again();
          const b = c * d / a;
          if (b === a || b === c || b > 24) again();
          return {
            prompt: `Chords AB and CD of a circle intersect at point E inside the circle. AE = ${a}, EB = ${b} and CE = ${c}. What is the length of the whole chord CD?`,
            value: c + d,
            explanation: `AE · EB = CE · ED, so ${a} · ${b} = ${c} · ED and ED = ${d}. The whole chord is CE + ED = ${c} + ${d} = ${c + d}. Stopping at ED = ${d} is the usual slip.`,
          };
        }
        if (shape === 2) {
          const [d, half, rad] = triple(r);
          return {
            prompt: `A chord of a circle is ${2 * half} cm long and is ${d} cm from the centre of the circle. What is the diameter of the circle, in cm?`,
            value: 2 * rad,
            explanation: `The perpendicular from the centre bisects the chord, so the right triangle has legs ${half} and ${d}: radius = √(${half}² + ${d}²) = ${rad} cm, and the diameter is ${2 * rad} cm. Using the full chord ${2 * half} as a leg, or stopping at the radius, are the usual slips.`,
          };
        }
        const a = int(r, 3, 12), b = int(r, 3, 12), c = int(r, 3, 12);
        if (a === b || b === c || a === c) again();
        return {
          prompt: `A circle is inscribed in triangle ABC. It touches side AB at P, side BC at Q and side CA at R. AP = ${a}, BQ = ${b} and CR = ${c}. What is the perimeter of triangle ABC?`,
          value: 2 * (a + b + c),
          explanation: `Tangent segments from the same vertex are congruent, so AR = AP = ${a}, BP = BQ = ${b} and CQ = CR = ${c}. The perimeter is 2(${a} + ${b} + ${c}) = ${2 * (a + b + c)}. Adding only ${a} + ${b} + ${c} counts half of each side.`,
        };
      }) },
    ],
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'similar-triangle-theorems',
    skillId: 'geo-similar-triangle-theorems',
    tiers: (() => {
      const YES_AA = 'Yes, by AA Similarity';
      const YES_SAS = 'Yes, by SAS Similarity';
      const YES_SSS = 'Yes, by SSS Similarity';
      const NO = 'No, they are not similar';
      const OPTS = [YES_AA, YES_SAS, YES_SSS, NO];

      const aa = (r, similar) => {
        const a = 5 * int(r, 7, 15), b = 5 * int(r, 7, 15);
        const c = 180 - a - b;
        if (c < 25 || a === b || b === c || a === c) again();
        if (similar) {
          return {
            prompt: `In △ABC, ∠A = ${a}° and ∠B = ${b}°. In △DEF, ∠D = ${a}° and ∠F = ${c}°. Are the two triangles similar?`,
            ...mcFixed(r, OPTS, YES_AA),
            explanation: `The third angle of △ABC is 180 − ${a} − ${b} = ${c}°, so both triangles have angles of ${a}° and ${c}°. Two pairs of congruent angles is AA. Saying "no" because ${b}° and ${c}° differ forgets to find the third angle.`,
          };
        }
        const e = b + pick(r, [-10, 10, 15, -15]);
        if (e === c || e === a || e < 20 || a + e > 155) again();
        return {
          prompt: `In △ABC, ∠A = ${a}° and ∠B = ${b}°. In △DEF, ∠D = ${a}° and ∠E = ${e}°. Are the two triangles similar?`,
          ...mcFixed(r, OPTS, NO),
          explanation: `△ABC has angles ${a}°, ${b}° and ${c}°; △DEF has angles ${a}°, ${e}° and ${180 - a - e}°. Only one pair of angles matches, so the triangles are not similar. One shared angle is never enough for AA.`,
        };
      };

      const sss = (r, scramble, similar) => {
        const base = pick(r, [[2, 3, 4], [3, 4, 5], [4, 5, 6], [3, 5, 6], [4, 6, 7], [5, 6, 8]]);
        const q = int(r, 1, 3), p = q + int(r, 1, 3);
        if (K.gcd(p, q) !== 1 && q !== 1) again();
        const one = base.map((s) => s * q);
        let two = base.map((s) => s * p);
        if (!similar) two = [two[0], two[1], two[2] + pick(r, [1, 2])];
        if (scramble) two = [two[2], two[0], two[1]];
        return {
          prompt: `△ABC has side lengths of ${one[0]}, ${one[1]} and ${one[2]}. △DEF has side lengths of ${two[0]}, ${two[1]} and ${two[2]}. Are the two triangles similar?`,
          ...mcFixed(r, OPTS, similar ? YES_SSS : NO),
          explanation: similar
            ? `Match shortest to shortest and so on: ${base.map((s) => `${s * p}/${s * q}`).join(', ')} all equal ${K.frac(p, q)}. Three pairs of proportional sides is SSS Similarity. No angles are given, so AA and SAS cannot be the reason.`
            : `Match shortest to shortest: ${base[0] * p}/${base[0] * q} and ${base[1] * p}/${base[1] * q} equal ${K.frac(p, q)}, but the longest sides give ${two[scramble ? 0 : 2]}/${one[2]}, which is different. All three ratios must match, so the triangles are not similar.`,
        };
      };

      const sas = (r, similar) => {
        const m = int(r, 2, 4), n = m + int(r, 1, 3);
        const q = int(r, 2, 3), p = q + int(r, 1, 2);
        const ang = 5 * int(r, 6, 22);
        const df = similar ? p * n : p * n + pick(r, [2, 3]);
        return {
          prompt: `In △ABC, AB = ${q * m}, AC = ${q * n} and ∠A = ${ang}°. In △DEF, DE = ${p * m}, DF = ${df} and ∠D = ${ang}°. Are the two triangles similar?`,
          ...mcFixed(r, OPTS, similar ? YES_SAS : NO),
          explanation: similar
            ? `DE/AB = ${p * m}/${q * m} = ${K.frac(p, q)} and DF/AC = ${df}/${q * n} = ${K.frac(p, q)}, and the angles BETWEEN those sides are both ${ang}°. Two proportional pairs of sides with the included angle congruent is SAS Similarity.`
            : `DE/AB = ${p * m}/${q * m} = ${K.frac(p, q)} but DF/AC = ${df}/${q * n} = ${K.frac(df, q * n)}. The sides around the ${ang}° angles are not proportional, so the triangles are not similar. A matching angle alone is not enough.`,
        };
      };

      const missing = (r, scramble) => {
        const m = int(r, 2, 5), n = int(r, 2, 6);
        const q = int(r, 2, 4), p = int(r, 2, 6);
        if (m === n || p === q || K.gcd(p, q) !== 1) again();
        const t1 = 'ABC';
        const t2 = scramble ? pick(r, ['EFD', 'FDE', 'EDF', 'FED']) : 'DEF';
        const [P1, P2] = shuffle(r, [[0, 1], [1, 2], [0, 2]]);
        const seg = (t, P) => t[P[0]] + t[P[1]];
        return {
          prompt: `△${t1} ~ △${t2}. ${seg(t1, P1)} = ${q * m}, ${seg(t1, P2)} = ${q * n} and ${seg(t2, P1)} = ${p * m}. What is the length of ${seg(t2, P2)}?`,
          value: p * n,
          explanation: `The order of the letters shows ${seg(t1, P1)} matches ${seg(t2, P1)} and ${seg(t1, P2)} matches ${seg(t2, P2)}. The scale factor is ${p * m}/${q * m} = ${K.frac(p, q)}, so ${seg(t2, P2)} = ${q * n} · ${K.frac(p, q)} = ${p * n}. Pairing sides that do not correspond is the usual slip.`,
        };
      };

      return [
        { difficulty: 2, gen: g((r, idx) => [
          () => aa(r, true), () => sss(r, false, true), () => sas(r, true), () => aa(r, false),
        ][idx % 4]()) },
        { difficulty: 3, gen: g((r, idx) => [
          () => missing(r, false), () => sss(r, true, int(r, 0, 1) === 0), () => missing(r, true), () => sas(r, false),
        ][idx % 4]()) },
        { difficulty: 4, gen: g((r, idx) => {
          const shape = idx % 4;
          const m = int(r, 2, 5), n = int(r, 2, 6);
          if (m === n || K.gcd(m, n) !== 1) again();
          if (shape === 0 || shape === 3) {
            const q = int(r, 1, 4), p = int(r, 1, 4);
            if (p === q) again();
            if (shape === 0) {
              return {
                prompt: `In △ABC, point D is on side AB and point E is on side AC, with DE parallel to BC. AD = ${q * m}, DB = ${q * n} and AE = ${p * m}. What is the length of EC?`,
                value: p * n,
                explanation: `A line parallel to one side of a triangle divides the other two sides proportionally: AD/DB = AE/EC, so ${q * m}/${q * n} = ${p * m}/EC and EC = ${p * n}. Adding the same amount to each part instead of scaling is the usual slip.`,
              };
            }
            return {
              prompt: `In △ABC, point D is on side AB and point E is on side AC, with DE parallel to BC. AD = ${q * m}, DB = ${q * n} and AE = ${p * m}. What is the length of the whole side AC?`,
              value: p * (m + n),
              explanation: `AD/DB = AE/EC gives ${q * m}/${q * n} = ${p * m}/EC, so EC = ${p * n}. The whole side is AC = AE + EC = ${p * m} + ${p * n} = ${p * (m + n)}. Stopping at EC = ${p * n} is the usual slip.`,
            };
          }
          if (shape === 1) {
            const k = int(r, 1, 3), t = int(r, 2, 5);
            if (t === k) again();
            return {
              prompt: `In △ABC, point D is on side AB and point E is on side AC, with DE parallel to BC. AD = ${k * m}, DB = ${k * n} and BC = ${t * (m + n)}. What is the length of DE?`,
              value: t * m,
              explanation: `△ADE ~ △ABC, and DE matches BC while AD matches the WHOLE side AB = ${k * m} + ${k * n} = ${k * (m + n)}. So DE/${t * (m + n)} = ${k * m}/${k * (m + n)} and DE = ${t * m}. Using AD/DB = ${k * m}/${k * n} for this ratio is the usual slip.`,
            };
          }
          const q = int(r, 1, 3), p = q + int(r, 1, 2);
          const par = int(r, 0, 1) === 0;
          const ec = par ? p * n : p * n + pick(r, [1, 2]);
          const ad = q * m, db = q * n, ae = p * m;
          if (ad * ae === db * ec) again();   // the "upside-down" choice must be false
          const YES = 'Yes, because AD/DB = AE/EC';
          const NOPE = 'No, because AD/DB ≠ AE/EC';
          return {
            prompt: `In △ABC, point D is on side AB and point E is on side AC. AD = ${ad}, DB = ${db}, AE = ${ae} and EC = ${ec}. Must DE be parallel to BC?`,
            ...mcFixed(r, [YES, NOPE, 'Yes, because AD/DB = EC/AE', 'It cannot be determined from these lengths'], par ? YES : NOPE),
            explanation: par
              ? `AD/DB = ${ad}/${db} = ${K.frac(ad, db)} and AE/EC = ${ae}/${ec} = ${K.frac(ae, ec)}. The sides are divided proportionally, so by the converse of the Triangle Proportionality Theorem DE ∥ BC.`
              : `AD/DB = ${ad}/${db} = ${K.frac(ad, db)} but AE/EC = ${ae}/${ec} = ${K.frac(ae, ec)}. The sides are not divided proportionally, so DE cannot be parallel to BC. The lengths ARE enough to decide.`,
          };
        }) },
      ];
    })(),
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'similarity-proofs',
    skillId: 'geo-similarity-proofs',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const set = SETS[int(r, 0, 2)];
        const [pid, step, reason, wrongs, why] = SIM_T2[idx % 4];
        return {
          prompt: `${proofText(SIM_PROOFS[pid], set)} What reason justifies step ${step}?`,
          ...mc(r, reason, wrongs),
          explanation: why,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const set = SETS[int(r, 0, 2)];
        const shape = idx % 4;
        if (shape === 0) {
          const pid = pick(r, ['S1', 'S2', 'S4']);
          return {
            prompt: `${proofText(SIM_PROOFS[pid], set)} What reason justifies step 4?`,
            ...mc(r, R_AA, [R_SAS_SIM, R_SSS_SIM, R_CPCTC]),
            explanation: 'Steps 2 and 3 give two pairs of congruent angles, and two pairs of angles are enough: AA Similarity. No side lengths are known, so SAS and SSS Similarity cannot be used, and CPCTC needs congruent triangles.',
          };
        }
        if (shape === 1) {
          return {
            prompt: L('Given: in △#ABC, point #D is on side #AB, point #E is on side #AC, and #DE ∥ #BC. Prove: △#ADE ~ △#ABC. Steps: (1) #DE ∥ #BC, given. (2) ∠#ADE ≅ ∠#ABC, corresponding angles. (3) ?, by the Reflexive Property. (4) △#ADE ~ △#ABC, by AA. Which statement belongs in step 3?', set),
            ...mc(r, L('∠#DAE ≅ ∠#BAC', set), ['∠#AED ≅ ∠#ABC', '#AD ≅ #DB', '#DE ≅ #BC'].map((w) => L(w, set))),
            explanation: L('The Reflexive Property is about something shared: both triangles contain the same angle at #A, so ∠#DAE ≅ ∠#BAC. That is the second pair of angles AA needs. #DE and #BC are parallel, not congruent.', set),
          };
        }
        if (shape === 2) {
          const a = int(r, 2, 6), b = int(r, 2, 6), k = int(r, 2, 3);
          if (a === b) again();
          return {
            prompt: L(`Given: segments #AC and #BD intersect at #E, with #AE = ${a}, #CE = ${k * a}, #BE = ${b} and #DE = ${k * b}. Prove: △#AEB ~ △#CED. Steps: (1) #AE/#CE = 1/${k} and #BE/#DE = 1/${k}. (2) ∠#AEB ≅ ∠#CED. (3) △#AEB ~ △#CED. What reason justifies step 3?`, set),
            ...mc(r, R_SAS_SIM, [R_AA, R_SSS_SIM, R_SAS]),
            explanation: `Two pairs of sides are proportional (${a}/${k * a} = ${b}/${k * b} = 1/${k}) and the angles between them are congruent vertical angles: SAS Similarity. Only one pair of angles is known, so AA does not apply, and the sides are proportional, not congruent.`,
          };
        }
        return {
          prompt: L('Given: segments #AD and #BC intersect at #E, and #AB ∥ #CD. Prove: △#ABE ~ △#DCE. Steps: (1) #AB ∥ #CD, given. (2) ?, alternate interior angles with transversal #AD. (3) ∠#AEB ≅ ∠#DEC, vertical angles. (4) △#ABE ~ △#DCE, by AA. Which statement belongs in step 2?', set),
          ...mc(r, L('∠#BAE ≅ ∠#CDE', set), ['∠#BAE ≅ ∠#DCE', '∠#AEB ≅ ∠#AEC', '#AB ≅ #CD'].map((w) => L(w, set))),
          explanation: L('The transversal #AD meets the parallel lines at #A and at #D, so the alternate interior angles are the ones at those two points: ∠#BAE ≅ ∠#CDE. Pairing the angle at #A with the angle at #C uses two different transversals.', set),
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const set = SETS[int(r, 0, 2)];
        const shape = idx % 4;
        if (shape === 0) {
          return {
            prompt: L('Segments #AD and #BC intersect at #E, and △#ABE ~ △#DCE. Which proportion must be true?', set),
            ...mc(r, L('#AB/#DC = #BE/#CE', set), ['#AB/#DC = #BE/#DE', '#AB/#BE = #DC/#DE', '#AE/#CE = #BE/#DE'].map((w) => L(w, set))),
            explanation: L('The order of the letters gives the matches #A↔#D, #B↔#C, #E↔#E, so #AB matches #DC, #BE matches #CE and #AE matches #DE. That makes #AB/#DC = #BE/#CE. Pairing #BE with #DE ignores the vertex order.', set),
          };
        }
        if (shape === 1) {
          return {
            prompt: L('In △#ABC, point #D is on side #AB and point #E is on side #AC, with #DE ∥ #BC, so △#ADE ~ △#ABC. Which proportion must be true?', set),
            ...mc(r, L('#AD/#AB = #DE/#BC', set), ['#AD/#DB = #DE/#BC', '#AD/#AB = #BC/#DE', '#AE/#AB = #DE/#BC'].map((w) => L(w, set))),
            explanation: L('In △#ADE ~ △#ABC, side #AD matches the WHOLE side #AB and #DE matches #BC, so #AD/#AB = #DE/#BC. Using #DB (only part of the side) in place of #AB is the usual slip.', set),
          };
        }
        if (shape === 2) {
          return {
            prompt: L('Segments #AD and #BC intersect at #E. It is known that ∠#BAE ≅ ∠#CDE and ∠#AEB ≅ ∠#DEC. Which similarity statement lists the vertices in the correct order?', set),
            ...mc(r, L('△#ABE ~ △#DCE', set), ['△#ABE ~ △#CDE', '△#ABE ~ △#DEC', '△#AEB ~ △#DCE'].map((w) => L(w, set))),
            explanation: L('The congruent angles tell you which vertices match: #A with #D and #E with #E, which leaves #B with #C. Writing the vertices in matching order gives △#ABE ~ △#DCE. △#ABE ~ △#CDE would claim the angle at #A equals the angle at #C.', set),
          };
        }
        return {
          prompt: L('△#ABC has a right angle at #C, and #CD is the altitude to side #AB, so #D is on #AB. Because △#ACD ~ △#ABC, which proportion must be true?', set),
          ...mc(r, L('#AC/#AB = #AD/#AC', set), ['#AC/#AB = #AD/#BC', '#AC/#BC = #AD/#AC', '#CD/#AB = #AD/#AC'].map((w) => L(w, set))),
          explanation: L('The order △#ACD ~ △#ABC matches #A↔#A, #C↔#B, #D↔#C, so #AC matches #AB and #AD matches #AC: #AC/#AB = #AD/#AC. Notice #AC plays a part in both triangles — a leg of the big one and the hypotenuse of the small one.', set),
        };
      }) },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-prisms-cylinders',
    skillId: 'geo-volume-prisms-cylinders',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const a = int(r, 3, 9), b = int(r, 4, 12), h = int(r, 5, 15);
          if ((a * b) % 2 !== 0 || a === b) again();
          return {
            prompt: `A right triangular prism has bases that are right triangles with legs of ${a} ${u} and ${b} ${u}. The distance between the two bases (the height of the prism) is ${h} ${u}. What is the volume of the prism, in ${u}³?`,
            value: a * b * h / 2,
            explanation: `V = Bh. The base is a right triangle with area ½ · ${a} · ${b} = ${a * b / 2}, so V = ${a * b / 2} · ${h} = ${a * b * h / 2}. Multiplying ${a} · ${b} · ${h} without the ½ treats the base as a rectangle.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 3, 9), h = int(r, 3, 12);
          const ans = piStr(rad * rad * h);
          return {
            prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(2 * rad * h), piStr(rad * h), piStr(4 * rad * rad * h)]),
            explanation: `V = πr²h = π · ${rad}² · ${h} = ${ans}. ${piStr(2 * rad * h)} is the lateral AREA (2πrh), and ${piStr(rad * h)} forgets to square the radius.`,
          };
        }
        if (shape === 2) {
          const B = int(r, 12, 60), h = int(r, 4, 15);
          const base = pick(r, ['pentagon', 'hexagon', 'octagon']);
          return {
            prompt: `A right prism has a base that is a regular ${base} with an area of ${B} ${u}². The height of the prism is ${h} ${u}. What is the volume of the prism, in ${u}³?`,
            value: B * h,
            explanation: `For any right prism V = Bh, whatever the shape of the base: ${B} · ${h} = ${B * h}. Dividing by 3 (the pyramid formula) is the usual slip.`,
          };
        }
        const rad = int(r, 2, 8), h = int(r, 3, 12);
        const ans = piStr(rad * rad * h);
        return {
          prompt: `A cylinder has a diameter of ${2 * rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
          ...mc(r, ans, [piStr(4 * rad * rad * h), piStr(2 * rad * h), piStr(rad * h)]),
          explanation: `The radius is half the diameter, ${rad}. V = πr²h = π · ${rad}² · ${h} = ${ans}. Squaring the diameter ${2 * rad} gives ${piStr(4 * rad * rad * h)}, four times too big.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const rad = int(r, 2, 9), h = int(r, 3, 12);
          const v = 3.14 * rad * rad * h;
          if (isWhole(v)) again();
          return {
            prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `V = πr²h = 3.14 · ${rad}² · ${h} = 3.14 · ${rad * rad * h} = ${dec(v)}. Using 3.14 · ${rad} · ${h} forgets to square the radius.`,
          };
        }
        if (shape === 1) {
          const l = int(r, 5, 12), w = int(r, 3, 9), h = int(r, 4, 15);
          if (l === w || h === l || h === w) again();
          return {
            prompt: `A rectangular prism has a volume of ${l * w * h} ${u}³. Its base is ${l} ${u} by ${w} ${u}. What is its height, in ${u}?`,
            value: h,
            explanation: `V = Bh and the base area is ${l} · ${w} = ${l * w}, so h = ${l * w * h} ÷ ${l * w} = ${h}. Dividing by ${l} + ${w} (adding instead of multiplying the base sides) is the usual slip.`,
          };
        }
        if (shape === 2) {
          const rad = int(r, 2, 9), h = int(r, 3, 14);
          if (h === rad) again();
          return {
            prompt: `A cylinder has a volume of ${piStr(rad * rad * h)} ${u}³ and a radius of ${rad} ${u}. What is its height, in ${u}?`,
            value: h,
            explanation: `πr²h = ${piStr(rad * rad * h)}, so ${rad}² · h = ${rad * rad * h} and h = ${rad * rad * h} ÷ ${rad * rad} = ${h}. Dividing by ${rad} only once forgets that the radius is squared.`,
          };
        }
        const b = int(r, 4, 14), ht = int(r, 3, 10), len = int(r, 6, 20);
        if ((b * ht) % 2 !== 0 || b === ht) again();
        return {
          prompt: `A right prism has triangular bases. Each base is a triangle with a base of ${b} ${u} and a height of ${ht} ${u}. The prism is ${len} ${u} long. What is its volume, in ${u}³?`,
          value: b * ht * len / 2,
          explanation: `The area of each triangular base is ½ · ${b} · ${ht} = ${b * ht / 2}. V = Bh = ${b * ht / 2} · ${len} = ${b * ht * len / 2}. Leaving out the ½ doubles the answer.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const R = int(r, 4, 8), H = int(r, 2, 6), rad = int(r, 2, R - 1), h = int(r, 3, 9);
          const ans = piStr(R * R * H + rad * rad * h);
          return {
            prompt: `A solid is made of two cylinders stacked on the same axis. The bottom cylinder has a radius of ${R} cm and a height of ${H} cm; the top cylinder has a radius of ${rad} cm and a height of ${h} cm. What is the total volume of the solid, in cm³, in terms of π?`,
            ...mc(r, ans, [piStr(R * H + rad * h), piStr(2 * R * H + 2 * rad * h), piStr((R + rad) * (R + rad) * (H + h))]),
            explanation: `Find each cylinder separately and add: π · ${R}² · ${H} = ${piStr(R * R * H)} and π · ${rad}² · ${h} = ${piStr(rad * rad * h)}, total ${ans}. Adding the radii and heights first, to get ${piStr((R + rad) * (R + rad) * (H + h))}, is not the same solid.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 1, 3), l = int(r, 8, 14), w = int(r, 2 * rad + 2, 10), h = int(r, 4, 12);
          const v = l * w * h - 3.14 * rad * rad * h;
          if (isWhole(v) || l === w) again();
          return {
            prompt: `A rectangular block of wood is ${l} cm long, ${w} cm wide and ${h} cm tall. A cylindrical hole with a radius of ${rad} cm is drilled straight down through its full ${h} cm height. Use 3.14 for π. What volume of wood is left, in cm³? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `Block: ${l} · ${w} · ${h} = ${l * w * h}. Hole: 3.14 · ${rad}² · ${h} = ${dec(3.14 * rad * rad * h)}. Wood left: ${l * w * h} − ${dec(3.14 * rad * rad * h)} = ${dec(v)} cm³. Adding the hole instead of subtracting it is the usual slip.`,
          };
        }
        if (shape === 2) {
          const u = unit(r), rad = int(r, 3, 12), h = int(r, 3, 12);
          if (h === rad) again();
          return {
            prompt: `A cylinder has a volume of ${piStr(rad * rad * h)} ${u}³ and a height of ${h} ${u}. What is its radius, in ${u}?`,
            value: rad,
            explanation: `πr²h = ${piStr(rad * rad * h)}, so r² = ${rad * rad * h} ÷ ${h} = ${rad * rad} and r = ${rad}. Stopping at ${rad * rad} forgets the square root.`,
          };
        }
        const l = int(r, 5, 12), w = 2 * int(r, 2, 4), h = int(r, 2, 5), t = int(r, 1, 4);
        if (l === w) again();
        return {
          prompt: `A shed is a rectangular prism ${l} m long, ${w} m wide and ${h} m tall, with a roof on top in the shape of a triangular prism. Each triangular end of the roof has a base of ${w} m and a height of ${t} m, and the roof runs the full ${l} m length of the shed. What is the total volume of the shed, in m³?`,
          value: l * w * h + w * t * l / 2,
          explanation: `Box: ${l} · ${w} · ${h} = ${l * w * h}. Roof: the triangular end has area ½ · ${w} · ${t} = ${w * t / 2}, times the length ${l} gives ${w * t * l / 2}. Total ${l * w * h} + ${w * t * l / 2} = ${l * w * h + w * t * l / 2} m³. Forgetting the ½ for the roof is the usual slip.`,
        };
      }) },
    ],
  },

  // 9 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'volume-pyramids-cones-spheres',
    skillId: 'geo-volume-pyramids-cones-spheres',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const s = int(r, 3, 12), h = int(r, 4, 15);
          if ((s * s * h) % 3 !== 0 || s === h) again();
          return {
            prompt: `A pyramid has a square base with sides of ${s} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³?`,
            value: s * s * h / 3,
            explanation: `V = ⅓Bh. The base area is ${s}² = ${s * s}, so V = ⅓ · ${s * s} · ${h} = ${s * s * h / 3}. Leaving out the ⅓ gives ${s * s * h}, the volume of the prism with the same base and height.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 2, 9), h = 3 * int(r, 1, 5);
          const ans = piStr(rad * rad * h, 3);
          return {
            prompt: `A cone has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(rad * rad * h), piStr(rad * h, 3), piStr(4 * rad * rad * h, 3)]),
            explanation: `V = ⅓πr²h = ⅓ · π · ${rad}² · ${h} = ${ans}. ${piStr(rad * rad * h)} is the cylinder (no ⅓), and ${piStr(rad * h, 3)} forgets to square the radius.`,
          };
        }
        if (shape === 2) {
          const rad = pick(r, [6, 9, 12, 15]);
          const ans = piStr(4 * rad ** 3, 3);
          return {
            prompt: `A sphere has a radius of ${rad} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad * rad), piStr(4 * rad ** 3), piStr(4 * rad * rad, 3)]),
            explanation: `V = (4/3)πr³ = (4/3) · π · ${rad}³ = (4/3) · ${rad ** 3}π = ${ans}. ${piStr(4 * rad * rad)} is the surface AREA (4πr²), and ${piStr(4 * rad * rad, 3)} squares the radius instead of cubing it.`,
          };
        }
        const l = int(r, 4, 12), w = int(r, 3, 9), h = int(r, 4, 12);
        if ((l * w * h) % 3 !== 0 || l === w) again();
        return {
          prompt: `A pyramid has a rectangular base ${l} ${u} by ${w} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³?`,
          value: l * w * h / 3,
          explanation: `V = ⅓Bh. The base area is ${l} · ${w} = ${l * w}, so V = ⅓ · ${l * w} · ${h} = ${l * w * h / 3}. Using ½ instead of ⅓ is the usual slip.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const rad = int(r, 2, 8), h = 3 * int(r, 1, 5);
          const ans = piStr(rad * rad * h, 3);
          return {
            prompt: `A cone has a diameter of ${2 * rad} ${u} and a height of ${h} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad * rad * h, 3), piStr(rad * rad * h), piStr(2 * rad * h, 3)]),
            explanation: `The radius is ${rad}. V = ⅓πr²h = ⅓ · π · ${rad}² · ${h} = ${ans}. Squaring the diameter gives ${piStr(4 * rad * rad * h, 3)}, and leaving out the ⅓ gives ${piStr(rad * rad * h)}.`,
          };
        }
        if (shape === 1) {
          const rad = pick(r, [6, 9, 12, 15]);
          const ans = piStr(2 * rad ** 3, 3);
          return {
            prompt: `A hemisphere (half of a sphere) has a radius of ${rad} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad ** 3, 3), piStr(2 * rad * rad), piStr(2 * rad ** 3)]),
            explanation: `A whole sphere is (4/3)π · ${rad}³ = ${piStr(4 * rad ** 3, 3)}; half of that is ${ans}. Forgetting to halve gives the whole sphere, and ${piStr(2 * rad * rad)} is the curved surface area.`,
          };
        }
        if (shape === 2) {
          const rad = int(r, 2, 9), h = int(r, 3, 12);
          if ((rad * rad * h) % 3 !== 0) again();
          const v = 3.14 * rad * rad * h / 3;
          if (isWhole(v)) again();
          return {
            prompt: `A cone has a radius of ${rad} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its volume, in ${u}³? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `V = ⅓πr²h = ⅓ · 3.14 · ${rad}² · ${h} = 3.14 · ${rad * rad * h / 3} = ${dec(v)}. Leaving out the ⅓ gives the cylinder's volume, three times too big.`,
          };
        }
        const s = int(r, 3, 12), h = int(r, 4, 15);
        if ((s * s * h) % 3 !== 0 || s === h) again();
        return {
          prompt: `A pyramid with a square base has a volume of ${s * s * h / 3} ${u}³. Each side of the base is ${s} ${u}. What is the height of the pyramid, in ${u}?`,
          value: h,
          explanation: `V = ⅓Bh with B = ${s}² = ${s * s}: ${s * s * h / 3} = ⅓ · ${s * s} · h, so h = 3 · ${s * s * h / 3} ÷ ${s * s} = ${h}. Dividing ${s * s * h / 3} by ${s * s} without multiplying by 3 is the usual slip.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const u = unit(r);
          const [rad, h, l] = triple(r, 30);
          if ((rad * rad * h) % 3 !== 0) again();
          const ans = piStr(rad * rad * h, 3);
          return {
            prompt: `A cone has a radius of ${rad} ${u} and a slant height of ${l} ${u}. What is its volume, in ${u}³, in terms of π?`,
            ...mc(r, ans, [piStr(rad * rad * l, 3), piStr(rad * rad * h), piStr(rad * l)]),
            explanation: `The volume needs the HEIGHT, not the slant height. The radius, height and slant height make a right triangle: h = √(${l}² − ${rad}²) = ${h}. Then V = ⅓ · π · ${rad}² · ${h} = ${ans}. Using ${l} as the height gives ${piStr(rad * rad * l, 3)}.`,
          };
        }
        if (shape === 1) {
          const u = unit(r);
          const [a, h, l] = triple(r, 30);
          if ((4 * a * a * h) % 3 !== 0) again();
          return {
            prompt: `A pyramid has a square base with sides of ${2 * a} ${u}. Its slant height (from the top, down the middle of a face, to the base edge) is ${l} ${u}. What is the volume of the pyramid, in ${u}³?`,
            value: 4 * a * a * h / 3,
            explanation: `The height, half the base side (${a}) and the slant height make a right triangle: h = √(${l}² − ${a}²) = ${h}. Then V = ⅓ · ${2 * a}² · ${h} = ${4 * a * a * h / 3}. Using the slant height ${l} as the height, or the full side ${2 * a} in the triangle, are the usual slips.`,
          };
        }
        if (shape === 2) {
          const rad = pick(r, [3, 6]), h = int(r, 4, 12);
          if ((rad * rad * h) % 3 !== 0) again();
          const cone = rad * rad * h / 3, hemi = 2 * rad ** 3 / 3;
          return {
            prompt: `A solid is a cone joined to a hemisphere of the same radius, with their flat circular faces together. The radius is ${rad} cm and the cone is ${h} cm tall. What is the total volume of the solid, in cm³, in terms of π?`,
            ...mc(r, piStr(cone + hemi), [piStr(cone + 2 * hemi), piStr(3 * cone + hemi), piStr(cone)]),
            explanation: `Cone: ⅓ · π · ${rad}² · ${h} = ${piStr(cone)}. Hemisphere: ½ · (4/3) · π · ${rad}³ = ${piStr(hemi)}. Total ${piStr(cone + hemi)}. Adding a WHOLE sphere gives ${piStr(cone + 2 * hemi)}.`,
          };
        }
        const u = unit(r), rad = pick(r, [3, 6, 9, 12]);
        return {
          prompt: `A sphere has a volume of ${piStr(4 * rad ** 3, 3)} ${u}³. What is its radius, in ${u}?`,
          value: rad,
          explanation: `(4/3)πr³ = ${piStr(4 * rad ** 3, 3)}, so r³ = ${4 * rad ** 3 / 3} · 3/4 = ${rad ** 3} and r = ${rad}. Taking a square root instead of a cube root is the usual slip.`,
        };
      }) },
    ],
  },

  // 10 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'surface-area-prisms-cylinders',
    skillId: 'geo-surface-area-prisms-cylinders',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0 || shape === 2) {
          const l = int(r, 5, 12), w = int(r, 2, 8), h = int(r, 3, 10);
          if (l === w || w === h || l === h) again();
          if (shape === 0) {
            return {
              prompt: `A rectangular prism is ${l} ${u} long, ${w} ${u} wide and ${h} ${u} tall. What is its total surface area, in ${u}²?`,
              value: 2 * (l * w + l * h + w * h),
              explanation: `There are three pairs of faces: 2(${l} · ${w}) + 2(${l} · ${h}) + 2(${w} · ${h}) = ${2 * l * w} + ${2 * l * h} + ${2 * w * h} = ${2 * (l * w + l * h + w * h)}. Multiplying ${l} · ${w} · ${h} gives the volume instead.`,
            };
          }
          return {
            prompt: `A rectangular prism is ${l} ${u} long, ${w} ${u} wide and ${h} ${u} tall. What is its lateral surface area (the four side faces, not the top or bottom), in ${u}²?`,
            value: 2 * (l + w) * h,
            explanation: `Lateral area = perimeter of the base × height = 2(${l} + ${w}) · ${h} = ${2 * (l + w)} · ${h} = ${2 * (l + w) * h}. Including the top and bottom gives the TOTAL surface area, ${2 * (l * w + l * h + w * h)}.`,
          };
        }
        const rad = int(r, 3, 9), h = int(r, 3, 12);
        if (h === rad) again();
        if (shape === 1) {
          const ans = piStr(2 * rad * rad + 2 * rad * h);
          return {
            prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its total surface area, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(2 * rad * h), piStr(rad * rad + 2 * rad * h), piStr(rad * rad * h)]),
            explanation: `SA = 2πr² + 2πrh = 2π(${rad})² + 2π(${rad})(${h}) = ${piStr(2 * rad * rad)} + ${piStr(2 * rad * h)} = ${ans}. ${piStr(2 * rad * h)} is the curved side only, and ${piStr(rad * rad + 2 * rad * h)} counts just one base.`,
          };
        }
        const ans = piStr(2 * rad * h);
        return {
          prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its lateral surface area (the curved side only, not the two circular bases), in ${u}², in terms of π?`,
          ...mc(r, ans, [piStr(2 * rad * rad + 2 * rad * h), piStr(rad * h), piStr(rad * rad * h)]),
          explanation: `The curved side unrolls into a rectangle: circumference × height = 2π(${rad}) · ${h} = ${ans}. Adding the two bases gives the total, ${piStr(2 * rad * rad + 2 * rad * h)}; ${piStr(rad * rad * h)} is the volume.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const [a, b, c] = triple(r, 26);
          const len = int(r, 5, 15);
          return {
            prompt: `A right triangular prism has bases that are right triangles with sides of ${a} ${u}, ${b} ${u} and ${c} ${u}. The prism is ${len} ${u} long. What is its total surface area, in ${u}²?`,
            value: a * b + (a + b + c) * len,
            explanation: `Two triangular bases: 2 · ½ · ${a} · ${b} = ${a * b}. Three rectangular faces: (${a} + ${b} + ${c}) · ${len} = ${(a + b + c) * len}. Total ${a * b + (a + b + c) * len}. Counting only one triangle, or leaving out the face on the ${c} side, are the usual slips.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 2, 8), h = int(r, 3, 12);
          if (h === rad) again();
          const ans = piStr(2 * rad * rad + 2 * rad * h);
          return {
            prompt: `A cylinder has a diameter of ${2 * rad} ${u} and a height of ${h} ${u}. What is its total surface area, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(8 * rad * rad + 4 * rad * h), piStr(2 * rad * h), piStr(rad * rad + 2 * rad * h)]),
            explanation: `The radius is ${rad}. SA = 2π(${rad})² + 2π(${rad})(${h}) = ${piStr(2 * rad * rad)} + ${piStr(2 * rad * h)} = ${ans}. Using the diameter ${2 * rad} as the radius gives ${piStr(8 * rad * rad + 4 * rad * h)}; ${piStr(2 * rad * h)} is the side only.`,
          };
        }
        if (shape === 2) {
          const rad = int(r, 2, 9), h = int(r, 3, 12);
          const v = 3.14 * (2 * rad * rad + 2 * rad * h);
          if (isWhole(v) || h === rad) again();
          return {
            prompt: `A cylinder has a radius of ${rad} ${u} and a height of ${h} ${u}. Use 3.14 for π. What is its total surface area, in ${u}²? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `SA = 2πr² + 2πrh = 2(3.14)(${rad})² + 2(3.14)(${rad})(${h}) = ${dec(6.28 * rad * rad)} + ${dec(6.28 * rad * h)} = ${dec(v)}. Stopping at ${dec(6.28 * rad * h)} leaves out the two circular bases.`,
          };
        }
        const l = int(r, 6, 14), w = int(r, 3, 9), h = int(r, 2, 8);
        if (l === w || w === h || l === h) again();
        return {
          prompt: `An open-top box (a rectangular prism with no lid) is ${l} cm long, ${w} cm wide and ${h} cm tall. What is the total area of its outside surfaces — the bottom and the four sides — in cm²?`,
          value: l * w + 2 * l * h + 2 * w * h,
          explanation: `Bottom: ${l} · ${w} = ${l * w}. Four sides: 2(${l} · ${h}) + 2(${w} · ${h}) = ${2 * l * h + 2 * w * h}. Total ${l * w + 2 * l * h + 2 * w * h} cm². Using the full formula counts a lid that is not there and gives ${2 * (l * w + l * h + w * h)}.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const u = unit(r);
          const [a, b, c] = triple(r, 26);
          const len = int(r, 5, 15);
          return {
            prompt: `A right triangular prism has bases that are right triangles with legs of ${a} ${u} and ${b} ${u}. The prism is ${len} ${u} long. What is its total surface area, in ${u}²?`,
            value: a * b + (a + b + c) * len,
            explanation: `First find the hypotenuse of the base: √(${a}² + ${b}²) = ${c}. Two bases: 2 · ½ · ${a} · ${b} = ${a * b}. Three rectangles: (${a} + ${b} + ${c}) · ${len} = ${(a + b + c) * len}. Total ${a * b + (a + b + c) * len}. Leaving out the rectangle on the hypotenuse is the usual slip.`,
          };
        }
        const rad = int(r, 2, 8), h = int(r, 3, 12);
        if (h === rad) again();
        if (shape === 1) {
          const ans = piStr(rad * rad + 2 * rad * h);
          return {
            prompt: `A cylindrical can with no lid has a radius of ${rad} cm and a height of ${h} cm. What is the area of its outside surface — the bottom and the curved side — in cm², in terms of π?`,
            ...mc(r, ans, [piStr(2 * rad * rad + 2 * rad * h), piStr(2 * rad * h), piStr(rad * rad * h)]),
            explanation: `One circular base: π(${rad})² = ${piStr(rad * rad)}. Curved side: 2π(${rad})(${h}) = ${piStr(2 * rad * h)}. Total ${ans}. The full formula 2πr² + 2πrh counts a lid that is not there.`,
          };
        }
        if (shape === 2) {
          const u = unit(r);
          return {
            prompt: `A cylinder has a radius of ${rad} ${u} and a total surface area of ${piStr(2 * rad * rad + 2 * rad * h)} ${u}². What is its height, in ${u}?`,
            value: h,
            explanation: `2πr² + 2πrh = ${piStr(2 * rad * rad + 2 * rad * h)}. The two bases are 2π(${rad})² = ${piStr(2 * rad * rad)}, leaving ${piStr(2 * rad * h)} for the side, so 2 · ${rad} · h = ${2 * rad * h} and h = ${h}. Forgetting to subtract the bases first is the usual slip.`,
          };
        }
        const v = 3.14 * (rad * rad + 2 * rad * h);
        if (isWhole(v)) again();
        return {
          prompt: `A cylindrical water tank has a radius of ${rad} m and a height of ${h} m. The curved side and the top will be painted, but not the bottom. Use 3.14 for π. What area will be painted, in m²? Give your answer as a decimal.`,
          value: dec(v),
          explanation: `Top: 3.14 · ${rad}² = ${dec(3.14 * rad * rad)}. Side: 2 · 3.14 · ${rad} · ${h} = ${dec(6.28 * rad * h)}. Painted area ${dec(v)} m². Using the full surface area counts the bottom too.`,
        };
      }) },
    ],
  },

  // 11 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'surface-area-pyramids-cones-spheres',
    skillId: 'geo-surface-area-pyramids-cones-spheres',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0 || shape === 3) {
          const s = int(r, 4, 14), l = int(r, 5, 15);
          if (s === l) again();
          if (shape === 0) {
            return {
              prompt: `A regular square pyramid has a base with sides of ${s} ${u} and a slant height of ${l} ${u}. What is its total surface area, in ${u}²?`,
              value: s * s + 2 * s * l,
              explanation: `Base: ${s}² = ${s * s}. Four triangular faces: 4 · ½ · ${s} · ${l} = ${2 * s * l}. Total ${s * s + 2 * s * l}. Leaving out the ½ on the triangles gives ${s * s + 4 * s * l}.`,
            };
          }
          return {
            prompt: `A regular square pyramid has a base with sides of ${s} ${u} and a slant height of ${l} ${u}. What is its lateral surface area (the four triangular faces only), in ${u}²?`,
            value: 2 * s * l,
            explanation: `Each face is a triangle with base ${s} and height ${l}: ½ · ${s} · ${l} = ${s * l / 2}. Four of them make ${2 * s * l}. Adding the base (${s * s}) gives the total surface area, which was not asked for.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 2, 12);
          const ans = piStr(4 * rad * rad);
          return {
            prompt: `A sphere has a radius of ${rad} ${u}. What is its surface area, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad ** 3, 3), piStr(rad * rad), piStr(2 * rad * rad)]),
            explanation: `SA = 4πr² = 4 · π · ${rad}² = ${ans}. ${piStr(4 * rad ** 3, 3)} is the VOLUME, and ${piStr(rad * rad)} is the area of just one circle through the centre.`,
          };
        }
        const rad = int(r, 2, 9), l = int(r, 4, 15);
        if (l <= rad) again();
        const ans = piStr(rad * rad + rad * l);
        return {
          prompt: `A cone has a radius of ${rad} ${u} and a slant height of ${l} ${u}. What is its total surface area, in ${u}², in terms of π?`,
          ...mc(r, ans, [piStr(rad * l), piStr(rad * rad + 2 * rad * l), piStr(2 * rad * rad + rad * l)]),
          explanation: `SA = πr² + πrl = π(${rad})² + π(${rad})(${l}) = ${piStr(rad * rad)} + ${piStr(rad * l)} = ${ans}. ${piStr(rad * l)} is the curved surface only, and a cone has ONE circular base, not two.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const shape = idx % 4, u = unit(r);
        if (shape === 0) {
          const rad = int(r, 2, 8), l = int(r, 4, 15);
          if (l <= rad) again();
          const ans = piStr(rad * rad + rad * l);
          return {
            prompt: `A cone has a diameter of ${2 * rad} ${u} and a slant height of ${l} ${u}. What is its total surface area, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(4 * rad * rad + 2 * rad * l), piStr(rad * l), piStr(rad * rad + 2 * rad * l)]),
            explanation: `The radius is ${rad}. SA = πr² + πrl = ${piStr(rad * rad)} + ${piStr(rad * l)} = ${ans}. Using the diameter ${2 * rad} as the radius gives ${piStr(4 * rad * rad + 2 * rad * l)}; ${piStr(rad * l)} leaves out the base.`,
          };
        }
        if (shape === 1) {
          const rad = int(r, 2, 12);
          const ans = piStr(3 * rad * rad);
          return {
            prompt: `A solid hemisphere (half of a sphere, including its flat circular face) has a radius of ${rad} ${u}. What is its total surface area, in ${u}², in terms of π?`,
            ...mc(r, ans, [piStr(2 * rad * rad), piStr(4 * rad * rad), piStr(2 * rad ** 3, 3)]),
            explanation: `The curved part is half a sphere: ½ · 4π(${rad})² = ${piStr(2 * rad * rad)}. The flat face is a circle: π(${rad})² = ${piStr(rad * rad)}. Total ${ans}. Stopping at ${piStr(2 * rad * rad)} forgets the flat face.`,
          };
        }
        if (shape === 2) {
          const rad = int(r, 2, 12);
          const v = 3.14 * 4 * rad * rad;
          if (isWhole(v)) again();
          return {
            prompt: `A sphere has a radius of ${rad} ${u}. Use 3.14 for π. What is its surface area, in ${u}²? Give your answer as a decimal.`,
            value: dec(v),
            explanation: `SA = 4πr² = 4 · 3.14 · ${rad}² = 3.14 · ${4 * rad * rad} = ${dec(v)}. Leaving out the 4 gives the area of a single circle, ${dec(3.14 * rad * rad)}.`,
          };
        }
        const s = int(r, 4, 12), l = int(r, 5, 15);
        if (s === l) again();
        return {
          prompt: `A regular square pyramid has a base with sides of ${s} ${u} and a total surface area of ${s * s + 2 * s * l} ${u}². What is its slant height, in ${u}?`,
          value: l,
          explanation: `The base is ${s}² = ${s * s}, so the four triangles total ${s * s + 2 * s * l} − ${s * s} = ${2 * s * l}. Since 4 · ½ · ${s} · l = ${2 * s}l, the slant height is ${2 * s * l} ÷ ${2 * s} = ${l}. Forgetting to subtract the base first is the usual slip.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const shape = idx % 4;
        if (shape === 0) {
          const u = unit(r);
          const [a, h, l] = triple(r, 30);
          return {
            prompt: `A regular square pyramid has a base with sides of ${2 * a} ${u} and a height of ${h} ${u} (measured straight up from the centre of the base). What is its total surface area, in ${u}²?`,
            value: 4 * a * a + 4 * a * l,
            explanation: `The faces need the SLANT height. Half the base side (${a}) and the height (${h}) are legs of a right triangle: l = √(${a}² + ${h}²) = ${l}. SA = ${2 * a}² + 4 · ½ · ${2 * a} · ${l} = ${4 * a * a} + ${4 * a * l} = ${4 * a * a + 4 * a * l}. Using the height ${h} for the triangles gives ${4 * a * a + 4 * a * h}.`,
          };
        }
        if (shape === 1 || shape === 3) {
          const [rad, h, l] = triple(r, 30);
          if (shape === 1) {
            const u = unit(r);
            const ans = piStr(rad * rad + rad * l);
            return {
              prompt: `A cone has a radius of ${rad} ${u} and a height of ${h} ${u}. What is its total surface area, in ${u}², in terms of π?`,
              ...mc(r, ans, [piStr(rad * rad + rad * h), piStr(rad * l), piStr(rad * rad + 2 * rad * l)]),
              explanation: `The curved surface needs the slant height: l = √(${rad}² + ${h}²) = ${l}. SA = π(${rad})² + π(${rad})(${l}) = ${piStr(rad * rad)} + ${piStr(rad * l)} = ${ans}. Using the height ${h} in place of ${l} gives ${piStr(rad * rad + rad * h)}.`,
            };
          }
          if (h <= rad || rad > 12) again();   // a hat is taller than it is wide
          const ans = piStr(rad * l);
          return {
            prompt: `A paper party hat is a cone with no base. Its radius is ${rad} cm and its height is ${h} cm. How much paper covers the hat, in cm², in terms of π?`,
            ...mc(r, ans, [piStr(rad * rad + rad * l), piStr(rad * h), piStr(2 * rad * l)]),
            explanation: `Only the curved surface is paper: πrl, with slant height l = √(${rad}² + ${h}²) = ${l}. So the area is π(${rad})(${l}) = ${ans}. Using the height ${h} gives ${piStr(rad * h)}, and adding πr² counts a base the hat does not have.`,
          };
        }
        const u = unit(r), rad = pick(r, [3, 6, 9]);
        const ans = piStr(4 * rad ** 3, 3);
        return {
          prompt: `A sphere has a surface area of ${piStr(4 * rad * rad)} ${u}². What is its volume, in ${u}³, in terms of π?`,
          ...mc(r, ans, [piStr(4 * rad ** 3), piStr(32 * rad ** 3, 3), piStr(2 * rad ** 3, 3)]),
          explanation: `4πr² = ${piStr(4 * rad * rad)}, so r² = ${rad * rad} and r = ${rad}. Then V = (4/3)π(${rad})³ = ${ans}. Forgetting to divide by 4 first gives r = ${2 * rad} and ${piStr(32 * rad ** 3, 3)}; ${piStr(4 * rad ** 3)} leaves out the ⅓.`,
        };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
