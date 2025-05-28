const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: String,
  content: String
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  messages: [messageSchema],
  summary: String
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  passwordHash: { type: String },
  gradeLevel: { type: String },
  email: { type: String, unique: true, sparse: true },
  googleId: { type: String },
  microsoftId: { type: String },
  name: { type: String },
  mathCourse: { type: String },
  tonePreference: { type: String },
  learningStyle: { type: String },
  interests: [String],
  createdAt: { type: Date, default: Date.now },
  conversations: [sessionSchema], // ✅ persistent session summaries

  // 🔒 NEW FIELDS BELOW

  role: { type: String, default: "student" }, // "admin", "student", etc.

  iepPlan: {
    extendedTime: { type: Boolean, default: false },
    simplifiedInstructions: { type: Boolean, default: false },
    frequentCheckIns: { type: Boolean, default: false },
    visualSupport: { type: Boolean, default: false },
    chunking: { type: Boolean, default: false },
    reducedDistraction: { type: Boolean, default: false },
    readingLevel: { type: Number, default: null },
    mathAnxiety: { type: Boolean, default: false },
    preferredScaffolds: [{ type: String }]
  }
});

module.exports = mongoose.model('User', userSchema);
