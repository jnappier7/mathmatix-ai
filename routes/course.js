// routes/course.js
// Course browsing, session-based enrollment, and progression API

const express = require('express');
const router = express.Router();
const Course = require('../models/course');
const User = require('../models/user');

/* ============================================================
   GET /api/courses
   List all published courses (for course catalog/browsing)
   Query params:
     ?audience=parent   — filter to parent mini-courses only
     ?audience=student   — filter to student courses only
     ?courseType=mini-course — filter by course type
   ============================================================ */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.audience && ['student', 'parent'].includes(req.query.audience)) {
      filter.audience = req.query.audience;
    }
    if (req.query.courseType && ['full-course', 'mini-course'].includes(req.query.courseType)) {
      filter.courseType = req.query.courseType;
    }
    const courses = await Course.getPublishedCourses(filter);
    res.json({ success: true, courses });
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
});

/* ============================================================
   GET /api/courses/:courseId
   Get full course details (outline only unless enrolled)
   ============================================================ */
router.get('/:courseId', async (req, res) => {
  try {
    const course = await Course.getFullCourse(req.params.courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check if student is enrolled
    const enrollment = req.user.courseEnrollments?.find(
      e => e.courseId === req.params.courseId
    );

    if (enrollment) {
      // Enrolled: return full course with progress
      res.json({
        success: true,
        course: course.getOutline(),
        enrollment,
        fullAccess: true
      });
    } else {
      // Not enrolled: return outline only
      res.json({
        success: true,
        course: course.getOutline(),
        enrollment: null,
        fullAccess: false
      });
    }
  } catch (err) {
    console.error('Error fetching course:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch course' });
  }
});

/* ============================================================
   POST /api/courses/:courseId/enroll
   Session-based course enrollment (self-registration)
   ============================================================ */
router.post('/:courseId/enroll', async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    // Get the course
    const course = await Course.getFullCourse(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check enrollment is open
    if (!course.enrollment.isOpen) {
      return res.status(403).json({ success: false, message: 'Enrollment is currently closed for this course' });
    }

    if (!course.enrollment.selfEnrollEnabled) {
      return res.status(403).json({ success: false, message: 'Self-enrollment is not enabled. Contact your teacher.' });
    }

    // Check if already enrolled
    const user = await User.findById(userId);
    const existing = user.courseEnrollments?.find(e => e.courseId === courseId);
    if (existing && existing.status === 'active') {
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }

    // Build module/lesson progress structure from course definition
    const modules = course.units.map(unit => ({
      moduleId: unit.unitId,
      status: unit.order === 1 ? 'available' : 'locked',
      lessons: unit.lessons.map(lesson => ({
        lessonId: lesson.lessonId,
        status: (unit.order === 1 && lesson.order === 1) ? 'available' : 'locked'
      }))
    }));

    // Create enrollment record
    const enrollment = {
      courseId: course.courseId,
      courseName: course.title,
      enrolledAt: new Date(),
      status: 'active',
      currentModuleId: course.units[0].unitId,
      currentLessonId: course.units[0].lessons[0].lessonId,
      modules,
      overallProgress: 0,
      settings: {
        autoAdvance: course.settings.autoAdvance,
        practiceRequirement: course.settings.practiceRequirement,
        masteryThreshold: course.settings.masteryThreshold
      }
    };

    // If re-enrolling (previously dropped), update; otherwise push new
    if (existing) {
      existing.status = 'active';
      existing.enrolledAt = new Date();
      existing.currentModuleId = enrollment.currentModuleId;
      existing.currentLessonId = enrollment.currentLessonId;
      existing.modules = enrollment.modules;
      existing.overallProgress = 0;
    } else {
      user.courseEnrollments = user.courseEnrollments || [];
      user.courseEnrollments.push(enrollment);
    }

    await user.save();

    // Update course stats
    await Course.updateOne(
      { courseId },
      { $inc: { 'stats.totalEnrolled': 1 } }
    );

    res.json({
      success: true,
      message: `Successfully enrolled in ${course.title}`,
      enrollment: user.courseEnrollments.find(e => e.courseId === courseId)
    });
  } catch (err) {
    console.error('Error enrolling in course:', err);
    res.status(500).json({ success: false, message: 'Failed to enroll' });
  }
});

/* ============================================================
   GET /api/courses/:courseId/lesson/:lessonId
   Get full lesson content for a specific lesson (must be enrolled)
   ============================================================ */
router.get('/:courseId/lesson/:lessonId', async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    // Verify enrollment
    const enrollment = req.user.courseEnrollments?.find(
      e => e.courseId === courseId && e.status === 'active'
    );
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Not enrolled in this course' });
    }

    // Get lesson from course
    const course = await Course.getFullCourse(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const result = course.getLesson(lessonId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    // Check if lesson is accessible (not locked)
    const moduleProgress = enrollment.modules.find(m => m.moduleId === result.unit.unitId);
    const lessonProgress = moduleProgress?.lessons.find(l => l.lessonId === lessonId);

    if (lessonProgress?.status === 'locked') {
      return res.status(403).json({
        success: false,
        message: 'This lesson is locked. Complete previous lessons first.'
      });
    }

    // Mark as in_progress if currently available
    if (lessonProgress?.status === 'available') {
      lessonProgress.status = 'in_progress';
      lessonProgress.startedAt = new Date();
      if (moduleProgress.status === 'available') {
        moduleProgress.status = 'in_progress';
        moduleProgress.startedAt = new Date();
      }
      const user = await User.findById(req.user._id);
      const userEnrollment = user.courseEnrollments.find(e => e.courseId === courseId);
      const userModule = userEnrollment.modules.find(m => m.moduleId === result.unit.unitId);
      const userLesson = userModule.lessons.find(l => l.lessonId === lessonId);
      userLesson.status = 'in_progress';
      userLesson.startedAt = new Date();
      if (userModule.status === 'available') {
        userModule.status = 'in_progress';
        userModule.startedAt = new Date();
      }
      await user.save();
    }

    res.json({
      success: true,
      unit: {
        unitId: result.unit.unitId,
        title: result.unit.title,
        order: result.unit.order
      },
      lesson: result.lesson,
      progress: lessonProgress
    });
  } catch (err) {
    console.error('Error fetching lesson:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch lesson' });
  }
});

/* ============================================================
   POST /api/courses/:courseId/lesson/:lessonId/complete
   Mark a lesson phase or the full lesson as complete
   ============================================================ */
router.post('/:courseId/lesson/:lessonId/complete', async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { masteryScore, practiceResults } = req.body;

    const user = await User.findById(req.user._id);
    const enrollment = user.courseEnrollments?.find(
      e => e.courseId === courseId && e.status === 'active'
    );
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Not enrolled' });
    }

    // Find the lesson progress
    let lessonModule = null;
    let lessonProgress = null;
    for (const mod of enrollment.modules) {
      const lp = mod.lessons.find(l => l.lessonId === lessonId);
      if (lp) {
        lessonProgress = lp;
        lessonModule = mod;
        break;
      }
    }

    if (!lessonProgress) {
      return res.status(404).json({ success: false, message: 'Lesson not found in enrollment' });
    }

    // Update lesson progress
    if (practiceResults) {
      lessonProgress.practiceProblems = {
        attempted: (lessonProgress.practiceProblems?.attempted || 0) + (practiceResults.attempted || 0),
        correct: (lessonProgress.practiceProblems?.correct || 0) + (practiceResults.correct || 0),
        lastAttemptAt: new Date()
      };
    }

    if (masteryScore !== undefined) {
      lessonProgress.masteryQuizScore = masteryScore;
      lessonProgress.masteryQuizPassed = masteryScore >= (enrollment.settings?.masteryThreshold || 80);
    }

    // Check if lesson should be marked complete
    const shouldComplete = lessonProgress.masteryQuizPassed ||
      (masteryScore === undefined && practiceResults?.attempted >= (enrollment.settings?.practiceRequirement || 3));

    if (shouldComplete && lessonProgress.status !== 'completed') {
      lessonProgress.status = 'completed';
      lessonProgress.completedAt = new Date();

      // Unlock next lesson
      const course = await Course.getFullCourse(courseId);
      if (course) {
        const nextResult = course.getNextLesson(lessonId);
        if (nextResult) {
          // Find and unlock the next lesson
          const nextModule = enrollment.modules.find(m => m.moduleId === nextResult.unit.unitId);
          if (nextModule) {
            // If next lesson is in a different (new) unit, unlock the unit
            if (nextModule.status === 'locked') {
              nextModule.status = 'available';
            }
            const nextLessonProgress = nextModule.lessons.find(l => l.lessonId === nextResult.lesson.lessonId);
            if (nextLessonProgress && nextLessonProgress.status === 'locked') {
              nextLessonProgress.status = 'available';
            }
          }
        }

        // Check if all lessons in current module are complete
        const allLessonsComplete = lessonModule.lessons.every(l => l.status === 'completed');
        if (allLessonsComplete) {
          lessonModule.status = 'completed';
          lessonModule.completedAt = new Date();
        }

        // Update overall progress
        const totalLessons = course.getTotalLessons();
        const completedLessons = enrollment.modules.reduce(
          (sum, mod) => sum + mod.lessons.filter(l => l.status === 'completed').length, 0
        );
        enrollment.overallProgress = Math.round((completedLessons / totalLessons) * 100);

        // Update current position
        if (nextResult) {
          enrollment.currentModuleId = nextResult.unit.unitId;
          enrollment.currentLessonId = nextResult.lesson.lessonId;
        }

        // Check if entire course is complete
        if (enrollment.overallProgress === 100) {
          enrollment.status = 'completed';
          enrollment.completedAt = new Date();
          await Course.updateOne({ courseId }, { $inc: { 'stats.totalCompleted': 1 } });
        }
      }
    }

    await user.save();

    res.json({
      success: true,
      lessonCompleted: lessonProgress.status === 'completed',
      masteryPassed: lessonProgress.masteryQuizPassed,
      overallProgress: enrollment.overallProgress,
      nextLesson: enrollment.currentLessonId,
      courseCompleted: enrollment.status === 'completed'
    });
  } catch (err) {
    console.error('Error completing lesson:', err);
    res.status(500).json({ success: false, message: 'Failed to update progress' });
  }
});

/* ============================================================
   GET /api/courses/:courseId/progress
   Get student's progress in a course
   ============================================================ */
router.get('/:courseId/progress', async (req, res) => {
  try {
    const enrollment = req.user.courseEnrollments?.find(
      e => e.courseId === req.params.courseId
    );
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Not enrolled in this course' });
    }

    res.json({
      success: true,
      progress: {
        courseId: enrollment.courseId,
        courseName: enrollment.courseName,
        status: enrollment.status,
        overallProgress: enrollment.overallProgress,
        currentModuleId: enrollment.currentModuleId,
        currentLessonId: enrollment.currentLessonId,
        enrolledAt: enrollment.enrolledAt,
        modules: enrollment.modules
      }
    });
  } catch (err) {
    console.error('Error fetching progress:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch progress' });
  }
});

/* ============================================================
   POST /api/courses/:courseId/drop
   Drop (unenroll from) a course
   ============================================================ */
router.post('/:courseId/drop', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const enrollment = user.courseEnrollments?.find(
      e => e.courseId === req.params.courseId && e.status === 'active'
    );
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Not actively enrolled' });
    }

    enrollment.status = 'dropped';
    await user.save();

    res.json({ success: true, message: 'Successfully dropped the course' });
  } catch (err) {
    console.error('Error dropping course:', err);
    res.status(500).json({ success: false, message: 'Failed to drop course' });
  }
});

module.exports = router;
