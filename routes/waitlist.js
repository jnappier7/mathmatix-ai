const express = require('express');
const router = express.Router();
const Waitlist = require('../models/waitlist');

// POST /api/waitlist — add an email to the pre-launch waitlist
router.post('/', async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const existing = await Waitlist.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(200).json({ success: true, message: "You're already on the list! We'll be in touch." });
    }

    await Waitlist.create({
      email: email.toLowerCase().trim(),
      role: ['student', 'parent', 'teacher'].includes(role) ? role : 'other'
    });

    res.status(201).json({ success: true, message: "You're on the list! We'll notify you on launch day." });
  } catch (err) {
    console.error('ERROR: Waitlist signup failed:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
