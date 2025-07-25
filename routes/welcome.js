// routes/welcome.js
// MODIFIED: Simplified to only generate a welcome message. Session creation is now handled by chat.js.
// Fetches the last *real* summary from the new Conversation collection for context.
// CORRECTED: Actually uses the student's name in the welcome message.

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation'); // NEW: Import Conversation model
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/openaiClient");
const TUTOR_CONFIG = require("../utils/tutorConfig");

router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    try {
        const user = await User.findById(userId).lean(); // Lean object is fine here
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                               ? user.selectedTutorId
                               : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const voiceIdForWelcome = currentTutor.voiceId;
        const tutorNameForPrompt = currentTutor.name;

        // Find the most recent conversation for this user that has a real summary.
        const lastConversation = await Conversation.findOne({
            userId: user._id,
            summary: { $ne: null, $ne: "Initial Welcome Message" }
        }).sort({ lastActivity: -1 }); // Sort by the most recent activity

        const lastSummaryForAI = lastConversation ? lastConversation.summary : null;

        const systemPromptForWelcome = generateSystemPrompt(user, tutorNameForPrompt);

        let messagesForAI = [{ role: "system", content: systemPromptForWelcome }];

        if (lastSummaryForAI) {
            messagesForAI.push({ role: "system", content: `(Internal AI memory: Last session summary: ${lastSummaryForAI})` });
        }
        
        // MODIFICATION: Explicitly tell the AI to greet the user by name.
        const userMessageContent = `Generate a brief, personalized welcome message for the student named ${user.firstName}. `;
        const userMessagePart = lastSummaryForAI
            ? userMessageContent + "Integrate the context of their last session seamlessly into your greeting, asking if they want to continue or explore something new. "
            : userMessageContent + "Ask what they want to tackle today.";
        messagesForAI.push({ role: "user", content: userMessagePart });

        const completion = await callLLM("gpt-4o-mini", messagesForAI, { max_tokens: 150 });

        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.message || error);
        res.status(500).json({ greeting: `Hello ${user.firstName}! How can I help you today?`, error: "Failed to load personalized welcome." });
    }
});

module.exports = router;