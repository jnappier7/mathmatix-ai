const express = require('express');
const router = express.Router();
const User = require('../models/user');

router.post('/save-summary', async (req, res) => {
  const { userId, summary, messages } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const session = {
      summary,
      messages: messages || [],
      date: new Date()
    };

    user.conversations.push(session);
    user.lastSeen = new Date();
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving session summary:", err);
    res.status(500).json({ error: 'Failed to save session summary' });
  }
});

module.exports = router;
