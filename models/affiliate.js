// models/affiliate.js — Affiliate / Referral Program
//
// Social Snowball-style affiliate system:
//   - Affiliates get a unique coupon code
//   - New users who use the coupon get a discount on Mathmatix+
//   - Affiliates earn commission on each conversion
//
// Statuses: pending → approved → (active use) | rejected | suspended

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* ---------- CONVERSION TRACKING ---------- */
const conversionSchema = new Schema({
  userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: ['signup', 'subscription'], required: true },
  plan:         { type: String, default: 'unlimited' },
  amountCents:  { type: Number, default: 0 },          // Amount the customer paid
  discountCents:{ type: Number, default: 0 },          // Discount applied via coupon
  commissionCents: { type: Number, default: 0 },       // Commission earned by affiliate
  commissionRate:  { type: Number },                    // Rate at time of conversion (0-1)
  stripeSessionId: { type: String },                    // Stripe checkout session ID
  convertedAt:  { type: Date, default: Date.now }
}, { _id: true });

/* ---------- PAYOUT RECORD ---------- */
const payoutSchema = new Schema({
  amountCents:  { type: Number, required: true },
  method:       { type: String, enum: ['paypal', 'bank_transfer', 'store_credit', 'other'], default: 'paypal' },
  reference:    { type: String },                       // PayPal transaction ID, etc.
  note:         { type: String },
  paidAt:       { type: Date, default: Date.now },
  paidBy:       { type: Schema.Types.ObjectId, ref: 'User' }  // Admin who processed it
}, { _id: true });

/* ---------- MAIN AFFILIATE SCHEMA ---------- */
const affiliateSchema = new Schema({
  // Link to user account (affiliate must have a Mathmatix account)
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // Unique coupon code (e.g., "STEPHANIE20", "HOMESCHOOL10")
  couponCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9_-]{3,30}$/, 'Coupon code must be 3-30 characters: letters, numbers, hyphens, underscores']
  },

  // Affiliate status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },

  // Commission settings
  commissionRate: { type: Number, default: 0.20, min: 0, max: 1 },  // 20% default
  discountPercent: { type: Number, default: 10, min: 0, max: 100 },  // 10% off for referred users

  // Profile info (for the affiliate's public page / admin review)
  displayName:  { type: String, trim: true },
  bio:          { type: String, trim: true, maxlength: 500 },
  website:      { type: String, trim: true },
  audience:     { type: String, trim: true, maxlength: 300 },  // Describe their audience
  paypalEmail:  { type: String, trim: true },

  // Stats (denormalized for fast reads)
  stats: {
    totalClicks:       { type: Number, default: 0 },
    totalSignups:      { type: Number, default: 0 },
    totalSubscriptions:{ type: Number, default: 0 },
    totalRevenueCents: { type: Number, default: 0 },
    totalCommissionCents:    { type: Number, default: 0 },
    unpaidCommissionCents:   { type: Number, default: 0 },
    totalPayoutCents:        { type: Number, default: 0 }
  },

  // Detailed records
  conversions: [conversionSchema],
  payouts:     [payoutSchema],

  // Admin notes
  adminNotes: { type: String, trim: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  approvedAt: { type: Date },

  // Timestamps
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes for fast lookups
affiliateSchema.index({ couponCode: 1 });
affiliateSchema.index({ userId: 1 });
affiliateSchema.index({ status: 1 });

module.exports = mongoose.models.Affiliate || mongoose.model('Affiliate', affiliateSchema);
