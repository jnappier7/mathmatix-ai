// utils/openaiClient.js - OpenAI-only LLM client with retry logic

const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Log OpenAI client status
if (process.env.OPENAI_API_KEY) {
    console.log('✅ [Init] OpenAI client initialized successfully');
} else {
    console.warn('⚠️  [Init] OPENAI_API_KEY not found - OpenAI models will not be available');
}


// Utility for exponential backoff and retry
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
                // Handle both Headers objects (.get()) and plain objects (bracket access)
                const retryAfterHeader =
                    error.response?.headers?.get?.('Retry-After') ||
                    error.response?.headers?.['retry-after'] ||
                    error.headers?.get?.('Retry-After') ||
                    error.headers?.['retry-after'];
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
 * Centralized function to call the LLM via OpenAI.
 * @param {string} model - The model name (e.g., "gpt-4o-mini", "gpt-4o")
 * @param {Array<Object>} messages - Array of message objects for the AI.
 * @param {Object} options - Additional options like temperature, max_tokens.
 * @returns {Promise<Object>} The completion object from the AI.
 */
async function callLLM(model, messages, options = {}) {
    try {
        console.log(`LOG: Calling OpenAI model (${model})`);

        // CRITICAL FIX: Newer OpenAI models (gpt-4o, gpt-5, etc.) require max_completion_tokens
        // Legacy models still use max_tokens
        const tokenParam = options.max_tokens ?
            (model.includes('gpt-5') || model.includes('gpt-4o') ?
                { max_completion_tokens: options.max_tokens } :
                { max_tokens: options.max_tokens })
            : {};

        // CRITICAL FIX: Some models (like gpt-5-nano) only support default temperature
        // Don't pass temperature for these models
        const temperatureParam = model.includes('nano') ?
            {} :
            { temperature: options.temperature || 0.7 };

        const completion = await retryWithExponentialBackoff(() =>
            openai.chat.completions.create({
                model: model,
                messages: messages,
                ...temperatureParam,
                ...tokenParam,
                stream: options.stream || false,
            })
        );
        return completion;
    } catch (openAiError) {
        console.error(`ERROR: OpenAI model (${model}) failed:`, openAiError.message);
        throw openAiError;
    }
}

/**
 * Streaming version of callLLM - returns a stream object for real-time responses
 * @param {string} model - The model name (e.g., "gpt-4o-mini", "gpt-4o")
 * @param {Array<Object>} messages - Array of message objects for the AI
 * @param {Object} options - Additional options like temperature, max_tokens
 * @returns {Promise<Stream>} The stream object
 */
async function callLLMStream(model, messages, options = {}) {
    try {
        console.log(`LOG: Calling OpenAI streaming (${model})`);

        // CRITICAL FIX: Newer OpenAI models require max_completion_tokens
        const tokenParam = options.max_tokens ?
            (model.includes('gpt-5') || model.includes('gpt-4o') ?
                { max_completion_tokens: options.max_tokens } :
                { max_tokens: options.max_tokens })
            : {};

        // CRITICAL FIX: Some models (like gpt-5-nano) only support default temperature
        const temperatureParam = model.includes('nano') ?
            {} :
            { temperature: options.temperature || 0.7 };

        const stream = await openai.chat.completions.create({
            model: model,
            messages: messages,
            ...temperatureParam,
            ...tokenParam,
            stream: true,
        });
        return stream;
    } catch (openAiError) {
        console.error(`ERROR: OpenAI streaming failed for ${model}:`, openAiError.message);
        throw openAiError;
    }
}

/**
 * Generate text embedding using OpenAI's text-embedding-3-small
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

module.exports = {
    openai,
    retryWithExponentialBackoff,
    callLLM,
    callLLMStream,
    generateEmbedding
};
