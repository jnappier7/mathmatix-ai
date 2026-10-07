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

  // ─── Upper-level depth (added 2026-10-07) ─────────────────────────────────
  // An advanced 8th-grader profile in the fourth external audit lost its
  // points on trig, horizontal compression, fractional exponents, complex
  // division, logarithms and harder probability, and the bank was thinnest at
  // exactly that end (3 hard conditional-probability items, 6 matrix, 8 graph
  // transformation). These families are the hard end of those skills. NEW
  // families rather than wider old ones: changing an old family's draws would
  // re-key items under ids students have already seen.
  {
    id: 'transform-point', skillId: 'act-graph-transformations', count: 14, kind: 'multi-step',
    gen(rng) {
      const kind = pick(rng, ['hcomp', 'vstretch', 'shift', 'reflect-y', 'reflect-x']);
      const P = (x, y) => `(${x}, ${y})`;
      const a = pick(rng, [-6, -4, -2, 2, 4, 6, 8]), b = pick(rng, [-5, -3, -1, 1, 3, 5, 7]);
      if (kind === 'hcomp') {
        const k = pick(rng, [2]);
        return {
          params: `${kind},${a},${b},${k}`, difficulty: 4,
          prompt: `The graph of y = f(x) passes through the point ${P(a, b)}. Which of the following points must lie on the graph of y = f(${k}x)?`,
          key: P(a / k, b),
          wrong: [[P(a * k, b), `stretches horizontally; f(${k}x) COMPRESSES the graph toward the y-axis`], [P(a, k * b), 'applies the factor to the output instead of the input'], [P(a / k, b / k), 'divides both coordinates']],
          explain: `On y = f(${k}x), the output ${b} comes from an input where ${k}x = ${a}, so x = ${a / k}. The point ${P(a, b)} moves to ${P(a / k, b)}: the graph is compressed horizontally by a factor of ${k}.`,
        };
      }
      if (kind === 'vstretch') {
        const k = pick(rng, [2, 3]);
        return {
          params: `${kind},${a},${b},${k}`, difficulty: 3,
          prompt: `The graph of y = f(x) passes through the point ${P(a, b)}. Which of the following points must lie on the graph of y = ${k}f(x)?`,
          key: P(a, k * b),
          wrong: [[P(a * k, b), 'applies the factor to the input instead of the output'], [P(a, b + k), `adds ${k} to the output instead of multiplying`], [a % k === 0 ? P(a / k, b) : null, `treats ${k}f(x) like f(${k}x)`], [P(a, b * k + (b < 0 ? 1 : -1)), 'misses a step while scaling the output']],
          explain: `${k}f(x) multiplies every output by ${k} and leaves the inputs alone: ${P(a, b)} becomes ${P(a, k * b)}.`,
        };
      }
      if (kind === 'shift') {
        const h = pick(rng, [-4, -3, -2, 2, 3, 4]), v = pick(rng, [-3, -2, 2, 3, 5]);
        const fx = `f(x ${h < 0 ? '+' : '-'} ${Math.abs(h)}) ${v < 0 ? '-' : '+'} ${Math.abs(v)}`;
        return {
          params: `${kind},${a},${b},${h},${v}`, difficulty: 3,
          prompt: `The graph of y = f(x) passes through the point ${P(a, b)}. Which of the following points must lie on the graph of y = ${fx}?`,
          key: P(a + h, b + v),
          wrong: [[P(a - h, b + v), 'moves the graph the wrong way horizontally: x − h shifts RIGHT by h'], [P(a + h, b - v), 'moves it the wrong way vertically'], [P(a - h, b - v), 'reverses both shifts']],
          explain: `Inside, x ${h < 0 ? '+' : '-'} ${Math.abs(h)} shifts the graph ${h > 0 ? 'right' : 'left'} ${Math.abs(h)}; outside, ${v < 0 ? '−' : '+'} ${Math.abs(v)} shifts it ${v > 0 ? 'up' : 'down'} ${Math.abs(v)}. ${P(a, b)} moves to ${P(a + h, b + v)}.`,
        };
      }
      const xref = kind === 'reflect-y';
      return {
        params: `${kind},${a},${b}`, difficulty: 3,
        prompt: `The graph of y = f(x) passes through the point ${P(a, b)}. Which of the following points must lie on the graph of y = ${xref ? 'f(-x)' : '-f(x)'}?`,
        key: xref ? P(-a, b) : P(a, -b),
        wrong: [[xref ? P(a, -b) : P(-a, b), `reflects across the ${xref ? 'x' : 'y'}-axis instead of the ${xref ? 'y' : 'x'}-axis`], [P(-a, -b), 'reflects across both axes'], [P(b, a), 'swaps the coordinates, which reflects across y = x']],
        explain: xref ? `f(−x) feeds in the opposite input, so the point at x = ${a} appears at x = ${-a}: ${P(-a, b)}. That reflects the graph across the y-axis.` : `−f(x) negates every output: ${P(a, b)} becomes ${P(a, -b)}, a reflection across the x-axis.`,
      };
    },
  },
  {
    id: 'complex-division', skillId: 'act-complex-numbers', count: 14, kind: 'multi-step',
    gen(rng) {
      const z = (re, im) => (im === 0 ? `${re}` : re === 0 ? `${im === 1 ? '' : im === -1 ? '-' : im}i` : `${re} ${im < 0 ? '-' : '+'} ${Math.abs(im) === 1 ? '' : Math.abs(im)}i`);
      const p = ri(rng, -3, 5), q = ri(rng, -4, 4), c = ri(rng, 1, 4), d = pick(rng, [-3, -2, -1, 1, 2, 3]);
      if (!q || !p) return null;
      const A = p * c - q * d, B = p * d + q * c;          // (p + qi)(c + di)
      const n2 = c * c + d * d;
      const split = Number.isInteger(A / c) && Number.isInteger(B / d) ? z(A / c, B / d) : null;
      return {
        params: `${p},${q},${c},${d}`, difficulty: 4,
        prompt: `For i = √(−1), which of the following is equal to (${z(A, B)})/(${z(c, d)})?`,
        key: z(p, q),
        wrong: [[z(p, -q), 'multiplies by the conjugate but drops a sign in the imaginary part'], [z(n2 * p, n2 * q), `multiplies by the conjugate and forgets to divide by ${c}² + ${d}² = ${n2}`], [split, 'divides real by real and imaginary by imaginary, which is not how division works'], [z(q, p), 'swaps the real and imaginary parts']],
        explain: `Multiply top and bottom by the conjugate, ${z(c, -d)}. The denominator becomes ${c}² + ${d < 0 ? `(${d})` : d}² = ${n2}, and the numerator (${z(A, B)})(${z(c, -d)}) = ${z(n2 * p, n2 * q)}. Divide by ${n2}: ${z(p, q)}.`,
      };
    },
  },
  {
    id: 'log-equation', skillId: 'act-logarithms', count: 14, kind: 'multi-step',
    gen(rng) {
      const b = pick(rng, [2, 3, 4, 5, 6, 10]), n = ri(rng, 1, 7), N = b ** n;
      const k = ri(rng, 1, 15);
      // x(x − k) = N with x > k: x = (k + √(k² + 4N)) / 2
      const disc = k * k + 4 * N, r = Math.round(Math.sqrt(disc));
      if (r * r !== disc || (k + r) % 2) return null;
      const x = (k + r) / 2, neg = (k - r) / 2;
      if (x <= k || N > 100000) return null;
      return {
        params: `${b},${n},${k}`, difficulty: 5,
        prompt: `What is the solution of the equation log_${b}(x) + log_${b}(x - ${k}) = ${n}?`,
        key: `${x}`,
        wrong: [[`${neg}`, `solves x(x − ${k}) = ${N} but keeps the negative root; a logarithm of a negative number is undefined`], [`${N}`, `stops at ${b}^${n} = ${N}, the value of x(x − ${k})`], [`${x - k}`, `gives x − ${k} rather than x`], [`${b * n}`, `treats ${b}^${n} as ${b} × ${n}`]],
        explain: `Combine the logs: log_${b}(x(x − ${k})) = ${n}, so x(x − ${k}) = ${b}^${n} = ${N}. Then x² − ${k}x − ${N} = 0 has roots ${x} and ${neg}. Only ${x} keeps both x and x − ${k} positive, so x = ${x}.`,
      };
    },
  },
  {
    id: 'fractional-exponent', skillId: 'act-exponent-rules', count: 14, kind: 'multi-step',
    gen(rng) {
      const [r, nn] = pick(rng, [[2, 3], [3, 2], [2, 2], [4, 2], [3, 3], [5, 2], [2, 4], [2, 5], [10, 3], [6, 2], [7, 2]]);
      const m = pick(rng, [2, 3, 5]);
      if (m === nn || gcd(m, nn) !== 1) return null;   // the ACT writes exponents in lowest terms
      const B = r ** nn, val = r ** m, neg = rng() < 0.5;
      if (val > 1000) return null;
      const exp = `${neg ? '-' : ''}${m}/${nn}`;
      return {
        params: `${r},${nn},${m},${neg}`, difficulty: 4,
        prompt: `What is the value of ${B}^(${exp})?`,
        key: neg ? `1/${val}` : `${val}`,
        wrong: neg
          ? [[`${val}`, 'ignores the negative sign in the exponent'], [`-1/${val}`, 'treats the negative exponent as a negative number'], [`-${val}`, 'makes the answer negative instead of taking a reciprocal']]
          : [[`1/${val}`, 'takes a reciprocal, which only a NEGATIVE exponent calls for'], [Number.isInteger((B * m) / nn) ? `${(B * m) / nn}` : null, `multiplies ${B} by ${m}/${nn}`], [`${r ** (nn * m) > 100000 ? r ** m * r : r ** (nn * m)}`, `raises ${B} to the ${m} instead of taking the root first`]],
        explain: `The denominator ${nn} is a root: ${nn === 2 ? '√' : `the ${nn === 3 ? 'cube' : `${nn}th`} root of `}${B} = ${r}. The numerator ${m} is a power: ${r}^${m} = ${val}.${neg ? ` The negative sign means take the reciprocal: 1/${val}.` : ''}`,
      };
    },
  },
  {
    id: 'draw-without-replacement', skillId: 'act-conditional-probability', count: 14, kind: 'multi-step',
    gen(rng) {
      const r = ri(rng, 3, 8), bl = ri(rng, 3, 8), n = r + bl;
      const ask = pick(rng, ['second-given-first', 'both', 'one-each']);
      const fr = (p, q) => frac(p, q);
      if (ask === 'second-given-first') {
        return {
          params: `${r},${bl},${ask}`, difficulty: 4,
          prompt: `A bag holds ${r} red marbles and ${bl} blue marbles. Two marbles are drawn at random, one after the other, without replacement. Given that the first marble is red, what is the probability that the second marble is also red?`,
          key: fr(r - 1, n - 1),
          wrong: [[fr(r, n), 'ignores that one red marble is already gone'], [fr(r * (r - 1), n * (n - 1)), 'gives the probability that BOTH are red, not the second given the first'], [fr(r - 1, n), 'removes the red marble from the count but not from the total']],
          explain: `After a red marble is drawn, ${r - 1} red remain out of ${n - 1} marbles: ${fr(r - 1, n - 1)}.`,
        };
      }
      if (ask === 'both') {
        return {
          params: `${r},${bl},${ask}`, difficulty: 4,
          prompt: `A bag holds ${r} red marbles and ${bl} blue marbles. Two marbles are drawn at random without replacement. What is the probability that both are red?`,
          key: fr(r * (r - 1), n * (n - 1)),
          wrong: [[fr(r * r, n * n), 'puts the first marble back (with replacement)'], [fr(r - 1, n - 1), 'gives only the second draw, given the first was red'], [fr(2 * r, n), 'adds the two draws instead of multiplying']]
            // A "probability" of 1 or more is not a distractor anyone picks.
            .filter(([t]) => { const [p, q] = t.split('/').map(Number); return q ? p < q : Number(t) < 1; }),
          explain: `First red: ${r}/${n}. Then, with one red gone, ${r - 1}/${n - 1}. Multiply: ${r}/${n} × ${r - 1}/${n - 1} = ${fr(r * (r - 1), n * (n - 1))}.`,
        };
      }
      return {
        params: `${r},${bl},${ask}`, difficulty: 5,
        prompt: `A bag holds ${r} red marbles and ${bl} blue marbles. Two marbles are drawn at random without replacement. What is the probability that one is red and one is blue?`,
        key: fr(2 * r * bl, n * (n - 1)),
        wrong: [[fr(r * bl, n * (n - 1)), 'counts only red-then-blue and misses blue-then-red'], [fr(2 * r * bl, n * n), 'puts the first marble back'], [fr(r * bl, n * n), 'puts the marble back AND counts only one order']],
        explain: `Red then blue: ${r}/${n} × ${bl}/${n - 1}. Blue then red: ${bl}/${n} × ${r}/${n - 1}. Add the two orders: 2 × ${r} × ${bl} / (${n} × ${n - 1}) = ${fr(2 * r * bl, n * (n - 1))}.`,
      };
    },
  },
  {
    id: 'law-of-cosines', skillId: 'act-law-of-sines-cosines', count: 12, kind: 'multi-step',
    gen(rng) {
      const [a, b, c, ang] = pick(rng, [[3, 8, 7, 60], [5, 8, 7, 60], [5, 21, 19, 60], [7, 15, 13, 60], [8, 15, 13, 60], [16, 21, 19, 60], [3, 5, 7, 120], [5, 16, 19, 120], [7, 8, 13, 120], [6, 10, 14, 120], [6, 16, 14, 60], [10, 16, 14, 60]]);
      const flip = rng() < 0.5;
      const [s1, s2] = flip ? [b, a] : [a, b];
      const rad = (v) => { const q = Math.round(Math.sqrt(v)); return q * q === v ? `${q}` : `√${v}`; };
      const sumSq = a * a + b * b, ab = a * b;
      return {
        params: `${a},${b},${ang},${flip}`, difficulty: 5,
        prompt: `In triangle ABC, AB = ${s1}, AC = ${s2}, and the measure of ∠A is ${ang}°. What is the length of BC? (Note: cos ${ang}° = ${ang === 60 ? '1/2' : '-1/2'}.)`,
        key: `${c}`,
        wrong: [[rad(sumSq), `uses the Pythagorean theorem; ∠A is ${ang}°, not 90°`], [rad(ang === 60 ? sumSq + ab : sumSq - ab), `gets the sign of cos ${ang}° wrong`], [`${ang === 60 ? Math.abs(a - b) : a + b}`, `uses cos ${ang}° = ${ang === 60 ? '1' : '−1'}`]],
        explain: `Law of cosines: BC² = ${s1}² + ${s2}² − 2(${s1})(${s2})cos ${ang}° = ${sumSq} ${ang === 60 ? '−' : '+'} ${ab} = ${c * c}, so BC = ${c}.`,
      };
    },
  },
  {
    id: 'quadrant-trig', skillId: 'act-trigonometric-functions', count: 14, kind: 'multi-step',
    gen(rng) {
      const [o, h, hyp] = pick(rng, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
      const quad = pick(rng, ['II', 'III', 'IV']);
      const sx = quad === 'II' || quad === 'III' ? -1 : 1, sy = quad === 'III' || quad === 'IV' ? -1 : 1;
      const given = rng() < 0.5 ? 'sin' : 'cos';
      const ask = given === 'sin' ? pick(rng, ['cos', 'tan']) : pick(rng, ['sin', 'tan']);
      const vals = { sin: [sy * o, hyp], cos: [sx * h, hyp], tan: [sy * o, sx * h] };
      const f = ([p, q]) => frac(p, q);
      const key = f(vals[ask]);
      const neg = ([p, q]) => frac(-p, q);
      const recip = ([p, q]) => frac(q, p);
      return {
        params: `${o},${quad},${given},${ask}`, difficulty: 4,
        prompt: `If ${given} θ = ${f(vals[given])} and θ is in quadrant ${quad}, what is the value of ${ask} θ?`,
        key,
        wrong: [[neg(vals[ask]), `has the right size but the wrong sign; in quadrant ${quad}, ${ask} is ${f(vals[ask]).startsWith('-') ? 'negative' : 'positive'}`], [recip(vals[ask]), `gives the reciprocal (${ask === 'tan' ? 'cot' : ask === 'sin' ? 'csc' : 'sec'} θ)`], [ask === 'tan' ? f([vals.tan[1], vals.tan[0]].map((x, i) => (i === 0 ? x : x))) : f(vals[ask === 'sin' ? 'cos' : 'sin']), 'uses the wrong side of the reference triangle'], [neg([vals[ask][1], vals[ask][0]]), 'takes the reciprocal and flips the sign']],
        explain: `The reference triangle has legs ${o} and ${h} and hypotenuse ${hyp}. In quadrant ${quad}, x is ${sx < 0 ? 'negative' : 'positive'} and y is ${sy < 0 ? 'negative' : 'positive'}, so ${ask} θ = ${key}.`,
      };
    },
  },
  {
    id: 'half-life', skillId: 'act-exponential-models', count: 14, kind: 'multi-step',
    gen(rng) {
      const k = ri(rng, 2, 5), h = pick(rng, [3, 4, 5, 6, 8, 12]), D = pick(rng, [64, 96, 128, 160, 192, 256, 320, 400, 480]);
      const t = k * h, key = D / 2 ** k;
      if (!Number.isInteger(key)) return null;
      const what = pick(rng, [['A patient takes a', 'mg dose of a medicine', 'milligrams', 'of the medicine remain in the body'], ['A lab sample contains', 'grams of a radioactive isotope', 'grams', 'of the isotope remain']]);
      return {
        params: `${k},${h},${D},${what[1]}`, difficulty: 4,
        prompt: `${what[0]} ${D} ${what[1]} whose amount is cut in half every ${h} hours. How many ${what[2]} ${what[3]} after ${t} hours?`,
        key: `${key}`,
        wrong: [[Number.isInteger(D / (2 * k)) ? `${D / (2 * k)}` : null, `divides by 2 × ${k} instead of halving ${k} times`], [`${D / 2 ** (k - 1)}`, 'counts one half-life too few'], [`${D / 2 ** (k + 1)}`, 'counts one half-life too many'], [Number.isInteger(D / k) ? `${D / k}` : null, `divides by the ${k} half-lives`]],
        explain: `${t} hours is ${t} ÷ ${h} = ${k} half-lives. Halving ${k} times: ${D} × (1/2)^${k} = ${D} ÷ ${2 ** k} = ${key}.`,
      };
    },
  },
  {
    id: 'matrix-product', skillId: 'act-matrices-vectors', count: 14, kind: 'multi-step',
    gen(rng) {
      const v = () => ri(rng, -3, 4);
      const A = [[v(), v()], [v(), v()]], Bm = [[v(), v()], [v(), v()]];
      const mul = (X, Y) => [[X[0][0] * Y[0][0] + X[0][1] * Y[1][0], X[0][0] * Y[0][1] + X[0][1] * Y[1][1]], [X[1][0] * Y[0][0] + X[1][1] * Y[1][0], X[1][0] * Y[0][1] + X[1][1] * Y[1][1]]];
      const M = (X) => `[[${X[0][0]}, ${X[0][1]}], [${X[1][0]}, ${X[1][1]}]]`;
      const AB = mul(A, Bm), BA = mul(Bm, A), EW = [[A[0][0] * Bm[0][0], A[0][1] * Bm[0][1]], [A[1][0] * Bm[1][0], A[1][1] * Bm[1][1]]];
      const rowRow = [[A[0][0] * Bm[0][0] + A[0][1] * Bm[0][1], A[0][0] * Bm[1][0] + A[0][1] * Bm[1][1]], [A[1][0] * Bm[0][0] + A[1][1] * Bm[0][1], A[1][0] * Bm[1][0] + A[1][1] * Bm[1][1]]];
      if (M(AB) === M(BA)) return null;
      return {
        params: `${M(A)}${M(Bm)}`, difficulty: 4,
        prompt: `Matrices A and B are given below. What is the matrix product AB?\n\nA = ${M(A)}    B = ${M(Bm)}`,
        key: M(AB),
        wrong: [[M(BA), 'multiplies in the other order; matrix multiplication is not commutative'], [M(EW), 'multiplies matching entries, which is not matrix multiplication'], [M(rowRow), 'pairs rows of A with rows of B instead of with columns']],
        explain: `Each entry of AB is a row of A times a column of B. Row 1 · column 1: (${A[0][0]})(${Bm[0][0]}) + (${A[0][1]})(${Bm[1][0]}) = ${AB[0][0]}, and so on: AB = ${M(AB)}.`,
      };
    },
  },
  {
    id: 'inverse-value', skillId: 'act-function-composition', count: 14, kind: 'multi-step',
    gen(rng) {
      const a = pick(rng, [2, 3, 4, 5, -2, -3]), b = ri(rng, -9, 9), c = pick(rng, [1, 2, 3]);
      const x0 = ri(rng, -5, 8);
      const k = (a * x0 + b) / c;
      if (!Number.isInteger(k) || b === 0 || k === x0) return null;
      const fText = c === 1 ? `${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}` : `(${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)})/${c}`;
      return {
        params: `${a},${b},${c},${x0}`, difficulty: 4,
        prompt: `If f(x) = ${fText}, what is the value of f⁻¹(${k})?`,
        key: `${x0}`,
        wrong: [[frac(a * k + b, c), `evaluates f(${k}) instead of the inverse`], [frac(c * k + b, a), 'undoes the operations but adds where it should subtract'], [frac(c, a * k + b), `gives 1/f(${k}); the inverse is not the reciprocal`], [`${k}`, 'returns the input unchanged']],
        explain: `f⁻¹(${k}) is the x with f(x) = ${k}: ${c === 1 ? `${fText} = ${k}` : `${fText} = ${k} gives ${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c * k}`}, so ${a}x = ${c * k - b} and x = ${x0}.`,
      };
    },
  },

  // ─── Thin families, widened (new ids; the originals are unchanged) ─────────
  {
    id: 'signal-travel', skillId: 'act-scientific-notation', count: 10, kind: 'multi-step',
    gen(rng) {
      const [what, speed, sc, sp, dc, dp, unit] = pick(rng, [
        ['a radio signal from Earth to a rover on Mars', 'light', 3, 5, 2.25, 8, 'kilometers'],
        ['a radio signal from Earth to a probe near Saturn', 'light', 3, 5, 1.35, 9, 'kilometers'],
        ['sunlight from the Sun to Mercury', 'light', 3, 5, 5.7, 7, 'kilometers'],
        ['a laser pulse from Earth to the Moon and back', 'light', 3, 5, 7.68, 5, 'kilometers'],
        ['the sound of thunder from a lightning strike', 'sound', 3.4, 2, 1.7, 3, 'meters'],
        ['the sound of a distant explosion', 'sound', 3.4, 2, 6.8, 3, 'meters'],
        ['a sonar ping through seawater to the ocean floor', 'sound in seawater', 1.5, 3, 4.5, 3, 'meters'],
        ['a signal from a satellite to a ground station', 'light', 3, 5, 3.6, 4, 'kilometers'],
        ['sunlight from the Sun to Saturn', 'light', 3, 5, 1.44, 9, 'kilometers'],
        ['a sonar ping through seawater to a submarine', 'sound in seawater', 1.5, 3, 7.5, 3, 'meters'],
      ]);
      const per = unit === 'kilometers' ? 'kilometers per second' : 'meters per second';
      const sec = (dc / sc) * 10 ** (dp - sp);
      const sn = (x) => { let e = 0, c = x; while (c >= 10) { c /= 10; e += 1; } while (c < 1) { c *= 10; e -= 1; } return `${Math.round(c * 1000) / 1000} × 10^${e}`; };
      return {
        params: what, difficulty: 3,
        prompt: `The speed of ${speed} is about ${sc} × 10^${sp} ${per}. The distance traveled by ${what} is about ${dc} × 10^${dp} ${unit}. About how many seconds does the trip take?`,
        key: sn(sec),
        wrong: [[sn((sc / dc) * 10 ** (sp - dp)), 'divides the speed by the distance — upside down'], [sn((dc / sc) * 10 ** (dp + sp)), 'adds the exponents when dividing; division subtracts them'], [sn(dc * sc * 10 ** (dp + sp)), 'multiplies distance by speed']],
        explain: `Time = distance ÷ speed = (${dc} × 10^${dp}) ÷ (${sc} × 10^${sp}) = (${dc} ÷ ${sc}) × 10^(${dp} − ${sp}) = ${sn(sec)} seconds.`,
      };
    },
  },
  {
    id: 'restricted-codes-2', skillId: 'act-counting-arrangements', count: 12, kind: 'multi-step',
    gen(rng) {
      const len = pick(rng, [3, 4, 5]), rule = pick(rng, ['last-odd', 'first-even-nonzero', 'no-zero', 'first-and-last-odd']);
      const P = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; };
      let key, words, first, how;
      if (rule === 'last-odd') { first = 5; key = 5 * P(9, len - 1); words = 'the last digit must be odd'; how = `Fill the last place first: 5 odd digits. The other ${len - 1} places take any of the 9 unused digits in order: ${P(9, len - 1)}.`; }
      else if (rule === 'first-even-nonzero') { first = 4; key = 4 * P(9, len - 1); words = 'the first digit must be an even digit other than 0'; how = `Fill the first place first: 4 choices (2, 4, 6, 8). The other ${len - 1} places take any of the 9 unused digits in order: ${P(9, len - 1)}.`; }
      else if (rule === 'no-zero') { first = 9; key = P(9, len); words = 'the digit 0 is not used'; how = `Only the digits 1-9 are allowed, with no repeats: ${P(9, len)} arrangements.`; }
      else { first = 5; key = 5 * 4 * P(8, len - 2); words = 'the first and last digits must both be odd'; how = `Fill the two restricted places first: 5 odd digits for the first, 4 left for the last. The middle ${len - 2} places take the 8 unused digits in order: ${P(8, len - 2)}.`; }
      return {
        params: `${len},${rule}`, difficulty: 4,
        prompt: `A ${len}-digit code uses the digits 0 through 9 with no digit repeated, and ${words}. How many different codes are possible?`,
        key: `${key}`,
        wrong: [[`${P(10, len)}`, 'ignores the restriction'], [`${rule === 'no-zero' ? 9 ** len : first * 10 ** (len - 1)}`, 'lets digits repeat'], [rule === 'first-and-last-odd' ? `${5 * 5 * P(8, len - 2)}` : `${first * P(10, len - 1)}`, 'forgets that the restricted digit is used up'], [`${first * (len - 1)}`, 'multiplies the restricted choices by the number of remaining places']],
        explain: rule === 'no-zero' ? how : `${how} Total: ${key}.`,
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
