const { detectTestOutIntent } = require('../../utils/testOutIntent');

describe('detectTestOutIntent', () => {
  it.each([
    'I KNOW order of operations how do I test out of this skill?',
    'let me test out',
    'can I test out now',
    'quiz me',
    'challenge me',
    'prove that I know this',
    'skip the lesson',
    'let me prove it',
    "I'm ready to test",
  ])('fires on test-out phrasing: %s', (t) => {
    expect(detectTestOutIntent(t)).toBe(true);
  });

  it.each([
    'this is a test',
    'let me test my answer 3x=9',
    'I know this is hard',
    'what is the protest about',
    'testing 1 2 3',
    'can I test my code',
    '',
    null,
  ])('does NOT fire on: %s', (t) => {
    expect(detectTestOutIntent(t)).toBe(false);
  });
});
