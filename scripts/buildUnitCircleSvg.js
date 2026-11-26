// Builds public/images/concepts/unit-circle.svg — the board's own reference
// picture for the unit circle (utils/safeImageSearch.js getStaticConceptImage).
// Positions are computed; rerun after any change:  node scripts/buildUnitCircleSvg.js
const fs = require('fs');
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
fs.writeFileSync(process.argv[2] || require('path').join(__dirname, '..', 'public', 'images', 'concepts', 'unit-circle.svg'), o);
