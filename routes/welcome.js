// routes/welcome.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateSystemPrompt } = require('../utils/prompt');
const openai = require("../utils/openaiClient");
const TUTOR_CONFIG = require("../utils/tutorConfig"); // NEW: Import TUTOR_CONFIG

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

        // --- Determine tutor name and voice ID for welcome message ---
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                               ? user.selectedTutorId
                               : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const voiceIdForWelcome = currentTutor.voiceId;
        const tutorNameForPrompt = currentTutor.name;
        // --- END NEW ---

        let lastSummaryForAI = null;
        const tutoringSessions = user.conversations.filter(
            session => session.messages && session.messages.length > 1 && session.summary !== "Initial Welcome Message" && session.summary
        ).sort((a, b) => b.date - a.date);

        if (tutoringSessions.length > 0) {
            const lastTutoringSession = tutoringSessions[0];
            lastSummaryForAI = lastTutoringSession.summary;
        }

        // MODIFIED: Pass tutorNameForPrompt to generateSystemPrompt
        let systemPromptForWelcome = generateSystemPrompt(user.toObject(), tutorNameForPrompt);

        const messagesForAI = [{ role: "system", content: systemPromptForWelcome }];

        if (lastSummaryForAI) {
            messagesForAI.push({ role: "system", content: `(Internal AI memory: Last session summary: ${lastSummaryForAI})` });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messagesForAI.concat([
                { role: "user", content: "Generate a brief, personalized welcome message for the student. If a last session summary was provided in your internal memory, integrate that context seamlessly into your greeting. Keep it concise, engaging, and end with a question about what they want to tackle." }
            ]),
            temperature: 0.7,
            max_tokens: 150
        });

        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        // MODIFIED: Include voiceId in the response
        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.response?.data || error.message || error);
        res.status(500).json({ greeting: "Hello! How can I help you today?", error: "Failed to load personalized welcome." });
    }
});

module.exports = router;