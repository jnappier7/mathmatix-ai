// tests/unit/auth.test.js
// Unit tests for authentication middleware

const { isAuthenticated, isStudent, isTeacher, isParent, isAdmin } = require('../../middleware/auth');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      user: null,
      session: {},
      originalUrl: '/api/test',
      method: 'GET'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn()
    };
    next = jest.fn();
  });

  describe('isAuthenticated', () => {
    test('should call next() when user is authenticated', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'student', _id: '123' };

      isAuthenticated(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 401 when user is not authenticated', () => {
      req.isAuthenticated.mockReturnValue(false);

      isAuthenticated(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized: Authentication required.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should redirect to login for non-API requests', () => {
      req.isAuthenticated.mockReturnValue(false);
      req.originalUrl = '/dashboard';
      req.method = 'GET';

      isAuthenticated(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/login.html');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isStudent', () => {
    test('should call next() when user is a student', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'student' };

      isStudent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a student', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'teacher' };

      isStudent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden: Students only.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 when user is missing', () => {
      req.isAuthenticated.mockReturnValue(false);
      req.user = null;

      isStudent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isTeacher', () => {
    test('should call next() when user is a teacher', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'teacher' };

      isTeacher(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a teacher', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'student' };

      isTeacher(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden: Teachers only.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isParent', () => {
    test('should call next() when user is a parent', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'parent' };

      isParent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a parent', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'student' };

      isParent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden: Parents only.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isAdmin', () => {
    test('should call next() when user is an admin', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'admin' };

      isAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not an admin', () => {
      req.isAuthenticated.mockReturnValue(true);
      req.user = { role: 'teacher' };

      isAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden: Admin access required.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
