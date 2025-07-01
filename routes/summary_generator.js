// routes/summary_generator.js - UPDATED: Use centralized LLM call, Claude-3 Haiku for summary

const express = require('express');
const router = express.Router();
const { callLLM } = require('../utils/openaiClient'); // Import centralized LLM call

// Define model for summarization
const SUMMARY_MODEL = "claude-3-haiku-20240307"; // Specific Claude model for summarization

// POST /api/summary (renamed from /api/generate-summary for consistency)
router.post('/', async (req, res) => {
    const { messageLog, studentProfile } = req.body;

    if (!messageLog || !Array.isArray(messageLog) || messageLog.length === 0) {
        return res.status(400).json({ message: "messageLog is required and must be a non-empty array." });
    }
    if (!studentProfile) {
        return res.status(400).json({ message: "studentProfile is required." });
    }

    // Prepare messages for the LLM
    // Claude expects 'user' and 'assistant' roles, and system message as a separate parameter
    const formattedHistory = messageLog.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant', // Map to Claude's roles
        content: msg.content
    }));

    // Construct the prompt for the LLM
    const summarizationPromptContent = `
    You are an AI assistant tasked with summarizing a tutoring session for a teacher.
    Your goal is to provide a concise, actionable summary of the student's progress and the session's focus, along with suggestions for next steps.

    --- Student Profile ---
    Name: ${studentProfile.firstName} ${studentProfile.lastName}
    Username: ${studentProfile.username}
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

    Format your response clearly with a "Summary:" section and a "Next Steps:" section.
    `;

    try {
        const completion = await callLLM(SUMMARY_MODEL, formattedHistory, {
            system: summarizationPromptContent, // System prompt as a dedicated parameter for Claude
            max_tokens: 500 // Increased max tokens for summary to give Claude more room
        });

        const summaryText = completion.choices[0]?.message?.content?.trim() || "No summary generated.";
        res.json({ summary: summaryText });

    } catch (error) {
        console.error('ERROR: AI summarization error:', error?.message || error);
        res.status(500).json({ message: 'Failed to generate summary.', error: error.message });
    }
});

module.exports = router;