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
const { STATIC_RULES, RULE_1_SOCRATIC, RULE_1_TEACHING } = require('../promptCompact');
const { buildSlimRules } = require('./promptSlim');

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
      parts.push(`The student answered "${observation.answer?.value}" and it is CORRECT (verified by our math engine: ${diagnosis.correctAnswer}).`);
      if (diagnosis.demonstratedReasoning) {
        parts.push('The student also demonstrated valid mathematical reasoning in their explanation.');
        parts.push('Affirm their answer AND their reasoning concisely. Then move forward — do NOT re-walk steps they already explained.');
      } else if (diagnosis.hasExplanation) {
        parts.push('The student embedded their answer in an explanation. Acknowledge their reasoning and confirm correctness.');
      } else {
        parts.push('Confirm their answer naturally — the way a human tutor would when they know the student got it right. Then continue the lesson.');
      }
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
      parts.push('Student has struggled with multiple attempts. Show a WORKED EXAMPLE using a PARALLEL problem (same skill, DIFFERENT numbers).');
      parts.push('ANTI-CHEAT RULE: You MUST change the numbers. If the original problem is "3x + 5 = 14", your example might use "2x + 7 = 15". NEVER use the student\'s exact numbers.');
      parts.push('Walk through step by step with think-aloud. Show your reasoning at each step.');
      parts.push('After the example, say: "Now try applying the same method to your problem."');
      parts.push('NEVER solve their original problem. NEVER reveal their answer.');
      break;

    case ACTIONS.EXIT_RAMP:
      parts.push('Student is stuck and has tried multiple times. Use the EXIT RAMP:');
      parts.push('1. Work a parallel problem (same skill, different numbers) step-by-step');
      parts.push('2. Then ask them to apply the same method to their problem');
      parts.push('3. If STILL stuck, offer to skip and move on');
      parts.push('NEVER reveal the answer. The answer stays hidden. Always.');
      parts.push('Do NOT say "That\'s right", "Correct", or any affirmation — the student did not answer correctly.');
      break;

    case ACTIONS.SCAFFOLD_DOWN:
      parts.push('The student said they don\'t know or needs more support. Lower the barrier:');
      if (decision.scaffoldLevel >= 5) {
        parts.push('Rephrase as a yes/no or multiple-choice question.');
      } else {
        parts.push('Break the problem into a simpler sub-question.');
      }
      parts.push('CRITICAL: The student did NOT answer the question. Do NOT say "That\'s right", "Correct", "Exactly", "Great job", or any affirmation. They did not provide an answer to affirm.');
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
      parts.push('ANSWER-DUMP GUARD: Do NOT state, hint at, or embed the answer in the problem presentation.');
      parts.push('Do NOT say "this equals [answer]" or "you should get [answer]." Present the problem and STOP.');
      break;

    case ACTIONS.PHASE_INSTRUCTION:
      // Phase prompt is already set in decision.phasePrompt
      break;

    // ── Instructional mode actions (backbone) ──

    case ACTIONS.DIRECT_INSTRUCTION:
      parts.push('DIRECT INSTRUCTION MODE — You are TEACHING, not asking.');
      parts.push('The student has NEVER seen this skill before. Do NOT ask "what do you think?" — they do not think anything yet.');
      parts.push('');
      parts.push('ACTIVATE PRIOR KNOWLEDGE FIRST:');
      parts.push('- Before introducing ANYTHING new, connect to something the student already knows.');
      parts.push('- The new concept should feel like a natural extension, not a disconnected rule.');
      parts.push('- Example: "You already know how to distribute: 3(x+2) = 3x+6. Factoring is just running that backwards."');
      parts.push('- Example: "You know slope measures steepness. A derivative is slope at a single point."');
      parts.push('');
      parts.push('CONCEPTUAL MASTERY IS THE GOAL — NOT procedural memorization:');
      parts.push('- For EVERY step, explain WHY it works, not just WHAT to do.');
      parts.push('- Build INTUITION before introducing notation or formulas.');
      parts.push('- Use MULTIPLE REPRESENTATIONS: visual, verbal, numeric, symbolic.');
      parts.push('- WRONG: "To find the derivative of x², use the power rule: bring down the exponent and subtract 1."');
      parts.push('- RIGHT: "The derivative measures how fast something is changing. If x² is the area of a square with side x, the derivative tells us how fast that area grows as we stretch the side."');
      parts.push('');
      parts.push('Think aloud with REASONING: "I notice... which means... so I will... because..." — make your thinking transparent.');
      parts.push('ONE concept per message. Teach it, then check: "Can you put that in your own words?" or "Why does that work?"');
      parts.push('A simple "yes" or "I think so" is acceptable during instruction — they are absorbing, not performing.');
      parts.push('OVERRIDE: The standard "never give answers" rule is SUSPENDED during I-Do modeling.');
      parts.push('You ARE showing answers during worked examples — that is how modeling works.');
      parts.push('The student will get their turn during guided and independent practice.');
      break;

    case ACTIONS.PREREQUISITE_BRIDGE:
      parts.push('PREREQUISITE BRIDGE — You are activating a foundation skill before teaching the target.');
      parts.push('This is NOT a detour. Frame it as the STARTING POINT of the new concept:');
      parts.push('"Before we learn [new skill], let\'s make sure we\'re solid on [prerequisite] — because [new skill] is built directly on top of it."');
      parts.push('Show the CONNECTION explicitly: how does this prerequisite become the building block?');
      parts.push('Keep it focused and efficient. This is a bridge, not a full lesson.');
      parts.push('If the prerequisite is novel too, teach it directly (briefly) with conceptual reasoning. If shaky, use quick guided practice.');
      break;

    case ACTIONS.GUIDED_PRACTICE:
      parts.push('GUIDED PRACTICE (We Do) — Work through this together with the student.');
      parts.push('The student has seen the model. Now they contribute while you scaffold.');
      parts.push('Start with more support, decrease as they show understanding.');
      parts.push('Socratic questions ARE appropriate here — the student has a foundation to reason from.');
      parts.push('Ask about REASONING, not just answers: "What should we do first, and WHY?"');
      parts.push('A correct answer with wrong reasoning means they have NOT understood — probe deeper.');
      parts.push('If they get stuck, give conceptual hints: "What operation UNDOES what is happening to x?" — not procedural hints.');
      parts.push('Do NOT give the full answer, but DO give more support than in independent practice.');
      parts.push('ANSWER-DUMP GUARD: When presenting a practice problem, do NOT include the answer or final result.');
      parts.push('Your hints must guide the PROCESS, never reveal the DESTINATION. "Think about what undoes addition" is a hint. "The answer is 7" is a dump.');
      break;

    case ACTIONS.INDEPENDENT_PRACTICE:
      parts.push('INDEPENDENT PRACTICE (You Do) — The student works ALONE.');
      parts.push('Present a problem. Step back. Let them work.');
      parts.push('After a correct answer, occasionally ask "Why does that work?" — correct answers alone do not prove understanding.');
      parts.push('Vary problem contexts: same concept, different representations. Transfer across contexts IS the proof of mastery.');
      parts.push('If they ask for help, give a conceptual nudge — not a procedural one.');
      parts.push('Socratic questioning is fully appropriate now.');
      parts.push('If they struggle significantly (3+ wrong), drop back to guided practice.');
      parts.push('ANSWER-DUMP GUARD: NEVER state or embed the answer when presenting a problem or giving hints.');
      parts.push('Hints guide REASONING: "What happens when you combine like terms?" — never reveal the target value.');
      break;

    case ACTIONS.STRENGTHEN_CHALLENGE:
      parts.push('STRENGTHEN MODE — The student is proficient. Push them.');
      parts.push('Present harder problems, multi-step applications, novel contexts.');
      parts.push('Minimal scaffolding. Let them wrestle.');
      parts.push('If they are breezing through, acknowledge it and level up or move on.');
      parts.push('ANSWER-DUMP GUARD: Challenge problems must not contain or hint at their solutions.');
      break;

    case ACTIONS.LEVERAGE_BRIDGE:
      parts.push('LEVERAGE MODE — The student has mastered this skill.');
      parts.push('Do NOT drill it. Use it as a bridge to the next concept.');
      parts.push('Example: "Since you already know X, let me show you how it connects to Y..."');
      parts.push('Quick review for warm-up is fine, but keep it very brief.');
      break;

    case ACTIONS.CONTINUE_CONVERSATION:
    default:
      parts.push('NEVER solve the problem for the student. If the student stated a math problem, jump straight into guiding the first step — do NOT ask them to restate the problem or ask what they have tried.');
      parts.push('IMPORTANT: If you decide to redirect the student to a different topic, commit to the redirect — do NOT contradict yourself by redirecting AND then teaching the off-topic subject in the same response. In free tutoring, follow the student\'s lead.');
      break;
  }

  return parts.join('\n\n');
}

/**
 * Build a system-level verification directive.
 * Unlike buildVerificationContext (which appends to the user message),
 * this goes into the system prompt where it carries more authority.
 * The LLM should treat this as a known fact, not something to evaluate.
 */
function buildVerificationDirective(diagnosis) {
  if (!diagnosis || diagnosis.type === 'no_answer') return null;

  if (diagnosis.isCorrect === true) {
    return `--- ANSWER VERIFICATION RESULT (FROM MATH ENGINE) ---\nThe student's answer "${diagnosis.answer}" is CORRECT. Our math engine computed the answer as "${diagnosis.correctAnswer}" and confirmed a match. This is a verified fact. Respond as a tutor who knows the student is right.`;
  }

  if (diagnosis.isCorrect === false) {
    return `--- ANSWER VERIFICATION RESULT (FROM MATH ENGINE) ---\nThe student's answer "${diagnosis.answer}" is INCORRECT. The correct answer is "${diagnosis.correctAnswer}". This is a verified fact. Guide the student without revealing the answer.`;
  }

  return null;
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

  // Start with the base system prompt.
  // If slimPrompt is enabled, replace the static rules prefix with
  // action-aware slim rules (saves ~37% tokens on average).
  let fullSystemPrompt = systemPrompt;
  if (promptContext.useSlimRules !== false && decision.action) {
    const slimRules = buildSlimRules(decision.action, {
      suppressSocratic: promptContext.suppressSocratic || false,
    });
    // Replace the static rules block if present (it's the first section of the prompt)
    if (fullSystemPrompt.includes('--- SECURITY (NON-NEGOTIABLE) ---')) {
      // Find where the static rules end and dynamic context begins
      const dynamicStart = fullSystemPrompt.indexOf('--- IDENTITY ---');
      if (dynamicStart > 0) {
        fullSystemPrompt = slimRules + '\n\n' + fullSystemPrompt.substring(dynamicStart);
      }
    }
  } else if (promptContext.suppressSocratic) {
    // Fallback: slim rules not used, but Socratic suppression is active.
    // Swap Rule 1 in the full static rules using the named constants.
    fullSystemPrompt = fullSystemPrompt.replace(RULE_1_SOCRATIC, RULE_1_TEACHING);
  }

  // Inject phase-specific prompt if available
  if (decision.phasePrompt) {
    fullSystemPrompt += '\n\n' + decision.phasePrompt;
  }

  // Inject action-specific prompt
  const actionPrompt = buildActionPrompt(decision);
  if (actionPrompt) {
    fullSystemPrompt += '\n\n--- CURRENT ACTION ---\n' + actionPrompt;
  }

  // Inject verification result into system prompt (authoritative, not a hint)
  // This ensures the LLM treats correctness as a known fact, not something to evaluate.
  const verificationDirective = buildVerificationDirective(decision.diagnosis);
  if (verificationDirective) {
    fullSystemPrompt += '\n\n' + verificationDirective;
  }

  // Inject session mood directive (if noteworthy)
  if (promptContext.moodDirective) {
    fullSystemPrompt += '\n\n' + promptContext.moodDirective;
  }

  // Clone messages to avoid mutation (deep-clone content arrays for vision messages)
  const messages = conversationMessages.map(m => {
    const cloned = { ...m };
    if (Array.isArray(cloned.content)) {
      cloned.content = cloned.content.map(c => ({ ...c }));
    }
    return cloned;
  });

  // Inject verification context into last user message
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const verificationCtx = buildVerificationContext(decision.diagnosis);
      const streakWarning = buildStreakWarning(decision.observation.streaks);
      const suffix = [verificationCtx, streakWarning].filter(Boolean).join('\n\n');

      if (suffix) {
        if (Array.isArray(lastMsg.content)) {
          // Multimodal (vision) message — append to the first text block
          const textBlock = lastMsg.content.find(c => c.type === 'text');
          if (textBlock) {
            textBlock.text += '\n\n' + suffix;
          } else {
            lastMsg.content.push({ type: 'text', text: suffix });
          }
        } else if (lastMsg.content) {
          lastMsg.content += '\n\n' + suffix;
        } else {
          lastMsg.content = suffix;
        }
      }
    }
  }

  return {
    messages: [{ role: 'system', content: fullSystemPrompt }, ...messages],
    model: PRIMARY_CHAT_MODEL,
    options: { temperature: 0.55, max_tokens: 800 },
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

  let fullResponse = '';
  try {
    const stream = await callLLMStream(model, messages, llmOptions);
    let clientDisconnected = false;

    res.req.on('close', () => { clientDisconnected = true; });

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      const content = chunk.choices[0]?.delta?.content || '';

      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
      }
    }

    return fullResponse.trim() || "I'm not sure how to respond.";
  } catch (streamError) {
    console.error('[Generate] Streaming failed, falling back:', streamError.message);

    // If partial content was already streamed, send a replacement event
    // so the client replaces the partial with the full response.
    // If nothing was streamed yet, send as a normal chunk.
    const completion = await callLLM(model, messages, llmOptions);
    const text = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";

    if (fullResponse.length > 0) {
      // Partial content was already sent — tell client to replace it
      res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
    }
    return text;
  }
}

module.exports = {
  generate,
  assemblePrompt,
  buildActionPrompt,
  buildVerificationContext,
  buildVerificationDirective,
  buildStreakWarning,
};
