// NEW FILE: utils/summaryService.js
// Centralizes the logic for generating a conversation summary.

const { callLLM, anthropic, retryWithExponentialBackoff } = require('./openaiClient');

const SUMMARY_MODEL = "gpt-5-nano"; // Ultra-cheap, fast model for summaries (80% cost savings!)

async function generateSummary(messageLog, studentProfile) {
    if (!messageLog || !Array.isArray(messageLog) || messageLog.length === 0) {
        throw new Error("A message log is required to generate a summary.");
    }
    if (!studentProfile) {
        throw new Error("A student profile is required to generate a summary.");
    }

    const formattedHistory = messageLog
        .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }))
        .filter(msg => msg.role !== 'system');

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

    if (!anthropic) {
        throw new Error("Anthropic client is not initialized for summarization. Check ANTHROPIC_API_KEY.");
    }

    try {
        const completion = await retryWithExponentialBackoff(() =>
            anthropic.messages.create({
                model: SUMMARY_MODEL,
                max_tokens: 500,
                system: summarizationPromptContent,
                messages: formattedHistory
            })
        );
        return completion.content[0]?.text?.trim() || "No summary was generated.";
    } catch (error) {
        console.error("ERROR in generateSummary:", error);
        throw error; // Re-throw to be handled by the caller
    }
}

module.exports = { generateSummary };