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
const { verify: pipelineVerify } = require('../utils/pipeline');
const { openai } = require('../utils/openaiClient');
const ttsProvider = require('../utils/ttsProvider');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger').child({ route: 'voice-tutor' });

const VOICE_MODEL = 'gpt-4o-mini';

// Map client MIME types to file extensions for Whisper API
const MIME_TO_EXT = {
  'audio/webm;codecs=opus': '.webm',
  'audio/webm': '.webm',
  'audio/mp4;codecs=opus': '.mp4',
  'audio/mp4;codecs=aac': '.mp4',
  'audio/mp4': '.mp4',
  'audio/ogg;codecs=opus': '.ogg',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/mpeg': '.mp3',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/3gpp': '.3gp',
  'audio/3gpp2': '.3gp',
  'audio/x-caf': '.caf',
};

/**
 * Resolve audio file extension from MIME type.
 * Tries exact match first, then strips codec params for a base-type match.
 */
function resolveAudioExt(mimeType) {
  if (!mimeType) return '.webm';
  if (MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
  const baseType = mimeType.split(';')[0].trim();
  return MIME_TO_EXT[baseType] || '.webm';
}

// Voice-specific system instructions appended to the base tutor prompt
const VOICE_TUTOR_INSTRUCTIONS = `

**VOICE TUTOR MODE — ACTIVE**

You are in an immersive, real-time voice conversation with a student. This is a hands-free, spoken math tutoring session.

YOU MUST RESPOND WITH A JSON OBJECT in this exact format:
{
  "spoken": "Your spoken response here (1-2 sentences, plain English, no LaTeX)",
  "mathSteps": [ ... array of step objects ... ]
}

CRITICAL RULES FOR THE "spoken" FIELD:
1. BREVITY IS ESSENTIAL — 1-2 sentences MAX. One thought, one question, move on.
2. Ask ONE follow-up question per turn
3. Be warm and natural — like a real tutor sitting next to the student
4. NEVER use LaTeX delimiters ($, $$, \\(, \\[) — use plain English. Say "x squared plus 3x" not "$x^2 + 3x$"
5. NEVER use markdown formatting (**, *, #)

CRITICAL RULES FOR THE "mathSteps" FIELD:
The student's math board ONLY updates from this field. If you omit it or leave it empty when math has been discussed, the board goes blank and the student loses all visual context.

Always include "mathSteps" as an array. Each element: { "label": "string", "latex": "LaTeX string", "explanation": "string (optional)" }

WHEN TO INCLUDE STEPS (non-empty array):
- ANY time math has been discussed (even if this reply is just encouragement)
- When confirming a correct step — all previous steps PLUS the new one
- When student is wrong — repeat the SAME steps (board stays unchanged)
- When asking "what's next?" — all steps completed so far

WHEN THE ARRAY MAY BE EMPTY []:
- ONLY if the entire conversation has been pure small talk with zero math

PEDAGOGICAL RULE — NEVER SPOIL:
The math board tracks ONLY what the student has derived or confirmed. Do NOT show steps the student hasn't worked through yet.

- Student states a problem → only the "Given" equation
- Student correctly identifies a step → add that step
- You ask "what's next?" → only steps completed so far (NOT the next step)
- Student gives WRONG answer → do NOT add it. Gently guide, keep board at last correct step.
- Student says "just show me" or "give me the answer" → NEVER comply. Use parallel problems, smaller hints, or scaffolding instead.

THE BOARD ACCUMULATES: The student's board keeps ALL work from the entire session. You only need to send steps for the CURRENT problem. Previous work stays on the board automatically. Start new problems with a fresh "Given" step.

ALSO INCLUDE STEPS FOR NON-EQUATION MATH: slopes, derivatives, tangent lines, graphs — anything visual.

Example responses:

Student says: "solve 2x minus 4 equals 0"
{"spoken": "Sure, let's work through this together! So we have 2x minus 4 equals 0. What should we do first to isolate x?", "mathSteps": [{"label": "Given", "latex": "2x - 4 = 0", "explanation": "Our starting equation"}]}

Student says: "add 4 to both sides"
{"spoken": "Exactly right! So now we have 2x equals 4. What's the next step to find x?", "mathSteps": [{"label": "Given", "latex": "2x - 4 = 0"}, {"label": "Add 4", "latex": "2x = 4", "explanation": "Add 4 to both sides"}]}

Student says: "multiply by 2" (WRONG — should divide)
{"spoken": "Hmm, not quite. We have 2 times x. To get x by itself, what's the opposite of multiplying by 2?", "mathSteps": [{"label": "Given", "latex": "2x - 4 = 0"}, {"label": "Add 4", "latex": "2x = 4"}]}

Student says: "divide by 2"
{"spoken": "That's it! x equals 2. Great job!", "mathSteps": [{"label": "Given", "latex": "2x - 4 = 0"}, {"label": "Add 4", "latex": "2x = 4"}, {"label": "Divide by 2", "latex": "x = 2", "explanation": "Divide both sides by 2"}]}

Student says: "now what about the slope between (1,3) and (4,9)"
{"spoken": "Good one! What's the formula for slope between two points?", "mathSteps": [{"label": "Points", "latex": "(1, 3) \\\\text{ and } (4, 9)"}, {"label": "Slope formula", "latex": "m = \\\\frac{y_2 - y_1}{x_2 - x_1}"}]}

Student says: "Great job!" (no math in this turn, but math was discussed earlier)
{"spoken": "Thanks! Want to try another problem?", "mathSteps": [{"label": "Given", "latex": "2x - 4 = 0"}, {"label": "Add 4", "latex": "2x = 4"}, {"label": "Divide by 2", "latex": "x = 2"}]}

REMEMBER: Always respond with valid JSON. The "mathSteps" array must be present in every response.
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
  // Bare math: catch undelimited notation (x^2, f(x), etc.)
  // Function notation: f(x) → "f of x", f'(x) → "f prime of x"
  cleaned = cleaned.replace(/\b([a-zA-Z])'\(([^)]+)\)/g, '$1 prime of $2');
  cleaned = cleaned.replace(/\b([a-zA-Z])\(([^)]{1,20})\)/g, '$1 of $2');
  // Equals sign: "x = 5" → "x equals 5"
  cleaned = cleaned.replace(/(\w)\s*=\s*(\w)/g, '$1 equals $2');
  // Caret exponents
  cleaned = cleaned.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
  cleaned = cleaned.replace(/\^2(?=\b|[^0-9]|$)/g, ' squared');
  cleaned = cleaned.replace(/\^3(?=\b|[^0-9]|$)/g, ' cubed');
  cleaned = cleaned.replace(/\^(\d+)/g, (_, n) => ` to the ${n}th power`);
  cleaned = cleaned.replace(/\^([a-zA-Z])/g, ' to the $1 power');
  cleaned = cleaned.replace(/_\{([^}]+)\}/g, ' sub $1');
  cleaned = cleaned.replace(/_(\d)/g, ' sub $1');
  cleaned = cleaned.replace(/[{}]/g, '');
  // Strip emoji
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');
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
        logger.warn('Failed to parse mathSteps block (even after fix)', { error: e.message });
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
  const { audio, mimeType } = req.body;
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
    const audioExt = resolveAudioExt(mimeType);
    const tempPath = path.join(tempDir, `vt_${userId}_${Date.now()}${audioExt}`);
    fs.writeFileSync(tempPath, audioBuffer);
    logger.debug('Audio received', { userId, bytes: audioBuffer.length, mimeType, audioExt });

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
      logger.info('Empty transcription', { userId, bytes: audioBuffer.length, mimeType });
      sendPhase({ phase: 'transcription', transcription: '' });
      sendPhase({ phase: 'response', response: "I didn't catch that. Could you try again?", mathSteps: [] });
      sendPhase({ phase: 'audio', audioUrl: null });
      return res.end();
    }

    // ── Send transcription immediately ──
    sendPhase({ phase: 'transcription', transcription: userMessage });

    // ── Step 2: Generate AI response (structured JSON — no tag dependency) ──
    const { spoken, mathSteps, raw: aiRaw } = await generateResponse(userId, userMessage, user);

    // ── Send text + math immediately ──
    sendPhase({ phase: 'response', response: spoken, mathSteps });

    // ── Step 3: TTS + history save in parallel ──
    const [audioUrl] = await Promise.all([
      generateTTS(userId, spoken, user).catch(err => {
        logger.warn('TTS failed', { userId, error: err.message });
        return null;
      }),
      saveToHistory(userId, userMessage, aiRaw)
    ]);

    // ── Send audio URL ──
    sendPhase({ phase: 'audio', audioUrl });
    res.end();

  } catch (err) {
    logger.error('Voice session error', { userId, error: err.message, stack: err.stack });
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
    const { spoken, mathSteps, raw: aiRaw } = await generateResponse(userId, text.trim());

    let audioUrl = null;
    if (ttsProvider.isConfigured()) {
      try {
        audioUrl = await generateTTS(userId, spoken);
      } catch (e) {
        logger.warn('TTS failed, continuing without audio', { userId, error: e.message });
      }
    }

    await saveToHistory(userId, text.trim(), aiRaw);

    res.json({
      response: spoken,
      audioUrl,
      mathSteps
    });

  } catch (err) {
    logger.error('Text session error', { userId, error: err.message });
    res.status(500).json({ error: 'Processing failed', message: 'Could not get a response. Please try again.' });
  }
});

// ═══════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════

/**
 * Generate a voice tutor response using structured JSON output.
 * Returns { spoken, mathSteps, raw } — no dependency on LLM tags.
 */
async function generateResponse(userId, userMessage, preloadedUser) {
  const user = preloadedUser || await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const TUTOR_CONFIG = require('../utils/tutorConfig');
  const selectedTutorId = user.selectedTutorId || 'default';
  const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

  // Get conversation history (last 12 messages for voice context)
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
    max_tokens: 600,
    response_format: { type: 'json_object' }
  });

  const rawContent = completion.choices[0].message.content.trim();
  let spoken = '';
  let mathSteps = [];

  // ── Primary path: parse structured JSON ──
  try {
    const parsed = JSON.parse(rawContent);
    spoken = (parsed.spoken || parsed.text || parsed.response || '').trim();
    if (Array.isArray(parsed.mathSteps)) {
      mathSteps = parsed.mathSteps.filter(s => s && s.latex);
    } else if (Array.isArray(parsed.math_steps)) {
      mathSteps = parsed.math_steps.filter(s => s && s.latex);
    } else if (Array.isArray(parsed.steps)) {
      mathSteps = parsed.steps.filter(s => s && s.latex);
    }
  } catch (e) {
    logger.warn('JSON parse failed, falling back to tag extraction', { error: e.message });
    // ── Fallback: old tag-based extraction ──
    mathSteps = extractMathSteps(rawContent);
    spoken = stripMathSteps(rawContent);
  }

  // ── Fallback: extract from spoken text if no steps found ──
  if (mathSteps.length === 0 && spoken) {
    mathSteps = extractMathFromSpokenText(spoken);
  }

  // ── Final fallback: recover from conversation history ──
  if (mathSteps.length === 0) {
    const lastSteps = await getLastMathSteps(userId);
    if (lastSteps.length > 0) mathSteps = lastSteps;
  }

  // If no spoken text was extracted, try to salvage from raw content
  if (!spoken) {
    // If rawContent is valid JSON (our structured format), don't read JSON aloud
    try {
      const obj = JSON.parse(rawContent);
      // Pull any string value that looks like speech
      spoken = obj.spoken || obj.text || obj.response || obj.message || '';
      if (!spoken) {
        // Last resort: find the first non-empty string value
        for (const val of Object.values(obj)) {
          if (typeof val === 'string' && val.trim().length > 10) {
            spoken = val.trim();
            break;
          }
        }
      }
    } catch (_) {
      // Not JSON — use raw text directly (old tag-based format)
      spoken = rawContent;
    }
    // If still empty, give a safe generic response rather than silence
    if (!spoken) spoken = "Let me think about that. Could you tell me more?";
  }

  // ── Pipeline verify (defense-in-depth) ──
  // Every student-facing response runs through verify to catch answer
  // giveaways, system-tag leaks, and reading-level violations. If verify
  // rewrites the spoken text (answer-giveaway redirected), drop the
  // mathSteps board content too — otherwise the visual still leaks the
  // solution the redirected speech avoided.
  try {
    const verified = await pipelineVerify(spoken, {
      userId: user._id?.toString(),
      userMessage,
      iepReadingLevel: user.iepPlan?.readingLevel || null,
      firstName: user.firstName,
      isStreaming: false,
    });
    if (verified.flags?.some(f => f.startsWith('answer_giveaway') || f.startsWith('answer_key') || f.startsWith('upload_'))) {
      logger.warn('Voice tutor: response redirected by verify', { userId: user._id?.toString(), flags: verified.flags });
      mathSteps = [];
    }
    spoken = verified.text || spoken;
  } catch (err) {
    logger.error('Voice tutor verify failed', { userId: user._id?.toString(), error: err.message });
  }

  // IEP reading level enforcement (operates on spoken text only)
  const iepReadingLevel = user.iepPlan?.readingLevel || null;
  if (iepReadingLevel) {
    const readCheck = checkReadingLevel(spoken, iepReadingLevel);
    if (!readCheck.passes) {
      logger.info('Reading level violation — simplifying', {
        userId: user._id?.toString(),
        responseGrade: readCheck.responseGrade,
        targetGrade: readCheck.targetGrade
      });
      try {
        const simplifyPrompt = buildSimplificationPrompt(spoken, readCheck.targetGrade, user.firstName || 'the student');
        const simplified = await callLLM(VOICE_MODEL, [{ role: 'system', content: simplifyPrompt }], {
          temperature: 0.3,
          max_tokens: 600
        });
        const simplifiedText = simplified.choices[0]?.message?.content?.trim();
        if (simplifiedText && simplifiedText.length > 20) {
          spoken = simplifiedText;
          logger.info('Response simplified', { userId: user._id?.toString(), targetGrade: readCheck.targetGrade });
        }
      } catch (err) {
        logger.error('Simplification failed', { userId: user._id?.toString(), error: err.message });
      }
    }
  }

  return { spoken, mathSteps, raw: rawContent };
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
  } catch (e) {
    // Best-effort cleanup; surface only at debug level so a transient
    // disk hiccup doesn't pollute warning channels.
    logger.debug('Voice audio cleanup failed (non-fatal)', { error: e.message });
  }

  return `/audio/voice/${filename}`;
}

/**
 * Extract math from natural-language spoken text (no tags or LaTeX needed).
 * Converts "2x minus 4 equals 0" → { latex: "2x - 4 = 0" }
 */
function extractMathFromSpokenText(text) {
  const steps = [];
  const seen = new Set();

  function addStep(latex, label) {
    const key = latex.replace(/\s+/g, '').trim();
    if (key.length > 2 && !seen.has(key)) {
      seen.add(key);
      steps.push(label ? { label, latex: latex.trim() } : { latex: latex.trim() });
    }
  }

  // Convert spoken math words to symbols
  let converted = text
    .replace(/\bequals?\b/gi, '=')
    .replace(/\bis equal to\b/gi, '=')
    .replace(/\bplus\b/gi, '+')
    .replace(/\bminus\b/gi, '-')
    .replace(/\btimes\b/gi, '\\cdot')
    .replace(/\bmultiplied by\b/gi, '\\cdot')
    .replace(/\bdivided by\b/gi, '/')
    .replace(/\bover\b/gi, '/')
    .replace(/\bsquared\b/gi, '^2')
    .replace(/\bcubed\b/gi, '^3')
    .replace(/\bto the (\w+) power\b/gi, (_, p) => `^{${p}}`)
    .replace(/\bsquare root of\b/gi, '\\sqrt{')
    .replace(/\bslope\b/gi, 'm');

  // Look for equations: anything with = sign and at least one variable or number
  const eqRegex = /\b([\d]*\s*[a-zA-Z][\w\s\^{}\\]*(?:\s*[+\-/\\·]\s*[\d]*\s*[a-zA-Z\d][\w\s\^{}\\]*)*\s*=\s*[\d\w\s+\-*/\\^{}.()]+)/g;
  let m;
  while ((m = eqRegex.exec(converted)) !== null) {
    let eq = m[1].trim()
      .replace(/\s+/g, ' ')
      .replace(/(\d)\s+([a-zA-Z])/g, '$1$2'); // "2 x" → "2x"
    if (/=/.test(eq) && eq.length < 120) {
      addStep(eq);
    }
  }

  // Also look for coordinate pairs: "(1, 3) and (4, 9)"
  const coordRegex = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)\s*(?:and|,)\s*\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/g;
  while ((m = coordRegex.exec(text)) !== null) {
    addStep(`(${m[1]}, ${m[2]}) \\text{ and } (${m[3]}, ${m[4]})`, 'Points');
  }

  return steps;
}

/**
 * Recover the last math steps from conversation history.
 * Scans recent assistant messages for <mathsteps> blocks.
 */
async function getLastMathSteps(userId) {
  try {
    const conversation = await Conversation.findOne({ userId })
      .sort({ updatedAt: -1 })
      .select({ messages: { $slice: -12 } })
      .lean();
    if (!conversation?.messages) return [];

    // Walk backwards through assistant messages to find the most recent mathsteps
    const assistantMsgs = conversation.messages
      .filter(m => m.role === 'assistant' && m.content)
      .reverse();

    for (const msg of assistantMsgs) {
      // Try JSON format first (new structured responses)
      try {
        const parsed = JSON.parse(msg.content);
        const steps = parsed.mathSteps || parsed.math_steps || parsed.steps;
        if (Array.isArray(steps) && steps.length > 0) {
          const valid = steps.filter(s => s && s.latex);
          if (valid.length > 0) return valid;
        }
      } catch (_) {
        // Not JSON — try legacy tag extraction
      }
      const steps = extractMathSteps(msg.content);
      if (steps.length > 0) return steps;
    }
  } catch (e) {
    logger.warn('Failed to recover last math steps', { error: e.message });
  }
  return [];
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
