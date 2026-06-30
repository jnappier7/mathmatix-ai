const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isImageStillActive,
  buildImageDataUrl,
  downscaleToDataUrl,
  ACTIVE_IMAGE_TTL_MINUTES,
  MAX_IMAGE_BYTES,
} = require('../../utils/activeWorksheetImage');
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* skip downscale tests if absent */ }

const NOW = new Date('2026-06-30T12:00:00Z').getTime();
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

describe('activeWorksheetImage — isImageStillActive', () => {
  const img = (over = {}) => ({ fileType: 'image', filePath: '/uploads/x.jpg', uploadedAt: minsAgo(5), ...over });

  it('accepts a fresh image within the TTL', () => {
    expect(isImageStillActive(img(), NOW)).toBe(true);
  });

  it('rejects an image older than the TTL', () => {
    expect(isImageStillActive(img({ uploadedAt: minsAgo(ACTIVE_IMAGE_TTL_MINUTES + 1) }), NOW)).toBe(false);
  });

  it('accepts an image exactly at the TTL boundary', () => {
    expect(isImageStillActive(img({ uploadedAt: minsAgo(ACTIVE_IMAGE_TTL_MINUTES) }), NOW)).toBe(true);
  });

  it('rejects non-image docs (e.g. pdf)', () => {
    expect(isImageStillActive(img({ fileType: 'pdf' }), NOW)).toBe(false);
  });

  it('rejects docs without a filePath', () => {
    expect(isImageStillActive(img({ filePath: null }), NOW)).toBe(false);
  });

  it('rejects null/undefined and bad timestamps', () => {
    expect(isImageStillActive(null, NOW)).toBe(false);
    expect(isImageStillActive(undefined, NOW)).toBe(false);
    expect(isImageStillActive(img({ uploadedAt: 'not-a-date' }), NOW)).toBe(false);
    expect(isImageStillActive(img({ uploadedAt: null }), NOW)).toBe(false);
  });

  it('rejects a future-dated upload (clock skew guard)', () => {
    expect(isImageStillActive(img({ uploadedAt: minsAgo(-10) }), NOW)).toBe(false);
  });

  it('honors a custom ttl argument', () => {
    expect(isImageStillActive(img({ uploadedAt: minsAgo(10) }), NOW, 5)).toBe(false);
    expect(isImageStillActive(img({ uploadedAt: minsAgo(3) }), NOW, 5)).toBe(true);
  });
});

describe('activeWorksheetImage — buildImageDataUrl', () => {
  let tmpFile;
  afterEach(() => { if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); tmpFile = null; });

  it('prefers the durable imageData on the doc over the disk file', async () => {
    const durable = 'data:image/jpeg;base64,ABC123';
    // filePath points nowhere — must NOT be read when imageData is present.
    const url = await buildImageDataUrl({ imageData: durable, filePath: '/no/such/file.jpg', mimeType: 'image/jpeg' });
    expect(url).toBe(durable);
  });

  it('ignores a non-data-url imageData and falls back to disk', async () => {
    tmpFile = path.join(os.tmpdir(), `awi-fb-${Date.now()}.png`);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fs.writeFileSync(tmpFile, bytes);
    const url = await buildImageDataUrl({ imageData: 'garbage', filePath: tmpFile, mimeType: 'image/png' });
    expect(url).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
  });

  it('returns a base64 data URL from disk when no durable copy exists', async () => {
    tmpFile = path.join(os.tmpdir(), `awi-${Date.now()}.png`);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    fs.writeFileSync(tmpFile, bytes);
    const url = await buildImageDataUrl({ filePath: tmpFile, mimeType: 'image/png' });
    expect(url).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
  });

  it('returns null when the file is missing', async () => {
    const url = await buildImageDataUrl({ filePath: '/no/such/file.jpg', mimeType: 'image/jpeg' });
    expect(url).toBeNull();
  });

  it('returns null for an empty file', async () => {
    tmpFile = path.join(os.tmpdir(), `awi-empty-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.alloc(0));
    expect(await buildImageDataUrl({ filePath: tmpFile, mimeType: 'image/png' })).toBeNull();
  });

  it('returns null when over the size cap', async () => {
    tmpFile = path.join(os.tmpdir(), `awi-big-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.alloc(MAX_IMAGE_BYTES + 1));
    expect(await buildImageDataUrl({ filePath: tmpFile, mimeType: 'image/png' })).toBeNull();
  });

  it('returns null for missing/invalid input', async () => {
    expect(await buildImageDataUrl(null)).toBeNull();
    expect(await buildImageDataUrl({ filePath: '/x.png' })).toBeNull(); // no mimeType
    expect(await buildImageDataUrl({ mimeType: 'image/png' })).toBeNull(); // no filePath
  });
});

const maybe = sharp ? describe : describe.skip;
maybe('activeWorksheetImage — downscaleToDataUrl', () => {
  it('downscales a large image to a compact jpeg data URL', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 240, g: 240, b: 240 } } })
      .png().toBuffer();
    const url = await downscaleToDataUrl(big);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    // Decoded payload should be well under the original and a sane size.
    const b64 = url.split(',')[1];
    const bytes = Buffer.from(b64, 'base64').length;
    expect(bytes).toBeLessThan(big.length);
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });

  it('returns null for empty/invalid input', async () => {
    expect(await downscaleToDataUrl(null)).toBeNull();
    expect(await downscaleToDataUrl(Buffer.alloc(0))).toBeNull();
    expect(await downscaleToDataUrl(Buffer.from('not an image'))).toBeNull();
  });
});
