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

        // Update avatar sub-document
        user.avatar = { //
            skin: skin !== undefined ? skin : user.avatar.skin, //
            hair: hair !== undefined ? hair : user.avatar.hair, //
            top: top !== undefined ? top : user.avatar.top, //
            bottom: bottom !== undefined ? bottom : user.avatar.bottom, //
            accessory: accessory !== undefined ? accessory : user.avatar.accessory, //
            lottiePath: lottiePath !== undefined ? lottiePath : user.avatar.lottiePath // For custom Lottie
        };
        await user.save(); //

        res.json({ success: true, message: 'Avatar updated successfully!', avatar: user.avatar }); //

    } catch (error) {
        console.error('ERROR: Avatar update failed:', error); //
        res.status(500).json({ message: 'Server error updating avatar.' }); //
    }
});

// Route to get a user's avatar details (e.g., for frontend display or by other users/dashboards)
// Frontend would call: GET /api/avatars/:userId
router.get('/:userId', isAuthenticated, async (req, res) => { //
    try {
        const { userId } = req.params; //
        const user = await User.findById(userId).select('avatar').lean(); // Fetch only avatar field
        
        if (!user) { //
            return res.status(404).json({ message: 'User not found.' }); //
        }
        res.json(user.avatar); //
    } catch (error) {
        console.error('ERROR: Failed to fetch avatar:', error); //
        res.status(500).json({ message: 'Server error fetching avatar.' }); //
    }
});


module.exports = router; //