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
const CourseSession = require('../models/courseSession');
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

    // Get user's active conversation ID for session persistence
    const user = await User.findById(userId).select('activeConversationId').lean();
    const activeConversationId = user?.activeConversationId || null;

    res.json({
      conversations,
      assessmentNeeded,
      activeConversationId
    });
  } catch (error) {
    logger.error('Failed to get conversations', { error });
    res.status(500).json({ message: 'Failed to load conversations' });
  }
});

/**
 * GET /api/conversations/returning-user-data
 * Get combined data for the returning user welcome modal.
 * Returns course sessions (with their recent conversations) and recent general sessions.
 */
router.get('/returning-user-data', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId)
      .select('learningProfile assessmentCompleted activeConversationId activeCourseSessionId')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // A returning user has completed rapport building and assessment
    const isReturningUser = !!(
      user.learningProfile?.rapportBuildingComplete &&
      user.assessmentCompleted
    );

    if (!isReturningUser) {
      return res.json({ isReturningUser: false });
    }

    // Get course sessions (active or paused)
    const courseSessions = await CourseSession.find({
      userId,
      status: { $in: ['active', 'paused'] }
    }).sort({ updatedAt: -1 }).lean();

    // Build course data with their associated conversations
    const courses = [];
    for (const cs of courseSessions) {
      // Find the course conversation and any other conversations linked to this course
      const courseConversations = await Conversation.find({
        userId,
        isActive: true,
        $or: [
          { _id: cs.conversationId },
          { conversationType: 'course', topic: cs.courseName }
        ]
      })
        .sort({ lastActivity: -1 })
        .select('_id conversationName customName topic topicEmoji lastActivity messages conversationType')
        .lean();

      const formattedConversations = courseConversations.map(conv => {
        const lastMsg = conv.messages?.length > 0
          ? conv.messages[conv.messages.length - 1].content.substring(0, 80)
          : null;
        return {
          _id: conv._id,
          name: conv.customName || conv.conversationName || conv.topic || 'Course Chat',
          lastMessage: lastMsg,
          lastActivity: conv.lastActivity,
          messageCount: conv.messages?.length || 0
        };
      });

      // Format current module name
      const modLabel = (cs.currentModuleId || '')
        .replace(/^mod-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      courses.push({
        courseSessionId: cs._id,
        courseId: cs.courseId,
        courseName: cs.courseName,
        status: cs.status,
        overallProgress: cs.overallProgress || 0,
        currentModuleId: cs.currentModuleId,
        currentScaffoldIndex: cs.currentScaffoldIndex || 0,
        conversationId: cs.conversationId,
        currentModuleLabel: modLabel,
        conversations: formattedConversations
      });
    }

    // Get recent general/topic sessions (not course conversations)
    const recentSessions = await Conversation.find({
      userId,
      isActive: true,
      conversationType: { $in: ['general', 'topic'] }
    })
      .sort({ lastActivity: -1 })
      .limit(10)
      .select('_id conversationName customName topic topicEmoji lastActivity messages conversationType')
      .lean();

    const formattedSessions = recentSessions
      .filter(conv => conv.messages?.length > 0) // Only show sessions with messages
      .map(conv => {
        const lastMsg = conv.messages[conv.messages.length - 1].content.substring(0, 80);
        return {
          _id: conv._id,
          name: conv.customName || conv.conversationName || conv.topic || 'General Chat',
          topicEmoji: conv.topicEmoji || '💬',
          lastMessage: lastMsg,
          lastActivity: conv.lastActivity,
          messageCount: conv.messages.length,
          conversationType: conv.conversationType
        };
      });

    res.json({
      isReturningUser: true,
      courses,
      recentSessions: formattedSessions
    });
  } catch (error) {
    logger.error('Failed to get returning user data', { error });
    res.status(500).json({ message: 'Failed to load returning user data' });
  }
});

/**
 * POST /api/conversations/new-course-session
 * Create a fresh conversation for an existing course session.
 * The student picks up at their current lesson/scaffold step but in a clean chat.
 */
router.post('/new-course-session', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { courseSessionId } = req.body;

    if (!courseSessionId) {
      return res.status(400).json({ message: 'courseSessionId is required' });
    }

    const courseSession = await CourseSession.findOne({
      _id: courseSessionId,
      userId,
      status: { $in: ['active', 'paused'] }
    });

    if (!courseSession) {
      return res.status(404).json({ message: 'Course session not found' });
    }

    // Create a fresh conversation for this course
    const newConversation = new Conversation({
      userId,
      conversationType: 'course',
      conversationName: courseSession.courseName,
      topic: courseSession.courseName,
      messages: []
    });
    await newConversation.save();

    // Update the course session to point to the new conversation
    courseSession.conversationId = newConversation._id;
    courseSession.status = 'active';
    await courseSession.save();

    // Set as user's active course session and conversation
    const user = await User.findById(userId);
    user.activeCourseSessionId = courseSession._id;
    user.activeConversationId = newConversation._id;
    await user.save();

    logger.info('Created fresh course conversation', {
      userId,
      courseSessionId,
      newConversationId: newConversation._id,
      currentModuleId: courseSession.currentModuleId,
      currentScaffoldIndex: courseSession.currentScaffoldIndex
    });

    res.json({
      success: true,
      conversation: {
        _id: newConversation._id,
        name: newConversation.conversationName,
        conversationType: 'course'
      },
      courseSession: {
        _id: courseSession._id,
        courseId: courseSession.courseId,
        courseName: courseSession.courseName,
        currentModuleId: courseSession.currentModuleId,
        currentScaffoldIndex: courseSession.currentScaffoldIndex,
        overallProgress: courseSession.overallProgress
      }
    });
  } catch (error) {
    logger.error('Failed to create new course session conversation', { error });
    res.status(500).json({ message: 'Failed to create new session' });
  }
});

/**
 * POST /api/conversations
 * Create a new conversation (with or without a topic)
 */
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { topic, topicEmoji } = req.body;

    let conversation;

    if (topic) {
      // Topic-based session: find existing or create new
      conversation = await getOrCreateConversation(userId, { topic });

      if (topicEmoji) {
        conversation.topicEmoji = topicEmoji;
        await conversation.save();
      }
    } else {
      // New blank session (Claude-like): always create fresh
      conversation = new Conversation({
        userId,
        conversationType: 'general',
        conversationName: 'New Chat',
        messages: []
      });
      await conversation.save();

      // Set as user's active conversation
      const user = await User.findById(userId);
      user.activeConversationId = conversation._id;
      await user.save();

      logger.info('Created new blank session', {
        userId,
        conversationId: conversation._id
      });
    }

    res.json({
      conversation: {
        _id: conversation._id,
        topic: conversation.topic,
        topicEmoji: conversation.topicEmoji,
        name: conversation.conversationName || conversation.topic || 'New Chat',
        conversationType: conversation.conversationType,
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
 * PATCH /api/conversations/:id/rename
 * Rename a conversation
 */
router.patch('/:id/rename', isAuthenticated, validateObjectId('id'), async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = req.params.id;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Name is required' });
    }

    if (name.length > 50) {
      return res.status(400).json({ message: 'Name must be 50 characters or less' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    conversation.customName = name.trim();
    await conversation.save();

    logger.info('Renamed conversation', {
      userId,
      conversationId,
      newName: name.trim()
    });

    res.json({
      success: true,
      conversation: {
        _id: conversation._id,
        name: conversation.customName || conversation.conversationName || conversation.topic || 'General Chat'
      }
    });
  } catch (error) {
    logger.error('Failed to rename conversation', { error });
    res.status(500).json({ message: 'Failed to rename conversation' });
  }
});

/**
 * PATCH /api/conversations/:id/pin
 * Toggle pin status for a conversation
 */
router.patch('/:id/pin', isAuthenticated, validateObjectId('id'), async (req, res) => {
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

    conversation.isPinned = !conversation.isPinned;
    await conversation.save();

    logger.info('Toggled conversation pin status', {
      userId,
      conversationId,
      isPinned: conversation.isPinned
    });

    res.json({
      success: true,
      isPinned: conversation.isPinned
    });
  } catch (error) {
    logger.error('Failed to toggle pin status', { error });
    res.status(500).json({ message: 'Failed to update pin status' });
  }
});

/**
 * GET /api/conversations/search
 * Search conversations by name or topic
 */
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ conversations: [] });
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const conversations = await Conversation.find({
      userId,
      isActive: true,
      $or: [
        { customName: searchRegex },
        { conversationName: searchRegex },
        { topic: searchRegex },
        { currentTopic: searchRegex }
      ]
    })
    .sort({ isPinned: -1, lastActivity: -1 })
    .limit(20)
    .select('_id topic topicEmoji conversationType conversationName customName lastActivity messages currentTopic isPinned');

    const formattedConversations = conversations.map(conv => ({
      _id: conv._id,
      topic: conv.topic,
      topicEmoji: conv.topicEmoji,
      conversationType: conv.conversationType,
      name: conv.customName || conv.conversationName || conv.topic || 'General Chat',
      lastActivity: conv.lastActivity,
      messageCount: conv.messages.length,
      lastMessage: conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].content.substring(0, 100) : null,
      currentTopic: conv.currentTopic,
      isPinned: conv.isPinned
    }));

    res.json({ conversations: formattedConversations });
  } catch (error) {
    logger.error('Failed to search conversations', { error });
    res.status(500).json({ message: 'Failed to search conversations' });
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
