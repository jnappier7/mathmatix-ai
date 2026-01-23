// ============================================
// DIAGRAM GENERATION ROUTE
// Generates controlled, accurate mathematical diagrams
// NO freeform drawing - only specific validated types
// ============================================

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

/**
 * Generate a mathematical diagram
 * POST /api/generate-diagram
 * Body: {
 *   type: 'parabola' | 'triangle' | 'number_line' | 'coordinate_plane' | 'angle',
 *   params: { ... type-specific parameters ... }
 * }
 * Returns: { success: true, image: 'data:image/png;base64,...' }
 */
router.post('/generate-diagram', async (req, res) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    try {
        const { type, params } = req.body;

        console.log(`[DiagramGen] [${requestId}] Request received:`, {
            type,
            params,
            userId: req.user?._id,
            userAgent: req.headers['user-agent']
        });

        // Validate diagram type
        const validTypes = ['parabola', 'triangle', 'number_line', 'coordinate_plane', 'angle'];
        if (!type || !validTypes.includes(type)) {
            console.log(`[DiagramGen] [${requestId}] Invalid type: ${type}`);
            return res.status(400).json({
                success: false,
                error: `Invalid diagram type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        // Validate params
        if (!params || typeof params !== 'object') {
            console.log(`[DiagramGen] [${requestId}] Invalid params:`, params);
            return res.status(400).json({
                success: false,
                error: 'params object is required'
            });
        }

        console.log(`[DiagramGen] [${requestId}] Generating ${type} diagram with params:`, params);

        // Call Python script
        const pythonScript = path.join(__dirname, '..', 'utils', 'diagramGenerator.py');
        const inputData = JSON.stringify({ type, params });

        const base64Image = await callPythonScript(pythonScript, inputData);

        // Return as data URL
        const dataUrl = `data:image/png;base64,${base64Image}`;

        const duration = Date.now() - startTime;
        console.log(`[DiagramGen] [${requestId}] Success - ${type} diagram generated in ${duration}ms`);

        res.json({
            success: true,
            image: dataUrl,
            type: type
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[DiagramGen] [${requestId}] Error after ${duration}ms:`, error.message);
        console.error(`[DiagramGen] [${requestId}] Stack:`, error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate diagram'
        });
    }
});

/**
 * Call Python script and return output
 */
function callPythonScript(scriptPath, inputData) {
    return new Promise((resolve, reject) => {
        const python = spawn('python3', [scriptPath, inputData]);

        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('[DiagramGen] Python error:', errorOutput);
                reject(new Error(`Python script failed: ${errorOutput}`));
            } else {
                resolve(output.trim());
            }
        });

        python.on('error', (err) => {
            console.error('[DiagramGen] Failed to start Python:', err);
            reject(new Error(`Failed to start Python: ${err.message}`));
        });
    });
}

/**
 * Parse diagram command from AI response
 * Format: [DIAGRAM:type:param1=value1,param2=value2,...]
 * Example: [DIAGRAM:parabola:a=-1,h=2,k=3,showVertex=true]
 */
function parseDiagramCommand(command) {
    const match = command.match(/\[DIAGRAM:(\w+):([^\]]+)\]/);
    if (!match) return null;

    const type = match[1];
    const paramsStr = match[2];

    // Parse parameters
    const params = {};
    const pairs = paramsStr.split(',');
    for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
            // Try to parse as number or boolean
            if (value === 'true') params[key] = true;
            else if (value === 'false') params[key] = false;
            else if (!isNaN(value)) params[key] = parseFloat(value);
            else params[key] = value;
        }
    }

    return { type, params };
}

module.exports = router;
module.exports.parseDiagramCommand = parseDiagramCommand;
