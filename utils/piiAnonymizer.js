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

    // Phone numbers (various formats)
    phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

    // MongoDB ObjectIds (24 hex chars)
    objectId: /\b[0-9a-fA-F]{24}\b/g,

    // SSN patterns
    ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,

    // Date of birth patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
    dateOfBirth: /\b(?:born|dob|birthday|date of birth)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,

    // Street addresses (number + street name pattern)
    address: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\.?\b/gi,
};

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

    if (userProfile) {
        const firstName = userProfile.firstName || '';
        const lastName = userProfile.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();

        // Always replace full name
        if (fullName.length > 1) {
            nameMap.set(fullName.toLowerCase(), PLACEHOLDERS.student);
        }

        // Replace last name always
        if (lastName && lastName.length > 1) {
            nameMap.set(lastName.toLowerCase(), PLACEHOLDERS.student);
        }

        // Replace first name unless explicitly allowed
        if (!allowFirstName && firstName && firstName.length > 1) {
            nameMap.set(firstName.toLowerCase(), PLACEHOLDERS.student);
        }
    }

    // Add any additional names (teacher, parent, school, etc.)
    for (const [name, placeholder] of Object.entries(additionalNames)) {
        if (name && name.length > 1) {
            nameMap.set(name.toLowerCase(), placeholder);
        }
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

    // Step 2: Replace known names (case-insensitive, whole word)
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
function rehydrateResponse(responseText, firstName) {
    if (!responseText || typeof responseText !== 'string') return responseText;
    if (!firstName) return responseText;

    // Replace all variations of the student placeholder
    return responseText
        .replace(/\[Student\]/g, firstName)
        .replace(/\[student\]/g, firstName)
        .replace(/\[STUDENT\]/g, firstName);
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

    // Helpers
    buildAnonymizationContextFromRequest,
    logAnonymizationEvent,

    // Constants (for testing)
    PII_PATTERNS,
    PLACEHOLDERS,
};
