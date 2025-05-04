// routes/memory.js — Save summary + update user memory

const User = require("../models/User");

async function saveSummary(userId, summary) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = {
      summary,
      date: new Date(),
    };

    user.conversations = user.conversations || [];
    user.conversations.push(conversation);
    user.lastSeen = new Date();
    await user.save();
  } catch (error) {
    console.error("Error saving summary:", error);
    throw error;
  }
}

module.exports = saveSummary;
