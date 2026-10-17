/**
 * Session topic = the strongest topic, not the first regex to match.
 * Student audit, 2026-10-15: an SAT review of 4^(x+1) = 32 was summarized as
 * "linear equation" because /solve.*equation/ sits early in the list.
 */
const { detectTopic } = require('../../utils/activitySummarizer');
const msg = (content) => ({ role: 'assistant', content });

test('an exponent equation is about exponents', () => {
  expect(detectTopic([
    msg('If \\( 4^{(x + 1)} = 32 \\), what is the value of \\( x \\)? Solve the equation.'),
    { role: 'user', content: 'I can use base 2: 4^(x+1)=2^(2x+2), and 32=2^5. So 2x+2=5, x=3/2.' },
    msg('By rewriting 4^(x+1) as 2^(2x+2) and recognizing 32 as 2^5 …'),
  ])).toBe('exponents');
});

test('a real linear equation is still linear', () => {
  expect(detectTopic([msg('Solve the equation 2x + 5 = 17 by isolating the variable.'), msg('2x + 5 = 17, so 2x = 12.')])).toBe('linear equation');
});

test('nothing recognizable → mathematics', () => {
  expect(detectTopic([msg('Hello there!')])).toBe('mathematics');
});
