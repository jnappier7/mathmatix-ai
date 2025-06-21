// models/user.js (Corrected for MissingSchemaError and OverwriteModelError)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Assuming bcrypt is still used for password hashing

// --- CORRECTED LOGIC TO PREVENT OVERWRITE AND MISSING SCHEMA ERRORS ---
// Check if the 'User' model has already been compiled by checking mongoose.models cache directly.
// If it exists, export the existing model. This is the most robust way.
if (mongoose.models.User) {
  module.exports = mongoose.model('User');
  return; // Exit here, preventing schema redefinition and recompilation
}
// --- END CORRECTED LOGIC ---


const messageSchema = new mongoose.Schema({
  role: String,
  content: String
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  messages: [messageSchema],
  summary: String,
  activeMinutes: { type: Number, default: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  passwordHash: { type: String },
  gradeLevel: { type: String },
  email: { type: String, unique: true, sparse: true },
  googleId: { type: String },
  microsoftId: { type: String },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  name: { type: String, required: false },
  mathCourse: { type: String },
  tonePreference: { type: String },
  learningStyle: { type: String },
  interests: [String],
  createdAt: { type: Date, default: Date.now },
  conversations: [sessionSchema],
  lastLogin: { type: Date, default: Date.now },

  role: { type: String, default: "student" },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Can be used as parentId for student accounts

  avatar: {
    skin: { type: String, default: 'default' },
    hair: { type: String, default: 'default' },
    top: { type: String, default: 'default' },
    bottom: { type: String, default: 'default' },
    accessory: { type: String, default: 'none' }
  },
  selectedTutorId: { type: String, default: null },

  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  totalActiveTutoringMinutes: { type: Number, default: 0 },
  weeklyActiveTutoringMinutes: { type: Number, default: 0 },
  lastWeeklyReset: { type: Date, default: Date.now },

  needsProfileCompletion: { type: Boolean, default: false },

  reportFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' },
  goalViewPreference: { type: String, enum: ['progress', 'gaps', 'goals'], default: 'progress' },
  parentTone: { type: String, enum: ['casual', 'friendly', 'direct', 'formal'], default: 'friendly' },
  parentLanguage: { type: String, default: 'English' },

  parentToChildInviteCode: {
    code: { type: String, unique: true, sparse: true },
    expiresAt: { type: Date },
    childLinked: { type: Boolean, default: false }
  },
  studentToParentLinkCode: {
    code: { type: String, unique: true, sparse: true },
    parentLinked: { type: Boolean, default: false }
  },

  children: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  iepPlan: {
    extendedTime: { type: Boolean, default: false },
    simplifiedInstructions: { type: Boolean, default: false },
    frequentCheckIns: { type: Boolean, default: false },
    visualSupport: { type: Boolean, default: false },
    chunking: { type: Boolean, default: false },
    reducedDistraction: { type: Boolean, default: false },
    readingLevel: { type: Number, default: null },
    mathAnxiety: { type: Boolean, default: false },
    preferredScaffolds: [{ type: String }],
    goals: [{
      description: { type: String, required: true },
      targetDate: { type: Date },
      currentProgress: { type: Number, default: 0 },
      measurementMethod: { type: String },
      status: { type: String, default: "active" },
      historicalProgress: [{
        date: { type: Date, default: Date.now },
        value: { type: Number }
      }]
    }]
  }
});

// Pre-save hook for password hashing (if applicable, ensure bcrypt is required)
userSchema.pre('save', async function(next) {
    if (this.isModified('passwordHash') && this.passwordHash) {
        try {
            const salt = await bcrypt.genSalt(10);
            this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
            next();
        } catch (error) {
            next(error);
        }
    } else {
        next();
    }
});


// Compile and export the model if it hasn't been already.
// The `if` block at the top ensures this line is only reached once.
const User = mongoose.model('User', userSchema);
module.exports = User;