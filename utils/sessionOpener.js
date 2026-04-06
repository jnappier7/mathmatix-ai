/**
 * INTELLIGENT SESSION OPENER — Context-aware session greetings.
 *
 * A real tutor doesn't say "Hi! What do you want to work on?" every time.
 * They remember what happened last session, they know the plan, and they
 * greet the student with awareness and intention.
 *
 * The pipeline decides the opening strategy. The AI just speaks it.
 *
 * @module utils/sessionOpener
 */

// ── Opening strategies ──
const STRATEGIES = {
  CONTINUITY: 'continuity',                // Pick up where we left off
  COURSE_NEXT: 'course_next',              // Next step in the course
  PREREQUISITE_FIRST: 'prerequisite_first', // Shore up a gap
  REVIEW_DUE: 'review_due',               // Spaced repetition review
  BREAKTHROUGH_FOLLOW_UP: 'breakthrough',   // Build on last breakthrough
  STRUGGLE_PIVOT: 'struggle_pivot',         // Different approach after struggle
  FRESH_START: 'fresh_start',              // No context — let student lead
  MILESTONE: 'milestone',                  // Celebrate recent achievement
  ASSESSMENT_PREP: 'assessment_prep',      // Upcoming assessment
};

/**
 * Generate a context-aware session opener.
 *
 * @param {Object} context
 * @param {Object} context.tutorPlan - The TutorPlan document
 * @param {Object} context.user - User document
 * @param {Object} [context.courseSession] - Active course session
 * @param {Object} [context.tutorProfile] - { name, personality }
 * @param {Object} [context.lastConversation] - Summary of last conversation
 * @returns {Object} { strategy, greeting, suggestedTopic, suggestedMode, directives[], suggestionChips[] }
 */
function generateSessionOpener(context) {
  const { tutorPlan, user, courseSession, tutorProfile, lastConversation } = context;
  const tutorName = tutorProfile?.name || 'MathMatix Tutor';
  const firstName = user?.firstName || 'there';

  // ── Determine the best opening strategy ──
  const strategy = selectStrategy(tutorPlan, courseSession, lastConversation);

  // ── Build the opener based on strategy ──
  const result = buildOpener(strategy, {
    tutorPlan,
    user,
    courseSession,
    tutorName,
    firstName,
    lastConversation,
  });

  return {
    strategy: strategy.type,
    ...result,
  };
}

/**
 * Select the best opening strategy based on available context.
 * Returns the highest-priority applicable strategy.
 */
function selectStrategy(tutorPlan, courseSession, lastConversation) {
  const strategies = [];

  // ── Continuity: unfinished business from last session ──
  if (tutorPlan?.lastSession?.unfinishedBusiness) {
    strategies.push({
      type: STRATEGIES.CONTINUITY,
      priority: 9,
      data: {
        unfinished: tutorPlan.lastSession.unfinishedBusiness,
        lastTopic: tutorPlan.lastSession.topic,
        lastSkill: tutorPlan.lastSession.skillId,
      },
    });
  }

  // ── Struggle pivot: last session was rough ──
  if (tutorPlan?.lastSession?.outcome === 'struggled' || tutorPlan?.lastSession?.mood === 'falling') {
    strategies.push({
      type: STRATEGIES.STRUGGLE_PIVOT,
      priority: 8,
      data: {
        lastTopic: tutorPlan.lastSession.topic,
        lastSkill: tutorPlan.lastSession.skillId,
      },
    });
  }

  // ── Breakthrough follow-up ──
  if (tutorPlan?.lastSession?.outcome === 'breakthrough') {
    strategies.push({
      type: STRATEGIES.BREAKTHROUGH_FOLLOW_UP,
      priority: 8,
      data: {
        lastTopic: tutorPlan.lastSession.topic,
        lastSkill: tutorPlan.lastSession.skillId,
      },
    });
  }

  // ── Prerequisite gap needs work ──
  const criticalGaps = (tutorPlan?.skillFocus || [])
    .flatMap(sf => (sf.prerequisiteGaps || []).filter(g => g.status === 'needs-work'));
  if (criticalGaps.length > 0) {
    strategies.push({
      type: STRATEGIES.PREREQUISITE_FIRST,
      priority: 7,
      data: { gap: criticalGaps[0] },
    });
  }

  // ── Course next step ──
  if (courseSession && courseSession.status === 'active') {
    strategies.push({
      type: STRATEGIES.COURSE_NEXT,
      priority: 6,
      data: {
        courseName: courseSession.courseName,
        moduleId: courseSession.currentModuleId,
        progress: courseSession.overallProgress,
      },
    });
  }

  // ── Review due (spaced repetition) ──
  const reviewDue = findReviewDueSkills(tutorPlan);
  if (reviewDue.length > 0) {
    strategies.push({
      type: STRATEGIES.REVIEW_DUE,
      priority: 5,
      data: { skills: reviewDue },
    });
  }

  // ── Milestone ──
  if (tutorPlan?.studentSignals?.recentBreakthroughs?.length > 0) {
    strategies.push({
      type: STRATEGIES.MILESTONE,
      priority: 4,
      data: { breakthroughs: tutorPlan.studentSignals.recentBreakthroughs },
    });
  }

  // ── Fresh start (always available as fallback) ──
  strategies.push({
    type: STRATEGIES.FRESH_START,
    priority: 1,
    data: {},
  });

  // Sort by priority and return the best
  strategies.sort((a, b) => b.priority - a.priority);
  return strategies[0];
}

/**
 * Build the opener content for a given strategy.
 */
function buildOpener(strategy, ctx) {
  const { tutorPlan, firstName, courseSession } = ctx;

  switch (strategy.type) {
    case STRATEGIES.CONTINUITY: {
      const { unfinished, lastTopic } = strategy.data;
      return {
        greeting: null, // Let the AI generate this — just give it the directive
        suggestedTopic: lastTopic,
        suggestedMode: tutorPlan?.currentTarget?.instructionalMode || 'guide',
        directives: [
          `SESSION OPENER: CONTINUITY. The student left off mid-session last time.`,
          `Unfinished business: "${unfinished}"`,
          `Greet the student warmly and acknowledge where they left off.`,
          `Ask if they want to pick up where they stopped, or work on something else.`,
          `Be specific about what was left undone — the student should know you remember.`,
        ],
        suggestionChips: [
          { text: 'Pick up where we left off', message: "Let's continue where we stopped!" },
          { text: 'Something else today', message: "I'd like to work on something different today" },
          { text: 'Homework help', message: 'I need help with my homework' },
          { text: 'Just practice', message: 'Can we just practice some problems?' },
        ],
      };
    }

    case STRATEGIES.COURSE_NEXT: {
      const { courseName, progress } = strategy.data;
      const targetSkill = tutorPlan?.currentTarget;
      return {
        greeting: null,
        suggestedTopic: courseName,
        suggestedMode: targetSkill?.instructionalMode || 'instruct',
        directives: [
          `SESSION OPENER: COURSE PROGRESSION. Student is enrolled in ${courseName} (${progress}% complete).`,
          targetSkill?.skillId
            ? `Current target: ${targetSkill.displayName || targetSkill.skillId} (mode: ${targetSkill.instructionalMode})`
            : 'Ready for the next lesson.',
          `Greet the student and set up today's work.`,
          targetSkill?.instructionalMode === 'instruct'
            ? `This is a NEW skill for the student. Start with an engaging hook, then begin the instructional sequence.`
            : `Build on what they already know. Reference their previous work.`,
          `Keep the opener natural and brief — get into the work quickly.`,
        ],
        suggestionChips: [
          { text: "Let's go!", message: "I'm ready to learn!" },
          { text: 'Review first', message: 'Can we review what we learned last time?' },
          { text: 'Homework first', message: 'I have homework to do first' },
          { text: 'Something else', message: "I'd like to work on something else today" },
        ],
      };
    }

    case STRATEGIES.PREREQUISITE_FIRST: {
      const { gap } = strategy.data;
      const targetSkill = tutorPlan?.currentTarget;
      return {
        greeting: null,
        suggestedTopic: gap.displayName || gap.skillId,
        suggestedMode: 'instruct',
        directives: [
          `SESSION OPENER: PREREQUISITE REMEDIATION.`,
          `Before the student can tackle ${targetSkill?.displayName || 'the target skill'}, they need to strengthen: ${gap.displayName || gap.skillId}.`,
          `Frame this positively: "Before we get to the new stuff, I want to make sure your foundation is solid."`,
          `Do NOT say "you have a gap" or "you don't know this." Frame as building a bridge.`,
          `Keep the prerequisite work focused and connect it to where you're headed.`,
        ],
        suggestionChips: [
          { text: 'Sounds good', message: "Sounds good, let's do it!" },
          { text: 'I know this already', message: 'I actually think I know this — can you quiz me?' },
          { text: 'Just a quick review', message: 'Can we do a quick review and move on?' },
          { text: 'Skip to new stuff', message: "I'd rather jump into the new topic" },
        ],
      };
    }

    case STRATEGIES.STRUGGLE_PIVOT: {
      const { lastTopic, lastSkill } = strategy.data;
      return {
        greeting: null,
        suggestedTopic: lastTopic,
        suggestedMode: 'instruct', // Re-teach with a different approach
        directives: [
          `SESSION OPENER: STRUGGLE PIVOT. Last session was difficult.`,
          lastTopic ? `Last topic: ${lastTopic}` : '',
          `Acknowledge that last time was tough without dwelling on it.`,
          `Offer a fresh approach: "I've been thinking about a different way to explain this."`,
          `The student should feel like TODAY will be different — not a repeat of yesterday's frustration.`,
          `If the student wants to try something else entirely, follow their lead.`,
        ].filter(Boolean),
        suggestionChips: [
          { text: 'Try a different approach', message: "Let's try it a different way!" },
          { text: 'Start fresh', message: "Can we start from the beginning on this?" },
          { text: 'Something else', message: "I'd rather work on something different today" },
          { text: 'I practiced on my own', message: "I actually practiced this on my own and I think I get it now" },
        ],
      };
    }

    case STRATEGIES.BREAKTHROUGH_FOLLOW_UP: {
      const { lastTopic } = strategy.data;
      return {
        greeting: null,
        suggestedTopic: lastTopic,
        suggestedMode: 'strengthen',
        directives: [
          `SESSION OPENER: BREAKTHROUGH FOLLOW-UP. Student had a breakthrough last session!`,
          lastTopic ? `Topic: ${lastTopic}` : '',
          `Acknowledge the breakthrough naturally: "You were on fire last time."`,
          `Build momentum: push them a little harder today.`,
          `They're feeling good — capitalize on that confidence.`,
        ].filter(Boolean),
        suggestionChips: [
          { text: 'Keep going!', message: "I'm ready to keep building on what we learned!" },
          { text: 'Harder problems', message: 'Give me something challenging!' },
          { text: 'New topic', message: "I'm ready for something new" },
          { text: 'Test me', message: 'Quiz me to see if I really remember it' },
        ],
      };
    }

    case STRATEGIES.REVIEW_DUE: {
      const { skills } = strategy.data;
      const skillName = skills[0]?.displayName || skills[0]?.skillId || 'a skill';
      return {
        greeting: null,
        suggestedTopic: skillName,
        suggestedMode: 'guide',
        directives: [
          `SESSION OPENER: REVIEW DUE. Spaced repetition says it's time to review: ${skillName}.`,
          `Frame as a quick warm-up, not a test: "Let's start with a quick warm-up on something you've learned."`,
          `If the student remembers it well, move on quickly.`,
          `If they've forgotten, that's expected — use it as a teaching moment about how memory works.`,
        ],
        suggestionChips: [
          { text: 'Quick review', message: "Sure, let's do a quick review!" },
          { text: 'I remember this', message: 'I remember this — just quiz me!' },
          { text: 'Skip to new stuff', message: "I'd rather work on something new" },
          { text: 'Homework first', message: 'I have homework to do first' },
        ],
      };
    }

    case STRATEGIES.MILESTONE: {
      const { breakthroughs } = strategy.data;
      return {
        greeting: null,
        suggestedTopic: null,
        suggestedMode: null,
        directives: [
          `SESSION OPENER: MILESTONE. Student recently achieved: ${breakthroughs.slice(0, 2).join(', ')}`,
          `Briefly acknowledge the achievement. Don't over-celebrate — just note it naturally.`,
          `Then transition to today's work.`,
        ],
        suggestionChips: [
          { text: "What's next?", message: "What should I work on today?" },
          { text: 'Keep practicing', message: 'I want to keep practicing what I learned' },
          { text: 'Something new', message: "I'm ready for something new!" },
          { text: 'Homework help', message: 'I need help with my homework' },
        ],
      };
    }

    case STRATEGIES.FRESH_START:
    default: {
      const targetSkill = tutorPlan?.currentTarget;
      return {
        greeting: null,
        suggestedTopic: targetSkill?.displayName || null,
        suggestedMode: targetSkill?.instructionalMode || null,
        directives: [
          `SESSION OPENER: FRESH START. No strong contextual signal — let the student lead.`,
          `Greet warmly but briefly. Ask what they'd like to work on.`,
          targetSkill?.skillId
            ? `If they don't have a preference, suggest: "${targetSkill.displayName || targetSkill.skillId}" from their plan.`
            : '',
          `Keep it casual — this is the start of a conversation, not a lecture.`,
        ].filter(Boolean),
        suggestionChips: [
          { text: 'Help with homework', message: 'I need help with my homework' },
          { text: 'Practice problems', message: 'I want to practice math problems' },
          { text: 'Learn something new', message: 'Can you teach me something new?' },
          { text: 'Continue course', message: "Let's continue my course" },
        ],
      };
    }
  }
}

/**
 * Generate a re-entry prompt for when a student returns after a gap (>10 min).
 *
 * @param {Object} context - { tutorPlan, conversation, lastMessageTime }
 * @returns {Object} { directives[], suggestionChips[] }
 */
function generateReentryPrompt(context) {
  const { tutorPlan, conversation } = context;
  const lastTopic = conversation?.topic || tutorPlan?.lastSession?.topic;

  return {
    directives: [
      `RE-ENTRY: Student returned after being away. Welcome them back briefly.`,
      lastTopic ? `You were working on: ${lastTopic}. Ask if they want to continue.` : '',
      `Do NOT repeat the full lesson. Just orient them: "Welcome back! We were working on X."`,
      `If they seem to have forgotten, do a quick recap (1-2 sentences), then continue.`,
    ].filter(Boolean),
    suggestionChips: [
      { text: 'Continue', message: "Let's keep going!" },
      { text: 'Quick recap', message: 'Can you remind me where we left off?' },
      { text: 'Something else', message: "I'd like to switch to something else" },
    ],
  };
}

/**
 * Determine if the student's request should override the tutor's plan.
 *
 * A real tutor has a plan but follows the student's lead when they bring
 * something specific. Homework always wins. Exploration is allowed.
 * But a vague "I dunno" defaults back to the plan.
 *
 * @param {string} studentMessage
 * @param {Object} tutorPlan
 * @returns {Object} { override: boolean, reason: string, returnToPlan: boolean }
 */
function shouldOverrideTopic(studentMessage, tutorPlan) {
  const msg = studentMessage.toLowerCase().trim();

  // Homework always overrides
  if (/homework|assignment|due|quiz|test|exam|worksheet/.test(msg)) {
    return {
      override: true,
      reason: 'Student has homework — help them first, then return to plan',
      returnToPlan: true,
    };
  }

  // Specific math topic override
  if (/can you (teach|show|explain|help)/i.test(msg) || /how do (i|you|we)/i.test(msg)) {
    return {
      override: true,
      reason: 'Student has a specific request — follow their lead',
      returnToPlan: true,
    };
  }

  // Vague or agreeable — stick with the plan
  if (/^(ok|sure|yeah|yes|let'?s go|ready|idk|i don'?t know|whatever|anything)/i.test(msg)) {
    return {
      override: false,
      reason: 'Student is open — follow the plan',
      returnToPlan: false,
    };
  }

  // Default: follow the student but plan to return
  return {
    override: false,
    reason: 'No strong signal — follow the plan',
    returnToPlan: false,
  };
}

/**
 * Find skills that are due for spaced repetition review.
 */
function findReviewDueSkills(tutorPlan) {
  if (!tutorPlan?.skillFocus) return [];

  const now = new Date();
  return tutorPlan.skillFocus
    .filter(sf => sf.status === 'resolved' || sf.familiarity === 'mastered' || sf.familiarity === 'proficient')
    .filter(sf => {
      // Simple heuristic: last worked on > 3 days ago
      if (!sf.lastWorkedOn) return false;
      const daysSince = (now - new Date(sf.lastWorkedOn)) / (1000 * 60 * 60 * 24);
      return daysSince > 3;
    })
    .slice(0, 3)
    .map(sf => ({ skillId: sf.skillId, displayName: sf.displayName }));
}

module.exports = {
  generateSessionOpener,
  generateReentryPrompt,
  shouldOverrideTopic,
  STRATEGIES,
};
