// routes/chat.js - MODIFIED TO MANAGE & SUMMARIZE SESSIONS
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const { generateSystemPrompt } = require('../utils/prompt');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const saveConversation = require('../routes/memory'); // Import the saveConversation function

// Initialize Gemini AI model (using 1.5-flash for general chat)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Initialize Gemini AI model for summarization (using 1.5-pro for better quality summaries)
const summaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Function to generate a summary for a conversation session
async function generateSessionSummary(messageLog, studentProfile) {
    const summarizationPrompt = `
    You are an AI assistant tasked with summarizing a tutoring session.
    Your goal is to provide a concise, actionable summary of the student's progress and the session's focus, along with suggestions for next steps.

    --- Student Profile ---
    Name: ${studentProfile.firstName} ${studentProfile.lastName}
    Grade Level: ${studentProfile.gradeLevel}
    Math Course: ${studentProfile.mathCourse || 'N/A'}
    Learning Style: ${studentProfile.learningStyle}
    Tone Preference: ${studentProfile.tonePreference}
    ${studentProfile.iepPlan && studentProfile.iepPlan.goals && studentProfile.iepPlan.goals.length > 0 ?
        `IEP Goals: \n${studentProfile.iepPlan.goals.map(g => `- ${g.description} (Progress: ${g.currentProgress}%)`).join('\n')}` : ''}
    --- End Student Profile ---

    --- Session Transcript ---
    ${messageLog.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}
    --- End Session Transcript ---

    Please provide a summary for the teacher. The summary should be:
    1.  **Concise (1-3 paragraphs):** Get straight to the point.
    2.  **Teacher-Focused:** Use professional language suitable for an educator.
    3.  **Highlights Key Learning:** What was the main math topic? What concepts were introduced or reviewed?
    4.  **Student's Engagement/Understanding:** How did the student perform? Were they engaged? Did they grasp the concepts? What were their specific areas of difficulty or success? (e.g., "struggled with finding common denominators," "demonstrated strong understanding of cross-multiplication").
    5.  **Suggestions for Next Steps:** Provide 1-3 concrete, actionable suggestions for the teacher to continue supporting the student's learning, building on this session. These could be:
        * Practice specific problem types.
        * Review a particular concept.
        * Consider specific scaffolding strategies.
        * Refer to IEP goals if relevant to the session.
    `;

    try {
        const result = await summaryModel.generateContent({
            contents: [{ role: "user", parts: [{ text: summarizationPrompt }] }]
        });
        return result.response.text().trim();
    } catch (error) {
        console.error('ERROR: Gemini summarization error:', error?.response?.data || error.message);
        return "Failed to generate a summary for this session."; // Fallback summary
    }
}


router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId, chatHistory } = req.body;

    try {
        const user = await User.findById(userId); // Fetch as full Mongoose document to handle user.save() for XP
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

        const formattedHistory = chatHistory.map(msg => ({
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
                specialXpAwarded = `? Congratulations! You leveled up to Level ${user.level}!`;
            }
            // Save XP and Level here
            await user.save();
            userLevel = user.level;
        }

        // --- Session Management & Summary Saving ---
        // Find the active session or create a new one
        // We'll consider the last conversation in the array as the current active session
        let currentSession = user.conversations.length > 0 ? user.conversations[user.conversations.length - 1] : null;

        // If no current session, or the last one was just a welcome message/summarized, create a new one
        if (!currentSession || currentSession.summary === "Initial Welcome Message" || currentSession.summary) {
            currentSession = {
                date: new Date(),
                messages: [],
                summary: null, // Will be filled later
                activeMinutes: 0 // Track active minutes per session
            };
            user.conversations.push(currentSession);
        }

        // Append current message and AI response to the session's messages
        currentSession.messages.push({ role: 'user', content: message });
        currentSession.messages.push({ role: 'assistant', content: aiResponseText });

        // Update active minutes for the current session (simple increment, could be timer-based)
        // For accurate tracking, client-side timers would be better, sending updates.
        // For now, let's just mark it as having some activity.
        currentSession.activeMinutes = (currentSession.activeMinutes || 0) + 1; // Simple increment for demonstration

        await user.save(); // Save user document with updated conversation

        // --- Generate and Save Summary for the Session (Asynchronously) ---
        // We will generate the summary when a session 'ends' (e.g., user logs out, or after X messages)
        // For simplicity, let's trigger summary generation for a session if it has, say, more than 5 turns (user+AI)
        // This should be done asynchronously to not block the current chat response.
        if (currentSession.messages.length > 5 && !currentSession.summary) { // If it's a substantive session and not yet summarized
            // Use currentSession.messages (which now includes user and AI turns)
            const sessionTranscriptForSummary = currentSession.messages;
            const studentProfileForSummary = studentProfileForPrompt; // Use the student's profile

            // Ensure the summary is only generated once per session that needs it
            // It's crucial to update the specific session object
            const sessionToUpdateIndex = user.conversations.length - 1; // Always the last session

            generateSessionSummary(sessionTranscriptForSummary, studentProfileForSummary)
                .then(generatedSummary => {
                    if (user.conversations[sessionToUpdateIndex]) {
                        user.conversations[sessionToUpdateIndex].summary = generatedSummary;
                        return user.save(); // Save user document again with the summary updated
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
        res.status(500).json({ message: "Failed to get response from AI. Please try again." });
    }
});

module.exports = router;