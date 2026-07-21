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
const ActTestSession = require('../models/actTestSession');
const { calculateOverallProgress } = require('../utils/coursePrompt');
const { isAuthenticated } = require('../middleware/auth');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const { configCache } = require('../utils/cache');
const { courseSkills, buildBlueprint, scoreBySkill, recommendedStart } = require('../utils/coursePreAssessment');
const { gradeOne } = require('../utils/skillChallenge');
const { advanceRung } = require('../utils/skillRung');
const { getSkillMasteryEntry, setSkillMasteryEntry, decodedMasteryMap } = require('../utils/masteryGuard');
const { buildGraph, applyProofCascade } = require('../utils/skillClosure');
const { buildProgressUpdate } = require('../utils/progressState');

// Day-one diagnostic prompt shown as a card on course entry, so the tutor can
// target the course to the student's real level. Per course:
//   - ACT prep → a full practice ACT (window.openActTest), gated on having taken one.
//   - Algebra / Calculus / Precalc → the adaptive Starting Point placement
//     (window.openStartingPoint), gated on user.assessmentCompleted.
// Persists until the student completes it. Returns a welcomeData.diagnostic
// descriptor, or null. Extend by adding a course entry below.
const STARTING_POINT_CARD = {
  type: 'starting-point',
  title: 'Find your Starting Point',
  body: 'Take a short adaptive placement first — no studying needed. Your tutor uses it to '
    + 'start you at exactly the right level and focus each session on what you actually need.',
  cta: 'Take the Starting Point',
};
// Every course opens with a pre-assessment. A course is prep and readiness, not
// the whole curriculum, so the first thing it should do is establish what the
// student already owns — then clear those skills and aim the course at what is
// left. Courses with a purpose-built diagnostic keep it; everything else gets the
// course pre-assessment, which tests that course's OWN skills rather than a
// generic placement.
const PRE_ASSESSMENT_CARD = {
  type: 'course-preassessment',
  title: 'Start with a quick check',
  body: 'Answer a few questions first so this course can skip what you already know '
    + 'and spend its time on what you actually need. Anything you get right is marked '
    + 'as yours — you will not be taught it again.',
  cta: 'Start the check',
};
const COURSE_DIAGNOSTICS = {
  'act-prep': {
    type: 'act-practice',
    title: 'Start with a full Practice ACT',
    body: 'Take a timed practice ACT Math test first. Your tutor uses the results to pinpoint '
      + 'exactly which skills to focus your bootcamp on — so every session targets your real gaps.',
    cta: 'Take the Practice ACT',
  },
  'algebra-1': STARTING_POINT_CARD,
  'algebra-2': STARTING_POINT_CARD,
  'ap-calculus-ab': STARTING_POINT_CARD,
  'calculus-bc': STARTING_POINT_CARD,
  'precalculus': STARTING_POINT_CARD,
};

async function buildCourseDiagnostic(user, courseId) {
  // Default rather than an allowlist — a course with no entry used to open with
  // no diagnostic at all, which is how a student ends up being taught a module
  // they could already pass.
  const card = COURSE_DIAGNOSTICS[courseId] || PRE_ASSESSMENT_CARD;
  if (!card || !user) return null;
  if (card.type === 'course-preassessment') {
    // Only once per course: a completed session's pre-assessment stands.
    try {
      const done = await CourseSession.countDocuments({
        userId: user._id, courseId, preAssessmentCompletedAt: { $ne: null }
      });
      if (done > 0) return null;
    } catch (err) {
      console.error('[CourseSession] pre-assessment check failed (non-fatal):', err.message);
      return null;
    }
    return { type: card.type, title: card.title, body: card.body, cta: card.cta, courseId };
  }
  try {
    if (card.type === 'act-practice') {
      const taken = await ActTestSession.countDocuments({ userId: user._id, status: 'completed' });
      if (taken > 0) return null;                 // already took a practice ACT
    } else if (card.type === 'starting-point') {
      const expired = user.assessmentExpiresAt && new Date(user.assessmentExpiresAt) < new Date();
      if (user.assessmentCompleted && !expired) return null; // already placed (and current)
    }
  } catch (err) {
    console.error('[CourseSession] diagnostic check failed (non-fatal):', err.message);
    return null;
  }
  return { type: card.type, title: card.title, body: card.body, cta: card.cta };
}

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
  'act-prep':               { group: 'Applied & Test Prep', difficulty: 'Test Prep', tagline: 'Targeted practice for every ACT Math question type', icon: '\uD83C\uDFAF', sortOrder: 11 },
  'parent-math-k2':         { group: 'Parent Guides', difficulty: 'Parent', tagline: 'Number bonds, ten frames, and visual models for K\u20132 math', icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', sortOrder: 0 },
  'parent-math-35':         { group: 'Parent Guides', difficulty: 'Parent', tagline: 'Area models, fractions, and tape diagrams for 3\u20135 math', icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', sortOrder: 1 },
  'parent-math-68':         { group: 'Parent Guides', difficulty: 'Parent', tagline: 'Ratios, algebra tiles, and integers for 6\u20138 math', icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', sortOrder: 2 }
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

    // Courses are open to all students as a free on-ramp — no plan/license required to enrol.
    // AI usage inside the course is still metered by usageGate (30 free min/month); the cap,
    // not enrolment, is the upgrade moment. See docs/COURSES_IN_FLOW_DESIGN.md.

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
        firstModuleTitle: pathwayModules[0]?.title || 'Getting Started',
        diagnostic: await buildCourseDiagnostic(req.user, courseId)
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
      firstModuleTitle: pathwayModules[0]?.title || 'Getting Started',
      diagnostic: await buildCourseDiagnostic(req.user, courseId)
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

    // Day-one diagnostic nudge for returning students too (e.g. an ACT-prep
    // student who enrolled earlier and never took the practice test). Shown as a
    // card when they re-open the course from the sidebar.
    const diagnostic = await buildCourseDiagnostic(req.user, session.courseId);

    res.json({ success: true, session, diagnostic });
  } catch (err) {
    console.error('[CourseSession] Error activating:', err);
    res.status(500).json({ success: false, message: 'Failed to activate course session' });
  }
});

/* ============================================================
   GET /api/course-sessions/:id/diagnostic
   Day-one diagnostic descriptor for a session (or null). Lets the client
   surface the practice-ACT / starting-point card when a returning student loads
   straight into an already-active course — i.e. neither the enroll/resume splash
   nor an explicit activate fired, so the card would otherwise never appear.
   ============================================================ */
router.get('/:id/diagnostic', async (req, res) => {
  try {
    const session = await CourseSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Course session not found' });
    }
    const diagnostic = await buildCourseDiagnostic(req.user, session.courseId);
    res.json({ success: true, diagnostic });
  } catch (err) {
    console.error('[CourseSession] diagnostic lookup failed (non-fatal):', err.message);
    res.status(500).json({ success: false, diagnostic: null });
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
      // moduleFile is stored as "/modules/{courseId}/file.json" — resolve relative to public/
      const moduleFile = path.join(__dirname, '../public', currentPathwayModule.moduleFile);
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

/* ============================================================
   COURSE PRE-ASSESSMENT
   Every course opens by finding out what the student already owns.
   ============================================================ */

function loadPathwayByCourseId(courseId) {
  const resourcesDir = path.join(__dirname, '..', 'public', 'resources');
  const files = fs.readdirSync(resourcesDir).filter(f => f.endsWith('-pathway.json'));
  for (const file of files) {
    try {
      const pathway = JSON.parse(fs.readFileSync(path.join(resourcesDir, file), 'utf8'));
      const cid = pathway.courseId || file.replace('-pathway.json', '');
      if (cid === courseId) return pathway;
    } catch (_) { /* skip an unreadable pathway rather than fail the request */ }
  }
  return null;
}

/**
 * Serve the pre-assessment for a course.
 * GET /api/course-sessions/:id/preassessment
 *
 * Answers are never included — grading is server-side, same as a challenge.
 */
router.get('/:id/preassessment', isAuthenticated, async (req, res) => {
  try {
    const session = await CourseSession.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ error: 'Course session not found' });

    const pathway = loadPathwayByCourseId(session.courseId);
    if (!pathway) return res.status(404).json({ error: 'Course pathway not found' });

    const skills = courseSkills(pathway).map(s => s.skillId);
    // How many usable items exist per skill, so the blueprint only tests what
    // the bank can actually support.
    const counts = await Problem.aggregate([
      { $match: { skillId: { $in: skills }, isActive: { $ne: false } } },
      { $group: { _id: '$skillId', n: { $sum: 1 } } }
    ]);
    const available = {};
    counts.forEach(c => { available[c._id] = c.n; });

    const blueprint = buildBlueprint(pathway, available);
    if (!blueprint.skills.length) {
      // Be explicit rather than serving an empty form.
      return res.status(409).json({
        error: 'No pre-assessment available for this course yet',
        totalCourseSkills: blueprint.totalCourseSkills
      });
    }

    const problems = [];
    for (const s of blueprint.skills) {
      const items = await Problem.aggregate([
        { $match: { skillId: s.skillId, isActive: { $ne: false } } },
        { $sample: { size: blueprint.itemsPerSkill } }
      ]);
      items.forEach(p => problems.push({
        problemId: String(p._id),
        skillId: s.skillId,
        prompt: p.prompt,
        answerType: p.answerType,
        options: p.options || undefined      // never p.answer / p.correctOption
      }));
    }

    res.json({
      courseId: session.courseId,
      title: pathway.title || session.courseId,
      instructions: 'Anything you get right here is marked as yours — this course will not teach it again.',
      problems,
      // Honest about what this can and cannot tell them.
      coverage: blueprint.coverage,
      totalCourseSkills: blueprint.totalCourseSkills,
      skillsAssessed: blueprint.skills.length
    });
  } catch (err) {
    console.error('[CourseSession] pre-assessment GET failed:', err);
    res.status(500).json({ error: 'Failed to build pre-assessment' });
  }
});

/**
 * Grade a pre-assessment, clear what the student demonstrated, and aim the course.
 * POST /api/course-sessions/:id/preassessment  { submissions: [{ problemId, answer }] }
 *
 * A credited skill is proved at rung 2 with provenBy 'placement', which cascades
 * to clear its prerequisites — so one good pre-assessment can retire a large part
 * of a course before the first lesson.
 */
router.post('/:id/preassessment', isAuthenticated, async (req, res) => {
  try {
    const { submissions } = req.body || {};
    if (!Array.isArray(submissions) || !submissions.length) {
      return res.status(400).json({ error: 'Missing submissions' });
    }

    const session = await CourseSession.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ error: 'Course session not found' });
    const pathway = loadPathwayByCourseId(session.courseId);
    if (!pathway) return res.status(404).json({ error: 'Course pathway not found' });

    const ids = submissions.map(s => s.problemId).filter(Boolean);
    const problems = await Problem.find({ _id: { $in: ids } }).lean();
    const byId = new Map(problems.map(p => [String(p._id), p]));

    // Grade each item server-side, then roll up per skill.
    const results = [];
    submissions.forEach(sub => {
      const problem = byId.get(String(sub.problemId));
      if (!problem) return;                       // ignore unknown ids
      const graded = gradeOne(problem, sub.answer);
      results.push({ skillId: problem.skillId, correct: graded.correct });
    });
    const scored = scoreBySkill(results);

    const user = await User.findById(req.user._id);
    const cleared = [];
    let graph = null;
    try {
      const allSkills = await configCache.getOrSet(
        'skills:unified',
        () => Skill.find({ isActive: true, source: 'unified-taxonomy' }).lean(),
        3600
      );
      if (allSkills.length) graph = buildGraph(allSkills);
    } catch (err) {
      console.error('[CourseSession] pre-assessment graph load failed:', err.message);
    }

    scored.credited.forEach(skillId => {
      const entry = getSkillMasteryEntry(user, skillId) || {};
      advanceRung(entry, 'proved', { via: 'placement' });
      if (entry.__rungResult && entry.__rungResult.changed) {
        delete entry.__rungResult;
        entry.status = 'mastered';
        setSkillMasteryEntry(user, skillId, entry);
      } else {
        delete entry.__rungResult;
      }
    });

    // Cascade once, after all credits, so prerequisites beneath everything the
    // student demonstrated are cleared together.
    if (graph) {
      const decoded = decodedMasteryMap(user);
      scored.credited.forEach(skillId => {
        const result = applyProofCascade(graph, decoded, skillId);
        result.cleared.forEach(id => {
          if (cleared.indexOf(id) === -1) cleared.push(id);
          setSkillMasteryEntry(user, id, decoded.get(id));
        });
      });
    }
    await user.save();

    const start = recommendedStart(pathway, scored.credited);
    session.preAssessmentCompletedAt = new Date();
    session.preAssessment = {
      credited: scored.credited,
      notCredited: scored.notCredited,
      clearedFromAbove: cleared,
      startModuleId: start ? start.moduleId : null
    };
    if (start && start.moduleId) session.currentModuleId = start.moduleId;
    await session.save();

    res.json({
      credited: scored.credited,
      notCredited: scored.notCredited,
      clearedFromAbove: cleared,
      start,
      message: start
        ? `You already own ${scored.credited.length} of these. Starting you at ${start.title}.`
        : 'You cleared everything this check covered — you may not need this course.'
    });
  } catch (err) {
    console.error('[CourseSession] pre-assessment POST failed:', err);
    res.status(500).json({ error: 'Failed to score pre-assessment' });
  }
});

module.exports = router;
