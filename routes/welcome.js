// PASTE-READY: Final version of routes/welcome.js for maximum personalization

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
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

        // --- NATURAL WELCOME MESSAGE PROMPT ---
        if (contextType !== 'none') {
             messagesForAI.push({ role: "system", content: `(Last session context: \n${lastContextForAI})` });
             userMessagePart = `Write a quick, casual greeting for ${user.firstName}. Keep it SHORT (1-2 sentences max). Sound natural, like you're texting. Sometimes reference last session, sometimes don't - mix it up. When you do reference it, vary your approach: don't always say "I remember how you..." or "I was thinking about..." Just dive in naturally. Then ask what they want to work on. BANNED PHRASES: "Great to see you", "Welcome back", "I remember how you solved", "I was thinking about how you", "that tricky problem", "Ready to dive into". Be creative.`;
        } else {
            userMessagePart = `Write a quick, casual first-time greeting for ${user.firstName}. Keep it SHORT (1-2 sentences). Sound friendly and human, not robotic. Ask what they want to work on. NO canned phrases.`;
        }
        // --- END OF REVISED PROMPT SECTION ---
        
        messagesForAI.push({ role: "user", content: userMessagePart });

        // Use Claude Sonnet 3.5 for natural, engaging welcome messages
        const completion = await callLLM("claude-3-5-sonnet-20241022", messagesForAI, { max_tokens: 80 });
        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.message || error);
        const userName = req.query.userId ? (await User.findById(req.query.userId).lean())?.firstName : 'there';
        res.status(500).json({ greeting: `Hello ${userName}! How can I help you today?`, error: "Failed to load personalized welcome." });
    }
});

module.exports = router;