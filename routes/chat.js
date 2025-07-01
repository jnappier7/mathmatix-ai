// routes/chat.js - UPDATED for OpenAI primary, Claude fallback, iMessage-style pacing hooks, and XP/Accommodation logic

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require('../utils/openaiClient'); // Centralized LLM call function
// Removed: const { trimBuffer, summarize } = require('../utils/memoryUtils'); // THIS LINE IS REMOVED
const TUTOR_CONFIG = require('../utils/tutorConfig'); // For voiceId lookup
const BRAND_CONFIG = require('../utils/brand'); // For XP range

// --- NEW: Import the summary_generator route directly as a function ---
const summarizeConversation = require('../routes/summary_generator'); // Assuming summary_generator exports a function

// Define models for chat and summary
const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, wide context (e.g., OpenAI GPT-4o Mini)
const SUMMARY_MODEL = "claude-3-haiku-20240307"; // Good for summarization (e.g., Anthropic Claude Haiku)

// Define reasonable character limits for user input
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 8; // Limit number of recent messages sent to AI for context

// Define accommodation triggers that AI might send as part of response JSON
const ACCOMMODATION_TRIGGERS = {
    // Key: value AI sends, Value: { type: 'banner_type', text: 'text to display on frontend' }
    'focus_mode_trigger': { type: 'info', text: 'Focus mode enabled: Minimal distractions.' },
    'extended_time_trigger': { type: 'info', text: 'Extended time granted. Take your time.' },
    'calculator_allowed_trigger': { type: 'info', text: 'Feel free to use a calculator for this problem!' },
    'audio_read_aloud_prompt': { type: 'info', text: 'Click the play button to hear the problem read aloud.' },
    'math_anxiety_trigger': { type: 'warning', text: 'Remember to breathe. You\'ve got this!' },
    // Chunking instructions will be more dynamic with current/total
};


router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId, chatHistory } = req.body;

    // --- 1. SERVER-SIDE INPUT VALIDATION & LIMITING ---
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` });
    }

    try {
        const user = await User.findById(userId).lean(); // Fetch user as lean object for read-only access initially
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // --- 2. Determine User Context (Student or Parent-of-Student) ---
        let studentProfileForPrompt = user; // Default to current user
        let currentRoleForPrompt = role;
        let childProfileForPrompt = null;
        let tutorIdToUse = user.selectedTutorId || 'default';
        let tutorVoiceId = TUTOR_CONFIG[tutorIdToUse]?.voiceId || TUTOR_CONFIG['default'].voiceId;

        if (role === 'parent' && childId) {
            const child = await User.findById(childId).lean();
            if (child && user.children.some(c => c.equals(childId))) {
                childProfileForPrompt = child;
                studentProfileForPrompt = child; // AI's persona is still tutoring the child
                currentRoleForPrompt = 'parent';
                tutorIdToUse = child.selectedTutorId || 'default';
                tutorVoiceId = TUTOR_CONFIG[tutorIdToUse]?.voiceId || TUTOR_CONFIG['default'].voiceId;
            } else {
                return res.status(403).json({ message: "Forbidden: Child not found or not linked to this parent." });
            }
        }

        // --- 3. Generate Personalized System Prompt ---
        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, TUTOR_CONFIG[tutorIdToUse].name, childProfileForPrompt, currentRoleForPrompt);

        // --- 4. Prepare Chat History for AI (Live Buffer) ---
        // Ensure chatHistory is an array, map to AI's expected roles
        const formattedHistory = (chatHistory || [])
            .slice(-MAX_HISTORY_LENGTH_FOR_AI) // Trim to live buffer limit (logic from original memoryUtils)
            .map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user', // OpenAI/Anthropic roles
                content: msg.content
            }));

        const messages = [
            { role: "system", content: systemPrompt },
            ...formattedHistory,
            { role: "user", content: message }
        ];
        
        // --- 5. Call AI Model (Primary with Fallback) ---
        const completion = await callLLM(PRIMARY_CHAT_MODEL, messages); // Using centralized LLM call

        let aiResponseText = completion.choices[0].message.content.trim();
        let userXpAwarded = 0;
        let specialXpAwardedMessage = null;
        let frontendAccommodationTrigger = null; // For specific UI banners/overlays
        let frontendChunkedInstruction = null; // For chunked problem progress

        // --- 6. Parse AI Response for XP & Accommodation Triggers ---
        const xpMatch = aiResponseText.match(/<AWARD_XP:(\d+)>/);
        if (xpMatch && currentRoleForPrompt === 'student') {
            userXpAwarded = parseInt(xpMatch[1]);
            // Ensure XP is within defined bounds
            userXpAwarded = Math.min(Math.max(userXpAwarded, BRAND_CONFIG.xpAwardRange.min), BRAND_CONFIG.xpAwardRange.max);
            aiResponseText = aiResponseText.replace(/<AWARD_XP:\d+>/, '').trim();

            // Update user's XP and Level
            const studentUserDoc = await User.findById(userId); // Fetch mutable document
            studentUserDoc.xp = (studentUserDoc.xp || 0) + userXpAwarded;
            studentUserDoc.xpHistory.push({ date: new Date(), amount: userXpAwarded, reason: "AI Award" });
            const newCalculatedLevel = Math.floor(studentUserDoc.xp / BRAND_CONFIG.xpPerLevel) + 1; // Level up calculation

            if (newCalculatedLevel > studentUserDoc.level) {
                studentUserDoc.level = newCalculatedLevel;
                specialXpAwardedMessage = `🎉 Congratulations! You leveled up to Level ${studentUserDoc.level}!`;
            } else if (userXpAwarded > 0) {
                specialXpAwardedMessage = `+${userXpAwarded} XP!`; // Generic XP message if not level up
            }
            await studentUserDoc.save();
            studentProfileForPrompt = studentUserDoc.toObject(); // Update for response
        }

        // Parse AI response for accommodation triggers
        const accomMatch = aiResponseText.match(/<ACCOMMODATION_TRIGGER:([a-zA-Z0-9_]+)>/);
        if (accomMatch) {
            const triggerKey = accomMatch[1];
            if (ACCOMMODATION_TRIGGERS[triggerKey]) {
                frontendAccommodationTrigger = ACCOMMODATION_TRIGGERS[triggerKey];
            }
            aiResponseText = aiResponseText.replace(/<ACCOMMODATION_TRIGGER:[a-zA-Z0-9_]+>/, '').trim();
        }

        // Parse AI response for chunked instruction progress (e.g., <CHUNK:1/5>)
        const chunkMatch = aiResponseText.match(/<CHUNK:(\d+)\/(\d+)>/);
        if (chunkMatch) {
            frontendChunkedInstruction = {
                current: parseInt(chunkMatch[1]),
                total: parseInt(chunkMatch[2])
            };
            aiResponseText = aiResponseText.replace(/<CHUNK:\d+\/\d+>/, '').trim();
        }


        // --- 7. Session Management & Summary Saving ---
        const mutableUserForSession = await User.findById(userId); // Get a mutable user document for session updates

        let currentSessionIndex = mutableUserForSession.conversations.length > 0 ? mutableUserForSession.conversations.length - 1 : -1;
        let currentSession = currentSessionIndex !== -1 ? mutableUserForSession.conversations[currentSessionIndex] : null;

        // Condition to create a new session: no conversations, or last session already summarized (meaning it's 'closed')
        // Or if the last session was just an "Initial Welcome Message" marker.
        if (!currentSession || currentSession.summary !== null || (currentSession.summary === "Initial Welcome Message" && currentSession.messages.length > 1) ) {
            currentSession = {
                date: new Date(),
                messages: [],
                summary: null,
                activeMinutes: 0
            };
            mutableUserForSession.conversations.push(currentSession); // Push new session object
            currentSessionIndex = mutableUserForSession.conversations.length - 1; // Update index to the new session
        }

        // Add current user message and AI response to the session's message log
        mutableUserForSession.conversations[currentSessionIndex].messages.push({ role: 'user', content: message });
        mutableUserForSession.conversations[currentSessionIndex].messages.push({ role: 'assistant', content: aiResponseText });

        // Update active minutes
        mutableUserForSession.conversations[currentSessionIndex].activeMinutes = (mutableUserForSession.conversations[currentSessionIndex].activeMinutes || 0) + 1;

        await mutableUserForSession.save(); // Save the entire user document with updated conversations

        // Asynchronously generate and save summary if conditions met
        if (mutableUserForSession.conversations[currentSessionIndex].messages.length >= BRAND_CONFIG.motion.liveBufferLimit && !mutableUserForSession.conversations[currentSessionIndex].summary) {
            const sessionTranscriptForSummary = mutableUserForSession.conversations[currentSessionIndex].messages;
            const studentProfileForSummary = studentProfileForPrompt;
            const sessionToUpdateId = currentSession._id;

            const summaryMessages = [{
                role: "user",
                content: `Summarize the following tutoring session transcript for a teacher in under ${BRAND_CONFIG.summaryTokenLimit} tokens. Focus on topics, student understanding, and next steps.
                Student Profile: Name: ${studentProfileForSummary.name}, Grade: ${studentProfileForSummary.gradeLevel}, Math Course: ${studentProfileForSummary.mathCourse}
                IEP: ${studentProfileForSummary.iepPlan?.accommodations?.mathAnxietySupport ? 'Math Anxiety Support: Yes' : 'No'}
                Transcript:
                ${sessionTranscriptForSummary.map(m => `${m.role}: ${m.content}`).join('\n')}
                `
            }];

            callLLM(SUMMARY_MODEL, summaryMessages, { max_tokens: BRAND_CONFIG.summaryTokenLimit })
                .then(summaryCompletion => {
                    const generatedSummary = summaryCompletion.choices[0]?.message?.content?.trim() || "No summary generated.";
                    // Update the summary directly on the specific conversation subdocument
                    return User.findOneAndUpdate(
                        { _id: userId, 'conversations._id': sessionToUpdateId },
                        { $set: { 'conversations.$.summary': generatedSummary } }
                    );
                })
                .then(() => console.log('LOG: Session summary generated and saved successfully for user:', userId))
                .catch(summaryError => console.error('ERROR: Failed to generate/save session summary:', summaryError));
        }

        // --- 8. Construct Response for Frontend ---
        res.json({
            text: aiResponseText,
            newChatHistory: mutableUserForSession.conversations[currentSessionIndex].messages.slice(-MAX_HISTORY_LENGTH_FOR_AI), // Return only trimmed history for next turn
            userXp: studentProfileForPrompt.xp, // Use potentially updated XP
            userLevel: studentProfileForPrompt.level, // Use potentially updated level
            specialXpAwarded: specialXpAwardedMessage,
            voiceId: tutorVoiceId,
            accommodationPrompt: frontendAccommodationTrigger,
            chunkedInstruction: frontendChunkedInstruction
        });

    } catch (error) {
        console.error("ERROR: Chat route failed to get AI response:", error?.response?.data || error.message || error);
        res.status(500).json({ message: "Failed to get response from AI. Please try again." });
    }
});

module.exports = router;