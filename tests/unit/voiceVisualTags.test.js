/**
 * The TTS boundary for voice visual tools.
 *
 * Voice had no way to show anything: its vocabulary was [WRITE:]/[CIRCLE:]/
 * [ARROW:]/[HIGHLIGHT:], all text and annotation. Asked for a dodecahedron the
 * tutor would say "here it is, you can see its 12 pentagonal faces" and render
 * nothing — narrating a picture it had no tool to produce. The renderers in
 * utils/visualTools.js existed the whole time; only the text path was wired to
 * them.
 *
 * Wiring them into voice creates one new way to fail badly: the tags are
 * rendering instructions, and cleanTextForTTS does NOT strip bracket tags, so
 * anything left in the string gets SPOKEN. "Open bracket search image query
 * equals dodecahedron" in a tutor's voice is worse than the missing picture.
 * These tests pin that boundary.
 */

const { _stripVisualTags: stripVisualTags } = require('../../routes/voice');
const { SPECS, resolveToolCalls } = require('../../utils/visualTools');
const { cleanTextForTTS } = require('../../utils/mathTTS');

const call = (name, args) => ({
  id: `call_${name}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

describe('voice visual tags — never spoken', () => {
  test('the dodecahedron case: image tag renders but is not read aloud', () => {
    const { tags } = resolveToolCalls([
      call('search_educational_image', { query: 'dodecahedron', category: 'geometry' }),
    ]);
    expect(tags.length).toBe(1);
    expect(tags[0]).toContain('SEARCH_IMAGE');

    // What the client receives keeps the tag (that is what renders).
    const forClient = ['A dodecahedron has 12 pentagonal faces.', ...tags].join('\n\n');
    expect(forClient).toContain('SEARCH_IMAGE');

    // What TTS receives must not.
    const spoken = cleanTextForTTS(stripVisualTags(forClient, tags));
    expect(spoken).toBe('A dodecahedron has 12 pentagonal faces.');
    expect(spoken).not.toMatch(/SEARCH_IMAGE|\[|\]/);
  });

  test('EVERY visual tool the model can call is stripped before TTS', () => {
    // Generated from SPECS so a newly added tool cannot quietly become speakable.
    const sample = {
      function: 'x^2', query: 'cube', category: 'geometry',
      numerator: 1, denominator: 2, min: 0, max: 10, value: 3,
      expression: 'x + 1', points: [[1, 2]], positive: 2, negative: 1, number: 42,
    };

    const tagged = Object.keys(SPECS).filter((name) => typeof SPECS[name].toTag === 'function');
    expect(tagged.length).toBeGreaterThan(0);

    for (const name of tagged) {
      const { tags } = resolveToolCalls([call(name, sample)]);
      if (!tags.length) continue; // tool renders via visualCommand only
      const spoken = cleanTextForTTS(stripVisualTags(`Look at this.\n\n${tags.join('\n')}`, tags));
      expect(spoken).toBe('Look at this.');
    }
  });

  test('multiple tools in one turn are all stripped', () => {
    const { tags } = resolveToolCalls([
      call('search_educational_image', { query: 'dodecahedron' }),
      call('render_function_graph', { function: 'x^2' }),
    ]);
    expect(tags.length).toBe(2);

    const spoken = stripVisualTags(`Two things.\n\n${tags.join('\n\n')}`, tags);
    expect(spoken).toBe('Two things.');
  });

  test('a turn with no visuals is left exactly as-is', () => {
    const text = 'What do you get when you distribute the 3?';
    expect(stripVisualTags(text, [])).toBe(text);
    expect(stripVisualTags(text, null)).toBe(text);
  });

  test('prose that merely mentions a bracket is not mangled', () => {
    // Only the exact emitted tags are removed, so ordinary text with brackets
    // (an interval, a citation) survives untouched.
    const text = 'The domain is [0, 5].';
    expect(stripVisualTags(text, ['[SEARCH_IMAGE:query="x"]'])).toBe(text);
  });
});
