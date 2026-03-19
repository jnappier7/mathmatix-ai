// tests/unit/usageGate.test.js
// Unit tests for feature gating middleware (usageGate, premiumFeatureGate, paidFeatureGate)

// Must set BILLING_ENABLED before requiring the module
process.env.BILLING_ENABLED = 'true';

// Mock dependencies before requiring the module under test
jest.mock('../../models/user');
jest.mock('../../models/schoolLicense');

const User = require('../../models/user');
const SchoolLicense = require('../../models/schoolLicense');

// Clear module cache so BILLING_ENABLED takes effect
delete require.cache[require.resolve('../../middleware/usageGate')];
const { usageGate, premiumFeatureGate, paidFeatureGate, FREE_WEEKLY_SECONDS } = require('../../middleware/usageGate');

describe('Feature Gating Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'POST',
      user: {
        _id: 'student123',
        role: 'student',
        subscriptionTier: 'free',
        weeklyAISeconds: 0,
        lastWeeklyReset: new Date(),
        freeUploadsUsed: 0,
        freeGradesUsed: 0,
        freeCoursesUsed: 0,
        parentIds: [],
        schoolLicenseId: null,
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    next = jest.fn();

    // Reset mocks
    jest.clearAllMocks();
    User.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    User.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    User.findByIdAndUpdate = jest.fn().mockReturnValue({ catch: jest.fn() });
    SchoolLicense.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  });

  // ============================================================
  // usageGate
  // ============================================================
  describe('usageGate', () => {
    // --- Role-based bypass ---
    test('should allow teachers through unconditionally', async () => {
      req.user.role = 'teacher';
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should allow parents through unconditionally', async () => {
      req.user.role = 'parent';
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow admins through unconditionally', async () => {
      req.user.role = 'admin';
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- GET requests pass through ---
    test('should allow GET requests through without checking usage', async () => {
      req.method = 'GET';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 1000; // Over limit
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- No user (let auth middleware handle) ---
    test('should call next() when no user is present', async () => {
      req.user = null;
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Unlimited subscribers ---
    test('should allow unlimited subscribers through', async () => {
      req.user.subscriptionTier = 'unlimited';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 1000;
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- School license ---
    test('should allow students with valid active school license', async () => {
      req.user.schoolLicenseId = 'license123';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license123',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 100,
          maxStudents: 500,
        })
      });
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow students with trial school license', async () => {
      req.user.schoolLicenseId = 'license456';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license456',
          status: 'trial',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 10,
          maxStudents: 50,
        })
      });
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should fall through to free tier when school license is expired', async () => {
      req.user.schoolLicenseId = 'license789';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license789',
          status: 'expired',
          expiresAt: new Date(Date.now() - 86400000),
          currentStudentCount: 100,
          maxStudents: 500,
        })
      });
      await usageGate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
    });

    test('should fall through to free tier when school is over capacity', async () => {
      req.user.schoolLicenseId = 'licenseOverCap';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'licenseOverCap',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 600,
          maxStudents: 500,
        })
      });
      await usageGate(req, res, next);
      // Over capacity + free minutes exhausted => 402
      expect(res.status).toHaveBeenCalledWith(402);
    });

    // --- Parent subscription inheritance ---
    test('should allow student when a linked parent has unlimited subscription', async () => {
      req.user.parentIds = ['parent1'];
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      User.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'parent1', subscriptionTier: 'unlimited' })
      });
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(User.findOne).toHaveBeenCalledWith({
        _id: { $in: ['parent1'] },
        subscriptionTier: 'unlimited'
      });
    });

    test('should NOT pass parent check when no parent is subscribed', async () => {
      req.user.parentIds = ['parent1'];
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      User.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      await usageGate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
    });

    // --- Free weekly minutes ---
    test('should allow student with remaining free minutes', async () => {
      req.user.weeklyAISeconds = 600; // 10 minutes used, 20 remaining
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Free-Remaining-Seconds',
        expect.any(String)
      );
    });

    test('should set low usage warning when <= 2 minutes remain', async () => {
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS - 60; // 1 minute remaining
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-Usage-Warning', 'low');
    });

    test('should NOT set low usage warning when > 2 minutes remain', async () => {
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS - 300; // 5 minutes remaining
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      // Should not have X-Usage-Warning set
      const warningCalls = res.setHeader.mock.calls.filter(c => c[0] === 'X-Usage-Warning');
      expect(warningCalls.length).toBe(0);
    });

    // --- Weekly reset ---
    test('should reset weekly usage when 7+ days have passed', async () => {
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.lastWeeklyReset = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      await usageGate(req, res, next);
      expect(User.findOneAndUpdate).toHaveBeenCalled();
      expect(next).toHaveBeenCalled(); // After reset, free minutes are available
    });

    // --- Free minutes exhausted, free tier ---
    test('should return 402 when free student has exhausted free minutes', async () => {
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      await usageGate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        usageLimitReached: true,
        tier: 'free',
        upgradeRequired: true,
        freeSecondsRemaining: 0,
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('should include nextResetAt in 402 response for free-tier students', async () => {
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      await usageGate(req, res, next);
      const body = res.json.mock.calls[0][0];
      expect(body).toHaveProperty('nextResetAt');
      expect(new Date(body.nextResetAt).getTime()).toBeGreaterThan(Date.now());
    });

    // --- Pack users ---
    test('should allow pack user with remaining pack balance after free minutes used', async () => {
      req.user.subscriptionTier = 'pack_60';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.packSecondsRemaining = 3000;
      req.user.packExpiresAt = new Date(Date.now() + 86400000);
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should return 402 when pack is expired', async () => {
      req.user.subscriptionTier = 'pack_120';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.packSecondsRemaining = 3000;
      req.user.packExpiresAt = new Date(Date.now() - 86400000); // Expired
      await usageGate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        expired: true,
        upgradeRequired: true,
      }));
    });

    test('should return 402 and auto-downgrade when pack balance is 0', async () => {
      req.user.subscriptionTier = 'pack_60';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.packSecondsRemaining = 0;
      req.user.packExpiresAt = new Date(Date.now() + 86400000);
      await usageGate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('student123', {
        $set: { subscriptionTier: 'free', packSecondsRemaining: 0, packExpiresAt: null }
      });
    });

    test('should set low pack warning when <= 2 minutes remain in pack', async () => {
      req.user.subscriptionTier = 'pack_60';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.packSecondsRemaining = 60; // 1 minute left
      req.user.packExpiresAt = new Date(Date.now() + 86400000);
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-Usage-Warning', 'low');
    });

    // --- Error handling ---
    test('should call next() on internal errors (fail-open)', async () => {
      // Force an error by making user properties throw
      req.user = {
        get role() { throw new Error('DB exploded'); }
      };
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // ============================================================
  // premiumFeatureGate
  // ============================================================
  describe('premiumFeatureGate', () => {
    let gate;

    // --- Role-based bypass ---
    test('should allow teachers through', async () => {
      gate = premiumFeatureGate('Voice chat');
      req.user.role = 'teacher';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow parents through', async () => {
      gate = premiumFeatureGate('File uploads');
      req.user.role = 'parent';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow admins through', async () => {
      gate = premiumFeatureGate('Work grading');
      req.user.role = 'admin';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Unlimited subscribers ---
    test('should allow unlimited subscribers through', async () => {
      gate = premiumFeatureGate('Voice chat');
      req.user.subscriptionTier = 'unlimited';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- School license ---
    test('should allow students with valid school license', async () => {
      gate = premiumFeatureGate('File uploads');
      req.user.schoolLicenseId = 'license123';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license123',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 100,
          maxStudents: 500,
        })
      });
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Parent subscription inheritance ---
    test('should allow student when parent has unlimited subscription', async () => {
      gate = premiumFeatureGate('Voice chat');
      req.user.parentIds = ['parent1'];
      User.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'parent1', subscriptionTier: 'unlimited' })
      });
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Freemium taste: File uploads ---
    test('should allow first free file upload and increment counter', async () => {
      gate = premiumFeatureGate('File uploads');
      req.user.freeUploadsUsed = 0;
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('student123', { $inc: { freeUploadsUsed: 1 } });
    });

    test('should block file uploads after free taste is used', async () => {
      gate = premiumFeatureGate('File uploads');
      req.user.freeUploadsUsed = 1;
      await gate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        premiumFeatureBlocked: true,
        feature: 'File uploads',
        upgradeRequired: true,
        freeTrialUsed: true,
      }));
      expect(next).not.toHaveBeenCalled();
    });

    // --- Freemium taste: Work grading ---
    test('should allow first free work grading and increment counter', async () => {
      gate = premiumFeatureGate('Work grading');
      req.user.freeGradesUsed = 0;
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('student123', { $inc: { freeGradesUsed: 1 } });
    });

    test('should block work grading after free taste is used', async () => {
      gate = premiumFeatureGate('Work grading');
      req.user.freeGradesUsed = 1;
      await gate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        premiumFeatureBlocked: true,
        feature: 'Work grading',
        freeTrialUsed: true,
      }));
    });

    // --- Freemium taste: Courses ---
    test('should allow first free course enrollment and increment counter', async () => {
      gate = premiumFeatureGate('Courses');
      req.user.freeCoursesUsed = 0;
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('student123', { $inc: { freeCoursesUsed: 1 } });
    });

    test('should block courses after free taste is used', async () => {
      gate = premiumFeatureGate('Courses');
      req.user.freeCoursesUsed = 1;
      await gate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        premiumFeatureBlocked: true,
        feature: 'Courses',
        freeTrialUsed: true,
      }));
    });

    // --- Voice chat: no free taste ---
    test('should block voice chat for free students (no free taste)', async () => {
      gate = premiumFeatureGate('Voice chat');
      await gate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        premiumFeatureBlocked: true,
        feature: 'Voice chat',
        freeTrialUsed: false,
      }));
      expect(next).not.toHaveBeenCalled();
    });

    // --- No user ---
    test('should call next() when no user is present', async () => {
      gate = premiumFeatureGate('Voice chat');
      req.user = null;
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- 402 response shape ---
    test('should return correct 402 response body when blocked', async () => {
      gate = premiumFeatureGate('File uploads');
      req.user.freeUploadsUsed = 1;
      await gate(req, res, next);
      const body = res.json.mock.calls[0][0];
      expect(body).toEqual({
        message: expect.stringContaining('Mathmatix+'),
        premiumFeatureBlocked: true,
        feature: 'File uploads',
        tier: 'free',
        upgradeRequired: true,
        freeTrialUsed: true,
      });
    });
  });

  // ============================================================
  // paidFeatureGate
  // ============================================================
  describe('paidFeatureGate', () => {
    let gate;

    // --- Role-based bypass ---
    test('should allow teachers through', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.role = 'teacher';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow parents through', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.role = 'parent';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow admins through', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.role = 'admin';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Paid tiers ---
    test('should allow unlimited subscribers', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.subscriptionTier = 'unlimited';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow pack_60 users', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.subscriptionTier = 'pack_60';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should allow pack_120 users', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.subscriptionTier = 'pack_120';
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- School license ---
    test('should allow students with valid school license', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.schoolLicenseId = 'license123';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license123',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 100,
          maxStudents: 500,
        })
      });
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Parent subscription inheritance ---
    test('should allow student when parent has unlimited subscription', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user.parentIds = ['parent1'];
      User.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'parent1', subscriptionTier: 'unlimited' })
      });
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- Blocking free users ---
    test('should block free-tier students with 402', async () => {
      gate = paidFeatureGate('Advanced courses');
      await gate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        premiumFeatureBlocked: true,
        feature: 'Advanced courses',
        tier: 'free',
        upgradeRequired: true,
      }));
      expect(next).not.toHaveBeenCalled();
    });

    // --- No user ---
    test('should call next() when no user is present', async () => {
      gate = paidFeatureGate('Advanced courses');
      req.user = null;
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // --- 402 response message ---
    test('should include feature name in 402 message', async () => {
      gate = paidFeatureGate('Show My Work');
      await gate(req, res, next);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toContain('Show My Work');
      expect(body.message).toContain('Mathmatix+');
    });
  });

  // ============================================================
  // FREE_WEEKLY_SECONDS constant
  // ============================================================
  describe('FREE_WEEKLY_SECONDS', () => {
    test('should be 30 minutes (1800 seconds)', () => {
      expect(FREE_WEEKLY_SECONDS).toBe(30 * 60);
    });
  });

  // ============================================================
  // Integration-style: gating hierarchy correctness
  // ============================================================
  describe('Gating hierarchy', () => {
    test('school license should take priority over subscription tier for usageGate', async () => {
      req.user.subscriptionTier = 'free';
      req.user.weeklyAISeconds = FREE_WEEKLY_SECONDS + 100;
      req.user.schoolLicenseId = 'license123';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license123',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 10,
          maxStudents: 500,
        })
      });
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      // Should not even check parent subscription when license is valid
      expect(User.findOne).not.toHaveBeenCalled();
    });

    test('free minutes should be checked before pack balance', async () => {
      req.user.subscriptionTier = 'pack_60';
      req.user.weeklyAISeconds = 600; // Still has free minutes
      req.user.packSecondsRemaining = 3000;
      await usageGate(req, res, next);
      expect(next).toHaveBeenCalled();
      // Free minutes header should be set (not pack header)
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Free-Remaining-Seconds',
        expect.any(String)
      );
    });

    test('premiumFeatureGate checks school license before free taste', async () => {
      const gate = premiumFeatureGate('File uploads');
      req.user.freeUploadsUsed = 5; // Would be blocked if checking taste
      req.user.schoolLicenseId = 'license123';
      SchoolLicense.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'license123',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000),
          currentStudentCount: 10,
          maxStudents: 500,
        })
      });
      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
      // Should NOT have incremented freeUploadsUsed
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
