// utils/trialGrant.js — the ONE place the Mathmatix+ free trial is defined.
//
// Two trials exist, and they are granted by completely different machinery:
//
//   1. NO-CARD trial (the default). Granted at signup, in code, with no Stripe
//      object of any kind. This is the trial the funnel is built on: a visitor
//      previews the tutor anonymously, hits the wall, creates an account, and
//      gets 14 days of full access without ever being asked for a card.
//   2. CARD-REQUIRED trial (routes/billing.js TRIAL_DAYS). Stripe-managed via
//      `trial_period_days`; its webhooks set subscriptionTier='unlimited' for
//      the duration, so it has never needed a gate check of its own.
//
// That second fact is the trap this module exists to close. Because the card
// trial rides on subscriptionTier, `hasUnmeteredAiAccess` never learned to read
// `trialEndsAt` — so a no-card trial would set the field, tell the user they had
// 14 days, and grant them nothing. No error, no log: they would simply be
// metered against the free quota from their first turn. The gate must consult
// isInTrial(), which is why the read helper and the grant live together here.
//
// Both trials write the same two user fields (trialEndsAt / hasUsedTrial), so
// `hasUsedTrial` is shared: once signup burns it, routes/billing.js `wantsTrial`
// resolves false and a later checkout is simply a normal paid subscription.
// That is intended — nobody should get a second trial by taking the long way
// round — but it does mean the card trial is effectively unreachable for anyone
// who signed up through the funnel. Deliberate: one trial per person, granted at
// the earliest moment they could want it.

// Length of the no-card trial granted at signup.
//
// Fourteen rather than seven because of how this product demonstrates value: a
// math tutor proves itself on homework nights and before a test, and a 7-day
// window can easily contain neither (sign up on a Friday of a long weekend and
// it is gone). Fourteen days spans two homework cycles and most of a quiz cycle.
const TRIAL_DAYS = 14;

// How many genuine tutoring turns count as "they actually used it".
//
// The funnel's whole reason for wanting this event is to separate two failures
// that look identical in the conversion number and have OPPOSITE fixes: a
// trialist who never really used the product, and one who used it and did not
// think it was worth $9.95. Without the split, a weak trial month is
// uninterpretable.
//
// Five turns is one problem worked through plus a little — the same turn unit
// the meter bills in (utils/pipeline/persist.js charges every genuine turn a
// 30s floor), and the threshold is crossed by a student who brought real work,
// not by one who said hello and left. Only BILLED turns are counted, so the
// definition of "genuine" is the meter's, not a second one invented here.
const TRIAL_ACTIVATION_TURNS = 5;

/** UTC day key (YYYY-MM-DD). UTC, not local: the server runs on it, it is
 *  deterministic to test, and "which calendar day" only has to be consistent —
 *  a returning student is one who came back on a different day, and no timezone
 *  choice changes that for anyone but the midnight-hour edge case. */
function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * True when this user is inside an unexpired free trial.
 *
 * Pure read — takes an already-hydrated user doc (mongoose or lean) and does no
 * I/O, so gates can call it on req.user without another query.
 *
 * @param {Object} user - req.user / hydrated user doc
 * @param {Date} [now]
 * @returns {boolean}
 */
function isInTrial(user, now = new Date()) {
  if (!user || !user.trialEndsAt) return false;
  return new Date(user.trialEndsAt) > now;
}

/**
 * Seconds... days, rather, remaining in the trial — 0 once it has lapsed.
 * Used for the "N days left" surfaces so they can never disagree with the gate.
 *
 * @param {Object} user
 * @param {Date} [now]
 * @returns {number} whole days remaining, rounded up; 0 when not trialing
 */
function trialDaysRemaining(user, now = new Date()) {
  if (!isInTrial(user, now)) return 0;
  const ms = new Date(user.trialEndsAt) - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Stamp the no-card trial onto a user document. Mutates, does NOT save — the
 * caller is mid-construction (signup) or already saving for other reasons, and
 * an extra write here would race with theirs.
 *
 * Refuses to re-grant: one trial per account, whichever path granted the first.
 *
 * @param {Object} user - a mongoose doc or a plain object being built into one
 * @param {Date} [now]
 * @returns {boolean} true when a trial was granted, false when one was already used
 */
function grantTrial(user, now = new Date()) {
  if (!user || user.hasUsedTrial) return false;
  user.trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  user.hasUsedTrial = true;
  return true;
}

/**
 * Record one genuine tutoring turn against the trial, and report which funnel
 * events that turn earned.
 *
 * Mutates the user's trial counters and does NOT save — like grantTrial, the
 * caller is already writing the doc for other reasons and a second write here
 * would race with theirs.
 *
 * IDEMPOTENCE IS THE POINT. Both events describe a threshold being crossed, and
 * a turn-rate event would drown the table it lives in:
 *   - trial_activated fires on the turn where trialTurns EQUALS the threshold,
 *     so it fires exactly once per trial and never again.
 *   - trial_returned fires only when a day key is appended that was not already
 *     in the list, and only when that leaves more than one day — the first day
 *     of a trial is arriving, not returning.
 * That is also why the counters live on the user doc rather than being derived
 * by querying ConversionEvent: this runs on every tutoring turn, and a read
 * there would put a query in the hot path to answer a question one integer
 * already answers.
 *
 * @param {Object} user - hydrated user doc (mutated)
 * @param {Date} [now]
 * @returns {Array<{event: string, context: Object}>} events to record; empty
 *          when the user is not trialing or the turn crossed no threshold
 */
function recordTrialActivity(user, now = new Date()) {
  const events = [];
  if (!user || !isInTrial(user, now)) return events;

  const daysLeft = trialDaysRemaining(user, now);

  // ── Depth: did they use it enough to have an opinion? ──
  user.trialTurns = (Number(user.trialTurns) || 0) + 1;
  if (user.trialTurns === TRIAL_ACTIVATION_TURNS) {
    events.push({
      event: 'trial_activated',
      context: { turns: user.trialTurns, trialDaysRemaining: daysLeft },
    });
  }

  // ── Breadth: did they come back? ──
  // Reassigned rather than push()ed so the change is tracked without a
  // markModified call at the persist site.
  const today = dayKey(now);
  const seen = Array.isArray(user.trialActiveDays) ? user.trialActiveDays.map(String) : [];
  if (!seen.includes(today)) {
    // Capped defensively: a 14-day trial cannot produce more keys than this,
    // but a re-grant or clock skew must not grow the array without bound.
    const days = seen.concat(today).slice(-(TRIAL_DAYS + 1));
    user.trialActiveDays = days;
    if (days.length > 1) {
      events.push({
        event: 'trial_returned',
        context: { activeDays: days.length, trialDaysRemaining: daysLeft },
      });
    }
  }

  return events;
}

module.exports = {
  TRIAL_DAYS,
  TRIAL_ACTIVATION_TURNS,
  dayKey,
  isInTrial,
  trialDaysRemaining,
  grantTrial,
  recordTrialActivity,
};
