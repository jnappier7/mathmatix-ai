// NEW FILE: utils/summaryService.js
// Centralizes the logic for generating a conversation summary.

const { callLLM } = require('./llmGateway');
const { createAnonymizationContext } = require('./piiAnonymizer');

const SUMMARY_MODEL = "gpt-4o-mini"; // Fast, cost-effective model for summaries

// The teacher reads this summary, so it may name the student — but the
// provider does not need to. The profile block below labels the student
// [Student] and the chokepoint puts the first name back in the reply. The
// username and last name were sent for no reason at all; IEP goals go out as
// a count, since the transcript already shows what was worked on and the
// teacher has the plan.

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

    const activeIepGoals = Array.isArray(studentProfile.iepPlan?.goals)
        ? studentProfile.iepPlan.goals.filter(g => !g.status || g.status === 'active').length
        : 0;
    const anonContext = createAnonymizationContext(studentProfile);

    const summarizationPromptContent = `
    You are an AI assistant tasked with summarizing a tutoring session for a teacher.
    Your goal is to provide a concise, actionable summary of the student's progress and the session's focus, along with suggestions for next steps.

    --- Student Profile ---
    Name: [Student]
    Grade Level: ${studentProfile.gradeLevel}
    Math Course: ${studentProfile.mathCourse || 'N/A'}
    Learning Style: ${studentProfile.learningStyle}
    Tone Preference: ${studentProfile.tonePreference}
    ${activeIepGoals > 0 ? `IEP: ${activeIepGoals} active goal${activeIepGoals === 1 ? '' : 's'} on file (refer to them generically; the teacher has the plan)` : ''}
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
        const completion = await callLLM(SUMMARY_MODEL, [
            { role: 'system', content: summarizationPromptContent },
            ...formattedHistory
        ], {
            temperature: 0.3,
            max_tokens: 500,
            // The request is the teacher's; the student is who must be hidden.
            anonContext
        });

        return completion.choices[0]?.message?.content?.trim() || "No summary was generated.";
    } catch (error) {
        console.error("ERROR in generateSummary:", error);
        throw error; // Re-throw to be handled by the caller
    }
}

module.exports = { generateSummary };