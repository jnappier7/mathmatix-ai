// tests/unit/phoneLinkAuth.test.js
// Unit tests for the "scan with your phone" capability token + PIN logic.
// Exercises mintCredentials() and verifyPin() directly — no DB I/O. verifyPin
// is handed a fake link doc with a jest.fn() save(), so we assert on its
// mutations (attempt count, burn-on-lockout) without mongoose.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PhoneLink = require('../../models/phoneLink');
const {
  hashToken,
  mintCredentials,
  verifyPin,
  PIN_DIGITS
} = require('../../utils/phoneLinkAuth');

// Build a fake link doc around a known PIN.
async function fakeLink(pin, overrides = {}) {
  return {
    pinHash: await bcrypt.hash(pin, 8),
    status: 'awaiting_upload',
    pinAttempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    image: { data: Buffer.from('x'), mimeType: 'image/jpeg', size: 1, originalName: 'a.jpg' },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('hashToken', () => {
  test('is the deterministic sha256 hex of the token', () => {
    const t = 'abc123';
    const expected = crypto.createHash('sha256').update(t).digest('hex');
    expect(hashToken(t)).toBe(expected);
    expect(hashToken(t)).toBe(hashToken(t));
  });

  test('different tokens hash differently', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('mintCredentials', () => {
  test('produces a zero-padded numeric PIN of the configured length', async () => {
    const { pin } = await mintCredentials();
    expect(pin).toMatch(new RegExp(`^[0-9]{${PIN_DIGITS}}$`));
  });

  test('tokenHash matches sha256 of the raw token; raw token is URL-safe', async () => {
    const { token, tokenHash } = await mintCredentials();
    expect(tokenHash).toBe(hashToken(token));
    // base64url alphabet only — safe to drop straight into a query string.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('pinHash verifies against the cleartext PIN and nothing else', async () => {
    const { pin, pinHash } = await mintCredentials();
    expect(await bcrypt.compare(pin, pinHash)).toBe(true);
    const wrong = String((Number(pin) + 1) % 10 ** PIN_DIGITS).padStart(PIN_DIGITS, '0');
    expect(await bcrypt.compare(wrong, pinHash)).toBe(false);
  });

  test('expiresAt is in the future and within the link TTL window', async () => {
    const { expiresAt } = await mintCredentials();
    const ms = expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(PhoneLink.TTL_MINUTES * 60 * 1000 + 1000);
  });

  test('successive mints yield distinct tokens and (almost surely) varied PINs', async () => {
    const a = await mintCredentials();
    const b = await mintCredentials();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('verifyPin', () => {
  test('accepts the correct PIN without consuming an attempt', async () => {
    const link = await fakeLink('1234');
    const res = await verifyPin(link, '1234');
    expect(res.ok).toBe(true);
    expect(link.pinAttempts).toBe(0);
    expect(link.save).not.toHaveBeenCalled();
  });

  test('rejects a null link as bad_pin', async () => {
    const res = await verifyPin(null, '1234');
    expect(res).toEqual({ ok: false, reason: 'bad_pin' });
  });

  test('rejects and increments on a wrong PIN', async () => {
    const link = await fakeLink('1234');
    const res = await verifyPin(link, '0000');
    expect(res).toEqual({ ok: false, reason: 'bad_pin' });
    expect(link.pinAttempts).toBe(1);
    expect(link.save).toHaveBeenCalledTimes(1);
  });

  test('treats an expired link as expired even with the right PIN', async () => {
    const link = await fakeLink('1234', { expiresAt: new Date(Date.now() - 1000) });
    const res = await verifyPin(link, '1234');
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  test('treats a consumed link as already_used', async () => {
    const link = await fakeLink('1234', { status: 'consumed' });
    const res = await verifyPin(link, '1234');
    expect(res).toEqual({ ok: false, reason: 'already_used' });
  });

  test('burns the link (locks + clears image) on the final wrong attempt', async () => {
    const max = PhoneLink.MAX_PIN_ATTEMPTS;
    const link = await fakeLink('1234', { pinAttempts: max - 1 });
    const res = await verifyPin(link, '9999');
    expect(res).toEqual({ ok: false, reason: 'locked' });
    expect(link.pinAttempts).toBe(max);
    expect(link.status).toBe('consumed');
    expect(link.image.data).toBeNull();
  });

  test('refuses further tries once already at the attempt cap', async () => {
    const link = await fakeLink('1234', { pinAttempts: PhoneLink.MAX_PIN_ATTEMPTS });
    const res = await verifyPin(link, '1234'); // even the correct PIN
    expect(res).toEqual({ ok: false, reason: 'locked' });
  });
});
