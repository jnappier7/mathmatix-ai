/**
 * PERSIST STAGE — Save state changes after response generation
 *
 * Handles all database writes in one place:
 * - Mastery evidence updates (4 pillars)
 * - IEP goal progress
 * - XP awards (3-tier ladder)
 * - Skill tracking
 * - Conversation save
 * - Misconception recording
 *
 * Separates "what happened" (from verify.extracted) from "save it" (here).
 *
 * @module pipeline/persist
 */

const BRAND_CONFIG = require('../brand');
const { sendSafetyConcernAlert } = require('../emailService');
const { recordMisconception } = require('../misconceptionDetector');
const { computeXpBreakdown, applyXpToUser } = require('./xpEngine');

/**
 * Persist all state changes from a pipeline run.
 *
 * @param {Object} params
 * @param {Object} params.user - Mongoose user document
 * @param {Object} params.conversation - Mongoose conversation document
 * @param {Object} params.extracted - Structured data extracted from AI response (from verify stage)
 * @param {Object} params.diagnosis - Diagnosis result (from diagnose stage)
 * @param {Object} params.observation - Observation result (from observe stage)
 * @param {Object} params.decision - Decision result (from decide stage)
 * @param {string} params.responseText - Final cleaned response text
 * @param {string} params.originalMessage - Original student message
 * @param {number} params.aiProcessingSeconds - How long the AI took
 * @returns {Object} Persistence results for the response payload
 */
async function persist(params) {
  const {
    user, conversation, extracted, diagnosis, observation,
    decision, responseText, originalMessage, aiProcessingSeconds,
    sessionMood, evidence,
  } = params;

  const results = {
    xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
    problemAnswered: false,
    wasCorrect: false,
    wasSkipped: false,
    leveledUp: false,
    tutorsUnlocked: [],
    iepGoalUpdates: [],
    courseProgressUpdate: null,
  };

  // ── 1. Process problem result ──
  // Prefer structured diagnosis over tag-based detection
  if (diagnosis && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
    results.problemAnswered = true;
    results.wasCorrect = diagnosis.isCorrect === true;
  } else if (extracted.problemResult) {
    results.problemAnswered = true;
    results.wasCorrect = extracted.problemResult === 'correct';
    results.wasSkipped = extracted.problemResult === 'skipped';
  }

  // ── 2. Safety concern handling ──
  if (extracted.safetyConcern) {
    console.error(`[Persist] SAFETY CONCERN - User ${user._id} (${user.firstName}) - ${extracted.safetyConcern}`);
    sendSafetyConcernAlert(
      { userId: user._id.toString(), firstName: user.firstName, lastName: user.lastName, username: user.username, gradeLevel: user.gradeLevel },
      extracted.safetyConcern,
      originalMessage
    ).catch(err => console.error('Failed to send safety alert:', err));
  }

  // ── 3. Skill mastery tracking ──
  if (extracted.skillMastered) {
    updateSkillMastery(user, extracted.skillMastered, observation, conversation);
  }

  if (extracted.skillStarted) {
    user.skillMastery = user.skillMastery || new Map();
    user.skillMastery.set(extracted.skillStarted, {
      status: 'learning',
      masteryScore: 0.3,
      learningStarted: new Date(),
      notes: 'Currently learning with AI',
    });
    user.markModified('skillMastery');
  }

  // ── 4. Learning insight ──
  if (extracted.learningInsight) {
    if (!user.learningProfile.memorableConversations) {
      user.learningProfile.memorableConversations = [];
    }
    user.learningProfile.memorableConversations.unshift({
      date: new Date(),
      summary: extracted.learningInsight,
      context: 'Learning insight from AI',
    });
    user.learningProfile.memorableConversations = user.learningProfile.memorableConversations.slice(0, 10);
    user.markModified('learningProfile');
  }

  // ── 5. IEP goal progress ──
  if (extracted.iepGoalUpdates.length > 0 && user.iepPlan?.goals) {
    for (const update of extracted.iepGoalUpdates) {
      const goalResult = processIepGoalUpdate(user, update.goalIdentifier, update.progressChange);
      if (goalResult) results.iepGoalUpdates.push(goalResult);
    }
    if (results.iepGoalUpdates.length > 0) {
      user.markModified('iepPlan');
    }
  }

  // ── 6. Misconception recording ──
  if (diagnosis?.misconception && diagnosis.isCorrect === false) {
    try {
      await recordMisconception(user, diagnosis.problemInfo?.type || 'unknown', {
        misconceptionName: diagnosis.misconception.name,
        errorDescription: diagnosis.misconception.description || '',
        severity: diagnosis.misconception.severity || 'medium',
      });
    } catch (err) {
      console.error('[Persist] Misconception recording failed:', err.message);
    }
  }

  // ── 7. Conversation update ──
  conversation.messages.push({ role: 'assistant', content: responseText.trim() });

  if (results.problemAnswered) {
    conversation.problemsAttempted = (conversation.problemsAttempted || 0) + 1;
    if (results.wasCorrect) {
      conversation.problemsCorrect = (conversation.problemsCorrect || 0) + 1;
    }
    const lastIdx = conversation.messages.length - 1;
    if (lastIdx >= 0) {
      conversation.messages[lastIdx].problemResult =
        results.wasCorrect ? 'correct' : (results.wasSkipped ? 'skipped' : 'incorrect');
    }
  }

  // Mark scaffold advance point
  if (extracted.scaffoldAdvance && conversation.messages.length > 0) {
    conversation.messages[conversation.messages.length - 1].scaffoldAdvanced = true;
  }

  conversation.lastActivity = new Date();

  // Persist session mood for dashboard visibility
  if (sessionMood && sessionMood.trajectory) {
    conversation.sessionMood = {
      trajectory: sessionMood.trajectory,
      energy: sessionMood.energy,
      momentum: sessionMood.momentum,
      inFlow: sessionMood.inFlow,
      fatigueSignal: sessionMood.fatigueSignal,
      turnCount: sessionMood.turnCount,
      lastUpdated: new Date(),
    };
  }

  // Struggle detection
  try {
    const { detectStruggle, detectTopic } = require('../activitySummarizer');
    conversation.currentTopic = detectTopic(conversation.messages);
    const struggleInfo = detectStruggle(conversation.messages.slice(-10));
    if (struggleInfo.isStruggling) {
      conversation.alerts = conversation.alerts || [];
      const recentAlert = conversation.alerts.find(a =>
        a.type === 'struggle' && !a.acknowledged &&
        (Date.now() - new Date(a.timestamp).getTime()) < 10 * 60 * 1000
      );
      if (!recentAlert) {
        conversation.alerts.push({
          type: 'struggle',
          message: `Struggling with ${struggleInfo.strugglingWith}`,
          timestamp: new Date(),
          acknowledged: false,
          severity: struggleInfo.severity,
        });
      }
      conversation.strugglingWith = struggleInfo.strugglingWith;
    }
  } catch (err) {
    console.error('[Persist] Struggle detection error:', err.message);
  }

  // Clean invalid messages
  if (conversation.messages && Array.isArray(conversation.messages)) {
    conversation.messages = conversation.messages.filter(msg =>
      msg.content && typeof msg.content === 'string' && msg.content.trim() !== ''
    );
  }

  await conversation.save();

  // ── 8. XP calculations (via shared xpEngine) ──
  results.xpBreakdown = computeXpBreakdown({
    wasCorrect: results.wasCorrect,
    recentMessages: conversation.messages.slice(-6),
    extracted,
    userLevel: user.level,
    isCourseSession: !!user.activeCourseSessionId,
  });

  const xpResult = applyXpToUser(user, results.xpBreakdown);
  results.leveledUp = xpResult.leveledUp;
  results.tutorsUnlocked = xpResult.tutorsUnlocked;

  // Badge progress
  if (user.masteryProgress?.activeBadge && results.problemAnswered) {
    updateBadgeProgress(user, results.wasCorrect);
  }

  // ── 9. AI time tracking ──
  if (aiProcessingSeconds > 0) {
    const previousWeekly = user.weeklyAISeconds || 0;
    const updatedWeekly = previousWeekly + aiProcessingSeconds;
    const aiTimeUpdate = { $inc: { weeklyAISeconds: aiProcessingSeconds, totalAISeconds: aiProcessingSeconds } };

    const FREE_WEEKLY = 30 * 60;
    const packStillValid = (user.subscriptionTier === 'pack_60' || user.subscriptionTier === 'pack_120') &&
      user.packSecondsRemaining > 0 &&
      (!user.packExpiresAt || new Date() <= user.packExpiresAt);

    if (packStillValid) {
      const prevPaid = Math.max(0, previousWeekly - FREE_WEEKLY);
      const newPaid = Math.max(0, updatedWeekly - FREE_WEEKLY);
      const deduction = newPaid - prevPaid;
      if (deduction > 0) aiTimeUpdate.$inc.packSecondsRemaining = -deduction;
    }

    try {
      const User = require('../../models/user');
      await User.findByIdAndUpdate(user._id, aiTimeUpdate);
    } catch (err) {
      console.error('[Persist] AI time tracking error:', err);
    }

    results.aiTimeUsed = aiProcessingSeconds;
    results.freeWeeklySecondsRemaining =
      (!user.subscriptionTier || user.subscriptionTier === 'free')
        ? Math.max(0, FREE_WEEKLY - updatedWeekly)
        : null;
  }

  // ── Persist cognitive load snapshot ──
  if (evidence?.cognitiveLoad && evidence.cognitiveLoad.load != null) {
    if (!user.learningEngines) {
      user.learningEngines = { bkt: {}, fsrs: {}, consistency: {}, cognitiveLoadHistory: [], interleavingStats: {} };
    }
    if (!user.learningEngines.cognitiveLoadHistory) {
      user.learningEngines.cognitiveLoadHistory = [];
    }
    const sessionMinutes = conversation.createdAt
      ? (Date.now() - new Date(conversation.createdAt).getTime()) / 60000
      : 0;
    user.learningEngines.cognitiveLoadHistory.push({
      date: new Date(),
      avgLoad: evidence.cognitiveLoad.load,
      peakLoad: Math.max(
        evidence.cognitiveLoad.load,
        ...(user.learningEngines.cognitiveLoadHistory
          .filter(h => h.date && (Date.now() - new Date(h.date).getTime()) < 3600000)
          .map(h => h.peakLoad || 0))
      ),
      level: evidence.cognitiveLoad.level,
      sessionMinutes: Math.round(sessionMinutes),
    });
    // Keep last 50 snapshots
    if (user.learningEngines.cognitiveLoadHistory.length > 50) {
      user.learningEngines.cognitiveLoadHistory = user.learningEngines.cognitiveLoadHistory.slice(-50);
    }
    user.markModified('learningEngines.cognitiveLoadHistory');
  }

  // Save user
  await user.save();

  // Level correction safety net
  let correctLevel = 1;
  while (user.xp >= BRAND_CONFIG.cumulativeXpForLevel(correctLevel + 1)) correctLevel++;
  if (user.level !== correctLevel) {
    user.level = correctLevel;
    await user.save();
  }

  return results;
}

/**
 * Update skill mastery from a <SKILL_MASTERED:skillId> tag.
 * Records it as evidence for the 4-pillar system.
 */
function updateSkillMastery(user, skillId, observation, conversation) {
  user.skillMastery = user.skillMastery || new Map();
  const existing = user.skillMastery.get(skillId) || {};

  const pillars = existing.pillars || {
    accuracy: { correct: 0, total: 0, percentage: 0, threshold: 0.90 },
    independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3, autoStepUsed: false },
    transfer: { contextsAttempted: [], contextsRequired: 3, formatVariety: false },
    retention: { retentionChecks: [], failed: false },
  };

  // Record correct demonstration
  pillars.accuracy.correct = (pillars.accuracy.correct || 0) + 1;
  pillars.accuracy.total = (pillars.accuracy.total || 0) + 1;
  pillars.accuracy.percentage = pillars.accuracy.total > 0
    ? pillars.accuracy.correct / pillars.accuracy.total : 0;

  // Independence: check if hints were used recently
  const recentMsgs = conversation.messages.slice(-6);
  const usedHint = recentMsgs.some(msg =>
    msg.role === 'user' && /\b(hint|help|stuck|don'?t know|idk|confused)\b/i.test(msg.content)
  );
  if (usedHint) pillars.independence.hintsUsed = (pillars.independence.hintsUsed || 0) + 1;

  // Transfer: detect context type
  if (observation?.problemContext && !pillars.transfer.contextsAttempted.includes(observation.problemContext)) {
    pillars.transfer.contextsAttempted.push(observation.problemContext);
  }

  // Calculate mastery score
  const accuracyScore = Math.min(pillars.accuracy.percentage / 0.90, 1.0);
  const independenceScore = pillars.independence.hintsUsed <= pillars.independence.hintThreshold ? 1.0
    : Math.max(0, 1.0 - (pillars.independence.hintsUsed - pillars.independence.hintThreshold) * 0.15);
  const transferScore = Math.min(pillars.transfer.contextsAttempted.length / pillars.transfer.contextsRequired, 1.0);
  const masteryScore = Math.round(((accuracyScore + independenceScore + transferScore) / 3) * 100);

  // Determine status
  const meetsAccuracy = pillars.accuracy.percentage >= 0.90 && pillars.accuracy.total >= 3;
  const meetsIndependence = pillars.independence.hintsUsed <= pillars.independence.hintThreshold;
  const meetsTransfer = pillars.transfer.contextsAttempted.length >= pillars.transfer.contextsRequired;
  const allPillarsMet = meetsAccuracy && meetsIndependence && meetsTransfer;

  let newStatus = existing.status || 'practicing';
  if (allPillarsMet) newStatus = 'mastered';
  else if (pillars.accuracy.total >= 2) newStatus = 'practicing';
  else newStatus = 'learning';

  user.skillMastery.set(skillId, {
    ...existing,
    status: newStatus,
    masteryScore,
    masteryType: 'verified',
    lastPracticed: new Date(),
    consecutiveCorrect: (existing.consecutiveCorrect || 0) + 1,
    totalAttempts: (existing.totalAttempts || 0) + 1,
    masteredDate: newStatus === 'mastered' ? (existing.masteredDate || new Date()) : existing.masteredDate,
    pillars,
    notes: `AI-verified demonstration (${pillars.accuracy.correct}/${pillars.accuracy.total} correct)`,
  });

  // Add to recent wins if newly mastered
  if (newStatus === 'mastered' && existing.status !== 'mastered') {
    if (!user.learningProfile.recentWins) user.learningProfile.recentWins = [];
    const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    user.learningProfile.recentWins.unshift({ skill: skillId, description: `Mastered ${displayName}`, date: new Date() });
    user.learningProfile.recentWins = user.learningProfile.recentWins.slice(0, 10);
    user.markModified('learningProfile');
  }

  user.markModified('skillMastery');
}

/**
 * Process a single IEP goal progress update.
 */
function processIepGoalUpdate(user, goalIdentifier, progressChange) {
  let targetGoal = null;
  let goalIndex = -1;

  // Try index first
  const idx = parseInt(goalIdentifier, 10);
  if (!isNaN(idx) && idx >= 0 && idx < user.iepPlan.goals.length) {
    targetGoal = user.iepPlan.goals[idx];
    goalIndex = idx;
  } else {
    // Find by description
    for (let i = 0; i < user.iepPlan.goals.length; i++) {
      if (user.iepPlan.goals[i].description?.toLowerCase().includes(goalIdentifier.toLowerCase())) {
        targetGoal = user.iepPlan.goals[i];
        goalIndex = i;
        break;
      }
    }
  }

  if (!targetGoal || targetGoal.status !== 'active') return null;

  const oldProgress = targetGoal.currentProgress || 0;
  const newProgress = Math.max(0, Math.min(100, oldProgress + progressChange));
  targetGoal.currentProgress = newProgress;

  if (!targetGoal.history) targetGoal.history = [];
  targetGoal.history.push({ date: new Date(), editorId: user._id, field: 'currentProgress', from: oldProgress, to: newProgress });

  if (newProgress >= 100 && targetGoal.status === 'active') {
    targetGoal.status = 'completed';
  }

  return { goalIndex, description: targetGoal.description, oldProgress, newProgress, change: progressChange, completed: newProgress >= 100 };
}

/**
 * Update badge progress when a problem is answered.
 */
function updateBadgeProgress(user, wasCorrect) {
  const badge = user.masteryProgress.activeBadge;
  badge.problemsCompleted = (badge.problemsCompleted || 0) + 1;
  if (wasCorrect) badge.problemsCorrect = (badge.problemsCorrect || 0) + 1;

  // Check for badge completion
  const accuracy = badge.problemsCorrect / badge.problemsCompleted;
  if (badge.problemsCompleted >= badge.requiredProblems && accuracy >= badge.requiredAccuracy) {
    if (!user.badges) user.badges = [];
    const alreadyEarned = user.badges.find(b => b.badgeId === badge.badgeId);
    if (!alreadyEarned) {
      user.badges.push({ badgeId: badge.badgeId, earnedDate: new Date(), score: Math.round(accuracy * 100) });
      user.xp = (user.xp || 0) + 500; // Badge XP bonus
    }
  }

  user.markModified('masteryProgress');
}

module.exports = {
  persist,
  updateSkillMastery,
  processIepGoalUpdate,
  updateBadgeProgress,
};
