'use strict';
/**
 * The Grade 6 and Grade 7 skills with NO bank content to point at.
 *
 * Everything crosswalkable was crosswalked first (17 rows in
 * pathway-crosswalk.manual.json) — surface area to act-volume-surface-area,
 * proportional graphing to proportional-relationships, compound events to
 * compound-probability, and so on. What remains is genuinely unwritten:
 *
 *   parts of an expression   naming terms/coefficients/constants — the bank
 *                            evaluates and simplifies, never names the parts
 *   composite figures        decomposing an L-shape; area word problems are a
 *                            different task
 *   mixed / multi-step       end-of-unit review, mixed BY DESIGN
 *   rational word problems   fractions and decimals in context
 *   cross-sections           slicing a solid
 *   sampling & inference     population vs sample, representativeness,
 *                            estimating from a sample
 *   experimental vs theoretical probability, and simulation
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick, frac } = K;

const GB = '6-8';

const TEMPLATES = [
  // ── Grade 6 ────────────────────────────────────────────────────────────
  {
    skillId: 'g6-parts-of-expressions',
    tiers: [
      { difficulty: 1, gen: (r, idx) => {
        const a = int(r, 2, 9), b = int(r, 2, 15);
        if (idx % 2 === 0) {
          return { prompt: `In the expression ${a}x + ${b}, what is the coefficient of x?`, value: a,
            explanation: `The coefficient is the number MULTIPLYING the variable, so it is ${a}. The ${b} stands alone, which makes it the constant.` };
        }
        return { prompt: `In the expression ${a}x + ${b}, what is the constant term?`, value: b,
          explanation: `The constant is the term with no variable attached — here ${b}. The ${a} is the coefficient of x.` };
      } },
      { difficulty: 2, gen: (r, idx) => {
        // Vary the LENGTH of the expression; a fixed three-term shape made the
        // answer always 3, which is countable without reading.
        const a = int(r, 2, 9), b = int(r, 2, 9), c = int(r, 1, 12), d = int(r, 2, 9);
        const shapes = [
          [`${a}x + ${b}`, 2, `${a}x and ${b}`],
          [`${a}x + ${b}y − ${c}`, 3, `${a}x, ${b}y and ${c}`],
          [`${a}x + ${b}y + ${c} + ${d}z`, 4, `${a}x, ${b}y, ${c} and ${d}z`],
          [`${a}x`, 1, `just ${a}x`],
        ];
        const [expr, n, parts] = shapes[idx % shapes.length];
        return { prompt: `How many terms are in the expression ${expr}?`, value: n,
          explanation: `Terms are the parts separated by + or −: ${parts}. That is ${n} term${n === 1 ? '' : 's'}. Counting variables instead of terms is the usual slip.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const a = int(r, 2, 8), b = int(r, 2, 9);
        if (idx % 2 === 0) {
          return { prompt: `In the expression ${a}(x + ${b}), what is the factor outside the parentheses?`, value: a,
            explanation: `${a} multiplies the whole quantity (x + ${b}), so ${a} is the factor outside. Inside, x and ${b} are the two terms.` };
        }
        const c = int(r, 2, 9);
        return { prompt: `In the expression ${a}x + ${b}x + ${c}, how many LIKE terms are there?`, value: 2,
          explanation: `${a}x and ${b}x both have the same variable to the same power, so they are like terms — 2 of them. ${c} has no variable, so it cannot combine with them.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        // Ask ONE thing. The earlier prompt listed three parts then said "give
        // the coefficient only", which reads as a trick rather than a question.
        const a = int(r, 2, 7), b = int(r, 2, 9), c = int(r, 2, 9);
        const asks = [
          ['the coefficient of y', b, `The number multiplying y is ${b}.`],
          ['the constant term', c, `${c} has no variable attached, so it is the constant.`],
          ['the coefficient of x', a, `The number multiplying x is ${a}.`],
        ];
        const [what, val, why] = asks[idx % asks.length];
        return { prompt: `In the expression ${a}x + ${b}y + ${c}, what is ${what}?`, value: val,
          explanation: `${why} For reference the three terms are ${a}x, ${b}y and ${c}.` };
      } },
    ],
  },

  {
    skillId: 'g6-area-composite-figures',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 3, 9), b = int(r, 2, 7), c = int(r, 2, 6), d = int(r, 2, 6);
        return { prompt: `A figure is made of two rectangles that do not overlap: one is ${a} cm by ${b} cm, the other is ${c} cm by ${d} cm. What is the total area, in cm²?`,
          value: a * b + c * d,
          explanation: `Find each area, then add: ${a} × ${b} = ${a * b} and ${c} × ${d} = ${c * d}, so the total is ${a * b} + ${c * d} = ${a * b + c * d} cm². Composite figures are just pieces you can handle one at a time.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 4, 10), b = int(r, 3, 8), base = int(r, 2, 8), h = int(r, 2, 8);
        const tri = (base * h) / 2;
        return { prompt: `A figure is a ${a} cm by ${b} cm rectangle with a triangle on top. The triangle has base ${base} cm and height ${h} cm. What is the total area, in cm²?`,
          value: a * b + tri,
          explanation: `Rectangle: ${a} × ${b} = ${a * b} cm². Triangle: ½ × ${base} × ${h} = ${tri} cm². Total: ${a * b} + ${tri} = ${a * b + tri} cm². Forgetting the ½ is the most common error here.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 6, 12), b = int(r, 5, 10);
        let s = int(r, 2, 4);
        while (s >= b) s = int(r, 2, 4);
        return { prompt: `A ${a} cm by ${b} cm rectangle has a ${s} cm by ${s} cm square cut out of it. What is the remaining area, in cm²?`,
          value: a * b - s * s,
          explanation: `Whole rectangle: ${a} × ${b} = ${a * b} cm². Removed square: ${s} × ${s} = ${s * s} cm². Remaining: ${a * b} − ${s * s} = ${a * b - s * s} cm². Here you SUBTRACT rather than add, because the piece was taken away.` };
      } },
    ],
  },

  {
    // Mixed review is the skill, so the template draws across the year.
    skillId: 'g6-mixed-problem-solving',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const p0 = int(r, 2, 9) * 5, q = int(r, 2, 9);
          return { prompt: `A pack of ${q} notebooks costs $${p0}. What is the cost per notebook, in dollars?`,
            value: frac(p0, q),
            explanation: `Cost per item is total ÷ count: ${p0} ÷ ${q} = ${frac(p0, q)}. This is a unit rate — the cost for exactly one.` };
        }
        const a = int(r, 20, 90), b = int(r, 10, 40);
        return { prompt: `A tank holds ${a} litres and ${b} litres are used. What percent of the tank remains? Round to the nearest whole percent.`,
          value: Math.round((100 * (a - b)) / a),
          explanation: `Remaining: ${a} − ${b} = ${a - b} litres. As a percent of the original: ${a - b}/${a} = ${Math.round((100 * (a - b)) / a)}%.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const n = int(r, 3, 8), each = int(r, 2, 9), extra = int(r, 5, 30);
          return { prompt: `Each of ${n} friends pays $${each}, and one of them also pays a $${extra} fee. What is the total paid, in dollars?`,
            value: n * each + extra,
            explanation: `The shared part is ${n} × ${each} = ${n * each}. Add the single fee: ${n * each} + ${extra} = ${n * each + extra} dollars.` };
        }
        const w = int(r, 2, 9), l = int(r, 3, 12);
        return { prompt: `A rectangular garden is ${l} m long and ${w} m wide. How much fencing is needed to go all the way around, in metres?`,
          value: 2 * (l + w),
          explanation: `Fencing follows the PERIMETER: 2(${l} + ${w}) = 2(${l + w}) = ${2 * (l + w)} m. Area (${l * w} m²) would be the amount of ground covered, a different question.` };
      } },
      { difficulty: 4, gen: (r) => {
        const price = int(r, 20, 60), pct = pick(r, [10, 20, 25, 50]);
        const off = (price * pct) / 100;
        return { prompt: `A $${price} jacket is ${pct}% off. What is the sale price, in dollars?`,
          value: price - off,
          explanation: `The discount is ${pct}% of ${price} = ${off}. The sale price is ${price} − ${off} = ${price - off} dollars. Answering ${off} gives the amount SAVED, not the price paid.` };
      } },
    ],
  },

  {
    skillId: 'g6-multi-step-reasoning',
    tiers: [
      { difficulty: 3, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const start = int(r, 30, 90), spent = int(r, 5, 20), earned = int(r, 5, 25);
          return { prompt: `Maya has $${start}, spends $${spent}, then earns $${earned}. How much does she have now, in dollars?`,
            value: start - spent + earned,
            explanation: `Work in order: ${start} − ${spent} = ${start - spent}, then ${start - spent} + ${earned} = ${start - spent + earned} dollars.` };
        }
        const boxes = int(r, 3, 9), per = int(r, 4, 12), taken = int(r, 2, 10);
        return { prompt: `There are ${boxes} boxes with ${per} pencils each. If ${taken} pencils are taken out, how many remain?`,
          value: boxes * per - taken,
          explanation: `Total first: ${boxes} × ${per} = ${boxes * per}. Then subtract: ${boxes * per} − ${taken} = ${boxes * per - taken}. Multiplication comes before the subtraction because the boxes must be counted first.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        if (idx % 2 === 0) {
          const total = int(r, 40, 90), frac1 = pick(r, [2, 4, 5]);
          const part = Math.round(total / frac1);
          const t = part * frac1;
          return { prompt: `One-${frac1 === 2 ? 'half' : frac1 === 4 ? 'quarter' : 'fifth'} of a ${t}-page book has been read. How many pages are LEFT?`,
            value: t - part,
            explanation: `Pages read: ${t} ÷ ${frac1} = ${part}. Pages left: ${t} − ${part} = ${t - part}. The question asks what REMAINS, not what was read.` };
        }
        const rate = int(r, 3, 9), hours = int(r, 2, 6), bonus = int(r, 5, 20);
        return { prompt: `A job pays $${rate} per hour plus a $${bonus} bonus. How much is earned for ${hours} hours, in dollars?`,
          value: rate * hours + bonus,
          explanation: `Hourly pay: ${rate} × ${hours} = ${rate * hours}. Add the one-off bonus: ${rate * hours} + ${bonus} = ${rate * hours + bonus} dollars. The bonus is added once, not per hour.` };
      } },
    ],
  },

  // ── Grade 7 ────────────────────────────────────────────────────────────
  {
    skillId: 'g7-rational-word-problems',
    tiers: [
      { difficulty: 2, gen: (r) => {
        // The fraction in the PROMPT must itself be in lowest terms — asking for
        // a reduced answer while writing 2/4 in the question is sloppy maths.
        const [num, den] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]]);
        const batches = int(r, 2, 8);
        return { prompt: `A recipe needs ${num}/${den} cup of sugar per batch. How much sugar is needed for ${batches} batches? Give your answer in lowest terms.`,
          value: frac(num * batches, den),
          explanation: `Multiply the amount per batch by the number of batches: ${num}/${den} × ${batches} = ${num * batches}/${den} = ${frac(num * batches, den)} cups.` };
      } },
      { difficulty: 3, gen: (r) => {
        const price = int(r, 2, 9) + 0.5, qty = int(r, 2, 8);
        const total = Math.round(price * qty * 100) / 100;
        return { prompt: `One notebook costs $${price.toFixed(2)}. What is the cost of ${qty} notebooks, in dollars?`,
          value: total.toFixed(2),
          explanation: `Multiply: ${price.toFixed(2)} × ${qty} = ${total.toFixed(2)} dollars. Line up the decimal point in the product — the answer has the same number of decimal places as the price.` };
      } },
      { difficulty: 4, gen: (r) => {
        const start = int(r, 2, 12), drop = int(r, 5, 20);
        return { prompt: `The temperature is ${start}°C and falls by ${drop}°C. What is the new temperature, in °C?`,
          value: start - drop,
          explanation: `Falling means subtract: ${start} − ${drop} = ${start - drop}°C. The result is ${start - drop < 0 ? 'negative, which is below zero' : 'still above zero'} — dropping past 0 keeps going into the negatives.` };
      } },
      { difficulty: 4, gen: (r) => {
        // Choose the piece COUNT first so the division comes out whole:
        // total = k·num metres cut into k·den pieces. Drawing the length
        // independently gave 8 ÷ 3/4 = 10.666… pieces of ribbon.
        const [num, den] = pick(r, [[1, 2], [1, 4], [3, 4], [1, 3], [2, 3]]);
        const k = int(r, 2, 5);
        const total = k * num;
        const article = /^(8|11|18)$/.test(String(total)) ? 'An' : 'A';
        return { prompt: `${article} ${total}-metre ribbon is cut into pieces ${num}/${den} of a metre long. How many pieces are there?`,
          value: k * den,
          explanation: `Dividing by a fraction means multiplying by its reciprocal: ${total} ÷ ${num}/${den} = ${total} × ${den}/${num} = ${k * den} pieces. Dividing by a number smaller than 1 gives MORE pieces, not fewer.` };
      } },
    ],
  },

  {
    skillId: 'g7-composite-figures',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const a = int(r, 5, 12), b = int(r, 4, 9), base = int(r, 3, 9), h = int(r, 2, 8);
        return { prompt: `A figure is a ${a} m by ${b} m rectangle with a triangle of base ${base} m and height ${h} m attached. What is the total area, in m²?`,
          value: a * b + (base * h) / 2,
          explanation: `Rectangle: ${a} × ${b} = ${a * b} m². Triangle: ½ × ${base} × ${h} = ${(base * h) / 2} m². Total: ${a * b + (base * h) / 2} m².` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 8, 14), b = int(r, 6, 12), c = int(r, 2, 5), d = int(r, 2, 5);
        return { prompt: `An L-shaped room is a ${a} ft by ${b} ft rectangle with a ${c} ft by ${d} ft corner removed. What is the floor area, in ft²?`,
          value: a * b - c * d,
          explanation: `Start with the full rectangle: ${a} × ${b} = ${a * b} ft². Remove the corner: ${c} × ${d} = ${c * d} ft². Floor area: ${a * b} − ${c * d} = ${a * b - c * d} ft².` };
      } },
      { difficulty: 4, gen: (r) => {
        const s = int(r, 4, 9), a = int(r, 2, 6), b = int(r, 2, 6);
        return { prompt: `A square of side ${s} cm sits beside a ${a} cm by ${b} cm rectangle. What is their combined area, in cm²?`,
          value: s * s + a * b,
          explanation: `Square: ${s}² = ${s * s} cm². Rectangle: ${a} × ${b} = ${a * b} cm². Combined: ${s * s} + ${a * b} = ${s * s + a * b} cm².` };
      } },
    ],
  },

  {
    skillId: 'g7-cross-sections',
    tiers: (() => {
      const SHAPES = ['Circle', 'Square', 'Rectangle', 'Triangle'];
      // Twelve distinct cases: three tiers of four, with no repeats. Six was too
      // few — the de-duplicator emptied a whole tier.
      const CASES = [
        ['a cylinder', 'parallel to its base', 'Circle', 'Slicing straight across a cylinder gives the same shape as its base — a circle.'],
        ['a cube', 'parallel to one face', 'Square', 'A cut parallel to a face of a cube matches that face exactly — a square.'],
        ['a square pyramid', 'perpendicular to its base, through the apex', 'Triangle', 'A vertical cut through the apex of a pyramid exposes a triangle.'],
        ['a rectangular prism', 'parallel to its base', 'Rectangle', 'A cut parallel to the base of a rectangular prism matches the base — a rectangle.'],
        ['a cylinder', 'perpendicular to its base, through the centre', 'Rectangle', 'A vertical cut through a cylinder exposes a face as tall as the cylinder and as wide as its diameter — a rectangle.'],
        ['a sphere', 'through its centre', 'Circle', 'Every flat slice of a sphere is a circle; through the centre it is the largest one.'],
        ['a square pyramid', 'parallel to its base', 'Square', 'Slicing a square pyramid parallel to the base gives a smaller square — the same shape as the base.'],
        ['a triangular prism', 'parallel to its triangular base', 'Triangle', 'A cut parallel to the base of a triangular prism matches that base — a triangle.'],
        ['a cone', 'parallel to its base', 'Circle', 'A cut parallel to the base of a cone gives a smaller circle.'],
        ['a cone', 'perpendicular to its base, through the apex', 'Triangle', 'Cutting straight down through the tip of a cone exposes a triangle.'],
        ['a cube', 'perpendicular to one face, straight down', 'Square', 'A straight vertical cut through a cube gives another square face.'],
        ['a rectangular prism', 'perpendicular to its base, straight down the length', 'Rectangle', 'A vertical cut along a rectangular prism exposes a rectangle.'],
      ];
      // Deterministic offset per tier: a random pick collided with already-seen
      // prompts, which the de-duplicator dropped, leaving tiers half-empty.
      const build = (offset) => (r, idx) => {
        const c = CASES[(offset + idx) % CASES.length];
        return { prompt: `What shape is the cross-section when ${c[0]} is sliced ${c[1]}?`,
          value: c[2], options: SHAPES, correctOption: 'ABCD'[SHAPES.indexOf(c[2])], explanation: c[3] };
      };
      return [
        { difficulty: 2, gen: build(0) },
        { difficulty: 3, gen: build(4) },
        { difficulty: 4, gen: build(8) },
      ];
    })(),
  },

  {
    skillId: 'g7-populations-samples',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const total = int(r, 400, 900), n = int(r, 20, 60);
        const asksPopulation = idx % 2 === 0;
        const OPTS = [`All ${total} students in the school`, `The ${n} students surveyed`, `The school principal`, `The survey questions`];
        return { prompt: `A school has ${total} students. ${n} of them are surveyed about lunch. What is the ${asksPopulation ? 'POPULATION' : 'SAMPLE'}?`,
          value: asksPopulation ? OPTS[0] : OPTS[1], options: OPTS, correctOption: asksPopulation ? 'A' : 'B',
          explanation: asksPopulation
            ? `The population is the ENTIRE group you want to know about — all ${total} students. The ${n} surveyed are the sample drawn from it.`
            : `The sample is the part actually surveyed — those ${n} students. All ${total} students form the population.` };
      } },
      { difficulty: 3, gen: (r) => {
        const total = int(r, 300, 800), n = int(r, 20, 50);
        return { prompt: `Of ${total} club members, ${n} are asked their favourite sport. How many members are in the SAMPLE?`,
          value: n,
          explanation: `The sample is the group actually asked: ${n} members. ${total} is the population — everyone the conclusion is meant to describe.` };
      } },
      { difficulty: 4, gen: (r) => {
        const n = int(r, 40, 80), liked = int(r, 10, 30), total = int(r, 400, 900);
        const est = Math.round((liked / n) * total);
        return { prompt: `In a sample of ${n} students, ${liked} said they walk to school. Estimate how many of the ${total} students in the school walk.`,
          value: est,
          explanation: `The sample proportion is ${liked}/${n}. Apply it to the whole population: ${liked}/${n} × ${total} ≈ ${est} students. This is the point of sampling — measure a part, estimate the whole.` };
      } },
    ],
  },

  {
    skillId: 'g7-random-sampling',
    tiers: (() => {
      const OPTS = [
        'Randomly selecting students from the full school roster',
        'Surveying only students on the basketball team',
        'Surveying only students in the library after school',
        'Surveying only the survey-writer\'s friends',
      ];
      return [
        { difficulty: 2, gen: () => ({
          prompt: `A school wants to know how much students like sport. Which sampling method is most REPRESENTATIVE?`,
          value: OPTS[0], options: OPTS, correctOption: 'A',
          explanation: `A random draw from the full roster gives every student an equal chance, so the sample is not tilted. Surveying the basketball team over-represents students who already like sport — that is a biased sample.` }) },
        { difficulty: 3, gen: (r, idx) => {
          // Alternate BIASED and FAIR scenarios so the answer moves. Asking
          // "what is wrong with this?" about an always-biased sample taught
          // "pick the biased option" rather than how to spot bias.
          const CASES = [
            ['shoppers outside a sports shop are surveyed about exercise habits', false,
              'People at a sports shop already exercise more than average, so the sample leans active.'],
            ['names are drawn at random from the full school roster to survey about lunch', true,
              'Every student has an equal chance of selection, so nothing tilts the sample.'],
            ['only students who arrive early are asked about school start times', false,
              'Early arrivers are precisely the people least bothered by an early start.'],
            ['every 10th person on an alphabetical list of all members is surveyed', true,
              'A fixed interval through a complete list gives a spread across the whole population, with no group favoured.'],
          ];
          const c = CASES[idx % CASES.length];
          const O = ['Representative — the sample is fair', 'Biased — one group is over-represented',
            'Biased — the sample is too small', 'Representative — because everyone volunteered'];
          const ans = c[1] ? O[0] : O[1];
          return { prompt: `A survey is run this way: ${c[0]}. Is the sample representative or biased?`,
            value: ans, options: O, correctOption: c[1] ? 'A' : 'B', explanation: c[2] };
        } },
        { difficulty: 4, gen: (r, idx) => {
          // Alternate what is being asked about randomness, so the tier is not
          // one memorised sentence.
          const n = int(r, 3, 8) * 10;
          if (idx % 2 === 0) {
            const O = ['Every member of the population has an equal chance of being chosen',
              `The first ${n} people to volunteer are used`,
              'Only people the researcher knows are used',
              'The largest group is always chosen'];
            return { prompt: `What makes a sample of ${n} people RANDOM?`, value: O[0], options: O, correctOption: 'A',
              explanation: `Randomness is about equal chance of selection, not size. Volunteers self-select, so option B stays biased no matter how large ${n} gets.` };
          }
          const O = [`Increase the sample size and keep selecting at random`,
            `Survey the same ${n} people again`,
            `Drop the results you disagree with`,
            `Ask only people who feel strongly`];
          return { prompt: `A random sample of ${n} gave a rough estimate. What is the best way to improve its RELIABILITY?`,
            value: O[0], options: O, correctOption: 'A',
            explanation: `A larger random sample narrows the variation around the true value. Re-asking the same people adds no new information, and the other options introduce bias.` };
        } },
      ];
    })(),
  },

  {
    skillId: 'g7-informal-inferences',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const n = int(r, 40, 90), yes = int(r, 15, 35), pop = int(r, 300, 900);
        const est = Math.round((yes / n) * pop);
        return { prompt: `In a random sample of ${n} people, ${yes} preferred option A. Estimate how many of ${pop} people prefer option A.`,
          value: est,
          explanation: `Scale the sample proportion up: ${yes}/${n} × ${pop} ≈ ${est}. An inference from a random sample is an ESTIMATE — a different sample would give a slightly different number.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const a = int(r, 55, 75), b = int(r, 20, 40);
        if (idx % 2 === 0) {
          const O = ['Option A is likely more popular in the whole population', 'Option B is more popular', 'The two options are equally popular', 'No inference is possible from a sample'];
          return { prompt: `In a random sample, ${a}% chose A and ${b}% chose B. What is a reasonable inference?`,
            value: O[0], options: O, correctOption: 'A',
            explanation: `A gap of ${a - b} percentage points in a RANDOM sample is large enough to suggest A really is more popular overall. It suggests, it does not prove — samples vary.` };
        }
        const O = ['No — a sample gives an estimate, not certainty', 'Yes — the sample is always exact', 'Yes — if the sample is over 30 people', 'No — samples tell you nothing'];
        return { prompt: `A random sample estimates ${a}% support. Does that mean exactly ${a}% of the population supports it?`,
          value: O[0], options: O, correctOption: 'A',
          explanation: `A sample estimates the population value with some uncertainty. A different random sample would likely give a slightly different percentage — which is why we say "about ${a}%".` };
      } },
    ],
  },

  {
    skillId: 'g7-experimental-theoretical',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        // Vary the EVENT so the answer is not always 1/6.
        const t = int(r, 1, 6);
        const cases = [
          [`rolling a ${t}`, 1, `Exactly one face shows ${t}`],
          ['rolling an even number', 3, 'Three faces are even (2, 4, 6)'],
          ['rolling a number greater than 4', 2, 'Two faces beat 4 (5 and 6)'],
          ['rolling a number less than 6', 5, 'Five faces are below 6 (1–5)'],
        ];
        const [desc, fav, why] = cases[idx % cases.length];
        return { prompt: `A fair six-sided die is rolled. What is the THEORETICAL probability of ${desc}? Give your answer as a fraction in lowest terms.`,
          value: frac(fav, 6),
          explanation: `${why}, out of 6 equally likely faces: ${fav}/6 = ${frac(fav, 6)}. Theoretical probability comes from the design of the experiment, never from trials.` };
      } },
      { difficulty: 3, gen: (r) => {
        const trials = pick(r, [20, 25, 40, 50]), hits = int(r, 4, 15);
        return { prompt: `In ${trials} coin flips, heads came up ${hits} times. What is the EXPERIMENTAL probability of heads? Give your answer as a fraction in lowest terms.`,
          value: frac(hits, trials),
          explanation: `Experimental probability is what actually happened: ${hits} successes out of ${trials} trials = ${frac(hits, trials)}. The theoretical value is 1/2; results drift from it in small samples.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const trials = pick(r, [20, 50, 100]);
        if (idx % 2 === 0) {
          const O = ['They get closer to each other', 'They grow further apart', 'They stay exactly the same', 'They become unrelated'];
          return { prompt: `As the number of trials increases past ${trials}, what usually happens to the experimental and theoretical probabilities?`,
            value: O[0], options: O, correctOption: 'A',
            explanation: `More trials smooth out short-run luck, so the experimental probability tends toward the theoretical one. This is the law of large numbers.` };
        }
        const hits = Math.round(trials / 2) + int(r, 2, 6);
        return { prompt: `A coin flipped ${trials} times landed heads ${hits} times. Is the experimental probability HIGHER or LOWER than the theoretical 1/2?`,
          value: hits > trials / 2 ? 'Higher' : 'Lower',
          options: ['Higher', 'Lower', 'Exactly equal', 'Cannot be compared'],
          correctOption: hits > trials / 2 ? 'A' : 'B',
          explanation: `Experimental: ${hits}/${trials}. Theoretical: 1/2 = ${trials / 2}/${trials}. Since ${hits} is ${hits > trials / 2 ? 'more' : 'fewer'} than ${trials / 2}, the experimental probability is ${hits > trials / 2 ? 'higher' : 'lower'}.` };
      } },
    ],
  },

  {
    skillId: 'g7-probability-simulations',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const trials = pick(r, [50, 100, 200]), hits = int(r, 10, 40);
        return { prompt: `A simulation of ${trials} trials produced ${hits} successes. Based on the simulation, what is the estimated probability of success? Give your answer as a fraction in lowest terms.`,
          value: frac(hits, trials),
          explanation: `A simulation estimates probability the same way an experiment does: successes ÷ trials = ${hits}/${trials} = ${frac(hits, trials)}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const trials = pick(r, [100, 200]), p = pick(r, [10, 20, 25, 50]);
        return { prompt: `A simulation is run ${trials} times to model an event with probability ${p}%. About how many successes are expected?`,
          value: (trials * p) / 100,
          explanation: `Expected successes = probability × trials = ${p}% × ${trials} = ${(trials * p) / 100}. The actual count will vary around this — that variation is what a simulation is designed to show.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const trials = pick(r, [10, 20]);
        if (idx % 2 === 0) {
          const O = [`Run many more trials`, `Run fewer trials`, `Change the rules mid-simulation`, `Only count the successes`];
          return { prompt: `A simulation of only ${trials} trials gave a surprising result. What is the best way to get a more reliable estimate?`,
            value: O[0], options: O, correctOption: 'A',
            explanation: `Small simulations swing widely by chance. Running many more trials narrows the variation and gives an estimate closer to the true probability.` };
        }
        const O = [`Assign digits 0–4 to rain and 5–9 to no rain`, `Assign every digit to rain`, `Use only the digit 7`, `Flip a coin three times`];
        return { prompt: `You want to simulate a 50% chance of rain using random digits 0–9. Which assignment models this correctly?`,
          value: O[0], options: O, correctOption: 'A',
          explanation: `Five of the ten digits (0–4) represent rain, which is exactly 50%. A correct simulation matches the probabilities of the real situation.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
