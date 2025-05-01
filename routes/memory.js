const express = require('express');
const User = require('../models/user');
const router = express.Router();

// Save a session's messages and summary to user's memory
router.post('/save-memory', async (req, res) => {
  const { userId, messages, summary } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.conversations.push({ messages, summary });
    user.lastSeen = new Date();
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving memory:", err);
    res.status(500).json({ error: 'Failed to save memory' });
  }
});

// Load the most recent conversation
router.get('/load-memory/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const lastSession = user.conversations?.slice(-1)[0] || null;
    res.json({ memory: lastSession });
  } catch (err) {
    console.error("Error loading memory:", err);
    res.status(500).json({ error: 'Failed to load memory' });
  }
});

module.exports = router;
// JavaScript Document