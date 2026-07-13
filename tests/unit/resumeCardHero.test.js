/**
 * resume-card heroHTML RENDER TESTS
 *
 * Locks the lifecycle framing at the render layer: the right content per state,
 * a single primary CTA carrying a promptable action, and — the governing rule —
 * no punishing accuracy percentage anywhere.
 *
 * heroHTML is pure string-building; the module guards its window/document use, so
 * it loads in the default node test environment (no jsdom dependency needed).
 */

const { heroHTML } = require('../../public/js/resume-card');

describe('heroHTML', () => {
  test('first_session renders an invitation with a warm-up CTA, no zeros', () => {
    const html = heroHTML({ cardState: 'first_session', weeklyStats: { problemsSolved: 0, problemsCorrect: 0 } });
    expect(html).toContain('Your journey starts here');
    expect(html).toContain('Start the warm-up');
    expect(html).toContain('data-rc-prompt');
    expect(html).not.toContain('0%');
  });

  test('progress leads with the mastery bar and an honest week, ends with continue', () => {
    const html = heroHTML({
      cardState: 'progress',
      currentLearning: { displayName: 'Fractions', progress: 50 },
      weeklyStats: { problemsSolved: 9, problemsCorrect: 3, accuracy: null },
      reviewDue: 2,
    });
    expect(html).toContain('Fractions');
    expect(html).toContain('width: 50%');
    expect(html).toContain('3 first-try wins');
    expect(html).toContain('Continue Fractions');
    expect(html).toContain('2 skills ready to review'); // FSRS alt CTA
    // The governing rule: never a verdict percentage.
    expect(html).not.toContain('accuracy');
    expect(html).not.toContain('33%');
  });

  test('struggling names persistence and offers a gentler on-ramp, no percentage', () => {
    const html = heroHTML({
      cardState: 'struggling',
      currentLearning: { displayName: 'Order of operations', progress: 35 },
      weeklyStats: { problemsSolved: 8, problemsCorrect: 1 },
    });
    expect(html).toContain("didn't quit");
    expect(html).toContain('8 tricky problems');
    expect(html).toContain('Review the tricky part together');
    expect(html).toContain('easier warm-up');
    expect(html).not.toContain('12%'); // 1/8 must never surface as a verdict
    expect(html).not.toContain('accuracy');
  });

  test('mastery celebrates and opens the next skill', () => {
    const html = heroHTML({
      cardState: 'mastery',
      recentMastery: { displayName: 'Order of operations' },
      nextReady: { displayName: 'Combining like terms' },
    });
    expect(html).toContain('skill mastered');
    expect(html).toContain('width: 100%');
    expect(html).toContain('Start Combining like terms');
  });

  test('progress with no active skill still gives a next step', () => {
    const html = heroHTML({
      cardState: 'progress',
      currentLearning: null,
      weeklyStats: { problemsSolved: 6, problemsCorrect: 4 },
    });
    expect(html).toContain('Keep practicing');
    expect(html).toContain('4 first-try wins');
  });

  test('escapes text interpolated into markup', () => {
    const html = heroHTML({
      cardState: 'progress',
      currentLearning: { displayName: '<img src=x>', progress: 10 },
      weeklyStats: { problemsSolved: 1, problemsCorrect: 0 },
    });
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });
});
