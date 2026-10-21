/**
 * Test Prep: Algebra 1 — Module 3 (Relations and Functions), built from Mr. Nappier's
 * Module 3 Test PRACTICE. Every question type on the practice test is a template here, with new
 * numbers each play: vocabulary, domain & range, independent/dependent, discrete/continuous,
 * function or not, function notation, linear vs nonlinear, intercepts, reading a graph (intercepts,
 * positive/negative, symmetry, end behavior, increasing/decreasing, relative max/min), a draining
 * tank, and the ACT-style cumulative review. Wrong-answer choices are the mistakes students make
 * (domain ↔ range, a repeated y read as "not a function", (0, 3) for the x-intercept…).
 */
const { M, num, int, pick, sample, signed, coef, makeBank } = require('./kit');

const BOOKS = {
  all: { name: 'Full Test', ch: 'Mod 3', blurb: 'Every question type on the Module 3 test, mixed.' },
  rel: { name: 'Vocabulary & Relations', ch: 'Q1–5', blurb: 'Terms, domain & range, variables, discrete/continuous, function or not.' },
  fn: { name: 'Function Notation', ch: 'Q6–7', blurb: 'Evaluate f(x), and say what g(4) means.' },
  lin: { name: 'Linear & Intercepts', ch: 'Q8–9, 13', blurb: 'Linear or not, intercepts, the draining tank.' },
  graph: { name: 'Reading Graphs', ch: 'Q10–12', blurb: 'Intercepts, positive/negative, symmetry, end behavior, increasing, max & min.' },
  act: { name: 'ACT Review', ch: 'Q14–15', blurb: 'Solve an equation; equivalent expressions.' },
};

// ---------------------------------------------------------------- graphs (SVG)

const U = 15; const R = 10; // px per unit, axes run −R..R
const W = (2 * R) * U;
const X = (x) => (x + R) * U;
const Y = (y) => (R - y) * U;
function grid(inner, label) {
  let g = '';
  for (let i = -R; i <= R; i++) {
    g += `<line x1="${X(i)}" y1="0" x2="${X(i)}" y2="${W}" stroke="#d8dee2" stroke-width="${i % 5 ? 0.6 : 1}"/>`;
    g += `<line x1="0" y1="${Y(i)}" x2="${W}" y2="${Y(i)}" stroke="#d8dee2" stroke-width="${i % 5 ? 0.6 : 1}"/>`;
  }
  const ticks = [-10, -5, 5, 10].map((t) => `<text x="${X(t)}" y="${Y(0) + 13}" font-size="10" text-anchor="middle" fill="#5b6b72">${num(t)}</text><text x="${X(0) - 4}" y="${Y(t) + 3}" font-size="10" text-anchor="end" fill="#5b6b72">${num(t)}</text>`).join('');
  return `<svg viewBox="-6 -6 ${W + 12} ${W + 12}" width="300" role="img" aria-label="${label}"><rect x="0" y="0" width="${W}" height="${W}" fill="#fff"/>${g}
    <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#14212a" stroke-width="1.6"/><line x1="${X(0)}" y1="0" x2="${X(0)}" y2="${W}" stroke="#14212a" stroke-width="1.6"/>
    ${ticks}<text x="${W - 4}" y="${Y(0) - 5}" font-size="12" text-anchor="end" font-style="italic">x</text><text x="${X(0) + 6}" y="12" font-size="12" font-style="italic">y</text>${inner}</svg>`;
}
const arrowDefs = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2e6fd8"/></marker></defs>';

/** A parabola a(x − r1)(x − r2) that fits the window, with integer vertex and y-intercept. */
function parabola(rand) {
  for (;;) {
    const a = pick(rand, [1, -1]);
    const r1 = int(rand, -6, 4);
    const r2 = r1 + pick(rand, [2, 4, 6]);
    const h = (r1 + r2) / 2;
    const k = -a * ((r2 - r1) / 2) ** 2;
    const c = a * r1 * r2;
    if (r2 > 6 || Math.abs(c) > 9 || Math.abs(k) > 9 || h === 0 || h === k || c === 0) continue;
    return { a, r1, r2, h, k, c, f: (x) => a * (x - r1) * (x - r2) };
  }
}
function parabolaSVG(p) {
  const pts = [];
  for (let x = -R; x <= R; x += 0.25) { const y = p.f(x); if (y >= -R - 0.5 && y <= R + 0.5) pts.push(`${X(x).toFixed(1)},${Y(y).toFixed(1)}`); }
  return grid(`${arrowDefs}<polyline points="${pts.join(' ')}" fill="none" stroke="#2e6fd8" stroke-width="2.5" marker-start="url(#ah)" marker-end="url(#ah)"/><text x="${X(p.h) + 6}" y="${Y(p.k) + (p.a < 0 ? -8 : 16)}" font-size="13" font-style="italic" fill="#2e6fd8">f</text>`, 'graph of f(x)');
}

/** A zigzag g on a closed domain: up–down–up or down–up–down, turning at integer points. */
function zigzag(rand) {
  const x0 = -8; const x3 = 8;
  const a = int(rand, -5, -1); const b = int(rand, 1, 5);
  const up = rand() < 0.5;
  const y0 = up ? int(rand, -7, -3) : int(rand, 3, 7);
  const ya = up ? int(rand, 3, 7) : int(rand, -7, -3);
  const yb = up ? int(rand, -6, -1) : int(rand, 1, 6);
  const y3 = up ? int(rand, 2, 8) : int(rand, -8, -2);
  return { up, pts: [[x0, y0], [a, ya], [b, yb], [x3, y3]] };
}
function zigzagSVG(z) {
  const pts = z.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const dots = [z.pts[0], z.pts[3]].map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="#2e6fd8"/>`).join('');
  return grid(`<polyline points="${pts}" fill="none" stroke="#2e6fd8" stroke-width="2.5"/>${dots}<text x="${X(z.pts[3][0]) - 8}" y="${Y(z.pts[3][1]) - 8}" font-size="13" font-style="italic" fill="#2e6fd8">g</text>`, 'graph of g(x)');
}
const between = (lo, hi) => `${num(lo)} &lt; x &lt; ${num(hi)}`;
const pt = (x, y) => `(${num(x)}, ${num(y)})`;

// ---------------------------------------------------------------- word banks

const VOCAB = [
  ['the set of all x-values (inputs) of a relation', 'domain'],
  ['the set of all y-values (outputs) of a relation', 'range'],
  ['a relation where each input has exactly one output', 'function'],
  ['the point where a graph crosses the x-axis', 'x-intercept'],
  ['the point where a graph crosses the y-axis', 'y-intercept'],
  ['a point that is lower than all the nearby points on a graph', 'relative minimum'],
  ['a point that is higher than all the nearby points on a graph', 'relative maximum'],
  ['a function that can be graphed with a line or a smooth curve', 'continuous function'],
  ['a function whose graph is separate, unconnected points', 'discrete function'],
  ['the variable whose value depends on the other one', 'dependent variable'],
  ['the variable you choose or change — the input', 'independent variable'],
  ['what the graph does as x gets very large or very small', 'end behavior'],
  ['the vertical line that divides a parabola into mirror images', 'line of symmetry'],
];
// "The more X, the more Y": [sentence, independent, dependent]
const VARS = [
  ['The more miles you drive, the more gas you use.', 'miles driven', 'gas used'],
  ['The longer you study, the higher your quiz score.', 'time studying', 'quiz score'],
  ['The more hours Maya works, the more money she earns.', 'hours worked', 'money earned'],
  ['The more people at the party, the more pizza you need.', 'number of people', 'pizza needed'],
  ['The warmer the day, the more lemonade the stand sells.', 'temperature', 'lemonade sold'],
  ['The more songs you download, the less storage is left.', 'songs downloaded', 'storage left'],
  ['The faster you run, the sooner you finish the race.', 'running speed', 'finish time'],
  ['The more water a plant gets, the taller it grows.', 'water given', 'plant height'],
  ['The more tickets the school sells, the more money it raises.', 'tickets sold', 'money raised'],
  ['The longer the candle burns, the shorter it gets.', 'time burning', 'candle height'],
];
// [situation, 'discrete' | 'continuous', why]
const DC = [
  ['the number of cars in a parking lot, counted each hour', 'discrete', 'you can only have whole cars — 12.5 cars makes no sense'],
  ['the temperature outside over one day', 'continuous', 'temperature passes through every value in between'],
  ['the number of tickets sold for each game', 'discrete', 'tickets come in whole numbers'],
  ['the height of a plant as it grows over a month', 'continuous', 'the plant passes through every height in between'],
  ['the cost of buying x movie tickets at $9 each', 'discrete', 'you can only buy whole tickets'],
  ['the amount of water in a tub as it fills', 'continuous', 'the water level passes through every amount'],
  ['the number of students in each class period', 'discrete', 'students are counted in whole numbers'],
  ['the distance a car travels over time', 'continuous', 'the car covers every distance in between'],
  ['the number of goals scored in each soccer game', 'discrete', 'goals are whole numbers'],
  ['the weight of a puppy as it grows', 'continuous', 'weight changes smoothly through every value'],
];
// [equation html, linear?, why]
const LIN = [
  ['y = 3x + 2x − 8', true, 'combine like terms: y = 5x − 8, so x has exponent 1 — a line'],
  ['y = x² + 4x', false, 'x is squared, so the graph is a curve (a parabola)'],
  ['y = −4x + 7', true, 'it is in y = mx + b form: x has exponent 1'],
  ['y = 6', true, 'a horizontal line is linear (slope 0)'],
  ['y = 2<sup>x</sup>', false, 'x is an exponent, so the graph curves'],
  ['y = 5/x', false, 'x is in the denominator, so the graph curves'],
  ['2x + 3y = 12', true, 'standard form Ax + By = C is a line'],
  ['y = x³ − 1', false, 'x is cubed, so the graph curves'],
  ['y = ½x − 3', true, 'a fraction slope is still a line'],
  ['xy = 8', false, 'x and y are multiplied together, so y = 8/x — a curve'],
  ['y − 4 = 3(x + 1)', true, 'distribute and solve: y = 3x + 7, a line'],
  ['y = √x', false, 'a square root of x curves'],
];

// ---------------------------------------------------------------- templates

const T = {};

T.vocab = { book: 'rel', make(rand) {
  const [def, term] = pick(rand, VOCAB);
  const others = sample(rand, VOCAB.filter(([, t]) => t !== term), 3).map(([, t]) => t);
  return { ask: 'Which term matches?', prompt: `${def}`, choices: [term, ...others], answer: 0,
    tell: `that is the definition of ${term}. Learn the vocabulary as pairs: the word and what it means.` };
} };

T.domrange = { book: 'rel', make(rand) {
  for (;;) {
    const xs = sample(rand, [-6, -5, -3, -2, -1, 0, 1, 3, 4, 5, 7], 4);
    const ys = [int(rand, -6, 9), int(rand, -6, 9), 0, 0];
    ys[2] = ys[1]; ys[3] = int(rand, -6, 9); // one repeated y, like the test
    const pairs = xs.map((x, i) => [x, ys[i]]);
    const set = (vs) => `{${[...new Set(vs)].sort((p, q) => p - q).map(num).join(', ')}}`;
    const dom = set(xs); const ran = set(ys);
    const all = set([...xs, ...ys]);
    const listed = `{${ys.map(num).join(', ')}}`; // range with the repeat left in, in table order
    const wantD = rand() < 0.5;
    const right = wantD ? dom : ran;
    const dropped = `{${[...xs].sort((p, q) => p - q).slice(1).map(num).join(', ')}}`; // forgot one x
    const choices = [right, wantD ? ran : dom, all, wantD ? dropped : listed];
    if (new Set(choices).size < 4) continue;
    return { ask: `What is the ${wantD ? 'domain' : 'range'}?`, prompt: `{${pairs.map(([x, y]) => `(${num(x)}, ${num(y)})`).join(', ')}}`,
      choices, answer: 0,
      tell: wantD ? 'domain = the x-values (first numbers), each listed once. The y-values are the range.'
        : 'range = the y-values (second numbers), each listed once — a repeated y is written once.' };
  }
} };

T.indep = { book: 'rel', make(rand) {
  const [s, ind, dep] = pick(rand, VARS);
  const wantI = rand() < 0.5;
  return { ask: `Which is the ${wantI ? 'independent' : 'dependent'} variable?`, prompt: `“${s}”`,
    choices: wantI ? [ind, dep] : [dep, ind], answer: 0,
    tell: `the independent variable is the input you change (${ind}); the dependent variable responds to it (${dep}).` };
} };

T.discrete = { book: 'rel', make(rand) {
  const [s, kind, why] = pick(rand, DC);
  return { ask: 'Discrete or continuous?', prompt: s, choices: kind === 'discrete' ? ['Discrete', 'Continuous'] : ['Continuous', 'Discrete'], answer: 0,
    tell: `${kind} — ${why}.` };
} };

T.isfunc = { book: 'rel', make(rand) {
  const xs = sample(rand, [-4, -2, -1, 0, 2, 3, 5, 6], 4);
  const ys = xs.map(() => int(rand, -5, 8));
  const kind = pick(rand, ['repeatX', 'repeatY', 'clean']);
  if (kind === 'repeatX') xs[2] = xs[0];
  if (kind === 'repeatY') ys[3] = ys[1];
  if (kind !== 'repeatX' && new Set(xs).size < 4) xs[2] = xs[0] + 7;
  const pairs = xs.map((x, i) => `(${num(x)}, ${num(ys[i])})`);
  const yesNoRepeatY = 'Yes — a y-value repeats, but every x still has only one y';
  const choices = kind === 'repeatX'
    ? [`No — x = ${num(xs[0])} goes to two different y-values`, 'Yes — every x has exactly one y', `No — y = ${num(ys[1])} is used twice`, 'Yes — no y-value repeats']
    : kind === 'repeatY'
      ? [yesNoRepeatY, `No — y = ${num(ys[1])} goes with two x-values`, 'No — the x-values are not in order', `No — x = ${num(xs[0])} goes to two different y-values`]
      : ['Yes — every x has exactly one y', 'No — the x-values are not in order', 'No — it has a negative input', 'No — a function must be a line'];
  if (kind === 'repeatX' && ys[2] === ys[0]) ys[2] = ys[0] + 1; // two DIFFERENT outputs
  const shown = xs.map((x, i) => `(${num(x)}, ${num(ys[i])})`);
  return { ask: 'Is the relation a function?', prompt: `{${(kind === 'repeatX' ? shown : pairs).join(', ')}}`, choices, answer: 0,
    tell: kind === 'repeatX' ? 'a function gives each input ONE output. One x with two different y-values breaks that.'
      : 'only a repeated x matters. Two inputs can share an output — a repeated y is fine.' };
} };

T.fsum = { book: 'fn', make(rand) {
  const m = pick(rand, [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7]);
  const b = pick(rand, [-9, -7, -5, -3, -1, 1, 2, 4, 6, 8]);
  const [p, q] = sample(rand, [-4, -3, -2, -1, 1, 2, 3, 4, 5], 2);
  const f = (x) => m * x + b;
  const op = rand() < 0.6 ? '+' : M;
  const ans = op === '+' ? f(p) + f(q) : f(p) - f(q);
  return { ask: `Find f(${num(p)}) ${op} f(${num(q)})`, prompt: `f(x) = ${coef(m)}${signed(b)}`, typed: ans, neg: true,
    tell: `f(${num(p)}) = ${num(m)}(${num(p)})${signed(b)} = ${num(f(p))} and f(${num(q)}) = ${num(f(q))}, so ${num(f(p))} ${op} ${num(f(q)) < 0 && op === '+' ? `(${num(f(q))})` : num(f(q))} = ${num(ans)}.` };
} };

const JOBS = [['Sam', 'babysitting'], ['Ana', 'dog walking'], ['Leo', 'mowing lawns'], ['Kim', 'tutoring'], ['Jay', 'washing cars']];
T.geval = { book: 'fn', make(rand) {
  const [who, job] = pick(rand, JOBS);
  const r = pick(rand, [8, 9, 11, 12, 13, 14, 15]);
  const h = int(rand, 3, 8);
  return { ask: `Find g(${h})`, prompt: `${who} earns g(x) = ${r}x dollars for ${job} x hours.`, typed: r * h,
    tell: `substitute ${h} for x: g(${h}) = ${r} · ${h} = ${r * h} dollars.` };
} };
T.gmean = { book: 'fn', make(rand) {
  const [who, job] = pick(rand, JOBS);
  const r = pick(rand, [10.25, 9.5, 12.75, 11.5, 8.25]);
  const h = int(rand, 3, 6);
  const v = (r * h).toFixed(2);
  return { ask: `What does g(${h}) = ${v} mean?`, prompt: `${who} earns g(x) = ${r}x dollars for ${job} x hours.`,
    choices: [`${who} earns $${v} for ${h} hours of ${job}`, `${who} works ${v} hours and earns $${h}`, `${who} earns $${h} per hour`, `${who} earns $${v} every hour`],
    answer: 0, tell: `x is the input (hours = ${h}); g(x) is the output (dollars = ${v}). So ${h} hours earns $${v}.` };
} };

T.linear = { book: 'lin', make(rand) {
  const [eq, isLin, why] = pick(rand, LIN);
  return { ask: 'Linear or nonlinear?', prompt: eq.replace(/−/g, M), choices: isLin ? ['Linear', 'Nonlinear'] : ['Nonlinear', 'Linear'], answer: 0,
    tell: `${isLin ? 'linear' : 'nonlinear'} — ${why}.` };
} };

T.intercepts = { book: 'lin', make(rand) {
  for (;;) {
    const xi = pick(rand, [-6, -4, -3, -2, 2, 3, 4, 5, 6]);
    const yi = pick(rand, [-6, -4, -3, -2, 2, 3, 4, 5, 6]);
    // Ax + By = C through (xi, 0) and (0, yi): A = C/xi, B = C/yi with C = lcm-ish
    const C = Math.abs(xi * yi);
    const A = C / xi; const B = C / yi;
    if (!Number.isInteger(A) || !Number.isInteger(B) || xi === yi || xi === -yi) continue;
    const eq = `${coef(A)}${B < 0 ? ` ${M} ${coef(-B, 'y')}` : ` + ${coef(B, 'y')}`} = ${num(C)}`;
    return { ask: 'Find the x- and y-intercepts', prompt: eq,
      choices: [`x-int ${pt(xi, 0)}, y-int ${pt(0, yi)}`, `x-int ${pt(0, xi)}, y-int ${pt(yi, 0)}`, `x-int ${pt(yi, 0)}, y-int ${pt(0, xi)}`, `x-int ${pt(-xi, 0)}, y-int ${pt(0, -yi)}`],
      answer: 0, tell: `x-intercept: set y = 0, so ${coef(A)} = ${num(C)} and x = ${num(xi)}. y-intercept: set x = 0, so ${coef(B, 'y')} = ${num(C)} and y = ${num(yi)}. An x-intercept is written (x, 0).` };
  }
} };

const TANKS = [[900, 30], [600, 20], [720, 24], [1200, 40], [1500, 60], [800, 20], [960, 32]];
T.tank = { book: 'lin', make(rand) {
  const [V, Tm] = pick(rand, TANKS);
  const kind = pick(rand, ['xint', 'yint', 'rate', 'slope']);
  const prompt = `A ${V}-gallon tank drains at a steady rate. It is empty after ${Tm} minutes. Graph: gallons left (y) vs. minutes (x).`;
  if (kind === 'rate') return { ask: 'How many gallons drain each minute?', prompt, typed: V / Tm, tell: `${V} gallons ÷ ${Tm} minutes = ${V / Tm} gallons per minute.` };
  if (kind === 'slope') return { ask: 'What is the slope of the graph?', prompt, typed: -V / Tm, neg: true, tell: `slope = change in y ÷ change in x = (0 − ${V}) ÷ (${Tm} − 0) = ${num(-V / Tm)}. Negative: the water goes DOWN.` };
  if (kind === 'xint') {
    return { ask: `What does the x-intercept (${Tm}, 0) mean?`, prompt,
      choices: [`After ${Tm} minutes the tank is empty`, `The tank starts with ${Tm} gallons`, `The tank drains ${Tm} gallons each minute`, `At the start there are ${V} gallons`],
      answer: 0, tell: `on the x-axis, y = 0: zero gallons left — at x = ${Tm} minutes.` };
  }
  return { ask: `What does the y-intercept (0, ${V}) mean?`, prompt,
    choices: [`At the start (0 minutes) the tank holds ${V} gallons`, `The tank is empty after ${V} minutes`, `The tank drains ${V} gallons per minute`, `After ${Tm} minutes there are ${V} gallons left`],
    answer: 0, tell: `on the y-axis, x = 0: time zero — the tank starts with ${V} gallons.` };
} };

T.pxint = { book: 'graph', make(rand) {
  const p = parabola(rand);
  return { ask: 'Name the x-intercepts of f', prompt: 'Use the graph of f(x).', fig: parabolaSVG(p),
    choices: [`${pt(p.r1, 0)} and ${pt(p.r2, 0)}`, `${pt(0, p.r1)} and ${pt(0, p.r2)}`, `${pt(p.h, p.k)} only`, `${pt(0, p.c)} only`],
    answer: 0, tell: `x-intercepts are where the graph crosses the x-axis (y = 0): x = ${num(p.r1)} and x = ${num(p.r2)}.` };
} };
T.pyint = { book: 'graph', make(rand) {
  const p = parabola(rand);
  return { ask: 'What is the y-intercept of f? (the y-value)', prompt: 'Use the graph of f(x).', fig: parabolaSVG(p), typed: p.c, neg: true,
    tell: `the graph crosses the y-axis at (0, ${num(p.c)}).` };
} };
T.psign = { book: 'graph', make(rand) {
  const p = parabola(rand);
  const pos = rand() < 0.5;
  const inside = between(p.r1, p.r2);
  const outside = `x &lt; ${num(p.r1)} or x &gt; ${num(p.r2)}`;
  // f > 0 inside the roots when it opens down, outside when it opens up
  const right = (p.a < 0) === pos ? inside : outside;
  const wrong = right === inside ? outside : inside;
  return { ask: `Where is f(x) ${pos ? 'positive' : 'negative'}?`, prompt: 'Use the graph of f(x).', fig: parabolaSVG(p),
    choices: [right, wrong, `x &gt; ${num(p.h)}`, `x &lt; ${num(p.h)}`], answer: 0,
    tell: `${pos ? 'positive = above' : 'negative = below'} the x-axis. Read the x-values where the graph is ${pos ? 'above' : 'below'} it: ${right}.` };
} };
T.psym = { book: 'graph', make(rand) {
  const p = parabola(rand);
  return { ask: 'Name the line of symmetry', prompt: 'Use the graph of f(x).', fig: parabolaSVG(p),
    choices: [`x = ${num(p.h)}`, `y = ${num(p.h)}`, `x = ${num(p.k)}`, `y = ${num(p.k)}`], answer: 0,
    tell: `the line of symmetry is the VERTICAL line through the vertex ${pt(p.h, p.k)}: x = ${num(p.h)}. Vertical lines are "x = …".` };
} };
T.pend = { book: 'graph', make(rand) {
  const p = parabola(rand);
  const d = p.a < 0 ? `${M}∞` : '+∞';
  const e = p.a < 0 ? '+∞' : `${M}∞`;
  const say = (l, r) => `As x → ${M}∞, f(x) → ${l}; as x → +∞, f(x) → ${r}`;
  return { ask: 'Describe the end behavior', prompt: 'Use the graph of f(x).', fig: parabolaSVG(p),
    choices: [say(d, d), say(e, e), say(d, e), say(e, d)], answer: 0,
    tell: `follow both arrows: this parabola opens ${p.a < 0 ? 'down, so both ends go to −∞' : 'up, so both ends go to +∞'}.` };
} };
T.pvertex = { book: 'graph', make(rand) {
  const p = parabola(rand);
  const kind = p.a < 0 ? 'maximum' : 'minimum';
  const other = p.a < 0 ? 'minimum' : 'maximum';
  return { ask: 'The vertex is a…', prompt: 'Use the graph of f(x).', fig: parabolaSVG(p),
    choices: [`relative ${kind} at ${pt(p.h, p.k)}`, `relative ${other} at ${pt(p.h, p.k)}`, `relative ${kind} at ${pt(p.k, p.h)}`, `relative ${other} at ${pt(p.k, p.h)}`], answer: 0,
    tell: `the parabola opens ${p.a < 0 ? 'down, so the vertex is the highest point nearby' : 'up, so the vertex is the lowest point nearby'}: a relative ${kind} at ${pt(p.h, p.k)} (x first).` };
} };
T.gincdec = { book: 'graph', make(rand) {
  const z = zigzag(rand);
  const [[x0], [a], [b], [x3]] = z.pts;
  const inc = z.up ? `${between(x0, a)} and ${between(b, x3)}` : between(a, b);
  const dec = z.up ? between(a, b) : `${between(x0, a)} and ${between(b, x3)}`;
  const wantInc = rand() < 0.5;
  const right = wantInc ? inc : dec;
  const ys = z.pts.map(([, y]) => y);
  return { ask: `Where is g(x) ${wantInc ? 'increasing' : 'decreasing'}?`, prompt: 'Use the graph of g(x). Read left to right.', fig: zigzagSVG(z),
    choices: [right, wantInc ? dec : inc, `${between(Math.min(...ys), Math.max(...ys))}`, `${between(x0, x3)}`], answer: 0,
    tell: `read left to right: ${wantInc ? 'increasing = going up' : 'decreasing = going down'}. Give the x-values: ${right}.` };
} };
T.gextrema = { book: 'graph', make(rand) {
  const z = zigzag(rand);
  const [, A, B, E] = z.pts;
  const max = z.up ? A : B; const min = z.up ? B : A;
  const wantMax = rand() < 0.5;
  const right = wantMax ? max : min;
  return { ask: `Name the relative ${wantMax ? 'maximum' : 'minimum'} of g`, prompt: 'Use the graph of g(x).', fig: zigzagSVG(z),
    choices: [pt(...right), pt(...(wantMax ? min : max)), pt(right[1], right[0]), pt(...E)], answer: 0,
    tell: `a relative ${wantMax ? 'maximum is a peak — higher' : 'minimum is a valley — lower'} than the points right around it: ${pt(...right)}. An endpoint is not a turning point.` };
} };

T.solve = { book: 'act', make(rand) {
  for (;;) {
    const a = pick(rand, [2, 3]); const b = int(rand, 2, 7); const c = int(rand, -6, 9);
    // a(x − b) = x + c  →  (a − 1)x = ab + c
    const n = a * b + c;
    if (n % (a - 1)) continue;
    const x = n / (a - 1);
    const wrongs = [(a * b - c) / (a - 1), (b + c) / (a - 1), (-a * b + c) / (a - 1)].filter((w) => Number.isInteger(w) && w !== x);
    const choices = [x, ...new Set(wrongs)];
    while (choices.length < 4) { const w = x + pick(rand, [-3, -2, 2, 3, 5]); if (!choices.includes(w)) choices.push(w); }
    return { ask: 'Solve for x', prompt: `${a}(x ${M} ${b}) = x${signed(c)}`, choices: choices.slice(0, 4).map(num), answer: 0,
      tell: `distribute: ${a}x ${M} ${a * b} = x${signed(c)}. Subtract x: ${a - 1 === 1 ? '' : a - 1}x ${M} ${a * b} = ${num(c)}. Add ${a * b}: ${a - 1 === 1 ? 'x' : `${a - 1}x`} = ${num(n)}${a - 1 === 1 ? '' : `, so x = ${num(x)}`}.` };
  }
} };
T.equiv = { book: 'act', make(rand) {
  const p = int(rand, 2, 7); const q = int(rand, 2, 6); const r = pick(rand, [2, 3, 4, 5, -2, -3]);
  // p(x − q) + r x  =  (p + r)x − pq
  const right = `${coef(p + r)} ${M} ${p * q}`;
  const choices = [right, `${coef(p + r)} ${M} ${q}`, `${coef(p - r)} ${M} ${p * q}`, `${coef(p + r)} + ${p * q}`];
  if (new Set(choices).size < 4) choices[2] = `${coef(p)} ${M} ${p * q + r}`;
  return { ask: 'Which is equivalent?', prompt: `${p}(x ${M} ${q})${r < 0 ? ` ${M} ${-r}x` : ` + ${r}x`}`, choices, answer: 0,
    tell: `distribute to BOTH terms: ${p}x ${M} ${p * q}, then combine x-terms: ${p}x ${r < 0 ? M : '+'} ${Math.abs(r)}x = ${coef(p + r)}.` };
} };

module.exports = makeBank(BOOKS, T);
