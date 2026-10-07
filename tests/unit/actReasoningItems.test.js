/**
 * The ACT reasoning bank (seeds/act-reasoning/act-reasoning-items.generated.json):
 * questions that take two or three connected steps.
 *
 * Every item is re-solved here from its own STEM, with solvers written
 * independently of the generator (scripts/generateActReasoningItems.js), and
 * the result must equal the stored key. Each solver also takes the long way
 * the stem implies (find the height, then the area), so a key that is really
 * the intermediate value fails. Plus the structural pins every bank gets.
 */
const { generate } = require('../../scripts/generateActReasoningItems');
const { hasBadDistractors } = require('../../utils/distractorQuality');

const items = require('../../seeds/act-reasoning/act-reasoning-items.generated.json');
const familyOf = (it) => it.tags.find((t) => t.startsWith('family:')).slice(7);
const keyText = (it) => it.options.find((o) => o.label === it.correctOption).text;
const nums = (s) => (String(s).replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fr = (p, q) => { const g = gcd(p, q) || 1; return q / g === 1 ? `${p / g}` : `${p / g}/${q / g}`; };
const tableRows = (prompt) => prompt.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | '));
const lin = (m, b, lhs = 'y') => {
  const c = m === 1 ? '' : m === -1 ? '-' : `${m}`;
  return b === 0 ? `${lhs} = ${c}x` : `${lhs} = ${c}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
};

const SOLVE = {
  'trapezoid-hidden-height': (it) => {
    const [b1, b2, L] = nums(it.prompt);
    const o = (b2 - b1) / 2;
    const h = Math.sqrt(L * L - o * o);
    expect(Number.isInteger(h)).toBe(true);
    return `${((b1 + b2) * h) / 2}`;
  },
  'inscribed-figures': (it) => {
    if (/square is inscribed in a circle/.test(it.prompt)) { const [r] = nums(it.prompt); return `${(2 * r) ** 2 / 2}`; }
    const [s] = nums(it.prompt);
    return `${s * s} - ${(s / 2) ** 2}π`;
  },
  'shadow-similar': (it) => { const [p, sp, st] = nums(it.prompt); return `${(p * st) / sp}`; },
  'trig-to-area': (it) => {
    const m = it.prompt.match(/(sin|cos) A = (\d+)\/(\d+), and the hypotenuse AB is (\d+)/);
    const leg1 = (Number(m[2]) / Number(m[3])) * Number(m[4]);
    const leg2 = Math.sqrt(Number(m[4]) ** 2 - leg1 ** 2);
    return `${Math.round((leg1 * leg2) / 2)}`;
  },
  'second-pump': (it) => {
    const [cap, a, t1, b] = nums(it.prompt);
    return `${t1 + (cap - a * t1) / (a + b)}`;
  },
  'successive-percent': (it) => {
    const [P, a, b] = nums(it.prompt);
    const first = /\$\d+ was raised/.test(it.prompt) ? 1 + a / 100 : 1 - a / 100;
    const second = /new price was raised/.test(it.prompt) ? 1 + b / 100 : 1 - b / 100;
    const v = Math.round(P * first * second * 100) / 100;
    return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
  },
  'mean-after-removal': (it) => { const [n, m, n2, m2] = nums(it.prompt); return `${n * m - n2 * m2}`; },
  'work-backwards': (it) => {
    const [, a, , b, L] = nums(it.prompt);   // "1/a ... 1/b ... $L"
    let x = L;
    x /= (b - 1) / b;
    x /= (a - 1) / a;
    return `${Math.round(x)}`;
  },
  'count-integer-solutions': (it) => {
    const m = it.prompt.match(/(-?\d+) < (\d+)x ([+-]) (\d+) ≤ (-?\d+)/);
    const lo = Number(m[1]), k = Number(m[2]), d = (m[3] === '-' ? -1 : 1) * Number(m[4]), hi = Number(m[5]);
    let c = 0;
    for (let x = -100; x <= 100; x++) if (lo < k * x + d && k * x + d <= hi) c++;
    return `${c}`;
  },
  'candle-model': (it) => {
    const [t1, h1, t2, h2] = nums(it.prompt);
    const r = (h1 - h2) / (t2 - t1);
    return `${(h1 + r * t1) / r}`;
  },
  'model-from-table': (it) => {
    const ys = tableRows(it.prompt)[1].slice(1).map(Number);
    if (ys[1] / ys[0] === ys[2] / ys[1] && ys[2] - ys[1] !== ys[1] - ys[0]) return `y = ${ys[0]}(${ys[1] / ys[0]})^x`;
    return lin(ys[1] - ys[0], ys[0]);
  },
  'compose-table-formula': (it) => {
    const f = tableRows(it.prompt)[1].slice(1).map(Number);
    const g = it.prompt.match(/g\(x\) = (-?\d*)x(?: ([+-]) (\d+))?/);
    const a = g[1] === '' ? 1 : g[1] === '-' ? -1 : Number(g[1]);
    const b = g[2] ? (g[2] === '-' ? -1 : 1) * Number(g[3]) : 0;
    const G = (x) => a * x + b;
    const ask = it.prompt.match(/What is the value of (f\(g|g\(f)\((\d)\)\)/);
    const c = Number(ask[2]);
    return ask[1] === 'f(g' ? `${f[G(c) - 1]}` : `${G(f[c - 1])}`;
  },
  'which-figure': (it) => {
    const n = nums(it.prompt);   // a, 1, a+d, 2, a+2d, 3, T
    const a = n[0], d = n[2] - n[0], T = n[6];
    return `${(T - a) / d + 1}`;
  },
  'at-least-one': (it) => {
    const p = /coin/.test(it.prompt) ? 1 / 2 : /die/.test(it.prompt) ? 1 / 6 : /3 equal/.test(it.prompt) ? 1 / 3 : 1 / 4;
    const n = Number(it.prompt.match(/spun|flipped|rolled/) && it.prompt.match(/(\d+) times/)[1]);
    const den = Math.round(1 / p) ** n;
    const never = Math.round((1 - p) ** n * den);
    return fr(den - never, den);
  },
  'game-net-value': (it) => {
    const [cost, W, pn, pd] = nums(it.prompt);
    const ev = (W * pn) / pd - cost;
    return ev < 0 ? `-$${Math.abs(ev).toFixed(2)}` : `$${ev.toFixed(2)}`;
  },
  'restricted-codes': (it) => {
    const len = Number(it.prompt.match(/A (\d)-digit/)[1]);
    const first = /cannot be 0/.test(it.prompt) ? 9 : 5;
    let k = first;
    for (let i = 1; i < len; i++) k *= 10 - i;
    return `${k}`;
  },
  'common-base': (it) => {
    const m = it.prompt.match(/If (\d+)\^x = (\d+)\^y and x \+ y = (\d+)/);
    const p = Math.round(Math.log(Number(m[2])) / Math.log(Number(m[1])));
    const y = Number(m[3]) / (p + 1);
    return `${p * y}`;
  },
  'light-travel': (it) => {
    const m = it.prompt.match(/about ([\d.]+) × 10\^(\d+) kilometers\./);
    let v = (Number(m[1]) / 3) * 10 ** (Number(m[2]) - 5);
    let e = 0;
    while (v >= 10) { v /= 10; e++; }
    while (v < 1) { v *= 10; e--; }
    return `${Math.round(v * 1000) / 1000} × 10^${e}`;
  },
};

test('the bank is at least the size it shipped at, on blueprint skills in every category', () => {
  expect(items.length).toBeGreaterThanOrEqual(225);
  const blueprint = require('../../seeds/act-math-blueprint.json');
  const catOf = {};
  Object.entries(blueprint.skillsByCategory).forEach(([c, ss]) => ss.forEach((s) => { catOf[s] = c; }));
  const cats = new Set(items.map((it) => catOf[it.skillId]));
  expect(cats.has(undefined)).toBe(false);
  expect([...cats].sort()).toEqual(Object.keys(blueprint.categoryWeights).sort());
});

test('the seed file is exactly what the generator writes', () => {
  expect(JSON.parse(JSON.stringify(generate().items))).toEqual(items);
});

test('every family has an independent solver', () => {
  expect([...new Set(items.map(familyOf))].filter((f) => !SOLVE[f])).toEqual([]);
});

describe.each(items.map((it) => [it.problemId, it]))('%s', (_id, it) => {
  test('re-solved from its own stem, the key is the stored key', () => {
    expect(SOLVE[familyOf(it)](it)).toBe(keyText(it));
    expect(it.answer.value).toBe(keyText(it));
  });

  test('four distinct choices that pass the distractor gate', () => {
    const texts = it.options.map((o) => o.text);
    expect(new Set(texts).size).toBe(4);
    expect(hasBadDistractors(it)).toBe(false);
    texts.forEach((t) => expect(t).not.toMatch(/NaN|undefined|Infinity|\d\.\d{4,}/));
  });

  test('the explanation names wrong choices by value, never by letter', () => {
    expect(it.explanation).not.toMatch(/\b[A-D]\) /);
    expect(it.explanation).toMatch(/Wrong choices: /);
  });
});
