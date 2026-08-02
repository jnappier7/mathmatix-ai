'use strict';
/**
 * Templates for the empty 6th-grade skills (2 active students).
 * Same contract as templatesAlgebra1 — answers are computed, never authored.
 */

const K = require('./templateKit');
const { int, pick, nonZero, gcd, lcm, frac, reduce } = K;

const GB = '6-8';

const TEMPLATES = [
  {
    skillId: 'g6-integer-basics',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 2, 15), b = int(r, 2, 15);
        return { prompt: `Find the sum: −${a} + ${b}`, value: -a + b,
          explanation: `Start at −${a} and move ${b} to the right on a number line, landing on ${-a + b}. ${-a + b < 0 ? 'The negative is larger in size, so the result stays negative.' : 'You moved past zero, so the result is positive.'}` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 3, 18), b = int(r, 3, 18);
        return { prompt: `Find the difference: ${a} − (−${b})`, value: a + b,
          explanation: `Subtracting a negative is the same as adding: ${a} − (−${b}) = ${a} + ${b} = ${a + b}. Two minus signs in a row turn into a plus.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 12), b = int(r, 2, 9);
        return { prompt: `Multiply: (−${a}) · (−${b})`, value: a * b,
          explanation: `A negative times a negative is POSITIVE, so (−${a})(−${b}) = ${a * b}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const b = int(r, 2, 9), q = int(r, 2, 9);
        return { prompt: `Divide: (−${b * q}) ÷ ${b}`, value: -q,
          explanation: `${b * q} ÷ ${b} = ${q}, and a negative divided by a positive is negative, so the answer is −${q}.` };
      } },
    ],
  },

  {
    skillId: 'g6-gcf-lcm',
    tiers: [
      { difficulty: 2, gen: (r) => {
        // Plant a shared factor: a GCF of 1 is a correct but useless drill.
        const g = pick(r, [2, 3, 4, 5, 6, 8]);
        let m1 = int(r, 2, 9), m2 = int(r, 2, 9);
        while (gcd(m1, m2) !== 1 || m1 === m2) { m1 = int(r, 2, 9); m2 = int(r, 2, 9); }
        const a = g * m1, b = g * m2;
        return { prompt: `Find the GCF of ${a} and ${b}.`, value: gcd(a, b),
          explanation: `List what divides both: ${a} = ${g}·${m1} and ${b} = ${g}·${m2}. Since ${m1} and ${m2} share no factor, the greatest common factor is ${gcd(a, b)}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 3, 12), b = int(r, 3, 12);
        return { prompt: `Find the LCM of ${a} and ${b}.`, value: lcm(a, b),
          explanation: `The least common multiple is the smallest number both divide into. Using LCM = (${a}·${b})/GCF = ${a * b}/${gcd(a, b)} = ${lcm(a, b)}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const g = pick(r, [3, 4, 6]), m = int(r, 2, 7), n = int(r, 2, 7);
        const a = g * m, b = g * n;
        return { prompt: `A florist has ${a} roses and ${b} tulips and wants identical bouquets with no flowers left over. What is the GREATEST number of bouquets possible?`,
          value: gcd(a, b),
          explanation: `Identical bouquets with nothing left over means the bouquet count must divide BOTH numbers, and "greatest" means the GCF: GCF(${a}, ${b}) = ${gcd(a, b)}.` };
      } },
    ],
  },

  {
    skillId: 'g6-ratio-language',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        return { prompt: `A basket has ${a} apples and ${b} oranges. Write the ratio of apples to oranges in simplest form.`,
          value: `${reduce(a, b)[0]}:${reduce(a, b)[1]}`,
          explanation: `The ratio is ${a}:${b}${gcd(a, b) > 1 ? `, and dividing both parts by ${gcd(a, b)} gives ${reduce(a, b)[0]}:${reduce(a, b)[1]}` : ', which is already in simplest form'}. Order matters — apples first.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 8);
        return { prompt: `A team has ${a} guards and ${b} forwards. What is the ratio of forwards to the TOTAL number of players, in simplest form?`,
          value: `${reduce(b, a + b)[0]}:${reduce(b, a + b)[1]}`,
          explanation: `The total is ${a} + ${b} = ${a + b}, so the ratio is ${b}:${a + b}${gcd(b, a + b) > 1 ? `, which simplifies to ${reduce(b, a + b)[0]}:${reduce(b, a + b)[1]}` : ''}. A part-to-WHOLE ratio uses the total, not the other part.` };
      } },
    ],
  },

  {
    skillId: 'g6-equivalent-ratios',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 9), k = int(r, 2, 6);
        return { prompt: `Complete the equivalent ratio: ${a} : ${b} = ${a * k} : ___`, value: b * k,
          explanation: `${a} was multiplied by ${k} to get ${a * k}, so multiply ${b} by the same ${k}: ${b} · ${k} = ${b * k}. Both parts must scale by the same factor.` };
      } },
      { difficulty: 3, gen: (r) => {
        const rate = int(r, 2, 9), units = int(r, 3, 8);
        return { prompt: `If ${rate} pencils cost $${rate * 2}, how much do ${rate * units} pencils cost at the same rate?`,
          value: rate * units * 2,
          explanation: `The number of pencils was multiplied by ${units} (${rate} → ${rate * units}), so the cost multiplies by ${units} too: $${rate * 2} · ${units} = $${rate * units * 2}.` };
      } },
    ],
  },

  {
    skillId: 'g6-percent-intro',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const pct = pick(r, [10, 20, 25, 50]), whole = pick(r, [40, 60, 80, 100, 200]);
        return { prompt: `What is ${pct}% of ${whole}?`, value: (pct / 100) * whole,
          explanation: `${pct}% means ${pct} per hundred, so multiply: ${pct / 100} · ${whole} = ${(pct / 100) * whole}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const part = int(r, 1, 9), whole = pick(r, [10, 20, 25, 50]);
        return { prompt: `${part} out of ${whole} is what percent?`, value: `${(part / whole) * 100}%`,
          explanation: `Write it as a fraction and scale to a denominator of 100: ${part}/${whole} = ${(part / whole) * 100}/100 = ${(part / whole) * 100}%.` };
      } },
      { difficulty: 3, gen: (r) => {
        const pct = pick(r, [15, 20, 25]), whole = pick(r, [40, 60, 80]);
        const tip = (pct / 100) * whole;
        return { prompt: `A meal costs $${whole}. What is a ${pct}% tip?`, value: tip,
          explanation: `${pct}% of ${whole} is ${pct / 100} · ${whole} = ${tip}, so the tip is $${tip}.` };
      } },
    ],
  },

  {
    skillId: 'g6-one-two-step-equations',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const x = int(r, 2, 15), b = int(r, 2, 20);
        return { prompt: `Solve for x:  x + ${b} = ${x + b}`, value: x,
          explanation: `Subtract ${b} from both sides: x = ${x + b} − ${b} = ${x}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 9), x = int(r, 2, 12);
        return { prompt: `Solve for x:  ${a}x = ${a * x}`, value: x,
          explanation: `Divide both sides by ${a}: x = ${a * x} ÷ ${a} = ${x}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 15), x = int(r, 2, 10);
        return { prompt: `Solve for x:  ${a}x + ${b} = ${a * x + b}`, value: x,
          explanation: `Undo addition first: ${a}x = ${a * x + b} − ${b} = ${a * x}. Then divide by ${a}: x = ${x}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 7), b = int(r, 3, 15), x = int(r, 3, 12);
        return { prompt: `Solve for x:  ${a}x − ${b} = ${a * x - b}`, value: x,
          explanation: `Add ${b} to both sides: ${a}x = ${a * x - b} + ${b} = ${a * x}. Then divide by ${a}: x = ${x}.` };
      } },
    ],
  },

  {
    skillId: 'g6-combine-like-terms',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        return { prompt: `Simplify: ${a}x + ${b}x`, value: `${a + b}x`,
          explanation: `Both terms have the same variable x, so add the coefficients: ${a} + ${b} = ${a + b}, giving ${a + b}x.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 4, 12), b = int(r, 2, 3), c = int(r, 2, 9);
        return { prompt: `Simplify: ${a}x − ${b}x + ${c}`, value: `${a - b}x + ${c}`,
          explanation: `Combine only the LIKE terms: ${a}x − ${b}x = ${a - b}x. The ${c} has no variable, so it stays separate: ${a - b}x + ${c}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 8), c = int(r, 2, 7), d = int(r, 2, 7);
        return { prompt: `Simplify: ${a}x + ${c}y + ${b}x + ${d}y`, value: `${a + b}x + ${c + d}y`,
          explanation: `Group like with like: (${a}x + ${b}x) + (${c}y + ${d}y) = ${a + b}x + ${c + d}y. x-terms and y-terms can never be combined with each other.` };
      } },
    ],
  },

  {
    skillId: 'g6-write-expressions',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const n = int(r, 2, 15);
        return { prompt: `Write an expression: ${n} more than a number x`, value: `x + ${n}`,
          explanation: `"More than" means addition, and it is added TO the number: x + ${n}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const n = int(r, 2, 12);
        return { prompt: `Write an expression: ${n} less than a number x`, value: `x − ${n}`,
          explanation: `"${n} less than x" means you start with x and take ${n} away: x − ${n}. The order is reversed from how it is said, which is the classic trap — it is NOT ${n} − x.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 12);
        return { prompt: `Write an expression: ${b} more than ${a} times a number x`, value: `${a}x + ${b}`,
          explanation: `"${a} times a number" is ${a}x, and "${b} more than" adds ${b}: ${a}x + ${b}.` };
      } },
    ],
  },

  {
    skillId: 'g6-absolute-value-opposites',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const n = int(r, 2, 25);
        return { prompt: `Find the value: |−${n}|`, value: n,
          explanation: `Absolute value is DISTANCE from zero, and distance is never negative: |−${n}| = ${n}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const n = int(r, 2, 20);
        return { prompt: `What is the opposite of −${n}?`, value: n,
          explanation: `Opposites sit the same distance from zero on the other side, so the opposite of −${n} is ${n}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 3, 15), b = int(r, 2, 12);
        return { prompt: `Evaluate: |−${a}| − |${b}|`, value: a - b,
          explanation: `Take each absolute value first: |−${a}| = ${a} and |${b}| = ${b}. Then ${a} − ${b} = ${a - b}.` };
      } },
    ],
  },

  {
    skillId: 'g6-decimal-division',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const q = int(r, 2, 9), d = pick(r, [2, 4, 5]);
        const dividend = (q * d) / 10;
        return { prompt: `Divide: ${Number(dividend.toFixed(1))} ÷ ${d}`, value: Number((q / 10).toFixed(1)),
          explanation: `${Number(dividend.toFixed(1))} ÷ ${d} = ${Number((q / 10).toFixed(1))}. Dividing by a whole number keeps the decimal point lined up with the dividend.` };
      } },
      { difficulty: 3, gen: (r) => {
        const q = int(r, 2, 12), divisor = pick(r, [0.5, 0.2, 0.25]);
        const dividend = q * divisor;
        return { prompt: `Divide: ${Number(dividend.toFixed(2))} ÷ ${divisor}`, value: q,
          explanation: `Multiply both numbers by ${divisor === 0.5 ? 10 : 100} to clear the decimal: ${Number(dividend.toFixed(2))} ÷ ${divisor} = ${Number((dividend * (divisor === 0.5 ? 10 : 100)).toFixed(0))} ÷ ${divisor * (divisor === 0.5 ? 10 : 100)} = ${q}. Dividing by a number less than 1 makes the result LARGER.` };
      } },
    ],
  },

  {
    skillId: 'g6-fraction-add-subtract',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const d = pick(r, [4, 5, 6, 8]), a = int(r, 1, d - 1), b = int(r, 1, d - a);
        return { prompt: `Add and simplify: ${a}/${d} + ${b}/${d}`, value: frac(a + b, d),
          explanation: `The denominators already match, so add the numerators: (${a} + ${b})/${d} = ${a + b}/${d}${frac(a + b, d) !== `${a + b}/${d}` ? ` = ${frac(a + b, d)}` : ''}. The denominator never changes when adding like fractions.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d1 = pick(r, [2, 3, 4]), d2 = pick(r, [5, 6, 8]);
        const a = int(r, 1, d1 - 1), b = int(r, 1, d2 - 1);
        const L = lcm(d1, d2);
        const num = a * (L / d1) + b * (L / d2);
        return { prompt: `Add and simplify: ${a}/${d1} + ${b}/${d2}`, value: frac(num, L),
          explanation: `The least common denominator is ${L}: ${a}/${d1} = ${a * (L / d1)}/${L} and ${b}/${d2} = ${b * (L / d2)}/${L}. Adding gives ${num}/${L}${frac(num, L) !== `${num}/${L}` ? ` = ${frac(num, L)}` : ''}.` };
      } },
    ],
  },

  {
    skillId: 'g6-fraction-multiply-divide',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 1, 5), b = int(r, 2, 7), c = int(r, 1, 5), d = int(r, 2, 7);
        return { prompt: `Multiply and simplify: ${a}/${b} · ${c}/${d}`, value: frac(a * c, b * d),
          explanation: `Multiply straight across: (${a}·${c})/(${b}·${d}) = ${a * c}/${b * d}${frac(a * c, b * d) !== `${a * c}/${b * d}` ? ` = ${frac(a * c, b * d)}` : ''}. No common denominator is needed for multiplication.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 5), b = int(r, 2, 7), c = int(r, 1, 5), d = int(r, 2, 7);
        return { prompt: `Divide and simplify: ${a}/${b} ÷ ${c}/${d}`, value: frac(a * d, b * c),
          explanation: `Dividing by a fraction means multiplying by its reciprocal: ${a}/${b} · ${d}/${c} = ${a * d}/${b * c}${frac(a * d, b * c) !== `${a * d}/${b * c}` ? ` = ${frac(a * d, b * c)}` : ''}. Flip the SECOND fraction only.` };
      } },
    ],
  },

  {
    skillId: 'g6-area-triangles-parallelograms',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const b = int(r, 4, 20), h = pick(r, [2, 4, 6, 8, 10]);
        return { prompt: `Find the area of a triangle with base ${b} cm and height ${h} cm.`, value: (b * h) / 2,
          explanation: `Area = (1/2)·base·height = (1/2)(${b})(${h}) = ${(b * h) / 2} cm². Forgetting the 1/2 gives ${b * h}, the area of the surrounding rectangle.` };
      } },
      { difficulty: 2, gen: (r) => {
        const b = int(r, 3, 18), h = int(r, 3, 14);
        return { prompt: `Find the area of a parallelogram with base ${b} in and height ${h} in.`, value: b * h,
          explanation: `Area = base · height = ${b} · ${h} = ${b * h} in². Use the perpendicular HEIGHT, not the slanted side.` };
      } },
      { difficulty: 3, gen: (r) => {
        const area = pick(r, [24, 36, 48, 60]), b = pick(r, [4, 6, 8]);
        return { prompt: `A triangle has area ${area} cm² and base ${b} cm. What is its height?`, value: (2 * area) / b,
          explanation: `From A = (1/2)bh, multiply both sides by 2: 2A = bh, so h = 2(${area})/${b} = ${(2 * area) / b} cm.` };
      } },
    ],
  },

  {
    skillId: 'g6-measures-center-variability',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const vals = Array.from({ length: 5 }, () => int(r, 2, 20));
        const sum = vals.reduce((s, v) => s + v, 0);
        const mean = sum / 5;
        return { prompt: `Find the mean of: ${vals.join(', ')}`, value: Number.isInteger(mean) ? mean : Math.round(mean * 100) / 100,
          explanation: `Add them: ${sum}. Divide by the count (5): ${sum}/5 = ${Number.isInteger(mean) ? mean : Math.round(mean * 100) / 100}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const vals = Array.from({ length: 6 }, () => int(r, 1, 25));
        const sorted = [...vals].sort((a, b) => a - b);
        return { prompt: `Find the RANGE of: ${vals.join(', ')}`, value: sorted[5] - sorted[0],
          explanation: `Range = largest − smallest = ${sorted[5]} − ${sorted[0]} = ${sorted[5] - sorted[0]}. It measures spread, not center.` };
      } },
    ],
  },

  {
    skillId: 'g6-compare-order-rationals',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 2, 20), b = int(r, 2, 20);
        const bigger = Math.max(-a, -b) === -a ? `−${a}` : `−${b}`;
        return { prompt: `Which is greater: −${a} or −${b}?`, value: a === b ? `They are equal` : bigger,
          explanation: a === b ? `They are the same number.` : `On a number line the greater number is farther RIGHT. −${Math.min(a, b)} sits to the right of −${Math.max(a, b)}, so ${bigger} is greater. With negatives, the smaller digits mean the larger value.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d = pick(r, [4, 5, 8]), n = int(r, 1, d - 1);
        const dec = n / d;
        return { prompt: `Which is greater: ${n}/${d} or ${(dec + 0.1).toFixed(2)}?`, value: `${(dec + 0.1).toFixed(2)}`,
          explanation: `Convert the fraction: ${n}/${d} = ${dec}. Since ${(dec + 0.1).toFixed(2)} > ${dec}, the decimal is greater. Comparing is easiest once both are in the same form.` };
      } },
    ],
  },

  {
    skillId: 'g6-distance-coordinate-plane',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const x = int(r, 1, 9), y1 = int(r, 1, 9), y2 = int(r, -9, -1);
        return { prompt: `Find the distance between (${x}, ${y1}) and (${x}, ${y2}).`, value: y1 - y2,
          explanation: `The x-coordinates match, so this is a vertical segment. The distance is |${y1} − (${y2})| = ${y1 - y2} units.` };
      } },
      { difficulty: 3, gen: (r) => {
        const y = int(r, 1, 9), x1 = int(r, -9, -1), x2 = int(r, 1, 9);
        return { prompt: `Find the distance between (${x1}, ${y}) and (${x2}, ${y}).`, value: x2 - x1,
          explanation: `The y-coordinates match, so this is a horizontal segment crossing the y-axis. The distance is |${x2} − (${x1})| = ${x2 - x1} units.` };
      } },
    ],
  },

  {
    skillId: 'g6-unit-conversions',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const ft = int(r, 2, 12);
        return { prompt: `Convert: ${ft} feet = ___ inches`, value: ft * 12,
          explanation: `There are 12 inches in a foot, so ${ft} · 12 = ${ft * 12} inches. Converting to a SMALLER unit gives a bigger number.` };
      } },
      { difficulty: 2, gen: (r) => {
        const m = int(r, 2, 15);
        return { prompt: `Convert: ${m} meters = ___ centimeters`, value: m * 100,
          explanation: `There are 100 centimeters in a meter, so ${m} · 100 = ${m * 100} cm.` };
      } },
      { difficulty: 3, gen: (r) => {
        const cups = int(r, 2, 16);
        return { prompt: `Convert: ${cups * 2} cups = ___ quarts (4 cups = 1 quart)`, value: (cups * 2) / 4,
          explanation: `Divide by 4 because you are converting to a LARGER unit: ${cups * 2} ÷ 4 = ${(cups * 2) / 4} quarts.` };
      } },
    ],
  },

  {
    skillId: 'g6-multi-digit-division',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const d = int(r, 3, 12), q = int(r, 11, 60);
        return { prompt: `Divide: ${d * q} ÷ ${d}`, value: q,
          explanation: `${d} · ${q} = ${d * q}, so ${d * q} ÷ ${d} = ${q}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d = int(r, 4, 15), q = int(r, 12, 80), rem = int(r, 1, d - 1);
        return { prompt: `Divide and give the remainder: ${d * q + rem} ÷ ${d}`, value: `${q} R${rem}`,
          explanation: `${d} goes into ${d * q + rem} exactly ${q} times (${d}·${q} = ${d * q}), leaving ${d * q + rem} − ${d * q} = ${rem} left over. So the answer is ${q} remainder ${rem}.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
