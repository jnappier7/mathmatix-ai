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
const { generateUniqueUsername, verifyLocalLogin } = require('../../auth/passport-config');
const bcrypt = require('bcryptjs');

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

describe('email + password sign-in (verifyLocalLogin)', () => {
  // An account made through Google, Microsoft or Clever has no passwordHash.
  // bcrypt.compare(password, undefined) throws, so typing such an account's
  // email into the password form used to answer 500 — a broken page for the
  // student, and a tell for anyone probing which emails are SSO accounts.
  const run = (email, password) => new Promise((resolve) => {
    verifyLocalLogin(email, password, (err, user, info) => resolve({ err, user, info }));
  });
  const WRONG = { message: 'Incorrect email or password.' };

  test('an SSO account with no password is a failed sign-in, not an error', async () => {
    User.findOne.mockResolvedValue({ username: 'sso', googleId: 'g-1' });
    expect(await run('sso@example.com', 'anything')).toEqual({ err: null, user: false, info: WRONG });
  });

  test('an empty-string hash is treated the same way', async () => {
    User.findOne.mockResolvedValue({ username: 'sso', passwordHash: '' });
    expect(await run('sso@example.com', '')).toEqual({ err: null, user: false, info: WRONG });
  });

  test('no such account and a wrong password give the same answer', async () => {
    User.findOne.mockResolvedValue(null);
    const none = await run('nobody@example.com', 'pw');
    User.findOne.mockResolvedValue({ username: 'ava', passwordHash: bcrypt.hashSync('right', 4) });
    const wrong = await run('ava@example.com', 'not-right');
    expect(none).toEqual({ err: null, user: false, info: WRONG });
    expect(wrong).toEqual(none);
  });

  test('the right password signs in, with the email trimmed and lower-cased', async () => {
    const account = { username: 'ava', passwordHash: bcrypt.hashSync('right', 4) };
    User.findOne.mockResolvedValue(account);
    const out = await run('  Ava@Example.com ', 'right');
    expect(out.user).toBe(account);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'ava@example.com' });
  });

  test('a database failure is still reported as an error', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const out = await run('ava@example.com', 'right');
    expect(out.err).toBeInstanceOf(Error);
  });
});
