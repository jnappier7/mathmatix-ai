/**
 * TUTOR PLAN MANAGER — Load, create, and update TutorPlans.
 *
 * This is the operational layer for TutorPlans. The pipeline calls these
 * functions at the beginning (load) and end (update) of every interaction.
 *
 * Responsibilities:
 * - Load or create a TutorPlan for a user
 * - Resolve skill familiarity for the current target
 * - Update the plan after each interaction (new observations, phase advances)
 * - Sync course enrollments into the plan's skill focus queue
 *
 * @module utils/tutorPlanManager
 */

const TutorPlan = require('../models/tutorPlan');
const { resolveSkill, FAMILIARITY, INSTRUCTIONAL_MODES } = require('./skillFamiliarityResolver');

/**
 * Load or create the TutorPlan for a user.
 *
 * Called at the start of every pipeline run. If no plan exists,
 * creates a minimal one that the persist stage will flesh out.
 *
 * @param {string|ObjectId} userId
 * @param {Object} [options]
 * @param {Object} [options.user] - User document (avoids extra DB hit if already loaded)
 * @returns {Promise<Object>} The TutorPlan document
 */
async function loadOrCreatePlan(userId, options = {}) {
  let plan = await TutorPlan.findOne({ userId });

  if (!plan) {
    plan = new TutorPlan({
      userId,
      skillFocus: [],
      tutorNotes: [],
      currentTarget: {},
      studentSignals: {},
    });

    // If we have the user document, initialize signals from their profile
    if (options.user) {
      const user = options.user;
      if (user.learningProfile) {
        plan.studentSignals.preferredRepresentations =
          user.learningProfile.preferredRepresentations || [];
      }

      // Sync active course enrollments
      if (user.courseEnrollments?.length > 0) {
        plan.activeCourseIds = user.courseEnrollments
          .filter(e => e.status === 'active')
          .map(e => e.courseId);
      }
    }

    await plan.save();
  }

  return plan;
}

/**
 * Resolve the current target skill and update the plan.
 *
 * Called after the plan is loaded, before the decide stage runs.
 * Determines the instructional mode for whatever the tutor is about to teach.
 *
 * @param {Object} plan - The TutorPlan document
 * @param {Object} context
 * @param {Object} context.user - User document (for skillMastery)
 * @param {string} [context.activeSkillId] - Current skill ID (from conversation or course)
 * @param {string} [context.courseSkillId] - Skill from active course session
 * @returns {Promise<Object>} Updated plan with resolved current target
 */
async function resolveCurrentTarget(plan, context) {
  const { user, activeSkillId, courseSkillId } = context;
  const skillMastery = user.skillMastery || new Map();

  // Determine which skill to target
  // Priority: explicit active skill > course skill > highest-priority plan item
  const targetSkillId = activeSkillId
    || courseSkillId
    || plan.currentTarget?.skillId
    || getHighestPrioritySkill(plan);

  if (!targetSkillId) return { plan, skillResolution: null };

  // Resolve familiarity and prerequisites
  const skillResolution = await resolveSkill(targetSkillId, skillMastery);

  // Update the plan's current target
  plan.currentTarget = {
    skillId: skillResolution.skillId,
    displayName: skillResolution.displayName,
    instructionalMode: skillResolution.instructionalMode,
    startedAt: plan.currentTarget?.skillId === targetSkillId
      ? plan.currentTarget.startedAt
      : new Date(),
    instructionPhase: determineInstructionPhase(
      skillResolution.instructionalMode,
      plan.currentTarget,
      targetSkillId
    ),
  };

  // Update skill focus entry if it exists
  const focusEntry = plan.skillFocus.find(sf => sf.skillId === targetSkillId);
  if (focusEntry) {
    focusEntry.familiarity = skillResolution.familiarity;
    focusEntry.instructionalMode = skillResolution.instructionalMode;
    focusEntry.status = 'in-progress';
    focusEntry.lastWorkedOn = new Date();

    // Update prerequisite gaps
    if (skillResolution.prerequisites?.gaps?.length > 0) {
      focusEntry.prerequisiteGaps = skillResolution.prerequisites.gaps.map(g => ({
        skillId: g.skillId,
        displayName: g.displayName,
        familiarity: g.familiarity,
        status: g.familiarity === FAMILIARITY.MASTERED || g.familiarity === FAMILIARITY.PROFICIENT
          ? 'resolved' : 'needs-work',
      }));
    }
  }

  plan.lastUpdated = new Date();

  return { plan, skillResolution };
}

/**
 * Get the highest-priority active skill from the plan's focus queue.
 */
function getHighestPrioritySkill(plan) {
  const active = (plan.skillFocus || [])
    .filter(sf => sf.status === 'active' || sf.status === 'in-progress')
    .sort((a, b) => b.priority - a.priority);
  return active[0]?.skillId || null;
}

/**
 * Determine the instruction phase for INSTRUCT mode.
 *
 * If the target hasn't changed and we were already in an instruction sequence,
 * preserve the current phase. Otherwise, start from the beginning.
 */
function determineInstructionPhase(mode, existingTarget, newSkillId) {
  if (mode !== INSTRUCTIONAL_MODES.INSTRUCT) return null;

  // If same skill, preserve phase
  if (existingTarget?.skillId === newSkillId && existingTarget?.instructionPhase) {
    return existingTarget.instructionPhase;
  }

  // New skill — start instruction from the beginning
  return 'vocabulary';
}

/**
 * Advance the instruction phase for INSTRUCT mode.
 *
 * Called by the persist stage when evidence shows the student
 * is ready to move to the next phase.
 *
 * @param {Object} plan - The TutorPlan document
 * @param {string} [toPhase] - Specific phase to advance to (or auto-advance)
 * @returns {string|null} The new phase, or null if not in instruct mode
 */
function advanceInstructionPhase(plan, toPhase) {
  if (!plan.currentTarget || plan.currentTarget.instructionalMode !== 'instruct') {
    return null;
  }

  const phases = [
    'prerequisite-review',
    'vocabulary',
    'concept-intro',
    'i-do',
    'we-do',
    'you-do',
    'mastery-check',
  ];

  if (toPhase) {
    plan.currentTarget.instructionPhase = toPhase;
    return toPhase;
  }

  // Auto-advance to next phase
  const currentIndex = phases.indexOf(plan.currentTarget.instructionPhase);
  if (currentIndex >= 0 && currentIndex < phases.length - 1) {
    const nextPhase = phases[currentIndex + 1];
    plan.currentTarget.instructionPhase = nextPhase;
    return nextPhase;
  }

  // Completed instruction — upgrade mode to 'guide' for ongoing practice
  plan.currentTarget.instructionalMode = 'guide';
  plan.currentTarget.instructionPhase = null;
  return null;
}

/**
 * Update the plan after an interaction.
 *
 * Called by the pipeline's persist stage. Records observations,
 * advances phases, and updates session continuity.
 *
 * @param {Object} plan - The TutorPlan document
 * @param {Object} interaction
 * @param {string} [interaction.topic] - What was discussed
 * @param {string} [interaction.skillId] - Skill that was worked on
 * @param {string} [interaction.mood] - Session mood (rising/falling/stable)
 * @param {string} [interaction.outcome] - productive/struggled/breakthrough/disengaged
 * @param {string} [interaction.summary] - One-sentence summary
 * @param {string} [interaction.unfinishedBusiness] - What was left incomplete
 * @param {string} [interaction.conversationId] - Conversation ObjectId
 * @param {Array}  [interaction.notes] - New tutor notes to add [{content, category, skillId}]
 * @param {boolean} [interaction.shouldAdvancePhase] - Whether to advance instruction phase
 * @param {string} [interaction.advanceToPhase] - Specific phase to advance to
 * @returns {Promise<Object>} Updated plan
 */
async function updatePlanAfterInteraction(plan, interaction = {}) {
  // ── Update session continuity ──
  if (interaction.topic || interaction.summary) {
    plan.lastSession = {
      conversationId: interaction.conversationId || null,
      date: new Date(),
      topic: interaction.topic || plan.lastSession?.topic,
      skillId: interaction.skillId || plan.currentTarget?.skillId,
      mood: interaction.mood || null,
      outcome: interaction.outcome || 'productive',
      summary: interaction.summary || null,
      unfinishedBusiness: interaction.unfinishedBusiness || null,
    };
  }

  // ── Add tutor notes ──
  if (interaction.notes?.length > 0) {
    for (const note of interaction.notes) {
      // Check for existing notes on the same topic to supersede
      if (note.category && note.skillId) {
        const existing = plan.tutorNotes.find(
          n => n.category === note.category &&
               n.skillId === note.skillId &&
               !n.supersededAt
        );
        if (existing) {
          existing.supersededAt = new Date();
        }
      }
      plan.tutorNotes.push({
        content: note.content,
        category: note.category || 'general',
        skillId: note.skillId || null,
        source: note.source || 'pipeline',
        createdAt: new Date(),
      });
    }

    // Cap notes at 50 (remove oldest superseded)
    if (plan.tutorNotes.length > 50) {
      const superseded = plan.tutorNotes
        .filter(n => n.supersededAt)
        .sort((a, b) => a.supersededAt - b.supersededAt);
      const toRemove = superseded.slice(0, plan.tutorNotes.length - 50);
      for (const note of toRemove) {
        const idx = plan.tutorNotes.indexOf(note);
        if (idx >= 0) plan.tutorNotes.splice(idx, 1);
      }
    }
  }

  // ── Advance instruction phase if warranted ──
  if (interaction.shouldAdvancePhase) {
    advanceInstructionPhase(plan, interaction.advanceToPhase);
  }

  // ── Update student signals ──
  if (interaction.mood) {
    if (interaction.mood === 'falling') {
      plan.studentSignals.engagementTrend = 'declining';
    } else if (interaction.mood === 'rising') {
      plan.studentSignals.engagementTrend = 'growing';
    }
  }

  // ── Increment session count ──
  plan.sessionCount = (plan.sessionCount || 0) + 1;
  plan.lastUpdated = new Date();

  await plan.save();
  return plan;
}

/**
 * Add a skill to the focus queue.
 *
 * Used when a course is enrolled, a gap is detected, or a teacher assigns focus.
 *
 * @param {Object} plan
 * @param {Object} skillData
 * @param {string} skillData.skillId
 * @param {string} skillData.displayName
 * @param {string} skillData.reason - Why this skill is being added
 * @param {string} skillData.familiarity
 * @param {number} [skillData.priority=5]
 * @returns {Object} The updated plan (not saved)
 */
function addSkillToFocus(plan, skillData) {
  // Don't add duplicates
  const existing = plan.skillFocus.find(sf => sf.skillId === skillData.skillId);
  if (existing) {
    // Update priority if higher
    if (skillData.priority && skillData.priority > existing.priority) {
      existing.priority = skillData.priority;
    }
    existing.reason = skillData.reason || existing.reason;
    return plan;
  }

  const mode = TutorPlan.familiarityToMode(skillData.familiarity);

  plan.skillFocus.push({
    skillId: skillData.skillId,
    displayName: skillData.displayName,
    reason: skillData.reason,
    familiarity: skillData.familiarity,
    instructionalMode: mode,
    priority: skillData.priority || 5,
    prerequisiteGaps: [],
    status: 'active',
    addedAt: new Date(),
  });

  return plan;
}

module.exports = {
  loadOrCreatePlan,
  resolveCurrentTarget,
  advanceInstructionPhase,
  updatePlanAfterInteraction,
  addSkillToFocus,
};
