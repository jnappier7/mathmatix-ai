// scripts/generateActSetItems.js
//
// Generate ACT shared-stimulus sets: two or three questions on one table or
// scenario ("Use the following information to answer questions 12–14").
//
//   node scripts/generateActSetItems.js            # report only
//   node scripts/generateActSetItems.js --write    # write the seed file
//
// Writes seeds/act-sets/act-set-items.generated.json (source
// `act-sets-2026-10`). Seeded and deterministic; tests/unit/actSetItems.test.js
// pins the file to this script and re-solves every question from its own stem.
//
// WHY
// The ACT groups some questions around one shared setup, and every review of
// our practice test so far noted we had none (external audits, 2026-10-05 and
// -07). The guidance was explicit: keep each answer independently obtainable,
// keep the setup visible, and have the questions in a set assess DIFFERENT
// reasoning rather than repeat one calculation. So:
//   - every question's prompt carries the full stimulus — it stands alone in
//     review, in the tutor's prompt, and if a form only places one member;
//   - a set's questions ask different things of the same data (a cost, a
//     break-even point, the model behind it);
//   - items carry setId/setOrder; utils/actTestAssembler.js serves a set
//     together, each member in a slot of its own category, under one header.

const fs = require('fs');
const path = require('path');
const { ri, pick, frac, money, makeBank, mulberry32, seedOf } = require('./lib/actItemGen');

const OUT = path.join(__dirname, '..', 'seeds', 'act-sets', 'act-set-items.generated.json');
const SOURCE = 'act-sets-2026-10';
const WRITE = process.argv.includes('--write');

// A family returns { params, stimulus, questions: [{ skillId, difficulty, ask, key, wrong, explain }] } or null.
const FAMILIES = [
  {
    id: 'two-plans', count: 10,
    gen(rng) {
      const [what, unit] = pick(rng, [['A gym offers two membership plans', 'month'], ['A streaming service offers two plans', 'month'], ['A climbing gym sells two passes', 'month']]);
      const a = pick(rng, [30, 35, 40, 45, 50]), b = a - pick(rng, [5, 10, 15]);
      const m = ri(rng, 4, 12), A = pick(rng, [0, 20, 25, 30, 50]), B = A + (a - b) * m;
      const N = ri(rng, 3, 10);
      if (N === m) return null;
      const stimulus = `${what}. Each plan charges a one-time joining fee plus a fixed charge per ${unit}.\n\nPlan | Joining fee | Charge per ${unit}\nBasic | $${A} | $${a}\nPremium | $${B} | $${b}`;
      return {
        params: `${what},${a},${b},${m},${A},${N}`,
        stimulus,
        questions: [
          {
            skillId: 'act-multi-step-arithmetic', difficulty: 2,
            ask: `What is the total cost of the Basic plan for ${N} ${unit}s, including the joining fee?`,
            key: money(A + a * N),
            wrong: [[money(a * N), 'leaves out the joining fee'], [money(A + a * (N - 1)), `charges only ${N - 1} ${unit}s`], [money((A + a) * N), `charges the joining fee every ${unit}`], [money(B + b * N), 'prices the Premium plan instead']],
            explain: `Joining fee plus ${N} ${unit}s: $${A} + $${a} × ${N} = ${money(A + a * N)}.`,
          },
          {
            skillId: 'act-systems-of-equations', difficulty: 3,
            ask: `After how many ${unit}s will the total cost of the two plans be equal?`,
            key: `${m}`,
            wrong: [[Number.isInteger((B - A) / a) ? `${(B - A) / a}` : null, `divides the fee difference by the Basic charge instead of by the difference in charges`], [`${m + 1}`, 'counts one too many'], [`${a - b}`, 'gives the difference in the monthly charges'], [Number.isInteger(B / (a - b)) && B / (a - b) !== m ? `${B / (a - b)}` : null, `ignores the Basic plan's joining fee`]],
            explain: `Set the totals equal: ${A} + ${a}x = ${B} + ${b}x, so ${a - b}x = ${B - A} and x = ${m}.`,
          },
          {
            skillId: 'act-linear-functions-models', difficulty: 2,
            ask: `Which of the following equations gives the total cost C, in dollars, of the Premium plan for x ${unit}s?`,
            key: `C = ${B} + ${b}x`,
            wrong: [[`C = ${b} + ${B}x`, 'swaps the joining fee and the per-month charge'], [`C = ${B + b}x`, 'charges the joining fee every month'], [`C = ${B} + ${a}x`, 'uses the Basic plan\'s monthly charge']],
            explain: `A one-time $${B} plus $${b} for each of x ${unit}s: C = ${B} + ${b}x.`,
          },
        ],
      };
    },
  },
  {
    id: 'survey', count: 10,
    gen(rng) {
      const [topic, yes, no] = pick(rng, [['whether they would join a robotics club', 'Yes', 'No'], ['whether they ride the bus to school', 'Bus', 'No bus'], ['whether they prefer online or printed books', 'Online', 'Printed']]);
      const a = ri(rng, 4, 20) * 2, b = ri(rng, 4, 20) * 2, c = ri(rng, 4, 20) * 2, d = ri(rng, 4, 20) * 2;
      const rowA = a + b, rowB = c + d, T = rowA + rowB;
      // a clean percent for question 3
      if ((b * 100) % rowA) return null;
      const stimulus = `A school surveyed ${T} students about ${topic}. The results are shown in the table below.\n\nGrade | ${yes} | ${no} | Total\n9th grade | ${a} | ${b} | ${rowA}\n10th grade | ${c} | ${d} | ${rowB}\nTotal | ${a + c} | ${b + d} | ${T}`;
      return {
        params: `${topic},${a},${b},${c},${d}`,
        stimulus,
        questions: [
          {
            skillId: 'act-probability', difficulty: 2,
            ask: `If one of the ${T} students is chosen at random, what is the probability that the student answered "${yes}"?`,
            key: frac(a + c, T),
            wrong: [[frac(a + c, b + d), 'compares the two answers (odds) instead of dividing by the total'], [frac(a, T), 'counts only the 9th graders'], [frac(b + d, T), `gives the probability of "${no}"`]],
            explain: `${a + c} of the ${T} students answered "${yes}": ${frac(a + c, T)}.`,
          },
          {
            skillId: 'act-conditional-probability', difficulty: 3,
            ask: `If one of the 10th graders is chosen at random, what is the probability that the student answered "${yes}"?`,
            key: frac(c, rowB),
            wrong: [[frac(c, T), 'divides by every student, ignoring the condition'], [frac(c, a + c), `divides by everyone who answered "${yes}", which reverses the condition`], [frac(d, rowB), `gives the 10th graders who answered "${no}"`]],
            explain: `Only the ${rowB} 10th graders count; ${c} of them answered "${yes}": ${frac(c, rowB)}.`,
          },
          {
            skillId: 'act-percentages', difficulty: 2,
            ask: `What percent of the 9th graders answered "${no}"?`,
            key: `${(b * 100) / rowA}%`,
            wrong: [[Number.isInteger((b * 100) / T) ? `${(b * 100) / T}%` : null, 'divides by all the students, not the 9th graders'], [`${b}%`, 'reports the count as a percent'], [`${100 - (b * 100) / rowA}%`, `gives the percent who answered "${yes}"`], [Number.isInteger((b * 100) / (b + d)) ? `${(b * 100) / (b + d)}%` : null, `divides by everyone who answered "${no}"`]],
            explain: `${b} of the ${rowA} 9th graders: ${b} ÷ ${rowA} = ${(b * 100) / rowA}%.`,
          },
        ],
      };
    },
  },
  {
    id: 'garden-path', count: 10,
    gen(rng) {
      const L = ri(rng, 4, 12) * 2, W = ri(rng, 3, 9) * 2, p = pick(rng, [2, 3, 4]), r = pick(rng, [3, 4, 5, 6, 8]);
      if (W >= L) return null;
      const OL = L + 2 * p, OW = W + 2 * p;
      const stimulus = `A rectangular garden is ${L} feet long and ${W} feet wide. A path ${p} feet wide surrounds the garden on all four sides, so the garden and path together form a larger rectangle.`;
      return {
        params: `${L},${W},${p},${r}`,
        stimulus,
        questions: [
          {
            skillId: 'act-area-perimeter', difficulty: 3,
            ask: 'What is the area of the path alone, in square feet?',
            key: `${OL * OW - L * W}`,
            wrong: [[`${OL * OW}`, 'gives the area of the garden and path together'], [`${2 * p * (L + W)}`, 'leaves out the four corner squares of the path'], [`${(L + p) * (W + p) - L * W}`, 'adds the path width only once to each dimension']],
            explain: `The outer rectangle is ${L} + 2(${p}) = ${OL} by ${W} + 2(${p}) = ${OW}, so its area is ${OL * OW}. Subtract the garden, ${L * W}: the path is ${OL * OW - L * W} square feet.`,
          },
          {
            skillId: 'act-basic-geometry-measures', difficulty: 3,
            ask: `Fencing will go around the OUTER edge of the path and costs $${r} per foot. What is the cost of the fencing?`,
            key: money(2 * (OL + OW) * r),
            wrong: [[money(2 * (L + W) * r), 'fences the garden instead of the outer edge of the path'], [money(2 * (L + W + 2 * p) * r), 'adds the path width only once in total'], [money((OL + OW) * r), 'counts only two sides']],
            explain: `The outer edge is 2(${OL} + ${OW}) = ${2 * (OL + OW)} feet; at $${r} per foot that is ${money(2 * (OL + OW) * r)}.`,
          },
        ],
      };
    },
  },
  {
    id: 'growth-table', count: 10,
    gen(rng) {
      const [what, unit] = pick(rng, [['The number of members of an online club', 'members'], ['The number of bacteria in a lab culture', 'bacteria'], ['The number of downloads of a new app (in thousands)', 'thousand downloads']]);
      const [kn, kd] = pick(rng, [[2, 1], [3, 1], [3, 2], [5, 4]]);
      const P0 = pick(rng, kd === 1 ? [3, 5, 6, 10, 12] : kd === 2 ? [16, 32, 48, 64] : [256, 512]);
      const val = (t) => (P0 * kn ** t) / kd ** t;
      const ys = [0, 1, 2, 3].map(val);
      const y5 = val(5);
      if (!ys.every(Number.isInteger) || !Number.isInteger(y5)) return null;
      const k = frac(kn, kd);
      const stimulus = `${what} at the start of each year is shown in the table below. The number grows exponentially.\n\nYear | 0 | 1 | 2 | 3\n${unit.charAt(0).toUpperCase() + unit.slice(1)} | ${ys.join(' | ')}`;
      const kText = kd === 1 ? `${kn}` : `(${k})`;
      return {
        params: `${what},${kn}/${kd},${P0}`,
        stimulus,
        questions: [
          {
            skillId: 'act-exponential-models', difficulty: 2,
            ask: 'By what factor does the number grow each year?',
            key: k,
            wrong: [[`${ys[1] - ys[0]}`, 'gives the first year\'s increase, not the factor'], [frac(kn - kd, kd), 'gives the growth RATE (the factor minus 1)'], [frac(ys[2], ys[0]), 'compares years 0 and 2, two steps apart']],
            explain: `Each year's value divided by the year before: ${ys[1]} ÷ ${ys[0]} = ${k}, and the same for every step.`,
          },
          {
            skillId: 'act-exponential-models', difficulty: 3,
            ask: 'If the pattern continues, what will the number be at the start of year 5?',
            key: `${y5}`,
            wrong: [[`${ys[3] + 2 * (ys[3] - ys[2])}`, 'continues by adding the last increase, as if the growth were linear'], [`${val(4)}`, 'stops at year 4'], [`${ys[3] * 2}`, 'doubles year 3 instead of applying the factor twice']],
            explain: `Two more years of growth by ${k}: ${ys[3]} × ${k} × ${k} = ${y5}.`,
          },
          {
            skillId: 'act-function-evaluation-notation', difficulty: 3,
            ask: 'Which of the following functions gives the number N(t) at the start of year t?',
            key: `N(t) = ${P0}${kText}^t`,
            wrong: [[`N(t) = ${P0} + ${ys[1] - ys[0]}t`, 'is the line through the first two points; the table multiplies, it does not add'], [`N(t) = ${kd === 1 ? kn : `(${k})`}(${P0})^t`, 'swaps the starting value and the factor'], [`N(t) = ${ys[1]}${kText}^t`, 'starts from year 1 instead of year 0']],
            explain: `Start at ${P0} (year 0) and multiply by ${k} each year: N(t) = ${P0}${kText}^t.`,
          },
        ],
      };
    },
  },
  {
    id: 'score-list', count: 10,
    gen(rng) {
      const n = 7;
      const xs = Array.from({ length: n }, () => ri(rng, 60, 99));
      const sum = xs.reduce((a, b) => a + b, 0);
      if (sum % n) return null;
      const sorted = xs.slice().sort((a, b) => a - b);
      const med = sorted[3], mean = sum / n, range = sorted[6] - sorted[0];
      if (new Set([med, mean]).size < 2 || new Set(xs).size < n) return null;
      const name = pick(rng, ['Ari', 'Jordan', 'Maya', 'Sam', 'Priya', 'Leo']);
      const stimulus = `${name}'s scores on 7 quizzes this term were: ${xs.join(', ')}.`;
      return {
        params: xs.join(','),
        stimulus,
        questions: [
          {
            skillId: 'act-average-median', difficulty: 2,
            ask: `What is the median of ${name}'s quiz scores?`,
            key: `${med}`,
            wrong: [[`${xs[3]}`, 'takes the middle score in the order given, without sorting'], [`${mean}`, 'gives the mean'], [`${Math.round((sorted[0] + sorted[6]) / 2)}`, 'takes the midpoint of the lowest and highest scores']],
            explain: `Sorted: ${sorted.join(', ')}. The middle (4th) score is ${med}.`,
          },
          {
            skillId: 'act-average-median', difficulty: 2,
            ask: `What is the mean of ${name}'s quiz scores?`,
            key: `${mean}`,
            wrong: [[`${med}`, 'gives the median'], [`${Math.round(sum / 6)}`, 'divides by 6 instead of 7'], [`${Math.round((sorted[0] + sorted[6]) / 2)}`, 'averages only the lowest and highest scores']],
            explain: `The scores add to ${sum}; divided by 7, the mean is ${mean}.`,
          },
          {
            skillId: 'act-center-spread', difficulty: 2,
            ask: `What is the range of ${name}'s quiz scores?`,
            key: `${range}`,
            wrong: [[`${sorted[6]}`, 'gives the highest score'], [`${Math.abs(xs[6] - xs[0])}`, 'subtracts the first and last scores as listed, without sorting'], [`${sorted[5] - sorted[1]}`, 'drops the highest and lowest scores first']],
            explain: `Highest minus lowest: ${sorted[6]} − ${sorted[0]} = ${range}.`,
          },
        ],
      };
    },
  },
];

const bank = makeBank({
  source: SOURCE,
  idPrefix: 'act-set-',
  tags: (fam) => ['act', 'act-math', 'shared-stimulus', `family:${fam.family}`],
});

function generate() {
  const items = [];
  const report = [];
  for (const fam of FAMILIES) {
    const rng = mulberry32(seedOf(`set:${fam.id}`));
    const used = new Set();
    let made = 0, tries = 0;
    while (made < fam.count && tries < fam.count * 500) {
      tries += 1;
      const g = fam.gen(rng);
      if (!g || used.has(g.params)) continue;
      const setNo = String(made + 1).padStart(2, '0');
      const setId = `act-set-${fam.id}-${setNo}`;
      const built = [];
      for (let q = 0; q < g.questions.length; q++) {
        const Q = g.questions[q];
        const item = bank.assemble(
          { id: `${fam.id}-${setNo}`, skillId: Q.skillId, family: fam.id },
          { params: g.params, difficulty: Q.difficulty, prompt: `${g.stimulus}\n\n${Q.ask}`, key: Q.key, wrong: Q.wrong, explain: Q.explain },
          q + 1, rng,
        );
        if (!item) break;
        built.push({ ...item, setId, setOrder: q + 1 });
      }
      if (built.length !== g.questions.length) continue;   // a set ships whole or not at all
      used.add(g.params);
      items.push(...built);
      made += 1;
    }
    report.push([fam.id, made, fam.count]);
  }
  return { items, report };
}

function main() {
  const { items, report } = generate();
  report.forEach(([id, made, want]) => console.log(`  ${String(made).padStart(3)}/${want} sets  ${id}`));
  console.log(`act-sets: ${items.length} items in ${new Set(items.map((i) => i.setId)).size} sets`);
  if (WRITE) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(items, null, 1) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  } else {
    console.log('(report only — pass --write to write the seed file)');
  }
}

if (require.main === module) main();

module.exports = { FAMILIES, generate, SOURCE };
