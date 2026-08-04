'use strict';
/**
 * Early Math Foundations: the eight emf-* skills with no bank family under
 * any name. The other 23 emf skills crosswalk to the elementary banks
 * (rounding 274, compare-numbers 347, one-step fact families, CGI unknown
 * types, fraction operations) — see pathway-crosswalk.manual.json.
 *
 * emf-mental-math-strategies is deliberately NOT here: it crosswalks to the
 * `mental-math-strategies` family authored in templatesParentModels.js, so
 * the student course and the parent guide share one reviewed bank.
 *
 * Number design: multi-digit products stay under 100 or split into clean
 * partial products, long division draws divisor·quotient(+remainder) so
 * every answer is exact, mixed-number conversions use small denominators,
 * and decimal↔fraction stays in tenths and hundredths. Answers are computed
 * from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '3-5';

const TEMPLATES = [
  {
    skillId: 'emf-multi-digit-multiplication',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 12, 49), b = int(r, 3, 9);
        return { prompt: `Multiply: ${a} × ${b}`,
          value: a * b,
          explanation: `Break ${a} into tens and ones: ${Math.floor(a / 10) * 10} × ${b} = ${Math.floor(a / 10) * 10 * b} and ${a % 10} × ${b} = ${(a % 10) * b}. Add the partial products: ${Math.floor(a / 10) * 10 * b} + ${(a % 10) * b} = ${a * b}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 12, 29), b = int(r, 11, 19);
        return { prompt: `Multiply: ${a} × ${b}`,
          value: a * b,
          explanation: `Split both factors: (${Math.floor(a / 10) * 10} + ${a % 10}) × (${Math.floor(b / 10) * 10} + ${b % 10}) gives four partial products: ${Math.floor(a / 10) * 10 * Math.floor(b / 10) * 10}, ${Math.floor(a / 10) * 10 * (b % 10)}, ${(a % 10) * Math.floor(b / 10) * 10}, ${(a % 10) * (b % 10)}. They sum to ${a * b} — the same four boxes an area model draws.` };
      } },
    ],
  },

  {
    skillId: 'emf-factors-multiples',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const n = pick(r, [12, 18, 20, 24, 30, 36]);
          const fac = [];
          for (let d = 1; d <= n; d++) if (n % d === 0) fac.push(d);
          return { prompt: `How many factors does ${n} have?`,
            value: fac.length,
            explanation: `List the factor pairs of ${n}: ${fac.join(', ')} — ${fac.length} in all. Working in pairs (1·${n}, 2·${n / 2}, …) makes sure none are missed.` };
        }
        const k = int(r, 3, 9), j = int(r, 4, 9);
        return { prompt: `What is the ${j}th multiple of ${k}?`,
          value: k * j,
          explanation: `The multiples of ${k} are ${k}, ${2 * k}, ${3 * k}, … — skip-counting by ${k}. The ${j}th one is ${k} × ${j} = ${k * j}.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        const PRIMES = [7, 11, 13, 17, 19, 23];
        const COMPS = [{ n: 15, f: '3 × 5' }, { n: 21, f: '3 × 7' }, { n: 27, f: '3 × 9' }, { n: 33, f: '3 × 11' }, { n: 39, f: '3 × 13' }, { n: 49, f: '7 × 7' }];
        if (made % 2 === 0) {
          const p0 = pick(r, PRIMES);
          return { prompt: `Is ${p0} prime or composite?`,
            value: 'Prime',
            options: ['Prime', 'Composite', 'Neither', 'Both'],
            correctOption: 'A',
            explanation: `${p0} has exactly two factors: 1 and ${p0}. No smaller number (except 1) divides it evenly — that is the definition of prime. Testing divisors up to its square root is enough.` };
        }
        const c = COMPS[Math.floor(made / 2) % COMPS.length];
        return { prompt: `Is ${c.n} prime or composite?`,
          value: 'Composite',
          options: ['Prime', 'Composite', 'Neither', 'Both'],
          correctOption: 'B',
          explanation: `${c.n} = ${c.f}, so it has factors besides 1 and itself — composite. A number is composite the moment ONE extra factor turns up; no need to find them all.` };
      } },
    ],
  },

  {
    skillId: 'emf-long-division',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const d = int(r, 3, 9), q = int(r, 11, 32);
        return { prompt: `Divide: ${d * q} ÷ ${d}`,
          value: q,
          explanation: `Long division: ${d} goes into ${d * q} exactly ${q} times, since ${d} × ${q} = ${d * q}. Check every division with the multiplication that undoes it.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d = int(r, 4, 9), q = int(r, 12, 29), rem = int(r, 1, 3);
        const n = d * q + rem;
        return { prompt: `Divide: ${n} ÷ ${d}. Give the quotient and remainder as "q R r".`,
          value: `${q} R ${rem}`,
          explanation: `${d} × ${q} = ${d * q}, which leaves ${n} − ${d * q} = ${rem} over — too small for another group of ${d}. So ${n} ÷ ${d} = ${q} R ${rem}. The remainder must always be smaller than the divisor.` };
      } },
    ],
  },

  {
    skillId: 'emf-interpreting-remainders',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const d = pick(r, [4, 6, 8]), q = int(r, 3, 9), rem = int(r, 1, 3);
        const n = d * q + rem;
        if (made % 2 === 0) {
          return { prompt: `${n} students are going on a trip. Each van holds ${d} students. How many vans are needed?`,
            value: q + 1,
            explanation: `${n} ÷ ${d} = ${q} R ${rem}. The ${rem} leftover student${rem > 1 ? 's' : ''} still need${rem > 1 ? '' : 's'} a van, so ROUND UP: ${q + 1} vans. When the remainder represents people or things that must be included, the quotient rounds up.` };
        }
        return { prompt: `${n} apples are packed into bags of ${d}. How many FULL bags can be made?`,
          value: q,
          explanation: `${n} ÷ ${d} = ${q} R ${rem}. The question asks for FULL bags only, so the remainder is dropped: ${q} bags (with ${rem} apple${rem > 1 ? 's' : ''} left over). Same division, opposite treatment of the remainder — the QUESTION decides.` };
      } },
      { difficulty: 4, gen: (r) => {
        const d = pick(r, [4, 5, 6, 8]), q = int(r, 3, 9), rem = int(r, 1, 3);
        const n = d * q + rem;
        return { prompt: `${n} dollars are shared equally among ${d} friends, whole dollars only. How many dollars are LEFT OVER after sharing?`,
          value: rem,
          explanation: `${n} ÷ ${d} = ${q} R ${rem}: each friend gets $${q}, and the remainder itself — $${rem} — is what is left. Sometimes the remainder IS the answer, the third way a remainder can be read.` };
      } },
    ],
  },

  {
    skillId: 'emf-mixed-numbers-improper',
    tiers: [
      { difficulty: 2, gen: (r) => {
        // The fractional part must already be in lowest terms — "3 2/4" is not
        // a mixed number anyone should be shown, let alone asked to convert.
        const gcd = (x, y) => (y ? gcd(y, x % y) : x);
        const d = pick(r, [2, 3, 4, 5, 6, 8]), w = int(r, 1, 4);
        let num = int(r, 1, d - 1);
        while (gcd(num, d) !== 1) num = ((num + 1) % d) || 1;
        return { prompt: `Write ${w} ${num}/${d} as an improper fraction.`,
          value: `${w * d + num}/${d}`,
          explanation: `Each whole is ${d}/${d}, so ${w} wholes make ${w * d} ${d}ths, plus the extra ${num}: (${w} × ${d} + ${num})/${d} = ${w * d + num}/${d}. Multiply the whole by the denominator, then add the numerator.` };
      } },
      { difficulty: 3, gen: (r) => {
        const gcd = (x, y) => (y ? gcd(y, x % y) : x);
        const d = pick(r, [3, 4, 5, 6, 8]), w = int(r, 1, 4);
        let num = int(r, 1, d - 1);
        while (gcd(num, d) !== 1) num = ((num + 1) % d) || 1;
        const imp = w * d + num;
        return { prompt: `Write ${imp}/${d} as a mixed number.`,
          value: `${w} ${num}/${d}`,
          explanation: `Divide: ${imp} ÷ ${d} = ${w} R ${num}. The quotient is the whole-number part and the remainder stays over ${d}: ${w} ${num}/${d}. Converting to a mixed number IS a division-with-remainder problem.` };
      } },
    ],
  },

  {
    skillId: 'emf-decimals-fractions-connection',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const num = int(r, 1, 9);
          return { prompt: `Write ${num}/10 as a decimal.`,
            value: `0.${num}`,
            explanation: `Tenths live one place right of the decimal point: ${num}/10 = 0.${num}. The denominator 10 and the first decimal place are the same idea in two notations.` };
        }
        const num = int(r, 1, 9) * 10 + int(r, 1, 9);
        return { prompt: `Write ${num}/100 as a decimal.`,
          value: `0.${num}`,
          explanation: `Hundredths fill two decimal places: ${num}/100 = 0.${num}. Money is the everyday model — ${num} cents is ${num}/100 of a dollar, written $0.${num}.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const num = int(r, 1, 9);
          return { prompt: `Write 0.${num} as a fraction.`,
            value: `${num}/10`,
            explanation: `The digit ${num} sits in the tenths place, so 0.${num} = ${num}/10. Read the place value aloud — "${num} tenths" — and the fraction writes itself.` };
        }
        const CASES = [[5, 10, '1/2'], [2, 10, '1/5'], [25, 100, '1/4'], [50, 100, '1/2'], [75, 100, '3/4'], [20, 100, '1/5']];
        const [num, den, red] = CASES[Math.floor(made / 2) % CASES.length];
        return { prompt: `Write 0.${num === 5 || num === 2 ? num : String(num).padStart(2, '0')} as a fraction in lowest terms.`,
          value: red,
          explanation: `0.${num === 5 || num === 2 ? num : String(num).padStart(2, '0')} = ${num}/${den}, and reducing gives ${red}. The benchmark decimals — 0.5, 0.25, 0.75, 0.2 — are worth knowing on sight in both forms.` };
      } },
    ],
  },

  {
    skillId: 'emf-angles-basics',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { deg: 90, a: 'Right', e: 'Exactly 90° — a perfect square corner, like the corner of a book. The little square symbol marks it.' },
          { deg: 45, a: 'Acute', e: 'Less than 90° — a sharp, narrow opening. "Acute" means sharp; 45° is half a right angle.' },
          { deg: 120, a: 'Obtuse', e: 'Between 90° and 180° — wider than a square corner but not yet flat. "Obtuse" means blunt.' },
          { deg: 180, a: 'Straight', e: 'Exactly 180° — the two rays point in opposite directions, forming a straight line.' },
          { deg: 30, a: 'Acute', e: 'Less than 90°, so acute — a very narrow opening, one third of a right angle.' },
          { deg: 150, a: 'Obtuse', e: 'Between 90° and 180°, so obtuse — nearly flat but not quite.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: `An angle measures ${c.deg}°. What type of angle is it?`,
          value: c.a,
          options: ['Right', 'Acute', 'Obtuse', 'Straight'],
          correctOption: 'ABCD'[['Right', 'Acute', 'Obtuse', 'Straight'].indexOf(c.a)],
          explanation: c.e };
      } },
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = pick(r, [25, 35, 40, 55, 65, 72]);
          return { prompt: `Two angles together form a RIGHT angle. One measures ${a}°. What does the other measure?`,
            value: 90 - a,
            explanation: `Angles that build a right angle add to 90° (complementary): 90 − ${a} = ${90 - a}°.` };
        }
        const a = pick(r, [48, 62, 75, 110, 125, 140]);
        return { prompt: `Two angles together form a STRAIGHT line. One measures ${a}°. What does the other measure?`,
          value: 180 - a,
          explanation: `Angles along a straight line add to 180° (supplementary): 180 − ${a} = ${180 - a}°.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
