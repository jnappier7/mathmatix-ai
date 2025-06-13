// services/aiService.js

const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize clients once using environment variables
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// You can also initialize other clients here if needed
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

/**
 * A centralized function to call your primary LLM for conversational tasks.
 * This implementation uses OpenAI's gpt-4o, consistent with your main chat.js route.
 * @param {string} fullPrompt - The complete prompt (system + task) to send to the AI.
 * @param {string} userId - The user's ID for logging or future session management with the AI service.
 * @returns {Promise<string>} The AI-generated text response.
 */
async function callYourLLMService(fullPrompt, userId) {
    // For robust production use, consider wrapping this in more detailed error handling and logging.
    console.log(`LOG: Calling AI Service for user: ${userId}`);
    
    try {
        // We are using a simplified message array here. For a multi-turn conversation,
        // you would pass the full history. This is suitable for single-shot generation
        // like creating lesson openers or hints based on a rich system prompt.
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: fullPrompt }
            ],
            temperature: 0.7, // A good balance of creativity and predictability
            // You can add other parameters like max_tokens if needed
        });

        const aiResponse = completion.choices[0].message.content.trim();
        console.log(`LOG: Received AI response for user: ${userId}`);
        return aiResponse;

    } catch (error) {
        // Log the detailed error from the AI service
        console.error("AI Service Call Error:", error);
        // Throw a new error to be caught by the calling route handler
        throw new Error("Failed to get a valid response from the AI service.");
    }
}

module.exports = { callYourLLMService };// JavaScript Document