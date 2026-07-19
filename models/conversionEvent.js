// models/conversionEvent.js — Funnel / conversion telemetry
//
// Lightweight, append-only event log for the freemium funnel. The two events
// that matter first are the "walls" a user hits:
//   - trial_exhausted     : an anonymous landing-page trial reached its turn cap
//   - free_quota_exhausted : a signed-in free student hit the 30-min/month 402
//
// Rows are written fire-and-forget (never block a request) and are ALSO emitted
// to Winston -> Better Stack, so the data is queryable from Mongo AND visible in
// log dashboards immediately. Deliberately minimal PII: we keep an optional
// userId (for signed-in events) and an anonymized session id (for trial events)
// so distinct users can be de-duped in analysis without storing names/IPs.

const mongoose = require('mongoose');

const CONVERSION_EVENTS = [
  'trial_exhausted',       // anonymous trial reached MAX_TURNS
  'free_quota_exhausted',  // signed-in free student hit the 30-min/month cap (402)
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
