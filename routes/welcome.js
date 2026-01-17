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

        const systemPromptForWelcome = generateSystemPrompt(user, tutorNameForPrompt, null, 'student', null, null, null, [], null, conversationContextForPrompt);
        let messagesForAI = [{ role: "system", content: systemPromptForWelcome }];
        let userMessagePart;

        // Get temporal context for natural, time-aware greetings
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
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
        if (!user.rapportBuildingComplete && !user.assessmentCompleted) {
            messagesForAI.push({
                role: "system",
                content: `Brand new student (${user.grade || 'grade unknown'}). ${temporalContext}. Be contextually aware of the time and day.`
            });

            // Build time-aware question examples
            let questionExamples = [];
            if (isMonday) questionExamples.push('"How was your weekend?"', '"Did you do anything fun this weekend?"');
            if (isFriday) questionExamples.push('"Got any fun plans for the weekend?"', '"Almost the weekend!"');
            if (isLateNight) questionExamples.push('"Whew it\'s late! Just starting homework?"', '"Burning the midnight oil?"');
            if (isAfterSchool && !isWeekend) questionExamples.push('"How was school today?"', '"What are you working on in math this week?"');
            if (isWeekend) questionExamples.push('"How\'s your weekend going?"', '"What\'s up?"');
            // Always include general options
            questionExamples.push('"What are you working on in math lately?"', '"What\'s up?"');

            const exampleQuestions = questionExamples.slice(0, 3).join(' or ');

            userMessagePart = `Write a casual greeting for ${user.firstName}. Introduce yourself quickly, then ask ONE natural, time-aware question like ${exampleQuestions}. Use the temporal context (${temporalContext}) to make it feel natural and relevant. Sound like you're texting a friend. 1-2 sentences total. Don't ask for info you already have (like grade level).`;
        }

        // RAPPORT IN PROGRESS: Transition to math quickly
        else if (!user.rapportBuildingComplete && user.rapportAnswers && Object.keys(user.rapportAnswers).length > 0) {
            messagesForAI.push({
                role: "system",
                content: `Second message. Keep it brief. Info: ${JSON.stringify(user.rapportAnswers)}`
            });
            userMessagePart = `Acknowledge their answer briefly, then naturally suggest starting with some problems to see where they're at. Don't drag it out. Make it sound fun and low-pressure. 1-2 sentences max.`;
        }

        // INCOMPLETE ASSESSMENT: Offer to resume
        else if (activeScreenerSession && !user.assessmentCompleted) {
            const questionsCompleted = activeScreenerSession.questionCount || 0;
            messagesForAI.push({
                role: "system",
                content: `Returning user with incomplete assessment. They answered ${questionsCompleted} questions already.`
            });
            userMessagePart = `Write a casual greeting for ${user.firstName}. Note that they started the placement assessment (${questionsCompleted} questions done) but didn't finish. Offer to continue where they left off or start fresh - keep it super casual and no-pressure. Sound like you're texting. 2 sentences max.`;
        }

        // ASSESSMENT NEEDED (but rapport complete)
        else if (assessmentNeeded && user.rapportBuildingComplete) {
            userMessagePart = `Write a brief, natural transition for ${user.firstName} to start the placement assessment. Reference that you've chatted a bit, now you want to see where they're at. Make it sound exciting and low-pressure. 2 sentences max. Don't call it a "test" - just say you want to see what they know.`;
        }

        // RETURNING USER: Natural welcome back
        else if (contextType !== 'none') {
            messagesForAI.push({
                role: "system",
                content: `Returning student. ${temporalContext}. Last session: ${lastContextForAI}`
            });
            userMessagePart = `Write a quick, natural greeting for ${user.firstName}. Context: ${temporalContext}. Be time-aware - if it's Monday ask about the weekend, if it's late night acknowledge that, if it's Friday mention the weekend coming up. Sound like you're texting. Sometimes reference last session casually, sometimes just say hi and ask what they want to work on. Keep it SHORT (1-2 sentences). Mix up your greetings - use different phrases each time. NO formulaic openings like "Great to see you" or "Welcome back". Be spontaneous and genuine.`;
        }

        // FALLBACK: Simple natural greeting
        else {
            messagesForAI.push({ role: "system", content: `${temporalContext}` });
            userMessagePart = `Write a short, friendly greeting for ${user.firstName}. Context: ${temporalContext}. Be time-aware (Monday = weekend reference, late night = acknowledge time, etc.). Sound natural and human. Ask what they want to work on. 1-2 sentences. Vary your greetings - don't use the same phrases twice.`;
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
        res.status(500).json({ greeting: `Hello ${userName}! How can I help you today?`, error: "Failed to load personalized welcome." });
    }
});

module.exports = router;