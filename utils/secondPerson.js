'use strict';
/* ============================================================
   secondPerson.js — speak to the student, not about them.

   The misconception catalog (utils/misconceptionDetector.js) and the LLM
   verifier describe errors for a teacher: "Student performs operations in
   wrong sequence", "The student likely miscalculated the values". Those
   strings became the body of the student's own "Watch for This" notebook
   cards verbatim (site review, 2026-11-03). This rewrites the common shapes
   into "you": the subject, the verb agreeing with it, and "the student's".

   Deliberately narrow — it only touches sentences that name "student", and
   an unrecognised verb shape is left in the third person rather than guessed.
   ============================================================ */

// Words that can sit between the subject and its verb without changing it.
const ADVERBS = 'likely|probably|possibly|often|sometimes|usually|only|also|may|might|could|has|have|did|does|is|was';

const IRREGULAR = { is: 'are', was: 'were', has: 'have', does: 'do', goes: 'go' };

/** "performs" -> "perform", "applies" -> "apply", "misses" -> "miss". */
function agree(verb) {
  const lower = verb.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (/[^aeiou]ies$/.test(lower)) return verb.slice(0, -3) + 'y';
  if (/(?:ss|sh|ch|x|z)es$/.test(lower)) return verb.slice(0, -2);
  if (/[^s]s$/.test(lower) && lower.length > 3) return verb.slice(0, -1);
  return verb; // past tense, base form, or a shape we don't know — leave it
}

function toSecondPerson(text) {
  if (!text) return text;
  let out = String(text)
    // Possessive first, so "the student's" never reaches the subject rule.
    .replace(/\b(?:the\s+)?student['’]s\b/gi, 'your')
    // Subject: "(The) student [adverbs] verb" -> "You [adverbs] verb".
    .replace(new RegExp(String.raw`\b(?:the\s+)?student\s+((?:(?:${ADVERBS})\s+)*)([a-z]+)\b`, 'gi'), (m, adv, verb) => {
      const advs = adv.trim().split(/\s+/).filter(Boolean);
      // The first auxiliary carries agreement ("has made" -> "have made").
      if (advs.length && IRREGULAR[advs[0].toLowerCase()]) {
        advs[0] = IRREGULAR[advs[0].toLowerCase()];
        return ['you', ...advs, verb].join(' ');
      }
      const modal = advs.some((a) => /^(?:may|might|could|did)$/i.test(a));
      return ['you', ...advs, modal ? verb : agree(verb)].join(' ');
    })
    // Anything left ("help the student see") is an object.
    .replace(/\b(?:the\s+)?student\b/gi, 'you');
  // Sentence starts take a capital.
  out = out.replace(/(^|[.!?]\s+|\n\s*)you\b/g, (m, lead) => `${lead}You`);
  out = out.replace(/(^|[.!?]\s+|\n\s*)your\b/g, (m, lead) => `${lead}Your`);
  return out;
}

module.exports = { toSecondPerson };
