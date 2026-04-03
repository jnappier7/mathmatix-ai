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
const { checkReadingLevel, buildSimplificationPrompt } = require('../utils/readability');
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
1. BREVITY IS ESSENTIAL — keep spoken text to 1-2 sentences MAX. This is a real-time voice conversation, not a lecture. If you write more than 2 sentences of spoken text, the student will zone out waiting for you to finish. One thought, one question, move on.
2. Ask ONE follow-up question per turn — don't explain AND ask AND elaborate
3. Be warm and natural — like a real tutor sitting next to the student
4. NEVER use LaTeX delimiters ($, $$, \(, \[) in your spoken text — use plain English only. The math board handles visual math. Say "x squared plus 3x" not "$x^2 + 3x$"
5. NEVER use markdown formatting (**, *, #) in spoken text

MATH STEPS — ABSOLUTELY MANDATORY, NEVER SKIP:
You MUST include a <mathsteps> block in EVERY response. The student's visual math board ONLY updates when you include <mathsteps>. If you omit it, the board goes BLANK and the student loses all visual context. This is the #1 most important rule.

WHEN TO INCLUDE <mathsteps>:
- ANY time math has been discussed in the conversation (even if this specific reply is encouragement like "Great job!" — still include the current board state)
- When confirming a correct step — include ALL previous steps PLUS the new one
- When the student is wrong — repeat the SAME steps as last time (board stays unchanged)
- When asking "what's next?" — include all steps completed so far

WHEN YOU MAY SKIP <mathsteps>:
- ONLY if the entire conversation so far has been pure small talk with absolutely zero math (e.g., "Hi, how are you?")

PEDAGOGICAL RULE — NEVER SPOIL:
The math board is a WHITEBOARD that tracks ONLY what the student has derived or confirmed. Do NOT show steps the student hasn't worked through yet. The board should reflect the student's progress, not the answer.

- When the student states a problem → show ONLY the "Given" equation
- When the student correctly identifies a step → add that step to the board
- When you ASK "what should we do next?" → show only the steps completed SO FAR (do not show the next step)
- When the student gives a WRONG answer → do NOT add it to the board. Gently guide them, keeping the board at the last correct step.
- When you CONFIRM the student's correct answer → add that step

If the student asks you to "just show me", "solve it for me", or "give me the answer", NEVER comply. You are a tutor, not a calculator. Instead, use one of these strategies:
- **Parallel problem**: Pose a simpler version of the same type. "OK let's try an easier one first — if 3x = 9, how would you find x?" Once they solve the parallel, circle back: "Now apply that same idea to our problem."
- **Smaller hint**: Break it down. "Look at what's multiplying x. What's the opposite of that operation?"
- **Scaffold**: Partially set up the step. "We need to get x alone. We have 2 times x. So we should _____ both sides by _____."
Always guide, never give away. If the student is truly stuck after multiple attempts, use parallel problems to build up the skill before returning to the original.

FORMAT: JSON array wrapped in <mathsteps>...</mathsteps> tags.
Each step: { "label": string (optional), "latex": LaTeX string, "explanation": string (optional) }

Show the FULL progression of completed steps — not just the latest one. Include all steps from the beginning of the current problem so the student sees their complete work.

Example conversation:
Student says: "solve 2x minus 4 equals 0"
Your response:
Sure, let's work through this together! So we have 2x minus 4 equals 0. What should we do first to isolate x?
<mathsteps>[
  {"label": "Given", "latex": "2x - 4 = 0", "explanation": "Our starting equation"}
]</mathsteps>

Student says: "add 4 to both sides"
Your response:
Exactly right! So now we have 2x equals 4. What's the next step to find x?
<mathsteps>[
  {"label": "Given", "latex": "2x - 4 = 0"},
  {"label": "Add 4", "latex": "2x = 4", "explanation": "Add 4 to both sides"}
]</mathsteps>

Student says: "multiply by 2" (WRONG — should divide)
Your response:
Hmm, not quite. We have 2 times x. To get x by itself, what's the opposite of multiplying by 2?
<mathsteps>[
  {"label": "Given", "latex": "2x - 4 = 0"},
  {"label": "Add 4", "latex": "2x = 4"}
]</mathsteps>

Notice: the board did NOT change because the student was wrong. No new step was added.

Student says: "oh divide by 2"
Your response:
That's it! x equals 2. Great job working through that!
<mathsteps>[
  {"label": "Given", "latex": "2x - 4 = 0"},
  {"label": "Add 4", "latex": "2x = 4"},
  {"label": "Divide by 2", "latex": "x = 2", "explanation": "Divide both sides by 2"}
]</mathsteps>

FINAL REMINDER — READ THIS CAREFULLY:
The math board is the student's primary visual aid. EVERY response MUST include <mathsteps> if ANY math has been discussed at ANY point in the conversation. When in doubt, INCLUDE IT. Repeating the same steps is fine — omitting them blanks the board and confuses the student. This is non-negotiable.
`;

/**
 * Convert LaTeX math notation to natural speech
 */
function convertLatexToSpeech(latex) {
  let speech = latex;
  speech = speech.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');
  speech = speech.replace(/\^2\b/g, ' squared');
  speech = speech.replace(/\^3\b/g, ' cubed');
  speech = speech.replace(/\^(\d+)/g, ' to the $1th power');
  speech = speech.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
  speech = speech.replace(/\^([a-zA-Z])/g, ' to the $1');
  speech = speech.replace(/_\{([^}]+)\}/g, ' sub $1');
  speech = speech.replace(/_([a-zA-Z0-9])/g, ' sub $1');
  speech = speech.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');
  speech = speech.replace(/\\alpha/g, 'alpha');
  speech = speech.replace(/\\beta/g, 'beta');
  speech = speech.replace(/\\gamma/g, 'gamma');
  speech = speech.replace(/\\delta/g, 'delta');
  speech = speech.replace(/\\theta/g, 'theta');
  speech = speech.replace(/\\pi/g, 'pi');
  speech = speech.replace(/\\sigma/g, 'sigma');
  speech = speech.replace(/\\times/g, ' times ');
  speech = speech.replace(/\\div/g, ' divided by ');
  speech = speech.replace(/\\pm/g, ' plus or minus ');
  speech = speech.replace(/\\cdot/g, ' times ');
  speech = speech.replace(/\\leq/g, ' less than or equal to ');
  speech = speech.replace(/\\geq/g, ' greater than or equal to ');
  speech = speech.replace(/\\neq/g, ' not equal to ');
  speech = speech.replace(/\\approx/g, ' approximately ');
  speech = speech.replace(/=/g, ' equals ');
  speech = speech.replace(/[{}]/g, '');
  speech = speech.replace(/\\/g, '');
  return speech;
}

/**
 * Clean text for TTS — remove markdown, convert LaTeX to speech
 */
function cleanForTTS(text) {
  let cleaned = text;
  // Remove mathsteps blocks
  cleaned = cleaned.replace(/<mathsteps>[\s\S]*?<\/mathsteps>/g, '');
  // Remove markdown headers
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  // Remove markdown bold/italic
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  // Remove markdown links
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  // Remove horizontal rules
  cleaned = cleaned.replace(/^[-*]{3,}$/gm, '');
  // Convert LaTeX to speech (display math)
  cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, (_, latex) => convertLatexToSpeech(latex));
  // Convert LaTeX to speech (inline math)
  cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, (_, latex) => convertLatexToSpeech(latex));
  cleaned = cleaned.replace(/\$([^$]+)\$/g, (_, latex) => convertLatexToSpeech(latex));
  // Remove any remaining backslashes (LaTeX commands)
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Extract ALL math steps blocks from AI response
 */
function extractMathSteps(text) {
  const blocks = [];
  const regex = /<mathsteps>([\s\S]*?)<\/mathsteps>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      }
    } catch (e) {
      // Try to fix common JSON issues from LLM output
      let raw = match[1].trim();
      try {
        // Fix trailing commas before ] or }
        raw = raw.replace(/,\s*([}\]])/g, '$1');
        // Fix single quotes to double quotes
        raw = raw.replace(/'/g, '"');
        const retried = JSON.parse(raw);
        if (Array.isArray(retried)) {
          blocks.push(...retried);
        }
      } catch (_) {
        console.warn('[VoiceTutor] Failed to parse mathSteps block (even after fix):', e.message);
      }
    }
  }

  // FALLBACK: If no <mathsteps> blocks found, try to extract LaTeX from the response
  if (blocks.length === 0) {
    const latexPatterns = [
      /\$\$([^$]+)\$\$/g,       // $$...$$
      /\\\[([^\]]+)\\\]/g,      // \[...\]
      /\$([^$]+)\$/g,           // $...$
    ];
    for (const pattern of latexPatterns) {
      let latexMatch;
      while ((latexMatch = pattern.exec(text)) !== null) {
        const latex = latexMatch[1].trim();
        if (latex.length > 2 && /[=+\-*/^_{}\\]/.test(latex)) {
          blocks.push({ label: '', latex });
        }
      }
      if (blocks.length > 0) break;
    }
  }

  return blocks;
}

/**
 * Strip mathsteps tags from response text, then remove any LaTeX delimiters
 * the LLM may have used in spoken text (math belongs on the board, not in speech)
 */
function stripMathSteps(text) {
  let clean = text.replace(/<mathsteps>[\s\S]*?<\/mathsteps>/g, '').trim();
  // Strip LaTeX delimiters but keep the content (e.g. "$x^2$" → "x^2")
  clean = clean.replace(/\$\$(.+?)\$\$/gs, '$1');
  clean = clean.replace(/\\\[(.+?)\\\]/gs, '$1');
  clean = clean.replace(/\\\((.+?)\\\)/g, '$1');
  clean = clean.replace(/\$([^$]+?)\$/g, '$1');
  return clean;
}

/**
 * Check if user is under 13 (third-party TTS compliance)
 */
function isUnder13(user) {
  if (!user || !user.dateOfBirth) return false;
  const age = (Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age < 13;
}

// ═══════════════════════════════════════
// POST /api/voice-tutor/process
// Streaming voice pipeline: sends NDJSON phases as each stage completes
// Phase 1: { phase: "transcription", transcription }     — instant feedback
// Phase 2: { phase: "response", response, mathSteps }    — text + math rendered immediately
// Phase 3: { phase: "audio", audioUrl }                  — audio plays when ready
// ═══════════════════════════════════════
router.post('/process', isAuthenticated, async (req, res) => {
  const { audio } = req.body;
  const userId = req.user._id;

  if (!audio) {
    return res.status(400).json({ error: 'Audio data is required' });
  }

  if (audio.length > 10_000_000) {
    return res.status(413).json({ error: 'Audio file too large' });
  }

  if (!ttsProvider.isConfigured()) {
    return res.status(503).json({ error: 'Voice not configured', message: 'Text-to-speech service is not configured.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Voice not configured', message: 'Speech recognition service is not configured.' });
  }

  if (isUnder13(req.user)) {
    return res.status(403).json({ error: 'Voice unavailable for your account', useWebSpeech: true });
  }

  // Switch to NDJSON streaming — each line is a JSON object
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  function sendPhase(data) {
    res.write(JSON.stringify(data) + '\n');
    // Flush if available (works with compression middleware)
    if (res.flush) res.flush();
  }

  try {
    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audio, 'base64');
    } catch (e) {
      sendPhase({ phase: 'error', message: 'Invalid audio format' });
      return res.end();
    }

    // ── Step 1: Transcribe with Whisper (parallel: fetch user data) ──
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `vt_${userId}_${Date.now()}.webm`);
    fs.writeFileSync(tempPath, audioBuffer);

    const langMap = {
      'English': 'en', 'Spanish': 'es', 'Russian': 'ru', 'Chinese': 'zh',
      'Vietnamese': 'vi', 'Arabic': 'ar', 'Somali': 'so', 'French': 'fr', 'German': 'de'
    };

    // Run Whisper + user data fetch in parallel
    const [transcription, user] = await Promise.all([
      openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: langMap[req.user.preferredLanguage] || 'en',
      }).finally(() => {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }),
      User.findById(userId).lean()
    ]);

    const userMessage = transcription.text;
    if (!userMessage || userMessage.trim().length === 0) {
      sendPhase({ phase: 'transcription', transcription: '' });
      sendPhase({ phase: 'response', response: "I didn't catch that. Could you try again?", mathSteps: [] });
      return res.end();
    }

    // ── Send transcription immediately ──
    sendPhase({ phase: 'transcription', transcription: userMessage });

    // ── Step 2: Generate AI response ──
    const aiResponse = await generateResponse(userId, userMessage, user);

    const mathSteps = extractMathSteps(aiResponse);
    const cleanResponse = stripMathSteps(aiResponse);

    // ── Send text + math immediately ──
    sendPhase({ phase: 'response', response: cleanResponse, mathSteps });

    // ── Step 3: TTS + history save in parallel ──
    const [audioUrl] = await Promise.all([
      generateTTS(userId, cleanResponse, user).catch(err => {
        console.warn('[VoiceTutor] TTS failed:', err.message);
        return null;
      }),
      saveToHistory(userId, userMessage, aiResponse)
    ]);

    // ── Send audio URL ──
    sendPhase({ phase: 'audio', audioUrl });
    res.end();

  } catch (err) {
    console.error('[VoiceTutor] Error:', err.message, err.stack);
    let message = 'Something went wrong. Please try again.';
    if (err.message.includes('Whisper') || err.message.includes('transcription')) {
      message = 'Speech recognition failed. Please try speaking again.';
    } else if (err.message.includes('TTS') || err.message.includes('voice')) {
      message = 'Voice synthesis failed. Please try again.';
    }
    sendPhase({ phase: 'error', message });
    res.end();
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

  if (text.length > 5000) {
    return res.status(400).json({ error: 'Message too long' });
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

    // Save full response (with mathsteps) so the AI can track board state
    await saveToHistory(userId, text.trim(), aiResponse);

    res.json({
      response: cleanResponse,
      audioUrl,
      mathSteps
    });

  } catch (err) {
    console.error('[VoiceTutor] Text error:', err.message);
    res.status(500).json({ error: 'Processing failed', message: 'Could not get a response. Please try again.' });
  }
});

// ═══════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════

async function generateResponse(userId, userMessage, preloadedUser) {
  const user = preloadedUser || await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const TUTOR_CONFIG = require('../utils/tutorConfig');
  const selectedTutorId = user.selectedTutorId || 'default';
  const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

  // Get conversation history (last 12 messages for voice context)
  // Use projection to only fetch the messages we need, not the entire conversation
  const conversation = await Conversation.findOne({ userId })
    .sort({ updatedAt: -1 })
    .select({ messages: { $slice: -12 } })
    .lean();
  const history = (conversation?.messages || [])
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
    temperature: 0.45,
    max_tokens: 600
  });

  let responseText = completion.choices[0].message.content.trim();

  // IEP reading level enforcement
  const iepReadingLevel = user.iepPlan?.readingLevel || null;
  if (iepReadingLevel) {
    const readCheck = checkReadingLevel(responseText, iepReadingLevel);
    if (!readCheck.passes) {
      console.log(
        `[VoiceTutor] Reading level violation for ${user.firstName}: ` +
        `response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
      );
      try {
        const simplifyPrompt = buildSimplificationPrompt(responseText, readCheck.targetGrade, user.firstName || 'the student');
        const simplified = await callLLM(VOICE_MODEL, [{ role: 'system', content: simplifyPrompt }], {
          temperature: 0.3,
          max_tokens: 600
        });
        const simplifiedText = simplified.choices[0]?.message?.content?.trim();
        if (simplifiedText && simplifiedText.length > 20) {
          responseText = simplifiedText;
          console.log(`[VoiceTutor] Response simplified to target Grade ${readCheck.targetGrade}`);
        }
      } catch (err) {
        console.error('[VoiceTutor] Simplification failed:', err.message);
      }
    }
  }

  return responseText;
}

async function generateTTS(userId, responseText, preloadedUser) {
  const user = preloadedUser || await User.findById(userId).select('selectedTutorId').lean();
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
