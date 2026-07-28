// models/webhookEvent.js — Stripe webhook event deduplication
//
// Stores processed Stripe event IDs to prevent duplicate processing.
// Stripe retries webhook delivery on timeout/error, so we must track
// which events have already been handled.

const mongoose = require('mongoose');

// `status` makes the marker two-phase. It used to be written BEFORE the event was
// applied, so a handler that threw left a marker behind claiming the event was
// handled: the 500 told Stripe to retry, and the retry hit the duplicate-key
// branch and skipped. A customer could pay and never be provisioned, with Stripe
// reporting the webhook as delivered. 'processing' is written on receipt and
// promoted to 'done' only after the handler succeeds.
const webhookEventSchema = new mongoose.Schema({
  stripeEventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String },
  status: { type: String, enum: ['processing', 'done'], default: 'processing', index: true },
  processedAt: { type: Date, default: Date.now }
});

// Auto-expire old records after 30 days (TTL index)
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', webhookEventSchema);
module.exports = WebhookEvent;
