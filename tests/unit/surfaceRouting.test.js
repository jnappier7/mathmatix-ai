// tests/unit/surfaceRouting.test.js
// Unit tests for utils/surfaceRouting — the policy that combines
// req.surface with entitlement to decide voice vs text landing.

jest.mock('../../middleware/usageGate', () => ({
  hasPremiumAccess: jest.fn(),
}));

const { hasPremiumAccess } = require('../../middleware/usageGate');
const {
  VOICE_SURFACE_URL,
  TEXT_SURFACE_URL,
  shouldServeVoiceSurface,
  resolveStudentLandingUrl,
} = require('../../utils/surfaceRouting');

beforeEach(() => {
  hasPremiumAccess.mockReset();
});

describe('shouldServeVoiceSurface()', () => {
  test('returns false when req.surface is "text" — even for paid users', async () => {
    hasPremiumAccess.mockResolvedValue(true);
    const req = { surface: 'text' };
    expect(await shouldServeVoiceSurface(req, { _id: 'u1' })).toBe(false);
    // Entitlement check is skipped when surface preference says text
    expect(hasPremiumAccess).not.toHaveBeenCalled();
  });

  test('returns false when req.surface is missing entirely (defensive)', async () => {
    hasPremiumAccess.mockResolvedValue(true);
    expect(await shouldServeVoiceSurface({}, { _id: 'u1' })).toBe(false);
    expect(hasPremiumAccess).not.toHaveBeenCalled();
  });

  test('returns false when req is null', async () => {
    expect(await shouldServeVoiceSurface(null, { _id: 'u1' })).toBe(false);
    expect(hasPremiumAccess).not.toHaveBeenCalled();
  });

  test('returns true when surface is voice AND user has premium access', async () => {
    hasPremiumAccess.mockResolvedValue(true);
    const req = { surface: 'voice' };
    const user = { _id: 'u1', subscriptionTier: 'unlimited' };
    expect(await shouldServeVoiceSurface(req, user)).toBe(true);
    expect(hasPremiumAccess).toHaveBeenCalledWith(user);
  });

  test('returns false when surface is voice but user lacks premium access (option b safety net)', async () => {
    hasPremiumAccess.mockResolvedValue(false);
    const req = { surface: 'voice' };
    const user = { _id: 'u1', subscriptionTier: 'free' };
    expect(await shouldServeVoiceSurface(req, user)).toBe(false);
  });
});

describe('resolveStudentLandingUrl()', () => {
  test('returns voice URL for voice-surface paid user', async () => {
    hasPremiumAccess.mockResolvedValue(true);
    const url = await resolveStudentLandingUrl({ surface: 'voice' }, { _id: 'u1' });
    expect(url).toBe(VOICE_SURFACE_URL);
    expect(VOICE_SURFACE_URL).toBe('/voice-tutor.html');
  });

  test('returns text URL for voice-surface free user (paywall safety)', async () => {
    hasPremiumAccess.mockResolvedValue(false);
    const url = await resolveStudentLandingUrl({ surface: 'voice' }, { _id: 'u1' });
    expect(url).toBe(TEXT_SURFACE_URL);
    expect(TEXT_SURFACE_URL).toBe('/chat.html');
  });

  test('returns text URL for text-surface user regardless of tier', async () => {
    hasPremiumAccess.mockResolvedValue(true);
    const url = await resolveStudentLandingUrl({ surface: 'text' }, { _id: 'u1' });
    expect(url).toBe(TEXT_SURFACE_URL);
  });
});
