// routes/quarterlyGrowth.js
// API endpoints for quarterly growth tracking and retention analytics

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Skill = require('../models/skill');
const { calculateRetentionMetrics } = require('../utils/retentionProbe');

// Middleware to check if user is teacher or admin
const isTeacherOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'teacher' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Teacher or admin role required.' });
};

/**
 * Generate quarterly checkpoint for a student
 * POST /api/quarterly-growth/checkpoint/:studentId
 * Body: { quarter, schoolYear, notes }
 */
router.post('/checkpoint/:studentId', isTeacherOrAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { quarter, schoolYear, notes } = req.body;

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Determine school year and quarter if not provided
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // 1-12

    const finalSchoolYear = schoolYear || `${currentYear}-${currentYear + 1}`;
    const finalQuarter = quarter || Math.ceil(currentMonth / 3); // 1-4 based on month

    // Get previous checkpoint for retention calculation
    const previousCheckpoint = student.learningProfile.quarterlyCheckpoints?.length > 0
      ? student.learningProfile.quarterlyCheckpoints[student.learningProfile.quarterlyCheckpoints.length - 1]
      : null;

    // Get all mastered skills
    const masteredSkills = [];
    const masteredSkillIds = [];

    for (const [skillId, data] of student.skillMastery) {
      if (data.status === 'mastered') {
        masteredSkillIds.push(skillId);
      }
    }

    // Load skill documents to get course/category info
    const skillDocs = await Skill.find({ skillId: { $in: masteredSkillIds } });
    const skillMap = new Map(skillDocs.map(s => [s.skillId, s]));

    for (const [skillId, data] of student.skillMastery) {
      if (data.status === 'mastered') {
        const skillDoc = skillMap.get(skillId);
        masteredSkills.push({
          skillId,
          masteredDate: data.masteredDate,
          course: skillDoc?.course || 'Unknown',
          category: skillDoc?.category || 'unknown'
        });
      }
    }

    // Calculate retention metrics
    const retentionMetrics = calculateRetentionMetrics(student.skillMastery, previousCheckpoint);

    // Identify new skills (mastered since last checkpoint)
    const newSkillsList = [];
    if (previousCheckpoint) {
      const previousSkillIds = new Set(previousCheckpoint.skillsMastered?.map(s => s.skillId) || []);
      for (const skill of masteredSkills) {
        if (!previousSkillIds.has(skill.skillId)) {
          newSkillsList.push(skill.skillId);
        }
      }
    } else {
      // First checkpoint - all skills are "new"
      newSkillsList.push(...masteredSkillIds);
    }

    // Calculate velocity (skills per week)
    let skillsPerWeek = 0;
    if (previousCheckpoint) {
      const daysSinceLastCheckpoint = (currentDate - previousCheckpoint.checkpointDate) / (1000 * 60 * 60 * 24);
      const weeksSinceLastCheckpoint = daysSinceLastCheckpoint / 7;
      skillsPerWeek = weeksSinceLastCheckpoint > 0
        ? Math.round((newSkillsList.length / weeksSinceLastCheckpoint) * 10) / 10
        : 0;
    }

    // Identify courses in progress and completed
    const courseSkills = new Map(); // course -> { mastered: count, total: count }
    const allSkillsByCourse = await Skill.aggregate([
      { $match: { course: { $exists: true }, isActive: true } },
      { $group: { _id: '$course', total: { $sum: 1 } } }
    ]);

    // Initialize course tracking
    for (const courseData of allSkillsByCourse) {
      courseSkills.set(courseData._id, { mastered: 0, total: courseData.total });
    }

    // Count mastered skills per course
    for (const skill of masteredSkills) {
      if (skill.course && courseSkills.has(skill.course)) {
        const data = courseSkills.get(skill.course);
        data.mastered++;
      }
    }

    const coursesInProgress = [];
    const coursesCompleted = [];

    for (const [course, data] of courseSkills) {
      if (data.mastered > 0 && data.mastered < data.total) {
        coursesInProgress.push(course);
      } else if (data.mastered === data.total && data.total > 0) {
        coursesCompleted.push(course);
      }
    }

    // TODO: Calculate theta change (requires IRT implementation)
    const thetaChange = null;

    // Calculate activity metrics
    // TODO: Aggregate from session history
    const activity = {
      totalMinutes: 0,
      problemsAttempted: 0,
      problemsCorrect: 0,
      accuracy: 0
    };

    // Create checkpoint
    const checkpoint = {
      checkpointDate: currentDate,
      schoolYear: finalSchoolYear,
      quarter: finalQuarter,
      academicQuarter: `${finalSchoolYear}-Q${finalQuarter}`,
      skillsMastered: masteredSkills,
      metrics: {
        newSkillsCount: newSkillsList.length,
        newSkillsList,
        retainedSkillsCount: retentionMetrics.retainedCount,
        retainedPercentage: retentionMetrics.retentionRate,
        lostSkillsCount: retentionMetrics.lostCount,
        lostSkillsList: retentionMetrics.lostSkills,
        skillsPerWeek,
        thetaChange,
        coursesInProgress,
        coursesCompleted
      },
      activity,
      notes: notes || '',
      generatedBy: 'teacher'
    };

    // Add checkpoint to student profile
    if (!student.learningProfile.quarterlyCheckpoints) {
      student.learningProfile.quarterlyCheckpoints = [];
    }
    student.learningProfile.quarterlyCheckpoints.push(checkpoint);

    await student.save();

    res.json({
      success: true,
      message: 'Quarterly checkpoint created successfully',
      checkpoint: {
        ...checkpoint,
        studentName: `${student.firstName} ${student.lastName}`
      }
    });

  } catch (error) {
    console.error('Error creating quarterly checkpoint:', error);
    res.status(500).json({ message: 'Error creating checkpoint', error: error.message });
  }
});

/**
 * Get quarterly growth report for a student
 * GET /api/quarterly-growth/report/:studentId
 */
router.get('/report/:studentId', isTeacherOrAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    const checkpoints = student.learningProfile.quarterlyCheckpoints || [];

    // Calculate overall statistics
    const totalSkillsMastered = Array.from(student.skillMastery.values())
      .filter(s => s.status === 'mastered').length;

    // Calculate average retention rate
    const avgRetention = checkpoints.length > 1
      ? checkpoints.slice(1).reduce((sum, cp) => sum + (cp.metrics.retainedPercentage || 0), 0) / (checkpoints.length - 1)
      : 100;

    // Calculate average velocity
    const avgVelocity = checkpoints.length > 0
      ? checkpoints.reduce((sum, cp) => sum + (cp.metrics.skillsPerWeek || 0), 0) / checkpoints.length
      : 0;

    // Get current courses
    const currentCoursesSet = new Set();
    if (checkpoints.length > 0) {
      const latest = checkpoints[checkpoints.length - 1];
      latest.metrics.coursesInProgress?.forEach(c => currentCoursesSet.add(c));
      latest.metrics.coursesCompleted?.forEach(c => currentCoursesSet.add(c));
    }

    res.json({
      success: true,
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        gradeLevel: student.gradeLevel,
        mathCourse: student.mathCourse
      },
      summary: {
        totalSkillsMastered,
        averageRetentionRate: Math.round(avgRetention),
        averageVelocity: Math.round(avgVelocity * 10) / 10,
        currentCourses: Array.from(currentCoursesSet),
        checkpointsRecorded: checkpoints.length
      },
      checkpoints: checkpoints.map(cp => ({
        date: cp.checkpointDate,
        quarter: cp.academicQuarter,
        skillsMastered: cp.skillsMastered.length,
        newSkills: cp.metrics.newSkillsCount,
        retentionRate: cp.metrics.retainedPercentage,
        lostSkills: cp.metrics.lostSkillsCount,
        velocity: cp.metrics.skillsPerWeek,
        coursesInProgress: cp.metrics.coursesInProgress,
        notes: cp.notes
      }))
    });

  } catch (error) {
    console.error('Error fetching quarterly report:', error);
    res.status(500).json({ message: 'Error fetching report', error: error.message });
  }
});

/**
 * Get class-level quarterly analytics
 * GET /api/quarterly-growth/class-analytics
 * Query params: teacherId (optional for admins)
 */
router.get('/class-analytics', isTeacherOrAdmin, async (req, res) => {
  try {
    const teacherId = req.query.teacherId || req.user._id;

    // Get all students for this teacher
    const students = await User.find({
      role: 'student',
      teacherId: teacherId
    });

    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No students found',
        analytics: {
          totalStudents: 0,
          studentsWithCheckpoints: 0,
          classAverages: {}
        }
      });
    }

    let totalRetention = 0;
    let totalVelocity = 0;
    let studentsWithCheckpoints = 0;
    let totalNewSkills = 0;
    let totalLostSkills = 0;

    const studentReports = students.map(student => {
      const checkpoints = student.learningProfile.quarterlyCheckpoints || [];
      const latestCheckpoint = checkpoints.length > 0
        ? checkpoints[checkpoints.length - 1]
        : null;

      if (latestCheckpoint) {
        studentsWithCheckpoints++;
        totalRetention += latestCheckpoint.metrics.retainedPercentage || 0;
        totalVelocity += latestCheckpoint.metrics.skillsPerWeek || 0;
        totalNewSkills += latestCheckpoint.metrics.newSkillsCount || 0;
        totalLostSkills += latestCheckpoint.metrics.lostSkillsCount || 0;
      }

      return {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        checkpointsCount: checkpoints.length,
        latestCheckpoint: latestCheckpoint ? {
          date: latestCheckpoint.checkpointDate,
          quarter: latestCheckpoint.academicQuarter,
          skillsMastered: latestCheckpoint.skillsMastered.length,
          newSkills: latestCheckpoint.metrics.newSkillsCount,
          retentionRate: latestCheckpoint.metrics.retainedPercentage,
          velocity: latestCheckpoint.metrics.skillsPerWeek
        } : null
      };
    });

    const classAverages = studentsWithCheckpoints > 0 ? {
      retentionRate: Math.round(totalRetention / studentsWithCheckpoints),
      velocity: Math.round((totalVelocity / studentsWithCheckpoints) * 10) / 10,
      newSkillsPerStudent: Math.round(totalNewSkills / studentsWithCheckpoints),
      lostSkillsPerStudent: Math.round((totalLostSkills / studentsWithCheckpoints) * 10) / 10
    } : null;

    res.json({
      success: true,
      analytics: {
        totalStudents: students.length,
        studentsWithCheckpoints,
        classAverages,
        students: studentReports
      }
    });

  } catch (error) {
    console.error('Error fetching class analytics:', error);
    res.status(500).json({ message: 'Error fetching analytics', error: error.message });
  }
});

/**
 * Get retention metrics for a student
 * GET /api/quarterly-growth/retention/:studentId
 */
router.get('/retention/:studentId', isTeacherOrAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    const checkpoints = student.learningProfile.quarterlyCheckpoints || [];
    const currentCheckpoint = checkpoints.length > 0
      ? checkpoints[checkpoints.length - 1]
      : null;

    if (!currentCheckpoint) {
      return res.json({
        success: true,
        message: 'No checkpoints found',
        retention: null
      });
    }

    // Get lost skills details
    const lostSkillIds = currentCheckpoint.metrics.lostSkillsList || [];
    const lostSkills = await Skill.find({ skillId: { $in: lostSkillIds } });

    res.json({
      success: true,
      retention: {
        retentionRate: currentCheckpoint.metrics.retainedPercentage,
        retainedCount: currentCheckpoint.metrics.retainedSkillsCount,
        lostCount: currentCheckpoint.metrics.lostSkillsCount,
        lostSkills: lostSkills.map(s => ({
          skillId: s.skillId,
          displayName: s.displayName,
          course: s.course,
          category: s.category
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching retention metrics:', error);
    res.status(500).json({ message: 'Error fetching retention', error: error.message });
  }
});

module.exports = router;
