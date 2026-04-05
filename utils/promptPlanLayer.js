/**
 * PROMPT PLAN LAYER — Injects the tutor's mental model into the system prompt.
 *
 * This is the bridge between the TutorPlan (data) and the LLM (language).
 * It builds a concise, structured context block that tells the AI:
 *
 * 1. What instructional mode to use (INSTRUCT vs GUIDE vs STRENGTHEN vs LEVERAGE)
 * 2. What the student's current target skill is and where they are in the sequence
 * 3. What prerequisite gaps exist and need bridging
 * 4. What the tutor has observed about this student across sessions
 * 5. What happened last session (continuity)
 *
 * This layer is injected into EVERY interaction — chat, course, homework help,
 * mastery practice — so the AI always has the tutor's "notebook" available.
 *
 * CRITICAL DESIGN PRINCIPLE: When instructional mode is INSTRUCT, this layer
 * explicitly overrides the default Socratic rules. A student who has never seen
 * a derivative should be TAUGHT, not asked "what do you think?"
 *
 * @module utils/promptPlanLayer
 */

/**
 * Build the tutor plan prompt layer.
 *
 * @param {Object} tutorPlan - The TutorPlan document (or lean object)
 * @param {Object} [options]
 * @param {Object} [options.skillResolution] - From skillFamiliarityResolver.resolveSkill()
 * @param {string} [options.interactionType] - 'chat' | 'course' | 'homework' | 'mastery'
 * @param {boolean} [options.compact] - If true, minimize token count
 * @returns {string} Prompt layer text to inject into system prompt
 */
function buildPlanLayer(tutorPlan, options = {}) {
  if (!tutorPlan) return '';

  const { skillResolution, interactionType = 'chat', compact = false } = options;
  const parts = [];

  // ── Header ──
  parts.push('--- TUTOR PLAN (Your mental model of this student) ---');

  // ── Instructional Mode Override ──
  // This is the most important part: it tells the AI HOW to teach
  const target = tutorPlan.currentTarget;
  if (target?.instructionalMode && target?.skillId) {
    const modeBlock = buildModeDirective(target, skillResolution);
    if (modeBlock) parts.push(modeBlock);
  }

  // ── Skill Focus Queue (what's on the plan) ──
  const activeFocus = (tutorPlan.skillFocus || [])
    .filter(sf => sf.status === 'active' || sf.status === 'in-progress')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, compact ? 3 : 6);

  if (activeFocus.length > 0) {
    const focusLines = activeFocus.map(sf => {
      const mode = sf.instructionalMode.toUpperCase();
      const prereqs = (sf.prerequisiteGaps || []).filter(g => g.status === 'needs-work');
      const prereqNote = prereqs.length > 0
        ? ` (needs: ${prereqs.map(p => p.displayName || p.skillId).join(', ')})`
        : '';
      return `  ${sf.status === 'in-progress' ? '►' : '○'} ${sf.displayName || sf.skillId} [${mode}]${prereqNote}`;
    }).join('\n');
    parts.push(`SKILL FOCUS QUEUE:\n${focusLines}`);
  }

  // ── Prerequisite Gaps (from skill resolution) ──
  if (skillResolution?.prerequisites?.hasGaps) {
    const gaps = skillResolution.prerequisites.criticalGaps.slice(0, 4);
    const gapLines = gaps.map(g =>
      `  ⚠ ${g.displayName} — ${g.familiarity} (${g.instructionalMode})`
    ).join('\n');
    parts.push(`PREREQUISITE GAPS (address before target skill):\n${gapLines}`);
  }

  // ── Session Continuity ──
  if (tutorPlan.lastSession && !compact) {
    const ls = tutorPlan.lastSession;
    const continuityParts = [];
    if (ls.summary) continuityParts.push(`Last session: ${ls.summary}`);
    if (ls.mood) continuityParts.push(`Mood was: ${ls.mood}`);
    if (ls.unfinishedBusiness) continuityParts.push(`Unfinished: ${ls.unfinishedBusiness}`);
    if (continuityParts.length > 0) {
      parts.push(`SESSION CONTINUITY:\n  ${continuityParts.join('\n  ')}`);
    }
  }

  // ── Tutor Notes (observations that persist across sessions) ──
  const currentNotes = (tutorPlan.tutorNotes || [])
    .filter(n => !n.supersededAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, compact ? 3 : 6);

  if (currentNotes.length > 0) {
    const noteLines = currentNotes.map(n => {
      const tag = n.category !== 'general' ? `[${n.category}]` : '';
      return `  ${tag} ${n.content}`;
    }).join('\n');
    parts.push(`TUTOR NOTES:\n${noteLines}`);
  }

  // ── Student Signals (quick-access behavioral data) ──
  const signals = tutorPlan.studentSignals;
  if (signals && !compact) {
    const sigParts = [];
    if (signals.overallConfidence && signals.overallConfidence !== 'moderate') {
      sigParts.push(`Confidence: ${signals.overallConfidence}`);
    }
    if (signals.frustrationTriggers?.length > 0) {
      sigParts.push(`Frustration triggers: ${signals.frustrationTriggers.join(', ')}`);
    }
    if (signals.strengths?.length > 0) {
      sigParts.push(`Strengths: ${signals.strengths.join(', ')}`);
    }
    if (signals.preferredRepresentations?.length > 0) {
      sigParts.push(`Preferred representations: ${signals.preferredRepresentations.join(', ')}`);
    }
    if (sigParts.length > 0) {
      parts.push(`STUDENT SIGNALS:\n  ${sigParts.join('\n  ')}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Build the mode-specific directive that tells the AI HOW to approach the current skill.
 *
 * This is the heart of the backbone. When mode is INSTRUCT, it explicitly
 * overrides the Socratic default and tells the AI to TEACH.
 */
function buildModeDirective(target, skillResolution) {
  const skillName = target.displayName || target.skillId;
  const mode = target.instructionalMode;
  const phase = target.instructionPhase;

  const parts = [];

  switch (mode) {
    case 'instruct':
      parts.push(`🔑 INSTRUCTIONAL MODE: DIRECT INSTRUCTION for "${skillName}"`);
      parts.push('This skill is NOVEL to the student. They have NEVER seen it before.');
      parts.push('CRITICAL OVERRIDE: The standard "never give answers / always use Socratic questioning"');
      parts.push('rule is MODIFIED for this interaction. During modeling (I Do), you SHOW worked');
      parts.push('examples with full solutions and think-aloud reasoning. The student watches and');
      parts.push('learns. Socratic questioning becomes appropriate in We Do and You Do phases.');
      parts.push('');
      parts.push('The instructional sequence for a novel skill:');
      parts.push('  1. VOCABULARY — introduce new terms one at a time');
      parts.push('  2. CONCEPT — build the big idea, connect to prior knowledge');
      parts.push('  3. I DO — model 1-2 worked examples (you solve, they watch)');
      parts.push('  4. WE DO — guided practice together (Socratic + scaffolding)');
      parts.push('  5. YOU DO — independent practice (full Socratic is now appropriate)');
      parts.push('  6. MASTERY CHECK — verify with transfer or teach-back');

      if (phase) {
        parts.push('');
        parts.push(`CURRENT PHASE: ${phase.toUpperCase()}`);
        switch (phase) {
          case 'vocabulary':
            parts.push('→ Introduce key terms. Do NOT solve problems yet.');
            break;
          case 'concept-intro':
            parts.push('→ Build the big idea. WHY does this concept exist? Connect to what they know.');
            break;
          case 'i-do':
            parts.push('→ MODEL worked examples with think-aloud. Student WATCHES. You solve, they absorb.');
            parts.push('→ Do NOT ask "what do you think?" — they have no basis to think anything yet.');
            break;
          case 'we-do':
            parts.push('→ GUIDED PRACTICE. Work together. Student contributes, you scaffold.');
            parts.push('→ Socratic questions OK here — they have seen the model.');
            break;
          case 'you-do':
            parts.push('→ INDEPENDENT PRACTICE. Student works alone. Minimal hints.');
            parts.push('→ Full Socratic mode is appropriate now.');
            break;
          case 'mastery-check':
            parts.push('→ Transfer problem or teach-back. Verify real understanding.');
            break;
        }
      }
      break;

    case 'guide':
      parts.push(`INSTRUCTIONAL MODE: GUIDED for "${skillName}"`);
      parts.push('Student has seen this before but it is not solid. Socratic questioning is appropriate.');
      parts.push('Activate prior knowledge: "Remember when we..." or "You have seen this before..."');
      parts.push('If they are more stuck than expected, you may need to reteach (drop to direct instruction).');
      break;

    case 'strengthen':
      parts.push(`INSTRUCTIONAL MODE: STRENGTHEN for "${skillName}"`);
      parts.push('Student is proficient but not fluent. Push them with harder problems.');
      parts.push('Minimal scaffolding. Novel contexts, multi-step applications, speed work.');
      break;

    case 'leverage':
      parts.push(`INSTRUCTIONAL MODE: LEVERAGE for "${skillName}"`);
      parts.push('Student has mastered this. Use it as a bridge, do not drill it.');
      break;

    default:
      return null;
  }

  // Add teaching guidance from skill document if available
  if (skillResolution?.teachingGuidance) {
    const tg = skillResolution.teachingGuidance;
    const guidanceParts = [];
    if (tg.coreConcepts?.length > 0) {
      guidanceParts.push(`Core concepts: ${tg.coreConcepts.join(', ')}`);
    }
    if (tg.commonMistakes?.length > 0 && mode !== 'leverage') {
      guidanceParts.push(`Watch for these mistakes: ${tg.commonMistakes.join(', ')}`);
    }
    if (tg.connectionsToPriorKnowledge?.length > 0 && (mode === 'instruct' || mode === 'guide')) {
      guidanceParts.push(`Connect to: ${tg.connectionsToPriorKnowledge.join(', ')}`);
    }
    if (guidanceParts.length > 0) {
      parts.push(`\nTEACHING GUIDANCE:\n  ${guidanceParts.join('\n  ')}`);
    }
  }

  return parts.join('\n');
}

/**
 * Determine if the Socratic "never give answers" rule should be suppressed
 * for the current instructional context.
 *
 * Returns true when the tutor should be TEACHING (showing worked examples)
 * rather than GUIDING (asking Socratic questions).
 *
 * @param {Object} tutorPlan
 * @returns {boolean}
 */
function shouldSuppressSocratic(tutorPlan) {
  if (!tutorPlan?.currentTarget) return false;
  const { instructionalMode, instructionPhase } = tutorPlan.currentTarget;

  // During INSTRUCT mode in vocab, concept-intro, or i-do phases,
  // the tutor is TEACHING, not quizzing.
  if (instructionalMode === 'instruct') {
    return ['vocabulary', 'concept-intro', 'i-do', null].includes(instructionPhase);
  }

  return false;
}

module.exports = {
  buildPlanLayer,
  buildModeDirective,
  shouldSuppressSocratic,
};
