/**
 * Field-Level Encryption for Sensitive Student PII
 *
 * Encrypts/decrypts individual fields (email, IEP data, etc.) using
 * AES-256-GCM before storage in MongoDB. This protects student data
 * even if the database is compromised.
 *
 * SETUP:
 *   1. Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   2. Set FIELD_ENCRYPTION_KEY in .env (64 hex chars = 32 bytes)
 *
 * USAGE:
 *   const { encrypt, decrypt } = require('../utils/fieldEncryption');
 *   const encrypted = encrypt('student@example.com');  // { iv, tag, data }
 *   const email = decrypt(encrypted);                  // 'student@example.com'
 *
 * The Mongoose plugin (encryptFields) can be applied to any schema to
 * automatically encrypt/decrypt specified fields on save/find.
 *
 * @module fieldEncryption
 */

const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Returns null if not configured (encryption disabled gracefully).
 */
function getKey() {
    const hex = process.env.FIELD_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        return null;
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a compact string: iv:tag:ciphertext (all base64).
 *
 * @param {string} plaintext - The value to encrypt
 * @returns {string|null} Encrypted string, or null if encryption is disabled
 */
function encrypt(plaintext) {
    if (plaintext == null || plaintext === '') return plaintext;

    const key = getKey();
    if (!key) return plaintext; // Graceful degradation: store plaintext if no key configured

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(plaintext), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    // Compact format: enc:iv:tag:data (prefix lets us detect encrypted values)
    return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * If the value doesn't have the enc: prefix, returns it as-is (plaintext fallback).
 *
 * @param {string} encrypted - The encrypted value
 * @returns {string} Decrypted plaintext
 */
function decrypt(encrypted) {
    if (encrypted == null || encrypted === '') return encrypted;
    if (typeof encrypted !== 'string' || !encrypted.startsWith('enc:')) return encrypted;

    const key = getKey();
    if (!key) {
        logger.warn('[FieldEncryption] Cannot decrypt: FIELD_ENCRYPTION_KEY not set');
        return encrypted;
    }

    try {
        const parts = encrypted.split(':');
        if (parts.length !== 4) return encrypted;

        const iv = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const data = parts[3];

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        logger.error('[FieldEncryption] Decryption failed', { error: err.message });
        return encrypted; // Return encrypted value rather than crash
    }
}

/**
 * Check if a value is encrypted (has the enc: prefix).
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith('enc:');
}

/**
 * Mongoose plugin: automatically encrypt specified fields on save
 * and decrypt on find/findOne.
 *
 * Usage:
 *   schema.plugin(encryptFields, { fields: ['email', 'lastName'] });
 *
 * @param {Schema} schema - Mongoose schema
 * @param {Object} options - { fields: string[] }
 */
function encryptFields(schema, options = {}) {
    const fields = options.fields || [];
    if (fields.length === 0) return;

    // Only activate if encryption key is configured
    if (!getKey()) {
        logger.info('[FieldEncryption] Plugin loaded but FIELD_ENCRYPTION_KEY not set — fields stored in plaintext');
        return;
    }

    // Encrypt before save
    schema.pre('save', function (next) {
        for (const field of fields) {
            const value = this.get(field);
            if (value && !isEncrypted(value)) {
                this.set(field, encrypt(value));
            }
        }
        next();
    });

    // Decrypt after find
    const decryptDoc = (doc) => {
        if (!doc) return doc;
        for (const field of fields) {
            const value = doc[field];
            if (value && isEncrypted(value)) {
                doc[field] = decrypt(value);
            }
        }
        return doc;
    };

    schema.post('find', function (docs) {
        if (Array.isArray(docs)) docs.forEach(decryptDoc);
    });

    schema.post('findOne', decryptDoc);
    schema.post('findOneAndUpdate', decryptDoc);

    logger.info('[FieldEncryption] Plugin active', { fields });
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
    encryptFields
};
