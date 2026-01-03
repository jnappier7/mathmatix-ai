// ============================================
// AI DRAWING TOOLS - High-Level Drawing API
// ============================================

/**
 * Parse AI drawing commands and convert them to drawing sequences
 * Supports high-level commands like GRAPH, GRID, SHAPE, etc.
 */

function parseAIDrawingCommands(aiResponseText, canvasWidth = 450, canvasHeight = 500) {
    const drawingSequence = [];
    let cleanedText = aiResponseText;

    // --- GRID COMMAND ---
    // [GRID] or [GRID:xMin,xMax,yMin,yMax,spacing]
    const gridRegex = /\[GRID(?::(-?\d+),(-?\d+),(-?\d+),(-?\d+),?(\d+)?)?\]/g;
    let match;

    while ((match = gridRegex.exec(aiResponseText)) !== null) {
        const xMin = match[1] ? parseInt(match[1]) : -10;
        const xMax = match[2] ? parseInt(match[2]) : 10;
        const yMin = match[3] ? parseInt(match[3]) : -10;
        const yMax = match[4] ? parseInt(match[4]) : 10;
        const gridSize = match[5] ? parseInt(match[5]) : 30;

        drawingSequence.push({
            type: 'grid',
            xMin,
            xMax,
            yMin,
            yMax,
            gridSize
        });
    }
    cleanedText = cleanedText.replace(gridRegex, '');

    // --- GRAPH FUNCTION COMMAND ---
    // [GRAPH:y=x^2] or [GRAPH:y=2*x+1,color=#12B3B3]
    const graphRegex = /\[GRAPH:([^,\]]+)(?:,color=([#\w]+))?(?:,xMin=(-?\d+))?(?:,xMax=(-?\d+))?\]/g;

    while ((match = graphRegex.exec(aiResponseText)) !== null) {
        const funcString = match[1].replace('y=', '').trim();
        const color = match[2] || '#12B3B3';
        const xMin = match[3] ? parseInt(match[3]) : -10;
        const xMax = match[4] ? parseInt(match[4]) : 10;

        drawingSequence.push({
            type: 'function',
            function: funcString,
            color,
            xMin,
            xMax
        });
    }
    cleanedText = cleanedText.replace(graphRegex, '');

    // --- POINT COMMAND ---
    // [POINT:x,y,label] - Plot a point with optional label
    const pointRegex = /\[POINT:(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,([^\]]+))?\]/g;

    while ((match = pointRegex.exec(aiResponseText)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const label = match[3] || '';

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        drawingSequence.push({
            type: 'circle',
            position: [centerX + (x * gridSize) - 4, centerY - (y * gridSize) - 4],
            radius: 4,
            fill: '#12B3B3',
            stroke: '#12B3B3',
            strokeWidth: 2
        });

        if (label) {
            drawingSequence.push({
                type: 'text',
                content: label,
                position: [centerX + (x * gridSize) + 8, centerY - (y * gridSize) - 8],
                fontSize: 14,
                color: '#333'
            });
        }
    }
    cleanedText = cleanedText.replace(pointRegex, '');

    // --- LINE SEGMENT COMMAND ---
    // [SEGMENT:x1,y1,x2,y2,label] - Draw a line segment in coordinate space
    const segmentRegex = /\[SEGMENT:(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,([^\]]+))?\]/g;

    while ((match = segmentRegex.exec(aiResponseText)) !== null) {
        const x1 = parseFloat(match[1]);
        const y1 = parseFloat(match[2]);
        const x2 = parseFloat(match[3]);
        const y2 = parseFloat(match[4]);
        const label = match[5] || '';

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        drawingSequence.push({
            type: 'line',
            points: [
                centerX + (x1 * gridSize),
                centerY - (y1 * gridSize),
                centerX + (x2 * gridSize),
                centerY - (y2 * gridSize)
            ],
            color: '#333',
            width: 2
        });

        if (label) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            drawingSequence.push({
                type: 'text',
                content: label,
                position: [centerX + (midX * gridSize), centerY - (midY * gridSize) - 10],
                fontSize: 14,
                color: '#333'
            });
        }
    }
    cleanedText = cleanedText.replace(segmentRegex, '');

    // --- CIRCLE COMMAND ---
    // [CIRCLE:x,y,radius] or [CIRCLE:x,y,radius,color=#FF0000]
    const circleRegex = /\[CIRCLE:(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,color=([#\w]+))?\]/g;

    while ((match = circleRegex.exec(aiResponseText)) !== null) {
        const centerX_coord = parseFloat(match[1]);
        const centerY_coord = parseFloat(match[2]);
        const radius_coord = parseFloat(match[3]);
        const color = match[4] || '#12B3B3';

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        drawingSequence.push({
            type: 'circle',
            position: [
                centerX + (centerX_coord * gridSize) - (radius_coord * gridSize),
                centerY - (centerY_coord * gridSize) - (radius_coord * gridSize)
            ],
            radius: radius_coord * gridSize,
            fill: 'transparent',
            stroke: color,
            strokeWidth: 2
        });
    }
    cleanedText = cleanedText.replace(circleRegex, '');

    // --- TRIANGLE COMMAND ---
    // [TRIANGLE:x1,y1,x2,y2,x3,y3]
    const triangleRegex = /\[TRIANGLE:(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)\]/g;

    while ((match = triangleRegex.exec(aiResponseText)) !== null) {
        const x1 = parseFloat(match[1]);
        const y1 = parseFloat(match[2]);
        const x2 = parseFloat(match[3]);
        const y2 = parseFloat(match[4]);
        const x3 = parseFloat(match[5]);
        const y3 = parseFloat(match[6]);

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        // Draw three line segments
        const points = [
            [x1, y1, x2, y2],
            [x2, y2, x3, y3],
            [x3, y3, x1, y1]
        ];

        points.forEach(([px1, py1, px2, py2]) => {
            drawingSequence.push({
                type: 'line',
                points: [
                    centerX + (px1 * gridSize),
                    centerY - (py1 * gridSize),
                    centerX + (px2 * gridSize),
                    centerY - (py2 * gridSize)
                ],
                color: '#333',
                width: 2
            });
        });
    }
    cleanedText = cleanedText.replace(triangleRegex, '');

    // --- ANGLE COMMAND ---
    // [ANGLE:x,y,degrees,label] - Draw an angle arc
    const angleRegex = /\[ANGLE:(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)(?:,([^\]]+))?\]/g;

    while ((match = angleRegex.exec(aiResponseText)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const degrees = parseFloat(match[3]);
        const label = match[4] || degrees + '°';

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        drawingSequence.push({
            type: 'text',
            content: label,
            position: [centerX + (x * gridSize) + 15, centerY - (y * gridSize) - 15],
            fontSize: 14,
            color: '#12B3B3'
        });
    }
    cleanedText = cleanedText.replace(angleRegex, '');

    // --- LABEL COMMAND ---
    // [LABEL:x,y,text] - Add a text label at coordinate position
    const labelRegex = /\[LABEL:(-?\d+\.?\d*),(-?\d+\.?\d*),([^\]]+)\]/g;

    while ((match = labelRegex.exec(aiResponseText)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const text = match[3];

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const gridSize = 30;

        drawingSequence.push({
            type: 'text',
            content: text,
            position: [centerX + (x * gridSize), centerY - (y * gridSize)],
            fontSize: 16,
            color: '#333'
        });
    }
    cleanedText = cleanedText.replace(labelRegex, '');

    // --- LEGACY COMMANDS (backward compatibility) ---
    // [DRAW_LINE:x1,y1,x2,y2]
    const drawLineRegex = /\[DRAW_LINE:([\d\s,]+)\]/g;
    while ((match = drawLineRegex.exec(aiResponseText)) !== null) {
        const points = match[1].split(',').map(Number);
        if (points.length === 4) {
            drawingSequence.push({ type: 'line', points, color: '#000', width: 2 });
        }
    }
    cleanedText = cleanedText.replace(drawLineRegex, '');

    // [DRAW_TEXT:x,y,text]
    const drawTextRegex = /\[DRAW_TEXT:([\d\s,]+),([^\]]+)\]/g;
    while ((match = drawTextRegex.exec(aiResponseText)) !== null) {
        const position = match[1].split(',').map(Number);
        const content = match[2];
        if (position.length === 2) {
            drawingSequence.push({ type: 'text', position, content, fontSize: 16, color: '#000' });
        }
    }
    cleanedText = cleanedText.replace(drawTextRegex, '');

    return {
        drawingSequence: drawingSequence.length > 0 ? drawingSequence : null,
        cleanedText: cleanedText.trim()
    };
}

module.exports = { parseAIDrawingCommands };
