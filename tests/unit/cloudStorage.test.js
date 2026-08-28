// tests/unit/cloudStorage.test.js
// Unit tests for utils/cloudStorage.js

// The module reads env vars at load time. Reset modules between scenarios.

// Use a global handle so the jest.mock factory (hoisted) can find it.
global.__sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const PutObjectCommand = jest.fn(function (input) { this.input = input; this.kind = 'put'; });
  const DeleteObjectCommand = jest.fn(function (input) { this.input = input; this.kind = 'delete'; });
  const GetObjectCommand = jest.fn(function (input) { this.input = input; this.kind = 'get'; });
  const S3Client = jest.fn().mockImplementation(() => ({
    send: (cmd) => global.__sendMock(cmd)
  }));
  return { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand };
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn().mockImplementation(() => 'fake-stream')
}));

const sendMock = global.__sendMock;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  sendMock.mockReset();
  // Strip S3 env so each test sets it explicitly
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('S3_')) delete process.env[k];
  }
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('cloudStorage — unconfigured (no S3 env)', () => {
  test('isConfigured is false', () => {
    const cs = require('../../utils/cloudStorage');
    expect(cs.isConfigured).toBe(false);
  });

  test('uploadFile returns null and never calls S3', async () => {
    const cs = require('../../utils/cloudStorage');
    expect(await cs.uploadFile('/tmp/file', 'key', 'image/png')).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('deleteFile is a no-op', async () => {
    const cs = require('../../utils/cloudStorage');
    await expect(cs.deleteFile('any-key')).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('cloudStorage — configured', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'my-bucket';
    process.env.S3_REGION = 'us-east-1';
  });

  test('uploadFile sends a PutObjectCommand and returns a public URL', async () => {
    sendMock.mockResolvedValue({});
    const cs = require('../../utils/cloudStorage');
    const url = await cs.uploadFile('/tmp/foo.png', 'avatars/u1.png', 'image/png');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.kind).toBe('put');
    expect(cmd.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'avatars/u1.png',
      ContentType: 'image/png'
    });
    expect(url).toBe('https://my-bucket.s3.us-east-1.amazonaws.com/avatars/u1.png');
  });

  test('uploadFile uses S3_PUBLIC_URL override when set', async () => {
    process.env.S3_PUBLIC_URL = 'https://cdn.example.com';
    sendMock.mockResolvedValue({});
    const cs = require('../../utils/cloudStorage');
    const url = await cs.uploadFile('/tmp/foo', 'a/b.png', 'image/png');
    expect(url).toBe('https://cdn.example.com/a/b.png');
  });

  test('deleteFile sends DeleteObjectCommand', async () => {
    sendMock.mockResolvedValue({});
    const cs = require('../../utils/cloudStorage');
    await cs.deleteFile('uploads/x.png');
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.kind).toBe('delete');
    expect(cmd.input).toMatchObject({ Bucket: 'my-bucket', Key: 'uploads/x.png' });
  });

  test('deleteFile is a no-op when key is empty', async () => {
    const cs = require('../../utils/cloudStorage');
    await cs.deleteFile('');
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('deleteFile swallows errors so it never breaks the caller', async () => {
    sendMock.mockRejectedValue(new Error('s3 down'));
    const cs = require('../../utils/cloudStorage');
    await expect(cs.deleteFile('k')).resolves.toBeUndefined();
  });

  test('uses S3_ENDPOINT and forcePathStyle when set (non-AWS providers)', () => {
    process.env.S3_ENDPOINT = 'https://r2.example.com';
    const { S3Client } = require('@aws-sdk/client-s3');
    require('../../utils/cloudStorage');
    const cfg = S3Client.mock.calls[S3Client.mock.calls.length - 1][0];
    expect(cfg.endpoint).toBe('https://r2.example.com');
    expect(cfg.forcePathStyle).toBe(true);
  });
});

describe('getKeyFromUrl', () => {
  test('strips leading slash from valid URL pathname', () => {
    const cs = require('../../utils/cloudStorage');
    expect(cs.getKeyFromUrl('https://my-bucket.s3.us-east-1.amazonaws.com/foo/bar.png'))
      .toBe('foo/bar.png');
  });

  test('returns null for invalid URL', () => {
    const cs = require('../../utils/cloudStorage');
    expect(cs.getKeyFromUrl('not-a-url')).toBeNull();
  });

  test('returns null for empty input', () => {
    const cs = require('../../utils/cloudStorage');
    expect(cs.getKeyFromUrl('')).toBeNull();
    expect(cs.getKeyFromUrl(null)).toBeNull();
  });
});

describe('getObjectStream — the private-bucket read path', () => {
  // The bucket is deliberately NOT world-readable: the download route checks
  // ownership, student-teacher membership and publish status before serving a
  // byte, and a public URL would let anyone holding it skip all three.
  test('throws when storage is not configured, rather than returning nothing', async () => {
    const cs = require('../../utils/cloudStorage');
    expect(cs.isConfigured).toBe(false);
    await expect(cs.getObjectStream('teacher-resources/t1/x.pdf')).rejects.toThrow(/not configured/i);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('reads the object with our own credentials and returns the stream', async () => {
    process.env.S3_BUCKET = 'bucket-x';
    process.env.S3_REGION = 'us-west-2';
    sendMock.mockResolvedValue({ Body: 'fake-body-stream', ContentType: 'application/pdf' });
    const cs = require('../../utils/cloudStorage');
    const out = await cs.getObjectStream('teacher-resources/t1/x.pdf');

    expect(out.body).toBe('fake-body-stream');
    expect(out.contentType).toBe('application/pdf');
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.kind).toBe('get');
    expect(cmd.input).toEqual({ Bucket: 'bucket-x', Key: 'teacher-resources/t1/x.pdf' });
  });

  test('propagates a storage failure so the route can answer 502 instead of a truncated file', async () => {
    process.env.S3_BUCKET = 'bucket-x';
    process.env.S3_REGION = 'us-west-2';
    sendMock.mockRejectedValue(new Error('NoSuchKey'));
    const cs = require('../../utils/cloudStorage');
    await expect(cs.getObjectStream('missing.pdf')).rejects.toThrow('NoSuchKey');
  });
});
