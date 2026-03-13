// routes/voiceTutor.js
// Dedicated voice tutor session endpoint — powers the immersive voice-tutor.html experience
// Handles: audio transcription, AI response, math step extraction, TTS synthesis

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require('../utils/llmGateway');
const { openai } = require('../utils/openaiClient');
const ttsProvider = require('../utils/ttsProvider');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VOICE_MODEL = 'gpt-4o-mini';

// Voice-specific system instructions appended to the base tutor prompt
const VOICE_TUTOR_INSTRUCTIONS = `

**VOICE TUTOR MODE — ACTIVE**

You are in an immersive, real-time voice conversation with a student. This is a hands-free, spoken math tutoring session.

CRITICAL RULES FOR VOICE MODE:
1. Keep responses SHORT and conversational (1-3 sentences of spoken text)
2. Ask follow-up questions to keep the conversation flowing
3. After explaining a concept, check understanding: "Does that make sense?" or "Want me to show another example?"
4. When showing math work, provide it in the mathSteps JSON format described below
5. Be warm, encouraging, and natural — like a real tutor sitting next to the student
6. Never use markdown formatting in your spoken text — plain English only
7. When you reference math in your spoken response, say it naturally: "x squared plus 3x equals zero" not "x^2 + 3x = 0"

MATH STEPS FORMAT:
When you work through a math problem, include a JSON block wrapped in <mathsteps>...</mathsteps> tags.
Each step is an object with: label (optional string), latex (LaTeX string), explanation (optional string).

Example:
<mathsteps>[
  {"label": "Given", "latex": "2x + 5 = 13", "explanation": "Start with the equation"},
  {"label": "Subtract 5", "latex": "2x = 8", "explanation": "Subtract 5 from both sides"},
  {"label": "Divide by 2", "latex": "x = 4", "explanation": "Divide both sides by 2"}
]</mathsteps>

Only include mathSteps when actually working through a problem. For general conversation, skip them entirely.
Your spoken response (the text outside the mathsteps tags) should reference what's shown: "So if we subtract 5 from both sides, we get 2x equals 8. Then dividing by 2 gives us x equals 4."
`;

/**
 * Clean text for TTS — remove markdown, LaTeX syntax, etc.
 */
function cleanForTTS(text) {
  let cleaned = text;
  // Remove mathsteps blocks
  cleaned = cleaned.replace(/<mathsteps>[\s\S]*?<\/mathsteps>/g, '');
  // Remove markdown
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  // Remove LaTeX display/inline
  cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, '');
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, '');
  cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, '');
  cleaned = cleaned.replace(/\$([^$]+)\$/g, '');
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Extract math steps from AI response
 */
function extractMathSteps(text) {
  const match = text.match(/<mathsteps>([\s\S]*?)<\/mathsteps>/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    console.warn('[VoiceTutor] Failed to parse mathSteps:', e.message);
    return [];
  }
}

/**
 * Strip mathsteps tags from response text
 */
function stripMathSteps(text) {
  return text.replace(/<mathsteps>[\s\S]*?<\/mathsteps>/g, '').trim();
}

/**
 * Check if user is under 13 (ElevenLabs compliance)
 */
function isUnder13(user) {
  if (!user || !user.dateOfBirth) return false;
  const age = (Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age < 13;
}

// ═══════════════════════════════════════
// POST /api/voice-tutor/process
// Full voice pipeline: Whisper → LLM → TTS
// ═══════════════════════════════════════
router.post('/process', isAuthenticated, async (req, res) => {
  const { audio } = req.body;
  const userId = req.user._id;

  if (!audio) {
    return res.status(400).json({ error: 'Audio data is required' });
  }

  if (isUnder13(req.user)) {
    return res.status(403).json({
      error: 'Voice unavailable for your account',
      useWebSpeech: true
    });
  }

  try {
    // ── Step 1: Transcribe with Whisper ──
    const audioBuffer = Buffer.from(audio, 'base64');
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempPath = path.join(tempDir, `vt_${userId}_${Date.now()}.webm`);
    fs.writeFileSync(tempPath, audioBuffer);

    // Get user's language preference
    const userLangPref = await User.findById(userId).select('preferredLanguage').lean();
    const langMap = {
      'English': 'en', 'Spanish': 'es', 'Russian': 'ru', 'Chinese': 'zh',
      'Vietnamese': 'vi', 'Arabic': 'ar', 'Somali': 'so', 'French': 'fr', 'German': 'de'
    };
    const whisperLang = langMap[userLangPref?.preferredLanguage] || 'en';

    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: whisperLang,
      });
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }

    const userMessage = transcription.text;
    if (!userMessage || userMessage.trim().length === 0) {
      return res.json({
        transcription: '',
        response: "I didn't catch that. Could you try again?",
        audioUrl: null,
        mathSteps: []
      });
    }

    // ── Step 2: Generate AI response ──
    const aiResponse = await generateResponse(userId, userMessage);

    // ── Step 3: Extract math steps and clean response ──
    const mathSteps = extractMathSteps(aiResponse);
    const cleanResponse = stripMathSteps(aiResponse);

    // ── Step 4: Generate TTS ──
    const audioUrl = await generateTTS(userId, cleanResponse);

    // ── Step 5: Save to conversation history ──
    await saveToHistory(userId, userMessage, cleanResponse);

    res.json({
      transcription: userMessage,
      response: cleanResponse,
      audioUrl,
      mathSteps
    });

  } catch (err) {
    console.error('[VoiceTutor] Error:', err);
    res.status(500).json({
      error: 'Voice processing failed',
      message: err.message
    });
  }
});

// ═══════════════════════════════════════
// POST /api/voice-tutor/process-text
// Text input fallback (typed messages)
// ═══════════════════════════════════════
router.post('/process-text', isAuthenticated, async (req, res) => {
  const { text } = req.body;
  const userId = req.user._id;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const aiResponse = await generateResponse(userId, text.trim());
    const mathSteps = extractMathSteps(aiResponse);
    const cleanResponse = stripMathSteps(aiResponse);

    let audioUrl = null;
    if (ttsProvider.isConfigured()) {
      try {
        audioUrl = await generateTTS(userId, cleanResponse);
      } catch (e) {
        console.warn('[VoiceTutor] TTS failed, continuing without audio:', e.message);
      }
    }

    await saveToHistory(userId, text.trim(), cleanResponse);

    res.json({
      response: cleanResponse,
      audioUrl,
      mathSteps
    });

  } catch (err) {
    console.error('[VoiceTutor] Text error:', err);
    res.status(500).json({ error: 'Processing failed', message: err.message });
  }
});

// ═══════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════

async function generateResponse(userId, userMessage) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const TUTOR_CONFIG = require('../utils/tutorConfig');
  const selectedTutorId = user.selectedTutorId || 'default';
  const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

  // Get conversation history (last 12 messages for voice context)
  const conversation = await Conversation.findOne({ userId })
    .sort({ updatedAt: -1 })
    .lean();
  const history = (conversation?.messages || []).slice(-12)
    .filter(msg => msg.content && msg.content.trim().length > 0)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

  const systemPrompt = await generateSystemPrompt(user, tutorProfile);

  const messages = [
    { role: 'system', content: systemPrompt + VOICE_TUTOR_INSTRUCTIONS },
    ...history,
    { role: 'user', content: userMessage }
  ];

  const completion = await callLLM(VOICE_MODEL, messages, {
    temperature: 0.7,
    max_tokens: 1200
  });

  return completion.choices[0].message.content.trim();
}

async function generateTTS(userId, responseText) {
  const user = await User.findById(userId).select('selectedTutorId').lean();
  const TUTOR_CONFIG = require('../utils/tutorConfig');
  const selectedTutorId = user?.selectedTutorId || 'default';
  const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

  const ttsText = cleanForTTS(responseText);
  if (!ttsText) return null;

  const voiceId = ttsProvider.getVoiceId(tutorProfile);
  if (!voiceId) throw new Error(`No voice configured for tutor: ${selectedTutorId}`);

  const audioData = await ttsProvider.generateAudio(ttsText, voiceId);

  const audioDir = path.join(__dirname, '../public/audio/voice');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ext = ttsProvider.getFileExtension();
  const filename = `vt_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const audioPath = path.join(audioDir, filename);
  fs.writeFileSync(audioPath, audioData);

  // Cleanup old files (keep last 50)
  try {
    const files = fs.readdirSync(audioDir)
      .filter(f => f.startsWith('vt_'))
      .map(f => ({ name: f, path: path.join(audioDir, f), mtime: fs.statSync(path.join(audioDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    for (let i = 50; i < files.length; i++) {
      fs.unlinkSync(files[i].path);
    }
  } catch (e) { /* cleanup is best-effort */ }

  return `/audio/voice/${filename}`;
}

async function saveToHistory(userId, userMessage, aiResponse) {
  const messagesToPush = [];
  if (userMessage) {
    messagesToPush.push({ role: 'user', content: userMessage.trim(), timestamp: new Date() });
  }
  if (aiResponse) {
    messagesToPush.push({ role: 'assistant', content: aiResponse.trim(), timestamp: new Date() });
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
}

module.exports = router;
