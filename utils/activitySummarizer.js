// utils/activitySummarizer.js
// Generates AI summaries of student activity for teacher live feed

const { callLLM } = require('./llmGateway');

/**
 * Generate a concise live summary of student activity
 * Privacy-safe: focuses on topics, progress, struggles - not full conversation
 * Uses accurate stats from conversation record when available
 */
async function generateLiveSummary(conversation, studentName) {
    try {
        // Get recent messages (last 10 or so)
        const recentMessages = conversation.messages.slice(-10);

        if (recentMessages.length < 2) {
            return `${studentName} just started a session`;
        }

        // IMPROVED: Use stored stats from conversation record (more accurate)
        const problemsAttempted = conversation.problemsAttempted || 0;
        const problemsCorrect = conversation.problemsCorrect || 0;
        const topic = conversation.currentTopic || detectTopic(recentMessages);
        const strugglingWith = conversation.strugglingWith;

        // Calculate accuracy
        const accuracy = problemsAttempted > 0 ?
            Math.round((problemsCorrect / problemsAttempted) * 100) : 0;

        // Create a prompt for the summarizer with accurate stats
        const summaryPrompt = `You are analyzing a math tutoring session for a teacher dashboard. Generate a CONCISE summary (max 2 sentences) focusing on:
- Current topic/concept
- Progress indicators (use the exact stats provided)
- Struggle points if any

Session Stats:
- Topic: ${topic}
- Problems attempted: ${problemsAttempted}
- Problems correct: ${problemsCorrect} (${accuracy}% accuracy)
${strugglingWith ? `- Currently struggling with: ${strugglingWith}` : ''}

Recent conversation:
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

Format: "[Student] is working on [topic]. [Progress/struggle summary]"
Example: "Sarah is solving linear equations (2x+3=7). Completed 3/5 problems correctly, struggling with negative coefficients."

Summary:`;

        const response = await callLLM('gpt-4o-mini', [
            { role: 'system', content: 'You are a helpful assistant that creates concise, privacy-safe summaries of tutoring sessions for teachers.' },
            { role: 'user', content: summaryPrompt }
        ], {
            temperature: 0.3,
            max_tokens: 100
        });

        const summary = response.choices[0]?.message?.content?.trim() || `${studentName} is in an active session`;

        return summary.replace('[Student]', studentName);
    } catch (error) {
        console.error('Error generating live summary:', error);
        return `${studentName} is in an active session`;
    }
}

/**
 * Detect if student is struggling based on recent messages
 */
function detectStruggle(recentMessages) {
    if (recentMessages.length < 4) return { isStruggling: false };

    // Look for patterns indicating struggle
    const userMessages = recentMessages.filter(m => m.role === 'user');
    const aiMessages = recentMessages.filter(m => m.role === 'assistant');

    // Struggle indicators:
    // - Repeated questions about same topic
    // - "I don't understand" phrases
    // - AI providing multiple hints/explanations

    const struggleKeywords = [
        "don't understand", "confused", "help", "stuck", "i don't get",
        "what does", "how do i", "why", "can you explain again"
    ];

    const recentUserText = userMessages.slice(-3)
        .filter(m => m.content && typeof m.content === 'string')
        .map(m => m.content.toLowerCase())
        .join(' ');
    const hasStruggleKeywords = struggleKeywords.some(kw => recentUserText.includes(kw));

    // Check for repeated AI explanations (indicates struggle)
    const aiExplanationCount = aiMessages.slice(-3).filter(m =>
        m.content && typeof m.content === 'string' && (
            m.content.toLowerCase().includes('let me explain') ||
            m.content.toLowerCase().includes('another way') ||
            m.content.toLowerCase().includes('try again')
        )
    ).length;

    const isStruggling = hasStruggleKeywords || aiExplanationCount >= 2;

    if (isStruggling) {
        // Try to identify what they're struggling with
        const topicMatch = recentUserText.match(/(fraction|equation|variable|algebra|geometry|multiplication|division|negative number|exponent)/i);
        const strugglingWith = topicMatch ? topicMatch[1] : 'current concept';

        return {
            isStruggling: true,
            strugglingWith,
            severity: aiExplanationCount >= 2 ? 'high' : 'medium'
        };
    }

    return { isStruggling: false };
}

/**
 * Detect current topic from conversation
 */
function detectTopic(messages) {
    const recentText = messages.slice(-5).map(m => m.content).join(' ').toLowerCase();

    const topics = {
        'calculus': /calculus|derivative|integral|limit|differenti|antiderivative|d\/dx/i,
        'pre-calculus': /precalculus|pre-calculus|trigonometr|logarithm|exponential function/i,
        'linear equation': /linear\s+equation|solve.*equation|2x\s*\+|isolat.*variable/i,
        'quadratic equation': /quadratic|parabola|x\^2|ax²|factoring|completing the square/i,
        'fractions': /fraction|numerator|denominator|\/|½|⅓|¼/i,
        'algebra': /algebra|variable|expression|simplif/i,
        'geometry': /geometry|triangle|circle|angle|perimeter|area/i,
        'exponents': /exponent|power|square|cube|\^/i,
        'ratios': /ratio|proportion|rate/i,
        'percentage': /percent|%/i,
        'graphing': /graph|coordinate|plot|x-axis|y-axis/i,
        'statistics': /statistic|mean|median|mode|standard deviation|probability/i,
        'polynomials': /polynomial|monomial|binomial|trinomial|degree/i,
    };

    for (const [topic, regex] of Object.entries(topics)) {
        if (regex.test(recentText)) {
            return topic;
        }
    }

    return 'mathematics';
}

/**
 * Calculate problem accuracy from messages
 * Uses structured problemResult field when available, falls back to keyword detection
 */
function calculateProblemStats(messages) {
    const aiMessages = messages.filter(m => m.role === 'assistant');

    let attempted = 0;
    let correct = 0;
    let hasStructuredData = false;

    // First pass: count messages with structured problemResult field
    aiMessages.forEach(msg => {
        if (msg.problemResult) {
            hasStructuredData = true;
            attempted++;
            if (msg.problemResult === 'correct') {
                correct++;
            }
        }
    });

    // If we found structured data, use those counts
    if (hasStructuredData) {
        return { attempted, correct };
    }

    // FALLBACK: Use keyword detection for older conversations without structured data
    // This is less accurate but maintains backward compatibility
    aiMessages.forEach(msg => {
        if (!msg.content || typeof msg.content !== 'string') return;
        const content = msg.content.toLowerCase();

        // More specific patterns to reduce false positives
        const correctPatterns = [
            /\bthat['']?s (exactly )?right\b/,
            /\bcorrect[!.]/,
            /\bgreat job[!.]/,
            /\bperfect[!.]/,
            /\bwell done[!.]/,
            /\bexactly[!.]/,
            /\bnice work[!.]/
        ];

        const incorrectPatterns = [
            /\bnot quite\b/,
            /\btry again\b/,
            /\balmost\b/,
            /\bincorrect\b/,
            /\bnot exactly\b/,
            /\blet['']?s (try|look|think)/
        ];

        const isCorrect = correctPatterns.some(pattern => pattern.test(content));
        const isIncorrect = incorrectPatterns.some(pattern => pattern.test(content));

        if (isCorrect && !isIncorrect) {
            attempted++;
            correct++;
        } else if (isIncorrect && !isCorrect) {
            attempted++;
        }
    });

    return { attempted, correct };
}

/**
 * Generate final session summary (when session ends)
 * Uses accurate stats from conversation record when available
 */
async function generateSessionSummary(conversation, studentName) {
    try {
        const messages = conversation.messages;

        // IMPROVED: Use stored stats from conversation record first (more accurate)
        // Fall back to calculateProblemStats only if stored stats are missing
        let stats;
        if (conversation.problemsAttempted !== undefined && conversation.problemsAttempted > 0) {
            // Use accurate incremental stats from the conversation record
            stats = {
                attempted: conversation.problemsAttempted,
                correct: conversation.problemsCorrect || 0
            };
        } else {
            // Fallback to calculating from messages (for older conversations)
            stats = calculateProblemStats(messages);
        }

        const topic = conversation.currentTopic || detectTopic(messages);

        // Check if this is an assessment session with results
        if (conversation.isAssessment && conversation.assessmentResults) {
            const results = conversation.assessmentResults;

            // Create structured assessment summary
            const assessmentSummary = `${studentName} completed a placement assessment. Results:
- Estimated Grade Level: ${results.estimatedGrade || 'Not determined'}
- Skill Level: ${results.skillLevel || 'Not scored'}/100
- Questions: ${results.correctCount || stats.correct}/${results.totalQuestions || stats.attempted} correct
- Strengths: ${results.strengths?.join(', ') || 'None identified'}
- Weaknesses: ${results.weaknesses?.join(', ') || 'None identified'}
- Recommended Starting Point: ${results.recommendedStartingPoint || 'To be determined'}`;

            return assessmentSummary;
        }

        // Calculate accuracy for the summary
        const accuracy = stats.attempted > 0 ?
            Math.round((stats.correct / stats.attempted) * 100) : 0;

        // Regular session summary for non-assessment sessions
        const summaryPrompt = `Summarize this math tutoring session in 2-3 sentences for a teacher. Focus on:
- Main topic covered
- Number of problems attempted and success rate
- Any concepts the student mastered or struggled with

Session details:
- Student: ${studentName}
- Topic: ${topic}
- Problems attempted: ${stats.attempted}
- Problems correct: ${stats.correct} (${accuracy}% accuracy)
- Duration: ${conversation.activeMinutes} minutes
${conversation.strugglingWith ? `- Struggled with: ${conversation.strugglingWith}` : ''}

Recent conversation (last 15 messages):
${messages.slice(-15).map(m => `${m.role}: ${m.content}`).join('\n')}

Generate a concise teacher summary:`;

        const response = await callLLM('gpt-4o-mini', [
            { role: 'system', content: 'You are creating session summaries for teachers to review student progress.' },
            { role: 'user', content: summaryPrompt }
        ], {
            temperature: 0.3,
            max_tokens: 150
        });

        return response.choices[0]?.message?.content?.trim() ||
            `${studentName} worked on ${topic} for ${conversation.activeMinutes} minutes. Attempted ${stats.attempted} problems with ${stats.correct} correct (${accuracy}% accuracy).`;
    } catch (error) {
        console.error('Error generating session summary:', error);
        return `Session completed - ${conversation.activeMinutes} minutes of active learning`;
    }
}

module.exports = {
    generateLiveSummary,
    detectStruggle,
    detectTopic,
    calculateProblemStats,
    generateSessionSummary
};
