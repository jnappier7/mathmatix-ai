// services/sessionService.js
// Comprehensive session management and tracking
// Handles session lifecycle, idle timeout, summaries, and auto-save

const logger = require('../utils/logger').child({ service: 'session-service' });
const User = require('../models/user');
const Conversation = require('../models/conversation');
const {
  generateSessionSummary: generateAISummary,
  detectTopic,
  calculateProblemStats,
  detectStruggle
} = require('../utils/activitySummarizer');

/**
 * Session configuration
 */
const SESSION_CONFIG = {
  IDLE_TIMEOUT: 20 * 60 * 1000, // 20 minutes in milliseconds
  WARNING_BEFORE_TIMEOUT: 2 * 60 * 1000, // Warn 2 minutes before timeout
  HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds
};

/**
 * Generate session summary for a user
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {object} sessionData - Session metrics
 * @returns {Promise<object>} Session summary
 */
async function generateSessionSummary(userId, sessionId, sessionData = {}) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const summary = {
      sessionId,
      userId,
      username: user.username,
      role: user.role,
      startTime: sessionData.startTime || new Date(),
      endTime: new Date(),
      duration: sessionData.duration || 0,
      metrics: {
        messagesExchanged: sessionData.messagesExchanged || 0,
        problemsAttempted: sessionData.problemsAttempted || 0,
        problemsCorrect: sessionData.problemsCorrect || 0,
        xpEarned: sessionData.xpEarned || 0,
        badgesEarned: sessionData.badgesEarned || 0,
        hintsUsed: sessionData.hintsUsed || 0,
        masteryProgress: sessionData.masteryProgress || null,
      },
      endReason: sessionData.endReason || 'logout',
    };

    // Calculate accuracy
    if (summary.metrics.problemsAttempted > 0) {
      summary.metrics.accuracy =
        (summary.metrics.problemsCorrect / summary.metrics.problemsAttempted * 100).toFixed(1);
    }

    logger.info('Session summary generated', {
      userId,
      sessionId,
      duration: summary.duration,
      endReason: summary.endReason
    });

    return summary;
  } catch (error) {
    logger.error('Failed to generate session summary', { userId, sessionId, error });
    throw error;
  }
}

/**
 * Save mastery mode progress on logout
 * @param {string} userId - User ID
 * @param {object} progressData - Current mastery progress
 * @returns {Promise<boolean>} Success status
 */
async function saveMasteryProgress(userId, progressData) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Update mastery progress
    if (progressData.activeBadge) {
      user.masteryProgress = user.masteryProgress || {};
      user.masteryProgress.activeBadge = progressData.activeBadge;
      user.masteryProgress.lastUpdated = new Date();
    }

    // Save conversation state if in mastery mode
    if (user.activeMasteryConversationId && progressData.conversationState) {
      const conversation = await Conversation.findById(user.activeMasteryConversationId);
      if (conversation) {
        conversation.masteryState = progressData.conversationState;
        await conversation.save();
      }
    }

    await user.save();

    logger.info('Mastery progress auto-saved', {
      userId,
      badgeId: progressData.activeBadge?.badgeId,
      progress: progressData.activeBadge?.progress
    });

    return true;
  } catch (error) {
    logger.error('Failed to save mastery progress', { userId, error });
    return false;
  }
}

/**
 * Send session summary to relevant dashboards
 * @param {object} summary - Session summary
 * @returns {Promise<void>}
 */
async function notifyDashboards(summary) {
  try {
    const user = await User.findById(summary.userId);

    if (!user) {
      return;
    }

    const notifications = [];

    // Notify parents if student
    if (user.role === 'student' && user.parentIds && user.parentIds.length > 0) {
      for (const parentId of user.parentIds) {
        notifications.push({
          type: 'session_summary',
          recipientId: parentId,
          recipientRole: 'parent',
          data: summary,
          timestamp: new Date()
        });
      }
    }

    // Notify teacher if assigned
    if (user.teacherId) {
      notifications.push({
        type: 'session_summary',
        recipientId: user.teacherId,
        recipientRole: 'teacher',
        data: summary,
        timestamp: new Date()
      });
    }

    // Notify admin (store in admin dashboard feed)
    notifications.push({
      type: 'session_summary',
      recipientRole: 'admin',
      data: summary,
      timestamp: new Date()
    });

    // TODO: Store notifications in database
    // This would require a Notification model
    // For now, just log them

    logger.info('Dashboard notifications queued', {
      userId: summary.userId,
      notificationCount: notifications.length
    });

    return notifications;
  } catch (error) {
    logger.error('Failed to notify dashboards', { summary, error });
  }
}

/**
 * Handle session end (logout, timeout, tab close)
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {string} reason - End reason (logout|timeout|browser_close|tab_close)
 * @param {object} sessionData - Session metrics
 * @returns {Promise<object>} Session summary
 */
async function endSession(userId, sessionId, reason, sessionData = {}) {
  try {
    sessionData.endReason = reason;

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Find and update the active conversation with AI-generated summary
    const activeConversation = await Conversation.findOne({
      userId: userId,
      isActive: true
    });

    if (activeConversation && activeConversation.messages.length > 0) {
      try {
        // Update tracking fields one final time (only if not already set)
        if (!activeConversation.currentTopic) {
          activeConversation.currentTopic = detectTopic(activeConversation.messages);
        }

        // IMPROVED: Use stored stats if available (more accurate than recalculating)
        // Only recalculate if stats are missing (old conversations)
        if (!activeConversation.problemsAttempted || activeConversation.problemsAttempted === 0) {
          const stats = calculateProblemStats(activeConversation.messages);
          activeConversation.problemsAttempted = stats.attempted;
          activeConversation.problemsCorrect = stats.correct;
        }

        // Detect if struggling
        const struggleInfo = detectStruggle(activeConversation.messages.slice(-10));
        if (struggleInfo.isStruggling) {
          activeConversation.strugglingWith = struggleInfo.strugglingWith;
        }

        // Generate AI-powered session summary
        const studentName = `${user.firstName} ${user.lastName}`;
        const aiSummary = await generateAISummary(activeConversation, studentName);
        activeConversation.summary = aiSummary;

        // Mark conversation as inactive
        activeConversation.isActive = false;
        activeConversation.lastActivity = new Date();

        await activeConversation.save();

        logger.info('Conversation summary generated', {
          conversationId: activeConversation._id,
          userId,
          topic: activeConversation.currentTopic,
          problemsAttempted: activeConversation.problemsAttempted,
          problemsCorrect: activeConversation.problemsCorrect,
          summary: aiSummary.substring(0, 100)
        });
      } catch (error) {
        logger.error('Failed to generate conversation summary', { userId, error });
        // Still mark as inactive even if summary fails, with a basic summary
        activeConversation.isActive = false;
        activeConversation.summary = `Session completed - ${activeConversation.activeMinutes || 0} minutes`;
        await activeConversation.save();
      }
    }

    // Generate basic session summary for metrics
    const summary = await generateSessionSummary(userId, sessionId, sessionData);

    // Save mastery progress if applicable
    if (sessionData.masteryProgress) {
      await saveMasteryProgress(userId, sessionData.masteryProgress);
    }

    // Notify relevant dashboards
    await notifyDashboards(summary);

    logger.info('Session ended', {
      userId,
      sessionId,
      reason,
      duration: summary.duration
    });

    return summary;
  } catch (error) {
    logger.error('Failed to end session', { userId, sessionId, reason, error });
    throw error;
  }
}

/**
 * Track session heartbeat (called periodically from frontend)
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {object} metrics - Current session metrics
 * @returns {Promise<object>} Heartbeat response
 */
async function recordHeartbeat(userId, sessionId, metrics = {}) {
  try {
    // Update last activity time
    const user = await User.findById(userId);

    if (!user) {
      return { error: 'User not found' };
    }

    user.lastActivityTime = new Date();
    await user.save();

    // Calculate time until timeout
    const timeUntilTimeout = SESSION_CONFIG.IDLE_TIMEOUT;
    const shouldWarn = false; // Frontend will handle warning based on last activity

    return {
      success: true,
      timeUntilTimeout,
      shouldWarn,
      sessionId
    };
  } catch (error) {
    logger.error('Failed to record heartbeat', { userId, sessionId, error });
    return { error: error.message };
  }
}

/**
 * Clean up stale sessions that were never properly ended
 * Sessions older than the threshold with isActive: true get summaries generated
 * @param {number} staleThresholdMinutes - Minutes of inactivity before considered stale (default: 60)
 * @returns {Promise<number>} Number of sessions cleaned up
 */
async function cleanupStaleSessions(staleThresholdMinutes = 60) {
  try {
    const staleThreshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

    // Find all stale active sessions
    const staleSessions = await Conversation.find({
      isActive: true,
      lastActivity: { $lt: staleThreshold },
      messages: { $exists: true, $ne: [] }
    }).limit(50); // Process in batches

    let cleanedCount = 0;

    for (const session of staleSessions) {
      try {
        // Get the user for this session
        const user = await User.findById(session.userId);
        if (!user) {
          // No user, just mark as inactive
          session.isActive = false;
          session.summary = 'Session ended (user not found)';
          await session.save();
          cleanedCount++;
          continue;
        }

        // Update tracking fields if not set
        if (!session.currentTopic) {
          session.currentTopic = detectTopic(session.messages);
        }

        // Use stored stats or recalculate
        if (!session.problemsAttempted || session.problemsAttempted === 0) {
          const stats = calculateProblemStats(session.messages);
          session.problemsAttempted = stats.attempted;
          session.problemsCorrect = stats.correct;
        }

        // Generate AI summary
        const studentName = `${user.firstName} ${user.lastName}`;
        try {
          const aiSummary = await generateAISummary(session, studentName);
          session.summary = aiSummary;
        } catch (summaryError) {
          // Fallback summary if AI fails
          session.summary = `${studentName} worked on ${session.currentTopic || 'mathematics'} for ${session.activeMinutes || 0} minutes. ` +
            `${session.problemsAttempted > 0 ? `Attempted ${session.problemsAttempted} problems with ${session.problemsCorrect || 0} correct.` : 'Session ended due to inactivity.'}`;
        }

        // Mark as inactive
        session.isActive = false;
        await session.save();

        cleanedCount++;
        logger.info('Stale session cleaned up', {
          conversationId: session._id,
          userId: session.userId,
          lastActivity: session.lastActivity
        });
      } catch (sessionError) {
        logger.error('Error cleaning up stale session', {
          conversationId: session._id,
          error: sessionError.message
        });
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} stale sessions`);
    }

    return cleanedCount;
  } catch (error) {
    logger.error('Failed to cleanup stale sessions', { error });
    return 0;
  }
}

module.exports = {
  SESSION_CONFIG,
  generateSessionSummary,
  saveMasteryProgress,
  notifyDashboards,
  endSession,
  recordHeartbeat,
  cleanupStaleSessions
};
