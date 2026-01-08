// tests/unit/auth.test.js
// Unit tests for authentication middleware

const { isAuthenticated, isStudent, isTeacher, isParent, isAdmin } = require('../../middleware/auth');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      isAuthenticated: jest.fn(),
      user: null,
      session: {}
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
        message: 'You must be logged in to access this resource'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isStudent', () => {
    test('should call next() when user is a student', () => {
      req.user = { role: 'student' };

      isStudent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a student', () => {
      req.user = { role: 'teacher' };

      isStudent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Students only.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 when user is missing', () => {
      req.user = null;

      isStudent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isTeacher', () => {
    test('should call next() when user is a teacher', () => {
      req.user = { role: 'teacher' };

      isTeacher(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a teacher', () => {
      req.user = { role: 'student' };

      isTeacher(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Teachers only.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isParent', () => {
    test('should call next() when user is a parent', () => {
      req.user = { role: 'parent' };

      isParent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not a parent', () => {
      req.user = { role: 'student' };

      isParent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Parents only.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isAdmin', () => {
    test('should call next() when user is an admin', () => {
      req.user = { role: 'admin' };

      isAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not an admin', () => {
      req.user = { role: 'teacher' };

      isAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Admins only.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
