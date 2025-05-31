const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// POST /signup
router.post('/', async (req, res) => {
  const { username, password, firstName, lastName, email, gradeLevel, mathCourse, learningStyle, tonePreference, interests } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already taken.' });

    const existingEmailUser = await User.findOne({ email });
    if (existingEmailUser) return res.status(400).json({ message: 'Email already registered.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      username: username.toLowerCase(), // Store username in lowercase
      passwordHash,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`, // Combine for 'name' field if still used elsewhere
      email: email.toLowerCase(), // Save email in lowercase
      gradeLevel,
      mathCourse,
      learningStyle,
      tonePreference,
      interests,
      // For new direct signups, profile is considered complete initially
      needsProfileCompletion: false // Assuming the signup form collects all necessary info
    });

    await newUser.save();

    res.status(201).json({ message: 'Account created successfully!' });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ message: 'Error signing up.' });
  }
});

module.exports = router;