// routes/voice.js
// Real-time voice chat endpoint - GPT-style live voice experience

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/llmGateway");
const { verify: pipelineVerify } = require("../utils/pipeline");
const { openai } = require('../utils/openaiClient');
const { processAIResponse } = require('../utils/chatBoardParser');
const { cleanTextForTTS } = require('../utils/mathTTS');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective model for voice responses

// Map client MIME types to file extensions for Whisper API
const MIME_TO_EXT = {
    'audio/webm;codecs=opus': '.webm',
    'audio/webm': '.webm',
    'audio/mp4;codecs=opus': '.mp4',
    'audio/mp4': '.mp4',
    'audio/ogg;codecs=opus': '.ogg',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/x-m4a': '.m4a',
};
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ttsProvider = require('../utils/ttsProvider');
const logger = require('../utils/logger').child({ route: 'voice' });

/**
 * Check if user is under 13 based on dateOfBirth.
 * Third-party TTS terms prohibit use by children under 13.
 * Under-13 users get a flag to use browser-native WebSpeech API instead.
 */
function isUnder13(user) {
    if (!user || !user.dateOfBirth) return false; // If no DOB, can't enforce — defaults to allowing
    const age = (Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age < 13;
}

// ============================================
// VOICE PROCESSING ENDPOINT
// ============================================

/**
 * POST /api/voice/process
 * Processes voice input:
 * 1. Transcribes audio using OpenAI Whisper
 * 2. Generates AI response with board context
 * 3. Synthesizes speech using OpenAI TTS
 * 4. Returns transcription, response, audio URL, and board actions
 */
router.post('/process', isAuthenticated, async (req, res) => {
    const { audio, mimeType, boardContext } = req.body;
    const userId = req.user._id;

    logger.info('[Voice] Received request from user:', userId);
    logger.info('[Voice] Audio data size:', audio ? audio.length : 0, 'chars');
    logger.info('[Voice] Board context present:', !!boardContext);

    if (!audio) {
        logger.error('[Voice] No audio data provided');
        return res.status(400).json({ error: 'Audio data is required' });
    }

    // COMPLIANCE: Third-party TTS terms prohibit use by children under 13.
    // Under-13 users must use browser-native WebSpeech API instead.
    if (isUnder13(req.user)) {
        return res.status(403).json({
            error: 'Voice chat unavailable',
            message: 'Voice chat uses a third-party service that requires users to be 13 or older. Please use the text chat instead.',
            useWebSpeech: true  // Frontend flag: fall back to browser TTS
        });
    }

    // Check API keys early
    if (!ttsProvider.isConfigured()) {
        logger.error(`[Voice] ${ttsProvider.getProviderName()} API key not configured`);
        return res.status(500).json({
            error: 'Voice chat not configured',
            message: `${ttsProvider.getProviderName()} API key is missing. Please configure the appropriate environment variable.`
        });
    }

    if (!process.env.OPENAI_API_KEY && !openai.apiKey) {
        logger.error('[Voice] OpenAI API key not configured');
        return res.status(500).json({
            error: 'Voice chat not configured',
            message: 'OpenAI API key is missing. Please configure OPENAI_API_KEY environment variable.'
        });
    }

    // ── Switch to NDJSON streaming for lower perceived latency ──
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    function sendPhase(data) {
        res.write(JSON.stringify(data) + '\n');
        if (res.flush) res.flush();
    }

    try {
        const startTime = Date.now();

        // ============================================
        // STEP 1: SPEECH-TO-TEXT (Whisper) — parallelized with user data
        // ============================================

        logger.info('[Voice] Processing audio from user:', userId);

        // Decode base64 audio
        let audioBuffer;
        try {
            audioBuffer = Buffer.from(audio, 'base64');
        } catch (error) {
            sendPhase({ phase: 'error', message: 'Invalid audio format' });
            return res.end();
        }

        // Create temporary file for Whisper API
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const audioExt = MIME_TO_EXT[mimeType] || '.webm';
        const tempAudioPath = path.join(tempDir, `voice_${userId}_${Date.now()}${audioExt}`);
        fs.writeFileSync(tempAudioPath, audioBuffer);

        const langMap = {
            'English': 'en', 'Spanish': 'es', 'Russian': 'ru', 'Chinese': 'zh',
            'Vietnamese': 'vi', 'Arabic': 'ar', 'Somali': 'so', 'French': 'fr', 'German': 'de'
        };

        // ── Run Whisper + full user data + conversation history in parallel ──
        const [transcription, user, conversation] = await Promise.all([
            openai.audio.transcriptions.create({
                file: fs.createReadStream(tempAudioPath),
                model: 'whisper-1',
                language: langMap[req.user.preferredLanguage] || 'en',
            }).finally(() => {
                if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
            }),
            User.findById(userId).lean(),
            Conversation.findOne({ userId })
                .sort({ updatedAt: -1 })
                .select({ messages: { $slice: -10 } })
                .lean()
        ]);

        const step1Time = Date.now() - startTime;
        const userMessage = transcription.text;
        logger.info(`[Voice] Transcription (${step1Time}ms):`, userMessage);

        if (!userMessage || userMessage.trim().length === 0) {
            sendPhase({ phase: 'transcription', transcription: '' });
            sendPhase({ phase: 'response', response: "I didn't catch that. Could you try again?", boardActions: [] });
            return res.end();
        }

        if (!user) {
            sendPhase({ phase: 'error', message: 'User not found' });
            return res.end();
        }

        // ── Send transcription immediately ──
        sendPhase({ phase: 'transcription', transcription: userMessage });

        // ============================================
        // STEP 2: AI RESPONSE GENERATION
        // ============================================

        // Load tutor configuration
        const TUTOR_CONFIG = require('../utils/tutorConfig');
        const selectedTutorId = user.selectedTutorId || 'default';
        const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

        const conversationHistory = (conversation?.messages || [])
            .filter(msg => msg.content && msg.content.trim().length > 0)
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }));

        // Add board context to system prompt if available
        let boardContextPrompt = '';
        if (boardContext && boardContext.semanticObjects && boardContext.semanticObjects.length > 0) {
            boardContextPrompt = `\n\n**WHITEBOARD CONTEXT:**\n`;
            boardContextPrompt += `Board mode: ${boardContext.mode}\n`;
            boardContextPrompt += `Current objects on board:\n`;
            boardContext.semanticObjects.forEach(obj => {
                boardContextPrompt += `- [${obj.id}] ${obj.type}: ${obj.content} (region: ${obj.region})\n`;
            });
            boardContextPrompt += `\nYou can reference these objects using [BOARD_REF:objectId] syntax.\n`;
        } else {
            boardContextPrompt = `\n\n**WHITEBOARD CONTEXT:** Board is currently empty. You can write equations and draw on the board using voice commands.\n`;
        }

        const systemPrompt = await generateSystemPrompt(user, tutorProfile);

        const voiceInstructions = `\n\n**VOICE MODE ACTIVE:**
- Keep responses conversational and brief (1-3 sentences for chat)
- Use the whiteboard for complex explanations
- You can perform board actions by including special syntax:
  - [WRITE:x,y,text] - Write text at position (x, y)
  - [CIRCLE:objectId,message] - Circle an object with optional message
  - [ARROW:fromId,toX,toY,message] - Draw arrow from object
  - [HIGHLIGHT:objectId,color] - Highlight object
  - [CLEAR] - Clear the board
- Natural, spoken responses work best
- Reference board objects using [BOARD_REF:objectId]
`;

        const messages = [
            { role: 'system', content: systemPrompt + boardContextPrompt + voiceInstructions },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        const step2Start = Date.now();

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messages, {
            temperature: 0.5,
            max_tokens: 500
        });

        let aiResponseText = completion.choices[0].message.content.trim();
        const step2Time = Date.now() - step2Start;
        logger.info(`[Voice] AI response (${step2Time}ms)`);

        // ============================================
        // STEP 3: PARSE BOARD ACTIONS + SEND RESPONSE
        // ============================================

        const boardActions = parseBoardActionsFromResponse(aiResponseText);

        aiResponseText = aiResponseText
            .replace(/\[WRITE:[^\]]+\]/g, '')
            .replace(/\[CIRCLE:[^\]]+\]/g, '')
            .replace(/\[ARROW:[^\]]+\]/g, '')
            .replace(/\[HIGHLIGHT:[^\]]+\]/g, '')
            .replace(/\[CLEAR\]/g, '')
            .trim();

        const boardParsed = processAIResponse(aiResponseText);
        aiResponseText = boardParsed.text;
        let boardContextData = boardParsed.boardContext;

        // ── Pipeline verify (defense-in-depth) ──
        // Catch answer giveaways, system-tag leaks, and reading-level
        // issues before the response (and matching board actions) reach
        // the student. If verify rewrites the text, drop the board
        // actions too — they would visually leak the redirected solution.
        try {
            const verified = await pipelineVerify(aiResponseText, {
                userId: userId?.toString?.() || userId,
                userMessage,
                iepReadingLevel: user?.iepPlan?.readingLevel || null,
                firstName: user?.firstName,
                isStreaming: false,
            });
            if (verified.flags?.some(f => f.startsWith('answer_giveaway') || f.startsWith('answer_key') || f.startsWith('upload_'))) {
                logger.warn('[Voice] response redirected by verify', { userId, flags: verified.flags });
                boardActions.length = 0;
                boardContextData = null;
            }
            aiResponseText = verified.text || aiResponseText;
        } catch (err) {
            logger.warn('[Voice] verify failed (using unverified)', { error: err.message });
        }

        // ── Send text + board immediately — don't wait for TTS ──
        sendPhase({
            phase: 'response',
            response: aiResponseText,
            boardActions: boardActions,
            boardContext: boardContextData
        });

        // ============================================
        // STEP 4: TTS + history save in parallel
        // ============================================

        const ttsText = cleanTextForTTS(aiResponseText);
        const tutorVoiceId = ttsProvider.getVoiceId(tutorProfile);

        const [audioUrl] = await Promise.all([
            // TTS generation
            (async () => {
                if (!tutorVoiceId || !ttsText) return null;
                try {
                    const audioData = await ttsProvider.generateAudio(ttsText, tutorVoiceId);
                    const audioDir = path.join(__dirname, '../public/audio/voice');
                    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
                    const ext = ttsProvider.getFileExtension();
                    const audioFilename = `voice_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                    const audioPath = path.join(audioDir, audioFilename);
                    fs.writeFileSync(audioPath, audioData);
                    // Cleanup old files (fire and forget)
                    cleanupOldAudioFiles(audioDir, 100);
                    return `/audio/voice/${audioFilename}`;
                } catch (err) {
                    logger.warn('[Voice] TTS failed:', err.message);
                    return null;
                }
            })(),
            // Save to conversation history
            (async () => {
                const messagesToPush = [];
                if (userMessage) messagesToPush.push({ role: 'user', content: userMessage.trim(), timestamp: new Date() });
                if (aiResponseText) messagesToPush.push({ role: 'assistant', content: aiResponseText.trim(), timestamp: new Date() });
                if (messagesToPush.length > 0) {
                    await Conversation.findOneAndUpdate(
                        { userId },
                        { $push: { messages: { $each: messagesToPush } }, $set: { updatedAt: new Date() } },
                        { upsert: true }
                    );
                }
            })()
        ]);

        const totalTime = Date.now() - startTime;
        logger.info(`[Voice] Total: ${totalTime}ms (Whisper: ${step1Time}ms, AI: ${step2Time}ms, TTS+Save: ${totalTime - step1Time - step2Time}ms)`);

        // ── Send audio URL ──
        sendPhase({ phase: 'audio', audioUrl });
        res.end();

    } catch (error) {
        logger.error('[Voice] FATAL ERROR processing voice:', error);
        logger.error('Error stack:', error.stack);

        let message = 'Failed to process voice input';
        if (error.message.includes('Whisper')) {
            message = 'Speech recognition failed. Please try speaking again.';
        } else if (error.message.includes('TTS') || error.message.includes('Cartesia')) {
            message = 'Voice synthesis failed. Please try again.';
        } else if (error.message.includes('API key')) {
            message = 'Voice feature is not configured. Please contact support.';
        }

        sendPhase({ phase: 'error', message });
        res.end();
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse board actions from AI response
 * Supports: [WRITE:x,y,text], [CIRCLE:objectId,message], etc.
 */
function parseBoardActionsFromResponse(text) {
    const actions = [];

    // Parse WRITE commands: [WRITE:100,200,x^2 + 5x + 6]
    const writeRegex = /\[WRITE:(\d+),(\d+),([^\]]+)\]/g;
    let match;
    while ((match = writeRegex.exec(text)) !== null) {
        actions.push({
            type: 'write',
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            text: match[3].trim(),
            pause: true
        });
    }

    // Parse CIRCLE commands: [CIRCLE:eq_1,Check this]
    const circleRegex = /\[CIRCLE:([^,\]]+)(?:,([^\]]+))?\]/g;
    while ((match = circleRegex.exec(text)) !== null) {
        actions.push({
            type: 'circle',
            objectId: match[1].trim(),
            message: match[2] ? match[2].trim() : null
        });
    }

    // Parse ARROW commands: [ARROW:eq_1,300,200,points here]
    const arrowRegex = /\[ARROW:([^,\]]+),(\d+),(\d+)(?:,([^\]]+))?\]/g;
    while ((match = arrowRegex.exec(text)) !== null) {
        actions.push({
            type: 'arrow',
            fromId: match[1].trim(),
            toX: parseInt(match[2]),
            toY: parseInt(match[3]),
            message: match[4] ? match[4].trim() : null
        });
    }

    // Parse HIGHLIGHT commands: [HIGHLIGHT:eq_2,#ff6b6b]
    const highlightRegex = /\[HIGHLIGHT:([^,\]]+)(?:,([^\]]+))?\]/g;
    while ((match = highlightRegex.exec(text)) !== null) {
        actions.push({
            type: 'highlight',
            objectId: match[1].trim(),
            color: match[2] ? match[2].trim() : '#fbbf24',
            duration: 3000
        });
    }

    // Parse CLEAR command: [CLEAR]
    if (text.includes('[CLEAR]')) {
        actions.push({ type: 'clear' });
    }

    return actions;
}

/**
 * Clean up old audio files to prevent disk space issues
 */
function cleanupOldAudioFiles(directory, keepCount = 100) {
    try {
        const files = fs.readdirSync(directory)
            .map(filename => ({
                filename,
                path: path.join(directory, filename),
                mtime: fs.statSync(path.join(directory, filename)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime); // Newest first

        // Delete files beyond keepCount
        for (let i = keepCount; i < files.length; i++) {
            fs.unlinkSync(files[i].path);
            logger.debug(`[Voice] Cleaned up old audio: ${files[i].filename}`);
        }
    } catch (error) {
        logger.warn('[Voice] Error cleaning up audio files:', error.message);
    }
}

// cleanTextForTTS and convertLatexToSpeech are now in utils/mathTTS.js

module.exports = router;
