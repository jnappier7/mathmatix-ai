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
const { parseCleanProblem } = require('../mathSolver');
const { computeXpBreakdown, applyXpToUser } = require('./xpEngine');
const { emitGamificationEvent, bumpDailyStreak } = require('../gamificationEvents');
const { canonicalProblemId, contentHash, recordShownProblem } = require('../problemTracking');
const { getNextActions } = require('../nextActionSuggestions');
const { checkForInterventionAlert } = require('../interventionAlerts');
const { getReviewSummary } = require('../smartReviewQueue');
const { canonicalSkillId } = require('../skillCanonicalizer');
const { updateSkillMastery: engineUpdateSkillMastery, initializeSkillMastery } = require('../masteryEngine');
const { advanceRung, currentRung, clearsPrerequisites } = require('../skillRung');
const { getSkillMasteryEntry, setSkillMasteryEntry, decodedMasteryMap } = require('../masteryGuard');

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
/**
 * Build a canonical, wrapper-free string for a detected math problem so
 * dedup hashes collide across sessions even when Maya's surrounding text
 * varies. Returns null when we can't extract anything useful — caller
 * falls back to responseText.
 *
 * Shape-by-shape because processMathMessage returns different keys per
 * problem type (limits use {numerator, denominator, approachValue, raw};
 * evaluation uses {expression}; arithmetic uses {left, operator, right};
 * etc.). We don't need a complete switchboard — just the types where the
 * wrapper-text fallback was causing dedup misses in practice.
 */
function extractCanonicalProblemText(problem) {
  if (!problem) return null;
  switch (problem.type) {
    case 'limit':
      // raw is the expression as the detector pulled it; combined with
      // approachValue it uniquely identifies the limit math.
      if (problem.raw && typeof problem.approachValue === 'number') {
        return `lim x→${problem.approachValue} of ${problem.raw}`;
      }
      return problem.raw || null;
    case 'evaluation':
    case 'expand_polynomial':
    case 'factor_quadratic':
    case 'factor_diff_of_squares':
      return problem.expression || null;
    case 'arithmetic':
      if (problem.left !== undefined && problem.right !== undefined && problem.operator) {
        return `${problem.left} ${problem.operator} ${problem.right}`;
      }
      return null;
    case 'quadratic_equation':
    case 'general_linear':
      return problem.expression || problem.equation || null;
    default:
      return problem.expression || problem.raw || null;
  }
}

/**
 * Decide whether the current graded answer is a RETRY of the problem already in
 * progress (so it should not be counted as a new first-try problem).
 *
 * lastProblemState holds the in-progress problem: attemptCount bumps on each
 * wrong try and the state is cleared on a correct answer. A retry therefore
 * requires a prior wrong attempt (attemptCount >= 1). To avoid mis-counting the
 * case where a student abandons a wrong problem and moves to a new one (stale
 * state), we also require the problem text to match when both are available;
 * when it can't be compared, we defer to the in-progress flag.
 *
 * @param {Object|null} lastProblemState
 * @param {Object} diagnosis
 * @returns {boolean}
 */
function isSameProblemRetry(lastProblemState, diagnosis) {
  if (!lastProblemState || (lastProblemState.attemptCount || 0) < 1) return false;
  const prev = String(lastProblemState.problemText || '').trim().toLowerCase();
  const curr = String(diagnosis?.problemInfo?.content || '').trim().toLowerCase();
  if (prev && curr) {
    const a = prev.slice(0, 60);
    const b = curr.slice(0, 60);
    return prev.includes(b) || curr.includes(a);
  }
  return true;
}

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
    problemPartial: false,
    leveledUp: false,
    tutorsUnlocked: [],
    avatarBuilderUnlocked: false,
    iepGoalUpdates: [],
    courseProgressUpdate: null,
  };

  // ── 1. Process problem result ──
  // Prefer structured diagnosis over tag-based detection
  if (diagnosis && diagnosis.type === 'correct_partial') {
    // Correct-but-incomplete multi-root answer: the problem is still in
    // progress. Do NOT count it as a completed attempt and do NOT record it as
    // 'incorrect' — that would poison recentWrongCount and trigger a false
    // difficulty downgrade. Progress is tracked via lastProblemState below.
    results.problemPartial = true;
  } else if (diagnosis && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
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
    const { skillId, justProved } = updateSkillMastery(user, extracted.skillMastered, observation, conversation);
    // Proving a skill clears everything beneath it, so a student never re-grinds
    // a prerequisite they have just demonstrated they own. Awaited but guarded:
    // a cascade failure must never cost the student the turn they just earned.
    if (justProved) {
      try {
        await cascadeBeneath(user, skillId);
      } catch (err) {
        console.error('[Persist] cascade failed for %s:', skillId, err);
      }
    }
  }

  if (extracted.skillStarted) {
    user.skillMastery = user.skillMastery || new Map();
    // key on the canonical (unified) skill id so learning/mastery state for one
    // concept never splits across a legacy id and its unified id
    const startedId = canonicalSkillId(extracted.skillStarted);
    const prior = getSkillMasteryEntry(user, startedId);
    // MERGE, never replace. This used to assign a fresh object, so revisiting a
    // skill the student had already worked on wiped its pillars, rung and
    // rungHistory — silently destroying the evidence behind an earned rung.
    if (!prior) {
      const entry = initializeSkillMastery(startedId);
      advanceRung(entry, 'learned', { via: 'lesson' });
      delete entry.__rungResult;
      entry.masteryScore = 0.3;
      entry.notes = 'Currently learning with AI';
      setSkillMasteryEntry(user, startedId, entry);
    } else if (currentRung(prior) === 'none') {
      advanceRung(prior, 'learned', { via: 'lesson' });
      delete prior.__rungResult;
      prior.status = prior.status === 'ready' || !prior.status ? 'learning' : prior.status;
      prior.notes = 'Currently learning with AI';
      setSkillMasteryEntry(user, startedId, prior);
    }
    // A skill already at learned-or-better needs no downgrade for being revisited.
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

  // Detect and store structured problem metadata on the AI message.
  // This lets the diagnose stage read it directly on the next turn instead of
  // re-parsing the AI's natural language text with fragile regex patterns.
  try {
    // parseCleanProblem strips conversational prose before matching so
    // a tutor turn like "Here's another problem: Solve 4x+3=27" stores
    // correctAnswer=6 instead of a bogus 331 from the evaluation
    // catch-all. The bogus answer would otherwise poison the next
    // turn's diagnose stage and trigger an incorrect "answer wrong"
    // injection on a right answer.
    const mathResult = parseCleanProblem(responseText);
    if (mathResult.hasMath && mathResult.solution?.success) {
      const lastIdx = conversation.messages.length - 1;
      const problemType = mathResult.problem.type;
      const correctAnswer = String(mathResult.solution.answer);

      conversation.messages[lastIdx].problemInfo = {
        type: problemType,
        correctAnswer,
        ...(Array.isArray(mathResult.solution.roots) && mathResult.solution.roots.length > 1
          ? { roots: mathResult.solution.roots }
          : {}),
      };

      // Record this AI-generated problem in the user's recent-problems history
      // so warmup/lesson prompts can avoid re-serving it within 7 days.
      //
      // The canonical content must come from the math itself, not the wrapper
      // text — "Hey Jason! Let's warm up with lim x→1 (x²-1)/(x-1)" and
      // "Welcome back! Try this one: lim x→1 (x²-1)/(x-1)" should collide.
      // Fallback to responseText only when no math is extractable.
      const problemContent = extractCanonicalProblemText(mathResult.problem) || responseText;
      const skillIdForRecord = observation?.activeSkill?.skillId
        || decision?.activeSkill?.skillId
        || null;
      const pid = canonicalProblemId({
        skillId: skillIdForRecord || problemType,
        content: problemContent,
        answer: correctAnswer,
      });
      recordShownProblem(user, {
        problemId: pid,
        skillId: skillIdForRecord,
        source: 'ai-text',
        contentHash: contentHash(problemContent),
        content: problemContent,
      });
      user.markModified('recentProblems');
    }
  } catch (_) {
    // Non-fatal — worst case we fall back to re-parsing in diagnose
  }

  if (results.problemAnswered) {
    conversation.problemsAttempted = (conversation.problemsAttempted || 0) + 1;
    if (results.wasCorrect) {
      conversation.problemsCorrect = (conversation.problemsCorrect || 0) + 1;
    }

    // First-try metric — the honest accuracy signal. Count each PROBLEM once,
    // scored on the first attempt. lastProblemState still reflects the PRIOR
    // turn here (it's updated below), so if it holds this same problem with a
    // prior wrong attempt, this turn is a retry and must not open a new slot.
    // Skips aren't a genuine attempt, so they're excluded entirely.
    if (!results.wasSkipped && !isSameProblemRetry(conversation.lastProblemState, diagnosis)) {
      conversation.firstTryAttempted = (conversation.firstTryAttempted || 0) + 1;
      if (results.wasCorrect) {
        conversation.firstTryCorrect = (conversation.firstTryCorrect || 0) + 1;
      }
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

  // ── 7b. Persist last problem state for session continuity ──
  if (results.problemPartial && diagnosis.multiRoot) {
    // Correct-but-incomplete multi-root answer: accumulate which roots the
    // student has supplied so far so the next turn knows what's still missing.
    // This is NOT a failed attempt, so attemptCount is left unchanged.
    const existingState = conversation.lastProblemState || {};
    conversation.lastProblemState = {
      problemText: existingState.problemText || (diagnosis.problemInfo?.content
        ? diagnosis.problemInfo.content.substring(0, 200) : null),
      attemptCount: existingState.attemptCount || 0,
      lastAttempt: diagnosis.answer,
      misconception: existingState.misconception || null,
      foundRoots: diagnosis.multiRoot.foundRoots,
      totalRoots: diagnosis.multiRoot.totalCount,
      updatedAt: new Date(),
    };
    conversation.markModified?.('lastProblemState');
  } else if (results.problemAnswered && !results.wasCorrect) {
    // Student is still working on this problem — save state for resume.
    // Preserve any roots already found so a wrong guess mid-set doesn't wipe
    // the student's prior correct roots.
    const existingState = conversation.lastProblemState || {};
    conversation.lastProblemState = {
      problemText: existingState.problemText || (diagnosis.problemInfo?.content
        ? diagnosis.problemInfo.content.substring(0, 200) : null),
      attemptCount: (existingState.attemptCount || 0) + 1,
      lastAttempt: diagnosis.answer,
      misconception: diagnosis.misconception?.name || null,
      ...(Array.isArray(existingState.foundRoots) ? { foundRoots: existingState.foundRoots } : {}),
      ...(existingState.totalRoots ? { totalRoots: existingState.totalRoots } : {}),
      updatedAt: new Date(),
    };
    conversation.markModified?.('lastProblemState');
  } else if (results.wasCorrect) {
    // Problem solved — clear state
    conversation.lastProblemState = null;
    conversation.markModified?.('lastProblemState');
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
      emotionalState: sessionMood.emotionalState?.state || null,
      emotionalConfidence: sessionMood.emotionalState?.confidence || 0,
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
  results.avatarBuilderUnlocked = xpResult.avatarBuilderUnlocked;
  results.coinsAwarded = xpResult.coinsAwarded || 0;

  // Badge progress + mastery completion check
  if (user.masteryProgress?.activeBadge && results.problemAnswered) {
    const masteryResult = updateBadgeProgress(user, results.wasCorrect);
    if (masteryResult.completed) {
      results.masteryCompleted = true;
      results.masterySuccess = masteryResult.success;
      results.badgeAwarded = masteryResult.badgeAwarded;
    }
  }

  // ── 8a-streak. Daily streak ──
  // Bump unconditionally on any persist call — reaching this stage means the
  // student sent a substantive message and received a reply. Decoupled from
  // problemAnswered because the turn-classifier is imperfect; gating the
  // streak on it left long-running users stuck at 2 days for months.
  const streakResult = bumpDailyStreak(user);
  results.streak = {
    current: user.dailyQuests?.currentStreak || 0,
    longest: user.dailyQuests?.longestStreak || 0,
    freezeUsed: streakResult.streakFreezeUsed || false,
    lost: streakResult.streakLost || 0,
  };
  user.markModified('dailyQuests');

  // ── 8b. Gamification events (daily quests, weekly challenges) ──
  if (results.problemAnswered) {
    const gamificationResult = emitGamificationEvent(user, 'problemSolved', {
      correct: results.wasCorrect,
      skillId: extracted.skillStarted || extracted.skillMastered || null,
      domain: observation?.skillDomain || null,
    });
    results.gamification = gamificationResult;

    // If a skill was mastered, emit that event too
    if (extracted.skillMastered) {
      emitGamificationEvent(user, 'skillMastered', { skillId: extracted.skillMastered });
    }

    // If a new skill was started, emit that event
    if (extracted.skillStarted) {
      emitGamificationEvent(user, 'newSkillStarted', { skillId: extracted.skillStarted });
      emitGamificationEvent(user, 'skillPracticed', { skillId: extracted.skillStarted });
    }

    // Mark nested objects as modified so Mongoose persists the changes.
    // emitGamificationEvent mutates user.dailyQuests and user.weeklyChallenges
    // in place, but Mongoose won't detect nested changes without this.
    user.markModified('dailyQuests');
    user.markModified('weeklyChallenges');
  }

  // ── 8c. Next Action suggestions ──
  const gamResult = results.gamification || {};
  results.nextActions = getNextActions(user, {
    leveledUp: results.leveledUp || false,
    badgeEarned: !!results.badgeAwarded,
    questCompleted: (gamResult.questsCompleted || []).length > 0,
    streakFreezeUsed: gamResult.streakFreezeUsed || false,
    streakLost: gamResult.streakLost || 0,
  });

  // ── 8d. Intervention alert check ──
  try {
    const interventionAlert = checkForInterventionAlert(user);
    if (interventionAlert) {
      user.lastInterventionAlert = {
        timestamp: interventionAlert.timestamp,
        tier: interventionAlert.tier,
        riskScore: interventionAlert.riskScore,
      };
      results.interventionAlert = interventionAlert;

      // Add alert to the conversation so it shows in teacher's live feed
      conversation.alerts = conversation.alerts || [];
      conversation.alerts.push({
        type: interventionAlert.tier >= 3 ? 'struggle' : 'milestone',
        message: `[Tier ${interventionAlert.tier} Intervention] ${interventionAlert.recommendation}`,
        timestamp: interventionAlert.timestamp,
        acknowledged: false,
        severity: interventionAlert.urgency,
      });
    }
  } catch (err) {
    console.error('[Persist] Intervention alert check error:', err.message);
  }

  // ── 8e. Review summary (FSRS-driven) ──
  try {
    results.reviewSummary = getReviewSummary(user);
  } catch (err) {
    console.error('[Persist] Review summary error:', err.message);
  }

  // ── 9. AI time tracking ──
  // Fair-time floor: a genuine tutoring turn always meters at least
  // AI_TIME_FLOOR_SECONDS. Without this, the quota counts only raw server
  // LLM latency, so a dense multi-turn session on fast gpt-4o-mini (a few
  // seconds per turn) under-counts to near-zero — e.g. a 10-turn, ~12-minute
  // session billed as "2 minutes". Slow turns (gpt-4o vision grading) still
  // bill their true latency via max(). Only real turns are lifted: the
  // aiProcessingSeconds > 0 guard means non-turns still bill nothing.
  const AI_TIME_FLOOR_SECONDS = Number(process.env.AI_TIME_FLOOR_SECONDS) || 30;
  const billedSeconds = aiProcessingSeconds > 0
    ? Math.max(aiProcessingSeconds, AI_TIME_FLOOR_SECONDS)
    : 0;
  if (billedSeconds > 0) {
    const previousWeekly = user.weeklyAISeconds || 0;
    const updatedWeekly = previousWeekly + billedSeconds;
    const aiTimeUpdate = { $inc: { weeklyAISeconds: billedSeconds, totalAISeconds: billedSeconds } };

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

    results.aiTimeUsed = billedSeconds;
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
/**
 * Clear every prerequisite beneath a newly-proved skill.
 *
 * Loads the unified catalog through the shared cache so the graph is the same
 * one the closure engine and the board read. Returns the ids cleared, so the
 * caller can surface the cascade ("Slope unlocked 6 skills") rather than having
 * it happen invisibly.
 */
async function cascadeBeneath(user, skillId) {
  const { configCache } = require('../cache');
  const Skill = require('../../models/skill');
  const { buildGraph, applyProofCascade } = require('../skillClosure');

  const skills = await configCache.getOrSet(
    'skills:unified',
    () => Skill.find({ isActive: true, source: 'unified-taxonomy' }).lean(),
    3600
  );
  if (!skills.length) return [];

  // The closure engine reasons in logical (dotted) ids, so it operates on a
  // decoded view. Entry objects are shared with the stored subdocuments, so
  // in-place mutations already land; newly-cleared keys are written back through
  // the encoder so the Mongoose Map never sees a dot.
  const decoded = decodedMasteryMap(user);
  const { cleared } = applyProofCascade(buildGraph(skills), decoded, skillId);
  for (const clearedId of cleared) {
    setSkillMasteryEntry(user, clearedId, decoded.get(clearedId));
  }
  return cleared;
}

/**
 * Record a verified skill demonstration from a chat turn.
 *
 * This used to be a second, independent implementation of the whole mastery
 * model — its own pillars, its own scoring formula (unweighted mean of three,
 * against masteryEngine's weighted four), and its own thresholds. Its bar was
 * `accuracy >= 0.90 && total >= 3`, so THREE demonstrations was mastery. That is
 * the path that produced "100% mastered" beside a "Continue" button in
 * production, and it is the main tutoring flow — every chat turn runs it.
 *
 * It now delegates to masteryEngine.updateSkillMastery, which delegates rung
 * transitions to utils/skillRung. One model, one set of gates, one receipt.
 *
 * ONE-SIDED EVIDENCE — READ THIS BEFORE TRUSTING `accuracy` HERE.
 * This function is only ever called on `extracted.skillMastered`, i.e. on a
 * success. Incorrect attempts from chat are never recorded against a skill, so
 * `pillars.accuracy.percentage` on this path is 1.0 by construction and the
 * accuracy gate is vacuous. What the ladder actually requires here is therefore
 * "N verified demonstrations across 3 contexts with few hints" — a real bar, but
 * not the one the field name implies. Wiring the diagnose stage's incorrect
 * ANSWER_ATTEMPTs through to the pillars is the fix; until then this comment is
 * the honest description.
 */
function updateSkillMastery(user, rawSkillId, observation, conversation) {
  user.skillMastery = user.skillMastery || new Map();
  // Canonicalize to the unified skill id for storage/lookup; keep the original
  // id only for deriving a readable "recent win" label below.
  const skillId = canonicalSkillId(rawSkillId);
  const existing = getSkillMasteryEntry(user, skillId) || initializeSkillMastery(skillId);
  const wasOwned = clearsPrerequisites(existing);

  // Independence proxy: the student asking for help in recent turns. Weaker than
  // a real hint counter — it reads the student's words, not the tutor's actions.
  const recentMsgs = conversation.messages.slice(-6);
  const usedHint = recentMsgs.some(msg =>
    msg.role === 'user' && /\b(hint|help|stuck|don'?t know|idk|confused)\b/i.test(msg.content)
  );

  const updated = engineUpdateSkillMastery(existing, {
    correct: true,
    hintUsed: usedHint,
    problemContext: observation?.problemContext,
    responseTime: observation?.responseTime
  });

  const justProved = !!updated.__justProved;
  delete updated.__justProved;
  const acc = updated.pillars?.accuracy || {};
  updated.notes = `AI-verified demonstration (${acc.correct || 0}/${acc.total || 0} correct)`;

  setSkillMasteryEntry(user, skillId, updated);

  // Add to recent wins the first time the skill is genuinely owned.
  if (justProved && !wasOwned) {
    if (!user.learningProfile.recentWins) user.learningProfile.recentWins = [];
    // derive the label from the original (kebab) id — nicer than a dotted unified id
    const displayName = rawSkillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    user.learningProfile.recentWins.unshift({ skill: skillId, description: `Mastered ${displayName}`, date: new Date() });
    user.learningProfile.recentWins = user.learningProfile.recentWins.slice(0, 10);
    user.markModified('learningProfile');
  }

  user.markModified('skillMastery');
  return { skillId, justProved };
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
 * Returns mastery completion info so chat.js can send celebration data.
 *
 * Also enforces a staleness valve: if a badge has been attempted well past
 * its required number of problems without reaching the accuracy threshold,
 * we clear it. Otherwise it would stay pinned to the user forever and keep
 * dominating the tutor's focus and the suggestion chips.
 *
 * @returns {{ completed: boolean, success: boolean, badgeAwarded: Object|null, stuckCleared?: boolean }}
 */
function updateBadgeProgress(user, wasCorrect) {
  const { isBadgeStuck, clearActiveBadge } = require('../masteryGuard');

  const badge = user.masteryProgress.activeBadge;
  badge.problemsCompleted = (badge.problemsCompleted || 0) + 1;
  if (wasCorrect) badge.problemsCorrect = (badge.problemsCorrect || 0) + 1;

  user.markModified('masteryProgress');

  // Check for badge completion
  const accuracy = badge.problemsCorrect / badge.problemsCompleted;
  if (badge.problemsCompleted < badge.requiredProblems || accuracy < badge.requiredAccuracy) {
    // Not earned yet — but check if we've been hammering this badge with
    // no path to success. If so, clear it so the next session starts fresh.
    if (isBadgeStuck(badge)) {
      clearActiveBadge(user, 'staleness valve: attempts exceeded threshold without earning');
      return { completed: false, success: false, badgeAwarded: null, stuckCleared: true };
    }
    return { completed: false, success: false, badgeAwarded: null };
  }

  // Badge earned — award it
  if (!user.badges) user.badges = [];
  const alreadyEarned = user.badges.find(b => b.badgeId === badge.badgeId);
  if (alreadyEarned) {
    return { completed: true, success: true, badgeAwarded: null };
  }

  user.badges.push({ badgeId: badge.badgeId, earnedDate: new Date(), score: Math.round(accuracy * 100) });
  user.xp = (user.xp || 0) + 500; // Badge XP bonus
  user.markModified('badges');

  // Unlock skill on skill map (canonical unified id)
  const skillId = canonicalSkillId(badge.skillId);
  if (!user.skillMastery) user.skillMastery = new Map();
  const entry = getSkillMasteryEntry(user, skillId) || initializeSkillMastery(skillId);
  if (!clearsPrerequisites(entry)) {
    // MERGE, never replace. This used to assign a bare object, so earning a badge
    // destroyed the skill's pillars, rung and rungHistory — wiping the receipts
    // for work the student had actually done.
    //
    // A completed badge is a real, gated demonstration (see badgePhaseController),
    // so it proves the skill via 'challenge' rather than being asserted.
    advanceRung(entry, 'proved', {
      via: 'challenge',
      evidence: {
        correct: Math.round(accuracy * (badge.problemsCompleted || 0)),
        total: badge.problemsCompleted || 0,
        hintsUsed: entry.pillars?.independence?.hintsUsed || 0,
        badgeId: badge.badgeId
      }
    });
    delete entry.__rungResult;
    if (clearsPrerequisites(entry)) entry.status = 'mastered';
    setSkillMasteryEntry(user, skillId, entry);
  }

  return {
    completed: true,
    success: true,
    badgeAwarded: {
      badgeId: badge.badgeId,
      badgeName: badge.badgeName,
      tier: badge.tier,
      xpBonus: 500,
      totalBadges: user.badges.length,
    },
  };
}

module.exports = {
  persist,
  updateSkillMastery,
  processIepGoalUpdate,
  updateBadgeProgress,
  isSameProblemRetry,
};
