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

module.exports = {
  TRIAL_DAYS,
  isInTrial,
  trialDaysRemaining,
  grantTrial,
};
