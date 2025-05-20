// routes/memory.js — Save summary + update user memory + recall last session

const express = require("express");
const router = express.Router();
const User = require("../models/User");

// ✅ Save summary and messages to user document
async function saveSummary(userId, summary) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = {
      summary,
      date: new Date(),
      messages: user.messageLog || []
    };

    user.conversations = user.conversations || [];
    user.conversations.push(conversation);
    user.lastSeen = new Date();

    // 🧹 Clear temporary log after saving
    delete user.messageLog;

    await user.save();
  } catch (error) {
    console.error("Error saving summary:", error);
    throw error;
  }
}

// ✅ Recall the most recent summary + last few messages
router.post("/recall", async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user || !user.conversations?.length) {
      return res.send({ summary: null });
    }

    const last = user.conversations[user.conversations.length - 1];

    res.send({
      summary: last.summary,
      date: last.date,
      messages: last.messages?.slice(-5) || []
    });
  } catch (err) {
    console.error("Error fetching summary:", err);
    res.status(500).send({ summary: null });
  }
});

module.exports = saveSummary;
module.exports.router = router;
