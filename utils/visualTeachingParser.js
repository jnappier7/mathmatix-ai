// ============================================
// VISUAL TEACHING PARSER
// Parse AI responses for visual teaching commands
// Supports: Whiteboard, Algebra Tiles, Images, Manipulatives
// ============================================

const { parseAIDrawingCommands } = require('./aiDrawingTools');

/**
 * Parse all visual teaching commands from AI response
 * @param {string} aiResponseText - The AI's response text
 * @returns {Object} { cleanedText, visualCommands }
 */
function parseVisualTeaching(aiResponseText) {
    let cleanedText = aiResponseText;
    const visualCommands = {
        whiteboard: [],
        algebraTiles: [],
        images: [],
        manipulatives: []
    };

    // --- WHITEBOARD COMMANDS ---
    // Existing drawing commands (GRID, GRAPH, POINT, etc.)
    const drawingResult = parseAIDrawingCommands(aiResponseText);
    if (drawingResult.drawingSequence && drawingResult.drawingSequence.length > 0) {
        visualCommands.whiteboard.push({
            type: 'drawing',
            sequence: drawingResult.drawingSequence,
            autoOpen: true
        });
        cleanedText = drawingResult.cleanedText;
    }

    // [WHITEBOARD_WRITE:text] - Write text on whiteboard
    const writeRegex = /\[WHITEBOARD_WRITE:([^\]]+)\]/g;
    let match;
    while ((match = writeRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'write',
            text: match[1],
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(writeRegex, '');

    // [WHITEBOARD_EQUATION:latex] - Write math equation
    const equationRegex = /\[WHITEBOARD_EQUATION:([^\]]+)\]/g;
    while ((match = equationRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'equation',
            latex: match[1],
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(equationRegex, '');

    // [WHITEBOARD_CLEAR] - Clear the whiteboard
    if (aiResponseText.includes('[WHITEBOARD_CLEAR]')) {
        visualCommands.whiteboard.push({
            type: 'clear',
            autoOpen: false
        });
        cleanedText = cleanedText.replace(/\[WHITEBOARD_CLEAR\]/g, '');
    }

    // --- ENHANCED GEOMETRY COMMANDS ---
    // [TRIANGLE_PROBLEM:A=30,B=70,C=?] - Create perfectly formatted triangle with angles
    const triangleProblemRegex = /\[TRIANGLE_PROBLEM:A=([^,]+),B=([^,]+),C=([^\]]+)\]/g;
    while ((match = triangleProblemRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'triangle_problem',
            angles: {
                A: match[1] === '?' ? '?' : parseFloat(match[1]),
                B: match[2] === '?' ? '?' : parseFloat(match[2]),
                C: match[3] === '?' ? '?' : parseFloat(match[3])
            },
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(triangleProblemRegex, '');

    // [EMPHASIZE:x,y,radius] - Draw attention circle around point
    const emphasizeRegex = /\[EMPHASIZE:(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,(\d+))?\]/g;
    while ((match = emphasizeRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'emphasize',
            x: parseFloat(match[1]),
            y: parseFloat(match[2]),
            radius: match[3] ? parseInt(match[3]) : 30,
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(emphasizeRegex, '');

    // [POINT_TO:fromX,fromY,toX,toY,message] - Draw arrow with message
    const pointToRegex = /\[POINT_TO:(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,([^\]]+))?\]/g;
    while ((match = pointToRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'point_to',
            fromX: parseFloat(match[1]),
            fromY: parseFloat(match[2]),
            toX: parseFloat(match[3]),
            toY: parseFloat(match[4]),
            message: match[5] || '',
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(pointToRegex, '');

    // --- ALGEBRA TILES COMMANDS ---
    // [ALGEBRA_TILES:expression] - Show algebra tiles for an expression
    const algebraTilesRegex = /\[ALGEBRA_TILES:([^\]]+)\]/g;
    while ((match = algebraTilesRegex.exec(aiResponseText)) !== null) {
        visualCommands.algebraTiles.push({
            type: 'expression',
            expression: match[1],
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(algebraTilesRegex, '');

    // [ALGEBRA_TILES_DEMO:operation] - Demonstrate an operation
    // Examples: "add", "multiply", "factor", "solve"
    const algebraDemoRegex = /\[ALGEBRA_TILES_DEMO:([^\]]+)\]/g;
    while ((match = algebraDemoRegex.exec(aiResponseText)) !== null) {
        visualCommands.algebraTiles.push({
            type: 'demo',
            operation: match[1],
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(algebraDemoRegex, '');

    // --- IMAGE COMMANDS ---
    // [IMAGE:url,caption] - Display an educational image
    const imageRegex = /\[IMAGE:([^,\]]+)(?:,([^\]]+))?\]/g;
    while ((match = imageRegex.exec(aiResponseText)) !== null) {
        visualCommands.images.push({
            type: 'display',
            url: match[1],
            caption: match[2] || '',
            inline: true
        });
    }
    cleanedText = cleanedText.replace(imageRegex, '');

    // [IMAGE_EXPLAIN:concept] - Show explanatory diagram for a concept
    // This will use pre-defined educational images
    const imageExplainRegex = /\[IMAGE_EXPLAIN:([^\]]+)\]/g;
    while ((match = imageExplainRegex.exec(aiResponseText)) !== null) {
        const concept = match[1].toLowerCase();
        const imageUrl = getConceptImage(concept);
        if (imageUrl) {
            visualCommands.images.push({
                type: 'concept',
                concept: match[1],
                url: imageUrl,
                inline: true
            });
        }
    }
    cleanedText = cleanedText.replace(imageExplainRegex, '');

    // --- MANIPULATIVE COMMANDS ---
    // [NUMBER_LINE:min,max,mark] - Show interactive number line
    const numberLineRegex = /\[NUMBER_LINE:(-?\d+),(-?\d+)(?:,(-?\d+))?\]/g;
    while ((match = numberLineRegex.exec(aiResponseText)) !== null) {
        visualCommands.manipulatives.push({
            type: 'numberLine',
            min: parseInt(match[1]),
            max: parseInt(match[2]),
            mark: match[3] ? parseInt(match[3]) : null,
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(numberLineRegex, '');

    // [FRACTION_BARS:numerator,denominator] - Show fraction visualization
    const fractionBarsRegex = /\[FRACTION_BARS:(\d+),(\d+)\]/g;
    while ((match = fractionBarsRegex.exec(aiResponseText)) !== null) {
        visualCommands.manipulatives.push({
            type: 'fractionBars',
            numerator: parseInt(match[1]),
            denominator: parseInt(match[2]),
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(fractionBarsRegex, '');

    // [BASE_TEN_BLOCKS:number] - Show base-10 blocks for place value
    const baseTenRegex = /\[BASE_TEN_BLOCKS:(\d+)\]/g;
    while ((match = baseTenRegex.exec(aiResponseText)) !== null) {
        visualCommands.manipulatives.push({
            type: 'baseTenBlocks',
            number: parseInt(match[1]),
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(baseTenRegex, '');

    // --- BRAIN BREAK / GAME COMMANDS ---
    // [TIC_TAC_TOE] - Start tic-tac-toe game on whiteboard
    if (aiResponseText.includes('[TIC_TAC_TOE]')) {
        visualCommands.whiteboard.push({
            type: 'game',
            game: 'ticTacToe',
            autoOpen: true
        });
        cleanedText = cleanedText.replace(/\[TIC_TAC_TOE\]/g, '');
    }

    // [HANGMAN:word] - Start hangman game with a word
    const hangmanRegex = /\[HANGMAN:([^\]]+)\]/g;
    while ((match = hangmanRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'game',
            game: 'hangman',
            word: match[1].toUpperCase(),
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(hangmanRegex, '');

    // [DRAW_CHALLENGE:prompt] - Drawing challenge (e.g., "draw a house", "draw your favorite shape")
    const drawChallengeRegex = /\[DRAW_CHALLENGE:([^\]]+)\]/g;
    while ((match = drawChallengeRegex.exec(aiResponseText)) !== null) {
        visualCommands.whiteboard.push({
            type: 'challenge',
            challenge: 'drawing',
            prompt: match[1],
            autoOpen: true
        });
    }
    cleanedText = cleanedText.replace(drawChallengeRegex, '');

    return {
        cleanedText: cleanedText.trim(),
        visualCommands
    };
}

/**
 * Get pre-defined educational image URL for a concept
 * @param {string} concept - The math concept
 * @returns {string|null} Image URL or null
 */
function getConceptImage(concept) {
    const conceptImages = {
        // Geometry
        'triangle': '/images/concepts/triangle-types.png',
        'pythagorean': '/images/concepts/pythagorean-theorem.png',
        'circle': '/images/concepts/circle-parts.png',
        'angle': '/images/concepts/angle-types.png',

        // Algebra
        'slope': '/images/concepts/slope-intercept.png',
        'quadratic': '/images/concepts/quadratic-formula.png',
        'factoring': '/images/concepts/factoring-methods.png',
        'exponents': '/images/concepts/exponent-rules.png',

        // Fractions
        'fractions': '/images/concepts/fraction-operations.png',
        'decimals': '/images/concepts/decimal-place-value.png',
        'percent': '/images/concepts/percent-conversion.png',

        // Statistics
        'mean': '/images/concepts/measures-central-tendency.png',
        'histogram': '/images/concepts/histogram-example.png',
        'probability': '/images/concepts/probability-basics.png'
    };

    return conceptImages[concept] || null;
}

/**
 * Check if response has any visual teaching commands
 * @param {string} aiResponseText - The AI's response
 * @returns {boolean} True if visual commands are present
 */
function hasVisualCommands(aiResponseText) {
    const commandPatterns = [
        /\[GRID/,
        /\[GRAPH:/,
        /\[POINT:/,
        /\[SEGMENT:/,
        /\[WHITEBOARD_/,
        /\[ALGEBRA_TILES/,
        /\[IMAGE:/,
        /\[NUMBER_LINE:/,
        /\[FRACTION_BARS:/,
        /\[BASE_TEN_BLOCKS:/
    ];

    return commandPatterns.some(pattern => pattern.test(aiResponseText));
}

module.exports = {
    parseVisualTeaching,
    hasVisualCommands,
    getConceptImage
};
