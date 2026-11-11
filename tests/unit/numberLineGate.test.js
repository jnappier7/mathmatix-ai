/**
 * The number line gate (utils/pipeline/numberLineGate.js).
 *
 * The tutor is now asked to draw number lines on its own (visualDirective). A hop that lands on
 * the answer to arithmetic the student asked about, or the shaded solution of an inequality they
 * brought unsolved, IS the answer. These pin what gets cut and — just as important, because a
 * false alarm costs a good picture — what is left alone.
 */
const {
  gateNumberLineTags, containsNumberLineTag, posedArithmeticValues, posedInequalityBoundaries, tagBoundary,
} = require('../../utils/pipeline/numberLineGate');

const gate = (text, studentMessages, extra = {}) => gateNumberLineTags({ text, studentMessages, ...extra });

describe('what the student asked', () => {
  test('arithmetic they posed has a value; everything else has none', () => {
    expect(posedArithmeticValues('what is -3 + 8?')).toEqual([5]);
    expect(posedArithmeticValues('can you help with 2 + 3 − 7')).toEqual([-2]); // unicode minus
    expect(posedArithmeticValues('5 - (-2)')).toEqual([7]);
    expect(posedArithmeticValues('problem 4 on page 12, due 11/14')).toEqual([]);
    expect(posedArithmeticValues('solve 2x + 3 = 7')).toEqual([]);   // an equation: valueLeak's job
    expect(posedArithmeticValues('i got 12')).toEqual([]);
  });
  test('an unsolved inequality has a boundary; one already in solved form protects nothing', () => {
    expect(posedInequalityBoundaries('so 2x + 3 > 7 right')).toEqual([2]);
    expect(posedInequalityBoundaries('graph -3x <= 12 please')).toEqual([-4]);
    expect(posedInequalityBoundaries('2x + 3 \\geq 7')).toEqual([2]); // pinned TeX
    expect(posedInequalityBoundaries('show me x > 2')).toEqual([]);
    expect(posedInequalityBoundaries('5 >= y')).toEqual([]);
    expect(posedInequalityBoundaries('is 5 < 7')).toEqual([]);
  });
  test('the boundary a tag shades from, in each form the tutor writes', () => {
    expect(tagBoundary('NUMBER_LINE', 'min=-5,max=5,inequality=">2",label="x > 2"')).toBe(2);
    expect(tagBoundary('NUMBER_LINE', 'min=-6,max=6,inequality="x >= -1"')).toBe(-1);
    expect(tagBoundary('INEQUALITY', 'expression="x <= 2"')).toBe(2);
    expect(tagBoundary('INEQUALITY', 'value=5,type=less,inclusive=true')).toBe(5);
    expect(tagBoundary('NUMBER_LINE', 'min=0,max=10,points=[3]')).toBeNull();
  });
});

describe('hops: the landing hop is cut, the rest of the picture stays', () => {
  test('a one-hop answer keeps only where the student starts', () => {
    const r = gate('Start at -3. [NUMBER_LINE:min=-5,max=8,jumps=[(-3,5,"+8")],label="-3 + 8 = 5"] Where do you land?', ['what is -3 + 8?']);
    expect(r.text).toBe('Start at -3. [NUMBER_LINE:min=-5,max=8,points=[-3]] Where do you land?');
    expect(r.changes).toEqual([{ tag: 'NUMBER_LINE', action: 'cut_hop', value: 5 }]);
  });
  test('a two-hop answer keeps the first hop and leaves the last move to the student', () => {
    const r = gate('[NUMBER_LINE:min=-4,max=8,jumps=[(2,5,"+3"),(5,-2,"-7")],label="2 + 3 - 7"]', ['2 + 3 - 7']);
    expect(r.text).toBe('[NUMBER_LINE:min=-4,max=8,jumps=[(2,5,"+3")],label="2 + 3 - 7"]'); // a label that only restates the question stays
    expect(r.text).not.toMatch(/-2/);
  });
  test('the quoted jumps form is cut the same way and keeps its quoting', () => {
    const r = gate('[NUMBER_LINE:min=-4,max=8,jumps="(2,5,+3),(5,-2,-7)"]', ['2 + 3 - 7']);
    expect(r.text).toBe('[NUMBER_LINE:min=-4,max=8,jumps="(2,5,+3)"]');
  });
  test('the question can come from an earlier message, the pinned problem, or the graded answer', () => {
    const tag = '[NUMBER_LINE:min=-5,max=8,jumps=[(-3,5,"+8")]]';
    expect(gate(tag, ['ok', 'what is -3 + 8?']).changes).toHaveLength(1);
    expect(gate(tag, ['idk'], { pinnedTex: '-3 + 8' }).changes).toHaveLength(1);
    expect(gate(tag, ['idk'], { correctAnswer: '5' }).changes).toHaveLength(1);
  });
});

describe('hops: what is left alone', () => {
  const tag = '[NUMBER_LINE:min=-5,max=8,jumps=[(-3,5,"+8")]]';
  test('the tutor\'s own example with different numbers', () => {
    const other = '[NUMBER_LINE:min=0,max=10,jumps=[(1,4,"+3")]]';
    expect(gate(other, ['what is -3 + 8?'])).toEqual({ text: other, changes: [] });
  });
  test('a student who already has it right — there is nothing left to give away', () => {
    expect(gate(tag, ['what is -3 + 8?'], { solved: true })).toEqual({ text: tag, changes: [] });
  });
  test('a turn where the student posed no arithmetic at all', () => {
    expect(gate(tag, ['can you explain negative numbers'])).toEqual({ text: tag, changes: [] });
  });
  test('a plain number line with points, and text with no tag', () => {
    const pts = '[NUMBER_LINE:min=-5,max=8,points=[5]]';
    expect(gate(pts, ['what is -3 + 8?']).text).toBe(pts); // a bare point is not a worked hop; the reply-text guards own "the answer is 5"
    expect(gate('Just words about 5.', ['what is -3 + 8?'])).toEqual({ text: 'Just words about 5.', changes: [] });
    expect(containsNumberLineTag('on the interval [0, 3]')).toBe(false);
  });
});

describe('shading: the solved inequality is removed, the stated one is not', () => {
  test('both tag forms are stripped when they shade the solution of the student\'s unsolved inequality', () => {
    const r = gate('Here: [NUMBER_LINE:min=-5,max=5,inequality=">2",label="x > 2"] and [INEQUALITY:expression="x > 2"] ok', ['how do i solve 2x + 3 > 7']);
    expect(r.text).toBe('Here: and ok');
    expect(r.changes.map((c) => c.action)).toEqual(['strip', 'strip']);
  });
  test('an inequality the student stated is drawn back to them', () => {
    const tag = '[INEQUALITY:expression="x > 2"]';
    expect(gate(tag, ['show me x > 2'])).toEqual({ text: tag, changes: [] });
  });
  test('a different boundary (a parallel example) is left alone', () => {
    const tag = '[NUMBER_LINE:min=-5,max=5,inequality=">1",label="x > 1"]';
    expect(gate(tag, ['how do i solve 2x + 3 > 7']).text).toBe(tag);
  });
});

describe('wiring', () => {
  const fs = require('fs'); const path = require('path');
  const src = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
  test('the pipeline runs it on the verified text, whatever VISUAL_GATE_MODE says', () => {
    const idx = src('utils/pipeline/index.js');
    expect(idx).toMatch(/if \(containsNumberLineTag\(verified\.text\)\) \{[\s\S]{0,900}gateNumberLineTags\(\{/);
    expect(idx).toMatch(/solved: diagnosis\.isCorrect === true/);
  });
  test('the tutor is told the slope picture exists and how a worked example is laid out', () => {
    expect(src('utils/visualCapabilities.js')).toMatch(/\[SLOPE:rise=V,run=V\]/);
    expect(src('utils/promptCompact.js')).toMatch(/ONE equation per line/);
  });
});

// A language model writes hops freehand. A picture that shows wrong arithmetic is worse than
// no picture, so these run on EVERY number line — the tutor's own examples included.
describe('correctness: a number line that says something false is not shown', () => {
  const { hopsAddUp } = require('../../utils/pipeline/numberLineGate');
  test('a hop whose label and landing disagree removes the picture', () => {
    const r = gate('See [NUMBER_LINE:min=-5,max=8,jumps=[(-3,6,"+8")]] here', []);
    expect(r.text).toBe('See here');
    expect(r.changes).toEqual([{ tag: 'NUMBER_LINE', action: 'wrong_hops' }]);
  });
  test('a hop that does not start where the last one landed removes the picture', () => {
    expect(gate('[NUMBER_LINE:min=0,max=10,jumps=[(0,3,"+3"),(4,8,"+4")]]', []).changes[0].action).toBe('wrong_hops');
  });
  test('true hops pass untouched: signs, a unicode minus, and a label in words', () => {
    for (const tag of [
      '[NUMBER_LINE:min=0,max=10,jumps=[(0,3,"+3"),(3,7,"+4")]]',
      '[NUMBER_LINE:min=-4,max=8,jumps=[(5,-2,"−7")]]',
      '[NUMBER_LINE:min=0,max=10,jumps=[(2,4,"double it")]]',
      '[NUMBER_LINE:min=-4,max=8,jumps="(2,5,+3),(5,-2,-7)"]',
    ]) expect(gate(tag, [])).toEqual({ text: tag, changes: [] });
    expect(hopsAddUp([{ from: 0.5, to: 1.25, label: '+3/4' }])).toBe(true);
  });
  test('it runs even when the student already has it right', () => {
    expect(gate('[NUMBER_LINE:min=-5,max=8,jumps=[(-3,6,"+8")]]', ['-3 + 8'], { solved: true }).text).toBe('');
  });
  test('a hop that runs off the end stretches the line instead of drawing in the margin', () => {
    const r = gate('[NUMBER_LINE:min=0,max=5,jumps=[(2,9,"+7")]]', []);
    expect(r.text).toBe('[NUMBER_LINE:min=0,max=10,jumps=[(2,9,"+7")]]');
    expect(r.changes).toEqual([{ tag: 'NUMBER_LINE', action: 'fit_range' }]);
  });
  test('stretching and the leak cut compose', () => {
    const r = gate('[NUMBER_LINE:min=0,max=5,jumps=[(2,5,"+3"),(5,-2,"-7")]]', ['2 + 3 - 7']);
    expect(r.text).toBe('[NUMBER_LINE:min=-3,max=5,jumps=[(2,5,"+3")]]');
  });
});
