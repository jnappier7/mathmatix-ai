// The visual enforcer's keyword gates must read what the student TYPED, never
// the OCR text of a PDF they uploaded. Replay of a 2026-10-28 prod turn: a
// translations/reflections worksheet ("Graph △ABC with A(-4, 1)…") made the
// enforcer plot every coordinate on the page and cut the tutor's reply to its
// first two sentences under a stock "Plotting points helps…" line.
const { enforceVisualTeaching, studentOwnWords } = require('../../utils/visualCommandEnforcer');

const worksheet = [
  'Can you help me with this?',
  '',
  '[Content from HGeom_4.1-4.2_Practice.pdf]',
  'Part A - Translations (4.1)',
  'Ex: moves $(3,1)$ to (1, 6).',
  '2. Write a rule for the translation that moves A(2, -1) to A\'(-3, 4).',
  '3. Use (x, y) → (x+4, y-3) to find the images of J(-2,5), K(0,1), and L(3,-2).',
  '5. Graph △ABC with A(-4, 1), B(-2, 4), C(-1, 1) and its image after a translation by 〈5, -3〉.',
  '8. Graph △DEF with D(1, 2), E(4, 3), F(2, 5) and its reflection in the y-axis.',
].join('\n');

const tutorReply = 'I see your worksheet on translations and reflections! It looks like you\'re working through some geometry concepts. Which problem do you want to start with? Let\'s take them one at a time.';

describe('visual enforcer ignores uploaded document text', () => {
  test('a worksheet upload does not trigger a POINTS injection or truncate the reply', () => {
    expect(enforceVisualTeaching(worksheet, tutorReply)).toBe(tutorReply);
  });

  test('the same holds for a visual learner', () => {
    expect(enforceVisualTeaching(worksheet, tutorReply, '', true)).toBe(tutorReply);
  });

  test('the truncated-PDF header form is stripped too', () => {
    const msg = 'help\n\n[Content from big.pdf — showing first 12000 of 20000 characters]\nPlot the points (1,2) and (3,4).';
    expect(studentOwnWords(msg)).toBe('help');
  });

  test('a student who actually asks still gets the visual', () => {
    const out = enforceVisualTeaching('can you plot the points (1,2) and (3,4)?', tutorReply);
    expect(out).toContain('[POINTS:points=(1,2),(3,4)');
  });

  test('typed words before an upload still count', () => {
    const msg = 'plot the points (1,2) and (3,4)\n\n[Content from hw.pdf]\nGraph (9,9).';
    const out = enforceVisualTeaching(msg, tutorReply);
    expect(out).toContain('[POINTS:points=(1,2),(3,4),');
    expect(out).not.toContain('(9,9)');
  });

  test('plain messages are untouched by studentOwnWords', () => {
    expect(studentOwnWords('graph y = 2x + 1')).toBe('graph y = 2x + 1');
    expect(studentOwnWords(undefined)).toBe('');
  });
});
