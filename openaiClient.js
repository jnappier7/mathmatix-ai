// utils/openaiClient.js - MODIFIED (OpenAI primary, Claude fallback, with retry logic)

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
 * Centralized function to call the primary LLM (OpenAI) with a fallback (Claude).
 * @param {string} model - The primary model name (e.g., "gpt-4o", "gpt-3.5-turbo").
 * @param {Array<Object>} messages - Array of message objects for the AI.
 * @param {Object} options - Additional options like temperature, max_tokens.
 * @returns {Promise<Object>} The completion object from the AI.
 */
async function callLLM(primaryModel, messages, options = {}) {
    // Attempt with primary model (OpenAI)
    try {
        console.log(`LOG: Calling primary model (${primaryModel})`);
        const completion = await retryWithExponentialBackoff(() =>
            openai.chat.completions.create({
                model: primaryModel,
                messages: messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens,
                stream: options.stream || false,
            })
        );
        return completion;
    } catch (openAiError) {
        console.warn(`WARN: Primary model (${primaryModel}) failed:`, openAiError.message);
        console.warn('Attempting fallback to Anthropic Claude-3 Haiku...');

        // Attempt with fallback model (Anthropic Claude-3 Haiku)
        if (anthropic) {
            try {
                // Convert messages to Anthropic format (user/assistant)
                const anthropicMessages = messages.map(msg => {
                    if (msg.role === 'system') {
                        // System message needs to be handled differently in Anthropic API (via system parameter)
                        // Or prepended to the first user message. For simplicity here, we'll assume it's handled by prompt.js
                        // and Anthropic messages are just user/assistant
                        return { role: 'user', content: msg.content }; // Anthropic 'system' role is a top-level parameter
                    }
                    return {
                        role: msg.role === 'assistant' ? 'assistant' : 'user',
                        content: msg.content
                    };
                }).filter(msg => msg.role !== 'system'); // Filter out system messages if they are handled as a top-level param

                // For Anthropic, system messages are a separate parameter, not part of 'messages' array
                const systemMessage = messages.find(msg => msg.role === 'system')?.content;

                console.log('LOG: Calling Anthropic Claude-3 Haiku');
                const completion = await retryWithExponentialBackoff(() =>
                    anthropic.messages.create({
                        model: "claude-3-haiku-20240307", // Specific Claude model
                        max_tokens: options.max_tokens || 1000, // Claude requires max_tokens
                        temperature: options.temperature || 0.7,
                        messages: anthropicMessages,
                        system: systemMessage // Pass system prompt as a dedicated parameter
                    })
                );

                // Convert Anthropic response to a format similar to OpenAI for consistency
                return {
                    choices: [{
                        message: {
                            content: completion.content[0].text,
                            role: 'assistant'
                        }
                    }]
                };

            } catch (claudeError) {
                console.error("ERROR: Fallback model (Claude-3 Haiku) also failed:", claudeError.message);
                throw new Error("Both primary and fallback AI models failed to generate a response.");
            }
        } else {
            console.warn("WARN: Anthropic API Key not found. Fallback not available.");
            throw openAiError; // Re-throw original OpenAI error if no Claude key
        }
    }
}

// Export the OpenAI client (still useful for direct access if needed) and the retry utility
module.exports = {
    openai, // Renamed from 'openai' to 'openaiClient' in some previous versions, but keep original if it was 'openai'
    anthropic,
    retryWithExponentialBackoff,
    callLLM // New centralized LLM call function
};