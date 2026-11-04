// Live, AP Calculus, 2026-11-03: "oh so 2x sinx + x^2 cosx" (correct) was
// routed to the conceptual judge because "sinx" and "cosx" counted as words,
// and rejected at 0.95. See utils/pipeline/ideaWords.js.
const { hasIdeaWords } = require('../../utils/pipeline/ideaWords');
const { isProseAnswer } = require('../../utils/pipeline/llmVerifier');
const { observe } = require('../../utils/pipeline/observe');

describe('math with filler is not an idea', () => {
  test.each([
    'oh so 2x sinx + x^2 cosx',
    'i think its cos2x - sin x',
    'ln(x) + 1',
    'so sqrt(x) over 2',
    'x squared plus two x',
    'its 3sec^2x',
  ])('%s', (t) => {
    expect(hasIdeaWords(t)).toBe(false);
    expect(isProseAnswer(t)).toBe(false);
  });
});

describe('a short idea still counts', () => {
  test.each([
    "it's a hole",
    'the derivative is the slope of the tangent line',
    'because the function is continuous there',
    'the minimum is where it turns around',
  ])('%s', (t) => {
    expect(hasIdeaWords(t)).toBe(true);
  });
});

test('observe: the live reply is not a conceptual reply (real history)', () => {
  const g = "Hey Jason! Great to see you this Tuesday evening! Since we touched on ratios last time and you nailed it, how about a quick warm-up to keep those math muscles flexing?\n\nTry this: What’s the ratio of 8 to 4? Just a little check-in to see how you're feeling. If you want to dive into AP Calculus AB afterward, just let me know! You've got this!";
  const t1 = "To find the derivative of \\(x^2 \\sin x\\), we need to use the product rule, which states that if you have two functions \\(u\\) and \\(v\\), the derivative is given by:\n\\[(uv)' = u'v + uv'\\]\n\nIn this case, let \\(u = x^2\\) and \\(v = \\sin x\\).\n\nCan you tell me what the derivatives \\(u'\\) and \\(v'\\) are? Let's work through it together!";
  const t2 = "You're right about \\(u' = 2x\\) and \\(v' = \\cos x\\), great job! However, it looks like we might have missed a step in applying the product rule.\n\nRemember, the product rule gives us:\n\\[(uv)' = u'v + uv'\\]\n\nSo, we need to combine both parts: \\(u'v\\) and \\(uv'\\).\n\nWhat do you get when you apply those derivatives to the product rule? Let's break it down step by step! What would \\(u'v\\) look like?";
  const o = observe('oh so 2x sinx + x^2 cosx', {
    recentAssistantMessages: [g, t1, t2].map(content => ({ role: 'assistant', content })),
    recentUserMessages: [{ content: 'whats the derivative of x^2 sin x' }, { content: "u' = 2x and v' = cos x so its 2x cos x" }],
  });
  expect(o.messageType).toBe('general_math');
  expect(o.conceptualReply).toBe(false);
});
