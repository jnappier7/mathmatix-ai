/**
 * VERIFY STAGE — Post-processing checks on AI output
 *
 * Runs the output through safety and quality filters:
 * 1. Anti-answer leak (worksheetGuard)
 * 2. Reading level enforcement (IEP readability)
 * 3. Visual teaching enforcement
 * 4. Tag stripping (remove system tags from student-facing text)
 *
 * @module pipeline/verify
 */

const { filterAnswerKeyResponse, detectAnswerKeyResponse } = require('../worksheetGuard');
const { checkReadingLevel, buildSimplificationPrompt } = require('../readability');
const { enforceVisualTeaching, autoVisualizeByTopic } = require('../visualCommandEnforcer');
const { parseVisualTeaching } = require('../visualTeachingParser');
const { processAIResponse } = require('../chatBoardParser');
const { callLLM } = require('../llmGateway');
const { ACTIONS } = require('./decide');
const { MESSAGE_TYPES } = require('./observe');

const PRIMARY_CHAT_MODEL = 'gpt-4o-mini';

// Tags the system uses internally — must be stripped before showing to student
const SYSTEM_TAG_PATTERNS = [
  /<CORE_BEHAVIOR_XP:(\d+),([^>]+)>/g,
  /<AWARD_XP:(\d+),([^>]+)>/g,
  /<SAFETY_CONCERN>[^<]+<\/SAFETY_CONCERN>/g,
  /<SKILL_MASTERED:([^>]+)>/g,
  /<SKILL_STARTED:([^>]+)>/g,
  /<LEARNING_INSIGHT:([^>]+)>/g,
  /<IEP_GOAL_PROGRESS:([^,]+),([+-]\d+)>/g,
  /<PROBLEM_RESULT:(correct|incorrect|skipped)>/gi,
  /<BADGE_PROGRESS:(correct|incorrect)>/gi,
  /<BADGE_EARNED:([^>]+)>/g,
  /<\s*SCAFFOLD_ADVANCE\s*>/gi,
  /<\s*MODULE_COMPLETE\s*>/gi,
  /<\s*ANSWER_RESULT\s+correct="(true|false)"\s+problem="\d+"\s*\/?\s*>/gi,
];

/**
 * Extract structured data from system tags before stripping them.
 * Returns the extracted data and the cleaned text.
 */
function extractSystemTags(responseText) {
  const extracted = {
    coreBehaviorXp: null,
    legacyXp: null,
    safetyConcern: null,
    skillMastered: null,
    skillStarted: null,
    learningInsight: null,
    iepGoalUpdates: [],
    problemResult: null,
    badgeProgress: null,
    scaffoldAdvance: false,
    moduleComplete: false,
  };

  let text = responseText;

  // Core behavior XP
  const cbMatch = text.match(/<CORE_BEHAVIOR_XP:(\d+),([^>]+)>/);
  if (cbMatch) {
    extracted.coreBehaviorXp = { amount: parseInt(cbMatch[1], 10), behavior: cbMatch[2].trim() };
    text = text.replace(cbMatch[0], '').trim();
  }

  // Legacy XP
  const legacyMatch = text.match(/<AWARD_XP:(\d+),([^>]+)>/);
  if (legacyMatch) {
    extracted.legacyXp = { amount: parseInt(legacyMatch[1], 10), reason: legacyMatch[2].trim() };
    text = text.replace(legacyMatch[0], '').trim();
  }

  // Safety concern
  const safetyMatch = text.match(/<SAFETY_CONCERN>([^<]+)<\/SAFETY_CONCERN>/);
  if (safetyMatch) {
    extracted.safetyConcern = safetyMatch[1].trim();
    text = text.replace(safetyMatch[0], '').trim();
  }

  // Skill mastered
  const masteredMatch = text.match(/<SKILL_MASTERED:([^>]+)>/);
  if (masteredMatch) {
    extracted.skillMastered = masteredMatch[1].trim();
    text = text.replace(masteredMatch[0], '').trim();
  }

  // Skill started
  const startedMatch = text.match(/<SKILL_STARTED:([^>]+)>/);
  if (startedMatch) {
    extracted.skillStarted = startedMatch[1].trim();
    text = text.replace(startedMatch[0], '').trim();
  }

  // Learning insight
  const insightMatch = text.match(/<LEARNING_INSIGHT:([^>]+)>/);
  if (insightMatch) {
    extracted.learningInsight = insightMatch[1].trim();
    text = text.replace(insightMatch[0], '').trim();
  }

  // IEP goal progress (multiple possible)
  const iepRegex = /<IEP_GOAL_PROGRESS:([^,]+),([+-]\d+)>/g;
  let iepMatch;
  while ((iepMatch = iepRegex.exec(responseText)) !== null) {
    extracted.iepGoalUpdates.push({
      goalIdentifier: iepMatch[1].trim(),
      progressChange: parseInt(iepMatch[2], 10),
    });
    text = text.replace(iepMatch[0], '').trim();
  }

  // Problem result
  const resultMatch = text.match(/<\s*PROBLEM_RESULT\s*:\s*(correct|incorrect|skipped)\s*>/i);
  if (resultMatch) {
    extracted.problemResult = resultMatch[1].toLowerCase();
    text = text.replace(resultMatch[0], '').trim();
  }

  // Scaffold advance — tag is DEPRECATED (backend evaluator now owns progression).
  // We still strip it from the response to keep student-facing text clean,
  // but it no longer drives advancement. Logged for monitoring during transition.
  if (/<\s*SCAFFOLD_ADVANCE\s*>/i.test(text)) {
    extracted.scaffoldAdvance = true; // kept for logging, not for progression
    text = text.replace(/<\s*SCAFFOLD_ADVANCE\s*>/gi, '').trim();
    console.log('[Verify] Note: AI emitted <SCAFFOLD_ADVANCE> (deprecated — backend evaluator now owns progression)');
  }

  // Module complete — DEPRECATED (backend detects last-step completion automatically).
  // Still stripped for clean output.
  if (/<\s*MODULE_COMPLETE\s*>/i.test(text)) {
    extracted.moduleComplete = true; // kept for logging, not for progression
    text = text.replace(/<\s*MODULE_COMPLETE\s*>/gi, '').trim();
    console.log('[Verify] Note: AI emitted <MODULE_COMPLETE> (deprecated — backend evaluator now owns progression)');
  }

  return { text, extracted };
}

/**
 * Run all verification checks on the AI response.
 *
 * @param {string} responseText - Raw AI response
 * @param {Object} context
 * @param {string} context.userId - For logging
 * @param {string} context.userMessage - Original student message (for visual teaching)
 * @param {number} context.iepReadingLevel - Target reading level (grade or Lexile)
 * @param {string} context.firstName - Student's first name
 * @param {boolean} context.isStreaming - Whether response is being streamed
 * @param {Object} context.res - Express response object (for streaming replacements)
 * @returns {Object} { text, extracted, visualCommands, boardContext, flags }
 */
async function verify(responseText, context = {}) {
  let text = responseText;
  const flags = [];

  // ── 1. Extract system tags (structured sidecar data) ──
  const { text: tagStrippedText, extracted } = extractSystemTags(text);
  text = tagStrippedText;

  // ── 2. Anti-answer-key filter ──
  const answerKeyCheck = filterAnswerKeyResponse(text, context.userId);
  if (answerKeyCheck.wasFiltered) {
    text = answerKeyCheck.text;
    flags.push('answer_key_blocked');

    if (context.isStreaming && context.res) {
      try {
        context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
      } catch (e) { /* client disconnected */ }
    }
  }

  // ── 2a. Upload-context answer giveaway detection ──
  // When a student has uploaded a worksheet, apply STRICTER answer detection.
  // Standard filter needs 3+ problems; during uploads, catch even 2 problems.
  // Also detect single-problem complete solutions (the AI solving the student's problem).
  if ((context.hasRecentUpload || context.isWorksheetFollowUp) && !answerKeyCheck.wasFiltered) {
    // Lower threshold: catch 2+ numbered solutions
    const strictCheck = detectAnswerKeyResponse(text, { minProblems: 2 });
    if (strictCheck.isAnswerKey) {
      console.warn(`[Verify] UPLOAD CONTEXT: Answer giveaway detected (${strictCheck.problemCount} problems). Blocking.`);
      text = "I can see the problems on your worksheet! Which one do you want to tackle first? Pick one and let's work through it together.";
      flags.push('upload_answer_giveaway_blocked');

      if (context.isStreaming && context.res) {
        try {
          context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
        } catch (e) { /* client disconnected */ }
      }
    } else {
      // Detect single complete solution: AI shows step-by-step and reveals the final answer.
      // Pattern: response contains "= [answer]" or "the answer is" with completed work.
      const completeSolutionSignals = [
        /(?:the\s+)?(?:answer|solution)\s+is\s*[:=]?\s*(?:\\[(\[])?\s*[-\d(x]/i,
        /(?:therefore|so|thus|hence)\s*,?\s*(?:the\s+)?(?:factored\s+form|factors?|answer|solution|result|sum|difference|product|quotient)\s+(?:is|=|are)\s*[:=]?\s*(?:\\[(\[])?\s*[-\d(x]/i,
        /(?:=\s*\\[(\[])\s*\(.*?\)\s*\(.*?\)\s*(?:\\[\])])/,  // = (x+a)(x+b) factored form
        /(?:final\s+answer|boxed|result)\s*[:=]\s*/i,
      ];
      const hasCompleteSolution = completeSolutionSignals.some(p => p.test(text));
      // Also check: does the response NOT contain a question mark? (Socratic should ask questions)
      const hasQuestion = /\?\s*$|\?\s*\n/m.test(text);

      if (hasCompleteSolution && !hasQuestion) {
        console.warn(`[Verify] UPLOAD CONTEXT: Complete solution without Socratic question detected. Regenerating.`);
        try {
          const socraticRedirect = await callLLM(PRIMARY_CHAT_MODEL,
            [{ role: 'system', content: 'You are a math tutor. The student uploaded a worksheet. You MUST guide them with Socratic questions — NEVER give away answers. Your previous response gave a complete solution, which violates tutoring rules. Rewrite it: acknowledge the problem, break it into the FIRST step only, and ask the STUDENT to attempt that step. Do NOT show any subsequent steps or the final answer. End with a guiding question.' },
             { role: 'assistant', content: text },
             { role: 'user', content: 'Rewrite this response to be Socratic. Only show the first step, ask the student to try it. Never reveal the answer.' }],
            { temperature: 0.55, max_tokens: 800 }
          );
          const redirectedText = socraticRedirect.choices[0]?.message?.content?.trim();
          if (redirectedText && redirectedText.length > 10) {
            text = redirectedText;
            flags.push('upload_solution_redirected');

            if (context.isStreaming && context.res) {
              try {
                context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
              } catch (e) { /* client disconnected */ }
            }
          }
        } catch (err) {
          console.error('[Verify] Upload solution redirect failed:', err.message);
          // Fallback: just add a question to the end
          text += "\n\nWhat do you think the first step should be?";
          flags.push('upload_solution_redirect_fallback');
        }
      }
    }
  }

  // ── 2b. False-affirmation guard ──
  // When the student didn't answer (IDK, give-up, etc.), the AI must NOT
  // say "That's right!", "Correct!", etc. — it confuses students into
  // thinking they answered correctly. Strip the leading affirmation.
  if (context.action && context.messageType) {
    const noAnswerActions = [ACTIONS.SCAFFOLD_DOWN, ACTIONS.EXIT_RAMP, ACTIONS.HINT, ACTIONS.ACKNOWLEDGE_FRUSTRATION];
    const noAnswerTypes = [MESSAGE_TYPES.IDK, MESSAGE_TYPES.GIVE_UP, MESSAGE_TYPES.HELP_REQUEST, MESSAGE_TYPES.FRUSTRATION];

    if (noAnswerActions.includes(context.action) || noAnswerTypes.includes(context.messageType)) {
      const falseAffirmation = /^(that'?s\s+right[.!]*|correct[.!]*|exactly[.!]*|great\s+job[.!]*|perfect[.!]*|well\s+done[.!]*|yes[.!]*|you\s+got\s+it[.!]*|right\s+on[.!]*|bingo[.!]*)\s*/i;
      if (falseAffirmation.test(text.trim())) {
        text = text.trim().replace(falseAffirmation, '').trim();
        flags.push('false_affirmation_stripped');
        console.log(`[Verify] Stripped false affirmation (action: ${context.action}, messageType: ${context.messageType})`);

        if (context.isStreaming && context.res) {
          try {
            context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
          } catch (e) { /* client disconnected */ }
        }
      }
    }
  }

  // ── 2c. False-confirmation guard (CRITICAL — prevents affirming wrong answers) ──
  // When the pipeline has VERIFIED the student's answer is INCORRECT
  // (action === GUIDE_INCORRECT or RETEACH_MISCONCEPTION) but the LLM's
  // response affirms the answer ("That's correct!", "You got it!"), flag
  // it for regeneration. This prevents the most damaging tutoring error:
  // telling a student their wrong answer is right.
  if (context.action === ACTIONS.GUIDE_INCORRECT || context.action === ACTIONS.RETEACH_MISCONCEPTION) {
    const falseConfirmationPattern = /^(that'?s\s+(?:right|correct|it)[.!]*|correct[.!]*|exactly[.!]*|great\s+(?:job|work)[.!]*|perfect[.!]*|well\s+done[.!]*|you\s+(?:got|nailed)\s+it[.!]*|right\s+on[.!]*|bingo[.!]*|excellent[.!]*|yes[,.]?\s*(?:that'?s|you(?:'re|\s+are))\s+(?:right|correct)|¡?(?:excelente|exacto|exactamente|muy\s+bien|perfecto|fantástico)[.!]*)/i;

    if (falseConfirmationPattern.test(text.trim())) {
      flags.push('false_confirmation_detected');
      console.log(`[Verify] FALSE CONFIRMATION detected on verified-incorrect answer — regenerating`);

      try {
        const correctionPrompt = `The student's answer has been mathematically verified as INCORRECT by our answer engine. The correct answer is "${context.correctAnswer}". Your previous response incorrectly affirmed the student's wrong answer. Respond naturally — guide the student toward discovering the error WITHOUT revealing the correct answer. Do not use scripted language; be a natural, supportive tutor who knows this answer is wrong.`;
        const regenerated = await callLLM(PRIMARY_CHAT_MODEL,
          [{ role: 'system', content: correctionPrompt },
           { role: 'assistant', content: text },
           { role: 'user', content: 'Rewrite this response knowing the student\'s answer is WRONG. Keep your personality and teaching style, just remove the false affirmation and guide them to find their mistake.' }],
          { temperature: 0.55, max_tokens: 1500 }
        );
        const regeneratedText = regenerated.choices[0]?.message?.content?.trim();
        if (regeneratedText && regeneratedText.length > 10) {
          text = regeneratedText;
          flags.push('false_confirmation_regenerated');

          if (context.isStreaming && context.res) {
            try {
              context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
            } catch (e) { /* client disconnected */ }
          }
        }
      } catch (err) {
        console.error('[Verify] False-confirmation regeneration failed:', err.message);
        flags.push('false_confirmation_regeneration_failed');
      }
    }
  }

  // ── 2d. False-rejection guard (CRITICAL — protects correct answers) ──
  // When the pipeline has VERIFIED the student's answer is correct
  // (action === CONFIRM_CORRECT) but the LLM's response implies the
  // answer is wrong, flag it for regeneration.
  if (context.action === ACTIONS.CONFIRM_CORRECT) {
    // Detect rejection/doubt language at the start of a verified-correct response
    const falseRejectionOpener = /^(hmm[,.]?\s*|let'?s\s+think\s+(about|through)\s+(?:this|that|the\s+problem)|not\s+quite|close[,!.]\s*but|almost[.!,]|i\s+see\s+where\s+you(?:'re|\s+are)\s+coming\s+from|let'?s\s+check\s+that|are\s+you\s+sure|that'?s\s+not\s+(?:quite|exactly)|so\s+close|good\s+(?:try|attempt|thinking)[,.]?\s*but|nice\s+try[.!,]|let'?s\s+double[- ]check|(?:but\s+)?let'?s\s+(?:re)?check\s+the)/i;

    if (falseRejectionOpener.test(text.trim())) {
      flags.push('false_rejection_detected');
      console.log(`[Verify] FALSE REJECTION detected on verified-correct answer — regenerating`);

      // Regenerate with an explicit correction directive.
      // The LLM speaks naturally, but now KNOWS the answer is correct.
      try {
        const correctionPrompt = `The student's answer has been mathematically verified as CORRECT by our answer engine. Your previous response incorrectly implied it was wrong. Respond naturally to the student — confirm their answer is correct and continue the lesson. Do not use scripted language; just be a natural, encouraging tutor who knows this answer is right.`;
        const regenerated = await callLLM(PRIMARY_CHAT_MODEL,
          [{ role: 'system', content: correctionPrompt },
           { role: 'assistant', content: text },
           { role: 'user', content: 'Rewrite this response knowing the student IS correct. Keep your personality and teaching style, just fix the incorrect rejection.' }],
          { temperature: 0.55, max_tokens: 1500 }
        );
        const regeneratedText = regenerated.choices[0]?.message?.content?.trim();
        if (regeneratedText && regeneratedText.length > 10) {
          text = regeneratedText;
          flags.push('false_rejection_regenerated');

          if (context.isStreaming && context.res) {
            try {
              context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
            } catch (e) { /* client disconnected */ }
          }
        }
      } catch (err) {
        console.error('[Verify] False-rejection regeneration failed:', err.message);
        flags.push('false_rejection_regeneration_failed');
      }
    }
  }

  // ── 2e. Math contradiction cross-check ──
  // Catches a subtle but damaging pattern: the AI shows the correct computation
  // (e.g., "24(2) - 12 = 36") but affirms the student's different answer
  // (e.g., "That's correct!" when the student said "12").
  // This happens when the verification directive tells the AI the answer is wrong,
  // but the LLM's affirmation habit overrides the directive.
  if (context.correctAnswer && context.diagnosisType === 'incorrect') {
    const correctStr = String(context.correctAnswer).trim();
    // Check if the AI's response contains the correct answer as a computed result
    // AND also contains affirmation language
    const responseContainsCorrectAnswer = new RegExp(`=\\s*${correctStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
    const hasAffirmation = /(?:that'?s\s+(?:right|correct)|correct[.!]|exactly[.!]|you\s+(?:got|nailed)\s+it|great\s+(?:job|work)|perfect[.!]|well\s+done|excellent|¡?(?:excelente|exacto|exactamente|perfecto))/i.test(text);

    if (responseContainsCorrectAnswer && hasAffirmation) {
      flags.push('math_contradiction_detected');
      console.log(`[Verify] MATH CONTRADICTION: AI computed ${correctStr} but affirmed student's wrong answer — regenerating`);

      try {
        const correctionPrompt = `CRITICAL ERROR IN YOUR RESPONSE: You showed the correct computation (the answer is ${correctStr}) but simultaneously told the student their different answer was correct. This is contradictory and confusing. The student's answer is WRONG. Rewrite your response: acknowledge the student's effort, then guide them to see where their calculation went wrong. Do NOT reveal the answer directly — use Socratic questioning.`;
        const regenerated = await callLLM(PRIMARY_CHAT_MODEL,
          [{ role: 'system', content: correctionPrompt },
           { role: 'assistant', content: text },
           { role: 'user', content: 'Rewrite this response to fix the contradiction. The student\'s answer is wrong. Guide them without revealing the answer.' }],
          { temperature: 0.55, max_tokens: 1500 }
        );
        const regeneratedText = regenerated.choices[0]?.message?.content?.trim();
        if (regeneratedText && regeneratedText.length > 10) {
          text = regeneratedText;
          flags.push('math_contradiction_regenerated');

          if (context.isStreaming && context.res) {
            try {
              context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
            } catch (e) { /* client disconnected */ }
          }
        }
      } catch (err) {
        console.error('[Verify] Math contradiction regeneration failed:', err.message);
        flags.push('math_contradiction_regeneration_failed');
      }
    }
  }

  // ── 2f. Canned phrase scrub ──
  // The system prompt bans these, but GPT-4o-mini slips them in regularly.
  // Strip the worst offenders instead of regenerating (cheaper, faster).
  const CANNED_OPENERS = /^(great\s+question[.!]*\s*|that'?s\s+a\s+great\s+question[.!]*\s*|let'?s\s+dive\s+(right\s+)?in[.!]*\s*|i(?:'?d|\s+would)\s+(?:be\s+)?(?:happy|love)\s+to\s+help(?:\s+(?:you\s+)?with\s+that)?[.!]*\s*|i\s+can\s+(?:definitely|certainly)\s+help\s+(?:you\s+)?with\s+that[.!]*\s*|absolutely[.!]*\s+(?=\w)|certainly[.!]*\s+(?=\w)|of\s+course[.!]*\s+(?=\w)|no\s+problem[.!]*\s+(?=\w))/i;
  const CANNED_TRANSITIONS = /\b((?:now,?\s+)?let'?s\s+(?:break\s+this\s+down|tackle\s+this|work\s+through\s+this|dive\s+(?:right\s+)?in(?:to)?)|moving\s+on\s+to|with\s+that\s+said|having\s+said\s+that)/gi;

  if (CANNED_OPENERS.test(text.trim())) {
    text = text.trim().replace(CANNED_OPENERS, '').trim();
    // Capitalize the new first character
    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    flags.push('canned_opener_stripped');
  }

  const transitionCount = (text.match(CANNED_TRANSITIONS) || []).length;
  if (transitionCount > 0) {
    text = text.replace(CANNED_TRANSITIONS, '');
    // Clean up double spaces left behind
    text = text.replace(/  +/g, ' ').replace(/\n +/g, '\n').trim();
    flags.push('canned_transitions_stripped');
  }

  // ── 3. IEP reading level enforcement ──
  if (context.iepReadingLevel) {
    const readCheck = checkReadingLevel(text, context.iepReadingLevel);
    if (!readCheck.passes) {
      console.log(
        `[Verify] Reading level violation for ${context.firstName}: ` +
        `response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
      );

      try {
        const simplifyPrompt = buildSimplificationPrompt(text, readCheck.targetGrade, context.firstName || 'the student');
        const simplified = await callLLM(PRIMARY_CHAT_MODEL,
          [{ role: 'system', content: simplifyPrompt }],
          { temperature: 0.3, max_tokens: 1500 }
        );
        const simplifiedText = simplified.choices[0]?.message?.content?.trim();
        if (simplifiedText && simplifiedText.length > 20) {
          text = simplifiedText;
          flags.push('reading_level_simplified');

          if (context.isStreaming && context.res) {
            try {
              context.res.write(`data: ${JSON.stringify({ type: 'replacement', content: text })}\n\n`);
            } catch (e) { /* client disconnected */ }
          }
        }
      } catch (err) {
        console.error('[Verify] Simplification failed:', err.message);
        flags.push('reading_level_simplification_failed');
      }
    }
  }

  // ── 4. Visual teaching enforcement ──
  if (context.userMessage) {
    // Always run: handles explicit student requests ("show me", "graph this")
    // and normalizes malformed LLM-generated visual commands
    text = enforceVisualTeaching(context.userMessage, text, '', context.isVisualLearner || false);
    // Topic-based auto-injection: only for visual learners as a safety net.
    // For all students, the LLM is already prompted with VISUAL_TOOLS_SECTION
    // and decides itself when a graph is appropriate — regex topic matching
    // can't distinguish "teaching derivatives" from "mentioning derivatives."
    if (context.isVisualLearner) {
      text = autoVisualizeByTopic(context.userMessage, text, true);
    }
  }

  // ── 5. Parse visual commands ──
  const visualResult = parseVisualTeaching(text);
  text = visualResult.cleanedText;

  // ── 6. Parse board references ──
  const boardParsed = processAIResponse(text);
  text = boardParsed.text;

  // ── 7. LaTeX normalization ──
  // gpt-4o-mini sometimes uses plain parentheses for math instead of \( \)
  // or omits delimiters entirely. Normalize common patterns.
  text = normalizeLatex(text);

  // ── 8. Final cleanup: strip any remaining system tags ──
  for (const pattern of SYSTEM_TAG_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }

  // ── 8b. Strip leaked tag meta-references ──
  // Sometimes the AI talks ABOUT the tags instead of silently appending them:
  //   "I'll go ahead and emit the tag: ." or "Let me advance the scaffold."
  // These sentences expose internal mechanics to the student.
  const TAG_LEAK_PATTERNS = [
    /[^.!?]*\b(?:emit|emitting)\s+(?:the\s+)?(?:tag|signal)\b[^.!?]*[.!?]\s*/gi,
    /[^.!?]*\b(?:I'll|let me|I'm going to)\s+(?:advance|mark|emit|signal)\s+(?:the\s+)?(?:scaffold|step|tag|progress)\b[^.!?]*[.!?]\s*/gi,
    /[^.!?]*\bnow that we've completed this step\b[^.!?]*\bemit\b[^.!?]*[.!?]\s*/gi,
  ];
  for (const leakPattern of TAG_LEAK_PATTERNS) {
    if (leakPattern.test(text)) {
      text = text.replace(leakPattern, '').trim();
      flags.push('tag_leak_stripped');
    }
  }

  // ── 8c. Re-attach orphaned punctuation ──
  // When a system tag sits on its own line before punctuation, stripping
  // the tag leaves the punctuation dangling on a blank line:
  //   "...your answer\n<PROBLEM_RESULT:correct>\n?" → "...your answer\n\n?"
  // Pull stray punctuation back onto the preceding line.
  text = text.replace(/\n\s*\n\s*([?!.,;:])/g, '$1');
  // Also handle single-newline case: "answer\n?"
  text = text.replace(/\n\s*([?!.])\s*$/gm, '$1');
  // Collapse runs of 3+ newlines to a double newline
  text = text.replace(/\n{3,}/g, '\n\n');

  // ── 9. Validate non-empty (after all stripping) ──
  if (!text || text.trim() === '') {
    text = "I'm having trouble generating a response right now. Could you please rephrase your question?";
    flags.push('empty_response_fallback');
  }

  return {
    text: text.trim(),
    extracted,
    visualCommands: visualResult.visualCommands,
    drawingSequence: visualResult.visualCommands.whiteboard?.[0]?.sequence || null,
    boardContext: boardParsed.boardContext,
    flags,
  };
}

/**
 * Normalize LaTeX delimiters in AI responses.
 *
 * Common issues from gpt-4o-mini:
 * 1. Uses $...$ instead of \(...\) or \[...\]
 * 2. Uses bare math expressions without any delimiters
 * 3. Uses parenthesized math like ( x^2 - 4 ) that should be \( x^2 - 4 \)
 *
 * We only fix clear patterns to avoid false positives on natural text.
 */
function normalizeLatex(text) {
  if (!text) return text;

  let result = text;

  // ── Pre-pass 0: Protect inline visual commands from LaTeX normalization ──
  // Commands like [FUNCTION_GRAPH:fn=x^2,...] contain ^ and other chars that
  // the LaTeX normalizer would incorrectly convert to \[...\] display math.
  const visualCmdBlocks = [];
  const VISUAL_CMD_NAMES = [
    'FUNCTION_GRAPH', 'NUMBER_LINE', 'FRACTION', 'PIE_CHART',
    'BAR_CHART', 'POINTS', 'SLIDER_GRAPH', 'UNIT_CIRCLE',
    'AREA_MODEL', 'COMPARISON', 'PYTHAGOREAN', 'ANGLE',
    'SLOPE', 'PERCENT_BAR', 'PLACE_VALUE', 'RIGHT_TRIANGLE',
    'INEQUALITY', 'ALGEBRA_TILES', 'MULTI_REP',
    'DERIVATIVE_GRAPH', 'RATIONAL_GRAPH', 'VELOCITY_GRAPH',
  ];
  const visualCmdRegex = new RegExp(
    `\\[(${VISUAL_CMD_NAMES.join('|')}):([^\\]]+)\\]`, 'g'
  );
  result = result.replace(visualCmdRegex, (match) => {
    visualCmdBlocks.push(match);
    return `@@VISUAL_CMD_${visualCmdBlocks.length - 1}@@`;
  });

  // ── Pre-pass 1: Replace unicode math symbols with LaTeX equivalents ──
  // gpt-4o-mini sometimes uses unicode symbols instead of LaTeX commands:
  //   "2×4" instead of "2 \times 4", "÷" instead of "\div", etc.
  result = result.replace(/×/g, '\\times ');
  result = result.replace(/÷/g, '\\div ');
  result = result.replace(/±/g, '\\pm ');
  result = result.replace(/√/g, '\\sqrt');
  result = result.replace(/≤/g, '\\leq ');
  result = result.replace(/≥/g, '\\geq ');
  result = result.replace(/≠/g, '\\neq ');
  result = result.replace(/≈/g, '\\approx ');
  result = result.replace(/π/g, '\\pi ');
  result = result.replace(/∞/g, '\\infty ');

  // ── Pre-pass 2: Normalize Unicode superscripts/subscripts ──
  // AI sometimes uses Unicode superscripts (a⁰, x², n⁻¹) instead of LaTeX
  result = result.replace(/⁰/g, '^0');
  result = result.replace(/¹/g, '^1');
  result = result.replace(/²/g, '^2');
  result = result.replace(/³/g, '^3');
  result = result.replace(/⁴/g, '^4');
  result = result.replace(/⁵/g, '^5');
  result = result.replace(/⁶/g, '^6');
  result = result.replace(/⁷/g, '^7');
  result = result.replace(/⁸/g, '^8');
  result = result.replace(/⁹/g, '^9');
  result = result.replace(/⁻/g, '^{-}');
  result = result.replace(/⁺/g, '^{+}');
  result = result.replace(/ⁿ/g, '^n');
  result = result.replace(/₀/g, '_0');
  result = result.replace(/₁/g, '_1');
  result = result.replace(/₂/g, '_2');
  result = result.replace(/₃/g, '_3');
  result = result.replace(/₄/g, '_4');
  result = result.replace(/₅/g, '_5');
  result = result.replace(/₆/g, '_6');
  result = result.replace(/₇/g, '_7');
  result = result.replace(/₈/g, '_8');
  result = result.replace(/₉/g, '_9');

  // ── 0. Restore missing backslashes on common LaTeX commands ──
  // gpt-4o-mini frequently drops ALL backslashes, producing:
  //   "frac{3}{2sqrt{7}}" instead of "\frac{3}{2\sqrt{7}}"
  //   "[frac{x}{y}]" instead of "\[\frac{x}{y}\]"
  // Only restore when followed by { to avoid false positives on words.
  const LATEX_COMMANDS = [
    'frac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'mp',
    'leq', 'geq', 'neq', 'approx', 'equiv',
    'left', 'right', 'text', 'mathrm', 'mathbf',
    'overline', 'underline', 'hat', 'bar', 'vec',
    'sum', 'prod', 'int', 'lim', 'infty', 'pi',
    'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda',
    'sin', 'cos', 'tan', 'log', 'ln',
  ];
  // Match command names NOT preceded by a backslash, followed by { or a space-then-{
  const cmdPattern = new RegExp(
    `(?<!\\\\)(${LATEX_COMMANDS.join('|')})(?=\\s*\\{)`, 'g'
  );
  result = result.replace(cmdPattern, '\\$1');

  // ── 0b. Restore display math delimiters: bare [expr] → \[expr\] ──
  // Match [expr] where expr contains LaTeX commands (now backslash-restored)
  // and is NOT a markdown link [text](url) or array index.
  result = result.replace(/(?<![\\a-zA-Z])\[([^\[\]]{2,}?)\](?!\s*\()/g, (match, inner) => {
    // Only convert if inner content has LaTeX commands or math syntax
    if (/\\[a-zA-Z]/.test(inner) || /[{}^_]/.test(inner)) {
      return `\\[${inner}\\]`;
    }
    return match;
  });

  // ── 1. Convert $$...$$ (display math) to \[...\] ──
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, '\\[$1\\]');

  // ── 2. Convert $...$ (inline math) to \(...\) ──
  // but not currency ($5, $10)
  result = result.replace(/(?<![\\$])\$([^$\n]+?)\$(?!\d)/g, (match, inner) => {
    if (/^\d+(\.\d+)?$/.test(inner.trim())) return match;
    if (/[a-zA-Z].*[+\-*/^=<>_{}\\]|\\[a-zA-Z]/.test(inner)) {
      return `\\(${inner}\\)`;
    }
    return match;
  });

  // ── 2b. Protect existing delimited math from step 3 ──
  // Without this, step 3 converts inner (expr) inside \(...\) to \(expr\),
  // creating broken nested delimiters: \(... \(expr\) ...\)
  const protectedBlocks = [];
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
    protectedBlocks.push(match);
    return `@@PROTECTED_${protectedBlocks.length - 1}@@`;
  });
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
    protectedBlocks.push(match);
    return `@@PROTECTED_${protectedBlocks.length - 1}@@`;
  });

  // ── 3. Fix bare parenthesized math: ( expr ) → \( expr \) ──
  result = result.replace(/(?<![\\a-zA-Z])\(\s*([^()]+?)\s*\)(?!\s*[=<>])/g, (match, inner) => {
    const hasMathSyntax =
      /[\\^_{}]/.test(inner) ||           // LaTeX special chars
      /[a-z]\^?\d/i.test(inner) ||        // variable^digit: x2, x^2
      (/\d[a-z]/i.test(inner) && /[+\-=]/.test(inner)) ||  // coefficient+operator: 2x-4, 3y=9
      /[×÷±√]/.test(inner) ||             // unicode math operators
      (/[a-z]/i.test(inner) && /\d/.test(inner) && /=/.test(inner)); // variable+number+equals: x=5
    const isNaturalText = /^[a-z\s,]+$/i.test(inner) || inner.length > 60;
    if (hasMathSyntax && !isNaturalText) {
      return `\\(${inner.trim()}\\)`;
    }
    return match;
  });

  // ── 4. Wrap bare LaTeX command expressions not inside delimiters ──
  // Handles AI output like: \frac{3}{4} + \frac{1}{4} = 1
  // or: \lim_{x \to 2} (3x+1) = 7
  // Matches a \command with its arguments (braces, subscripts, superscripts),
  // then greedily captures adjacent math content (operators, more commands, numbers).
  const RENDER_CMDS = 'frac|sqrt|lim|sum|int|prod|vec|overline|underline|hat|bar';
  const ALL_CMDS = RENDER_CMDS + '|to|times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|infty|pi|left|right|sin|cos|tan|log|ln';
  // Use (?=[_^{\\s(]|$) instead of \b because _ is a word char (so \lim_ fails with \b)
  const WB = '(?=[_^{\\\\s(]|$)';
  const cmdWithArgs = `\\\\(?:${RENDER_CMDS})${WB}(?:[_^](?:\\{[^{}]*\\}|\\w)|\\{[^{}]*\\})*`;
  const mathTail = `(?:\\s*(?:[+\\-=*/<>,]|\\\\(?:${ALL_CMDS})${WB}(?:[_^](?:\\{[^{}]*\\}|\\w)|\\{[^{}]*\\})*|[0-9a-zA-Z_^{}()\\s](?![a-zA-Z]{3})))*`;
  const bareMathRegex = new RegExp(`(${cmdWithArgs}${mathTail})`, 'g');
  result = result.replace(bareMathRegex, (match) => {
    const trimmed = match.trim();
    if (!trimmed) return match;
    return `\\(${trimmed}\\)`;
  });

  // ── Restore protected math blocks ──
  protectedBlocks.forEach((block, index) => {
    result = result.replace(`@@PROTECTED_${index}@@`, block);
  });

  // ── Restore protected visual command blocks ──
  visualCmdBlocks.forEach((block, index) => {
    result = result.replace(`@@VISUAL_CMD_${index}@@`, block);
  });

  // ── 5. Strip LaTeX delimiters wrapping English prose ──
  // AI sometimes puts natural language inside \( \), e.g.:
  //   \(the coefficient of x\)  →  renders broken red text in KaTeX
  // Detect common English words inside delimiters and remove them.
  // Words like "the", "coefficient", "of" are never valid LaTeX.
  const ENGLISH_WORD = /\b(the|and|for|but|not|this|that|with|from|have|what|when|where|which|their|there|each|some|like|also|just|only|about|because|between|coefficient|constant|variable|number|value|equation|expression|term|multiply|divide|subtract|result|answer|solution|difference|product|quotient|means|called|gives|becomes|since|both|into|same|side|step|next|then|first|second|third|positive|negative)\b/i;
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (match, inner) => {
    // Keep blocks with LaTeX commands — those are intentional math
    if (/\\[a-zA-Z]/.test(inner)) return match;
    if (ENGLISH_WORD.test(inner)) {
      return inner.trim();
    }
    return match;
  });
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, inner) => {
    if (/\\[a-zA-Z]/.test(inner)) return match;
    if (ENGLISH_WORD.test(inner)) {
      return inner.trim();
    }
    return match;
  });

  return result;
}

module.exports = {
  verify,
  extractSystemTags,
  normalizeLatex,
};
