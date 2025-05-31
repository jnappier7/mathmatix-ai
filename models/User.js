// models/User.js
const mongoose = require('mongoose');

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
  name: { type: String, required: false }, // Can be derived from firstName/lastName but kept for compatibility
  mathCourse: { type: String },
  tonePreference: { type: String },
  learningStyle: { type: String },
  interests: [String],
  createdAt: { type: Date, default: Date.now },
  conversations: [sessionSchema],
  lastLogin: { type: Date, default: Date.now }, // Added lastLogin field

  role: { type: String, default: "student" },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // --- NEW GAMIFICATION FIELDS ---
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  totalActiveTutoringMinutes: { type: Number, default: 0 },
  weeklyActiveTutoringMinutes: { type: Number, default: 0 },
  lastWeeklyReset: { type: Date, default: Date.now },
  // --- END NEW GAMIFICATION FIELDS ---

  // --- NEW FIELD FOR PROFILE COMPLETION ---
  needsProfileCompletion: { type: Boolean, default: false }, // Tracks if a new OAuth user needs to complete their profile
  // --- END NEW FIELD ---

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

module.exports = mongoose.model('User', userSchema);