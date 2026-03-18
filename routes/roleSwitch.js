// routes/roleSwitch.js
// Unified multi-role login: switch active role without logging out

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const logger = require('../utils/logger');

// Role → default dashboard mapping
const ROLE_DASHBOARDS = {
  admin: '/admin-dashboard.html',
  teacher: '/teacher-dashboard.html',
  parent: '/parent-dashboard.html',
  student: '/chat.html'
};

/**
 * @route   GET /api/role-switch/roles
 * @desc    Get current user's available roles and active role
 * @access  Private
 */
router.get('/roles', (req, res) => {
  const user = req.user;
  const roles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];

  res.json({
    success: true,
    activeRole: user.role,
    roles: roles,
    isMultiRole: roles.length > 1
  });
});

/**
 * @route   POST /api/role-switch
 * @desc    Switch the user's active role (changes dashboard context)
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { role } = req.body;
    const user = req.user;

    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required.' });
    }

    const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];

    // Verify user actually has this role
    if (!userRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `You do not have the "${role}" role.`
      });
    }

    // Already on this role
    if (user.role === role) {
      return res.json({
        success: true,
        message: `Already active as ${role}.`,
        activeRole: role,
        redirect: getRedirectForRole(role, user)
      });
    }

    // Update the active role in the database
    await User.findByIdAndUpdate(user._id, { role });

    // Update the in-memory user object so the session reflects the change
    req.user.role = role;

    logger.info(`[RoleSwitch] User ${user.username} (${user._id}) switched role: ${user.role} → ${role}`);

    // Persist session before responding
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('[RoleSwitch] Session save error:', saveErr);
        return res.status(500).json({ success: false, message: 'Role switched but session save failed.' });
      }

      res.json({
        success: true,
        message: `Switched to ${role} role.`,
        activeRole: role,
        redirect: getRedirectForRole(role, user)
      });
    });
  } catch (err) {
    logger.error('[RoleSwitch] Error:', err);
    res.status(500).json({ success: false, message: 'Failed to switch role.' });
  }
});

function getRedirectForRole(role, user) {
  if (role === 'student') {
    if (!user.selectedTutorId) return '/pick-tutor.html';
    if (!user.selectedAvatarId) return '/pick-avatar.html';
  }
  return ROLE_DASHBOARDS[role] || '/chat.html';
}

module.exports = router;
