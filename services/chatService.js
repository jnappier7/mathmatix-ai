// services/chatService.js
// Business logic for chat operations
// Extracted from routes/chat.js for better testability and reusability

const logger = require('../utils/logger').child({ service: 'chat-service' });
const Conversation = require('../models/conversation');
const User = require('../models/user');

/**
 * Get or create active conversation for user
 * @param {string} userId - User ID
 * @param {boolean} isMastery - Is this a mastery mode conversation
 * @returns {Promise<Conversation>} Active conversation
 */
async function getOrCreateConversation(userId, isMastery = false) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const conversationField = isMastery ? 'activeMasteryConversationId' : 'activeConversationId';
    let conversation;

    // Try to get existing conversation
    if (user[conversationField]) {
      conversation = await Conversation.findById(user[conversationField]);
    }

    // Create new conversation if none exists
    if (!conversation) {
      conversation = new Conversation({
        userId,
        messages: [],
        isMastery
      });

      await conversation.save();

      user[conversationField] = conversation._id;
      await user.save();

      logger.info('Created new conversation', {
        userId,
        conversationId: conversation._id,
        isMastery
      });
    }

    return conversation;
  } catch (error) {
    logger.error('Failed to get/create conversation', {
      userId,
      isMastery,
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

module.exports = {
  getOrCreateConversation,
  addMessage,
  validateMessage,
  filterContent,
  getConversationHistory,
  clearConversation
};
