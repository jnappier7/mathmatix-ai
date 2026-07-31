/**
 * resume-card RENDER TESTS
 *
 * Locks the lifecycle framing at the render layer: the right content per state,
 * a single primary CTA carrying a promptable action, and — the governing rule —
 * no punishing accuracy percentage anywhere.
 *
 * Both functions are pure string-building; the module guards its window/document
 * use, so it loads in the default node test environment (no jsdom needed).
 *
 * The division of labour between them is the thing worth protecting: the hero
 * makes ONE recommendation, and every other way to start lives in the chip row.
 * The hero used to carry the review CTA and a skill-map link as well, which
 * stacked three competing next steps above a four-item resume list.
 */

const { heroHTML, startHereHTML } = require('../../public/js/resume-card');

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
    // ONE call to action. Review is a real intent, but it belongs to the chip
    // row — offering it here too gave the hero three buttons competing to be
    // the next step.
    expect(html).not.toContain('ready to review');
    expect(html).not.toContain('skill-map.html');
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

describe('startHereHTML', () => {
  const withCourse = {
    isReturningUser: true,
    courses: [{ courseSessionId: 'cs1', courseName: 'ACT Math Prep' }],
  };

  test('always asks the question and always offers homework and an escape hatch', () => {
    const html = startHereHTML({}, {});
    expect(html).toContain('What do you want to work on today?');
    expect(html).toContain('Help with my homework');
    expect(html).toContain('Something else');
    // Every chip has to actually do something — a prompt, a course, or a link.
    const chips = html.match(/class="rc-chip"/g) || [];
    const wired = html.match(/data-rc-prompt=|data-course-id=|href=/g) || [];
    expect(chips.length).toBeGreaterThan(0);
    expect(wired.length).toBe(chips.length);
  });

  test('offers the ladder only when the hero has no skill to continue', () => {
    expect(startHereHTML({}, {})).toContain('Work on my next skill');
    // The hero is already rendering "Continue Fractions" in this state; a chip
    // saying the same thing is the same button twice.
    const withLearning = startHereHTML({}, { currentLearning: { displayName: 'Fractions' } });
    expect(withLearning).not.toContain('Work on my next skill');
  });

  test('offers review only when something is actually due, and counts it', () => {
    expect(startHereHTML({}, { reviewDue: 0 })).not.toContain('Review');
    expect(startHereHTML({}, { reviewDue: 1 })).toContain('Review 1 skill<');
    expect(startHereHTML({}, { reviewDue: 3 })).toContain('Review 3 skills');
  });

  test('offers the course only when enrolled, and resumes rather than prompts', () => {
    expect(startHereHTML({ isReturningUser: true, courses: [] }, {})).not.toContain('Keep going in');
    const html = startHereHTML(withCourse, {});
    expect(html).toContain('Keep going in ACT Math Prep');
    // Resuming a course is a course-manager call, not a message to the tutor.
    expect(html).toContain('data-course-id="cs1"');
  });

  test('the skill map navigates instead of messaging the tutor', () => {
    const html = startHereHTML({}, {});
    expect(html).toMatch(/<a class="rc-chip" href="\/skill-map\.html">/);
  });

  test('escapes a course name interpolated into markup', () => {
    const html = startHereHTML({
      isReturningUser: true,
      courses: [{ courseSessionId: '"><img src=x>', courseName: '<img src=x>' }],
    }, {});
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });
});
