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

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  unlinkSync: jest.fn()
}));

const fs = require('fs');
const StudentUpload = require('../../models/studentUpload');
const User = require('../../models/user');
const {
  validateUpload,
  verifyUploadAccess,
  cleanupOldUploads
} = require('../../middleware/uploadSecurity');

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

describe('cleanupOldUploads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deletes old uploads whose user has no retention preference', async () => {
    const upload = {
      _id: { toString: () => 'up-1' },
      userId: 'u1',
      storedFilename: 'old.png',
      filePath: '/uploads/old.png'
    };
    StudentUpload.find.mockResolvedValue([upload]);
    User.findById.mockResolvedValue({ retainUploadsIndefinitely: false });
    StudentUpload.deleteOne.mockResolvedValue({ deletedCount: 1 });
    fs.existsSync.mockReturnValue(true);

    await cleanupOldUploads();

    expect(fs.unlinkSync).toHaveBeenCalledWith('/uploads/old.png');
    expect(StudentUpload.deleteOne).toHaveBeenCalledWith({ _id: upload._id });
  });

  test('deletes uploads belonging to deleted users', async () => {
    const upload = {
      _id: { toString: () => 'up-2' },
      userId: 'gone',
      storedFilename: 'orphan.png'
    };
    StudentUpload.find.mockResolvedValue([upload]);
    User.findById.mockResolvedValue(null); // user removed
    StudentUpload.deleteOne.mockResolvedValue({ deletedCount: 1 });
    fs.existsSync.mockReturnValue(false); // file already gone

    await cleanupOldUploads();

    expect(fs.unlinkSync).not.toHaveBeenCalled(); // file already absent
    expect(StudentUpload.deleteOne).toHaveBeenCalledWith({ _id: upload._id });
  });

  test('skips uploads when retainUploadsIndefinitely is true', async () => {
    const upload = { _id: { toString: () => 'up-3' }, userId: 'u1', storedFilename: 'keep.png' };
    StudentUpload.find.mockResolvedValue([upload]);
    User.findById.mockResolvedValue({ retainUploadsIndefinitely: true });

    await cleanupOldUploads();

    expect(StudentUpload.deleteOne).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  test('continues processing other uploads when one delete fails', async () => {
    const a = { _id: { toString: () => 'a' }, userId: 'u1', storedFilename: 'a.png' };
    const b = { _id: { toString: () => 'b' }, userId: 'u1', storedFilename: 'b.png' };
    StudentUpload.find.mockResolvedValue([a, b]);
    User.findById.mockResolvedValue({ retainUploadsIndefinitely: false });
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync
      .mockImplementationOnce(() => { throw new Error('disk'); })
      .mockImplementationOnce(() => undefined);
    StudentUpload.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await cleanupOldUploads();
    // second upload still processed
    expect(StudentUpload.deleteOne).toHaveBeenCalledWith({ _id: b._id });
  });

  test('handles top-level errors without throwing', async () => {
    StudentUpload.find.mockRejectedValue(new Error('db'));
    await expect(cleanupOldUploads()).resolves.toBeUndefined();
  });
});
