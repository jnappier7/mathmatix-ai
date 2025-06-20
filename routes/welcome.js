// routes/welcome.js (Corrected - Remove .toObject() when .lean() is used)
const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Correct path
const { generateSystemPrompt } = require('../utils/prompt'); // For generating personalized prompts
const openai = require("../utils/openaiClient"); //
const TUTOR_CONFIG = require("../utils/tutorConfig"); //

router.get('/', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    try {
        const user = await User.findById(userId); // Fetch as a Mongoose document to save the welcome message
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

        let lastSummaryForAI = null;
        const tutoringSessions = user.conversations.filter(
            session => session.messages && session.messages.length > 1 && session.summary && session.summary !== "Initial Welcome Message" // Filter out initial welcome
        ).sort((a, b) => b.date - a.date);

        if (tutoringSessions.length > 0) {
            const lastTutoringSession = tutoringSessions[0];
            lastSummaryForAI = lastTutoringSession.summary;
        }

        // [FIX] No .toObject() needed here if you only need a plain object for the prompt
        // If generateSystemPrompt specifically expects a plain JS object, user.toObject() is fine.
        // If it can handle a Mongoose doc, just pass `user`.
        // Let's pass user.toObject() to be safe as generateSystemPrompt expects a plain object.
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

        // --- Logic to save welcome message to history ---
        const isFirstInteraction = user.conversations.length === 0 || user.conversations[user.conversations.length - 1].summary === "Initial Welcome Message";

        if (isFirstInteraction) {
            const newSession = {
                date: new Date(),
                messages: [{ role: 'assistant', content: initialWelcomeMessage }],
                summary: "Initial Welcome Message",
                activeMinutes: 0
            };
            user.conversations.push(newSession);
            await user.save();
        } else {
            const lastSession = user.conversations[user.conversations.length - 1];
            if (lastSession && !lastSession.summary) {
                 lastSession.messages.push({ role: 'assistant', content: initialWelcomeMessage });
                 await user.save();
            } else {
                const newSession = {
                    date: new Date(),
                    messages: [{ role: 'assistant', content: initialWelcomeMessage }],
                    summary: null,
                    activeMinutes: 0
                };
                user.conversations.push(newSession);
                await user.save();
            }
        }

        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.response?.data || error.message || error);
        res.status(500).json({ greeting: "Hello! How can I help you today?", error: "Failed to load personalized welcome." });
    }
});

module.exports = router;