/**
 * The visual library (utils/visualLibrary.js): every picture and interactive
 * Mathmatix draws itself. Two promises are pinned here:
 *
 *   1. A library picture is RIGHT. Each file is read back from disk and its
 *      geometry and labels are checked against rules typed by hand in this
 *      file — never against the script that drew it.
 *   2. A library picture is the picture that was ASKED FOR. Matching is
 *      strict; a query about the student's own problem gets nothing.
 */
const fs = require('fs');
const path = require('path');
const lib = require('../../utils/visualLibrary');
const { getStaticConceptImage } = require('../../utils/safeImageSearch');
const IX = require('../../public/js/living-workspace/dom/interactives.js');

const DIR = path.join(__dirname, '../../public/images/concepts');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const num = (el, a) => +el.match(new RegExp(`\\b${a}="(-?[\\d.]+)"`))[1];
const tags = (svg, attr) => svg.match(new RegExp(`<[a-z]+ [^>]*${attr}[^>]*>`, 'g')) || [];
const polyPts = (el) => el.match(/points="([^"]+)"/)[1].split(' ').map((p) => p.split(',').map(Number));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = (p) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
const val = (t) => +String(t).replace(/−/g, '-');

describe('the registry', () => {
  test('every item has its file, and every file in the folder is an item', () => {
    const files = lib.ITEMS.map((it) => it.file).sort();
    expect(fs.readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort()).toEqual(files);
    expect(new Set(lib.ITEMS.map((it) => it.id)).size).toBe(lib.ITEMS.length);
    expect(lib.list()).toHaveLength(lib.ITEMS.length);
  });

  test('the files on disk are what the script builds (rerun node scripts/buildConceptSvgs.js)', () => {
    const { OUT } = require('../../scripts/buildConceptSvgs');
    expect(Object.keys(OUT).sort()).toEqual(lib.ITEMS.map((it) => it.file).sort());
    for (const [name, build] of Object.entries(OUT)) expect(read(name)).toBe(build());
  });

  test('every picture is well-formed, describes itself, and paints its own white ground', () => {
    for (const it of lib.ITEMS) {
      const svg = read(it.file);
      expect(svg).toMatch(/^<svg [^>]*role="img" aria-label="[^"]{20,}"/);
      expect(svg).toMatch(/<rect [^>]*fill="#ffffff"\/>/);
      expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);          // a bare & is a broken image
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg.trim().endsWith('</svg>')).toBe(true);
    }
  });

  test('every widget named is one the page can mount', () => {
    for (const it of lib.ITEMS) if (it.widget) expect(IX.has(it.widget)).toBe(true);
    expect(lib.ITEMS.filter((it) => it.widget).map((it) => it.widget).sort()).toEqual(IX.ids().sort());
  });

  test('the words the tutor is told to use find the picture they name', () => {
    for (const it of lib.ITEMS) {
      expect((lib.find(it.ask) || {}).id).toBe(it.id);
      expect((lib.find(`${it.ask} labeled diagram`) || {}).id).toBe(it.id);
      expect(lib.promptHint()).toContain(it.ask);
    }
    // the search route reaches the same list
    expect(getStaticConceptImage('unit circle labeled')).toMatchObject({ id: 'unit-circle', source: 'Mathmatix', widget: 'unit-circle' });
  });

  test('a query about the student\'s own problem gets no library picture', () => {
    for (const q of [
      'slope of the line through (2, 5) and (4, 9)', 'slope formula', 'positive and negative slope', 'slope intercept form',
      'pythagorean theorem 5 12 13', 'pythagorean theorem a = 6 b = 8', 'distance formula pythagorean',
      'equivalent fractions 2/4', 'fraction wall 3/8', 'number line -3 + 5', 'adding integers on a number line', 'inequality on a number line',
      'graph of y = x^2', 'parabola y = x^2 - 4x + 3 vertex labeled', 'parabola focus and directrix',
      'triangle with sides 3 4 5', 'area of a triangle', 'similar triangles', 'exterior angle of a triangle',
      'transversal angles 65 degrees find x', 'volume formulas', 'transformations of parent functions',
      'graph of line y=2x on coordinate plane', 'plotting points coordinate plane', 'reflection across the y-axis coordinate plane',
      'circle equation', 'inscribed angle circle chord arc', 'base ten blocks place value', 'angle', 'circle', 'triangle', 'slope', '',
    ]) expect(lib.find(q)).toBeNull();
  });
});

describe('the pictures are right', () => {
  test('types of triangles: each is the kind its name says', () => {
    const svg = read('triangle-types.svg');
    const groups = svg.split('<g data-tri=').slice(1);
    expect(groups).toHaveLength(6);
    for (const g of groups) {
      const name = g.match(/^"(\w+)"/)[1];
      const p = polyPts(g.match(/<polygon[^>]*>/)[0]);
      const sides = [dist(p[0], p[1]), dist(p[1], p[2]), dist(p[2], p[0])].sort((a, b) => a - b);
      const eq = (a, b) => Math.abs(a - b) < 0.6;
      const equalPairs = [eq(sides[0], sides[1]), eq(sides[1], sides[2])].filter(Boolean).length;
      const [a, b, c] = sides; const big = Math.acos((a * a + b * b - c * c) / (2 * a * b)) * 180 / Math.PI; // the largest angle
      if (name === 'Equilateral') expect(equalPairs).toBe(2);
      if (name === 'Isosceles') { expect(equalPairs).toBe(1); expect((g.match(/stroke-width="2.5"\/>\n<line/g) || []).length).toBeGreaterThan(0); }
      if (name === 'Scalene') expect(equalPairs).toBe(0);
      if (name === 'Acute') expect(big).toBeLessThan(89);
      if (name === 'Right') expect(Math.abs(big - 90)).toBeLessThan(0.2);
      if (name === 'Obtuse') expect(big).toBeGreaterThan(91);
    }
  });

  test('the Pythagorean theorem: the squares have the areas they print, and the two small ones make the big one', () => {
    const svg = read('pythagorean-theorem.svg');
    const printed = Object.fromEntries([...svg.matchAll(/>([abc])² = (\d+)</g)].map((m) => [m[1], +m[2]]));
    const drawn = {};
    for (const el of tags(svg, 'data-square')) {
      const u = num(el, 'data-unit'); drawn[el.match(/data-square="(\w)"/)[1]] = area(polyPts(el)) / (u * u);
    }
    for (const s of ['a', 'b', 'c']) expect(drawn[s]).toBeCloseTo(printed[s], 1);
    expect(printed.a + printed.b).toBe(printed.c);
    const t = polyPts(tags(svg, 'data-triangle')[0]);
    const sides = [dist(t[0], t[1]), dist(t[1], t[2]), dist(t[2], t[0])].sort((x, y) => x - y);
    expect(sides[0] ** 2 + sides[1] ** 2).toBeCloseTo(sides[2] ** 2, 3);
    // no square lies over the triangle: each square's far corners are on the other side of its side from the third corner
    expect(svg).toContain('>9 + 16 = 25<');
  });

  test('slope: the rise and run printed are the ones between the two points, and both points are on the line', () => {
    const svg = read('slope.svg');
    const [p1, p2] = tags(svg, 'data-pt').map((el) => ({ at: el.match(/data-pt="(-?\d+),(-?\d+)"/).slice(1).map(Number), px: [num(el, 'cx'), num(el, 'cy')] }));
    const rise = +svg.match(/data-rise="(-?\d+)"/)[1], run = +svg.match(/data-run="(-?\d+)"/)[1];
    expect(rise).toBe(p2.at[1] - p1.at[1]); expect(run).toBe(p2.at[0] - p1.at[0]);
    const unit = (p2.px[0] - p1.px[0]) / run;
    expect((p1.px[1] - p2.px[1]) / unit).toBeCloseTo(rise, 5);       // drawn to scale
    const line = tags(svg, 'data-line')[0]; const m = (num(line, 'y2') - num(line, 'y1')) / (num(line, 'x2') - num(line, 'x1'));
    for (const p of [p1, p2]) expect(num(line, 'y1') + m * (p.px[0] - num(line, 'x1'))).toBeCloseTo(p.px[1], 1);
    expect(svg).toContain(`slope = rise ÷ run = ${rise}/${run}`);
  });

  test('special right triangles: the sides are in the ratios printed on them', () => {
    const svg = read('special-right-triangles.svg');
    const VALUE = { 1: 1, 2: 2, '√2': Math.SQRT2, '√3': Math.sqrt(3) };
    const groups = svg.split('<g data-special=').slice(1);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      const u = +g.match(/data-unit="(\d+)"/)[1]; const [A, B, C] = polyPts(g.match(/<polygon[^>]*>/)[0]);
      const side = (k) => VALUE[g.match(new RegExp(`data-side="${k}">([^<]+)<`))[1]];
      expect(dist(A, B) / u).toBeCloseTo(side('base'), 3);
      expect(dist(A, C) / u).toBeCloseTo(side('height'), 3);
      expect(dist(B, C) / u).toBeCloseTo(side('hyp'), 3);
      const deg = (k) => +g.match(new RegExp(`data-at="${k}">(\\d+)°<`))[1];
      expect(Math.atan2(dist(A, C), dist(A, B)) * 180 / Math.PI).toBeCloseTo(deg('base'), 1);   // the angle at the end of the base
      expect(deg('base') + deg('top')).toBe(90);
    }
  });

  test('parts of a parabola: every labelled point is on y = x² − 2x − 3 and is what it is called', () => {
    const svg = read('parabola-parts.svg');
    const f = (x) => x * x - 2 * x - 3;
    const keys = tags(svg, 'data-key').map((el) => ({ kind: el.match(/data-key="([\w-]+)"/)[1], x: num(el, 'data-x'), y: num(el, 'data-y'), px: [num(el, 'cx'), num(el, 'cy')] }));
    expect(keys.map((k) => k.kind).sort()).toEqual(['root', 'root', 'vertex', 'y-intercept']);
    for (const k of keys) expect(f(k.x)).toBeCloseTo(k.y, 9);
    const vertex = keys.find((k) => k.kind === 'vertex');
    for (const x of [-1, 0, 2, 3]) expect(f(x)).toBeGreaterThan(vertex.y);                 // the lowest point
    expect(f(vertex.x - 1.5)).toBeCloseTo(f(vertex.x + 1.5), 9);                           // the axis of symmetry
    expect(num(tags(svg, 'data-axis')[0], 'data-axis')).toBe(vertex.x);
    keys.filter((k) => k.kind === 'root').forEach((k) => expect(k.y).toBe(0));
    expect(keys.find((k) => k.kind === 'y-intercept').x).toBe(0);
    // the curve itself: every point drawn is on the parabola (pixels → units from two known points)
    const r = keys.filter((k) => k.kind === 'root'); const unit = (r[1].px[0] - r[0].px[0]) / (r[1].x - r[0].x);
    const ox = r[0].px[0] - r[0].x * unit, oy = r[0].px[1];
    const d = tags(svg, 'data-curve')[0].match(/ d="M ([^"]+)"/)[1].split(' L ').map((p) => p.split(' ').map(Number));
    expect(d.length).toBeGreaterThan(40);
    for (const [px, py] of d) expect((oy - py) / unit).toBeCloseTo(f((px - ox) / unit), 0);
    expect(svg).toContain('vertex (1, −4)'); expect(svg).toContain('x-intercept −1'); expect(svg).toContain('x-intercept 3'); expect(svg).toContain('y-intercept −3');
  });

  test('the fraction wall: a row of n has n equal pieces that fill the whole, each named 1/n', () => {
    const svg = read('fraction-wall.svg');
    const rows = {};
    for (const el of tags(svg, 'data-row')) { const n = +el.match(/data-row="(\d+)"/)[1]; (rows[n] = rows[n] || []).push(num(el, 'width')); }
    expect(Object.keys(rows).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12]);
    const whole = rows[1][0];
    for (const [n, widths] of Object.entries(rows)) {
      expect(widths).toHaveLength(+n);
      widths.forEach((w) => expect(w * n).toBeCloseTo(whole, 0));
      if (+n > 1) expect((svg.match(new RegExp(`>1/${n}<`, 'g')) || []).length).toBe(+n);
    }
    // the equalities printed under it are true
    const chain = svg.match(/equal: ([^<]+)</)[1].split(' = ').map((f) => f.split('/').reduce((a, b) => a / b));
    chain.forEach((v) => expect(v).toBeCloseTo(0.5, 9));
  });

  test('place value: each digit is worth digit × place, and they add up to the number', () => {
    const svg = read('place-value.svg');
    const cells = [...svg.matchAll(/data-digit="(\d)" data-place="([\d.]+)">\d</g)].map((m) => ({ digit: +m[1], place: +m[2] }));
    const worth = [...svg.matchAll(/data-worth="([\d.]+)"/g)].map((m) => +m[1]);
    expect(cells.map((c) => c.place)).toEqual([1000, 100, 10, 1, 0.1, 0.01, 0.001]);
    cells.forEach((c, i) => expect(worth[i]).toBeCloseTo(c.digit * c.place, 9));
    const names = [...svg.matchAll(/font-weight="700"[^>]*>(\w+s)<\/text>/g)].map((m) => m[1]);
    expect(names).toEqual(['thousands', 'hundreds', 'tens', 'ones', 'tenths', 'hundredths', 'thousandths']);
    expect(worth.reduce((a, b) => a + b, 0)).toBeCloseTo(4572.386, 9);
    expect(svg).toContain('4,572.386');
  });

  test('integers on the number line: evenly spaced, in order, and the opposites are the same distance from zero', () => {
    const svg = read('integer-number-line.svg');
    const ticks = [...svg.matchAll(/<text x="([\d.]+)"[^>]*data-tick="(-?\d+)">([^<]+)</g)].map((m) => ({ x: +m[1], v: +m[2], shown: val(m[3]) }));
    expect(ticks.map((t) => t.v)).toEqual(Array.from({ length: 21 }, (_, i) => i - 10));
    const zero = ticks.find((t) => t.v === 0).x, step = ticks.find((t) => t.v === 1).x - zero;
    for (const t of ticks) { expect(t.shown).toBe(t.v); expect((t.x - zero) / step).toBeCloseTo(t.v, 9); }
    const opp = tags(svg, 'data-opposite').map((el) => ({ v: +el.match(/data-opposite="(-?\d+)"/)[1], x: num(el, 'cx') }));
    expect(opp[0].v).toBe(-opp[1].v);
    expect(zero - opp[0].x).toBeCloseTo(opp[1].x - zero, 9);
    opp.forEach((o) => expect((o.x - zero) / step).toBeCloseTo(o.v, 9));
  });

  test('angles on a transversal: every pair listed is the kind of pair it is listed under', () => {
    const svg = read('transversal-angles.svg');
    const yOf = (k) => num(tags(svg, `data-parallel="${k}"`)[0], 'y1'); const upper = yOf('upper'), lower = yOf('lower');
    const t = tags(svg, 'data-transversal')[0]; const xAt = (y) => num(t, 'x1') + (num(t, 'x2') - num(t, 'x1')) * (y - num(t, 'y1')) / (num(t, 'y2') - num(t, 'y1'));
    // where each number sits: which crossing, above or below its line, left or right of the transversal
    const at = {};
    for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*data-angle="(\d)"/g)) {
      const x = +m[1], y = +m[2] - 6, n = +m[3]; const line = Math.abs(y - upper) < Math.abs(y - lower) ? upper : lower;
      at[n] = { cross: line === upper ? 'U' : 'L', above: y < line, right: x > xAt(y), interior: y > upper && y < lower };
    }
    expect(Object.keys(at)).toHaveLength(8);
    const pairs = (name) => svg.match(new RegExp(`data-pairs="${name}">([^<]+)<`))[1].split(' · ').map((p) => p.split(' &amp; ').map(Number));
    const RULES = {
      Corresponding: (a, b) => a.cross !== b.cross && a.above === b.above && a.right === b.right,
      'Alternate interior': (a, b) => a.cross !== b.cross && a.interior && b.interior && a.right !== b.right,
      'Alternate exterior': (a, b) => a.cross !== b.cross && !a.interior && !b.interior && a.right !== b.right,
      'Same-side interior': (a, b) => a.cross !== b.cross && a.interior && b.interior && a.right === b.right,
      Vertical: (a, b) => a.cross === b.cross && a.above !== b.above && a.right !== b.right,
    };
    const COUNT = { Corresponding: 4, 'Alternate interior': 2, 'Alternate exterior': 2, 'Same-side interior': 2, Vertical: 4 };
    for (const [name, rule] of Object.entries(RULES)) {
      const list = pairs(name); expect(list).toHaveLength(COUNT[name]);        // and none is missing
      for (const [a, b] of list) expect(rule(at[a], at[b])).toBe(true);
    }
    expect(svg).toMatch(/Same-side interior[\s\S]{0,400}add to 180°/);
  });

  test('area formulas: each shape carries its own formula', () => {
    const svg = read('area-formulas.svg');
    const FORMULA = { Rectangle: 'A = l × w', Triangle: 'A = ½ × b × h', Parallelogram: 'A = b × h', Trapezoid: 'A = ½ × (b₁ + b₂) × h', Circle: 'A = π × r²', Square: 'A = s × s' };
    const groups = svg.split('<g data-shape=').slice(1);
    expect(groups).toHaveLength(6);
    for (const g of groups) {
      const name = g.match(/^"(\w+)"/)[1];
      expect(g.split('</g>')[0]).toContain(`data-formula="1">${FORMULA[name]}<`);
    }
    // the triangle's and parallelogram's heights are drawn perpendicular to the base (a vertical dash on a level base)
    expect((svg.match(/stroke-dasharray="5 4"/g) || []).length).toBe(3);
  });

  test('parent functions: every curve drawn is the function named under it', () => {
    const svg = read('parent-functions.svg');
    const FN = { Linear: (x) => x, Quadratic: (x) => x * x, 'Absolute value': Math.abs, 'Square root': Math.sqrt, Cubic: (x) => x ** 3, Exponential: (x) => 2 ** x };
    const RULE = { Linear: 'y = x', Quadratic: 'y = x²', 'Absolute value': 'y = |x|', 'Square root': 'y = √x', Cubic: 'y = x³', Exponential: 'y = 2ˣ' };
    const groups = svg.split('<g data-fn=').slice(1);
    expect(groups.map((g) => g.match(/^"([^"]+)"/)[1])).toEqual(Object.keys(FN));
    for (const g of groups) {
      const name = g.match(/^"([^"]+)"/)[1]; const cx = +g.match(/data-cx="([\d.]+)"/)[1], cy = +g.match(/data-cy="([\d.]+)"/)[1], u = +g.match(/data-unit="(\d+)"/)[1];
      const d = g.match(/<path d="M ([^"]+)"/)[1].split(' L ').map((p) => p.split(' ').map(Number));
      expect(d.length).toBeGreaterThan(50);
      for (const [px, py] of d) expect((cy - py) / u).toBeCloseTo(FN[name]((px - cx) / u), 1);
      expect(g).toContain(`>${RULE[name]}<`);
    }
  });
});

describe('the interactives compute what they show', () => {
  test('unit circle: exact values at the special angles, and they are really cos and sin', () => {
    const EXACT = { '0': 0, '1': 1, '1/2': 0.5, '√2/2': Math.SQRT1_2, '√3/2': Math.sqrt(3) / 2 };
    const value = (s) => (s[0] === '−' ? -1 : 1) * (EXACT[s.replace('−', '')] ?? NaN);
    for (const d of IX.SPECIAL) {
      const r = IX.unitCircleRead(d), t = d * Math.PI / 180;
      expect(value(r.cos)).toBeCloseTo(Math.cos(t), 9); expect(value(r.sin)).toBeCloseTo(Math.sin(t), 9);
      expect(r.cos).not.toBe('−0'); expect(r.sin).not.toBe('−0');
    }
    expect(IX.unitCircleRead(30)).toMatchObject({ rad: 'π/6', cos: '√3/2', sin: '1/2' });
    expect(IX.unitCircleRead(225)).toMatchObject({ rad: '5π/4', cos: '−√2/2', sin: '−√2/2' });
    expect(IX.unitCircleRead(137)).toMatchObject({ rad: null, cos: '−0.73', sin: '0.68', exact: false });
    expect(IX.unitCircleRead(-90).deg).toBe(270);
    // radians are the degrees over 180, reduced
    for (const [d, s] of [[0, '0'], [180, 'π'], [90, 'π/2'], [120, '2π/3'], [330, '11π/6'], [15, 'π/12']]) expect(IX.radLabel(d)).toBe(s);
  });

  test('a dragged angle snaps to a special angle when close, else to the nearest 5°', () => {
    expect(IX.snapAngle(28.4, IX.SPECIAL, 4)).toBe(30);
    expect(IX.snapAngle(358, IX.SPECIAL, 4)).toBe(0);
    expect(IX.snapAngle(72.6, IX.SPECIAL, 4)).toBe(75);
    expect(IX.snapAngle(-88, IX.SPECIAL, 4)).toBe(270);
  });

  test('angle maker names every measure', () => {
    const name = (d) => IX.angleKind(d).name;
    expect([0, 1, 89, 90, 91, 179, 180, 181, 359, 360].map(name)).toEqual(['Zero angle', 'Acute', 'Acute', 'Right', 'Obtuse', 'Obtuse', 'Straight', 'Reflex', 'Reflex', 'Full turn']);
  });

  test('slope: rise ÷ run as counted, reduced, signed; vertical is undefined; never a decimal', () => {
    expect(IX.slopeRead([-2, -1], [1, 1])).toMatchObject({ rise: 2, run: 3, slope: '2/3', kind: 'positive' });
    expect(IX.slopeRead([1, 1], [-2, 3])).toMatchObject({ rise: 2, run: -3, slope: '−2/3', kind: 'negative' });
    expect(IX.slopeRead([0, 0], [2, 4])).toMatchObject({ slope: '2' });
    expect(IX.slopeRead([0, 0], [-2, -4])).toMatchObject({ slope: '2', kind: 'positive' });
    expect(IX.slopeRead([3, 2], [-1, 2])).toMatchObject({ slope: '0', kind: 'zero' });
    expect(IX.slopeRead([1, 1], [1, 4])).toMatchObject({ kind: 'undefined' });
    expect(IX.slopeRead([1, 1], [1, 1]).same).toBe(true);
    for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
      const r = IX.slopeRead([0, 0], [a, b]);
      expect(r.text).not.toMatch(/\d\.\d/);
      if (r.slope) { const [n, m] = r.slope.replace('−', '-').split('/').map(Number); expect(n / (m || 1)).toBeCloseTo(b / a, 9); }
    }
  });

  test('coordinate plane: quadrant, axis and origin, and which way to go', () => {
    expect(IX.pointRead(3, 2).text).toBe('(3, 2) — Quadrant I: 3 right, then 2 up');
    expect(IX.pointRead(-3, 2).where).toBe('Quadrant II');
    expect(IX.pointRead(-3, -2).where).toBe('Quadrant III');
    expect(IX.pointRead(3, -2).text).toBe('(3, −2) — Quadrant IV: 3 right, then 2 down');
    expect(IX.pointRead(0, 4).where).toBe('on the y-axis');
    expect(IX.pointRead(-5, 0).where).toBe('on the x-axis');
    expect(IX.pointRead(0, 0).where).toBe('the origin');
  });

  test('fraction bars: shaded never exceeds the pieces, 1 to 12 pieces, and no comparison sign or decimal is printed', () => {
    expect(IX.fractionRead(3, 4)).toMatchObject({ n: 3, d: 4, text: '3/4' });
    expect(IX.fractionRead(9, 4)).toMatchObject({ n: 4, d: 4 });
    expect(IX.fractionRead(1, 40)).toMatchObject({ d: 12 });
    expect(IX.fractionRead(-2, 0)).toMatchObject({ n: 0, d: 1 });
    const src = fs.readFileSync(path.join(__dirname, '../../public/js/living-workspace/dom/interactives.js'), 'utf8');
    const body = src.slice(src.indexOf('function fractions(host)'), src.indexOf('const WIDGETS'));
    expect(body).not.toMatch(/[<>]=?\s*['"`]|toFixed|is (greater|less|bigger|smaller)|equivalent/i);
  });
});
