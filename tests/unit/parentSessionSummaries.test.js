/**
 * Parent dashboard "Recent sessions": plain math, summary repair, list shaping,
 * and the summary generator's third-person contract.
 *
 * What parents saw before: raw LaTeX (\(\sqrt[5]{x^5y^{15}}\)) on a page with
 * no typesetter, the tutor's diary ("the student and I…", "we focused…"),
 * "a warm-up exercise on undefined concepts", "N/A min", and a column of
 * "Session completed - 0 minutes of active learning" rows.
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { plainMath } = require('../../utils/plainMath');
const {
  repairSummary, sanitizeSummary, isPlaceholderSummary, describeAccuracy,
} = require('../../utils/summaryText');
const { shapeRecentSessions, NO_SUMMARY_TEXT } = require('../../utils/parentSessionList');
const { generateSessionSummary, detectTopic, transcriptLines } = require('../../utils/activitySummarizer');

describe('plainMath', () => {
  test.each([
    ['Solved \\(5x - 7 = 13\\).', 'Solved 5x − 7 = 13.'],
    ['Simplified \\(\\sqrt[5]{x^5y^{15}}\\).', 'Simplified ⁵√(x⁵y¹⁵).'],
    ['\\(\\frac{a}{b}\\)', 'a/b'],
    ['\\(\\frac{a+b}{2}\\)', '(a+b)/2'],
    ['\\(\\sqrt{x}\\)', '√x'],
    ['\\(\\sqrt{2x}\\)', '√(2x)'],
    ['\\(x^{15}\\)', 'x¹⁵'],
    ['\\(x^{ab}\\)', 'x^(ab)'],
    ['\\(3 \\cdot 4 \\times 2\\)', '3 · 4 × 2'],
    ['\\(x \\le 3\\) and \\(y \\ge 2\\)', 'x ≤ 3 and y ≥ 2'],
    ['\\(\\left( \\frac{1}{2} \\right)^2\\)', '(1/2)²'],
    ['\\[a_1 + a_2\\]', 'a₁ + a₂'],
    ['$x^2$ term', 'x² term'],
    ['\\(\\weird{y}\\)', 'weirdy'],
    ['bare \\frac{1}{2} in prose', 'bare 1/2 in prose'],
    ['\\(\\sqrt[k]{8}\\)', 'kth root of 8'],
  ])('%s → %s', (input, expected) => {
    expect(plainMath(input)).toBe(expected);
  });

  test('leaves money and plain prose alone', () => {
    expect(plainMath('It costs $5 and $10.')).toBe('It costs $5 and $10.');
    expect(plainMath('Ana worked on fractions - nicely.')).toBe('Ana worked on fractions - nicely.');
  });

  test('passes non-strings through', () => {
    expect(plainMath(undefined)).toBeUndefined();
    expect(plainMath(null)).toBeNull();
  });
});

describe('repairSummary / sanitizeSummary', () => {
  test('rewrites the tutor\'s first person and "the student"', () => {
    expect(repairSummary('The student and I worked on equations. We focused on \\(x\\). The student did well.', 'Ana'))
      .toBe('Ana and the tutor worked on equations. Ana focused on \\(x\\). Ana did well.');
    expect(repairSummary('In our session, the student practiced with me.', 'Ana'))
      .toBe('In the session, Ana practiced with the tutor.');
  });

  test('drops literal undefined / null', () => {
    expect(repairSummary('A warm-up exercise on undefined concepts.', 'Ana')).toBe('A warm-up exercise on concepts.');
    expect(repairSummary('Topic: null.', 'Ana')).toBe('Topic:.');
  });

  test('restores a leftover [Student] placeholder', () => {
    expect(repairSummary('[Student] solved 3 problems.', 'Ana')).toBe('Ana solved 3 problems.');
  });

  test('does not touch "the students" or Roman numerals', () => {
    expect(repairSummary('Like the students in Algebra I.', 'Ana')).toBe('Like the students in Algebra I.');
    expect(sanitizeSummary('Ana reviewed Algebra I factoring and did well.', { name: 'Ana', fallback: 'FB' }))
      .toBe('Ana reviewed Algebra I factoring and did well.');
  });

  test('falls back when first person survives repair', () => {
    expect(sanitizeSummary('We had a great time. I think Ana is ready.', { name: 'Ana', fallback: 'FB' })).toBe('FB');
    expect(sanitizeSummary('Ana impressed me today.', { name: 'Ana', fallback: 'FB' })).toBe('FB');
  });

  test('falls back on an empty model reply', () => {
    expect(sanitizeSummary('', { name: 'Ana', fallback: 'FB' })).toBe('FB');
  });

  test('isPlaceholderSummary', () => {
    expect(isPlaceholderSummary('Session completed - 0 minutes of active learning')).toBe(true);
    expect(isPlaceholderSummary('Session completed - 4 minutes')).toBe(true);
    expect(isPlaceholderSummary('')).toBe(true);
    expect(isPlaceholderSummary(undefined)).toBe(true);
    expect(isPlaceholderSummary('Ana practiced fractions.')).toBe(false);
  });

  test('describeAccuracy withholds a percentage under 5 problems', () => {
    expect(describeAccuracy(1, 1)).toBe('answered 1 of 1 correctly (too few to judge accuracy)');
    expect(describeAccuracy(3, 4)).toBe('answered 3 of 4 correctly (too few to judge accuracy)');
    expect(describeAccuracy(4, 5)).toBe('answered 4 of 5 correctly (80%)');
    expect(describeAccuracy(0, 0)).toBe('');
  });
});

describe('shapeRecentSessions', () => {
  const d = (n) => new Date(Date.UTC(2026, 9, n));

  test('collapses empty sessions into a count and keeps the live row first', () => {
    const { sessions, hiddenShortSessions } = shapeRecentSessions({
      firstName: 'Ana',
      active: { lastActivity: d(14), currentTopic: 'fractions', problemsAttempted: 1, problemsCorrect: 1, activeMinutes: 0 },
      completed: [
        { lastActivity: d(13), summary: 'Session completed - 0 minutes of active learning', activeMinutes: 0 },
        { lastActivity: d(12), summary: 'The student and I solved \\(5x - 7 = 13\\).', activeMinutes: 29 },
        { lastActivity: d(11), summary: '', activeMinutes: undefined },
        { lastActivity: d(10), summary: 'Session completed - 5 minutes', activeMinutes: 5 },
      ],
    });

    expect(hiddenShortSessions).toBe(2);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toMatchObject({ isActive: true, duration: 0, summary: 'Currently working on fractions. 1 problem attempted with 1 correct.' });
    expect(sessions[1]).toMatchObject({ isActive: false, duration: 29, summary: 'Ana and the tutor solved 5x − 7 = 13.' });
    // Has minutes, so it is listed — but not as the placeholder text.
    expect(sessions[2]).toMatchObject({ duration: 5, summary: NO_SUMMARY_TEXT });
  });

  test('pluralizes the live fallback', () => {
    const { sessions } = shapeRecentSessions({
      active: { lastActivity: d(14), currentTopic: 'ratios', problemsAttempted: 3, problemsCorrect: 2 },
    });
    expect(sessions[0].summary).toBe('Currently working on ratios. 3 problems attempted with 2 correct.');
  });

  test('cleans the live summary too', () => {
    const { sessions } = shapeRecentSessions({
      firstName: 'Ana',
      active: { lastActivity: d(14), liveSummary: 'The student is simplifying \\(\\frac{6}{8}\\).' },
    });
    expect(sessions[0].summary).toBe('Ana is simplifying 6/8.');
  });

  test('caps listed completed rows at the limit', () => {
    const completed = Array.from({ length: 10 }, (_, i) => ({ lastActivity: d(i + 1), summary: `Ana did thing ${i}.`, activeMinutes: 3 }));
    const { sessions, hiddenShortSessions } = shapeRecentSessions({ completed, limit: 6 });
    expect(sessions).toHaveLength(6);
    expect(hiddenShortSessions).toBe(0);
  });
});

describe('generateSessionSummary', () => {
  beforeEach(() => callLLM.mockReset());

  const convo = (over = {}) => ({
    messages: [
      { role: 'assistant', content: 'Let us solve 2x + 3 = 7, Ana.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:...' } }] },
      { role: 'user', content: 'x = 2' },
    ],
    currentTopic: 'linear equations',
    problemsAttempted: 1,
    problemsCorrect: 1,
    ...over,
  });
  const reply = (text) => ({ choices: [{ message: { content: text } }] });

  test('prompt is third person, names no "undefined", and withholds a percentage for one problem', async () => {
    callLLM.mockResolvedValue(reply('[Student] solved a linear equation correctly.'));
    const out = await generateSessionSummary(convo(), 'Ana Lopez');

    const [, messages, options] = callLLM.mock.calls[0];
    const prompt = messages.map(m => m.content).join('\n');
    expect(prompt).toMatch(/Write in third person about the student\. Never write as the tutor/);
    expect(prompt).toMatch(/Refer to the student by the placeholder exactly as given: \[Student\]/);
    expect(prompt).not.toMatch(/undefined/);
    expect(prompt).not.toMatch(/\[object Object\]/);
    expect(prompt).toContain('Student: [image upload]');
    expect(prompt).toContain('Tutor: Let us solve');
    expect(prompt).not.toMatch(/\d+% accuracy/);
    expect(prompt).toMatch(/give the count, never a percentage/);
    // The placeholder round-trips to the child's first name.
    expect(options.anonContext.rehydrate('[Student]')).toBe('Ana');
    expect(out).toBe('Ana solved a linear equation correctly.');
  });

  test('a tutor-voiced reply that cannot be repaired falls back to the template', async () => {
    callLLM.mockResolvedValue(reply('I was so proud of Ana today; she nailed it.'));
    const out = await generateSessionSummary(convo({ activeMinutes: 12 }), 'Ana Lopez');
    expect(out).toBe('Ana worked on linear equations for 12 minutes. They answered 1 of 1 correctly (too few to judge accuracy).');
  });

  test('repairable first person is repaired, not discarded', async () => {
    callLLM.mockResolvedValue(reply('The student and I worked on linear equations. We focused on isolating x.'));
    const out = await generateSessionSummary(convo(), 'Ana Lopez');
    expect(out).toBe('Ana and the tutor worked on linear equations. Ana focused on isolating x.');
  });

  test('failure fallback never says "undefined minutes"', async () => {
    callLLM.mockRejectedValue(new Error('boom'));
    const out = await generateSessionSummary(convo({ activeMinutes: undefined }), 'Ana Lopez');
    expect(out).toBe('Session completed - 0 minutes of active learning');
  });

  test('detectTopic and transcriptLines tolerate non-string content', () => {
    expect(() => detectTopic([{ role: 'user', content: [{ type: 'image_url' }] }, { role: 'user' }])).not.toThrow();
    expect(transcriptLines([{ role: 'user', content: undefined }])).toBe('Student: ');
  });
});
