/**
 * Chapter Review: Algebra 1 — Module 6 (Inequalities, 6.1–6.5), built from Mr. Nappier's guided
 * notes, the Module 6 practice quiz and the practice test. Quick-fire: one move per play — read and
 * graph an inequality (open or closed, which way), one-step and multi-step, the FLIP when dividing by
 * a negative, variables on both sides, distribute first, compound "and" / "or", the banner and the
 * amplifier stories, the proofing box, absolute value inequalities (and the no-solution case), the
 * boundary line and shading of a linear inequality, Rex's closed circle shaded the wrong way, the
 * cumulative ACT items.
 */
const { int, pick, sample, makeBank, esc } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 6', blurb: 'Graphs, one- and multi-step, the flip, compound, absolute value, two-variable inequalities — mixed.' },
  graph: { name: 'Read & Graph', ch: '6.1', blurb: 'Open or closed, which way; the inequality from the graph; set-builder notation.' },
  solve: { name: 'One- & Multi-Step', ch: '6.1–6.2', blurb: 'Solve; FLIP when you divide by a negative; both sides; distribute first; the stories.' },
  compound: { name: 'Compound', ch: '6.3', blurb: 'And (one strip) vs. or (two rays); the proofing box; between.' },
  absval: { name: 'Absolute Value', ch: '6.4', blurb: 'Less than = between; greater than = two rays; the no-solution case.' },
  twoVar: { name: 'Linear Inequalities', ch: '6.5', blurb: 'Dashed or solid, which half-plane, is the point a solution.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'An equation of a line, a slope, f(4).' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const term = (a, v) => (a === 1 ? v : a === -1 ? `${M}${v}` : `${num(a)}${v}`);
const lin = (a, b, v = 'x') => (b === 0 ? term(a, v) : `${term(a, v)} ${b < 0 ? M : '+'} ${Math.abs(b)}`);
const SYM = { lt: '<', le: '≤', gt: '>', ge: '≥' };
const sym = (k) => esc(SYM[k]);
const flip = (k) => ({ lt: 'gt', le: 'ge', gt: 'lt', ge: 'le' }[k]);
/** "x > 3" style answer, with the variable first */
const sol = (v, k, n) => `${v} ${sym(k)} ${num(n)}`;
/** describe the number-line graph of v k n */
const graphOf = (k, n) => `${k === 'le' || k === 'ge' ? 'CLOSED' : 'OPEN'} circle at ${num(n)}, shaded to the ${k === 'lt' || k === 'le' ? 'LEFT' : 'RIGHT'}`;

const T = {};

// ------------------------------------------------------------------ 6.1 read & graph
T.graphIt = { book: 'graph', make(rand) {
  const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const n = nz(rand, -9, 9); const v = pick(rand, ['x', 'y', 'n']); const reversed = rand() < 0.3; // "−4 ≤ y" reads as y ≥ −4
  const shown = reversed ? `${num(n)} ${sym(flip(k))} ${v}` : sol(v, k, n);
  return { ask: 'Which graph shows the solution set?', prompt: shown, ...mc(rand, graphOf(k, n), [graphOf(flip(k), n), graphOf(k === 'lt' ? 'le' : k === 'le' ? 'lt' : k === 'gt' ? 'ge' : 'gt', n), graphOf(flip(k === 'lt' ? 'le' : k === 'le' ? 'lt' : k === 'gt' ? 'ge' : 'gt'), n)]),
    tell: `${reversed ? `read it with ${v} first: ${sol(v, k, n)}. ` : ''}${k === 'le' || k === 'ge' ? '"or equal" includes the number: closed circle' : 'strict: open circle'}; ${k === 'lt' || k === 'le' ? 'less than shades left' : 'greater than shades right'}.` };
} };

T.fromGraph = { book: 'graph', make(rand) {
  const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const n = nz(rand, -9, 9); const v = pick(rand, ['x', 'p', 'w']);
  return { ask: 'Write the inequality for the graph', prompt: `${graphOf(k, n)}.`, ...mc(rand, sol(v, k, n), [sol(v, flip(k), n), sol(v, k === 'lt' ? 'le' : k === 'le' ? 'lt' : k === 'gt' ? 'ge' : 'gt', n), sol(v, flip(k), -n), sol(v, k, -n)]),
    tell: `${k === 'le' || k === 'ge' ? 'closed → or equal to' : 'open → strict'}; shaded ${k === 'lt' || k === 'le' ? 'left → less than' : 'right → greater than'}: ${sol(v, k, n)}.` };
} };

T.setBuilder = { book: 'graph', make(rand) {
  const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const n = nz(rand, -9, 9);
  return { ask: 'Write the solution in set-builder notation', prompt: sol('x', k, n), ...mc(rand, `{x | ${sol('x', k, n)}}`, [`{x | ${sol('x', flip(k), n)}}`, `{${num(n)} | x}`, `(${num(n)}, ∞)`, `{x = ${num(n)}}`]),
    tell: `"the set of all x such that ${sol('x', k, n)}": {x | ${sol('x', k, n)}}.` };
} };

T.rexGraph = { book: 'graph', make(rand) {
  const n = nz(rand, -9, 9); const k = pick(rand, ['lt', 'gt']);
  const wrongCircle = rand() < 0.5; const wrongSide = !wrongCircle || rand() < 0.5;
  const did = `${wrongCircle ? 'CLOSED' : 'OPEN'} circle at ${num(n)}, shaded to the ${wrongSide ? (k === 'lt' ? 'RIGHT' : 'LEFT') : (k === 'lt' ? 'LEFT' : 'RIGHT')}`;
  const ans = wrongCircle && wrongSide ? `two mistakes: ${sym(k)} EXCLUDES ${num(n)} (open circle), and "${k === 'lt' ? 'less' : 'greater'} than" shades ${k === 'lt' ? 'LEFT' : 'RIGHT'}` : wrongCircle ? `${sym(k)} EXCLUDES ${num(n)} — the circle must be OPEN` : `"${k === 'lt' ? 'less' : 'greater'} than" shades to the ${k === 'lt' ? 'LEFT' : 'RIGHT'}, not the ${k === 'lt' ? 'right' : 'left'}`;
  return { ask: `Rex graphed ${sol('x', k, n)} with ${did.replace('CLOSED', 'a CLOSED').replace('OPEN', 'an OPEN')}. What went wrong?`, prompt: 'Error analysis.',
    ...mc(rand, ans, [`nothing — that graph is correct`, `two mistakes: ${sym(k)} EXCLUDES ${num(n)} (open circle), and "${k === 'lt' ? 'less' : 'greater'} than" shades ${k === 'lt' ? 'LEFT' : 'RIGHT'}`, `${sym(k)} EXCLUDES ${num(n)} — the circle must be OPEN`, `"${k === 'lt' ? 'less' : 'greater'} than" shades to the ${k === 'lt' ? 'LEFT' : 'RIGHT'}, not the ${k === 'lt' ? 'right' : 'left'}`, `the circle should be at ${num(-n)}`]),
    tell: `${sol('x', k, n)}: ${graphOf(k, n)}.` };
} };

// ------------------------------------------------------------------ 6.1–6.2 solve
T.oneStep = { book: 'solve', make(rand) {
  const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const v = pick(rand, ['x', 'y', 'k']); const kind = pick(rand, ['add', 'sub', 'mulPos', 'mulNeg']); const x = nz(rand, -9, 9);
  if (kind === 'add' || kind === 'sub') { const c = int(rand, 1, 12); const r = x + (kind === 'add' ? c : -c);
    return { ask: 'Solve', prompt: `${v} ${kind === 'add' ? '+' : M} ${c} ${sym(k)} ${num(r)}`, ...mc(rand, sol(v, k, x), [sol(v, flip(k), x), sol(v, k, x + (kind === 'add' ? 2 * c : -2 * c)), sol(v, k, -x), sol(v, flip(k), -x)]),
      tell: `${kind === 'add' ? 'subtract' : 'add'} ${c} on both sides: ${sol(v, k, x)}. Adding or subtracting never flips the symbol.` }; }
  const a = kind === 'mulPos' ? int(rand, 2, 9) : -int(rand, 2, 9); const r = a * x; const kk = kind === 'mulNeg' ? flip(k) : k;
  return { ask: 'Solve', prompt: `${term(a, v)} ${sym(k)} ${num(r)}`, ...mc(rand, sol(v, kk, x), [sol(v, k, x), sol(v, flip(k), x), sol(v, kk, -x), sol(v, k, -x), sol(v, flip(kk), -x)]),
    tell: kind === 'mulNeg' ? `divide by ${num(a)} and FLIP the symbol: ${sol(v, kk, x)}.` : `divide by ${a}: ${sol(v, kk, x)}. A positive divisor keeps the symbol.` };
} };

T.multiStep = { book: 'solve', make(rand) {
  const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const kind = pick(rand, ['neg', 'both', 'dist']); const x = nz(rand, -8, 9);
  if (kind === 'neg') { const a = -int(rand, 2, 7); const b = nz(rand, -9, 12); const r = a * x + b;
    return { ask: 'Solve', prompt: `${lin(a, b)} ${sym(k)} ${num(r)}`, ...mc(rand, sol('x', flip(k), x), [sol('x', k, x), sol('x', flip(k), -x), sol('x', k, -x), sol('x', flip(k), x + 1)]),
      tell: `${num(a)}x ${sym(k)} ${num(r - b)} → divide by ${num(a)} and FLIP: ${sol('x', flip(k), x)}.` }; }
  if (kind === 'both') { const a = int(rand, 3, 9); const c = int(rand, 1, a - 1); const b = nz(rand, -9, 9); const d = (a - c) * x + b; if (d === b) return T.multiStep.make(rand);
    return { ask: 'Solve', prompt: `${lin(a, b)} ${sym(k)} ${lin(c, d)}`, ...mc(rand, sol('x', k, x), [sol('x', flip(k), x), sol('x', k, -x), sol('x', k, x + 1), sol('x', flip(k), -x)]),
      tell: `${a - c}x ${sym(k)} ${num(d - b)} → ${sol('x', k, x)}. Dividing by the positive ${a - c} keeps the symbol.` }; }
  const kk = int(rand, 2, 7); const b = nz(rand, -9, 9); const r = kk * (x + b);
  return { ask: 'Solve', prompt: `${kk}(x ${b < 0 ? M : '+'} ${Math.abs(b)}) ${sym(k)} ${num(r)}`, ...mc(rand, sol('x', k, x), [sol('x', flip(k), x), sol('x', k, x + b), sol('x', k, -x), sol('x', flip(k), -x)]),
    tell: `distribute (or divide by ${kk}): x ${b < 0 ? M : '+'} ${Math.abs(b)} ${sym(k)} ${num(r / kk)} → ${sol('x', k, x)}.` };
} };

T.banner = { book: 'solve', make(rand) {
  const w = int(rand, 3, 12); const maxP = 2 * w + 2 * int(rand, 5, 20); const l = (maxP - 2 * w) / 2;
  if (rand() < 0.5) return { ask: 'Which inequality finds the possible lengths l?', prompt: `A banner has width ${w} ft; the ribbon border around its edge can be at most ${maxP} ft.`, ...mc(rand, `2l + ${2 * w} ≤ ${maxP}`, [`2l + ${2 * w} ≥ ${maxP}`, `l + ${w} ≤ ${maxP}`, `2l + ${2 * w} ${esc('<')} ${maxP}`]), tell: `perimeter 2l + 2(${w}) "at most" ${maxP}: ≤.` };
  return { ask: 'What is the longest possible length, in feet?', prompt: `A banner has width ${w} ft; the ribbon border around its edge can be at most ${maxP} ft.`, typed: l, tell: `2l + ${2 * w} ≤ ${maxP} → 2l ≤ ${maxP - 2 * w} → l ≤ ${l} ft.` };
} };

T.amplifier = { book: 'solve', make(rand) {
  const saved = int(rand, 10, 40); const per = pick(rand, [8, 10, 12, 14, 15, 20]); const weeks = int(rand, 4, 12); const goal = saved + per * weeks; if (saved === per) return T.amplifier.make(rand);
  if (rand() < 0.5) return { ask: 'Which inequality finds the weeks w?', prompt: `Tomás has $${saved} saved and earns $${per} each week. He needs AT LEAST $${goal}.`, ...mc(rand, `${per}w + ${saved} ≥ ${goal}`, [`${per}w + ${saved} ≤ ${goal}`, `${saved}w + ${per} ≥ ${goal}`, `${per}w ${M} ${saved} ≥ ${goal}`]), tell: `"at least" is ≥: ${per}w + ${saved} ≥ ${goal}.` };
  return { ask: 'At least how many weeks must he save?', prompt: `Tomás has $${saved} saved and earns $${per} each week. He needs AT LEAST $${goal}.`, typed: weeks, tell: `${per}w + ${saved} ≥ ${goal} → ${per}w ≥ ${goal - saved} → w ≥ ${weeks} weeks.` };
} };

T.printing = { book: 'solve', make(rand) {
  const flat = pick(rand, [150, 200, 220, 250]); const per = pick(rand, [2, 3, 4, 5]); const copies = int(rand, 20, 80); const budget = flat + per * copies;
  return { ask: 'How many copies at most?', prompt: `Printing costs a $${flat} flat rate plus $${per} per copy. Suzy's budget is $${budget}.`, typed: copies, tell: `${per}c + ${flat} ≤ ${budget} → ${per}c ≤ ${budget - flat} → c ≤ ${copies} copies.` };
} };

T.wordsToIneq = { book: 'solve', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 1, 20); const r = int(rand, 5, 60);
  const Q = [
    { w: `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][a]} times a number plus ${b} is no more than ${r}.`, ans: `${a}x + ${b} ≤ ${r}` },
    { w: `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][a]} times a number minus ${b} is at least ${r}.`, ans: `${a}x ${M} ${b} ≥ ${r}` },
    { w: `${b} more than ${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][a]} times a number is less than ${r}.`, ans: `${a}x + ${b} ${esc('<')} ${r}` },
    { w: `${b} less than ${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][a]} times a number is more than ${r}.`, ans: `${a}x ${M} ${b} ${esc('>')} ${r}` },
  ];
  const q = pick(rand, Q);
  return { ask: 'Which inequality represents the statement?', prompt: q.w, ...mc(rand, q.ans, Q.map((x) => x.ans)), tell: `"no more than" is ≤, "at least" is ≥, "less than" is ${esc('<')}, "more than" is ${esc('>')}: ${q.ans}.` };
} };

// ------------------------------------------------------------------ 6.3 compound
T.andIneq = { book: 'compound', make(rand) {
  const a = pick(rand, [1, 1, 2, 3, 5]); const lo = nz(rand, -9, 5); const hi = lo + int(rand, 1, 8); const b = nz(rand, -9, 9); const L = a * lo + b; const H = a * hi + b; const k1 = pick(rand, ['lt', 'le']); const k2 = pick(rand, ['lt', 'le']);
  const ans = `${num(lo)} ${sym(k1)} x ${sym(k2)} ${num(hi)}`;
  return { ask: 'Solve the compound inequality', prompt: `${num(L)} ${sym(k1)} ${lin(a, b)} ${sym(k2)} ${num(H)}`, ...mc(rand, ans, [`${num(lo)} ${sym(k2)} x ${sym(k1)} ${num(hi)}`, `${num(L - b)} ${sym(k1)} x ${sym(k2)} ${num(H - b)}`, `${num(-lo)} ${sym(k1)} x ${sym(k2)} ${num(-hi)}`, `x ${sym(k1)} ${num(lo)} or x ${sym(k2)} ${num(hi)}`, `${num(lo)} ${sym(k1)} x ${sym(k2)} ${num(hi + 1)}`]),
    tell: `${b ? `${b < 0 ? 'add' : 'subtract'} ${Math.abs(b)} from all three parts${a > 1 ? ', then' : ''}` : ''}${a > 1 ? ` divide all parts by ${a}` : ''}: ${ans}. One strip, between.` };
} };

T.orIneq = { book: 'compound', make(rand) {
  const lo = nz(rand, -9, 3); const hi = lo + int(rand, 3, 10); const b1 = nz(rand, -9, 9); const b2 = nz(rand, -9, 9); const k1 = pick(rand, ['lt', 'le']); const k2 = pick(rand, ['gt', 'ge']);
  const ans = `x ${sym(k1)} ${num(lo)} or x ${sym(k2)} ${num(hi)}`;
  return { ask: 'Solve the compound inequality', prompt: `x ${b1 < 0 ? M : '+'} ${Math.abs(b1)} ${sym(k1)} ${num(lo + b1)} or x ${b2 < 0 ? M : '+'} ${Math.abs(b2)} ${sym(k2)} ${num(hi + b2)}`,
    ...mc(rand, ans, [`${num(lo)} ${sym(k1)} x ${sym(flip(k2))} ${num(hi)}`, `x ${sym(k1)} ${num(lo + b1)} or x ${sym(k2)} ${num(hi + b2)}`, `x ${sym(flip(k1))} ${num(lo)} or x ${sym(flip(k2))} ${num(hi)}`, `x ${sym(k1)} ${num(-lo)} or x ${sym(k2)} ${num(-hi)}`]),
    tell: `solve each part on its own: ${ans}. "Or" keeps both — two rays going away from each other.` };
} };

T.proofingBox = { book: 'compound', make(rand) {
  const lo = pick(rand, [70, 75, 78, 80]); const hi = lo + pick(rand, [6, 8, 10, 12]); const incl = rand() < 0.6;
  return { ask: 'Write the compound inequality for the allowed temperatures t', prompt: `A proofing box must stay between ${lo}°F and ${hi}°F${incl ? ', inclusive' : ' (not including the endpoints)'}.`,
    ...mc(rand, incl ? `${lo} ≤ t ≤ ${hi}` : `${lo} ${esc('<')} t ${esc('<')} ${hi}`, [incl ? `${lo} ${esc('<')} t ${esc('<')} ${hi}` : `${lo} ≤ t ≤ ${hi}`, `t ≤ ${lo} or t ≥ ${hi}`, `${hi} ≤ t ≤ ${lo}`]),
    tell: `"between" is an AND: one strip from ${lo} to ${hi}${incl ? ', endpoints included (≤)' : ', endpoints excluded'}.` };
} };

T.andOrWhich = { book: 'compound', make(rand) {
  const Q = [
    { q: 'The graph of a compound inequality joined by AND is…', ans: 'the intersection — one strip where both parts overlap', wrongs: ['the union — two rays going opposite ways', 'the whole number line', 'a single point'] },
    { q: 'The graph of a compound inequality joined by OR is…', ans: 'the union — everything in either part', wrongs: ['the intersection — only the overlap', 'a single strip between two numbers', 'always the whole number line'] },
    { q: '−3 < x ≤ 5 means…', ans: 'x > −3 AND x ≤ 5', wrongs: ['x > −3 OR x ≤ 5', 'x < −3 AND x ≥ 5', 'x = −3 or x = 5'] },
    { q: 'x < −2 or x ≥ 4 on a number line looks like…', ans: 'two rays: left from −2 (open) and right from 4 (closed)', wrongs: ['one strip from −2 to 4', 'the whole line', 'two rays pointing toward each other'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'And or or?', prompt: esc(q.q), ...mc(rand, esc(q.ans), q.wrongs.map(esc)), tell: esc(q.ans) + '.' };
} };

// ------------------------------------------------------------------ 6.4 absolute value
T.absIneq = { book: 'absval', make(rand) {
  const kind = pick(rand, ['less', 'greater', 'none', 'all']); const v = pick(rand, ['m', 'n', 'x']); const b = nz(rand, -9, 9); const r = int(rand, 1, 9);
  if (kind === 'none') return { ask: 'Solve', prompt: `|${v} ${b < 0 ? M : '+'} ${Math.abs(b)}| ${esc('<')} ${M}${r}`, ...mc(rand, 'no solution — an absolute value is never less than a negative', [`${num(-b - r)} ${esc('<')} ${v} ${esc('<')} ${num(-b + r)}`, `${v} ${esc('<')} ${num(-b - r)} or ${v} ${esc('>')} ${num(-b + r)}`, 'all real numbers']), tell: 'distance can\'t be negative, so nothing is less than a negative.' };
  if (kind === 'all') return { ask: 'Solve', prompt: `|${v} ${b < 0 ? M : '+'} ${Math.abs(b)}| ≥ ${M}${r}`, ...mc(rand, 'all real numbers — an absolute value is always ≥ a negative', ['no solution', `${v} ≥ ${num(-b - r)}`, `${num(-b - r)} ≤ ${v} ≤ ${num(-b + r)}`]), tell: 'every distance is ≥ 0, so every number works.' };
  const lo = -b - r; const hi = -b + r; const strict = rand() < 0.5;
  if (kind === 'less') { const s = strict ? 'lt' : 'le'; const ans = `${num(lo)} ${sym(s)} ${v} ${sym(s)} ${num(hi)}`;
    return { ask: 'Solve', prompt: `|${v} ${b < 0 ? M : '+'} ${Math.abs(b)}| ${sym(s)} ${r}`, ...mc(rand, ans, [`${v} ${sym(s)} ${num(lo)} or ${v} ${sym(flip(s))} ${num(hi)}`, `${num(-r)} ${sym(s)} ${v} ${sym(s)} ${num(r)}`, `${num(lo)} ${sym(s)} ${v}`, `${num(-lo)} ${sym(s)} ${v} ${sym(s)} ${num(-hi)}`]),
      tell: `less than → between: ${M}${r} ${sym(s)} ${v} ${b < 0 ? M : '+'} ${Math.abs(b)} ${sym(s)} ${r} → ${ans}.` }; }
  const s = strict ? 'gt' : 'ge'; const ans = `${v} ${sym(flip(s))} ${num(lo)} or ${v} ${sym(s)} ${num(hi)}`;
  return { ask: 'Solve', prompt: `|${v} ${b < 0 ? M : '+'} ${Math.abs(b)}| ${sym(s)} ${r}`, ...mc(rand, ans, [`${num(lo)} ${sym(flip(s))} ${v} ${sym(flip(s))} ${num(hi)}`, `${v} ${sym(s)} ${num(hi)}`, `${v} ${sym(flip(s))} ${num(-r)} or ${v} ${sym(s)} ${num(r)}`, `${v} ${sym(s)} ${num(lo)} or ${v} ${sym(flip(s))} ${num(hi)}`]),
    tell: `greater than → two rays: ${v} ${b < 0 ? M : '+'} ${Math.abs(b)} ${sym(s)} ${r} or ${v} ${b < 0 ? M : '+'} ${Math.abs(b)} ${sym(flip(s))} ${M}${r} → ${ans}.` };
} };

T.absCoef = { book: 'absval', make(rand) {
  const a = pick(rand, [2, 3, 4]); const b = nz(rand, -9, 9); const r = int(rand, 2, 12); const lo = (-b - r) / a; const hi = (-b + r) / a; if (!Number.isInteger(lo) || !Number.isInteger(hi)) return T.absCoef.make(rand);
  const greater = rand() < 0.5; const s = greater ? pick(rand, ['gt', 'ge']) : pick(rand, ['lt', 'le']);
  const ans = greater ? `h ${sym(flip(s))} ${num(lo)} or h ${sym(s)} ${num(hi)}` : `${num(lo)} ${sym(s)} h ${sym(s)} ${num(hi)}`;
  return { ask: 'Solve', prompt: `|${lin(a, b, 'h')}| ${sym(s)} ${r}`, ...mc(rand, ans, [greater ? `${num(lo)} ${sym(flip(s))} h ${sym(flip(s))} ${num(hi)}` : `h ${sym(s)} ${num(lo)} or h ${sym(flip(s))} ${num(hi)}`, greater ? `h ${sym(s)} ${num(hi)}` : `h ${sym(s)} ${num(hi)}`, `${num(-r)} ${sym(s)} h ${sym(s)} ${num(r)}`]),
    tell: `${greater ? 'greater → two rays' : 'less → between'}: ${lin(a, b, 'h')} ${sym(s)} ${r} ${greater ? 'or' : 'and'} ${lin(a, b, 'h')} ${sym(flip(s))} ${M}${r} → ${ans}.` };
} };

// ------------------------------------------------------------------ 6.5 two variables
T.boundaryShade = { book: 'twoVar', make(rand) {
  const m = nz(rand, -4, 4); const b = nz(rand, -8, 8); const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const strict = k === 'lt' || k === 'gt'; const above = k === 'gt' || k === 'ge';
  const line = `y = ${term(m, 'x')} ${b < 0 ? M : '+'} ${Math.abs(b)}`;
  return { ask: 'Describe the graph', prompt: `y ${sym(k)} ${term(m, 'x')} ${b < 0 ? M : '+'} ${Math.abs(b)}`, ...mc(rand, `${strict ? 'dashed' : 'solid'} line ${line}, shaded ${above ? 'above' : 'below'}`, [`${strict ? 'solid' : 'dashed'} line ${line}, shaded ${above ? 'above' : 'below'}`, `${strict ? 'dashed' : 'solid'} line ${line}, shaded ${above ? 'below' : 'above'}`, `${strict ? 'solid' : 'dashed'} line ${line}, shaded ${above ? 'below' : 'above'}`]),
    tell: `${strict ? 'strict → dashed boundary' : 'or equal → solid boundary'}; y ${above ? 'greater' : 'less'} → shade ${above ? 'above' : 'below'}.` };
} };

T.isSolution = { book: 'twoVar', make(rand) {
  const m = nz(rand, -4, 4); const b = nz(rand, -8, 8); const k = pick(rand, ['lt', 'le', 'gt', 'ge']); const x = nz(rand, -5, 5); const yl = m * x + b; const y = yl + pick(rand, [-3, -2, -1, 0, 1, 2, 3]);
  const ok = { lt: y < yl, le: y <= yl, gt: y > yl, ge: y >= yl }[k];
  return { ask: `Is (${num(x)}, ${num(y)}) a solution?`, prompt: `y ${sym(k)} ${term(m, 'x')} ${b < 0 ? M : '+'} ${Math.abs(b)}`, ...mc(rand, ok ? `Yes — ${num(y)} ${sym(k)} ${num(yl)} is true` : `No — ${num(y)} ${sym(k)} ${num(yl)} is false`, [ok ? `No — ${num(y)} ${sym(k)} ${num(yl)} is false` : `Yes — ${num(y)} ${sym(k)} ${num(yl)} is true`, 'Yes — every point is a solution', 'No — only points ON the line are solutions']),
    tell: `substitute: right side = ${num(m)}(${num(x)}) ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(yl)}; is ${num(y)} ${sym(k)} ${num(yl)}? ${ok ? 'Yes.' : 'No.'}${y === yl ? ' A point ON the line counts only for ≤ or ≥.' : ''}` };
} };

T.standardToSlopeIneq = { book: 'twoVar', make(rand) {
  const a = nz(rand, -6, 6); const b = pick(rand, [-3, -2, -1, 1, 2, 3]); const c = nz(rand, -12, 12); if (c % b || a % b) return T.standardToSlopeIneq.make(rand); const k = pick(rand, ['lt', 'le', 'gt', 'ge']);
  const kk = b < 0 ? flip(k) : k; const m = -a / b; const B = c / b;
  const show = (q) => `y ${sym(q)} ${lin(m, B)}`;
  return { ask: 'Solve for y', prompt: `${term(a, 'x')} ${b < 0 ? M : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y ${sym(k)} ${num(c)}`, ...mc(rand, show(kk), [show(flip(kk)), `y ${sym(kk)} ${lin(-m, B)}`, `y ${sym(kk)} ${lin(m, -B)}`]),
    tell: `${num(b)}y ${sym(k)} ${term(-a, 'x')} + ${num(c)} → divide by ${num(b)}${b < 0 ? ' and FLIP' : ''}: ${show(kk)}.` };
} };

// ------------------------------------------------------------------ cumulative review
T.lineReview = { book: 'review', make(rand) {
  const m = nz(rand, -6, 6); const b = nz(rand, -9, 9); if (Math.abs(m) === Math.abs(b)) return T.lineReview.make(rand);
  const sif = (mm, bb) => `y = ${term(mm, 'x')} ${bb < 0 ? M : '+'} ${Math.abs(bb)}`;
  return { ask: 'Which is the equation of the line?', prompt: `Slope ${num(m)}, y-intercept ${num(b)}.`, ...mc(rand, sif(m, b), [sif(b, m), sif(m, -b), sif(-m, b), sif(-b, m)]), tell: `m goes with x, b stands alone: ${sif(m, b)}.` };
} };

T.slopeReview = { book: 'review', make(rand) {
  const x1 = int(rand, -5, 5); const y1 = int(rand, -8, 8); const run = pick(rand, [1, 2, 3, 4, 6]); const m = nz(rand, -6, 6); const x2 = x1 + run; const y2 = y1 + m * run;
  return { ask: 'What is the slope?', prompt: `Through (${num(x1)}, ${num(y1)}) and (${num(x2)}, ${num(y2)}).`, typed: m, neg: m < 0, tell: `(${num(y2)} ${M} ${num(y1)})/(${num(x2)} ${M} ${num(x1)}) = ${num(m * run)}/${run} = ${num(m)}.` };
} };

T.evalF = { book: 'review', make(rand) {
  const a = int(rand, 2, 9); const b = int(rand, 1, 9); const x = int(rand, 2, 6);
  return { ask: `f(x) = ${a}x ${M} ${b}. What is f(${x})?`, prompt: 'Substitute and simplify.', typed: a * x - b, neg: a * x - b < 0, tell: `${a}(${x}) ${M} ${b} = ${a * x - b}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    [esc('a sentence with <, >, ≤, ≥ or ≠'), 'inequality'], [esc('{x | x > 3} — "the set of all x such that…"'), 'set-builder notation'], ['two inequalities joined by "and" or "or"', 'compound inequality'],
    ['the graph of an "and" compound inequality', 'intersection'], ['the graph of an "or" compound inequality', 'union'], ['the line that splits the plane in a linear inequality\'s graph', 'boundary'],
    ['the region on one side of the boundary', 'half-plane'], ['what happens to the symbol when you multiply or divide by a negative', 'it flips'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
