// utils/activitySummarizer.js
// Generates AI summaries of student activity for teacher live feed

const { callLLM } = require('./llmGateway');
const { createAnonymizationContext } = require('./piiAnonymizer');
const { sanitizeSummary, describeAccuracy, MIN_PROBLEMS_FOR_ACCURACY } = require('./summaryText');

// Message content is not always a string: upload and vision turns carry an
// array of parts. Interpolating those directly is how "undefined" and
// "[object Object]" reached summaries a parent reads.
function messageText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const text = content
            .map(p => (p && typeof p.text === 'string' ? p.text : ''))
            .filter(Boolean)
            .join(' ');
        const hasImage = content.some(p => p && (p.type === 'image_url' || p.type === 'image'));
        return [text, hasImage ? '[image upload]' : ''].filter(Boolean).join(' ') || '[image upload]';
    }
    return content == null ? '' : '[attachment]';
}

// Transcript lines for a summary prompt. Roles are relabelled so the model
// reads a transcript ABOUT a tutor and a student, rather than "assistant:"
// lines it is tempted to continue in the first person.
function transcriptLines(messages) {
    return (messages || [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
        .map(m => `${m.role === 'assistant' ? 'Tutor' : 'Student'}: ${messageText(m.content)}`)
        .join('\n');
}

function firstNameOf(studentName) {
    return String(studentName || '').trim().split(/\s+/)[0] || '';
}

// Callers hand us "First Last" for the teacher-facing text. The provider
// gets [Student]: this context strips the name from the transcript we send
// (the tutor addresses the student by name every few turns) and the
// chokepoint restores it in the summary that comes back. The request these
// run under belongs to the teacher or is a session-end job, so the request
// scope does not know the student — this has to be explicit.
function contextForStudentName(studentName) {
    const [firstName, ...rest] = String(studentName || '').trim().split(/\s+/);
    return createAnonymizationContext({ firstName: firstName || '', lastName: rest.join(' ') });
}

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

        // Build stats section only if we have actual tracked data
        const statsSection = problemsAttempted > 0
            ? `- Problems attempted: ${problemsAttempted}\n- Problems correct: ${problemsCorrect} (${accuracy}% accuracy)`
            : '- Problem statistics not yet tracked for this session';

        // Create a prompt for the summarizer with accurate stats
        const summaryPrompt = `You are analyzing a math tutoring session for a teacher dashboard. Generate a CONCISE summary (max 2 sentences) focusing on:
- Current topic/concept
${problemsAttempted > 0 ? '- Progress indicators (use the exact stats provided)' : '- What the student is working on'}
- Struggle points if any

Session Stats:
- Topic: ${topic}
${statsSection}
${strugglingWith ? `- Currently struggling with: ${strugglingWith}` : ''}

Recent conversation:
${transcriptLines(recentMessages)}

Format: "[Student] is working on [topic]. [Progress/struggle summary]"
${problemsAttempted > 0 ? 'Example: "Sarah is solving linear equations (2x+3=7). Completed 3/5 problems correctly, struggling with negative coefficients."' : 'Example: "Sarah is exploring linear equations, working through examples of solving for x."'}
${problemsAttempted === 0 ? 'IMPORTANT: Do NOT mention "0 problems" or "0% accuracy". Focus on topics and learning activities instead.' : ''}
Summary:`;

        const response = await callLLM('gpt-4o-mini', [
            { role: 'system', content: 'You are a helpful assistant that creates concise, privacy-safe summaries of tutoring sessions for teachers.' },
            { role: 'user', content: summaryPrompt }
        ], {
            temperature: 0.3,
            max_tokens: 100,
            anonContext: contextForStudentName(studentName)
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
    const recentText = (messages || []).slice(-5).map(m => messageText(m && m.content)).join(' ').toLowerCase();

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

    // Score every topic by how often it shows up and take the strongest. First
    // match used to win, and 'linear equation' sits early with /solve.*equation/
    // — which matches nearly any equation — so an exponent review
    // ("4^(x+1) = 32 … 2^(2x+2) … 2^5") was summarized as "linear equation"
    // (student audit, 2026-10-15). Ties keep the list's order.
    let best = null;
    for (const [topic, regex] of Object.entries(topics)) {
        const hits = (recentText.match(new RegExp(regex.source, 'gi')) || []).length;
        if (hits > 0 && (!best || hits > best.hits)) best = { topic, hits };
    }
    return best ? best.topic : 'mathematics';
}

/**
 * Calculate problem accuracy from messages
 * Uses structured problemResult field when available, falls back to keyword detection
 */
function calculateProblemStats(messages) {
    const aiMessages = messages.filter(m => m.role === 'assistant');

    let attempted = 0;
    let correct = 0;
    // Count only messages carrying a structured `problemResult` tag written by the
    // grading pipeline. A prior keyword-detection fallback (removed) scanned the
    // tutor's coaching text and counted supportive phrasing — "let's take a look",
    // "almost", "not quite" — as incorrect attempts, fabricating problems that were
    // never answered, inflating the denominator, and depressing accuracy. When a
    // conversation has no structured grades, report zero rather than guess.
    aiMessages.forEach(msg => {
        if (msg.problemResult) {
            attempted++;
            if (msg.problemResult === 'correct') {
                correct++;
            }
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
        const messages = conversation.messages || [];

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

        const minutes = Number(conversation.activeMinutes) > 0 ? Math.round(Number(conversation.activeMinutes)) : 0;
        const firstName = firstNameOf(studentName);
        const anonContext = contextForStudentName(studentName);

        // Build problem stats section only when we have actual tracked data.
        // When problemsAttempted is 0, it likely means tracking didn't fire
        // rather than the student truly attempting 0 problems. Omit to avoid
        // false reports. Under MIN_PROBLEMS_FOR_ACCURACY the count is given
        // without a percentage: "100%" for one problem reads as a verdict.
        const accuracyText = describeAccuracy(stats.correct, stats.attempted);
        const problemStatsSection = stats.attempted > 0
            ? `- Problems: ${accuracyText}`
            : '- Problem statistics were not tracked for this session';

        // Read by parents as well as teachers, so neutral and third person.
        // The model is handed a transcript the TUTOR wrote in the first
        // person; without the explicit rule it summarised as the tutor
        // ("the student and I worked on…").
        const summaryPrompt = `Summarize this math tutoring session in 2-3 sentences for the student's parent or teacher. Focus on:
- Main topic covered
${stats.attempted > 0 ? '- How the student did on the problems they attempted' : '- What the student worked on and discussed'}
- Any concepts the student mastered or struggled with

Session details:
- Student: [Student]
- Topic: ${topic}
${problemStatsSection}
${minutes > 0 ? `- Duration: ${minutes} minute${minutes === 1 ? '' : 's'}` : ''}
${conversation.strugglingWith ? `- Struggled with: ${conversation.strugglingWith}` : ''}

Recent conversation (last 15 messages):
${transcriptLines(messages.slice(-15))}

WRITING RULES:
- Write in third person about the student. Never write as the tutor (no I, we, our, us, me).
- Refer to the student by the placeholder exactly as given: [Student]. Do not write "the student".
- Write math in plain text a parent can read (5x - 7 = 13, 3/4, x^2), not LaTeX.
${stats.attempted === 0 ? '- Do NOT mention "0 problems attempted" or "0% accuracy". Problem tracking data is unavailable for this session. Focus on topics discussed and learning activities instead.' : ''}
${stats.attempted > 0 && stats.attempted < MIN_PROBLEMS_FOR_ACCURACY ? `- Only ${stats.attempted} problem${stats.attempted === 1 ? ' was' : 's were'} attempted: give the count, never a percentage, and do not call the result "perfect".` : ''}
Summary:`;

        const fallbackSummary = [
            `${firstName || 'The student'} worked on ${topic}${minutes > 0 ? ` for ${minutes} minute${minutes === 1 ? '' : 's'}` : ''}.`,
            stats.attempted > 0 ? `They ${accuracyText}.` : ''
        ].filter(Boolean).join(' ');

        const response = await callLLM('gpt-4o-mini', [
            { role: 'system', content: 'You write short, factual, third-person summaries of math tutoring sessions for a student\'s parent or teacher.' },
            { role: 'user', content: summaryPrompt }
        ], {
            temperature: 0.3,
            max_tokens: 150,
            anonContext
        });

        // callLLM rehydrates [Student] when outbound PII stripping is on;
        // doing it here too keeps the name right when it is switched off.
        const raw = anonContext.rehydrate(response.choices[0]?.message?.content?.trim() || '');
        return sanitizeSummary(raw, { name: firstName, fallback: fallbackSummary });
    } catch (error) {
        console.error('Error generating session summary:', error);
        const m = Number(conversation && conversation.activeMinutes) || 0;
        return `Session completed - ${m} minute${m === 1 ? '' : 's'} of active learning`;
    }
}

/**
 * Generate a student-facing session recap.
 * Psychology: Progress Principle + Growth Mindset + Peak-End Rule
 *
 * Shows growth deltas, not just absolutes:
 * - "You solved 6 problems and improved your fraction skills"
 * - "You pushed through a tough stretch — that persistence is real growth"
 *
 * @param {Object} conversation - Mongoose conversation document
 * @param {Object} user - Mongoose user document
 * @returns {Object} Structured recap for frontend display
 */
async function generateStudentRecap(conversation, user) {
    try {
        const stats = {
            attempted: conversation.problemsAttempted || 0,
            correct: conversation.problemsCorrect || 0,
        };
        const accuracy = stats.attempted > 0
            ? Math.round((stats.correct / stats.attempted) * 100) : null;
        const topic = conversation.currentTopic || detectTopic(conversation.messages || []);
        const minutes = conversation.activeMinutes || Math.round((conversation.activeSeconds || 0) / 60);
        const mood = conversation.sessionMood || {};

        // Build recap object (frontend renders this)
        const recap = {
            topic: topic || 'Math practice',
            duration: minutes,
            problemsAttempted: stats.attempted,
            problemsCorrect: stats.correct,
            accuracy,
            // Growth-focused headline (not "You got X right" but "You grew")
            headline: null,
            // Specific achievement callout
            achievement: null,
            // Emotional arc narrative
            narrative: null,
        };

        // ── Growth headline ──
        if (stats.attempted === 0) {
            recap.headline = `${minutes} minutes exploring ${topic}`;
        } else if (accuracy !== null && accuracy >= 80) {
            recap.headline = `${stats.correct} problems solved — strong session!`;
        } else if (stats.attempted >= 5) {
            recap.headline = `${stats.attempted} problems tackled — you put in the work`;
        } else {
            recap.headline = `Worked on ${topic} for ${minutes} minutes`;
        }

        // ── Achievement callout (growth-focused) ──
        if (mood.trajectory === 'recovered') {
            recap.achievement = 'You pushed through a tough stretch and came back strong. That resilience is how real learning happens.';
        } else if (mood.inFlow) {
            recap.achievement = 'You hit a flow state today — multiple correct answers in a row. That focus is paying off.';
        } else if (mood.emotionalState === 'recovery') {
            recap.achievement = 'You broke through something that was blocking you. That moment is growth in action.';
        } else if (stats.correct >= 3 && accuracy >= 70) {
            recap.achievement = `You tackled ${stats.attempted} problems and got ${stats.correct} right. Your approach is working.`;
        } else if (stats.attempted >= 3) {
            recap.achievement = `${stats.attempted} problems attempted — every one builds your understanding, even the tough ones.`;
        }

        // ── Narrative (emotional arc) ──
        if (mood.trajectory === 'rising') {
            recap.narrative = 'You built momentum as the session went on — you were stronger at the end than the start.';
        } else if (mood.trajectory === 'recovered') {
            recap.narrative = 'It was a rough start, but you turned it around. That matters more than getting everything right on the first try.';
        } else if (mood.fatigueSignal) {
            recap.narrative = 'You put in solid effort. Taking breaks when you need them is part of learning smart.';
        } else if (mood.trajectory === 'stable' && accuracy >= 60) {
            recap.narrative = 'Consistent session — you stayed focused and worked through problems steadily.';
        }

        return recap;
    } catch (error) {
        console.error('Error generating student recap:', error);
        return {
            topic: 'Math practice',
            duration: 0,
            problemsAttempted: 0,
            problemsCorrect: 0,
            accuracy: null,
            headline: 'Session complete — nice work!',
            achievement: null,
            narrative: null,
        };
    }
}

module.exports = {
    generateLiveSummary,
    detectStruggle,
    detectTopic,
    calculateProblemStats,
    generateSessionSummary,
    generateStudentRecap,
    transcriptLines,
    messageText
};
