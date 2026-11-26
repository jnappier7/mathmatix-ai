/**
 * Owner's phone, 2026-11-26. "Teach me some unit circle stuff" — the tutor
 * said "I've put a labeled circle on the board" and the board showed:
 *
 *   PICTURE  a cosmology plot of the expanding universe (the first result the
 *            image search returned; nothing checked that it was about the query)
 *   PROBLEM  the tutor's sentence with every backslash stripped —
 *            "for angle ( theta ), the point on the circle is ( ( cos theta, …"
 *
 * A wrong picture is worse than none, and math is typeset or it is not shown.
 */
process.env.WORK_BOARD = 'on';

const fs = require('fs');
const path = require('path');
const { getStaticConceptImage, relevantResults } = require('../../utils/safeImageSearch');
const synth = require('../../utils/pipeline/boardSynthesizer');
const ImageElement = require('../../public/js/living-workspace/dom/imageElement.js');

const COSMOLOGY = { url: 'https://upload.wikimedia.org/x.png', title: 'Friedmann universes Omega M 0.3 Omega Lambda 0.7', source: 'Wikimedia Commons' };

describe('the picture', () => {
  test('every way a tutor asks for the unit circle gets OUR drawing, not a search', () => {
    for (const q of ['unit circle labeled', 'unit circle trigonometry labeled radians degrees', 'Unit Circle diagram']) {
      const img = getStaticConceptImage(q);
      expect(img).toMatchObject({ url: '/images/concepts/unit-circle.svg', source: 'Mathmatix' });
    }
    // …and the file is really there (the map used to point at files never shipped).
    expect(fs.existsSync(path.join(__dirname, '../../public/images/concepts/unit-circle.svg'))).toBe(true);
  });

  test('the drawing is right: sixteen angles, each with its own coordinates', () => {
    const svg = fs.readFileSync(path.join(__dirname, '../../public/images/concepts/unit-circle.svg'), 'utf8');
    const R = 200, cx = 360, cy = 360;
    const val = (t) => {
      const m = t.replace(/−/g, '-').match(/^(-?)(?:√(\d)\/(\d)|(\d)\/(\d)|(\d))$/);
      const n = m[2] ? Math.sqrt(+m[2]) / +m[3] : m[4] ? +m[4] / +m[5] : +m[6];
      return m[1] ? -n : n;
    };
    const dots = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4.5"/g)].map((m) => [(+m[1] - cx) / R, (cy - +m[2]) / R]);
    const labels = [...svg.matchAll(/>\((.+?), (.+?)\)<\/text>/g)].map((m) => [val(m[1]), val(m[2])]);
    expect(dots).toHaveLength(16);
    expect(labels).toHaveLength(16);
    dots.forEach(([x, y], i) => {
      expect(labels[i][0]).toBeCloseTo(x, 2);
      expect(labels[i][1]).toBeCloseTo(y, 2);
      expect(x * x + y * y).toBeCloseTo(1, 2);
    });
    // It paints its own ground: the chat panel behind it may be dark.
    expect(svg).toMatch(/<rect[^>]+fill="#ffffff"/);
  });

  test('a search result that is not about the query is not shown — server and card agree', () => {
    const unitCircle = { url: 'https://upload.wikimedia.org/u.svg', title: 'Unit_circle_angles_color', source: 'Wikimedia Commons' };
    expect(relevantResults([COSMOLOGY], 'sine wave graph')).toEqual([]);
    expect(relevantResults([COSMOLOGY, unitCircle], 'unit circle labeled')).toEqual([unitCircle]);
    expect(ImageElement.pickResult([COSMOLOGY], 'sine wave graph')).toBeNull();
    expect(ImageElement.pickResult([COSMOLOGY, unitCircle], 'unit circle labeled')).toEqual(unitCircle);
  });

  test('a query with nothing to judge by keeps what the search found', () => {
    expect(relevantResults([COSMOLOGY], 'pi')).toEqual([COSMOLOGY]);
  });
});

describe('the other drawings of ours', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../public/images/concepts', f), 'utf8');
  const num = (el, a) => +el.match(new RegExp(`\\b${a}="(-?[\\d.]+)"`))[1];
  const tag = (svg, attr) => svg.match(new RegExp(`<[a-z]+ ${attr}[^>]*>`))[0];

  test('the files on disk are what the script builds', () => {
    const { OUT } = require('../../scripts/buildConceptSvgs');
    for (const [name, build] of Object.entries(OUT)) expect(read(name)).toBe(build());
  });

  test('each answers only a query that is asking for that picture', () => {
    const url = (q) => (getStaticConceptImage(q) || {}).url || null;
    expect(url('acute right obtuse angles labeled')).toBe('/images/concepts/angle-types.svg');
    expect(url('types of angles')).toBe('/images/concepts/angle-types.svg');
    expect(url('parts of a circle labeled')).toBe('/images/concepts/circle-parts.svg');
    expect(url('circle radius diameter chord')).toBe('/images/concepts/circle-parts.svg');
    expect(url('coordinate plane quadrants labeled')).toBe('/images/concepts/coordinate-plane.svg');
    for (const q of ['exterior angle of a triangle', 'right triangle angles',
      'area of a circle', 'circle equation', 'inscribed angle circle chord arc', 'angle', 'circle', 'triangle',
      'graph of line y=2x on coordinate plane', 'coordinate plane reflection', 'plotting points coordinate plane', 'slope on the coordinate plane']) {
      expect(url(q)).toBeNull();
    }
  });

  test('types of angles: every angle is drawn at the measure it prints, under the right name', () => {
    const svg = read('angle-types.svg');
    const groups = svg.split('<g data-angle=').slice(1);
    expect(groups).toHaveLength(4);
    const kind = (d) => (d < 90 ? 'Acute' : d === 90 ? 'Right' : d < 180 ? 'Obtuse' : 'Straight');
    for (const g of groups) {
      const name = g.match(/^"(\w+)"/)[1];
      const printed = +g.match(/>(\d+)°<\/text>/)[1];
      const ray = (r) => { const l = tag(g, `data-ray="${r}"`); return [num(l, 'x2') - num(l, 'x1'), num(l, 'y1') - num(l, 'y2')]; };
      const [bx, by] = ray('base'), [ax, ay] = ray('arm');
      const drawn = Math.acos((bx * ax + by * ay) / (Math.hypot(bx, by) * Math.hypot(ax, ay))) * 180 / Math.PI;
      expect(Math.abs(drawn - printed)).toBeLessThan(0.5);
      expect(kind(printed)).toBe(name);
    }
  });

  test('parts of a circle: each part is the thing its label says', () => {
    const svg = read('circle-parts.svg');
    const c = tag(svg, 'data-part="circle"');
    const cx = num(c, 'cx'), cy = num(c, 'cy'), R = num(c, 'r');
    const seg = (part) => { const l = tag(svg, `data-part="${part}"`); return [[num(l, 'x1'), num(l, 'y1')], [num(l, 'x2'), num(l, 'y2')]]; };
    const fromCenter = ([x, y]) => Math.hypot(x - cx, y - cy);
    const lineToCenter = ([[x1, y1], [x2, y2]]) => Math.abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1) / Math.hypot(x2 - x1, y2 - y1);
    const near = (a, b) => expect(Math.abs(a - b)).toBeLessThan(0.2);
    const [r1, r2] = seg('radius'); near(fromCenter(r1), 0); near(fromCenter(r2), R);
    const d = seg('diameter'); near(fromCenter(d[0]), R); near(fromCenter(d[1]), R); near(lineToCenter(d), 0);
    const ch = seg('chord'); near(fromCenter(ch[0]), R); near(fromCenter(ch[1]), R); expect(lineToCenter(ch)).toBeGreaterThan(R / 4);
    near(lineToCenter(seg('tangent')), R);
    for (const word of ['center', 'radius', 'diameter', 'chord', 'arc', 'tangent']) expect(svg).toContain(`>${word}</text>`);
  });

  test('the coordinate plane: ticks, the point and the quadrants are where they say', () => {
    const svg = read('coordinate-plane.svg');
    const o = tag(svg, 'data-origin'); const ox = num(o, 'cx'), oy = num(o, 'cy');
    const val = (t) => +t.replace('−', '-');
    const xs = [...svg.matchAll(/<text data-tick="x" x="([\d.]+)"[^>]*>([^<]+)</g)].map((m) => [+m[1], val(m[2])]);
    const ys = [...svg.matchAll(/<text data-tick="y" x="[\d.]+" y="([\d.]+)"[^>]*>([^<]+)</g)].map((m) => [+m[1], val(m[2])]);
    expect(xs).toHaveLength(12); expect(ys).toHaveLength(12);
    const unit = (xs.find(([, v]) => v === 1)[0] - ox);
    xs.forEach(([x, v]) => expect((x - ox) / unit).toBeCloseTo(v, 5));
    ys.forEach(([y, v]) => expect((oy - (y - 4)) / unit).toBeCloseTo(v, 5));
    const p = tag(svg, 'data-point'); const [px, py] = p.match(/data-point="(-?\d+),(-?\d+)"/).slice(1).map(Number);
    expect((num(p, 'cx') - ox) / unit).toBeCloseTo(px, 5);
    expect((oy - num(p, 'cy')) / unit).toBeCloseTo(py, 5);
    expect(svg).toContain(`>(${px}, ${py})</text>`);
    const SIGNS = { I: [1, 1], II: [-1, 1], III: [-1, -1], IV: [1, -1] };
    const quads = [...svg.matchAll(/<g data-quadrant="(\w+)"[^>]*><text x="([\d.]+)" y="([\d.]+)"[^>]*>[^<]+<\/text><text[^>]*>\((.), (.)\)</g)];
    expect(quads).toHaveLength(4);
    for (const [, q, x, y, sx, sy] of quads) {
      expect([Math.sign(+x - ox), Math.sign(oy - +y)]).toEqual(SIGNS[q]);
      expect([sx === '+' ? 1 : -1, sy === '+' ? 1 : -1]).toEqual(SIGNS[q]);
    }
  });
});

describe('the problem card', () => {
  const reply = String.raw`Nice! For angle \( \theta \), the point on the circle is \( (\cos \theta, \sin \theta) \). What are the coordinates at \( \theta=0 \)?`;

  test('the math in the tutor\'s sentence stays math', () => {
    const pose = synth.synthesizeFallbackPose({ tutorResponse: reply, studentMessage: 'Teach me some unit circle stuff' });
    expect(pose.action).toBe('pose');
    expect(pose.tex).toContain('\\theta=0');
    expect(pose.tex).toContain('(\\cos \\theta, \\sin \\theta)');
    expect(pose.tex).not.toMatch(/\( theta|cos theta/);
  });

  test('praise is not part of the problem', () => {
    const pose = synth.synthesizeFallbackPose({ tutorResponse: reply, studentMessage: 'ok' });
    expect(pose.tex).not.toMatch(/Nice/);
    // A word problem's setup is still quoted.
    const train = 'A train leaves at noon. It travels 60 mph. How far does it go in 3 hours?';
    expect(synth._extractPosableSentence(train)).toBe(train);
  });

  test('dollar amounts are words, not math', () => {
    expect(synth._sentenceToTex('Pens cost $5 and pads cost $7. What is the total?'))
      .toBe('\\text{Pens cost 5 and pads cost 7. What is the total?}');
    expect(synth._sentenceToTex('If $x=2$, what is $3x$?')).toBe('\\text{If } x=2 \\text{, what is } 3x \\text{?}');
  });
});
