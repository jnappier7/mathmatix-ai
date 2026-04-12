/**
 * DECIDE STAGE — The engine chooses the tutoring move
 *
 * This is the "big inversion": the engine decides what to do,
 * and the LLM just speaks. No more hoping the model picks the
 * right pedagogical move from a 3K-token prompt.
 *
 * Consumes: observation (from observe) + diagnosis (from diagnose)
 * Produces: a tutoring action that the generate stage will execute
 *
 * @module pipeline/decide
 */

const {
  PHASES,
  transitionPhase,
  getPhasePrompt,
} = require('../lessonPhaseManager');
const {
  evaluatePhaseAdvancement,
  updatePhaseTracker,
  extractSignals,
} = require('../phaseEvidenceEvaluator');

const { MESSAGE_TYPES } = require('./observe');

// ── Tutoring actions the engine can choose ──
const ACTIONS = {
  CONFIRM_CORRECT: 'confirm_correct',
  GUIDE_INCORRECT: 'guide_incorrect',
  HINT: 'hint',
  WORKED_EXAMPLE: 'worked_example',
  PROBING_QUESTION: 'probing_question',
  SWITCH_REPRESENTATION: 'switch_representation',
  REVIEW_PREREQUISITE: 'review_prerequisite',
  RETEACH_MISCONCEPTION: 'reteach_misconception',
  EXIT_RAMP: 'exit_ramp',
  SCAFFOLD_DOWN: 'scaffold_down',
  REDIRECT_TO_MATH: 'redirect_to_math',
  ACKNOWLEDGE_FRUSTRATION: 'acknowledge_frustration',
  CONTINUE_CONVERSATION: 'continue_conversation',
  CHECK_UNDERSTANDING: 'check_understanding',
  PRESENT_PROBLEM: 'present_problem',
  PHASE_INSTRUCTION: 'phase_instruction',

  // ── Instructional mode actions (backbone) ──
  // These are chosen when the tutor plan specifies a mode for the current skill.
  DIRECT_INSTRUCTION: 'direct_instruction',     // Novel skill: teach, don't ask
  PREREQUISITE_BRIDGE: 'prerequisite_bridge',    // Shore up a gap before the target skill
  GUIDED_PRACTICE: 'guided_practice',            // We Do: work together with scaffolding
  INDEPENDENT_PRACTICE: 'independent_practice',  // You Do: student works alone
  STRENGTHEN_CHALLENGE: 'strengthen_challenge',  // Push proficient student with harder problems
  LEVERAGE_BRIDGE: 'leverage_bridge',            // Use mastered skill as bridge to new concept
};

// ── Instructional modes — how the tutor approaches a skill ──
const INSTRUCTIONAL_MODES = {
  INSTRUCT: 'instruct',     // Novel: the student has NEVER seen this
  GUIDE: 'guide',           // Shaky: seen it but needs Socratic guidance
  STRENGTHEN: 'strengthen', // Solid: needs harder problems and transfer
  LEVERAGE: 'leverage',     // Mastered: use as bridge or skip
};

/**
 * Choose the tutoring action based on observation, diagnosis, and phase state.
 *
 * Enhanced with evidence accumulator: when evidence is provided, the decision
 * engine uses BKT knowledge state, FSRS memory signals, cognitive load,
 * consistency scoring, and misconception intelligence to make significantly
 * more accurate pedagogical decisions.
 *
 * @param {Object} observation - From observe stage
 * @param {Object} diagnosis - From diagnose stage
 * @param {Object} context
 * @param {Object} context.phaseState - Current lesson phase state (or null for free chat)
 * @param {Object} context.activeSkill - Current skill { skillId, displayName }
 * @param {Object} context.streakHistory - { idkCount, giveUpCount, recentWrongCount }
 * @param {Object} context.evidence - From evidenceAccumulator (optional, enhances decisions)
 * @param {Object} context.tutorPlan - TutorPlan document (backbone, optional)
 * @param {Object} context.modeTransition - From modeTransitionDetector (optional)
 * @returns {Object} Decision: { action, phase, phasePrompt, scaffoldLevel, diagnosis, directives }
 */
function decide(observation, diagnosis, context = {}) {
  const decision = decideCore(observation, diagnosis, context);

  // Session mood modifiers run AFTER the core decision.
  // This ensures they apply to ALL branches, including early returns.
  applyMoodModifiers(decision, context.sessionMood);

  // Evidence-based modifiers run LAST — they override mood when data is stronger.
  if (context.evidence) {
    applyEvidenceModifiers(decision, context.evidence);
  }

  return decision;
}

/**
 * Core decision logic — picks the tutoring action.
 * Extracted so mood modifiers can wrap it cleanly.
 */
function decideCore(observation, diagnosis, context) {
  const { phaseState, activeSkill } = context;
  const streaks = observation.streaks;
  const msgType = observation.messageType;

  // ── Build the decision object ──
  const decision = {
    action: null,
    phase: phaseState?.currentPhase || null,
    phasePrompt: null,
    phaseState: phaseState,
    scaffoldLevel: 3, // 1=minimal, 5=heavy (default medium)
    diagnosis,
    observation,
    directives: [], // Additional instructions for the generate stage
  };

  // ── Off-task / frustration — handle immediately ──
  if (msgType === MESSAGE_TYPES.OFF_TASK) {
    decision.action = ACTIONS.REDIRECT_TO_MATH;
    decision.directives.push('Redirect gently to math. Brief, not preachy.');
    return decision;
  }

  if (msgType === MESSAGE_TYPES.FRUSTRATION) {
    decision.action = ACTIONS.ACKNOWLEDGE_FRUSTRATION;
    decision.scaffoldLevel = 5; // Maximum support

    // ── Frustration Recovery Protocol (adaptive based on severity) ──
    const frustrationDepth = (streaks.recentWrongCount || 0) + (streaks.idkCount || 0);

    if (frustrationDepth >= 5) {
      // SEVERE: student is in a frustration spiral — reset completely
      decision.directives.push(
        'FRUSTRATION RECOVERY — SEVERE. Student has hit a wall (5+ wrong/IDK).',
        'Step 1: Validate the emotion genuinely. "Yeah, this is legitimately hard. I get it."',
        'Step 2: Offer CHOICE — "Want to try a completely different approach, switch to something easier, or take a quick break?"',
        'Step 3: If they continue, give them a QUICK WIN — a problem you KNOW they can solve to rebuild momentum.',
        'Do NOT push the current problem. Do NOT re-explain the same way. Their working memory is flooded.',
        'Keep your response to 1-2 sentences. Less is more right now.'
      );
    } else if (frustrationDepth >= 3) {
      // MODERATE: struggling but still engaged
      decision.directives.push(
        'FRUSTRATION RECOVERY — MODERATE. Student is struggling but still here.',
        'Acknowledge briefly: "This one is tricky — let me try a different angle."',
        'SWITCH REPRESENTATION: If you were using algebra, try a visual. If verbal, try concrete numbers. If abstract, try a real-world story.',
        'Lower the barrier: break the problem into the smallest possible piece.',
        'Then check: "Does THAT part make more sense?"'
      );
    } else {
      // MILD: just venting
      decision.directives.push(
        'Acknowledge the frustration briefly and genuinely.',
        'Then offer a concrete next step (easier problem, different approach, or break).',
        'Do NOT be condescending or use banned phrases.'
      );
    }
    return decision;
  }

  // ── Parroting — student echoed tutor's words without understanding ──
  if (msgType === MESSAGE_TYPES.PARROTING) {
    decision.action = ACTIONS.CHECK_UNDERSTANDING;
    decision.scaffoldLevel = 3;
    decision.directives.push(
      'PARROTING DETECTED: Student repeated your explanation back without demonstrating understanding.',
      'Do NOT accept this as proof of learning. Do NOT say "great job."',
      'Test with a TRANSFER question: same concept, different context.',
      'Example: "You described it well — now try this slightly different one: [new problem]."',
      'If they can solve the new problem, THEN they understand. If not, reteach.'
    );
    return decision;
  }

  // ── Evasive affirmative — bare "yes" to explanation request ──
  if (msgType === MESSAGE_TYPES.EVASIVE_AFFIRMATIVE) {
    decision.action = ACTIONS.CHECK_UNDERSTANDING;
    decision.scaffoldLevel = 3;
    decision.directives.push(
      'EVASION DETECTED: You asked for an explanation and the student only said "yes" or "I understand."',
      'Do NOT accept this. They need to SHOW understanding, not claim it.',
      'Push gently but firmly: "Show me — walk me through [specific step]."',
      'Or give them a problem to prove it: "Great — then solve this one: [related problem]."',
      'Keep your tone warm and encouraging, not accusatory.'
    );
    return decision;
  }

  // ── Give-up / IDK streaks — exit ramp logic ──
  if (msgType === MESSAGE_TYPES.GIVE_UP || streaks.giveUpCount >= 1) {
    decision.action = ACTIONS.EXIT_RAMP;
    decision.directives.push(
      'NEVER reveal the answer.',
      'Work through a PARALLEL problem (same skill, different numbers).',
      'Then have them try their original problem.',
      'If still stuck, offer to skip and move on.'
    );
    return decision;
  }

  if (msgType === MESSAGE_TYPES.IDK) {
    // When a student says IDK to a worksheet problem but has never been
    // taught the skill, scaffolding down doesn't help — they need the
    // CONCEPT taught first. Switch to teaching via parallel example.
    if (context.hasRecentUpload && context.tutorPlan?.currentTarget?.instructionalMode === INSTRUCTIONAL_MODES.INSTRUCT) {
      decision.action = ACTIONS.DIRECT_INSTRUCTION;
      decision.directives.push(
        'The student has NEVER been taught this skill and is stuck on a worksheet problem.',
        'Do NOT try to scaffold the worksheet problem — they have no framework for it yet.',
        'TEACH the underlying concept/skill using a PARALLEL problem (same skill, different numbers).',
        'Walk through the parallel example step-by-step with think-aloud.',
        'Then say: "Now try applying that to your problem" and guide them Socratically on THEIR worksheet problem.',
        'NEVER solve the worksheet problem directly. The parallel example is for learning; their problem is for practice.'
      );
      return decision;
    }

    // Progressive IDK handling
    if (streaks.idkCount >= 3) {
      decision.action = ACTIONS.EXIT_RAMP;
      decision.directives.push(
        'Student has said IDK 3+ times. Use exit ramp.',
        'Work a parallel problem, then retry. If still stuck, skip.'
      );
    } else if (streaks.idkCount >= 2) {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.scaffoldLevel = 5;
      decision.directives.push(
        'Lower the barrier: rephrase as multiple choice or yes/no.',
        'Change approach entirely from what was tried before.'
      );
    } else {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.scaffoldLevel = 4;
      decision.directives.push('Scaffold with a simpler sub-question.');
    }
    return decision;
  }

  // ── Answer attempts — correctness-driven decisions ──
  if (msgType === MESSAGE_TYPES.ANSWER_ATTEMPT && diagnosis.type !== 'no_answer') {
    if (diagnosis.isCorrect) {
      decision.action = ACTIONS.CONFIRM_CORRECT;
      decision.directives.push(
        'Confirm immediately. Do NOT hedge.',
        'Specific praise about what they did right (not generic).'
      );

      // When student demonstrated reasoning alongside their correct answer,
      // acknowledge their understanding and advance. Do NOT re-scaffold steps
      // they already showed they know.
      if (diagnosis.demonstratedReasoning) {
        decision.directives.push(
          'DEMONSTRATED UNDERSTANDING: Student gave a correct answer WITH valid reasoning.',
          'Affirm their work concisely and move forward immediately.',
          'Do NOT walk them through steps they already explained.',
          'Do NOT ask them to re-derive or re-explain what they clearly understand.'
        );
      } else if (diagnosis.hasExplanation) {
        decision.directives.push(
          'Student provided their answer within an explanation.',
          'Acknowledge what they said and confirm correctness concisely.'
        );
      }

      // Update phase state via evidence-based evaluator
      if (phaseState) {
        const phaseEval = evaluatePhaseAdvancement(
          { phase: phaseState.currentPhase, turnsInPhase: phaseState.turnsInPhase || 0, evidenceLog: phaseState.evidenceLog || [] },
          { diagnosis, observation, decision, sessionMood: context.sessionMood },
          { tutorPlan: context.tutorPlan, evidence: context.evidence }
        );
        updatePhaseTracker(phaseState, phaseEval, { diagnosis, observation, decision });
        if (phaseEval.shouldAdvance && phaseEval.nextPhase) {
          transitionPhase(phaseState, phaseEval.nextPhase, phaseEval.reasoning);
          decision.phase = phaseState.currentPhase;
          decision.directives.push(`Phase transition: ${phaseEval.reasoning}`);
        }
      }
    } else if (diagnosis.isCorrect === false) {
      // Wrong answer — decide between misconception reteach and general guidance
      if (diagnosis.misconception && diagnosis.misconception.fix) {
        decision.action = ACTIONS.RETEACH_MISCONCEPTION;
        decision.directives.push(
          `Misconception detected: ${diagnosis.misconception.name}`,
          `Reteaching strategy: ${diagnosis.misconception.fix}`,
          'Do NOT reveal the answer. Address the root cause.'
        );

        // ── Representation switching for recurring misconceptions ──
        if (streaks.recentWrongCount >= 2) {
          decision.directives.push(
            'REPRESENTATION SWITCH REQUIRED: The student has gotten 2+ wrong with this approach.',
            'You MUST try a DIFFERENT representation than what you used before:',
            '  • If you explained with SYMBOLS/ALGEBRA → switch to a VISUAL (diagram, number line, tiles)',
            '  • If you used VERBAL explanation → switch to CONCRETE NUMBERS (plug in values, test cases)',
            '  • If you used ABSTRACT rules → switch to a REAL-WORLD STORY or ANALOGY',
            '  • If you used a VISUAL → switch to HANDS-ON (counters, tiles, area models)',
            'The same explanation said louder is NOT a different approach. CHANGE the lens.'
          );
        }
      } else if (streaks.recentWrongCount >= 4) {
        // ── Deep struggle: combine worked example with approach switch ──
        decision.action = ACTIONS.WORKED_EXAMPLE;
        decision.scaffoldLevel = 5;
        decision.directives.push(
          'DEEP STRUGGLE: 4+ wrong answers. The current approach is not working.',
          'Show a worked example using a PARALLEL problem AND a DIFFERENT representation than what you tried before.',
          'If previous attempts were algebraic, model with a visual or real-world context.',
          'Think aloud with REASONING at each step: "I notice... so I will... because..."',
          'After the example, check: "Does that approach make more sense?" before having them retry.',
          'If the student seems overwhelmed, offer to try an easier version of the same skill.'
        );
      } else if (streaks.recentWrongCount >= 3) {
        decision.action = ACTIONS.WORKED_EXAMPLE;
        decision.scaffoldLevel = 5;
        decision.directives.push(
          'Multiple wrong answers. Show a worked example with a PARALLEL problem.',
          'Then have them try their original problem again.',
          'IMPORTANT: If previous explanations were verbal/symbolic, try a visual or concrete approach this time.'
        );
      } else if (streaks.recentWrongCount >= 2) {
        // ── Second wrong: guide differently than the first time ──
        decision.action = ACTIONS.GUIDE_INCORRECT;
        decision.scaffoldLevel = 4;
        decision.directives.push(
          'Guide with a question that exposes WHY the answer is wrong.',
          'ADAPTATION: This is the 2nd wrong answer. Your previous guidance didn\'t land.',
          'Try a DIFFERENT angle: if you asked a conceptual question last time, try a concrete number check this time.',
          'Example: "Let\'s test your answer — if x = [their answer], does the equation balance?"',
          'Let THEM see the contradiction. Do not hand them the correction.'
        );
      } else {
        decision.action = ACTIONS.GUIDE_INCORRECT;
        decision.directives.push(
          'Guide with a question that exposes WHY the answer is wrong.',
          'Let THEM arrive at the fix. Do not hand them the correction.'
        );
      }

      // Update phase state via evidence-based evaluator
      if (phaseState) {
        const phaseEval = evaluatePhaseAdvancement(
          { phase: phaseState.currentPhase, turnsInPhase: phaseState.turnsInPhase || 0, evidenceLog: phaseState.evidenceLog || [] },
          { diagnosis, observation, decision, sessionMood: context.sessionMood },
          { tutorPlan: context.tutorPlan, evidence: context.evidence }
        );
        updatePhaseTracker(phaseState, phaseEval, { diagnosis, observation, decision });
        if (phaseEval.shouldRegress && phaseEval.nextPhase) {
          transitionPhase(phaseState, phaseEval.nextPhase, phaseEval.reasoning);
          decision.phase = phaseState.currentPhase;
          decision.directives.push(`Phase regression: ${phaseEval.reasoning}`);
        }
      }
    } else {
      // Unverifiable — pipeline couldn't parse the problem to verify.
      // The LLM must compute the answer itself before responding.
      decision.action = ACTIONS.CONTINUE_CONVERSATION;
      decision.directives.push(
        'ANSWER VERIFICATION REQUIRED: Our math engine could not verify this answer automatically.',
        'You must compute the correct answer yourself BEFORE responding — work it out, then respond accordingly.',
        'If correct: confirm naturally. If wrong: guide with Socratic method without revealing the answer.',
        'When genuinely uncertain, say "Let me think about that..." and work through it. Do not default to implying the student is wrong.'
      );
    }
    return decision;
  }

  // ── Help requests ──
  if (msgType === MESSAGE_TYPES.HELP_REQUEST) {
    decision.action = ACTIONS.HINT;
    decision.scaffoldLevel = 4;
    decision.directives.push('Provide a hint, not the answer. Ask a guiding sub-question.');

    if (phaseState) {
      // Record help request as evidence (not a full phase evaluation — just log the signal)
      if (!phaseState.evidenceLog) phaseState.evidenceLog = [];
      phaseState.evidenceLog.push('asked_question');
    }
    return decision;
  }

  // ── Skip requests ──
  if (msgType === MESSAGE_TYPES.SKIP_REQUEST) {
    if (phaseState) {
      // In structured lesson: don't skip without evidence
      decision.action = ACTIONS.CHECK_UNDERSTANDING;
      decision.directives.push(
        'Student wants to skip. Deploy an evidence-gathering move first.',
        'Do NOT advance without proof of understanding.'
      );
    } else {
      decision.action = ACTIONS.PRESENT_PROBLEM;
      decision.directives.push('Move to the next problem as requested.');
    }
    return decision;
  }

  // ── Check my work ──
  if (msgType === MESSAGE_TYPES.CHECK_MY_WORK) {
    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'Reference uploaded content from conversation history.',
      'Check work one problem at a time. Do NOT just give answers.',
      'Do NOT ask the student to re-share the problem.'
    );
    return decision;
  }

  // ── Affirmative / engagement responses — continue the flow ──
  if (msgType === MESSAGE_TYPES.AFFIRMATIVE || msgType === MESSAGE_TYPES.GREETING) {
    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'Student is engaged and following along. Continue naturally.',
      'Build on the current conversation thread — do NOT repeat or re-ask what was already covered.',
      'If the student just confirmed understanding, move forward to the next step or problem.',
      'Maintain conversational continuity with what was just discussed.'
    );
    return decision;
  }

  // ── Worksheet follow-up — strict anti-cheat ──
  // When a student has uploaded a worksheet and asks for "the next problems",
  // "do the rest", etc., enforce one-problem-at-a-time and refuse bulk solving.
  if (observation.isWorksheetFollowUp) {
    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'ANTI-CHEAT: The student is asking you to solve MULTIPLE worksheet problems. REFUSE.',
      'ONE problem at a time — redirect them to pick a single problem.',
      'Do NOT solve, show steps for, or give answers to more than one problem.',
      'Do NOT use scripted phrases like "Let\'s focus on one at a time!" — just redirect naturally in your own voice.',
      'If they already named a specific problem, guide them through ONLY that one — Socratically.',
      'NEVER show the final answer. The student must do the thinking.'
    );
    return decision;
  }

  // ── Upload context — reinforce Socratic for worksheet problems ──
  // Even for single-problem questions, when a worksheet is present, add extra guardrails.
  if (context.hasRecentUpload && (msgType === MESSAGE_TYPES.QUESTION || msgType === MESSAGE_TYPES.GENERAL_MATH)) {
    const modeDecision = applyInstructionalMode(decision, context);
    if (modeDecision) {
      modeDecision.directives.push(
        'WORKSHEET CONTEXT: The student uploaded a worksheet. Do NOT give away answers.',
        'Guide them through ONE problem at a time. The student does the work.'
      );
      return modeDecision;
    }

    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'The student asked about a problem from their uploaded worksheet.',
      'Break it into the first step and ask THEM to attempt it. Be specific to the actual math.',
      'NEVER show the full solution or final answer — guide them to discover it.',
      'ONE problem at a time. If they ask about multiple, pick the first and ask them to focus on it.',
      'Do NOT ask "what have you tried?" — start tutoring immediately with a guiding question.'
    );
    return decision;
  }

  // ── Math questions — guide, don't solve ──
  if (msgType === MESSAGE_TYPES.QUESTION || msgType === MESSAGE_TYPES.GENERAL_MATH) {
    // Check if the tutor plan specifies an instructional mode for this skill.
    // If so, the mode determines HOW we respond — not just "guide with Socratic."
    const modeDecision = applyInstructionalMode(decision, context);
    if (modeDecision) return modeDecision;

    decision.action = ACTIONS.CONTINUE_CONVERSATION;
    decision.directives.push(
      'The student stated a math problem. Acknowledge it and immediately guide them into the first step.',
      'Do NOT ask "what problem are you working on?" or "what have you tried?" — they just told you the problem. Start tutoring.',
      'Break the problem into its first step and ask the student to attempt THAT step. Be specific to the actual math they asked about.',
      'NEVER show the full solution or final answer. Guide them to discover it one step at a time.'
    );
    return decision;
  }

  // ── Instructional mode decisions (backbone) ──
  // When the tutor plan specifies a mode, it shapes the entire interaction —
  // even for general conversation and phase-specific flow.
  const modeDecision = applyInstructionalMode(decision, context);
  if (modeDecision) return modeDecision;

  // ── Phase-specific decisions (when in structured lesson) ──
  if (phaseState && activeSkill) {
    decision.phasePrompt = getPhasePrompt(phaseState, activeSkill.displayName);
    decision.action = ACTIONS.PHASE_INSTRUCTION;
    decision.directives.push(`Follow ${phaseState.currentPhase} phase instructions.`);
    return decision;
  }

  // ── Default: continue conversation naturally ──
  decision.action = ACTIONS.CONTINUE_CONVERSATION;
  decision.directives.push(
    'Continue the conversation naturally, building on the current topic.',
    'Do NOT give direct answers. Guide with Socratic questions.',
    'Do NOT repeat information already confirmed or covered.'
  );
  return decision;
}

/**
 * Apply instructional mode from the tutor plan to the decision.
 *
 * This is the "backbone" logic. When the tutor plan specifies an
 * instructional mode for the current skill, this function overrides
 * the default Socratic approach with mode-appropriate behavior.
 *
 * A human tutor doesn't ask "what do you think?" about a skill the
 * student has never seen. They TEACH first, then guide, then challenge.
 *
 * @param {Object} decision - The decision object being built
 * @param {Object} context - Pipeline context
 * @returns {Object|null} Modified decision if mode applies, null otherwise
 */
function applyInstructionalMode(decision, context) {
  const { tutorPlan, activeSkill } = context;

  // No tutor plan or no current target — fall through to default behavior
  if (!tutorPlan?.currentTarget?.instructionalMode) return null;

  const { instructionalMode, instructionPhase, skillId } = tutorPlan.currentTarget;
  const targetName = tutorPlan.currentTarget.displayName || skillId;

  // Get prerequisite gap info if available
  const skillFocus = tutorPlan.skillFocus?.find(sf => sf.skillId === skillId);
  const prereqGaps = skillFocus?.prerequisiteGaps?.filter(g => g.status === 'needs-work') || [];

  switch (instructionalMode) {
    // ═══════════════════════════════════════════════════════════
    // INSTRUCT MODE — The student has NEVER seen this skill.
    // The tutor TEACHES. Socratic questioning is suppressed.
    // ═══════════════════════════════════════════════════════════
    case INSTRUCTIONAL_MODES.INSTRUCT: {
      // If there are prerequisite gaps, handle those first
      if (prereqGaps.length > 0) {
        decision.action = ACTIONS.PREREQUISITE_BRIDGE;
        const gap = prereqGaps[0]; // Work on the deepest gap first
        decision.directives.push(
          `PREREQUISITE REMEDIATION: Before teaching ${targetName}, the student needs work on: ${gap.displayName || gap.skillId}.`,
          `Student familiarity with ${gap.displayName || gap.skillId}: ${gap.familiarity}.`,
          gap.familiarity === 'never-seen'
            ? `This prerequisite is also novel. Teach it directly — don't ask what they think. Model it, then practice together.`
            : `This prerequisite has been seen but is shaky. Use guided practice to strengthen it.`,
          `Connect it explicitly: "We need this because it's the foundation for ${targetName}."`,
          'Keep prerequisite work focused and efficient — this is a bridge, not the destination.'
        );
        return decision;
      }

      // No prereq gaps — teach the target skill directly based on phase
      switch (instructionPhase) {
        case 'vocabulary':
          decision.action = ACTIONS.DIRECT_INSTRUCTION;
          decision.directives.push(
            `INSTRUCTION MODE: VOCABULARY INTRODUCTION for ${targetName}.`,
            'Introduce key terms ONE AT A TIME with student-friendly definitions.',
            'For each term: give the definition, then a CONCRETE example, then explain WHY this word matters — what idea does it capture?',
            'ACTIVATE PRIOR KNOWLEDGE: Connect every new term to something the student already understands.',
            '  - "Rate" is just "how fast something changes" — you already know speed is a rate.',
            '  - "Factor" means "something you multiply" — you already use factors when you do 3 × 4 = 12.',
            '  - Ground EVERY term in prior understanding before extending it to the new context.',
            'DO NOT ask the student to solve anything yet — they are learning the language.',
            'Check understanding of each term before introducing the next: "Can you put that in your own words?"',
            'CONCEPTUAL MASTERY: The goal is not memorizing definitions. The goal is the student understanding what each term MEANS — why it exists, what idea it represents, how it connects to the math they already know.'
          );
          return decision;

        case 'concept-intro':
          decision.action = ACTIONS.DIRECT_INSTRUCTION;
          decision.directives.push(
            `INSTRUCTION MODE: CONCEPT INTRODUCTION for ${targetName}.`,
            'Build the BIG IDEA. This is the most important phase — if the student understands the CONCEPT, the procedures follow naturally.',
            'ACTIVATE PRIOR KNOWLEDGE FIRST — this is how concepts stick:',
            '  - Before introducing the new concept, activate the student\'s understanding of a related concept they already know.',
            '  - Example: Before teaching FACTORING, start with DISTRIBUTIVE PROPERTY. "You know that 3(x+2) = 3x+6. Factoring is literally running that BACKWARDS — starting with 3x+6 and figuring out it came from 3(x+2)."',
            '  - Example: Before teaching DERIVATIVES, start with SLOPE. "You already know slope measures steepness between two points. A derivative is what happens when those two points get infinitely close together."',
            '  - The new concept should feel like a NATURAL EXTENSION of something familiar, not a disconnected new rule.',
            'THEN BUILD THE CONCEPT:',
            '  1. Start with WHY: What problem does this concept solve? When would a person NEED this? What would be impossible without it?',
            '  2. Use MULTIPLE REPRESENTATIONS: a visual model, a concrete example, a real-world scenario. The same idea shown three ways builds understanding that one way cannot.',
            '  3. Build INTUITION before notation. The student should understand the idea BEFORE they see the formula.',
            'ABSOLUTELY DO NOT: jump to procedures, show formulas without derivation, use "just memorize this" framing, or teach tricks/shortcuts.',
            'The student is building a mental model. Procedures are downstream. Understanding is the goal.',
            'After explaining, check: "Why does this work?" or "When would you use this?" — not "Did you get that?" Self-reports are not evidence.'
          );
          return decision;

        case 'i-do':
          decision.action = ACTIONS.DIRECT_INSTRUCTION;
          decision.directives.push(
            `INSTRUCTION MODE: I DO (Teacher Models) for ${targetName}.`,
            'Work through 1-2 examples step-by-step WITH THINK-ALOUD reasoning.',
            'CRITICAL: If the student sent a SPECIFIC PROBLEM to solve (e.g. "simplify √48", "solve 2x+3=7"), do NOT solve THEIR problem. Instead, model with a PARALLEL PROBLEM — same skill, different numbers (e.g. if they asked √48, model with √12 or √75). After modeling the parallel problem, have THEM apply the same approach to their original problem. Their problem is their practice — you must not steal it.',
            'If the student is asking a general concept question (not a specific problem), you may demonstrate with any example.',
            'CONCEPTUAL MODELING — NOT procedural demonstration:',
            '  - For EVERY step, explain WHY you are doing it, not just WHAT you are doing.',
            '  - WRONG: "Now we multiply both sides by 3." (procedural — student learns to mimic)',
            '  - RIGHT: "I need to get x alone. Right now it is being divided by 3. To undo that division, I multiply both sides by 3 — because dividing and multiplying are opposites, they cancel out." (conceptual — student learns to THINK)',
            '  - Make the reasoning VISIBLE: "I notice... which tells me... so I will... because..."',
            '  - Show WHY the procedure works, not just that it works. A student who understands WHY can reconstruct the procedure. A student who memorized the procedure is stuck the moment something changes.',
            'After modeling, check: "Can you tell me WHY I did [specific step]?" — not just "Does that make sense?"',
            'If the student can explain WHY a step works, they understood the model. If they can only say "because that is the rule," they memorized it — and you need to re-explain with a different representation.',
            'CRITICAL: Do NOT ask "What do you think the answer is?" during I Do. The student has never done this. Show them.'
          );
          return decision;

        case 'we-do':
          decision.action = ACTIONS.GUIDED_PRACTICE;
          decision.directives.push(
            `INSTRUCTION MODE: WE DO (Guided Practice) for ${targetName}.`,
            'Work through problems TOGETHER. The student contributes, you scaffold.',
            'CONCEPTUAL PRACTICE — ask about reasoning, not just answers:',
            '  - "What should our first step be, and WHY?" — not just "What should our first step be?"',
            '  - When they get a step right, ask "Why did that work?" before moving on.',
            '  - When they get a step wrong, ask "What were you thinking?" — diagnose the CONCEPT gap, not just the arithmetic error.',
            '  - If they say "because that is the rule" or "my teacher said to," push: "But WHY is that the rule? What would happen if we did the opposite?"',
            'Start with heavy scaffolding, decrease as they show UNDERSTANDING (not just correct answers).',
            'A student who gets the right answer for the wrong reason has NOT understood. Catch this.',
            'If the student gets stuck, do NOT give the procedure — reconnect to the concept: "Remember the big idea: [concept]. How does that help us here?"',
            'ANSWER-DUMP GUARD: When you present a practice problem, do NOT state or embed the answer. Hints guide reasoning, never reveal the target.'
          );
          return decision;

        case 'you-do':
          decision.action = ACTIONS.INDEPENDENT_PRACTICE;
          decision.directives.push(
            `INSTRUCTION MODE: YOU DO (Independent Practice) for ${targetName}.`,
            'Present a problem and let the student work ALONE.',
            'Minimal hints. If they ask for help, reconnect to the concept, do not give the procedure.',
            'CONCEPTUAL VERIFICATION: After a correct answer, occasionally ask "Why does that work?" or "What if [variable changed] — would the answer change?"',
            'A student who can answer "why" owns the concept. A student who can only get right answers may be mimicking.',
            'If they struggle significantly (3+ wrong), do NOT just re-show the procedure. Drop back to We Do and reconnect to the concept — the understanding gap is upstream of the errors.',
            'Vary problem contexts: if they practiced with numbers, try a word problem. If they practiced algebraically, try graphically. Transfer across representations is the proof of conceptual understanding.',
            'ANSWER-DUMP GUARD: NEVER state, embed, or hint at the answer when presenting a problem. The student must arrive at it themselves.'
          );
          return decision;

        case 'mastery-check':
          decision.action = ACTIONS.CHECK_UNDERSTANDING;
          decision.directives.push(
            `INSTRUCTION MODE: MASTERY CHECK for ${targetName}.`,
            'This is where you verify CONCEPTUAL mastery — not procedural mimicry.',
            'Deploy ONE of these evidence-gathering moves:',
            '  1. TRANSFER: Same concept, completely different context. If they learned derivatives with polynomials, give them a rate-of-change word problem.',
            '  2. TEACH-BACK: "Explain this to me like I have never seen it." If they can teach it, they own it.',
            '  3. MISCONCEPTION TRAP: Present a problem with a common wrong approach. "A student said [wrong thing]. What would you tell them?"',
            '  4. WHAT-IF: "What would happen if [change a condition]? Would the same approach work?" Tests whether they understand the boundaries of the concept.',
            'A student who passes mastery check with conceptual reasoning (not just right answers) has truly learned. A student who gets the right answer but cannot explain why needs more We Do practice.',
            'ANSWER-DUMP GUARD: Mastery check questions must NOT contain or hint at correct answers. The whole point is that the student demonstrates knowledge — you cannot pre-fill it.'
          );
          return decision;

        case 'prerequisite-review':
          decision.action = ACTIONS.PREREQUISITE_BRIDGE;
          decision.directives.push(
            `INSTRUCTION MODE: PREREQUISITE REVIEW before ${targetName}.`,
            'Review foundational skills needed for the upcoming topic.',
            'Keep it efficient — targeted practice, not full lessons.',
            'Frame it positively: "Let me make sure we have a solid foundation before we build on it."'
          );
          return decision;

        default:
          // No specific phase yet — start the instructional sequence
          decision.action = ACTIONS.DIRECT_INSTRUCTION;
          decision.directives.push(
            `INSTRUCTION MODE: Beginning instruction for ${targetName}.`,
            'This skill is NOVEL to the student — they have never seen it before.',
            'Start with vocabulary if there are new terms, otherwise start with the big idea.',
            'DO NOT begin with a question or problem. Begin by TEACHING.',
            'ALWAYS start by activating prior knowledge — find something the student already knows that connects to this new concept.',
            'Frame the new skill as a natural extension: "You already know [X]. What we are learning today is [X] taken one step further."'
          );
          return decision;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // GUIDE MODE — The student has seen this but it's shaky.
    // Socratic questioning IS appropriate here.
    // ═══════════════════════════════════════════════════════════
    case INSTRUCTIONAL_MODES.GUIDE:
      // Guide mode is closest to the existing default behavior.
      // Just add awareness of what the student has seen before.
      decision.directives.push(
        `GUIDE MODE: Student has some familiarity with ${targetName} but it is not solid.`,
        'Socratic questioning is appropriate — they have a foundation to build on.',
        'Activate prior knowledge: "Remember when we..." or "You have seen this before..."',
        'If they are more stuck than expected, consider dropping to INSTRUCT — reteach the concept.'
      );
      // Don't return — let the normal decision flow handle the specific action
      return null;

    // ═══════════════════════════════════════════════════════════
    // STRENGTHEN MODE — The student is solid but not fluent.
    // Push them with harder problems and novel contexts.
    // ═══════════════════════════════════════════════════════════
    case INSTRUCTIONAL_MODES.STRENGTHEN:
      decision.action = ACTIONS.STRENGTHEN_CHALLENGE;
      decision.directives.push(
        `STRENGTHEN MODE: Student is proficient at ${targetName} but not yet fluent.`,
        'Present harder problems, multi-step applications, or novel contexts.',
        'Minimal scaffolding — let them wrestle with it.',
        'Focus on speed, accuracy, and transfer to unfamiliar formats.',
        'If they are breezing through, acknowledge it and move to the next skill.'
      );
      return decision;

    // ═══════════════════════════════════════════════════════════
    // LEVERAGE MODE — The student has mastered this.
    // Use it as a bridge to something new, don't drill it.
    // ═══════════════════════════════════════════════════════════
    case INSTRUCTIONAL_MODES.LEVERAGE:
      decision.action = ACTIONS.LEVERAGE_BRIDGE;
      decision.directives.push(
        `LEVERAGE MODE: Student has mastered ${targetName}.`,
        'Do NOT drill this skill — it is already solid.',
        'Use it as a BRIDGE to introduce the next concept in the plan.',
        'Example: "Since you know [mastered skill], let me show you how it connects to [new skill]..."',
        'Quick review is OK if needed for warm-up, but keep it brief.'
      );
      return decision;

    default:
      return null;
  }
}

/**
 * Apply session mood modifiers to a decision.
 * Mood doesn't change the ACTION — it adjusts how the action is executed.
 * Called after the core decision logic, before return.
 */
function applyMoodModifiers(decision, sessionMood) {
  if (!sessionMood) return;

  // ── Flow state: don't interrupt ──
  if (sessionMood.inFlow) {
    // Suppress comprehension checks — student is proving mastery by doing
    if (decision.action === ACTIONS.CHECK_UNDERSTANDING) {
      decision.action = ACTIONS.PRESENT_PROBLEM;
      decision.directives.push(
        'Student is in flow state — skip the comprehension check.',
        'Present the next problem to maintain momentum.'
      );
    }
    // Keep praise brief in flow — don't slow them down
    if (decision.action === ACTIONS.CONFIRM_CORRECT) {
      decision.directives.push('Brief confirmation only — student is in flow. Keep pace up.');
    }
  }

  // ── Fatigue: lighten up ──
  if (sessionMood.fatigueSignal) {
    decision.scaffoldLevel = Math.max(decision.scaffoldLevel, 4);
    decision.directives.push(
      'Student is showing fatigue. Keep response SHORT (1-2 sentences).',
      'If struggling, offer a break or easier warm-up problem.'
    );
  }

  // ── Falling trajectory: more support ──
  if (sessionMood.trajectory === 'falling' && !sessionMood.fatigueSignal) {
    if (decision.scaffoldLevel < 4) {
      decision.scaffoldLevel = 4;
    }
    decision.directives.push(
      'Student energy has been dropping. Slightly more support than usual.'
    );
  }

  // ── Recovered: acknowledge the turnaround ──
  if (sessionMood.trajectory === 'recovered') {
    if (decision.action === ACTIONS.CONFIRM_CORRECT) {
      decision.directives.push(
        'Student was struggling earlier but is now getting it. Acknowledge the turnaround naturally (not patronizingly).'
      );
    }
  }
}

/**
 * Apply evidence-based modifiers to a decision.
 *
 * These are informed by BKT, FSRS, cognitive load, consistency scoring,
 * and misconception intelligence. They provide data-driven overrides
 * to the heuristic-based core decision and mood modifiers.
 *
 * Evidence modifiers are STRONGER than mood modifiers because they're
 * backed by mathematical models, not just pattern matching.
 */
function applyEvidenceModifiers(decision, evidence) {
  if (!evidence || !evidence.composite) return;

  const composite = evidence.composite;

  // ── Cognitive overload override (highest priority) ──
  // If the student is cognitively overloaded, ALWAYS reduce scaffold
  if (evidence.cognitiveLoad?.isOverloaded) {
    decision.scaffoldLevel = 5; // Maximum support
    decision.directives.push(
      'COGNITIVE OVERLOAD DETECTED. Simplify immediately.',
      'Break the problem into smaller steps. One piece at a time.',
      'Keep response very short (1-2 sentences max).'
    );

    // If we were about to present a new problem, switch to review
    if (decision.action === ACTIONS.PRESENT_PROBLEM) {
      decision.action = ACTIONS.SCAFFOLD_DOWN;
      decision.directives.push(
        'Do NOT present a new problem while overloaded.',
        'Offer a simpler version or a worked example first.'
      );
    }
  }

  // ── Optimal scaffold level from evidence ──
  // Evidence-based scaffold overrides mood-based scaffold when available
  if (composite.optimalScaffold && !evidence.cognitiveLoad?.isOverloaded) {
    decision.scaffoldLevel = composite.optimalScaffold;
  }

  // ── Recurring misconception intervention ──
  if (evidence.misconceptions?.needsIntervention) {
    decision.directives.push(
      `WARNING: This misconception has occurred ${evidence.misconceptions.recurringCount}+ times.`,
      'Previous teaching approach is NOT working. Try a completely different representation.',
      'Use concrete examples, visual models, or manipulatives instead of symbolic explanation.'
    );

    // If we were going to do standard guide_incorrect, escalate to reteach
    if (decision.action === ACTIONS.GUIDE_INCORRECT) {
      decision.action = ACTIONS.RETEACH_MISCONCEPTION;
      decision.directives.push(
        'ESCALATED: Standard guidance has failed repeatedly. Use reteaching protocol.'
      );
    }
  }

  // ── BKT-informed mastery signals ──
  if (evidence.knowledge?.available) {
    const pL = evidence.knowledge.pLearned;

    // Near mastery — focus on consolidation
    if (pL > 0.90 && pL < 0.95) {
      decision.directives.push(
        'Student is near mastery (P(L)=' + pL.toFixed(2) + '). Focus on consolidation.',
        'Present slightly harder variants to push across the mastery threshold.'
      );
    }

    // Overestimated mastery — student is answering correctly but BKT says not learned
    if (evidence.knowledge.predictedCorrect > 0.7 && pL < 0.4) {
      decision.directives.push(
        'BKT indicates possible guessing (high predicted correct but low P(L)).',
        'Include a transfer problem or ask the student to EXPLAIN their reasoning.'
      );
    }
  }

  // ── Productive struggle recognition ──
  if (evidence.performance?.productiveStruggle) {
    decision.directives.push(
      'PRODUCTIVE STRUGGLE detected. Student struggled and recovered — this is excellent.',
      'Acknowledge the perseverance naturally. Do NOT over-scaffold.'
    );

    // Reduce scaffold if we were going to over-support
    if (decision.scaffoldLevel >= 4 && !evidence.cognitiveLoad?.isOverloaded) {
      decision.scaffoldLevel = 3;
    }
  }

  // ── Break suggestion ──
  if (composite.shouldSuggestBreak && decision.action !== ACTIONS.ACKNOWLEDGE_FRUSTRATION) {
    decision.directives.push(
      'Session fatigue detected. Gently offer a break or suggest switching to an easier topic.',
      'If student continues, keep problems easy and responses very short.'
    );
  }

  // ── Teachable moment ──
  if (composite.teachableMoment && decision.action === ACTIONS.CONFIRM_CORRECT) {
    decision.directives.push(
      'TEACHABLE MOMENT: Student is showing metacognition.',
      'Deepen understanding: ask "Why does this work?" or "What would happen if...?"',
      'Keep it brief — build on their insight, don\'t lecture.'
    );
  }

  // ── Approach effectiveness tracking ──
  // If we've been using the same approach and it's not working, force a switch
  if (composite.shouldSwitchApproach && decision.action !== ACTIONS.ACKNOWLEDGE_FRUSTRATION) {
    decision.directives.push(
      'APPROACH SWITCH REQUIRED: Data indicates the current teaching approach is not working.',
      'You MUST change your representation or method. Options:',
      '  • Algebraic/symbolic → Visual (diagram, graph, number line, tiles)',
      '  • Verbal explanation → Concrete numbers (plug in values, test cases)',
      '  • Abstract rules → Real-world story or physical analogy',
      '  • Teacher-led → Student-led (have them teach it back or find the error)',
      'If you have already tried 2+ representations, go CONCRETE: use manipulatives (counters, tiles, fraction bars).',
      'NEVER repeat the same explanation with different words. That is not switching — that is repeating.'
    );
  }

  // ── Consistency-informed adaptation ──
  // When performance is inconsistent, the student may have partial understanding
  if (evidence.performance.available && evidence.performance.pattern === 'inconsistent') {
    decision.directives.push(
      'INCONSISTENT PERFORMANCE: Student alternates between correct and incorrect.',
      'This usually means partial conceptual understanding — they "get it" sometimes but don\'t fully own the concept.',
      'Deploy a TRANSFER check: same concept, different context. If they fail, the gap is conceptual, not procedural.',
      'Avoid drilling the same problem type — vary the representation to find where understanding breaks down.'
    );
  }

  // ── Near-mastery acceleration ──
  // Student is close — push them across the line efficiently
  if (evidence.knowledge.available && evidence.knowledge.pLearned > 0.85 &&
      evidence.engagement.available && evidence.engagement.inFlow) {
    decision.directives.push(
      'MASTERY ACCELERATION: Student is near-mastery AND in flow state.',
      'Keep problems coming quickly. Brief confirmations. Match their energy.',
      'This is the sprint to the finish — do not slow them down with unnecessary checks.'
    );
  }

  // ── Memory-informed review injection ──
  if (evidence.memory.available && evidence.memory.retrievability < 0.4 &&
      decision.action === ACTIONS.PRESENT_PROBLEM) {
    decision.directives.push(
      `MEMORY ALERT: Retrievability for this skill is low (${(evidence.memory.retrievability * 100).toFixed(0)}%).`,
      'Start with a quick review warm-up before presenting new problems.',
      'Frame it naturally: "Let\'s do a quick refresher before we dive in."'
    );
  }

  // ── Add evidence reasoning to directives ──
  if (composite.reasoning.length > 0) {
    decision.directives.push(
      `[Evidence: ${composite.reasoning.join('; ')}]`
    );
  }
}

/**
 * Initialize or retrieve lesson phase state for a session.
 * Call this at the start of a mastery/lesson session.
 */
function initPhase(skillId, warmupData = { skillName: 'prerequisite', concepts: ['basics'] }) {
  return initializeLessonPhase(skillId, warmupData);
}

module.exports = {
  decide,
  initPhase,
  ACTIONS,
  INSTRUCTIONAL_MODES,
};
