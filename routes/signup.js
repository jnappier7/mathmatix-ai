// JavaScript Documentconst express = require('express');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// POST /signup
router.post('/', async (req, res) => {
  const { username, password, name, gradeLevel, mathCourse, learningStyle, tonePreference, interests } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already taken.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      passwordHash,
      name,
      gradeLevel,
      mathCourse,
      learningStyle,
      tonePreference,
      interests
    });

    await newUser.save();

    res.status(201).json({ message: 'Student profile created successfully!' });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ message: 'Error signing up student.' });
  }
});

module.exports = router;
