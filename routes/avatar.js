// routes/avatar.js
const express = require('express');
const router = express.Router();
const User = require('../models/user'); // CORRECTED: Path changed from '../models/User' to '../models/user'
const { isAuthenticated } = require('../middleware/auth'); // Assuming auth middleware is used

// Example route for avatars (assuming functionality like updating avatar parts)
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const { skin, hair, top, bottom, accessory } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.avatar = {
            skin: skin || user.avatar.skin,
            hair: hair || user.avatar.hair,
            top: top || user.avatar.top,
            bottom: bottom || user.avatar.bottom,
            accessory: accessory || user.avatar.accessory
        };
        await user.save();

        res.json({ success: true, message: 'Avatar updated successfully!', avatar: user.avatar });

    } catch (error) {
        console.error('ERROR: Avatar update failed:', error);
        res.status(500).json({ message: 'Server error updating avatar.' });
    }
});

// Example route to get a user's avatar (e.g., for frontend display)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).select('avatar').lean(); // Fetch only avatar field
        
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