// Detect a student asking to TEST OUT of / prove a skill from chat, so the
// pipeline can launch an in-chat challenge run (5 problems, no hints, proves the
// skill via the challenge rung — utils/skillRung).
//
// Deliberately SPECIFIC. A loose /test/ match would fire on "this is a test",
// "let me test my answer", or "i know this is hard". We require an explicit
// test-out / challenge / skip-the-lesson phrasing so the card only appears when
// the student actually asked to prove out.
const TEST_OUT = new RegExp(
  [
    'test(?:ing)?\\s*out',          // "test out", "testing out" ("test my answer" won't match)
    'test me\\b',
    'quiz me\\b',
    'challenge me\\b',
    'let me prove\\b',
    'ready to test\\b',
    'can i test out\\b',
    'skip (?:the )?lesson\\b',
    'prove (?:that )?i know\\b',
    'i can pass (?:the )?(?:test|challenge)\\b',
    'prove (?:my )?mastery\\b',
    // A requested challenge: "I want a five-question skill challenge on …",
    // "give me a challenge", "can I take the challenge". The request verb is
    // required — "this is a challenge for me" is not one — and a "challenge
    // problem" is a harder problem, not a test-out (student audit, 2026-10-15:
    // the first phrasing above got an improvised prose worksheet instead).
    '\\b(?:want|give me|start|take|do|try|run|launch|ready for|like)\\b(?:\\s+[\\w-]+){0,4}?\\s+challenge\\b(?!\\s+(?:problem|question)s?\\b)',
  ].join('|'),
  'i'
);

function detectTestOutIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return TEST_OUT.test(text);
}

/**
 * Match a skill the student NAMED in their message against the plan's focus
 * queue ("can I test out of absolute value?"). Any focus status counts — the
 * student may name a skill whose entry was already resolved. Prefers the
 * longest matching name so "absolute value equations" beats "absolute value".
 */
function matchFocusSkillByName(message, plan) {
  if (!message || !Array.isArray(plan?.skillFocus) || plan.skillFocus.length === 0) return null;
  const lower = String(message).toLowerCase();
  let best = null;
  for (const sf of plan.skillFocus) {
    if (!sf?.skillId) continue;
    const name = (sf.displayName || '').toLowerCase().trim();
    if (name.length >= 4 && lower.includes(name)) {
      if (!best || name.length > best.name.length) best = { name, skillId: sf.skillId };
    }
  }
  return best ? best.skillId : null;
}


const PRONOUN_TOPIC = /^(?:this|that|it|these|those|this one|that one|this skill|that skill|this topic|it all|everything)$/i;

/**
 * The topic named after the request: "challenge on Systems by substitution",
 * "test out of absolute value", "quiz me on factoring". Null when none is
 * named or it is only a pronoun ("test out of this").
 */
function extractNamedTopic(message) {
  if (!message) return null;
  const m = String(message).match(/(?:challenge|test(?:ing)?\s*out|quiz(?:\s+me)?|test\s+me|prove\s+(?:my\s+)?(?:mastery|that\s+i\s+know|i\s+know))\s+(?:on|of|for|in|over|about|with)\s+(?:the\s+)?([^.?!,;:\n]+)/i);
  if (!m) return null;
  const topic = m[1]
    .replace(/\b(?:skill|topic|unit|lesson|please|now|today|right now)\b/gi, ' ')
    .replace(/\b(?:and|so|because|but)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!topic || topic.length < 3 || PRONOUN_TOPIC.test(topic)) return null;
  return topic;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !/^(?:of|the|and|by|a|an|to|in|on|with)$/.test(w)));

/**
 * Best catalog skill for a named topic. Exact name beats containment beats
 * token overlap; a canonical (unified-taxonomy) skill wins a tie, since that
 * is the key mastery is stored under. Null below a confident match.
 *
 * @param {string} topic
 * @param {Array<{skillId, displayName, studentLabel, source}>} catalog
 */
function matchCatalogSkill(topic, catalog) {
  if (!topic || !Array.isArray(catalog) || !catalog.length) return null;
  const t = norm(topic);
  const tt = tokens(topic);
  let best = null;
  for (const sk of catalog) {
    if (!sk || !sk.skillId) continue;
    for (const name of [sk.displayName, sk.studentLabel]) {
      const n = norm(name);
      if (n.length < 4) continue;
      let score = 0;
      if (n === t) score = 3;
      else if (t.includes(n) && n.length >= 6) score = 2 + n.length / 1000;
      else if (n.includes(t) && t.length >= 6) score = 1.5;
      else {
        const nt = tokens(name);
        const inter = [...tt].filter((w) => nt.has(w)).length;
        const j = inter / (new Set([...tt, ...nt]).size || 1);
        if (j >= 0.75) score = 1 + j;
      }
      if (!score) continue;
      if (sk.source === 'unified-taxonomy') score += 0.01;
      if (!best || score > best.score) best = { score, skillId: sk.skillId };
    }
  }
  return best ? best.skillId : null;
}

/**
 * Resolve WHICH skill a test-out request is about.
 *
 * This used to be a three-step chain that could silently produce null (free
 * chat has no activeSkill; a fresh plan may have no in-progress focus entry) —
 * and on null the pipeline pushed NO directive, so the LLM accepted the
 * request and improvised an ungraded 5-question quiz in prose, then broke its
 * own no-hints rule turn after turn (production, 2026-07-26). The chain now
 * also tries a skill named in the message and the last session's skill, and
 * callers must handle null explicitly (see the pipeline's no-improv directive).
 *
 * @param {Object} params
 * @param {string} params.message - The student's message
 * @param {string|null} params.activeSkillId - ctx.activeSkill?.skillId (mastery mode)
 * @param {Object|null} params.tutorPlan - The TutorPlan document
 * @param {Function} params.recentPracticeSkillId - injected from tutorPlanManager
 *   (parameter injection, not a require, to keep this module dependency-free)
 * @returns {string|null}
 */
function resolveTestOutSkillId({ message, activeSkillId, tutorPlan, recentPracticeSkillId, catalog }) {
  // A topic the student NAMED decides it. Matching the name only against the
  // plan's focus queue meant "challenge on systems by substitution" fell
  // through to whatever the plan targeted — a challenge on the wrong skill
  // (student audit: one appeared mid-sequences). Named but unmatched → null,
  // so the pipeline asks which skill rather than guessing.
  const topic = extractNamedTopic(message);
  if (topic) {
    return matchFocusSkillByName(topic, tutorPlan)
      || matchFocusSkillByName(message, tutorPlan)
      || matchCatalogSkill(topic, catalog)
      || null;
  }
  return activeSkillId
    || matchFocusSkillByName(message, tutorPlan)
    || tutorPlan?.currentTarget?.skillId
    || (typeof recentPracticeSkillId === 'function' ? recentPracticeSkillId(tutorPlan) : null)
    || tutorPlan?.lastSession?.skillId
    || null;
}

module.exports = { detectTestOutIntent, matchFocusSkillByName, resolveTestOutSkillId, extractNamedTopic, matchCatalogSkill };
