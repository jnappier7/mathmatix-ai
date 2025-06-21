// routes/chat.js (Corrected - Remove .toObject() when .lean() is used)
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth'); // Auth middleware
const User = require('../models/user'); // User model
const { generateSystemPrompt } = require('../utils/prompt'); // Prompt generation
const { GoogleGenerativeAI } = require('@google/generative-ai'); // If using Gemini

// Initialize your AI model (e.g., Gemini)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Or OPENAI_API_KEY if using OpenAI
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId, chatHistory } = req.body;

    try {
        // Fetch user as a plain JavaScript object because .lean() is used
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // [FIX] No .toObject() needed here as user is already lean
        let studentProfileForPrompt = user; // Default to user's profile
        let currentRoleForPrompt = role;
        let childProfileForPrompt = null;

        // If parent is chatting about a child, load child's profile
        if (role === 'parent' && childId) {
            // Fetch child as a plain JavaScript object because .lean() is used
            const child = await User.findById(childId).lean();
            if (child && user.children.includes(childId)) { // Verify child belongs to parent
                // [FIX] No .toObject() needed here as child is already lean
                childProfileForPrompt = child; // Set child profile
                studentProfileForPrompt = child; // Use child's profile for the prompt
                currentRoleForPrompt = 'parent'; // Ensure prompt knows it's a parent query
            } else {
                return res.status(403).json({ message: "Forbidden: Child not found or not linked to this parent." });
            }
        }

        // Generate personalized system prompt (passes plain JS object)
        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, /* tutorName, */ childProfileForPrompt, currentRoleForPrompt);

        // Convert chatHistory to AI model's format
        const formattedHistory = chatHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user', // Adjust roles for Gemini
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

        // Simulate XP awarding (refine this based on actual AI response parsing)
        let userXpAwarded = 0;
        let userLevel = user.level; // Use current level from the lean user object
        let specialXpAwarded = null;

        // Example: Extract XP award tag if AI sends it
        const xpMatch = aiResponseText.match(/<AWARD_XP:(\d+)>/);
        if (xpMatch && role === 'student') {
            userXpAwarded = parseInt(xpMatch[1]);
            aiResponseText = aiResponseText.replace(/<AWARD_XP:\d+>/, '').trim(); // Remove tag from final text

            // Need to fetch user as a Mongoose document *if* we are saving changes
            // Or, save changes via findByIdAndUpdate on plain object, but this is less direct
            // A more robust approach: fetch user without .lean() if changes need to be saved
            // OR use User.findByIdAndUpdate directly here.
            
            // For now, let's assume you'll update XP/level on user via findByIdAndUpdate
            const updatedUserDoc = await User.findByIdAndUpdate(
                userId,
                {
                    $inc: { xp: userXpAwarded }, // Increment XP
                    $max: { level: Math.floor((user.xp + userXpAwarded) / 100) + 1 } // Update level if increased
                },
                { new: true } // Return the updated document
            );

            if (updatedUserDoc) {
                userLevel = updatedUserDoc.level; // Get latest level
                if (userLevel > user.level) { // Compare with original level
                    specialXpAwarded = `🎉 Congratulations! You leveled up to Level ${userLevel}!`;
                }
            }
        }

        // Return AI response
        res.json({
            text: aiResponseText,
            userXp: user.xp, // Send original XP for initial display
            userLevel: userLevel, // Send updated level
            specialXpAwarded: specialXpAwarded,
            voiceId: "2eFQnnNM32GDnZkCfkSm" // Default voice, or dynamically chosen
        });

    } catch (error) {
        console.error("Error in chat route:", error?.response?.data || error.message || error);
        res.status(500).json({ message: "Failed to get response from AI." });
    }
});

module.exports = router;