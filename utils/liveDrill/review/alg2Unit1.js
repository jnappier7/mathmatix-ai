/**
 * Algebra 2 · Unit 1 Review — Systems of Equations. Built from the teacher's unit packet
 * ("Unit 1 – Systems of Equations": Lesson 1 Solving 2x2 Systems, Lesson 2 Infinite & No
 * Solutions, Lesson 3 Solving 3x3 Systems Algebraically, Lesson 4 Systems with Word Problems,
 * Lesson 5 Solving Systems with Matrices and your Calculator, and the Selected Test Review).
 *
 * The packet's own words are kept: the three solution types are "Ordered Pair", "Infinitely Many"
 * and "No Solution"; the methods are Substitution and Elimination; a 3x3 ready for back-substitution
 * is in "triangle form"; the calculator method is "A⁻¹ · B" with A the coefficient matrix, X the
 * variable matrix and B the constant matrix. The word problems follow the packet's types (a count
 * and a value, one quantity in terms of the other, two plans that cost the same, "which system
 * models this") with fresh numbers, and "no more than" / "at least" read the way its SAT items do.
 *
 * Quick-fire: one move a play. The two "solve it" templates keep the packet's Level 1 set-ups
 * (one equation already solved for a variable; a variable already lined up to cancel).
 */
const { M, num, int, pick, sample, makeBank, mc } = require('../prep/kit');
const { nz, term, par, lin, eqn, sys, pt, money, commas, plane, matrix, sup } = require('./alg2Kit');

const BOOKS = {
  all: { name: 'Whole Unit', ch: 'Unit 1', blurb: 'Every lesson, mixed — 2x2 and 3x3 systems, no solution and infinitely many, word problems, matrices.' },
  l1: { name: 'Solving 2x2 Systems', ch: '1.1', blurb: 'Read a solution off a graph, substitution, elimination, the elimination strategy.' },
  l2: { name: 'Infinite & No Solutions', ch: '1.2', blurb: 'What 12 = 12 and 9 = 13 mean, parallel lines and the same line, the constant that makes it happen.' },
  l3: { name: '3x3 Systems', ch: '1.3', blurb: 'Triangle form, back-substitution, the pair of equations that eliminates two variables at once.' },
  l4: { name: 'Word Problems', ch: '1.4', blurb: 'Set up the system, “no more than” and “at least”, a count and a value, when two plans cost the same.' },
  l5: { name: 'Matrices & Your Calculator', ch: '1.5', blurb: 'The coefficient, variable and constant matrices, and the A⁻¹ · B method.' },
};

const TYPES = ['Ordered Pair', 'Infinitely Many', 'No Solution'];
const others = (ans) => TYPES.filter((t) => t !== ans);
const le = '&le;'; const ge = '&ge;';

const T = {};

// ---------------------------------------------------------------- 1.1 solving 2x2 systems

T.solutionIs = { book: 'l1', make(rand) {
  return { ask: 'Finish the sentence', prompt: 'A SOLUTION to a system is its&hellip;',
    ...mc(rand, 'point(s) of intersection', ['y-intercepts', 'slopes', 'x-intercepts', 'point farthest from the origin']),
    tell: 'a solution makes every equation true at once, so on the graph it is where the lines meet.' };
} };

T.methodName = { book: 'l1', make(rand) {
  const defs = [
    ['Substitution', 'Solve one equation for a variable, then put that expression into the other equation.'],
    ['Elimination', 'Add the equations (after multiplying, if needed) so that one of the variables cancels.'],
    ['Graphing', 'Draw both lines and read off the point where they cross.'],
  ];
  const [name, text] = pick(rand, defs);
  return { ask: 'Which method is this?', prompt: text, ...mc(rand, name, [...defs.map((d) => d[0]).filter((n) => n !== name), 'Matrices']),
    tell: `that describes ${name.toLowerCase()}.` };
} };

/** Two lines with integer slopes and intercepts that cross at an integer point inside the window. */
function crossing(rand) {
  for (;;) {
    const x0 = nz(rand, -5, 5); const y0 = nz(rand, -5, 5);
    const m1 = pick(rand, [-3, -2, -1, 1, 2, 3]); const m2 = pick(rand, [-3, -2, -1, 1, 2, 3].filter((m) => m !== m1));
    const b1 = y0 - m1 * x0; const b2 = y0 - m2 * x0;
    if (Math.abs(b1) > 9 || Math.abs(b2) > 9 || b1 === b2 || x0 === y0 || x0 === -y0) continue;
    return { x0, y0, m1, m2, b1, b2 };
  }
}
const slopeInt = (m, b) => `y = ${lin([[m, 'x']], b)}`;

T.graphSolve = { book: 'l1', make(rand) {
  const { x0, y0, m1, m2, b1, b2 } = crossing(rand);
  const P = plane(10);
  const fig = P.svg(`${P.line(m1, b1)}${P.line(m2, b2, { color: '#c2452d' })}`, 'two lines on a grid');
  return { ask: 'Solve the system graphically', prompt: 'Use the graph. What is the solution?', fig,
    ...mc(rand, pt(x0, y0), [pt(y0, x0), pt(x0, -y0), pt(-x0, y0), pt(0, b1), pt(0, b2)]),
    tell: `the lines cross at (${num(x0)}, ${num(y0)}): x first, then y.` };
} };

T.isSolution = { book: 'l1', make(rand) {
  const { x0, y0, m1, m2, b1, b2 } = crossing(rand);
  // the point offered is the solution, or is on only one of the lines, or on neither
  const kind = pick(rand, ['both', 'first', 'second', 'neither']);
  const dx = pick(rand, [-2, -1, 1, 2]);
  const [px, py] = kind === 'both' ? [x0, y0] : kind === 'first' ? [x0 + dx, y0 + m1 * dx] : kind === 'second' ? [x0 + dx, y0 + m2 * dx] : [x0 + dx, y0 + (m1 + m2) * dx + 1];
  const on1 = py === m1 * px + b1; const on2 = py === m2 * px + b2;
  const C = ['Yes — it makes both equations true', 'No — it makes only the first equation true', 'No — it makes only the second equation true', 'No — it makes neither equation true'];
  const ans = on1 && on2 ? C[0] : on1 ? C[1] : on2 ? C[2] : C[3];
  return { ask: `Is ${pt(px, py)} a solution of the system?`, prompt: sys(slopeInt(m1, b1), slopeInt(m2, b2)),
    ...mc(rand, ans, C.filter((c) => c !== ans)),
    tell: `put x = ${num(px)} into each: the first gives y = ${num(m1 * px + b1)}, the second gives y = ${num(m2 * px + b2)}; the point has y = ${num(py)}. A solution has to work in BOTH.` };
} };

/** A Level 1 substitution system: y = mx + b on top, px + qy = r under it. */
function subSystem(rand) {
  for (;;) {
    const x0 = nz(rand, -5, 5); const y0 = nz(rand, -6, 6);
    const m = pick(rand, [-3, -2, 2, 3, 4]); const b = y0 - m * x0;
    const p = pick(rand, [1, 1, 2, 3]); const q = pick(rand, [-1, 1, 2, -2]);
    if (p + q * m === 0 || Math.abs(b) > 9 || b === 0 || x0 === y0 || x0 === -y0) continue;
    return { x0, y0, m, b, p, q, r: p * x0 + q * y0 };
  }
}

T.subFirstStep = { book: 'l1', make(rand) {
  // not a coefficient of +1 on y: "2x + (3x + 5)" and "2x + 3x + 5" say the same thing, so the
  // dropped-bracket choice would be right too
  let S; do S = subSystem(rand); while (S.q === 1);
  const { m, b, p, q, r } = S;
  const inner = lin([[m, 'x']], b);
  const lead = lin([[p, 'x']]);
  const mag = Math.abs(q) === 1 ? '' : String(Math.abs(q));
  const good = `${lead} ${q < 0 ? M : '+'} ${mag}(${inner}) = ${num(r)}`;
  // the classic slip: the bracket dropped, so only the first term gets the coefficient
  const noBracket = `${lead} ${q < 0 ? M : '+'} ${mag}${inner} = ${num(r)}`;
  return { ask: 'Substitute. Which equation do you get?', prompt: sys(slopeInt(m, b), eqn([[p, 'x'], [q, 'y']], r)),
    ...mc(rand, good, [noBracket, `${lin([[p, 'x'], [q, 'y']])} = ${inner}`, `${lin([[p, `(${inner})`]])} ${q < 0 ? M : '+'} ${mag}y = ${num(r)}`]),
    tell: `the first equation says y is ${inner}, so replace y with that whole expression — in parentheses.` };
} };

T.subSolve = { book: 'l1', make(rand) {
  const { x0, y0, m, b, p, q, r } = subSystem(rand);
  return { ask: 'Solve by substitution', prompt: sys(slopeInt(m, b), eqn([[p, 'x'], [q, 'y']], r)),
    ...mc(rand, pt(x0, y0), [pt(y0, x0), pt(x0, -y0), pt(-x0, y0), pt(-x0, -y0)]),
    tell: `replace y: ${lin([[p, 'x']])} ${q < 0 ? M : '+'} ${Math.abs(q) === 1 ? '' : Math.abs(q)}(${lin([[m, 'x']], b)}) = ${num(r)} gives x = ${num(x0)}; then y = ${num(m)}(${num(x0)})${term(b)} = ${num(y0)}.` };
} };

T.elimAdd = { book: 'l1', make(rand) {
  // Level 1 elimination: the y's are already opposites
  let x0; let y0; let a1; let a2; let b;
  for (;;) {
    x0 = nz(rand, -6, 6); y0 = nz(rand, -6, 6); a1 = pick(rand, [1, 2, 3, 4, 5]); a2 = pick(rand, [-2, 1, 2, 3, 4]); b = pick(rand, [1, 2, 3, 5]);
    if (a1 + a2 !== 0) break;
  }
  const c1 = a1 * x0 + b * y0; const c2 = a2 * x0 - b * y0;
  return { ask: 'Solve by elimination. What is x?', prompt: sys(eqn([[a1, 'x'], [b, 'y']], c1), eqn([[a2, 'x'], [-b, 'y']], c2)), typed: x0, neg: true,
    tell: `add the equations: the y's cancel, leaving ${lin([[a1 + a2, 'x']])} = ${num(c1 + c2)}, so x = ${num(x0)}.` };
} };

T.elimMultiplier = { book: 'l1', make(rand) {
  // one equation has a lone x (or y); multiply it so the other equation's term cancels
  const onX = rand() < 0.5;
  const k = pick(rand, [2, 3, 4, 5, -2, -3, -4]);
  const o1 = nz(rand, -5, 5); const o2 = nz(rand, -6, 6);
  const c1 = nz(rand, -9, 9); const c2 = nz(rand, -12, 12);
  if (o1 * k === o2) return T.elimMultiplier.make(rand); // the same line (or parallel): not this question
  const v = onX ? 'x' : 'y';
  const e1 = onX ? eqn([[1, 'x'], [o1, 'y']], c1) : eqn([[o1, 'x'], [1, 'y']], c1);
  const e2 = onX ? eqn([[k, 'x'], [o2, 'y']], c2) : eqn([[o2, 'x'], [k, 'y']], c2);
  return { ask: `Multiply the first equation by what number so that adding eliminates ${v}?`, prompt: sys(e1, e2), typed: -k, neg: true,
    tell: `the second equation has ${lin([[k, v]])}, so the first needs ${lin([[-k, v]])}: multiply it by ${num(-k)}.` };
} };

T.elimStrategy = { book: 'l1', make(rand) {
  // both equations must be multiplied (the packet's Level 2 example: 2x − 3y = −4, 3x − 2y = −6)
  const [a, c] = pick(rand, [[2, 3], [3, 2], [2, 5], [5, 2], [3, 4], [4, 3], [3, 5], [5, 3]]);
  const b = nz(rand, -5, 5); const d = nz(rand, -5, 5);
  if (a * d === b * c) return T.elimStrategy.make(rand);
  const r1 = nz(rand, -9, 9); const r2 = nz(rand, -9, 9);
  const say = (p, q) => `multiply the first by ${num(p)} and the second by ${num(q)}`;
  return { ask: 'Which elimination strategy lets you ADD the equations to eliminate x?', prompt: sys(eqn([[a, 'x'], [b, 'y']], r1), eqn([[c, 'x'], [d, 'y']], r2)),
    ...mc(rand, say(c, -a), [say(a, c), say(c, a), say(a, -c)]),
    tell: `${c}·${a}x = ${a * c}x and ${num(-a)}·${c}x = ${num(-a * c)}x: opposites, so they cancel when you add.` };
} };

// ---------------------------------------------------------------- 1.2 infinite & no solutions

T.resultMeans = { book: 'l2', make(rand) {
  const kind = pick(rand, TYPES);
  const a = int(rand, 2, 15); let b = int(rand, 2, 15); if (b === a) b = a + 3;
  const shown = kind === 'Infinitely Many' ? pick(rand, [`${a} = ${a}`, 'x = x', `${M}${a} = ${M}${a}`, '0 = 0']) : kind === 'No Solution' ? pick(rand, [`${a} = ${b}`, `0 = ${a}`, `${M}${a} = ${a}`]) : `x = ${num(nz(rand, -9, 9))}`;
  return { ask: 'You solve a system and end up with this. What type of solution?', prompt: shown, ...mc(rand, kind, others(kind)),
    tell: kind === 'Infinitely Many' ? 'a statement that is always true means every point on the line works: infinitely many solutions.' : kind === 'No Solution' ? 'that clearly cannot be true, so nothing works: no solution.' : 'you got a value for x; substitute it back to find y — one ordered pair.' };
} };

T.graphMeans = { book: 'l2', make(rand) {
  const rows = [
    ['No Solution', 'The two lines are parallel.'], ['No Solution', 'Same slope, different y-intercepts.'],
    ['Infinitely Many', 'The two equations graph as the same line.'], ['Infinitely Many', 'Same slope and the same y-intercept.'],
    ['Ordered Pair', 'The lines cross at one point.'], ['Ordered Pair', 'The lines have different slopes.'],
  ];
  const [ans, text] = pick(rand, rows);
  return { ask: 'What type of solution does the system have?', prompt: text, ...mc(rand, ans, others(ans)),
    tell: ans === 'No Solution' ? 'parallel lines never meet, so there is no point of intersection.' : ans === 'Infinitely Many' ? 'the same line twice: every point on it is a solution.' : 'different slopes cross exactly once: one ordered pair.' };
} };

T.classifySystem = { book: 'l2', make(rand) {
  const a = nz(rand, -4, 4); const b = pick(rand, [2, 3, 4, 5, -2, -3]); const c = nz(rand, -9, 9);
  const kind = pick(rand, TYPES); const style = pick(rand, ['standard', 'slope']);
  let e1; let e2; let why;
  if (style === 'standard') {
    // ax + by = c against a multiple of it (same line), the same left side with another constant (parallel), or another slope
    const k = pick(rand, [2, 3, -1, -2]);
    e1 = eqn([[a, 'x'], [b, 'y']], c);
    if (kind === 'Infinitely Many') { e2 = eqn([[k * a, 'x'], [k * b, 'y']], k * c); why = `the second equation is the first times ${num(k)} — the same line.`; }
    else if (kind === 'No Solution') { let c2 = nz(rand, -9, 9); if (c2 === c) c2 = c + 5; e2 = eqn([[a, 'x'], [b, 'y']], c2); why = `the left sides match but ${num(c)} ≠ ${num(c2)}: parallel lines.`; }
    else { e2 = eqn([[a + pick(rand, [1, 2, -1]), 'x'], [b, 'y']], nz(rand, -9, 9)); if (e2.startsWith(lin([[a, 'x']]) + ' ')) return T.classifySystem.make(rand); why = 'the slopes are different, so the lines cross once.'; }
  } else {
    // y = mx + c on top; under it the same line in standard form, a parallel line, or another slope
    const m = a;
    e1 = slopeInt(m, c);
    if (kind === 'Infinitely Many') { e2 = eqn([[m, 'x'], [-1, 'y']], -c); why = `rearrange the second: y = ${lin([[m, 'x']], c)} — the same line.`; }
    else if (kind === 'No Solution') { let c2 = nz(rand, -9, 9); if (c2 === c) c2 = c - 4; e2 = slopeInt(m, c2); why = `same slope ${num(m)}, different y-intercepts: parallel lines.`; }
    else { let m2 = nz(rand, -4, 4); if (m2 === m) m2 = m + 1; if (m2 === 0) m2 = m + 2; e2 = slopeInt(m2, nz(rand, -9, 9)); why = `slopes ${num(m)} and ${num(m2)} are different, so the lines cross once.`; }
  }
  return { ask: 'What type of solution does the system have?', prompt: sys(e1, e2), ...mc(rand, kind, others(kind)), tell: why };
} };

T.noSolutionA = { book: 'l2', make(rand) {
  // px + qy = r ; ax + kq·y = s with s ≠ kr: parallel exactly when a = kp
  const p = nz(rand, -5, 5); const q = pick(rand, [1, 1, 2, 3, -1]); const k = pick(rand, [2, 3, -2, 4]); const r = nz(rand, -9, 9);
  let s = nz(rand, -12, 12); if (s === k * r) s += 2;
  return { ask: 'a is a constant. For what value of a does the system have no solution?', prompt: sys(eqn([[p, 'x'], [q, 'y']], r), `ax ${k * q < 0 ? M : '+'} ${Math.abs(k * q) === 1 ? '' : Math.abs(k * q)}y = ${num(s)}`), typed: k * p, neg: true,
    tell: `no solution means parallel lines: the y-coefficient went from ${num(q)} to ${num(k * q)} (times ${num(k)}), so a = ${num(k)}·${par(p)} = ${num(k * p)} — and ${num(s)} is not ${num(k)}·${par(r)}, so they are not the same line.` };
} };

T.sameLineC = { book: 'l2', make(rand) {
  const p = nz(rand, -5, 5); const q = nz(rand, -5, 5); const r = nz(rand, -9, 9); const k = pick(rand, [2, 3, 4, -2, -3]);
  return { ask: 'The equations are the same line. What is c?', prompt: sys(eqn([[p, 'x'], [q, 'y']], r), `${lin([[k * p, 'x'], [k * q, 'y']])} = c`), typed: k * r, neg: true,
    tell: `the second equation is the first times ${num(k)}, so c = ${num(k)}·${par(r)} = ${num(k * r)}.` };
} };

// ---------------------------------------------------------------- 1.3 3x3 systems

T.tripleLooks = { book: 'l3', make(rand) {
  return { ask: 'A solution to a 3x3 system looks like&hellip;', prompt: 'three equations, three variables',
    ...mc(rand, '(x, y, z)', ['(x, y)', 'x = y = z', 'y = mx + b']), tell: 'one value for each variable, written in order: (x, y, z).' };
} };

/** A triangle-form system: all three variables on top, y and z in the middle, z alone at the bottom. */
function triangle(rand) {
  for (;;) {
    const x = nz(rand, -4, 4); const y = nz(rand, -4, 4); const z = nz(rand, -4, 4);
    const a = pick(rand, [1, 2, 3, 5]); const b = nz(rand, -4, 4); const c = nz(rand, -3, 3);
    const d = pick(rand, [1, 2, 3, 5]); const e = nz(rand, -3, 3);
    if (new Set([x, y, z]).size < 3) continue;
    return { x, y, z, e1: eqn([[a, 'x'], [b, 'y'], [c, 'z']], a * x + b * y + c * z), e2: eqn([[d, 'y'], [e, 'z']], d * y + e * z), e3: `z = ${num(z)}`, d, e, r2: d * y + e * z };
  }
}

T.triangleName = { book: 'l3', make(rand) {
  const t = triangle(rand);
  return { ask: 'What do we call this form of a 3x3 system?', prompt: sys(t.e1, t.e2, t.e3), ...mc(rand, 'triangle form', ['standard form', 'slope-intercept form', 'vertex form']),
    tell: 'each equation has one fewer variable than the one above — a staircase — so you can substitute back up.' };
} };

T.triangleY = { book: 'l3', make(rand) {
  const t = triangle(rand);
  return { ask: 'The system is in triangle form. What is y?', prompt: sys(t.e1, t.e2, t.e3), typed: t.y, neg: true,
    tell: `put z = ${num(t.z)} into the second equation: ${lin([[t.d, 'y']])} ${t.e * t.z < 0 ? M : '+'} ${Math.abs(t.e * t.z)} = ${num(t.r2)}, so y = ${num(t.y)}.` };
} };

T.triangleSolve = { book: 'l3', make(rand) {
  const t = triangle(rand);
  return { ask: 'Solve the system', prompt: sys(t.e1, t.e2, t.e3),
    ...mc(rand, pt(t.x, t.y, t.z), [pt(t.z, t.y, t.x), pt(t.x, -t.y, t.z), pt(-t.x, t.y, t.z), pt(t.y, t.x, t.z)]),
    tell: `work back up: z = ${num(t.z)}, then y = ${num(t.y)} from the second equation, then x = ${num(t.x)} from the first.` };
} };

/**
 * A 3x3 like the packet's: two of the equations have two variables that are exact opposites, so
 * adding that pair leaves one variable. `pair` is the pair (0-based), `left` the variable left.
 */
function pairSystem(rand) {
  for (;;) {
    const sol = [nz(rand, -4, 4), nz(rand, -4, 4), nz(rand, -4, 4)];
    const pair = pick(rand, [[0, 1], [0, 2], [1, 2]]); const left = pick(rand, [0, 1, 2]);
    const rows = [0, 1, 2].map(() => [nz(rand, -5, 5), nz(rand, -5, 5), nz(rand, -5, 5)]);
    const [i, j] = pair;
    for (const v of [0, 1, 2]) if (v !== left) rows[j][v] = -rows[i][v];
    if (rows[i][left] + rows[j][left] === 0) continue;
    // no other pair may cancel two variables, and no pair may cancel all three
    const cancels = (p, q) => [0, 1, 2].filter((v) => rows[p][v] + rows[q][v] === 0).length;
    const others2 = [[0, 1], [0, 2], [1, 2]].filter(([p, q]) => !(p === i && q === j));
    if (others2.some(([p, q]) => cancels(p, q) >= 2)) continue;
    // one solution only: a system to SOLVE, not a dependent one
    const [A, B, C] = rows;
    if (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]) === 0) continue;
    const V = ['x', 'y', 'z'];
    const rhs = rows.map((r) => r[0] * sol[0] + r[1] * sol[1] + r[2] * sol[2]);
    const eqs = rows.map((r, n) => eqn([[r[0], 'x'], [r[1], 'y'], [r[2], 'z']], rhs[n]));
    return { sol, pair, left, V, eqs, sumCoef: rows[i][left] + rows[j][left], sumRhs: rhs[i] + rhs[j] };
  }
}
const ORD = ['first', 'second', 'third'];

T.whichPair = { book: 'l3', make(rand) {
  const s = pairSystem(rand);
  const name = ([p, q]) => `the ${ORD[p]} and ${ORD[q]}`;
  const all = [[0, 1], [0, 2], [1, 2]];
  const gone = s.V.filter((_, v) => v !== s.left).join(' and ');
  return { ask: 'Which pair of equations can you add to eliminate two variables right away?', prompt: sys(...s.eqs),
    ...mc(rand, name(s.pair), all.filter(([p, q]) => !(p === s.pair[0] && q === s.pair[1])).map(name)),
    tell: `in the ${ORD[s.pair[0]]} and ${ORD[s.pair[1]]} equations the ${gone} terms are opposites, so adding leaves only ${s.V[s.left]}.` };
} };

T.addPair = { book: 'l3', make(rand) {
  const s = pairSystem(rand);
  const v = s.V[s.left];
  return { ask: `Add the ${ORD[s.pair[0]]} and ${ORD[s.pair[1]]} equations. What is ${v}?`, prompt: sys(...s.eqs), typed: s.sol[s.left], neg: true,
    tell: `the other two variables cancel, leaving ${lin([[s.sumCoef, v]])} = ${num(s.sumRhs)}${s.sumCoef === 1 ? '' : `, so ${v} = ${num(s.sol[s.left])}`}.` };
} };

// ---------------------------------------------------------------- 1.4 word problems

T.phraseSymbol = { book: 'l4', make(rand) {
  const rows = [['no more than', le], ['at most', le], ['at least', ge], ['no fewer than', ge], ['fewer than', '&lt;'], ['more than', '&gt;']];
  const [phrase, symbol] = pick(rand, rows);
  return { ask: 'Which symbol does the phrase mean?', prompt: `&ldquo;${phrase}&rdquo;`, ...mc(rand, symbol, [le, ge, '&lt;', '&gt;'].filter((s) => s !== symbol)),
    tell: `&ldquo;${phrase}&rdquo; ${symbol === le ? 'allows that amount and anything below it' : symbol === ge ? 'allows that amount and anything above it' : 'does not include the amount itself'}: ${symbol}.` };
} };

const SALES = [
  { story: (a, b, n, t) => `Bench tickets cost ${money(a)} and lawn tickets cost ${money(b)}. ${commas(n)} tickets were sold for ${money(t)}.`, u: 'B', v: 'L', what: 'bench tickets, B, and lawn tickets, L' },
  { story: (a, b, n, t) => `A bakery sells boxes of scones for ${money(a)} and boxes of muffins for ${money(b)}. It sold ${commas(n)} boxes for ${money(t)}.`, u: 's', v: 'm', what: 'boxes of scones, s, and boxes of muffins, m' },
  { story: (a, b, n, t) => `An airline charges ${money(a)} to check a bag and ${money(b)} for priority boarding. It collected ${money(t)} from ${commas(n)} of these services.`, u: 'b', v: 'p', what: 'bags, b, and priority boardings, p' },
];

T.setupEquations = { book: 'l4', make(rand) {
  const S = pick(rand, SALES);
  const [a, b] = pick(rand, [[75, 40], [15, 9], [25, 15], [12, 8], [20, 30], [6, 4]]);
  const x = int(rand, 12, 60); const y = int(rand, 12, 60); const n = x + y; const t = a * x + b * y;
  const { u, v } = S;
  const count = `${u} + ${v} = ${commas(n)}`;
  const good = sys(`${a}${u} + ${b}${v} = ${commas(t)}`, count);
  return { ask: `${S.story(a, b, n, t)} Which system finds the number of ${S.what}?`, prompt: 'Choose the system.',
    ...mc(rand, good, [sys(`${b}${u} + ${a}${v} = ${commas(t)}`, count), sys(`${a}${u} + ${b}${v} = ${commas(n)}`, `${u} + ${v} = ${commas(t)}`), sys(`(${a}${u})(${b}${v}) = ${commas(t)}`, count)]),
    tell: `the counts add to ${commas(n)}; each price times its count adds to the money, ${money(t)}.` };
} };

T.setupInequalities = { book: 'l4', make(rand) {
  const [p, q] = pick(rand, [[12, 9.5], [15, 11], [10, 8.5], [14, 9]]);
  const h = pick(rand, [15, 20, 25, 30]); const earn = pick(rand, [150, 180, 220, 250]);
  const pay = `${p}x + ${q}y`; const hrs = 'x + y';
  const good = sys(`${pay} ${ge} ${earn}`, `${hrs} ${le} ${h}`);
  return { ask: `Jackie tutors for ${money(p)} an hour (x hours) and lifeguards for ${money(q)} an hour (y hours). She can work no more than ${h} hours a week but wants to earn at least ${money(earn)}. Which system represents this?`, prompt: 'Choose the system.',
    ...mc(rand, good, [sys(`${pay} ${le} ${earn}`, `${hrs} ${ge} ${h}`), sys(`${pay} ${le} ${earn}`, `${hrs} ${le} ${h}`), sys(`${pay} ${ge} ${earn}`, `${hrs} ${ge} ${h}`)]),
    tell: `&ldquo;no more than ${h} hours&rdquo; is x + y ${le} ${h}; &ldquo;at least ${money(earn)}&rdquo; is ${pay} ${ge} ${earn}.` };
} };

T.timesAsMany = { book: 'l4', make(rand) {
  const [k, word] = pick(rand, [[2, 'twice'], [3, 'three times'], [4, 'four times']]);
  const [A, a, B, b] = pick(rand, [['containers of detergent', 'd', 'containers of fabric softener', 's'], ['junior directors', 'j', 'senior directors', 's'], ['student tickets', 's', 'adult tickets', 'a'], ['pencils', 'p', 'erasers', 'e']]);
  return { ask: `The order must have at least ${word} as many ${A} (${a}) as ${B} (${b}). Which inequality says so?`, prompt: 'Choose the inequality.',
    ...mc(rand, `${a} ${ge} ${k}${b}`, [`${k}${a} ${ge} ${b}`, `${a} ${le} ${k}${b}`, `${k}${a} ${le} ${b}`]),
    tell: `${a} is the bigger count: it has to reach ${k} times ${b}, so ${a} ${ge} ${k}${b}. (Check: ${b} = 1 needs ${a} of at least ${k}.)` };
} };

T.countAndValue = { book: 'l4', make(rand) {
  const kind = pick(rand, ['legs', 'tickets', 'books']);
  if (kind === 'legs') {
    const cows = int(rand, 3, 12); const birds = int(rand, 3, 14);
    return { ask: `Ronald has ${cows + birds} animals in his barn, all cows and turkeys. There are ${4 * cows + 2 * birds} legs in total. How many cows?`, prompt: 'c + t = total animals, 4c + 2t = total legs', typed: cows,
      tell: `c + t = ${cows + birds} and 4c + 2t = ${4 * cows + 2 * birds}. Double the first and subtract: 2c = ${2 * cows}, so c = ${cows} (and ${birds} turkeys).` };
  }
  if (kind === 'tickets') {
    const front = int(rand, 4, 15) * 10; const back = int(rand, 4, 15) * 10;
    return { ask: `Front-row seats cost $5 and seats in the back cost $2. Christian sold ${front + back} tickets and collected ${money(5 * front + 2 * back)}. How many front-row tickets?`, prompt: 'f + b = tickets, 5f + 2b = dollars', typed: front,
      tell: `f + b = ${front + back} and 5f + 2b = ${commas(5 * front + 2 * back)}. Double the first and subtract: 3f = ${3 * front}, so f = ${front} (and ${back} in the back).` };
  }
  const novels = int(rand, 2, 8); const mags = int(rand, 2, 9);
  return { ask: `Each novel sells for $4 and each magazine for $1. Sadie bought ${novels + mags} novels and magazines for $${4 * novels + mags}. How many novels?`, prompt: 'n + m = items, 4n + m = dollars', typed: novels,
    tell: `n + m = ${novels + mags} and 4n + m = ${4 * novels + mags}. Subtract: 3n = ${3 * novels}, so n = ${novels}.` };
} };

T.sameCost = { book: 'l4', make(rand) {
  // fee1 + rate1·h = fee2 + rate2·h with a whole-number answer
  const h = int(rand, 2, 9); const r1 = pick(rand, [10, 15, 20, 12]); const d = pick(rand, [5, 10, 15]); const r2 = r1 + d;
  const f2 = pick(rand, [20, 30, 40, 50, 60]); const f1 = f2 + d * h;
  const [thing, unit] = pick(rand, [['dumpster', 'hour'], ['moving truck', 'hour'], ['bike', 'day'], ['kayak', 'hour']]);
  return { ask: `One company rents a ${thing} for ${money(f1)} plus ${money(r1)} per ${unit}. Another charges ${money(f2)} plus ${money(r2)} per ${unit}. After how many ${unit}s are the costs the same?`, prompt: `${f1} + ${r1}x = ${f2} + ${r2}x`, typed: h,
    tell: `${f1} + ${r1}x = ${f2} + ${r2}x → ${f1 - f2} = ${d}x → x = ${h} ${unit}s (both cost ${money(f1 + r1 * h)}).` };
} };

T.olderThan = { book: 'l4', make(rand) {
  const c = int(rand, 6, 16); const d = int(rand, 2, 6); const p = pick(rand, [2, 3]); const q = pick(rand, [1, 2]);
  const total = p * c + q * (c + d);
  const say = (k, who) => `${k === 1 ? '' : k === 2 ? 'two times ' : 'three times '}${who}'s age`;
  return { ask: `William is ${d} years older than Charlie. The sum of ${say(p, 'Charlie')} and ${say(q, 'William')} is ${total}. How old is Charlie?`, prompt: `w = c + ${d} and ${p}c + ${q === 1 ? '' : q}w = ${total}`, typed: c,
    tell: `substitute w = c + ${d}: ${p}c + ${q === 1 ? '' : q}(c + ${d}) = ${total} → ${p + q}c + ${q * d} = ${total} → c = ${c}.` };
} };

T.timesAsMuch = { book: 'l4', make(rand) {
  const k = pick(rand, [2, 3, 4]); const small = pick(rand, [15, 20, 25, 30, 35, 40, 45]);
  const [big, little] = pick(rand, [['A coat', 'a pair of pants'], ['A helmet', 'a pair of gloves'], ['A tent', 'a sleeping bag']]);
  return { ask: `${big} costs ${k} times as much as ${little}. Together they cost ${money((k + 1) * small)}. How much does ${little} cost (in dollars)?`, prompt: `c = ${k}p and c + p = ${(k + 1) * small}`, typed: small,
    tell: `substitute c = ${k}p: ${k}p + p = ${(k + 1) * small}, so ${k + 1}p = ${(k + 1) * small} and p = ${small} (the other costs ${money(k * small)}).` };
} };

T.sumOfTwo = { book: 'l4', make(rand) {
  const s = int(rand, 5, 14); const d = int(rand, 1, 6); const L = 2 * s - d;
  if (L <= s) return T.sumOfTwo.make(rand);
  return { ask: `The sum of two numbers is ${s + L}. The larger number is ${d} less than twice the smaller. Find the smaller number.`, prompt: `s + L = ${s + L} and L = 2s − ${d}`, typed: s,
    tell: `substitute L = 2s − ${d}: s + 2s − ${d} = ${s + L}, so 3s = ${s + L + d} and s = ${s} (the larger is ${L}).` };
} };

T.valueOfExpression = { book: 'l4', make(rand) {
  // "systems made up of variables": the question is a + b, not a
  const b = pick(rand, [6, 8, 10, 12, 14, 16, 20]); const k = pick(rand, [2, 2, 4]); if (b % k) return T.valueOfExpression.make(rand);
  const diff = int(rand, 3, 15); const a = b + diff;
  return { ask: 'What is the value of a + b?', prompt: `a − b = ${diff}&nbsp;&nbsp;and&nbsp;&nbsp;b ÷ ${k} = ${b / k}`, typed: a + b,
    tell: `b = ${k}·${b / k} = ${b}; a = ${diff} + ${b} = ${a}; the question asks for a + b = ${a + b} (not just a).` };
} };

T.sameSolution = { book: 'l4', make(rand) {
  // multiply ONE equation through by k — both sides — and the solution does not move
  const a = nz(rand, -4, 4); const b = pick(rand, [1, 1, 2, 3]); const c = pick(rand, [2, 3, 4, 5]); const d = nz(rand, -4, 4);
  const k = pick(rand, [-2, 2, 3, -3]);
  const kK = (n) => `${n === 1 ? '' : n === -1 ? M : num(n)}K`;
  const second = `${lin([[c, 'x'], [d, 'y']])} = L`;
  const first = `${lin([[a, 'x'], [b, 'y']])} = K`;
  const scaled = (rhs) => `${lin([[k * a, 'x'], [k * b, 'y']])} = ${rhs}`;
  return { ask: 'Which system has the same solution as this one?', prompt: sys(first, second),
    ...mc(rand, sys(scaled(kK(k)), second), [sys(scaled(kK(-k)), second), sys(scaled('K'), second), sys(first, `${lin([[k * c, 'x'], [k * d, 'y']])} = L`)]),
    tell: `multiplying an equation by ${num(k)} keeps its solutions only if BOTH sides are multiplied: the right side becomes ${kK(k)}.` };
} };

// ---------------------------------------------------------------- 1.5 matrices & the calculator

T.matrixNames = { book: 'l5', make(rand) {
  const rows = [['A', 'the coefficient matrix'], ['X', 'the variable matrix'], ['B', 'the constant matrix']];
  const [letter, name] = pick(rand, rows);
  return { ask: 'In AX = B&hellip;', prompt: `${letter} is&hellip;`, ...mc(rand, name, [...rows.map((r) => r[1]).filter((n) => n !== name), 'the inverse matrix']),
    tell: 'A holds the coefficients, X the variables, B the constants on the right side.' };
} };

T.matrixVocab = { book: 'l5', make(rand) {
  if (rand() < 0.5) return { ask: 'Vocabulary', prompt: 'The numbers in a matrix are called its&hellip;', ...mc(rand, 'elements (entries)', ['solutions', 'variables', 'dimensions']), tell: 'each number in the array is an element, or entry, of the matrix.' };
  return { ask: 'Vocabulary', prompt: 'A matrix is an arrangement of numbers into&hellip;', ...mc(rand, 'rows and columns', ['ordered pairs', 'a single row', 'equations']), tell: 'rows and columns, forming a rectangular array.' };
} };

/** A 3x3 with small coefficients, some of them missing (a 0 in A), and an integer solution. */
function system3(rand) {
  for (;;) {
    const sol = [nz(rand, -5, 5), int(rand, -4, 4), nz(rand, -4, 4)];
    const rows = [0, 1, 2].map(() => [nz(rand, -4, 4), nz(rand, -4, 4), nz(rand, -6, 6)]);
    const zr = int(rand, 0, 2); const zc = int(rand, 0, 2); rows[zr][zc] = 0;
    const det = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1]) - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0]) + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
    if (det === 0) continue;
    const rhs = rows.map((r) => r[0] * sol[0] + r[1] * sol[1] + r[2] * sol[2]);
    return { sol, rows, rhs, zr, zc, eqs: rows.map((r, n) => eqn([[r[0], 'x'], [r[1], 'y'], [r[2], 'z']], rhs[n])) };
  }
}

T.matrixEntry = { book: 'l5', make(rand) {
  const s = system3(rand);
  // half the time ask for the missing variable's entry (the 0 the packet's example turns on)
  const [r, c] = rand() < 0.5 ? [s.zr, s.zc] : [int(rand, 0, 2), int(rand, 0, 2)];
  const v = s.rows[r][c];
  return { ask: `In the coefficient matrix A, what is the entry in row ${r + 1}, column ${c + 1}?`, prompt: sys(...s.eqs), typed: v, neg: true,
    tell: v === 0 ? `the ${ORD[r]} equation has no ${'xyz'[c]} term, so that entry is 0.` : `row ${r + 1} is the ${ORD[r]} equation and column ${c + 1} is the ${'xyz'[c]} coefficient: ${num(v)}.` };
} };

T.constantEntry = { book: 'l5', make(rand) {
  const s = system3(rand); const r = int(rand, 0, 2);
  return { ask: `In the constant matrix B, what is the entry in row ${r + 1}?`, prompt: sys(...s.eqs), typed: s.rhs[r], neg: true,
    tell: `B holds the numbers on the right side of the equals signs, in order: row ${r + 1} is ${num(s.rhs[r])}.` };
} };

T.matrixSize = { book: 'l5', make(rand) {
  const size = (r, c) => `${r} rows and ${c} column${c === 1 ? '' : 's'}`;
  if (rand() < 0.6) return { ask: 'For a 3x3 system, how do you build the constant matrix B?', prompt: 'B has&hellip;', ...mc(rand, size(3, 1), [size(1, 3).replace('1 rows', '1 row'), size(3, 3), size(1, 1).replace('1 rows', '1 row')]), tell: 'one constant per equation, stacked: 3 rows and 1 column (a 3x1 matrix).' };
  return { ask: 'For a 3x3 system, how do you build the coefficient matrix A?', prompt: 'A has&hellip;', ...mc(rand, size(3, 3), [size(3, 1), size(1, 3).replace('1 rows', '1 row'), size(2, 2)]), tell: 'three equations, three variables: 3 rows and 3 columns.' };
} };

T.methodOrder = { book: 'l5', make(rand) {
  const inv = (s) => `${s}${sup(`${M}1`)}`;
  return { ask: 'To solve AX = B on your calculator, evaluate&hellip;', prompt: 'X = ?', ...mc(rand, `${inv('A')} · B`, [`B · ${inv('A')}`, 'A · B', `${inv('B')} · A`]),
    tell: `multiply both sides by the inverse of A, on the left: X = ${inv('A')} · B. The order matters.` };
} };

T.inverseNotation = { book: 'l5', make(rand) {
  return { ask: 'How do we write the inverse of matrix A?', prompt: 'the inverse of A', ...mc(rand, `A${sup(`${M}1`)}`, [`${M}A`, `A${sup(2)}`, '1 − A']),
    tell: `the same notation as 2${sup(`${M}1`)} = ½: an exponent of −1.` };
} };

T.readResult = { book: 'l5', make(rand) {
  const sol = sample(rand, [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6], 3);
  const fig = matrix(sol.map((v) => [v]), 'X');
  if (rand() < 0.5) {
    const i = int(rand, 0, 2);
    return { ask: `Your calculator shows this for A${sup(`${M}1`)} · B. What is ${'xyz'[i]}?`, prompt: 'Use the matrix.', fig, typed: sol[i], neg: true,
      tell: `the rows are x, y, z in order: x = ${num(sol[0])}, y = ${num(sol[1])}, z = ${num(sol[2])}.` };
  }
  return { ask: `Your calculator shows this for A${sup(`${M}1`)} · B. State the solution.`, prompt: 'Use the matrix.', fig,
    ...mc(rand, pt(...sol), [pt(sol[2], sol[1], sol[0]), pt(sol[1], sol[0], sol[2]), pt(-sol[0], -sol[1], -sol[2]), pt(sol[0], sol[2], sol[1])]),
    tell: `read down the column: x = ${num(sol[0])}, y = ${num(sol[1])}, z = ${num(sol[2])}, or ${pt(...sol)}.` };
} };

module.exports = makeBank(BOOKS, T);
module.exports._parts = { crossing, subSystem, triangle, pairSystem, system3 };
