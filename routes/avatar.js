// routes/avatar.js - PHASE 1: Backend Routing & Core Setup - Batch 5
// Handles POST /api/avatars for saving avatar parts, GET /api/avatars/:userId)

const express = require('express');
const router = express.Router();
const User = require('../models/user'); // CORRECTED: Path changed from '../models/User' to '../models/user'
const { isAuthenticated } = require('../middleware/auth'); // Assuming auth middleware is used

// Route to update a user's custom avatar parts
// Frontend would call: POST /api/avatars
router.post('/', isAuthenticated, async (req, res) => { //
    try {
        const userId = req.user._id; //
        const { skin, hair, top, bottom, accessory, lottiePath } = req.body; // lottiePath for custom animations

        const user = await User.findById(userId); //
        if (!user) { //
            return res.status(404).json({ message: 'User not found.' }); //
        }

        // SECURITY FIX: Validate lottiePath to prevent path traversal and external URL injection
        if (lottiePath !== undefined) {
            // Only allow paths within /images/ or /animations/ directories
            const allowedPathPattern = /^\/?(images|animations)\/[\w\-\/\.]+\.(json|lottie)$/i;
            // Prevent path traversal attacks
            const pathTraversalPattern = /\.\./;

            if (pathTraversalPattern.test(lottiePath) || !allowedPathPattern.test(lottiePath)) {
                console.warn(`WARN: Invalid lottiePath attempted by user ${userId}: ${lottiePath}`);
                return res.status(400).json({ message: 'Invalid avatar path. Only paths within /images/ or /animations/ are allowed.' });
            }
        }

        // Update avatar sub-document while preserving existing DiceBear config
        user.avatar = {
            // Preserve existing DiceBear data if present
            dicebearConfig: user.avatar?.dicebearConfig,
            dicebearUrl: user.avatar?.dicebearUrl,
            // Update legacy avatar parts
            skin: skin !== undefined ? skin : user.avatar?.skin,
            hair: hair !== undefined ? hair : user.avatar?.hair,
            top: top !== undefined ? top : user.avatar?.top,
            bottom: bottom !== undefined ? bottom : user.avatar?.bottom,
            accessory: accessory !== undefined ? accessory : user.avatar?.accessory,
            lottiePath: lottiePath !== undefined ? lottiePath : user.avatar?.lottiePath
        };
        user.markModified('avatar');
        await user.save();

        res.json({ success: true, message: 'Avatar updated successfully!', avatar: user.avatar }); //

    } catch (error) {
        console.error('ERROR: Avatar update failed:', error); //
        res.status(500).json({ message: 'Server error updating avatar.' }); //
    }
});

// ============ DICEBEAR AVATAR ENDPOINTS ============
// NOTE: Static routes MUST be defined BEFORE dynamic parameter routes (like /:userId)

/**
 * GET /api/avatar/config
 * Get the current user's DiceBear avatar configuration
 */
router.get('/config', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('avatar.dicebearConfig avatar.dicebearUrl avatarGallery').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({
            config: user.avatar?.dicebearConfig || null,
            avatarUrl: user.avatar?.dicebearUrl || null,
            gallery: user.avatarGallery || []
        });
    } catch (error) {
        console.error('ERROR: Failed to fetch avatar config:', error);
        res.status(500).json({ message: 'Server error fetching avatar config.' });
    }
});

/**
 * GET /api/avatar/gallery
 * Get the user's avatar gallery (up to 3 saved custom avatars)
 */
router.get('/gallery', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('avatarGallery').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({
            gallery: user.avatarGallery || [],
            maxSlots: 3,
            slotsUsed: (user.avatarGallery || []).length
        });
    } catch (error) {
        console.error('ERROR: Failed to fetch avatar gallery:', error);
        res.status(500).json({ message: 'Server error fetching avatar gallery.' });
    }
});

/**
 * POST /api/avatar/dicebear
 * Save a DiceBear avatar to the gallery (max 3 slots)
 */
router.post('/dicebear', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const { config, avatarUrl, name, slotIndex } = req.body;

        if (!config || !avatarUrl) {
            return res.status(400).json({ message: 'Config and avatarUrl are required.' });
        }

        // Validate the avatar URL is from DiceBear
        if (!avatarUrl.startsWith('https://api.dicebear.com/')) {
            return res.status(400).json({ message: 'Invalid avatar URL. Must be from DiceBear API.' });
        }

        // Validate config has required fields
        const allowedStyles = ['adventurer', 'adventurer-neutral', 'big-smile', 'lorelei', 'micah', 'pixel-art', 'thumbs', 'fun-emoji'];
        if (!config.style || !allowedStyles.includes(config.style)) {
            return res.status(400).json({ message: 'Invalid avatar style.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Initialize gallery if needed
        if (!user.avatarGallery) {
            user.avatarGallery = [];
        }

        const avatarData = {
            name: name || `Avatar ${user.avatarGallery.length + 1}`,
            dicebearConfig: {
                style: config.style,
                seed: config.seed || Math.random().toString(36).substring(2, 10),
                skinColor: config.skinColor,
                hairColor: config.hairColor,
                backgroundColor: config.backgroundColor || 'transparent',
                glasses: Boolean(config.glasses),
                earrings: Boolean(config.earrings),
                flip: Boolean(config.flip)
            },
            dicebearUrl: avatarUrl,
            createdAt: new Date()
        };

        // If slotIndex is provided, replace that slot; otherwise add new or replace oldest
        if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < 3) {
            // Replace specific slot
            user.avatarGallery[slotIndex] = avatarData;
        } else if (user.avatarGallery.length < 3) {
            // Add to gallery if under limit
            user.avatarGallery.push(avatarData);
        } else {
            // Gallery full - replace oldest (index 0) and shift
            user.avatarGallery.shift();
            user.avatarGallery.push(avatarData);
        }

        // Also set as current active avatar
        if (!user.avatar) {
            user.avatar = {};
        }
        user.avatar.dicebearConfig = avatarData.dicebearConfig;
        user.avatar.dicebearUrl = avatarData.dicebearUrl;

        // Clear the old selectedAvatarId since they're using a custom avatar now
        user.selectedAvatarId = null;

        user.markModified('avatar');
        user.markModified('avatarGallery');

        await user.save();

        const savedIndex = typeof slotIndex === 'number' ? slotIndex : user.avatarGallery.length - 1;
        console.log(`[Avatar] User ${userId} saved DiceBear avatar to slot ${savedIndex}: ${config.style}`);

        res.json({
            success: true,
            message: 'Avatar saved successfully!',
            avatarUrl: avatarUrl,
            slotIndex: savedIndex,
            gallery: user.avatarGallery
        });

    } catch (error) {
        console.error('ERROR: Failed to save DiceBear avatar:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ message: 'Server error saving avatar: ' + error.message });
    }
});

/**
 * DELETE /api/avatar/gallery/:index
 * Delete an avatar from a specific gallery slot
 */
router.delete('/gallery/:index', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const slotIndex = parseInt(req.params.index, 10);

        if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 2) {
            return res.status(400).json({ message: 'Invalid slot index. Must be 0, 1, or 2.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.avatarGallery || slotIndex >= user.avatarGallery.length) {
            return res.status(404).json({ message: 'No avatar in that slot.' });
        }

        // Remove the avatar at the specified index
        user.avatarGallery.splice(slotIndex, 1);
        user.markModified('avatarGallery');

        await user.save();

        console.log(`[Avatar] User ${userId} deleted avatar from slot ${slotIndex}`);

        res.json({
            success: true,
            message: 'Avatar deleted successfully!',
            gallery: user.avatarGallery
        });

    } catch (error) {
        console.error('ERROR: Failed to delete avatar:', error);
        res.status(500).json({ message: 'Server error deleting avatar.' });
    }
});

/**
 * POST /api/avatar/gallery/:index/select
 * Select an avatar from the gallery as the active avatar
 */
router.post('/gallery/:index/select', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const slotIndex = parseInt(req.params.index, 10);

        if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 2) {
            return res.status(400).json({ message: 'Invalid slot index. Must be 0, 1, or 2.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.avatarGallery || slotIndex >= user.avatarGallery.length) {
            return res.status(404).json({ message: 'No avatar in that slot.' });
        }

        const selectedAvatar = user.avatarGallery[slotIndex];

        // Set as active avatar
        if (!user.avatar) {
            user.avatar = {};
        }
        user.avatar.dicebearConfig = selectedAvatar.dicebearConfig;
        user.avatar.dicebearUrl = selectedAvatar.dicebearUrl;
        user.selectedAvatarId = `gallery-${slotIndex}`;

        user.markModified('avatar');

        await user.save();

        console.log(`[Avatar] User ${userId} selected gallery avatar slot ${slotIndex}`);

        res.json({
            success: true,
            message: 'Avatar selected!',
            avatarUrl: selectedAvatar.dicebearUrl
        });

    } catch (error) {
        console.error('ERROR: Failed to select avatar:', error);
        res.status(500).json({ message: 'Server error selecting avatar.' });
    }
});

// ============ DYNAMIC PARAMETER ROUTES ============
// NOTE: Dynamic parameter routes MUST come AFTER all static routes

/**
 * GET /api/avatar/:userId
 * Get a user's avatar details (e.g., for frontend display or by other users/dashboards)
 */
router.get('/:userId', isAuthenticated, async (req, res) => {
    try {
        const requestedId = req.params.userId;
        if (requestedId !== req.user._id.toString()) {
            return res.status(403).json({ message: "Forbidden." });
        }
        const user = await User.findById(requestedId).select('avatar').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user.avatar);
    } catch (error) {
        console.error('ERROR: Failed to fetch avatar:', error);
        res.status(500).json({ message: 'Server error fetching avatar.' });
    }
});


module.exports = router;