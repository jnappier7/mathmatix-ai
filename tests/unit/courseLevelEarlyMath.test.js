/**
 * Early Math Foundations at-level items — every answer RE-SOLVED from the
 * printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the prompt
 * (and, for multiple choice, the printed options) the way a student does, works
 * the answer out with rules typed by hand below, and compares it to the key. A
 * multiple-choice item must also have EXACTLY one option that is right.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelEarlyMath');

// ── reading what is printed ──────────────────────────────────────────────

const num = (s) => {
  const t = String(s).replace(/,/g, '').trim();
  if (!/^\d+$/.test(t)) throw new Error(`not a whole number: ${s}`);
  return Number(t);
};
const numbersIn = (s) => (s.match(/\d[\d,]*/g) || []).map((x) => num(x.replace(/,$/, '')));

const SMALL = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
function wordsUnder1000(text) {
  let total = 0;
  for (const w of text.trim().split(/[\s-]+/).filter(Boolean)) {
    if (w === 'hundred') total *= 100;
    else if (SMALL[w] !== undefined) total += SMALL[w];
    else throw new Error(`unknown number word: ${w}`);
  }
  return total;
}
function wordsToNumber(text) {
  const parts = text.split(/ thousand,? ?/);
  if (parts.length === 1) return wordsUnder1000(parts[0]);
  return wordsUnder1000(parts[0]) * 1000 + (parts[1] ? wordsUnder1000(parts[1]) : 0);
}
/** A numeral, an expanded form (a + b + c) or a number name. */
function valueOf(rep) {
  const s = rep.trim();
  if (/^[\d,]+$/.test(s)) return num(s);
  if (s.includes('+')) return s.split('+').reduce((sum, p) => sum + num(p), 0);
  return wordsToNumber(s);
}

/** + − × ÷ and parentheses, usual order of operations. Division must be exact. */
function evaluate(text) {
  const tokens = text.match(/\d+|[+−×÷()]/g);
  let i = 0;
  const atom = () => {
    const t = tokens[i++];
    if (t === '(') { const v = sum(); i++; return v; }
    return Number(t);
  };
  const product = () => {
    let v = atom();
    while (tokens[i] === '×' || tokens[i] === '÷') {
      const op = tokens[i++];
      const w = atom();
      if (op === '×') v *= w;
      else v = (w !== 0 && v % w === 0) ? v / w : NaN;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (tokens[i] === '+' || tokens[i] === '−') {
      const op = tokens[i++];
      const w = product();
      v = op === '+' ? v + w : v - w;
    }
    return v;
  };
  return sum();
}
const holds = (equation) => {
  const [l, r] = equation.split('=');
  const a = evaluate(l);
  const b = evaluate(r);
  return Number.isFinite(a) && a === b;
};
/** The one whole number that makes every equation with a blank true. */
function fillBlank(text) {
  const equations = text.split(' and ');
  const fits = [];
  for (let k = 0; k <= 1000; k++) {
    if (equations.every((e) => holds(e.replace(/___/g, String(k))))) fits.push(k);
  }
  if (fits.length !== 1) throw new Error(`blank has ${fits.length} solutions: ${text}`);
  return fits[0];
}

/** Column subtraction with regrouping, on digit strings. Returns [difference, regroupings]. */
function columnSubtract(a, b) {
  const x = String(a).split('').map(Number).reverse();
  const y = String(b).split('').map(Number).reverse();
  const out = [];
  let borrow = 0;
  let regroups = 0;
  for (let i = 0; i < x.length; i++) {
    let top = x[i] - borrow;
    const bottom = y[i] || 0;
    if (top < bottom) { top += 10; borrow = 1; regroups += 1; } else borrow = 0;
    out.push(top - bottom);
  }
  if (borrow) throw new Error(`${a} − ${b} is negative`);
  return [Number(out.reverse().join('')), regroups];
}
function columnAdd(a, b) {
  const x = String(a).split('').map(Number).reverse();
  const y = String(b).split('').map(Number).reverse();
  const out = [];
  let carry = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const s = (x[i] || 0) + (y[i] || 0) + carry;
    out.push(s % 10);
    carry = s >= 10 ? 1 : 0;
  }
  if (carry) out.push(1);
  return Number(out.reverse().join(''));
}
const repeatedAdd = (a, times) => { let t = 0; for (let i = 0; i < times; i++) t += a; return t; };
const exactQuotient = (n, d) => {
  let q = 0;
  let left = n;
  while (left >= d) { left -= d; q += 1; }
  if (left !== 0) throw new Error(`${n} ÷ ${d} leaves a remainder`);
  return q;
};

const texts = (item) => item.options.map((o) => o.text);
/** The single option the rule accepts; anything else is a broken item. */
function only(item, rule) {
  const hits = texts(item).filter(rule);
  if (hits.length !== 1) throw new Error(`${hits.length} options are right: ${item.prompt} — ${texts(item).join(' | ')}`);
  return hits[0];
}
const extreme = (values, which) => (which === 'greatest' ? Math.max(...values) : Math.min(...values));
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function comparisonTrue(text, read) {
  const m = text.match(/^(.+) ([<>]) (.+)$/);
  if (!m) throw new Error(`not a comparison: ${text}`);
  const l = read(m[1]);
  const r = read(m[3]);
  return m[2] === '<' ? l < r : l > r;
}

// Fractions compare by cross-multiplying whole numbers; decimals as whole thousandths.
const fr = (s) => {
  const m = s.trim().match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`not a fraction: ${s}`);
  return [Number(m[1]), Number(m[2])];
};
const frCmp = (a, b) => a[0] * b[1] - b[0] * a[1];
const thousandths = (s) => {
  const m = s.trim().match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`not a decimal: ${s}`);
  return Number(m[1]) * 1000 + Number((m[2] || '').padEnd(3, '0'));
};

// Typed by hand: what each printed shape of equation is called.
function propertyOf(eq) {
  let m;
  if ((m = eq.match(/^(\d+) × 1 = (\d+)$/)) && m[1] === m[2]) return 'Identity property';
  if (/^\d+ × 0 = 0$/.test(eq)) return 'Zero property';
  if ((m = eq.match(/^(\d+) × (\d+) = (\d+) × (\d+)$/)) && m[1] === m[4] && m[2] === m[3] && m[1] !== m[2]) return 'Commutative property';
  if ((m = eq.match(/^\((\d+) × (\d+)\) × (\d+) = (\d+) × \((\d+) × (\d+)\)$/)) && m[1] === m[4] && m[2] === m[5] && m[3] === m[6]) return 'Associative property';
  if ((m = eq.match(/^(\d+) × \((\d+) \+ (\d+)\) = (\d+) × (\d+) \+ (\d+) × (\d+)$/))
    && m[1] === m[4] && m[1] === m[6] && m[2] === m[5] && m[3] === m[7]) return 'Distributive property';
  throw new Error(`unrecognised equation: ${eq}`);
}

// ── one re-solver per course skill ───────────────────────────────────────

const RESOLVE = {
  'emf-compare-order': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/Who wrote the (greatest|least) number\?$/))) {
      const said = [...p.matchAll(/(Ava|Ben|Cal|Dee): (.+?)\.(?= )/g)].map((x) => [x[1], valueOf(x[2])]);
      expect(said).toHaveLength(4);
      expect(new Set(said.map((s) => s[1])).size).toBe(4);
      const want = extreme(said.map((s) => s[1]), m[1]);
      expect(texts(item)).toEqual(['Ava', 'Ben', 'Cal', 'Dee']);
      return said.find((s) => s[1] === want)[0];
    }
    if ((m = p.match(/^Which of these numbers is the (greatest|least)\? (.+)$/))) {
      const list = m[2].split('; ');
      expect(texts(item)).toEqual(list);
      const want = extreme(list.map(num), m[1]);
      return only(item, (o) => num(o) === want);
    }
    if ((m = p.match(/^Which list shows these numbers in order from (least to greatest|greatest to least)\? (.+)$/))) {
      const sorted = m[2].split('; ').map(num).sort((a, b) => (m[1].startsWith('least') ? a - b : b - a));
      expect(new Set(sorted).size).toBe(4);
      return only(item, (o) => sameList(o.split('; ').map(num), sorted));
    }
    if ((m = p.match(/^Here are four numbers\. (.+)\. Which list puts them in order from least to greatest\?$/))) {
      const defs = m[1].split('; ').map((d) => { const x = d.match(/^([PQRS]) = (.+)$/); return [x[1], valueOf(x[2])]; });
      expect(defs).toHaveLength(4);
      expect(new Set(defs.map((d) => d[1])).size).toBe(4);
      const want = defs.slice().sort((a, b) => a[1] - b[1]).map((d) => d[0]).join(', ');
      return only(item, (o) => o === want);
    }
    if (/comparisons? (is|are) true/.test(p)) return only(item, (o) => comparisonTrue(o, valueOf));
    throw new Error(`no rule for: ${p}`);
  },

  'emf-multi-digit-subtraction': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/___ − ([\d,]+) = ([\d,]+)$/))) {
      const start = columnAdd(num(m[1]), num(m[2]));
      expect(columnSubtract(start, num(m[1]))[1]).toBeGreaterThanOrEqual(2);
      return String(start);
    }
    if ((m = p.match(/([\d,]+) − ___ = ([\d,]+)$/))) return String(columnSubtract(num(m[1]), num(m[2]))[0]);
    const ns = numbersIn(p);
    expect(ns).toHaveLength(2);
    expect(ns[0]).toBeGreaterThan(ns[1]);
    const [diff, regroups] = columnSubtract(ns[0], ns[1]);
    expect(regroups).toBeGreaterThanOrEqual(2);          // the skill is regrouping
    return String(diff);
  },

  'emf-multiplication-properties': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/^Which property of multiplication does this equation show\? (.+)$/))) {
      expect(holds(m[1])).toBe(true);
      const name = propertyOf(m[1]);
      return only(item, (o) => o === name);
    }
    if ((m = p.match(/^What number makes this equation true\? (.+)$/))) return String(fillBlank(m[1]));
    if ((m = p.match(/^Which expression is equal to (\d+) × (\d+)\?$/))) {
      const want = repeatedAdd(Number(m[1]), Number(m[2]));
      return only(item, (o) => evaluate(o) === want);
    }
    if (/^Which equation is NOT true\?$/.test(p)) return only(item, (o) => !holds(o));
    if ((m = p.match(/^Use the distributive property: (.+)\. What is (\d+) × (\d+)\?$/))) {
      expect(holds(m[1])).toBe(true);
      return String(repeatedAdd(Number(m[2]), Number(m[3])));
    }
    throw new Error(`no rule for: ${p}`);
  },

  'emf-multiply-word-problems': (item) => {
    const p = item.prompt;
    const n = numbersIn(p);
    if (/have left\?$/.test(p)) { expect(n).toHaveLength(3); return String(repeatedAdd(n[1], n[0]) - n[2]); }
    if (/He also buys/.test(p)) { expect(n).toHaveLength(4); return String(repeatedAdd(n[1], n[0]) + repeatedAdd(n[3], n[2])); }
    if (/in change\?$/.test(p)) {
      expect(n).toHaveLength(3);
      const cost = repeatedAdd(n[1], n[0]);
      expect(n[2]).toBeGreaterThan(cost);
      return String(n[2] - cost);
    }
    if (/altogether\?$/.test(p)) { expect(n).toHaveLength(2); return String(n[0] + repeatedAdd(n[0], n[1])); }
    expect(n).toHaveLength(2);
    expect(p).toMatch(/in all|in each row|times as (many|much)|tickets cost|Each (classroom|row) has|are in \d+ boxes/);
    return String(repeatedAdd(n[0], n[1]));
  },

  'emf-division-facts': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/^What is (\d+) ÷ (\d+)\?$/))) return String(exactQuotient(Number(m[1]), Number(m[2])));
    if ((m = p.match(/^What number (?:goes in the blank|makes this equation true)\? (.+)$/))) return String(fillBlank(m[1]));
    if ((m = p.match(/^The same number goes in both blanks\. What is it\? (.+)$/))) return String(fillBlank(m[1]));
    if ((m = p.match(/^Use the fact (\d+) × (\d+) = (\d+) to find (\d+) ÷ (\d+)\.$/))) {
      expect(repeatedAdd(Number(m[1]), Number(m[2]))).toBe(Number(m[3]));
      expect(m[4]).toBe(m[3]);
      expect([m[1], m[2]]).toContain(m[5]);
      return String(exactQuotient(Number(m[4]), Number(m[5])));
    }
    if ((m = p.match(/^A number divided by (\d+) equals (\d+)\. What is the number\?$/))) return String(repeatedAdd(Number(m[1]), Number(m[2])));
    if ((m = p.match(/^Divide from left to right: (\d+) ÷ (\d+) ÷ (\d+)$/))) {
      return String(exactQuotient(exactQuotient(Number(m[1]), Number(m[2])), Number(m[3])));
    }
    throw new Error(`no rule for: ${p}`);
  },

  'emf-divide-word-problems': (item) => {
    const p = item.prompt;
    const n = numbersIn(p);
    if (/red beads/.test(p)) { expect(n).toHaveLength(3); return String(exactQuotient(n[0] + n[1], n[2])); }
    if (/boxes are left\?$/.test(p)) {
      expect(n).toHaveLength(3);
      const boxes = exactQuotient(n[0], n[1]);
      expect(boxes).toBeGreaterThan(n[2]);
      return String(boxes - n[2]);
    }
    if (/pizzas/.test(p)) { expect(n).toHaveLength(3); return String(exactQuotient(repeatedAdd(n[2], n[1]), n[0])); }
    expect(n).toHaveLength(2);
    expect(p).toMatch(/shared equally|in rows of|costs the same amount|in each box|same number|packs of|Each plant cost|hold \d+ eggs each/);
    return String(exactQuotient(Math.max(...n), Math.min(...n)));
  },

  'emf-compare-order-fractions': (item) => {
    const p = item.prompt;
    let m;
    if (/^Which fraction is greater than 1\/2\?$/.test(p)) return only(item, (o) => frCmp(fr(o), [1, 2]) > 0);
    if ((m = p.match(/^Which fraction is between (\S+) and (\S+)\?$/))) {
      expect(frCmp(fr(m[1]), fr(m[2]))).toBeLessThan(0);
      return only(item, (o) => frCmp(fr(o), fr(m[1])) > 0 && frCmp(fr(o), fr(m[2])) < 0);
    }
    if ((m = p.match(/^Which fraction is the greatest\? (.+)$/))) {
      const list = m[1].split(', ');
      expect(texts(item)).toEqual(list);
      return only(item, (o) => list.every((x) => x === o || frCmp(fr(o), fr(x)) > 0));
    }
    if ((m = p.match(/^Which list shows these fractions in order from least to greatest\? (.+)$/))) {
      const sorted = m[1].split(', ').sort((a, b) => frCmp(fr(a), fr(b)));
      for (let i = 1; i < sorted.length; i++) expect(frCmp(fr(sorted[i - 1]), fr(sorted[i]))).toBeLessThan(0);
      return only(item, (o) => o === sorted.join(', '));
    }
    if (/comparisons? (is|are) true/.test(p)) {
      for (const o of texts(item)) { const x = o.split(/ [<>] /); expect(frCmp(fr(x[0]), fr(x[1]))).not.toBe(0); }
      return only(item, (o) => comparisonTrue(o, (s) => { const f = fr(s); return f[0] / f[1]; }));
    }
    throw new Error(`no rule for: ${p}`);
  },

  'emf-compare-order-decimals': (item) => {
    const p = item.prompt;
    let m;
    if ((m = p.match(/^Which decimal is between (\S+) and (\S+)\?$/))) {
      expect(thousandths(m[1])).toBeLessThan(thousandths(m[2]));
      return only(item, (o) => thousandths(o) > thousandths(m[1]) && thousandths(o) < thousandths(m[2]));
    }
    if ((m = p.match(/^Which of these decimals is the (greatest|least)\? (.+)$/))) {
      const list = m[2].split(', ');
      expect(texts(item)).toEqual(list);
      expect(new Set(list.map(thousandths)).size).toBe(4);
      const want = extreme(list.map(thousandths), m[1]);
      return only(item, (o) => thousandths(o) === want);
    }
    if ((m = p.match(/^Which list shows these decimals in order from (least to greatest|greatest to least)\? (.+)$/))) {
      const sorted = m[2].split(', ').map(thousandths).sort((a, b) => (m[1].startsWith('least') ? a - b : b - a));
      expect(new Set(sorted).size).toBe(4);
      return only(item, (o) => sameList(o.split(', ').map(thousandths), sorted));
    }
    if (/comparisons? (is|are) true/.test(p)) return only(item, (o) => comparisonTrue(o, thousandths));
    throw new Error(`no rule for: ${p}`);
  },
};

// ── the suite ────────────────────────────────────────────────────────────

const byTemplate = bank.TEMPLATES.map((t) => [t.courseSkill, t, expand(t, bank.GB)]);
const allItems = byTemplate.flatMap((x) => x[2]);

describe('Early Math Foundations at-level items', () => {
  test('the bank is for the course, with the eight skills asked for', () => {
    expect(bank.COURSE_ID).toBe('early-math-foundations');
    expect(bank.GB).toBe('3-5');
    expect(bank.TEMPLATES.map((t) => t.courseSkill)).toEqual([
      'emf-compare-order', 'emf-multi-digit-subtraction', 'emf-multiplication-properties',
      'emf-multiply-word-problems', 'emf-division-facts', 'emf-divide-word-problems',
      'emf-compare-order-fractions', 'emf-compare-order-decimals',
    ]);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(t.courseSkill);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
    }
  });

  test('every template has a re-solver', () => {
    const missing = bank.TEMPLATES.map((t) => t.courseSkill).filter((id) => typeof RESOLVE[id] !== 'function');
    expect(missing).toEqual([]);
  });

  test('twelve items a skill, four at each tier, and the builder accepts them all', () => {
    for (const [, , items] of byTemplate) {
      expect(items).toHaveLength(12);
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    }
    expect(validate(allItems)).toEqual([]);
  });

  test.each(byTemplate)('%s: every key is the answer the printed question has', (id, template, items) => {
    for (const item of items) {
      const expected = RESOLVE[id](item);
      expect(`${item.prompt} → ${item.answer.value}`).toBe(`${item.prompt} → ${expected}`);
      if (item.options) {
        const keyed = item.options.find((o) => o.label === item.correctOption);
        expect(keyed.text).toBe(expected);
      } else {
        expect(item.answer.value).toMatch(/^\d+$/);          // whole numbers only, at this age
      }
    }
  });

  test('the comparing skills are multiple choice and the computing skills are typed', () => {
    const choice = ['emf-compare-order', 'emf-compare-order-fractions', 'emf-compare-order-decimals'];
    const typed = ['emf-multi-digit-subtraction', 'emf-multiply-word-problems', 'emf-division-facts', 'emf-divide-word-problems'];
    for (const [id, , items] of byTemplate) {
      if (choice.includes(id)) expect(items.every((i) => i.options && i.options.length === 4)).toBe(true);
      if (typed.includes(id)) expect(items.every((i) => !i.options)).toBe(true);
    }
  });

  test('the right choice is not always in the same place', () => {
    for (const [, , items] of byTemplate) {
      const letters = items.filter((i) => i.options).map((i) => i.correctOption);
      if (letters.length >= 4) expect(new Set(letters).size).toBeGreaterThanOrEqual(2);
    }
  });

  test('the re-solvers themselves: the readers used above', () => {
    expect(valueOf('thirty-four thousand, sixty-five')).toBe(34065);
    expect(valueOf('five hundred thirty-seven thousand, six hundred one')).toBe(537601);
    expect(valueOf('eighty thousand')).toBe(80000);
    expect(valueOf('30,000 + 4,000 + 500 + 6')).toBe(34506);
    expect(evaluate('6 × 100 − 6 × 1')).toBe(594);
    expect(evaluate('(3 × 5) × 4')).toBe(60);
    expect(fillBlank('48 ÷ ___ = 6')).toBe(8);
    expect(columnSubtract(4003, 1587)).toEqual([2416, 3]);
    expect(thousandths('0.35')).toBeGreaterThan(thousandths('0.305'));
    expect(frCmp(fr('2/3'), fr('4/6'))).toBe(0);
  });
});
