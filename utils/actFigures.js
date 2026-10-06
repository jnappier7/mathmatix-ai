/**
 * ACT FIGURES — small, text-based SVG drawn from an item's own numbers.
 *
 * The act-enhanced bank (1,195 items) shipped with no figures at all, so an
 * assembled form averaged 1.9 visual items against about ten on an official
 * form (external audit, 2026-10-05). Its items are templates whose numbers are
 * known, so the figure can be DRAWN from them: a labelled right triangle for a
 * trig ratio, two parallel lines and a transversal with the two angles marked,
 * the two points on a grid for a line through two points. Nothing about the
 * item's math changes; scripts/addActEnhancedFigures.js attaches the figure.
 *
 * Why not matplotlib like the Fable figures: a matplotlib SVG embeds every
 * glyph as a path (~30 KB per figure). These are plain <text> and a few
 * strokes (~1–2 KB), so a few hundred of them cost the bank almost nothing.
 *
 * Conventions every builder follows:
 *   - A white ground rect, because the figure also renders inside the dark
 *     chat panel (CLAUDE.md §12: inline surfaces paint their own ground).
 *   - Geometry is drawn to scale where the item's numbers allow it; anything
 *     the student is asked to find is labelled "?" or "x°", never its value.
 *   - Every builder returns { svg, alt }. `alt` is the screen-reader
 *     description that becomes the item's figureAlt.
 *
 * @module utils/actFigures
 */

const W = 260;            // viewBox width every figure is laid out in
const INK = '#1f1f1f';
const SOFT = '#6b6b6b';
const FILL = '#ece8fb';
const FONT = 'font-family="Helvetica, Arial, sans-serif"';

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Display a signed number with a real minus sign.
const num = (n) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
const pt = (x, y) => `(${num(x)}, ${num(y)})`;

function svgDoc(h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(h)}" viewBox="0 0 ${W} ${Math.round(h)}" ${FONT}>`
    + `<rect width="${W}" height="${Math.round(h)}" fill="#ffffff"/>${body}</svg>`;
}

function text(x, y, s, { size = 13, anchor = 'middle', color = INK, italic = false, weight } = {}) {
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="middle" fill="${color}"`
    + `${italic ? ' font-style="italic"' : ''}${weight ? ` font-weight="${weight}"` : ''}>${esc(s)}</text>`;
}

function line(a, b, { color = INK, width = 1.6, dash } = {}) {
  return `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${color}" stroke-width="${width}"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`;
}

function poly(points, { fill = 'none', color = INK, width = 1.6 } = {}) {
  return `<polygon points="${points.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ')}" fill="${fill}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

const dot = (p, rad = 3.2) => `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${rad}" fill="${INK}"/>`;

/** Fit a set of model-space points into the figure box; returns a mapper and the height. */
function fitter(points, { maxW = W - 70, maxH = 150, pad = 35 } = {}) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min(maxW / Math.max(maxX - minX, 1e-9), maxH / Math.max(maxY - minY, 1e-9));
  const w = (maxX - minX) * s;
  const h = (maxY - minY) * s;
  const ox = (W - w) / 2;
  // Model y points UP; SVG y points down.
  const map = ([x, y]) => [ox + (x - minX) * s, pad + (maxY - y) * s];
  return { map, height: h + 2 * pad, scale: s };
}

/** A label pushed outward from a polygon's centroid, off the midpoint of a side. */
function sideLabel(a, b, centroid, s, offset = 13) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let nx = -(b[1] - a[1]), ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  if ((mx - centroid[0]) * nx + (my - centroid[1]) * ny < 0) { nx = -nx; ny = -ny; }
  return text(mx + nx * offset, my + ny * offset, s);
}

/** A label pushed outward from the centroid, off a vertex. */
function vertexLabel(p, centroid, s, offset = 12, opts = {}) {
  let dx = p[0] - centroid[0], dy = p[1] - centroid[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  return text(p[0] + dx * offset, p[1] + dy * offset, s, opts);
}

const centroidOf = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/** Small right-angle box at vertex v between the directions to a and b. */
function rightMark(v, a, b, size = 10) {
  const u = (p) => { const dx = p[0] - v[0], dy = p[1] - v[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const [ux, uy] = u(a), [wx, wy] = u(b);
  const p1 = [v[0] + ux * size, v[1] + uy * size];
  const p2 = [v[0] + (ux + wx) * size, v[1] + (uy + wy) * size];
  const p3 = [v[0] + wx * size, v[1] + wy * size];
  return `<polyline points="${r1(p1[0])},${r1(p1[1])} ${r1(p2[0])},${r1(p2[1])} ${r1(p3[0])},${r1(p3[1])}" fill="none" stroke="${INK}" stroke-width="1.1"/>`;
}

/** Angle arc at v, from the direction of a to the direction of b (the smaller way), with a label inside it. */
function angleArc(v, a, b, label, { radius = 20, labelAt = 34, size = 12 } = {}) {
  const ang = (p) => Math.atan2(p[1] - v[1], p[0] - v[0]);
  let t1 = ang(a), t2 = ang(b);
  let d = t2 - t1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const p1 = [v[0] + radius * Math.cos(t1), v[1] + radius * Math.sin(t1)];
  const p2 = [v[0] + radius * Math.cos(t1 + d), v[1] + radius * Math.sin(t1 + d)];
  const sweep = d > 0 ? 1 : 0;
  const mid = t1 + d / 2;
  return `<path d="M ${r1(p1[0])} ${r1(p1[1])} A ${radius} ${radius} 0 0 ${sweep} ${r1(p2[0])} ${r1(p2[1])}" fill="none" stroke="${INK}" stroke-width="1.1"/>`
    + (label ? text(v[0] + labelAt * Math.cos(mid), v[1] + labelAt * Math.sin(mid), label, { size }) : '');
}

// ── Triangles ───────────────────────────────────────────────────────────────

/**
 * Right triangle with legs `a` (vertical) and `b` (horizontal).
 * labels: { a, b, c } side labels (c = hypotenuse); vertices: optional names
 * for [bottom-left, right-angle corner, top]. angles: optional label at the
 * bottom-left acute angle and/or the top acute angle.
 */
function rightTriangle({ a, b, labels = {}, vertices, angleLeft, angleTop }) {
  const A = [0, 0], C = [b, 0], B = [b, a];
  const { map, height } = fitter([A, B, C], { maxH: 130 });
  const P = [A, C, B].map(map);
  const cen = centroidOf(P);
  let body = poly(P, { fill: FILL }) + rightMark(P[1], P[0], P[2]);
  if (labels.b != null) body += sideLabel(P[0], P[1], cen, labels.b);
  if (labels.a != null) body += sideLabel(P[1], P[2], cen, labels.a);
  if (labels.c != null) body += sideLabel(P[2], P[0], cen, labels.c);
  if (vertices) vertices.forEach((v, i) => { body += vertexLabel(P[i], cen, v, 13, { italic: false, weight: '600' }); });
  if (angleLeft) body += angleArc(P[0], P[1], P[2], angleLeft, { labelAt: 38 });
  if (angleTop) body += angleArc(P[2], P[0], P[1], angleTop, { radius: 16, labelAt: 30 });
  return { svg: svgDoc(height, body), height };
}

/** Triangle with interior angles (degrees) A at left, B at right, C on top; base drawn to scale. */
function triangleFromAngles(angA, angB, { labelA, labelB, labelC, sides = {}, names }) {
  const rad = (d) => (d * Math.PI) / 180;
  const angC = 180 - angA - angB;
  const base = 1;
  const ac = (base * Math.sin(rad(angB))) / Math.sin(rad(angC));
  const A = [0, 0], B = [base, 0], C = [ac * Math.cos(rad(angA)), ac * Math.sin(rad(angA))];
  const { map, height } = fitter([A, B, C], { maxH: 120 });
  const P = [A, B, C].map(map);
  const cen = centroidOf(P);
  let body = poly(P, { fill: FILL });
  const small = (d) => (d < 40 ? { radius: 22, labelAt: 42 } : { radius: 18, labelAt: 32 });
  if (labelA) body += angleArc(P[0], P[1], P[2], labelA, small(angA));
  if (labelB) body += angleArc(P[1], P[2], P[0], labelB, small(angB));
  if (labelC) body += angleArc(P[2], P[0], P[1], labelC, small(angC));
  if (sides.AB != null) body += sideLabel(P[0], P[1], cen, sides.AB);
  if (sides.BC != null) body += sideLabel(P[1], P[2], cen, sides.BC);
  if (sides.CA != null) body += sideLabel(P[2], P[0], cen, sides.CA);
  if (names) names.forEach((n, i) => { body += vertexLabel(P[i], cen, n, 13, { weight: '600' }); });
  return { svg: svgDoc(height, body), height, P };
}

// ── Item-family builders. Each takes the regex match of the item's stem. ─────

const B = {};

/** "In right triangle ABC, angle C is the right angle. The side opposite angle A measures o, … adjacent … a, … hypotenuse … h." */
B.rightTriangleTrig = ({ opp, adj, hyp }) => {
  // Vertices: A bottom-left, C the right angle, B on top. BC is opposite A.
  const f = rightTriangle({ a: opp, b: adj, labels: { a: opp, b: adj, c: hyp }, vertices: ['A', 'C', 'B'] });
  return { svg: f.svg, alt: `Right triangle ABC with the right angle at C. Side BC, opposite angle A, is ${opp}; side AC, adjacent to angle A, is ${adj}; hypotenuse AB is ${hyp}.` };
};

/** "A ladder L feet long leans against a wall, making a θ° angle with the ground." */
B.ladder = ({ length, angle }) => {
  const t = (angle * Math.PI) / 180;
  const foot = [0, 0], top = [Math.cos(t), Math.sin(t)], base = [Math.cos(t), 0];
  const { map, height } = fitter([foot, top, base, [Math.cos(t) + 0.18, 0]], { maxH: 130 });
  const F = map(foot), T = map(top), Bs = map(base);
  const ground0 = map([-0.15, 0]), ground1 = map([Math.cos(t) + 0.18, 0]);
  const wallTop = map([Math.cos(t), Math.sin(t) + 0.12]);
  let body = line(ground0, ground1, { width: 2 }) + line(Bs, wallTop, { width: 3, color: '#9a8f7a' });
  // Hatching under the ground line.
  for (let x = ground0[0] + 6; x < ground1[0]; x += 12) body += line([x, ground0[1]], [x - 6, ground0[1] + 7], { width: 0.8, color: SOFT });
  body += line(F, T, { width: 2.4 }) + rightMark(Bs, F, T, 9);
  body += angleArc(F, Bs, T, `${angle}°`, { radius: 22, labelAt: 38 });
  body += text((F[0] + T[0]) / 2 - 16, (F[1] + T[1]) / 2 - 8, `${length} ft`);
  body += text(Bs[0] + 14, (Bs[1] + T[1]) / 2, 'h', { italic: true, anchor: 'start' });
  body += line([Bs[0] + 8, T[1]], [Bs[0] + 8, Bs[1]], { width: 0.9, color: SOFT, dash: '3 3' });
  return { svg: svgDoc(height, body), alt: `A ladder ${length} feet long leans against a vertical wall and meets the ground at a ${angle} degree angle. The height h where the ladder touches the wall is marked.` };
};

/** Right triangle given both legs; the hypotenuse is asked. */
B.pythagoreanHyp = ({ a, b }) => {
  const f = rightTriangle({ a, b, labels: { a, b, c: '?' } });
  return { svg: f.svg, alt: `Right triangle with legs ${a} and ${b}. The hypotenuse is marked with a question mark.` };
};

/** Right triangle given the hypotenuse and one leg; the other leg is asked. */
B.pythagoreanLeg = ({ hyp, leg }) => {
  const other = Math.sqrt(hyp * hyp - leg * leg);
  const f = rightTriangle({ a: other, b: leg, labels: { a: '?', b: leg, c: hyp } });
  return { svg: f.svg, alt: `Right triangle with hypotenuse ${hyp} and one leg ${leg}. The other leg is marked with a question mark.` };
};

/** 45°-45°-90° with each leg L; the hypotenuse is asked. */
B.special45 = ({ leg }) => {
  const f = rightTriangle({ a: 1, b: 1, labels: { a: leg, b: leg, c: '?' }, angleLeft: '45°', angleTop: '45°' });
  return { svg: f.svg, alt: `Right triangle with two 45 degree angles. Each leg is ${leg}; the hypotenuse is marked with a question mark.` };
};

/** 30°-60°-90° with the side opposite 30° given; the hypotenuse or the longer leg is asked. */
B.special3060 = ({ short, asked = 'hypotenuse' }) => {
  // Short leg vertical (opposite the 30° angle at the bottom left).
  const labels = asked === 'hypotenuse' ? { a: short, c: '?' } : { a: short, b: '?' };
  const f = rightTriangle({ a: 1, b: Math.sqrt(3), labels, angleLeft: '30°', angleTop: '60°' });
  return { svg: f.svg, alt: `Right triangle with a 30 degree and a 60 degree angle. The side opposite the 30 degree angle is ${short}; the ${asked} is marked with a question mark.` };
};

/** Two angles given; the third is asked. */
B.triangleAngles = ({ a, b }) => {
  const f = triangleFromAngles(a, b, { labelA: `${a}°`, labelB: `${b}°`, labelC: 'x°' });
  return { svg: f.svg, alt: `Triangle with two angles labeled ${a} degrees and ${b} degrees. The third angle is labeled x degrees.` };
};

/** Triangle ABC ~ triangle DEF with AB, DE, BC given; EF asked. */
B.similarTriangles = ({ ab, de, bc }) => {
  // Same shape: angle B = 62°, sides AB and BC as given (AB on the left side).
  const t = (62 * Math.PI) / 180;
  const shape = (k) => {
    const Bv = [0, 0], Cv = [bc * k, 0], Av = [ab * k * Math.cos(t), ab * k * Math.sin(t)];
    return [Av, Bv, Cv];
  };
  const k = de / ab;
  const small = shape(1);
  // Draw the large one at most 1.9× the small, side by side: the labels carry
  // the scale, and a 4× triangle would not fit beside its partner.
  const vis = Math.min(k, 1.9);
  // Leave a clear gap after the small triangle's right edge so its C and the
  // large triangle's E never collide.
  const smallRight = Math.max(...small.map(([x]) => x));
  const bigLeft = Math.min(...shape(vis).map(([x]) => x));
  const big = shape(vis).map(([x, y]) => [x - bigLeft + smallRight + Math.max(ab, bc) * 0.75, y]);
  const all = [...small, ...big];
  const { map, height } = fitter(all, { maxW: W - 50, maxH: 110 });
  const S = small.map(map), L = big.map(map);
  const cS = centroidOf(S), cL = centroidOf(L);
  let body = poly(S, { fill: FILL }) + poly(L, { fill: FILL });
  ['A', 'B', 'C'].forEach((n, i) => { body += vertexLabel(S[i], cS, n, 12, { weight: '600' }); });
  ['D', 'E', 'F'].forEach((n, i) => { body += vertexLabel(L[i], cL, n, 12, { weight: '600' }); });
  body += sideLabel(S[0], S[1], cS, ab, 11) + sideLabel(S[1], S[2], cS, bc, 11);
  body += sideLabel(L[0], L[1], cL, de, 11) + sideLabel(L[1], L[2], cL, '?', 11);
  return { svg: svgDoc(height + 6, body), alt: `Two similar triangles, ABC and DEF. In triangle ABC, AB is ${ab} and BC is ${bc}. In triangle DEF, DE is ${de} and EF is marked with a question mark. The figures are not drawn to the same scale.` };
};

/**
 * Two parallel lines cut by a transversal; the given angle and the asked one.
 * relation: 'co-interior' | 'alternate interior' | 'corresponding' | 'vertical'.
 */
B.parallelLines = ({ given, relation, labelAt = 30, halo = false, gap = 70 }) => {
  // The given angle sits at the TOP intersection, below the line, right of the
  // transversal; its measure is 180 − φ where φ is the transversal's angle to
  // the lines. Every asked angle is then placed where its measure is right.
  let phi = 180 - given;
  phi = Math.max(28, Math.min(152, phi));   // keep the drawing legible
  const t = (phi * Math.PI) / 180;
  const h = gap;                              // gap between the lines
  const y1 = 45, y2 = y1 + h;
  const cx = W / 2;
  const dx = h / Math.tan(t);                 // horizontal shift between the two crossings
  const P1 = [cx + dx / 2, y1], P2 = [cx - dx / 2, y2];
  const ext = 38 / Math.sin(t);
  const u = [Math.cos(t), -Math.sin(t)];     // up-right along the transversal (SVG y down)
  const T0 = [P2[0] - u[0] * ext, P2[1] - u[1] * ext];
  const T1 = [P1[0] + u[0] * ext, P1[1] + u[1] * ext];
  let body = line([20, y1], [W - 20, y1], { width: 1.8 }) + line([20, y2], [W - 20, y2], { width: 1.8 }) + line(T0, T1, { width: 1.8 });
  // Arrowheads marking the lines parallel.
  [[W - 34, y1], [W - 34, y2]].forEach(([x, y]) => { body += `<polyline points="${x - 6},${y - 5} ${x},${y} ${x - 6},${y + 5}" fill="none" stroke="${INK}" stroke-width="1.4"/>`; });
  const right = (p) => [p[0] + 30, p[1]], left = (p) => [p[0] - 30, p[1]];
  const up = (p) => [p[0] + u[0] * 30, p[1] + u[1] * 30], down = (p) => [p[0] - u[0] * 30, p[1] - u[1] * 30];
  body += angleArc(P1, right(P1), down(P1), `${given}°`, { radius: 15, labelAt });
  const asked = {
    'co-interior': [P2, right(P2), up(P2)],
    'alternate interior': [P2, left(P2), up(P2)],
    corresponding: [P2, right(P2), down(P2)],
    vertical: [P1, left(P1), up(P1)],
  }[relation];
  if (asked) body += angleArc(asked[0], asked[1], asked[2], 'x°', { radius: 15, labelAt });
  // Long labels (algebraic expressions) cross the lines; a white halo keeps them legible.
  if (halo) body = body.replace(/<text ([^>]*)>/g, '<text $1 stroke="#fff" stroke-width="3.5" paint-order="stroke">');
  const where = {
    'co-interior': 'on the same side of the transversal, between the parallel lines',
    'alternate interior': 'on the opposite side of the transversal, between the parallel lines',
    corresponding: 'in the matching position at the other intersection',
    vertical: 'vertically opposite it at the same intersection',
  }[relation];
  return { svg: svgDoc(y2 + 48, body), alt: `Two parallel lines cut by a transversal. One angle is labeled ${given} degrees; the angle labeled x degrees is ${where}.` };
};

/** Circle with a shaded sector: radius r, central angle θ. */
B.sector = ({ r, angle }) => {
  const R = 58, c = [W / 2, 78];
  const a0 = -Math.PI / 2 + 0.35, a1 = a0 + (angle * Math.PI) / 180;
  const p = (a) => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)];
  const large = angle > 180 ? 1 : 0;
  let body = `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  body += `<path d="M ${c[0]} ${c[1]} L ${r1(p(a0)[0])} ${r1(p(a0)[1])} A ${R} ${R} 0 ${large} 1 ${r1(p(a1)[0])} ${r1(p(a1)[1])} Z" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>`;
  body += dot(c, 2.6);
  // A narrow sector has no room for its label at the usual distance.
  body += angleArc(c, p(a0), p(a1), `${angle}°`, { radius: 14, labelAt: angle < 60 ? 44 : 28, size: 12 });
  // Radius label beside the first radius, on the side AWAY from the sector,
  // so a narrow sector's angle label never sits on top of it.
  const m = [(c[0] + p(a0)[0]) / 2, (c[1] + p(a0)[1]) / 2];
  body += text(m[0] + 11 * Math.cos(a0 - Math.PI / 2), m[1] + 11 * Math.sin(a0 - Math.PI / 2), r, { size: 12 });
  return { svg: svgDoc(160, body), alt: `Circle of radius ${r} with a shaded sector whose central angle is ${angle} degrees.` };
};

/** Circle with its radius or diameter drawn and labeled. */
B.circle = ({ value, kind, unit = '' }) => {
  const R = 58, c = [W / 2, 78];
  let body = `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>` + dot(c, 2.6);
  const label = `${value}${unit ? ` ${unit}` : ''}`;
  if (kind === 'diameter') {
    body += line([c[0] - R, c[1]], [c[0] + R, c[1]]) + text(c[0], c[1] - 10, label);
  } else {
    body += line(c, [c[0] + R * 0.8, c[1] - R * 0.6]) + text(c[0] + 20, c[1] - 30, label);
  }
  return { svg: svgDoc(160, body), alt: `Circle with ${kind} ${label}.` };
};

/** Area figures: triangle / parallelogram / trapezoid with base(s) and a dashed height. */
B.areaShape = ({ shape, base, top, height }) => {
  const hh = height;
  let pts;
  if (shape === 'triangle') pts = [[0, 0], [base, 0], [base * 0.35, hh]];
  else if (shape === 'parallelogram') pts = [[0, 0], [base, 0], [base + base * 0.3, hh], [base * 0.3, hh]];
  else pts = [[0, 0], [base, 0], [(base + top) / 2, hh], [(base - top) / 2, hh]];
  const { map, height: fh } = fitter(pts, { maxH: 110 });
  const P = pts.map(map);
  const cen = centroidOf(P);
  let body = poly(P, { fill: FILL });
  body += sideLabel(P[0], P[1], cen, base);
  if (shape === 'trapezoid') body += sideLabel(P[2], P[3], cen, top);
  // Dashed altitude from the top-left vertex (apex for a triangle) to the base.
  const apex = shape === 'triangle' ? P[2] : P[3];
  const foot = [apex[0], P[0][1]];
  body += line(apex, foot, { dash: '4 3', width: 1.2 }) + rightMark(foot, apex, P[1], 7);
  body += text(apex[0] + 9, (apex[1] + foot[1]) / 2, height, { anchor: 'start' });
  const words = shape === 'trapezoid'
    ? `Trapezoid with parallel bases ${base} and ${top} and a dashed height of ${height}.`
    : `${shape === 'triangle' ? 'Triangle' : 'Parallelogram'} with base ${base} and a dashed height of ${height}.`;
  return { svg: svgDoc(fh, body), alt: words };
};

/** Coordinate grid with points (and optionally a segment or a line through them). */
B.coordinate = ({ points, connect = 'none', mirror }) => {
  // Smallest standard window that keeps every point inside the grid with a
  // square to spare. (A fixed ±10 dropped (6, −13) off the figure.)
  const far = Math.max(...points.flatMap(([, x, y]) => [Math.abs(x), Math.abs(y)]));
  const lim = [6, 10, 15, 20, 30].find((L) => far + 1 <= L) || Math.ceil((far + 2) / 10) * 10;
  const size = 200, ox = (W - size) / 2, oy = 14;
  const sx = (x) => ox + ((x + lim) / (2 * lim)) * size;
  const sy = (y) => oy + ((lim - y) / (2 * lim)) * size;
  let body = '';
  for (let k = -lim; k <= lim; k++) {
    body += line([sx(k), sy(-lim)], [sx(k), sy(lim)], { width: k === 0 ? 1.4 : 0.5, color: k === 0 ? INK : '#d8d8d8' });
    body += line([sx(-lim), sy(k)], [sx(lim), sy(k)], { width: k === 0 ? 1.4 : 0.5, color: k === 0 ? INK : '#d8d8d8' });
  }
  const step = lim === 6 ? 2 : lim <= 15 ? 5 : 10;
  for (let k = -lim + step; k < lim; k += step) {
    if (k === 0) continue;
    body += text(sx(k), sy(0) + 9, num(k), { size: 9, color: SOFT });
    body += text(sx(0) - 7, sy(k), num(k), { size: 9, color: SOFT, anchor: 'end' });
  }
  body += text(sx(lim) - 4, sy(0) - 8, 'x', { italic: true, size: 12 }) + text(sx(0) + 9, sy(lim) + 6, 'y', { italic: true, size: 12 });
  if (mirror === 'y=x') body += line([sx(-lim), sy(-lim)], [sx(lim), sy(lim)], { dash: '5 4', width: 1.2, color: SOFT }) + text(sx(lim) - 22, sy(lim) + 12, 'y = x', { size: 11, color: SOFT });
  const P = points.map(([, x, y]) => [sx(x), sy(y)]);
  if (connect === 'segment' && P.length === 2) body += line(P[0], P[1], { width: 1.8 });
  if (connect === 'line' && P.length === 2) {
    const [a, b] = P;
    const dxl = b[0] - a[0], dyl = b[1] - a[1];
    const L = Math.hypot(dxl, dyl) || 1;
    const k = 400 / L;
    // Unique per figure: two grids on one page must not share a clip id.
    const cid = `g${points.map(([, x, y]) => `${x}_${y}`).join('_').replace(/-/g, 'm')}`;
    body += `<clipPath id="${cid}"><rect x="${ox}" y="${oy}" width="${size}" height="${size}"/></clipPath>`
      + `<g clip-path="url(#${cid})">${line([a[0] - dxl * k, a[1] - dyl * k], [b[0] + dxl * k, b[1] + dyl * k], { width: 1.8 })}</g>`;
  }
  points.forEach(([name, x, y], i) => {
    body += dot(P[i]);
    const right = P[i][0] < W / 2 + 40;
    // White halo so a label stays readable over the grid.
    body += `<text x="${r1(P[i][0] + (right ? 7 : -7))}" y="${r1(P[i][1] - 9)}" font-size="11" text-anchor="${right ? 'start' : 'end'}" dominant-baseline="middle" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(`${name ? `${name} ` : ''}${pt(x, y)}`)}</text>`;
  });
  const desc = points.map(([name, x, y]) => `${name ? `${name} at ` : ''}${pt(x, y).replace(/−/g, '-')}`).join(' and ');
  return {
    svg: svgDoc(size + 2 * oy, body),
    alt: `Coordinate grid from ${-lim} to ${lim} on each axis with the point${points.length > 1 ? 's' : ''} ${desc} plotted`
      + `${connect === 'line' ? ' and the line through them drawn' : connect === 'segment' ? ' and the segment joining them drawn' : ''}`
      + `${mirror === 'y=x' ? ', with the line y = x dashed' : ''}.`,
  };
};

/** Rectangular prism l × w × h in oblique projection. */
B.prism = ({ l, w, h }) => {
  const d = 0.45;                                  // depth foreshortening
  const s = Math.min(150 / (l + w * d), 110 / (h + w * d));
  const x0 = (W - (l + w * d) * s) / 2, y0 = 22 + (h + w * d) * s;
  const P = (x, y, z) => [x0 + (x + z * d) * s, y0 - (y + z * d) * s];
  const f = [P(0, 0, 0), P(l, 0, 0), P(l, h, 0), P(0, h, 0)];
  let body = poly(f, { fill: FILL });
  body += poly([P(0, h, 0), P(l, h, 0), P(l, h, w), P(0, h, w)], { fill: '#f6f4fd' });
  body += poly([P(l, 0, 0), P(l, 0, w), P(l, h, w), P(l, h, 0)], { fill: '#dcd5f6' });
  body += line(P(0, 0, 0), P(0, 0, w), { dash: '3 3', width: 1 }) + line(P(0, 0, w), P(l, 0, w), { dash: '3 3', width: 1 }) + line(P(0, 0, w), P(0, h, w), { dash: '3 3', width: 1 });
  body += text((f[0][0] + f[1][0]) / 2, f[0][1] + 13, l);
  body += text(f[0][0] - 10, (f[0][1] + f[3][1]) / 2, h, { anchor: 'end' });
  const e = [(P(l, 0, 0)[0] + P(l, 0, w)[0]) / 2 + 10, (P(l, 0, 0)[1] + P(l, 0, w)[1]) / 2 + 8];
  body += text(e[0], e[1], w, { anchor: 'start' });
  return { svg: svgDoc(y0 + 26, body), alt: `Rectangular prism measuring ${l} by ${w} by ${h}.` };
};

/** Cylinder or cone with radius and height marked. */
B.roundSolid = ({ kind, r, h }) => {
  const R = 52, ry = 14, H = 110, cx = W / 2, top = 26, bot = top + H;
  let body = '';
  if (kind === 'cylinder') {
    body += `<path d="M ${cx - R} ${top} L ${cx - R} ${bot} A ${R} ${ry} 0 0 0 ${cx + R} ${bot} L ${cx + R} ${top}" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>`;
    body += `<ellipse cx="${cx}" cy="${top}" rx="${R}" ry="${ry}" fill="#f6f4fd" stroke="${INK}" stroke-width="1.6"/>`;
    body += `<path d="M ${cx - R} ${bot} A ${R} ${ry} 0 0 1 ${cx + R} ${bot}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/>`;
    body += line([cx, top], [cx + R, top], { width: 1.2 }) + dot([cx, top], 2.2) + text(cx + R / 2, top + 7, r, { size: 12 });
    body += line([cx + R + 12, top], [cx + R + 12, bot], { width: 0.9, color: SOFT }) + text(cx + R + 18, (top + bot) / 2, h, { anchor: 'start' });
  } else {
    body += `<path d="M ${cx} ${top} L ${cx - R} ${bot} A ${R} ${ry} 0 0 0 ${cx + R} ${bot} Z" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>`;
    body += `<path d="M ${cx - R} ${bot} A ${R} ${ry} 0 0 1 ${cx + R} ${bot}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/>`;
    body += line([cx, top], [cx, bot], { dash: '4 3', width: 1.1 }) + rightMark([cx, bot], [cx, top], [cx + R, bot], 7);
    body += line([cx, bot], [cx + R, bot], { width: 1.2 }) + dot([cx, bot], 2.2) + text(cx + R / 2, bot - 7, r, { size: 12 });
    body += text(cx - 8, (top + bot) / 2 + 6, h, { anchor: 'end' });
  }
  return { svg: svgDoc(bot + ry + 18, body), alt: `${kind === 'cylinder' ? 'Cylinder' : 'Cone'} with radius ${r} and height ${h}.` };
};

/** Sphere with a radius drawn. */
B.sphere = ({ r }) => {
  const R = 60, c = [W / 2, 76];
  let body = `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" fill="${FILL}" stroke="${INK}" stroke-width="1.6"/>`;
  body += `<path d="M ${c[0] - R} ${c[1]} A ${R} 16 0 0 0 ${c[0] + R} ${c[1]}" fill="none" stroke="${INK}" stroke-width="1.1"/>`;
  body += `<path d="M ${c[0] - R} ${c[1]} A ${R} 16 0 0 1 ${c[0] + R} ${c[1]}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/>`;
  body += line(c, [c[0] + R, c[1]], { width: 1.2 }) + dot(c, 2.4) + text(c[0] + R / 2, c[1] - 9, r, { size: 12 });
  return { svg: svgDoc(156, body), alt: `Sphere with radius ${r}.` };
};

/** Square pyramid with base edge e and a dashed height. */
B.pyramid = ({ edge, height }) => {
  const s = 46, d = 0.45, cx = W / 2 - 10, by = 136;
  const P = (x, z) => [cx + (x + z * d) * s, by - z * d * s];
  const b = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
  const apex = [cx, 22];
  const center = P(0, 0);
  let body = poly([b[0], b[1], apex], { fill: FILL }) + poly([b[1], b[2], apex], { fill: '#dcd5f6' });
  body += line(b[0], b[1]) + line(b[1], b[2]) + line(b[2], b[3], { dash: '3 3', width: 1 }) + line(b[3], b[0], { dash: '3 3', width: 1 }) + line(b[3], apex, { dash: '3 3', width: 1 });
  body += line(apex, center, { dash: '4 3', width: 1.1 }) + dot(center, 2);
  body += text((b[0][0] + b[1][0]) / 2, b[0][1] + 13, edge) + text(center[0] - 8, (apex[1] + center[1]) / 2 + 8, height, { anchor: 'end' });
  return { svg: svgDoc(156, body), alt: `Square pyramid with base edge ${edge} and a dashed height of ${height} from the apex to the center of the base.` };
};

module.exports = {
  ...B,
  // Shared drawing primitives, so utils/actCharts.js draws in the same hand.
  _internal: { svgDoc, fitter, rightTriangle, triangleFromAngles, text, line, poly, dot, esc, num, r1, angleArc, rightMark, centroidOf, sideLabel, vertexLabel, W, INK, SOFT, FILL },
};
