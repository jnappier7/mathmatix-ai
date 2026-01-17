/**
 * RAPPORT BUILDING API
 *
 * Handles brief getting-to-know-you exchange for new users before skills assessment.
 * Goal: Quick, natural intro (1-2 questions MAX). Read the room - don't force it.
 *
 * Flow:
 * 1. Welcome message asks ONE casual question (grade/topic)
 * 2. User responds → POST /api/rapport/respond
 * 3. AI extracts info, detects if student wants to jump straight to math
 * 4. After 1-2 exchanges (or if student seems eager), marks rapportBuildingComplete = true
 * 5. Transitions to assessment naturally
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

        const extractionPrompt = `Brief intro chat with ${user.firstName}. Exchange count: ${rapportMessageCount}.

Current info: ${JSON.stringify(user.rapportAnswers, null, 2)}
Their message: "${message}"

TASK 1: Extract key info (keep brief):
{
  "currentTopic": "what they're working on in math",
  "grade": "their grade level if mentioned",
  "eagerness": "do they seem eager to start? ready to jump in?"
}

TASK 2: Decide if rapport is complete.
Complete if ANY of these:
- This is the 2nd user message (after ${rapportMessageCount} exchanges, move on)
- They seem eager/ready to start (short answers, "let's go", "ready", etc.)
- You have enough basic info (grade/topic)

TASK 3: Your response:
- If complete: Quick transition to assessment. Sound excited, low-pressure. "Cool, let's see where you're at!"
- If not complete (only if 1st message AND they gave detailed answer): ONE brief follow-up max. Don't drag it out.

RESPOND IN JSON:
{
  "extractedInfo": { /* from TASK 1 */ },
  "rapportComplete": true/false,
  "nextMessage": "your response (1-2 sentences)"
}`;

        const extractionMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extractionPrompt }
        ];

        // Use GPT-4o-mini for rapport building (keep it brief!)
        const completion = await callLLM('gpt-4o-mini', extractionMessages, {
            max_tokens: 150,
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
