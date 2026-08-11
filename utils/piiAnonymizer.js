/**
 * PII ANONYMIZER - Strips personally identifiable information before AI API calls
 *
 * This module sits between the application and AI providers (OpenAI, Anthropic)
 * to ensure no student PII is transmitted to third-party services.
 *
 * WHAT IT STRIPS:
 * - Full names (first + last) → [Student], [Teacher], [Parent]
 * - Email addresses → [email]
 * - School/district names → [School]
 * - Phone numbers → [phone]
 * - Dates of birth → [date]
 * - Student IDs / MongoDB ObjectIds → [id]
 * - Physical addresses → [address]
 *
 * WHAT IT PRESERVES (pedagogically necessary):
 * - Grade level, math course, learning style
 * - IEP accommodations (without names)
 * - Skill mastery data, assessment results
 * - Interests (for personalized word problems)
 * - Conversation history content (anonymized)
 * - First name only (configurable - used as [Student] placeholder by default)
 *
 * ARCHITECTURE:
 * 1. anonymizeMessages() - Processes message arrays before API calls
 * 2. anonymizeSystemPrompt() - Processes system prompts before API calls
 * 3. rehydrateResponse() - Replaces [Student] placeholders with real first name
 * 4. createAnonymizationContext() - Builds a mapping for consistent replacement
 *
 * @module piiAnonymizer
 */

const logger = require('./logger');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * PII patterns to detect and replace.
 * Order matters — more specific patterns should come before general ones.
 */
const PII_PATTERNS = {
    // Email addresses (most specific, match first)
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

    // Phone numbers. A separator or parenthesised area code is REQUIRED: the
    // old pattern allowed every separator to be empty, so it swallowed any bare
    // ten-digit run — and "The product is 1234567890" became "[phone]", hiding
    // the student's answer from the model that has to grade it.
    phone: /(?:\+?1[-.\s])?(?:\(\d{3}\)\s?|\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g,

    // MongoDB ObjectIds (24 hex chars)
    objectId: /\b[0-9a-fA-F]{24}\b/g,

    // SSN. Separators are likewise required — the old pattern matched a bare
    // nine-digit run, which is an ordinary answer to a multiplication problem.
    ssn: /\b\d{3}[-.]\d{2}[-.]\d{4}\b/g,

    // Date of birth patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
    dateOfBirth: /\b(?:born|dob|birthday|date of birth)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,

    // Street addresses (number + street name pattern)
    address: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\.?\b/gi,
};

/**
 * Names we refuse to strip because they are also ordinary math or English words.
 *
 * Replacement is a whole-word, case-insensitive substitution, so a student named
 * Ray turns "draw a ray from point A" into "draw a [Student] from point A" — in
 * the tutor's own teaching text, in the student's answers, and in anything the
 * model is asked to grade. Max, Mark, Sum and Grace fail the same way, and
 * sentence-initial capitals ("Mark the point") defeat any case-based heuristic.
 *
 * So for these, the bare given/family name is left alone. The full name is still
 * stripped — "Ray Patel" is unambiguous in a way "ray" is not — along with every
 * pattern-matched identifier. This trades the weakest PII (a first name with no
 * surname attached) for not corrupting the instruction the product exists to give.
 *
 * A denylist is inherently incomplete. It covers the collisions that actually
 * occur in K-12 math; add to it rather than removing the guard.
 */
const PROTECTED_VOCABULARY = new Set([
  // Geometry / algebra terms that are also given names
  'ray', 'angle', 'point', 'line', 'base', 'prime', 'root', 'mean', 'mode',
  'range', 'set', 'order', 'degree', 'power', 'square', 'unit', 'sum', 'max',
  'min', 'pi', 'sine', 'chord', 'arc', 'solid', 'plane', 'axis', 'graph',
  // Common verbs/nouns in problem statements that are also given names
  'mark', 'add', 'count', 'sketch', 'match', 'guess', 'chance', 'even', 'odd',
  // Everyday words that are also common given names
  'grace', 'hope', 'faith', 'joy', 'will', 'bill', 'rose', 'dawn', 'art',
  'may', 'june', 'april', 'august', 'summer', 'autumn', 'sunny', 'star',
  'al', 'ana', 'ed', 'jo', 'van', 'so', 'an', 'in', 'on', 'or', 'is', 'it'
]);

/** True when a bare name is too collision-prone to substitute safely. */
function isProtectedName(name) {
  return PROTECTED_VOCABULARY.has(String(name || '').trim().toLowerCase());
}

// Placeholder tokens used in anonymized text
const PLACEHOLDERS = {
    student: '[Student]',
    teacher: '[Teacher]',
    parent: '[Parent]',
    school: '[School]',
    email: '[email]',
    phone: '[phone]',
    objectId: '[id]',
    ssn: '[redacted]',
    dateOfBirth: '[date]',
    address: '[address]',
    name: '[Name]',
};

// ============================================================================
// ANONYMIZATION CONTEXT
// ============================================================================

/**
 * Creates an anonymization context that maps real PII values to placeholders.
 * This ensures consistent replacement across all messages in a conversation.
 *
 * @param {Object} userProfile - The user profile object
 * @param {Object} [options] - Configuration options
 * @param {boolean} [options.allowFirstName=false] - If true, passes first name through
 * @param {Object} [options.additionalNames={}] - Extra name->placeholder mappings
 * @returns {Object} Anonymization context with nameMap and utility methods
 */
function createAnonymizationContext(userProfile, options = {}) {
    const { allowFirstName = false, additionalNames = {} } = options;

    // Build name replacement map (longest names first to avoid partial matches)
    const nameMap = new Map();

    // Names skipped as too collision-prone, so callers can see it happened
    // rather than wondering why a name survived.
    const skipped = [];

    if (userProfile) {
        const firstName = userProfile.firstName || '';
        const lastName = userProfile.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();

        // Full name is unambiguous — always replace, even when either half on
        // its own is a word we protect.
        if (firstName && lastName && fullName.length > 1) {
            nameMap.set(fullName.toLowerCase(), PLACEHOLDERS.student);
        }

        if (lastName && lastName.length > 1) {
            if (isProtectedName(lastName)) skipped.push(lastName);
            else nameMap.set(lastName.toLowerCase(), PLACEHOLDERS.student);
        }

        if (!allowFirstName && firstName && firstName.length > 1) {
            if (isProtectedName(firstName)) skipped.push(firstName);
            else nameMap.set(firstName.toLowerCase(), PLACEHOLDERS.student);
        }
    }

    // Add any additional names (teacher, parent, school, etc.)
    for (const [name, placeholder] of Object.entries(additionalNames)) {
        if (!name || name.length <= 1) continue;
        // A multi-word value (e.g. "Ms Rose Carter") is unambiguous; only a
        // single bare token can collide with vocabulary.
        if (!name.includes(' ') && isProtectedName(name)) {
            skipped.push(name);
            continue;
        }
        nameMap.set(name.toLowerCase(), placeholder);
    }

    return {
        nameMap,
        firstName: userProfile?.firstName || 'Student',
        allowFirstName,

        /**
         * Anonymize a single string using this context
         */
        anonymize(text) {
            return anonymizeText(text, this.nameMap);
        },

        /**
         * Replace [Student] placeholders with the real first name
         */
        rehydrate(text) {
            return rehydrateResponse(text, this.firstName);
        }
    };
}

// ============================================================================
// EDUCATIONAL DATA SANITIZATION
// ============================================================================

/**
 * Patterns for educational data that should be abstracted before sending to
 * AI providers. IEP goal descriptions, z-scores, and progress percentages
 * can identify students when combined with other context.
 *
 * The AI still gets the accommodation TYPES (extended time, calculator, etc.)
 * and the instruction on how to teach — it just doesn't get the specific
 * goal descriptions, measurement methods, or exact progress numbers.
 */
const EDUCATIONAL_DATA_PATTERNS = {
    // IEP goal descriptions: "1. **Solve multi-step equations with 80% accuracy**"
    // Replaces the specific goal text with a generic placeholder, keeps the numbering
    iepGoalDescription: /(\d+\.\s*\*\*)(.*?)(\*\*)/g,

    // Progress percentages in IEP context: "Progress: [████░░░░░░] 45%"
    // Replace exact percentage with a range
    iepProgressBar: /Progress:\s*\[(?:█|░)+\]\s*\d+%/g,

    // z-score values: "(z-score: -1.23)" or "(z-score: 0.45)"
    zScore: /\(z-score:\s*-?\d+\.?\d*\)/gi,

    // Processing speed z-score inline: "z-score: -1.23"
    zScoreInline: /z-score:\s*-?\d+\.?\d*/gi,

    // Read speed modifier: "Read speed modifier: 1.50x"
    readSpeedModifier: /Read speed modifier:\s*\d+\.\d+x/gi,

    // Target dates in IEP goals: "Target: 5/15/2026" or "Target: May 15, 2026"
    iepTargetDate: /Target:\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}|No target date)/gi,

    // Measurement methods: "Measurement: Weekly quiz scores averaging 80%+"
    iepMeasurement: /Measurement:\s*.+/gi,
};

/**
 * Sanitize educational record data in text.
 * Abstracts IEP specifics to categories while preserving teaching instructions.
 *
 * @param {string} text - Text potentially containing educational data
 * @returns {string} Sanitized text
 */
function sanitizeEducationalData(text) {
    if (!text || typeof text !== 'string') return text;

    let result = text;

    // Replace z-scores with speed category (the speedLevel text remains)
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.zScore, '');
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.zScoreInline, 'assessed speed level');
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.readSpeedModifier, 'Read speed: adjusted');

    // Replace exact IEP progress with ranges
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.iepProgressBar, (match) => {
        const pctMatch = match.match(/(\d+)%/);
        if (pctMatch) {
            const pct = parseInt(pctMatch[1]);
            if (pct < 25) return 'Progress: early stage';
            if (pct < 50) return 'Progress: developing';
            if (pct < 75) return 'Progress: approaching target';
            return 'Progress: near mastery';
        }
        return 'Progress: in progress';
    });

    // Replace IEP target dates with generic timeline
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.iepTargetDate, 'Target: current school year');

    // Replace measurement methods with generic
    result = result.replace(EDUCATIONAL_DATA_PATTERNS.iepMeasurement, 'Measurement: per IEP plan');

    return result;
}

// ============================================================================
// CORE ANONYMIZATION
// ============================================================================

/**
 * Anonymize a text string by replacing PII patterns and known names.
 *
 * @param {string} text - The text to anonymize
 * @param {Map} nameMap - Map of lowercase name -> placeholder
 * @returns {string} Anonymized text
 */
function anonymizeText(text, nameMap = new Map()) {
    if (!text || typeof text !== 'string') return text;

    let result = text;

    // Step 1: Replace regex-based PII patterns
    for (const [patternName, regex] of Object.entries(PII_PATTERNS)) {
        // Reset regex lastIndex for global patterns
        regex.lastIndex = 0;
        const placeholder = PLACEHOLDERS[patternName] || '[redacted]';
        result = result.replace(regex, placeholder);
    }

    // Step 2: Sanitize educational record data (IEP goals, z-scores, progress)
    result = sanitizeEducationalData(result);

    // Step 3: Replace known names (case-insensitive, whole word)
    // Sort by length descending to replace longer names first (e.g., "Sarah Chen" before "Sarah")
    const sortedNames = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length);

    for (const [name, placeholder] of sortedNames) {
        if (name.length < 2) continue; // Skip single chars
        // Use word boundary matching (case-insensitive)
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(nameRegex, placeholder);
    }

    return result;
}

/**
 * Anonymize an array of messages (as sent to AI providers).
 * Creates anonymized copies — does NOT mutate originals.
 *
 * @param {Array} messages - Array of {role, content} message objects
 * @param {Object} anonContext - Anonymization context from createAnonymizationContext()
 * @returns {Array} New array of anonymized message objects
 */
function anonymizeMessages(messages, anonContext) {
    if (!messages || !Array.isArray(messages)) return messages;

    return messages.map(msg => {
        if (!msg || !msg.content) return msg;

        // Handle string content
        if (typeof msg.content === 'string') {
            return {
                ...msg,
                content: anonymizeText(msg.content, anonContext.nameMap)
            };
        }

        // Handle array content (vision messages with text + image)
        if (Array.isArray(msg.content)) {
            return {
                ...msg,
                content: msg.content.map(part => {
                    if (part.type === 'text' && part.text) {
                        return { ...part, text: anonymizeText(part.text, anonContext.nameMap) };
                    }
                    return part; // Pass through images unchanged
                })
            };
        }

        return msg;
    });
}

/**
 * Anonymize a system prompt string.
 *
 * @param {string} systemPrompt - The system prompt text
 * @param {Object} anonContext - Anonymization context
 * @returns {string} Anonymized system prompt
 */
function anonymizeSystemPrompt(systemPrompt, anonContext) {
    if (!systemPrompt || typeof systemPrompt !== 'string') return systemPrompt;
    return anonymizeText(systemPrompt, anonContext.nameMap);
}

// ============================================================================
// RESPONSE REHYDRATION
// ============================================================================

/**
 * Replace [Student] placeholders in AI responses with the student's first name.
 * This runs AFTER receiving the AI response, before sending to the client.
 *
 * @param {string} responseText - The AI response text
 * @param {string} firstName - The student's real first name
 * @returns {string} Response with placeholders replaced
 */
function rehydrateResponse(responseText, firstNameOrNames) {
    if (!responseText || typeof responseText !== 'string') return responseText;
    if (!firstNameOrNames) return responseText;

    // Back-compat: a bare string still means "the student's first name".
    const names = typeof firstNameOrNames === 'string'
        ? { student: firstNameOrNames }
        : firstNameOrNames;

    let result = responseText;
    // Every placeholder we can put in, we have to be able to take back out.
    // Restoring only [Student] is why a parent-facing reply could reach the
    // parent reading "Hi [Parent]".
    for (const key of ['student', 'parent', 'teacher', 'school']) {
        const value = names[key];
        if (!value) continue;
        result = result.replace(new RegExp(`\\[${key}\\]`, 'gi'), value);
    }
    return result;
}

/** Longest placeholder token we might have to reassemble across chunks. */
const MAX_PLACEHOLDER_LENGTH = 12;

/**
 * Streaming-safe rehydration.
 *
 * Providers split tokens wherever they like, so "[Student]" can arrive as
 * "[Stu" + "dent]". Rehydrating each chunk independently misses it and the
 * placeholder reaches the reader verbatim. This holds back a trailing partial
 * placeholder until it either completes or grows too long to be one.
 *
 * @param {string|Object} firstNameOrNames - as rehydrateResponse
 * @returns {{push: (chunk: string) => string, flush: () => string}}
 */
function createStreamRehydrator(firstNameOrNames) {
    let pending = '';

    return {
        push(chunk) {
            if (!chunk) return '';
            const buffer = pending + chunk;

            // An unclosed '[' near the end may be the start of a placeholder.
            const open = buffer.lastIndexOf('[');
            const holdFrom = (open !== -1 &&
                !buffer.slice(open).includes(']') &&
                buffer.length - open <= MAX_PLACEHOLDER_LENGTH)
                ? open
                : buffer.length;

            pending = buffer.slice(holdFrom);
            return rehydrateResponse(buffer.slice(0, holdFrom), firstNameOrNames);
        },

        /** Emit whatever is still held once the stream ends. */
        flush() {
            const rest = rehydrateResponse(pending, firstNameOrNames);
            pending = '';
            return rest;
        }
    };
}

// ============================================================================
// LOGGING & AUDIT
// ============================================================================

/**
 * Log anonymization activity for audit trail.
 * Does NOT log the actual PII — only counts and metadata.
 *
 * @param {string} userId - The user's ID (will be included in log)
 * @param {string} action - The anonymization action ('anonymize' | 'rehydrate')
 * @param {Object} metadata - Additional context
 */
function logAnonymizationEvent(userId, action, metadata = {}) {
    logger.info(`[PII-Anonymizer] ${action}`, {
        userId: userId,
        action: action,
        messageCount: metadata.messageCount || 0,
        patternsMatched: metadata.patternsMatched || 0,
        timestamp: new Date().toISOString()
    });
}

// ============================================================================
// MIDDLEWARE HELPER
// ============================================================================

/**
 * Build anonymization context from a request's user profile.
 * Convenience function for use in route handlers.
 *
 * @param {Object} req - Express request object with req.user
 * @param {Object} [additionalNames] - Extra names to anonymize (teacher, school, etc.)
 * @returns {Object} Anonymization context
 */
function buildAnonymizationContextFromRequest(req, additionalNames = {}) {
    const user = req.user;
    if (!user) {
        return createAnonymizationContext(null);
    }

    // Build additional names from related users (teacher, parent)
    const extraNames = { ...additionalNames };

    // If student has a teacher, add teacher name
    if (user.teacherId && user.teacherId.firstName) {
        extraNames[`${user.teacherId.firstName} ${user.teacherId.lastName || ''}`.trim()] = PLACEHOLDERS.teacher;
    }

    return createAnonymizationContext(user, {
        allowFirstName: false,
        additionalNames: extraNames
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Core functions
    createAnonymizationContext,
    anonymizeText,
    anonymizeMessages,
    anonymizeSystemPrompt,
    rehydrateResponse,
    createStreamRehydrator,
    isProtectedName,

    // Educational data sanitization
    sanitizeEducationalData,

    // Helpers
    buildAnonymizationContextFromRequest,
    logAnonymizationEvent,

    // Constants (for testing)
    PII_PATTERNS,
    EDUCATIONAL_DATA_PATTERNS,
    PLACEHOLDERS,
    PROTECTED_VOCABULARY,
};
