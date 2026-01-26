// PASTE-READY: Final version of routes/welcome.js for maximum personalization

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Conversation = require('../models/conversation');
const ScreenerSession = require('../models/screenerSession');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
const TUTOR_CONFIG = require("../utils/tutorConfig");
const { needsAssessment } = require('../services/chatService');

router.get('/', async (req, res) => {
    const userId = req.user?._id;
    if (!userId) {
        return res.status(400).json({ error: "Not authenticated." });
    }

    let user = null; // CRITICAL FIX: Declare outside try block for catch block access

    try {
        user = await User.findById(userId); // Removed .lean() so we can modify and save user
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                               ? user.selectedTutorId
                               : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const voiceIdForWelcome = currentTutor.voiceId;
        const tutorNameForPrompt = currentTutor.name;

        // Load or create active conversation to save welcome message
        let activeConversation;
        if (user.activeConversationId) {
            activeConversation = await Conversation.findById(user.activeConversationId);
        }
        // Create new conversation if needed (following same pattern as chat.js)
        if (!activeConversation || !activeConversation.isActive || activeConversation.isMastery) {
            activeConversation = new Conversation({ userId: user._id, messages: [], isMastery: false });
            user.activeConversationId = activeConversation._id;
            await user.save();
        }

        let lastContextForAI = null;
        let contextType = 'none';

        // Use existing conversation for context (no need to reload)
        if (activeConversation && activeConversation.messages && activeConversation.messages.length > 0) {
            lastContextForAI = activeConversation.messages.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n');
            contextType = 'recent_messages';
        }

        if (!lastContextForAI) {
            const lastArchivedConversation = await Conversation.findOne({
                userId: user._id,
                summary: { $ne: null, $ne: "Initial Welcome Message" }
            }).sort({ lastActivity: -1 });

            if (lastArchivedConversation) {
                lastContextForAI = lastArchivedConversation.summary;
                contextType = 'summary';
            }
        }

        // Check for incomplete screener session (resumption)
        const activeScreenerSession = await ScreenerSession.getActiveSession(userId);

        // Check if user needs skills assessment
        const assessmentNeeded = await needsAssessment(userId);

        // Build conversation context if session has a specific topic/name
        let conversationContextForPrompt = null;
        if (activeConversation && (activeConversation.conversationName !== 'Math Session' || activeConversation.topic)) {
            conversationContextForPrompt = {
                conversationName: activeConversation.conversationName,
                topic: activeConversation.topic,
                topicEmoji: activeConversation.topicEmoji
            };
        }

        const systemPromptForWelcome = generateSystemPrompt(user, currentTutor, null, 'student', null, null, null, [], null, conversationContextForPrompt);
        let messagesForAI = [{ role: "system", content: systemPromptForWelcome }];
        let userMessagePart;

        // Get temporal context for natural, time-aware greetings (EST/EDT)
        const now = new Date();

        // Convert to Eastern Time (handles EST/EDT automatically)
        const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hour = estTime.getHours();
        const dayOfWeek = estTime.getDay(); // 0 = Sunday, 6 = Saturday
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        let timeContext = '';
        if (hour < 12) timeContext = 'morning';
        else if (hour < 17) timeContext = 'afternoon';
        else timeContext = 'evening';

        // Build rich temporal context
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isMonday = dayOfWeek === 1;
        const isFriday = dayOfWeek === 5;
        const isLateNight = hour >= 21 || hour < 6; // 9pm - 6am
        const isAfterSchool = hour >= 15 && hour < 20; // 3pm - 8pm

        let temporalContext = `${dayNames[dayOfWeek]} ${timeContext}`;
        if (isLateNight) temporalContext += ' (late night)';
        if (isAfterSchool && !isWeekend) temporalContext += ' (after school)';
        if (isMonday) temporalContext += ' (start of week)';
        if (isFriday) temporalContext += ' (end of week)';

        // --- DYNAMIC WELCOME MESSAGE BASED ON USER STATE ---

        // NEW USER: Start with ONE casual question
        if (!user.learningProfile?.rapportBuildingComplete && !user.assessmentCompleted) {
            messagesForAI.push({
                role: "system",
                content: `Brand new student (${user.grade || 'grade unknown'}). ${temporalContext}. Be contextually aware of the time and day.`
            });

            // Build time-aware question examples
            let questionExamples = [];
            if (isMonday) questionExamples.push('"How was your weekend?"', '"Did you get to do anything fun?"');
            if (isFriday) questionExamples.push('"Any plans for the weekend?"', '"Ready for the weekend?"');
            if (isLateNight) questionExamples.push('"Up late working on something?"', '"Still working? What\'s up?"');
            if (isAfterSchool && !isWeekend) questionExamples.push('"How was your day?"', '"What\'s going on in math class?"');
            if (isWeekend) questionExamples.push('"What\'s up?"', '"How\'s it going?"');
            // Always include general options
            questionExamples.push('"What do you want to work on?"', '"What brings you here?"', '"Need help with anything specific?"');

            const exampleQuestions = questionExamples.slice(0, 3).join(' or ');

            userMessagePart = `Write a short, casual greeting for ${user.firstName}. Introduce yourself briefly, then ask ONE natural question like ${exampleQuestions}. Consider the time/day (${temporalContext}) but keep it natural - not forced. Sound like you're texting. 1-2 sentences max. Don't mention grade level or info you already know.`;
        }

        // RAPPORT IN PROGRESS: Transition to math quickly
        else if (!user.learningProfile?.rapportBuildingComplete && user.learningProfile?.rapportAnswers && Object.keys(user.learningProfile.rapportAnswers).length > 0) {
            messagesForAI.push({
                role: "system",
                content: `Second message. Keep it brief. Info: ${JSON.stringify(user.learningProfile.rapportAnswers)}`
            });
            userMessagePart = `Acknowledge their answer briefly, then suggest starting with some problems. Be natural and low-pressure. 1-2 sentences. Don't introduce yourself again - they know who you are. Don't use phrases like "buddy" or overly enthusiastic language.`;
        }

        // INCOMPLETE ASSESSMENT: Offer to resume
        else if (activeScreenerSession && !user.assessmentCompleted) {
            const questionsCompleted = activeScreenerSession.questionCount || 0;
            messagesForAI.push({
                role: "system",
                content: `Returning user with incomplete assessment. They answered ${questionsCompleted} questions already.`
            });
            userMessagePart = `Casual greeting for ${user.firstName}. Don't introduce yourself - they've met you. Mention they started the placement (${questionsCompleted} questions done) but didn't finish. Offer to continue or start over - keep it relaxed. 1-2 sentences. Sound like texting, not like a teacher.`;
        }

        // FIRST ASSESSMENT NEEDED (new user, rapport complete)
        // Note: Re-assessments are only triggered by teachers/parents, not auto-offered to students
        else if (assessmentNeeded && user.learningProfile?.rapportBuildingComplete) {
            userMessagePart = `Write a brief, natural transition for ${user.firstName} to start the placement assessment. Don't introduce yourself - they know you. Reference that you've chatted a bit, now you want to see where they're at. Make it sound exciting and low-pressure. 2 sentences max. Don't call it a "test" - just say you want to see what they know.`;
        }

        // RETURNING USER: Natural welcome back
        else if (contextType !== 'none') {
            // Generate a random seed to force variety in AI responses
            const greetingStyles = [
                'casual and brief - just say hey and ask what they need',
                'reference last session briefly if relevant',
                'time/day-aware - mention Monday/weekend/late night naturally',
                'jump straight to asking what they want to work on',
                'friendly but direct - skip pleasantries'
            ];
            const randomStyle = greetingStyles[Math.floor(Math.random() * greetingStyles.length)];
            const varietySeed = Math.floor(Math.random() * 10000); // Random number to force different responses

            messagesForAI.push({
                role: "system",
                content: `Returning student. ${temporalContext}. Last session context: ${lastContextForAI}. Variety seed: ${varietySeed}`
            });
            userMessagePart = `Write a ${randomStyle}. For ${user.firstName}. Keep it VERY short (1 sentence). Sound natural, like texting. CRITICAL: DON'T introduce yourself - they already know you. Vary your word choice every time - don't repeat phrases like "my friend", "buddy", "pal" etc. Just jump right in. Context: ${temporalContext}. NO canned greetings. Be spontaneous.`;
        }

        // FALLBACK: Simple natural greeting
        else {
            const varietySeed = Math.floor(Math.random() * 10000);
            messagesForAI.push({ role: "system", content: `${temporalContext}. Variety seed: ${varietySeed}` });
            userMessagePart = `Write a brief greeting for ${user.firstName}. Context: ${temporalContext}. Don't introduce yourself. Keep it natural like texting. Ask what they need help with. 1 sentence. Don't use repetitive phrases like "buddy" or "my friend". Be direct and genuine.`;
        }
        // --- END OF DYNAMIC WELCOME LOGIC ---
        
        messagesForAI.push({ role: "user", content: userMessagePart });

        // Use GPT-4o-mini for natural, engaging welcome messages
        const completion = await callLLM("gpt-4o-mini", messagesForAI, { max_tokens: 80 });
        const initialWelcomeMessage = completion.choices[0].message.content.trim();

        // Save welcome message to conversation history for AI context
        activeConversation.messages.push({
            role: 'assistant',
            content: initialWelcomeMessage,
            timestamp: new Date()
        });
        activeConversation.lastActivity = new Date();
        await activeConversation.save();

        res.json({ greeting: initialWelcomeMessage, voiceId: voiceIdForWelcome });

    } catch (error) {
        console.error("ERROR: Error generating personalized welcome message from AI:", error?.message || error);
        const userName = user?.firstName || 'there';

        // Fallback with variety (only used if AI fails)
        const fallbackGreetings = [
            `Hey ${userName}! What do you need help with?`,
            `Hi ${userName}! What are you working on?`,
            `${userName}! What's up?`,
            `Hey ${userName}! What brings you here?`,
            `${userName}! Ready to work on some math?`
        ];
        const randomGreeting = fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)];

        res.status(500).json({ greeting: randomGreeting, error: "Failed to load personalized welcome." });
    }
});

module.exports = router;