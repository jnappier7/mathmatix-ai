/**
 * SMART SUGGESTIONS — Context-aware suggestion chips for the chat UI
 *
 * Generates situational suggestions based on pipeline state:
 *   - Decision action (what the tutor just did)
 *   - Diagnosis result (correct, incorrect, no_answer)
 *   - Session mood (energy, trajectory, fatigue)
 *   - Mastery progress (pillar scores, active badge)
 *   - Learning profile (anxiety level, confidence, struggles)
 *   - Conversation stats (problems attempted, accuracy)
 *
 * Pure function, no DB, no LLM. Returns an array of 3-4 chip objects.
 *
 * @module pipeline/suggestions
 */

const { ACTIONS } = require('./decide');

// ── Maximum chips per response ──
const MAX_CHIPS = 4;

// ── Suggestion pools keyed by tutoring action ──
const ACTION_SUGGESTIONS = {
  [ACTIONS.CONFIRM_CORRECT]: [
    { text: 'Next problem', message: "I'm ready for the next problem!" },
    { text: 'Harder please', message: 'Can you give me a harder problem?' },
    { text: 'Why does that work?', message: 'Why does that answer work? Can you explain the concept?' },
    { text: 'Different topic', message: 'Can we work on a different topic?' },
  ],
  [ACTIONS.GUIDE_INCORRECT]: [
    { text: 'Walk me through it', message: 'Can you walk me through the solution step by step?' },
    { text: 'Where did I go wrong?', message: 'Where did I go wrong in my thinking?' },
    { text: 'Try again', message: 'Let me try that problem again' },
    { text: 'Easier version', message: 'Can you give me an easier version of that problem?' },
  ],
  [ACTIONS.RETEACH_MISCONCEPTION]: [
    { text: 'Show me why', message: 'Can you show me why my approach was wrong?' },
    { text: 'Different explanation', message: 'Can you explain it a different way?' },
    { text: 'Give me an example', message: 'Can you show me an example that makes it clearer?' },
    { text: 'Try again', message: 'Let me try a similar problem' },
  ],
  [ACTIONS.HINT]: [
    { text: 'Another hint', message: 'Can you give me one more hint?' },
    { text: 'Show the steps', message: 'Can you show me the full steps?' },
    { text: 'I think I see it', message: 'I think I see it now, let me try' },
    { text: 'Skip this one', message: 'Can we skip this and try a different one?' },
  ],
  [ACTIONS.WORKED_EXAMPLE]: [
    { text: 'Got it, my turn', message: "I understand the example! Give me one to try" },
    { text: 'One more example', message: 'Can you show me one more example?' },
    { text: 'Explain that step', message: 'Can you explain that step more?' },
    { text: 'Simpler example', message: 'Can you show me a simpler example first?' },
  ],
  [ACTIONS.PRESENT_PROBLEM]: [
    { text: 'Give me a hint', message: 'Can you give me a hint?' },
    { text: 'Show an example', message: 'Can you show me a similar example first?' },
    { text: 'Explain the concept', message: 'Can you explain the concept before I solve it?' },
    { text: 'Different problem', message: 'Can you give me a different type of problem?' },
  ],
  [ACTIONS.EXIT_RAMP]: [
    { text: 'Keep going', message: "I want to keep going, I'm okay!" },
    { text: 'Take a break', message: "Yeah, let's take a quick break" },
    { text: 'Something easier', message: 'Can we do something a bit easier?' },
    { text: 'Switch topics', message: "Let's work on something else" },
  ],
  [ACTIONS.SCAFFOLD_DOWN]: [
    { text: 'That helps', message: 'That makes more sense, thank you!' },
    { text: 'Still lost', message: "I'm still a bit confused" },
    { text: 'Start from basics', message: 'Can we start from the very basics?' },
    { text: 'Show me visually', message: 'Can you show me this visually?' },
  ],
  [ACTIONS.ACKNOWLEDGE_FRUSTRATION]: [
    { text: "Let's try again", message: "Okay, let's give it another shot" },
    { text: 'Different approach', message: 'Can we try a different approach?' },
    { text: 'Take a break', message: 'I need a short break' },
    { text: 'Something fun', message: 'Can we do something fun instead?' },
  ],
  [ACTIONS.CHECK_UNDERSTANDING]: [
    { text: 'Yes, I get it', message: 'Yes, I understand!' },
    { text: 'Not sure', message: "I'm not completely sure, can you explain more?" },
    { text: 'Show me again', message: 'Can you show me one more time?' },
    { text: 'Test me', message: 'Give me a problem to test if I really get it' },
  ],
  [ACTIONS.REDIRECT_TO_MATH]: [
    { text: 'Help me practice', message: 'Can you help me practice math?' },
    { text: 'Pick up where we left off', message: "Let's go back to what we were working on" },
    { text: 'New topic', message: "I'd like to learn something new" },
    { text: 'Start assessment', message: 'I want to find my starting point' },
  ],
  [ACTIONS.PROBING_QUESTION]: [
    { text: 'I think...', message: "I think the answer is..." },
    { text: 'Hint please', message: 'Can I get a hint for this?' },
    { text: 'Not sure', message: "I'm not sure how to think about this" },
    { text: 'Explain more', message: 'Can you give me a bit more context?' },
  ],
  [ACTIONS.SWITCH_REPRESENTATION]: [
    { text: 'That helps!', message: 'That way of looking at it really helps!' },
    { text: 'Another way?', message: 'Can you show me yet another way to think about it?' },
    { text: 'Let me try now', message: 'I think I get it, let me try a problem' },
    { text: 'Still confused', message: "I'm still not seeing it clearly" },
  ],
  [ACTIONS.REVIEW_PREREQUISITE]: [
    { text: 'Good idea', message: "Good idea, let's review that first" },
    { text: 'I know this', message: "I already know this part, can we skip ahead?" },
    { text: 'Quick review', message: 'Just a quick review please' },
    { text: 'Start from scratch', message: "Let's learn this from scratch" },
  ],
};

// ── Default fallback suggestions ──
const DEFAULT_SUGGESTIONS = [
  { text: 'Help me practice', message: 'I want to practice math problems' },
  { text: 'Explain a concept', message: 'Can you explain a math concept to me?' },
  { text: 'Homework help', message: 'Can you help me with my homework?' },
  { text: 'Start assessment', message: 'I want to find my starting point' },
];

/**
 * Adapt suggestions based on session mood.
 * Swaps or adds chips depending on emotional state.
 */
function applyMoodOverrides(suggestions, mood) {
  if (!mood) return suggestions;

  const result = [...suggestions];

  // Fatigue: always offer a break option
  if (mood.fatigueSignal) {
    const hasBreak = result.some(s => /break/i.test(s.message));
    if (!hasBreak) {
      result[result.length - 1] = {
        text: 'Take a break',
        message: "I'm getting a bit tired, can we take a break?",
      };
    }
  }

  // High energy + rising trajectory: offer challenge
  if (mood.energy === 'high' && mood.trajectory === 'rising') {
    const hasChallenge = result.some(s => /harder|challenge/i.test(s.message));
    if (!hasChallenge && result.length >= 3) {
      result[result.length - 1] = {
        text: 'Challenge me',
        message: "I'm feeling confident! Give me a challenge problem",
      };
    }
  }

  // Flow state: minimize interruptions, keep momentum
  if (mood.inFlow) {
    const hasNext = result.some(s => /next|ready|keep going/i.test(s.message));
    if (!hasNext) {
      result[0] = {
        text: 'Keep going',
        message: "I'm on a roll, keep going!",
      };
    }
  }

  return result;
}

/**
 * Adapt suggestions for high math anxiety.
 * Use gentler language and always provide escape hatches.
 */
function applyAnxietyOverrides(suggestions, profile) {
  if (!profile) return suggestions;

  const anxietyLevel = profile.mathAnxietyLevel || 0;
  if (anxietyLevel < 6) return suggestions; // Only activate for high anxiety (6+/10)

  const result = [...suggestions];

  // Ensure there's always a low-pressure option
  const hasEasyOption = result.some(s =>
    /easier|break|hint|help|skip/i.test(s.message)
  );
  if (!hasEasyOption && result.length >= 3) {
    result[result.length - 1] = {
      text: 'Go easier',
      message: 'Can we slow down a bit?',
    };
  }

  return result;
}

/**
 * Add mastery-aware suggestions when badge progress is relevant.
 */
function applyMasteryOverrides(suggestions, masteryProgress) {
  if (!masteryProgress?.activeBadge) return suggestions;

  const badge = masteryProgress.activeBadge;
  const completed = badge.problemsCompleted || 0;
  const required = badge.requiredProblems || 5;
  const progress = completed / required;

  // Close to badge: add motivation chip
  if (progress >= 0.7 && progress < 1.0) {
    const remaining = required - completed;
    const result = [...suggestions];
    // Replace last chip with badge-progress motivation
    result[result.length - 1] = {
      text: `${remaining} to go!`,
      message: `I'm almost there! Let's keep going for the ${badge.badgeName || 'badge'}!`,
    };
    return result;
  }

  return suggestions;
}

/**
 * Generate smart, situational suggestion chips.
 *
 * @param {Object} params
 * @param {Object} params.decision - Decision from decide stage { action }
 * @param {Object} params.diagnosis - Diagnosis from diagnose stage { type }
 * @param {Object} params.observation - Observation from observe stage { messageType }
 * @param {Object} params.sessionMood - Session mood { trajectory, energy, fatigueSignal, inFlow }
 * @param {Object} params.user - User document (for learning profile, mastery)
 * @param {Object} params.conversationStats - { problemsAttempted, problemsCorrect }
 * @returns {Array<{text: string, message: string}>} 3-4 suggestion chips
 */
function generateSuggestions({
  decision,
  diagnosis,
  observation,
  sessionMood,
  user,
  conversationStats,
}) {
  // 1. Start with action-based suggestions
  const action = decision?.action;
  let suggestions = ACTION_SUGGESTIONS[action]
    ? [...ACTION_SUGGESTIONS[action]]
    : [...DEFAULT_SUGGESTIONS];

  // 2. Apply mood-based overrides
  suggestions = applyMoodOverrides(suggestions, sessionMood);

  // 3. Apply anxiety overrides from learning profile
  suggestions = applyAnxietyOverrides(suggestions, user?.learningProfile);

  // 4. Apply mastery progress overrides
  suggestions = applyMasteryOverrides(suggestions, user?.masteryProgress);

  // 5. Cap at MAX_CHIPS
  return suggestions.slice(0, MAX_CHIPS);
}

module.exports = { generateSuggestions, MAX_CHIPS };
