/**
 * Avatar session route — pure helper tests
 *
 * Covers face-ID resolution (per-tutor, optional env, default fallback,
 * none-configured) and the transient-error classifier that drives retry.
 */

// Reset module + env between tests so env-driven branches are isolated.
function loadHelpersWithEnv(overrides = {}) {
  jest.resetModules();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SIMLI_FACE_')) delete process.env[key];
  }
  Object.assign(process.env, overrides);
  return require('../../routes/avatarSession').__helpers;
}

describe('resolveFaceId', () => {
  test('returns the per-tutor hardcoded default when no env override', () => {
    const { resolveFaceId } = loadHelpersWithEnv();
    const r = resolveFaceId('bob');
    expect(r.source).toBe('tutor');
    expect(r.faceId).toMatch(/[0-9a-f-]{30,}/);
  });

  test('env override wins over hardcoded tutor face', () => {
    const { resolveFaceId } = loadHelpersWithEnv({ SIMLI_FACE_BOB: 'env-bob-face' });
    expect(resolveFaceId('bob')).toEqual({ faceId: 'env-bob-face', source: 'tutor' });
  });

  test('optional tutor uses env when set', () => {
    const { resolveFaceId } = loadHelpersWithEnv({ SIMLI_FACE_DR_G: 'dr-g-face' });
    expect(resolveFaceId('dr-g')).toEqual({ faceId: 'dr-g-face', source: 'tutor' });
  });

  test('optional tutor without env falls back to SIMLI_FACE_DEFAULT', () => {
    const { resolveFaceId } = loadHelpersWithEnv({ SIMLI_FACE_DEFAULT: 'fallback-face' });
    expect(resolveFaceId('dr-g')).toEqual({ faceId: 'fallback-face', source: 'fallback' });
  });

  test('unknown tutor with no default returns source:none', () => {
    const { resolveFaceId } = loadHelpersWithEnv();
    expect(resolveFaceId('does-not-exist')).toEqual({ faceId: null, source: 'none' });
  });

  test('unknown tutor with default falls back', () => {
    const { resolveFaceId } = loadHelpersWithEnv({ SIMLI_FACE_DEFAULT: 'd' });
    expect(resolveFaceId('does-not-exist')).toEqual({ faceId: 'd', source: 'fallback' });
  });
});

describe('isTransientError', () => {
  let isTransientError;
  beforeAll(() => {
    isTransientError = loadHelpersWithEnv().isTransientError;
  });

  test('treats 5xx responses as transient', () => {
    expect(isTransientError({ response: { status: 500 } })).toBe(true);
    expect(isTransientError({ response: { status: 502 } })).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
    expect(isTransientError({ response: { status: 504 } })).toBe(true);
  });

  test('treats network/timeout errors as transient', () => {
    expect(isTransientError({ code: 'ECONNABORTED' })).toBe(true);
    expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientError({ code: 'ENOTFOUND' })).toBe(true);
  });

  test('does not retry 4xx (auth / bad SDP / etc.)', () => {
    expect(isTransientError({ response: { status: 400 } })).toBe(false);
    expect(isTransientError({ response: { status: 401 } })).toBe(false);
    expect(isTransientError({ response: { status: 403 } })).toBe(false);
    expect(isTransientError({ response: { status: 422 } })).toBe(false);
  });

  test('handles missing error fields gracefully', () => {
    expect(isTransientError({})).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
