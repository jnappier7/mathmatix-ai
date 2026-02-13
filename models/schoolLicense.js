// models/schoolLicense.js — School/district license for unlimited student access
//
// Option D pricing model:
//   - Teachers: always free (drives adoption)
//   - Students: 20 min/week free tier
//   - School license: unlocks unlimited access for all students under licensed teachers
//
// Tiers (annual):
//   small    — up to 500 students   — $2,500/year
//   medium   — up to 2,000 students — $7,500/year
//   large    — up to 5,000 students — $15,000/year
//   district — unlimited students   — custom pricing

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schoolLicenseSchema = new Schema({
  // School/district identity
  schoolName:   { type: String, required: true, trim: true },
  districtName: { type: String, trim: true },
  districtId:   { type: String, trim: true },  // Clever district ID (if SSO-linked)
  schoolId:     { type: String, trim: true },   // Clever school ID (if SSO-linked)

  // License tier and limits
  tier: {
    type: String,
    enum: ['small', 'medium', 'large', 'district'],
    required: true
  },
  maxStudents: { type: Number, required: true },  // Based on tier
  currentStudentCount: { type: Number, default: 0 },

  // License status
  status: {
    type: String,
    enum: ['active', 'trial', 'expired', 'cancelled'],
    default: 'active'
  },
  startsAt:  { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },

  // Annual price in cents (for record-keeping; Stripe handles actual billing)
  annualPriceCents: { type: Number },

  // Stripe billing
  stripeCustomerId:     { type: String },
  stripeSubscriptionId: { type: String },

  // Admin who manages this license (school admin or district admin)
  adminUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  adminEmail:  { type: String, trim: true, lowercase: true },

  // Teachers covered by this license
  teacherIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  // Contact info
  contactName:  { type: String, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true },
  contactPhone: { type: String, trim: true },

  // Notes (internal use)
  notes: { type: String, trim: true }
}, { timestamps: true });

// Indexes for fast lookup
schoolLicenseSchema.index({ status: 1, expiresAt: 1 });
schoolLicenseSchema.index({ teacherIds: 1 });
schoolLicenseSchema.index({ districtId: 1 });
schoolLicenseSchema.index({ schoolId: 1 });

/**
 * Check if this license is currently valid (active/trial and not expired).
 */
schoolLicenseSchema.methods.isValid = function () {
  if (this.status !== 'active' && this.status !== 'trial') return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
};

/**
 * Check if the license can accept more students.
 */
schoolLicenseSchema.methods.hasCapacity = function () {
  return this.currentStudentCount < this.maxStudents;
};

// Tier configuration (used by admin routes)
schoolLicenseSchema.statics.TIERS = {
  small:    { label: 'Small School (up to 500)',       maxStudents: 500,   annualPriceCents: 250000 },
  medium:   { label: 'Medium School (up to 2,000)',    maxStudents: 2000,  annualPriceCents: 750000 },
  large:    { label: 'Large School (up to 5,000)',     maxStudents: 5000,  annualPriceCents: 1500000 },
  district: { label: 'District (unlimited)',           maxStudents: 999999, annualPriceCents: null }  // Custom pricing
};

const SchoolLicense = mongoose.models.SchoolLicense || mongoose.model('SchoolLicense', schoolLicenseSchema);
module.exports = SchoolLicense;
