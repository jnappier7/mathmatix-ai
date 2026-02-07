// routes/celeration.js - Standard Celeration Chart (Precision Teaching) for Fact Fluency

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');

// Morningside fluency aims by grade level
const FLUENCY_AIMS = {
  elementary: 40,  // K-5: 40 digits/min
  middle: 50,      // 6-8: 50 digits/min
  high: 60         // 9+: 60 digits/min
};

// Get fluency aim for user based on grade level
function getFluencyAim(user) {
  if (!user.gradeLevel) return FLUENCY_AIMS.elementary;

  const grade = parseInt(user.gradeLevel);
  if (grade >= 9) return FLUENCY_AIMS.high;
  if (grade >= 6) return FLUENCY_AIMS.middle;
  return FLUENCY_AIMS.elementary;
}

// Calculate celeration (weekly multiplication factor)
function calculateCeleration(sessions) {
  if (sessions.length < 2) return null;

  // Group sessions by week
  const weeks = new Map();

  sessions.forEach(session => {
    const date = new Date(session.date);
    // Get week number (ISO 8601)
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekKey = weekStart.toISOString();

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, []);
    }
    weeks.get(weekKey).push(session);
  });

  // Calculate median rate per week
  const weeklyMedians = [];
  for (const [weekKey, weekSessions] of weeks) {
    const rates = weekSessions.map(s => s.rate).sort((a, b) => a - b);
    const median = rates[Math.floor(rates.length / 2)];
    weeklyMedians.push({
      week: weekKey,
      median
    });
  }

  if (weeklyMedians.length < 2) return null;

  // Sort by week
  weeklyMedians.sort((a, b) => new Date(a.week) - new Date(b.week));

  // Calculate celeration (geometric mean of week-over-week ratios)
  const ratios = [];
  for (let i = 1; i < weeklyMedians.length; i++) {
    const ratio = weeklyMedians[i].median / weeklyMedians[i - 1].median;
    if (ratio > 0 && isFinite(ratio)) {
      ratios.push(ratio);
    }
  }

  if (ratios.length === 0) return null;

  // Geometric mean of ratios = celeration
  const product = ratios.reduce((acc, r) => acc * r, 1);
  const celeration = Math.pow(product, 1 / ratios.length);

  return celeration;
}

// Project when student will hit aim based on current celeration
function projectAimDate(currentRate, aim, celeration, lastSessionDate) {
  if (!celeration || celeration <= 1 || currentRate >= aim) {
    return null; // Already at aim or not improving
  }

  // How many weeks until aim? (assuming celeration stays constant)
  // aim = currentRate * (celeration ^ weeks)
  // weeks = log(aim / currentRate) / log(celeration)
  const weeksToAim = Math.log(aim / currentRate) / Math.log(celeration);

  if (!isFinite(weeksToAim) || weeksToAim < 0) return null;

  // Add weeks to last session date
  const projectedDate = new Date(lastSessionDate);
  projectedDate.setDate(projectedDate.getDate() + weeksToAim * 7);

  return projectedDate;
}

// GET /api/celeration/:operation/:familyName - Get celeration data for specific fact family
router.get('/celeration/:operation/:familyName', isAuthenticated, async (req, res) => {
  try {
    const { operation, familyName } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const familyKey = `${operation}-${familyName}`;
    const familyData = user.factFluencyProgress?.factFamilies?.get(familyKey);

    if (!familyData || !familyData.sessions || familyData.sessions.length === 0) {
      return res.json({
        success: true,
        hasData: false,
        message: 'No practice data yet for this fact family'
      });
    }

    // Get fluency aim
    const aim = getFluencyAim(user);

    // Extract session data for celeration chart
    const sessions = familyData.sessions.map(s => ({
      date: s.date,
      rate: s.rate,
      accuracy: s.accuracy,
      problemsAttempted: s.problemsAttempted,
      problemsCorrect: s.problemsCorrect
    }));

    // Sort by date
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate celeration
    const celeration = calculateCeleration(sessions);

    // Get current rate (median of last 3 sessions)
    const recentSessions = sessions.slice(-3);
    const recentRates = recentSessions.map(s => s.rate).sort((a, b) => a - b);
    const currentRate = recentRates[Math.floor(recentRates.length / 2)];

    // Project aim date
    const lastSessionDate = sessions[sessions.length - 1].date;
    const projectedAimDate = celeration ? projectAimDate(currentRate, aim, celeration, lastSessionDate) : null;

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      currentRate: currentRate,
      bestRate: familyData.bestRate || 0,
      aim: aim,
      celeration: celeration,
      atAim: currentRate >= aim,
      weeklyImprovement: celeration ? Math.round((celeration - 1) * 100) : null, // % improvement per week
      projectedAimDate: projectedAimDate
    };

    res.json({
      success: true,
      hasData: true,
      operation,
      familyName,
      displayName: familyData.displayName,
      sessions,
      stats,
      mastered: familyData.mastered || false
    });
  } catch (error) {
    console.error('Error fetching celeration data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/celeration/overview - Get celeration overview for all practiced fact families
router.get('/celeration/overview', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const aim = getFluencyAim(user);
    const familiesData = [];

    for (const [familyKey, familyData] of user.factFluencyProgress?.factFamilies || new Map()) {
      if (!familyData.sessions || familyData.sessions.length === 0) continue;

      const sessions = familyData.sessions.map(s => ({
        date: s.date,
        rate: s.rate
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      const celeration = calculateCeleration(sessions);

      // Current rate (median of last 3)
      const recentSessions = sessions.slice(-3);
      const recentRates = recentSessions.map(s => s.rate).sort((a, b) => a - b);
      const currentRate = recentRates[Math.floor(recentRates.length / 2)];

      familiesData.push({
        familyKey,
        operation: familyData.operation,
        familyName: familyData.familyName,
        displayName: familyData.displayName,
        currentRate,
        celeration,
        atAim: currentRate >= aim,
        mastered: familyData.mastered,
        sessionCount: sessions.length,
        lastPracticed: familyData.lastPracticed
      });
    }

    // Sort by most recently practiced
    familiesData.sort((a, b) => {
      const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
      const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      aim,
      families: familiesData
    });
  } catch (error) {
    console.error('Error fetching celeration overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/celeration/class-summary - Teacher view: celeration data for all students
router.get('/celeration/class-summary', isAuthenticated, async (req, res) => {
  try {
    const teacher = await User.findById(req.user._id);

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Find all students assigned to this teacher
    const students = await User.find({
      role: 'student',
      teacherId: teacher._id
    }).select('firstName lastName gradeLevel factFluencyProgress');

    const classSummary = [];

    for (const student of students) {
      const aim = getFluencyAim(student);
      const studentData = {
        studentId: student._id,
        name: `${student.firstName} ${student.lastName}`,
        gradeLevel: student.gradeLevel,
        aim,
        families: []
      };

      for (const [familyKey, familyData] of student.factFluencyProgress?.factFamilies || new Map()) {
        if (!familyData.sessions || familyData.sessions.length < 2) continue;

        const sessions = familyData.sessions.map(s => ({
          date: s.date,
          rate: s.rate
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        const celeration = calculateCeleration(sessions);

        // Current rate
        const recentSessions = sessions.slice(-3);
        const recentRates = recentSessions.map(s => s.rate).sort((a, b) => a - b);
        const currentRate = recentRates[Math.floor(recentRates.length / 2)];

        studentData.families.push({
          familyKey,
          displayName: familyData.displayName,
          currentRate,
          celeration,
          atAim: currentRate >= aim,
          needsIntervention: celeration && celeration < 1.1, // Less than 10% weekly improvement
          sessionCount: sessions.length
        });
      }

      if (studentData.families.length > 0) {
        classSummary.push(studentData);
      }
    }

    // Sort by students needing intervention first
    classSummary.sort((a, b) => {
      const aNeeds = a.families.some(f => f.needsIntervention);
      const bNeeds = b.families.some(f => f.needsIntervention);
      if (aNeeds && !bNeeds) return -1;
      if (!aNeeds && bNeeds) return 1;
      return 0;
    });

    res.json({
      success: true,
      classSummary,
      totalStudents: students.length,
      studentsWithData: classSummary.length
    });
  } catch (error) {
    console.error('Error fetching class celeration summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
