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
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
