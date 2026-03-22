// routes/trialChat.js
// Anonymous trial chat — 4 free turns (1 greeting + 3 student), no auth required.
// Lets landing page visitors experience a real tutor conversation
// before signing up. Uses server-side IP+session turn tracking.
//
// Runs through the SAME tutoring pipeline as authenticated chat
// (observe → diagnose → decide → generate → verify) with skipPersist=true
// so no DB writes occur. Trial users get identical pedagogical quality.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const { sanitizeForAI } = require('../middleware/promptInjection');
const { generateSystemPrompt } = require('../utils/prompt');
const { runPipeline } = require('../utils/pipeline');
const { callLLM } = require('../utils/llmGateway');

const MAX_TURNS = 4; // 1 greeting + 3 student messages
const MAX_MESSAGE_LENGTH = 500;
const UNLOCKED_TUTOR_IDS = Object.keys(TUTOR_CONFIG).filter(id => TUTOR_CONFIG[id].unlocked);

// Server-side turn tracking by IP — prevents client-side history manipulation.
// Keyed by IP, stores { count, resetAt }. Entries expire after 1 hour.
const turnTracker = new Map();
const TURN_TRACKER_TTL = 60 * 60 * 1000; // 1 hour

function getServerTurnCount(ip) {
  const entry = turnTracker.get(ip);
  if (!entry || Date.now() > entry.resetAt) return 0;
  return entry.count;
}

const TURN_TRACKER_MAX_SIZE = 50000;

function incrementServerTurnCount(ip) {
  const existing = turnTracker.get(ip);
  if (!existing || Date.now() > existing.resetAt) {
    // Evict oldest entries if map is too large (prevent memory exhaustion)
    if (turnTracker.size >= TURN_TRACKER_MAX_SIZE) {
      const oldest = turnTracker.keys().next().value;
      turnTracker.delete(oldest);
    }
    turnTracker.set(ip, { count: 1, resetAt: Date.now() + TURN_TRACKER_TTL });
  } else {
    existing.count += 1;
  }
}

// Periodic cleanup of expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of turnTracker) {
    if (now > entry.resetAt) turnTracker.delete(ip);
  }
}, 10 * 60 * 1000); // Every 10 minutes

// Aggressive rate limit for anonymous endpoint — IP-based
const trialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 40, // 40 requests per hour per IP (8 sessions × 4 turns + greet)
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'You\'ve used up your free trial chats for now. Sign up for free to keep going!',
      gate: true
    });
  }
});

/**
 * Build a minimal anonymous user profile for the system prompt generator.
 * Satisfies the same interface as a real user profile but with defaults.
 */
function buildTrialUserProfile() {
  return {
    firstName: 'there',   // "Hey there!" instead of a real name
    lastName: '',
    gradeLevel: null,
    mathCourse: null,
    tonePreference: 'encouraging',
    parentTone: null,
    learningStyle: null,
    interests: [],
    iepPlan: null,
    preferences: {},
    preferredLanguage: 'en',
  };
}

/**
 * Build in-memory conversation and user stand-ins for the pipeline.
 * These satisfy the pipeline's interface without touching MongoDB.
 */
function buildTrialPipelineContext(sanitizedHistory) {
  const now = new Date();

  // Build message array in the format the pipeline expects
  const messages = sanitizedHistory.map(m => ({
    role: m.role,
    content: m.content,
    createdAt: now,
  }));

  // Minimal conversation stand-in (no Mongoose methods needed — persist is skipped)
  const conversation = {
    messages,
    createdAt: now,
    startDate: now,
    problemsAttempted: 0,
    problemsCorrect: 0,
  };

  // Minimal user stand-in
  const user = {
    _id: null,
    firstName: 'there',
    iepPlan: null,
    learningEngines: null,
    assessmentResults: null,
    masteryProgress: null,
    skillMastery: null,
    level: 1,
    learningProfile: {},
  };

  return { conversation, user };
}

/**
 * POST /api/trial-chat/greet
 * Body: { tutorId: string }
 * Returns: { greeting: string }
 *
 * Generates a personalized greeting in the tutor's voice/personality.
 * This is the first thing the student sees — no history, no pipeline needed.
 * Counts as 1 turn toward the gate (so student gets 3 real exchanges after).
 */
router.post('/greet', trialLimiter, async (req, res) => {
  try {
    const { tutorId } = req.body;

    if (!tutorId || !UNLOCKED_TUTOR_IDS.includes(tutorId)) {
      return res.status(400).json({ error: 'Invalid tutor selection.' });
    }

    // Check gate — greet counts as a turn
    const serverTurns = getServerTurnCount(req.ip);
    if (serverTurns >= MAX_TURNS) {
      return res.json({ greeting: null, gated: true });
    }

    const tutor = TUTOR_CONFIG[tutorId];

    const messages = [
      {
        role: 'system',
        content: `You are ${tutor.name}, a math tutor on Mathmatix AI.

PERSONALITY: ${tutor.personality}

CULTURAL BACKGROUND: ${tutor.culturalBackground}

Generate a warm, in-character greeting for an anonymous visitor who just landed on the site and picked you as their tutor. This is the FIRST thing they see.

RULES:
- 1-3 sentences max. Be warm and natural.
- Stay fully in character — use your personality, catchphrase style, and cultural voice.
- Welcome them and ask if they have a math question you can help with. If not, mention they can pick from the suggestions below.
- Do NOT ask their name or grade. Do NOT say "welcome to Mathmatix." Just be yourself.
- ALL math references must use LaTeX: \\( x \\) for inline.
- Do NOT use bold, headers, or markdown formatting.`
      },
      {
        role: 'user',
        content: 'Generate the greeting.'
      }
    ];

    const completion = await callLLM('gpt-4o-mini', messages, {
      temperature: 0.9,
      max_tokens: 150,
    });

    const greeting = completion.choices[0].message.content;

    // Count this as a turn
    incrementServerTurnCount(req.ip);

    res.json({ greeting });

  } catch (error) {
    console.error('[Trial Chat] Greeting error:', error.message);
    // Fallback greetings in each tutor's voice
    const fallbacks = {
      'bob': "Hey there! Math you believe it — you found the right tutor! Got a math question? Fire away, or pick one of those suggestions below!",
      'maya': "Heyy! ✨ So glad you're here! Got a math question you need help with? If not, no worries — there are some suggestions right there to get us started! 💯",
      'ms-maria': "¡Hola! Welcome — I'm so glad you stopped by! Do you have a math question I can help you with? If not, there are a few suggestions below to get us started. ¡Vamos!",
      'mr-nappier': "What's up! Ready to find some patterns? Got a math question for me? If you can't think of one, check out the suggestions below — let's get started!"
    };
    res.json({ greeting: fallbacks[req.body?.tutorId] || "Hey! Got a math question? Pick one of the suggestions below to get started!" });
  }
});

/**
 * POST /api/trial-chat
 * Body: { tutorId: string, message: string, history: [{ role, content }] }
 * Returns: { reply: string, turnCount: number, gated: boolean }
 *
 * Runs through the SAME tutoring pipeline as authenticated chat.
 * The pipeline's persist stage is skipped (skipPersist=true) since
 * there's no database user/conversation for anonymous visitors.
 */
router.post('/', trialLimiter, async (req, res) => {
  try {
    const { tutorId, message, history = [] } = req.body;

    // Validate tutor
    if (!tutorId || !UNLOCKED_TUTOR_IDS.includes(tutorId)) {
      return res.status(400).json({ error: 'Invalid tutor selection.' });
    }

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` });
    }

    // Server-side turn counting — prevents client-side history manipulation
    const serverTurns = getServerTurnCount(req.ip);
    if (serverTurns >= MAX_TURNS) {
      return res.json({
        reply: null,
        turnCount: serverTurns,
        gated: true
      });
    }

    const tutor = TUTOR_CONFIG[tutorId];
    const isLastTurn = (serverTurns + 1) >= MAX_TURNS;

    // Sanitize message and history
    const sanitizedMessage = sanitizeForAI(message.trim());
    const validHistory = Array.isArray(history)
      ? history.filter(m => m && typeof m.content === 'string' && m.content.trim())
      : [];

    // Limit history to server-verified turn count to prevent fabricated history injection
    const maxHistoryMessages = serverTurns * 2;
    const sanitizedHistory = validHistory.slice(-Math.min(6, maxHistoryMessages)).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: sanitizeForAI(m.content.slice(0, MAX_MESSAGE_LENGTH))
    }));

    // ── Build system prompt using the same generator as authenticated chat ──
    const trialUserProfile = buildTrialUserProfile();
    let systemPrompt = generateSystemPrompt(
      trialUserProfile,
      tutor,           // tutorProfile
      null,            // childProfile
      'student',       // currentRole
      null,            // curriculumContext
      null,            // uploadContext
      null,            // masteryContext
      [],              // likedMessages
      null,            // fluencyContext
      null,            // conversationContext
      null,            // teacherAISettings
      null,            // gradingContext
      null,            // errorPatterns
      null,            // resourceContext
      sanitizedMessage, // studentMessage
      sanitizedHistory  // recentMessages
    );

    // Append trial-specific directives
    systemPrompt += `\n\n--- TRIAL SESSION ---
This is an anonymous trial visitor. No XP, no mastery tracking, no skill tags needed.
Keep responses concise (2-4 sentences max). Be warm and engaging.
NEVER mention you're in a trial or limited mode. Act like their full tutor.`;

    if (isLastTurn) {
      systemPrompt += `

CRITICAL FOR THIS RESPONSE: You MUST end your response with a question or a next step that requires the student to answer. Do NOT wrap up or summarize. Leave the problem in progress — ask them what they think the next step is, or pose a follow-up question. You are mid-conversation, not ending one.`;
    }

    // ── Build pipeline context ──
    const { conversation, user } = buildTrialPipelineContext(sanitizedHistory);

    // Format messages for LLM (same format as chat.js)
    const formattedMessages = sanitizedHistory.map(m => ({ role: m.role, content: m.content }));

    // ── Run the full pipeline (observe → diagnose → decide → generate → verify) ──
    // skipPersist=true means no DB writes — everything else runs identically.
    const pipelineResult = await runPipeline(sanitizedMessage, {
      user,
      conversation,
      systemPrompt,
      formattedMessages,
      activeSkill: null,
      phaseState: null,
      hasRecentUpload: false,
      stream: false,
      res: null,
      aiProcessingStartTime: Date.now(),
      skipPersist: true,
    });

    const reply = pipelineResult.text;

    console.log(`[Trial Pipeline] ${pipelineResult._pipeline.messageType} → ${pipelineResult._pipeline.action} (flags: ${pipelineResult._pipeline.flags.join(', ') || 'none'})`);

    // Increment server-side turn count AFTER successful response
    incrementServerTurnCount(req.ip);
    const newTurnCount = serverTurns + 1;

    res.json({
      reply,
      turnCount: newTurnCount,
      gated: newTurnCount >= MAX_TURNS
    });

  } catch (error) {
    console.error('[Trial Chat] Pipeline error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * GET /api/trial-chat/voice-preview/:tutorId
 * Returns cached TTS audio of the tutor's voicePreview string.
 * Generates once, caches in memory for the lifetime of the process.
 */
const voicePreviewCache = new Map();
const ttsProvider = require('../utils/ttsProvider');

const voicePreviewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,             // 20 requests per minute per IP
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/voice-preview/:tutorId', voicePreviewLimiter, async (req, res) => {
  const { tutorId } = req.params;

  if (!UNLOCKED_TUTOR_IDS.includes(tutorId)) {
    return res.status(404).json({ error: 'Tutor not found.' });
  }

  // Check cache
  if (voicePreviewCache.has(tutorId)) {
    const cached = voicePreviewCache.get(tutorId);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h browser cache
    return res.send(cached.audio);
  }

  if (!ttsProvider.isConfigured()) {
    return res.status(503).json({ error: 'Voice preview unavailable.' });
  }

  const tutor = TUTOR_CONFIG[tutorId];
  const voiceId = ttsProvider.resolveVoiceId(tutor.cartesiaVoiceId || tutor.voiceId);

  try {
    const audioBuffer = await ttsProvider.generateAudio(tutor.voicePreview, voiceId);
    const contentType = ttsProvider.getContentType();

    // Cache it
    voicePreviewCache.set(tutorId, { audio: audioBuffer, contentType });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  } catch (err) {
    console.error(`[Trial Chat] Voice preview error for ${tutorId}:`, err.message);
    res.status(500).json({ error: 'Voice preview failed.' });
  }
});

/**
 * POST /api/trial-chat/speak
 * TTS for trial chat tutor responses — anonymous, rate-limited.
 * Strips LaTeX/markdown before sending to TTS.
 */
const trialTtsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15, // 15 TTS requests per hour per IP
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'TTS rate limit reached.' });
  }
});

router.post('/speak', trialTtsLimiter, async (req, res) => {
  const { tutorId, text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text.' });
  }

  if (!UNLOCKED_TUTOR_IDS.includes(tutorId)) {
    return res.status(400).json({ error: 'Invalid tutor.' });
  }

  if (!ttsProvider.isConfigured()) {
    return res.status(503).json({ error: 'TTS unavailable.' });
  }

  // Clean text for TTS (strip LaTeX and markdown)
  let cleaned = text;
  cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, '$1');
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, '$1');
  cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, '$1');
  cleaned = cleaned.replace(/\$([^$]+)\$/g, '$1');
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');
  cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');
  cleaned = cleaned.replace(/\^2\b/g, ' squared');
  cleaned = cleaned.replace(/\^3\b/g, ' cubed');
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
  cleaned = cleaned.replace(/[{}]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return res.status(400).json({ error: 'No speakable text.' });
  }

  // Limit TTS text length
  if (cleaned.length > 600) {
    cleaned = cleaned.substring(0, 600);
  }

  const tutor = TUTOR_CONFIG[tutorId];
  const voiceId = ttsProvider.resolveVoiceId(tutor.cartesiaVoiceId || tutor.voiceId);

  try {
    const audioBuffer = await ttsProvider.generateAudio(cleaned, voiceId);
    const contentType = ttsProvider.getContentType();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(audioBuffer);
  } catch (err) {
    console.error(`[Trial Chat] TTS error for ${tutorId}:`, err.message);
    res.status(500).json({ error: 'TTS failed.' });
  }
});

module.exports = router;
