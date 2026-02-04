/**
 * Prompt Injection Protection Middleware
 *
 * Detects and blocks attempts to manipulate the AI tutor through:
 * - Instruction override attempts ("ignore previous instructions")
 * - Persona manipulation ("you are now", "act as", "pretend to be")
 * - System prompt extraction ("show your instructions", "reveal your prompt")
 * - Jailbreak attempts ("DAN mode", "no restrictions", "developer mode")
 *
 * When detected: logs the attempt, returns a friendly redirect, does NOT send to AI
 */

const logger = require('../utils/logger');

// Patterns that indicate prompt injection attempts
// Organized by category for easier maintenance and logging
const INJECTION_PATTERNS = {
  // Instruction override attempts
  instructionOverride: [
    /ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|guidelines?|prompts?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|guidelines?)/i,
    /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|rules?|guidelines?)/i,
    /override\s+(your|all|the)\s+(instructions?|rules?|programming)/i,
    /bypass\s+(your|all|the)\s+(rules?|restrictions?|filters?|safety)/i,
    /don'?t\s+follow\s+(your|the)\s+(rules?|instructions?|guidelines?)/i,
    /stop\s+being\s+(a\s+)?(math\s+)?tutor/i,
    /you\s+don'?t\s+have\s+to\s+follow/i,
    /new\s+instruction[s]?\s*:/i,
    /system\s*:\s*you\s+are/i,
  ],

  // Persona/identity manipulation
  personaManipulation: [
    /you\s+are\s+now\s+(a|an|the)?\s*(?!going|ready|correct|wrong|right|here|my|helping)/i,
    /from\s+now\s+on\s*,?\s*(you\s+are|act\s+as|pretend|be\s+a)/i,
    /pretend\s+(you\s+are|to\s+be|you'?re)\s+(a|an)?/i,
    /act\s+(like|as\s+if|as)\s+(you\s+are|you'?re|a|an)/i,
    /roleplay\s+(as|like)\s+(a|an)?/i,
    /take\s+on\s+(the\s+)?role\s+of/i,
    /you'?re\s+no\s+longer\s+(a\s+)?math/i,
    /stop\s+being\s+(a\s+)?math/i,
    /switch\s+(to|into)\s+(a\s+)?different\s+(mode|persona|character)/i,
    /change\s+your\s+(personality|character|persona|identity)/i,
    /new\s+persona\s*:/i,
  ],

  // System prompt extraction attempts
  promptExtraction: [
    /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|hidden)/i,
    /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
    /print\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    /output\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    /display\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?)\s+(back|to\s+me)/i,
    /tell\s+me\s+(your|the)\s+(exact\s+)?(system\s+)?(prompt|instructions?)/i,
    /what\s+were\s+you\s+told/i,
    /what\s+did\s+(they|your\s+creators?)\s+tell\s+you/i,
    /read\s+back\s+(your|the)\s+instructions/i,
  ],

  // Jailbreak/unrestricted mode attempts
  jailbreakAttempts: [
    /\bDAN\s+(mode)?/i,
    /\bdo\s+anything\s+now\b/i,
    /developer\s+mode\s+(enable|activate|on)/i,
    /enable\s+developer\s+mode/i,
    /\bjailbreak\b/i,
    /no\s+(more\s+)?restrictions?\b/i,
    /unrestricted\s+mode/i,
    /remove\s+(all\s+)?(your\s+)?(restrictions?|filters?|limitations?)/i,
    /disable\s+(your\s+)?(safety|content|filters?|restrictions?)/i,
    /turn\s+off\s+(your\s+)?(safety|filters?|restrictions?)/i,
    /without\s+(any\s+)?(restrictions?|filters?|rules?)/i,
    /unfiltered\s+(mode|response|version)/i,
    /uncensored\s+(mode|response|version)/i,
    /evil\s+(mode|version)/i,
    /maximum\s+(mode|power)/i,
  ],

  // Markdown/encoding injection (trying to hide instructions)
  encodingInjection: [
    /\[system\]/i,
    /\[assistant\]/i,
    /\[instruction[s]?\]/i,
    /<\s*system\s*>/i,
    /```system/i,
    /```instruction/i,
    /base64\s*:\s*[a-zA-Z0-9+\/=]{20,}/i,
  ],

  // Answer extraction attempts (more aggressive than anti-cheat)
  answerExtraction: [
    /just\s+(give|tell)\s+(me\s+)?the\s+(final\s+)?answer/i,
    /skip\s+(the\s+)?(explanation|teaching|steps)/i,
    /don'?t\s+(explain|teach|show\s+work)/i,
    /answer\s+only\s*,?\s*no\s+(explanation|steps)/i,
  ],
};

// Friendly responses that redirect back to math
const FRIENDLY_RESPONSES = [
  "I'm here to help you learn math! What math topic can I help you with today?",
  "Let's focus on math together! What problem are you working on?",
  "I'm your math tutor - ready to help you learn! What would you like to work on?",
  "Hey, let's stick to math! I'm here to help you understand and learn. What topic are you studying?",
  "I'm all about math! Tell me what you're working on and I'll help you learn it.",
];

/**
 * Check if a message contains prompt injection attempts
 * @param {string} message - The user's message
 * @returns {{ isInjection: boolean, category: string|null, matchedPattern: string|null }}
 */
function detectPromptInjection(message) {
  if (!message || typeof message !== 'string') {
    return { isInjection: false, category: null, matchedPattern: null };
  }

  // Normalize the message for detection (but don't modify the original)
  const normalizedMessage = message
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Check each category of patterns
  for (const [category, patterns] of Object.entries(INJECTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        return {
          isInjection: true,
          category,
          matchedPattern: pattern.toString()
        };
      }
    }
  }

  return { isInjection: false, category: null, matchedPattern: null };
}

/**
 * Express middleware to block prompt injection attempts
 * Apply to chat routes before processing
 */
function promptInjectionFilter(req, res, next) {
  const message = req.body?.message;

  if (!message) {
    return next();
  }

  const detection = detectPromptInjection(message);

  if (detection.isInjection) {
    const userId = req.user?._id || req.user?.id || 'unknown';
    const username = req.user?.username || 'unknown';

    // Log the attempt (without the full message to avoid log pollution)
    logger.warn('Prompt injection attempt blocked', {
      userId,
      username,
      category: detection.category,
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Also console log for immediate visibility
    console.warn(`🛡️ PROMPT INJECTION BLOCKED - User: ${username} (${userId}) - Category: ${detection.category}`);

    // Return a friendly response that redirects to math
    const friendlyResponse = FRIENDLY_RESPONSES[Math.floor(Math.random() * FRIENDLY_RESPONSES.length)];

    return res.json({
      text: friendlyResponse,
      userXp: 0,
      userLevel: req.user?.level || 1,
      xpNeeded: 200,
      specialXpAwarded: "",
      voiceId: "default",
      newlyUnlockedTutors: [],
      drawingSequence: null,
      promptInjectionBlocked: true // Flag for analytics/debugging
    });
  }

  next();
}

/**
 * Validate and sanitize message before AI processing
 * Can be used as additional layer after the middleware
 * @param {string} message - The message to sanitize
 * @returns {string} - Sanitized message
 */
function sanitizeForAI(message) {
  if (!message || typeof message !== 'string') {
    return '';
  }

  // Remove zero-width characters that could be used to hide instructions
  let sanitized = message.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Remove potential markdown injection for system messages
  sanitized = sanitized.replace(/```(system|instruction|assistant)/gi, '```code');

  // Remove attempts to inject role markers
  sanitized = sanitized.replace(/\[(system|instruction|assistant)\]/gi, '[text]');

  return sanitized;
}

module.exports = {
  promptInjectionFilter,
  detectPromptInjection,
  sanitizeForAI,
  INJECTION_PATTERNS // Exported for testing
};
