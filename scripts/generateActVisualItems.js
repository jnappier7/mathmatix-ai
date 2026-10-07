// scripts/generateActVisualItems.js
//
// Generate the ACT visual bank: questions ANSWERED FROM a figure or table.
//
//   node scripts/generateActVisualItems.js            # report only
//   node scripts/generateActVisualItems.js --write    # write the seed file
//
// Writes seeds/act-visual/act-visual-items.generated.json (source
// `act-visual-2026-10`). Pure, seeded, deterministic: the same code writes the
// same file, so tests/unit/actVisualItems.test.js can pin the file to it.
//
// WHY THIS BANK EXISTS
// An official ACT Math form carries about ten items with a graph, table or
// diagram; ours averaged 1.9, and after the enhanced bank gained figures
// (scripts/addActEnhancedFigures.js) 3.8. Those figures LABEL numbers the stem
// already states. The ACT's own visual items put the data in the figure: read
// the slope by counting squares, read the quartiles off the scale, total the
// bars. This bank is that kind, across all six reporting categories, so the
// form builder has enough of them to place 8–12 on every form without
// repeating (utils/actTestAssembler.js visual pacing).
//
// HOW AN ITEM IS BUILT
// Each family draws its parameters from a seeded PRNG, solves for the key, and
// builds each wrong choice from a NAMED mistake (reading run over rise, the
// y-intercept for the slope, the range for the IQR...). The explanation names
// those mistakes by VALUE, never by letter, so serving the choices in any
// order cannot make it point at the wrong one. An item is kept only if it has
// four distinct choices and passes the same distractor gate the form builder
// applies (utils/distractorQuality.hasBadDistractors); otherwise the family
// draws again.
//
// The figure's alt text states the data in full, and the test re-solves every
// item from that alt text alone — so a screen-reader user can answer it, and a
// key that disagrees with its own picture cannot ship.

const fs = require('fs');
const path = require('path');
const C = require('../utils/actCharts');

const OUT = path.join(__dirname, '..', 'seeds', 'act-visual', 'act-visual-items.generated.json');
const SOURCE = 'act-visual-2026-10';
const WRITE = process.argv.includes('--write');

const {
  ri, pick, gcd, frac, lineEq, factor, dec1, makeBank,
} = require('./lib/actItemGen');

// ── Families ────────────────────────────────────────────────────────────────
//
// gen(rng) returns null (draw again) or
//   { key, wrong: [[text, why], ...], prompt, fig: {svg, alt} | null,
//     explain, difficulty, params }
// `params` identifies the draw, so a family never emits the same item twice.

const PLANE = 'in the standard (x,y) coordinate plane below';

const FAMILIES = [
  // ─── Functions ───────────────────────────────────────────────────────────
  {
    id: 'graph-slope', skillId: 'act-linear-functions-models', count: 18, kind: 'graph',
    gen(rng) {
      const [p, q] = pick(rng, [[1, 1], [2, 1], [3, 1], [-1, 1], [-2, 1], [-3, 1], [1, 2], [-1, 2], [1, 3], [-1, 3], [2, 3], [-2, 3], [3, 2], [-3, 2]]);
      const b = ri(rng, -3, 3);
      const xs = [-6, -4, -3, -2, 0, 2, 3, 4, 6].filter((x) => x % q === 0 && Math.abs((p * x) / q + b) <= 5);
      if (xs.length < 2) return null;
      const x1 = xs[0], x2 = xs[xs.length - 1];
      const key = frac(p, q);
      return {
        params: `${p}/${q},${b}`,
        difficulty: q === 1 ? 2 : 3,
        prompt: `What is the slope of the line graphed ${PLANE}?`,
        fig: C.lineOnGrid({ m: p / q, b, x1, x2 }),
        key,
        wrong: [
          [frac(q, p), 'is run over rise — the change in x divided by the change in y'],
          [frac(-p, q), 'has the sign backwards: the line ' + (p > 0 ? 'rises' : 'falls') + ' from left to right'],
          [frac(-q, p), 'is the slope of a line PERPENDICULAR to this one'],
          [`${b}`, 'is the y-intercept, where the line crosses the y-axis, not its slope'],
        ],
        explain: `Count from one marked point to the other: the line moves ${Math.abs(p * (x2 - x1) / q)} ${p > 0 ? 'up' : 'down'} while it moves ${x2 - x1} right, so the slope is rise over run = ${key}.`,
      };
    },
  },
  {
    id: 'parabola-equation', skillId: 'act-quadratic-functions-parabolas', count: 18, kind: 'graph',
    gen(rng) {
      // Zeros 4–6 apart so the parabola is big enough to read; ±10 window.
      const p = ri(rng, -8, 3), q = p + ri(rng, 4, 6);
      if (p === 0 || q === 0 || p === -q || q > 8) return null;
      const a = pick(rng, [1, -1]);
      const eq = (aa, r1, r2) => `y = ${aa === 1 ? '' : '-'}${factor(r1)}${factor(r2)}`;
      const key = eq(a, p, q);
      return {
        params: `${a},${p},${q}`,
        difficulty: 3,
        prompt: `Which of the following could be an equation of the parabola graphed ${PLANE}?`,
        fig: C.parabola({ a, p, q, lim: 10, step: 5 }),
        key,
        wrong: [
          [eq(a, -p, -q), `puts the zeros at ${-p} and ${-q}: in (x − r) the zero is r, so a zero at ${p} gives ${factor(p)}`],
          [eq(-a, p, q), `has the right zeros but opens ${a === 1 ? 'downward' : 'upward'}; the graph opens ${a === 1 ? 'upward' : 'downward'}`],
          [eq(-a, -p, -q), 'has the zeros\' signs flipped AND opens the wrong way'],
        ],
        explain: `The graph crosses the x-axis at x = ${p} and x = ${q}, so the factors are ${factor(p)} and ${factor(q)}; it opens ${a === 1 ? 'upward, so the leading coefficient is positive' : 'downward, so the leading coefficient is negative'}: ${key}.`,
      };
    },
  },
  {
    id: 'parabola-max', skillId: 'act-function-evaluation-notation', count: 14, kind: 'graph',
    gen(rng) {
      // Zeros h ± s and vertex (h, k) on lattice points, steep enough to read on ±6.
      const [a, sp] = pick(rng, [[-1, 2], [-2, 1], [-3, 1], [-1, 1]]);
      const h = ri(rng, -3, 3);
      const p = h - sp, q = h + sp, kk = -a * sp * sp;
      if (Math.abs(p) > 5 || Math.abs(q) > 5) return null;
      const f0 = a * p * q;
      const key = `${kk}`;
      return {
        params: `${a},${p},${q}`,
        difficulty: 2,
        prompt: `The graph of y = f(x) is shown ${PLANE}. What is the maximum value of f(x)?`,
        fig: C.parabola({ a, p, q, lim: 6, step: 2 }),
        key,
        wrong: [
          [`${h}`, `is the x-value where the maximum happens, not the maximum value itself`],
          [`${f0}`, 'is f(0), where the graph crosses the y-axis'],
          [`${q}`, 'is the larger zero, where the graph crosses the x-axis'],
          [`${p}`, 'is the smaller zero'],
        ],
        explain: `The maximum of f is the y-coordinate of the highest point, the vertex at (${h}, ${kk}). So the maximum value is ${kk}; it occurs at x = ${h}.`,
      };
    },
  },
  {
    id: 'trig-graph', skillId: 'act-trigonometric-functions', count: 16, kind: 'graph',
    gen(rng) {
      const fn = pick(rng, ['sin', 'cos']);
      const A = ri(rng, 1, 4), Bk = pick(rng, [1, 2, 4]);
      if (A === Bk) return null;
      const t = (f, a, b) => `y = ${a === 1 ? '' : a}${f}(${b === 1 ? '' : b}x)`;
      const other = fn === 'sin' ? 'cos' : 'sin';
      const key = t(fn, A, Bk);
      const halfB = Bk === 1 ? 2 : Bk / 2;
      return {
        params: `${fn},${A},${Bk}`,
        difficulty: 4,
        prompt: 'Which of the following equations could be represented by the graph shown below?',
        fig: C.trigGraph({ fn, A, Bk }),
        key,
        wrong: [
          [t(fn, Bk, A), 'swaps the amplitude and the number of cycles'],
          [t(other, A, Bk), `has the right height and period, but ${other}(0) = ${other === 'cos' ? `${A} — the graph starts at 0, not at its maximum` : '0 — the graph starts at its maximum, not at 0'}`],
          [t(fn, A, halfB), `gives a period of ${{ 1: '2π', 2: 'π', 4: 'π/2' }[halfB]}; the graph repeats every ${{ 1: '2π', 2: 'π', 4: 'π/2' }[Bk]}`],
        ],
        explain: `The curve reaches ${A} and −${A}, so the amplitude is ${A}. It repeats every ${{ 1: '2π', 2: 'π', 4: 'π/2' }[Bk]}, and a period of 2π/b means b = ${Bk}. It ${fn === 'sin' ? 'starts at 0 and rises, like sine' : 'starts at its maximum, like cosine'}: ${key}.`,
      };
    },
  },
  {
    id: 'exponential-graph', skillId: 'act-exponential-models', count: 7, kind: 'graph',
    gen(rng) {
      const [a, bn, bd] = pick(rng, [[1, 2, 1], [2, 2, 1], [3, 2, 1], [1, 3, 1], [2, 3, 1], [4, 1, 2], [6, 1, 2], [2, 4, 1], [1, 4, 1], [8, 1, 2]]);
      const b = bn / bd;
      const y1 = a * b;
      const base = (n, d) => (d === 1 ? `${n}` : `(${n}/${d})`);
      const ex = (start, bs) => `y = ${start === '1' ? '' : `${start}·`}${bs}^x`;
      const key = ex(`${a}`, base(bn, bd));
      const wrong = [
        // A base of 1 is not a growth model; skip the swap when it would make one.
        a === 1 ? null : [ex(base(bn, bd), `${a}`), 'swaps the starting value and the growth factor'],
        [ex(`${a}`, `${y1}`), `uses the y-value at x = 1 (${y1}) as the base; the base is the RATIO between consecutive y-values`],
        [ex(`${y1}`, base(bn, bd)), `uses the y-value at x = 1 as the starting value; at x = 0 the graph is at ${a}`],
        [lineEq(Math.round((y1 - a) * 2), 2, a), `is the LINE through the two labeled points: it adds ${y1 - a} each step instead of multiplying`],
      ].filter(Boolean);
      return {
        params: `${a},${bn}/${bd}`,
        difficulty: 3,
        prompt: `The graph of an exponential function is shown ${PLANE}. Which of the following could be its equation?`,
        fig: C.exponential({ a, b }),
        key,
        wrong,
        explain: `At x = 0 the graph is at ${a}, so that is the starting value. From x = 0 to x = 1 the y-value goes from ${a} to ${y1}, a factor of ${frac(bn, bd)}: ${key}.`,
      };
    },
  },
  {
    id: 'function-table', skillId: 'act-linear-functions-models', count: 16, kind: 'table',
    gen(rng) {
      const m = pick(rng, [2, 3, 4, 5, -2, -3, -4]), b = ri(rng, -6, 9);
      const x0 = ri(rng, 1, 3);
      if (b === 0 || b === m || b === -m) return null;
      const xs = [x0, x0 + 1, x0 + 2, x0 + 3];
      const ys = xs.map((x) => m * x + b);
      const key = lineEq(m, 1, b, 'f(x)');
      return {
        params: `${m},${b},${x0}`,
        difficulty: 3,
        prompt: `The table below shows values of the linear function f for 4 values of x.\n\nx | ${xs.join(' | ')}\nf(x) | ${ys.join(' | ')}\n\nWhich of the following defines f?`,
        fig: null,
        key,
        wrong: [
          [lineEq(m, 1, ys[0], 'f(x)'), `uses ${ys[0]}, the value at x = ${x0}, as the intercept; the intercept is f(0)`],
          [lineEq(b, 1, m, 'f(x)'), 'swaps the slope and the intercept'],
          [lineEq(1, m, b, 'f(x)'), `inverts the slope: f changes by ${m} for each 1 that x increases, not 1 for each ${m}`],
        ],
        explain: `Each time x goes up 1, f(x) changes by ${m}, so the slope is ${m}. Working back from f(${x0}) = ${ys[0]}: f(0) = ${ys[0]} − ${m}(${x0}) = ${b}. So ${key}.`,
      };
    },
  },

  // ─── Algebra ─────────────────────────────────────────────────────────────
  {
    id: 'system-graph', skillId: 'act-systems-of-equations', count: 18, kind: 'graph',
    gen(rng) {
      const x0 = ri(rng, -3, 3), y0 = ri(rng, -3, 3);
      const m1 = pick(rng, [1, 2, 3]), m2 = pick(rng, [-1, -2, -3]);
      const b1 = y0 - m1 * x0, b2 = y0 - m2 * x0;
      if (Math.abs(b1) > 5 || Math.abs(b2) > 5 || x0 === y0 || x0 === 0) return null;
      const key = `(${x0}, ${y0})`;
      const fig = C.twoLines({ lines: [[m1, b1], [m2, b2]] });
      return {
        params: `${x0},${y0},${m1},${m2}`,
        difficulty: 2,
        prompt: `The graphs of two linear equations are shown ${PLANE}. What is the solution (x, y) of the system formed by the two equations?`,
        fig,
        key,
        wrong: [
          [`(${y0}, ${x0})`, 'lists the coordinates in the wrong order: x comes first'],
          [`(0, ${b1})`, 'is where one line crosses the y-axis, not where the two lines cross each other'],
          [`(${-x0}, ${y0})`, 'misreads which side of the y-axis the crossing is on'],
          [`(${x0}, ${-y0})`, 'misreads which side of the x-axis the crossing is on'],
        ],
        explain: `The solution of a system is the point on BOTH lines — where they cross. The lines meet at x = ${x0}, y = ${y0}: ${key}.`,
      };
    },
  },
  {
    id: 'inequality-number-line', skillId: 'act-linear-inequalities', count: 18, kind: 'diagram',
    gen(rng) {
      const a = ri(rng, -4, 4), closed = rng() < 0.5, dir = pick(rng, ['right', 'left']);
      const op = (c, d) => (d === 'right' ? (c ? '≥' : '>') : (c ? '≤' : '<'));
      const variant = rng() < 0.5 ? 'plain' : 'solve';
      let ineq = (c, d) => `x ${op(c, d)} ${a}`;
      let prompt = 'Which of the following inequalities is represented by the number line graph below?';
      let explainTail = '';
      if (variant === 'solve') {
        const k = pick(rng, [2, 3, 4]), c0 = ri(rng, -6, 6);
        if (c0 === 0) return null;
        ineq = (c, d) => `${k}x ${c0 < 0 ? '-' : '+'} ${Math.abs(c0)} ${op(c, d)} ${k * a + c0}`;
        prompt = 'The solution set of which of the following inequalities is graphed on the number line below?';
        explainTail = ` Solving the key: subtract ${c0} from both sides and divide by ${k} (a positive number, so the sign stays): x ${op(closed, dir)} ${a}.`;
      }
      const key = ineq(closed, dir);
      const other = dir === 'right' ? 'left' : 'right';
      return {
        params: `${variant},${a},${closed},${dir}`,
        difficulty: variant === 'solve' ? 3 : 2,
        prompt,
        fig: C.numberLine({ lo: -6, hi: 6, a, aClosed: closed, dir }),
        key,
        wrong: [
          [ineq(!closed, dir), closed ? 'uses a strict inequality, but the filled circle means ' + a + ' itself is included' : 'includes ' + a + ', but the open circle means it is excluded'],
          [ineq(closed, other), `shades the ${other} side; the graph is shaded to the ${dir}`],
          [ineq(!closed, other), 'has both the endpoint and the direction backwards'],
        ],
        explain: `The ray is shaded to the ${dir}, so x is ${dir === 'right' ? 'greater' : 'less'} than ${a}; the circle at ${a} is ${closed ? 'filled, so ' + a + ' is included' : 'open, so ' + a + ' is not included'}.${explainTail}`,
      };
    },
  },
  {
    id: 'linear-model-graph', skillId: 'act-word-problems-modeling', count: 16, kind: 'graph',
    gen(rng) {
      const ctx = pick(rng, [
        ['a gym', 'months', 'm', 'C', 'Total cost (dollars)', 'Months'],
        ['a phone plan', 'gigabytes used', 'g', 'C', 'Total cost (dollars)', 'Gigabytes'],
        ['a craft class', 'sessions', 's', 'C', 'Total cost (dollars)', 'Sessions'],
      ]);
      const fee = pick(rng, [10, 20, 30, 40]), rate = pick(rng, [5, 10, 15, 20]);
      if (fee === rate) return null;
      const n = ri(rng, 4, 6);
      const pts = []; for (let x = 0; x <= n; x++) pts.push([x, fee + rate * x]);
      const yMax = Math.ceil((fee + rate * n) / 20) * 20 + (rate >= 15 ? 20 : 0);
      const [org, unit, v, Cn, yLabel, xLabel] = ctx;
      const key = `${Cn} = ${fee} + ${rate}${v}`;
      return {
        params: `${ctx[0]},${fee},${rate},${n}`,
        difficulty: 3,
        prompt: `The graph below shows the total cost, ${Cn}, in dollars, for ${org} as a function of the number of ${unit}, ${v}. Which of the following equations models the graph?`,
        fig: C.lineChart({ points: pts, xMax: n, xStep: 1, yMax, yStep: yMax / 4, xLabel, yLabel }),
        key,
        wrong: [
          [`${Cn} = ${rate} + ${fee}${v}`, 'swaps the starting fee and the rate'],
          [`${Cn} = ${fee + rate}${v}`, `treats the cost for 1 ${unit.replace(/s$/, '')} (${fee + rate}) as a rate, with no starting fee`],
          [`${Cn} = ${fee} + ${fee + rate}${v}`, `uses the total at ${v} = 1 as the rate; the rate is how much the cost RISES per ${unit.replace(/s$/, '')}`],
        ],
        explain: `At ${v} = 0 the cost is already ${fee}: the fixed fee. Each additional ${unit.replace(/s$/, '')} adds ${rate}. So ${key}.`,
      };
    },
  },

  // ─── Geometry ────────────────────────────────────────────────────────────
  {
    id: 'line-equation-graph', skillId: 'act-coordinate-geometry', count: 16, kind: 'graph',
    gen(rng) {
      const [p, q] = pick(rng, [[1, 1], [2, 1], [-1, 1], [-2, 1], [3, 1], [1, 2], [-1, 2], [2, 3], [-2, 3]]);
      const b = ri(rng, -4, 4);
      if (b === 0 || frac(p, q) === `${b}` || frac(p, q) === `${-b}`) return null;
      const xs = [-6, -4, -3, -2, 0, 2, 3, 4, 6].filter((x) => x % q === 0 && Math.abs((p * x) / q + b) <= 5);
      if (xs.length < 2) return null;
      const key = lineEq(p, q, b);
      return {
        params: `${p}/${q},${b}`,
        difficulty: 3,
        prompt: `Which of the following is an equation of the line graphed ${PLANE}?`,
        fig: C.lineOnGrid({ m: p / q, b, x1: xs[0], x2: xs[xs.length - 1] }),
        key,
        wrong: [
          [lineEq(-p, q, b), 'has the right intercept but the slope\'s sign backwards'],
          [lineEq(p, q, -b), `crosses the y-axis at ${-b}; the line crosses it at ${b}`],
          [lineEq(q, p, b), 'uses run over rise for the slope'],
        ],
        explain: `The line crosses the y-axis at ${b}, and between the marked points it rises ${frac(p, q)} for every 1 it moves right, so ${key}.`,
      };
    },
  },
  {
    id: 'composite-area', skillId: 'act-area-perimeter', count: 18, kind: 'diagram',
    gen(rng) {
      const kind = pick(rng, ['house', 'L', 'semi']);
      if (kind === 'house') {
        const Wd = pick(rng, [6, 8, 10, 12]), H = ri(rng, 4, 9), ex = ri(rng, 2, 6);
        const key = Wd * H + (Wd * ex) / 2;
        return {
          params: `house,${Wd},${H},${ex}`, difficulty: 3,
          prompt: 'In the figure below, an isosceles triangle sits on top of a rectangle, and all lengths are in meters. What is the total area of the figure, in square meters?',
          fig: C.composite({ kind, Wd, H, extra: ex }), key: `${key}`,
          wrong: [
            [`${Wd * H + Wd * ex}`, 'forgets the ½ in the triangle\'s area'],
            [`${Wd * H}`, 'counts only the rectangle'],
            [`${(Wd * H + Wd * ex) / 2}`, 'halves the whole figure, not just the triangle'],
            [`${2 * (Wd + H) + ex}`, 'adds lengths instead of finding area'],
          ],
          explain: `Rectangle: ${Wd} × ${H} = ${Wd * H}. Triangle: ½ × ${Wd} × ${ex} = ${(Wd * ex) / 2}. Total: ${key} square meters.`,
        };
      }
      if (kind === 'L') {
        const Wd = ri(rng, 8, 14), H = ri(rng, 6, 10), nw = ri(rng, 2, Wd - 4), nh = ri(rng, 2, H - 3);
        const key = Wd * H - nw * nh;
        return {
          params: `L,${Wd},${H},${nw},${nh}`, difficulty: 4,
          prompt: 'In the figure below, all angles are right angles and all lengths are in feet. What is the area of the figure, in square feet?',
          fig: C.composite({ kind, Wd, H, notchW: nw, notchH: nh }), key: `${key}`,
          wrong: [
            [`${Wd * H}`, 'ignores the missing corner'],
            [`${2 * (Wd + H)}`, 'finds the perimeter, not the area'],
            [`${(Wd - nw) * (H - nh)}`, 'multiplies the two shorter labeled edges'],
            [`${Wd * H - (Wd - nw) * (H - nh)}`, 'subtracts the wrong rectangle'],
          ],
          explain: `The missing corner is ${Wd} − ${Wd - nw} = ${nw} wide and ${H} − ${H - nh} = ${nh} tall. Full rectangle ${Wd} × ${H} = ${Wd * H}, minus ${nw} × ${nh} = ${nw * nh}: ${key} square feet.`,
        };
      }
      const Wd = pick(rng, [4, 8, 12]), H = ri(rng, 3, 9), r = Wd / 2;
      const key = `${Wd * H} + ${(r * r) / 2}π`;
      return {
        params: `semi,${Wd},${H}`, difficulty: 4,
        prompt: 'The figure below is a rectangle with a semicircle on top; the semicircle\'s diameter is the rectangle\'s top side. What is the area of the figure, in square units?',
        fig: C.composite({ kind, Wd, H }), key,
        wrong: [
          [`${Wd * H} + ${r * r}π`, 'adds a whole circle instead of half of one'],
          [`${Wd * H} + ${(Wd * Wd) / 2}π`, `uses the diameter, ${Wd}, as the radius`],
          [`${Wd * H} + ${r}π`, `uses πr instead of ½πr² for the semicircle`],
        ],
        explain: `Rectangle: ${Wd} × ${H} = ${Wd * H}. The semicircle has radius ${Wd} ÷ 2 = ${r}, so its area is ½π(${r})² = ${(r * r) / 2}π. Total: ${key}.`,
      };
    },
  },
  {
    id: 'parallel-angle-algebra', skillId: 'act-angles-parallel-lines', count: 16, kind: 'diagram',
    gen(rng) {
      const relation = pick(rng, ['equal', 'supplementary']);
      const x = ri(rng, 8, 25);
      const a1 = ri(rng, 2, 5), a2 = ri(rng, 2, 6);
      if (a1 === a2) return null;
      const d1 = ri(rng, 40, 140);
      const c1 = d1 - a1 * x;
      const d2 = relation === 'equal' ? d1 : 180 - d1;
      const c2 = d2 - a2 * x;
      if (Math.abs(c1) < 2 || Math.abs(c2) < 2 || Math.abs(c1) > 60 || Math.abs(c2) > 60) return null;
      const e = (a, c) => `(${a}x ${c < 0 ? '−' : '+'} ${Math.abs(c)})°`;
      const wrongRel = relation === 'equal' ? (180 - c1 - c2) / (a1 + a2) : (c2 - c1) / (a1 - a2);
      const cands = [
        [`${d1}`, `is the measure of the angle, not the value of x`],
        [Number.isInteger(wrongRel) && wrongRel > 0 ? `${wrongRel}` : null, relation === 'equal' ? 'sets the two angles\' sum to 180°, but alternate interior angles are EQUAL' : 'sets the two angles equal, but same-side interior angles add to 180°'],
        [`${x + 2}`, 'drops a sign while collecting the constants'],
        [`${d2}`, 'is the measure of the other angle'],
      ].filter(([t]) => t != null);
      return {
        params: `${relation},${x},${a1},${a2},${d1}`, difficulty: 3,
        prompt: 'In the figure below, two parallel lines are cut by a transversal, and two angles are labeled. What is the value of x?',
        fig: C.parallelExpressions({ e1: e(a1, c1), e2: e(a2, c2), relation, deg1: d1 }),
        key: `${x}`,
        wrong: cands,
        explain: relation === 'equal'
          ? `The labeled angles are alternate interior angles, so they are equal: ${a1}x ${c1 < 0 ? '−' : '+'} ${Math.abs(c1)} = ${a2}x ${c2 < 0 ? '−' : '+'} ${Math.abs(c2)}, giving x = ${x}. (Each angle measures ${d1}°.)`
          : `The labeled angles are same-side interior angles, so they add to 180°: (${a1}x ${c1 < 0 ? '−' : '+'} ${Math.abs(c1)}) + (${a2}x ${c2 < 0 ? '−' : '+'} ${Math.abs(c2)}) = 180, giving x = ${x}. (The angles measure ${d1}° and ${d2}°.)`,
      };
    },
  },
  {
    id: 'trapezoid-on-grid', skillId: 'act-coordinate-geometry', count: 14, kind: 'graph',
    gen(rng) {
      const y1 = ri(rng, -5, -1), y2 = ri(rng, 1, 5);
      const x1 = ri(rng, -5, -2), b1 = ri(rng, 5, 9);
      const off = ri(rng, -1, 2), b2 = ri(rng, 2, b1 - 2);
      const x3 = x1 + off;
      if (x1 + b1 > 5 || x3 + b2 > 5 || x3 < -5) return null;
      const h = y2 - y1;
      const area2 = (b1 + b2) * h;
      if (area2 % 2) return null;
      const key = area2 / 2;
      const V = [[x1, y1], [x1 + b1, y1], [x3 + b2, y2], [x3, y2]];
      return {
        params: `${V.flat().join(',')}`, difficulty: 3,
        prompt: `Trapezoid ABCD is shown ${PLANE}, with AB parallel to DC. What is the area of trapezoid ABCD, in square units?`,
        fig: C.polygonOnGrid({ vertices: V, names: ['A', 'B', 'C', 'D'] }),
        key: `${key}`,
        wrong: [
          [`${area2}`, 'forgets to halve the sum of the bases'],
          [`${b1 * h}`, 'multiplies only the longer base by the height'],
          [`${b1 * b2}`, 'multiplies the two bases together'],
          [`${(b1 + b2) * h / 2 + h}`, 'miscounts the height'],
        ],
        explain: `Count squares: base AB is ${b1}, base DC is ${b2}, and the height between them is ${h}. Area = ½(${b1} + ${b2})(${h}) = ${key}.`,
      };
    },
  },

  // ─── Statistics & Probability ────────────────────────────────────────────
  {
    id: 'box-plot', skillId: 'act-center-spread', count: 18, kind: 'graph',
    gen(rng) {
      const s = pick(rng, [1, 2, 5]);
      const mn = ri(rng, 0, 4) * s, q1 = mn + ri(rng, 2, 4) * s, med = q1 + ri(rng, 1, 3) * s, q3 = med + ri(rng, 1, 4) * s, mx = q3 + ri(rng, 2, 4) * s;
      const lo = 0, hi = Math.ceil((mx + s) / (s * 2)) * s * 2;
      const step = hi / s > 12 ? 2 * s : s;      // at most ~12 tick labels
      const ask = pick(rng, ['IQR', 'range', 'median']);
      const label = pick(rng, ['Test scores', 'Minutes spent on homework', 'Points scored per game', 'Daily high temperature (°F)']);
      let key; let wrong; let explain;
      if (ask === 'IQR') {
        key = q3 - q1;
        wrong = [[`${mx - mn}`, 'is the range (maximum − minimum), not the interquartile range'], [`${med}`, 'is the median'], [`${q3}`, 'is the third quartile itself, not the distance between the quartiles']];
        explain = `The box runs from the first quartile, ${q1}, to the third quartile, ${q3}. IQR = ${q3} − ${q1} = ${key}.`;
      } else if (ask === 'range') {
        key = mx - mn;
        wrong = [[`${q3 - q1}`, 'is the interquartile range, the width of the box'], [`${mx}`, 'is the maximum, not the range'], [`${med - mn}`, 'measures from the minimum only to the median']];
        explain = `The whiskers end at the minimum, ${mn}, and maximum, ${mx}. Range = ${mx} − ${mn} = ${key}.`;
      } else {
        key = med;
        wrong = [[`${(mn + mx) / 2}`, 'is the midpoint of the whole range; the median is the line inside the box'], [`${q1}`, 'is the first quartile, the left edge of the box'], [`${q3}`, 'is the third quartile, the right edge of the box']];
        explain = `The median is the line drawn inside the box, at ${med}.`;
      }
      return {
        params: `${ask},${mn},${q1},${med},${q3},${mx}`, difficulty: ask === 'median' ? 2 : 3,
        prompt: `The box plot below summarizes a data set. What is the ${ask === 'IQR' ? 'interquartile range' : ask} of the data?`,
        fig: C.boxPlot({ five: [mn, q1, med, q3, mx], lo, hi, step, label }),
        key: `${key}`,
        wrong,
        explain,
      };
    },
  },
  {
    id: 'scatter-fit', skillId: 'act-center-spread', count: 16, kind: 'graph',
    gen(rng) {
      const [xLabel, yLabel, unitX, unitY, yPhrase, xPhrase] = pick(rng, [
        ['Hours studied', 'Test score', 'hour', 'point', 'test score', 'number of hours studied'],
        ['Temperature (°F)', 'Drinks sold', 'degree', 'drink', 'number of drinks sold', 'temperature'],
        ['Age of car (years)', 'Value (thousands of $)', 'year', 'thousand dollars', 'value of the car (in thousands of dollars)', 'age of the car (in years)'],
        ['Minutes of practice', 'Free throws made', 'minute', 'free throw', 'number of free throws made', 'number of minutes of practice'],
      ]);
      const xMax = 10, yMax = 100;
      const m = pick(rng, [4, 5, 6, 8, -4, -5, -6]);
      const b = m > 0 ? pick(rng, [20, 30, 40]) : pick(rng, [80, 90]);
      const pts = [];
      for (let x = 1; x <= 9; x++) {
        const y = m * x + b + ri(rng, -6, 6);
        if (y > 2 && y < 98) pts.push([x, y]);
      }
      if (pts.length < 7) return null;
      const ask = rng() < 0.5 ? 'predict' : 'slope';
      if (ask === 'predict') {
        const xs = ri(rng, 3, 8);
        const key = m * xs + b;
        return {
          params: `p,${xLabel},${m},${b},${xs}`, difficulty: 3,
          prompt: `The scatterplot below shows data with a line of best fit (dashed). According to the line of best fit, what is the predicted ${yPhrase} when the ${xPhrase} is ${xs}?`,
          fig: C.scatterWithFit({ points: pts, m, b, xMax, yMax, xStep: 2, yStep: 20, xLabel, yLabel }),
          key: `${key}`,
          wrong: [[`${m * xs}`, 'multiplies by the slope but leaves out the starting value'], [`${b}`, 'reads the line at x = 0, not at the given value'], [`${key + 2 * Math.abs(m)}`, 'reads the line two units too far along'], [`${key - 2 * Math.abs(m)}`, 'reads the line two units too early']],
          explain: `The line starts at ${b} when x = 0 and changes by ${m} per ${unitX}. At ${xs}: ${b} + ${m}(${xs}) = ${key}.`,
        };
      }
      return {
        params: `s,${xLabel},${m},${b}`, difficulty: 3,
        prompt: `The scatterplot below shows data with a line of best fit (dashed). According to the line, by about how much does the ${yPhrase} change for each additional ${unitX}?`,
        fig: C.scatterWithFit({ points: pts, m, b, xMax, yMax, xStep: 2, yStep: 20, xLabel, yLabel }),
        key: `${m}`,
        wrong: [[`${-m}`, `has the direction backwards: the line ${m > 0 ? 'rises' : 'falls'}`], [`${b}`, 'is the line\'s value at x = 0'], [`${m * 2}`, 'reads the change over two units instead of one'], [`${m * 10 + b}`, 'is the line\'s value at the right edge']],
        explain: `The dashed line goes from ${b} at x = 0 to ${m * 10 + b} at x = 10, a change of ${m * 10} over 10 ${unitX}s: ${m} ${unitY}${Math.abs(m) === 1 ? '' : 's'} per ${unitX}.`,
      };
    },
  },
  {
    id: 'two-way-reverse', skillId: 'act-conditional-probability', count: 16, kind: 'table',
    gen(rng) {
      const [rowsName, r1, r2, cName, c1, c2] = pick(rng, [
        ['Grade', '10th grade', '11th grade', 'Lunch', 'Brings lunch', 'Buys lunch'],
        ['Section', 'Morning', 'Afternoon', 'Device', 'Laptop', 'Tablet'],
        ['Team', 'Varsity', 'Junior varsity', 'Travel', 'Bus', 'Car'],
      ]);
      const a = ri(rng, 8, 30), b = ri(rng, 8, 30), c = ri(rng, 8, 30), d = ri(rng, 8, 30);
      const T = a + b + c + d;
      const col1 = a + c;
      if (gcd(a, col1) === col1) return null;
      const key = frac(a, col1);
      const wrong = [[frac(a, a + b), `divides by everyone in ${r1}, which answers "given ${r1}" instead of "given ${c1.toLowerCase()}"`], [frac(a, T), 'divides by the whole table, ignoring the condition'], [frac(c, col1), `gives the ${r2} share of that group`]];
      return {
        params: `${rowsName},${a},${b},${c},${d}`, difficulty: 3,
        prompt: `The table below shows how ${T} students answered a survey.\n\n${rowsName} | ${c1} | ${c2} | Total\n${r1} | ${a} | ${b} | ${a + b}\n${r2} | ${c} | ${d} | ${c + d}\nTotal | ${col1} | ${b + d} | ${T}\n\nOne of the students who chose "${c1}" is selected at random. What is the probability that the student is in the ${r1} group?`,
        fig: null,
        key,
        wrong,
        explain: `The condition narrows the pool to the ${col1} students in the "${c1}" column. ${a} of them are in ${r1}: ${key}.`,
      };
    },
  },
  {
    id: 'frequency-probability', skillId: 'act-probability', count: 14, kind: 'table',
    gen(rng) {
      const cols = pick(rng, [['Red', 'Blue', 'Green', 'Yellow'], ['Cherry', 'Lime', 'Grape', 'Orange']]);
      const n = cols.map(() => ri(rng, 2, 12));
      const T = n.reduce((s, v) => s + v, 0);
      const i = ri(rng, 0, 3);
      const not = rng() < 0.5;
      const num = not ? T - n[i] : n[i];
      const key = frac(num, T);
      if (key === '1/4' || key === '3/4') return null;
      const what = cols === undefined ? '' : (cols[0] === 'Red' ? 'marbles in a bag' : 'candies in a jar');
      return {
        params: `${cols[0]},${n.join(',')},${i},${not}`, difficulty: 2,
        prompt: `The table below shows the number of ${what} by color.\n\nColor | ${cols.join(' | ')}\nNumber | ${n.join(' | ')}\n\nOne is chosen at random. What is the probability that it is ${not ? 'NOT ' : ''}${cols[i].toLowerCase()}?`,
        fig: null,
        key,
        wrong: [
          [frac(not ? n[i] : T - n[i], T), not ? `is the probability that it IS ${cols[i].toLowerCase()}` : `is the probability that it is NOT ${cols[i].toLowerCase()}`],
          [frac(n[i], T - n[i]), `compares ${cols[i].toLowerCase()} to the others (odds), not to the total`],
          [not ? '3/4' : '1/4', 'treats the four colors as equally likely, ignoring the counts'],
        ],
        explain: `There are ${n.join(' + ')} = ${T} in all, and ${num} of them ${not ? `are not ${cols[i].toLowerCase()}` : `are ${cols[i].toLowerCase()}`}: ${key}.`,
      };
    },
  },

  // ─── Integrating Essential Skills ────────────────────────────────────────
  {
    id: 'bar-chart-center', skillId: 'act-average-median', count: 16, kind: 'graph',
    gen(rng) {
      const f = [1, 2, 3, 4, 5].map(() => ri(rng, 1, 7));
      const N = f.reduce((s, v) => s + v, 0);
      const vals = []; f.forEach((c, i) => { for (let k = 0; k < c; k++) vals.push(i + 1); });
      const ask = rng() < 0.5 ? 'median' : 'mean';
      let key; let wrong; let explain;
      const mode = f.indexOf(Math.max(...f)) + 1;
      if (ask === 'median') {
        if (N % 2 === 0 && vals[N / 2 - 1] !== vals[N / 2]) return null;
        key = vals[Math.floor((N - 1) / 2)];
        if (key === mode) return null;
        const medF = [...f].sort((a, b) => a - b)[2];
        wrong = [[`${mode}`, 'is the mode, the tallest bar'], [`${medF}`, 'is the median of the bar HEIGHTS, not of the scores'], [`3`, 'is the middle score on the axis, ignoring how many earned each']];
        explain = `${N} students in order: the middle one is number ${Math.ceil(N / 2)}. Counting up the bars (${f.join(', ')}), that student scored ${key}.`;
      } else {
        const sum = vals.reduce((s, v) => s + v, 0);
        if ((sum * 10) % N) return null;   // a mean that ends cleanly in tenths
        key = dec1(sum / N);
        if (key === '3' || key === dec1(N / 5)) return null;
        wrong = [['3', 'averages the five scores without weighting them by how many students earned each'], [dec1(N / 5), 'averages the bar heights'], [`${mode}`, 'is the mode']];
        explain = `Total of all scores: ${f.map((c, i) => `${i + 1}×${c}`).join(' + ')} = ${sum}. Divided by ${N} students: ${key}.`;
      }
      return {
        params: `${ask},${f.join(',')}`, difficulty: 3,
        prompt: `The bar graph below shows how many students earned each score on a 5-point quiz. What is the ${ask} score?`,
        fig: C.barChart({ cats: ['1', '2', '3', '4', '5'], values: f, yMax: 8, yStep: 2, xLabel: 'Score', yLabel: 'Number of students' }),
        key: `${key}`,
        wrong,
        explain,
      };
    },
  },
  {
    id: 'line-chart-rate', skillId: 'act-rates-unit-conversion', count: 16, kind: 'graph',
    gen(rng) {
      const speeds = [ri(rng, 1, 6) * 10, ri(rng, 0, 3) * 10, ri(rng, 1, 6) * 10, ri(rng, 1, 6) * 10];
      const pts = [[0, 0]];
      speeds.forEach((s, i) => pts.push([i + 1, pts[i][1] + s]));
      const yMax = Math.ceil(pts[4][1] / 40) * 40;
      const ask = rng() < 0.5 ? 'fastest' : 'average';
      if (ask === 'fastest') {
        const top = Math.max(...speeds);
        if (speeds.filter((s) => s === top).length > 1) return null;
        const iv = (i) => `From hour ${i} to hour ${i + 1}`;
        const best = speeds.indexOf(top);
        return {
          params: `f,${speeds.join(',')}`, difficulty: 3,
          prompt: 'The graph below shows a cyclist\'s distance from home during a 4-hour trip. During which hour was the cyclist\'s average speed greatest?',
          fig: C.lineChart({ points: pts, xMax: 4, xStep: 1, yMax, yStep: yMax / 4, xLabel: 'Time (hours)', yLabel: 'Distance (miles)' }),
          key: iv(best),
          wrong: [0, 1, 2, 3].filter((i) => i !== best).map((i) => [iv(i), speeds[i] === 0 ? 'is the hour the cyclist stopped: the graph is flat' : `covers ${speeds[i]} miles, fewer than ${top}`]),
          explain: `Speed is the steepness of the graph. The distance rises by ${speeds.join(', ')} miles in hours 1 to 4; the steepest is ${top} miles, from hour ${best} to hour ${best + 1}.`,
        };
      }
      const a = ri(rng, 0, 2), b = a + 2;
      const dist = pts[b][1] - pts[a][1];
      if ((dist / 2) % 1) return null;
      const key = dist / 2;
      return {
        params: `a,${speeds.join(',')},${a}`, difficulty: 3,
        prompt: `The graph below shows a cyclist's distance from home during a 4-hour trip. What was the cyclist's average speed, in miles per hour, from hour ${a} to hour ${b}?`,
        fig: C.lineChart({ points: pts, xMax: 4, xStep: 1, yMax, yStep: yMax / 4, xLabel: 'Time (hours)', yLabel: 'Distance (miles)' }),
        key: `${key}`,
        wrong: [[`${dist}`, 'gives the distance covered, not the distance per hour'], [Number.isInteger(pts[b][1] / b) ? `${pts[b][1] / b}` : null, `divides the total distance from home at hour ${b} by ${b} hours, which includes the trip before hour ${a}`], [`${pts[b][1]}`, `reads the distance from home at hour ${b}`]],
        explain: `At hour ${a} the cyclist is ${pts[a][1]} miles out; at hour ${b}, ${pts[b][1]}. That is ${dist} miles in 2 hours: ${key} miles per hour.`,
      };
    },
  },
  {
    id: 'pie-chart-count', skillId: 'act-percentages', count: 16, kind: 'graph',
    gen(rng) {
      const labels = pick(rng, [['Soccer', 'Basketball', 'Swimming', 'Tennis'], ['Pizza', 'Tacos', 'Pasta', 'Salad'], ['Bus', 'Car', 'Walk', 'Bike']]);
      const p = [ri(rng, 4, 8) * 5, ri(rng, 2, 6) * 5, ri(rng, 1, 4) * 5];
      const last = 100 - p[0] - p[1] - p[2];
      if (last < 5) return null;
      p.push(last);
      const N = pick(rng, [200, 240, 300, 400, 500, 600]);
      const i = ri(rng, 0, 3), j = (i + 1 + ri(rng, 0, 2)) % 4;
      const ask = rng() < 0.5 ? 'count' : 'more';
      const slices = labels.map((l, k) => [l, p[k]]);
      const topic = labels[0] === 'Soccer' ? 'favorite sport' : labels[0] === 'Pizza' ? 'favorite lunch' : 'way of getting to school';
      if (ask === 'count') {
        const key = (N * p[i]) / 100;
        return {
          params: `c,${labels[0]},${p.join(',')},${N},${i}`, difficulty: 2,
          prompt: `The circle graph below shows the results when ${N} students were asked their ${topic}. How many students chose ${labels[i].toLowerCase()}?`,
          fig: C.pieChart({ slices, title: `${topic}s` }),
          key: `${key}`,
          wrong: [[`${p[i]}`, 'reports the percent, not the number of students'], [`${(N * p[j]) / 100}`, `is the number who chose ${labels[j].toLowerCase()}`], [`${N - key}`, `is the number who did NOT choose ${labels[i].toLowerCase()}`]],
          explain: `${p[i]}% of ${N} = ${p[i] / 100} × ${N} = ${key} students.`,
        };
      }
      if (p[i] === p[j]) return null;
      const [hi, lo] = p[i] > p[j] ? [i, j] : [j, i];
      const key = (N * (p[hi] - p[lo])) / 100;
      return {
        params: `m,${labels[0]},${p.join(',')},${N},${hi},${lo}`, difficulty: 3,
        prompt: `The circle graph below shows the results when ${N} students were asked their ${topic}. How many more students chose ${labels[hi].toLowerCase()} than chose ${labels[lo].toLowerCase()}?`,
        fig: C.pieChart({ slices, title: `${topic}s` }),
        key: `${key}`,
        wrong: [[`${p[hi] - p[lo]}`, 'gives the difference in percentage points, not in students'], [`${(N * p[hi]) / 100}`, `is the number who chose ${labels[hi].toLowerCase()}`], [`${(N * (p[hi] + p[lo])) / 100}`, 'adds the two groups instead of subtracting']],
        explain: `${p[hi]}% − ${p[lo]}% = ${p[hi] - p[lo]}% of ${N} students: ${key}.`,
      };
    },
  },

  // ─── Number & Quantity ───────────────────────────────────────────────────
  {
    id: 'vector-on-grid', skillId: 'act-matrices-vectors', count: 16, kind: 'graph',
    gen(rng) {
      const ask = rng() < 0.5 ? 'components' : 'magnitude';
      const [dx0, dy0] = ask === 'magnitude' ? pick(rng, [[3, 4], [4, 3]]) : [ri(rng, 1, 6), ri(rng, 1, 6)];
      const sx = pick(rng, [1, -1]), sy = pick(rng, [1, -1]);
      const dx = dx0 * sx, dy = dy0 * sy;
      const tx = ri(rng, -5, 5), ty = ri(rng, -5, 5);
      const hx = tx + dx, hy = ty + dy;
      if (Math.abs(hx) > 5 || Math.abs(hy) > 5 || dx === dy || (tx === 0 && ty === 0) || (hx === 0 && hy === 0)) return null;
      const fig = C.vectorOnGrid({ tail: [tx, ty], head: [hx, hy] });
      if (ask === 'components') {
        const v = (a, b) => `⟨${a}, ${b}⟩`;
        return {
          params: `c,${tx},${ty},${dx},${dy}`, difficulty: 2,
          prompt: `A vector is shown ${PLANE}, from its tail (the dot) to its head (the arrow). Which of the following is the component form of the vector?`,
          fig, key: v(dx, dy),
          wrong: [[v(dy, dx), 'lists the vertical change first'], [v(-dx, -dy), 'subtracts head from tail, which points the vector backwards'], [v(hx, hy), 'gives the coordinates of the head, not the change from tail to head']],
          explain: `From tail (${tx}, ${ty}) to head (${hx}, ${hy}): x changes by ${dx} and y by ${dy}, so the vector is ⟨${dx}, ${dy}⟩.`,
        };
      }
      return {
        params: `m,${tx},${ty},${dx},${dy}`, difficulty: 3,
        prompt: `A vector is shown ${PLANE}, from its tail (the dot) to its head (the arrow). What is the magnitude of the vector?`,
        fig, key: '5',
        wrong: [['7', 'adds the horizontal and vertical changes'], ['25', 'stops at the sum of the squares without taking the square root'], ['1', 'subtracts the changes']],
        explain: `The vector moves ${Math.abs(dx)} horizontally and ${Math.abs(dy)} vertically. Magnitude = √(${dx0}² + ${dy0}²) = √25 = 5.`,
      };
    },
  },
  {
    id: 'complex-plane', skillId: 'act-complex-numbers', count: 14, kind: 'graph',
    gen(rng) {
      const a = ri(rng, -5, 5), b = ri(rng, -5, 5);
      if (!a || !b || Math.abs(a) === Math.abs(b)) return null;
      const z = (re, im) => `${re} ${im < 0 ? '-' : '+'} ${Math.abs(im) === 1 ? '' : Math.abs(im)}i`;
      const fig = C.pointOnGrid({ x: a, y: b, name: 'P', xName: 'real', yName: 'imag' });
      return {
        params: `${a},${b}`, difficulty: 2,
        prompt: 'In the complex plane below, the horizontal axis is the real axis and the vertical axis is the imaginary axis. Which complex number does point P represent?',
        fig: { svg: fig.svg, alt: `Complex plane from -6 to 6 on each axis, one unit per square; the horizontal axis is real and the vertical axis is imaginary. Point P is at real part ${a}, imaginary part ${b}.` },
        key: z(a, b),
        wrong: [[z(b, a), 'swaps the real and imaginary parts'], [z(a, -b), 'reads the imaginary part with the wrong sign'], [z(-a, b), 'reads the real part with the wrong sign']],
        explain: `P is ${Math.abs(a)} ${a > 0 ? 'right' : 'left'} on the real axis and ${Math.abs(b)} ${b > 0 ? 'up' : 'down'} on the imaginary axis: ${z(a, b)}.`,
      };
    },
  },
];

// ── Assembly ────────────────────────────────────────────────────────────────

const bank = makeBank({
  source: SOURCE,
  idPrefix: 'act-visual-',
  tags: (fam) => ['act', 'act-math', 'visual', `visual:${fam.kind}`, `family:${fam.id}`],
});
const generate = () => bank.generate(FAMILIES);

function main() {
  const { items, report } = generate();
  report.forEach(([id, skill, made, want]) => console.log(`  ${String(made).padStart(3)}/${want}  ${id.padEnd(24)} ${skill}`));
  console.log(`act-visual: ${items.length} items`);
  if (WRITE) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(items, null, 1) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  } else {
    console.log('(report only — pass --write to write the seed file)');
  }
}

if (require.main === module) main();

module.exports = { FAMILIES, generate, frac, lineEq, SOURCE };
