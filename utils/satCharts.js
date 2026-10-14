/**
 * SAT CHARTS — the SAT bank's bar graphs and scatterplots, drawn in the same
 * plain-SVG house style as the ACT figures (utils/actFigures.js,
 * utils/actCharts.js), with a written description a screen-reader user can
 * answer from.
 *
 * These used to be matplotlib renders (scripts/satFigureRenderer.py): 7-point
 * tick labels on a figure sized in points, and an auto-locator that put
 * gridlines every 2 under bars of 3, 7 and 5, so a value had to be guessed
 * between lines. The runner had no description to read either: every one of
 * the 148 SAT figures went out with the generic "Figure for this question"
 * (QA pass, 2026-10-13).
 *
 * Now a bar graph's scale is chosen so every bar ends ON a gridline; when no
 * readable step does that, each bar carries its value. A scatterplot's axes
 * fit the data (not forced to 0), are labelled at a nice step, and the line of
 * best fit is drawn across the plotting area. Figures are drawn on a 2× canvas
 * (520 wide) so labels stay legible when the runner scales them down on a
 * phone.
 *
 * Pure functions; the SAT ingest calls them through scripts/renderSatFigure.js,
 * and scripts/refreshSatFigures.js applies them to the generated bank.
 *
 * @module utils/satCharts
 */

const { esc } = require('./actFigures')._internal;

const W = 520;                 // 2× the ACT figure width
const INK = '#1f1f1f';
const SOFT = '#4b4b4b';
const GRID = '#d4d4d4';
const BAR = '#ece8fb';
const FONT = 'font-family="Helvetica, Arial, sans-serif"';

const r1 = (n) => Math.round(n * 10) / 10;
const num = (n) => {
  const v = Math.round(n * 1000) / 1000;
  return v < 0 ? `−${Math.abs(v)}` : `${v}`;
};
const plain = (n) => `${Math.round(n * 1000) / 1000}`;
// "High temperature (°C)" -> "high temperature (°C)" inside a sentence; an
// acronym ("GDP") keeps its case.
const lc = (s) => {
  const t = String(s || '');
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};

function svgDoc(h, body) {
  const H = Math.round(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>`
    + `<rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
}
function text(x, y, s, { size = 20, anchor = 'middle', color = INK, rotate } = {}) {
  const t = rotate ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : '';
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="middle" fill="${color}"${t}>${esc(s)}</text>`;
}
function line(a, b, { color = INK, width = 2, dash } = {}) {
  return `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${color}" stroke-width="${width}"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

const NICE = [1, 2, 5];
/** The smallest "nice" step (1, 2, 5 × 10ⁿ) that splits `span` into at most `maxLines` intervals. */
function niceStep(span, maxLines = 10) {
  const s = Math.max(Math.abs(span), 1e-9);
  for (let p = -3; p < 8; p++) {
    for (const m of NICE) {
      const step = m * 10 ** p;
      if (s / step <= maxLines) return step;
    }
  }
  return 10 ** 8;
}
const isMultiple = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

/**
 * The bar graph's value scale: the largest step that every value is a
 * multiple of, with 4 to 12 gridlines up to the tallest bar. When no such
 * step exists, a nice step and `labelBars` (each bar carries its value).
 */
function barScale(values) {
  const top = Math.max(...values, 0);
  const fits = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 200, 250, 500, 1000]
    .filter((s) => values.every((v) => isMultiple(v, s)))
    .filter((s) => Math.ceil(top / s) <= 12 && Math.ceil(top / s) >= 3);
  if (fits.length) {
    const step = fits[fits.length - 1];
    return { step, max: Math.ceil(top / step) * step, labelBars: false };
  }
  const step = niceStep(top, 8);
  return { step, max: Math.ceil(top / step) * step, labelBars: true };
}

/** Axes with labelled ticks over [xMin, xMax] × [yMin, yMax]. */
function frame({ xMin, xMax, xStep, yMin, yMax, yStep, xLabel, yLabel, xTicks = true, w = 400, h = 270 }) {
  const ox = 92, oy = 20;
  const sx = (x) => ox + ((x - xMin) / (xMax - xMin)) * w;
  const sy = (y) => oy + ((yMax - y) / (yMax - yMin)) * h;
  let body = '';
  for (let y = yMin; y <= yMax + 1e-9; y += yStep) {
    body += line([sx(xMin), sy(y)], [sx(xMax), sy(y)], { width: 1, color: GRID });
    body += text(sx(xMin) - 10, sy(y), num(y), { size: 19, color: SOFT, anchor: 'end' });
  }
  if (xTicks) {
    for (let x = xMin; x <= xMax + 1e-9; x += xStep) {
      body += line([sx(x), sy(yMin)], [sx(x), sy(yMax)], { width: 1, color: GRID });
      body += text(sx(x), sy(yMin) + 22, num(x), { size: 19, color: SOFT });
    }
  }
  body += line([sx(xMin), sy(yMin)], [sx(xMax), sy(yMin)], { width: 2.4 })
    + line([sx(xMin), sy(yMin)], [sx(xMin), sy(yMax)], { width: 2.4 });
  if (xLabel) body += text(ox + w / 2, oy + h + 56, xLabel, { size: 21 });
  if (yLabel) body += text(24, oy + h / 2, yLabel, { size: 21, rotate: -90 });
  return { sx, sy, body, height: oy + h + (xLabel ? 76 : 44), ox, oy, w, h };
}

/** A vertical bar graph. `labels` name the bars; `values` are their heights. */
function barChart({ labels, values, xlabel, ylabel }) {
  const { step, max, labelBars } = barScale(values);
  const F = frame({ xMin: 0, xMax: labels.length, xStep: 1, yMin: 0, yMax: max, yStep: step, xLabel: xlabel, yLabel: ylabel, xTicks: false });
  let body = F.body;
  const bw = (F.sx(1) - F.sx(0)) * 0.6;
  labels.forEach((c, i) => {
    const cx = F.sx(i + 0.5);
    const top = F.sy(values[i]);
    body += `<rect x="${r1(cx - bw / 2)}" y="${r1(top)}" width="${r1(bw)}" height="${r1(F.sy(0) - top)}" fill="${BAR}" stroke="${INK}" stroke-width="2"/>`;
    body += text(cx, F.sy(0) + 22, c, { size: 19 });
    if (labelBars) body += text(cx, top - 14, plain(values[i]), { size: 18 });
  });
  const by = xlabel ? ` by ${lc(xlabel)}` : '';
  return {
    svg: svgDoc(F.height, body),
    alt: `Bar graph of ${lc(ylabel || 'value')}${by}. The vertical scale runs from 0 to ${max}, marked every ${step}. `
      + `${labels.map((c, i) => `${c}: ${plain(values[i])}`).join('; ')}.`,
  };
}

/** Axis bounds that hold [lo, hi] with a little room, on a nice step. */
function axisFor(lo, hi, maxLines = 10) {
  const step = niceStep(hi - Math.min(lo, hi), maxLines);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (min === lo && min !== 0 && lo > 0) min -= step;   // room below the lowest point
  if (max === hi) max += step;                           // room above the highest point
  if (lo >= 0 && min < 0) min = 0;
  if (lo >= 0 && min > 0 && min <= 2 * step) min = 0;    // start at 0 when it costs little
  return { min, max, step: niceStep(max - min, maxLines) };
}

/** A scatterplot, with an optional line of best fit { slope, yint }. */
function scatterPlot({ pts, xlabel, ylabel, line: fit }) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const X = axisFor(Math.min(...xs), Math.max(...xs), 12);
  const Y = axisFor(Math.min(...ys), Math.max(...ys), 8);
  const F = frame({ xMin: X.min, xMax: X.max, xStep: X.step, yMin: Y.min, yMax: Y.max, yStep: Y.step, xLabel: xlabel, yLabel: ylabel });
  let body = F.body;
  if (fit) {
    const m = Number(fit.slope) || 0, b = Number(fit.yint) || 0;
    const cid = `sat-fit-${Math.abs(Math.round(m * 1000))}-${Math.abs(Math.round(b * 1000))}`;
    body += `<clipPath id="${cid}"><rect x="${r1(F.ox)}" y="${r1(F.oy)}" width="${r1(F.w)}" height="${r1(F.h)}"/></clipPath>`
      + `<g clip-path="url(#${cid})">${line([F.sx(X.min), F.sy(m * X.min + b)], [F.sx(X.max), F.sy(m * X.max + b)], { width: 2.6, color: INK, dash: '12 7' })}</g>`;
  }
  pts.forEach(([x, y]) => { body += `<circle cx="${r1(F.sx(x))}" cy="${r1(F.sy(y))}" r="5.5" fill="${INK}"/>`; });
  const yl = lc(ylabel || 'y');
  const xl = lc(xlabel || 'x');
  let fitWords = '';
  if (fit) {
    const m = Number(fit.slope) || 0, b = Number(fit.yint) || 0;
    const a = X.min, z = X.max;
    fitWords = ` A dashed line of best fit runs from (${plain(a)}, ${plain(m * a + b)}) to (${plain(z)}, ${plain(m * z + b)}).`;
  }
  return {
    svg: svgDoc(F.height, body),
    alt: `Scatterplot of ${yl} against ${xl}. The horizontal axis runs from ${plain(X.min)} to ${plain(X.max)}, marked every ${plain(X.step)}; `
      + `the vertical axis runs from ${plain(Y.min)} to ${plain(Y.max)}, marked every ${plain(Y.step)}. `
      + `${pts.length} points: ${pts.map(([x, y]) => `(${plain(x)}, ${plain(y)})`).join(', ')}.${fitWords}`,
  };
}

// ── Graphs in the xy-plane (fgraph, region) ────────────────────────────────

let mathjs = null;
/** f(x) from an authored expression (python syntax: **, abs). Trusted bank content only. */
function compileExpr(expr) {
  if (mathjs === null) mathjs = require('mathjs');
  const code = mathjs.compile(String(expr).replace(/\*\*/g, '^'));
  return (x) => {
    const y = code.evaluate({ x });
    return typeof y === 'number' && Number.isFinite(y) ? y : NaN;
  };
}

/** A rectangular xy-plane: a grid every `step`, tick labels every `labelStep`, axes through the origin when it is in view. */
function xyPlane({ xmin, xmax, ymin, ymax }) {
  const spanX = xmax - xmin, spanY = ymax - ymin;
  const gx = spanX <= 24 ? 1 : niceStep(spanX, 16);
  const gy = spanY <= 24 ? 1 : niceStep(spanY, 16);
  const lx = spanX / gx <= 12 ? gx : niceStep(spanX, 10);
  const ly = spanY / gy <= 12 ? gy : niceStep(spanY, 10);
  const ox = 34, oy = 18;
  const w = W - 2 * ox;
  const h = Math.max(260, Math.min(460, w * (spanY / spanX)));
  const sx = (x) => ox + ((x - xmin) / spanX) * w;
  const sy = (y) => oy + ((ymax - y) / spanY) * h;
  let body = '';
  for (let x = Math.ceil(xmin / gx) * gx; x <= xmax + 1e-9; x += gx) body += line([sx(x), sy(ymin)], [sx(x), sy(ymax)], { width: 1, color: GRID });
  for (let y = Math.ceil(ymin / gy) * gy; y <= ymax + 1e-9; y += gy) body += line([sx(xmin), sy(y)], [sx(xmax), sy(y)], { width: 1, color: GRID });
  const axY = ymin <= 0 && ymax >= 0 ? 0 : ymin;   // the x-axis sits at y = 0 when in view
  const axX = xmin <= 0 && xmax >= 0 ? 0 : xmin;
  body += line([sx(xmin), sy(axY)], [sx(xmax), sy(axY)], { width: 2.4 }) + line([sx(axX), sy(ymin)], [sx(axX), sy(ymax)], { width: 2.4 });
  for (let x = Math.ceil(xmin / lx) * lx; x <= xmax + 1e-9; x += lx) {
    if (Math.abs(x - axX) < 1e-9 && axX === 0) continue;
    body += text(sx(x), sy(axY) + 18, num(x), { size: 17, color: SOFT });
  }
  for (let y = Math.ceil(ymin / ly) * ly; y <= ymax + 1e-9; y += ly) {
    if (Math.abs(y - axY) < 1e-9 && axY === 0) continue;
    body += text(sx(axX) - 8, sy(y), num(y), { size: 17, color: SOFT, anchor: 'end' });
  }
  if (axY === 0 && axX === 0) body += text(sx(0) - 8, sy(0) + 18, '0', { size: 17, color: SOFT, anchor: 'end' });
  body += text(sx(xmax) - 8, sy(axY) - 14, 'x', { size: 21 }) + text(sx(axX) + 14, sy(ymax) + 10, 'y', { size: 21 });
  return { sx, sy, body, height: oy + h + 34, gx, gy, ox, oy, w, h };
}

/** SVG path of y = f(x) over the window, broken where it leaves the view or jumps. */
function curvePath(P, f, { xmin, xmax, ymin, ymax }) {
  const pad = ymax - ymin;
  let d = '', pen = false, prev = null;
  const n = 480;
  for (let i = 0; i <= n; i++) {
    const x = xmin + ((xmax - xmin) * i) / n;
    const y = f(x);
    const ok = Number.isFinite(y) && y > ymin - pad && y < ymax + pad && !(prev != null && Math.abs(y - prev) > pad);
    if (ok) { d += `${pen ? 'L' : 'M'} ${r1(P.sx(x))} ${r1(P.sy(y))} `; pen = true; } else pen = false;
    prev = Number.isFinite(y) ? y : null;
  }
  return d.trim();
}

/** Grid points (integer x and y) the graph passes through, in view: what a reader reads off the figure. */
function latticePoints(f, { xmin, xmax, ymin, ymax }, limit = 7) {
  const pts = [];
  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x++) {
    const y = f(x);
    if (Number.isFinite(y) && Math.abs(y - Math.round(y)) < 1e-9 && y >= ymin && y <= ymax) pts.push([x, Math.round(y)]);
  }
  if (pts.length <= limit) return pts;
  // Keep the intercepts and an even spread of the rest.
  const must = pts.filter(([x, y]) => x === 0 || y === 0);
  const rest = pts.filter((p) => !must.includes(p));
  const want = Math.max(0, limit - must.length);
  const spread = rest.filter((_, i) => rest.length <= want || i % Math.ceil(rest.length / want) === 0).slice(0, want);
  return [...must, ...spread].sort((a, b) => a[0] - b[0]);
}

function shapeOf(f, { xmin, xmax }) {
  const xs = [0, 1, 2, 3].map((k) => xmin + ((xmax - xmin) * (k + 1)) / 5);
  const ys = xs.map(f);
  const s1 = (ys[1] - ys[0]) / (xs[1] - xs[0]), s2 = (ys[3] - ys[2]) / (xs[3] - xs[2]);
  return Math.abs(s1 - s2) < 1e-9 * Math.max(1, Math.abs(s1)) ? 'line' : 'curve';
}

const pt = ([x, y]) => `(${num(x)}, ${num(y)})`;
function windowWords(win, P) {
  return `The x-axis shows ${num(win.xmin)} to ${num(win.xmax)} and the y-axis ${num(win.ymin)} to ${num(win.ymax)}, with grid lines every ${plain(P.gx)}${P.gy !== P.gx ? ` and ${plain(P.gy)}` : ''} unit${P.gx === 1 && P.gy === 1 ? '' : 's'}.`;
}
function throughWords(f, win, noun) {
  const lp = latticePoints(f, win);
  return lp.length ? `${noun} passes through the grid points ${lp.map(pt).join(', ')}.` : `${noun} passes through no grid point in view.`;
}

/** The graph of y = f(x) in the xy-plane. */
function functionGraph({ expr, xmin = -5, xmax = 5, ymin = -5, ymax = 5 }) {
  const win = { xmin, xmax, ymin, ymax };
  const f = compileExpr(expr);
  const P = xyPlane(win);
  const body = P.body + `<path d="${curvePath(P, f, win)}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>`;
  const noun = shapeOf(f, win) === 'line' ? 'The line' : 'The curve';
  return {
    svg: svgDoc(P.height, body),
    alt: `Graph of ${noun === 'The line' ? 'a line' : 'a curve'} in the xy-plane. ${windowWords(win, P)} ${throughWords(f, win, noun)}`,
  };
}

/** Two graphs on one grid, the region between them shaded from x = a to x = b when given. */
function regionGraph({ expr1, expr2, xmin = -5, xmax = 5, ymin = -5, ymax = 5, a, b }) {
  const win = { xmin, xmax, ymin, ymax };
  const f1 = compileExpr(expr1), f2 = compileExpr(expr2);
  const P = xyPlane(win);
  let body = P.body;
  const shaded = a != null && b != null;
  if (shaded) {
    const n = 200, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      top.push([P.sx(x), P.sy(Math.max(ymin, Math.min(ymax, f1(x))))]);
      bot.push([P.sx(x), P.sy(Math.max(ymin, Math.min(ymax, f2(x))))]);
    }
    const pts = [...top, ...bot.reverse()].map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
    body += `<polygon points="${pts}" fill="#d9d1f7" fill-opacity="0.75" stroke="none"/>`;
  }
  body += `<path d="${curvePath(P, f1, win)}" fill="none" stroke="${INK}" stroke-width="3.2"/>`;
  body += `<path d="${curvePath(P, f2, win)}" fill="none" stroke="#5b3fc4" stroke-width="3.2"/>`;
  const n1 = shapeOf(f1, win) === 'line' ? 'line' : 'curve';
  const n2 = shapeOf(f2, win) === 'line' ? 'line' : 'curve';
  const first = n1 === n2 ? `One ${n1}` : `The ${n1}`;
  const second = n1 === n2 ? `The other ${n2}` : `The ${n2}`;
  const crossings = latticePoints((x) => (Math.abs(f1(x) - f2(x)) < 1e-9 ? f1(x) : NaN), win, 4);
  return {
    svg: svgDoc(P.height, body),
    alt: `Two graphs in the xy-plane. ${windowWords(win, P)} ${throughWords(f1, win, first)} ${throughWords(f2, win, second)}`
      + `${crossings.length ? ` They meet at ${crossings.map(pt).join(' and ')}.` : ''}`
      + `${shaded ? ` The region between the two graphs from x = ${num(a)} to x = ${num(b)} is shaded.` : ''}`,
  };
}

// ── Descriptions for figures that keep their drawing ───────────────────────

/** A table's description: every cell, row by row. */
function tableAlt({ headers = [], rows = [] }) {
  const head = headers.filter((h) => String(h).trim()).join(', ');
  const body = rows.map((r) => r.map((c, i) => (headers[i] && String(headers[i]).trim() ? `${headers[i]} ${c}` : c)).join(', ')).join('; ');
  return `Table${head ? ` with columns ${head}` : ''}. ${body}.`;
}

/** A labeled geometry schematic, described as scripts/satFigureRenderer.py lays it out. */
function geometryAlt({ shape, labels = {} }) {
  const L = labels;
  if (shape === 'lines') {
    return `Two parallel lines${L.line1 ? `, ${L.line1} above and ${L.line2} below,` : ''} cut by a transversal${L.transversal ? ` ${L.transversal}` : ''} running from upper left to lower right. `
      + `${L.angle1 ? `The angle above the upper line, to the right of the transversal, is labeled ${L.angle1}. ` : ''}`
      + `${L.angle2 ? `The angle below the lower line, to the left of the transversal, is labeled ${L.angle2}.` : ''}`.trim();
  }
  if (shape === 'triangle') {
    const parts = ['Right triangle with the right angle at the lower left.'];
    const horiz = L.horizontal_leg || L.base, vert = L.vertical_leg || L.height || L.support;
    if (horiz) parts.push(`The horizontal leg (bottom) is labeled ${horiz}.`);
    if (vert) parts.push(`The vertical leg (left) is labeled ${vert}.`);
    if (L.hypotenuse) parts.push(`The hypotenuse is labeled ${L.hypotenuse}.`);
    if (L.angle) parts.push(`The angle at the lower right, between the hypotenuse and the horizontal leg, is labeled ${L.angle}.`);
    if (L.A || L.B || L.C) parts.push(`Vertices: ${[['C', 'top left'], ['A', 'lower left, the right angle'], ['B', 'lower right']].filter(([k]) => L[k]).map(([k, w]) => `${L[k]} at the ${w}`).join(', ')}.`);
    return parts.join(' ');
  }
  return `Figure labeled ${Object.values(L).join(', ')}.`;
}

/**
 * One SAT figure spec -> { svg, alt }. `svg` is null for kinds whose drawing
 * stays with the Python renderer (table, geometry); `alt` is always set.
 */
function renderSatFigure(kind, params) {
  const p = params || {};
  switch (kind) {
    case 'bar': return barChart(p);
    case 'scatter': return scatterPlot(p);
    case 'fgraph': return functionGraph(p);
    case 'region': return regionGraph(p);
    case 'table': return { svg: null, alt: tableAlt(p) };
    case 'geometry': return { svg: null, alt: geometryAlt(p) };
    default: return { svg: null, alt: null };
  }
}

module.exports = {
  renderSatFigure, barChart, scatterPlot, functionGraph, regionGraph, tableAlt, geometryAlt,
  barScale, axisFor, niceStep, latticePoints,
};
