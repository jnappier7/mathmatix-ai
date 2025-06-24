// utils/openaiClient.js - MODIFIED (ADD RETRY WITH EXPONENTIAL BACKOFF)
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Utility for exponential backoff
async function retryWithExponentialBackoff(fn, retries = 5, delay = 1000) {
    let attempts = 0;
    while (attempts < retries) {
        try {
            return await fn();
        } catch (error) {
            // Check for 429 (Too Many Requests) status
            if (error.status === 429) {
                attempts++;
                const retryAfter = error.headers && error.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay; // Use Retry-After if available
                console.warn(`Rate limit hit (429). Retrying in ${waitTime / 1000}s... (Attempt ${attempts}/${retries})`);
                await new Promise(res => setTimeout(res, waitTime));
                delay *= 2; // Exponentially increase delay for next retry if Retry-After wasn't used
            } else {
                // If it's not a 429 or we're out of retries, re-throw the error
                throw error;
            }
        }
    }
    throw new Error("Max retries exceeded due to rate limiting.");
}

// Export the OpenAI client and the retry utility
module.exports = {
    openai,
    retryWithExponentialBackoff
};