// routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Assuming your User model path
const { isAuthenticated } = require('../middleware/auth'); // For authentication middleware

// POST /api/user/select-tutor
// Allows a logged-in student to select a tutor
router.post('/select-tutor', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id; // Get user ID from authenticated session
        const { tutorId } = req.body; // Tutor ID passed from frontend

        if (!tutorId) {
            return res.status(400).json({ success: false, message: 'Tutor ID is required.' });
        }

        // Find the user and update their selectedTutorId
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Optional: Add validation here to ensure tutorId is a valid/existing tutor
        // e.g., const tutorExists = await User.exists({ _id: tutorId, role: 'teacher' });
        // if (!tutorExists) { return res.status(400).json({ success: false, message: 'Invalid tutor selected.' }); }

        user.selectedTutorId = tutorId;
        await user.save();

        res.status(200).json({ success: true, message: 'Tutor selected successfully!', selectedTutorId: tutorId });

    } catch (error) {
        console.error('Error selecting tutor:', error);
        res.status(500).json({ success: false, message: 'Server error selecting tutor.' });
    }
});

// GET /api/user/:userId/link-code
// Route to get a student's link code for parents (assuming studentToParentLinkCode exists)
router.get('/:userId/link-code', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id; // Authenticated user
        const requestedId = req.params.userId; // ID in URL

        // Ensure the authenticated user is requesting their own code
        if (userId.toString() !== requestedId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You can only view your own link code.' });
        }

        const user = await User.findById(userId);

        if (!user || user.role !== 'student') {
            return res.status(404).json({ message: 'Student not found or not a student role.' });
        }

        if (user.studentToParentLinkCode && user.studentToParentLinkCode.code) {
            // Only return if not already linked to a parent
            if (!user.studentToParentLinkCode.parentLinked) {
                return res.json({
                    code: user.studentToParentLinkCode.code,
                    expiresAt: user.studentToParentLinkCode.expiresAt,
                    parentLinked: user.studentToParentLinkCode.parentLinked
                });
            } else {
                return res.status(200).json({ message: 'Student account is already linked to a parent.' });
            }
        } else {
            // If no code exists, you might want to create one here or
            // respond that no code exists and frontend should prompt generation
            return res.status(404).json({ message: 'No link code found for this student.' });
        }
    } catch (error) {
        console.error('Error fetching student link code:', error);
        res.status(500).json({ message: 'Server error fetching link code.' });
    }
});

// [NEW ROUTE] PATCH /api/user/complete-profile/:id
// Allows a logged-in user to complete their profile (used by complete-profile.js)
router.patch('/complete-profile/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id; // ID of the authenticated user
        const profileId = req.params.id; // ID from the URL parameter

        // Security check: Ensure the authenticated user is only updating their OWN profile
        if (userId.toString() !== profileId.toString()) {
            return res.status(403).json({ message: 'Forbidden: You can only update your own profile.' });
        }

        const updates = req.body; // The data sent from the frontend form

        // Define allowed fields to update based on the User schema and profile completion form
        const allowedFields = [
            'firstName', 'lastName', 'name', 'gradeLevel', 'mathCourse',
            'learningStyle', 'tonePreference', 'interests',
            'reportFrequency', 'parentTone', 'parentLanguage', 'goalViewPreference',
            'needsProfileCompletion' // This should be set to false on completion
        ];

        const validUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                validUpdates[key] = updates[key];
            }
        }

        // Special handling for 'name' based on 'firstName' and 'lastName'
        // If firstName or lastName are being updated, ensure 'name' is derived correctly
        if (validUpdates.firstName !== undefined || validUpdates.lastName !== undefined) {
            const currentUser = await User.findById(userId); // Get current user to merge names
            const newFirstName = validUpdates.firstName !== undefined ? validUpdates.firstName : currentUser.firstName;
            const newLastName = validUpdates.lastName !== undefined ? validUpdates.lastName : currentUser.lastName;
            validUpdates.name = `${newFirstName} ${newLastName}`.trim();
        }

        // If interests is sent as a string (comma-separated), convert to array
        if (typeof validUpdates.interests === 'string') {
            validUpdates.interests = validUpdates.interests.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (Object.keys(validUpdates).length === 0) {
            return res.status(400).json({ message: 'No valid profile fields provided for update.' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: validUpdates },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found during update.' });
        }

        res.status(200).json({ success: true, message: 'Profile updated successfully!', user: updatedUser.toObject() });

    } catch (error) {
        console.error('Error updating user profile:', error);
        // Provide more specific error messages if possible (e.g., validation errors)
        res.status(500).json({ success: false, message: 'Server error updating profile. Please try again.' });
    }
});


module.exports = router;