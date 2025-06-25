// routes/guidedLesson.js (add input validation)
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { generateSystemPrompt } = require('../utils/prompt');
const User = require('../models/user');
const { openai, retryWithExponentialBackoff } = require("../utils/openaiClient");

// Define a reasonable character limit for user input in lesson context
const MAX_LESSON_INPUT_LENGTH = 1500; // Slightly more generous as it's guided, but still limited

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
        const { lessonContext } = req.body;
        const { title, goals, miniLessonConcepts, instructionalStrategies, conversationHistory } = lessonContext;
        const userId = req.userProfile._id; // Correctly get userId from req.userProfile

        // Validate incoming user message (if any)
        const latestUserMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].content : '';
        if (latestUserMessage && latestUserMessage.length > MAX_LESSON_INPUT_LENGTH) {
            return res.status(400).json({ message: `Your input is too long for this lesson step. Max ${MAX_LESSON_INPUT_LENGTH} characters.` });
        }

        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        const systemPrompt = generateSystemPrompt(userProfile, tutorName);
        let messages = [];

        if (!conversationHistory || conversationHistory.length === 0) {
            const taskPrompt = `
### Your Task: The Socratic Lesson Opener ###
Your task is to start an interactive lesson on '${title}'.
1.  **Start with a Pre-Lesson Review:** Begin with a brief, confidence-building review of a prerequisite skill. Connect '${title}' to a concept the student likely already knows.
2.  **Introduce & Inquire:** After the review, introduce the new topic and immediately ask an engaging question to assess prior knowledge and start a dialogue.
Your response MUST combine both steps into a single, natural opening message that ends with a question.
**Reference Information:**
- Key Learning Goals: ${goals.join(', ')}
- Core Concepts to Weave In: ${miniLessonConcepts.join(', ')}
            `;
            messages.push({ role: 'system', content: systemPrompt + taskPrompt });
        } else {
            const taskPrompt = `
### Your Task: Continue the Lesson Dialogue ###
You are in the middle of a lesson on '${title}'. The conversation so far is provided in the history. Your task is to continue the dialogue naturally based on the student's last response.
- Use your Instructional Toolbox (Inquiry, Modeling, Direct Instruction, etc.) to adapt to the student.
- Keep your responses conversational and focused on building understanding.
- **Decision Point:** Once you feel the student has a foundational grasp of the concept from the dialogue, you MUST end your response with the special signal: **<END_LESSON_DIALOGUE />**. This tells the application to move on to the practice problems. Do not add this signal until you are confident the student is ready.
            `;
            messages.push({ role: 'system', content: systemPrompt + taskPrompt });
            // Correctly concatenate conversationHistory to messages
            messages = messages.concat(conversationHistory);
        }

        const completion = await retryWithExponentialBackoff(async () => {
            return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: messages,
                temperature: 0.7,
                max_tokens: 500 // Max tokens for lesson parts AI response
            });
        });

        const aiResponseText = completion.choices[0].message.content.trim();

        let lessonState = 'continue';
        let cleanMessage = aiResponseText;

        if (aiResponseText.includes('<END_LESSON_DIALOGUE />')) {
            lessonState = 'start_assessment';
            cleanMessage = aiResponseText.replace('<END_LESSON_DIALOGUE />', '').trim();
        }

        res.json({ aiMessage: cleanMessage, lessonState: lessonState });

    } catch (error) {
        console.error('Error in /generate-interactive-lesson:', error?.response?.data || error.message || error);
        res.status(500).json({ error: 'Failed to generate lesson. Please try again.' });
    }
});

router.post('/get-scaffolded-hint', async (req, res) => {
    try {
        const { hintContext } = req.body;
        const { problem, userAnswer, correctAnswer, strategies } = hintContext;
        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        // Validate user answer length for hints
        if (userAnswer && userAnswer.length > MAX_LESSON_INPUT_LENGTH) {
            return res.status(400).json({ message: `Your answer is too long. Max ${MAX_LESSON_INPUT_LENGTH} characters.` });
        }

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
        
        const aiHint = await retryWithExponentialBackoff(async () => {
            return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemPrompt + taskPrompt }],
                temperature: 0.7,
                max_tokens: 150 // Max tokens for a hint
            });
        });

        res.json({ hint: aiHint.choices[0].message.content.trim() });
    } catch (error) {
        console.error('Error in /get-scaffolded-hint:', error?.response?.data || error.message || error);
        res.status(500).json({ error: 'Failed to generate hint. Please try again.' });
    }
});

module.exports = router;