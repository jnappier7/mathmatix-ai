/**
 * SIDECAR — Structured signal extraction
 *
 * The "big inversion" for output: instead of asking the LLM to emit
 * 15 different XML tags and hoping it remembers them all, we:
 *
 * 1. Derive most signals deterministically from the pipeline stages
 * 2. Only ask the LLM to emit the 3 signals that require language understanding
 * 3. Merge both into a single structured sidecar object
 *
 * Pipeline-derived signals (deterministic, no LLM needed):
 *   - problemResult (from diagnose)
 *   - skillProgress (from decide + phase state)
 *   - badgeProgress (from persist)
 *
 * LLM-emitted signals (still need language understanding):
 *   - coreBehaviorXp (subjective: "student caught their own error")
 *   - safetyConcern (content detection: self-harm, abuse)
 *   - learningInsight (pedagogical observation)
 *   - scaffoldAdvance (pedagogical judgment about readiness)
 *
 * @module pipeline/sidecar
 */

/**
 * Build the sidecar object from pipeline stages.
 * Called AFTER observe/diagnose/decide but BEFORE generate.
 *
 * @param {Object} observation - From observe stage
 * @param {Object} diagnosis - From diagnose stage
 * @param {Object} decision - From decide stage
 * @param {Object} context - Additional context
 * @param {Object} context.user - User document
 * @param {Object} context.conversation - Conversation document
 * @returns {Object} Sidecar with deterministic signals pre-filled
 */
function buildSidecar(observation, diagnosis, decision, context = {}) {
  const sidecar = {
    // ── Pipeline-derived (deterministic) ──
    problemResult: null,        // 'correct' | 'incorrect' | 'skipped' | null
    skillProgress: null,        // { skillId, event, status }
    badgeProgress: null,        // { correct: bool } or null
    phaseTransition: null,      // { from, to, rationale } or null

    // ── LLM-emitted (extracted from response) ──
    coreBehaviorXp: null,       // { amount, behavior }
    safetyConcern: null,        // string description or null
    learningInsight: null,      // string or null
    // NOTE: scaffoldAdvance and moduleComplete are now handled by the
    // backend step evaluator (stepEvaluator.js). The teaching LLM no
    // longer needs to emit these tags. Kept as fields for backward compat
    // during transition but no longer drive progression.
    scaffoldAdvance: false,     // DEPRECATED — backend evaluator owns this
    moduleComplete: false,      // DEPRECATED — backend detects last-step completion

    // ── Metadata ──
    source: {
      pipelineDerived: [],      // Which signals came from deterministic code
      llmEmitted: [],           // Which signals came from LLM output
    },
  };

  // ── 1. Problem result from diagnosis ──
  if (diagnosis && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
    sidecar.problemResult = diagnosis.isCorrect ? 'correct' : 'incorrect';
    sidecar.source.pipelineDerived.push('problemResult');
  }

  // ── 2. Skill progress from decision/phase state ──
  if (decision.phaseState) {
    const phase = decision.phaseState;

    // Detect if we just transitioned phases
    if (phase._lastTransition) {
      sidecar.phaseTransition = {
        from: phase._lastTransition.from,
        to: phase._lastTransition.to,
        rationale: phase._lastTransition.rationale,
      };
      sidecar.source.pipelineDerived.push('phaseTransition');
    }

    // If phase is 'mastery_confirmed', emit skill progress
    if (phase.currentPhase === 'mastery_confirmed' && context.activeSkill) {
      sidecar.skillProgress = {
        skillId: context.activeSkill.skillId,
        event: 'mastered',
        status: 'mastered',
      };
      sidecar.source.pipelineDerived.push('skillProgress');
    }
  }

  // ── 3. Badge progress from context ──
  if (context.user?.masteryProgress?.activeBadge && sidecar.problemResult) {
    sidecar.badgeProgress = {
      correct: sidecar.problemResult === 'correct',
    };
    sidecar.source.pipelineDerived.push('badgeProgress');
  }

  return sidecar;
}

/**
 * Merge LLM-emitted signals into the sidecar.
 * Called AFTER the verify stage extracts tags from the AI response.
 *
 * Pipeline-derived signals take precedence over LLM-emitted ones
 * for the same field (e.g., if diagnose says "correct" but LLM
 * emits <PROBLEM_RESULT:incorrect>, we trust diagnose).
 *
 * @param {Object} sidecar - From buildSidecar
 * @param {Object} extracted - From verify.extractSystemTags
 * @returns {Object} Merged sidecar
 */
function mergeLlmSignals(sidecar, extracted) {
  // Problem result: pipeline wins if it has an opinion
  if (!sidecar.problemResult && extracted.problemResult) {
    sidecar.problemResult = extracted.problemResult;
    sidecar.source.llmEmitted.push('problemResult');
  }

  // Core behavior XP: only from LLM (subjective judgment)
  if (extracted.coreBehaviorXp) {
    sidecar.coreBehaviorXp = extracted.coreBehaviorXp;
    sidecar.source.llmEmitted.push('coreBehaviorXp');
  }

  // Legacy XP: only from LLM
  if (extracted.legacyXp && !sidecar.coreBehaviorXp) {
    sidecar.coreBehaviorXp = { amount: extracted.legacyXp.amount, behavior: extracted.legacyXp.reason };
    sidecar.source.llmEmitted.push('coreBehaviorXp_legacy');
  }

  // Safety concern: only from LLM (content detection)
  if (extracted.safetyConcern) {
    sidecar.safetyConcern = extracted.safetyConcern;
    sidecar.source.llmEmitted.push('safetyConcern');
  }

  // Learning insight: only from LLM (pedagogical observation)
  if (extracted.learningInsight) {
    sidecar.learningInsight = extracted.learningInsight;
    sidecar.source.llmEmitted.push('learningInsight');
  }

  // Scaffold advance: LLM signal (pedagogical judgment)
  if (extracted.scaffoldAdvance) {
    sidecar.scaffoldAdvance = true;
    sidecar.source.llmEmitted.push('scaffoldAdvance');
  }

  // Module complete: LLM signal
  if (extracted.moduleComplete) {
    sidecar.moduleComplete = true;
    sidecar.source.llmEmitted.push('moduleComplete');
  }

  // Skill mastered: pipeline wins if it has an opinion
  if (!sidecar.skillProgress && extracted.skillMastered) {
    sidecar.skillProgress = {
      skillId: extracted.skillMastered,
      event: 'mastered',
      status: 'mastered',
    };
    sidecar.source.llmEmitted.push('skillMastered');
  }

  // Skill started: only from LLM
  if (extracted.skillStarted && (!sidecar.skillProgress || sidecar.skillProgress.event !== 'mastered')) {
    sidecar.skillProgress = {
      skillId: extracted.skillStarted,
      event: 'started',
      status: 'learning',
    };
    sidecar.source.llmEmitted.push('skillStarted');
  }

  // IEP goal progress: only from LLM
  if (extracted.iepGoalUpdates?.length > 0) {
    sidecar.iepGoalUpdates = extracted.iepGoalUpdates;
    sidecar.source.llmEmitted.push('iepGoalUpdates');
  }

  return sidecar;
}

/**
 * Generate the minimal tag instruction for the LLM.
 * Only asks for the 3 signals that require language understanding.
 * This replaces the long list of 15 tags in the old prompt.
 */
function getSidecarInstruction() {
  return `STRUCTURED SIGNALS — Silently append tags at the END of your response when relevant.
🚨 NEVER mention these tags to the student. They are invisible server signals.
- <CORE_BEHAVIOR_XP:AMOUNT,BEHAVIOR> — 25/50/100 XP for: explained_reasoning, caught_own_error, strategy_selection, persistence, transfer, taught_back. Ceremony required. Max 2/session.
- <SAFETY_CONCERN>description</SAFETY_CONCERN> — Flag self-harm, abuse, or danger.
- <LEARNING_INSIGHT:observation> — Notable observation about how this student learns.
Do NOT emit <SKILL_MASTERED> or <SCAFFOLD_ADVANCE> — these are tracked automatically by the backend.`;
}

/**
 * Count how many signals in this sidecar came from deterministic code
 * vs. LLM output. Useful for monitoring reliability.
 */
function getSignalStats(sidecar) {
  return {
    pipelineDerived: sidecar.source.pipelineDerived.length,
    llmEmitted: sidecar.source.llmEmitted.length,
    total: sidecar.source.pipelineDerived.length + sidecar.source.llmEmitted.length,
    reliability: sidecar.source.pipelineDerived.length /
      Math.max(1, sidecar.source.pipelineDerived.length + sidecar.source.llmEmitted.length),
  };
}

module.exports = {
  buildSidecar,
  mergeLlmSignals,
  getSidecarInstruction,
  getSignalStats,
};
