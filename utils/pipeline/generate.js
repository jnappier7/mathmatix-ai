/**
 * GENERATE STAGE — Build the minimal prompt and call the LLM
 *
 * The key insight: the decision has already been made. This stage
 * only needs to tell the model WHAT to say, not teach it pedagogy.
 *
 * The prompt is small because most logic is deterministic.
 * The LLM is a language interface, not the decision-maker.
 *
 * @module pipeline/generate
 */

const { callLLM, callLLMStream } = require('../llmGateway');
const { ACTIONS } = require('./decide');
const { STATIC_RULES } = require('../promptCompact');

const PRIMARY_CHAT_MODEL = 'gpt-4o-mini';

/**
 * Build the action-specific instruction for the LLM.
 * This replaces the monolithic system prompt with a focused directive.
 */
function buildActionPrompt(decision) {
  const { action, diagnosis, observation, directives } = decision;

  const parts = [];

  // Always include directives from the decide stage
  if (directives.length > 0) {
    parts.push(`--- ACTION DIRECTIVES ---\n${directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`);
  }

  // Action-specific context
  switch (action) {
    case ACTIONS.CONFIRM_CORRECT:
      parts.push(`The student answered "${observation.answer?.value}" and it is CORRECT (verified answer: ${diagnosis.correctAnswer}).`);
      parts.push('Confirm immediately. Be specific about what they did right. Then present the next problem or check understanding.');
      break;

    case ACTIONS.GUIDE_INCORRECT:
      parts.push(`The student answered "${observation.answer?.value}" but the correct answer is "${diagnosis.correctAnswer}".`);
      parts.push('Do NOT reveal the correct answer. Ask a question that exposes why their approach went wrong.');
      break;

    case ACTIONS.RETEACH_MISCONCEPTION:
      if (diagnosis.misconception) {
        parts.push(`--- MISCONCEPTION DETECTED ---`);
        parts.push(`Name: ${diagnosis.misconception.name}`);
        if (diagnosis.misconception.description) parts.push(`What happened: ${diagnosis.misconception.description}`);
        if (diagnosis.misconception.fix) parts.push(`Reteaching strategy: ${diagnosis.misconception.fix}`);
        if (diagnosis.misconception.testQuestion) parts.push(`Follow-up problem: ${diagnosis.misconception.testQuestion}`);
        parts.push('Address the root cause, not just the symptom. Do NOT reveal the answer.');
      }
      break;

    case ACTIONS.WORKED_EXAMPLE:
      parts.push('Student has struggled with multiple attempts. Show a WORKED EXAMPLE using a PARALLEL problem (same skill, different numbers).');
      parts.push('Walk through step by step with think-aloud. Then have them try their original problem.');
      break;

    case ACTIONS.EXIT_RAMP:
      parts.push('Student is stuck and has tried multiple times. Use the EXIT RAMP:');
      parts.push('1. Work a parallel problem (same skill, different numbers) step-by-step');
      parts.push('2. Then ask them to apply the same method to their problem');
      parts.push('3. If STILL stuck, offer to skip and move on');
      parts.push('NEVER reveal the answer. The answer stays hidden. Always.');
      break;

    case ACTIONS.SCAFFOLD_DOWN:
      parts.push('Student needs more support. Lower the barrier:');
      if (decision.scaffoldLevel >= 5) {
        parts.push('Rephrase as a yes/no or multiple-choice question.');
      } else {
        parts.push('Break the problem into a simpler sub-question.');
      }
      break;

    case ACTIONS.HINT:
      parts.push('Student asked for help. Provide a hint, not the answer.');
      parts.push('Ask a guiding sub-question that points toward the next step.');
      break;

    case ACTIONS.CHECK_UNDERSTANDING:
      parts.push('Deploy an evidence-gathering move:');
      parts.push('- "Can you explain why we did that step?" (teach-back)');
      parts.push('- "Find the error: I\'ll solve one wrong. Catch my mistake." (find-the-error)');
      parts.push('- "Which of these uses the same strategy?" (identification)');
      parts.push('Do NOT advance without proof of understanding.');
      break;

    case ACTIONS.ACKNOWLEDGE_FRUSTRATION:
      parts.push('Student is frustrated. Acknowledge it briefly and genuinely (1 sentence).');
      parts.push('Then offer a concrete next step: easier problem, different approach, or short break.');
      break;

    case ACTIONS.REDIRECT_TO_MATH:
      parts.push('Student went off-topic. Redirect gently to math.');
      parts.push('Brief, not preachy. One sentence redirect, then offer a problem.');
      break;

    case ACTIONS.PRESENT_PROBLEM:
      parts.push('Present the next problem for the student to work on.');
      break;

    case ACTIONS.PHASE_INSTRUCTION:
      // Phase prompt is already set in decision.phasePrompt
      break;

    case ACTIONS.CONTINUE_CONVERSATION:
    default:
      // No special action context needed
      break;
  }

  return parts.join('\n\n');
}

/**
 * Build the verification context that gets injected into the user message.
 * This is the hidden answer verification the AI uses for grading.
 */
function buildVerificationContext(diagnosis) {
  if (!diagnosis || diagnosis.type === 'no_answer') return null;

  if (diagnosis.isCorrect === true) {
    return `[ANSWER_PRE_CHECK: VERIFIED CORRECT. The student's answer "${diagnosis.answer}" matches the correct answer "${diagnosis.correctAnswer}". Confirm they are correct immediately. Do NOT say "let's check", "almost", "not quite", or imply any doubt.]`;
  }

  if (diagnosis.isCorrect === false) {
    return `[ANSWER_PRE_CHECK: VERIFIED INCORRECT. The student answered "${diagnosis.answer}" but the correct answer is "${diagnosis.correctAnswer}". Guide them toward the correct answer using Socratic method. NEVER reveal the answer.]`;
  }

  return null;
}

/**
 * Build streak warning context for IDK/give-up patterns.
 */
function buildStreakWarning(streaks) {
  if (!streaks) return null;
  const { idkCount, giveUpCount, recentWrongCount } = streaks;

  if (idkCount < 3 && giveUpCount < 1 && recentWrongCount < 3) return null;

  const parts = ['[ANSWER_PERSISTENCE_ALERT:'];
  if (idkCount >= 3) parts.push(`Student has said "idk" ${idkCount} times recently.`);
  if (giveUpCount >= 1) parts.push('Student is asking you to just give them the answer.');
  if (recentWrongCount >= 3) parts.push(`Student has gotten ${recentWrongCount} wrong answers recently.`);
  parts.push('CRITICAL: Do NOT reveal the answer. Use exit ramp if needed.]');

  return parts.join(' ');
}

/**
 * Assemble the full message array for the LLM call.
 *
 * @param {Object} decision - From decide stage
 * @param {Object} promptContext - Existing prompt context from chat.js
 * @param {string} promptContext.systemPrompt - The base system prompt
 * @param {Array}  promptContext.messages - Formatted conversation history
 * @param {Object} promptContext.mathResult - Math verification result
 * @returns {Object} { messages, model, options }
 */
function assemblePrompt(decision, promptContext) {
  const { systemPrompt, messages: conversationMessages } = promptContext;

  // Start with the base system prompt
  let fullSystemPrompt = systemPrompt;

  // Inject phase-specific prompt if available
  if (decision.phasePrompt) {
    fullSystemPrompt += '\n\n' + decision.phasePrompt;
  }

  // Inject action-specific prompt
  const actionPrompt = buildActionPrompt(decision);
  if (actionPrompt) {
    fullSystemPrompt += '\n\n--- CURRENT ACTION ---\n' + actionPrompt;
  }

  // Clone messages to avoid mutation
  const messages = conversationMessages.map(m => ({ ...m }));

  // Inject verification context into last user message
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const verificationCtx = buildVerificationContext(decision.diagnosis);
      if (verificationCtx) {
        lastMsg.content += '\n\n' + verificationCtx;
      }

      const streakWarning = buildStreakWarning(decision.observation.streaks);
      if (streakWarning) {
        lastMsg.content += '\n\n' + streakWarning;
      }
    }
  }

  return {
    messages: [{ role: 'system', content: fullSystemPrompt }, ...messages],
    model: PRIMARY_CHAT_MODEL,
    options: { temperature: 0.7, max_tokens: 1500 },
  };
}

/**
 * Call the LLM and return the response text.
 *
 * @param {Object} assembled - From assemblePrompt
 * @param {Object} options
 * @param {boolean} options.stream - Whether to use streaming
 * @param {Object} options.res - Express response object (for streaming)
 * @returns {Promise<string>} The AI response text
 */
async function generate(assembled, options = {}) {
  const { messages, model, options: llmOptions } = assembled;

  if (options.stream && options.res) {
    return await generateStreaming(model, messages, llmOptions, options.res);
  }

  const completion = await callLLM(model, messages, llmOptions);
  return completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
}

/**
 * Streaming generation via SSE.
 */
async function generateStreaming(model, messages, llmOptions, res) {
  const { callLLMStream } = require('../llmGateway');

  try {
    const stream = await callLLMStream(model, messages, llmOptions);
    let fullResponse = '';
    const isClaudeModel = model.startsWith('claude-');
    let clientDisconnected = false;

    res.req.on('close', () => { clientDisconnected = true; });

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      let content = '';
      if (isClaudeModel) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          content = chunk.delta.text;
        }
      } else {
        content = chunk.choices[0]?.delta?.content || '';
      }

      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
      }
    }

    return fullResponse.trim() || "I'm not sure how to respond.";
  } catch (streamError) {
    console.error('[Generate] Streaming failed, falling back:', streamError.message);
    const completion = await callLLM(model, messages, llmOptions);
    const text = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";

    res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
    return text;
  }
}

module.exports = {
  generate,
  assemblePrompt,
  buildActionPrompt,
  buildVerificationContext,
  buildStreakWarning,
};
