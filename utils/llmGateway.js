/**
 * LLM GATEWAY - Unified AI Brain for Mathmatix
 *
 * CTO REVIEW FIX: Centralized interface for ALL AI interactions
 *
 * PROBLEM: Routes were using different LLM clients inconsistently:
 * - chat.js used callLLM() from openaiClient.js
 * - gradeWork.js used raw axios POST to OpenAI
 * - Different prompts, different error handling, inconsistent persona
 *
 * SOLUTION: Single gateway that:
 * - Ensures consistent tutor persona across all routes
 * - Handles chat, vision, streaming, embeddings
 * - Centralizes retry logic and error handling
 * - Makes it easy to swap LLM providers in the future
 *
 * @module llmGateway
 */

const { openai, anthropic, retryWithExponentialBackoff, callLLM, callLLMStream, generateEmbedding } = require('./openaiClient');
const { generateSystemPrompt } = require('./prompt');
const { createAnonymizationContext, anonymizeMessages, anonymizeSystemPrompt, rehydrateResponse, logAnonymizationEvent } = require('./piiAnonymizer');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODELS = {
    chat: 'gpt-4o-mini',                     // Fast, cost-effective teaching model
    grading: 'claude-3-5-sonnet-20241022',   // Claude vision: superior handwriting recognition
    reasoning: 'gpt-4o-mini',                // Fast reasoning
    embedding: 'text-embedding-3-small'      // OpenAI embeddings (specialized task)
};

// ============================================================================
// CORE GATEWAY METHODS
// ============================================================================

/**
 * Unified chat interface - ensures consistent persona
 * @param {Object} context - Context for the conversation
 * @param {Object} context.user - User profile
 * @param {Object} context.tutor - Tutor profile
 * @param {Array} context.messages - Message history
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The AI response
 */
async function chat(context, options = {}) {
    const {
        user,
        tutor,
        messages,
        role = 'student',
        curriculumContext = null,
        uploadContext = null,
        masteryContext = null,
        likedMessages = [],
        fluencyContext = null
    } = context;

    // Generate consistent system prompt
    const systemPrompt = generateSystemPrompt(
        user,
        tutor?.name || 'Alex',
        null, // childProfile
        role,
        curriculumContext,
        uploadContext,
        masteryContext,
        likedMessages,
        fluencyContext
    );

    // Build messages array for AI
    const messagesForAI = [
        { role: 'system', content: systemPrompt },
        ...messages
    ];

    const model = options.model || DEFAULT_MODELS.chat;
    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1500;

    // PII Anonymization: Strip identifiable information before sending to AI provider
    const anonContext = createAnonymizationContext(user);
    const anonymizedMessages = anonymizeMessages(messagesForAI, anonContext);
    logAnonymizationEvent(user?._id, 'anonymize', { messageCount: anonymizedMessages.length });

    // Call LLM with anonymized messages
    const completion = await callLLM(model, anonymizedMessages, {
        temperature,
        max_tokens: maxTokens
    });

    // Rehydrate: Replace [Student] placeholders with real first name
    const rawResponse = completion.choices[0].message.content;
    return rehydrateResponse(rawResponse, user?.firstName);
}

/**
 * Streaming chat interface - ensures consistent persona with real-time streaming
 * @param {Object} context - Same as chat()
 * @param {Object} options - Additional options
 * @returns {Promise<Stream>} The streaming response
 */
async function chatStream(context, options = {}) {
    const {
        user,
        tutor,
        messages,
        role = 'student',
        curriculumContext = null,
        uploadContext = null,
        masteryContext = null,
        likedMessages = [],
        fluencyContext = null
    } = context;

    // Generate consistent system prompt
    const systemPrompt = generateSystemPrompt(
        user,
        tutor?.name || 'Alex',
        null,
        role,
        curriculumContext,
        uploadContext,
        masteryContext,
        likedMessages,
        fluencyContext
    );

    // Build messages array for AI
    const messagesForAI = [
        { role: 'system', content: systemPrompt },
        ...messages
    ];

    const model = options.model || DEFAULT_MODELS.chat;
    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1500;

    // PII Anonymization: Strip identifiable information before sending to AI provider
    const anonContext = createAnonymizationContext(user);
    const anonymizedMessages = anonymizeMessages(messagesForAI, anonContext);
    logAnonymizationEvent(user?._id, 'anonymize-stream', { messageCount: anonymizedMessages.length });

    // Call streaming LLM with anonymized messages
    // Note: Stream rehydration happens at the route level where chunks are processed
    const stream = await callLLMStream(model, anonymizedMessages, {
        temperature,
        max_tokens: maxTokens
    });

    return { stream, anonContext };
}

/**
 * Vision-based grading - for homework images
 * Uses OpenAI vision API for image analysis
 * @param {Object} context - Grading context
 * @param {string} context.imageDataUrl - Base64 image data URL
 * @param {string} context.prompt - Grading instructions
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The grading response
 */
async function gradeWithVision(context, options = {}) {
    const { imageDataUrl, prompt, user } = context;

    if (!imageDataUrl || !prompt) {
        throw new Error('imageDataUrl and prompt are required for vision grading');
    }

    const model = options.model || DEFAULT_MODELS.grading;
    const maxTokens = options.maxTokens || 1500;
    const temperature = options.temperature || 0.7;

    // PII Anonymization: Strip student info from grading prompts
    const anonContext = createAnonymizationContext(user || null);
    const anonymizedPrompt = anonymizeSystemPrompt(prompt, anonContext);

    console.log(`[LLMGateway] Calling vision model: ${model}`);

    const isClaudeModel = model.startsWith('claude-');

    try {
        if (isClaudeModel && anthropic) {
            // Claude vision API (superior image analysis)
            // Extract base64 data from data URL
            const base64Match = imageDataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
            if (!base64Match) {
                throw new Error('Invalid image data URL format');
            }
            const [, mediaType, base64Data] = base64Match;

            const completion = await retryWithExponentialBackoff(() =>
                anthropic.messages.create({
                    model: model,
                    max_tokens: maxTokens,
                    temperature: temperature,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: `image/${mediaType}`,
                                        data: base64Data
                                    }
                                },
                                {
                                    type: 'text',
                                    text: anonymizedPrompt
                                }
                            ]
                        }
                    ]
                })
            );

            return rehydrateResponse(completion.content[0].text, user?.firstName);

        } else {
            // OpenAI vision API
            // Use max_completion_tokens for newer gpt-4o/gpt-5 models
            const tokenParam = (model.includes('gpt-5') || model.includes('gpt-4o'))
                ? { max_completion_tokens: maxTokens }
                : { max_tokens: maxTokens };

            const completion = await retryWithExponentialBackoff(() =>
                openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: anonymizedPrompt
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageDataUrl,
                                        detail: 'high'
                                    }
                                }
                            ]
                        }
                    ],
                    ...tokenParam,
                    temperature: temperature
                })
            );

            return rehydrateResponse(completion.choices[0].message.content, user?.firstName);
        }

    } catch (error) {
        console.error('[LLMGateway] Vision grading failed:', error.message);
        throw error;
    }
}

/**
 * Generate reasoning-based response for complex tasks
 * @param {string} prompt - The task prompt
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The AI response
 */
async function reason(prompt, options = {}) {
    const model = options.model || DEFAULT_MODELS.reasoning;
    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1000;

    // PII Anonymization: Strip any PII from reasoning prompts
    const anonContext = createAnonymizationContext(options.user || null);
    const anonymizedPrompt = anonymizeSystemPrompt(prompt, anonContext);

    const messages = [
        { role: 'user', content: anonymizedPrompt }
    ];

    const completion = await callLLM(model, messages, {
        temperature,
        max_tokens: maxTokens
    });

    return rehydrateResponse(completion.choices[0].message.content, options.user?.firstName);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // High-level gateway methods (recommended)
    chat,                   // Consistent chat with persona
    chatStream,             // Streaming chat with persona (returns { stream, anonContext })
    gradeWithVision,        // Vision-based grading
    reason,                 // Reasoning tasks

    // Low-level direct access (for special cases)
    callLLM,                // Direct LLM call
    callLLMStream,          // Direct streaming call
    generateEmbedding,      // Vector embeddings

    // PII Anonymization (for routes that call callLLM/callLLMStream directly)
    createAnonymizationContext,
    anonymizeMessages,
    rehydrateResponse,

    // Configuration
    DEFAULT_MODELS
};
