/**
 * ACT CHARTS — the figures a question is ANSWERED from.
 *
 * utils/actFigures.js labels a figure with numbers the stem already states.
 * These are the other kind, the one the real ACT leans on: a line on a grid
 * whose slope you read by counting, a box plot whose quartiles you read off
 * the scale, a bar chart you total, a parabola whose zeros you see. The data
 * lives in the figure; the stem only asks.
 *
 * That puts a burden on the alt text: a student using a screen reader has to
 * be able to answer from it, so every builder's `alt` states the data in full
 * (points, quartiles, bar heights), not just what kind of picture it is.
 * tests/unit/actVisualItems.test.js re-solves every item FROM THAT ALT, which
 * checks the key and the description in one pass.
 *
 * Same conventions as actFigures: white ground, plain <text>, small.
 *
 * @module utils/actCharts
 */

const {
  svgDoc, text, line, poly, dot, esc, num, r1, W, INK, SOFT, FILL,
} = require('./actFigures')._internal;

const GRID = '#dcdcdc';
const fmt = (n) => num(Math.round(n * 1000) / 1000);

// ── Coordinate plane (both axes through the origin) ─────────────────────────

/**
 * A square grid from -lim..lim, with tick labels every `step`.
 * Returns the mapping plus the SVG for the grid; callers add their marks.
 */
function plane(lim, { size = 200, step } = {}) {
  const ox = (W - size) / 2, oy = 14;
  const sx = (x) => ox + ((x + lim) / (2 * lim)) * size;
  const sy = (y) => oy + ((lim - y) / (2 * lim)) * size;
  const st = step || (lim <= 6 ? 2 : lim <= 15 ? 5 : 10);
  let body = '';
  for (let k = -lim; k <= lim; k++) {
    if (k === 0) continue;
    body += line([sx(k), sy(-lim)], [sx(k), sy(lim)], { width: 0.5, color: GRID });
    body += line([sx(-lim), sy(k)], [sx(lim), sy(k)], { width: 0.5, color: GRID });
  }
  body += line([sx(-lim), sy(0)], [sx(lim), sy(0)], { width: 1.4 }) + line([sx(0), sy(-lim)], [sx(0), sy(lim)], { width: 1.4 });
  for (let k = -lim + st; k < lim; k += st) {
    if (k === 0) continue;
    body += text(sx(k), sy(0) + 9, num(k), { size: 9, color: SOFT });
    body += text(sx(0) - 6, sy(k), num(k), { size: 9, color: SOFT, anchor: 'end' });
  }
  body += text(sx(lim) - 4, sy(0) - 8, 'x', { italic: true, size: 12 }) + text(sx(0) + 9, sy(lim) + 6, 'y', { italic: true, size: 12 });
  const clipId = `c${Math.abs(hash(String(lim) + body.length))}`;
  const clip = `<clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${size}" height="${size}"/></clipPath>`;
  return { sx, sy, body, height: size + 2 * oy, clip, clipId, lim };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Polyline of a function, sampled across the window and clipped to it. */
function curve(P, fn, { from = -P.lim, to = P.lim, samples = 160, width = 1.9, id = '' } = {}) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const x = from + ((to - from) * i) / samples;
    const y = fn(x);
    if (Number.isFinite(y) && Math.abs(y) < P.lim * 4) pts.push(`${r1(P.sx(x))},${r1(P.sy(y))}`);
  }
  const cid = `${P.clipId}${id}`;
  return `<clipPath id="${cid}"><rect x="${r1(P.sx(-P.lim))}" y="${r1(P.sy(P.lim))}" width="${r1(P.sx(P.lim) - P.sx(-P.lim))}" height="${r1(P.sy(-P.lim) - P.sy(P.lim))}"/></clipPath>`
    + `<g clip-path="url(#${cid})"><polyline points="${pts.join(' ')}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linejoin="round"/></g>`;
}

const B = {};

/** A line on the grid, through two lattice points (drawn as dots, unlabelled). */
B.lineOnGrid = ({ m, b, x1, x2, lim = 6, labelPoints = false }) => {
  const P = plane(lim);
  let body = P.body + curve(P, (x) => m * x + b);
  const pts = [[x1, m * x1 + b], [x2, m * x2 + b]];
  pts.forEach(([x, y]) => {
    body += dot([P.sx(x), P.sy(y)]);
    if (labelPoints) body += text(P.sx(x) + 6, P.sy(y) - 9, `(${num(x)}, ${num(y)})`, { size: 10, anchor: 'start' });
  });
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim} on each axis, one unit per square. A line is graphed through the marked lattice points (${fmt(pts[0][0])}, ${fmt(pts[0][1])}) and (${fmt(pts[1][0])}, ${fmt(pts[1][1])}).`,
  };
};

/** Two lines on the grid crossing at a lattice point. */
B.twoLines = ({ lines, lim = 6 }) => {
  const P = plane(lim);
  let body = P.body;
  lines.forEach(([m, b], i) => { body += curve(P, (x) => m * x + b, { id: `l${i}`, width: 1.8 }); });
  const [[m1, b1], [m2, b2]] = lines;
  const x = (b2 - b1) / (m1 - m2), y = m1 * x + b1;
  // Describe each line by the outermost two lattice points it passes through
  // inside the window: enough to recover it exactly.
  const name = (m, b) => {
    const xs = [];
    for (let t = -lim; t <= lim; t++) if (Number.isInteger(m * t + b) && Math.abs(m * t + b) <= lim) xs.push(t);
    const a = xs[0], c = xs[xs.length - 1];
    return `(${a}, ${m * a + b}) and (${c}, ${m * c + b})`;
  };
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim}, one unit per square. Two lines are graphed: one through ${name(m1, b1)}, the other through ${name(m2, b2)}. They cross at one point.`,
    crossing: [x, y],
  };
};

/** A parabola y = a(x - p)(x - q), with integer zeros and vertex marked by the grid. */
B.parabola = ({ a, p, q, lim = 8, step = 2 }) => {
  const P = plane(lim, { step });
  const f = (x) => a * (x - p) * (x - q);
  const h = (p + q) / 2, k = f(h);
  let body = P.body + curve(P, f, { width: 2 });
  body += dot([P.sx(p), P.sy(0)], 3) + dot([P.sx(q), P.sy(0)], 3) + dot([P.sx(h), P.sy(k)], 3);
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim}, one unit per square. A parabola opening ${a > 0 ? 'upward' : 'downward'} crosses the x-axis at (${fmt(p)}, 0) and (${fmt(q)}, 0) and has its vertex at (${fmt(h)}, ${fmt(k)}); it crosses the y-axis at (0, ${fmt(f(0))}).`,
  };
};

/** y = A sin(Bx) or A cos(Bx) over one or two periods, x in multiples of π. */
B.trigGraph = ({ fn, A, Bk }) => {
  // x-axis runs 0..2π; ticks at π/2 steps.
  const xMax = 2 * Math.PI;
  const size = 220, hgt = 130, ox = 26, oy = 14;
  const yLim = Math.max(A, 1) + 1;
  const sx = (x) => ox + (x / xMax) * size;
  const sy = (y) => oy + ((yLim - y) / (2 * yLim)) * hgt;
  let body = '';
  for (let k = -yLim; k <= yLim; k++) body += line([sx(0), sy(k)], [sx(xMax), sy(k)], { width: 0.5, color: GRID });
  for (let i = 1; i <= 4; i++) body += line([sx((i * Math.PI) / 2), sy(-yLim)], [sx((i * Math.PI) / 2), sy(yLim)], { width: 0.5, color: GRID });
  body += line([sx(0), sy(0)], [sx(xMax), sy(0)], { width: 1.4 }) + line([sx(0), sy(-yLim)], [sx(0), sy(yLim)], { width: 1.4 });
  ['π/2', 'π', '3π/2', '2π'].forEach((l, i) => { body += text(sx(((i + 1) * Math.PI) / 2), sy(0) + 10, l, { size: 9, color: SOFT }); });
  for (let k = -yLim + 1; k < yLim; k++) if (k) body += text(sx(0) - 5, sy(k), num(k), { size: 9, color: SOFT, anchor: 'end' });
  const g = fn === 'sin' ? (x) => A * Math.sin(Bk * x) : (x) => A * Math.cos(Bk * x);
  const pts = [];
  for (let i = 0; i <= 240; i++) { const x = (xMax * i) / 240; pts.push(`${r1(sx(x))},${r1(sy(g(x)))}`); }
  body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${INK}" stroke-width="1.9"/>`;
  body += text(sx(xMax) + 2, sy(0) - 8, 'x', { italic: true, size: 12 }) + text(sx(0) + 8, sy(yLim) + 4, 'y', { italic: true, size: 12 });
  const periodWords = { 1: '2π', 2: 'π', 4: 'π/2' }[Bk];
  return {
    svg: svgDoc(hgt + 2 * oy + 8, body),
    alt: `Graph of a ${fn === 'sin' ? 'sine' : 'cosine'}-shaped wave for x from 0 to 2π, with gridlines every π/2 and every 1 unit. The curve ${fn === 'sin' ? 'starts at (0, 0)' : `starts at its maximum, (0, ${A})`}, has maximum ${A} and minimum −${A}, and repeats every ${periodWords}.`,
  };
};

/** y = a·b^x through (0, a) and (1, ab), first quadrant emphasis. */
B.exponential = ({ a, b, lim = 8 }) => {
  const P = plane(lim, { step: 2 });
  let body = P.body + curve(P, (x) => a * b ** x, { width: 2 });
  body += dot([P.sx(0), P.sy(a)], 3) + dot([P.sx(1), P.sy(a * b)], 3);
  body += text(P.sx(0) - 6, P.sy(a) - 8, `(0, ${fmt(a)})`, { size: 10, anchor: 'end' });
  // Right of the point and level with it, clear of the curve rising past it.
  body += text(P.sx(1) + 9, P.sy(a * b) + (b > 1 ? 4 : -9), `(1, ${fmt(a * b)})`, { size: 10, anchor: 'start' });
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim}. An exponential curve is graphed through the labeled points (0, ${fmt(a)}) and (1, ${fmt(a * b)}); it ${b > 1 ? 'rises' : 'falls'} from left to right and stays above the x-axis.`,
  };
};

// ── Charts with a first-quadrant frame ─────────────────────────────────────

/** Axes from (0,0) with labelled ticks; returns mappings. */
function frame({ xMin = 0, xMax, xStep, yMin = 0, yMax, yStep, xLabel, yLabel, w = 190, h = 140, xTicks }) {
  const ox = 48, oy = 12;
  const sx = (x) => ox + ((x - xMin) / (xMax - xMin)) * w;
  const sy = (y) => oy + ((yMax - y) / (yMax - yMin)) * h;
  let body = '';
  for (let y = yMin; y <= yMax + 1e-9; y += yStep) {
    body += line([sx(xMin), sy(y)], [sx(xMax), sy(y)], { width: 0.5, color: GRID });
    body += text(sx(xMin) - 5, sy(y), fmt(y), { size: 9.5, color: SOFT, anchor: 'end' });
  }
  if (xTicks !== false) {
    for (let x = xMin; x <= xMax + 1e-9; x += xStep) {
      body += line([sx(x), sy(yMin)], [sx(x), sy(yMin) + 3], { width: 1 });
      body += text(sx(x), sy(yMin) + 11, fmt(x), { size: 9.5, color: SOFT });
    }
  }
  body += line([sx(xMin), sy(yMin)], [sx(xMax), sy(yMin)], { width: 1.4 }) + line([sx(xMin), sy(yMin)], [sx(xMin), sy(yMax)], { width: 1.4 });
  if (xLabel) body += text(ox + w / 2, oy + h + 27, xLabel, { size: 10.5 });
  if (yLabel) body += `<text x="13" y="${r1(oy + h / 2)}" font-size="10.5" text-anchor="middle" dominant-baseline="middle" fill="${INK}" transform="rotate(-90 13 ${r1(oy + h / 2)})">${esc(yLabel)}</text>`;
  return { sx, sy, body, height: oy + h + (xLabel ? 36 : 22) };
}

/** Scatterplot with a drawn line of best fit. */
B.scatterWithFit = ({ points, m, b, xMax, yMax, xStep, yStep, xLabel, yLabel }) => {
  const F = frame({ xMax, xStep, yMax, yStep, xLabel, yLabel });
  let body = F.body;
  points.forEach(([x, y]) => { body += `<circle cx="${r1(F.sx(x))}" cy="${r1(F.sy(y))}" r="2.8" fill="${INK}"/>`; });
  // The fit line runs the full width and is clipped to the plotting area.
  const cid = `f${Math.abs(hash(`${m}_${b}_${xMax}_${yMax}`))}`;
  body += `<clipPath id="${cid}"><rect x="${r1(F.sx(0))}" y="${r1(F.sy(yMax))}" width="${r1(F.sx(xMax) - F.sx(0))}" height="${r1(F.sy(0) - F.sy(yMax))}"/></clipPath>`
    + `<g clip-path="url(#${cid})">${line([F.sx(0), F.sy(b)], [F.sx(xMax), F.sy(m * xMax + b)], { width: 1.6, dash: '6 4' })}</g>`;
  return {
    svg: svgDoc(F.height, body),
    alt: `Scatterplot of ${yLabel.toLowerCase()} against ${xLabel.toLowerCase()} with ${points.length} points and a dashed line of best fit. The line passes through (0, ${fmt(b)}) and (${fmt(xMax / 2)}, ${fmt(m * (xMax / 2) + b)}); the x-axis runs 0 to ${xMax} and the y-axis 0 to ${yMax}.`,
  };
};

/** Horizontal box plot on a number line. */
B.boxPlot = ({ five, lo, hi, step, label }) => {
  const [mn, q1, med, q3, mx] = five;
  const ox = 22, w = W - 44, yMid = 46;
  const sx = (x) => ox + ((x - lo) / (hi - lo)) * w;
  let body = line([sx(lo), 84], [sx(hi), 84], { width: 1.4 });
  for (let x = lo; x <= hi + 1e-9; x += step) {
    body += line([sx(x), 84], [sx(x), 89], { width: 1 }) + text(sx(x), 98, fmt(x), { size: 9.5, color: SOFT });
    // An unlabeled tick halfway, so a value between labels (45 on a scale
    // labeled 40, 50) can still be read off the line exactly.
    if (step % 2 === 0 && x + step / 2 < hi) body += line([sx(x + step / 2), 84], [sx(x + step / 2), 87.5], { width: 0.9 });
  }
  body += line([sx(mn), yMid], [sx(q1), yMid]) + line([sx(q3), yMid], [sx(mx), yMid]);
  body += line([sx(mn), yMid - 9], [sx(mn), yMid + 9]) + line([sx(mx), yMid - 9], [sx(mx), yMid + 9]);
  body += `<rect x="${r1(sx(q1))}" y="${yMid - 18}" width="${r1(sx(q3) - sx(q1))}" height="36" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>`;
  body += line([sx(med), yMid - 18], [sx(med), yMid + 18], { width: 2 });
  body += text(W / 2, 116, label, { size: 10.5 });
  return {
    svg: svgDoc(126, body),
    alt: `Box plot of ${label.toLowerCase()} on a scale from ${lo} to ${hi} labeled every ${step}${step % 2 === 0 ? ` with a tick every ${step / 2}` : ''}. Minimum ${mn}, first quartile ${q1}, median ${med}, third quartile ${q3}, maximum ${mx}.`,
  };
};

/** Vertical bar chart. */
B.barChart = ({ cats, values, yMax, yStep, xLabel, yLabel }) => {
  const F = frame({ xMin: 0, xMax: cats.length, xStep: 1, yMax, yStep, xLabel, yLabel, xTicks: false });
  let body = F.body;
  const bw = (F.sx(1) - F.sx(0)) * 0.62;
  cats.forEach((c, i) => {
    const cx = F.sx(i + 0.5);
    body += `<rect x="${r1(cx - bw / 2)}" y="${r1(F.sy(values[i]))}" width="${r1(bw)}" height="${r1(F.sy(0) - F.sy(values[i]))}" fill="${FILL}" stroke="${INK}" stroke-width="1.3"/>`;
    body += text(cx, F.sy(0) + 11, c, { size: 9.5 });
  });
  return {
    svg: svgDoc(F.height, body),
    alt: `Bar graph of ${yLabel.toLowerCase()} by ${xLabel.toLowerCase()}, scale marked every ${yStep}. ${cats.map((c, i) => `${c}: ${values[i]}`).join('; ')}.`,
  };
};

/** Piecewise-linear line graph (e.g. distance over time). */
B.lineChart = ({ points, xMax, xStep, yMax, yStep, xLabel, yLabel }) => {
  const F = frame({ xMax, xStep, yMax, yStep, xLabel, yLabel });
  let body = F.body;
  body += `<polyline points="${points.map(([x, y]) => `${r1(F.sx(x))},${r1(F.sy(y))}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>`;
  points.forEach(([x, y]) => { body += `<circle cx="${r1(F.sx(x))}" cy="${r1(F.sy(y))}" r="2.6" fill="${INK}"/>`; });
  return {
    svg: svgDoc(F.height, body),
    alt: `Line graph of ${yLabel.toLowerCase()} against ${xLabel.toLowerCase()}, made of straight segments joining the points ${points.map(([x, y]) => `(${fmt(x)}, ${fmt(y)})`).join(', ')}.`,
  };
};

/** Pie chart with percent labels. */
B.pieChart = ({ slices, title }) => {
  const c = [W / 2 - 40, 78], R = 60;
  let a = -Math.PI / 2;
  let body = '';
  const shades = ['#ece8fb', '#d6cdf5', '#bfb1ee', '#f6f4fd', '#e3dcf8'];
  slices.forEach(([, pct], i) => {
    const a2 = a + (pct / 100) * 2 * Math.PI;
    const p = (t) => [c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)];
    const large = pct > 50 ? 1 : 0;
    body += `<path d="M ${c[0]} ${c[1]} L ${r1(p(a)[0])} ${r1(p(a)[1])} A ${R} ${R} 0 ${large} 1 ${r1(p(a2)[0])} ${r1(p(a2)[1])} Z" fill="${shades[i % shades.length]}" stroke="${INK}" stroke-width="1.2"/>`;
    const mid = (a + a2) / 2;
    body += text(c[0] + R * 0.62 * Math.cos(mid), c[1] + R * 0.62 * Math.sin(mid), `${pct}%`, { size: 10.5 });
    a = a2;
  });
  slices.forEach(([label], i) => {
    const y = 30 + i * 18;
    body += `<rect x="${W - 92}" y="${y - 6}" width="11" height="11" fill="${shades[i % shades.length]}" stroke="${INK}" stroke-width="1"/>`;
    body += text(W - 76, y, label, { size: 10.5, anchor: 'start' });
  });
  return {
    svg: svgDoc(156, body),
    alt: `Circle graph${title ? ` of ${title}` : ''}: ${slices.map(([l, p]) => `${l} ${p}%`).join(', ')}.`,
  };
};

/** Number line with an inequality's ray (or a segment for a compound). */
B.numberLine = ({ lo, hi, a, aClosed, dir, b, bClosed }) => {
  const ox = 20, w = W - 40, y = 40;
  const sx = (x) => ox + ((x - lo) / (hi - lo)) * w;
  let body = line([sx(lo) - 8, y], [sx(hi) + 8, y], { width: 1.4 });
  body += `<polyline points="${r1(sx(lo) - 2)},${y - 5} ${r1(sx(lo) - 8)},${y} ${r1(sx(lo) - 2)},${y + 5}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
  body += `<polyline points="${r1(sx(hi) + 2)},${y - 5} ${r1(sx(hi) + 8)},${y} ${r1(sx(hi) + 2)},${y + 5}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
  for (let x = lo; x <= hi; x++) body += line([sx(x), y - 4], [sx(x), y + 4], { width: 1 }) + text(sx(x), y + 15, num(x), { size: 9.5, color: SOFT });
  const end = (x, closed) => `<circle cx="${r1(sx(x))}" cy="${y}" r="4.5" fill="${closed ? INK : '#ffffff'}" stroke="${INK}" stroke-width="1.6"/>`;
  let words;
  if (b == null) {
    const to = dir === 'right' ? hi + 0.6 : lo - 0.6;
    body += line([sx(a), y], [sx(to), y], { width: 4 }) + end(a, aClosed);
    words = `a ${aClosed ? 'closed (filled)' : 'open'} circle at ${a} with the ray shaded to the ${dir}`;
  } else {
    body += line([sx(a), y], [sx(b), y], { width: 4 }) + end(a, aClosed) + end(b, bClosed);
    words = `the segment between ${a} and ${b} shaded, with a${aClosed ? ' closed' : 'n open'} circle at ${a} and a${bClosed ? ' closed' : 'n open'} circle at ${b}`;
  }
  return { svg: svgDoc(66, body), alt: `Number line from ${lo} to ${hi} with ${words}.` };
};

/**
 * Composite figure: a rectangle W×H with a right triangle or a semicircle on
 * top, or an L-shape (a W×H rectangle with a w×h corner notch removed).
 */
B.composite = ({ kind, Wd, H, extra, notchW, notchH }) => {
  const scale = Math.min(170 / Wd, 110 / (H + (kind === 'house' ? extra : kind === 'semi' ? Wd / 2 : 0)));
  const x0 = (W - Wd * scale) / 2;
  const topExtra = kind === 'house' ? extra * scale : kind === 'semi' ? (Wd / 2) * scale : 0;
  const y0 = 20 + topExtra;
  const X = (x) => x0 + x * scale, Y = (y) => y0 + (H - y) * scale;
  let body = '';
  let alt;
  if (kind === 'L') {
    const pts = [[0, 0], [Wd, 0], [Wd, H - notchH], [Wd - notchW, H - notchH], [Wd - notchW, H], [0, H]].map(([x, y]) => [X(x), Y(y)]);
    body += poly(pts, { fill: FILL });
    body += text((X(0) + X(Wd)) / 2, Y(0) + 13, Wd) + text(X(0) - 8, (Y(0) + Y(H)) / 2, H, { anchor: 'end' });
    body += text((X(0) + X(Wd - notchW)) / 2, Y(H) - 9, Wd - notchW) + text(X(Wd) + 8, (Y(0) + Y(H - notchH)) / 2, H - notchH, { anchor: 'start' });
    alt = `An L-shaped figure with all right angles. The bottom edge is ${Wd} and the left edge is ${H}. The top edge is ${Wd - notchW} and the right edge is ${H - notchH}; a ${notchW} by ${notchH} rectangle is missing from the upper-right corner. The two unlabeled edges of the notch are not marked.`;
  } else {
    body += poly([[X(0), Y(0)], [X(Wd), Y(0)], [X(Wd), Y(H)], [X(0), Y(H)]], { fill: FILL });
    body += text((X(0) + X(Wd)) / 2, Y(0) + 13, Wd) + text(X(0) - 8, (Y(0) + Y(H)) / 2, H, { anchor: 'end' });
    if (kind === 'house') {
      const apex = [X(Wd / 2), Y(H) - extra * scale];
      body += poly([[X(0), Y(H)], [X(Wd), Y(H)], apex], { fill: '#dcd5f6' });
      body += line(apex, [apex[0], Y(H)], { dash: '4 3', width: 1.1 }) + text(apex[0] + 6, (apex[1] + Y(H)) / 2, extra, { anchor: 'start' });
      alt = `A rectangle ${Wd} wide and ${H} tall with an isosceles triangle on top. The triangle's base is the rectangle's top edge, and a dashed segment from its apex to that edge, marked ${extra}, is its height.`;
    } else {
      const r = Wd / 2;
      body += `<path d="M ${r1(X(0))} ${r1(Y(H))} A ${r1(r * scale)} ${r1(r * scale)} 0 0 1 ${r1(X(Wd))} ${r1(Y(H))} Z" fill="#dcd5f6" stroke="${INK}" stroke-width="1.6"/>`;
      alt = `A rectangle ${Wd} wide and ${H} tall with a semicircle on top whose diameter is the rectangle's top edge.`;
    }
  }
  return { svg: svgDoc(Y(0) + 26, body), alt };
};

/** Two parallel lines and a transversal with algebraic angle labels. */
B.parallelExpressions = ({ e1, e2, relation, deg1 }) => {
  // Reuse the drawing in actFigures, then swap the two labels for expressions.
  const { parallelLines } = require('./actFigures');
  const rel = relation === 'equal' ? 'alternate interior' : 'co-interior';
  const fig = parallelLines({ given: deg1, relation: rel, labelAt: 42, halo: true, gap: 124 });
  const svg = fig.svg.replace(`>${deg1}°<`, `>${esc(e1)}<`).replace('>x°<', `>${esc(e2)}<`);
  const where = relation === 'equal' ? 'alternate interior angles (on opposite sides of the transversal, between the parallel lines)' : 'same-side interior angles (on the same side of the transversal, between the parallel lines)';
  return { svg, alt: `Two parallel lines cut by a transversal. The angles labeled ${e1} and ${e2} are ${where}.` };
};

/** A vector on the grid from a tail point to a head point (arrowhead at the head). */
B.vectorOnGrid = ({ tail, head, lim = 6 }) => {
  const P = plane(lim);
  const t = [P.sx(tail[0]), P.sy(tail[1])], h = [P.sx(head[0]), P.sy(head[1])];
  const ang = Math.atan2(h[1] - t[1], h[0] - t[0]);
  const ah = (s) => [h[0] - 10 * Math.cos(ang + s), h[1] - 10 * Math.sin(ang + s)];
  let body = P.body + line(t, h, { width: 2 }) + dot(t, 3);
  body += `<polygon points="${r1(h[0])},${r1(h[1])} ${r1(ah(0.4)[0])},${r1(ah(0.4)[1])} ${r1(ah(-0.4)[0])},${r1(ah(-0.4)[1])}" fill="${INK}"/>`;
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim}, one unit per square. A vector is drawn from its tail at (${tail[0]}, ${tail[1]}) to its head, marked with an arrow, at (${head[0]}, ${head[1]}).`,
  };
};

/** A polygon on the grid with lettered vertices. */
B.polygonOnGrid = ({ vertices, names, lim = 6 }) => {
  const P = plane(lim);
  const pts = vertices.map(([x, y]) => [P.sx(x), P.sy(y)]);
  let body = P.body + poly(pts, { fill: 'rgba(118,75,162,0.12)', width: 1.8 });
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  pts.forEach((p, i) => {
    body += dot(p, 2.8);
    const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1;
    body += `<text x="${r1(p[0] + (dx / L) * 11)}" y="${r1(p[1] + (dy / L) * 11)}" font-size="11.5" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${names[i]}</text>`;
  });
  return {
    svg: svgDoc(P.height, body),
    alt: `Coordinate grid from ${-lim} to ${lim}, one unit per square, with ${names.length === 3 ? 'triangle' : 'quadrilateral'} ${names.join('')} drawn: ${names.map((n, i) => `${n}(${vertices[i][0]}, ${vertices[i][1]})`).join(', ')}.`,
  };
};

/** One unlabelled-coordinate point on the grid, named (e.g. P), with optional axis names. */
B.pointOnGrid = ({ x, y, name, lim = 6, xName = 'x', yName = 'y' }) => {
  const P = plane(lim);
  let body = P.body.replace('>x</text>', `>${esc(xName)}</text>`).replace('>y</text>', `>${esc(yName)}</text>`);
  const p = [P.sx(x), P.sy(y)];
  body += dot(p, 3.4);
  body += `<text x="${r1(p[0] + 7)}" y="${r1(p[1] - 9)}" font-size="12" font-weight="600" text-anchor="start" dominant-baseline="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(name)}</text>`;
  return { svg: svgDoc(P.height, body), alt: `Coordinate grid from ${-lim} to ${lim} on each axis, one unit per square, with point ${name} at (${x}, ${y}).` };
};

module.exports = B;
