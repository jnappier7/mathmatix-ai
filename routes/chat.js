const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");
const saveConversation = require("../routes/memory"); // Renamed saveSummary to saveConversation for clarity
const fetch = require('node-fetch'); // Required for fetching the summary from your own API

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const primaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const SESSION_TRACKER = {}; // Session memory per user

// Function to generate a summary for a conversation
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
            return null; // Return null if summary generation fails
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

    console.log("LOG: Received message:", message);
    console.log("LOG: userId:", userId);

    let user = await User.findById(userId).lean(); // Initially fetch lean for prompt
    console.log("LOG: Loaded user:", user?.firstName || user?.username || "ERROR: Not found");

    const systemPrompt = generateSystemPrompt(user);
    console.log("LOG: Prompt injected:", systemPrompt.slice(0, 200) + "...");

    // Load or create session
    let session = SESSION_TRACKER[userId];
    if (!session) {
        const dbUser = await User.findById(userId); // Fetch non-lean for potential updates
        const lastConversation = dbUser?.conversations?.at(-1); // Use .at(-1) for last element
        session = {
            history: lastConversation?.messages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })) || [],
            messageLog: lastConversation?.messages || [], // Initialize messageLog from DB
            systemPrompt: systemPrompt
        };
        SESSION_TRACKER[userId] = session;
        user = dbUser; // Use the non-lean user object
    } else {
        user = await User.findById(userId); // Re-fetch non-lean user for saving
    }


    // Add user message to current session log
    session.messageLog.push({ role: "user", content: message });

    const history = session.history;

    try {
        let modelUsed = "gemini-1.5-pro";

        let chat = primaryModel.startChat({
            history,
            systemInstruction: systemPrompt,
        });

        const result = await chat.sendMessage(message);

        const text = result.response.text().trim();
        console.log("LOG: AI response:", text.slice(0, 100) + "...");

        // Update session history for next AI turn
        session.history.push({ role: "user", parts: [{ text: message }] });
        session.history.push({ role: "model", parts: [{ text }] });

        // Add AI response to current session log
        session.messageLog.push({ role: "model", content: text });

        // --- Generate and Save AI Summary ---
        // Only generate summary after a few turns or if the session is about to end
        // For now, let's trigger it after each turn for testing, but optimize later.
        const studentProfileForSummary = user.toObject(); // Convert Mongoose doc to plain object
        studentProfileForSummary.course = user.mathCourse; // Map mathCourse to 'course' for prompt consistency

        const aiGeneratedSummary = await generateAndSaveSummary(user._id, session.messageLog, studentProfileForSummary);

        if (aiGeneratedSummary) {
            // Call saveConversation (previously saveSummary) from memory.js
            // Pass the AI-generated summary
            await saveConversation(user._id, aiGeneratedSummary);
        } else {
            // If AI summary failed, save a generic one as fallback
            await saveConversation(user._id, `Session with ${user.firstName || user.username} - Summary failed to generate.`);
        }
        // --- End Summary Generation and Save ---

        res.json({ text, modelUsed });
    } catch (err) {
        console.error("ERROR: Gemini chat error:", err);
        res.status(500).json({ error: "AI chat error. Try again." });
    }
});

module.exports = router;