// models/webhookEvent.js — Stripe webhook event deduplication
//
// Stores processed Stripe event IDs to prevent duplicate processing.
// Stripe retries webhook delivery on timeout/error, so we must track
// which events have already been handled.

const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  stripeEventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String },
  processedAt: { type: Date, default: Date.now }
});

// Auto-expire old records after 30 days (TTL index)
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', webhookEventSchema);
module.exports = WebhookEvent;
