// Upload Security Middleware
// Ensures student data privacy and safety

const StudentUpload = require('../models/studentUpload');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Middleware to verify user can access uploaded file
 * Only allows:
 * - The student who uploaded it
 * - The student's assigned teacher
 * - Admins (for moderation)
 */
async function verifyUploadAccess(req, res, next) {
    try {
        const filename = path.basename(req.path);
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Find the upload record
        const upload = await StudentUpload.findOne({ storedFilename: filename });

        if (!upload) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Check if user is the owner
        const isOwner = upload.userId.toString() === userId.toString();

        // Check if user is the student's teacher
        const User = require('../models/user');
        const student = await User.findById(upload.userId);
        const isTeacher = student && student.teacherId &&
                         student.teacherId.toString() === userId.toString();

        // Check if user is admin
        const currentUser = await User.findById(userId);
        const isAdmin = currentUser && currentUser.role === 'admin';

        if (!isOwner && !isTeacher && !isAdmin) {
            logger.warn('[Upload Security] Access denied', { userId: userId?.toString(), filename });
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this file'
            });
        }

        // Log access for audit trail
        logger.info('[Upload Security] Access granted', { userId: userId?.toString(), filename, accessType: isOwner ? 'owner' : isTeacher ? 'teacher' : 'admin' });

        next();

    } catch (error) {
        logger.error('[Upload Security] Error verifying access', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Error verifying file access'
        });
    }
}

/**
 * Validate file uploads for safety
 * - Check file size
 * - Validate file type
 * - Scan for inappropriate content (future: integrate content moderation API)
 */
function validateUpload(req, res, next) {
    const file = req.file;

    if (!file) {
        return next();
    }

    // File size validation (already handled by multer, but double-check)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
        return res.status(400).json({
            success: false,
            message: 'File is too large. Maximum size is 10MB.'
        });
    }

    // File type validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid file type. Only images (JPG, PNG, WEBP) and PDFs are allowed.'
        });
    }

    // Check filename for suspicious patterns
    const suspiciousPatterns = /[<>:"|?*\x00-\x1f]/;
    if (suspiciousPatterns.test(file.originalname)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid filename'
        });
    }

    logger.info('[Upload Security] File validated', { mimetype: file.mimetype, size: file.size });

    // TODO: Integrate content moderation API here
    // Example: await moderateImage(file.path);

    next();
}

/**
 * Rate limiting specifically for uploads
 * Prevents spam and abuse
 */
const uploadRateLimiter = require('express-rate-limit')({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Max 20 uploads per 15 minutes
    message: 'Too many uploads. Please try again in a few minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    // Store in memory (for production, use Redis)
    handler: (req, res) => {
        logger.warn('[Upload Security] Rate limit exceeded', { userId: req.user?._id?.toString() });
        res.status(429).json({
            success: false,
            message: 'Too many uploads. Please slow down and try again in a few minutes.'
        });
    }
});

/**
 * Auto-deletion job
 * Deletes uploads older than specified retention period
 * Respects user's retainUploadsIndefinitely setting (set by parent/teacher/admin)
 */
async function cleanupOldUploads() {
    try {
        const RETENTION_DAYS = 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

        logger.info('[Upload Cleanup] Checking for old uploads', { cutoffDate: cutoffDate.toISOString() });

        // Get all old uploads
        const oldUploads = await StudentUpload.find({
            uploadedAt: { $lt: cutoffDate }
        });

        logger.info('[Upload Cleanup] Found candidate uploads', { count: oldUploads.length });

        // Check each upload's user to see if they have retention enabled
        const User = require('../models/user');
        const uploadsToDelete = [];

        for (const upload of oldUploads) {
            const user = await User.findById(upload.userId);

            if (!user) {
                // User deleted, safe to delete upload
                uploadsToDelete.push(upload);
                continue;
            }

            if (user.retainUploadsIndefinitely) {
                logger.debug('[Upload Cleanup] Skipping upload - retention enabled', { uploadId: upload._id?.toString() });
                continue;
            }

            // Upload is old and user doesn't have retention enabled
            uploadsToDelete.push(upload);
        }

        logger.info('[Upload Cleanup] Deletion plan', { toDelete: uploadsToDelete.length, retained: oldUploads.length - uploadsToDelete.length });

        const fs = require('fs');
        const path = require('path');

        for (const upload of uploadsToDelete) {
            try {
                // Delete file from disk using the stored filePath or construct from storedFilename
                const filePath = upload.filePath || path.join(__dirname, '..', 'uploads', upload.storedFilename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    logger.debug('[Upload Cleanup] Deleted file', { filename: upload.storedFilename });
                }

                // Delete from database
                await StudentUpload.deleteOne({ _id: upload._id });
                logger.debug('[Upload Cleanup] Deleted record', { uploadId: upload._id?.toString() });

            } catch (error) {
                logger.error('[Upload Cleanup] Error deleting upload', { uploadId: upload._id?.toString(), error: error.message });
            }
        }

        logger.info('[Upload Cleanup] Cleanup complete', { deleted: uploadsToDelete.length });

    } catch (error) {
        logger.error('[Upload Cleanup] Error during cleanup', { error: error.message });
    }
}

/**
 * Schedule auto-deletion job
 * Runs daily at 2 AM
 */
function scheduleCleanup() {
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    // Run immediately on startup (after a delay)
    setTimeout(cleanupOldUploads, 60 * 1000); // 1 minute after startup

    // Then run every 24 hours
    setInterval(cleanupOldUploads, CLEANUP_INTERVAL);

    logger.info('[Upload Cleanup] Auto-deletion scheduler started');
}

module.exports = {
    verifyUploadAccess,
    validateUpload,
    uploadRateLimiter,
    cleanupOldUploads,
    scheduleCleanup
};
