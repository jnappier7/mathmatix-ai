const { stripUnrenderedVisualTags, VISUAL_COMMANDS } = require('../../public/js/stripVisualTags');

describe('stripUnrenderedVisualTags', () => {
  it('strips the raw [DIAGRAM:triangle] leak from the transcript', () => {
    const msg = 'Let me put that up on the board for you. [DIAGRAM:triangle] Picture two triangles.';
    expect(stripUnrenderedVisualTags(msg)).toBe('Let me put that up on the board for you. Picture two triangles.');
  });

  it('strips the whole visual-command family', () => {
    for (const cmd of VISUAL_COMMANDS) {
      expect(stripUnrenderedVisualTags(`a [${cmd}:x=1] b`)).toBe('a b');
      expect(stripUnrenderedVisualTags(`a [${cmd}] b`)).toBe('a b');
    }
  });

  it('strips a param-laden function graph tag', () => {
    expect(stripUnrenderedVisualTags('See [FUNCTION_GRAPH:fn=sin(x)/x,xMin=-10,xMax=10,title="Graph of sin(x)/x"] here'))
      .toBe('See here');
  });

  it('NEVER touches interval / coordinate brackets or LaTeX', () => {
    expect(stripUnrenderedVisualTags('The solution is [0, 3].')).toBe('The solution is [0, 3].');
    expect(stripUnrenderedVisualTags('Points [1,2] and [3,4].')).toBe('Points [1,2] and [3,4].');
    expect(stripUnrenderedVisualTags('Domain [a, b] works.')).toBe('Domain [a, b] works.');
    expect(stripUnrenderedVisualTags('\\[ x^2 + 1 \\]')).toBe('\\[ x^2 + 1 \\]');
    expect(stripUnrenderedVisualTags('Use interval notation: (-\\infty, 5]')).toBe('Use interval notation: (-\\infty, 5]');
  });

  it('leaves block tags like [STEPS]...[/STEPS] alone (not self-closing)', () => {
    const msg = '[STEPS]x+1=2\\nsubtract 1\\nx=1[/STEPS]';
    expect(stripUnrenderedVisualTags(msg)).toBe(msg);
  });

  it('handles multiple leftover tags and tidies whitespace', () => {
    expect(stripUnrenderedVisualTags('a [DIAGRAM:triangle] b [FUNCTION_GRAPH:fn=x^2] c'))
      .toBe('a b c');
  });

  it('is a no-op for plain text and bad input', () => {
    expect(stripUnrenderedVisualTags('just a normal reply')).toBe('just a normal reply');
    expect(stripUnrenderedVisualTags('')).toBe('');
    expect(stripUnrenderedVisualTags(null)).toBeNull();
    expect(stripUnrenderedVisualTags(undefined)).toBeUndefined();
  });
});
