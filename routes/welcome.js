// PASTE-READY: Final version of routes/welcome.js for maximum personalization

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/openaiClient");
const TUTOR_CONFIG = require("../utils/tutorConfig");

router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                               ? user.selectedTutorId
                               : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const voiceIdForWelcome = currentTutor.voiceId;
        const tutorNameForPrompt = currentTutor.name;

        let lastContextForAI = null;
        let contextType = 'none';

        if (user.activeConversationId) {
            const activeConversation = await Conversation.findById(user.activeConversationId).lean();
            if (activeConversation && activeConversation.messages && activeConversation.messages.length > 0) {
                lastContextForAI = activeConversation.messages.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n');
                contextType = 'recent_messages';
            }
        }

        if (!lastContextForAI) {
            const lastArchivedConversation = await Conversation.findOne({
                userId: user._id,
                summary: { $ne: null, $ne: "Initial Welcome Message" }
            }).sort({ lastActivity: -1 });

            if (lastArchivedConversation) {
                lastContextForAI = lastArchivedConversation.summary;
                contextType = 'summary';
            }
        }

        const systemPromptForWelcome = generateSystemPrompt(user, tutorNameForPrompt);
        let messagesForAI = [{ role: "system", content: systemPromptForWelcome }];
        let userMessagePart;

        // --- THIS IS THE FINAL, REVISED PROMPT SECTION ---
        const baseInstruction = `Your goal is to generate a short, welcoming message for a returning student named ${user.firstName}. You are their personal mentor who remembers them. Your tone should be casual, friendly, and show genuine recognition.`;

        if (contextType !== 'none') {
             messagesForAI.push({ role: "system", content: `(Internal AI memory of last interaction: \n${lastContextForAI})` });
             userMessagePart = `${baseInstruction} Review the internal memory provided. Use it to craft a unique greeting that builds rapport. You could mention a specific success, a point of struggle we overcame, or a funny moment to show you remember them. Do NOT be generic. End with an open-ended question about what they want to work on today.`;
        } else {
            userMessagePart = `${baseGreeting} This is their first time talking to you. Give them a warm welcome and ask what they'd like to work on.`;
        }
        // --- END OF REVISED PROMPT SECTION ---
        
        messagesForAI.push({ role: "user", content: userMessagePart });

        const completion = await callLLM("gpt-4o-mini", messagesForAI, { max_tokens: 150 });
        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.message || error);
        const userName = req.query.userId ? (await User.findById(req.query.userId).lean())?.firstName : 'there';
        res.status(500).json({ greeting: `Hello ${userName}! How can I help you today?`, error: "Failed to load personalized welcome." });
    }
});

module.exports = router;