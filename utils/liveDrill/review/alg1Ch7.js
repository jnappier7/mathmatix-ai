/**
 * Chapter Review: Algebra 1 — Module 7 (Systems of Equations and Inequalities, 7.1–7.5), built from
 * Mr. Nappier's guided notes, the "3 Methods" review, the quiz and the Module 7 practice test.
 * Quick-fire: every play is one move — how many solutions, is this point one, which equation
 * comes out of the substitution, what do you multiply by, what does adding give you — on the
 * course drill's own speed tiers. The two "solve it" templates are the only whole solves, and
 * their numbers stay small.
 *
 * Wrong choices are the slips the worked keys call out: forgetting to distribute, adding when the
 * coefficients aren't opposites, reading parallel lines as "one solution", a swapped system.
 */
const { M, num, int, pick, sample, signed, coef, esc, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 7', blurb: 'Graphing, substitution, elimination, inequalities and word problems, mixed.' },
  graph: { name: 'Solutions & Graphs', ch: '7.1', blurb: 'Is the point a solution? One, none or infinitely many? Consistent or not?' },
  sub: { name: 'Substitution', ch: '7.2', blurb: 'What you get after substituting, and small solves.' },
  elim: { name: 'Elimination', ch: '7.3–7.4', blurb: 'What to multiply by, what adding gives, and small solves.' },
  ineq: { name: 'Inequalities', ch: '7.5', blurb: 'Is the point in the shaded region? Dashed or solid?' },
  word: { name: 'Word Problems', ch: 'Mixed', blurb: 'Pick the system that matches the story; the quick cost problems.' },
};

// ---------------------------------------------------------------- writing equations

const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const pt = (x, y) => `(${num(x)}, ${num(y)})`;
/** y = mx + b, integers. */
const si = (m, b) => `y = ${m === 0 ? num(b) : `${coef(m)}${signed(b)}`}`;
/** ax + by = c in standard form, integers (a or b may be 0, not both). */
function std(a, b, c, x = 'x', y = 'y') {
  const parts = [];
  if (a !== 0) parts.push(coef(a, x));
  if (b !== 0) parts.push(parts.length ? (b < 0 ? ` ${M} ${coef(-b, y)}` : ` + ${coef(b, y)}`) : coef(b, y));
  return `${parts.join('')} = ${num(c)}`;
}
const system = (e1, e2) => `${e1}<br>${e2}`;
const onLine = (m, b, x, y) => m * x + b === y;

// ---------------------------------------------------------------- templates

const T = {};

T.isSolution = { book: 'graph', make(rand) {
  const m1 = nz(rand, -4, 4); let m2 = nz(rand, -4, 4); while (m2 === m1) m2 = nz(rand, -4, 4);
  const [x0, y0] = [int(rand, -5, 5), int(rand, -5, 5)];
  const b1 = y0 - m1 * x0; const b2 = y0 - m2 * x0;
  const kind = pick(rand, ['both', 'first', 'second', 'neither']);
  let P = [x0, y0];
  if (kind === 'first') { const x = x0 + nz(rand, -3, 3); P = [x, m1 * x + b1]; }
  if (kind === 'second') { const x = x0 + nz(rand, -3, 3); P = [x, m2 * x + b2]; }
  if (kind === 'neither') { let x; let y; do { x = int(rand, -6, 6); y = int(rand, -8, 8); } while (onLine(m1, b1, x, y) || onLine(m2, b2, x, y)); P = [x, y]; }
  const label = { both: 'Yes — it satisfies both equations', first: 'No — it satisfies only the first equation', second: 'No — it satisfies only the second equation', neither: 'No — it satisfies neither equation' };
  const check = (m, b) => `${num(m)}(${num(P[0])})${signed(b)} = ${num(m * P[0] + b)}`;
  return { ask: `Is ${pt(...P)} a solution of the system?`, prompt: system(si(m1, b1), si(m2, b2)),
    choices: [label[kind], ...['both', 'first', 'second', 'neither'].filter((k) => k !== kind).map((k) => label[k])], answer: 0,
    tell: `check it in BOTH equations. First: ${check(m1, b1)}${onLine(m1, b1, ...P) ? ' ✓' : ` ≠ ${num(P[1])}`}. Second: ${check(m2, b2)}${onLine(m2, b2, ...P) ? ' ✓' : ` ≠ ${num(P[1])}`}. A solution of a system must work in every equation.` };
} };

T.howMany = { book: 'graph', make(rand) {
  const kind = pick(rand, ['one', 'none', 'many']);
  const m = nz(rand, -4, 4); const b = int(rand, -6, 6);
  let e1 = si(m, b); let e2; let why;
  if (kind === 'one') { let m2 = nz(rand, -4, 4); while (m2 === m) m2 = nz(rand, -4, 4); e2 = si(m2, int(rand, -6, 6)); why = `the slopes are different (${num(m)} and ${num(m2)}), so the lines cross exactly once`; }
  if (kind === 'none') { let b2 = int(rand, -6, 6); while (b2 === b) b2 = int(rand, -6, 6); e2 = si(m, b2); why = `same slope ${num(m)}, different y-intercepts — parallel lines never meet`; }
  if (kind === 'many') {
    const k = pick(rand, [2, 3, -2, -1]); // the same line, written k× in standard form: −kmx + ky = kb
    e2 = std(-k * m, k, k * b); why = `the second equation is ${num(k)} × the first (solve it for y: you get ${e1}) — the same line, so every point on it is a solution`;
  }
  const label = { one: 'exactly one solution', none: 'no solution', many: 'infinitely many solutions' };
  return { ask: 'How many solutions?', prompt: system(e1, e2), choices: [label[kind], ...['one', 'none', 'many'].filter((k) => k !== kind).map((k) => label[k])], answer: 0,
    tell: `${why}.` };
} };

T.vocab = { book: 'graph', make(rand) {
  const V = [
    { term: 'consistent', def: 'a system with at least one solution (the lines meet)' },
    { term: 'inconsistent', def: 'a system with no solution (parallel lines)' },
    { term: 'independent', def: 'a consistent system with exactly one solution (the lines cross once)' },
    { term: 'dependent', def: 'a consistent system with infinitely many solutions (the same line twice)' },
    { term: 'system of equations', def: 'a set of two or more equations with the same variables' },
    { term: 'solution of a system', def: 'an ordered pair that makes every equation in the system true' },
    { term: 'elimination', def: 'solving a system by adding or subtracting the equations to remove a variable' },
    { term: 'substitution', def: 'solving a system by replacing a variable in one equation with an expression from the other' },
  ];
  const v = pick(rand, V); const others = sample(rand, V.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

T.subStep = { book: 'sub', make(rand) {
  // y = mx + b into ax + cy = d. After substituting and simplifying: (a + cm)x + cb = d.
  const m = nz(rand, -4, 4); const b = nz(rand, -6, 6); const a = nz(rand, -5, 5); const c = nz(rand, -4, 4); const d = int(rand, -12, 12);
  if (a + c * m === 0) return T.subStep.make(rand);
  const line = (p, q) => `${coef(p)}${signed(q)} = ${num(d)}`;
  const ans = line(a + c * m, c * b);
  const wrong = [line(a + c * m, b), line(a + m, b), line(a + c * m, -c * b), line(a + c * m + c, c * b)].filter((s) => s !== ans);
  return { ask: 'After substituting and simplifying, which equation do you get?', prompt: system(si(m, b), std(a, c, d)),
    choices: [ans, ...sample(rand, [...new Set(wrong)], 3)], answer: 0,
    tell: `replace y with (${si(m, b).slice(4)}): ${coef(a)} + ${num(c)}(${si(m, b).slice(4)}) = ${num(d)}. Distribute to BOTH terms: ${coef(a)}${c * m < 0 ? ` ${M} ${coef(-c * m)}` : ` + ${coef(c * m)}`}${signed(c * b)} = ${num(d)}, then combine the x terms.` };
} };

T.solveSub = { book: 'sub', make(rand) {
  const m = nz(rand, -3, 3); const b = int(rand, -5, 5); const x0 = int(rand, -5, 5); const y0 = m * x0 + b;
  const a = nz(rand, -4, 4); const c = nz(rand, -4, 4); const d = a * x0 + c * y0;
  if (a + c * m === 0) return T.solveSub.make(rand); // the lines would be parallel or the same
  const which = rand() < 0.5 ? 'x' : 'y';
  return { ask: `Solve the system. What is ${which}?`, prompt: system(si(m, b), std(a, c, d)), typed: which === 'x' ? x0 : y0, neg: true,
    tell: `substitute: ${coef(a)} + ${num(c)}(${si(m, b).slice(4)}) = ${num(d)} → ${coef(a + c * m)} = ${num(d - c * b)} → x = ${num(x0)}, then y = ${num(m)}(${num(x0)})${signed(b)} = ${num(y0)}. Solution ${pt(x0, y0)}.` };
} };

T.method = { book: 'sub', make(rand) {
  const x0 = int(rand, -4, 4); const y0 = int(rand, -4, 4);
  const kind = pick(rand, ['isolated', 'opposite', 'same']);
  let e1; let e2; let ans; let why;
  if (kind === 'isolated') {
    const m = nz(rand, -3, 3); const a = nz(rand, -4, 4); const c = nz(rand, -4, 4);
    e1 = si(m, y0 - m * x0); e2 = std(a, c, a * x0 + c * y0); ans = 'Substitution';
    why = 'y is already alone in the first equation — drop that expression into the second';
  } else {
    const a1 = nz(rand, -5, 5); let a2 = nz(rand, -5, 5); while (a2 === a1 || a2 === -a1) a2 = nz(rand, -5, 5);
    const c = nz(rand, 2, 5); const c2 = kind === 'opposite' ? -c : c;
    e1 = std(a1, c, a1 * x0 + c * y0); e2 = std(a2, c2, a2 * x0 + c2 * y0);
    ans = kind === 'opposite' ? 'Elimination — add the equations' : 'Elimination — subtract the equations';
    why = kind === 'opposite' ? `the y coefficients are opposites (${num(c)} and ${num(c2)}), so adding wipes y out in one step` : `the y coefficients are the same (${num(c)}), so subtracting wipes y out in one step`;
  }
  const all = ['Substitution', 'Elimination — add the equations', 'Elimination — subtract the equations', 'Graphing both lines by hand'];
  return { ask: 'Which method gets there fastest?', prompt: system(e1, e2), choices: [ans, ...all.filter((s) => s !== ans)], answer: 0, tell: `${why}.` };
} };

T.elimMult = { book: 'elim', make(rand) {
  // a1x + b1y = c1 and a2x + b2y = c2 where a1 | a2: multiply the first by −a2/a1 and add to eliminate x.
  const a1 = pick(rand, [1, 2, 3, -1, -2, -3]); const k = pick(rand, [2, 3, 4, -2, -3, -4]); const a2 = a1 * k;
  const b1 = nz(rand, -5, 5); let b2 = nz(rand, -5, 5); while (b2 === b1 * k) b2 = nz(rand, -5, 5);
  const x0 = int(rand, -4, 4); const y0 = int(rand, -4, 4);
  const ans = -k;
  const wrong = [...new Set([k, -a1, a2, b2, -b2, 1].filter((n) => n !== ans))];
  return { ask: 'To eliminate x by ADDING, multiply the first equation by', prompt: system(std(a1, b1, a1 * x0 + b1 * y0), std(a2, b2, a2 * x0 + b2 * y0)),
    choices: [num(ans), ...sample(rand, wrong, 3).map(num)], answer: 0,
    tell: `you need the x coefficients to be opposites: ${num(a1)} × (${num(ans)}) = ${num(-a2)}, the opposite of ${num(a2)}. Then adding leaves only y.` };
} };

T.elimAdd = { book: 'elim', make(rand) {
  // opposite y coefficients: adding gives (a1 + a2)x = c1 + c2
  const a1 = nz(rand, -6, 6); let a2 = nz(rand, -6, 6); while (a2 === -a1 || a2 === a1) a2 = nz(rand, -6, 6);
  const b = nz(rand, -5, 5); const x0 = int(rand, -4, 4); const y0 = int(rand, -4, 4);
  const c1 = a1 * x0 + b * y0; const c2 = a2 * x0 - b * y0;
  const ans = `${coef(a1 + a2)} = ${num(c1 + c2)}`;
  const keptY = `${coef(a1 + a2)}${b < 0 ? ` ${M} ${coef(-2 * b, 'y')}` : ` + ${coef(2 * b, 'y')}`} = ${num(c1 + c2)}`;
  const wrong = [...new Set([`${coef(a1 - a2)} = ${num(c1 - c2)}`, `${coef(a1 + a2)} = ${num(c1 - c2)}`, keptY, `${coef(a1 * a2)} = ${num(c1 * c2)}`].filter((s) => s !== ans))];
  return { ask: 'Add the two equations. What do you get?', prompt: system(std(a1, b, c1), std(a2, -b, c2)),
    choices: [ans, ...sample(rand, wrong, 3)], answer: 0,
    tell: `the y terms are opposites (${coef(b, 'y')} and ${coef(-b, 'y')}) and cancel; add the x terms and the constants: ${ans}.` };
} };

T.solveElim = { book: 'elim', make(rand) {
  const a1 = nz(rand, -5, 5); let a2 = nz(rand, -5, 5); while (a2 === -a1) a2 = nz(rand, -5, 5);
  const b = nz(rand, -5, 5); const x0 = int(rand, -5, 5); const y0 = int(rand, -5, 5);
  const c1 = a1 * x0 + b * y0; const c2 = a2 * x0 - b * y0;
  const which = rand() < 0.5 ? 'x' : 'y';
  return { ask: `Solve the system. What is ${which}?`, prompt: system(std(a1, b, c1), std(a2, -b, c2)), typed: which === 'x' ? x0 : y0, neg: true,
    tell: `add to drop y: ${coef(a1 + a2)} = ${num(c1 + c2)} → x = ${num(x0)}; then ${num(a1)}(${num(x0)}) + ${num(b)}y = ${num(c1)} → y = ${num(y0)}. Solution ${pt(x0, y0)}.` };
} };

T.elimForgot = { book: 'elim', make(rand) {
  // Rex added right away: the coefficients weren't opposites. What should he have done?
  const a1 = pick(rand, [1, 2, 3]); const k = pick(rand, [2, 3, 4]); const a2 = a1 * k;
  const b1 = nz(rand, 2, 5); let b2 = nz(rand, 2, 7); while (b2 === b1 * k) b2 = nz(rand, 2, 7);
  const x0 = int(rand, -4, 4); const y0 = int(rand, -4, 4);
  const ans = `Multiply the first equation by ${num(-k)} first, so the x terms are opposites`;
  return { ask: 'Error analysis', prompt: `${system(std(a1, b1, a1 * x0 + b1 * y0), std(a2, b2, a2 * x0 + b2 * y0))}<br>Rex added the equations right away and got ${coef(a1 + a2)} + ${coef(b1 + b2, 'y')} = ${num((a1 + a2) * x0 + (b1 + b2) * y0)}, which still has both variables. What did he forget?`,
    choices: [ans, 'Subtract the constants instead of adding them', 'Add the equations a second time', `Multiply the first equation by ${num(k)} first, then add`], answer: 0,
    tell: `adding only eliminates a variable whose coefficients are OPPOSITES. ${num(a1)} × (${num(-k)}) = ${num(-a2)}, the opposite of ${num(a2)}, so multiply the first equation by ${num(-k)}, then add.` };
} };

T.ineqPoint = { book: 'ineq', make(rand) {
  const m1 = nz(rand, -3, 3); const b1 = int(rand, -4, 4); const m2 = nz(rand, -3, 3); const b2 = int(rand, -4, 4);
  const s1 = pick(rand, ['>', '≥']); const s2 = pick(rand, ['<', '≤']);
  const [x, y] = [int(rand, -5, 5), int(rand, -8, 8)];
  const test = (m, b, s) => { const v = m * x + b; return s === '>' ? y > v : s === '≥' ? y >= v : s === '<' ? y < v : y <= v; };
  const ok1 = test(m1, b1, s1); const ok2 = test(m2, b2, s2);
  const kind = ok1 && ok2 ? 'both' : ok1 ? 'first' : ok2 ? 'second' : 'neither';
  const label = { both: 'Yes — it satisfies both inequalities', first: 'No — it satisfies only the first', second: 'No — it satisfies only the second', neither: 'No — it satisfies neither' };
  const show = (m, b, s, ok) => `${num(y)} ${esc(s)} ${num(m * x + b)} is ${ok ? 'true' : 'false'}`;
  // the cards are HTML: a bare "<" would swallow the rest of the line
  return { ask: `Is ${pt(x, y)} a solution of the system?`, prompt: system(`y ${esc(s1)} ${si(m1, b1).slice(4)}`, `y ${esc(s2)} ${si(m2, b2).slice(4)}`),
    choices: [label[kind], ...['both', 'first', 'second', 'neither'].filter((k) => k !== kind).map((k) => label[k])], answer: 0,
    tell: `substitute x = ${num(x)}, y = ${num(y)}. First: ${show(m1, b1, s1, ok1)}. Second: ${show(m2, b2, s2, ok2)}. A solution must be in BOTH shaded regions.` };
} };

T.ineqBoundary = { book: 'ineq', make(rand) {
  const m1 = nz(rand, -3, 3); const b1 = int(rand, -4, 4); let m2 = nz(rand, -3, 3); let b2 = int(rand, -4, 4);
  while (m2 === m1 && b2 === b1) { m2 = nz(rand, -3, 3); b2 = int(rand, -4, 4); }
  const s1 = pick(rand, ['>', '≥', '<', '≤']); const s2 = pick(rand, ['>', '≥', '<', '≤']);
  const dashed = (s) => s === '>' || s === '<';
  const kind = dashed(s1) && dashed(s2) ? 'both' : dashed(s1) ? 'first' : dashed(s2) ? 'second' : 'neither';
  const label = { both: 'Both boundary lines are dashed', first: 'Only the first boundary line is dashed', second: 'Only the second boundary line is dashed', neither: 'Both boundary lines are solid' };
  return { ask: 'Dashed or solid?', prompt: system(`y ${esc(s1)} ${si(m1, b1).slice(4)}`, `y ${esc(s2)} ${si(m2, b2).slice(4)}`),
    choices: [label[kind], ...['both', 'first', 'second', 'neither'].filter((k) => k !== kind).map((k) => label[k])], answer: 0,
    tell: `a strict inequality (&lt; or &gt;) gets a DASHED line — points on it are not solutions; ≤ and ≥ get a solid line.` };
} };

T.wordSystem = { book: 'word', make(rand) {
  const x0 = int(rand, 1, 9); const y0 = int(rand, 1, 9);
  const p = pick(rand, [2, 3, 4, 5]); let q = pick(rand, [2, 3, 4, 5]); while (q === p) q = pick(rand, [2, 3, 4, 5]);
  const total = p * x0 + q * y0; const sum = x0 + y0;
  const ans = system(std(p, q, total), std(1, 1, sum));
  const wrong = [system(std(q, p, total), std(1, 1, sum)), system(std(p, q, sum), std(1, 1, total)), system(std(p, q, total), std(1, -1, sum))];
  return { ask: 'Which system matches the story?', prompt: `${p === 2 ? 'Two' : p === 3 ? 'Three' : p === 4 ? 'Four' : 'Five'} times a number x plus ${q === 2 ? 'two' : q === 3 ? 'three' : q === 4 ? 'four' : 'five'} times another number y is ${total}. The sum of the two numbers is ${sum}.`,
    choices: [ans, ...wrong], answer: 0,
    tell: `"${p} times x plus ${q} times y is ${total}" → ${std(p, q, total)}; "the sum of the numbers is ${sum}" → ${std(1, 1, sum)}. (The numbers are ${x0} and ${y0}.)` };
} };

T.quickPrice = { book: 'word', make(rand) {
  // n candles + k vases cost A; n candles + 1 vase cost B → subtract: (k − 1) vases cost A − B.
  const n = int(rand, 2, 5); const k = int(rand, 2, 4); const vase = int(rand, 3, 12); const candle = int(rand, 2, 9);
  const A = n * candle + k * vase; const B = n * candle + vase;
  const [item1, item2] = pick(rand, [['candles', 'vases'], ['notebooks', 'pens'], ['tacos', 'drinks'], ['shirts', 'hats']]);
  const which = rand() < 0.5 ? 2 : 1;
  return { ask: `What does one ${which === 2 ? item2.slice(0, -1) : item1.slice(0, -1)} cost, in dollars?`,
    prompt: `${n} ${item1} and ${k} ${item2} cost $${A}. ${n} ${item1} and 1 ${item2.slice(0, -1)} cost $${B}.`,
    typed: which === 2 ? vase : candle,
    tell: `the ${item1} match, so subtract the orders: ${k - 1} ${k - 1 === 1 ? item2.slice(0, -1) : item2} cost $${A - B} → one ${item2.slice(0, -1)} is $${vase}. Then ${n} ${item1} cost $${B} ${M} $${vase} = $${B - vase}, so one ${item1.slice(0, -1)} is $${candle}.` };
} };

T.breakEven = { book: 'word', make(rand) {
  const fA = pick(rand, [20, 30, 40, 50, 60]); const rA = int(rand, 5, 15); const n = int(rand, 3, 12);
  const rB = rA + pick(rand, [2, 3, 4, 5, 6]); const fB = fA - (rB - rA) * n; // equal cost after n lessons
  if (fB < 0) return T.breakEven.make(rand);
  const [a, b, unit] = pick(rand, [['Studio A', 'Studio B', 'lesson'], ['Gym A', 'Gym B', 'visit'], ['Plan A', 'Plan B', 'month']]);
  return { ask: `After how many ${unit}s do they cost the same?`, prompt: `${a} charges a $${fA} fee plus $${rA} per ${unit}. ${b} charges a $${fB} fee plus $${rB} per ${unit}.`,
    typed: n, tell: `set the costs equal: ${fA} + ${rA}n = ${fB} + ${rB}n → ${fA - fB} = ${rB - rA}n → n = ${n}. Both cost $${fA + rA * n} then.` };
} };

module.exports = makeBank(BOOKS, T);
