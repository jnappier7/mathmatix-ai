/**
 * Shared helpers for the Algebra 2 unit banks (utils/liveDrill/review/alg2Unit*.js): how an
 * expression is printed, a stacked system, a stacked fraction, a coordinate grid with curves on it,
 * and a matrix. Everything here is presentation — the banks do the mathematics, and
 * tests/unit/liveDrillAlg2Units.test.js re-solves every computed answer from the printed text.
 */
const { M, num, int, pick } = require('../prep/kit');

const sup = (e) => `<sup>${e}</sup>`;
const sub = (e) => `<sub>${e}</sub>`;
/** A nonzero integer in [lo, hi]. */
const nz = (rand, lo, hi) => { let v = 0; while (v === 0) v = int(rand, lo, hi); return v; };
const sgn = (x) => (x < 0 ? M : '+');
/** " + 3", " − 3", "" for zero */
const term = (n) => (n === 0 ? '' : ` ${sgn(n)} ${Math.abs(n)}`);
/** "(−3)" for a negative, "3" otherwise — a value substituted into an expression */
const par = (n) => (n < 0 ? `(${num(n)})` : String(n));
/** "3x", "−x", "x" (a coefficient on a variable or a bracket) */
const co = (k, v = 'x') => (k === 1 ? v : k === -1 ? `${M}${v}` : `${num(k)}${v}`);

/**
 * A linear expression from [[coefficient, variable], …] and a constant: lin([[2, 'x'], [-3, 'y']])
 * → "2x − 3y". Zero terms are dropped; an all-zero expression prints "0".
 */
function lin(terms, c = 0) {
  let s = '';
  for (const [k, v] of terms) {
    if (!k) continue;
    const mag = Math.abs(k) === 1 ? '' : String(Math.abs(k));
    s += s ? ` ${sgn(k)} ${mag}${v}` : `${k < 0 ? M : ''}${mag}${v}`;
  }
  if (!s) return num(c);
  return s + term(c);
}
/** "2x − 3y = −4" */
const eqn = (terms, rhs) => `${lin(terms)} = ${num(rhs)}`;
/** Equations stacked one per line, the way the packets print a system. */
const sys = (...eqs) => eqs.join('<br>');
/** "(3, −4)" / "(5, 0, 1)" */
const pt = (...v) => `(${v.map(num).join(', ')})`;
/** ax² + bx + c (a ≠ 0) */
function quad(a, b, c, v = 'x') {
  let s = `${a === 1 ? '' : a === -1 ? M : num(a)}${v}${sup(2)}`;
  if (b) s += ` ${sgn(b)} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${v}`;
  return s + term(c);
}
/** a(x − h)² + k, printed the way vertex form is written: the sign inside flips */
function vertexForm(a, h, k, v = 'x') {
  const inner = h === 0 ? `${v}${sup(2)}` : `(${v}${term(-h)})${sup(2)}`;
  return `${a === 1 ? '' : a === -1 ? M : num(a)}${inner}${term(k)}`;
}
/** A stacked fraction (live-drill.css .frac). */
const fr = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
/** "$1,870" / "$9.50" */
function money(n) {
  const whole = Number.isInteger(n);
  const [i, d] = (whole ? String(n) : n.toFixed(2)).split('.');
  return `$${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d ? `.${d}` : ''}`;
}
/** 1870 → "1,870" */
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------------------------------------------------------------- the coordinate grid (SVG)

const INK = '#2e6fd8'; const INK2 = '#c2452d';
/**
 * A square grid from −R to R on both axes. Returns { svg(inner, label), X, Y, R } so a bank places
 * its own curves. Grid lines every unit, labels at ±R/2 and ±R.
 */
function plane(R = 10, U = 15) {
  const W = 2 * R * U;
  const X = (x) => (x + R) * U; const Y = (y) => (R - y) * U;
  const svg = (inner, label) => {
    let g = '';
    for (let i = -R; i <= R; i++) {
      const w = i % 5 ? 0.6 : 1;
      g += `<line x1="${X(i)}" y1="0" x2="${X(i)}" y2="${W}" stroke="#d8dee2" stroke-width="${w}"/><line x1="0" y1="${Y(i)}" x2="${W}" y2="${Y(i)}" stroke="#d8dee2" stroke-width="${w}"/>`;
    }
    const marks = R >= 10 ? [-10, -5, 5, 10].filter((t) => Math.abs(t) <= R) : R >= 6 ? [-R, -R / 2, R / 2, R].filter(Number.isInteger) : Array.from({ length: 2 * R + 1 }, (_, i) => i - R).filter((t) => t);
    const fs = R <= 6 ? 12 : 10;
    const ticks = marks.map((t) => `<text x="${X(t)}" y="${Y(0) + fs + 3}" font-size="${fs}" text-anchor="middle" fill="#5b6b72">${num(t)}</text><text x="${X(0) - 4}" y="${Y(t) + 3}" font-size="${fs}" text-anchor="end" fill="#5b6b72">${num(t)}</text>`).join('');
    return `<svg viewBox="-6 -6 ${W + 12} ${W + 12}" width="300" role="img" aria-label="${label}"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker><marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK2}"/></marker></defs><rect x="0" y="0" width="${W}" height="${W}" fill="#fff"/>${g}
    <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#14212a" stroke-width="1.6"/><line x1="${X(0)}" y1="0" x2="${X(0)}" y2="${W}" stroke="#14212a" stroke-width="1.6"/>
    ${ticks}<text x="${W - 4}" y="${Y(0) - 5}" font-size="12" text-anchor="end" font-style="italic">x</text><text x="${X(0) + 6}" y="12" font-size="12" font-style="italic">y</text>${inner}</svg>`;
  };
  /** A curve y = f(x) sampled across [from, to], clipped to the window; arrows on the ends that leave it or are marked. */
  const curve = (f, { from = -R, to = R, color = INK, arrows = 'both', step = 0.1, width = 2.5 } = {}) => {
    const runs = []; let run = [];
    for (let x = from; x <= to + 1e-9; x += step) {
      const y = f(x);
      if (Number.isFinite(y) && y >= -R - 0.4 && y <= R + 0.4) run.push(`${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    const id = color === INK2 ? 'ah2' : 'ah';
    return runs.map((r, i) => {
      const s = (arrows === 'both' || arrows === 'start') && i === 0 ? ` marker-start="url(#${id})"` : '';
      const e = (arrows === 'both' || arrows === 'end') && i === runs.length - 1 ? ` marker-end="url(#${id})"` : '';
      return `<polyline points="${r.join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${s}${e}/>`;
    }).join('');
  };
  /** Straight pieces through the given points (no arrows unless asked). */
  const path = (pts, { color = INK, arrows = 'none', width = 2.5 } = {}) => {
    const id = color === INK2 ? 'ah2' : 'ah';
    const s = arrows === 'both' || arrows === 'start' ? ` marker-start="url(#${id})"` : '';
    const e = arrows === 'both' || arrows === 'end' ? ` marker-end="url(#${id})"` : '';
    return `<polyline points="${pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${s}${e}/>`;
  };
  /** A closed (filled) or open (hollow) point. */
  const dot = (x, y, { open = false, color = INK, r = 4 } = {}) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="${open ? '#fff' : color}" stroke="${color}" stroke-width="2"/>`;
  const label = (x, y, text, { color = INK, dx = 6, dy = -6, size = 13, italic = true } = {}) => `<text x="${X(x) + dx}" y="${Y(y) + dy}" font-size="${size}"${italic ? ' font-style="italic"' : ''} fill="${color}">${text}</text>`;
  /** A whole line y = mx + b across the window, clipped so its arrows stay inside. */
  const line = (m, b, opts = {}) => {
    const ends = [];
    const at = (x) => [x, m * x + b];
    const lo = at(-R); const hi = at(R);
    for (const [x, y] of [lo, hi]) {
      if (Math.abs(y) <= R) { ends.push([x, y]); continue; }
      const yy = y > R ? R : -R; ends.push([(yy - b) / m, yy]);
    }
    return path(ends, { arrows: 'both', ...opts });
  };
  return { svg, X, Y, R, curve, path, dot, label, line };
}

/** A monomial: mono(8, [['a', 4], ['b', 3]]) → 8a⁴b³ (an exponent of 0 drops the variable). */
function mono(c, vs) {
  let s = '';
  for (const [v, e] of vs) { if (e !== 0) s += e === 1 ? v : `${v}${sup(num(e))}`; }
  if (!s) return num(c);
  return `${c === 1 ? '' : c === -1 ? M : num(c)}${s}`;
}
/** A polynomial from [[coefficient, exponent], …] IN THE ORDER GIVEN. */
function poly(terms, v = 'x') {
  let s = '';
  for (const [c, e] of terms) { const body = mono(Math.abs(c), [[v, e]]); s += s ? ` ${sgn(c)} ${body}` : `${c < 0 ? M : ''}${body}`; }
  return s;
}

/**
 * A graph of three straight pieces with whole-number slopes: two ends, two turning points, nothing
 * on the origin, four different heights (so the highest and the lowest point are each one point).
 * `hi` / `lo` are the highest and lowest of the four points — either may be an end.
 */
function zig(rand) {
  for (;;) {
    const up = rand() < 0.5;
    const xs = [int(rand, -9, -5)];
    for (let i = 0; i < 3; i++) xs.push(xs[i] + int(rand, 3, 6));
    if (xs[3] > 9 || xs[3] <= 0 || xs.includes(0)) continue;
    const ys = [int(rand, -6, 6)];
    for (let i = 0; i < 3; i++) ys.push(ys[i] + ((i % 2 === 0) === up ? 1 : -1) * pick(rand, [1, 1, 2]) * (xs[i + 1] - xs[i]));
    if (ys.some((y) => Math.abs(y) > 8) || new Set(ys).size < 4) continue;
    const f = (x) => { for (let i = 0; i < 3; i++) if (x >= xs[i] && x <= xs[i + 1]) return ys[i] + ((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])) * (x - xs[i]); return NaN; };
    if (f(0) === 0) continue;
    const pts = xs.map((x, i) => [x, ys[i]]);
    const hi = pts.reduce((a, b) => (b[1] > a[1] ? b : a)); const lo = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
    return { up, xs, ys, pts, f, hi, lo };
  }
}
/** Draw a zig. `open` marks an end as an open circle: [left, right]. */
function zigFig(z, { name = 'f', open = [false, false] } = {}) {
  const P = plane(10);
  const [ex, ey] = z.pts[3];
  return P.svg(`${P.path(z.pts)}${P.dot(...z.pts[0], { open: open[0] })}${P.dot(ex, ey, { open: open[1] })}${P.label(ex, ey, name, { dx: -14, dy: ey > 6 ? 18 : -8 })}`, `graph of ${name}(x)`);
}

// ---------------------------------------------------------------- a matrix (SVG)

/** A bracketed matrix from rows of numbers, optionally named: matrix([[2, 3], [1, 0]], 'A'). */
function matrix(rows, name, tail = '') {
  const cw = 34; const rh = 26; const n = rows.length; const m = rows[0].length;
  const x0 = name ? 44 : 10; const w = m * cw; const h = n * rh; const top = 8;
  const cells = rows.map((r, i) => r.map((v, j) => `<text x="${x0 + 8 + j * cw + cw / 2}" y="${top + i * rh + 18}" font-size="16" text-anchor="middle" fill="#14212a">${typeof v === 'number' ? num(v) : v}</text>`).join('')).join('');
  const br = (x, d) => `<path d="M${x + d * 7},${top} H${x} V${top + h} H${x + d * 7}" fill="none" stroke="#14212a" stroke-width="2"/>`;
  const nm = name ? `<text x="4" y="${top + h / 2 + 6}" font-size="17" font-style="italic" fill="#14212a">${name} =</text>` : '';
  const tl = tail ? `<text x="${x0 + w + 22}" y="${top + 12}" font-size="13" fill="#14212a">${tail}</text>` : '';
  const W = x0 + w + 16 + (tail ? 30 : 8);
  return `<svg viewBox="0 0 ${W} ${h + 16}" width="${Math.min(300, W * 1.6)}" role="img" aria-label="matrix${name ? ` ${name}` : ''}">${nm}${br(x0, 1)}${br(x0 + w + 16, -1)}${cells}${tl}</svg>`;
}

// ---------------------------------------------------------------- a table of values (SVG)

/** A two-row table the way the packets print one: table('x', [1, 2, 3], 'y', [2, 4, 8]). */
function table(top, xs, bottom, ys) {
  const lw = Math.max(34, 12 + 9 * Math.max(String(top).length, String(bottom).length)); const cw = 40; const rh = 28; const n = xs.length;
  const W = lw + n * cw; const H = 2 * rh;
  let g = `<rect x="1" y="1" width="${W}" height="${H}" fill="#fff" stroke="#14212a" stroke-width="1.6"/><rect x="1" y="1" width="${lw}" height="${H}" fill="#eef2f4"/><line x1="1" y1="${rh + 1}" x2="${W + 1}" y2="${rh + 1}" stroke="#14212a" stroke-width="1.2"/>`;
  for (let i = 0; i <= n; i++) g += `<line x1="${lw + i * cw + 1}" y1="1" x2="${lw + i * cw + 1}" y2="${H + 1}" stroke="#14212a" stroke-width="1"/>`;
  const cell = (x, y, t, it) => `<text x="${x}" y="${y}" font-size="15" text-anchor="middle"${it ? ' font-style="italic"' : ''} fill="#14212a">${t}</text>`;
  g += cell(lw / 2 + 1, 20, top, true) + cell(lw / 2 + 1, rh + 20, bottom, true);
  xs.forEach((v, i) => { g += cell(lw + i * cw + cw / 2 + 1, 20, typeof v === 'number' ? num(v) : v) + cell(lw + i * cw + cw / 2 + 1, rh + 20, typeof ys[i] === 'number' ? num(ys[i]) : ys[i]); });
  return `<svg viewBox="0 0 ${W + 2} ${H + 2}" width="${Math.min(320, (W + 2) * 1.25)}" role="img" aria-label="table of values">${g}</svg>`;
}

module.exports = { table, mono, poly, zig, zigFig, sup, sub, nz, sgn, term, par, co, lin, eqn, sys, pt, quad, vertexForm, fr, money, commas, plane, matrix, INK, INK2 };
