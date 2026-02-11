// routes/courseSession.js
// Course session management: catalog, enrollment, progress, switching
// PURELY ADDITIVE — does not touch conversations, chat, or session routes

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const CourseSession = require('../models/courseSession');
const Conversation = require('../models/conversation');
const User = require('../models/user');

/* ============================================================
   GET /api/course-sessions/catalog
   List all available pathway-based courses from disk
   ============================================================ */
router.get('/catalog', async (req, res) => {
  try {
    const resourcesDir = path.join(__dirname, '../public/resources');
    const files = fs.readdirSync(resourcesDir).filter(f => f.endsWith('-pathway.json'));

    const catalog = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(resourcesDir, file), 'utf8');
        const pathway = JSON.parse(raw);

        catalog.push({
          courseId: pathway.courseId || file.replace('-pathway.json', ''),
          pathwayId: file.replace('.json', ''),
          title: pathway.courseName || pathway.title || pathway.courseId,
          track: pathway.track || '',
          description: pathway.overview || pathway.description || '',
          prerequisites: pathway.prerequisites || [],
          moduleCount: (pathway.modules || []).length,
          gradeBand: pathway.gradeBand || '',
          apWeight: pathway.examAlignment ? 'AP' : null
        });
      } catch (parseErr) {
        console.warn(`[CourseSession] Failed to parse ${file}:`, parseErr.message);
      }
    }

    // Sort roughly by difficulty (K first, Calc last)
    const order = [
      'kindergarten', 'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5',
      'grade-6', 'grade-7', 'grade-8', 'ready-for-algebra-1',
      'algebra-1', 'geometry', 'algebra-2', 'precalculus',
      'ap-calculus-ab', 'calculus-1', 'calculus-2', 'calculus-3', 'act-prep'
    ];
    catalog.sort((a, b) => {
      const ai = order.indexOf(a.courseId);
      const bi = order.indexOf(b.courseId);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    res.json({ success: true, catalog });
  } catch (err) {
    console.error('[CourseSession] Error loading catalog:', err);
    res.status(500).json({ success: false, message: 'Failed to load course catalog' });
  }
});

/* ============================================================
   GET /api/course-sessions
   List current user's course sessions
   ============================================================ */
router.get('/', async (req, res) => {
  try {
    const sessions = await CourseSession.find({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    }).sort({ updatedAt: -1 });

    res.json({ success: true, sessions });
  } catch (err) {
    console.error('[CourseSession] Error listing sessions:', err);
    res.status(500).json({ success: false, message: 'Failed to list course sessions' });
  }
});

/* ============================================================
   POST /api/course-sessions/enroll
   Enroll in a course (creates a CourseSession)
   ============================================================ */
router.post('/enroll', async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'courseId is required' });
    }

    // Check for existing active session in this course
    const existing = await CourseSession.findOne({
      userId: req.user._id,
      courseId,
      status: 'active'
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }

    // Cap concurrent enrollments at 2
    const MAX_CONCURRENT_COURSES = 2;
    const activeCount = await CourseSession.countDocuments({
      userId: req.user._id,
      status: 'active'
    });
    if (activeCount >= MAX_CONCURRENT_COURSES) {
      return res.status(400).json({
        success: false,
        message: `You can take up to ${MAX_CONCURRENT_COURSES} courses at a time. Drop a course to enroll in a new one.`
      });
    }

    // Load pathway to build module progress
    const pathwayFile = path.join(__dirname, '../public/resources', `${courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) {
      return res.status(404).json({ success: false, message: 'Course pathway not found' });
    }

    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const modules = (pathway.modules || []).map((m, i) => ({
      moduleId: m.moduleId,
      status: i === 0 ? 'available' : 'locked',
      scaffoldProgress: 0
    }));

    // Create a dedicated conversation for this course
    const conversation = new Conversation({
      userId: req.user._id,
      conversationName: pathway.courseName || courseId,
      topic: pathway.courseName || courseId,
      topicEmoji: '📚',
      conversationType: 'topic'
    });
    await conversation.save();

    // Create course session
    const session = new CourseSession({
      userId: req.user._id,
      courseId,
      courseName: pathway.courseName || pathway.title || courseId,
      pathwayId: `${courseId}-pathway`,
      currentModuleId: modules[0]?.moduleId || null,
      modules,
      overallProgress: 0,
      status: 'active',
      conversationId: conversation._id,
      createdBy: 'self'
    });
    await session.save();

    // Set as active course session on user
    await User.findByIdAndUpdate(req.user._id, {
      activeCourseSessionId: session._id
    });

    // Build welcome data for the client splash screen
    const pathwayModules = pathway.modules || [];
    const welcomeData = {
      courseName: session.courseName,
      overview: pathway.overview || '',
      moduleCount: pathwayModules.length,
      units: pathwayModules.slice(0, 6).map(m => m.title || m.moduleId),
      prerequisites: pathway.prerequisites || [],
      firstModuleTitle: pathwayModules[0]?.title || 'Getting Started'
    };

    res.json({
      success: true,
      message: `Enrolled in ${session.courseName}`,
      session,
      conversationId: conversation._id,
      welcomeData
    });
  } catch (err) {
    console.error('[CourseSession] Error enrolling:', err);
    res.status(500).json({ success: false, message: 'Failed to enroll' });
  }
});

/* ============================================================
   POST /api/course-sessions/:id/activate
   Set a course session as the active one
   ============================================================ */
router.post('/:id/activate', async (req, res) => {
  try {
    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Course session not found' });
    }

    // Set as active on user
    await User.findByIdAndUpdate(req.user._id, {
      activeCourseSessionId: session._id
    });

    // Switch conversation to the course's conversation
    if (session.conversationId) {
      await User.findByIdAndUpdate(req.user._id, {
        activeConversationId: session.conversationId
      });
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error('[CourseSession] Error activating:', err);
    res.status(500).json({ success: false, message: 'Failed to activate course session' });
  }
});

/* ============================================================
   POST /api/course-sessions/deactivate
   Clear active course session (return to general tutoring)
   ============================================================ */
router.post('/deactivate', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      activeCourseSessionId: null
    });

    res.json({ success: true, message: 'Returned to general tutoring' });
  } catch (err) {
    console.error('[CourseSession] Error deactivating:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate' });
  }
});

/* ============================================================
   GET /api/course-sessions/:id/progress
   Get detailed progress for a course session (for dropdown)
   ============================================================ */
router.get('/:id/progress', async (req, res) => {
  try {
    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Course session not found' });
    }

    // Load pathway for module titles
    const pathwayFile = path.join(__dirname, '../public/resources', `${session.courseId}-pathway.json`);
    let moduleDetails = [];

    if (fs.existsSync(pathwayFile)) {
      const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
      moduleDetails = (pathway.modules || []).map(pm => {
        const progress = session.modules.find(m => m.moduleId === pm.moduleId);
        return {
          moduleId: pm.moduleId,
          title: pm.title,
          unit: pm.unit,
          status: progress?.status || 'locked',
          scaffoldProgress: progress?.scaffoldProgress || 0,
          checkpointPassed: progress?.checkpointPassed || false,
          skills: pm.skills || [],
          apWeight: pm.apWeight || null
        };
      });
    }

    // Find the next module/lesson
    const currentModule = moduleDetails.find(m => m.moduleId === session.currentModuleId);
    const nextModule = moduleDetails.find(m => m.status === 'available' || m.status === 'in_progress');

    res.json({
      success: true,
      courseId: session.courseId,
      courseName: session.courseName,
      overallProgress: session.overallProgress,
      currentModuleId: session.currentModuleId,
      modules: moduleDetails,
      next: nextModule || currentModule || null
    });
  } catch (err) {
    console.error('[CourseSession] Error fetching progress:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch progress' });
  }
});

/* ============================================================
   POST /api/course-sessions/:id/drop
   Drop a course session
   ============================================================ */
router.post('/:id/drop', async (req, res) => {
  try {
    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: 'active'
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Active course session not found' });
    }

    session.status = 'paused';
    await session.save();

    // Clear active if this was the active one
    const user = await User.findById(req.user._id);
    if (user.activeCourseSessionId?.toString() === session._id.toString()) {
      user.activeCourseSessionId = null;
      await user.save();
    }

    res.json({ success: true, message: 'Course paused' });
  } catch (err) {
    console.error('[CourseSession] Error dropping:', err);
    res.status(500).json({ success: false, message: 'Failed to drop course' });
  }
});

module.exports = router;
