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
const PRIMARY_CHAT_MODEL = "claude-3-5-sonnet-20241022";
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

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

    if (!audio) {
        return res.status(400).json({ error: 'Audio data is required' });
    }

    try {
        // ============================================
        // STEP 1: SPEECH-TO-TEXT (Whisper)
        // ============================================

        console.log('🎙️ [Voice] Processing audio from user:', userId);

        // Decode base64 audio
        const audioBuffer = Buffer.from(audio, 'base64');

        // Create temporary file for Whisper API
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempAudioPath = path.join(tempDir, `voice_${userId}_${Date.now()}.webm`);
        fs.writeFileSync(tempAudioPath, audioBuffer);

        console.log('📝 [Voice] Transcribing audio...');

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempAudioPath),
            model: 'whisper-1',
            language: 'en', // Can be auto-detected by omitting this
        });

        const userMessage = transcription.text;
        console.log('✅ [Voice] Transcription:', userMessage);

        // Clean up temp file
        fs.unlinkSync(tempAudioPath);

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
            .populate('selectedTutorId')
            .populate('parentId')
            .populate('skills')
            .lean();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

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

        // Generate system prompt
        const systemPrompt = await generateSystemPrompt(user, conversationHistory);
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
            ...conversationHistory.slice(-10).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            { role: 'user', content: userMessage }
        ];

        console.log('🤖 [Voice] Generating AI response...');

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messages, {
            temperature: 0.7,
            max_tokens: 1000 // Shorter for voice responses
        });

        let aiResponseText = completion.choices[0].message.content.trim();

        console.log('✅ [Voice] AI response:', aiResponseText);

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

        // ============================================
        // STEP 4: TEXT-TO-SPEECH (ElevenLabs with Tutor Voice)
        // ============================================

        console.log('🔊 [Voice] Generating speech with tutor voice...');

        // Get tutor's voice ID
        const tutorVoiceId = user.selectedTutorId?.voiceId || "2eFQnnNM32GDnZkCfkSm"; // Fallback to Mr. Nappier
        console.log(`🎤 [Voice] Using tutor voice: ${tutorVoiceId}`);

        if (!ELEVENLABS_API_KEY) {
            throw new Error('ElevenLabs API key not configured');
        }

        // Generate TTS audio using ElevenLabs
        const elevenLabsResponse = await retryWithExponentialBackoff(async () => {
            return await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${tutorVoiceId}`,
                {
                    text: aiResponseText,
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

        const audioData = Buffer.from(elevenLabsResponse.data);

        // Save audio file
        const audioDir = path.join(__dirname, '../public/audio/voice');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }

        const audioFilename = `voice_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
        const audioPath = path.join(audioDir, audioFilename);
        fs.writeFileSync(audioPath, audioData);

        const audioUrl = `/audio/voice/${audioFilename}`;

        console.log('✅ [Voice] Speech generated:', audioUrl);

        // ============================================
        // STEP 5: SAVE TO CONVERSATION HISTORY
        // ============================================

        // Save user message
        await Conversation.findOneAndUpdate(
            { userId },
            {
                $push: {
                    messages: {
                        role: 'user',
                        text: userMessage,
                        timestamp: new Date(),
                        isVoiceInput: true
                    }
                },
                $set: { updatedAt: new Date() }
            },
            { upsert: true }
        );

        // Save AI response
        await Conversation.findOneAndUpdate(
            { userId },
            {
                $push: {
                    messages: {
                        role: 'assistant',
                        text: aiResponseText,
                        timestamp: new Date(),
                        isVoiceOutput: true,
                        audioUrl: audioUrl
                    }
                },
                $set: { updatedAt: new Date() }
            }
        );

        // ============================================
        // STEP 6: RETURN RESPONSE
        // ============================================

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
        console.error('❌ [Voice] Error processing voice:', error);
        res.status(500).json({
            error: 'Failed to process voice input',
            message: error.message
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

module.exports = router;
