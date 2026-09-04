// models/conversionEvent.js — Funnel / conversion telemetry
//
// Lightweight, append-only event log for the consumer funnel. It exists to answer
// one question the revenue number cannot: WHERE people stop. The stages are
// preview -> signup -> trial -> subscribed, plus the two walls
// (preview_completed, free_quota_exhausted) where a decision is actually asked
// for.
//
// Rows are written fire-and-forget (never block a request) and are ALSO emitted
// to Winston -> Better Stack, so the data is queryable from Mongo AND visible in
// log dashboards immediately. Deliberately minimal PII: we keep an optional
// userId (for signed-in events) and an anonymized session id (for trial events)
// so distinct users can be de-duped in analysis without storing names/IPs.

const mongoose = require('mongoose');

// The consumer funnel, in order. Named for the PREVIEW -> TRIAL -> FREE ladder
// (see middleware/usageGate.js) so a row's stage is readable without a lookup.
//
// This enum is ENFORCED by mongoose, and recordConversionEvent deliberately
// swallows write failures so telemetry can never break tutoring. The two
// together mean an event fired but not listed here is lost in total silence: it
// reaches Winston/Better Stack and never lands a queryable row. Add the name
// here first, always.
const CONVERSION_EVENTS = [
  // -- Preview (anonymous, no account) --
  'preview_started',       // visitor got their first tutor reply on the landing page
  'preview_completed',     // preview reached MAX_TURNS — the wall, and the ask
  // -- Signup --
  'signup_started',        // account created (context: role, carriedPreview)
  // -- Trial (14 days, no card) --
  'trial_started',         // trial granted at signup (context: trialDays)
  'trial_activated',       // did meaningful tutoring inside the trial (NOT YET EMITTED)
  'trial_returned',        // came back on a later day inside the trial (NOT YET EMITTED)
  // -- Conversion --
  'upgrade_started',       // Stripe checkout session created (context: pack)
  'subscribed',            // checkout completed, subscription active (context: pack)
  // -- Free (post-trial) --
  'free_quota_exhausted',  // signed-in free student hit the monthly AI cap (402)
  // -- Legacy / other surfaces --
  // Superseded by preview_completed. Retained so historical rows still validate
  // and so a funnel query can union the two across the rename boundary.
  'trial_exhausted',
  'quiz_vote',             // anonymous pop-quiz vote (context: quizId, answer, correct)
  'campaign_scan',         // tracked print/QR link hit (/go/:campaign — context: campaign)
];

const conversionEventSchema = new mongoose.Schema({
  event: { type: String, required: true, enum: CONVERSION_EVENTS, index: true },
  // Present for authenticated events; absent for anonymous trial events.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // Anonymized session identifier for anonymous events (never an IP or name).
  sessionKey: { type: String, default: null },
  // Free-form, non-PII context (e.g. { tier, inCourse, tutorId, daysUntilReset }).
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Primary analysis access pattern: "events of type X over a time window."
conversionEventSchema.index({ event: 1, createdAt: -1 });

const ConversionEvent = mongoose.models.ConversionEvent
  || mongoose.model('ConversionEvent', conversionEventSchema);

module.exports = ConversionEvent;
module.exports.CONVERSION_EVENTS = CONVERSION_EVENTS;
