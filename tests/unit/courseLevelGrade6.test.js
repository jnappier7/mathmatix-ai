'use strict';
/**
 * The 6th-grade at-level check items, RE-SOLVED from their printed text.
 *
 * Nothing here calls the templates' own maths. Each solver reads the numbers
 * back out of the prompt a student sees and works the answer with rules typed
 * in this file by hand; for the conceptual multiple-choice items (statistical
 * questions, what zero means) the key is checked against a table typed here.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelGrade6');

// ── reading numbers ────────────────────────────────────────────────────────

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** "−3/4", "2 1/2", "0.45", "7" → [numerator, denominator]. */
function Q(text) {
  const t = String(text).trim().replace(/[−–]/g, '-');
  let m = t.match(/^(-?)(\d+) (\d+)\/(\d+)$/);
  if (m) return norm([(m[1] ? -1 : 1) * (Number(m[2]) * Number(m[4]) + Number(m[3])), Number(m[4])]);
  m = t.match(/^(-?\d+)\/(\d+)$/);
  if (m) return norm([Number(m[1]), Number(m[2])]);
  m = t.match(/^-?\d+(?:\.(\d+))?$/);
  if (!m) throw new Error(`not a number: ${text}`);
  const scale = 10 ** (m[1] ? m[1].length : 0);
  return norm([Math.round(Number(t) * scale), scale]);
}
function norm([n, d]) {
  const g = gcd(n, d) || 1;
  return d < 0 ? [-n / g, -d / g] : [n / g, d / g];
}
const mul = (a, b) => norm([a[0] * b[0], a[1] * b[1]]);
const div = (a, b) => norm([a[0] * b[1], a[1] * b[0]]);
const add = (a, b) => norm([a[0] * b[1] + b[0] * a[1], a[1] * b[1]]);
const sub = (a, b) => add(a, [-b[0], b[1]]);
const val = (q) => q[0] / q[1];
const asFraction = (q) => (q[1] === 1 ? String(q[0]) : `${q[0]}/${q[1]}`);
const asDecimal = (q) => String(Math.round(val(q) * 1000) / 1000);
const num = (x) => String(Math.round(x * 1000) / 1000);
const pretty = (x) => (x < 0 ? `−${num(-x)}` : num(x));
const simplest = (a, b) => `${a / gcd(a, b)}:${b / gcd(a, b)}`;

const TOK = '(\\d+ \\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)';
const SIGNED = /−?\d+(?:\.\d+)?/g;
const signedAll = (text) => (text.match(SIGNED) || []).map((t) => Number(t.replace('−', '-')));
const must = (m, what) => { if (!m) throw new Error(`cannot read: ${what}`); return m; };
const texts = (item) => item.options.map((o) => o.text);
function only(list, what) {
  if (list.length !== 1) throw new Error(`${what}: expected exactly one, found ${list.length}`);
  return list[0];
}

const sorted = (a) => a.slice().sort((x, y) => x - y);
function median(a) {
  const s = sorted(a);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const rangeOf = (a) => Math.max(...a) - Math.min(...a);
const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function iqrOf(a) {
  const s = sorted(a);
  const half = Math.floor(s.length / 2);
  return median(s.slice(s.length - half)) - median(s.slice(0, half));
}
const madOf = (a) => meanOf(a.map((v) => Math.abs(v - meanOf(a))));

// ── hand-typed tables for the conceptual items ─────────────────────────────

const NUMERICAL_AND_VARIES = [
  'How many pets does each student in the class have?',
  'How many hours did each sixth grader sleep last night?',
  'How many books did each student in the class read this summer?',
  'How many points did the school team score in each game this season?',
  'What was the high temperature in our town on each day in March?',
  'How many minutes does each student in our grade spend eating lunch?',
  'How tall are the students in the sixth grade?',
  'How many minutes does it take each student in the class to get to school?',
];
const STATISTICAL = new Set([
  ...NUMERICAL_AND_VARIES,
  'What kind of pet do the students at our school like best?',
  'How much do the dogs at the animal shelter weigh?',
  'Do the sixth graders at our school feel rested in the morning?',
  'What time do the students in our class wake up on school days?',
  'What type of book do the students in our grade like best?',
  'How many minutes do the sixth graders read each night?',
  'Which sport do the students at our school like best?',
  'How many hours a week do the players on the team practice?',
  'What kind of weather do the students in our class like best?',
  'How many inches of rain fell in our town in each month of last year?',
  'Which cafeteria lunch do the students at our school like best?',
  'How much money do the students in our grade spend on lunch each week?',
  'What color eyes do the students in the class have?',
  'What are the shoe sizes of the students in the class?',
  'How do the students in our class get to school?',
  'How many miles do the teachers at our school drive to work?',
  'How tall are the students in Marco\'s class?',
  'How many books did each student in Priya\'s class read in June?',
]);
const WHY_STATISTICAL = 'The answers will be different from one student or day to the next, so data must be collected to answer it.';

const ZERO_MEANS = [
  [/^Elevations of places/, 'Sea level'],
  [/^A bank records/, 'No money was put in or taken out'],
  [/^An elevator shows/, 'The lobby'],
  [/^A game gives/, 'A turn with no points gained or lost'],
];

// ── the re-solvers ─────────────────────────────────────────────────────────

const SOLVERS = {
  'g6-ratio-language': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/(\d+) ([a-z ]+?) and (\d+) ([a-z ]+?)\. Which is the ratio of (.+) to (.+)\?/))) {
      const count = { [m[2]]: m[1], [m[4]]: m[3] };
      return `${count[m[5]]}:${count[m[6]]}`;
    }
    if ((m = p.match(/(\d+) apples, (\d+) bananas and (\d+) oranges\. What is the ratio of bananas to all the fruit/))) {
      return simplest(Number(m[2]), Number(m[1]) + Number(m[2]) + Number(m[3]));
    }
    if ((m = p.match(/(\d+) [a-z ]+? and (\d+) ([a-z ]+?)\. What is the ratio of (.+) to all the/))) {
      expect(m[4]).toBe(m[3]);
      return simplest(Number(m[2]), Number(m[1]) + Number(m[2]));
    }
    if ((m = p.match(/ratio of pencils to pens in a box is (\d+):(\d+)/))) return `For every ${m[1]} pencils, there are ${m[2]} pens.`;
    if ((m = p.match(/(\d+) wins and (\d+) losses\. What is the ratio of wins to losses/))) return simplest(Number(m[1]), Number(m[2]));
    if ((m = p.match(/has (\d+) students\. (\d+) of them are girls and the rest are boys\. What is the ratio of boys to girls/))) {
      return simplest(Number(m[1]) - Number(m[2]), Number(m[2]));
    }
    if ((m = p.match(/ratio of girls to boys in a club is (\d+):(\d+)\. What fraction of the club members are girls/))) {
      return asFraction(norm([Number(m[1]), Number(m[1]) + Number(m[2])]));
    }
    if ((m = p.match(/(\d+) apple trees and (\d+) pear trees\. Which statement describes the ratio of pear trees to apple trees/))) {
      const [pear, apple] = simplest(Number(m[2]), Number(m[1])).split(':');
      return `For every ${pear} pear trees, there are ${apple} apple trees.`;
    }
    if ((m = p.match(/red beads to blue beads on a necklace is (\d+):(\d+)\. The necklace has (\d+) beads/))) {
      return String((Number(m[3]) / (Number(m[1]) + Number(m[2]))) * Number(m[1]));
    }
    if ((m = p.match(/(\d+) cups of flour for every (\d+) cups of sugar\. Jo writes the ratio of sugar to flour as (\d+):(\d+)/))) {
      expect(`${m[3]}:${m[4]}`).not.toBe(`${m[2]}:${m[1]}`);           // Jo really is wrong
      return `Jo is incorrect: the order is reversed. Sugar to flour is ${m[2]}:${m[1]}.`;
    }
    if ((m = p.match(/^(\d+) out of every (\d+) students .* NOT sixth graders/))) return simplest(Number(m[1]), Number(m[2]) - Number(m[1]));
    if ((m = p.match(/(\d+) cars, (\d+) trucks and (\d+) vans\. What is the ratio of trucks to vehicles that are NOT trucks/))) {
      return simplest(Number(m[2]), Number(m[1]) + Number(m[3]));
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-equivalent-ratios': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/lists [\w ]+: ([\d, ?]+) and [\w ]+: ([\d, ?]+)\. What number replaces/))) {
      const rows = [m[1], m[2]].map((row) => row.split(', '));
      const r = rows.findIndex((row) => row.includes('?'));
      const i = rows[r].indexOf('?');
      const other = rows[1 - r].map(Number);
      return String((Number(rows[r][0]) * other[i]) / other[0]);
    }
    if ((m = p.match(/The ratios (\d+):(\d+) and n:(\d+) are equivalent/))) return String((Number(m[1]) * Number(m[3])) / Number(m[2]));
    if ((m = p.match(/^Which ratio is (NOT )?equivalent to (\d+):(\d+)\?/))) {
      const same = (t) => { const [x, y] = t.split(':').map(Number); return x * Number(m[3]) === y * Number(m[2]); };
      return only(texts(item).filter((t) => same(t) === !m[1]), 'equivalent ratio');
    }
    if ((m = p.match(/(\d+) cups of rice for every (\d+) cups of water\. .* for (\d+) cups of rice/))) return String((Number(m[3]) / Number(m[1])) * Number(m[2]));
    if ((m = p.match(/makes (\d+) servings uses (\d+) cups of flour\. .* make (\d+) servings/))) return num((Number(m[2]) * Number(m[3])) / Number(m[1]));
    if ((m = p.match(/for (\d+) servings uses (\d+) cups of broth\. .* for (\d+) servings/))) return num((Number(m[2]) * Number(m[3])) / Number(m[1]));
    if ((m = p.match(/Sam says (\d+):(\d+) is equivalent to (\d+):(\d+)/))) {
      const [a, b, c, d] = m.slice(1).map(Number);
      expect(a * d).not.toBe(b * c);                                   // Sam really is wrong
      const key = only(texts(item).filter((t) => /^Sam is incorrect\. Equivalent ratios come from multiplying both numbers by the same number/.test(t)), 'Sam');
      const [x, y] = must(key.match(/such as (\d+):(\d+)\.$/), key).slice(1).map(Number);
      expect(x * b).toBe(y * a);                                       // and the example offered IS equivalent
      const other = only(texts(item).filter((t) => /An equivalent ratio is/.test(t)), 'reversed');
      const [u, v] = other.match(/(\d+):(\d+)/).slice(1).map(Number);
      expect(u * b).not.toBe(v * a);
      return key;
    }
    if ((m = p.match(/in the ratio (\d+):(\d+)\. How many cups of blue paint are needed to make (\d+) cups/))) {
      return String((Number(m[3]) / (Number(m[1]) + Number(m[2]))) * Number(m[1]));
    }
    if ((m = p.match(/Mix A uses (\d+) cups of juice concentrate for every (\d+) cups of water\. Mix B uses (\d+) cups of concentrate for every (\d+) cups/))) {
      const [a1, w1, a2, w2] = m.slice(1).map(Number);
      if (a1 * w2 === a2 * w1) return 'They taste equally strong.';
      return a1 * w2 > a2 * w1 ? 'Mix A' : 'Mix B';
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-unit-rates': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/pack of (\d+) notebooks costs \$(\d+)/))) return num(Number(m[2]) / Number(m[1]));
    if ((m = p.match(/Car A travels (\S+) miles in (\S+) hours\. Car B travels (\S+) miles in (\S+) hours/))) {
      return num(Math.abs(Number(m[1]) / Number(m[2]) - Number(m[3]) / Number(m[4])));
    }
    if ((m = p.match(/travels (\d+) miles in (\d+) hours at a constant speed\. What is its speed/))) return num(Number(m[1]) / Number(m[2]));
    if ((m = p.match(/types (\d+) words in (\d+) minutes at a steady rate\. How many words does she type per minute/))) return num(Number(m[1]) / Number(m[2]));
    if ((m = p.match(/walks (\S+) miles in (\d+) hours .* per hour\?/))) return num(Number(m[1]) / Number(m[2]));
    if ((m = p.match(/types (\d+) words in (\d+) minutes\. At that rate, how many words does he type in (\d+) minutes/))) {
      return num((Number(m[1]) / Number(m[2])) * Number(m[3]));
    }
    if ((m = p.match(/^(\d+) pounds of apples cost \$(\S+)\. At that price, how many dollars do (\d+) pounds/))) {
      return num((Number(m[2]) / Number(m[1])) * Number(m[3]));
    }
    if ((m = p.match(/rides (\d+) miles in (\d+) hours .* to ride (\d+) miles/))) return num(Number(m[3]) / (Number(m[1]) / Number(m[2])));
    if ((m = p.match(/leaks (\S+) liters of water in (\d+) hours/))) return num(Number(m[1]) / Number(m[2]));
    if ((m = p.match(/An? (\d+)-pack of granola bars costs \$(\d+\.\d\d)\. An? (\d+)-pack of the same bars costs \$(\d+\.\d\d)\./))) {
      const [n1, n2] = [Number(m[1]), Number(m[3])];
      const cents1 = Math.round(Number(m[2]) * 100) * n2, cents2 = Math.round(Number(m[4]) * 100) * n1;   // per n1·n2 bars
      if (/price per bar of the better buy/.test(p)) return num(Math.min(cents1, cents2) / (n1 * n2) / 100);
      if (cents1 === cents2) return 'Neither: they cost the same per bar.';
      return cents1 < cents2 ? `The ${n1}-pack` : `The ${n2}-pack`;
    }
    if ((m = p.match(/prints (\S+) pages in (\d+) minutes .* to print (\S+) pages/))) return num(Number(m[3]) / (Number(m[1]) / Number(m[2])));
    throw new Error(`no rule for: ${p}`);
  },

  'g6-fraction-multiply-divide': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(new RegExp(`^(?:Divide|Multiply): ${TOK} ([÷×]) ${TOK}\\.`)))) {
      return asFraction(m[2] === '÷' ? div(Q(m[1]), Q(m[3])) : mul(Q(m[1]), Q(m[3])));
    }
    if ((m = p.match(new RegExp(`^How many (\\d+\\/\\d+)-cup servings are in ${TOK} cups?`)))) return asFraction(div(Q(m[2]), Q(m[1])));
    if ((m = p.match(new RegExp(`ribbon ${TOK} yards long is cut into pieces that are each ${TOK} yard long`)))) return asFraction(div(Q(m[1]), Q(m[2])));
    if ((m = p.match(new RegExp(`area of ${TOK} square feet and a width of ${TOK} feet`)))) return asFraction(div(Q(m[1]), Q(m[2])));
    if ((m = p.match(/^(\w+) says (\d+\/\d+) ÷ (\d+\/\d+) = (\S+)\. Which statement is true/))) {
      const quotient = div(Q(m[2]), Q(m[3]));
      expect(asFraction(Q(m[4]))).not.toBe(asFraction(quotient));      // the claim really is wrong
      return `${m[1]} is incorrect: the reciprocal of ${m[3]} was not used. The quotient is ${asFraction(quotient)}.`;
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-formulas-area-volume': (item) => {
    const p = item.prompt;
    const formula = must(p.match(/^Use the formula ([A-Z] = \S+(?: \+ \S+)?)\. /), p)[1];
    const asked = must(p.match(/What is ([A-Za-z]), in /), p)[1];
    const given = {};
    const re = new RegExp(`\\b([A-Za-z]) = ${TOK} (?:cm|in|ft|m)\\b`, 'g');
    for (const g of p.matchAll(re)) given[g[1]] = Q(g[2]);
    const two = [2, 1];
    let answer;
    if (formula === 'A = ½bh') {
      answer = asked === 'A' ? div(mul(given.b, given.h), two) : div(mul(given.A, two), given.b);
    } else if (formula === 'A = bh') {
      answer = asked === 'A' ? mul(given.b, given.h) : div(given.A, given.b);
    } else if (formula === 'V = lwh') {
      answer = asked === 'V' ? mul(mul(given.l, given.w), given.h) : div(given.V, mul(given.l, given.w));
    } else if (formula === 'P = 2l + 2w') {
      answer = asked === 'P' ? add(mul(two, given.l), mul(two, given.w)) : div(sub(given.P, mul(two, given.l)), two);
    } else if (formula === 'V = s³') {
      answer = mul(mul(given.s, given.s), given.s);
    } else throw new Error(`unknown formula ${formula}`);
    for (const q of Object.values(given)) expect(val(q)).toBeGreaterThan(0);
    return /fraction in lowest terms/.test(p) ? asFraction(answer) : asDecimal(answer);
  },

  'g6-nets-surface-area': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/is (\d+) \w+ long, (\d+) \w+ wide and (\d+) \w+ tall\. .* Which expression gives the surface area/))) {
      const [l, w, h] = m.slice(1).map(Number);
      const evaluate = (t) => {
        const js = t.replace(/×/g, '*').replace(/(\d)\(/g, '$1*(');
        expect(js).toMatch(/^[\d\s+*()]+$/);
        return Function(`return (${js});`)();
      };
      return only(texts(item).filter((t) => evaluate(t) === 2 * (l * w + l * h + w * h)), 'surface-area expression');
    }
    if ((m = p.match(/total area of the net is (\d+) \w+²\. How long is each edge/))) return String(Math.sqrt(Number(m[1]) / 6));
    let area = 0, pieces = 0;
    for (const g of p.matchAll(/(\d+) squares? with sides of (\S+) (?:cm|in|ft)/g)) { area += Number(g[1]) * Number(g[2]) ** 2; pieces += Number(g[1]); }
    for (const g of p.matchAll(/(\d+) rectangles? that (?:are each|is) (\S+) \w+ by (\S+) \w+/g)) { area += Number(g[1]) * Number(g[2]) * Number(g[3]); pieces += Number(g[1]); }
    for (const g of p.matchAll(/(\d+) triangles with a base of (\S+) \w+ and a height of (\S+) \w+/g)) { area += (Number(g[1]) * Number(g[2]) * Number(g[3])) / 2; pieces += Number(g[1]); }
    if ((m = p.match(/3 rectangles that measure (.+?)\. What/))) {
      const sides = [...m[1].matchAll(/(\S+) \w+ by (\S+) \w+/g)];
      expect(sides).toHaveLength(3);
      for (const g of sides) { area += Number(g[1]) * Number(g[2]); pieces += 1; }
    }
    if (/cube|rectangular prism/.test(p)) expect(pieces).toBe(6);
    if (/pyramid|triangular prism|open box/.test(p) || /^A net is made/.test(p)) expect(pieces).toBe(5);
    if (/^A net is made/.test(p)) {
      const unit = must(p.match(/sides of \S+ (cm|in|ft)/), p)[1];
      return `A square pyramid with surface area ${num(area)} ${unit}²`;
    }
    return num(area);
  },

  'g6-geometry-applications': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/room is (\d+) feet long and (\d+) feet wide\. Carpet costs \$(\d+) per square foot/))) return String(m[1] * m[2] * m[3]);
    if ((m = p.match(/sandbox is a rectangular prism (\S+) feet long, (\S+) feet wide and (\S+) feet deep/))) return num(m[1] * m[2] * m[3]);
    if ((m = p.match(/sail has a base of (\d+) feet and a height of (\d+) feet/))) return num((m[1] * m[2]) / 2);
    if ((m = p.match(/wall is (\d+) feet long and (\d+) feet high\. One quart of paint covers (\d+) square feet/))) return num((m[1] * m[2]) / m[3]);
    if ((m = p.match(new RegExp(`box is ${TOK} inches long, ${TOK} inches wide and ${TOK} inches tall\\. It is packed with cubes that have (1\\/\\d+)-inch edges`)))) {
      const edge = Q(m[4]);
      return asFraction(mul(mul(div(Q(m[1]), edge), div(Q(m[2]), edge)), div(Q(m[3]), edge)));
    }
    if ((m = p.match(/closed wooden box is (\d+) feet long, (\d+) feet wide and (\d+) feet tall/))) {
      const [l, w, h] = m.slice(1).map(Number);
      return String(2 * l * w + 2 * l * h + 2 * w * h);
    }
    if ((m = p.match(/garden is (\d+) meters long and (\d+) meters wide\. Dana/))) {
      const [l, w] = m.slice(1).map(Number);
      return `${l + l + w + w} meters of border and ${l * w} square meters of mulch`;
    }
    if ((m = p.match(/fish tank is a rectangular prism (\S+) feet long, (\S+) feet wide and (\S+) feet tall/))) return num(m[1] * m[2] * m[3]);
    if ((m = p.match(/packed exactly with (\d+) cubes that each have 1\/2-inch edges/))) return num(Number(m[1]) * 0.5 * 0.5 * 0.5);
    if ((m = p.match(/room is (\d+) feet long, (\d+) feet wide and (\d+) feet high\. Ana paints the four walls and the ceiling/))) {
      const [l, w, h] = m.slice(1).map(Number);
      return String(l * h + l * h + w * h + w * h + l * w);
    }
    if ((m = p.match(/a (\d+)-foot by (\d+)-foot rectangle joined to a (\d+)-foot by (\d+)-foot rectangle, with no overlap\. Flooring costs \$(\d+)/))) {
      return String((m[1] * m[2] + m[3] * m[4]) * m[5]);
    }
    if ((m = p.match(/base (\d+) inches long and (\d+) inches wide\. It holds (\S+) cubic inches of water\. How deep/))) return num(m[3] / (m[1] * m[2]));
    throw new Error(`no rule for: ${p}`);
  },

  'g6-statistical-questions': (item) => {
    const p = item.prompt;
    const opts = texts(item);
    if (/explains why this is a statistical question/.test(p)) {
      const asked = must(p.match(/asks: "(.+?)" Which/), p)[1];
      expect(STATISTICAL.has(asked)).toBe(true);
      return only(opts.filter((t) => t === WHY_STATISTICAL), 'the reason');
    }
    if (/is NOT a statistical question\?$/.test(p)) return only(opts.filter((t) => !STATISTICAL.has(t)), 'non-statistical');
    if (/Which of these is a statistical question\?$/.test(p)) return only(opts.filter((t) => STATISTICAL.has(t)), 'statistical');
    if (/NUMERICAL data that varies/.test(p)) return only(opts.filter((t) => NUMERICAL_AND_VARIES.includes(t)), 'numerical and varies');
    if (/Which rewrite turns it into a statistical question/.test(p)) {
      expect(STATISTICAL.has(must(p.match(/^"(.+?)" is not/), p)[1])).toBe(false);
      return only(opts.filter((t) => STATISTICAL.has(t)), 'statistical rewrite');
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-data-displays': (item) => {
    const p = item.prompt;
    if (/histogram/.test(p)) {
      const bars = [...p.matchAll(/(\d+)–(\d+): (\d+)/g)].map((g) => ({ lo: Number(g[1]), hi: Number(g[2]), n: Number(g[3]), text: `${g[1]}–${g[2]}` }));
      expect(bars).toHaveLength(4);
      let m;
      if (/Which interval has the most/.test(p)) {
        const top = Math.max(...bars.map((b) => b.n));
        return only(bars.filter((b) => b.n === top), 'tallest bar').text;
      }
      if ((m = p.match(/scored less than (\d+)\?/))) return String(bars.filter((b) => b.hi < Number(m[1])).reduce((s, b) => s + b.n, 0));
      if (/Which statement must be true/.test(p)) {
        const total = bars.reduce((s, b) => s + b.n, 0);
        expect(total).toBe(Number(must(p.match(/histogram of (\d+) data values/), p)[1]));
        expect(total % 2).toBe(1);
        let running = 0;
        const middle = bars.find((b) => { running += b.n; return running >= (total + 1) / 2; });
        return `The median is in the interval ${middle.text}.`;
      }
      throw new Error(`no histogram rule for: ${p}`);
    }
    const listing = must(p.match(/\) — (.+?)\. /), p)[1];
    const data = [];
    for (const g of listing.matchAll(/(\d+): (\d+)/g)) for (let i = 0; i < Number(g[2]); i++) data.push(Number(g[1]));
    const counts = {};
    data.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    let m;
    if (/in all\?$/.test(p)) return String(data.length);
    if ((m = p.match(/at least (\d+) (books|siblings)\?/))) {
      const k = data.filter((v) => v >= Number(m[1])).length;
      return /What fraction/.test(p) ? asFraction(norm([k, data.length])) : String(k);
    }
    if (/in the most games\?$/.test(p)) {
      const top = Math.max(...Object.values(counts));
      return only(Object.keys(counts).filter((v) => counts[v] === top), 'mode');
    }
    if (/What is the median/.test(p)) return num(median(data));
    if (/What is the range/.test(p)) return String(rangeOf(data));
    if (/What is the mean/.test(p)) return num(meanOf(data));
    if (/interquartile range/.test(p)) { expect(data).toHaveLength(10); return String(iqrOf(data)); }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-compare-distributions': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/people in a club are ([\d, ]+)\. Which best describes the shape/))) {
      const s = sorted(m[1].split(', ').map(Number));
      let at = 1;
      for (let i = 2; i < s.length; i++) if (s[i] - s[i - 1] > s[at] - s[at - 1]) at = i;
      const low = s.slice(0, at), high = s.slice(at);
      expect(s[at] - s[at - 1]).toBeGreaterThan(3 * Math.max(rangeOf(low), rangeOf(high)));
      if (high.length === 1) return `Clustered from ${low[0]} to ${low[low.length - 1]}, with one outlier at ${high[0]}`;
      expect(low.length).toBe(high.length);
      return `Two clusters, ${low[0]} to ${low[low.length - 1]} and ${high[0]} to ${high[high.length - 1]}, with a gap between them`;
    }
    const sets = {};
    for (const g of p.matchAll(/(Class|Team|Set) ([AB]): ([\d, ]+)\./g)) sets[g[2]] = g[3].split(', ').map(Number);
    for (const g of p.matchAll(/Group ([AB]) has (\d+) students with scores ([\d, ]+)\./g)) {
      sets[g[1]] = g[3].split(', ').map(Number);
      expect(sets[g[1]]).toHaveLength(Number(g[2]));
    }
    const { A, B } = sets;
    const kind = (p.match(/(Class|Team|Set) A:/) || [])[1];
    if (/difference between the two medians/.test(p)) return num(Math.abs(median(A) - median(B)));
    if (/difference between the two ranges/.test(p)) return num(Math.abs(rangeOf(A) - rangeOf(B)));
    if (/difference between the two means/.test(p) || /greater mean exceed the smaller mean/.test(p)) return num(Math.abs(meanOf(A) - meanOf(B)));
    if (/difference between the two interquartile ranges/.test(p)) return num(Math.abs(iqrOf(A) - iqrOf(B)));
    if ((m = p.match(/Both sets have a mean of (\d+)\./))) {
      expect(meanOf(A)).toBe(Number(m[1]));
      expect(meanOf(B)).toBe(Number(m[1]));
      return num(Math.abs(madOf(A) - madOf(B)));
    }
    if (/correctly compares how consistent/.test(p)) {
      expect(rangeOf(A)).not.toBe(rangeOf(B));
      const [steady, other] = rangeOf(A) < rangeOf(B) ? ['A', 'B'] : ['B', 'A'];
      expect(median(sets[steady])).toBeLessThan(median(sets[other]));   // so "its median is greater" is false for the steadier team
      return `Team ${steady} is more consistent, because its range is ${rangeOf(sets[steady])} and Team ${other}'s range is ${rangeOf(sets[other])}.`;
    }
    if (/correctly compares the two sets/.test(p)) {
      expect(median(A)).toBe(median(B));
      expect(meanOf(B)).toBeGreaterThan(meanOf(A));
      return `The medians are equal, and the mean of Set B is ${num(meanOf(B) - meanOf(A))} greater.`;
    }
    if (/Which statement is true\?$/.test(p)) {
      const spread = kind === 'Class' ? rangeOf : iqrOf;
      const word = kind === 'Class' ? 'range' : 'IQR';
      expect(median(A)).not.toBe(median(B));
      expect(spread(A)).not.toBe(spread(B));
      const center = median(A) > median(B) ? 'A' : 'B';
      const wide = spread(A) > spread(B) ? 'A' : 'B';
      return center === wide
        ? `${kind} ${center} has the greater median and the greater ${word}.`
        : `${kind} ${center} has the greater median, and ${kind} ${wide} has the greater ${word}.`;
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-positive-negative-context': (item) => {
    const p = item.prompt;
    let m;
    if (/Which integer represents/.test(p)) {
      const n = Number(must(p.match(/(\d+)/), p)[1]);
      const negative = /below|withdrawal|loses/.test(p);
      expect(negative || /above/.test(p)).toBe(true);
      return String(negative ? -n : n);
    }
    if (/What does 0 represent/.test(p)) return must(ZERO_MEANS.find(([re]) => re.test(p)), p)[1];
    if (/represented by the integer −\d+\?/.test(p)) {
      // loss → negative; gain, above sea level, deposit → positive
      return only(texts(item).filter((t) => /loss|below|withdrawal|owes/i.test(t) && !/gain|above|deposit/i.test(t)), 'negative situation');
    }
    if (/How many degrees colder was the colder town/.test(p)) { const [a, b] = signedAll(p); return String(Math.abs(a - b)); }
    if ((m = p.match(/flies (\d+) feet above sea level\. A fish swims (\d+) feet below sea level/))) return String(Number(m[1]) - -Number(m[2]));
    if ((m = p.match(/^(\w+)'s account balance is −\$(\d+) and (\w+)'s account balance is −\$(\d+)\./))) {
      const who = [[m[1], -Number(m[2])], [m[3], -Number(m[4])]].sort((x, y) => x[1] - y[1]);   // lowest balance first
      return `${who[0][0]} owes more money, because ${pretty(who[0][1])} is less than ${pretty(who[1][1])}.`;
    }
    if ((m = p.match(/goes from floor (\d+) to floor −(\d+)\./))) return String(Number(m[1]) + Number(m[2]));
    if ((m = p.match(/temperatures, in °C: (.+?)\. Which list orders the temperatures from coldest to warmest/))) {
      return sorted(signedAll(m[1])).map(pretty).join(', ');
    }
    if ((m = p.match(/elevation of (\d+) feet\. A fish is at the opposite elevation/))) return String(Number(m[1]) - -Number(m[1]));
    if ((m = p.match(/a cave at (\S+) meters, a hill at (\S+) meters, and a well at (\S+) meters/))) {
      const places = m.slice(1).map((t) => Number(t.replace('−', '-')));
      return String(places.slice().sort((x, y) => Math.abs(x) - Math.abs(y))[0]);
    }
    if ((m = p.match(/four days were (.+?) degrees Celsius/))) { const t = signedAll(m[1]); return String(Math.max(...t) - Math.min(...t)); }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-compare-order-rationals': (item) => {
    const p = item.prompt;
    const v = (t) => val(Q(t));
    let m;
    if ((m = p.match(/^Which list orders the numbers (.+) from (least to greatest|greatest to least)\?$/))) {
      const toks = m[1].split(', ');
      const dir = m[2] === 'least to greatest' ? 1 : -1;
      return toks.slice().sort((x, y) => dir * (v(x) - v(y))).join(', ');
    }
    if ((m = p.match(/^Which of these numbers is the least: (.+)\? Write a decimal\.$/))) return String(Math.min(...m[1].split(', ').map(v)));
    if (/^Which of these inequalities is true\?$/.test(p)) {
      const holds = (t) => { const g = must(t.match(/^(\S+) ([<>]) (\S+)$/), t); return g[2] === '<' ? v(g[1]) < v(g[3]) : v(g[1]) > v(g[3]); };
      return only(texts(item).filter(holds), 'true inequality');
    }
    if ((m = p.match(/^Where is (\S+) located on a horizontal number line\?$/))) {
      const mid = (t) => { const g = must(t.match(/^Halfway between (\S+) and (\S+)$/), t); return (v(g[1]) + v(g[2])) / 2; };
      return only(texts(item).filter((t) => mid(t) === v(m[1])), 'halfway');
    }
    if ((m = p.match(/^The inequality −\$?(\d+)\D* > −\$?(\d+)\D* compares two (temperatures|elevations|account balances)\./))) {
      const [a, b] = [m[1], m[2]];
      expect(-Number(a)).toBeGreaterThan(-Number(b));
      // greater temperature = warmer; greater elevation = higher; greater (less negative) balance = smaller debt
      if (m[3] === 'temperatures') return `It is warmer at −${a}°C than at −${b}°C.`;
      if (m[3] === 'elevations') return `An elevation of −${a} m is higher than an elevation of −${b} m.`;
      return `A balance of −$${a} is a smaller debt than a balance of −$${b}.`;
    }
    if ((m = p.match(/^Which of the numbers (.+) is the greatest\?$/))) {
      const toks = m[1].split(', ');
      const top = Math.max(...toks.map(v));
      return only(toks.filter((t) => v(t) === top), 'greatest');
    }
    if ((m = p.match(/^Which number is between (\S+) and (\S+) on a number line\?$/))) {
      const [lo, hi] = [v(m[1]), v(m[2])].sort((x, y) => x - y);
      return only(texts(item).filter((t) => v(t) > lo && v(t) < hi), 'between');
    }
    if ((m = p.match(/^(\w+) says (\S+) > (\S+) because/))) {
      expect(v(m[2])).toBeLessThan(v(m[3]));                            // the claim is false
      return `${m[1]} is incorrect: ${m[2]} is to the left of ${m[3]} on the number line, so ${m[2]} < ${m[3]}.`;
    }
    if (/Who has the lowest balance\?$/.test(p)) {
      const who = [...p.matchAll(/(\w+) (−?)\$(\d+\.\d\d)/g)].map((g) => [g[1], (g[2] ? -1 : 1) * Number(g[3])]);
      expect(who).toHaveLength(4);
      return who.sort((x, y) => x[1] - y[1])[0][0];
    }
    if ((m = p.match(/^How many of these numbers are less than (\S+): (.+)\?$/))) {
      return String(m[2].split(', ').filter((t) => v(t) < v(m[1])).length);
    }
    throw new Error(`no rule for: ${p}`);
  },

  'g6-distance-coordinate-plane': (item) => {
    const p = item.prompt;
    const pts = [...p.matchAll(/\((−?\d+(?:\.\d+)?), (−?\d+(?:\.\d+)?)\)/g)].map((g) => [Number(g[1].replace('−', '-')), Number(g[2].replace('−', '-'))]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const span = (a) => Math.max(...a) - Math.min(...a);
    const point = (x, y) => `(${pretty(x)}, ${pretty(y)})`;
    const straight = () => {
      expect(pts).toHaveLength(2);
      expect(span(xs) === 0 || span(ys) === 0).toBe(true);
      return span(xs) + span(ys);
    };
    let m;
    if (/^What is the distance, in units, between the points/.test(p)) return num(straight());
    if ((m = p.match(/each grid unit stands for (\d+) blocks/))) return num(straight() * Number(m[1]));
    if (/^A rectangle has vertices at/.test(p)) {
      expect(pts).toHaveLength(4);
      expect(new Set(xs).size).toBe(2);
      expect(new Set(ys).size).toBe(2);
      return String(/perimeter/.test(p) ? 2 * span(xs) + 2 * span(ys) : span(xs) * span(ys));
    }
    if (/Which point is the fourth vertex/.test(p)) {
      const lone = (a) => only(a.filter((c) => a.filter((d) => d === c).length === 1), 'unpaired coordinate');
      return point(lone(xs), lone(ys));
    }
    if (/^Three vertices of a rectangle .* area/.test(p)) return String(span(xs) * span(ys));
    if ((m = p.match(/perimeter of the rectangle is (\d+) units/))) return String((Number(m[1]) - 2 * straight()) / 2);
    if ((m = p.match(/same (horizontal|vertical) line as A, exactly (\d+) units from A, and in Quadrant I\./))) {
      const [x, y] = pts[0], d = Number(m[2]);
      const candidates = m[1] === 'horizontal' ? [[x + d, y], [x - d, y]] : [[x, y + d], [x, y - d]];
      const [bx, by] = only(candidates.filter(([cx, cy]) => cx > 0 && cy > 0), 'Quadrant I point');
      return point(bx, by);
    }
    throw new Error(`no rule for: ${p}`);
  },
};

// ── the suite ──────────────────────────────────────────────────────────────

const expanded = bank.TEMPLATES.map((t) => ({ t, items: expand(t, bank.GB) }));
const all = expanded.flatMap((e) => e.items);

describe('course-level items: 6th grade', () => {
  test('the bank is the 6th-grade course and names thirteen skills', () => {
    expect(bank.COURSE_ID).toBe('6th-grade-math');
    expect(bank.GB).toBe('6-8');
    expect(bank.TEMPLATES).toHaveLength(13);
    for (const t of bank.TEMPLATES) expect(t.courseSkill).toBe(t.skillId);
  });

  test('every template has a re-solver here', () => {
    for (const t of bank.TEMPLATES) expect(typeof SOLVERS[t.skillId]).toBe('function');
    expect(Object.keys(SOLVERS).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('every template has exactly tiers 2, 3 and 4, four items each', () => {
    for (const { t, items } of expanded) {
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(items).toHaveLength(12);
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    }
  });

  test('the builder accepts every item', () => {
    expect(validate(all)).toEqual([]);
  });

  describe.each(expanded.map((e) => [e.t.skillId, e.items]))('%s', (skillId, items) => {
    test.each(items.map((i) => [i.problemId, i]))('%s re-solves to its key', (_id, item) => {
      expect(SOLVERS[skillId](item)).toBe(item.answer.value);
    });
  });

  test('multiple choice: the key is one of four distinct options and not always in one place', () => {
    const choice = all.filter((i) => i.options);
    expect(choice.length).toBeGreaterThan(30);
    for (const i of choice) {
      expect(new Set(i.options.map((o) => o.text)).size).toBe(4);
      expect(i.options.find((o) => o.label === i.correctOption).text).toBe(i.answer.value);
    }
    expect(new Set(choice.map((i) => i.correctOption)).size).toBe(4);
  });

  test('typed answers are one plain number, fraction or ratio — never words or units', () => {
    for (const i of all.filter((x) => !x.options)) {
      expect(i.answer.value).toMatch(/^(-?\d+(\.\d+)?|-?\d+\/\d+|\d+:\d+)$/);
      if (/\//.test(i.answer.value)) expect(i.prompt).toMatch(/fraction/);
      if (/\./.test(i.answer.value)) expect(i.prompt).toMatch(/decimal/);
      if (/:/.test(i.answer.value)) expect(i.prompt).toMatch(/simplest form/);
    }
  });

  test('order-of-numbers options never offer two lists that are both right', () => {
    for (const i of all.filter((x) => /^Which list orders/.test(x.prompt))) {
      const value = (t) => val(Q(t));
      const inOrder = (text) => {
        const v = text.split(', ').map(value);
        const dir = /greatest to least/.test(i.prompt) ? -1 : 1;
        return v.every((x, k) => k === 0 || dir * (x - v[k - 1]) > 0);
      };
      expect(i.options.filter((o) => inOrder(o.text))).toHaveLength(1);
    }
  });
});
