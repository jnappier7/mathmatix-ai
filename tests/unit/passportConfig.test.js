// tests/unit/passportConfig.test.js
// Unit tests for auth/passport-config.js — at minimum, generateUniqueUsername.

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../models/user', () => ({
  findOne: jest.fn()
}));

// Stub strategy modules so importing passport-config doesn't hit real OAuth wiring
jest.mock('passport-google-oauth20', () => ({ Strategy: jest.fn() }));
jest.mock('passport-microsoft',     () => ({ Strategy: jest.fn() }));
jest.mock('passport-oauth2',        () => jest.fn());
jest.mock('passport-local',         () => ({ Strategy: jest.fn() }));
jest.mock('passport',               () => ({
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn()
}));

// student.js exports a helper used during deserialization paths
jest.mock('../../routes/student', () => ({
  generateUniqueStudentLinkCode: jest.fn().mockReturnValue('ABCDEF')
}));

const User = require('../../models/user');
const { generateUniqueUsername } = require('../../auth/passport-config');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateUniqueUsername', () => {
  test('returns base username when not taken', async () => {
    User.findOne.mockResolvedValue(null);
    const r = await generateUniqueUsername('Sam Lee', 'g-12345abc');
    expect(r).toBe('samlee');
    expect(User.findOne).toHaveBeenCalledWith({ username: 'samlee' });
  });

  test('appends provider-id suffix when base is taken', async () => {
    User.findOne
      .mockResolvedValueOnce({ _id: 'existing' })   // base taken
      .mockResolvedValueOnce(null);                 // base_<suffix> available
    const r = await generateUniqueUsername('Sam Lee', 'abcdef-extra');
    expect(r).toBe('samlee_abcdef');
  });

  test('falls back to timestamp suffix when both base and suffixed are taken', async () => {
    User.findOne
      .mockResolvedValueOnce({ _id: 'existing' })   // base taken
      .mockResolvedValueOnce({ _id: 'existing' });  // suffixed taken
    const r = await generateUniqueUsername('Sam Lee', '123456-id');
    expect(r).toMatch(/^samlee_\d{4}$/);
  });

  test('strips internal whitespace and lowercases display name', async () => {
    User.findOne.mockResolvedValue(null);
    const r = await generateUniqueUsername('Sam   Le E', 'x');
    expect(r).toBe('samlee');
  });
});
