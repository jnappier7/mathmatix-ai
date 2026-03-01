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

const { filterAnswerKeyResponse } = require('../worksheetGuard');
const { checkReadingLevel, buildSimplificationPrompt } = require('../readability');
const { enforceVisualTeaching } = require('../visualCommandEnforcer');
const { parseVisualTeaching } = require('../visualTeachingParser');
const { processAIResponse } = require('../chatBoardParser');
const { callLLM } = require('../llmGateway');

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

  // Scaffold advance
  if (/<\s*SCAFFOLD_ADVANCE\s*>/i.test(text)) {
    extracted.scaffoldAdvance = true;
    text = text.replace(/<\s*SCAFFOLD_ADVANCE\s*>/gi, '').trim();
  }

  // Module complete
  if (/<\s*MODULE_COMPLETE\s*>/i.test(text)) {
    extracted.moduleComplete = true;
    text = text.replace(/<\s*MODULE_COMPLETE\s*>/gi, '').trim();
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
    text = enforceVisualTeaching(context.userMessage, text);
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

  // ── 8b. Re-attach orphaned punctuation ──
  // When a system tag sits on its own line before punctuation, stripping
  // the tag leaves the punctuation dangling on a blank line:
  //   "...your answer\n<PROBLEM_RESULT:correct>\n?" → "...your answer\n\n?"
  // Pull stray punctuation back onto the preceding line.
  text = text.replace(/\n\s*\n\s*([?!.,;:])/g, '$1');
  // Also handle single-newline case: "answer\n?"
  text = text.replace(/\n\s*([?!.])\s*$/gm, '$1');
  // Collapse runs of 3+ newlines to a double newline
  text = text.replace(/\n{3,}/g, '\n\n');

  // ── 9. Validate non-empty ──
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

  // ── 3. Fix bare parenthesized math: ( expr ) → \( expr \) ──
  result = result.replace(/(?<![\\a-zA-Z])\(\s*([^()]+?)\s*\)(?!\s*[=<>])/g, (match, inner) => {
    const hasMathSyntax = /[\\^_{}]/.test(inner) || /[a-z]\^?\d/i.test(inner);
    const isNaturalText = /^[a-z\s,]+$/i.test(inner) || inner.length > 60;
    if (hasMathSyntax && !isNaturalText) {
      return `\\(${inner.trim()}\\)`;
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
