// routes/welcome.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Import User model

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

        let greeting;
        let summaryForWelcome = null;

        // Find the last actual tutoring session summary
        // Filter out sessions that are just "Initial Welcome Message" or have no actual chat messages
        const tutoringSessions = user.conversations.filter(
            session => session.summary && session.summary !== "Initial Welcome Message" && session.messages.length > 1
        ).sort((a, b) => b.date - a.date); // Sort to get the truly last session

        if (tutoringSessions.length > 0) {
            const lastTutoringSession = tutoringSessions[0];
            summaryForWelcome = lastTutoringSession.summary;

            // Extract main topic for concise welcome
            // This is a simple heuristic; a more advanced method might parse the summary for key phrases
            const topicMatch = summaryForWelcome.match(/This tutoring session focused on (.*?)\./);
            const topic = topicMatch ? topicMatch[1] : "some challenging math concepts";

            greeting = `Hey ${user.firstName || user.username}, great to see you again! Ready to build on that solid foundation we laid with **${topic}** last time?`;
        } else {
            greeting = `Hey ${user.firstName || user.username}, welcome aboard! I'm your AI math tutor. What math problem can we tackle first?`;
        }

        // --- NEW LOGIC: We no longer store the welcome message ITSELF in user.conversations as a message
        // The summary is handled on logout. The welcome message is purely for frontend display and AI context.
        // We ensure that the last session's summary is used for context when creating the greeting.
        // The saving of actual conversation messages happens in chat.js
        // The summary field in user.conversations is populated in server.js/logout or /api/end-session
        // So, this route only generates the greeting.
        // --- END NEW LOGIC ---

        res.json({ greeting: greeting });

    } catch (error) {
        console.error("ERROR: Error generating welcome message:", error);
        res.status(500).json({ greeting: "Hello! How can I help you today?", error: "Failed to load personalized welcome." });
    }
});

module.exports = router;