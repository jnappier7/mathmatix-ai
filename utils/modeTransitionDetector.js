/**
 * MODE TRANSITION DETECTOR
 *
 * Detects when a student shifts context mid-session and recommends
 * adjustments to the tutor's instructional approach.
 *
 * Scenarios detected:
 *   HOMEWORK_DETECTED     – student brings homework / test prep
 *   COURSE_TOPIC_OVERLAP  – question maps to a skill in their course
 *   EXPLORATORY_TANGENT   – student veers off the current lesson topic
 *   FRUSTRATION_PIVOT     – student is frustrated, offer an alternative
 *   MASTERY_SIGNAL        – student is breezing through, advance faster
 *   PREREQUISITE_SURFACE  – a prerequisite gap surfaces during practice
 *   RETURN_TO_PLAN        – student returns from a tangent
 *
 * Pure functions only — no DB access, no AI calls.
 *
 * @module modeTransitionDetector
 */

const { MESSAGE_TYPES } = require('./pipeline/observe');

// ─── Transition types ────────────────────────────────────────────────────────

const TRANSITION_TYPES = {
  HOMEWORK_DETECTED: 'homework_detected',
  COURSE_TOPIC_OVERLAP: 'course_topic_overlap',
  EXPLORATORY_TANGENT: 'exploratory_tangent',
  FRUSTRATION_PIVOT: 'frustration_pivot',
  MASTERY_SIGNAL: 'mastery_signal',
  PREREQUISITE_SURFACE: 'prerequisite_surface',
  RETURN_TO_PLAN: 'return_to_plan',
};

// ─── Instructional modes (mirror the pipeline's vocabulary) ──────────────────

const INSTRUCTIONAL_MODES = {
  INSTRUCT: 'instruct',
  GUIDE: 'guide',
  STRENGTHEN: 'strengthen',
  LEVERAGE: 'leverage',
};

// ─── Keyword patterns ────────────────────────────────────────────────────────

const HOMEWORK_KEYWORDS = /\b(homework|home\s*work|h\.?w\.?|assignment|worksheet|test|quiz|exam|mid-?term|final|review\s*sheet|study\s*guide|practice\s*test|workbook|packet|due\s*(?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday))\b/i;

const HOMEWORK_CONTEXT_PHRASES = /\b(my\s*teacher\s*(?:gave|assigned|wants)|have\s*to\s*(?:do|finish|turn\s*in|submit)|(?:is|it'?s)\s*due|for\s*(?:class|school|my\s*class)|from\s*(?:class|school|my\s*(?:teacher|class|textbook)))\b/i;

const EXPLORATION_KEYWORDS = /\b(what\s*(?:about|if|happens\s*(?:when|if))|what'?s\s*the\s*(?:deal|point|difference)|can\s*(?:you|we)\s*(?:also|try)|(?:how|why)\s*does\s*(?:that|this)\s*(?:work|relate|connect)|is\s*(?:there|it)\s*(?:a|any)\s*(?:connection|relationship)|just\s*(?:wondering|curious)|random\s*question|off\s*topic\s*(?:but|question)|by\s*the\s*way|btw)\b/i;

const RETURN_KEYWORDS = /\b((?:ok(?:ay)?|alright|anyway|anyways|anyhow|so)\s*(?:back\s*to|where\s*were\s*we|let'?s\s*(?:go\s*back|continue|keep\s*going|get\s*back))|(?:back\s*to|return\s*to)\s*(?:the|my|our|what\s*we\s*were)|(?:let'?s|can\s*we)\s*(?:go\s*back|get\s*back|resume|continue|keep\s*going)|what\s*were\s*we\s*(?:doing|working\s*on)|never\s*mind\s*(?:that|the))\b/i;

const PREREQUISITE_GAP_PHRASES = /\b(what\s*(?:is|are|does)\s*(?:a|an)?\s*(?:variable|coefficient|exponent|denominator|numerator|integer|fraction|decimal|ratio|factor|term|expression|equation|inequality|slope|intercept|function|domain|range|polynomial|radical|logarithm|derivative|integral)|what\s*do\s*(?:you|they)\s*mean\s*by|i\s*(?:don'?t|never)\s*(?:know|learned|remember|understand)\s*(?:what|how)\s*(?:to|a|an)?|how\s*do\s*(?:you|i)\s*(?:add|subtract|multiply|divide|simplify|factor|solve)\s*(?:fractions|decimals|negatives|exponents|radicals)|wait\s*(?:what|how)\s*(?:is|do|does))\b/i;

// ─── Helper: build a lightweight skill-keyword index from course skills ──────

/**
 * Build a simple lookup mapping keywords (from skill IDs and display names)
 * back to skillIds so we can detect course-topic overlap cheaply.
 *
 * @param {Array} courseSkills - Array of { skillId, displayName } from the course
 * @returns {Map<string, string>} keyword -> skillId
 */
function buildSkillKeywordIndex(courseSkills) {
  const index = new Map();
  if (!Array.isArray(courseSkills)) return index;

  for (const skill of courseSkills) {
    // Tokenize skillId (e.g. "two-step-equations" -> ["two", "step", "equations"])
    const tokens = (skill.skillId || '').split(/[-_]+/).filter(t => t.length > 2);
    for (const token of tokens) {
      index.set(token.toLowerCase(), skill.skillId);
    }
    // Also tokenize displayName if present
    if (skill.displayName) {
      const nameTokens = skill.displayName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      for (const token of nameTokens) {
        index.set(token, skill.skillId);
      }
    }
  }
  return index;
}

/**
 * Check whether the student's message references a skill from their course.
 * Returns the matched skillId or null.
 */
function findCourseTopicOverlap(messageLower, courseSkills) {
  if (!Array.isArray(courseSkills) || courseSkills.length === 0) return null;

  const index = buildSkillKeywordIndex(courseSkills);
  const words = messageLower.split(/\s+/);

  // Score each skill by how many keyword tokens match
  const hits = {};
  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (clean.length <= 2) continue;
    const skillId = index.get(clean);
    if (skillId) {
      hits[skillId] = (hits[skillId] || 0) + 1;
    }
  }

  // Require at least 2 keyword hits to avoid false positives
  let best = null;
  let bestCount = 0;
  for (const [skillId, count] of Object.entries(hits)) {
    if (count >= 2 && count > bestCount) {
      best = skillId;
      bestCount = count;
    }
  }
  return best;
}

// ─── Individual detectors ────────────────────────────────────────────────────

/**
 * Detect homework / assessment context.
 */
function detectHomework(message, messageLower, observation) {
  const hasKeyword = HOMEWORK_KEYWORDS.test(messageLower);
  const hasContextPhrase = HOMEWORK_CONTEXT_PHRASES.test(messageLower);

  if (!hasKeyword) return null;

  // Both keyword + context phrase = high confidence
  // Keyword alone = moderate confidence
  const confidence = hasContextPhrase ? 0.92 : 0.7;

  return {
    type: TRANSITION_TYPES.HOMEWORK_DETECTED,
    confidence,
    connectionToPlan: 'The student has homework that may align with skills in their learning plan. Help with the homework while reinforcing the plan\'s target concepts.',
    suggestedDirectives: [
      'Acknowledge the homework and offer to work through it together.',
      'Connect homework problems to skills the student is currently developing.',
      'Use the worksheet guard approach: one problem at a time, student does the thinking.',
      'After helping, note which plan skills were practiced through the homework.',
    ],
  };
}

/**
 * Detect when a student's question overlaps with their course content.
 */
function detectCourseTopicOverlap(message, messageLower, observation, context) {
  const courseSkills = context.courseSession?.skills || context.courseSession?.modules?.flatMap(m =>
    (m.skills || []).map(s => typeof s === 'string' ? { skillId: s } : s)
  ) || [];

  if (courseSkills.length === 0) return null;

  const matchedSkillId = findCourseTopicOverlap(messageLower, courseSkills);
  if (!matchedSkillId) return null;

  // Don't fire if the student is already working on this skill
  const currentSkillId = context.tutorPlan?.currentTarget?.skillId || context.activeSkill?.skillId;
  if (matchedSkillId === currentSkillId) return null;

  return {
    type: TRANSITION_TYPES.COURSE_TOPIC_OVERLAP,
    confidence: 0.78,
    matchedSkillId,
    connectionToPlan: `The student is asking about "${matchedSkillId}" which is part of their course. This is a natural opportunity to connect their curiosity to their learning path.`,
    suggestedDirectives: [
      `Acknowledge the student\'s question and connect it to their course progress.`,
      `If the skill is upcoming, preview it: "Great question — we\'ll actually cover this soon!"`,
      `If the skill is already completed, use it as a confidence boost: "You already know this from earlier!"`,
      `If the skill is the current target, seamlessly fold the question into the lesson.`,
    ],
  };
}

/**
 * Detect an exploratory tangent — student is curious about something
 * unrelated to the current lesson.
 */
function detectExploratoryTangent(message, messageLower, observation, context) {
  const isQuestion = observation.messageType === MESSAGE_TYPES.QUESTION ||
                     observation.messageType === MESSAGE_TYPES.GENERAL_MATH;

  if (!isQuestion) return null;

  const hasExplorationSignal = EXPLORATION_KEYWORDS.test(messageLower);
  const isOffTask = observation.messageType === MESSAGE_TYPES.OFF_TASK;

  if (!hasExplorationSignal && !isOffTask) return null;

  // Don't flag as tangent if it overlaps with course skills (that's COURSE_TOPIC_OVERLAP)
  const courseSkills = context.courseSession?.skills || context.courseSession?.modules?.flatMap(m =>
    (m.skills || []).map(s => typeof s === 'string' ? { skillId: s } : s)
  ) || [];
  if (findCourseTopicOverlap(messageLower, courseSkills)) return null;

  const confidence = hasExplorationSignal ? 0.72 : 0.55;

  return {
    type: TRANSITION_TYPES.EXPLORATORY_TANGENT,
    confidence,
    connectionToPlan: 'The student is exploring a tangent. Honor their curiosity briefly, then guide them back to the current skill target.',
    suggestedDirectives: [
      'Briefly engage with the student\'s question — curiosity is valuable.',
      'Keep the tangent response concise (2-3 exchanges max).',
      'Look for a natural bridge back: "That\'s a great question! It actually connects to what we\'re working on because..."',
      'If no bridge exists, gently redirect: "Love the curiosity! Let\'s bookmark that and get back to [current topic]."',
    ],
  };
}

/**
 * Detect frustration that warrants a pivot to a different approach or skill.
 */
function detectFrustrationPivot(message, messageLower, observation, context) {
  const isFrustrated = observation.messageType === MESSAGE_TYPES.FRUSTRATION ||
                       observation.messageType === MESSAGE_TYPES.GIVE_UP;

  const hasFrustrationSignals = observation.contextSignals?.some(
    s => s.type === 'frustration' && s.strength >= 0.7
  );

  if (!isFrustrated && !hasFrustrationSignals) return null;

  // Check streaks — escalating frustration is more urgent
  const streaks = observation.streaks || {};
  const hasStreak = (streaks.idkCount >= 2) || (streaks.giveUpCount >= 1) || (streaks.recentWrongCount >= 3);

  const confidence = hasStreak ? 0.9 : (isFrustrated ? 0.75 : 0.6);

  // Determine current instructional mode so we can suggest a shift
  const currentMode = context.tutorPlan?.currentTarget?.instructionalMode || INSTRUCTIONAL_MODES.GUIDE;

  return {
    type: TRANSITION_TYPES.FRUSTRATION_PIVOT,
    confidence,
    hasStreak,
    currentMode,
    connectionToPlan: 'The student is frustrated with the current approach. Pivot to reduce cognitive load — try a different representation, easier entry point, or a prerequisite warm-up — without abandoning the target skill.',
    suggestedDirectives: [
      'Validate the student\'s feelings: "This IS a tough one — you\'re not alone."',
      currentMode === INSTRUCTIONAL_MODES.GUIDE
        ? 'Shift from guiding to direct instruction (I-Do): model a worked example step by step.'
        : 'Reduce complexity: break the problem into smaller sub-steps.',
      hasStreak
        ? 'Consider stepping back to a prerequisite skill for a quick confidence boost before returning.'
        : 'Try a different representation (visual, real-world analogy, simpler numbers).',
      'Offer a choice: "Want me to show you one, or try a slightly easier version first?"',
    ],
  };
}

/**
 * Detect mastery signals — student is answering quickly and correctly,
 * indicating they may be ready to advance.
 */
function detectMasterySignal(message, messageLower, observation, context) {
  if (observation.messageType !== MESSAGE_TYPES.ANSWER_ATTEMPT) return null;

  const streaks = observation.streaks || {};

  // We need evidence of consistent success, not just one correct answer.
  // Look at context signals for confidence + low wrong count.
  const isConfident = observation.contextSignals?.some(
    s => s.type === 'confidence' && s.strength >= 0.7
  );

  // Check if recent wrong count is very low (strong performance streak)
  const recentWrongCount = streaks.recentWrongCount || 0;
  const noHelpNeeded = streaks.idkCount === 0 && streaks.giveUpCount === 0;

  if (recentWrongCount > 0 || !noHelpNeeded) return null;

  // Also check the instruction phase — mastery signals are most meaningful
  // during practice phases (we-do, you-do)
  const currentPhase = context.tutorPlan?.currentTarget?.instructionPhase;
  const isInPractice = currentPhase && ['we-do', 'you-do', 'mastery'].includes(currentPhase);

  if (!isInPractice && !isConfident) return null;

  const confidence = (isInPractice && isConfident) ? 0.88 :
                     isInPractice ? 0.75 :
                     0.62;

  return {
    type: TRANSITION_TYPES.MASTERY_SIGNAL,
    confidence,
    connectionToPlan: 'The student is demonstrating strong mastery of the current skill. Consider advancing to the next skill or increasing problem complexity to maintain engagement.',
    suggestedDirectives: [
      'Acknowledge the student\'s strong performance: "You\'re crushing this!"',
      'Increase complexity: try a harder variant, word problem, or transfer context.',
      'If the student has shown mastery across multiple representations, signal readiness to advance.',
      'Avoid over-drilling — boredom erodes motivation. Move forward when they\'re ready.',
    ],
  };
}

/**
 * Detect when a prerequisite gap surfaces — the student asks about or
 * struggles with a foundational concept while practicing a higher skill.
 */
function detectPrerequisiteSurface(message, messageLower, observation, context) {
  const hasGapPhrase = PREREQUISITE_GAP_PHRASES.test(messageLower);

  // Also consider: student asking for help + their question is about a concept
  // below the level of the current skill
  const isHelpOrQuestion = observation.messageType === MESSAGE_TYPES.HELP_REQUEST ||
                           observation.messageType === MESSAGE_TYPES.QUESTION ||
                           observation.messageType === MESSAGE_TYPES.IDK;

  if (!hasGapPhrase && !isHelpOrQuestion) return null;
  if (!hasGapPhrase && isHelpOrQuestion) {
    // Only trigger on help/question if there's also a frustration/wrong streak
    const streaks = observation.streaks || {};
    if (streaks.recentWrongCount < 2 && streaks.idkCount < 2) return null;
  }

  const confidence = hasGapPhrase ? 0.82 : 0.65;

  return {
    type: TRANSITION_TYPES.PREREQUISITE_SURFACE,
    confidence,
    connectionToPlan: 'The student appears to have a gap in a prerequisite skill. Address the gap with a brief targeted review before continuing the current lesson.',
    suggestedDirectives: [
      'Don\'t make the student feel bad about the gap: "Good question — let\'s make sure we\'re solid on this first."',
      'Provide a brief, focused mini-lesson on the prerequisite concept (2-3 minutes).',
      'Use a concrete example to rebuild the prerequisite understanding.',
      'Bridge back to the original skill: "Now that we\'ve got that, let\'s go back to [current topic]..."',
    ],
  };
}

/**
 * Detect when a student is returning from a tangent to the main lesson.
 */
function detectReturnToPlan(message, messageLower, observation) {
  const hasReturnSignal = RETURN_KEYWORDS.test(messageLower);

  if (!hasReturnSignal) return null;

  // Affirmatives like "ok" can match return keywords, so require more than
  // a bare affirmative — the message needs some navigation intent.
  if (observation.messageType === MESSAGE_TYPES.AFFIRMATIVE && message.trim().split(/\s+/).length <= 2) {
    return null;
  }

  return {
    type: TRANSITION_TYPES.RETURN_TO_PLAN,
    confidence: 0.85,
    connectionToPlan: 'The student is ready to return to the lesson plan. Resume where they left off with a brief recap.',
    suggestedDirectives: [
      'Welcome them back: "Great, let\'s pick up where we left off!"',
      'Give a 1-sentence recap of where they were before the tangent.',
      'Resume at the same instructional phase — don\'t restart the lesson.',
      'If the tangent was productive, briefly connect it: "That thing you asked about actually relates to what we\'re doing now..."',
    ],
  };
}

// ─── Main detection function ─────────────────────────────────────────────────

/**
 * Detect whether a mode transition is warranted based on the student's
 * message, the observe-stage observation, and the current tutoring context.
 *
 * @param {string} message - The student's raw message
 * @param {Object} observation - Output from the observe stage
 * @param {Object} context
 * @param {Object} context.tutorPlan - { currentTarget: { skillId, instructionalMode, instructionPhase } }
 * @param {Object} context.activeSkill - { skillId, displayName, ... }
 * @param {Object} context.courseSession - Course session document (skills, modules, etc.)
 * @returns {Object} Transition recommendation
 */
function detectModeTransition(message, observation, context = {}) {
  if (!message || typeof message !== 'string') {
    return noTransition();
  }

  const messageLower = message.toLowerCase().trim();
  const currentTarget = context.tutorPlan?.currentTarget || {};

  // Run all detectors. Order matters — higher-priority transitions first.
  // We pick the highest-confidence match, but some transitions take priority
  // regardless of confidence (e.g. RETURN_TO_PLAN always wins if detected).
  const candidates = [
    detectReturnToPlan(message, messageLower, observation),
    detectHomework(message, messageLower, observation),
    detectFrustrationPivot(message, messageLower, observation, context),
    detectPrerequisiteSurface(message, messageLower, observation, context),
    detectMasterySignal(message, messageLower, observation, context),
    detectCourseTopicOverlap(message, messageLower, observation, context),
    detectExploratoryTangent(message, messageLower, observation, context),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return noTransition();
  }

  // RETURN_TO_PLAN always wins — it's an explicit student intent
  const returnCandidate = candidates.find(c => c.type === TRANSITION_TYPES.RETURN_TO_PLAN);
  if (returnCandidate) {
    return buildTransition(returnCandidate, currentTarget);
  }

  // Otherwise pick the highest-confidence candidate
  candidates.sort((a, b) => b.confidence - a.confidence);
  const winner = candidates[0];

  // Apply a minimum confidence threshold to avoid noisy transitions
  if (winner.confidence < 0.55) {
    return noTransition();
  }

  return buildTransition(winner, currentTarget);
}

// ─── Transition builders ─────────────────────────────────────────────────────

/**
 * Build the full transition result from a detection candidate.
 */
function buildTransition(candidate, currentTarget) {
  const fromMode = currentTarget.instructionalMode || null;
  const toMode = resolveTargetMode(candidate.type, fromMode);

  // Should we preserve the current skill target or switch?
  const preserveTarget = shouldPreserveTarget(candidate.type);

  // If the detection identified a new skill, include it
  const newTargetSkillId = candidate.matchedSkillId || null;

  return {
    shouldTransition: true,
    transitionType: candidate.type,
    fromMode,
    toMode,
    reason: candidate.connectionToPlan,
    preserveTarget,
    newTargetSkillId,
    confidence: candidate.confidence,
    connectionToPlan: candidate.connectionToPlan,
    suggestedDirectives: candidate.suggestedDirectives,
    _debug: {
      hasStreak: candidate.hasStreak || false,
      currentMode: candidate.currentMode || null,
    },
  };
}

/**
 * Return a "no transition" result.
 */
function noTransition() {
  return {
    shouldTransition: false,
    transitionType: null,
    fromMode: null,
    toMode: null,
    reason: null,
    preserveTarget: true,
    newTargetSkillId: null,
    confidence: 0,
    connectionToPlan: null,
    suggestedDirectives: [],
  };
}

/**
 * Determine the instructional mode to transition TO based on the
 * transition type and the current mode.
 */
function resolveTargetMode(transitionType, currentMode) {
  switch (transitionType) {
    case TRANSITION_TYPES.HOMEWORK_DETECTED:
      // Homework help is guided — we walk through together
      return INSTRUCTIONAL_MODES.GUIDE;

    case TRANSITION_TYPES.COURSE_TOPIC_OVERLAP:
      // Connect to course content — leverage what they know
      return INSTRUCTIONAL_MODES.LEVERAGE;

    case TRANSITION_TYPES.EXPLORATORY_TANGENT:
      // Brief exploration, then return — stay in current mode
      return currentMode || INSTRUCTIONAL_MODES.GUIDE;

    case TRANSITION_TYPES.FRUSTRATION_PIVOT:
      // Step back to direct instruction to reduce cognitive load
      return INSTRUCTIONAL_MODES.INSTRUCT;

    case TRANSITION_TYPES.MASTERY_SIGNAL:
      // Student is strong — strengthen or leverage
      return INSTRUCTIONAL_MODES.STRENGTHEN;

    case TRANSITION_TYPES.PREREQUISITE_SURFACE:
      // Need to instruct on the prerequisite
      return INSTRUCTIONAL_MODES.INSTRUCT;

    case TRANSITION_TYPES.RETURN_TO_PLAN:
      // Resume previous mode
      return currentMode || INSTRUCTIONAL_MODES.GUIDE;

    default:
      return currentMode || INSTRUCTIONAL_MODES.GUIDE;
  }
}

/**
 * Determine whether the current skill target should be preserved
 * (true) or replaced (false) during this transition.
 */
function shouldPreserveTarget(transitionType) {
  switch (transitionType) {
    case TRANSITION_TYPES.HOMEWORK_DETECTED:
      // Homework may be on a different skill, but we want to reconnect
      return false;

    case TRANSITION_TYPES.COURSE_TOPIC_OVERLAP:
      // Shift focus to the matched course skill
      return false;

    case TRANSITION_TYPES.EXPLORATORY_TANGENT:
      // Keep the target — we'll come back
      return true;

    case TRANSITION_TYPES.FRUSTRATION_PIVOT:
      // Keep the target — we're changing approach, not topic
      return true;

    case TRANSITION_TYPES.MASTERY_SIGNAL:
      // Ready to advance — the target may change
      return false;

    case TRANSITION_TYPES.PREREQUISITE_SURFACE:
      // Temporarily address the gap, then return — keep original target
      return true;

    case TRANSITION_TYPES.RETURN_TO_PLAN:
      // Resuming — keep the target
      return true;

    default:
      return true;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  detectModeTransition,
  TRANSITION_TYPES,
  INSTRUCTIONAL_MODES,

  // Exported for testing
  _internal: {
    detectHomework,
    detectCourseTopicOverlap,
    detectExploratoryTangent,
    detectFrustrationPivot,
    detectMasterySignal,
    detectPrerequisiteSurface,
    detectReturnToPlan,
    buildSkillKeywordIndex,
    findCourseTopicOverlap,
    resolveTargetMode,
    shouldPreserveTarget,
    noTransition,
  },
};
