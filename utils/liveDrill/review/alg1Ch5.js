/**
 * Chapter Review: Algebra 1 — Module 5 (Writing Linear Equations, 5.1–5.5), built from Mr.
 * Nappier's guided notes, the Equations of a Line quiz review and the Module 5 practice test.
 * Quick-fire: one move per play — slope-intercept form from m and b, from a point and a slope, from
 * two points; point-slope form; converting between the three forms; parallel and perpendicular
 * slopes (and Rex's kept-the-sign error); the kayak and oven stories; correlation and lines of fit;
 * the cumulative ACT items.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 5', blurb: 'Slope-intercept, point-slope and standard form, parallel and perpendicular, lines of fit — mixed.' },
  sif: { name: 'Slope-Intercept Form', ch: '5.1', blurb: 'From m and b, from a point and a slope, from two points, from a story.' },
  forms: { name: 'Point-Slope & Standard', ch: '5.2', blurb: 'Write point-slope form; convert between the three forms.' },
  parperp: { name: 'Parallel & Perpendicular', ch: '5.2', blurb: 'The slope you need, classify a pair, write the line, Rex\'s sign error.' },
  fit: { name: 'Scatter Plots & Fit', ch: '5.3–5.5', blurb: 'Correlation, the line of fit, predictions, the correlation coefficient.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'A slope, f(4), a multi-step equation.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (p, q) => { if (q < 0) { p = -p; q = -q; } const g = gcd(p, q) || 1; p /= g; q /= g; return q === 1 ? num(p) : `${p < 0 ? M : ''}${Math.abs(p)}/${q}`; };
function sif(p, q, b) {
  const m = frac(p, q); const paren = m.includes('/') ? (m.startsWith(M) ? `${M}(${m.slice(1)})` : `(${m})`) : m;
  const mx = p === 0 ? '' : m === '1' ? 'x' : m === `${M}1` ? `${M}x` : `${paren}x`;
  if (!mx) return `y = ${num(b)}`; return b === 0 ? `y = ${mx}` : `y = ${mx} ${b < 0 ? M : '+'} ${Math.abs(b)}`;
}
/** y − y1 = m(x − x1) */
function psf(p, q, x1, y1) {
  const m = frac(p, q); const mm = m === '1' ? '' : m === `${M}1` ? M : m.includes('/') ? (m.startsWith(M) ? `${M}(${m.slice(1)})` : `(${m})`) : m;
  return `y ${y1 < 0 ? '+' : M} ${Math.abs(y1)} = ${mm}(x ${x1 < 0 ? '+' : M} ${Math.abs(x1)})`;
}
const std = (a, b, c) => `${a === 1 ? '' : a === -1 ? M : num(a)}x ${b < 0 ? M : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${num(c)}`;

const T = {};

// ------------------------------------------------------------------ 5.1
T.fromMB = { book: 'sif', make(rand) {
  const m = nz(rand, -7, 7); const b = nz(rand, -9, 9); if (Math.abs(m) === Math.abs(b)) return T.fromMB.make(rand);
  return { ask: 'Write the equation in slope-intercept form', prompt: `y-intercept ${num(b)}, slope ${num(m)}.`, ...mc(rand, sif(m, 1, b), [sif(b, 1, m), sif(m, 1, -b), sif(-m, 1, b), sif(-b, 1, m)]),
    tell: `m goes with x, b stands alone: ${sif(m, 1, b)}.` };
} };

T.pointSlope = { book: 'sif', make(rand) {
  const m = nz(rand, -5, 5); const x1 = nz(rand, -8, 8); const b = nz(rand, -9, 9); const y1 = m * x1 + b; if (Math.abs(y1) === Math.abs(b) || Math.abs(x1) === Math.abs(b) || y1 === 0) return T.pointSlope.make(rand);
  return { ask: 'Write the equation in slope-intercept form', prompt: `Through ${pt(x1, y1)} with slope ${num(m)}.`, ...mc(rand, sif(m, 1, b), [sif(m, 1, y1), sif(m, 1, -b), sif(m, 1, x1), sif(-m, 1, b)]),
    tell: `${num(y1)} = ${num(m)}(${num(x1)}) + b → b = ${num(b)}: ${sif(m, 1, b)}. The given point is not the y-intercept unless x = 0.` };
} };

T.twoPoints = { book: 'sif', make(rand) {
  const m = nz(rand, -5, 5); const b = nz(rand, -9, 9); const x1 = nz(rand, -6, 6); let x2 = nz(rand, -6, 6); while (x2 === x1) x2 = nz(rand, -6, 6); const y1 = m * x1 + b; const y2 = m * x2 + b;
  return { ask: 'Write the equation in slope-intercept form', prompt: `Through ${pt(x1, y1)} and ${pt(x2, y2)}.`, ...mc(rand, sif(m, 1, b), [sif(m, 1, y1), sif(-m, 1, b), sif(m, 1, -b), sif(1, m, b)]),
    tell: `m = (${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = ${num(m)}; then ${num(y1)} = ${num(m)}(${num(x1)}) + b → b = ${num(b)}.` };
} };

T.story = { book: 'sif', make(rand) {
  const Q = [
    () => { const fee = int(rand, 5, 15); const per = int(rand, 5, 12); const h = int(rand, 3, 8); if (fee === per) return Q[0](); return { s: `Marisol rents a kayak for a $${fee} launch fee plus $${per} per hour.`, eqAsk: 'Write the cost C after h hours', eq: `C = ${per}h + ${fee}`, wrongs: [`C = ${fee}h + ${per}`, `C = ${per}h ${M} ${fee}`, `C = ${per + fee}h`], numAsk: `Find the cost after ${h} hours`, val: per * h + fee }; },
    () => { const per = int(rand, 3, 8); const n = int(rand, 3, 6); const total = int(rand, 30, 60); const b = total - per * n; if (b <= 0 || b === total || per === n) return Q[1](); return { s: `Ayzha's gym cost rises $${per} per class. After ${n} classes one month, her total is $${total}.`, eqAsk: 'Write the monthly cost y after x classes', eq: `y = ${per}x + ${b}`, wrongs: [`y = ${per}x + ${total}`, `y = ${n}x + ${b}`, `y = ${per}x ${M} ${b}`], numAsk: 'What is the monthly base fee?', val: b }; },
    () => { const drop = pick(rand, [10, 15, 20, 25]); const t = int(rand, 2, 5); const temp = pick(rand, [325, 350, 375, 400]); const b = temp + drop * t; return { s: `An oven's temperature drops ${drop}°F every minute; after ${t} minutes it reads ${temp}°F.`, eqAsk: 'Write the temperature y after x minutes', eq: `y = ${M}${drop}x + ${b}`, wrongs: [`y = ${drop}x + ${b}`, `y = ${M}${drop}x + ${temp}`, `y = ${M}${t}x + ${b}`], numAsk: 'What was the starting temperature (°F)?', val: b }; },
  ];
  const q = pick(rand, Q)();
  if (rand() < 0.5) return { ask: q.eqAsk, prompt: q.s, ...mc(rand, q.eq, q.wrongs), tell: `the per-unit change is m; solve for b from the given point: ${q.eq}.` };
  return { ask: q.numAsk, prompt: q.s, typed: q.val, tell: `${q.eq} → ${q.val}.` };
} };

// ------------------------------------------------------------------ 5.2
T.writePSF = { book: 'forms', make(rand) {
  const p = nz(rand, -5, 5); const q = pick(rand, [1, 1, 2, 3, 4]); const x1 = nz(rand, -8, 8); const y1 = nz(rand, -9, 9); if (gcd(Math.abs(p), q) !== 1 || Math.abs(x1) === Math.abs(y1) || Math.abs(p) === q) return T.writePSF.make(rand);
  const two = rand() < 0.4; const x2 = x1 + q * pick(rand, [1, 2]); const y2 = y1 + p * ((x2 - x1) / q);
  return { ask: 'Write the equation in point-slope form', prompt: two ? `Through ${pt(x1, y1)} and ${pt(x2, y2)}.` : `Through ${pt(x1, y1)} with slope ${frac(p, q)}.`,
    ...mc(rand, psf(p, q, x1, y1), [psf(p, q, -x1, -y1), psf(p, q, y1, x1), psf(-p, q, x1, y1), psf(q, p, x1, y1)]),
    tell: `${two ? `m = (${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = ${frac(p, q)}; ` : ''}y − y₁ = m(x − x₁) with (x₁, y₁) = ${pt(x1, y1)}: the signs flip inside.` };
} };

T.psfToSIF = { book: 'forms', make(rand) {
  const m = nz(rand, -6, 6); const x1 = nz(rand, -8, 8); const y1 = nz(rand, -9, 9); const b = y1 - m * x1;
  return { ask: 'Rewrite in slope-intercept form', prompt: psf(m, 1, x1, y1), ...mc(rand, sif(m, 1, b), [sif(m, 1, y1), sif(m, 1, -b), sif(m, 1, y1 + m * x1), sif(-m, 1, b)]),
    tell: `distribute: y ${y1 < 0 ? '+' : M} ${Math.abs(y1)} = ${num(m)}x ${-m * x1 < 0 ? M : '+'} ${Math.abs(m * x1)}; then ${y1 < 0 ? 'subtract' : 'add'} ${Math.abs(y1)}: ${sif(m, 1, b)}.` };
} };

T.sifToStandard = { book: 'forms', make(rand) {
  const p = nz(rand, -7, 7); const q = pick(rand, [2, 3, 4, 5, 6]); const b = nz(rand, -9, 9); if (gcd(Math.abs(p), q) !== 1) return T.sifToStandard.make(rand); // y = (p/q)x + b → −p x + q y = q b → px − qy = −qb (positive x coefficient)
  const A = Math.abs(p); const B = p > 0 ? -q : q; const C = p > 0 ? -q * b : q * b;
  return { ask: 'Rewrite in standard form (integer coefficients)', prompt: sif(p, q, b), ...mc(rand, std(A, B, C), [std(A, -B, C), std(A, B, -C), std(-p, q, b), std(A, B, b)]),
    tell: `multiply by ${q}: ${q}y = ${num(p)}x + ${num(q * b)} → ${std(A, B, C)}.` };
} };

T.standardToSIF = { book: 'forms', make(rand) {
  const a = nz(rand, -9, 9); const b = pick(rand, [-7, -4, -3, -2, 2, 3, 4, 7]); const c = nz(rand, -21, 21); if (c % b || a % b) return T.standardToSIF.make(rand);
  const m = -a / b; const k = c / b; const ans = sif(m, 1, k);
  return { ask: 'Rewrite in slope-intercept form', prompt: std(a, b, c), ...mc(rand, ans, [sif(-m, 1, k), sif(m, 1, -k), sif(-m, 1, -k), sif(a, 1, c)]),
    tell: `${num(b)}y = ${num(-a)}x + ${num(c)} → divide by ${num(b)}: ${ans}.` };
} };

T.interceptsToStandard = { book: 'forms', make(rand) {
  const xi = nz(rand, -6, 6); const yi = nz(rand, -6, 6); if (Math.abs(xi) === Math.abs(yi)) return T.interceptsToStandard.make(rand); // x/xi + y/yi = 1 → yi x + xi y = xi yi
  const g = gcd(Math.abs(xi), Math.abs(yi)); let A = yi / g; let B = xi / g; let C = (xi * yi) / g; if (A < 0) { A = -A; B = -B; C = -C; }
  return { ask: 'Write the equation in standard form', prompt: `x-intercept ${pt(xi, 0)} and y-intercept ${pt(0, yi)}.`, ...mc(rand, std(A, B, C), [std(A, -B, C), std(B, A, C), std(A, B, -C), std(A, B, 1)]),
    tell: `m = (${num(yi)} ${M} 0)/(0 ${M} ${num(xi)}) = ${frac(-yi, xi)}, b = ${num(yi)} → ${sif(-yi, xi, yi)} → ${std(A, B, C)}.` };
} };

// ------------------------------------------------------------------ parallel & perpendicular
T.slopeNeeded = { book: 'parperp', make(rand) {
  const p = nz(rand, -8, 8); const q = pick(rand, [1, 1, 2, 3, 4, 5]); if (gcd(Math.abs(p), q) !== 1 || Math.abs(p) === q) return T.slopeNeeded.make(rand); const perp = rand() < 0.5;
  const given = rand() < 0.5 ? sif(p, q, nz(rand, -9, 9)) : std(-p, q, nz(rand, -9, 9)).replace(/^−?x/, (m) => m);
  const want = perp ? frac(-q, p) : frac(p, q);
  return { ask: `Slope of a line ${perp ? 'PERPENDICULAR' : 'PARALLEL'} to it?`, prompt: given, ...mc(rand, want, [frac(p, q), frac(-q, p), frac(-p, q), frac(q, p)]),
    tell: `the given slope is ${frac(p, q)}${/x .* y =/.test(given) ? ' (solve for y first)' : ''}; ${perp ? `perpendicular = opposite reciprocal: ${want}` : `parallel = the same slope: ${want}`}.` };
} };

T.classify = { book: 'parperp', make(rand) {
  const p = nz(rand, -6, 6); const q = pick(rand, [1, 2, 3, 4, 5, 6, 7]); if (gcd(Math.abs(p), q) !== 1) return T.classify.make(rand); const kind = pick(rand, ['parallel', 'perpendicular', 'neither']);
  const [p2, q2] = kind === 'parallel' ? [p, q] : kind === 'perpendicular' ? [-q, p] : [p + nz(rand, -2, 2) || p + 3, q];
  if (kind === 'neither' && (p2 * q === p * q2 || p2 * p === -q2 * q)) return T.classify.make(rand);
  const b1 = nz(rand, -9, 9); let b2 = nz(rand, -9, 9); while (b2 === b1) b2 = nz(rand, -9, 9);
  return { ask: 'Parallel, perpendicular, or neither?', prompt: `${sif(p, q, b1)} and ${sif(p2, q2, b2)}`, ...mc(rand, kind === 'parallel' ? 'parallel — equal slopes, different intercepts' : kind === 'perpendicular' ? 'perpendicular — slopes are opposite reciprocals' : 'neither', ['parallel — equal slopes, different intercepts', 'perpendicular — slopes are opposite reciprocals', 'neither', 'the same line']),
    tell: `slopes ${frac(p, q)} and ${frac(p2, q2)}: ${kind === 'parallel' ? 'equal' : kind === 'perpendicular' ? `their product is ${M}1` : 'not equal and not opposite reciprocals'}.` };
} };

T.writeParPerp = { book: 'parperp', make(rand) {
  const perp = rand() < 0.5; const m = pick(rand, perp ? [-4, -3, -2, 2, 3, 4] : [-5, -4, -3, -2, 2, 3, 4, 5]); const b0 = nz(rand, -9, 9);
  const x1 = perp ? m * pick(rand, [-2, -1, 1, 2, 3]) : nz(rand, -6, 6); const want = perp ? [-1, m] : [m, 1]; const y1 = nz(rand, -9, 9);
  const b = y1 - (want[0] / want[1]) * x1; const ans = sif(want[0], want[1], b);
  return { ask: 'Write the equation in slope-intercept form', prompt: `Through ${pt(x1, y1)} and ${perp ? 'PERPENDICULAR' : 'PARALLEL'} to ${sif(m, 1, b0)}.`, ...mc(rand, ans, [sif(want[0], want[1], y1), sif(want[0], want[1], b0), sif(perp ? m : -1, perp ? 1 : m, b), sif(-want[0], want[1], b)]),
    tell: `${perp ? `perpendicular slope: ${frac(-1, m)}` : `same slope: ${num(m)}`}; ${num(y1)} = (${frac(want[0], want[1])})(${num(x1)}) + b → b = ${num(b)}.` };
} };

T.rexPerp = { book: 'parperp', make(rand) {
  const p = pick(rand, [2, 3, 4, 5, 7]); const q = pick(rand, [3, 4, 5, 8].filter((x) => x !== p)); const b = nz(rand, -9, 9);
  return { ask: `Rex says a line perpendicular to ${sif(-p, q, b)} has slope ${M}${q}/${p}. What went wrong?`, prompt: 'Error analysis.',
    ...mc(rand, `he took the reciprocal but KEPT the negative sign — the perpendicular slope is ${q}/${p}`, [`nothing — ${M}${q}/${p} is right`, `he should have kept the slope: ${M}${p}/${q}`, `the perpendicular slope is ${p}/${q}`]),
    tell: `perpendicular slopes are OPPOSITE reciprocals: ${M}${p}/${q} → ${q}/${p}.` };
} };

// ------------------------------------------------------------------ 5.3–5.5
T.correlation = { book: 'fit', make(rand) {
  const Q = [
    { s: 'As a player\'s height increases, their weight tends to increase.', ans: 'positive correlation' }, { s: 'As the temperature rises, sales of hot chocolate fall.', ans: 'negative correlation' },
    { s: 'A player\'s jersey number and their birth month.', ans: 'no correlation' }, { s: 'More hours studying, higher final grades.', ans: 'positive correlation' },
    { s: 'The more years a car has been driven, the lower its value.', ans: 'negative correlation' }, { s: 'Shoe size and score on a math quiz.', ans: 'no correlation' },
    { s: 'The points in the scatter plot rise from left to right.', ans: 'positive correlation' }, { s: 'The points in the scatter plot fall from left to right.', ans: 'negative correlation' },
  ];
  const q = pick(rand, Q);
  return { ask: 'What type of correlation?', prompt: q.s, ...mc(rand, q.ans, ['positive correlation', 'negative correlation', 'no correlation']), tell: `${q.ans}.` };
} };

T.lineOfFit = { book: 'fit', make(rand) {
  const m = pick(rand, [2, 3, 4, 5, 6, 8, 10, 12]); const b = pick(rand, [20, 30, 40, 50, 60, 80]); const x = pick(rand, [5, 10, 12, 15, 20, 25]); const kind = pick(rand, ['predict', 'slope', 'extrap']);
  const prompt = `A line of fit for a jet boat's cost (in hundreds of dollars) x years after 2000: y = ${m}x + ${b}.`;
  if (kind === 'predict') return { ask: `Predict the cost in ${2000 + x} (hundreds of dollars)`, prompt, typed: m * x + b, tell: `x = ${x}: y = ${m}(${x}) + ${b} = ${m * x + b}.` };
  if (kind === 'slope') return { ask: 'What does the slope mean?', prompt, ...mc(rand, `the cost rises about ${m} hundred dollars per year`, [`the cost in 2000 was ${m} hundred dollars`, `the cost rises about ${b} hundred dollars per year`, `the boat costs ${m} hundred dollars`]), tell: `m = ${m}: the yearly change.` };
  return { ask: `Predicting the cost in ${2000 + x} from data that ends in 2014 is…`, prompt, ...mc(rand, 'linear extrapolation — a prediction outside the data', ['linear interpolation — a prediction inside the data', 'the correlation coefficient', 'a line of fit']), tell: 'outside the range of the data = extrapolation. Trust it less the farther you go.' };
} };

T.rValue = { book: 'fit', make(rand) {
  const r = pick(rand, [0.98, 0.91, 0.72, 0.35, 0.05, -0.12, -0.48, -0.86, -0.97]);
  const ans = Math.abs(r) >= 0.85 ? (r > 0 ? 'strong positive' : 'strong negative') : Math.abs(r) >= 0.3 ? (r > 0 ? 'moderate positive' : 'moderate negative') : 'little or no correlation';
  return { ask: 'Describe the correlation', prompt: `The correlation coefficient is r = ${num(r)}.`, ...mc(rand, ans, ['strong positive', 'strong negative', 'moderate positive', 'moderate negative', 'little or no correlation']),
    tell: `|r| near 1 is strong, near 0 is weak; the sign gives the direction. r = ${num(r)} → ${ans}.` };
} };

T.bestFitVocab = { book: 'fit', make(rand) {
  const V = [['data made of paired values (x, y)', 'bivariate data'], ['a line drawn to describe the trend of the points in a scatter plot', 'line of fit'], ['the line that most closely models the data, found by calculator', 'best-fit line'],
    ['an algorithm for finding the most accurate line of best fit', 'linear regression'], ['a number from −1 to 1 that measures how well a line models the data', 'correlation coefficient'], ['using a line to predict values OUTSIDE the data', 'linear extrapolation']];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

// ------------------------------------------------------------------ cumulative review
T.slopeReview = { book: 'review', make(rand) {
  const x1 = int(rand, -5, 5); const y1 = int(rand, -8, 8); const run = pick(rand, [1, 2, 3, 4, 6]); const m = nz(rand, -7, 7); const x2 = x1 + run; const y2 = y1 + m * run;
  return { ask: 'What is the slope?', prompt: `Through ${pt(x1, y1)} and ${pt(x2, y2)}.`, typed: m, neg: m < 0, tell: `(${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = ${num(m * run)}/${run} = ${num(m)}.` };
} };

T.evalF = { book: 'review', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 1, 9); const x = int(rand, 2, 6);
  return { ask: `f(x) = ${a}x ${M} ${b}. What is f(${x})?`, prompt: 'Substitute and simplify.', typed: a * x - b, neg: a * x - b < 0, tell: `${a}(${x}) ${M} ${b} = ${a * x} ${M} ${b} = ${a * x - b}.` };
} };

T.solveReview = { book: 'review', make(rand) {
  const k = int(rand, 2, 6); const c = int(rand, 1, 9); const d = int(rand, 1, 5); const x = int(rand, 2, 12); const r = k * (x - c) + d * x;
  return { ask: 'Solve', prompt: `${k}(x ${M} ${c}) + ${d}x = ${num(r)}`, typed: x, tell: `${k + d}x ${M} ${k * c} = ${num(r)} → x = ${x}.` };
} };

module.exports = makeBank(BOOKS, T);
