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
  conversations: [sessionSchema] // ✅ new persistent summary memory
});

module.exports = mongoose.model('User', userSchema);
