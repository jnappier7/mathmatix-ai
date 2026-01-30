// models/enrollmentCode.js
// Enrollment codes for teacher-managed class rosters
// Students can use these codes to self-enroll or be bulk-imported

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

const enrollmentCodeSchema = new Schema({
  // The code itself (e.g., "MATH-7A-2024" or auto-generated)
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },

  // Teacher who owns this enrollment code
  teacherId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Optional class/section name for organization
  className: {
    type: String,
    trim: true,
    default: 'My Class'
  },

  // Optional description
  description: {
    type: String,
    trim: true
  },

  // Grade level for the class (helps with defaults)
  gradeLevel: {
    type: String,
    trim: true
  },

  // Math course for the class (helps with defaults)
  mathCourse: {
    type: String,
    trim: true
  },

  // Code status
  isActive: {
    type: Boolean,
    default: true
  },

  // Expiration date (optional - null means no expiration)
  expiresAt: {
    type: Date,
    default: null
  },

  // Maximum number of students who can use this code (null = unlimited)
  maxUses: {
    type: Number,
    default: null,
    min: 1
  },

  // Track how many times the code has been used
  useCount: {
    type: Number,
    default: 0,
    min: 0
  },

  // Students who have enrolled using this code
  enrolledStudents: [{
    studentId: { type: Schema.Types.ObjectId, ref: 'User' },
    enrolledAt: { type: Date, default: Date.now },
    enrollmentMethod: { type: String, enum: ['self-signup', 'csv-import', 'admin-created'], default: 'self-signup' }
  }],

  // Audit trail
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook to update timestamps
enrollmentCodeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to generate a unique code
enrollmentCodeSchema.statics.generateUniqueCode = async function(prefix = '') {
  let code;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    // Generate a random 6-character alphanumeric code
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    code = prefix ? `${prefix.toUpperCase()}-${randomPart}` : randomPart;

    // Check if it exists
    const existing = await this.findOne({ code });
    exists = !!existing;
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique enrollment code');
  }

  return code;
};

// Instance method to check if code is valid for use
enrollmentCodeSchema.methods.isValidForUse = function() {
  // Check if active
  if (!this.isActive) {
    return { valid: false, reason: 'This enrollment code is no longer active.' };
  }

  // Check expiration
  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, reason: 'This enrollment code has expired.' };
  }

  // Check max uses
  if (this.maxUses !== null && this.useCount >= this.maxUses) {
    return { valid: false, reason: 'This enrollment code has reached its maximum number of uses.' };
  }

  return { valid: true };
};

// Instance method to enroll a student
enrollmentCodeSchema.methods.enrollStudent = async function(studentId, method = 'self-signup') {
  // Check if student is already enrolled
  const alreadyEnrolled = this.enrolledStudents.some(
    e => e.studentId.toString() === studentId.toString()
  );

  if (alreadyEnrolled) {
    return { success: false, reason: 'Student is already enrolled with this code.' };
  }

  // Add student to enrolled list
  this.enrolledStudents.push({
    studentId,
    enrolledAt: new Date(),
    enrollmentMethod: method
  });

  // Increment use count
  this.useCount += 1;

  await this.save();

  return { success: true };
};

const EnrollmentCode = mongoose.models.EnrollmentCode || mongoose.model('EnrollmentCode', enrollmentCodeSchema);
module.exports = EnrollmentCode;
