/**
 * Chapter Review drills (utils/liveDrill/review/): Alg 1 Module 7 (systems) and Honors Geometry
 * Ch. 4 (transformations), built from the teacher's notes and chapter reviews.
 *
 * Like the Test Prep suite: every play is well formed (2–4 distinct choices with the key among
 * them, or a typed integer with ± only when negative), every template is reachable, and every
 * computational template is RE-SOLVED from its own question text — never by calling the
 * template's arithmetic. The transformation rules here are typed out from the study sheet, so a
 * slip in the bank (a 270° that turns the wrong way) fails against the sheet, not against itself.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch7');
const GEO = require('../../utils/liveDrill/review/hgeoCh4');

const N = 200;
const plain = (h) => String(h).replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 4321 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const point = (s) => plain(s).match(/\((-?\d+), (-?\d+)\)/g).map((m) => m.match(/-?\d+/g).map(Number));
/** "(x, y) → (x + 3, y − 2)" → [3, −2]; a missing component is 0. */
function ruleOf(s) {
  const m = plain(s).match(/→ \(x( [+-] \d+)?, y( [+-] \d+)?\)/); // after the arrow: "(x, y)" itself is not the rule
  const part = (t) => (t ? (t.trim()[0] === '-' ? -1 : 1) * +t.trim().slice(2) : 0);
  return [part(m[1]), part(m[2])];
}
const vec = (s) => s.match(/⟨(-?\d+), (-?\d+)⟩/g).map((m) => m.match(/-?\d+/g).map(Number));

describe.each([['alg1m7', ALG], ['hgeo4', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id);
      expect(p.card).toBeTruthy();
      expect(p.tell).toBeTruthy();
      expect(plain(p.summary)).not.toBe('');
      // the cards are HTML: a bare "<" (y < 3x + 1) would swallow the rest of the line
      expect(p.card.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      expect(p.tell.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') {
        expect(Number.isInteger(Number(p.answer))).toBe(true);
        if (Number(p.answer) < 0) expect(p.neg).toBe(true);
      } else {
        expect(p.choices.length).toBeGreaterThanOrEqual(2);
        expect(p.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length);
        expect(p.choices.map((c) => c.k)).toContain(p.answer);
        expect(p.card).not.toContain('posed-ans');
      }
    }
  });

  test('registered as a standard-scoring native drill, on its hub, reachable from Whole Chapter', () => {
    expect(DRILLS[drill].native).toBe(bank);
    expect(DRILLS[drill].scoring).toBeUndefined();
    expect(DRILLS[drill].trackFacts).toBeUndefined();
    expect(Object.values(solo.HUBS).some((h) => h.games.some((g) => g.drill === drill))).toBe(true);
    const seen = new Set();
    for (let n = 1; n <= 400; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

// ---------------------------------------------------------------- Geometry Ch. 4, re-solved

// The study sheet's rules.
const RULE = {
  'a reflection in the x-axis': ([a, b]) => [a, -b], 'a reflection in the y-axis': ([a, b]) => [-a, b],
  'a reflection in the line y = x': ([a, b]) => [b, a], 'a reflection in the line y = -x': ([a, b]) => [-b, -a],
  'a 90° rotation about the origin': ([a, b]) => [-b, a], 'a 180° rotation about the origin': ([a, b]) => [-a, -b],
  'a 270° rotation about the origin': ([a, b]) => [b, -a],
};
const eq = (p, q) => p[0] === q[0] && p[1] === q[1];

describe('Geometry Ch. 4 — re-solved from the question text', () => {
  test('translate: image = point + vector', () => {
    for (const p of deal(GEO, 'translate')) {
      const [P] = point(promptOf(p)); const [v] = vec(promptOf(p));
      expect(point(keyText(p))[0]).toEqual([P[0] + v[0], P[1] + v[1]]);
    }
  });
  test('vector: image minus preimage', () => {
    for (const p of deal(GEO, 'vector')) {
      const [P, Q] = point(promptOf(p));
      expect(vec(keyText(p))[0]).toEqual([Q[0] - P[0], Q[1] - P[1]]);
    }
  });
  test('rule image and preimage: apply the rule forward / backward', () => {
    for (const p of deal(GEO, 'ruleImage')) {
      const [a, b] = ruleOf(promptOf(p)); const [P] = point(promptOf(p));
      expect(point(keyText(p))[0]).toEqual([P[0] + a, P[1] + b]);
    }
    for (const p of deal(GEO, 'preimage')) {
      const [a, b] = ruleOf(promptOf(p)); const [I] = point(promptOf(p));
      expect(point(keyText(p))[0]).toEqual([I[0] - a, I[1] - b]);
    }
  });
  test('compose: one rule = the vectors added', () => {
    for (const p of deal(GEO, 'compose')) {
      const [u, v] = vec(promptOf(p));
      expect(ruleOf(keyText(p))).toEqual([u[0] + v[0], u[1] + v[1]]);
    }
  });
  test('distance: the length of the vector, an integer', () => {
    for (const p of deal(GEO, 'distance')) {
      const [v] = vec(promptOf(p));
      expect(Number(p.answer)).toBe(Math.hypot(v[0], v[1]));
    }
  });
  test('reflect and rotate: the study sheet\'s rule for the named transformation', () => {
    for (const id of ['reflect', 'rotate']) {
      for (const p of deal(GEO, id)) {
        const text = promptOf(p); const [P] = point(text);
        const name = Object.keys(RULE).find((k) => text.includes(k));
        expect(name).toBeTruthy();
        expect(point(keyText(p))[0]).toEqual(RULE[name](P));
      }
    }
  });
  test('reflect in x = k / y = k: same distance on the other side', () => {
    for (const p of deal(GEO, 'reflectLine')) {
      const text = promptOf(p); const [P] = point(text);
      const m = text.match(/line ([xy]) = (-?\d+)/); const k = +m[2];
      expect(point(keyText(p))[0]).toEqual(m[1] === 'x' ? [2 * k - P[0], P[1]] : [P[0], 2 * k - P[1]]);
    }
  });
  test('which rule: the named transformation really sends P to its image, and no offered wrong one does', () => {
    for (const p of deal(GEO, 'whichRule')) {
      const [P, I] = point(p.head + ' ' + promptOf(p));
      expect(eq(RULE[keyText(p)](P), I)).toBe(true);
      for (const c of p.choices) if (c.k !== p.answer) expect(eq(RULE[plain(c.html)](P), I)).toBe(false);
    }
  });
  test('composition: first move, then second, in that order', () => {
    for (const p of deal(GEO, 'composition')) {
      const text = promptOf(p); const [P] = point(text);
      const [first, second] = text.split(', then ').map((part) => Object.keys(RULE).find((k) => part.includes(k)));
      expect(point(keyText(p))[0]).toEqual(RULE[second](RULE[first](P)));
    }
  });
  test('glide reflection: slide, then flip over the axis parallel to the slide', () => {
    for (const p of deal(GEO, 'glide')) {
      const text = promptOf(p); const [P] = point(text); const [v] = vec(text);
      const mid = [P[0] + v[0], P[1] + v[1]];
      expect(point(keyText(p))[0]).toEqual(text.includes('x-axis') ? [mid[0], -mid[1]] : [-mid[0], mid[1]]);
      if (text.includes('x-axis')) expect(v[1]).toBe(0); else expect(v[0]).toBe(0);
    }
  });
  test('symmetry: a regular n-gon has n lines and turns onto itself every 360/n degrees; the rectangle has 2, not 4', () => {
    for (const p of deal(GEO, 'linesSym')) {
      const f = promptOf(p);
      const m = f.match(/regular (pentagon|hexagon|octagon)/);
      if (m) expect(Number(keyText(p))).toBe({ pentagon: 5, hexagon: 6, octagon: 8 }[m[1]]);
      if (/^a rectangle/.test(f)) expect(keyText(p)).toBe('2');
      if (/^a square/.test(f)) expect(keyText(p)).toBe('4');
      if (/^a parallelogram|^a scalene/.test(f)) expect(keyText(p)).toBe('0');
    }
    for (const p of deal(GEO, 'rotSym')) {
      const f = promptOf(p);
      const m = f.match(/regular (pentagon|hexagon|octagon)/);
      if (m) {
        const n = { pentagon: 5, hexagon: 6, octagon: 8 }[m[1]];
        const want = []; for (let d = 360 / n; d <= 180; d += 360 / n) want.push(`${d}°`);
        expect(keyText(p)).toBe(want.join(', '));
      }
      if (/^a (parallelogram|rectangle|rhombus)/.test(f)) expect(keyText(p)).toBe('180°');
      if (/^a square/.test(f)) expect(keyText(p)).toBe('90°, 180°');
      if (/trapezoid|kite|scalene|^an isosceles triangle/.test(f)) expect(keyText(p)).toMatch(/^none/);
    }
  });
});

// ---------------------------------------------------------------- Algebra Module 7, re-solved

/** Parse "y = mx + b", "ax + by = c", "y > mx + b" into {m, b} or {a, b, c}. */
function parseSI(s) {
  const m = s.match(/^y ([=<>≤≥]) (.*)$/); const rhs = m[2].replace(/\s/g, '');
  const mx = rhs.match(/^(-?\d*)x/); const slope = mx ? (mx[1] === '' ? 1 : mx[1] === '-' ? -1 : +mx[1]) : 0;
  const rest = mx ? rhs.slice(mx[0].length) : rhs; const icpt = rest ? +rest : 0;
  return { op: m[1], m: slope, b: icpt };
}
function parseStd(s) {
  const [lhs, c] = s.split(' = '); const t = lhs.replace(/\s/g, '');
  const get = (v) => { const r = t.match(new RegExp(`(^|[+-])(\\d*)${v}`)); if (!r) return 0; const n = r[2] === '' ? 1 : +r[2]; return r[1] === '-' ? -n : n; };
  return { a: get('x'), b: get('y'), c: +c };
}
const lines = (p) => promptOf(p).split(' ; ');
const satisfies = (eqn, x, y) => (eqn.startsWith('y') ? parseSI(eqn).m * x + parseSI(eqn).b === y : parseStd(eqn).a * x + parseStd(eqn).b * y === parseStd(eqn).c);
/** Solve two lines (either form) by Cramer's rule. */
function solve(e1, e2) {
  const toStd = (e) => (e.startsWith('y') ? { a: -parseSI(e).m, b: 1, c: parseSI(e).b } : parseStd(e));
  const A = toStd(e1); const B = toStd(e2); const det = A.a * B.b - B.a * A.b;
  return det === 0 ? null : [(A.c * B.b - B.c * A.b) / det, (A.a * B.c - B.a * A.c) / det];
}

describe('Algebra Module 7 — re-solved from the question text', () => {
  test('is it a solution: checked in both equations', () => {
    for (const p of deal(ALG, 'isSolution')) {
      const [x, y] = point(p.head)[0]; const [e1, e2] = lines(p);
      const ok1 = satisfies(e1, x, y); const ok2 = satisfies(e2, x, y);
      const want = ok1 && ok2 ? /^Yes/ : ok1 ? /only the first/ : ok2 ? /only the second/ : /neither/;
      expect(keyText(p)).toMatch(want);
    }
  });
  test('how many solutions: from the slopes and intercepts', () => {
    for (const p of deal(ALG, 'howMany')) {
      const [e1, e2] = lines(p); const s = solve(e1, e2);
      const L1 = parseSI(e1); const L2 = e2.startsWith('y') ? parseSI(e2) : (() => { const t = parseStd(e2); return { m: -t.a / t.b, b: t.c / t.b }; })();
      const want = s ? 'exactly one solution' : (L1.m === L2.m && L1.b === L2.b) ? 'infinitely many solutions' : 'no solution';
      expect(keyText(p)).toBe(want);
    }
  });
  test('substitution step: (a + cm)x + cb = d', () => {
    for (const p of deal(ALG, 'subStep')) {
      const [e1, e2] = lines(p); const { m, b } = parseSI(e1); const { a, b: c, c: d } = parseStd(e2);
      const got = keyText(p).replace(/\s/g, '');
      const coefX = a + c * m; const k = c * b;
      expect(got).toBe(`${coefX === 1 ? '' : coefX === -1 ? '-' : coefX}x${k < 0 ? '-' : '+'}${Math.abs(k)}=${d}`);
    }
  });
  test('the two solves: the typed value is the system\'s x or y', () => {
    for (const id of ['solveSub', 'solveElim']) {
      for (const p of deal(ALG, id)) {
        const [e1, e2] = lines(p); const s = solve(e1, e2);
        expect(s).not.toBeNull();
        expect(Number(p.answer) + 0).toBe((/What is x/.test(p.head) ? s[0] : s[1]) + 0); // + 0: Cramer can yield −0
      }
    }
  });
  test('fastest method: isolated y → substitution; opposite y coefficients → add; equal → subtract', () => {
    for (const p of deal(ALG, 'method')) {
      const [e1, e2] = lines(p);
      if (e1.startsWith('y')) expect(keyText(p)).toBe('Substitution');
      else {
        const A = parseStd(e1); const B = parseStd(e2);
        expect(keyText(p)).toBe(A.b === -B.b ? 'Elimination — add the equations' : 'Elimination — subtract the equations');
        expect(A.b === -B.b || A.b === B.b).toBe(true);
      }
    }
  });
  test('elimination multiplier: makes the x coefficients opposites', () => {
    for (const p of deal(ALG, 'elimMult')) {
      const [e1, e2] = lines(p); const A = parseStd(e1); const B = parseStd(e2);
      expect(A.a * Number(keyText(p)) + B.a).toBe(0);
    }
  });
  test('adding the equations: y cancels, x terms and constants add', () => {
    for (const p of deal(ALG, 'elimAdd')) {
      const [e1, e2] = lines(p); const A = parseStd(e1); const B = parseStd(e2);
      expect(A.b + B.b).toBe(0);
      const got = parseStd(keyText(p));
      expect(got).toEqual({ a: A.a + B.a, b: 0, c: A.c + B.c });
    }
  });
  test('error analysis: the multiplier offered makes the x coefficients opposites', () => {
    for (const p of deal(ALG, 'elimForgot')) {
      const [e1, e2] = lines(p); const A = parseStd(e1); const B = parseStd(e2);
      const k = Number(keyText(p).match(/by (-?\d+)/)[1]);
      expect(A.a * k + B.a).toBe(0);
    }
  });
  test('inequalities: the point against both, with strict vs. inclusive honored', () => {
    const holds = (e, x, y) => { const { op, m, b } = parseSI(e); const v = m * x + b; return op === '>' ? y > v : op === '≥' ? y >= v : op === '<' ? y < v : y <= v; };
    for (const p of deal(ALG, 'ineqPoint')) {
      const [x, y] = point(p.head)[0]; const [e1, e2] = lines(p);
      const ok1 = holds(e1, x, y); const ok2 = holds(e2, x, y);
      expect(keyText(p)).toMatch(ok1 && ok2 ? /^Yes/ : ok1 ? /only the first/ : ok2 ? /only the second/ : /neither/);
    }
    for (const p of deal(ALG, 'ineqBoundary')) {
      const [e1, e2] = lines(p); const d = (e) => /[<>]/.test(parseSI(e).op);
      expect(keyText(p)).toBe(d(e1) && d(e2) ? 'Both boundary lines are dashed' : d(e1) ? 'Only the first boundary line is dashed' : d(e2) ? 'Only the second boundary line is dashed' : 'Both boundary lines are solid');
    }
  });
  test('word problems: the chosen system has a whole-number solution matching the story; the typed costs re-solve', () => {
    const WORDS = { Two: 2, Three: 3, Four: 4, Five: 5, two: 2, three: 3, four: 4, five: 5 };
    for (const p of deal(ALG, 'wordSystem')) {
      const t = promptOf(p); const m = t.match(/^(\w+) times a number x plus (\w+) times another number y is (\d+)\. The sum of the two numbers is (\d+)\./);
      const [e1, e2] = keyText(p).split(' ; ');
      expect(parseStd(e1)).toEqual({ a: WORDS[m[1]], b: WORDS[m[2]], c: +m[3] });
      expect(parseStd(e2)).toEqual({ a: 1, b: 1, c: +m[4] });
    }
    for (const p of deal(ALG, 'quickPrice')) {
      const t = promptOf(p); const m = t.match(/^(\d+) (\w+) and (\d+) (\w+) cost \$(\d+)\. \d+ \w+ and 1 (\w+) cost \$(\d+)\./);
      const n = +m[1]; const k = +m[3]; const A = +m[5]; const B = +m[7];
      const second = (A - B) / (k - 1); const first = (B - second) / n;
      expect(Number(p.answer)).toBe(new RegExp(`one ${m[6]} cost`).test(p.head) ? second : first); // not includes(): "What" contains "hat"
    }
    for (const p of deal(ALG, 'breakEven')) {
      const m = promptOf(p).match(/\$(\d+) fee plus \$(\d+) per \w+\. .* \$(\d+) fee plus \$(\d+) per/);
      const [fA, rA, fB, rB] = m.slice(1).map(Number);
      expect(Number(p.answer) * (rB - rA)).toBe(fA - fB);
    }
  });
});
