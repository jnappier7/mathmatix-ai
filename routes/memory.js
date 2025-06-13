// routes/memory.js - Save conversation summary + update user memory + recall last session

const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Renamed function for clarity
// MODIFIED: saveConversation now expects messageLog as an argument
async function saveConversation(userId, summary, messageLog) { // Added messageLog parameter
  try {
    const user = await User.findById(userId); // Fetch user document (non-lean)
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = {
      summary: summary, // Use the summary passed as argument
      date: new Date(),
      messages: messageLog || [] // Use the passed messageLog, fallback to empty array
    };

    user.conversations = user.conversations || [];
    user.conversations.push(conversation);
    user.lastSeen = new Date();

    // No need to delete user.messageLog here as it's not part of the user document

    await user.save();
    console.log(`LOG: Conversation summary saved for user ${userId} in DB.`);
  } catch (error) {
    console.error("ERROR: Error saving conversation summary to DB:", error);
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
    console.error("ERROR: Error fetching summary:", err);
    res.status(500).send({ summary: null, messages: [] });
  }
});

module.exports = saveConversation; // Export the renamed function
module.exports.router = router; // Also export the router for /recall route