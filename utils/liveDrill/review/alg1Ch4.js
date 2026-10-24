/**
 * Chapter Review: Algebra 1 — Module 4 (Linear Functions, 4.1–4.5), built from Mr. Nappier's
 * guided notes, the Module 4 quiz practice and the Module 4 practice test. Quick-fire: one move per
 * play — the first point and the next from y = mx + b, intercepts, horizontal and vertical lines,
 * the slope between two points (zero and undefined included), the missing coordinate, standard to
 * slope-intercept form, what m and b mean, is the table linear, the battery-drone model, Rex's
 * y-intercept plotted on the x-axis, arithmetic sequences, the cumulative ACT items.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 4', blurb: 'Graphing, slope, slope-intercept form, rate of change, arithmetic sequences — mixed.' },
  graph: { name: 'Graphing Lines', ch: '4.1', blurb: 'Points from an equation, intercepts, y = a and x = a, Rex\'s misplaced intercept.' },
  slope: { name: 'Slope & Rate of Change', ch: '4.2', blurb: 'Rise over run between two points, zero and undefined, the missing coordinate, the table\'s rate.' },
  sif: { name: 'Slope-Intercept Form', ch: '4.3', blurb: 'Write it from m and b, rewrite standard form, read m and b and say what they mean, the drone model.' },
  seq: { name: 'Arithmetic Sequences', ch: '4.5', blurb: 'Is it arithmetic, the common difference, the next terms, the nth term.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'Which relation is a function, solve, a literal equation.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** reduced fraction text, "−3/4" or "2" */
const frac = (p, q) => { if (q < 0) { p = -p; q = -q; } const g = gcd(p, q) || 1; p /= g; q /= g; return q === 1 ? num(p) : `${p < 0 ? M : ''}${Math.abs(p)}/${q}`; };
/** y = mx + b with m as p/q */
function sif(p, q, b) {
  const m = frac(p, q); const paren = m.includes('/') ? (m.startsWith(M) ? `${M}(${m.slice(1)})` : `(${m})`) : m;
  const mx = p === 0 ? '' : m === '1' ? 'x' : m === `${M}1` ? `${M}x` : `${paren}x`;
  if (!mx) return `y = ${num(b)}`; return b === 0 ? `y = ${mx}` : `y = ${mx} ${b < 0 ? M : '+'} ${Math.abs(b)}`;
}
const std = (a, b, c) => `${a === 1 ? '' : a === -1 ? M : num(a)}x ${b < 0 ? M : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${num(c)}`;

const T = {};

// ------------------------------------------------------------------ 4.1
T.nextPoint = { book: 'graph', make(rand) {
  const m = nz(rand, -5, 5); const b = nz(rand, -8, 8); const kind = pick(rand, ['first', 'next', 'onLine']); if (Math.abs(m) === Math.abs(b) || Math.abs(m + b) === Math.abs(b) || m + b === 1) return T.nextPoint.make(rand);
  if (kind === 'first') return { ask: 'Where does the graph start on the y-axis?', prompt: sif(m, 1, b), ...mc(rand, pt(0, b), [pt(b, 0), pt(0, m), pt(m, 0), pt(0, -b)]), tell: `b = ${num(b)} is the y-intercept: the point (0, ${num(b)}).` };
  if (kind === 'next') return { ask: 'From the y-intercept, which point comes next?', prompt: sif(m, 1, b), ...mc(rand, pt(1, m + b), [pt(m, 1 + b), pt(1, b), pt(1, m), pt(-1, m + b)]), tell: `slope ${num(m)} = rise ${num(m)}, run 1: from (0, ${num(b)}) to (1, ${num(m + b)}).` };
  const x = nz(rand, -4, 4); const y = m * x + b; const on = rand() < 0.5; const yy = on ? y : y + pick(rand, [1, -1, 2, -2]);
  return { ask: `Is ${pt(x, yy)} on the line?`, prompt: sif(m, 1, b), ...mc(rand, on ? `Yes — ${num(m)}(${num(x)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(y)}` : `No — ${num(m)}(${num(x)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(y)}, not ${num(yy)}`, [on ? `No — ${num(m)}(${num(x)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(y + 1)}` : `Yes — ${num(m)}(${num(x)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(yy)}`, 'Yes — every point with that x is on the line', 'No — the line has no points with a negative coordinate']),
    tell: `substitute x = ${num(x)}: y = ${num(y)}. ${on ? 'It matches.' : `The point has y = ${num(yy)}, so no.`}` };
} };

T.intercepts = { book: 'graph', make(rand) {
  const a = nz(rand, -6, 6); const b = nz(rand, -6, 6); const xi = nz(rand, -6, 6); const yi = nz(rand, -6, 6); const c = a * xi; if (b * yi !== c || Math.abs(xi) === Math.abs(yi) || Math.abs(c) === Math.abs(xi) || Math.abs(c) === Math.abs(yi)) return T.intercepts.make(rand);
  const want = rand() < 0.5 ? 'x' : 'y';
  return { ask: `Find the ${want}-intercept`, prompt: std(a, b, c), ...mc(rand, want === 'x' ? pt(xi, 0) : pt(0, yi), [want === 'x' ? pt(0, xi) : pt(yi, 0), want === 'x' ? pt(0, yi) : pt(xi, 0), pt(c, 0), pt(0, c)]),
    tell: want === 'x' ? `set y = 0: ${num(a)}x = ${num(c)} → x = ${num(xi)}; the x-intercept is (${num(xi)}, 0).` : `set x = 0: ${num(b)}y = ${num(c)} → y = ${num(yi)}; the y-intercept is (0, ${num(yi)}).` };
} };

T.horizVert = { book: 'graph', make(rand) {
  const a = nz(rand, -8, 8); const vert = rand() < 0.5; if (Math.abs(a) === 1) return T.horizVert.make(rand);
  const Q = vert
    ? { ask: 'Describe the graph', prompt: `x = ${num(a)}`, ans: `a vertical line through (${num(a)}, 0)`, wrongs: [`a horizontal line through (0, ${num(a)})`, `a line through the origin with slope ${num(a)}`, 'a single point'] }
    : { ask: 'Describe the graph', prompt: `y = ${num(a)}`, ans: `a horizontal line through (0, ${num(a)})`, wrongs: [`a vertical line through (${num(a)}, 0)`, `a line through the origin with slope ${num(a)}`, 'a single point'] };
  if (rand() < 0.4) return { ask: 'What is the slope?', prompt: vert ? `x = ${num(a)}` : `y = ${num(a)}`, ...mc(rand, vert ? 'undefined' : '0', ['undefined', '0', String(num(a)), '1']), tell: vert ? 'a vertical line has no run — the slope is undefined.' : 'a horizontal line has no rise — the slope is 0.' };
  return { ask: Q.ask, prompt: Q.prompt, ...mc(rand, Q.ans, Q.wrongs), tell: `${Q.ans}: every point has ${vert ? 'x' : 'y'} = ${num(a)}.` };
} };

T.rexIntercept = { book: 'graph', make(rand) {
  const m = nz(rand, -6, 6); const b = nz(rand, 2, 9);
  return { ask: `To graph ${sif(m, 1, b)}, Rex plotted his first point at (${b}, 0). What went wrong?`, prompt: 'Error analysis.',
    ...mc(rand, `b = ${b} is the Y-intercept — it belongs at (0, ${b}) on the y-axis`, [`nothing — (${b}, 0) is the y-intercept`, `he should have started at (${num(m)}, 0)`, `the first point should be (0, ${num(m)})`]),
    tell: `the y-intercept is where x = 0: (0, ${b}).` };
} };

T.dogFood = { book: 'graph', make(rand) {
  const total = pick(rand, [40, 48, 60, 72, 90]); const per = pick(rand, [2, 3, 4, 5, 6].filter((d) => total % d === 0)); const days = total / per;
  const Q = [
    { q: 'What does the y-intercept mean?', ans: `${total} cups in the bag at the start (day 0)`, wrongs: [`the bag runs out after ${total} days`, `${per} cups eaten per day`, `${days} cups left after one day`] },
    { q: 'What does the x-intercept mean?', ans: `the bag is empty after ${days} days`, wrongs: [`${days} cups in the bag at the start`, `${total} days of food`, `${per} cups are left at the end`] },
    { q: 'What is the x-intercept?', ans: `(${days}, 0)`, wrongs: [`(0, ${days})`, `(${total}, 0)`, `(0, ${total})`] },
  ];
  const q = pick(rand, Q);
  return { ask: q.q, prompt: `A ${total}-cup bag of dog food; the dog eats ${per} cups a day. y = ${total} − ${per}x is the food left after x days.`, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

// ------------------------------------------------------------------ 4.2
T.slopeTwoPoints = { book: 'slope', make(rand) {
  const x1 = int(rand, -6, 6); const y1 = int(rand, -8, 8); const run = nz(rand, -6, 6); const rise = int(rand, -9, 9); const x2 = x1 + run; const y2 = y1 + rise;
  const ans = frac(rise, run);
  return { ask: 'Find the slope', prompt: `Through ${pt(x1, y1)} and ${pt(x2, y2)}.`, ...mc(rand, ans, [frac(run, rise || 1), frac(-rise, run), frac(y2 + y1, x2 + x1 || 1), frac(rise, Math.abs(run)), String(num(rise)), String(num(run)), 'undefined', frac(rise + 1, run), frac(rise, run + 1 || 1)]),
    tell: rise === 0 ? `(${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = 0/${num(run)} = 0 — equal y-values make a horizontal line.` : `m = (${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = ${num(rise)}/${num(run)} = ${ans}.` };
} };

T.undefinedSlope = { book: 'slope', make(rand) {
  const x = nz(rand, -6, 6); const y1 = int(rand, -8, 8); let y2 = int(rand, -8, 8); while (y2 === y1) y2 = int(rand, -8, 8);
  return { ask: 'Find the slope', prompt: `Through ${pt(x, y1)} and ${pt(x, y2)}.`, ...mc(rand, 'undefined — a vertical line', ['0 — a horizontal line', String(num(y2 - y1)), 'undefined — a horizontal line', '1']),
    tell: `the run is ${num(x)} ${M} ${num(x)} = 0, and dividing by zero is undefined: a vertical line.` };
} };

T.missingCoord = { book: 'slope', make(rand) {
  const m = nz(rand, -4, 4); const x1 = int(rand, -5, 5); const run = nz(rand, 1, 5); const x2 = x1 + run; const y2 = int(rand, -9, 9); const y1 = y2 - m * run;
  return { ask: 'Find the missing coordinate', prompt: `A line with slope ${num(m)} passes through (${num(x1)}, y) and ${pt(x2, y2)}.`, typed: y1, neg: y1 < 0,
    tell: `(${num(y2)} ${M} y)/(${num(x2)} ${M} ${num(x1)}) = ${num(m)} → ${num(y2)} ${M} y = ${num(m * run)} → y = ${num(y1)}.` };
} };

T.tableRate = { book: 'slope', make(rand) {
  const x0 = int(rand, 0, 3); const dx = pick(rand, [1, 2, 3]); const y0 = int(rand, -5, 10); const m = nz(rand, -6, 8); const linear = rand() < 0.6;
  const ys = [0, 1, 2, 3].map((i) => y0 + m * dx * i); if (!linear) ys[2] += pick(rand, [1, -1, 2]);
  const rows = [0, 1, 2, 3].map((i) => `(${x0 + dx * i}, ${num(ys[i])})`).join(', ');
  return { ask: 'Is the table linear? If so, give the rate of change.', prompt: `x and y: ${rows}`,
    ...mc(rand, linear ? `yes — constant rate ${num(m)} per unit` : 'no — the rate of change is not constant', [linear ? 'no — the rate of change is not constant' : `yes — constant rate ${num(m)} per unit`, `yes — constant rate ${num(m * dx)} per unit`, `yes — constant rate ${num(-m)} per unit`, `yes — constant rate ${num(m + 1)} per unit`]),
    tell: linear ? `each step: Δy/Δx = ${num(m * dx)}/${dx} = ${num(m)} every time — linear.` : `the differences change between rows, so there is no single rate — not linear.` };
} };

// ------------------------------------------------------------------ 4.3
T.writeSIF = { book: 'sif', make(rand) {
  const p = nz(rand, -6, 6); const q = pick(rand, [1, 1, 2, 3, 5]); const b = nz(rand, -9, 9); const g = gcd(Math.abs(p), q); if (Math.abs(p) === Math.abs(b) || Math.abs(p) === q) return T.writeSIF.make(rand);
  return { ask: 'Write the equation in slope-intercept form', prompt: `Slope ${frac(p, q)}, y-intercept ${num(b)}.`, ...mc(rand, sif(p, q, b), [sif(b, 1, p / g * (q / g === 1 ? 1 : 1)), sif(p, q, -b), sif(-p, q, b), `y = ${num(b)}x ${p < 0 ? M : '+'} ${Math.abs(p)}`]),
    tell: `m goes with x, b stands alone: ${sif(p, q, b)}.` };
} };

T.standardToSIF = { book: 'sif', make(rand) {
  const a = nz(rand, -8, 8); const b = pick(rand, [-4, -3, -2, 2, 3, 4, 5, 6]); const c = nz(rand, -12, 12); if (c % b) return T.standardToSIF.make(rand); // y = (−a/b)x + c/b
  const ans = sif(-a, b, c / b); const want = pick(rand, ['eq', 'm', 'b']);
  if (want === 'eq') return { ask: 'Write in slope-intercept form', prompt: std(a, b, c), ...mc(rand, ans, [sif(a, b, c / b), sif(-a, b, -c / b), sif(a, b, -c / b), sif(-a, 1, c)]),
    tell: `${num(b)}y = ${num(-a)}x + ${num(c)} → divide by ${num(b)}: ${ans}.` };
  if (want === 'm') return { ask: 'What is the slope?', prompt: std(a, b, c), ...mc(rand, frac(-a, b), [frac(a, b), frac(-b, a), frac(c, b), frac(-a, 1), frac(b, a), String(num(c)), frac(a + 1, b), frac(a, b + 1)]), tell: `solve for y first: ${ans} → m = ${frac(-a, b)}.` };
  return { ask: 'What is the y-intercept?', prompt: std(a, b, c), typed: c / b, neg: c / b < 0, tell: `solve for y: ${ans} → b = ${num(c / b)}. (Or set x = 0.)` };
} };

T.meaning = { book: 'sif', make(rand) {
  const p = nz(rand, -5, 5); const q = pick(rand, [1, 2, 3]); const b = nz(rand, -9, 9); const eq = sif(p, q, b); const g = gcd(Math.abs(p), q); if (Math.abs(p) === q || Math.abs(b) * q === Math.abs(p)) return T.meaning.make(rand);
  if (rand() < 0.5) return { ask: 'What does the slope tell you about the graph?', prompt: eq, ...mc(rand, `the line ${p > 0 ? 'rises' : 'falls'} ${Math.abs(p / g)} for every ${q / g} to the right`, [`the line ${p > 0 ? 'falls' : 'rises'} ${Math.abs(p / g)} for every ${q / g} to the right`, `the line crosses the y-axis at (0, ${frac(p, q)})`, `the line rises ${q / g} for every ${Math.abs(p / g)} to the right`]),
    tell: `m = ${frac(p, q)} = rise/run.` };
  return { ask: 'What does the y-intercept tell you about the graph?', prompt: eq, ...mc(rand, `the line crosses the y-axis at (0, ${num(b)})`, [`the line crosses the x-axis at (${num(b)}, 0)`, `the line rises ${Math.abs(b)} for every 1 to the right`, `the line crosses the y-axis at (0, ${frac(p, q)})`]),
    tell: `b = ${num(b)}: the point (0, ${num(b)}).` };
} };

T.drone = { book: 'sif', make(rand) {
  const rate = pick(rand, [4, 5, 6, 7, 8]); const start = rate * int(rand, 5, 12); const kind = pick(rand, ['slope', 'intercept', 'zero']);
  const prompt = `A delivery drone's battery is modeled by c = ${M}${rate}t + ${start}, c in percent and t in minutes of flight.`;
  if (kind === 'slope') return { ask: 'What does the slope mean?', prompt, ...mc(rand, `the battery loses ${rate}% each minute`, [`the battery gains ${rate}% each minute`, `the flight lasts ${rate} minutes`, `the battery starts at ${rate}%`]), tell: `m = ${M}${rate}: ${rate}% lost per minute.` };
  if (kind === 'intercept') return { ask: 'What does the y-intercept mean?', prompt, ...mc(rand, `${start}% charge at takeoff (t = 0)`, [`the flight lasts ${start} minutes`, `${start}% is lost each minute`, `the battery dies at ${start} minutes`]), tell: `b = ${start}: the charge when t = 0.` };
  return { ask: 'When does the model reach zero? (minutes)', prompt, typed: start / rate, tell: `${M}${rate}t + ${start} = 0 → t = ${start}/${rate} = ${start / rate} minutes.` };
} };

T.storyToSIF = { book: 'sif', make(rand) {
  const Q = [
    () => { const r = pick(rand, [4, 5, 6, 8, 9]); const b = pick(rand, [120, 150, 183, 200]); return { s: `There were ${b} million users; the number increases by ${r} million per year. Users y after x years:`, ans: `y = ${r}x + ${b}`, wrongs: [`y = ${b}x + ${r}`, `y = ${r}x ${M} ${b}`, `y = ${b + r}x`] }; },
    () => { const r = pick(rand, [25, 30, 40, 50]); const b = pick(rand, [60, 75, 90, 100]); return { s: `An electrician charges a $${b} service fee plus $${r} per hour. Cost y for x hours:`, ans: `y = ${r}x + ${b}`, wrongs: [`y = ${b}x + ${r}`, `y = ${r}x ${M} ${b}`, `y = (${r} + ${b})x`] }; },
    () => { const r = pick(rand, [3, 5, 6, 8]); const b = pick(rand, [50, 60, 80, 120]); return { s: `A bag holds ${b} cups of food and the dog eats ${r} cups a day. Food left y after x days:`, ans: `y = ${M}${r}x + ${b}`, wrongs: [`y = ${r}x + ${b}`, `y = ${M}${b}x + ${r}`, `y = ${b}x ${M} ${r}`] }; },
  ];
  const q = pick(rand, Q)();
  return { ask: 'Write the equation in slope-intercept form', prompt: q.s, ...mc(rand, q.ans, q.wrongs), tell: `the per-unit change is the slope; the starting amount is b: ${q.ans}.` };
} };

// ------------------------------------------------------------------ 4.5
T.isArithmetic = { book: 'seq', make(rand) {
  const a = int(rand, -10, 20); const d = nz(rand, -7, 7); const kind = pick(rand, ['yes', 'geo', 'squares', 'broken']);
  const seq = kind === 'yes' ? [0, 1, 2, 3].map((i) => a + d * i) : kind === 'geo' ? [1, 2, 4, 8].map((k) => -k) : kind === 'squares' ? [0, 1, 4, 9] : [a, a + d, a + 2 * d, a + 3 * d + nz(rand, -2, 2)];
  const diffs = seq.slice(1).map((v, i) => v - seq[i]); const ok = diffs.every((x) => x === diffs[0]);
  return { ask: 'Arithmetic sequence?', prompt: `${seq.map(num).join(', ')}, …`, ...mc(rand, ok ? `Yes — common difference ${num(diffs[0])}` : `No — the differences are ${diffs.map(num).join(', ')}`, [ok ? `No — the differences are ${diffs.map(num).join(', ')}` : `Yes — common difference ${num(diffs[0])}`, 'Yes — every pattern is arithmetic', 'No — it has negative terms']),
    tell: ok ? `each term adds ${num(diffs[0])}.` : 'an arithmetic sequence adds the SAME number each time; these differences change.' };
} };

T.nextTerms = { book: 'seq', make(rand) {
  const a = int(rand, -15, 25); const d = nz(rand, -9, 9); const seq = [0, 1, 2, 3].map((i) => a + d * i); const want = pick(rand, ['next', 'd', 'nth']);
  if (want === 'd') return { ask: 'Find the common difference', prompt: `${seq.map(num).join(', ')}, …`, typed: d, neg: d < 0, tell: `${num(seq[1])} ${M} ${num(seq[0])} = ${num(d)}.` };
  if (want === 'next') return { ask: 'Find the next term', prompt: `${seq.map(num).join(', ')}, …`, typed: a + 4 * d, neg: a + 4 * d < 0, tell: `add the common difference ${num(d)}: ${num(seq[3])} + ${num(d)} = ${num(a + 4 * d)}.` };
  const n = pick(rand, [10, 12, 15, 20, 25, 48]);
  return { ask: `Find the ${n}th term`, prompt: `${seq.map(num).join(', ')}, …`, typed: a + (n - 1) * d, neg: a + (n - 1) * d < 0, tell: `aₙ = a₁ + (n − 1)d = ${num(a)} + ${n - 1}(${num(d)}) = ${num(a + (n - 1) * d)}.` };
} };

T.nthFormula = { book: 'seq', make(rand) {
  const a = int(rand, -9, 15); const d = nz(rand, -6, 6); const seq = [0, 1, 2, 3].map((i) => a + d * i); const b = a - d;
  const f = (dd, bb) => `aₙ = ${num(dd)}n ${bb < 0 ? M : '+'} ${Math.abs(bb)}`;
  return { ask: 'Write the formula for the nth term', prompt: `${seq.map(num).join(', ')}, …`, ...mc(rand, f(d, b), [f(d, a), f(a, d), f(-d, b), `aₙ = ${num(a)} + ${num(d)}n`]),
    tell: `aₙ = a₁ + (n − 1)d = ${num(a)} + (n − 1)(${num(d)}) = ${f(d, b).slice(5)}. Check n = 1: ${num(d + b)} ✓.` };
} };

T.jogging = { book: 'seq', make(rand) {
  const start = pick(rand, [10, 12, 15, 20]); const inc = pick(rand, [3, 4, 5, 6]); const goal = start + inc * int(rand, 4, 10);
  return { ask: 'In which week does he reach the goal?', prompt: `Kyren jogs ${start} minutes a day the first week and adds ${inc} minutes each week. Goal: ${goal} minutes a day.`, typed: (goal - start) / inc + 1,
    tell: `week n has ${start} + (n − 1)(${inc}) minutes; ${goal} = ${start} + (n − 1)(${inc}) → n − 1 = ${(goal - start) / inc} → week ${(goal - start) / inc + 1}.` };
} };

// ------------------------------------------------------------------ cumulative review
T.whichFunction = { book: 'review', make(rand) {
  const xs = sample(rand, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 6); const ys = sample(rand, [1, 2, 3, 4, 5, 6, 7, 8], 4);
  const rel = (pairs) => `{${pairs.map(([x, y]) => `(${x}, ${y})`).join(', ')}}`;
  const good = rel([[xs[0], ys[0]], [xs[1], ys[0]], [xs[2], ys[1]]]);
  const bads = [rel([[xs[0], ys[0]], [xs[0], ys[1]], [xs[1], ys[2]]]), rel([[xs[3], ys[0]], [xs[3], ys[1]], [xs[4], ys[2]]]), rel([[xs[5], ys[1]], [xs[2], ys[2]], [xs[5], ys[3]]])];
  return { ask: 'Which relation is a function?', prompt: 'Look for a repeated INPUT.', ...mc(rand, good, bads), tell: 'repeated outputs are fine; a repeated x with different y is not a function.' };
} };

T.solveReview = { book: 'review', make(rand) {
  const k = int(rand, 2, 8); const b = int(rand, 1, 9); const x = int(rand, 2, 12);
  return { ask: 'Solve', prompt: `${k}(x + ${b}) = ${k * (x + b)}`, typed: x, tell: `divide by ${k}: x + ${b} = ${x + b} → x = ${x}.` };
} };

T.literalReview = { book: 'review', make(rand) {
  const Q = [{ eq: 'A = lw, for w', ans: 'w = A/l', wrongs: ['w = Al', 'w = l/A', 'w = A − l'] }, { eq: 'd = rt, for r', ans: 'r = d/t', wrongs: ['r = dt', 'r = t/d', 'r = d − t'] }, { eq: 'y = mx + b, for m', ans: 'm = (y − b)/x', wrongs: ['m = y − b − x', 'm = (y + b)/x', 'm = y/x − b'] }];
  const q = pick(rand, Q);
  return { ask: 'Solve the literal equation', prompt: q.eq, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['the point where a graph crosses the x-axis', 'x-intercept'], ['the point where a graph crosses the y-axis', 'y-intercept'], ['rise over run — the change in y for each change in x', 'slope'],
    ['y = mx + b', 'slope-intercept form'], ['Ax + By = C', 'standard form'], ['how one quantity changes in relation to another', 'rate of change'],
    ['a pattern where each term is the previous term plus the same number', 'arithmetic sequence'], ['the number added to get from one term to the next', 'common difference'],
    ['a line with slope 0', 'horizontal line'], ['a line with undefined slope', 'vertical line'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
