// tests/unit/uploadSecurity.test.js
// Unit tests for upload security middleware (validateUpload + verifyUploadAccess)

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../models/studentUpload', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  deleteOne: jest.fn()
}));

jest.mock('../../models/user', () => ({
  findById: jest.fn()
}));

const StudentUpload = require('../../models/studentUpload');
const User = require('../../models/user');
const { validateUpload, verifyUploadAccess } = require('../../middleware/uploadSecurity');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('validateUpload', () => {
  test('passes through when no file is present', () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects files larger than 10MB', () => {
    const req = { file: { size: 11 * 1024 * 1024, mimetype: 'image/png', originalname: 'big.png' } };
    const res = makeRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects disallowed mimetype (e.g. exe)', () => {
    const req = { file: { size: 10, mimetype: 'application/x-msdownload', originalname: 'evil.exe' } };
    const res = makeRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects suspicious filename characters', () => {
    const req = { file: { size: 10, mimetype: 'image/png', originalname: 'bad<file>.png' } };
    const res = makeRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid filename' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ])('accepts valid mimetype %s', (mimetype) => {
    const req = { file: { size: 1024, mimetype, originalname: 'safe.bin' } };
    const res = makeRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('verifyUploadAccess', () => {
  function makeReq({ userId, filename = 'abc.png' } = {}) {
    return {
      path: `/uploads/${filename}`,
      user: userId ? { _id: userId } : undefined
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when not authenticated', async () => {
    const req = makeReq({ userId: undefined });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when upload record is missing', async () => {
    StudentUpload.findOne.mockResolvedValue(null);
    const req = makeReq({ userId: 'u1' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(StudentUpload.findOne).toHaveBeenCalledWith({ storedFilename: 'abc.png' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('grants access to the owning student', async () => {
    StudentUpload.findOne.mockResolvedValue({ userId: { toString: () => 'u1' } });
    User.findById
      .mockResolvedValueOnce({ teacherId: null }) // student lookup
      .mockResolvedValueOnce({ role: 'student' }); // current user lookup
    const req = makeReq({ userId: 'u1' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('grants access to the assigned teacher', async () => {
    StudentUpload.findOne.mockResolvedValue({ userId: { toString: () => 'student-1' } });
    User.findById
      .mockResolvedValueOnce({ teacherId: { toString: () => 'teacher-1' } })
      .mockResolvedValueOnce({ role: 'teacher' });
    const req = makeReq({ userId: 'teacher-1' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('grants access to admins', async () => {
    StudentUpload.findOne.mockResolvedValue({ userId: { toString: () => 'student-1' } });
    User.findById
      .mockResolvedValueOnce({ teacherId: null })
      .mockResolvedValueOnce({ role: 'admin' });
    const req = makeReq({ userId: 'admin-1' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('denies access to unrelated user', async () => {
    StudentUpload.findOne.mockResolvedValue({ userId: { toString: () => 'student-1' } });
    User.findById
      .mockResolvedValueOnce({ teacherId: { toString: () => 'teacher-1' } })
      .mockResolvedValueOnce({ role: 'student' });
    const req = makeReq({ userId: 'attacker' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 on unexpected error', async () => {
    StudentUpload.findOne.mockRejectedValue(new Error('db boom'));
    const req = makeReq({ userId: 'u1' });
    const res = makeRes();
    const next = jest.fn();

    await verifyUploadAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
