/**
 * Algebra 2 · Unit 0 Review — Basic Algebra Skills. Built from the teacher's unit packet
 * ("Unit 0 - Basic Algebra Skills Review": Lesson 1 Solving Equations & Inequalities, Lesson 2
 * Graphs of Lines, Inequalities, and Slope, Lesson 3 Exponent Rules, Distributive Property, &
 * Cancellation, Lesson 4 Functions & Function Notation, Lesson 5 Intro to Graphing Calculator
 * Skills).
 *
 * The packet's own words and habits are kept: INVERSE operations; FLIP the inequality sign when you
 * MULTIPLY or DIVIDE by a negative; "no solution" / "infinitely many solutions"; which values are
 * "in the solution set" (the boundary value is always one of the choices); m = SLOPE and
 * b = Y-INTERCEPT; a vertical line's slope is UNDEFINED and a horizontal line's is 0; a "dotted"
 * or "solid" line, shaded up or down; intercepts, maximum and minimum POINTS and turning points as
 * ordered pairs (a maximum VALUE is the y-value alone); intervals of increase written a < x < b,
 * with the y-versions as the wrong choices; the VERTICAL and HORIZONTAL LINE TESTs; exponents
 * written positive; polynomials in standard form (descending); "cancellation" as a question of
 * which step comes first.
 *
 * Quick-fire: one move a play, by hand. Lesson 5 is the calculator lesson, so its plays are about
 * what the calculator shows and which key or window setting gets you there.
 */
const { M, num, int, pick, sample, frac, slopeIntercept, makeBank, mc } = require('../prep/kit');
const { sup, nz, sgn, term, par, co, lin, eqn, pt, quad, fr, plane, table, mono, poly, zig, zigFig } = require('./alg2Kit');

const BOOKS = {
  all: { name: 'Whole Unit', ch: 'Unit 0', blurb: 'Every lesson, mixed — equations and inequalities, lines, exponents and distributing, functions, calculator skills.' },
  l1: { name: 'Equations & Inequalities', ch: '0.1', blurb: 'Inverse operations, big fractions, cross multiplication, no solution and infinitely many, the solution set.' },
  l2: { name: 'Lines, Inequalities & Slope', ch: '0.2', blurb: 'Slope and y-intercept, special lines, dotted or solid, the three forms, intercepts as ordered pairs.' },
  l3: { name: 'Exponents, Distributing & Cancellation', ch: '0.3', blurb: 'The exponent rules, standard form, squaring a binomial, and which step comes first.' },
  l4: { name: 'Functions & Function Notation', ch: '0.4', blurb: 'Function and one-to-one, inputs and outputs, evaluating, the key features of a graph.' },
  l5: { name: 'Graphing Calculator Skills', ch: '0.5', blurb: 'The standard window, the table, key points, points of intersection, rounding to the nearest tenth.' },
};

const LT = '&lt;'; const GT = '&gt;'; const LE = '&le;'; const GE = '&ge;';
const FLIP = { [LT]: GT, [GT]: LT, [LE]: GE, [GE]: LE };
const SYMS = [LT, GT, LE, GE];
const holds = (a, sym, b) => (sym === LT ? a < b : sym === GT ? a > b : sym === LE ? a <= b : a >= b);
const VARS = ['x', 'x', 'x', 'p', 'n', 'r', 'k', 'v'];
const T = {};

// ---------------------------------------------------------------- 0.1 equations & inequalities

T.inverseOps = { book: 'l1', make(rand) {
  const pairs = { addition: 'subtraction', subtraction: 'addition', multiplication: 'division', division: 'multiplication' };
  const op = pick(rand, Object.keys(pairs));
  return { ask: 'To solve an equation you use INVERSE operations. What is the inverse of&hellip;', prompt: op,
    ...mc(rand, pairs[op], Object.keys(pairs).filter((o) => o !== pairs[op] && o !== op).concat('squaring')),
    tell: 'addition & subtraction undo each other; multiplication & division undo each other.' };
} };

T.flipRule = { book: 'l1', make(rand) {
  return { ask: 'Solving an inequality: when must you FLIP the inequality sign?', prompt: 'Flip the sign when you&hellip;',
    ...mc(rand, 'multiply or divide by a negative value', ['add or subtract a negative value', 'multiply or divide by any value', 'never — it works exactly like an equation']),
    tell: 'only multiplying or dividing by a negative reverses the order; adding and subtracting never do.' };
} };

T.flipSolve = { book: 'l1', make(rand) {
  const a = pick(rand, [-6, -5, -4, -3, -2, 2, 3, 4, 5]); const k = nz(rand, -9, 9); const sym = pick(rand, SYMS);
  const v = pick(rand, VARS); const out = a < 0 ? FLIP[sym] : sym;
  const say = (s, n) => `${v} ${s} ${num(n)}`;
  return { ask: 'Solve the inequality', prompt: `${co(a, v)} ${sym} ${num(a * k)}`,
    ...mc(rand, say(out, k), [say(FLIP[out], k), say(out, -k), say(FLIP[out], -k)]),
    tell: `divide both sides by ${num(a)}${a < 0 ? ' — a negative, so the sign FLIPS' : ' — a positive, so the sign stays'}: ${say(out, k)}.` };
} };

T.twoStep = { book: 'l1', make(rand) {
  const a = pick(rand, [-9, -7, -6, -4, -3, -2, 2, 3, 4, 5, 6, 8]); const x0 = nz(rand, -9, 9); const b = nz(rand, -12, 12); const v = pick(rand, VARS);
  return { ask: `Solve for ${v}`, prompt: `${lin([[a, v]], b)} = ${num(a * x0 + b)}`, typed: x0, neg: true,
    tell: `${b < 0 ? 'add' : 'subtract'} ${Math.abs(b)}: ${co(a, v)} = ${num(a * x0)}; then divide by ${num(a)}: ${v} = ${num(x0)}.` };
} };

T.bigFraction = { book: 'l1', make(rand) {
  // isolate the fraction, then move the DENOMINATOR first
  const d = pick(rand, [2, 3, 4, 5, 6, 8]); const c = nz(rand, -6, 6); const a = nz(rand, -9, 9); const v = pick(rand, VARS);
  return { ask: `Solve for ${v}`, prompt: `${fr(`${v}${term(a)}`, d)} = ${num(c)}`, typed: c * d - a, neg: true,
    tell: `start by moving the denominator: multiply both sides by ${d} to get ${v}${term(a)} = ${num(c * d)}; then ${v} = ${num(c * d - a)}.` };
} };

T.bothSides = { book: 'l1', make(rand) {
  const x0 = nz(rand, -8, 8); const a = nz(rand, -9, 9); let c = nz(rand, -9, 9); if (c === a) c = a + 2; if (c === 0) c = a + 3;
  const b = nz(rand, -12, 12); const d = (a - c) * x0 + b;
  if (d === 0) return T.bothSides.make(rand);
  return { ask: 'Solve for x', prompt: `${lin([[a, 'x']], b)} = ${lin([[c, 'x']], d)}`, typed: x0, neg: true,
    tell: `get the x's on one side: ${co(a - c)} = ${num(d - b)}, so x = ${num(x0)}.` };
} };

T.distributeSolve = { book: 'l1', make(rand) {
  const a = pick(rand, [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]); const b = nz(rand, -8, 8); const x0 = nz(rand, -9, 9);
  if (x0 + b === 0) return T.distributeSolve.make(rand);
  return { ask: 'Solve for x', prompt: `${num(a)}(x${term(b)}) = ${num(a * (x0 + b))}`, typed: x0, neg: true,
    tell: `divide both sides by ${num(a)}: x${term(b)} = ${num(x0 + b)}, so x = ${num(x0)}. (Or distribute first: ${lin([[a, 'x']], a * b)} = ${num(a * (x0 + b))}.)` };
} };

T.crossMultiply = { book: 'l1', make(rand) {
  const [p, q, r] = sample(rand, [2, 3, 4, 5, 6, 7, 8, 9], 3); const a = nz(rand, -9, 9); const v = pick(rand, VARS);
  const inner = `${v}${term(a)}`;
  return { ask: 'Use cross multiplication. Which equation do you get?', prompt: `${fr(inner, p)} = ${fr(q, r)}`,
    ...mc(rand, `${r}(${inner}) = ${p * q}`, [`${p}(${inner}) = ${q * r}`, `${r}${inner} = ${p * q}`, `${q}(${inner}) = ${p * r}`]),
    tell: `multiply each numerator by the OTHER denominator: ${r}·(${inner}) = ${p}·${q}. The whole numerator gets multiplied, so it stays in parentheses.` };
} };

T.howManySolutions = { book: 'l1', make(rand) {
  const kinds = ['no solution', 'infinitely many solutions', 'one solution'];
  const kind = pick(rand, kinds);
  const a = pick(rand, [-6, -4, -3, 2, 3, 4, 5]); const b = pick(rand, [1, 1, 2, 3, 8]); const c = nz(rand, -6, 6); const v = pick(rand, VARS);
  const left = `${num(a)}(${lin([[b, v]], c)})`;
  let right; let why;
  if (kind === 'infinitely many solutions') { right = lin([[a * b, v]], a * c); why = `distribute: ${lin([[a * b, v]], a * c)} = ${right} — the two sides are identical, true for every value.`; }
  else if (kind === 'no solution') { let d = nz(rand, -20, 20); while (d === a * c) d = nz(rand, -20, 20); right = `${num(d)} ${sgn(a * b)} ${Math.abs(a * b) === 1 ? '' : Math.abs(a * b)}${v}`; why = `distribute: ${lin([[a * b, v]], a * c)} = ${right}. The ${v} terms cancel and leave ${num(a * c)} = ${num(d)}, which is false.`; }
  else { let e = nz(rand, -9, 9); if (e === a * b) e += 1; if (e === 0) e = a * b + 2; right = lin([[e, v]], nz(rand, -12, 12)); why = `the ${v} terms do not cancel (${num(a * b)}${v} against ${num(e)}${v}), so there is exactly one value that works.`; }
  return { ask: 'How many solutions does the equation have?', prompt: `${left} = ${right}`, ...mc(rand, kind, kinds.filter((k) => k !== kind)), tell: why };
} };

T.solutionSet = { book: 'l1', make(rand) {
  const sym = pick(rand, SYMS); const k = int(rand, -9, 20); const strict = sym === LT || sym === GT; const up = sym === GT || sym === GE;
  const dir = up ? 1 : -1; const d = () => int(rand, 2, 12);
  // the boundary value is always offered: it is in the set only when the sign is ≤ or ≥
  const boundaryRight = !strict && rand() < 0.5;
  const right = boundaryRight ? k : k + dir * d();
  const far = [k - dir * d(), k - dir * (d() + 12), k - dir * (d() + 25)];
  const wrongs = boundaryRight ? far : [k, far[0], far[1]];
  if (!strict && !boundaryRight) return T.solutionSet.make(rand); // with ≤ or ≥ the boundary is itself a right answer
  return { ask: 'Which value is in the solution set?', prompt: `x ${sym} ${num(k)}`, ...mc(rand, num(right), wrongs.map(num)),
    tell: strict ? `${num(right)} ${sym} ${num(k)} is true. ${num(k)} itself is NOT included: the sign has no "or equal to".` : `${num(k)} ${sym} ${num(k)} is true — with "or equal to" the boundary value counts.` };
} };

T.simplestFraction = { book: 'l1', make(rand) {
  let a; let b;
  for (;;) { a = pick(rand, [3, 4, 6, 8, 9, -3, -4, -6]); b = nz(rand, -20, 20); if (b % a !== 0 && Math.abs(b) !== 1 && Math.abs(b) !== Math.abs(a)) break; }
  const v = pick(rand, VARS);
  return { ask: `Solve for ${v}. Leave the answer in simplest fraction form.`, prompt: `${co(a, v)} = ${num(b)}`,
    ...mc(rand, frac(b, a), [frac(a, b), frac(-b, a), num(b - a)]),
    tell: `divide by ${num(a)}: ${v} = ${num(b)}/${par(a)} = ${frac(b, a)} — reduced, and left as a fraction (no decimals).` };
} };

// ---------------------------------------------------------------- 0.2 lines, inequalities & slope

const SLOPES = [[1, 2], [-1, 2], [2, 3], [-2, 3], [3, 4], [-3, 4], [1, 3], [-4, 3], [3, 2], [-3, 5], [2, 1], [-2, 1], [3, 1], [-3, 1], [4, 1], [5, 1]];

T.slopeOrIntercept = { book: 'l2', make(rand) {
  const [p, q] = pick(rand, SLOPES); const b = nz(rand, -9, 11);
  const eq = slopeIntercept(p, q, b);
  if (rand() < 0.5) return { ask: 'In y = mx + b, b is the Y-INTERCEPT. What is b?', prompt: eq, typed: b, neg: true, tell: `the number added on at the end is b: ${num(b)}. The line crosses the y-axis at (0, ${num(b)}).` };
  return { ask: 'In y = mx + b, m is the SLOPE. What is m?', prompt: eq, ...mc(rand, frac(p, q), [num(b), frac(q, p), frac(-p, q), frac(-q, p)]),
    tell: `the number multiplying x is m: ${frac(p, q)}. (${num(b)} is b, the y-intercept.)` };
} };

T.solveForYFirst = { book: 'l2', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, -2, -3]); const m = nz(rand, -5, 5); const b = nz(rand, -6, 6);
  return { ask: 'You may need to solve for y first! What is the slope of the line?', prompt: eqn([[a, 'y'], [-a * m, 'x']], a * b), typed: m, neg: true,
    tell: `${a * m < 0 ? 'subtract' : 'add'} ${Math.abs(a * m)}x, then divide by ${num(a)}: y = ${lin([[m, 'x']], b)}. The slope is ${num(m)}.` };
} };

T.specialLines = { book: 'l2', make(rand) {
  const k = pick(rand, [-9, -7, -6, -4, -3, 2, 3, 4, 5, 7, 9]); const kind = pick(rand, ['slopeV', 'slopeH', 'eqV', 'eqH']);
  if (kind === 'slopeV') return { ask: 'What is the slope of the line?', prompt: `x = ${num(k)}`, ...mc(rand, 'Undefined', ['0', '1', num(k)]), tell: 'x = a number is a VERTICAL line: no run, so the slope is Undefined.' };
  if (kind === 'slopeH') return { ask: 'What is the slope of the line?', prompt: `y = ${num(k)}`, ...mc(rand, '0', ['Undefined', '1', num(k)]), tell: 'y = a number is a HORIZONTAL line: no rise, so the slope is 0.' };
  const other = nz(rand, -6, 6);
  if (kind === 'eqV') return { ask: `Which is the equation of the vertical line through ${pt(k, other)}?`, prompt: 'A vertical line cuts through the x-axis.', ...mc(rand, `x = ${num(k)}`, [`y = ${num(k)}`, `x = ${num(other)}`, `y = ${num(other)}`]), tell: `every point on a vertical line has the same x-value: x = ${num(k)}.` };
  return { ask: `Which is the equation of the horizontal line through ${pt(other, k)}?`, prompt: 'A horizontal line cuts through the y-axis.', ...mc(rand, `y = ${num(k)}`, [`x = ${num(k)}`, `y = ${num(other)}`, `x = ${num(other)}`]), tell: `every point on a horizontal line has the same y-value: y = ${num(k)}.` };
} };

T.dottedOrSolid = { book: 'l2', make(rand) {
  const sym = pick(rand, SYMS); const m = nz(rand, -4, 4); const b = nz(rand, -8, 8);
  const say = (s) => `${s === LT || s === GT ? 'dotted' : 'solid'} line, shade ${s === LT || s === LE ? 'down' : 'up'}`;
  return { ask: 'How do you graph the inequality?', prompt: `y ${sym} ${lin([[m, 'x']], b)}`, ...mc(rand, say(sym), SYMS.filter((s) => s !== sym).map(say)),
    tell: `${sym === LT || sym === GT ? 'no "or equal to", so the line is dotted' : '"or equal to", so the line is solid'}; y is ${sym === LT || sym === LE ? 'less, so shade down' : 'greater, so shade up'}.` };
} };

T.inSolutionSet = { book: 'l2', make(rand) {
  const sym = pick(rand, SYMS); const m = nz(rand, -3, 3); const b = nz(rand, -6, 6); const px = int(rand, -4, 5); const off = pick(rand, [-3, -2, -1, 0, 0, 1, 2, 3]);
  const line = m * px + b; const py = line + off; const yes = holds(py, sym, line);
  return { ask: `Is ${pt(px, py)} in the solution set?`, prompt: `y ${sym} ${lin([[m, 'x']], b)}`, ...mc(rand, yes ? 'Yes' : 'No', [yes ? 'No' : 'Yes']),
    tell: `substitute: ${num(py)} ${sym} ${num(m)}(${num(px)})${term(b)} = ${num(line)} is ${yes ? 'true' : 'false'}${off === 0 ? ` — the point is ON the line, which counts only for ${LE} and ${GE}` : ''}.` };
} };

T.formName = { book: 'l2', make(rand) {
  const names = ['Standard form', 'Slope-Intercept Form', 'Point-Slope Form'];
  const i = int(rand, 0, 2); const m = nz(rand, -5, 5);
  const eq = i === 0 ? eqn([[nz(rand, -6, 6), 'x'], [nz(rand, -6, 6), 'y']], nz(rand, -24, 24)) : i === 1 ? `y = ${lin([[m, 'x']], nz(rand, -11, 11))}` : `y${term(nz(rand, -9, 9))} = ${co(m, `(x${term(nz(rand, -9, 9))})`)}`;
  return { ask: 'The equation is in&hellip;', prompt: eq, ...mc(rand, names[i], names.filter((_, j) => j !== i)),
    tell: i === 0 ? 'x and y on the same side, a number on the other: standard form.' : i === 1 ? 'y = mx + b: slope-intercept form.' : 'y − y₁ = m(x − x₁): point-slope form.' };
} };

T.slopeTwoPoints = { book: 'l2', make(rand) {
  const x1 = int(rand, -11, 9); const y1 = int(rand, -9, 9); const kind = pick(rand, ['h', 'v', 's', 's', 's']);
  let x2; let y2;
  if (kind === 'h') { x2 = x1 + nz(rand, -12, 12); y2 = y1; } else if (kind === 'v') { x2 = x1; y2 = y1 + nz(rand, -12, 12); } else { x2 = x1 + nz(rand, -9, 9); y2 = y1 + nz(rand, -9, 9); }
  const dy = y2 - y1; const dx = x2 - x1;
  const ans = dx === 0 ? 'Undefined' : dy === 0 ? '0' : frac(dy, dx);
  const wrongs = [dx && dy ? frac(dx, dy) : null, dx && dy ? frac(-dy, dx) : frac(nz(rand, 2, 7), 5), '0', 'Undefined', dx && dy ? null : frac(7, 5)].filter((w) => w && w !== ans);
  return { ask: 'What is the slope of the line through the two points?', prompt: `${pt(x1, y1)} and ${pt(x2, y2)}`, ...mc(rand, ans, wrongs),
    tell: `slope = rise/run = (y₂ − y₁)/(x₂ − x₁) = (${num(y2)} − ${par(y1)})/(${num(x2)} − ${par(x1)}) = ${num(dy)}/${num(dx)}${dx === 0 ? ' — you cannot divide by 0: Undefined (a vertical line)' : ` = ${ans}`}.` };
} };

T.interceptPair = { book: 'l2', make(rand) {
  const [a, b] = pick(rand, [[2, 3], [3, 2], [6, 3], [2, 5], [5, 2], [3, 4], [4, 3], [-2, 5], [4, -3], [3, -5]]); const k = pick(rand, [1, 2, -1, 2, 3]);
  const c = a * b * k; const xi = b * k; const yi = a * k; const wantX = rand() < 0.5;
  return { ask: `Find the ${wantX ? 'x' : 'y'}-intercept. Write it as an ordered pair.`, prompt: eqn([[a, 'x'], [b, 'y']], c),
    ...mc(rand, wantX ? pt(xi, 0) : pt(0, yi), wantX ? [pt(0, xi), pt(yi, 0), pt(0, yi)] : [pt(yi, 0), pt(0, xi), pt(xi, 0)]),
    tell: wantX ? `at an x-intercept y = 0: ${co(a)} = ${num(c)}, so x = ${num(xi)} — the point (${num(xi)}, 0).` : `at a y-intercept x = 0: ${co(b, 'y')} = ${num(c)}, so y = ${num(yi)} — the point (0, ${num(yi)}).` };
} };

T.interceptIdea = { book: 'l2', make(rand) {
  const wantX = rand() < 0.5;
  return { ask: `What is true at every ${wantX ? 'x' : 'y'}-intercept?`, prompt: `To find the ${wantX ? 'x' : 'y'}-intercept algebraically, set&hellip;`,
    ...mc(rand, wantX ? 'y = 0' : 'x = 0', [wantX ? 'x = 0' : 'y = 0', 'm = 0', 'x = y']),
    tell: wantX ? 'an x-intercept sits ON the x-axis, where y = 0.' : 'a y-intercept sits ON the y-axis, where x = 0.' };
} };

T.readLine = { book: 'l2', make(rand) {
  const [p, q] = pick(rand, [[2, 1], [-2, 1], [3, 1], [-3, 1], [1, 2], [-1, 2], [2, 3], [-2, 3], [3, 2], [-3, 2], [1, 3], [-1, 3]]); const b = nz(rand, -4, 4);
  const P = plane(6, 24);
  const fig = P.svg(`${P.line(p / q, b)}${P.dot(0, b)}${P.dot(q, b + p)}`, 'a line on a grid');
  return { ask: 'Write the equation of the line', prompt: 'Use the graph: find b, then m (rise over run).', fig,
    ...mc(rand, slopeIntercept(p, q, b), [slopeIntercept(q, p, b), slopeIntercept(-p, q, b), slopeIntercept(p, q, -b), slopeIntercept(-q, p, b)]),
    tell: `the line crosses the y-axis at ${num(b)}, so b = ${num(b)}; from there it goes ${p < 0 ? 'down' : 'up'} ${Math.abs(p)} for every ${q} to the right, so m = ${frac(p, q)}.` };
} };

T.pointSlope = { book: 'l2', make(rand) {
  // a wrong choice must be a different LINE, not the same line through another point: so no slope of −1
  // (the swapped point is then on the line) and no line through the origin (the sign-flipped point is on it)
  let x1; let y1; let m;
  for (;;) { x1 = nz(rand, -9, 9); y1 = nz(rand, -9, 9); m = pick(rand, [-4, -3, -2, 2, 3, 4, 5]); if (Math.abs(x1) !== Math.abs(y1) && y1 !== m * x1) break; }
  const f = (ys, xs) => `y${term(ys)} = ${co(m, `(x${term(xs)})`)}`;
  return { ask: `Write the line through ${pt(x1, y1)} with slope ${num(m)} in point-slope form`, prompt: 'y − y₁ = m(x − x₁)',
    ...mc(rand, f(-y1, -x1), [f(y1, x1), f(-y1, x1), f(-x1, -y1)]),
    tell: `put the point into y − y₁ = m(x − x₁): y − ${par(y1)} = ${num(m)}(x − ${par(x1)}), which is ${f(-y1, -x1)}.` };
} };

// ---------------------------------------------------------------- 0.3 exponents, distributing & cancellation

T.exponentRule = { book: 'l3', make(rand) {
  const a = (e) => `a${sup(e)}`;
  const rows = [
    [`${a('m')} · ${a('n')}`, a('m + n'), [a('mn'), a('m − n'), `2${a('m + n')}`], 'multiplying like bases: ADD the exponents.'],
    [`(${a('m')})${sup('n')}`, a('mn'), [a('m + n'), a('m − n'), `n${a('m')}`], 'a power raised to a power: MULTIPLY the exponents.'],
    [fr(a('m'), a('n')), a('m − n'), [a('m + n'), a('mn'), a('n − m')], 'dividing like bases: SUBTRACT the exponents (top minus bottom).'],
    [a(0), '1', ['0', 'a', `${M}1`], 'anything (but 0) to the zero power is 1.'],
    [a(`${M}n`), fr(1, a('n')), [`${M}${a('n')}`, a('n'), `${M}${fr(1, a('n'))}`], 'a negative exponent moves the base to the other side of the fraction bar; it does not make anything negative.'],
    [`(ab)${sup('n')}`, `${a('n')}b${sup('n')}`, [`a·b${sup('n')}`, `${a('n')}b`, `(ab)·n`], 'the power goes to EVERY factor inside the parentheses.'],
  ];
  const [left, right, wrongs, why] = pick(rand, rows);
  return { ask: 'Finish the exponent rule', prompt: `${left} = ?`, ...mc(rand, right, wrongs), tell: why };
} };

T.exponentProduct = { book: 'l3', make(rand) {
  let a; let b;
  for (;;) { a = int(rand, 2, 7); b = int(rand, 2, 7); if (a + b !== a * b && a !== b) break; }
  const c1 = pick(rand, [2, 3, 4, -2, -3]); const c2 = pick(rand, [2, 3, 5, -2]); const v = pick(rand, ['x', 'n', 'a', 'c']);
  return { ask: 'Simplify', prompt: `${mono(c1, [[v, a]])} · ${mono(c2, [[v, b]])}`,
    ...mc(rand, mono(c1 * c2, [[v, a + b]]), [mono(c1 + c2, [[v, a + b]]), mono(c1 * c2, [[v, a * b]]), mono(c1 * c2, [[v, Math.abs(a - b)]])]),
    tell: `multiply the coefficients (${num(c1)}·${par(c2)} = ${num(c1 * c2)}) and ADD the exponents (${a} + ${b} = ${a + b}).` };
} };

T.exponentPower = { book: 'l3', make(rand) {
  let c; let a; let n;
  for (;;) { c = pick(rand, [2, 3, 4, 5, -2, -3]); a = int(rand, 2, 6); n = pick(rand, [2, 2, 3]); if (a + n !== a * n && c ** n !== c * n) break; }
  const v = pick(rand, ['x', 'a', 'm', 'y']);
  return { ask: 'Simplify', prompt: `(${mono(c, [[v, a]])})${sup(n)}`,
    ...mc(rand, mono(c ** n, [[v, a * n]]), [mono(c * n, [[v, a * n]]), mono(c, [[v, a * n]]), mono(c ** n, [[v, a + n]])]),
    tell: `the power goes to every factor: ${par(c)}${sup(n)} = ${num(c ** n)}, and (${v}${sup(a)})${sup(n)} multiplies the exponents: ${v}${sup(a * n)}.` };
} };

T.exponentQuotient = { book: 'l3', make(rand) {
  const q = pick(rand, [2, 3, 4, 5, -2, -3]); const c2 = pick(rand, [2, 3, 4, 6]); const c1 = q * c2;
  const d = int(rand, 2, 6); const a = d + int(rand, 2, 6); const b = int(rand, 2, 5); const e = b + int(rand, 2, 5);
  const top = mono(q, [['x', a - d]]); const bot = mono(1, [['y', e - b]]);
  return { ask: 'Simplify. Write all exponents as positive.', prompt: fr(mono(c1, [['x', a], ['y', b]]), mono(c2, [['x', d], ['y', e]])),
    ...mc(rand, fr(top, bot), [mono(q, [['x', a - d], ['y', e - b]]), fr(mono(c1 - c2, [['x', a - d]]), bot), fr(mono(q, [['x', a + d]]), mono(1, [['y', e + b]])), fr(mono(q, [['y', e - b]]), mono(1, [['x', a - d]]))]),
    tell: `${num(c1)} ÷ ${c2} = ${num(q)}; x: ${a} − ${d} = ${a - d} left on top; y: ${b} − ${e} = ${num(b - e)}, so y${sup(e - b)} ends up on the bottom.` };
} };

T.zeroExponent = { book: 'l3', make(rand) {
  const c = pick(rand, [3, 5, 7, 8, 9, 12, -4]); const a = int(rand, 2, 9); const b = int(rand, 2, 5);
  if (rand() < 0.5) return { ask: 'Simplify', prompt: `${num(c)}x${sup(0)}`, ...mc(rand, num(c), ['1', '0', `${num(c)}x`]), tell: `only the x is raised to the 0 power: ${num(c)}·1 = ${num(c)}.` };
  return { ask: 'Simplify', prompt: `(${mono(c, [['x', a], ['y', -b]])})${sup(0)}`, ...mc(rand, '1', ['0', num(c), mono(c, [['x', a], ['y', -b]])]), tell: 'the WHOLE parenthesis is raised to the 0 power, so it is 1.' };
} };

T.negativeExponent = { book: 'l3', make(rand) {
  const c = pick(rand, [2, 3, 5, 7]); const a = int(rand, 2, 6); const b = int(rand, 2, 6);
  if (rand() < 0.5) {
    return { ask: 'Simplify. Write all exponents as positive.', prompt: mono(c, [['x', a], ['y', -b]]),
      ...mc(rand, fr(mono(c, [['x', a]]), mono(1, [['y', b]])), [mono(-c, [['x', a], ['y', b]]), fr(1, mono(c, [['x', a], ['y', b]])), fr(mono(1, [['y', b]]), mono(c, [['x', a]]))]),
      tell: `only y has the negative exponent, so only y${sup(b)} moves to the bottom; ${c}x${sup(a)} stays on top.` };
  }
  return { ask: 'Simplify. Write all exponents as positive.', prompt: fr(num(-c), mono(1, [['x', -a]])),
    ...mc(rand, mono(-c, [['x', a]]), [fr(num(-c), mono(1, [['x', a]])), mono(c, [['x', a]]), fr(1, mono(c, [['x', a]]))]),
    tell: `a negative exponent on the bottom moves the base to the top: ${M}${c}x${sup(a)}. The −${c} is a coefficient — its sign does not change.` };
} };

T.monomialProduct = { book: 'l3', make(rand) {
  const c1 = pick(rand, [2, 3, 5]); const c2 = pick(rand, [3, 4, 6]); const p = int(rand, 2, 5); const q = int(rand, 2, 4); const r = q + int(rand, 1, 4);
  if (c1 + c2 === c1 * c2) return T.monomialProduct.make(rand);
  return { ask: 'Simplify. Write all exponents as positive.', prompt: `(${mono(c1, [['a', p], ['b', -q]])})(${mono(c2, [['a', 1], ['b', r]])})`,
    ...mc(rand, mono(c1 * c2, [['a', p + 1], ['b', r - q]]), [mono(c1 + c2, [['a', p + 1], ['b', r - q]]), mono(c1 * c2, [['a', p], ['b', r - q]]), mono(c1 * c2, [['a', p + 1], ['b', r + q]])]),
    tell: `${c1}·${c2} = ${c1 * c2}; a: ${p} + 1 = ${p + 1}; b: ${num(-q)} + ${r} = ${r - q}.` };
} };

T.standardForm = { book: 'l3', make(rand) {
  const terms = [[nz(rand, -6, 6), 3], [nz(rand, -9, 9), 2], [nz(rand, -9, 9), 1], [nz(rand, -12, 12), 0]];
  const orders = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 0, 3, 2], [2, 3, 0, 1], [0, 2, 1, 3]];
  const show = (o) => poly(o.map((i) => terms[i]));
  return { ask: 'Which polynomial is written in standard form?', prompt: 'Standard form: descending order, based on exponents.',
    ...mc(rand, show(orders[0]), orders.slice(1).map(show)), tell: 'the exponents go 3, 2, 1, then the constant: descending.' };
} };

T.conjugates = { book: 'l3', make(rand) {
  const a = int(rand, 3, 12);
  return { ask: 'Distribute. Write the answer in standard form.', prompt: `(x + ${a})(x ${M} ${a})`,
    ...mc(rand, `x${sup(2)} ${M} ${a * a}`, [`x${sup(2)} + ${a * a}`, quad(1, -2 * a, a * a), `x${sup(2)} ${M} ${2 * a}`, quad(1, 2 * a, -a * a)]),
    tell: `x·x = x², then −${a}x and +${a}x cancel, and ${a}·(−${a}) = −${a * a}.` };
} };

T.binomialSquared = { book: 'l3', make(rand) {
  const p = pick(rand, [1, 1, 1, 2, 3]); const q = nz(rand, -9, 10);
  const inner = lin([[p, 'x']], q);
  return { ask: 'Distribute. Write the answer in standard form.', prompt: `(${inner})${sup(2)}`,
    ...mc(rand, quad(p * p, 2 * p * q, q * q), [`${p === 1 ? '' : p * p}x${sup(2)} + ${q * q}`, quad(p * p, p * q, q * q), quad(p * p, 2 * p * q, 2 * Math.abs(q)), quad(p * p, 2 * p * q, -q * q)]),
    tell: `it means (${inner})(${inner}): ${p === 1 ? '' : p * p}x², then two middle terms of ${num(p * q)}x, then ${par(q)}² = ${q * q}. The middle term is the one people drop.` };
} };

T.binomialProduct = { book: 'l3', make(rand) {
  let a; let b;
  for (;;) { a = nz(rand, -9, 9); b = nz(rand, -9, 9); if (a + b !== 0 && a + b !== a * b && Math.abs(a * b) !== Math.abs(a + b)) break; }
  return { ask: 'Distribute. Write the answer in standard form.', prompt: `(x${term(a)})(x${term(b)})`,
    ...mc(rand, quad(1, a + b, a * b), [quad(1, a * b, a + b), quad(1, a + b, -a * b), `x${sup(2)}${term(a * b)}`, quad(1, -(a + b), a * b)]),
    tell: `x·x = x²; ${co(b)} and ${co(a)} make ${co(a + b)}; ${num(a)}·${par(b)} = ${num(a * b)}.` };
} };

T.cancelFirstStep = { book: 'l3', make(rand) {
  const k = pick(rand, [2, 3, 4, 5, 7]); const c = pick(rand, [1, 2, 3, 4, 8, 9, 12]); const form = pick(rand, ['A', 'B', 'C', 'D']);
  const undo = `the + ${c} and the ${M} ${c} undo each other`;
  let expr; let first; let wrongs; let why;
  if (form === 'A') { expr = fr(`(${k}x + ${c}) ${M} ${c}`, k); first = undo; wrongs = [`divide ${k}x by ${k}`, `divide ${c} by ${k}`]; why = `the top simplifies first: ${k}x + ${c} − ${c} = ${k}x; THEN divide by ${k}.`; }
  else if (form === 'B') { expr = `${k}(${fr(`x ${M} ${c}`, k)}) + ${c}`; first = `the ×${k} and the ÷${k} undo each other`; wrongs = [`the ${M} ${c} and the + ${c} undo each other`, `multiply ${c} by ${k}`]; why = `the ${k} multiplies the whole fraction, so it cancels the denominator first, leaving x − ${c}; THEN add ${c}.`; }
  else if (form === 'C') { expr = fr(`(√(${k}x + ${c}))${sup(2)} ${M} ${c}`, k); first = 'the square undoes the square root'; wrongs = [undo, `divide by ${k}`]; why = `squaring the root leaves ${k}x + ${c}; then the ${c}'s cancel; then divide by ${k}.`; }
  else { expr = `∛((x + ${c})${sup(3)}) ${M} ${c}`; first = 'the cube root undoes the cube'; wrongs = [undo, `cube the ${c}`]; why = `the cube root of a cube leaves x + ${c}; THEN subtract ${c}.`; }
  return { ask: 'Cancellation — there is a right way to do it! Which step comes FIRST?', prompt: expr, ...mc(rand, first, wrongs),
    tell: `${why} The whole expression simplifies to x.` };
} };

// ---------------------------------------------------------------- 0.4 functions & function notation

T.functionVocab = { book: 'l4', make(rand) {
  const rows = [['a relation', 'any set of ordered pairs'], ['a function', 'a relation in which every input, x, corresponds with exactly one output, y'], ['a one-to-one function', 'a function in which different inputs give different outputs — no y-value repeats']];
  const [name, def] = pick(rand, rows);
  return { ask: 'Which word fits the definition?', prompt: def, ...mc(rand, name, [...rows.map((r) => r[0]).filter((n) => n !== name), 'a solution set']),
    tell: 'relation → function (every x has exactly one y) → one-to-one (and no y repeats).' };
} };

T.lineTests = { book: 'l4', make(rand) {
  const one = rand() < 0.5;
  return { ask: one ? 'Which test shows that a graph is a ONE-TO-ONE function?' : 'Which test shows that a graph is a function?', prompt: 'the&hellip;',
    ...mc(rand, one ? 'Horizontal Line Test' : 'Vertical Line Test', [one ? 'Vertical Line Test' : 'Horizontal Line Test', 'slope formula', 'cross multiplication']),
    tell: one ? 'HLT: no horizontal line may hit the graph twice — no y-value repeats. (It has to pass the VLT first.)' : 'VLT: no vertical line may hit the graph twice — every x has exactly one y.' };
} };

T.pointsFunction = { book: 'l4', make(rand) {
  const kind = pick(rand, ['one', 'fn', 'not']);
  const xs = sample(rand, [-3, -2, -1, 0, 1, 2, 3, 4, 5, 9], 4); const ys = sample(rand, [-3, -2, 0, 1, 2, 3, 4, 7, 8, 10, 14, 16], 4);
  let why;
  if (kind === 'not') { xs[3] = xs[1]; why = `x = ${num(xs[1])} repeats (with two different y-values), so it is not a function — and thus not one-to-one.`; }
  else if (kind === 'fn') { ys[2] = ys[0]; why = `no x repeats, so it is a function; but y = ${num(ys[0])} repeats, so it is not one-to-one.`; }
  else why = 'no x repeats and no y repeats: a one-to-one function.';
  const C = { one: 'A function, and one-to-one', fn: 'A function, but not one-to-one', not: 'Not a function' };
  return { ask: 'Is y a function of x? Is it one-to-one?', prompt: 'Use the table.', fig: table('x', xs, 'y', ys), ...mc(rand, C[kind], Object.values(C).filter((c) => c !== C[kind])), tell: why };
} };

T.equationOneToOne = { book: 'l4', make(rand) {
  const c = nz(rand, -7, 7); const m = nz(rand, -5, 5);
  const rows = [[`y = ${lin([[m, 'x']], c)}`, true, 'a slanted line: every y-value is hit exactly once.'], [`y = x${sup(2)}${term(c)}`, false, 'a parabola: a horizontal line crosses it twice (x and −x give the same y).'], [`y = √(x${term(c)})`, true, 'half of a sideways parabola: it only ever rises.'], [`y = x${sup(3)}${term(c)}`, true, 'a cubic like this one always rises.'], [`y = |x|${term(c)}`, false, 'a V: a horizontal line crosses it twice.']];
  const [eq, yes, why] = pick(rand, rows);
  const C = ['Yes — it passes the Horizontal Line Test', 'No — it fails the Horizontal Line Test', 'No — it is not a function'];
  return { ask: 'Is it a one-to-one function?', prompt: eq, ...mc(rand, yes ? C[0] : C[1], C.filter((x) => x !== (yes ? C[0] : C[1]))), tell: why };
} };

T.inputOrOutput = { book: 'l4', make(rand) {
  const a = nz(rand, -9, 9); const b = nz(rand, -30, 30); const f = pick(rand, ['f', 'g', 'h', 'k']);
  const which = pick(rand, ['in', 'out', 'given']);
  const C = ['an input (x-value)', 'an output (y-value)', 'the slope', 'the name of the function'];
  if (which === 'given') return { ask: `&ldquo;Find x, given that ${f}(x) = ${num(b)}.&rdquo; The ${num(b)} is&hellip;`, prompt: `${f}(x) = ${num(b)}`, ...mc(rand, C[1], [C[0], C[2], C[3]]), tell: `${f}(x) IS the output, so ${num(b)} is a y-value: set the function equal to ${num(b)} and solve for x.` };
  return { ask: `In ${f}(${num(a)}) = ${num(b)}, the ${which === 'in' ? num(a) : num(b)} is&hellip;`, prompt: `${f}(${num(a)}) = ${num(b)}`, ...mc(rand, which === 'in' ? C[0] : C[1], C.filter((c) => c !== (which === 'in' ? C[0] : C[1]))),
    tell: 'whatever is inside the parentheses is the INPUT; what the function equals is the OUTPUT.' };
} };

T.evaluate = { book: 'l4', make(rand) {
  const f = pick(rand, ['f', 'g', 'h', 'k']); const x0 = nz(rand, -6, 8);
  if (rand() < 0.5) {
    const a = nz(rand, -9, 16); const b = nz(rand, -9, 9);
    return { ask: `Evaluate ${f}(${num(x0)})`, prompt: `${f}(x) = ${lin([[a, 'x']], b)}`, typed: a * x0 + b, neg: true, tell: `substitute ${num(x0)} for x: ${num(a)}(${num(x0)})${term(b)} = ${num(a * x0 + b)}.` };
  }
  const a = pick(rand, [-3, -2, -1, 1, 2, 3]); const c = nz(rand, -7, 7);
  return { ask: `Evaluate ${f}(${num(x0)})`, prompt: `${f}(x) = ${quad(a, 0, c)}`, typed: a * x0 * x0 + c, neg: true,
    tell: `square first: (${num(x0)})² = ${x0 * x0}; then ${num(a)}·${x0 * x0}${term(c)} = ${num(a * x0 * x0 + c)}.` };
} };

T.evaluateRoot = { book: 'l4', make(rand) {
  const r = int(rand, 1, 7); const c = nz(rand, -9, 12); const x0 = r * r - c;
  return { ask: `Evaluate j(${num(x0)})`, prompt: `j(x) = √(x${term(c)})`, typed: r, tell: `√(${num(x0)}${term(c)}) = √${r * r} = ${r}.` };
} };

T.findInput = { book: 'l4', make(rand) {
  const a = pick(rand, [-7, -4, -3, -1, 2, 3, 4, 5, 16]); const b = nz(rand, -9, 9); const x0 = nz(rand, -9, 9); const f = pick(rand, ['f', 'g', 'h']);
  return { ask: `Find x, given that ${f}(x) = ${num(a * x0 + b)}`, prompt: `${f}(x) = ${lin([[a, 'x']], b)}`, typed: x0, neg: true,
    tell: `${num(a * x0 + b)} is an OUTPUT: set ${lin([[a, 'x']], b)} = ${num(a * x0 + b)} and solve: x = ${num(x0)}.` };
} };

T.tableEvaluate = { book: 'l4', make(rand) {
  const xs = sample(rand, [-6, -4, -2, 1, 3, 5, 7, 9, 12], 5); const ys = sample(rand, [-8, -5, -3, 0, 2, 4, 6, 10, 11, 14], 5);
  const i = int(rand, 0, 4); const fig = table('x', xs, 'n(x)', ys);
  if (rand() < 0.5) return { ask: `Use the table to evaluate n(${num(xs[i])})`, prompt: 'Use the table.', fig, typed: ys[i], neg: true, tell: `${num(xs[i])} is the input: find it in the x row and read the output below it, ${num(ys[i])}.` };
  return { ask: `Use the table. Find x when n(x) = ${num(ys[i])}`, prompt: 'Use the table.', fig, typed: xs[i], neg: true, tell: `${num(ys[i])} is the OUTPUT: find it in the n(x) row and read the input above it, ${num(xs[i])}.` };
} };

T.maxMinPointOrValue = { book: 'l4', make(rand) {
  const z = zig(rand); const max = rand() < 0.5; const point = rand() < 0.5;
  const [x, y] = max ? z.hi : z.lo; const [ox, oy] = max ? z.lo : z.hi; const word = max ? 'maximum' : 'minimum';
  if (point) return { ask: `State the ${word} POINT of the graph`, prompt: `Use the graph. This is the ${max ? 'highest' : 'lowest'} point on the graph.`, fig: zigFig(z),
    ...mc(rand, pt(x, y), [num(y), pt(y, x), pt(ox, oy)]), tell: `the ${max ? 'highest' : 'lowest'} point is (${num(x)}, ${num(y)}) — a POINT is an ordered pair.` };
  return { ask: `What is the ${word} VALUE of the graph?`, prompt: `Use the graph. You are being asked for the ${max ? 'highest' : 'lowest'} y-value!`, fig: zigFig(z),
    ...mc(rand, num(y), [pt(x, y), num(x), num(oy)].filter((w) => w !== num(y))), tell: `the ${max ? 'highest' : 'lowest'} point is (${num(x)}, ${num(y)}); the ${word} VALUE is just its y-value, ${num(y)}.` };
} };

T.increasingInterval = { book: 'l4', make(rand) {
  for (;;) {
    const z = zig(rand); const inc = rand() < 0.5;
    const segs = [0, 1, 2].map((i) => ({ rising: z.ys[i + 1] > z.ys[i], x: `${num(z.xs[i])} ${LT} x ${LT} ${num(z.xs[i + 1])}`, y: `${num(Math.min(z.ys[i], z.ys[i + 1]))} ${LT} y ${LT} ${num(Math.max(z.ys[i], z.ys[i + 1]))}` }));
    const good = segs.filter((s) => s.rising === inc); const bad = segs.filter((s) => s.rising !== inc);
    const right = pick(rand, good).x;
    // one right answer only: the other interval of the same kind is not offered
    const wrongs = [pick(rand, bad).x, pick(rand, good).y, pick(rand, bad).y];
    if (new Set([right, ...wrongs]).size < 4) continue;
    return { ask: `Over which interval is f(x) ${inc ? 'increasing' : 'decreasing'}?`, prompt: 'Use the graph. Between what x-values?', fig: zigFig(z), ...mc(rand, right, wrongs),
      tell: `an interval of ${inc ? 'increase' : 'decrease'} asks between what X-values the graph is going ${inc ? 'up' : 'down'} (left to right) — never y-values.` };
  }
} };

T.graphEvaluate = { book: 'l4', make(rand) {
  const z = zig(rand); let a;
  for (;;) { a = int(rand, z.xs[0], z.xs[3]); if (a !== 0) break; }
  return { ask: `Use the graph to evaluate f(${num(a)})`, prompt: 'Use the graph.', fig: zigFig(z), typed: z.f(a), neg: true, tell: `${num(a)} is the input: go to x = ${num(a)} and read the height of the graph there, ${num(z.f(a))}.` };
} };

T.yInterceptPair = { book: 'l4', make(rand) {
  const z = zig(rand); const b = z.f(0);
  return { ask: 'State the y-intercept as an ordered pair', prompt: 'Use the graph.', fig: zigFig(z), ...mc(rand, pt(0, b), [pt(b, 0), num(b), pt(0, -b)]),
    tell: `the graph crosses the y-axis at height ${num(b)}; as an ordered pair that is (0, ${num(b)}).` };
} };

T.turningPoints = { book: 'l4', make(rand) {
  const z = zig(rand); const [p0, p1, p2, p3] = z.pts; const both = (a, b) => `${pt(...a)} and ${pt(...b)}`;
  return { ask: 'State the turning point(s) of the graph', prompt: 'Use the graph.', fig: zigFig(z),
    ...mc(rand, both(p1, p2), [both(p0, p3), both([p1[1], p1[0]], [p2[1], p2[0]]), pt(...p1), pt(...p2)]),
    tell: `the graph turns around at ${both(p1, p2)}. The endpoints are not turning points.` };
} };

// ---------------------------------------------------------------- 0.5 graphing calculator skills

T.standardWindow = { book: 'l5', make(rand) {
  return { ask: 'What is the standard viewing window?', prompt: 'ZOOM 6 on a TI-84 (Zoom – Standard on a TI-nSpire)',
    ...mc(rand, `${M}10 to 10 for both the x- and y-values`, [`0 to 10 for both the x- and y-values`, `${M}5 to 5 for both the x- and y-values`, `${M}10 to 10 for x, 0 to 100 for y`]),
    tell: 'Xmin = −10, Xmax = 10, Ymin = −10, Ymax = 10.' };
} };

T.ti84Keys = { book: 'l5', make(rand) {
  const rows = [['type in the equation of the function you want to graph', 'Y='], ['see the graph', 'GRAPH'], ['get a standard viewing window', 'ZOOM 6'], ['look at the table of values', '2ND GRAPH'], ['raise the variable to a power', '^']];
  const [what, key] = pick(rand, rows);
  return { ask: `On a TI-84, which key(s) do you press to ${what}?`, prompt: 'TI-84', ...mc(rand, key, rows.map((r) => r[1]).filter((k) => k !== key)),
    tell: 'Y= to type the function, GRAPH to see it, ZOOM 6 for the standard window, 2ND GRAPH for the table, ^ for a power.' };
} };

T.tableValue = { book: 'l5', make(rand) {
  const a = pick(rand, [-3, -2, -1, 1, 2]); const b = nz(rand, -6, 6); const c = nz(rand, -9, 14); const x0 = int(rand, -3, 5);
  const y = a * x0 * x0 + b * x0 + c;
  return { ask: `Your calculator's table for this function: what is y when x = ${num(x0)}?`, prompt: `y = ${quad(a, b, c)}`, typed: y, neg: true,
    tell: `${a === 1 ? '' : a === -1 ? M : num(a)}(${num(x0)})² ${sgn(b)} ${Math.abs(b) === 1 ? '' : Math.abs(b)}(${num(x0)})${term(c)} = ${num(a * x0 * x0)}${term(b * x0)}${term(c)} = ${num(y)}.` };
} };

T.tableTurn = { book: 'l5', make(rand) {
  // a table through the vertex of a parabola: the y-values turn around there
  const a = pick(rand, [-3, -2, -1, 1, 2, 3]); const h = int(rand, -3, 4); const k = nz(rand, -9, 17);
  const xs = [-3, -2, -1, 0, 1, 2, 3].map((d) => h + d).slice(int(rand, 0, 1), 6 + int(rand, 0, 1));
  const ys = xs.map((x) => a * (x - h) ** 2 + k);
  return { ask: `Here is the calculator's table. At what x-value is the ${a < 0 ? 'maximum' : 'minimum'}?`, prompt: 'Use the table.', fig: table('x', xs, 'y', ys), typed: h, neg: true,
    tell: `the y-values ${a < 0 ? 'climb to' : 'drop to'} ${num(k)} and then turn around: the ${a < 0 ? 'maximum' : 'minimum'} is at (${num(h)}, ${num(k)}).` };
} };

T.windowSetting = { book: 'l5', make(rand) {
  const big = int(rand, 12, 60); const small = nz(rand, -8, 8);
  const rows = [['a maximum at', pt(small, big), 'Ymax'], ['a minimum at', pt(small, -big), 'Ymin'], ['an x-intercept at', pt(big, 0), 'Xmax'], ['an x-intercept at', pt(-big, 0), 'Xmin']];
  const [what, point, key] = pick(rand, rows);
  return { ask: `The graph has ${what} ${point}, but the standard window cuts it off. Which window setting must change?`, prompt: 'Xmin · Xmax · Ymin · Ymax', ...mc(rand, key, ['Xmin', 'Xmax', 'Ymin', 'Ymax'].filter((k) => k !== key)),
    tell: `the standard window stops at 10 in every direction; ${point} is past it ${key[0] === 'X' ? (key === 'Xmax' ? 'to the right' : 'to the left') : key === 'Ymax' ? 'at the top' : 'at the bottom'}, so change ${key}.` };
} };

T.roundTenth = { book: 'l5', make(rand) {
  let h;
  for (;;) { h = nz(rand, -999, 999); if (Math.abs(h) % 10 !== 5 && Math.abs(h) % 10 !== 0 && Math.abs(h) > 10) break; }
  const show = (n, d) => { const s = Math.abs(n).toFixed(d); return `${n < 0 ? M : ''}${s}`; };
  const v = h / 100; const r = Math.round(Math.abs(h) / 10) / 10 * Math.sign(h); const other = (Math.abs(h) % 10 < 5 ? Math.floor(Math.abs(h) / 10) + 1 : Math.floor(Math.abs(h) / 10)) / 10 * Math.sign(h);
  return { ask: 'Round to the nearest tenth', prompt: show(v, 2), ...mc(rand, show(r, 1), [show(other, 1), show(v, 2), show(Math.round(Math.abs(v)) * Math.sign(h), 0)]),
    tell: `the hundredths digit is ${Math.abs(h) % 10}: ${Math.abs(h) % 10 < 5 ? 'less than 5, so the tenths digit stays' : '5 or more, so the tenths digit goes up'}.` };
} };

T.intersectionPoint = { book: 'l5', make(rand) {
  let r1; let r2; let k;
  for (;;) { r1 = nz(rand, -6, 6); r2 = nz(rand, -6, 6); k = nz(rand, -6, 8); if (r1 !== r2 && r1 + r2 !== 0 && r1 !== k) break; }
  const b = -(r1 + r2); const c = r1 * r2 + k;
  return { ask: 'Which is a point of intersection of the two graphs?', prompt: `y = ${quad(1, b, c)}<br>y = ${num(k)}`,
    ...mc(rand, pt(r1, k), [pt(k, r1), pt(r1, 0), pt(-r1, k), pt(0, c)]),
    tell: `a point of intersection is on BOTH graphs: at x = ${num(r1)} the parabola gives ${r1 * r1} ${sgn(b * r1)} ${Math.abs(b * r1)}${term(c)} = ${num(k)}, and the line is at ${num(k)} too. (The other one is ${pt(r2, k)}.)` };
} };

module.exports = makeBank(BOOKS, T);
module.exports._parts = { holds };
