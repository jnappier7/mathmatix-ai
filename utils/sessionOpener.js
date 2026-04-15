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
        lastProblemState: lastConversation?.lastProblemState || null, // from conversation doc
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
      const { unfinished, lastTopic, lastProblemState } = strategy.data;
      const directives = [
        `The student left off mid-session last time. You remember where you were — act like it.`,
        `What was unfinished: "${unfinished}"`,
        `Greet them like you'd greet a student who walked back into your room after lunch — casual, warm, and aware. Reference the specific unfinished work so they know you remember. Not a formal recap.`,
        `If they want to do something else, roll with it. No guilt about the unfinished stuff.`,
      ];
      // If there's a saved problem state, tell the AI about it
      if (lastProblemState && lastProblemState.problemText) {
        directives.push(`They were working on a problem last time (${lastProblemState.attemptCount} attempt${lastProblemState.attemptCount !== 1 ? 's' : ''}).`);
        if (lastProblemState.misconception) {
          directives.push(`Their sticking point was: "${lastProblemState.misconception}". If they resume, you've had time to think of a better way to explain it — use it.`);
        }
      }
      return {
        greeting: null, // Let the AI generate this — just give it the directive
        suggestedTopic: lastTopic,
        suggestedMode: tutorPlan?.currentTarget?.instructionalMode || 'guide',
        directives,
        suggestionChips: [
          { text: 'Yeah, let\'s keep going', message: "Yeah let's keep going where we left off" },
          { text: 'Can we do something else?', message: "Can we do something different today?" },
          { text: 'I have homework', message: 'I have homework I need help with' },
          { text: 'Just wanna practice', message: 'Can I just practice some problems?' },
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
          `Student is working through ${courseName} — they're ${progress}% of the way through.`,
          targetSkill?.skillId
            ? `Today's target: ${targetSkill.displayName || targetSkill.skillId}. ${targetSkill.instructionalMode === 'instruct' ? 'This is new for them.' : 'They\'ve seen this before — build on it.'}`
            : 'They\'re ready for the next thing.',
          targetSkill?.instructionalMode === 'instruct'
            ? `Since this is new, start with something that makes them curious — a surprising fact, a "what if" question, a real-world hook. Don't just announce the topic.`
            : `Reference what they already know. "Remember when we did [X]? This is the next step."`,
          `Keep the greeting short — a quick hello and get into the work. Students come here to learn, not to chat.`,
        ],
        suggestionChips: [
          { text: "Let's go!", message: "I'm ready, let's go!" },
          { text: 'Wait, review first', message: 'Can we review what we did last time first?' },
          { text: 'I have homework', message: 'Actually I have homework to do first' },
          { text: 'Something else today', message: "Can we do something else today?" },
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
          `Before jumping into ${targetSkill?.displayName || 'the new stuff'}, the student needs a stronger foundation in: ${gap.displayName || gap.skillId}.`,
          `Frame this positively — not as a gap or deficiency, but as making sure the foundation is strong before building on it. Connect it to where they're headed.`,
          `If they say they already know it, great — quiz them. If they nail it, skip ahead immediately. Don't waste their time proving what they know.`,
          `Connect the prerequisite to where you're headed so it doesn't feel random.`,
        ],
        suggestionChips: [
          { text: 'OK sure', message: "OK sounds good, let's do it!" },
          { text: 'I already know this', message: 'I think I already know this, can you quiz me?' },
          { text: 'Quick review is fine', message: 'Just a quick review and then the new stuff?' },
          { text: 'Can we skip ahead?', message: "Can we just go to the new topic?" },
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
          `Last session was a tough one.${lastTopic ? ` They were working on ${lastTopic}.` : ''}`,
          `Acknowledge it briefly and honestly — don't pretend it didn't happen, but don't dwell on it either.`,
          `Then pivot with genuine energy — the student needs to feel like YOU prepared, like you went home and thought about how to help them. Because that's what a real tutor does.`,
          `If they'd rather do something else entirely, follow their lead without any pushback. They need to feel in control after feeling stuck.`,
        ],
        suggestionChips: [
          { text: 'OK try a new way', message: "OK yeah, try explaining it differently" },
          { text: 'Start over on this', message: "Can we start from the beginning?" },
          { text: 'Something else please', message: "Can we work on something different today?" },
          { text: 'I practiced — test me', message: "I actually practiced on my own, can you test me?" },
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
          `The student had a breakthrough last session!${lastTopic ? ` They were working on ${lastTopic}.` : ''}`,
          `Reference it naturally — "You were really getting it last time" or "You had a great session yesterday." Don't over-celebrate or make it formal. Just let them know you noticed.`,
          `They're riding a confidence wave — use it. Push a little harder today. Give them problems that make them stretch. A student who just had a breakthrough WANTS to be challenged.`,
          `If they want to try something new instead, that's fine too — the confidence transfers.`,
        ].filter(Boolean),
        suggestionChips: [
          { text: 'Yeah, keep going!', message: "Yeah let's keep going!" },
          { text: 'Give me a hard one', message: 'Give me something harder!' },
          { text: 'Try something new', message: "I wanna try something new" },
          { text: 'Quiz me', message: 'Quiz me on it!' },
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
          `It's been a few days since the student worked on ${skillName} — time for a quick check-in.`,
          `Frame it casually, like a warm-up — not a test, not a review, just a quick check-in.`,
          `If they nail it, move on immediately. Don't belabor the review.`,
          `If they've forgotten some of it, normalize it — forgetting is part of how learning works. Then help them rebuild it quickly.`,
        ],
        suggestionChips: [
          { text: 'Sure, warm me up', message: "Sure, let's do a quick warm-up!" },
          { text: 'I remember, quiz me', message: 'I remember this — just quiz me!' },
          { text: 'New stuff instead', message: "Can we do new stuff instead?" },
          { text: 'I have homework', message: 'I have homework to do first' },
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
          `The student recently hit a milestone: ${breakthroughs.slice(0, 2).join(', ')}`,
          `Mention it naturally — a quick, genuine nod, not a ceremony. One sentence, then move on.`,
          `Don't make it the whole conversation. Acknowledge it in one sentence and transition to today's work.`,
        ],
        suggestionChips: [
          { text: "What's next?", message: "What should I work on today?" },
          { text: 'More practice', message: 'I want to keep practicing' },
          { text: 'Teach me something new', message: "Teach me something new!" },
          { text: 'I have homework', message: 'I need help with my homework' },
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
          `No specific context from last time — let the student set the direction.`,
          `Greet them like a tutor who's genuinely glad to see them. Keep it brief and real. Ask what they want to work on.`,
          targetSkill?.skillId
            ? `If they don't have a preference, you can suggest ${targetSkill.displayName || targetSkill.skillId} from their learning plan — casually, as an option.`
            : '',
          `This is the start of a conversation. Be warm, be brief, let them talk.`,
        ].filter(Boolean),
        suggestionChips: [
          { text: 'Help with homework', message: 'I need help with my homework' },
          { text: 'Practice problems', message: 'Can I practice some problems?' },
          { text: 'Teach me something new', message: 'Teach me something new!' },
          { text: 'Continue my course', message: "Let's keep going with my course" },
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
      `The student stepped away and just came back. Welcome them back naturally. Keep it light.`,
      lastTopic ? `You were working on ${lastTopic}. Mention it casually and ask if they want to pick back up. Don't lecture them about where they were.` : '',
      `If they seem fuzzy on what you were doing, give a one-sentence recap and jump back in. Don't re-teach — just orient.`,
    ].filter(Boolean),
    suggestionChips: [
      { text: 'Yeah, keep going', message: "Yeah let's keep going!" },
      { text: 'Where were we?', message: 'Wait, where did we leave off?' },
      { text: 'Something else', message: "Actually can we do something else?" },
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
