/**
 * Consumer Math at-level items — every answer RE-SOLVED from the printed
 * question.
 *
 * Nothing here calls the templates' own maths. Each rule below recognises one
 * printed question, pulls the prices and percents out of its text, and works
 * the answer in whole cents with the consumer-math rule typed by hand. A rule
 * that lands on a fraction of a cent fails: every item must come out exact.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelConsumerMath');

// ── reading what is printed ──────────────────────────────────────────────

const M = '\\$(\\d+(?:\\.\\d\\d)?)';                       // a printed price
const rx = (src) => new RegExp(src.replace(/\$M/g, M));
const cents = (s) => {
  const m = String(s).match(/^(\d+)(?:\.(\d\d))?$/);
  if (!m) throw new Error(`not a price: ${s}`);
  return Number(m[1]) * 100 + Number(m[2] || 0);
};
const exact = (x) => {
  if (!Number.isInteger(x)) throw new Error(`not a whole number: ${x}`);
  return x;
};
const pctOf = (amount, p) => exact(amount * p / 100);
const dollars = (c) => String(exact(c) / 100);            // how a typed key is written
const price = (c) => `$${(exact(c) / 100).toFixed(2)}`;   // how an option is written

// ── the rules, typed by hand ─────────────────────────────────────────────

const RULES = {
  'cm-discounts-coupons': [
    [rx('regularly costs $M\\. It is on sale for (\\d+)% off\\. What is the sale price, in dollars\\?$'),
      (m) => dollars(cents(m[1]) - pctOf(cents(m[1]), m[2]))],
    [rx('regularly costs $M\\. A coupon takes (\\d+)% off\\. How many dollars does the coupon save\\?$'),
      (m) => dollars(pctOf(cents(m[1]), m[2]))],
    [rx('regularly costs $M\\. It is on sale for $M\\. What is the percent discount\\?'),
      (m) => String(exact((cents(m[1]) - cents(m[2])) * 100 / cents(m[1])))],
    [rx('^A store takes (\\d+)% off everything\\. What do you pay for a .+ marked $M, in dollars\\?'),
      (m) => dollars(cents(m[2]) - pctOf(cents(m[2]), m[1]))],
    [rx('regularly costs $M\\. It is on sale for (\\d+)% off, and a coupon takes an extra (\\d+)% off the sale price\\. What is the final price\\?$'),
      (m) => { const sale = cents(m[1]) - pctOf(cents(m[1]), m[2]); return price(sale - pctOf(sale, m[3])); }],
    [rx('^After a (\\d+)% discount, a .+ costs $M\\. What was the original price, in dollars\\?$'),
      (m) => {
        const orig = exact(cents(m[2]) * 100 / (100 - m[1]));
        expect(orig - pctOf(orig, m[1])).toBe(cents(m[2]));          // forward check
        return dollars(orig);
      }],
    [rx('costs $M\\. Coupon A takes (\\d+)% off\\. Coupon B takes $M off\\. You may use only one\\. Which coupon saves more, and how much more\\?$'),
      (m) => {
        const a = pctOf(cents(m[1]), m[2]);
        const b = cents(m[3]);
        expect(a).not.toBe(b);
        return `Coupon ${a > b ? 'A' : 'B'} saves ${price(Math.abs(a - b))} more`;
      }],
    [rx('^A store takes (\\d+)% off a price, then takes an extra (\\d+)% off the sale price\\. This is the same as what single percent discount\\?'),
      (m) => { const sale = 10000 - pctOf(10000, m[1]); return String(exact((10000 - (sale - pctOf(sale, m[2]))) / 100)); }],
    [rx('is marked (\\d+)% off, and a coupon takes an extra (\\d+)% off the sale price\\. The final price is $M\\. What was the original price, in dollars\\?$'),
      (m) => {
        const orig = exact(cents(m[3]) * 10000 / ((100 - m[1]) * (100 - m[2])));
        const sale = orig - pctOf(orig, m[1]);
        expect(sale - pctOf(sale, m[2])).toBe(cents(m[3]));          // forward check
        return dollars(orig);
      }],
    [rx('^Coupon A takes (\\d+)% off your purchase\\. Coupon B takes $M off\\. For what purchase price do the two coupons save exactly the same amount, in dollars\\?'),
      (m) => { const p = exact(cents(m[2]) * 100 / m[1]); expect(pctOf(p, m[1])).toBe(cents(m[2])); return dollars(p); }],
    [rx('costs $M\\. You have a (\\d+)%-off coupon and a $M-off coupon, and the store lets you use both\\. The store applies the (\\d+)% coupon first and then takes off the $M\\. What is the final price\\?$'),
      (m) => {
        expect(m[4]).toBe(m[2]);
        expect(m[5]).toBe(m[3]);
        return price(cents(m[1]) - pctOf(cents(m[1]), m[2]) - cents(m[3]));
      }],
  ],

  'cm-tax-tip-markup': [
    [rx('for $M\\. The sales tax rate is (\\d+)%\\. How much sales tax do you pay, in dollars\\?'),
      (m) => dollars(pctOf(cents(m[1]), m[2]))],
    [rx('costs $M before tax\\. The sales tax rate is (\\d+)%\\. What is the total cost with tax, in dollars\\?'),
      (m) => dollars(cents(m[1]) + pctOf(cents(m[1]), m[2]))],
    [rx('^A restaurant bill is $M\\. You leave an? (\\d+)% tip\\. How much is the tip, in dollars\\?$'),
      (m) => dollars(pctOf(cents(m[1]), m[2]))],
    [rx('^A store buys a .+ for $M and marks it up (\\d+)%\\. What is the store\'s selling price, in dollars\\?$'),
      (m) => dollars(cents(m[1]) + pctOf(cents(m[1]), m[2]))],
    [rx('^A meal costs $M before tax\\. The sales tax rate is (\\d+)%, and you leave an? (\\d+)% tip on the pre-tax amount\\. What is the total cost\\?$'),
      (m) => price(cents(m[1]) + pctOf(cents(m[1]), m[2]) + pctOf(cents(m[1]), m[3]))],
    [rx('is priced at $M\\. With sales tax, the total is $M\\. What is the sales tax rate\\?'),
      (m) => String(exact((cents(m[2]) - cents(m[1])) * 100 / cents(m[1])))],
    [rx('^A store buys a .+ for $M and sells it for $M\\. What is the markup as a percent of the store\'s cost\\?'),
      (m) => String(exact((cents(m[2]) - cents(m[1])) * 100 / cents(m[1])))],
    [rx('^(\\d+) friends share a restaurant bill of $M\\. They add an? (\\d+)% tip and split the total equally\\. How much does each friend pay, in dollars\\?$'),
      (m) => dollars((cents(m[2]) + pctOf(cents(m[2]), m[3])) / m[1])],
    [rx('^A store buys a (.+) for $M\\. It marks the price up (\\d+)%, and later puts the (.+) on sale for (\\d+)% off the marked price\\. What is the sale price\\?$'),
      (m) => {
        expect(m[4]).toBe(m[1]);
        const marked = cents(m[2]) + pctOf(cents(m[2]), m[3]);
        return price(marked - pctOf(marked, m[5]));
      }],
    [rx('^A store buys a .+ for $M, marks it up (\\d+)%, and then sells it at (\\d+)% off the marked price\\. How much profit does the store make on it, in dollars\\?'),
      (m) => {
        const marked = cents(m[1]) + pctOf(cents(m[1]), m[2]);
        const profit = marked - pctOf(marked, m[3]) - cents(m[1]);
        expect(profit).toBeGreaterThan(0);
        return dollars(profit);
      }],
    [rx('^The total for a .+, including (\\d+)% sales tax, is $M\\. What was the price before tax, in dollars\\?$'),
      (m) => {
        const before = exact(cents(m[2]) * 100 / (100 + Number(m[1])));
        expect(before + pctOf(before, m[1])).toBe(cents(m[2]));      // forward check
        return dollars(before);
      }],
    [rx('^(\\d+) friends have a meal that costs $M before tax\\. Sales tax is (\\d+)%, and they leave an? (\\d+)% tip on the pre-tax amount\\. They split the total equally\\. How much does each friend pay, in dollars\\?'),
      (m) => dollars((cents(m[2]) + pctOf(cents(m[2]), m[3]) + pctOf(cents(m[2]), m[4])) / m[1])],
  ],

  'cm-unit-price-comparisons': [
    [rx('^A (\\d+)-ounce .+ costs $M\\. What is the unit price, in dollars per ounce\\?'),
      (m) => dollars(cents(m[2]) / m[1])],
    [rx('^A pack of (\\d+) .+ costs $M\\. What is the unit price, in dollars per \\w+\\?'),
      (m) => dollars(cents(m[2]) / m[1])],
    [rx('^A (\\d+)-ounce (.+) costs $M\\. A (\\d+)-ounce (.+) costs $M\\. Which is the better buy\\?$'),
      (m, item) => {
        expect(m[5]).toBe(m[2]);
        const u1 = exact(cents(m[3]) / m[1]);
        const u2 = exact(cents(m[6]) / m[4]);
        expect(u1).not.toBe(u2);
        const best = u1 < u2 ? [m[1], u1] : [m[4], u2];
        expect(item.options.filter((o) => o.text.startsWith(`The ${best[0]}-ounce`))).toHaveLength(1);
        return `The ${best[0]}-ounce size, at ${price(best[1])} per ounce`;
      }],
    [rx('comes in three sizes: (\\d+) ounces for $M, (\\d+) ounces for $M, (\\d+) ounces for $M\\. Which size is the best buy\\?$'),
      (m) => {
        const sizes = [[m[1], m[2]], [m[3], m[4]], [m[5], m[6]]].map(([q, p]) => [q, exact(cents(p) / q)]);
        const low = Math.min(...sizes.map((s) => s[1]));
        const best = sizes.filter((s) => s[1] === low);
        expect(best).toHaveLength(1);
        return `The ${best[0][0]}-ounce size, at ${price(low)} per ounce`;
      }],
    [rx('^A (\\d+)-ounce .+ costs $M\\. A (\\d+)-ounce .+ costs $M\\. How much lower is the unit price of the better buy, in dollars per ounce\\?'),
      (m) => {
        const gap = Math.abs(exact(cents(m[2]) / m[1]) - exact(cents(m[4]) / m[3]));
        expect(gap).toBeGreaterThan(0);
        return dollars(gap);
      }],
    [rx('^A (\\d+)-ounce .+ costs $M\\. A (\\d+)-ounce .+ costs $M\\. You need (\\d+) ounces\\. How much do you save by buying the one large size instead of two small ones, in dollars\\?'),
      (m) => {
        expect(Number(m[3])).toBe(2 * m[1]);
        expect(m[5]).toBe(m[3]);
        const saved = 2 * cents(m[2]) - cents(m[4]);
        expect(saved).toBeGreaterThan(0);
        return dollars(saved);
      }],
    [rx('^A pack of (\\d+) (.+) costs $M\\. A pack of (\\d+) (.+) costs $M\\. Which is the better buy\\?$'),
      (m, item) => {
        expect(m[5]).toBe(m[2]);
        const u1 = exact(cents(m[3]) / m[1]);
        const u2 = exact(cents(m[6]) / m[4]);
        expect(u1).not.toBe(u2);
        const best = u1 < u2 ? [m[1], u1] : [m[4], u2];
        expect(item.options.filter((o) => o.text.startsWith(`The pack of ${best[0]},`))).toHaveLength(1);
        return `The pack of ${best[0]}, at ${price(best[1])} each`;
      }],
    [rx('^A (\\d+)-ounce .+ costs $M\\. You have a coupon for $M off\\. What is the unit price after the coupon, in dollars per ounce\\?'),
      (m) => dollars((cents(m[2]) - cents(m[3])) / m[1])],
    [rx('^A (\\d+)-ounce .+ costs $M\\. The store has a "buy 2, get 1 free" deal, and you take 3 of them\\. What is the unit price you actually pay, in dollars per ounce\\?'),
      (m) => dollars(2 * cents(m[2]) / (3 * m[1]))],
    [rx('Store A: a (\\d+)-ounce size for $M\\. Store B: a (\\d+)-ounce size for $M, and you have a coupon for $M off\\. Store C: a (\\d+)-ounce size for $M each with "buy 2, get 1 free" \\(you would take 3\\)\\. Which store has the lowest price per ounce\\?$'),
      (m) => {
        const stores = [
          ['A', exact(cents(m[2]) / m[1])],
          ['B', exact((cents(m[4]) - cents(m[5])) / m[3])],
          ['C', exact(2 * cents(m[7]) / (3 * m[6]))],
        ];
        const low = Math.min(...stores.map((s) => s[1]));
        const best = stores.filter((s) => s[1] === low);
        expect(best).toHaveLength(1);
        return `Store ${best[0][0]}, at ${price(low)} per ounce`;
      }],
    [rx('^You need (\\d+) ounces of a product\\. Option 1: three (\\d+)-ounce bottles at $M each with a "buy 2, get 1 free" deal\\. Option 2: one (\\d+)-ounce bottle for $M\\. How much do you save by choosing the cheaper option, in dollars\\?'),
      (m) => {
        expect(Number(m[1])).toBe(3 * m[2]);
        expect(m[4]).toBe(m[1]);
        const saved = Math.abs(2 * cents(m[3]) - cents(m[5]));
        expect(saved).toBeGreaterThan(0);
        return dollars(saved);
      }],
  ],
};

function resolve(skill, item) {
  const hits = (RULES[skill] || []).map(([re, fn]) => [item.prompt.match(re), fn]).filter((h) => h[0]);
  if (hits.length !== 1) throw new Error(`${hits.length} rules match: ${item.prompt}`);
  return hits[0][1](hits[0][0], item);
}

// ── the suite ────────────────────────────────────────────────────────────

const byTemplate = bank.TEMPLATES.map((t) => [t.courseSkill, t, expand(t, bank.GB)]);
const allItems = byTemplate.flatMap((x) => x[2]);

describe('Consumer Math at-level items', () => {
  test('the bank is for the course, with the three skills asked for', () => {
    expect(bank.COURSE_ID).toBe('consumer-math');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES.map((t) => t.courseSkill)).toEqual(['cm-discounts-coupons', 'cm-tax-tip-markup', 'cm-unit-price-comparisons']);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(t.courseSkill);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
    }
  });

  test('every template has a re-solver', () => {
    const missing = bank.TEMPLATES.map((t) => t.courseSkill).filter((id) => !Array.isArray(RULES[id]) || !RULES[id].length);
    expect(missing).toEqual([]);
  });

  test('twelve items a skill, four at each tier, and the builder accepts them all', () => {
    for (const [, , items] of byTemplate) {
      expect(items).toHaveLength(12);
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    }
    expect(validate(allItems)).toEqual([]);
  });

  test.each(byTemplate)('%s: every key is the answer the printed question has', (id, template, items) => {
    const used = new Set();
    for (const item of items) {
      const expected = resolve(id, item);
      expect(`${item.prompt} → ${item.answer.value}`).toBe(`${item.prompt} → ${expected}`);
      if (item.options) {
        const keyed = item.options.find((o) => o.label === item.correctOption);
        expect(keyed.text).toBe(expected);
        expect(item.options.filter((o) => o.text === expected)).toHaveLength(1);
      }
      used.add(RULES[id].findIndex(([re]) => re.test(item.prompt)));
    }
    // Each tier cycles its question shapes: no skill is one question with new numbers.
    expect(used.size).toBeGreaterThanOrEqual(10);
  });

  test('a typed answer is a plain number: no $, no %, at most two decimal places', () => {
    for (const item of allItems.filter((i) => !i.options)) {
      expect(item.answer.value).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(item.prompt).toMatch(/in dollars|How many dollars|number of percent/);
    }
  });

  test('money options are written as prices, and no two options are the same amount', () => {
    for (const item of allItems.filter((i) => i.options)) {
      const amounts = item.options.map((o) => o.text).filter((t) => /^\$/.test(t));
      for (const a of amounts) expect(a).toMatch(/^\$\d+\.\d\d$/);
      expect(new Set(amounts).size).toBe(amounts.length);
    }
  });

  test('stacked discounts are never keyed as the percents added together', () => {
    const stacked = allItems.filter((i) => /extra \d+% off the sale price\. What is the final price/.test(i.prompt));
    expect(stacked.length).toBeGreaterThan(0);
    for (const item of stacked) {
      const m = item.prompt.match(rx('costs $M\\. It is on sale for (\\d+)% off, and a coupon takes an extra (\\d+)% off'));
      const added = price(cents(m[1]) - pctOf(cents(m[1]), Number(m[2]) + Number(m[3])));
      expect(item.answer.value).not.toBe(added);
      expect(item.options.map((o) => o.text)).toContain(added);       // the mistake is offered
    }
  });

  test('the right choice is not always in the same place', () => {
    const letters = allItems.filter((i) => i.options).map((i) => i.correctOption);
    expect(new Set(letters).size).toBeGreaterThanOrEqual(3);
  });
});
