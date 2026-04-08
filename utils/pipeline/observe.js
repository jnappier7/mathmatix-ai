/**
 * OBSERVE STAGE — Deterministic message classification
 *
 * Classifies the incoming student message into one of several categories
 * so downstream stages can act on structure, not raw text.
 *
 * No AI calls. No DB queries. Pure functions on the message string.
 *
 * @module pipeline/observe
 */

// ── Message categories ──
const MESSAGE_TYPES = {
  ANSWER_ATTEMPT: 'answer_attempt',
  QUESTION: 'question',
  HELP_REQUEST: 'help_request',
  GIVE_UP: 'give_up',
  IDK: 'idk',
  OFF_TASK: 'off_task',
  FRUSTRATION: 'frustration',
  CHECK_MY_WORK: 'check_my_work',
  GREETING: 'greeting',
  AFFIRMATIVE: 'affirmative',
  SKIP_REQUEST: 'skip_request',
  GENERAL_MATH: 'general_math',
  PARROTING: 'parroting',
  EVASIVE_AFFIRMATIVE: 'evasive_affirmative',
};

// ── Context signal categories ──
const CONTEXT_SIGNALS = {
  CONFIDENCE: 'confidence',         // "I think...", "maybe"
  UNCERTAINTY: 'uncertainty',        // "I'm not sure", "idk"
  FRUSTRATION: 'frustration',       // "this is stupid", "I hate math"
  ENGAGEMENT: 'engagement',         // "cool!", "that makes sense"
  METACOGNITION: 'metacognition',   // "oh I see", "wait..."
};

// ── Patterns ──
const PATTERNS = {
  // Answer attempts: just a number, fraction, variable assignment, or short answer phrase
  justNumber: /^(-?\d+\.?\d*)$/,
  fraction: /^(-?\d+\s*\/\s*\d+)$/,
  varAssignment: /^[a-z]\s*=\s*(-?\d+\.?\d*(?:\/\d+)?)/i,
  answerPhrase: /(?:answer\s+is|i\s+got|it'?s|equals?|i\s+think\s+it'?s?|that'?s|so\s+it'?s)\s*(-?\d+\.?\d*(?:\s*\/\s*\d+)?)/i,
  // Algebraic expression answers: 3x^2-3, x+2, -2x+5, 2x^2+3x-1
  algebraicExpr: /^(-?\d*[a-z](?:\^[\d{}]+)?(?:\s*[+\-]\s*\d*[a-z]?(?:\^[\d{}]+)?)*)\s*$/i,
  // "3 times 12 is 36", "36 divided by 2 is 18" — student states a full arithmetic result
  arithmeticStatement: /\d+\.?\d*\s*(?:[+\-*/×÷]|times|plus|minus|divided\s+by|multiplied\s+by)\s*\d+\.?\d*\s+(?:is|=|equals)\s+(-?\d+\.?\d*(?:\s*\/\s*\d+)?)/i,
  mixedNumber: /^(-?\d+)\s+(\d+\s*\/\s*\d+)$/,

  // Answer embedded in explanation — two tiers of patterns.
  // "Conclusive" patterns (highest priority): "the limit is 4", "the answer is 3x^2-3"
  // These indicate the student is stating their final answer.
  // NOTE: algebraic alternation MUST come before numeric, so "5x^4-1" matches
  // before the numeric branch can grab just "5".
  embeddedAnswerConclusive: /(?:(?:the\s+)?(?:limit|answer|result|derivative|solution|value)\s+(?:is|equals?|=|would\s+be|comes?\s+(?:out\s+)?to)\s+|(?:so|which\s+means|meaning|therefore|thus)\s+(?:it'?s?|the\s+\w+\s+is)\s+)(-?\d*[a-z](?:\^[\d{}]+)?(?:\s*[+\-]\s*\d*[a-z]?(?:\^[\d{}]+)?)*|-?\d+\.?\d*(?:\s*\/\s*\d+)?)/gi,

  // "Intermediate" patterns (lower priority): "you get x+2", "gives 3x"
  // These may be intermediate steps, not the final answer.
  // Requires the captured expression to end at a word boundary, comma,
  // period, or end-of-string — prevents capturing partial words like
  // "get it" → "i" or "gives us" → "u".
  embeddedAnswerIntermediate: /(?:(?:you\s+)?(?:get|gives)\s+)(-?\d*[a-z](?:\^[\d{}]+)?(?:\s*[+\-]\s*\d*[a-z]?(?:\^[\d{}]+)?)*|-?\d+\.?\d*(?:\s*\/\s*\d+)?)(?=[\s,.:;!?)}\]]|$)/gi,

  // Reasoning phrases that indicate the student is showing their work
  reasoningIndicators: /\b(because|since|after\s+(?:i\s+)?(?:factor|simplif|cancel|distribut|combin|reduc)|(?:i\s+)?(?:factor|simplif|cancel)(?:ed|ing)?|if\s+(?:you|i)\s+(?:factor|simplif|cancel)|by\s+(?:factoring|simplifying|canceling)|using\s+the\s+(?:power|chain|quotient|product)\s+rule|(?:which|that|so)\s+(?:means|gives|leaves|simplifies?\s+to))\b/i,

  // Help/IDK
  idk: /\b(idk|i\s*don'?t\s*know|no\s*idea|no\s*clue|dunno|i\s*have\s*no\s*idea|beats\s*me)\b/i,
  giveUp: /\b(just\s*tell\s*me|give\s*me\s*the\s*answer|tell\s*me\s*the\s*answer|what'?s\s*the\s*answer|i\s*give\s*up|show\s*me\s*the\s*answer|can\s*you\s*just\s*solve\s*it)\b/i,
  helpRequest: /\b(help|hint|stuck|confused|don'?t\s*(understand|get\s*it)|what\s*do\s*i\s*do|how\s*do\s*i|can\s*you\s*(explain|show|help))\b/i,
  skipRequest: /\b(skip|next\s*one|move\s*on|different\s*problem|new\s*problem|harder\s*(problem|question|one)|another\s*(problem|question|one)|next\s*question|what'?s\s*next|whats\s*next|now\s*what|what\s*now|ready\s*for\s*(the\s*)?next|let'?s\s*(keep|move)\s*(going|on)|what\s*do\s*we\s*do\s*next)\b/i,

  // Check my work
  checkMyWork: /\b(check|verify|grade|review|is\s*this\s*right|is\s*this\s*correct|did\s*i\s*(get|do)\s*(it|this)\s*right|am\s*i\s*right|how'?d\s*i\s*do)\b/i,

  // Questions about math
  question: /^(what|why|how|when|where|can\s*you|could\s*you|is\s*it|does|do|will|would|should|explain|find|solve|calculate|compute|evaluate|determine|simplify|factor|graph|prove|derive|convert|estimate)\b/i,

  // Greetings
  greeting: /^(hi|hey|hello|yo|sup|what'?s\s*up|good\s*(morning|afternoon|evening))\b/i,

  // Affirmative / understanding
  affirmative: /^(yes|yeah|yep|yup|ok|okay|sure|got\s*it|makes\s*sense|i\s*see|i\s*understand|right|correct|mhm|uh\s*huh)\b/i,

  // Frustration signals
  frustration: /\b(hate|stupid|dumb|boring|sucks|this\s*is\s*(hard|impossible|confusing|annoying)|i\s*can'?t|ugh|i'?m\s*done)\b/i,

  // Confidence signals
  confidence: /\b(i\s*think|pretty\s*sure|i\s*believe|definitely|i\s*know)\b/i,
  uncertainty: /\b(maybe|not\s*sure|i\s*guess|possibly|might\s*be|idk)\b/i,

  // Metacognition
  metacognition: /\b(oh\s*i\s*see|wait|ohhh|aha|now\s*i\s*(get|understand)|that\s*makes\s*sense|so\s*basically)\b/i,

  // Off-task (non-math)
  offTask: /\b(play\s*(a\s*game|roblox|fortnite|minecraft)|tell\s*(me\s*)?a\s*(joke|story)|what'?s\s*your\s*(name|favorite)|who\s*(are|made)\s*you|sing|rap|poem)\b/i,
};

/**
 * Extract a student's answer from their message.
 * Returns { value, raw } or null if not an answer attempt.
 */
function extractAnswer(message) {
  const text = message.trim();

  // For short, direct answers (< 100 chars): try all patterns
  if (text.length <= 100) {
    let match;
    if ((match = text.match(PATTERNS.varAssignment))) return { value: match[1], raw: text };
    if ((match = text.match(PATTERNS.justNumber))) return { value: match[1], raw: text };
    if ((match = text.match(PATTERNS.fraction))) return { value: match[1].replace(/\s/g, ''), raw: text };
    if ((match = text.match(PATTERNS.mixedNumber))) return { value: `${match[1]} ${match[2].replace(/\s/g, '')}`, raw: text };
    if ((match = text.match(PATTERNS.algebraicExpr))) return { value: match[1].replace(/\s/g, ''), raw: text };
    if ((match = text.match(PATTERNS.answerPhrase))) return { value: match[1].replace(/\s/g, ''), raw: text };
    if ((match = text.match(PATTERNS.arithmeticStatement))) return { value: match[1].replace(/\s/g, ''), raw: text };
  }

  // For longer messages: try to extract answer embedded in explanation
  // This catches "after I factor and simplify, you get x+2… which means the limit is 4"
  if (text.length > 10) {
    const embedded = extractAnswerFromExplanation(text);
    if (embedded) return embedded;
  }

  return null;
}

/**
 * Extract an answer value from a longer explanatory message.
 * Handles cases like "after I factor and simplify, you get x+2, so the limit is 4"
 *
 * Prefers "conclusive" answer phrases (the limit is, the answer is) over
 * "intermediate" ones (you get, gives). Uses the LAST match in the text,
 * since the final answer typically comes at the end of an explanation.
 *
 * Returns { value, raw, hasExplanation } or null.
 */
function extractAnswerFromExplanation(message) {
  const text = message.trim();
  // Don't try on very long messages — likely not an answer attempt
  if (text.length > 500) return null;

  // Try conclusive patterns first — these are the strongest signals
  // Use the LAST match (student states final answer at the end)
  const conclusiveRegex = new RegExp(PATTERNS.embeddedAnswerConclusive.source, 'gi');
  let lastConclusive = null;
  let match;
  while ((match = conclusiveRegex.exec(text)) !== null) {
    lastConclusive = match;
  }
  if (lastConclusive) {
    return { value: lastConclusive[1].replace(/\s/g, ''), raw: text, hasExplanation: true };
  }

  // Try answer phrase pattern on longer text (relaxed from 100 char limit)
  if ((match = text.match(PATTERNS.answerPhrase))) {
    return { value: match[1].replace(/\s/g, ''), raw: text, hasExplanation: true };
  }

  // Fall back to intermediate patterns (you get, gives)
  const intermediateRegex = new RegExp(PATTERNS.embeddedAnswerIntermediate.source, 'gi');
  let lastIntermediate = null;
  while ((match = intermediateRegex.exec(text)) !== null) {
    lastIntermediate = match;
  }
  if (lastIntermediate) {
    return { value: lastIntermediate[1].replace(/\s/g, ''), raw: text, hasExplanation: true };
  }

  return null;
}

/**
 * Detect if the student's message demonstrates reasoning/understanding.
 * Returns true if the message contains indicators of mathematical reasoning.
 */
function hasReasoningIndicators(message) {
  return PATTERNS.reasoningIndicators.test(message);
}

/**
 * Detect context signals in the message (confidence, frustration, metacognition).
 * Returns an array of signal objects.
 */
function detectContextSignals(message) {
  const signals = [];
  const lower = message.toLowerCase();

  if (PATTERNS.confidence.test(lower)) signals.push({ type: CONTEXT_SIGNALS.CONFIDENCE, strength: 0.7 });
  if (PATTERNS.uncertainty.test(lower)) signals.push({ type: CONTEXT_SIGNALS.UNCERTAINTY, strength: 0.6 });
  if (PATTERNS.frustration.test(lower)) signals.push({ type: CONTEXT_SIGNALS.FRUSTRATION, strength: 0.8 });
  if (PATTERNS.metacognition.test(lower)) signals.push({ type: CONTEXT_SIGNALS.METACOGNITION, strength: 0.9 });

  // Engagement: short positive responses
  if (/^(cool|nice|awesome|sweet|great|thanks|thank\s*you|wow)\b/i.test(lower)) {
    signals.push({ type: CONTEXT_SIGNALS.ENGAGEMENT, strength: 0.6 });
  }

  return signals;
}

/**
 * Detect the problem context type for transfer pillar tracking.
 */
function detectProblemContext(message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  if (/\b(word problem|story|scenario|real.?world|application)\b/.test(lower)) return 'word-problem';
  if (/\b(graph|plot|chart|coordinate|axis|slope)\b/.test(lower)) return 'graphical';
  if (/\b(draw|picture|diagram|model|visual)\b/.test(lower)) return 'visual';
  if (/\d+\s*[+\-*/÷×^=<>]\s*\d+/.test(message)) return 'numeric';
  if (/\b(explain|why|how|what does|prove|show that)\b/.test(lower)) return 'conceptual';
  return 'numeric';
}

/**
 * Check if student is parroting (echoing back) the tutor's recent words.
 * Compares the student's message against recent assistant messages using
 * longest common substring ratio. A student who copies ≥60% of a tutor
 * sentence is parroting.
 *
 * @returns {boolean}
 */
function detectParroting(studentMessage, recentAssistantMessages) {
  if (!recentAssistantMessages || recentAssistantMessages.length === 0) return false;
  if (studentMessage.length < 15) return false; // Too short to be meaningful parroting

  const studentLower = studentMessage.toLowerCase().replace(/[^\w\s]/g, '');
  const studentWords = studentLower.split(/\s+/).filter(w => w.length > 2);
  if (studentWords.length < 4) return false; // Need substance to detect parroting

  // Check against last 3 assistant messages
  for (const msg of recentAssistantMessages.slice(-3)) {
    const tutorText = (msg.content || '').toLowerCase().replace(/[^\w\s]/g, '');
    // Split tutor text into sentences
    const sentences = tutorText.split(/[.!?\n]+/).filter(s => s.trim().length > 10);

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).filter(w => w.length > 2);
      if (sentenceWords.length < 4) continue;

      // Count how many of the student's words appear in this tutor sentence, in order
      let matchCount = 0;
      let sentenceIdx = 0;
      for (const word of studentWords) {
        const found = sentenceWords.indexOf(word, sentenceIdx);
        if (found !== -1) {
          matchCount++;
          sentenceIdx = found + 1;
        }
      }

      const overlapRatio = matchCount / Math.max(studentWords.length, 1);
      if (overlapRatio >= 0.6) return true;
    }
  }
  return false;
}

/**
 * Check if the tutor asked for explanation/understanding and the student
 * gave a bare affirmative without actually explaining.
 *
 * Detects: "Can you explain why?", "Tell me in your own words",
 * "Why does that work?", "What's the reasoning?" followed by "yes"/"I understand".
 *
 * @returns {boolean}
 */
function detectEvasiveAffirmative(studentMessage, recentAssistantMessages) {
  if (!recentAssistantMessages || recentAssistantMessages.length === 0) return false;

  // Only triggers on short affirmative responses
  const lower = studentMessage.toLowerCase().trim();
  if (lower.split(/\s+/).length > 8) return false; // Long response = probably explaining
  if (!PATTERNS.affirmative.test(lower)) return false;

  // Check if the last assistant message asked for explanation
  const lastAssistant = recentAssistantMessages[recentAssistantMessages.length - 1];
  if (!lastAssistant?.content) return false;

  const tutorLower = lastAssistant.content.toLowerCase();
  const askedForExplanation =
    /\b(explain|in\s+your\s+own\s+words|why\s+does|why\s+did|why\s+do|how\s+does|how\s+did|what'?s\s+the\s+reason|what\s+is\s+the\s+reason|can\s+you\s+tell\s+me\s+why|walk\s+me\s+through|describe\s+how|what\s+would\s+happen|prove\s+(?:it|that|this)|show\s+(?:me\s+)?your\s+(?:work|thinking|reasoning)|convince\s+me|teach\s+(?:it|this)\s+(?:back|to\s+me))\b/.test(tutorLower);

  return askedForExplanation;
}

/**
 * Count IDK/give-up streaks in recent messages.
 */
function detectStreaks(recentUserMessages) {
  const idkCount = recentUserMessages.filter(msg => PATTERNS.idk.test(msg.content)).length;
  const giveUpCount = recentUserMessages.filter(msg => PATTERNS.giveUp.test(msg.content)).length;
  return { idkCount, giveUpCount };
}

/**
 * Main observe function.
 * Classifies the message and extracts all deterministic signals.
 *
 * @param {string} message - The student's raw message
 * @param {Object} context - Conversation context
 * @param {Array} context.recentUserMessages - Last 6 user messages
 * @param {Array} context.recentAssistantMessages - Last 6 assistant messages
 * @param {boolean} context.hasRecentUpload - Whether student has recent uploads
 * @returns {Object} Observation result
 */
function observe(message, context = {}) {
  const text = message.trim();
  const lower = text.toLowerCase();

  // Detect context signals
  const contextSignals = detectContextSignals(text);

  // Detect streaks from recent history
  const streaks = detectStreaks(context.recentUserMessages || []);

  // Count recent wrong answers
  const recentWrongCount = (context.recentAssistantMessages || [])
    .filter(msg => msg.problemResult === 'incorrect').length;

  // ── Classify: check high-confidence intent signals FIRST ──
  //
  // Intent detection (explicit keywords like "help", "skip", "how do I")
  // is more reliable than answer extraction (regex on math expressions).
  // We check intent before attempting answer extraction to prevent false
  // positives like:
  //   "I don't get it"                    → was captured as answer "i"
  //   "Can you give me a harder problem?" → was captured as answer "m"
  //   "What do you get when you divide?"  → was captured as answer "w"
  //
  // Answer extraction only runs when no intent signal matches.
  let messageType;
  let confidence = 1.0;
  let answer = null;

  if (PATTERNS.giveUp.test(lower)) {
    messageType = MESSAGE_TYPES.GIVE_UP;
  } else if (PATTERNS.idk.test(lower) && text.length < 50) {
    messageType = MESSAGE_TYPES.IDK;
  } else if (PATTERNS.skipRequest.test(lower) && text.length < 80) {
    messageType = MESSAGE_TYPES.SKIP_REQUEST;
  } else if (PATTERNS.frustration.test(lower)) {
    messageType = MESSAGE_TYPES.FRUSTRATION;
    confidence = 0.8;
  } else if (PATTERNS.helpRequest.test(lower)) {
    messageType = MESSAGE_TYPES.HELP_REQUEST;
  } else if (PATTERNS.offTask.test(lower)) {
    messageType = MESSAGE_TYPES.OFF_TASK;
  } else if (PATTERNS.question.test(lower)) {
    messageType = MESSAGE_TYPES.QUESTION;
  } else if (PATTERNS.checkMyWork.test(lower) && context.hasRecentUpload) {
    messageType = MESSAGE_TYPES.CHECK_MY_WORK;
  } else if (PATTERNS.greeting.test(lower) && text.split(' ').length <= 5) {
    messageType = MESSAGE_TYPES.GREETING;
  } else if (PATTERNS.affirmative.test(lower) && text.split(' ').length <= 5) {
    // Check if this is a bare "yes" to an explanation request (evasion)
    if (detectEvasiveAffirmative(text, context.recentAssistantMessages)) {
      messageType = MESSAGE_TYPES.EVASIVE_AFFIRMATIVE;
    } else {
      messageType = MESSAGE_TYPES.AFFIRMATIVE;
    }
  } else if (detectParroting(text, context.recentAssistantMessages)) {
    // Student echoed tutor's words — flag before treating as general math
    messageType = MESSAGE_TYPES.PARROTING;
    confidence = 0.85;
  } else {
    // No clear intent signal — now try answer extraction
    answer = extractAnswer(text);
    if (answer) {
      messageType = MESSAGE_TYPES.ANSWER_ATTEMPT;
    } else {
      messageType = MESSAGE_TYPES.GENERAL_MATH;
      confidence = 0.5;
    }
  }

  // Detect if student showed their reasoning (factored, simplified, explained why)
  const demonstratedReasoning = answer?.hasExplanation ? hasReasoningIndicators(text) : false;

  // Detect worksheet follow-up: student has a recent upload and is asking
  // for multiple problems or the "next" problem without attempting work.
  const hasRecentUpload = context.hasRecentUpload || false;
  const isWorksheetFollowUp = hasRecentUpload && (
    /\b(next\s*(couple|few|problem|one|question)|do\s*the\s*(others|rest)|what\s*about\s*(the\s*)?(next|rest|other)|let'?s\s*do\s*(the\s*)?(next|another|more)|can\s*you\s*(do|solve|help\s*with)\s*(the\s*)?(next|rest|other|all))\b/i.test(lower) ||
    /\b(problems?\s*\d+\s*(through|to|-)\s*\d+|#\d+\s*(through|to|-)\s*#?\d+)\b/i.test(lower) ||
    /\b(answers?\s*(for|to)\s*(the\s*)?(rest|all|every))\b/i.test(lower)
  );

  return {
    messageType,
    confidence,
    answer,               // { value, raw, hasExplanation? } or null
    demonstratedReasoning, // true if student showed valid mathematical reasoning
    contextSignals,       // [{ type, strength }]
    streaks: {
      idkCount: streaks.idkCount,
      giveUpCount: streaks.giveUpCount,
      recentWrongCount,
    },
    problemContext: detectProblemContext(text),
    isWorksheetFollowUp,  // true if student is asking for multiple worksheet problems
    hasRecentUpload,      // forwarded for decide stage
    raw: text,
  };
}

module.exports = {
  observe,
  extractAnswer,
  extractAnswerFromExplanation,
  hasReasoningIndicators,
  detectContextSignals,
  detectProblemContext,
  detectStreaks,
  detectParroting,
  detectEvasiveAffirmative,
  MESSAGE_TYPES,
  CONTEXT_SIGNALS,
  PATTERNS,
};
