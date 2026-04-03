// routes/browserLock.js
// API routes for the Browser Lock & Live Class Monitor features.
//
// Teacher endpoints:
//   POST   /api/browser-lock/activate        – Start a lock session for a class
//   POST   /api/browser-lock/deactivate      – End a lock session
//   GET    /api/browser-lock/status/:classId  – Get current lock status for a class
//   GET    /api/browser-lock/monitor/stream   – SSE stream of live student statuses
//   GET    /api/browser-lock/monitor/spy/:studentId – Detailed view of one student
//
// Student endpoints:
//   GET    /api/browser-lock/check            – Check if student is in a locked session
//   POST   /api/browser-lock/heartbeat        – Report status + activity
//   POST   /api/browser-lock/violation        – Report a violation event

const express = require('express');
const router = express.Router();
const BrowserLockSession = require('../models/browserLockSession');
const EnrollmentCode = require('../models/enrollmentCode');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const { isTeacher, isStudent } = require('../middleware/auth');
const { getStudentIdsForTeacher } = require('../services/userService');
const logger = require('../utils/logger');

// ─── TEACHER ENDPOINTS ───────────────────────────────────────────────────────

/**
 * POST /activate – Start a browser-lock session for a class
 * Body: { classId, sessionName?, settings? }
 */
router.post('/activate', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { classId, sessionName, settings } = req.body;

    if (!classId) {
      return res.status(400).json({ message: 'classId is required.' });
    }

    // Verify this class belongs to the teacher
    const enrollmentCode = await EnrollmentCode.findOne({
      _id: classId,
      teacherId
    });

    if (!enrollmentCode) {
      return res.status(403).json({ message: 'Class not found or not owned by you.' });
    }

    // End any existing active session for this class
    await BrowserLockSession.updateMany(
      { classId, isActive: true },
      { $set: { isActive: false, endedAt: new Date() } }
    );

    // Create new lock session
    const session = await BrowserLockSession.create({
      teacherId,
      classId,
      sessionName: sessionName || `${enrollmentCode.className} - Focus Session`,
      settings: settings || {},
      isActive: true,
      startedAt: new Date()
    });

    logger.info(`Browser lock activated for class ${enrollmentCode.className}`, {
      teacherId: teacherId.toString(),
      classId: classId.toString(),
      sessionId: session._id.toString()
    });

    res.json({
      success: true,
      sessionId: session._id,
      message: `Focus mode activated for ${enrollmentCode.className}`,
      studentCount: enrollmentCode.enrolledStudents.length
    });
  } catch (error) {
    logger.error('Error activating browser lock:', error);
    res.status(500).json({ message: 'Failed to activate browser lock.' });
  }
});

/**
 * POST /deactivate – End a browser-lock session
 * Body: { sessionId } or { classId }
 */
router.post('/deactivate', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { sessionId, classId } = req.body;

    const query = { teacherId, isActive: true };
    if (sessionId) query._id = sessionId;
    else if (classId) query.classId = classId;
    else return res.status(400).json({ message: 'sessionId or classId is required.' });

    const session = await BrowserLockSession.findOneAndUpdate(
      query,
      { $set: { isActive: false, endedAt: new Date() } },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'No active lock session found.' });
    }

    // Build a violation summary
    const violationsByStudent = {};
    for (const v of session.violations) {
      const sid = v.studentId.toString();
      violationsByStudent[sid] = (violationsByStudent[sid] || 0) + 1;
    }

    res.json({
      success: true,
      message: 'Focus mode deactivated.',
      summary: {
        duration: Math.round((session.endedAt - session.startedAt) / 60000),
        totalViolations: session.violations.length,
        violationsByStudent,
        studentsConnected: session.studentStatuses.length
      }
    });
  } catch (error) {
    logger.error('Error deactivating browser lock:', error);
    res.status(500).json({ message: 'Failed to deactivate browser lock.' });
  }
});

/**
 * GET /status/:classId – Get current lock status for a class
 */
router.get('/status/:classId', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { classId } = req.params;

    const session = await BrowserLockSession.findOne({
      classId,
      teacherId,
      isActive: true
    });

    if (!session) {
      return res.json({ locked: false });
    }

    // Mark students as disconnected if no heartbeat in 60s
    const staleThreshold = new Date(Date.now() - 60 * 1000);
    for (const s of session.studentStatuses) {
      if (s.lastHeartbeat < staleThreshold && s.status !== 'disconnected') {
        s.status = 'disconnected';
      }
    }
    await session.save();

    res.json({
      locked: true,
      sessionId: session._id,
      sessionName: session.sessionName,
      settings: session.settings,
      startedAt: session.startedAt,
      studentStatuses: session.studentStatuses,
      totalViolations: session.violations.length
    });
  } catch (error) {
    logger.error('Error fetching lock status:', error);
    res.status(500).json({ message: 'Failed to get lock status.' });
  }
});

/**
 * GET /monitor/stream – SSE stream of live student statuses
 * Query: ?classId=xxx
 * Sends updated student grid data every 3 seconds
 */
router.get('/monitor/stream', isTeacher, async (req, res) => {
  const teacherId = req.user._id;
  const { classId } = req.query;

  if (!classId) {
    return res.status(400).json({ message: 'classId query param is required.' });
  }

  // Verify ownership
  const enrollmentCode = await EnrollmentCode.findOne({ _id: classId, teacherId });
  if (!enrollmentCode) {
    return res.status(403).json({ message: 'Class not found or not owned by you.' });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');

  const sendUpdate = async () => {
    try {
      const session = await BrowserLockSession.findOne({
        classId,
        teacherId,
        isActive: true
      });

      // Get all enrolled students for the class
      const studentIds = enrollmentCode.enrolledStudents.map(e => e.studentId);
      const students = await User.find(
        { _id: { $in: studentIds }, role: 'student' },
        'firstName lastName username lastLogin'
      ).lean();

      // Get active conversations for these students
      const activeConvos = await Conversation.find({
        userId: { $in: studentIds },
        isActive: true,
        lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
      }, 'userId currentTopic liveSummary lastActivity problemsAttempted problemsCorrect').lean();

      const convoMap = {};
      for (const c of activeConvos) {
        convoMap[c.userId.toString()] = c;
      }

      // Build the grid data
      const staleThreshold = new Date(Date.now() - 60 * 1000);
      const grid = students.map(student => {
        const sid = student._id.toString();
        const sessionStatus = session
          ? session.studentStatuses.find(s => s.studentId.toString() === sid)
          : null;
        const convo = convoMap[sid];
        const violations = session
          ? session.violations.filter(v => v.studentId.toString() === sid)
          : [];

        let status = 'offline';
        if (sessionStatus) {
          status = sessionStatus.lastHeartbeat > staleThreshold
            ? sessionStatus.status
            : 'disconnected';
        } else if (convo) {
          status = 'active'; // has active convo but no lock session status
        }

        return {
          studentId: sid,
          name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username,
          status,
          currentActivity: sessionStatus?.currentActivity || convo?.currentTopic || '',
          currentPage: sessionStatus?.currentPage || '',
          lastMessagePreview: sessionStatus?.lastMessagePreview || '',
          isFullscreen: sessionStatus?.isFullscreen || false,
          violationCount: violations.length,
          lastViolation: violations.length > 0 ? violations[violations.length - 1] : null,
          lastHeartbeat: sessionStatus?.lastHeartbeat || null,
          problemsAttempted: convo?.problemsAttempted || 0,
          problemsCorrect: convo?.problemsCorrect || 0
        };
      });

      const payload = {
        locked: !!session,
        sessionId: session?._id,
        sessionName: session?.sessionName,
        startedAt: session?.startedAt,
        totalViolations: session ? session.violations.length : 0,
        students: grid,
        timestamp: new Date().toISOString()
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      logger.error('SSE monitor stream error:', err);
    }
  };

  // Send initial data immediately, then every 3 seconds
  await sendUpdate();
  const interval = setInterval(sendUpdate, 3000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * GET /monitor/spy/:studentId – Detailed live view of a single student
 * Query: ?classId=xxx
 */
router.get('/monitor/spy/:studentId', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { studentId } = req.params;

    // Verify the teacher has access to this student
    const authorizedStudentIds = await getStudentIdsForTeacher(teacherId);
    if (!authorizedStudentIds.includes(studentId)) {
      return res.status(403).json({ message: 'Student not assigned to you.' });
    }

    const student = await User.findById(studentId,
      'firstName lastName username gradeLevel mathCourse level xp'
    ).lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Get their active conversation with full recent messages
    const conversation = await Conversation.findOne({
      userId: studentId,
      isActive: true,
      lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
    }).lean();

    // Get recent messages (last 20)
    let recentMessages = [];
    if (conversation && conversation.messages) {
      recentMessages = conversation.messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content ? m.content.substring(0, 500) : '',
        timestamp: m.timestamp || m.createdAt
      }));
    }

    // Get lock session violations for this student
    const activeSession = await BrowserLockSession.findOne({
      teacherId,
      isActive: true
    });

    let violations = [];
    let studentStatus = null;
    if (activeSession) {
      violations = activeSession.violations
        .filter(v => v.studentId.toString() === studentId)
        .slice(-20);
      studentStatus = activeSession.studentStatuses
        .find(s => s.studentId.toString() === studentId);
    }

    res.json({
      student,
      status: studentStatus || { status: 'offline' },
      conversation: conversation ? {
        id: conversation._id,
        topic: conversation.currentTopic,
        summary: conversation.liveSummary,
        startTime: conversation.startDate,
        lastActivity: conversation.lastActivity,
        problemsAttempted: conversation.problemsAttempted || 0,
        problemsCorrect: conversation.problemsCorrect || 0,
        duration: conversation.activeMinutes
      } : null,
      recentMessages,
      violations
    });
  } catch (error) {
    logger.error('Error fetching spy data:', error);
    res.status(500).json({ message: 'Failed to fetch student details.' });
  }
});

// ─── STUDENT ENDPOINTS ───────────────────────────────────────────────────────

/**
 * GET /check – Check if the current student is in a locked session
 */
router.get('/check', isStudent, async (req, res) => {
  try {
    const studentId = req.user._id;
    const session = await BrowserLockSession.findActiveForStudent(studentId);

    if (!session) {
      return res.json({ locked: false });
    }

    res.json({
      locked: true,
      sessionId: session._id,
      sessionName: session.sessionName,
      settings: session.settings
    });
  } catch (error) {
    logger.error('Error checking lock status:', error);
    res.status(500).json({ message: 'Failed to check lock status.' });
  }
});

/**
 * POST /heartbeat – Student reports their current status
 * Body: { sessionId, status, currentActivity, currentPage, lastMessagePreview, isFullscreen }
 */
router.post('/heartbeat', isStudent, async (req, res) => {
  try {
    const studentId = req.user._id;
    const { sessionId, status, currentActivity, currentPage, lastMessagePreview, isFullscreen } = req.body;

    let session;
    if (sessionId) {
      session = await BrowserLockSession.findOne({ _id: sessionId, isActive: true });
    } else {
      session = await BrowserLockSession.findActiveForStudent(studentId);
    }

    if (!session) {
      return res.json({ locked: false });
    }

    session.updateStudentStatus(studentId, {
      status: status || 'active',
      currentActivity: currentActivity || '',
      currentPage: currentPage || '',
      lastMessagePreview: lastMessagePreview || '',
      isFullscreen: isFullscreen || false
    });

    await session.save();
    res.json({ success: true, locked: true });
  } catch (error) {
    logger.error('Error processing heartbeat:', error);
    res.status(500).json({ message: 'Failed to process heartbeat.' });
  }
});

/**
 * POST /violation – Student reports a violation event
 * Body: { sessionId, type, details }
 */
router.post('/violation', isStudent, async (req, res) => {
  try {
    const studentId = req.user._id;
    const { sessionId, type, details } = req.body;

    const validTypes = ['tab-switch', 'navigation-attempt', 'fullscreen-exit', 'window-blur', 'devtools-open'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid violation type.' });
    }

    let session;
    if (sessionId) {
      session = await BrowserLockSession.findOne({ _id: sessionId, isActive: true });
    } else {
      session = await BrowserLockSession.findActiveForStudent(studentId);
    }

    if (!session) {
      return res.json({ locked: false });
    }

    // Add violation
    session.violations.push({
      studentId,
      type,
      details: details || '',
      timestamp: new Date()
    });

    // Update student's violation count
    const studentStatus = session.studentStatuses.find(
      s => s.studentId.toString() === studentId.toString()
    );
    if (studentStatus) {
      studentStatus.violationCount = (studentStatus.violationCount || 0) + 1;
      studentStatus.status = 'tab-away';
    }

    await session.save();

    // Check if student has exceeded max violations
    const studentViolations = session.violations.filter(
      v => v.studentId.toString() === studentId.toString()
    ).length;
    const maxViolations = session.settings.maxViolationsBeforeAlert || 3;

    res.json({
      success: true,
      violationCount: studentViolations,
      warning: studentViolations >= maxViolations
        ? 'Your teacher has been notified about repeated tab switches.'
        : session.settings.showWarningOnViolation
          ? session.settings.lockMessage
          : null
    });
  } catch (error) {
    logger.error('Error recording violation:', error);
    res.status(500).json({ message: 'Failed to record violation.' });
  }
});

module.exports = router;
