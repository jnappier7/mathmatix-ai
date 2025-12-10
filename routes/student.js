// routes/student.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// Handles student-specific API actions.

const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/user');
const StudentUpload = require('../models/studentUpload');
const { isAuthenticated, isStudent } = require('../middleware/auth'); // Import isStudent middleware
const crypto = require('crypto'); // Node.js built-in module for cryptography

// Helper function to generate a unique short code for student-to-parent linking
async function generateUniqueStudentLinkCode() {
    let code;
    let isUnique = false;
    while (!isUnique) {
        // Generate a random 3-byte hex string (6 characters) for uniqueness
        code = crypto.randomBytes(3).toString('hex').toUpperCase();
        // Check if this code already exists for any user's studentToParentLinkCode
        const existingUser = await User.findOne({ 'studentToParentLinkCode.code': `MATH-${code}` });
        if (!existingUser) {
            isUnique = true;
        }
    }
    return `MATH-${code}`; // Prefix for readability (e.g., MATH-A1B2C3)
}

// POST /api/student/generate-link-code
// Allows a student to generate a code for their parent to link.
router.post('/generate-link-code', isAuthenticated, isStudent, async (req, res) => {
    // Middleware ensures only authenticated students can access this.
    const studentId = req.user._id;

    try {
        const student = await User.findById(studentId);
        if (!student) { // Should not happen if isAuthenticated works, but defensive check
            return res.status(404).json({ success: false, message: 'Student account not found.' });
        }

        // Check if an active, unused link code already exists for this student
        // Also checks if parentLinked is false, meaning it hasn't been used yet.
        if (student.studentToParentLinkCode && student.studentToParentLinkCode.code && !student.studentToParentLinkCode.parentLinked) {
            console.log(`LOG: Returning existing student link code for student ${student.username}`);
            return res.json({
                success: true,
                code: student.studentToParentLinkCode.code,
                message: 'An active link code already exists.'
            });
        }

        const newLinkCode = await generateUniqueStudentLinkCode();
        
        // Store the new link code on the student's user object
        student.studentToParentLinkCode = {
            code: newLinkCode,
            parentLinked: false // Reset this flag for a new code
        };
        await student.save();

        console.log(`LOG: Generated new student link code: ${newLinkCode} for student ${student.username}`);
        res.json({ success: true, code: newLinkCode, message: 'New link code generated successfully.' });

    } catch (err) {
        console.error('ERROR: Failed to generate student link code:', err);
        res.status(500).json({ success: false, message: 'Server error generating link code.' });
    }
});

// GET /api/student/linked-parent
// Allows a student to check if they are linked to a parent.
router.get('/linked-parent', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id).select('parentIds').populate('parentIds', 'firstName lastName username role');
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // Check if student has any linked parents
        if (student.parentIds && student.parentIds.length > 0) {
            // Return first parent (could be enhanced to return all parents)
            const parent = student.parentIds[0];
            res.json({
                isLinked: true,
                parentId: parent._id,
                parentName: `${parent.firstName} ${parent.lastName}`,
                totalParents: student.parentIds.length
            });
        } else {
            res.json({ isLinked: false, message: 'Not linked to a parent account.' });
        }
    } catch (error) {
        console.error("ERROR: Failed to check linked parent status:", error);
        res.status(500).json({ message: "Server error checking link status." });
    }
});

// GET /api/student/progress
// Returns student's learning progress (mastered, learning, ready skills)
router.get('/progress', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Check if assessment completed
        if (!student.learningProfile?.assessmentCompleted) {
            return res.json({
                assessmentCompleted: false,
                message: 'Assessment not yet completed'
            });
        }

        // Parse skill mastery data
        const mastered = [];
        const learning = [];
        const ready = [];

        if (student.skillMastery && student.skillMastery.size > 0) {
            for (const [skillId, data] of student.skillMastery) {
                const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                const skillData = {
                    skillId,
                    displayName,
                    status: data.status,
                    masteryScore: data.masteryScore,
                    lastPracticed: data.lastPracticed,
                    notes: data.notes
                };

                if (data.status === 'mastered') {
                    skillData.masteredDate = data.masteredDate;
                    mastered.push(skillData);
                } else if (data.status === 'learning') {
                    skillData.learningStarted = data.learningStarted;
                    skillData.consecutiveCorrect = data.consecutiveCorrect;
                    learning.push(skillData);
                } else if (data.status === 'ready') {
                    ready.push(skillData);
                }
            }
        }

        // Sort mastered by date (most recent first)
        mastered.sort((a, b) => new Date(b.masteredDate) - new Date(a.masteredDate));

        res.json({
            assessmentCompleted: true,
            assessmentDate: student.learningProfile.assessmentDate,
            progress: {
                mastered,
                learning,
                ready
            },
            stats: {
                totalMastered: mastered.length,
                currentlyLearning: learning.length,
                readyToLearn: ready.length
            }
        });

    } catch (error) {
        console.error('ERROR: Failed to get student progress:', error);
        res.status(500).json({ error: 'Failed to retrieve progress' });
    }
});

// GET /api/student/progress/summary
// Returns a quick summary for dashboard cards
router.get('/progress/summary', isAuthenticated, isStudent, async (req, res) => {
    try {
        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (!student.learningProfile?.assessmentCompleted) {
            return res.json({
                assessmentCompleted: false,
                canTakeAssessment: true
            });
        }

        // Get most recent mastered skill
        let recentMastery = null;
        let currentLearning = null;
        let nextReady = null;

        if (student.skillMastery && student.skillMastery.size > 0) {
            const mastered = [];
            const learning = [];
            const ready = [];

            for (const [skillId, data] of student.skillMastery) {
                const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                if (data.status === 'mastered' && data.masteredDate) {
                    mastered.push({ skillId, displayName, date: data.masteredDate });
                } else if (data.status === 'learning') {
                    learning.push({
                        skillId,
                        displayName,
                        progress: Math.round((data.masteryScore || 0) * 100)
                    });
                } else if (data.status === 'ready') {
                    ready.push({ skillId, displayName });
                }
            }

            // Most recent mastered
            if (mastered.length > 0) {
                mastered.sort((a, b) => new Date(b.date) - new Date(a.date));
                recentMastery = mastered[0];
            }

            // Current learning (first one)
            if (learning.length > 0) {
                currentLearning = learning[0];
            }

            // Next ready skill
            if (ready.length > 0) {
                nextReady = ready[0];
            }
        }

        // Recent wins from learning profile
        const recentWins = student.learningProfile?.recentWins?.slice(0, 3) || [];

        res.json({
            assessmentCompleted: true,
            recentMastery,
            currentLearning,
            nextReady,
            recentWins: recentWins.map(w => ({
                description: w.description,
                date: w.date
            }))
        });

    } catch (error) {
        console.error('ERROR: Failed to get progress summary:', error);
        res.status(500).json({ error: 'Failed to retrieve summary' });
    }
});

// POST /api/student/start-skill
// Mark a skill as "learning" when student starts it
router.post('/start-skill', isAuthenticated, isStudent, async (req, res) => {
    try {
        const { skillId } = req.body;
        if (!skillId) {
            return res.status(400).json({ error: 'Skill ID required' });
        }

        const student = await User.findById(req.user._id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Initialize skillMastery if needed
        if (!student.skillMastery) {
            student.skillMastery = new Map();
        }

        // Check current status
        const currentStatus = student.skillMastery.get(skillId);

        if (currentStatus?.status === 'mastered') {
            return res.json({
                message: 'Skill already mastered',
                status: 'mastered'
            });
        }

        // Set to learning
        student.skillMastery.set(skillId, {
            status: 'learning',
            masteryScore: currentStatus?.masteryScore || 0.1,
            learningStarted: currentStatus?.learningStarted || new Date(),
            lastPracticed: new Date()
        });

        student.markModified('skillMastery');
        await student.save();

        res.json({
            success: true,
            skillId,
            status: 'learning'
        });

    } catch (error) {
        console.error('ERROR: Failed to start skill:', error);
        res.status(500).json({ error: 'Failed to start skill' });
    }
});

// GET /api/student/uploads
// Retrieve student's uploaded files for their personal resource library
router.get('/uploads', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const limit = parseInt(req.query.limit) || 50;

        // Get recent uploads
        const uploads = await StudentUpload.getRecentUploads(studentId, limit);

        res.json({
            success: true,
            uploads: uploads.map(upload => ({
                _id: upload._id,
                originalFilename: upload.originalFilename,
                fileType: upload.fileType,
                fileSize: upload.fileSize,
                uploadedAt: upload.uploadedAt,
                notes: upload.notes,
                tags: upload.tags
            }))
        });

    } catch (error) {
        console.error('[Student Uploads] Error fetching uploads:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve uploads'
        });
    }
});

// GET /api/student/uploads/:uploadId
// Get full details of a specific upload including extracted text
router.get('/uploads/:uploadId', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { uploadId } = req.params;

        const upload = await StudentUpload.getUploadDetails(uploadId, studentId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                message: 'Upload not found'
            });
        }

        res.json({
            success: true,
            upload: upload
        });

    } catch (error) {
        console.error('[Student Uploads] Error fetching upload details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve upload details'
        });
    }
});

// GET /api/student/uploads/:uploadId/file
// Serve the actual file (for viewing/downloading)
router.get('/uploads/:uploadId/file', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { uploadId } = req.params;

        const upload = await StudentUpload.getUploadDetails(uploadId, studentId);

        if (!upload) {
            return res.status(404).json({
                success: false,
                message: 'Upload not found'
            });
        }

        // Send the file
        res.sendFile(upload.filePath, (err) => {
            if (err) {
                console.error('[Student Uploads] Error sending file:', err);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve file'
                });
            }
        });

    } catch (error) {
        console.error('[Student Uploads] Error serving file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve file'
        });
    }
});

module.exports = {
    router,
    generateUniqueStudentLinkCode
};