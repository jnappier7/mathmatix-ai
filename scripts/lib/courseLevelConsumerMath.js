'use strict';
/**
 * At-level check items for Consumer Math (grades 9–12): discounts and coupons,
 * tax / tip / markup, and unit-price comparisons.
 *
 * ALL MONEY IS WHOLE CENTS. Every amount is an integer number of cents from the
 * draw to the key, so nothing is ever a floating-point rounding (0.1 + 0.2);
 * a draw whose answer is not a whole number of cents is thrown back.
 *
 * A typed money answer is a plain number of dollars with no "$" (the prompt
 * says so); where the mistakes are the interesting part — stacked discounts
 * added together, a tip taken on the taxed total, the lower sticker price
 * taken for the better buy — the item is multiple choice with "$42.50" options.
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'consumer-math';
const GB = '9-12';

// ── helpers ──────────────────────────────────────────────────────────────

/** "$42.50" */
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
/** "$80" when it is whole dollars, "$42.50" otherwise — how a price tag reads. */
const tag = (cents) => (cents % 100 === 0 ? `$${cents / 100}` : usd(cents));
/** The typed key: dollars as the plain number JS prints (42.5, 0.25, 80). */
const typed = (cents) => String(cents / 100);
const whole = (x) => Number.isInteger(x);

const AS_NUMBER = ' Type just the number, like 3.5 for $3.50.';
const AS_PERCENT = ' Give only the number of percent.';
const AS_UNIT = ' Type just the number, like 0.25 for 25 cents.';
const tipOf = (t) => `${t === 18 ? 'an' : 'a'} ${t}% tip`;

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keep drawing until the shape comes out usable (a generator returns null to redraw). */
const retry = (fn) => (r, idx) => {
  for (let i = 0; i < 600; i++) {
    const out = fn(r, idx);
    if (out) return out;
  }
  throw new Error('no usable draw in 600 tries');
};

/** Multiple choice with the right answer at `pos`; null when two choices collide. */
function mc(correct, wrongs, pos) {
  const options = wrongs.slice(0, 3).map(String);
  options.splice(pos, 0, String(correct));
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  return { options, correctOption: 'ABCD'[pos], value: String(correct) };
}

const GOODS = ['jacket', 'backpack', 'pair of headphones', 'video game', 'pair of sneakers', 'desk lamp', 'tablet case', 'coffee maker'];
const BY_OUNCE = ['box of cereal', 'bottle of juice', 'jar of peanut butter', 'bag of rice', 'bottle of shampoo', 'tub of yogurt'];
const BY_COUNT = [['batteries', 'battery'], ['granola bars', 'bar'], ['pens', 'pen'], ['bottles of water', 'bottle'], ['light bulbs', 'bulb']];

// ── templates ────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ── discounts and coupons ────────────────────────────────────────────
  {
    courseSkill: 'cm-discounts-coupons',
    skillId: 'cm-discounts-coupons',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        if (shape === 3) {
          const P = pick(r, [35, 45, 55, 65, 75, 85, 95]) * 100;
          const p = pick(r, [10, 30, 40, 70]);
          const sale = P * (100 - p) / 100;
          if (!whole(sale) || sale % 100 === 0) return null;
          return { prompt: `A store takes ${p}% off everything. What do you pay for a ${item} marked ${tag(P)}, in dollars?${AS_NUMBER}`, value: typed(sale),
            explanation: `${p}% off means you pay ${100 - p}% of the price: ${(100 - p) / 100} × ${P / 100} = ${typed(sale)}. Giving the amount taken off, ${typed(P - sale)}, is the usual slip.` };
        }
        const P = int(r, 2, 12) * 2000;
        const p = pick(r, [15, 20, 25, 30, 35, 40]);
        const off = P * p / 100;
        if (!whole(off) || off % 100 !== 0) return null;
        if (shape === 0) {
          return { prompt: `A ${item} regularly costs ${tag(P)}. It is on sale for ${p}% off. What is the sale price, in dollars?`, value: typed(P - off),
            explanation: `The discount is ${p}% of ${P / 100}: ${p / 100} × ${P / 100} = ${off / 100}. Sale price: ${P / 100} − ${off / 100} = ${(P - off) / 100}. Giving the discount (${off / 100}) instead of the price is the usual slip.` };
        }
        if (shape === 1) {
          return { prompt: `A ${item} regularly costs ${tag(P)}. A coupon takes ${p}% off. How many dollars does the coupon save?`, value: typed(off),
            explanation: `The savings are ${p}% of ${P / 100}: ${p / 100} × ${P / 100} = ${off / 100}. Giving the price after the coupon (${(P - off) / 100}) is the usual slip.` };
        }
        return { prompt: `A ${item} regularly costs ${tag(P)}. It is on sale for ${tag(P - off)}. What is the percent discount?${AS_PERCENT}`, value: p,
          explanation: `You save ${P / 100} − ${(P - off) / 100} = ${off / 100}. Compare the savings with the REGULAR price: ${off / 100} ÷ ${P / 100} = ${p / 100} = ${p}%. Dividing by the sale price is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        if (shape === 0) {
          const P = pick(r, [50, 80, 100, 120, 150, 200, 250]) * 100;
          const a = pick(r, [20, 25, 30, 40]);
          const b = pick(r, [10, 15, 20].filter((x) => x !== a));
          const afterA = P * (100 - a) / 100;
          const right = afterA * (100 - b) / 100;
          const added = P * (100 - a - b) / 100;
          if (![afterA, right, added].every(whole)) return null;
          const m = mc(usd(right), [usd(added), usd(afterA), usd(P - right)], int(r, 0, 3));
          if (!m) return null;
          return { prompt: `A ${item} regularly costs ${tag(P)}. It is on sale for ${a}% off, and a coupon takes an extra ${b}% off the sale price. What is the final price?`, ...m,
            explanation: `Take the discounts one at a time. After ${a}% off: ${usd(afterA)}. Then ${b}% off THAT: ${(100 - b) / 100} × ${afterA / 100} = ${usd(right)}. Adding the percents to get ${a + b}% off (${usd(added)}) is the usual slip — the second discount applies to a smaller price.` };
        }
        if (shape === 1) {
          const orig = int(r, 3, 12) * 2000;
          const p = pick(r, [15, 20, 25, 30, 40]);
          const sale = orig * (100 - p) / 100;
          if (!whole(sale)) return null;
          const wrongWay = sale * (100 + p) / 100;
          return { prompt: `After a ${p}% discount, a ${item} costs ${tag(sale)}. What was the original price, in dollars?`, value: typed(orig),
            explanation: `The sale price is ${100 - p}% of the original, so original = ${typed(sale)} ÷ ${(100 - p) / 100} = ${orig / 100}. Adding ${p}% of the sale price (${typed(Math.round(wrongWay))}) is the usual slip: the ${p}% was taken off the ORIGINAL price.` };
        }
        if (shape === 2) {
          const P = int(r, 4, 16) * 1000;
          const p = pick(r, [10, 15, 20, 25]);
          const D = pick(r, [10, 15, 20, 25]) * 100;
          const pctOff = P * p / 100;
          if (!whole(pctOff) || pctOff === D || D >= P) return null;
          const diff = Math.abs(pctOff - D);
          const win = pctOff > D ? 'A' : 'B';
          const lose = win === 'A' ? 'B' : 'A';
          const m = mc(`Coupon ${win} saves ${usd(diff)} more`, [`Coupon ${lose} saves ${usd(diff)} more`, `Coupon ${win} saves ${usd(Math.max(pctOff, D))} more`, 'Both coupons save the same amount'], int(r, 0, 3));
          if (!m) return null;
          return { prompt: `You are buying a ${item} that costs ${tag(P)}. Coupon A takes ${p}% off. Coupon B takes ${tag(D)} off. You may use only one. Which coupon saves more, and how much more?`, ...m,
            explanation: `Coupon A saves ${p}% of ${P / 100} = ${usd(pctOff)}. Coupon B saves ${usd(D)}. So coupon ${win} saves ${usd(diff)} more. Comparing the numbers ${p} and ${D / 100} without finding ${p}% of the price is the usual slip.` };
        }
        const P = pick(r, [48, 64, 72, 96, 112, 136, 144]) * 100;
        const p = pick(r, [5, 15, 35, 45]);
        const sale = P * (100 - p) / 100;
        if (!whole(sale)) return null;
        return { prompt: `A ${item} regularly costs ${tag(P)}. It is on sale for ${tag(sale)}. What is the percent discount?${AS_PERCENT}`, value: p,
          explanation: `You save ${usd(P - sale)}. Compare the savings with the REGULAR price: ${typed(P - sale)} ÷ ${P / 100} = ${p / 100} = ${p}%. Dividing by the sale price is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        const [a, b] = pick(r, [[20, 10], [30, 10], [30, 20], [40, 10], [25, 20], [40, 25], [50, 20], [20, 15], [40, 30]]);
        if (shape === 0) {
          const single = 100 - (100 - a) * (100 - b) / 100;
          if (!whole(single)) return null;
          return { prompt: `A store takes ${a}% off a price, then takes an extra ${b}% off the sale price. This is the same as what single percent discount?${AS_PERCENT}`, value: single,
            explanation: `After both discounts you pay ${(100 - a) / 100} × ${(100 - b) / 100} = ${(100 - single) / 100} of the price, which is ${100 - single}%. So the single discount is ${single}%, not ${a + b}% — the second discount is taken on a smaller price.` };
        }
        if (shape === 1) {
          const orig = int(r, 1, 6) * 10000;
          const fin = orig * (100 - a) * (100 - b) / 10000;
          if (!whole(fin)) return null;
          return { prompt: `A ${item} is marked ${a}% off, and a coupon takes an extra ${b}% off the sale price. The final price is ${tag(fin)}. What was the original price, in dollars?`, value: typed(orig),
            explanation: `You pay ${(100 - a) / 100} × ${(100 - b) / 100} = ${(100 - a) * (100 - b) / 10000} of the original. Original = ${typed(fin)} ÷ ${(100 - a) * (100 - b) / 10000} = ${orig / 100}. Treating the two discounts as ${a + b}% off is the usual slip.` };
        }
        if (shape === 2) {
          const p = pick(r, [10, 20, 25, 40]);
          const D = pick(r, [5, 10, 15, 20, 25, 30]) * 100;
          const price = D * 100 / p;
          if (!whole(price)) return null;
          return { prompt: `Coupon A takes ${p}% off your purchase. Coupon B takes ${tag(D)} off. For what purchase price do the two coupons save exactly the same amount, in dollars?${AS_NUMBER}`, value: typed(price),
            explanation: `Set ${p}% of the price equal to ${D / 100}: ${p / 100} × price = ${D / 100}, so price = ${D / 100} ÷ ${p / 100} = ${typed(price)}. Above that price the percent coupon saves more; below it the dollars-off coupon does.` };
        }
        const P = pick(r, [80, 100, 120, 140, 160, 200, 240]) * 100;
        const p = pick(r, [15, 20, 25, 30]);
        const D = pick(r, [10, 20, 30]) * 100;
        const afterPct = P * (100 - p) / 100;
        const right = afterPct - D;
        const dollarsFirst = (P - D) * (100 - p) / 100;
        const asPercent = P * (100 - p - D / 100) / 100;
        if (![afterPct, dollarsFirst, asPercent].every(whole)) return null;
        const m = mc(usd(right), [usd(dollarsFirst), usd(afterPct), usd(asPercent)], int(r, 0, 3));
        if (!m) return null;
        return { prompt: `A ${item} costs ${tag(P)}. You have a ${p}%-off coupon and a ${tag(D)}-off coupon, and the store lets you use both. The store applies the ${p}% coupon first and then takes off the ${tag(D)}. What is the final price?`, ...m,
          explanation: `First ${p}% off: ${(100 - p) / 100} × ${P / 100} = ${usd(afterPct)}. Then subtract ${usd(D)}: ${usd(right)}. Taking the ${tag(D)} off first gives ${usd(dollarsFirst)}, which is higher — the order matters.` };
      }) },
    ],
  },

  // 2 ── sales tax, tip and markup ────────────────────────────────────────
  {
    courseSkill: 'cm-tax-tip-markup',
    skillId: 'cm-tax-tip-markup',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        if (shape === 0 || shape === 1) {
          const P = int(r, 2, 12) * 2000;
          const rate = pick(r, [5, 6, 7, 8, 9]);
          const tax = P * rate / 100;
          if (!whole(tax)) return null;
          if (shape === 0) {
            return { prompt: `You buy a ${item} for ${tag(P)}. The sales tax rate is ${rate}%. How much sales tax do you pay, in dollars?${AS_NUMBER}`, value: typed(tax),
              explanation: `Sales tax = ${rate}% of ${P / 100} = ${rate / 100} × ${P / 100} = ${typed(tax)}. Using ${rate / 10} instead of ${rate / 100} for ${rate}% is the usual slip.` };
          }
          return { prompt: `A ${item} costs ${tag(P)} before tax. The sales tax rate is ${rate}%. What is the total cost with tax, in dollars?${AS_NUMBER}`, value: typed(P + tax),
            explanation: `Tax: ${rate / 100} × ${P / 100} = ${typed(tax)}. Total: ${P / 100} + ${typed(tax)} = ${typed(P + tax)}. Giving only the tax is the usual slip.` };
        }
        if (shape === 2) {
          const B = int(r, 3, 15) * 1000;
          const t = pick(r, [15, 18, 20]);
          const tip = B * t / 100;
          if (!whole(tip) || tip % 100 !== 0) return null;
          return { prompt: `A restaurant bill is ${tag(B)}. You leave ${tipOf(t)}. How much is the tip, in dollars?`, value: typed(tip),
            explanation: `Tip = ${t}% of ${B / 100} = ${t / 100} × ${B / 100} = ${tip / 100}. Giving the bill plus the tip (${(B + tip) / 100}) is the usual slip.` };
        }
        const C = int(r, 2, 12) * 2000;
        const mPct = pick(r, [25, 40, 50, 60, 75]);
        const up = C * mPct / 100;
        if (!whole(up) || up % 100 !== 0) return null;
        return { prompt: `A store buys a ${item} for ${tag(C)} and marks it up ${mPct}%. What is the store's selling price, in dollars?`, value: typed(C + up),
          explanation: `Markup = ${mPct}% of the cost = ${mPct / 100} × ${C / 100} = ${up / 100}. Selling price = ${C / 100} + ${up / 100} = ${(C + up) / 100}. Giving only the markup is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        if (shape === 0) {
          const B = int(r, 4, 12) * 1000;
          const rate = pick(r, [6, 7, 8]);
          const t = pick(r, [15, 18, 20]);
          const right = B * (100 + rate + t) / 100;
          const tipOnTaxed = Math.round(B * (100 + rate) * (100 + t) / 10000);
          const noTip = B * (100 + rate) / 100;
          const noTax = B * (100 + t) / 100;
          if (![right, noTip, noTax].every(whole)) return null;
          const m = mc(usd(right), [usd(tipOnTaxed), usd(noTip), usd(noTax)], int(r, 0, 3));
          if (!m) return null;
          return { prompt: `A meal costs ${tag(B)} before tax. The sales tax rate is ${rate}%, and you leave ${tipOf(t)} on the pre-tax amount. What is the total cost?`, ...m,
            explanation: `Tax: ${rate / 100} × ${B / 100} = ${usd(B * rate / 100)}. Tip: ${t / 100} × ${B / 100} = ${usd(B * t / 100)}. Total: ${usd(B)} + ${usd(B * rate / 100)} + ${usd(B * t / 100)} = ${usd(right)}. Taking the tip on the taxed amount (${usd(tipOnTaxed)}) is the usual slip.` };
        }
        if (shape === 1) {
          const P = int(r, 2, 15) * 2000;
          const rate = pick(r, [4, 5, 6, 7, 8, 9]);
          const total = P * (100 + rate) / 100;
          if (!whole(total) || total % 100 === 0) return null;
          return { prompt: `A ${item} is priced at ${tag(P)}. With sales tax, the total is ${usd(total)}. What is the sales tax rate?${AS_PERCENT}`, value: rate,
            explanation: `The tax is ${usd(total)} − ${usd(P)} = ${usd(total - P)}. Rate = tax ÷ price = ${typed(total - P)} ÷ ${P / 100} = ${rate / 100} = ${rate}%. Dividing by the total instead of the price is the usual slip.` };
        }
        if (shape === 2) {
          const C = int(r, 2, 10) * 2000;
          const mPct = pick(r, [15, 35, 45, 60, 80, 120]);
          const up = C * mPct / 100;
          if (!whole(up) || up % 100 !== 0) return null;
          return { prompt: `A store buys a ${item} for ${tag(C)} and sells it for ${tag(C + up)}. What is the markup as a percent of the store's cost?${AS_PERCENT}`, value: mPct,
            explanation: `The markup is ${(C + up) / 100} − ${C / 100} = ${up / 100}. As a percent of COST: ${up / 100} ÷ ${C / 100} = ${mPct / 100} = ${mPct}%. Dividing by the selling price is the usual slip.` };
        }
        const n = int(r, 3, 6);
        const k = int(r, 1, 2);
        const t = pick(r, [15, 20, 25]);
        const B = n * k * 2000;
        const each = B * (100 + t) / 100 / n;
        if (!whole(each)) return null;
        return { prompt: `${n} friends share a restaurant bill of ${tag(B)}. They add ${tipOf(t)} and split the total equally. How much does each friend pay, in dollars?`, value: typed(each),
          explanation: `Tip: ${t / 100} × ${B / 100} = ${B * t / 10000}. Total: ${B / 100} + ${B * t / 10000} = ${B * (100 + t) / 10000}. Each: ${B * (100 + t) / 10000} ÷ ${n} = ${typed(each)}. Splitting the bill before adding the tip and forgetting the tip is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const item = pick(r, GOODS);
        if (shape === 0) {
          const C = int(r, 2, 10) * 2000;
          const p = pick(r, [10, 20, 25, 30, 40, 50]);
          const marked = C * (100 + p) / 100;
          const right = marked * (100 - p) / 100;
          const offCost = C * (100 - p) / 100;
          if (![marked, right, offCost].every(whole)) return null;
          const m = mc(usd(right), [usd(C), usd(marked), usd(offCost)], int(r, 0, 3));
          if (!m) return null;
          return { prompt: `A store buys a ${item} for ${tag(C)}. It marks the price up ${p}%, and later puts the ${item} on sale for ${p}% off the marked price. What is the sale price?`, ...m,
            explanation: `Marked price: ${(100 + p) / 100} × ${C / 100} = ${usd(marked)}. Sale price: ${(100 - p) / 100} × ${marked / 100} = ${usd(right)}. A ${p}% markup and a ${p}% discount do NOT cancel (${usd(C)}), because the discount is taken on the larger marked price.` };
        }
        if (shape === 1) {
          const C = pick(r, [40, 50, 60, 80, 100, 120, 200]) * 100;
          const mPct = pick(r, [50, 60, 80, 100]);
          const d = pick(r, [10, 20, 25]);
          const marked = C * (100 + mPct) / 100;
          const sale = marked * (100 - d) / 100;
          if (![marked, sale].every(whole) || sale <= C) return null;
          return { prompt: `A store buys a ${item} for ${tag(C)}, marks it up ${mPct}%, and then sells it at ${d}% off the marked price. How much profit does the store make on it, in dollars?${AS_NUMBER}`, value: typed(sale - C),
            explanation: `Marked price: ${(100 + mPct) / 100} × ${C / 100} = ${typed(marked)}. Sale price: ${(100 - d) / 100} × ${typed(marked)} = ${typed(sale)}. Profit: ${typed(sale)} − ${C / 100} = ${typed(sale - C)}. Using a net ${mPct - d}% markup (${typed(C * (mPct - d) / 100)}) is the usual slip.` };
        }
        if (shape === 2) {
          const P = int(r, 2, 15) * 2000;
          const rate = pick(r, [4, 5, 6, 7, 8, 9]);
          const total = P * (100 + rate) / 100;
          if (!whole(total) || total % 100 === 0) return null;
          return { prompt: `The total for a ${item}, including ${rate}% sales tax, is ${usd(total)}. What was the price before tax, in dollars?`, value: typed(P),
            explanation: `The total is ${100 + rate}% of the price, so price = ${typed(total)} ÷ ${(100 + rate) / 100} = ${P / 100}. Taking ${rate}% off the total (${typed(Math.round(total * (100 - rate) / 100))}) is the usual slip: the tax was figured on the price, not on the total.` };
        }
        const n = int(r, 2, 5);
        const k = int(r, 1, 4);
        const rate = pick(r, [5, 6, 7, 8]);
        const t = pick(r, [15, 18, 20]);
        const B = n * k * 1000;
        const each = B * (100 + rate + t) / 100 / n;
        if (!whole(each)) return null;
        return { prompt: `${n} friends have a meal that costs ${tag(B)} before tax. Sales tax is ${rate}%, and they leave ${tipOf(t)} on the pre-tax amount. They split the total equally. How much does each friend pay, in dollars?${AS_NUMBER}`, value: typed(each),
          explanation: `Tax and tip together add ${rate}% + ${t}% = ${rate + t}% of the pre-tax amount: ${(100 + rate + t) / 100} × ${B / 100} = ${typed(B * (100 + rate + t) / 100)}. Each pays ${typed(B * (100 + rate + t) / 100)} ÷ ${n} = ${typed(each)}. Taking the tip on the taxed amount is the usual slip.` };
      }) },
    ],
  },

  // 3 ── unit price and better-buy decisions ──────────────────────────────
  {
    courseSkill: 'cm-unit-price-comparisons',
    skillId: 'cm-unit-price-comparisons',
    tiers: [
      { difficulty: 2, gen: retry((r, idx) => {
        const shape = idx % 4;
        const prod = pick(r, BY_OUNCE);
        if (shape === 0) {
          const q = pick(r, [8, 10, 12, 15, 16, 20, 24]);
          const u = int(r, 12, 48);
          return { prompt: `A ${q}-ounce ${prod} costs ${usd(u * q)}. What is the unit price, in dollars per ounce?${AS_UNIT}`, value: typed(u),
            explanation: `Unit price = price ÷ ounces = ${typed(u * q)} ÷ ${q} = ${typed(u)} dollars per ounce. Dividing the ounces by the price (${(q * 100 / (u * q)).toFixed(2)}) gives ounces per dollar, which is the usual slip.` };
        }
        if (shape === 2) {
          const [things, thing] = pick(r, BY_COUNT);
          const n = pick(r, [4, 6, 8, 12]);
          const u = int(r, 7, 30) * 5;
          return { prompt: `A pack of ${n} ${things} costs ${usd(u * n)}. What is the unit price, in dollars per ${thing}?${AS_UNIT}`, value: typed(u),
            explanation: `Unit price = price ÷ count = ${typed(u * n)} ÷ ${n} = ${typed(u)} dollars per ${thing}. Dividing the count by the price is the usual slip.` };
        }
        // Two sizes. Shape 1: the larger is the better buy. Shape 3: the smaller is.
        const [q1, q2] = pick(r, [[8, 12], [10, 16], [12, 20], [12, 18], [16, 24], [15, 25], [20, 32]]);
        const lowU = int(r, 14, 40);
        const highU = lowU + int(r, 2, 6);
        const [u1, u2] = shape === 1 ? [highU, lowU] : [lowU, highU];
        const best = shape === 1 ? [q2, u2] : [q1, u1];
        const worst = shape === 1 ? [q1, u1] : [q2, u2];
        const opt = (q, text) => `The ${q}-ounce size, at ${text} per ounce`;
        const inverted = `$${(100 / worst[1]).toFixed(2)}`;            // ounces ÷ dollars
        const m = mc(opt(best[0], usd(best[1])), [opt(worst[0], usd(worst[1])), opt(worst[0], inverted), 'Neither: they cost the same per ounce'], int(r, 0, 3));
        if (!m) return null;
        return { prompt: `A ${q1}-ounce ${prod} costs ${usd(u1 * q1)}. A ${q2}-ounce ${prod} costs ${usd(u2 * q2)}. Which is the better buy?`, ...m,
          explanation: `Unit prices: ${typed(u1 * q1)} ÷ ${q1} = ${usd(u1)} per ounce and ${typed(u2 * q2)} ÷ ${q2} = ${usd(u2)} per ounce. The lower unit price is the better buy: the ${best[0]}-ounce size. ${shape === 1 ? 'Choosing the smaller size because its sticker price is lower' : 'Assuming the bigger size is always the better buy'} is the usual slip.` };
      }) },
      { difficulty: 3, gen: retry((r, idx) => {
        const shape = idx % 4;
        const prod = pick(r, BY_OUNCE);
        if (shape === 0) {
          const [qa, qb, qc] = pick(r, [[8, 12, 20], [10, 16, 24], [12, 18, 30], [6, 10, 16], [16, 24, 40]]);
          const base = int(r, 15, 40);
          const us = shuffle(r, [base, base + int(r, 1, 3), base + int(r, 4, 7)]);
          const sizes = [qa, qb, qc];
          const bestI = us.indexOf(Math.min(...us));
          const opts = sizes.map((q, i) => `The ${q}-ounce size, at ${usd(us[i])} per ounce`);
          opts.push('All three cost the same per ounce');
          return { prompt: `A ${prod} comes in three sizes: ${sizes.map((q, i) => `${q} ounces for ${usd(us[i] * q)}`).join(', ')}. Which size is the best buy?`,
            options: opts, correctOption: 'ABCD'[bestI], value: opts[bestI],
            explanation: `Divide each price by its ounces: ${sizes.map((q, i) => `${typed(us[i] * q)} ÷ ${q} = ${usd(us[i])}`).join('; ')}. The lowest unit price is ${usd(us[bestI])} per ounce, the ${sizes[bestI]}-ounce size. Picking the biggest size or the lowest sticker price without dividing is the usual slip.` };
        }
        if (shape === 1) {
          const [q1, q2] = pick(r, [[8, 12], [10, 16], [12, 20], [16, 24], [15, 25], [20, 32]]);
          const u1 = int(r, 15, 45);
          const u2 = u1 + pick(r, [-7, -5, -4, -3, 3, 4, 6]);
          return { prompt: `A ${q1}-ounce ${prod} costs ${usd(u1 * q1)}. A ${q2}-ounce ${prod} costs ${usd(u2 * q2)}. How much lower is the unit price of the better buy, in dollars per ounce?${AS_UNIT}`, value: typed(Math.abs(u1 - u2)),
            explanation: `Unit prices: ${typed(u1 * q1)} ÷ ${q1} = ${typed(u1)} and ${typed(u2 * q2)} ÷ ${q2} = ${typed(u2)} dollars per ounce. The difference is ${typed(Math.abs(u1 - u2))}. Subtracting the two sticker prices instead of the unit prices is the usual slip.` };
        }
        if (shape === 2) {
          const q = pick(r, [8, 10, 12, 16, 20]);
          const u1 = int(r, 18, 45);
          const u2 = u1 - int(r, 2, 6);
          const p1 = u1 * q;
          const p2 = u2 * 2 * q;
          return { prompt: `A ${q}-ounce ${prod} costs ${usd(p1)}. A ${2 * q}-ounce ${prod} costs ${usd(p2)}. You need ${2 * q} ounces. How much do you save by buying the one large size instead of two small ones, in dollars?${AS_NUMBER}`, value: typed(2 * p1 - p2),
            explanation: `Two small ones cost 2 × ${typed(p1)} = ${typed(2 * p1)}. The large one costs ${typed(p2)}. You save ${typed(2 * p1)} − ${typed(p2)} = ${typed(2 * p1 - p2)}. Comparing one small with one large (different amounts) is the usual slip.` };
        }
        const [things] = pick(r, BY_COUNT);
        const [n1, n2] = pick(r, [[6, 10], [8, 12], [12, 20], [10, 24], [12, 18]]);
        const lowU = int(r, 21, 95);
        const highU = lowU + int(r, 2, 6);
        const bigWins = int(r, 0, 1) === 1;
        const [u1, u2] = bigWins ? [highU, lowU] : [lowU, highU];
        const best = bigWins ? [n2, u2] : [n1, u1];
        const worst = bigWins ? [n1, u1] : [n2, u2];
        const opt = (n, text) => `The pack of ${n}, at ${text} each`;
        const m = mc(opt(best[0], usd(best[1])), [opt(worst[0], usd(worst[1])), opt(worst[0], `$${(100 / worst[1]).toFixed(2)}`), 'Neither: they cost the same for each one'], int(r, 0, 3));
        if (!m) return null;
        return { prompt: `A pack of ${n1} ${things} costs ${usd(u1 * n1)}. A pack of ${n2} ${things} costs ${usd(u2 * n2)}. Which is the better buy?`, ...m,
          explanation: `Unit prices: ${typed(u1 * n1)} ÷ ${n1} = ${usd(u1)} each and ${typed(u2 * n2)} ÷ ${n2} = ${usd(u2)} each. The lower unit price is the better buy: the pack of ${best[0]}. Dividing the count by the price, or going by the sticker price, is the usual slip.` };
      }) },
      { difficulty: 4, gen: retry((r, idx) => {
        const shape = idx % 4;
        const prod = pick(r, BY_OUNCE);
        if (shape === 0) {
          const q = pick(r, [10, 12, 16, 20, 24, 25]);
          const u = int(r, 14, 42);
          const coupon = pick(r, [50, 75, 100, 150]);
          const price = u * q + coupon;
          if (price % q === 0) return null;                       // keep the before-coupon unit price from being a tidy trap
          return { prompt: `A ${q}-ounce ${prod} costs ${usd(price)}. You have a coupon for ${usd(coupon)} off. What is the unit price after the coupon, in dollars per ounce?${AS_UNIT}`, value: typed(u),
            explanation: `Price after the coupon: ${typed(price)} − ${typed(coupon)} = ${typed(u * q)}. Unit price: ${typed(u * q)} ÷ ${q} = ${typed(u)} dollars per ounce. Dividing first and then subtracting the coupon from the unit price is the usual slip.` };
        }
        if (shape === 1) {
          const q = pick(r, [8, 10, 12, 16, 20]);
          const u = int(r, 6, 20) * 2;                             // effective cents per ounce
          const each = u * q * 3 / 2;
          if (!whole(each)) return null;
          return { prompt: `A ${q}-ounce ${prod} costs ${usd(each)}. The store has a "buy 2, get 1 free" deal, and you take 3 of them. What is the unit price you actually pay, in dollars per ounce?${AS_UNIT}`, value: typed(u),
            explanation: `You pay for 2: 2 × ${typed(each)} = ${typed(2 * each)}. You get 3 × ${q} = ${3 * q} ounces. Unit price: ${typed(2 * each)} ÷ ${3 * q} = ${typed(u)} dollars per ounce. Dividing by only ${2 * q} ounces, or paying for all 3, is the usual slip.` };
        }
        if (shape === 2) {
          // Three stores: a plain price, a coupon, and buy-2-get-1-free.
          const qA = pick(r, [12, 16, 20]);
          const qB = pick(r, [10, 20, 25]);
          const qC = pick(r, [8, 10, 12]);
          const base = int(r, 9, 18) * 2;
          const us = shuffle(r, [base, base + 2, base + 4]);
          const coupon = pick(r, [50, 100, 150]);
          const pA = us[0] * qA;
          const pB = us[1] * qB + coupon;
          const pC = us[2] * qC * 3 / 2;
          if (!whole(pC)) return null;
          const bestI = us.indexOf(Math.min(...us));
          // The store that LOOKS cheapest before the deals must not be the real answer every time; just require the trap to exist.
          const naive = [pA / qA, pB / qB, pC / qC];
          if (naive.indexOf(Math.min(...naive)) === bestI) return null;
          const opts = ['A', 'B', 'C'].map((s, i) => `Store ${s}, at ${usd(us[i])} per ounce`);
          opts.push('All three stores cost the same per ounce');
          return { prompt: `Three stores sell the same ${prod}. Store A: a ${qA}-ounce size for ${usd(pA)}. Store B: a ${qB}-ounce size for ${usd(pB)}, and you have a coupon for ${usd(coupon)} off. Store C: a ${qC}-ounce size for ${usd(pC)} each with "buy 2, get 1 free" (you would take 3). Which store has the lowest price per ounce?`,
            options: opts, correctOption: 'ABCD'[bestI], value: opts[bestI],
            explanation: `A: ${typed(pA)} ÷ ${qA} = ${usd(us[0])}. B: (${typed(pB)} − ${typed(coupon)}) ÷ ${qB} = ${usd(us[1])}. C: pay for 2, get ${3 * qC} ounces: ${typed(2 * pC)} ÷ ${3 * qC} = ${usd(us[2])}. Store ${'ABC'[bestI]} is lowest. Comparing the shelf prices and ignoring the coupon and the free one is the usual slip.` };
        }
        const q = pick(r, [8, 10, 12, 16]);
        const u = int(r, 6, 20) * 2;
        const each = u * q * 3 / 2;
        const bigU = u + pick(r, [-3, -2, -1, 1, 2, 3]);
        const big = bigU * 3 * q;
        if (!whole(each)) return null;
        const saved = Math.abs(2 * each - big);
        return { prompt: `You need ${3 * q} ounces of a product. Option 1: three ${q}-ounce bottles at ${usd(each)} each with a "buy 2, get 1 free" deal. Option 2: one ${3 * q}-ounce bottle for ${usd(big)}. How much do you save by choosing the cheaper option, in dollars?${AS_NUMBER}`, value: typed(saved),
          explanation: `Option 1: you pay for 2 bottles, 2 × ${typed(each)} = ${typed(2 * each)}. Option 2 costs ${typed(big)}. The difference is ${typed(saved)}, so option ${2 * each < big ? 1 : 2} is cheaper. Charging for all three bottles in option 1 (${typed(3 * each)}) is the usual slip.` };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
