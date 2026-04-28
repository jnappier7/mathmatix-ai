// tests/unit/fieldEncryption.test.js
// Unit tests for AES-256-GCM field-level encryption (utils/fieldEncryption.js)

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const crypto = require('crypto');

const TEST_KEY = crypto.randomBytes(32).toString('hex');

// Important: the module reads FIELD_ENCRYPTION_KEY lazily inside getKey(),
// so we set it before requiring the module to keep things tidy.
process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;

const { encrypt, decrypt, isEncrypted, encryptFields } = require('../../utils/fieldEncryption');

describe('encrypt / decrypt round-trip', () => {
  test('encrypts and decrypts a plain string', () => {
    const plain = 'student@example.com';
    const cipher = encrypt(plain);
    expect(cipher.startsWith('enc:')).toBe(true);
    expect(cipher).not.toContain(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  test('produces a different ciphertext each call (random IV)', () => {
    expect(encrypt('hello')).not.toBe(encrypt('hello'));
  });

  test('isEncrypted detects enc: prefix', () => {
    expect(isEncrypted(encrypt('x'))).toBe(true);
    expect(isEncrypted('not-encrypted')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(123)).toBe(false);
  });
});

describe('encrypt — edge cases', () => {
  test('passes through null/undefined unchanged', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeUndefined();
  });

  test('passes through empty string unchanged', () => {
    expect(encrypt('')).toBe('');
  });

  test('graceful degradation: returns plaintext when key is missing', () => {
    const original = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    jest.resetModules();
    const noKey = require('../../utils/fieldEncryption');
    expect(noKey.encrypt('hello')).toBe('hello');
    process.env.FIELD_ENCRYPTION_KEY = original;
    jest.resetModules();
  });

  test('rejects malformed key (wrong length)', () => {
    const original = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = 'short-not-64-hex';
    jest.resetModules();
    const badKey = require('../../utils/fieldEncryption');
    expect(badKey.encrypt('hello')).toBe('hello'); // graceful fallback
    process.env.FIELD_ENCRYPTION_KEY = original;
    jest.resetModules();
  });
});

describe('decrypt — edge cases', () => {
  test('passes plaintext through when value is not enc:-prefixed', () => {
    expect(decrypt('plain')).toBe('plain');
  });

  test('passes null/empty values through unchanged', () => {
    expect(decrypt(null)).toBeNull();
    expect(decrypt('')).toBe('');
  });

  test('returns original on malformed enc: payload', () => {
    expect(decrypt('enc:bad')).toBe('enc:bad'); // wrong number of parts
  });

  test('returns original (not throw) when authTag is wrong', () => {
    const goodCipher = encrypt('payload');
    // Tamper with the data segment to invalidate the auth tag
    const parts = goodCipher.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    const tampered = parts.join(':');
    // Should not throw; degrades to returning the encrypted blob
    expect(decrypt(tampered)).toBe(tampered);
  });
});

describe('encryptFields mongoose plugin', () => {
  function makeFakeSchema() {
    const hooks = {};
    return {
      pre: jest.fn((evt, cb) => { hooks[`pre:${evt}`] = cb; }),
      post: jest.fn((evt, cb) => { hooks[`post:${evt}`] = cb; }),
      _hooks: hooks
    };
  }

  test('is a no-op when no fields requested', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: [] });
    expect(schema.pre).not.toHaveBeenCalled();
    expect(schema.post).not.toHaveBeenCalled();
  });

  test('registers pre-save and post-find hooks when fields are present', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: ['email', 'lastName'] });
    expect(schema.pre).toHaveBeenCalledWith('save', expect.any(Function));
    expect(schema.post).toHaveBeenCalledWith('find', expect.any(Function));
    expect(schema.post).toHaveBeenCalledWith('findOne', expect.any(Function));
    expect(schema.post).toHaveBeenCalledWith('findOneAndUpdate', expect.any(Function));
  });

  test('pre-save hook encrypts unencrypted values, leaves already-encrypted values alone', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: ['email'] });
    const preSave = schema._hooks['pre:save'];

    const set = jest.fn();
    const ctx = {
      get: (f) => f === 'email' ? 'jane@example.com' : undefined,
      set
    };
    const next = jest.fn();
    preSave.call(ctx, next);

    expect(set).toHaveBeenCalledWith('email', expect.stringMatching(/^enc:/));
    expect(next).toHaveBeenCalled();
  });

  test('pre-save hook does not double-encrypt', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: ['email'] });
    const preSave = schema._hooks['pre:save'];
    const already = encrypt('jane@example.com');
    const set = jest.fn();
    preSave.call({ get: () => already, set }, jest.fn());
    expect(set).not.toHaveBeenCalled();
  });

  test('post-find decrypts arrays and individual docs', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: ['email'] });

    const cipher = encrypt('jane@example.com');
    const docs = [{ email: cipher }, { email: cipher }];
    schema._hooks['post:find'](docs);
    expect(docs[0].email).toBe('jane@example.com');
    expect(docs[1].email).toBe('jane@example.com');

    const single = { email: cipher };
    schema._hooks['post:findOne'](single);
    expect(single.email).toBe('jane@example.com');
  });

  test('post-find tolerates null/undefined docs', () => {
    const schema = makeFakeSchema();
    encryptFields(schema, { fields: ['email'] });
    expect(schema._hooks['post:findOne'](null)).toBeNull();
  });

  test('plugin no-ops when key is not configured', () => {
    const original = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    jest.resetModules();
    const noKey = require('../../utils/fieldEncryption');
    const schema = { pre: jest.fn(), post: jest.fn() };
    noKey.encryptFields(schema, { fields: ['email'] });
    expect(schema.pre).not.toHaveBeenCalled();
    expect(schema.post).not.toHaveBeenCalled();
    process.env.FIELD_ENCRYPTION_KEY = original;
    jest.resetModules();
  });
});
