/**
 * Algebra 2 · Unit 3 Review — Function Graphs. Built from the teacher's unit packet ("Unit 3:
 * Function Graphs / Properties of Functions": Lesson 1 Parent Function Characteristics, Lessons
 * 2–4 Inverses of Functions (graphs, linear, non-linear), Lesson 5 Domain and Range & Features of
 * Graphs, and the three quiz reviews).
 *
 * The packet's names and notation are kept: the parent functions are the Identity, Constant,
 * Square, Square Root, Cubic, Cube Root, Absolute Value, Exponential and Reciprocal Functions, and
 * what is tracked for each is Even / Odd / Neither and One-to-one; even is f(−x) = f(x), odd is
 * f(−x) = −f(x) ("all signs are switched"); an inverse switches x and y, reflects over the line
 * y = x, is written f⁻¹(x), and is a function only when the original is one-to-one; two functions
 * are inverses if and only if f(g(x)) and g(f(x)) BOTH equal x (TWO compositions, YES / NO);
 * inverses are keyed as one branch with no ± and no restricted domain (the inverse of (x − 5)² is
 * √x + 5); domain and range in interval notation or set-builder notation, infinity always open;
 * absolute and relative maximum / minimum as ordered pairs (an absolute one CAN be an end point, a
 * relative one CANNOT, and infinity is NOT an absolute maximum); a maximum VALUE is the y-value.
 *
 * Not in the packet, so not here: end behavior, asymptotes, transformations of parent functions.
 */
const { M, num, int, pick, sample, frac, makeBank, mc } = require('../prep/kit');
const { sup, nz, term, co, lin, pt, fr, plane, table, poly, zig, zigFig, INK2 } = require('./alg2Kit');

const BOOKS = {
  all: { name: 'Whole Unit', ch: 'Unit 3', blurb: 'Every lesson, mixed — parent functions, inverses, domain and range, features of graphs.' },
  l1: { name: 'Parent Functions', ch: '3.1', blurb: 'Name each parent function, its equation and key points; even, odd or neither; one-to-one.' },
  l2: { name: 'Inverses: Graphs', ch: '3.2', blurb: 'Switch x and y, reflect over y = x, and when the inverse is a function.' },
  l3: { name: 'Inverses: Linear', ch: '3.3', blurb: 'Find a linear inverse, its slope and intercepts, and prove it with composition.' },
  l4: { name: 'Inverses: Non-Linear', ch: '3.4', blurb: 'Undo cubes, squares and roots in the right order; two compositions; YES or NO.' },
  l5: { name: 'Domain, Range & Features', ch: '3.5', blurb: 'Interval and set-builder notation, absolute and relative extrema, increasing, positive and negative.' },
};

const INF = '∞'; const NINF = `${M}∞`; const R = 'ℝ';
const rad = (s, n = 2) => `${n === 3 ? '∛' : '√'}${/^[a-z]$/.test(s) ? s : `(${s})`}`;
const inv = (name) => `${name}${sup(`${M}1`)}`;

const PARENTS = [
  { key: 'identity', name: 'Identity Function', eq: 'x', f: (x) => x, parity: 'Odd', one: true },
  { key: 'constant', name: 'Constant Function', eq: null, f: () => 3, parity: 'Even', one: false },
  { key: 'square', name: 'Square Function', eq: `x${sup(2)}`, f: (x) => x * x, parity: 'Even', one: false },
  { key: 'sqrt', name: 'Square Root Function', eq: '√x', f: (x) => Math.sqrt(x), from: 0, parity: 'Neither', one: true },
  { key: 'cubic', name: 'Cubic Function', eq: `x${sup(3)}`, f: (x) => x ** 3, parity: 'Odd', one: true },
  { key: 'cbrt', name: 'Cube Root Function', eq: '∛x', f: (x) => Math.cbrt(x), parity: 'Odd', one: true },
  { key: 'abs', name: 'Absolute Value Function', eq: '|x|', f: (x) => Math.abs(x), parity: 'Even', one: false },
  { key: 'exp', name: 'Exponential Function', eq: `2${sup('x')}`, f: (x) => 2 ** x, parity: 'Neither', one: true },
  { key: 'recip', name: 'Reciprocal Function', eq: fr(1, 'x'), f: (x) => 1 / x, parity: 'Odd', one: true },
];
const WITH_EQ = PARENTS.filter((p) => p.eq);
function parentFig(p) {
  const P = plane(5, 28);
  const body = p.key === 'recip' ? P.curve(p.f, { from: -5, to: -0.05, step: 0.05 }) + P.curve(p.f, { from: 0.05, to: 5, step: 0.05 })
    : P.curve(p.f, { from: p.from != null ? p.from : -5, arrows: p.from != null ? 'end' : 'both', step: 0.05 });
  return P.svg(`${body}${p.from != null ? P.dot(0, 0) : ''}`, 'graph of a parent function');
}

const T = {};

// ---------------------------------------------------------------- 3.1 parent functions

T.nameTheParent = { book: 'l1', make(rand) {
  const p = pick(rand, PARENTS);
  return { ask: 'Name the parent function', prompt: 'Use the graph.', fig: parentFig(p), ...mc(rand, p.name, PARENTS.filter((q) => q !== p).map((q) => q.name)),
    tell: p.eq ? `this is the ${p.name}, f(x) = ${p.eq}.` : 'a flat line: every input gives the same output — the Constant Function.' };
} };

T.equationOfTheParent = { book: 'l1', make(rand) {
  const p = pick(rand, WITH_EQ);
  return { ask: 'Write the equation for the parent function', prompt: 'Use the graph. f(x) = ?', fig: parentFig(p), ...mc(rand, p.eq, WITH_EQ.filter((q) => q !== p).map((q) => q.eq)),
    tell: `the ${p.name}: f(x) = ${p.eq}.` };
} };

T.nameToEquation = { book: 'l1', make(rand) {
  const p = pick(rand, WITH_EQ);
  if (rand() < 0.5) return { ask: `Which equation is the ${p.name}?`, prompt: 'f(x) = ?', ...mc(rand, p.eq, WITH_EQ.filter((q) => q !== p).map((q) => q.eq)), tell: `${p.name}: f(x) = ${p.eq}.` };
  return { ask: 'Name the parent function', prompt: `f(x) = ${p.eq}`, ...mc(rand, p.name, WITH_EQ.filter((q) => q !== p).map((q) => q.name)), tell: `f(x) = ${p.eq} is the ${p.name}.` };
} };

T.parentKeyPoint = { book: 'l1', make(rand) {
  const rows = [['square', [-3, -2, -1, 2, 3, 4]], ['sqrt', [0, 1, 4, 9, 16]], ['cubic', [-2, -1, 1, 2, 3]], ['cbrt', [-8, -1, 1, 8, 27]], ['abs', [-7, -4, -2, 3, 5]], ['exp', [0, 1, 2, 3, 4]], ['identity', [-6, -2, 4, 9]]];
  const [key, xs] = pick(rand, rows); const p = PARENTS.find((q) => q.key === key); const x0 = pick(rand, xs); const y = Math.round(p.f(x0));
  return { ask: `A key point of the ${p.name}: what is f(${num(x0)})?`, prompt: `f(x) = ${p.eq}`, typed: y, neg: true, tell: `f(${num(x0)}) = ${num(y)}, so (${num(x0)}, ${num(y)}) is on the graph.` };
} };

T.evenOddRule = { book: 'l1', make(rand) {
  const rows = [['Even', 'f(−x) = f(x)'], ['Odd', 'f(−x) = −f(x)'], ['Even', 'The graph is symmetric about the y-axis.'], ['Odd', 'The graph is symmetric about the origin.'], ['Even', 'Plugging in −x gives exactly the same function back.'], ['Odd', 'Plugging in −x switches ALL the signs.']];
  const [ans, text] = pick(rand, rows);
  return { ask: 'Even, odd, or neither?', prompt: text, ...mc(rand, ans, ['Even', 'Odd', 'Neither'].filter((a) => a !== ans)),
    tell: ans === 'Even' ? 'even: symmetric about the y-axis, f(−x) = f(x).' : 'odd: symmetric about the origin, f(−x) = −f(x) — all signs are switched.' };
} };

/** A polynomial that is even (all even exponents), odd (all odd), or neither; `kind` says which. */
function parityPoly(rand, kind) {
  const exps = kind === 'Even' ? pick(rand, [[4, 2, 0], [2, 0], [4, 2], [6, 2, 0]]) : kind === 'Odd' ? pick(rand, [[3, 1], [5, 3], [5, 3, 1], [5, 1]]) : pick(rand, [[3, 2, 0], [3, 1, 0], [4, 1, 0], [3, 2, 1], [2, 1], [4, 3, 0]]);
  return exps.map((e) => [nz(rand, -7, 7), e]);
}

T.evenOddEquation = { book: 'l1', make(rand) {
  const kind = pick(rand, ['Even', 'Odd', 'Neither']); const terms = parityPoly(rand, kind); const f = pick(rand, ['f', 'g', 'k']);
  const list = terms.map(([, e]) => e).join(', ');
  return { ask: 'Even, odd, or neither?', prompt: `${f}(x) = ${poly(terms)}`, ...mc(rand, kind, ['Even', 'Odd', 'Neither'].filter((a) => a !== kind)),
    tell: kind === 'Even' ? `the exponents are ${list} — all even (a constant counts as x⁰), so f(−x) = f(x).` : kind === 'Odd' ? `the exponents are ${list} — all odd, so f(−x) = −f(x).` : `the exponents are ${list} (a constant counts as x⁰) — not all even and not all odd.` };
} };

T.plugInNegativeX = { book: 'l1', make(rand) {
  const terms = parityPoly(rand, 'Neither'); const f = pick(rand, ['f', 'g', 'h']);
  const flip = (test) => poly(terms.map(([c, e]) => [test(e) ? -c : c, e]));
  return { ask: `Evaluate ${f}(${M}x)`, prompt: `${f}(x) = ${poly(terms)}`, ...mc(rand, flip((e) => e % 2 === 1), [flip(() => true), flip(() => false), flip((e) => e % 2 === 0)]),
    tell: `an odd power of −x is negative, an even power is positive: only the odd-exponent terms change sign. That is neither ${f}(x) nor −${f}(x), so ${f} is neither even nor odd.` };
} };

T.evenOddAlgebra = { book: 'l1', make(rand) {
  const kind = pick(rand, ['Even', 'Odd', 'Neither']); const terms = parityPoly(rand, kind);
  const neg = poly(terms.map(([c, e]) => [e % 2 === 1 ? -c : c, e]));
  return { ask: 'You evaluated f(−x). Is f even, odd, or neither?', prompt: `f(x) = ${poly(terms)}<br>f(${M}x) = ${neg}`, ...mc(rand, kind, ['Even', 'Odd', 'Neither'].filter((a) => a !== kind)),
    tell: kind === 'Even' ? 'f(−x) came out exactly the same as f(x): even.' : kind === 'Odd' ? 'f(−x) is exactly the opposite of f(x) — all signs are switched: odd.' : 'f(−x) is not the same as f(x) and not its exact opposite: neither.' };
} };

T.evenOddParent = { book: 'l1', make(rand) {
  const p = pick(rand, WITH_EQ);
  return { ask: `Is the ${p.name} even, odd, or neither?`, prompt: `f(x) = ${p.eq}`, ...mc(rand, p.parity, ['Even', 'Odd', 'Neither'].filter((a) => a !== p.parity)),
    tell: p.parity === 'Even' ? 'its graph is symmetric about the y-axis.' : p.parity === 'Odd' ? 'its graph is symmetric about the origin.' : 'its graph is not symmetric over the y-axis or the origin.' };
} };

T.oneToOneParent = { book: 'l1', make(rand) {
  const p = pick(rand, PARENTS);
  return { ask: `Is the ${p.name} one-to-one?`, prompt: p.eq ? `f(x) = ${p.eq}` : 'a horizontal line', ...mc(rand, p.one ? 'Yes' : 'No', [p.one ? 'No' : 'Yes']),
    tell: p.one ? 'no y-value repeats: every output comes from only one input.' : 'y-values repeat (two different inputs give the same output), so it is not one-to-one.' };
} };

const SHAPES = [
  ['Even', (x) => x * x - 3], ['Even', (x) => -x * x + 4], ['Even', (x) => Math.abs(x) - 2], ['Even', (x) => -Math.abs(x) + 2], ['Even', (x) => 0.25 * x ** 4 - 3],
  ['Odd', (x) => x ** 3 / 2], ['Odd', (x) => -x], ['Odd', (x) => 2 * x], ['Odd', (x) => x ** 3 - 3 * x], ['Odd', (x) => 2 * Math.cbrt(x)],
  ['Neither', (x) => (x - 2) ** 2 - 1], ['Neither', (x) => x + 2], ['Neither', (x) => x ** 3 + 2], ['Neither', (x) => Math.abs(x - 2) - 1], ['Neither', (x) => 2 ** x - 3],
];

T.evenOddGraph = { book: 'l1', make(rand) {
  const [kind, f] = pick(rand, SHAPES); const P = plane(5, 28);
  return { ask: 'Is the function even, odd, or neither?', prompt: 'Use the graph: look for symmetry.', fig: P.svg(P.curve(f, { step: 0.05 }), 'graph of a function'), ...mc(rand, kind, ['Even', 'Odd', 'Neither'].filter((a) => a !== kind)),
    tell: kind === 'Even' ? 'the left half is the mirror image of the right half: symmetric about the y-axis.' : kind === 'Odd' ? 'turn the page half a turn about the origin and the graph lands on itself: symmetric about the origin.' : 'it is not symmetric over the y-axis or about the origin.' };
} };

// ---------------------------------------------------------------- 3.2 inverses: graphs

T.reflectionLine = { book: 'l2', make(rand) {
  return { ask: 'What line do all inverses reflect over?', prompt: 'the line&hellip;', ...mc(rand, 'y = x', [`y = ${M}x`, 'y = 0 (the x-axis)', 'x = 0 (the y-axis)']), tell: 'the graph of a function and the graph of its inverse are mirror images over y = x.' };
} };

T.inverseHallmark = { book: 'l2', make(rand) {
  const kind = pick(rand, ['switch', 'notation', 'oneToOne']);
  if (kind === 'switch') return { ask: 'What is the hallmark of finding an inverse — what do you do first?', prompt: 'you switch&hellip;', ...mc(rand, 'x and y', ['the signs', 'the slope and the y-intercept', 'the numerator and the denominator']), tell: 'every ordered pair is reversed, so x and y trade places. Then solve for y.' };
  if (kind === 'notation') { const f = pick(rand, ['f', 'g', 'h']); return { ask: `How is the inverse of ${f}(x) written?`, prompt: `the inverse of ${f}`, ...mc(rand, `${inv(f)}(x)`, [`${M}${f}(x)`, `${f}(${M}x)`, fr(1, `${f}(x)`)]), tell: `${inv(f)}(x) — the −1 is inverse notation, not an exponent.` }; }
  return { ask: 'A function must be ___ for its inverse to also be a function.', prompt: 'fill in the blank', ...mc(rand, 'one-to-one', ['even', 'odd', 'linear']), tell: 'if a y-value repeats, the inverse would give one x two different outputs.' };
} };

T.correspondingPoint = { book: 'l2', make(rand) {
  let a; let b;
  for (;;) { a = nz(rand, -9, 9); b = nz(rand, -9, 9); if (Math.abs(a) !== Math.abs(b)) break; }
  const f = pick(rand, ['f', 'g', 'h']);
  return { ask: `The point ${pt(a, b)} is on ${f}(x). What corresponding point is on ${inv(f)}(x)?`, prompt: 'Switch the coordinates.', ...mc(rand, pt(b, a), [pt(-a, -b), pt(a, -b), pt(-b, -a), pt(-a, b)]),
    tell: `an inverse switches x and y in every ordered pair: (${num(a)}, ${num(b)}) becomes (${num(b)}, ${num(a)}).` };
} };

T.inverseOfPoints = { book: 'l2', make(rand) {
  const xs = sample(rand, [-4, -3, -1, 0, 2, 5, 6], 3); const ys = sample(rand, [-2, 1, 3, 7, 9, 12, 17], 3);
  const set = (f) => `{${xs.map((x, i) => pt(...f(x, ys[i]))).join(', ')}}`;
  return { ask: 'Find the inverse of the set of ordered pairs', prompt: set((x, y) => [x, y]), ...mc(rand, set((x, y) => [y, x]), [set((x, y) => [-x, -y]), set((x, y) => [x, -y]), set((x, y) => [-y, -x])]),
    tell: 'reverse each ordered pair — every x and y switch places.' };
} };

const INVERSE_EQS = [
  [`y = x${sup(3)}`, true], [`y = ${M}3x + 7`, true], ['y = √x', true], [`y = ${fr(1, 5)}x + 2`, true], [`f(x) = 10${sup('x')}`, true], [`y = ${M}6x${sup(3)} + 1`, true], ['y = ∛x', true],
  [`y = 2x${sup(2)} ${M} 1`, false], [`y = ${M}6`, false], [`y = x${sup(4)}`, false], ['y = |x|', false], ['y = 2', false], [`y = 3x${sup(2)}`, false], [`y = ${M}x${sup(2)} + 4`, false],
];
const WHY_FN = ['Yes — the function is one-to-one', 'No — the function is not one-to-one'];

T.inverseAFunctionEquation = { book: 'l2', make(rand) {
  const [eq, yes] = pick(rand, INVERSE_EQS);
  return { ask: 'Will the inverse be a function?', prompt: eq, ...mc(rand, yes ? WHY_FN[0] : WHY_FN[1], [yes ? WHY_FN[1] : WHY_FN[0]]),
    tell: yes ? 'no y-value repeats, so switching x and y still gives one output for each input.' : 'a y-value repeats (two different x-values share it), so after switching, one input would have two outputs.' };
} };

T.inverseAFunctionGraph = { book: 'l2', make(rand) {
  const P = plane(6, 24); const k = int(rand, -2, 2); const h = int(rand, -2, 2);
  const shapes = [
    [true, P.line(pick(rand, [2, -2, 0.5, -1]), k)], [true, P.curve((x) => (x - h) ** 3 / 2 + k, { step: 0.05 })], [true, P.curve((x) => Math.sqrt(x - h) + k, { from: h, arrows: 'end', step: 0.05 }) + P.dot(h, k)],
    [false, P.curve((x) => Math.abs(x - h) + k - 2, { step: 0.5 })], [false, P.curve((x) => (x - h) ** 2 + k - 3, { step: 0.05 })], [false, P.curve((x) => -((x - h) ** 2) + k + 3, { step: 0.05 })], [false, P.line(0, k || 3)],
    [false, P.path([[-6, 1], [-2, 1], [0, -3], [4, 1], [6, 1]], { arrows: 'both' })],
  ];
  const [yes, body] = pick(rand, shapes);
  return { ask: 'Will the inverse of this graph be a function?', prompt: 'Use the graph.', fig: P.svg(body, 'graph of a relation'), ...mc(rand, yes ? WHY_FN[0] : WHY_FN[1], [yes ? WHY_FN[1] : WHY_FN[0]]),
    tell: yes ? 'no horizontal line hits the graph twice, so it is one-to-one and its inverse is a function.' : 'a horizontal line hits the graph more than once, so y-values repeat: not one-to-one.' };
} };

T.areTheyInverses = { book: 'l2', make(rand) {
  const m = pick(rand, [2, 3]); const b = m * pick(rand, [-2, -1, 1, 2]); const kind = pick(rand, ['inverse', 'inverse', 'x', 'y']);
  const P = plane(6, 24);
  const [m2, b2] = kind === 'inverse' ? [1 / m, -b / m] : kind === 'x' ? [-m, -b] : [-m, b];
  const dashed = `<line x1="${P.X(-6)}" y1="${P.Y(-6)}" x2="${P.X(6)}" y2="${P.Y(6)}" stroke="#7b8a90" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  const C = { inverse: 'Yes — they reflect over the line y = x', x: 'No — they reflect over the x-axis', y: 'No — they reflect over the y-axis' };
  return { ask: 'Are the two graphs inverses of each other?', prompt: 'Use the graph. The dotted line is y = x.', fig: P.svg(`${dashed}${P.line(m, b)}${P.line(m2, b2, { color: INK2 })}`, 'two lines and the line y = x'),
    ...mc(rand, C[kind], Object.values(C).filter((c) => c !== C[kind])),
    tell: kind === 'inverse' ? `each point on one line is a point on the other with its coordinates switched — (0, ${num(b)}) and (${num(b)}, 0), for example.` : `inverses mirror each other over y = x. These mirror each other over the ${kind}-axis instead.` };
} };

// ---------------------------------------------------------------- 3.3 inverses: linear

T.linearInverse = { book: 'l3', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 7, -2, -3, -7]); const b = nz(rand, -9, 9); const f = pick(rand, ['f', 'g', 'h']);
  const over = (top) => fr(top, num(a));
  return { ask: `Find ${inv(f)}(x)`, prompt: `${f}(x) = ${lin([[a, 'x']], b)}`, ...mc(rand, over(`x${term(-b)}`), [over(`x${term(b)}`), `${over('x')}${term(-b)}`, lin([[a, 'x']], -b), lin([[-a, 'x']], -b)]),
    tell: `switch x and y: x = ${lin([[a, 'y']], b)}. Solve for y: ${b < 0 ? 'add' : 'subtract'} ${Math.abs(b)} first, THEN divide all of it by ${num(a)}.` };
} };

T.inverseSteps = { book: 'l3', make(rand) {
  return { ask: 'To find an inverse algebraically, switch the x and y variables. Then&hellip;', prompt: 'the next step', ...mc(rand, 'solve the equation for y', ['solve the equation for x', 'change all the signs', 'take the reciprocal of each term']),
    tell: 'switch x and y, then solve for y — that y is the inverse.' };
} };

T.inverseSlope = { book: 'l3', make(rand) {
  if (rand() < 0.3) return { ask: 'Linear inverses have slopes that are ___ of each other.', prompt: 'fill in the blank', ...mc(rand, 'reciprocals', ['opposites', 'equal', 'opposite reciprocals']), tell: 'rise and run trade places when x and y switch: slope 3/2 becomes 2/3. (Opposite reciprocals are perpendicular lines.)' };
  const [p, q] = pick(rand, [[2, 3], [-2, 3], [3, 2], [-3, 2], [1, 5], [-1, 5], [3, 4], [-4, 3], [5, 2], [3, 1], [-4, 1]]); const b = nz(rand, -8, 8);
  const mx = q === 1 ? co(p) : `${p < 0 ? M : ''}${fr(Math.abs(p), q)}x`;
  return { ask: `What is the slope of ${inv('f')}(x)?`, prompt: `f(x) = ${mx}${term(b)}`, ...mc(rand, frac(q, p), [frac(p, q), frac(-q, p), frac(-p, q)]),
    tell: `the slopes of linear inverses are reciprocals: ${frac(p, q)} becomes ${frac(q, p)}. The sign does not change.` };
} };

T.inverseIntercepts = { book: 'l3', make(rand) {
  let xi; let yi;
  for (;;) { xi = nz(rand, -9, 9); yi = nz(rand, -9, 9); if (Math.abs(xi) !== Math.abs(yi)) break; }
  const wantY = rand() < 0.5;
  return { ask: `f has y-intercept ${pt(0, yi)} and x-intercept ${pt(xi, 0)}. What is the ${wantY ? 'y' : 'x'}-intercept of ${inv('f')}?`, prompt: 'All the ordered pairs switch — including the intercepts!',
    ...mc(rand, wantY ? pt(0, xi) : pt(yi, 0), wantY ? [pt(xi, 0), pt(0, yi), pt(yi, 0)] : [pt(0, yi), pt(xi, 0), pt(0, xi)]),
    tell: wantY ? `f's x-intercept (${num(xi)}, 0) switches to (0, ${num(xi)}), which is on the y-axis.` : `f's y-intercept (0, ${num(yi)}) switches to (${num(yi)}, 0), which is on the x-axis.` };
} };

T.inverseFromTable = { book: 'l3', make(rand) {
  const xs = sample(rand, [-10, -4, -2, 0, 3, 5, 8], 4).sort((x, y) => x - y); const m = pick(rand, [3, 4, 6, -5]); const b = nz(rand, -15, 15);
  const ys = xs.map((x) => m * x + b); const i = int(rand, 0, 3);
  if (xs.includes(ys[i])) return T.inverseFromTable.make(rand);
  return { ask: `Use the table of f to find ${inv('f')}(${num(ys[i])})`, prompt: 'Use the table.', fig: table('x', xs, 'f(x)', ys), typed: xs[i], neg: true,
    tell: `the inverse switches the rows: ${num(ys[i])} is an OUTPUT of f, and the input that gave it is ${num(xs[i])}.` };
} };

T.inverseDefinition = { book: 'l3', make(rand) {
  return { ask: 'Two functions f(x) and g(x) are inverses if and only if f(g(x)) and g(f(x)) both equal&hellip;', prompt: 'f(g(x)) = g(f(x)) = ?', ...mc(rand, 'x', ['1', '0', 'f(x)']),
    tell: 'compose a function with its inverse and the output is x — each undoes the other. If the output is anything else, they are not inverses.' };
} };

T.compositionVerdict = { book: 'l3', make(rand) {
  const a = pick(rand, [2, 3, 4, 5]); const b = nz(rand, -8, 8); const c = nz(rand, 2, 9);
  const rows = [['x', 'x', true], ['x', `x${term(c)}`, false], [`${M}x${term(-b)}`, `${fr(c, a)} ${M} x`, false], [co(a * a), 'x', false]];
  const [r1, r2, yes] = pick(rand, rows);
  return { ask: 'You did both compositions. Are the functions inverses?', prompt: `f(g(x)) = ${r1}<br>g(f(x)) = ${r2}`, ...mc(rand, yes ? 'YES' : 'NO', [yes ? 'NO' : 'YES']),
    tell: yes ? 'both compositions equal x.' : 'BOTH compositions have to equal x. One that does not is enough to say NO.' };
} };

T.composeLinearPair = { book: 'l3', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 10]); const b = nz(rand, -9, 9); const real = rand() < 0.5;
  // g undoes f when it subtracts b before dividing; the near miss ADDS b
  const c = real ? -b : b; const out = `x${term(b + c)}`;
  const C = ['YES — f(g(x)) = x', `NO — f(g(x)) = x${term(2 * b)}`, `NO — f(g(x)) = ${co(a * a)}`, `NO — f(g(x)) = ${fr('x', a * a)}`];
  return { ask: 'Use composition: are the functions inverses?', prompt: `f(x) = ${lin([[a, 'x']], b)}<br>g(x) = ${fr(`x${term(c)}`, a)}`, ...mc(rand, real ? C[0] : C[1], C.filter((x) => x !== (real ? C[0] : C[1]))),
    tell: `f(g(x)) = ${a}·${fr(`x${term(c)}`, a)}${term(b)} = x${term(c)}${term(b)} = ${out}. ${real ? 'It equals x (and g(f(x)) does too).' : 'That is not x, so they are not inverses.'}` };
} };

// ---------------------------------------------------------------- 3.4 inverses: non-linear

T.inverseOperation = { book: 'l4', make(rand) {
  const k = int(rand, 2, 11);
  const rows = [['cubing', 'taking the cube root', ['dividing by 3', 'squaring', 'taking the square root']], ['taking the cube root', 'cubing', ['multiplying by 3', 'squaring', 'dividing by 3']], ['squaring', 'taking the square root', ['dividing by 2', 'cubing', 'multiplying by 2']],
    [`adding ${k}`, `subtracting ${k}`, [`dividing by ${k}`, `multiplying by ${k}`, `adding ${k}`]], [`multiplying by ${k}`, `dividing by ${k}`, [`subtracting ${k}`, `multiplying by ${M}${k}`, `adding ${k}`]]];
  const [op, undo, wrongs] = pick(rand, rows);
  return { ask: 'Finding an inverse means undoing each operation. What undoes&hellip;', prompt: op, ...mc(rand, undo, wrongs), tell: `${undo} undoes ${op}.` };
} };

T.nonLinearInverse = { book: 'l4', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, 7]); const b = int(rand, 1, 9); const c = pick(rand, [2, 3, 5, 9, 11]); const f = pick(rand, ['f', 'g', 'h', 'p']);
  const x3 = `x${sup(3)}`; const x2 = `x${sup(2)}`;
  const forms = [
    () => [`${a}${x3} + ${b}`, rad(fr(`x ${M} ${b}`, a), 3), [rad(fr(`x + ${b}`, a), 3), fr(`∛x ${M} ${b}`, a), `(${fr(`x ${M} ${b}`, a)})${sup(3)}`], `switch: x = ${a}y³ + ${b}. Subtract ${b}, divide by ${a}, THEN take the cube root of all of it.`],
    () => [fr(`${x3} + ${b}`, c), rad(`${c}x ${M} ${b}`, 3), [rad(`${c}x + ${b}`, 3), `${rad(`${c}x`, 3)} ${M} ${b}`, `(${c}x ${M} ${b})${sup(3)}`], `switch: x = (y³ + ${b})/${c}. Multiply by ${c}, subtract ${b}, THEN take the cube root.`],
    () => [`(x ${M} ${b})${sup(2)}`, `√x + ${b}`, [`√x ${M} ${b}`, rad(`x + ${b}`), `${x2} + ${b}`], `switch: x = (y − ${b})². Take the square root first, THEN add ${b}.`],
    () => [`${x2} ${M} ${b}`, rad(`x + ${b}`), [rad(`x ${M} ${b}`), `√x + ${b}`, `${x2} + ${b}`], `switch: x = y² − ${b}. Add ${b} first, THEN take the square root of all of it.`],
    () => [fr(rad(`${a}x + ${b}`), c), fr(`${c * c}${x2} ${M} ${b}`, a), [fr(`${c}${x2} ${M} ${b}`, a), fr(`${c * c}${x2} + ${b}`, a), `${fr(`${c * c}${x2}`, a)} ${M} ${b}`], `switch: x = √(${a}y + ${b})/${c}. Multiply by ${c}, square BOTH factors (${c}x)² = ${c * c}x², subtract ${b}, divide by ${a}.`],
    () => [rad(`${a}x + ${b}`, 3), fr(`${x3} ${M} ${b}`, a), [fr(`${x3} + ${b}`, a), `${fr(x3, a)} ${M} ${b}`, fr(`(x ${M} ${b})${sup(3)}`, a)], `switch: x = ∛(${a}y + ${b}). Cube both sides, subtract ${b}, divide by ${a}.`],
    () => ['∛x', x3, ['3x', fr('x', 3), `${M}∛x`], 'switch: x = ∛y. Cubing undoes the cube root: y = x³.'],
  ];
  const [expr, right, wrongs, why] = pick(rand, forms)();
  return { ask: `Find ${inv(f)}(x)`, prompt: `${f}(x) = ${expr}`, ...mc(rand, right, wrongs), tell: `${why} (One branch — no ± needed in this unit.)` };
} };

T.twoCompositions = { book: 'l4', make(rand) {
  return { ask: 'To fully verify that f and g are inverses, how many compositions must you do?', prompt: 'using composition', ...mc(rand, 'TWO — f(g(x)) and g(f(x))', ['one — f(g(x)) is enough', 'none — just compare their slopes', 'three']),
    tell: 'you must do TWO compositions, and both must equal x. (Non-linear functions don’t have slopes, so that check is not available.)' };
} };

T.composeNonLinearPair = { book: 'l4', make(rand) {
  const c = int(rand, 1, 9); const real = rand() < 0.5; const kind = pick(rand, ['square', 'cube', 'shift']);
  let fDef; let gDef; let out; let work;
  if (kind === 'shift') {
    // f(x) = ∛x − c against g(x) = (x + c)³ (inverse) or (x − c)³ (near miss)
    fDef = `∛x ${M} ${c}`; gDef = `(x ${real ? '+' : M} ${c})${sup(3)}`; out = real ? 'x' : `x ${M} ${2 * c}`;
    work = `f(g(x)) = ∛((x ${real ? '+' : M} ${c})³) − ${c} = x ${real ? '+' : M} ${c} − ${c} = ${out}`;
  } else {
    const n = kind === 'square' ? 2 : 3; const r = n === 2 ? '√' : '∛';
    fDef = `x${sup(n)} + ${c}`; gDef = `${r}(x ${real ? M : '+'} ${c})`; out = real ? 'x' : `x + ${2 * c}`;
    work = `f(g(x)) = (${r}(x ${real ? M : '+'} ${c}))${n === 2 ? '²' : '³'} + ${c} = x ${real ? M : '+'} ${c} + ${c} = ${out}`;
  }
  const C = ['YES — f(g(x)) = x', `NO — f(g(x)) = ${kind === 'shift' ? `x ${M} ${2 * c}` : `x + ${2 * c}`}`, `NO — f(g(x)) = ${kind === 'shift' ? `x + ${2 * c}` : `x ${M} ${2 * c}`}`];
  return { ask: 'Use composition: are the functions inverses?', prompt: `f(x) = ${fDef}<br>g(x) = ${gDef}`, ...mc(rand, real ? C[0] : C[1], C.filter((x) => x !== (real ? C[0] : C[1]))),
    tell: `${work}. ${real ? 'It equals x (and so does g(f(x))).' : 'If the output is anything else than x, the two functions are not inverses.'}` };
} };

T.stepsToSimplify = { book: 'l4', make(rand) {
  const a = pick(rand, [2, 3, 5]); const b = int(rand, 1, 9); const kind = pick(rand, ['A', 'B', 'C']);
  let expr; let first; let wrongs; let why;
  if (kind === 'A') { expr = `${a}(${rad(fr(`x ${M} ${b}`, a), 3)})${sup(3)} + ${b}`; first = 'the cube undoes the cube root'; wrongs = [`the ${M} ${b} and the + ${b} undo each other`, `the ×${a} and the ÷${a} undo each other`]; why = `1. the cube undoes the cube root; 2. the ${a} cancels the ÷${a}; 3. −${b} + ${b}.`; }
  else if (kind === 'B') { expr = rad(`(x${sup(2)} + ${b}) ${M} ${b}`); first = `the + ${b} and the ${M} ${b} undo each other`; wrongs = ['the square root undoes the square', `take the square root of ${b}`]; why = `1. inside the radical, +${b} − ${b} leaves x²; 2. the square root undoes the square.`; }
  else { expr = `(${rad('x', 3)} ${M} ${b} + ${b})${sup(3)}`; first = `the ${M} ${b} and the + ${b} undo each other`; wrongs = ['the cube undoes the cube root', `cube the ${b}`]; why = `1. inside the parentheses, −${b} + ${b} leaves ∛x; 2. the cube undoes the cube root.`; }
  return { ask: 'Steps to simplify this composition: which step comes FIRST?', prompt: expr, ...mc(rand, first, wrongs), tell: `${why} It simplifies to x.` };
} };

T.whichInverseIsAFunction = { book: 'l4', make(rand) {
  const yes = INVERSE_EQS.filter((r) => r[1]).map((r) => r[0]); const no = INVERSE_EQS.filter((r) => !r[1]).map((r) => r[0]);
  return { ask: 'Which relation has an inverse that will be a function?', prompt: 'Only one of these is one-to-one.', ...mc(rand, pick(rand, yes), sample(rand, no, 3)),
    tell: 'the rest are not one-to-one: a constant, an even power or an absolute value repeats y-values.' };
} };

T.keyPointsSwap = { book: 'l4', make(rand) {
  let a; let b;
  for (;;) { a = nz(rand, -8, 8); b = nz(rand, -8, 8); if (Math.abs(a) !== Math.abs(b)) break; }
  const what = pick(rand, ['The vertex', 'A key point', 'The starting point']);
  return { ask: `${what} of f is ${pt(a, b)}. Which point must be on the graph of ${inv('f')}?`, prompt: 'Have the key points "swapped"?', ...mc(rand, pt(b, a), [pt(-a, -b), pt(a, -b), pt(-b, -a)]),
    tell: `a point (a, b) on the original is (b, a) on the inverse: (${num(b)}, ${num(a)}).` };
} };

// ---------------------------------------------------------------- 3.5 domain, range & features of graphs

T.domainRangeWords = { book: 'l5', make(rand) {
  const rows = [['domain', 'The set of inputs that result in an output is called the ___ of the function.'], ['range', 'The set of outputs of a function is called the ___.'], ['domain', 'Read it from the graph from left to right — think about the x-axis!'], ['range', 'Read it from the graph from bottom to top — think about the y-axis!']];
  const [ans, text] = pick(rand, rows);
  return { ask: 'Domain or range?', prompt: text, ...mc(rand, ans, [ans === 'domain' ? 'range' : 'domain', 'interval of increase', 'absolute maximum']), tell: 'domain = the inputs (x-values, smallest to largest); range = the outputs (y-values, smallest to largest).' };
} };

/** A zig with at most one open end, never at the highest or lowest point. */
function ended(rand) {
  const z = zig(rand); const ends = [z.pts[0], z.pts[3]];
  const can = ends.map((p) => p !== z.hi && p !== z.lo);
  const which = pick(rand, [0, 1, 2]); // left, right, or neither
  const open = [which === 0 && can[0], which === 1 && can[1]];
  return { z, open };
}
const interval = (a, b, openA, openB) => `${openA ? '(' : '['}${num(a)}, ${num(b)}${openB ? ')' : ']'}`;

T.domainOfGraph = { book: 'l5', make(rand) {
  const { z, open } = ended(rand); const [a, b] = [z.xs[0], z.xs[3]]; const [lo, hi] = [z.lo[1], z.hi[1]];
  const right = interval(a, b, open[0], open[1]);
  return { ask: 'State the domain in interval notation', prompt: 'Use the graph. An open circle is not included.', fig: zigFig(z, { open }),
    ...mc(rand, right, [interval(lo, hi, false, false), interval(a, b, !open[0], !open[1]), interval(a, b, !open[0], open[1]), interval(a, b, open[0], !open[1])]),
    tell: `the domain goes from the smallest x-value to the largest: ${num(a)} to ${num(b)}${open[0] || open[1] ? ', with a parenthesis at the open circle' : ', both ends included'}.` };
} };

T.rangeOfGraph = { book: 'l5', make(rand) {
  const { z, open } = ended(rand); const [a, b] = [z.xs[0], z.xs[3]]; const [lo, hi] = [z.lo[1], z.hi[1]];
  const ys = [z.ys[0], z.ys[3]].sort((p, q) => p - q);
  return { ask: 'State the range in interval notation', prompt: 'Use the graph.', fig: zigFig(z, { open }),
    ...mc(rand, interval(lo, hi, false, false), [interval(a, b, false, false), interval(ys[0], ys[1], false, false), interval(lo, hi, true, true), interval(hi, lo, false, false)]),
    tell: `the range goes from the smallest y-value to the largest: the lowest point is at y = ${num(lo)} and the highest at y = ${num(hi)}.` };
} };

/** A parabola with arrows whose vertex and a few lattice points sit inside a ±6 window. */
function arrowParabola(rand) {
  const a = pick(rand, [1, -1]); const h = int(rand, -3, 3); const k = a === 1 ? int(rand, -5, 1) : int(rand, -1, 5);
  const P = plane(6, 24); const f = (x) => a * (x - h) ** 2 + k;
  return { a, h, k, f, fig: P.svg(`${P.curve(f, { step: 0.05 })}${P.dot(h, k)}`, 'graph of a parabola') };
}

T.rangeOfParabola = { book: 'l5', make(rand) {
  const p = arrowParabola(rand); const k = num(p.k); const down = p.a < 0;
  if (rand() < 0.3) return { ask: 'State the domain of the parabola', prompt: 'Use the graph. Look for arrows!', fig: p.fig, ...mc(rand, `(${NINF}, ${INF})`, [down ? `(${NINF}, ${k}]` : `[${k}, ${INF})`, `[${num(p.h)}, ${INF})`, `[${NINF}, ${INF}]`]),
    tell: 'the arrows mean the graph keeps going left and right forever: every x-value is used. Infinity always gets a parenthesis.' };
  const C = [`(${NINF}, ${k}]`, `[${k}, ${INF})`, `(${NINF}, ${k})`, `(${k}, ${INF})`];
  const right = down ? C[0] : C[1];
  return { ask: 'Which represents the range of the quadratic function?', prompt: 'Use the graph.', fig: p.fig, ...mc(rand, right, C.filter((c) => c !== right)),
    tell: `the ${down ? 'highest' : 'lowest'} y-value is ${k}, at the vertex, and it IS reached (a bracket); the arrows carry the graph ${down ? 'down' : 'up'} forever (a parenthesis on infinity).` };
} };

T.rangeSetBuilder = { book: 'l5', make(rand) {
  const p = arrowParabola(rand); const k = num(p.k); const down = p.a < 0;
  const le = '&le;'; const ge = '&ge;';
  const right = `{y | y ${down ? le : ge} ${k}}`;
  return { ask: 'What is the range of the parabola?', prompt: 'Use the graph.', fig: p.fig,
    ...mc(rand, right, [`{y | y ∈ ${R}}`, down ? `(${NINF}, ${k})` : `(${k}, ${INF})`, down ? `[${NINF}, ${k}]` : `[${k}, ${INF}]`, `{y | y ${down ? ge : le} ${k}}`]),
    tell: `the y-values go ${down ? `up to ${k} and no higher` : `down to ${k} and no lower`}: {y | y ${down ? '≤' : '≥'} ${k}}. A bracket on infinity is never right.` };
} };

T.inequalityToInterval = { book: 'l5', make(rand) {
  const k = nz(rand, -9, 9); const k2 = k + int(rand, 2, 9); const kind = pick(rand, ['ge', 'gt', 'le', 'lt', 'both']);
  const le = '&le;'; const ge = '&ge;'; const lt = '&lt;'; const gt = '&gt;';
  const rows = {
    ge: [`x ${ge} ${num(k)}`, `[${num(k)}, ${INF})`, [`(${num(k)}, ${INF})`, `[${num(k)}, ${INF}]`, `(${NINF}, ${num(k)}]`]],
    gt: [`x ${gt} ${num(k)}`, `(${num(k)}, ${INF})`, [`[${num(k)}, ${INF})`, `(${num(k)}, ${INF}]`, `(${NINF}, ${num(k)})`]],
    le: [`x ${le} ${num(k)}`, `(${NINF}, ${num(k)}]`, [`(${NINF}, ${num(k)})`, `[${NINF}, ${num(k)}]`, `[${num(k)}, ${INF})`]],
    lt: [`x ${lt} ${num(k)}`, `(${NINF}, ${num(k)})`, [`(${NINF}, ${num(k)}]`, `[${NINF}, ${num(k)})`, `(${num(k)}, ${INF})`]],
    both: [`${num(k)} ${le} x ${lt} ${num(k2)}`, `[${num(k)}, ${num(k2)})`, [`(${num(k)}, ${num(k2)}]`, `[${num(k)}, ${num(k2)}]`, `(${num(k)}, ${num(k2)})`]],
  };
  const [ineq, right, wrongs] = rows[kind];
  return { ask: 'Write the inequality in interval notation', prompt: ineq, ...mc(rand, right, wrongs),
    tell: 'a bracket [ ] means the number is included (≤ or ≥); a parenthesis ( ) means it is not (&lt; or &gt;). References to ±infinity are always open.' };
} };

T.featureWords = { book: 'l5', make(rand) {
  const rows = [['Absolute Maximum', 'the very highest point on the graph'], ['Absolute Minimum', 'the very lowest point on the graph'], ['Relative Maximum', 'a point that is higher than the points directly beside it on both sides — a peak'], ['Relative Minimum', 'a point that is lower than the points directly beside it on both sides — a valley'], ['Interval of Increase', 'where the graph goes up as you read it from left to right'], ['Interval of Decrease', 'where the graph goes down as you read it from left to right']];
  const [ans, text] = pick(rand, rows);
  return { ask: 'Which term from the word bank fits?', prompt: text, ...mc(rand, ans, rows.map((r) => r[0]).filter((a) => a !== ans)), tell: 'absolute = the very highest / lowest point of the whole graph; relative = a peak or valley compared with the points right beside it.' };
} };

T.endPointRules = { book: 'l5', make(rand) {
  const kind = pick(rand, ['rel', 'abs', 'arrow']);
  if (kind === 'rel') { const w = pick(rand, ['maximum', 'minimum']); return { ask: `Can a RELATIVE ${w} be an end point of the graph?`, prompt: `relative ${w}`, ...mc(rand, 'No — it CANNOT be an end point', ['Yes — it CAN be an end point']), tell: 'a relative maximum or minimum is compared with the points on BOTH sides, and an end point has only one side.' }; }
  if (kind === 'abs') { const w = pick(rand, ['maximum', 'minimum']); return { ask: `Can an ABSOLUTE ${w} be an end point of the graph?`, prompt: `absolute ${w}`, ...mc(rand, 'Yes — it CAN be an end point', ['No — it CANNOT be an end point']), tell: `the absolute ${w} is simply the very ${w === 'maximum' ? 'highest' : 'lowest'} point, wherever it is — even at an end.` }; }
  const up = rand() < 0.5;
  return { ask: `The graph ends in an arrow pointing ${up ? 'up' : 'down'}. What is its absolute ${up ? 'maximum' : 'minimum'}?`, prompt: 'There is an arrow here…', ...mc(rand, 'There is none', [up ? 'infinity' : 'negative infinity', 'the last point you can see', `the ${up ? 'highest peak' : 'lowest valley'}`]),
    tell: `the graph keeps going ${up ? 'up' : 'down'} forever, and infinity is NOT an absolute ${up ? 'maximum' : 'minimum'}.` };
} };

T.extremaOnAGraph = { book: 'l5', make(rand) {
  const z = zig(rand); const [, p1, p2] = z.pts; const peak = z.up ? p1 : p2; const valley = z.up ? p2 : p1;
  const kinds = { 'absolute maximum': z.hi, 'absolute minimum': z.lo, 'relative maximum': peak, 'relative minimum': valley };
  const what = pick(rand, Object.keys(kinds)); const ans = kinds[what];
  if (rand() < 0.25) {
    const max = rand() < 0.5; const [x, y] = max ? z.hi : z.lo;
    return { ask: `What is the ${max ? 'maximum' : 'minimum'} VALUE of the graph?`, prompt: `Use the graph. The ${max ? 'largest' : 'smallest'} y-value.`, fig: zigFig(z), ...mc(rand, num(y), [pt(x, y), num(x), num(max ? z.lo[1] : z.hi[1])].filter((w) => w !== num(y))),
      tell: `the very ${max ? 'highest' : 'lowest'} point is (${num(x)}, ${num(y)}); the ${max ? 'maximum' : 'minimum'} VALUE is its y-value, ${num(y)}.` };
  }
  return { ask: `State the ${what} as an ordered pair`, prompt: 'Use the graph.', fig: zigFig(z), ...mc(rand, pt(...ans), z.pts.filter((p) => p !== ans).map((p) => pt(...p))),
    tell: what.startsWith('absolute') ? `the very ${what.endsWith('maximum') ? 'highest' : 'lowest'} point of the whole graph is ${pt(...ans)} — it CAN be an end point.` : `the ${what.endsWith('maximum') ? 'peak' : 'valley'} is ${pt(...ans)} — a relative ${what.endsWith('maximum') ? 'maximum' : 'minimum'} CANNOT be an end point.` };
} };

T.intervalOfIncrease = { book: 'l5', make(rand) {
  for (;;) {
    const z = zig(rand); const inc = rand() < 0.5;
    const segs = [0, 1, 2].map((i) => ({ rising: z.ys[i + 1] > z.ys[i], x: `(${num(z.xs[i])}, ${num(z.xs[i + 1])})`, y: `(${num(Math.min(z.ys[i], z.ys[i + 1]))}, ${num(Math.max(z.ys[i], z.ys[i + 1]))})` }));
    const good = segs.filter((s) => s.rising === inc); const bad = segs.filter((s) => s.rising !== inc);
    const right = pick(rand, good).x; const wrongs = [pick(rand, bad).x, pick(rand, good).y, pick(rand, bad).y];
    // a wrong choice must not be the other interval of the same kind
    if (new Set([right, ...wrongs]).size < 4 || good.some((s) => wrongs.includes(s.x))) continue;
    return { ask: `State an interval of ${inc ? 'increase' : 'decrease'}, in interval notation`, prompt: 'Use the graph. Read it from left to right.', fig: zigFig(z), ...mc(rand, right, wrongs),
      tell: `the graph goes ${inc ? 'up' : 'down'} between those two x-values. Intervals of increase and decrease are always x-intervals.` };
  }
} };

T.positiveOrNegative = { book: 'l5', make(rand) {
  const a = pick(rand, [1, -1]); const w = pick(rand, [1, 2, 3]); const h = int(rand, -5, 5); const r1 = h - w; const r2 = h + w; const k = -a * w * w;
  const P = plane(10); const f = (x) => a * (x - r1) * (x - r2);
  const lt = '&lt;'; const gt = '&gt;';
  const sign = a === 1 ? lt : gt;
  const ys = [Math.min(k, 0), Math.max(k, 0)];
  return { ask: `On what interval is f(x) ${sign} 0?`, prompt: `Use the graph. Where is the graph ${a === 1 ? 'below' : 'above'} the x-axis?`, fig: P.svg(`${P.curve(f, { step: 0.05 })}${P.dot(r1, 0)}${P.dot(r2, 0)}`, 'graph of f(x)'),
    ...mc(rand, `${num(r1)} ${lt} x ${lt} ${num(r2)}`, [`x ${lt} ${num(r1)} and x ${gt} ${num(r2)}`, `${num(ys[0])} ${lt} y ${lt} ${num(ys[1])}`, a === 1 ? `x ${gt} ${num(h)}` : `x ${lt} ${num(h)}`]),
    tell: `f(x) ${a === 1 ? '&lt; 0 means the graph is BELOW' : '&gt; 0 means the graph is ABOVE'} the x-axis: between the x-intercepts ${num(r1)} and ${num(r2)}.` };
} };

T.domainRangeOfInverse = { book: 'l5', make(rand) {
  let a; let b; let c; let d;
  for (;;) { a = int(rand, -9, 5); b = a + int(rand, 2, 9); c = int(rand, -9, 5); d = c + int(rand, 2, 9); if (a !== c && b !== d && a !== -d && b !== -c) break; }
  const wantDomain = rand() < 0.5;
  const D = interval(a, b, false, false); const Rg = interval(c, d, false, false);
  return { ask: `f has domain ${D} and range ${Rg}. What is the ${wantDomain ? 'domain' : 'range'} of ${inv('f')}?`, prompt: 'What do you notice about the domain and range of inverse functions?',
    ...mc(rand, wantDomain ? Rg : D, [wantDomain ? D : Rg, interval(-b, -a, false, false), interval(-d, -c, false, false)]),
    tell: 'x and y switch, so the domain and range switch too: the domain of the inverse is the range of f, and the range of the inverse is the domain of f.' };
} };

module.exports = makeBank(BOOKS, T);
module.exports._parts = { PARENTS, INVERSE_EQS, parityPoly };
