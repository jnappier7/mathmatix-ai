// services/aiService.js
//
// Thin conversational helper used by routes/assessment.js. It used to hold
// its own SDK client handle and call the provider directly, which made it one
// of three paths that bypassed the outbound-PII chokepoint in
// utils/openaiClient.js — every student turn of the placement assessment
// left unfiltered. It also exported only `callYourLLMService` while the
// route called `aiService.chat(...)`, so the route threw a TypeError and
// 500'd on every message. Both fixed here: one export shape the route
// actually uses, routed through the gateway like everything else.

const { callLLM } = require('../utils/llmGateway');

const ASSESSMENT_MODEL = process.env.ASSESSMENT_MODEL || 'gpt-4o';

/**
 * Multi-turn chat: the conversation so far plus an optional system prompt.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [systemPrompt]
 * @returns {Promise<string>} The assistant's reply text
 */
async function chat(messages, systemPrompt) {
    const history = (Array.isArray(messages) ? messages : [])
        .filter(m => m && m.role !== 'system' && typeof m.content === 'string');
    const messagesForAI = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...history]
        : history;

    const completion = await callLLM(ASSESSMENT_MODEL, messagesForAI, {
        temperature: 0.7,
        max_tokens: 600
    });
    return completion.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Single-shot generation from one fully assembled prompt (kept for callers
 * of the old name; nothing in routes/ uses it today).
 * @param {string} fullPrompt
 * @param {string} userId - for logging only; never sent to the provider
 */
async function callYourLLMService(fullPrompt, userId) {
    console.log(`LOG: Calling AI Service for user: ${userId}`);
    try {
        const completion = await callLLM(ASSESSMENT_MODEL, [
            { role: 'system', content: fullPrompt }
        ], { temperature: 0.7 });
        return completion.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
        console.error('AI Service Call Error:', error);
        throw new Error('Failed to get a valid response from the AI service.');
    }
}

module.exports = { chat, callYourLLMService };
