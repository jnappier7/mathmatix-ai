// routes/support.js
// API endpoints for AI-triaged support tickets

const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/supportTicket');
const { isAuthenticated } = require('../middleware/auth');
const { triageTicket, generateFollowUp } = require('../utils/supportTriage');
const { sendSupportEscalationAlert } = require('../utils/emailService');
const logger = require('../utils/logger').child({ route: 'support' });

/**
 * POST /api/support/tickets
 * Create a new support ticket — AI triages automatically
 */
router.post('/tickets', isAuthenticated, async (req, res) => {
  try {
    const { category, subject, description, pageUrl, screenshot } = req.body;

    // Validation
    if (!category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Category, subject, and description are required.'
      });
    }

    const validCategories = ['account', 'billing', 'bug', 'how-to', 'feature-request', 'data-privacy', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category.'
      });
    }

    if (subject.length > 200 || description.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Subject (max 200 chars) or description (max 5000 chars) too long.'
      });
    }

    // Run AI triage
    const userRole = req.user.role || req.user.roles?.[0] || 'student';
    const triageResult = await triageTicket({
      category,
      subject,
      description,
      userRole
    });

    // Create ticket
    const ticket = new SupportTicket({
      userId: req.user._id,
      category,
      subject,
      description,
      priority: triageResult.suggestedPriority,
      status: triageResult.handled ? 'ai_resolved' : 'escalated',
      aiTriage: {
        handled: triageResult.handled,
        confidence: triageResult.confidence,
        response: triageResult.response,
        reason: triageResult.reason,
        suggestedPriority: triageResult.suggestedPriority,
        triageTimestamp: new Date()
      },
      messages: [
        {
          sender: 'user',
          content: description
        },
        {
          sender: 'ai',
          content: triageResult.response
        }
      ],
      userAgent: req.headers['user-agent'],
      pageUrl: pageUrl || req.headers.referer,
      userRole,
      screenshot
    });

    await ticket.save();

    // Send escalation email if ticket was not handled by AI
    if (!triageResult.handled) {
      sendSupportEscalationAlert(ticket, req.user).catch(err => {
        logger.error('Failed to send escalation email', { ticketId: ticket._id, error: err.message });
      });
    }

    logger.info('Support ticket created', {
      ticketId: ticket._id,
      userId: req.user._id,
      category,
      aiHandled: triageResult.handled,
      confidence: triageResult.confidence
    });

    res.json({
      success: true,
      ticket: {
        _id: ticket._id,
        category: ticket.category,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        aiTriage: {
          handled: triageResult.handled,
          response: triageResult.response
        },
        createdAt: ticket.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to create support ticket', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to submit your request. Please try again.'
    });
  }
});

/**
 * GET /api/support/tickets/my
 * Get current user's ticket history
 */
router.get('/tickets/my', isAuthenticated, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('-adminNotes -aiTriage.reason');

    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    logger.error('Failed to get user tickets', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to load your tickets.'
    });
  }
});

/**
 * GET /api/support/tickets/:id
 * Get a specific ticket (user can only see their own)
 */
router.get('/tickets/:id', isAuthenticated, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).select('-adminNotes -aiTriage.reason');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    logger.error('Failed to get ticket', {
      error: error.message,
      ticketId: req.params.id,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to load ticket.'
    });
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * Add a follow-up message to a ticket — AI responds if ticket is AI-managed
 */
router.post('/tickets/:id/messages', isAuthenticated, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message is required (max 5000 chars).'
      });
    }

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'This ticket is closed. Please open a new ticket if you need further help.'
      });
    }

    // Add user message
    ticket.messages.push({
      sender: 'user',
      content
    });

    // If ticket is AI-managed (ai_resolved or open), generate AI follow-up
    let aiResponse = null;
    if (ticket.status === 'ai_resolved' || ticket.status === 'open') {
      const followUp = await generateFollowUp(ticket, content);
      aiResponse = followUp.response;

      ticket.messages.push({
        sender: 'ai',
        content: followUp.response
      });

      // If AI says escalate, update status and notify admin
      if (followUp.shouldEscalate) {
        ticket.status = 'escalated';
      }
    }

    await ticket.save();

    // Send escalation email if the follow-up caused escalation
    if (ticket.status === 'escalated') {
      sendSupportEscalationAlert(ticket, req.user).catch(err => {
        logger.error('Failed to send escalation email on follow-up', { ticketId: ticket._id, error: err.message });
      });
    }

    logger.info('Support ticket message added', {
      ticketId: ticket._id,
      userId: req.user._id,
      hasAiResponse: !!aiResponse,
      escalated: ticket.status === 'escalated'
    });

    res.json({
      success: true,
      aiResponse,
      status: ticket.status
    });

  } catch (error) {
    logger.error('Failed to add ticket message', {
      error: error.message,
      ticketId: req.params.id,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to send your message. Please try again.'
    });
  }
});

/**
 * POST /api/support/tickets/:id/reopen
 * User marks AI-resolved ticket as not resolved (escalates to human)
 */
router.post('/tickets/:id/reopen', isAuthenticated, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    if (ticket.status !== 'ai_resolved') {
      return res.status(400).json({
        success: false,
        message: 'Only AI-resolved tickets can be reopened for human review.'
      });
    }

    ticket.status = 'escalated';
    ticket.messages.push({
      sender: 'ai',
      content: "I understand my response didn't fully resolve your issue. I've escalated this to our support team and someone will follow up with you."
    });

    await ticket.save();

    // Notify admin of the escalation
    sendSupportEscalationAlert(ticket, req.user).catch(err => {
      logger.error('Failed to send escalation email on reopen', { ticketId: ticket._id, error: err.message });
    });

    logger.info('AI-resolved ticket reopened/escalated', {
      ticketId: ticket._id,
      userId: req.user._id
    });

    res.json({
      success: true,
      message: 'Your ticket has been escalated to our support team.'
    });

  } catch (error) {
    logger.error('Failed to reopen ticket', {
      error: error.message,
      ticketId: req.params.id,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to reopen ticket. Please try again.'
    });
  }
});

/**
 * GET /api/support/tickets/admin/all
 * Admin: Get all tickets with filters
 */
router.get('/tickets/admin/all', isAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    const { status, category, priority, aiHandled } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (aiHandled !== undefined) filter['aiTriage.handled'] = aiHandled === 'true';

    const tickets = await SupportTicket.find(filter)
      .populate('userId', 'firstName lastName email username role')
      .sort({ createdAt: -1 })
      .limit(100);

    // Stats
    const stats = await SupportTicket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      tickets,
      stats: stats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {})
    });

  } catch (error) {
    logger.error('Failed to get admin tickets', {
      error: error.message,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to load tickets.'
    });
  }
});

/**
 * PATCH /api/support/tickets/admin/:id
 * Admin: Update ticket status, add notes, assign
 */
router.patch('/tickets/admin/:id', isAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    const { status, adminNotes, assignedTo, priority, responseMessage } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    if (status) ticket.status = status;
    if (adminNotes !== undefined) ticket.adminNotes = adminNotes;
    if (assignedTo !== undefined) ticket.assignedTo = assignedTo;
    if (priority) ticket.priority = priority;

    if (status === 'resolved' || status === 'closed') {
      ticket.resolvedAt = new Date();
    }

    // Admin can send a response message to the user
    if (responseMessage) {
      ticket.messages.push({
        sender: 'admin',
        content: responseMessage
      });
    }

    await ticket.save();

    logger.info('Admin updated support ticket', {
      ticketId: ticket._id,
      adminId: req.user._id,
      updates: { status, assignedTo, priority }
    });

    res.json({
      success: true,
      ticket
    });

  } catch (error) {
    logger.error('Failed to update ticket', {
      error: error.message,
      ticketId: req.params.id,
      adminId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to update ticket.'
    });
  }
});

module.exports = router;
