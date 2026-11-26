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

const OUT = { 'unit-circle.svg': unitCircle, 'angle-types.svg': angleTypes, 'circle-parts.svg': circleParts, 'coordinate-plane.svg': coordinatePlane };
if (require.main === module) {
  const dir = path.join(__dirname, '..', 'public', 'images', 'concepts');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, build] of Object.entries(OUT)) fs.writeFileSync(path.join(dir, name), build());
}
module.exports = { OUT, ANGLES };
