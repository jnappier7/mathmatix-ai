/**
 * Messaging Routes - Teacher-Parent Communication
 *
 * Provides API endpoints for:
 * - Sending/receiving messages between teachers and parents
 * - Thread management
 * - Read receipts
 * - Email notifications
 *
 * @module routes/messaging
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/message');
const User = require('../models/user');
const { isAuthenticated } = require('../middleware/auth');
const { sendMessageNotification } = require('../utils/emailService');

/**
 * Middleware to check if user can message
 * Only teachers and parents can use messaging
 */
function canMessage(req, res, next) {
    if (!req.user || !['teacher', 'parent'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Only teachers and parents can use messaging'
        });
    }
    next();
}

/**
 * GET /api/messages/conversations
 * Get list of conversations for the current user
 */
router.get('/conversations', isAuthenticated, canMessage, async (req, res) => {
    try {
        const { limit = 20, skip = 0 } = req.query;

        const conversations = await Message.getConversations(req.user._id, {
            limit: parseInt(limit),
            skip: parseInt(skip)
        });

        // Get participant details
        const participantIds = conversations.map(c => c._id);
        const participants = await User.find(
            { _id: { $in: participantIds } },
            'firstName lastName role email'
        ).lean();

        const participantMap = {};
        participants.forEach(p => {
            participantMap[p._id.toString()] = p;
        });

        // Format response
        const formattedConversations = conversations.map(conv => ({
            participant: participantMap[conv._id.toString()],
            lastMessage: {
                _id: conv.lastMessage._id,
                subject: conv.lastMessage.subject,
                body: conv.lastMessage.body.substring(0, 100) + (conv.lastMessage.body.length > 100 ? '...' : ''),
                createdAt: conv.lastMessage.createdAt,
                isFromMe: conv.lastMessage.senderId._id.toString() === req.user._id.toString(),
                category: conv.lastMessage.category
            },
            unreadCount: conv.unreadCount,
            studentId: conv.lastMessage.studentId
        }));

        res.json({
            success: true,
            conversations: formattedConversations
        });
    } catch (error) {
        console.error('[Messaging] Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations'
        });
    }
});

/**
 * GET /api/messages/thread/:threadId
 * Get all messages in a thread
 */
router.get('/thread/:threadId', isAuthenticated, canMessage, async (req, res) => {
    try {
        const { threadId } = req.params;

        // Get thread messages
        const messages = await Message.find({
            $or: [
                { _id: threadId },
                { threadId: threadId }
            ],
            $or: [
                { senderId: req.user._id, deletedBySender: false },
                { recipientId: req.user._id, deletedByRecipient: false }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('senderId', 'firstName lastName role')
        .populate('recipientId', 'firstName lastName role')
        .populate('studentId', 'firstName lastName');

        if (messages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Thread not found'
            });
        }

        // Mark messages as read
        const unreadIds = messages
            .filter(m => m.recipientId._id.toString() === req.user._id.toString() && m.status !== 'read')
            .map(m => m._id);

        if (unreadIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: unreadIds } },
                { status: 'read', readAt: new Date() }
            );
        }

        res.json({
            success: true,
            messages: messages.map(m => ({
                _id: m._id,
                sender: m.senderId,
                recipient: m.recipientId,
                student: m.studentId,
                subject: m.subject,
                body: m.body,
                category: m.category,
                isUrgent: m.isUrgent,
                status: m.status,
                createdAt: m.createdAt,
                isFromMe: m.senderId._id.toString() === req.user._id.toString()
            }))
        });
    } catch (error) {
        console.error('[Messaging] Error fetching thread:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching thread'
        });
    }
});

/**
 * GET /api/messages/with/:userId
 * Get messages with a specific user
 */
router.get('/with/:userId', isAuthenticated, canMessage, async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, before } = req.query;

        // Verify the other user exists and can be messaged
        const otherUser = await User.findById(userId, 'firstName lastName role');
        if (!otherUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Build query
        const query = {
            $or: [
                { senderId: req.user._id, recipientId: userId, deletedBySender: false },
                { senderId: userId, recipientId: req.user._id, deletedByRecipient: false }
            ]
        };

        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('senderId', 'firstName lastName role')
            .populate('recipientId', 'firstName lastName role')
            .populate('studentId', 'firstName lastName');

        // Mark received messages as read
        const unreadIds = messages
            .filter(m => m.recipientId._id.toString() === req.user._id.toString() && m.status !== 'read')
            .map(m => m._id);

        if (unreadIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: unreadIds } },
                { status: 'read', readAt: new Date() }
            );
        }

        res.json({
            success: true,
            otherUser,
            messages: messages.reverse().map(m => ({
                _id: m._id,
                sender: m.senderId,
                recipient: m.recipientId,
                student: m.studentId,
                subject: m.subject,
                body: m.body,
                category: m.category,
                isUrgent: m.isUrgent,
                status: m.status,
                createdAt: m.createdAt,
                isFromMe: m.senderId._id.toString() === req.user._id.toString()
            }))
        });
    } catch (error) {
        console.error('[Messaging] Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
});

/**
 * POST /api/messages/send
 * Send a new message
 */
router.post('/send', isAuthenticated, canMessage, async (req, res) => {
    try {
        const {
            recipientId,
            studentId,
            subject,
            body,
            category = 'general',
            isUrgent = false,
            threadId,
            requiresResponse = false
        } = req.body;

        // Validate required fields
        if (!recipientId || !body) {
            return res.status(400).json({
                success: false,
                message: 'Recipient and message body are required'
            });
        }

        // Verify recipient exists and can be messaged
        const recipient = await User.findById(recipientId, 'firstName lastName role email parentSettings');
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        // Check messaging permissions
        // Teachers can message parents of their students
        // Parents can message teachers of their children
        let hasPermission = false;

        if (req.user.role === 'teacher') {
            // Check if recipient is a parent of one of this teacher's students
            if (recipient.role === 'parent') {
                const parentChildren = await User.find({
                    parentIds: recipient._id,
                    teacherId: req.user._id
                });
                hasPermission = parentChildren.length > 0;
            }
        } else if (req.user.role === 'parent') {
            // Check if recipient is a teacher of one of this parent's children
            if (recipient.role === 'teacher') {
                const parent = await User.findById(req.user._id);
                if (parent.children && parent.children.length > 0) {
                    const childrenWithTeacher = await User.find({
                        _id: { $in: parent.children },
                        teacherId: recipient._id
                    });
                    hasPermission = childrenWithTeacher.length > 0;
                }
            }
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'You can only message teachers/parents connected through students'
            });
        }

        // Verify student if provided
        if (studentId) {
            const student = await User.findById(studentId, 'firstName lastName');
            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found'
                });
            }
        }

        // Create message
        const message = new Message({
            senderId: req.user._id,
            recipientId,
            studentId: studentId || undefined,
            subject: subject || undefined,
            body,
            category,
            isUrgent,
            threadId: threadId || undefined,
            requiresResponse
        });

        await message.save();

        // Send email notification if enabled
        try {
            if (typeof sendMessageNotification === 'function') {
                await sendMessageNotification(recipient, req.user, message);
            }
        } catch (emailError) {
            console.warn('[Messaging] Email notification failed:', emailError.message);
            // Don't fail the request if email fails
        }

        // Populate and return
        await message.populate([
            { path: 'senderId', select: 'firstName lastName role' },
            { path: 'recipientId', select: 'firstName lastName role' },
            { path: 'studentId', select: 'firstName lastName' }
        ]);

        res.status(201).json({
            success: true,
            message: {
                _id: message._id,
                sender: message.senderId,
                recipient: message.recipientId,
                student: message.studentId,
                subject: message.subject,
                body: message.body,
                category: message.category,
                isUrgent: message.isUrgent,
                status: message.status,
                createdAt: message.createdAt,
                isFromMe: true
            }
        });
    } catch (error) {
        console.error('[Messaging] Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message'
        });
    }
});

/**
 * PUT /api/messages/:messageId/read
 * Mark a message as read
 */
router.put('/:messageId/read', isAuthenticated, canMessage, async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findOne({
            _id: messageId,
            recipientId: req.user._id
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        await message.markAsRead();

        res.json({
            success: true,
            message: 'Message marked as read'
        });
    } catch (error) {
        console.error('[Messaging] Error marking message as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking message as read'
        });
    }
});

/**
 * DELETE /api/messages/:messageId
 * Delete a message (soft delete)
 */
router.delete('/:messageId', isAuthenticated, canMessage, async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Check if user is sender or recipient
        const isSender = message.senderId.toString() === req.user._id.toString();
        const isRecipient = message.recipientId.toString() === req.user._id.toString();

        if (!isSender && !isRecipient) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this message'
            });
        }

        // Soft delete for the user
        if (isSender) {
            message.deletedBySender = true;
        }
        if (isRecipient) {
            message.deletedByRecipient = true;
        }

        await message.save();

        res.json({
            success: true,
            message: 'Message deleted'
        });
    } catch (error) {
        console.error('[Messaging] Error deleting message:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message'
        });
    }
});

/**
 * GET /api/messages/unread-count
 * Get count of unread messages
 */
router.get('/unread-count', isAuthenticated, canMessage, async (req, res) => {
    try {
        const count = await Message.getUnreadCount(req.user._id);

        res.json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error('[Messaging] Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting unread count'
        });
    }
});

/**
 * GET /api/messages/contacts
 * Get available contacts (teachers or parents the user can message)
 */
router.get('/contacts', isAuthenticated, canMessage, async (req, res) => {
    try {
        let contacts = [];

        if (req.user.role === 'teacher') {
            // Get all parents of students assigned to this teacher
            const students = await User.find(
                { teacherId: req.user._id, role: 'student' },
                'firstName lastName parentIds'
            ).populate('parentIds', 'firstName lastName email');

            // Build unique list of parents with their children
            const parentMap = new Map();
            students.forEach(student => {
                if (student.parentIds) {
                    student.parentIds.forEach(parent => {
                        if (!parentMap.has(parent._id.toString())) {
                            parentMap.set(parent._id.toString(), {
                                _id: parent._id,
                                firstName: parent.firstName,
                                lastName: parent.lastName,
                                email: parent.email,
                                role: 'parent',
                                children: []
                            });
                        }
                        parentMap.get(parent._id.toString()).children.push({
                            _id: student._id,
                            firstName: student.firstName,
                            lastName: student.lastName
                        });
                    });
                }
            });

            contacts = Array.from(parentMap.values());

        } else if (req.user.role === 'parent') {
            // Get teachers of all children
            const parent = await User.findById(req.user._id, 'children').populate('children', 'firstName lastName teacherId');

            if (parent.children) {
                const teacherIds = [...new Set(parent.children
                    .filter(c => c.teacherId)
                    .map(c => c.teacherId.toString()))];

                const teachers = await User.find(
                    { _id: { $in: teacherIds } },
                    'firstName lastName email'
                ).lean();

                // Add which children each teacher is connected to
                contacts = teachers.map(teacher => ({
                    ...teacher,
                    role: 'teacher',
                    children: parent.children
                        .filter(c => c.teacherId && c.teacherId.toString() === teacher._id.toString())
                        .map(c => ({ _id: c._id, firstName: c.firstName, lastName: c.lastName }))
                }));
            }
        }

        res.json({
            success: true,
            contacts
        });
    } catch (error) {
        console.error('[Messaging] Error getting contacts:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting contacts'
        });
    }
});

module.exports = router;
