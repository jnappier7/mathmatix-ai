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
const { verify: pipelineVerify } = require('../utils/pipeline');
const { generateSystemPrompt } = require('../utils/prompt');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const { sanitizeRapportAnswers } = require('../utils/rapportNotes');

// "1-2 questions MAX" (above), enforced server-side rather than left to the model.
const MAX_RAPPORT_EXCHANGES = 2;

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
        user.learningProfile = user.learningProfile || {};
        if (!user.learningProfile.rapportAnswers) {
            user.learningProfile.rapportAnswers = {};
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

        // Get temporal context
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isMonday = dayOfWeek === 1;
        const isFriday = dayOfWeek === 5;
        const isLateNight = hour >= 21 || hour < 6;
        const isAfterSchool = hour >= 15 && hour < 20;

        let timeContext = '';
        if (hour < 12) timeContext = 'morning';
        else if (hour < 17) timeContext = 'afternoon';
        else timeContext = 'evening';

        let temporalContext = `${dayNames[dayOfWeek]} ${timeContext}`;
        if (isLateNight) temporalContext += ' (late night)';
        if (isAfterSchool && !isWeekend) temporalContext += ' (after school)';

        // Get tutor config
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId
            : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const tutorNameForPrompt = currentTutor.name;

        // Extract information from user's response and generate next message
        const systemPrompt = generateSystemPrompt(user, tutorNameForPrompt, null, 'student');

        const extractionPrompt = `Brief intro chat with ${user.firstName} (Grade: ${user.gradeLevel || 'unknown'}). Exchange count: ${rapportMessageCount}. Context: ${temporalContext}.

Current info: ${JSON.stringify(user.learningProfile.rapportAnswers, null, 2)}
Their message: "${message}"

TASK 1: Note what they told you, in a few plain words each. Leave a field out if they didn't say:
{
  "currentTopic": "what they're working on or struggling with in math",
  "learningGoal": "what they want to get better at",
  "interests": "hobbies or interests they mentioned"
}

TASK 2: Decide if rapport is complete.
Complete if ANY of these:
- This is the 2nd user message (after ${rapportMessageCount} exchanges, move on)
- They seem eager/ready ("let's go", "ready", short answers)
- They didn't share much (just basic reply)

TASK 3: Your response (be time-aware using context: ${temporalContext}):
- If complete: Quick, natural transition to assessment. "Cool! Let's see what you know" or similar. Sound casual and contextual.
- If not complete (only if 1st message AND they shared something specific): ONE brief, natural follow-up. Be time-aware if relevant.

Examples of time-aware transitions:
- Late night: "Nice! Alright let's knock out some problems and get you to bed"
- Monday: "Cool! Let's start the week strong with some problems"
- Friday: "Awesome! Let's see what you know so you can enjoy your weekend"

RESPOND IN JSON:
{
  "extractedInfo": { /* from TASK 1 */ },
  "rapportComplete": true/false,
  "nextMessage": "your response (1-2 sentences, time-aware)"
}`;

        const extractionMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extractionPrompt }
        ];

        // Use GPT-4o-mini for rapport building (keep it brief!)
        const rapportAiStart = Date.now();
        const completion = await callLLM('gpt-4o-mini', extractionMessages, {
            max_tokens: 150,
            response_format: { type: 'json_object' }
        });

        // Track AI processing time (server-side, for fair billing)
        const rapportAiSeconds = Math.ceil((Date.now() - rapportAiStart) / 1000);
        User.findByIdAndUpdate(user._id, {
            $inc: { weeklyAISeconds: rapportAiSeconds, totalAISeconds: rapportAiSeconds }
        }).catch(err => console.error('[Rapport] AI time tracking error:', err));

        const result = JSON.parse(completion.choices[0].message.content.trim());

        // The prompt asks the model to wrap up by the 2nd message, but only
        // the server can guarantee it: every message sent before this flag
        // flips comes here instead of to the tutor, so a model that keeps
        // saying "not yet" traps a student who is asking real math questions
        // in small talk.
        if (rapportMessageCount >= MAX_RAPPORT_EXCHANGES) {
            result.rapportComplete = true;
        }
        // A reply without nextMessage used to render as nothing at all.
        if (typeof result.nextMessage !== 'string' || !result.nextMessage.trim()) {
            result.nextMessage = result.rapportComplete
                ? "Cool — let's jump into some math!"
                : 'Nice to meet you! What are you working on in math right now?';
        }

        // Store what the student told us — under the schema's own field names
        // (anything else is dropped by strict mode, which is how these notes
        // never reached a prompt) and cleaned, because every value lands in
        // the student's system prompt from now on. See utils/rapportNotes.js.
        for (const [key, value] of Object.entries(sanitizeRapportAnswers(result.extractedInfo))) {
            user.set(`learningProfile.rapportAnswers.${key}`, value);
        }

        // Mark rapport building as complete if AI decides it's time
        if (result.rapportComplete) {
            user.learningProfile = user.learningProfile || {};
            user.learningProfile.rapportBuildingComplete = true;
        }

        await user.save();

        // Pipeline verify on the student-facing nextMessage. Rapport
        // dialogue is short and non-mathematical, but verify still
        // strips stray system tags and catches accidental math leaks.
        if (result.nextMessage) {
            try {
                const verified = await pipelineVerify(result.nextMessage, {
                    userId: user._id?.toString?.(),
                    userMessage: req.body?.message,
                    firstName: user.firstName,
                    isStreaming: false,
                });
                result.nextMessage = verified.text || result.nextMessage;
            } catch (err) {
                console.warn('[Rapport] verify failed (using unverified):', err.message);
            }
        }

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
            voiceId: currentTutor.cartesiaVoiceId,
            triggerAssessment: result.rapportComplete // Signal frontend to show assessment pitch
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
        const user = await User.findById(req.user._id).select('learningProfile.rapportBuildingComplete learningProfile.rapportAnswers');

        res.json({
            rapportComplete: user.learningProfile?.rapportBuildingComplete || false,
            rapportAnswers: user.learningProfile?.rapportAnswers || {}
        });
    } catch (error) {
        console.error('[Rapport Status] Error:', error);
        res.status(500).json({ error: 'Failed to get rapport status' });
    }
});

module.exports = router;
