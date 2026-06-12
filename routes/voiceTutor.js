// routes/voiceTutor.js
// Dedicated voice tutor session endpoint — powers the immersive voice-tutor.html experience
// Handles: audio transcription, AI response, math step extraction, TTS synthesis

const express = require('express');
const router = express.Router();
const { WebSocketServer } = require('ws');
const multer = require('multer');
const sharp = require('sharp');
const pdfOcr = require('../utils/pdfOcr');
const { validateUpload } = require('../middleware/uploadSecurity');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require('../utils/llmGateway');
const { checkReadingLevel, buildSimplificationPrompt } = require('../utils/readability');
const { verify: pipelineVerify } = require('../utils/pipeline');
const { openai } = require('../utils/openaiClient');
const ttsProvider = require('../utils/ttsProvider');
const { createVoiceSession } = require('../utils/voiceSession');
const voiceMetrics = require('../utils/voiceMetrics');
const orchestrator = require('../utils/orchestrator');
const { loadOrCreatePlan, resolveCurrentTarget } = require('../utils/tutorPlanManager');
const { loadActiveHistory, appendToActiveConversation } = require('../utils/activeConversation');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger').child({ route: 'voice-tutor' });

// Multer for voice-tutor file uploads — disk storage matches chat.js
const ALLOWED_UPLOAD_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const vtUpload = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only images (JPG, PNG, WEBP) and PDFs are allowed.'), false);
  }
});

// Run multer only on multipart requests; JSON requests pass through unchanged.
const conditionalVtUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    vtUpload.any()(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large (max 10MB per file).' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      next();
    });
  } else {
    next();
  }
};
const conditionalVtValidate = (req, res, next) => {
  if (req.files && req.files.length > 0) validateUpload(req, res, next);
  else next();
};

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
6. SPELL OUT MATH IN WORDS so text-to-speech reads it correctly:
   - "3y minus 2 equals 24" — NOT "3y-2=24"
   - "two x plus 5" — NOT "2x+5"
   - "x squared" — NOT "x^2"
   - Always insert a space between a number and a variable ("3 y", not "3y")
   - Use "equals", "plus", "minus", "times", "over", "squared", "cubed" instead of symbols
7. NEVER emit bracketed directives like [DIAGRAM:...], [ALGEBRA_TILES:...], [FUNCTION_GRAPH:...], [WHITEBOARD_WRITE:...], [STEPS], etc. in "spoken". Those are chat-mode tags and DO NOT WORK in voice mode. Visuals go through "mathSteps" only. If a visual is needed, add a visual step to "mathSteps" (schema below) — do NOT mention or reference the tag form in speech.

CRITICAL RULES FOR THE "mathSteps" FIELD:
The student's math board ONLY updates from this field. If you omit it or leave it empty when math has been discussed, the board goes blank and the student loses all visual context.

Always include "mathSteps" as an array. Each element is ONE of these shapes:
- LaTeX step:    { "label": "string", "latex": "LaTeX string", "explanation": "string (optional)" }
- Visual step:   { "label": "string", "visual": { "kind": "<visual_kind>", ...params } }
- Text step:     { "label": "string", "text": "plain text" }

SUPPORTED visual.kind values (use these EXACTLY — anything else won't render):
- "algebra_tiles"  — params: { "expression": "x^2-10x+25" }
- "function_graph" — params: { "function": "x^2", "xMin": -5, "xMax": 5 }
- "number_line"    — params: { "min": -5, "max": 5, "point": 2 }
- "fraction"       — params: { "numerator": 1, "denominator": 2 }
- "unit_circle"    — params: { "angle": 60 }
- "points_plot"    — params: { "points": [[1,3],[4,9]] }

When to use a visual step: when a manipulative or graph would help the student see the structure (factoring with tiles, slope on a coordinate plane, fractions, etc.). Add it as ONE element in mathSteps alongside the LaTeX steps — do NOT replace the LaTeX steps with it.

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

Student says: "Can you show me x squared minus 10 x plus 25 with algebra tiles?"
{"spoken": "Sure — here's that perfect square laid out with tiles. What do you notice about the shape?", "mathSteps": [{"label": "Given", "latex": "x^2 - 10x + 25"}, {"label": "Algebra Tiles", "visual": {"kind": "algebra_tiles", "expression": "x^2-10x+25"}}]}

REMEMBER: Always respond with valid JSON. The "mathSteps" array must be present in every response. Bracketed directives in "spoken" are forbidden — use visual steps in "mathSteps" instead.
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
  // Insert space between digit and variable so TTS doesn't slur "3y" into "three-ey"
  speech = speech.replace(/(\d)([a-zA-Z])/g, '$1 $2');
  speech = speech.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  return speech;
}

/**
 * Normalize bare math notation in plain text (no LaTeX delimiters) so TTS
 * pronounces it naturally. Handles digit-letter glue ("3y" → "3 y"),
 * comparison operators, and arithmetic symbols between alphanumerics.
 */
function normalizeBareMathForSpeech(text) {
  let out = text;
  // Multi-char comparison operators first (longest match wins)
  out = out.replace(/<=|≤/g, ' less than or equal to ');
  out = out.replace(/>=|≥/g, ' greater than or equal to ');
  out = out.replace(/!=|≠/g, ' not equal to ');
  out = out.replace(/≈/g, ' approximately ');
  out = out.replace(/±/g, ' plus or minus ');
  // Arithmetic operators: convert only when at least one side is a digit
  // (skip hyphenated words like "well-known", sentence dashes, em-dashes,
  // and "x + y" prose unless it's recognizable math). Allow optional spaces.
  // Equals — fairly safe: only between alphanumeric on both sides.
  out = out.replace(/([0-9A-Za-z\)\]])\s*=\s*([0-9A-Za-z\(\[\-+])/g, '$1 equals $2');
  // Minus — require a digit adjacent to avoid mangling "well-known".
  out = out.replace(/(\d)\s*-\s*([0-9A-Za-z\(\[])/g, '$1 minus $2');
  out = out.replace(/([A-Za-z\)\]])\s*-\s*(\d)/g, '$1 minus $2');
  // Plus — require a digit adjacent.
  out = out.replace(/(\d)\s*\+\s*([0-9A-Za-z\(\[])/g, '$1 plus $2');
  out = out.replace(/([A-Za-z\)\]])\s*\+\s*(\d)/g, '$1 plus $2');
  // Times — explicit math symbols are always safe; bare "*" between alphanumerics
  out = out.replace(/([0-9A-Za-z\)\]])\s*\*\s*([0-9A-Za-z\(\[])/g, '$1 times $2');
  out = out.replace(/([0-9A-Za-z\)\]])\s*[×·]\s*([0-9A-Za-z\(\[])/g, '$1 times $2');
  // Division: numeric fractions only (avoid URLs and file paths)
  out = out.replace(/(\d)\s*\/\s*(\d)/g, '$1 over $2');
  out = out.replace(/÷/g, ' divided by ');
  // Stragglers — bare "=" at boundaries (e.g. " =24" or "x= 24")
  out = out.replace(/=/g, ' equals ');
  // Digit-letter glue and letter-digit glue (3y → "3 y", y3 → "y 3")
  out = out.replace(/(\d)([a-zA-Z])/g, '$1 $2');
  out = out.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  return out;
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
  // Caret exponents — convert before normalizing operators so "x^2 + 3"
  // becomes "x squared plus 3" rather than tripping the bare-minus rule.
  cleaned = cleaned.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
  cleaned = cleaned.replace(/\^2(?=\b|[^0-9]|$)/g, ' squared');
  cleaned = cleaned.replace(/\^3(?=\b|[^0-9]|$)/g, ' cubed');
  cleaned = cleaned.replace(/\^(\d+)/g, (_, n) => ` to the ${n}th power`);
  cleaned = cleaned.replace(/\^([a-zA-Z])/g, ' to the $1 power');
  cleaned = cleaned.replace(/_\{([^}]+)\}/g, ' sub $1');
  cleaned = cleaned.replace(/_(\d)/g, ' sub $1');
  cleaned = cleaned.replace(/[{}]/g, '');
  // Normalize bare arithmetic so TTS speaks "3 y minus 2 equals 24"
  // instead of "three-ey minus 2 equal sign twenty four".
  cleaned = normalizeBareMathForSpeech(cleaned);
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
    // Persist the spoken text only — NOT the raw JSON/<math> blob. The
    // board state lives client-side and gets serialized at end-session.
    // Storing raw JSON pollutes the chat tutor's later context.
    const [audioUrl] = await Promise.all([
      generateTTS(userId, spoken, user).catch(err => {
        logger.warn('TTS failed', { userId, error: err.message });
        return null;
      }),
      saveToHistory(userId, userMessage, spoken)
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
router.post('/process-text', isAuthenticated, conditionalVtUpload, conditionalVtValidate, async (req, res) => {
  const userId = req.user._id;
  const rawText = (req.body && req.body.text) || '';
  const uploadedFiles = req.files || [];
  const hasFiles = uploadedFiles.length > 0;

  if (!rawText.trim() && !hasFiles) {
    return res.status(400).json({ error: 'Text or file is required' });
  }

  if (rawText.length > 5000) {
    // Clean up files before bailing out
    uploadedFiles.forEach(f => { if (f.path) try { fs.unlinkSync(f.path); } catch (_) {} });
    return res.status(400).json({ error: 'Message too long' });
  }

  // ── Process attached files: extract PDF text + build image content blocks ──
  let combinedText = rawText.trim() || (hasFiles ? 'Can you help me with this?' : '');
  let imageContents = [];
  let pdfTexts = [];

  if (hasFiles) {
    try {
      const fileResults = await Promise.all(uploadedFiles.map(async (file) => {
        if (file.mimetype === 'application/pdf') {
          const buf = fs.readFileSync(file.path);
          const extracted = await pdfOcr(buf, file.originalname);
          return { type: 'pdf', filename: file.originalname, text: extracted || `[Could not extract text from ${file.originalname}]` };
        }
        let buf = fs.readFileSync(file.path);
        try {
          buf = await sharp(buf).rotate().withMetadata({}).toBuffer();
        } catch (e) {
          logger.warn('EXIF strip failed', { error: e.message });
        }
        const base64 = buf.toString('base64');
        return {
          type: 'image',
          content: { type: 'image_url', image_url: { url: `data:${file.mimetype};base64,${base64}`, detail: 'high' } }
        };
      }));

      for (const r of fileResults) {
        if (r.type === 'pdf') pdfTexts.push({ filename: r.filename, text: r.text });
        else imageContents.push(r.content);
      }

      if (pdfTexts.length > 0) {
        const MAX_PDF_CHARS = 12000;
        const pdfBlock = pdfTexts.map(({ filename, text }) => {
          if (text.length > MAX_PDF_CHARS) {
            return `[Content from ${filename} — first ${MAX_PDF_CHARS} of ${text.length} characters]\n${text.substring(0, MAX_PDF_CHARS)}\n[... truncated]`;
          }
          return `[Content from ${filename}]\n${text}`;
        }).join('\n\n');
        combinedText = `${combinedText}\n\n${pdfBlock}`;
      }

      logger.info('voice-tutor: files prepared', { userId, imageCount: imageContents.length, pdfCount: pdfTexts.length });
    } catch (procErr) {
      logger.error('voice-tutor: file processing failed', { userId, error: procErr.message });
      return res.status(500).json({ error: 'FILE_PROCESSING_ERROR', message: `Failed to process files: ${procErr.message}` });
    } finally {
      uploadedFiles.forEach(f => { if (f.path) try { fs.unlinkSync(f.path); } catch (_) {} });
    }
  }

  try {
    const { spoken, mathSteps, raw: aiRaw } = await generateResponse(
      userId,
      combinedText,
      null,
      { imageContents }
    );

    let audioUrl = null;
    if (ttsProvider.isConfigured()) {
      try {
        audioUrl = await generateTTS(userId, spoken);
      } catch (e) {
        logger.warn('TTS failed, continuing without audio', { userId, error: e.message });
      }
    }

    // Save the user-facing text (without giant base64 image blobs) to history.
    // Persist the clean spoken text — NOT the raw JSON/<math> blob — so the
    // shared chat<->voice conversation stays readable for the text tutor.
    await saveToHistory(userId, combinedText, spoken);

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
// POST /api/voice-tutor/process-orchestrated
// Opt-in orchestrator path. Same input shape as /process — accepts an
// audio blob (base64) or text, runs the same generateResponse() flow
// (which already routes through pipelineVerify), then streams the result
// as orchestrator NDJSON frames instead of the legacy 3-phase ones.
//
// Compatible with the legacy /process — clients pick at request time
// based on a feature flag. The client uses public/js/segmentPlayer.js
// to consume these frames; renderMathSteps still works because the
// orchestrator emits the legacy mathSteps mirror in the 'envelope' frame.
// ═══════════════════════════════════════
router.post('/process-orchestrated', isAuthenticated, async (req, res) => {
  const { audio, mimeType, text, sessionId: providedSessionId } = req.body;
  const userId = req.user._id;
  const sessionId = providedSessionId || `vt-${userId}-${Date.now()}`;

  if (!audio && !text) {
    return res.status(400).json({ error: 'audio or text is required' });
  }
  if (!ttsProvider.isConfigured()) {
    return res.status(503).json({ error: 'Voice not configured' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Voice not configured' });
  }
  if (isUnder13(req.user)) {
    return res.status(403).json({ error: 'Voice unavailable for your account', useWebSpeech: true });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  function send(frame) {
    res.write(JSON.stringify(frame) + '\n');
    if (res.flush) res.flush();
  }
  const transport = { send, end: () => res.end() };

  try {
    let userMessage = text ? String(text).trim() : '';

    if (audio) {
      let audioBuffer;
      try { audioBuffer = Buffer.from(audio, 'base64'); }
      catch (e) {
        send({ phase: 'error', message: 'Invalid audio format' });
        return res.end();
      }
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const audioExt = resolveAudioExt(mimeType);
      const tempPath = path.join(tempDir, `vto_${userId}_${Date.now()}${audioExt}`);
      fs.writeFileSync(tempPath, audioBuffer);
      const langMap = {
        'English': 'en', 'Spanish': 'es', 'Russian': 'ru', 'Chinese': 'zh',
        'Vietnamese': 'vi', 'Arabic': 'ar', 'Somali': 'so', 'French': 'fr', 'German': 'de'
      };
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: langMap[req.user.preferredLanguage] || 'en',
      }).finally(() => {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      });
      userMessage = transcription.text || '';
      send({ phase: 'transcription', transcription: userMessage });
    }

    if (!userMessage) {
      send({ phase: 'error', message: 'empty input' });
      return res.end();
    }

    // Resolve current phase + target so phaseEnforcer can apply rules.
    let expectedPhase = null;
    let activeTarget = null;
    try {
      const plan = await loadOrCreatePlan(userId, { user: req.user });
      const resolved = await resolveCurrentTarget(plan, { user: req.user });
      expectedPhase = resolved?.plan?.currentTarget?.instructionPhase || null;
      activeTarget = resolved?.plan?.currentTarget || null;
    } catch (e) {
      logger.warn('orchestrated: tutorplan load failed (non-fatal)', { error: e.message });
    }

    // Run the existing voice-tutor response generation. This already
    // routes through pipelineVerify — see generateResponse() above.
    const { spoken, mathSteps, raw: aiRaw } = await generateResponse(userId, userMessage, req.user);

    // Hand off to orchestrator
    const dispatcher = new (require('../utils/orchestrator/dispatcher').Dispatcher)({
      transport,
      session: orchestrator.sessionStore.getOrCreate(sessionId, userId),
      user: req.user,
    });

    const result = await orchestrator.handleTurn(
      { kind: 'voice', voiceJson: { spoken, mathSteps } },
      { sessionId, userId: String(userId), expectedPhase, activeTarget },
      dispatcher,
    );

    // Persist the assistant turn to history (same shape as /process).
    // Store the clean spoken text, not the raw JSON blob.
    saveToHistory(userId, userMessage, spoken).catch(err => {
      logger.warn('orchestrated: persist failed', { error: err.message });
    });

    // Synthesize TTS for the spoken portion alongside streaming. We send
    // the audio URL once it's ready; segmentPlayer ties it to the active
    // segment (single segment in this path, so id matching is automatic).
    if (!result.paused) {
      generateTTS(userId, spoken, req.user).then(audioUrl => {
        if (audioUrl) send({ phase: 'segment-audio', segmentId: null, audioUrl });
        send({ phase: 'turn-end', turnId: result.turnId });
        res.end();
      }).catch(err => {
        logger.warn('orchestrated: TTS failed', { error: err.message });
        send({ phase: 'turn-end', turnId: result.turnId });
        res.end();
      });
    } else {
      // Paused on a WAIT — keep the connection open via the dispatcher's
      // own frames. (Not implemented for HTTP-NDJSON in this build —
      // the hint-ladder rungs require a long-lived connection. WS path
      // is the production target for full WAIT support.)
      generateTTS(userId, spoken, req.user).then(audioUrl => {
        if (audioUrl) send({ phase: 'segment-audio', segmentId: null, audioUrl });
        res.end();
      }).catch(() => res.end());
    }

  } catch (err) {
    logger.error('orchestrated voice session error', { userId, error: err.message, stack: err.stack });
    send({ phase: 'error', message: 'Something went wrong. Please try again.' });
    res.end();
  }
});

// ═══════════════════════════════════════
// POST /api/voice-tutor/interrupt
// Student spoke mid-turn. Body: {sessionId, studentText, atMs?}.
// The classifier + evaluator decide a tier action; the response streams
// orchestrator frames for the resolution (fast-path clarification,
// disambiguator, or {needsPipelinePass:true} hint). Caller (the page's
// client JS) issues a follow-up /process-orchestrated when needed.
// ═══════════════════════════════════════
router.post('/interrupt', isAuthenticated, async (req, res) => {
  const { sessionId, studentText, atMs } = req.body || {};
  const userId = req.user._id;
  if (!sessionId || !studentText) {
    return res.status(400).json({ error: 'sessionId and studentText required' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  function send(frame) {
    res.write(JSON.stringify(frame) + '\n');
    if (res.flush) res.flush();
  }
  const transport = { send, end: () => res.end() };

  try {
    const dispatcher = new (require('../utils/orchestrator/dispatcher').Dispatcher)({
      transport,
      session: orchestrator.sessionStore.getOrCreate(sessionId, userId),
      user: req.user,
    });

    let expectedPhase = null;
    try {
      const plan = await loadOrCreatePlan(userId, { user: req.user });
      const resolved = await resolveCurrentTarget(plan, { user: req.user });
      expectedPhase = resolved?.plan?.currentTarget?.instructionPhase || null;
    } catch (_) { /* non-fatal */ }

    const result = await orchestrator.handleInterrupt(
      String(studentText),
      { sessionId, userId: String(userId), expectedPhase, atMs: Number(atMs) || 0 },
      dispatcher,
    );

    // Stream the resolution envelope (fast-path or disambiguator) if any
    if (result.envelope) {
      const session = orchestrator.sessionStore.getOrCreate(sessionId, userId);
      // Reuse the dispatcher to stream the new envelope as if it were a
      // fresh turn. Segment ids are unique so client can distinguish.
      session.startTurn(result.envelope.turnId);
      await dispatcher.stream(result.envelope, {});
      // For fast-path clarification, also synthesize TTS for the spoken
      // portion. Single segment so segmentId match is implicit.
      const seg = result.envelope.segments?.[0];
      if (seg?.spoken) {
        try {
          const audioUrl = await generateTTS(userId, seg.spoken, req.user);
          if (audioUrl) send({ phase: 'segment-audio', segmentId: seg.id, audioUrl });
        } catch (e) {
          logger.warn('interrupt: TTS failed', { error: e.message });
        }
      }
    }

    // Tell the caller whether they need to issue a pipeline pass next
    send({
      phase: 'interrupt-resolution',
      resolution: result.resolution,
      needsPipelinePass: !!result.needsPipelinePass,
      previousInterruption: result.previousInterruption,
      nextPhaseHint: result.nextPhaseHint || null,
    });
    send({ phase: 'turn-end', turnId: result.previousInterruption?.turnId || null });
    res.end();
  } catch (err) {
    logger.error('interrupt error', { userId, error: err.message, stack: err.stack });
    send({ phase: 'error', message: 'interrupt processing failed' });
    res.end();
  }
});

// ═══════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════

/**
 * Generate a voice tutor response using structured JSON output.
 * Returns { spoken, mathSteps, raw } — no dependency on LLM tags.
 */
async function generateResponse(userId, userMessage, preloadedUser, opts = {}) {
  const user = preloadedUser || await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const TUTOR_CONFIG = require('../utils/tutorConfig');
  const selectedTutorId = user.selectedTutorId || 'default';
  const tutorProfile = TUTOR_CONFIG[selectedTutorId] || TUTOR_CONFIG['default'];

  // Get conversation history (last 12 messages for voice context) from the
  // SAME active conversation chat uses, so voice picks up the text session's
  // context and vice versa.
  const history = await loadActiveHistory(user, 12);

  const systemPrompt = await generateSystemPrompt(user, tutorProfile);

  // Build the user turn — multimodal if images were attached (vision API)
  const imageContents = Array.isArray(opts.imageContents) ? opts.imageContents : [];
  const userContent = imageContents.length > 0
    ? [{ type: 'text', text: userMessage }, ...imageContents]
    : userMessage;

  const messages = [
    { role: 'system', content: systemPrompt + VOICE_TUTOR_INSTRUCTIONS },
    ...history,
    { role: 'user', content: userContent }
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
  // A step is kept if it has latex content, a structured visual, or
  // standalone text. (Visual steps mount an interactive widget on the
  // board — see voice-tutor-session.js renderMathSteps.)
  const isUsableStep = (s) => s && (s.latex || s.visual || s.text);
  try {
    const parsed = JSON.parse(rawContent);
    spoken = (parsed.spoken || parsed.text || parsed.response || '').trim();
    if (Array.isArray(parsed.mathSteps)) {
      mathSteps = parsed.mathSteps.filter(isUsableStep);
    } else if (Array.isArray(parsed.math_steps)) {
      mathSteps = parsed.math_steps.filter(isUsableStep);
    } else if (Array.isArray(parsed.steps)) {
      mathSteps = parsed.steps.filter(isUsableStep);
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
    const u = await User.findById(userId).select('activeConversationId').lean();
    if (!u?.activeConversationId) return [];
    const conversation = await Conversation.findById(u.activeConversationId)
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
          const valid = steps.filter(s => s && (s.latex || s.visual || s.text));
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
  // Persist to the SAME active conversation chat uses so voice turns are
  // visible when the student switches back to text. `user` may be passed
  // (lean) to avoid a refetch; otherwise resolve activeConversationId by id.
  const user = (userId && userId.activeConversationId !== undefined)
    ? userId
    : await User.findById(userId).select('activeConversationId').lean();
  if (!user) return;
  await appendToActiveConversation(user, [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: aiResponse },
  ]);
}

// ═══════════════════════════════════════
// POST /api/voice-tutor/end-session
// Finalizes a voice session: writes a continuity marker into the
// conversation so the chat tutor can pick up where the voice tutor left
// off, and returns a summary card payload for the client to display.
//
// Body: { boardSteps?: Array, durationSeconds?: number }
// Returns: { summary: { duration, durationSeconds, stepsWorked, topics, tutorName } }
// ═══════════════════════════════════════
router.post('/end-session', isAuthenticated, async (req, res) => {
  const userId = req.user._id;
  const { boardSteps = [], durationSeconds = 0 } = req.body || {};

  try {
    const user = await User.findById(userId).lean();
    const TUTOR_CONFIG = require('../utils/tutorConfig');
    const tutorProfile = TUTOR_CONFIG[user?.selectedTutorId || 'default'] || TUTOR_CONFIG['default'];
    const tutorName = tutorProfile.name || 'Tutor';

    // De-dupe and sanitize the board steps the client sent.
    const cleanSteps = Array.isArray(boardSteps)
      ? boardSteps
          .filter(s => s && (s.latex || s.text || s.visual))
          .map(s => {
            const out = {
              label: typeof s.label === 'string' ? s.label.slice(0, 60) : '',
              latex: typeof s.latex === 'string' ? s.latex.slice(0, 400) : '',
              text: typeof s.text === 'string' ? s.text.slice(0, 400) : '',
            };
            // Preserve interactive visuals (algebra tiles, etc.) — pass through
            // the structured spec rather than flattening to a string.
            if (s.visual && typeof s.visual === 'object' && typeof s.visual.kind === 'string') {
              out.visual = s.visual;
            }
            return out;
          })
          .slice(0, 40)
      : [];

    // Heuristic topic extraction from labels + a small set of keywords in
    // recent assistant content. This is intentionally simple — the goal
    // is a usable summary card, not a research-grade classifier.
    const topics = extractTopicsFromSteps(cleanSteps);

    // Format duration as "Nm Ss" or "Ns"
    const mins = Math.floor(durationSeconds / 60);
    const secs = Math.floor(durationSeconds % 60);
    const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    // Build the continuity marker. Stored as an assistant message because
    // chat.js drops 'system' roles from history. The prefix is recognizable
    // so the next chat turn knows this is a recap, not free-form dialogue.
    const stepLines = cleanSteps
      .slice(-12)
      .map(s => `  · ${s.label ? `${s.label}: ` : ''}${s.latex || s.text || ''}`)
      .join('\n');

    const marker = [
      `[Voice session with ${tutorName} just ended (${durationLabel}).`,
      stepLines ? `We worked through:\n${stepLines}` : 'We chatted, no math worked through.',
      topics.length ? `Topics: ${topics.join(', ')}.` : '',
      'The student is back in chat now — pick up naturally from here.]',
    ].filter(Boolean).join('\n\n');

    // Write the continuity marker into the SAME active conversation the chat
    // tutor reads, so it can pick up where the voice session left off.
    await appendToActiveConversation(req.user, [
      { role: 'assistant', content: marker },
    ]);

    res.json({
      summary: {
        tutorName,
        duration: durationLabel,
        durationSeconds,
        stepsWorked: cleanSteps,
        topics,
      },
    });
  } catch (err) {
    logger.error('Voice end-session error', { userId: String(userId), error: err.message });
    // Don't block the user's exit — return a minimal payload so the UI
    // can still render a summary card from the data it already has.
    res.status(200).json({
      summary: {
        tutorName: 'Your tutor',
        duration: '',
        durationSeconds,
        stepsWorked: Array.isArray(boardSteps) ? boardSteps : [],
        topics: [],
        degraded: true,
      },
    });
  }
});

/**
 * Lightweight topic extraction from math step labels. Looks for common
 * algebra/geometry/calc keywords; falls back to step labels.
 */
function extractTopicsFromSteps(steps) {
  if (!steps || steps.length === 0) return [];
  const haystack = steps
    .map(s => `${s.label || ''} ${s.latex || ''} ${s.text || ''}`)
    .join(' ')
    .toLowerCase();

  const buckets = [
    { kw: /slope|y\s*=\s*mx|linear/, name: 'Linear equations & slope' },
    { kw: /quadratic|x\^2|x\^{2}|factor|complet(e|ing).*square/, name: 'Quadratics' },
    { kw: /derivative|\\frac\{d/, name: 'Derivatives' },
    { kw: /integral|antideriv|\\int/, name: 'Integrals' },
    { kw: /fraction|\\frac/, name: 'Fractions' },
    { kw: /percent|%/, name: 'Percents' },
    { kw: /sin|cos|tan|trig/, name: 'Trigonometry' },
    { kw: /probability|combin|permut/, name: 'Probability' },
    { kw: /geometry|triangle|circle|area|volume/, name: 'Geometry' },
    { kw: /system|substitut|elimin/, name: 'Systems of equations' },
    { kw: /inequal|<|>|\\leq|\\geq/, name: 'Inequalities' },
    { kw: /exponent|logarithm|log\(/, name: 'Exponents & logs' },
  ];

  const found = new Set();
  for (const b of buckets) {
    if (b.kw.test(haystack)) found.add(b.name);
  }
  // Fallback: distinct step labels (capped)
  if (found.size === 0) {
    for (const s of steps) {
      const lbl = (s.label || '').trim();
      if (lbl && lbl.length < 30) found.add(lbl);
      if (found.size >= 3) break;
    }
  }
  return Array.from(found).slice(0, 4);
}

// ═══════════════════════════════════════
// GET /api/voice-tutor/metrics  (admin observability)
// ═══════════════════════════════════════
router.get('/metrics', isAuthenticated, (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  res.json({
    aggregate: voiceMetrics.aggregate(),
    recent: voiceMetrics.snapshot(50),
  });
});

// ═══════════════════════════════════════
// WebSocket: /api/voice-tutor/stream
// Streaming voice pipeline — replaces /process for the immersive
// voice-tutor.html experience. The HTTP /process endpoint above stays
// in place as a fallback when WebSocket connection fails.
// ═══════════════════════════════════════
function attachStreamWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true });
  const STREAM_PATH = '/api/voice-tutor/stream';
  const { handleUpgrade } = require('../utils/voiceUpgrade');

  server.on('upgrade', (request, socket, head) => {
    handleUpgrade({ request, socket, head, app, wss, streamPath: STREAM_PATH });
  });

  wss.on('connection', async (ws, request) => {
    const userDoc = await User.findById(request.user._id).lean();
    if (!userDoc) {
      ws.close(1008, 'user not found');
      return;
    }
    // Mode is opt-in via ?mode=orchestrated. Defaults preserve the
    // existing immersive math-steps experience.
    let requestedMode = 'math-steps';
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const m = url.searchParams.get('mode');
      if (m === 'orchestrated' || m === 'board-actions') requestedMode = m;
    } catch (_) { /* fall through to default */ }
    try {
      await createVoiceSession({ ws, user: userDoc, mode: requestedMode });
      logger.info('voice ws session opened', { userId: String(userDoc._id), mode: requestedMode });
    } catch (err) {
      logger.error('voice ws session init failed', { error: err.message });
      try { ws.close(1011, 'init failed'); } catch (_) {}
    }
  });

  logger.info('voice ws upgrade handler attached', { path: STREAM_PATH });
}

module.exports = router;
module.exports.attachStreamWebSocket = attachStreamWebSocket;
