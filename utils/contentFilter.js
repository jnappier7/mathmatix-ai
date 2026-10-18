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

// ── Alert-grade detection ──
// looksLikeDisclosure() above is deliberately broad: it only decides whether
// the TUTOR sees a message. Raising an alert emails a person, so this set is
// stricter — clear statements of self-harm, abuse, sexual abuse, a threat or
// weapon, or not being safe at home. It exists because the model does not
// reliably emit <SAFETY_CONCERN>: on gpt-4o-mini (live safety eval,
// 2026-10-17) 7 of 8 disclosures got a kind reply and NO tag, so no adult was
// ever told. The server now raises the alert itself when it can see one.
const ALERT_PATTERNS = [
  ['self-harm', /\b(kill(ing)?|hurt(ing)?|harm(ing)?|cut(ting)?|starv(e|ing))\s+(my\s*self|myself)\b/i],
  ['self-harm', /\b(suicid\w*|self[- ]?harm\w*|want(ed)? to die|wanna die|end (it all|my life)|don'?t want to (be alive|live|exist)|better off (dead|without me)|no reason to live|been cutting)/i],
  ['abuse', /\b(hits?|hitting|beats?|beating|slaps?|kicks?|chokes?|punch(es)?|burns?|hurts?)\s+me\b/i],
  ['sexual abuse', /\b(touch(es|ed|ing)?|grab(s|bed)?)\s+me\b|\b(molest\w*|rap(e|ed)|sexually (abus|assault)\w*|sex stuff|sexual stuff)\b/i],
  ['abuse', /\b(abus(e|ed|ing)|assault(ed)?|groom(ed|ing))\b/i],
  ['threat / weapon', /\b(gun|weapon|knife|bomb)\b.*\b(school|bring\w*|tomorrow|shoot\w*|class)\b/i],
  ['threat', /\bsaid (he|she|they)'?d? (hurt|kill)\b|\bthreaten(ed|s|ing)? (to (hurt|kill)|me)\b/i],
  ['unsafe at home', /\b(scared|afraid|terrified) (to go home|of (my|him|her|them|going home))\b|\b(don'?t|do not|never) feel safe\b|\bnot safe (at home|there)\b/i],
];

/**
 * A description for the safety alert when the student's own words disclose
 * harm, else null. persist raises the alert from this when the model's reply
 * carried no <SAFETY_CONCERN> tag.
 */
function disclosureConcern(message) {
  const m = String(message || '');
  const kinds = [...new Set(ALERT_PATTERNS.filter(([, re]) => re.test(m)).map(([k]) => k))];
  return kinds.length ? `Possible ${kinds.join(' / ')} disclosure (detected from the student's message)` : null;
}

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


// ── Crisis line ──
// Owner decision 2026-10-17: a self-harm disclosure gets the 988 Suicide &
// Crisis Lifeline in the tutor's reply, every time. Deterministic, like the
// alert: the model can't be relied on to include it (it skipped the safety
// tag on 7 of 8 disclosures in the live eval).
const CRISIS_LINE = 'If you’re thinking about hurting yourself, you can call or text **988** (the Suicide & Crisis Lifeline) any time — it’s free, private, and someone will listen.';

/** True when the student's message reads as a self-harm disclosure. */
function isSelfHarmDisclosure(message) {
  return /\bself-harm\b/.test(disclosureConcern(message) || '');
}

/** The reply with the crisis line appended once, when the message calls for it. */
function withCrisisLine(reply, studentMessage) {
  const text = String(reply || '');
  if (!isSelfHarmDisclosure(studentMessage) || /\b988\b/.test(text)) return text;
  return `${text.trim()}\n\n${CRISIS_LINE}`;
}

module.exports = { shouldCannedBlock, looksLikeDisclosure, disclosureConcern, isSelfHarmDisclosure, withCrisisLine, CRISIS_LINE, INAPPROPRIATE_PATTERNS };
