// routes/welcome.js - MODIFIED TO PROPERLY USE REAL SESSION SUMMARIES
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { generateSystemPrompt } = require('../utils/prompt');
const { openai, retryWithExponentialBackoff } = require("../utils/openaiClient");
const TUTOR_CONFIG = require("../utils/tutorConfig");

router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    try {
        const user = await User.findById(userId);
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
                       session.messages.length > 1 // Ensure it was a real conversation
        ).sort((a, b) => b.date - a.date); // Sort by most recent date

        if (relevantSessions.length > 0) {
            lastSummaryForAI = relevantSessions[0].summary; // Get the most recent real summary
        }

        let systemPromptForWelcome = generateSystemPrompt(user.toObject(), tutorNameForPrompt);

        const messagesForAI = [{ role: "system", content: systemPromptForWelcome }];

        if (lastSummaryForAI) {
            messagesForAI.push({ role: "system", content: `(Internal AI memory: Last session summary: ${lastSummaryForAI})` });
        }

        // Construct the prompt for the AI to generate the welcome message
        let userPromptForAI = "Generate a brief, personalized welcome message for the student. ";
        if (lastSummaryForAI) {
            userPromptForAI += "Integrate the context of their last session seamlessly into your greeting, asking if they want to continue or explore something new. ";
        }
        userPromptForAI += "Keep it concise, engaging, and end with a question about what they want to tackle.";


        const completion = await retryWithExponentialBackoff(async () => {
            return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: messagesForAI.concat([
                    { role: "user", content: userPromptForAI }
                ]),
                temperature: 0.7,
                max_tokens: 150
            });
        });

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
            // Just push the welcome message as part of the ongoing conversation in the frontend,
            // the backend session management in chat.js will handle appending to the right session.
            // For now, no need to modify user.conversations here if it's a continuing session.
        }
        await user.save(); // Save changes to user.conversations


        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.response?.data || error.message || error);
        // On persistent error, still provide a fallback message
        res.status(500).json({ greeting: "Hello! How can I help you today?", error: "Failed to load personalized welcome due to a persistent issue." });
    }
});

module.exports = router;