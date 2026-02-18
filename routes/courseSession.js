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
const { calculateOverallProgress } = require('../utils/coursePrompt');
const { buildProgressUpdate } = require('../utils/progressState');

/* ============================================================
   GET /api/course-sessions/catalog
   List all available pathway-based courses from disk
   ============================================================ */
// Catalog enrichment: difficulty levels, taglines, icons, sort order, and grouping
// sortOrder controls display position; group controls section headers
const CATALOG_META = {
  'early-math-foundations': { group: 'Elementary', difficulty: 'Foundational', tagline: 'Whole numbers, fractions, decimals, and geometry for grades 3\u20135', icon: '\uD83E\uDDF1', sortOrder: 0 },
  '6th-grade-math':         { group: 'Middle School', difficulty: 'Foundational', tagline: 'Fractions, ratios, expressions, geometry, and statistics', icon: '6\uFE0F\u20E3', sortOrder: 1 },
  '7th-grade-math':         { group: 'Middle School', difficulty: 'Foundational', tagline: 'Rational numbers, proportions, geometry, and probability', icon: '7\uFE0F\u20E3', sortOrder: 2 },
  'grade-8-math':           { group: 'Middle School', difficulty: 'Foundational', tagline: 'Linear equations, functions, and intro to geometry proofs', icon: '8\uFE0F\u20E3', sortOrder: 3 },
  'algebra-1':              { group: 'High School', difficulty: 'Intermediate', tagline: 'Equations, inequalities, and the language of algebra', icon: '\uD83C\uDD70\uFE0F', sortOrder: 4 },
  'geometry':               { group: 'High School', difficulty: 'Intermediate', tagline: 'Proofs, congruence, and spatial reasoning', icon: '\uD83D\uDCD0', sortOrder: 5 },
  'algebra-2':              { group: 'High School', difficulty: 'Advanced', tagline: 'Polynomials, logarithms, and complex functions', icon: '\uD83D\uDCC9', sortOrder: 6 },
  'precalculus':            { group: 'High School', difficulty: 'Advanced', tagline: 'Trigonometry, limits, and the gateway to calculus', icon: '\uD83C\uDF0A', sortOrder: 7 },
  'ap-calculus-ab':         { group: 'Advanced & AP', difficulty: 'Advanced', tagline: 'Master derivatives, integrals, and ace the AP exam', icon: '\uD83D\uDE80', sortOrder: 8 },
  'calculus-bc':            { group: 'Advanced & AP', difficulty: 'Advanced', tagline: 'Full BC curriculum: series, parametrics, and polar', icon: '\uD83D\uDE80', sortOrder: 9 },
  'consumer-math':          { group: 'Applied & Test Prep', difficulty: 'Applied', tagline: 'Real-world money math: paychecks, budgets, credit, and investing', icon: '\uD83D\uDCB0', sortOrder: 10 },
  'act-prep':               { group: 'Applied & Test Prep', difficulty: 'Test Prep', tagline: 'Targeted practice for every ACT Math question type', icon: '\uD83C\uDFAF', sortOrder: 11 }
};

router.get('/catalog', async (req, res) => {
  try {
    const resourcesDir = path.join(__dirname, '../public/resources');
    const files = fs.readdirSync(resourcesDir).filter(f => f.endsWith('-pathway.json'));

    const catalog = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(resourcesDir, file), 'utf8');
        const pathway = JSON.parse(raw);

        // Filter by audience: default shows student courses, ?audience=parent shows parent courses
        const requestedAudience = req.query.audience || 'student';
        const pathwayAudience = pathway.audience || 'student';
        if (pathwayAudience !== requestedAudience) continue;

        const cid = pathway.courseId || file.replace('-pathway.json', '');
        const meta = CATALOG_META[cid] || {};

        catalog.push({
          courseId: cid,
          pathwayId: file.replace('.json', ''),
          title: pathway.track || pathway.courseName || pathway.title || cid,
          track: pathway.track || '',
          description: pathway.overview || pathway.description || '',
          tagline: meta.tagline || '',
          difficulty: meta.difficulty || '',
          icon: meta.icon || '\uD83D\uDCDA',
          group: meta.group || '',
          sortOrder: meta.sortOrder != null ? meta.sortOrder : 99,
          prerequisites: pathway.prerequisites || [],
          moduleCount: (pathway.modules || []).length,
          gradeBand: pathway.gradeBand || '',
          apWeight: pathway.examAlignment ? 'AP' : null
        });
      } catch (parseErr) {
        console.warn(`[CourseSession] Failed to parse ${file}:`, parseErr.message);
      }
    }

    // Sort by grade progression (sortOrder from CATALOG_META)
    catalog.sort((a, b) => a.sortOrder - b.sortOrder);

    // Personalized recommendation based on user's grade
    const GRADE_COURSE_MAP = {
      '3rd-grade': 'early-math-foundations', '4th-grade': 'early-math-foundations', '5th-grade': 'early-math-foundations',
      '6th-grade': '6th-grade-math', '7th-grade': '7th-grade-math', '8th-grade': 'grade-8-math',
      '9th-grade': 'algebra-1', '10th-grade': 'geometry', '11th-grade': 'algebra-2', '12th-grade': 'precalculus'
    };
    let recommended = null;
    if (req.user && req.user.gradeLevel) {
      const grade = req.user.gradeLevel.toLowerCase().replace(/\s+/g, '-');
      recommended = GRADE_COURSE_MAP[grade] || null;
    }

    res.json({ success: true, catalog, recommended });
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

    // Recalculate overallProgress from module data to fix any stale values
    for (const s of sessions) {
      const recalc = calculateOverallProgress(s.modules);
      if (recalc !== s.overallProgress) {
        s.overallProgress = recalc;
        s.markModified('modules');
        await s.save();
      }
    }

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

    // Check for existing session in this course (active OR paused)
    const existing = await CourseSession.findOne({
      userId: req.user._id,
      courseId,
      status: { $in: ['active', 'paused'] }
    });

    if (existing && existing.status === 'active') {
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }

    // Resume a paused (dropped) session — restore progress instead of starting over
    if (existing && existing.status === 'paused') {
      existing.status = 'active';
      // Recalculate progress from module data in case it was stale
      existing.overallProgress = calculateOverallProgress(existing.modules);
      existing.markModified('modules');
      await existing.save();

      await User.findByIdAndUpdate(req.user._id, {
        activeCourseSessionId: existing._id,
        activeConversationId: existing.conversationId
      });

      // Load pathway for welcome data
      const pathwayFile = path.join(__dirname, '../public/resources', `${courseId}-pathway.json`);
      const pathway = fs.existsSync(pathwayFile)
        ? JSON.parse(fs.readFileSync(pathwayFile, 'utf8'))
        : { modules: [], overview: '' };
      const pathwayModules = pathway.modules || [];

      const welcomeData = {
        courseName: existing.courseName,
        overview: pathway.overview || '',
        moduleCount: pathwayModules.length,
        units: pathwayModules.slice(0, 6).map(m => m.title || m.moduleId),
        prerequisites: pathway.prerequisites || [],
        firstModuleTitle: pathwayModules[0]?.title || 'Getting Started'
      };

      console.log(`📚 [CourseSession] ${req.user.firstName} resumed ${existing.courseName} (${existing.overallProgress}% progress preserved)`);

      return res.json({
        success: true,
        message: `Welcome back to ${existing.courseName}! Your progress (${existing.overallProgress}%) has been restored.`,
        session: existing,
        conversationId: existing.conversationId,
        welcomeData,
        resumed: true
      });
    }

    // Cap concurrent enrollments at 2
    const MAX_CONCURRENT_COURSES = 2;
    const activeCount = await CourseSession.countDocuments({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
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

    // Prevent students from enrolling in parent-audience courses (parents can enroll)
    if (pathway.audience === 'parent' && req.user.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'This course is not available for student enrollment.' });
    }

    const modules = (pathway.modules || []).map((m, i) => ({
      moduleId: m.moduleId,
      unit: m.unit,
      title: m.title,
      status: i === 0 ? 'available' : 'locked',
      scaffoldProgress: 0,
      lessons: (m.lessons || []).map((l, li) => ({
        lessonId: l.lessonId,
        title: l.title,
        order: l.order || li + 1,
        status: (i === 0 && li === 0) ? 'available' : 'locked'
      }))
    }));

    // Create a dedicated conversation for this course
    const conversation = new Conversation({
      userId: req.user._id,
      conversationName: pathway.track || pathway.courseName || courseId,
      topic: pathway.track || pathway.courseName || courseId,
      topicEmoji: '📚',
      conversationType: 'course'
    });
    await conversation.save();

    // Create course session
    const session = new CourseSession({
      userId: req.user._id,
      courseId,
      courseName: pathway.track || pathway.courseName || pathway.title || courseId,
      pathwayId: `${courseId}-pathway`,
      currentModuleId: modules[0]?.moduleId || null,
      currentLessonId: modules[0]?.lessons?.[0]?.lessonId || null,
      modules,
      overallProgress: 0,
      status: 'active',
      conversationId: conversation._id,
      createdBy: 'self'
    });
    await session.save();

    // Set as active course session on user
    // NOTE: We do NOT set activeConversationId here — course chat uses
    // courseSession.conversationId directly via /api/course-chat.
    // Setting it here would contaminate main chat when the user exits.
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

    // Ensure the course conversation is active (so messages can be saved)
    // but do NOT set activeConversationId — course chat uses
    // courseSession.conversationId directly, and we don't want the main
    // chat greeting to land in a course conversation on next page load.
    if (session.conversationId) {
      const Conversation = require('../models/conversation');
      await Conversation.findByIdAndUpdate(session.conversationId, { isActive: true });
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
    // Clear both IDs so main chat starts a fresh conversation
    // instead of loading the stale course conversation
    await User.findByIdAndUpdate(req.user._id, {
      activeCourseSessionId: null,
      activeConversationId: null
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
        // Merge lesson progress from session with pathway lesson metadata
        const lessons = (pm.lessons || []).map(pl => {
          const lp = (progress?.lessons || []).find(l => l.lessonId === pl.lessonId);
          return {
            lessonId: pl.lessonId,
            title: pl.title || pl.lessonId,
            order: pl.order,
            status: lp?.status || 'locked',
            startedAt: lp?.startedAt || null,
            completedAt: lp?.completedAt || null
          };
        });
        return {
          moduleId: pm.moduleId,
          title: pm.title,
          unit: pm.unit,
          status: progress?.status || 'locked',
          scaffoldProgress: progress?.scaffoldProgress || 0,
          checkpointPassed: progress?.checkpointPassed || false,
          skills: pm.skills || [],
          apWeight: pm.apWeight || null,
          lessons: lessons.sort((a, b) => (a.order || 0) - (b.order || 0))
        };
      });
    }

    // Find the next module/lesson
    const currentModule = moduleDetails.find(m => m.moduleId === session.currentModuleId);
    const nextModule = moduleDetails.find(m => m.status === 'available' || m.status === 'in_progress');

    // Build breadcrumb for current position
    const curMod = currentModule || nextModule;
    const curLesson = curMod?.lessons?.find(l => l.lessonId === session.currentLessonId);
    const breadcrumb = curMod ? {
      unit: curMod.unit,
      moduleName: curMod.title,
      lessonTitle: curLesson?.title || null,
      currentLessonId: session.currentLessonId
    } : null;

    res.json({
      success: true,
      courseId: session.courseId,
      courseName: session.courseName,
      overallProgress: session.overallProgress,
      currentModuleId: session.currentModuleId,
      currentLessonId: session.currentLessonId,
      modules: moduleDetails,
      next: nextModule || currentModule || null,
      breadcrumb
    });
  } catch (err) {
    console.error('[CourseSession] Error fetching progress:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch progress' });
  }
});

/* ============================================================
   GET /api/course-sessions/:id/lesson-progress
   Rehydration endpoint: returns the full progressUpdate payload
   for the student's current lesson position. Called on page load,
   tab refocus, and reconnect.
   ============================================================ */
router.get('/:id/lesson-progress', async (req, res) => {
  try {
    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Course session not found' });
    }

    // Load module data for scaffold info
    const pathwayFile = path.join(__dirname, '../public/resources', `${session.courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) {
      return res.status(500).json({ success: false, message: 'Course pathway not found' });
    }
    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const currentPathwayModule = (pathway.modules || []).find(m => m.moduleId === session.currentModuleId);

    let moduleData = { title: currentPathwayModule?.title || session.currentModuleId, skills: [] };
    if (currentPathwayModule?.moduleFile) {
      const moduleFile = path.join(__dirname, '../public/modules', session.courseId, currentPathwayModule.moduleFile);
      if (fs.existsSync(moduleFile)) {
        moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
      }
    }

    // Load conversation for problem stats
    let conversation = null;
    if (session.conversationId) {
      conversation = await Conversation.findById(session.conversationId);
    }

    const progressUpdate = buildProgressUpdate({
      courseSession: session,
      moduleData,
      conversation,
      lastSignal: null,
      showCheckpoint: false
    });

    res.json({ success: true, progressUpdate });
  } catch (err) {
    console.error('[CourseSession] Error fetching lesson progress:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch lesson progress' });
  }
});

/* ============================================================
   POST /api/course-sessions/:id/complete-module
   Mark a module as completed, unlock next, award XP
   ============================================================ */
const MODULE_COMPLETE_XP = 150;
const CHECKPOINT_BONUS_XP = 250;
const COURSE_COMPLETE_XP = 1000;

router.post('/:id/complete-module', async (req, res) => {
  try {
    const { moduleId, checkpointPassed } = req.body;
    if (!moduleId) {
      return res.status(400).json({ success: false, message: 'moduleId is required' });
    }

    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: 'active'
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Active course session not found' });
    }

    // Find the module in the session
    const mod = session.modules.find(m => m.moduleId === moduleId);
    if (!mod) {
      return res.status(404).json({ success: false, message: 'Module not found in course session' });
    }
    if (mod.status === 'completed') {
      return res.json({ success: true, message: 'Module already completed', xpAwarded: 0 });
    }

    // Mark completed
    mod.status = 'completed';
    mod.scaffoldProgress = 100;
    if (checkpointPassed) mod.checkpointPassed = true;
    mod.completedAt = new Date();

    // Unlock the next module
    const modIndex = session.modules.findIndex(m => m.moduleId === moduleId);
    if (modIndex >= 0 && modIndex < session.modules.length - 1) {
      const nextMod = session.modules[modIndex + 1];
      if (nextMod.status === 'locked') {
        nextMod.status = 'available';
      }
      session.currentModuleId = nextMod.moduleId;
    }

    // Calculate blended overall progress (includes scaffold progress for in-progress modules)
    session.overallProgress = calculateOverallProgress(session.modules);

    // Check if course is fully completed
    const completedCount = session.modules.filter(m => m.status === 'completed').length;
    const courseComplete = completedCount === session.modules.length;
    if (courseComplete) {
      session.status = 'completed';
      session.completedAt = new Date();
    }

    session.markModified('modules');
    await session.save();

    // Award XP
    let totalXpAwarded = MODULE_COMPLETE_XP;
    let xpReasons = [`Module complete: ${moduleId}`];

    if (checkpointPassed) {
      totalXpAwarded += CHECKPOINT_BONUS_XP;
      xpReasons.push('Checkpoint passed');
    }
    if (courseComplete) {
      totalXpAwarded += COURSE_COMPLETE_XP;
      xpReasons.push(`Course completed: ${session.courseName}`);
    }

    // Use userService.awardXP if available, otherwise direct update
    try {
      const userService = require('../services/userService');
      await userService.awardXP(req.user._id, totalXpAwarded, xpReasons.join(' + '));
    } catch (xpErr) {
      // Fallback: direct XP update
      console.warn('[CourseSession] userService.awardXP failed, using direct update:', xpErr.message);
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { xp: totalXpAwarded },
        $push: { xpHistory: { date: new Date(), amount: totalXpAwarded, reason: xpReasons.join(' + ') } }
      });
    }

    console.log(`🎓 [CourseSession] ${req.user.firstName} completed module ${moduleId}: +${totalXpAwarded} XP${courseComplete ? ' (COURSE COMPLETE!)' : ''}`);

    res.json({
      success: true,
      xpAwarded: totalXpAwarded,
      courseComplete,
      overallProgress: session.overallProgress,
      nextModuleId: session.currentModuleId
    });
  } catch (err) {
    console.error('[CourseSession] Error completing module:', err);
    res.status(500).json({ success: false, message: 'Failed to complete module' });
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
      status: { $in: ['active', 'paused'] }
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Course session not found' });
    }

    session.status = 'dropped';
    await session.save();

    // Clear active if this was the active one
    const user = await User.findById(req.user._id);
    if (user.activeCourseSessionId?.toString() === session._id.toString()) {
      user.activeCourseSessionId = null;
      await user.save();
    }

    res.json({ success: true, message: 'Course dropped' });
  } catch (err) {
    console.error('[CourseSession] Error dropping:', err);
    res.status(500).json({ success: false, message: 'Failed to drop course' });
  }
});

module.exports = router;
