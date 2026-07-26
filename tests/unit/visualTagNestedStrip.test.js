/**
 * Regression: visual tokens whose params nest one level of brackets
 * (points=[-3,3], jumps=[(0,3,"+3")]) must be stripped WHOLE.
 *
 * Production transcript (2026-07-26): the tutor emitted
 *   [NUMBER_LINE:min=-5,max=5,points=[-3,3],label="−3 and 3 are both 3 steps from zero"]
 * and the server-side strip regex [^\]]+ stopped at the "]" closing points=[…],
 * so the student saw the literal tail:
 *   ,label="−3 and 3 are both 3 steps from zero"]
 *
 * The client-side grammar (public/js/visualTokenParser.js) was already fixed;
 * these tests pin the four server/client strippers that were missed.
 */

const { parseVisualTeaching } = require('../../utils/visualTeachingParser');
const { normalizeLatex } = require('../../utils/pipeline/verify');
const { cleanTextForTTS } = require('../../utils/mathTTS');
const { stripUnrenderedVisualTags } = require('../../public/js/stripVisualTags');

const TRANSCRIPT_TOKEN =
  '[NUMBER_LINE:min=-5,max=5,points=[-3,3],label="−3 and 3 are both 3 steps from zero"]';
const LEAKED_TAIL = ',label=';

describe('visualTeachingParser.parseVisualTeaching — nested-bracket strip', () => {
  it('strips the exact production NUMBER_LINE token whole', () => {
    const { cleanedText } = parseVisualTeaching(
      `Distance from zero.\n\n${TRANSCRIPT_TOKEN}\n\nLook at that number line.`
    );
    expect(cleanedText).not.toContain(LEAKED_TAIL);
    expect(cleanedText).not.toContain('NUMBER_LINE');
    expect(cleanedText).toContain('Distance from zero.');
    expect(cleanedText).toContain('Look at that number line.');
  });

  it('strips NUMBER_LINE with jumps=[(…)] params whole', () => {
    const { cleanedText } = parseVisualTeaching(
      'Add: [NUMBER_LINE:min=0,max=10,jumps=[(0,3,"+3"),(3,7,"+4")],label="Adding"] done'
    );
    expect(cleanedText.replace(/\s+/g, ' ')).toBe('Add: done');
  });

  it('strips COUNTERS with nested list params whole', () => {
    const { cleanedText } = parseVisualTeaching(
      'See [COUNTERS:pos=3,neg=5,pairs=[1,2],label="Zero pairs"] here'
    );
    expect(cleanedText).not.toContain(LEAKED_TAIL);
    expect(cleanedText).not.toContain('COUNTERS');
  });

  it('still strips simple tokens with no nesting', () => {
    const { cleanedText } = parseVisualTeaching('a [NUMBER_LINE:min=-5,max=5,highlight=3] b');
    expect(cleanedText.replace(/\s+/g, ' ')).toBe('a b');
  });
});

describe('verify.normalizeLatex — protects whole nested tokens from LaTeX pass', () => {
  it('round-trips a NUMBER_LINE token with points=[…] unchanged', () => {
    const input = `Here you go:\n${TRANSCRIPT_TOKEN}`;
    expect(normalizeLatex(input)).toBe(input);
  });

  it('round-trips a FUNCTION_GRAPH token with bracketed params unchanged', () => {
    const input = 'Graph: [FUNCTION_GRAPH:fn=x^2,points=[(1,1),(2,4)],title="Squares"]';
    expect(normalizeLatex(input)).toBe(input);
  });
});

describe('mathTTS.cleanTextForTTS — never reads a leaked tail aloud', () => {
  it('removes the whole nested NUMBER_LINE token', () => {
    const out = cleanTextForTTS(`Look at the number line. ${TRANSCRIPT_TOKEN}`);
    expect(out).not.toContain(LEAKED_TAIL);
    expect(out).not.toContain('label');
    expect(out).toContain('Look at the number line.');
  });

  it('still removes flat tokens', () => {
    expect(cleanTextForTTS('a [DIAGRAM:triangle] b')).toBe('a b');
  });
});

describe('stripVisualTags.stripUnrenderedVisualTags — client safety net', () => {
  it('strips the whole nested NUMBER_LINE token', () => {
    const out = stripUnrenderedVisualTags(`Distance. ${TRANSCRIPT_TOKEN} See?`);
    expect(out).toBe('Distance. See?');
  });

  it('still never touches interval notation or plain brackets', () => {
    expect(stripUnrenderedVisualTags('The solution is [0, 3].')).toBe('The solution is [0, 3].');
    expect(stripUnrenderedVisualTags('Points [1,2] and [3,4].')).toBe('Points [1,2] and [3,4].');
  });
});
