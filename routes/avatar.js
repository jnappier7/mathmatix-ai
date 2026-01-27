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
        const user = await User.findById(req.user._id).select('avatar.dicebearConfig avatar.dicebearUrl').lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({
            config: user.avatar?.dicebearConfig || null,
            avatarUrl: user.avatar?.dicebearUrl || null
        });
    } catch (error) {
        console.error('ERROR: Failed to fetch avatar config:', error);
        res.status(500).json({ message: 'Server error fetching avatar config.' });
    }
});

/**
 * POST /api/avatar/dicebear
 * Save a DiceBear avatar configuration
 */
router.post('/dicebear', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const { config, avatarUrl } = req.body;

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

        // Initialize avatar object if needed
        if (!user.avatar) {
            user.avatar = {};
        }

        // Update DiceBear config
        user.avatar.dicebearConfig = {
            style: config.style,
            seed: config.seed || Math.random().toString(36).substring(2, 10),
            skinColor: config.skinColor,
            hairColor: config.hairColor,
            backgroundColor: config.backgroundColor || 'transparent',
            glasses: Boolean(config.glasses),
            earrings: Boolean(config.earrings),
            flip: Boolean(config.flip)
        };

        // Store the avatar URL for quick retrieval
        user.avatar.dicebearUrl = avatarUrl;

        // Clear the old selectedAvatarId since they're using a custom avatar now
        user.selectedAvatarId = null;

        // CRITICAL: Mongoose doesn't automatically detect changes to nested subdocuments
        // We must explicitly mark the avatar path as modified for the save to persist
        user.markModified('avatar');

        await user.save();

        console.log(`[Avatar] User ${userId} saved DiceBear avatar: ${config.style}`);

        res.json({
            success: true,
            message: 'Avatar saved successfully!',
            avatarUrl: avatarUrl
        });

    } catch (error) {
        console.error('ERROR: Failed to save DiceBear avatar:', error);
        res.status(500).json({ message: 'Server error saving avatar.' });
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