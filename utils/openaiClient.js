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

        const toolParams = {};
        if (Array.isArray(options.tools) && options.tools.length > 0) {
            toolParams.tools = options.tools;
            if (options.tool_choice) toolParams.tool_choice = options.tool_choice;
            if (typeof options.parallel_tool_calls === 'boolean') {
                toolParams.parallel_tool_calls = options.parallel_tool_calls;
            }
        }

        const completion = await retryWithExponentialBackoff(() =>
            openai.chat.completions.create({
                model: model,
                messages: messages,
                ...temperatureParam,
                ...tokenParam,
                ...toolParams,
                stream: options.stream || false,
                ...(options.response_format ? { response_format: options.response_format } : {}),
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

        const toolParams = {};
        if (Array.isArray(options.tools) && options.tools.length > 0) {
            toolParams.tools = options.tools;
            if (options.tool_choice) toolParams.tool_choice = options.tool_choice;
            if (typeof options.parallel_tool_calls === 'boolean') {
                toolParams.parallel_tool_calls = options.parallel_tool_calls;
            }
        }

        const stream = await openai.chat.completions.create({
            model: model,
            messages: messages,
            ...temperatureParam,
            ...tokenParam,
            ...toolParams,
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

/**
 * Moderate text content using OpenAI's omni-moderation-latest model.
 * Returns { flagged, categories, scores }. Throws on API errors so the caller
 * can decide whether to fail-open or fail-closed based on policy.
 *
 * @param {string} text
 * @returns {Promise<{flagged: boolean, categories: object, scores: object}>}
 */
async function moderateText(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { flagged: false, categories: {}, scores: {} };
    }

    const response = await retryWithExponentialBackoff(() =>
        openai.moderations.create({
            model: 'omni-moderation-latest',
            input: text.substring(0, 8000)
        })
    );

    const r = response.results?.[0] || {};
    return {
        flagged: !!r.flagged,
        categories: r.categories || {},
        scores: r.category_scores || {}
    };
}

/**
 * Moderate an image using OpenAI's omni-moderation-latest model.
 * Accepts a Buffer (preferred) or a URL string. Buffers are sent as
 * base64 data URIs.
 *
 * @param {Buffer|string} image - Image buffer, or http(s) URL
 * @param {string} [mimetype='image/png'] - MIME type for buffer inputs
 * @returns {Promise<{flagged: boolean, categories: object, scores: object}>}
 */
async function moderateImage(image, mimetype = 'image/png') {
    let imageUrl;
    if (Buffer.isBuffer(image)) {
        imageUrl = `data:${mimetype};base64,${image.toString('base64')}`;
    } else if (typeof image === 'string') {
        imageUrl = image;
    } else {
        throw new Error('moderateImage: image must be a Buffer or URL string');
    }

    const response = await retryWithExponentialBackoff(() =>
        openai.moderations.create({
            model: 'omni-moderation-latest',
            input: [{ type: 'image_url', image_url: { url: imageUrl } }]
        })
    );

    const r = response.results?.[0] || {};
    return {
        flagged: !!r.flagged,
        categories: r.categories || {},
        scores: r.category_scores || {}
    };
}

module.exports = {
    openai,
    retryWithExponentialBackoff,
    callLLM,
    callLLMStream,
    generateEmbedding,
    moderateText,
    moderateImage
};
