/**
 * Course-level check items, Pre-Calculus (part B) — every answer RE-SOLVED
 * from the printed question.
 *
 * Nothing here calls the templates' own maths. Each re-solver reads the
 * numbers, the function or the choices out of the prompt a student would see
 * and works the answer a second way: formulas typed by hand for the radian and
 * triangle skills; a parsed y = a·f(b(x − c)) + d for the graphs; SAMPLING the
 * printed model for the sinusoid contexts; focus and directrix computed for
 * every choice of a parabola equation; sums added term by term; and limits
 * measured NUMERICALLY from the printed expression (two-sided, one-sided, at
 * ±∞), never by factoring.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelPrecalcB');

const ITEMS = {};
for (const t of bank.TEMPLATES) ITEMS[t.skillId] = expand(t, bank.GB);
const ALL = Object.values(ITEMS).flat();

// ── a reader's toolkit ─────────────────────────────────────────────────────

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const ascii = (s) => String(s).replace(/−/g, '-');
const num = (s) => Number(ascii(s));
const um = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const point = (x, y) => `(${um(x)}, ${um(y)})`;

/** A rational multiple of π the way a textbook prints it. */
function piS(n, d = 1) {
  const k = gcd(n, d);
  let a = n / k, b = d / k;
  if (b < 0) { a = -a; b = -b; }
  const m = Math.abs(a);
  return `${a < 0 ? '−' : ''}${m === 1 ? '' : m}π${b === 1 ? '' : `/${b}`}`;
}
const d2 = (x) => String(Number(x.toFixed(2)));
function whole(x) {
  if (Math.abs(x - Math.round(x)) > 1e-6) throw new Error(`expected a whole number, got ${x}`);
  return Math.round(x);
}
/** The simplest fraction equal to a measured number. */
function nearFrac(v) {
  for (let q = 1; q <= 200; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p / q - v) < 1e-5) return q === 1 ? String(p) : `${p}/${q}`;
  }
  throw new Error(`not a simple fraction: ${v}`);
}

/** Printed algebra → JavaScript. */
function toJS(e) {
  let s = String(e).replace(/−/g, '-').replace(/·/g, '*').replace(/\s+/g, '');
  s = s.replace(/k(?=x)/g, 'k*');
  s = s.replace(/(\d)([a-zA-Z(√])/g, '$1*$2');
  s = s.replace(/([a-z)])\(/g, '$1*(');
  s = s.replace(/√\(/g, 'Math.sqrt(').replace(/√([a-z0-9]+)/g, 'Math.sqrt($1)');
  s = s.replace(/([a-z]|\d+(?:\.\d+)?|\([^()]*\))([²³⁴])/g, (m, b, p) => `(${b}**${'²³⁴'.indexOf(p) + 2})`);
  s = s.replace(/(\d+|\([^()]*\))\^(\([^()]*\)|[a-z0-9]+)/g, '($1**$2)');
  return s;
}
function ev(e, vars) {
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(vars), `return ${toJS(e)};`)(...Object.values(vars));
}
const twoSided = (e, v, c) => (ev(e, { [v]: c - 1e-6 }) + ev(e, { [v]: c + 1e-6 })) / 2;

/** The value of a choice, where it has one. */
function valOf(text) {
  const t = String(text);
  let m;
  if (t === '∞') return Infinity;
  if (t === '−∞') return -Infinity;
  if ((m = t.match(/^(−?)(\d*)π(?:\/(\d+))?$/))) return (m[1] ? -1 : 1) * Number(m[2] || 1) / Number(m[3] || 1) * Math.PI;
  if (/^−?\d+(\.\d+)?$/.test(t)) return num(t);
  if ((m = t.match(/^(−?\d+)\/(\d+)$/))) return num(m[1]) / Number(m[2]);
  if ((m = t.match(/^(\d+)√(\d+)$/))) return Number(m[1]) * Math.sqrt(Number(m[2]));
  return null;
}

function rules(p, list) {
  for (const [re, fn] of list) {
    const m = p.match(re);
    if (m) return fn(...m.slice(1));
  }
  throw new Error(`no re-solver rule matches: ${p}`);
}
function only(options, test) {
  const good = options.filter(test);
  if (good.length !== 1) throw new Error(`${good.length} choices fit: ${options.join(' | ')}`);
  return good[0];
}
const N = Number;
const pn = (s) => N(s || 1);   // the "" before π reads as 1

// ── trig functions as printed ──────────────────────────────────────────────

const TRIG = /= (−?\d*) ?(sin|cos|tan)\(((?:[^()]|\([^()]*\))*)\)(?: ([+−]) (\d+))?/g;
/** { a, fn, d, b: [num, den, hasPi], shift: [num, den] of π (positive = right) }. */
function readTrig(text) {
  return [...text.matchAll(TRIG)].map((m) => {
    const a = m[1] === '' ? 1 : (m[1] === '−' ? -1 : num(m[1]));
    const d = m[4] ? (m[4] === '−' ? -1 : 1) * N(m[5]) : 0;
    const inner = m[3];
    let k, b, shift = [0, 1];
    if ((k = inner.match(/^(\d*)[xt]$/))) b = [pn(k[1]), 1, false];
    else if ((k = inner.match(/^π[xt](?:\/(\d+))?$/))) b = [1, pn(k[1]), true];
    else if ((k = inner.match(/^π\(t − (\d+)\)\/(\d+)$/))) { b = [1, N(k[2]), true]; shift = ['t', N(k[1])]; }
    else if ((k = inner.match(/^(\d+)\(x ([−+]) (\d*)π(?:\/(\d+))?\)$/))) {
      b = [N(k[1]), 1, false];
      shift = [(k[2] === '−' ? 1 : -1) * pn(k[3]), pn(k[4])];
    } else if ((k = inner.match(/^(\d+)x ([−+]) (\d*)π(?:\/(\d+))?$/))) {
      b = [N(k[1]), 1, false];
      shift = [(k[2] === '−' ? 1 : -1) * pn(k[3]), pn(k[4]) * N(k[1])];   // bx − φ = b(x − φ/b)
    } else throw new Error(`cannot read the inside of the function: ${inner}`);
    const bNum = (b[2] ? Math.PI : 1) * b[0] / b[1];
    const c = shift[0] === 't' ? shift[1] : shift[0] / shift[1] * Math.PI;
    const f = (x) => a * Math[m[2]](bNum * (x - c)) + d;
    return { a, fn: m[2], d, b, bNum, shift, f };
  });
}
const sideways = (sh) => `${piS(Math.abs(sh[0]), sh[1])} units to the ${sh[0] > 0 ? 'right' : 'left'}`;
const close = (x, y) => Math.abs(x - y) < 1e-6;

// ── parabolas as printed ───────────────────────────────────────────────────

const PARAB = /(?:\((x|y) ([−+]) (\d+)\)|(x|y))² = (−?\d+)(?:\((x|y) ([−+]) (\d+)\)|(x|y))/;
function readParab(text) {
  const m = String(text).match(PARAB);
  if (!m) throw new Error(`not a parabola: ${text}`);
  const sqVar = m[1] || m[4];
  const sqShift = m[1] ? (m[2] === '−' ? 1 : -1) * N(m[3]) : 0;
  const otherShift = m[6] ? (m[7] === '−' ? 1 : -1) * N(m[8]) : 0;
  const vert = sqVar === 'x';
  const h = vert ? sqShift : otherShift, k = vert ? otherShift : sqShift;
  const p = num(m[5]) / 4;
  return {
    vert, h, k, p,
    vertex: point(h, k),
    focus: vert ? point(h, k + p) : point(h + p, k),
    directrix: vert ? `y = ${um(k - p)}` : `x = ${um(h - p)}`,
    axis: vert ? `x = ${um(h)}` : `y = ${um(k)}`,
    opens: vert ? (p > 0 ? 'up' : 'down') : (p > 0 ? 'right' : 'left'),
  };
}

// ── sums as printed ────────────────────────────────────────────────────────

const SIGMA = /Σ \(from k = (\d+) to (\d+|n|∞)\) of (.+?)(?= equal|[.?]?$)/;
function sumOf(text, upTo) {
  const m = String(text).match(SIGMA);
  if (!m) throw new Error(`not a sum: ${text}`);
  const lo = N(m[1]), hi = upTo !== undefined ? upTo : N(m[2]);
  const terms = [];
  for (let k = lo; k <= hi; k++) terms.push(ev(m[3], { k }));
  return { lo, hi: m[2], terms, total: terms.reduce((s, v) => s + v, 0) };
}

// ── limits ─────────────────────────────────────────────────────────────────

const DNE = 'Does not exist';
/** The limit of a table's outputs on each side, by following the last two entries in to x = c. */
function tableSides(xs, ys, c) {
  const pts = xs.map((x, i) => [x, ys[i]]);
  const run = (side) => {
    const s = pts.filter(([x]) => (side < 0 ? x < c : x > c)).sort((u, v) => Math.abs(u[0] - c) - Math.abs(v[0] - c));
    const [[x1, y1], [x2, y2]] = s;
    return Number((y1 + (y1 - y2) / (x1 - x2) * (c - x1)).toFixed(6));
  };
  return [run(-1), run(1)];
}
/** What a formula does at x = c, measured. */
function classify(e, c) {
  const l = ev(e, { x: c - 1e-6 }), r = ev(e, { x: c + 1e-6 });
  if (Math.abs(l) > 1e4 || Math.abs(r) > 1e4) return 'infinite';
  if (Math.abs(l - r) > 1e-3) return 'jump';
  const at = ev(e, { x: c });
  return Number.isFinite(at) && Math.abs(at - l) < 1e-3 ? 'none' : 'removable';
}
const KIND = {
  removable: 'a removable discontinuity (a hole)',
  jump: 'a jump discontinuity',
  infinite: 'an infinite discontinuity (a vertical asymptote)',
  none: 'no discontinuity: f is continuous there',
};
const SIN_TABLE = (deg, s) => {
  if (Math.abs(Math.sin(deg * Math.PI / 180) - s) > 0.006) throw new Error(`sin ${deg}° is not ${s}`);
  return s;
};
const heron = (x, y, z) => { const s = (x + y + z) / 2; return Math.sqrt(s * (s - x) * (s - y) * (s - z)); };
const sinD = (deg) => Math.sin(deg * Math.PI / 180);

// ── one re-solver per skill ────────────────────────────────────────────────

const RESOLVE = {
  'pc-radian-measure-arc-length': (p) => rules(p, [
    [/Convert (\d+)° to radians/, (D) => piS(N(D), 180)],
    [/Convert (\d*)π(?:\/(\d+))? radians to degrees/, (n, d) => whole(pn(n) * 180 / pn(d))],
    [/radius of (\d+) \w+\. A central angle of (\d*)π(?:\/(\d+))? radians intercepts an arc of the circle/, (r, n, d) => piS(pn(n) * N(r), pn(d))],
    [/radius of (\d+) \w+\. A central angle of ([\d.]+) radians intercepts an arc\./, (r, t) => N(r) * N(t)],
    [/sector of a circle has a radius of (\d+) \w+ and a central angle of (\d*)π(?:\/(\d+))? radians\. What is the area/, (r, n, d) => piS(pn(n) * N(r) ** 2, 2 * pn(d))],
    [/arc of length ([\d.]+) \w+ lies on a circle with a radius of (\d+)/, (s, r) => N(s) / N(r)],
    [/coterminal with (−?)(\d*)π\/(\d+)/, (sg, n, d) => {
      let top = (sg ? -1 : 1) * pn(n);               // in units of π/d; a full turn is 2d of them
      while (top < 0) top += 2 * N(d);
      while (top >= 2 * N(d)) top -= 2 * N(d);
      return piS(top, N(d));
    }],
    [/radius of (\d+) cm turns at an angular speed of (\d+) radians per second/, (r, w) => N(r) * N(w)],
    [/^A wheel turns at (\d+) revolutions per minute/, (n) => piS(2 * N(n), 60)],
    [/radius of (\d+) cm turns at (\d+) revolutions per minute/, (r, n) => piS(2 * N(n) * N(r))],
    [/radius of (\d+) \w+ and an area of (\d*)π(?:\/(\d+))? \w+²\. What is the measure of its central angle/, (r, n, d) => piS(2 * pn(n), pn(d) * N(r) ** 2)],
    [/radius of (\d+) \w+\. A central angle of (\d+)° intercepts an arc/, (r, D) => piS(N(D) * 2 * N(r), 360)],   // D/360 of 2πr
  ]),

  'pc-trig-function-graphs': (p, opts) => {
    const fs = readTrig(p);
    if (/amplitude of y/.test(p)) return Math.abs(fs[0].a);
    if (/What is the period of/.test(p)) {
      const { fn, b } = fs[0];
      const turn = fn === 'tan' ? 1 : 2;             // tangent repeats every π
      return b[2] ? whole(turn * b[1] / b[0]) : piS(turn * b[1], b[0]);
    }
    if (/The midline of/.test(p)) return fs[0].d;
    if (/(maximum|minimum) value of y =/.test(p)) return /maximum/.test(p) ? fs[0].d + Math.abs(fs[0].a) : fs[0].d - Math.abs(fs[0].a);
    if (/shifted horizontally/.test(p)) {
      if (fs[0].shift[0] !== 0 || fs[0].a !== fs[1].a || fs[0].d !== fs[1].d) throw new Error('the two graphs differ by more than a shift');
      return sideways(fs[1].shift);
    }
    if (/phase shift/.test(p)) return sideways(fs[0].shift);
    if (/range of/.test(p)) return `[${um(fs[0].d - Math.abs(fs[0].a))}, ${um(fs[0].d + Math.abs(fs[0].a))}]`;
    if (/Which equation matches/.test(p)) {
      const [A, P, mid] = p.match(/amplitude of (\d+), a period of (\d+), and a midline of y = (\d+)/).slice(1).map(N);
      return only(opts, (o) => {
        const { f } = readTrig(o)[0];
        // on the midline at 0 and going up; top a quarter-period later; repeats after P
        return close(f(0), mid) && close(f(P / 4), mid + A) && close(f(3 * P / 4), mid - A) && close(f(P), mid) && close(f(P / 8), f(P / 8 + P));
      });
    }
    if (/vertical asymptote/.test(p)) {
      const { bNum } = fs[0];
      return only(opts, (o) => Math.abs(Math.cos(bNum * valOf(o.replace('x = ', '')))) < 1e-9);
    }
    return rules(p, [
      [/maximum value of (−?\d+) and a minimum value of (−?\d+)\. What is the value of (a|d)/, (M, m, ask) => (ask === 'a' ? (num(M) - num(m)) / 2 : (num(M) + num(m)) / 2)],
    ]);
  },

  'pc-sinusoidal-modeling': (p, opts) => {
    const model = readTrig(p)[0];
    const sample = (f, from, to, step) => { const out = []; for (let t = from; t < to - 1e-9; t += step) out.push([t, f(t)]); return out; };
    const best = (pts, sign) => pts.reduce((u, v) => (sign * v[1] > sign * u[1] + 1e-9 ? v : u));
    const period = model ? 2 * Math.PI / model.bNum : null;
    return rules(p, [
      [/lowest point of a Ferris wheel is (\d+) m .* highest point is (\d+) m .* amplitude/, (L, H) => (N(H) - N(L)) / 2],
      [/low of (\d+) ft and a high of (\d+) ft\. The midline/, (L, H) => (N(L) + N(H)) / 2],
      [/What is the period of the model/, () => whole(period)],
      [/rider's (maximum|minimum) height/, (w) => whole(best(sample(model.f, 0, period, period / 2400), w === 'maximum' ? 1 : -1)[1])],
      [/(?:depth at|How high is the rider at) t = (\d+)/, (t) => whole(model.f(N(t)))],
      [/one revolution every (\d+) seconds\. .* What is the value of b/, (T) => piS(2, N(T))],
      [/low of (\d+)°F and a high of (\d+)°F, repeating every (\d+) hours\. At t = 0 the temperature is at its highest/, (L, H, T) => only(opts, (o) => {
        const { f } = readTrig(o)[0];
        return close(f(0), N(H)) && close(f(N(T) / 2), N(L)) && close(f(N(T) / 4), (N(L) + N(H)) / 2) && close(f(N(T)), N(H));
      })],
      [/between a high tide and the next low tide/, () => {
        if (!close(model.f(0), model.d + Math.abs(model.a))) throw new Error('t = 0 is not a high tide');
        return whole(best(sample(model.f, 0, period, period / 2400), -1)[0]);
      }],
      [/lowest point, (\d+) m above the ground\. The top of the wheel is (\d+) m .* one revolution every (\d+) seconds/, (L, H, T) => only(opts, (o) => {
        const { f } = readTrig(o)[0];
        return close(f(0), N(L)) && close(f(N(T) / 2), N(H)) && close(f(N(T) / 4), (N(L) + N(H)) / 2) && close(f(N(T)), N(L));
      })],
      [/for 0 ≤ t < 24\. At what value of t is the temperature (highest|lowest)/, (w) => whole(best(sample(model.f, 0, 24, 0.01), w === 'highest' ? 1 : -1)[0])],
      [/During one full revolution, for how many seconds is the rider at least (\d+) m/, (X) => {
        const dt = period / 24000;
        return whole(Number((sample(model.f, 0, period, dt).filter(([, h]) => h >= N(X) - 1e-9).length * dt).toFixed(1)));
      }],
    ]);
  },

  'pc-triangle-area-applications': (p, opts) => rules(p, [
    [/a = (\d+), b = (\d+), and the included angle C measures (\d+)°\. What is the area/, (a, b, C) => whole(0.5 * a * b * sinD(C))],
    [/a = (\d+), b = (\d+), and the included angle C measures (\d+)°\. What is the exact area/, (a, b, C) => only(opts, (o) => close(valOf(o), 0.5 * a * b * sinD(C)))],
    [/(?:measure|as) (\d+) \w+ and (\d+) \w+, (?:and the angle between them measures|with an angle of) (\d+)°.* Using sin (\d+)° ≈ ([\d.]+)/, (a, b, C, C2, s) => {
      if (C !== C2) throw new Error('two different angles');
      return d2(0.5 * a * b * SIN_TABLE(N(C), N(s)));
    }],
    [/sides of (\d+), (\d+) and (\d+) \w+\. Use Heron/, (x, y, z) => whole(heron(N(x), N(y), N(z)))],
    [/edges of (\d+) ft, (\d+) ft and (\d+) ft/, (x, y, z) => whole(heron(N(x), N(y), N(z)))],
    [/two sides of (\d+) m and (\d+) m that meet at an angle of (\d+)°\. What is the area of the garden/, (a, b, C) => whole(0.5 * a * b * sinD(C))],
    [/area of (\d+) \w+²\. One side measures (\d+) \w+, and it meets a second side at an angle of (\d+)°/, (A, a, C) => whole(2 * A / (a * sinD(C)))],
    [/parallelogram has adjacent sides of (\d+) \w+ and (\d+) \w+ that meet at an angle of (\d+)°/, (a, b, C) => whole(a * b * sinD(C))],
    [/area of (\d+) \w+²\. Two of its sides measure (\d+) \w+ and (\d+) \w+, and the angle between them is (acute|obtuse)/, (A, a, b, kind) => {
      const acute = Math.asin(2 * A / (a * b)) * 180 / Math.PI;
      return whole(kind === 'acute' ? acute : 180 - acute);
    }],
    [/sides of (\d+), (\d+) and (\d+) \w+\. What is the length of the altitude drawn to the side of length (\d+)/, (x, y, z, side) => {
      if (![x, y, z].includes(side)) throw new Error('no such side');
      return whole(2 * heron(N(x), N(y), N(z)) / N(side));
    }],
    [/two sides of (\d+) m and (\d+) m that meet at an angle of (\d+)°\. Land there sells for (\d+) dollars/, (a, b, C, cost) => whole(0.5 * a * b * sinD(C) * cost)],
  ]),

  'pc-parabola-analysis': (p, opts) => {
    if (/Which equation is the parabola's/.test(p)) {
      const pt = (s) => s.replace(/\s+/g, ' ');
      return rules(p, [
        [/vertex at the origin and its focus at (\(.+?\))/, (F) => only(opts, (o) => { const q = readParab(o); return q.vertex === '(0, 0)' && q.focus === pt(F); })],
        [/focus at (\(.+?\)) and its directrix is the line ([xy] = −?\d+)/, (F, dir) => only(opts, (o) => { const q = readParab(o); return q.focus === pt(F) && q.directrix === dir; })],
        [/vertex at (\(.+?\)) and its directrix is the line ([xy] = −?\d+)/, (V, dir) => only(opts, (o) => { const q = readParab(o); return q.vertex === pt(V) && q.directrix === dir; })],
      ]);
    }
    const general = p.match(/x² ([+−]) (\d+)x ([+−]) (\d+)y ([+−]) (\d+) = 0/);
    if (general) {
      // x² + Bx + Cy + D = 0  →  (x + B/2)² = −C(y − (B²/4 − D)/C)
      const s = (i) => (general[i] === '−' ? -1 : 1) * N(general[i + 1]);
      const B = s(1), C = s(3), D = s(5);
      const h = -B / 2, k = (B * B / 4 - D) / C, pp = -C / 4;
      // a point of the curve must be as far from the focus as from the directrix
      const x = h + 3, y = -(x * x + B * x + D) / C;
      if (!close(Math.hypot(x - h, y - (k + pp)), Math.abs(y - (k - pp)))) throw new Error('focus and directrix do not fit the curve');
      return point(h, k + pp);
    }
    const q = readParab(p);
    if (/What is the vertex/.test(p)) return q.vertex;
    if (/What is the value of p/.test(p)) return q.p;
    if (/In which direction/.test(p)) return q.opens;
    if (/What is the focus/.test(p)) return q.focus;
    if (/What is the directrix/.test(p)) return q.directrix;
    if (/axis of symmetry/.test(p)) return q.axis;
    throw new Error(`no re-solver rule matches: ${p}`);
  },

  'pc-series-sigma-notation': (p, opts) => {
    if (/Which expression in sigma notation equals/.test(p)) {
      const list = p.match(/equals ([\d +]+)\?/)[1].split(' + ').map(N);
      return only(opts, (o) => {
        const { terms } = sumOf(o);
        return terms.length === list.length && terms.every((t, i) => t === list[i]);
      });
    }
    if (/How many terms/.test(p)) return sumOf(p).terms.length;
    if (/infinite sum/.test(p)) return nearFrac(sumOf(p, 3000).total);
    if (/For what value of n/.test(p)) {
      const S = N(p.match(/equal (\d+)\?/)[1]);
      for (let n = 1; n < 2000; n++) if (sumOf(p, n).total === S) return n;
      throw new Error('no n reaches the sum');
    }
    if (/Evaluate the sum/.test(p)) return whole(sumOf(p).total);
    throw new Error(`no re-solver rule matches: ${p}`);
  },

  'pc-limits-intuitive': (p) => rules(p, [
    [/x: ([\d., ]+) and f\(x\): ([\d., ]+)\. Based on the table, what is the limit of f\(x\) as x approaches (\d+)\?/, (xs, ys, c) => {
      const [l, r] = tableSides(xs.split(', ').map(N), ys.split(', ').map(N), N(c));
      return l === r ? l : DNE;
    }],
    [/is the line y = (.+?), except that there is an open circle \(a hole\) on the line at x = (\d+) and a single filled point at \((\d+), (−?\d+)\)\. (What is the limit|Which statement)/, (line, c, c2, V, ask) => {
      if (c !== c2) throw new Error('the point is not at the hole');
      const L = ev(line, { x: N(c) });
      return ask === 'What is the limit' ? L : `The limit is ${um(L)} and f(${c}) = ${V}`;
    }],
    [/to the left of x = \d+ the graph approaches a height of (−?\d+), and to the right of x = \d+ it approaches a height of (−?\d+)\. .* from the (left|right)/, (L, R, side) => num(side === 'left' ? L : R)],
    [/from the left, f\(x\) approaches (−?\d+)\. As x approaches \d+ from the right, f\(x\) approaches (−?\d+)\. (?:The value of the function there is f\((\d+)\) = (−?\d+)|The function is not defined at x = (\d+))\. (What is the limit|Which statement)/, (L, R, c1, V, c2, ask) => {
      const c = c1 || c2;
      if (ask === 'What is the limit') return L === R ? L : DNE;
      if (L !== R) return 'The limit does not exist';
      if (V === undefined) return `The limit exists, and f(${c}) is not defined`;
      return `The limit exists, and f(${c}) is ${V === L ? 'the same' : 'a different'} number`;
    }],
    [/f\(x\) = (.+?) for x < (\d+) and f\(x\) = (.+?) for x (?:≥|>) \d+\. .*as x approaches \d+( from the (left|right))?\?/, (e1, c, e2, oneSided, side) => {
      const l = ev(e1, { x: N(c) - 1e-7 }), r = ev(e2, { x: N(c) + 1e-7 });
      if (oneSided) return whole(Number((side === 'left' ? l : r).toFixed(4)));
      return Math.abs(l - r) < 1e-4 ? um(whole(Number(l.toFixed(4)))) : DNE;
    }],
    [/The graph of f\(x\) = (.+?) is the line y = (.+?) with a hole at x = (\d+)/, (e, line, c) => {
      const L = twoSided(e, 'x', N(c));
      if (!close(ev(e, { x: 1.37 }), ev(line, { x: 1.37 }))) throw new Error('the formula is not that line');
      return whole(Number(L.toFixed(4)));
    }],
    [/swing back and forth between −(\d+) and (\d+) faster and faster, never settling/, () => DNE],
  ]),

  'pc-limits-algebraic': (p) => rules(p, [
    [/lim \((x|h) → (−?\d+)\) of (.+)$/, (v, c, e) => nearFrac(twoSided(e, v, num(c)))],
  ]),

  'pc-limits-continuity-infinity': (p) => rules(p, [
    [/^Evaluate the limit: lim \(x → (−?)∞\) of (.+)$/, (sg, e) => nearFrac(Number(ev(e, { x: (sg ? -1 : 1) * 1e8 }).toFixed(6)))],
    [/^What is lim \(x → (−?)∞\) of (.+)\?$/, (sg, e) => {
      const far = ev(e, { x: (sg ? -1 : 1) * 1e8 }), farther = ev(e, { x: (sg ? -1 : 1) * 1e10 });
      if (Math.abs(far) < 1e5 || Math.abs(farther) < 50 * Math.abs(far)) throw new Error('the outputs settle');
      return far > 0 ? '∞' : '−∞';
    }],
    [/What is the limit of (.+?) as x approaches (−?\d+) from the (left|right)\?/, (e, c, side) => {
      const v = ev(e, { x: num(c) + (side === 'left' ? -1e-8 : 1e-8) });
      if (Math.abs(v) < 1e6) throw new Error('the outputs settle');
      return v > 0 ? '∞' : '−∞';
    }],
    [/best description of the limit of (.+?) as x approaches (−?\d+)\.$/, (e, c) => {
      const l = ev(e, { x: num(c) - 1e-6 }), r = ev(e, { x: num(c) + 1e-6 });
      if (Math.abs(l) < 1e5 || Math.abs(r) < 1e5) throw new Error('the outputs settle');
      if (l > 0 !== r > 0) return 'It does not exist: the one-sided limits are ∞ and −∞';
      return l > 0 ? '∞' : '−∞';
    }],
    [/Which describes the graph of the function defined by f\(x\) = (.+?) for x < (\d+) and f\(x\) = (.+?) for x ≥ (\d+) at x = (\d+)\?/, (e1, c, e2, c2, c3) => {
      if (c !== c2 || c !== c3) throw new Error('three different points');
      const l = ev(e1, { x: N(c) }), at = ev(e2, { x: N(c) });   // the second piece owns x = c
      return KIND[l === at ? 'none' : 'jump'];
    }],
    [/Which describes the graph of f\(x\) = (.+?) at x = (−?\d+)\?/, (e, c) => KIND[classify(e, num(c))]],
    [/f\(x\) = (.+?) for x < (\d+) and f\(x\) = (.+?) for x ≥ \d+\. What value of k/, (e1, c, e2) => {
      // the gap between the pieces at x = c is a straight line in k: find where it is 0
      const gap = (k) => ev(e1, { x: N(c), k }) - ev(e2, { x: N(c), k });
      return nearFrac(-gap(0) / (gap(1) - gap(0)));
    }],
    [/f\(x\) = (.+?) for x ≠ (−?\d+) and f\((−?\d+)\) = k/, (e, c, c2) => {
      if (c !== c2) throw new Error('two different points');
      return nearFrac(twoSided(e, 'x', num(c)));
    }],
  ]),
};

// ── the tests ──────────────────────────────────────────────────────────────

describe('course-level items — Pre-Calculus B', () => {
  test('the bank is for the precalculus course, nine skills, twelve items each', () => {
    expect(bank.COURSE_ID).toBe('precalculus');
    expect(bank.GB).toBe('9-12');
    expect(bank.TEMPLATES).toHaveLength(9);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`pc-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
      expect(ITEMS[t.skillId]).toHaveLength(12);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(ALL)).toEqual([]);
  });

  test.each(ALL.map((it) => [it.problemId, it]))('%s re-solves from its own text', (_id, item) => {
    const options = (item.options || []).map((o) => o.text);
    const expected = String(RESOLVE[item.skillId](item.prompt, options));
    expect(ascii(item.answer.value)).toBe(ascii(expected));
    if (item.options) {
      const keyed = item.options.find((o) => o.label === item.correctOption);
      expect(ascii(keyed.text)).toBe(ascii(expected));
      // no wrong choice is the right answer written another way
      const right = valOf(keyed.text);
      if (right !== null) {
        for (const o of item.options) {
          if (o === keyed) continue;
          const v = valOf(o.text);
          if (v !== null) expect([o.text, v === right || Math.abs(v - right) < 1e-9]).toEqual([o.text, false]);
        }
      }
    }
  });

  test('a typed answer is one number or fraction; anything with π, √, ∞ or words is multiple choice', () => {
    for (const it of ALL) {
      if (it.answerType === 'constructed-response') expect(it.answer.value).toMatch(/^-?\d+(\.\d{1,2})?$|^-?\d+\/\d+$/);
      else expect(it.options).toHaveLength(4);
    }
  });

  test('a typed fraction is in lowest terms', () => {
    for (const it of ALL) {
      const m = it.answer.value.match(/^-?(\d+)\/(\d+)$/);
      if (m && it.answerType === 'constructed-response') expect([it.problemId, gcd(N(m[1]), N(m[2]))]).toEqual([it.problemId, 1]);
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

  test('the reader itself: printed algebra and printed functions are read correctly', () => {
    expect(ev('(x² − 9)/(x − 3)', { x: 4 })).toBe(7);
    expect(ev('−x² + 3x − 2', { x: 3 })).toBe(-2);
    expect(ev('(√(x + 7) − 3)/(x − 2)', { x: 9 })).toBeCloseTo(1 / 7);
    expect(ev('4 · (−2)^(k − 1)', { k: 3 })).toBe(16);
    expect(ev('(2x + 1)(4x + 2)/(5x² − 5)', { x: 2 })).toBeCloseTo(50 / 15);
    expect(ev('kx² − 9', { x: 2, k: 3 })).toBe(3);
    const [f] = readTrig('y = −3 cos(2(x − π/4)) + 5');
    expect(f.f(Math.PI / 4)).toBeCloseTo(2);
    expect(sideways(f.shift)).toBe('π/4 units to the right');
    const q = readParab('(y + 4)² = 12(x + 3)');
    expect([q.vertex, q.focus, q.directrix, q.opens]).toEqual(['(−3, −4)', '(0, −4)', 'x = −6', 'right']);
  });
});
