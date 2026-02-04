// middleware/impersonation.js
// Handles user impersonation (student view) for admins, teachers, and parents

const User = require('../models/user');
const ImpersonationLog = require('../models/impersonationLog');

// Auto-timeout for impersonation sessions (20 minutes)
const IMPERSONATION_TIMEOUT_MS = 20 * 60 * 1000;

// Routes that are ALWAYS blocked during impersonation (even in non-read-only mode)
const ALWAYS_BLOCKED_ROUTES = [
  '/api/settings/password',
  '/api/settings/email',
  '/api/admin',
  '/logout'
];

// Routes that modify data - blocked in read-only mode
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Routes allowed even in read-only mode (necessary for viewing)
const READ_ONLY_ALLOWED_ROUTES = [
  '/api/chat',           // Need to see chat interface
  '/api/session/heartbeat',
  '/api/user',
  '/api/avatars',
  '/api/curriculum',
  '/api/conversations',
  '/api/mastery',
  '/api/fact-fluency',
  '/api/leaderboard'
];

/**
 * Main impersonation middleware - runs on every request
 * Swaps req.user to impersonated user if session is active
 */
async function handleImpersonation(req, res, next) {
  // Skip if no session or not authenticated
  if (!req.session || !req.isAuthenticated || !req.isAuthenticated()) {
    return next();
  }

  const impersonation = req.session.impersonation;

  // No active impersonation
  if (!impersonation || !impersonation.targetId) {
    req.isImpersonating = false;
    req.originalUser = null;
    return next();
  }

  // Check for timeout
  const elapsed = Date.now() - new Date(impersonation.startedAt).getTime();
  if (elapsed > IMPERSONATION_TIMEOUT_MS) {
    await endImpersonation(req, 'timeout');
    return next();
  }

  try {
    // Fetch the impersonated user
    const targetUser = await User.findById(impersonation.targetId);

    if (!targetUser) {
      // Target user no longer exists
      await endImpersonation(req, 'session_expired');
      return next();
    }

    // Store original user and swap to impersonated user
    req.originalUser = req.user;
    req.user = targetUser;
    req.isImpersonating = true;
    req.impersonationReadOnly = impersonation.readOnly !== false;
    req.impersonationLogId = impersonation.logId;

    // Track page visit for audit log
    if (impersonation.logId && req.method === 'GET') {
      ImpersonationLog.findByIdAndUpdate(impersonation.logId, {
        $push: {
          pagesVisited: {
            path: req.originalUrl,
            timestamp: new Date()
          }
        }
      }).catch(err => console.error('Failed to log impersonation page visit:', err));
    }

    next();
  } catch (err) {
    console.error('Impersonation middleware error:', err);
    await endImpersonation(req, 'session_expired');
    next();
  }
}

/**
 * Middleware to enforce read-only mode during impersonation
 * Blocks write operations when impersonation is active
 */
function enforceReadOnly(req, res, next) {
  // Not impersonating - allow everything
  if (!req.isImpersonating) {
    return next();
  }

  const path = req.originalUrl.split('?')[0]; // Remove query params

  // Always block sensitive routes during impersonation
  if (ALWAYS_BLOCKED_ROUTES.some(route => path.startsWith(route))) {
    logBlockedAction(req, true);
    return res.status(403).json({
      message: 'This action is not allowed while viewing as another user.',
      impersonating: true
    });
  }

  // In read-only mode, block all write operations except allowed routes
  if (req.impersonationReadOnly && WRITE_METHODS.includes(req.method)) {
    const isAllowed = READ_ONLY_ALLOWED_ROUTES.some(route => path.startsWith(route));

    if (!isAllowed) {
      logBlockedAction(req, true);
      return res.status(403).json({
        message: 'Read-only mode: This action is not allowed while viewing as another user.',
        impersonating: true,
        readOnly: true
      });
    }
  }

  // Log the action attempt (not blocked)
  if (WRITE_METHODS.includes(req.method)) {
    logBlockedAction(req, false);
  }

  next();
}

/**
 * Log an action attempt during impersonation
 */
function logBlockedAction(req, blocked) {
  if (!req.impersonationLogId) return;

  ImpersonationLog.findByIdAndUpdate(req.impersonationLogId, {
    $push: {
      actionsAttempted: {
        action: `${req.method} ${req.originalUrl}`,
        path: req.originalUrl,
        method: req.method,
        blocked,
        timestamp: new Date()
      }
    }
  }).catch(err => console.error('Failed to log impersonation action:', err));
}

/**
 * Start an impersonation session
 * @param {Object} req - Express request
 * @param {Object} actor - The user initiating impersonation (admin/teacher/parent)
 * @param {Object} target - The user being impersonated
 * @param {Boolean} readOnly - Whether to enforce read-only mode
 * @returns {Object} The created impersonation log entry
 */
async function startImpersonation(req, actor, target, readOnly = true) {
  // Create audit log entry
  const log = await ImpersonationLog.create({
    actorId: actor._id,
    actorRole: actor.role,
    actorEmail: actor.email,
    targetId: target._id,
    targetRole: target.role,
    targetEmail: target.email,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    readOnly,
    startedAt: new Date()
  });

  // Set session data
  req.session.impersonation = {
    targetId: target._id.toString(),
    targetRole: target.role,
    targetName: `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.username,
    actorId: actor._id.toString(),
    actorRole: actor.role,
    logId: log._id.toString(),
    readOnly,
    startedAt: new Date().toISOString()
  };

  console.log(`[IMPERSONATION] ${actor.email} (${actor.role}) started viewing as ${target.email} (${target.role})`);

  return log;
}

/**
 * End an impersonation session
 * @param {Object} req - Express request
 * @param {String} reason - Why the session ended
 */
async function endImpersonation(req, reason = 'manual') {
  const impersonation = req.session?.impersonation;

  if (!impersonation) return;

  // Update audit log
  if (impersonation.logId) {
    await ImpersonationLog.findByIdAndUpdate(impersonation.logId, {
      endedAt: new Date(),
      endReason: reason
    }).catch(err => console.error('Failed to end impersonation log:', err));
  }

  console.log(`[IMPERSONATION] Session ended (${reason}) for actor ${impersonation.actorId}`);

  // Clear session data
  delete req.session.impersonation;
  req.isImpersonating = false;
  req.originalUser = null;
}

/**
 * Check if a user can impersonate another user
 * @param {Object} actor - The user attempting to impersonate
 * @param {Object} target - The user to be impersonated
 * @returns {Object} { allowed: boolean, reason: string }
 */
async function canImpersonate(actor, target) {
  // Can't impersonate yourself
  if (actor._id.toString() === target._id.toString()) {
    return { allowed: false, reason: 'You cannot impersonate yourself.' };
  }

  // Can't impersonate admins
  if (target.role === 'admin') {
    return { allowed: false, reason: 'Admin accounts cannot be impersonated.' };
  }

  // Admin can impersonate anyone (except other admins)
  if (actor.role === 'admin') {
    return { allowed: true };
  }

  // Teacher can only impersonate their assigned students
  if (actor.role === 'teacher') {
    if (target.role !== 'student') {
      return { allowed: false, reason: 'Teachers can only view student accounts.' };
    }

    if (!target.teacherId || target.teacherId.toString() !== actor._id.toString()) {
      return { allowed: false, reason: 'You can only view students assigned to you.' };
    }

    return { allowed: true };
  }

  // Parent can only impersonate their linked children
  if (actor.role === 'parent') {
    if (target.role !== 'student') {
      return { allowed: false, reason: 'Parents can only view student accounts.' };
    }

    const childIds = (actor.children || []).map(id => id.toString());
    if (!childIds.includes(target._id.toString())) {
      return { allowed: false, reason: 'You can only view your linked children.' };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'You do not have permission to view as another user.' };
}

/**
 * Get impersonation status for current session
 */
function getImpersonationStatus(req) {
  const impersonation = req.session?.impersonation;

  if (!impersonation) {
    return { active: false };
  }

  const elapsed = Date.now() - new Date(impersonation.startedAt).getTime();
  const remainingMs = Math.max(0, IMPERSONATION_TIMEOUT_MS - elapsed);

  return {
    active: true,
    targetId: impersonation.targetId,
    targetName: impersonation.targetName,
    targetRole: impersonation.targetRole,
    readOnly: impersonation.readOnly,
    startedAt: impersonation.startedAt,
    remainingMinutes: Math.ceil(remainingMs / 60000),
    timeoutMs: IMPERSONATION_TIMEOUT_MS
  };
}

module.exports = {
  handleImpersonation,
  enforceReadOnly,
  startImpersonation,
  endImpersonation,
  canImpersonate,
  getImpersonationStatus,
  IMPERSONATION_TIMEOUT_MS
};
