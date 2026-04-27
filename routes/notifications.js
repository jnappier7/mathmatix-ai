// routes/notifications.js
// Dashboard feed: parents / teachers / admins read persisted notifications.
// Students don't have a notification feed (yet) — they see in-app cues instead.

const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const logger = require('../utils/logger');

const FEED_ROLES = ['parent', 'teacher', 'admin'];

function hasFeedRole(user) {
  if (!user) return false;
  const roles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
  return roles.some(r => FEED_ROLES.includes(r));
}

// All endpoints require an authorized role. Students hit 403.
router.use((req, res, next) => {
  if (!hasFeedRole(req.user)) {
    return res.status(403).json({ success: false, message: 'Notifications are not available for this role.' });
  }
  next();
});

/**
 * Build the recipient filter for the current user.
 * - Direct: notifications addressed to my userId (parent/teacher).
 * - Role-wide: notifications addressed to any role I hold (admin broadcasts).
 */
function buildRecipientFilter(user) {
  const roles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
  const allowedRoles = roles.filter(r => FEED_ROLES.includes(r));

  return {
    $or: [
      { recipientId: user._id },
      { recipientRole: { $in: allowedRoles }, recipientId: null }
    ]
  };
}

/**
 * GET /api/notifications
 * Query: ?unreadOnly=true&limit=50&before=<ISO date>
 * Returns the caller's notification feed, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const unreadOnly = req.query.unreadOnly === 'true';
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = buildRecipientFilter(req.user);
    if (unreadOnly) filter.readAt = null;
    if (before && !isNaN(before.getTime())) filter.createdAt = { $lt: before };

    const items = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, notifications: items, count: items.length });
  } catch (err) {
    logger.error('[Notifications] List failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint for header badge counts.
 */
router.get('/unread-count', async (req, res) => {
  try {
    const filter = buildRecipientFilter(req.user);
    filter.readAt = null;
    const count = await Notification.countDocuments(filter);
    res.json({ success: true, count });
  } catch (err) {
    logger.error('[Notifications] Unread count failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to load unread count' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a single notification as read. Caller must own it (or share its role).
 */
router.post('/:id/read', async (req, res) => {
  try {
    const filter = buildRecipientFilter(req.user);
    filter._id = req.params.id;

    const result = await Notification.findOneAndUpdate(
      filter,
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, notification: result });
  } catch (err) {
    logger.error('[Notifications] Mark read failed', { error: err.message, id: req.params.id });
    res.status(500).json({ success: false, message: 'Failed to mark notification read' });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark every notification in the caller's feed as read.
 */
router.post('/read-all', async (req, res) => {
  try {
    const filter = buildRecipientFilter(req.user);
    filter.readAt = null;
    const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (err) {
    logger.error('[Notifications] Mark-all-read failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to mark notifications read' });
  }
});

module.exports = router;
