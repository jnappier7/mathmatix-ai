// routes/voice-test.js
// Diagnostic endpoint to test voice pipeline components

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { openai } = require('../utils/openaiClient');
const ttsProvider = require('../utils/ttsProvider');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/voice/test
 * Tests each component of the voice pipeline
 */
router.get('/test', isAuthenticated, async (req, res) => {
    const results = {
        timestamp: new Date().toISOString(),
        userId: req.user._id,
        ttsProvider: ttsProvider.getProviderName(),
        tests: []
    };

    // Test 1: Environment Variables
    results.tests.push({
        name: 'Environment Variables',
        status: checkEnvVars()
    });

    // Test 2: Temp Directory
    results.tests.push({
        name: 'Temp Directory',
        status: await testTempDirectory()
    });

    // Test 3: Audio Directory
    results.tests.push({
        name: 'Audio Directory',
        status: await testAudioDirectory()
    });

    // Test 4: OpenAI Client
    results.tests.push({
        name: 'OpenAI Client',
        status: await testOpenAIClient()
    });

    // Test 5: TTS Provider API
    const TUTOR_CONFIG = require('../utils/tutorConfig');
    const defaultTutor = TUTOR_CONFIG['default'] || TUTOR_CONFIG['mr-nappier'];
    const testVoiceId = ttsProvider.getVoiceId(defaultTutor);
    results.tests.push({
        name: `TTS Provider (${ttsProvider.getProviderName()})`,
        status: await ttsProvider.testConnection(testVoiceId)
    });

    const allPassed = results.tests.every(test => test.status.success);
    results.overallStatus = allPassed ? 'PASS' : 'FAIL';

    res.json(results);
});

function checkEnvVars() {
    const checks = {
        openaiKey: !!process.env.OPENAI_API_KEY,
        openaiKeyFormat: process.env.OPENAI_API_KEY?.startsWith('sk-'),
        ttsProvider: ttsProvider.getProviderName(),
        ttsConfigured: ttsProvider.isConfigured()
    };

    const allPass = checks.openaiKey && checks.openaiKeyFormat && checks.ttsConfigured;

    return {
        success: allPass,
        details: checks,
        message: allPass ? 'All API keys present and formatted correctly' : 'Missing or incorrectly formatted API keys'
    };
}

async function testTempDirectory() {
    try {
        const tempDir = path.join(__dirname, '../temp');

        // Create if not exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Test write
        const testFile = path.join(tempDir, 'test.txt');
        fs.writeFileSync(testFile, 'test');

        // Test read
        fs.readFileSync(testFile, 'utf8');

        // Cleanup
        fs.unlinkSync(testFile);

        return {
            success: true,
            details: { path: tempDir, writable: true, readable: true },
            message: 'Temp directory is accessible'
        };
    } catch (error) {
        return {
            success: false,
            details: { error: error.message },
            message: `Temp directory error: ${error.message}`
        };
    }
}

async function testAudioDirectory() {
    try {
        const audioDir = path.join(__dirname, '../public/audio/voice');

        // Create if not exists
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }

        // Test write
        const testFile = path.join(audioDir, 'test.txt');
        fs.writeFileSync(testFile, 'test');

        // Test read
        fs.readFileSync(testFile, 'utf8');

        // Cleanup
        fs.unlinkSync(testFile);

        return {
            success: true,
            details: { path: audioDir, writable: true, readable: true },
            message: 'Audio directory is accessible'
        };
    } catch (error) {
        return {
            success: false,
            details: { error: error.message },
            message: `Audio directory error: ${error.message}`
        };
    }
}

async function testOpenAIClient() {
    try {
        // Test a simple completion to verify API key works
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Say "test"' }],
            max_tokens: 5
        });

        return {
            success: true,
            details: {
                model: response.model,
                responseReceived: !!response.choices[0].message.content
            },
            message: 'OpenAI API is working'
        };
    } catch (error) {
        return {
            success: false,
            details: {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            },
            message: `OpenAI API error: ${error.message}`
        };
    }
}

module.exports = router;
