/**
 * Chapter Review: Algebra 1 — Module 12 (Statistics), built from Mr. Nappier's Statistics guided
 * notes, the Basic Statistics quiz practice, the Module 12 practice test and the Semester 2 exam
 * review. Quick-fire: one move per play — mean, median, mode, range, the quartiles and IQR, the
 * five-number summary, the outlier and what it does to the mean, which measure is "typical",
 * the score needed for a target mean, reading a box plot, and the test's cumulative ACT-style
 * items (vertex, FOIL, a system).
 *
 * Wrong choices are the practice test's traps: the maximum offered as the range, the mean when
 * an outlier makes the median the honest measure, a box plot's median read as its mean.
 */
const { int, pick, sample, shuffle, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 12', blurb: 'Center, spread, outliers, box plots, and the cumulative review — mixed.' },
  center: { name: 'Mean · Median · Mode', ch: '12.1', blurb: 'Find each; the score you need for a target mean; which measure is typical.' },
  spread: { name: 'Range · Quartiles · IQR', ch: '12.2', blurb: 'Range (not the max!), Q1 and Q3, the IQR, the five-number summary.' },
  outliers: { name: 'Outliers', ch: '12.3', blurb: 'Spot it, what it does to the mean, which measure to trust.' },
  box: { name: 'Box Plots', ch: '12.4', blurb: 'Read the five numbers off the plot; what percent of the data sits where; comparing two classes.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'The vertex, a product, a system — the test\'s last three.' },
};

const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const list = (xs) => xs.join(', ');
const median = (xs) => { const s = sorted(xs); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/** Quartiles the notes' way: the medians of the lower and upper halves, the middle value left out when n is odd. */
function quartiles(xs) {
  const s = sorted(xs); const n = s.length; const lo = s.slice(0, Math.floor(n / 2)); const hi = s.slice(Math.ceil(n / 2));
  return { min: s[0], q1: median(lo), med: median(s), q3: median(hi), max: s[n - 1] };
}
/** A data set of n distinct-ish values in [lo, hi] with an integer mean; shown unsorted. */
function dataSet(rand, n, lo, hi, opts = {}) {
  for (let tries = 0; tries < 200; tries++) {
    const xs = Array.from({ length: n }, () => int(rand, lo, hi));
    if (opts.intMean && sum(xs) % n) continue;
    if (opts.intMedian && !Number.isInteger(median(xs))) continue;
    const q = quartiles(xs); if (opts.intQuartiles && (!Number.isInteger(q.q1) || !Number.isInteger(q.q3))) continue;
    if (opts.distinct && uniq(xs).length < n) continue;
    return xs;
  }
  return Array.from({ length: n }, (_, i) => lo + i);
}
/** Mode: the one value that appears most, or null when there's a tie / none. */
function mode(xs) {
  const c = new Map(); for (const x of xs) c.set(x, (c.get(x) || 0) + 1);
  const top = Math.max(...c.values()); if (top === 1) return null;
  const ms = [...c].filter(([, k]) => k === top).map(([v]) => v); return ms.length === 1 ? ms[0] : null;
}

/** A labelled box plot, as a small SVG. */
function boxSvg(q, opts = {}) {
  const { min, max } = q; const W = 360; const H = opts.two ? 150 : 96; const L = 24; const R = W - 24;
  const lo = opts.lo ?? min; const hi = opts.hi ?? max; const X = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
  const one = (qq, y, label) => {
    const x = (v) => X(v).toFixed(1); const col = 'currentColor';
    return `<g stroke="${col}" fill="none" stroke-width="2"><line x1="${x(qq.min)}" y1="${y}" x2="${x(qq.q1)}" y2="${y}"/><line x1="${x(qq.q3)}" y1="${y}" x2="${x(qq.max)}" y2="${y}"/><rect x="${x(qq.q1)}" y="${y - 16}" width="${(X(qq.q3) - X(qq.q1)).toFixed(1)}" height="32"/><line x1="${x(qq.med)}" y1="${y - 16}" x2="${x(qq.med)}" y2="${y + 16}" stroke-width="3"/><line x1="${x(qq.min)}" y1="${y - 10}" x2="${x(qq.min)}" y2="${y + 10}"/><line x1="${x(qq.max)}" y1="${y - 10}" x2="${x(qq.max)}" y2="${y + 10}"/></g>` +
      `<g font-size="12" fill="currentColor" text-anchor="middle">${[qq.min, qq.q1, qq.med, qq.q3, qq.max].map((v) => `<text x="${x(v)}" y="${y + 32}">${v}</text>`).join('')}</g>` +
      (label ? `<text x="${L}" y="${y - 22}" font-size="12" font-weight="700" fill="currentColor">${label}</text>` : '');
  };
  const body = opts.two ? one(q, 40, opts.labels[0]) + one(opts.two, 112, opts.labels[1]) : one(q, 36);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${opts.alt || 'box plot'}">${body}</svg>`;
}

const T = {};

// ------------------------------------------------------------------ center
T.mean = { book: 'center', make(rand) {
  const n = pick(rand, [5, 6, 8]); const xs = dataSet(rand, n, 50, 95, { intMean: true });
  return { ask: 'Find the mean', prompt: list(xs), typed: sum(xs) / n, tell: `${sum(xs)} ÷ ${n} = ${sum(xs) / n}. Add them all, divide by how many.` };
} };

T.median = { book: 'center', make(rand) {
  const n = pick(rand, [7, 8, 9, 10]); const xs = dataSet(rand, n, 10, 60, { intMedian: true }); const s = sorted(xs);
  return { ask: 'Find the median', prompt: list(xs), typed: median(xs),
    tell: `sort first: ${list(s)} → the middle ${n % 2 ? 'value' : 'two average'} is ${median(xs)}.` };
} };

T.mode = { book: 'center', make(rand) {
  const base = dataSet(rand, 6, 10, 40, { distinct: true }); const m = pick(rand, base); const xs = shuffle(rand, [...base, m, rand() < 0.5 ? m : pick(rand, base.filter((b) => b !== m))]);
  const md = mode(xs); if (md == null) return T.mode.make(rand);
  return { ask: 'Find the mode', prompt: list(xs), typed: md, tell: `${md} appears ${xs.filter((x) => x === md).length} times — more than any other value.` };
} };

T.needScore = { book: 'center', make(rand) {
  const k = pick(rand, [2, 3, 4]); const got = dataSet(rand, k, 70, 95); const target = int(rand, 80, 92); const need = target * (k + 1) - sum(got);
  if (need < 0 || need > 100) return T.needScore.make(rand);
  return { ask: `What score makes the mean exactly ${target}?`, prompt: `First ${k} scores: ${list(got)}.`, typed: need,
    tell: `${k + 1} scores averaging ${target} total ${target * (k + 1)}; ${target * (k + 1)} − ${sum(got)} = ${need}.` };
} };

T.whichMeasure = { book: 'center', make(rand) {
  const Q = [
    { story: 'followers per student in a class where one student is a famous influencer', ans: 'median — the outlier pulls the mean up', why: 'one huge value drags the mean; the median ignores it.' },
    { story: 'house prices on a street with one mansion', ans: 'median — the outlier pulls the mean up', why: 'the mansion inflates the mean; the median stays typical.' },
    { story: 'the shoe size a store should stock the most of', ans: 'mode — the most common value', why: 'the store wants the size that occurs most often.' },
    { story: 'test scores clustered close together with no outliers', ans: 'mean — no outlier, so it uses every value', why: 'with nothing extreme, the mean uses all the data.' },
    { story: 'the most popular pizza topping ordered', ans: 'mode — the most common value', why: 'categories have no mean or median — only a mode.' },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which measure best represents a typical value?', prompt: q.story,
    ...mc(rand, q.ans, ['mean — no outlier, so it uses every value', 'median — the outlier pulls the mean up', 'mode — the most common value', 'range — it shows the spread']),
    tell: q.why };
} };

// ------------------------------------------------------------------ spread
T.range = { book: 'spread', make(rand) {
  const xs = dataSet(rand, pick(rand, [5, 6, 7]), 5, 60, { distinct: true }); const s = sorted(xs);
  return { ask: 'Find the range', prompt: list(xs), typed: s[s.length - 1] - s[0], tell: `max − min = ${s[s.length - 1]} − ${s[0]} = ${s[s.length - 1] - s[0]}. The range is a difference, not the biggest number.` };
} };

T.marcus = { book: 'spread', make(rand) {
  const xs = dataSet(rand, 5, 5, 50, { distinct: true }); const s = sorted(xs); const mx = s[4]; const mn = s[0];
  if (rand() < 0.5) return { ask: `Marcus says the range is ${mx}. What went wrong?`, prompt: list(xs),
    ...mc(rand, 'he gave the maximum — range = max − min', ['he gave the minimum', 'he found the median', 'nothing — that is the range']),
    tell: `range = ${mx} − ${mn} = ${mx - mn}. The range measures spread: the biggest minus the smallest.` };
  return { ask: `Marcus says the range is ${mx}. Find the actual range.`, prompt: list(xs), typed: mx - mn, tell: `${mx} is only the maximum; range = ${mx} − ${mn} = ${mx - mn}.` };
} };

T.quartile = { book: 'spread', make(rand) {
  const n = pick(rand, [7, 8, 9, 10, 11, 12]); const xs = dataSet(rand, n, 10, 60, { intQuartiles: true }); const q = quartiles(xs); const s = sorted(xs);
  const want = pick(rand, ['q1', 'q3']); const half = want === 'q1' ? s.slice(0, Math.floor(n / 2)) : s.slice(Math.ceil(n / 2));
  return { ask: `Find ${want === 'q1' ? 'the lower quartile Q1' : 'the upper quartile Q3'}`, prompt: list(xs), typed: q[want],
    tell: `sort: ${list(s)}. ${want === 'q1' ? 'Lower' : 'Upper'} half ${list(half)}${n % 2 ? ' (the middle value left out)' : ''} → its median is ${q[want]}.` };
} };

T.iqr = { book: 'spread', make(rand) {
  const n = pick(rand, [7, 8, 9, 12]); const xs = dataSet(rand, n, 10, 60, { intQuartiles: true }); const q = quartiles(xs);
  return { ask: 'Find the interquartile range (IQR)', prompt: list(xs), typed: q.q3 - q.q1, tell: `sort: ${list(sorted(xs))}. Q1 = ${q.q1}, Q3 = ${q.q3}, IQR = ${q.q3} − ${q.q1} = ${q.q3 - q.q1} — the spread of the middle half.` };
} };

T.fiveNumber = { book: 'spread', make(rand) {
  const xs = sorted(dataSet(rand, 7, 5, 50, { distinct: true })); const q = quartiles(xs); const m = sum(xs) / 7;
  const show = (a, b, c, d, e) => `min ${a}, Q1 ${b}, median ${c}, Q3 ${d}, max ${e}`;
  return { ask: 'Write the five-number summary', prompt: list(xs),
    ...mc(rand, show(q.min, q.q1, q.med, q.q3, q.max), [show(q.min, xs[1], Number.isInteger(m) ? m : q.med + 1, xs[5], q.max), show(q.min, q.med, q.q1, q.q3, q.max), show(q.min, xs[2], q.med, xs[4], q.max), show(q.q1, q.min, q.med, q.max, q.q3)]),
    tell: `min ${q.min}; lower half ${list(xs.slice(0, 3))} → Q1 = ${q.q1}; median ${q.med}; upper half ${list(xs.slice(4))} → Q3 = ${q.q3}; max ${q.max}.` };
} };

T.sameMean = { book: 'spread', make(rand) {
  const m = int(rand, 70, 85); const d1 = int(rand, 3, 8); const e = int(rand, 1, d1 - 1); const d2 = int(rand, 9, 15);
  const red = [m - d1, m + e, m + d1 - e]; const blue = [m - d2, m, m + d2]; // both sum to 3m; Blue is wider
  const rr = Math.max(...red) - Math.min(...red); const br = blue[2] - blue[0];
  return { ask: 'Same mean, different ranges — which is true?', prompt: `Team Red: ${list(red)}. Team Blue: ${list(blue)}.`,
    ...mc(rand, `Both means are ${m}; Blue's range (${br}) is greater than Red's (${rr})`, [`Both means are ${m}; Red's range (${rr}) is greater than Blue's (${br})`, `Blue's mean is higher because its top score is higher`, `Red's mean is higher because its scores are closer together`]),
    tell: `Red: ${sum(red)}/3 = ${m}, range ${rr}. Blue: ${sum(blue)}/3 = ${m}, range ${br}. Same center, more spread for Blue.` };
} };

// ------------------------------------------------------------------ outliers
T.outlier = { book: 'outliers', make(rand) {
  const xs = dataSet(rand, 4, 60, 80, { distinct: true }); const big = rand() < 0.7; const o = big ? int(rand, 105, 140) : int(rand, 10, 30);
  const all = shuffle(rand, [...xs, o]);
  return { ask: 'Identify the outlier', prompt: list(all), typed: o, tell: `${o} lies far ${big ? 'above' : 'below'} the rest of the data (${list(sorted(xs))}).` };
} };

T.outlierEffect = { book: 'outliers', make(rand) {
  for (let tries = 0; tries < 100; tries++) {
    const xs = dataSet(rand, 4, 30, 50, { intMean: true }); const o = int(rand, 90, 120); if ((sum(xs) + o) % 5) continue;
    const w = (sum(xs) + o) / 5; const wo = sum(xs) / 4;
    return { ask: 'How does the outlier affect the mean?', prompt: `${list(sorted([...xs, o]))} — the outlier is ${o}.`,
      ...mc(rand, `the mean drops from ${w} to ${wo} when ${o} is removed`, [`the mean rises from ${wo} to ${w} when ${o} is removed`, `the mean stays ${wo} either way`, `the median drops from ${w} to ${wo}`]),
      tell: `with: ${sum(xs) + o} ÷ 5 = ${w}; without: ${sum(xs)} ÷ 4 = ${wo}. One extreme value pulls the mean toward it.` };
  }
  return T.outlier.make(rand);
} };

T.addedValue = { book: 'outliers', make(rand) {
  const Q = [
    { q: 'A value far above the rest is added. Which measure changes the MOST?', ans: 'the mean', why: 'the mean uses every value, so one extreme value moves it; the median barely budges.' },
    { q: 'A value far above the rest is added. Which measure changes the LEAST?', ans: 'the median', why: 'the median only cares about position in the sorted list, so one extreme value shifts it at most one spot.' },
    { q: 'Which measure of spread is NOT affected by a single outlier?', ans: 'the IQR', why: 'the IQR is the middle half; the range runs min to max, so an outlier changes it directly.' },
    { q: 'Which measure of spread is changed the most by a single outlier?', ans: 'the range', why: 'range = max − min, and the outlier becomes the new max or min.' },
  ];
  const q = pick(rand, Q);
  return { ask: q.q, prompt: 'Think about which values each measure actually uses.', ...mc(rand, q.ans, ['the mean', 'the median', 'the mode', 'the range', 'the IQR']), tell: q.why };
} };

T.bestCenter = { book: 'outliers', make(rand) {
  const xs = sorted(dataSet(rand, 5, 70, 95, { distinct: true })); const low = int(rand, 20, 45); const all = [low, ...xs];
  return { ask: 'Which measure of center best represents the data?', prompt: list(all), ...mc(rand, 'median', ['mean', 'mode', 'range']),
    tell: `${low} is an outlier far below the rest, so it drags the mean down; the median stays with the typical scores.` };
} };

// ------------------------------------------------------------------ box plots
T.readBox = { book: 'box', make(rand) {
  const q = { min: int(rand, 40, 60), q1: 0, med: 0, q3: 0, max: 0 }; q.q1 = q.min + int(rand, 5, 12); q.med = q.q1 + int(rand, 4, 12); q.q3 = q.med + int(rand, 4, 12); q.max = q.q3 + int(rand, 5, 12);
  const kind = pick(rand, ['median', 'q1', 'q3', 'range', 'iqr', 'min', 'max']);
  const ans = { median: q.med, q1: q.q1, q3: q.q3, range: q.max - q.min, iqr: q.q3 - q.q1, min: q.min, max: q.max }[kind];
  const ask = { median: 'What is the median?', q1: 'What is Q1 (the lower quartile)?', q3: 'What is Q3 (the upper quartile)?', range: 'What is the range?', iqr: 'What is the IQR?', min: 'What is the minimum?', max: 'What is the maximum?' }[kind];
  const why = { median: 'the line inside the box', q1: 'the left edge of the box', q3: 'the right edge of the box', range: `max − min = ${q.max} − ${q.min}`, iqr: `Q3 − Q1 = ${q.q3} − ${q.q1}`, min: 'the left whisker\'s end', max: 'the right whisker\'s end' }[kind];
  return { ask, prompt: 'Use the box plot.', fig: boxSvg(q, { alt: `box plot: min ${q.min}, Q1 ${q.q1}, median ${q.med}, Q3 ${q.q3}, max ${q.max}` }), typed: ans, tell: `${why}: ${ans}.` };
} };

T.percentBox = { book: 'box', make(rand) {
  const Q = [
    { q: 'What percent of the data lies inside the box (Q1 to Q3)?', ans: 50 }, { q: 'What percent of the data lies below the median?', ans: 50 },
    { q: 'What percent of the data lies above Q3?', ans: 25 }, { q: 'What percent of the data lies below Q1?', ans: 25 },
    { q: 'What percent of the data lies between the minimum and Q3?', ans: 75 }, { q: 'What percent of the data lies between Q1 and the maximum?', ans: 75 },
  ];
  const q = pick(rand, Q);
  return { ask: q.q, prompt: 'Any box plot.', typed: q.ans, tell: `each of the four sections holds about 25% of the data — ${q.ans}%.` };
} };

T.compareBox = { book: 'box', make(rand) {
  const mk = () => { const q = { min: int(rand, 50, 65) }; q.q1 = q.min + int(rand, 5, 10); q.med = q.q1 + int(rand, 4, 10); q.q3 = q.med + int(rand, 4, 10); q.max = q.q3 + int(rand, 5, 12); return q; };
  const A = mk(); const B = mk(); if (A.max - A.min === B.max - B.min || A.med === B.med) return T.compareBox.make(rand);
  const wider = A.max - A.min > B.max - B.min ? 'A' : 'B'; const narrower = wider === 'A' ? 'B' : 'A'; const lowMin = Math.min(A.min, B.min); const below = lowMin + int(rand, 1, 4);
  const truths = [`The median for Class A was ${A.med}`, `The range for Class ${wider} was greater than Class ${narrower}'s`, `At least one student scored below ${below}`, `The median for Class B was ${B.med}`];
  const lies = [`The mean for Class B was ${B.med}`, `The mean for Class A was ${A.med}`, `The range for Class ${narrower} was greater than Class ${wider}'s`, `The median for Class A was ${A.q3}`, `Every student scored above ${below}`, `The median for Class B was ${B.q1}`];
  const alt = `Class A: min ${A.min}, Q1 ${A.q1}, median ${A.med}, Q3 ${A.q3}, max ${A.max}. Class B: min ${B.min}, Q1 ${B.q1}, median ${B.med}, Q3 ${B.q3}, max ${B.max}.`;
  return { ask: 'Which statement MUST be correct?', prompt: 'Use the box plots.', fig: boxSvg(A, { two: B, labels: ['Class A', 'Class B'], lo: Math.min(A.min, B.min), hi: Math.max(A.max, B.max), alt }),
    ...mc(rand, pick(rand, truths), lies),
    tell: 'a box plot shows the five-number summary — never the mean. Medians, quartiles, min, max and ranges can be read; "the mean was…" never can.' };
} };

// ------------------------------------------------------------------ cumulative review
T.vertex = { book: 'review', make(rand) {
  const h = int(rand, -6, 6) || 2; const k = int(rand, -8, 8); const b = -2 * h; const c = h * h + k;
  const term = (n, v) => (n === 0 ? '' : `${n < 0 ? ' − ' : ' + '}${Math.abs(n) === 1 && v ? '' : Math.abs(n)}${v}`);
  return { ask: 'What is the vertex?', prompt: `y = x<sup>2</sup>${term(b, 'x')}${term(c, '')}`,
    ...mc(rand, `(${h}, ${k})`, [`(${-h}, ${k})`, `(${h}, ${c})`, `(${-b}, ${c})`, `(${h}, ${-k})`]),
    tell: `x = −b/2a = ${-b}/2 = ${h}; y = ${h}² ${b < 0 ? '−' : '+'} ${Math.abs(b)}(${h}) ${c < 0 ? '−' : '+'} ${Math.abs(c)} = ${k}.` };
} };

T.product = { book: 'review', make(rand) {
  const a = int(rand, 2, 5); const p = int(rand, 1, 6); const q = int(rand, 1, 7); if (p * q === p + q || a * q === p + q) return T.product.make(rand);
  const poly = (A, B, C) => `${A}x<sup>2</sup> + ${B}x + ${C}`;
  return { ask: 'Find the product', prompt: `(${a}x + ${p})(x + ${q})`,
    ...mc(rand, poly(a, a * q + p, p * q), [poly(a, a * q, p * q), poly(a, p + q, p * q), poly(a, a * q + p, p + q), `${a + 1}x + ${p + q}`]),
    tell: `FOIL: ${a}x² + ${a * q}x + ${p}x + ${p * q} = ${poly(a, a * q + p, p * q).replace(/<\/?sup>/g, '')}.` };
} };

T.system = { book: 'review', make(rand) {
  const x = int(rand, 1, 8); const k = int(rand, 1, 9); const y = x + k; const s = x + y;
  return { ask: 'Which ordered pair solves the system?', prompt: `y = x + ${k} and x + y = ${s}`,
    ...mc(rand, `(${x}, ${y})`, [`(${y}, ${x})`, `(${x}, ${x})`, `(${x + 1}, ${y + 1})`, `(${k}, ${s - k})`]),
    tell: `substitute: x + (x + ${k}) = ${s} → 2x = ${s - k} → x = ${x}, y = ${y}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['the sum divided by how many values', 'mean'], ['the middle value of the sorted list', 'median'], ['the value that appears most often', 'mode'],
    ['maximum minus minimum', 'range'], ['Q3 minus Q1 — the spread of the middle half', 'interquartile range (IQR)'],
    ['a value far from the rest of the data', 'outlier'], ['min, Q1, median, Q3, max', 'five-number summary'],
    ['the display built from the five-number summary', 'box plot'], ['the median of the lower half of the data', 'lower quartile (Q1)'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
