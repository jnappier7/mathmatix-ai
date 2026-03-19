// tests/unit/roleSwitch.test.js
// Unit tests for the role-switch API

// Mock User model before requiring the route
jest.mock('../../models/user', () => ({
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

const request = require('supertest');
const express = require('express');
const roleSwitchRoutes = require('../../routes/roleSwitch');
const User = require('../../models/user');

// Helper to create a test app with mocked auth
function createApp(mockUser) {
  const app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = mockUser;
    req.session = { save: (cb) => cb() };
    next();
  });

  app.use('/api/role-switch', roleSwitchRoutes);
  return app;
}

describe('Role Switch API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/role-switch/roles', () => {
    test('should return roles for a multi-role user', async () => {
      const app = createApp({
        _id: '123',
        role: 'admin',
        roles: ['admin', 'teacher', 'parent', 'student'],
        username: 'testuser'
      });

      const res = await request(app).get('/api/role-switch/roles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activeRole).toBe('admin');
      expect(res.body.roles).toEqual(['admin', 'teacher', 'parent', 'student']);
      expect(res.body.isMultiRole).toBe(true);
    });

    test('should return single role for a single-role user', async () => {
      const app = createApp({
        _id: '456',
        role: 'student',
        roles: ['student'],
        username: 'studentuser'
      });

      const res = await request(app).get('/api/role-switch/roles');

      expect(res.status).toBe(200);
      expect(res.body.isMultiRole).toBe(false);
      expect(res.body.roles).toEqual(['student']);
    });

    test('should fall back to role field if roles array is empty', async () => {
      const app = createApp({
        _id: '789',
        role: 'teacher',
        roles: [],
        username: 'legacyuser'
      });

      const res = await request(app).get('/api/role-switch/roles');

      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual(['teacher']);
      expect(res.body.isMultiRole).toBe(false);
    });
  });

  describe('POST /api/role-switch', () => {
    test('should switch role successfully', async () => {
      const mockUser = {
        _id: '123',
        role: 'admin',
        roles: ['admin', 'teacher', 'parent', 'student'],
        username: 'testuser'
      };
      const app = createApp(mockUser);
      User.findByIdAndUpdate.mockResolvedValue();

      const res = await request(app)
        .post('/api/role-switch')
        .send({ role: 'teacher' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activeRole).toBe('teacher');
      expect(res.body.redirect).toBe('/teacher-dashboard.html');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('123', { role: 'teacher' });
    });

    test('should return correct redirect for each role', async () => {
      const mockUser = {
        _id: '123',
        role: 'admin',
        roles: ['admin', 'teacher', 'parent', 'student'],
        username: 'testuser',
        selectedTutorId: 'tutor1',
        selectedAvatarId: 'avatar1'
      };
      const app = createApp(mockUser);
      User.findByIdAndUpdate.mockResolvedValue();

      // Test parent redirect
      let res = await request(app).post('/api/role-switch').send({ role: 'parent' });
      expect(res.body.redirect).toBe('/parent-dashboard.html');

      // Test admin redirect
      res = await request(app).post('/api/role-switch').send({ role: 'admin' });
      expect(res.body.redirect).toBe('/admin-dashboard.html');

      // Test student redirect (with tutor/avatar already selected)
      res = await request(app).post('/api/role-switch').send({ role: 'student' });
      expect(res.body.redirect).toBe('/chat.html');
    });

    test('should reject switching to a role the user does not have', async () => {
      const app = createApp({
        _id: '123',
        role: 'student',
        roles: ['student'],
        username: 'studentonly'
      });

      const res = await request(app)
        .post('/api/role-switch')
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('should return 400 if no role provided', async () => {
      const app = createApp({
        _id: '123',
        role: 'admin',
        roles: ['admin', 'teacher'],
        username: 'testuser'
      });

      const res = await request(app)
        .post('/api/role-switch')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('should handle already-active role gracefully', async () => {
      const app = createApp({
        _id: '123',
        role: 'teacher',
        roles: ['admin', 'teacher'],
        username: 'testuser'
      });

      const res = await request(app)
        .post('/api/role-switch')
        .send({ role: 'teacher' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activeRole).toBe('teacher');
      // Should not call DB update when role hasn't changed
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('should redirect student to pick-tutor if no tutor selected', async () => {
      const mockUser = {
        _id: '123',
        role: 'admin',
        roles: ['admin', 'student'],
        username: 'testuser',
        selectedTutorId: null,
        selectedAvatarId: null
      };
      const app = createApp(mockUser);
      User.findByIdAndUpdate.mockResolvedValue();

      const res = await request(app)
        .post('/api/role-switch')
        .send({ role: 'student' });

      expect(res.body.redirect).toBe('/pick-tutor.html');
    });
  });
});
