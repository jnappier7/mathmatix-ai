// routes/chat.js
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth'); // Auth middleware
const User = require('../models/user'); // User model (corrected path)
const { generateSystemPrompt } = require('../utils/prompt'); // Prompt generation
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Gemini AI SDK
const TUTOR_CONFIG = require('../utils/tutorConfig'); // NEW: Import TUTOR_CONFIG

// Initialize Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use your preferred Gemini model

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId, chatHistory } = req.body;

    try {
        // Fetch user as a Mongoose document (not lean) if you need to save changes later,
        // or fetch lean for prompt and then findByIdAndUpdate for XP/Level.
        // For prompt generation, a lean object is fine.
        const user = await User.findById(userId); // Fetch as full Mongoose document to handle user.save() for XP

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        let studentProfileForPrompt = user.toObject(); // Use .toObject() for the prompt if 'user' is not lean
        let currentRoleForPrompt = role;
        let childProfileForPrompt = null;
        let tutorIdToUse = user.selectedTutorId || 'default'; // Default to 'default' tutor

        // If parent is chatting about a child, load child's profile and use their tutor
        if (role === 'parent' && childId) {
            const child = await User.findById(childId).lean(); // Child can be lean if no changes are saved to it directly here
            if (child && user.children.some(c => c.equals(childId))) { // Verify child belongs to parent
                childProfileForPrompt = child;
                studentProfileForPrompt = child; // Use child's profile for the prompt context
                currentRoleForPrompt = 'parent'; // Indicate parent is asking about child
                tutorIdToUse = child.selectedTutorId || 'default'; // Use child's selected tutor
            } else {
                return res.status(403).json({ message: "Forbidden: Child not found or not linked to this parent." });
            }
        }

        // Determine the voice ID for the response using TUTOR_CONFIG
        const currentTutorConfig = TUTOR_CONFIG[tutorIdToUse] || TUTOR_CONFIG['default'];
        const voiceIdForResponse = currentTutorConfig.voiceId;

        // Generate personalized system prompt
        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutorConfig.name, childProfileForPrompt, currentRoleForPrompt);

        // Convert chatHistory to AI model's format
        // Ensure roles are mapped correctly ('assistant' to 'model' for Gemini)
        const formattedHistory = chatHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // Construct messages array for AI
        const messages = [
            { role: "user", parts: [{ text: systemPrompt }] }, // System prompt as the first user message
            ...formattedHistory, // Include full chat history
            { role: "user", parts: [{ text: message }] } // Current user message
        ];
        
        // --- Call AI Model ---
        const result = await chatModel.generateContent({
            contents: messages
        });
        
        let aiResponseText = result.response.text().trim();

        // --- XP Awarding Logic (only for students) ---
        let userXpAwarded = 0;
        let userLevel = user.level; // Start with current user's level
        let specialXpAwarded = null;

        // Extract XP award tag if AI sends it and user is a student
        const xpMatch = aiResponseText.match(/<AWARD_XP:(\d+)>/);
        if (xpMatch && role === 'student') {
            userXpAwarded = parseInt(xpMatch[1]);
            aiResponseText = aiResponseText.replace(/<AWARD_XP:\d+>/, '').trim(); // Remove tag from final text

            user.xp = (user.xp || 0) + userXpAwarded; // Update XP on the Mongoose document
            const newCalculatedLevel = Math.floor(user.xp / 100) + 1; // Basic level up logic
            
            if (newCalculatedLevel > user.level) { // If level increased
                user.level = newCalculatedLevel; // Update level on the Mongoose document
                specialXpAwarded = `🎉 Congratulations! You leveled up to Level ${user.level}!`;
            }
            await user.save(); // Save the updated user document (XP and Level)
            userLevel = user.level; // Ensure the returned level is the latest
        }

        // Return AI response to frontend
        res.json({
            text: aiResponseText,
            userXp: user.xp, // Send updated total XP
            userLevel: userLevel, // Send updated level
            specialXpAwarded: specialXpAwarded,
            voiceId: voiceIdForResponse // [FIX] Send the dynamically determined voice ID
        });

    } catch (error) {
        console.error("ERROR: Chat route failed to get AI response:", error?.response?.data?.text || error.message || error);
        res.status(500).json({ message: "Failed to get response from AI. Please try again." });
    }
});

module.exports = router;