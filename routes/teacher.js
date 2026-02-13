// routes/teacher.js
// MODIFIED: Updated to query the 'Conversation' collection for student conversation history.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { isTeacher, isAuthenticated } = require('../middleware/auth');
const { generateLiveSummary, detectStruggle, detectTopic, calculateProblemStats } = require('../utils/activitySummarizer');
const { cleanupStaleSessions } = require('../services/sessionService');

const ScreenerSession = require('../models/screenerSession');
const EnrollmentCode = require('../models/enrollmentCode');

// Fetches students assigned to the logged-in teacher
router.get('/students', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      'firstName lastName username gradeLevel mathCourse level xp lastLogin totalActiveTutoringMinutes weeklyActiveTutoringMinutes iepPlan currentStreak'
    ).lean();
    res.json(students);
  } catch (err) {
    console.error('Error fetching students for teacher dashboard:', err);
    res.status(500).json({ message: 'Server error fetching student data.' });
  }
});

// Fetches a specific student's IEP
router.get('/students/:studentId/iep', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;

    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      teacherId: teacherId
    }, 'firstName lastName username iepPlan').lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }

    res.json(student.iepPlan);
  } catch (err) {
    console.error('Error fetching student IEP:', err);
    res.status(500).json({ message: 'Server error fetching IEP data.' });
  }
});

// Updates a specific student's IEP
router.put('/students/:studentId/iep', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const updatedIepPlan = req.body;

    const result = await User.findOneAndUpdate(
      { _id: studentId, role: 'student', teacherId: teacherId },
      { $set: { iepPlan: updatedIepPlan } },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Student not found or not assigned to this teacher.' });
    }

    res.json({ message: 'IEP plan updated successfully!', iepPlan: result.iepPlan });
  } catch (err) {
    console.error('Error updating student IEP:', err);
    res.status(500).json({ message: 'Server error updating IEP data.' });
  }
});

// Get a specific assigned student's conversation history (Teacher only)
router.get('/students/:studentId/conversations', isTeacher, async (req, res) => {
  const { studentId } = req.params;
  const teacherId = req.user._id;

  try {
    // First, confirm the teacher is actually assigned this student
    const student = await User.findOne({ _id: studentId, teacherId: teacherId });
    if (!student) {
        return res.status(403).json({ message: "You are not authorized to view this student's history." });
    }

    // --- MODIFICATION START ---
    // Fetch all conversations for this student from the Conversation collection
    const conversations = await Conversation.find({ userId: studentId })
        .sort({ startDate: -1 }) // Sort by most recent first
        .select('summary activeMinutes startDate'); // Fixed: removed non-existent 'date' field, added startDate
    // --- MODIFICATION END ---

    res.json(conversations || []);
  } catch (err) {
    console.error('Error fetching student conversations for teacher:', err);
    res.status(500).json({ message: 'Server error fetching conversation data.' });
  }
});

// ============================================
// LIVE ACTIVITY FEED ENDPOINTS
// ============================================

// Get live activity feed - active sessions for assigned students
router.get('/live-feed', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;

    // Clean up stale sessions in background
    cleanupStaleSessions(30).catch(err => {
      console.error('Background cleanup failed:', err);
    });

    // Get all students assigned to this teacher
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      '_id firstName lastName username'
    ).lean();

    const studentIds = students.map(s => s._id);

    // Get active conversations for these students
    const activeConversations = await Conversation.find({
      userId: { $in: studentIds },
      isActive: true,
      lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Active within last 30 min
    }).sort({ lastActivity: -1 }).lean();

    // Enrich with student info and generate summaries if needed
    const activityFeed = await Promise.all(activeConversations.map(async (convo) => {
      const student = students.find(s => s._id.toString() === convo.userId.toString());
      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : 'Unknown';

      // Generate live summary if not recently updated (every 5 minutes)
      const needsUpdate = !convo.lastSummaryUpdate ||
        (Date.now() - new Date(convo.lastSummaryUpdate).getTime()) > 5 * 60 * 1000;

      let liveSummary = convo.liveSummary;

      if (needsUpdate && convo.messages.length > 0) {
        liveSummary = await generateLiveSummary(convo, studentName);

        // Update conversation with new summary
        await Conversation.findByIdAndUpdate(convo._id, {
          liveSummary,
          lastSummaryUpdate: new Date(),
          currentTopic: detectTopic(convo.messages),
          ...calculateProblemStats(convo.messages)
        });
      }

      // Detect struggles
      const struggleInfo = detectStruggle(convo.messages.slice(-10));

      return {
        conversationId: convo._id,
        studentId: student._id,
        studentName,
        startTime: convo.startDate,
        lastActivity: convo.lastActivity,
        duration: convo.activeMinutes,
        liveSummary: liveSummary || `${studentName} is in an active session`,
        currentTopic: convo.currentTopic,
        problemsAttempted: convo.problemsAttempted || 0,
        problemsCorrect: convo.problemsCorrect || 0,
        isStruggling: struggleInfo.isStruggling,
        strugglingWith: struggleInfo.strugglingWith,
        severity: struggleInfo.severity,
        alerts: convo.alerts || []
      };
    }));

    res.json(activityFeed);
  } catch (error) {
    console.error('Error fetching live feed:', error);
    res.status(500).json({ message: 'Error fetching live activity feed' });
  }
});

// Get all activity (including completed sessions) with filtering
router.get('/activity-feed', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { studentId, topic, alertType, startDate, endDate, activeOnly } = req.query;

    // Clean up stale sessions in background
    cleanupStaleSessions(30).catch(err => {
      console.error('Background cleanup failed:', err);
    });

    // Get all students assigned to this teacher
    const students = await User.find(
      { role: 'student', teacherId: teacherId },
      '_id firstName lastName username'
    ).lean();

    const studentIds = students.map(s => s._id);

    // Build query
    const query = { userId: { $in: studentIds } };

    if (studentId) query.userId = studentId;
    if (activeOnly === 'true') query.isActive = true;
    if (topic) query.currentTopic = new RegExp(topic, 'i');
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const conversations = await Conversation.find(query)
      .sort({ lastActivity: -1 })
      .limit(100)
      .lean();

    // Filter by alert type if specified
    let filteredConversations = conversations;
    if (alertType) {
      filteredConversations = conversations.filter(c =>
        c.alerts && c.alerts.some(a => a.type === alertType)
      );
    }

    // Enrich with student info
    const activityFeed = filteredConversations.map(convo => {
      const student = students.find(s => s._id.toString() === convo.userId.toString());
      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : 'Unknown';

      return {
        conversationId: convo._id,
        studentId: convo.userId,
        studentName,
        startTime: convo.startDate,
        lastActivity: convo.lastActivity,
        duration: convo.activeMinutes,
        isActive: convo.isActive,
        summary: convo.summary || convo.liveSummary,
        currentTopic: convo.currentTopic,
        problemsAttempted: convo.problemsAttempted || 0,
        problemsCorrect: convo.problemsCorrect || 0,
        strugglingWith: convo.strugglingWith,
        alerts: convo.alerts || []
      };
    });

    res.json(activityFeed);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ message: 'Error fetching activity feed' });
  }
});

// Acknowledge an alert
router.post('/alerts/:conversationId/:alertIndex/acknowledge', isTeacher, async (req, res) => {
  try {
    const { conversationId, alertIndex } = req.params;
    const teacherId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Verify teacher has access to this student
    const student = await User.findOne({ _id: conversation.userId, teacherId });
    if (!student) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Acknowledge the alert
    if (conversation.alerts && conversation.alerts[alertIndex]) {
      conversation.alerts[alertIndex].acknowledged = true;
      await conversation.save();
    }

    res.json({ message: 'Alert acknowledged' });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ message: 'Error acknowledging alert' });
  }
});

// ============================================
// ASSESSMENT MANAGEMENT
// ============================================

/**
 * Reset a student's placement assessment
 * POST /api/teacher/students/:studentId/reset-assessment
 *
 * Allows teacher to reset a student's screener so they can retake it
 * Use cases: After summer break, significant skill regression, incorrect placement
 */
router.post('/students/:studentId/reset-assessment', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const { reason } = req.body; // Optional reason for audit trail

    // Verify teacher has access to this student
    const student = await User.findOne({ _id: studentId, teacherId: teacherId });
    if (!student) {
      return res.status(403).json({ message: 'Not authorized. Student not assigned to you.' });
    }

    // Store previous assessment data for audit trail
    const previousAssessment = {
      completedDate: student.assessmentDate,
      placement: student.initialPlacement,
      resetDate: new Date(),
      resetBy: teacherId,
      reason: reason || 'Teacher requested reset'
    };

    // Add to assessment history if it doesn't exist
    if (!student.learningProfile.assessmentHistory) {
      student.learningProfile.assessmentHistory = [];
    }
    student.learningProfile.assessmentHistory.push(previousAssessment);

    // Reset assessment flags
    student.assessmentCompleted = false;
    student.assessmentDate = null;
    student.initialPlacement = null;

    // Clear skill mastery (optional - may want to keep some data)
    // student.skillMastery = new Map();

    await student.save();

    console.log(`[Teacher] Assessment reset for student ${studentId} by teacher ${teacherId}`);

    res.json({
      success: true,
      message: `Assessment reset successfully for ${student.firstName} ${student.lastName}`,
      studentName: `${student.firstName} ${student.lastName}`,
      previousAssessment
    });

  } catch (error) {
    console.error('Error resetting student assessment:', error);
    res.status(500).json({ message: 'Error resetting assessment' });
  }
});

/**
 * Get detailed skill mastery report for a student
 * GET /api/teacher/students/:studentId/skill-report
 *
 * Returns comprehensive breakdown of:
 * - Placement screener results (theta, percentile)
 * - Skill mastery by category
 * - Badge progress
 * - Recent activity
 */
router.get('/students/:studentId/skill-report', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;

    // Verify teacher has access to this student
    const student = await User.findOne({ _id: studentId, teacherId: teacherId }).lean();
    if (!student) {
      return res.status(403).json({ message: 'Not authorized. Student not assigned to you.' });
    }

    // Parse theta from initialPlacement if available
    let theta = null;
    let percentile = null;
    if (student.initialPlacement) {
      const match = student.initialPlacement.match(/Theta:\s*([-\d.]+)\s*\((\d+)th percentile\)/);
      if (match) {
        theta = parseFloat(match[1]);
        percentile = parseInt(match[2]);
      }
    }

    // Organize skill mastery by status
    const masteredSkills = [];
    const learningSkills = [];
    const readySkills = [];

    if (student.skillMastery) {
      for (const [skillId, data] of Object.entries(student.skillMastery)) {
        const skillData = {
          skillId,
          status: data.status,
          masteryScore: data.masteryScore,
          date: data.masteredDate || data.learningStarted,
          notes: data.notes
        };

        switch (data.status) {
          case 'mastered':
            masteredSkills.push(skillData);
            break;
          case 'learning':
            learningSkills.push(skillData);
            break;
          case 'ready':
            readySkills.push(skillData);
            break;
        }
      }
    }

    // Get badge progress
    const badgeProgress = {
      total: student.masteryProgress?.earnedBadges?.length || 0,
      activeBadge: student.masteryProgress?.activeBadge || null,
      earnedBadges: student.masteryProgress?.earnedBadges || []
    };

    // Get recent conversations for activity summary
    const recentConversations = await Conversation.find({ userId: studentId })
      .sort({ startDate: -1 })
      .limit(5)
      .select('startDate activeMinutes problemsAttempted problemsCorrect currentTopic')
      .lean();

    const activitySummary = {
      totalSessions: await Conversation.countDocuments({ userId: studentId }),
      recentSessions: recentConversations.map(c => ({
        date: c.startDate,
        duration: c.activeMinutes,
        problemsAttempted: c.problemsAttempted || 0,
        problemsCorrect: c.problemsCorrect || 0,
        accuracy: c.problemsAttempted > 0 ? Math.round((c.problemsCorrect / c.problemsAttempted) * 100) : 0,
        topic: c.currentTopic
      }))
    };

    res.json({
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        username: student.username,
        gradeLevel: student.gradeLevel
      },
      placement: {
        completed: student.learningProfile?.assessmentCompleted || false,
        date: student.learningProfile?.assessmentDate,
        theta,
        percentile,
        initialPlacement: student.learningProfile?.initialPlacement
      },
      skillMastery: {
        mastered: masteredSkills,
        learning: learningSkills,
        ready: readySkills,
        totalMastered: masteredSkills.length,
        totalLearning: learningSkills.length
      },
      badges: badgeProgress,
      activity: activitySummary
    });

  } catch (error) {
    console.error('Error fetching skill report:', error);
    res.status(500).json({ message: 'Error fetching skill report' });
  }
});

/**
 * Get student's growth check history
 * GET /api/teacher/students/:studentId/growth-history
 *
 * Returns all growth check results for a student
 * Useful for tracking progress over time
 */
router.get('/students/:studentId/growth-history', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;

    // Verify teacher has access to this student
    const student = await User.findOne({ _id: studentId, teacherId: teacherId }).lean();
    if (!student) {
      return res.status(403).json({ message: 'Not authorized. Student not assigned to you.' });
    }

    const growthHistory = student.learningProfile?.growthCheckHistory || [];
    const currentTheta = student.learningProfile?.currentTheta || 0;

    // Calculate growth trajectory
    let totalGrowth = 0;
    let checksCompleted = growthHistory.length;
    if (checksCompleted > 0) {
      const firstTheta = growthHistory[0].previousTheta || 0;
      const latestTheta = growthHistory[checksCompleted - 1].newTheta || currentTheta;
      totalGrowth = latestTheta - firstTheta;
    }

    res.json({
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        username: student.username
      },
      currentTheta,
      totalGrowth: Math.round(totalGrowth * 100) / 100,
      checksCompleted,
      history: growthHistory.map(check => ({
        date: check.date,
        previousTheta: check.previousTheta,
        newTheta: check.newTheta,
        thetaChange: check.thetaChange,
        growthStatus: check.growthStatus,
        accuracy: check.accuracy,
        questionsAnswered: check.questionsAnswered
      }))
    });

  } catch (error) {
    console.error('Error fetching growth history:', error);
    res.status(500).json({ message: 'Error fetching growth history' });
  }
});

// ============================================
// CLASS AI SETTINGS
// ============================================

/**
 * Get teacher's class AI settings
 * GET /api/teacher/class-ai-settings
 *
 * Returns the teacher's preferences for how the AI should tutor their students
 */
router.get('/class-ai-settings', isTeacher, async (req, res) => {
  try {
    const teacher = await User.findById(req.user._id).select('classAISettings').lean();

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Return settings with defaults if not set
    const defaultSettings = {
      calculatorAccess: 'skill-based',
      calculatorNote: '',
      scaffoldingLevel: 3,
      scaffoldingNote: '',
      vocabularyPreferences: {
        orderOfOperations: 'PEMDAS',
        customVocabulary: [],
        vocabularyNote: ''
      },
      solutionApproaches: {
        equationSolving: 'any',
        fractionOperations: 'any',
        wordProblems: 'any',
        customApproaches: ''
      },
      manipulatives: {
        allowed: true,
        preferred: [],
        note: ''
      },
      currentTeaching: {
        topic: '',
        approach: '',
        pacing: '',
        additionalContext: ''
      },
      responseStyle: {
        encouragementLevel: 'moderate',
        errorCorrectionStyle: 'socratic',
        showWorkRequirement: 'always'
      }
    };

    res.json({
      success: true,
      settings: teacher.classAISettings || defaultSettings
    });

  } catch (error) {
    console.error('Error fetching class AI settings:', error);
    res.status(500).json({ message: 'Error fetching class AI settings' });
  }
});

/**
 * Update teacher's class AI settings
 * PUT /api/teacher/class-ai-settings
 *
 * Saves the teacher's preferences for how the AI should tutor their students
 */
router.put('/class-ai-settings', isTeacher, async (req, res) => {
  try {
    const settings = req.body;

    // Add timestamp
    settings.lastUpdated = new Date();

    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { classAISettings: settings } },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    console.log(`[Teacher] Class AI settings updated by ${req.user._id}`);

    res.json({
      success: true,
      message: 'Class AI settings saved successfully',
      settings: result.classAISettings
    });

  } catch (error) {
    console.error('Error saving class AI settings:', error);
    res.status(500).json({ message: 'Error saving class AI settings' });
  }
});

/**
 * Get class AI settings for a student's teacher (used by AI during tutoring)
 * GET /api/teacher/class-ai-settings/for-student/:studentId
 *
 * Used internally when starting a tutoring session to fetch teacher preferences
 * SECURITY: Requires authentication to prevent enumeration of teacher-student relationships
 */
router.get('/class-ai-settings/for-student/:studentId', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's teacher
    const student = await User.findById(studentId).select('teacherId').lean();
    if (!student || !student.teacherId) {
      return res.json({ success: true, settings: null, message: 'Student has no assigned teacher' });
    }

    // Get teacher's settings
    const teacher = await User.findById(student.teacherId).select('classAISettings firstName lastName').lean();
    if (!teacher) {
      return res.json({ success: true, settings: null, message: 'Teacher not found' });
    }

    res.json({
      success: true,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      settings: teacher.classAISettings || null
    });

  } catch (error) {
    console.error('Error fetching class AI settings for student:', error);
    res.status(500).json({ message: 'Error fetching class AI settings' });
  }
});

// STUDENT ACCESS: Get calculator access setting for current student
router.get('/my-calculator-access', isAuthenticated, async (req, res) => {
  try {
    // Only allow students to use this endpoint
    if (req.user.role !== 'student') {
      return res.json({
        success: true,
        calculatorAccess: 'always', // Teachers/parents always have access
        message: 'Non-student users have full calculator access'
      });
    }

    // Check if student has a teacher
    if (!req.user.teacherId) {
      return res.json({
        success: true,
        calculatorAccess: 'always', // No teacher = no restrictions
        message: 'No assigned teacher'
      });
    }

    // Get teacher's calculator settings
    const teacher = await User.findById(req.user.teacherId)
      .select('classAISettings.calculatorAccess classAISettings.calculatorNote firstName lastName')
      .lean();

    if (!teacher || !teacher.classAISettings) {
      return res.json({
        success: true,
        calculatorAccess: 'skill-based', // Default
        message: 'Teacher has not configured settings'
      });
    }

    const calcAccess = teacher.classAISettings.calculatorAccess || 'skill-based';
    const calcNote = teacher.classAISettings.calculatorNote || '';

    console.log(`🧮 [Calculator] ${req.user.firstName} checked access: ${calcAccess} (Teacher: ${teacher.firstName})`);

    res.json({
      success: true,
      calculatorAccess: calcAccess,
      calculatorNote: calcNote,
      teacherName: `${teacher.firstName} ${teacher.lastName}`
    });

  } catch (error) {
    console.error('Error fetching calculator access:', error);
    res.status(500).json({
      success: false,
      calculatorAccess: 'skill-based', // Default on error
      message: 'Error fetching settings'
    });
  }
});

// =====================================================
// LEARNING CURVE: View student's skill progression over time
// =====================================================
router.get('/students/:studentId/learning-curve', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const student = await User.findOne({ _id: studentId, teacherId }).lean();
    if (!student) return res.status(403).json({ message: 'Not authorized.' });

    const skillsOverview = [];
    for (const [skillId, skillData] of Object.entries(student.skillMastery || {})) {
      const practiceHistory = skillData.practiceHistory || [];
      const practiceCount = practiceHistory.length;
      if (practiceCount === 0) continue;

      const firstTheta = practiceHistory[0]?.theta || 0;
      const currentTheta = skillData.theta || 0;

      skillsOverview.push({
        skillId,
        displayName: skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        currentTheta,
        growth: currentTheta - firstTheta,
        practiceCount,
        masteryScore: skillData.masteryScore || 0,
        pillars: skillData.pillars || null,
        status: skillData.status || 'learning',
        lastPracticed: skillData.lastPracticed,
        curveData: practiceHistory.map(e => ({
          timestamp: e.timestamp,
          theta: e.theta || 0,
          standardError: e.standardError || 1.0,
          correct: e.correct,
          problemDifficulty: e.difficulty || 0
        }))
      });
    }

    skillsOverview.sort((a, b) => {
      const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
      const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      student: { id: student._id, name: `${student.firstName} ${student.lastName}` },
      skills: skillsOverview,
      totalSkillsPracticed: skillsOverview.length
    });
  } catch (error) {
    console.error('Error fetching student learning curve:', error);
    res.status(500).json({ message: 'Error fetching learning curve data' });
  }
});

// =====================================================
// CELERATION: View student's fact fluency progress
// =====================================================
router.get('/students/:studentId/celeration', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const student = await User.findOne({ _id: studentId, teacherId }).lean();
    if (!student) return res.status(403).json({ message: 'Not authorized.' });

    const grade = parseInt(student.gradeLevel);
    const aim = grade >= 9 ? 60 : grade >= 6 ? 50 : 40;
    const familiesData = [];

    for (const [familyKey, familyData] of Object.entries(student.factFluencyProgress?.factFamilies || {})) {
      if (!familyData.sessions || familyData.sessions.length === 0) continue;

      const sessions = familyData.sessions.map(s => ({
        date: s.date, rate: s.rate, accuracy: s.accuracy,
        problemsAttempted: s.problemsAttempted, problemsCorrect: s.problemsCorrect
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      const recentSessions = sessions.slice(-3);
      const recentRates = recentSessions.map(s => s.rate).sort((a, b) => a - b);
      const currentRate = recentRates[Math.floor(recentRates.length / 2)];

      familiesData.push({
        familyKey,
        operation: familyData.operation,
        familyName: familyData.familyName,
        displayName: familyData.displayName,
        currentRate,
        bestRate: familyData.bestRate || 0,
        atAim: currentRate >= aim,
        mastered: familyData.mastered || false,
        sessionCount: sessions.length,
        lastPracticed: familyData.lastPracticed,
        sessions
      });
    }

    familiesData.sort((a, b) => {
      const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
      const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      student: { id: student._id, name: `${student.firstName} ${student.lastName}` },
      aim,
      families: familiesData
    });
  } catch (error) {
    console.error('Error fetching student celeration:', error);
    res.status(500).json({ message: 'Error fetching celeration data' });
  }
});

// =====================================================
// PLACEMENT RESULTS: View student's screener/placement details
// =====================================================
router.get('/students/:studentId/placement-results', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;
    const student = await User.findOne({ _id: studentId, teacherId }).lean();
    if (!student) return res.status(403).json({ message: 'Not authorized.' });

    // Parse theta from initialPlacement
    let theta = null, percentile = null;
    if (student.initialPlacement) {
      const match = student.initialPlacement.match(/Theta:\s*([-\d.]+)\s*\((\d+)th percentile\)/);
      if (match) { theta = parseFloat(match[1]); percentile = parseInt(match[2]); }
    }

    // Get screener sessions for this student
    const screenerSessions = await ScreenerSession.find({ userId: studentId })
      .sort({ startTime: -1 })
      .limit(5)
      .lean();

    const sessions = screenerSessions.map(s => ({
      id: s._id,
      type: s.mode || 'starting-point',
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.endTime && s.startTime ? s.endTime - s.startTime : null,
      questionsAnswered: s.questionCount || 0,
      finalTheta: s.theta,
      standardError: s.standardError,
      completed: !!s.endTime
    }));

    // Growth check history
    const growthHistory = student.learningProfile?.growthCheckHistory || [];

    res.json({
      success: true,
      student: { id: student._id, name: `${student.firstName} ${student.lastName}`, gradeLevel: student.gradeLevel, mathCourse: student.mathCourse },
      initialPlacement: {
        completed: student.learningProfile?.assessmentCompleted || false,
        date: student.learningProfile?.assessmentDate,
        theta,
        percentile,
        raw: student.initialPlacement
      },
      screenerSessions: sessions,
      growthHistory: growthHistory.map(g => ({
        date: g.date,
        theta: g.theta,
        previousTheta: g.previousTheta,
        growth: g.thetaChange,
        status: g.growthStatus,
        questionsAnswered: g.questionsAnswered
      }))
    });
  } catch (error) {
    console.error('Error fetching placement results:', error);
    res.status(500).json({ message: 'Error fetching placement results' });
  }
});

// ==============================
// CLASS MANAGEMENT
// ==============================

// GET /api/teacher/classes — list all classes (enrollment codes) owned by this teacher
router.get('/classes', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;

    const codes = await EnrollmentCode.find({ teacherId })
      .select('code className description gradeLevel mathCourse isActive expiresAt maxUses useCount enrolledStudents createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // For each class, compute enrolled count and active student count
    const studentIds = codes.flatMap(c => c.enrolledStudents.map(e => e.studentId));
    const students = studentIds.length > 0
      ? await User.find({ _id: { $in: studentIds } })
          .select('_id lastLogin')
          .lean()
      : [];

    const loginMap = {};
    for (const s of students) {
      loginMap[s._id.toString()] = s.lastLogin;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const classes = codes.map(c => ({
      _id: c._id,
      code: c.code,
      className: c.className,
      description: c.description,
      gradeLevel: c.gradeLevel,
      mathCourse: c.mathCourse,
      isActive: c.isActive,
      expiresAt: c.expiresAt,
      maxUses: c.maxUses,
      createdAt: c.createdAt,
      studentCount: c.enrolledStudents.length,
      activeCount: c.enrolledStudents.filter(e => {
        const ll = loginMap[e.studentId?.toString()];
        return ll && new Date(ll) > sevenDaysAgo;
      }).length
    }));

    res.json({ success: true, classes });
  } catch (err) {
    console.error('Error fetching teacher classes:', err);
    res.status(500).json({ message: 'Server error fetching classes.' });
  }
});

// GET /api/teacher/classes/:codeId/students — list students in a specific class
router.get('/classes/:codeId/students', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { codeId } = req.params;

    const code = await EnrollmentCode.findOne({ _id: codeId, teacherId }).lean();
    if (!code) {
      return res.status(404).json({ message: 'Class not found or not owned by you.' });
    }

    const studentIds = code.enrolledStudents.map(e => e.studentId);
    const students = await User.find({ _id: { $in: studentIds } })
      .select('firstName lastName username gradeLevel mathCourse level xp lastLogin totalActiveTutoringMinutes weeklyActiveTutoringMinutes currentStreak')
      .lean();

    // Merge enrollment info
    const enrollMap = {};
    for (const e of code.enrolledStudents) {
      enrollMap[e.studentId?.toString()] = {
        enrolledAt: e.enrolledAt,
        enrollmentMethod: e.enrollmentMethod
      };
    }

    const enriched = students.map(s => ({
      ...s,
      enrolledAt: enrollMap[s._id.toString()]?.enrolledAt,
      enrollmentMethod: enrollMap[s._id.toString()]?.enrollmentMethod
    }));

    res.json({
      success: true,
      class: {
        _id: code._id,
        code: code.code,
        className: code.className,
        gradeLevel: code.gradeLevel,
        mathCourse: code.mathCourse
      },
      students: enriched
    });
  } catch (err) {
    console.error('Error fetching class students:', err);
    res.status(500).json({ message: 'Server error fetching class students.' });
  }
});

module.exports = router;