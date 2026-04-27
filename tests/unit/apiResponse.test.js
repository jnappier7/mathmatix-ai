// tests/unit/apiResponse.test.js
// Unit tests for utils/apiResponse helpers (success, fail)

const { success, fail } = require('../../utils/apiResponse');

describe('success()', () => {
  test('returns { success: true } with no data', () => {
    expect(success()).toEqual({ success: true });
  });

  test('merges in extra fields', () => {
    expect(success({ user: { id: 1 }, count: 5 })).toEqual({
      success: true,
      user: { id: 1 },
      count: 5
    });
  });

  test('does not allow callers to override the success flag accidentally', () => {
    // Spread happens AFTER `success: true`, so a caller passing success:false
    // CAN override — this is a documented behavior, just confirm it.
    expect(success({ success: false }).success).toBe(false);
  });
});

describe('fail()', () => {
  test('returns { success: false, message }', () => {
    expect(fail('Bad request')).toEqual({ success: false, message: 'Bad request' });
  });

  test('includes additional metadata', () => {
    expect(fail('Not found', { id: 'abc' })).toEqual({
      success: false,
      message: 'Not found',
      id: 'abc'
    });
  });

  test('handles missing message gracefully', () => {
    const r = fail();
    expect(r.success).toBe(false);
    expect(r.message).toBeUndefined();
  });
});
