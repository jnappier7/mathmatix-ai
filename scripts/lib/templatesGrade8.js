'use strict';
/**
 * Templates for the five Grade 8 skills with NO bank content anywhere.
 *
 * The other three gaps (equation-word-problems, scatter-plots,
 * correlation-causation) are crosswalk rows, not items — the bank already
 * holds linear-word-problems and scatter-plots-correlation. Only these five
 * have nothing to point at:
 *
 *   volume-scaling            — the k³ relationship; scale-factor is 2-D only
 *   line-of-best-fit          — nothing in the bank models bivariate fit
 *   two-way-tables            — joint/marginal frequency; data-displays is
 *                               bar and line graphs, a different idea
 *   spiral-equations-functions \  end-of-unit MIXED review. Genuinely mixed
 *   spiral-geometry           /   practice is the skill, so the templates
 *                                 draw across topics by design.
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '6-8';

const TEMPLATES = [
  {
    skillId: 'volume-scaling',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const s = int(r, 2, 5), k = pick(r, [2, 3]);
        const v = s * s * s;
        return { prompt: `A cube has edges of ${s} cm. If every edge is multiplied by ${k}, what is the volume of the new cube, in cm³?`,
          value: v * k * k * k,
          explanation: `The original volume is ${s}³ = ${v} cm³. Each edge becomes ${s * k} cm, so the new volume is ${s * k}³ = ${v * k * k * k} cm³. Notice that is ${v} × ${k}³ = ${v} × ${k * k * k}: scaling every length by ${k} scales VOLUME by ${k}³, not by ${k}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const k = pick(r, [2, 3, 4, 5]);
        return { prompt: `A cylinder's radius and height are both multiplied by ${k}. By what factor is its volume multiplied?`,
          value: k * k * k,
          explanation: `Volume depends on three lengths (V = πr²h — two radii and a height). Multiplying every one of them by ${k} multiplies the volume by ${k} × ${k} × ${k} = ${k * k * k}. A common wrong answer is ${k}, which scales only a single dimension.` };
      } },
      { difficulty: 4, gen: (r) => {
        // The stated ratio must be in LOWEST TERMS, or the question reads as
        // sloppy maths and the answer comes out unreduced too (2:4 -> 8:64).
        let a = int(r, 2, 4); let b = a + int(r, 1, 3);
        while (K.gcd(a, b) !== 1) { a = int(r, 2, 4); b = a + int(r, 1, 3); }
        return { prompt: `Two similar rectangular prisms have edge lengths in the ratio ${a}:${b}. What is the ratio of their volumes?`,
          value: `${a * a * a}:${b * b * b}`,
          explanation: `Volumes of similar solids scale as the CUBE of the length ratio: (${a}:${b})³ = ${a}³:${b}³ = ${a * a * a}:${b * b * b}. Answering ${a}:${b} confuses the length ratio with the volume ratio; ${a * a}:${b * b} would be the ratio of surface areas.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const k = idx % 2 === 0 ? 2 : 3;   // cycle, don't trust the draw
        const v = int(r, 2, 9) * 10;
        return { prompt: `A sphere has volume ${v} in³. A second sphere has a radius ${k} times as large. What is its volume, in in³?`,
          value: v * k * k * k,
          explanation: `Radius is a length, so volume scales by ${k}³ = ${k * k * k}. The new volume is ${v} × ${k * k * k} = ${v * k * k * k} in³. You never need the formula itself — only that volume grows with the cube of any length.` };
      } },
    ],
  },

  {
    skillId: 'line-of-best-fit',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        // Alternate which coefficient is asked about. Asking only about slope
        // made every item the same question with a different number — the
        // answer strings differed, so the variety gate passed it, but a
        // student still learns "pick the per-hour option" without reading.
        const m = int(r, 2, 9), b = int(r, 5, 40);
        const OPTS = [
          `Each additional hour of study is associated with about ${m} more points`,
          `A student who studies 0 hours is predicted to score about ${b}`,
          `The highest possible score is ${m}`,
          `${m} students were surveyed`,
        ];
        const askSlope = idx % 2 === 0;
        return { prompt: `A line of best fit for study hours (x) and test score (y) is y = ${m}x + ${b}. What does the ${askSlope ? `SLOPE ${m}` : `Y-INTERCEPT ${b}`} mean in context?`,
          value: askSlope ? OPTS[0] : OPTS[1], options: OPTS, correctOption: askSlope ? 'A' : 'B',
          explanation: askSlope
            ? `Slope is the change in y per one-unit change in x, so ${m} means about ${m} more points for each extra hour of study. ${b} is the intercept — the predicted score at 0 hours.`
            : `The y-intercept is the predicted score when x = 0, i.e. a student who studies 0 hours: about ${b} points. ${m} is the slope, the gain per extra hour.` };
      } },
      { difficulty: 3, gen: (r) => {
        const m = int(r, 2, 8), b = int(r, 10, 40), x = int(r, 3, 9);
        return { prompt: `A line of best fit is y = ${m}x + ${b}. Use it to predict y when x = ${x}.`,
          value: m * x + b,
          explanation: `Substitute x = ${x}: y = ${m}(${x}) + ${b} = ${m * x} + ${b} = ${m * x + b}. A line of best fit gives a PREDICTION, not a guarantee — real data points scatter around it.` };
      } },
      { difficulty: 3, gen: (r) => {
        const m = int(r, 2, 6), b = int(r, 5, 25), x = int(r, 2, 8);
        const actual = m * x + b + pick(r, [-4, -3, 3, 4]);
        const pred = m * x + b;
        return { prompt: `A line of best fit is y = ${m}x + ${b}. A real data point at x = ${x} has y = ${actual}. What is the residual (actual − predicted)?`,
          value: actual - pred,
          explanation: `Predicted: ${m}(${x}) + ${b} = ${pred}. Residual = actual − predicted = ${actual} − ${pred} = ${actual - pred}. A ${actual - pred > 0 ? 'positive' : 'negative'} residual means the real point sits ${actual - pred > 0 ? 'ABOVE' : 'BELOW'} the line.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        // Alternate WHICH part of the model is asked about; asking only about
        // the intercept made all four items share one answer (the build gate
        // caught it), and a student would learn "pick the intercept option".
        const b = int(r, 20, 60), m = int(r, 2, 7);
        const OPTS = [
          `The battery percentage at 0 hours of use`,
          `About ${m}% of battery lost per hour of use`,
          `The number of hours until the battery dies`,
          `The average battery percentage`,
        ];
        const askIntercept = idx % 2 === 0;
        const answer = askIntercept ? OPTS[0] : OPTS[1];
        return { prompt: `For the line of best fit y = −${m}x + ${b} modelling phone battery (y) against hours of use (x), what does the ${askIntercept ? `y-intercept ${b}` : `slope −${m}`} represent?`,
          value: answer, options: OPTS, correctOption: askIntercept ? 'A' : 'B',
          explanation: askIntercept
            ? `The y-intercept is the predicted y when x = 0 — here the starting battery percentage, ${b}%. The −${m} is the slope, a RATE of change.`
            : `Slope is the change in y per one extra hour. It is negative, so the battery FALLS by about ${m}% each hour. The ${b} is the starting percentage at 0 hours.` };
      } },
    ],
  },

  {
    skillId: 'two-way-tables',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 10, 40), b = int(r, 10, 40), c = int(r, 10, 40), d = int(r, 10, 40);
        return { prompt: `A survey recorded: ${a} students walk and play a sport, ${b} students walk and do not play a sport, ${c} students ride the bus and play a sport, ${d} students ride the bus and do not play a sport. How many students play a sport?`,
          value: a + c,
          explanation: `"Plays a sport" spans both travel methods, so add down that column: ${a} + ${c} = ${a + c}. This is a MARGINAL total — a row or column sum, as opposed to a single cell (a joint frequency).` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 10, 30), b = int(r, 10, 30), c = int(r, 10, 30), d = int(r, 10, 30);
        return { prompt: `A two-way table shows: ${a} like pizza and are in Grade 8, ${b} like pizza and are in Grade 7, ${c} like tacos and are in Grade 8, ${d} like tacos and are in Grade 7. How many students were surveyed in total?`,
          value: a + b + c + d,
          explanation: `Every student appears in exactly one cell, so the total is the sum of all four: ${a} + ${b} + ${c} + ${d} = ${a + b + c + d}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 10, 40), c = int(r, 10, 40);
        const total = a + c;
        const g = K.gcd(a, total);
        return { prompt: `Of ${total} students who own a pet, ${a} also have a sibling. What fraction of pet owners have a sibling? Give your answer in lowest terms.`,
          value: `${a / g}/${total / g}`,
          explanation: `This is a CONDITIONAL relative frequency: out of the ${total} pet owners, ${a} have a sibling, so the fraction is ${a}/${total} = ${a / g}/${total / g}. The denominator is the pet-owner total, not the whole survey — that is what makes it conditional.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 30, 50), b = int(r, 5, 15), c = int(r, 5, 15), d = int(r, 30, 50);
        return { prompt: `A two-way table shows ${a} students who study daily passed, ${b} who study daily failed, ${c} who do not study daily passed, and ${d} who do not study daily failed. Does the table suggest an association between studying daily and passing?`,
          value: 'Yes — daily studiers passed at a much higher rate',
          options: [
            'Yes — daily studiers passed at a much higher rate',
            'No — the totals are equal',
            'No — a table can never show association',
            'Yes — but only because more students were surveyed',
          ],
          correctOption: 'A',
          explanation: `Compare RATES, not counts: ${a} of ${a + b} daily studiers passed (${Math.round((100 * a) / (a + b))}%) versus ${c} of ${c + d} non-daily (${Math.round((100 * c) / (c + d))}%). Very different rates suggest an association — though, as always, that is not proof of causation.` };
      } },
    ],
  },

  {
    // Spiral review IS mixed practice, so drawing across topics is the point
    // here rather than a variety workaround.
    skillId: 'spiral-equations-functions',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const a = int(r, 2, 9), x = int(r, 2, 9), b = int(r, 1, 20);
          return { prompt: `Solve for x:  ${a}x + ${b} = ${a * x + b}`, value: x,
            explanation: `Subtract ${b} from both sides: ${a}x = ${a * x}. Divide by ${a}: x = ${x}.` };
        }
        const m = int(r, 2, 6), c = int(r, 1, 9), t = int(r, 2, 7);
        return { prompt: `If f(x) = ${m}x + ${c}, what is f(${t})?`, value: m * t + c,
          explanation: `f(${t}) means substitute ${t} for x: ${m}(${t}) + ${c} = ${m * t} + ${c} = ${m * t + c}.` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const x1 = int(r, 0, 4), y1 = int(r, 0, 6), dx = int(r, 1, 4), dy = int(r, 1, 6);
          const [n, d] = K.reduce(dy, dx);
          return { prompt: `Find the slope of the line through (${x1}, ${y1}) and (${x1 + dx}, ${y1 + dy}).`,
            value: d === 1 ? String(n) : `${n}/${d}`,
            explanation: `Slope = rise/run = (${y1 + dy} − ${y1})/(${x1 + dx} − ${x1}) = ${dy}/${dx}${d === 1 ? ` = ${n}` : ` = ${n}/${d}`}.` };
        }
        const a = int(r, 2, 6), b = int(r, 2, 9), x = int(r, 2, 8);
        return { prompt: `Solve for x:  ${a}(x + ${b}) = ${a * (x + b)}`, value: x,
          explanation: `Divide both sides by ${a}: x + ${b} = ${x + b}. Then subtract ${b}: x = ${x}. (Distributing first also works and gives the same answer.)` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const m = int(r, 2, 5), c = int(r, 1, 9), y = int(r, 20, 60);
          const x = (y - c) / m;
          const yy = m * Math.round(x) + c;
          return { prompt: `For f(x) = ${m}x + ${c}, find x when f(x) = ${yy}.`, value: Math.round(x),
            explanation: `Set ${m}x + ${c} = ${yy}. Subtract ${c}: ${m}x = ${yy - c}. Divide by ${m}: x = ${Math.round(x)}. This runs the function BACKWARDS — you are given the output and want the input.` };
        }
        const a = int(r, 2, 5), b = int(r, 2, 6), x = int(r, 2, 7);
        const left = a * x + b, right = (a - 1) * x + b + x;
        return { prompt: `Is x = ${x} a solution of ${a}x + ${b} = ${right}?`,
          value: left === right ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only if x is positive', 'Cannot be determined'],
          correctOption: left === right ? 'A' : 'B',
          explanation: `Substitute x = ${x}: the left side is ${a}(${x}) + ${b} = ${left}, and the right side is ${right}. They ${left === right ? 'match, so it IS a solution' : 'do not match, so it is not a solution'}.` };
      } },
    ],
  },

  {
    skillId: 'spiral-geometry',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const a = int(r, 30, 80), b = int(r, 30, 80);
          return { prompt: `Two angles of a triangle measure ${a}° and ${b}°. What is the third angle, in degrees?`,
            value: 180 - a - b,
            explanation: `The three angles of a triangle always sum to 180°: 180 − ${a} − ${b} = ${180 - a - b}°.` };
        }
        const x = int(r, 20, 70);
        return { prompt: `Two angles are supplementary. One measures ${x}°. What is the other, in degrees?`,
          value: 180 - x,
          explanation: `Supplementary angles sum to 180°, so the other is 180 − ${x} = ${180 - x}°. (Complementary would sum to 90°.)` };
      } },
      { difficulty: 3, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15]]);
          return { prompt: `A right triangle has legs of ${a} and ${b}. What is the length of the hypotenuse?`,
            value: c,
            explanation: `a² + b² = c²: ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, and √${c * c} = ${c}.` };
        }
        const l = int(r, 2, 9), w = int(r, 2, 9), h = int(r, 2, 9);
        return { prompt: `A rectangular prism measures ${l} by ${w} by ${h} cm. What is its volume, in cm³?`,
          value: l * w * h,
          explanation: `Volume of a prism is length × width × height: ${l} × ${w} × ${h} = ${l * w * h} cm³.` };
      } },
      { difficulty: 4, gen: (r, idx) => {
        const kind = idx % 2;
        if (kind === 0) {
          const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13]]);
          return { prompt: `A right triangle has a hypotenuse of ${c} and one leg of ${a}. What is the other leg?`,
            value: b,
            explanation: `Rearrange a² + b² = c²: b² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${b * b}, so b = ${b}. Subtracting comes first here because the hypotenuse is known.` };
        }
        const r1 = int(r, 2, 6), h = int(r, 3, 9);
        return { prompt: `A cylinder has radius ${r1} cm and height ${h} cm. What is its volume in terms of π, in cm³?`,
          value: `${r1 * r1 * h}π`,
          explanation: `V = πr²h = π(${r1})²(${h}) = π(${r1 * r1})(${h}) = ${r1 * r1 * h}π cm³. Square the radius BEFORE multiplying by the height.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
