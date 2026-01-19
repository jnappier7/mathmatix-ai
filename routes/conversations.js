// routes/conversations.js
// API endpoints for topic-based conversations and assessment

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const {
  getUserConversations,
  getOrCreateConversation,
  archiveConversation,
  needsAssessment
} = require('../services/chatService');
const {
  getNextQuestion,
  checkAnswer,
  calculateAssessmentResults
} = require('../services/assessmentService');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const logger = require('../utils/logger').child({ route: 'conversations' });

/**
 * GET /api/conversations
 * Get all active conversations for the user
 */
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await getUserConversations(userId);

    // Check if assessment is needed
    const assessmentNeeded = await needsAssessment(userId);

    res.json({
      conversations,
      assessmentNeeded
    });
  } catch (error) {
    logger.error('Failed to get conversations', { error });
    res.status(500).json({ message: 'Failed to load conversations' });
  }
});

/**
 * POST /api/conversations
 * Create a new topic-based conversation
 */
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { topic, topicEmoji } = req.body;

    if (!topic) {
      return res.status(400).json({ message: 'Topic is required' });
    }

    const conversation = await getOrCreateConversation(userId, { topic });

    // Update emoji if provided
    if (topicEmoji) {
      conversation.topicEmoji = topicEmoji;
      await conversation.save();
    }

    res.json({
      conversation: {
        _id: conversation._id,
        topic: conversation.topic,
        topicEmoji: conversation.topicEmoji,
        name: conversation.conversationName,
        messageCount: conversation.messages.length
      }
    });
  } catch (error) {
    logger.error('Failed to create conversation', { error });
    res.status(500).json({ message: 'Failed to create conversation' });
  }
});

/**
 * POST /api/conversations/:id/switch
 * Switch to a specific conversation
 */
router.post('/:id/switch', isAuthenticated, validateObjectId('id'), async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = req.params.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Update user's active conversation
    const user = await User.findById(userId);
    user.activeConversationId = conversationId;
    await user.save();

    // Get recent messages (last 50)
    const recentMessages = conversation.messages.slice(-50);

    res.json({
      conversation: {
        _id: conversation._id,
        topic: conversation.topic,
        topicEmoji: conversation.topicEmoji,
        name: conversation.conversationName || conversation.topic || 'General Chat',
        conversationType: conversation.conversationType,
        currentTopic: conversation.currentTopic
      },
      messages: recentMessages
    });
  } catch (error) {
    logger.error('Failed to switch conversation', { error });
    res.status(500).json({ message: 'Failed to switch conversation' });
  }
});

/**
 * DELETE /api/conversations/:id
 * Archive a conversation
 */
router.delete('/:id', isAuthenticated, validateObjectId('id'), async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = req.params.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await archiveConversation(conversationId);

    res.json({ message: 'Conversation archived successfully' });
  } catch (error) {
    logger.error('Failed to archive conversation', { error });
    res.status(500).json({ message: 'Failed to archive conversation' });
  }
});

/**
 * POST /api/assessment/start
 * Start or resume assessment
 */
router.post('/assessment/start', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get or create assessment conversation
    const conversation = await getOrCreateConversation(userId, { isAssessment: true });

    // Get next question
    const nextQuestion = getNextQuestion(conversation);

    if (!nextQuestion) {
      // Assessment already complete
      return res.json({
        complete: true,
        results: conversation.assessmentResults
      });
    }

    // Add question to conversation with hidden ID marker
    const questionText = `**Question ${nextQuestion.questionNumber} of ${nextQuestion.totalQuestions}**\n\n${nextQuestion.question}\n\n[Q:${nextQuestion.id}]`;

    conversation.messages.push({
      role: 'assistant',
      content: questionText,
      timestamp: new Date()
    });

    await conversation.save();

    res.json({
      complete: false,
      question: {
        text: nextQuestion.question,
        number: nextQuestion.questionNumber,
        total: nextQuestion.totalQuestions,
        type: nextQuestion.type
      },
      conversationId: conversation._id
    });
  } catch (error) {
    logger.error('Failed to start assessment', { error });
    res.status(500).json({ message: 'Failed to start assessment' });
  }
});

/**
 * POST /api/assessment/answer
 * Submit answer to assessment question
 */
router.post('/assessment/answer', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { answer } = req.body;

    if (!answer) {
      return res.status(400).json({ message: 'Answer is required' });
    }

    // Get active assessment conversation
    const conversation = await Conversation.findOne({
      userId,
      isAssessment: true,
      isAssessmentComplete: false,
      isActive: true
    });

    if (!conversation) {
      return res.status(404).json({ message: 'No active assessment found' });
    }

    // Save user's answer
    conversation.messages.push({
      role: 'user',
      content: answer,
      timestamp: new Date()
    });

    await conversation.save();

    // Get next question
    const nextQuestion = getNextQuestion(conversation);

    if (!nextQuestion) {
      // Assessment complete - calculate results
      const results = await calculateAssessmentResults(conversation);

      // Update user's active conversation back to general
      const user = await User.findById(userId);
      user.activeConversationId = null; // Will create new general conversation on next chat
      await user.save();

      return res.json({
        complete: true,
        results
      });
    }

    // Add next question
    const questionText = `**Question ${nextQuestion.questionNumber} of ${nextQuestion.totalQuestions}**\n\n${nextQuestion.question}\n\n[Q:${nextQuestion.id}]`;

    conversation.messages.push({
      role: 'assistant',
      content: questionText,
      timestamp: new Date()
    });

    await conversation.save();

    res.json({
      complete: false,
      question: {
        text: nextQuestion.question,
        number: nextQuestion.questionNumber,
        total: nextQuestion.totalQuestions,
        type: nextQuestion.type
      }
    });
  } catch (error) {
    logger.error('Failed to submit assessment answer', { error });
    res.status(500).json({ message: 'Failed to submit answer' });
  }
});

/**
 * GET /api/assessment/status
 * Check assessment status and results
 */
router.get('/assessment/status', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Check if user needs assessment
    const needed = await needsAssessment(userId);

    if (!needed) {
      // Get most recent completed assessment
      const completedAssessment = await Conversation.findOne({
        userId,
        isAssessment: true,
        isAssessmentComplete: true
      }).sort({ 'assessmentResults.completedAt': -1 });

      return res.json({
        needed: false,
        completed: !!completedAssessment,
        results: completedAssessment?.assessmentResults || null
      });
    }

    res.json({
      needed: true,
      completed: false
    });
  } catch (error) {
    logger.error('Failed to check assessment status', { error });
    res.status(500).json({ message: 'Failed to check assessment status' });
  }
});

module.exports = router;
