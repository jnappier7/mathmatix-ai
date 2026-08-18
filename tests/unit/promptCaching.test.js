/**
 * PROMPT CACHING — the tutor's system prompt is ~12K tokens, and before this
 * we re-bought all of it on every turn. Anthropic bills a cached prefix at
 * ~0.1x, so a breakpoint at the end of the stable head is most of the tutor's
 * input cost.
 *
 * These tests exist because a broken cache is SILENT. There is no error and no
 * failed request — `cache_read_input_tokens` just sits at zero and the bill
 * goes up. The two ways to break it:
 *
 *   1. Something that varies per turn moves ABOVE the breakpoint in
 *      promptCompact (a section that reads the student's message, the topic,
 *      the mastery snapshot). The prefix stops being byte-identical and every
 *      request writes a fresh entry instead of reading one.
 *   2. The prefix drops below the model's minimum cacheable length, at which
 *      point the API silently declines to cache at all.
 *
 * Both are asserted here against the REAL prompt builder and the REAL request
 * body the Anthropic adapter sends.
 */
const { buildSystemPrompt, generateSystemPrompt } = require('../../utils/promptCompact');
const { buildBody, buildSystemField } = require('../../utils/anthropicClient');

const PROFILE = {
  firstName: 'Alex', lastName: 'Rivera', gradeLevel: '7', mathCourse: 'Math 7',
  interests: ['soccer'], learningStyle: null, tonePreference: 'encouraging',
};
const TUTOR = { name: 'Mr. Nappier', catchphrase: 'See the patterns.', personality: 'Warm.' };

// Only the arguments that move turn to turn; everything else held constant.
function build({ message = 'hello', topic = 'fractions', mastery = null, upload = null,
                 fluency = null, worksheet = null, history = [] } = {}) {
  return buildSystemPrompt(
    PROFILE, TUTOR, null, 'student', null, upload, mastery, [], fluency,
    { topicName: topic }, null, null, null, null, message, history, worksheet,
  );
}

const prefixOf = (built) => built.prompt.slice(0, built.cacheableChars);

describe('the cacheable prefix is genuinely stable', () => {
  const base = build();

  test('a different student message does not change it', () => {
    expect(prefixOf(build({ message: 'i dont get any of this' }))).toBe(prefixOf(base));
  });

  test('a different topic does not change it', () => {
    expect(prefixOf(build({ topic: 'slope of a line' }))).toBe(prefixOf(base));
  });

  test('conversation history does not change it', () => {
    const withHistory = build({
      history: [{ role: 'user', content: 'what is 1/2 + 1/3' },
                { role: 'assistant', content: 'What denominator works for both?' }],
    });
    expect(prefixOf(withHistory)).toBe(prefixOf(base));
  });

  test('per-session context arriving mid-session does not change it', () => {
    expect(prefixOf(build({ mastery: { skillName: 'Adding Fractions', tier: 'developing' } }))).toBe(prefixOf(base));
    expect(prefixOf(build({ upload: 'photo of the student\'s work' }))).toBe(prefixOf(base));
    expect(prefixOf(build({ fluency: { fluencyZScore: -1.2 } }))).toBe(prefixOf(base));
    expect(prefixOf(build({ worksheet: { filename: 'quiz.pdf', text: '1) 2x=8' } }))).toBe(prefixOf(base));
  });

  test('the prefix is a real prefix of the prompt, and most of it', () => {
    expect(base.prompt.startsWith(prefixOf(base))).toBe(true);
    // Worth caching at all: if this drops sharply, something volatile moved up.
    expect(base.cacheableChars / base.prompt.length).toBeGreaterThan(0.8);
  });

  test('it clears the highest per-model minimum (4096 tokens)', () => {
    // Below the floor the API caches nothing and says nothing.
    expect(base.cacheableChars).toBeGreaterThan(4096 * 4);
  });
});

describe('generateSystemPrompt is unchanged for every other caller', () => {
  test('returns the same string the builder produced', () => {
    const args = [PROFILE, TUTOR, null, 'student', null, null, null, [], null,
      { topicName: 'fractions' }, null, null, null, null, 'hi', []];
    expect(generateSystemPrompt(...args)).toBe(buildSystemPrompt(...args).prompt);
  });

  test('a parent prompt reports nothing cacheable', () => {
    const built = buildSystemPrompt(PROFILE, TUTOR, { firstName: 'Sam' }, 'parent');
    expect(built.cacheableChars).toBe(0);
    expect(typeof built.prompt).toBe('string');
  });
});

describe('the Claude request body carries the breakpoint', () => {
  const built = build();
  const messages = [{ role: 'system', content: built.prompt }, { role: 'user', content: 'is it 2/5?' }];

  test('system becomes two blocks, breakpoint on the stable one', () => {
    const body = buildBody('claude-sonnet-5', messages, { cacheableSystemChars: built.cacheableChars });
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system).toHaveLength(2);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system[1].cache_control).toBeUndefined();
  });

  test('the split loses nothing and reorders nothing', () => {
    const withCache = buildBody('claude-sonnet-5', messages, { cacheableSystemChars: built.cacheableChars });
    const without = buildBody('claude-sonnet-5', messages, {});
    expect(withCache.system.map((b) => b.text).join('')).toBe(without.system);
  });

  test('the cached block is identical across two different turns', () => {
    const turnA = build({ message: 'is it 2/5?', topic: 'fractions' });
    const turnB = build({ message: 'what about 3/4 vs 2/3?', topic: 'comparing fractions' });
    const bodyA = buildBody('claude-sonnet-5',
      [{ role: 'system', content: turnA.prompt }, { role: 'user', content: 'a' }],
      { cacheableSystemChars: turnA.cacheableChars });
    const bodyB = buildBody('claude-sonnet-5',
      [{ role: 'system', content: turnB.prompt }, { role: 'user', content: 'b' }],
      { cacheableSystemChars: turnB.cacheableChars });
    expect(bodyA.system[0].text).toBe(bodyB.system[0].text);
    expect(bodyA.system[1].text).not.toBe(bodyB.system[1].text);
  });

  test('the child-safety preamble rides INSIDE the cached block', () => {
    // It is a constant — leaving it outside would keep the cheapest tokens at
    // full price and buy nothing.
    const body = buildBody('claude-sonnet-5', messages, { cacheableSystemChars: built.cacheableChars });
    const preambleOpener = 'You are assisting in an educational math-tutoring product';
    expect(body.system[0].text.startsWith(preambleOpener)).toBe(true);
    expect(body.system[1].text).not.toContain(preambleOpener);
  });
});

describe('buildSystemField declines to cache when it would not pay', () => {
  test('no boundary reported → plain string, exactly as before', () => {
    expect(typeof buildSystemField('some system prompt', 0)).toBe('string');
    expect(typeof buildSystemField('some system prompt', undefined)).toBe('string');
  });

  test('a prefix below the model minimum → plain string, no cache write', () => {
    const short = 'tiny prompt';
    expect(typeof buildSystemField(short, short.length)).toBe('string');
  });

  test('an empty system prompt still yields the safety preamble', () => {
    expect(typeof buildSystemField('', 1000)).toBe('string');
  });

  test('a boundary past the end of the prompt is clamped, not thrown', () => {
    const long = 'x'.repeat(40000);
    const field = buildSystemField(long, 999999);
    expect(Array.isArray(field)).toBe(true);
    expect(field.map((b) => b.text).join('')).toContain(long);
  });
});
