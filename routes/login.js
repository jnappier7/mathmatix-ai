const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

router.post('/', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid username or password.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid username or password.' });

   user.lastLogin = Date.now();
await user.save();

req.session.userId = user._id; // ✅ Required for auth-based routes

res.status(200).json({
  message: 'Login successful!',
  user: {
    _id: user._id,
    username: user.username,
    name: user.name,
    gradeLevel: user.gradeLevel,
    mathCourse: user.mathCourse,
    learningStyle: user.learningStyle,
    tonePreference: user.tonePreference,
    interests: user.interests
  }
});

    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Error logging in student.' });
  }
});

module.exports = router;
