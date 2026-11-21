/**
 * Course-level check items, Geometry (part B) — every answer RE-SOLVED from
 * the printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the numbers
 * (or the proof, or the choices) out of the prompt a student would see and
 * works the answer a second way, with the rules typed by hand below:
 * formulas for the measurement skills, coordinates for the similarity
 * proportions, and hand-typed reason tables for the proofs.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelGeometryB');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** A rational multiple of π the way a textbook prints it. */
function piS(n, d = 1) {
  const k = gcd(n, d);
  const a = n / k, b = d / k;
  return `${a === 1 ? '' : a}π${b === 1 ? '' : `/${b}`}`;
}
const d2 = (x) => String(Number(x.toFixed(2)));
const whole = (x) => {
  if (Math.abs(x - Math.round(x)) > 1e-9) throw new Error(`expected a whole number, got ${x}`);
  return String(Math.round(x));
};
const PI = 3.14;

/** Run the first rule whose pattern matches; "" before π reads as 1. */
function solveBy(rules, prompt) {
  for (const [re, fn] of rules) {
    const m = prompt.match(re);
    if (m) return String(fn(...m.slice(1).map((v) => (v === '' ? 1 : (/^\d+$/.test(v) ? Number(v) : v)))));
  }
  throw new Error(`no re-solver rule matches: ${prompt}`);
}

// Point names: the bank letters its proofs three ways. Read them all as A–E.
const SETS = ['ABCDE', 'JKLMN', 'VWXYZ'];
function lettering(prompt) {
  const m = prompt.match(/(?:△|∠|quadrilateral |parallelogram |Segments )([A-Z])/);
  return (m && SETS.find((s) => s.includes(m[1]))) || 'ABCDE';
}
function norm(text, set) {
  return String(text).replace(/(?<![A-Za-z])[A-Z]{1,4}(?![A-Za-z])/g, (tok) => (
    [...tok].every((ch) => set.includes(ch)) ? [...tok].map((ch) => 'ABCDE'[set.indexOf(ch)]).join('') : tok
  ));
}

// ── hand-typed geometry facts ──────────────────────────────────────────────

// Tests for a parallelogram ABCD with diagonals AC and BD …
const PGRAM_YES = new Set([
  'AB ≅ CD and BC ≅ DA',                        // both pairs of opposite sides congruent
  'AB ∥ CD and BC ∥ DA',                        // the definition
  'AB ∥ CD and AB ≅ CD',                        // one pair parallel AND congruent
  '∠A ≅ ∠C and ∠B ≅ ∠D',                        // both pairs of opposite angles
  'Diagonals AC and BD bisect each other',
]);
// … and descriptions that a non-parallelogram also fits.
const PGRAM_NO = new Set([
  'AB ∥ CD and BC ≅ DA',                        // isosceles trapezoid
  'Diagonals AC and BD are congruent',          // isosceles trapezoid
  'Diagonals AC and BD are perpendicular',      // kite
  'AB ≅ BC and CD ≅ DA',                        // kite
  'AB ∥ CD and ∠B ≅ ∠C',                        // right trapezoid
  'Diagonal AC bisects diagonal BD',            // kite
]);

const REFLEX = 'Reflexive Property of Congruence';
const CPCTC = 'CPCTC (corresponding parts of congruent triangles are congruent)';
const VERT = 'Vertical Angles Theorem';
const AIA = 'Alternate Interior Angles Theorem (parallel lines give congruent angles)';
const AIA_CONV = 'Converse of the Alternate Interior Angles Theorem (congruent angles give parallel lines)';
const PGRAM_DEF = 'Definition of a parallelogram (both pairs of opposite sides are parallel)';
const ONE_PAIR = 'A quadrilateral with one pair of opposite sides both parallel and congruent is a parallelogram';
const CORR = 'Corresponding Angles Theorem (parallel lines give congruent corresponding angles)';

// The reason for a step, looked up by WHAT THE STEP SAYS in each proof.
const PGRAM_REASONS = {
  // Given both pairs of opposite sides congruent; prove parallelogram.
  sides: {
    'AC ≅ AC.': REFLEX,
    '△ABC ≅ △CDA.': 'SSS Congruence',
    '∠BAC ≅ ∠DCA and ∠BCA ≅ ∠DAC.': CPCTC,
    'AB ∥ CD and BC ∥ DA.': AIA_CONV,
    'ABCD is a parallelogram.': PGRAM_DEF,
  },
  // Given diagonals bisect each other; prove parallelogram.
  diagonals: {
    '∠AEB ≅ ∠CED.': VERT,
    '△AEB ≅ △CED.': 'SAS Congruence',
    'AB ≅ CD and ∠BAE ≅ ∠DCE.': CPCTC,
    'AB ∥ CD.': AIA_CONV,
    'ABCD is a parallelogram.': ONE_PAIR,
  },
  // Given a parallelogram; prove opposite sides congruent.
  converse: {
    'AB ∥ CD and BC ∥ DA.': PGRAM_DEF,
    '∠BAC ≅ ∠DCA and ∠BCA ≅ ∠DAC.': AIA,
    'AC ≅ AC.': REFLEX,
    '△ABC ≅ △CDA.': 'ASA Congruence',
    'AB ≅ CD.': CPCTC,
  },
};

const SIM_REASONS = {
  '∠BAE ≅ ∠CDE.': AIA,                 // AB ∥ CD cut by AD
  '∠AEB ≅ ∠DEC.': VERT,
  '∠ADE ≅ ∠ABC.': CORR,                // DE ∥ BC cut by AB
  '∠DAE ≅ ∠BAC.': REFLEX,
  '∠CAD ≅ ∠BAC.': REFLEX,
  '∠ADC ≅ ∠ACB.': 'All right angles are congruent',
  '△ABE ~ △DCE.': 'AA Similarity',
  '△ADE ~ △ABC.': 'AA Similarity',
  '△ACD ~ △ABC.': 'AA Similarity',
};

/** The statement of step n in a "Steps: (1) … (2) …" proof. */
function stepText(prompt, n) {
  const body = prompt.slice(prompt.indexOf('Steps:'));
  const m = body.match(new RegExp(`\\(${n}\\) (.*?)(?= \\(${n + 1}\\) | What reason| Which statement)`));
  if (!m) throw new Error(`no step ${n} in: ${prompt}`);
  return m[1];
}

// Coordinates for the three similarity set-ups, to test proportions by measuring.
const dist = (P, Q) => Math.hypot(P[0] - Q[0], P[1] - Q[1]);
const CONFIG = {
  // AD and BC cross at E with AB ∥ CD: C and D are B and A pushed through E by −3.
  crossing: { E: [0, 0], A: [2, 1], B: [1, 3], D: [-6, -3], C: [-3, -9] },
  // D on AB and E on AC, 40% of the way along, so DE ∥ BC.
  nested: { A: [0, 0], B: [10, 0], C: [3, 7], D: [4, 0], E: [1.2, 2.8] },
  // Right angle at C (3-4-5); D is the foot of the altitude on AB.
  altitude: { C: [0, 0], A: [3, 0], B: [0, 4], D: [1.92, 1.44] },
};

/** Of four "PQ/RS = TU/VW" choices, the one that is true when measured. */
function trueProportion(options, pts) {
  const good = options.filter((o) => {
    const m = o.match(/^([A-E]{2})\/([A-E]{2}) = ([A-E]{2})\/([A-E]{2})$/);
    if (!m) throw new Error(`not a proportion: ${o}`);
    const len = (s) => dist(pts[s[0]], pts[s[1]]);
    return Math.abs(len(m[1]) / len(m[2]) - len(m[3]) / len(m[4])) < 1e-9;
  });
  if (good.length !== 1) throw new Error(`${good.length} true proportions among ${options.join(' | ')}`);
  return good[0];
}

/** Angles of a triangle from two sides and the included angle (law of cosines), sorted sides. */
function sasSides(p, q, deg) {
  const third = Math.sqrt(p * p + q * q - 2 * p * q * Math.cos(deg * Math.PI / 180));
  return [p, q, third].sort((x, y) => x - y);
}
const proportional = (s, t) => Math.abs(s[0] * t[1] - s[1] * t[0]) < 1e-9 && Math.abs(s[1] * t[2] - s[2] * t[1]) < 1e-9;

// ── one re-solver per skill ────────────────────────────────────────────────
// Each returns what the answer must be, in A–E lettering.

const RESOLVE = {
  'geo-parallelogram-proofs': (item, p, opts) => {
    if (/Which information is/.test(p)) {
      const wantNo = /NOT enough/.test(p);
      for (const o of opts) if (!PGRAM_YES.has(o) && !PGRAM_NO.has(o)) throw new Error(`unclassified choice: ${o}`);
      const good = opts.filter((o) => (wantNo ? PGRAM_NO.has(o) : PGRAM_YES.has(o)));
      if (good.length !== 1) throw new Error(`${good.length} right choices`);
      return good[0];
    }
    if (/What reason justifies step/.test(p)) {
      const n = Number(p.match(/justifies step (\d)/)[1]);
      const proof = /Prove: AB ≅ CD/.test(p) ? 'converse' : (/meet at E/.test(p) ? 'diagonals' : 'sides');
      const reason = PGRAM_REASONS[proof][stepText(p, n)];
      if (!reason) throw new Error(`no reason typed for ${proof}: ${stepText(p, n)}`);
      return reason;
    }
    if (/A student writes/.test(p)) {
      // Both claims (one pair parallel + other pair congruent; congruent diagonals)
      // are true of an isosceles trapezoid, which is not a parallelogram.
      if (!/AB ∥ CD and BC ≅ DA, so|diagonals AC and BD are congruent, so/.test(p)) throw new Error('unknown claim');
      return 'The student is wrong: ABCD could be an isosceles trapezoid';
    }
    return solveBy([
      // opposite sides / halves of a diagonal must be equal: ax + b = cx − d
      [/= (\d+)x \+ (\d+)(?: and CD|, RT) = (\d+)x − (\d+)/, (a, b, c, d) => whole((b + d) / (c - a))],
      // consecutive angles of a parallelogram are supplementary
      [/∠A = \((\d+)x \+ (\d+)\)° and ∠B = \((\d+)x \+ (\d+)\)°/, (a, b, c, d) => whole((180 - b - d) / (a + c))],
    ], p);
  },

  'geo-arc-length': (item, p) => solveBy([
    [/radius of (\d+) \w+\. An arc of the circle has a central angle of (\d+)°/, (r, t) => piS(t * 2 * r, 360)],
    [/diameter of (\d+) \w+\. An arc of the circle has a central angle of (\d+)°/, (d, t) => piS(t * d, 360)],
    [/radius of (\d+) \w+\. Use 3\.14 for π\. What is the length of an arc with a central angle of (\d+)°/, (r, t) => d2(2 * PI * r * t / 360)],
    [/radius of (\d+) \w+ is intercepted by a central angle of (\d+)°/, (r, t) => piS(t * 2 * r, 360)],
    // a minute hand turns a full circle in 60 minutes
    [/minute hand of a clock is (\d+) cm long.* in (\d+) minutes/, (len, n) => piS(2 * len * n, 60)],
    [/track has a diameter of (\d+) m\..*central angle of (\d+)°/, (d, t) => d2(PI * d * t / 360)],
    [/radius of (\d+) \w+ has a length of (\d*)π \w+\. What is the measure of the arc's central angle/, (r, len) => whole(len * 360 / (2 * r))],
    [/central angle of (\d+)° has a length of (\d*)π \w+\. What is the radius/, (t, len) => whole(len * 360 / t / 2)],
    [/radius of (\d+) \w+ and a central angle of (\d+)°\. What is the perimeter of the sector/, (r, t) => `${piS(t * 2 * r, 360)} + ${2 * r}`],
    [/diameter of (\d+) \w+ has a length of (\d*)π \w+\. What is the measure of the arc's central angle/, (d, len) => whole(len * 360 / d)],
  ], p),

  'geo-sector-area': (item, p) => solveBy([
    [/radius of (\d+) \w+\. What is the area of a sector with a central angle of (\d+)°, in \w+², in terms of π/, (r, t) => piS(t * r * r, 360)],
    [/diameter of (\d+) \w+\. What is the area of a sector with a central angle of (\d+)°, in \w+², in terms of π/, (d, t) => piS(t * d * d, 1440)],
    [/radius of (\d+) \w+\. Use 3\.14 for π\. What is the area of a sector with a central angle of (\d+)°/, (r, t) => d2(PI * r * r * t / 360)],
    [/sprays water (\d+) m and turns back and forth through an angle of (\d+)°/, (r, t) => d2(PI * r * r * t / 360)],
    [/pizza has a diameter of (\d+) inches and is cut into (\d+) equal slices/, (d, n) => piS(d * d, 4 * n)],
    [/radius of (\d+) \w+ has a central angle of (\d+)°\. In terms of π, what is its area/, (r, t) => piS(t * r * r, 360)],
    [/radius of (\d+) \w+ has an area of (\d*)π \w+²\. What is the measure of the sector's central angle/, (r, a) => whole(a * 360 / (r * r))],
    [/central angle of (\d+)° has an area of (\d*)π \w+²\. What is the radius/, (t, a) => whole(Math.sqrt(a * 360 / t))],
    [/radius of (\d+) \w+\. A sector with a central angle of (\d+)° is cut out and removed/, (r, t) => piS((360 - t) * r * r, 360)],
    [/diameter of (\d+) \w+ has an area of (\d*)π \w+²\. What is the measure of the sector's central angle/, (d, a) => whole(a * 360 * 4 / (d * d))],
  ], p),

  'geo-inscribed-angles': (item, p) => solveBy([
    [/intercepts an arc that measures (\d+)°\. What is the measure of the inscribed angle/, (arc) => whole(arc / 2)],
    [/inscribed angle of a circle measures (\d+)°\. What is the measure of the arc/, (a) => 2 * a],
    [/side AB is a diameter of the circle\. Angle A measures (\d+)°\. What is the measure of angle B/, (a) => 180 - 90 - a],
    [/Inscribed angle ACB measures (\d+)° and intercepts arc AB\. What is the measure of central angle AOB/, (a) => 2 * a],
    [/Angle A measures (\d+)° and angle B measures (\d+)°\. What is the measure of angle ([CD])/, (a, b, ask) => (ask === 'C' ? 180 - a : 180 - b)],
    // arc = 2 × inscribed angle
    [/inscribed angle measures \((\d+)x \+ (\d+)\)° and the arc it intercepts measures \((\d+)x − (\d+)\)°/, (a, b, c, d) => whole((2 * b + d) / (c - 2 * a))],
    // same arc → equal angles
    [/Angle ACB measures \((\d+)x − (\d+)\)° and angle ADB measures \((\d+)x \+ (\d+)\)°/, (a, b, c, d) => whole((b + d) / (a - c))],
    // right angle at R → the other two add to 90
    [/Angle P measures \((\d+)x \+ (\d+)\)° and angle Q measures \((\d+)x \+ (\d+)\)°/, (a, b, c, d) => whole((90 - b - d) / (a + c))],
    // opposite angles of a cyclic quadrilateral add to 180
    [/Angle A measures \((\d+)x \+ (\d+)\)° and angle C measures \((\d+)x − (\d+)\)°\. What is the measure of angle A/, (a, b, c, d) => whole(a * ((180 - b + d) / (a + c)) + b)],
    [/arc AB measures (\d+)°, arc BC measures (\d+)°, and arc CA is the rest.*angle ABC/, (ab, bc) => whole((360 - ab - bc) / 2)],
    [/central angle AOB measures (\d+)°\. Point D is on the minor arc AB/, (c) => whole((360 - c) / 2)],
    [/AC = (\d+) cm and BC = (\d+) cm\. What is the radius/, (x, y) => whole(Math.hypot(x, y) / 2)],
  ], p),

  'geo-circle-theorems': (item, p) => solveBy([
    [/radius OB is (\d+) cm and AB = (\d+) cm\. What is the length of OA/, (r, t) => whole(Math.hypot(r, t))],
    [/radius OB is (\d+) cm and OA = (\d+) cm\. What is the length of AB/, (r, h) => whole(Math.sqrt(h * h - r * r))],
    [/PA = (\d+)x \+ (\d+) and PB = (\d+)\. What is the value of x/, (a, b, c) => whole((c - b) / a)],
    [/central angle AOB measures (\d+)°\. What is the measure of major arc AB/, (a) => 360 - a],
    [/radius of (\d+) cm\. A chord of the circle is (\d+) cm from the centre\. How long is the chord/, (r, d) => whole(2 * Math.sqrt(r * r - d * d))],
    [/radius of (\d+) cm\. A chord of the circle is (\d+) cm long\. How far is the chord from the centre/, (r, c) => whole(Math.sqrt(r * r - (c / 2) ** 2))],
    [/AE = (\d+), EB = (\d+) and CE = (\d+)\. What is the length of ED/, (a, b, c) => whole(a * b / c)],
    [/PA = (\d+)x \+ (\d+) and PB = (\d+)x − (\d+)\. What is the length of PA/, (a, b, c, d) => whole(a * ((b + d) / (c - a)) + b)],
    // r² + t² = (r + e)²  →  r = (t² − e²) / 2e
    [/with AB = (\d+) cm\. Segment OA crosses the circle at point C, and AC = (\d+) cm\. What is the radius/, (t, e) => whole((t * t - e * e) / (2 * e))],
    [/AE = (\d+), EB = (\d+) and CE = (\d+)\. What is the length of the whole chord CD/, (a, b, c) => whole(c + a * b / c)],
    [/chord of a circle is (\d+) cm long and is (\d+) cm from the centre of the circle\. What is the diameter/, (c, d) => whole(2 * Math.hypot(c / 2, d))],
    [/AP = (\d+), BQ = (\d+) and CR = (\d+)\. What is the perimeter/, (a, b, c) => 2 * (a + b + c)],
  ], p),

  'geo-similar-triangle-theorems': (item, p) => solveBy([
    [/∠A = (\d+)° and ∠B = (\d+)°\. In △DEF, ∠D = (\d+)° and ∠[EF] = (\d+)°/, (a, b, d, e) => {
      const one = [a, b, 180 - a - b].sort().join();
      const two = [d, e, 180 - d - e].sort().join();
      return one === two ? 'Yes, by AA Similarity' : 'No, they are not similar';
    }],
    [/side lengths of (\d+), (\d+) and (\d+)\. △DEF has side lengths of (\d+), (\d+) and (\d+)/, (a, b, c, d, e, f) => {
      const s = [a, b, c].sort((x, y) => x - y), t = [d, e, f].sort((x, y) => x - y);
      return proportional(s, t) ? 'Yes, by SSS Similarity' : 'No, they are not similar';
    }],
    [/AB = (\d+), AC = (\d+) and ∠A = (\d+)°\. In △DEF, DE = (\d+), DF = (\d+) and ∠D = (\d+)°/, (ab, ac, angA, de, df, angD) => {
      if (angA !== angD) throw new Error('the included angles differ');
      // Build both triangles in full and compare all three sides.
      return proportional(sasSides(ab, ac, angA), sasSides(de, df, angD)) ? 'Yes, by SAS Similarity' : 'No, they are not similar';
    }],
    [/△(\w{3}) ~ △(\w{3})\. (\w\w) = (\d+), (\w\w) = (\d+) and (\w\w) = (\d+)\. What is the length of (\w\w)\?/, (t1, t2, s1, v1, s2, v2, s3, v3, ask) => {
      // A side's partner sits at the same places in the other triangle's name.
      const places = (t, s) => [...s].map((ch) => t.indexOf(ch)).sort().join();
      const known = [[s1, v1], [s2, v2]];
      const scaleFrom = known.find(([s]) => places(t1, s) === places(t2, s3));
      const other = known.find(([s]) => places(t1, s) === places(t2, ask));
      if (!scaleFrom || !other || scaleFrom === other) throw new Error('sides do not pair up');
      return whole(other[1] * v3 / scaleFrom[1]);
    }],
    [/AD = (\d+), DB = (\d+) and AE = (\d+)\. What is the length of EC/, (ad, db, ae) => whole(db * ae / ad)],
    [/AD = (\d+), DB = (\d+) and AE = (\d+)\. What is the length of the whole side AC/, (ad, db, ae) => whole(ae + db * ae / ad)],
    [/AD = (\d+), DB = (\d+) and BC = (\d+)\. What is the length of DE/, (ad, db, bc) => whole(bc * ad / (ad + db))],
    [/AD = (\d+), DB = (\d+), AE = (\d+) and EC = (\d+)\. Must DE be parallel to BC/, (ad, db, ae, ec) => {
      if (ad * ae === db * ec) throw new Error('the upside-down ratio is also true');
      return ad * ec === db * ae ? 'Yes, because AD/DB = AE/EC' : 'No, because AD/DB ≠ AE/EC';
    }],
  ], p),

  'geo-similarity-proofs': (item, p, opts) => {
    if (/What reason justifies step/.test(p)) {
      const n = Number(p.match(/justifies step (\d)/)[1]);
      const step = stepText(p, n);
      if (/^△AEB ~ △CED\.$/.test(step)) {
        // Two pairs of sides in the same ratio around congruent vertical angles.
        const [ae, ce, be, de] = p.match(/AE = (\d+), CE = (\d+), BE = (\d+) and DE = (\d+)/).slice(1).map(Number);
        if (ae * de !== be * ce) throw new Error('sides are not proportional');
        return 'SAS Similarity';
      }
      if (!SIM_REASONS[step]) throw new Error(`no reason typed for: ${step}`);
      return SIM_REASONS[step];
    }
    if (/Which statement belongs in step 3/.test(p)) return '∠DAE ≅ ∠BAC';   // the shared angle at A
    if (/Which statement belongs in step 2/.test(p)) return '∠BAE ≅ ∠CDE';   // transversal AD meets the parallels at A and D
    if (/correct order/.test(p)) {
      // The vertex of each angle is its middle letter; congruent angles pair the vertices.
      const map = {};
      for (const m of p.matchAll(/∠[A-E]([A-E])[A-E] ≅ ∠[A-E]([A-E])[A-E]/g)) map[m[1]] = m[2];
      const good = opts.filter((o) => {
        const [, s, t] = o.match(/^△([A-E]{3}) ~ △([A-E]{3})$/);
        const pairs = [...s].map((ch, i) => [ch, t[i]]);
        return Object.entries(map).every(([from, to]) => pairs.some(([x, y]) => x === from && y === to));
      });
      if (good.length !== 1) throw new Error(`${good.length} correct orders`);
      return good[0];
    }
    if (/right angle at C/.test(p)) return trueProportion(opts, CONFIG.altitude);
    if (/DE ∥ BC/.test(p)) return trueProportion(opts, CONFIG.nested);
    if (/△ABE ~ △DCE/.test(p)) return trueProportion(opts, CONFIG.crossing);
    throw new Error(`no re-solver rule matches: ${p}`);
  },

  'geo-volume-prisms-cylinders': (item, p) => solveBy([
    [/right triangles with legs of (\d+) \w+ and (\d+) \w+\. The distance between the two bases \(the height of the prism\) is (\d+)/, (a, b, h) => whole(a * b / 2 * h)],
    [/cylinder has a radius of (\d+) \w+ and a height of (\d+) \w+\. What is its volume, in \w+³, in terms of π/, (r, h) => piS(r * r * h)],
    [/regular \w+ with an area of (\d+) \w+²\. The height of the prism is (\d+)/, (B, h) => B * h],
    [/cylinder has a diameter of (\d+) \w+ and a height of (\d+) \w+\. What is its volume, in \w+³, in terms of π/, (d, h) => piS(d * d * h, 4)],
    [/cylinder has a radius of (\d+) \w+ and a height of (\d+) \w+\. Use 3\.14 for π\. What is its volume/, (r, h) => d2(PI * r * r * h)],
    [/volume of (\d+) \w+³\. Its base is (\d+) \w+ by (\d+) \w+\. What is its height/, (v, l, w) => whole(v / (l * w))],
    [/cylinder has a volume of (\d*)π \w+³ and a radius of (\d+) \w+\. What is its height/, (v, r) => whole(v / (r * r))],
    [/triangle with a base of (\d+) \w+ and a height of (\d+) \w+\. The prism is (\d+) \w+ long/, (b, ht, len) => whole(b * ht / 2 * len)],
    [/bottom cylinder has a radius of (\d+) cm and a height of (\d+) cm; the top cylinder has a radius of (\d+) cm and a height of (\d+) cm/, (R, H, r, h) => piS(R * R * H + r * r * h)],
    [/block of wood is (\d+) cm long, (\d+) cm wide and (\d+) cm tall\. A cylindrical hole with a radius of (\d+) cm/, (l, w, h, r) => d2(l * w * h - PI * r * r * h)],
    [/cylinder has a volume of (\d*)π \w+³ and a height of (\d+) \w+\. What is its radius/, (v, h) => whole(Math.sqrt(v / h))],
    [/rectangular prism (\d+) m long, (\d+) m wide and (\d+) m tall.*has a base of (\d+) m and a height of (\d+) m.*full (\d+) m length/, (l, w, h, b, t, run) => whole(l * w * h + b * t / 2 * run)],
  ], p),

  'geo-volume-pyramids-cones-spheres': (item, p) => solveBy([
    [/square base with sides of (\d+) \w+ and a height of (\d+) \w+\. What is its volume/, (s, h) => whole(s * s * h / 3)],
    [/cone has a radius of (\d+) \w+ and a height of (\d+) \w+\. What is its volume, in \w+³, in terms of π/, (r, h) => piS(r * r * h, 3)],
    [/^A sphere has a radius of (\d+) \w+\. What is its volume/, (r) => piS(4 * r * r * r, 3)],
    [/rectangular base (\d+) \w+ by (\d+) \w+ and a height of (\d+) \w+\. What is its volume/, (l, w, h) => whole(l * w * h / 3)],
    [/cone has a diameter of (\d+) \w+ and a height of (\d+) \w+\. What is its volume/, (d, h) => piS(d * d * h, 12)],
    [/hemisphere \(half of a sphere\) has a radius of (\d+)/, (r) => piS(2 * r * r * r, 3)],
    [/cone has a radius of (\d+) \w+ and a height of (\d+) \w+\. Use 3\.14 for π\. What is its volume/, (r, h) => d2(PI * r * r * h / 3)],
    [/square base has a volume of (\d+) \w+³\. Each side of the base is (\d+) \w+\. What is the height/, (v, s) => whole(3 * v / (s * s))],
    [/cone has a radius of (\d+) \w+ and a slant height of (\d+) \w+\. What is its volume/, (r, l) => piS(r * r * Number(whole(Math.sqrt(l * l - r * r))), 3)],
    [/square base with sides of (\d+) \w+\. Its slant height \(.*\) is (\d+) \w+\. What is the volume/, (s, l) => whole(s * s * Math.sqrt(l * l - (s / 2) ** 2) / 3)],
    [/radius is (\d+) cm and the cone is (\d+) cm tall/, (r, h) => piS(r * r * h + 2 * r * r * r, 3)],
    [/sphere has a volume of (\d*)π \w+³\. What is its radius/, (v) => whole(Math.cbrt(3 * v / 4))],
  ], p),

  'geo-surface-area-prisms-cylinders': (item, p) => solveBy([
    [/rectangular prism is (\d+) \w+ long, (\d+) \w+ wide and (\d+) \w+ tall\. What is its total surface area/, (l, w, h) => 2 * l * w + 2 * l * h + 2 * w * h],
    [/rectangular prism is (\d+) \w+ long, (\d+) \w+ wide and (\d+) \w+ tall\. What is its lateral surface area/, (l, w, h) => (l + w + l + w) * h],
    [/cylinder has a radius of (\d+) \w+ and a height of (\d+) \w+\. What is its total surface area, in \w+², in terms of π/, (r, h) => piS(2 * r * r + 2 * r * h)],
    [/cylinder has a radius of (\d+) \w+ and a height of (\d+) \w+\. What is its lateral surface area/, (r, h) => piS(2 * r * h)],
    [/right triangles with sides of (\d+) \w+, (\d+) \w+ and (\d+) \w+\. The prism is (\d+) \w+ long/, (x, y, z, len) => {
      const [a, b, c] = [x, y, z].sort((m, n) => m - n);
      if (a * a + b * b !== c * c) throw new Error('not a right triangle');
      return a * b + (a + b + c) * len;
    }],
    [/cylinder has a diameter of (\d+) \w+ and a height of (\d+) \w+\. What is its total surface area/, (d, h) => piS(d * d + 2 * d * h, 2)],
    [/cylinder has a radius of (\d+) \w+ and a height of (\d+) \w+\. Use 3\.14 for π\. What is its total surface area/, (r, h) => d2(2 * PI * r * r + 2 * PI * r * h)],
    [/open-top box .* is (\d+) cm long, (\d+) cm wide and (\d+) cm tall/, (l, w, h) => l * w + 2 * l * h + 2 * w * h],
    [/right triangles with legs of (\d+) \w+ and (\d+) \w+\. The prism is (\d+) \w+ long\. What is its total surface area/, (a, b, len) => whole(a * b + (a + b + Math.hypot(a, b)) * len)],
    [/can with no lid has a radius of (\d+) cm and a height of (\d+) cm/, (r, h) => piS(r * r + 2 * r * h)],
    [/cylinder has a radius of (\d+) \w+ and a total surface area of (\d*)π \w+²\. What is its height/, (r, s) => whole((s - 2 * r * r) / (2 * r))],
    [/tank has a radius of (\d+) m and a height of (\d+) m\. The curved side and the top/, (r, h) => d2(PI * r * r + 2 * PI * r * h)],
  ], p),

  'geo-surface-area-pyramids-cones-spheres': (item, p) => solveBy([
    [/base with sides of (\d+) \w+ and a slant height of (\d+) \w+\. What is its total surface area/, (s, l) => s * s + 4 * (s * l / 2)],
    [/base with sides of (\d+) \w+ and a slant height of (\d+) \w+\. What is its lateral surface area/, (s, l) => 4 * (s * l / 2)],
    [/^A sphere has a radius of (\d+) \w+\. What is its surface area, in \w+², in terms of π/, (r) => piS(4 * r * r)],
    [/cone has a radius of (\d+) \w+ and a slant height of (\d+) \w+\. What is its total surface area/, (r, l) => piS(r * r + r * l)],
    [/cone has a diameter of (\d+) \w+ and a slant height of (\d+) \w+\. What is its total surface area/, (d, l) => piS(d * d + 2 * d * l, 4)],
    [/solid hemisphere \(.*\) has a radius of (\d+)/, (r) => piS(2 * r * r + r * r)],
    [/^A sphere has a radius of (\d+) \w+\. Use 3\.14 for π\. What is its surface area/, (r) => d2(4 * PI * r * r)],
    [/base with sides of (\d+) \w+ and a total surface area of (\d+) \w+²\. What is its slant height/, (s, sa) => whole((sa - s * s) / (2 * s))],
    [/base with sides of (\d+) \w+ and a height of (\d+) \w+ \(measured straight up/, (s, h) => whole(s * s + 2 * s * Math.hypot(s / 2, h))],
    [/cone has a radius of (\d+) \w+ and a height of (\d+) \w+\. What is its total surface area/, (r, h) => piS(r * r + r * Number(whole(Math.hypot(r, h))))],
    [/sphere has a surface area of (\d*)π \w+²\. What is its volume/, (s) => { const r = Number(whole(Math.sqrt(s / 4))); return piS(4 * r * r * r, 3); }],
    [/party hat is a cone with no base\. Its radius is (\d+) cm and its height is (\d+) cm/, (r, h) => piS(r * Number(whole(Math.hypot(r, h))))],
  ], p),
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items — Geometry B', () => {
  test('the bank is for the geometry course, eleven skills, twelve items each', () => {
    expect(bank.COURSE_ID).toBe('geometry');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES).toHaveLength(11);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`geo-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const set = lettering(item.prompt);
    const prompt = norm(item.prompt, set);
    const options = (item.options || []).map((o) => norm(o.text, set));
    const expected = RESOLVE[item.skillId](item, prompt, options);
    expect(norm(item.answer.value, set)).toBe(String(expected));
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(norm(keyed.text, set)).toBe(String(expected));
    }
  });

  test('a typed answer is one number; anything with π, words or symbols is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') expect(it.answer.value).toMatch(/^\d+(\.\d{1,2})?$/);
      else expect(it.options).toHaveLength(4);
    }
  });

  test('a decimal answer is asked for as a decimal, with 3.14 named', () => {
    for (const it of ALL) {
      if (/^\d+\.\d+$/.test(it.answer.value)) {
        expect(it.prompt).toMatch(/Use 3\.14 for π/);
        expect(it.prompt).toMatch(/as a decimal/);
      }
    }
  });

  test('no prompt leans on a picture', () => {
    for (const it of ALL) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
    }
  });

  test('the key is not parked on one letter', () => {
    for (const [skill, items] of Object.entries(ITEMS)) {
      const letters = new Set(items.filter((i) => i.options).map((i) => i.correctOption));
      if (items.filter((i) => i.options).length >= 4) expect([skill, letters.size >= 2]).toEqual([skill, true]);
    }
  });

  test('the hand-typed coordinates really are the shapes the prompts describe', () => {
    const { crossing: X, nested: N, altitude: T } = CONFIG;
    const cross = (P, Q, R, S) => (Q[0] - P[0]) * (S[1] - R[1]) - (Q[1] - P[1]) * (S[0] - R[0]);
    expect(cross(X.A, X.B, X.C, X.D)).toBeCloseTo(0);          // AB ∥ CD
    expect(cross(X.A, X.D, X.A, X.E)).toBeCloseTo(0);          // E on AD
    expect(cross(X.B, X.C, X.B, X.E)).toBeCloseTo(0);          // E on BC
    expect(cross(N.D, N.E, N.B, N.C)).toBeCloseTo(0);          // DE ∥ BC
    expect(cross(T.A, T.B, T.A, T.D)).toBeCloseTo(0);          // D on AB
    expect((T.D[0] - T.C[0]) * (T.B[0] - T.A[0]) + (T.D[1] - T.C[1]) * (T.B[1] - T.A[1])).toBeCloseTo(0);   // CD ⟂ AB
  });
});
