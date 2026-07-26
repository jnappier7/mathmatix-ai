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

const { normalizeSpokenNumbers } = require('../mathUnicodeNormalizer');

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
  PROGRESS_REPORT: 'progress_report',
  DISPUTE: 'dispute',
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
  // The mirrored form — "100/7 = x" — is how students often end shown work
  // (the value lands on the left because that's the side they computed).
  valueAssignment: /^(-?\d+\.?\d*(?:\s*\/\s*\d+)?)\s*=\s*[a-z]\s*[.!?]*$/i,
  answerPhrase: /(?:answer\s+is|i\s+got|it'?s|equals?|i\s+think\s+it'?s?|that'?s|so\s+it'?s)\s*(-?\d+\.?\d*(?:\s*\/\s*\d+)?)/i,
  // Proposed / self-check answer: a number or fraction the student offers for
  // confirmation — "…right? 10/24", "isn't that equal to 10/24?", "is it 5/12?",
  // "10/24, right?", "so it's 5". Anchored to the END and gated by a confirmation
  // cue so it doesn't fire on genuine questions ("what is 10/24?"). This is a
  // "check my answer" attempt: the value is theirs, so verifying it (and confirming
  // when correct) is safe and does not leak.
  proposedAnswer: /\b(?:right|correct|is\s*it|isn'?t\s*it|is\s*that|isn'?t\s*that|equals?|equal\s*to|so\s*it'?s|so\s*is\s*it|would\s*it\s*be|would\s*that\s*be|maybe\s*it'?s)[\s:=?()'"]{0,4}(-?\d+\s*\/\s*\d+|-?\d+(?:\.\d+)?)\s*[?.!]*$|\b(-?\d+\s*\/\s*\d+|-?\d+(?:\.\d+)?)\s*[,.]?\s*(?:right|correct)\b\s*[?.!]*$/i,
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
  giveUp: /\b(just\s*tell\s*me|give\s*me\s*the\s*answer|tell\s*me\s*the\s*answer|what(?:'?s|\s+is)\s*the\s*answer|i\s*give\s*up|show\s*me\s*the\s*answer|show\s*(?:me\s*)?the\s*steps|can\s*you\s*just\s*solve\s*it|^solve(\s*it)?$|^just\s*solve(\s*it)?$|^do\s*it(\s*for\s*me)?$|^just\s*do\s*it$|^solve\s*this$|^figure\s*it\s*out$)\b/i,
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

  // The student is challenging something the TUTOR said. Previously these
  // classified as general_math at 0.5 confidence — the pipeline had no way to
  // represent "the student says I'm wrong", so a student pushing back twice
  // against a mistaken tutor changed nothing about what happened next, and the
  // tutor restated its claim with mounting concreteness.
  dispute: /\b(you(?:'?re|\s+are)\s+(?:wrong|mistaken|incorrect|not\s+listening)|that'?s\s+(?:not\s+(?:correct|right|true)|wrong|incorrect)|that\s+is\s+not\s+(?:correct|right|true)|no\s+it'?s\s+not|i\s+disagree|i\s+already\s+(?:said|told\s+you)|that'?s\s+not\s+what\s+i\s+(?:said|meant)|you\s+made\s+a\s+mistake|check\s+it\s+again|look\s+again|it\s+is\s+(?:too|so))\b/i,

  // The student is asserting competence / rejecting scaffolding: "I know this",
  // "too easy", "I don't need help", "stop asking", "why are you asking me",
  // "do you think I'm a 2nd grader". High precision on purpose — a false hit
  // suppresses scaffolding, so bare "I know" and "I can do this" are excluded;
  // only unambiguous "back off" phrasings match. Drives a DURABLE back-off mode
  // (see observe(): once asserted, the tutor stops probing correct answers and
  // raises difficulty for the rest of the session).
  // "why (are) we starting over" and "we already did this" are complaints
  // about RE-TEACHING known material — the same back-off signal ("why we
  // starting over?" — production, 2026-07-26, triggered nothing). Note the
  // question form is required for starting-over: a bare "can we start over?"
  // is a REQUEST to restart, not a complaint.
  competenceAssertion: /\b(too\s+easy|this\s+is\s+(?:so\s+|way\s+)?easy|i\s+(?:already\s+)?know\s+(?:this\s+stuff|the\s+steps|how\s+to|it\s+already|this\s+already)|i\s+know\s+this\s+already|i\s+(?:don'?t|do\s+not)\s+need\s+(?:the\s+)?help|stop\s+(?:asking|explaining|quizzing)|quit\s+asking|i\s+got\s+this|i\s+can\s+do\s+(?:these|those|them|this\s+too)|(?:2nd|second)\s+grader|why\s+are\s+you\s+(?:asking|quizzing)\s+me|why\s+(?:are\s+)?(?:we|you)\s+start(?:ing)?\s+(?:this\s+)?over|we\s+(?:already\s+(?:did|learned|covered|went\s+over)\s+this|(?:did|learned|covered|went\s+over)\s+this\s+(?:already|before|last\s+time)))\b/i,
};

/**
 * Extract a student's answer from their message.
 * Returns { value, raw } or null if not an answer attempt.
 */
/**
 * Try the strict single-line answer shapes on one line of text.
 * Returns the extracted value string or null. Used for the final line of
 * multi-line shown work, where only unambiguous answer forms may win —
 * an equation line like "100=7x" is still work, not an answer.
 */
function matchAnswerLine(line) {
  let match;
  if ((match = line.match(PATTERNS.varAssignment))) return match[1];
  if ((match = line.match(PATTERNS.valueAssignment))) return match[1].replace(/\s/g, '');
  if ((match = line.match(PATTERNS.justNumber))) return match[1];
  if ((match = line.match(PATTERNS.fraction))) return match[1].replace(/\s/g, '');
  if ((match = line.match(PATTERNS.mixedNumber))) return `${match[1]} ${match[2].replace(/\s/g, '')}`;
  if ((match = line.match(PATTERNS.algebraicExpr))) return match[1].replace(/\s/g, '');
  return null;
}

function extractAnswer(message) {
  const raw = message.trim();
  // Normalize speech-to-text negatives/number-words to signed digits BEFORE matching,
  // so a spoken "negative six" is recognized as the answer -6 (the numeric PATTERNS
  // only understand digits). `raw` keeps the original text for downstream use.
  const text = normalizeSpokenNumbers(raw);

  // Multi-line shown work: the LAST math-bearing line is the answer candidate;
  // the lines above it are work, which diagnose grades as a chain (and which
  // feeds demonstratedReasoning — never the graded value). Without this branch
  // a multi-line solve matched no pattern at all, classified general_math, and
  // could end up graded off its own first line (the "520=7x" false negative).
  if (/\n/.test(text)) {
    const mathLines = text
      .split(/[\n\r]+/)
      .map(l => l.trim().replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)]|[-*•])\s*/i, ''))
      .filter(l => l && /\d/.test(l));
    if (mathLines.length >= 2) {
      const value = matchAnswerLine(mathLines[mathLines.length - 1]);
      if (value) return { value, raw, hasExplanation: true };
    }
  }

  // For short, direct answers (< 100 chars): try all patterns
  if (text.length <= 100) {
    let match;
    if ((match = text.match(PATTERNS.varAssignment))) return { value: match[1], raw };
    if ((match = text.match(PATTERNS.justNumber))) return { value: match[1], raw };
    if ((match = text.match(PATTERNS.fraction))) return { value: match[1].replace(/\s/g, ''), raw };
    if ((match = text.match(PATTERNS.mixedNumber))) return { value: `${match[1]} ${match[2].replace(/\s/g, '')}`, raw };
    if ((match = text.match(PATTERNS.algebraicExpr))) return { value: match[1].replace(/\s/g, ''), raw };
    if ((match = text.match(PATTERNS.answerPhrase))) return { value: match[1].replace(/\s/g, ''), raw };
    if ((match = text.match(PATTERNS.arithmeticStatement))) return { value: match[1].replace(/\s/g, ''), raw };
  }

  // Proposed / self-check answer ("…right? 10/24", "is it 5/12?") — cue-gated and
  // end-anchored, so it's safe to try regardless of message length.
  {
    const match = text.match(PATTERNS.proposedAnswer);
    if (match) return { value: (match[1] || match[2]).replace(/\s/g, ''), raw, proposed: true };
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
 * Detect a "progress report" — the student is describing a step they ALREADY
 * completed, not asking for help and not dropping a fresh problem. Re-teaching
 * a step the student just performed is the documented "Maya re-explains a
 * completed step" bug.
 *
 * Examples that match:
 *   "I completed the square by adding 16 to both sides"
 *   "I factored it into (x+2)(x-3)"
 *   "I already distributed and combined like terms"
 *   "I subtracted 5 from both sides"
 *
 * Examples that do NOT match (caught by earlier classifiers, so they never
 * reach this fallback):
 *   "I don't know how to factor"  → IDK
 *   "how do I factor this?"       → HELP_REQUEST / QUESTION
 *   "I got x = 7"                 → ANSWER_ATTEMPT (answer extracted first)
 *   "I'm stuck after I factored"  → HELP_REQUEST
 *
 * This runs only in the classify fallback (no intent keyword matched, no
 * answer extracted), which is exactly where completed-step reports used to
 * fall through to GENERAL_MATH and get re-taught from step one.
 *
 * @returns {boolean}
 */
function detectProgressReport(message) {
  if (!message || typeof message !== 'string') return false;
  const t = message.trim();
  if (t.length < 6 || t.length > 300) return false;

  // First-person ("I"/"we") report of a completed math action. Allows up to
  // two helper/adverb words between the subject and the verb so present-perfect
  // and hedged forms still match ("I have already factored", "we then added").
  const completedStep = /\b(?:i|we)\s+(?:(?:just|already|then|also|first|next|have|'ve)\s+){0,2}(?:completed|finished|factored|simplified|distributed|expanded|foiled|combined|subtracted|added|multiplied|divided|moved|plugged|substituted|cancell?ed|isolated|rewrote|squared|cubed|cross[\s-]?multiplied|reduced|converted|flipped|inverted|grouped|split|set)\b/i;

  return completedStep.test(t);
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
 * Did the tutor's last message ask the student to perform or describe the
 * next math step? If yes, any math-shaped reply is an answer attempt to that
 * step — not a fresh problem drop. Without this guard, the bare-drop gate
 * fires mid-conversation and clobbers the student's work with a canned
 * "show me what you tried" message.
 *
 * Matches "what's the first step", "what do you think we should do",
 * "what's next", "now what", "try it", "can you evaluate", etc.
 *
 * Returns false when there is no last assistant message or it doesn't
 * read as a step-guidance question.
 */
function lastTutorAskedForNextStep(recentAssistantMessages) {
  if (!recentAssistantMessages || recentAssistantMessages.length === 0) return false;
  const last = recentAssistantMessages[recentAssistantMessages.length - 1];
  const text = (last?.content || '').toLowerCase();
  if (!text) return false;
  if (!/\?/.test(text)) return false;

  const stepGuidance = [
    /\bwhat'?s\s+the\s+(?:next|first|second|third|last|final)\s+step\b/,
    /\bwhat\s+(?:do|should|would|could)\s+(?:we|you)\s+(?:do|try|use|think|get|notice|see|need|start|begin)\b/,
    /\bwhat\s+(?:do|did)\s+you\s+(?:think|get|notice|see|find|come\s+up\s+with)\b/,
    /\bwhat'?s\s+(?:next|the\s+(?:answer|result|value|next\s+step))\b/,
    /\bnow\s+what\b/,
    /\bany\s+ideas?\b/,
    /\bcan\s+you\s+(?:tell|show|try|evaluate|simplify|factor|solve|find|compute|integrate|differentiate|plug|substitute)\b/,
    /\b(?:give\s+it\s+a\s+(?:try|shot)|take\s+a\s+(?:try|shot|stab)|try\s+(?:it|that|this|one))\b/,
    /\bwhat\s+about\s+(?:the\s+)?(?:next|second|first|other|remaining)\s+(?:step|part|piece)\b/,
    /\bplug(?:\s+(?:that|those|it|in))\b/,
    /\bevaluate\s+(?:at|that|this|it)\b/,
    /\bhow\s+(?:do|would|should)\s+(?:we|you)\s+(?:start|begin|approach|set\s+up|tackle)\b/,
    /\bwhat\s+(?:goes?|happens?)\s+(?:there|next|in\s+the\s+blank)\b/,
  ];

  return stepGuidance.some(pat => pat.test(text));
}

/**
 * Detect a "bare problem drop" — the student handed over a new math problem
 * (equation, expression, worked-problem prompt) without an attempt, without
 * a specific stuck point, and without reasoning language.
 *
 * Examples that match:
 *   "x^2=49"
 *   "4x-5=22"
 *   "what about 2/3 + 1/4"
 *   "solve 3x+5=14"
 *
 * Examples that do NOT match:
 *   "I got x=7 but the show-my-work said wrong" (attempt present)
 *   "I'm stuck on step 2 of 4x-5=22"             (stuck indicator)
 *   "after I factor, what do I do next?"          (reasoning indicator)
 *   "the square root of 49 is 7"                  (statement, not a new problem)
 *   ANY math reply right after the tutor asked "what's the next step?"
 *
 * When this fires, the decide stage steers the LLM to ask for the student's
 * work or offer a parallel example. Never solve.
 *
 * @returns {boolean}
 */
function detectBareProblemDrop(text, messageType, hasAnswer, recentAssistantMessages) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length === 0 || t.length > 140) return false;

  // Conversation guard: if the tutor just asked the student to perform or
  // describe a step, the student's math reply is an answer to that step, not
  // a fresh problem. Suppress the bare-drop flag.
  if (lastTutorAskedForNextStep(recentAssistantMessages)) return false;

  // Message types that encode student intent already — don't override.
  const NON_DROP_TYPES = new Set([
    MESSAGE_TYPES.ANSWER_ATTEMPT,
    MESSAGE_TYPES.IDK,
    MESSAGE_TYPES.GIVE_UP,
    MESSAGE_TYPES.HELP_REQUEST,
    MESSAGE_TYPES.CHECK_MY_WORK,
    MESSAGE_TYPES.AFFIRMATIVE,
    MESSAGE_TYPES.GREETING,
    MESSAGE_TYPES.FRUSTRATION,
    MESSAGE_TYPES.OFF_TASK,
    MESSAGE_TYPES.SKIP_REQUEST,
    MESSAGE_TYPES.EVASIVE_AFFIRMATIVE,
    MESSAGE_TYPES.PARROTING,
    MESSAGE_TYPES.PROGRESS_REPORT,
  ]);
  if (NON_DROP_TYPES.has(messageType)) return false;
  if (hasAnswer) return false;

  // Must contain recognizable math-problem signals.
  const hasEquation = /=/.test(t);
  const hasLatexMath = /\\frac|\\sqrt|\\int|\\sum|\^\{|_\{/.test(t);
  // Coefficient+variable terms like "2x", "3y²", or variable+operator sequences.
  const hasVariableTerms =
    /\b\d*[a-z](?:\^\d+|²|³|⁴)?[\s]*[+\-*/=]/i.test(t) ||
    /[+\-*/=]\s*\d*[a-z]/i.test(t);
  const hasUnicodeMath = /[²³⁴√∫Σπ]/.test(t);
  const hasSolveVerb = /^(solve|factor|simplify|evaluate|compute|graph|find)\s+/i.test(t);

  // Bare arithmetic / fraction COMPUTATION drops — a student handing over a
  // numeric problem to carry out, with no attempt: "12⅔ - 4¼", "1/2 + 1/4",
  // "16/4 - 2", "3.5 × 4". Without this, only equations (=), variable terms,
  // \frac LaTeX, or the limited [²³⁴√∫Σπ] set counted — so a Unicode or ASCII
  // fraction drop slipped through and the tutor solved it end-to-end.
  // A lone value/answer ("3/4", "38/3", "8") is NOT a drop, so we require an
  // explicit +, -, ×, ÷, ·, or * operator between terms (a single "/" denotes
  // one fraction value, not an operation to perform).
  const hasVulgarFraction = /[¼-¾⅐-⅞]/.test(t); // ¼ ½ ¾ ⅓ ⅔ ⅕ …
  const hasArithmeticOp =
    /\d\s*[-+×÷⋅·*]\s*[\d(¼-¾⅐-⅞]/.test(t) ||   // 4 - 2, 16 ÷ 4, 1/2 + 1/4
    /[¼-¾⅐-⅞]\s*[-+×÷⋅·*/]\s*\d/.test(t);        // ⅔ - 4  (mixed-number op)
  const hasArithmeticComputation =
    hasArithmeticOp || (hasVulgarFraction && /[-+×÷⋅·*/]/.test(t));

  const hasMathSignals = hasEquation || hasLatexMath || hasVariableTerms ||
    hasUnicodeMath || hasSolveVerb || hasArithmeticComputation;
  if (!hasMathSignals) return false;

  // Attempt / reasoning / stuck indicators disqualify — the student has engaged.
  const hasReasoning =
    /\b(because|since|after\s+(?:i|you)|i\s+(?:got|think|tried|factored|simplified|cancel(?:led)?|distribut(?:ed)?|combined|plugged)|my\s+(?:answer|work|guess)|here'?s\s+(?:what|how|my)|so\s+(?:i|we)\s+got|i\s+ended\s+up\s+with)\b/i.test(t);

  const hasStuckIndicator =
    /\b(stuck|confused|don'?t\s+(?:get|understand|know)|not\s+sure|where\s+did\s+i|what'?s\s+wrong|why\s+(?:is|does|did)|how\s+come)\b/i.test(t);

  // A trailing question mark implies the student is asking something specific,
  // not just dropping a problem. (But "solve this?" is still a drop — so we
  // only treat it as non-drop if the text has question-word content too.)
  const hasSpecificQuestion =
    /\?\s*$/.test(t) &&
    /\b(why|how\s+(?:come|do|does|did|should)|what'?s\s+(?:wrong|the\s+(?:next|first)\s+step))\b/i.test(t);

  if (hasReasoning || hasStuckIndicator || hasSpecificQuestion) return false;

  return true;
}

/**
 * Does this message state a concrete, solvable math problem? Unlike
 * detectBareProblemDrop, this ignores messageType — it answers only
 * "is there a specific problem in this text". Used to tell an
 * answer-demand that carries its own problem ("just give me the answer
 * to 3x + 7 = 22") apart from a bare answer-demand ("just give me the
 * answer") so the tutor can guide the STATED problem instead of a
 * generic redirect (QA P1-1). High precision on purpose.
 *
 * @param {string} text
 * @returns {boolean}
 */
function messageStatesProblem(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length === 0 || t.length > 200) return false;

  const hasEquation = /=/.test(t) && /[a-z0-9]/i.test(t);
  const hasSolveVerb =
    /\b(solve|factor|simplify|evaluate|compute|graph|find|differentiate|integrate)\b/i.test(t) &&
    /[a-z0-9²³⁴√]/i.test(t);
  const hasVariableTerms =
    /\b\d*[a-z](?:\^\d+|²|³|⁴)?\s*[+\-*/=]/i.test(t) ||
    /[+\-*/=]\s*\d*[a-z]/i.test(t);
  const hasUnicodeMath = /[²³⁴√∫Σπ]/.test(t);
  const hasArithmeticOp = /\d\s*[-+×÷⋅·*]\s*\d/.test(t);

  return hasEquation || hasSolveVerb || hasVariableTerms || hasUnicodeMath || hasArithmeticOp;
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

  // Count recent wrong/correct answers over PROBLEM OUTCOMES, not raw
  // messages. Probing turns ("walk me through how you got that") produce
  // assistant messages with NO problemResult stamp, and under the old
  // last-6-messages window each such turn evicted a real win from the
  // streak — so the more the tutor probed, the less streak evidence it had
  // to stop probing (self-reinforcing loop, production 2026-07-26: five
  // first-try corrects and the tutor still demanded explanations).
  // recentProblemResults, when provided, is the last 6 STAMPED outcomes
  // regardless of how many unstamped turns sit between them.
  //
  // recentCorrectCount is the symmetric "on a roll" signal. Without it the
  // pipeline could only ever ratchet support UP (on wrong streaks) and
  // never DOWN, so a fluent student kept getting the same problem broken
  // into micro-steps (the "over-scaffolding" failure). decide's
  // CONFIRM_CORRECT branch reads this to advance / gather data / teach-back.
  const stampedResults = context.recentProblemResults
    || (context.recentAssistantMessages || [])
      .filter(msg => msg.problemResult)
      .map(msg => msg.problemResult);
  const resultWindow = stampedResults.slice(-6);
  const recentWrongCount = resultWindow.filter(r => r === 'incorrect').length;
  const recentCorrectCount = resultWindow.filter(r => r === 'correct').length;

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

  // Disputes are computed as a SIGNAL independently of the type chain, because a
  // student can push back while also being frustrated, asking a question, or
  // restating their answer — and the correctness consequence (re-verify, and do
  // not repeat an unverified claim) must apply in all of those cases, not only
  // when "you're wrong" happens to be the whole message. Same principle as the
  // verification gate: classification chooses the teaching action, it must never
  // decide whether correctness gets re-examined.
  const isDispute = PATTERNS.dispute.test(lower);

  // Competence assertion / scaffolding rejection — computed as a SIGNAL (like
  // isDispute) because it co-occurs with answers, skips, and frustration. It
  // also GUARDS the help-request branch below: "I don't NEED HELP" contains
  // "help" and was misclassified as HELP_REQUEST, so the tutor handed a hint to
  // a student demanding the opposite.
  const assertsCompetence = PATTERNS.competenceAssertion.test(lower);

  if (PATTERNS.giveUp.test(lower)) {
    messageType = MESSAGE_TYPES.GIVE_UP;
  } else if (PATTERNS.idk.test(lower) && text.length < 50) {
    messageType = MESSAGE_TYPES.IDK;
  } else if (PATTERNS.skipRequest.test(lower) && text.length < 80) {
    messageType = MESSAGE_TYPES.SKIP_REQUEST;
  } else if (PATTERNS.frustration.test(lower)) {
    messageType = MESSAGE_TYPES.FRUSTRATION;
    confidence = 0.8;
  } else if (PATTERNS.helpRequest.test(lower) && !assertsCompetence) {
    messageType = MESSAGE_TYPES.HELP_REQUEST;
  } else if (PATTERNS.offTask.test(lower)) {
    messageType = MESSAGE_TYPES.OFF_TASK;
  } else if (isDispute) {
    messageType = MESSAGE_TYPES.DISPUTE;
    confidence = 0.9;
  } else if (PATTERNS.question.test(lower) && !PATTERNS.proposedAnswer.test(text)) {
    // A question word normally means "asking", EXCEPT when the student is
    // self-checking a concrete answer ("is it 5/12?", "would it be 3/4?") — that's
    // an answer attempt, so let it fall through to extraction and get verified.
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
    } else if (detectProgressReport(text)) {
      // Student described a step they already did — confirm and advance,
      // do NOT re-teach it (handled by decide's PROGRESS_REPORT branch).
      messageType = MESSAGE_TYPES.PROGRESS_REPORT;
      confidence = 0.8;
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

  // Detect a bare problem drop — student handed over a new problem with no
  // attempt and no specific question. This is the #1 leak vector: LLM
  // defaults to helpfulness and solves it. The pipeline steers the LLM with
  // anti-leak directives when this fires (see decide.js ELICIT_FIRST action).
  // We pass recent tutor turns so a math reply to "what's the next step?"
  // doesn't get misread as a fresh drop.
  const isBareProblemDrop = detectBareProblemDrop(
    text, messageType, !!answer, context.recentAssistantMessages
  );

  // ── Durable back-off mode ──
  // Once a student asserts competence / rejects scaffolding, the tutor must not
  // revert to probing on the very next turn (the documented "I hear you!" then
  // re-interrogate failure that drove a student to "Christ!!!"). Re-derive the
  // mode each turn from the recent user window so it persists as long as the
  // signal is live, and fades naturally if they later go quiet or struggle.
  const backOffMode = assertsCompetence ||
    (context.recentUserMessages || [])
      .some(m => PATTERNS.competenceAssertion.test((m.content || '').toLowerCase()));

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
      recentCorrectCount,
    },
    problemContext: detectProblemContext(text),
    isDispute,            // true if the student is challenging something the tutor said
    assertsCompetence,    // true if THIS message asserts competence / rejects scaffolding
    backOffMode,          // durable: student has signaled "I know this" recently — stop probing, raise difficulty
    isWorksheetFollowUp,  // true if student is asking for multiple worksheet problems
    isBareProblemDrop,    // true if student handed over a new problem with no attempt
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
  detectProgressReport,
  detectBareProblemDrop,
  messageStatesProblem,
  lastTutorAskedForNextStep,
  MESSAGE_TYPES,
  CONTEXT_SIGNALS,
  PATTERNS,
};
