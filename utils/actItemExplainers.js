// utils/actItemExplainers.js
//
// Worked solutions for the act-enhanced bank, derived per item rather than
// written per item.
//
// The drop shipped 1,195 items with no explanation at all. utils/actReview.js
// reads that field into the tutor's prompt as
//     WORKED SOLUTION (for YOUR reference — never just read it aloud)
// and prints "(none stored)" when it is missing. Review still functions without
// it: the tutor is told to solve the question itself before saying anything
// about right or wrong. What is lost is the DISTRACTOR DIAGNOSIS — "C is what
// you get if you average the two speeds instead of dividing total distance by
// total time" — which is the difference between review that corrects and review
// that teaches.
//
// HOW THIS WORKS
// The drop is rigidly templated: 1,195 items over 324 prompt shapes, each shape
// one sentence with the numbers swapped. So instead of 1,195 hand-written
// paragraphs, each shape gets one `solve` that reads the numbers back out of
// the prompt and returns:
//   - the answer it derives independently,
//   - the worked steps, in that item's own numbers,
//   - a TRAPS table: value -> the specific wrong move that produces it.
// `explainItem` then walks the item's real options and labels any that match a
// trap, so every explanation talks about the four choices actually on screen.
//
// The derivation is also an AUDIT. Every explanation is built by solving the
// item from scratch, so a disagreement with the stored key is a mis-keyed item
// caught before a student meets it — and the caller refuses to write an
// explanation for an item it cannot independently confirm.

/**
 * Pull a comparable number out of an option's text.
 *
 * The bank writes the same quantity several ways — "$25.60", "36.7%", "52°",
 * "4/3 hours", "138" — because the unit belongs to the question, not to the
 * arithmetic. Strip the dressing and read the number, so a derived 1.333 can be
 * recognised in a choice written "4/3 hours". Exact forms that are not numbers
 * at all ("9π", "4√6", "x + 4") fall through to a string comparison instead.
 */
const UNIT_WORDS = /\s*(square\s+units|real\s+solutions?|hours?|minutes?|seconds?|miles?|mph|feet|foot|ft|inches|inch|cm|meters?|students?|units?|degrees?)\s*$/i;

function stripUnits(text) {
  return String(text)
    .trim()
    .replace(/[$,]/g, '')
    .replace(UNIT_WORDS, '')
    .replace(/[%°]\s*$/, '')
    .trim();
}

function parseNum(text) {
  if (text == null) return null;
  const cleaned = stripUnits(text);
  const asFraction = /^(-?\d+)\s*\/\s*(\d+)$/.exec(cleaned);
  if (asFraction) {
    const d = Number(asFraction[2]);
    return d === 0 ? null : Number(asFraction[1]) / d;
  }
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Do a computed value and an option agree, allowing for the item's rounding? */
function sameValue(computed, optionText) {
  if (computed == null || optionText == null) return false;
  const optNum = parseNum(optionText);

  if (typeof computed === 'string') {
    // An exact form: compare as text, ignoring spacing and any trailing unit.
    const norm = (t) => stripUnits(t).replace(/\s+/g, '');
    if (norm(computed) === norm(optionText)) return true;
    // A string answer may still be numeric ("4/3"), in which case fall through.
    const asNum = parseNum(computed);
    if (asNum == null || optNum == null) return false;
    return Math.abs(asNum - optNum) <= 1e-9 * Math.max(1, Math.abs(optNum));
  }

  if (optNum == null) return false;
  // Options are rounded to whatever the prompt asked for, so match to the
  // option's own precision rather than to full float equality. A fraction is
  // exact, so it gets no slack beyond floating point.
  const cleaned = stripUnits(optionText);
  if (/^-?\d+\s*\/\s*\d+$/.test(cleaned)) {
    return Math.abs(computed - optNum) <= 1e-9 * Math.max(1, Math.abs(optNum));
  }
  const decimals = (cleaned.split('.')[1] || '').length;
  const tol = Math.max(10 ** -decimals / 2 + 1e-9, Math.abs(optNum) * 1e-9);
  return Math.abs(computed - optNum) <= tol;
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
/** Read a number out of a PROMPT, where the bank also writes fractions ("275/2"). */
const num = (t) => {
  const f = /^(-?\d+)\/(\d+)$/.exec(String(t).trim());
  return f ? Number(f[1]) / Number(f[2]) : Number(t);
};
/** Render a rational exactly the way the choices do: "5/2", or "3" when whole. */
const exact = (n, d) => {
  if (d === 0) return null;
  const sign = (n < 0) !== (d < 0) ? -1 : 1;
  const a = Math.abs(n);
  const b = Math.abs(d);
  const g = gcd(a, b) || 1;
  const nn = (a / g) * sign;
  const dd = b / g;
  return dd === 1 ? `${nn}` : `${nn}/${dd}`;
};
/** Exact rational from a float that is known to be rational with small denom. */
const exactFrom = (x, maxDen = 10000) => {
  for (let d = 1; d <= maxDen; d++) {
    const n = x * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) return exact(Math.round(n), d);
  }
  return null;
};
const pow = (base, e) => (e === 1 ? 'x' : `x^${e}`);
/**
 * Write a multiple of π the way the choices do: "64π/3", not "64/3π", and a
 * bare "π" rather than "1π".
 */
const piText = (value) => {
  const f = exactFrom(value);
  if (f == null) return `${round(value, 6)}π`;
  const [n, d] = f.split('/');
  const numer = n === '1' ? 'π' : n === '-1' ? '-π' : `${n}π`;
  return d ? `${numer}/${d}` : numer;
};
/** √n in lowest terms: {k, rest, text} where n = k²·rest. */
const simplifyRadical = (n) => {
  let k = 1;
  let rest = n;
  for (let i = 2; i * i <= rest; i++) {
    while (rest % (i * i) === 0) { k *= i; rest /= i * i; }
  }
  return { k, rest, text: rest === 1 ? `${k}` : (k === 1 ? `√${rest}` : `${k}√${rest}`) };
};
const money = (x) => `$${x.toFixed(2)}`;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n, d) => { const g = gcd(n, d) || 1; return `${n / g}/${d / g}`; };
const nth = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ── The registry ────────────────────────────────────────────────────────────
// One entry per prompt shape. `match` must anchor tightly enough that it cannot
// fire on a different shape: a loose regex that half-matches would produce a
// confident, wrong worked solution, which is worse than none at all.
const EXPLAINERS = [
  {
    id: 'unit-rate',
    match: /^(\d+) identical (\w+) cost \$([\d.]+)\. At the same rate, what is the cost of (\d+) \2\?/,
    solve: (m) => {
      const [n1, thing, cost, n2] = [Number(m[1]), m[2], Number(m[3]), Number(m[4])];
      const rate = cost / n1;
      return {
        answer: round(n2 * rate, 2),
        steps: `Find the unit rate first: ${money(cost)} ÷ ${n1} = ${money(rate)} per ${thing.replace(/s$/, '')}. Then scale it up: ${n2} × ${money(rate)} = ${money(n2 * rate)}.`,
        traps: [
          [round(cost / n2 * n1, 2), `divides by the NEW count instead of the given one (${money(cost)} ÷ ${n2} × ${n1})`],
          [cost, 'leaves the original total unchanged, as though the count did not matter'],
          [cost + n2, `adds the two numbers (${cost} + ${n2}) instead of scaling by the rate`],
        ],
      };
    },
  },
  {
    id: 'mixture-problems',
    match: /^([\d.]+) liters of a ([\d.]+)% (\w+) solution are mixed with ([\d.]+) liters of a ([\d.]+)%/,
    solve: (m) => {
      const [v1, p1, v2, p2] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])];
      const solute = v1 * p1 / 100 + v2 * p2 / 100;
      const total = v1 + v2;
      return {
        answer: round(100 * solute / total, 1),
        steps: `Track the SOLUTE, not the percents. ${v1} × ${p1}% = ${round(v1 * p1 / 100, 2)} L and ${v2} × ${p2}% = ${round(v2 * p2 / 100, 2)} L, so ${round(solute, 2)} L of solute sits in ${total} L of mixture: ${round(solute, 2)} ÷ ${total} = ${round(100 * solute / total, 1)}%.`,
        traps: [
          [round(solute, 1), 'reports the LITERS of solute as if that number were the percent'],
          [round((p1 + p2) / 2, 1), `averages the two concentrations (${p1}% and ${p2}%), which is only right when the volumes are equal`],
          [p1 + p2, 'adds the two concentrations'],
        ],
      };
    },
  },
  {
    id: 'systems-word-problems',
    match: /^Adult tickets cost \$([\d.]+) and child tickets cost \$([\d.]+)\. A group bought (\d+) tickets for a total of \$([\d.]+)\. How many adult tickets/,
    solve: (m) => {
      const [a, c, n, total] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      const adults = (total - c * n) / (a - c);
      return {
        answer: round(adults, 4),
        steps: `Let x be the adult tickets, so ${n} − x are child tickets: ${a}x + ${c}(${n} − x) = ${total}. That gives ${a}x + ${c * n} − ${c}x = ${total}, so ${a - c}x = ${total - c * n} and x = ${round(adults, 4)}.`,
        traps: [
          [round(n - adults, 4), 'solves correctly and then reports the CHILD tickets — the commonest slip on this type is answering the wrong half'],
          [round(total / a, 4), 'divides the total by the adult price alone, ignoring that the group is mixed'],
          [round(total / c, 4), 'divides the total by the child price alone'],
        ],
      };
    },
  },
  {
    id: 'arithmetic-series',
    match: /^What is the sum of the first (\d+) terms of the arithmetic sequence with first term (-?[\d.]+) and common difference (-?[\d.]+)\?/,
    solve: (m) => {
      const [n, a, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const last = a + (n - 1) * d;
      return {
        answer: round(n / 2 * (2 * a + (n - 1) * d), 4),
        steps: `The ${nth(n)} term is ${a} + (${n} − 1)(${d}) = ${last}. Sum an arithmetic series by averaging the ends and multiplying by how many there are: (${a} + ${last}) ÷ 2 × ${n} = ${round(n / 2 * (a + last), 4)}.`,
        traps: [
          [round(last, 4), `gives the ${nth(n)} TERM instead of the sum of the terms`],
          [round(n * last, 4), 'multiplies the last term by n, as though every term were the largest'],
          [round(n * a, 4), 'multiplies the first term by n, as though every term were the smallest'],
        ],
      };
    },
  },
  {
    id: 'average-speed',
    match: /^A driver travels ([\d.]+) miles at ([\d.]+) mph, then ([\d.]+) miles at ([\d.]+) mph/,
    solve: (m) => {
      const [d1, s1, d2, s2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      const t = d1 / s1 + d2 / s2;
      return {
        answer: round((d1 + d2) / t, 1),
        steps: `Average speed is total distance ÷ total TIME, never the average of the speeds. The legs take ${d1} ÷ ${s1} = ${round(d1 / s1, 2)} h and ${d2} ÷ ${s2} = ${round(d2 / s2, 2)} h, so ${d1 + d2} miles ÷ ${round(t, 2)} h = ${round((d1 + d2) / t, 1)} mph.`,
        traps: [
          [round(t, 1), 'stops at the total time and reports the hours'],
          [round((s1 + s2) / 2, 1), `averages the two speeds (${s1} and ${s2}) — only correct if equal TIME were spent at each, and here the times differ`],
          [d1 + d2, 'reports the total distance'],
        ],
      };
    },
  },
  {
    id: 'geometric-sequences',
    match: /^In a geometric sequence, the first term is (-?[\d.]+) and the common ratio is (-?[\d.]+)\. What is the (\d+)(?:st|nd|rd|th) term\?/,
    solve: (m) => {
      const [a, r, n] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: round(a * r ** (n - 1), 6),
        steps: `The ${nth(n)} term is a·r^(n−1), not a·r^n — there are only ${n - 1} steps between the 1st term and the ${nth(n)}. So ${a} × ${r}^${n - 1} = ${round(a * r ** (n - 1), 6)}.`,
        traps: [
          [round(a * r ** n, 6), `uses the exponent n instead of n−1, which lands on the ${nth(n + 1)} term`],
          [round(a * r ** (n - 2), 6), `uses n−2, landing on the ${nth(n - 1)} term`],
          [round(a + r * n, 6), 'adds instead of multiplying, treating it as an arithmetic sequence'],
        ],
      };
    },
  },
  {
    id: 'reverse-percent',
    match: /^After a ([\d.]+)% discount, a (\w+) costs \$([\d.]+)\. What was the original price\?/,
    solve: (m) => {
      const [pct, thing, paid] = [Number(m[1]), m[2], Number(m[3])];
      const orig = paid / (1 - pct / 100);
      return {
        answer: round(orig, 2),
        steps: `${money(paid)} is not the discount, it is what is LEFT — ${100 - pct}% of the original. So divide rather than multiply: ${money(paid)} ÷ ${(1 - pct / 100).toFixed(2)} = ${money(round(orig, 2))}.`,
        traps: [
          [round(paid * (1 + pct / 100), 2), `adds ${pct}% back onto the sale price, which is a smaller base than the original and so undershoots`],
          [round(paid * (1 - pct / 100), 2), 'takes the discount off again, going the wrong direction entirely'],
          [round(paid / (pct / 100), 2), `divides by ${pct}% instead of by ${100 - pct}%`],
        ],
      };
    },
  },
  {
    id: 'weighted-average',
    match: /homework counts for ([\d.]+)% of the grade and the final exam counts for ([\d.]+)%\. A student earns ([\d.]+) on homework and ([\d.]+) on the final/,
    solve: (m) => {
      const [w1, w2, s1, s2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      return {
        answer: round((w1 * s1 + w2 * s2) / 100, 2),
        steps: `Weight each score by its share: ${s1} × ${w1 / 100} = ${round(s1 * w1 / 100, 2)} and ${s2} × ${w2 / 100} = ${round(s2 * w2 / 100, 2)}, which total ${round((w1 * s1 + w2 * s2) / 100, 2)}.`,
        traps: [
          [round((s1 + s2) / 2, 2), `averages the two scores evenly, ignoring that homework carries ${w1}% and the exam ${w2}%`],
          [round((w2 * s1 + w1 * s2) / 100, 2), 'swaps the weights, attaching each to the wrong score'],
        ],
      };
    },
  },
  {
    id: 'triangle-angles',
    match: /^Two angles of a triangle measure ([\d.]+)° and ([\d.]+)°\. What is the measure of the third angle\?/,
    solve: (m) => {
      const [a, b] = [Number(m[1]), Number(m[2])];
      return {
        answer: 180 - a - b,
        steps: `The three angles of a triangle total 180°, so the third is 180 − ${a} − ${b} = ${180 - a - b}°.`,
        traps: [
          [a + b, 'adds the two given angles and stops, without subtracting from 180'],
          [90 - a - b, 'subtracts from 90° instead of 180°'],
          [360 - a - b, "subtracts from 360°, which is the angle sum of a quadrilateral"],
        ],
      };
    },
  },
  {
    id: 'counting-principle',
    match: /offers (\d+) kinds of (\w+), (\d+) kinds of (\w+), and (\d+) kinds of (\w+)\. How many different/,
    solve: (m) => {
      const [a, b, c] = [Number(m[1]), Number(m[3]), Number(m[5])];
      return {
        answer: a * b * c,
        steps: `Independent choices MULTIPLY: ${a} × ${b} × ${c} = ${a * b * c}. Every one of the ${a} breads can pair with every one of the ${b} meats, and each of those with every one of the ${c} cheeses.`,
        traps: [
          [a + b + c, 'adds the three counts instead of multiplying — that counts how many ingredients exist, not how many sandwiches'],
          [a * b, 'multiplies only the first two categories'],
          [b * c, 'multiplies only the last two categories'],
        ],
      };
    },
  },
  {
    id: 'compound-probability',
    match: /^A jar holds (\d+) (\w+) and (\d+) (\w+) chips\. Two chips are drawn at random without replacement\. What is the probability that both are (\w+)\?/,
    solve: (m) => {
      const [r, rc, b, bc, want] = [Number(m[1]), m[2], Number(m[3]), m[4], m[5]];
      const k = want === rc ? r : b;
      const total = r + b;
      const num = k * (k - 1);
      const den = total * (total - 1);
      return {
        answer: frac(num, den),
        steps: `Without replacement the jar changes between draws. First draw: ${k}/${total}. Second: only ${k - 1} of the ${want} chips are left among ${total - 1}. So ${k}/${total} × ${k - 1}/${total - 1} = ${frac(num, den)}.`,
        traps: [
          [frac(k * k, total * total), 'treats the draws as WITH replacement, keeping both denominators at the original total'],
          [frac(k, total), 'gives the probability of just the first draw'],
          [frac(2 * k, 2 * total), 'doubles top and bottom, which changes nothing and is the same single-draw probability'],
        ],
      };
    },
  },
  {
    id: 'fractions-of-a-quantity',
    match: /^A class of (\d+) students is going on a field trip\. (\d+)\/(\d+) of the students (\w+[\w\s]*?)\. How many students/,
    solve: (m) => {
      const [total, n, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: total * n / d,
        steps: `"${n}/${d} of" means multiply: ${total} × ${n}/${d} = ${total * n / d}. One ${d}th of ${total} is ${total / d}, and ${n} of those is ${total * n / d}.`,
        traps: [
          [total * d / n, 'flips the fraction and multiplies by its reciprocal'],
          [total - total * n / d, 'finds the students who do NOT, which is the other part of the class'],
          [total / d, 'stops after one part instead of taking all ' + n],
        ],
      };
    },
  },
  {
    id: 'similar-triangles',
    match: /Side AB measures ([\d.]+) and its corresponding side DE measures ([\d.]+)\. If side BC measures ([\d.]+), what is the length of side EF\?/,
    solve: (m) => {
      const [ab, de, bc] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const k = de / ab;
      return {
        answer: round(bc * k, 4),
        steps: `Similar figures scale by a constant factor. AB → DE scales by ${de} ÷ ${ab} = ${round(k, 4)}, so EF = ${bc} × ${round(k, 4)} = ${round(bc * k, 4)}.`,
        traps: [
          [round(bc / k, 4), 'applies the scale factor upside down, shrinking instead of enlarging'],
          [round(bc + (de - ab), 4), `adds the DIFFERENCE (${de} − ${ab}) instead of multiplying by the ratio — similarity scales, it does not shift`],
        ],
      };
    },
  },
  {
    id: 'scale-factor-area',
    match: /^Two similar figures have a scale factor of (\d+):(\d+)\. The smaller figure has an area of ([\d.]+) square units\. What is the area of the larger/,
    solve: (m) => {
      const [a, b, area] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const k = b / a;
      return {
        answer: round(area * k * k, 4),
        steps: `Lengths scale by ${a}:${b}, but AREA scales by the square of that: ${k}² = ${round(k * k, 4)}. So ${area} × ${round(k * k, 4)} = ${round(area * k * k, 4)} square units.`,
        traps: [
          [round(area * k, 4), 'scales the area by the LENGTH factor, forgetting that area is two-dimensional'],
          [round(area * k ** 3, 4), 'cubes the factor, which is how VOLUME scales, not area'],
          [round(area / (k * k), 4), 'scales down instead of up'],
        ],
      };
    },
  },
  {
    id: 'area-parallelogram',
    match: /^A parallelogram has a base of ([\d.]+) and a height of ([\d.]+)\. What is its area\?/,
    solve: (m) => {
      const [b, h] = [Number(m[1]), Number(m[2])];
      return {
        answer: b * h,
        steps: `A parallelogram's area is base × height: ${b} × ${h} = ${b * h}. The slanted side is not the height — the height is the perpendicular distance.`,
        traps: [
          [b * h / 2, 'halves the product, which is the TRIANGLE formula'],
          [2 * (b + h), 'computes a perimeter-style sum instead of an area'],
          [b + h, 'adds the two dimensions'],
        ],
      };
    },
  },
  {
    id: 'area-triangle',
    match: /^A triangle has a base of ([\d.]+) and a height of ([\d.]+)\. What is its area\?/,
    solve: (m) => {
      const [b, h] = [Number(m[1]), Number(m[2])];
      return {
        answer: b * h / 2,
        steps: `Area of a triangle is ½ × base × height: ½ × ${b} × ${h} = ${b * h / 2}.`,
        traps: [
          [b * h, 'forgets the ½ — that product is the area of the surrounding rectangle'],
          [b + h, 'adds the dimensions'],
          [2 * (b + h), 'computes a perimeter-style sum'],
        ],
      };
    },
  },
  {
    id: 'area-trapezoid',
    match: /^A trapezoid has parallel bases of ([\d.]+) and ([\d.]+) and a height of ([\d.]+)\. What is its area\?/,
    solve: (m) => {
      const [b1, b2, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: (b1 + b2) / 2 * h,
        steps: `Average the parallel bases, then multiply by the height: (${b1} + ${b2}) ÷ 2 = ${(b1 + b2) / 2}, and ${(b1 + b2) / 2} × ${h} = ${(b1 + b2) / 2 * h}.`,
        traps: [
          [(b1 + b2) * h, 'skips the averaging and multiplies the base SUM by the height'],
          [b1 * b2 / 2, 'multiplies the bases together instead of adding them'],
          [(b1 + b2) / 2, 'stops at the average of the bases without multiplying by the height'],
        ],
      };
    },
  },
  {
    id: 'vector-magnitude',
    match: /^What is the magnitude of the vector ⟨(-?[\d.]+), (-?[\d.]+)⟩\?/,
    solve: (m) => {
      const [x, y] = [Number(m[1]), Number(m[2])];
      return {
        answer: round(Math.hypot(x, y), 4),
        steps: `Magnitude is √(x² + y²) — the Pythagorean theorem on the components: √(${x}² + ${y}²) = √(${x * x} + ${y * y}) = √${x * x + y * y} = ${round(Math.hypot(x, y), 4)}. Squaring removes the sign, so a negative component does not shorten the vector.`,
        traps: [
          [Math.abs(x) + Math.abs(y), 'adds the component lengths instead of combining them at right angles'],
          [x + y, 'adds the components with their signs, letting a negative cancel part of the length'],
          [round(Math.abs(x * y), 4), 'multiplies the components'],
        ],
      };
    },
  },
  {
    id: 'work-rate',
    match: /^One pump fills a tank in ([\d.]+) hours?; a second pump fills the same tank in ([\d.]+) hours?\. Working together/,
    solve: (m) => {
      const [t1, t2] = [Number(m[1]), Number(m[2])];
      const together = 1 / (1 / t1 + 1 / t2);
      // Keep it exact. These answers are written as fractions ("4/3 hours"),
      // and a rounded 1.3333 is not 4/3 — the comparison would reject a key
      // that is perfectly correct.
      const exact = (Number.isInteger(t1) && Number.isInteger(t2))
        ? frac(t1 * t2, t1 + t2) : null;
      return {
        answer: exact != null ? exact : together,
        steps: `Add RATES, not times. The pumps fill 1/${t1} and 1/${t2} of the tank per hour, together ${round(1 / t1 + 1 / t2, 4)} tanks per hour, so the tank takes 1 ÷ ${round(1 / t1 + 1 / t2, 4)} = ${round(together, 4)} hours.`,
        traps: [
          [t1 + t2, 'adds the two times, which says two pumps are slower than one'],
          [round((t1 + t2) / 2, 4), 'averages the times — always longer than the faster pump alone, which cannot be right'],
          [round(Math.min(t1, t2), 4), 'gives the faster pump acting alone, ignoring the help'],
        ],
      };
    },
  },
  {
    id: 'radians-degrees',
    match: /^Convert ([\d.]+)° to radians\./,
    solve: (m) => {
      const deg = Number(m[1]);
      const n = deg;
      const d = 180;
      const g = gcd(n, d) || 1;
      const num = n / g;
      const den = d / g;
      const pretty = den === 1 ? `${num}π` : (num === 1 ? `π/${den}` : `${num}π/${den}`);
      return {
        answer: pretty,
        steps: `Multiply by π/180: ${deg} × π/180 = ${pretty}. (Degrees → radians shrinks the number, because a radian is much larger than a degree.)`,
        traps: [
          [`${den === 1 ? num : num}π`, 'drops the denominator'],
          [round(deg * Math.PI / 180, 4), 'gives the decimal value rather than the exact multiple of π the choices are written in'],
        ],
      };
    },
  },
  {
    id: 'negative-exponent',
    match: /^Evaluate: (-?\d+)\^\(-(\d+)\)$/,
    solve: (m) => {
      const [b, e] = [Number(m[1]), Number(m[2])];
      return {
        answer: frac(1, b ** e),
        steps: `A negative exponent means RECIPROCAL, not a negative result: ${b}^(−${e}) = 1/${b}^${e} = 1/${b ** e}.`,
        traps: [
          [-(b ** e), `makes the ANSWER negative (−${b ** e}) — the minus sign moves the base to the denominator, it does not change the sign`],
          [b ** e, 'ignores the minus sign entirely'],
          [frac(1, b * e), `multiplies base by exponent instead of raising (${b} × ${e})`],
        ],
      };
    },
  },
  {
    id: 'simplify-radicals',
    match: /^Simplify: √(\d+)$/,
    solve: (m) => {
      const n = Number(m[1]);
      const { k, rest, text: pretty } = simplifyRadical(n);
      return {
        answer: pretty,
        steps: `Pull out the largest perfect square: ${n} = ${k * k} × ${rest}, and √${k * k} = ${k}, so √${n} = ${pretty}.`,
        traps: [
          [round(Math.sqrt(n), 3), 'gives a decimal instead of the exact simplified radical'],
          [`${n / 2}`, 'halves the number, as though the radical were a division by 2'],
        ],
      };
    },
  },
  {
    id: 'logarithm-evaluate',
    match: /^Evaluate: log_(\d+)\((\d+)\)$/,
    solve: (m) => {
      const [b, x] = [Number(m[1]), Number(m[2])];
      const v = Math.log(x) / Math.log(b);
      return {
        answer: round(v, 6),
        steps: `log_${b}(${x}) asks: ${b} to what power gives ${x}? Since ${b}^${round(v, 6)} = ${x}, the answer is ${round(v, 6)}.`,
        traps: [
          [x / b, `divides ${x} by ${b} instead of counting powers`],
          [round(v + 1, 6), 'is off by one — a common slip from counting the base itself as a step'],
          [round(v - 1, 6), 'is off by one in the other direction'],
        ],
      };
    },
  },
  {
    id: 'simplify-rational-factorable',
    match: /^Simplify: \(x\^2 ([+-]) (\d+)x ([+-]) (\d+)\) \/ \(x ([+-]) (\d+)\)$/,
    solve: (m) => {
      const bSign = m[1] === '-' ? -1 : 1;
      const b = bSign * Number(m[2]);
      const cSign = m[3] === '-' ? -1 : 1;
      const c = cSign * Number(m[4]);
      const dSign = m[5] === '-' ? -1 : 1;
      const d = dSign * Number(m[6]);       // denominator is (x + d)
      // x^2 + bx + c = (x + d)(x + other) when d is a root of the factorisation
      const other = c / d;
      if (!Number.isInteger(other) || d + other !== b) return null;
      const sign = other < 0 ? '−' : '+';
      return {
        answer: `x ${sign} ${Math.abs(other)}`,
        steps: `Factor the numerator: x² ${b < 0 ? '−' : '+'} ${Math.abs(b)}x ${c < 0 ? '−' : '+'} ${Math.abs(c)} = (x ${d < 0 ? '−' : '+'} ${Math.abs(d)})(x ${sign} ${Math.abs(other)}), because ${d} and ${other} multiply to ${c} and add to ${b}. The (x ${d < 0 ? '−' : '+'} ${Math.abs(d)}) cancels, leaving x ${sign} ${Math.abs(other)}.`,
        traps: [
          [`x ${d < 0 ? '−' : '+'} ${Math.abs(d)}`, 'keeps the factor that cancels instead of the one that survives'],
          [`x ${b < 0 ? '−' : '+'} ${Math.abs(b)}`, 'cancels term by term across the fraction bar, which is not a legal move'],
        ],
      };
    },
  },
  {
    id: 'trig-ratio-from-sides',
    match: /The side opposite angle A measures ([\d.]+), the side adjacent to angle A measures ([\d.]+), and the hypotenuse measures ([\d.]+)\. What is (sin|cos|tan)\(A\)\?/,
    solve: (m) => {
      const [opp, adj, hyp, fn] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
      const value = fn === 'sin' ? opp / hyp : fn === 'cos' ? adj / hyp : opp / adj;
      const asFrac = fn === 'sin' ? frac(opp, hyp) : fn === 'cos' ? frac(adj, hyp) : frac(opp, adj);
      const named = { sin: 'opposite/hypotenuse', cos: 'adjacent/hypotenuse', tan: 'opposite/adjacent' }[fn];
      return {
        answer: asFrac,
        steps: `SOH-CAH-TOA: ${fn} is ${named}, so ${fn} A = ${asFrac}${Number.isInteger(value) ? '' : ` ≈ ${round(value, 4)}`}.`,
        traps: [
          [frac(hyp, opp), 'inverts the ratio, putting the hypotenuse on top'],
          [fn === 'tan' ? frac(adj, opp) : frac(opp, adj), 'uses a different one of the three ratios'],
          [frac(adj, hyp), fn === 'cos' ? 'is the correct ratio' : 'gives cos A rather than the ratio asked for'],
        ],
      };
    },
  },
  {
    id: 'trig-application-ladder',
    match: /^A ladder ([\d.]+) feet long leans against a wall, making a ([\d.]+)° angle with the ground\. How high up the wall/,
    solve: (m) => {
      const [len, deg] = [Number(m[1]), Number(m[2])];
      const h = len * Math.sin(deg * Math.PI / 180);
      return {
        answer: round(h, 1),
        steps: `The ladder is the hypotenuse and the height is OPPOSITE the ${deg}° angle, so use sine: ${len} × sin(${deg}°) = ${round(h, 1)} feet.`,
        traps: [
          [round(len * Math.cos(deg * Math.PI / 180), 1), 'uses cosine, which gives the distance along the GROUND, not the height'],
          [round(len * Math.tan(deg * Math.PI / 180), 1), 'uses tangent, which needs the ground distance rather than the ladder length'],
          [len, 'reports the ladder length itself'],
        ],
      };
    },
  },
  {
    id: 'parallel-lines-cointerior',
    match: /^Two parallel lines are cut by a transversal\. One angle measures ([\d.]+)°\. What is the measure of its (co-interior \(same-side interior\)|alternate interior|corresponding|vertical) angle\?/,
    solve: (m) => {
      const a = Number(m[1]);
      const kind = m[2];
      const supplementary = kind.startsWith('co-interior');
      return {
        answer: supplementary ? 180 - a : a,
        steps: supplementary
          ? `Co-interior (same-side interior) angles are SUPPLEMENTARY, not equal: 180 − ${a} = ${180 - a}°.`
          : `${kind[0].toUpperCase()}${kind.slice(1)} angles across parallel lines are EQUAL, so the angle is ${a}°.`,
        traps: supplementary
          ? [[a, 'assumes the angle is equal — true for alternate interior and corresponding angles, but co-interior angles add to 180°'],
            [90 - a, 'takes the complement instead of the supplement']]
          : [[180 - a, 'takes the supplement — that is the co-interior relationship, not this one'],
            [90 - a, 'takes the complement']],
      };
    },
  },
  {
    id: 'circle-area-circumference',
    match: /^A circle has a (radius|diameter) of ([\d.]+)\. What is its (area|circumference)\?/,
    solve: (m) => {
      const given = m[1];
      const val = Number(m[2]);
      const want = m[3];
      const r = given === 'radius' ? val : val / 2;
      const answer = want === 'area' ? Math.PI * r * r : 2 * Math.PI * r;
      const exact = want === 'area' ? `${r * r}π` : `${2 * r}π`;
      return {
        answer: exact,
        steps: want === 'area'
          ? `Radius is ${r}${given === 'diameter' ? ` (half the diameter ${val})` : ''}, and area is πr² = π × ${r}² = ${exact}.`
          : `Radius is ${r}${given === 'diameter' ? ` (half the diameter ${val})` : ''}, and circumference is 2πr = 2π × ${r} = ${exact}.`,
        traps: [
          [want === 'area' ? `${2 * r}π` : `${r * r}π`, want === 'area' ? 'gives the CIRCUMFERENCE (2πr) instead of the area' : 'gives the AREA (πr²) instead of the circumference'],
          [given === 'diameter' ? (want === 'area' ? `${val * val}π` : `${2 * val}π`) : null, 'uses the diameter where the formula wants the radius'],
          [round(answer, 2), 'gives a decimal where the choices are exact multiples of π'],
        ],
      };
    },
  },
  {
    id: 'exponent-product',
    match: /^Simplify: \((-?\d+)x\^(\d+)\)\((-?\d+)x\^(\d+)\)$/,
    solve: (m) => {
      const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      return {
        answer: `${a * c}${pow('x', b + d)}`,
        steps: `Multiply the coefficients and ADD the exponents: ${a} × ${c} = ${a * c}, and x^${b} · x^${d} = x^${b + d}. So ${a * c}x^${b + d}.`,
        traps: [
          [`${a + c}x^${b + d}`, 'adds the coefficients instead of multiplying them'],
          [`${a * c}x^${b * d}`, 'multiplies the exponents — that is the rule for a POWER of a power, not a product'],
          [`${a + c}x^${b * d}`, 'reverses both rules at once'],
        ],
      };
    },
  },
  {
    id: 'exponent-power-of-power',
    match: /^Simplify: \((-?\d+)x\^(\d+)\)\^(\d+)$/,
    solve: (m) => {
      const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: `${a ** c}${pow('x', b * c)}`,
        steps: `The outer power hits EVERYTHING inside: ${a}^${c} = ${a ** c}, and (x^${b})^${c} = x^${b * c}. So ${a ** c}x^${b * c}.`,
        traps: [
          [`${a}x^${b * c}`, `leaves the coefficient alone — ${a} must be raised to the ${c} as well`],
          [`${a * c}x^${b * c}`, `multiplies the coefficient by ${c} instead of raising it`],
          [`${a ** c}x^${b + c}`, 'adds the exponents, which is the rule for a PRODUCT, not a power of a power'],
        ],
      };
    },
  },
  {
    id: 'exponent-quotient',
    match: /^Simplify: \((-?\d+)x\^(\d+)\) \/ \((-?\d+)x\^(\d+)\)$/,
    solve: (m) => {
      const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      return {
        answer: `${a / c}${pow('x', b - d)}`,
        steps: `Divide the coefficients and SUBTRACT the exponents: ${a} ÷ ${c} = ${a / c}, and x^${b} ÷ x^${d} = x^${b - d}. So ${a / c}x^${b - d}.`,
        traps: [
          [`${a / c}x^${b + d}`, 'adds the exponents instead of subtracting'],
          [`${a - c}x^${b - d}`, 'subtracts the coefficients instead of dividing them'],
          [`${a / c}x^${d - b}`, 'subtracts the exponents the wrong way round'],
        ],
      };
    },
  },
  {
    id: 'inverse-linear',
    match: /^If f\(x\) = (-?\d+)x(?: ([+-]) (\d+))?, what is f⁻¹\(x\)\?$/,
    solve: (m) => {
      const a = Number(m[1]);
      const b = m[2] ? (m[2] === '-' ? -Number(m[3]) : Number(m[3])) : 0;
      // b === 0 has no sign of its own; the bank writes it as "(x - 0)/a".
      const undoSign = b >= 0 ? '-' : '+';
      const answer = `(x ${undoSign} ${Math.abs(b)})/${a}`;
      return {
        answer,
        steps: `Swap x and y and solve: x = ${a}y ${b < 0 ? '−' : '+'} ${Math.abs(b)} gives y = (x ${undoSign} ${Math.abs(b)})/${a}. An inverse UNDOES the steps in reverse order — undo the ${b < 0 ? 'subtraction' : 'addition'} first, then the multiplication.`,
        traps: [
          [`1/(${a}x ${b < 0 ? '- ' : '+ '}${Math.abs(b)})`, 'takes the RECIPROCAL of f(x); the ⁻¹ in f⁻¹ means inverse function, not "one over"'],
          [`(x ${b > 0 ? '+' : '-'} ${Math.abs(b)})/${a}`, `undoes the ${b < 0 ? 'subtraction' : 'addition'} in the wrong direction`],
          [`x/${a} ${b < 0 ? '- ' : '+ '}${Math.abs(b)}`, 'divides only the x by the coefficient, leaving the constant outside the division'],
        ],
      };
    },
  },
  {
    id: 'percent-change',
    match: /sales (fell|rose) from ([\d.]+) units to ([\d.]+) units\. What was the percent (decrease|increase)\?/,
    solve: (m) => {
      const [from, to] = [Number(m[2]), Number(m[3])];
      const pct = Math.abs(to - from) / from * 100;
      return {
        answer: round(pct, 1),
        steps: `Percent change is measured against the ORIGINAL: the change is |${to} − ${from}| = ${Math.abs(to - from)}, and ${Math.abs(to - from)} ÷ ${from} = ${round(pct, 3)} → ${round(pct, 1)}%.`,
        traps: [
          [round(Math.abs(to - from) / to * 100, 1), `divides by the NEW value (${to}) instead of the original (${from})`],
          [Math.abs(to - from), 'reports the raw change in units rather than converting it to a percent'],
          [round(to / from * 100, 1), 'gives what the new value is AS a percent of the old, not the change'],
        ],
      };
    },
  },
  {
    id: 'interest',
    match: /^\$([\d,]+) is invested at ([\d.]+)% per year, (compounded annually|simple interest)\. What is the balance after (\d+) years?\?/,
    solve: (m) => {
      const principal = Number(m[1].replace(/,/g, ''));
      const r = Number(m[2]) / 100;
      const compound = m[3] === 'compounded annually';
      const t = Number(m[4]);
      const value = compound ? principal * (1 + r) ** t : principal * (1 + r * t);
      return {
        answer: round(value, 2),
        steps: compound
          ? `Compound interest multiplies each year: ${principal} × (1 + ${r})^${t} = ${money(round(value, 2))}. Each year's interest earns interest of its own.`
          : `Simple interest is computed on the ORIGINAL principal every year: ${principal} × ${r} × ${t} = ${money(round(principal * r * t, 2))} of interest, so the balance is ${money(round(value, 2))}.`,
        traps: [
          [round(principal * r * t, 2), 'reports the INTEREST earned rather than the balance — the principal is still there'],
          [round(compound ? principal * (1 + r * t) : principal * (1 + r) ** t, 2),
            compound ? 'uses simple interest where the question compounds' : 'compounds where the question says simple interest'],
        ],
      };
    },
  },
  {
    id: 'rtd-time',
    match: /^A train covers ([\d./]+) miles at a constant ([\d./]+) miles per hour\. How long does the trip take\?/,
    solve: (m) => {
      const d = num(m[1]);
      const s = num(m[2]);
      return {
        answer: exactFrom(d / s) || round(d / s, 4),
        steps: `Time = distance ÷ rate: ${m[1]} ÷ ${m[2]} = ${exactFrom(d / s) || round(d / s, 4)} hours.`,
        traps: [
          [exactFrom(s / d) || round(s / d, 4), 'divides rate by distance, inverting the relationship'],
          [round(d * s, 4), 'multiplies, which would give distance-times-speed, not a time'],
        ],
      };
    },
  },
  {
    id: 'rtd-distance',
    match: /^A car travels at a constant ([\d./]+) miles per hour for ([\d./]+) hours?\. How far does it travel\?/,
    solve: (m) => {
      const s = num(m[1]);
      const t = num(m[2]);
      return {
        answer: exactFrom(s * t) || round(s * t, 4),
        steps: `Distance = rate × time: ${m[1]} × ${m[2]} = ${exactFrom(s * t) || round(s * t, 4)} miles.`,
        traps: [
          [exactFrom(s / t) || round(s / t, 4), 'divides instead of multiplying'],
          [round(s + t, 4), 'adds the speed and the time, which have different units and cannot be added'],
        ],
      };
    },
  },
  {
    id: 'unit-conversion',
    match: /^How many (ounces|minutes|feet|centimeters|inches) are in ([\d./]+) (pounds|hours|yards|meters|feet)\?/,
    solve: (m) => {
      const to = m[1];
      const qty = num(m[2]);
      const from = m[3];
      const FACTORS = {
        'pounds>ounces': 16, 'hours>minutes': 60, 'yards>feet': 3,
        'meters>centimeters': 100, 'feet>inches': 12,
      };
      const k = FACTORS[`${from}>${to}`];
      if (!k) return null;
      return {
        answer: exactFrom(qty * k) || round(qty * k, 4),
        steps: `There are ${k} ${to} in one ${from.replace(/s$/, '')}, and ${to} are SMALLER than ${from}, so the number must grow: ${m[2]} × ${k} = ${exactFrom(qty * k) || round(qty * k, 4)}.`,
        traps: [
          [exactFrom(qty / k) || round(qty / k, 6), 'divides by the factor, which converts the wrong direction and makes the number smaller'],
          [round(qty * k * 2, 4), 'doubles the conversion factor'],
          [round(qty + k, 4), 'adds the factor instead of multiplying by it'],
        ],
      };
    },
  },
  {
    id: 'ratio-total',
    match: /^The ratio of (\w+) to (\w+) at a shelter is (\d+):(\d+)\. There are ([\d.]+) animals in all\. How many (\w+) are there\?/,
    solve: (m) => {
      const [first, second, a, b, total, want] = [m[1], m[2], Number(m[3]), Number(m[4]), Number(m[5]), m[6]];
      const parts = a + b;
      const share = want === first ? a : b;
      const other = want === first ? b : a;
      return {
        answer: exactFrom(total * share / parts) || round(total * share / parts, 4),
        steps: `The ratio ${a}:${b} splits the group into ${parts} equal parts, so one part is ${total} ÷ ${parts} = ${round(total / parts, 4)}. The ${want} take ${share} parts: ${share} × ${round(total / parts, 4)} = ${round(total * share / parts, 4)}.`,
        traps: [
          [exactFrom(total * other / parts) || round(total * other / parts, 4), `gives the ${want === first ? second : first} instead — the other side of the ratio`],
          [round(total / parts, 4), 'stops at one part instead of taking all ' + share],
          [round(total / 2, 4), 'splits the total evenly, ignoring the ratio'],
        ],
      };
    },
  },
  {
    id: 'scientific-notation-write',
    match: /^Write ([\d,]+) in scientific notation\./,
    solve: (m) => {
      const n = Number(m[1].replace(/,/g, ''));
      const e = Math.floor(Math.log10(n));
      const c = round(n / 10 ** e, 6);
      return {
        answer: `${c} × 10^${e}`,
        steps: `Scientific notation needs exactly one non-zero digit before the decimal point. Moving the point to just after the ${String(n)[0]} takes ${e} places, so ${m[1]} = ${c} × 10^${e}.`,
        traps: [
          [`${c} × 10^${e + 1}`, 'is off by one place'],
          [`${c} × 10^-${e}`, 'makes the exponent negative — that would be a number smaller than 1'],
          [`${round(c * 10, 6)} × 10^${e - 1}`, 'leaves two digits before the decimal point, which is not standard form'],
        ],
      };
    },
  },
  {
    id: 'scientific-notation-multiply',
    match: /^\(([\d.]+) × 10\^(-?\d+)\)\(([\d.]+) × 10\^(-?\d+)\) = \?$/,
    solve: (m) => {
      const [a, e1, b, e2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      let c = a * b;
      let e = e1 + e2;
      const rawC = c;
      while (c >= 10) { c /= 10; e += 1; }
      return {
        answer: `${round(c, 6)} × 10^${e}`,
        steps: `Multiply the coefficients and ADD the exponents: ${a} × ${b} = ${round(rawC, 6)} and 10^${e1} × 10^${e2} = 10^${e1 + e2}. ${round(rawC, 6)} is not between 1 and 10, so shift once more: ${round(c, 6)} × 10^${e}.`,
        traps: [
          [`${round(rawC, 6)} × 10^${e1 + e2}`, 'stops before renormalizing — the coefficient must land between 1 and 10'],
          [`${round(c, 6)} × 10^${e1 * e2}`, 'multiplies the exponents instead of adding them'],
          [`${round(a + b, 6)} × 10^${e}`, 'adds the coefficients'],
        ],
      };
    },
  },
  {
    id: 'distribute-solve',
    match: /^Solve for x: (-?\d+)\(x ([+-]) (\d+)\) ([+-]) (\d+) = (-?\d+)$/,
    solve: (m) => {
      const a = Number(m[1]);
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = m[4] === '-' ? -Number(m[5]) : Number(m[5]);
      const rhs = Number(m[6]);
      const x = (rhs - c - a * b) / a;
      return {
        answer: exactFrom(x) || round(x, 6),
        steps: `Distribute first: ${a}x ${a * b < 0 ? '−' : '+'} ${Math.abs(a * b)} ${c < 0 ? '−' : '+'} ${Math.abs(c)} = ${rhs}. Combine the constants to ${a}x ${a * b + c < 0 ? '−' : '+'} ${Math.abs(a * b + c)} = ${rhs}, so ${a}x = ${rhs - a * b - c} and x = ${exactFrom(x) || round(x, 6)}.`,
        traps: [
          [exactFrom((rhs - c) / a - b) || round((rhs - c) / a - b, 6), 'distributes to the x but not to the constant inside the parentheses'],
          [exactFrom(rhs - c - a * b) || round(rhs - c - a * b, 6), `stops at ${a}x = ${rhs - a * b - c} without dividing by ${a}`],
        ],
      };
    },
  },
  {
    id: 'compound-inequality',
    match: /^Solve for x: (-?\d+) < (-?\d+)x ([+-]) (\d+) < (-?\d+)$/,
    solve: (m) => {
      const lo = Number(m[1]);
      const a = Number(m[2]);
      const b = m[3] === '-' ? -Number(m[4]) : Number(m[4]);
      const hi = Number(m[5]);
      const l = (lo - b) / a;
      const h = (hi - b) / a;
      const [L, H] = a > 0 ? [l, h] : [h, l];
      return {
        answer: `${exactFrom(L) || round(L, 6)} < x < ${exactFrom(H) || round(H, 6)}`,
        steps: `Do the same thing to all three parts. ${b < 0 ? 'Add' : 'Subtract'} ${Math.abs(b)}: ${lo - b} < ${a}x < ${hi - b}. Divide by ${a}: ${exactFrom(L) || round(L, 6)} < x < ${exactFrom(H) || round(H, 6)}.`,
        traps: [
          [`${lo - b} < x < ${hi - b}`, `${b < 0 ? 'adds' : 'subtracts'} the constant but never divides by ${a}`],
          [`${exactFrom(H) || round(H, 6)} < x < ${exactFrom(L) || round(L, 6)}`, 'writes the bounds in the wrong order, describing an empty set'],
          [`${exactFrom(lo / a - b) || round(lo / a - b, 6)} < x < ${exactFrom(hi / a - b) || round(hi / a - b, 6)}`, 'divides before undoing the constant, so the constant never gets divided'],
        ],
      };
    },
  },
  {
    id: 'radical-add-like',
    match: /^Simplify: (\d+)√(\d+) \+ (\d+)√(\d+)$/,
    solve: (m) => {
      const [a, r1, b, r2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      if (r1 !== r2) return null;
      return {
        answer: `${a + b}√${r1}`,
        steps: `√${r1} behaves like a variable here: ${a} of them plus ${b} of them is ${a + b} of them. Add the COEFFICIENTS and leave the radical alone: ${a + b}√${r1}.`,
        traps: [
          [`${a + b}√${r1 * 2}`, 'adds the numbers under the radical as well as in front'],
          [`${a * b}√${r1}`, 'multiplies the coefficients instead of adding them'],
          [`${a + b}√${r1 + r2}`, 'adds what is inside the radicals'],
        ],
      };
    },
  },
  {
    id: 'radical-multiply',
    match: /^Simplify: √(\d+) · √(\d+)$/,
    solve: (m) => {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const prod = a * b;
      // √3·√6 is √18, but the choices are written in lowest terms (3√2) — so
      // the derivation is not finished until the perfect square comes out.
      const simp = simplifyRadical(prod);
      const needed = simp.text !== `√${prod}`;
      return {
        answer: simp.text,
        steps: `Radicals multiply straight across: √${a} · √${b} = √(${a} × ${b}) = √${prod}${needed ? `, and √${prod} still has a perfect square in it: ${prod} = ${simp.k * simp.k} × ${simp.rest}, so √${prod} = ${simp.text}` : ''}.`,
        traps: [
          [`√${a + b}`, 'adds what is under the radicals instead of multiplying'],
          [`${a + b}`, 'adds and drops the radical entirely'],
          [`${a * b}`, 'multiplies correctly but forgets the answer is still a square root'],
          [`√${prod}`, 'multiplies correctly but leaves a perfect square trapped under the radical'],
        ],
      };
    },
  },
  {
    id: 'exponential-growth-decay',
    match: /^A population of ([\d,]+) (increases|decreases) by ([\d.]+)% each year\. To the nearest whole number, what is the population after (\d+) years?\?/,
    solve: (m) => {
      const p0 = Number(m[1].replace(/,/g, ''));
      const up = m[2] === 'increases';
      const r = Number(m[3]) / 100;
      const t = Number(m[4]);
      const factor = up ? 1 + r : 1 - r;
      return {
        // Left unrounded on purpose. 1000 × 0.95² lands on 902.5 and which way
        // that tips is a rounding convention, not a disagreement about the
        // maths — sameValue matches to the option's own precision.
        answer: p0 * factor ** t,
        steps: `Each year multiplies by ${factor}, so after ${t} years: ${p0} × ${factor}^${t} = ${Math.round(p0 * factor ** t)}. Percent change compounds — it is not the same amount subtracted each year.`,
        traps: [
          [Math.round(p0 * (up ? 1 + r * t : 1 - r * t)), `applies ${Math.round(r * 100)}% of the ORIGINAL ${t} times over, as if the change were the same size each year`],
          [Math.round(p0 * (up ? 1 - r : 1 + r) ** t), 'moves the population the wrong direction'],
          [Math.round(p0 * factor), 'applies the change only once rather than for all ' + t + ' years'],
        ],
      };
    },
  },
  {
    id: 'special-right-45',
    match: /^In a 45°-45°-90° triangle, each leg measures ([\d.]+)\. What is the length of the hypotenuse\?/,
    solve: (m) => {
      const leg = Number(m[1]);
      return {
        answer: `${leg}√2`,
        steps: `In a 45°-45°-90° triangle the sides are x : x : x√2, so the hypotenuse is ${leg}√2. (Check: ${leg}² + ${leg}² = ${2 * leg * leg}, and √${2 * leg * leg} = ${leg}√2.)`,
        traps: [
          [`${leg}√3`, 'uses the √3 from the 30°-60°-90° triangle'],
          [`${leg * 2}`, 'doubles the leg — the hypotenuse is about 1.41 times a leg, not twice'],
          [`${leg / 2}√2`, 'halves the leg before scaling'],
        ],
      };
    },
  },
  {
    id: 'special-right-30',
    match: /^In a 30°-60°-90° triangle, the side opposite the 30° angle measures ([\d.]+)\. What is the length of the hypotenuse\?/,
    solve: (m) => {
      const short = Number(m[1]);
      return {
        answer: `${short * 2}`,
        steps: `In a 30°-60°-90° triangle the sides are x : x√3 : 2x, with x opposite the 30°. So the hypotenuse is 2 × ${short} = ${short * 2}.`,
        traps: [
          [`${short}√3`, 'gives the side opposite the 60° angle, not the hypotenuse'],
          [`${short}√2`, 'uses the √2 from the 45°-45°-90° triangle'],
          [exact(short, 2), 'halves the short side instead of doubling it'],
        ],
      };
    },
  },
  {
    id: 'data-range',
    match: /^What is the range of this data set: ([\d.,\s]+)\?$/,
    solve: (m) => {
      const xs = m[1].split(',').map((t) => Number(t.trim())).filter((x) => Number.isFinite(x));
      if (xs.length < 2) return null;
      const mx = Math.max(...xs);
      const mn = Math.min(...xs);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return {
        answer: mx - mn,
        steps: `Range is simply largest minus smallest: ${mx} − ${mn} = ${mx - mn}.`,
        traps: [
          [mx, 'reports the largest value instead of the spread'],
          [exactFrom(mean), 'gives the mean, which describes the centre rather than the spread'],
          [exactFrom((mx + mn) / 2), 'averages the two extremes (the midrange) instead of subtracting them'],
        ],
      };
    },
  },
  {
    id: 'data-iqr',
    match: /^What is the interquartile range of this data set: ([\d.,\s]+)\?$/,
    solve: (m) => {
      const xs = m[1].split(',').map((t) => Number(t.trim())).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
      if (xs.length < 4) return null;
      const half = Math.floor(xs.length / 2);
      const lower = xs.slice(0, half);
      const upper = xs.slice(xs.length % 2 ? half + 1 : half);
      const med = (arr) => (arr.length % 2
        ? arr[(arr.length - 1) / 2]
        : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
      const q1 = med(lower);
      const q3 = med(upper);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return {
        answer: exactFrom(q3 - q1) || round(q3 - q1, 4),
        steps: `Sort, split in half, and take the median of each half: Q1 = ${exactFrom(q1) || q1}, Q3 = ${exactFrom(q3) || q3}. IQR = Q3 − Q1 = ${exactFrom(q3 - q1) || round(q3 - q1, 4)}. It measures the middle 50%, which is why it ignores the extremes.`,
        traps: [
          [xs[xs.length - 1] - xs[0], 'gives the full RANGE — that is every value, not the middle half'],
          [exactFrom(mean), 'gives the mean'],
          [exactFrom(q3 + q1), 'adds the quartiles instead of subtracting them'],
        ],
      };
    },
  },
  {
    id: 'data-median',
    match: /^What is the median of this data set: ([\d.,\s]+)\?$/,
    solve: (m) => {
      const xs = m[1].split(',').map((t) => Number(t.trim())).filter((x) => Number.isFinite(x));
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      const n = sorted.length;
      const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const mean = xs.reduce((a, b) => a + b, 0) / n;
      const unsortedMiddle = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
      return {
        answer: exactFrom(median) || round(median, 4),
        steps: n % 2
          ? `Sort first — that is the whole trick. In order the set is ${sorted.join(', ')}, and the middle value is ${median}.`
          : `Sort first, then average the two middle values. In order: ${sorted.join(', ')}; the middle pair is ${sorted[n / 2 - 1]} and ${sorted[n / 2]}, so the median is ${exactFrom(median) || round(median, 4)}.`,
        traps: [
          [exactFrom(mean), 'gives the MEAN. Mean and median answer different questions and only agree on symmetric data'],
          [exactFrom(unsortedMiddle), 'takes the middle of the list AS GIVEN, without sorting it first'],
          [sorted[n - 1], 'reports the largest value'],
          [sorted[0], 'reports the smallest value'],
        ],
      };
    },
  },
  {
    id: 'logarithmic-equation-simple',
    match: /^Solve for x: log_(\d+)\(x\) = (-?\d+)$/,
    solve: (m) => {
      const [b, k] = [Number(m[1]), Number(m[2])];
      return {
        answer: b ** k,
        steps: `Rewrite the log as a power: log_${b}(x) = ${k} means ${b}^${k} = x, so x = ${b ** k}.`,
        traps: [
          [b * k, `multiplies ${b} by ${k} instead of raising ${b} to it`],
          [k ** b, 'raises the exponent to the base, swapping the two'],
          [b + k, 'adds them'],
        ],
      };
    },
  },
  {
    id: 'logarithmic-equation-coefficient',
    match: /^Solve for x: log_(\d+)\((\d+)x\) = (-?\d+)$/,
    solve: (m) => {
      const [b, c, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: exactFrom(b ** k / c) || round(b ** k / c, 6),
        steps: `First undo the log: ${b}^${k} = ${c}x, so ${c}x = ${b ** k}. Then divide: x = ${b ** k} ÷ ${c} = ${exactFrom(b ** k / c) || round(b ** k / c, 6)}.`,
        traps: [
          [b ** k, `stops at ${c}x = ${b ** k} without dividing by ${c}`],
          [b ** (k * c), 'multiplies the exponent by the coefficient, as though it were inside the power'],
          [round(b ** k * c, 6), `multiplies by ${c} instead of dividing`],
        ],
      };
    },
  },
  {
    id: 'conditional-probability-survey',
    match: /^In a survey of (\d+) students: (\d+) (\w+) and (\d+) (\w+) said yes; (\d+) \3 and (\d+) \5 said no\. If a (\w+) is selected at random, what is the probability that this student said (yes|no)\?/,
    solve: (m) => {
      const [total, aYes, groupA, bYes, groupB, aNo, bNo, pick, want] = [
        Number(m[1]), Number(m[2]), m[3], Number(m[4]), m[5], Number(m[6]), Number(m[7]), m[8], m[9]];
      // The prompt names the groups in the plural ("24 juniors") and then picks
      // one in the singular ("if a junior is selected"), so compare on the stem.
      const stem = (w) => String(w).replace(/s$/, '').toLowerCase();
      const isA = stem(pick) === stem(groupA);
      const yes = isA ? aYes : bYes;
      const no = isA ? aNo : bNo;
      const groupTotal = yes + no;
      const numerator = want === 'yes' ? yes : no;
      return {
        answer: frac(numerator, groupTotal),
        steps: `"If a ${pick} is selected" narrows the whole sample space to the ${pick}s. There are ${yes} + ${no} = ${groupTotal} of them, and ${numerator} said ${want}: ${frac(numerator, groupTotal)}.`,
        traps: [
          [frac(numerator, total), `divides by all ${total} students instead of only the ${groupTotal} ${pick}s — the condition has been ignored`],
          [frac(numerator, want === 'yes' ? aYes + bYes : aNo + bNo), `divides by everyone who said ${want}, which answers the reversed question ("given ${want}, what is the chance of being a ${pick}?")`],
          [frac(groupTotal - numerator, groupTotal), `gives the ${pick}s who said the OTHER thing`],
        ],
      };
    },
  },
  {
    id: 'circle-garden',
    match: /^A circular garden has a (radius|diameter) of ([\d.]+) feet\. What is its (area|circumference)/,
    solve: (m) => {
      const r = m[1] === 'radius' ? Number(m[2]) : Number(m[2]) / 2;
      const v = Number(m[2]);
      const want = m[3];
      return {
        answer: want === 'area' ? `${r * r}π` : `${2 * r}π`,
        steps: want === 'area'
          ? `The ${m[1]} is ${v}, so the radius is ${r}. Area = πr² = π × ${r}² = ${r * r}π square feet.`
          : `The ${m[1]} is ${v}, so the radius is ${r}. Circumference = 2πr = ${2 * r}π feet.`,
        traps: [
          [want === 'area' ? `${v * v}π` : `${2 * v}π`, m[1] === 'diameter' ? 'uses the diameter where the formula wants the radius' : null],
          [want === 'area' ? `${2 * r}π` : `${r * r}π`, want === 'area' ? 'gives the circumference instead of the area' : 'gives the area instead of the circumference'],
          [`${r}π`, 'uses r rather than r² or 2r'],
        ],
      };
    },
  },
  {
    id: 'standard-deviation-compare',
    match: /^Set A: ([\d.,\s]+)\. Set B: ([\d.,\s]+)\. Which set has the (greater|smaller) standard deviation\?/,
    solve: (m) => {
      const parse = (t) => t.split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
      const A = parse(m[1]);
      const B = parse(m[2]);
      const sd = (xs) => {
        const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
      };
      const sdA = sd(A);
      const sdB = sd(B);
      if (Math.abs(sdA - sdB) < 1e-9) return null;
      const want = m[3];
      const winner = want === 'greater' ? (sdA > sdB ? 'Set A' : 'Set B') : (sdA < sdB ? 'Set A' : 'Set B');
      const loser = winner === 'Set A' ? 'Set B' : 'Set A';
      return {
        answer: winner,
        steps: `Standard deviation measures SPREAD, not size. Set A runs ${Math.min(...A)}–${Math.max(...A)} (spread ${Math.max(...A) - Math.min(...A)}) and Set B runs ${Math.min(...B)}–${Math.max(...B)} (spread ${Math.max(...B) - Math.min(...B)}), giving roughly ${round(sdA, 2)} and ${round(sdB, 2)}. So ${winner} is ${want}. You can see it without computing: one set is clustered and the other is scattered.`,
        traps: [
          [loser, 'picks the set that is clustered tightly when the question asks for the scattered one, or vice versa — reading "bigger numbers" as "bigger spread" is the usual slip'],
          ['They are equal', 'the two sets have visibly different spreads'],
          ['It cannot be determined', 'every value is given, so the spread of each set is fully determined'],
        ],
      };
    },
  },
  {
    id: 'pythagorean-leg',
    match: /^A right triangle has a hypotenuse of ([\d.]+) and one leg of ([\d.]+)\. What is the length of the other leg\?/,
    solve: (m) => {
      const [h, a] = [Number(m[1]), Number(m[2])];
      return {
        answer: round(Math.sqrt(h * h - a * a), 4),
        steps: `The hypotenuse is the one being broken apart, so SUBTRACT: b² = ${h}² − ${a}² = ${h * h} − ${a * a} = ${h * h - a * a}, so b = ${round(Math.sqrt(h * h - a * a), 4)}.`,
        traps: [
          [round(Math.hypot(h, a), 2), 'adds the squares, which is what you do when both given sides are LEGS — here one of them is the hypotenuse'],
          [h - a, 'subtracts the sides directly instead of their squares'],
          [h * h - a * a, 'stops at b² without taking the square root'],
        ],
      };
    },
  },
  {
    id: 'pythagorean-hyp',
    match: /^A right triangle has legs of length ([\d.]+) and ([\d.]+)\. What is the length of the hypotenuse\?/,
    solve: (m) => {
      const [a, b] = [Number(m[1]), Number(m[2])];
      return {
        answer: round(Math.hypot(a, b), 4),
        steps: `Both given sides are legs, so add the squares: ${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b}, and √${a * a + b * b} = ${round(Math.hypot(a, b), 4)}.`,
        traps: [
          [round(Math.sqrt(Math.abs(b * b - a * a)), 2), 'subtracts the squares, which is the move for finding a LEG, not the hypotenuse'],
          [a + b, 'adds the legs directly — the hypotenuse is always shorter than that'],
          [a * b, 'multiplies the legs'],
        ],
      };
    },
  },
  {
    id: 'sector',
    match: /^A circle has a radius of ([\d.]+)\. A sector has a central angle of ([\d.]+)°\. What is the (area of the sector|arc length)/,
    solve: (m) => {
      const r = Number(m[1]);
      const deg = Number(m[2]);
      const area = m[3] === 'area of the sector';
      const fractionOf = `${deg}/360`;
      const f = deg / 360;
      const val = area ? f * r * r : f * 2 * r;
      const asFrac = exactFrom(val);
      return {
        answer: piText(val),
        steps: `A sector is just a slice: ${deg}° out of 360° is ${fractionOf} of the circle. ${area ? `Whole area is πr² = ${r * r}π, so the sector is ${fractionOf} × ${r * r}π = ${piText(val)}.` : `Whole circumference is 2πr = ${2 * r}π, so the arc is ${fractionOf} × ${2 * r}π = ${piText(val)}.`}`,
        traps: [
          [area ? piText(f * 2 * r) : piText(f * r * r),
            area ? 'computes the ARC LENGTH instead of the sector area' : 'computes the sector AREA instead of the arc length'],
          [area ? `${r * r}π` : `${2 * r}π`, 'gives the whole circle, forgetting to take the fraction'],
        ],
      };
    },
  },
  {
    id: 'gcf-lcm',
    match: /^What is the (LCM|GCF) of (\d+) and (\d+)\?/,
    solve: (m) => {
      const [kind, a, b] = [m[1], Number(m[2]), Number(m[3])];
      const g = gcd(a, b);
      const l = a * b / g;
      return {
        answer: kind === 'LCM' ? l : g,
        steps: kind === 'LCM'
          ? `The LCM is the smallest number BOTH divide into. Use LCM = (${a} × ${b}) ÷ GCF = ${a * b} ÷ ${g} = ${l}.`
          : `The GCF is the largest number that divides BOTH. ${g} divides ${a} (${a / g} times) and ${b} (${b / g} times), and nothing larger does.`,
        traps: [
          [kind === 'LCM' ? g : l, kind === 'LCM' ? 'gives the GCF — the largest common FACTOR, not the smallest common multiple' : 'gives the LCM — the smallest common multiple, not the largest common factor'],
          [a * b, 'multiplies the two numbers; that is always a common multiple but rarely the LEAST one'],
        ],
      };
    },
  },
  {
    id: 'special-right-30-long-leg',
    match: /^In a 30°-60°-90° triangle, the side opposite the 30° angle measures ([\d.]+)\. What is the length of the longer leg\?/,
    solve: (m) => {
      const short = Number(m[1]);
      return {
        answer: `${short}√3`,
        steps: `The sides are x : x√3 : 2x, with x opposite the 30°, x√3 opposite the 60°, and 2x the hypotenuse. The LONGER LEG is opposite the 60°, so ${short}√3.`,
        traps: [
          [`${short * 2}`, 'gives the hypotenuse (2x), which is the longest side but not a leg'],
          [`${short}√2`, 'uses the √2 from the 45°-45°-90° triangle'],
          [`${short * 2}√3`, 'multiplies both the doubling and the √3'],
        ],
      };
    },
  },
  {
    id: 'mean-missing-value',
    match: /^A student's first (\d+) test scores are ([\d.,\s-]+)\. What score on the (\d+)(?:st|nd|rd|th) test would give a mean of exactly ([\d.]+)\?/,
    solve: (m) => {
      const xs = m[2].split(',').map((t) => Number(t.trim())).filter(Number.isFinite);
      const n = Number(m[1]);
      const target = Number(m[4]);
      if (xs.length !== n) return null;
      const sum = xs.reduce((a, b) => a + b, 0);
      const need = target * (n + 1) - sum;
      return {
        answer: exactFrom(need) || round(need, 4),
        steps: `Work backwards from the TOTAL. ${n + 1} tests averaging ${target} must total ${n + 1} × ${target} = ${target * (n + 1)}. The first ${n} total ${sum}, so the last must be ${target * (n + 1)} − ${sum} = ${exactFrom(need) || round(need, 4)}.`,
        traps: [
          [target, 'assumes scoring the target average keeps the average there — only true if the current average is already ' + target + ', and here it is ' + round(sum / n, 2)],
          [exactFrom(target * n - sum) || round(target * n - sum, 4), `multiplies by ${n} instead of ${n + 1}, forgetting the new test joins the count`],
          [exactFrom(sum / n) || round(sum / n, 4), 'gives the current average of the first ' + n],
        ],
      };
    },
  },
  {
    id: 'difference-of-squares',
    match: /^Multiply: \((\d*)x ([+-]) (\d+)\)\((\d*)x ([+-]) (\d+)\)$/,
    solve: (m) => {
      const a = m[1] === '' ? 1 : Number(m[1]);
      const b = Number(m[3]);
      const a2 = m[4] === '' ? 1 : Number(m[4]);
      const b2 = Number(m[6]);
      if (a !== a2 || b !== b2 || m[2] === m[5]) return null;   // must be (ax−b)(ax+b)
      const aa = a === 1 ? '' : `${a * a}`;
      return {
        answer: `${aa}x^2 - ${b * b}`,
        steps: `This is a difference of squares: (ax − b)(ax + b) = a²x² − b². The middle terms (−${a * b}x and +${a * b}x) cancel, leaving ${aa}x² − ${b * b}.`,
        traps: [
          [`${aa}x^2 + ${b * b}`, 'keeps the constant positive — but (−b)(+b) = −b²'],
          [`${aa}x^2 - ${2 * a * b}x - ${b * b}`, 'keeps a middle term; the two middle terms are equal and opposite, so they cancel'],
          [`${aa}x^2 - ${b}`, 'forgets to square the constant'],
        ],
      };
    },
  },
  {
    id: 'polygon-angles',
    match: /^What is the (measure of each exterior angle|sum of the interior angles|measure of each interior angle) of a regular (\d+)-sided polygon\?/,
    solve: (m) => {
      const kind = m[1];
      const n = Number(m[2]);
      const interiorSum = (n - 2) * 180;
      const eachInterior = interiorSum / n;
      const eachExterior = 360 / n;
      const answer = kind.startsWith('measure of each exterior') ? eachExterior
        : kind.startsWith('sum') ? interiorSum : eachInterior;
      const steps = kind.startsWith('measure of each exterior')
        ? `The exterior angles of ANY polygon total 360°, however many sides it has, so each is 360 ÷ ${n} = ${eachExterior}°.`
        : kind.startsWith('sum')
          ? `Interior angles sum to (n − 2) × 180: (${n} − 2) × 180 = ${interiorSum}°.`
          : `The interior angles total (${n} − 2) × 180 = ${interiorSum}°, shared equally among ${n} angles: ${interiorSum} ÷ ${n} = ${eachInterior}°.`;
      return {
        answer,
        traps: [
          [kind.startsWith('measure of each exterior') ? eachInterior : eachExterior,
            kind.startsWith('measure of each exterior') ? 'gives each INTERIOR angle instead' : 'gives each EXTERIOR angle instead'],
          [kind.startsWith('sum') ? eachInterior : interiorSum,
            kind.startsWith('sum') ? 'gives one interior angle rather than the sum of them all' : 'gives the SUM of the interior angles rather than one of them'],
          [n * 180, 'multiplies by n instead of (n − 2)'],
        ],
        steps,
      };
    },
  },
  {
    id: 'absolute-value-equation',
    match: /^Solve for x: \|(\d*)x ([+-]) (\d+)\| = (\d+)$/,
    solve: (m) => {
      const a = m[1] === '' ? 1 : Number(m[1]);
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = Number(m[4]);
      const x1 = (c - b) / a;
      const x2 = (-c - b) / a;
      const f = (x) => exactFrom(x) || round(x, 6);
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      return {
        answer: `x = ${f(lo)} or x = ${f(hi)}`,
        steps: `Absolute value has TWO cases, because both +${c} and −${c} have size ${c}. Solving ${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c} gives x = ${f(x1)}, and = −${c} gives x = ${f(x2)}.`,
        traps: [
          [`x = ${f(x1)}`, 'solves only the positive case and stops — the negative case is a real solution too'],
          [`x = ${f(x2)}`, 'solves only the negative case'],
          [`x = ${f(hi)} or x = ${f(hi + (hi - lo))}`, 'gets one solution right and mis-signs the other'],
        ],
      };
    },
  },
  {
    id: 'unit-circle-value',
    match: /^What is (sin|cos|tan)\((-?\d+)°\)\?$/,
    solve: (m) => {
      const fn = m[1];
      const deg = ((Number(m[2]) % 360) + 360) % 360;
      const EXACT = {
        0: { sin: '0', cos: '1', tan: '0' },
        30: { sin: '1/2', cos: '√3/2', tan: '√3/3' },
        45: { sin: '√2/2', cos: '√2/2', tan: '1' },
        60: { sin: '√3/2', cos: '1/2', tan: '√3' },
        90: { sin: '1', cos: '0', tan: 'undefined' },
        120: { sin: '√3/2', cos: '-1/2', tan: '-√3' },
        135: { sin: '√2/2', cos: '-√2/2', tan: '-1' },
        150: { sin: '1/2', cos: '-√3/2', tan: '-√3/3' },
        180: { sin: '0', cos: '-1', tan: '0' },
        210: { sin: '-1/2', cos: '-√3/2', tan: '√3/3' },
        225: { sin: '-√2/2', cos: '-√2/2', tan: '1' },
        240: { sin: '-√3/2', cos: '-1/2', tan: '√3' },
        270: { sin: '-1', cos: '0', tan: 'undefined' },
        300: { sin: '-√3/2', cos: '1/2', tan: '-√3' },
        315: { sin: '-√2/2', cos: '√2/2', tan: '-1' },
        330: { sin: '-1/2', cos: '√3/2', tan: '-√3/3' },
      };
      const row = EXACT[deg];
      if (!row) return null;
      const other = fn === 'sin' ? 'cos' : 'sin';
      const quadrant = deg < 90 ? 'I' : deg < 180 ? 'II' : deg < 270 ? 'III' : 'IV';
      return {
        answer: row[fn],
        steps: `${deg}° sits in quadrant ${quadrant}${deg % 90 === 0 ? ' (on an axis)' : ` with reference angle ${deg % 90 === 0 ? deg : Math.min(deg % 180, 180 - (deg % 180))}°`}, where ${fn} is ${row[fn]}.`,
        traps: [
          [row[other], `gives ${other}(${m[2]}°) instead of ${fn}`],
          [row[fn].startsWith('-') ? row[fn].slice(1) : `-${row[fn]}`, `has the right size but the wrong SIGN for quadrant ${quadrant}`],
        ],
      };
    },
  },
  {
    id: 'combinations',
    match: /^How many different committees of (\d+) people can be chosen from (\d+) people\?/,
    solve: (m) => {
      const k = Number(m[1]);
      const n = Number(m[2]);
      const perm = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r *= a - i; return r; };
      const fact = (a) => perm(a, a);
      const comb = perm(n, k) / fact(k);
      return {
        answer: comb,
        steps: `A committee has no ORDER — picking Ann then Bob is the same committee as Bob then Ann. So use combinations: ${n}×${n - 1}${k > 2 ? '×…' : ''} = ${perm(n, k)} ordered picks, divided by the ${fact(k)} ways to order ${k} people, = ${comb}.`,
        traps: [
          [perm(n, k), 'counts ORDERED selections (permutations); a committee is unordered, so each one is counted ' + fact(k) + ' times over'],
          [n * k, 'multiplies the two numbers'],
          [n ** k, 'allows repeats and order, as though each seat were filled independently'],
        ],
      };
    },
  },
  {
    id: 'permutations',
    match: /^In how many different orders can (\d+) of the (\d+) runners finish in first through (?:\w+) place\?/,
    solve: (m) => {
      const k = Number(m[1]);
      const n = Number(m[2]);
      const perm = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r *= a - i; return r; };
      const fact = (a) => perm(a, a);
      const p = perm(n, k);
      return {
        answer: p,
        steps: `Finishing ORDER matters here, so this is a permutation: ${n} choices for first, ${n - 1} for second${k > 2 ? `, ${n - 2} for third` : ''}${k > 3 ? ', and so on' : ''} = ${p}.`,
        traps: [
          [p / fact(k), 'divides by the orderings, which is the COMBINATION count — but first and second place are different outcomes'],
          [n * k, 'multiplies the two numbers'],
          [n ** k, 'lets the same runner take more than one place'],
        ],
      };
    },
  },
  {
    id: 'quadratic-solve-factor',
    match: /^Solve for x: x\^2 ([+-]) (\d+)x ([+-]) (\d+) = 0$/,
    solve: (m) => {
      const b = m[1] === '-' ? -Number(m[2]) : Number(m[2]);
      const c = m[3] === '-' ? -Number(m[4]) : Number(m[4]);
      const disc = b * b - 4 * c;
      if (disc < 0) return null;
      const r = Math.sqrt(disc);
      if (!Number.isInteger(r)) return null;
      const r1 = (-b - r) / 2;
      const r2 = (-b + r) / 2;
      const [lo, hi] = [Math.min(r1, r2), Math.max(r1, r2)];
      return {
        answer: `x = ${lo} or x = ${hi}`,
        steps: `Find two numbers multiplying to ${c} and adding to ${b}: ${-lo} and ${-hi} do, so x² ${b < 0 ? '−' : '+'} ${Math.abs(b)}x ${c < 0 ? '−' : '+'} ${Math.abs(c)} = (x ${-lo < 0 ? '−' : '+'} ${Math.abs(lo)})(x ${-hi < 0 ? '−' : '+'} ${Math.abs(hi)}). Setting each factor to zero gives x = ${lo} or x = ${hi}.`,
        traps: [
          [`x = ${-lo} or x = ${-hi}`, 'reads the roots straight off the factors without flipping their signs — (x + 5) = 0 gives x = −5, not +5'],
          [`x = ${b} or x = ${c}`, 'reads the coefficients as the answers'],
          [`x = ${lo} or x = ${-hi}`, 'gets one sign right and one wrong'],
        ],
      };
    },
  },
  {
    id: 'factor-quadratic',
    match: /^Factor completely: x\^2 ([+-]) (\d+)x ([+-]) (\d+)$/,
    solve: (m) => {
      const b = m[1] === '-' ? -Number(m[2]) : Number(m[2]);
      const c = m[3] === '-' ? -Number(m[4]) : Number(m[4]);
      const disc = b * b - 4 * c;
      if (disc < 0) return null;
      const r = Math.sqrt(disc);
      if (!Number.isInteger(r)) return null;
      const p1 = (b - r) / 2;
      const p2 = (b + r) / 2;
      const term = (k) => `(x ${k < 0 ? '- ' : '+ '}${Math.abs(k)})`;
      return {
        answer: [`${term(p1)}${term(p2)}`, `${term(p2)}${term(p1)}`],
        steps: `Look for two numbers that multiply to ${c} and add to ${b}: ${p1} and ${p2}. So the factorisation is ${term(p1)}${term(p2)}.`,
        traps: [
          [`${term(-p1)}${term(-p2)}`, 'flips both signs, which changes the middle term to ' + (-b)],
          [`${term(b)}${term(c)}`, 'drops the coefficients straight into the factors instead of solving for the pair'],
          [`${term(p1)}${term(-p2)}`, 'mixes the signs, giving a difference of squares rather than this trinomial'],
        ],
      };
    },
  },
  {
    id: 'powers-of-i',
    match: /^Simplify: i\^(\d+), where i = √-1\.$/,
    solve: (m) => {
      const n = Number(m[1]);
      const cycle = ['1', 'i', '-1', '-i'];
      const r = n % 4;
      return {
        answer: cycle[r],
        steps: `Powers of i repeat every four: i¹ = i, i² = −1, i³ = −i, i⁴ = 1. ${n} ÷ 4 leaves remainder ${r}, so i^${n} = ${cycle[r]}.`,
        traps: [
          [cycle[(r + 2) % 4], 'is half a cycle out — the sign is wrong'],
          [cycle[(r + 1) % 4], 'is one step out in the cycle, usually from counting the remainder from 1 instead of 0'],
          [cycle[(r + 3) % 4], 'is one step out the other way'],
        ],
      };
    },
  },
  {
    id: 'composition-numeric',
    match: /^If f\(x\) = (-?\d+)x ([+-]) (\d+) and g\(x\) = (-?\d+)x ([+-]) (\d+), what is f\(g\((-?\d+)\)\)\?$/,
    solve: (m) => {
      const fa = Number(m[1]);
      const fb = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const ga = Number(m[4]);
      const gb = m[5] === '-' ? -Number(m[6]) : Number(m[6]);
      const x = Number(m[7]);
      const inner = ga * x + gb;
      const outer = fa * inner + fb;
      return {
        answer: outer,
        steps: `Work from the INSIDE out. g(${x}) = ${ga}(${x}) ${gb < 0 ? '−' : '+'} ${Math.abs(gb)} = ${inner}. Then f(${inner}) = ${fa}(${inner}) ${fb < 0 ? '−' : '+'} ${Math.abs(fb)} = ${outer}.`,
        traps: [
          [ga * (fa * x + fb) + gb, 'computes g(f(x)) instead — composition is not commutative, and the order is the whole question'],
          [inner, 'stops after g and never substitutes into f'],
          [fa * x + fb, 'evaluates f at x directly, skipping g'],
        ],
      };
    },
  },
  {
    id: 'line-through-two-points',
    match: /^What is the equation of the line through \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\) in slope-intercept form\?$/,
    solve: (m) => {
      const [x1, y1, x2, y2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      if (x1 === x2) return null;
      const slope = (y2 - y1) / (x2 - x1);
      const intercept = y1 - slope * x1;
      const sTxt = exactFrom(slope);
      const bTxt = exactFrom(intercept);
      if (sTxt == null || bTxt == null) return null;
      // The bank parenthesizes a FRACTIONAL slope ("(-3/2)x") but not a whole
      // one ("-5x"), so match that rather than bracketing every negative.
      const wrap = (t) => (t.includes('/') ? `(${t})` : t);
      const sPart = wrap(sTxt);
      return {
        answer: `y = ${sPart}x ${intercept < 0 ? '- ' : '+ '}${bTxt.replace('-', '')}`,
        steps: `Slope first: (${y2} − ${y1}) ÷ (${x2} − ${x1}) = ${sTxt}. Then put a point back in to find b: ${y1} = ${sTxt}(${x1}) + b, so b = ${bTxt}.`,
        traps: [
          [`y = ${exactFrom(-slope) != null ? wrap(exactFrom(-slope)) : ''}x ${intercept < 0 ? '- ' : '+ '}${bTxt.replace('-', '')}`, 'has the slope’s sign flipped, usually from subtracting the coordinates in opposite orders on top and bottom'],
          [`y = ${exactFrom(1 / slope) != null ? wrap(exactFrom(1 / slope)) : ''}x ${intercept < 0 ? '- ' : '+ '}${bTxt.replace('-', '')}`, 'inverts the slope, computing run over rise'],
          [`y = ${sPart}x ${y1 < 0 ? '- ' : '+ '}${Math.abs(y1)}`, 'uses a y-coordinate as the intercept without solving for it'],
        ],
      };
    },
  },
  {
    id: 'domain-sqrt',
    match: /^What is the domain of f\(x\) = √\((-?\d*)x ([+-]) (\d+)\)\?$/,
    solve: (m) => {
      const a = m[1] === '' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const bound = -b / a;
      const t = exactFrom(bound) || round(bound, 6);
      const dir = a > 0 ? '≥' : '≤';
      return {
        answer: `x ${dir} ${t}`,
        steps: `A square root needs a non-negative inside: ${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} ≥ 0, so ${a}x ≥ ${-b} and x ${dir} ${t}.${a < 0 ? ' Dividing by a negative flips the inequality.' : ''}`,
        traps: [
          [`x > ${t}`, 'excludes the endpoint; the inside may equal zero, and √0 is perfectly defined'],
          [`x ${a > 0 ? '≤' : '≥'} ${t}`, 'points the inequality the wrong way'],
          [`x ≠ ${t}`, 'is the restriction for a DENOMINATOR, not for a square root'],
        ],
      };
    },
  },
  {
    id: 'domain-rational',
    match: /^What is the domain of f\(x\) = 1\/\((-?\d*)x ([+-]) (\d+)\)\?$/,
    solve: (m) => {
      const a = m[1] === '' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const bad = -b / a;
      const t = exactFrom(bad) || round(bad, 6);
      return {
        answer: `all real numbers except x = ${t}`,
        steps: `Only division by zero is forbidden: ${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = 0 at x = ${t}, so every real number except ${t} is allowed.`,
        traps: [
          [`all real numbers except x = ${exactFrom(-bad) || round(-bad, 6)}`, 'solves the denominator with the sign flipped'],
          ['all real numbers', 'forgets the denominator can vanish'],
          [`x ≥ ${t}`, 'is a square-root style restriction; a fraction excludes one point, it does not cut the line in half'],
        ],
      };
    },
  },
  {
    id: 'pythagorean-identity',
    match: /^If (sin|cos)\(θ\) = (\d+)\/(\d+) and θ is in the first quadrant, what is (sin|cos)\(θ\)\?$/,
    solve: (m) => {
      const given = m[1];
      const n = Number(m[2]);
      const d = Number(m[3]);
      const want = m[4];
      if (given === want) return null;
      const otherN = Math.sqrt(d * d - n * n);
      if (!Number.isInteger(otherN)) return null;
      return {
        answer: frac(otherN, d),
        steps: `Use sin²θ + cos²θ = 1: ${given}θ = ${n}/${d}, so ${want}²θ = 1 − (${n}/${d})² = ${d * d - n * n}/${d * d}, and ${want}θ = ${frac(otherN, d)}. First quadrant, so it is positive.`,
        traps: [
          [frac(n, d), `repeats the value of ${given}θ that was given`],
          [frac(d, otherN), 'inverts the ratio'],
          [frac(d - n, d), `subtracts the numerators (${d} − ${n}) instead of subtracting the SQUARES`],
        ],
      };
    },
  },
  {
    id: 'discriminant-count',
    match: /^How many real solutions does (-?\d*)x\^2 ([+-]) (\d+)x ([+-]) (\d+) = 0 have\?$/,
    solve: (m) => {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = m[4] === '-' ? -Number(m[5]) : Number(m[5]);
      const disc = b * b - 4 * a * c;
      const answer = disc > 0 ? '2 real solutions' : disc === 0 ? 'exactly 1 real solution' : 'no real solutions';
      return {
        answer,
        steps: `The discriminant b² − 4ac decides it without solving: ${b}² − 4(${a})(${c}) = ${b * b} − ${4 * a * c} = ${disc}. ${disc > 0 ? 'Positive, so two real roots.' : disc === 0 ? 'Zero, so one repeated root.' : 'Negative, so no real roots — the parabola misses the x-axis.'}`,
        traps: [
          [disc > 0 ? 'no real solutions' : '2 real solutions', 'reads the sign of the discriminant backwards'],
          ['infinitely many solutions', 'a quadratic with a non-zero leading coefficient can never have infinitely many roots'],
          [disc === 0 ? '2 real solutions' : 'exactly 1 real solution', 'misses that a zero discriminant is the single repeated-root case'],
        ],
      };
    },
  },
  {
    id: 'evaluate-quadratic',
    match: /^If f\(x\) = (-?\d*)x\^2 ([+-]) (\d+)x ([+-]) (\d+), what is f\((-?\d+)\)\?$/,
    solve: (m) => {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = m[4] === '-' ? -Number(m[5]) : Number(m[5]);
      const x = Number(m[6]);
      const v = a * x * x + b * x + c;
      return {
        answer: v,
        steps: `Substitute x = ${x}: ${a}(${x})² ${b < 0 ? '−' : '+'} ${Math.abs(b)}(${x}) ${c < 0 ? '−' : '+'} ${Math.abs(c)} = ${a * x * x} ${b * x < 0 ? '−' : '+'} ${Math.abs(b * x)} ${c < 0 ? '−' : '+'} ${Math.abs(c)} = ${v}.`,
        traps: [
          [a * (x * x) * -1 + b * x + c, `squares ${x} and then applies the minus sign — (${x})² is ${x * x}, positive, because the parentheses square the sign too`],
          [a * x + b * x + c, 'forgets to square x in the first term'],
          [a * x * x + b * x - c, 'mis-signs the constant'],
        ],
      };
    },
  },
  {
    id: 'cube-surface-area',
    match: /^What is the surface area of a cube with edge length ([\d.]+)\?$/,
    solve: (m) => {
      const e = Number(m[1]);
      return {
        answer: 6 * e * e,
        steps: `A cube has 6 identical square faces, each ${e} × ${e} = ${e * e}. So the surface area is 6 × ${e * e} = ${6 * e * e}.`,
        traps: [
          [e * e * e, 'computes the VOLUME (e³) instead of the surface area'],
          [e * e, 'gives the area of a single face'],
          [4 * e * e, 'counts only 4 faces, forgetting the top and bottom'],
        ],
      };
    },
  },
  {
    id: 'discount-then-tax',
    match: /buys a (\w+) originally priced at \$([\d.]+)\. It is on sale for ([\d.]+)% off, and a ([\d.]+)% sales tax is applied to the sale pric/,
    solve: (m, item) => {
      const price = Number(m[2]);
      const off = Number(m[3]) / 100;
      const tax = Number(m[4]) / 100;
      const sale = price * (1 - off);
      const final = sale * (1 + tax);
      // These land on a half-cent often enough to matter ($72.225), and which
      // way that tips is a rounding convention rather than a disagreement about
      // the arithmetic. Leave the value unrounded so the precision tolerance
      // accepts either, and quote the choice's own rendering in the steps so
      // the explanation matches what the student is looking at.
      const keyed = ((item && item.options) || []).find((o) => o.label === item.correctOption);
      const shown = keyed ? keyed.text : money(round(final, 2));
      return {
        answer: final,
        steps: `Discount first, then tax on the DISCOUNTED price: ${money(price)} × ${(1 - off).toFixed(2)} = ${money(round(sale, 2))}, then × ${(1 + tax).toFixed(2)} = ${shown}.`,
        traps: [
          [round(sale, 2), 'stops at the sale price and never adds the tax'],
          [round(price * (1 + tax) * (1 - off), 2), 'taxes the ORIGINAL price first — here it happens to give the same total, but it is the wrong order when the tax base differs'],
          [round(price * (1 - off + tax), 2), 'combines the two percentages into one, which is not how successive percentages work'],
        ],
      };
    },
  },
  {
    id: 'linear-cost-model',
    match: /charges a \$([\d.]+) monthly membership fee plus \$([\d.]+) per class\. If (\w+) takes (\d+) classes in a month, what is the total/,
    solve: (m) => {
      const fee = Number(m[1]);
      const per = Number(m[2]);
      const n = Number(m[4]);
      return {
        answer: round(fee + per * n, 2),
        steps: `A fixed fee plus a rate: ${money(fee)} + ${money(per)} × ${n} = ${money(fee)} + ${money(per * n)} = ${money(round(fee + per * n, 2))}.`,
        traps: [
          [round(fee * n + per, 2), 'multiplies the FEE by the classes instead of the per-class rate — the fee is charged once'],
          [round((fee + per) * n, 2), 'charges the membership fee again for every class'],
          [round(per * n, 2), 'counts only the classes and drops the monthly fee'],
        ],
      };
    },
  },
  {
    id: 'graph-shift-vertical',
    match: /^The graph of y = f\(x\) ([+-]) (\d+) is the graph of y = f\(x\) transformed how\?$/,
    solve: (m) => {
      const up = m[1] === '+';
      const k = Number(m[2]);
      return {
        answer: `shifted ${up ? 'up' : 'down'} ${k} units`,
        steps: `The ${k} is OUTSIDE f, so it changes the output: every y-value moves ${up ? 'up' : 'down'} by ${k}. Outside means vertical and behaves as you would expect; inside f(x ${up ? '+' : '-'} ${k}) would be horizontal and would behave backwards.`,
        traps: [
          [`shifted ${up ? 'down' : 'up'} ${k} units`, 'moves the graph the wrong way — vertical shifts are NOT reversed, only horizontal ones are'],
          [`shifted ${up ? 'left' : 'right'} ${k} units`, 'treats the change as horizontal; a constant outside f only affects y'],
          [`shifted ${up ? 'right' : 'left'} ${k} units`, 'treats the change as horizontal and reverses it'],
        ],
      };
    },
  },
  {
    id: 'vertical-asymptote',
    match: /^What is the vertical asymptote of f\(x\) = \((-?\d*)x ([+-]) (\d+)\)\/\((-?\d*)x ([+-]) (\d+)\)\?$/,
    solve: (m) => {
      const c = m[4] === '' ? 1 : (m[4] === '-' ? -1 : Number(m[4]));
      const d = m[5] === '-' ? -Number(m[6]) : Number(m[6]);
      const a = m[1] === '' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const x = -d / c;
      const t = exactFrom(x) || round(x, 6);
      return {
        answer: `x = ${t}`,
        steps: `A vertical asymptote sits where the DENOMINATOR is zero: ${c}x ${d < 0 ? '−' : '+'} ${Math.abs(d)} = 0 gives x = ${t}.`,
        traps: [
          [`x = ${exactFrom(-b / a) || round(-b / a, 6)}`, 'sets the NUMERATOR to zero — that gives an x-intercept, not an asymptote'],
          [`y = ${exactFrom(a / c) || round(a / c, 6)}`, 'gives the HORIZONTAL asymptote (the ratio of leading coefficients)'],
          [`x = ${exactFrom(d / c) || round(d / c, 6)}`, 'solves the denominator without flipping the sign'],
        ],
      };
    },
  },
  {
    id: 'average-rate-of-change',
    match: /^For f\(x\) = (-?\d*)x\^2 ([+-]) (\d+)x ([+-]) (\d+), what is the average rate of change from x = (-?\d+) to x = (-?\d+)\?$/,
    solve: (m) => {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = m[4] === '-' ? -Number(m[5]) : Number(m[5]);
      const x1 = Number(m[6]);
      const x2 = Number(m[7]);
      const f = (x) => a * x * x + b * x + c;
      const rate = (f(x2) - f(x1)) / (x2 - x1);
      return {
        answer: exactFrom(rate) || round(rate, 6),
        steps: `Average rate of change is the SLOPE between the two points: f(${x1}) = ${f(x1)} and f(${x2}) = ${f(x2)}, so (${f(x2)} − ${f(x1)}) ÷ (${x2} − ${x1}) = ${exactFrom(rate) || round(rate, 6)}.`,
        traps: [
          [f(x2) - f(x1), 'stops at the change in f without dividing by the change in x'],
          [exactFrom((f(x2) + f(x1)) / 2) || round((f(x2) + f(x1)) / 2, 6), 'averages the two function VALUES, which is not a rate at all'],
          [exactFrom((x2 - x1) / (f(x2) - f(x1))) || round((x2 - x1) / (f(x2) - f(x1)), 6), 'inverts the ratio, computing run over rise'],
        ],
      };
    },
  },
  {
    id: 'parallel-perpendicular-slope',
    match: /^What is the slope of a line (parallel|perpendicular) to the line y = \(?(-?\d+(?:\/\d+)?)\)?x ([+-]) (\d+)\?$/,
    solve: (m) => {
      const kind = m[1];
      const slope = num(m[2]);
      if (slope === 0) return null;
      const value = kind === 'parallel' ? slope : -1 / slope;
      const t = exactFrom(value) || round(value, 6);
      return {
        answer: t,
        steps: kind === 'parallel'
          ? `Parallel lines have the SAME slope, so it is ${m[2]}.`
          : `Perpendicular slopes are negative reciprocals: flip ${m[2]} and change the sign to get ${t}. (Check: ${m[2]} × ${t} = −1.)`,
        traps: [
          [exactFrom(kind === 'parallel' ? -1 / slope : slope) || round(kind === 'parallel' ? -1 / slope : slope, 6),
            kind === 'parallel' ? 'gives the PERPENDICULAR slope (negative reciprocal) instead of the same slope' : 'repeats the original slope, which is the PARALLEL answer'],
          [exactFrom(-slope) || round(-slope, 6), 'changes the sign but does not flip the fraction'],
          [exactFrom(1 / slope) || round(1 / slope, 6), 'flips the fraction but does not change the sign'],
        ],
      };
    },
  },
  {
    id: 'circle-center-radius',
    match: /^What is the center and radius of the circle \(x ([+-]) (\d+)\)² \+ \(y ([+-]) (\d+)\)² = (\d+)\?$/,
    solve: (m) => {
      const h = m[1] === '-' ? Number(m[2]) : -Number(m[2]);
      const k = m[3] === '-' ? Number(m[4]) : -Number(m[4]);
      const r2 = Number(m[5]);
      const r = Math.sqrt(r2);
      if (!Number.isInteger(r)) return null;
      return {
        answer: [`center (${h}, ${k}), radius ${r}`, `(${h}, ${k}), r = ${r}`, `center (${h}, ${k}), r = ${r}`],
        steps: `In (x − h)² + (y − k)² = r², the centre is (h, k) and the radius is √r². The signs INVERT: (x ${m[1]} ${m[2]})² means h = ${h}. So the centre is (${h}, ${k}) and the radius is √${r2} = ${r}.`,
        traps: [
          [`center (${-h}, ${-k}), radius ${r}`, 'reads the signs straight off the equation without inverting them'],
          [`center (${h}, ${k}), radius ${r2}`, `gives r² = ${r2} as the radius instead of taking the square root`],
        ],
      };
    },
  },
  {
    id: 'expand-square',
    match: /^Expand: \((-?\d*)x ([+-]) (\d+)\)\^2$/,
    solve: (m) => {
      const a = m[1] === '' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const mid = 2 * a * b;
      const lead = a * a === 1 ? '' : `${a * a}`;
      return {
        answer: `${lead}x^2 ${mid < 0 ? '- ' : '+ '}${Math.abs(mid)}x + ${b * b}`,
        steps: `(ax + b)² = a²x² + 2abx + b², not a²x² + b². The middle term is 2 × ${a} × ${b} = ${mid}. So ${lead}x² ${mid < 0 ? '−' : '+'} ${Math.abs(mid)}x + ${b * b}.`,
        traps: [
          [`${lead}x^2 + ${b * b}`, 'squares each term and drops the middle term entirely — the single most common error with a binomial square'],
          [`${lead}x^2 ${mid < 0 ? '- ' : '+ '}${Math.abs(mid)}x ${b * b < 0 ? '- ' : '- '}${Math.abs(b * b)}`, 'makes the constant negative; squaring b removes the sign'],
          [`${lead}x^2 ${mid < 0 ? '- ' : '+ '}${Math.abs(b)}x + ${b * b}`, 'forgets to double the cross term'],
        ],
      };
    },
  },
  {
    id: 'parabola-vertex',
    match: /^What is the vertex of the parabola y = (-?\d*)x\^2 ([+-]) (\d+)x ([+-]) (\d+)\?$/,
    solve: (m) => {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : Number(m[1]));
      const b = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
      const c = m[4] === '-' ? -Number(m[5]) : Number(m[5]);
      const h = -b / (2 * a);
      const k = a * h * h + b * h + c;
      const ht = exactFrom(h) || round(h, 6);
      const kt = exactFrom(k) || round(k, 6);
      return {
        answer: [`(${ht}, ${kt})`, `(${ht},${kt})`],
        steps: `The axis of symmetry is x = −b/(2a) = −(${b})/(2·${a}) = ${ht}. Substituting back gives y = ${kt}, so the vertex is (${ht}, ${kt}).`,
        traps: [
          [`(${exactFrom(b / (2 * a)) || round(b / (2 * a), 6)}, ${kt})`, 'drops the minus sign in −b/(2a)'],
          [`(${ht}, ${c})`, 'uses the constant term as the y-value instead of substituting x back in'],
          [`(${kt}, ${ht})`, 'reports the coordinates in the wrong order'],
        ],
      };
    },
  },
  {
    id: 'trig-period-amplitude',
    match: /^What is the (period|amplitude) of y = (-?\d+)(sin|cos)\((-?\d+)x\)\?$/,
    solve: (m) => {
      const want = m[1];
      const amp = Math.abs(Number(m[2]));
      const b = Math.abs(Number(m[4]));
      if (want === 'amplitude') {
        return {
          answer: amp,
          steps: `Amplitude is the coefficient in FRONT of the ${m[3]}: |${m[2]}| = ${amp}. It sets how tall the wave is, and the number inside affects only how often it repeats.`,
          traps: [
            [b, `gives ${b}, the number INSIDE the ${m[3]} — that controls the period, not the height`],
            [piText(2 / b), 'gives the period instead of the amplitude'],
          ],
        };
      }
      return {
        answer: piText(2 / b),
        steps: `Period is 2π ÷ |b|, where b is the coefficient on x: 2π ÷ ${b} = ${piText(2 / b)}. A bigger b squeezes the wave, so the period SHRINKS.`,
        traps: [
          [piText(2 * b), 'multiplies by b instead of dividing, stretching the wave when it should compress'],
          [amp, 'gives the amplitude instead of the period'],
          [piText(2), 'gives the period of the plain wave, ignoring the coefficient on x'],
        ],
      };
    },
  },
  {
    id: 'graph-transform-general',
    match: /^The graph of y = (\d+)f\(x\) is the graph of y = f\(x\) transformed how\?$/,
    solve: (m) => {
      const k = Number(m[1]);
      return {
        answer: [`vertically stretched by a factor of ${k}`, `stretched vertically by a factor of ${k}`],
        steps: `The ${k} multiplies the OUTPUT, so every y-value is ${k} times as far from the x-axis: a vertical stretch by a factor of ${k}.`,
        traps: [
          [`horizontally stretched by a factor of ${k}`, 'a constant outside f affects y, not x'],
          [`vertically compressed by a factor of ${k}`, `multiplying by ${k} > 1 stretches; compression is what a fraction would do`],
          [`shifted up ${k} units`, 'multiplying scales the graph; ADDING would shift it'],
        ],
      };
    },
  },
  {
    id: 'graph-shift-horizontal',
    match: /^The graph of y = f\(x ([+-]) (\d+)\) is the graph of y = f\(x\) transformed how\?$/,
    solve: (m) => {
      const plus = m[1] === '+';
      const k = Number(m[2]);
      const dir = plus ? 'left' : 'right';
      return {
        answer: `shifted ${dir} ${k} units`,
        steps: `The ${k} is INSIDE f, so it is a horizontal shift — and horizontal shifts run BACKWARDS. f(x ${plus ? '+' : '−'} ${k}) reaches its usual value ${k} units ${dir === 'left' ? 'earlier' : 'later'}, so the graph moves ${dir} ${k} units.`,
        traps: [
          [`shifted ${plus ? 'right' : 'left'} ${k} units`, 'moves it the intuitive way; inside the function the sign is reversed, which is the entire point of this question'],
          [`shifted ${plus ? 'up' : 'down'} ${k} units`, 'treats an inside change as vertical'],
          [`shifted ${plus ? 'down' : 'up'} ${k} units`, 'treats it as vertical and reverses it too'],
        ],
      };
    },
  },
  {
    id: 'volume-prism',
    match: /^A rectangular prism has dimensions ([\d.]+) by ([\d.]+) by ([\d.]+)\. What is its volume\?$/,
    solve: (m) => {
      const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return {
        answer: a * b * c,
        steps: `Volume of a rectangular prism is length × width × height: ${a} × ${b} × ${c} = ${a * b * c}.`,
        traps: [
          [2 * (a * b + b * c + a * c), 'computes the SURFACE AREA instead of the volume'],
          [a + b + c, 'adds the dimensions'],
          [a * b, 'multiplies only two of the three dimensions'],
        ],
      };
    },
  },
  {
    id: 'volume-pyramid',
    match: /^A square pyramid has a base edge of ([\d.]+) and a height of ([\d.]+)\. What is its volume\?$/,
    solve: (m) => {
      const [e, h] = [Number(m[1]), Number(m[2])];
      const v = e * e * h / 3;
      return {
        answer: exactFrom(v) || round(v, 4),
        steps: `A pyramid is one THIRD of the prism that boxes it in: (1/3) × base area × height = (1/3) × ${e * e} × ${h} = ${exactFrom(v) || round(v, 4)}.`,
        traps: [
          [e * e * h, 'forgets the 1/3 — that is the volume of the surrounding prism'],
          [exactFrom(e * h / 3) || round(e * h / 3, 4), 'uses the base EDGE rather than the base AREA'],
          [exactFrom(e * e * h / 2) || round(e * e * h / 2, 4), 'halves instead of taking a third'],
        ],
      };
    },
  },
  {
    id: 'expected-value-three',
    match: /^A game pays \$([\d.]+) with probability (\d+)\/(\d+), \$([\d.]+) with probability (\d+)\/(\d+), and \$([\d.]+) with probability (\d+)\/(\d+)\./,
    solve: (m) => {
      const pays = [Number(m[1]), Number(m[4]), Number(m[7])];
      const ps = [Number(m[2]) / Number(m[3]), Number(m[5]) / Number(m[6]), Number(m[8]) / Number(m[9])];
      const ev = pays.reduce((a, v, i) => a + v * ps[i], 0);
      return {
        answer: round(ev, 2),
        steps: `Expected value weights each payout by its probability and adds: ${pays.map((v, i) => `${v} × ${round(ps[i], 4)}`).join(' + ')} = ${round(ev, 2)}.`,
        traps: [
          [round(pays.reduce((a, v) => a + v, 0) / 3, 2), 'averages the three payouts evenly, ignoring that they are not equally likely'],
          [pays.reduce((a, v) => a + v, 0), 'adds the payouts without weighting them at all'],
          [Math.max(...pays), 'reports the largest payout'],
        ],
      };
    },
  },
];

/**
 * Build the explanation for one bank item.
 *
 * Returns null when no shape matches, or when the derivation disagrees with the
 * stored key — in that case the item needs a human, not a paragraph. `status`
 * says which, so the caller can report mis-keys separately from misses.
 */
function explainItem(item) {
  if (!item || !item.prompt) return { status: 'unmatched' };
  for (const ex of EXPLAINERS) {
    const m = ex.match.exec(item.prompt);
    if (!m) continue;
    let out;
    try { out = ex.solve(m, item); } catch { return { status: 'solve-threw', explainer: ex.id }; }
    if (!out) return { status: 'solve-declined', explainer: ex.id };

    const keyed = (item.options || []).find((o) => o.label === item.correctOption);
    if (!keyed) return { status: 'no-key', explainer: ex.id };
    // A solver may offer several equally correct renderings of one answer —
    // (x + 4)(x + 6) and (x + 6)(x + 4) are the same factorisation, and which
    // order the bank happens to print is not a disagreement about the maths.
    const forms = Array.isArray(out.answer) ? out.answer : [out.answer];
    if (!forms.some((f) => sameValue(f, keyed.text))) {
      return {
        status: 'key-mismatch',
        explainer: ex.id,
        derived: forms[0],
        stored: keyed.text,
      };
    }

    // Label the item's ACTUAL wrong options against the trap table.
    const named = [];
    for (const opt of item.options) {
      if (opt.label === item.correctOption) continue;
      for (const [value, why] of out.traps) {
        if (value == null) continue;
        if (sameValue(value, opt.text)) { named.push(`${opt.label}) ${opt.text} ${why}`); break; }
      }
    }
    const explanation = `${out.steps}${named.length ? ` Wrong choices: ${named.join('; ')}.` : ''}`;
    return { status: 'ok', explainer: ex.id, explanation, namedDistractors: named.length };
  }
  return { status: 'unmatched' };
}

module.exports = { EXPLAINERS, explainItem, parseNum, sameValue, stripUnits };
