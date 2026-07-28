// tests/unit/growthStatus.test.js
//
// Thresholds carried over from the retired utils/growthCheck.js
// completeGrowthCheck(). They are pinned so history rows written before and
// after the retirement stay comparable — parent/teacher/admin growth panels and
// scripts/weeklyDigest.js read both.

const {
  classifyGrowth,
  growthMessage,
  GROWTH_STATUSES,
  GROWTH_MESSAGES,
} = require('../../utils/growthStatus');

describe('classifyGrowth', () => {
  test.each([
    [1.2, 'significant-growth'],
    [0.31, 'significant-growth'],
    [0.3, 'some-growth'], // boundary: strictly greater than 0.3
    [0.2, 'some-growth'],
    [0.11, 'some-growth'],
    [0.1, 'stable'], // boundary: strictly greater than 0.1
    [0, 'stable'],
    [-0.09, 'stable'],
    [-0.1, 'review-needed'], // boundary: strictly greater than -0.1
    [-0.5, 'review-needed'],
  ])('a theta change of %p is %s', (change, expected) => {
    expect(classifyGrowth(change)).toBe(expected);
  });

  test('every status it can return is in the user schema enum', () => {
    for (const change of [1, 0.2, 0, -1]) {
      expect(GROWTH_STATUSES).toContain(classifyGrowth(change));
    }
  });

  // A student with no usable prior estimate has not declined — telling them to
  // review would be a fabricated regression.
  test.each([[NaN], [undefined], [null], ['0.4'], [Infinity]])(
    'a non-finite change (%p) is stable, never review-needed',
    (change) => {
      expect(classifyGrowth(change)).toBe('stable');
    }
  );
});

describe('growthMessage', () => {
  test('every status has a student-facing sentence', () => {
    for (const status of GROWTH_STATUSES) {
      expect(typeof growthMessage(status)).toBe('string');
      expect(growthMessage(status).length).toBeGreaterThan(0);
      expect(growthMessage(status)).toBe(GROWTH_MESSAGES[status]);
    }
  });

  test('an unknown status falls back to the neutral sentence', () => {
    expect(growthMessage('not-a-status')).toBe(GROWTH_MESSAGES.stable);
    expect(growthMessage(undefined)).toBe(GROWTH_MESSAGES.stable);
  });
});
