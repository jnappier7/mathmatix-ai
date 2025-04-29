const mongoose = require('mongoose');

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
  lastLogin: { type: Date }
});

module.exports = mongoose.model('User', UserSchema);
