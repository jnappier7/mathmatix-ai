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
