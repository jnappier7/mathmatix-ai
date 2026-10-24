/**
 * Chapter Review: Algebra 1 — Module 2 (Equations, 2.1–2.7), built from Mr. Nappier's guided
 * notes, the paper practices and the Module 2 practice test. Quick-fire: one move per play — write
 * the equation from the words, one-step through variables-on-both-sides, fraction and decimal
 * coefficients, no solution vs. identity, literal equations, the bowling-alley and rectangle
 * stories, consecutive integers, absolute value equations, proportions and the percent proportion,
 * Rex's half-distributed equation, the test's cumulative ACT items.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Module', ch: 'Mod 2', blurb: 'Write it, solve it, special cases, literal equations, absolute value, proportions — mixed.' },
  solve: { name: 'Solving Equations', ch: '2.1–2.4', blurb: 'From the words, two-step, distribute first, variables on both sides, fraction and decimal coefficients.' },
  special: { name: 'Special Cases & Literal', ch: '2.4, 2.7', blurb: 'No solution or identity; solve a formula for one variable.' },
  stories: { name: 'Stories', ch: '2.1–2.3', blurb: 'The bowling alley, consecutive integers, the rectangle\'s perimeter, Rex\'s error.' },
  absval: { name: 'Absolute Value', ch: '2.5', blurb: 'Two answers or none; give-or-take stories.' },
  proportion: { name: 'Proportions & Percent', ch: '2.6', blurb: 'Cross multiply; the sinking city; the percent proportion.' },
  review: { name: 'Cumulative Review', ch: 'ACT style', blurb: 'Evaluate, simplify, a percent.' },
};

const M = '−';
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const term = (a, v) => (a === 1 ? v : a === -1 ? `${M}${v}` : `${num(a)}${v}`);
const lin = (a, b, v = 'x') => (b === 0 ? term(a, v) : `${term(a, v)} ${b < 0 ? M : '+'} ${Math.abs(b)}`);
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const T = {};

// ------------------------------------------------------------------ 2.1–2.4
T.wordsToEquation = { book: 'solve', make(rand) {
  const k = int(rand, 2, 9); const c = int(rand, 2, 20); const n = int(rand, 3, 15); const less = rand() < 0.5; const r = less ? k * n - c : k * n + c; if (r <= 0) return T.wordsToEquation.make(rand);
  const words = less ? `${cap(WORDS[c])} less than ${WORDS[k]} times a number, n, is ${r}.` : `${cap(WORDS[c])} more than ${WORDS[k]} times a number, n, is ${r}.`;
  if (rand() < 0.5) return { ask: 'Which equation represents the statement?', prompt: words, ...mc(rand, `${k}n ${less ? M : '+'} ${c} = ${r}`, [`${c} ${less ? M : '+'} ${k}n = ${r}`, `${k}(n ${less ? M : '+'} ${c}) = ${r}`, `${k}n ${less ? '+' : M} ${c} = ${r}`, `${k} + n ${less ? M : '+'} ${c} = ${r}`]),
    tell: `"${WORDS[k]} times a number" is ${k}n; "${WORDS[c]} ${less ? 'less' : 'more'} than" it is ${k}n ${less ? M : '+'} ${c}.` };
  return { ask: 'Find the number', prompt: words, typed: n, tell: `${k}n ${less ? M : '+'} ${c} = ${r} → ${k}n = ${k * n} → n = ${n}.` };
} };

T.twoStep = { book: 'solve', make(rand) {
  const a = int(rand, 2, 9); const x = nz(rand, -9, 12); const b = nz(rand, -20, 25); const r = a * x + b;
  return { ask: 'Solve', prompt: `${lin(a, b)} = ${num(r)}`, typed: x, neg: x < 0, tell: `${a}x = ${num(r - b)} → x = ${num(x)}.` };
} };

T.distributeFirst = { book: 'solve', make(rand) {
  const k = int(rand, 2, 7); const a = int(rand, 2, 5); const b = int(rand, 1, 9); const c = nz(rand, -9, 9); const x = int(rand, 1, 9); const r = k * (a * x + b) + c;
  return { ask: 'Solve', prompt: `${k}(${lin(a, b)}) ${c < 0 ? M : '+'} ${Math.abs(c)} = ${r}`, typed: x, tell: `${k * a}x + ${k * b} ${c < 0 ? M : '+'} ${Math.abs(c)} = ${r} → ${k * a}x = ${k * a * x} → x = ${x}.` };
} };

T.bothSides = { book: 'solve', make(rand) {
  const k = int(rand, 2, 8); const b = nz(rand, -9, 9); const c = int(rand, 1, k - 1); const x = int(rand, 2, 12); const d = k * (x + b) - c * x; // k(x + b) = cx + d
  if (d === 0) return T.bothSides.make(rand);
  return { ask: 'Solve', prompt: `${k}(x ${b < 0 ? M : '+'} ${Math.abs(b)}) = ${lin(c, d)}`, typed: x, tell: `${k}x ${k * b < 0 ? M : '+'} ${Math.abs(k * b)} = ${lin(c, d)} → ${k - c}x = ${num(d - k * b)} → x = ${x}.` };
} };

T.fractionCoef = { book: 'solve', make(rand) {
  const q = pick(rand, [2, 3, 4, 5, 6]); const p = int(rand, 1, q - 1); const x = q * int(rand, 2, 8); const b = nz(rand, -9, 12); const r = (p * x) / q + b;
  return { ask: 'Solve', prompt: `(${p}/${q})x ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(r)}`, typed: x, tell: `(${p}/${q})x = ${(p * x) / q} → multiply by ${q}/${p}: x = ${x}.` };
} };

T.decimalEq = { book: 'solve', make(rand) {
  const a = pick(rand, [0.2, 0.4, 0.5, 0.6, 0.8, 1.5, 2.5]); const x = int(rand, 2, 12); const b = pick(rand, [-3.6, -2.4, -1.5, 1.2, 2.5, 4.8]); const r = Math.round((a * x + b) * 100) / 100;
  return { ask: 'Solve', prompt: `${a}x ${b < 0 ? M : '+'} ${Math.abs(b)} = ${num(r)}`, typed: x, tell: `${a}x = ${Math.round((r - b) * 100) / 100} → x = ${x}.` };
} };

// ------------------------------------------------------------------ special cases & literal
T.specialCase = { book: 'special', make(rand) {
  const a = int(rand, 2, 9); const b = nz(rand, -9, 9); const kind = pick(rand, ['none', 'identity', 'one']); const k = pick(rand, [2, 3, 5]);
  const [L, R] = kind === 'none' ? [lin(a, b), lin(a, b + nz(rand, -9, 9))] : kind === 'identity' ? [`${k}(${lin(a, b)})`, lin(k * a, k * b)] : [lin(a, b), lin(a + nz(rand, -3, 3) || a + 1, b)];
  const ans = { none: 'no solution', identity: 'identity — true for all x', one: 'exactly one solution' }[kind];
  return { ask: 'How many solutions?', prompt: `${L} = ${R}`, ...mc(rand, ans, ['no solution', 'identity — true for all x', 'exactly one solution']),
    tell: kind === 'none' ? 'the variable terms cancel and leave a FALSE statement — no solution.' : kind === 'identity' ? 'both sides are the same expression — every x works.' : 'the x terms do not cancel, so it solves to one value.' };
} };

T.literal = { book: 'special', make(rand) {
  const Q = [
    { eq: 'P = 2a + b, for a', ans: 'a = (P − b)/2', wrongs: ['a = P − b − 2', 'a = (P + b)/2', 'a = P/2 − b'] },
    { eq: 'V = (1/3)πr²h, for h', ans: 'h = 3V/(πr²)', wrongs: ['h = V/(3πr²)', 'h = 3Vπr²', 'h = V − (1/3)πr²'] },
    { eq: 'A = lw, for w', ans: 'w = A/l', wrongs: ['w = Al', 'w = l/A', 'w = A − l'] },
    { eq: 'P = 2l + 2w, for w', ans: 'w = (P − 2l)/2', wrongs: ['w = P − 2l − 2', 'w = (P + 2l)/2', 'w = P/2 − l/2'] },
    { eq: 'y = mx + b, for x', ans: 'x = (y − b)/m', wrongs: ['x = y − b − m', 'x = (y + b)/m', 'x = y/m − b'] },
    { eq: 'd = rt, for t', ans: 't = d/r', wrongs: ['t = dr', 't = r/d', 't = d − r'] },
    { eq: 'C = 2πr, for r', ans: 'r = C/(2π)', wrongs: ['r = 2πC', 'r = C − 2π', 'r = 2π/C'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Solve the literal equation', prompt: q.eq, ...mc(rand, q.ans, q.wrongs), tell: `undo what is done to the variable, in reverse order: ${q.ans}.` };
} };

// ------------------------------------------------------------------ stories
T.bowling = { book: 'stories', make(rand) {
  const shoe = pick(rand, [3, 4, 4.5, 5]); const per = pick(rand, [4, 4.25, 5, 5.25, 5.5, 6]); const g = int(rand, 2, 8); if (shoe === per) return T.bowling.make(rand); const total = shoe + per * g;
  if (rand() < 0.5) return { ask: 'Which equation finds the number of games g?', prompt: `A bowling alley charges a $${shoe.toFixed(2)} shoe rental plus $${per.toFixed(2)} per game. Talia spends $${total.toFixed(2)} in all.`,
    ...mc(rand, `${per}g + ${shoe} = ${total}`, [`${shoe}g + ${per} = ${total}`, `${per}g ${M} ${shoe} = ${total}`, `(${per} + ${shoe})g = ${total}`]), tell: `per-game cost times games, plus the one-time rental: ${per}g + ${shoe} = ${total}.` };
  return { ask: 'How many games?', prompt: `A bowling alley charges a $${shoe.toFixed(2)} shoe rental plus $${per.toFixed(2)} per game. Talia spends $${total.toFixed(2)} in all.`, typed: g,
    tell: `${per}g + ${shoe} = ${total} → ${per}g = ${(total - shoe).toFixed(2)} → g = ${g}.` };
} };

T.rexEquation = { book: 'stories', make(rand) {
  const k = int(rand, 2, 8); const b = int(rand, 2, 9); const x = int(rand, 2, 12); const r = k * (x + b);
  if (rand() < 0.5) return { ask: `To solve ${k}(x + ${b}) = ${r}, Rex first wrote ${k}x + ${b} = ${r}. What went wrong?`, prompt: 'Error analysis.',
    ...mc(rand, `he distributed the ${k} to the x but NOT to the ${b}`, [`nothing — that is the right first step`, `he should have subtracted ${b} first`, `he should have multiplied the right side by ${k} too`]), tell: `${k}(x + ${b}) = ${k}x + ${k * b}.` };
  return { ask: `Solve it correctly`, prompt: `${k}(x + ${b}) = ${r}`, typed: x, tell: `${k}x + ${k * b} = ${r} → ${k}x = ${k * x} → x = ${x}. (Or divide both sides by ${k} first: x + ${b} = ${r / k}.)` };
} };

T.consecutive = { book: 'stories', make(rand) {
  const n = int(rand, 5, 60); const kind = pick(rand, ['int', 'even', 'odd']); const step = kind === 'int' ? 1 : 2; const first = kind === 'even' ? 2 * Math.ceil(n / 2) : kind === 'odd' ? 2 * Math.floor(n / 2) + 1 : n;
  const sum = 3 * first + 3 * step; const want = pick(rand, ['smallest', 'largest']);
  return { ask: `Find the ${want}`, prompt: `The sum of three consecutive ${kind === 'int' ? 'integers' : kind + ' integers'} is ${sum}.`, typed: want === 'smallest' ? first : first + 2 * step,
    tell: `n + (n + ${step}) + (n + ${2 * step}) = ${sum} → 3n + ${3 * step} = ${sum} → n = ${first}: ${first}, ${first + step}, ${first + 2 * step}.` };
} };

T.rectangle = { book: 'stories', make(rand) {
  const w = int(rand, 3, 15); const k = pick(rand, [2, 3]); const c = int(rand, 1, 9); const l = k * w + c; const P = 2 * (l + w); const want = rand() < 0.5 ? 'width' : 'length';
  return { ask: `Find the ${want}`, prompt: `A rectangle's length is ${c} cm more than ${k === 2 ? 'twice' : 'three times'} its width, and its perimeter is ${P} cm.`, typed: want === 'width' ? w : l,
    tell: `2w + 2(${k}w + ${c}) = ${P} → ${2 + 2 * k}w + ${2 * c} = ${P} → w = ${w} cm, l = ${l} cm.` };
} };

// ------------------------------------------------------------------ 2.5
T.absEq = { book: 'absval', make(rand) {
  const kind = pick(rand, ['simple', 'inner', 'coef', 'none']);
  if (kind === 'none') { const a = int(rand, 2, 5); const b = int(rand, 1, 25); const r = -int(rand, 1, 50); return { ask: 'Solve', prompt: `|${a}x ${M} ${b}| = ${num(r)}`, ...mc(rand, 'no solution — an absolute value is never negative', [`x = ${num(-r)}`, `x = ${num(r)}`, 'x = 0']), tell: 'distance from zero cannot be negative, so nothing works.' }; }
  if (kind === 'simple') { const k = int(rand, 2, 12); return { ask: 'Solve', prompt: `|x| = ${k}`, ...mc(rand, `x = ${k} or x = ${M}${k}`, [`x = ${k}`, `x = ${M}${k}`, `x = ${k}²`]), tell: `two numbers are ${k} from zero: ${k} and ${M}${k}.` }; }
  const a = kind === 'coef' ? int(rand, 2, 4) : 1; const b = nz(rand, -9, 9); const r = int(rand, 1, 12); // |ax + b| = r → ax + b = ±r
  if (Math.abs(b) === r || (kind === 'coef' && ((r - b) % a || (-r - b) % a))) return T.absEq.make(rand);
  const x1 = (r - b) / a; const x2 = (-r - b) / a; const v = pick(rand, ['y', 't', 'm']);
  return { ask: 'Solve', prompt: `|${lin(a, b, v)}| = ${r}`, ...mc(rand, `${v} = ${num(Math.max(x1, x2))} or ${v} = ${num(Math.min(x1, x2))}`, [`${v} = ${num(x1)}`, `${v} = ${num(-x1)} or ${v} = ${num(-x2)}`, `${v} = ${num(r - b)} or ${v} = ${num(r + b)}`]),
    tell: `${lin(a, b, v)} = ${r} or ${lin(a, b, v)} = ${M}${r} → ${v} = ${num(x1)} or ${v} = ${num(x2)}.` };
} };

T.giveOrTake = { book: 'absval', make(rand) {
  const mid = pick(rand, [2000, 1500, 3000, 800]); const tol = pick(rand, [250, 150, 100, 50]); const want = pick(rand, ['eq', 'max', 'min']);
  const prompt = `Luna's phone holds an average of ${mid} songs, give or take ${tol}.`;
  if (want === 'eq') return { ask: 'Which absolute value equation models it?', prompt, ...mc(rand, `|s − ${mid}| = ${tol}`, [`|s − ${tol}| = ${mid}`, `|s + ${mid}| = ${tol}`, `s − ${mid} = ${tol}`]), tell: `the distance from the average ${mid} is ${tol}: |s − ${mid}| = ${tol}.` };
  return { ask: `Find the ${want === 'max' ? 'maximum' : 'minimum'} number of songs`, prompt, typed: want === 'max' ? mid + tol : mid - tol, tell: `|s − ${mid}| = ${tol} → s = ${mid + tol} or s = ${mid - tol}.` };
} };

// ------------------------------------------------------------------ 2.6
T.proportion = { book: 'proportion', make(rand) {
  const a = int(rand, 2, 12); const k = int(rand, 2, 6); const b = int(rand, 2, 12); const x = a * k; const c = b * k; if (a === b) return T.proportion.make(rand);
  const forms = [[`x/${b} = ${x}/${c}`, a], [`${a}/${b} = x/${c}`, x], [`${a}/x = ${x}/${c}`, b], [`${a}/${b} = ${x}/x`, c]];
  const [p, ans] = pick(rand, forms);
  return { ask: 'Solve the proportion', prompt: p, typed: ans, tell: `cross multiply: ${a} · ${c} = ${b} · ${x} = ${a * c} → x = ${ans}.` };
} };

T.sinkingCity = { book: 'proportion', make(rand) {
  const rate = int(rand, 20, 40) * 5; const per = pick(rand, [4, 5, 10]); const years = per * int(rand, 2, 4) + pick(rand, [0, per / 5 * 1]); if ((rate * years) % per) return T.sinkingCity.make(rand);
  return { ask: 'How many centimeters?', prompt: `Parts of Mexico City sink ${rate} cm every ${per} years. At that rate, how far will it sink in ${years} years?`, typed: (rate * years) / per,
    tell: `${rate}/${per} = x/${years} → x = ${rate} · ${years} ÷ ${per} = ${(rate * years) / per} cm.` };
} };

T.punch = { book: 'proportion', make(rand) {
  const a = int(rand, 3, 9); const b = int(rand, 2, a - 1); const k = int(rand, 3, 8); const cran = a * k;
  return { ask: 'How many cups of pineapple juice?', prompt: `Oscar mixes ${a} parts cranberry juice to ${b} parts pineapple juice. He uses ${cran} cups of cranberry juice.`, typed: b * k,
    tell: `${a}/${b} = ${cran}/x → ${a}x = ${b * cran} → x = ${b * k} cups.` };
} };

T.percentProportion = { book: 'proportion', make(rand) {
  const kind = pick(rand, ['part', 'percent', 'whole', 'mix']);
  if (kind === 'mix') { const pct = pick(rand, [20, 25, 30, 40]); const nuts = pick(rand, [12, 14, 15, 18, 21, 24]); const r = (pct * nuts) / (100 - pct); if (!Number.isInteger(r)) return T.percentProportion.make(rand);
    return { ask: 'How many pounds of raisins?', prompt: `A trail mix of raisins and nuts: how many pounds of raisins go with ${nuts} pounds of nuts to make the mix ${pct}% raisins?`, typed: r,
      tell: `r/(r + ${nuts}) = ${pct}/100 → 100r = ${pct}r + ${pct * nuts} → ${100 - pct}r = ${pct * nuts} → r = ${r} lb. The whole is raisins AND nuts.` }; }
  const pct = pick(rand, [10, 20, 25, 30, 40, 50, 60, 75, 80]); const whole = pick(rand, [20, 40, 50, 60, 80, 120, 150, 200]); const part = (pct * whole) / 100; if (!Number.isInteger(part)) return T.percentProportion.make(rand);
  if (kind === 'part') return { ask: 'Find the part', prompt: `What is ${pct}% of ${whole}?`, typed: part, tell: `part/${whole} = ${pct}/100 → part = ${part}.` };
  if (kind === 'percent') return { ask: 'Find the percent', prompt: `${part} is what percent of ${whole}?`, typed: pct, tell: `${part}/${whole} = p/100 → p = ${pct}.` };
  return { ask: 'Find the whole', prompt: `${part} is ${pct}% of what number?`, typed: whole, tell: `${part}/w = ${pct}/100 → w = ${whole}.` };
} };

// ------------------------------------------------------------------ cumulative review
T.evaluateQuad = { book: 'review', make(rand) {
  const a = int(rand, 2, 6); const b = int(rand, 1, 12); const x = int(rand, 2, 5);
  return { ask: `What is the value of ${a}x² ${M} ${b} when x = ${x}?`, prompt: 'Exponent before multiplying.', typed: a * x * x - b, neg: a * x * x - b < 0, tell: `${a}(${x * x}) ${M} ${b} = ${a * x * x} ${M} ${b} = ${a * x * x - b}. Not (${a}·${x})².` };
} };

T.equivalent = { book: 'review', make(rand) {
  const k = int(rand, 2, 8); const a = int(rand, 2, 5); const b = int(rand, 1, 9); const c = int(rand, 1, 9); const A = k * a + c; const B = -k * b;
  return { ask: 'Which expression is equivalent?', prompt: `${k}(${a}x ${M} ${b}) + ${c}x`, ...mc(rand, lin(A, B), [lin(A, -b), lin(k * a, B), lin(A, -B), lin(k * a + c + k, B)]),
    tell: `${k * a}x ${M} ${k * b} + ${c}x = ${lin(A, B)}.` };
} };

T.vocab = { book: 'all', make(rand) {
  const V = [
    ['an equation that is true for every value of the variable', 'identity'], ['an equation with no value that makes it true', 'no solution'], ['an equation with two or more variables, solved for one of them', 'literal equation'],
    ['an equation stating that two ratios are equal', 'proportion'], ['the distance a number is from zero', 'absolute value'], ['a ratio comparing a number to 100', 'percent'],
    ['the process of applying the same operation to both sides', 'properties of equality'], ['integers that follow in order, each 1 more than the last', 'consecutive integers'],
  ];
  const [d, w] = pick(rand, V);
  return { ask: 'Name it', prompt: d, ...mc(rand, w, V.map((v) => v[1])), tell: `${w}.` };
} };

module.exports = makeBank(BOOKS, T);
