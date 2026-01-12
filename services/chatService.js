// services/chatService.js
// Business logic for chat operations
// Extracted from routes/chat.js for better testability and reusability

const logger = require('../utils/logger').child({ service: 'chat-service' });
const Conversation = require('../models/conversation');
const User = require('../models/user');

/**
 * Get or create active conversation for user
 * @param {string} userId - User ID
 * @param {object} options - Conversation options { isMastery, isAssessment, topic }
 * @returns {Promise<Conversation>} Active conversation
 */
async function getOrCreateConversation(userId, options = {}) {
  try {
    const { isMastery = false, isAssessment = false, topic = null } = options;
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    let conversation;

    // For topic-based conversations, find or create by topic
    if (topic) {
      conversation = await Conversation.findOne({
        userId,
        topic,
        isActive: true,
        isAssessment: false,
        isMastery: false
      });

      if (!conversation) {
        conversation = new Conversation({
          userId,
          topic,
          conversationType: 'topic',
          conversationName: topic,
          messages: []
        });
        await conversation.save();

        logger.info('Created new topic conversation', {
          userId,
          conversationId: conversation._id,
          topic
        });
      }
    }
    // For assessment conversations
    else if (isAssessment) {
      conversation = await Conversation.findOne({
        userId,
        isAssessment: true,
        isAssessmentComplete: false,
        isActive: true
      });

      if (!conversation) {
        conversation = new Conversation({
          userId,
          isAssessment: true,
          conversationType: 'assessment',
          conversationName: 'Skills Assessment',
          messages: []
        });
        await conversation.save();

        logger.info('Created new assessment conversation', {
          userId,
          conversationId: conversation._id
        });
      }
    }
    // For mastery mode conversations
    else if (isMastery) {
      const conversationField = 'activeMasteryConversationId';

      if (user[conversationField]) {
        conversation = await Conversation.findById(user[conversationField]);
      }

      if (!conversation) {
        conversation = new Conversation({
          userId,
          isMastery: true,
          conversationType: 'mastery',
          conversationName: 'Mastery Mode',
          messages: []
        });
        await conversation.save();

        user[conversationField] = conversation._id;
        await user.save();

        logger.info('Created new mastery conversation', {
          userId,
          conversationId: conversation._id
        });
      }
    }
    // For general conversations (default)
    else {
      const conversationField = 'activeConversationId';

      if (user[conversationField]) {
        conversation = await Conversation.findById(user[conversationField]);
      }

      if (!conversation) {
        conversation = new Conversation({
          userId,
          conversationType: 'general',
          messages: []
        });
        await conversation.save();

        user[conversationField] = conversation._id;
        await user.save();

        logger.info('Created new general conversation', {
          userId,
          conversationId: conversation._id
        });
      }
    }

    // Update last activity
    conversation.lastActivity = new Date();
    await conversation.save();

    return conversation;
  } catch (error) {
    logger.error('Failed to get/create conversation', {
      userId,
      options,
      error
    });
    throw error;
  }
}

/**
 * Add message to conversation
 * @param {string} conversationId - Conversation ID
 * @param {object} message - Message object { role, content }
 * @returns {Promise<Conversation>} Updated conversation
 */
async function addMessage(conversationId, message) {
  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.messages.push({
      role: message.role,
      content: message.content,
      timestamp: new Date()
    });

    await conversation.save();

    logger.debug('Added message to conversation', {
      conversationId,
      role: message.role,
      messageLength: message.content.length
    });

    return conversation;
  } catch (error) {
    logger.error('Failed to add message', {
      conversationId,
      error
    });
    throw error;
  }
}

/**
 * Validate message content
 * @param {string} content - Message content
 * @returns {object} Validation result { valid: boolean, error: string }
 */
function validateMessage(content) {
  const MAX_MESSAGE_LENGTH = 2000;

  if (!content || typeof content !== 'string') {
    return {
      valid: false,
      error: 'Message content is required and must be a string'
    };
  }

  if (content.trim().length === 0) {
    return {
      valid: false,
      error: 'Message cannot be empty'
    };
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`
    };
  }

  return { valid: true };
}

/**
 * Filter unsafe content from message
 * @param {string} content - Message content
 * @returns {object} Filter result { safe: boolean, filtered: string }
 */
function filterContent(content) {
  // Basic content filtering (expand as needed)
  const unsafePatterns = [
    /\b(password|token|api[_-]?key|secret)\b/i,
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
    /\b\d{16}\b/ // Credit card pattern
  ];

  let filtered = content;
  let safe = true;

  for (const pattern of unsafePatterns) {
    if (pattern.test(filtered)) {
      safe = false;
      filtered = filtered.replace(pattern, '[REDACTED]');

      logger.warn('Filtered unsafe content from message', {
        pattern: pattern.toString()
      });
    }
  }

  return { safe, filtered };
}

/**
 * Get conversation history for context
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Max messages to retrieve
 * @returns {Promise<Array>} Message history
 */
async function getConversationHistory(conversationId, limit = 20) {
  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return [];
    }

    // Return last N messages
    const messages = conversation.messages.slice(-limit);

    logger.debug('Retrieved conversation history', {
      conversationId,
      messageCount: messages.length
    });

    return messages;
  } catch (error) {
    logger.error('Failed to get conversation history', {
      conversationId,
      error
    });
    throw error;
  }
}

/**
 * Clear conversation (for new topics)
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Conversation>} Cleared conversation
 */
async function clearConversation(conversationId) {
  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.messages = [];
    await conversation.save();

    logger.info('Cleared conversation', {
      conversationId
    });

    return conversation;
  } catch (error) {
    logger.error('Failed to clear conversation', {
      conversationId,
      error
    });
    throw error;
  }
}

/**
 * Get all active conversations for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of active conversations
 */
async function getUserConversations(userId) {
  try {
    const conversations = await Conversation.find({
      userId,
      isActive: true
    })
    .sort({ lastActivity: -1 })
    .select('_id topic topicEmoji conversationType conversationName lastActivity messages currentTopic');

    return conversations.map(conv => ({
      _id: conv._id,
      topic: conv.topic,
      topicEmoji: conv.topicEmoji,
      conversationType: conv.conversationType,
      name: conv.conversationName || conv.topic || 'General Chat',
      lastActivity: conv.lastActivity,
      messageCount: conv.messages.length,
      currentTopic: conv.currentTopic
    }));
  } catch (error) {
    logger.error('Failed to get user conversations', {
      userId,
      error
    });
    throw error;
  }
}

/**
 * Archive a conversation (set inactive)
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Conversation>} Archived conversation
 */
async function archiveConversation(conversationId) {
  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.isActive = false;
    await conversation.save();

    logger.info('Archived conversation', {
      conversationId
    });

    return conversation;
  } catch (error) {
    logger.error('Failed to archive conversation', {
      conversationId,
      error
    });
    throw error;
  }
}

/**
 * Check if user needs assessment
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if assessment needed
 */
async function needsAssessment(userId) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return false;
    }

    // Check if user has completed assessment
    const completedAssessment = await Conversation.findOne({
      userId,
      isAssessment: true,
      isAssessmentComplete: true
    });

    if (!completedAssessment) {
      return true;
    }

    // Check if assessment is too old (> 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    if (completedAssessment.assessmentResults?.completedAt < ninetyDaysAgo) {
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to check assessment need', {
      userId,
      error
    });
    return false;
  }
}

module.exports = {
  getOrCreateConversation,
  addMessage,
  validateMessage,
  filterContent,
  getConversationHistory,
  clearConversation,
  getUserConversations,
  archiveConversation,
  needsAssessment
};
