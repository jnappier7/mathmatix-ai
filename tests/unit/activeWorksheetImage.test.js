const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isImageStillActive,
  buildImageDataUrl,
  ACTIVE_IMAGE_TTL_MINUTES,
  MAX_IMAGE_BYTES,
} = require('../../utils/activeWorksheetImage');

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

  it('returns a base64 data URL for a real file', async () => {
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
