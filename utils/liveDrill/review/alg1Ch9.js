/**
 * Chapter Review: Algebra 1 — Module 9 (Exponential Functions and Sequences, 9.1–9.5), built from
 * Mr. Nappier's guided notes and the Module 9 practice test. Quick-fire: one move per play —
 * evaluate a · bˣ, growth or decay and its rate, write the model, read the table, the common
 * ratio, the next term, the explicit formula.
 *
 * Wrong choices are the keys' slips: the rate as the factor (4000(0.06)ˣ), adding the percent twice
 * instead of compounding, a decay rate read as its factor, a geometric sequence called arithmetic.
 */
const { M, num, int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 9', blurb: 'Exponential functions, growth and decay, writing models, geometric sequences — mixed.' },
  eval: { name: 'Exponential Functions', ch: '9.1', blurb: 'Evaluate a · bˣ, growth or decay, the asymptote, key features.' },
  model: { name: 'Growth & Decay Models', ch: '9.3', blurb: 'Write y = a(1 ± r)ᵗ from a story; the rate from the factor; compounding.' },
  write: { name: 'Writing from Points & Tables', ch: '9.3', blurb: 'Through two points; linear or exponential from a table; the rule.' },
  seq: { name: 'Geometric Sequences', ch: '9.5', blurb: 'Common ratio, next term, the explicit formula, arithmetic vs. geometric.' },
};

const sup = (e) => `<sup>${e}</sup>`;
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const fn = (a, b, v = 'x') => `${a}${a === 1 ? '' : ' · '}${b}${sup(v)}`.replace(/^1 · /, '');
const dec = (x) => String(Math.round(x * 10000) / 10000);
const PERCENTS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50];
const money = (n) => `$${n.toLocaleString('en-US')}`;

const T = {};

T.evaluate = { book: 'eval', make(rand) {
  const b = pick(rand, [2, 3, 4, 5]); const neg = rand() < 0.4;
  if (neg) { const e = int(rand, 1, 3); const a = b ** e * int(rand, 1, 6);
    return { ask: `Find f(${M}${e})`, prompt: `f(x) = ${fn(a, b)}`, typed: a / b ** e, tell: `${b}${sup(`${M}${e}`)} = 1/${b ** e}, so ${a} · 1/${b ** e} = ${a / b ** e}.` }; }
  const e = int(rand, 1, 3); const a = int(rand, 2, 9);
  return { ask: `Find f(${e})`, prompt: `f(x) = ${fn(a, b)}`, typed: a * b ** e, tell: `${b}${sup(e)} = ${b ** e}, so ${a} · ${b ** e} = ${a * b ** e}. (Not (${a} · ${b})${sup(e)}.)` };
} };

T.growthOrDecay = { book: 'eval', make(rand) {
  const a = pick(rand, [120, 250, 560, 725, 900, 1500]); const r = pick(rand, PERCENTS); const growth = rand() < 0.5;
  const factor = growth ? 1 + r / 100 : 1 - r / 100;
  const ans = `${growth ? 'growth' : 'decay'} — ${r}% rate`;
  const wrong = [`${growth ? 'decay' : 'growth'} — ${r}% rate`, `${growth ? 'growth' : 'decay'} — ${Math.round(factor * 100)}% rate`, `${growth ? 'growth' : 'decay'} — ${growth ? 100 - r : 100 + r}% rate`];
  return { ask: 'Growth or decay, and the percent rate of change?', prompt: `y = ${a}(${dec(factor)})${sup('x')}`, choices: [ans, ...wrong], answer: 0,
    tell: `the factor ${dec(factor)} is ${growth ? 'above' : 'below'} 1, so ${growth ? 'growth' : 'decay'}; the rate is |1 − ${dec(factor)}| = ${r}%.` };
} };

T.asymptote = { book: 'eval', make(rand) {
  const a = int(rand, 2, 9); const b = pick(rand, [2, 3, 4, 5]);
  const Q = [
    { ask: 'What value does y approach as x becomes very negative, and what is that line called?', ans: 'y = 0 — the asymptote', wrong: [`y = ${a} — the y-intercept`, 'x = 0 — the asymptote', 'it has no limit — it keeps growing'] },
    { ask: 'What is the y-intercept?', ans: `(0, ${a})`, wrong: [`(0, ${b})`, `(0, ${a * b})`, '(0, 0)'] },
    { ask: 'What is the domain, and what is the range?', ans: 'domain: all real numbers; range: y > 0', wrong: ['domain: x > 0; range: all real numbers', 'domain: all real numbers; range: all real numbers', `domain: x ≥ 0; range: y ≥ ${a}`] },
    { ask: 'Describe the end behavior', ans: 'as x → ∞, y → ∞; as x → −∞, y → 0', wrong: ['as x → ∞, y → 0; as x → −∞, y → ∞', 'as x → ∞, y → ∞; as x → −∞, y → −∞', `as x → ∞, y → ${a}; as x → −∞, y → 0`] },
  ];
  const q = pick(rand, Q);
  return { ask: q.ask, prompt: `y = ${fn(a, b)}`, choices: [q.ans, ...q.wrong], answer: 0,
    tell: q.ans === 'y = 0 — the asymptote' ? `${b}${sup('x')} gets closer and closer to 0 for very negative x but never reaches it — the horizontal asymptote is y = 0.` : `for y = a · b${sup('x')} with b > 1: y-intercept (0, a), range y > 0, rises to the right and flattens toward y = 0 on the left.` };
} };

T.writeModel = { book: 'model', make(rand) {
  const stories = [
    { a: pick(rand, [4000, 2500, 12000, 850]), what: (a) => `A town of ${a.toLocaleString('en-US')} residents`, growth: true, unit: 'year' },
    { a: pick(rand, [1000, 1609, 500]), what: (a) => `A ${money(a)} account balance`, growth: false, unit: 'month' },
    { a: pick(rand, [100, 80, 60]), what: (a) => `A warrior with ${a} life points`, growth: false, unit: 'minute' },
    { a: pick(rand, [24, 36, 50]), what: (a) => `A bakery that sells ${a} loaves the first week`, growth: true, unit: 'week' },
  ];
  const s = pick(rand, stories); const r = pick(rand, PERCENTS.filter((p) => p <= 35)); const a = s.a;
  const f = s.growth ? 1 + r / 100 : 1 - r / 100; const v = s.unit === 'year' ? 'x' : 't';
  const model = (factor) => `y = ${a.toLocaleString('en-US')}(${dec(factor)})${sup(v)}`;
  return { ask: 'Write an exponential function for the situation', prompt: `${s.what(a)} ${s.growth ? 'grows' : 'shrinks'} ${r}% per ${s.unit}.`,
    choices: [model(f), model(r / 100), model(s.growth ? 1 - r / 100 : 1 + r / 100), `y = ${a.toLocaleString('en-US')} ${s.growth ? '+' : M} ${r}${v}`], answer: 0,
    tell: `y = a(1 ${s.growth ? '+' : M} r)${sup(v)}: the factor is 1 ${s.growth ? '+' : M} ${dec(r / 100)} = ${dec(f)}, not the rate by itself and not a constant ${s.growth ? 'added' : 'subtracted'} each ${s.unit}.` };
} };

T.interpret = { book: 'model', make(rand) {
  const a = pick(rand, [480, 320, 750, 1200]); const r = pick(rand, PERCENTS); const growth = rand() < 0.6; const f = growth ? 1 + r / 100 : 1 - r / 100;
  const ans = `initial value ${a}; factor ${dec(f)}, so it ${growth ? 'grows' : 'shrinks'} ${r}% each period`;
  return { ask: 'Identify the initial value and the factor, and interpret them', prompt: `y = ${a}(${dec(f)})${sup('x')}`,
    choices: [ans, `initial value ${dec(f)}; factor ${a}, so it ${growth ? 'grows' : 'shrinks'} ${a}% each period`, `initial value ${a}; factor ${dec(f)}, so it ${growth ? 'grows' : 'shrinks'} ${Math.round(f * 100)}% each period`, `initial value ${a}; factor ${dec(f)}, so it ${growth ? 'shrinks' : 'grows'} ${r}% each period`], answer: 0,
    tell: `a = ${a} is the starting amount; b = ${dec(f)} multiplies it each period — ${growth ? '' : 'below 1, so '}a ${r}% ${growth ? 'increase' : 'decrease'}.` };
} };

T.predictInteger = { book: 'model', make(rand) {
  const stories = [
    { a: 8, b: 4, unit: 'hour', what: 'A social media post is seen by 8 people, and the number who have seen it QUADRUPLES each hour.' },
    { a: 5, b: 3, unit: 'day', what: 'A rumor is known by 5 people, and the number TRIPLES each day.' },
    { a: 12, b: 2, unit: 'week', what: 'A lily pad patch covers 12 square feet, and it DOUBLES each week.' },
    { a: 320, b: 1 / 2, unit: 'week', what: 'A pond has 320 square feet of algae, and a treatment cuts the covered area in HALF each week.' },
    { a: 729, b: 1 / 3, unit: 'round', what: 'A tournament starts with 729 players, and each round keeps ONE THIRD of them.' },
  ];
  const s = pick(rand, stories); const n = int(rand, 2, s.b < 1 ? 4 : 3);
  const val = s.a * s.b ** n;
  return { ask: `How much after ${n} ${s.unit}s?`, prompt: s.what, typed: Math.round(val),
    tell: `y = ${s.a} · ${s.b < 1 ? `(1/${Math.round(1 / s.b)})` : s.b}${sup(n)} = ${Math.round(val)}.` };
} };

T.untilAtLeast = { book: 'model', make(rand) {
  const a = pick(rand, [2, 3, 5, 8]); const b = pick(rand, [2, 3, 4]); const n = int(rand, 2, 4); const target = a * b ** n;
  return { ask: `After how many hours have at least ${target} people seen it?`, prompt: `A post is seen by ${a} people, and the number who have seen it is multiplied by ${b} each hour.`, typed: n,
    tell: `y = ${a} · ${b}${sup('x')}; ${a} · ${b}${sup(n)} = ${target} → ${n} hours.` };
} };

T.compoundError = { book: 'model', make(rand) {
  const cases = [[200, 10, 2, 242], [400, 5, 2, 441], [500, 20, 2, 720], [1000, 10, 3, 1331], [100, 50, 2, 225], [800, 25, 2, 1250], [300, 10, 2, 363]];
  const [a, r, n, ans] = pick(rand, cases);
  return { ask: 'Error analysis', prompt: `To find the value of ${money(a)} growing ${r}% per year for ${n} years, Rex added ${r * n}% at once: ${a}(${dec(1 + (r * n) / 100)}) = ${money(a * (1 + (r * n) / 100))}. Find the correct value.`, typed: ans,
    tell: `percent growth COMPOUNDS — multiply by ${dec(1 + r / 100)} ${n} times: ${a}(${dec(1 + r / 100)})${sup(n)} = ${money(ans)}.` };
} };

T.compoundExpr = { book: 'model', make(rand) {
  const P = pick(rand, [2500, 1500, 5500, 800]); const r = pick(rand, [3, 4, 5, 6, 2.75, 3.25]); const t = int(rand, 2, 8);
  const annual = rand() < 0.6;
  if (annual) return { ask: 'Which expression gives the balance?', prompt: `${money(P)} is invested at ${r}% interest, compounded annually, for ${t} years.`,
    choices: [`${P}(${dec(1 + r / 100)})${sup(t)}`, `${P}(${dec(r / 100)})${sup(t)}`, `${P}(1 + ${dec(r / 100)} · ${t})`, `${P}(${dec(1 + r / 100)}) · ${t}`], answer: 0,
    tell: `A = P(1 + r)${sup('t')} = ${P}(${dec(1 + r / 100)})${sup(t)}.` };
  const n = pick(rand, [[4, 'quarterly'], [12, 'monthly'], [2, 'semiannually']]);
  return { ask: 'Which expression gives the balance?', prompt: `${money(P)} is invested at ${r}% compounded ${n[1]} for ${t} years.`,
    choices: [`${P}(1 + ${dec(r / 100)}/${n[0]})${sup(`${n[0]} · ${t}`)}`, `${P}(1 + ${dec(r / 100)})${sup(`${n[0]} · ${t}`)}`, `${P}(1 + ${dec(r / 100)}/${n[0]})${sup(t)}`, `${P}(1 + ${dec(r / 100)} · ${n[0]})${sup(t)}`], answer: 0,
    tell: `A = P(1 + r/n)${sup('nt')}: divide the rate by ${n[0]} periods a year and multiply the exponent by ${n[0]}.` };
} };

T.twoPoints = { book: 'write', make(rand) {
  const a = int(rand, 2, 6); const b = pick(rand, [2, 3, 4]); const p = int(rand, 0, 2); const q = p + pick(rand, [1, 2]);
  const P = [p, a * b ** p]; const Q = [q, a * b ** q];
  const ans = `y = ${fn(a, b)}`;
  return { ask: 'Write an exponential function', prompt: `whose graph passes through (${P[0]}, ${P[1]}) and (${Q[0]}, ${Q[1]})`,
    choices: [ans, `y = ${fn(b, a)}`, `y = ${fn(a * b, b)}`, `y = ${fn(a, b ** (q - p))}`].filter((s, i, arr) => arr.indexOf(s) === i), answer: 0,
    tell: `substitute both points into y = a · b${sup('x')} and divide: b${sup(q - p)} = ${Q[1]}/${P[1]} = ${b ** (q - p)} → b = ${b}; then a = ${P[1]}/${b}${sup(p)} = ${a}.` };
} };

T.tableRule = { book: 'write', make(rand) {
  const exp = rand() < 0.6; const a = int(rand, 2, 9);
  if (exp) { const b = pick(rand, [2, 3, 4, 5]); const ys = [0, 1, 2, 3].map((x) => a * b ** x);
    return { ask: 'Linear or exponential? Give the rule', prompt: `x: 0, 1, 2, 3 &nbsp; y: ${ys.join(', ')}`,
      choices: [`exponential — y = ${fn(a, b)}`, `linear — y = ${a * (b - 1)}x + ${a}`, `exponential — y = ${fn(b, a)}`, `exponential — y = ${fn(a, b + 1)}`], answer: 0,
      tell: `each step MULTIPLIES by ${b} (${ys[0]} → ${ys[1]} → ${ys[2]}), so it is exponential with factor ${b} and starting value ${a}.` }; }
  const d = nz(rand, -6, 9); const ys = [0, 1, 2, 3].map((x) => a + d * x);
  return { ask: 'Linear or exponential? Give the rule', prompt: `x: 0, 1, 2, 3 &nbsp; y: ${ys.map(num).join(', ')}`,
    choices: [`linear — y = ${d === 1 ? '' : d === -1 ? M : num(d)}x + ${a}`, `exponential — y = ${fn(a, Math.abs(d) + 1)}`, `linear — y = ${a}x + ${num(d)}`, `exponential — y = ${fn(Math.abs(d), a)}`], answer: 0,
    tell: `each step ADDS ${num(d)} (${ys[0]} → ${ys[1]} → ${ys[2]}), so it is linear with slope ${num(d)} and y-intercept ${a}.` };
} };

T.linearVsExp = { book: 'write', make(rand) {
  const Q = [
    { prompt: 'Plan L starts at $400 and adds $90 each year. Plan E starts at $400 and grows 35% each year.', ans: 'L is linear (a constant $90 added); E is exponential (multiplied by 1.35)', wrong: ['Both are linear', 'Both are exponential', 'L is exponential; E is linear'] },
    { prompt: 'A quantity multiplied by the same factor each period, versus one with the same amount added each period.', ans: 'the first is exponential; the second is linear', wrong: ['the first is linear; the second is exponential', 'both are exponential', 'both are linear'] },
    { prompt: 'Which eventually grows larger: y = 400 + 90x or y = 400(1.35)ˣ?', ans: 'the exponential one — repeated multiplication outruns repeated addition', wrong: ['the linear one — $90 a year is more than 35% of $400', 'they stay equal', 'it depends on the starting value'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Linear or exponential?', prompt: q.prompt, choices: [q.ans, ...q.wrong], answer: 0, tell: `${q.ans}.` };
} };

T.isGeometric = { book: 'seq', make(rand) {
  const geo = rand() < 0.5; const a = pick(rand, [2, 3, 4, 5, -3, 16, 64, 81, 96]);
  let terms; let tell; let ans;
  if (geo) { const r = pick(rand, [2, 3, -2, 1 / 2, -1 / 3, 3 / 2]); if (Math.abs(a) < 8 && Math.abs(r) < 1) return T.isGeometric.make(rand);
    terms = [0, 1, 2, 3].map((i) => a * r ** i); if (terms.some((t) => !Number.isInteger(t))) return T.isGeometric.make(rand);
    ans = `yes — common ratio ${r === 1 / 2 ? '1/2' : r === -1 / 3 ? `${M}1/3` : r === 3 / 2 ? '3/2' : num(r)}`; tell = `each term ÷ the one before is the same: ${num(terms[1])}/${num(terms[0])} = ${num(terms[2])}/${num(terms[1])}.`; }
  else { const d = nz(rand, -5, 9); terms = [0, 1, 2, 3].map((i) => a + d * i); if (rand() < 0.4) terms = [4, 9, 25, 36];
    ans = 'no — there is no common ratio'; tell = terms[0] === 4 ? '9/4 ≠ 25/9 — the ratios differ (these are squares, not a geometric sequence).' : `the terms ADD ${num(d)} each time — that is arithmetic, not geometric.`; }
  const wrong = geo ? ['no — there is no common ratio', `yes — common ratio ${num(terms[1] - terms[0])}`, `yes — common ratio ${num(terms[1])}`] : [`yes — common ratio ${num(terms[1] - terms[0])}`, `yes — common ratio ${num(Math.round((terms[1] / terms[0]) * 100) / 100)}`, 'yes — common ratio 1'];
  return { ask: 'Is the sequence geometric?', prompt: `${terms.map(num).join(', ')}, …`, choices: [ans, ...[...new Set(wrong)].filter((w) => w !== ans).slice(0, 3)], answer: 0, tell };
} };

T.nextTerm = { book: 'seq', make(rand) {
  const a = pick(rand, [1, 2, 3, 4, 5, -2, -4]); const r = pick(rand, [2, 3, -2, -3, 4]);
  const terms = [0, 1, 2, 3].map((i) => a * r ** i); const next = a * r ** 4;
  if (Math.abs(next) > 2000) return T.nextTerm.make(rand);
  return { ask: 'Find the next term', prompt: `${terms.map(num).join(', ')}, …`, typed: next, neg: true,
    tell: `the common ratio is ${num(r)} (${num(terms[1])} ÷ ${num(terms[0])}); ${num(terms[3])} · ${num(r)} = ${num(next)}.` };
} };

T.commonRatio = { book: 'seq', make(rand) {
  const a = pick(rand, [1, 2, 3, 5, 7, -3, 96, 512, 729, -432]); const r = pick(rand, [2, 3, 4, -2, -3, 1 / 2, 1 / 3, -1 / 3, 1 / 4]);
  const terms = [0, 1, 2, 3].map((i) => a * r ** i); if (terms.some((t) => !Number.isInteger(t) || Math.abs(t) > 5000)) return T.commonRatio.make(rand);
  const show = (x) => (Number.isInteger(x) ? num(x) : x < 0 ? `${M}1/${Math.round(-1 / x)}` : `1/${Math.round(1 / x)}`);
  const wrong = [terms[1] - terms[0], 1 / r, -r, r + 1].map(show);
  return { ask: 'Find the common ratio', prompt: `${terms.map(num).join(', ')}, …`, choices: [show(r), ...[...new Set(wrong)].filter((w) => w !== show(r)).slice(0, 3)], answer: 0,
    tell: `divide any term by the one before it: ${num(terms[1])} ÷ ${num(terms[0])} = ${show(r)}.` };
} };

T.nthTerm = { book: 'seq', make(rand) {
  const cases = [[512, 1 / 2, 6, 16], [512, 1 / 2, 8, 4], [3, 2, 7, 192], [5, 3, 5, 405], [-8, -3, 5, -648], [2, 4, 5, 512], [96, 1 / 2, 6, 3], [1, 5, 5, 625], [7, 2, 8, 896], [-2, 2, 7, -128]];
  const [a1, r, n, ans] = pick(rand, cases);
  const terms = [0, 1, 2, 3].map((i) => a1 * r ** i);
  return { ask: `Find a<sub>${n}</sub>`, prompt: `${terms.map(num).join(', ')}, …`, typed: ans, neg: ans < 0,
    tell: `a<sub>n</sub> = a<sub>1</sub> · r${sup('n − 1')} = ${num(a1)} · ${Number.isInteger(r) ? num(r) : `(1/${Math.round(1 / r)})`}${sup(n - 1)} = ${num(ans)}.` };
} };

T.explicit = { book: 'seq', make(rand) {
  const a1 = pick(rand, [2, 3, 5, 7, -4]); const r = pick(rand, [2, 3, 4, -2]);
  const terms = [0, 1, 2, 3].map((i) => a1 * r ** i);
  const f = (a, b, e) => `a<sub>n</sub> = ${num(a)} · ${num(b)}${sup(e)}`;
  return { ask: 'Write the explicit formula', prompt: `${terms.map(num).join(', ')}, …`,
    choices: [f(a1, r, 'n − 1'), f(a1, r, 'n'), f(r, a1, 'n − 1'), `a<sub>n</sub> = ${num(a1)} + ${num(r)}(n − 1)`], answer: 0,
    tell: `a<sub>n</sub> = a<sub>1</sub> · r${sup('n − 1')}, with a<sub>1</sub> = ${num(a1)} and r = ${num(r)}. (The exponent is n − 1 so that a<sub>1</sub> = ${num(a1)}.)` };
} };

T.arithOrGeo = { book: 'seq', make(rand) {
  const geo = rand() < 0.5; const a = pick(rand, [2, 3, 4, 5, 8]);
  const r0 = pick(rand, [2, 3]); const d0 = nz(rand, -4, 7);
  const terms = geo ? [0, 1, 2, 3].map((i) => a * r0 ** i) : [0, 1, 2, 3].map((i) => a + d0 * i);
  if (geo) { const r = terms[1] / terms[0]; return { ask: 'Arithmetic or geometric?', prompt: `${terms.map(num).join(', ')}, …`, choices: [`geometric — common ratio ${num(r)}`, `arithmetic — common difference ${num(terms[1] - terms[0])}`, `geometric — common ratio ${num(terms[1] - terms[0])}`, 'neither'], answer: 0,
    tell: `the terms are MULTIPLIED by ${num(r)} each time — a geometric sequence (an exponential function on the whole numbers).` }; }
  const d = terms[1] - terms[0];
  return { ask: 'Arithmetic or geometric?', prompt: `${terms.map(num).join(', ')}, …`, choices: [`arithmetic — common difference ${num(d)}`, `geometric — common ratio ${num(d)}`, `geometric — common ratio ${num(Math.round((terms[1] / terms[0]) * 100) / 100)}`, 'neither'], answer: 0,
    tell: `the terms have ${num(d)} ADDED each time — an arithmetic sequence (a linear function on the whole numbers).` };
} };

T.vocab = { book: 'seq', make(rand) {
  const V = [
    { term: 'exponential function', def: 'a function in which the independent variable is an exponent, y = a · bˣ' },
    { term: 'exponential growth', def: 'a quantity increases in proportion to its current size — the bigger it is, the faster it grows' },
    { term: 'exponential decay', def: 'a quantity decreases in proportion to its current size — the smaller it is, the slower it declines' },
    { term: 'asymptote', def: 'a line that a graph approaches more and more closely but never reaches' },
    { term: 'compound interest', def: 'interest calculated on the principal AND on the interest already earned' },
    { term: 'geometric sequence', def: 'a list of numbers in which each term is the previous term multiplied by a nonzero constant' },
    { term: 'common ratio', def: 'the constant each term of a geometric sequence is multiplied by to get the next' },
    { term: 'explicit formula', def: 'a formula that gives the nth term directly from n, such as aₙ = a₁ · rⁿ⁻¹' },
    { term: 'recursive formula', def: 'a formula that gives each term from the term before it, such as aₙ = r · aₙ₋₁' },
  ];
  const v = pick(rand, V); const others = sample(rand, V.filter((w) => w !== v), 3);
  return rand() < 0.5
    ? { ask: 'Which term?', prompt: v.def, choices: [v.term, ...others.map((w) => w.term)], answer: 0, tell: `that is the definition of ${v.term}.` }
    : { ask: 'Define', prompt: v.term, choices: [v.def, ...others.map((w) => w.def)], answer: 0, tell: `${v.term}: ${v.def}.` };
} };

module.exports = makeBank(BOOKS, T);
