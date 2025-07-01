// routes/welcome.js - MODIFIED TO PROPERLY USE REAL SESSION SUMMARIES AND CENTRALIZED LLM CALL
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/openaiClient"); // Use centralized LLM call
const TUTOR_CONFIG = require("../utils/tutorConfig");

router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    try {
        const user = await User.findById(userId); // Fetch mutable user object for saving sessions
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                               ? user.selectedTutorId
                               : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const voiceIdForWelcome = currentTutor.voiceId;
        const tutorNameForPrompt = currentTutor.name;

        let lastSummaryForAI = null;
        // Filter for sessions that have a 'summary' AND are NOT "Initial Welcome Message"
        // Also ensure they have actual messages from a conversation.
        const relevantSessions = user.conversations.filter(
            session => session.summary &&
                       session.summary !== "Initial Welcome Message" &&
                       session.messages &&
                       session.messages.length > 1 // Ensure it was a real conversation (user + AI message)
        ).sort((a, b) => b.date - a.date); // Sort by most recent date

        if (relevantSessions.length > 0) {
            lastSummaryForAI = relevantSessions[0].summary; // Get the most recent real summary
        }

        const userProfileForPrompt = user.toObject(); // Use a plain object for prompt generation
        let systemPromptForWelcome = generateSystemPrompt(userProfileForPrompt, tutorNameForPrompt);

        // Prepare messages for the AI. System content needs to be combined if using Claude fallback.
        let messagesForAI = [];
        // The system prompt is usually sent as the first message or a dedicated parameter.
        // For callLLM, it's best if the first message is always role: 'system'.
        messagesForAI.push({ role: "system", content: systemPromptForWelcome });


        if (lastSummaryForAI) {
            // Append internal memory as a system message for the AI's context
            messagesForAI.push({ role: "system", content: `(Internal AI memory: Last session summary: ${lastSummaryForAI})` });
        }

        // Add the user message part to trigger generation
        const userMessageContent = "Generate a brief, personalized welcome message for the student. ";
        const userMessagePart = lastSummaryForAI
            ? userMessageContent + "Integrate the context of their last session seamlessly into your greeting, asking if they want to continue or explore something new. "
            : userMessageContent + "Ask what they want to tackle today.";
        messagesForAI.push({ role: "user", content: userMessagePart });

        const completion = await callLLM("gpt-4o-mini", messagesForAI, { max_tokens: 150 }); // Use centralized LLM call

        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        // --- Session handling in Welcome route ---
        // If this is the very first interaction for this user (no conversations yet)
        // OR if the very last session recorded was JUST an "Initial Welcome Message" marker,
        // then we create a *new* empty session here. Subsequent messages will be added to it by chat.js.
        const isActuallyFirstSession = user.conversations.length === 0 || 
                                       (user.conversations.length > 0 && user.conversations[user.conversations.length - 1].summary === "Initial Welcome Message");

        if (isActuallyFirstSession) {
            const newSession = {
                date: new Date(),
                messages: [{ role: 'assistant', content: initialWelcomeMessage }], // Start session with AI's welcome
                summary: "Initial Welcome Message", // Temporarily mark as welcome, summary will be added by chat.js later
                activeMinutes: 0
            };
            user.conversations.push(newSession);
        } else {
            // If returning to an existing session (not just a welcome message)
            // Just ensure the welcome message is consistent, no need to add a new session here,
            // as chat.js will append to the current active session.
        }
        await user.save(); // Save changes to user.conversations (if any new session pushed)


        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.message || error);
        // On persistent error, still provide a fallback message
        res.status(500).json({ greeting: "Hello! How can I help you today?", error: "Failed to load personalized welcome due to a persistent issue." });
    }
});

module.exports = router;