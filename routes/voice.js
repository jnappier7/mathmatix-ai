// routes/voice.js
// Real-time voice chat endpoint - GPT-style live voice experience

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/llmGateway");
const { openai } = require('../utils/openaiClient');
const { processAIResponse } = require('../utils/chatBoardParser');
const { retryWithExponentialBackoff } = require('../utils/openaiClient');
const axios = require('axios');
const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective model for voice responses
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * Check if user is under 13 based on dateOfBirth.
 * ElevenLabs terms prohibit use by children under 13.
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
    const { audio, boardContext } = req.body;
    const userId = req.user._id;

    console.log('🎙️ [Voice] Received request from user:', userId);
    console.log('🎙️ [Voice] Audio data size:', audio ? audio.length : 0, 'chars');
    console.log('🎙️ [Voice] Board context present:', !!boardContext);

    if (!audio) {
        console.error('❌ [Voice] No audio data provided');
        return res.status(400).json({ error: 'Audio data is required' });
    }

    // COMPLIANCE: ElevenLabs terms prohibit use by children under 13.
    // Under-13 users must use browser-native WebSpeech API instead.
    if (isUnder13(req.user)) {
        return res.status(403).json({
            error: 'Voice chat unavailable',
            message: 'Voice chat uses a third-party service that requires users to be 13 or older. Please use the text chat instead.',
            useWebSpeech: true  // Frontend flag: fall back to browser TTS
        });
    }

    // Check API keys early
    if (!ELEVENLABS_API_KEY) {
        console.error('❌ [Voice] ELEVENLABS_API_KEY not configured');
        return res.status(500).json({
            error: 'Voice chat not configured',
            message: 'ElevenLabs API key is missing. Please configure ELEVENLABS_API_KEY environment variable.'
        });
    }

    if (!process.env.OPENAI_API_KEY && !openai.apiKey) {
        console.error('❌ [Voice] OpenAI API key not configured');
        return res.status(500).json({
            error: 'Voice chat not configured',
            message: 'OpenAI API key is missing. Please configure OPENAI_API_KEY environment variable.'
        });
    }

    try {
        const startTime = Date.now();

        // ============================================
        // STEP 1: SPEECH-TO-TEXT (Whisper)
        // ============================================

        console.log('🎙️ [Voice] Processing audio from user:', userId);
        const step1Start = Date.now();

        // Decode base64 audio
        let audioBuffer;
        try {
            audioBuffer = Buffer.from(audio, 'base64');
            console.log('✅ [Voice] Audio decoded, size:', audioBuffer.length, 'bytes');
        } catch (error) {
            console.error('❌ [Voice] Failed to decode base64 audio:', error.message);
            throw new Error('Invalid audio format');
        }

        // Create temporary file for Whisper API
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            console.log('📁 [Voice] Creating temp directory:', tempDir);
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempAudioPath = path.join(tempDir, `voice_${userId}_${Date.now()}.webm`);
        fs.writeFileSync(tempAudioPath, audioBuffer);
        console.log('💾 [Voice] Saved temp audio file:', tempAudioPath);

        console.log('📝 [Voice] Calling Whisper API for transcription...');

        let transcription;
        try {
            transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempAudioPath),
                model: 'whisper-1',
                language: 'en', // Can be auto-detected by omitting this
            });
        } catch (error) {
            console.error('❌ [Voice] Whisper API error:', error.message);
            console.error('Error details:', error.response?.data || error);
            // Clean up temp file before throwing
            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }
            throw new Error(`Whisper transcription failed: ${error.message}`);
        }

        const userMessage = transcription.text;
        const step1Time = Date.now() - step1Start;
        console.log(`✅ [Voice] Transcription (${step1Time}ms):`, userMessage);

        // Clean up temp file
        if (fs.existsSync(tempAudioPath)) {
            fs.unlinkSync(tempAudioPath);
            console.log('🗑️ [Voice] Cleaned up temp audio file');
        }

        if (!userMessage || userMessage.trim().length === 0) {
            return res.json({
                transcription: '',
                response: "I didn't catch that. Could you try again?",
                audioUrl: null,
                boardActions: []
            });
        }

        // ============================================
        // STEP 2: AI RESPONSE GENERATION
        // ============================================

        // Fetch user data and conversation history
        const user = await User.findById(userId)
            .lean();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Load tutor configuration
        const TUTOR_CONFIG = require('../utils/tutorConfig');
        const selectedTutorId = user.selectedTutorId || 'default';
        const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

        // Fetch conversation history
        const conversation = await Conversation.findOne({ userId })
            .sort({ updatedAt: -1 })
            .lean();

        const conversationHistory = conversation?.messages || [];

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

        // Generate system prompt with correct parameters
        const systemPrompt = await generateSystemPrompt(user, tutorProfile);
        const enhancedSystemPrompt = systemPrompt + boardContextPrompt;

        // Add voice-specific instructions
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

        // Build messages array for AI
        const messages = [
            { role: 'system', content: enhancedSystemPrompt + voiceInstructions },
            ...conversationHistory.slice(-10)
                .filter(msg => msg.content && msg.content.trim().length > 0) // Filter out null/empty messages
                .map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })),
            { role: 'user', content: userMessage }
        ];

        const step2Start = Date.now();
        console.log('🤖 [Voice] Generating AI response...');
        console.log(`📝 [Voice] Message count: ${messages.length} (system + ${messages.length - 2} history + user)`);

        // Validate all messages have content
        const invalidMessages = messages.filter(m => !m.content || m.content.trim().length === 0);
        if (invalidMessages.length > 0) {
            console.error('❌ [Voice] Found messages with null/empty content:', invalidMessages);
            throw new Error('Invalid message format: some messages have null or empty content');
        }

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messages, {
            temperature: 0.7,
            max_tokens: 1000 // Shorter for voice responses
        });

        let aiResponseText = completion.choices[0].message.content.trim();
        const step2Time = Date.now() - step2Start;

        console.log(`✅ [Voice] AI response (${step2Time}ms):`, aiResponseText);

        // ============================================
        // STEP 3: PARSE BOARD ACTIONS
        // ============================================

        const boardActions = parseBoardActionsFromResponse(aiResponseText);

        // Remove board action syntax from spoken response
        aiResponseText = aiResponseText
            .replace(/\[WRITE:[^\]]+\]/g, '')
            .replace(/\[CIRCLE:[^\]]+\]/g, '')
            .replace(/\[ARROW:[^\]]+\]/g, '')
            .replace(/\[HIGHLIGHT:[^\]]+\]/g, '')
            .replace(/\[CLEAR\]/g, '')
            .trim();

        // Process board-first chat philosophy
        const boardParsed = processAIResponse(aiResponseText);
        aiResponseText = boardParsed.text;
        const boardContextData = boardParsed.boardContext;

        // Clean text for TTS (remove markdown and LaTeX)
        const ttsText = cleanTextForTTS(aiResponseText);

        // ============================================
        // STEP 4: TEXT-TO-SPEECH (ElevenLabs with Tutor Voice)
        // ============================================

        const step3Start = Date.now();
        console.log('🔊 [Voice] Generating speech with tutor voice...');

        // Get tutor's voice ID from tutor profile
        const tutorVoiceId = tutorProfile.voiceId;
        console.log(`🎤 [Voice] Using tutor: ${tutorProfile.name} (${selectedTutorId})`);
        console.log(`🎤 [Voice] Using tutor voice ID: ${tutorVoiceId}`);
        console.log(`📝 [Voice] TTS text length: ${ttsText.length} chars`);

        // Generate TTS audio using ElevenLabs
        let elevenLabsResponse;
        try {
            elevenLabsResponse = await retryWithExponentialBackoff(async () => {
                return await axios.post(
                    `https://api.elevenlabs.io/v1/text-to-speech/${tutorVoiceId}`,
                    {
                        text: ttsText,  // Use cleaned text for TTS
                        model_id: "eleven_monolingual_v1",
                        voice_settings: {
                            stability: 0.4,
                            similarity_boost: 0.7
                        }
                    },
                    {
                        headers: {
                            "xi-api-key": ELEVENLABS_API_KEY,
                            "Content-Type": "application/json",
                            "Accept": "audio/mpeg"
                        },
                        responseType: "arraybuffer"
                    }
                );
            });
        } catch (error) {
            console.error('❌ [Voice] ElevenLabs TTS error:', error.message);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);
            throw new Error(`TTS generation failed: ${error.message}`);
        }

        const audioData = Buffer.from(elevenLabsResponse.data);
        const step3Time = Date.now() - step3Start;
        console.log(`✅ [Voice] TTS audio received (${step3Time}ms), size:`, audioData.length, 'bytes');

        // Save audio file
        const audioDir = path.join(__dirname, '../public/audio/voice');
        if (!fs.existsSync(audioDir)) {
            console.log('📁 [Voice] Creating audio directory:', audioDir);
            fs.mkdirSync(audioDir, { recursive: true });
        }

        const audioFilename = `voice_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
        const audioPath = path.join(audioDir, audioFilename);
        fs.writeFileSync(audioPath, audioData);

        const audioUrl = `/audio/voice/${audioFilename}`;

        console.log('✅ [Voice] Speech generated and saved:', audioUrl);

        // ============================================
        // STEP 5: SAVE TO CONVERSATION HISTORY
        // ============================================

        // Save messages to conversation history
        // Note: findOneAndUpdate bypasses Mongoose middleware, so validate content here
        const messagesToPush = [];
        if (userMessage && typeof userMessage === 'string' && userMessage.trim() !== '') {
            messagesToPush.push({
                role: 'user',
                content: userMessage.trim(),
                timestamp: new Date()
            });
        }
        if (aiResponseText && typeof aiResponseText === 'string' && aiResponseText.trim() !== '') {
            messagesToPush.push({
                role: 'assistant',
                content: aiResponseText.trim(),
                timestamp: new Date()
            });
        }

        if (messagesToPush.length > 0) {
            await Conversation.findOneAndUpdate(
                { userId },
                {
                    $push: { messages: { $each: messagesToPush } },
                    $set: { updatedAt: new Date() }
                },
                { upsert: true }
            );
        }

        // ============================================
        // STEP 6: RETURN RESPONSE
        // ============================================

        const totalTime = Date.now() - startTime;
        console.log(`⏱️  [Voice] Total processing time: ${totalTime}ms (Whisper: ${step1Time}ms, AI: ${step2Time}ms, TTS: ${step3Time}ms, Other: ${totalTime - step1Time - step2Time - step3Time}ms)`);

        res.json({
            transcription: userMessage,
            response: aiResponseText,
            audioUrl: audioUrl,
            boardActions: boardActions,
            boardContext: boardContextData
        });

        // Clean up old audio files (keep last 100)
        cleanupOldAudioFiles(audioDir, 100);

    } catch (error) {
        console.error('❌ [Voice] FATAL ERROR processing voice:', error);
        console.error('Error stack:', error.stack);

        // Provide specific error message
        let userMessage = 'Failed to process voice input';
        if (error.message.includes('Whisper')) {
            userMessage = 'Speech recognition failed. Please try speaking again.';
        } else if (error.message.includes('TTS') || error.message.includes('ElevenLabs')) {
            userMessage = 'Voice synthesis failed. Please try again.';
        } else if (error.message.includes('API key')) {
            userMessage = 'Voice feature is not configured. Please contact support.';
        }

        res.status(500).json({
            error: 'Failed to process voice input',
            message: userMessage,
            details: error.message,
            timestamp: new Date().toISOString()
        });
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
            console.log(`🗑️ [Voice] Cleaned up old audio: ${files[i].filename}`);
        }
    } catch (error) {
        console.error('⚠️ [Voice] Error cleaning up audio files:', error.message);
    }
}

/**
 * Clean text for Text-to-Speech
 * Removes markdown formatting and converts LaTeX to readable math
 */
function cleanTextForTTS(text) {
    let cleaned = text;

    // Remove markdown headers (### Title → Title)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // Remove markdown bold/italic (**text** → text, *text* → text, __text__ → text)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

    // Remove markdown links ([text](url) → text)
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove inline code (`code` → code)
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // Remove code blocks (```...``` → ...)
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

    // Remove horizontal rules (--- or ***)
    cleaned = cleaned.replace(/^[-*]{3,}$/gm, '');

    // Convert LaTeX expressions to readable math
    // Display math: \[ ... \] or $$ ... $$
    cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, (match, latex) => convertLatexToSpeech(latex));
    cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, (match, latex) => convertLatexToSpeech(latex));

    // Inline math: \( ... \) or $ ... $
    cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, (match, latex) => convertLatexToSpeech(latex));
    cleaned = cleaned.replace(/\$([^$]+)\$/g, (match, latex) => convertLatexToSpeech(latex));

    // Remove any remaining backslashes (LaTeX commands)
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * Convert LaTeX math notation to natural speech
 */
function convertLatexToSpeech(latex) {
    let speech = latex;

    // Fractions: \frac{a}{b} → "a over b"
    speech = speech.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');

    // Superscripts: x^2 → "x squared", x^3 → "x cubed", x^n → "x to the nth"
    speech = speech.replace(/\^2\b/g, ' squared');
    speech = speech.replace(/\^3\b/g, ' cubed');
    speech = speech.replace(/\^(\d+)/g, ' to the $1th power');
    speech = speech.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
    speech = speech.replace(/\^([a-zA-Z])/g, ' to the $1');

    // Subscripts: x_1 → "x sub 1"
    speech = speech.replace(/_\{([^}]+)\}/g, ' sub $1');
    speech = speech.replace(/_([a-zA-Z0-9])/g, ' sub $1');

    // Square root: \sqrt{x} → "square root of x"
    speech = speech.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');

    // Greek letters
    speech = speech.replace(/\\alpha/g, 'alpha');
    speech = speech.replace(/\\beta/g, 'beta');
    speech = speech.replace(/\\gamma/g, 'gamma');
    speech = speech.replace(/\\delta/g, 'delta');
    speech = speech.replace(/\\theta/g, 'theta');
    speech = speech.replace(/\\pi/g, 'pi');
    speech = speech.replace(/\\sigma/g, 'sigma');

    // Mathematical operators
    speech = speech.replace(/\\times/g, ' times ');
    speech = speech.replace(/\\div/g, ' divided by ');
    speech = speech.replace(/\\pm/g, ' plus or minus ');
    speech = speech.replace(/\\cdot/g, ' times ');
    speech = speech.replace(/\\leq/g, ' less than or equal to ');
    speech = speech.replace(/\\geq/g, ' greater than or equal to ');
    speech = speech.replace(/\\neq/g, ' not equal to ');
    speech = speech.replace(/\\approx/g, ' approximately ');

    // Remove curly braces
    speech = speech.replace(/[{}]/g, '');

    // Remove remaining backslashes
    speech = speech.replace(/\\/g, '');

    return speech;
}

module.exports = router;
