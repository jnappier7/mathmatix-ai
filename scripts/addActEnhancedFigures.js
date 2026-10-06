// scripts/addActEnhancedFigures.js
//
// Give the act-enhanced bank its figures and tables.
//
//   node scripts/addActEnhancedFigures.js            # report only
//   node scripts/addActEnhancedFigures.js --write    # write the bank file
//
// The bank's 1,195 items shipped with no figure at all, so an assembled form
// averaged 1.9 visual items against about ten on an official form (external
// audit, 2026-10-05). Its items are templates with known numbers, so:
//
//   - DIAGRAM families (triangles, parallel lines, circles, solids, points on a
//     grid) keep their stem word for word and gain a figure drawn from those
//     numbers (utils/actFigures.js), labelled the way the ACT labels "the
//     figure below". Whatever the item asks for is "?" or "x°" in the figure.
//   - TABLE families (a two-way survey, a payout table) move their data out of
//     the sentence and into a table, which is how the ACT presents that data.
//     The stem changes; numbers, choices and key do not, and the explainer
//     reads both forms (utils/actItemExplainers.js).
//
// Pure file transform, no DB. Idempotent: figures are recomputed from the
// numbers every run (same numbers, same SVG), and a stem already in table form
// no longer matches its sentence pattern. contentHash is recomputed whenever
// the stem changes, by the same formula as scripts/ingestActEnhancedItems.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const F = require('../utils/actFigures');

const BANK = path.join(__dirname, '..', 'seeds', 'act-enhanced', 'act-items.generated.json');
const WRITE = process.argv.includes('--write');

const n = Number;
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Order matters only where two patterns could meet: the sector stem also
// begins "A circle has a radius of".
const FAMILIES = [
  {
    id: 'survey-table',
    re: /^In a survey of (\d+) students: (\d+) (\w+) and (\d+) (\w+) said yes; (\d+) \3 and (\d+) \5 said no\. (If a \w+ is selected at random, what is the probability that this student said (?:yes|no)\?)$/,
    stem: (m) => `The table below shows the results of a survey of ${m[1]} students.\n\nGrade | Yes | No\n${cap(m[3])} | ${m[2]} | ${m[6]}\n${cap(m[5])} | ${m[4]} | ${m[7]}\n\n${m[8]}`,
  },
  {
    id: 'payout-table',
    re: /^A game pays \$([\d.]+) with probability (\d+\/\d+), \$([\d.]+) with probability (\d+\/\d+), and \$([\d.]+) with probability (\d+\/\d+)\. (What is the expected payout\?)$/,
    stem: (m) => `The table below shows the possible payouts of a game and the probability of each.\n\nPayout | $${m[1]} | $${m[3]} | $${m[5]}\nProbability | ${m[2]} | ${m[4]} | ${m[6]}\n\n${m[7]}`,
  },
  { id: 'right-triangle-trig', re: /^In right triangle ABC, angle C is the right angle\. The side opposite angle A measures (\d+), the side adjacent to angle A measures (\d+), and the hypotenuse measures (\d+)\./, fig: (m) => F.rightTriangleTrig({ opp: n(m[1]), adj: n(m[2]), hyp: n(m[3]) }) },
  { id: 'ladder', re: /^A ladder (\d+) feet long leans against a wall, making a (\d+)° angle with the ground\./, fig: (m) => F.ladder({ length: n(m[1]), angle: n(m[2]) }) },
  { id: 'pythagorean-hyp', re: /^A right triangle has legs of length ([\d.]+) and ([\d.]+)\./, fig: (m) => F.pythagoreanHyp({ a: n(m[1]), b: n(m[2]) }) },
  { id: 'pythagorean-leg', re: /^A right triangle has a hypotenuse of ([\d.]+) and one leg of ([\d.]+)\./, fig: (m) => F.pythagoreanLeg({ hyp: n(m[1]), leg: n(m[2]) }) },
  { id: 'special-45', re: /^In a 45°-45°-90° triangle, each leg measures (\d+)\. What is the length of the hypotenuse\?/, fig: (m) => F.special45({ leg: n(m[1]) }) },
  { id: 'special-30-60', re: /^In a 30°-60°-90° triangle, the side opposite the 30° angle measures (\d+)\. What is the length of the (hypotenuse|longer leg)\?/, fig: (m) => F.special3060({ short: n(m[1]), asked: m[2] }) },
  { id: 'triangle-angles', re: /^Two angles of a triangle measure ([\d.]+)° and ([\d.]+)°\./, fig: (m) => F.triangleAngles({ a: n(m[1]), b: n(m[2]) }) },
  { id: 'similar-triangles', re: /^Triangle ABC is similar to triangle DEF\. Side AB measures ([\d.]+) and its corresponding side DE measures ([\d.]+)\. If side BC measures ([\d.]+), what is the length of side EF\?/, fig: (m) => F.similarTriangles({ ab: n(m[1]), de: n(m[2]), bc: n(m[3]) }) },
  { id: 'parallel-lines', re: /^Two parallel lines are cut by a transversal\. One angle measures ([\d.]+)°\. What is the measure of its (co-interior|alternate interior|corresponding|vertical)/, fig: (m) => F.parallelLines({ given: n(m[1]), relation: m[2] }) },
  { id: 'sector', re: /^A circle has a radius of ([\d.]+)\. A sector has a central angle of ([\d.]+)°\./, fig: (m) => F.sector({ r: n(m[1]), angle: n(m[2]) }) },
  { id: 'circle-radius', re: /^A circle has a radius of ([\d.]+)\. What is its (area|circumference)\?/, fig: (m) => F.circle({ value: n(m[1]), kind: 'radius' }) },
  { id: 'circle-garden', re: /^A circular garden has a (radius|diameter) of ([\d.]+) feet\./, fig: (m) => F.circle({ value: n(m[2]), kind: m[1], unit: 'ft' }) },
  { id: 'area-triangle', re: /^A triangle has a base of ([\d.]+) and a height of ([\d.]+)\. What is its area\?/, fig: (m) => F.areaShape({ shape: 'triangle', base: n(m[1]), height: n(m[2]) }) },
  { id: 'area-parallelogram', re: /^A parallelogram has a base of ([\d.]+) and a height of ([\d.]+)\. What is its area\?/, fig: (m) => F.areaShape({ shape: 'parallelogram', base: n(m[1]), height: n(m[2]) }) },
  { id: 'area-trapezoid', re: /^A trapezoid has parallel bases of ([\d.]+) and ([\d.]+) and a height of ([\d.]+)\. What is its area\?/, fig: (m) => F.areaShape({ shape: 'trapezoid', base: Math.max(n(m[1]), n(m[2])), top: Math.min(n(m[1]), n(m[2])), height: n(m[3]) }) },
  { id: 'line-two-points', re: /^What is the equation of the line through \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\) in slope-intercept form\?$/, fig: (m) => F.coordinate({ points: [['', n(m[1]), n(m[2])], ['', n(m[3]), n(m[4])]], connect: 'line' }) },
  { id: 'midpoint', re: /^What is the midpoint of the segment joining \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\?$/, fig: (m) => F.coordinate({ points: [['A', n(m[1]), n(m[2])], ['B', n(m[3]), n(m[4])]], connect: 'segment' }) },
  { id: 'distance', re: /^What is the distance between the points \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)\?$/, fig: (m) => F.coordinate({ points: [['A', n(m[1]), n(m[2])], ['B', n(m[3]), n(m[4])]], connect: 'segment' }) },
  { id: 'point-transform', re: /^The point \((-?\d+), (-?\d+)\) undergoes a (reflection over the (x-axis|y-axis|line y = x)|rotation of \d+° about the origin)\./, fig: (m) => F.coordinate({ points: [['P', n(m[1]), n(m[2])]], mirror: m[4] === 'line y = x' ? 'y=x' : undefined }) },
  { id: 'prism', re: /^(?:A rectangular prism has dimensions|What is the surface area of a rectangular prism measuring) ([\d.]+) by ([\d.]+) by ([\d.]+)/, fig: (m) => F.prism({ l: n(m[1]), w: n(m[2]), h: n(m[3]) }) },
  { id: 'cube', re: /^What is the surface area of a cube with edge length ([\d.]+)\?/, fig: (m) => F.prism({ l: n(m[1]), w: n(m[1]), h: n(m[1]) }) },
  { id: 'cylinder', re: /^(?:A cylinder has a radius of|What is the total surface area of a cylinder with radius) ([\d.]+) and (?:a )?height (?:of )?([\d.]+)/, fig: (m) => F.roundSolid({ kind: 'cylinder', r: n(m[1]), h: n(m[2]) }) },
  { id: 'cone', re: /^A cone has a radius of ([\d.]+) and a height of ([\d.]+)\./, fig: (m) => F.roundSolid({ kind: 'cone', r: n(m[1]), h: n(m[2]) }) },
  { id: 'sphere', re: /^A sphere has a radius of ([\d.]+)\./, fig: (m) => F.sphere({ r: n(m[1]) }) },
  { id: 'pyramid', re: /^A square pyramid has a base edge of ([\d.]+) and a height of ([\d.]+)\./, fig: (m) => F.pyramid({ edge: n(m[1]), height: n(m[2]) }) },
];

/** What this script would do to one item: { family, prompt?, svg?, figureAlt? } or null. */
function figureFor(item) {
  for (const fam of FAMILIES) {
    const m = String(item.prompt || '').match(fam.re);
    if (!m) continue;
    if (fam.stem) return { family: fam.id, prompt: fam.stem(m) };
    const { svg, alt } = fam.fig(m);
    return { family: fam.id, svg, figureAlt: alt };
  }
  return null;
}

function main() {
  const raw = fs.readFileSync(BANK, 'utf8');
  const items = JSON.parse(raw);
  const counts = {};
  let changed = 0;
  for (const item of items) {
    const f = figureFor(item);
    if (!f) continue;
    counts[f.family] = (counts[f.family] || 0) + 1;
    const before = JSON.stringify([item.prompt, item.svg, item.figureAlt]);
    if (f.prompt) {
      item.prompt = f.prompt;
      item.contentHash = crypto.createHash('sha256').update(`${item.problemId}|${item.prompt}|${item.answer.value}`).digest('hex');
    } else {
      item.svg = f.svg;
      item.figureAlt = f.figureAlt;
    }
    if (JSON.stringify([item.prompt, item.svg, item.figureAlt]) !== before) changed += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`act-enhanced: ${total} of ${items.length} items get a figure or table (${changed} changed this run)`);
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));
  if (WRITE) {
    fs.writeFileSync(BANK, JSON.stringify(items, null, 1) + (raw.endsWith('\n') ? '\n' : ''));
    console.log(`wrote ${BANK}`);
  } else {
    console.log('(report only — pass --write to update the bank)');
  }
}

if (require.main === module) main();

module.exports = { FAMILIES, figureFor };
