'use strict';
/**
 * Consumer Math: the 26 cm-* financial-literacy skills with no bank family.
 * The three percent/rate skills (discounts, tax/tip/markup, unit price)
 * crosswalk to the percent and unit-rate banks instead — that arithmetic
 * already exists 350+ items deep.
 *
 * Money design rules: dollar amounts divide evenly wherever a student must
 * compute (paychecks split into whole biweekly amounts, annual costs are
 * multiples of 12, overtime wages are even so time-and-a-half stays whole),
 * interest uses single-digit percents of round principals, and compound
 * growth stays at 10% over short horizons so powers of 1.1 stay exact.
 * Concept skills (wants vs needs, credit scores, scam red flags) are MC with
 * canonical financial-literacy answers, cycled on the item index. Answers
 * are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = '9-12';

const TEMPLATES = [
  {
    skillId: 'cm-income-vocabulary',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Your pay BEFORE any deductions are taken out is called your ___ pay.',
            a: 'Gross', opts: ['Gross', 'Net', 'Taxable', 'Overtime'],
            e: 'Gross pay is the full amount you earned. Net pay — the "take-home" — is what remains after taxes and other deductions. Gross is always the bigger number.' },
          { q: 'The pay you actually take home after deductions is your ___ pay.',
            a: 'Net', opts: ['Net', 'Gross', 'Base', 'Bonus'],
            e: 'Net pay = gross pay − deductions. It is the number that actually lands in your bank account, and the one a realistic budget must be built on.' },
          { q: 'A fixed annual amount of pay, regardless of hours worked, is called a ___.',
            a: 'Salary', opts: ['Salary', 'Wage', 'Commission', 'Stipend'],
            e: 'A salary is quoted per year and does not change with hours. A wage is paid per hour, so a wage-earner\'s paycheck varies with time worked.' },
          { q: 'Pay earned as a percentage of the sales you make is called ___.',
            a: 'Commission', opts: ['Commission', 'Salary', 'Overtime', 'A deduction'],
            e: 'Commission ties pay to sales — common in retail and real estate. It can supplement a base wage or replace it entirely, which makes income less predictable.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r) => {
        const gross = int(r, 15, 30) * 100, ded = int(r, 3, 8) * 100;
        return { prompt: `Your monthly gross pay is $${gross} and total deductions are $${ded}. What is your net pay?`,
          value: gross - ded,
          explanation: `Net = gross − deductions: ${gross} − ${ded} = $${gross - ded}. Budgets built on the gross number overspend by exactly the deductions.` };
      } },
    ],
  },

  {
    skillId: 'cm-reading-pay-stubs',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const rate = int(r, 12, 24), hours = pick(r, [20, 25, 30, 40]);
        return { prompt: `A pay stub shows ${hours} hours worked at $${rate}/hour. What is the gross pay for the period?`,
          value: rate * hours,
          explanation: `Gross pay = rate × hours: ${rate} × ${hours} = $${rate * hours}. On a stub this line appears before any deductions — always check it against your own hours record.` };
      } },
      { difficulty: 3, gen: (r) => {
        const gross = int(r, 8, 20) * 100;
        const fed = gross / 10, fica = Math.round(gross * 0.08 / 4) * 4; // clean-ish
        const state = int(r, 2, 6) * 10;
        return { prompt: `A pay stub lists gross pay $${gross}, federal tax $${fed}, FICA $${fica}, and state tax $${state}. What is the net pay?`,
          value: gross - fed - fica - state,
          explanation: `Subtract every deduction from gross: ${gross} − ${fed} − ${fica} − ${state} = $${gross - fed - fica - state}. Reading a stub is one subtraction — the skill is knowing which lines are deductions.` };
      } },
    ],
  },

  {
    skillId: 'cm-banking-basics',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const bal = int(r, 15, 60) * 10, dep = int(r, 5, 20) * 10, wd = int(r, 3, 12) * 10;
          return { prompt: `Your account balance is $${bal}. You deposit $${dep} and later withdraw $${wd}. What is the new balance?`,
            value: bal + dep - wd,
            explanation: `Deposits add, withdrawals subtract: ${bal} + ${dep} − ${wd} = $${bal + dep - wd}. Tracking the running balance is how overdrafts are avoided.` };
        }
        const CASES = [
          { q: 'Which account is designed for everyday spending, with a debit card and frequent transactions?',
            a: 'Checking', opts: ['Checking', 'Savings', 'Certificate of deposit', 'Retirement'],
            e: 'Checking accounts are built for daily in-and-out money. Savings accounts pay more interest but limit or discourage frequent withdrawals.' },
          { q: 'Spending more than your account holds, triggering a bank fee, is called an ___.',
            a: 'Overdraft', opts: ['Overdraft', 'Audit', 'Interest charge', 'Endorsement'],
            e: 'An overdraft happens when a payment exceeds your balance; banks often charge $30+ per occurrence. One mistimed bill can cascade into several fees.' },
        ];
        const c = CASES[Math.floor(made / 2) % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r) => {
        const bal = int(r, 2, 8) * 100, rate = int(r, 2, 5);
        return { prompt: `A savings account holds $${bal} at ${rate}% simple annual interest. How much interest does it earn in one year?`,
          value: (bal * rate) / 100,
          explanation: `Interest = balance × rate: ${bal} × ${rate}% = $${(bal * rate) / 100}. Savings interest is the bank paying YOU — the same percent machinery as every other finance calculation.` };
      } },
    ],
  },

  {
    skillId: 'cm-wants-vs-needs',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const CASES = [
          { item: 'Rent for your apartment', a: 'Need', e: 'Housing is a need — you must pay it to live safely. Needs get budgeted first.' },
          { item: 'A streaming service subscription', a: 'Want', e: 'Entertainment subscriptions are wants — life continues without them. Wants are where a tight budget cuts first.' },
          { item: 'Groceries for the week', a: 'Need', e: 'Basic food is a need. (Restaurant meals, though — those slide toward wants.)' },
          { item: 'Concert tickets', a: 'Want', e: 'Fun, but optional — a want. The point is not "never buy wants"; it is knowing which is which when money is short.' },
          { item: 'Medicine your doctor prescribed', a: 'Need', e: 'Health essentials are needs — skipping them costs more later, in every sense.' },
          { item: 'The newest phone upgrade when yours works fine', a: 'Want', e: 'A working phone already covers the need; the upgrade is a want dressed up as one.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: `Classify this expense: ${c.item}.`,
          value: c.a, options: ['Need', 'Want'],
          correctOption: c.a === 'Need' ? 'A' : 'B', explanation: c.e };
      } },
      { difficulty: 2, gen: (r) => {
        const needs = int(r, 8, 14) * 100, wants = int(r, 2, 6) * 100;
        return { prompt: `A monthly budget lists $${needs} of needs and $${wants} of wants. If income drops and $${wants / 2} must be cut, which category absorbs the cut, and what is the new wants total?`,
          value: `Wants; $${wants - wants / 2}`,
          options: [`Wants; $${wants - wants / 2}`, `Needs; $${needs - wants / 2}`, 'Both equally', 'Neither — borrow instead'],
          correctOption: 'A',
          explanation: `Cuts come from wants first — needs keep you housed, fed and working. ${wants} − ${wants / 2} = $${wants / 2} of wants remain. Borrowing to protect wants is how debt spirals start.` };
      } },
    ],
  },

  {
    skillId: 'cm-budget-categories',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const income = int(r, 20, 40) * 100;
        return { prompt: `Using the 50/30/20 rule on a $${income} monthly income, how much goes to SAVINGS (the 20%)?`,
          value: income / 5,
          explanation: `50/30/20 splits income into needs/wants/savings. Savings = 20% of ${income} = $${income / 5}. (Needs get $${income / 2}, wants $${(income * 3) / 10}.) The rule is a starting point, not a law — but pay-yourself-first only works if savings has a number.` };
      } },
      { difficulty: 3, gen: (r) => {
        const income = int(r, 20, 36) * 100;
        const housing = income / 4, food = income / 10, transport = income / 20;
        return { prompt: `Monthly income is $${income}. The budget assigns housing $${housing}, food $${food}, and transportation $${transport}. How much income remains for everything else?`,
          value: income - housing - food - transport,
          explanation: `Subtract the assigned categories: ${income} − ${housing} − ${food} − ${transport} = $${income - housing - food - transport}. A budget is finished only when every dollar has a category — the leftover here still needs jobs (savings, utilities, fun).` };
      } },
    ],
  },

  {
    skillId: 'cm-cash-flow-tables',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const income = int(r, 18, 32) * 100, expenses = int(r, 12, 17) * 100;
        return { prompt: `A month's cash-flow table shows total income $${income} and total expenses $${expenses}. What is the net cash flow?`,
          value: income - expenses,
          explanation: `Net cash flow = income − expenses = ${income} − ${expenses} = $${income - expenses}. Positive means money left over to save; the table exists to make that one number visible.` };
      } },
      { difficulty: 3, gen: (r) => {
        const income = int(r, 16, 24) * 100, expenses = income + int(r, 1, 4) * 100;
        return { prompt: `A cash-flow table shows income $${income} and expenses $${expenses}. Is the cash flow positive or negative, and by how much?`,
          value: `Negative by $${expenses - income}`,
          options: [`Negative by $${expenses - income}`, `Positive by $${expenses - income}`, 'Exactly zero', `Negative by $${expenses}`],
          correctOption: 'A',
          explanation: `Expenses exceed income by ${expenses} − ${income} = $${expenses - income} — negative cash flow. A month like this is funded by savings or debt; the table shows the leak before the overdraft does.` };
      } },
    ],
  },

  {
    skillId: 'cm-irregular-expenses',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const annual = int(r, 2, 8) * 120;
        return { prompt: `Car insurance costs $${annual} once a year. How much should a monthly budget set aside for it?`,
          value: annual / 12,
          explanation: `Spread the annual bill across 12 months: ${annual} ÷ 12 = $${annual / 12} per month. Irregular expenses feel like emergencies only when they have no monthly line.` };
      } },
      { difficulty: 3, gen: (r) => {
        const semi = int(r, 2, 7) * 60;
        return { prompt: `A $${semi} insurance premium is due every 6 months, and a $${semi * 2} registration fee is due once a year. What total monthly set-aside covers both?`,
          value: semi / 6 + (semi * 2) / 12,
          explanation: `Monthly shares: ${semi} ÷ 6 = $${semi / 6} and ${semi * 2} ÷ 12 = $${(semi * 2) / 12}. Together: $${semi / 6 + (semi * 2) / 12} per month. Every irregular bill converts to a monthly rate — then the budget holds no surprises.` };
      } },
    ],
  },

  {
    skillId: 'cm-budget-tradeoffs',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const weekly = int(r, 5, 15);
        return { prompt: `Skipping a $${weekly}-per-week takeout habit saves how much over a full year (52 weeks)?`,
          value: weekly * 52,
          explanation: `${weekly} × 52 = $${weekly * 52} per year. Small recurring costs compound into large annual numbers — the ×52 (or ×12) reflex is the fastest budgeting skill there is.` };
      } },
      { difficulty: 3, gen: (r) => {
        const monthly = int(r, 3, 9) * 10, goal = monthly * pick(r, [6, 8, 10]);
        return { prompt: `You want a $${goal} bike. By cutting $${monthly}/month of spending, how many months until you can buy it?`,
          value: goal / monthly,
          explanation: `${goal} ÷ ${monthly} = ${goal / monthly} months. A trade-off has a timeline: naming the number of months makes "cut spending" a plan instead of a wish.` };
      } },
    ],
  },

  {
    skillId: 'cm-simple-interest',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const P = int(r, 2, 9) * 100, rate = int(r, 2, 8), t = int(r, 1, 4);
        return { prompt: `Find the simple interest on $${P} at ${rate}% per year for ${t} year${t > 1 ? 's' : ''}.`,
          value: (P * rate * t) / 100,
          explanation: `I = P × r × t = ${P} × ${rate}% × ${t} = $${(P * rate * t) / 100}. Simple interest charges on the original principal only — the same amount every year.` };
      } },
      { difficulty: 3, gen: (r) => {
        const P = int(r, 2, 8) * 500, rate = int(r, 2, 6), t = int(r, 2, 4);
        const I = (P * rate * t) / 100;
        return { prompt: `You borrow $${P} at ${rate}% simple interest for ${t} years. What TOTAL amount do you repay?`,
          value: P + I,
          explanation: `Interest: ${P} × ${rate}% × ${t} = $${I}. Total repayment = principal + interest = ${P} + ${I} = $${P + I}. The sticker price of a loan is never just the amount borrowed.` };
      } },
    ],
  },

  {
    skillId: 'cm-compound-interest',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const P = int(r, 1, 5) * 1000;
        return { prompt: `$${P} is invested at 10% compounded annually. What is the balance after 2 years?`,
          value: P * 1.21,
          explanation: `Year 1: ${P} × 1.10 = $${P * 1.1}. Year 2: ${P * 1.1} × 1.10 = $${P * 1.21}. The second year earns interest on the first year's interest — that extra $${P * 1.21 - P * 1.2} is compounding at work, and it snowballs with time.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const rate = pick(r, [4, 6, 8, 9, 12]);
          return { prompt: `Using the Rule of 72, about how many years does money take to DOUBLE at ${rate}% annual growth?`,
            value: 72 / rate,
            explanation: `Rule of 72: doubling time ≈ 72 ÷ rate = 72 ÷ ${rate} = ${72 / rate} years. It is an estimate, but a startlingly good one — and it makes the case for starting early better than any lecture.` };
        }
        const P = int(r, 1, 4) * 1000;
        return { prompt: `Compare: $${P} at 10% SIMPLE interest for 2 years vs 10% COMPOUND. How much MORE does compounding earn?`,
          value: P / 100,
          explanation: `Simple: ${P} + 2 × ${P / 10} = $${P + P / 5}. Compound: ${P} × 1.21 = $${P * 1.21}. Difference: $${P / 100} — interest earned on year one's interest. Small at 2 years; enormous at 30.` };
      } },
    ],
  },

  {
    skillId: 'cm-emergency-fund',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const monthly = int(r, 12, 28) * 100, months = pick(r, [3, 6]);
        return { prompt: `Your essential expenses are $${monthly}/month. How large is a ${months}-month emergency fund?`,
          value: monthly * months,
          explanation: `${months} × ${monthly} = $${monthly * months}. An emergency fund is measured in months of ESSENTIAL expenses (not income) — it buys time after a job loss or big repair without touching debt.` };
      } },
      { difficulty: 3, gen: (r) => {
        const target = int(r, 3, 6) * 600, monthly = pick(r, [100, 150, 200, 300]);
        const months = target / monthly;
        if (!Number.isInteger(months)) return { prompt: `Saving $150/month, how long to build a $${Math.round(target / 150) * 150} emergency fund?`, value: Math.round(target / 150), explanation: `Divide goal by monthly saving: $${Math.round(target / 150) * 150} ÷ 150 = ${Math.round(target / 150)} months.` };
        return { prompt: `You save $${monthly}/month toward a $${target} emergency fund. How many months until it is fully funded?`,
          value: months,
          explanation: `${target} ÷ ${monthly} = ${months} months. Automating that transfer on payday is what turns the plan into the fund.` };
      } },
    ],
  },

  {
    skillId: 'cm-opportunity-cost',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'The value of the NEXT-BEST alternative you give up when you make a choice is called ___.',
            value: 'Opportunity cost',
            options: ['Opportunity cost', 'Sunk cost', 'Fixed cost', 'Interest'],
            correctOption: 'A',
            explanation: 'Every choice spends more than money — it spends the alternative. Choosing the concert means NOT having those dollars (or that evening) for anything else; that forgone best option is the opportunity cost.' };
        }
        const hours = int(r, 3, 8), wage = int(r, 12, 18);
        return { prompt: `You skip a ${hours}-hour work shift (at $${wage}/hour) to attend a free festival. What is the opportunity cost in dollars?`,
          value: hours * wage,
          explanation: `The festival is free to enter but not free to attend: the forgone earnings are ${hours} × ${wage} = $${hours * wage}. Opportunity cost counts what you DIDN'T earn, not what you paid.` };
      } },
      { difficulty: 3, gen: (r) => {
        const P = int(r, 4, 12) * 100, rate = pick(r, [4, 5])
        return { prompt: `You spend $${P} of savings that was earning ${rate}% per year. What is the opportunity cost over one year (the interest forgone)?`,
          value: (P * rate) / 100,
          explanation: `The spent money would have earned ${P} × ${rate}% = $${(P * rate) / 100} in a year. Spending savings is never free even without fees — the forgone growth is the quiet cost.` };
      } },
    ],
  },

  {
    skillId: 'cm-credit-scores',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Credit scores in the most common (FICO) system range from ___.',
            a: '300 to 850', opts: ['300 to 850', '0 to 100', '1 to 1000', '500 to 5000'],
            e: 'FICO scores run 300-850. Roughly: 670+ is good, 740+ very good, 800+ exceptional. The number decides what borrowing costs you.' },
          { q: 'Which factor weighs MOST heavily in a credit score?',
            a: 'Payment history', opts: ['Payment history', 'Your income', 'Your age', 'Number of bank accounts'],
            e: 'Payment history (~35%) dominates — one habit, paying every bill on time, outweighs everything else. Income, notably, is not in the score at all.' },
          { q: 'A higher credit score generally gets you ___.',
            a: 'Lower interest rates on loans', opts: ['Lower interest rates on loans', 'Higher taxes', 'A higher salary', 'Free bank accounts'],
            e: 'Lenders price risk: a strong score can mean a rate several points lower on a car loan or mortgage — tens of thousands of dollars over a mortgage\'s life.' },
          { q: 'Keeping your credit card balance LOW relative to its limit helps the score factor called ___.',
            a: 'Credit utilization', opts: ['Credit utilization', 'Payment history', 'Credit age', 'Hard inquiries'],
            e: 'Utilization (~30% of the score) is balance ÷ limit. Staying under 30% — ideally under 10% — signals you are not stretched thin.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r) => {
        const limit = pick(r, [500, 1000, 2000, 4000]);
        const pct = pick(r, [10, 20, 25, 30]);
        return { prompt: `A card has a $${limit} limit and a $${(limit * pct) / 100} balance. What is the credit utilization percentage?`,
          value: `${pct}%`,
          explanation: `Utilization = balance ÷ limit = ${(limit * pct) / 100}/${limit} = ${pct}%. Below 30% is the standard guidance; the lower, the better for the score.` };
      } },
    ],
  },

  {
    skillId: 'cm-credit-card-math',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const bal = int(r, 4, 12) * 100, mrate = pick(r, [1, 2]);
        return { prompt: `A credit card carries a $${bal} balance at ${mrate}% interest per MONTH. How much interest accrues in one month?`,
          value: (bal * mrate) / 100,
          explanation: `${bal} × ${mrate}% = $${(bal * mrate) / 100} — every month the balance sits there. A ${mrate}% monthly rate is roughly ${12 * mrate}% APR; card debt grows fast precisely because the compounding period is short.` };
      } },
      { difficulty: 4, gen: (r) => {
        const bal = int(r, 5, 10) * 100, pay = pick(r, [25, 50]);
        const interest = bal / 50; // 2% monthly
        return { prompt: `A $${bal} card balance accrues $${interest} interest this month, and you pay only $${pay}. By how much does the BALANCE actually drop?`,
          value: pay - interest,
          explanation: `The payment first covers the $${interest} interest; only ${pay} − ${interest} = $${pay - interest} touches the balance. Minimum payments feel like progress while barely denting the debt — this arithmetic is the trap.` };
      } },
    ],
  },

  {
    skillId: 'cm-loan-basics',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const monthly = int(r, 15, 40) * 10, months = pick(r, [24, 36, 48]);
        return { prompt: `A car loan requires $${monthly}/month for ${months} months. What TOTAL amount will you pay?`,
          value: monthly * months,
          explanation: `${monthly} × ${months} = $${monthly * months}. The monthly payment is what fits the budget; the total is what the car actually costs you — always compute both.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        // Terms must stay PLAUSIBLE — an independent draw once produced $10,880
        // of interest on a $4,000 loan, which teaches a wrong sense of scale.
        // Fix the total at 20% over principal (5%/yr on 4 years, 10%/yr on 2),
        // so the monthly divides evenly and the interest reads like a real loan.
        const principal = int(r, 20, 45) * 400;
        const [years, rate] = made % 2 === 0 ? [4, 5] : [2, 10];
        const months = years * 12;
        const total = principal * 1.2;
        const monthly = total / months;
        return { prompt: `You borrow $${principal} at ${rate}% simple interest per year and repay $${monthly}/month for ${months} months. How much INTEREST do you pay over the life of the loan?`,
          value: total - principal,
          explanation: `Total repaid: ${monthly} × ${months} = $${total}. Interest = ${total} − ${principal} = $${total - principal} — which checks against I = P·r·t = ${principal} × ${rate}% × ${years}. The interest total is the number to compare across loan offers.` };
      } },
    ],
  },

  {
    skillId: 'cm-amortization',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'Early in a mortgage, most of each monthly payment goes toward ___.',
            value: 'Interest',
            options: ['Interest', 'Principal', 'Property tax', 'The down payment'],
            correctOption: 'A',
            explanation: 'Interest is charged on the outstanding balance, which is largest at the start — so early payments are mostly interest, and equity builds slowly. The split flips in the loan\'s later years. That is amortization.' };
        }
        const bal = int(r, 10, 30) * 1000;
        const interest = bal / 200, payment = interest + int(r, 1, 4) * 50;
        return { prompt: `This month's loan payment is $${payment}, of which $${interest} is interest. How much does the loan BALANCE decrease?`,
          value: payment - interest,
          explanation: `Only the part beyond interest reduces the balance: ${payment} − ${interest} = $${payment - interest}. An amortization table is just this subtraction repeated month after month.` };
      } },
      { difficulty: 4, gen: (r) => {
        const bal = int(r, 4, 9) * 1000, interest = bal / 100, payment = interest + 100;
        return { prompt: `A loan balance is $${bal}. This month: payment $${payment}, interest $${interest}. What is the balance AFTER the payment?`,
          value: bal - (payment - interest),
          explanation: `Principal paid: ${payment} − ${interest} = $${payment - interest}. New balance: ${bal} − ${payment - interest} = $${bal - (payment - interest)}. Next month's interest is computed on this smaller balance — the slow-then-fast melt of amortization.` };
      } },
    ],
  },

  {
    skillId: 'cm-predatory-lending',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'A payday loan charges $15 per $100 borrowed for a two-week term. Roughly what APR is that?',
            a: 'About 390%', opts: ['About 390%', 'About 15%', 'About 30%', 'About 3.9%'],
            e: '15% per two weeks × 26 two-week periods ≈ 390% APR. The "small fee" framing hides an interest rate more than ten times a bad credit card — the defining move of predatory lending.' },
          { q: 'Which is a red flag for a predatory loan?',
            a: 'Pressure to sign today, before reading the terms', opts: ['Pressure to sign today, before reading the terms', 'A clearly stated APR', 'A no-penalty early payoff option', 'A licensed, reviewable lender'],
            e: 'Urgency exists to prevent comparison shopping. Legitimate lenders state the APR plainly and survive a day of reflection; predatory ones need you not to do the math.' },
          { q: 'Rolling over a payday loan you cannot repay typically ___.',
            a: 'Adds new fees on top of the old ones', opts: ['Adds new fees on top of the old ones', 'Reduces the total owed', 'Improves your credit score', 'Freezes the interest'],
            e: 'Each rollover charges the fee again while the principal stays. Borrowers commonly pay more in fees than the original loan — the product is designed for exactly that cycle.' },
          { q: 'The single best defense before taking ANY loan is to ___.',
            a: 'Compare the APR against other options', opts: ['Compare the APR against other options', 'Ask the lender if the deal is good', 'Check the monthly payment only', 'Sign quickly before rates change'],
            e: 'APR is the one number that makes different loans comparable. A lender is not the person to ask whether their own deal is fair — the APR comparison is.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r) => {
        const loan = int(r, 2, 6) * 100;
        const fee = (loan * 15) / 100;
        return { prompt: `A payday lender charges $15 per $100 for two weeks. On a $${loan} loan, what is the fee — and if rolled over 3 more times, what are the total fees?`,
          value: `$${fee} fee; $${fee * 4} total`,
          options: [`$${fee} fee; $${fee * 4} total`, `$${fee} fee; $${fee} total`, `$15 fee; $60 total`, `$${fee} fee; $${fee * 3} total`],
          correctOption: 'A',
          explanation: `Fee: ${loan / 100} × $15 = $${fee} per period. Four periods (original + 3 rollovers): $${fee * 4} in fees on a $${loan} loan — ${Math.round((fee * 4 / loan) * 100)}% of the principal in just 8 weeks, with the debt still unpaid.` };
      } },
    ],
  },

  {
    skillId: 'cm-pay-structures',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          // Salary must divide by 26 exactly, or the per-check amount is an
          // unending decimal no student can type.
          const salary = int(r, 6, 10) * 5200;
          return { prompt: `A $${salary} annual salary is paid in 26 biweekly checks. What is the GROSS amount of each check?`,
            value: salary / 26,
            explanation: `${salary} ÷ 26 = $${salary / 26} per check, before deductions. Knowing the per-check number is what lets a salary map onto a monthly budget.` };
        }
        const rate = int(r, 12, 22), hours = pick(r, [35, 40]);
        return { prompt: `An hourly worker earns $${rate}/hour for a ${hours}-hour week. What is the weekly gross pay?`,
          value: rate * hours,
          explanation: `${rate} × ${hours} = $${rate * hours} per week. Hourly pay scales with time worked — steadier hours mean steadier checks.` };
      } },
      { difficulty: 3, gen: (r) => {
        const sales = int(r, 2, 9) * 1000, pct = pick(r, [5, 10]);
        const base = int(r, 2, 5) * 100;
        return { prompt: `A salesperson earns a $${base} weekly base plus ${pct}% commission on sales. With $${sales} in sales this week, what is the total gross pay?`,
          value: base + (sales * pct) / 100,
          explanation: `Commission: ${sales} × ${pct}% = $${(sales * pct) / 100}. Total: ${base} + ${(sales * pct) / 100} = $${base + (sales * pct) / 100}. Base + commission blends stability with upside — but budgets should lean on the base.` };
      } },
    ],
  },

  {
    skillId: 'cm-overtime-timesheets',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const wage = int(r, 6, 12) * 2, ot = int(r, 2, 8);
        return { prompt: `You earn $${wage}/hour, and overtime pays time-and-a-half. What is your overtime HOURLY rate?`,
          value: wage * 1.5,
          explanation: `Time-and-a-half: ${wage} × 1.5 = $${wage * 1.5}/hour${ot ? '' : ''}. Every overtime hour pays half again the normal rate — which is also why employers watch the 40-hour line.` };
      } },
      { difficulty: 3, gen: (r) => {
        const wage = int(r, 6, 11) * 2, hours = 40 + int(r, 2, 8);
        const otHours = hours - 40;
        const pay = 40 * wage + otHours * wage * 1.5;
        return { prompt: `A timesheet shows ${hours} hours at $${wage}/hour, with hours past 40 at time-and-a-half. What is the gross pay?`,
          value: pay,
          explanation: `Regular: 40 × ${wage} = $${40 * wage}. Overtime: ${otHours} × $${wage * 1.5} = $${otHours * wage * 1.5}. Total: $${pay}. Split the hours FIRST — applying one rate to all ${hours} hours is the classic timesheet error.` };
      } },
    ],
  },

  {
    skillId: 'cm-tax-basics',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const price = int(r, 5, 30) * 10, rate = pick(r, [5, 6, 8, 10]);
          return { prompt: `An item costs $${price} and sales tax is ${rate}%. What is the TOTAL at the register?`,
            value: price + (price * rate) / 100,
            explanation: `Tax: ${price} × ${rate}% = $${(price * rate) / 100}. Total: ${price} + ${(price * rate) / 100} = $${price + (price * rate) / 100}. Or in one step: ${price} × ${(100 + rate) / 100}.` };
        }
        return { prompt: 'The form an employer sends each year summarizing your pay and the tax already withheld is the ___.',
          value: 'W-2',
          options: ['W-2', 'W-4', '1099', 'I-9'],
          correctOption: 'A',
          explanation: 'The W-2 reports the year\'s wages and withholding — it is the document a tax return is built from. (The W-4 is what YOU file to set withholding; a 1099 covers non-employee income.)' };
      } },
      { difficulty: 3, gen: (r) => {
        const income = int(r, 20, 45) * 1000, rate = pick(r, [10, 12]);
        return { prompt: `For a simplified flat tax of ${rate}% on a $${income} income, how much tax is owed?`,
          value: (income * rate) / 100,
          explanation: `${income} × ${rate}% = $${(income * rate) / 100}. (Real income tax uses brackets — only the income INSIDE each bracket is taxed at that bracket's rate — but the percent machinery is exactly this.)` };
      } },
    ],
  },

  {
    skillId: 'cm-benefits-comparison',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const salary = int(r, 30, 50) * 1000, benefits = int(r, 3, 8) * 1000;
        return { prompt: `Job A pays a $${salary} salary plus benefits worth $${benefits}/year. What is the total annual compensation?`,
          value: salary + benefits,
          explanation: `Total compensation = salary + benefits value = ${salary} + ${benefits} = $${salary + benefits}. Health coverage, retirement match and paid leave are real money — comparing salaries alone compares the wrong number.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        // Alternate which job the benefits favour — with a fixed shape, Job A
        // won every draw, and "always pick the big-benefits job" is a pattern,
        // not a comparison.
        const a = int(r, 36, 46) * 1000;
        const big = int(r, 6, 9) * 1000, small = int(r, 1, 3) * 1000;
        const gap = int(r, 2, 4) * 1000;
        const b = a + gap;
        const aBen = made % 2 === 0 ? big : small;
        const bBen = made % 2 === 0 ? small : big;
        const totalA = a + aBen, totalB = b + bBen;
        if (totalA === totalB) { return { prompt: `Job A: $${a} salary + $${aBen + 1000} benefits. Job B: $${b} salary + $${bBen} benefits. Which job's TOTAL compensation is higher, and by how much?`, value: `Job A, by $${totalA + 1000 - totalB}`, options: [`Job A, by $${totalA + 1000 - totalB}`, `Job B, by $${totalA + 1000 - totalB}`, 'They are equal', `Job B, by $${gap}`], correctOption: 'A', explanation: `Totals: A = ${a} + ${aBen + 1000} = $${totalA + 1000}; B = ${b} + ${bBen} = $${totalB}. Job A leads by $${totalA + 1000 - totalB}.` }; }
        const winner = totalA >= totalB ? 'A' : 'B';
        return { prompt: `Job A: $${a} salary + $${aBen} benefits. Job B: $${b} salary + $${bBen} benefits. Which job's TOTAL compensation is higher, and by how much?`,
          value: `Job ${winner}, by $${Math.abs(totalA - totalB)}`,
          options: [`Job ${winner}, by $${Math.abs(totalA - totalB)}`, `Job ${winner === 'A' ? 'B' : 'A'}, by $${Math.abs(totalA - totalB)}`, 'They are equal', `Job B, by $${b - a}`],
          correctOption: 'A',
          explanation: `Totals: A = ${a} + ${aBen} = $${totalA}; B = ${b} + ${bBen} = $${totalB}. Job ${winner} leads by $${Math.abs(totalA - totalB)}. The higher SALARY ${winner === 'A' ? 'was not' : 'was'} the higher OFFER — benefits moved the answer.` };
      } },
    ],
  },

  {
    skillId: 'cm-why-investing',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'Why does money sitting in cash LOSE value over time?',
            a: 'Inflation raises prices while the cash stays the same', opts: ['Inflation raises prices while the cash stays the same', 'Banks confiscate idle cash', 'Cash physically wears out', 'It does not — cash is risk-free'],
            e: 'At 3% inflation, prices double roughly every 24 years — cash that "did nothing wrong" buys half as much. Investing exists to outpace that quiet erosion.' },
          { q: 'Historically, which grows savings FASTEST over decades?',
            a: 'Broad stock-market investments', opts: ['Broad stock-market investments', 'A checking account', 'Cash under a mattress', 'Lottery tickets'],
            e: 'Diversified stocks have averaged ~7-10% annually over long periods — far above savings rates. The price is short-term ups and downs, which is why the horizon matters.' },
          { q: 'The trade-off at the heart of investing is ___.',
            a: 'Higher potential return comes with higher risk', opts: ['Higher potential return comes with higher risk', 'Risk and return are unrelated', 'Safe investments earn the most', 'Only the wealthy can invest'],
            e: 'No one pays you extra returns for free — the premium compensates for bearing swings and possible losses. Matching risk to your timeline is the actual skill.' },
          { q: 'Why is STARTING EARLY the biggest advantage in investing?',
            a: 'Compounding has more years to work', opts: ['Compounding has more years to work', 'Young people get better interest rates', 'Markets only rise early in life', 'Fees are waived for beginners'],
            e: 'Ten extra years of compounding can matter more than doubling the contribution. Growth on growth is exponential — time is the input it feeds on.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r) => {
        const P = int(r, 1, 4) * 1000;
        return { prompt: `At 3% inflation, prices roughly double in 24 years. About how much will $${P} of today's goods cost in 24 years?`,
          value: 2 * P,
          explanation: `Doubling means $${P} of goods will run about $${2 * P}. Money that has not at least doubled in that span has lost ground — the case for investing in one sentence.` };
      } },
    ],
  },

  {
    skillId: 'cm-investment-types',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        const CASES = [
          { q: 'Buying a share of STOCK means you own ___.',
            a: 'A small piece of the company', opts: ['A small piece of the company', 'A loan the company must repay you', 'A government bond', 'Insurance on the company'],
            e: 'Stock is ownership: the share\'s value rises and falls with the company. That is why stocks carry both the growth and the risk.' },
          { q: 'A BOND is essentially ___.',
            a: 'A loan you make that pays you interest', opts: ['A loan you make that pays you interest', 'Ownership in a company', 'A savings account', 'A type of stock'],
            e: 'A bond flips the usual roles: you are the lender, and the company or government pays you back with interest. Steadier than stock, with less upside.' },
          { q: 'A MUTUAL FUND or INDEX FUND lets an investor ___.',
            a: 'Own many investments in a single purchase', opts: ['Own many investments in a single purchase', 'Avoid all risk', 'Guarantee a fixed return', 'Borrow against the market'],
            e: 'A fund pools money and buys dozens to thousands of holdings, so one purchase diversifies instantly. Index funds do this at very low cost by tracking a whole market.' },
          { q: 'Spreading money across many different investments is called ___.',
            a: 'Diversification', opts: ['Diversification', 'Speculation', 'Amortization', 'Liquidation'],
            e: 'Diversification means no single failure can sink you — the one "free lunch" in investing, since it lowers risk without lowering expected return.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 4, gen: (r) => {
        const shares = int(r, 3, 12) * 5, price = int(r, 8, 30);
        return { prompt: `You buy ${shares} shares of a stock at $${price} per share. What is the total cost of the investment (ignoring fees)?`,
          value: shares * price,
          explanation: `${shares} × ${price} = $${shares * price}. Position size = shares × price — the arithmetic behind every brokerage screen.` };
      } },
    ],
  },

  {
    skillId: 'cm-retirement-accounts',
    tiers: [
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          return { prompt: 'An employer "401(k) match" means the employer ___.',
            value: 'Adds money when you contribute — effectively free pay',
            options: ['Adds money when you contribute — effectively free pay', 'Doubles your salary', 'Pays your taxes', 'Guarantees investment returns'],
            correctOption: 'A',
            explanation: 'A match (say, 50% of what you put in, up to a limit) is compensation you only receive if you contribute. Skipping the match is declining part of your pay.' };
        }
        return { prompt: 'The key difference between a TRADITIONAL and a ROTH retirement account is ___.',
          value: 'When you pay the taxes — later vs now',
          options: ['When you pay the taxes — later vs now', 'Roth accounts hold only stocks', 'Traditional accounts have no limits', 'Roth accounts are employer-only'],
          correctOption: 'A',
          explanation: 'Traditional: contribute pre-tax, pay tax on withdrawal. Roth: contribute after-tax, withdraw tax-free. Same engine, different tax timing — the choice hinges on your tax rate now vs in retirement.' };
      } },
      { difficulty: 4, gen: (r) => {
        const salary = int(r, 30, 50) * 1000, pct = pick(r, [4, 6]);
        const contrib = (salary * pct) / 100;
        return { prompt: `You contribute ${pct}% of a $${salary} salary to a 401(k), and your employer matches 50% of your contribution. What TOTAL lands in the account this year?`,
          value: contrib + contrib / 2,
          explanation: `Your part: ${salary} × ${pct}% = $${contrib}. Match: half of that, $${contrib / 2}. Total: $${contrib + contrib / 2} — an instant 50% return before any market growth. This is why "contribute at least to the match" is rule one.` };
      } },
    ],
  },

  {
    skillId: 'cm-compound-growth',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const P = int(r, 1, 5) * 1000;
        return { prompt: `$${P} grows at 10% per year. What is it worth after 2 years of compounding?`,
          value: P * 1.21,
          explanation: `Two years of ×1.10: ${P} → ${P * 1.1} → $${P * 1.21}. Growth acts on the GROWN amount — the gap between ×1.21 and the ×1.20 of simple growth is small now and enormous over decades.` };
      } },
      { difficulty: 4, gen: (r, made) => {
        if (made % 2 === 0) {
          const rate = pick(r, [6, 8, 9, 12]);
          const dbl = 72 / rate;
          return { prompt: `At ${rate}% annual growth (Rule of 72), an investment doubles about every ${dbl} years. Starting with $1000, about how much after ${2 * dbl} years?`,
            value: 4000,
            explanation: `${2 * dbl} years is two doubling periods: 1000 → 2000 → $4000. Doublings STACK — a third period would make $8000. Time in the market compounds multiplicatively, not additively.` };
        }
        const monthly = pick(r, [50, 100, 200]);
        return { prompt: `Saving $${monthly}/month, how much is CONTRIBUTED (before any growth) over 30 years?`,
          value: monthly * 360,
          explanation: `${monthly} × 12 × 30 = $${monthly * 360} contributed. With ~8% growth the balance would be several times that — the difference between the two numbers is what compounding adds, and why starting beats waiting.` };
      } },
    ],
  },

  {
    skillId: 'cm-scam-detection',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        const CASES = [
          { q: 'An investment promises "guaranteed 20% returns with zero risk." What does this tell you?',
            a: 'It is almost certainly a scam', opts: ['It is almost certainly a scam', 'It is a great opportunity', 'It is a normal bank product', 'Returns that high are standard'],
            e: 'Guaranteed + high return + no risk is a combination that does not exist in real finance — risk and return travel together. The promise itself is the tell.' },
          { q: 'A caller says you owe money and must pay RIGHT NOW with gift cards. What is the red flag?',
            a: 'No legitimate organization demands gift-card payment', opts: ['No legitimate organization demands gift-card payment', 'The call came in the evening', 'They knew your name', 'Gift cards are hard to buy'],
            e: 'Gift cards are untraceable and irreversible — exactly why scammers demand them and real institutions never do. Urgency + untraceable payment = scam, every time.' },
          { q: 'A stranger online offers to multiply any money you send them. This is the classic shape of ___.',
            a: 'An advance-fee / Ponzi-style scam', opts: ['An advance-fee / Ponzi-style scam', 'A normal investment account', 'Peer-to-peer banking', 'A referral bonus'],
            e: 'Send-money-to-get-money schemes pay early victims with later victims\' cash until they vanish. Money you transfer to a stranger\'s control is money gone.' },
          { q: 'Before acting on ANY urgent money request, the safest move is to ___.',
            a: 'Stop, verify through an independent official channel', opts: ['Stop, verify through an independent official channel', 'Pay a small amount to test it', 'Reply asking if it is a scam', 'Forward it to friends'],
            e: 'Contact the organization through a number or site YOU find — never one the message supplies. Scams need speed; verification kills them.' },
        ];
        const c = CASES[made % CASES.length];
        return { prompt: c.q, value: c.a, options: c.opts,
          correctOption: 'ABCD'[c.opts.indexOf(c.a)], explanation: c.e };
      } },
      { difficulty: 3, gen: (r, made) => {
        const P = int(r, 2, 8) * 100;
        if (made % 2 === 0) {
          return { prompt: `A scheme promises to double your $${P} in a week. An honest 8%-per-year investment would earn how many DOLLARS on $${P} in a whole year?`,
            value: (P * 8) / 100,
            explanation: `8% of ${P} is $${(P * 8) / 100} — over a full year. The scheme claims $${P} of profit in one week. Holding the two numbers side by side is the fastest scam test there is: nothing legitimate is hundreds of times the market.` };
        }
        return { prompt: `A "guaranteed 2% per DAY" offer compounds to roughly 137,000% per year. What is the honest response to the $${P} minimum buy-in?`,
          value: 'Walk away — no real investment sustains that rate',
          options: ['Walk away — no real investment sustains that rate', `Invest the $${P} minimum to test it`, 'Negotiate a higher rate', 'Invest, but withdraw after one week'],
          correctOption: 'A',
          explanation: `Real markets average ~8% per YEAR; 2% per day is thousands of times that. "Test it with a little" is exactly how these schemes harvest — early "returns" are paid from new victims until withdrawals freeze. The only winning move is not to send the $${P}.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };
