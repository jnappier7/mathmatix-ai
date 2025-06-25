// routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Ensure correct path to your User model
const { isAuthenticated } = require('../middleware/auth'); // Assuming auth middleware is used

// Route to get a user's basic data (used by frontend script.js /user fetch)
router.get('/', isAuthenticated, async (req, res) => {
    // req.user is populated by Passport.js deserializeUser.
    // Ensure you return enough data for the frontend to initialize.
    try {
        if (!req.user) {
            return res.status(401).json({ message: "User not authenticated or session invalid." });
        }
        // Use .lean() for faster retrieval if you're not modifying and saving the Mongoose document here
        const user = await User.findById(req.user._id).lean(); 
        if (!user) {
            return res.status(404).json({ message: "User data not found in DB." });
        }
        res.json({ user });
    } catch (error) {
        console.error("Error fetching user data from /user route:", error);
        res.status(500).json({ message: "Server error fetching user data." });
    }
});


// NEW: Route to update user settings (tone, style, hands-free mode, selected tutor)
router.post('/settings', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id; // User ID from authenticated session
        const { selectedTutorId, voiceTone, learningStyle, isHandsFreeModeEnabled } = req.body;

        const updateFields = {};
        if (selectedTutorId !== undefined) updateFields.selectedTutorId = selectedTutorId;
        if (voiceTone !== undefined) updateFields.tonePreference = voiceTone; // Map to tonePreference in schema
        if (learningStyle !== undefined) updateFields.learningStyle = learningStyle;
        // The isHandsFreeModeEnabled boolean from frontend maps to a setting
        // You might want a dedicated field on your User model for this or handle it client-side only.
        // For now, let's assume it's just client-side state or update a generic "settings" sub-object.
        // If you want to save it, add `handsFreeModeEnabled: { type: Boolean, default: false }` to your User schema.

        if (isHandsFreeModeEnabled !== undefined) updateFields.handsFreeModeEnabled = isHandsFreeModeEnabled; // Adding this to save to DB

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid settings provided for update." });
        }

        // Find and update the user, return the new document.
        const user = await User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true, runValidators: true }).lean();

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json({ success: true, message: "Settings updated successfully!", updatedUser: user });

    } catch (error) {
        console.error("ERROR: Failed to save user settings:", error);
        res.status(500).json({ message: "Error saving settings." });
    }
});

// Route to handle profile completion (from complete-profile.js)
router.patch('/complete-profile/:userId', isAuthenticated, async (req, res) => {
    try {
        const { userId } = req.params;
        // Ensure the authenticated user is only updating their own profile
        if (req.user._id.toString() !== userId) {
            return res.status(403).json({ message: "Forbidden: You can only update your own profile." });
        }

        const updates = req.body;

        const allowedUpdates = [
            'firstName', 'lastName', 'username', 'email', 'gradeLevel', 'mathCourse',
            'tonePreference', 'learningStyle', 'interests', 'needsProfileCompletion',
            'reportFrequency', 'parentTone', 'parentLanguage', 'goalViewPreference'
        ];

        const filteredUpdates = {};
        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        // Handle 'name' field consistency if firstName/lastName are updated
        if (filteredUpdates.firstName !== undefined || filteredUpdates.lastName !== undefined) {
            const existingUser = await User.findById(userId); // Fetch current user to get existing names if only one is updated
            const newFirstName = filteredUpdates.firstName !== undefined ? filteredUpdates.firstName : (existingUser ? existingUser.firstName : '');
            const newLastName = filteredUpdates.lastName !== undefined ? filteredUpdates.lastName : (existingUser ? existingUser.lastName : '');
            filteredUpdates.name = `${newFirstName} ${newLastName}`.trim();
        }

        // Special handling for interests: convert comma-separated string to array if it comes that way
        if (typeof filteredUpdates.interests === 'string') {
            filteredUpdates.interests = filteredUpdates.interests.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }

        const updatedUser = await User.findByIdAndUpdate(userId, { $set: filteredUpdates }, { new: true, runValidators: true }).lean();

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found or profile not updated." });
        }

        res.json({ success: true, message: "Profile updated successfully!", user: updatedUser });

    } catch (error) {
        console.error('ERROR: Profile completion update failed:', error);
        res.status(500).json({ message: "Failed to complete profile." });
    }
});

module.exports = router;