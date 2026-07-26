/**
 * learningCards.js — deterministic AHA + Reminder capture (spec §7.2–7.3).
 *
 * The notebook must fill itself from real signals, not another LLM call:
 *
 *   • AHA (spec §7.2): the student was struggling on a problem (a failed
 *     attempt or a diagnosed misconception), then got it right ON a turn
 *     whose own message carries realization language ("ohh I get it",
 *     "that makes sense", "wait so…"). All three at once is a strong
 *     signal; anything less and we save nothing — the spec says ask when
 *     confidence is low, and until the tutor can ask, skipping beats
 *     polluting the notebook with false epiphanies.
 *
 *   • Reminder (spec §7.3): the SAME diagnosed misconception recurring for
 *     a student. One card per misconception, upserted — the second
 *     occurrence activates it ("Watch for This"), later ones bump its
 *     count. Supportive framing, never punitive.
 *
 * Detection here is pure; the persist stage owns the database writes.
 */
'use strict';

// Realization language. Deliberately explicit phrases — a bare "ok" or
// "yes" must not mint an AHA card.
const REALIZATION_RX = new RegExp(
  [
    '\\boh+h*\\b[!.\\s]*(?:i\\s+(?:get|see)|now|that)',   // "ohh I get it", "oh now…", "oh that's…"
    '\\bi\\s+(?:get|got)\\s+it\\b',
    '\\bi\\s+see\\s+(?:it|now|why|what)\\b',
    '\\bthat\\s+makes\\s+sense\\b',
    '\\bmakes\\s+so\\s+much\\s+sense\\b',
    '\\bi\\s+understand\\s+(?:it\\s+)?now\\b',
    '\\bnow\\s+i\\s+(?:get|see|understand)\\b',
    '\\bwait[,!\\s]+so\\b',
    '\\bso\\s+that\'?s\\s+(?:why|how)\\b',
  ].join('|'),
  'i'
);

/**
 * Should this turn mint an AHA card?
 *
 * @param {object} signals
 * @param {string}  signals.message - the student's message this turn
 * @param {boolean} signals.wasCorrect - verified-correct answer this turn
 * @param {object|null} signals.priorProblemState - conversation.lastProblemState
 *   BEFORE this turn's update ({attemptCount, misconception, problemText})
 * @returns {{isAha: boolean, quote: string|null}}
 */
function detectAha(signals) {
  const s = signals || {};
  const msg = String(s.message == null ? '' : s.message).trim();
  if (!msg || s.wasCorrect !== true) return { isAha: false, quote: null };

  const prior = s.priorProblemState;
  const struggled = !!(prior && ((prior.attemptCount || 0) >= 1 || prior.misconception));
  if (!struggled) return { isAha: false, quote: null };

  if (!REALIZATION_RX.test(msg)) return { isAha: false, quote: null };
  return { isAha: true, quote: msg.slice(0, 400) };
}

/** Stable per-misconception dedupe key ("losing-a-negative-sign"). */
function reminderKey(misconceptionName) {
  const k = String(misconceptionName == null ? '' : misconceptionName)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return k || null;
}

/** Student-facing reminder content — supportive, never punitive (§7.3). */
function shapeReminder(misconception) {
  const m = misconception || {};
  const name = String(m.name || 'this step').trim();
  return {
    title: ('Watch for This: ' + name).slice(0, 160),
    body: [
      m.description ? String(m.description).trim() : '',
      m.fix ? ('Next time: ' + String(m.fix).trim()) : '',
    ].filter(Boolean).join('\n').slice(0, 2000) || 'You’ve hit this snag more than once — slow down here next time.',
  };
}

/** AHA card content — the student's own words lead (§7.2). */
function shapeAha(quote, skillId) {
  const label = skillId
    ? String(skillId).replace(/[-_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
    : null;
  return {
    title: (label ? ('AHA! ' + label) : 'AHA! It clicked').slice(0, 160),
    body: '“' + String(quote || '').trim() + '”',
  };
}

/** Compact client shape — what rides the chat response for the celebration. */
function toClientCard(doc) {
  return {
    type: doc.type,
    title: doc.title,
    // Only reminders past their activation threshold surface to the client;
    // seenCount lets the UI say "3rd time" if it wants to.
    seenCount: doc.seenCount || 1,
  };
}

// A reminder only surfaces once the mistake has RECURRED — the first
// occurrence is just learning, the second is a pattern (spec: "recurring
// mistakes"). The card exists from occurrence one so the count is honest.
const REMINDER_ACTIVATION_COUNT = 2;

module.exports = {
  detectAha,
  reminderKey,
  shapeReminder,
  shapeAha,
  toClientCard,
  REMINDER_ACTIVATION_COUNT,
  REALIZATION_RX,
};
