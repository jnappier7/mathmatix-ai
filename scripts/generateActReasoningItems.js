// scripts/generateActReasoningItems.js
//
// Generate the ACT reasoning bank: questions that take two or three connected
// steps, or a model the student has to choose, rather than one direct
// calculation.
//
//   node scripts/generateActReasoningItems.js            # report only
//   node scripts/generateActReasoningItems.js --write    # write the seed file
//
// Writes seeds/act-reasoning/act-reasoning-items.generated.json (source
// `act-reasoning-2026-10`). Seeded and deterministic; tests/unit/
// actReasoningItems.test.js pins the file to this script and re-solves every
// item from its own stem with solvers written independently of these.
//
// WHY THIS BANK EXISTS
// An external review of the live test (2026-10-07) rated "ACT-style
// reasoning" 6/10: "too many direct calculations. More interpretation,
// unfamiliar setups, and connected reasoning." The two largest banks are
// template drops whose items are mostly one operation. Every family here needs
// an intermediate result the stem does not hand over: the trapezoid's height
// from its legs before its area, the tank's progress before the second pump
// joins, whether a table grows by adding or multiplying before any formula.
//
// Each wrong choice is the answer to a NAMED slip on the way, usually stopping
// at the intermediate value or skipping a step, which is what makes these
// diagnostic in review. Machinery (seeding, assembly, the distractor gate) is
// shared with the visual bank: scripts/lib/actItemGen.js.

const fs = require('fs');
const path = require('path');
const { ri, pick, gcd, frac, lineEq, money, makeBank } = require('./lib/actItemGen');

const OUT = path.join(__dirname, '..', 'seeds', 'act-reasoning', 'act-reasoning-items.generated.json');
const SOURCE = 'act-reasoning-2026-10';
const WRITE = process.argv.includes('--write');

const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
const isInt = Number.isInteger;

const FAMILIES = [
  // ─── Geometry ────────────────────────────────────────────────────────────
  {
    id: 'trapezoid-hidden-height', skillId: 'act-area-perimeter', count: 14, kind: 'multi-step',
    gen(rng) {
      const [o, h, L] = pick(rng, [[3, 4, 5], [4, 3, 5], [6, 8, 10], [8, 6, 10], [5, 12, 13], [9, 12, 15], [12, 5, 13], [8, 15, 17]]);
      const b1 = ri(rng, 2, 9) * 2, b2 = b1 + 2 * o;
      const key = ((b1 + b2) / 2) * h;
      return {
        params: `${o},${h},${b1}`, difficulty: 4,
        prompt: `An isosceles trapezoid has parallel sides of lengths ${b1} inches and ${b2} inches, and each of its other two sides is ${L} inches long. What is the area of the trapezoid, in square inches?`,
        key: `${key}`,
        wrong: [
          [`${((b1 + b2) / 2) * L}`, `uses the slanted side, ${L}, as the height`],
          [`${(b1 + b2) * h}`, 'finds the height correctly but forgets to halve the sum of the bases'],
          [`${b1 * h}`, 'multiplies only the shorter base by the height'],
          [`${b2 * h}`, 'multiplies only the longer base by the height'],
        ],
        explain: `The longer base overhangs the shorter by (${b2} − ${b1}) ÷ 2 = ${o} on each side, so each slanted side is the hypotenuse of a right triangle with legs ${o} and h: h = √(${L}² − ${o}²) = ${h}. Area = ½(${b1} + ${b2})(${h}) = ${key}.`,
      };
    },
  },
  {
    id: 'inscribed-figures', skillId: 'act-circles', count: 13, kind: 'multi-step',
    gen(rng) {
      if (rng() < 0.5) {
        const r = ri(rng, 2, 9);
        const key = 2 * r * r;
        return {
          params: `sq-in-circle,${r}`, difficulty: 4,
          prompt: `A square is inscribed in a circle of radius ${r} centimeters, so all four of its vertices lie on the circle. What is the area of the square, in square centimeters?`,
          key: `${key}`,
          wrong: [[`${4 * r * r}`, `uses the diameter, ${2 * r}, as the side of the square; the diameter is the square's DIAGONAL`], [`${r * r}`, 'uses the radius as the side'], [`${r * r}π`, 'finds the area of the circle instead']],
          explain: `The square's diagonal is a diameter, ${2 * r}. A square with diagonal d has area d²/2 = ${4 * r * r}/2 = ${key}.`,
        };
      }
      const s = ri(rng, 1, 6) * 2;
      const q = (s * s) / 4;
      const key = `${s * s} - ${q}π`;
      return {
        params: `circle-in-sq,${s}`, difficulty: 4,
        prompt: `A circle is inscribed in a square with sides ${s} feet long, so the circle touches all four sides. What is the area, in square feet, of the region inside the square but outside the circle?`,
        key,
        wrong: [[`${s * s} - ${s * s}π`, `uses the side, ${s}, as the circle's radius; the radius is half the side`], [`${q}π`, 'gives the area of the circle, not the region outside it'], [`${s * s} - ${s}π`, 'uses πd for the circle\'s area — that is its circumference']],
        explain: `The circle's diameter equals the side, ${s}, so its radius is ${s / 2} and its area is π(${s / 2})² = ${q}π. Square minus circle: ${s * s} − ${q}π.`,
      };
    },
  },
  {
    id: 'shadow-similar', skillId: 'act-similar-congruent-figures', count: 14, kind: 'multi-step',
    gen(rng) {
      const p = pick(rng, [5, 6]), sp = pick(rng, [2, 3, 4, 8, 10]), k = ri(rng, 3, 9);
      const st = sp * k, key = p * k;
      if (sp === p) return null;
      return {
        params: `${p},${sp},${k}`, difficulty: 3,
        prompt: `At the same time of day, a ${p}-foot-tall person casts a shadow ${sp} feet long and a tree casts a shadow ${st} feet long. How tall is the tree, in feet?`,
        key: `${key}`,
        wrong: [[isInt((st * sp) / p) ? `${(st * sp) / p}` : null, 'sets up the proportion upside down, height over shadow on one side and shadow over height on the other'], [`${p * k + sp}`, 'scales the height and then adds the person\'s shadow'], [`${st + (p - sp)}`, 'adds the difference between height and shadow instead of scaling'], [`${st}`, 'gives the tree\'s shadow, not its height']],
        explain: `The sun's angle is the same, so height ÷ shadow is the same for both: ${p}/${sp} = h/${st}, and h = ${p} × ${st} ÷ ${sp} = ${key}.`,
      };
    },
  },
  {
    id: 'trig-to-area', skillId: 'act-right-triangle-trigonometry', count: 14, kind: 'multi-step',
    gen(rng) {
      const [a, b, c] = pick(rng, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
      const k = ri(rng, 1, 4), H = c * k;
      const fn = pick(rng, ['sin', 'cos']);
      const opp = a * k, adj = b * k;
      const key = (opp * adj) / 2;
      if (!isInt(key)) return null;
      const ratioText = fn === 'sin' ? frac(a, c) : frac(b, c);
      return {
        params: `${a},${k},${fn}`, difficulty: 4,
        prompt: `In right triangle ABC, angle C is the right angle, ${fn} A = ${ratioText}, and the hypotenuse AB is ${H} units long. What is the area of triangle ABC, in square units?`,
        key: `${key}`,
        wrong: [[`${opp * adj}`, 'finds both legs but forgets the ½'], [`${(H * (fn === 'sin' ? opp : adj)) / 2}`, 'multiplies the hypotenuse by one leg, but the hypotenuse is not a height here'], [`${(a * b) / 2}`, 'uses the triangle\'s ratio numbers as if they were the side lengths']],
        explain: `${fn} A = ${ratioText} with hypotenuse ${H} gives the ${fn === 'sin' ? 'opposite' : 'adjacent'} leg ${fn === 'sin' ? opp : adj}; the Pythagorean theorem gives the other leg, ${fn === 'sin' ? adj : opp}. Area = ½ × ${opp} × ${adj} = ${key}.`,
      };
    },
  },

  // ─── Integrating Essential Skills ────────────────────────────────────────
  {
    id: 'second-pump', skillId: 'act-rates-unit-conversion', count: 14, kind: 'multi-step',
    gen(rng) {
      const a = pick(rng, [10, 15, 20, 25]), b = pick(rng, [5, 10, 15, 20, 30]), t1 = pick(rng, [4, 6, 8, 10, 12]);
      const rest = ri(rng, 4, 12) * (a + b);
      const Cap = a * t1 + rest, key = t1 + rest / (a + b);
      return {
        params: `${a},${b},${t1},${rest}`, difficulty: 4,
        prompt: `A tank holds ${Cap} gallons. Pump A starts filling the empty tank at ${a} gallons per minute. After ${t1} minutes, Pump B starts as well, adding ${b} gallons per minute, and both run until the tank is full. How many minutes after Pump A started is the tank full?`,
        key: `${key}`,
        wrong: [
          [`${rest / (a + b)}`, `is the time BOTH pumps run; it leaves out the first ${t1} minutes`],
          [isInt(Cap / (a + b)) ? `${t1 + Cap / (a + b)}` : null, `forgets that Pump A had already added ${a * t1} gallons before Pump B started`],
          [isInt(Cap / (a + b)) ? `${Cap / (a + b)}` : null, 'treats both pumps as running the whole time'],
          [isInt(Cap / a) ? `${Cap / a}` : null, 'is how long Pump A would take alone'],
        ],
        explain: `In the first ${t1} minutes Pump A adds ${a} × ${t1} = ${a * t1} gallons, leaving ${rest}. Together the pumps add ${a + b} gallons per minute, so that takes ${rest} ÷ ${a + b} = ${rest / (a + b)} more minutes: ${key} in all.`,
      };
    },
  },
  {
    id: 'successive-percent', skillId: 'act-percentages', count: 14, kind: 'multi-step',
    gen(rng) {
      const P = pick(rng, [40, 60, 80, 120, 160, 200, 240]), a = pick(rng, [10, 20, 25, 50]), b = pick(rng, [10, 20, 25, 40]);
      const up = rng() < 0.5;
      const f1 = up ? 1 + a / 100 : 1 - a / 100, f2 = up ? 1 - b / 100 : 1 + b / 100;
      const key = Math.round(P * f1 * f2 * 100) / 100;
      if (Math.abs(P * f1 * f2 * 100 - Math.round(P * f1 * f2 * 100)) > 1e-6) return null;
      const naive = Math.round(P * (1 + (up ? a - b : b - a) / 100) * 100) / 100;
      return {
        params: `${P},${a},${b},${up}`, difficulty: 3,
        prompt: `A jacket's price of ${money(P)} was ${up ? 'raised' : 'lowered'} by ${a}%. A month later, the new price was ${up ? 'lowered' : 'raised'} by ${b}%. What was the final price?`,
        key: money(key),
        wrong: [
          [money(naive), `combines the two changes into one ${up ? a - b : b - a}% change, but the second percent applies to the NEW price`],
          [money(Math.round(P * f1 * 100) / 100), 'stops after the first change'],
          [money(Math.round(P * (up ? 1 - b / 100 : 1 + b / 100) * 100) / 100), `applies only the ${b}% change, to the original price`],
          [money(P), 'assumes the two changes cancel'],
        ],
        explain: `First change: ${money(P)} × ${f1} = ${money(Math.round(P * f1 * 100) / 100)}. The second percent applies to that: × ${f2} = ${money(key)}.`,
      };
    },
  },
  {
    id: 'mean-after-removal', skillId: 'act-average-median', count: 14, kind: 'multi-step',
    gen(rng) {
      const n = ri(rng, 4, 8), m = ri(rng, 8, 30), m2 = m + pick(rng, [-3, -2, -1, 1, 2, 3]);
      const removed = n * m - (n - 1) * m2;
      if (removed <= 0 || removed === m) return null;
      return {
        params: `${n},${m},${m2}`, difficulty: 3,
        prompt: `The mean of ${n} numbers is ${m}. When one of the numbers is removed, the mean of the remaining ${n - 1} numbers is ${m2}. What number was removed?`,
        key: `${removed}`,
        wrong: [[`${Math.abs(m - m2)}`, 'gives the change in the mean, not the number'], [`${m}`, 'assumes the removed number equals the old mean'], [`${n * m}`, 'stops at the original total'], [`${n * Math.abs(m - m2)}`, 'multiplies the change in the mean by the count']],
        explain: `Totals, not means: the ${n} numbers add to ${n} × ${m} = ${n * m}, and the remaining ${n - 1} add to ${n - 1} × ${m2} = ${(n - 1) * m2}. The removed number is ${n * m} − ${(n - 1) * m2} = ${removed}.`,
      };
    },
  },
  {
    id: 'work-backwards', skillId: 'act-multi-step-arithmetic', count: 14, kind: 'multi-step',
    gen(rng) {
      const a = pick(rng, [2, 3, 4, 5]), b = pick(rng, [2, 3, 4, 5]);
      const S = a * b * ri(rng, 2, 8) * 5;
      const after1 = S - S / a, L = after1 - after1 / b;
      const wrongOrig = L / (1 - 1 / a - 1 / b);
      return {
        params: `${a},${b},${S}`, difficulty: 4,
        prompt: `Dana spent 1/${a} of her savings on a bike, then spent 1/${b} of what was left on a helmet. She had $${L} left. How many dollars did she have before buying the bike?`,
        key: `${S}`,
        wrong: [
          [isInt(wrongOrig) && wrongOrig > 0 ? `${wrongOrig}` : null, `takes both fractions of the ORIGINAL amount; the 1/${b} came out of what was left`],
          [`${after1}`, 'undoes only the helmet, which gives what she had after the bike'],
          [isInt(L / a + L / b) ? `${L + L / a + L / b}` : null, 'adds fractions of what was left over instead of undoing each step'],
          [`${L * a}`, 'undoes only one step'],
        ],
        explain: `Work backwards. Spending 1/${b} left ${b - 1}/${b} of the after-bike amount, so that amount was ${L} ÷ (${b - 1}/${b}) = ${after1}. Spending 1/${a} left ${a - 1}/${a} of her savings, so she started with ${after1} ÷ (${a - 1}/${a}) = ${S}.`,
      };
    },
  },

  // ─── Algebra ─────────────────────────────────────────────────────────────
  {
    id: 'count-integer-solutions', skillId: 'act-linear-inequalities', count: 14, kind: 'multi-step',
    gen(rng) {
      const k = pick(rng, [2, 3, 4]), d = ri(rng, -5, 5);
      const lo = ri(rng, -12, 4), hi = lo + ri(rng, 8, 20);
      // lo < kx + d ≤ hi  →  (lo − d)/k < x ≤ (hi − d)/k
      const xmin = Math.floor((lo - d) / k) + 1, xmax = Math.floor((hi - d) / k);
      const count = xmax - xmin + 1;
      if (count < 3) return null;
      const bothIn = Math.floor((hi - d) / k) - Math.ceil((lo - d) / k) + 1;
      return {
        params: `${k},${d},${lo},${hi}`, difficulty: 4,
        prompt: `How many integers x satisfy ${lo} < ${k}x ${d < 0 ? '-' : '+'} ${Math.abs(d)} ≤ ${hi}?`,
        key: `${count}`,
        wrong: [[`${count + 1}`, 'counts one endpoint the strict inequality excludes, or counts the gap between the bounds instead of the integers'], [`${hi - lo}`, `counts the integers between ${lo} and ${hi}, before solving for x`], [`${count - 1}`, 'drops an endpoint the ≤ includes'], [bothIn !== count ? `${bothIn}` : null, 'treats both ends as included']],
        explain: `${d < 0 ? `Add ${-d}` : `Subtract ${d}`} and divide by ${k}: ${frac(lo - d, k)} < x ≤ ${frac(hi - d, k)}. The integers in that interval run from ${xmin} to ${xmax}: ${count} of them.`,
      };
    },
  },
  {
    id: 'candle-model', skillId: 'act-word-problems-modeling', count: 14, kind: 'multi-step',
    gen(rng) {
      // A real candle: 6 to 15 inches, burning out in a whole number of hours.
      const r = pick(rng, [0.5, 1, 1.5, 2]), T0 = ri(rng, 6, 24), H0 = r * T0;
      if (H0 < 6 || H0 > 15) return null;
      const t1 = ri(rng, 1, 3), t2 = t1 + ri(rng, 2, 3);
      const h1 = H0 - r * t1, h2 = H0 - r * t2, T = H0 / r;
      if (!isInt(T) || h2 <= 0 || !isInt(h1 * 2) || !isInt(h2 * 2)) return null;
      const f = (x) => (isInt(x) ? `${x}` : `${x}`);
      return {
        params: `${r},${H0},${t1},${t2}`, difficulty: 3,
        prompt: `A candle burns down at a constant rate. ${t1} hour${t1 > 1 ? 's' : ''} after it is lit, it is ${f(h1)} inches tall, and ${t2} hours after it is lit, it is ${f(h2)} inches tall. How many hours after it is lit will the candle burn out completely?`,
        key: `${T}`,
        wrong: [[`${h2 / r}`, `is how much longer it burns after hour ${t2}, not the time since it was lit`], [`${h1 / r}`, `is how much longer it burns after hour ${t1}`], [`${H0}`, 'gives the starting height, not a time'], [`${t2 + h2}`, 'adds the height to the time as if the candle burned 1 inch per hour']],
        explain: `It loses ${f(h1)} − ${f(h2)} = ${h1 - h2} inches in ${t2 - t1} hours, ${r} inch${r === 1 ? '' : 'es'} per hour. Back to time 0: ${f(h1)} + ${r} × ${t1} = ${H0} inches. It burns out after ${H0} ÷ ${r} = ${T} hours.`,
      };
    },
  },

  // ─── Functions ───────────────────────────────────────────────────────────
  {
    id: 'model-from-table', skillId: 'act-exponential-models', count: 14, kind: 'table',
    gen(rng) {
      const y0 = pick(rng, [2, 3, 4, 5, 6, 8]), k = pick(rng, [2, 3]);
      const exponential = rng() < 0.5;
      const d = y0 * (k - 1);   // the linear rule matching the first step
      const ys = [0, 1, 2, 3].map((x) => (exponential ? y0 * k ** x : y0 + d * x));
      const expEq = `y = ${y0}(${k})^x`, linEq = lineEq(d, 1, y0);
      const key = exponential ? expEq : linEq;
      return {
        params: `${y0},${k},${exponential}`, difficulty: 4,
        prompt: `The table below shows values of a function at 4 values of x.\n\nx | 0 | 1 | 2 | 3\ny | ${ys.join(' | ')}\n\nWhich of the following equations fits all the values in the table?`,
        key,
        wrong: [
          [exponential ? linEq : expEq, exponential ? `fits the first two points only: from x = 1 to 2 the values multiply by ${k} rather than adding ${d}` : `fits the first two points only: the values ADD ${d} each step rather than multiplying`],
          [exponential ? `y = ${k}(${y0})^x` : lineEq(y0, 1, d), 'swaps the starting value and the step'],
          [exponential ? `y = ${y0 * k}(${k})^x` : lineEq(d, 1, y0 + d), 'starts from the value at x = 1 instead of x = 0'],
        ],
        explain: exponential
          ? `Each step multiplies y by ${k} (${ys.join(' → ')}), so the function is exponential with starting value ${y0}: ${expEq}. A line through the first two points misses x = 2.`
          : `Each step adds ${d} (${ys.join(' → ')}), so the function is linear with intercept ${y0} and slope ${d}: ${linEq}. Multiplying by ${k} would give ${y0 * k * k} at x = 2.`,
      };
    },
  },
  {
    id: 'compose-table-formula', skillId: 'act-function-composition', count: 14, kind: 'table',
    gen(rng) {
      const xs = [1, 2, 3, 4, 5];
      const fv = xs.map(() => ri(rng, -4, 9));
      const a = pick(rng, [2, 3, -1, -2]), b = ri(rng, -3, 4);
      const g = (x) => a * x + b;
      const order = rng() < 0.5 ? 'fg' : 'gf';
      const c = pick(rng, xs);
      let key, wrong;
      if (order === 'fg') {
        const inner = g(c);
        if (!xs.includes(inner)) return null;
        key = fv[inner - 1];
        wrong = [[`${g(fv[c - 1])}`, `works g(f(${c})), the other order`], [`${fv[c - 1]}`, `stops at f(${c})`], [`${inner}`, `stops at g(${c}), the inner value`]];
      } else {
        key = g(fv[c - 1]);
        const fg = xs.includes(g(c)) ? fv[g(c) - 1] : null;
        wrong = [[fg != null ? `${fg}` : null, `works f(g(${c})), the other order`], [`${fv[c - 1]}`, `stops at f(${c}), the inner value`], [`${g(c)}`, `uses g(${c}) and never reads the table`], [`${a * c + b + fv[c - 1]}`, 'adds g(x) and f(x) instead of composing']];
      }
      const gText = lineEq(a, 1, b, 'g(x)');
      return {
        params: `${fv.join(',')},${a},${b},${order},${c}`, difficulty: 3,
        prompt: `The table below gives some values of the function f, and ${gText}.\n\nx | 1 | 2 | 3 | 4 | 5\nf(x) | ${fv.join(' | ')}\n\nWhat is the value of ${order === 'fg' ? `f(g(${c}))` : `g(f(${c}))`}?`,
        key: `${key}`,
        wrong,
        explain: order === 'fg'
          ? `Inside first: g(${c}) = ${a}(${c}) ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${g(c)}. Then read the table: f(${g(c)}) = ${key}.`
          : `Inside first: from the table, f(${c}) = ${fv[c - 1]}. Then g(${fv[c - 1]}) = ${a}(${fv[c - 1]}) ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${key}.`,
      };
    },
  },
  {
    id: 'which-figure', skillId: 'act-sequences', count: 14, kind: 'multi-step',
    gen(rng) {
      const a = ri(rng, 3, 9), d = ri(rng, 2, 6), n = ri(rng, 12, 40);
      const T = a + (n - 1) * d;
      const naive = (T - a) / d;
      return {
        params: `${a},${d},${n}`, difficulty: 3,
        prompt: `A pattern of tile figures uses ${a} tiles in Figure 1, ${a + d} tiles in Figure 2, and ${a + 2 * d} tiles in Figure 3, and continues the same way. For what value of n does Figure n use exactly ${T} tiles?`,
        key: `${n}`,
        wrong: [[`${naive}`, 'counts the steps after Figure 1 but forgets to add 1 for Figure 1 itself'], [`${n + 1}`, 'adds one figure too many'], [isInt(T / d) ? `${T / d}` : null, `divides the total by ${d} without accounting for the ${a} tiles Figure 1 starts with`], [isInt(T / a) ? `${T / a}` : null, `divides the total by the ${a} tiles in Figure 1`]],
        explain: `Each figure adds ${d} tiles, so Figure n uses ${a} + ${d}(n − 1). Set it equal to ${T}: ${d}(n − 1) = ${T - a}, n − 1 = ${naive}, n = ${n}.`,
      };
    },
  },

  // ─── Statistics & Probability ────────────────────────────────────────────
  {
    id: 'at-least-one', skillId: 'act-probability', count: 9, kind: 'multi-step',
    gen(rng) {
      const [subject, event, pn, pd] = pick(rng, [['A fair coin is flipped', 'lands heads', 1, 2], ['A fair six-sided die is rolled', 'shows a 6', 1, 6], ['A spinner with 3 equal sections, one of them red, is spun', 'lands on red', 1, 3], ['A spinner with 4 equal sections, one of them blue, is spun', 'lands on blue', 1, 4]]);
      const n = ri(rng, 2, 4);
      const none = (pd - pn) ** n, total = pd ** n;
      const key = frac(total - none, total);
      return {
        params: `${pd},${n}`, difficulty: 4,
        prompt: `${subject} ${n} times. What is the probability that it ${event} at least once?`,
        key,
        wrong: [[frac(pn ** n, total), `is the probability it happens on ALL ${n} trials`], [frac(none, total), 'is the probability it NEVER happens — the complement, not the answer'], [n * pn < pd ? frac(n * pn, pd) : null, 'adds the probabilities of the trials, which counts the overlaps more than once'], [frac(total - pn ** n, total), 'subtracts the wrong case from 1']],
        explain: `"At least once" is everything except "never". P(never) = (${frac(pd - pn, pd)})^${n} = ${frac(none, total)}, so P(at least once) = 1 − ${frac(none, total)} = ${key}.`,
      };
    },
  },
  {
    id: 'game-net-value', skillId: 'act-expected-value', count: 14, kind: 'multi-step',
    gen(rng) {
      const cost = pick(rng, [2, 3, 5]), W = pick(rng, [10, 12, 15, 20, 30]), [pn, pd] = pick(rng, [[1, 4], [1, 5], [1, 6], [1, 10], [1, 3]]);
      const ev = (W * pn) / pd - cost;
      if (Math.abs(ev * 100 - Math.round(ev * 100)) > 1e-9) return null;
      const m = (x) => (x < 0 ? `-$${Math.abs(x).toFixed(2)}` : `$${x.toFixed(2)}`);
      return {
        params: `${cost},${W},${pn}/${pd}`, difficulty: 4,
        prompt: `It costs $${cost} to play a game. A player wins a $${W} prize with probability ${pn}/${pd} and wins nothing otherwise. What is the player's expected net gain per game, including the cost to play?`,
        key: m(ev),
        wrong: [[m((W * pn) / pd), 'forgets the cost to play'], [m(((W - cost) * pn) / pd), 'subtracts the cost only on the games that win; it is paid every game'], [m(W - cost), 'treats the prize as certain']],
        explain: `The prize is worth ${pn}/${pd} × $${W} = $${((W * pn) / pd).toFixed(2)} per game on average, and the $${cost} cost is paid every game: $${((W * pn) / pd).toFixed(2)} − $${cost} = ${m(ev)}.`,
      };
    },
  },
  {
    id: 'restricted-codes', skillId: 'act-counting-arrangements', count: 6, kind: 'multi-step',
    gen(rng) {
      const len = pick(rng, [3, 4]), rule = pick(rng, ['odd-first', 'even-last', 'no-zero-first']);
      const digits = 10;
      let key, words, naive = 1;
      for (let i = 0; i < len; i++) naive *= digits - i;
      if (rule === 'odd-first') { key = 5; for (let i = 1; i < len; i++) key *= digits - i; words = 'the first digit must be odd'; }
      else if (rule === 'even-last') { key = 5; for (let i = 1; i < len; i++) key *= digits - i; words = 'the last digit must be even'; }
      else { key = 9; for (let i = 1; i < len; i++) key *= digits - i; words = 'the first digit cannot be 0'; }
      const withRep = (rule === 'no-zero-first' ? 9 : 5) * 10 ** (len - 1);
      return {
        params: `${len},${rule}`, difficulty: 4,
        prompt: `A ${len}-digit code uses the digits 0 through 9 with no digit repeated, and ${words}. How many different codes are possible?`,
        key: `${key}`,
        wrong: [[`${naive}`, 'ignores the restriction'], [`${withRep}`, 'lets digits repeat'], [`${key / (len === 3 ? 6 : 24)}`.includes('.') ? null : `${key / (len === 3 ? 6 : 24)}`, 'divides by the number of orderings, as if order did not matter'], [`${(rule === 'no-zero-first' ? 9 : 5) * (len - 1)}`, 'multiplies the restricted choices by the number of remaining places']],
        explain: `Fill the restricted place first: ${rule === 'no-zero-first' ? 9 : 5} choices. The other ${len - 1} places take any unused digit: ${Array.from({ length: len - 1 }, (_, i) => digits - 1 - i).join(' × ')}. Total: ${rule === 'no-zero-first' ? 9 : 5} × ${Array.from({ length: len - 1 }, (_, i) => digits - 1 - i).join(' × ')} = ${key}.`,
      };
    },
  },

  // ─── Number & Quantity ───────────────────────────────────────────────────
  {
    id: 'common-base', skillId: 'act-exponent-rules', count: 14, kind: 'multi-step',
    gen(rng) {
      const [b, p] = pick(rng, [[2, 2], [2, 3], [3, 2], [2, 4]]);   // big base = b^p
      const y = ri(rng, 2, 6), x = p * y, s = x + y;
      return {
        params: `${b},${p},${y}`, difficulty: 4,
        prompt: `If ${b}^x = ${b ** p}^y and x + y = ${s}, what is the value of x?`,
        key: `${x}`,
        wrong: [[`${y}`, 'gives the value of y'], [`${s / 2}`.includes('.') ? null : `${s / 2}`, 'assumes x and y are equal'], [`${b ** p * y}`, `treats ${b ** p}^y as ${b ** p}y`], [`${s - p}`, 'subtracts the exponent instead of using it']],
        explain: `Write both sides with base ${b}: ${b ** p}^y = (${b}^${p})^y = ${b}^(${p}y), so x = ${p}y. Then ${p}y + y = ${s} gives y = ${y} and x = ${x}.`,
      };
    },
  },
  {
    id: 'light-travel', skillId: 'act-scientific-notation', count: 5, kind: 'multi-step',
    gen(rng) {
      const [what, dc, dp] = pick(rng, [['the Sun to Earth', 1.5, 8], ['the Sun to Mars', 2.4, 8], ['the Sun to Jupiter', 7.8, 8], ['the Sun to Venus', 1.08, 8], ['Earth to the Moon', 3.9, 5]]);
      const v = 3, vp = 5;
      const sec = (dc / v) * 10 ** (dp - vp);
      const sn = (x) => { let e = 0, c = x; while (c >= 10) { c /= 10; e += 1; } while (c < 1) { c *= 10; e -= 1; } return `${Math.round(c * 1000) / 1000} × 10^${e}`; };
      return {
        params: `${what}`, difficulty: 3,
        prompt: `Light travels about 3 × 10^5 kilometers per second. The distance from ${what} is about ${dc} × 10^${dp} kilometers. About how many seconds does light take to travel that distance?`,
        key: sn(sec),
        wrong: [[sn((v / dc) * 10 ** (vp - dp)), 'divides the speed by the distance — upside down'], [sn((dc / v) * 10 ** (dp + vp)), 'adds the exponents when dividing; division subtracts them'], [sn(dc * v * 10 ** (dp + vp)), 'multiplies distance by speed']],
        explain: `Time = distance ÷ speed = (${dc} × 10^${dp}) ÷ (3 × 10^5) = (${dc} ÷ 3) × 10^(${dp} − 5) = ${sn(sec)} seconds.`,
      };
    },
  },
];

const bank = makeBank({
  source: SOURCE,
  idPrefix: 'act-reasoning-',
  tags: (fam) => ['act', 'act-math', 'reasoning', `reasoning:${fam.kind}`, `family:${fam.id}`],
});
const generate = () => bank.generate(FAMILIES);

function main() {
  const { items, report } = generate();
  report.forEach(([id, skill, made, want]) => console.log(`  ${String(made).padStart(3)}/${want}  ${id.padEnd(26)} ${skill}`));
  console.log(`act-reasoning: ${items.length} items`);
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
