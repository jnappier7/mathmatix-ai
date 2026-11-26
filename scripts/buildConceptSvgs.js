// Builds the board's own reference pictures into public/images/concepts/
// (served by utils/safeImageSearch.js getStaticConceptImage). Every position
// is computed here, none typed into the SVG — rerun after any change:
//   node scripts/buildConceptSvgs.js
// tests/unit/boardWrongPicture.test.js reads the files back and checks them.
const fs = require('fs');
const path = require('path');

const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const INK = '#1f2937', SOFT = '#5b6475', LINE = '#9aa3b2', ACCENT = '#6d28d9';
const n1 = (n) => (Math.round(n * 10) / 10).toString();
const open = (x, y, w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" ${FONT} role="img" aria-label="${label}">\n<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>\n`;

function unitCircle() {
const W = 720, H = 720, cx = 360, cy = 360, R = 200;
const ANG = [
  [0,'0','(1, 0)'],[30,'π/6','(√3/2, 1/2)'],[45,'π/4','(√2/2, √2/2)'],[60,'π/3','(1/2, √3/2)'],
  [90,'π/2','(0, 1)'],[120,'2π/3','(−1/2, √3/2)'],[135,'3π/4','(−√2/2, √2/2)'],[150,'5π/6','(−√3/2, 1/2)'],
  [180,'π','(−1, 0)'],[210,'7π/6','(−√3/2, −1/2)'],[225,'5π/4','(−√2/2, −√2/2)'],[240,'4π/3','(−1/2, −√3/2)'],
  [270,'3π/2','(0, −1)'],[300,'5π/3','(1/2, −√3/2)'],[315,'7π/4','(√2/2, −√2/2)'],[330,'11π/6','(√3/2, −1/2)'],
];
const f = (n) => n.toFixed(1);
let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="64 96 592 568" width="592" height="568" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="The unit circle: sixteen angles in degrees and radians with their (cos, sin) coordinates">\n`;
o += `<rect x="64" y="96" width="592" height="568" fill="#ffffff"/>\n`;
o += `<line x1="84" y1="${cy}" x2="${W-84}" y2="${cy}" stroke="#9aa3b2" stroke-width="1.5"/>\n<line x1="${cx}" y1="112" x2="${cx}" y2="${H-112}" stroke="#9aa3b2" stroke-width="1.5"/>\n`;
o += `<text x="${W-84}" y="${cy-8}" font-size="15" fill="#5b6475" text-anchor="end" font-style="italic">x</text>\n<text x="${cx+10}" y="124" font-size="15" fill="#5b6475" font-style="italic">y</text>\n`;
o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#1f2937" stroke-width="2.5"/>\n`;
for (const [d, rad, pt] of ANG) {
  const t = d * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const px = cx + R * c, py = cy - R * s;
  const axis = d % 90 === 0;
  if (!axis) o += `<line x1="${cx}" y1="${cy}" x2="${f(px)}" y2="${f(py)}" stroke="#c7cdd8" stroke-width="1"/>\n`;
  o += `<circle cx="${f(px)}" cy="${f(py)}" r="4.5" fill="#6d28d9"/>\n`;
  // inside: degrees and radians
  const ir = axis ? R - 46 : (d % 45 === 0 ? R - 92 : R - 46);
  let ix = cx + ir * c, iy = cy - ir * s;
  if (axis) { if (d === 0 || d === 180) iy -= 16; else ix += (d === 90 ? 26 : 26); }
  o += `<text x="${f(ix)}" y="${f(iy)}" font-size="15" fill="#1f2937" text-anchor="middle" font-weight="700">${d}°</text>\n`;
  o += `<text x="${f(ix)}" y="${f(iy + 16)}" font-size="14" fill="#6d28d9" text-anchor="middle">${rad}</text>\n`;
  // outside: the point
  const or = R + 16;
  let ox = cx + or * c, oy = cy - or * s + 5;
  let anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
  if (d === 90) { oy -= 8; ox += 34; anchor = 'middle'; }
  if (d === 270) { oy += 14; ox += 38; anchor = 'middle'; }
  if (d === 0) { oy += 20; ox += 2; }
  if (d === 180) { oy += 20; ox -= 2; }
  if (d === 60 || d === 120) oy -= 4;
  if (d === 240 || d === 300) oy += 10;
  o += `<text x="${f(ox)}" y="${f(oy)}" font-size="15" fill="#0f172a" text-anchor="${anchor}">${pt}</text>\n`;
}
o += `<circle cx="${cx}" cy="${cy}" r="3" fill="#1f2937"/>\n`;
o += `<text x="${cx}" y="${H-70}" font-size="15" fill="#5b6475" text-anchor="middle">Each point is (cos θ, sin θ). The radius is 1.</text>\n</svg>\n`;
return o;
}

// ── Types of angles: four panels, each angle drawn at the measure it prints ──
const ANGLES = [
  { name: 'Acute', deg: 50, rule: 'less than 90°' },
  { name: 'Right', deg: 90, rule: 'exactly 90°' },
  { name: 'Obtuse', deg: 130, rule: 'between 90° and 180°' },
  { name: 'Straight', deg: 180, rule: 'exactly 180°' },
];
function angleTypes() {
  const PW = 300, PH = 250, L = 105, AR = 34;
  let o = open(0, 0, PW * 2, PH * 2, 'Types of angles: acute, right, obtuse and straight');
  ANGLES.forEach((a, i) => {
    const ox = (i % 2) * PW, oy = Math.floor(i / 2) * PH;
    const vx = ox + (a.deg > 90 ? PW / 2 + 10 : PW / 2 - 50), vy = oy + 170;
    const t = a.deg * Math.PI / 180;
    const ex = vx + L * Math.cos(t), ey = vy - L * Math.sin(t);
    o += `<g data-angle="${a.name}" data-deg="${a.deg}">\n`;
    o += `<text x="${ox + PW / 2}" y="${oy + 34}" font-size="20" font-weight="700" fill="${INK}" text-anchor="middle">${a.name}</text>\n`;
    o += `<text x="${ox + PW / 2}" y="${oy + 56}" font-size="14.5" fill="${SOFT}" text-anchor="middle">${a.rule}</text>\n`;
    o += `<line data-ray="base" x1="${n1(vx)}" y1="${n1(vy)}" x2="${n1(vx + L)}" y2="${n1(vy)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>\n`;
    o += `<line data-ray="arm" x1="${n1(vx)}" y1="${n1(vy)}" x2="${n1(ex)}" y2="${n1(ey)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>\n`;
    if (a.deg === 90) {
      o += `<path d="M ${n1(vx + 20)} ${n1(vy)} V ${n1(vy - 20)} H ${n1(vx)}" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>\n`;
    } else {
      const ax = vx + AR * Math.cos(t), ay = vy - AR * Math.sin(t);
      o += `<path d="M ${n1(vx + AR)} ${n1(vy)} A ${AR} ${AR} 0 0 0 ${n1(ax)} ${n1(ay)}" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>\n`;
    }
    const m = t / 2, lr = a.deg === 90 ? 44 : AR + 22;
    o += `<text x="${n1(vx + lr * Math.cos(m))}" y="${n1(vy - lr * Math.sin(m) + 5)}" font-size="15" font-weight="700" fill="${ACCENT}" text-anchor="middle">${a.deg}°</text>\n`;
    o += `<circle cx="${n1(vx)}" cy="${n1(vy)}" r="4" fill="${INK}"/>\n</g>\n`;
  });
  o += `<line x1="${PW}" y1="14" x2="${PW}" y2="${PH * 2 - 14}" stroke="#e5e7eb"/>\n<line x1="14" y1="${PH}" x2="${PW * 2 - 14}" y2="${PH}" stroke="#e5e7eb"/>\n</svg>\n`;
  return o;
}

// ── Parts of a circle ──
function circleParts() {
  const cx = 300, cy = 270, R = 170;
  const at = (deg, r = R) => [cx + r * Math.cos(deg * Math.PI / 180), cy - r * Math.sin(deg * Math.PI / 180)];
  const P = (deg, r) => at(deg, r).map(n1).join(' ');
  let o = open(96, 70, 408, 470, 'Parts of a circle: center, radius, diameter, chord, arc and tangent');
  o += `<circle data-part="circle" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-width="2.5"/>\n`;
  // arc (highlighted) from 20° to 80°
  o += `<path data-part="arc" d="M ${P(20)} A ${R} ${R} 0 0 0 ${P(80)}" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round"/>\n`;
  // diameter through the center, 0°–180°
  const [d1x, d1y] = at(180), [d2x, d2y] = at(0);
  o += `<line data-part="diameter" x1="${n1(d1x)}" y1="${n1(d1y)}" x2="${n1(d2x)}" y2="${n1(d2y)}" stroke="#0f766e" stroke-width="3"/>\n`;
  // radius to 125°
  const [rx, ry] = at(125);
  o += `<line data-part="radius" x1="${cx}" y1="${cy}" x2="${n1(rx)}" y2="${n1(ry)}" stroke="#b45309" stroke-width="3"/>\n`;
  // chord 215°–320° (does not pass through the center)
  const [c1x, c1y] = at(215), [c2x, c2y] = at(320);
  o += `<line data-part="chord" x1="${n1(c1x)}" y1="${n1(c1y)}" x2="${n1(c2x)}" y2="${n1(c2y)}" stroke="#be185d" stroke-width="3"/>\n`;
  // tangent at 270° (touches at exactly one point, perpendicular to the radius there)
  const [tx, ty] = at(270);
  o += `<line data-part="tangent" x1="${n1(tx - 150)}" y1="${n1(ty)}" x2="${n1(tx + 150)}" y2="${n1(ty)}" stroke="#1d4ed8" stroke-width="3"/>\n`;
  o += `<circle cx="${n1(tx)}" cy="${n1(ty)}" r="4" fill="#1d4ed8"/>\n`;
  o += `<circle data-part="center" cx="${cx}" cy="${cy}" r="5" fill="${INK}"/>\n`;
  const T = (x, y, text, fill, anchor = 'middle') => `<text x="${n1(x)}" y="${n1(y)}" font-size="17" font-weight="700" fill="${fill}" text-anchor="${anchor}">${text}</text>\n`;
  o += T(cx + 6, cy + 24, 'center', INK, 'start');
  o += T(cx + 95, cy - 10, 'diameter', '#0f766e');
  const [rmx, rmy] = at(125, R / 2); o += T(rmx - 12, rmy - 6, 'radius', '#b45309', 'end');
  o += T((c1x + c2x) / 2 + 4, (c1y + c2y) / 2 - 10, 'chord', '#be185d');
  const [ax, ay] = at(50, R + 14); o += T(ax, ay, 'arc', ACCENT, 'start');
  o += T(tx + 150, ty + 24, 'tangent', '#1d4ed8', 'end');
  o += `<text x="${cx}" y="502" font-size="14.5" fill="${SOFT}" text-anchor="middle">A diameter is two radii.</text>\n<text x="${cx}" y="522" font-size="14.5" fill="${SOFT}" text-anchor="middle">The distance all the way around is the circumference.</text>\n</svg>\n`;
  return o;
}

// ── The coordinate plane ──
function coordinatePlane() {
  const cx = 300, cy = 300, U = 40, N = 6, PT = [3, 2];
  const X = (x) => cx + x * U, Y = (y) => cy - y * U;
  let o = open(24, 24, 552, 580, 'The coordinate plane: x-axis, y-axis, origin, the four quadrants and the point (3, 2)');
  for (let i = -N; i <= N; i++) {
    o += `<line x1="${X(i)}" y1="${Y(N)}" x2="${X(i)}" y2="${Y(-N)}" stroke="#e5e7eb"/>\n<line x1="${X(-N)}" y1="${Y(i)}" x2="${X(N)}" y2="${Y(i)}" stroke="#e5e7eb"/>\n`;
  }
  o += `<line x1="${X(-N) - 14}" y1="${cy}" x2="${X(N) + 14}" y2="${cy}" stroke="${INK}" stroke-width="2.5"/>\n<line x1="${cx}" y1="${Y(-N) + 14}" x2="${cx}" y2="${Y(N) - 14}" stroke="${INK}" stroke-width="2.5"/>\n`;
  o += `<path d="M ${X(N) + 14} ${cy} l -9 -5 v 10 z M ${X(-N) - 14} ${cy} l 9 -5 v 10 z M ${cx} ${Y(N) - 14} l -5 9 h 10 z M ${cx} ${Y(-N) + 14} l -5 -9 h 10 z" fill="${INK}"/>\n`;
  for (let i = -N; i <= N; i++) {
    if (!i) continue;
    o += `<text data-tick="x" x="${X(i)}" y="${cy + 17}" font-size="12.5" fill="${SOFT}" text-anchor="middle">${i < 0 ? '−' + -i : i}</text>\n`;
    o += `<text data-tick="y" x="${cx - 8}" y="${Y(i) + 4}" font-size="12.5" fill="${SOFT}" text-anchor="end">${i < 0 ? '−' + -i : i}</text>\n`;
  }
  o += `<text x="${X(N) + 12}" y="${cy - 10}" font-size="15" font-weight="700" fill="${INK}" text-anchor="end">x-axis</text>\n<text x="${cx + 10}" y="${Y(N) - 2}" font-size="15" font-weight="700" fill="${INK}">y-axis</text>\n`;
  o += `<text x="${cx + 7}" y="${cy + 17}" font-size="12.5" fill="${SOFT}">0</text>\n<line x1="${X(-1.5) + 4}" y1="${Y(-1.3) - 6}" x2="${cx - 5}" y2="${cy + 5}" stroke="${SOFT}" stroke-width="1.2"/>\n<text x="${X(-1.5)}" y="${Y(-1.3)}" font-size="14" fill="${SOFT}" text-anchor="end">origin (0, 0)</text>\n<circle data-origin="1" cx="${cx}" cy="${cy}" r="4" fill="${INK}"/>\n`;
  [['I', 1, 1, '(+, +)'], ['II', -1, 1, '(−, +)'], ['III', -1, -1, '(−, −)'], ['IV', 1, -1, '(+, −)']].forEach(([q, sx, sy, signs]) => {
    o += `<g data-quadrant="${q}" data-sx="${sx}" data-sy="${sy}"><text x="${X(sx * 4.4)}" y="${Y(sy * 4.6)}" font-size="19" font-weight="700" fill="${ACCENT}" text-anchor="middle">Quadrant ${q}</text><text x="${X(sx * 4.4)}" y="${Y(sy * 4.6) + 20}" font-size="14.5" fill="${ACCENT}" text-anchor="middle">${signs}</text></g>\n`;
  });
  o += `<path d="M ${X(PT[0])} ${cy} V ${Y(PT[1])} H ${cx}" fill="none" stroke="#b45309" stroke-width="2" stroke-dasharray="5 4"/>\n`;
  o += `<circle data-point="${PT.join(',')}" cx="${X(PT[0])}" cy="${Y(PT[1])}" r="5.5" fill="#b45309"/>\n<text x="${X(PT[0]) + 9}" y="${Y(PT[1]) - 9}" font-size="16" font-weight="700" fill="#b45309">(${PT[0]}, ${PT[1]})</text>\n`;
  o += `<text x="${cx}" y="592" font-size="14.5" fill="${SOFT}" text-anchor="middle">A point is (x, y): across first, then up or down.</text>\n</svg>\n`;
  return o;
}

// ── shared bits for the drawings below ──
const txt = (x, y, s, o = {}) => `<text x="${n1(x)}" y="${n1(y)}" font-size="${o.size || 15}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''} fill="${o.fill || INK}" text-anchor="${o.anchor || 'middle'}"${o.data ? ' ' + o.data : ''}>${s}</text>\n`;
const pts = (list) => list.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ');
const mid = ([x1, y1], [x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2];
// a short tick across the middle of a side (equal sides carry the same number)
function tick(a, b, count = 1) {
  const [mx, my] = mid(a, b); const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux; let o = '';
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 6; const cx = mx + ux * off, cy = my + uy * off;
    o += `<line x1="${n1(cx - nx * 7)}" y1="${n1(cy - ny * 7)}" x2="${n1(cx + nx * 7)}" y2="${n1(cy + ny * 7)}" stroke="${ACCENT}" stroke-width="2.5"/>\n`;
  }
  return o;
}
// the little square in a right-angle corner at `v`, toward `a` and `b`
function corner(v, a, b, s = 14) {
  const u = (p) => { const dx = p[0] - v[0], dy = p[1] - v[1], L = Math.hypot(dx, dy); return [dx / L * s, dy / L * s]; };
  const [ax, ay] = u(a), [bx, by] = u(b);
  return `<path d="M ${n1(v[0] + ax)} ${n1(v[1] + ay)} L ${n1(v[0] + ax + bx)} ${n1(v[1] + ay + by)} L ${n1(v[0] + bx)} ${n1(v[1] + by)}" fill="none" stroke="${ACCENT}" stroke-width="2"/>\n`;
}

// ── Types of triangles: three by their sides, three by their angles ──
// Vertices in panel units (y up); the test measures sides and angles from them.
const TRIANGLES = [
  { name: 'Equilateral', rule: '3 equal sides', v: [[0, 0], [120, 0], [60, 103.923]], ticks: [1, 1, 1] },
  { name: 'Isosceles', rule: '2 equal sides', v: [[10, 0], [110, 0], [60, 125]], ticks: [0, 2, 2] },
  { name: 'Scalene', rule: 'no equal sides', v: [[0, 0], [130, 0], [95, 85]], ticks: [0, 0, 0] },
  { name: 'Acute', rule: 'all angles less than 90°', v: [[0, 0], [125, 0], [50, 105]], ticks: [0, 0, 0] },
  { name: 'Right', rule: 'one angle of 90°', v: [[10, 0], [130, 0], [10, 100]], ticks: [0, 0, 0], right: 0 },
  { name: 'Obtuse', rule: 'one angle more than 90°', v: [[45, 0], [140, 0], [0, 80]], ticks: [0, 0, 0] },
];
function triangleTypes() {
  const PW = 220, PH = 235;
  let o = open(0, 0, PW * 3, PH * 2 + 34, 'Types of triangles: equilateral, isosceles and scalene by their sides; acute, right and obtuse by their angles');
  o += txt(PW * 1.5, 22, 'By their sides', { size: 14, fill: SOFT });
  o += txt(PW * 1.5, PH + 30, 'By their angles', { size: 14, fill: SOFT });
  TRIANGLES.forEach((t, i) => {
    const ox = (i % 3) * PW + 45, oy = Math.floor(i / 3) * (PH + 8) + 200;
    const P = t.v.map(([x, y]) => [ox + x, oy - y]);
    o += `<g data-tri="${t.name}">\n`;
    o += txt((i % 3) * PW + PW / 2, oy - 150, t.name, { size: 19, bold: true });
    o += txt((i % 3) * PW + PW / 2, oy - 131, t.rule, { size: 13.5, fill: SOFT });
    o += `<polygon points="${pts(P)}" fill="#f5f3ff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>\n`;
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b], k) => { if (t.ticks[k]) o += tick(P[a], P[b], t.ticks[k]); });
    if (t.right != null) o += corner(P[t.right], P[(t.right + 1) % 3], P[(t.right + 2) % 3]);
    o += '</g>\n';
  });
  return o + '</svg>\n';
}

// ── The Pythagorean theorem: a 3-4-5 triangle with a square on every side ──
function pythagorean() {
  const U = 34, A = [262, 262], B = [A[0] + 4 * U, A[1]], C = [A[0], A[1] - 3 * U]; // right angle at A
  const sq = (p, q, third) => { // the square on side p→q, on the side AWAY from the triangle's third corner
    const dx = q[0] - p[0], dy = q[1] - p[1]; let nx = -dy, ny = dx;
    if (nx * (third[0] - p[0]) + ny * (third[1] - p[1]) > 0) { nx = -nx; ny = -ny; }
    return [p, q, [q[0] + nx, q[1] + ny], [p[0] + nx, p[1] + ny]];
  };
  const center = (poly) => [poly.reduce((s, p) => s + p[0], 0) / 4, poly.reduce((s, p) => s + p[1], 0) / 4];
  let o = open(130, 8, 400, 470, 'The Pythagorean theorem: on a 3-4-5 right triangle the squares on the legs, 9 and 16, add up to the square on the hypotenuse, 25');
  const squares = [
    { side: 'a', n: 3, poly: sq(A, C, B), fill: '#fef3c7', stroke: '#b45309' },
    { side: 'b', n: 4, poly: sq(B, A, C), fill: '#ccfbf1', stroke: '#0f766e' },
    { side: 'c', n: 5, poly: sq(C, B, A), fill: '#ede9fe', stroke: ACCENT },
  ];
  for (const q of squares) {
    o += `<polygon data-square="${q.side}" data-unit="${U}" points="${pts(q.poly)}" fill="${q.fill}" stroke="${q.stroke}" stroke-width="2"/>\n`;
    const [mx, my] = center(q.poly);
    o += txt(mx, my - 2, `${q.side}² = ${q.n * q.n}`, { size: 18, bold: true, fill: q.stroke });
    o += txt(mx, my + 17, `${q.n} × ${q.n}`, { size: 13, fill: q.stroke });
  }
  o += `<polygon data-triangle="1" points="${pts([A, B, C])}" fill="#ffffff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>\n` + corner(A, B, C);
  o += txt(A[0] + 9, (A[1] + C[1]) / 2 + 12, 'a', { size: 15, italic: true, bold: true, anchor: 'start' });
  o += txt((A[0] + B[0]) / 2 - 6, A[1] - 8, 'b', { size: 15, italic: true, bold: true });
  const [hx, hy] = mid(B, C); o += txt(hx - 10, hy + 18, 'c', { size: 15, italic: true, bold: true });
  o += txt(330, 438, 'a² + b² = c²', { size: 21, bold: true });
  o += txt(330, 462, '9 + 16 = 25', { size: 17, fill: SOFT });
  return o + '</svg>\n';
}

// ── Slope: rise over run between two points of a line ──
function slopePicture() {
  const cx = 110, cy = 400, U = 52, P1 = [1, 1], P2 = [4, 3], N = 6, M = 5;
  const X = (x) => cx + x * U, Y = (y) => cy - y * U;
  const rise = P2[1] - P1[1], run = P2[0] - P1[0];
  let o = open(60, 96, 420, 400, `Slope: from (${P1}) to (${P2}) the line rises ${rise} and runs ${run}, so its slope is ${rise}/${run}`);
  for (let i = 0; i <= N; i++) o += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(M)}" stroke="#e5e7eb"/>\n`;
  for (let j = 0; j <= M; j++) o += `<line x1="${X(0)}" y1="${Y(j)}" x2="${X(N)}" y2="${Y(j)}" stroke="#e5e7eb"/>\n`;
  o += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(N) + 12}" y2="${Y(0)}" stroke="${INK}" stroke-width="2.5"/>\n<line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(M) - 12}" stroke="${INK}" stroke-width="2.5"/>\n`;
  for (let i = 1; i <= N; i++) o += txt(X(i), Y(0) + 18, i, { size: 12.5, fill: SOFT });
  for (let j = 1; j <= M; j++) o += txt(X(0) - 9, Y(j) + 4, j, { size: 12.5, fill: SOFT, anchor: 'end' });
  o += txt(X(N) + 8, Y(0) + 34, 'x', { italic: true, fill: SOFT }) + txt(X(0) - 26, Y(M) - 2, 'y', { italic: true, fill: SOFT });
  const m = rise / run, yAt = (x) => P1[1] + m * (x - P1[0]);
  o += `<line data-line="1" x1="${n1(X(0))}" y1="${n1(Y(yAt(0)))}" x2="${n1(X(N))}" y2="${n1(Y(yAt(N)))}" stroke="${INK}" stroke-width="3"/>\n`;
  o += `<line data-leg="run" x1="${X(P1[0])}" y1="${Y(P1[1])}" x2="${X(P2[0])}" y2="${Y(P1[1])}" stroke="#0f766e" stroke-width="4" stroke-dasharray="7 5"/>\n`;
  o += `<line data-leg="rise" x1="${X(P2[0])}" y1="${Y(P1[1])}" x2="${X(P2[0])}" y2="${Y(P2[1])}" stroke="#b45309" stroke-width="4" stroke-dasharray="7 5"/>\n`;
  for (const p of [P1, P2]) o += `<circle data-pt="${p.join(',')}" cx="${X(p[0])}" cy="${Y(p[1])}" r="6" fill="${ACCENT}"/>\n`;
  o += txt(X(P1[0]) - 8, Y(P1[1]) - 12, `(${P1[0]}, ${P1[1]})`, { size: 14.5, bold: true, fill: ACCENT, anchor: 'end' });
  o += txt(X(P2[0]) - 8, Y(P2[1]) - 12, `(${P2[0]}, ${P2[1]})`, { size: 14.5, bold: true, fill: ACCENT, anchor: 'end' });
  o += txt((X(P1[0]) + X(P2[0])) / 2, Y(P1[1]) + 22, `run = ${run}`, { size: 16, bold: true, fill: '#0f766e', data: `data-run="${run}"` });
  o += txt(X(P2[0]) + 10, (Y(P1[1]) + Y(P2[1])) / 2 + 5, `rise = ${rise}`, { size: 16, bold: true, fill: '#b45309', anchor: 'start', data: `data-rise="${rise}"` });
  o += txt(270, 476, `slope = rise ÷ run = ${rise}/${run}`, { size: 18, bold: true });
  return o + '</svg>\n';
}

// ── Graphing a line from y = mx + b: start at b, then count the slope ──
const GRAPHED = { b: 1, rise: 2, run: 3 }; // y = (2/3)x + 1
function graphALine() {
  const { b, rise, run } = GRAPHED; const cx = 300, cy = 300, U = 40, N = 6;
  const X = (x) => cx + x * U, Y = (y) => cy - y * U, f = (x) => b + rise / run * x;
  let o = open(24, 24, 552, 596, `Graphing the line y = (${rise}/${run})x + ${b}: start at the y-intercept ${b}, then count up ${rise} and right ${run} to the next point, and again`);
  for (let i = -N; i <= N; i++) o += `<line x1="${X(i)}" y1="${Y(N)}" x2="${X(i)}" y2="${Y(-N)}" stroke="#e5e7eb"/>\n<line x1="${X(-N)}" y1="${Y(i)}" x2="${X(N)}" y2="${Y(i)}" stroke="#e5e7eb"/>\n`;
  o += `<line x1="${X(-N) - 14}" y1="${cy}" x2="${X(N) + 14}" y2="${cy}" stroke="${INK}" stroke-width="2.5"/>\n<line x1="${cx}" y1="${Y(-N) + 14}" x2="${cx}" y2="${Y(N) - 14}" stroke="${INK}" stroke-width="2.5"/>\n`;
  for (let i = -N; i <= N; i++) { if (!i) continue; o += txt(X(i), cy + 17, i < 0 ? '−' + -i : i, { size: 12.5, fill: SOFT }) + txt(cx - 8, Y(i) + 4, i < 0 ? '−' + -i : i, { size: 12.5, fill: SOFT, anchor: 'end' }); }
  o += `<line data-line="1" x1="${n1(X(-N))}" y1="${n1(Y(f(-N)))}" x2="${n1(X(N))}" y2="${n1(Y(f(N)))}" stroke="${INK}" stroke-width="3"/>\n`;
  // two stairs: up `rise`, right `run`, twice — every point they land on is on the line
  const stops = [[0, b], [run, b + rise], [2 * run, b + 2 * rise]];
  for (let k = 0; k < 2; k++) {
    const [x0, y0] = stops[k], [x1, y1] = stops[k + 1];
    o += `<line data-stair="rise" x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x0)}" y2="${Y(y1)}" stroke="#b45309" stroke-width="4" stroke-dasharray="7 5"/>\n`;
    o += `<line data-stair="run" x1="${X(x0)}" y1="${Y(y1)}" x2="${X(x1)}" y2="${Y(y1)}" stroke="#0f766e" stroke-width="4" stroke-dasharray="7 5"/>\n`;
    o += txt(X(x0) - 9, (Y(y0) + Y(y1)) / 2 + 5, `up ${rise}`, { size: 14.5, bold: true, fill: '#b45309', anchor: 'end' });
    o += txt((X(x0) + X(x1)) / 2, Y(y1) - 9, `right ${run}`, { size: 14.5, bold: true, fill: '#0f766e' });
  }
  stops.forEach(([x, y], i) => { o += `<circle data-stop="${x},${y}" cx="${X(x)}" cy="${Y(y)}" r="${i ? 6 : 8}" fill="${i ? INK : ACCENT}"/>\n`; });
  o += txt(X(0) + 14, Y(b) + 24, `1. Start at the y-intercept: ${b}`, { size: 15, bold: true, fill: ACCENT, anchor: 'start' });
  o += txt(X(-5.8), Y(5.3), `2. Count the slope:`, { size: 15, bold: true, anchor: 'start' }) + txt(X(-5.8), Y(5.3) + 20, `up ${rise}, right ${run}`, { size: 15, bold: true, anchor: 'start' });
  o += txt(X(-5.8), Y(5.3) + 48, '3. Mark the point.', { size: 15, bold: true, anchor: 'start' }) + txt(X(-5.8), Y(5.3) + 68, 'Count again.', { size: 15, bold: true, anchor: 'start' });
  o += txt(300, 600, `y = (${rise}/${run})x + ${b} · slope ${rise}/${run} · y-intercept ${b}`, { size: 17, bold: true });
  return o + '</svg>\n';
}

// ── Special right triangles ──
function specialRightTriangles() {
  const U = 120;
  let o = open(0, 0, 640, 262, 'Special right triangles: 45-45-90 with sides 1, 1, √2 and 30-60-90 with sides 1, √3, 2');
  const draw = (name, ox, oy, legs, labels, angles) => {
    const A = [ox, oy], B = [ox + legs[0] * U, oy], C = [ox, oy - legs[1] * U]; // right angle at A
    let g = `<g data-special="${name}" data-unit="${U}">\n` + txt(ox + legs[0] * U / 2, oy - legs[1] * U - 22, name, { size: 20, bold: true });
    g += `<polygon points="${pts([A, B, C])}" fill="#f5f3ff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>\n` + corner(A, B, C);
    g += txt((A[0] + B[0]) / 2, A[1] + 22, labels[0], { size: 17, bold: true, fill: '#0f766e', data: 'data-side="base"' });
    g += txt(A[0] - 10, (A[1] + C[1]) / 2 + 5, labels[1], { size: 17, bold: true, fill: '#b45309', anchor: 'end', data: 'data-side="height"' });
    const [hx, hy] = mid(B, C); g += txt(hx + 12, hy - 6, labels[2], { size: 17, bold: true, fill: ACCENT, anchor: 'start', data: 'data-side="hyp"' });
    g += txt(B[0] - (legs[0] > 1 ? 58 : 40), B[1] - 7, angles[0], { size: 13.5, fill: SOFT, data: 'data-at="base"' });
    g += txt(C[0] + 7, C[1] + (legs[0] > 1 ? 30 : 42), angles[1], { size: 13.5, fill: SOFT, anchor: 'start', data: 'data-at="top"' });
    return g + '</g>\n';
  };
  o += draw('45°–45°–90°', 70, 196, [1, 1], ['1', '1', '√2'], ['45°', '45°']);
  o += draw('30°–60°–90°', 350, 196, [Math.sqrt(3), 1], ['√3', '1', '2'], ['30°', '60°']);
  o += txt(130, 246, 'legs equal · hypotenuse = leg × √2', { size: 13, fill: SOFT });
  o += txt(455, 246, 'short leg 1 · long leg √3 · hypotenuse 2', { size: 13, fill: SOFT });
  return o + '</svg>\n';
}

// ── The parts of a parabola, on y = x² − 2x − 3 ──
const PARABOLA = { a: 1, b: -2, c: -3 };
function parabolaParts() {
  const { a, b, c } = PARABOLA; const f = (x) => a * x * x + b * x + c;
  const cx = 250, cy = 210, U = 44; const X = (x) => cx + x * U, Y = (y) => cy - y * U;
  const h = -b / (2 * a), k = f(h), d = Math.sqrt(b * b - 4 * a * c), r1 = (-b - d) / (2 * a), r2 = (-b + d) / (2 * a);
  let o = open(40, 20, 480, 470, 'The parts of a parabola on y = x² − 2x − 3: vertex (1, −4), axis of symmetry x = 1, x-intercepts −1 and 3, y-intercept −3');
  for (let i = -4; i <= 6; i++) o += `<line x1="${X(i)}" y1="${Y(4)}" x2="${X(i)}" y2="${Y(-5)}" stroke="#e5e7eb"/>\n`;
  for (let j = -5; j <= 4; j++) o += `<line x1="${X(-4)}" y1="${Y(j)}" x2="${X(6)}" y2="${Y(j)}" stroke="#e5e7eb"/>\n`;
  o += `<line x1="${X(-4)}" y1="${cy}" x2="${X(6)}" y2="${cy}" stroke="${INK}" stroke-width="2"/>\n<line x1="${cx}" y1="${Y(-5)}" x2="${cx}" y2="${Y(4)}" stroke="${INK}" stroke-width="2"/>\n`;
  o += `<line data-axis="${h}" x1="${X(h)}" y1="${Y(4)}" x2="${X(h)}" y2="${Y(-5)}" stroke="#0f766e" stroke-width="2" stroke-dasharray="7 5"/>\n`;
  const path = []; for (let x = -1.8; x <= 3.8001; x += 0.1) path.push(`${n1(X(x))} ${n1(Y(f(x)))}`);
  o += `<path data-curve="1" d="M ${path.join(' L ')}" fill="none" stroke="${ACCENT}" stroke-width="3"/>\n`;
  const dot = (x, y, kind, fill) => `<circle data-key="${kind}" data-x="${x}" data-y="${y}" cx="${n1(X(x))}" cy="${n1(Y(y))}" r="6" fill="${fill}"/>\n`;
  o += dot(h, k, 'vertex', '#b45309') + dot(r1, 0, 'root', '#be185d') + dot(r2, 0, 'root', '#be185d') + dot(0, c, 'y-intercept', '#1d4ed8');
  o += txt(X(h) + 12, Y(k) + 24, `vertex (${h}, ${String(k).replace('-', '−')})`, { size: 15, bold: true, fill: '#b45309', anchor: 'start' });
  o += txt(X(r1) - 10, Y(0) - 12, `x-intercept ${String(r1).replace('-', '−')}`, { size: 14, bold: true, fill: '#be185d', anchor: 'end' });
  o += txt(X(r2) + 10, Y(0) - 12, `x-intercept ${r2}`, { size: 14, bold: true, fill: '#be185d', anchor: 'start' });
  o += txt(X(0) - 10, Y(c) + 5, `y-intercept ${String(c).replace('-', '−')}`, { size: 14, bold: true, fill: '#1d4ed8', anchor: 'end' });
  o += txt(X(h) + 8, Y(3.6), 'axis of', { size: 14, bold: true, fill: '#0f766e', anchor: 'start' }) + txt(X(h) + 8, Y(3.6) + 17, `symmetry x = ${h}`, { size: 14, bold: true, fill: '#0f766e', anchor: 'start' });
  o += txt(280, 472, 'y = x² − 2x − 3', { size: 18, bold: true });
  return o + '</svg>\n';
}

// ── The fraction wall: one whole cut into equal pieces, row by row ──
const WALL = [1, 2, 3, 4, 5, 6, 8, 10, 12];
function fractionWall() {
  const X0 = 20, W = 600, RH = 40, GAP = 6; const TINT = ['#ede9fe', '#ccfbf1', '#fef3c7', '#fce7f3', '#dbeafe', '#dcfce7', '#ffedd5', '#e0e7ff', '#fae8ff'];
  let o = open(0, 0, 640, WALL.length * (RH + GAP) + 54, 'The fraction wall: one whole cut into halves, thirds, quarters, fifths, sixths, eighths, tenths and twelfths');
  WALL.forEach((n, r) => {
    const y = 14 + r * (RH + GAP);
    for (let i = 0; i < n; i++) {
      const x = X0 + i * W / n;
      o += `<rect data-row="${n}" x="${n1(x)}" y="${y}" width="${n1(W / n)}" height="${RH}" fill="${TINT[r]}" stroke="${INK}" stroke-width="1.5"/>\n`;
      o += txt(x + W / n / 2, y + RH / 2 + 5, n === 1 ? '1 whole' : `1/${n}`, { size: n >= 10 ? 12 : 15, bold: n <= 4 });
    }
  });
  o += txt(320, WALL.length * (RH + GAP) + 38, 'Pieces that line up are equal: 1/2 = 2/4 = 3/6 = 4/8 = 5/10 = 6/12', { size: 14.5, fill: SOFT });
  return o + '</svg>\n';
}

// ── Place value ──
const PLACES = [['thousands', 1000], ['hundreds', 100], ['tens', 10], ['ones', 1], ['tenths', 0.1], ['hundredths', 0.01], ['thousandths', 0.001]];
const PLACE_DIGITS = [4, 5, 7, 2, 3, 8, 6]; // 4,572.386
function placeValue() {
  const CW = 96, X0 = 16, GAPX = 22; // GAPX is the room the decimal point takes
  let o = open(0, 0, X0 * 2 + CW * 7 + GAPX, 276, 'Place value: in 4,572.386 the 4 is 4 thousands, the 5 is 5 hundreds, the 7 is 7 tens, the 2 is 2 ones, the 3 is 3 tenths, the 8 is 8 hundredths and the 6 is 6 thousandths');
  PLACES.forEach(([name, value], i) => {
    const x = X0 + i * CW + (i >= 4 ? GAPX : 0), whole = i < 4;
    o += `<rect x="${x}" y="20" width="${CW}" height="44" fill="${whole ? '#ede9fe' : '#ccfbf1'}" stroke="${INK}" stroke-width="1.5"/>\n`;
    o += txt(x + CW / 2, 47, name, { size: 13.5, bold: true });
    o += `<rect x="${x}" y="64" width="${CW}" height="92" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>\n`;
    o += txt(x + CW / 2, 128, PLACE_DIGITS[i], { size: 52, bold: true, fill: whole ? ACCENT : '#0f766e', data: `data-digit="${PLACE_DIGITS[i]}" data-place="${value}"` });
    const worth = whole ? (PLACE_DIGITS[i] * value).toLocaleString('en-US') : (PLACE_DIGITS[i] * value).toFixed(i - 3);
    o += txt(x + CW / 2, 182, `${PLACE_DIGITS[i]} × ${whole ? value.toLocaleString('en-US') : value}`, { size: 12.5, fill: SOFT });
    o += txt(x + CW / 2, 202, `= ${worth}`, { size: 14, bold: true, data: `data-worth="${worth.replace(/,/g, '')}"` });
  });
  o += `<circle cx="${X0 + 4 * CW + GAPX / 2}" cy="140" r="6" fill="${INK}"/>\n`;
  o += txt(X0 + 4 * CW + GAPX / 2, 16, 'decimal point', { size: 11.5, fill: SOFT });
  o += txt((X0 * 2 + CW * 7 + GAPX) / 2, 250, 'Each place is worth 10 times the place to its right.', { size: 14.5, fill: SOFT });
  return o + '</svg>\n';
}

// ── Integers on the number line ──
function integerLine() {
  const cx = 360, cy = 120, U = 30, N = 10; const X = (v) => cx + v * U;
  let o = open(0, 0, 720, 222, 'The integers on a number line from −10 to 10: negatives to the left of zero, positives to the right, and −4 and 4 as opposites');
  o += `<line x1="${X(-N) - 22}" y1="${cy}" x2="${X(N) + 22}" y2="${cy}" stroke="${INK}" stroke-width="2.5"/>\n`;
  o += `<path d="M ${X(N) + 22} ${cy} l -9 -5 v 10 z M ${X(-N) - 22} ${cy} l 9 -5 v 10 z" fill="${INK}"/>\n`;
  for (let v = -N; v <= N; v++) {
    o += `<line x1="${X(v)}" y1="${cy - 8}" x2="${X(v)}" y2="${cy + 8}" stroke="${INK}" stroke-width="${v ? 1.5 : 3}"/>\n`;
    o += txt(X(v), cy + 28, v < 0 ? '−' + -v : v, { size: 13.5, bold: !v, fill: v < 0 ? '#be185d' : v > 0 ? '#0f766e' : INK, data: `data-tick="${v}"` });
  }
  o += txt(X(-5.5), cy + 58, '← negative numbers', { size: 15, bold: true, fill: '#be185d' });
  o += txt(X(5.5), cy + 58, 'positive numbers →', { size: 15, bold: true, fill: '#0f766e' });
  o += txt(X(0), cy + 58, 'zero', { size: 13.5, fill: SOFT });
  const OPP = 4;
  for (const s of [-1, 1]) {
    o += `<circle data-opposite="${s * OPP}" cx="${X(s * OPP)}" cy="${cy}" r="6" fill="${ACCENT}"/>\n`;
    o += `<path d="M ${X(0)} ${cy - 14} Q ${X(s * OPP / 2)} ${cy - 74} ${X(s * OPP)} ${cy - 14}" fill="none" stroke="${ACCENT}" stroke-width="2"/>\n`;
    o += txt(X(s * OPP / 2), cy - 52, `${OPP} steps`, { size: 12.5, fill: ACCENT });
  }
  o += txt(X(0), 30, `−${OPP} and ${OPP} are opposites: the same distance from zero`, { size: 14.5, bold: true, fill: ACCENT });
  o += txt(X(0), 208, 'Numbers get bigger as you move right.', { size: 14.5, fill: SOFT });
  return o + '</svg>\n';
}

// ── Angles made by a transversal ──
const ANGLE_PAIRS = [
  ['Corresponding', '1 &amp; 5 · 2 &amp; 6 · 3 &amp; 7 · 4 &amp; 8', 'equal'],
  ['Alternate interior', '3 &amp; 6 · 4 &amp; 5', 'equal'],
  ['Alternate exterior', '1 &amp; 8 · 2 &amp; 7', 'equal'],
  ['Same-side interior', '3 &amp; 5 · 4 &amp; 6', 'add to 180°'],
  ['Vertical', '1 &amp; 4 · 2 &amp; 3 · 5 &amp; 8 · 6 &amp; 7', 'equal'],
];
function transversalAngles() {
  const Y1 = 120, Y2 = 250, XL = 40, XR = 380, T = 65 * Math.PI / 180; // transversal at 65° to the parallels
  const xAt = (y) => 210 - (y - 185) / Math.tan(T); // crosses the middle at x = 210
  const I1 = [xAt(Y1), Y1], I2 = [xAt(Y2), Y2];
  let o = open(0, 0, 720, 380, 'Angles made when a transversal crosses two parallel lines, numbered 1 to 8, with the pairs: corresponding, alternate interior, alternate exterior, same-side interior and vertical');
  for (const [k, y] of [['upper', Y1], ['lower', Y2]]) {
    o += `<line data-parallel="${k}" x1="${XL}" y1="${y}" x2="${XR}" y2="${y}" stroke="${INK}" stroke-width="3"/>\n`;
    o += `<path d="M ${XR - 60} ${y - 7} l 9 7 l -9 7" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>\n`;
  }
  o += `<line data-transversal="1" x1="${n1(xAt(40))}" y1="40" x2="${n1(xAt(330))}" y2="330" stroke="#0f766e" stroke-width="3"/>\n`;
  o += txt(xAt(40) + 12, 50, 'transversal', { size: 13.5, fill: '#0f766e', anchor: 'start' });
  o += txt(XR - 8, Y1 - 12, 'parallel lines', { size: 13.5, fill: SOFT, anchor: 'end' });
  // 1 upper-left, 2 upper-right, 3 lower-left, 4 lower-right of the upper crossing; 5–8 the same at the lower one
  [[I1, 1], [I2, 5]].forEach(([[ix, iy], n]) => {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], k) => {
      const lean = -sy * 26 / Math.tan(T); // follow the transversal's lean so a number sits inside its angle
      o += txt(ix + lean + sx * 30, iy + sy * 24 + 6, n + k, { size: 18, bold: true, fill: ACCENT, data: `data-angle="${n + k}"` });
    });
  });
  ANGLE_PAIRS.forEach(([name, pairs, fact], i) => {
    const y = 62 + i * 62;
    o += txt(410, y, name, { size: 16, bold: true, anchor: 'start' });
    o += txt(410, y + 20, pairs, { size: 14, fill: ACCENT, anchor: 'start', data: `data-pairs="${name}"` });
    o += txt(704, y, fact, { size: 13.5, fill: fact === 'equal' ? '#0f766e' : '#b45309', anchor: 'end', bold: true });
  });
  return o + '</svg>\n';
}

// ── Area formulas ──
function areaFormulas() {
  const PW = 236, PH = 206;
  let o = open(0, 0, PW * 3, PH * 2, 'Area formulas: rectangle length times width, triangle half base times height, parallelogram base times height, trapezoid half the sum of the bases times height, circle pi r squared');
  const panel = (i, name, formula, body) => {
    const ox = (i % 3) * PW, oy = Math.floor(i / 3) * PH;
    return `<g data-shape="${name}" transform="translate(${ox} ${oy})">\n` + txt(PW / 2, 28, name, { size: 18, bold: true }) + body + txt(PW / 2, 190, formula, { size: 19, bold: true, fill: ACCENT, data: 'data-formula="1"' }) + '</g>\n';
  };
  const shape = (p) => `<polygon points="${pts(p)}" fill="#f5f3ff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>\n`;
  const dash = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#b45309" stroke-width="2" stroke-dasharray="5 4"/>\n`;
  const lab = (x, y, s, fill, anchor) => txt(x, y, s, { size: 15, italic: true, bold: true, fill, anchor });
  o += panel(0, 'Rectangle', 'A = l × w', shape([[48, 60], [188, 60], [188, 140], [48, 140]]) + lab(118, 158, 'l', '#0f766e') + lab(38, 105, 'w', '#b45309', 'end'));
  o += panel(1, 'Triangle', 'A = ½ × b × h', shape([[40, 145], [196, 145], [140, 55]]) + dash([140, 55], [140, 145]) + corner([140, 145], [140, 55], [196, 145], 10) + lab(118, 163, 'b', '#0f766e') + lab(132, 108, 'h', '#b45309', 'end'));
  o += panel(2, 'Parallelogram', 'A = b × h', shape([[36, 142], [166, 142], [200, 62], [70, 62]]) + dash([70, 62], [70, 142]) + corner([70, 142], [70, 62], [166, 142], 10) + lab(101, 160, 'b', '#0f766e') + lab(80, 108, 'h', '#b45309', 'start'));
  o += panel(3, 'Trapezoid', 'A = ½ × (b₁ + b₂) × h', shape([[34, 142], [202, 142], [162, 62], [82, 62]]) + dash([82, 62], [82, 142]) + corner([82, 142], [82, 62], [202, 142], 10) + lab(122, 54, 'b₁', '#0f766e') + lab(118, 160, 'b₂', '#0f766e') + lab(92, 108, 'h', '#b45309', 'start'));
  o += panel(4, 'Circle', 'A = π × r²', `<circle cx="118" cy="102" r="48" fill="#f5f3ff" stroke="${INK}" stroke-width="2.5"/>\n<line x1="118" y1="102" x2="166" y2="102" stroke="#b45309" stroke-width="2.5"/>\n<circle cx="118" cy="102" r="3.5" fill="${INK}"/>\n` + lab(142, 96, 'r', '#b45309'));
  o += panel(5, 'Square', 'A = s × s', shape([[73, 57], [163, 57], [163, 147], [73, 147]]) + lab(118, 165, 's', '#0f766e') + lab(63, 107, 's', '#0f766e', 'end'));
  for (const x of [PW, PW * 2]) o += `<line x1="${x}" y1="12" x2="${x}" y2="${PH * 2 - 12}" stroke="#e5e7eb"/>\n`;
  o += `<line x1="12" y1="${PH}" x2="${PW * 3 - 12}" y2="${PH}" stroke="#e5e7eb"/>\n`;
  return o + '</svg>\n';
}

// ── Parent functions: six small graphs, each curve sampled from its own rule ──
const PARENTS = [
  { name: 'Linear', rule: 'y = x', f: (x) => x, from: -4, to: 4 },
  { name: 'Quadratic', rule: 'y = x²', f: (x) => x * x, from: -2, to: 2 },
  { name: 'Absolute value', rule: 'y = |x|', f: (x) => Math.abs(x), from: -4, to: 4 },
  { name: 'Square root', rule: 'y = √x', f: (x) => Math.sqrt(x), from: 0, to: 4 },
  { name: 'Cubic', rule: 'y = x³', f: (x) => x * x * x, from: -1.58, to: 1.58 },
  { name: 'Exponential', rule: 'y = 2ˣ', f: (x) => Math.pow(2, x), from: -4, to: 2 },
];
function parentFunctions() {
  const PW = 220, PH = 236, U = 20, R = 4;
  let o = open(0, 0, PW * 3, PH * 2, 'Parent functions: linear, quadratic, absolute value, square root, cubic and exponential, each with its graph');
  PARENTS.forEach((p, i) => {
    const ox = (i % 3) * PW, oy = Math.floor(i / 3) * PH, cx = ox + PW / 2, cy = oy + 122;
    const X = (x) => cx + x * U, Y = (y) => cy - y * U;
    o += `<g data-fn="${p.name}" data-cx="${cx}" data-cy="${cy}" data-unit="${U}">\n` + txt(cx, oy + 26, p.name, { size: 17, bold: true }) + txt(cx, oy + 226, p.rule, { size: 17, bold: true, fill: ACCENT });
    for (let k = -R; k <= R; k++) o += `<line x1="${X(k)}" y1="${Y(R)}" x2="${X(k)}" y2="${Y(-R)}" stroke="#eef0f3"/>\n<line x1="${X(-R)}" y1="${Y(k)}" x2="${X(R)}" y2="${Y(k)}" stroke="#eef0f3"/>\n`;
    o += `<line x1="${X(-R)}" y1="${cy}" x2="${X(R)}" y2="${cy}" stroke="${INK}" stroke-width="1.5"/>\n<line x1="${cx}" y1="${Y(-R)}" x2="${cx}" y2="${Y(R)}" stroke="${INK}" stroke-width="1.5"/>\n`;
    const d = []; const steps = 80;
    for (let s = 0; s <= steps; s++) { const x = p.from + (p.to - p.from) * s / steps; d.push(`${(X(x)).toFixed(2)} ${(Y(p.f(x))).toFixed(2)}`); }
    o += `<path d="M ${d.join(' L ')}" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>\n</g>\n`;
  });
  for (const x of [PW, PW * 2]) o += `<line x1="${x}" y1="12" x2="${x}" y2="${PH * 2 - 12}" stroke="#e5e7eb"/>\n`;
  o += `<line x1="12" y1="${PH}" x2="${PW * 3 - 12}" y2="${PH}" stroke="#e5e7eb"/>\n`;
  return o + '</svg>\n';
}

const OUT = {
  'unit-circle.svg': unitCircle, 'angle-types.svg': angleTypes, 'circle-parts.svg': circleParts, 'coordinate-plane.svg': coordinatePlane,
  'triangle-types.svg': triangleTypes, 'pythagorean-theorem.svg': pythagorean, 'slope.svg': slopePicture, 'graph-a-line.svg': graphALine,
  'special-right-triangles.svg': specialRightTriangles, 'parabola-parts.svg': parabolaParts, 'fraction-wall.svg': fractionWall,
  'place-value.svg': placeValue, 'integer-number-line.svg': integerLine, 'transversal-angles.svg': transversalAngles,
  'area-formulas.svg': areaFormulas, 'parent-functions.svg': parentFunctions,
};
if (require.main === module) {
  const dir = path.join(__dirname, '..', 'public', 'images', 'concepts');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, build] of Object.entries(OUT)) fs.writeFileSync(path.join(dir, name), build());
}
module.exports = { OUT, GRAPHED, ANGLES, TRIANGLES, PARABOLA, WALL, PLACES, PLACE_DIGITS, ANGLE_PAIRS, PARENTS };
