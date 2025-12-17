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

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODELS = {
    chat: 'gpt-4o-mini',           // Fast, cheap for chat
    grading: 'gpt-4o',             // Vision-capable for grading
    reasoning: 'gpt-4o',           // High-quality for complex tasks
    embedding: 'text-embedding-3-small'
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
    const maxTokens = options.maxTokens || 400;

    // Call LLM
    const completion = await callLLM(model, messagesForAI, {
        temperature,
        max_tokens: maxTokens
    });

    return completion.choices[0].message.content;
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
    const maxTokens = options.maxTokens || 400;

    // Call streaming LLM
    const stream = await callLLMStream(model, messagesForAI, {
        temperature,
        max_tokens: maxTokens
    });

    return stream;
}

/**
 * Vision-based grading - for homework images
 * @param {Object} context - Grading context
 * @param {string} context.imageDataUrl - Base64 image data URL
 * @param {string} context.prompt - Grading instructions
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The grading response
 */
async function gradeWithVision(context, options = {}) {
    const { imageDataUrl, prompt } = context;

    if (!imageDataUrl || !prompt) {
        throw new Error('imageDataUrl and prompt are required for vision grading');
    }

    const model = options.model || DEFAULT_MODELS.grading;
    const maxTokens = options.maxTokens || 1500;
    const temperature = options.temperature || 0.7;

    console.log(`[LLMGateway] Calling vision model: ${model}`);

    try {
        const completion = await retryWithExponentialBackoff(() =>
            openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
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
                max_tokens: maxTokens,
                temperature: temperature
            })
        );

        return completion.choices[0].message.content;

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

    const messages = [
        { role: 'user', content: prompt }
    ];

    const completion = await callLLM(model, messages, {
        temperature,
        max_tokens: maxTokens
    });

    return completion.choices[0].message.content;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // High-level gateway methods (recommended)
    chat,                   // Consistent chat with persona
    chatStream,             // Streaming chat with persona
    gradeWithVision,        // Vision-based grading
    reason,                 // Reasoning tasks

    // Low-level direct access (for special cases)
    callLLM,                // Direct LLM call
    callLLMStream,          // Direct streaming call
    generateEmbedding,      // Vector embeddings

    // Configuration
    DEFAULT_MODELS
};
