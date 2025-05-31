const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// POST /signup
router.post('/', async (req, res) => {
  // --- MODIFIED DESTRUCTURING HERE ---
  const { username, password, firstName, lastName, email, gradeLevel, mathCourse, learningStyle, tonePreference, interests } = req.body;
  // --- END MODIFIED DESTRUCTURING ---

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already taken.' });

    // Optional: Check if email is already registered
    const existingEmailUser = await User.findOne({ email });
    if (existingEmailUser) return res.status(400).json({ message: 'Email already registered.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      passwordHash,
      // --- MODIFIED FIELDS HERE ---
      firstName,
      lastName,
      name: `${firstName} ${lastName}`, // Combine for 'name' field if still used elsewhere
      email, // Save email
      // --- END MODIFIED FIELDS ---
      gradeLevel,
      mathCourse,
      learningStyle,
      tonePreference,
      interests
    });

    await newUser.save();

    res.status(201).json({ message: 'Account created successfully!' });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ message: 'Error signing up.' });
  }
});

module.exports = router;