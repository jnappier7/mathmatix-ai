// utils/chatBoardParser.js
// Parse and process board-first chat integration markers from AI responses

/**
 * Parse [BOARD_REF:objectId] markers from AI response text
 * Extracts board references and prepares boardContext for client
 *
 * @param {string} text - AI response text
 * @returns {Object} { cleanedText, boardReferences, boardContext }
 */
function parseBoardReferences(text) {
    if (!text) {
        return {
            cleanedText: '',
            boardReferences: [],
            boardContext: null
        };
    }

    const boardRefRegex = /\[BOARD_REF:([^\]]+)\]/g;
    const boardReferences = [];
    let match;

    // Extract all board references
    while ((match = boardRefRegex.exec(text)) !== null) {
        boardReferences.push({
            objectId: match[1].trim(),
            fullMatch: match[0],
            index: match.index
        });
    }

    // Clean the text by removing [BOARD_REF:...] markers
    // (Client will use boardContext to create visual anchors)
    const cleanedText = text.replace(boardRefRegex, '').trim();

    // Build boardContext for the primary reference (first one)
    let boardContext = null;
    if (boardReferences.length > 0) {
        const primaryRef = boardReferences[0];

        // Determine anchor type based on message content
        const lowerText = cleanedText.toLowerCase();
        let type = 'teacher'; // default

        if (lowerText.includes('check') || lowerText.includes('look') || lowerText.includes('not quite')) {
            type = 'error';
        } else if (lowerText.includes('try') || lowerText.includes('what') || lowerText.includes('how')) {
            type = 'hint';
        }

        boardContext = {
            targetObjectId: primaryRef.objectId,
            type: type,
            allReferences: boardReferences.map(ref => ref.objectId)
        };
    }

    return {
        cleanedText,
        boardReferences,
        boardContext
    };
}

/**
 * Validate message length for micro-chat constraints
 * Returns warnings but doesn't block (soft enforcement)
 *
 * @param {string} text - Message text to validate
 * @param {number} maxLength - Maximum character limit (default 100)
 * @returns {Object} { isValid, length, warning }
 */
function validateMicroChat(text, maxLength = 100) {
    if (!text) {
        return { isValid: true, length: 0, warning: null };
    }

    // Remove markdown and special formatting for length calculation
    const cleanText = text
        .replace(/\*\*/g, '') // bold
        .replace(/\*/g, '')   // italic
        .replace(/\[BOARD_REF:[^\]]+\]/g, '') // board refs
        .replace(/\[DESMOS:[^\]]+\]/g, '')    // desmos
        .replace(/\\\(.*?\\\)/g, '')          // inline latex
        .replace(/\\\[.*?\\\]/g, '')          // display latex
        .trim();

    const length = cleanText.length;
    const isValid = length <= maxLength;

    let warning = null;
    if (!isValid) {
        const overage = length - maxLength;
        warning = `Micro-chat constraint violated: ${length} chars (${overage} over limit). Should use whiteboard instead.`;
    } else if (length > maxLength * 0.7) {
        // Warn at 70% threshold
        warning = `Approaching micro-chat limit: ${length}/${maxLength} chars. Consider whiteboard.`;
    }

    return {
        isValid,
        length,
        warning,
        overage: isValid ? 0 : length - maxLength
    };
}

/**
 * Detect if message should trigger board mode
 * Based on content patterns that indicate visual teaching
 *
 * @param {string} text - Message text to analyze
 * @returns {boolean} true if board should be used
 */
function shouldUseBoard(text) {
    if (!text) return false;

    const lowerText = text.toLowerCase();

    // Patterns that indicate visual/board teaching
    const boardIndicators = [
        // Direct board commands
        /\[grid\]/i,
        /\[circle:/i,
        /\[line:/i,
        /\[desmos:/i,

        // Math operations that should be visual
        /solve this equation/i,
        /let me show you/i,
        /let's work through/i,
        /write this/i,
        /graph/i,

        // Step-by-step indicators
        /step \d+/i,
        /first.*then/i,
        /next.*after/i
    ];

    return boardIndicators.some(pattern => pattern.test(text));
}

/**
 * Process complete AI response for board-first integration
 * Combines all parsing and validation
 *
 * @param {string} aiResponseText - Raw AI response
 * @returns {Object} Processed response with all metadata
 */
function processAIResponse(aiResponseText) {
    // Parse board references
    const { cleanedText, boardReferences, boardContext } = parseBoardReferences(aiResponseText);

    // Validate message length
    const validation = validateMicroChat(cleanedText);

    // Check if board should be used
    const shouldBoard = shouldUseBoard(cleanedText);

    // Log warnings to console for monitoring
    if (validation.warning) {
        console.log(`[ChatBoard] ${validation.warning}`);
    }

    if (boardReferences.length > 0) {
        console.log(`[ChatBoard] Found ${boardReferences.length} board reference(s): ${boardReferences.map(r => r.objectId).join(', ')}`);
    }

    return {
        text: cleanedText,
        boardContext: boardContext,
        boardReferences: boardReferences,
        validation: validation,
        shouldUseBoard: shouldBoard,
        metadata: {
            originalLength: aiResponseText.length,
            cleanedLength: cleanedText.length,
            hasBoardRefs: boardReferences.length > 0,
            isWithinLimit: validation.isValid
        }
    };
}

/**
 * Generate micro-chat suggestions based on context
 * Helper for AI that struggles with brevity
 *
 * @param {string} intent - Message intent ('invite', 'hint', 'error', 'praise')
 * @returns {Array<string>} Suggested micro-chat templates
 */
function getMicroChatSuggestions(intent = 'invite') {
    const templates = {
        invite: [
            "Your turn.",
            "What comes next?",
            "Show me.",
            "Your move.",
            "Try it."
        ],
        hint: [
            "Look at the sign.",
            "What cancels this?",
            "Check that step.",
            "See it?",
            "Notice anything?"
        ],
        pause: [
            "Pause.",
            "Watch this.",
            "One sec.",
            "Hold on.",
            "Look here."
        ],
        error: [
            "Not quite.",
            "Look again.",
            "Close, but...",
            "Hmm...",
            "Check this."
        ],
        praise: [
            "Nice.",
            "Good thinking.",
            "You got it.",
            "Exactly.",
            "Perfect.",
            "Smart move."
        ],
        redirect: [
            "Look here.",
            "Check the board.",
            "Try again here.",
            "Different approach?",
            "What if..."
        ]
    };

    return templates[intent] || templates.invite;
}

/**
 * Fallback: Truncate message if it's way too long
 * Last resort - shouldn't normally be needed if AI follows prompt
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Max length (default 100)
 * @returns {string} Truncated text
 */
function truncateIfNeeded(text, maxLength = 100) {
    if (!text || text.length <= maxLength) {
        return text;
    }

    // Find a good break point (end of sentence, word, etc.)
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    const lastPeriod = truncated.lastIndexOf('.');

    let breakPoint = lastPeriod > 0 ? lastPeriod + 1 : lastSpace > 0 ? lastSpace : maxLength - 3;

    const result = text.substring(0, breakPoint).trim() + '...';

    console.warn(`[ChatBoard] MESSAGE TRUNCATED: Original ${text.length} chars -> ${result.length} chars`);
    console.warn(`[ChatBoard] Original: "${text.substring(0, 50)}..."`);

    return result;
}

module.exports = {
    parseBoardReferences,
    validateMicroChat,
    shouldUseBoard,
    processAIResponse,
    getMicroChatSuggestions,
    truncateIfNeeded
};
