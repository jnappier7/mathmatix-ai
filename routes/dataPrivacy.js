/**
 * DATA PRIVACY ROUTES - FERPA/COPPA Compliance Endpoints
 *
 * Handles:
 * - Student data deletion (cascade delete across all collections)
 * - Student data export (JSON download of all personal data)
 * - Privacy audit trail
 *
 * WHO CAN TRIGGER DELETION:
 * - Admin: Can delete any student's data
 * - Parent: Can delete their linked child's data
 * - Teacher: Can request deletion for students in their class (creates request, admin approves)
 * - Student: Can request their own data deletion (creates request, processed per policy)
 *
 * WHAT GETS DELETED:
 * - User document (profile, IEP, skill mastery, badges, XP)
 * - All conversations and message history
 * - Course sessions and progress
 * - Screener sessions (placement tests)
 * - Grading results
 * - Student uploads (files)
 * - Feedback submissions
 * - References in enrollment codes (student entry removed, code preserved)
 * - References in announcements (read receipts)
 * - Impersonation logs (anonymized, not deleted — required for audit)
 *
 * @module routes/dataPrivacy
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isAuthenticated, isAdmin, isParent } = require('../middleware/auth');
const logger = require('../utils/logger');

// Models
const User = require('../models/user');
const Conversation = require('../models/conversation');
const CourseSession = require('../models/courseSession');
const ScreenerSession = require('../models/screenerSession');
const GradingResult = require('../models/gradingResult');
const StudentUpload = require('../models/studentUpload');
const Feedback = require('../models/feedback');
const EnrollmentCode = require('../models/enrollmentCode');
const Announcement = require('../models/announcement');
const ImpersonationLog = require('../models/impersonationLog');
const Message = require('../models/message');

// ============================================================================
// DELETION AUDIT LOG (stored in-memory for now, should move to DB)
// ============================================================================

/**
 * Records a deletion event for compliance audit trail.
 * In production, this should be stored in a separate, append-only collection.
 */
async function recordDeletionAudit(deletionRecord) {
    logger.info('[DataPrivacy] Deletion audit record', {
        action: 'student_data_deletion',
        targetUserId: deletionRecord.targetUserId,
        requestedBy: deletionRecord.requestedBy,
        requestedByRole: deletionRecord.requestedByRole,
        collectionsAffected: deletionRecord.collectionsAffected,
        documentCounts: deletionRecord.documentCounts,
        completedAt: new Date().toISOString(),
        reason: deletionRecord.reason
    });
}

// ============================================================================
// CASCADE DELETE - Core deletion logic
// ============================================================================

/**
 * Perform a complete cascade deletion of all student data.
 * Returns a summary of what was deleted for audit purposes.
 *
 * @param {string} studentId - The MongoDB ObjectId of the student to delete
 * @param {Object} requestor - { userId, role, reason }
 * @returns {Object} Deletion summary with counts per collection
 */
async function cascadeDeleteStudentData(studentId, requestor) {
    const objectId = new mongoose.Types.ObjectId(studentId);
    const summary = {
        targetUserId: studentId,
        requestedBy: requestor.userId,
        requestedByRole: requestor.role,
        reason: requestor.reason || 'Data deletion request',
        collectionsAffected: [],
        documentCounts: {},
        errors: [],
        startedAt: new Date()
    };

    // Verify the student exists
    const student = await User.findById(objectId);
    if (!student) {
        throw new Error('Student not found');
    }

    if (student.role !== 'student' && !(student.roles && student.roles.includes('student'))) {
        throw new Error('Target user is not a student');
    }

    // --- 1. Delete Conversations ---
    try {
        const result = await Conversation.deleteMany({ userId: objectId });
        summary.documentCounts.conversations = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('conversations');
    } catch (err) {
        summary.errors.push({ collection: 'conversations', error: err.message });
    }

    // --- 2. Delete Course Sessions ---
    try {
        const result = await CourseSession.deleteMany({ userId: objectId });
        summary.documentCounts.courseSessions = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('courseSessions');
    } catch (err) {
        summary.errors.push({ collection: 'courseSessions', error: err.message });
    }

    // --- 3. Delete Screener Sessions ---
    try {
        const result = await ScreenerSession.deleteMany({ userId: objectId });
        summary.documentCounts.screenerSessions = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('screenerSessions');
    } catch (err) {
        summary.errors.push({ collection: 'screenerSessions', error: err.message });
    }

    // --- 4. Delete Grading Results ---
    try {
        const result = await GradingResult.deleteMany({ userId: objectId });
        summary.documentCounts.gradingResults = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('gradingResults');
    } catch (err) {
        summary.errors.push({ collection: 'gradingResults', error: err.message });
    }

    // --- 5. Delete Student Uploads ---
    try {
        const result = await StudentUpload.deleteMany({ userId: objectId });
        summary.documentCounts.studentUploads = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('studentUploads');
    } catch (err) {
        summary.errors.push({ collection: 'studentUploads', error: err.message });
    }

    // --- 6. Delete Feedback ---
    try {
        const result = await Feedback.deleteMany({ userId: objectId });
        summary.documentCounts.feedback = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('feedback');
    } catch (err) {
        summary.errors.push({ collection: 'feedback', error: err.message });
    }

    // --- 7. Delete Messages (direct messages) ---
    try {
        const result = await Message.deleteMany({
            $or: [
                { senderId: objectId },
                { recipientId: objectId },
                { studentId: objectId }
            ]
        });
        summary.documentCounts.messages = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('messages');
    } catch (err) {
        summary.errors.push({ collection: 'messages', error: err.message });
    }

    // --- 8. Remove from Enrollment Codes (don't delete the code itself) ---
    try {
        const result = await EnrollmentCode.updateMany(
            { 'enrolledStudents.studentId': objectId },
            {
                $pull: { enrolledStudents: { studentId: objectId } },
                $inc: { useCount: -1 }
            }
        );
        summary.documentCounts.enrollmentCodeRefs = result.modifiedCount;
        if (result.modifiedCount > 0) summary.collectionsAffected.push('enrollmentCodes');
    } catch (err) {
        summary.errors.push({ collection: 'enrollmentCodes', error: err.message });
    }

    // --- 9. Remove from Announcements (read receipts only) ---
    try {
        const result = await Announcement.updateMany(
            { 'readBy.studentId': objectId },
            { $pull: { readBy: { studentId: objectId } } }
        );
        summary.documentCounts.announcementRefs = result.modifiedCount;
        if (result.modifiedCount > 0) summary.collectionsAffected.push('announcements');
    } catch (err) {
        summary.errors.push({ collection: 'announcements', error: err.message });
    }

    // --- 10. Anonymize Impersonation Logs (required for audit, can't delete) ---
    try {
        const result = await ImpersonationLog.updateMany(
            { targetId: objectId },
            {
                $set: {
                    targetEmail: '[deleted]',
                    targetRole: 'student'
                }
            }
        );
        summary.documentCounts.impersonationLogsAnonymized = result.modifiedCount;
        if (result.modifiedCount > 0) summary.collectionsAffected.push('impersonationLogs');
    } catch (err) {
        summary.errors.push({ collection: 'impersonationLogs', error: err.message });
    }

    // --- 11. Unlink from Parent accounts ---
    try {
        const result = await User.updateMany(
            { children: objectId },
            { $pull: { children: objectId } }
        );
        summary.documentCounts.parentUnlinks = result.modifiedCount;
        if (result.modifiedCount > 0) summary.collectionsAffected.push('parentLinks');
    } catch (err) {
        summary.errors.push({ collection: 'parentLinks', error: err.message });
    }

    // --- 12. Delete the User document itself (LAST) ---
    try {
        await User.findByIdAndDelete(objectId);
        summary.documentCounts.userDocument = 1;
        summary.collectionsAffected.push('users');
    } catch (err) {
        summary.errors.push({ collection: 'users', error: err.message });
    }

    // --- 13. Destroy any active sessions for this user ---
    try {
        const sessionCollection = mongoose.connection.collection('sessions');
        const result = await sessionCollection.deleteMany({
            'session.passport.user': studentId
        });
        summary.documentCounts.sessions = result.deletedCount;
        if (result.deletedCount > 0) summary.collectionsAffected.push('sessions');
    } catch (err) {
        summary.errors.push({ collection: 'sessions', error: err.message });
    }

    summary.completedAt = new Date();
    summary.durationMs = summary.completedAt - summary.startedAt;

    // Record audit trail
    await recordDeletionAudit(summary);

    return summary;
}

// ============================================================================
// DATA EXPORT - Compile all student data into a single JSON object
// ============================================================================

/**
 * Export all data associated with a student.
 * Used for FERPA right-of-access and data portability.
 *
 * @param {string} studentId - The MongoDB ObjectId of the student
 * @returns {Object} All student data compiled into a single object
 */
async function exportStudentData(studentId) {
    const objectId = new mongoose.Types.ObjectId(studentId);

    const [
        user,
        conversations,
        courseSessions,
        screenerSessions,
        gradingResults,
        uploads,
        feedbackEntries,
        messages
    ] = await Promise.all([
        User.findById(objectId).select('-passwordHash -resetPasswordToken -resetPasswordExpires -emailVerificationToken').lean(),
        Conversation.find({ userId: objectId }).lean(),
        CourseSession.find({ userId: objectId }).lean(),
        ScreenerSession.find({ userId: objectId }).lean(),
        GradingResult.find({ userId: objectId }).lean(),
        StudentUpload.find({ userId: objectId }).select('-fileData').lean(), // Exclude binary data
        Feedback.find({ userId: objectId }).lean(),
        Message.find({
            $or: [
                { senderId: objectId },
                { recipientId: objectId },
                { studentId: objectId }
            ]
        }).lean()
    ]);

    return {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        student: {
            profile: user,
            conversations,
            courseSessions,
            screenerSessions,
            gradingResults,
            uploads: uploads.map(u => ({
                ...u,
                note: 'Binary file data excluded from export. Contact support for file copies.'
            })),
            feedback: feedbackEntries,
            messages
        }
    };
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/privacy/delete-student/:studentId
 * Admin-only: Immediately delete all data for a student.
 */
router.post('/delete-student/:studentId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID' });
        }

        const summary = await cascadeDeleteStudentData(studentId, {
            userId: req.user._id.toString(),
            role: 'admin',
            reason: reason || 'Admin-initiated deletion'
        });

        if (summary.errors.length > 0) {
            logger.warn('[DataPrivacy] Deletion completed with errors', { errors: summary.errors });
        }

        res.json({
            success: true,
            message: 'Student data deleted successfully',
            summary: {
                collectionsAffected: summary.collectionsAffected,
                documentCounts: summary.documentCounts,
                durationMs: summary.durationMs,
                errors: summary.errors.length > 0 ? summary.errors : undefined
            }
        });
    } catch (error) {
        logger.error('[DataPrivacy] Deletion failed', { error: error.message, studentId: req.params.studentId });
        res.status(error.message === 'Student not found' ? 404 : 500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/privacy/delete-child/:studentId
 * Parent-only: Delete data for a linked child.
 */
router.post('/delete-child/:studentId', isAuthenticated, isParent, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID' });
        }

        // Verify parent-child link
        const parent = req.user;
        const isLinked = parent.children && parent.children.some(
            childId => childId.toString() === studentId
        );

        if (!isLinked) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete data for your linked children'
            });
        }

        const summary = await cascadeDeleteStudentData(studentId, {
            userId: req.user._id.toString(),
            role: 'parent',
            reason: reason || 'Parent-initiated deletion'
        });

        res.json({
            success: true,
            message: 'Child data deleted successfully',
            summary: {
                collectionsAffected: summary.collectionsAffected,
                documentCounts: summary.documentCounts,
                durationMs: summary.durationMs
            }
        });
    } catch (error) {
        logger.error('[DataPrivacy] Parent deletion failed', { error: error.message });
        res.status(error.message === 'Student not found' ? 404 : 500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/privacy/export/:studentId
 * Admin or parent (of linked child): Export all student data as JSON.
 */
router.get('/export/:studentId', isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid student ID' });
        }

        // Authorization: Admin can export anyone, parent can export linked child
        const isAdminUser = req.user.roles?.includes('admin') || req.user.role === 'admin';
        const isParentOfChild = req.user.children?.some(
            childId => childId.toString() === studentId
        );

        if (!isAdminUser && !isParentOfChild) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to export this student\'s data'
            });
        }

        const data = await exportStudentData(studentId);

        if (!data.student.profile) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        logger.info('[DataPrivacy] Data export completed', {
            targetUserId: studentId,
            requestedBy: req.user._id.toString(),
            requestedByRole: isAdminUser ? 'admin' : 'parent'
        });

        // Set headers for JSON download
        const studentName = data.student.profile.firstName || 'student';
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="mathmatix-data-export-${studentName}-${Date.now()}.json"`
        );

        res.json(data);
    } catch (error) {
        logger.error('[DataPrivacy] Export failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Data export failed' });
    }
});

/**
 * POST /api/privacy/deletion-request
 * Student or teacher: Submit a deletion request (requires admin approval).
 */
router.post('/deletion-request', isAuthenticated, async (req, res) => {
    try {
        const { studentId, reason } = req.body;
        const requestorRole = req.user.role;

        // Students can only request deletion of their own data
        if (requestorRole === 'student') {
            if (studentId && studentId !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Students can only request deletion of their own data'
                });
            }
        }

        // Teachers can request for students in their class
        if (requestorRole === 'teacher') {
            if (!studentId) {
                return res.status(400).json({
                    success: false,
                    message: 'studentId is required for teacher deletion requests'
                });
            }

            // Verify teacher-student relationship via enrollment
            const enrollment = await EnrollmentCode.findOne({
                teacherId: req.user._id,
                'enrolledStudents.studentId': studentId
            });

            if (!enrollment) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only request deletion for students in your class'
                });
            }
        }

        const targetId = studentId || req.user._id.toString();

        // Log the request (in production, store in a DeletionRequest collection)
        logger.info('[DataPrivacy] Deletion request submitted', {
            targetUserId: targetId,
            requestedBy: req.user._id.toString(),
            requestedByRole: requestorRole,
            reason: reason || 'User-initiated request'
        });

        res.json({
            success: true,
            message: 'Deletion request submitted. An administrator will process your request.',
            requestId: `DR-${Date.now()}`,
            targetUserId: targetId
        });
    } catch (error) {
        logger.error('[DataPrivacy] Deletion request failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to submit deletion request' });
    }
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    router,
    // Exported for use in scripts and tests
    cascadeDeleteStudentData,
    exportStudentData
};
