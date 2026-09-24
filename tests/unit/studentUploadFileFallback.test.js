// GET /api/student/uploads/:uploadId/file must still serve an image after the
// on-disk copy is gone. Uploads are written to the instance's ephemeral disk,
// so after any deploy/restart (or on another instance) sendFile failed and
// every "My materials" thumbnail rendered broken. The DB keeps a durable
// downscaled copy (StudentUpload.imageData) — that is served instead.

jest.mock('../../middleware/auth', () => {
  const pass = (req, _res, next) => { req.user = { _id: 'u1' }; next(); };
  return new Proxy({}, { get: () => pass });
});

const express = require('express');
const request = require('supertest');
const StudentUpload = require('../../models/studentUpload');
const { router, decodeImageDataUrl } = require('../../routes/student');

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function app() {
  const a = express();
  a.use('/api/student', router);
  return a;
}

afterEach(() => jest.restoreAllMocks());

test('serves the durable DB copy when the file is missing on disk', async () => {
  jest.spyOn(StudentUpload, 'getUploadDetails').mockResolvedValue({
    filePath: '/nonexistent/uploads/gone.jpg',
    fileType: 'image',
    imageData: `data:image/png;base64,${PNG_1PX}`,
  });
  const res = await request(app()).get('/api/student/uploads/abc/file');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/image\/png/);
  expect(Buffer.compare(res.body, Buffer.from(PNG_1PX, 'base64'))).toBe(0);
});

test('404 (not 500) when neither the file nor a durable copy exists', async () => {
  jest.spyOn(StudentUpload, 'getUploadDetails').mockResolvedValue({
    filePath: '/nonexistent/uploads/gone.pdf', fileType: 'pdf', imageData: null,
  });
  const res = await request(app()).get('/api/student/uploads/abc/file');
  expect(res.status).toBe(404);
});

test('still 404s an upload the student does not own', async () => {
  jest.spyOn(StudentUpload, 'getUploadDetails').mockResolvedValue(null);
  const res = await request(app()).get('/api/student/uploads/abc/file');
  expect(res.status).toBe(404);
});

test('decodeImageDataUrl only accepts image data URLs', () => {
  expect(decodeImageDataUrl(`data:image/jpeg;base64,${PNG_1PX}`).mimeType).toBe('image/jpeg');
  expect(decodeImageDataUrl('data:text/html;base64,PGI+')).toBeNull();
  expect(decodeImageDataUrl(null)).toBeNull();
  expect(decodeImageDataUrl('not a data url')).toBeNull();
});
