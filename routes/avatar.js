// routes/avatar.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
// CORRECTED: Import 'isAuthenticated' specifically from the auth middleware object
const { isAuthenticated } = require('../middleware/auth'); // Ensures user is authenticated

// PATCH /api/avatar
// Use isAuthenticated middleware to protect this route
router.patch('/', isAuthenticated, async (req, res) => { // 'isAuthenticated' is the function
  try {
    const userId = req.user._id;
    const { avatar } = req.body;

    if (!avatar || typeof avatar !== 'object') {
      return res.status(400).json({ error: 'Invalid avatar data.' });
    }

    // IMPORTANT: Your User.js schema needs an 'avatar' field to save this data.
    // If you don't have one, add: avatar: { type: Object, default: {} },
    // or specify the sub-fields: { skin: String, hair: String, ... }
    await User.findByIdAndUpdate(userId, { avatar });
    res.json({ success: true });
  } catch (err) {
    console.error('Avatar update error:', err);
    res.status(500).json({ error: 'Server error while updating avatar.' });
  }
});

module.exports = router;