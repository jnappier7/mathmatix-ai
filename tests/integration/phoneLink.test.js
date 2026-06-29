// tests/integration/phoneLink.test.js
// Integration tests for the "scan with your phone" routes (routes/phoneLink.js).
//
// We mock only the data layer (PhoneLink / Conversation models), the logger,
// and the moderation middleware. The token/PIN logic (phoneLinkAuth), QR
// generation, and image processing (sharp) all run for real, so these tests
// exercise the genuine create → upload → poll → fetch → consume flow including
// ownership checks and PIN failure handling.

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

// Model mock: constructor unused (routes use statics), plus the constants the
// real phoneLinkAuth reads off the model.
jest.mock('../../models/phoneLink', () => {
  const PhoneLink = jest.fn();
  PhoneLink.create = jest.fn();
  PhoneLink.find = jest.fn();
  PhoneLink.findOne = jest.fn();
  PhoneLink.deleteOne = jest.fn();
  PhoneLink.TTL_MINUTES = 15;
  PhoneLink.MAX_PIN_ATTEMPTS = 5;
  return PhoneLink;
});

jest.mock('../../models/conversation', () => ({ findOne: jest.fn() }));

// Keep moderation/EXIF-validation out of the unit under test; it's the
// platform's own middleware and is exercised by its own suite.
jest.mock('../../middleware/uploadSecurity', () => ({
  validateUpload: (req, res, next) => next()
}));

const express = require('express');
const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');

const PhoneLink = require('../../models/phoneLink');
const Conversation = require('../../models/conversation');
const { desktopRouter, phoneRouter } = require('../../routes/phoneLink');

const USER = { _id: 'user-123' };

function makeDesktopApp(user = USER) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api/phone-link', desktopRouter);
  return app;
}

function makePhoneApp() {
  const app = express();
  app.use('/api/phone-upload', phoneRouter);
  return app;
}

// Chainable mock for PhoneLink.find().select().sort().lean()
function chainTo(result) {
  return { select: () => ({ sort: () => ({ lean: () => Promise.resolve(result) }) }) };
}
// Chainable mock for PhoneLink.findOne().select()
function findOneSelect(doc) {
  return { select: () => Promise.resolve(doc) };
}

async function makeLink(pin, overrides = {}) {
  return {
    pinHash: await bcrypt.hash(pin, 8),
    status: 'awaiting_upload',
    pinAttempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    image: { data: null, mimeType: null, size: null, originalName: null },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

let PNG;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .png().toBuffer();
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/phone-link/create', () => {
  test('mints a pairing with QR + 4-digit PIN when no conversation is named', async () => {
    PhoneLink.create.mockResolvedValue({});
    const res = await supertest(makeDesktopApp()).post('/api/phone-link/create').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pin).toMatch(/^[0-9]{4}$/);
    expect(res.body.linkUrl).toContain('/phone-upload?t=');
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    // Stores hashes (never the raw token/pin) bound to the user.
    const arg = PhoneLink.create.mock.calls[0][0];
    expect(arg.userId).toBe(USER._id);
    expect(arg.conversationId).toBeNull();
    expect(arg.tokenHash).toEqual(expect.any(String));
    expect(arg.pinHash).toEqual(expect.any(String));
    expect(res.body.linkUrl).not.toContain(arg.tokenHash); // URL carries raw token, not the hash
  });

  test('rejects a conversationId the caller does not own', async () => {
    Conversation.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const res = await supertest(makeDesktopApp())
      .post('/api/phone-link/create').send({ conversationId: 'someone-elses' });
    expect(res.status).toBe(404);
    expect(PhoneLink.create).not.toHaveBeenCalled();
  });

  test('accepts an owned conversationId', async () => {
    Conversation.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: 'c1' }) }) });
    PhoneLink.create.mockResolvedValue({});
    const res = await supertest(makeDesktopApp())
      .post('/api/phone-link/create').send({ conversationId: 'c1' });
    expect(res.status).toBe(200);
    expect(PhoneLink.create.mock.calls[0][0].conversationId).toBe('c1');
  });
});

describe('GET /api/phone-link/pending', () => {
  test('returns the current user\'s uploaded images, mapped for the tray', async () => {
    PhoneLink.find.mockReturnValue(chainTo([
      { _id: 'p1', thumbnail: 'data:image/webp;base64,AAA', image: { mimeType: 'image/jpeg', size: 10, originalName: 'a.jpg' }, createdAt: new Date() }
    ]));
    const res = await supertest(makeDesktopApp()).get('/api/phone-link/pending');
    expect(res.status).toBe(200);
    expect(PhoneLink.find).toHaveBeenCalledWith({ userId: USER._id, status: 'uploaded' });
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.pending[0]).toMatchObject({ id: 'p1', mimeType: 'image/jpeg' });
  });
});

describe('GET /api/phone-link/image/:id', () => {
  test('streams the image bytes for an owned upload', async () => {
    PhoneLink.findOne.mockReturnValue(findOneSelect({ image: { data: Buffer.from('hello'), mimeType: 'image/png' } }));
    const res = await supertest(makeDesktopApp()).get('/api/phone-link/image/p1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    // Ownership is enforced in the query, not just by user session.
    expect(PhoneLink.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'p1', userId: USER._id, status: 'uploaded' }));
  });

  test('404s when the upload is missing or not owned', async () => {
    PhoneLink.findOne.mockReturnValue(findOneSelect(null));
    const res = await supertest(makeDesktopApp()).get('/api/phone-link/image/nope');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/phone-link/consume/:id', () => {
  test('deletes an owned pairing', async () => {
    PhoneLink.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = await supertest(makeDesktopApp()).post('/api/phone-link/consume/p1').send({});
    expect(res.status).toBe(200);
    expect(PhoneLink.deleteOne).toHaveBeenCalledWith({ _id: 'p1', userId: USER._id });
  });

  test('404s when nothing was deleted', async () => {
    PhoneLink.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const res = await supertest(makeDesktopApp()).post('/api/phone-link/consume/p1').send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/phone-upload/:token', () => {
  test('accepts a valid token + PIN + image and parks it for the desktop', async () => {
    const link = await makeLink('1234');
    PhoneLink.findOne.mockResolvedValue(link);

    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(link.status).toBe('uploaded');
    expect(Buffer.isBuffer(link.image.data)).toBe(true);
    expect(link.thumbnail).toMatch(/^data:image\/webp;base64,/);
    expect(link.save).toHaveBeenCalled();
  });

  test('rejects a wrong PIN with 401 and does not store the image', async () => {
    const link = await makeLink('1234');
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '0000')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
    expect(link.status).toBe('awaiting_upload');
    expect(link.image.data).toBeNull();
  });

  test('returns 410 for an expired link', async () => {
    const link = await makeLink('1234', { expiresAt: new Date(Date.now() - 1000) });
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(410);
  });

  test('returns 409 for an already-consumed link', async () => {
    const link = await makeLink('1234', { status: 'consumed' });
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(409);
  });

  test('returns 423 once the PIN attempt cap is hit', async () => {
    const link = await makeLink('1234', { pinAttempts: PhoneLink.MAX_PIN_ATTEMPTS });
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(423);
  });

  test('401s for an unknown token (PIN check never reached)', async () => {
    PhoneLink.findOne.mockResolvedValue(null);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/bogus')
      .field('pin', '1234')
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  test('400s when the PIN is valid but no file is attached', async () => {
    const link = await makeLink('1234');
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234');
    expect(res.status).toBe(400);
  });

  test('rejects a non-image file type', async () => {
    const link = await makeLink('1234');
    PhoneLink.findOne.mockResolvedValue(link);
    const res = await supertest(makePhoneApp())
      .post('/api/phone-upload/raw-token')
      .field('pin', '1234')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
