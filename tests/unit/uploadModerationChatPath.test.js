// The chat route uploads with multer's upload.any(), which sets req.files.
// validateUpload read only req.file, so every chat photo — the main K-12
// upload path — skipped the type check and the sexual/minors moderation call
// (prod readiness audit 2026-07-28; still live in the 2026-11-03 site review).
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../utils/openaiClient', () => ({ moderateImage: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { moderateImage } = require('../../utils/openaiClient');
const { validateUpload } = require('../../middleware/uploadSecurity');

const CLEAN = { flagged: false, categories: {}, scores: {} };
const FLAGGED = { flagged: false, categories: { 'sexual/minors': true }, scores: {} };

function savedFile(name, mimetype) {
  const p = path.join(os.tmpdir(), `upload-test-${Date.now()}-${Math.random()}-${name}`);
  fs.writeFileSync(p, 'x');
  return { originalname: name, mimetype, size: 1, path: p };
}

function run(req) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const next = jest.fn();
  return validateUpload({ user: { _id: 'u1' }, ...req }, res, next).then(() => ({ res, next }));
}

beforeEach(() => moderateImage.mockReset());

test('chat path (req.files array): a flagged photo is rejected and every saved file removed', async () => {
  moderateImage.mockResolvedValueOnce(CLEAN).mockResolvedValueOnce(FLAGGED);
  const files = [savedFile('a.png', 'image/png'), savedFile('b.jpg', 'image/jpeg')];
  const { res, next } = await run({ files });
  expect(moderateImage).toHaveBeenCalledTimes(2);
  expect(res.statusCode).toBe(400);
  expect(next).not.toHaveBeenCalled();
  for (const f of files) expect(fs.existsSync(f.path)).toBe(false);
});

test('chat path: clean photos pass through', async () => {
  moderateImage.mockResolvedValue(CLEAN);
  const { res, next } = await run({ files: [savedFile('a.png', 'image/png')] });
  expect(moderateImage).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalled();
  expect(res.statusCode).toBe(200);
});

test('single-file routes (req.file) still moderate', async () => {
  moderateImage.mockResolvedValue(FLAGGED);
  const { res, next } = await run({ file: savedFile('a.webp', 'image/webp') });
  expect(res.statusCode).toBe(400);
  expect(next).not.toHaveBeenCalled();
});

test('fields() shape (object of arrays) is checked too', async () => {
  moderateImage.mockResolvedValue(FLAGGED);
  const { res } = await run({ files: { photos: [savedFile('a.png', 'image/png')] } });
  expect(res.statusCode).toBe(400);
});

test('SVG is rejected — it cannot be moderated and can carry script', async () => {
  const { res, next } = await run({ files: [savedFile('a.svg', 'image/svg+xml')] });
  expect(res.statusCode).toBe(400);
  expect(next).not.toHaveBeenCalled();
});

test('HEIC passes the type check without a moderation call; PDFs are not image-moderated', async () => {
  const { next } = await run({ files: [savedFile('a.heic', 'image/heic'), savedFile('w.pdf', 'application/pdf')] });
  expect(moderateImage).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
});

test('no files: passes straight through', async () => {
  const { next } = await run({});
  expect(next).toHaveBeenCalled();
});
