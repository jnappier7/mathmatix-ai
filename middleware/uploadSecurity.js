// Upload Security Middleware
// Ensures student data privacy and safety

const StudentUpload = require('../models/studentUpload');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { moderateImage } = require('../utils/openaiClient');

// Categories that should always reject K-12 uploads, even if OpenAI's overall
// `flagged` is false. We're stricter than the default threshold for student
// safety. Score threshold is intentionally low.
const STRICT_CATEGORIES = ['sexual', 'sexual/minors', 'violence/graphic', 'self-harm'];
const STRICT_SCORE_THRESHOLD = 0.3;
const IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function isStrictlyFlagged({ flagged, categories, scores }) {
    if (flagged) return true;
    for (const cat of STRICT_CATEGORIES) {
        if (categories?.[cat]) return true;
        if ((scores?.[cat] || 0) >= STRICT_SCORE_THRESHOLD) return true;
    }
    return false;
}

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
 * - Scan images for inappropriate content via OpenAI's moderation API
 *
 * Behavior on moderation API failure:
 *   - Default: fail-open (allow upload, log warning) so a moderation outage
 *     doesn't take the whole upload pipeline down.
 *   - STRICT_MODERATION=true: fail-closed (reject upload).
 */
async function validateUpload(req, res, next) {
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

    // Content moderation — images only. PDFs need text/page extraction
    // before we can moderate, which is heavy enough to be a follow-up.
    if (IMAGE_MIMETYPES.has(file.mimetype)) {
        const strict = process.env.STRICT_MODERATION === 'true';
        try {
            const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
            if (!buffer) {
                logger.warn('[Upload Moderation] No buffer/path available, skipping moderation', {
                    userId: req.user?._id?.toString(),
                    filename: file.originalname
                });
                return next();
            }

            const result = await moderateImage(buffer, file.mimetype);
            const blocked = isStrictlyFlagged(result);

            if (blocked) {
                logger.warn('[Upload Moderation] Rejected flagged upload', {
                    userId: req.user?._id?.toString(),
                    filename: file.originalname,
                    categories: Object.keys(result.categories || {}).filter(k => result.categories[k])
                });
                // Best-effort cleanup of the saved file so flagged content
                // doesn't sit on disk waiting for the retention sweep.
                if (file.path && fs.existsSync(file.path)) {
                    try { fs.unlinkSync(file.path); } catch (_) { /* non-blocking */ }
                }
                return res.status(400).json({
                    success: false,
                    message: 'This image was flagged by our content safety check. Please upload a different image.'
                });
            }

            logger.info('[Upload Moderation] Image passed moderation', {
                userId: req.user?._id?.toString(),
                filename: file.originalname
            });
        } catch (err) {
            logger.error('[Upload Moderation] Moderation API error', {
                userId: req.user?._id?.toString(),
                filename: file.originalname,
                error: err.message,
                strict
            });
            if (strict) {
                return res.status(503).json({
                    success: false,
                    message: 'Content safety check is temporarily unavailable. Please try again shortly.'
                });
            }
            // Fail-open: log and continue.
        }
    }

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
 * Default retention window for student uploads. Override per environment
 * with UPLOAD_RETENTION_DAYS (e.g., longer for paid tiers, shorter for
 * districts with strict data-minimization policies).
 */
const DEFAULT_UPLOAD_RETENTION_DAYS = 30;

function getRetentionDays() {
    const raw = parseInt(process.env.UPLOAD_RETENTION_DAYS, 10);
    if (!Number.isFinite(raw) || raw < 1) return DEFAULT_UPLOAD_RETENTION_DAYS;
    return raw;
}

/**
 * Auto-deletion job
 * Deletes uploads older than the configured retention period.
 * Respects user's retainUploadsIndefinitely setting (set by parent/teacher/admin)
 * and individual StudentUpload.retainIndefinitely flag.
 */
async function cleanupOldUploads() {
    try {
        const retentionDays = getRetentionDays();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        logger.info('[Upload Cleanup] Checking for old uploads', { cutoffDate: cutoffDate.toISOString(), retentionDays });

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
    scheduleCleanup,
    getRetentionDays,
    DEFAULT_UPLOAD_RETENTION_DAYS,
    // Exported for unit testing — keeps the moderation policy in one place.
    isStrictlyFlagged,
    STRICT_CATEGORIES,
    STRICT_SCORE_THRESHOLD
};
