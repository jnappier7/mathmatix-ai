/**
 * RAPPORT BUILDING API
 *
 * Handles getting-to-know-you conversations for new users before skills assessment.
 * Goal: Build natural rapport through casual conversation (3-5 questions max).
 *
 * Flow:
 * 1. Welcome message asks first getting-to-know-you question
 * 2. User responds → POST /api/rapport/respond
 * 3. AI extracts info, saves to user.rapportAnswers
 * 4. After 3-5 exchanges, marks rapportBuildingComplete = true
 * 5. Naturally transitions to assessment
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { callLLM } = require('../utils/llmGateway');
const { generateSystemPrompt } = require('../utils/prompt');
const TUTOR_CONFIG = require('../utils/tutorConfig');

/**
 * POST /api/rapport/respond
 * Handle user responses during rapport building phase
 */
router.post('/respond', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const { message } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Message is required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Initialize rapportAnswers if needed
        if (!user.rapportAnswers) {
            user.rapportAnswers = {};
        }

        // Get conversation context
        let conversation;
        if (user.activeConversationId) {
            conversation = await Conversation.findById(user.activeConversationId);
        }
        if (!conversation || !conversation.isActive) {
            conversation = new Conversation({
                userId: user._id,
                messages: [],
                isMastery: false
            });
            user.activeConversationId = conversation._id;
            await user.save();
        }

        // Add user's message to conversation
        conversation.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        // Count rapport exchanges (user messages only, excluding welcome)
        const rapportMessageCount = conversation.messages.filter(
            m => m.role === 'user'
        ).length;

        // Get tutor config
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId
            : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const tutorNameForPrompt = currentTutor.name;

        // Extract information from user's response and generate next message
        const systemPrompt = generateSystemPrompt(user, tutorNameForPrompt, null, 'student');

        const extractionPrompt = `You're having a getting-to-know-you conversation with ${user.firstName}.

Current knowledge about them:
${JSON.stringify(user.rapportAnswers, null, 2)}

Their latest message: "${message}"

TASK 1: Extract any new information from their message and update the following JSON (keep existing data, add new):
{
  "interests": "what they're interested in learning or topics they like",
  "favoriteSubject": "favorite subject in school",
  "currentTopic": "what they're currently working on in math class",
  "learningGoal": "what they want to improve at or learn",
  "conversationStyle": "brief notes on how they communicate (e.g., 'enthusiastic', 'shy', 'detailed', 'brief')"
}

TASK 2: Decide if rapport building is complete (after ${rapportMessageCount} exchanges).
Complete if: You have a good sense of their interests and learning goals (usually after 3-5 questions).

TASK 3: Generate your next response:
- If rapport complete (TASK 2 = yes): Naturally transition to suggesting you see where they're at with some problems. Don't call it a test - make it sound fun and low-pressure.
- If rapport incomplete: Ask another casual question to learn more. Reference what they shared. Mix it up - use different question styles. Sound like texting a friend.

RESPOND IN THIS EXACT JSON FORMAT:
{
  "extractedInfo": { /* updated JSON from TASK 1 */ },
  "rapportComplete": true/false,
  "nextMessage": "your response here"
}`;

        const extractionMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extractionPrompt }
        ];

        // Use GPT-4o-mini for rapport building
        const completion = await callLLM('gpt-4o-mini', extractionMessages, {
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0].message.content.trim());

        // Update user's rapport answers
        user.rapportAnswers = {
            ...user.rapportAnswers,
            ...result.extractedInfo
        };

        // Mark rapport building as complete if AI decides it's time
        if (result.rapportComplete) {
            user.rapportBuildingComplete = true;
        }

        await user.save();

        // Add AI's response to conversation
        conversation.messages.push({
            role: 'assistant',
            content: result.nextMessage,
            timestamp: new Date()
        });
        conversation.lastActivity = new Date();
        await conversation.save();

        res.json({
            message: result.nextMessage,
            rapportComplete: result.rapportComplete,
            voiceId: currentTutor.voiceId
        });

    } catch (error) {
        console.error('[Rapport Building] Error:', error);
        res.status(500).json({
            error: 'Failed to process rapport building response',
            message: error.message
        });
    }
});

/**
 * GET /api/rapport/status
 * Check rapport building status for current user
 */
router.get('/status', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('rapportBuildingComplete rapportAnswers');

        res.json({
            rapportComplete: user.rapportBuildingComplete || false,
            rapportAnswers: user.rapportAnswers || {}
        });
    } catch (error) {
        console.error('[Rapport Status] Error:', error);
        res.status(500).json({ error: 'Failed to get rapport status' });
    }
});

module.exports = router;
