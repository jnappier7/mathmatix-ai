// routes/memory.js
// MODIFIED: Reworked to query the new 'Conversation' collection for recall.
// REMOVED: The obsolete 'saveConversationToDB' function is removed.

const express = require("express");
const router = express.Router();
const Conversation = require("../models/conversation"); // NEW: Use Conversation model

// POST /api/memory/recall
// Fetches the most recent conversation summary for a given user.
router.post("/recall", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
  }

  try {
    // Find the most recently active conversation for the user.
    const lastConversation = await Conversation.findOne({ userId: userId }).sort({ lastActivity: -1 });

    if (!lastConversation) {
      // This is a normal case for new users or before the first session.
      return res.send({ summary: null, messages: [] });
    }

    // Return the summary, date, and last few messages from the found conversation.
    res.send({
      summary: lastConversation.summary,
      date: lastConversation.lastActivity,
      messages: lastConversation.messages?.slice(-5) || []
    });
  } catch (err) {
    console.error("ERROR: Error fetching conversation memory:", err);
    res.status(500).send({ summary: null, messages: [] });
  }
});

// The router is the only necessary export now.
module.exports = {
  router: router
};