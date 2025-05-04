const mongoose = require('mongoose');

// Store individual messages in conversations
const messageSchema = new mongoose.Schema({
  role: String, // 'user' or 'model'
  content: String
}, { _id: false });

// Store past sessions
const sessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  messages: [messageSchema],
  summary: String
}, { _id: false });

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  gradeLevel: { type: String, required: true },
  mathCourse: { type: String },
  learningStyle: { type: String },
  tonePreference: { type: String },
  interests: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },

  // 🧠 Added fields for memory
  conversations: [sessionSchema],
  lastSeen: Date
});

module.exports = mongoose.model('User', UserSchema);
