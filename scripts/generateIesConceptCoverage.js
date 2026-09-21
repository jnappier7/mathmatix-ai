// scripts/generateIesConceptCoverage.js
//
// Closes the two Integrating Essential Skills concept areas ACT names in its
// own spec that our IES bank did not cover at all.
//
// "Preparing for the ACT" ((c) 2026) lists exactly five IES concept areas:
//   - rates and percentages              -> act-percentages, act-rates-unit-conversion
//   - proportional relationships         -> act-ratios-proportions
//   - area, surface area, and volume     -> act-basic-geometry-measures
//   - average and median                 -> NOTHING            <- this file
//   - expressing numbers in different    -> NOTHING            <- this file
//     ways
//
// Both gaps are real on the live forms: the official practice tests score a
// "mean of 4 numbers is 45, find the fourth" item as IES, and a "where does
// sqrt(8) fall on a number line cut into 6 equal segments" item as IES. Our
// six IES skills could not have produced either.
//
// The items here are ORIGINAL. The published forms were read for their item
// ARCHETYPES and distractor logic — what the question asks you to do, and which
// specific wrong move each choice rewards — which is what makes an ACT item an
// ACT item. No prompt, number set, or context is taken from a published test.
//
// Every distractor is tied to a named error in the explanation, because the
// review flow reads that explanation aloud when a student misses the item.
//
// Usage: node scripts/generateIesConceptCoverage.js   (rewrites the two skills'
// rows in seeds/act-ies-expansion/ies-items.generated.json, idempotently)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'seeds', 'act-ies-expansion', 'ies-items.generated.json');
const SOURCE = 'act-ies-expansion';

/** Build one bank row. `opts` are [text,...] with `ans` the correct text. */
function item(id, skillId, difficulty, prompt, opts, ans, explanation) {
  const labels = ['A', 'B', 'C', 'D'];
  const idx = opts.indexOf(ans);
  if (idx < 0) throw new Error(`${id}: answer "${ans}" is not among the options`);
  if (new Set(opts).size !== opts.length) throw new Error(`${id}: duplicate options`);
  if (opts.length !== 4) throw new Error(`${id}: ACT items have exactly 4 choices`);
  const body = {
    problemId: id,
    skillId,
    prompt,
    svg: null,
    answer: { type: 'auto', value: ans, equivalents: [] },
    answerType: 'multiple-choice',
    options: opts.map((text, i) => ({ label: labels[i], text })),
    correctOption: labels[idx],
    difficulty,
    gradeBand: '8-12',
    explanation,
    tags: ['act', 'act-math', 'integrating-essential-skills', 'IES'],
    source: SOURCE,
    isActive: true,
  };
  // Same formula the rest of this bank uses (pinned by actIesBank.test.js):
  // problemId | prompt | answer.value.
  body.contentHash = crypto.createHash('sha256')
    .update(`${id}|${prompt}|${ans}`).digest('hex');
  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// act-average-median — ACT's "average and median"
// The signature IES move is working BACKWARDS from a summary statistic, not
// computing one forwards; and knowing that mean and median answer different
// questions about the same list.
// ─────────────────────────────────────────────────────────────────────────────
const AVG = 'act-average-median';
const A = (n, d, p, o, a, e) => item(`act-ies-avgmed-${String(n).padStart(3, '0')}`, AVG, d, p, o, a, e);

const averageMedian = [
  A(1, 1, 'Over 5 games, a basketball player scored 14, 22, 9, 17, and 18 points. What was her average (arithmetic mean) number of points per game?',
    ['15', '16', '17', '80'], '16',
    'The five scores total 14 + 22 + 9 + 17 + 18 = 80, and 80 ÷ 5 = 16. Choice D (80) stops at the total and never divides. Choice C (17) is the median — the middle value once the scores are ordered 9, 14, 17, 18, 22 — which is a different statistic.'),

  A(2, 1, 'What is the median of the list 12, 7, 19, 4, and 11?',
    ['4', '10.6', '11', '19'], '11',
    'Order the list first: 4, 7, 11, 12, 19. With five values the median is the third, 11. Choice B (10.6) is the mean, not the median. Choosing 19 or 4 takes the largest or smallest value instead of the middle one, and the most common slip is reading the middle of the UNORDERED list (19).'),

  A(3, 2, 'What is the median of the list 8, 3, 14, 6, 11, and 2?',
    ['6', '7', '8', '8.5'], '7',
    'With an even number of values the median is the average of the two middle ones. Ordered, the list is 2, 3, 6, 8, 11, 14, so the middle two are 6 and 8 and the median is (6 + 8) ÷ 2 = 7. Choices A and C take just one of the two middle values; choice D (8.5) is the mean.'),

  A(4, 2, 'The mean of 4 numbers is 31. Three of the numbers are 18, 27, and 44. What is the fourth number?',
    ['29', '31', '35', '124'], '35',
    'If the mean of 4 numbers is 31, the four must total 4 × 31 = 124. The three given numbers total 18 + 27 + 44 = 89, so the fourth is 124 − 89 = 35. Choice D (124) stops at the total. Choice A (29) averages only the three given numbers. Choice B assumes the missing value must equal the mean, which is only true when the other values already average to it.'),

  A(5, 2, 'A student has quiz scores of 82, 91, and 76. What score on a fourth quiz would give the student an average of exactly 85?',
    ['85', '88', '91', '340'], '91',
    'Four quizzes averaging 85 must total 4 × 85 = 340. The first three total 82 + 91 + 76 = 249, so the fourth must be 340 − 249 = 91. Choice D (340) is the required total, not a single score. Choice A assumes scoring the target average keeps the average at the target, which only holds if the current average is already 85 — here it is 83.')
,
  A(6, 3, 'The mean of 6 numbers is 20. When one number is removed, the mean of the remaining 5 numbers is 22. What number was removed?',
    ['2', '10', '18', '21'], '10',
    'Six numbers with mean 20 total 6 × 20 = 120. The remaining five with mean 22 total 5 × 22 = 110. The removed number is 120 − 110 = 10. Choice A (2) subtracts the two means. Note the mean went UP when the number was removed, so the removed value had to be below 20 — that alone rules out choice D.'),

  A(7, 3, 'In a class of 20 students, the 12 students in the morning section averaged 78 on a test and the 8 students in the afternoon section averaged 88. What was the average score for all 20 students?',
    ['81', '82', '83', '84'], '82',
    'Weight each section by its size: the morning section contributes 12 × 78 = 936 and the afternoon 8 × 88 = 704, for a total of 1,640 across 20 students, so 1,640 ÷ 20 = 82. Choice C (83) averages the two section averages as if the sections were the same size — the classic trap. Because the larger section scored lower, the true average must sit below 83.'),

  A(8, 3, 'The table shows the number of pets owned by the 15 students in a club. What is the median number of pets?\n\n  Pets:     0   1   2   3\n  Students: 4   6   3   2',
    ['1', '1.5', '2', '6'], '1',
    'With 15 values the median is the 8th when they are listed in order. The first 4 students own 0 pets and the next 6 own 1 pet, so values 5 through 10 are all 1 — the 8th is 1. Choice D (6) reads the largest FREQUENCY instead of a data value. Choice C (2) takes the middle of the "Pets" row rather than the middle of the 15 students.'),

  A(9, 4, 'A set of 7 numbers has a mean of 12. If each number in the set is increased by 4, what is the mean of the new set?',
    ['12', '16', '28', '84'], '16',
    'Adding 4 to every value adds 7 × 4 = 28 to the total, so the new total is 84 + 28 = 112 and the new mean is 112 ÷ 7 = 16 — the original mean plus 4. Choice D (84) is the original total. Choice C (28) is the total added. Shifting every value shifts the mean by the same amount; it does not multiply it.'),

  A(10, 4, 'The mean of 5 numbers is 30. Four of the numbers are 21, 34, 27, and 38. A sixth number is then added to the original five, and the mean of all 6 numbers is 32. What is the sixth number?',
    ['30', '42', '44', '192'], '42',
    'The original five total 5 × 30 = 150. Six numbers with mean 32 total 6 × 32 = 192, so the sixth number is 192 − 150 = 42. Choice D (192) stops at the new total. The four listed values are not needed — recognizing that the fifth number never has to be found is the point of the question. Choice C (44) comes from using the four listed values (120) plus a wrongly recovered fifth.'),

  A(11, 4, 'A list of 5 numbers is 6, 9, 14, 21, and x. For which value of x is the median of the list equal to 14?',
    ['9', '12', '14', 'any value of x that is at least 14'], 'any value of x that is at least 14',
    'With 6, 9, 14, and 21 already placed, x becomes the fifth value and the median is the third. If x is 14 or larger, the ordered list has 6 and 9 below 14 and two values at or above it, so 14 sits third and is the median. If x were less than 14 the list would read x, 6, 9, 14, 21 (or similar) and the median would drop to 9. Choices A and B each place x below 14, which moves the median off 14.'),

  A(12, 5, 'A data set of 9 values has a median of 40. The 4 smallest values are each increased by 10 and the 4 largest values are each decreased by 10. What happens to the median?',
    ['It increases by 10.', 'It decreases by 10.', 'It stays 40.', 'It cannot be determined from the given information.'], 'It cannot be determined from the given information.',
    'The median is the 5th value, which was not changed — but that is not enough. Raising the 4 smallest by 10 can push one of them above 40, and lowering the 4 largest by 10 can pull one below 40, which reorders the list and changes which value sits 5th. Whether that happens depends on values not given. Choice C is the tempting answer for exactly the reason it fails: the untouched middle value only stays the median if the ordering around it survives.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// act-number-forms — ACT's "expressing numbers in different ways"
// Fractions, decimals, percents, scientific notation and radicals as different
// clothes on the same quantity — plus placing an irrational between benchmarks,
// which is the form this concept most often takes on a real section.
// ─────────────────────────────────────────────────────────────────────────────
const NUM = 'act-number-forms';
const N = (n, d, p, o, a, e) => item(`act-ies-numforms-${String(n).padStart(3, '0')}`, NUM, d, p, o, a, e);

const numberForms = [
  N(1, 1, 'Which of the following is equal to 3/8?',
    ['0.375', '0.38', '3.8', '0.625'], '0.375',
    '3 ÷ 8 = 0.375 exactly. Choice B (0.38) is that value rounded and so is not equal to it. Choice C (3.8) reads the fraction bar as a decimal point. Choice D (0.625) is 5/8, the complement of 3/8.'),

  N(2, 1, 'A survey found that 0.6 of the respondents owned a bicycle. What percent of the respondents owned a bicycle?',
    ['0.6%', '6%', '60%', '600%'], '60%',
    'A decimal becomes a percent by multiplying by 100, so 0.6 = 60%. Choice B (6%) moves the decimal point only one place. Choice A treats the decimal as though it were already a percent. A quick check: 0.6 is more than half, so the answer must be more than 50%.'),

  N(3, 2, 'Between which two consecutive integers does √53 lie?',
    ['6 and 7', '7 and 8', '8 and 9', '26 and 27'], '7 and 8',
    'Compare 53 to nearby perfect squares: 7² = 49 and 8² = 64. Since 49 < 53 < 64, √53 falls between 7 and 8. Choice D halves 53 instead of taking its square root — the most common misread of the radical.'),

  N(4, 2, 'The mass of a certain particle is 4.5 × 10⁻⁵ grams. What is this mass written in standard decimal form?',
    ['0.000045', '0.00045', '450,000', '0.0000045'], '0.000045',
    'A negative exponent moves the decimal point left, here 5 places: 4.5 becomes 0.000045. Choice B moves only 4 places. Choice C moves right, which is what a POSITIVE exponent would do and would make a subatomic particle heavier than a person.'),

  N(5, 2, 'Which of the following lists is in order from least to greatest?',
    ['0.7, 5/8, 68%', '5/8, 68%, 0.7', '68%, 5/8, 0.7', '5/8, 0.7, 68%'], '5/8, 68%, 0.7',
    'Convert to one form before comparing anything: 5/8 = 0.625, 68% = 0.68, and 0.7 = 0.700, so the order is 0.625 < 0.68 < 0.7. Choice D gets the smallest right and then ranks 0.7 below 68% by comparing the bare numerals 0.7 and 68 instead of their values. Choice A leads with 0.7, the largest. Choice C assumes a percent must be smallest because it is written as a part of 100.'),

  N(6, 3, 'On a number line, the segment from 0 to 5 is divided into 10 segments of equal length by 9 evenly spaced points. Between which two of those points does √21 fall?',
    ['The 8th and 9th points', 'The 9th point and 5', 'The 7th and 8th points', 'It falls exactly on the 9th point.'], 'The 9th point and 5',
    'Each segment has length 5 ÷ 10 = 0.5, so the 9th point sits at 9 × 0.5 = 4.5. Square the candidates instead of approximating the radical: 4.5² = 20.25 and 5² = 25, and 20.25 < 21 < 25, so √21 lies between 4.5 and 5. Choice D assumes 4.5² is 21 when it is 20.25, so the point is close but not exact. Choices A and C come from estimating √21 near 4.2 or below instead of anchoring it between the squares that bracket 21.'),

  N(7, 3, 'A city has a population of 2.4 × 10⁵ people and a land area of 8 × 10² square miles. What is the population density, in people per square mile?',
    ['3 × 10²', '3 × 10³', '1.92 × 10⁸', '3 × 10⁷'], '3 × 10²',
    'Divide the coefficients and subtract the exponents: (2.4 ÷ 8) × 10^(5−2) = 0.3 × 10³ = 3 × 10², or 300 people per square mile. Choice C multiplies instead of dividing. Choice B keeps 10³ without renormalizing 0.3 to 3 × 10⁻¹, which is the step most often dropped.'),

  N(8, 3, 'Which of the following is NOT equal to 0.24?',
    ['6/25', '24%', '2.4 \u00d7 10\u207b\u00b2', '12/50'], '2.4 \u00d7 10\u207b\u00b2',
    '2.4 \u00d7 10\u207b\u00b2 moves the decimal point TWO places left, giving 0.024 \u2014 one tenth of 0.24. Choices A, B and D are the same number in three different forms: 6/25 = 0.24, 24% = 0.24, and 12/50 reduces to 6/25 = 0.24. The trap is reading a negative exponent as "make it a decimal" without counting the places; 0.24 in scientific notation is 2.4 \u00d7 10\u207b\u00b9, not 10\u207b\u00b2.'),

  N(9, 4, 'The repeating decimal 0.4̄ (0.444…) is equal to which of the following fractions?',
    ['4/9', '2/5', '4/10', '44/100'], '4/9',
    'For a single repeating digit d, 0.ddd… = d/9, so 0.444… = 4/9 ≈ 0.4444. Choices C (0.4) and D (0.44) are the decimal truncated after one or two places, which is close but not equal. Choice B (2/5) is also exactly 0.4. The repeating bar is what separates the exact value from its roundings.'),

  N(10, 4, 'If √n is between 6 and 7, which of the following could be the value of n?',
    ['13', '36', '45', '49'], '45',
    'Square the bounds: 6² = 36 and 7² = 49, so n must satisfy 36 < n < 49. Only 45 falls strictly between. Choices B (36) and D (49) are the endpoints, where √n equals 6 or 7 rather than lying between them. Choice A (13) comes from adding 6 and 7 instead of squaring.'),

  N(11, 4, 'A recipe calls for 2/3 cup of flour for every 1/2 cup of sugar. Which of the following expresses the ratio of flour to sugar as a single number?',
    ['1/3', '3/4', '4/3', '7/6'], '4/3',
    'A ratio is a quotient: (2/3) ÷ (1/2) = (2/3) × (2/1) = 4/3. Choice B (3/4) inverts the ratio, giving sugar to flour. Choice A multiplies the two fractions instead of dividing. Choice D adds them. Since more flour than sugar is used, the ratio must be greater than 1 — which rules out A and B immediately.'),

  N(12, 5, 'Which of the following is NOT equal to 16/5?',
    ['3.2', '320%', '√10', '3 1/5'], '√10',
    '16/5 = 3.2 exactly, and so are the other three: 320% = 3.20, and the mixed number 3 1/5 = 3 + 0.2 = 3.2. Only √10 differs — it is about 3.1623, because 3.2² = 10.24, which is more than 10, so √10 must be a little less than 3.2. Choice C is the one most often kept as "equal" precisely because it is close; being near a value is not being it. The question is really asking which form is irrational.'),
];

// ── Build, validate, and merge into the bank ────────────────────────────────
const fresh = [...averageMedian, ...numberForms];
const ids = new Set();
fresh.forEach((it) => {
  if (ids.has(it.problemId)) throw new Error(`duplicate problemId ${it.problemId}`);
  ids.add(it.problemId);
  if (!it.prompt || !it.explanation) throw new Error(`${it.problemId}: empty prompt/explanation`);
  if (it.difficulty < 1 || it.difficulty > 5) throw new Error(`${it.problemId}: difficulty out of range`);
});

const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const kept = existing.filter((p) => p.skillId !== AVG && p.skillId !== NUM);
const merged = [...kept, ...fresh];
// 1-space indent: match the file the rest of this bank was written with, so
// adding items shows 24 new items in the diff and not 13,000 reindented lines.
fs.writeFileSync(FILE, `${JSON.stringify(merged, null, 1)}\n`);

const byDiff = {};
fresh.forEach((i) => { byDiff[i.difficulty] = (byDiff[i.difficulty] || 0) + 1; });
console.log(`bank: ${existing.length} -> ${merged.length} items`);
console.log(`  ${AVG}: ${averageMedian.length}`);
console.log(`  ${NUM}: ${numberForms.length}`);
console.log('  difficulty spread:', JSON.stringify(byDiff));
