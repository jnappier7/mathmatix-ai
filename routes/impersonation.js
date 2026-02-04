// routes/impersonation.js
// API routes for user impersonation (student view) feature

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const ImpersonationLog = require('../models/impersonationLog');
const {
  startImpersonation,
  endImpersonation,
  canImpersonate,
  getImpersonationStatus
} = require('../middleware/impersonation');

/**
 * @route   GET /api/impersonation/status
 * @desc    Get current impersonation status
 * @access  Private (authenticated users)
 */
router.get('/status', (req, res) => {
  // Use originalUser if impersonating, otherwise req.user
  const status = getImpersonationStatus(req);

  res.json({
    ...status,
    originalUser: req.originalUser ? {
      _id: req.originalUser._id,
      email: req.originalUser.email,
      firstName: req.originalUser.firstName,
      lastName: req.originalUser.lastName,
      role: req.originalUser.role
    } : null
  });
});

/**
 * @route   POST /api/impersonation/start
 * @desc    Start impersonating another user
 * @access  Private (admin, teacher, parent)
 */
router.post('/start', async (req, res) => {
  try {
    const { targetId, readOnly = true } = req.body;

    // Get the actual actor (originalUser if already impersonating, otherwise req.user)
    const actor = req.originalUser || req.user;

    if (!actor) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Check if user has impersonation privileges
    if (!['admin', 'teacher', 'parent'].includes(actor.role)) {
      return res.status(403).json({
        message: 'You do not have permission to view as another user.'
      });
    }

    if (!targetId) {
      return res.status(400).json({ message: 'Target user ID is required.' });
    }

    // End any existing impersonation first
    if (req.session.impersonation) {
      await endImpersonation(req, 'manual');
    }

    // Fetch target user
    const target = await User.findById(targetId);

    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check permission
    const permission = await canImpersonate(actor, target);

    if (!permission.allowed) {
      return res.status(403).json({ message: permission.reason });
    }

    // Start impersonation
    const log = await startImpersonation(req, actor, target, readOnly);

    res.json({
      success: true,
      message: `Now viewing as ${target.firstName || target.username}`,
      impersonation: {
        targetId: target._id,
        targetName: `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.username,
        targetRole: target.role,
        readOnly,
        logId: log._id
      }
    });
  } catch (err) {
    console.error('Error starting impersonation:', err);
    res.status(500).json({ message: 'Server error starting impersonation.' });
  }
});

/**
 * @route   POST /api/impersonation/end
 * @desc    End current impersonation session
 * @access  Private (authenticated users)
 */
router.post('/end', async (req, res) => {
  try {
    const wasImpersonating = !!req.session.impersonation;

    await endImpersonation(req, 'manual');

    res.json({
      success: true,
      message: wasImpersonating ? 'Returned to your account.' : 'No active impersonation session.',
      wasImpersonating
    });
  } catch (err) {
    console.error('Error ending impersonation:', err);
    res.status(500).json({ message: 'Server error ending impersonation.' });
  }
});

/**
 * @route   GET /api/impersonation/targets
 * @desc    Get list of users the current user can impersonate
 * @access  Private (admin, teacher, parent)
 */
router.get('/targets', async (req, res) => {
  try {
    // Get the actual user (originalUser if impersonating)
    const actor = req.originalUser || req.user;

    if (!actor) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    let targets = [];

    if (actor.role === 'admin') {
      // Admins can see all non-admin users
      targets = await User.find(
        { role: { $ne: 'admin' } },
        'firstName lastName email username role gradeLevel mathCourse teacherId'
      ).lean();
    } else if (actor.role === 'teacher') {
      // Teachers can only see their assigned students
      targets = await User.find(
        { role: 'student', teacherId: actor._id },
        'firstName lastName email username role gradeLevel mathCourse'
      ).lean();
    } else if (actor.role === 'parent') {
      // Parents can only see their linked children
      const childIds = actor.children || [];
      targets = await User.find(
        { _id: { $in: childIds }, role: 'student' },
        'firstName lastName email username role gradeLevel mathCourse'
      ).lean();
    }

    res.json(targets);
  } catch (err) {
    console.error('Error fetching impersonation targets:', err);
    res.status(500).json({ message: 'Server error fetching users.' });
  }
});

/**
 * @route   GET /api/impersonation/logs
 * @desc    Get impersonation audit logs (admin only)
 * @access  Private (admin)
 */
router.get('/logs', async (req, res) => {
  try {
    const actor = req.originalUser || req.user;

    if (actor.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const { limit = 50, offset = 0, actorId, targetId } = req.query;

    const query = {};
    if (actorId) query.actorId = actorId;
    if (targetId) query.targetId = targetId;

    const logs = await ImpersonationLog.find(query)
      .sort({ startedAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const total = await ImpersonationLog.countDocuments(query);

    res.json({
      logs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching impersonation logs:', err);
    res.status(500).json({ message: 'Server error fetching logs.' });
  }
});

/**
 * @route   GET /api/impersonation/logs/:logId
 * @desc    Get detailed impersonation log entry (admin only)
 * @access  Private (admin)
 */
router.get('/logs/:logId', async (req, res) => {
  try {
    const actor = req.originalUser || req.user;

    if (actor.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const log = await ImpersonationLog.findById(req.params.logId)
      .populate('actorId', 'firstName lastName email')
      .populate('targetId', 'firstName lastName email')
      .lean();

    if (!log) {
      return res.status(404).json({ message: 'Log entry not found.' });
    }

    res.json(log);
  } catch (err) {
    console.error('Error fetching impersonation log:', err);
    res.status(500).json({ message: 'Server error fetching log.' });
  }
});

module.exports = router;
