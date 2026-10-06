/**
 * The ACT visual bank (seeds/act-visual/act-visual-items.generated.json).
 *
 * Every item here is ANSWERED FROM its figure or table, so two things have to
 * be true at once: the key is right, and the description a screen-reader user
 * gets (figureAlt, or the table itself) carries the data needed to get it.
 * This file checks both in one pass: each item is re-solved from its alt text
 * or table ALONE, with solvers written here, independently of the generator,
 * and the result must equal the stored key.
 *
 * Plus the structural pins every bank gets: four distinct choices, the key
 * among them, the distractor gate, well-formed self-grounded SVG, and the file
 * equal to what the generator writes (so a hand edit cannot drift from it).
 */
const { generate, frac, lineEq } = require('../../scripts/generateActVisualItems');
const { hasBadDistractors } = require('../../utils/distractorQuality');

const items = require('../../seeds/act-visual/act-visual-items.generated.json');
const familyOf = (it) => it.tags.find((t) => t.startsWith('family:')).slice(7);

// ── Parsing helpers ─────────────────────────────────────────────────────────
// Alt text uses a true minus sign (−) for screen readers; read it as "-".
const norm = (s) => String(s).replace(/−/g, '-');
const nums = (s) => (norm(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const pairs = (s) => [...norm(s).matchAll(/\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const tableRows = (prompt) => prompt.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | '));
const keyText = (it) => it.options.find((o) => o.label === it.correctOption).text;
const factor = (r) => (r === 0 ? 'x' : `(x ${r < 0 ? '+' : '-'} ${Math.abs(r)})`);

function wellFormed(svg) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/y;
  let i = 0;
  while (i < svg.length) {
    if (svg[i] === '<') {
      tag.lastIndex = i;
      const m = tag.exec(svg);
      if (!m) return false;
      if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]);
      i = tag.lastIndex;
    } else {
      const next = svg.indexOf('<', i);
      if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(svg.slice(i, next < 0 ? svg.length : next))) return false;
      i = next < 0 ? svg.length : next;
    }
  }
  return stack.length === 0;
}

// ── Independent solvers: (item) -> the key text the item must carry ────────
const SOLVE = {
  'graph-slope': (it) => { const [[x1, y1], [x2, y2]] = pairs(it.figureAlt); return frac(y2 - y1, x2 - x1); },
  'line-equation-graph': (it) => {
    const [[x1, y1], [x2, y2]] = pairs(it.figureAlt);
    const p = y2 - y1, q = x2 - x1;
    return lineEq(p, q, y1 - (p / q) * x1);
  },
  'parabola-equation': (it) => {
    const [[p], [q]] = pairs(it.figureAlt);
    return `y = ${/upward/.test(it.figureAlt) ? '' : '-'}${factor(p)}${factor(q)}`;
  },
  'parabola-max': (it) => `${pairs(it.figureAlt)[2][1]}`,
  'trig-graph': (it) => {
    const fn = /a sine-shaped/.test(it.figureAlt) ? 'sin' : 'cos';
    const A = Number(it.figureAlt.match(/maximum (\d+)/)[1]);
    const period = it.figureAlt.match(/repeats every (\S+?)\./)[1];
    const B = { '2π': 1, π: 2, 'π/2': 4 }[period];
    return `y = ${A === 1 ? '' : A}${fn}(${B === 1 ? '' : B}x)`;
  },
  'exponential-graph': (it) => {
    const [[, a], [, y1]] = pairs(it.figureAlt);
    const b = frac(y1, a);
    return `y = ${a === 1 ? '' : `${a}·`}${b.includes('/') ? `(${b})` : b}^x`;
  },
  'function-table': (it) => {
    const [xs, ys] = tableRows(it.prompt).map((r) => r.slice(1).map(Number));
    const m = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    ys.forEach((y, i) => expect(y).toBe(ys[0] + m * (xs[i] - xs[0])));   // the table really is linear
    return lineEq(m, 1, ys[0] - m * xs[0], 'f(x)');
  },
  'system-graph': (it) => {
    const [[a1, b1], [a2, b2], [c1, d1], [c2, d2]] = pairs(it.figureAlt);
    const m1 = (b2 - b1) / (a2 - a1), k1 = b1 - m1 * a1;
    const m2 = (d2 - d1) / (c2 - c1), k2 = d1 - m2 * c1;
    const x = (k2 - k1) / (m1 - m2);
    return `(${x}, ${m1 * x + k1})`;
  },
  'inequality-number-line': (it) => {
    const a = Number(it.figureAlt.match(/circle at (-?\d+)/)[1]);
    const closed = /closed/.test(it.figureAlt);
    const right = /shaded to the right/.test(it.figureAlt);
    const k = keyText(it);
    // Solve the key down to x and compare it with the picture.
    const m = k.match(/^(?:(\d+)x ([+-]) (\d+)|x) (≥|>|≤|<) (-?\d+)$/);
    expect(m).not.toBeNull();
    const coefK = m[1] ? Number(m[1]) : 1, c = m[1] ? (m[2] === '-' ? -Number(m[3]) : Number(m[3])) : 0;
    expect((Number(m[5]) - c) / coefK).toBe(a);
    expect(m[4]).toBe(right ? (closed ? '≥' : '>') : (closed ? '≤' : '<'));
    return k;
  },
  'linear-model-graph': (it) => {
    const pts = pairs(it.figureAlt);
    const fee = pts[0][1], rate = pts[1][1] - pts[0][1];
    pts.forEach(([x, y]) => expect(y).toBe(fee + rate * x));
    const v = it.prompt.match(/number of [\w\s]+?, (\w)\./)[1];
    return `C = ${fee} + ${rate}${v}`;
  },
  'composite-area': (it) => {
    const a = it.figureAlt;
    if (/L-shaped/.test(a)) {
      const [Wd, H, top, right, nw, nh] = nums(a);
      expect(Wd - nw).toBe(top); expect(H - nh).toBe(right);
      return `${Wd * H - nw * nh}`;
    }
    if (/isosceles triangle/.test(a)) { const [Wd, H, ex] = nums(a); return `${Wd * H + (Wd * ex) / 2}`; }
    const [Wd, H] = nums(a); const r = Wd / 2;
    return `${Wd * H} + ${(r * r) / 2}π`;
  },
  'parallel-angle-algebra': (it) => {
    const e = [...it.figureAlt.matchAll(/\((\d+)x ([+−]) (\d+)\)°/g)].map((m) => [Number(m[1]), m[2] === '−' ? -Number(m[3]) : Number(m[3])]);
    const [[a1, c1], [a2, c2]] = e;
    const x = /alternate interior/.test(it.figureAlt) ? (c2 - c1) / (a1 - a2) : (180 - c1 - c2) / (a1 + a2);
    return `${x}`;
  },
  'trapezoid-on-grid': (it) => {
    const V = pairs(it.figureAlt.replace(/[A-D]\(/g, '('));
    let s = 0;
    V.forEach(([x, y], i) => { const [x2, y2] = V[(i + 1) % V.length]; s += x * y2 - x2 * y; });
    return `${Math.abs(s) / 2}`;
  },
  'box-plot': (it) => {
    const [mn, q1, med, q3, mx] = nums(it.figureAlt.split('Minimum')[1]);
    if (/interquartile/.test(it.prompt)) return `${q3 - q1}`;
    if (/range/.test(it.prompt)) return `${mx - mn}`;
    return `${med}`;
  },
  'scatter-fit': (it) => {
    const [[, b], [x2, y2]] = pairs(it.figureAlt);
    const m = (y2 - b) / x2;
    const at = it.prompt.match(/is (\d+)\?$/);
    return at ? `${m * Number(at[1]) + b}` : `${m}`;
  },
  'two-way-reverse': (it) => {
    const rows = tableRows(it.prompt);
    const col = rows[0].indexOf(it.prompt.match(/chose "([^"]+)"/)[1]);
    const group = it.prompt.match(/in the (.+) group\?$/)[1];
    const row = rows.find((r) => r[0] === group);
    const total = rows.find((r) => r[0] === 'Total');
    return frac(Number(row[col]), Number(total[col]));
  },
  'frequency-probability': (it) => {
    const [head, count] = tableRows(it.prompt);
    const n = count.slice(1).map(Number), T = n.reduce((a, b) => a + b, 0);
    const color = it.prompt.match(/it is (NOT )?(\w+)\?$/);
    const i = head.slice(1).map((h) => h.toLowerCase()).indexOf(color[2]);
    return frac(color[1] ? T - n[i] : n[i], T);
  },
  'bar-chart-center': (it) => {
    const f = nums(it.figureAlt.split('. ').slice(1).join('. ')).filter((_, i) => i % 2 === 1);
    const vals = []; f.forEach((c, i) => { for (let k = 0; k < c; k++) vals.push(i + 1); });
    if (/median/.test(it.prompt)) {
      const n = vals.length;
      return `${n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2}`;
    }
    return `${Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10}`;
  },
  'line-chart-rate': (it) => {
    const pts = pairs(it.figureAlt);
    const m = it.prompt.match(/from hour (\d+) to hour (\d+)\?/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); return `${(pts[b][1] - pts[a][1]) / (b - a)}`; }
    const d = pts.slice(1).map(([, y], i) => y - pts[i][1]);
    const best = d.indexOf(Math.max(...d));
    return `From hour ${best} to hour ${best + 1}`;
  },
  'pie-chart-count': (it) => {
    const N = Number(it.prompt.match(/when (\d+) students/)[1]);
    const pct = Object.fromEntries([...it.figureAlt.matchAll(/(\w+) (\d+)%/g)].map((m) => [m[1].toLowerCase(), Number(m[2])]));
    const more = it.prompt.match(/How many more students chose (\w+) than chose (\w+)\?/);
    if (more) return `${(N * (pct[more[1]] - pct[more[2]])) / 100}`;
    return `${(N * pct[it.prompt.match(/chose (\w+)\?$/)[1]]) / 100}`;
  },
  'vector-on-grid': (it) => {
    const [[tx, ty], [hx, hy]] = pairs(it.figureAlt);
    if (/magnitude/.test(it.prompt)) return `${Math.hypot(hx - tx, hy - ty)}`;
    return `⟨${hx - tx}, ${hy - ty}⟩`;
  },
  'complex-plane': (it) => {
    const [a, b] = nums(it.figureAlt.split('Point P')[1]);
    return `${a} ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}i`;
  },
};

// ── Tests ───────────────────────────────────────────────────────────────────

test('the bank is the size the form builder is paced on, across every category', () => {
  expect(items.length).toBeGreaterThanOrEqual(340);
  const blueprint = require('../../seeds/act-math-blueprint.json');
  const catOf = {};
  Object.entries(blueprint.skillsByCategory).forEach(([c, ss]) => ss.forEach((s) => { catOf[s] = c; }));
  const perCat = {};
  items.forEach((it) => { perCat[catOf[it.skillId]] = (perCat[catOf[it.skillId]] || 0) + 1; });
  expect(Object.keys(perCat).sort()).toEqual(Object.keys(blueprint.categoryWeights).sort());
  expect(perCat.undefined).toBeUndefined();     // every item is on a blueprint skill
});

test('the seed file is exactly what the generator writes', () => {
  expect(JSON.parse(JSON.stringify(generate().items))).toEqual(items);
});

test('every family has an independent solver', () => {
  expect([...new Set(items.map(familyOf))].filter((f) => !SOLVE[f])).toEqual([]);
});

describe.each(items.map((it) => [it.problemId, it]))('%s', (_id, it) => {
  test('re-solved from its own figure description or table, the key is the stored key', () => {
    expect(SOLVE[familyOf(it)](it)).toBe(keyText(it));
    expect(it.answer.value).toBe(keyText(it));
  });

  test('four distinct choices that pass the distractor gate', () => {
    const texts = it.options.map((o) => o.text);
    expect(texts).toHaveLength(4);
    expect(new Set(texts).size).toBe(4);
    expect(hasBadDistractors(it)).toBe(false);
    texts.forEach((t) => expect(t).not.toMatch(/NaN|undefined|Infinity|\d\.\d{3,}/));
  });

  test('carries its visual: a well-formed self-grounded figure with full alt text, or a table', () => {
    if (it.svg) {
      expect(wellFormed(it.svg)).toBe(true);
      expect(it.svg).toMatch(/^<svg[\s>]/);
      expect(it.svg).not.toMatch(/<script|NaN|undefined/);
      expect(it.svg).toMatch(/<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
      expect(it.figureAlt.length).toBeGreaterThan(40);
    } else {
      const rows = tableRows(it.prompt);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(new Set(rows.map((r) => r.length)).size).toBe(1);   // the runner renders equal-width rows only
    }
  });

  test('the explanation names wrong choices by value, never by letter', () => {
    expect(it.explanation).not.toMatch(/\b[A-D]\) /);
    expect(it.explanation.length).toBeGreaterThan(40);
  });
});
