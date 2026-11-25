'use strict';
/**
 * At-level check items for nine Pre-Calculus course skills (see
 * scripts/buildCourseLevelItems.js for why these exist).
 *
 *   radian-measure-arc-length · trig-function-graphs · sinusoidal-modeling ·
 *   triangle-area-applications · parabola-analysis · series-sigma-notation ·
 *   limits-intuitive · limits-algebraic · limits-continuity-infinity
 *
 * No picture exists, so a graph is described in words and a table is written
 * inline ("x: 1.9, 1.99 … and f(x): …"). A typed answer is one number (an
 * integer, a terminating decimal or a fraction such as -1/9); anything with π,
 * √, ∞, a point, an equation or words is multiple choice, and each wrong choice
 * is the answer a named slip produces (sector area for arc length, 2πb for the
 * period, the focus-directrix distance used as p, f(c) for the limit …).
 *
 * Every answer is re-solved from the printed prompt in
 * tests/unit/courseLevelPrecalcB.test.js.
 */

const K = require('./templateKit');
const { int, pick } = K;

const COURSE_ID = 'precalculus';
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
  const k = int(r, 0, 3);
  const options = opts.slice(k).concat(opts.slice(0, k));
  return { value: correct, options, correctOption: 'ABCD'[options.indexOf(correct)] };
}

/** A number for display, with the Unicode minus. */
const neg = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const sgn = K.signed;
/** A fraction for display, with the Unicode minus. */
const fracD = (n, d) => K.frac(n, d).replace('-', '−');
const pt = (x, y) => `(${neg(x)}, ${neg(y)})`;
const dec = (x) => String(Number(x.toFixed(2)));
const unit = (r) => pick(r, ['cm', 'm', 'ft', 'mm']);

/** "12π", "π", "25π/3", "−π/3" — a rational multiple of π in lowest terms. */
function piStr(n, d = 1) {
  const [a, b] = K.reduce(n, d);
  const m = Math.abs(a);
  return `${a < 0 ? '−' : ''}${m === 1 ? '' : m}π${b === 1 ? '' : `/${b}`}`;
}

const SUP = ['', '', '²', '³', '⁴'];
/** A polynomial from its coefficients, highest power first: "2x² − 5x − 3". */
function poly(cs, v = 'x') {
  const n = cs.length - 1;
  let out = '';
  cs.forEach((c, i) => {
    if (!c) return;
    const p = n - i;
    const mag = Math.abs(c);
    const body = p === 0 ? String(mag) : `${mag === 1 ? '' : mag}${v}${SUP[p]}`;
    out += out ? ` ${c < 0 ? '−' : '+'} ${body}` : `${c < 0 ? '−' : ''}${body}`;
  });
  return out || '0';
}
/** The same polynomial written lowest power first: "3 − 2x²". */
function polyAsc(cs, v = 'x') {
  let out = '';
  cs.forEach((c, p) => {
    if (!c) return;
    const mag = Math.abs(c);
    const body = p === 0 ? String(mag) : `${mag === 1 ? '' : mag}${v}${SUP[p]}`;
    out += out ? ` ${c < 0 ? '−' : '+'} ${body}` : `${c < 0 ? '−' : ''}${body}`;
  });
  return out || '0';
}

/** "3 sin(2x) + 1", "−cos(πx/4) − 2". */
function trig(a, fn, inner, d) {
  const lead = a === 1 ? '' : (a === -1 ? '−' : `${neg(a)} `);
  return `${lead}${fn}(${inner})${d ? ` ${sgn(d)}` : ''}`;
}
const bx = (b, v = 'x') => (b === 1 ? v : `${b}${v}`);
const pix = (n, v = 'x') => (n === 1 ? `π${v}` : `π${v}/${n}`);

// Angles as [numerator, denominator] of π.
const ANGLES = [[1, 3], [2, 3], [1, 4], [3, 4], [1, 6], [5, 6], [1, 2], [3, 2], [4, 3], [5, 4]];

// ── radian measure, arc length, sectors, angular speed ─────────────────────

const RADIAN = {
  courseSkill: 'radian-measure-arc-length',
  skillId: 'pc-radian-measure-arc-length',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const D = pick(r, [135, 150, 210, 225, 240, 300, 315, 330, 75, 105]);
        return {
          prompt: `Convert ${D}° to radians. Give the answer in terms of π.`,
          ...mc(r, piStr(D, 180), [piStr(D, 360), piStr(D, 90), piStr(180, D)]),
          explanation: `Multiply by π/180: ${D} · π/180 = ${piStr(D, 180)}. Dividing by 360 gives ${piStr(D, 360)}, and turning the fraction over (180/${D}) gives ${piStr(180, D)}.`,
        };
      }
      if (form === 1) {
        const [n, d] = pick(r, [[5, 6], [7, 6], [3, 4], [5, 4], [4, 3], [5, 3], [7, 4], [11, 6], [2, 3], [3, 2], [5, 12], [7, 12]]);
        return {
          prompt: `Convert ${piStr(n, d)} radians to degrees. Type the number of degrees.`,
          value: n * 180 / d,
          explanation: `Multiply by 180/π: (${piStr(n, d)}) · 180/π = ${n} · 180/${d} = ${n * 180 / d}°. π radians is 180°, not 360°.`,
        };
      }
      if (form === 2) {
        const rad = int(r, 3, 12), u = unit(r);
        const [n, d] = pick(r, ANGLES);
        return {
          prompt: `A circle has a radius of ${rad} ${u}. A central angle of ${piStr(n, d)} radians intercepts an arc of the circle. What is the length of the arc, in ${u}?`,
          ...mc(r, piStr(n * rad, d), [piStr(n * rad * rad, 2 * d), piStr(2 * n * rad, d), piStr(n * rad, 2 * d)]),
          explanation: `With the angle in radians, s = rθ = ${rad} · ${piStr(n, d)} = ${piStr(n * rad, d)}. The choice ${piStr(n * rad * rad, 2 * d)} is the sector's area, (1/2)r²θ.`,
        };
      }
      const rad = 2 * int(r, 1, 7), u = unit(r);
      const th = pick(r, [0.5, 1.5, 2, 2.5, 3, 4]);
      return {
        prompt: `A circle has a radius of ${rad} ${u}. A central angle of ${th} radians intercepts an arc. What is the length of the arc, in ${u}?`,
        value: rad * th,
        explanation: `The angle is already in radians, so s = rθ = ${rad} · ${th} = ${rad * th}. No factor of π or 180 is needed.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const rad = int(r, 3, 12), u = unit(r);
        const [n, d] = pick(r, ANGLES);
        return {
          prompt: `A sector of a circle has a radius of ${rad} ${u} and a central angle of ${piStr(n, d)} radians. What is the area of the sector, in ${u}²?`,
          ...mc(r, piStr(n * rad * rad, 2 * d), [piStr(n * rad, d), piStr(n * rad * rad, d), piStr(n * rad, 2 * d)]),
          explanation: `Area = (1/2)r²θ = (1/2)(${rad})²(${piStr(n, d)}) = ${piStr(n * rad * rad, 2 * d)}. Leaving out the 1/2 gives ${piStr(n * rad * rad, d)}; ${piStr(n * rad, d)} is the arc length rθ.`,
        };
      }
      if (form === 1) {
        const rad = 2 * int(r, 2, 8), u = unit(r);
        const th = pick(r, [0.5, 1.5, 2.5, 3, 4, 3.5]);
        return {
          prompt: `An arc of length ${rad * th} ${u} lies on a circle with a radius of ${rad} ${u}. What is the measure of the arc's central angle, in radians?`,
          value: th,
          explanation: `From s = rθ, θ = s/r = ${rad * th}/${rad} = ${th} radians. Dividing the other way (r/s) is the usual slip.`,
        };
      }
      if (form === 2) {
        const d = pick(r, [3, 4, 6]);
        const b = int(r, 1, 2 * d - 1);
        if (K.gcd(b, d) !== 1) again();
        const n = pick(r, [b + 2 * d, b + 4 * d, b - 2 * d]);
        const m = (x) => ((x % (2 * d)) + 2 * d) % (2 * d);
        return {
          prompt: `Which angle between 0 and 2π is coterminal with ${piStr(n, d)}?`,
          ...mc(r, piStr(b, d), [piStr(m(b + d), d), piStr(2 * d - b, d), piStr(m(3 * d - b), d)]),
          explanation: `Add or subtract full turns of 2π = ${2 * d}π/${d}: ${piStr(n, d)} ${n > 0 ? '−' : '+'} ${piStr(Math.abs(n - b), d)} = ${piStr(b, d)}. Moving by π instead of 2π gives ${piStr(m(b + d), d)}, which points the opposite way.`,
        };
      }
      const rad = int(r, 4, 30), w = int(r, 3, 12);
      return {
        prompt: `A wheel with a radius of ${rad} cm turns at an angular speed of ${w} radians per second. What is the linear speed of a point on the rim, in cm per second?`,
        value: rad * w,
        explanation: `Linear speed v = rω = ${rad} · ${w} = ${rad * w} cm per second. Each radian of turn moves the rim one radius.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const N = pick(r, [15, 20, 25, 40, 45, 50, 75, 90, 120, 150]);
        return {
          prompt: `A wheel turns at ${N} revolutions per minute. What is its angular speed in radians per second?`,
          ...mc(r, piStr(N, 30), [piStr(N, 60), piStr(2 * N), piStr(120 * N)]),
          explanation: `Each revolution is 2π radians and a minute is 60 seconds: ${N} · 2π/60 = ${piStr(N, 30)}. ${piStr(2 * N)} is radians per MINUTE; ${piStr(N, 60)} forgets the 2 in 2π.`,
        };
      }
      if (form === 1) {
        const rad = int(r, 3, 15), N = pick(r, [20, 30, 40, 50, 60, 80, 100]);
        return {
          prompt: `A wheel with a radius of ${rad} cm turns at ${N} revolutions per minute. What is the linear speed of a point on the rim, in cm per minute?`,
          ...mc(r, piStr(2 * N * rad), [piStr(N * rad), piStr(2 * N), piStr(N * rad * rad)]),
          explanation: `Angular speed ω = ${N} · 2π = ${piStr(2 * N)} radians per minute, and v = rω = ${rad} · ${piStr(2 * N)} = ${piStr(2 * N * rad)}. Stopping at ${piStr(2 * N)} gives the angular speed, not the linear speed.`,
        };
      }
      if (form === 2) {
        const rad = int(r, 3, 12), u = unit(r);
        const [n, d] = pick(r, ANGLES);
        return {
          prompt: `A sector of a circle has a radius of ${rad} ${u} and an area of ${piStr(n * rad * rad, 2 * d)} ${u}². What is the measure of its central angle, in radians?`,
          ...mc(r, piStr(n, d), [piStr(n, 2 * d), piStr(n * rad, 2 * d), piStr(2 * n, d)]),
          explanation: `From A = (1/2)r²θ, θ = 2A/r² = 2(${piStr(n * rad * rad, 2 * d)})/${rad * rad} = ${piStr(n, d)}. Forgetting to double (A/r²) gives ${piStr(n, 2 * d)}; dividing by r only gives ${piStr(n * rad, 2 * d)}.`,
        };
      }
      const rad = int(r, 4, 18), u = unit(r);
      const D = pick(r, [40, 50, 75, 80, 100, 135, 150, 210, 240]);
      return {
        prompt: `A circle has a radius of ${rad} ${u}. A central angle of ${D}° intercepts an arc. What is the length of the arc, in ${u}?`,
        ...mc(r, piStr(D * rad, 180), [String(rad * D), piStr(D * rad, 360), piStr(D * rad * rad, 360)]),
        explanation: `s = rθ needs radians: ${D}° = ${piStr(D, 180)}, so s = ${rad} · ${piStr(D, 180)} = ${piStr(D * rad, 180)}. Multiplying ${rad} by ${D} uses degrees in a radian formula.`,
      };
    }) },
  ],
};

// ── graphs of trig functions ───────────────────────────────────────────────

const TRIG_GRAPHS = {
  courseSkill: 'trig-function-graphs',
  skillId: 'pc-trig-function-graphs',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      const fn = pick(r, ['sin', 'cos']);
      const A = int(r, 2, 7), a = pick(r, [A, A, -A]);
      const b = int(r, 2, 6), d = K.nonZero(r, -6, 6);
      if (A === b || A === Math.abs(d) || b === Math.abs(d)) again();
      const f = `y = ${trig(a, fn, bx(b), d)}`;
      if (form === 0) {
        return {
          prompt: `What is the amplitude of ${f}?`,
          value: A,
          explanation: `For y = a·${fn}(bx) + d the amplitude is |a| = ${A}. The ${b} sets the period and the ${neg(d)} moves the midline; amplitude is never negative.`,
        };
      }
      if (form === 1) {
        return {
          prompt: `What is the period of ${f}?`,
          ...mc(r, piStr(2, b), [piStr(2 * b), piStr(1, b), piStr(b)]),
          explanation: `Period = 2π/b, and b = ${b}: ${piStr(2, b)}. Multiplying by ${b} instead of dividing gives ${piStr(2 * b)}; π/${b} would be right for tangent, not ${fn === 'sin' ? 'sine' : 'cosine'}.`,
        };
      }
      if (form === 2) {
        return {
          prompt: `The midline of ${f} is the horizontal line y = k. What is k?`,
          value: d,
          explanation: `The graph of ${fn} is centred on y = 0, and the constant ${neg(d)} moves it to the line y = ${neg(d)}. The ${neg(a)} is the vertical stretch, not the shift.`,
        };
      }
      const max = int(r, 0, 1) === 1;
      return {
        prompt: `What is the ${max ? 'maximum' : 'minimum'} value of ${f}?`,
        value: max ? d + A : d - A,
        explanation: `The graph swings ${A} above and below its midline y = ${neg(d)}, so the ${max ? 'maximum' : 'minimum'} is ${neg(d)} ${max ? '+' : '−'} ${A} = ${neg(max ? d + A : d - A)}. ${a < 0 ? 'The negative sign flips the graph but not its highest and lowest values.' : `Answering ${max ? A : -A} ignores the vertical shift.`}`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      const fn = pick(r, ['sin', 'cos']);
      const A = int(r, 2, 6), a = pick(r, [A, -A]);
      const d = K.nonZero(r, -5, 5);
      if (form === 0) {
        const n = int(r, 2, 9);
        return {
          prompt: `What is the period of y = ${trig(a, fn, pix(n), d)}?`,
          value: 2 * n,
          explanation: `Here b = π/${n}, so the period is 2π ÷ (π/${n}) = 2π · ${n}/π = ${2 * n}. The π cancels, so the period is a whole number.`,
        };
      }
      if (form === 1) {
        const b = int(r, 2, 4), m = pick(r, [2, 3, 4, 6]);
        const right = int(r, 0, 1) === 1;
        const inner = `${b}(x ${right ? '−' : '+'} ${piStr(1, m)})`;
        const c = piStr(1, m), bc = piStr(b, m);
        const side = (s, to) => `${s} units to the ${to}`;
        return {
          prompt: `Compared with the graph of y = ${trig(a, fn, bx(b), d)}, how is the graph of y = ${trig(a, fn, inner, d)} shifted horizontally?`,
          ...mc(r, side(c, right ? 'right' : 'left'), [side(c, right ? 'left' : 'right'), side(bc, right ? 'right' : 'left'), side(bc, right ? 'left' : 'right')]),
          explanation: `In y = a·${fn}(b(x − c)) + d the shift is c. Here x ${right ? '−' : '+'} ${c} means c = ${right ? '' : '−'}${c}: ${c} to the ${right ? 'right' : 'left'}. The b is already factored out, so do not multiply by ${b}; and x − c moves RIGHT.`,
        };
      }
      if (form === 2) {
        const b = int(r, 2, 6);
        if (b === A) again();
        const iv = (lo, hi) => `[${neg(lo)}, ${neg(hi)}]`;
        return {
          prompt: `What is the range of y = ${trig(a, fn, bx(b), d)}?`,
          ...mc(r, iv(d - A, d + A), [iv(-A, A), iv(d, d + A), iv(d - b, d + b)]),
          explanation: `The outputs run from d − |a| to d + |a|: ${neg(d)} − ${A} = ${neg(d - A)} up to ${neg(d)} + ${A} = ${neg(d + A)}. ${iv(-A, A)} forgets the vertical shift, and ${iv(d - b, d + b)} uses the ${b} that controls the period.`,
        };
      }
      const b = int(r, 2, 6);
      return {
        prompt: `What is the period of y = ${trig(a, 'tan', bx(b), 0)}?`,
        ...mc(r, piStr(1, b), [piStr(2, b), piStr(b), piStr(2 * b)]),
        explanation: `Tangent repeats every π, not 2π, so its period is π/b = ${piStr(1, b)}. Using the sine and cosine rule 2π/b gives ${piStr(2, b)}.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const fn = pick(r, ['sin', 'cos']);
        const a = int(r, 2, 6), b = int(r, 2, 4), d = K.nonZero(r, -4, 4);
        const [p, q] = pick(r, [[1, 1], [1, 2], [1, 3], [2, 3], [1, 4]]);
        const right = int(r, 0, 1) === 1;
        const inner = `${b}x ${right ? '−' : '+'} ${piStr(p, q)}`;
        const c = piStr(p, q * b), raw = piStr(p, q);
        const side = (s, to) => `${s} units to the ${to}`;
        return {
          prompt: `What is the phase shift of y = ${trig(a, fn, inner, d)}?`,
          ...mc(r, side(c, right ? 'right' : 'left'), [side(raw, right ? 'right' : 'left'), side(c, right ? 'left' : 'right'), side(raw, right ? 'left' : 'right')]),
          explanation: `Factor out the ${b} first: ${inner} = ${b}(x ${right ? '−' : '+'} ${c}). The shift is ${c} to the ${right ? 'right' : 'left'}. Reading ${raw} straight off the equation skips the division by ${b}.`,
        };
      }
      if (form === 1) {
        const A = int(r, 2, 7), d = int(r, 2, 9), N = pick(r, [4, 6, 8, 10, 12, 16]);
        if (A === d) again();
        const eq = (amp, inner, mid) => `y = ${amp} sin(${inner}) + ${mid}`;
        return {
          prompt: `A sinusoidal graph has an amplitude of ${A}, a period of ${N}, and a midline of y = ${d}. It crosses its midline at x = 0, going up. Which equation matches the graph?`,
          ...mc(r, eq(A, pix(N / 2), d), [eq(A, bx(N), d), eq(d, pix(N / 2), A), eq(A, pix(N), d)]),
          explanation: `Amplitude ${A} is the coefficient, the midline ${d} is the constant, and b = 2π/period = 2π/${N} = π/${N / 2}. Using b = ${N} gives a period of 2π/${N}; b = π/${N} gives a period of ${2 * N}.`,
        };
      }
      if (form === 2) {
        const b = pick(r, [2, 4, 6]);
        const a = int(r, 2, 5);
        return {
          prompt: `Which of these lines is a vertical asymptote of the graph of y = ${trig(a, 'tan', bx(b), 0)}?`,
          ...mc(r, `x = ${piStr(1, 2 * b)}`, [`x = ${piStr(1, b)}`, `x = ${piStr(1, 2)}`, `x = ${piStr(b, 2)}`]),
          explanation: `Tangent has asymptotes where its input is π/2: ${b}x = π/2 gives x = ${piStr(1, 2 * b)}. At x = ${piStr(1, b)} the input is π, where tangent is 0; x = π/2 is the asymptote of plain tan(x).`,
        };
      }
      const A = int(r, 2, 9), d = K.nonZero(r, -8, 12);
      const ask = pick(r, ['a', 'd']);
      return {
        prompt: `A function of the form y = a·cos(bx) + d with a > 0 has a maximum value of ${neg(d + A)} and a minimum value of ${neg(d - A)}. What is the value of ${ask}?`,
        value: ask === 'a' ? A : d,
        explanation: ask === 'a'
          ? `The amplitude is half the distance from minimum to maximum: (${neg(d + A)} − (${neg(d - A)}))/2 = ${A}. The average of the two, ${neg(d)}, is d (the midline).`
          : `The midline is halfway between the extremes: (${neg(d + A)} + (${neg(d - A)}))/2 = ${neg(d)}. Half their difference, ${A}, is the amplitude a.`,
      };
    }) },
  ],
};

// ── sinusoidal modeling ────────────────────────────────────────────────────

const SINUSOID = {
  courseSkill: 'sinusoidal-modeling',
  skillId: 'pc-sinusoidal-modeling',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const L = int(r, 2, 8), A = int(r, 8, 40);
        return {
          prompt: `The lowest point of a Ferris wheel is ${L} m above the ground and the highest point is ${L + 2 * A} m above the ground. A rider's height over time is modeled by a sinusoidal function. What is the amplitude of the model?`,
          value: A,
          explanation: `Amplitude is half the distance from lowest to highest: (${L + 2 * A} − ${L})/2 = ${A}. The full difference ${2 * A} is the wheel's diameter, and ${L + A} is the midline.`,
        };
      }
      if (form === 1) {
        const L = int(r, 2, 9), A = int(r, 2, 8);
        return {
          prompt: `The depth of the water at a dock rises and falls sinusoidally between a low of ${L} ft and a high of ${L + 2 * A} ft. The midline of the model is the line y = k. What is k?`,
          value: L + A,
          explanation: `The midline is the average of the low and the high: (${L} + ${L + 2 * A})/2 = ${L + A}. Half the difference, ${A}, is the amplitude instead.`,
        };
      }
      if (form === 2) {
        const A = int(r, 2, 6), D = int(r, 7, 15), n = pick(r, [5, 6, 7, 8, 12]);
        return {
          prompt: `The depth of water in a harbor, in feet, t hours after midnight is modeled by d(t) = ${A} sin(${pix(n, 't')}) + ${D}. What is the period of the model, in hours?`,
          value: 2 * n,
          explanation: `Period = 2π/b with b = π/${n}: 2π · ${n}/π = ${2 * n} hours. The ${A} is the amplitude and the ${D} is the average depth.`,
        };
      }
      const A = int(r, 8, 30), D = A + int(r, 2, 8), n = pick(r, [10, 15, 20, 30]);
      const max = int(r, 0, 1) === 1;
      return {
        prompt: `A rider's height on a Ferris wheel, in meters, t seconds after boarding is h(t) = ${trig(-A, 'cos', pix(n, 't'), D)}. What is the rider's ${max ? 'maximum' : 'minimum'} height, in meters?`,
        value: max ? D + A : D - A,
        explanation: `The height swings ${A} m either side of the midline ${D}: the ${max ? 'maximum' : 'minimum'} is ${D} ${max ? '+' : '−'} ${A} = ${max ? D + A : D - A}. The negative sign only means the ride starts at the bottom.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const T = pick(r, [8, 10, 12, 16, 20, 24, 30, 40, 60]);
        return {
          prompt: `A Ferris wheel completes one revolution every ${T} seconds. A rider's height is modeled by h(t) = A·cos(bt) + D, with t in seconds. What is the value of b?`,
          ...mc(r, piStr(2, T), [piStr(1, T), piStr(2 * T), piStr(T, 2)]),
          explanation: `The period is 2π/b, so b = 2π/period = 2π/${T} = ${piStr(2, T)}. Using π instead of 2π gives ${piStr(1, T)}; multiplying gives ${piStr(2 * T)}.`,
        };
      }
      if (form === 1) {
        const A = 2 * int(r, 1, 4), D = int(r, 9, 16), n = pick(r, [6, 12]);
        const [num, den, s, name] = pick(r, [[1, 6, 0.5, '1/2'], [1, 2, 1, '1'], [5, 6, 0.5, '1/2'], [7, 6, -0.5, '−1/2'], [3, 2, -1, '−1']]);
        const t = n * num / den;
        return {
          prompt: `The depth of water in a harbor, in feet, t hours after midnight is modeled by d(t) = ${A} sin(${pix(n, 't')}) + ${D}. What is the depth at t = ${t}?`,
          value: D + A * s,
          explanation: `d(${t}) = ${A} sin(${piStr(t, n)}) + ${D}, and sin(${piStr(t, n)}) = ${name}, so the depth is ${A}(${name}) + ${D} = ${D + A * s} ft.`,
        };
      }
      if (form === 2) {
        const L = int(r, 50, 65), A = int(r, 4, 12), T = pick(r, [12, 16, 20, 24]);
        const H = L + 2 * A, D = L + A;
        const eq = (amp, fn, inner, mid) => `f(t) = ${amp} ${fn}(${inner}) + ${mid}`;
        return {
          prompt: `The temperature in a greenhouse varies sinusoidally between a low of ${L}°F and a high of ${H}°F, repeating every ${T} hours. At t = 0 the temperature is at its highest. Which function models the temperature t hours later?`,
          ...mc(r, eq(A, 'cos', pix(T / 2, 't'), D), [eq(A, 'sin', pix(T / 2, 't'), D), eq(H, 'cos', pix(T / 2, 't'), L), eq(A, 'cos', pix(T, 't'), D)]),
          explanation: `Amplitude = (${H} − ${L})/2 = ${A}, midline = (${H} + ${L})/2 = ${D}, b = 2π/${T} = π/${T / 2}, and a cosine starts at its maximum. The sine version starts at the midline; b = π/${T} would repeat every ${2 * T} hours.`,
        };
      }
      const A = int(r, 2, 6), D = int(r, 8, 14), n = int(r, 4, 9);
      return {
        prompt: `The depth of water at a pier, in feet, t hours after a high tide is d(t) = ${A} cos(${pix(n, 't')}) + ${D}. How many hours pass between a high tide and the next low tide?`,
        value: n,
        explanation: `The period is 2π ÷ (π/${n}) = ${2 * n} hours, and a low comes half a period after a high: ${2 * n}/2 = ${n} hours. The full period ${2 * n} is high tide to the next HIGH tide.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const L = int(r, 2, 6), A = int(r, 10, 30), T = pick(r, [20, 30, 40, 60, 80]);
        const D = L + A;
        const eq = (amp, fn, inner) => `h(t) = ${trig(amp, fn, inner, D)}`;
        return {
          prompt: `A rider boards a Ferris wheel at its lowest point, ${L} m above the ground. The top of the wheel is ${L + 2 * A} m above the ground, and the wheel makes one revolution every ${T} seconds. Which function gives the rider's height, in meters, t seconds after boarding?`,
          ...mc(r, eq(-A, 'cos', pix(T / 2, 't')), [eq(A, 'cos', pix(T / 2, 't')), eq(-A, 'sin', pix(T / 2, 't')), eq(-A, 'cos', pix(T, 't'))]),
          explanation: `Amplitude ${A}, midline ${D}, b = 2π/${T} = π/${T / 2}. The ride starts at the MINIMUM, which a negative cosine does: h(0) = −${A} + ${D} = ${L}. The positive cosine starts at the top; b = π/${T} takes ${2 * T} seconds per turn.`,
        };
      }
      if (form === 1) {
        const A = 2 * int(r, 5, 15), D = A + int(r, 2, 6), n = pick(r, [12, 15, 18, 24, 30]);
        const early = int(r, 0, 1) === 1;
        const t = early ? n / 3 : 2 * n / 3;
        const v = early ? D - A / 2 : D + A / 2;
        return {
          prompt: `A rider's height on a Ferris wheel, in meters, t seconds after boarding is h(t) = ${trig(-A, 'cos', pix(n, 't'), D)}. How high is the rider at t = ${t}?`,
          value: v,
          explanation: `h(${t}) = −${A} cos(${piStr(t, n)}) + ${D}. cos(${piStr(t, n)}) = ${early ? '1/2' : '−1/2'}, so h = −${A}(${early ? '1/2' : '−1/2'}) + ${D} = ${v} m. Watch the two negatives.`,
        };
      }
      if (form === 2) {
        const A = int(r, 6, 15), D = int(r, 55, 75), c = int(r, 7, 11);
        const high = int(r, 0, 1) === 1;
        return {
          prompt: `The temperature in a town, in °F, t hours after midnight is modeled by f(t) = ${A} sin(π(t − ${c})/12) + ${D} for 0 ≤ t < 24. At what value of t is the temperature ${high ? 'highest' : 'lowest'}?`,
          value: high ? c + 6 : c - 6,
          explanation: `Sine is ${high ? 'largest' : 'smallest'} when its input is ${high ? 'π/2' : '−π/2'}: π(t − ${c})/12 = ${high ? 'π/2' : '−π/2'} gives t − ${c} = ${high ? 6 : '−6'}, so t = ${high ? c + 6 : c - 6}. At t = ${c} the temperature is only at its midline.`,
        };
      }
      const A = 2 * int(r, 5, 15), D = A + int(r, 2, 6), n = pick(r, [12, 15, 18, 24, 30, 36]);
      return {
        prompt: `A rider's height on a Ferris wheel, in meters, t seconds after boarding is h(t) = ${trig(-A, 'cos', pix(n, 't'), D)}. During one full revolution, for how many seconds is the rider at least ${D + A / 2} m above the ground?`,
        value: 2 * n / 3,
        explanation: `h ≥ ${D + A / 2} means −${A} cos(${pix(n, 't')}) ≥ ${A / 2}, so cos(${pix(n, 't')}) ≤ −1/2. That holds for inputs from 2π/3 to 4π/3: t from ${2 * n / 3} to ${4 * n / 3}, which is ${2 * n / 3} seconds (a third of the ${2 * n}-second turn).`,
      };
    }) },
  ],
};

// ── triangle area ──────────────────────────────────────────────────────────

// Triangles whose area is a whole number: [side, side, side].
const HERON = [[13, 14, 15], [5, 5, 6], [5, 5, 8], [10, 13, 13], [7, 15, 20], [9, 10, 17], [4, 13, 15], [13, 20, 21], [11, 13, 20], [6, 25, 29], [12, 17, 25], [17, 25, 28], [8, 29, 35]];
function heron(r, kMax) {
  const k = int(r, 1, kMax);
  const [x, y, z] = pick(r, HERON).map((v) => v * k);
  const s = (x + y + z) / 2;
  const area = Math.sqrt(s * (s - x) * (s - y) * (s - z));
  if (Math.abs(area - Math.round(area)) > 1e-9) again();
  return { x, y, z, s, area: Math.round(area) };
}
const SINES = { 20: 0.34, 25: 0.42, 35: 0.57, 40: 0.64, 50: 0.77, 65: 0.91, 70: 0.94, 110: 0.94, 130: 0.77, 140: 0.64 };

const TRI_AREA = {
  courseSkill: 'triangle-area-applications',
  skillId: 'pc-triangle-area-applications',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 4, 16), b = int(r, 5, 18), C = pick(r, [30, 150]);
        if ((a * b) % 4 !== 0 || a === b) again();
        return {
          prompt: `In triangle ABC, a = ${a}, b = ${b}, and the included angle C measures ${C}°. What is the area of the triangle?`,
          value: a * b / 4,
          explanation: `Area = (1/2)ab·sin C = (1/2)(${a})(${b})(1/2) = ${a * b / 4}, since sin ${C}° = 1/2. Leaving out the sine gives ${a * b / 2}, which is only right for a 90° angle.`,
        };
      }
      if (form === 1) {
        const a = 2 * int(r, 3, 10), b = int(r, 5, 15), u = unit(r);
        const C = Number(pick(r, Object.keys(SINES)));
        const v = Math.round(a / 2 * b * SINES[C] * 100) / 100;
        return {
          prompt: `Two sides of a triangle measure ${a} ${u} and ${b} ${u}, and the angle between them measures ${C}°. Using sin ${C}° ≈ ${SINES[C]}, what is the area of the triangle, in ${u}²?`,
          value: dec(v),
          explanation: `Area = (1/2)ab·sin C = (1/2)(${a})(${b})(${SINES[C]}) = ${a / 2 * b} · ${SINES[C]} = ${dec(v)}. Forgetting the 1/2 doubles the answer.`,
        };
      }
      if (form === 2) {
        const { x, y, z, s, area } = heron(r, 2), u = unit(r);
        return {
          prompt: `A triangle has sides of ${x}, ${y} and ${z} ${u}. Use Heron's formula to find its area, in ${u}².`,
          value: area,
          explanation: `s = (${x} + ${y} + ${z})/2 = ${s}. Area = √(${s} · ${s - x} · ${s - y} · ${s - z}) = √${s * (s - x) * (s - y) * (s - z)} = ${area}. Use the SEMI-perimeter ${s}, not the perimeter ${2 * s}.`,
        };
      }
      const a = 10 * int(r, 2, 9), b = 10 * int(r, 2, 9), C = pick(r, [150, 30, 150]);
      if (a === b) again();
      return {
        prompt: `A triangular garden has two sides of ${a} m and ${b} m that meet at an angle of ${C}°. What is the area of the garden, in m²?`,
        value: a * b / 4,
        explanation: `Area = (1/2)(${a})(${b})·sin ${C}° = ${a * b / 2} · 1/2 = ${a * b / 4}. sin 150° equals sin 30° = 1/2 (it is positive in the second quadrant).`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 4, 16), b = int(r, 4, 18), C = pick(r, [60, 120, 45, 135]);
        if ((a * b) % 4 !== 0 || a === b) again();
        const q = a * b / 4, rad = (C === 60 || C === 120) ? 3 : 2;
        return {
          prompt: `In triangle ABC, a = ${a}, b = ${b}, and the included angle C measures ${C}°. What is the exact area of the triangle?`,
          ...mc(r, `${q}√${rad}`, [`${2 * q}√${rad}`, String(q), `${q}√${5 - rad}`]),
          explanation: `sin ${C}° = √${rad}/2, so Area = (1/2)(${a})(${b})(√${rad}/2) = ${q}√${rad}. Dropping the 1/2 gives ${2 * q}√${rad}; ${q} uses sin 30° = 1/2; √${5 - rad}/2 is the sine of a different angle.`,
        };
      }
      if (form === 1) {
        const { x, y, z, s, area } = heron(r, 3);
        if (x + y + z < 40) again();
        return {
          prompt: `A triangular sail has edges of ${x} ft, ${y} ft and ${z} ft. What is the area of the sail, in ft²?`,
          value: area,
          explanation: `Three sides and no angle: Heron's formula. s = ${s}, so Area = √(${s} · ${s - x} · ${s - y} · ${s - z}) = √${s * (s - x) * (s - y) * (s - z)} = ${area}.`,
        };
      }
      if (form === 2) {
        const a = int(r, 4, 16), b = int(r, 5, 20), C = pick(r, [30, 150]), u = unit(r);
        if ((a * b) % 4 !== 0 || a === b) again();
        return {
          prompt: `A triangle has an area of ${a * b / 4} ${u}². One side measures ${a} ${u}, and it meets a second side at an angle of ${C}°. How long is the second side, in ${u}?`,
          value: b,
          explanation: `Area = (1/2)ab·sin C with sin ${C}° = 1/2: ${a * b / 4} = (1/4)(${a})b, so b = 4 · ${a * b / 4}/${a} = ${b}. Using Area = (1/2)ab (no sine) gives ${K.frac(a * b / 2, a)}.`,
        };
      }
      const a = 10 * int(r, 4, 15), b = 10 * int(r, 4, 15);
      const C = Number(pick(r, Object.keys(SINES)));
      const v = Math.round(a / 2 * b * SINES[C] * 100) / 100;
      return {
        prompt: `A surveyor measures two sides of a triangular lot as ${a} m and ${b} m, with an angle of ${C}° between them. Using sin ${C}° ≈ ${SINES[C]}, what is the area of the lot, in m²?`,
        value: dec(v),
        explanation: `Area = (1/2)ab·sin C = (1/2)(${a})(${b})(${SINES[C]}) = ${a / 2 * b} · ${SINES[C]} = ${dec(v)} m².`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 5, 20), b = int(r, 5, 20), C = pick(r, [30, 150]), u = unit(r);
        if ((a * b) % 2 !== 0 || a === b) again();
        return {
          prompt: `A parallelogram has adjacent sides of ${a} ${u} and ${b} ${u} that meet at an angle of ${C}°. What is the area of the parallelogram, in ${u}²?`,
          value: a * b / 2,
          explanation: `A diagonal cuts the parallelogram into two triangles, each (1/2)(${a})(${b})·sin ${C}°. Together: ${a} · ${b} · 1/2 = ${a * b / 2}. Stopping at one triangle gives ${K.frac(a * b, 4)}.`,
        };
      }
      if (form === 1) {
        const a = int(r, 4, 16), b = int(r, 5, 20), u = unit(r);
        if ((a * b) % 4 !== 0 || a === b) again();
        const kind = pick(r, ['acute', 'obtuse']);
        return {
          prompt: `A triangle has an area of ${a * b / 4} ${u}². Two of its sides measure ${a} ${u} and ${b} ${u}, and the angle between them is ${kind}. What is the measure of that angle, in degrees?`,
          value: kind === 'acute' ? 30 : 150,
          explanation: `${a * b / 4} = (1/2)(${a})(${b})·sin C gives sin C = ${a * b / 4}/${a * b / 2} = 1/2. Both 30° and 150° have a sine of 1/2; the angle is ${kind}, so C = ${kind === 'acute' ? 30 : 150}°.`,
        };
      }
      if (form === 2) {
        const { x, y, z, s, area } = heron(r, 2), u = unit(r);
        const sides = [x, y, z].filter((v) => (2 * area) % v === 0);
        if (!sides.length) again();
        const side = pick(r, sides);
        return {
          prompt: `A triangle has sides of ${x}, ${y} and ${z} ${u}. What is the length of the altitude drawn to the side of length ${side} ${u}, in ${u}?`,
          value: 2 * area / side,
          explanation: `Heron: s = ${s}, Area = √(${s} · ${s - x} · ${s - y} · ${s - z}) = ${area}. Then Area = (1/2)(base)(height): ${area} = (1/2)(${side})h, so h = ${2 * area / side}.`,
        };
      }
      const a = 10 * int(r, 2, 8), b = 10 * int(r, 2, 8), C = pick(r, [30, 150]), cost = pick(r, [5, 8, 12, 15, 20]);
      if (a === b) again();
      return {
        prompt: `A triangular lot has two sides of ${a} m and ${b} m that meet at an angle of ${C}°. Land there sells for ${cost} dollars per square meter. What is the value of the lot, in dollars?`,
        value: cost * a * b / 4,
        explanation: `Area = (1/2)(${a})(${b})·sin ${C}° = ${a * b / 2} · 1/2 = ${a * b / 4} m². Value = ${a * b / 4} · ${cost} = ${cost * a * b / 4} dollars.`,
      };
    }) },
  ],
};

// ── parabolas as conic sections ────────────────────────────────────────────

const sq = (v, h) => (h === 0 ? `${v}²` : `(${v} ${h > 0 ? '−' : '+'} ${Math.abs(h)})²`);
const lin = (v, k) => (k === 0 ? v : `(${v} ${k > 0 ? '−' : '+'} ${Math.abs(k)})`);
/** (x − h)² = c(y − k) when vertical, (y − k)² = c(x − h) otherwise. */
const parab = (vert, h, k, c) => (vert ? `${sq('x', h)} = ${neg(c)}${lin('y', k)}` : `${sq('y', k)} = ${neg(c)}${lin('x', h)}`);
const std = (vert) => (vert ? '(x − h)² = 4p(y − k)' : '(y − k)² = 4p(x − h)');

function drawParab(r) {
  const h = K.nonZero(r, -6, 6), k = K.nonZero(r, -6, 6), p = K.nonZero(r, -4, 4);
  if (Math.abs(h) === Math.abs(k) || Math.abs(p) === 1) again();
  return { h, k, p };
}

const PARABOLA = {
  courseSkill: 'parabola-analysis',
  skillId: 'pc-parabola-analysis',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      const vert = int(r, 0, 1) === 1;
      if (form === 0) {
        const { h, k, p } = drawParab(r);
        return {
          prompt: `What is the vertex of the parabola ${parab(vert, h, k, 4 * p)}?`,
          ...mc(r, pt(h, k), [pt(-h, -k), pt(k, h), pt(-h, k)]),
          explanation: `Compare with ${std(vert)}: h = ${neg(h)} and k = ${neg(k)}, so the vertex is ${pt(h, k)}. The signs inside the parentheses are the OPPOSITE of the coordinates, and x goes with h.`,
        };
      }
      if (form === 1) {
        const p = K.nonZero(r, -9, 9);
        const lhs = vert ? 'x²' : 'y²', v = vert ? 'y' : 'x';
        return {
          prompt: `The parabola ${lhs} = ${neg(4 * p)}${v} has the form ${lhs} = 4p${v}. What is the value of p?`,
          value: p,
          explanation: `4p = ${neg(4 * p)}, so p = ${neg(4 * p)}/4 = ${neg(p)}. p is the directed distance from the vertex to the focus${p < 0 ? '; a negative p means the parabola opens the negative way' : ''}.`,
        };
      }
      if (form === 2) {
        const { h, k, p } = drawParab(r);
        const dir = vert ? (p > 0 ? 'up' : 'down') : (p > 0 ? 'right' : 'left');
        return {
          prompt: `In which direction does the parabola ${parab(vert, h, k, 4 * p)} open?`,
          ...mcFixed(r, ['up', 'down', 'left', 'right'], dir),
          explanation: `The squared variable is ${vert ? 'x' : 'y'}, so the axis is ${vert ? 'vertical' : 'horizontal'}; 4p = ${neg(4 * p)} is ${p > 0 ? 'positive' : 'negative'}, so it opens ${dir}. The vertex ${pt(h, k)} does not affect the direction.`,
        };
      }
      const p = K.nonZero(r, -6, 6);
      if (Math.abs(p) === 1) again();
      return {
        prompt: `What is the focus of the parabola ${parab(vert, 0, 0, 4 * p)}?`,
        ...mc(r, vert ? pt(0, p) : pt(p, 0), vert ? [pt(p, 0), pt(0, 4 * p), pt(0, -p)] : [pt(0, p), pt(4 * p, 0), pt(-p, 0)]),
        explanation: `4p = ${neg(4 * p)} gives p = ${neg(p)}. The vertex is the origin and the focus is p units along the ${vert ? 'y' : 'x'}-axis: ${vert ? pt(0, p) : pt(p, 0)}. Using ${neg(4 * p)} itself forgets to divide by 4.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      const vert = int(r, 0, 1) === 1;
      const { h, k, p } = drawParab(r);
      const eq = parab(vert, h, k, 4 * p);
      if (form === 0) {
        return {
          prompt: `What is the focus of the parabola ${eq}?`,
          ...mc(r, vert ? pt(h, k + p) : pt(h + p, k), vert ? [pt(h + p, k), pt(h, k - p), pt(h, k + 4 * p)] : [pt(h, k + p), pt(h - p, k), pt(h + 4 * p, k)]),
          explanation: `Vertex ${pt(h, k)}, and 4p = ${neg(4 * p)} gives p = ${neg(p)}. The ${vert ? 'x' : 'y'} is squared, so the focus is p units from the vertex in the ${vert ? 'y' : 'x'} direction: ${vert ? pt(h, k + p) : pt(h + p, k)}.`,
        };
      }
      if (form === 1) {
        const line = (v, n) => `${v} = ${neg(n)}`;
        return {
          prompt: `What is the directrix of the parabola ${eq}?`,
          ...mc(r, vert ? line('y', k - p) : line('x', h - p), vert ? [line('x', h - p), line('y', k + p), line('y', k - 4 * p)] : [line('y', k - p), line('x', h + p), line('x', h - 4 * p)]),
          explanation: `Vertex ${pt(h, k)} and p = ${neg(p)}. The directrix is p units from the vertex on the side AWAY from the focus: ${vert ? `y = ${neg(k)} − (${neg(p)}) = ${neg(k - p)}` : `x = ${neg(h)} − (${neg(p)}) = ${neg(h - p)}`}. Adding p instead gives the line through the focus.`,
        };
      }
      if (form === 2) {
        const line = (v, n) => `${v} = ${neg(n)}`;
        return {
          prompt: `What is the axis of symmetry of the parabola ${eq}?`,
          ...mc(r, vert ? line('x', h) : line('y', k), vert ? [line('y', k), line('x', k), line('y', h)] : [line('x', h), line('y', h), line('x', k)]),
          explanation: `The ${vert ? 'x' : 'y'} is squared, so the parabola opens ${vert ? 'up or down' : 'left or right'} and its axis is the ${vert ? 'vertical' : 'horizontal'} line through the vertex ${pt(h, k)}: ${vert ? line('x', h) : line('y', k)}.`,
        };
      }
      return {
        prompt: `A parabola has its vertex at the origin and its focus at ${vert ? pt(0, p) : pt(p, 0)}. Which equation is the parabola's?`,
        ...mc(r, parab(vert, 0, 0, 4 * p), [parab(vert, 0, 0, p), parab(!vert, 0, 0, 4 * p), parab(vert, 0, 0, -4 * p)]),
        explanation: `The focus is on the ${vert ? 'y' : 'x'}-axis, so the ${vert ? 'x' : 'y'} is squared, with p = ${neg(p)}: ${parab(vert, 0, 0, 4 * p)}. The coefficient is 4p = ${neg(4 * p)}, not p.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      const { h, k, p } = drawParab(r);
      const line = (v, n) => `${v} = ${neg(n)}`;
      if (form === 0 || form === 1) {
        const vert = form === 0;
        const F = vert ? pt(h, k + p) : pt(h + p, k);
        const dir = vert ? line('y', k - p) : line('x', h - p);
        return {
          prompt: `A parabola has its focus at ${F} and its directrix is the line ${dir}. Which equation is the parabola's?`,
          ...mc(r, parab(vert, h, k, 4 * p), [parab(vert, h, k, 8 * p), parab(!vert, h, k, 4 * p), vert ? parab(vert, h, k + p, 4 * p) : parab(vert, h + p, k, 4 * p)]),
          explanation: `The vertex is halfway between focus and directrix: ${pt(h, k)}, and p = ${neg(p)} (vertex to focus). So ${parab(vert, h, k, 4 * p)}. Using the whole focus-to-directrix distance ${neg(2 * p)} as p gives ${neg(8 * p)}; the vertex is not the focus.`,
        };
      }
      if (form === 2) {
        const vert = int(r, 0, 1) === 1;
        const dir = vert ? line('y', k - p) : line('x', h - p);
        return {
          prompt: `A parabola has its vertex at ${pt(h, k)} and its directrix is the line ${dir}. Which equation is the parabola's?`,
          ...mc(r, parab(vert, h, k, 4 * p), [parab(vert, h, k, -4 * p), parab(vert, h, k, p), parab(!vert, h, k, 4 * p)]),
          explanation: `The directrix is ${Math.abs(p)} from the vertex, and the parabola opens AWAY from it, so p = ${neg(p)} and 4p = ${neg(4 * p)}: ${parab(vert, h, k, 4 * p)}. The opposite sign opens toward the directrix.`,
        };
      }
      const D = h * h + 4 * p * k;
      if (D === 0) again();
      return {
        prompt: `What is the focus of the parabola x² ${sgn(-2 * h)}x ${sgn(-4 * p)}y ${sgn(D)} = 0?`,
        ...mc(r, pt(h, k + p), [pt(h, k), pt(h, k - p), pt(h + p, k)]),
        explanation: `Complete the square: x² ${sgn(-2 * h)}x + ${h * h} = ${neg(4 * p)}y ${sgn(h * h - D)}, so ${parab(true, h, k, 4 * p)}. Vertex ${pt(h, k)}, p = ${neg(p)}, focus ${pt(h, k + p)}. ${pt(h, k)} is only the vertex.`,
      };
    }) },
  ],
};

// ── series and sigma notation ──────────────────────────────────────────────

const sig = (lo, hi, body) => `Σ (from k = ${lo} to ${hi}) of ${body}`;
const linK = (a, b) => `(${poly([a, b], 'k')})`;
const arith = (a, b, lo, hi) => { let s = 0; for (let k = lo; k <= hi; k++) s += a * k + b; return s; };

const SIGMA = {
  courseSkill: 'series-sigma-notation',
  skillId: 'pc-series-sigma-notation',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 2, 6), b = K.nonZero(r, -5, 7), n = int(r, 4, 6);
        const terms = Array.from({ length: n }, (_, i) => a * (i + 1) + b);
        return {
          prompt: `Evaluate the sum ${sig(1, n, linK(a, b))}.`,
          value: arith(a, b, 1, n),
          explanation: `Substitute k = 1 to ${n} and add: ${terms.map(neg).join(' + ')} = ${arith(a, b, 1, n)}. The ${neg(b)} is added in every one of the ${n} terms.`,
        };
      }
      if (form === 1) {
        const m = int(r, 2, 7), n = m + int(r, 5, 20), a = int(r, 2, 5), b = K.nonZero(r, -4, 6);
        return {
          prompt: `How many terms are in the sum ${sig(m, n, linK(a, b))}?`,
          value: n - m + 1,
          explanation: `k takes every whole value from ${m} to ${n}, and both ends count: ${n} − ${m} + 1 = ${n - m + 1} terms. Subtracting without adding 1 gives ${n - m}.`,
        };
      }
      if (form === 2) {
        const n = int(r, 3, 5), c = K.nonZero(r, -3, 5);
        const terms = Array.from({ length: n }, (_, i) => (i + 1) * (i + 1) + c);
        const total = terms.reduce((s, v) => s + v, 0);
        return {
          prompt: `Evaluate the sum ${sig(1, n, `(${poly([1, 0, c], 'k')})`)}.`,
          value: total,
          explanation: `Terms for k = 1 to ${n}: ${terms.map(neg).join(' + ')} = ${total}. Square k first, then ${c > 0 ? 'add' : 'subtract'} ${Math.abs(c)}, in each term.`,
        };
      }
      const f = int(r, 2, 9), dd = int(r, 2, 6);
      if (f === dd) again();
      const terms = Array.from({ length: 5 }, (_, i) => f + dd * i);
      return {
        prompt: `Which expression in sigma notation equals ${terms.join(' + ')}?`,
        ...mc(r, sig(1, 5, linK(dd, f - dd)), [sig(1, 5, linK(f, dd)), sig(1, 5, linK(dd, f)), sig(1, terms[4], linK(dd, f - dd))]),
        explanation: `The terms go up by ${dd}, so the rule is ${dd}k + c; k = 1 must give ${f}, so c = ${neg(f - dd)}. There are 5 terms, so k runs 1 to 5. Using ${dd}k + ${f} starts at ${dd + f}; the upper limit is the NUMBER of terms, not the last term.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 2, 6), b = K.nonZero(r, -5, 7), n = pick(r, [20, 25, 30, 40, 50]);
        const first = a + b, last = a * n + b;
        return {
          prompt: `Evaluate the sum ${sig(1, n, linK(a, b))}.`,
          value: arith(a, b, 1, n),
          explanation: `An arithmetic series: first term ${neg(first)}, last term ${last}, ${n} terms. S = n(first + last)/2 = ${n}(${neg(first)} + ${last})/2 = ${arith(a, b, 1, n)}.`,
        };
      }
      if (form === 1) {
        const a = int(r, 2, 5), q = pick(r, [2, 3]), n = int(r, 4, 6);
        const total = a * (q ** n - 1) / (q - 1);
        return {
          prompt: `Evaluate the sum ${sig(1, n, `${a} · ${q}^(k − 1)`)}.`,
          value: total,
          explanation: `A geometric series with first term ${a}, ratio ${q}, ${n} terms: S = a(rⁿ − 1)/(r − 1) = ${a}(${q ** n} − 1)/${q - 1} = ${total}. The first term is ${a} because the exponent starts at 0.`,
        };
      }
      if (form === 2) {
        const m = int(r, 3, 5), n = m + int(r, 4, 7), a = int(r, 2, 5), b = K.nonZero(r, -4, 5);
        const terms = [];
        for (let k = m; k <= n; k++) terms.push(a * k + b);
        return {
          prompt: `Evaluate the sum ${sig(m, n, linK(a, b))}.`,
          value: arith(a, b, m, n),
          explanation: `k starts at ${m}, not 1: ${terms.join(' + ')} = ${arith(a, b, m, n)} (${n - m + 1} terms). Starting from k = 1 would add ${arith(a, b, 1, m - 1)} too many.`,
        };
      }
      const a = int(r, 2, 7), q = int(r, 2, 4);
      if (a === q) again();
      const terms = Array.from({ length: 5 }, (_, i) => a * q ** i);
      return {
        prompt: `Which expression in sigma notation equals ${terms.join(' + ')}?`,
        ...mc(r, sig(1, 5, `${a} · ${q}^(k − 1)`), [sig(1, 5, `${a} · ${q}^k`), sig(1, 5, `${q} · ${a}^(k − 1)`), sig(1, 5, `${a * q}^(k − 1)`)]),
        explanation: `Each term is ${q} times the one before and the first is ${a}, so the kth term is ${a} · ${q}^(k − 1). With exponent k the sum would start at ${a * q}; ${a * q}^(k − 1) multiplies before raising to the power.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const kind = pick(r, ['half', 'third', 'neg']);
        if (kind === 'neg') {
          const a = int(r, 2, 6), q = pick(r, [2, 3]), n = int(r, 4, 6);
          const terms = Array.from({ length: n }, (_, i) => a * (-q) ** i);
          const total = terms.reduce((s, v) => s + v, 0);
          return {
            prompt: `Evaluate the sum ${sig(1, n, `${a} · (−${q})^(k − 1)`)}.`,
            value: total,
            explanation: `The ratio is −${q}, so the signs alternate: ${terms.map(neg).join(' + ')} = ${neg(total)}. Formula: ${a}(1 − (−${q})^${n})/(1 + ${q}) = ${neg(total)}.`,
          };
        }
        const den = kind === 'half' ? 2 : 3;
        const n = kind === 'half' ? int(r, 4, 6) : int(r, 3, 4);
        const a = int(r, 1, 4) * den ** (n - 1);
        const terms = Array.from({ length: n }, (_, i) => a / den ** i);
        const total = terms.reduce((s, v) => s + v, 0);
        return {
          prompt: `Evaluate the sum ${sig(1, n, `${a} · (1/${den})^(k − 1)`)}.`,
          value: total,
          explanation: `Each term is 1/${den} of the one before: ${terms.join(' + ')} = ${total}. Formula: ${a}(1 − (1/${den})^${n})/(1 − 1/${den}) = ${total}.`,
        };
      }
      if (form === 1) {
        const [p, q] = pick(r, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5]]);
        const a = (q - p) * int(r, 2, 9);
        return {
          prompt: `Evaluate the infinite sum ${sig(1, '∞', `${a} · (${p}/${q})^(k − 1)`)}.`,
          value: a * q / (q - p),
          explanation: `An infinite geometric series with |r| = ${p}/${q} < 1 converges to a/(1 − r) = ${a}/(1 − ${p}/${q}) = ${a}/(${q - p}/${q}) = ${a * q / (q - p)}. Dividing by r instead of 1 − r is the usual slip.`,
        };
      }
      if (form === 2) {
        const n = int(r, 5, 8), c = pick(r, [-4, -3, -2, 2, 3, 4]);
        const terms = Array.from({ length: n }, (_, i) => (i + 1) * (i + 1) + c * (i + 1));
        const total = terms.reduce((s, v) => s + v, 0);
        return {
          prompt: `Evaluate the sum ${sig(1, n, `(${poly([1, c, 0], 'k')})`)}.`,
          value: total,
          explanation: `Terms for k = 1 to ${n}: ${terms.map(neg).join(' + ')} = ${total}. (Or split it: Σk² = ${n * (n + 1) * (2 * n + 1) / 6} and Σk = ${n * (n + 1) / 2}, giving ${n * (n + 1) * (2 * n + 1) / 6} ${c > 0 ? '+' : '−'} ${Math.abs(c)} · ${n * (n + 1) / 2}.)`,
        };
      }
      const a = int(r, 2, 5), b = int(r, 1, 6), n = int(r, 8, 20);
      const S = arith(a, b, 1, n);
      return {
        prompt: `For what value of n does ${sig(1, 'n', linK(a, b))} equal ${S}?`,
        value: n,
        explanation: `The sum is n(first + last)/2 = n(${a + b} + ${a}n + ${b})/2. Setting it equal to ${S} gives ${a}n² + ${a + 2 * b}n − ${2 * S} = 0, whose positive solution is n = ${n}. Check: first ${a + b}, last ${a * n + b}, ${n}(${a + b} + ${a * n + b})/2 = ${S}.`,
      };
    }) },
  ],
};

// ── limits, intuitively ────────────────────────────────────────────────────

const num3 = (x) => String(Number(x.toFixed(3)));
const NEAR = [-0.1, -0.01, -0.001, 0.001, 0.01, 0.1];

function holeText(m, b, c, V) {
  return `The graph of a function f is the line y = ${poly([m, b])}, except that there is an open circle (a hole) on the line at x = ${c} and a single filled point at (${c}, ${neg(V)}).`;
}
function sidesText(c, L, R, V) {
  return `As x approaches ${c} from the left, f(x) approaches ${neg(L)}. As x approaches ${c} from the right, f(x) approaches ${neg(R)}. ${V === null ? `The function is not defined at x = ${c}.` : `The value of the function there is f(${c}) = ${neg(V)}.`}`;
}
const DNE = 'Does not exist';

const LIMITS_INTUITIVE = {
  courseSkill: 'limits-intuitive',
  skillId: 'pc-limits-intuitive',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      const c = int(r, 1, 5);
      if (form === 0) {
        const m = int(r, 1, 3), L = int(r, 2, 12);
        if (L === c) again();
        const xs = NEAR.map((e) => num3(c + e)), ys = NEAR.map((e) => num3(L + m * e));
        return {
          prompt: `A table of values for a function f gives x: ${xs.join(', ')} and f(x): ${ys.join(', ')}. Based on the table, what is the limit of f(x) as x approaches ${c}?`,
          value: L,
          explanation: `As x closes in on ${c} from both sides, the outputs close in on ${L} (${ys[2]} just below, ${ys[3]} just above). The limit is the value the outputs approach: ${L}, not the x-value ${c}.`,
        };
      }
      if (form === 1 || form === 3) {
        const m = K.nonZero(r, -3, 4), b = K.nonZero(r, -5, 6);
        const Lm = m * c + b, V = Lm + K.nonZero(r, -4, 5);
        if (form === 1) {
          return {
            prompt: `${holeText(m, b, c, V)} What is the limit of f(x) as x approaches ${c}?`,
            value: Lm,
            explanation: `Near x = ${c} the graph follows the line, so f(x) approaches ${neg(m)}(${c}) ${sgn(b)} = ${neg(Lm)}. The filled point says f(${c}) = ${neg(V)}, but a limit ignores the value AT the point.`,
          };
        }
        const st = (lim, val) => `The limit is ${lim} and f(${c}) = ${val}`;
        return {
          prompt: `${holeText(m, b, c, V)} Which statement about x = ${c} is true?`,
          ...mcFixed(r, [st(neg(Lm), neg(V)), st(neg(V), neg(Lm)), st(neg(V), neg(V)), `The limit does not exist and f(${c}) = ${neg(V)}`], st(neg(Lm), neg(V))),
          explanation: `The limit follows the line into the hole: ${neg(m)}(${c}) ${sgn(b)} = ${neg(Lm)}. The filled point gives the function's value, f(${c}) = ${neg(V)}. A hole does not stop the limit from existing.`,
        };
      }
      const L = int(r, -4, 9), R = L + K.nonZero(r, -5, 5);
      const side = pick(r, ['left', 'right']);
      return {
        prompt: `Near x = ${c}, the graph of a function f has a jump: to the left of x = ${c} the graph approaches a height of ${neg(L)}, and to the right of x = ${c} it approaches a height of ${neg(R)}. What is the limit of f(x) as x approaches ${c} from the ${side}?`,
        value: side === 'left' ? L : R,
        explanation: `A one-sided limit uses only that side of the graph. From the ${side} the heights approach ${neg(side === 'left' ? L : R)}; the other side (${neg(side === 'left' ? R : L)}) does not matter for this limit.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      const c = int(r, 1, 5);
      if (form === 0) {
        const L = K.nonZero(r, -5, 9), V = K.nonZero(r, -6, 10);
        const jump = int(r, 0, 1) === 1;
        const R = jump ? L + K.nonZero(r, -4, 4) : L;
        if (V === L || V === R) again();
        const body = jump
          ? mc(r, DNE, [neg(L), neg(R), neg(V)])
          : mc(r, neg(L), [neg(V), DNE, neg(L + V)]);
        return {
          prompt: `${sidesText(c, L, R, V)} What is the limit of f(x) as x approaches ${c}?`,
          ...body,
          explanation: jump
            ? `The left-hand limit (${neg(L)}) and the right-hand limit (${neg(R)}) are different, so the two-sided limit does not exist. f(${c}) = ${neg(V)} has no say in it.`
            : `Both one-sided limits are ${neg(L)}, so the limit is ${neg(L)}. The function's value f(${c}) = ${neg(V)} is a different number, and that does not change the limit.`,
        };
      }
      if (form === 1) {
        const a = int(r, 2, 5), b = K.nonZero(r, -5, 6), d = K.nonZero(r, -6, 6);
        const left = a * c + b, right = c * c + d;
        if (left === right) again();
        const side = pick(r, ['left', 'right']);
        return {
          prompt: `A function is defined by f(x) = ${poly([a, b])} for x < ${c} and f(x) = ${poly([1, 0, d])} for x ≥ ${c}. What is the limit of f(x) as x approaches ${c} from the ${side}?`,
          value: side === 'left' ? left : right,
          explanation: `From the ${side}, x is ${side === 'left' ? 'less' : 'greater'} than ${c}, so use ${side === 'left' ? poly([a, b]) : poly([1, 0, d])}: ${side === 'left' ? `${a}(${c}) ${sgn(b)} = ${neg(left)}` : `${c}² ${sgn(d)} = ${neg(right)}`}. The other piece gives ${neg(side === 'left' ? right : left)}, the limit from the other side.`,
        };
      }
      if (form === 2) {
        const m = int(r, 1, 3), L = int(r, 3, 12), V = L + K.nonZero(r, -3, 6);
        if (L === c) again();
        const es = [-0.1, -0.01, 0, 0.01, 0.1];
        const xs = es.map((e) => num3(c + e)), ys = es.map((e) => (e === 0 ? String(V) : num3(L + m * e)));
        return {
          prompt: `A table of values for a function f gives x: ${xs.join(', ')} and f(x): ${ys.join(', ')}. Based on the table, what is the limit of f(x) as x approaches ${c}?`,
          value: L,
          explanation: `On both sides of ${c} the outputs approach ${L} (${ys[1]} and ${ys[3]}). The entry f(${c}) = ${V} is the function's value at the point, which a limit ignores.`,
        };
      }
      const m = int(r, 1, 3), L = int(r, 2, 9), R = L + 2 * K.nonZero(r, -2, 3);
      if (R <= 1) again();
      const xs = NEAR.map((e) => num3(c + e));
      const ys = NEAR.map((e) => num3((e < 0 ? L : R) + m * e));
      return {
        prompt: `A table of values for a function f gives x: ${xs.join(', ')} and f(x): ${ys.join(', ')}. Based on the table, what is the limit of f(x) as x approaches ${c}?`,
        ...mc(r, DNE, [String(L), String(R), String((L + R) / 2)]),
        explanation: `From the left the outputs approach ${L} (… ${ys[1]}, ${ys[2]}); from the right they approach ${R} (${ys[3]}, ${ys[4]} …). The two sides disagree, so the limit does not exist. Averaging them to ${(L + R) / 2} is not a limit.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      const c = int(r, 2, 5);
      if (form === 0) {
        const a = int(r, 2, 5), b = K.nonZero(r, -6, 6);
        const left = a * c + b;
        const match = int(r, 0, 1) === 1;
        const d = match ? left - c * c : K.nonZero(r, -6, 6);
        const right = c * c + d;
        if (d === 0 || (!match && left === right)) again();
        return {
          prompt: `A function is defined by f(x) = ${poly([a, b])} for x < ${c} and f(x) = ${poly([1, 0, d])} for x > ${c}. The function is not defined at x = ${c}. What is the limit of f(x) as x approaches ${c}?`,
          ...(match ? mc(r, neg(left), [DNE, neg(a * c), neg(c * c)]) : mc(r, DNE, [neg(left), neg(right), neg(left + right)])),
          explanation: match
            ? `From the left: ${a}(${c}) ${sgn(b)} = ${neg(left)}. From the right: ${c}² ${sgn(d)} = ${neg(right)}. The sides agree, so the limit is ${neg(left)} even though f(${c}) is undefined.`
            : `From the left: ${a}(${c}) ${sgn(b)} = ${neg(left)}. From the right: ${c}² ${sgn(d)} = ${neg(right)}. The sides disagree, so the limit does not exist.`,
        };
      }
      if (form === 1) {
        const m = int(r, 2, 4), cc = int(r, 2, 6);
        return {
          prompt: `The graph of f(x) = (${poly([m, 0, -m * cc * cc])})/(${poly([1, -cc])}) is the line y = ${poly([m, m * cc])} with a hole at x = ${cc}, where f has no value. What is the limit of f(x) as x approaches ${cc}?`,
          value: 2 * m * cc,
          explanation: `Near x = ${cc} the outputs follow the line y = ${poly([m, m * cc])}, so they approach ${m}(${cc}) + ${m * cc} = ${2 * m * cc}. The limit exists even though f(${cc}) is undefined (0/0).`,
        };
      }
      if (form === 2) {
        const A = int(r, 1, 6);
        return {
          prompt: `As x approaches 0, the values of a function f swing back and forth between −${A} and ${A} faster and faster, never settling toward any single number. What is the limit of f(x) as x approaches 0?`,
          ...mc(r, DNE, ['0', String(A), `−${A}`]),
          explanation: `A limit must be ONE number the outputs get and stay close to. Here they keep returning to both −${A} and ${A}, so no such number exists. The middle value 0 is not approached either.`,
        };
      }
      const kind = pick(r, ['same', 'different', 'jump', 'undefined']);
      const L = K.nonZero(r, -5, 9);
      const R = kind === 'jump' ? L + K.nonZero(r, -4, 4) : L;
      const V = kind === 'undefined' ? null : (kind === 'same' ? L : L + K.nonZero(r, -4, 5));
      if (kind === 'jump' && V === R) again();
      const S = [
        `The limit exists, and f(${c}) is the same number`,
        `The limit exists, and f(${c}) is a different number`,
        'The limit does not exist',
        `The limit exists, and f(${c}) is not defined`,
      ];
      const right = { same: S[0], different: S[1], jump: S[2], undefined: S[3] }[kind];
      return {
        prompt: `${sidesText(c, L, R, V)} Which statement about x = ${c} is true?`,
        ...mcFixed(r, S, right),
        explanation: kind === 'jump'
          ? `The one-sided limits ${neg(L)} and ${neg(R)} are different, so the two-sided limit does not exist, whatever f(${c}) is.`
          : `Both sides approach ${neg(L)}, so the limit exists and is ${neg(L)}. ${V === null ? `f(${c}) is undefined, which does not affect the limit.` : `f(${c}) = ${neg(V)} is ${kind === 'same' ? 'the same number' : 'a different number, which does not affect the limit'}.`}`,
      };
    }) },
  ],
};

// ── limits, algebraically ──────────────────────────────────────────────────

const lim = (v, c, expr) => `Evaluate the limit: lim (${v} → ${neg(c)}) of ${expr}`;
const quot = (top, bottom) => `(${top})/(${bottom})`;

const LIMITS_ALGEBRAIC = {
  courseSkill: 'limits-algebraic',
  skillId: 'pc-limits-algebraic',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const c = K.nonZero(r, -3, 4), a = int(r, 2, 4), b = K.nonZero(r, -6, 6), d = K.nonZero(r, -7, 7);
        const v = a * c * c + b * c + d;
        return {
          prompt: lim('x', c, `(${poly([a, b, d])})`),
          value: v,
          explanation: `A polynomial is continuous, so substitute: ${a}(${neg(c)})² ${sgn(b)}(${neg(c)}) ${sgn(d)} = ${a * c * c} ${sgn(b * c)} ${sgn(d)} = ${neg(v)}.`,
        };
      }
      if (form === 1) {
        const c = int(r, 1, 5), a = K.nonZero(r, -6, 8), b = K.nonZero(r, -4, 5);
        if (c + b === 0 || c * c + a === 0) again();
        return {
          prompt: lim('x', c, quot(poly([1, 0, a]), poly([1, b]))),
          value: K.frac(c * c + a, c + b),
          explanation: `The denominator is not 0 at x = ${c}, so substitute: (${c}² ${sgn(a)})/(${c} ${sgn(b)}) = ${c * c + a}/${c + b} = ${fracD(c * c + a, c + b)}.`,
        };
      }
      if (form === 2) {
        const c = K.nonZero(r, -7, 9);
        return {
          prompt: lim('x', c, quot(poly([1, 0, -c * c]), poly([1, -c]))),
          value: 2 * c,
          explanation: `Substituting gives 0/0, so factor: ${poly([1, 0, -c * c])} = (${poly([1, -c])})(${poly([1, c])}). Cancel ${poly([1, -c])} and substitute into ${poly([1, c])}: ${neg(c)} ${sgn(c)} = ${neg(2 * c)}. 0/0 does not mean the limit is 0 or undefined.`,
        };
      }
      const c = K.nonZero(r, -5, 6), q = K.nonZero(r, -6, 6);
      if (q === c || q === -c) again();
      return {
        prompt: lim('x', c, quot(poly([1, -(c + q), c * q]), poly([1, -c]))),
        value: c - q,
        explanation: `0/0 at x = ${neg(c)}, so factor the top: (${poly([1, -c])})(${poly([1, -q])}). Cancel and substitute: ${neg(c)} ${sgn(-q)} = ${neg(c - q)}.`,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const c = K.nonZero(r, -4, 5), q = K.nonZero(r, -5, 5), s = K.nonZero(r, -5, 5);
        if (q === c || s === c || q === s) again();
        return {
          prompt: lim('x', c, quot(poly([1, -(c + q), c * q]), poly([1, -(c + s), c * s]))),
          value: K.frac(c - q, c - s),
          explanation: `Both are 0 at x = ${neg(c)}. Factor: (${poly([1, -c])})(${poly([1, -q])}) over (${poly([1, -c])})(${poly([1, -s])}). Cancel ${poly([1, -c])} and substitute: (${neg(c)} ${sgn(-q)})/(${neg(c)} ${sgn(-s)}) = ${fracD(c - q, c - s)}.`,
        };
      }
      if (form === 1) {
        const c = K.nonZero(r, -3, 4);
        return {
          prompt: lim('x', c, quot(poly([1, 0, 0, -c * c * c]), poly([1, -c]))),
          value: 3 * c * c,
          explanation: `Factor the ${c > 0 ? 'difference' : 'sum'} of cubes: (${poly([1, -c])})(${poly([1, c, c * c])}). Cancel and substitute x = ${neg(c)}: ${c * c} + ${c * c} + ${c * c} = ${3 * c * c}.`,
        };
      }
      if (form === 2) {
        const b = int(r, 2, 7), c = int(r, 1, 12), a = b * b - c;
        if (a === 0) again();
        return {
          prompt: lim('x', c, quot(`√(${poly([1, a])}) − ${b}`, poly([1, -c]))),
          value: `1/${2 * b}`,
          explanation: `0/0, so multiply top and bottom by the conjugate √(${poly([1, a])}) + ${b}. The top becomes (${poly([1, a])}) − ${b * b} = ${poly([1, -c])}, which cancels, leaving 1/(√(${poly([1, a])}) + ${b}) → 1/(${b} + ${b}) = 1/${2 * b}.`,
        };
      }
      const c = K.nonZero(r, -4, 5), a = int(r, 2, 4), b = K.nonZero(r, -5, 5);
      if (a * c + b === 0) again();
      return {
        prompt: lim('x', c, quot(poly([a, b - a * c, -b * c]), poly([1, -c]))),
        value: a * c + b,
        explanation: `0/0 at x = ${neg(c)}. Factor the top: (${poly([a, b])})(${poly([1, -c])}). Cancel and substitute: ${a}(${neg(c)}) ${sgn(b)} = ${neg(a * c + b)}.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const c = int(r, 2, 7);
        return {
          prompt: lim('x', c, quot(`1/x − 1/${c}`, poly([1, -c]))),
          value: `-1/${c * c}`,
          explanation: `Combine the top: 1/x − 1/${c} = (${c} − x)/(${c}x) = −(x − ${c})/(${c}x). Cancel x − ${c} to get −1/(${c}x), then substitute: −1/${c * c}. Losing the negative from ${c} − x = −(x − ${c}) is the common slip.`,
        };
      }
      if (form === 1) {
        const c = int(r, 2, 9);
        return {
          prompt: lim('x', c * c, quot(poly([1, -c * c]), `√x − ${c}`)),
          value: 2 * c,
          explanation: `Multiply top and bottom by √x + ${c}: the bottom becomes x − ${c * c}, which cancels with the top, leaving √x + ${c} → ${c} + ${c} = ${2 * c}. (Or factor x − ${c * c} = (√x − ${c})(√x + ${c}).)`,
        };
      }
      if (form === 2) {
        const c = int(r, 2, 7);
        if (int(r, 0, 1) === 1) {
          return {
            prompt: lim('h', 0, `((${c} + h)² − ${c * c})/h`),
            value: 2 * c,
            explanation: `Expand: (${c} + h)² − ${c * c} = ${2 * c}h + h² = h(${2 * c} + h). Cancel h and let h → 0: ${2 * c}. Substituting h = 0 at the start only gives 0/0.`,
          };
        }
        return {
          prompt: lim('h', 0, `((${c} + h)³ − ${c ** 3})/h`),
          value: 3 * c * c,
          explanation: `Expand: (${c} + h)³ − ${c ** 3} = ${3 * c * c}h + ${3 * c}h² + h³ = h(${3 * c * c} + ${3 * c}h + h²). Cancel h and let h → 0: ${3 * c * c}.`,
        };
      }
      const c = K.nonZero(r, -5, 6);
      if (Math.abs(c) === 1) again();
      return {
        prompt: lim('x', c, quot(poly([1, 0, -c * c]), poly([1, 0, 0, -c * c * c]))),
        value: K.frac(2, 3 * c),
        explanation: `Factor both: (${poly([1, -c])})(${poly([1, c])}) over (${poly([1, -c])})(${poly([1, c, c * c])}). Cancel and substitute x = ${neg(c)}: ${neg(2 * c)}/${3 * c * c} = ${fracD(2, 3 * c)}.`,
      };
    }) },
  ],
};

// ── limits at infinity, infinite limits, continuity ────────────────────────

const INF = '∞', NINF = '−∞';
const KIND = {
  removable: 'a removable discontinuity (a hole)',
  jump: 'a jump discontinuity',
  infinite: 'an infinite discontinuity (a vertical asymptote)',
  none: 'no discontinuity: f is continuous there',
};
const KINDS = [KIND.removable, KIND.jump, KIND.infinite, KIND.none];

const LIMITS_CONTINUITY = {
  courseSkill: 'limits-continuity-infinity',
  skillId: 'pc-limits-continuity-infinity',
  tiers: [
    { difficulty: 2, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const a = int(r, 2, 9), d = int(r, 2, 9);
        if (a === d) again();
        const top = [a, K.nonZero(r, -6, 6), K.nonZero(r, -9, 9)], bot = [d, K.nonZero(r, -6, 6), K.nonZero(r, -9, 9)];
        return {
          prompt: `Evaluate the limit: lim (x → ∞) of ${quot(poly(top), poly(bot))}`,
          value: K.frac(a, d),
          explanation: `Top and bottom have the same degree (2), so the limit is the ratio of the leading coefficients: ${a}/${d} = ${K.frac(a, d)}. The lower-power terms stop mattering as x grows.`,
        };
      }
      if (form === 1) {
        const top = [int(r, 2, 9), K.nonZero(r, -9, 9)], bot = [int(r, 1, 6), K.nonZero(r, -6, 6), K.nonZero(r, -9, 9)];
        return {
          prompt: `Evaluate the limit: lim (x → ∞) of ${quot(poly(top), poly(bot))}`,
          value: 0,
          explanation: `The bottom has the higher degree (2 against 1), so it grows faster and the fraction shrinks toward 0. The ratio ${top[0]}/${bot[0]} would only be the answer if the degrees matched.`,
        };
      }
      if (form === 2) {
        const c = K.nonZero(r, -6, 7), a = pick(r, [2, 3, 5, -2, -3, -4]);
        const side = pick(r, ['left', 'right']);
        const pos = (a > 0) === (side === 'right');
        return {
          prompt: `What is the limit of ${neg(a)}/(${poly([1, -c])}) as x approaches ${neg(c)} from the ${side}?`,
          ...mcFixed(r, [INF, NINF, '0', neg(a)], pos ? INF : NINF),
          explanation: `From the ${side}, ${poly([1, -c])} is a tiny ${side === 'right' ? 'positive' : 'negative'} number, and ${neg(a)} divided by it is a huge ${pos ? 'positive' : 'negative'} number: ${pos ? INF : NINF}. The fraction is not approaching 0: the DENOMINATOR is.`,
        };
      }
      const kind = pick(r, ['removable', 'infinite', 'jump']);
      const c = int(r, 1, 7);
      let f, why;
      if (kind === 'removable') {
        f = `f(x) = ${quot(poly([1, 0, -c * c]), poly([1, -c]))}`;
        why = `The top factors as (${poly([1, -c])})(${poly([1, c])}), so the ${poly([1, -c])} cancels: the graph is the line y = ${poly([1, c])} with a single missing point, a hole.`;
      } else if (kind === 'infinite') {
        const a = int(r, 1, 6);
        f = `f(x) = ${a}/(${poly([1, -c])})`;
        why = `At x = ${c} the bottom is 0 and the top is ${a}, not 0. Nothing cancels, so the outputs blow up: a vertical asymptote.`;
      } else {
        const a = K.nonZero(r, -4, 5), b = a + K.nonZero(r, -4, 4);
        if (b === 0) again();
        f = `the function defined by f(x) = ${poly([1, a])} for x < ${c} and f(x) = ${poly([1, b])} for x ≥ ${c}`;
        why = `From the left the outputs approach ${c + a}; from the right they approach ${c + b}. Both are finite but different, so the graph jumps.`;
      }
      return {
        prompt: `Which describes the graph of ${f} at x = ${c}?`,
        ...mcFixed(r, KINDS, KIND[kind]),
        explanation: why,
      };
    }) },
    { difficulty: 3, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const c = int(r, 2, 5), k = K.nonZero(r, -4, 6), a = K.nonZero(r, -6, 6);
        const b = k * c + a - c * c;
        if (b === 0 || k === 1) again();
        return {
          prompt: `A function is defined by f(x) = ${poly([1, a]).replace('x', 'kx')} for x < ${c} and f(x) = ${poly([1, 0, b])} for x ≥ ${c}. What value of k makes f continuous at x = ${c}?`,
          value: k,
          explanation: `The two pieces must meet at x = ${c}: ${c}k ${sgn(a)} = ${c}² ${sgn(b)} = ${c * c + b}. So ${c}k = ${c * c + b - a} and k = ${neg(k)}.`,
        };
      }
      if (form === 1) {
        const a = K.nonZero(r, -7, 7), d = int(r, 2, 9);
        if (Math.abs(a) === d || Math.abs(a) === 1) again();
        const top = [int(r, 1, 9), K.nonZero(r, -6, 6), a], bot = [K.nonZero(r, -9, 9), K.nonZero(r, -5, 5), d];
        const dir = pick(r, [INF, NINF]);
        return {
          prompt: `Evaluate the limit: lim (x → ${dir}) of ${quot(polyAsc(top), polyAsc(bot))}`,
          value: K.frac(a, d),
          explanation: `Find the highest power, wherever it is written: ${neg(a)}x² on top and ${d}x² on the bottom. Equal degrees, so the limit is ${neg(a)}/${d} = ${fracD(a, d)}. The first-written numbers ${top[0]} and ${neg(bot[0])} are not the leading coefficients.`,
        };
      }
      if (form === 2) {
        const a = K.nonZero(r, -6, 6), d = int(r, 2, 7);
        if (Math.abs(a) === d || Math.abs(a) === 1) again();
        const dir = pick(r, [INF, NINF]);
        const pos = (a > 0) === (dir === INF);
        return {
          prompt: `What is lim (x → ${dir}) of ${quot(poly([a, 0, 0, K.nonZero(r, -9, 9)]), poly([d, 0, K.nonZero(r, -9, 9)]))}?`,
          ...mcFixed(r, [INF, NINF, '0', fracD(a, d)], pos ? INF : NINF),
          explanation: `The top has the higher degree (3 against 2), so the fraction behaves like (${fracD(a, d)})x and is unbounded. As x → ${dir}, (${fracD(a, d)})x → ${pos ? INF : NINF}. ${fracD(a, d)} would be the limit only if the degrees were equal.`,
        };
      }
      const c = K.nonZero(r, -5, 6), a = pick(r, [1, 2, 3, -1, -2, -3]);
      const even = int(r, 0, 1) === 1;
      const both = 'It does not exist: the one-sided limits are ∞ and −∞';
      return {
        prompt: `Choose the best description of the limit of ${neg(a)}/(${poly([1, -c])})${even ? '²' : ''} as x approaches ${neg(c)}.`,
        ...mcFixed(r, [INF, NINF, '0', both], even ? (a > 0 ? INF : NINF) : both),
        explanation: even
          ? `(${poly([1, -c])})² is positive on BOTH sides of ${neg(c)}, so ${neg(a)} over it is hugely ${a > 0 ? 'positive' : 'negative'} from either side: ${a > 0 ? INF : NINF}.`
          : `${poly([1, -c])} is negative just left of ${neg(c)} and positive just right of it, so the outputs go to ${a > 0 ? NINF : INF} on the left and ${a > 0 ? INF : NINF} on the right. The sides disagree.`,
      };
    }) },
    { difficulty: 4, gen: g((r, idx) => {
      const form = idx % 4;
      if (form === 0) {
        const c = K.nonZero(r, -5, 6), q = K.nonZero(r, -6, 6);
        if (q === c) again();
        return {
          prompt: `A function is defined by f(x) = ${quot(poly([1, -(c + q), c * q]), poly([1, -c]))} for x ≠ ${neg(c)} and f(${neg(c)}) = k. What value of k makes f continuous at x = ${neg(c)}?`,
          value: c - q,
          explanation: `k must equal the limit. Factor: (${poly([1, -c])})(${poly([1, -q])})/(${poly([1, -c])}) = ${poly([1, -q])} for x ≠ ${neg(c)}, which approaches ${neg(c)} ${sgn(-q)} = ${neg(c - q)}. So k = ${neg(c - q)} fills the hole.`,
        };
      }
      if (form === 1) {
        const c = int(r, 2, 4), a = int(r, 1, 9), b = int(r, 1, 9);
        return {
          prompt: `A function is defined by f(x) = kx + ${a} for x < ${c} and f(x) = kx² − ${b} for x ≥ ${c}. What value of k makes f continuous at x = ${c}?`,
          value: K.frac(a + b, c * c - c),
          explanation: `Match the pieces at x = ${c}: ${c}k + ${a} = ${c * c}k − ${b}. Then ${a + b} = ${c * c - c}k, so k = ${K.frac(a + b, c * c - c)}. k appears in BOTH pieces, so collect the k terms.`,
        };
      }
      if (form === 2) {
        const a = int(r, 2, 5), c = int(r, 2, 5), e = int(r, 2, 9);
        const b = K.nonZero(r, -6, 6), d = K.nonZero(r, -6, 6), f = K.nonZero(r, -9, 9);
        return {
          prompt: `Evaluate the limit: lim (x → ∞) of (${poly([a, b])})(${poly([c, d])})/(${poly([e, 0, f])})`,
          value: K.frac(a * c, e),
          explanation: `Multiplied out, the top starts with ${a}x · ${c}x = ${a * c}x². Same degree as the bottom, so the limit is ${a * c}/${e} = ${K.frac(a * c, e)}. Do not use just ${a} or ${c} as the leading coefficient.`,
        };
      }
      const kind = pick(r, ['removable', 'infinite', 'none', 'jump']);
      if (kind === 'removable' || kind === 'infinite') {
        const c = int(r, 1, 6), q = K.nonZero(r, -5, 5), s = K.nonZero(r, -6, 6);
        if (q === c || s === c || q === s) again();
        const at = kind === 'removable' ? c : s;
        return {
          prompt: `Which describes the graph of f(x) = ${quot(poly([1, -(c + q), c * q]), poly([1, -(c + s), c * s]))} at x = ${neg(at)}?`,
          ...mcFixed(r, KINDS, KIND[kind]),
          explanation: `Factor: (${poly([1, -c])})(${poly([1, -q])}) over (${poly([1, -c])})(${poly([1, -s])}). The factor ${poly([1, -c])} cancels, so x = ${c} is a hole; ${poly([1, -s])} stays in the bottom, so x = ${neg(s)} is a vertical asymptote. At x = ${neg(at)}: ${kind === 'removable' ? 'removable' : 'infinite'}.`,
        };
      }
      const c = int(r, 2, 5), a = int(r, 2, 5), b = K.nonZero(r, -6, 6);
      const left = a * c + b;
      const d = kind === 'none' ? left - c * c : left - c * c + K.nonZero(r, -4, 4);
      if (d === 0) again();
      return {
        prompt: `Which describes the graph of the function defined by f(x) = ${poly([a, b])} for x < ${c} and f(x) = ${poly([1, 0, d])} for x ≥ ${c} at x = ${c}?`,
        ...mcFixed(r, KINDS, KIND[kind]),
        explanation: `From the left: ${a}(${c}) ${sgn(b)} = ${neg(left)}. From the right, and at x = ${c} itself: ${c}² ${sgn(d)} = ${neg(c * c + d)}. ${kind === 'none' ? 'The two sides and the value all agree, so f is continuous there.' : 'Both are finite but different, so the graph jumps.'}`,
      };
    }) },
  ],
};

const TEMPLATES = [
  RADIAN, TRIG_GRAPHS, SINUSOID, TRI_AREA, PARABOLA, SIGMA,
  LIMITS_INTUITIVE, LIMITS_ALGEBRAIC, LIMITS_CONTINUITY,
];

module.exports = { COURSE_ID, GB, TEMPLATES };
