/**
 * Course-level check items, "an equation from a situation" (6th and 7th grade)
 * — every answer RE-SOLVED from the printed question.
 *
 * Nothing here calls the templates' own maths. Each story is read out of the
 * prompt a student would see and solved by a rule typed by hand below. A typed
 * item's answer must be that number. A "Which equation models this situation?"
 * item is checked by SUBSTITUTION: the story's own solution must make the keyed
 * equation true and every other choice false — so a wrong key fails, and so do
 * two choices that are the same equation written two ways.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelWordEquations');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

/** A printed number: "−24", "2.50", "68". */
const num = (s) => Number(String(s).replace(/−/g, '-'));
const N = '(−?\\d+(?:\\.\\d+)?)';
const re = (src) => new RegExp(src.replace(/#/g, N));

/**
 * Each story, and the value of its unknown. Order matters only where two
 * stories share words; the patterns are specific enough that one matches.
 */
const STORIES = [
  // ── 6th grade ──
  // rate × hours = total
  [re('earns \\$# per hour .* wants to earn \\$# in all'), (rate, total) => total / rate],
  // start − spent = left
  [re('After spending \\$# at .* has \\$# left'), (spent, left) => spent + left],
  [re('giving away # of them, \\w+ has # left'), (gave, left) => gave + left],
  // box ÷ groups = each
  [re('equally among # .* gets # and none are left over'), (groups, each) => groups * each],
  // price × n = total
  [re('cost \\$# each\\. \\w+ spent \\$# on'), (price, total) => total / price],
  // big + small = together
  [re('cost \\$# together\\. The [\\w -]+ costs \\$#\\.'), (together, small) => together - small],
  // (a/b) × whole = part
  [re('#/# of .*?(?:which is|holds|the club has) \\$?#'), (a, b, part) => (part * b) / a],
  // fee + rate × x = total
  [re('\\$# [^$]* plus \\$# (?:per|for each) .* paid \\$#'), (fee, rate, total) => (total - fee) / rate],
  // one + k × each = total
  [re('scored # points\\. One player scored # of them, .* by # other players'), (total, one, k) => (total - one) / k],
  // s + (s + d) = sum
  [re('is # years older than .* sum of their two ages is #'), (d, sum) => (sum - d) / 2],

  // ── 7th grade ──
  // start − fall × h = end
  [re('was #°C\\. It then fell #°C every hour until it reached #°C'), (start, fall, end) => (start - end) / fall],
  [re('inside is #°C\\. The temperature then drops #°C each hour\\. .* inside #°C'), (start, drop, end) => (start - end) / drop],
  // k(t + fee) = total
  [re('bought # concert tickets .* \\$# service fee .* paid \\$# in all'), (k, fee, total) => total / k - fee],
  [re('Each of # .* plus \\$# .* pay \\$#\\.'), (k, extra, total) => total / k - extra],
  // k(p − off) = total
  [re('bought # [\\w ]+ that all had the same regular price\\. A coupon took \\$# off .* paid \\$# in all'), (k, off, total) => total / k + off],
  // k(e − penalty) = total
  [re('each of the # rounds .* lost # points as a penalty\\. .* total score was # points'), (k, pen, total) => total / k + pen],
  // (1/b) s + extra = total
  [re('spent 1/# of a savings account .* then \\$# more .* spending \\$# in all'), (b, extra, total) => (total - extra) * b],
  // rectangle, length = width + more: 2w + 2(w + more) = P
  [re('perimeter of a rectangle is # \\w+\\. The length is # \\w+ more than the width'), (P, more) => (P - 2 * more) / 4],
];

/** The value of the unknown in a story, worked from the printed numbers. */
function solveStory(prompt) {
  // length = m·width − less: 2w + 2(mw − less) = P
  let m = prompt.match(re('length of a rectangle is # \\w+ less than (twice|three times) its width\\. The perimeter of the rectangle is #'));
  if (m) {
    const times = m[2] === 'twice' ? 2 : 3;
    return (num(m[3]) + 2 * num(m[1])) / (2 + 2 * times);
  }
  // three in a row: n + (n + step) + (n + 2·step) = S
  m = prompt.match(re('sum of three consecutive( even| odd)? integers is #'));
  if (m) {
    const step = m[1] ? 2 : 1;
    const smallest = (num(m[2]) - 3 * step) / 3;
    if (!Number.isInteger(smallest)) throw new Error(`no such integers: ${prompt}`);
    if (m[1] === ' even' && smallest % 2 !== 0) throw new Error(`not even: ${prompt}`);
    if (m[1] === ' odd' && Math.abs(smallest % 2) !== 1) throw new Error(`not odd: ${prompt}`);
    return /What is the greatest/.test(prompt) ? smallest + 2 * step : smallest;
  }
  for (const [pattern, rule] of STORIES) {
    const hit = prompt.match(pattern);
    if (hit) return rule(...hit.slice(1).map(num));
  }
  throw new Error(`no re-solver rule matches: ${prompt}`);
}

/** Is a printed equation true when its letter has this value? */
function holds(equation, letter, x) {
  const js = equation
    .replace(/−/g, '-')
    .replace(/÷/g, '/')
    .replace(/(\d|\))(?=[a-z(])/g, '$1*')     // 3g, 3(g + 4), (3/4)d, (3/4)(24)
    .replace(/([a-z])(?=\()/g, '$1*');        // w(2w − 3)
  const sides = js.split('=');
  if (sides.length !== 2) throw new Error(`not one equation: ${equation}`);
  if (!/^[\d\s.+\-*/()a-z]+$/.test(js.replace('=', ''))) throw new Error(`cannot read: ${equation}`);
  const [left, right] = sides.map((s) => Function(letter, `return (${s});`)(x));
  return Math.abs(left - right) < 1e-9;
}

function resolve(it) {
  const x = solveStory(it.prompt);
  if (!it.options) return { x, answer: String(Number(x.toFixed(4))) };
  const letter = it.prompt.match(/Let ([a-z]) be /)[1];
  const good = it.options.filter((o) => holds(o.text, letter, x));
  return { x, letter, good };
}

// ── the tests ──────────────────────────────────────────────────────────────

describe('word-equation check items: every answer re-solved from the prompt', () => {
  test('every template has a re-solver, and twelve items', () => {
    expect(Object.keys(ITEMS).sort()).toEqual(['g6-word-problem-equations-check', 'g7-equation-word-problems-check']);
    for (const t of bank.TEMPLATES) {
      expect(ITEMS[t.skillId]).toHaveLength(12);
      for (const it of ITEMS[t.skillId]) expect(() => solveStory(it.prompt)).not.toThrow();
    }
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test('each template names its own course (the file serves two)', () => {
    expect(bank.COURSE_ID).toBeNull();
    expect(bank.TEMPLATES.map((t) => [t.courseId, t.courseSkill, t.skillId])).toEqual([
      ['6th-grade-math', 'g6-word-problem-equations', 'g6-word-problem-equations-check'],
      ['7th-grade-math', 'g7-equation-word-problems', 'g7-equation-word-problems-check'],
    ]);
  });

  describe.each(Object.keys(ITEMS))('%s', (skillId) => {
    test.each(ITEMS[skillId].map((it) => [it.problemId, it]))('%s', (_id, it) => {
      const solved = resolve(it);
      expect(Number.isFinite(solved.x)).toBe(true);
      if (!it.options) {
        expect([it.prompt, Number(it.answer.value)]).toEqual([it.prompt, Number(solved.answer)]);
        return;
      }
      // Exactly one choice is true of the story, and it is the keyed one.
      expect([it.prompt, solved.good.map((o) => o.text)]).toEqual([it.prompt, [it.answer.value]]);
      expect(solved.good[0].label).toBe(it.correctOption);
      // Every choice is an equation in the letter the prompt defines.
      for (const o of it.options) expect(o.text).toMatch(new RegExp(`(^|[^a-z])${solved.letter}([^a-z]|$)`));
    });
  });

  test('the evaluator itself reads equations the way they are printed', () => {
    expect(holds('3g + 4 = 19', 'g', 5)).toBe(true);
    expect(holds('3(g + 4) = 19', 'g', 5)).toBe(false);
    expect(holds('(3/4)d = 24', 'd', 32)).toBe(true);
    expect(holds('d = (3/4)(24)', 'd', 18)).toBe(true);
    expect(holds('h ÷ 11 = 66', 'h', 726)).toBe(true);
    expect(holds('8 − 4h = −24', 'h', 8)).toBe(true);
    expect(holds('w(2w − 3) = 54', 'w', 6)).toBe(true);
    expect(holds('n + (n + 2) + (n + 4) = −117', 'n', -41)).toBe(true);
    expect(holds('4(p − 2.50) = 82', 'p', 23)).toBe(true);
  });

  test('each tier mixes "which equation" with "set it up and solve"', () => {
    for (const items of Object.values(ITEMS)) {
      for (const d of [2, 3, 4]) {
        const tier = items.filter((i) => i.difficulty === d);
        expect(tier.filter((i) => i.options)).toHaveLength(2);
        expect(tier.filter((i) => !i.options)).toHaveLength(2);
      }
    }
  });

  test('a typed answer is one number; an equation is always multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') {
        expect(it.answer.value).toMatch(/^-?\d+(\.\d{1,2})?$/);
        expect(it.prompt).not.toMatch(/Which equation/);
      } else {
        expect(it.options).toHaveLength(4);
        expect(it.prompt).toMatch(/Which equation models this situation\?$/);
        expect(it.answer.value).toMatch(/=/);
      }
    }
  });

  test('how many of something is a whole, positive count', () => {
    for (const it of ALL) {
      if (/^.*How many (?!dollars)|After how many/.test(it.prompt) && !it.options && !/How many points/.test(it.prompt)) {
        expect([it.prompt, /^[1-9]\d*$/.test(it.answer.value)]).toEqual([it.prompt, true]);
      }
    }
  });

  test('the 7th grade items use negatives or decimals somewhere in every tier', () => {
    for (const d of [2, 3, 4]) {
      const tier = ITEMS['g7-equation-word-problems-check'].filter((i) => i.difficulty === d);
      expect(tier.some((i) => /−\d|\d\.\d/.test(i.prompt))).toBe(true);
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
      expect([skill, letters.size >= 2]).toEqual([skill, true]);
    }
  });
});
