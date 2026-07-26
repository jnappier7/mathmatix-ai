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
  ].join('|'),
  'i'
);

function detectTestOutIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return TEST_OUT.test(text);
}

module.exports = { detectTestOutIntent };
