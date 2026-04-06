/**
 * SKILL FAMILIARITY RESOLVER
 *
 * The tutor's first question before teaching any skill:
 * "Has this student seen this before?"
 *
 * This module answers that question by:
 * 1. Checking the student's skill mastery data
 * 2. Walking the prerequisite chain to find gaps
 * 3. Determining the right instructional mode (INSTRUCT / GUIDE / STRENGTHEN / LEVERAGE)
 * 4. Building a prerequisite remediation plan when needed
 *
 * A real tutor doesn't ask "what do you think the derivative of x² is?"
 * to a student who's never seen a derivative. They TEACH it first.
 * This resolver ensures the AI knows the difference.
 *
 * @module utils/skillFamiliarityResolver
 */

const Skill = require('../models/skill');
const TutorPlan = require('../models/tutorPlan');

// ── Familiarity levels ──
const FAMILIARITY = {
  NEVER_SEEN: 'never-seen',
  INTRODUCED: 'introduced',
  DEVELOPING: 'developing',
  PROFICIENT: 'proficient',
  MASTERED: 'mastered',
};

// ── Instructional modes ──
const INSTRUCTIONAL_MODES = {
  INSTRUCT: 'instruct',     // Novel: vocab → concept → I Do → We Do → You Do
  GUIDE: 'guide',           // Shaky: Socratic questioning, scaffolded practice
  STRENGTHEN: 'strengthen', // Solid: harder problems, transfer, speed
  LEVERAGE: 'leverage',     // Mastered: use as bridge, skip, or quick review
};

/**
 * Determine how familiar a student is with a skill based on their mastery data.
 *
 * @param {Map|Object} skillMastery - The user's skillMastery map
 * @param {string} skillId - The skill to check
 * @returns {string} One of the FAMILIARITY values
 */
function assessFamiliarity(skillMastery, skillId) {
  const entry = skillMastery instanceof Map
    ? skillMastery.get(skillId)
    : skillMastery?.[skillId];

  return TutorPlan.inferFamiliarity(entry || null);
}

/**
 * Map familiarity to the appropriate instructional mode.
 *
 * @param {string} familiarity - One of the FAMILIARITY values
 * @returns {string} One of the INSTRUCTIONAL_MODES values
 */
function familiarityToMode(familiarity) {
  return TutorPlan.familiarityToMode(familiarity);
}

/**
 * Walk the prerequisite chain for a skill and identify gaps.
 *
 * Returns a flat list of prerequisite skills with their familiarity status,
 * ordered from deepest prerequisite to shallowest (topological order).
 * This is the order a tutor would remediate: fix the foundations first.
 *
 * @param {string} skillId - The target skill
 * @param {Map|Object} skillMastery - The user's skillMastery map
 * @param {Object} [options]
 * @param {number} [options.maxDepth=4] - Maximum prerequisite depth to walk
 * @param {Object} [options.skillCache] - Pre-loaded skill documents (avoids DB hits)
 * @returns {Promise<Object>} Prerequisite analysis
 */
async function analyzePrerequisites(skillId, skillMastery, options = {}) {
  const { maxDepth = 4, skillCache = {} } = options;

  const visited = new Set();
  const gaps = [];
  const solid = [];

  async function getSkill(id) {
    if (skillCache[id]) return skillCache[id];
    const doc = await Skill.findOne({ skillId: id }).lean();
    if (doc) skillCache[id] = doc;
    return doc;
  }

  // BFS through prerequisite chain
  async function walk(currentSkillId, depth) {
    if (depth > maxDepth || visited.has(currentSkillId)) return;
    visited.add(currentSkillId);

    const skillDoc = await getSkill(currentSkillId);
    if (!skillDoc || !skillDoc.prerequisites || skillDoc.prerequisites.length === 0) return;

    for (const prereqId of skillDoc.prerequisites) {
      if (visited.has(prereqId)) continue;

      const familiarity = assessFamiliarity(skillMastery, prereqId);
      const prereqDoc = await getSkill(prereqId);
      const prereqEntry = {
        skillId: prereqId,
        displayName: prereqDoc?.displayName || prereqId,
        familiarity,
        instructionalMode: familiarityToMode(familiarity),
        depth,
        isGap: familiarity === FAMILIARITY.NEVER_SEEN ||
               familiarity === FAMILIARITY.INTRODUCED ||
               familiarity === FAMILIARITY.DEVELOPING,
      };

      if (prereqEntry.isGap) {
        gaps.push(prereqEntry);
      } else {
        solid.push(prereqEntry);
      }

      // Continue walking deeper for gaps
      if (prereqEntry.isGap) {
        await walk(prereqId, depth + 1);
      }
    }
  }

  await walk(skillId, 1);

  // Sort gaps: deepest first (fix foundations before building on them)
  gaps.sort((a, b) => b.depth - a.depth);

  return {
    targetSkillId: skillId,
    gaps,
    solid,
    hasGaps: gaps.length > 0,
    criticalGaps: gaps.filter(g =>
      g.familiarity === FAMILIARITY.NEVER_SEEN ||
      g.familiarity === FAMILIARITY.INTRODUCED
    ),
    totalPrerequisites: gaps.length + solid.length,
  };
}

/**
 * Full skill resolution — the main entry point.
 *
 * Given a target skill and a student's mastery data, determines:
 * - How familiar the student is with the target skill
 * - What instructional mode to use
 * - Whether prerequisite remediation is needed first
 * - What the remediation order should be
 *
 * This is what the pipeline's decide stage calls before choosing
 * its tutoring action.
 *
 * @param {string} skillId - The skill to resolve
 * @param {Map|Object} skillMastery - The user's skillMastery map
 * @param {Object} [options]
 * @param {number} [options.maxDepth=4] - Max prerequisite depth
 * @param {Object} [options.skillCache] - Pre-loaded skill documents
 * @returns {Promise<Object>} Complete resolution
 */
async function resolveSkill(skillId, skillMastery, options = {}) {
  const { skillCache = {} } = options;

  // 1. Assess the target skill itself
  const familiarity = assessFamiliarity(skillMastery, skillId);
  const instructionalMode = familiarityToMode(familiarity);

  // 2. Get the skill document for teaching guidance
  let skillDoc = skillCache[skillId];
  if (!skillDoc) {
    skillDoc = await Skill.findOne({ skillId }).lean();
    if (skillDoc) skillCache[skillId] = skillDoc;
  }

  // 3. Analyze prerequisites (only if not already mastered)
  let prerequisites = { gaps: [], solid: [], hasGaps: false, criticalGaps: [], totalPrerequisites: 0 };
  if (familiarity !== FAMILIARITY.MASTERED && familiarity !== FAMILIARITY.PROFICIENT) {
    prerequisites = await analyzePrerequisites(skillId, skillMastery, { ...options, skillCache });
  }

  // 4. Build the teaching plan
  const teachingPlan = buildTeachingPlan(skillId, familiarity, instructionalMode, prerequisites, skillDoc);

  return {
    skillId,
    displayName: skillDoc?.displayName || skillId,
    familiarity,
    instructionalMode,
    prerequisites,
    teachingPlan,
    teachingGuidance: skillDoc?.teachingGuidance || null,
  };
}

/**
 * Build a step-by-step teaching plan based on familiarity and prerequisites.
 *
 * This is the tutor's internal plan — not shown to the student.
 * It tells the decide stage what sequence to follow.
 *
 * @param {string} skillId
 * @param {string} familiarity
 * @param {string} mode
 * @param {Object} prerequisites
 * @param {Object|null} skillDoc
 * @returns {Object} Teaching plan
 */
function buildTeachingPlan(skillId, familiarity, mode, prerequisites, skillDoc) {
  const steps = [];

  // ── Step 1: Prerequisite remediation (if needed) ──
  if (prerequisites.hasGaps) {
    for (const gap of prerequisites.criticalGaps) {
      steps.push({
        type: 'prerequisite-remediation',
        skillId: gap.skillId,
        displayName: gap.displayName,
        mode: gap.instructionalMode,
        reason: `Prerequisite for ${skillDoc?.displayName || skillId}`,
      });
    }
  }

  // ── Step 2: Instructional sequence based on mode ──
  switch (mode) {
    case INSTRUCTIONAL_MODES.INSTRUCT:
      // Full gradual release: the student has NEVER seen this
      steps.push(
        { type: 'vocabulary', skillId, description: 'Introduce key terms with student-friendly definitions and examples' },
        { type: 'concept-intro', skillId, description: 'Build conceptual understanding — WHY this works, connect to prior knowledge' },
        { type: 'i-do', skillId, description: 'Model 1-2 worked examples with think-aloud reasoning. Student watches.' },
        { type: 'we-do', skillId, description: 'Guided practice — work problems together, scaffolding decreases as understanding grows' },
        { type: 'you-do', skillId, description: 'Independent practice — student works alone, minimal hints' },
        { type: 'mastery-check', skillId, description: 'Verify understanding with a transfer problem or teach-back' },
      );
      break;

    case INSTRUCTIONAL_MODES.GUIDE:
      // Student has seen this — Socratic guidance, not full instruction
      steps.push(
        { type: 'activate-prior', skillId, description: 'Connect to what they already know — "Remember when we..."' },
        { type: 'guided-practice', skillId, description: 'Socratic questioning — guide them to the answer, don\'t give it' },
        { type: 'independent-practice', skillId, description: 'Practice with decreasing scaffolding' },
        { type: 'mastery-check', skillId, description: 'Verify with a transfer problem' },
      );
      break;

    case INSTRUCTIONAL_MODES.STRENGTHEN:
      // Student is solid — push them
      steps.push(
        { type: 'challenge', skillId, description: 'Harder problems, novel contexts, multi-step applications' },
        { type: 'transfer', skillId, description: 'Apply the skill in a new context (word problem, graph, real-world)' },
        { type: 'speed-round', skillId, description: 'Build fluency if applicable' },
      );
      break;

    case INSTRUCTIONAL_MODES.LEVERAGE:
      // Mastered — use it, don't drill it
      steps.push(
        { type: 'bridge', skillId, description: 'Use mastered skill as entry point to new concept' },
      );
      break;
  }

  return {
    mode,
    steps,
    requiresPrerequisiteWork: prerequisites.hasGaps && prerequisites.criticalGaps.length > 0,
    estimatedSteps: steps.length,
    currentStepIndex: 0,
  };
}

/**
 * Quick-resolve multiple skills at once.
 * Useful for building a TutorPlan skill focus queue from course content.
 *
 * @param {string[]} skillIds - Skills to resolve
 * @param {Map|Object} skillMastery - Student's mastery data
 * @param {Object} [options]
 * @returns {Promise<Object[]>} Array of resolution results
 */
async function resolveMultiple(skillIds, skillMastery, options = {}) {
  // Pre-load all skill documents in one query
  const allSkillIds = new Set(skillIds);
  const skillDocs = await Skill.find({ skillId: { $in: [...allSkillIds] } }).lean();
  const skillCache = {};
  for (const doc of skillDocs) {
    skillCache[doc.skillId] = doc;
    // Also cache prerequisites for the chain walk
    if (doc.prerequisites) {
      for (const prereqId of doc.prerequisites) {
        allSkillIds.add(prereqId);
      }
    }
  }

  // Load prerequisite docs too
  const prereqDocs = await Skill.find({
    skillId: { $in: [...allSkillIds].filter(id => !skillCache[id]) }
  }).lean();
  for (const doc of prereqDocs) {
    skillCache[doc.skillId] = doc;
  }

  // Resolve each skill
  const results = [];
  for (const skillId of skillIds) {
    results.push(await resolveSkill(skillId, skillMastery, { ...options, skillCache }));
  }

  return results;
}

module.exports = {
  FAMILIARITY,
  INSTRUCTIONAL_MODES,
  assessFamiliarity,
  familiarityToMode,
  analyzePrerequisites,
  resolveSkill,
  resolveMultiple,
  buildTeachingPlan,
};
