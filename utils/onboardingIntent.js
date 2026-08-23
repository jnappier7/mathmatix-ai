/**
 * What the student said brought them to Mathmatix.
 *
 * onboarding.html asks an open question ("what brings you here?"), captures it
 * by voice or text, and classifies it into user.onboarding.intentCategory. The
 * capture, the classifier and the schema have all existed for a while — but
 * nothing has ever read the answer. intentText and intentCategory were written
 * and never consumed by any route, prompt or report, so the question produced
 * data no code path used. This is the consumer.
 *
 * Only the CATEGORY is used, never intentText.
 * ---------------------------------------------
 * intentCategory is a schema enum, so it cannot carry anything but one of
 * eight known strings. intentText is up to 2000 characters of free-form voice
 * or typed input from an unauthenticated-ish onboarding step, and putting that
 * verbatim into a system prompt is a prompt-injection surface. The category
 * carries essentially all of the signal and none of the risk. If the raw text
 * is ever wanted for rapport, it should go through the same treatment the rest
 * of the untrusted-input path gets (see middleware/promptInjection.js), not
 * straight into the prompt.
 *
 * @module utils/onboardingIntent
 */

const ALLOWED_CATEGORIES = [
  'student_homework',
  'student_test_prep',
  'act_sat_prep',
  'parent_support',
  'teacher_exploring',
  'general_math_help',
  'just_exploring',
  'unknown'
];

/* ── Classification ──────────────────────────────────────────────────────
 * Two copies of this used to exist — one in public/js/onboarding.js and one
 * in routes/onboarding.js — and the route only used its own as a fallback,
 * otherwise trusting whatever category the client sent. This is now the single
 * implementation and the server classifies from the text itself.
 *
 * The ordering bug it replaces: the old chain tested speaker identity FIRST
 * (teacher, then parent) and subject matter afterwards, so a mention of a
 * family member outranked the actual topic:
 *
 *   "my mom said I should try this for my ACT"  -> parent_support
 *   "my dad thinks I am bad at math"            -> parent_support
 *
 * Both are students, and in both the actionable word was ignored. Subject
 * matter now wins; speaker identity is only consulted when the text says
 * nothing about what they want to work on.
 */

// First person — the speaker IS a teacher/parent. "I teach", "I'm a parent".
const FIRST_PERSON_TEACHER = /\b(i teach|i'?m a teacher|i am a teacher|my class(room)?|my students)\b/;
const FIRST_PERSON_PARENT = /\b(i'?m a parent|i am a parent|i'?m a (mom|dad|mother|father)|i am a (mom|dad|mother|father)|my (kid|son|daughter|child|children)\b)/;

// Third person — the speaker MENTIONS a parent/teacher but is not one.
// "my mom said", "my teacher told me". Not an identity signal.
const MENTIONS_ADULT = /\b(my (mom|dad|mother|father|parents?|teacher))\b/;

const TOPIC_TESTS = [
  ['act_sat_prep',      /\b(act|sat|psat)\b|\b(act|sat) prep\b|standardized test|admissions test/],
  ['student_test_prep', /\b(test|quiz|exam|final|finals|midterm|state test|benchmark)\b/],
  ['student_homework',  /\b(homework|assignment|problem set|worksheet|due tomorrow|due tonight|due friday)\b/],
  ['general_math_help', /(bad at math|failing|struggling|confused|don'?t (get|understand)|stuck on|hate math|behind in math|rusty|catch up)/]
];

// Not subject matter — the absence of it. "Just looking around" says what they
// AREN'T here for, so it ranks below both topic and identity: a parent who says
// they're browsing is still most usefully a parent.
const NO_STATED_PURPOSE = /(check(ing)? (it|this) out|just (looking|curious|exploring|seeing|trying|browsing)|see what (this|it) is|trying it out|poke around)/;

/**
 * Classify an open-ended onboarding answer.
 *
 * @param {string} rawText
 * @returns {string} one of ALLOWED_CATEGORIES
 */
function inferIntent(rawText) {
  if (!rawText || typeof rawText !== 'string') return 'unknown';
  const t = rawText.toLowerCase();

  // A first-person teacher is not a student under any topic, so it still wins.
  if (FIRST_PERSON_TEACHER.test(t)) return 'teacher_exploring';

  // Subject matter beats speaker identity. "help my daughter with her ACT" is
  // a parent, but ACT is the part that says how to teach.
  for (const [category, re] of TOPIC_TESTS) {
    if (re.test(t)) return category;
  }

  // Only now does identity matter — the text said nothing about the work.
  if (FIRST_PERSON_PARENT.test(t)) return 'parent_support';

  if (NO_STATED_PURPOSE.test(t)) return 'just_exploring';
  if (MENTIONS_ADULT.test(t)) return 'unknown';  // a mention is not an identity

  return 'unknown';
}

/* ── Structured answers ──────────────────────────────────────────────────
 * onboarding.html now leads with two closed questions — who will be using this,
 * and what they want help with — because "What brings you to Mathmatix today?"
 * asked cold was too open to answer. Visitors could not tell whether it wanted
 * their role, their child's difficulty, or a specific math problem, and it sat
 * between "Start Free Now" and the account they had just asked to create.
 *
 * The closed answers are mapped HERE, not in the browser. The client sends which
 * options a human picked; it does not send a category. That is the same property
 * the free-text path has (see inferIntent's note) and it is the point: a caller
 * could otherwise name any enum value it liked.
 */

const WHO_CHOICES = ['my_child', 'me', 'my_students'];

const GOAL_CHOICES = [
  'homework',
  'missing_skills',
  'test_prep',
  'act_sat',
  'accommodations',
  'not_sure'
];

// Goal -> category. Deliberately mirrors TOPIC_TESTS above, so a person who
// picks "Homework" lands where a person who typed "homework" lands.
//
// `accommodations` maps to general_math_help rather than getting a category of
// its own: what the tutor actually does about accommodations comes from the IEP
// plan (models/iepPlan.js), which is a far stronger signal than a signup chip,
// and general_math_help's guidance — the underlying idea over speed — is the
// right posture in the meantime.
const GOAL_TO_CATEGORY = {
  homework:        'student_homework',
  missing_skills:  'general_math_help',
  test_prep:       'student_test_prep',
  act_sat:         'act_sat_prep',
  accommodations:  'general_math_help',
  not_sure:        null   // says nothing about the work; fall through to identity
};

// Identity -> category, consulted only when the goal says nothing.
const WHO_TO_CATEGORY = {
  my_child:    'parent_support',
  my_students: 'teacher_exploring',
  me:          'unknown'
};

/**
 * Classify a structured onboarding answer.
 *
 * Same precedence as inferIntent, for the same reasons: a first-person teacher
 * outranks any topic (a teacher exploring the product is not a student, whatever
 * they want to look at), then subject matter, then identity.
 *
 * @param {string} who   one of WHO_CHOICES
 * @param {string} goal  one of GOAL_CHOICES
 * @returns {string|null} a category, or null when neither answer is recognized
 */
function intentFromChoices(who, goal) {
  const validWho = WHO_CHOICES.includes(who) ? who : null;
  const validGoal = GOAL_CHOICES.includes(goal) ? goal : null;
  if (!validWho && !validGoal) return null;

  if (validWho === 'my_students') return 'teacher_exploring';

  if (validGoal) {
    const fromGoal = GOAL_TO_CATEGORY[validGoal];
    if (fromGoal) return fromGoal;
  }

  return validWho ? WHO_TO_CATEGORY[validWho] : 'unknown';
}

/**
 * Category -> one line of tutoring guidance.
 *
 * parent_support and teacher_exploring are deliberately absent: they say the
 * account holder is not the student, which is a fact about the account rather
 * than a way to teach, and acting on it inside a student session would be
 * guessing. unknown and just_exploring are handled below.
 */
const INTENT_GUIDANCE = {
  student_homework:
    'came here for homework help, so expect specific assigned problems rather than open practice.',
  student_test_prep:
    'came here to get ready for a test, so favour retrieval practice and spotting the question type.',
  act_sat_prep:
    'came here for ACT/SAT prep, so favour strategy, pacing and eliminating answers over long derivations.',
  general_math_help:
    'came here to shore up general understanding, so prioritise the underlying idea over speed.',
  just_exploring:
    'said they were just looking around, so earn the next question rather than assuming commitment.'
};

/**
 * Build the intent line for the tutor prompt.
 *
 * Framed as what they said at signup, not as a standing fact — a kid who
 * arrived for one homework problem in September should not still be treated as
 * a homework-only student in March. The tutor should weigh it, not obey it.
 *
 * @param {Object|null} onboarding - user.onboarding
 * @param {string} firstName
 * @returns {string} a single line, or '' when there is nothing useful to say
 */
function buildIntentPrompt(onboarding, firstName) {
  if (!onboarding || !onboarding.intentCategory) return '';

  const guidance = INTENT_GUIDANCE[onboarding.intentCategory];
  if (!guidance) return '';   // unknown, parent_support, teacher_exploring

  return `When ${firstName} signed up they ${guidance} Treat it as context, not as a rule — it may be out of date.`;
}

/* ── Staleness ───────────────────────────────────────────────────────────
 * A signup answer is the weakest evidence about a student that will ever
 * exist. Once the tutor has watched them work, tutorPlan and skillMastery are
 * strictly better, and a kid who arrived in September for one homework problem
 * should not still be treated as homework-only in March.
 *
 * So the stated intent expires. Not as a hedge in the prompt text — it stops
 * being sent.
 */
const INTENT_FADES_AFTER_SESSIONS = 5;
const INTENT_FADES_AFTER_DAYS = 30;

/**
 * Is the signup answer still the best thing we know?
 *
 * @param {Object|null} onboarding - user.onboarding
 * @param {Object} [signals] - { sessionCount, now }
 * @returns {boolean}
 */
function intentStillUseful(onboarding, signals = {}) {
  if (!onboarding || !onboarding.intentCategory) return false;

  const sessions = Number(signals.sessionCount) || 0;
  if (sessions >= INTENT_FADES_AFTER_SESSIONS) return false;

  if (onboarding.completedAt) {
    const now = signals.now instanceof Date ? signals.now : new Date();
    const days = (now - new Date(onboarding.completedAt)) / 86400000;
    if (days >= INTENT_FADES_AFTER_DAYS) return false;
  }

  return true;
}

/* ── Observed intent ─────────────────────────────────────────────────────
 * What the student actually does, which beats what they said at signup.
 * A kid who uploads a worksheet is doing homework whatever they typed in
 * September; a kid asking how long they have is test-prepping.
 *
 * Deliberately conservative: it only fires on unambiguous behaviour, because a
 * wrong observation is worse than none — it would override a stated intent that
 * might be right.
 */
const OBSERVED_SIGNALS = [
  ['student_homework', s => s.uploadedWorksheet === true],
  ['act_sat_prep',     s => /\b(act|sat|psat)\b/i.test(s.recentText || '')],
  ['student_test_prep', s => /\b(test|quiz|exam|midterm|finals?)\b.*\b(tomorrow|friday|monday|next week|on \w+day)\b/i.test(s.recentText || '')]
];

/**
 * Derive intent from behaviour, or null when nothing is unambiguous.
 *
 * @param {Object} signals - { uploadedWorksheet, recentText }
 * @returns {string|null}
 */
function deriveObservedIntent(signals = {}) {
  for (const [category, test] of OBSERVED_SIGNALS) {
    try {
      if (test(signals)) return category;
    } catch { /* a malformed signal is not an observation */ }
  }
  return null;
}

/**
 * The line the tutor actually gets — observation first, stated intent second,
 * and nothing once the stated intent has gone stale.
 *
 * @param {Object|null} onboarding
 * @param {string} firstName
 * @param {Object} [signals] - { sessionCount, now, uploadedWorksheet, recentText }
 * @returns {string}
 */
function buildIntentContext(onboarding, firstName, signals = {}) {
  const observed = deriveObservedIntent(signals);
  if (observed && INTENT_GUIDANCE[observed]) {
    return `Right now ${firstName} ${INTENT_GUIDANCE[observed]}`;
  }
  if (!intentStillUseful(onboarding, signals)) return '';
  return buildIntentPrompt(onboarding, firstName);
}

module.exports = {
  ALLOWED_CATEGORIES,
  WHO_CHOICES,
  GOAL_CHOICES,
  inferIntent,
  intentFromChoices,
  buildIntentPrompt,
  buildIntentContext,
  intentStillUseful,
  deriveObservedIntent,
  INTENT_GUIDANCE,
  INTENT_FADES_AFTER_SESSIONS,
  INTENT_FADES_AFTER_DAYS
};
