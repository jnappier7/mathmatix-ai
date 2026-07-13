// utils/phoneLinkAuth.js
//
// Mint and validate the capability token + PIN that pair a phone to a
// desktop session for the "scan with your phone" feature.
//
// Security model:
//   - Token: 32 random bytes, base64url. This IS the capability — knowing it
//     (plus the PIN) lets an anonymous phone attach one image to the linked
//     user's session. Stored only as a SHA-256 hash; looked up by hash so a
//     DB read never exposes a usable token.
//   - PIN: 4 digits, shown on the desktop screen. Defends the narrow case of
//     a leaked/shoulder-surfed link. bcrypt-hashed (low entropy) and
//     attempt-capped (PhoneLink.MAX_PIN_ATTEMPTS) so it can't be brute-forced
//     within the link's short TTL.
//
// This module does NOT mutate the DB — callers create/save the PhoneLink. It
// only generates secrets and verifies a presented (token, pin) pair against a
// loaded document, reporting whether the link is still usable.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PhoneLink = require('../models/phoneLink');

const TOKEN_BYTES = 32;
const PIN_DIGITS = 4;
const BCRYPT_ROUNDS = 10;

/** SHA-256 hex of a raw token. Deterministic so we can look links up by it. */
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate the secrets for a new link.
 * @returns {Promise<{token: string, tokenHash: string, pin: string, pinHash: string, expiresAt: Date}>}
 *   `token` and `pin` are the cleartext values to hand to the client ONCE
 *   (token → QR/URL, pin → on-screen). Only the hashes get persisted.
 */
async function mintCredentials() {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    // Zero-padded numeric PIN, e.g. "0042". randomInt is uniform & unbiased.
    const pin = String(crypto.randomInt(0, 10 ** PIN_DIGITS)).padStart(PIN_DIGITS, '0');

    const tokenHash = hashToken(token);
    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + PhoneLink.TTL_MINUTES * 60 * 1000);

    return { token, tokenHash, pin, pinHash, expiresAt };
}

/**
 * Look up a live link by its raw token. Returns the PhoneLink doc or null.
 * (TTL reaps expired docs, but reaping can lag by up to a minute, so callers
 * must still treat an expiresAt in the past as invalid — see verifyPin.)
 */
async function findByToken(rawToken) {
    if (typeof rawToken !== 'string' || rawToken.length === 0) return null;
    return PhoneLink.findOne({ tokenHash: hashToken(rawToken) });
}

/**
 * Verify a presented PIN against a loaded link, enforcing expiry, status, and
 * the attempt cap. Mutates and saves the link's pinAttempts on a wrong PIN,
 * burning it (status → consumed, image cleared) once the cap is hit.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 *   reason ∈ 'expired' | 'already_used' | 'locked' | 'bad_pin'
 */
async function verifyPin(link, presentedPin) {
    if (!link) return { ok: false, reason: 'bad_pin' };

    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
        return { ok: false, reason: 'expired' };
    }
    if (link.status === 'consumed') {
        return { ok: false, reason: 'already_used' };
    }
    if (link.pinAttempts >= PhoneLink.MAX_PIN_ATTEMPTS) {
        return { ok: false, reason: 'locked' };
    }

    const match = typeof presentedPin === 'string'
        && await bcrypt.compare(presentedPin, link.pinHash);

    if (!match) {
        link.pinAttempts += 1;
        if (link.pinAttempts >= PhoneLink.MAX_PIN_ATTEMPTS) {
            // Burn the link so a captured token can't be retried later.
            link.status = 'consumed';
            link.image = { data: null, mimeType: null, size: null, originalName: null };
        }
        await link.save();
        return { ok: false, reason: link.pinAttempts >= PhoneLink.MAX_PIN_ATTEMPTS ? 'locked' : 'bad_pin' };
    }

    return { ok: true };
}

module.exports = {
    hashToken,
    mintCredentials,
    findByToken,
    verifyPin,
    TOKEN_BYTES,
    PIN_DIGITS
};
