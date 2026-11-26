/**
 * The visual library — every picture and interactive Mathmatix draws itself.
 *
 * One list. The board's `image` card, the in-message image tag and the
 * browsable page (/visual-library) all read it, so a picture exists in one
 * place and is the same everywhere.
 *
 * WHY IT EXISTS: an image card used to be a web image search, and a search
 * returns whatever an educational site happens to have — a unit-circle lesson
 * got a cosmology plot (owner's phone, 2026-11-26). A library item is drawn by
 * scripts/buildConceptSvgs.js with every position computed, and read back and
 * checked in tests/unit/visualLibrary.test.js, so it cannot be the wrong
 * picture or a wrong one.
 *
 * MATCHING IS STRICT ON PURPOSE. An item answers only a query that is plainly
 * asking for THAT reference picture (`is`), and stands down for a query about
 * something more specific than it shows (`not`) — usually the student's own
 * problem: "slope of the line through (2, 5) and (4, 9)" must not get our
 * rise-2-run-3 picture. A miss falls through to search, which now shows a
 * result only when it is about the query; a wrong match would be a wrong
 * picture. When in doubt, add to `not`.
 *
 * `widget` names an interactive in public/js/living-workspace/dom/
 * interactives.js — the card offers it behind an "Explore it" button.
 *
 * To add one: a builder in scripts/buildConceptSvgs.js, an entry here, a check
 * in the test. Look at it in a browser at phone width before committing.
 */
const fs = require('fs');
const path = require('path');

const DIR = '/images/concepts/';
const count = (q, re) => (q.match(re) || []).length;

const ITEMS = [
  // ── Number sense ──
  {
    id: 'place-value', title: 'Place value', topic: 'Number sense', file: 'place-value.svg',
    blurb: 'Thousands down to thousandths, with what each digit is worth.',
    ask: 'place value chart',
    is: (q) => /\bplace[- ]value\b/.test(q),
    not: (q) => /\bblocks?\b|\bbase[- ]ten\b|\bdisks?\b/.test(q),
  },
  {
    id: 'integer-number-line', title: 'Integers on the number line', topic: 'Number sense', file: 'integer-number-line.svg',
    blurb: 'Negatives, zero, positives, and what opposites are.',
    ask: 'integers on a number line',
    is: (q) => /\bnumber line\b/.test(q) && /\b(integers?|negatives?|negative numbers?|opposites?|positive and negative)\b/.test(q),
    not: (q) => /[=+×÷]|\d\s*[-−]\s*\d|\b(add\w*|subtract\w*|sum|difference|inequalit\w*|fractions?|decimals?)\b/.test(q),
  },
  {
    id: 'fraction-wall', title: 'The fraction wall', topic: 'Number sense', file: 'fraction-wall.svg', widget: 'fractions',
    blurb: 'One whole cut into halves through twelfths; pieces that line up are equal.',
    ask: 'fraction wall',
    is: (q) => /\bfraction (wall|strips?|chart|tiles)\b|\bequivalent fractions?\b/.test(q),
    not: (q) => /\d/.test(q),
  },
  // ── Geometry ──
  {
    id: 'angle-types', title: 'Types of angles', topic: 'Geometry', file: 'angle-types.svg', widget: 'angle',
    blurb: 'Acute, right, obtuse and straight, each drawn at its measure.',
    ask: 'types of angles',
    is: (q) => /\b(types?|kinds?) of angles?\b|\bangle types?\b/.test(q)
      || (/\bangles?\b/.test(q) && count(q, /\b(acute|right|obtuse|straight)\b/g) >= 2),
    not: (q) => /\btriang|\bpolygon|\bparallel|\btransversal/.test(q),
  },
  {
    id: 'triangle-types', title: 'Types of triangles', topic: 'Geometry', file: 'triangle-types.svg',
    blurb: 'By their sides and by their angles.',
    ask: 'types of triangles',
    is: (q) => /\b(types?|kinds?) of triangles?\b|\btriangle types?\b|\bclassif\w+ triangles?\b/.test(q)
      || (/\btriangles?\b/.test(q) && count(q, /\b(equilateral|isosceles|scalene)\b/g) >= 2),
    not: (q) => /\bspecial\b|\bcongru|\bsimilar|\bpythag|\barea\b|\d/.test(q),
  },
  {
    id: 'transversal-angles', title: 'Angles on a transversal', topic: 'Geometry', file: 'transversal-angles.svg',
    blurb: 'The eight angles and the pairs: corresponding, alternate, same-side, vertical.',
    ask: 'parallel lines cut by a transversal',
    is: (q) => /\btransversal\b|\b(alternate|corresponding|same[- ]side|co-?interior|consecutive) (interior |exterior )?angles?\b/.test(q),
    not: (q) => /\d|=/.test(q),
  },
  {
    id: 'circle-parts', title: 'Parts of a circle', topic: 'Geometry', file: 'circle-parts.svg',
    blurb: 'Center, radius, diameter, chord, arc and tangent.',
    ask: 'parts of a circle',
    is: (q) => /\bparts? of (a |the )?circle\b|\bcircle parts?\b/.test(q)
      || (/\bcircles?\b/.test(q) && count(q, /\b(radius|diameter|chord|tangent|arc|circumference)\b/g) >= 2),
    not: (q) => /\bunit circle\b|\bequation|\bformula|\btheorem|\binscribed|\bsector|\barea\b/.test(q),
  },
  {
    id: 'area-formulas', title: 'Area formulas', topic: 'Geometry', file: 'area-formulas.svg',
    blurb: 'Rectangle, square, triangle, parallelogram, trapezoid and circle.',
    ask: 'area formulas',
    is: (q) => /\barea formulas?\b|\bformulas? for (the )?area\b/.test(q),
    not: (q) => /\bvolume|\bsurface/.test(q),
  },
  {
    id: 'pythagorean-theorem', title: 'The Pythagorean theorem', topic: 'Geometry', file: 'pythagorean-theorem.svg',
    blurb: 'A 3-4-5 triangle with a square on every side: 9 + 16 = 25.',
    ask: 'Pythagorean theorem',
    is: (q) => /\bpythagor/.test(q),
    not: (q) => /\d|=|\bconverse\b|\bdistance\b|\btriples?\b|\b3d\b/.test(q),
  },
  {
    id: 'special-right-triangles', title: 'Special right triangles', topic: 'Geometry', file: 'special-right-triangles.svg',
    blurb: '45-45-90 and 30-60-90 with their side ratios.',
    ask: 'special right triangles',
    is: (q) => /\bspecial right triangles?\b|\b45\D{0,3}45\D{0,3}90\b|\b30\D{0,3}60\D{0,3}90\b/.test(q),
  },
  // ── Graphs and functions ──
  {
    id: 'coordinate-plane', title: 'The coordinate plane', topic: 'Graphs and functions', file: 'coordinate-plane.svg', widget: 'coordinate-plane',
    blurb: 'Axes, origin, the four quadrants and how a point is read.',
    ask: 'coordinate plane',
    is: (q) => /\b(coordinate|cartesian) (plane|grid|system)\b|\bquadrants?\b/.test(q),
    not: (q) => /[=\d]|\b(lines?|slope|parabola|functions?|plot\w*|graphing|transformations?|reflections?|rotations?|translations?|dilations?|distance|midpoint|inequalit\w*|systems? of)\b/.test(q),
  },
  {
    id: 'slope', title: 'Slope: rise over run', topic: 'Graphs and functions', file: 'slope.svg', widget: 'slope',
    blurb: 'Two points on a line, the rise, the run, and the slope they make.',
    ask: 'slope rise over run',
    is: (q) => /\brise over run\b|\brise and run\b|\bslope triangle\b|\bwhat (is|slope is) slope\b|\bslope (diagram|definition|concept|meaning)\b|\bmeaning of slope\b/.test(q),
    not: (q) => /[=\d]|\bintercept|\bformula|\bparallel|\bperpendicular|\b(positive|negative|zero|undefined)\b/.test(q),
  },
  {
    id: 'parabola-parts', title: 'Parts of a parabola', topic: 'Graphs and functions', file: 'parabola-parts.svg',
    blurb: 'Vertex, axis of symmetry and the intercepts, on y = x² − 2x − 3.',
    ask: 'parts of a parabola',
    is: (q) => /\bparts? of (a |the )?parabola\b|\bparabola (parts|anatomy|features)\b/.test(q)
      || (/\bparabola\b/.test(q) && /\b(vertex|axis of symmetry)\b/.test(q) && /\blabell?ed\b|\bdiagram\b/.test(q)),
    not: (q) => /[=\d]|\bfocus\b|\bdirectrix\b/.test(q),
  },
  {
    id: 'parent-functions', title: 'Parent functions', topic: 'Graphs and functions', file: 'parent-functions.svg',
    blurb: 'Linear, quadratic, absolute value, square root, cubic and exponential.',
    ask: 'parent functions',
    is: (q) => /\bparent functions?\b|\bfunction famil(y|ies)\b|\bfamil(y|ies) of functions\b/.test(q),
    not: (q) => /[=\d]|\btransform/.test(q),
  },
  // ── Trigonometry ──
  {
    id: 'unit-circle', title: 'The unit circle', topic: 'Trigonometry', file: 'unit-circle.svg', widget: 'unit-circle',
    blurb: 'Sixteen angles in degrees and radians with their (cos, sin) coordinates.',
    ask: 'unit circle',
    is: (q) => /\bunit circle\b/.test(q),
  },
];

const onDisk = new Map(); // file → boolean, for the life of the process
function exists(file) {
  if (!onDisk.has(file)) onDisk.set(file, fs.existsSync(path.join(__dirname, '..', 'public', 'images', 'concepts', file)));
  return onDisk.get(file);
}

const publicShape = (it) => ({
  id: it.id, title: it.title, topic: it.topic, blurb: it.blurb,
  url: DIR + it.file, source: 'Mathmatix', ...(it.widget ? { widget: it.widget } : {}),
});

/** The library item a picture query is asking for, or null. Never a file that is not on disk. */
function find(query) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return null;
  for (const it of ITEMS) {
    if (it.is(q) && !(it.not && it.not(q)) && exists(it.file)) return publicShape(it);
  }
  return null;
}

/** Every item, in browsing order (the page groups them by `topic`). */
const list = () => ITEMS.filter((it) => exists(it.file)).map(publicShape);

/** One line for a board prompt: the pictures a tutor can ask for by name. */
const promptHint = () => `Built-in pictures (ours, always correct — use these words as the query): ${ITEMS.map((it) => it.ask).join('; ')}.`;

module.exports = { ITEMS, find, list, promptHint };
