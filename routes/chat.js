// routes/chat.js (add input validation and max_tokens for user message)

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const { generateSystemPrompt } = require('../utils/prompt');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const saveConversation = require('../routes/memory');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const summaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Function to generate a summary for a conversation session (no changes here)
async function generateSessionSummary(messageLog, studentProfile) {
    // ... (existing code for generateSessionSummary) ...
}

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId, chatHistory } = req.body;

    // --- SERVER-SIDE INPUT VALIDATION & LIMITING ---
    const MAX_MESSAGE_LENGTH = 2000; // Define a reasonable character limit for a single message
    const MAX_HISTORY_LENGTH_FOR_AI = 5; // Limit the number of recent messages sent to AI for context

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` });
    }
    // --- END SERVER-SIDE INPUT VALIDATION & LIMITING ---

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        let studentProfileForPrompt = user.toObject();
        let currentRoleForPrompt = role;
        let childProfileForPrompt = null;
        let tutorIdToUse = user.selectedTutorId || 'default';

        if (role === 'parent' && childId) {
            const child = await User.findById(childId).lean();
            if (child && user.children.some(c => c.equals(childId))) {
                childProfileForPrompt = child;
                studentProfileForPrompt = child;
                currentRoleForPrompt = 'parent';
                tutorIdToUse = child.selectedTutorId || 'default';
            } else {
                return res.status(403).json({ message: "Forbidden: Child not found or not linked to this parent." });
            }
        }

        const currentTutorConfig = TUTOR_CONFIG[tutorIdToUse] || TUTOR_CONFIG['default'];
        const voiceIdForResponse = currentTutorConfig.voiceId;

        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutorConfig.name, childProfileForPrompt, currentRoleForPrompt);

        // Limit chat history sent to AI to control token usage
        const recentChatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH_FOR_AI); // Take only the last N messages

        const formattedHistory = recentChatHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const messages = [
            { role: "user", parts: [{ text: systemPrompt }] },
            ...formattedHistory,
            { role: "user", parts: [{ text: message }] }
        ];
        
        // --- Call AI Model ---
        const result = await chatModel.generateContent({
            contents: messages
            // You can also add max_output_tokens here if you want to limit AI response length
            // max_output_tokens: 500, // Example: Limit AI response to 500 tokens
        });
        
        let aiResponseText = result.response.text().trim();

        // --- XP Awarding Logic (only for students) ---
        let userXpAwarded = 0;
        let userLevel = user.level;
        let specialXpAwarded = null;

        const xpMatch = aiResponseText.match(/<AWARD_XP:(\d+)>/);
        if (xpMatch && role === 'student') {
            userXpAwarded = parseInt(xpMatch[1]);
            aiResponseText = aiResponseText.replace(/<AWARD_XP:\d+>/, '').trim();

            user.xp = (user.xp || 0) + userXpAwarded;
            const newCalculatedLevel = Math.floor(user.xp / 100) + 1;
            
            if (newCalculatedLevel > user.level) {
                user.level = newCalculatedLevel;
                specialXpAwarded = `🎉 Congratulations! You leveled up to Level ${user.level}!`;
            }
            await user.save();
            userLevel = user.level;
        }

        // --- Session Management & Summary Saving ---
        let currentSession = user.conversations.length > 0 ? user.conversations[user.conversations.length - 1] : null;

        if (!currentSession || currentSession.summary === "Initial Welcome Message" || currentSession.summary) {
            currentSession = {
                date: new Date(),
                messages: [],
                summary: null,
                activeMinutes: 0
            };
            user.conversations.push(currentSession);
        }

        currentSession.messages.push({ role: 'user', content: message });
        currentSession.messages.push({ role: 'assistant', content: aiResponseText });

        currentSession.activeMinutes = (currentSession.activeMinutes || 0) + 1;

        await user.save();

        if (currentSession.messages.length > 5 && !currentSession.summary) {
            const sessionTranscriptForSummary = currentSession.messages;
            const studentProfileForSummary = studentProfileForPrompt;

            const sessionToUpdateIndex = user.conversations.length - 1;

            generateSessionSummary(sessionTranscriptForSummary, studentProfileForSummary)
                .then(generatedSummary => {
                    if (user.conversations[sessionToUpdateIndex]) {
                        user.conversations[sessionToUpdateIndex].summary = generatedSummary;
                        return user.save();
                    }
                })
                .then(() => console.log('LOG: Session summary generated and saved successfully for user:', userId))
                .catch(summaryError => console.error('ERROR: Failed to save session summary:', summaryError));
        }

        res.json({
            text: aiResponseText,
            userXp: user.xp,
            userLevel: userLevel,
            specialXpAwarded: specialXpAwarded,
            voiceId: voiceIdForResponse
        });

    } catch (error) {
        console.error("ERROR: Chat route failed to get AI response:", error?.response?.data?.text || error.message || error);
        // Provide a more specific error message to the user if it's due to input length
        if (error.message.includes('too long')) { // Catch the error message from our early validation
            res.status(400).json({ message: "Your message was too long. Please try a shorter message." });
        } else {
            res.status(500).json({ message: "Failed to get response from AI. Please try again." });
        }
    }
});

module.exports = router;