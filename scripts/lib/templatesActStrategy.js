'use strict';
/**
 * The four ACT test-taking STRATEGY skills — the only act-prep gaps left.
 *
 * These are genuinely new content, not crosswalkable: a backsolving item is
 * about the strategy, not the algebra it happens to touch. To keep them from
 * being contentless advice quizzes, every tier either (a) poses a real
 * problem the strategy applies to, with the strategy taught in the
 * explanation, or (b) asks a concrete decision question whose answer is the
 * canonical ACT tactic (test the middle choice first; the ACT has no
 * wrong-answer penalty, so never leave blanks). Answers are computed from the
 * drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '9-12';

const TEMPLATES = [
  {
    skillId: 'act-backsolving',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 2, 6), x0 = int(r, 3, 9), b = int(r, 1, 12);
          const rhs = a * x0 + b;
          const opts = [x0 - 2, x0 - 1, x0, x0 + 1].map(String);
          return { prompt: `Backsolve from the answer choices: if ${a}x + ${b} = ${rhs}, which value of x works?`,
            value: x0, options: opts, correctOption: 'ABCD'[opts.indexOf(String(x0))],
            explanation: `Test choices instead of solving: try x = ${x0}: ${a}(${x0}) + ${b} = ${a * x0} + ${b} = ${rhs} ✓. On the ACT, plugging each choice into the equation is often faster than algebra — and it checks your own work as you go.` };
        }
        return { prompt: 'ACT answer choices are listed in increasing order. When backsolving, which choice should you usually test FIRST?',
          value: 'The middle choice',
          options: ['The middle choice', 'The first choice', 'The last choice', 'Whichever looks most likely'],
          correctOption: 'A',
          explanation: 'Start in the middle: if the middle value comes out too small, everything smaller is out too — one test eliminates three choices. Starting at the ends can force you to test four choices instead of at most three.' };
      } },
      { difficulty: 3, gen: (r) => {
        const n0 = int(r, 4, 9);
        const v = n0 * (n0 - 1);
        const opts = [n0 - 1, n0, n0 + 1, n0 + 2].map(String);
        return { prompt: `Backsolve: which value of n satisfies n(n − 1) = ${v}?`,
          value: n0, options: opts, correctOption: 'ABCD'[opts.indexOf(String(n0))],
          explanation: `Testing beats expanding: n = ${n0} gives ${n0} · ${n0 - 1} = ${v} ✓. A quick sense-check narrows it first — n(n − 1) is a bit less than n², and ${n0}² = ${n0 * n0} sits just above ${v}, so ${n0} is the natural first test.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const m = pick(r, [8, 10, 12, 15, 20]);
        const small = made % 2 === 0;
        return { prompt: `You are backsolving an equation whose left side INCREASES as x increases. The choices are listed in increasing order and you test the middle one, x = ${m}. The result comes out too ${small ? 'SMALL' : 'LARGE'}. Which choices can you eliminate?`,
          value: small ? `${m} and every choice smaller` : `${m} and every choice larger`,
          options: [`${m} and every choice smaller`, `${m} and every choice larger`, `Only ${m}`, 'None until you test them all'],
          correctOption: small ? 'A' : 'B',
          explanation: small
            ? `The expression grows with x, and x = ${m} was not big enough — so every choice below ${m} lands even further short. Cross off ${m} and everything smaller, and test only the larger choices.`
            : `The expression grows with x, and x = ${m} already overshot — so every choice above ${m} overshoots by more. Cross off ${m} and everything larger, and test only the smaller choices.` };
      } },
    ],
  },

  {
    skillId: 'act-picking-numbers',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const [p, q] = pick(r, [[25, 40], [50, 30], [20, 50], [10, 60], [25, 80], [50, 44], [20, 35], [40, 45]]);
        const ans = (p * q) / 100;
        return { prompt: `${p}% of ${q}% of a number x is what percent of x?`,
          value: `${ans}%`,
          explanation: `Pick x = 100 — the classic move for percent problems. ${q}% of 100 is ${q}, and ${p}% of ${q} is ${ans}. So the chain takes 100 to ${ans}, which is ${ans}% of the original. (Multiplying the percents as decimals gives the same thing: ${p / 100} · ${q / 100} = ${ans / 100}.)` };
      } },
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'If n is an EVEN integer, which expression is always ODD?',
            value: 'n + 1',
            options: ['n + 1', 'n + 2', '2n', 'n²'],
            correctOption: 'A',
            explanation: 'Pick a number: n = 2. Then n + 1 = 3 (odd ✓), while n + 2 = 4, 2n = 4, and n² = 4 are all even. One concrete number settles an abstract question — the picking-numbers strategy.' };
        }
        return { prompt: 'If n is an ODD integer, which expression is always EVEN?',
          value: 'n + 1',
          options: ['n + 1', 'n + 2', '2n + 1', 'n²'],
          correctOption: 'A',
          explanation: 'Pick a number: n = 3. Then n + 1 = 4 (even ✓), while n + 2 = 5, 2n + 1 = 7, and n² = 9 are all odd. Testing one value each is faster and safer than reasoning abstractly under time pressure.' };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'Which expression equals (x + y)² for EVERY x and y? (Try picking numbers.)',
            value: 'x² + 2xy + y²',
            options: ['x² + 2xy + y²', 'x² + y²', 'x² − 2xy + y²', '2x + 2y'],
            correctOption: 'A',
            explanation: 'Pick x = 1, y = 2: (1 + 2)² = 9. Now test the choices: 1 + 4 + 4 = 9 ✓, while x² + y² = 5, x² − 2xy + y² = 1, and 2x + 2y = 6 all miss. One pair of numbers exposes the classic (x + y)² = x² + y² trap.' };
        }
        return { prompt: 'Which expression equals (x − y)² for EVERY x and y? (Try picking numbers.)',
          value: 'x² − 2xy + y²',
          options: ['x² − 2xy + y²', 'x² − y²', 'x² + y²', 'x² + 2xy + y²'],
          correctOption: 'A',
          explanation: 'Pick x = 3, y = 1: (3 − 1)² = 4. Test the choices: 9 − 6 + 1 = 4 ✓, while x² − y² = 8, x² + y² = 10, and x² + 2xy + y² = 16 all miss. Numbers catch what memory misstates.' };
      } },
    ],
  },

  {
    skillId: 'act-estimation-elimination',
    tiers: [
      { difficulty: 2, gen: (r) => {
        // A non-square n, asked to place √n between consecutive integers.
        const k = int(r, 3, 9);
        const n = k * k + int(r, 1, 2 * k - 1);
        return { prompt: `Without a calculator: √${n} is between which two consecutive integers?`,
          value: `${k} and ${k + 1}`,
          explanation: `Bracket with the nearest perfect squares: ${k}² = ${k * k} and ${k + 1}² = ${(k + 1) * (k + 1)}. Since ${k * k} < ${n} < ${(k + 1) * (k + 1)}, √${n} sits between ${k} and ${k + 1}. On the ACT, this placement alone usually eliminates every wrong choice.` };
      } },
      { difficulty: 3, gen: (r) => {
        const clean = pick(r, [200, 400, 600, 800]);
        const noisy = clean + pick(r, [-4, -3, 3, 6]);
        const [pctStr, f] = pick(r, [['24.8%', 0.25], ['49.6%', 0.5], ['9.9%', 0.1], ['74.8%', 0.75]]);
        const ans = clean * f;
        const opts = [ans, ans / 2, ans * 2, ans + clean].map(String);
        return { prompt: `Estimate without computing exactly: ${pctStr} of ${noisy} is closest to which value?`,
          value: ans, options: opts, correctOption: 'ABCD'[opts.indexOf(String(ans))],
          explanation: `Round both parts: ${pctStr} ≈ ${f * 100}% and ${noisy} ≈ ${clean}, so the answer is near ${f * 100}% of ${clean} = ${ans}. The choices are far apart, so a rough estimate picks the right one — exact arithmetic would waste ACT time.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const form = made % 3;
        if (form === 0) {
          const a = int(r, 3, 9), b = int(r, 11, 19);
          return { prompt: `(−${a}) × ${b}: before computing, which answer choices can you eliminate — the positive ones or the negative ones?`,
            value: 'The positive ones',
            options: ['The positive ones', 'The negative ones', 'None', 'All of them'],
            correctOption: 'A',
            explanation: `Negative times positive is always negative, so every positive choice is out before you multiply anything. (The value is −${a * b}.) Sign checks are the fastest elimination on the ACT.` };
        }
        if (form === 1) {
          const n = pick(r, [43, 57, 68, 82]);
          return { prompt: `0.9 × ${n} must be slightly ___ than ${n}.`,
            value: 'less',
            options: ['less', 'greater', 'about half', 'exactly equal'],
            correctOption: 'A',
            explanation: `Multiplying by a number just under 1 shrinks a value slightly: 0.9 × ${n} = ${(9 * n) / 10}, a bit less than ${n}. Recognizing "×0.9 means slightly less" eliminates most choices instantly.` };
        }
        const base = pick(r, [120, 160, 240, 280]);
        const half = base / 2;
        const opts = [half + 5, half - 20, base, half / 2].map(String);
        return { prompt: `13/25 is slightly more than 1/2. Which is the best estimate of 13/25 of ${base}?`,
          value: half + 5, options: opts, correctOption: 'ABCD'[opts.indexOf(String(half + 5))],
          explanation: `Half of ${base} is ${half}, and 13/25 is a little MORE than half, so the answer must sit just above ${half} — only ${half + 5} qualifies. (Exactly: 13/25 of ${base} = ${(13 * base) / 25}.) Compare to a friendly benchmark instead of computing.` };
      } },
    ],
  },

  {
    skillId: 'act-pacing-strategy',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'The ACT math section has 60 questions in 60 minutes. On average, how many minutes can you spend per question?',
            value: 1,
            explanation: '60 minutes ÷ 60 questions = 1 minute each. In practice, bank time on the early (easier) questions so the harder final third can get more than a minute.' };
        }
        const [k, s] = pick(r, [[20, 90], [10, 120], [15, 100], [30, 80], [12, 75]]);
        const left = 60 - (k * s) / 60;
        return { prompt: `On the 60-minute ACT math section, you spend ${s} seconds on each of the first ${k} questions. How many minutes remain for the other ${60 - k} questions?`,
          value: left,
          explanation: `${k} questions × ${s} seconds = ${k * s} seconds = ${(k * s) / 60} minutes used, leaving 60 − ${(k * s) / 60} = ${left} minutes for ${60 - k} questions — about ${Math.round((left / (60 - k)) * 60)} seconds each. Pacing math like this tells you when to speed up.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        const q = pick(r, [24, 30, 36, 42]);
        const ahead = made % 2 === 0;
        const t = ahead ? q - pick(r, [4, 5, 6]) : q + pick(r, [3, 4, 5]);
        const diff = Math.abs(q - t);
        return { prompt: `On the ACT math section (60 questions, 60 minutes — a 1-minute-per-question pace), you have finished ${q} questions after ${t} minutes. Are you ahead of pace or behind, and by how many minutes?`,
          value: ahead ? `Ahead by ${diff} minutes` : `Behind by ${diff} minutes`,
          options: [`Ahead by ${diff} minutes`, `Behind by ${diff} minutes`, 'Exactly on pace', `Ahead by ${diff + 2} minutes`],
          correctOption: ahead ? 'A' : 'B',
          explanation: `On pace, ${q} questions take ${q} minutes. You used ${t}, so you are ${ahead ? 'ahead' : 'behind'} by |${q} − ${t}| = ${diff} minutes. Check your pace at the 20- and 40-question marks — small corrections early beat a panic at question 55.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        const CASES = [
          { q: 'Question 15 has you stuck after a minute with no clear path. What is the best pacing move?',
            a: 'Mark it, skip it, and return after finishing the rest',
            opts: ['Mark it, skip it, and return after finishing the rest', 'Keep working until it cracks', 'Give up on it permanently and leave it blank', 'Start the whole section over'],
            e: 'A stuck minute spent on one question is a minute taken from several you could answer. Skip, mark, and return — later questions are worth exactly as many points, and the ACT lets you move freely within the section.' },
          { q: 'The ACT has NO penalty for wrong answers. With 30 seconds left and 3 questions unanswered, what should you do?',
            a: 'Bubble in a guess for all three',
            opts: ['Bubble in a guess for all three', 'Leave them blank', 'Answer only the one you can solve', 'Spend all 30 seconds on one question'],
            e: 'With no wrong-answer penalty, a blank scores 0 for certain while a guess scores with probability 1 in 4 (or better after eliminating). Never leave an ACT bubble empty.' },
          { q: 'You have spent 2 full minutes on one question and are still not close. What is the best move?',
            a: 'Pick your best guess, mark it, and move on',
            opts: ['Pick your best guess, mark it, and move on', 'Keep going — you have invested too much to stop', 'Erase your work and restart the problem', 'Skip it and leave it blank permanently'],
            e: 'Sunk time is not a reason to spend more (the sunk-cost trap). Two minutes is double the average pace — guess now (no penalty), mark it, and return only if time remains.' },
          { q: 'ACT math questions generally get harder as the section goes on. How should that shape your pacing?',
            a: 'Move quickly early to bank time for the later questions',
            opts: ['Move quickly early to bank time for the later questions', 'Spend extra time early to build confidence', 'Do the last 20 questions first', 'Spend exactly one minute on every question'],
            e: 'The early questions are designed to be faster — finishing them under pace banks minutes for the harder final stretch, where extra time actually converts to points. Rigid one-minute-each pacing wastes the difficulty curve.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
