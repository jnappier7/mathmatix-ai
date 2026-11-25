/**
 * Course-level check items, AP Calculus BC — every answer RE-SOLVED from the
 * printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the
 * prompt a student would see and works the answer a second way: series sums
 * by adding two thousand terms, ratio-test limits by evaluating the printed
 * term at a huge n (in logarithms), limits by evaluating the printed
 * expression on both sides of the point, integral properties by solving for
 * an antiderivative's values from the facts given, and the convergence
 * verdicts by rules typed by hand below. A multiple-choice key is found by
 * testing every option: exactly one may pass.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelCalculusBC');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

const N = '(−?\\d+(?:\\.\\d+)?)';
const num = (s) => Number(String(s).replace(/−/g, '-'));
const rx = (src, flags) => new RegExp(src.replace(/#/g, N), flags);
/** "3", "−3/4", "∞" → a number. */
function val(s) {
  const t = String(s).replace(/−/g, '-');
  if (t === '∞') return Infinity;
  const mm = t.match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!mm) throw new Error(`not a number: ${s}`);
  return mm[2] ? Number(mm[1]) / Number(mm[2]) : Number(mm[1]);
}
const close = (a, b, tol = 1e-6) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)));

function only(options, pred) {
  const hits = options.filter((o) => { try { return pred(o); } catch { return false; } });
  if (hits.length !== 1) throw new Error(`expected exactly one option to pass, got ${hits.length}: ${JSON.stringify(options)}`);
  return hits[0];
}

/** Printed maths in x or h → a number. */
function evalExpr(text, vars = {}) {
  let s = String(text).replace(/−/g, '-')
    .replace(/²/g, '**2').replace(/³/g, '**3')
    .replace(/√\(/g, 'Math.sqrt(').replace(/√x/g, 'Math.sqrt(x)')
    .replace(/sin\(/g, 'Math.sin(');
  s = s.replace(/(\d|\))\s*(?=Math|\(|[a-z])/g, '$1*');
  const names = Object.keys(vars);
  const v = Function(...names, `"use strict"; return (${s});`)(...names.map((k) => vars[k]));
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`cannot evaluate ${text}`);
  return v;
}

/** Split at the top level only (outside brackets). */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') depth--;
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; } else cur += s[i];
  }
  out.push(cur);
  return out;
}
const unwrap = (s) => { let t = s.trim(); while (/^\(.*\)$/.test(t) && splitTop(t.slice(1, -1), ')').length === 1) t = t.slice(1, -1).trim(); return t; };
const lnFact = (n) => n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);

/** ln of one printed factor of a series term, at index n. */
function lnFactor(f, n) {
  let mm;
  if (f === '1') return 0;
  if (f === 'n') return Math.log(n);
  if (f === 'n²') return 2 * Math.log(n);
  if (f === 'n³') return 3 * Math.log(n);
  if (f === '√n') return 0.5 * Math.log(n);
  if (f === 'n!') return lnFact(n);
  if ((mm = f.match(/^(\d+)\^n$/))) return n * Math.log(Number(mm[1]));
  if ((mm = f.match(/^\((\d+)\/(\d+)\)\^n$/))) return n * Math.log(Number(mm[1]) / Number(mm[2]));
  throw new Error(`unknown factor: ${f}`);
}
/** ln |aₙ| for a printed term such as "(n² · 5^n)/2^n" or "3^n/n!". */
function lnTerm(term, n) {
  const parts = /^\(\d+\/\d+\)\^n$/.test(term) ? [term] : splitTop(term, '/');
  return parts.reduce((s, part, i) => {
    const prod = /^\(\d+\/\d+\)\^n$/.test(part) ? [part] : splitTop(unwrap(part), ' · ');
    const ln = prod.reduce((t, f) => t + lnFactor(f.trim(), n), 0);
    return i === 0 ? s + ln : s - ln;
  }, 0);
}
/** The ratio-test limit of a printed term: 0, ∞, or a number. */
function ratioLimit(term) {
  const n = 1e7;
  const L = Math.exp(lnTerm(term, n + 1) - lnTerm(term, n));
  if (L > 1e4) return Infinity;
  if (L < 1e-4) return 0;
  return L;
}

/** Add a series whose nth term is a·rⁿ, from n = start, the long way. */
function addGeometric(a, r, start) {
  let s = 0;
  for (let n = start; n < start + 4000; n++) s += a * r ** n;
  return s;
}

// p-series exactly as printed → the exponent p. Typed by hand.
const P_OF = {
  '1/n²': 2, '1/n³': 3, '1/n⁴': 4, '1/n^(3/2)': 3 / 2, '1/n^(4/3)': 4 / 3,
  '1/n': 1, '1/√n': 1 / 2, '1/∛n': 1 / 3, '1/n^(2/3)': 2 / 3, '1/n^(3/4)': 3 / 4,
};
// Terms that are p-series in disguise → p, by the laws of exponents. Typed by hand.
const P_DISGUISED = {
  '1/(n√n)': 1 + 1 / 2,          // n · n^(1/2)
  '√n/n²': 2 - 1 / 2,
  '√n/n': 1 - 1 / 2,
  'n/n³': 3 - 1,
  'n²/n³': 3 - 2,
  '1/(n²√n)': 2 + 1 / 2,
  '∛n/n': 1 - 1 / 3,
};

/** Is this inequality in one letter true at v?  "k > 2", "−3 ≤ x ≤ 9", "x < 9". */
function holds(option, v) {
  const t = option.replace(/−/g, '-');
  let mm;
  const cmp = (a, op, b) => (op === '<' ? a < b : op === '≤' ? a <= b : op === '>' ? a > b : a >= b);
  if ((mm = t.match(/^(-?[\d./]+) ([<≤]) [a-z] ([<≤]) (-?[\d./]+)$/))) return cmp(val(mm[1]), mm[2], v) && cmp(v, mm[3], val(mm[4]));
  if ((mm = t.match(/^[a-z] ([<≤>≥]) (-?[\d./]+)$/))) return cmp(v, mm[1], val(mm[2]));
  throw new Error(`not an inequality: ${option}`);
}
const HALVES = Array.from({ length: 121 }, (_, i) => -15 + i * 0.25);

// ── the re-solvers ─────────────────────────────────────────────────────────

const RESOLVE = {
  'calcbc-series-geometric-p': (item, p, options) => {
    let mm;
    if ((mm = p.match(/^Find the sum of the infinite geometric series (.+) \+ …$/))) {
      const ts = [...mm[1].matchAll(/(?:^|\s)([+−])?\s?(\d+(?:\/\d+)?)/g)].map((t) => (t[1] === '−' ? -1 : 1) * val(t[2]));
      const r = ts[1] / ts[0];
      ts.forEach((t, i) => { if (!close(t, ts[0] * r ** i)) throw new Error('not geometric'); });
      return addGeometric(ts[0], r, 0);
    }
    if ((mm = p.match(/^Each of these series is summed from n = 1 to ∞\. Which one (converges|diverges)\?$/))) {
      return only(options, (o) => {
        const pp = P_OF[o.replace(/^Σ /, '')];
        if (pp === undefined) throw new Error(`unknown p-series ${o}`);
        return (pp > 1) === (mm[1] === 'converges');
      });
    }
    if ((mm = p.match(/^Each of these geometric series is summed from n = 0 to ∞\. Which one (converges|diverges)\?$/))) {
      return only(options, (o) => (Math.abs(val(o.match(/^Σ \((.+)\)\^n$/)[1])) < 1) === (mm[1] === 'converges'));
    }
    if ((mm = p.match(/^Find the sum of the series Σ from n = ([01]) to ∞ of (\d+)\((\d+)\/(\d+)\)\^n\.$/))) {
      return addGeometric(num(mm[2]), num(mm[3]) / num(mm[4]), num(mm[1]));
    }
    if ((mm = p.match(/Σ from n = 1 to ∞ of (.+) can be rewritten as a p-series/))) {
      const pp = P_DISGUISED[mm[1]];
      if (pp === undefined) throw new Error(`unknown term ${mm[1]}`);
      return only(options, (o) => {
        const q = o.match(/^(Converges|Diverges): it is a p-series with p = (\S+)$/);
        return close(val(q[2]), pp) && (q[1] === 'Converges') === (pp > 1);
      });
    }
    if ((mm = p.match(/^Consider the series Σ from n = 0 to ∞ of (\d+)\((\d+)\/(\d+)\)\^n\. Which statement/))) {
      const r = num(mm[2]) / num(mm[3]);
      if (Math.abs(r) >= 1) return only(options, (o) => o === 'It diverges');
      const s = addGeometric(num(mm[1]), r, 0);
      return only(options, (o) => close(val(o.match(/^It converges to (\S+)$/)[1]), s));
    }
    if ((mm = p.match(/repeating decimal 0\.(\d+)… is (\d+)\/(\d+) \+ (\d+)\/(\d+) \+/))) {
      const a = num(mm[2]) / num(mm[3]), r = (num(mm[4]) / num(mm[5])) / a;
      const s = addGeometric(a, r, 0);
      if (Math.abs(s - Number(`0.${mm[1]}`)) > 1e-3) throw new Error('series is not that decimal');
      return s;
    }
    if ((mm = p.match(/first term (\d+) and sum (\d+)\. What is its common ratio/))) {
      const a = num(mm[1]), S = num(mm[2]), r = 1 - a / S;
      if (!close(addGeometric(a, r, 0), S)) throw new Error('ratio does not give that sum');
      return r;
    }
    if ((mm = p.match(/of 1\/n\^\((\d*)k − (\d+)\) converge\?$/))) {
      const j = mm[1] === '' ? 1 : num(mm[1]), c = num(mm[2]);
      return only(options, (o) => HALVES.every((k) => holds(o, k) === (j * k - c > 1)));
    }
    if ((mm = p.match(/geometric series Σ from n = 0 to ∞ of \((.+)\/(\d+)\)\^n converge\?$/))) {
      return only(options, (o) => HALVES.every((x) => holds(o, x) === (Math.abs(evalExpr(mm[1], { x }) / num(mm[2])) < 1)));
    }
    throw new Error(`no rule: ${p}`);
  },

  'calcbc-convergence-tests': (item, p, options) => {
    let mm;
    if ((mm = p.match(/of \((\d*)n \+ (\d+)\)\/\((\d+)n \+ (\d+)\)\. Which statement/))) {
      const lim = (mm[1] === '' ? 1 : num(mm[1])) / num(mm[3]);     // leading coefficients
      if (lim === 0) throw new Error('terms go to 0');
      return only(options, (o) => /^It diverges by the nth-term test/.test(o) && close(val(o.match(/approach (\S+), not 0$/)[1]), lim));
    }
    if ((mm = p.match(/gives a limit of \|aₙ₊₁\/aₙ\| equal to (\S+)\. What does the ratio test conclude/))) {
      const L = val(mm[1]);
      return only(options, (o) => o === (L < 1 ? 'The series converges absolutely' : L > 1 ? 'The series diverges' : 'The test is inconclusive'));
    }
    if ((mm = p.match(/have a limit of (\S+) as n → ∞\. Using only this fact/))) {
      return only(options, (o) => o === (val(mm[1]) === 0 ? 'Nothing: the series may converge or diverge' : 'The series diverges'));
    }
    if ((mm = p.match(/ratio test is applied to the series Σ from n = 1 to ∞ of (.+?)\. What is the limit/))) return ratioLimit(mm[1]);
    if ((mm = p.match(/ratio test is applied to the series Σ from n = 1 to ∞ of (.+?), where L is/))) {
      const L = ratioLimit(mm[1]);
      return only(options, (o) => {
        const q = o.match(/^L = (\S+), so the (?:series (converges|diverges)|test is inconclusive)$/);
        if (!close(val(q[1]), L, 1e-4)) return false;
        return L < 1 ? q[2] === 'converges' : L > 1 ? q[2] === 'diverges' : q[2] === undefined;
      });
    }
    const verdict = (conv, extra = () => true) => only(options, (o) => o.startsWith(conv ? 'It converges' : 'It diverges') && extra(o));
    if ((mm = p.match(/of 1\/\(n(²|³) \+ \d+\)\. Which statement/))) return verdict(true, (o) => o.endsWith(`convergent series Σ 1/n${mm[1]}`));   // below a p-series, p > 1
    if (/of \(n \+ \d+\)\/n²\. Which statement/.test(p)) return verdict(false, (o) => o.endsWith('divergent series Σ 1/n'));                    // above the harmonic series
    if ((mm = p.match(/of 1\/\((\d+)\^n \+ n\)\. Which statement/))) return verdict(true, (o) => o.endsWith(`geometric series Σ (1/${mm[1]})^n`));
    if ((mm = p.match(/of \(\d+n(²?) \+ \d+\)\/\(n(²|³|⁴) \+ \d+\)\. Which statement/))) {
      const deg = { '': 1, '²': 2, '³': 3, '⁴': 4 };
      const pp = deg[mm[2]] - deg[mm[1]];                // behaves like 1/n^pp
      return verdict(pp > 1, (o) => o.endsWith(`limit comparison with Σ 1/n${pp === 1 ? '' : '²'}`) && (pp === 1 || pp === 2));
    }
    if ((mm = p.match(/improper integral ∫ from 1 to ∞ of f\(x\) dx (diverges|converges to \d+)\. What does the integral test/))) {
      return only(options, (o) => o === (mm[1] === 'diverges' ? 'It diverges' : 'It converges, but its sum need not equal the value of the integral'));
    }
    if ((mm = p.match(/alternating series Σ from n = 1 to ∞ of \(−1\)\^n(.+)\. Which statement/))) {
      const rest = mm[1];
      let ans;
      if (/^ · n\/\(\d*n \+ \d+\)$/.test(rest)) ans = 'It diverges';            // sizes approach a non-zero number
      else {
        const pp = P_OF[`1${rest}`];
        if (pp === undefined) throw new Error(`unknown alternating term ${rest}`);
        ans = pp > 1 ? 'It converges absolutely' : 'It converges conditionally';   // 0 < p ≤ 1: AST yes, absolute no
      }
      return only(options, (o) => o === ans);
    }
    if (/For which one is the ratio test inconclusive\?$/.test(p)) return only(options, (o) => close(ratioLimit(o.replace(/^Σ /, '')), 1, 1e-4));
    if ((mm = p.match(/If Σ ([ab])ₙ (converges|diverges), what can be concluded about Σ ([ab])ₙ\?$/))) {
      if (mm[1] === mm[3]) throw new Error('same series');
      // a is the smaller series. Below a convergent one converges; above a divergent one diverges.
      const ans = mm[1] === 'b' && mm[2] === 'converges' ? 'It converges' : mm[1] === 'a' && mm[2] === 'diverges' ? 'It diverges' : 'Nothing: it may converge or diverge';
      return only(options, (o) => o === ans);
    }
    throw new Error(`no rule: ${p}`);
  },

  'calcbc-definite-integral-properties': (item, p, options) => {
    let mm;
    if ((mm = p.match(/satisfies (\d+) ≤ f\(x\) ≤ (\d+) for every x in the interval \[(\d+), (\d+)\]\. Which statement about ∫ from (\d+) to (\d+) of/))) {
      const [lo, hi, a, b] = mm.slice(1, 5).map(num);
      if (num(mm[5]) !== a || num(mm[6]) !== b) throw new Error('bounds');
      const least = lo * (b - a), most = hi * (b - a);
      // "Between X and Y" MUST hold only if it contains every value the integral could take.
      return only(options, (o) => { const q = o.match(/^It is between (\d+) and (\d+)$/); return !!q && num(q[1]) <= least && num(q[2]) >= most; });
    }
    // Everything else: treat each fact as F(b) − F(a) for an unknown antiderivative and solve.
    const facts = { f: [], g: [] };
    for (const k of p.matchAll(rx('∫ from # to # of ([fg])\\(x\\) dx = #', 'g'))) facts[k[3]].push([num(k[1]), num(k[2]), num(k[4])]);
    if ((mm = p.match(/A function f is (even|odd),/))) {
      const [a, b, v] = facts.f[0];
      if (a !== 0) throw new Error('expected a fact from 0');
      facts.f.push([-b, 0, mm[1] === 'even' ? v : -v]);
    }
    const solveFor = (list, u, v) => {
      const F = new Map([[u, 0]]);
      for (let pass = 0; pass < 6; pass++) {
        for (const [a, b, value] of list) {
          if (F.has(a) && !F.has(b)) F.set(b, F.get(a) + value);
          if (F.has(b) && !F.has(a)) F.set(a, F.get(b) - value);
        }
      }
      if (!F.has(v)) throw new Error(`the facts do not reach ${v} from ${u}`);
      return F.get(v);
    };
    const ask = p.match(rx('[Ww]hat is ∫ from # to # of (.+?) dx\\?$'));
    if (!ask) throw new Error(`no question: ${p}`);
    const u = num(ask[1]), v = num(ask[2]);
    const body = ask[3].replace(/^\((.*)\)$/, '$1');
    let total = 0, rest = body;
    const fTerm = rest.match(/^(−?\d*)f\(x\)/);
    if (!fTerm) throw new Error(`no f in ${body}`);
    total += (fTerm[1] === '' ? 1 : fTerm[1] === '−' ? -1 : num(fTerm[1])) * solveFor(facts.f, u, v);
    rest = rest.slice(fTerm[0].length);
    const gTerm = rest.match(/^ ([+−]) (\d*)g\(x\)/);
    if (gTerm) {
      total += (gTerm[1] === '−' ? -1 : 1) * (gTerm[2] === '' ? 1 : num(gTerm[2])) * solveFor(facts.g, u, v);
      rest = rest.slice(gTerm[0].length);
    }
    const cTerm = rest.match(/^ ([+−]) (\d+)$/);
    if (cTerm) { total += (cTerm[1] === '−' ? -1 : 1) * num(cTerm[2]) * (v - u); rest = ''; }
    if (rest !== '') throw new Error(`unread integrand: ${rest}`);
    return total;
  },

  'calcbc-limits-algebraic': (item, p) => {
    const mm = p.match(rx('^Evaluate the limit as ([xh]) approaches # of (.+)\\.$'));
    if (!mm) throw new Error(`no rule: ${p}`);
    const at = num(mm[2]);
    const f = (t) => evalExpr(mm[3], { [mm[1]]: t });
    const d = 1e-5;
    const left = f(at - d), right = f(at + d);
    if (Math.abs(left - right) > 1e-2) throw new Error('the two sides disagree');
    return (left + right) / 2;
  },
};

function typed(value) {
  const mm = String(value).match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!mm) throw new Error(`not a typeable number: ${value}`);
  return mm[2] ? Number(mm[1]) / Number(mm[2]) : Number(mm[1]);
}
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items — AP Calculus BC', () => {
  test('the bank is for the BC course, four skills, twelve items each', () => {
    expect(bank.COURSE_ID).toBe('calculus-bc');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES.map((t) => t.courseSkill)).toEqual(['series-geometric-p', 'convergence-tests', 'definite-integral-properties', 'limits-algebraic']);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`calcbc-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('every course skill named is a skill of the BC pathway', () => {
    const pathway = require('../../public/resources/calculus-bc-pathway.json');
    const skills = new Set(pathway.modules.flatMap((mod) => mod.skills || []));
    for (const t of bank.TEMPLATES) expect([t.courseSkill, skills.has(t.courseSkill)]).toEqual([t.courseSkill, true]);
  });

  test('every template has a re-solver', () => {
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const options = (item.options || []).map((o) => o.text);
    const expected = RESOLVE[item.skillId](item, item.prompt, options);
    if (item.options) {
      expect(typeof expected).toBe('string');
      expect(item.answer.value).toBe(expected);
      expect(item.options.find((o) => o.label === item.correctOption).text).toBe(expected);
    } else {
      expect(typeof expected).toBe('number');
      expect(Math.abs(typed(item.answer.value) - expected)).toBeLessThan(1e-3);
    }
  });

  test('a typed answer is one integer or a fraction in lowest terms', () => {
    for (const it of ALL) {
      if (it.answerType !== 'constructed-response') { expect(it.options).toHaveLength(4); continue; }
      expect(it.answer.value).toMatch(/^-?\d+(\/\d+)?$/);
      const [n, d] = it.answer.value.split('/').map(Number);
      if (d) expect([it.problemId, d > 1 && gcd(n, d) === 1]).toEqual([it.problemId, true]);
    }
  });

  test('no prompt leans on a picture', () => {
    for (const it of ALL) {
      expect(it.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
    }
  });

  test('the key is not parked on one letter', () => {
    for (const [skill, items] of Object.entries(ITEMS)) {
      const letters = new Set(items.filter((i) => i.options).map((i) => i.correctOption));
      if (items.filter((i) => i.options).length >= 4) expect([skill, letters.size >= 2]).toEqual([skill, true]);
    }
  });

  test('the reader evaluates printed terms and expressions correctly', () => {
    expect(ratioLimit('n/7^n')).toBeCloseTo(1 / 7, 4);
    expect(ratioLimit('(n² · 5^n)/2^n')).toBeCloseTo(2.5, 4);
    expect(ratioLimit('3^n/(n · 4^n)')).toBeCloseTo(0.75, 4);
    expect(ratioLimit('3^n/n!')).toBe(0);
    expect(ratioLimit('n!/3^n')).toBe(Infinity);
    expect(ratioLimit('1/√n')).toBeCloseTo(1, 4);
    expect(ratioLimit('(2/5)^n')).toBeCloseTo(0.4, 4);
    expect(evalExpr('(√(x + 49) − 7)/x', { x: 15 })).toBeCloseTo(1 / 15);
    expect(evalExpr('(1/x − 1/5)/(x − 5)', { x: 1 })).toBeCloseTo(-0.2);
    expect(evalExpr('((4 + h)² − 16)/h', { h: 2 })).toBe(10);
    expect(evalExpr('sin(2x)/(6x)', { x: Math.PI / 4 })).toBeCloseTo(1 / (1.5 * Math.PI));
    expect(holds('−3 ≤ x ≤ 9', 9)).toBe(true);
    expect(holds('−3 < x < 9', 9)).toBe(false);
    expect(holds('k > 3/2', 1.75)).toBe(true);
  });
});
