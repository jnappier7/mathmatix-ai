'use strict';
/**
 * At-level check items for eight AP Calculus AB course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   limits-graphical-numerical · derivative-as-rate-of-change ·
 *   riemann-sums-approximation · ftc-part-2 · definite-integral-as-accumulation ·
 *   first-second-derivative-tests · curve-sketching-from-derivatives ·
 *   exponential-growth-decay-models
 *
 * No picture exists: a table is written inline ("x: 0, 2, 4 and f(x): 3, 5, 9")
 * and a graph is described in words. A definite integral is always written
 * "∫ from a to b of f(x) dx". A typed answer is one number; anything with e, ln,
 * π, an interval or a sentence is multiple choice, and each wrong choice is the
 * answer a named slip produces (left for right endpoint, f for f′, bounds
 * reversed, the chain-rule factor forgotten, the sign of k …).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelCalculusAB.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'ap-calculus-ab';
const GB = '9-12';

// ── helpers ────────────────────────────────────────────────────────────────

const RETRY = new Error('retry');
const again = () => { throw RETRY; };

/** Redraw until the generator produces a clean item. */
function g(f) {
  return (r, idx) => {
    for (let i = 0; i < 400; i++) {
      try { return f(r, idx); } catch (e) { if (e !== RETRY) throw e; }
    }
    throw new Error('no clean draw in 400 tries');
  };
}

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

/** A fixed set of four choices, rotated so the key moves. */
function mcFixed(r, opts, correct) {
  if (new Set(opts).size !== 4 || !opts.includes(correct)) again();
  const k = int(r, 0, 3);
  const options = opts.slice(k).concat(opts.slice(0, k));
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

/** A number for display, with the Unicode minus. */
const m = (n) => (n < 0 ? `−${String(-n)}` : String(n));
/** A decimal without float noise. */
const dec = (x) => Number(x.toFixed(4));
/** "∫ from a to b of BODY". */
const INT = (a, b, body) => `∫ from ${typeof a === 'number' ? m(a) : a} to ${typeof b === 'number' ? m(b) : b} of ${body}`;
/** "12π", "π", "25π/2". */
function piStr(n, d = 1) {
  const [a, b] = K.reduce(n, d);
  const coef = a === 1 ? '' : String(a);
  return b === 1 ? `${coef}π` : `${coef}π/${b}`;
}
/** "(x − 3)", "(x + 2)", "x", with an exponent. */
function fac(root, e = 1) {
  const base = root === 0 ? 'x' : `(x ${root < 0 ? '+' : '−'} ${Math.abs(root)})`;
  return base + ['', '', '²', '³'][e];
}
const list = (arr) => arr.map((v) => m(dec(v))).join(', ');
const distinctSorted = (r, n, lo, hi) => {
  const s = new Set();
  while (s.size < n) s.add(int(r, lo, hi));
  return [...s].sort((a, b) => a - b);
};

// Quantities that change in time, for "what does the derivative mean".
const CTX = [
  { Q: 'The amount of water in a tank', q: 'the amount of water in the tank', F: 'W', u: 'litres', us: 'litre', t: 'minutes', tu: 'minute' },
  { Q: 'The temperature of a cup of coffee', q: 'the temperature of the coffee', F: 'C', u: 'degrees Celsius', us: 'degree Celsius', t: 'minutes', tu: 'minute' },
  { Q: 'The height of a weather balloon', q: 'the height of the balloon', F: 'H', u: 'metres', us: 'metre', t: 'seconds', tu: 'second' },
  { Q: 'The mass of a block of ice', q: 'the mass of the ice', F: 'M', u: 'grams', us: 'gram', t: 'hours', tu: 'hour' },
];

// Rates, for "what does the integral of a rate mean".
const RATES = [
  { say: 'Water flows into a tank at a rate of R(t) litres per minute, where t is the time in minutes', R: 'R', total: 'The number of litres of water that flow into the tank', u: 'litres', per: 'litres per minute', tu: 'minutes', t1: 'minute' },
  { say: 'A factory produces widgets at a rate of P(t) widgets per hour, where t is the time in hours', R: 'P', total: 'The number of widgets the factory produces', u: 'widgets', per: 'widgets per hour', tu: 'hours', t1: 'hour' },
  { say: 'Snow falls on a driveway at a rate of S(t) centimetres per hour, where t is the time in hours', R: 'S', total: 'The number of centimetres of snow that fall', u: 'centimetres', per: 'centimetres per hour', tu: 'hours', t1: 'hour' },
  { say: 'People enter a stadium at a rate of E(t) people per minute, where t is the time in minutes', R: 'E', total: 'The number of people who enter the stadium', u: 'people', per: 'people per minute', tu: 'minutes', t1: 'minute' },
];

const NEAR = [-0.1, -0.01, -0.001, 0.001, 0.01, 0.1];

/** A table whose values close in on `left` from the left of a and `right` from the right. */
function nearTable(r, a, left, right) {
  const s1 = pick(r, [1, 2, 3, -1, -2]);
  const s2 = pick(r, [1, 2, 3, -1, -2]);
  const xs = NEAR.map((d) => a + d);
  const ys = NEAR.map((d) => (d < 0 ? left + s1 * d : right + s2 * d));
  return `x: ${list(xs)} and f(x): ${list(ys)}`;
}

const EXT = ['a local maximum', 'a local minimum', 'neither a local maximum nor a local minimum', 'either one; this information cannot tell which'];
const OVER = 'an overestimate';
const UNDER = 'an underestimate';

// ── templates ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'limits-graphical-numerical',
    skillId: 'calc-limits-graphical-numerical',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const a = int(r, -3, 6), L = int(r, -6, 9);
        if (idx === 0) {
          return {
            prompt: `A table of values for a function f near x = ${m(a)} lists ${nearTable(r, a, L, L)}. Based on the table, what is the best estimate of the limit of f(x) as x approaches ${m(a)}?`,
            value: L,
            explanation: `From both sides of x = ${m(a)} the values of f(x) close in on ${m(L)}, so the limit is ${m(L)}. A limit is read from the values NEAR the point, not from a value at it.`,
          };
        }
        const v = L + K.nonZero(r, -5, 5);
        if (idx === 1 || idx === 2) {
          const askLimit = idx === 1;
          return {
            prompt: `The graph of f is a straight line with an open circle (a hole) at the point (${m(a)}, ${m(L)}), and a single filled dot at (${m(a)}, ${m(v)}). What is ${askLimit ? `the limit of f(x) as x approaches ${m(a)}` : `f(${m(a)})`}?`,
            value: askLimit ? L : v,
            explanation: askLimit
              ? `Near x = ${m(a)} the line heads for the hole at height ${m(L)}, so the limit is ${m(L)}. The filled dot gives f(${m(a)}) = ${m(v)}, which the limit ignores.`
              : `The filled dot is the actual value: f(${m(a)}) = ${m(v)}. The hole at height ${m(L)} is the LIMIT, where the line is heading, not the value.`,
          };
        }
        const p = L, q = L + K.nonZero(r, -4, 4);
        return {
          prompt: `The graph of f has a jump at x = ${m(a)}. Following the graph toward x = ${m(a)} from the left, the heights approach ${m(p)}, ending at an open circle at (${m(a)}, ${m(p)}). Following it from the right, the heights approach ${m(q)}, ending at a filled dot at (${m(a)}, ${m(q)}). What is the limit of f(x) as x approaches ${m(a)} from the left?`,
          value: p,
          explanation: `The left-hand limit is the height the graph approaches from the left: ${m(p)}. The filled dot at ${m(q)} is f(${m(a)}) and the right-hand limit, not the left-hand one.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        const a = int(r, -3, 6), p = int(r, -6, 8), q = p + 2 * K.nonZero(r, -3, 3);
        const dne = `The limit does not exist, because f(x) approaches ${m(p)} from the left and ${m(q)} from the right`;
        const wrongs = [`The limit is ${m(p)}`, `The limit is ${m(q)}`, `The limit is ${m((p + q) / 2)}`];
        if (idx === 0) {
          return {
            prompt: `A table of values for a function f near x = ${m(a)} lists ${nearTable(r, a, p, q)}. Based on the table, which is the best conclusion about the limit of f(x) as x approaches ${m(a)}?`,
            ...mc(r, dne, wrongs),
            explanation: `From the left the values close in on ${m(p)}; from the right, on ${m(q)}. The one-sided limits differ, so the two-sided limit does not exist. Averaging them, or picking one side, is the usual slip.`,
          };
        }
        if (idx === 1) {
          return {
            prompt: `The graph of f has a jump at x = ${m(a)}. From the left the graph approaches an open circle at (${m(a)}, ${m(p)}); from the right it approaches a filled dot at (${m(a)}, ${m(q)}). Which is true about the limit of f(x) as x approaches ${m(a)}?`,
            ...mc(r, dne, wrongs),
            explanation: `The left-hand limit is ${m(p)} and the right-hand limit is ${m(q)}. They are different, so the two-sided limit does not exist — even though f(${m(a)}) = ${m(q)} is defined.`,
          };
        }
        if (idx === 2) {
          const c = pick(r, [1, 2, 3, 5]);
          const xs = NEAR.map((d) => a + d);
          const ys = NEAR.map((d) => Math.round(c / (d * d)));
          return {
            prompt: `A table of values for a function f near x = ${m(a)} lists x: ${list(xs)} and f(x): ${list(ys)}. Based on the table, which is the best conclusion about the limit of f(x) as x approaches ${m(a)}?`,
            ...mc(r, `No finite limit exists: f(x) grows without bound as x approaches ${m(a)}`, [`The limit is ${c * 1000000}`, 'The limit is 0', `The limit is ${c * 100}`]),
            explanation: `Each step closer to x = ${m(a)} multiplies f(x) by 100: ${c * 100}, ${c * 10000}, ${c * 1000000}. The values do not settle on any number, so there is no finite limit (the graph has a vertical asymptote). The largest table entry is not a limit.`,
          };
        }
        const v = p + K.nonZero(r, -6, 6);
        const s = pick(r, [1, 2, -1, -2]);
        const ds = [-0.1, -0.01, 0, 0.01, 0.1];
        return {
          prompt: `A table of values for a function f lists x: ${list(ds.map((d) => a + d))} and f(x): ${list(ds.map((d) => (d === 0 ? v : p + s * d)))}. Based on the table, what is the best estimate of the limit of f(x) as x approaches ${m(a)}?`,
          value: p,
          explanation: `On both sides of x = ${m(a)} the values close in on ${m(p)}, so the limit is ${m(p)}. The entry f(${m(a)}) = ${m(v)} is the value AT the point; a limit does not use it.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        const a = int(r, -3, 6), p = int(r, -6, 8);
        if (idx === 0) {
          const v = p + K.nonZero(r, -5, 5);
          const lim = `The limit of f(x) as x approaches ${m(a)}`;
          const right = `${lim} is ${m(p)}, and f is not continuous at x = ${m(a)}`;
          return {
            prompt: `For a function f, the limit of f(x) as x approaches ${m(a)} from the left is ${m(p)}, the limit from the right is ${m(p)}, and f(${m(a)}) = ${m(v)}. Which statement is true?`,
            ...mc(r, right, [
              `${lim} is ${m(v)}, because f(${m(a)}) = ${m(v)}`,
              `${lim} does not exist, because f(${m(a)}) is not ${m(p)}`,
              `${lim} is ${m(p)}, and f is continuous at x = ${m(a)}`,
            ]),
            explanation: `The one-sided limits agree, so the limit is ${m(p)}. Continuity also needs the limit to EQUAL f(${m(a)}), and ${m(p)} ≠ ${m(v)}, so f is not continuous there. The value at the point never decides whether the limit exists.`,
          };
        }
        if (idx === 1) {
          const q = p + K.nonZero(r, -5, 5);
          return {
            prompt: `A table of values for a function f near x = ${m(a)} lists ${nearTable(r, a, p, q)}. Based on the table, what is the best estimate of the limit of f(x) as x approaches ${m(a)} from the right?`,
            value: q,
            explanation: `"From the right" uses the x-values greater than ${m(a)}; there f(x) closes in on ${m(q)}. The values for x less than ${m(a)} close in on ${m(p)}, which is the left-hand limit.`,
          };
        }
        if (idx === 2) {
          const left = pick(r, ['rises', 'falls']), right = pick(r, ['rises', 'falls']);
          const lim = `The limit of f(x) as x approaches ${m(a)}`;
          const opts = [
            `${lim} is ∞`,
            `${lim} is −∞`,
            `The one-sided limits are different (one is ∞ and the other is −∞), so the limit as x approaches ${m(a)} does not exist`,
            `${lim} is 0`,
          ];
          const correct = left !== right ? opts[2] : (left === 'rises' ? opts[0] : opts[1]);
          return {
            prompt: `The graph of f has a vertical asymptote at x = ${m(a)}. As x approaches ${m(a)} from the left, the graph ${left} without bound; as x approaches ${m(a)} from the right, the graph ${right} without bound. Which statement is true?`,
            ...mcFixed(r, opts, correct),
            explanation: left !== right
              ? `One side heads to ${left === 'rises' ? '∞' : '−∞'} and the other to ${right === 'rises' ? '∞' : '−∞'}. The sides disagree, so the two-sided limit does not exist and cannot be written as ∞ or −∞.`
              : `Both sides ${left === 'rises' ? 'rise' : 'fall'} without bound, so the limit is written ${left === 'rises' ? '∞' : '−∞'} (no finite limit exists, but the behaviour is the same from both sides).`,
          };
        }
        const L = p, M = int(r, -5, 7), k = int(r, 2, 4), v = L + K.nonZero(r, -4, 4), w = M + K.nonZero(r, -4, 4);
        return {
          prompt: `The graph of f has a hole at (${m(a)}, ${m(L)}) and a filled dot at (${m(a)}, ${m(v)}). The graph of g has a hole at (${m(a)}, ${m(M)}) and a filled dot at (${m(a)}, ${m(w)}). What is the limit of f(x) + ${k}g(x) as x approaches ${m(a)}?`,
          value: L + k * M,
          explanation: `The limits are the heights of the holes: ${m(L)} for f and ${m(M)} for g. So the limit is ${m(L)} + ${k}(${m(M)}) = ${m(L + k * M)}. Using the filled dots gives ${m(v + k * w)}, which is f(${m(a)}) + ${k}g(${m(a)}), not the limit.`,
        };
      }) },
    ],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'derivative-as-rate-of-change',
    skillId: 'calc-derivative-as-rate-of-change',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const c = CTX[(idx + int(r, 0, 3)) % 4];
        const intro = `${c.Q} is ${c.F}(t) ${c.u}, where t is the time in ${c.t}.`;
        if (idx === 0) {
          const a = int(r, 1, 4), h = int(r, 2, 5), y1 = int(r, 20, 60), rate = K.nonZero(r, -4, 8);
          const y2 = y1 + rate * h;
          if (y2 <= 0) again();
          return {
            prompt: `${intro} It is known that ${c.F}(${a}) = ${y1} and ${c.F}(${a + h}) = ${y2}. What is the average rate of change of ${c.F} from t = ${a} to t = ${a + h}, in ${c.u} per ${c.tu}?`,
            value: rate,
            explanation: `Average rate of change = (${y2} − ${y1})/(${a + h} − ${a}) = ${m(y2 - y1)}/${h} = ${m(rate)} ${c.u} per ${c.tu}. Dividing by ${a + h} instead of the length of the interval is the usual slip.`,
          };
        }
        if (idx === 1) {
          const t0 = int(r, 2, 9), rr = int(r, 2, 9), up = int(r, 0, 1) === 1;
          const at = `At t = ${t0} ${c.t}, ${c.q} is`;
          return {
            prompt: `${intro} Which is the best interpretation of ${c.F}′(${t0}) = ${m(up ? rr : -rr)}?`,
            ...mc(r, `${at} ${up ? 'increasing' : 'decreasing'} at a rate of ${rr} ${c.u} per ${c.tu}`, [
              `${at} ${m(up ? rr : -rr)} ${c.u}`,
              `During the first ${t0} ${c.t}, ${c.q} ${up ? 'rose' : 'fell'} by a total of ${rr} ${c.u}`,
              `${at} ${up ? 'decreasing' : 'increasing'} at a rate of ${rr} ${c.u} per ${c.tu}`,
            ]),
            explanation: `${c.F}′(${t0}) is the instantaneous rate of change at t = ${t0}: ${c.u} per ${c.tu}. It is ${up ? 'positive' : 'negative'}, so the quantity is ${up ? 'increasing' : 'decreasing'} at ${rr} ${c.u} per ${c.tu}. It is not the amount itself and not a total change.`,
          };
        }
        if (idx === 2) {
          return {
            prompt: `${intro} What are the units of ${c.F}′(t)?`,
            ...mc(r, `${c.u} per ${c.tu}`, [`${c.t} per ${c.us}`, c.u, `${c.us}-${c.t}`]),
            explanation: `A derivative is a rate: output units per input unit. ${c.F} is in ${c.u} and t is in ${c.t}, so ${c.F}′(t) is in ${c.u} per ${c.tu}. Flipping the two gives ${c.t} per ${c.us}.`,
          };
        }
        const b = pick(r, [2, 3, 4, 5, 6, -2, -3, -4]), p = int(r, 0, 3), q = p + int(r, 2, 4);
        const f = (x) => x * x + b * x;
        return {
          prompt: `Let f(x) = x² ${K.signed(b)}x. What is the average rate of change of f on the interval [${p}, ${q}]?`,
          value: p + q + b,
          explanation: `f(${q}) = ${m(f(q))} and f(${p}) = ${m(f(p))}, so the average rate is (${m(f(q))} − ${m(f(p))})/(${q} − ${p}) = ${m(f(q) - f(p))}/${q - p} = ${m(p + q + b)}. That is the slope of the secant line, not f′ at an endpoint.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, 2, 5), b = int(r, 2, 9), c = int(r, 2, 5);
          return {
            prompt: `The position of a cart is s(t) = ${a}t² + ${b}t metres after t seconds. What is the instantaneous rate of change of the position at t = ${c}, in metres per second?`,
            value: 2 * a * c + b,
            explanation: `The instantaneous rate is the derivative: s′(t) = ${2 * a}t + ${b}, so s′(${c}) = ${2 * a * c + b} metres per second. Computing s(${c})/${c} = ${a * c + b} gives an AVERAGE rate from t = 0 instead.`,
          };
        }
        if (idx === 1) {
          const p = int(r, 1, 4), q = p + int(r, 2, 5);
          return {
            prompt: `Let f(x) = x². How much greater is the instantaneous rate of change of f at x = ${q} than the average rate of change of f on the interval [${p}, ${q}]?`,
            value: q - p,
            explanation: `Instantaneous: f′(x) = 2x, so f′(${q}) = ${2 * q}. Average: (${q * q} − ${p * p})/(${q} − ${p}) = ${p + q}. The difference is ${2 * q} − ${p + q} = ${q - p}.`,
          };
        }
        if (idx === 2) {
          const a = int(r, -4, 6), k = int(r, 0, 3);
          const opts = [`f′(${m(a)}) is positive`, `f′(${m(a)}) is negative`, `f′(${m(a)}) = 0`, `f′(${m(a)}) does not exist`];
          const say = [
            'is rising from left to right, and the tangent line there slopes upward',
            'is falling from left to right, and the tangent line there slopes downward',
            'has a smooth rounded peak, and the tangent line there is horizontal',
            'has a sharp corner: it arrives with slope 1 and leaves with slope −1',
          ][k];
          const why = [
            'A rising graph has a positive tangent slope, and the derivative is that slope.',
            'A falling graph has a negative tangent slope, and the derivative is that slope.',
            'A horizontal tangent has slope 0, so the derivative is 0 there.',
            'The slopes from the two sides disagree (1 and −1), so there is no single tangent slope and the derivative does not exist.',
          ][k];
          return {
            prompt: `At x = ${m(a)}, the graph of a continuous function f ${say}. Which statement is true?`,
            ...mcFixed(r, opts, opts[k]),
            explanation: `${why} The derivative at a point is the slope of the tangent line there — the instantaneous rate of change.`,
          };
        }
        const c = CTX[int(r, 0, 3)], a = int(r, 2, 6), h = int(r, 2, 4), y1 = int(r, 20, 60), rate = K.nonZero(r, -5, 7);
        return {
          prompt: `${c.Q} is ${c.F}(t) ${c.u}, where t is the time in ${c.t}. The line tangent to the graph of ${c.F} at t = ${a} passes through the points (${a}, ${y1}) and (${a + h}, ${y1 + rate * h}). What is ${c.F}′(${a}), in ${c.u} per ${c.tu}?`,
          value: rate,
          explanation: `${c.F}′(${a}) is the slope of the tangent line at t = ${a}: (${y1 + rate * h} − ${y1})/(${a + h} − ${a}) = ${m(rate)} ${c.u} per ${c.tu}. The height ${y1} is ${c.F}(${a}), not the rate.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const c = CTX[int(r, 0, 3)], t0 = int(r, 3, 10), y = int(r, 40, 200), rate = K.nonZero(r, -6, 8), d = int(r, 2, 3);
          if (Math.abs(rate) === 1) again();
          return {
            prompt: `${c.Q} is ${c.F}(t) ${c.u}, where t is the time in ${c.t}. Suppose ${c.F}(${t0}) = ${y} and ${c.F}′(${t0}) = ${m(rate)}. Using the rate of change at t = ${t0}, what is the best estimate of ${c.F}(${t0 + d})?`,
            value: y + rate * d,
            explanation: `At t = ${t0} the quantity is changing by ${m(rate)} ${c.u} per ${c.tu}. Over ${d} more ${c.t} that is about ${m(rate * d)}, so ${c.F}(${t0 + d}) ≈ ${y} ${K.signed(rate * d)} = ${y + rate * d}. Adding the rate once (${y + rate}) forgets the ${d} ${c.t}.`,
          };
        }
        if (idx === 1) {
          const n = pick(r, [100, 200, 250, 400, 500]), cost = int(r, 6, 40);
          return {
            prompt: `The cost of producing x units of a product is C(x) dollars. Which is the best interpretation of C′(${n}) = ${cost}?`,
            ...mc(r, `After ${n} units, producing one more unit raises the total cost by about $${cost}`, [
              `The total cost of producing ${n} units is $${cost}`,
              `Each of the first ${n} units costs $${cost} to produce`,
              `Producing ${cost} more units raises the total cost by about $${n}`,
            ]),
            explanation: `C′(${n}) is a rate: dollars per unit, at the moment x = ${n}. So one more unit adds about $${cost}. It is not the total cost C(${n}), and not the average cost C(${n})/${n} of the units already made.`,
          };
        }
        if (idx === 2) {
          const b = pick(r, [2, 3, 4, 5, -2, -3, -5]), p = int(r, 0, 4), q = p + 2 * int(r, 1, 3);
          return {
            prompt: `Let f(x) = x² ${K.signed(b)}x. At what value of x is the instantaneous rate of change of f equal to the average rate of change of f on the interval [${p}, ${q}]?`,
            value: (p + q) / 2,
            explanation: `Average rate on [${p}, ${q}]: (f(${q}) − f(${p}))/(${q - p}) = ${m(p + q + b)}. Instantaneous rate: f′(x) = 2x ${K.signed(b)}. Setting 2x ${K.signed(b)} = ${m(p + q + b)} gives x = ${(p + q) / 2}.`,
          };
        }
        const a = int(r, 2, 5), b = int(r, 1, 9), p = int(r, 0, 3), q = p + int(r, 2, 4);
        return {
          prompt: `The velocity of a particle is v(t) = ${a}t² + ${b} metres per second. What is the average rate of change of the velocity (the average acceleration) from t = ${p} to t = ${q}, in metres per second per second?`,
          value: a * (p + q),
          explanation: `v(${q}) = ${a * q * q + b} and v(${p}) = ${a * p * p + b}. Average rate = (${a * q * q + b} − ${a * p * p + b})/(${q} − ${p}) = ${a * (q * q - p * p)}/${q - p} = ${a * (p + q)}. The derivative v′(${q}) = ${2 * a * q} is the INSTANTANEOUS rate at the end, a different number.`,
        };
      }) },
    ],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'riemann-sums-approximation',
    skillId: 'calc-riemann-sums-approximation',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0 || idx === 1) {
          const w = pick(r, [1, 2, 3]), x0 = int(r, 0, 2);
          const xs = [0, 1, 2, 3, 4].map((i) => x0 + i * w);
          const ys = xs.map(() => int(r, 1, 12));
          const left = idx === 0;
          const used = left ? ys.slice(0, 4) : ys.slice(1);
          const sum = w * used.reduce((s, v) => s + v, 0);
          return {
            prompt: `Selected values of a function f are x: ${list(xs)} and f(x): ${list(ys)}. Use a ${left ? 'left' : 'right'} Riemann sum with the four subintervals given by the table to approximate ${INT(xs[0], xs[4], 'f(x) dx')}.`,
            value: sum,
            explanation: `Each subinterval has width ${w}. A ${left ? 'left' : 'right'} sum uses the ${left ? 'left' : 'right'} endpoint of each: ${w}(${used.join(' + ')}) = ${sum}. Using ${left ? 'the last four' : 'the first four'} values instead gives the ${left ? 'right' : 'left'} sum.`,
          };
        }
        if (idx === 2) {
          const c = int(r, 1, 6), n = int(r, 3, 4), a = int(r, 0, 1);
          const pts = Array.from({ length: n }, (_, i) => a + i + 1);
          const sum = pts.reduce((s, x) => s + x * x + c, 0);
          return {
            prompt: `Let f(x) = x² + ${c}. Use a right Riemann sum with ${n} subintervals of equal width to approximate ${INT(a, a + n, 'f(x) dx')}.`,
            value: sum,
            explanation: `The width is 1 and the right endpoints are ${pts.join(', ')}: f gives ${pts.map((x) => x * x + c).join(' + ')} = ${sum}. Starting at x = ${a} instead would be the left sum.`,
          };
        }
        const w = pick(r, [1, 2]), x0 = int(r, 0, 2);
        const xs = [0, 1, 2, 3, 4].map((i) => x0 + i * w);
        const ys = xs.map(() => int(r, 1, 12));
        const sum = 2 * w * (ys[1] + ys[3]);
        return {
          prompt: `Selected values of a function f are x: ${list(xs)} and f(x): ${list(ys)}. Use a midpoint Riemann sum with two subintervals of equal width to approximate ${INT(xs[0], xs[4], 'f(x) dx')}.`,
          value: sum,
          explanation: `Two subintervals: [${xs[0]}, ${xs[2]}] and [${xs[2]}, ${xs[4]}], each of width ${2 * w}. Their midpoints are x = ${xs[1]} and x = ${xs[3]}, so the sum is ${2 * w}(${ys[1]} + ${ys[3]}) = ${sum}. The width is ${2 * w}, not ${w}.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const w = pick(r, [2, 4]), x0 = int(r, 0, 2);
          const xs = [0, 1, 2, 3, 4].map((i) => x0 + i * w);
          const ys = xs.map(() => int(r, 1, 12));
          const sum = (w / 2) * (ys[0] + 2 * ys[1] + 2 * ys[2] + 2 * ys[3] + ys[4]);
          return {
            prompt: `Selected values of a function f are x: ${list(xs)} and f(x): ${list(ys)}. Use a trapezoidal sum with the four subintervals given by the table to approximate ${INT(xs[0], xs[4], 'f(x) dx')}.`,
            value: sum,
            explanation: `Each trapezoid has width ${w} and area ${w}·(sum of its two heights)/2. Together: (${w}/2)(${ys[0]} + 2·${ys[1]} + 2·${ys[2]} + 2·${ys[3]} + ${ys[4]}) = ${sum}. The inside values count twice; the two end values count once.`,
          };
        }
        if (idx === 1) {
          const widths = [int(r, 1, 4), int(r, 1, 4), int(r, 1, 4)];
          if (new Set(widths).size === 1) again();
          const xs = [int(r, 0, 2)];
          widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
          const ys = xs.map(() => int(r, 2, 12));
          const sum = widths.reduce((s, w, i) => s + w * ys[i], 0);
          return {
            prompt: `Selected values of a function f are x: ${list(xs)} and f(x): ${list(ys)}. Use a left Riemann sum with the three subintervals given by the table to approximate ${INT(xs[0], xs[3], 'f(x) dx')}.`,
            value: sum,
            explanation: `The widths are not equal: ${widths.join(', ')}. Left sum = ${widths.map((w, i) => `${w}(${ys[i]})`).join(' + ')} = ${sum}. Multiplying one width by the sum of the heights only works when the widths match.`,
          };
        }
        if (idx === 2) {
          const inc = int(r, 0, 1) === 1, left = int(r, 0, 1) === 1;
          const a = int(r, 0, 3), b = a + int(r, 3, 6);
          const opts = [OVER, UNDER, 'exactly equal to the integral', 'impossible to classify without knowing the concavity of f'];
          const over = inc !== left;
          return {
            prompt: `A continuous function f is positive and ${inc ? 'increasing' : 'decreasing'} on the interval [${a}, ${b}]. A ${left ? 'left' : 'right'} Riemann sum is used to approximate ${INT(a, b, 'f(x) dx')}. Compared with the integral, the approximation is`,
            ...mcFixed(r, opts, over ? OVER : UNDER),
            explanation: `On ${inc ? 'an increasing' : 'a decreasing'} function the ${left ? 'left' : 'right'} endpoint is the ${over ? 'HIGHEST' : 'LOWEST'} point of each subinterval, so every rectangle is too ${over ? 'tall' : 'short'}: ${over ? OVER : UNDER}. Increasing/decreasing settles left and right sums; concavity is what settles trapezoids.`,
          };
        }
        const c = int(r, 1, 6), n = int(r, 2, 3), a = pick(r, [0, 1, 2]);
        const mids = Array.from({ length: n }, (_, i) => a + 2 * i + 1);
        const sum = 2 * mids.reduce((s, x) => s + x * x + c, 0);
        return {
          prompt: `Let f(x) = x² + ${c}. Use a midpoint Riemann sum with ${n} subintervals of equal width to approximate ${INT(a, a + 2 * n, 'f(x) dx')}.`,
          value: sum,
          explanation: `The width is ${2 * n}/${n} = 2 and the midpoints are x = ${mids.join(', ')}. Sum = 2(${mids.map((x) => x * x + c).join(' + ')}) = ${sum}. Forgetting to multiply by the width 2 is the usual slip.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0 || idx === 1) {
          const widths = [int(r, 1, 4), int(r, 1, 4), int(r, 1, 4)];
          if (new Set(widths).size === 1) again();
          const xs = [0];
          widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
          const ys = xs.map(() => int(r, 2, 12));
          if (idx === 0) {
            const sum = widths.reduce((s, w, i) => s + w * (ys[i] + ys[i + 1]) / 2, 0);
            return {
              prompt: `Selected values of a function f are x: ${list(xs)} and f(x): ${list(ys)}. Use a trapezoidal sum with the three subintervals given by the table to approximate ${INT(xs[0], xs[3], 'f(x) dx')}.`,
              value: sum,
              explanation: `The widths differ (${widths.join(', ')}), so add the trapezoids one at a time: ${widths.map((w, i) => `${w}(${ys[i]} + ${ys[i + 1]})/2`).join(' + ')} = ${sum}. The shortcut (w/2)(first + 2·middles + last) needs equal widths.`,
            };
          }
          const sum = widths.reduce((s, w, i) => s + w * ys[i + 1], 0);
          return {
            prompt: `Water flows into a tank at a rate of R(t) litres per minute. Selected values are t: ${list(xs)} and R(t): ${list(ys)}. Use a right Riemann sum with the three subintervals given by the table to approximate the total number of litres that flow into the tank from t = ${xs[0]} to t = ${xs[3]}.`,
            value: sum,
            explanation: `The total is the integral of the rate. Right sum with widths ${widths.join(', ')}: ${widths.map((w, i) => `${w}(${ys[i + 1]})`).join(' + ')} = ${sum} litres. Each width multiplies the rate at the RIGHT end of its own subinterval.`,
          };
        }
        if (idx === 2) {
          const up = int(r, 0, 1) === 1, trap = int(r, 0, 1) === 1;
          const a = int(r, 0, 3), b = a + int(r, 3, 6);
          const opts = [OVER, UNDER, 'exactly equal to the integral', 'impossible to classify without knowing whether f is increasing or decreasing'];
          const over = trap === up;
          return {
            prompt: `The graph of a continuous function f is concave ${up ? 'up' : 'down'} on the interval [${a}, ${b}]. A ${trap ? 'trapezoidal sum' : 'midpoint Riemann sum'} is used to approximate ${INT(a, b, 'f(x) dx')}. Compared with the integral, the approximation is`,
            ...mcFixed(r, opts, over ? OVER : UNDER),
            explanation: trap
              ? `The top of each trapezoid is a chord. On a concave ${up ? 'up' : 'down'} graph every chord lies ${up ? 'above' : 'below'} the curve, so the trapezoidal sum is ${over ? OVER : UNDER}.`
              : `A midpoint rectangle has the same area as the trapezoid under the tangent line at the midpoint. On a concave ${up ? 'up' : 'down'} graph the tangent lies ${up ? 'below' : 'above'} the curve, so the midpoint sum is ${over ? OVER : UNDER} — the opposite of the trapezoidal sum.`,
          };
        }
        const a = int(r, 0, 2), b = a + int(r, 4, 8), n = pick(r, [4, 5, 8]), Lv = int(r, 20, 60), Rv = Lv + K.nonZero(r, -15, 15);
        return {
          prompt: `For a function f on the interval [${a}, ${b}], a left Riemann sum with ${n} equal subintervals gives ${Lv}, and a right Riemann sum with the same subintervals gives ${Rv}. What does the trapezoidal sum with those same subintervals give?`,
          value: (Lv + Rv) / 2,
          explanation: `Each trapezoid is the average of the left and right rectangles on its subinterval, so the trapezoidal sum is the average of the two sums: (${Lv} + ${Rv})/2 = ${(Lv + Rv) / 2}.`,
        };
      }) },
    ],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'ftc-part-2',
    skillId: 'calc-ftc-part-2',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const a = int(r, 0, 2), b = a + int(r, 1, 3);
        if (idx === 0) {
          const c = int(r, 1, 4), d = K.nonZero(r, -5, 6);
          const val = c * (b * b - a * a) + d * (b - a);
          return {
            prompt: `Evaluate ${INT(a, b, `(${2 * c}x ${K.signed(d)}) dx`)}.`,
            value: val,
            explanation: `An antiderivative is F(x) = ${K.coefTerm(c)}² ${K.signed(d)}x. F(${b}) − F(${a}) = ${m(c * b * b + d * b)} − ${m(c * a * a + d * a)} = ${m(val)}. Plugging the bounds into the integrand itself, without antidifferentiating, is the usual slip.`,
          };
        }
        if (idx === 1) {
          const c = int(r, 1, 4);
          return {
            prompt: `Evaluate ${INT(a, b, `${3 * c}x² dx`)}.`,
            value: c * (b ** 3 - a ** 3),
            explanation: `An antiderivative of ${3 * c}x² is ${K.coefTerm(c)}³. Then ${c}(${b})³ − ${c}(${a})³ = ${c * b ** 3} − ${c * a ** 3} = ${c * (b ** 3 - a ** 3)}. Differentiating instead (to ${6 * c}x) is the classic mix-up.`,
          };
        }
        if (idx === 2) {
          const p = int(r, -6, 9), q = p + K.nonZero(r, -8, 9);
          return {
            prompt: `A function f has a continuous derivative f′. If f(${a}) = ${m(p)} and f(${b + 2}) = ${m(q)}, what is ${INT(a, b + 2, 'f′(x) dx')}?`,
            value: q - p,
            explanation: `The integral of a derivative is the net change of the function: f(${b + 2}) − f(${a}) = ${m(q)} − (${m(p)}) = ${m(q - p)}. Subtracting in the other order gives ${m(p - q)}.`,
          };
        }
        const c = K.nonZero(r, -3, 4);
        const val = b ** 3 - a ** 3 + c * (b * b - a * a);
        return {
          prompt: `Evaluate ${INT(a, b, `(3x² ${K.signed(2 * c)}x) dx`)}.`,
          value: val,
          explanation: `An antiderivative is F(x) = x³ ${K.signed(c)}x². F(${b}) − F(${a}) = ${m(b ** 3 + c * b * b)} − ${m(a ** 3 + c * a * a)} = ${m(val)}. Upper bound first, then subtract the lower.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const j = int(r, 1, 3), a = int(r, 0, 2), b = a + int(r, 1, 2);
          if (b > 3) again();
          return {
            prompt: `Evaluate ${INT(a * a, b * b, `${3 * j}√x dx`)}.`,
            value: 2 * j * (b ** 3 - a ** 3),
            explanation: `Write √x = x^(1/2); an antiderivative of ${3 * j}x^(1/2) is ${2 * j}x^(3/2). At x = ${b * b} that is ${2 * j}(${b ** 3}) and at x = ${a * a} it is ${2 * j}(${a ** 3}): ${2 * j * (b ** 3 - a ** 3)}. Remember x^(3/2) = (√x)³.`,
          };
        }
        if (idx === 1) {
          const a = int(r, 1, 3), b = a + int(r, 1, 3), k = int(r, 2, 12);
          return {
            prompt: `Evaluate ${INT(a, b, `${k}/x² dx`)}.`,
            value: K.frac(k * (b - a), a * b),
            explanation: `${k}/x² = ${k}x^(−2), with antiderivative −${k}/x. Then (−${k}/${b}) − (−${k}/${a}) = ${k}/${a} − ${k}/${b} = ${K.frac(k * (b - a), a * b)}. Dropping the minus sign from −${k}/x gives the negative of this.`,
          };
        }
        if (idx === 2) {
          const b = int(r, 2, 5);
          return {
            prompt: `Evaluate ${INT(0, b, 'e^x dx')}.`,
            ...mc(r, `e^${b} − 1`, [`e^${b}`, `e^${b + 1}/${b + 1}`, `1 − e^${b}`]),
            explanation: `e^x is its own antiderivative: e^${b} − e^0 = e^${b} − 1. Forgetting that e^0 = 1 (not 0) gives e^${b}; using the power rule on e^x gives e^${b + 1}/${b + 1}; subtracting backwards gives 1 − e^${b}.`,
          };
        }
        const a = int(r, 0, 3), b = a + int(r, 2, 5), p = int(r, -6, 9), n = K.nonZero(r, -9, 12);
        return {
          prompt: `A function f has a continuous derivative f′. If f(${a}) = ${m(p)} and ${INT(a, b, 'f′(x) dx')} = ${m(n)}, what is f(${b})?`,
          value: p + n,
          explanation: `${INT(a, b, 'f′(x) dx')} = f(${b}) − f(${a}), so f(${b}) = f(${a}) + ${m(n)} = ${m(p)} ${K.signed(n)} = ${m(p + n)}. The integral is the CHANGE in f, not f(${b}) itself.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const [fn, up, val, anti] = pick(r, [
            ['sin x', 'π', 2, '−cos x'], ['sin x', 'π/2', 1, '−cos x'], ['cos x', 'π/2', 1, 'sin x'],
            ['cos x', 'π/6', 0.5, 'sin x'], ['sin x', 'π/3', 0.5, '−cos x'], ['cos x', 'π', 0, 'sin x'],
          ]);
          const k = 2 * int(r, 1, 5);
          return {
            prompt: `Evaluate ${INT(0, up, `${k} ${fn} dx`)}.`,
            value: k * val,
            explanation: `An antiderivative of ${fn} is ${anti}. Evaluating ${k}(${anti}) from 0 to ${up} gives ${k}(${val}) = ${k * val}. The sign on the antiderivative of sin x (it is −cos x) and cos 0 = 1 are where this goes wrong.`,
          };
        }
        if (idx === 1) {
          const a = int(r, 1, 3), b = a + int(r, 1, 2), k = int(r, 1, 6);
          return {
            prompt: `Evaluate ${INT(a * a, b * b, `${k}/√x dx`)}.`,
            value: 2 * k * (b - a),
            explanation: `${k}/√x = ${k}x^(−1/2), with antiderivative ${2 * k}√x. Then ${2 * k}(${b}) − ${2 * k}(${a}) = ${2 * k * (b - a)}. Treating 1/√x like 1/x (a logarithm) is the usual slip.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 0, 2), b = a + int(r, 1, 2), c = K.nonZero(r, -5, 6), p = int(r, -6, 9);
          const val = p + b ** 3 - a ** 3 + c * (b - a);
          return {
            prompt: `A function f satisfies f(${a}) = ${m(p)} and f′(x) = 3x² ${K.signed(c)} for all x. What is f(${b})?`,
            value: val,
            explanation: `f(${b}) = f(${a}) + ${INT(a, b, 'f′(x) dx')}. The integral is [x³ ${K.signed(c)}x] from ${a} to ${b} = ${m(b ** 3 + c * b)} − ${m(a ** 3 + c * a)} = ${m(val - p)}. So f(${b}) = ${m(p)} ${K.signed(val - p)} = ${m(val)}. Forgetting to add f(${a}) leaves ${m(val - p)}.`,
          };
        }
        const k = int(r, 2, 4), b = int(r, 1, 3), e = k * b;
        return {
          prompt: `Evaluate ${INT(0, b, `e^(${k}x) dx`)}.`,
          ...mc(r, `(e^${e} − 1)/${k}`, [`e^${e} − 1`, `${k}(e^${e} − 1)`, `e^${e}/${k}`]),
          explanation: `An antiderivative of e^(${k}x) is e^(${k}x)/${k} — divide by the inside derivative ${k}. Then e^${e}/${k} − e^0/${k} = (e^${e} − 1)/${k}. Leaving out the 1/${k} gives e^${e} − 1; multiplying by ${k} is the derivative, not the antiderivative.`,
        };
      }) },
    ],
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'definite-integral-as-accumulation',
    skillId: 'calc-definite-integral-as-accumulation',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0 || idx === 2) {
          const c = RATES[(idx + int(r, 0, 3)) % 4], a = int(r, 0, 3), b = a + int(r, 2, 6);
          const integral = INT(a, b, `${c.R}(t) dt`);
          if (idx === 0) {
            return {
              prompt: `${c.say}. What does ${integral} represent?`,
              ...mc(r, `${c.total} from t = ${a} to t = ${b}`, [
                `The rate, in ${c.per}, at t = ${b}`,
                `The average rate, in ${c.per}, from t = ${a} to t = ${b}`,
                `The change in the rate, ${c.R}(${b}) − ${c.R}(${a})`,
              ]),
              explanation: `Integrating a rate over an interval gives the amount accumulated over that interval: ${c.per} × ${c.tu} = ${c.u}. The change in the rate, ${c.R}(${b}) − ${c.R}(${a}), would be the integral of ${c.R}′, not of ${c.R}.`,
            };
          }
          return {
            prompt: `${c.say}. What are the units of ${integral}?`,
            ...mc(r, c.u, [c.per, `${c.per} per ${c.t1}`, c.tu]),
            explanation: `The integral multiplies the rate (${c.per}) by time (${c.tu}), so the time units cancel and ${c.u} remain. "${c.per} per ${c.t1}" would be the units of the derivative of the rate.`,
          };
        }
        if (idx === 1) {
          const b = int(r, 2, 8), h = 2 * int(r, 1, 6);
          return {
            prompt: `The graph of f on the interval [0, ${b}] is a straight line segment from the point (0, 0) to the point (${b}, ${h}). What is ${INT(0, b, 'f(x) dx')}?`,
            value: b * h / 2,
            explanation: `The integral is the area between the graph and the x-axis: a triangle with base ${b} and height ${h}, so ½(${b})(${h}) = ${b * h / 2}. Base times height without the ½ gives the rectangle, ${b * h}.`,
          };
        }
        const a = int(r, 0, 2), b = a + int(r, 2, 4), c = b + int(r, 2, 4), p = int(r, 2, 12), q = K.nonZero(r, -9, 9);
        return {
          prompt: `Suppose ${INT(a, b, 'f(x) dx')} = ${p} and ${INT(b, c, 'f(x) dx')} = ${m(q)}. What is ${INT(a, c, 'f(x) dx')}?`,
          value: p + q,
          explanation: `Accumulation over [${a}, ${c}] is accumulation over [${a}, ${b}] plus accumulation over [${b}, ${c}]: ${p} + (${m(q)}) = ${m(p + q)}. A negative piece is signed area below the axis and still adds as a negative.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const A = 10 * int(r, 3, 20), b = int(r, 4, 12), n = int(r, 15, 90);
          return {
            prompt: `Water flows into a tank at a rate of R(t) litres per minute, where t is the time in minutes. The tank holds ${A} litres at t = 0, and ${INT(0, b, 'R(t) dt')} = ${n}. How many litres are in the tank at t = ${b}?`,
            value: A + n,
            explanation: `The integral of the rate is the amount ADDED from t = 0 to t = ${b}: ${n} litres. Final amount = starting amount + accumulated change = ${A} + ${n} = ${A + n}. Reporting ${n} forgets what was already in the tank.`,
          };
        }
        if (idx === 1) {
          const b1 = int(r, 2, 6), h1 = 2 * int(r, 1, 5), w = int(r, 2, 5), d = int(r, 1, 6);
          const val = b1 * h1 / 2 - w * d;
          return {
            prompt: `The graph of f consists of two pieces. On [0, ${b1}] it lies above the x-axis and, with the axis, forms a triangle with base ${b1} and height ${h1}. On [${b1}, ${b1 + w}] it lies below the x-axis and, with the axis, forms a rectangle with width ${w} and height ${d}. What is ${INT(0, b1 + w, 'f(x) dx')}?`,
            value: val,
            explanation: `Area above the axis counts as positive and area below as negative. Triangle: ½(${b1})(${h1}) = ${b1 * h1 / 2}. Rectangle: ${w}(${d}) = ${w * d}. Integral = ${b1 * h1 / 2} − ${w * d} = ${m(val)}. Adding the two areas gives total area, ${b1 * h1 / 2 + w * d}, not the integral.`,
          };
        }
        if (idx === 2) {
          const rad = int(r, 3, 9);
          return {
            prompt: `The graph of f on the interval [${m(-rad)}, ${rad}] is the upper half of the circle of radius ${rad} centred at the origin. What is ${INT(-rad, rad, 'f(x) dx')}?`,
            ...mc(r, piStr(rad * rad, 2), [piStr(rad * rad), piStr(rad), piStr(rad * rad, 4), piStr(2 * rad)]),
            explanation: `The integral is the area under the graph: half of a circle of radius ${rad}, ½π(${rad})² = ${piStr(rad * rad, 2)}. The whole circle is ${piStr(rad * rad)}; ${piStr(rad)} is half the circumference, a length and not an area.`,
          };
        }
        const a = int(r, 0, 4), b = a + int(r, 2, 6), n = int(r, 5, 40), fwd = int(r, 0, 1) === 1;
        const span = `between t = ${a} and t = ${b}`;
        return {
          prompt: `A car moves along a straight road with velocity v(t) metres per second, where positive velocity means forward. If ${INT(a, b, 'v(t) dt')} = ${m(fwd ? n : -n)}, which statement must be true?`,
          ...mc(r, `At t = ${b} the car is ${n} metres ${fwd ? 'ahead of' : 'behind'} where it was at t = ${a}`, [
            `The car travelled a total distance of exactly ${n} metres ${span}, whatever its direction`,
            `The car's velocity ${fwd ? 'increased' : 'decreased'} by ${n} metres per second ${span}`,
            `At t = ${b} the car is ${n} metres ${fwd ? 'behind' : 'ahead of'} where it was at t = ${a}`,
          ]),
          explanation: `The integral of velocity is the net change in position (displacement): ${m(fwd ? n : -n)} metres, so the car ends ${n} metres ${fwd ? 'ahead' : 'behind'}. Total distance would need the integral of |v(t)| and could be larger if the car reversed.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const A = 10 * int(r, 5, 30), b = int(r, 4, 12), p = int(r, 30, 120), q = int(r, 20, 110);
          if (p === q || A + p - q <= 0) again();
          return {
            prompt: `Water enters a tank at a rate of E(t) litres per minute and leaves it at a rate of L(t) litres per minute. The tank holds ${A} litres at t = 0. If ${INT(0, b, 'E(t) dt')} = ${p} and ${INT(0, b, 'L(t) dt')} = ${q}, how many litres are in the tank at t = ${b}?`,
            value: A + p - q,
            explanation: `Net change = amount in − amount out = ${p} − ${q} = ${m(p - q)} litres. Amount at t = ${b}: ${A} ${K.signed(p - q)} = ${A + p - q}. Adding both integrals treats the water that left as if it arrived.`,
          };
        }
        if (idx === 1) {
          const a = int(r, 2, 4), b = a + int(r, 2, 4), c = b + int(r, 2, 4);
          const P = int(r, 3, 12), Q = int(r, 3, 14), S = int(r, 2, 10), fromA = int(r, 0, 1) === 1;
          const val = fromA ? S - Q : P - Q + S;
          return {
            prompt: `The graph of f crosses the x-axis at x = ${a} and x = ${b}. Between x = 0 and x = ${a} the graph is above the axis and encloses a region of area ${P} with the axis; between x = ${a} and x = ${b} it is below the axis and encloses a region of area ${Q}; between x = ${b} and x = ${c} it is above the axis and encloses a region of area ${S}. What is ${INT(fromA ? a : 0, c, 'f(x) dx')}?`,
            value: val,
            explanation: fromA
              ? `From x = ${a} to x = ${c} the graph is below the axis (−${Q}) and then above it (+${S}): −${Q} + ${S} = ${m(val)}. The first region lies outside the interval and is not counted.`
              : `Signed areas: +${P} − ${Q} + ${S} = ${m(val)}. Adding all three, ${P + Q + S}, is the total area, which is the integral of |f|.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 0, 3), b = a + int(r, 2, 5), p = K.nonZero(r, -8, 10), k = int(r, 2, 5), c = K.nonZero(r, -4, 6);
          const val = k * p + c * (b - a);
          return {
            prompt: `If ${INT(a, b, 'f(x) dx')} = ${m(p)}, what is ${INT(a, b, `(${k}f(x) ${K.signed(c)}) dx`)}?`,
            value: val,
            explanation: `Split it: ${k}·${INT(a, b, 'f(x) dx')} + ${INT(a, b, `${m(c)} dx`)} = ${k}(${m(p)}) + (${m(c)})(${b} − ${a}) = ${m(k * p)} ${K.signed(c * (b - a))} = ${m(val)}. The constant ${m(c)} integrates to ${m(c)} times the width ${b - a}, not to ${m(c)}.`,
          };
        }
        const rad = pick(r, [2, 4, 6]), b = int(r, 2, 6), h = 2 * int(r, 2, 7);
        const T = b * h / 2, semi = piStr(rad * rad, 2);
        return {
          prompt: `The graph of f consists of two pieces. On [0, ${2 * rad}] it is a semicircle of radius ${rad} lying below the x-axis, with its diameter on the axis. On [${2 * rad}, ${2 * rad + b}] it lies above the x-axis and, with the axis, forms a triangle with base ${b} and height ${h}. What is ${INT(0, 2 * rad + b, 'f(x) dx')}?`,
          ...mc(r, `${T} − ${semi}`, [`${T} + ${semi}`, `${T} − ${piStr(rad * rad)}`, `${semi} − ${T}`]),
          explanation: `The semicircle is below the axis, so it counts as −½π(${rad})² = −${semi}. The triangle is above: ½(${b})(${h}) = ${T}. Integral = ${T} − ${semi}. Adding the two is total area; ${piStr(rad * rad)} is the whole circle.`,
        };
      }) },
    ],
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'first-second-derivative-tests',
    skillId: 'calc-first-second-derivative-tests',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        const c = int(r, -5, 8);
        if (idx === 0) {
          const [s1, s2, k] = pick(r, [['positive', 'negative', 0], ['negative', 'positive', 1], ['positive', 'positive', 2], ['negative', 'negative', 2]]);
          return {
            prompt: `A function f is differentiable, and f′(${m(c)}) = 0. The derivative f′(x) is ${s1} just to the left of x = ${m(c)} and ${s2} just to the right. At x = ${m(c)}, f has`,
            ...mcFixed(r, EXT, EXT[k]),
            explanation: k === 2
              ? `First Derivative Test: f′ does not change sign at x = ${m(c)} (it is ${s1} on both sides), so f keeps ${s1 === 'positive' ? 'rising' : 'falling'} through the point — no local extremum, even though f′(${m(c)}) = 0.`
              : `First Derivative Test: f′ changes from ${s1} to ${s2}, so f goes from ${s1 === 'positive' ? 'rising to falling: a local maximum' : 'falling to rising: a local minimum'}. Reading the signs backwards swaps the two.`,
          };
        }
        if (idx === 1) {
          const v = K.nonZero(r, -9, 9);
          return {
            prompt: `A function f has continuous first and second derivatives, with f′(${m(c)}) = 0 and f″(${m(c)}) = ${m(v)}. At x = ${m(c)}, f has`,
            ...mcFixed(r, EXT, EXT[v < 0 ? 0 : 1]),
            explanation: `Second Derivative Test: f′(${m(c)}) = 0 and f″(${m(c)}) is ${v < 0 ? 'negative, so the graph is concave down there (a hill): a local maximum' : 'positive, so the graph is concave up there (a valley): a local minimum'}. Matching "positive" with "maximum" is the usual slip.`,
          };
        }
        const [a, b] = distinctSorted(r, 2, -6, 8);
        const wantMin = idx === 2;
        return {
          prompt: `The derivative of a function f is f′(x) = ${fac(a)}${fac(b)}. At what value of x does f have a local ${wantMin ? 'minimum' : 'maximum'}?`,
          value: wantMin ? b : a,
          explanation: `f′ is positive for x < ${m(a)}, negative between ${m(a)} and ${m(b)}, and positive for x > ${m(b)}. So f rises, falls, rises: a local maximum at x = ${m(a)} and a local minimum at x = ${m(b)}. Both are critical points; the sign change tells which is which.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const c = int(r, -5, 8);
          const opts = [
            'f has a local maximum there',
            'f has a local minimum there',
            'f has an inflection point there, so it has no local extremum',
            'Nothing: the test is inconclusive, and f could have a local maximum, a local minimum or neither',
          ];
          return {
            prompt: `A function f has continuous first and second derivatives, with f′(${m(c)}) = 0 and f″(${m(c)}) = 0. What does the Second Derivative Test say about x = ${m(c)}?`,
            ...mcFixed(r, opts, opts[3]),
            explanation: `When f″(c) = 0 the Second Derivative Test gives no conclusion: x⁴ has a minimum, −x⁴ a maximum and x³ neither, all with f′(0) = f″(0) = 0. Use the First Derivative Test instead. f″(c) = 0 alone does not make an inflection point.`,
          };
        }
        if (idx === 1) {
          const [p, q] = distinctSorted(r, 2, -6, 8);
          const [a, b] = int(r, 0, 1) ? [p, q] : [q, p];
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a, 2)}${fac(b)}. At what value of x does f have a local extremum?`,
            value: b,
            explanation: `The critical points are x = ${m(a)} and x = ${m(b)}. The squared factor ${fac(a, 2)} is never negative, so f′ does NOT change sign at x = ${m(a)}; it does change sign at x = ${m(b)} (negative to positive). Only x = ${m(b)} is a local extremum.`,
          };
        }
        if (idx === 2) {
          const a = int(r, 1, 4), neg = int(r, 0, 1) === 1, c = neg ? -a : a;
          const opts = [
            `a local maximum, because f″(${m(c)}) is negative`,
            `a local minimum, because f″(${m(c)}) is positive`,
            `a local maximum, because f″(${m(c)}) is positive`,
            `a local minimum, because f″(${m(c)}) is negative`,
          ];
          return {
            prompt: `Let f(x) = x³ − ${3 * a * a}x, so that f′(x) = 3x² − ${3 * a * a} and f″(x) = 6x. The critical points are x = ${m(-a)} and x = ${a}. According to the Second Derivative Test, at x = ${m(c)} f has`,
            ...mcFixed(r, opts, opts[neg ? 0 : 1]),
            explanation: `f″(${m(c)}) = 6(${m(c)}) = ${m(6 * c)}, which is ${neg ? 'negative: concave down at a critical point, a local maximum' : 'positive: concave up at a critical point, a local minimum'}. Concave up holds a minimum; concave down holds a maximum.`,
          };
        }
        const [p, q, s] = distinctSorted(r, 3, -6, 9);
        const [signs, min] = pick(r, [
          [['positive', 'negative', 'positive', 'positive'], q],
          [['negative', 'negative', 'positive', 'negative'], q],
          [['negative', 'positive', 'positive', 'negative'], p],
          [['positive', 'positive', 'negative', 'positive'], s],
          [['negative', 'positive', 'negative', 'negative'], p],
        ]);
        return {
          prompt: `A differentiable function f has f′(x) = 0 only at x = ${m(p)}, x = ${m(q)} and x = ${m(s)}. The sign of f′ is: ${signs[0]} for x < ${m(p)}, ${signs[1]} on (${m(p)}, ${m(q)}), ${signs[2]} on (${m(q)}, ${m(s)}), and ${signs[3]} for x > ${m(s)}. At what value of x does f have a local minimum?`,
          value: min,
          explanation: `A local minimum is where f′ changes from negative to positive. That happens only at x = ${m(min)}. A critical point where the sign stays the same is not an extremum, and positive-to-negative is a maximum.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const roots = distinctSorted(r, 3, -5, 7);
          const exps = [int(r, 1, 3), int(r, 1, 3), int(r, 1, 3)];
          const count = exps.filter((e) => e % 2 === 1).length;
          if (count === 3 && int(r, 0, 1)) again();
          return {
            prompt: `The derivative of a function f is f′(x) = ${roots.map((rt, i) => fac(rt, exps[i])).join('')}. How many local extrema does f have?`,
            value: count,
            explanation: `f has a local extremum where f′ changes sign. A factor with an odd exponent changes sign at its zero; a squared factor does not. Odd-exponent factors here: ${count}. Counting every zero of f′ (3) forgets that a critical point need not be an extremum.`,
          };
        }
        if (idx === 1) {
          const [a, b] = distinctSorted(r, 2, 1, 9);
          const wantMax = int(r, 0, 1) === 1;
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a)}(${b} − x). At what value of x does f have a local ${wantMax ? 'maximum' : 'minimum'}?`,
            value: wantMax ? b : a,
            explanation: `Because of the factor (${b} − x), f′ is negative for x < ${a}, positive between ${a} and ${b}, and negative for x > ${b}. So f has a local minimum at x = ${a} and a local maximum at x = ${b} — the reverse of (x − ${a})(x − ${b}).`,
          };
        }
        if (idx === 2) {
          const xs = distinctSorted(r, 3, -4, 9);
          const z = int(r, 0, 2), firstMin = int(r, 0, 1) === 1;
          const others = [0, 1, 2].filter((i) => i !== z);
          const vals = [0, 0, 0];
          vals[others[0]] = (firstMin ? 1 : -1) * int(r, 2, 8);
          vals[others[1]] = (firstMin ? -1 : 1) * int(r, 2, 8);
          const kind = (v) => (v > 0 ? 'minimum' : 'maximum');
          const flip = (v) => (v > 0 ? 'maximum' : 'minimum');
          const x1 = m(xs[others[0]]), x2 = m(xs[others[1]]), xz = m(xs[z]);
          const sayA = `Local ${kind(vals[others[0]])} at x = ${x1} and local ${kind(vals[others[1]])} at x = ${x2}`;
          const sayB = `Local ${flip(vals[others[0]])} at x = ${x1} and local ${flip(vals[others[1]])} at x = ${x2}`;
          return {
            prompt: `A function f has continuous first and second derivatives. Its only critical points are x = ${m(xs[0])}, x = ${m(xs[1])} and x = ${m(xs[2])}, where f′ is 0, and f″(${m(xs[0])}) = ${m(vals[0])}, f″(${m(xs[1])}) = ${m(vals[1])}, f″(${m(xs[2])}) = ${m(vals[2])}. Which conclusion follows from the Second Derivative Test?`,
            ...mc(r, `${sayA}; the test gives no conclusion at x = ${xz}`, [
              `${sayB}; the test gives no conclusion at x = ${xz}`,
              `${sayA}; no local extremum at x = ${xz}, because f″(${xz}) = 0`,
              `${sayB}; no local extremum at x = ${xz}, because f″(${xz}) = 0`,
            ]),
            explanation: `At a critical point, f″ > 0 means a local minimum and f″ < 0 a local maximum. Where f″ = 0 the test is silent — the point may still be an extremum, so "no extremum because f″ = 0" does not follow.`,
          };
        }
        const a = int(r, -5, 8), neg = int(r, 0, 1) === 1;
        const opts = [
          'a local minimum, by the First Derivative Test (f′ changes from negative to positive)',
          'a local maximum, by the First Derivative Test (f′ changes from positive to negative)',
          `no local extremum, because f″(${m(a)}) = 0`,
          'no local extremum, because f′ does not change sign there',
        ];
        return {
          prompt: `The derivative of a function f is f′(x) = ${neg ? '−' : ''}${fac(a, 3)}, so f′(${m(a)}) = 0 and f″(${m(a)}) = 0. At x = ${m(a)}, f has`,
          ...mcFixed(r, opts, opts[neg ? 1 : 0]),
          explanation: `The Second Derivative Test is inconclusive (f″ = 0), so use the first: a cubed factor keeps its sign change, and f′ goes from ${neg ? 'positive to negative — a local maximum' : 'negative to positive — a local minimum'}. f″ = 0 does not rule an extremum out.`,
        };
      }) },
    ],
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'curve-sketching-from-derivatives',
    skillId: 'calc-curve-sketching-from-derivatives',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0) {
          const [a, b] = distinctSorted(r, 2, -6, 8);
          const inc = int(r, 0, 1) === 1;
          const inner = `(${m(a)}, ${m(b)})`, outer = `(−∞, ${m(a)}) and (${m(b)}, ∞)`;
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a)}${fac(b)}. Which choice gives every interval on which f is ${inc ? 'increasing' : 'decreasing'}?`,
            ...mc(r, inc ? outer : inner, [inc ? inner : outer, `(−∞, ${m(a)})`, `(${m(b)}, ∞)`]),
            explanation: `f′ is positive for x < ${m(a)}, negative between ${m(a)} and ${m(b)}, positive for x > ${m(b)}. f is increasing where f′ > 0 and decreasing where f′ < 0, so f is ${inc ? 'increasing' : 'decreasing'} on ${inc ? outer : inner}.`,
          };
        }
        if (idx === 1) {
          const a = K.nonZero(r, -7, 7), k = pick(r, [2, 6, 12, -2, -6, -12]);
          const rightSide = `(${m(a)}, ∞)`, leftSide = `(−∞, ${m(a)})`;
          return {
            prompt: `The second derivative of a function f is f″(x) = ${m(k)}${fac(a)}. On which interval is the graph of f concave up?`,
            ...mc(r, k > 0 ? rightSide : leftSide, [k > 0 ? leftSide : rightSide, `(${m(-a)}, ∞)`, `(−∞, ${m(-a)})`]),
            explanation: `The graph is concave up where f″ > 0. ${m(k)}${fac(a)} is positive when x ${k > 0 ? '>' : '<'} ${m(a)}${k < 0 ? ' (the negative coefficient flips the inequality)' : ''}, so the interval is ${k > 0 ? rightSide : leftSide}. The zero of ${fac(a)} is x = ${m(a)}, not ${m(-a)}.`,
          };
        }
        if (idx === 2) {
          const p = int(r, -4, 4), q = p + int(r, 2, 5), up = int(r, 0, 1) === 1, cu = int(r, 0, 1) === 1;
          const opts = ['rising and concave up', 'rising and concave down', 'falling and concave up', 'falling and concave down'];
          return {
            prompt: `On the interval (${m(p)}, ${m(q)}), a function f satisfies f′(x) ${up ? '>' : '<'} 0 and f″(x) ${cu ? '>' : '<'} 0. On this interval the graph of f is`,
            ...mcFixed(r, opts, `${up ? 'rising' : 'falling'} and concave ${cu ? 'up' : 'down'}`),
            explanation: `The sign of f′ says whether f rises (positive) or falls (negative); the sign of f″ says whether the graph bends upward (positive) or downward (negative). Here: ${up ? 'rising' : 'falling'} and concave ${cu ? 'up' : 'down'}.`,
          };
        }
        const [p, q] = distinctSorted(r, 2, -6, 8);
        const [signs, at] = pick(r, [
          [['positive', 'negative', 'negative'], p], [['negative', 'negative', 'positive'], q],
          [['positive', 'positive', 'negative'], q], [['negative', 'positive', 'positive'], p],
        ]);
        return {
          prompt: `The second derivative of a function f is continuous and equals zero only at x = ${m(p)} and x = ${m(q)}. It is ${signs[0]} for x < ${m(p)}, ${signs[1]} on (${m(p)}, ${m(q)}), and ${signs[2]} for x > ${m(q)}. At what value of x does the graph of f have an inflection point?`,
          value: at,
          explanation: `An inflection point is where f″ CHANGES SIGN, so the concavity changes. That happens only at x = ${m(at)}. At the other zero f″ touches 0 without changing sign, so the concavity stays the same there.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const a = int(r, -6, 4), b = a + 2 * int(r, 1, 3), mid = (a + b) / 2;
          const opts = [`(−∞, ${m(a)})`, `(${m(a)}, ${m(mid)})`, `(${m(mid)}, ${m(b)})`, `(${m(b)}, ∞)`];
          const k = int(r, 0, 3);
          const ask = ['increasing and concave down', 'decreasing and concave down', 'decreasing and concave up', 'increasing and concave up'][k];
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a)}${fac(b)}. On which interval is the graph of f both ${ask}?`,
            ...mcFixed(r, opts, opts[k]),
            explanation: `f′ > 0 outside [${m(a)}, ${m(b)}] and f′ < 0 between. Expanding, f′(x) = x² ${K.signed(-(a + b))}x ${K.signed(a * b)}, so f″(x) = 2x ${K.signed(-(a + b))}: negative for x < ${m(mid)}, positive after. ${ask[0].toUpperCase()}${ask.slice(1)} happens on ${opts[k]}.`,
          };
        }
        if (idx === 1) {
          const [p, q] = distinctSorted(r, 2, -6, 8);
          const [a, b] = int(r, 0, 1) ? [p, q] : [q, p];
          return {
            prompt: `The second derivative of a function f is f″(x) = ${fac(a, 2)}${fac(b)}. At what value of x does the graph of f have an inflection point?`,
            value: b,
            explanation: `f″ is zero at x = ${m(a)} and x = ${m(b)}, but the squared factor never changes sign. f″ changes sign only at x = ${m(b)}, so that is the only inflection point. f″ = 0 is not enough — the concavity must actually change.`,
          };
        }
        if (idx === 2) {
          const a = int(r, -5, 7), peak = int(r, 0, 1) === 1;
          const opts = [
            `It rises to a peak at x = ${m(a)} and then falls, bending downward (concave down) throughout`,
            `It falls to a valley at x = ${m(a)} and then rises, bending upward (concave up) throughout`,
            `It rises to a peak at x = ${m(a)} and then falls, bending upward (concave up) throughout`,
            `It falls to a valley at x = ${m(a)} and then rises, bending downward (concave down) throughout`,
          ];
          return {
            prompt: `A function f is twice differentiable for all x, with f′(x) ${peak ? '>' : '<'} 0 for x < ${m(a)}, f′(x) ${peak ? '<' : '>'} 0 for x > ${m(a)}, and f″(x) ${peak ? '<' : '>'} 0 for all x. Which describes the graph of f?`,
            ...mcFixed(r, opts, opts[peak ? 0 : 1]),
            explanation: `f′ goes from ${peak ? 'positive to negative: f rises then falls, a peak' : 'negative to positive: f falls then rises, a valley'} at x = ${m(a)}. f″ ${peak ? '< 0' : '> 0'} everywhere means concave ${peak ? 'down' : 'up'} throughout.`,
          };
        }
        const a = int(r, -5, 7), pos = int(r, 0, 1) === 1;
        const opts = [
          `f has a local minimum at x = ${m(a)}, and its graph is concave up everywhere`,
          `f has a local maximum at x = ${m(a)}, and its graph is concave down everywhere`,
          `f has a local minimum at x = ${m(a)}, and its graph is concave down everywhere`,
          `f is ${pos ? 'increasing' : 'decreasing'} everywhere, and its graph has an inflection point at x = ${m(a)}`,
        ];
        return {
          prompt: `The graph of f′ (the derivative of f) is a straight line with ${pos ? 'positive' : 'negative'} slope that crosses the x-axis at x = ${m(a)}. Which describes f?`,
          ...mcFixed(r, opts, opts[pos ? 0 : 1]),
          explanation: `f′ is ${pos ? 'negative before' : 'positive before'} x = ${m(a)} and ${pos ? 'positive' : 'negative'} after, so f has a local ${pos ? 'minimum' : 'maximum'} there. The slope of f′ is f″, which is ${pos ? 'positive' : 'negative'} everywhere: concave ${pos ? 'up' : 'down'}. Reading the line as the graph of f itself is the usual slip.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const [a, b] = distinctSorted(r, 2, -6, 8);
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a, 2)}${fac(b)}. Which choice gives every interval on which f is increasing?`,
            ...mc(r, `(${m(b)}, ∞)`, [`(−∞, ${m(a)}) and (${m(b)}, ∞)`, `(${m(a)}, ${m(b)})`, `(${m(a)}, ∞)`]),
            explanation: `${fac(a, 2)} is never negative, so the sign of f′ is the sign of ${fac(b)}: negative for x < ${m(b)}, positive for x > ${m(b)}. f is increasing only on (${m(b)}, ∞). Treating x = ${m(a)} as a sign change gives (−∞, ${m(a)}) and (${m(b)}, ∞).`,
          };
        }
        if (idx === 1) {
          const p = int(r, -5, 7), upFirst = int(r, 0, 1) === 1;
          const opts = [`Only for x < ${m(p)}`, `Only for x > ${m(p)}`, 'For all x, because f′ is positive everywhere', 'Nowhere, because f′ is never zero'];
          return {
            prompt: `The graph of f′ (the derivative of f) lies above the x-axis for all x. It ${upFirst ? 'rises' : 'falls'} for x < ${m(p)} and ${upFirst ? 'falls' : 'rises'} for x > ${m(p)}. Where is the graph of f concave up?`,
            ...mcFixed(r, opts, opts[upFirst ? 0 : 1]),
            explanation: `f is concave up where f′ is INCREASING (that is where f″ > 0). f′ rises for x ${upFirst ? '<' : '>'} ${m(p)}, so f is concave up only there, with an inflection point at x = ${m(p)}. f′ > 0 only says f is increasing; it says nothing about concavity.`,
          };
        }
        if (idx === 2) {
          const [a, b] = distinctSorted(r, 2, -6, 9);
          return {
            prompt: `The derivative of a function f is f′(x) = ${fac(a)}${fac(b)}. At what value of x does the graph of f have an inflection point?`,
            value: (a + b) / 2,
            explanation: `Expand: f′(x) = x² ${K.signed(-(a + b))}x ${K.signed(a * b)}, so f″(x) = 2x ${K.signed(-(a + b))}, which is zero and changes sign at x = ${m((a + b) / 2)}. The zeros of f′ (${m(a)} and ${m(b)}) are where the extrema are, not the inflection point.`,
          };
        }
        const a = int(r, -6, 2), b = a + int(r, 3, 6), mid = a + int(r, 1, b - a - 1), up = int(r, 0, 1) === 1;
        const [k1, k2] = up ? ['maximum', 'minimum'] : ['minimum', 'maximum'];
        return {
          prompt: `A function f is twice differentiable for all x. f′(x) ${up ? '>' : '<'} 0 for x < ${m(a)} and for x > ${m(b)}, and f′(x) ${up ? '<' : '>'} 0 on (${m(a)}, ${m(b)}). Also f″(x) ${up ? '<' : '>'} 0 for x < ${m(mid)} and f″(x) ${up ? '>' : '<'} 0 for x > ${m(mid)}. Which describes the graph of f?`,
          ...mc(r, `Local ${k1} at x = ${m(a)}, local ${k2} at x = ${m(b)}, inflection point at x = ${m(mid)}`, [
            `Local ${k2} at x = ${m(a)}, local ${k1} at x = ${m(b)}, inflection point at x = ${m(mid)}`,
            `Local ${k1} at x = ${m(a)}, local ${k2} at x = ${m(mid)}, inflection point at x = ${m(b)}`,
            `Local ${k1} at x = ${m(a)} and at x = ${m(b)}, inflection point at x = ${m(mid)}`,
          ]),
          explanation: `f′ changes ${up ? 'from positive to negative' : 'from negative to positive'} at x = ${m(a)} (local ${k1}) and back at x = ${m(b)} (local ${k2}). f″ changes sign at x = ${m(mid)}, so the concavity changes there: an inflection point.`,
        };
      }) },
    ],
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  {
    courseSkill: 'exponential-growth-decay-models',
    skillId: 'calc-exponential-growth-decay-models',
    tiers: [
      { difficulty: 2, gen: g((r, idx) => {
        if (idx === 0) {
          const k = pick(r, [0.2, 0.3, 0.4, 0.5, 0.6, 0.8]) * pick(r, [1, -1]), y0 = int(r, 3, 60);
          if (y0 === 10 * Math.abs(k)) again();
          return {
            prompt: `A quantity y satisfies the differential equation dy/dt = ${m(k)}y, with y(0) = ${y0}. Which function is y(t)?`,
            ...mc(r, `y = ${y0}e^(${m(k)}t)`, [`y = ${y0}e^(${m(-k)}t)`, `y = ${m(k)}e^(${y0}t)`, `y = ${y0} ${k < 0 ? '−' : '+'} ${Math.abs(k)}t`]),
            explanation: `dy/dt = ky has the solution y = y₀e^(kt), with y₀ the starting amount and k the constant in the equation: y = ${y0}e^(${m(k)}t). Swapping the two numbers, or dropping the sign of k, are the usual slips; a straight line would have a CONSTANT rate, not one proportional to y.`,
          };
        }
        if (idx === 1) {
          const pct = int(r, 2, 9);
          return {
            prompt: `A population P grows at a rate equal to ${pct}% of its current size per year, where t is the time in years. Which differential equation models P?`,
            ...mc(r, `dP/dt = 0.0${pct}P`, [`dP/dt = 0.0${pct}`, `dP/dt = 0.0${pct}t`, `dP/dt = 1.0${pct}P`]),
            explanation: `"Rate proportional to current size" means dP/dt = kP with k = ${pct}% = 0.0${pct}. dP/dt = 0.0${pct} is a constant rate, and 1.0${pct} is the yearly growth FACTOR, not the rate constant.`,
          };
        }
        const n = int(r, 2, 4), T = int(r, 2, 8);
        if (idx === 2) {
          const y0 = 50 * int(r, 1, 8);
          return {
            prompt: `A bacteria culture grows so that dy/dt = ky, and its size doubles every ${T} hours. If there are ${y0} bacteria at t = 0, how many are there at t = ${n * T} hours?`,
            value: y0 * 2 ** n,
            explanation: `${n * T} hours is ${n} doubling times, so the culture doubles ${n} times: ${y0} × 2^${n} = ${y0 * 2 ** n}. Multiplying by 2·${n} = ${2 * n} treats the growth as linear.`,
          };
        }
        const j = int(r, 1, 9), y0 = j * 2 ** n * pick(r, [1, 5]);
        return {
          prompt: `A radioactive sample decays so that dy/dt = ky, and it has a half-life of ${T} days. If the sample has a mass of ${y0} grams at t = 0, how many grams remain at t = ${n * T} days?`,
          value: y0 / 2 ** n,
          explanation: `${n * T} days is ${n} half-lives, so the mass is halved ${n} times: ${y0} ÷ 2^${n} = ${y0 / 2 ** n} grams. Dividing by 2·${n} = ${2 * n} is the linear slip.`,
        };
      }) },
      { difficulty: 3, gen: g((r, idx) => {
        if (idx === 0) {
          const A = 10 * int(r, 2, 20), c = pick(r, [2, 3, 5]), T = int(r, 2, 9);
          if (T === c) again();
          return {
            prompt: `A quantity grows according to y = ${A}e^(kt). If y = ${c * A} when t = ${T}, what is k?`,
            ...mc(r, `(ln ${c})/${T}`, [`${c}/${T}`, `${T} ln ${c}`, `(ln ${T})/${c}`]),
            explanation: `${c * A} = ${A}e^(${T}k) gives e^(${T}k) = ${c}, so ${T}k = ln ${c} and k = (ln ${c})/${T}. Skipping the logarithm gives ${c}/${T}; multiplying by ${T} instead of dividing gives ${T} ln ${c}.`,
          };
        }
        const k = pick(r, [0.02, 0.04, 0.05, 0.1, 0.2, 0.25]);
        if (idx === 1) {
          return {
            prompt: `A quantity satisfies dy/dt = ${k}y, where t is in years. How many years does it take the quantity to double?`,
            ...mc(r, `(ln 2)/${k}`, [`2/${k}`, `${k} ln 2`, `1/${k}`]),
            explanation: `y = y₀e^(${k}t) doubles when e^(${k}t) = 2, so ${k}t = ln 2 and t = (ln 2)/${k}. The doubling time is always (ln 2)/k; 2/${k} leaves out the logarithm.`,
          };
        }
        if (idx === 2) {
          return {
            prompt: `A substance decays according to dy/dt = −${k}y, where t is in days. What is its half-life, in days?`,
            ...mc(r, `(ln 2)/${k}`, [`−(ln 2)/${k}`, `${k} ln 2`, `${dec(1 / (2 * k))}`]),
            explanation: `y = y₀e^(−${k}t) is halved when e^(−${k}t) = 1/2, so −${k}t = ln(1/2) = −ln 2 and t = (ln 2)/${k}. A half-life is a positive time; ${dec(1 / (2 * k))} comes from solving ${k}t = 1/2 without any logarithm.`,
          };
        }
        const A = int(r, 2, 12), c = int(r, 2, 5), T = int(r, 2, 9);
        return {
          prompt: `A quantity satisfies dy/dt = ky. If y(0) = ${A} and y(${T}) = ${c * A}, what is y(${2 * T})?`,
          value: c * c * A,
          explanation: `Exponential growth multiplies by the same factor over equal times. From t = 0 to ${T} the factor is ${c}, so from ${T} to ${2 * T} it is ${c} again: ${c * A} × ${c} = ${c * c * A}. Adding the same AMOUNT again (${2 * c * A - A}) is the linear slip.`,
        };
      }) },
      { difficulty: 4, gen: g((r, idx) => {
        if (idx === 0) {
          const H = pick(r, [3, 5, 6, 8, 12, 20, 30]);
          return {
            prompt: `A radioactive substance decays according to y = y₀e^(kt), with t in years, and has a half-life of ${H} years. What is k?`,
            ...mc(r, `−(ln 2)/${H}`, [`(ln 2)/${H}`, `−${H} ln 2`, `−1/${2 * H}`]),
            explanation: `Half remains at t = ${H}: e^(${H}k) = 1/2, so ${H}k = ln(1/2) = −ln 2 and k = −(ln 2)/${H}. Decay needs a NEGATIVE k; −1/${2 * H} comes from setting ${H}k = −1/2 with no logarithm.`,
          };
        }
        if (idx === 1) {
          const c = pick(r, [2, 3]), n = int(r, 2, 4), T = int(r, 3, 12), P0 = 100 * int(r, 1, 9);
          return {
            prompt: `A population grows so that dP/dt = kP, and it ${c === 2 ? 'doubles' : 'triples'} every ${T} years. Starting from a population of ${P0}, how many years does it take to reach ${P0 * c ** n}?`,
            value: n * T,
            explanation: `${P0 * c ** n}/${P0} = ${c ** n} = ${c}^${n}, so the population must ${c === 2 ? 'double' : 'triple'} ${n} times: ${n} × ${T} = ${n * T} years. Dividing ${c ** n} by ${c} and multiplying by ${T} treats the growth as linear.`,
          };
        }
        if (idx === 2) {
          const [k, t] = pick(r, [[0.2, 10], [0.5, 4], [0.25, 8], [0.1, 30], [0.5, 6], [0.2, 15], [0.4, 5]]);
          const N = Math.round(k * t), y0 = 10 * int(r, 2, 12);
          return {
            prompt: `A quantity satisfies dy/dt = −${k}y with y(0) = ${y0}. What is y(${t})?`,
            ...mc(r, `${y0}e^(−${N})`, [`${y0}e^(${N})`, `${y0}e^(−${k})`, `${m(y0 * (1 - N))}`]),
            explanation: `y = ${y0}e^(−${k}t), so y(${t}) = ${y0}e^(−${k}·${t}) = ${y0}e^(−${N}). Leaving t out gives ${y0}e^(−${k}); a straight line ${y0} − ${k}(${y0})(${t}) = ${m(y0 * (1 - N))} assumes the rate never changes.`,
          };
        }
        const n = pick(r, [2, 4, 5, 10, 20]), c = pick(r, [2, 3, 5]), A = 10 * int(r, 2, 15);
        return {
          prompt: `A quantity satisfies dy/dt = ${dec(1 / n)}y with y(0) = ${A}. At what time t does y reach ${c * A}?`,
          ...mc(r, `${n} ln ${c}`, [`(ln ${c})/${n}`, `${c * n}`, `${n}e^${c}`]),
          explanation: `y = ${A}e^(${dec(1 / n)}t) = ${c * A} gives e^(${dec(1 / n)}t) = ${c}, so ${dec(1 / n)}t = ln ${c} and t = (ln ${c})/${dec(1 / n)} = ${n} ln ${c}. Multiplying by ${dec(1 / n)} instead of dividing gives (ln ${c})/${n}; ${c * n} skips the logarithm.`,
        };
      }) },
    ],
  },
];

module.exports = { COURSE_ID, GB, TEMPLATES };
