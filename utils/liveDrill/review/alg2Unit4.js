/**
 * Algebra 2 · Unit 4 Review — Transformations of Quadratics. Built from the teacher's unit packet
 * ("Unit 4 – Transformations of Quadratics": Lesson 1 Vertex Form, Lesson 2 Completing the Square
 * to Vertex Form, Lesson 3 Write the Equation of a Quadratic Function, Lesson 4 Shifting, Lesson 5
 * Reflecting, Lesson 6 Vertically Stretching/Compressing, Lesson 7 Multi-Step Graphing with the
 * Transformation Rules, Lesson 8 Horizontal Stretching/Compressing, the mixed practices, the unit
 * review and the Transformation Rules Chart).
 *
 * The packet's words are the answers' words: the "turning point (vertex)" as an ordered pair, "Max"
 * or "Min", the axis of symmetry as an equation x = …, "Domain: All real numbers", the range as
 * y ≤ k or y ≥ k, the y-intercept as an ordered pair; transformations written "right 5", "left 3",
 * "up 1", "down 2", "reflect over the x-axis", "reflect over the y-axis", "vertical stretch by 7",
 * "vertical compression by 1/4", "horizontal stretch by 4/3", "horizontal compression by 1/5", and
 * listed reflection first, then stretch or compression, then left/right, then up/down. A y-axis
 * reflection stays visible as (−x)², and a horizontal coefficient stays INSIDE the square —
 * ((1/3)x)², never (1/9)x² — with its stated factor the RECIPROCAL of the coefficient ("take the
 * reciprocal of the coefficient of x THEN decide whether it's a stretch or shrink"). "Compressed by
 * a factor of 3" means a = 1/3, as the packet's own key reads it.
 *
 * The unit test is NO CALCULATOR, and so is this: completing the square always has an integer h.
 */
const { M, num, int, pick, sample, frac, makeBank, mc } = require('../prep/kit');
const { sup, nz, term, par, pt, quad, fr, plane, INK2 } = require('./alg2Kit');

const BOOKS = {
  all: { name: 'Whole Unit', ch: 'Unit 4', blurb: 'Every lesson, mixed — vertex form, completing the square, writing equations, and every transformation.' },
  l1: { name: 'Vertex Form', ch: '4.1', blurb: 'Turning point, max or min, axis of symmetry, range, y-intercept, roots, standard form.' },
  l2: { name: 'Completing the Square', ch: '4.2', blurb: 'Standard form to vertex form, and x = −b/(2a) for the turning point.' },
  l3: { name: 'Write the Equation', ch: '4.3', blurb: 'A vertex and a point: substitute, solve for a, write vertex form.' },
  l4: { name: 'Shifting', ch: '4.4', blurb: 'f(x) + c, f(x − c): up, down, left, right — and why left looks like plus.' },
  l5: { name: 'Reflecting', ch: '4.5', blurb: '−f(x) over the x-axis, f(−x) over the y-axis.' },
  l6: { name: 'Vertical Stretch & Compression', ch: '4.6', blurb: 'c · f(x): multiply the y-coordinates; stretch, compression, narrower, wider.' },
  l7: { name: 'Multi-Step Transformations', ch: '4.7', blurb: 'List every transformation, write the equation, find the vertex and follow the pattern.' },
  l8: { name: 'Horizontal Stretch & Compression', ch: '4.8', blurb: 'f(cx): take the reciprocal, then decide. Only the x-coordinates change.' },
};

/** The leading coefficient p/q as it is printed in front of a square. */
const lead = (p, q = 1) => (q === 1 ? (p === 1 ? '' : p === -1 ? M : num(p)) : `${p < 0 ? M : ''}${fr(Math.abs(p), q)}`);
/** Vertex form with a = p/q: lead·(x − h)² + k */
function vf(p, q, h, k) {
  const inner = h === 0 ? `x${sup(2)}` : `(x${term(-h)})${sup(2)}`;
  return `${lead(p, q)}${inner}${term(k)}`;
}
const eq = (s) => `y = ${s}`;
const shiftH = (h) => (h > 0 ? `right ${h}` : `left ${-h}`);
const shiftK = (k) => (k > 0 ? `up ${k}` : `down ${-k}`);
/** The transformations of y = (p/q)(x − h)² + k in the packet's words and order. */
function describe(p, q, h, k, o = {}) {
  const parts = [];
  if ((p < 0) !== !!o.toggleReflect) parts.push(`reflect over the ${o.yAxis ? 'y' : 'x'}-axis`);
  const ap = Math.abs(p);
  if (ap !== q) parts.push(`vertical ${(ap > q) !== !!o.flipWord ? 'stretch' : 'compression'} by ${frac(ap, q)}`);
  if (h) parts.push(shiftH(o.flipH ? -h : h));
  if (k) parts.push(shiftK(o.flipK ? -k : k));
  return parts.join(', ');
}
/** A parabola on the ±10 grid with dots on its lattice points; `parent` adds y = x² in red. */
function parabolaFig(a, h, k, { parent = false } = {}) {
  const P = plane(10); const f = (x) => a * (x - h) ** 2 + k;
  const dots = (fn, color, xs) => xs.filter((x) => Math.abs(fn(x)) <= 10 && Math.abs(x) <= 10 && Number.isInteger(fn(x) * 2)).map((x) => P.dot(x, fn(x), { color, r: 3 })).join('');
  const par0 = parent ? `${P.curve((x) => x * x, { color: INK2, step: 0.05, width: 2 })}${dots((x) => x * x, INK2, [-3, -2, -1, 0, 1, 2, 3])}` : '';
  return P.svg(`${par0}${P.curve(f, { step: 0.05 })}${dots(f, '#2e6fd8', [-3, -2, -1, 0, 1, 2, 3].map((d) => h + d))}`, parent ? 'the parent function and a transformed parabola' : 'graph of a parabola');
}
const A_INT = [[1, 1], [-1, 1], [2, 1], [-2, 1], [3, 1], [-3, 1], [5, 1]];
const A_ALL = [...A_INT, [1, 2], [-1, 2], [1, 4], [1, 3], [-1, 3], [4, 3], [-2, 5]];
/** h and k, both nonzero, different sizes. */
function hk(rand, lim = 9) { for (;;) { const h = nz(rand, -lim, lim); const k = nz(rand, -lim, lim); if (Math.abs(h) !== Math.abs(k)) return [h, k]; } }

const T = {};

// ---------------------------------------------------------------- 4.1 vertex form

T.turningPoint = { book: 'l1', make(rand) {
  const [p, q] = pick(rand, A_ALL); const [h, k] = hk(rand);
  return { ask: 'Which represents the turning point (vertex) of the parabola?', prompt: eq(vf(p, q, h, k)), ...mc(rand, pt(h, k), [pt(-h, k), pt(k, h), pt(-h, -k)]),
    tell: `in y = a(x − h)² + k the turning point is (h, k): the x-coordinate has the OPPOSITE sign from the one in the parentheses, so (${num(h)}, ${num(k)}).` };
} };

T.maxOrMin = { book: 'l1', make(rand) {
  const [p, q] = pick(rand, A_ALL); const [h, k] = hk(rand); const up = p > 0;
  const C = ['Min — the graph opens up', 'Max — the graph opens down', 'Max — the graph opens up', 'Min — the graph opens down'];
  return { ask: 'Is the turning point a max or a min?', prompt: eq(vf(p, q, h, k)), ...mc(rand, up ? C[0] : C[1], C.filter((c) => c !== (up ? C[0] : C[1]))),
    tell: up ? 'a &gt; 0, so the graph opens up and the turning point is a minimum.' : 'a &lt; 0, so the graph opens down and the turning point is a maximum.' };
} };

T.axisOfSymmetry = { book: 'l1', make(rand) {
  const [p, q] = pick(rand, A_ALL); const [h, k] = hk(rand);
  return { ask: 'What is the equation of the axis of symmetry?', prompt: eq(vf(p, q, h, k)), ...mc(rand, `x = ${num(h)}`, [`x = ${num(-h)}`, `y = ${num(k)}`, `x = ${num(k)}`]),
    tell: `the axis of symmetry is the vertical line through the turning point (${num(h)}, ${num(k)}): x = ${num(h)}.` };
} };

T.domainOrRange = { book: 'l1', make(rand) {
  const [p, q] = pick(rand, A_ALL); const [h, k] = hk(rand); const up = p > 0; const ge = '&ge;'; const le = '&le;';
  if (rand() < 0.3) return { ask: 'What is the domain?', prompt: eq(vf(p, q, h, k)), ...mc(rand, 'All real numbers', [`x ${ge} ${num(h)}`, `y ${up ? ge : le} ${num(k)}`, `x ${le} ${num(h)}`]), tell: 'any x can go into a quadratic: the domain is all real numbers.' };
  return { ask: 'What is the range?', prompt: eq(vf(p, q, h, k)), ...mc(rand, `y ${up ? ge : le} ${num(k)}`, [`y ${up ? le : ge} ${num(k)}`, `y ${up ? ge : le} ${num(h)}`, 'All real numbers']),
    tell: `the turning point (${num(h)}, ${num(k)}) is a ${up ? 'minimum' : 'maximum'}, so the y-values are ${up ? `${num(k)} and up` : `${num(k)} and down`}.` };
} };

T.yInterceptOfVertexForm = { book: 'l1', make(rand) {
  const a = pick(rand, [1, 1, -1, 2]); const h = nz(rand, -6, 6); const k = nz(rand, -9, 9); const v = a * h * h + k;
  return { ask: 'Which is the y-intercept of the function?', prompt: eq(vf(a, 1, h, k)), ...mc(rand, pt(0, v), [pt(0, k), pt(h, k), pt(0, -a * h * h + k)]),
    tell: `set x = 0: ${a === 1 ? '' : a === -1 ? '−' : a}(0 − ${par(h)})²${term(k)} = ${a === 1 ? '' : `${num(a)}·`}${h * h}${term(k)} = ${num(v)}. (The ${num(k)} alone is the turning point's y-value, not the y-intercept.)` };
} };

T.whichHasThisTurningPoint = { book: 'l1', make(rand) {
  const [h, k] = hk(rand, 8); const a = pick(rand, [2, 3, 5, -2]);
  return { ask: `Which quadratic function has a turning point at ${pt(h, k)}?`, prompt: 'Choose the equation.', ...mc(rand, eq(vf(a, 1, h, k)), [eq(vf(1, 1, -h, k)), eq(vf(a, 1, k, h)), eq(vf(pick(rand, [2, 3]), 1, -h, -k))]),
    tell: `vertex form is y = a(x − h)² + k, and h shows up with the opposite sign: (x${term(-h)}) and ${term(k).trim()}. The a does not move the turning point.` };
} };

T.rootsFromVertexForm = { book: 'l1', make(rand) {
  const h = nz(rand, -7, 7); const d = int(rand, 2, 4); const r = [h - d, h + d];
  return { ask: 'What are the x-intercepts (roots) of the function?', prompt: eq(vf(1, 1, h, -d * d)),
    ...mc(rand, `x = ${num(r[0])}, ${num(r[1])}`, [`x = ${num(-h - d)}, ${num(-h + d)}`, `x = ${num(h)} ± ${d}i`, `x = ${num(h - d * d)}, ${num(h + d * d)}`]),
    tell: `set y = 0: (x${term(-h)})² = ${d * d}, so x${term(-h)} = ±${d} and x = ${num(h)} ± ${d}.` };
} };

T.vertexToStandardForm = { book: 'l1', make(rand) {
  const a = pick(rand, [2, 3, -2, -3, 4]); const h = nz(rand, -4, 4); const k = nz(rand, -25, 25);
  return { ask: 'Which quadratic in standard form is the same function?', prompt: eq(vf(a, 1, h, k)),
    ...mc(rand, eq(quad(a, -2 * a * h, a * h * h + k)), [eq(quad(a, 2 * a * h, a * h * h + k)), eq(quad(a, -2 * a * h, h * h + k)), eq(quad(a, -2 * h, h * h + k))]),
    tell: `square first: (x${term(-h)})² = ${quad(1, -2 * h, h * h)}; then the ${num(a)} goes to ALL three terms: ${quad(a, -2 * a * h, a * h * h)}; then ${term(k).trim()}.` };
} };

T.namesOfTheForms = { book: 'l1', make(rand) {
  const ax2 = `ax${sup(2)} + bx + c`; const v = `a(x ${M} h)${sup(2)} + k`;
  if (rand() < 0.5) return { ask: 'A quadratic function written this way is in&hellip;', prompt: `f(x) = ${v}`, ...mc(rand, 'vertex form', ['standard form', 'slope-intercept form', 'point-slope form']), tell: 'vertex form shows the turning point (h, k) at a glance.' };
  return { ask: 'A quadratic function is in standard form when it is written as&hellip;', prompt: 'where a is not zero', ...mc(rand, ax2, [v, 'mx + b', `a(b)${sup('x')}`]), tell: 'standard form: ax² + bx + c, with a ≠ 0.' };
} };

// ---------------------------------------------------------------- 4.2 completing the square

T.addToEachSide = { book: 'l2', make(rand) {
  const half = nz(rand, -8, 8); const c = nz(rand, -20, 20); const b = 2 * half;
  return { ask: 'Complete the square: what number do you add to EACH side?', prompt: `${num(-c)} + y = ${quad(1, b, 0)}`, typed: half * half,
    tell: `add (b/2)² to each side: (${num(b)}/2)² = (${num(half)})² = ${half * half}.` };
} };

T.completeTheSquare = { book: 'l2', make(rand) {
  const h = nz(rand, -8, 8); const c = nz(rand, -20, 20); const b = -2 * h;
  return { ask: 'In vertex form, the parabola would be written as&hellip;', prompt: eq(quad(1, b, c)),
    ...mc(rand, eq(vf(1, 1, h, c - h * h)), [eq(vf(1, 1, h, c + h * h)), eq(vf(1, 1, 2 * h, c - 4 * h * h)), eq(vf(1, 1, -h, c - h * h))]),
    tell: `${num(-c)} + y = ${quad(1, b, 0)}; add ${h * h} to each side: ${num(h * h - c)} + y = (x${term(-h)})²; solve for y: y = (x${term(-h)})²${term(c - h * h)}.` };
} };

T.completeTheSquareLeading = { book: 'l2', make(rand) {
  const a = pick(rand, [2, 3, 5, -2, -3]); const h = nz(rand, -6, 6); const k = nz(rand, -25, 25); const c = k + a * h * h;
  return { ask: 'The leading coefficient is not 1: factor it out, then complete the square. Which is the vertex form?', prompt: eq(quad(a, -2 * a * h, c)),
    ...mc(rand, eq(vf(a, 1, h, k)), [eq(vf(a, 1, h, c - h * h)), eq(vf(a, 1, -h, k)), eq(vf(1, 1, h, k))]),
    tell: `factor out ${num(a)}: ${num(a)}(${quad(1, -2 * h, 0)}); the square needs ${h * h} inside, which is really ${num(a)}·${h * h} = ${num(a * h * h)}; so y = ${vf(a, 1, h, k)}.` };
} };

T.vertexFormulaX = { book: 'l2', make(rand) {
  const a = pick(rand, [1, 2, -1, -2, 3, 5]); const h = nz(rand, -6, 6); const c = nz(rand, -30, 30); const b = -2 * a * h;
  return { ask: 'Use x = −b/(2a). What is the x-coordinate of the turning point?', prompt: eq(quad(a, b, c)), typed: h, neg: true,
    tell: `x = −(${num(b)})/(2·${par(a)}) = ${num(-b)}/${num(2 * a)} = ${num(h)}. Plug it back in for the y-coordinate.` };
} };

T.turningPointOfStandardForm = { book: 'l2', make(rand) {
  const [h, k] = hk(rand, 7); const b = -2 * h; const c = k + h * h;
  if (c === 0) return T.turningPointOfStandardForm.make(rand);
  return { ask: 'Which is the turning point? (Remember how to find the x-value!)', prompt: eq(quad(1, b, c)), ...mc(rand, pt(h, k), [pt(b, c), pt(-h, 4 * h * h + k), pt(c, b)]),
    tell: `x = −b/(2a) = ${num(-b)}/2 = ${num(h)}; then y = (${num(h)})²${term(b * h)}${term(c)} = ${num(k)}.` };
} };

T.yInterceptOfStandardForm = { book: 'l2', make(rand) {
  const a = pick(rand, [1, 2, -3, 4, 5]); const [h, k] = hk(rand, 5); const b = -2 * a * h; const c = k + a * h * h;
  if (c === 0 || c === b) return T.yInterceptOfStandardForm.make(rand);
  return { ask: 'State the y-intercept as an ordered pair', prompt: eq(quad(a, b, c)), ...mc(rand, pt(0, c), [pt(c, 0), pt(0, b), pt(h, k)]),
    tell: `in standard form the y-intercept is c: set x = 0 and only ${num(c)} is left, so (0, ${num(c)}).` };
} };

T.completingTheSquareSteps = { book: 'l2', make(rand) {
  const kind = pick(rand, ['one', 'each', 'y']);
  if (kind === 'one') return { ask: 'To complete the square, the leading coefficient has to be ___. If it isn’t, factor it out.', prompt: 'fill in the blank', ...mc(rand, '1', ['0', '2', 'even']), tell: 'x² has to stand alone before you can halve b and square it.' };
  if (kind === 'each') return { ask: `Complete the square by adding (b/2)${sup(2)} to&hellip;`, prompt: 'where does it go?', ...mc(rand, 'EACH side of the equation', ['only the side with the x terms', 'only the side with y', 'the leading coefficient']), tell: 'an equation stays balanced only if both sides get the same thing.' };
  return { ask: 'The last step of completing the square to vertex form is to solve for&hellip;', prompt: 'this is where it differs from SOLVING a quadratic', ...mc(rand, 'y', ['x', 'a', 'b']), tell: 'when we SOLVE a quadratic we solve for x; here we solve for y, to get vertex form.' };
} };

// ---------------------------------------------------------------- 4.3 write the equation

/** A vertex, an integer a and a second point close to the vertex. */
function vertexAndPoint(rand) {
  for (;;) {
    const h = int(rand, -10, 6); const k = int(rand, -12, 9); const d = pick(rand, [-3, -2, -1, 1, 2, 3]); const a = nz(rand, -5, 12);
    const x = h + d; const y = k + a * d * d;
    // x ≠ 0: at x = 0 the wrong-sign substitution (0 + h)² equals (0 − h)², and a wrong choice would be true
    if (Math.abs(y) > 110 || Math.abs(h) === Math.abs(k) || h === 0 || k === 0 || x === 0) continue;
    return { h, k, d, a, x, y };
  }
}

T.solveForA = { book: 'l3', make(rand) {
  const { h, k, d, a, x, y } = vertexAndPoint(rand);
  return { ask: `A quadratic has its vertex at ${pt(h, k)} and passes through ${pt(x, y)}. Find a.`, prompt: `${num(y)} = a(${num(x)}${term(-h)})${sup(2)}${term(k)}`, typed: a, neg: true,
    tell: `(${num(x)}${term(-h)})² = ${d * d}, so ${num(y)} = ${d * d === 1 ? '' : d * d}a${term(k)}; ${d * d === 1 ? '' : `${d * d}`}a = ${num(y - k)}; a = ${num(a)}.` };
} };

T.substituteTheVertex = { book: 'l3', make(rand) {
  const { h, k, x, y } = vertexAndPoint(rand);
  const line = (yy, xx, hh, kk) => `${num(yy)} = a(${num(xx)}${term(-hh)})${sup(2)}${term(kk)}`;
  return { ask: `Vertex at ${pt(h, k)}, passes through ${pt(x, y)}. Which equation do you solve for a?`, prompt: `y = a(x ${M} h)${sup(2)} + k`,
    ...mc(rand, line(y, x, h, k), [line(y, x, -h, k), line(k, h, x, y), line(y, x, k, h)]),
    tell: `h and k come from the vertex, x and y from the other point — and in vertex form the x-coordinate of the vertex has the opposite sign: (x${term(-h)}).` };
} };

T.equationFromVertexAndPoint = { book: 'l3', make(rand) {
  const { h, k, a, x, y } = vertexAndPoint(rand);
  return { ask: `Write the equation: vertex at ${pt(h, k)}, passes through ${pt(x, y)}`, prompt: 'Your answer should be in vertex form.',
    ...mc(rand, eq(vf(a, 1, h, k)), [eq(vf(a, 1, -h, k)), eq(vf(-a, 1, h, k)), eq(vf(a, 1, k, h)), ...(Math.abs(a) === 1 ? [] : [eq(vf(1, 1, h, k))])]),
    tell: `substitute: ${num(y)} = a(${num(x)}${term(-h)})²${term(k)} gives a = ${num(a)}; then put a, h and k back into vertex form.` };
} };

T.fractionA = { book: 'l3', make(rand) {
  const [d, p, q] = pick(rand, [[2, 1, 2], [2, -1, 2], [2, 1, 4], [2, 3, 4], [2, -3, 2], [3, 1, 3], [3, -1, 3], [3, 2, 3], [3, -2, 3], [4, 1, 4], [4, -1, 2], [4, 3, 8]]);
  const h = nz(rand, -9, 6); const k = int(rand, -9, 9); const s = pick(rand, [1, -1]); const x = h + s * d; const y = k + (p * d * d) / q;
  return { ask: `A quadratic has its vertex at ${pt(h, k)} and passes through ${pt(x, y)}. Find a.`, prompt: `${num(y)} = a(${num(x)}${term(-h)})${sup(2)}${term(k)}`,
    ...mc(rand, frac(p, q), [frac(q, p), frac(-p, q), frac(p * d, q), frac(p * d * d, q)]),
    tell: `(${num(x)}${term(-h)})² = ${d * d}, so ${d * d}a = ${num(y - k)} and a = ${num(y - k)}/${d * d} = ${frac(p, q)}.` };
} };

// ---------------------------------------------------------------- 4.4 shifting

T.shiftRule = { book: 'l4', make(rand) {
  const c = int(rand, 2, 9);
  const rows = [[`f(x) + ${c}`, `up ${c}`], [`f(x) ${M} ${c}`, `down ${c}`], [`f(x ${M} ${c})`, `right ${c}`], [`f(x + ${c})`, `left ${c}`]];
  const [rule, ans] = pick(rand, rows);
  return { ask: 'g is a translation of f. Which way, and how far?', prompt: `g(x) = ${rule}`, ...mc(rand, ans, rows.map((r) => r[1]).filter((a) => a !== ans)),
    tell: /\(x/.test(rule) ? 'a change INSIDE the parentheses moves the graph left or right — and the opposite way from the sign. This may seem counterintuitive, but it is correct!' : 'a number added or subtracted OUTSIDE moves the graph up or down, the way the sign says.' };
} };

T.shiftsFromVertexForm = { book: 'l4', make(rand) {
  const [h, k] = hk(rand);
  const say = (a, b) => `${shiftH(a)}, ${shiftK(b)}`;
  return { ask: 'What transformations occurred to the parent function y = x²?', prompt: eq(vf(1, 1, h, k)), ...mc(rand, say(h, k), [say(-h, k), say(h, -k), say(k, h)]),
    tell: `the vertex moved from (0, 0) to (${num(h)}, ${num(k)}): ${say(h, k)}.` };
} };

T.shiftWordsToEquation = { book: 'l4', make(rand) {
  const h = nz(rand, -15, 15); let k = nz(rand, -23, 23); while (Math.abs(k) === Math.abs(h)) k = nz(rand, -23, 23);
  const hw = `shifted ${Math.abs(h)} ${h > 0 ? 'right' : 'left'}`; const kw = `shifted ${Math.abs(k)} ${k > 0 ? 'up' : 'down'}`;
  const words = rand() < 0.5 ? `${hw}, ${kw}` : `${kw}, ${hw}`;
  return { ask: `Write the vertex form of the quadratic with these transformations: ${words}`, prompt: 'Choose the equation.', ...mc(rand, eq(vf(1, 1, h, k)), [eq(vf(1, 1, -h, k)), eq(vf(1, 1, h, -k)), eq(vf(1, 1, k, h))]),
    tell: `${hw} goes inside with the opposite sign, (x${term(-h)}); ${kw} goes outside as ${term(k).trim()}.` };
} };

T.pointAfterShift = { book: 'l4', make(rand) {
  const x0 = nz(rand, -3, 3); const y0 = x0 * x0; const c = int(rand, 2, 6); const dir = pick(rand, ['up', 'down', 'left', 'right']);
  const moved = { up: [x0, y0 + c], down: [x0, y0 - c], left: [x0 - c, y0], right: [x0 + c, y0] };
  return { ask: `The point ${pt(x0, y0)} is on f(x) = x². g is f translated ${c} units ${dir}. What point corresponds to it on g?`, prompt: 'What do you notice about the x- and y-coordinates?',
    ...mc(rand, pt(...moved[dir]), Object.keys(moved).filter((d) => d !== dir).map((d) => pt(...moved[d]))),
    tell: dir === 'up' || dir === 'down' ? `${dir} changes only the y-coordinate: ${num(y0)} ${dir === 'up' ? '+' : '−'} ${c} = ${num(moved[dir][1])}.` : `${dir} changes only the x-coordinate: ${num(x0)} ${dir === 'right' ? '+' : '−'} ${c} = ${num(moved[dir][0])}.` };
} };

T.vertexAfterShifts = { book: 'l4', make(rand) {
  const [h, k] = hk(rand);
  return { ask: `The parent function y = x² is shifted ${Math.abs(h)} ${h > 0 ? 'right' : 'left'} and ${Math.abs(k)} ${k > 0 ? 'up' : 'down'}. State the vertex.`, prompt: 'The vertex starts at (0, 0).', ...mc(rand, pt(h, k), [pt(-h, k), pt(h, -k), pt(k, h)]),
    tell: `left/right changes x, up/down changes y: (${num(h)}, ${num(k)}).` };
} };

T.shiftedGraphToEquation = { book: 'l4', make(rand) {
  const h = nz(rand, -5, 5); let k = int(rand, -7, 4); if (k === 0 || Math.abs(k) === Math.abs(h)) k = Math.abs(h) === 1 ? -3 : -1;
  return { ask: 'Write the vertex form for the graph', prompt: 'Use the graph. Compare it with the parent function, y = x².', fig: parabolaFig(1, h, k), ...mc(rand, eq(vf(1, 1, h, k)), [eq(vf(1, 1, -h, k)), eq(vf(1, 1, h, -k)), eq(vf(1, 1, k, h))]),
    tell: `the vertex is at (${num(h)}, ${num(k)}): ${shiftH(h)}, ${shiftK(k)}, so y = ${vf(1, 1, h, k)}.` };
} };

T.standardFormToShifts = { book: 'l4', make(rand) {
  const h = nz(rand, -7, 7); let k = nz(rand, -30, 30); while (Math.abs(k) === Math.abs(h) || k + h * h === 0) k = nz(rand, -30, 30);
  const say = (a, b) => `${shiftH(a)}, ${shiftK(b)}`;
  return { ask: 'Write it in vertex form, then state the transformations that occurred to the parent function', prompt: eq(quad(1, -2 * h, k + h * h)), ...mc(rand, say(h, k), [say(-h, k), say(h, -k), say(-2 * h, k + h * h)]),
    tell: `complete the square: y = ${vf(1, 1, h, k)}; turning point (${num(h)}, ${num(k)}), so ${say(h, k)}.` };
} };

// ---------------------------------------------------------------- 4.5 reflecting

T.reflectionRule = { book: 'l5', make(rand) {
  const overX = rand() < 0.5;
  return { ask: 'Which transformation is it?', prompt: overX ? `y = ${M}f(x)` : `y = f(${M}x)`, ...mc(rand, overX ? 'reflect over the x-axis' : 'reflect over the y-axis', [overX ? 'reflect over the y-axis' : 'reflect over the x-axis', 'reflect over the line y = x', overX ? 'a vertical shift down' : 'a horizontal shift left']),
    tell: overX ? 'a negative OUTSIDE the function changes the sign of every y-value: the graph flips over the x-axis.' : 'a negative INSIDE the function changes the sign of every x-value: the graph flips over the y-axis.' };
} };

T.reflectOverTheXAxis = { book: 'l5', make(rand) {
  const k = nz(rand, -9, 9); const x2 = `x${sup(2)}`;
  return { ask: 'After a reflection over the x-axis, the parabola would have the equation&hellip;', prompt: eq(`${x2}${term(k)}`), ...mc(rand, eq(`${M}${x2}${term(-k)}`), [eq(`${x2}${term(-k)}`), eq(`${M}${x2}${term(k)}`), eq(`${x2}${term(2 * k)}`)]),
    tell: `−f(x) changes the sign of the WHOLE function: −(x²${term(k)}) = −x²${term(-k)}. The shift flips too — sketch it to see.` };
} };

T.reflectOverTheYAxis = { book: 'l5', make(rand) {
  const k = nz(rand, -9, 9); const x2 = `x${sup(2)}`; const nx2 = `(${M}x)${sup(2)}`;
  return { ask: 'g(x) is the reflection of f(x) across the y-axis. What is an equation for g(x)?', prompt: `f(x) = ${x2}${term(k)}`, ...mc(rand, `g(x) = ${nx2}${term(k)}`, [`g(x) = ${M}(${x2}${term(k)})`, `g(x) = ${nx2}${term(-k)}`, `g(x) = ${M}${x2}${term(k)}`]),
    tell: `a reflection across the y-axis is f(−x): replace x with −x and leave everything else alone — (−x)²${term(k)}.` };
} };

T.pointAfterReflection = { book: 'l5', make(rand) {
  const [a, b] = hk(rand); const overX = rand() < 0.5;
  return { ask: `The point ${pt(a, b)} lies on the graph of h(x). Which point must lie on the graph of ${overX ? `${M}h(x)` : `h(${M}x)`}?`, prompt: overX ? 'a reflection over the x-axis' : 'a reflection over the y-axis',
    ...mc(rand, overX ? pt(a, -b) : pt(-a, b), [pt(-a, -b), overX ? pt(-a, b) : pt(a, -b), pt(b, a)]),
    tell: overX ? `−h(x) changes the sign of the y-coordinate only: (${num(a)}, ${num(-b)}).` : `h(−x) changes the sign of the x-coordinate only: (${num(-a)}, ${num(b)}).` };
} };

T.vertexAfterReflection = { book: 'l5', make(rand) {
  const [h, k] = hk(rand, 7); const overX = rand() < 0.5;
  return { ask: `f has its vertex at ${pt(h, k)}. What is the new vertex of ${overX ? `${M}f(x)` : `f(${M}x)`}?`, prompt: `f(x) = ${vf(1, 1, h, k)}`, ...mc(rand, overX ? pt(h, -k) : pt(-h, k), [pt(-h, -k), overX ? pt(-h, k) : pt(h, -k), pt(k, h)]),
    tell: overX ? 'reflecting over the x-axis flips the vertex to the other side of the x-axis: its y-coordinate changes sign.' : 'reflecting over the y-axis flips the vertex to the other side of the y-axis: its x-coordinate changes sign.' };
} };

T.listWithAReflection = { book: 'l5', make(rand) {
  const [h, k] = hk(rand);
  if (rand() < 0.35) {
    const C = (ax, kk) => `reflect over the ${ax}-axis, ${shiftK(kk)}`;
    return { ask: 'List the transformations (do not abbreviate)', prompt: eq(`(${M}x)${sup(2)}${term(k)}`), ...mc(rand, C('y', k), [C('x', k), C('y', -k), `reflect over the y-axis, ${shiftH(-k)}`]), tell: 'the negative is INSIDE with the x, so it is a reflection over the y-axis; then the shift.' };
  }
  return { ask: 'List the transformations (do not abbreviate)', prompt: eq(vf(-1, 1, h, k)), ...mc(rand, describe(-1, 1, h, k), [describe(-1, 1, h, k, { toggleReflect: true }), describe(-1, 1, h, k, { yAxis: true }), describe(-1, 1, h, k, { flipH: true }), describe(-1, 1, h, k, { flipK: true })]),
    tell: `the negative in front is a reflection over the x-axis; (x${term(-h)}) is ${shiftH(h)}; ${term(k).trim()} is ${shiftK(k)}.` };
} };

T.reflectionWordsToEquation = { book: 'l5', make(rand) {
  const [h, k] = hk(rand);
  if (rand() < 0.35) {
    const nx2 = `(${M}x)${sup(2)}`;
    return { ask: `Create the equation: reflection across the y-axis, and translated ${Math.abs(k)} units ${k > 0 ? 'up' : 'down'}`, prompt: 'Choose the equation in vertex form.', ...mc(rand, eq(`${nx2}${term(k)}`), [eq(`${M}x${sup(2)}${term(k)}`), eq(`${nx2}${term(-k)}`), eq(`${M}(x${term(-k)})${sup(2)}`)]),
      tell: 'a y-axis reflection is written (−x)², with the negative inside; the vertical shift goes outside.' };
  }
  return { ask: `Create the equation: reflection across the x-axis, shifted ${Math.abs(h)} to the ${h > 0 ? 'right' : 'left'} and ${k > 0 ? 'up' : 'down'} ${Math.abs(k)}`, prompt: 'Choose the equation in vertex form.',
    ...mc(rand, eq(vf(-1, 1, h, k)), [eq(vf(-1, 1, -h, k)), eq(vf(1, 1, h, k)), eq(vf(-1, 1, h, -k))]),
    tell: `the reflection over the x-axis is the negative in front; ${shiftH(h)} is (x${term(-h)}); ${shiftK(k)} is ${term(k).trim()}.` };
} };

T.reflectedGraphToEquation = { book: 'l5', make(rand) {
  const h = nz(rand, -5, 5); let k = int(rand, 2, 7); if (k === Math.abs(h)) k += 1;
  return { ask: 'Which equation represents the graph shown?', prompt: 'Use the graph.', fig: parabolaFig(-1, h, k),
    ...mc(rand, eq(vf(-1, 1, h, k)), [eq(vf(1, 1, -h, k)), eq(vf(-1, 1, -h, k)), eq(`(${M}x${term(-h)})${sup(2)}${term(-k)}`)]),
    tell: `it opens down (reflect over the x-axis) with its vertex at (${num(h)}, ${num(k)}): ${shiftH(h)}, ${shiftK(k)}.` };
} };

// ---------------------------------------------------------------- 4.6 vertical stretch & compression

const V_FACTORS = [[2, 1], [3, 1], [4, 1], [5, 1], [7, 1], [1, 2], [1, 3], [1, 4], [2, 3], [3, 2], [4, 3], [2, 5]];

T.stretchOrCompression = { book: 'l6', make(rand) {
  const [p, q] = pick(rand, V_FACTORS); const stretch = p > q; const c = frac(p, q); const r = frac(q, p);
  const w = stretch ? 'stretch' : 'compression'; const o = stretch ? 'compression' : 'stretch';
  return { ask: 'What transformation occurred to the parent function y = x²?', prompt: eq(`${lead(p, q)}x${sup(2)}`), ...mc(rand, `vertical ${w} by ${c}`, [`vertical ${o} by ${c}`, `vertical ${w} by ${r}`, `up ${c}`]),
    tell: stretch ? `c · f(x) with c > 1 is a vertical stretch: every y-coordinate is multiplied by ${c}.`.replace('>', '&gt;') : `c · f(x) with 0 < c < 1 is a vertical compression: every y-coordinate is multiplied by ${c}.`.replace(/</g, '&lt;') };
} };

T.pointOnCf = { book: 'l6', make(rand) {
  const [p, q] = pick(rand, [[2, 1], [3, 1], [1, 2]]); const x0 = 2 * nz(rand, -6, 6); const y0 = 2 * nz(rand, -6, 6); const s = (v) => (v * p) / q; const u = (v) => (v * q) / p;
  if (!Number.isInteger(u(x0)) || !Number.isInteger(u(y0)) || Math.abs(x0) === Math.abs(y0)) return T.pointOnCf.make(rand);
  return { ask: `The point ${pt(x0, y0)} lies on the graph of f(x). Which point must lie on the graph of ${lead(p, q)}f(x)?`, prompt: 'a vertical dilation', ...mc(rand, pt(x0, s(y0)), [pt(s(x0), s(y0)), pt(s(x0), y0), pt(u(x0), u(y0))]),
    tell: `multiply the y-coordinate by ${frac(p, q)} and leave x alone: (${num(x0)}, ${num(s(y0))}).` };
} };

T.whichCoordinates = { book: 'l6', make(rand) {
  const [p, q] = pick(rand, [[2, 1], [3, 1], [1, 2], [1, 3], [4, 1]]); const c = frac(p, q); const r = frac(q, p);
  return { ask: `To graph g(x) = ${lead(p, q)}f(x), we must multiply the ___-coordinates of each point by ___.`, prompt: p > q ? 'a vertical stretch' : 'a vertical compression', ...mc(rand, `y-coordinates by ${c}`, [`x-coordinates by ${c}`, `y-coordinates by ${r}`, `x-coordinates by ${r}`]),
    tell: `vertical means the heights change: each y-coordinate is multiplied by ${c}; the x-coordinates stay.` };
} };

T.readA = { book: 'l6', make(rand) {
  const a = pick(rand, [2, 3, 4, 5, -2, -3, -4]); const h = int(rand, -6, 6); const k = int(rand, -7, 7);
  return { ask: `A transformed parabola has its vertex at ${pt(h, k)} and passes through ${pt(h + 1, k + a)}. What is a?`, prompt: 'Know the parent function: from the vertex, over 1, up 1.', typed: a, neg: true,
    tell: `one step to the right of the vertex the parent goes up 1; this one goes ${a < 0 ? 'down' : 'up'} ${Math.abs(a)}, so a = ${num(a)}.` };
} };

T.namethreeTransformations = { book: 'l6', make(rand) {
  const a = pick(rand, [-5, -3, -2, -4]); const k = nz(rand, -9, 9);
  return { ask: 'What three transformations occurred to the graph of f(x) = x² to produce g?', prompt: `g(x) = ${vf(a, 1, 0, k)}`, ...mc(rand, describe(a, 1, 0, k), [describe(a, 1, 0, k, { flipWord: true }), describe(a, 1, 0, k, { yAxis: true }), describe(a, 1, 0, k, { flipK: true })]),
    tell: `the negative is a reflection over the x-axis; ${-a} > 1 is a vertical stretch by ${-a}; ${term(k).trim()} is ${shiftK(k)}.`.replace('>', '&gt;') };
} };

T.stretchWordsToEquation = { book: 'l6', make(rand) {
  const x2 = `x${sup(2)}`;
  if (rand() < 0.5) {
    const c = pick(rand, [2, 3, 4, 5]);
    return { ask: `h(x) is a vertical stretch by ${c} followed by a reflection in the x-axis of f(x) = x². Then h(x) =`, prompt: 'Choose the equation.', ...mc(rand, `h(x) = ${M}${c}${x2}`, [`h(x) = ${c}(${M}x)${sup(2)}`, `h(x) = ${M}${fr(1, c)}${x2}`, `h(x) = ${fr(1, c)}${x2}`]),
      tell: `a stretch by ${c} multiplies by ${c}; a reflection in the x-axis puts a negative in front: −${c}x².` };
  }
  const n = pick(rand, [2, 3, 4, 5]); const d = int(rand, 2, 9);
  return { ask: `The graph of y = x² is compressed by a factor of ${n} in the vertical direction and then shifted ${d} units down. Its equation is&hellip;`, prompt: 'Choose the equation.',
    ...mc(rand, eq(`${fr(1, n)}${x2} ${M} ${d}`), [eq(`${M}${d}${x2} ${M} ${n}`), eq(`${M}${n}${x2} ${M} ${d}`), eq(`${M}${fr(1, n)}${x2} + ${d}`), eq(`${n}${x2} ${M} ${d}`)]),
    tell: `compressed by a factor of ${n} means every height is divided by ${n}: a = 1/${n}. Down ${d} is − ${d}.` };
} };

T.shiftComesLast = { book: 'l6', make(rand) {
  const [p, q] = pick(rand, [[-1, 2], [-2, 1], [-3, 1], [-1, 3]]); const k = nz(rand, -8, 8);
  const parts = ['reflect over the x-axis', `vertical ${Math.abs(p) > q ? 'stretch' : 'compression'} by ${frac(Math.abs(p), q)}`, shiftK(k)];
  return { ask: 'Three transformations of f(x) = x² produce h. Which one must come LAST?', prompt: `h(x) = ${vf(p, q, 0, k)}`, ...mc(rand, parts[2], [parts[0], parts[1]]),
    tell: `the stretch or compression and the reflection (in either order) come first; the shift ${shiftK(k)} must be last — otherwise it would be multiplied too.` };
} };

T.pointsThatStay = { book: 'l6', make(rand) {
  return { ask: 'When f is vertically stretched or compressed, which points do NOT move?', prompt: 'g(x) = c · f(x)', ...mc(rand, 'the x-intercepts', ['the vertex', 'the y-intercept', 'none — every point moves']),
    tell: 'each y-coordinate is multiplied by c, and at an x-intercept the y-coordinate is 0: 0 times anything is still 0.' };
} };

T.narrowerOrWider = { book: 'l6', make(rand) {
  const pool = sample(rand, [[1, 4], [1, 2], [2, 3], [1, 1], [2, 1], [3, 1], [5, 1], [3, 2]], 4).map(([p, q]) => [rand() < 0.4 ? -p : p, q]);
  const narrow = rand() < 0.5; const size = ([p, q]) => Math.abs(p) / q;
  const best = pool.reduce((a, b) => ((narrow ? size(b) > size(a) : size(b) < size(a)) ? b : a));
  const show = ([p, q]) => eq(`${lead(p, q)}x${sup(2)}`);
  return { ask: `Which graph is the ${narrow ? 'narrowest' : 'widest'}?`, prompt: 'Compare the equations.', ...mc(rand, show(best), pool.filter((x) => x !== best).map(show)),
    tell: `the size of a decides it (the sign only flips the graph): the ${narrow ? 'largest' : 'smallest'} |a| here is ${frac(Math.abs(best[0]), best[1])}, which ${narrow ? 'stretches the graph the most, so it looks narrowest' : 'compresses the graph the most, so it looks widest'}.` };
} };

// ---------------------------------------------------------------- 4.7 multi-step transformations

/** a, h, k with at least three things going on. */
function multi(rand) {
  for (;;) {
    const [p, q] = pick(rand, A_ALL); const h = int(rand, -6, 6); const k = int(rand, -8, 8);
    const count = (p < 0 ? 1 : 0) + (Math.abs(p) !== q ? 1 : 0) + (h ? 1 : 0) + (k ? 1 : 0);
    if (count < 3 || Math.abs(h) === Math.abs(k)) continue;
    return { p, q, h, k };
  }
}

T.listAllTransformations = { book: 'l7', make(rand) {
  const { p, q, h, k } = multi(rand);
  const variants = [Math.abs(p) !== q ? { flipWord: true } : null, h ? { flipH: true } : null, k ? { flipK: true } : null, { toggleReflect: true }, p < 0 ? { yAxis: true } : null].filter(Boolean);
  return { ask: 'Identify the transformations that occurred to the parent function', prompt: eq(vf(p, q, h, k)), ...mc(rand, describe(p, q, h, k), variants.map((o) => describe(p, q, h, k, o))),
    tell: `${p < 0 ? 'the negative in front reflects over the x-axis; ' : ''}${Math.abs(p) !== q ? `|a| = ${frac(Math.abs(p), q)} is a vertical ${Math.abs(p) > q ? 'stretch' : 'compression'}; ` : ''}${h ? `(x${term(-h)}) is ${shiftH(h)}; ` : ''}${k ? `${term(k).trim()} is ${shiftK(k)}` : ''}`.replace(/; $/, '') + '.' };
} };

T.multiWordsToEquation = { book: 'l7', make(rand) {
  const { p, q, h, k } = multi(rand); const ap = Math.abs(p);
  const words = [p < 0 ? 'reflect over the x-axis' : null, ap !== q ? `vertical ${ap > q ? 'stretch' : 'compression'} by ${frac(ap, q)}` : null, h ? `shifted ${h > 0 ? 'right' : 'left'} ${Math.abs(h)}` : null, k ? `shifted ${k > 0 ? 'up' : 'down'} ${Math.abs(k)}` : null].filter(Boolean).join(', ');
  return { ask: `Write the equation of y = x² after these transformations: ${words}`, prompt: 'Choose the equation.',
    ...mc(rand, eq(vf(p, q, h, k)), [h ? eq(vf(p, q, -h, k)) : null, eq(vf(-p, q, h, k)), k ? eq(vf(p, q, h, -k)) : null, ap !== q ? eq(vf(p < 0 ? -q : q, ap, h, k)) : null].filter(Boolean)),
    tell: `a = ${frac(p, q)} goes in front${h ? `; ${shiftH(h)} is (x${term(-h)})` : ''}${k ? `; ${shiftK(k)} is ${term(k).trim()}` : ''}.` };
} };

T.patternFromTheVertex = { book: 'l7', make(rand) {
  const a = pick(rand, [2, 3, -2, -3, -1, 4]); const h = int(rand, -6, 6); const k = int(rand, -8, 8);
  return { ask: 'Start at the vertex. Which point is one step to the right, on the graph?', prompt: eq(vf(a, 1, h, k)),
    ...mc(rand, pt(h + 1, k + a), [pt(h + 1, k + 1), pt(h + 1, k - a), pt(h + a, k + 1), ...(h === 1 ? [] : [pt(-h + 1, k + a)])]), // h = 1: that point IS on the graph, one step left
    tell: `the vertex is (${num(h)}, ${num(k)}). The parent's pattern is over 1, up 1; with a = ${num(a)} it is over 1, ${a < 0 ? 'down' : 'up'} ${Math.abs(a)}: (${num(h + 1)}, ${num(k + a)}).` };
} };

T.graphToEquationMulti = { book: 'l7', make(rand) {
  for (;;) {
    const [p, q] = pick(rand, [[2, 1], [-2, 1], [-1, 1], [3, 1], [-3, 1], [1, 2], [-1, 2]]); const h = nz(rand, -5, 5); const k = p > 0 ? int(rand, -8, 2) : int(rand, -2, 8);
    if (k === 0 || Math.abs(h) === Math.abs(k)) continue;
    return { ask: 'The parent function (red) and a transformation of it (blue) are graphed. Write the equation of the transformed function.', prompt: 'Use the graph.', fig: parabolaFig(p / q, h, k, { parent: true }),
      ...mc(rand, eq(vf(p, q, h, k)), [eq(vf(p, q, -h, k)), eq(vf(-p, q, h, k)), Math.abs(p) !== q ? eq(vf(p < 0 ? -q : q, Math.abs(p), h, k)) : eq(vf(2 * p, q, h, k)), eq(vf(p, q, h, -k))]),
      tell: `vertex (${num(h)}, ${num(k)}); one step right of the vertex the graph goes ${p < 0 ? 'down' : 'up'} ${frac(Math.abs(p), q)}, so a = ${frac(p, q)}: ${describe(p, q, h, k)}.` };
  }
} };

T.yInterceptValue = { book: 'l7', make(rand) {
  const a = pick(rand, [1, -1, 2, -2, 3, 7]); const h = nz(rand, -5, 5); const k = int(rand, -9, 9);
  return { ask: 'The y-intercept is (0, ?). What is the missing value?', prompt: eq(vf(a, 1, h, k)), typed: a * h * h + k, neg: true,
    tell: `set x = 0: ${a === 1 ? '' : a === -1 ? '−' : a}(${num(-h)})²${term(k)} = ${num(a * h * h)}${term(k)} = ${num(a * h * h + k)}.` };
} };

// ---------------------------------------------------------------- 4.8 horizontal stretch & compression

const H_COEFS = [[2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [1, 3], [1, 4], [1, 5], [3, 4], [2, 3], [3, 2], [7, 5]];
/** (cx)² with c = p/q printed inside the square, negative allowed. */
const inside = (p, q) => `(${p < 0 ? M : ''}${q === 1 ? (Math.abs(p) === 1 ? '' : Math.abs(p)) : fr(Math.abs(p), q)}x)${sup(2)}`;
const hWord = (p, q) => (Math.abs(p) > q ? 'compression' : 'stretch');

T.horizontalRule = { book: 'l8', make(rand) {
  const kind = pick(rand, ['big', 'small', 'note', 'coords']);
  const C = ['a horizontal compression', 'a horizontal stretch', 'a vertical stretch', 'a vertical compression'];
  if (kind === 'big') return { ask: 'h(x) = f(cx) with c &gt; 1 represents&hellip;', prompt: 'h(x) = f(cx)', ...mc(rand, C[0], [C[1], C[2], C[3]]), tell: 'counterintuitive but correct: a coefficient greater than 1 INSIDE squeezes the graph toward the y-axis.' };
  if (kind === 'small') return { ask: 'h(x) = f(cx) with 0 &lt; c &lt; 1 represents&hellip;', prompt: 'h(x) = f(cx)', ...mc(rand, C[1], [C[0], C[2], C[3]]), tell: 'a coefficient between 0 and 1 INSIDE pulls the graph away from the y-axis.' };
  if (kind === 'note') return { ask: 'For a horizontal dilation, take the ___ of the coefficient of x THEN decide whether it is a stretch or shrink.', prompt: 'fill in the blank', ...mc(rand, 'reciprocal', ['opposite', 'square', 'square root']), tell: '(2x)² is a horizontal compression by 1/2; ((1/3)x)² is a horizontal stretch by 3.' };
  return { ask: 'A horizontal stretch or compression changes only the&hellip;', prompt: 'Focus on each point.', ...mc(rand, 'x-coordinate of each point', ['y-coordinate of each point', 'vertex', 'direction the parabola opens']), tell: 'horizontal means left and right: the x-coordinates are multiplied by the factor and the y-coordinates stay.' };
} };

T.nameTheHorizontal = { book: 'l8', make(rand) {
  const [p, q] = pick(rand, H_COEFS); const w = hWord(p, q); const o = w === 'stretch' ? 'compression' : 'stretch';
  return { ask: 'What transformation occurred to the parent function y = x²?', prompt: eq(inside(p, q)), ...mc(rand, `horizontal ${w} by ${frac(q, p)}`, [`horizontal ${o} by ${frac(q, p)}`, `horizontal ${o} by ${frac(p, q)}`, `vertical ${o} by ${frac(p, q)}`]),
    tell: `take the reciprocal of the coefficient of x: ${frac(p, q)} becomes ${frac(q, p)}, and ${frac(q, p)} is ${w === 'stretch' ? 'more than 1 — a stretch' : 'less than 1 — a compression'}.` };
} };

T.horizontalWordsToEquation = { book: 'l8', make(rand) {
  const n = pick(rand, [2, 3, 4, 5]); const d = nz(rand, -9, 9); const stretch = rand() < 0.5;
  const right = stretch ? inside(1, n) : inside(n, 1); const other = stretch ? inside(n, 1) : inside(1, n);
  const outside = stretch ? `${fr(1, n)}x${sup(2)}` : `${n}x${sup(2)}`;
  return { ask: `Write the equation: horizontal ${stretch ? `stretch by a factor of ${n}` : `compression by 1/${n}`}, and shifted ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} units`, prompt: 'Choose the equation.',
    ...mc(rand, eq(`${right}${term(d)}`), [eq(`${other}${term(d)}`), eq(`${outside}${term(d)}`), eq(`${right}${term(-d)}`)]),
    tell: `the coefficient of x is the RECIPROCAL of the factor and it stays inside the square: ${stretch ? `((1/${n})x)²` : `(${n}x)²`}; then ${shiftK(d)}.` };
} };

T.pointAfterHorizontal = { book: 'l8', make(rand) {
  const n = pick(rand, [2, 3, 4]); const stretch = rand() < 0.6; const m = pick(rand, [-2, -1, 1, 2]);
  const x0 = stretch ? m : m * n; const y0 = x0 * x0; const nx = stretch ? x0 * n : x0 / n;
  if (Math.abs(x0) === 1 && !stretch) return T.pointAfterHorizontal.make(rand);
  return { ask: `The point ${pt(x0, y0)} is on y = x². Which point is on y = ${stretch ? inside(1, n) : inside(n, 1)}?`, prompt: `a horizontal ${stretch ? `stretch by ${n}` : `compression by 1/${n}`}`,
    ...mc(rand, pt(nx, y0), [pt(x0, stretch ? y0 * n : y0 / n), pt(nx, stretch ? y0 * n : y0 / n), pt(stretch ? x0 / n : x0 * n, y0)].filter((s) => !/\./.test(s))),
    tell: `only the x-coordinate changes: ${num(x0)} ${stretch ? `× ${n}` : `÷ ${n}`} = ${num(nx)}, and the height stays ${num(y0)}.` };
} };

T.listWithAHorizontal = { book: 'l8', make(rand) {
  const [p0, q] = pick(rand, H_COEFS); const refY = rand() < 0.4; const refX = !refY && rand() < 0.5; const k = nz(rand, -9, 9); const p = refY ? -p0 : p0;
  const expr = `${refX ? M : ''}${inside(p, q)}${term(k)}`;
  const say = (o = {}) => [refX !== !!o.swap && !refY ? 'reflect over the x-axis' : null, refY !== !!o.swap && !refX ? 'reflect over the y-axis' : null,
    refX && o.swap ? 'reflect over the y-axis' : null, refY && o.swap ? 'reflect over the x-axis' : null,
    `horizontal ${(hWord(p0, q) === 'stretch') !== !!o.word ? 'stretch' : 'compression'} by ${o.raw ? frac(p0, q) : frac(q, p0)}`, shiftK(o.k ? -k : k)].filter(Boolean).join(', ');
  return { ask: 'Identify the transformations that occurred to the parent function', prompt: eq(expr), ...mc(rand, say(), [say({ word: true }), say({ raw: true, word: true }), say({ k: true }), ...(refX || refY ? [say({ swap: true })] : [])]),
    tell: `${refX ? 'the negative OUTSIDE reflects over the x-axis; ' : ''}${refY ? 'the negative INSIDE reflects over the y-axis; ' : ''}the reciprocal of ${frac(p0, q)} is ${frac(q, p0)} — a horizontal ${hWord(p0, q)}; ${term(k).trim()} is ${shiftK(k)}.` };
} };

T.horizontalGraphToEquation = { book: 'l8', make(rand) {
  const n = pick(rand, [2, 3]); const stretch = rand() < 0.65; const k = stretch ? int(rand, -6, 3) : int(rand, -7, 0);
  if (k === 0) return T.horizontalGraphToEquation.make(rand);
  const c = stretch ? 1 / n : n; const P = plane(10); const f = (x) => (c * x) ** 2 + k;
  const xs = stretch ? [-3, -2, -1, 0, 1, 2, 3].map((m) => m * n) : [-2, -1, 0, 1, 2].map((m) => m / n);
  const dots = xs.filter((x) => Math.abs(x) <= 10 && f(x) <= 10).map((x) => P.dot(x, f(x), { r: 3 })).join('');
  const parent = `${P.curve((x) => x * x, { color: INK2, step: 0.05, width: 2 })}${[-3, -2, -1, 0, 1, 2, 3].map((x) => P.dot(x, x * x, { color: INK2, r: 3 })).join('')}`;
  const right = stretch ? inside(1, n) : inside(n, 1); const other = stretch ? inside(n, 1) : inside(1, n);
  return { ask: 'The parent function (red) and a transformation of it (blue) are graphed. Write the equation of the transformed function.', prompt: 'Use the graph. Compare the x-coordinates at the same heights.', fig: P.svg(`${parent}${P.curve(f, { step: 0.05 })}${dots}`, 'the parent function and a horizontally dilated parabola'),
    ...mc(rand, eq(`${right}${term(k)}`), [eq(`${other}${term(k)}`), eq(`${right}${term(-k)}`), eq(`${stretch ? fr(1, n) : n}x${sup(2)}${term(k)}`)]),
    tell: `the vertex moved ${shiftK(k)}; one unit above the vertex the points are at x = ±${stretch ? n : `1/${n}`} instead of ±1 — a horizontal ${stretch ? `stretch by ${n}` : `compression by 1/${n}`}, written with the reciprocal inside the square.` };
} };

module.exports = makeBank(BOOKS, T);
module.exports._parts = { describe, vf, vertexAndPoint };
