// routes/learningCurve.js - Learning Curve Visualization & IRT Transparency

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');

// GET /api/learning-curve/:skillId - Get learning curve data for a skill
router.get('/learning-curve/:skillId', isAuthenticated, async (req, res) => {
  try {
    const { skillId } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const skillData = user.skillMastery?.get(skillId);

    if (!skillData) {
      return res.json({
        success: true,
        hasData: false,
        message: 'No practice data yet for this skill'
      });
    }

    // Extract time-series data from practice history
    const curveData = skillData.practiceHistory?.map(entry => ({
      timestamp: entry.timestamp,
      theta: entry.theta || 0,
      standardError: entry.standardError || 1.0,
      correct: entry.correct,
      problemDifficulty: entry.difficulty || 0
    })) || [];

    // Calculate statistics
    const stats = calculateSkillStats(skillData, curveData);

    res.json({
      success: true,
      hasData: true,
      skillId,
      displayName: getSkillDisplayName(skillId),
      curveData,
      stats,
      currentTheta: skillData.theta || 0,
      currentSE: skillData.standardError || 1.0,
      masteryScore: skillData.masteryScore || 0,
      status: skillData.status || 'learning'
    });
  } catch (error) {
    console.error('Error fetching learning curve:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/learning-curve/overview - Get overview of all skills
router.get('/learning-curve/overview', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const skillsOverview = [];

    for (const [skillId, skillData] of user.skillMastery || new Map()) {
      const practiceCount = skillData.practiceHistory?.length || 0;

      if (practiceCount > 0) {
        const firstTheta = skillData.practiceHistory[0]?.theta || 0;
        const currentTheta = skillData.theta || 0;
        const growth = currentTheta - firstTheta;

        skillsOverview.push({
          skillId,
          displayName: getSkillDisplayName(skillId),
          currentTheta: currentTheta,
          growth: growth,
          practiceCount: practiceCount,
          masteryScore: skillData.masteryScore || 0,
          status: skillData.status,
          lastPracticed: skillData.lastPracticed
        });
      }
    }

    // Sort by most recently practiced
    skillsOverview.sort((a, b) => {
      const dateA = a.lastPracticed ? new Date(a.lastPracticed) : new Date(0);
      const dateB = b.lastPracticed ? new Date(b.lastPracticed) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      skills: skillsOverview,
      totalSkillsPracticed: skillsOverview.length
    });
  } catch (error) {
    console.error('Error fetching learning curve overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to calculate statistics
function calculateSkillStats(skillData, curveData) {
  if (!curveData || curveData.length === 0) {
    return {
      totalAttempts: 0,
      correctAttempts: 0,
      accuracy: 0,
      averageTheta: 0,
      thetaGrowth: 0,
      confidenceImprovement: 0,
      practiceTime: 0
    };
  }

  const totalAttempts = curveData.length;
  const correctAttempts = curveData.filter(d => d.correct).length;
  const accuracy = (correctAttempts / totalAttempts) * 100;

  const firstTheta = curveData[0].theta;
  const currentTheta = curveData[curveData.length - 1].theta;
  const thetaGrowth = currentTheta - firstTheta;

  const firstSE = curveData[0].standardError;
  const currentSE = curveData[curveData.length - 1].standardError;
  const confidenceImprovement = ((firstSE - currentSE) / firstSE) * 100;

  // Calculate average theta
  const averageTheta = curveData.reduce((sum, d) => sum + d.theta, 0) / totalAttempts;

  // Estimate practice time (assume 2 min per problem)
  const practiceTime = Math.round(totalAttempts * 2);

  return {
    totalAttempts,
    correctAttempts,
    accuracy: Math.round(accuracy),
    averageTheta: Math.round(averageTheta * 100) / 100,
    thetaGrowth: Math.round(thetaGrowth * 100) / 100,
    confidenceImprovement: Math.round(confidenceImprovement),
    practiceTime
  };
}

// Helper function to get display name for skill
function getSkillDisplayName(skillId) {
  // Convert kebab-case to Title Case
  return skillId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// GET /api/learning-curve/milestones - Get achievement milestones
router.get('/learning-curve/milestones', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const milestones = [];

    // Check for various milestones
    for (const [skillId, skillData] of user.skillMastery || new Map()) {
      const practiceHistory = skillData.practiceHistory || [];

      if (practiceHistory.length === 0) continue;

      const firstTheta = practiceHistory[0]?.theta || 0;
      const currentTheta = skillData.theta || 0;
      const growth = currentTheta - firstTheta;

      // Milestone: First theta above 0
      if (currentTheta > 0 && firstTheta <= 0) {
        milestones.push({
          type: 'breakthrough',
          skillId,
          displayName: getSkillDisplayName(skillId),
          description: 'Achieved positive ability!',
          icon: '🎯',
          date: skillData.lastPracticed
        });
      }

      // Milestone: Growth of 1.0 or more
      if (growth >= 1.0) {
        milestones.push({
          type: 'growth',
          skillId,
          displayName: getSkillDisplayName(skillId),
          description: `Improved ability by ${Math.round(growth * 10) / 10} points!`,
          icon: '📈',
          date: skillData.lastPracticed
        });
      }

      // Milestone: Mastered
      if (skillData.status === 'mastered') {
        milestones.push({
          type: 'mastery',
          skillId,
          displayName: getSkillDisplayName(skillId),
          description: 'Skill mastered!',
          icon: '🏆',
          date: skillData.masteredDate || skillData.lastPracticed
        });
      }

      // Milestone: High confidence (SE < 0.3)
      const currentSE = skillData.standardError || 1.0;
      if (currentSE < 0.3) {
        milestones.push({
          type: 'confidence',
          skillId,
          displayName: getSkillDisplayName(skillId),
          description: 'High confidence achieved!',
          icon: '💎',
          date: skillData.lastPracticed
        });
      }
    }

    // Sort by date (most recent first)
    milestones.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      milestones: milestones.slice(0, 20) // Return top 20 most recent
    });
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
