// routes/memory.js - Save conversation summary + update user memory + recall last session

const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Renamed function for clarity
async function saveConversation(userId, summary) {
  try {
    const user = await User.findById(userId); // Fetch user document (non-lean)
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = {
      summary: summary, // Use the summary passed as argument
      date: new Date(),
      messages: user.messageLog || [] // messageLog is attached to user document in chat.js
    };

    user.conversations = user.conversations || [];
    user.conversations.push(conversation);
    user.lastSeen = new Date();

    delete user.messageLog; // Clear temporary messageLog after saving

    await user.save();
  } catch (error) {
    console.error("Error saving conversation summary:", error);
    throw error;
  }
}

// Recall the most recent summary + last few messages
router.post("/recall", async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user || !user.conversations?.length) {
      return res.send({ summary: null, messages: [] });
    }

    const last = user.conversations.at(-1); // Use .at(-1) for consistency

    res.send({
      summary: last.summary,
      date: last.date,
      messages: last.messages?.slice(-5) || [] // Last 5 messages
    });
  } catch (err) {
    console.error("Error fetching summary:", err);
    res.status(500).send({ summary: null, messages: [] });
  }
});

module.exports = saveConversation; // Export the renamed function
module.exports.router = router; // Also export the router for /recall route