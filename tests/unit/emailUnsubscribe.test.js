/**
 * Marketing email opt-out — the token and the pieces every marketing sender
 * must carry (utils/emailUnsubscribe.js).
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
delete process.env.EMAIL_UNSUBSCRIBE_SECRET;

const mongoose = require('mongoose');
const U = require('../../utils/emailUnsubscribe');

const id = () => new mongoose.Types.ObjectId().toString();

describe('unsubscribe token', () => {
  test('round-trips kind and id', () => {
    const uid = id();
    const t = U.signUnsubscribeToken({ kind: 'user', id: uid });
    expect(U.verifyUnsubscribeToken(t)).toEqual({ kind: 'user', id: uid });
    const w = U.signUnsubscribeToken({ kind: 'waitlist', id: uid });
    expect(U.verifyUnsubscribeToken(w)).toEqual({ kind: 'waitlist', id: uid });
  });

  test('is URL-safe as-is (no characters a mail client would mangle)', () => {
    const t = U.signUnsubscribeToken({ kind: 'user', id: id() });
    expect(t).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(encodeURIComponent(t)).toBe(t);
  });

  test('rejects a tampered id, a tampered kind, a forged signature and junk', () => {
    const a = id(), b = id();
    const t = U.signUnsubscribeToken({ kind: 'user', id: a });
    const [kind, , sig] = t.split('.');
    expect(U.verifyUnsubscribeToken(`${kind}.${b}.${sig}`)).toBeNull();
    expect(U.verifyUnsubscribeToken(`waitlist.${a}.${sig}`)).toBeNull();
    expect(U.verifyUnsubscribeToken(`user.${a}.${'A'.repeat(sig.length)}`)).toBeNull();
    expect(U.verifyUnsubscribeToken(`user.${a}.${sig}x`)).toBeNull();
    expect(U.verifyUnsubscribeToken('')).toBeNull();
    expect(U.verifyUnsubscribeToken(undefined)).toBeNull();
    expect(U.verifyUnsubscribeToken({ toString: () => t })).toBeNull();
    expect(U.verifyUnsubscribeToken('user.not-an-id.sig')).toBeNull();
  });

  test('a token signed under another secret is not ours', () => {
    const uid = id();
    const t = U.signUnsubscribeToken({ kind: 'user', id: uid });
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'rotated';
    try {
      expect(U.verifyUnsubscribeToken(t)).toBeNull();
    } finally {
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    }
    expect(U.verifyUnsubscribeToken(t)).not.toBeNull();
  });

  test('refuses to sign without a secret or for an unknown kind', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(() => U.signUnsubscribeToken({ kind: 'user', id: id() })).toThrow(/SECRET/);
    } finally {
      process.env.SESSION_SECRET = saved;
    }
    expect(() => U.signUnsubscribeToken({ kind: 'teacher', id: id() })).toThrow(/kind/);
    expect(() => U.signUnsubscribeToken({ kind: 'user', id: 'nope' })).toThrow(/ObjectId/);
  });
});

describe('what a marketing send carries', () => {
  test('unsubscribeUrl points at /unsubscribe on the configured base, token encoded', () => {
    const uid = id();
    const url = U.unsubscribeUrl('user', uid, 'https://www.mathmatix.ai/');
    expect(url.startsWith('https://www.mathmatix.ai/unsubscribe?t=')).toBe(true);
    const t = decodeURIComponent(url.split('t=')[1]);
    expect(U.verifyUnsubscribeToken(t)).toEqual({ kind: 'user', id: uid });
  });

  test('RFC 2369 + RFC 8058 headers, with the mailto as a second channel', () => {
    const h = U.marketingHeaders('https://x/unsubscribe?t=abc', 'support@mathmatix.ai');
    expect(h['List-Unsubscribe']).toBe('<https://x/unsubscribe?t=abc>, <mailto:support@mathmatix.ai?subject=unsubscribe>');
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(U.marketingHeaders('https://x/u')['List-Unsubscribe']).toBe('<https://x/u>');
  });

  test('footer links the unsubscribe URL and carries the mailing address', () => {
    const html = U.marketingFooterHtml('https://x/unsubscribe?t=abc', { mailingAddress: '123 Main St', reason: 'You have an account.' });
    expect(html).toContain('href="https://x/unsubscribe?t=abc"');
    expect(html).toContain('123 Main St');
    expect(html).toContain('You have an account.');
  });

  test('the audience clause excludes only an explicit opt-out (absent field is in)', () => {
    expect(U.marketingOptOutFilter()).toEqual({ 'emailPreferences.marketingOptOut': { $ne: true } });
    expect(U.hasMarketingOptOut({})).toBe(false);
    expect(U.hasMarketingOptOut({ emailPreferences: {} })).toBe(false);
    expect(U.hasMarketingOptOut({ emailPreferences: { marketingOptOut: true } })).toBe(true);
    expect(U.hasMarketingOptOut(null)).toBe(false);
  });
});
