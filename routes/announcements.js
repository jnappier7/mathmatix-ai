/**
 * Announcement Routes - Teacher-to-Class/Student Messaging
 *
 * Provides API endpoints for:
 * - Creating and sending announcements
 * - Managing announcement recipients
 * - Student announcement inbox
 * - Read tracking
 *
 * @module routes/announcements
 */

const express = require('express');
const router = express.Router();
const Announcement = require('../models/announcement');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { isAuthenticated, isTeacher, isStudent } = require('../middleware/auth');

// ============================================
// TEACHER ROUTES
// ============================================

/**
 * GET /api/announcements/teacher
 * Get all announcements created by the teacher
 */
router.get('/teacher', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { limit = 50, skip = 0 } = req.query;

        const announcements = await Announcement.getByTeacher(req.user._id, {
            limit: parseInt(limit),
            skip: parseInt(skip)
        });

        // Get read stats for each announcement
        const announcementsWithStats = announcements.map(a => ({
            ...a,
            readCount: a.readBy?.length || 0,
            totalRecipients: a.recipientIds?.length || 0
        }));

        res.json({
            success: true,
            announcements: announcementsWithStats
        });
    } catch (error) {
        console.error('[Announcements] Error fetching teacher announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching announcements'
        });
    }
});

/**
 * GET /api/announcements/teacher/classes
 * Get teacher's classes (enrollment codes) for targeting
 */
router.get('/teacher/classes', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const enrollmentCodes = await EnrollmentCode.find({
            teacherId: req.user._id,
            isActive: true
        }).select('_id code className enrolledStudents').lean();

        // Also count all students assigned to this teacher
        const allStudentsCount = await User.countDocuments({
            teacherId: req.user._id,
            role: 'student'
        });

        res.json({
            success: true,
            classes: enrollmentCodes.map(ec => ({
                _id: ec._id,
                code: ec.code,
                className: ec.className,
                studentCount: ec.enrolledStudents?.length || 0
            })),
            totalStudents: allStudentsCount
        });
    } catch (error) {
        console.error('[Announcements] Error fetching classes:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching classes'
        });
    }
});

/**
 * GET /api/announcements/teacher/students
 * Get teacher's students for individual targeting
 */
router.get('/teacher/students', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const students = await User.find({
            teacherId: req.user._id,
            role: 'student'
        }).select('_id firstName lastName username gradeLevel').lean();

        res.json({
            success: true,
            students
        });
    } catch (error) {
        console.error('[Announcements] Error fetching students:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching students'
        });
    }
});

/**
 * POST /api/announcements/teacher/send
 * Send a new announcement
 */
router.post('/teacher/send', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const {
            targetType,        // 'class', 'individual', 'enrollment_code'
            enrollmentCodeId,  // For enrollment_code type
            recipientIds,      // For individual type
            title,
            body,
            priority = 'normal',
            category = 'general',
            scheduledFor = null,
            expiresAt = null
        } = req.body;

        // Validate required fields
        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: 'Title and body are required'
            });
        }

        if (!targetType || !['class', 'individual', 'enrollment_code'].includes(targetType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid target type'
            });
        }

        // Build recipient list based on target type
        let finalRecipientIds = [];

        if (targetType === 'individual') {
            if (!recipientIds || recipientIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'At least one recipient is required for individual messages'
                });
            }
            // Verify all recipients are students of this teacher
            const validStudents = await User.find({
                _id: { $in: recipientIds },
                teacherId: req.user._id,
                role: 'student'
            }).select('_id');

            if (validStudents.length !== recipientIds.length) {
                return res.status(403).json({
                    success: false,
                    message: 'Some recipients are not your students'
                });
            }
            finalRecipientIds = recipientIds;

        } else if (targetType === 'enrollment_code') {
            if (!enrollmentCodeId) {
                return res.status(400).json({
                    success: false,
                    message: 'Enrollment code required for class announcement'
                });
            }
            // Verify enrollment code belongs to this teacher
            const code = await EnrollmentCode.findOne({
                _id: enrollmentCodeId,
                teacherId: req.user._id
            });
            if (!code) {
                return res.status(403).json({
                    success: false,
                    message: 'Enrollment code not found or not yours'
                });
            }
            finalRecipientIds = code.enrolledStudents.map(s => s.studentId);

        } else if (targetType === 'class') {
            // All students of this teacher
            const allStudents = await User.find({
                teacherId: req.user._id,
                role: 'student'
            }).select('_id');
            finalRecipientIds = allStudents.map(s => s._id);
        }

        if (finalRecipientIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No recipients found for this announcement'
            });
        }

        // Create the announcement
        const announcement = new Announcement({
            teacherId: req.user._id,
            targetType,
            enrollmentCodeId: targetType === 'enrollment_code' ? enrollmentCodeId : undefined,
            recipientIds: finalRecipientIds,
            title,
            body,
            priority,
            category,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        });

        await announcement.save();

        // Populate teacher info for response
        await announcement.populate('teacherId', 'firstName lastName');

        res.status(201).json({
            success: true,
            message: `Announcement sent to ${finalRecipientIds.length} student(s)`,
            announcement: {
                _id: announcement._id,
                title: announcement.title,
                body: announcement.body,
                priority: announcement.priority,
                category: announcement.category,
                targetType: announcement.targetType,
                recipientCount: finalRecipientIds.length,
                isSent: announcement.isSent,
                createdAt: announcement.createdAt
            }
        });

    } catch (error) {
        console.error('[Announcements] Error sending announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending announcement'
        });
    }
});

/**
 * GET /api/announcements/teacher/:announcementId/stats
 * Get read statistics for an announcement
 */
router.get('/teacher/:announcementId/stats', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { announcementId } = req.params;

        const announcement = await Announcement.findOne({
            _id: announcementId,
            teacherId: req.user._id
        })
        .populate('recipientIds', 'firstName lastName username')
        .populate('readBy.studentId', 'firstName lastName username');

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }

        // Build detailed read status
        const readStudentIds = new Set(announcement.readBy.map(r => r.studentId._id.toString()));
        const recipientStatus = announcement.recipientIds.map(student => ({
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
            hasRead: readStudentIds.has(student._id.toString()),
            readAt: announcement.readBy.find(r => r.studentId._id.toString() === student._id.toString())?.readAt
        }));

        res.json({
            success: true,
            stats: {
                totalRecipients: announcement.recipientIds.length,
                readCount: announcement.readBy.length,
                readPercentage: Math.round((announcement.readBy.length / announcement.recipientIds.length) * 100),
                recipients: recipientStatus
            }
        });

    } catch (error) {
        console.error('[Announcements] Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching announcement stats'
        });
    }
});

/**
 * DELETE /api/announcements/teacher/:announcementId
 * Delete an announcement (soft delete)
 */
router.delete('/teacher/:announcementId', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { announcementId } = req.params;

        const result = await Announcement.updateOne(
            {
                _id: announcementId,
                teacherId: req.user._id
            },
            { isDeleted: true }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }

        res.json({
            success: true,
            message: 'Announcement deleted'
        });

    } catch (error) {
        console.error('[Announcements] Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting announcement'
        });
    }
});


// ============================================
// STUDENT ROUTES
// ============================================

/**
 * GET /api/announcements/student
 * Get announcements for the current student
 */
router.get('/student', isAuthenticated, isStudent, async (req, res) => {
    try {
        const { limit = 20, skip = 0, unreadOnly = false } = req.query;

        const announcements = await Announcement.getForStudent(req.user._id, {
            limit: parseInt(limit),
            skip: parseInt(skip),
            unreadOnly: unreadOnly === 'true'
        });

        res.json({
            success: true,
            announcements
        });

    } catch (error) {
        console.error('[Announcements] Error fetching student announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching announcements'
        });
    }
});

/**
 * GET /api/announcements/student/unread-count
 * Get unread announcement count for the student
 */
router.get('/student/unread-count', isAuthenticated, isStudent, async (req, res) => {
    try {
        const count = await Announcement.getUnreadCount(req.user._id);

        res.json({
            success: true,
            unreadCount: count
        });

    } catch (error) {
        console.error('[Announcements] Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting unread count'
        });
    }
});

/**
 * POST /api/announcements/student/:announcementId/read
 * Mark an announcement as read
 */
router.post('/student/:announcementId/read', isAuthenticated, isStudent, async (req, res) => {
    try {
        const { announcementId } = req.params;

        const announcement = await Announcement.findOne({
            _id: announcementId,
            recipientIds: req.user._id,
            isDeleted: false
        });

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }

        await announcement.markAsReadBy(req.user._id);

        res.json({
            success: true,
            message: 'Marked as read'
        });

    } catch (error) {
        console.error('[Announcements] Error marking as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking as read'
        });
    }
});

/**
 * POST /api/announcements/student/mark-all-read
 * Mark all announcements as read
 */
router.post('/student/mark-all-read', isAuthenticated, isStudent, async (req, res) => {
    try {
        const announcements = await Announcement.getForStudent(req.user._id, {
            unreadOnly: true,
            limit: 100
        });

        let markedCount = 0;
        for (const a of announcements) {
            const announcement = await Announcement.findById(a._id);
            if (announcement && !announcement.isReadBy(req.user._id)) {
                await announcement.markAsReadBy(req.user._id);
                markedCount++;
            }
        }

        res.json({
            success: true,
            message: `Marked ${markedCount} announcements as read`
        });

    } catch (error) {
        console.error('[Announcements] Error marking all as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all as read'
        });
    }
});

module.exports = router;
