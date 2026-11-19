/**
 * Algebra 2 · Unit 2 Review — Function Algebra. Built from the teacher's unit packet ("Unit 2 –
 * Function Algebra": Lesson 1 Evaluating Functions, Lesson 2 Composition of Functions, Lesson 3
 * AROC, and the Functions Unit Review), following its proficiency scale: a number in (Level 1), a
 * monomial in or a "simple" operation (Level 2), a binomial in or a square (Level 3).
 *
 * The packet's notation is kept: operations are written out (f(x) − h(x), h(x)·f(x), a stacked
 * fraction of two values, 2f(x)), never (f + g)(x); a power of a function is [h(x)]²; composition
 * is written both ways, g(f(x)) and (g∘f)(x) — "the ∘ is NOT multiplication", "work from the
 * inside out"; AROC = (f(x₂) − f(x₁))/(x₂ − x₁) over an interval written a ≤ x ≤ b, and the
 * expression with the endpoints in it is the "difference quotient". When the input is in terms of
 * x "you should have x in your answer".
 *
 * Wrong choices are the packet's own traps: the wrong order of a composition, multiplying instead
 * of composing, squaring a binomial term by term, k(x) − h(x) against h(x) − k(x), a negative not
 * distributed, x₂ − x₁ with a negative x₁, and the interval with the smallest change in y rather
 * than the smallest rate.
 */
const { M, num, int, pick, sample, makeBank, mc } = require('../prep/kit');
const { sup, nz, term, par, co, lin, quad, fr, plane, table } = require('./alg2Kit');

const BOOKS = {
  all: { name: 'Whole Unit', ch: 'Unit 2', blurb: 'Every lesson, mixed — evaluating functions, composition, average rate of change.' },
  l1: { name: 'Evaluating Functions', ch: '2.1', blurb: 'A number in, a monomial in, a binomial in; operations with functions; find x.' },
  l2: { name: 'Composition of Functions', ch: '2.2', blurb: 'g(f(x)) and (g∘f)(x) — from equations, tables and graphs; inside out; the order matters.' },
  l3: { name: 'Average Rate of Change', ch: '2.3', blurb: 'AROC from an equation, a table or a graph; the difference quotient; which interval is smallest.' },
};

const def = (name, expr, v = 'x') => `${name}(${v}) = ${expr}`;
const lines = (...xs) => xs.join('<br>');
const LE = '&le;';

const T = {};

// ---------------------------------------------------------------- 2.1 evaluating functions

T.evaluateNumber = { book: 'l1', make(rand) {
  const a = nz(rand, -9, 9); const b = nz(rand, -15, 15); const x0 = nz(rand, -10, 10); const f = pick(rand, ['f', 'g', 'h', 'k']);
  return { ask: `Evaluate ${f}(${num(x0)})`, prompt: def(f, lin([[a, 'x']], b)), typed: a * x0 + b, neg: true, tell: `${num(a)}(${num(x0)})${term(b)} = ${num(a * x0 + b)}.` };
} };

T.findTheInput = { book: 'l1', make(rand) {
  const a = pick(rand, [-7, -5, -4, -3, -2, 2, 3, 4, 5, 8]); const b = nz(rand, -15, 15); const x0 = nz(rand, -12, 20); const f = pick(rand, ['g', 'h', 'k']);
  return { ask: `Find the value of x when ${f}(x) = ${num(a * x0 + b)}`, prompt: def(f, lin([[a, 'x']], b)), typed: x0, neg: true,
    tell: `set ${lin([[a, 'x']], b)} = ${num(a * x0 + b)}: ${co(a)} = ${num(a * x0)}, so x = ${num(x0)}.` };
} };

T.coefficientTimesValue = { book: 'l1', make(rand) {
  const c = nz(rand, -9, 9); const k = pick(rand, [2, 3, 4, -2, 6]); const x0 = nz(rand, -5, 5); const d = pick(rand, [0, 0, nz(rand, -9, 9)]); const f = pick(rand, ['f', 'p']);
  const v = x0 * x0 + c;
  return { ask: `Evaluate ${k === -2 ? `${M}2` : k}${f}(${num(x0)})${term(d)}`, prompt: def(f, quad(1, 0, c)), typed: k * v + d, neg: true,
    tell: `${f}(${num(x0)}) = ${x0 * x0}${term(c)} = ${num(v)}; the ${num(k)} in front multiplies it: ${num(k)}·${par(v)}${term(d)} = ${num(k * v + d)}.` };
} };

T.combineValues = { book: 'l1', make(rand) {
  const c = nz(rand, -6, 6); const a = nz(rand, -5, 5); const b = nz(rand, -9, 9); const x1 = nz(rand, -4, 4); const x2 = nz(rand, -4, 4);
  const fv = x1 * x1 + c; const hv = a * x2 + b; const op = pick(rand, ['·', M, '+']);
  const val = op === '·' ? fv * hv : op === M ? fv - hv : fv + hv;
  return { ask: `Evaluate f(${num(x1)}) ${op} h(${num(x2)})`, prompt: lines(def('f', quad(1, 0, c)), def('h', lin([[a, 'x']], b))), typed: val, neg: true,
    tell: `f(${num(x1)}) = ${num(fv)} and h(${num(x2)}) = ${num(hv)}; ${num(fv)} ${op} ${par(hv)} = ${num(val)}.` };
} };

T.quotientOfValues = { book: 'l1', make(rand) {
  const d = pick(rand, [-4, -3, -2, 2, 3, 4, 5]); const q = nz(rand, -7, 7); const p = nz(rand, -4, 4); const b = nz(rand, -4, 5); const s = nz(rand, -5, 5); const a = nz(rand, -5, 7);
  const r = d - p * b; const t = d * q - s * a;
  return { ask: 'Evaluate', prompt: lines(def('h', lin([[s, 'x']], t)), def('f', lin([[p, 'x']], r)), fr(`h(${num(a)})`, `f(${num(b)})`)), typed: q, neg: true,
    tell: `h(${num(a)}) = ${num(d * q)} and f(${num(b)}) = ${num(d)}; ${num(d * q)} ÷ ${par(d)} = ${num(q)}.` };
} };

T.zeroPower = { book: 'l1', make(rand) {
  const k = nz(rand, -5, 5); const a = pick(rand, [2, 3, 5, 8]); const b = nz(rand, -6, 6); const x0 = int(rand, 2, 5); const mv = a * x0 + b;
  if (mv === 0 || mv === 1) return T.zeroPower.make(rand);
  return { ask: 'Evaluate', prompt: lines(def('p', quad(1, k, 0)), def('m', lin([[a, 'x']], b)), `[m(${x0})]${sup('p(0)')}`),
    ...mc(rand, '1', ['0', num(mv), num(mv * mv)]), tell: `p(0) = 0, so the exponent is 0 — and anything (here ${num(mv)}) to the 0 power is 1.` };
} };

T.tableAndEquation = { book: 'l1', make(rand) {
  const xs = sample(rand, [-4, -2, 0, 1, 3, 5, 6], 4).sort((x, y) => x - y); const ys = sample(rand, [-6, -3, -2, 1, 2, 4, 9, 11], 4);
  const i = int(rand, 0, 3); const a = nz(rand, -5, 8); const b = nz(rand, -6, 6); const x2 = nz(rand, -4, 4); const mv = a * x2 + b; const mul = rand() < 0.5;
  return { ask: `Evaluate f(${num(xs[i])}) ${mul ? '·' : '+'} m(${num(x2)})`, prompt: def('m', lin([[a, 'x']], b)), fig: table('x', xs, 'f(x)', ys), typed: mul ? ys[i] * mv : ys[i] + mv, neg: true,
    tell: `f(${num(xs[i])}) = ${num(ys[i])} from the table; m(${num(x2)}) = ${num(mv)}; ${num(ys[i])} ${mul ? '·' : '+'} ${par(mv)} = ${num(mul ? ys[i] * mv : ys[i] + mv)}.` };
} };

T.simplifyOrEvaluate = { book: 'l1', make(rand) {
  const right = pick(rand, ['2f(x) + g(x)', 'f(x)·g(x)', `[g(x)]${sup(2)}`, `f(x) ${M} g(x)`, 'f(x) + g(2)']);
  return { ask: 'Which one can only be SIMPLIFIED — you should have x in your answer?', prompt: 'f and g are functions of x.',
    ...mc(rand, right, ['2f(3) + g(1)', `f(0)·g(${M}2)`, `[g(5)]${sup(2)}`, `f(${M}4) ${M} g(2)`]),
    tell: 'when the input is x, the best you can do is simplify the expression; every other choice has numbers going in, so a number comes out.' };
} };

T.scaleAndAdd = { book: 'l1', make(rand) {
  const k = pick(rand, [2, 3, 4]); const b = nz(rand, -5, 5); const m1 = nz(rand, -8, 8); const m0 = nz(rand, -9, 9);
  if (rand() < 0.4) {
    const c = nz(rand, -9, 9);
    return { ask: `Simplify ${k}f(x)`, prompt: def('f', quad(1, 0, c)), ...mc(rand, quad(k, 0, k * c), [quad(k, 0, c), quad(1, 0, k * c), quad(k * k, 0, c), quad(k * k, 0, k * c)]),
      tell: `the ${k} multiplies EVERY term of f(x): ${k}(${quad(1, 0, c)}) = ${quad(k, 0, k * c)}.` };
  }
  return { ask: `Simplify ${k}p(x) + m(x)`, prompt: lines(def('p', quad(1, b, 0)), def('m', lin([[m1, 'x']], m0))),
    ...mc(rand, quad(k, k * b + m1, m0), [quad(k, b + m1, m0), quad(1, k * b + m1, m0), quad(k, k * b + m1, k * m0), quad(k, k * b + k * m1, k * m0)]),
    tell: `${k}(${quad(1, b, 0)}) = ${quad(k, k * b, 0)}; then add ${lin([[m1, 'x']], m0)} and combine like terms: ${quad(k, k * b + m1, m0)}.` };
} };

T.subtractFunctions = { book: 'l1', make(rand) {
  let a1; let a2; let b1; let b2;
  for (;;) { a1 = nz(rand, -9, 9); a2 = nz(rand, -9, 9); b1 = nz(rand, -12, 12); b2 = nz(rand, -12, 12); if (a1 !== a2 && a1 !== -a2 && b1 !== b2 && b1 !== -b2) break; }
  return { ask: `Simplify k(x) ${M} h(x)`, prompt: lines(def('k', lin([[a1, 'x']], b1)), def('h', lin([[a2, 'x']], b2))),
    ...mc(rand, lin([[a1 - a2, 'x']], b1 - b2), [lin([[a2 - a1, 'x']], b2 - b1), lin([[a1 - a2, 'x']], b1 + b2), lin([[a1 + a2, 'x']], b1 + b2)]),
    tell: `(${lin([[a1, 'x']], b1)}) − (${lin([[a2, 'x']], b2)}): the minus goes to BOTH terms of h, giving ${lin([[a1 - a2, 'x']], b1 - b2)}. (h(x) − k(x) would be the opposite.)` };
} };

T.multiplyFunctions = { book: 'l1', make(rand) {
  let a1; let b1; let a2; let b2;
  for (;;) { a1 = pick(rand, [1, 2, 3, -1, -2]); a2 = pick(rand, [1, 2, 3, 4]); b1 = nz(rand, -7, 7); b2 = nz(rand, -7, 7); if (a1 * b2 + a2 * b1 !== 0 && b1 * b2 !== b1 + b2) break; }
  return { ask: 'Simplify h(x)·f(x)', prompt: lines(def('h', lin([[a1, 'x']], b1)), def('f', lin([[a2, 'x']], b2))),
    ...mc(rand, quad(a1 * a2, a1 * b2 + a2 * b1, b1 * b2), [quad(a1 * a2, 0, b1 * b2), quad(a1 * a2, a1 * b2 + a2 * b1, b1 + b2), lin([[a1 + a2, 'x']], b1 + b2)]),
    tell: `distribute (${lin([[a1, 'x']], b1)})(${lin([[a2, 'x']], b2)}): ${num(a1 * a2)}x², then ${num(a1 * b2)}x and ${num(a2 * b1)}x, then ${num(b1 * b2)}.` };
} };

T.squareAFunction = { book: 'l1', make(rand) {
  const a = pick(rand, [1, 2, 3, 4, 5, 8, -5]); const b = nz(rand, -7, 7); const f = pick(rand, ['m', 'h', 'g']);
  return { ask: `Simplify [${f}(x)]${sup(2)}`, prompt: def(f, lin([[a, 'x']], b)),
    ...mc(rand, quad(a * a, 2 * a * b, b * b), [quad(a * a, 0, b * b), quad(a * a, a * b, b * b), lin([[2 * a, 'x']], 2 * b), quad(a * a, 2 * a * b, -b * b)]),
    tell: `square the WHOLE binomial: (${lin([[a, 'x']], b)})(${lin([[a, 'x']], b)}) = ${quad(a * a, 2 * a * b, b * b)} — there is a middle term.` };
} };

T.monomialInput = { book: 'l1', make(rand) {
  const v = pick(rand, ['b', 'n', 'a', 'x']);
  if (rand() < 0.5) {
    const a = pick(rand, [-5, -3, 2, 4, 8]); const c = nz(rand, -9, 9); const k = pick(rand, [2, 3, 5, 6]); const f = pick(rand, ['m', 'h', 'g']);
    return { ask: `Evaluate ${f}(${k}${v})`, prompt: def(f, lin([[a, 'x']], c)), ...mc(rand, lin([[a * k, v]], c), [lin([[a, v]], c * k), lin([[a * k, v]], c * k), lin([[a + k, v]], c)]),
      tell: `put ${k}${v} in for x: ${num(a)}(${k}${v})${term(c)} = ${lin([[a * k, v]], c)}. Only the x-term is multiplied.` };
  }
  const c = nz(rand, -9, 9); const k = pick(rand, [3, 4, 5, 9]); const a = pick(rand, [1, 1, -3, 2]);
  return { ask: `Evaluate f(${k}${v})`, prompt: def('f', quad(a, 0, c)), ...mc(rand, quad(a * k * k, 0, c, v), [quad(a * k, 0, c, v), quad(a * k * k, 0, c * k, v), quad(2 * a * k, 0, c, v)]),
    tell: `put ${k}${v} in for x and square ALL of it: (${k}${v})² = ${k * k}${v}², so ${a === 1 ? '' : `${num(a)}·`}${k * k}${v}²${term(c)} = ${quad(a * k * k, 0, c, v)}.` };
} };

T.binomialInput = { book: 'l1', make(rand) {
  let a; let b; let p; let q;
  for (;;) { a = pick(rand, [-7, -4, -3, 2, 4, 5, 8]); b = nz(rand, -9, 9); p = pick(rand, [1, 1, 2, 3]); q = nz(rand, -6, 6); if (a * q + b !== 0) break; }
  const v = pick(rand, ['x', 'a']); const f = pick(rand, ['g', 'h', 'k']); const inner = lin([[p, v]], q);
  return { ask: `Evaluate ${f}(${inner})`, prompt: def(f, lin([[a, 'x']], b)), ...mc(rand, lin([[a * p, v]], a * q + b), [lin([[a * p, v]], q + b), lin([[a * p, v]], a * q), lin([[a + p, v]], q + b)]),
    tell: `put ${inner} in for x: ${num(a)}(${inner})${term(b)} = ${lin([[a * p, v]], a * q)}${term(b)} = ${lin([[a * p, v]], a * q + b)}. The ${num(a)} goes to both terms.` };
} };

T.solveAtAnExpression = { book: 'l1', make(rand) {
  const a = pick(rand, [-3, -2, 2, 3, 4, 5, 7]); const b = nz(rand, -9, 9); const p = pick(rand, [1, 2, 3]); const q = nz(rand, -6, 6); const x0 = nz(rand, -9, 12);
  const c = a * (p * x0 + q) + b; const f = pick(rand, ['k', 'r', 'f']);
  return { ask: `Find x if ${f}(${lin([[p, 'x']], q)}) = ${num(c)}`, prompt: def(f, lin([[a, 'x']], b)), typed: x0, neg: true,
    tell: `${num(a)}(${lin([[p, 'x']], q)})${term(b)} = ${num(c)} → ${lin([[p, 'x']], q)} = ${num(p * x0 + q)} → x = ${num(x0)}.` };
} };

T.numberPlusFunction = { book: 'l1', make(rand) {
  // (no 0 or 1 in the table: adding 0 changes nothing, and multiplying by 1 would make a wrong choice right)
  const xs = sample(rand, [-4, -2, 0, 1, 3, 5], 4).sort((x, y) => x - y); const ys = sample(rand, [-6, -3, -2, 2, 4, 7, 9, 11], 4); const i = int(rand, 0, 3);
  let a; let b;
  for (;;) { a = nz(rand, -8, 8); b = nz(rand, -9, 9); if (b + ys[i] !== 0 && a + ys[i] !== 0) break; }
  const fv = ys[i];
  return { ask: `Simplify f(${num(xs[i])}) + m(x)`, prompt: def('m', lin([[a, 'x']], b)), fig: table('x', xs, 'f(x)', ys),
    ...mc(rand, lin([[a, 'x']], b + fv), [lin([[a + fv, 'x']], b), lin([[a * fv, 'x']], b * fv), lin([[a, 'x']], b)]),
    tell: `f(${num(xs[i])}) = ${num(fv)} is just a number: ${lin([[a, 'x']], b)} + ${par(fv)} = ${lin([[a, 'x']], b + fv)}. It is a constant, so it joins the constant term.` };
} };

// ---------------------------------------------------------------- 2.2 composition of functions

T.compositionMeans = { book: 'l2', make(rand) {
  const [g, f] = pick(rand, [['g', 'f'], ['f', 'g'], ['h', 'g'], ['f', 'h']]); const kind = pick(rand, ['notation', 'first', 'circle']);
  if (kind === 'notation') return { ask: `(${g}∘${f})(x) means&hellip;`, prompt: `(${g}∘${f})(x)`, ...mc(rand, `${g}(${f}(x))`, [`${f}(${g}(x))`, `${g}(x)·${f}(x)`, `${g}(x) + ${f}(x)`]), tell: `"${g} of ${f} of x": the output from ${f} becomes the input to ${g}.` };
  if (kind === 'first') return { ask: `In ${g}(${f}(x)), which function do you use FIRST?`, prompt: `${g}(${f}(x))`, ...mc(rand, `${f} — work from the inside out`, [`${g} — work from left to right`, 'it does not matter', `neither — multiply ${g} by ${f}`]), tell: `the output from ${f} becomes the input to ${g}: inside out.` };
  return { ask: `What is the ∘ in (${g}∘${f})(x)?`, prompt: `(${g}∘${f})(x)`, ...mc(rand, 'the symbol for composition', ['multiplication', 'a decimal point', 'an exponent']), tell: 'the ∘ is NOT multiplication. It is the mathematical symbol for composition.' };
} };

/** f linear, g a small quadratic or line; `order` picks which is on the outside. */
function pair(rand) {
  const a = pick(rand, [-3, -2, 2, 3, 4]); const b = nz(rand, -7, 7);
  const quadG = rand() < 0.6; const c = nz(rand, -6, 6); const m = pick(rand, [-2, 2, 3, 5, 9]);
  const f = (x) => a * x + b; const g = quadG ? (x) => x * x + c : (x) => m * x + c;
  return { f, g, fDef: def('f', lin([[a, 'x']], b)), gDef: def('g', quadG ? quad(1, 0, c) : lin([[m, 'x']], c)) };
}

T.compositionAtANumber = { book: 'l2', make(rand) {
  for (;;) {
    const P = pair(rand); const x0 = int(rand, -4, 5); const fOut = rand() < 0.5; const circle = rand() < 0.5;
    const inner = fOut ? P.g(x0) : P.f(x0); const val = fOut ? P.f(inner) : P.g(inner);
    if (Math.abs(inner) > 12 || Math.abs(val) > 160) continue;
    const [o, i] = fOut ? ['f', 'g'] : ['g', 'f'];
    return { ask: `Evaluate ${circle ? `(${o}∘${i})(${num(x0)})` : `${o}(${i}(${num(x0)}))`}`, prompt: lines(P.fDef, P.gDef), typed: val, neg: true,
      tell: `inside out: ${i}(${num(x0)}) = ${num(inner)}, then ${o}(${num(inner)}) = ${num(val)}.` };
  }
} };

T.composeWithItself = { book: 'l2', make(rand) {
  for (;;) {
    const a = pick(rand, [-3, -2, 2, 3, 4]); const b = nz(rand, -7, 7); const x0 = int(rand, -3, 4); const first = a * x0 + b; const val = a * first + b;
    if (Math.abs(val) > 99 || first === x0) continue;
    const f = pick(rand, ['f', 'g', 'h']); const circle = rand() < 0.5;
    return { ask: `Evaluate ${circle ? `(${f}∘${f})(${num(x0)})` : `${f}(${f}(${num(x0)}))`}`, prompt: def(f, lin([[a, 'x']], b)), typed: val, neg: true,
      tell: `${f}(${num(x0)}) = ${num(first)}; put that back into ${f}: ${f}(${num(first)}) = ${num(val)}.` };
  }
} };

T.rootComposition = { book: 'l2', make(rand) {
  const d = int(rand, 1, 9);
  if (rand() < 0.5) {
    const r = int(rand, 1, 6); const c = int(rand, 1, 12); const x0 = r * r + d;
    return { ask: `Evaluate h(g(${x0}))`, prompt: lines(def('h', quad(1, 0, c)), def('g', `√(x ${M} ${d})`)), typed: r * r + c,
      tell: `g(${x0}) = √(${x0} − ${d}) = √${r * r} = ${r}; h(${r}) = ${r * r} + ${c} = ${r * r + c}.` };
  }
  const x0 = int(rand, 0, 4); const s = x0 + int(rand, 1, 3); const c = d + s * s - x0 * x0;
  return { ask: `Evaluate g(h(${x0}))`, prompt: lines(def('h', quad(1, 0, c)), def('g', `√(x ${M} ${d})`)), typed: s,
    tell: `h(${x0}) = ${x0 * x0} + ${c} = ${x0 * x0 + c}; g(${x0 * x0 + c}) = √(${x0 * x0 + c} − ${d}) = √${s * s} = ${s}.` };
} };

T.tripleComposition = { book: 'l2', make(rand) {
  for (;;) {
    const a = pick(rand, [2, 3, -2]); const b = nz(rand, -4, 4); const k = pick(rand, [2, 3, -1]); const c = nz(rand, -3, 3);
    const F = { f: (x) => a * x + b, g: (x) => k * x, h: (x) => x * x + c };
    const [o, m, i] = sample(rand, ['f', 'g', 'h'], 3); const x0 = int(rand, -3, 3);
    const v1 = F[i](x0); const v2 = F[m](v1); const v3 = F[o](v2);
    if (Math.abs(v2) > 20 || Math.abs(v3) > 250) continue;
    const circle = rand() < 0.4;
    return { ask: `Evaluate ${circle ? `(${o}∘${m}∘${i})(${num(x0)})` : `${o}(${m}(${i}(${num(x0)})))`}`, prompt: lines(def('f', lin([[a, 'x']], b)), def('g', co(k)), def('h', quad(1, 0, c))), typed: v3, neg: true,
      tell: `inside out: ${i}(${num(x0)}) = ${num(v1)}; ${m}(${num(v1)}) = ${num(v2)}; ${o}(${num(v2)}) = ${num(v3)}.` };
  }
} };

T.compositionFormula = { book: 'l2', make(rand) {
  let a1; let b1; let a2; let b2;
  for (;;) { a1 = pick(rand, [-3, 2, 3, 4, 5]); b1 = nz(rand, -6, 6); a2 = pick(rand, [-2, 2, 3, 5]); b2 = nz(rand, -6, 6); if (a1 * b2 + b1 !== a2 * b1 + b2 && a1 * b2 + b1 !== 0 && a2 * b1 + b2 !== 0) break; }
  const circle = rand() < 0.5;
  return { ask: `Find ${circle ? '(f∘g)(x)' : 'f(g(x))'}`, prompt: lines(def('f', lin([[a1, 'x']], b1)), def('g', lin([[a2, 'x']], b2))),
    ...mc(rand, lin([[a1 * a2, 'x']], a1 * b2 + b1), [lin([[a1 * a2, 'x']], a2 * b1 + b2), lin([[a1 * a2, 'x']], b1 + b2), quad(a1 * a2, a1 * b2 + a2 * b1, b1 * b2)]),
    tell: `put g(x) into f: ${num(a1)}(${lin([[a2, 'x']], b2)})${term(b1)} = ${lin([[a1 * a2, 'x']], a1 * b2)}${term(b1)} = ${lin([[a1 * a2, 'x']], a1 * b2 + b1)}. (The other order, g(f(x)), is ${lin([[a1 * a2, 'x']], a2 * b1 + b2)}.)` };
} };

T.compositionWithASquare = { book: 'l2', make(rand) {
  let c; let d;
  for (;;) { c = nz(rand, -9, 9); d = nz(rand, -6, 6); if (d !== 1 && c + d !== 0 && d * d + c !== 0) break; }
  return { ask: 'Which is equivalent to (f∘g)(x)?', prompt: lines(def('f', quad(1, 0, c)), def('g', `x${term(d)}`)),
    ...mc(rand, quad(1, 2 * d, d * d + c), [quad(1, 0, c + d), quad(d, 0, d * c), quad(1, 0, d * d + c)]),
    tell: `f(g(x)) = (x${term(d)})²${term(c)} = ${quad(1, 2 * d, d * d)}${term(c)} = ${quad(1, 2 * d, d * d + c)}. Squaring a binomial has a middle term.` };
} };

T.undoingPair = { book: 'l2', make(rand) {
  const a = pick(rand, [2, 3, 4, 5]); const b = nz(rand, -9, 9);
  return { ask: 'Find g(f(x))', prompt: lines(def('f', lin([[a, 'x']], b)), `g(x) = ${fr(`x${term(-b)}`, a)}`), ...mc(rand, 'x', [co(a), `x${term(b)}`, '1', co(a * a)]),
    tell: `put f(x) into g: (${lin([[a, 'x']], b)}${term(-b)})/${a} = ${a}x/${a} = x. Each function undoes the other.` };
} };

T.compositionFromTables = { book: 'l2', make(rand) {
  const xs = sample(rand, [0, 1, 2, 3, 4, 5, 6, 8], 5).sort((x, y) => x - y); const fy = sample(rand, [1, 2, 3, 4, 5, 6, 7, 9, 10, 12], 5);
  const extra = [0, 8, 11, 13, 15].filter((v) => !fy.includes(v));
  const gx = [...sample(rand, fy, 3), ...sample(rand, extra, 2)].sort((x, y) => x - y); const gy = sample(rand, [-4, -1, 0, 2, 3, 5, 7, 8, 10, 14], 5);
  const usable = xs.map((x, i) => i).filter((i) => gx.includes(fy[i]));
  const i = pick(rand, usable); const mid = fy[i]; const val = gy[gx.indexOf(mid)]; const circle = rand() < 0.5;
  return { ask: `Use the tables to evaluate ${circle ? `(g∘f)(${num(xs[i])})` : `g(f(${num(xs[i])}))`}`, prompt: 'Use the tables.', fig: `${table('x', xs, 'f(x)', fy)}${table('x', gx, 'g(x)', gy)}`, typed: val, neg: true,
    tell: `f(${num(xs[i])}) = ${num(mid)} from the first table; that output is the input to g: g(${num(mid)}) = ${num(val)}.` };
} };

T.compositionFromGraphs = { book: 'l2', make(rand) {
  for (;;) {
    const s = pick(rand, [1, -1]); const c = int(rand, -3, 3); const t = pick(rand, [1, -1]); const h = int(rand, -2, 2); const k = t === 1 ? int(rand, -5, -1) : int(rand, 1, 5);
    const f = (x) => s * x + c; const g = (x) => t * (x - h) ** 2 + k;
    const gOut = rand() < 0.5; const x0 = int(rand, -5, 5);
    const inner = gOut ? f(x0) : g(x0); const val = gOut ? g(inner) : f(inner);
    if (Math.abs(inner) > 5 || Math.abs(val) > 6 || inner === x0 || (gOut ? Math.abs(f(x0)) > 6 : false)) continue;
    const P = plane(6, 24);
    const dots = (fn, color) => Array.from({ length: 13 }, (_, i) => i - 6).filter((x) => Math.abs(fn(x)) <= 6).map((x) => P.dot(x, fn(x), { color, r: 3 })).join('');
    const gx = h + (t === 1 ? 2 : -2); // a spot on the parabola for its label
    const fig = P.svg(`${P.curve(f, { step: 0.5 })}${P.curve(g, { color: '#c2452d' })}${dots(f, '#2e6fd8')}${dots(g, '#c2452d')}${P.label(4 * s > 0 ? 4 : -5, f(4 * s > 0 ? 4 : -5), 'f', { dx: 8, dy: 16 })}${P.label(gx, g(gx), 'g', { color: '#c2452d', dx: 8, dy: t === 1 ? 14 : -6 })}`, 'graphs of f(x) and g(x)');
    const [o, i] = gOut ? ['g', 'f'] : ['f', 'g']; const circle = rand() < 0.5;
    return { ask: `Use the graphs to evaluate ${circle ? `(${o}∘${i})(${num(x0)})` : `${o}(${i}(${num(x0)}))`}`, prompt: 'Use the graphs: f is the line, g is the parabola.', fig, typed: val, neg: true,
      tell: `inside out: on the graph of ${i}, ${i}(${num(x0)}) = ${num(inner)}; then on the graph of ${o}, ${o}(${num(inner)}) = ${num(val)}.` };
  }
} };

// ---------------------------------------------------------------- 2.3 average rate of change

T.arocFormula = { book: 'l3', make(rand) {
  const top = `f(x${'<sub>2</sub>'}) ${M} f(x${'<sub>1</sub>'})`; const bot = `x${'<sub>2</sub>'} ${M} x${'<sub>1</sub>'}`;
  if (rand() < 0.35) return { ask: 'Graphically, AROC is the ___ of the straight line connecting the interval&rsquo;s endpoints.', prompt: 'average rate of change', ...mc(rand, 'slope', ['length', 'y-intercept', 'midpoint']), tell: 'change in output over change in input between the two endpoints: the slope of the line through them.' };
  return { ask: 'Average rate of change (AROC) over the interval [x₁, x₂] is&hellip;', prompt: 'AROC = ?',
    ...mc(rand, fr(top, bot), [fr(bot, top), fr(`f(x${'<sub>2</sub>'}) + f(x${'<sub>1</sub>'})`, `x${'<sub>2</sub>'} + x${'<sub>1</sub>'}`), top]),
    tell: 'how much the OUTPUT changes, divided by how much the input changes.' };
} };

T.differenceQuotient = { book: 'l3', make(rand) {
  const a = int(rand, -10, -1); const b = a + int(rand, 2, 10); const f = pick(rand, ['f', 'g', 'h']);
  const fa = `${f}(${num(a)})`; const fb = `${f}(${num(b)})`;
  return { ask: `Which difference quotient gives the average rate of change of ${f} over ${num(a)} ${LE} x ${LE} ${num(b)}?`, prompt: 'Show the difference quotient in function notation.',
    ...mc(rand, fr(`${fb} ${M} ${fa}`, `${num(b)} ${M} (${num(a)})`), [fr(`${fb} ${M} ${fa}`, `${num(b)} ${M} ${-a}`), fr(`${fa} ${M} ${fb}`, `${num(b)} ${M} (${num(a)})`), fr(`${num(b)} ${M} (${num(a)})`, `${fb} ${M} ${fa}`)]),
    tell: `outputs on top, inputs on the bottom, in the same order — and subtracting ${num(a)} means ${num(b)} − (${num(a)}) = ${b - a}.` };
} };

T.arocFromEquation = { book: 'l3', make(rand) {
  for (;;) {
    const s = pick(rand, [1, -1]); const p = nz(rand, -9, 9); const c = nz(rand, -9, 23); const a = int(rand, -10, 6); const b = a + int(rand, 2, 10);
    const f = (x) => s * x * x + p * x + c; const fa = f(a); const fb = f(b); const r = (fb - fa) / (b - a);
    if (b > 10 || Math.abs(fa) > 60 || Math.abs(fb) > 60 || r === 0) continue;
    const name = pick(rand, ['f', 'g', 'h']);
    return { ask: 'Find the average rate of change over the interval', prompt: lines(def(name, quad(s, p, c)), `${num(a)} ${LE} x ${LE} ${num(b)}`), typed: r, neg: true,
      tell: `(${name}(${num(b)}) − ${name}(${num(a)}))/(${num(b)} − ${par(a)}) = (${num(fb)} − ${par(fa)})/${b - a} = ${num(fb - fa)}/${b - a} = ${num(r)}.` };
  }
} };

T.arocFromTable = { book: 'l3', make(rand) {
  for (;;) {
    const gap = pick(rand, [1, 2, 3]); const x0 = int(rand, -3, 3); const xs = Array.from({ length: 6 }, (_, i) => x0 + i * gap);
    const ys = [int(rand, -20, 90)]; for (let i = 1; i < 6; i++) ys.push(ys[i - 1] + nz(rand, -16, 16));
    const i = int(rand, 0, 4); const j = int(rand, i + 1, 5);
    if ((ys[j] - ys[i]) % (xs[j] - xs[i]) !== 0 || ys[j] === ys[i] || new Set(ys).size < 6) continue;
    const name = pick(rand, ['f', 'k', 'p']); const r = (ys[j] - ys[i]) / (xs[j] - xs[i]);
    return { ask: `Find the average rate of change over ${num(xs[i])} ${LE} x ${LE} ${num(xs[j])}`, prompt: 'Use the table.', fig: table('x', xs, `${name}(x)`, ys), typed: r, neg: true,
      tell: `(${name}(${num(xs[j])}) − ${name}(${num(xs[i])}))/(${num(xs[j])} − ${par(xs[i])}) = (${num(ys[j])} − ${par(ys[i])})/${xs[j] - xs[i]} = ${num(r)}. Only those two rows matter.` };
  }
} };

T.arocFromGraph = { book: 'l3', make(rand) {
  for (;;) {
    const xs = [int(rand, -9, -6)]; for (let i = 1; i < 5; i++) xs.push(xs[i - 1] + int(rand, 2, 4));
    if (xs[4] > 9) continue;
    const ys = xs.map(() => int(rand, -8, 8));
    if (ys.some((y, i) => i && y === ys[i - 1])) continue;
    const i = int(rand, 0, 3); const j = int(rand, i + 1, 4);
    if ((ys[j] - ys[i]) % (xs[j] - xs[i]) !== 0 || ys[j] === ys[i]) continue;
    const P = plane(10); const pts = xs.map((x, n) => [x, ys[n]]);
    const fig = P.svg(`${P.path(pts)}${pts.map(([x, y]) => P.dot(x, y)).join('')}${P.label(xs[4], ys[4], 'f', { dx: 6, dy: ys[4] > 6 ? 16 : -8 })}`, 'graph of f(x)');
    const r = (ys[j] - ys[i]) / (xs[j] - xs[i]);
    return { ask: `Find the average rate of change of f over ${num(xs[i])} ${LE} x ${LE} ${num(xs[j])}`, prompt: 'Use the graph.', fig, typed: r, neg: true,
      tell: `read the two endpoints: f(${num(xs[i])}) = ${num(ys[i])} and f(${num(xs[j])}) = ${num(ys[j])}; (${num(ys[j])} − ${par(ys[i])})/(${num(xs[j])} − ${par(xs[i])}) = ${num(ys[j] - ys[i])}/${xs[j] - xs[i]} = ${num(r)}.` };
  }
} };

T.smallestAroc = { book: 'l3', make(rand) {
  for (;;) {
    const gaps = [0, 1, 2, 3].map(() => pick(rand, [1, 2, 3, 4, 5])); const rates = sample(rand, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    const xs = [int(rand, 0, 3)]; const ys = [int(rand, 2, 12)];
    for (let i = 0; i < 4; i++) { xs.push(xs[i] + gaps[i]); ys.push(ys[i] + rates[i] * gaps[i]); }
    const least = rates.indexOf(Math.min(...rates)); const changes = rates.map((r, i) => r * gaps[i]);
    // the trap must be available: the smallest change in y is on a different interval
    if (changes.indexOf(Math.min(...changes)) === least || new Set(gaps).size < 2) continue;
    const say = (i) => `x = ${xs[i]} to x = ${xs[i + 1]}`;
    return { ask: 'On which interval of x is the average rate of change the smallest?', prompt: 'Use the table.', fig: table('x', xs, 'p(x)', ys),
      ...mc(rand, say(least), [0, 1, 2, 3].filter((i) => i !== least).map(say)),
      tell: `divide each change in p by its change in x: ${[0, 1, 2, 3].map((i) => `${changes[i]}/${gaps[i]} = ${rates[i]}`).join(', ')}. The x-values are not evenly spaced, so the smallest change in p is not the smallest rate.` };
  }
} };

module.exports = makeBank(BOOKS, T);
module.exports._parts = { pair };
