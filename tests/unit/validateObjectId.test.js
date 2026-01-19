// tests/unit/validateObjectId.test.js
// Unit tests for ObjectId validation middleware

const { validateObjectId, validateObjectIds, validateObjectIdsInBody } = require('../../middleware/validateObjectId');
const mongoose = require('mongoose');

describe('ObjectId Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('validateObjectId', () => {
    test('should call next() with valid ObjectId', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.id = validId;

      validateObjectId('id')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 400 with invalid ObjectId format', () => {
      req.params.id = 'invalid-id-123';

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid id format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 400 when parameter is missing', () => {
      // req.params.id is undefined

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required parameter: id'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should validate custom parameter name', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.userId = validId;

      validateObjectId('userId')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should reject malformed ObjectId that could cause DoS', () => {
      req.params.id = '123'; // Too short

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateObjectIds', () => {
    test('should validate multiple ObjectIds successfully', () => {
      const validId1 = new mongoose.Types.ObjectId().toString();
      const validId2 = new mongoose.Types.ObjectId().toString();
      req.params.userId = validId1;
      req.params.conversationId = validId2;

      validateObjectIds('userId', 'conversationId')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should fail if any ObjectId is invalid', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.userId = validId;
      req.params.conversationId = 'invalid';

      validateObjectIds('userId', 'conversationId')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid conversationId format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should fail if any parameter is missing', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.params.userId = validId;
      // req.params.conversationId is missing

      validateObjectIds('userId', 'conversationId')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required parameter: conversationId'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateObjectIdsInBody', () => {
    test('should validate ObjectIds in request body', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      req.body.teacherId = validId;

      validateObjectIdsInBody('teacherId')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should skip validation if field is not present', () => {
      // req.body.teacherId is undefined (optional field)

      validateObjectIdsInBody('teacherId')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should fail if present ObjectId is invalid', () => {
      req.body.teacherId = 'invalid-id';

      validateObjectIdsInBody('teacherId')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid teacherId format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should validate multiple body fields', () => {
      const validId1 = new mongoose.Types.ObjectId().toString();
      const validId2 = new mongoose.Types.ObjectId().toString();
      req.body.studentId = validId1;
      req.body.courseId = validId2;

      validateObjectIdsInBody('studentId', 'courseId')(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Edge cases and security', () => {
    test('should handle null parameter', () => {
      req.params.id = null;

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle empty string', () => {
      req.params.id = '';

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle object injection attempt', () => {
      req.params.id = { $gt: '' }; // MongoDB operator injection attempt

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle very long string that could cause DoS', () => {
      req.params.id = 'a'.repeat(10000);

      validateObjectId('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
