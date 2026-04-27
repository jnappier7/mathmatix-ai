// tests/unit/userService.test.js
// Unit tests for services/userService.js

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashed-password')
}));

const mockUserCtor = jest.fn();
jest.mock('../../models/user', () => {
  function User(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
    mockUserCtor(data);
  }
  User.findById = jest.fn();
  User.findOne = jest.fn();
  User.findByIdAndUpdate = jest.fn();
  User.find = jest.fn();
  return User;
});

jest.mock('../../models/enrollmentCode', () => ({
  find: jest.fn()
}));

const User = require('../../models/user');
const EnrollmentCode = require('../../models/enrollmentCode');
const userService = require('../../services/userService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hasRole', () => {
  test('returns true when user.role matches', () => {
    expect(userService.hasRole({ role: 'teacher' }, 'teacher')).toBe(true);
  });
  test('accepts an array of allowed roles', () => {
    expect(userService.hasRole({ role: 'teacher' }, ['admin', 'teacher'])).toBe(true);
    expect(userService.hasRole({ role: 'student' }, ['admin', 'teacher'])).toBe(false);
  });
  test('returns false on null/undefined user or missing role', () => {
    expect(userService.hasRole(null, 'student')).toBe(false);
    expect(userService.hasRole({}, 'student')).toBe(false);
  });
});

describe('validatePassword', () => {
  test('valid password passes all checks', () => {
    const r = userService.validatePassword('StrongPass1');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('rejects short password', () => {
    const r = userService.validatePassword('Sh0rt');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/at least 8/);
  });

  test('rejects password with no lowercase, uppercase, or number', () => {
    expect(userService.validatePassword('ALLCAPS123').errors).toContain('Password must contain at least one lowercase letter');
    expect(userService.validatePassword('alllower123').errors).toContain('Password must contain at least one uppercase letter');
    expect(userService.validatePassword('NoNumbersHere').errors).toContain('Password must contain at least one number');
  });

  test('returns all errors at once for empty input', () => {
    const r = userService.validatePassword('');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('getUserById', () => {
  test('returns user when found', async () => {
    const fake = { _id: 'u1' };
    User.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(fake) });
    const r = await userService.getUserById('u1');
    expect(r).toBe(fake);
  });

  test('applies select option', async () => {
    const select = jest.fn().mockReturnThis();
    const exec = jest.fn().mockResolvedValue({ _id: 'u1' });
    User.findById.mockReturnValue({ select, exec });
    await userService.getUserById('u1', { select: 'username email' });
    expect(select).toHaveBeenCalledWith('username email');
  });

  test('applies populate option', async () => {
    const populate = jest.fn().mockReturnThis();
    const exec = jest.fn().mockResolvedValue({ _id: 'u1' });
    User.findById.mockReturnValue({ populate, exec });
    await userService.getUserById('u1', { populate: 'teacherId' });
    expect(populate).toHaveBeenCalledWith('teacherId');
  });

  test('returns null when not found', async () => {
    User.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    expect(await userService.getUserById('missing')).toBeNull();
  });

  test('throws on DB error', async () => {
    User.findById.mockReturnValue({ exec: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(userService.getUserById('u1')).rejects.toThrow('boom');
  });
});

describe('getUserByUsername / getUserByEmail', () => {
  test('lowercases & trims username', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1' });
    await userService.getUserByUsername('  ALICE  ');
    expect(User.findOne).toHaveBeenCalledWith({ username: 'alice' });
  });

  test('lowercases & trims email', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1' });
    await userService.getUserByEmail('  Foo@Bar.IO  ');
    expect(User.findOne).toHaveBeenCalledWith({ email: 'foo@bar.io' });
  });

  test('getUserByUsername returns null when not found', async () => {
    User.findOne.mockResolvedValue(null);
    expect(await userService.getUserByUsername('nobody')).toBeNull();
  });
});

describe('createUser', () => {
  const valid = {
    username: 'alice',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Anderson',
    password: 'StrongPass1'
  };

  test('rejects when required fields are missing', async () => {
    await expect(userService.createUser({ username: 'a' })).rejects.toThrow(/Missing required field/);
  });

  test('rejects when username already exists', async () => {
    User.findOne.mockResolvedValueOnce({ _id: 'existing' });
    await expect(userService.createUser({ ...valid })).rejects.toThrow(/Username already exists/);
  });

  test('rejects when email already exists', async () => {
    User.findOne
      .mockResolvedValueOnce(null) // username check
      .mockResolvedValueOnce({ _id: 'existing' }); // email check
    await expect(userService.createUser({ ...valid })).rejects.toThrow(/Email already exists/);
  });

  test('hashes password and removes plaintext before save', async () => {
    User.findOne.mockResolvedValue(null);
    const created = await userService.createUser({ ...valid });

    // Constructor saw the data with passwordHash and no plaintext password
    const ctorArgs = mockUserCtor.mock.calls[0][0];
    expect(ctorArgs.passwordHash).toBe('hashed-password');
    expect(ctorArgs.password).toBeUndefined();
    expect(created.save).toHaveBeenCalled();
  });
});

describe('updateUser', () => {
  test('strips blacklisted fields and persists allowed updates', async () => {
    const updated = { _id: 'u1', firstName: 'Bob' };
    User.findByIdAndUpdate.mockResolvedValue(updated);

    const r = await userService.updateUser('u1', {
      firstName: 'Bob',
      passwordHash: 'tampered',
      resetPasswordToken: 'tampered',
      resetPasswordExpires: 'tampered'
    });

    const setArg = User.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(setArg.firstName).toBe('Bob');
    expect(setArg.passwordHash).toBeUndefined();
    expect(setArg.resetPasswordToken).toBeUndefined();
    expect(setArg.resetPasswordExpires).toBeUndefined();
    expect(r).toBe(updated);
  });

  test('throws when user is not found', async () => {
    User.findByIdAndUpdate.mockResolvedValue(null);
    await expect(userService.updateUser('missing', { firstName: 'x' })).rejects.toThrow(/not found/);
  });
});

describe('awardXP', () => {
  test('adds xp, appends history, and recalculates level on level-up', async () => {
    // Cumulative XP for level 2 ≈ 100. Start at xp=80, award 50 → xp=130, level 1→2.
    const fake = {
      _id: 'u1',
      xp: 80,
      level: 1,
      xpHistory: [],
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(fake) });

    const r = await userService.awardXP('u1', 50, 'completed-problem');

    expect(fake.xp).toBe(130);
    expect(fake.xpHistory[0]).toEqual(expect.objectContaining({ amount: 50, reason: 'completed-problem' }));
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBeGreaterThan(r.previousLevel);
  });

  test('throws when user not found', async () => {
    User.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(userService.awardXP('missing', 10, 'x')).rejects.toThrow(/User not found/);
  });
});

describe('updateLastLogin', () => {
  test('updates lastLogin timestamp', async () => {
    User.findByIdAndUpdate.mockResolvedValue({ _id: 'u1' });
    const r = await userService.updateLastLogin('u1');
    const setArg = User.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(setArg.lastLogin).toBeInstanceOf(Date);
    expect(r._id).toBe('u1');
  });

  test('throws when user missing', async () => {
    User.findByIdAndUpdate.mockResolvedValue(null);
    await expect(userService.updateLastLogin('x')).rejects.toThrow(/not found/);
  });
});

describe('getUserStats', () => {
  test('returns shaped stats', async () => {
    const created = new Date('2025-01-01');
    User.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'u1',
        level: 5,
        xp: 700,
        totalActiveTutoringMinutes: 320,
        problemsCompleted: 200,
        badges: [{}, {}],
        currentStreak: 4,
        createdAt: created,
        lastLogin: null
      })
    });

    const stats = await userService.getUserStats('u1');
    expect(stats).toEqual({
      level: 5,
      xp: 700,
      totalActiveTutoringMinutes: 320,
      problemsCompleted: 200,
      badgesEarned: 2,
      streakDays: 4,
      joinedDate: created,
      lastLogin: null
    });
  });

  test('throws when user not found', async () => {
    User.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(userService.getUserStats('x')).rejects.toThrow(/not found/);
  });
});

describe('getStudentIdsForTeacher', () => {
  test('combines direct students and enrollment-code students, deduplicated', async () => {
    User.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: { toString: () => 's1' } },
        { _id: { toString: () => 's2' } }
      ])
    });
    EnrollmentCode.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { enrolledStudents: [{ studentId: { toString: () => 's2' } }, { studentId: { toString: () => 's3' } }] },
        { enrolledStudents: [{ studentId: { toString: () => 's4' } }] }
      ])
    });

    const ids = await userService.getStudentIdsForTeacher('t1');
    expect(ids.sort()).toEqual(['s1', 's2', 's3', 's4']);
  });

  test('handles teacher with no students', async () => {
    User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    EnrollmentCode.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    expect(await userService.getStudentIdsForTeacher('t1')).toEqual([]);
  });
});
