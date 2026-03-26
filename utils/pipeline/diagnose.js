/**
 * DIAGNOSE STAGE — Answer verification + misconception detection
 *
 * When the observe stage classifies a message as an answer attempt,
 * this stage determines correctness and identifies misconceptions.
 *
 * Produces a clean diagnosis object that downstream stages consume.
 * The LLM never sees raw diagnosis logic — it gets a structured summary.
 *
 * @module pipeline/diagnose
 */

const { processMathMessage, verifyAnswer } = require('../mathSolver');
const { analyzeError, findKnownMisconception, MISCONCEPTION_LIBRARY } = require('../misconceptionDetector');

/**
 * Strip LaTeX delimiters from text so regex-based math detection works.
 * AI messages store numbers wrapped in \(...\) or \[...\] per the system prompt's
 * MATH FORMATTING rule, but processMathMessage expects plain text.
 *
 * "When you add \(141\) and \(94\):" → "When you add 141 and 94:"
 */
function stripLatexDelimiters(text) {
  if (!text) return text;
  return text
    .replace(/\\\(([^)]*?)\\\)/g, '$1')   // \(expr\) → expr
    .replace(/\\\[([^\]]*?)\\\]/g, '$1')   // \[expr\] → expr
    .replace(/\$\$([^$]*?)\$\$/g, '$1')    // $$expr$$ → expr
    .replace(/(?<![\\$])\$([^$\n]+?)\$/g, '$1'); // $expr$ → expr (not currency)
}

/**
 * Run the full diagnosis pipeline on an answer attempt.
 *
 * @param {Object} observation - Output from observe stage
 * @param {Object} context
 * @param {Array}  context.recentAssistantMessages - Last few AI messages (to find the posed problem)
 * @param {Object} context.activeSkill - Current skill being practiced { skillId, displayName, teachingGuidance }
 * @param {Object} context.user - The user document (for misconception history)
 * @returns {Object} Diagnosis result
 */
async function diagnose(observation, context = {}) {
  // Only run diagnosis on answer attempts
  if (!observation.answer) {
    return {
      type: 'no_answer',
      isCorrect: null,
      answer: null,
      correctAnswer: null,
      misconception: null,
      evidence: null,
    };
  }

  const studentAnswer = observation.answer.value;
  const recentAI = context.recentAssistantMessages || [];

  // ── Step 1: Find the problem that was posed ──
  // Walk backwards through recent AI messages to find a math problem.
  // Strip LaTeX delimiters first — stored messages wrap numbers in \(...\)
  // which breaks regex-based math detection (e.g. "add \(141\) and \(94\)"
  // won't match the nlAddPattern expecting "add 141 and 94").
  let problemInfo = null;
  for (let i = recentAI.length - 1; i >= 0; i--) {
    const plainContent = stripLatexDelimiters(recentAI[i].content);
    const result = processMathMessage(plainContent);
    if (result.hasMath && result.solution?.success) {
      problemInfo = {
        problemType: result.problem.type,
        correctAnswer: result.solution.answer,
        steps: result.solution.steps || [],
        content: recentAI[i].content,
      };
      break;
    }
  }

  // ── Step 2: Verify the answer ──
  let isCorrect = null;
  let correctAnswer = null;

  if (problemInfo) {
    const verification = verifyAnswer(studentAnswer, problemInfo.correctAnswer);
    isCorrect = verification.isCorrect;
    correctAnswer = problemInfo.correctAnswer;
  }

  // ── Step 3: If incorrect, detect misconception ──
  let misconception = null;

  if (isCorrect === false && context.activeSkill) {
    // First try deterministic library match
    const knownMisconception = findKnownMisconception(
      context.activeSkill.skillId,
      `Student answered ${studentAnswer} instead of ${correctAnswer}`
    );

    if (knownMisconception) {
      misconception = {
        source: 'library',
        id: knownMisconception.id,
        name: knownMisconception.name,
        description: knownMisconception.description,
        fix: knownMisconception.fix,
        testQuestion: knownMisconception.testQuestion,
        severity: 'medium',
        confidence: 0.8,
      };
    } else {
      // Fall back to AI analysis (more expensive, but catches novel errors)
      try {
        const aiAnalysis = await analyzeError(
          { content: problemInfo?.content || 'Unknown problem', answer: correctAnswer },
          studentAnswer,
          context.activeSkill
        );

        misconception = {
          source: 'ai_analysis',
          id: null,
          name: aiAnalysis.misconceptionName,
          description: aiAnalysis.errorDescription,
          fix: null, // No predefined fix for novel misconceptions
          testQuestion: null,
          severity: aiAnalysis.severity,
          confidence: 0.6,
          rootCause: aiAnalysis.rootCause,
        };
      } catch (err) {
        console.error('[Diagnose] AI misconception analysis failed:', err.message);
        // Non-fatal: we still know the answer is wrong
      }
    }
  }

  // ── Step 4: Build evidence record ──
  const evidence = {
    isCorrect,
    independenceLevel: estimateIndependence(observation, context),
    misconceptionHit: misconception ? misconception.name : null,
    responseTimeCategory: null, // Will be set by caller if responseTime available
    problemContext: observation.problemContext,
    timestamp: new Date(),
  };

  // ── Step 5: Flag demonstrated reasoning ──
  // When a student provides both a correct answer AND shows their work/reasoning,
  // that's strong evidence of understanding. The decide stage uses this to skip
  // unnecessary scaffolding steps and affirm immediately.
  const demonstratedReasoning = isCorrect === true && observation.demonstratedReasoning === true;
  const hasExplanation = observation.answer?.hasExplanation === true;

  return {
    type: isCorrect === null ? 'unverifiable' : (isCorrect ? 'correct' : 'incorrect'),
    isCorrect,
    answer: studentAnswer,
    correctAnswer,
    misconception,
    evidence,
    demonstratedReasoning,  // true = student gave correct answer + valid reasoning
    hasExplanation,         // true = answer was embedded in explanatory text
    problemInfo: problemInfo ? {
      type: problemInfo.problemType,
      correctAnswer: problemInfo.correctAnswer,
    } : null,
  };
}

/**
 * Estimate independence level based on recent conversation signals.
 * Used for the independence pillar of 4-pillar mastery.
 *
 * @returns {'independent' | 'hint_assisted' | 'heavily_scaffolded'}
 */
function estimateIndependence(observation, context) {
  const recentUser = context.recentUserMessages || [];
  const lastFew = recentUser.slice(-4);

  const hintRequests = lastFew.filter(msg =>
    /\b(hint|help|stuck|don'?t\s*(understand|get\s*it)|idk|confused)\b/i.test(msg.content)
  ).length;

  if (hintRequests === 0) return 'independent';
  if (hintRequests <= 1) return 'hint_assisted';
  return 'heavily_scaffolded';
}

/**
 * Quick synchronous check: does this skill have known misconceptions?
 * Used by the decide stage to determine if misconception-specific
 * reteaching is available.
 */
function hasLibraryMisconceptions(skillId) {
  return skillId in MISCONCEPTION_LIBRARY;
}

module.exports = {
  diagnose,
  estimateIndependence,
  hasLibraryMisconceptions,
};
