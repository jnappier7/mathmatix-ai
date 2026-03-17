/**
 * routes/analytics.js
 *
 * Comprehensive analytics API endpoints spanning teacher, parent, and admin roles.
 * Mounted as: app.use('/api/analytics', isAuthenticated, analyticsRoutes)
 * Role checks are applied per-endpoint via middleware.
 *
 * Surfaces data from the multi-engine learning system:
 *   - BKT (Bayesian Knowledge Tracing)
 *   - FSRS (Free Spaced Repetition Scheduler)
 *   - Consistency / SmartScore
 *   - Cognitive Load tracking
 */

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Skill = require('../models/skill');
const { isTeacher, isParent, isAdmin } = require('../middleware/auth');
const { getStudentIdsForTeacher } = require('../services/userService');
const { calculateRetrievability } = require('../utils/fsrsScheduler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup map of skillId -> { displayName, category } from the Skill collection.
 * @param {string[]} skillIds
 * @returns {Promise<Object>}
 */
async function getSkillInfoMap(skillIds) {
  if (!skillIds || skillIds.length === 0) return {};
  const skills = await Skill.find({ skillId: { $in: skillIds } })
    .select('skillId displayName category')
    .lean();
  const map = {};
  for (const s of skills) {
    map[s.skillId] = { displayName: s.displayName || s.skillId, category: s.category || 'Uncategorized' };
  }
  return map;
}

/**
 * Safely convert a Mongoose Map (or plain object) into an array of [key, value] pairs.
 */
function mapEntries(mapOrObj) {
  if (!mapOrObj) return [];
  if (typeof mapOrObj.entries === 'function') {
    return Array.from(mapOrObj.entries());
  }
  return Object.entries(mapOrObj);
}

/**
 * Verify that a teacher has access to a given student.
 * Returns the student document (lean) or null.
 */
async function verifyTeacherStudentAccess(teacherId, studentId) {
  const authorizedIds = await getStudentIdsForTeacher(teacherId);
  const authorized = authorizedIds.some(id => id.toString() === studentId.toString());
  if (!authorized) return null;
  const student = await User.findById(studentId).lean();
  return student;
}

/**
 * Verify that a parent has access to a given child.
 * Returns the child document (lean) or null.
 */
async function verifyParentChildAccess(parentId, childId) {
  // Match the pattern used in routes/parent.js:
  // 1. Check parent.children contains childId
  // 2. Check child.parentIds contains parentId
  const parent = await User.findById(parentId).select('children').lean();
  if (!parent || !parent.children || !parent.children.some(c => c.toString() === childId.toString())) {
    return null;
  }
  const child = await User.findById(childId).lean();
  return child || null;
}

/**
 * Compute current elapsed days for an FSRS entry.
 */
function fsrsElapsedDays(entry) {
  if (!entry || !entry.lastReview) return 0;
  return (Date.now() - new Date(entry.lastReview).getTime()) / 86400000;
}

// ===========================================================================
//  TEACHER ENDPOINTS
// ===========================================================================

// 1. GET /student/:studentId/knowledge-map
router.get('/student/:studentId/knowledge-map', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await verifyTeacherStudentAccess(req.user._id, studentId);
    if (!student) return res.status(403).json({ message: 'Access denied or student not found.' });

    const bkt = student.learningEngines?.bkt;
    const entries = mapEntries(bkt);
    const skillIds = entries.map(([id]) => id);
    const skillInfo = await getSkillInfoMap(skillIds);

    const skillsList = entries.map(([skillId, data]) => {
      const info = skillInfo[skillId] || { displayName: skillId, category: 'Uncategorized' };
      return {
        skillId,
        displayName: info.displayName,
        category: info.category,
        pLearned: data.pLearned ?? 0,
        mastered: data.mastered ?? false,
        confidence: data.confidence ?? 0,
        totalAttempts: data.totalAttempts ?? 0,
        lastObservation: data.lastObservation ?? null,
      };
    });

    // Group by category
    const grouped = {};
    for (const skill of skillsList) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category].push(skill);
    }

    res.json({ studentId, categories: grouped });
  } catch (err) {
    console.error('Error in knowledge-map:', err);
    res.status(500).json({ message: 'Server error fetching knowledge map.' });
  }
});

// 2. GET /student/:studentId/memory-forecast
router.get('/student/:studentId/memory-forecast', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await verifyTeacherStudentAccess(req.user._id, studentId);
    if (!student) return res.status(403).json({ message: 'Access denied or student not found.' });

    const fsrs = student.learningEngines?.fsrs;
    const entries = mapEntries(fsrs);
    const skillIds = entries.map(([id]) => id);
    const skillInfo = await getSkillInfoMap(skillIds);

    const forecast = entries.map(([skillId, data]) => {
      const info = skillInfo[skillId] || { displayName: skillId, category: 'Uncategorized' };
      const elapsed = fsrsElapsedDays(data);
      const retrievability = calculateRetrievability(elapsed, data.stability ?? 0);
      return {
        skillId,
        displayName: info.displayName,
        retrievability,
        stability: data.stability ?? 0,
        difficulty: data.difficulty ?? 0,
        scheduledDays: data.scheduledDays ?? 0,
        state: data.state ?? 0,
        isDue: (data.scheduledDays ?? 0) <= elapsed,
        lastReview: data.lastReview ?? null,
      };
    });

    // Sort by retrievability ascending (most urgent first)
    forecast.sort((a, b) => a.retrievability - b.retrievability);

    res.json({ studentId, forecast });
  } catch (err) {
    console.error('Error in memory-forecast:', err);
    res.status(500).json({ message: 'Server error fetching memory forecast.' });
  }
});

// 3. GET /student/:studentId/cognitive-profile
router.get('/student/:studentId/cognitive-profile', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await verifyTeacherStudentAccess(req.user._id, studentId);
    if (!student) return res.status(403).json({ message: 'Access denied or student not found.' });

    const history = student.learningEngines?.cognitiveLoadHistory || [];

    // Summary stats
    let avgLoad = 0;
    let peakLoad = 0;
    let currentLevel = null;
    if (history.length > 0) {
      const totalLoad = history.reduce((sum, h) => sum + (h.avgLoad ?? 0), 0);
      avgLoad = totalLoad / history.length;
      peakLoad = Math.max(...history.map(h => h.peakLoad ?? 0));
      currentLevel = history[history.length - 1].level ?? null;
    }

    res.json({
      studentId,
      history,
      summary: {
        avgLoad: Math.round(avgLoad * 1000) / 1000,
        peakLoad,
        sessionCount: history.length,
        currentLevel,
      },
    });
  } catch (err) {
    console.error('Error in cognitive-profile:', err);
    res.status(500).json({ message: 'Server error fetching cognitive profile.' });
  }
});

// 4. GET /student/:studentId/consistency-report
router.get('/student/:studentId/consistency-report', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await verifyTeacherStudentAccess(req.user._id, studentId);
    if (!student) return res.status(403).json({ message: 'Access denied or student not found.' });

    const consistency = student.learningEngines?.consistency;
    const entries = mapEntries(consistency);
    const skillIds = entries.map(([id]) => id);
    const skillInfo = await getSkillInfoMap(skillIds);

    const report = entries.map(([skillId, data]) => {
      const info = skillInfo[skillId] || { displayName: skillId, category: 'Uncategorized' };
      return {
        skillId,
        displayName: info.displayName,
        smartScore: data.smartScore ?? 0,
        rawAccuracy: data.rawAccuracy ?? 0,
        productiveStruggleDetected: data.productiveStruggleDetected ?? false,
        streakType: data.streakType ?? null,
        currentStreakLength: data.currentStreakLength ?? 0,
        errorCount: data.errorCount ?? 0,
        recoveryCount: data.recoveryCount ?? 0,
      };
    });

    res.json({ studentId, skills: report });
  } catch (err) {
    console.error('Error in consistency-report:', err);
    res.status(500).json({ message: 'Server error fetching consistency report.' });
  }
});

// 5. GET /student/:studentId/learning-trajectory
router.get('/student/:studentId/learning-trajectory', isTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await verifyTeacherStudentAccess(req.user._id, studentId);
    if (!student) return res.status(403).json({ message: 'Access denied or student not found.' });

    const timeline = [];

    // BKT observations
    const bkt = student.learningEngines?.bkt;
    for (const [skillId, data] of mapEntries(bkt)) {
      const observations = data.observations || [];
      for (const obs of observations) {
        timeline.push({
          timestamp: obs.timestamp || obs.date || data.lastObservation,
          type: 'bkt',
          skillId,
          data: {
            pLearned: data.pLearned,
            correct: obs.correct,
            mastered: data.mastered,
          },
        });
      }
    }

    // FSRS history (use lastReview as timestamp per skill)
    const fsrs = student.learningEngines?.fsrs;
    for (const [skillId, data] of mapEntries(fsrs)) {
      if (data.lastReview) {
        timeline.push({
          timestamp: data.lastReview,
          type: 'fsrs',
          skillId,
          data: {
            stability: data.stability,
            difficulty: data.difficulty,
            reps: data.reps,
            lapses: data.lapses,
            state: data.state,
          },
        });
      }
    }

    // Consistency responses
    const consistency = student.learningEngines?.consistency;
    for (const [skillId, data] of mapEntries(consistency)) {
      const responses = data.responses || [];
      for (const resp of responses) {
        timeline.push({
          timestamp: resp.timestamp || resp.date,
          type: 'consistency',
          skillId,
          data: {
            smartScore: data.smartScore,
            correct: resp.correct,
            streakType: data.streakType,
          },
        });
      }
    }

    // Sort by timestamp descending (most recent first)
    timeline.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    res.json({ studentId, timeline });
  } catch (err) {
    console.error('Error in learning-trajectory:', err);
    res.status(500).json({ message: 'Server error fetching learning trajectory.' });
  }
});

// 6. GET /class/knowledge-heatmap
router.get('/class/knowledge-heatmap', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const studentIds = await getStudentIdsForTeacher(teacherId);
    const students = await User.find(
      { _id: { $in: studentIds }, role: 'student' },
      'firstName lastName learningEngines.bkt'
    ).lean();

    const allSkillIds = new Set();
    const studentsData = students.map(s => {
      const bkt = s.learningEngines?.bkt;
      const skills = {};
      for (const [skillId, data] of mapEntries(bkt)) {
        skills[skillId] = data.pLearned ?? 0;
        allSkillIds.add(skillId);
      }
      return {
        id: s._id,
        name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        skills,
      };
    });

    const skillIdArray = Array.from(allSkillIds);
    const skillInfo = await getSkillInfoMap(skillIdArray);
    const skillNames = {};
    for (const id of skillIdArray) {
      skillNames[id] = skillInfo[id]?.displayName || id;
    }

    res.json({
      students: studentsData,
      skillIds: skillIdArray,
      skillNames,
    });
  } catch (err) {
    console.error('Error in knowledge-heatmap:', err);
    res.status(500).json({ message: 'Server error fetching knowledge heatmap.' });
  }
});

// 7. GET /class/risk-radar
router.get('/class/risk-radar', isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;
    const studentIds = await getStudentIdsForTeacher(teacherId);
    const students = await User.find(
      { _id: { $in: studentIds }, role: 'student' },
      'firstName lastName learningEngines'
    ).lean();

    const riskReport = students.map(s => {
      const engines = s.learningEngines || {};

      // Avg pLearned (BKT)
      const bktEntries = mapEntries(engines.bkt);
      let avgPLearned = 0;
      if (bktEntries.length > 0) {
        avgPLearned = bktEntries.reduce((sum, [, d]) => sum + (d.pLearned ?? 0), 0) / bktEntries.length;
      }

      // Avg retrievability (FSRS)
      const fsrsEntries = mapEntries(engines.fsrs);
      let avgRetrievability = 1;
      if (fsrsEntries.length > 0) {
        avgRetrievability = fsrsEntries.reduce((sum, [, d]) => {
          const elapsed = fsrsElapsedDays(d);
          return sum + calculateRetrievability(elapsed, d.stability ?? 0);
        }, 0) / fsrsEntries.length;
      }

      // Recent cognitive load (last entry)
      const cogHistory = engines.cognitiveLoadHistory || [];
      const recentCognitiveLoad = cogHistory.length > 0
        ? cogHistory[cogHistory.length - 1].avgLoad ?? 0
        : 0;

      // Avg SmartScore (consistency)
      const consistencyEntries = mapEntries(engines.consistency);
      let avgSmartScore = 100;
      if (consistencyEntries.length > 0) {
        avgSmartScore = consistencyEntries.reduce((sum, [, d]) => sum + (d.smartScore ?? 0), 0) / consistencyEntries.length;
      }

      // Risk flags
      const atRisk = avgPLearned < 0.4 || recentCognitiveLoad > 0.7 || avgSmartScore < 40;

      // Composite risk score (higher = more at risk, 0-1 scale)
      const riskScore =
        (1 - avgPLearned) * 0.3 +
        Math.min(recentCognitiveLoad, 1) * 0.3 +
        (1 - avgSmartScore / 100) * 0.2 +
        (1 - avgRetrievability) * 0.2;

      return {
        id: s._id,
        name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        avgPLearned: Math.round(avgPLearned * 1000) / 1000,
        avgRetrievability: Math.round(avgRetrievability * 1000) / 1000,
        recentCognitiveLoad: Math.round(recentCognitiveLoad * 1000) / 1000,
        avgSmartScore: Math.round(avgSmartScore * 100) / 100,
        atRisk,
        riskScore: Math.round(riskScore * 1000) / 1000,
      };
    });

    // Sort by risk score descending (most at-risk first)
    riskReport.sort((a, b) => b.riskScore - a.riskScore);

    res.json({ students: riskReport });
  } catch (err) {
    console.error('Error in risk-radar:', err);
    res.status(500).json({ message: 'Server error fetching risk radar.' });
  }
});

// ===========================================================================
//  PARENT ENDPOINTS
// ===========================================================================

// 8. GET /child/:childId/memory-health
router.get('/child/:childId/memory-health', isParent, async (req, res) => {
  try {
    const { childId } = req.params;
    const child = await verifyParentChildAccess(req.user._id, childId);
    if (!child) return res.status(403).json({ message: 'Access denied or child not found.' });

    const fsrs = child.learningEngines?.fsrs;
    const entries = mapEntries(fsrs);
    const skillIds = entries.map(([id]) => id);
    const skillInfo = await getSkillInfoMap(skillIds);

    let strong = 0;
    let fading = 0;
    let needsReview = 0;
    const skills = [];

    for (const [skillId, data] of entries) {
      const info = skillInfo[skillId] || { displayName: skillId };
      const elapsed = fsrsElapsedDays(data);
      const retrievability = calculateRetrievability(elapsed, data.stability ?? 0);

      let status;
      if (retrievability >= 0.85) {
        status = 'strong';
        strong++;
      } else if (retrievability >= 0.5) {
        status = 'fading';
        fading++;
      } else {
        status = 'needs-review';
        needsReview++;
      }

      skills.push({
        skillId,
        displayName: info.displayName,
        status,
        retrievability: Math.round(retrievability * 1000) / 1000,
      });
    }

    res.json({
      childId,
      strong,
      fading,
      needsReview,
      totalSkills: entries.length,
      skills,
    });
  } catch (err) {
    console.error('Error in memory-health:', err);
    res.status(500).json({ message: 'Server error fetching memory health.' });
  }
});

// 9. GET /child/:childId/weekly-brain-report
router.get('/child/:childId/weekly-brain-report', isParent, async (req, res) => {
  try {
    const { childId } = req.params;
    const child = await verifyParentChildAccess(req.user._id, childId);
    if (!child) return res.status(403).json({ message: 'Access denied or child not found.' });

    const engines = child.learningEngines || {};
    const cogHistory = engines.cognitiveLoadHistory || [];

    // Filter to last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
    const recentHistory = cogHistory.filter(h => h.date && new Date(h.date) >= oneWeekAgo);

    // Cognitive load
    let avgCognitiveLoad = 0;
    let trend = 'stable';
    if (recentHistory.length > 0) {
      avgCognitiveLoad = recentHistory.reduce((sum, h) => sum + (h.avgLoad ?? 0), 0) / recentHistory.length;

      // Trend: compare first half vs second half
      if (recentHistory.length >= 2) {
        const mid = Math.floor(recentHistory.length / 2);
        const firstHalfAvg = recentHistory.slice(0, mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / mid;
        const secondHalfAvg = recentHistory.slice(mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / (recentHistory.length - mid);
        if (secondHalfAvg > firstHalfAvg + 0.05) trend = 'rising';
        else if (secondHalfAvg < firstHalfAvg - 0.05) trend = 'improving';
      }
    }

    // Engagement
    const sessionCount = recentHistory.length;
    const totalMinutes = recentHistory.reduce((sum, h) => sum + (h.sessionMinutes ?? 0), 0);

    // Progress: skills mastered this week (BKT) and SmartScore improvements
    const bkt = engines.bkt;
    let skillsMasteredThisWeek = 0;
    for (const [, data] of mapEntries(bkt)) {
      if (data.mastered && data.lastObservation && new Date(data.lastObservation) >= oneWeekAgo) {
        skillsMasteredThisWeek++;
      }
    }

    const consistency = engines.consistency;
    let smartScoreImprovements = 0;
    for (const [, data] of mapEntries(consistency)) {
      // Count skills with positive trajectory (recent responses show improvement)
      const responses = data.responses || [];
      const recentResponses = responses.filter(r => r.timestamp && new Date(r.timestamp) >= oneWeekAgo);
      if (recentResponses.length >= 2) {
        const earlierCorrect = recentResponses.slice(0, Math.floor(recentResponses.length / 2))
          .filter(r => r.correct).length;
        const laterCorrect = recentResponses.slice(Math.floor(recentResponses.length / 2))
          .filter(r => r.correct).length;
        if (laterCorrect > earlierCorrect) smartScoreImprovements++;
      }
    }

    res.json({
      childId,
      week: {
        start: oneWeekAgo.toISOString(),
        end: new Date().toISOString(),
      },
      cognitiveLoad: {
        average: Math.round(avgCognitiveLoad * 1000) / 1000,
        trend,
        label: trend === 'improving' ? 'Getting easier' : trend === 'rising' ? 'Working harder' : 'Steady effort',
      },
      engagement: {
        sessionCount,
        totalMinutes: Math.round(totalMinutes),
        label: sessionCount >= 5 ? 'Very active' : sessionCount >= 3 ? 'Active' : sessionCount >= 1 ? 'Getting started' : 'No sessions this week',
      },
      progress: {
        skillsMasteredThisWeek,
        smartScoreImprovements,
        label: skillsMasteredThisWeek > 0 ? `Mastered ${skillsMasteredThisWeek} new skill${skillsMasteredThisWeek > 1 ? 's' : ''}!` : 'Building foundations',
      },
    });
  } catch (err) {
    console.error('Error in weekly-brain-report:', err);
    res.status(500).json({ message: 'Server error fetching weekly brain report.' });
  }
});

// 10. GET /child/:childId/strength-map
router.get('/child/:childId/strength-map', isParent, async (req, res) => {
  try {
    const { childId } = req.params;
    const child = await verifyParentChildAccess(req.user._id, childId);
    if (!child) return res.status(403).json({ message: 'Access denied or child not found.' });

    const bkt = child.learningEngines?.bkt;
    const entries = mapEntries(bkt);
    const skillIds = entries.map(([id]) => id);
    const skillInfo = await getSkillInfoMap(skillIds);

    // Group by category
    const categories = {};
    for (const [skillId, data] of entries) {
      const info = skillInfo[skillId] || { displayName: skillId, category: 'Uncategorized' };
      const cat = info.category;
      if (!categories[cat]) {
        categories[cat] = { name: cat, mastered: 0, learning: 0, needsWork: 0, totalSkills: 0 };
      }
      const pLearned = data.pLearned ?? 0;
      categories[cat].totalSkills++;
      if (pLearned >= 0.95) categories[cat].mastered++;
      else if (pLearned >= 0.3) categories[cat].learning++;
      else categories[cat].needsWork++;
    }

    res.json({ childId, categories: Object.values(categories) });
  } catch (err) {
    console.error('Error in strength-map:', err);
    res.status(500).json({ message: 'Server error fetching strength map.' });
  }
});

// ===========================================================================
//  ADMIN ENDPOINTS
// ===========================================================================

// 11. GET /platform/engine-health
router.get('/platform/engine-health', isAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    // Sample up to 100 recent active students
    const students = await User.find(
      { role: 'student', lastLogin: { $gte: thirtyDaysAgo } },
      'learningEngines'
    ).limit(100).lean();

    let totalBktPLearned = 0;
    let bktCount = 0;
    let totalRetrievability = 0;
    let fsrsCount = 0;
    let totalCogLoad = 0;
    let cogLoadCount = 0;
    let totalSmartScore = 0;
    let smartScoreCount = 0;

    const cogLevelDistribution = {};

    for (const s of students) {
      const engines = s.learningEngines || {};

      // BKT
      for (const [, data] of mapEntries(engines.bkt)) {
        totalBktPLearned += data.pLearned ?? 0;
        bktCount++;
      }

      // FSRS
      for (const [, data] of mapEntries(engines.fsrs)) {
        const elapsed = fsrsElapsedDays(data);
        totalRetrievability += calculateRetrievability(elapsed, data.stability ?? 0);
        fsrsCount++;
      }

      // Cognitive load (most recent entry per student)
      const cogHistory = engines.cognitiveLoadHistory || [];
      if (cogHistory.length > 0) {
        const latest = cogHistory[cogHistory.length - 1];
        totalCogLoad += latest.avgLoad ?? 0;
        cogLoadCount++;
        const level = latest.level || 'unknown';
        cogLevelDistribution[level] = (cogLevelDistribution[level] || 0) + 1;
      }

      // SmartScore
      for (const [, data] of mapEntries(engines.consistency)) {
        totalSmartScore += data.smartScore ?? 0;
        smartScoreCount++;
      }
    }

    res.json({
      sampleSize: students.length,
      averages: {
        bktPLearned: bktCount > 0 ? Math.round((totalBktPLearned / bktCount) * 1000) / 1000 : null,
        fsrsRetrievability: fsrsCount > 0 ? Math.round((totalRetrievability / fsrsCount) * 1000) / 1000 : null,
        cognitiveLoad: cogLoadCount > 0 ? Math.round((totalCogLoad / cogLoadCount) * 1000) / 1000 : null,
        smartScore: smartScoreCount > 0 ? Math.round((totalSmartScore / smartScoreCount) * 100) / 100 : null,
      },
      cognitiveLoadDistribution: cogLevelDistribution,
      counts: {
        bktSkillEntries: bktCount,
        fsrsSkillEntries: fsrsCount,
        studentsWithCognitiveLoad: cogLoadCount,
        consistencySkillEntries: smartScoreCount,
      },
    });
  } catch (err) {
    console.error('Error in engine-health:', err);
    res.status(500).json({ message: 'Server error fetching engine health.' });
  }
});

// 12. GET /platform/learning-outcomes
router.get('/platform/learning-outcomes', isAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const students = await User.find(
      { role: 'student', lastLogin: { $gte: thirtyDaysAgo } },
      'learningEngines'
    ).limit(100).lean();

    let masteredSkills = 0;
    let totalTrackedSkills = 0;
    let totalTimeToMastery = 0;
    let timeToMasteryCount = 0;
    let productiveStruggleCount = 0;
    let totalConsistencySkills = 0;

    for (const s of students) {
      const engines = s.learningEngines || {};

      // BKT mastery stats
      for (const [, data] of mapEntries(engines.bkt)) {
        totalTrackedSkills++;
        if ((data.pLearned ?? 0) >= 0.95) {
          masteredSkills++;

          // Time to mastery: first observation to mastered
          const observations = data.observations || [];
          if (observations.length > 0 && data.lastObservation) {
            const firstObs = observations[0].timestamp || observations[0].date;
            if (firstObs) {
              const timeMs = new Date(data.lastObservation).getTime() - new Date(firstObs).getTime();
              if (timeMs > 0) {
                totalTimeToMastery += timeMs;
                timeToMasteryCount++;
              }
            }
          }
        }
      }

      // Productive struggle rate
      for (const [, data] of mapEntries(engines.consistency)) {
        totalConsistencySkills++;
        if (data.productiveStruggleDetected) productiveStruggleCount++;
      }
    }

    const avgTimeToMasteryDays = timeToMasteryCount > 0
      ? Math.round((totalTimeToMastery / timeToMasteryCount / 86400000) * 100) / 100
      : null;

    const productiveStruggleRate = totalConsistencySkills > 0
      ? Math.round((productiveStruggleCount / totalConsistencySkills) * 1000) / 1000
      : null;

    res.json({
      sampleSize: students.length,
      mastery: {
        masteredSkills,
        totalTrackedSkills,
        masteryRate: totalTrackedSkills > 0
          ? Math.round((masteredSkills / totalTrackedSkills) * 1000) / 1000
          : null,
      },
      timeToMastery: {
        avgDays: avgTimeToMasteryDays,
        sampleCount: timeToMasteryCount,
      },
      productiveStruggle: {
        rate: productiveStruggleRate,
        count: productiveStruggleCount,
        totalSkillsTracked: totalConsistencySkills,
      },
    });
  } catch (err) {
    console.error('Error in learning-outcomes:', err);
    res.status(500).json({ message: 'Server error fetching learning outcomes.' });
  }
});

module.exports = router;
