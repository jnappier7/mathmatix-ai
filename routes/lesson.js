// routes/lesson.js
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth'); // Assuming auth middleware
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Assuming Gemini is used for lessons
const { generateSystemPrompt } = require('../utils/prompt'); // For generating personalized prompts
const User = require('../models/user'); // [CHANGE] - Corrected User model path


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Assuming Gemini API Key is in .env
const lessonModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use a suitable model for lessons

// POST /lesson/generate-interactive-lesson
// This route generates the AI's initial mini-lesson or continues dialogue
router.post('/generate-interactive-lesson', isAuthenticated, async (req, res) => {
    const { lessonContext } = req.body; // Use lessonContext from the body
    const { title, goals, miniLessonConcepts, instructionalStrategies, conversationHistory } = lessonContext;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId).lean(); // Fetch user for personalized prompt
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const systemPrompt = generateSystemPrompt(user); // Personalized system prompt

        // Messages for Gemini API
        let messages = [
            { role: "user", parts: [{ text: systemPrompt }] }, // System prompt as the first user message
            // Then the context for the current lesson step
            { role: "user", parts: [{ text: `
                Generate a response for an interactive math lesson based on the following context.
                Lesson Title: ${title}
                Goals: ${goals.join(', ')}
                Mini-Lesson Concepts: ${miniLessonConcepts ? miniLessonConcepts.join(', ') : 'N/A'}
                Instructional Strategies: ${instructionalStrategies ? instructionalStrategies.join(', ') : 'N/A'}
                Your task is to either introduce a concept, explain a step, or guide through discovery.
            `}] }
        ];

        // Append conversation history if available
        if (conversationHistory && conversationHistory.length > 0) {
             // Convert structured history to Gemini's format if needed
            const formattedHistory = conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user', // Adjust roles for Gemini
                parts: [{ text: msg.content }]
            }));
            messages = messages.concat(formattedHistory);
        }

        // Add the specific instruction for this turn (what the AI should say)
        messages.push({ role: "user", parts: [{ text: "Now, provide the next part of the lesson or ask a guiding question. If the student has already learned enough for this sub-topic, indicate that it's time to 'start_assessment'." }] });


        const aiMessagePromise = lessonModel.generateContent({ contents: messages });

        const aiResponse = (await aiMessagePromise).response.text().trim();

        // Simulate AI decision to move to assessment (can be refined based on AI output or explicit instruction from AI)
        const lessonState = aiResponse.toLowerCase().includes("start_assessment") || aiResponse.toLowerCase().includes("practice problem") || aiResponse.toLowerCase().includes("test your understanding") ? 'start_assessment' : 'continue_dialogue';
        
        // Clean up the response if it contained the internal tag
        const cleanAiResponse = aiResponse.replace(/start_assessment/gi, '').trim();

        res.json({ aiMessage: cleanAiResponse, lessonState });

    } catch (error) {
        console.error("ERROR: Backend lesson generation failed:", error?.response?.data?.text || error.message || error);
        res.status(500).json({ message: "Failed to generate lesson content from AI.", error: error.message });
    }
});

// POST /lesson/get-scaffolded-hint
// This route provides dynamic hints for problems
router.post('/get-scaffolded-hint', isAuthenticated, async (req, res) => {
    const { hintContext } = req.body; // Context is now nested under hintContext
    const { problem, userAnswer, correctAnswer, strategies } = hintContext;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId).lean(); // Fetch user for personalized prompt
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const systemPrompt = generateSystemPrompt(user); // Personalized system prompt

        const hintPrompt = `
            ${systemPrompt}
            The student is working on the practice problem: [MATH]${problem}[/MATH]
            Their answer was: "${userAnswer}"
            The correct answer is: [MATH]${correctAnswer}[/MATH]
            Instructional strategies available: ${strategies.join(', ')}.
            Provide a concise, scaffolded hint. Do NOT give the answer. Guide the student to find their mistake or the next step.
            Consider their learning style and tone preference from their profile.
            Remember to use [MATH]...[/MATH] tags for math.
        `;

        const hintResponse = await lessonModel.generateContent({ contents: [{ role: "user", parts: [{ text: hintPrompt }] }] });
        const hintText = hintResponse.response.text().trim();

        res.json({ hint: hintText });

    } catch (error) {
        console.error("ERROR: Backend hint generation failed:", error?.response?.data?.text || error.message || error);
        res.status(500).json({ message: "Failed to generate hint from AI.", error: error.message });
    }
});

module.exports = router;// JavaScript Document