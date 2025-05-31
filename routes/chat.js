const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");
const saveConversation = require("../routes/memory");
const fetch = require('node-fetch');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const primaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const SESSION_TRACKER = {}; // Session memory per user, now also tracks active time and XP for the current session

// Function to generate a summary for a conversation (kept from previous implementation)
async function generateAndSaveSummary(userId, messageLog, studentProfile) {
    try {
        const response = await fetch(`${process.env.NODE_ENV === 'production' ? 'https://mathmatix.ai' : 'http://localhost:5000'}/api/generate-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageLog, studentProfile })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`ERROR: Failed to generate summary from AI: ${response.status} - ${errorBody}`);
            return null;
        }

        const data = await response.json();
        return data.summary;
    } catch (error) {
        console.error('ERROR: Error calling summary generation API:', error);
        return null;
    }
}

router.post("/", async (req, res) => {
    const { userId, message } = req.body; // userId now required
    const xpPerTurn = 10; // Simple XP gain per turn
    const msPerMinute = 60 * 1000; // Conversion for active minutes

    console.log("LOG: Received message:", message);
    console.log("LOG: userId:", userId);

    // Fetch non-lean user object for direct modification and saving
    let user;
    try {
        user = await User.findById(userId);
        if (!user) {
            console.error("ERROR: User not found for userId:", userId);
            return res.status(404).json({ error: "User not found." });
        }
        console.log("LOG: Loaded user:", user.firstName || user.username);
    } catch (dbErr) {
        console.error("ERROR: DB error fetching user in chat route:", dbErr);
        return res.status(500).json({ error: "Server error fetching user." });
    }


    const systemPrompt = generateSystemPrompt(user.toObject());
    console.log("LOG: Prompt injected:", systemPrompt.slice(0, 200) + "...");

    // Load or create session
    let session = SESSION_TRACKER[userId];
    if (!session) {
        let initialHistory = [];
        let initialMessageLog = []; // This will remain empty for new sessions' frontend display

        // Find the last actual tutoring session summary to provide as initial AI context
        const tutoringSessions = user.conversations.filter(
            conv => conv.messages.length > 1 || (conv.messages.length === 1 && conv.messages[0].role === 'user') // Filter out just welcome message sessions
        ).sort((a, b) => b.date - a.date); // Sort to get the truly last session

        if (tutoringSessions.length > 0) {
            const lastCompletedSession = tutoringSessions[0];
            if (lastCompletedSession.summary) {
                // Create a synthetic AI message for the AI's internal history based on the summary
                // This message is NOT sent to the frontend chat, only for AI's memory.
                const syntheticSummaryMessage = {
                    role: 'model',
                    parts: [{ text: `(Internal AI memory: Last session summary: ${lastCompletedSession.summary})` }]
                };
                initialHistory.push(syntheticSummaryMessage);
            }
        }

        session = {
            history: initialHistory, // Now includes internal summary recap if available
            messageLog: [], // Start messageLog empty for this new session's *frontend display*
            systemPrompt: systemPrompt,
            activeStartTime: Date.now(),
            currentSessionMinutes: 0
        };
        SESSION_TRACKER[userId] = session;
    } else {
        session.activeStartTime = Date.now();
    }

    // Add user message to current session log and history
    session.messageLog.push({ role: "user", content: message });
    session.history.push({ role: "user", parts: [{ text: message }] });

    const history = session.history; // history now includes the internal summary recap + current user message

    try {
        let modelUsed = "gemini-1.5-pro";

        let chat = primaryModel.startChat({
            history, // Pass the enriched history to the AI
            systemInstruction: systemPrompt,
        });

        const result = await chat.sendMessage(message);

        const text = result.response.text().trim();
        console.log("LOG: AI response:", text.slice(0, 100) + "...");

        // Update session history for next AI turn
        session.history.push({ role: "model", parts: [{ text }] });

        // Add AI response to current session log
        session.messageLog.push({ role: "model", content: text });

        // --- Gamification Logic: Calculate XP and Active Minutes for this turn ---
        const turnEndTime = Date.now();
        const turnDurationMs = turnEndTime - session.activeStartTime;
        const turnMinutes = turnDurationMs / msPerMinute;

        session.currentSessionMinutes += turnMinutes; // Add to current session's total

        user.xp += xpPerTurn; // Add XP
        user.totalActiveTutoringMinutes += turnMinutes; // Add to lifetime minutes
        user.weeklyActiveTutoringMinutes += turnMinutes; // Add to weekly minutes

        // Basic Level Up Logic (can be expanded)
        const XP_TO_LEVEL_UP = 100; // Example: 100 XP per level
        if (user.xp >= (user.level * XP_TO_LEVEL_UP)) { // Check if enough XP for next level
            user.level += 1;
            user.xp = 0; // Reset XP for the new level (or keep cumulative XP)
            console.log(`LOG: User ${user.username} leveled up to Level ${user.level}!`);
        }
        // --- End Gamification Logic ---

        // Save user document with updated XP/minutes (but not summary here)
        // Summary will be saved on logout/tab close
        await user.save();

        res.json({ text, modelUsed, userXp: user.xp, userLevel: user.level }); // Send updated XP/level to frontend
    } catch (err) {
        console.error("ERROR: Gemini chat error:", err);
        res.status(500).json({ error: "AI chat error. Try again." });
    }
});

module.exports = router;

// Export generateAndSaveSummary and SESSION_TRACKER for server.js logout route
module.exports.generateAndSaveSummary = generateAndSaveSummary;
module.exports.SESSION_TRACKER = SESSION_TRACKER;