// routes/chat.js
const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");
const saveConversation = require("../routes/memory");
const fetch = require('node-fetch'); // Ensure this is not conflicting if you have a global fetch setup

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const primaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Redundant if not used, but kept for consistency if it serves fallback logic elsewhere

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
    const { userId, message } = req.body;
    const xpPerTurn = 10;
    const msPerMinute = 60 * 1000;

    console.log("LOG: Received message:", message);
    console.log("LOG: userId:", userId);

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

    let session = SESSION_TRACKER[userId];
    if (!session) {
        // This is a new session for the current user (either first login or session expired/ended)
        let conversationHistoryForAI = [];
        // The messageLog should be the actual chat shown to the user this session
        // It starts empty as we are starting a *new* display conversation
        let currentSessionMessageLog = [];

        // Try to retrieve the most recent actual conversation from the database for AI context
        const actualConversations = user.conversations.filter(
            conv => conv.messages && conv.messages.length > 1 && conv.summary !== "Initial Welcome Message"
        ).sort((a, b) => b.date - a.date); // Sort by date descending to get most recent

        if (actualConversations.length > 0) {
            const lastActualConversation = actualConversations[0];
            // Take a limited number of messages from the last actual conversation for AI history
            // Ensure alternating roles: user, model, user, model
            const messagesForHistory = lastActualConversation.messages.slice(-6); // e.g., last 3 turns
            for (const msg of messagesForHistory) {
                conversationHistoryForAI.push({ role: msg.role, parts: [{ text: msg.content }] });
            }
            // If the last message was a user message (e.g. they typed and logged out),
            // and we're starting a new session, ensure history ends with AI or is empty to avoid 'user can't follow user'.
            // This is handled by ensuring history is only *previous turns*.
        } else if (lastActualConversations.length === 0 && user.conversations.length > 0) {
            // If no full chat history, but there was an "Initial Welcome Message" or a short one,
            // provide a summary of the *last summary* as context for AI.
            const lastSummarySession = user.conversations.at(-1); // Get the absolute last session
            if (lastSummarySession && lastSummarySession.summary && lastSummarySession.summary !== "Initial Welcome Message") {
                 conversationHistoryForAI.push({
                     role: 'model', // Treat this as an internal AI thought or a recap by the AI
                     parts: [{ text: `(Internal AI memory: Last session summary: ${lastSummarySession.summary})` }]
                 });
            }
        }


        session = {
            history: conversationHistoryForAI, // This will be sent to primaryModel.startChat
            messageLog: currentSessionMessageLog, // This is for displaying current session chat to frontend
            systemPrompt: systemPrompt,
            activeStartTime: Date.now(),
            currentSessionMinutes: 0
        };
        SESSION_TRACKER[userId] = session;

    } else {
        session.activeStartTime = Date.now();
    }

    // Add current user message to current session's messageLog (for displaying to user later, or saving)
    session.messageLog.push({ role: "user", content: message });

    try {
        let modelUsed = "gemini-1.5-pro";

        let chat = primaryModel.startChat({
            history: session.history, // Pass the history of *previous* turns
            systemInstruction: systemPrompt,
        });

        const result = await chat.sendMessage(message); // Send ONLY the current user message here

        const text = result.response.text().trim();
        console.log("LOG: AI response:", text.slice(0, 100) + "...");

        // After successful response, append the current user message and AI's response to the history for *next* turn
        session.history.push({ role: "user", parts: [{ text: message }] }); // Add current user message
        session.history.push({ role: "model", parts: [{ text }] });     // Add AI's response

        // Add AI response to current session's messageLog (for displaying to frontend)
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
        const XP_TO_LEVEL_UP = 100;
        if (user.xp >= (user.level * XP_TO_LEVEL_UP)) {
            user.level += 1;
            user.xp = 0; // Reset XP for the new level
            console.log(`LOG: User ${user.username} leveled up to Level ${user.level}!`);
        }
        // --- End Gamification Logic ---

        await user.save(); // Save user document with updated XP/minutes (summary will be saved on logout/tab close)

        res.json({ text, modelUsed, userXp: user.xp, userLevel: user.level });
    } catch (err) {
        console.error("ERROR: Gemini chat error:", err);
        // Provide a user-friendly error message, guiding them to refresh if history is corrupted
        res.status(500).json({ error: "AI chat error: It seems the conversation history got out of sync. Please refresh the page to restart the session, or try again in a moment." });
    }
});

module.exports = router;

// Export generateAndSaveSummary and SESSION_TRACKER for server.js logout route
module.exports.generateAndSaveSummary = generateAndSaveSummary;
module.exports.SESSION_TRACKER = SESSION_TRACKER;