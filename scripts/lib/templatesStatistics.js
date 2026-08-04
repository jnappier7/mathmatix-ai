'use strict';
/**
 * Statistics: thirteen families serving the AP Statistics ladder (STAT.DTA.*)
 * and Algebra 2's data strand (ALG2.DTA.*) — 31 catalog skills with no bank
 * content under any name. The bank's existing statistics reach ends at
 * descriptive work (mean/median, data displays, one bank of 15 generic
 * items); everything inferential — sampling distributions, intervals, tests,
 * chi-square, errors and power — starts here.
 *
 * Number design: z-scores draw (x − μ) as exact multiples of σ, standard
 * errors draw σ over perfect-square n, expected values use probabilities in
 * tenths that sum to 1, chi-square expected counts come from products that
 * divide the table total, and every interval endpoint lands on a tenth.
 * Conceptual skills (study design, interpreting intervals, errors) are MC
 * with canonical statistical answers, cycled on the item index. Answers are
 * computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '10-12';

const TEMPLATES = [
  {
    skillId: 'stat-study-design',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Every student in a school is numbered and 50 are chosen with a random number generator. What sampling method is this?',
            a: 'Simple random sample', opts: ['Simple random sample', 'Stratified sample', 'Convenience sample', 'Voluntary response'],
            e: 'Every group of 50 students is equally likely — the definition of an SRS. Numbering the whole population and drawing at random is the canonical mechanism.' },
          { q: 'A school splits students by grade level, then randomly samples WITHIN each grade. What method is this?',
            a: 'Stratified random sample', opts: ['Stratified random sample', 'Simple random sample', 'Cluster sample', 'Census'],
            e: 'Sampling within pre-formed homogeneous groups (strata) is stratification — it guarantees every grade is represented, which an SRS cannot promise.' },
          { q: 'Researchers ASSIGN treatments to subjects at random. What kind of study is this?',
            a: 'An experiment', opts: ['An experiment', 'An observational study', 'A survey', 'A census'],
            e: 'Random assignment of treatments is what makes an experiment. Observational studies only record what subjects already do — no assignment, no causal conclusions.' },
          { q: 'In a study of exercise and health, wealthier people both exercise more AND have better healthcare. Wealth is a ___.',
            a: 'Confounding variable', opts: ['Confounding variable', 'Response variable', 'Placebo', 'Statistic'],
            e: 'Wealth influences both the explanatory and response variables, so its effect tangles with exercise\'s — confounding. Random assignment is the tool that breaks such links.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'A study uses random SELECTION of subjects but does not randomly assign treatments. What conclusions can it support?',
            value: 'Generalization to the population, but not cause and effect',
            options: ['Generalization to the population, but not cause and effect', 'Cause and effect, but not generalization', 'Both', 'Neither'],
            correctOption: 'A',
            explanation: 'Random selection → results generalize to the sampled population. Random ASSIGNMENT → causal claims. Each randomization buys its own conclusion, and this study only performed the first.' };
        }
        return { prompt: 'Why do well-designed experiments include a control group?',
          value: 'To provide a baseline separating the treatment effect from other influences',
          options: ['To provide a baseline separating the treatment effect from other influences', 'To increase the sample size', 'To eliminate the need for randomization', 'To guarantee statistical significance'],
          correctOption: 'A',
          explanation: 'Without a control, any change could be time, placebo effect, or chance. The control group experiences everything except the treatment — the comparison isolates what the treatment itself did.' };
      } },
    ],
  },

  {
    skillId: 'stat-regression',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const b = int(r, 2, 8), a = int(r, 5, 20), x0 = int(r, 2, 9);
        if (made % 2 === 0) {
          return { prompt: `A least-squares line is ŷ = ${a} + ${b}x. Predict y when x = ${x0}.`,
            value: a + b * x0,
            explanation: `Substitute: ŷ = ${a} + ${b}(${x0}) = ${a + b * x0}. The line exists to make exactly this kind of prediction — within the range of the observed x-values.` };
        }
        const y = a + b * x0 + pick(r, [-4, -3, 3, 5]);
        return { prompt: `The line ŷ = ${a} + ${b}x predicts ŷ = ${a + b * x0} at x = ${x0}, but the actual observation there is y = ${y}. What is the residual?`,
          value: y - (a + b * x0),
          explanation: `Residual = actual − predicted = ${y} − ${a + b * x0} = ${y - (a + b * x0)}. ${y - (a + b * x0) > 0 ? 'Positive: the point sits above the line.' : 'Negative: the point sits below the line.'} Least squares chose the line minimizing the sum of these, squared.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const r2 = pick(r, [49, 64, 81, 36]);
          return { prompt: `A regression has r² = 0.${r2}. What does this number mean?`,
            value: `${r2}% of the variation in y is explained by the linear relationship with x`,
            options: [`${r2}% of the variation in y is explained by the linear relationship with x`, `${r2}% of predictions are correct`, `The slope is 0.${r2}`, `${r2}% of points lie on the line`],
            correctOption: 'A',
            explanation: `r² is the fraction of y's variability accounted for by the line. It says nothing about individual predictions being "correct" — the other ${100 - r2}% of variation is in the residuals.` };
        }
        const b = int(r, 2, 9);
        return { prompt: `A regression of exam score on hours studied has slope ${b}. Interpret the slope.`,
          value: `Each additional hour of study predicts about ${b} more points, on average`,
          options: [`Each additional hour of study predicts about ${b} more points, on average`, `Studying causes exactly ${b} extra points`, `${b}% of students improve`, `The exam has ${b} questions per hour`],
          correctOption: 'A',
          explanation: `Slope = predicted change in y per unit change in x — "predicts, on average" is the exam-safe phrasing. "Causes" oversteps: regression on observational data describes association, not causation.` };
      } },
    ],
  },

  {
    skillId: 'stat-random-variables',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const x1 = int(r, 0, 2), x2 = x1 + int(r, 1, 3), x3 = x2 + int(r, 1, 3);
        const p1 = pick(r, [2, 3, 5]);
        const p3 = pick(r, [1, 2]);
        const p2 = 10 - p1 - p3;
        const ev = (x1 * p1 + x2 * p2 + x3 * p3) / 10;
        return { prompt: `X takes the value ${x1} with probability 0.${p1}, ${x2} with probability 0.${p2}, and ${x3} with probability 0.${p3}. Find the mean (expected value) of X.`,
          value: ev,
          explanation: `E(X) = Σ x·p = ${x1}(0.${p1}) + ${x2}(0.${p2}) + ${x3}(0.${p3}) = ${ev}. The mean of a random variable is a probability-weighted average — the long-run average value over many repetitions.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const mu = int(r, 3, 12), a = pick(r, [2, 3, 4]), b0 = int(r, 1, 9);
          return { prompt: `X has mean ${mu}. What is the mean of ${a}X + ${b0}?`,
            value: a * mu + b0,
            explanation: `Means transform linearly: E(${a}X + ${b0}) = ${a}·E(X) + ${b0} = ${a}·${mu} + ${b0} = ${a * mu + b0}. (Standard deviations behave differently — the +${b0} shift would NOT affect spread.)` };
        }
        return { prompt: 'X and Y are independent random variables. Which quantity requires INDEPENDENCE to compute the way it is usually taught?',
          value: 'The variance of X + Y (variances add only when independent)',
          options: ['The variance of X + Y (variances add only when independent)', 'The mean of X + Y', 'The mean of 3X', 'The mean of X − Y'],
          correctOption: 'A',
          explanation: 'Means ALWAYS add: E(X + Y) = E(X) + E(Y), independent or not. Variances add — Var(X + Y) = Var(X) + Var(Y) — only under independence. And note variances add even for X − Y; spreads never subtract.' };
      } },
    ],
  },

  {
    skillId: 'stat-binomial-geometric',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const n = pick(r, [10, 20, 40, 50]), p10 = pick(r, [1, 2, 3, 4, 5]);
        if (made % 2 === 0) {
          return { prompt: `X counts successes in ${n} independent trials, each with success probability 0.${p10}. What is the mean of X?`,
            value: (n * p10) / 10,
            explanation: `Binomial mean: μ = np = ${n}(0.${p10}) = ${(n * p10) / 10}. On average, that many of the ${n} trials succeed — the intuition and the formula agree exactly.` };
        }
        const denom = pick(r, [4, 5, 10]);
        return { prompt: `Y counts the number of trials UNTIL the first success, where each trial succeeds with probability 1/${denom}. What is the mean of Y?`,
          value: denom,
          explanation: `Geometric mean: μ = 1/p = ${denom}. If something happens 1 time in ${denom}, you wait ${denom} trials on average — the geometric setting counts the wait, the binomial counts successes in a FIXED number of trials.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const CASES = [
          { q: 'Rolling a die 30 times and counting the sixes is which setting?',
            a: 'Binomial', e: 'Fixed number of trials (30), two outcomes per trial, constant p = 1/6, independent rolls — all four binomial conditions. The COUNT of successes is binomial.' },
          { q: 'Rolling a die until the first six appears, counting the rolls, is which setting?',
            a: 'Geometric', e: 'No fixed number of trials — you roll UNTIL success. Counting trials to the first success is the geometric setting.' },
          { q: 'Drawing 5 cards WITHOUT replacement and counting hearts is which setting?',
            a: 'Neither — trials are not independent', e: 'Without replacement, each draw changes the deck: p is not constant and trials are dependent, violating the binomial conditions. (With a large population, binomial becomes a fine approximation — 5 from 52 is not large.)' },
          { q: 'Asking randomly chosen voters until one supports a measure, counting the asks, is which setting?',
            a: 'Geometric', e: 'Trials until the first success — geometric. The same survey with a FIXED 100 voters, counting supporters, would be binomial.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a,
          options: ['Binomial', 'Geometric', 'Neither — trials are not independent', 'Uniform'],
          correctOption: 'ABCD'[['Binomial', 'Geometric', 'Neither — trials are not independent', 'Uniform'].indexOf(c.a)],
          explanation: c.e };
      } },
    ],
  },

  {
    skillId: 'stat-normal-distribution',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const mu = pick(r, [50, 100, 200, 500]), sd = pick(r, [5, 10, 20]);
        if (made % 2 === 0) {
          const k = pick(r, [1, 2]);
          return { prompt: `Scores are normal with mean ${mu} and standard deviation ${sd}. By the empirical rule, about what percent of scores fall within ${k} standard deviation${k > 1 ? 's' : ''} of the mean (between ${mu - k * sd} and ${mu + k * sd})?`,
            value: `${k === 1 ? 68 : 95}%`,
            explanation: `The empirical rule: 68% within 1 SD, 95% within 2, 99.7% within 3. Here that is the interval ${mu} ± ${k * sd}. These three numbers unlock most normal-curve reasoning without a table.` };
        }
        const z = pick(r, [-2, -1, 1, 2, 3]);
        return { prompt: `Scores are normal with mean ${mu} and standard deviation ${sd}. Find the z-score of an observation at ${mu + z * sd}.`,
          value: z,
          explanation: `z = (x − μ)/σ = (${mu + z * sd} − ${mu})/${sd} = ${z}. The z-score counts standard deviations from the mean — the universal currency that lets any normal distribution use one table.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        // Cycle which region is asked for — a fixed "above +2 SD" question made
        // every answer 2.5%.
        const mu = pick(r, [100, 200, 400]), sd = pick(r, [10, 20, 25]);
        const CASES = [
          { region: `exceed ${mu + 2 * sd}`, a: '2.5%',
            e: `95% fall within ${mu} ± ${2 * sd}, leaving 5% in the two tails — 2.5% per tail. Above ${mu + 2 * sd} is one tail. Halving the leftover is the step most answers forget.` },
          { region: `fall below ${mu - sd}`, a: '16%',
            e: `68% fall within ${mu} ± ${sd}, leaving 32% outside — 16% per tail. Below ${mu - sd} is the lower tail: 16%.` },
          { region: `fall between ${mu} and ${mu + sd}`, a: '34%',
            e: `68% lie within one SD of the mean, split symmetrically: 34% on each side. The mean-to-one-SD band is always 34% under the empirical rule.` },
          { region: `fall between ${mu + sd} and ${mu + 2 * sd}`, a: '13.5%',
            e: `Within 2 SD is 95%; within 1 SD is 68%. The two bands between them share 95 − 68 = 27%, so one side holds 13.5%.` },
        ];
        const c = CASES[made % CASES.length];
        const opts = ['2.5%', '16%', '34%', '13.5%'];
        return { prompt: `Scores are normal with mean ${mu} and SD ${sd}. Using the empirical rule, what percent of scores ${c.region}?`,
          value: c.a, options: opts,
          correctOption: 'ABCD'[opts.indexOf(c.a)],
          explanation: c.e };
      } },
    ],
  },

  {
    skillId: 'stat-sampling-distributions',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const sd = pick(r, [8, 12, 20, 30]), n = pick(r, [4, 16, 25, 100]);
        return { prompt: `A population has standard deviation ${sd}. What is the standard deviation of the sample mean for samples of size ${n}?`,
          value: sd / Math.sqrt(n),
          explanation: `σ_x̄ = σ/√n = ${sd}/√${n} = ${sd}/${Math.sqrt(n)} = ${sd / Math.sqrt(n)}. Averaging cancels noise — quadruple the sample and the spread of x̄ halves. This shrinking is why bigger samples give steadier estimates.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'A population is strongly skewed. Why can the sampling distribution of x̄ still be treated as approximately normal for large n?',
            value: 'The Central Limit Theorem',
            options: ['The Central Limit Theorem', 'The Law of Large Numbers', 'The empirical rule', 'It cannot be — the population must be normal'],
            correctOption: 'A',
            explanation: 'The CLT: for large n (≈30+), the distribution of sample MEANS is approximately normal regardless of the population\'s shape. It is the license behind most mean-based inference on non-normal data.' };
        }
        return { prompt: 'The mean of the sampling distribution of x̄ equals the population mean μ. What property of x̄ does this express?',
          value: 'x̄ is an unbiased estimator of μ',
          options: ['x̄ is an unbiased estimator of μ', 'x̄ has no sampling variability', 'Every sample mean equals μ', 'The population must be normal'],
          correctOption: 'A',
          explanation: 'Unbiased means the estimator is right ON AVERAGE — individual sample means still scatter around μ (that scatter is σ/√n), but they center on the truth rather than systematically over- or under-shooting.' };
      } },
    ],
  },

  {
    skillId: 'stat-confidence-intervals',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const phat = pick(r, [40, 45, 50, 60, 72]), me = pick(r, [2, 3, 4, 5]);
        return { prompt: `A poll reports p̂ = 0.${phat} with margin of error ±0.0${me} at 95% confidence. What is the confidence interval?`,
          value: `(0.${phat - me}, 0.${phat + me})`,
          explanation: `Interval = estimate ± margin of error: 0.${phat} ± 0.0${me} gives (0.${phat - me}, 0.${phat + me}). The interval is the honest form of the poll — the single number 0.${phat} alone hides the uncertainty.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'What does "95% confidence" actually describe?',
            value: 'The METHOD captures the true parameter in about 95% of all possible samples',
            options: ['The METHOD captures the true parameter in about 95% of all possible samples', 'There is a 95% probability the parameter is inside THIS interval', '95% of the data lie inside the interval', 'The sample proportion is within 95% of the truth'],
            correctOption: 'A',
            explanation: 'Confidence describes the procedure\'s long-run success rate, not any single interval. Once computed, an interval either contains the fixed parameter or it does not — the 95% lives in the method. This is the most-tested interpretation trap in AP Statistics.' };
        }
        return { prompt: 'Sample size is quadrupled (4×). What happens to the margin of error of a confidence interval?',
          value: 'It is cut in half',
          options: ['It is cut in half', 'It is quartered', 'It doubles', 'It is unchanged'],
          correctOption: 'A',
          explanation: 'Margin of error scales with 1/√n: quadrupling n divides it by √4 = 2. Precision is bought at a square-root exchange rate — 4× the data for 2× the precision.' };
      } },
    ],
  },

  {
    skillId: 'stat-significance-tests',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const p1000 = pick(r, [3, 12, 24, 41, 62, 87]);
        const alpha = made % 2 === 0 ? 5 : 1;
        const pval = p1000 / 1000;
        const reject = pval < alpha / 100;
        return { prompt: `A test yields P-value ${pval}. At significance level α = 0.0${alpha}, what is the decision?`,
          value: reject ? 'Reject the null hypothesis' : 'Fail to reject the null hypothesis',
          options: ['Reject the null hypothesis', 'Fail to reject the null hypothesis', 'Accept the null hypothesis as true', 'Increase α until it rejects'],
          correctOption: reject ? 'A' : 'B',
          explanation: `Compare: ${pval} ${reject ? '<' : '≥'} 0.0${alpha}, so ${reject ? 'reject H₀ — data this extreme would be rare if H₀ were true' : 'fail to reject H₀ — the data are consistent with the null'}. Note "fail to reject" is never "accept": absence of evidence is not evidence of absence.` };
      } },
      { difficulty: 4, gen: (r) => {
        return { prompt: 'What does a P-value of 0.03 mean?',
          value: 'If the null hypothesis were true, data this extreme would occur about 3% of the time',
          options: ['If the null hypothesis were true, data this extreme would occur about 3% of the time', 'There is a 3% chance the null hypothesis is true', 'The alternative hypothesis has 97% probability', '3% of the data are outliers'],
          correctOption: 'A',
          explanation: 'The P-value conditions on H₀ being TRUE and asks how surprising the data are — it is P(data | H₀), never P(H₀ | data). Reversing that conditional is the single most common inference error.' };
      } },
    ],
  },

  {
    skillId: 'stat-errors-power',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 3 === 2) {
          const alpha = pick(r, ['0.01', '0.05', '0.10']);
          return { prompt: `A significance test uses α = ${alpha}. What is the probability of a Type I error?`,
            value: alpha,
            explanation: `P(Type I) = α by definition — the significance level IS the false-alarm rate the tester chose to tolerate. Setting α = ${alpha} accepts rejecting a true null that fraction of the time.` };
        }
        if (made % 2 === 0) {
          return { prompt: 'A test REJECTS a null hypothesis that is actually TRUE. What kind of error is this?',
            value: 'Type I error',
            options: ['Type I error', 'Type II error', 'Sampling error', 'No error — rejection is always correct'],
            correctOption: 'A',
            explanation: 'Type I = false alarm: rejecting a true H₀. Its probability is exactly α, the significance level — choosing α = 0.05 IS choosing a 5% false-alarm rate.' };
        }
        return { prompt: 'A test FAILS to reject a null hypothesis that is actually FALSE. What kind of error is this?',
          value: 'Type II error',
          options: ['Type II error', 'Type I error', 'Confounding', 'A power failure'],
          correctOption: 'A',
          explanation: 'Type II = missed detection: the effect is real but the test did not see it. Its probability is β, and power = 1 − β is the chance of catching a real effect.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'Which change INCREASES the power of a significance test?',
            value: 'A larger sample size',
            options: ['A larger sample size', 'A smaller significance level α', 'A smaller true effect', 'More variability in the data'],
            correctOption: 'A',
            explanation: 'More data shrinks the standard error, making real effects easier to distinguish from noise. The other three all reduce power — note the trade-off: shrinking α (fewer false alarms) costs detection ability, unless n rises to pay for it.' };
        }
        return { prompt: 'A drug trial\'s Type I error is approving a useless drug; its Type II error is shelving an effective one. Setting α = 0.01 instead of 0.05 does what?',
          value: 'Makes approving a useless drug less likely, but missing an effective one more likely',
          options: ['Makes approving a useless drug less likely, but missing an effective one more likely', 'Reduces both errors at once', 'Increases both errors at once', 'Has no effect on either error'],
          correctOption: 'A',
          explanation: 'Lowering α tightens the bar for rejection: fewer false alarms (Type I ↓), more missed detections (Type II ↑). The two errors trade off at fixed n — context decides which is costlier.' };
      } },
    ],
  },

  {
    skillId: 'stat-two-sample-inference',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const m1 = int(r, 60, 85), m2 = m1 - int(r, 3, 12);
        return { prompt: `Group A has sample mean ${m1} and Group B has sample mean ${m2}. What is the point estimate of μ_A − μ_B?`,
          value: m1 - m2,
          explanation: `The point estimate of a difference of population means is the difference of sample means: ${m1} − ${m2} = ${m1 - m2}. The interval and test then quantify how much sampling variability surrounds this single number.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'Each subject\'s reaction time is measured before AND after drinking coffee. Which procedure fits?',
            value: 'Paired t procedures on the differences',
            options: ['Paired t procedures on the differences', 'Two-sample t for independent groups', 'A one-proportion z test', 'Chi-square test of independence'],
            correctOption: 'A',
            explanation: 'Before/after on the SAME subjects is paired data: analyze the per-subject differences with one-sample t methods. Treating the columns as independent groups ignores the pairing and wastes its noise-cancelling power.' };
        }
        return { prompt: 'A 95% confidence interval for μ_A − μ_B is (−2.1, 5.3). What does the interval containing 0 suggest?',
          value: 'The data are consistent with no difference between the means',
          options: ['The data are consistent with no difference between the means', 'The means are proven equal', 'Group A is certainly larger', 'The sample sizes were too small to compute'],
          correctOption: 'A',
          explanation: 'Zero being a plausible value means "no difference" cannot be ruled out at this confidence level — consistent with, not proof of. An interval entirely above 0 would instead signal a genuine A-over-B difference.' };
      } },
    ],
  },

  {
    skillId: 'stat-chi-square',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const rowT = pick(r, [40, 60, 80]), colT = pick(r, [30, 50, 20]);
        const total = pick(r, [200, 400]);
        return { prompt: `In a two-way table with grand total ${total}, one cell's row total is ${rowT} and its column total is ${colT}. What is that cell's EXPECTED count under independence?`,
          value: (rowT * colT) / total,
          explanation: `Expected = (row total)(column total)/(grand total) = ${rowT} × ${colT}/${total} = ${(rowT * colT) / total}. That is the count independence would predict; chi-square measures how far the observed counts stray from these.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const rows = pick(r, [2, 3, 4]), cols = pick(r, [2, 3, 5]);
          return { prompt: `A chi-square test of independence uses a table with ${rows} rows and ${cols} columns. How many degrees of freedom?`,
            value: (rows - 1) * (cols - 1),
            explanation: `df = (rows − 1)(columns − 1) = ${rows - 1} × ${cols - 1} = ${(rows - 1) * (cols - 1)}. Fixing the margins leaves exactly that many cells free to vary — the rest are forced.` };
        }
        const k = pick(r, [4, 5, 6, 8]);
        return { prompt: `A goodness-of-fit test compares observed counts across ${k} categories to a hypothesized distribution. How many degrees of freedom?`,
          value: k - 1,
          explanation: `GOF df = (categories − 1) = ${k} − 1 = ${k - 1}. The counts must sum to the total, so once ${k - 1} are known the last is determined. (Different formula from the two-way table's (r−1)(c−1) — keep them straight.)` };
      } },
    ],
  },

  {
    skillId: 'stat-simulation-inference',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const total = pick(r, [100, 200, 500]);
        const extreme = pick(r, [2, 5, 10, 20]);
        return { prompt: `To test a claim, ${total} simulated samples are generated under the null model. ${extreme} of them are at least as extreme as the observed result. Estimate the P-value.`,
          value: extreme / total,
          explanation: `Simulated P-value = (extreme count)/(simulations) = ${extreme}/${total} = ${extreme / total}. Simulation replaces formulas with brute repetition — the P-value's meaning ("how often would chance produce this?") becomes something you literally count.` };
      } },
      { difficulty: 4, gen: (r) => {
        return { prompt: 'A randomization test shuffles group labels 1000 times and recomputes the difference in means each time. What does the resulting distribution represent?',
          value: 'The differences that pure chance produces when the treatment has no effect',
          options: ['The differences that pure chance produces when the treatment has no effect', 'The true population distribution', 'The sampling error of the original study', 'The distribution of individual observations'],
          correctOption: 'A',
          explanation: 'Shuffling labels enforces the null ("labels don\'t matter") and shows what differences arise anyway. If the REAL observed difference sits far in that distribution\'s tail, chance is a poor explanation — that tail proportion is the P-value.' };
      } },
    ],
  },

  {
    skillId: 'stat-evaluating-reports',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'A TV poll invites viewers to text their opinion. 92% of respondents oppose a new policy. What is the main problem?',
            a: 'Voluntary response bias — those with strong feelings self-select', opts: ['Voluntary response bias — those with strong feelings self-select', 'The sample is too large', 'Percentages cannot exceed 90%', 'Nothing — texting is random'],
            e: 'People who bother to respond are the ones who care most, usually the angriest. Self-selected samples describe the responders, not the population — no sample size fixes that.' },
          { q: 'A study finds ice-cream sales and drowning deaths rise together. A headline says ice cream causes drowning. What is wrong?',
            a: 'Correlation is not causation — summer weather drives both', opts: ['Correlation is not causation — summer weather drives both', 'The correlation must be negative', 'Drownings cause ice-cream sales', 'The data must be fabricated'],
            e: 'A lurking variable (hot weather) raises both swimming and ice-cream sales. Association alone never establishes causation — only randomized experiments can.' },
          { q: 'A poll reports 54% support with a ±4% margin of error. A headline declares the measure "is winning." What is the flaw?',
            a: 'The interval (50%, 58%) includes values at or near 50% — the lead may not be real', opts: ['The interval (50%, 58%) includes values at or near 50% — the lead may not be real', 'Margins of error apply only to means', 'The poll needed exactly 1000 people', '54% is a majority, so the claim is airtight'],
            e: 'With ±4%, support could plausibly be 50%. Headlines report the point estimate; the honest claim lives in the interval. Check whether the interesting boundary is inside it.' },
          { q: 'An ad says "9 out of 10 dentists we surveyed recommend our brand." What should a critical reader ask FIRST?',
            a: 'How were the dentists selected, and how many were surveyed?', opts: ['How were the dentists selected, and how many were surveyed?', 'Which brand was it?', 'Whether dentists brush their teeth', 'Nothing — 90% settles it'],
            e: 'Selection method and sample size decide whether "9 of 10" means anything: 9 of 10 hand-picked consultants is advertising; 900 of 1000 randomly sampled dentists is evidence.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r) => {
        const n = pick(r, [400, 900, 1600, 2500]);
        return { prompt: `A properly randomized poll of ${n} people has margin of error roughly 1/√n. About what is it?`,
          value: `About ${Math.round(100 / Math.sqrt(n))}%`,
          options: [`About ${Math.round(100 / Math.sqrt(n))}%`, `About ${Math.round(1000 / Math.sqrt(n))}%`, 'About 0.1%', `Exactly 1/${n}`],
          correctOption: 'A',
          explanation: `1/√${n} = 1/${Math.sqrt(n)} ≈ ${Math.round(100 / Math.sqrt(n))}%. This quick estimate lets a reader sanity-check any reported margin — and notice that halving the margin requires QUADRUPLING the sample.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
