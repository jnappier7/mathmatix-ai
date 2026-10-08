/**
 * ACT shared-stimulus sets (seeds/act-sets/act-set-items.generated.json).
 *
 * Every question is re-solved from its own stem — the stimulus is in each
 * prompt, which is also what lets a question stand alone in review — with
 * solvers written independently of scripts/generateActSetItems.js. Plus the
 * set rules: a set ships whole (2-3 members, consecutive setOrder), its
 * members ask DIFFERENT questions of one stimulus, and the file is exactly
 * what the generator writes.
 */
const { generate } = require('../../scripts/generateActSetItems');
const { hasBadDistractors } = require('../../utils/distractorQuality');

const items = require('../../seeds/act-sets/act-set-items.generated.json');
const familyOf = (it) => it.tags.find((t) => t.startsWith('family:')).slice(7);
const keyText = (it) => it.options.find((o) => o.label === it.correctOption).text;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fr = (p, q) => { const g = gcd(p, q) || 1; return q / g === 1 ? `${p / g}` : `${p / g}/${q / g}`; };
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const rows = (prompt) => prompt.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | '));
const askOf = (it) => it.prompt.split('\n\n').pop();

const SOLVE = {
  'two-plans': (it) => {
    const t = rows(it.prompt);
    const [A, a] = t[1].slice(1).map((x) => Number(x.replace('$', '')));
    const [B, b] = t[2].slice(1).map((x) => Number(x.replace('$', '')));
    const q = askOf(it);
    const N = q.match(/for (\d+) /);
    if (/Basic plan for/.test(q)) return money(A + a * Number(N[1]));
    if (/be equal/.test(q)) return `${(B - A) / (a - b)}`;
    return `C = ${B} + ${b}x`;
  },
  survey: (it) => {
    const t = rows(it.prompt);
    const yes = t[0][1];
    const [a, b] = t[1].slice(1, 3).map(Number), [c, d] = t[2].slice(1, 3).map(Number);
    const q = askOf(it);
    if (/One of the \d+ students|one of the \d+ students/.test(q)) return fr(a + c, a + b + c + d);
    if (/10th graders is chosen/.test(q)) return fr(c, c + d);
    return `${(b * 100) / (a + b)}%`;
  },
  'garden-path': (it) => {
    const [L, W, p] = it.prompt.match(/(\d+) feet long and (\d+) feet wide\. A path (\d+) feet wide/).slice(1).map(Number);
    const q = askOf(it);
    if (/area of the path/.test(q)) return `${(L + 2 * p) * (W + 2 * p) - L * W}`;
    const r = Number(q.match(/costs \$(\d+) per foot/)[1]);
    return money(2 * (L + 2 * p + W + 2 * p) * r);
  },
  'growth-table': (it) => {
    const ys = rows(it.prompt)[1].slice(1).map(Number);
    const g = gcd(ys[1], ys[0]);
    const k = fr(ys[1], ys[0]);
    const q = askOf(it);
    if (/what factor/.test(q)) return k;
    if (/year 5/.test(q)) return `${(ys[3] * ys[1] * ys[1]) / (ys[0] * ys[0])}`;
    const kn = ys[1] / g, kd = ys[0] / g;
    return `N(t) = ${ys[0]}${kd === 1 ? kn : `(${kn}/${kd})`}^t`;
  },
  'score-list': (it) => {
    const xs = it.prompt.match(/were: ([\d, ]+)\./)[1].split(', ').map(Number);
    const s = xs.slice().sort((a, b) => a - b);
    const q = askOf(it);
    if (/median/.test(q)) return `${s[3]}`;
    if (/mean/.test(q)) return `${xs.reduce((a, b) => a + b, 0) / xs.length}`;
    return `${s[6] - s[0]}`;
  },
};

test('the file is exactly what the generator writes', () => {
  expect(JSON.parse(JSON.stringify(generate().items))).toEqual(items);
});

test('sets ship whole: 2-3 members, setOrder 1..n, one stimulus, different questions', () => {
  const bySet = {};
  items.forEach((it) => { (bySet[it.setId] = bySet[it.setId] || []).push(it); });
  expect(Object.keys(bySet).length).toBeGreaterThanOrEqual(50);
  for (const [, m] of Object.entries(bySet)) {
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m.length).toBeLessThanOrEqual(3);
    expect(m.map((x) => x.setOrder).sort()).toEqual(m.map((_, i) => i + 1));
    const stim = (x) => x.prompt.split('\n\n').slice(0, -1).join('\n\n');
    expect(new Set(m.map(stim)).size).toBe(1);                 // one shared stimulus
    expect(new Set(m.map(askOf)).size).toBe(m.length);          // different questions
  }
});

describe.each(items.map((it) => [it.problemId, it]))('%s', (_id, it) => {
  test('re-solved from its own stem (stimulus included), the key is the stored key', () => {
    expect(SOLVE[familyOf(it)](it)).toBe(keyText(it));
    expect(it.answer.value).toBe(keyText(it));
  });
  test('four distinct choices that pass the distractor gate', () => {
    expect(new Set(it.options.map((o) => o.text)).size).toBe(4);
    expect(hasBadDistractors(it)).toBe(false);
  });
});
