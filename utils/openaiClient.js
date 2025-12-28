// utils/openaiClient.js - MODIFIED (Claude primary, GPT fallback, with retry logic)

const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk"); // For Claude fallback

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Anthropic (Claude) client, if API key is present
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
}


// Utility for exponential backoff and retry (for both OpenAI and Anthropic)
async function retryWithExponentialBackoff(fn, retries = 5, delay = 1000) {
    let attempts = 0;
    while (attempts < retries) {
        try {
            return await fn();
        } catch (error) {
            // Check for 429 (Too Many Requests) or other transient errors
            const isRateLimit = (error.status === 429 || (error.response && error.response.status === 429));
            const isTransientError = isRateLimit || (error.status >= 500 && error.status < 600); // 5xx errors

            if (isTransientError) {
                attempts++;
                // Prioritize 'Retry-After' header if available (for HTTP errors)
                const retryAfterHeader = error.response?.headers?.get('Retry-After') || error.headers?.get('Retry-After');
                const waitTime = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : delay * (2 ** (attempts - 1)); // Exponential backoff

                console.warn(`AI Service transient error (Status: ${error.status || 'N/A'}). Retrying in ${waitTime / 1000}s... (Attempt ${attempts}/${retries})`);
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                // If it's not a transient error or we're out of retries, re-throw the error
                throw error;
            }
        }
    }
    throw new Error("Max retries exceeded due to persistent AI service issues.");
}

/**
 * Centralized function to call the LLM with intelligent routing.
 * PRIMARY: Claude Sonnet 3.5 (best teaching & reasoning)
 * FALLBACK: GPT-4o-mini (fast & cheap backup)
 * @param {string} model - The model name (e.g., "claude-3-5-sonnet-20240620", "gpt-4o-mini")
 * @param {Array<Object>} messages - Array of message objects for the AI.
 * @param {Object} options - Additional options like temperature, max_tokens.
 * @returns {Promise<Object>} The completion object from the AI.
 */
async function callLLM(model, messages, options = {}) {
    // Detect if this is a Claude or OpenAI model
    const isClaudeModel = model.startsWith('claude-');

    if (isClaudeModel && anthropic) {
        // PRIMARY PATH: Try Claude first
        try {
            console.log(`LOG: Calling primary model (${model})`);

            // Convert messages to Anthropic format
            const anthropicMessages = messages.filter(msg => msg.role !== 'system').map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));

            // Extract system message
            const systemMessage = messages.find(msg => msg.role === 'system')?.content;

            const completion = await retryWithExponentialBackoff(() =>
                anthropic.messages.create({
                    model: model,
                    max_tokens: options.max_tokens || 4000, // Claude supports up to 8k, use 4k default
                    temperature: options.temperature || 0.7,
                    messages: anthropicMessages,
                    system: systemMessage
                })
            );

            // Convert to OpenAI format for consistency
            return {
                choices: [{
                    message: {
                        content: completion.content[0].text,
                        role: 'assistant'
                    }
                }]
            };

        } catch (claudeError) {
            console.warn(`WARN: Primary model (${model}) failed:`, claudeError.message);
            console.warn('Attempting fallback to GPT-4o-mini...');

            // FALLBACK: Try GPT
            try {
                const fallbackModel = 'gpt-4o-mini';
                console.log(`LOG: Calling fallback model (${fallbackModel})`);
                const completion = await retryWithExponentialBackoff(() =>
                    openai.chat.completions.create({
                        model: fallbackModel,
                        messages: messages,
                        temperature: options.temperature || 0.7,
                        max_tokens: options.max_tokens,
                        stream: options.stream || false,
                    })
                );
                return completion;
            } catch (gptError) {
                console.error("ERROR: Fallback model (GPT-4o-mini) also failed:", gptError.message);
                throw new Error("Both primary (Claude) and fallback (GPT) AI models failed.");
            }
        }

    } else {
        // OpenAI model requested (or no Anthropic key)
        try {
            console.log(`LOG: Calling OpenAI model (${model})`);
            const completion = await retryWithExponentialBackoff(() =>
                openai.chat.completions.create({
                    model: model,
                    messages: messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_tokens,
                    stream: options.stream || false,
                })
            );
            return completion;
        } catch (openAiError) {
            console.error(`ERROR: OpenAI model (${model}) failed:`, openAiError.message);
            throw openAiError;
        }
    }
}

/**
 * Streaming version of callLLM - returns a stream object for real-time responses
 * Supports both Claude and OpenAI streaming
 * @param {string} model - The model name (e.g., "claude-3-5-sonnet-20240620", "gpt-4o-mini")
 * @param {Array<Object>} messages - Array of message objects for the AI
 * @param {Object} options - Additional options like temperature, max_tokens
 * @returns {Promise<Stream>} The stream object
 */
async function callLLMStream(model, messages, options = {}) {
    const isClaudeModel = model.startsWith('claude-');

    if (isClaudeModel && anthropic) {
        // Claude streaming
        try {
            console.log(`LOG: Calling Claude streaming (${model})`);

            // Convert messages to Anthropic format
            const anthropicMessages = messages.filter(msg => msg.role !== 'system').map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));

            const systemMessage = messages.find(msg => msg.role === 'system')?.content;

            const stream = await anthropic.messages.create({
                model: model,
                max_tokens: options.max_tokens || 4000,
                temperature: options.temperature || 0.7,
                messages: anthropicMessages,
                system: systemMessage,
                stream: true
            });

            return stream;
        } catch (claudeError) {
            console.error(`ERROR: Claude streaming failed for ${model}:`, claudeError.message);
            throw claudeError;
        }
    } else {
        // OpenAI streaming
        try {
            console.log(`LOG: Calling OpenAI streaming (${model})`);
            const stream = await openai.chat.completions.create({
                model: model,
                messages: messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens,
                stream: true,
            });
            return stream;
        } catch (openAiError) {
            console.error(`ERROR: OpenAI streaming failed for ${model}:`, openAiError.message);
            throw openAiError;
        }
    }
}

/**
 * DIRECTIVE 3: Generate text embedding using OpenAI's text-embedding-3-small
 * @param {string} text - The text to embed
 * @returns {Promise<Array<number>>} The embedding vector
 */
async function generateEmbedding(text) {
    try {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('Text must be a non-empty string');
        }

        // Truncate to first 8000 characters to avoid token limits
        const truncatedText = text.substring(0, 8000);

        console.log(`LOG: Generating embedding for text (${truncatedText.length} chars)`);

        const response = await retryWithExponentialBackoff(() =>
            openai.embeddings.create({
                model: "text-embedding-3-small",
                input: truncatedText,
                encoding_format: "float"
            })
        );

        const embedding = response.data[0].embedding;

        console.log(`✅ [Embedding] Generated embedding: ${embedding.length} dimensions`);

        return embedding;

    } catch (error) {
        console.error(`ERROR: Embedding generation failed:`, error.message);
        throw error;
    }
}

// Export the OpenAI client (still useful for direct access if needed) and the retry utility
module.exports = {
    openai, // Renamed from 'openai' to 'openaiClient' in some previous versions, but keep original if it was 'openai'
    anthropic,
    retryWithExponentialBackoff,
    callLLM, // Centralized LLM call function (non-streaming)
    callLLMStream, // Streaming version for real-time responses
    generateEmbedding // DIRECTIVE 3: Vector embedding generation
};