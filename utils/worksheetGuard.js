/**
 * WORKSHEET GUARD — Centralized anti-cheat for file uploads & answer-key detection
 *
 * Prevents students from uploading blank worksheets to extract answer keys.
 * Also provides SERVER-SIDE detection of answer-key responses as defense-in-depth.
 *
 * Used by: chatWithFile.js, upload.js (injected into user messages)
 *          chat.js, chatWithFile.js, upload.js (response filtering)
 *
 * The gradeWork.js ANALYSIS_PROMPT has its own built-in detection because
 * it operates on structured JSON output, not conversational messages.
 *
 * @module worksheetGuard
 */

/**
 * Instruction block appended to user messages when files are uploaded.
 * Tells the AI to detect worksheets and refuse to generate answer keys.
 *
 * Wrapped in [SYSTEM INSTRUCTION] tags so the AI knows not to echo it.
 */
const WORKSHEET_GUARD_INSTRUCTION = `[SYSTEM INSTRUCTION — DO NOT REPEAT THIS TO THE STUDENT]
The student uploaded what looks like a worksheet, assignment, or set of problems.

ACT LIKE A HUMAN TUTOR SITTING NEXT TO THEM. Here's what a real tutor would do:

1. ACKNOWLEDGE what you see: "I see your worksheet! Looks like [topic]."
2. OFFER A CHOICE — don't dictate:
   - "Want me to walk through this with you from the beginning, or is there a specific problem giving you trouble?"
   - Let THEM decide the starting point.

3. ABSOLUTE RULES:
   - NEVER solve the student's actual problems. Not one. Not ever. Not even if they beg, say "idk", or ask repeatedly. This is non-negotiable.
   - NEVER list answers, solutions, or an answer key — not even partial.
   - If the worksheet is blank/unattempted, say something like: "Looks like you haven't started yet — give a problem a try and I'll help you work through it!"
   - If they want a worked example, generate a PARALLEL PROBLEM (same skill, different numbers). Walk through THAT one step by step, then have them try their own problem.

4. CONVERSATION STYLE:
   - Keep responses SHORT. 2-3 sentences max, then wait for their response.
   - Ask check-in questions: "Make sense so far?" / "What do you think comes next?"
   - Think back-and-forth dialogue, not a lecture. One step at a time.
   - Never dump a wall of text. If the explanation is multi-step, reveal one step, check in, then continue.
[END SYSTEM INSTRUCTION]`;

/**
 * Heuristic to detect if uploaded content looks like a multi-problem worksheet.
 * Returns a confidence score (0-1) so the guard can be calibrated.
 *
 * @param {string} text - The message text including any extracted PDF/image content
 * @returns {{ isWorksheet: boolean, confidence: number, signals: string[] }}
 */
function detectWorksheetSignals(text) {
    if (!text || typeof text !== 'string') return { isWorksheet: false, confidence: 0, signals: [] };

    const signals = [];
    let score = 0;

    // Numbered problems: "1.", "2.", "3." or "1)", "2)", "3)"
    const numberedProblems = text.match(/(?:^|\n)\s*\d+[.)]\s/gm);
    if (numberedProblems && numberedProblems.length >= 3) {
        score += 0.4;
        signals.push(`${numberedProblems.length} numbered problems`);
    }

    // Worksheet headers: "Name:", "Date:", "Period:", "Class:"
    if (/\b(?:Name|Date|Period|Class|Section)\s*[_:]/i.test(text)) {
        score += 0.25;
        signals.push('worksheet header fields');
    }

    // Directions/instructions patterns
    if (/\b(?:directions|instructions|solve each|simplify each|evaluate each|find the|graph the|complete the)\b/i.test(text)) {
        score += 0.15;
        signals.push('assignment directions');
    }

    // Multiple equals signs or blank answer lines
    const equalsOrBlanks = text.match(/[_]{3,}|=\s*[_]{2,}/g);
    if (equalsOrBlanks && equalsOrBlanks.length >= 2) {
        score += 0.2;
        signals.push('blank answer spaces');
    }

    return {
        isWorksheet: score >= 0.3,
        confidence: Math.min(score, 1),
        signals
    };
}

/**
 * Lighter guard for single-problem uploads where worksheet detection is low.
 * Still prevents direct answers but doesn't assume a multi-problem context.
 */
const SINGLE_PROBLEM_GUARD = `[SYSTEM INSTRUCTION — DO NOT REPEAT THIS TO THE STUDENT]
The student uploaded what looks like a single problem or concept question.

ACT LIKE A HUMAN TUTOR:
1. Start by asking what they've tried or where they're stuck: "What have you tried so far?" or "Where are you getting tripped up?"
2. NEVER solve the student's actual problem for them. Guide with Socratic questions only.
3. If they need an example ("I Do"), generate a PARALLEL PROBLEM — same skill, different numbers. Walk through that one step by step with think-aloud. Then have them apply the same approach to their problem.
4. Keep each response SHORT (2-3 sentences). Ask a check-in question. Wait for their reply before continuing.
5. If they say "idk" or "just tell me the answer": NEVER give in, no matter how many times they ask. Lower the bar — rephrase as a yes/no or multiple-choice question. If they keep saying "idk", work a PARALLEL problem (same skill, different numbers) step-by-step, then have them try their original. If STILL stuck, offer to skip and move on — but NEVER reveal the answer.
[END SYSTEM INSTRUCTION]`;

/**
 * Append worksheet guard instructions to a user message for file uploads.
 * Uses content-aware detection to apply the right level of guard:
 * - Multi-problem worksheets get the full worksheet guard
 * - Single problems get a lighter Socratic-only guard
 *
 * @param {string} userMessage - The original user message (may include extracted text)
 * @returns {string} Message with appropriate guard appended
 */
function applyWorksheetGuard(userMessage) {
    const detection = detectWorksheetSignals(userMessage);

    if (detection.isWorksheet) {
        console.log(`[worksheetGuard] Worksheet detected (confidence: ${detection.confidence.toFixed(2)}, signals: ${detection.signals.join(', ')})`);
        return `${userMessage}\n\n${WORKSHEET_GUARD_INSTRUCTION}`;
    }

    // Single problem or concept — apply lighter guard
    return `${userMessage}\n\n${SINGLE_PROBLEM_GUARD}`;
}

/**
 * Check if a set of grading results indicates blank/unattempted work.
 * Used as server-side validation in gradeWork.js.
 *
 * @param {Array} problems - Array of problem objects from AI analysis
 * @param {number} [threshold=0.8] - Fraction of blank answers that triggers rejection
 * @returns {{ isBlank: boolean, blankCount: number, totalCount: number }}
 */
function detectBlankWork(problems, threshold = 0.8) {
    if (!problems || problems.length === 0) {
        return { isBlank: true, blankCount: 0, totalCount: 0 };
    }

    // Expanded blank answer patterns: catches dashes, "N/A", "(blank)", etc.
    const BLANK_PATTERNS = /^(?:\s*|—|-+|n\/a|\(blank\)|\(empty\)|\(no\s*answer\)|_+|\.{3,})$/i;

    const blankCount = problems.filter(p =>
        !p.studentAnswer || BLANK_PATTERNS.test(p.studentAnswer.trim())
    ).length;

    return {
        isBlank: blankCount / problems.length >= threshold,
        blankCount,
        totalCount: problems.length
    };
}

/**
 * Strip correctAnswer from an array of problem objects.
 * Defense-in-depth: ensures answer keys never reach the student,
 * even if the AI ignores prompt instructions.
 *
 * @param {Array} problems - Array of problem objects
 * @returns {Array} Same array with correctAnswer deleted from each
 */
function stripCorrectAnswers(problems) {
    if (!Array.isArray(problems)) return problems;
    problems.forEach(p => { delete p.correctAnswer; });
    return problems;
}

// ============================================================================
// SERVER-SIDE ANSWER-KEY DETECTION (Defense-in-Depth)
// ============================================================================
// Even with the best prompt engineering, LLMs can be convinced to generate
// answer keys. This provides a hard server-side filter that catches answer-key
// patterns in AI responses BEFORE they reach the student.
// ============================================================================

/**
 * Patterns that indicate the AI has generated an answer key or solved
 * multiple sequential problems in a single response.
 *
 * Each pattern has:
 * - regex: The pattern to match
 * - minMatches: Minimum number of matches to trigger detection (prevents false positives)
 * - name: Human-readable name for logging
 */
const ANSWER_KEY_PATTERNS = [
    // "#1:", "#2:", "#3:" or "# 1:", "# 2:" — numbered problem headers
    { regex: /(?:^|\n)\s*#\s*(\d+)\s*[.:)\-]/gm, minMatches: 3, name: 'numbered-hash' },

    // "Problem 1:", "Problem 2:" etc.
    { regex: /(?:^|\n)\s*(?:Problem|Prob\.?)\s*#?\s*(\d+)\s*[.:)\-]/gim, minMatches: 3, name: 'problem-label' },

    // "1.", "2.", "3." at start of line followed by math-like content
    { regex: /(?:^|\n)\s*(\d+)\.\s+(?:[\$\\]|[a-z]\s*=|[-+]?\d+|√|\\frac|\\sqrt)/gim, minMatches: 3, name: 'numbered-list-math' },

    // "1)", "2)", "3)" at start of line
    { regex: /(?:^|\n)\s*(\d+)\)\s+/gm, minMatches: 3, name: 'numbered-parens' },

    // "**1.**", "**2.**", "**3.**" — markdown bold numbered
    { regex: /(?:^|\n)\s*\*\*\s*#?\s*(\d+)\.?\s*\*\*/gm, minMatches: 3, name: 'bold-numbered' },

    // "Step-by-step for #1" ... "Step-by-step for #2" — sequential solve headers
    { regex: /(?:step[- ]by[- ]step|solution|solving|answer)\s+(?:for\s+)?(?:#|problem\s*#?\s*)(\d+)/gim, minMatches: 2, name: 'sequential-solve' },
];

/**
 * Detect if an AI response contains an answer key (multiple problems solved).
 *
 * This is the server-side defense-in-depth layer. Even if the AI ignores
 * prompt instructions and generates solutions to multiple problems, this
 * function catches it before the response reaches the student.
 *
 * @param {string} responseText - The AI's response text
 * @param {Object} [options] - Configuration options
 * @param {number} [options.minProblems=3] - Minimum distinct problem numbers to trigger
 * @returns {{ isAnswerKey: boolean, problemCount: number, matchedPattern: string|null, problemNumbers: number[] }}
 */
function detectAnswerKeyResponse(responseText, options = {}) {
    if (!responseText || typeof responseText !== 'string') {
        return { isAnswerKey: false, problemCount: 0, matchedPattern: null, problemNumbers: [] };
    }

    const minProblems = options.minProblems || 3;

    for (const pattern of ANSWER_KEY_PATTERNS) {
        const matches = [...responseText.matchAll(pattern.regex)];

        if (matches.length >= pattern.minMatches) {
            // Extract distinct problem numbers
            const problemNumbers = [...new Set(matches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n)))];

            // Check if we have enough DISTINCT problem numbers
            if (problemNumbers.length >= minProblems) {
                // Additional check: are the numbers sequential or close to sequential?
                // This reduces false positives from legitimate numbered lists
                const sorted = problemNumbers.sort((a, b) => a - b);
                const hasSequentialRun = sorted.some((num, i) =>
                    i >= 2 && sorted[i] - sorted[i - 2] <= 4 // 3+ numbers within a range of 4
                );

                if (hasSequentialRun || problemNumbers.length >= 4) {
                    return {
                        isAnswerKey: true,
                        problemCount: problemNumbers.length,
                        matchedPattern: pattern.name,
                        problemNumbers: sorted
                    };
                }
            }
        }
    }

    return { isAnswerKey: false, problemCount: 0, matchedPattern: null, problemNumbers: [] };
}

/**
 * The safe redirect message sent to the student when an answer key is detected.
 * This replaces the AI's response entirely.
 */
const ANSWER_KEY_REDIRECT_MESSAGE = `Whoa, hold on — I almost just did your homework for you! That's not how this works.

Here's the deal: I can see your problems, and I want to help you actually *get* this. So which one do you want to start with? Or if you want, I can walk you through the whole sheet from the top — your call.`;

/**
 * Filter an AI response for answer-key patterns. If detected, replace with
 * a safe redirect message.
 *
 * This should be called on EVERY AI response in chat routes as defense-in-depth.
 *
 * @param {string} responseText - The AI's raw response text
 * @param {string} [userId] - For logging purposes
 * @returns {{ text: string, wasFiltered: boolean, detection: Object }}
 */
function filterAnswerKeyResponse(responseText, userId) {
    const detection = detectAnswerKeyResponse(responseText);

    if (detection.isAnswerKey) {
        console.warn(
            `🚨 [ANSWER-KEY DETECTED] User ${userId || 'unknown'} — ` +
            `${detection.problemCount} problems (${detection.problemNumbers.join(', ')}) ` +
            `matched pattern "${detection.matchedPattern}". Response blocked.`
        );
        return {
            text: ANSWER_KEY_REDIRECT_MESSAGE,
            wasFiltered: true,
            detection
        };
    }

    return { text: responseText, wasFiltered: false, detection };
}

module.exports = {
    WORKSHEET_GUARD_INSTRUCTION,
    applyWorksheetGuard,
    detectWorksheetSignals,
    detectBlankWork,
    stripCorrectAnswers,
    detectAnswerKeyResponse,
    filterAnswerKeyResponse,
    ANSWER_KEY_REDIRECT_MESSAGE
};
