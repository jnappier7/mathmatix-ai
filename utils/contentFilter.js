/**
 * The chat keyword filter — and the disclosures it must never swallow.
 *
 * routes/chat.js answers a message containing sexual / profane / substance
 * words with a canned "that topic isn't appropriate — let's focus on math",
 * BEFORE the tutor sees it. Those are exactly the words an abuse disclosure
 * tends to contain. Witnessed 2026-10-17 with the production filter: "my mom
 * gets drunk and hits me", "my uncle touches me … showed me porn", "someone
 * made me drink alcohol and i dont remember what happened", "my stepdad does
 * sex stuff to me" — all four got the canned reply, so the tutor's empathy +
 * <SAFETY_CONCERN> path never ran and sendSafetyConcernAlert never fired.
 *
 * A message that reads as a disclosure of harm always reaches the tutor. The
 * cost of a false positive here is one off-topic message reaching the model
 * (which already redirects); the cost of a false negative is a child's abuse
 * disclosure answered with "let's focus on math" and nobody alerted.
 */

const INAPPROPRIATE_PATTERNS = [
  /\b(sex|porn|penis|vagina|breast|dick|cock|pussy|fuck|shit|ass|damn|bitch)\b/i,
  /\b(drug|weed|cocaine|alcohol|beer|wine|drunk)\b/i,
];

// Harm to the student, by themselves or someone else; a threat; being unsafe.
// Deliberately broad — see the cost asymmetry above.
const DISCLOSURE_PATTERNS = [
  /\b(kill(ing)?|hurt(ing)?|harm(ing)?|cut(ting)?|starv(e|ing))\s+(my\s*self|myself)\b/i,
  /\b(suicid|self[- ]?harm|want(ed)? to die|wanna die|end (it all|my life)|don'?t want to (be alive|live|exist)|better off (dead|without me)|no reason to live)/i,
  /\b(hits?|hitting|beats?|beating|slaps?|kicks?|chokes?|punch(es)?|burns?|hurts?|touch(es|ed|ing)?|grab(s|bed)?|rape[ds]?|molest\w*|abus\w*)\s+(me|my (body|privates?|chest|breasts?))\b/i,
  /\b(abus(e|ed|ing)|molest\w*|rap(e|ed)|assault(ed)?|groom(ed|ing)|sexually|inappropriate(ly)? touch\w*|sex stuff|sexual stuff)\b/i,
  /\b(made|makes|forced?|forces|forcing|pressur(ed|es|ing)) me\b/i,
  /\b(our|a|it'?s a|keep (it|this)) secret\b/i,
  /\b(scared|afraid|terrified) (to go home|of (my|him|her|them|going home))\b/i,
  /\b(threaten(ed|s|ing)?|said (he|she|they)'?d? (hurt|kill))\b/i,
  /\b(gun|weapon|knife|bomb)\b.*\b(school|bring|tomorrow|shoot|class)\b/i,
  /\b(don'?t|cant|can'?t) remember what happened\b/i,
  /\bnot safe\b|\bunsafe\b|\b(don'?t|do not|never) feel safe\b/i,
];

function looksLikeDisclosure(message) {
  const m = String(message || '');
  return DISCLOSURE_PATTERNS.some((re) => re.test(m));
}

/** True when the canned "not appropriate" reply should answer instead of the tutor. */
function shouldCannedBlock(message) {
  const m = String(message || '').toLowerCase();
  if (!INAPPROPRIATE_PATTERNS.some((re) => re.test(m))) return false;
  return !looksLikeDisclosure(message);
}

module.exports = { shouldCannedBlock, looksLikeDisclosure, INAPPROPRIATE_PATTERNS };
