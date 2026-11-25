'use strict';
/**
 * At-level check items for thirteen Algebra 2 course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   graphing-lines-review · systems-modeling · matrix-operations ·
 *   inverse-matrices · quadratic-discriminant · quadratic-transformations ·
 *   polynomial-operations · polynomial-division · advanced-factoring ·
 *   rational-equations · solving-quadratics-all-methods ·
 *   counting-principles · permutations-combinations
 *
 * No picture exists. Matrices are written inline, row by row, as
 * [[a, b], [c, d]] and every matrix prompt says so. A typed answer is one
 * integer or one fraction; an expression, an equation, a matrix or a
 * description is multiple choice, and each wrong choice is the answer a named
 * slip produces (sign of h, forgot the placeholder, BA for AB, +4ac …).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelAlgebra2A.test.js.
 */

const K = require('./templateKit');
const { int, pick, nonZero } = K;

const COURSE_ID = 'algebra-2';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item. */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 600; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 600 tries');
  };
}

/** A tier whose four items are four different question forms. */
const forms = (fs) => g((r, idx) => fs[idx % fs.length](r));

/** Multiple choice: the right answer at a drawn position among three distinct wrong ones. */
function mc(r, correct, wrongs) {
  const c = String(correct);
  const w = [...new Set(wrongs.map(String))].filter((x) => x !== c);
  if (w.length < 3) again();
  const options = w.slice(0, 3);
  const pos = int(r, 0, 3);
  options.splice(pos, 0, c);
  return { value: c, options, correctOption: 'ABCD'[pos] };
}

const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷' };
/** A number as a prompt prints it (Unicode minus). */
const n = (v) => (v < 0 ? `−${Math.abs(v)}` : String(v));
const sgn = K.signed;
/** A fraction as a prompt prints it. */
const fr = (a, b) => K.frac(a, b).replace('-', '−');
const pt = (x, y) => `(${n(x)}, ${n(y)})`;

/** A polynomial in x from its coefficients, highest power first: "2x³ − x + 5". */
function P(coefs) {
  let out = '';
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const deg = coefs.length - 1 - i;
    const mag = Math.abs(c);
    const body = deg === 0 ? String(mag) : `${mag === 1 ? '' : mag}x${deg > 1 ? SUP[deg] : ''}`;
    out += out === '' ? `${c < 0 ? '−' : ''}${body}` : ` ${c < 0 ? '−' : '+'} ${body}`;
  });
  return out === '' ? '0' : out;
}
/** "(x − 3)" for the root 3, "(x + 3)" for the root −3, "x" for 0. */
const F = (root) => (root === 0 ? 'x' : `(x ${sgn(-root)})`);
/** "(x + a)" for the constant a. */
const lf = (a) => F(-a);
/** "3x − 4y" */
function std(A, B) {
  return `${A === 1 ? '' : A === -1 ? '−' : n(A)}x ${B < 0 ? '−' : '+'} ${Math.abs(B) === 1 ? '' : Math.abs(B)}y`;
}
const eqLine = (m, b) => `y = ${P([m, b])}`;

function pmul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}
/** Synthetic division of coefs by (x − c): [quotient, remainder]. */
function synth(coefs, c) {
  const q = [];
  let carry = 0;
  for (const k of coefs) { carry = carry * c + k; q.push(carry); }
  return [q.slice(0, -1), q[q.length - 1]];
}

const MAT = 'Matrices are written row by row, so [[1, 2], [3, 4]] has first row 1, 2 and second row 3, 4. ';
const M = (m) => `[${m.map((row) => `[${row.map((v) => (typeof v === 'string' ? v : n(v))).join(', ')}]`).join(', ')}]`;
const rand = (r, rows, cols, lo, hi) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => int(r, lo, hi)));
function mmul(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}
const T = (A) => A[0].map((_, j) => A.map((row) => row[j]));
const det = (A) => A[0][0] * A[1][1] - A[0][1] * A[1][0];

const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
const nPr = (a, b) => fact(a) / fact(a - b);
const nCr = (a, b) => nPr(a, b) / fact(b);

// ── templates ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'graphing-lines-review',
    skillId: 'a2-graphing-lines-review',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const A = int(r, 2, 7), B = nonZero(r, -7, 7), C = nonZero(r, -12, 20);
          if (Math.abs(B) === 1 || A % B === 0) again();
          return {
            prompt: `What is the slope of the line ${std(A, B)} = ${n(C)}?`,
            value: K.frac(-A, B),
            explanation: `Solve for y: ${n(B)}y = ${n(-A)}x ${sgn(C)}, so y = (${fr(-A, B)})x + ${fr(C, B)}. The slope is ${fr(-A, B)}. Reading the slope straight off as ${A} (or as ${fr(A, B)}, without the sign change) is the usual slip.`,
          };
        },
        (r) => {
          const m = pick(r, [-4, -3, -2, 2, 3, 4, 5]), x1 = nonZero(r, -6, 6), y1 = nonZero(r, -8, 8);
          const b = y1 - m * x1;
          return {
            prompt: `A line has the equation y ${sgn(-y1)} = ${n(m)}(x ${sgn(-x1)}). What is its y-intercept? Give the y-value only.`,
            value: b,
            explanation: `Set x = 0: y ${sgn(-y1)} = ${n(m)}(${n(-x1)}) = ${n(-m * x1)}, so y = ${n(b)}. The number ${n(y1)} in the equation is the y-value of a point on the line, not the intercept.`,
          };
        },
        (r) => {
          const A = int(r, 2, 6), B = nonZero(r, -7, 7), t = nonZero(r, -8, 8);
          if (Math.abs(B) === 1 || Math.abs(B) === A) again();
          return {
            prompt: `What is the x-intercept of the line ${std(A, B)} = ${n(A * t)}? Give the x-value only.`,
            value: t,
            explanation: `On the x-axis y = 0, so ${A}x = ${n(A * t)} and x = ${n(t)}. Setting x = 0 instead gives the y-intercept, ${fr(A * t, B)}.`,
          };
        },
        (r) => {
          const x1 = int(r, -6, 6), y1 = int(r, -8, 8), dx = nonZero(r, -6, 6), dy = nonZero(r, -9, 9);
          if (dy % dx === 0) again();
          return {
            prompt: `What is the slope of the line through the points ${pt(x1, y1)} and ${pt(x1 + dx, y1 + dy)}?`,
            value: K.frac(dy, dx),
            explanation: `Slope = change in y over change in x = (${n(y1 + dy)} − ${n(y1)})/(${n(x1 + dx)} − ${n(x1)}) = ${n(dy)}/${n(dx)} = ${fr(dy, dx)}. Putting the change in x on top gives ${fr(dx, dy)}.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const m = nonZero(r, -4, 4), x1 = nonZero(r, -5, 5), dx = nonZero(r, -4, 4), b = nonZero(r, -9, 9);
          const y1 = m * x1 + b, x2 = x1 + dx, y2 = m * x2 + b;
          return {
            prompt: `Which is an equation of the line through the points ${pt(x1, y1)} and ${pt(x2, y2)}?`,
            ...mc(r, eqLine(m, b), [eqLine(-m, y1 + m * x1), eqLine(m, y1), eqLine(m, y1 + m * x1)]),
            explanation: `Slope = (${n(y2)} − ${n(y1)})/(${n(x2)} − ${n(x1)}) = ${n(m)}. Then ${n(y1)} = ${n(m)}(${n(x1)}) + b gives b = ${n(b)}, so ${eqLine(m, b)}. Using the point's y-value ${n(y1)} as the intercept is the usual slip.`,
          };
        },
        (r) => {
          const A = int(r, 2, 7), B = nonZero(r, -7, 7), C = nonZero(r, -15, 15);
          if (Math.abs(B) === 1 || B % A === 0 || A % B === 0) again();
          return {
            prompt: `What is the slope of a line perpendicular to the line ${std(A, B)} = ${n(C)}?`,
            value: K.frac(B, A),
            explanation: `The given line has slope ${fr(-A, B)} (solve for y). A perpendicular slope is the negative reciprocal: ${fr(B, A)}. Stopping at ${fr(-A, B)} gives a PARALLEL line.`,
          };
        },
        (r) => {
          const m = pick(r, [-4, -3, -2, 2, 3, 4]), t = nonZero(r, -5, 5), x1 = nonZero(r, -6, 6);
          const y1 = m * t;
          if (x1 === t) again();
          return {
            prompt: `What is the x-intercept of the line y ${sgn(-y1)} = ${n(m)}(x ${sgn(-x1)})? Give the x-value only.`,
            value: x1 - t,
            explanation: `Set y = 0: ${n(-y1)} = ${n(m)}(x ${sgn(-x1)}), so x ${sgn(-x1)} = ${n(-t)} and x = ${n(x1 - t)}. Setting x = 0 instead finds the y-intercept.`,
          };
        },
        (r) => {
          const m = pick(r, [-5, -4, -3, -2, 2, 3, 4, 5]), b = nonZero(r, -9, 9), p = nonZero(r, -5, 5), q = int(r, -8, 8);
          if (q - m * p === b) again();
          return {
            prompt: `A line is parallel to ${eqLine(m, b)} and passes through the point ${pt(p, q)}. What is the y-intercept of this line? Give the y-value only.`,
            value: q - m * p,
            explanation: `Parallel lines share the slope ${n(m)}. Then ${n(q)} = ${n(m)}(${n(p)}) + b gives b = ${n(q)} − (${n(m * p)}) = ${n(q - m * p)}. Keeping the old intercept ${n(b)} ignores the new point.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const [a, b] = pick(r, [[2, 3], [3, 2], [3, 4], [4, 3], [2, 5], [5, 2], [3, 5], [5, 3]]);
          const s = pick(r, [1, -1]), t = pick(r, [-1, 1]), c = nonZero(r, -6, 6), q = int(r, -7, 7);
          const p = a * b * t;
          const line = (sign, num, den, k) => {
            if (k === 0) again();
            return `y = ${sign < 0 ? '−' : ''}(${num}/${den})x ${sgn(k)}`;
          };
          return {
            prompt: `Which line is perpendicular to ${line(s, a, b, c)} and passes through the point ${pt(p, q)}?`,
            ...mc(r, line(-s, b, a, q + s * b * b * t), [
              line(s, a, b, q - s * a * a * t),
              line(s, b, a, q - s * b * b * t),
              line(-s, a, b, q + s * a * a * t),
            ]),
            explanation: `The given slope is ${s < 0 ? '−' : ''}${a}/${b}, so the perpendicular slope is its negative reciprocal, ${-s < 0 ? '−' : ''}${b}/${a}. Through ${pt(p, q)}: ${n(q)} = ${-s < 0 ? '−' : ''}(${b}/${a})(${n(p)}) + k gives k = ${n(q + s * b * b * t)}. Keeping the same slope (parallel) or flipping without changing the sign are the usual slips.`,
          };
        },
        (r) => {
          const x1 = int(r, -6, 6), y1 = nonZero(r, -8, 8), dx = nonZero(r, -6, 6), dy = nonZero(r, -9, 9);
          const y2 = y1 + dy;
          if (y2 === 0 || dy % dx === 0 || (y1 * dx) % dy === 0) again();
          const [num, den] = K.reduce(x1 * dy - y1 * dx, dy);
          return {
            prompt: `A line passes through the points ${pt(x1, y1)} and ${pt(x1 + dx, y2)}. What is its x-intercept? Give the x-value only, as a fraction.`,
            value: K.frac(num, den),
            explanation: `Slope = ${n(dy)}/${n(dx)} = ${fr(dy, dx)}. From ${pt(x1, y1)}, y falls to 0 when ${n(-y1)} = (${fr(dy, dx)})(x ${sgn(-x1)}), so x = ${n(x1)} − (${n(y1)})(${fr(dx, dy)}) = ${fr(num, den)}. Solving for the y-intercept instead is the usual slip.`,
          };
        },
        (r) => {
          const m = pick(r, [-5, -4, -3, -2, 2, 3, 4, 5]), B = pick(r, [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]), C = nonZero(r, -12, 12), b = nonZero(r, -9, 9);
          return {
            prompt: `For what value of k is the line kx ${B < 0 ? '−' : '+'} ${Math.abs(B)}y = ${n(C)} parallel to the line ${eqLine(m, b)}?`,
            value: -m * B,
            explanation: `Solving kx ${B < 0 ? '−' : '+'} ${Math.abs(B)}y = ${n(C)} for y gives slope −k/${B < 0 ? `(${n(B)})` : B}. Parallel lines have equal slopes: −k/${B < 0 ? `(${n(B)})` : B} = ${n(m)}, so k = ${n(-m * B)}. Dropping the negative sign gives ${n(m * B)}.`,
          };
        },
        (r) => {
          const m = pick(r, [-4, -3, -2, 2, 3, 4]), t = nonZero(r, -4, 4), C = nonZero(r, -12, 12), b = nonZero(r, -9, 9);
          const B = m * t;
          if (Math.abs(B) === 1) again();
          return {
            prompt: `For what value of k is the line kx ${B < 0 ? '−' : '+'} ${Math.abs(B)}y = ${n(C)} perpendicular to the line ${eqLine(m, b)}?`,
            value: t,
            explanation: `The first line has slope −k/${B < 0 ? `(${n(B)})` : B}. A line perpendicular to slope ${n(m)} has slope ${fr(-1, m)}. So −k/${B < 0 ? `(${n(B)})` : B} = ${fr(-1, m)} and k = ${n(t)}. Setting the slopes EQUAL (the parallel condition) gives ${n(-m * B)}.`,
          };
        },
      ]) },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'systems-modeling',
    skillId: 'a2-systems-modeling',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const a = int(r, 20, 80), s = int(r, 30, 120), q = int(r, 3, 7), p = q + int(r, 3, 8);
          const N = a + s, Tt = p * a + q * s;
          return {
            prompt: `A school play sold ${N} tickets in all. Adult tickets cost $${p} each and student tickets cost $${q} each, and ticket sales totalled $${Tt}. How many adult tickets were sold?`,
            value: a,
            explanation: `Let a = adult and s = student tickets: a + s = ${N} and ${p}a + ${q}s = ${Tt}. Substituting s = ${N} − a gives ${p}a + ${q}(${N} − a) = ${Tt}, so ${p - q}a = ${Tt - q * N} and a = ${a}. (s = ${s} is the student count — answer the question asked.)`,
          };
        },
        (r) => {
          const a = int(r, 20, 80), s = int(r, 30, 120), q = int(r, 3, 7), p = q + int(r, 3, 8);
          const N = a + s, Tt = p * a + q * s;
          return {
            prompt: `A theater sold ${N} tickets for a total of $${Tt}. Adult tickets cost $${p} and student tickets cost $${q}. Let a be the number of adult tickets and s the number of student tickets. Which system of equations models the situation?`,
            ...mc(r, `a + s = ${N} and ${p}a + ${q}s = ${Tt}`, [
              `a + s = ${Tt} and ${p}a + ${q}s = ${N}`,
              `a + s = ${N} and ${q}a + ${p}s = ${Tt}`,
              `a + s = ${N} and ${p + q}(a + s) = ${Tt}`,
            ]),
            explanation: `One equation counts tickets (a + s = ${N}); the other counts dollars, each count times its own price (${p}a + ${q}s = ${Tt}). Swapping the two totals, or attaching each price to the wrong variable, are the usual slips.`,
          };
        },
        (r) => {
          const [small, big, v1, v2] = pick(r, [['nickels', 'dimes', 5, 10], ['dimes', 'quarters', 10, 25], ['nickels', 'quarters', 5, 25]]);
          const x = int(r, 6, 30), y = int(r, 6, 30);
          const cents = v1 * x + v2 * y;
          return {
            prompt: `A jar holds ${x + y} coins, all ${small} and ${big}. Together they are worth $${(cents / 100).toFixed(2)}. How many ${big} are in the jar?`,
            value: y,
            explanation: `Work in cents with n ${small} and m ${big}: n + m = ${x + y} and ${v1}n + ${v2}m = ${cents}. Substituting n = ${x + y} − m gives ${v2 - v1}m = ${cents - v1 * (x + y)}, so m = ${y}. Forgetting to weight each coin by its value is the usual slip.`,
          };
        },
        (r) => {
          const m1 = int(r, 10, 30), d = int(r, 3, 15), t = int(r, 3, 12), F2 = 5 * int(r, 0, 8);
          const m2 = m1 + d, F1 = F2 + d * t;
          return {
            prompt: `Gym A charges a $${F1} joining fee plus $${m1} per month. Gym B charges a $${F2} joining fee plus $${m2} per month. After how many months is the total cost of the two gyms the same?`,
            value: t,
            explanation: `Model each cost: y = ${F1} + ${m1}x and y = ${F2} + ${m2}x. Setting them equal, ${F1} + ${m1}x = ${F2} + ${m2}x gives ${F1 - F2} = ${d}x, so x = ${t} months.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const [c1, c2, c] = pick(r, [[20, 50, 30], [10, 40, 30], [25, 50, 40], [10, 60, 30], [20, 80, 35], [15, 45, 25], [30, 70, 60]]);
          const L = (c2 - c1) / K.gcd(c2 - c1, c2 - c) * int(r, 2, 6);
          const x = L * (c2 - c) / (c2 - c1);
          return {
            prompt: `A chemist mixes a ${c1}% acid solution with a ${c2}% acid solution to make ${L} liters of a ${c}% acid solution. How many liters of the ${c1}% solution are needed?`,
            value: x,
            explanation: `Let x and y be the liters of each: x + y = ${L} and ${c1 / 100}x + ${c2 / 100}y = ${c / 100}(${L}). Substituting y = ${L} − x gives ${n((c1 - c2) / 100)}x = ${n(Number(((c - c2) * L / 100).toFixed(2)))}, so x = ${x} liters (and y = ${L - x}). Reporting the other solution's amount is the usual slip.`,
          };
        },
        (r) => {
          const [c1, c2, c] = pick(r, [[20, 50, 30], [10, 40, 30], [25, 50, 40], [10, 60, 30], [20, 80, 35], [15, 45, 25], [30, 70, 60]]);
          const L = 20 * int(r, 1, 6);
          const amt = Number((c * L / 100).toFixed(2));
          const d = (v) => String(v / 100);
          return {
            prompt: `A ${c1}% salt solution is mixed with a ${c2}% salt solution to make ${L} liters of a ${c}% salt solution. Let x be the liters of the ${c1}% solution and y the liters of the ${c2}% solution. Which system models the situation?`,
            ...mc(r, `x + y = ${L} and ${d(c1)}x + ${d(c2)}y = ${amt}`, [
              `x + y = ${L} and ${d(c1)}x + ${d(c2)}y = ${d(c)}`,
              `x + y = ${amt} and ${d(c1)}x + ${d(c2)}y = ${L}`,
              `x + y = ${L} and ${c1}x + ${c2}y = ${c}`,
            ]),
            explanation: `Liters: x + y = ${L}. Salt: ${d(c1)}x + ${d(c2)}y must equal the salt in the mixture, ${d(c)} × ${L} = ${amt}. Leaving the right side as ${d(c)} (not multiplying by the ${L} liters) is the usual slip.`,
          };
        },
        (r) => {
          const [t1, t2] = pick(r, [[2, 3], [3, 4], [3, 5], [2, 5], [4, 5], [5, 7], [3, 7]]);
          const k = (t1 % 2 === 1 && t2 % 2 === 1) ? int(r, 1, 4) : 2 * int(r, 1, 3);
          const v = t2 * k, u = t1 * k, c = (v - u) / 2, b = (v + u) / 2, D = v * t1;
          const askBoat = int(r, 0, 1) === 1;
          return {
            prompt: `A boat travels ${D} km downstream in ${t1} hours. The return trip of ${D} km upstream, against the same current, takes ${t2} hours. What is the speed of the ${askBoat ? 'boat in still water' : 'current'}, in km/h?`,
            value: askBoat ? b : c,
            explanation: `With boat speed b and current c: ${t1}(b + c) = ${D} and ${t2}(b − c) = ${D}, so b + c = ${v} and b − c = ${u}. Adding gives b = ${b}; subtracting gives c = ${c}. The answer is ${askBoat ? b : c} km/h — the other value is the ${askBoat ? 'current' : 'boat'}.`,
          };
        },
        (r) => {
          const [i1, i2] = pick(r, [['burgers', 'orders of fries'], ['sandwiches', 'drinks'], ['notebooks', 'pens'], ['pizzas', 'salads']]);
          const x = int(r, 5, 12), y = int(r, 2, 6), a1 = int(r, 2, 5), b1 = int(r, 1, 5), a2 = int(r, 1, 5), b2 = int(r, 2, 6);
          if (a1 * b2 - a2 * b1 === 0 || x === y || (a1 === a2) || (b1 === b2)) again();
          return {
            prompt: `At a school fundraiser, ${a1} ${i1} and ${b1} ${i2} cost $${a1 * x + b1 * y}, while ${a2} ${i1} and ${b2} ${i2} cost $${a2 * x + b2 * y}. Every item of one kind has the same whole-dollar price. What is the price, in dollars, of one of the ${i1}?`,
            value: x,
            explanation: `Let x and y be the two prices: ${a1}x + ${b1}y = ${a1 * x + b1 * y} and ${a2}x + ${b2}y = ${a2 * x + b2 * y}. Eliminating y (multiply the first by ${b2} and the second by ${b1}, then subtract) gives ${a1 * b2 - a2 * b1}x = ${(a1 * b2 - a2 * b1) * x}, so x = ${x}. (Each of the ${i2} costs $${y} — answer for the ${i1}.)`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const [r1, r2] = pick(r, [[3, 5], [4, 6], [2, 5], [3, 8], [4, 7], [5, 8]]);
          const x = 500 * int(r, 2, 14), y = 500 * int(r, 2, 14);
          const I = (r1 * x + r2 * y) / 100;
          return {
            prompt: `An investor splits $${x + y} between two accounts. One pays ${r1}% simple interest per year and the other pays ${r2}% per year. After one year the two accounts have earned $${I} in interest altogether. How many dollars were invested at ${r1}%?`,
            value: x,
            explanation: `Let x be the amount at ${r1}% and y at ${r2}%: x + y = ${x + y} and ${r1 / 100}x + ${r2 / 100}y = ${I}. Substituting y = ${x + y} − x gives ${n((r1 - r2) / 100)}x = ${n(Number((I - r2 * (x + y) / 100).toFixed(2)))}, so x = ${x}. The other account holds $${y}.`,
          };
        },
        (r) => {
          const b = int(r, 2, 5), c = b + int(r, 1, 4), a = c + int(r, 1, 5);
          const W = (a - b) / K.gcd(a - b, c - b) * int(r, 2, 6);
          const nuts = W * (c - b) / (a - b);
          if (nuts === W - nuts) again();
          return {
            prompt: `A store mixes nuts that cost $${a} per pound with raisins that cost $${b} per pound to make ${W} pounds of trail mix worth $${c} per pound. How many pounds of nuts are in the mix?`,
            value: nuts,
            explanation: `Let n and m be the pounds of nuts and raisins: n + m = ${W} and ${a}n + ${b}m = ${c}(${W}) = ${c * W}. Substituting m = ${W} − n gives ${a - b}n = ${c * W - b * W}, so n = ${nuts}. Setting the cost equation equal to ${c} instead of ${c * W} is the usual slip.`,
          };
        },
        (r) => {
          const [t1, t2] = pick(r, [[2, 3], [3, 4], [3, 5], [2, 5], [4, 5], [5, 7]]);
          const k = (t1 % 2 === 1 && t2 % 2 === 1) ? int(r, 1, 4) : 2 * int(r, 1, 3);
          const D = t1 * t2 * k;
          return {
            prompt: `A boat travels ${D} km downstream in ${t1} hours and the same ${D} km back upstream in ${t2} hours. Let b be the boat's speed in still water and c the speed of the current, both in km/h. Which system models the situation?`,
            ...mc(r, `${t1}(b + c) = ${D} and ${t2}(b − c) = ${D}`, [
              `${t1}(b − c) = ${D} and ${t2}(b + c) = ${D}`,
              `(b + c)/${t1} = ${D} and (b − c)/${t2} = ${D}`,
              `${t1}b + c = ${D} and ${t2}b − c = ${D}`,
            ]),
            explanation: `Distance = rate × time. Downstream the current helps, so the rate is b + c for ${t1} hours; upstream it is b − c for ${t2} hours. Each product equals ${D}. Dividing the rate by the time, or multiplying only b by the time, are the usual slips.`,
          };
        },
        (r) => {
          const a = int(r, 20, 80), s = int(r, 30, 120), q = int(r, 3, 7), p = q + int(r, 3, 8);
          const N = a + s, Tt = p * a + q * s;
          return {
            prompt: `A concert sold ${N} tickets and collected $${Tt}. Floor tickets cost $${p} each and balcony tickets cost $${q} each. How many dollars of the total came from floor tickets?`,
            value: p * a,
            explanation: `Let f and b be the two counts: f + b = ${N} and ${p}f + ${q}b = ${Tt}. Solving, ${p - q}f = ${Tt - q * N}, so f = ${a} floor tickets. They brought in ${p} × ${a} = $${p * a}. Stopping at ${a} answers "how many tickets", not "how many dollars".`,
          };
        },
      ]) },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'matrix-operations',
    skillId: 'a2-matrix-operations',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const A = rand(r, 2, 2, -6, 9), B = rand(r, 2, 2, -6, 9), i = int(r, 0, 1), j = int(r, 0, 1);
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. What is the entry in row ${i + 1}, column ${j + 1} of A + B?`,
            value: A[i][j] + B[i][j],
            explanation: `Matrices add entry by entry. Row ${i + 1}, column ${j + 1}: ${n(A[i][j])} + (${n(B[i][j])}) = ${n(A[i][j] + B[i][j])}. Reading column ${i + 1}, row ${j + 1} instead picks the wrong entry.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -6, 9), B = rand(r, 2, 2, -6, 9);
          const op = (f) => A.map((row, i) => row.map((v, j) => f(v, B[i][j], i)));
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. Which matrix is A − B?`,
            ...mc(r, M(op((a, b) => a - b)), [M(op((a, b) => a + b)), M(op((a, b) => b - a)), M(op((a, b, i) => (i === 0 ? a - b : a + b)))]),
            explanation: `Subtract entry by entry: [[${n(A[0][0])} − (${n(B[0][0])}), ${n(A[0][1])} − (${n(B[0][1])})], [${n(A[1][0])} − (${n(B[1][0])}), ${n(A[1][1])} − (${n(B[1][1])})]]. Subtracting a negative entry adds it — that sign is the usual slip, as is computing B − A.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -5, 7), B = rand(r, 2, 2, -6, 9), k = int(r, 2, 4), i = int(r, 0, 1), j = int(r, 0, 1);
          if (A[i][j] === 0) again();
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. What is the entry in row ${i + 1}, column ${j + 1} of ${k}A + B?`,
            value: k * A[i][j] + B[i][j],
            explanation: `A scalar multiplies every entry: the entry of ${k}A is ${k}(${n(A[i][j])}) = ${n(k * A[i][j])}. Adding B's entry ${n(B[i][j])} gives ${n(k * A[i][j] + B[i][j])}. Adding before multiplying by ${k} is the usual slip.`,
          };
        },
        (r) => {
          const m = int(r, 1, 4), p = int(r, 1, 4), q = int(r, 2, 4);
          if (m === p) again();
          return {
            prompt: `Matrix A has dimensions ${m} × ${q} (${m} row${m > 1 ? 's' : ''}, ${q} columns) and matrix B has dimensions ${q} × ${p}. What are the dimensions of the product AB?`,
            ...mc(r, `${m} × ${p}`, [`${p} × ${m}`, `${q} × ${q}`, 'The product AB is not defined']),
            explanation: `AB is defined because A has ${q} columns and B has ${q} rows. The product takes A's rows and B's columns: ${m} × ${p}. The matching inner number ${q} disappears; it is not the size of the answer.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const A = rand(r, 2, 2, -4, 6), B = rand(r, 2, 2, -4, 6), i = int(r, 0, 1), j = int(r, 0, 1);
          if (A[i].includes(0) || B[0][j] === 0 || B[1][j] === 0) again();
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. What is the entry in row ${i + 1}, column ${j + 1} of the product AB?`,
            value: mmul(A, B)[i][j],
            explanation: `Multiply row ${i + 1} of A by column ${j + 1} of B: (${n(A[i][0])})(${n(B[0][j])}) + (${n(A[i][1])})(${n(B[1][j])}) = ${n(mmul(A, B)[i][j])}. Multiplying the two matching entries only, (${n(A[i][j])})(${n(B[i][j])}), is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -3, 5), B = rand(r, 2, 2, -3, 5);
          const entry = A.map((row, i) => row.map((v, j) => v * B[i][j]));
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. Which matrix is the product AB?`,
            ...mc(r, M(mmul(A, B)), [M(entry), M(mmul(B, A)), M(mmul(A, T(B)))]),
            explanation: `Each entry is a row of A times a column of B. Row 1: [${n(mmul(A, B)[0][0])}, ${n(mmul(A, B)[0][1])}]; row 2: [${n(mmul(A, B)[1][0])}, ${n(mmul(A, B)[1][1])}]. Multiplying matching entries, or computing BA (matrix multiplication is not commutative), are the usual slips.`,
          };
        },
        (r) => {
          const which = int(r, 0, 3);
          const m = int(r, 1, 4), nn = int(r, 1, 4);
          let p, q;
          if (which === 0) { p = nn; q = int(r, 1, 4); if (q === m) again(); }
          else if (which === 1) { q = m; p = int(r, 1, 4); if (p === nn) again(); }
          else if (which === 2) { p = nn; q = m; if (m === nn) again(); }
          else { p = int(r, 1, 4); q = int(r, 1, 4); if (p === nn || q === m) again(); }
          const opts = ['AB is defined, but BA is not', 'BA is defined, but AB is not', 'Both AB and BA are defined', 'Neither AB nor BA is defined'];
          return {
            prompt: `Matrix A has dimensions ${m} × ${nn} (rows × columns) and matrix B has dimensions ${p} × ${q}. Which statement is true?`,
            ...mc(r, opts[which], opts.filter((_, i) => i !== which)),
            explanation: `A product is defined when the columns of the left matrix equal the rows of the right one. AB: ${nn} columns against ${p} rows — ${nn === p ? 'defined' : 'not defined'}. BA: ${q} columns against ${m} rows — ${q === m ? 'defined' : 'not defined'}. Comparing rows with rows is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -5, 7), B = rand(r, 2, 2, -5, 7), k1 = int(r, 2, 4), k2 = int(r, 2, 3), i = int(r, 0, 1), j = int(r, 0, 1);
          if (A[i][j] === 0 || B[i][j] === 0) again();
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. What is the entry in row ${i + 1}, column ${j + 1} of ${k1}A − ${k2}B?`,
            value: k1 * A[i][j] - k2 * B[i][j],
            explanation: `${k1}(${n(A[i][j])}) − ${k2}(${n(B[i][j])}) = ${n(k1 * A[i][j])} − (${n(k2 * B[i][j])}) = ${n(k1 * A[i][j] - k2 * B[i][j])}. Losing the sign when subtracting a negative product is the usual slip.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const A = rand(r, 2, 3, -3, 5), B = rand(r, 3, 2, -3, 5), i = int(r, 0, 1), j = int(r, 0, 1);
          if (A[i].filter((v) => v === 0).length > 0) again();
          return {
            prompt: `${MAT}A = ${M(A)} is a 2 × 3 matrix and B = ${M(B)} is a 3 × 2 matrix. What is the entry in row ${i + 1}, column ${j + 1} of the product AB?`,
            value: mmul(A, B)[i][j],
            explanation: `Row ${i + 1} of A times column ${j + 1} of B: (${n(A[i][0])})(${n(B[0][j])}) + (${n(A[i][1])})(${n(B[1][j])}) + (${n(A[i][2])})(${n(B[2][j])}) = ${n(mmul(A, B)[i][j])}. Using a row of B instead of a column is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -4, 5);
          return {
            prompt: `${MAT}A = ${M(A)}. Which matrix is A² (the product AA)?`,
            ...mc(r, M(mmul(A, A)), [M(A.map((row) => row.map((v) => v * v))), M(A.map((row) => row.map((v) => 2 * v))), M(mmul(A, T(A)))]),
            explanation: `A² means A times A, rows by columns: row 1 gives [${n(mmul(A, A)[0][0])}, ${n(mmul(A, A)[0][1])}] and row 2 gives [${n(mmul(A, A)[1][0])}, ${n(mmul(A, A)[1][1])}]. Squaring each entry separately is the usual slip.`,
          };
        },
        (r) => {
          const x = nonZero(r, -6, 7), a = rand(r, 1, 3, -5, 6)[0], B = rand(r, 2, 2, -4, 6), j = int(r, 0, 1);
          if (B[0][j] === 0 || Math.abs(B[0][j]) === 1 || a[0] === 0 || B[1][j] === 0) again();
          const N = x * B[0][j] + a[0] * B[1][j];
          return {
            prompt: `${MAT}A = ${M([['x', a[0]], [a[1], a[2]]])} and B = ${M(B)}. The entry in row 1, column ${j + 1} of the product AB is ${n(N)}. What is the value of x?`,
            value: x,
            explanation: `Row 1 of A times column ${j + 1} of B: x(${n(B[0][j])}) + (${n(a[0])})(${n(B[1][j])}) = ${n(N)}, so ${n(B[0][j])}x = ${n(N - a[0] * B[1][j])} and x = ${n(x)}. Using row ${j + 1} of B instead of its column is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -3, 5), B = rand(r, 2, 2, -3, 5), i = int(r, 0, 1), j = int(r, 0, 1);
          const AB = mmul(A, B), BA = mmul(B, A);
          if (AB[i][j] === BA[i][j]) again();
          return {
            prompt: `${MAT}A = ${M(A)} and B = ${M(B)}. What is the entry in row ${i + 1}, column ${j + 1} of AB − BA?`,
            value: AB[i][j] - BA[i][j],
            explanation: `AB has ${n(AB[i][j])} in that position (row ${i + 1} of A times column ${j + 1} of B) and BA has ${n(BA[i][j])} (row ${i + 1} of B times column ${j + 1} of A). The difference is ${n(AB[i][j] - BA[i][j])}. Answering 0 assumes AB = BA, which is false for matrices in general.`,
          };
        },
      ]) },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'inverse-matrices',
    skillId: 'a2-inverse-matrices',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const A = rand(r, 2, 2, 1, 9);
          return {
            prompt: `${MAT}What is the determinant of the matrix ${M(A)}?`,
            value: det(A),
            explanation: `For [[a, b], [c, d]] the determinant is ad − bc: (${A[0][0]})(${A[1][1]}) − (${A[0][1]})(${A[1][0]}) = ${A[0][0] * A[1][1]} − ${A[0][1] * A[1][0]} = ${n(det(A))}. Adding the products (ad + bc) is the usual slip.`,
          };
        },
        (r) => {
          const singular = int(r, 0, 1) === 1;
          let A;
          if (singular) {
            const a = nonZero(r, -5, 6), b = nonZero(r, -5, 6), k = pick(r, [-3, -2, 2, 3]);
            A = [[a, b], [k * a, k * b]];
          } else {
            A = rand(r, 2, 2, -5, 7);
          }
          const D = det(A), S = A[0][0] * A[1][1] + A[0][1] * A[1][0];
          if (A.flat().includes(0) || S === 0 || (!singular && D === 0)) again();
          const yes = (v) => `Yes, because its determinant is ${n(v)}`;
          const no = (v) => `No, because its determinant is ${n(v)}`;
          return {
            prompt: `${MAT}Does the matrix ${M(A)} have an inverse?`,
            ...(singular ? mc(r, no(0), [yes(0), yes(S), no(S)]) : mc(r, yes(D), [no(D), no(0), yes(S)])),
            explanation: `The determinant is ad − bc = (${n(A[0][0])})(${n(A[1][1])}) − (${n(A[0][1])})(${n(A[1][0])}) = ${n(D)}. A matrix has an inverse exactly when its determinant is not 0, so the answer is ${singular ? 'no' : 'yes'}. Computing ad + bc = ${n(S)} is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -7, 8);
          if (A.flat().filter((v) => v < 0).length < 2 || A.flat().includes(0)) again();
          return {
            prompt: `${MAT}What is the determinant of the matrix ${M(A)}?`,
            value: det(A),
            explanation: `ad − bc = (${n(A[0][0])})(${n(A[1][1])}) − (${n(A[0][1])})(${n(A[1][0])}) = ${n(A[0][0] * A[1][1])} − (${n(A[0][1] * A[1][0])}) = ${n(det(A))}. Watch the signs: subtracting a negative product adds it.`,
          };
        },
        (r) => {
          const a = nonZero(r, -8, 9), b = nonZero(r, -8, 9), c = pick(r, [-6, -4, -3, -2, 2, 3, 4, 6]);
          if ((a * b) % c !== 0 || c === a || c === b) again();
          const k = a * b / c;
          return {
            prompt: `${MAT}For what value of k does the matrix ${M([['k', a], [b, c]])} have no inverse?`,
            value: k,
            explanation: `There is no inverse when the determinant is 0: k(${n(c)}) − (${n(a)})(${n(b)}) = 0, so ${n(c)}k = ${n(a * b)} and k = ${n(k)}. Setting ad + bc = 0 gives ${n(-k)}.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const a = nonZero(r, -5, 7), b = nonZero(r, -5, 7), c = nonZero(r, -5, 7);
          if ((1 + b * c) % a !== 0) again();
          const d = (1 + b * c) / a;
          if (d === 0 || d === a) again();
          return {
            prompt: `${MAT}Which matrix is the inverse of ${M([[a, b], [c, d]])}?`,
            ...mc(r, M([[d, -b], [-c, a]]), [M([[d, b], [c, a]]), M([[a, -b], [-c, d]]), M([[-a, b], [c, -d]])]),
            explanation: `The determinant is (${n(a)})(${n(d)}) − (${n(b)})(${n(c)}) = 1, so the inverse is simply [[d, −b], [−c, a]] = ${M([[d, -b], [-c, a]])}: swap the diagonal entries and negate the other two. Negating without swapping (or swapping without negating) is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, 1, 7), i = int(r, 0, 1), j = int(r, 0, 1);
          const D = det(A);
          if (D <= 1) again();
          const adj = [[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]];
          if (adj[i][j] % D === 0) again();
          return {
            prompt: `${MAT}A = ${M(A)}. What is the entry in row ${i + 1}, column ${j + 1} of the inverse matrix A⁻¹? Give a fraction in lowest terms.`,
            value: K.frac(adj[i][j], D),
            explanation: `det A = (${A[0][0]})(${A[1][1]}) − (${A[0][1]})(${A[1][0]}) = ${D}. A⁻¹ = (1/${D})${M(adj)}, so the entry is ${n(adj[i][j])}/${D} = ${fr(adj[i][j], D)}. Forgetting to swap the diagonal, or to divide by the determinant, are the usual slips.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -5, 7);
          const [[a, b], [c, d]] = A, D = det(A);
          if (D <= 1 || A.flat().includes(0) || a === d) again();
          const f = (m) => `(1/${D})${M(m)}`;
          return {
            prompt: `${MAT}Which expression is the inverse of ${M(A)}?`,
            ...mc(r, f([[d, -b], [-c, a]]), [f([[a, -b], [-c, d]]), f([[d, b], [c, a]]), `${D}${M([[d, -b], [-c, a]])}`]),
            explanation: `det = (${n(a)})(${n(d)}) − (${n(b)})(${n(c)}) = ${D}. The inverse is 1/det times [[d, −b], [−c, a]]: (1/${D})${M([[d, -b], [-c, a]])}. Multiplying by the determinant instead of dividing, or not swapping a and d, are the usual slips.`,
          };
        },
        (r) => {
          const a = nonZero(r, -7, 8), b = nonZero(r, -7, 8), c = pick(r, [-5, -4, -3, -2, 2, 3, 4, 5]), k = nonZero(r, -6, 7);
          const N = k * c - a * b;
          if (N === 0) again();
          return {
            prompt: `${MAT}For what value of k is the determinant of the matrix ${M([['k', a], [b, c]])} equal to ${n(N)}?`,
            value: k,
            explanation: `ad − bc = k(${n(c)}) − (${n(a)})(${n(b)}) = ${n(c)}k − (${n(a * b)}). Setting this equal to ${n(N)} gives ${n(c)}k = ${n(N + a * b)} and k = ${n(k)}.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const A = rand(r, 2, 2, -4, 6), x = nonZero(r, -5, 6), y = nonZero(r, -5, 6);
          const [[a, b], [c, d]] = A;
          if (det(A) === 0 || A.flat().includes(0) || x === y) again();
          const e = a * x + b * y, f = c * x + d * y;
          return {
            prompt: `${MAT}The system ${std(a, b)} = ${n(e)} and ${std(c, d)} = ${n(f)} is written as the matrix equation AX = B, with A = ${M(A)}, X = [[x], [y]] and B = ${M([[e], [f]])}. Solving with X = A⁻¹B, what is the value of x?`,
            value: x,
            explanation: `det A = ${n(det(A))}, so A⁻¹ = (1/${det(A) < 0 ? `(${n(det(A))})` : det(A)})${M([[d, -b], [-c, a]])}. The first row of A⁻¹B gives x = [(${n(d)})(${n(e)}) + (${n(-b)})(${n(f)})]/${det(A) < 0 ? `(${n(det(A))})` : det(A)} = ${n(d * e - b * f)}/${det(A) < 0 ? `(${n(det(A))})` : det(A)} = ${n(x)}. (y = ${n(y)}.) Multiplying in the order BA⁻¹ is not defined here.`,
          };
        },
        (r) => {
          const Ai = rand(r, 2, 2, -5, 6), e = nonZero(r, -6, 8), f = nonZero(r, -6, 8);
          if (Ai.flat().includes(0)) again();
          const X = mmul(Ai, [[e], [f]]);
          if (X[0][0] === X[1][0]) again();
          return {
            prompt: `${MAT}A system of equations is written as AX = B, where X = [[x], [y]]. The inverse of A is A⁻¹ = ${M(Ai)} and B = ${M([[e], [f]])}. What is the value of y?`,
            value: X[1][0],
            explanation: `X = A⁻¹B. The second row gives y = (${n(Ai[1][0])})(${n(e)}) + (${n(Ai[1][1])})(${n(f)}) = ${n(X[1][0])}. The first row gives x = ${n(X[0][0])} — reporting it for y is the usual slip.`,
          };
        },
        (r) => {
          const A = rand(r, 2, 2, -5, 7);
          const [[a, b], [c, d]] = A, D = det(A);
          if (D === 0 || Math.abs(D) === 1 || A.flat().includes(0) || a === d) again();
          if ([a, b, c, d].some((v) => v % D === 0)) again();
          const f = (m) => M(m.map((row) => row.map((v) => fr(v, D))));
          return {
            prompt: `${MAT}Which matrix is the inverse of ${M(A)}?`,
            ...mc(r, f([[d, -b], [-c, a]]), [M([[d, -b], [-c, a]]), f([[a, -b], [-c, d]]), f([[d, b], [c, a]])]),
            explanation: `det = (${n(a)})(${n(d)}) − (${n(b)})(${n(c)}) = ${n(D)}. Swap a and d, negate b and c, then divide every entry by ${n(D)}: ${f([[d, -b], [-c, a]])}. Leaving out the division by the determinant is the usual slip.`,
          };
        },
        (r) => {
          const a = nonZero(r, -5, 7), b = nonZero(r, -5, 7), c = nonZero(r, -5, 7), s = pick(r, [1, -1]), i = int(r, 0, 1), j = int(r, 0, 1);
          if ((s + b * c) % a !== 0) again();
          const d = (s + b * c) / a;
          if (d === 0 || d === a) again();
          const inv = [[d, -b], [-c, a]].map((row) => row.map((v) => v * s));   // inverse of [[a, b], [c, d]]
          const back = [[a, b], [c, d]];
          return {
            prompt: `${MAT}The inverse of a matrix A is A⁻¹ = ${M(inv)}. What is the entry in row ${i + 1}, column ${j + 1} of A?`,
            value: back[i][j],
            explanation: `A is the inverse of A⁻¹. det(A⁻¹) = (${n(inv[0][0])})(${n(inv[1][1])}) − (${n(inv[0][1])})(${n(inv[1][0])}) = ${n(det(inv))}, so A = (1/${det(inv) < 0 ? `(${n(det(inv))})` : det(inv)}) times the swapped-and-negated matrix = ${M(back)}. The entry is ${n(back[i][j])}. Forgetting the factor 1/det when it is −1 flips every sign.`,
          };
        },
      ]) },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'quadratic-discriminant',
    skillId: 'a2-quadratic-discriminant',
    tiers: (() => {
      const TYPES = ['Two distinct real solutions', 'Exactly one real solution (a repeated root)', 'Two complex (non-real) solutions', 'One real solution and one complex solution'];
      const typeOf = (D) => (D > 0 ? TYPES[0] : D === 0 ? TYPES[1] : TYPES[2]);
      const KIND = ['Two rational solutions', 'Two irrational solutions', 'One rational solution (a repeated root)', 'Two complex (non-real) solutions'];
      const isSq = (v) => v >= 0 && Number.isInteger(Math.sqrt(v));
      return [
        { difficulty: 2, gen: forms([
          (r) => {
            const b = nonZero(r, -9, 9), c = int(r, 1, 9);
            return {
              prompt: `What is the value of the discriminant of ${P([1, b, c])} = 0?`,
              value: b * b - 4 * c,
              explanation: `The discriminant is b² − 4ac with a = 1, b = ${n(b)}, c = ${c}: (${n(b)})² − 4(1)(${c}) = ${b * b} − ${4 * c} = ${n(b * b - 4 * c)}. A square is never negative, so (${n(b)})² = ${b * b} — writing −${b * b} is the usual slip when b is negative.`,
            };
          },
          (r) => {
            const a = int(r, 1, 4), b = nonZero(r, -6, 6), c = int(r, 1, 9);
            const D = b * b - 4 * a * c;
            if (D >= 0) again();
            return {
              prompt: `How many solutions, and of what type, does ${P([a, b, c])} = 0 have?`,
              ...mc(r, typeOf(D), TYPES.filter((t) => t !== typeOf(D))),
              explanation: `b² − 4ac = (${n(b)})² − 4(${a})(${c}) = ${n(D)}. A negative discriminant means the square root in the quadratic formula is imaginary: two complex (non-real) solutions, a conjugate pair. Complex solutions of a real quadratic always come in pairs.`,
            };
          },
          (r) => {
            const a = int(r, 2, 5), b = nonZero(r, -9, 9), c = -int(r, 1, 7);
            return {
              prompt: `What is the value of the discriminant of ${P([a, b, c])} = 0?`,
              value: b * b - 4 * a * c,
              explanation: `b² − 4ac = (${n(b)})² − 4(${a})(${n(c)}) = ${b * b} + ${-4 * a * c} = ${b * b - 4 * a * c}. Because c is negative, −4ac is positive; subtracting ${-4 * a * c} instead is the usual slip.`,
            };
          },
          (r) => {
            const s = int(r, 1, 3), t = nonZero(r, -5, 5);
            const D = (2 * s * t) ** 2 - 4 * s * s * t * t;
            return {
              prompt: `How many solutions, and of what type, does ${P([s * s, 2 * s * t, t * t])} = 0 have?`,
              ...mc(r, typeOf(D), TYPES.filter((x) => x !== typeOf(D))),
              explanation: `b² − 4ac = (${n(2 * s * t)})² − 4(${s * s})(${t * t}) = ${4 * s * s * t * t} − ${4 * s * s * t * t} = 0. A zero discriminant means the ± term vanishes: exactly one real solution, a repeated root.`,
            };
          },
        ]) },
        { difficulty: 3, gen: forms([
          (r) => {
            const a = int(r, 1, 3), b1 = nonZero(r, -8, 8), b2 = nonZero(r, -8, 8), c2 = nonZero(r, -9, 9);
            if (b1 === b2) again();
            const D = (b1 - b2) ** 2 + 4 * a * c2;
            if (D === 0) again();
            return {
              prompt: `How many solutions, and of what type, does the equation ${P([a, b1, 0])} = ${P([b2, c2])} have?`,
              ...mc(r, typeOf(D), TYPES.filter((t) => t !== typeOf(D))),
              explanation: `First write it in standard form: ${P([a, b1 - b2, -c2])} = 0. Then b² − 4ac = (${n(b1 - b2)})² − 4(${a})(${n(-c2)}) = ${n(D)}, which is ${D > 0 ? 'positive: two distinct real solutions' : 'negative: two complex solutions'}. Using b = ${n(b1)} and c = ${n(c2)} without rearranging is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 1, 3), b = nonZero(r, -9, 9);
            if (a === 1 && b % 2 !== 0) again();
            return {
              prompt: `For what value of k does the equation ${P([a, b, 0])} + k = 0 have exactly one real solution?`,
              value: K.frac(b * b, 4 * a),
              explanation: `Exactly one real solution means b² − 4ac = 0: (${n(b)})² − 4(${a})k = 0, so ${4 * a}k = ${b * b} and k = ${fr(b * b, 4 * a)}. Forgetting the 4 gives ${fr(b * b, a)}.`,
            };
          },
          (r) => {
            const a = int(r, 2, 5), b = nonZero(r, -9, 9), c = int(r, 1, 8);
            return {
              prompt: `What is the value of the discriminant of the equation ${P([a, b, 0])} = ${c}, once it is written in standard form?`,
              value: b * b + 4 * a * c,
              explanation: `Standard form is ${P([a, b, -c])} = 0, so c = ${n(-c)}. b² − 4ac = (${n(b)})² − 4(${a})(${n(-c)}) = ${b * b} + ${4 * a * c} = ${b * b + 4 * a * c}. Using c = ${c} (not moving it across) gives ${n(b * b - 4 * a * c)}.`,
            };
          },
          (r) => {
            const want = int(r, 0, 1);
            const a = int(r, 1, 4), b = nonZero(r, -9, 9), c = nonZero(r, -8, 8);
            const D = b * b - 4 * a * c;
            if (D <= 0 || (want === 0) !== isSq(D)) again();
            return {
              prompt: `The coefficients of ${P([a, b, c])} = 0 are integers. Which describes its solutions?`,
              ...mc(r, KIND[want], KIND.filter((_, i) => i !== want)),
              explanation: `b² − 4ac = (${n(b)})² − 4(${a})(${n(c)}) = ${D}. It is positive, so there are two real solutions; ${isSq(D) ? `${D} is a perfect square (√${D} = ${Math.sqrt(D)}), so the square root disappears and both are rational` : `${D} is not a perfect square, so √${D} stays in the answer and both are irrational`}.`,
            };
          },
        ]) },
        { difficulty: 4, gen: forms([
          (r) => {
            const u = pick(r, [1, 2, 3, 5]), s = int(r, 1, 3), t = int(r, 1, 4);
            const a = s * s * u, c = t * t * u;
            if (a === 1 || a === c) again();
            return {
              prompt: `For what positive value of k does the equation ${a}x² + kx + ${c} = 0 have exactly one real solution?`,
              value: 2 * s * t * u,
              explanation: `Set the discriminant to 0: k² − 4(${a})(${c}) = 0, so k² = ${4 * a * c} and k = ±${2 * s * t * u}. The positive value is ${2 * s * t * u}. Forgetting the 4 (k² = ${a * c}) gives ${s * t * u}.`,
            };
          },
          (r) => {
            const b = 2 * nonZero(r, -6, 6), two = int(r, 0, 1) === 1;
            const m = b * b / 4;
            const good = two ? `k < ${m}` : `k > ${m}`;
            return {
              prompt: `For which values of k does the equation ${P([1, b, 0])} + k = 0 have ${two ? 'two distinct real solutions' : 'no real solutions'}?`,
              ...mc(r, good, [`k < ${m}`, `k > ${m}`, `k < ${b * b}`, `k > ${b * b}`].filter((o) => o !== good)),
              explanation: `The discriminant is (${n(b)})² − 4(1)k = ${b * b} − 4k. ${two ? `Two distinct real solutions need ${b * b} − 4k > 0, so 4k < ${b * b} and k < ${m}` : `No real solutions needs ${b * b} − 4k < 0, so 4k > ${b * b} and k > ${m}`}. Forgetting to divide by 4, or turning the inequality the wrong way, are the usual slips.`,
            };
          },
          (r) => {
            const b = nonZero(r, -9, 9), c = nonZero(r, -6, 6);
            if (Math.abs(c) === 1 && b % 2 === 0) again();
            return {
              prompt: `For what value of k does the equation kx² ${sgn(b)}x ${sgn(c)} = 0 have exactly one real solution?`.replace(/([+−]) 1x/, '$1 x'),
              value: K.frac(b * b, 4 * c),
              explanation: `Set b² − 4ac = 0 with a = k: (${n(b)})² − 4k(${n(c)}) = 0, so ${n(4 * c)}k = ${b * b} and k = ${fr(b * b, 4 * c)}. Losing the sign of c is the usual slip.`,
            };
          },
          (r) => {
            const b = 2 * nonZero(r, -6, 6), c = nonZero(r, -9, 9);
            if (c === b * b / 4) again();
            return {
              prompt: `For what value of k does the equation ${P([1, b, c])} = k have exactly one real solution?`,
              value: c - b * b / 4,
              explanation: `Standard form is ${P([1, b, 0])} + (${n(c)} − k) = 0. One solution needs (${n(b)})² − 4(${n(c)} − k) = 0, so ${n(c)} − k = ${b * b / 4} and k = ${n(c - b * b / 4)}. (This k is the minimum value of the left side.) Leaving k out of the constant term gives the wrong discriminant.`,
            };
          },
        ]) },
      ];
    })(),
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'quadratic-transformations',
    skillId: 'a2-quadratic-transformations',
    tiers: (() => {
      const aS = (a) => (a === 1 ? '' : a === -1 ? '−' : n(a));
      const vf = (a, h, k) => `${typeof a === 'string' ? a : aS(a)}${h === 0 ? 'x²' : `(x ${sgn(-h)})²`}${k === 0 ? '' : ` ${sgn(k)}`}`;
      const H = (h) => (h > 0 ? `right ${h}` : `left ${-h}`);
      const V = (k) => (k > 0 ? `up ${k}` : `down ${-k}`);
      const u = (v) => (Math.abs(v) === 1 ? 'unit' : 'units');
      const shift = (h, k) => `Shifted ${H(h)} ${u(h)} and ${V(k)} ${u(k)}`;
      const BASE = 'the graph of f(x) = x²';
      return [
        { difficulty: 2, gen: forms([
          (r) => {
            const h = nonZero(r, -8, 8), k = nonZero(r, -8, 8);
            return {
              prompt: `The graph of g(x) = ${vf(1, h, k)} is a transformation of ${BASE}. Which describes it?`,
              ...mc(r, shift(h, k), [shift(-h, k), shift(h, -k), shift(-h, -k)]),
              explanation: `In (x − h)² + k the graph moves h units horizontally and k units vertically. Here h = ${n(h)} and k = ${n(k)}: ${H(h)} and ${V(k)}. The horizontal shift goes the OPPOSITE way to the sign inside the parentheses — that is the usual slip.`,
            };
          },
          (r) => {
            const h = nonZero(r, -8, 8), k = nonZero(r, -8, 8);
            if (Math.abs(h) === Math.abs(k)) again();
            return {
              prompt: `The graph of f(x) = x² is shifted ${H(h)} ${u(h)} and ${V(k)} ${u(k)}. Which function is the result?`,
              ...mc(r, `g(x) = ${vf(1, h, k)}`, [`g(x) = ${vf(1, -h, k)}`, `g(x) = ${vf(1, h, -k)}`, `g(x) = ${vf(1, k, h)}`]),
              explanation: `A shift ${H(h)} replaces x with (x ${sgn(-h)}); a shift ${V(k)} adds ${n(k)} outside: g(x) = ${vf(1, h, k)}. Writing (x ${sgn(h)}) for a shift ${H(h)} is the usual slip.`,
            };
          },
          (r) => {
            const a = pick(r, [-3, -2, 2, 3, 4]), h = nonZero(r, -8, 8), k = nonZero(r, -8, 8);
            if (Math.abs(h) === Math.abs(k)) again();
            return {
              prompt: `What is the vertex of the graph of g(x) = ${vf(a, h, k)}?`,
              ...mc(r, pt(h, k), [pt(-h, k), pt(k, h), pt(-h, -k)]),
              explanation: `Vertex form a(x − h)² + k has its vertex at (h, k). Here (x ${sgn(-h)}) means h = ${n(h)}, and k = ${n(k)}: the vertex is ${pt(h, k)}. Taking the sign inside the parentheses at face value gives ${pt(-h, k)}.`,
            };
          },
          (r) => {
            const mag = pick(r, [2, 3, 4, 5, '1/2', '1/3', '1/4']), neg = int(r, 0, 1) === 1;
            const narrow = typeof mag === 'number';
            const str = narrow ? `${neg ? '−' : ''}${mag}` : `${neg ? '−' : ''}(${mag})`;
            const o = (down, nar) => `Opens ${down ? 'downward' : 'upward'} and is ${nar ? 'narrower' : 'wider'} than the graph of f`;
            return {
              prompt: `How does the graph of g(x) = ${str}x² compare with ${BASE}?`,
              ...mc(r, o(neg, narrow), [o(!neg, narrow), o(neg, !narrow), o(!neg, !narrow)]),
              explanation: `The coefficient is ${str}. Its sign is ${neg ? 'negative, so the parabola is reflected over the x-axis and opens downward' : 'positive, so the parabola opens upward'}. Its size is ${narrow ? 'greater than 1, a vertical stretch, so the graph is narrower' : 'between 0 and 1, a vertical compression, so the graph is wider'}. Thinking a bigger coefficient makes a wider graph is the usual slip.`,
            };
          },
        ]) },
        { difficulty: 3, gen: forms([
          (r) => {
            const a = int(r, 2, 5), h = nonZero(r, -7, 7), k = nonZero(r, -7, 7), refl = int(r, 0, 1) === 1;
            const s = refl ? -a : a;
            return {
              prompt: `The graph of f(x) = x² is ${refl ? 'reflected over the x-axis, ' : ''}stretched vertically by a factor of ${a}, then shifted ${H(h)} ${u(h)} and ${V(k)} ${u(k)}. Which function is the result?`,
              ...mc(r, `g(x) = ${vf(s, h, k)}`, [`g(x) = ${vf(s, -h, k)}`, `g(x) = ${vf(-s, h, k)}`, `g(x) = ${vf(s, h, -k)}`]),
              explanation: `${refl ? `The reflection and the stretch give −${a}x²` : `The stretch gives ${a}x²`}; the shift ${H(h)} replaces x with (x ${sgn(-h)}) and the shift ${V(k)} adds ${n(k)}: g(x) = ${vf(s, h, k)}. The sign inside the parentheses is opposite to the direction of the shift.`,
            };
          },
          (r) => {
            const [mag, word, wrongWord] = pick(r, [[2, 'stretch by a factor of 2', 'compression by a factor of 1/2'], [3, 'stretch by a factor of 3', 'compression by a factor of 1/3'],
              ['(1/2)', 'compression by a factor of 1/2', 'stretch by a factor of 2'], ['(1/3)', 'compression by a factor of 1/3', 'stretch by a factor of 3']]);
            const neg = int(r, 0, 1) === 1, h = nonZero(r, -7, 7), k = nonZero(r, -7, 7);
            const d = (w, hh, kk) => `${neg ? 'Reflection over the x-axis, vertical' : 'Vertical'} ${w}, shift ${H(hh)} and ${V(kk)}`;
            return {
              prompt: `Which describes how the graph of g(x) = ${vf(`${neg ? '−' : ''}${mag}`, h, k)} is obtained from ${BASE}?`,
              ...mc(r, d(word, h, k), [d(wrongWord, h, k), d(word, -h, k), d(word, h, -k)]),
              explanation: `The coefficient ${neg ? '−' : ''}${mag} gives ${neg ? 'a reflection over the x-axis and ' : ''}a vertical ${word}. (x ${sgn(-h)}) shifts the graph ${H(h)}, and ${sgn(k)} shifts it ${V(k)}. Reading (x ${sgn(-h)}) as a shift ${H(-h)} is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 2, 4), h = nonZero(r, -5, 5), k = nonZero(r, -9, 9), p = int(r, -4, 6);
            if (p === h || p === 0) again();
            return {
              prompt: `The graph of f(x) = x² is stretched vertically by a factor of ${a}, then shifted ${H(h)} ${u(h)} and ${V(k)} ${u(k)} to give the graph of g. What is g(${n(p)})?`,
              value: a * (p - h) ** 2 + k,
              explanation: `g(x) = ${vf(a, h, k)}. So g(${n(p)}) = ${a}(${n(p)} ${sgn(-h)})² ${sgn(k)} = ${a}(${n(p - h)})² ${sgn(k)} = ${a * (p - h) ** 2} ${sgn(k)} = ${n(a * (p - h) ** 2 + k)}. Using (x ${sgn(h)}) for the shift ${H(h)} is the usual slip.`,
            };
          },
          (r) => {
            const a = pick(r, [-4, -3, -2, -1, 2, 3, 4]), h = nonZero(r, -8, 8), k = nonZero(r, -9, 9);
            if (Math.abs(h) === Math.abs(k)) again();
            const o = (max, v) => `It has a ${max ? 'maximum' : 'minimum'} value of ${n(v)}`;
            return {
              prompt: `Which is true of the function g(x) = ${vf(a, h, k)}?`,
              ...mc(r, o(a < 0, k), [o(a > 0, k), o(a < 0, h), o(a < 0, -h)]),
              explanation: `The vertex is ${pt(h, k)}. Because a = ${n(a)} is ${a < 0 ? 'negative, the parabola opens downward and the vertex is the highest point: a maximum' : 'positive, the parabola opens upward and the vertex is the lowest point: a minimum'} value of ${n(k)} (the y-coordinate, not the x-coordinate ${n(h)}).`,
            };
          },
        ]) },
        { difficulty: 4, gen: forms([
          (r) => {
            const b = 2 * nonZero(r, -6, 6), c = nonZero(r, -9, 12);
            const h = -b / 2, k = c - b * b / 4;
            if (k === 0 || k === c + b * b / 4) again();
            return {
              prompt: `The graph of g(x) = ${P([1, b, c])} is a translation of ${BASE}. Which describes it?`,
              ...mc(r, shift(h, k), [shift(-h, k), shift(-b, c), shift(h, c + b * b / 4)]),
              explanation: `Complete the square: ${P([1, b, c])} = (x ${sgn(b / 2)})² − ${b * b / 4} ${sgn(c)} = ${vf(1, h, k)}. The vertex is ${pt(h, k)}: ${H(h)} and ${V(k)}. Reading the shifts straight off b = ${n(b)} and c = ${n(c)} is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 2, 4), h = nonZero(r, -5, 5), k = nonZero(r, -9, 9), refl = int(r, 0, 1) === 1;
            const s = refl ? -a : a;
            return {
              prompt: `The graph of f(x) = x² is ${refl ? 'reflected over the x-axis, ' : ''}stretched vertically by a factor of ${a}, then shifted ${H(h)} ${u(h)} and ${V(k)} ${u(k)} to give the graph of g. What is the y-intercept of g? Give the y-value only.`,
              value: s * h * h + k,
              explanation: `g(x) = ${vf(s, h, k)}. The y-intercept is g(0) = ${n(s)}(${n(-h)})² ${sgn(k)} = ${n(s * h * h)} ${sgn(k)} = ${n(s * h * h + k)}. Answering ${n(k)} gives the vertex's y-value, not the y-intercept.`,
            };
          },
          (r) => {
            const a = pick(r, [-4, -3, -2, 2, 3, 4]), h = nonZero(r, -6, 6), k = nonZero(r, -8, 8), d = pick(r, [-2, -1, 1, 2]);
            const p = h + d, q = a * d * d + k;
            return {
              prompt: `A parabola is a transformation of the graph of f(x) = x². Its vertex is ${pt(h, k)} and it passes through the point ${pt(p, q)}. Which function has this graph?`,
              ...mc(r, `g(x) = ${vf(a, h, k)}`, [`g(x) = ${vf(a, -h, k)}`, `g(x) = ${vf(1, h, k)}`, `g(x) = ${vf(-a, h, k)}`]),
              explanation: `Start from g(x) = a(x ${sgn(-h)})² ${sgn(k)} and substitute ${pt(p, q)}: ${n(q)} = a(${n(d)})² ${sgn(k)}, so ${d * d === 1 ? '' : d * d}a = ${n(q - k)} and a = ${n(a)}. Assuming a = 1 because the parent is x² is the usual slip.`,
            };
          },
          (r) => {
            const a = pick(r, [-3, -2, 2, 3]), h = nonZero(r, -7, 7), k = nonZero(r, -8, 8), m = nonZero(r, -6, 6);
            return {
              prompt: `The graph of g(x) = ${vf(a, h, k)} is reflected over the x-axis and then shifted ${V(m)} ${u(m)}. What is the vertex of the new graph?`,
              ...mc(r, pt(h, -k + m), [pt(h, k + m), pt(-h, -k + m), pt(h, -k - m)]),
              explanation: `The vertex starts at ${pt(h, k)}. Reflecting over the x-axis changes the sign of y: ${pt(h, -k)}. Shifting ${V(m)} gives ${pt(h, -k + m)}. Changing the sign of x instead reflects over the y-axis, and shifting before reflecting gives ${pt(h, -k - m)}.`,
            };
          },
        ]) },
      ];
    })(),
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'polynomial-operations',
    skillId: 'a2-polynomial-operations',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const p1 = [nonZero(r, -5, 6), nonZero(r, -6, 6), 0, nonZero(r, -9, 9)];
          const p2 = [nonZero(r, -5, 6), nonZero(r, -6, 6), nonZero(r, -9, 9), nonZero(r, -9, 9)];
          const S = p1.map((v, i) => v + p2[i]);
          if (S[0] === 0) again();
          return {
            prompt: `Add and simplify: (${P(p1)}) + (${P(p2)}).`,
            ...mc(r, P(S), [P([S[0], p1[1] - p2[1], S[2], S[3]]), P([S[0], S[1], 0, S[3]]), P([S[0], S[1], S[2], p1[3] - p2[3]])]),
            explanation: `Combine like terms: x³: ${n(p1[0])} + (${n(p2[0])}) = ${n(S[0])}; x²: ${n(p1[1])} + (${n(p2[1])}) = ${n(S[1])}; x: ${n(p2[2])} (the first polynomial has no x term); constants: ${n(p1[3])} + (${n(p2[3])}) = ${n(S[3])}. Dropping the lone x term or slipping a sign are the usual errors.`,
          };
        },
        (r) => {
          const p1 = [nonZero(r, -5, 6), nonZero(r, -7, 7), nonZero(r, -9, 9), nonZero(r, -9, 9)];
          const p2 = [nonZero(r, -5, 6), -int(r, 1, 7), nonZero(r, -9, 9), nonZero(r, -9, 9)];
          return {
            prompt: `What is the coefficient of x² in the simplified form of (${P(p1)}) − (${P(p2)})?`,
            value: p1[1] - p2[1],
            explanation: `Subtracting distributes the negative to every term of the second polynomial. The x² terms: ${n(p1[1])}x² − (${n(p2[1])}x²) = ${n(p1[1] - p2[1])}x². Adding the coefficients as written (${n(p1[1])} + (${n(p2[1])}) = ${n(p1[1] + p2[1])}) forgets to distribute the negative.`,
          };
        },
        (r) => {
          const a = nonZero(r, -7, 7), b = int(r, 2, 5), c = nonZero(r, -7, 7);
          return {
            prompt: `Multiply and simplify: (${P([1, 0, a])})(${P([b, c])}).`,
            ...mc(r, P([b, c, a * b, a * c]), [P([b, 0, 0, a * c]), P([b + c, a * b, a * c]), P([b, c, a * b, -a * c])]),
            explanation: `Distribute each term: x²·${b}x = ${b}x³, x²·(${n(c)}) = ${n(c)}x², ${n(a)}·${b}x = ${n(a * b)}x, ${n(a)}·(${n(c)}) = ${n(a * c)}. Result: ${P([b, c, a * b, a * c])}. Multiplying only the first terms and the last terms is the usual slip.`,
          };
        },
        (r) => {
          const d1 = int(r, 2, 4), d2 = int(r, 2, 3);
          const p1 = Array.from({ length: d1 + 1 }, (_, i) => (i === 0 ? int(r, 2, 5) : int(r, -6, 6)));
          const p2 = Array.from({ length: d2 + 1 }, (_, i) => (i === 0 ? nonZero(r, -4, 4) : int(r, -6, 6)));
          if (p1[d1] === 0 || p2[d2] === 0 || d1 === d2) again();
          return {
            prompt: `What is the degree of the product (${P(p1)})(${P(p2)})?`,
            value: d1 + d2,
            explanation: `The highest-power term of the product comes from multiplying the two leading terms: x${SUP[d1]} · x${SUP[d2]} = x${SUP[d1 + d2]}. Degrees ADD when polynomials multiply, so the degree is ${d1 + d2}. Multiplying the degrees (${d1 * d2}) or taking the larger one (${Math.max(d1, d2)}) are the usual slips.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const a = int(r, 2, 4), b = nonZero(r, -6, 6), c = nonZero(r, -6, 6), d = nonZero(r, -7, 7);
          const good = pmul([a, b], [1, c, d]);
          return {
            prompt: `Multiply and simplify: (${P([a, b])})(${P([1, c, d])}).`,
            ...mc(r, P(good), [P([a, a * c, a * d, b * d]), P(pmul([a, -b], [1, c, d])), P([good[0], good[1], good[2], b + d])]),
            explanation: `${a}x(${P([1, c, d])}) = ${P([a, a * c, a * d, 0])} and ${n(b)}(${P([1, c, d])}) = ${P([b, b * c, b * d])}. Adding like terms: ${P(good)}. Distributing ${n(b)} to the last term only is the usual slip.`,
          };
        },
        (r) => {
          const a = int(r, 2, 5), b = nonZero(r, -6, 6), c = int(r, 2, 4), d = nonZero(r, -6, 6), e = nonZero(r, -7, 7);
          return {
            prompt: `What is the coefficient of x² in the simplified form of (${P([a, b])})(${P([c, d, e])})?`,
            value: a * d + b * c,
            explanation: `Two products make x² terms: ${a}x · (${n(d)}x) = ${n(a * d)}x² and (${n(b)}) · ${c}x² = ${n(b * c)}x². Together: ${n(a * d + b * c)}x². Counting only one of the two products is the usual slip.`,
          };
        },
        (r) => {
          const k1 = int(r, 2, 5), k2 = int(r, 2, 5);
          const p1 = [nonZero(r, -4, 5), nonZero(r, -7, 7), nonZero(r, -8, 8)], p2 = [nonZero(r, -4, 5), nonZero(r, -7, 7), nonZero(r, -8, 8)];
          if (p2[1] > 0 && int(r, 0, 1)) p2[1] = -p2[1];
          return {
            prompt: `What is the coefficient of x in the simplified form of ${k1}(${P(p1)}) − ${k2}(${P(p2)})?`,
            value: k1 * p1[1] - k2 * p2[1],
            explanation: `The x terms: ${k1}(${n(p1[1])}x) − ${k2}(${n(p2[1])}x) = ${n(k1 * p1[1])}x − (${n(k2 * p2[1])}x) = ${n(k1 * p1[1] - k2 * p2[1])}x. The −${k2} multiplies EVERY term of the second polynomial, signs included.`,
          };
        },
        (r) => {
          const p1 = [nonZero(r, -5, 5), int(r, -6, 6), nonZero(r, -8, 8)], p2 = [int(r, 2, 6), 0, int(r, -6, 6), nonZero(r, -8, 8)];
          if (Math.abs(p1[0]) === 1) again();
          return {
            prompt: `What is the leading coefficient of the product (${P(p1)})(${P(p2)})?`,
            value: p1[0] * p2[0],
            explanation: `The leading term of a product is the product of the leading terms: (${n(p1[0])}x²)(${p2[0]}x³) = ${n(p1[0] * p2[0])}x⁵. The leading coefficient is ${n(p1[0] * p2[0])}. Adding the two coefficients (${n(p1[0] + p2[0])}) is the usual slip.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const a = nonZero(r, -5, 5), b = nonZero(r, -6, 6), c = nonZero(r, -5, 5), d = nonZero(r, -6, 6);
          const good = pmul([1, a, b], [1, c, d]);
          if (a + c === 0) again();
          return {
            prompt: `Multiply and simplify: (${P([1, a, b])})(${P([1, c, d])}).`,
            ...mc(r, P(good), [P([1, a + c, b + d, a * d + b * c, b * d]), P([1, a * c, good[2], good[3], good[4]]), P([good[0], good[1], good[2], good[3], b + d])]),
            explanation: `Multiply each term of the first by each term of the second and collect: x⁴; x³: ${n(c)} + (${n(a)}) = ${n(a + c)}; x²: ${n(d)} + (${n(a * c)}) + (${n(b)}) = ${n(good[2])}; x: ${n(a * d)} + (${n(b * c)}) = ${n(good[3])}; constant: ${n(b * d)}. Leaving out the middle product (${n(a)}x)(${n(c)}x) is the usual slip.`,
          };
        },
        (r) => {
          const p1 = [int(r, 2, 4), nonZero(r, -6, 6), nonZero(r, -6, 6)], p2 = [int(r, 2, 4), nonZero(r, -6, 6), nonZero(r, -6, 6)];
          return {
            prompt: `What is the coefficient of x³ in the simplified form of (${P(p1)})(${P(p2)})?`,
            value: p1[0] * p2[1] + p1[1] * p2[0],
            explanation: `x³ comes from x²·x in two ways: (${p1[0]}x²)(${n(p2[1])}x) = ${n(p1[0] * p2[1])}x³ and (${n(p1[1])}x)(${p2[0]}x²) = ${n(p1[1] * p2[0])}x³. Total: ${n(p1[0] * p2[1] + p1[1] * p2[0])}x³. Counting only one of the two products is the usual slip.`,
          };
        },
        (r) => {
          const p = int(r, 1, 5), q = int(r, 1, 5), s = nonZero(r, -5, 5);
          const good = pmul(pmul([1, -p], [1, q]), [1, s]);
          if (good[1] === 0 || good[2] === 0) again();
          return {
            prompt: `Multiply and simplify: ${F(p)}${F(-q)}${F(-s)}.`,
            ...mc(r, P(good), [P([good[0], good[1], good[2], -good[3]]), P([good[0], -good[1], good[2], good[3]]), P([good[0], good[1], 0, good[3]])]),
            explanation: `First ${F(p)}${F(-q)} = ${P(pmul([1, -p], [1, q]))}. Then multiply by ${F(-s)}: ${P(good)}. The constant is (${n(-p)})(${q})(${n(s)}) = ${n(good[3])}; a sign slip there, or losing the x term, are the usual errors.`,
          };
        },
        (r) => {
          const a = int(r, 2, 4), b = nonZero(r, -6, 6), c = int(r, 1, 3), d = int(r, 1, 7), which = int(r, 0, 1);
          const sq = pmul([a, b], [a, b]), prod = pmul([c, d], [c, -d]);
          const res = sq.map((v, i) => v - prod[i]);
          return {
            prompt: `What is the ${which ? 'constant term' : 'coefficient of x²'} of the simplified form of (${P([a, b])})² − (${P([c, d])})(${P([c, -d])})?`,
            value: which ? res[2] : res[0],
            explanation: `(${P([a, b])})² = ${P(sq)} and (${P([c, d])})(${P([c, -d])}) = ${P(prod)}. Subtracting: ${P(sq)} − (${P(prod)}) = ${P(res)}. Subtracting −${d * d} ADDS ${d * d}; and (${P([a, b])})² is not ${a * a}x² + ${b * b} — the middle term ${n(2 * a * b)}x belongs there.`,
          };
        },
      ]) },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'polynomial-division',
    skillId: 'a2-polynomial-division',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const c = int(r, 1, 4), Q = [1, nonZero(r, -5, 5), nonZero(r, -6, 6)], rem = nonZero(r, -9, 9);
          const D = pmul(Q, [1, -c]); D[3] += rem;
          if (D.includes(0)) again();
          return {
            prompt: `What is the remainder when ${P(D)} is divided by ${F(c)}?`,
            value: rem,
            explanation: `Synthetic division with ${c}: bring down ${D[0]}; ${D[0]}·${c} + (${n(D[1])}) = ${n(Q[1])}; ${n(Q[1])}·${c} + (${n(D[2])}) = ${n(Q[2])}; ${n(Q[2])}·${c} + (${n(D[3])}) = ${n(rem)}. The remainder is ${n(rem)} (the same as evaluating the polynomial at x = ${c}). Using −${c} for the divisor ${F(c)} is the usual slip.`,
          };
        },
        (r) => {
          const c = nonZero(r, -4, 4), Q = [1, nonZero(r, -5, 5), nonZero(r, -6, 6)];
          const D = pmul(Q, [1, -c]);
          if (D.includes(0)) again();
          const [wrongQ] = synth(D, -c);
          return {
            prompt: `Divide: (${P(D)}) ÷ ${F(c)}. Which is the quotient?`,
            ...mc(r, P(Q), [P(wrongQ), P([...Q, 0]), P([Q[0], -Q[1], Q[2]])]),
            explanation: `Synthetic division with ${n(c)}: bring down 1; 1·(${n(c)}) + (${n(D[1])}) = ${n(Q[1])}; ${n(Q[1])}·(${n(c)}) + (${n(D[2])}) = ${n(Q[2])}; remainder 0. The quotient is one degree lower than the dividend: ${P(Q)}. Using ${n(-c)} (the sign as written in the divisor) is the usual slip.`,
          };
        },
        (r) => {
          const c = -int(r, 1, 4), Q = [int(r, 1, 3), nonZero(r, -5, 5), nonZero(r, -6, 6)], rem = nonZero(r, -9, 9);
          const D = pmul(Q, [1, -c]); D[3] += rem;
          if (D.includes(0)) again();
          return {
            prompt: `What is the remainder when ${P(D)} is divided by ${F(c)}?`,
            value: rem,
            explanation: `Dividing by ${F(c)} means synthetic division with ${n(c)}: bring down ${D[0]}; ${D[0]}·(${n(c)}) + (${n(D[1])}) = ${n(Q[1])}; ${n(Q[1])}·(${n(c)}) + (${n(D[2])}) = ${n(Q[2])}; ${n(Q[2])}·(${n(c)}) + (${n(D[3])}) = ${n(rem)}. Using +${-c} instead of ${n(c)} is the usual slip.`,
          };
        },
        (r) => {
          const c = nonZero(r, -4, 4), Q = [int(r, 1, 3), nonZero(r, -6, 6), nonZero(r, -6, 6)], rem = int(r, -6, 6);
          const D = pmul(Q, [1, -c]); D[3] += rem;
          if (D.includes(0) || Q[1] === D[1]) again();
          return {
            prompt: `When ${P(D)} is divided by ${F(c)}, what is the coefficient of x in the quotient?`,
            value: Q[1],
            explanation: `Synthetic division with ${n(c)} gives the row ${D[0]}, ${n(Q[1])}, ${n(Q[2])} and remainder ${n(rem)}. Those are the coefficients of the quotient ${P(Q)}, so the coefficient of x is ${n(Q[1])}. The quotient is a quadratic — reading the row as a cubic shifts every coefficient.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const c = nonZero(r, -4, 4), q0 = nonZero(r, -7, 7);
          const Q = [1, c, q0], D = pmul(Q, [1, -c]);
          if (D[2] === 0 || D[1] !== 0) again();
          const [skip] = synth([D[0], D[2], D[3]], c);
          const [wrongSign] = synth(D, -c);
          return {
            prompt: `Divide: (${P(D)}) ÷ ${F(c)}. Which is the quotient?`,
            ...mc(r, P(Q), [P(skip), P(wrongSign), P([1, 0, q0])]),
            explanation: `The dividend has no x² term, so write it as x³ + 0x² ${sgn(D[2])}x ${sgn(D[3])}. Synthetic division with ${n(c)}: 1; 0 + (${n(c)}) = ${n(c)}; ${n(D[2])} + (${n(c * c)}) = ${n(q0)}; remainder 0. Quotient: ${P(Q)}. Leaving out the 0 placeholder is the usual slip.`,
          };
        },
        (r) => {
          const c = pick(r, [-3, -2, -1, 1, 2, 3]), D = [int(r, 1, 3), 0, nonZero(r, -6, 6), nonZero(r, -6, 6), nonZero(r, -9, 9)];
          const [, rem] = synth(D, c);
          const [, noHold] = synth([D[0], D[2], D[3], D[4]], c);
          if (rem === noHold) again();
          return {
            prompt: `What is the remainder when ${P(D)} is divided by ${F(c)}?`,
            value: rem,
            explanation: `Include a 0 for the missing x³ term: coefficients ${D.map(n).join(', ')}. Synthetic division with ${n(c)} gives ${synth(D, c)[0].map(n).join(', ')} and remainder ${n(rem)}. Leaving out the placeholder gives ${n(noHold)} instead.`,
          };
        },
        (r) => {
          const c = nonZero(r, -4, 4), Q = [int(r, 1, 3), nonZero(r, -5, 5), nonZero(r, -6, 6)], rem = nonZero(r, -9, 9);
          const D = pmul(Q, [1, -c]); D[3] += rem;
          if (D.includes(0)) again();
          const form = (rr, root, over = true) => `${P(Q)} ${rr < 0 ? '−' : '+'} ${Math.abs(rr)}${over ? `/${F(root)}` : ''}`;
          return {
            prompt: `Divide: (${P(D)}) ÷ ${F(c)}. Which is the result?`,
            ...mc(r, form(rem, c), [form(-rem, c), form(rem, c, false), form(rem, -c)]),
            explanation: `Synthetic division with ${n(c)} gives quotient ${P(Q)} and remainder ${n(rem)}. The remainder is written over the divisor: ${form(rem, c)}. Adding the remainder as a plain number, without the divisor under it, is the usual slip.`,
          };
        },
        (r) => {
          const c = pick(r, [-3, -2, 2, 3]), a = nonZero(r, -5, 5), b = nonZero(r, -7, 7);
          const k = -(c ** 3 + a * c * c + b * c);
          if (k === 0) again();
          return {
            prompt: `When ${P([1, a, b, 0])} + k is divided by ${F(c)}, the remainder is 0. What is the value of k?`,
            value: k,
            explanation: `By the Remainder Theorem the remainder is the value at x = ${n(c)}: (${n(c)})³ ${sgn(a)}(${n(c)})² ${sgn(b)}(${n(c)}) + k = ${n(c ** 3)} ${sgn(a * c * c)} ${sgn(b * c)} + k = ${n(-k)} + k. Setting this to 0 gives k = ${n(k)}. Evaluating at ${n(-c)} instead is the usual slip.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const a = int(r, 2, 3), b = nonZero(r, -5, 5), Q = [int(r, 1, 3), nonZero(r, -5, 5), nonZero(r, -6, 6)];
          if (K.gcd(a, b) !== 1) again();
          const D = pmul(Q, [a, b]);
          if (D.includes(0)) again();
          return {
            prompt: `Divide: (${P(D)}) ÷ (${P([a, b])}). Which is the quotient?`,
            ...mc(r, P(Q), [P(Q.map((v) => v * a)), P([Q[0], -Q[1], Q[2]]), P([D[0], Q[1], Q[2]])]),
            explanation: `Long division: ${D[0]}x³ ÷ ${a}x = ${P([Q[0], 0, 0])}; subtract, then ${n(D[1] - Q[0] * b)}x² ÷ ${a}x = ${n(Q[1])}x; subtract, then the last step gives ${n(Q[2])} with remainder 0. Quotient: ${P(Q)}. Synthetic division with ${fr(-b, a)} gives ${P(Q.map((v) => v * a))}, which still has to be divided by ${a}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 3), b = nonZero(r, -5, 5), Q = [int(r, 1, 3), nonZero(r, -5, 5), nonZero(r, -6, 6)], rem = nonZero(r, -9, 9);
          if (K.gcd(a, b) !== 1) again();
          const D = pmul(Q, [a, b]); D[3] += rem;
          if (D.includes(0)) again();
          return {
            prompt: `What is the remainder when ${P(D)} is divided by (${P([a, b])})?`,
            value: rem,
            explanation: `Long division gives quotient ${P(Q)}: (${P([a, b])})(${P(Q)}) = ${P(pmul(Q, [a, b]))}, and ${P(D)} minus that leaves ${n(rem)}. (Equivalently, evaluate the polynomial at x = ${fr(-b, a)}.) Evaluating at ${fr(b, a)} or at ${n(-b)} is the usual slip.`,
          };
        },
        (r) => {
          const c = pick(r, [-3, -2, -1, 1, 2, 3]), Q = [int(r, 1, 2), nonZero(r, -4, 4), nonZero(r, -5, 5), nonZero(r, -5, 5)], rem = int(r, -6, 6);
          const D = pmul(Q, [1, -c]); D[4] += rem;
          if (D.includes(0) || Q[2] === D[3] || Q[2] === D[2]) again();
          return {
            prompt: `When ${P(D)} is divided by ${F(c)}, what is the coefficient of x in the quotient?`,
            value: Q[2],
            explanation: `Synthetic division with ${n(c)} gives the row ${Q.map(n).join(', ')} and remainder ${n(rem)}, so the quotient is ${P(Q)}. The coefficient of x is ${n(Q[2])}. The quotient is a cubic, one degree below the dividend — lining the row up with the dividend's powers shifts every coefficient.`,
          };
        },
        (r) => {
          const c = pick(r, [-3, -2, 2, 3]), k = nonZero(r, -5, 5), b = nonZero(r, -7, 7), d = nonZero(r, -9, 9);
          const R = c ** 3 + k * c * c + b * c + d;
          if (R === 0) again();
          return {
            prompt: `When x³ + kx² ${sgn(b)}x ${sgn(d)} is divided by ${F(c)}, the remainder is ${n(R)}. What is the value of k?`.replace(/([+−]) 1x/, '$1 x'),
            value: k,
            explanation: `By the Remainder Theorem, the value at x = ${n(c)} is the remainder: (${n(c)})³ + k(${n(c)})² ${sgn(b)}(${n(c)}) ${sgn(d)} = ${n(R)}, so ${n(c ** 3)} + ${c * c}k ${sgn(b * c)} ${sgn(d)} = ${n(R)} and ${c * c}k = ${n(k * c * c)}, k = ${n(k)}. Evaluating at ${n(-c)} is the usual slip.`,
          };
        },
      ]) },
    ],
  },

  // 9 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'advanced-factoring',
    skillId: 'a2-advanced-factoring',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const a = int(r, 2, 6);
          return {
            prompt: `Factor completely: x³ − ${a ** 3}.`,
            ...mc(r, `(x − ${a})(x² + ${a}x + ${a * a})`, [`(x − ${a})(x² − ${a}x + ${a * a})`, `(x − ${a})(x² + ${a * a})`, `(x − ${a})³`]),
            explanation: `${a ** 3} = ${a}³, a difference of cubes: a³ − b³ = (a − b)(a² + ab + b²). So x³ − ${a ** 3} = (x − ${a})(x² + ${a}x + ${a * a}). The trinomial's middle sign is OPPOSITE to the binomial's — and (x − ${a})³ is not x³ − ${a ** 3}.`,
          };
        },
        (r) => {
          const a = int(r, 2, 6);
          return {
            prompt: `Factor completely: x³ + ${a ** 3}.`,
            ...mc(r, `(x + ${a})(x² − ${a}x + ${a * a})`, [`(x + ${a})(x² + ${a}x + ${a * a})`, `(x + ${a})(x² + ${a * a})`, `(x + ${a})³`]),
            explanation: `${a ** 3} = ${a}³, a sum of cubes: a³ + b³ = (a + b)(a² − ab + b²). So x³ + ${a ** 3} = (x + ${a})(x² − ${a}x + ${a * a}). The trinomial's middle sign is OPPOSITE to the binomial's.`,
          };
        },
        (r) => {
          const a = nonZero(r, -6, 6), b = pick(r, [2, 3, 5, 6, 7]);
          if (a === b) again();
          return {
            prompt: `Factor completely by grouping: ${P([1, a, b, a * b])}.`,
            ...mc(r, `${lf(a)}(${P([1, 0, b])})`, [`${lf(b)}(${P([1, 0, a])})`, `${lf(-a)}(${P([1, 0, b])})`, `${lf(a)}(${P([1, 0, -b])})`]),
            explanation: `Group in pairs: x²${lf(a)} + ${b}${lf(a)} = ${lf(a)}(x² + ${b}). The sum x² + ${b} does not factor over the real numbers. Check by multiplying back: the constant must be ${n(a * b)} and the x term ${b}x.`,
          };
        },
        (r) => {
          const k = int(r, 2, 5), a = int(r, 2, 6);
          return {
            prompt: `Factor completely: ${P([k, 0, -k * a * a, 0])}.`,
            ...mc(r, `${k}x(x − ${a})(x + ${a})`, [`${k}x(x − ${a})²`, `${k}(x − ${a})(x + ${a})`, `x(${k}x − ${a})(${k}x + ${a})`]),
            explanation: `Take out the greatest common factor first: ${k}x(x² − ${a * a}). Then x² − ${a * a} is a difference of squares: ${k}x(x − ${a})(x + ${a}). Dropping the x from the common factor, or writing (x − ${a})², are the usual slips.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const [p, q] = pick(r, [[2, 3], [3, 2], [2, 5], [3, 4], [4, 3], [2, 1], [3, 1], [5, 2], [4, 1]]);
          const minus = int(r, 0, 1) === 1;
          const s = minus ? '−' : '+', o = minus ? '+' : '−';
          const tri = (lead, mid, sign, last) => `(${lead}x² ${sign} ${mid}x + ${last})`;
          const bin = `(${p}x ${s} ${q})`;
          return {
            prompt: `Factor completely: ${p ** 3}x³ ${s} ${q ** 3}.`,
            ...mc(r, `${bin}${tri(p * p, p * q, o, q * q)}`, [`${bin}${tri(p * p, p * q, s, q * q)}`, `${bin}${tri(p * p, 2 * p * q, o, q * q)}`, `${bin}(${p * p}x² + ${q * q})`]),
            explanation: `${p ** 3}x³ = (${p}x)³ and ${q ** 3} = ${q}³, a ${minus ? 'difference' : 'sum'} of cubes: ${bin}((${p}x)² ${o} (${p}x)(${q}) + ${q}²) = ${bin}${tri(p * p, p * q, o, q * q)}. The middle term is the single product ${p * q}x, not double it, and its sign is opposite to the binomial's.`,
          };
        },
        (r) => {
          const p = int(r, 1, 4), q = p + int(r, 1, 3);
          return {
            prompt: `Factor completely: ${P([1, 0, -(p * p + q * q), 0, p * p * q * q])}.`,
            ...mc(r, `(x − ${p})(x + ${p})(x − ${q})(x + ${q})`, [`(x − ${p})(x + ${p})(x² + ${q * q})`, `(x − ${p})²(x − ${q})²`, `(x² + ${p * p})(x² + ${q * q})`]),
            explanation: `Treat it as a quadratic in x²: (x² − ${p * p})(x² − ${q * q}). Both factors are differences of squares, so keep going: (x − ${p})(x + ${p})(x − ${q})(x + ${q}). Stopping at (x² − ${p * p})(x² − ${q * q}) is not factored completely.`,
          };
        },
        (r) => {
          const a = nonZero(r, -6, 6), b = int(r, 2, 5);
          if (Math.abs(a) === b) again();
          return {
            prompt: `Factor completely: ${P([1, a, -b * b, -a * b * b])}.`,
            ...mc(r, `${lf(a)}(x − ${b})(x + ${b})`, [`${lf(-a)}(x − ${b})(x + ${b})`, `${lf(a)}(x − ${b})²`, `${lf(a)}(x² + ${b * b})`]),
            explanation: `Group: x²${lf(a)} − ${b * b}${lf(a)} = ${lf(a)}(x² − ${b * b}). The second factor is a difference of squares: ${lf(a)}(x − ${b})(x + ${b}). Taking +${b * b} out of the second pair (a sign slip) leaves x² + ${b * b}, which is wrong.`,
          };
        },
        (r) => {
          const k = int(r, 2, 4), p = nonZero(r, -6, 6), q = nonZero(r, -6, 6);
          if (p + q === 0 || p === q || p === k * q) again();
          return {
            prompt: `Factor completely: ${P([k, k * (p + q), k * p * q, 0])}.`,
            ...mc(r, `${k}x${lf(p)}${lf(q)}`, [`${k}x${lf(-p)}${lf(-q)}`, `${k}${lf(p)}${lf(q)}`, `x(${P([k, p])})${lf(q)}`]),
            explanation: `Common factor first: ${k}x(${P([1, p + q, p * q])}). Then find two numbers with product ${n(p * q)} and sum ${n(p + q)}: ${n(p)} and ${n(q)}. Result: ${k}x${lf(p)}${lf(q)}. Dropping the x, or reversing both signs, are the usual slips.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const p = pick(r, [1, 1, 2, 3]), a = int(r, 2, 5);
          if (K.gcd(p, a) !== 1) again();
          const px = p === 1 ? 'x' : `${p}x`, p2 = p === 1 ? 'x²' : `${p * p}x²`;
          return {
            prompt: `Factor completely: ${P([p ** 4, 0, 0, 0, -(a ** 4)])}.`,
            ...mc(r, `(${px} − ${a})(${px} + ${a})(${p2} + ${a * a})`, [`(${px} − ${a})²(${px} + ${a})²`, `(${px} − ${a})⁴`, `(${px} − ${a})(${px} + ${a})(${p2} + ${a})`]),
            explanation: `A difference of squares twice: (${p2} − ${a * a})(${p2} + ${a * a}), and then ${p2} − ${a * a} = (${px} − ${a})(${px} + ${a}). The sum ${p2} + ${a * a} does not factor over the real numbers. Result: (${px} − ${a})(${px} + ${a})(${p2} + ${a * a}).`,
          };
        },
        (r) => {
          const p = int(r, 1, 4), q = pick(r, [1, 2, 3, 5, 6, 7]);
          if (q === p * p) again();
          return {
            prompt: `Factor completely: ${P([1, 0, q - p * p, 0, -p * p * q])}.`,
            ...mc(r, `(x − ${p})(x + ${p})(x² + ${q})`, [`(x − ${p})(x + ${p})(x² − ${q})`, `(x² + ${p * p})(x² − ${q})`, `(x − ${p})²(x² + ${q})`]),
            explanation: `As a quadratic in x²: two numbers with product ${n(-p * p * q)} and sum ${n(q - p * p)} are ${n(-p * p)} and ${q}, giving (x² − ${p * p})(x² + ${q}). Only the first is a difference of squares: (x − ${p})(x + ${p})(x² + ${q}). Swapping the two signs is the usual slip.`,
          };
        },
        (r) => {
          const k = int(r, 2, 4), a = int(r, 2, 4), minus = int(r, 0, 1) === 1;
          const s = minus ? '−' : '+', o = minus ? '+' : '−';
          return {
            prompt: `Factor completely: ${P([k, 0, 0, (minus ? -1 : 1) * k * a ** 3, 0])}.`,
            ...mc(r, `${k}x(x ${s} ${a})(x² ${o} ${a}x + ${a * a})`, [`${k}x(x ${s} ${a})(x² ${s} ${a}x + ${a * a})`, `${k}x(x ${s} ${a})³`, `${k}(x ${s} ${a})(x² ${o} ${a}x + ${a * a})`]),
            explanation: `Common factor first: ${k}x(x³ ${s} ${a ** 3}). Then x³ ${s} ${a ** 3} is a ${minus ? 'difference' : 'sum'} of cubes: (x ${s} ${a})(x² ${o} ${a}x + ${a * a}). Result: ${k}x(x ${s} ${a})(x² ${o} ${a}x + ${a * a}). The trinomial's middle sign is opposite to the binomial's.`,
          };
        },
        (r) => {
          const p = pick(r, [1, 3, 5]), q = int(r, 1, 4);
          return {
            prompt: `Factor completely: ${P([4, 0, -(4 * q * q + p * p), 0, p * p * q * q])}.`,
            ...mc(r, `(2x − ${p})(2x + ${p})(x − ${q})(x + ${q})`, [`(4x − ${p})(x + ${p})(x − ${q})(x + ${q})`, `(2x − ${p})²(x − ${q})(x + ${q})`, `(2x − ${p})(2x + ${p})(x² + ${q * q})`]),
            explanation: `As a quadratic in x²: (4x² − ${p * p})(x² − ${q * q}) — check: 4x⁴ − ${4 * q * q}x² − ${p * p}x² + ${p * p * q * q}. Both are differences of squares: (2x − ${p})(2x + ${p})(x − ${q})(x + ${q}). Stopping after the first step is not factored completely.`,
          };
        },
      ]) },
    ],
  },

  // 10 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'rational-equations',
    skillId: 'a2-rational-equations',
    tiers: (() => {
      // x/(x − p) − m/(x + q) = N/((x − p)(x + q)); clearing gives (x − p)(x − s) = 0.
      const famC = (r) => {
        const p = int(r, 1, 5), q = int(r, 1, 5), s = int(r, -7, 9);
        const m = p + s + q;
        if (s === p || s === -q || m < 2) again();
        return { p, q, s, m, N: p * (p + q), eq: `x/${F(p)} − ${m}/${F(-q)} = ${p * (p + q)}/(${F(p)}${F(-q)})` };
      };
      return [
        { difficulty: 2, gen: forms([
          (r) => {
            const x0 = int(r, -6, 8), b = int(r, -5, 5), d = int(r, -5, 5), t = pick(r, [1, 1, 2]);
            const a = t * (x0 + b), c = t * (x0 + d);
            if (b === d || a <= 0 || c <= 0 || K.gcd(a, c) !== 1 || b === 0 || d === 0) again();
            return {
              prompt: `Solve the equation: ${a}/${F(-b)} = ${c}/${F(-d)}. What is the value of x?`,
              value: x0,
              explanation: `Cross-multiply (or multiply both sides by ${F(-b)}${F(-d)}): ${a}${F(-d)} = ${c}${F(-b)}, so ${a}x ${sgn(a * d)} = ${c}x ${sgn(c * b)} and ${n(a - c)}x = ${n(c * b - a * d)}, x = ${n(x0)}. Neither denominator is 0 there, so it is a valid solution.`,
            };
          },
          (r) => {
            const a = int(r, 1, 9), b = int(r, 1, 9), k = int(r, 2, 4), c = int(r, 1, 5);
            if (b % k === 0) again();
            return {
              prompt: `Solve the equation: ${a}/x + ${b}/(${k}x) = ${c}. What is the value of x? Give a fraction in lowest terms if it is not a whole number.`,
              value: K.frac(k * a + b, k * c),
              explanation: `Multiply every term by the common denominator ${k}x: ${k * a} + ${b} = ${k * c}x, so x = ${k * a + b}/${k * c} = ${fr(k * a + b, k * c)}. Adding the numerators without a common denominator (${a + b}) is the usual slip.`,
            };
          },
          (r) => {
            const p = int(r, 1, 7), q = int(r, 1, 7), a = int(r, 1, 9), b = int(r, 1, 9), c = int(r, 1, 6);
            if (p === q || a === b || [a, b].includes(p) || [a, b].includes(q)) again();
            return {
              prompt: `Consider the equation: ${a}/${F(p)} + ${b}/${F(-q)} = ${c}. Which values of x can never be solutions, because they make a denominator equal to zero?`,
              ...mc(r, `x = ${p} and x = ${n(-q)}`, [`x = ${n(-p)} and x = ${q}`, `x = ${p} only`, `x = ${a} and x = ${b}`]),
              explanation: `A denominator is zero when x − ${p} = 0 (x = ${p}) or x + ${q} = 0 (x = ${n(-q)}). Any candidate equal to one of these is extraneous. Reading the signs off the denominators as written (${n(-p)} and ${q}) is the usual slip.`,
            };
          },
          (r) => {
            const a = nonZero(r, -8, 8), b = nonZero(r, -6, 6), c = pick(r, [-4, -3, -2, 2, 3, 4, 5]);
            if (a === -b) again();
            return {
              prompt: `Solve the equation: ${lf(a)}/${F(b)} = ${n(c)}. What is the value of x? Give a fraction in lowest terms if it is not a whole number.`,
              value: K.frac(a + b * c, c - 1),
              explanation: `Multiply both sides by ${F(b)}: x ${sgn(a)} = ${n(c)}${F(b)} = ${n(c)}x ${sgn(-b * c)}. Then ${n(a + b * c)} = ${n(c - 1)}x and x = ${fr(a + b * c, c - 1)}. Forgetting to distribute ${n(c)} over both terms of ${F(b)} is the usual slip.`,
            };
          },
        ]) },
        { difficulty: 3, gen: forms([
          (r) => {
            const p = int(r, 1, 6), a = int(r, 1, 6), b = nonZero(r, -5, 6), c = nonZero(r, -20, 30);
            if (a + b === 0) again();
            const [num, den] = K.reduce(c - a * p + b * p, a + b);
            if (den === 1 && Math.abs(num) === p) again();
            return {
              prompt: `Solve the equation: ${a}/${F(p)} ${b < 0 ? '−' : '+'} ${Math.abs(b)}/${F(-p)} = ${n(c)}/(x² − ${p * p}). What is the value of x? Give a fraction in lowest terms if it is not a whole number.`,
              value: K.frac(num, den),
              explanation: `x² − ${p * p} = ${F(p)}${F(-p)}, the common denominator. Multiplying through: ${a}${F(-p)} ${b < 0 ? '−' : '+'} ${Math.abs(b)}${F(p)} = ${n(c)}, so ${n(a + b)}x ${sgn(a * p - b * p)} = ${n(c)} and x = ${fr(num, den)}. It is not ${p} or ${n(-p)}, so it is valid.`,
            };
          },
          (r) => {
            const p = nonZero(r, -6, 6), s = nonZero(r, -8, 8);
            if (s === p || s === -p) again();
            const b = -(p + s), c = -p * s;
            return {
              prompt: `Solve the equation: (${P([1, b, 0])})/${F(p)} = ${n(c)}/${F(p)}. Clearing the denominator gives two candidate values, and one of them is extraneous. What is the solution of the equation?`,
              value: s,
              explanation: `Multiply by ${F(p)}: ${P([1, b, 0])} = ${n(c)}, so ${P([1, b, -c])} = 0 and ${F(p)}${F(s)} = 0. The candidates are ${n(p)} and ${n(s)}, but x = ${n(p)} makes the denominator 0, so it is extraneous. The solution is ${n(s)}.`,
            };
          },
          (r) => {
            const f = famC(r);
            return {
              prompt: `Consider the equation: ${f.eq}. Clearing the denominators gives two candidate values of x. Which one is extraneous?`,
              value: f.p,
              explanation: `Multiply by ${F(f.p)}${F(-f.q)}: x${F(-f.q)} − ${f.m}${F(f.p)} = ${f.N}, which simplifies to ${P([1, -(f.p + f.s), f.p * f.s])} = 0, so x = ${f.p} or x = ${n(f.s)}. x = ${f.p} makes x − ${f.p} = 0 in the original equation, so it is extraneous; ${n(f.s)} is the real solution.`,
            };
          },
          (r) => {
            const c = int(r, 2, 6), x = c + int(r, 1, 6);
            if ((c * x) % (x - c) !== 0) again();
            const a = c * x / (x - c);
            return {
              prompt: `Solve the equation: 1/${a} + 1/x = 1/${c}. What is the value of x?`,
              value: x,
              explanation: `Multiply every term by the common denominator ${a * c}x: ${c}x + ${a * c} = ${a}x, so ${a * c} = ${a - c}x and x = ${x}. Check: 1/${a} + 1/${x} = 1/${c}. Adding denominators (${a} + x = ${c}) is the usual slip.`,
            };
          },
        ]) },
        { difficulty: 4, gen: forms([
          (r) => {
            const f = famC(r);
            return {
              prompt: `Solve the equation: ${f.eq}. Clearing the denominators gives two candidate values of x, and one of them is extraneous. What is the solution of the equation?`,
              value: f.s,
              explanation: `Multiply by ${F(f.p)}${F(-f.q)}: x${F(-f.q)} − ${f.m}${F(f.p)} = ${f.N}, so ${P([1, -(f.p + f.s), f.p * f.s])} = 0 and x = ${f.p} or x = ${n(f.s)}. x = ${f.p} makes a denominator 0, so it is extraneous. The solution is ${n(f.s)}.`,
            };
          },
          (r) => {
            const r1 = nonZero(r, -8, 9), r2 = nonZero(r, -8, 9);
            if (r1 >= r2 || r1 + r2 === 0) again();
            const a = r1 * r2, b = r1 + r2;
            return {
              prompt: `Solve the equation: x ${a < 0 ? '−' : '+'} ${Math.abs(a)}/x = ${n(b)}. It has two solutions. What is the larger solution?`,
              value: r2,
              explanation: `Multiply every term by x: x² ${sgn(a)} = ${n(b)}x, so ${P([1, -b, a])} = 0 and ${F(r1)}${F(r2)} = 0. The solutions are ${n(r1)} and ${n(r2)}; neither is 0, so both are valid. The larger is ${n(r2)}. Multiplying only the fraction by x is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 1, 9), b = int(r, 1, 9);
            if (a === b || a === 2 * b) again();
            const c = 2 * b - a;
            return {
              prompt: `Solve the equation: x/${F(-a)} = ${b}/${F(-c)}. It has two solutions. What is the smaller solution?`,
              value: -b,
              explanation: `Cross-multiply: x${F(-c)} = ${b}${F(-a)}, so x² ${sgn(c)}x = ${b}x + ${a * b} and ${P([1, c - b, -a * b])} = 0, which factors as ${F(-b)}${F(a)} = 0. The solutions are ${n(-b)} and ${a}; neither makes a denominator 0. The smaller is ${n(-b)}.`.replace(/([+−]) 1x/g, '$1 x'),
            };
          },
          (r) => {
            const both = int(r, 0, 1) === 1;
            if (both) {
              const p = int(r, 2, 6), q = int(r, 1, 6);
              const eq = `x/${F(p)} − ${p}/${F(-q)} = ${p * (p + q)}/(${F(p)}${F(-q)})`;
              return {
                prompt: `Solve the equation: ${eq}. Check each candidate value in the original equation. Which describes the solutions?`,
                ...mc(r, 'No solution', [`x = ${p}`, `x = ${n(-q)}`, `x = ${p} and x = ${n(-q)}`]),
                explanation: `Multiply by ${F(p)}${F(-q)}: x${F(-q)} − ${p}${F(p)} = ${p * (p + q)}, so ${P([1, q - p, -p * q])} = 0 and x = ${p} or x = ${n(-q)}. But x = ${p} makes x − ${p} = 0 and x = ${n(-q)} makes x + ${q} = 0. Both are extraneous: no solution.`,
              };
            }
            const f = famC(r);
            return {
              prompt: `Solve the equation: ${f.eq}. Check each candidate value in the original equation. Which describes the solutions?`,
              ...mc(r, `x = ${n(f.s)}`, [`x = ${f.p}`, `x = ${f.p} and x = ${n(f.s)}`, 'No solution']),
              explanation: `Multiply by ${F(f.p)}${F(-f.q)}: x${F(-f.q)} − ${f.m}${F(f.p)} = ${f.N}, so ${P([1, -(f.p + f.s), f.p * f.s])} = 0 and x = ${f.p} or x = ${n(f.s)}. x = ${f.p} makes a denominator 0 (extraneous); x = ${n(f.s)} checks. Keeping both candidates is the usual slip.`,
            };
          },
        ]) },
      ];
    })(),
  },

  // 11 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'solving-quadratics-all-methods',
    skillId: 'a2-solving-quadratics-all-methods',
    tiers: (() => {
      const pm = (re, im, suffix = '') => `x = ${n(re)} ± ${im === 1 && suffix ? '' : im}${suffix}`;
      return [
        { difficulty: 2, gen: forms([
          (r) => {
            const r1 = nonZero(r, -9, 9), r2 = nonZero(r, -9, 9);
            if (r1 >= r2 || r1 + r2 === 0) again();
            return {
              prompt: `Solve by factoring: ${P([1, -(r1 + r2), r1 * r2])} = 0. What is the larger solution?`,
              value: r2,
              explanation: `Two numbers with product ${n(r1 * r2)} and sum ${n(-(r1 + r2))} give ${F(r1)}${F(r2)} = 0, so x = ${n(r1)} or x = ${n(r2)}. The larger is ${n(r2)}. Reading the solutions with the signs shown in the factors is the usual slip.`,
            };
          },
          (r) => {
            const h = nonZero(r, -8, 8), k = int(r, 2, 9);
            return {
              prompt: `Solve using square roots: ${F(h)}² = ${k * k}. What is the larger solution?`,
              value: h + k,
              explanation: `Take the square root of both sides, remembering ±: x ${sgn(-h)} = ±${k}, so x = ${n(h)} + ${k} = ${n(h + k)} or x = ${n(h)} − ${k} = ${n(h - k)}. The larger is ${n(h + k)}. Forgetting the negative root loses a solution.`,
            };
          },
          (r) => {
            const b = 2 * nonZero(r, -9, 9);
            if (Math.abs(b) < 4) again();
            return {
              prompt: `To solve by completing the square, what number must be added to ${P([1, b, 0])} to make a perfect-square trinomial?`,
              value: b * b / 4,
              explanation: `Take half of the coefficient of x and square it: (${n(b)}/2)² = (${n(b / 2)})² = ${b * b / 4}. Then ${P([1, b, b * b / 4])} = (x ${sgn(b / 2)})². Squaring ${n(b)} without halving it first (${b * b}) is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 2, 5), t = pick(r, [-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
            return {
              prompt: `Solve the equation: ${a}x² = ${n(a * t)}x. Which gives all of its solutions?`,
              ...mc(r, `x = 0 or x = ${n(t)}`, [`x = ${n(t)} only`, `x = 0 or x = ${n(-t)}`, `x = ${n(-t)} only`]),
              explanation: `Bring everything to one side and factor: ${a}x² ${sgn(-a * t)}x = 0, so ${a}x${F(t)} = 0 and x = 0 or x = ${n(t)}. Dividing both sides by x loses the solution x = 0 — that is the usual slip.`,
            };
          },
        ]) },
        { difficulty: 3, gen: forms([
          (r) => {
            const a = int(r, 2, 4), m = nonZero(r, -9, 9), q = nonZero(r, -6, 6), larger = int(r, 0, 1) === 1;
            if (K.gcd(a, m) !== 1 || m === a * q) again();
            const D = pmul([a, -m], [1, -q]);
            const first = m / a, big = Math.max(first, q) === q ? K.frac(q, 1) : K.frac(m, a), small = Math.min(first, q) === q ? K.frac(q, 1) : K.frac(m, a);
            return {
              prompt: `Solve by factoring: ${P(D)} = 0. What is the ${larger ? 'larger' : 'smaller'} solution? Give a fraction in lowest terms if it is not a whole number.`,
              value: larger ? big : small,
              explanation: `${P(D)} = (${P([a, -m])})${F(q)}. Setting each factor to 0: ${a}x = ${n(m)} gives x = ${fr(m, a)}, and x = ${n(q)}. The ${larger ? 'larger' : 'smaller'} is ${(larger ? big : small).replace('-', '−')}. Reading ${n(m)} off the factor without dividing by ${a} is the usual slip.`,
            };
          },
          (r) => {
            const h = nonZero(r, -7, 7), c = nonZero(r, -9, 9);
            const b = 2 * h;
            if (h * h - c === -c || h * h === c) again();
            const f = (inside, rhs) => `${lf(inside)}² = ${n(rhs)}`;
            return {
              prompt: `Completing the square rewrites ${P([1, b, c])} = 0 in which form?`,
              ...mc(r, f(h, h * h - c), [f(h, h * h + c), f(b, b * b - c), f(h, -c)]),
              explanation: `Move the constant: ${P([1, b, 0])} = ${n(-c)}. Add (${n(b)}/2)² = ${h * h} to BOTH sides: ${P([1, b, h * h])} = ${n(h * h - c)}, i.e. ${f(h, h * h - c)}. Adding ${h * h} to the left side only is the usual slip.`,
            };
          },
          (r) => {
            const a = int(r, 1, 3), b = nonZero(r, -9, 9), c = nonZero(r, -6, 6);
            const D = b * b - 4 * a * c, D2 = b * b + 4 * a * c;
            if (D <= 1 || K.largestSquareFactor(D) !== 1 || D2 <= 1 || K.largestSquareFactor(D2) !== 1) again();
            const f = (num, rad, den) => `x = (${n(num)} ± √${rad})/${den}`;
            return {
              prompt: `Solve using the quadratic formula: ${P([a, b, c])} = 0. Which are the solutions?`,
              ...mc(r, f(-b, D, 2 * a), [f(b, D, 2 * a), f(-b, D2, 2 * a), f(-b, D, a === 1 ? 4 : a)]),
              explanation: `x = (−b ± √(b² − 4ac))/(2a) with a = ${a}, b = ${n(b)}, c = ${n(c)}: b² − 4ac = ${b * b} − (${n(4 * a * c)}) = ${D}, so x = (${n(-b)} ± √${D})/${2 * a}. Keeping the sign of b, or getting the sign of 4ac wrong, are the usual slips.`,
            };
          },
          (r) => {
            const a = int(r, 2, 5), h = nonZero(r, -7, 7), k = int(r, 2, 6);
            return {
              prompt: `Solve using square roots: ${a}${F(h)}² − ${a * k * k} = 0. What is the smaller solution?`,
              value: h - k,
              explanation: `Isolate the square: ${a}${F(h)}² = ${a * k * k}, so ${F(h)}² = ${k * k} and x ${sgn(-h)} = ±${k}. Then x = ${n(h + k)} or x = ${n(h - k)}; the smaller is ${n(h - k)}. Taking the square root before dividing by ${a} is the usual slip.`,
            };
          },
        ]) },
        { difficulty: 4, gen: forms([
          (r) => {
            const p = nonZero(r, -6, 6), q = int(r, 1, 6);
            if (Math.abs(p) === q) again();
            return {
              prompt: `Solve using the quadratic formula: ${P([1, -2 * p, p * p + q * q])} = 0. Which are the solutions?`,
              ...mc(r, pm(p, q, 'i'), [pm(-p, q, 'i'), pm(p, 2 * q, 'i'), pm(p, q)]),
              explanation: `b² − 4ac = ${4 * p * p} − ${4 * (p * p + q * q)} = ${n(-4 * q * q)}, and √(${n(-4 * q * q)}) = ${2 * q}i. So x = (${n(2 * p)} ± ${2 * q}i)/2 = ${n(p)} ± ${q === 1 ? '' : q}i. Dividing only the real part by 2, or dropping the i, are the usual slips.`,
            };
          },
          (r) => {
            const h = nonZero(r, -7, 7), c = nonZero(r, -9, 12);
            const k = h * h - c, k2 = h * h + c;
            if (k <= 1 || K.largestSquareFactor(k) !== 1 || k2 <= 1 || K.largestSquareFactor(k2) !== 1) again();
            return {
              prompt: `Solve by completing the square: ${P([1, 2 * h, c])} = 0. Which are the solutions?`,
              ...mc(r, `x = ${n(-h)} ± √${k}`, [`x = ${n(h)} ± √${k}`, `x = ${n(-h)} ± √${k2}`, `x = ${n(-h)} ± ${k}`]),
              explanation: `${P([1, 2 * h, 0])} = ${n(-c)}; add ${h * h} to both sides: (x ${sgn(h)})² = ${k}. Then x ${sgn(h)} = ±√${k}, so x = ${n(-h)} ± √${k}. Forgetting the square root, or the sign change on ${n(h)}, are the usual slips.`,
            };
          },
          (r) => {
            const r1 = nonZero(r, -8, 8), r2 = nonZero(r, -8, 9), a = nonZero(r, -6, 6);
            const b = -(r1 + r2) - a, k = a * b - r1 * r2;
            if (r1 >= r2 || b === 0 || k === 0 || a === b || Math.abs(b) > 9) again();
            return {
              prompt: `Solve the equation: ${lf(a)}${lf(b)} = ${n(k)}. What is the larger solution?`,
              value: r2,
              explanation: `The right side is not 0, so expand first: ${P([1, a + b, a * b])} = ${n(k)}, then ${P([1, a + b, a * b - k])} = 0, which factors as ${F(r1)}${F(r2)} = 0. Solutions: ${n(r1)} and ${n(r2)}; the larger is ${n(r2)}. Setting each factor equal to ${n(k)} (or to 0) straight away is the usual slip.`,
            };
          },
          (r) => {
            const a = pick(r, [2, 2, 5]), m = nonZero(r, -7, 7), q = int(r, 1, 7);
            if ((m * m + q * q) % a !== 0 || K.gcd(K.gcd(m, q), a) !== 1) again();
            const f = (re, im, den) => (den ? `x = (${n(re)} ± ${im === 1 ? '' : im}i)/${den}` : `x = ${n(re)} ± ${im === 1 ? '' : im}i`);
            return {
              prompt: `Solve using the quadratic formula: ${P([a, -2 * m, (m * m + q * q) / a])} = 0. Which are the solutions?`,
              ...mc(r, f(m, q, a), [f(-m, q, a), f(m, q, 0), `x = (${n(m)} ± ${q})/${a}`]),
              explanation: `b² − 4ac = ${4 * m * m} − ${4 * (m * m + q * q)} = ${n(-4 * q * q)}, so √(b² − 4ac) = ${2 * q}i. Then x = (${n(2 * m)} ± ${2 * q}i)/${2 * a} = (${n(m)} ± ${q === 1 ? '' : q}i)/${a}. Dividing by 2 instead of 2a = ${2 * a}, or dropping the i, are the usual slips.`,
            };
          },
        ]) },
      ];
    })(),
  },

  // 12 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'counting-principles',
    skillId: 'a2-counting-principles',
    tiers: [
      { difficulty: 2, gen: forms([
        (r) => {
          const a = int(r, 3, 6), b = int(r, 4, 8), c = int(r, 2, 5);
          if (a === b || b === c) again();
          return {
            prompt: `A restaurant offers ${a} appetizers, ${b} main courses and ${c} desserts. A meal is one appetizer, one main course and one dessert. How many different meals are possible?`,
            value: a * b * c,
            explanation: `Fundamental Counting Principle: multiply the number of choices at each step. ${a} × ${b} × ${c} = ${a * b * c}. Adding the choices (${a + b + c}) is the usual slip.`,
          };
        },
        (r) => {
          const k = int(r, 4, 6), L = int(r, 2, 4);
          return {
            prompt: `A code is ${L} letters long. Each letter is chosen from the ${k} letters A through ${'ABCDEFG'[k - 1]}, and letters may repeat. How many different codes are possible?`,
            value: k ** L,
            explanation: `Each of the ${L} positions has ${k} choices, and repetition is allowed, so the count is ${Array(L).fill(k).join(' × ')} = ${k ** L}. Multiplying ${k} × ${L} = ${k * L} is the usual slip.`,
          };
        },
        (r) => {
          const nn = int(r, 4, 7);
          const [things, where] = pick(r, [['different books', 'be arranged in a row on a shelf'], ['runners', 'finish a race, if there are no ties'], ['different photos', 'be hung in a row on a wall'], ['students', 'line up in a single line']]);
          return {
            prompt: `In how many different orders can ${nn} ${things} ${where}?`,
            value: fact(nn),
            explanation: `There are ${nn} choices for the first place, ${nn - 1} for the second, and so on: ${nn}! = ${Array.from({ length: nn }, (_, i) => nn - i).join(' × ')} = ${fact(nn)}. Answering ${nn * nn} or ${nn} is the usual slip.`,
          };
        },
        (r) => {
          const k = int(r, 5, 9), L = int(r, 2, 4);
          const terms = Array.from({ length: L }, (_, i) => k - i);
          return {
            prompt: `A code is made of ${L} different digits chosen from the digits 1 through ${k}. No digit may be used more than once. How many different codes are possible?`,
            value: terms.reduce((s, v) => s * v, 1),
            explanation: `Without repetition the choices shrink by one each time: ${terms.join(' × ')} = ${terms.reduce((s, v) => s * v, 1)}. Allowing repeats would give ${k ** L} — the usual slip.`,
          };
        },
      ]) },
      { difficulty: 3, gen: forms([
        (r) => {
          const a = int(r, 1, 2), b = int(r, 2, 3);
          return {
            prompt: `A license plate has ${a === 1 ? '1 letter' : `${a} letters`} (A to Z, 26 choices each) followed by ${b} digits (0 to 9). Letters and digits may repeat. How many different plates are possible?`,
            value: 26 ** a * 10 ** b,
            explanation: `Multiply the choices for every position: ${Array(a).fill(26).concat(Array(b).fill(10)).join(' × ')} = ${26 ** a * 10 ** b}. Counting only 9 digits (leaving out 0) is the usual slip.`,
          };
        },
        (r) => {
          const d = int(r, 3, 4), rep = int(r, 0, 1) === 1;
          const terms = rep ? [9].concat(Array(d - 1).fill(10)) : [9, 9, 8, 7].slice(0, d);
          const val = terms.reduce((s, v) => s * v, 1);
          return {
            prompt: `How many ${d}-digit whole numbers are there${rep ? '' : ' in which no digit is repeated'}? (A ${d}-digit number cannot begin with 0.)`,
            value: val,
            explanation: `The first digit has 9 choices (1 to 9). ${rep ? `Every other digit has 10 choices: ${terms.join(' × ')} = ${val}` : `The second has 9 (0 is now allowed, but the first digit is used up), then ${terms.slice(2).join(', then ')}: ${terms.join(' × ')} = ${val}`}. Allowing 0 as the first digit is the usual slip.`,
          };
        },
        (r) => {
          const k = int(r, 5, 9), L = int(r, 3, 4), even = int(r, 0, 1) === 1;
          const cnt = even ? Math.floor(k / 2) : Math.ceil(k / 2);
          const rest = Array.from({ length: L - 1 }, (_, i) => k - 1 - i);
          const val = rest.reduce((s, v) => s * v, cnt);
          return {
            prompt: `How many ${L}-digit numbers that are ${even ? 'even' : 'odd'} can be formed from the digits 1 through ${k} if no digit may be used more than once?`,
            value: val,
            explanation: `Fill the restricted place first: the last digit must be ${even ? 'even' : 'odd'}, ${cnt} choices. The remaining ${L - 1} places take ${rest.join(', then ')} choices. ${cnt} × ${rest.join(' × ')} = ${val}. Ignoring the restriction gives ${Array.from({ length: L }, (_, i) => k - i).reduce((s, v) => s * v, 1)}.`,
          };
        },
        (r) => {
          const nn = int(r, 6, 12), k = int(r, 2, 3);
          return {
            prompt: `Evaluate ${nn}!/${nn - k}!.`,
            value: nPr(nn, k),
            explanation: `${nn}! = ${Array.from({ length: k }, (_, i) => nn - i).join(' × ')} × ${nn - k}!, so the ${nn - k}! cancels: ${Array.from({ length: k }, (_, i) => nn - i).join(' × ')} = ${nPr(nn, k)}. "Cancelling" to (${nn}/${nn - k})! is not valid.`,
          };
        },
      ]) },
      { difficulty: 4, gen: forms([
        (r) => {
          const nn = int(r, 5, 7), apart = int(r, 0, 1) === 1;
          const together = 2 * fact(nn - 1);
          return {
            prompt: `In how many ways can ${nn} students stand in a row if two of them, Ana and Ben, must ${apart ? 'NOT ' : ''}stand next to each other?`,
            value: apart ? fact(nn) - together : together,
            explanation: `Treat Ana and Ben as one block: ${nn - 1} objects arrange in ${nn - 1}! = ${fact(nn - 1)} ways, and the pair can swap, so ${together} arrangements have them together. ${apart ? `Subtract from all ${nn}! = ${fact(nn)}: ${fact(nn)} − ${together} = ${fact(nn) - together}.` : `Forgetting the factor of 2 for the swap gives ${fact(nn - 1)}.`}`,
          };
        },
        (r) => {
          const digits = int(r, 0, 1) === 1, k = digits ? 10 : int(r, 5, 8), L = int(r, 3, 4);
          const none = Array.from({ length: L }, (_, i) => k - i).reduce((s, v) => s * v, 1);
          return {
            prompt: `A code is ${L} characters long, and each character is ${digits ? 'a digit from 0 to 9' : `one of the ${k} letters A through ${'ABCDEFGH'[k - 1]}`}. Characters may repeat. How many of the possible codes have at least one repeated character?`,
            value: k ** L - none,
            explanation: `Count the complement. All codes: ${k}${SUP[L]} = ${k ** L}. Codes with NO repeat: ${Array.from({ length: L }, (_, i) => k - i).join(' × ')} = ${none}. At least one repeat: ${k ** L} − ${none} = ${k ** L - none}. Trying to count the repeats directly usually double-counts.`,
          };
        },
        (r) => {
          const nn = int(r, 5, 8);
          return {
            prompt: `${nn} people line up for a photo. The two tallest people must stand at the two ends of the line. In how many ways can the line be arranged?`,
            value: 2 * fact(nn - 2),
            explanation: `The two tallest can take the ends in 2 ways (which one is on the left). The other ${nn - 2} people fill the middle in ${nn - 2}! = ${fact(nn - 2)} ways. 2 × ${fact(nn - 2)} = ${2 * fact(nn - 2)}. Forgetting the 2, or using ${nn}!, are the usual slips.`,
          };
        },
        (r) => {
          const k = int(r, 5, 12);
          return {
            prompt: `A password is 2 different letters chosen from the first ${k} letters of the alphabet, followed by 2 digits (0 to 9). The digits may repeat, but the first digit cannot be 0. How many passwords are possible?`,
            value: k * (k - 1) * 9 * 10,
            explanation: `Letters: ${k} choices, then ${k - 1} (they must differ). Digits: 9 choices for the first (no 0), 10 for the second. ${k} × ${k - 1} × 9 × 10 = ${k * (k - 1) * 90}. Using ${k} × ${k} for the letters or 10 × 10 for the digits ignores a restriction.`,
          };
        },
      ]) },
    ],
  },

  // 13 ────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'permutations-combinations',
    skillId: 'a2-permutations-combinations',
    tiers: (() => {
      const WHICH = [
        [(a, b) => `A club with ${a} members elects ${b === 2 ? 'a president and a vice-president' : b === 3 ? 'a president, a vice-president and a treasurer' : 'a president, a vice-president, a treasurer and a secretary'}; no one may hold two offices.`, 'P'],
        [(a, b) => `${a} runners enter a race, and the first ${b} finishers are recorded in order (1st, 2nd${b > 2 ? ', 3rd' : ''}${b > 3 ? ', 4th' : ''}).`, 'P'],
        [(a, b) => `A shopper picks ${b} of ${a} different pizza toppings for one pizza.`, 'C'],
        [(a, b) => `A teacher chooses ${b} of ${a} students to form a committee in which every member has the same role.`, 'C'],
      ];
      const WHICH2 = [
        [(a, b) => `From ${a} different books, ${b} are chosen and lined up in a row on a shelf.`, 'P'],
        [(a, b) => `A ${b}-letter code is made from ${a} different letter tiles, each tile used at most once.`, 'P'],
        [(a, b) => `A traveler packs ${b} of the ${a} different shirts she owns.`, 'C'],
        [(a, b) => `A student must answer any ${b} of the ${a} questions on a test.`, 'C'],
      ];
      const which = (list) => (r) => {
        const a = int(r, 7, 12), b = int(r, 2, 4);
        const [text, kind] = pick(r, list);
        const good = `${kind}(${a}, ${b})`, other = `${kind === 'P' ? 'C' : 'P'}(${a}, ${b})`;
        return {
          prompt: `${text(a, b)} Here P(n, r) counts ordered arrangements and C(n, r) counts unordered selections. Which expression gives the number of ways this can be done?`,
          ...mc(r, good, [other, `${a}${SUP[b]}`, `${b}!`]),
          explanation: `${kind === 'P' ? 'Order matters here (a different order is a different outcome), so it is a permutation' : 'Order does not matter here (the same group in a different order is the same outcome), so it is a combination'}: ${good} = ${kind === 'P' ? nPr(a, b) : nCr(a, b)}. ${a}${SUP[b]} would allow the same item to be chosen more than once.`,
        };
      };
      return [
        { difficulty: 2, gen: forms([
          (r) => {
            const a = int(r, 5, 9), b = int(r, 2, 3);
            return {
              prompt: `Evaluate P(${a}, ${b}), the number of permutations of ${a} objects taken ${b} at a time.`,
              value: nPr(a, b),
              explanation: `P(n, r) = n!/(n − r)!: start at ${a} and multiply ${b} descending factors: ${Array.from({ length: b }, (_, i) => a - i).join(' × ')} = ${nPr(a, b)}. Dividing by ${b}! as well gives C(${a}, ${b}) = ${nCr(a, b)} — the combination, not the permutation.`,
            };
          },
          (r) => {
            const a = int(r, 5, 10), b = int(r, 2, 4);
            if (b > a - 2) again();
            return {
              prompt: `Evaluate C(${a}, ${b}), the number of combinations of ${a} objects taken ${b} at a time.`,
              value: nCr(a, b),
              explanation: `C(n, r) = n!/(r!(n − r)!) = (${Array.from({ length: b }, (_, i) => a - i).join(' × ')})/(${Array.from({ length: b }, (_, i) => b - i).join(' × ')}) = ${nPr(a, b)}/${fact(b)} = ${nCr(a, b)}. Forgetting to divide by ${b}! gives P(${a}, ${b}) = ${nPr(a, b)}.`,
            };
          },
          which(WHICH),
          (r) => {
            const a = int(r, 6, 12), b = int(r, 2, 4);
            return {
              prompt: `A committee of ${b} people is chosen from a group of ${a}. Every member of the committee has the same role. How many different committees are possible?`,
              value: nCr(a, b),
              explanation: `The order of choosing does not matter, so use a combination: C(${a}, ${b}) = (${Array.from({ length: b }, (_, i) => a - i).join(' × ')})/${b}! = ${nPr(a, b)}/${fact(b)} = ${nCr(a, b)}. Using P(${a}, ${b}) = ${nPr(a, b)} counts each committee ${fact(b)} times.`,
            };
          },
        ]) },
        { difficulty: 3, gen: forms([
          (r) => {
            const a = int(r, 8, 13);
            return {
              prompt: `A club has ${a} members. In how many ways can a president, a vice-president and a treasurer be chosen if no one may hold more than one office?`,
              value: nPr(a, 3),
              explanation: `The offices are different, so order matters: P(${a}, 3) = ${a} × ${a - 1} × ${a - 2} = ${nPr(a, 3)}. Using C(${a}, 3) = ${nCr(a, 3)} would treat the three offices as interchangeable.`,
            };
          },
          (r) => {
            const m = int(r, 5, 8), w = int(r, 4, 7), a = int(r, 2, 3), b = int(r, 2, 3);
            if (m === w) again();
            return {
              prompt: `A committee of ${a} men and ${b} women is chosen from a group of ${m} men and ${w} women. How many different committees are possible?`,
              value: nCr(m, a) * nCr(w, b),
              explanation: `Choose the men and the women separately, then multiply: C(${m}, ${a}) × C(${w}, ${b}) = ${nCr(m, a)} × ${nCr(w, b)} = ${nCr(m, a) * nCr(w, b)}. Adding the two counts, or using C(${m + w}, ${a + b}), ignores the required split.`,
            };
          },
          which(WHICH2),
          (r) => {
            const a = int(r, 8, 20);
            return {
              prompt: `At a meeting of ${a} people, every person shakes hands exactly once with every other person. How many handshakes take place?`,
              value: nCr(a, 2),
              explanation: `A handshake is an unordered pair of people: C(${a}, 2) = (${a} × ${a - 1})/2 = ${nCr(a, 2)}. ${a} × ${a - 1} = ${a * (a - 1)} counts every handshake twice.`,
            };
          },
        ]) },
        { difficulty: 4, gen: forms([
          (r) => {
            const m = int(r, 4, 6), w = int(r, 3, 5), k = int(r, 3, 4);
            return {
              prompt: `A committee of ${k} is chosen from ${m} men and ${w} women. How many of the possible committees include at least one woman?`,
              value: nCr(m + w, k) - nCr(m, k),
              explanation: `Count the complement: all committees minus the all-male ones. C(${m + w}, ${k}) − C(${m}, ${k}) = ${nCr(m + w, k)} − ${nCr(m, k)} = ${nCr(m + w, k) - nCr(m, k)}. Choosing one woman first and then anyone (${w} × C(${m + w - 1}, ${k - 1})) counts some committees more than once.`,
            };
          },
          (r) => {
            const a = int(r, 7, 12);
            return {
              prompt: `From the ${a} members of a club, a president, a vice-president and a secretary are chosen (three different people). In how many ways can this be done if Alex, one of the members, must hold one of the three offices?`,
              value: 3 * (a - 1) * (a - 2),
              explanation: `Alex can take any of the 3 offices. The other two offices are then filled in order from the remaining ${a - 1} members: ${a - 1} × ${a - 2}. Total: 3 × ${a - 1} × ${a - 2} = ${3 * (a - 1) * (a - 2)}. Leaving out the factor 3 fixes Alex in one office only.`,
            };
          },
          (r) => {
            const a = int(r, 7, 10), k = int(r, 3, 4), both = int(r, 0, 1) === 1;
            const withBoth = nCr(a - 2, k - 2);
            return {
              prompt: `A team of ${k} is chosen from ${a} students, two of whom are Maya and Noor. How many of the possible teams ${both ? 'include both Maya and Noor' : 'do NOT include both Maya and Noor together'}?`,
              value: both ? withBoth : nCr(a, k) - withBoth,
              explanation: `If Maya and Noor are both on the team, the other ${k - 2} members come from the remaining ${a - 2}: C(${a - 2}, ${k - 2}) = ${withBoth}. ${both ? `Counting C(${a}, ${k}) = ${nCr(a, k)} ignores the condition.` : `Subtract from all teams: C(${a}, ${k}) − ${withBoth} = ${nCr(a, k)} − ${withBoth} = ${nCr(a, k) - withBoth}.`}`,
            };
          },
          (r) => {
            const nn = int(r, 6, 15), perm = int(r, 0, 1) === 1;
            return {
              prompt: `If ${perm ? 'P' : 'C'}(n, 2) = ${perm ? nn * (nn - 1) : nCr(nn, 2)}, what is the value of n?`,
              value: nn,
              explanation: `${perm ? `P(n, 2) = n(n − 1) = ${nn * (nn - 1)}` : `C(n, 2) = n(n − 1)/2 = ${nCr(nn, 2)}, so n(n − 1) = ${nn * (nn - 1)}`}. Two consecutive whole numbers with that product are ${nn - 1} and ${nn}, so n = ${nn} (the negative root of n² − n − ${nn * (nn - 1)} = 0 is rejected). ${perm ? 'Dividing by 2 first treats it as a combination.' : 'Forgetting the division by 2 gives a non-whole n.'}`,
            };
          },
        ]) },
      ];
    })(),
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
