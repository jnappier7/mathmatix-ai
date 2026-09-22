/**
 * LLM GATEWAY - Unified AI Brain for Mathmatix
 *
 * Centralized interface for ALL AI interactions.
 * Provider-agnostic: model ids starting with `claude` are dispatched to
 * Anthropic by utils/openaiClient.js, everything else to OpenAI.
 *
 * - Ensures consistent tutor persona across all routes
 * - Handles chat, vision, streaming, embeddings
 * - Centralizes retry logic and error handling
 *
 * Every method here, and every callLLM* re-exported below, goes through the
 * outbound-PII chokepoint in utils/openaiClient.js. Nothing in this file
 * touches the provider SDK directly any more — gradeWithVision was the last
 * holdout — and tests/unit/outboundPiiScope.test.js fails the build if a
 * direct SDK call reappears anywhere outside openaiClient.js.
 *
 * @module llmGateway
 */

const { callLLM, callLLMStructured, callLLMStream, generateEmbedding } = require('./openaiClient');
const { generateSystemPrompt } = require('./prompt');
const { createAnonymizationContext, anonymizeMessages, anonymizeSystemPrompt, rehydrateResponse, logAnonymizationEvent } = require('./piiAnonymizer');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODELS = {
    chat: 'gpt-4o-mini',                     // Fast, cost-effective teaching model
    grading: 'gpt-4o',                       // GPT-4o vision for handwriting recognition
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
    const temperature = options.temperature || 0.5;
    const maxTokens = options.maxTokens || 1500;

    // PII Anonymization: Strip identifiable information before sending to AI provider
    const anonContext = createAnonymizationContext(user);
    const anonymizedMessages = anonymizeMessages(messagesForAI, anonContext);
    logAnonymizationEvent(user?._id, 'anonymize', { messageCount: anonymizedMessages.length });

    // Call LLM with anonymized messages (the chokepoint gets the same context,
    // so its own strip/rehydrate pass is a no-op rather than a second opinion)
    const completion = await callLLM(model, anonymizedMessages, {
        temperature,
        max_tokens: maxTokens,
        anonContext
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
    const temperature = options.temperature || 0.5;
    const maxTokens = options.maxTokens || 1500;

    // PII Anonymization: Strip identifiable information before sending to AI provider
    const anonContext = createAnonymizationContext(user);
    const anonymizedMessages = anonymizeMessages(messagesForAI, anonContext);
    logAnonymizationEvent(user?._id, 'anonymize-stream', { messageCount: anonymizedMessages.length });

    // Call streaming LLM with anonymized messages
    // Note: Stream rehydration happens at the route level where chunks are processed
    const stream = await callLLMStream(model, anonymizedMessages, {
        temperature,
        max_tokens: maxTokens,
        anonContext
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
    const temperature = options.temperature || 0.5;

    // PII Anonymization: Strip student info from grading prompts
    const anonContext = createAnonymizationContext(user || null);
    const anonymizedPrompt = anonymizeSystemPrompt(prompt, anonContext);

    console.log(`[LLMGateway] Calling vision model: ${model}`);

    try {
        // Through the chokepoint, not the SDK: this used to be the one
        // gateway method that called openai.chat.completions.create itself,
        // which made it the one path that bypassed the outbound strip and
        // its request scope. callLLM handles the vision payload, the
        // max_completion_tokens mapping, the timeout and the retry.
        //
        // The image itself cannot be filtered — a name written at the top of
        // a worksheet goes out in the pixels. That is disclosed on
        // public/subprocessors.html and is the reason photo grading is a
        // premium, consented feature rather than a default.
        const completion = await callLLM(model, [
            {
                role: 'user',
                content: [
                    { type: 'text', text: anonymizedPrompt },
                    { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
                ]
            }
        ], {
            temperature,
            max_tokens: maxTokens,
            ...(user ? { anonContext } : {})
        });

        return rehydrateResponse(completion.choices[0].message.content, user?.firstName);

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
    const temperature = options.temperature || 0.5;
    const maxTokens = options.maxTokens || 1000;

    // PII Anonymization: Strip any PII from reasoning prompts
    const anonContext = createAnonymizationContext(options.user || null);
    const anonymizedPrompt = anonymizeSystemPrompt(prompt, anonContext);

    const messages = [
        { role: 'user', content: anonymizedPrompt }
    ];

    // Hand the same context to the chokepoint so it strips and rehydrates
    // with it; with no user the chokepoint falls back to the request scope.
    const completion = await callLLM(model, messages, {
        temperature,
        max_tokens: maxTokens,
        ...(options.user ? { anonContext } : {})
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
    callLLMStructured,      // JSON-schema response, parsed
    callLLMStream,          // Direct streaming call
    generateEmbedding,      // Vector embeddings

    // PII Anonymization (for routes that call callLLM/callLLMStream directly)
    createAnonymizationContext,
    anonymizeMessages,
    rehydrateResponse,

    // Configuration
    DEFAULT_MODELS
};
