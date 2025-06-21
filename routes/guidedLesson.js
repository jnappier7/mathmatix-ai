// routes/guidedLesson.js - FINAL VERSION (PHASE 2)

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { generateSystemPrompt } = require('../utils/prompt');
const User = require('../models/user'); 
const { callYourLLMService } = require('../services/aiService'); 

router.use(isAuthenticated, async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        req.userProfile = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve user profile' });
    }
});

router.post('/generate-interactive-lesson', async (req, res) => {
    try {
        // Now accepts an optional conversationHistory
        const { title, goals, miniLessonConcepts, instructionalStrategies, conversationHistory } = req.body;
        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        const systemPrompt = generateSystemPrompt(userProfile, tutorName);
        let taskPrompt;
        let fullPrompt;

        if (!conversationHistory || conversationHistory.length === 0) {
            // This is the first turn: Create the lesson opener
            taskPrompt = `
### Your Task: The Socratic Lesson Opener ###
Your task is to start an interactive lesson on '${title}'.

1.  **Start with a Pre-Lesson Review:** Begin with a brief, confidence-building review of a prerequisite skill. Connect '${title}' to a concept the student likely already knows.
2.  **Introduce & Inquire:** After the review, introduce the new topic and immediately ask an engaging question to assess prior knowledge and start a dialogue.

Your response MUST combine both steps into a single, natural opening message that ends with a question.

**Reference Information:**
- Key Learning Goals: ${goals.join(', ')}
- Core Concepts to Weave In: ${miniLessonConcepts.join(', ')}
            `;
            // For the first turn, we only need the system prompt and the task.
            fullPrompt = systemPrompt + taskPrompt;
        } else {
            // This is a subsequent turn: Continue the dialogue
            taskPrompt = `
### Your Task: Continue the Lesson Dialogue ###
You are in the middle of a lesson on '${title}'. The conversation so far is provided in the history. Your task is to continue the dialogue naturally based on the student's last response.

- Use your Instructional Toolbox (Inquiry, Modeling, Direct Instruction, etc.) to adapt to the student.
- Keep your responses conversational and focused on building understanding.
- **Decision Point:** Once you feel the student has a foundational grasp of the concept from the dialogue, you MUST end your response with the special signal: **<END_LESSON_DIALOGUE />**. This tells the application to move on to the practice problems. Do not add this signal until you are confident the student is ready.
            `;
            // For subsequent turns, you'd structure the full prompt with history
            // Note: The structure depends on your LLM's API. This is a common format.
            const messages = [
                { role: 'system', content: systemPrompt + taskPrompt },
                ...conversationHistory // Unpack the history array
            ];
            // The call to your LLM service might need adjustment to handle an array of messages
            // For simplicity, we'll concatenate for this example, but a message array is best practice.
            fullPrompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        }

        const aiResponseText = await callYourLLMService(fullPrompt, req.user._id);

        let lessonState = 'continue';
        let cleanMessage = aiResponseText;

        // Check for the signal to transition to problems
        if (aiResponseText.includes('<END_LESSON_DIALOGUE />')) {
            lessonState = 'start_assessment';
            cleanMessage = aiResponseText.replace('<END_LESSON_DIALOGUE />', '').trim();
        }

        res.json({ aiMessage: cleanMessage, lessonState: lessonState });

    } catch (error) {
        console.error('Error in /generate-interactive-lesson:', error);
        res.status(500).json({ error: 'Failed to generate lesson. Please try again.' });
    }
});

// The hint endpoint does not need changes for Phase 2
router.post('/get-scaffolded-hint', async (req, res) => {
    try {
        const { problem, userAnswer, correctAnswer, strategies } = req.body;
        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        const systemPrompt = generateSystemPrompt(userProfile, tutorName);
        const taskPrompt = `
### Your Task: Provide a Guiding Hint ###
A student needs help with a problem. Use your adaptive teaching strategies to provide a supportive, guiding hint.

- The problem was: "${problem}"
- Their incorrect answer was: "${userAnswer}"
- The correct answer is: "${correctAnswer}"

**Your Instructions:**
1. Acknowledge their effort positively.
2. Gently guide them toward their mistake without explicitly stating it.
3. DO NOT give them the direct answer.
4. Use one of the following teaching strategies to inform your hint: ${strategies.join(', ')}
5. Craft a natural, conversational response that builds confidence.
        `;
        
        const fullPrompt = systemPrompt + taskPrompt;
        const aiHint = await callYourLLMService(fullPrompt, req.user._id);
        res.json({ hint: aiHint });
    } catch (error) {
        console.error('Error in /get-scaffolded-hint:', error);
        res.status(500).json({ error: 'Failed to generate hint. Please try again.' });
    }
});

module.exports = router;