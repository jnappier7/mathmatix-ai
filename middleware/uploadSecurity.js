// Upload Security Middleware
// Ensures student data privacy and safety

const StudentUpload = require('../models/studentUpload');
const path = require('path');

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
            console.log(`[Upload Security] Access denied for user ${userId} to file ${filename}`);
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this file'
            });
        }

        // Log access for audit trail
        console.log(`[Upload Security] Access granted for user ${userId} to file ${filename} (${isOwner ? 'owner' : isTeacher ? 'teacher' : 'admin'})`);

        next();

    } catch (error) {
        console.error('[Upload Security] Error:', error);
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

    console.log(`[Upload Security] File validated: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

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
        console.log(`[Upload Security] Rate limit exceeded for user ${req.user?._id}`);
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

        console.log(`[Upload Cleanup] Checking for uploads older than ${cutoffDate.toISOString()}`);

        // Get all old uploads
        const oldUploads = await StudentUpload.find({
            uploadedAt: { $lt: cutoffDate }
        });

        console.log(`[Upload Cleanup] Found ${oldUploads.length} candidate uploads for deletion`);

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
                console.log(`[Upload Cleanup] Skipping upload ${upload._id} for user ${user.firstName} ${user.lastName} - retention enabled`);
                continue;
            }

            // Upload is old and user doesn't have retention enabled
            uploadsToDelete.push(upload);
        }

        console.log(`[Upload Cleanup] ${uploadsToDelete.length} uploads will be deleted (${oldUploads.length - uploadsToDelete.length} retained by user preference)`);

        const fs = require('fs');
        const path = require('path');

        for (const upload of uploadsToDelete) {
            try {
                // Delete file from disk using the stored filePath or construct from storedFilename
                const filePath = upload.filePath || path.join(__dirname, '..', 'uploads', upload.storedFilename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[Upload Cleanup] Deleted file: ${upload.storedFilename}`);
                }

                // Delete from database
                await StudentUpload.deleteOne({ _id: upload._id });
                console.log(`[Upload Cleanup] Deleted record: ${upload._id}`);

            } catch (error) {
                console.error(`[Upload Cleanup] Error deleting upload ${upload._id}:`, error);
            }
        }

        console.log(`[Upload Cleanup] Cleanup complete. Deleted ${uploadsToDelete.length} old uploads.`);

    } catch (error) {
        console.error('[Upload Cleanup] Error during cleanup:', error);
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

    console.log('[Upload Cleanup] Auto-deletion scheduler started (runs every 24 hours)');
}

module.exports = {
    verifyUploadAccess,
    validateUpload,
    uploadRateLimiter,
    cleanupOldUploads,
    scheduleCleanup
};
